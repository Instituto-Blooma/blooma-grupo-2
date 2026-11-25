/**
 * Seed da triagem — SÓ DADOS FICTÍCIOS.
 *
 * Nenhum nome, telefone ou resposta aqui pertence a uma pessoa real.
 * Telefones usam o padrão claramente falso +55 00 00000-00NN.
 *
 *   pnpm run seed:triagem        → apaga as pacientes fictícias e recria tudo
 *   (pnpm run dev:all chama `ensureTriagem`, que só cria se ainda não existir)
 *
 * TODO(equipe): ajustar a "Maria" para bater exatamente com o roteiro do pitch.
 */

import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { BUTTON, questionReply, reminderReply } from './lib/conversation';
import { NO_CHECKIN_RANK, PRIORITY_CONFIG, PRIORITY_RANK, triage } from './lib/priority';
import { QUESTIONNAIRE } from './lib/questionnaire';
import { MSG } from './lib/scripts';
import { normalizeEmail } from './lib/users';

/** Contas de demonstração que recebem o papel "psicologa". */
const DEMO_PSICOLOGAS = ['dev@example.com', 'testuser@gmail.com'];
const DEMO_PSICOLOGA_NAME = 'Psicóloga Demo';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Respostas na ordem do questionário: a1, a2, b1, b2, r1 (PROVISÓRIO). */
type Answers = [number, number, number, number, number];

type SeedPatient = {
  name: string;
  /** Check-ins do mais antigo para o mais recente: [quanto tempo atrás, respostas]. */
  checkins: Array<[number, Answers]>;
  consentAgo: number;
  assignToDemo?: boolean;
};

const PATIENTS: SeedPatient[] = [
  {
    // A paciente do roteiro: prioridade média, piorando aos poucos.
    name: 'Maria',
    consentAgo: 30 * DAY,
    checkins: [
      [21 * DAY, [1, 1, 1, 1, 0]],
      [14 * DAY, [1, 2, 2, 1, 0]],
      [7 * DAY, [2, 2, 2, 2, 0]],
      [3 * HOUR, [2, 1, 2, 2, 0]],
    ],
  },
  {
    // Sinal de risco no check-in mais recente.
    name: 'Joana',
    consentAgo: 20 * DAY,
    checkins: [
      [14 * DAY, [1, 1, 1, 1, 0]],
      [7 * DAY, [1, 2, 1, 2, 0]],
      [40 * 60 * 1000, [2, 2, 2, 1, 1]],
    ],
  },
  {
    name: 'Luíza',
    consentAgo: 25 * DAY,
    checkins: [
      [15 * DAY, [2, 2, 2, 2, 0]],
      [8 * DAY, [2, 3, 2, 2, 0]],
      [1 * DAY, [3, 3, 2, 3, 0]],
    ],
  },
  {
    name: 'Teresa',
    consentAgo: 40 * DAY,
    assignToDemo: true,
    checkins: [
      [17 * DAY, [3, 2, 3, 3, 0]],
      [10 * DAY, [3, 2, 3, 2, 0]],
      [3 * DAY, [3, 2, 3, 2, 0]],
    ],
  },
  {
    name: 'Cláudia',
    consentAgo: 18 * DAY,
    checkins: [
      [9 * DAY, [1, 1, 2, 1, 0]],
      [2 * DAY, [1, 2, 2, 1, 0]],
    ],
  },
  {
    name: 'Rita',
    consentAgo: 35 * DAY,
    checkins: [
      [22 * DAY, [1, 1, 1, 1, 0]],
      [15 * DAY, [1, 0, 1, 1, 0]],
      [8 * DAY, [0, 1, 1, 0, 0]],
      [1 * DAY, [0, 1, 1, 0, 0]],
    ],
  },
  {
    name: 'Helena',
    consentAgo: 12 * DAY,
    checkins: [[4 * DAY, [1, 0, 1, 1, 0]]],
  },
  {
    name: 'Sônia',
    consentAgo: 28 * DAY,
    assignToDemo: true,
    checkins: [
      [13 * DAY, [1, 1, 2, 2, 0]],
      [6 * DAY, [2, 1, 1, 2, 0]],
    ],
  },
  {
    // Aceitou o termo ontem, ainda não fez check-in.
    name: 'Beatriz',
    consentAgo: 1 * DAY,
    checkins: [],
  },
];

