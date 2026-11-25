/**
 * Simulador do WhatsApp (tela de teste).
 *
 * Faz o papel da paciente usando a MESMA lógica de conversa que o WhatsApp vai
 * usar (lib/conversationRunner.ts → lib/conversation.ts). Só funciona com
 * pacientes fictícias, só para quem tem o papel "psicologa", e pode ser
 * desligado no servidor com SIMULADOR_DESLIGADO=1.
 */

import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { patientLabel } from './lib/access';
import { processIncoming, runReminderRule, sendReminder } from './lib/conversationRunner';
import { NO_CHECKIN_RANK } from './lib/priority';
import { assertSimulatorEnabled, requirePsicologa } from './lib/staff';

async function requireFictitious(ctx: MutationCtx, patientId: Id<'patients'>) {
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new ConvexError('Paciente não encontrada.');
  if (!patient.fictitious) throw new ConvexError('O simulador só funciona com pacientes fictícias.');
  return patient;
}

export const patients = query({
  args: {},
  handler: async (ctx) => {
    await requirePsicologa(ctx);
    assertSimulatorEnabled();
    const rows = await ctx.db
      .query('patients')
      .withIndex('by_fictitious', (q) => q.eq('fictitious', true))
      .take(100);
    return rows.map((p) => ({
      _id: p._id,
      name: patientLabel(p),
      phone: p.phone, // fictício
      stage: p.conversation.stage,
      consentAccepted: p.consentAcceptedAt !== undefined,
    }));
  },
});

/** Cria uma paciente nova, fictícia, sem aceite — para testar o "oi" desde o começo. */
export const createPatient = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePsicologa(ctx);
    assertSimulatorEnabled();
    const existing = await ctx.db
      .query('patients')
      .withIndex('by_fictitious', (q) => q.eq('fictitious', true))
      .take(1000);
    const n = 100 + existing.length;
    return await ctx.db.insert('patients', {
      phone: `+55 00 00000-${String(n).padStart(4, '0')}`,
      conversation: { stage: 'novo' },
      priorityRank: NO_CHECKIN_RANK,
      hasRiskSignal: false,
      fictitious: true,
    });
  },
});

/** A "paciente" manda uma mensagem de texto ou toca num botão. */
export const sendAsPatient = mutation({
  args: {
    patientId: v.id('patients'),
    text: v.optional(v.string()),
    buttonId: v.optional(v.string()),
  },
  handler: async (ctx, { patientId, text, buttonId }) => {
    await requirePsicologa(ctx);
    assertSimulatorEnabled();
    await requireFictitious(ctx, patientId);
    if (buttonId) {
      await processIncoming(ctx, patientId, { kind: 'button', buttonId });
      return null;
    }
    const body = (text ?? '').trim();
    if (!body) throw new ConvexError('Escreva uma mensagem.');
    await processIncoming(ctx, patientId, { kind: 'text', text: body.slice(0, 2000) });
    return null;
  },
});

/** Dispara o lembrete semanal agora para esta paciente (para testar e tirar print). */
export const sendReminderNow = mutation({
  args: { patientId: v.id('patients') },
  handler: async (ctx, { patientId }) => {
    await requirePsicologa(ctx);
    assertSimulatorEnabled();
    const patient = await requireFictitious(ctx, patientId);
    if (patient.consentAcceptedAt === undefined) {
      throw new ConvexError('Esta paciente ainda não aceitou o termo, então não recebe lembrete.');
    }
    await sendReminder(ctx, patient);
    return null;
  },
});

/** Roda a mesma regra do cron semanal, só para pacientes fictícias. */
export const runWeeklyRule = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePsicologa(ctx);
    assertSimulatorEnabled();
    return await runReminderRule(ctx, { onlyFictitious: true });
  },
});
