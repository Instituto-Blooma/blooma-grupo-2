/**
 * Liga a máquina de conversa (pura) ao banco.
 *
 * Simulador e WhatsApp chamam `processIncoming` do MESMO jeito:
 *   mensagem da paciente → máquina de estados → efeitos no banco → respostas
 *   na fila de saída → provedor entrega.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { handleIncoming, reminderReply, type Effect, type IncomingEvent } from './conversation';
import { queueOutgoing } from './outbox';
import { PRIORITY_CONFIG, PRIORITY_RANK, triage } from './priority';
import { QUESTIONNAIRE } from './questionnaire';

export type IncomingFromPatient =
  | { kind: 'text'; text: string }
  | { kind: 'button'; buttonId: string; label?: string };

async function buttonLabel(ctx: MutationCtx, patientId: Id<'patients'>, buttonId: string) {
  const recent = await ctx.db
    .query('messages')
    .withIndex('by_patientId_and_createdAt', (q) => q.eq('patientId', patientId))
    .order('desc')
    .take(20);
  for (const m of recent) {
    const found = m.buttons?.find((b) => b.id === buttonId);
    if (found) return found.label;
  }
  return buttonId;
}

export async function processIncoming(
  ctx: MutationCtx,
  patientId: Id<'patients'>,
  incoming: IncomingFromPatient
) {
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new Error('Paciente não encontrada');
  const now = Date.now();

  // 1. Registra o que a paciente mandou (a equipe vê no histórico).
  const shownText =
    incoming.kind === 'text'
      ? incoming.text
      : (incoming.label ?? (await buttonLabel(ctx, patientId, incoming.buttonId)));
  await ctx.db.insert('messages', {
    patientId,
    direction: 'entrada',
    origin: 'paciente',
    text: shownText,
    status: 'recebida',
    createdAt: now,
  });

  // 2. Máquina de estados (pura).
  const event: IncomingEvent =
    incoming.kind === 'text' ? incoming : { kind: 'button', buttonId: incoming.buttonId };
  const transition = handleIncoming(
    { stage: patient.conversation.stage, questionIndex: patient.conversation.questionIndex },
    event,
    { consentAccepted: patient.consentAcceptedAt !== undefined, displayName: patient.displayName },
    QUESTIONNAIRE
  );

  // 3. Efeitos no banco.
  let checkinId = patient.conversation.checkinId;
  for (const effect of transition.effects) {
    checkinId = await applyEffect(ctx, patient, effect, checkinId, now);
  }

  // 4. Novo estado da conversa.
  await ctx.db.patch(patientId, {
    conversation: {
      stage: transition.state.stage,
      questionIndex: transition.state.questionIndex,
      checkinId: transition.state.stage === 'em_checkin' ? checkinId : undefined,
    },
  });

  // 5. Respostas para a paciente.
  await queueOutgoing(ctx, patientId, transition.replies);
}

async function applyEffect(
  ctx: MutationCtx,
  patient: Doc<'patients'>,
  effect: Effect,
  checkinId: Id<'checkins'> | undefined,
  now: number
): Promise<Id<'checkins'> | undefined> {
  switch (effect.type) {
    case 'consent_accepted':
      await ctx.db.patch(patient._id, { consentAcceptedAt: now, consentDeclinedAt: undefined });
      return checkinId;

    case 'consent_declined':
      // TODO(equipe/jurídico): o que fazer com os dados de quem recusa?
      await ctx.db.patch(patient._id, { consentDeclinedAt: now });
      return checkinId;

    case 'set_display_name':
      await ctx.db.patch(patient._id, { displayName: effect.name });
      return checkinId;

    case 'checkin_started':
      return await ctx.db.insert('checkins', {
        patientId: patient._id,
        status: 'em_andamento',
        startedAt: now,
        answers: [],
        riskSignal: false,
      });

    case 'answer_recorded': {
      if (!checkinId) return checkinId;
      const checkin = await ctx.db.get(checkinId);
      const question = QUESTIONNAIRE.questions.find((q) => q.id === effect.questionId);
      if (!checkin || !question) return checkinId;
      const option = question.options.find((o) => o.value === effect.value);
      await ctx.db.patch(checkinId, {
        answers: [
          ...checkin.answers,
          {
            questionId: question.id,
            scaleId: question.scaleId,
            questionText: question.text,
            optionLabel: option?.label ?? String(effect.value),
            value: effect.value,
            triggeredRisk: effect.triggeredRisk,
            answeredAt: now,
          },
        ],
      });
      return checkinId;
    }

    case 'risk_signal':
      // A equipe é avisada: a paciente sobe na hora para o topo da fila com o selo.
      // TODO(equipe): definir aviso ativo além da fila (e-mail, push, plantão?).
      if (checkinId) await ctx.db.patch(checkinId, { riskSignal: true });
      await ctx.db.patch(patient._id, {
        hasRiskSignal: true,
        priority: 'alta',
        priorityRank: PRIORITY_RANK.alta,
        lastCheckinAt: now,
      });
      return checkinId;

    case 'checkin_completed': {
      if (!checkinId) return checkinId;
      const checkin = await ctx.db.get(checkinId);
      if (!checkin) return checkinId;
      const result = triage(
        checkin.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
        QUESTIONNAIRE,
        PRIORITY_CONFIG
      );
      await ctx.db.patch(checkinId, {
        status: 'concluido',
        completedAt: now,
        scaleScores: result.scaleScores,
        score: result.score,
        priority: result.level,
        riskSignal: result.hasRiskSignal,
        configVersion: PRIORITY_CONFIG.version,
      });
      await ctx.db.patch(patient._id, {
        priority: result.level,
        priorityRank: PRIORITY_RANK[result.level],
        score: result.score,
        lastCheckinAt: now,
        hasRiskSignal: result.hasRiskSignal,
      });
      return checkinId;
    }
  }
}

/** Envia o lembrete semanal para uma paciente (mesmo texto no simulador e no WhatsApp). */
export async function sendReminder(ctx: MutationCtx, patient: Doc<'patients'>) {
  await ctx.db.patch(patient._id, { lastReminderAt: Date.now() });
  await queueOutgoing(ctx, patient._id, [
    reminderReply({
      consentAccepted: patient.consentAcceptedAt !== undefined,
      displayName: patient.displayName,
    }),
  ]);
}

const SEIS_DIAS = 6 * 24 * 60 * 60 * 1000;

/** Regra do lembrete: aceitou o termo, não está no meio de um check-in e está há ~1 semana sem check-in/lembrete. */
export function isReminderDue(patient: Doc<'patients'>, now: number) {
  if (patient.consentAcceptedAt === undefined) return false;
  if (patient.conversation.stage !== 'ocioso') return false;
  if (patient.lastCheckinAt !== undefined && now - patient.lastCheckinAt < SEIS_DIAS) return false;
  if (patient.lastReminderAt !== undefined && now - patient.lastReminderAt < SEIS_DIAS) return false;
  return true;
}

/** Regra do cron semanal. `onlyFictitious` é usado pelo simulador. */
export async function runReminderRule(ctx: MutationCtx, options: { onlyFictitious: boolean }) {
  const now = Date.now();
  // TODO(escala): paginar quando houver mais de 1000 pacientes.
  const patients = options.onlyFictitious
    ? await ctx.db
        .query('patients')
        .withIndex('by_fictitious', (q) => q.eq('fictitious', true))
        .take(1000)
    : await ctx.db.query('patients').take(1000);
  let marked = 0;
  for (const patient of patients) {
    if (!isReminderDue(patient, now)) continue;
    await sendReminder(ctx, patient);
    marked += 1;
  }
  return { marked };
}