async function clearFictitious(ctx: MutationCtx) {
  const patients = await ctx.db
    .query('patients')
    .withIndex('by_fictitious', (q) => q.eq('fictitious', true))
    .take(500);
  for (const p of patients) {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_patientId_and_createdAt', (q) => q.eq('patientId', p._id))
      .take(2000);
    for (const row of messages) await ctx.db.delete(row._id);
    const checkins = await ctx.db
      .query('checkins')
      .withIndex('by_patientId_and_startedAt', (q) => q.eq('patientId', p._id))
      .take(500);
    for (const row of checkins) await ctx.db.delete(row._id);
    const audit = await ctx.db
      .query('auditLog')
      .withIndex('by_patientId_and_at', (q) => q.eq('patientId', p._id))
      .take(2000);
    for (const row of audit) await ctx.db.delete(row._id);
    await ctx.db.delete(p._id);
  }
}

async function ensureDemoPsicologas(ctx: MutationCtx): Promise<Id<'users'> | null> {
  let first: Id<'users'> | null = null;
  for (const email of DEMO_PSICOLOGAS) {
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
      .first();
    if (!user) continue;
    first ??= user._id;
    if (email === DEMO_PSICOLOGAS[0]) {
      await ctx.db.patch(user._id, { name: DEMO_PSICOLOGA_NAME });
    }
    const role = await ctx.db
      .query('staffRoles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first();
    if (!role) {
      await ctx.db.insert('staffRoles', { userId: user._id, role: 'psicologa', grantedAt: Date.now() });
    }
  }
  return first;
}

type Msg = {
  direction: 'entrada' | 'saida';
  origin: 'paciente' | 'bot' | 'lembrete' | 'crise';
  text: string;
  buttons?: { id: string; label: string }[];
  at: number;
};

function outMsg(reply: { origin: 'bot' | 'crise' | 'lembrete'; text: string; buttons?: Msg['buttons'] }, at: number): Msg {
  return { direction: 'saida', origin: reply.origin, text: reply.text, buttons: reply.buttons, at };
}
function inMsg(text: string, at: number): Msg {
  return { direction: 'entrada', origin: 'paciente', text, at };
}

async function createPatient(
  ctx: MutationCtx,
  spec: SeedPatient,
  index: number,
  now: number,
  demoUserId: Id<'users'> | null
) {
  const consentAt = now - spec.consentAgo;
  const patientId = await ctx.db.insert('patients', {
    displayName: spec.name,
    phone: `+55 00 00000-${String(index + 1).padStart(4, '0')}`,
    consentAcceptedAt: consentAt,
    conversation: { stage: 'ocioso' },
    priorityRank: NO_CHECKIN_RANK,
    hasRiskSignal: false,
    fictitious: true,
    ...(spec.assignToDemo && demoUserId
      ? { assignedTo: demoUserId, assignedAt: now - 2 * DAY }
      : {}),
  });

  const transcript: Msg[] = [
    inMsg('oi', consentAt - 120_000),
    outMsg({ origin: 'bot', text: MSG.boasVindas }, consentAt - 110_000),
    outMsg(
      {
        origin: 'bot',
        text: MSG.termo,
        buttons: [
          { id: BUTTON.consentAccept, label: 'Aceito' },
          { id: BUTTON.consentDecline, label: 'Não aceito' },
        ],
      },
      consentAt - 100_000
    ),
    inMsg('Aceito', consentAt),
    outMsg({ origin: 'bot', text: MSG.aceiteObrigada }, consentAt + 1000),
    outMsg({ origin: 'bot', text: MSG.pedirApelido }, consentAt + 2000),
    inMsg(spec.name, consentAt + 30_000),
    outMsg({ origin: 'bot', text: MSG.menu(spec.name) }, consentAt + 31_000),
  ];

  let last: ReturnType<typeof triage> | null = null;
  let lastAt: number | null = null;
  const facts = { consentAccepted: true, displayName: spec.name };

  for (const [ago, values] of spec.checkins) {
    const start = now - ago - 10 * 60 * 1000;
    let t = start;
    const step = () => (t += 15_000);
    transcript.push(outMsg(reminderReply(facts), start - 60 * 60 * 1000));
    transcript.push(inMsg('Começar check-in', step()));
    transcript.push(outMsg({ origin: 'bot', text: MSG.inicioCheckin }, step()));

    const answers = [];
    for (let i = 0; i < QUESTIONNAIRE.questions.length; i += 1) {
      const question = QUESTIONNAIRE.questions[i];
      const value = values[i];
      const option = question.options.find((o) => o.value === value);
      if (!option) throw new Error(`Seed inválido: ${spec.name} ${question.id}=${value}`);
      transcript.push(outMsg(questionReply(QUESTIONNAIRE, i), step()));
      const answeredAt = step();
      transcript.push(inMsg(option.label, answeredAt));
      const triggeredRisk = question.riskMinValue !== undefined && value >= question.riskMinValue;
      if (triggeredRisk) transcript.push(outMsg({ origin: 'crise', text: MSG.crise }, step()));
      answers.push({
        questionId: question.id,
        scaleId: question.scaleId,
        questionText: question.text,
        optionLabel: option.label,
        value,
        triggeredRisk,
        answeredAt,
      });
    }
    const completedAt = step();
    transcript.push(outMsg({ origin: 'bot', text: MSG.fimCheckin(spec.name) }, completedAt));

    const result = triage(
      answers.map((a) => ({ questionId: a.questionId, value: a.value })),
      QUESTIONNAIRE,
      PRIORITY_CONFIG
    );
    await ctx.db.insert('checkins', {
      patientId,
      status: 'concluido',
      startedAt: start,
      completedAt,
      answers,
      scaleScores: result.scaleScores,
      score: result.score,
      priority: result.level,
      riskSignal: result.hasRiskSignal,
      configVersion: PRIORITY_CONFIG.version,
    });
    last = result;
    lastAt = completedAt;
  }

  for (const m of transcript) {
    await ctx.db.insert('messages', {
      patientId,
      direction: m.direction,
      origin: m.origin,
      text: m.text,
      buttons: m.buttons,
      status: m.direction === 'entrada' ? 'recebida' : 'enviada',
      provider: m.direction === 'saida' ? 'simulado' : undefined,
      createdAt: m.at,
    });
  }

  if (last && lastAt) {
    await ctx.db.patch(patientId, {
      priority: last.level,
      priorityRank: PRIORITY_RANK[last.level],
      score: last.score,
      hasRiskSignal: last.hasRiskSignal,
      lastCheckinAt: lastAt,
      lastReminderAt: lastAt - 60 * 60 * 1000,
    });
  }
}

async function seedPatients(ctx: MutationCtx, demoUserId: Id<'users'> | null) {
  const now = Date.now();
  for (let i = 0; i < PATIENTS.length; i += 1) {
    await createPatient(ctx, PATIENTS[i], i, now, demoUserId);
  }
}

/** Apaga as pacientes fictícias e recria o cenário do pitch. */
export const triagem = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoUserId = await ensureDemoPsicologas(ctx);
    await clearFictitious(ctx);
    await seedPatients(ctx, demoUserId);
    return { patients: PATIENTS.length, psicologaDemo: demoUserId !== null };
  },
});

/** Usado pelo `dev:all`: garante o papel e só cria as pacientes se ainda não houver. */
export const ensureTriagem = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoUserId = await ensureDemoPsicologas(ctx);
    const existing = await ctx.db
      .query('patients')
      .withIndex('by_fictitious', (q) => q.eq('fictitious', true))
      .first();
    if (!existing) await seedPatients(ctx, demoUserId);
    return { created: !existing };
  },
});
