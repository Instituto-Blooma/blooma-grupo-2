import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { patientLabel, requireLoggedAccess } from './lib/access';
import { NO_CHECKIN_RANK, PRIORITY_RANK } from './lib/priority';
import { QUESTIONNAIRE } from './lib/questionnaire';
import { requirePsicologa } from './lib/staff';

async function userName(ctx: QueryCtx, userId: Id<'users'> | undefined) {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user?.name ?? user?.email ?? 'Equipe';
}

const queueFilter = v.union(
  v.literal('todas'),
  v.literal('alta'),
  v.literal('media'),
  v.literal('baixa'),
  v.literal('sem_checkin')
);

/**
 * Fila por prioridade (como triagem de pronto-socorro): alta → média → baixa →
 * sem check-in; dentro de cada nível, o check-in mais recente primeiro.
 * Reativa: atualiza sozinha quando chega um check-in.
 */
export const queue = query({
  args: { filter: queueFilter, onlyRisk: v.boolean() },
  handler: async (ctx, { filter, onlyRisk }) => {
    const me = await requirePsicologa(ctx);
    const rank =
      filter === 'todas' ? null : filter === 'sem_checkin' ? NO_CHECKIN_RANK : PRIORITY_RANK[filter];
    // TODO(escala): paginar quando houver mais de 500 pacientes.
    const rows =
      rank === null
        ? await ctx.db.query('patients').withIndex('by_priorityRank').take(500)
        : await ctx.db
            .query('patients')
            .withIndex('by_priorityRank', (q) => q.eq('priorityRank', rank))
            .take(500);

    const visible = rows
      .filter((p) => p.consentAcceptedAt !== undefined)
      .filter((p) => !onlyRisk || p.hasRiskSignal)
      .sort(
        (a, b) =>
          a.priorityRank - b.priorityRank || (b.lastCheckinAt ?? 0) - (a.lastCheckinAt ?? 0)
      );

    return await Promise.all(
      visible.map(async (p) => ({
        _id: p._id,
        name: patientLabel(p),
        priority: p.priority ?? null,
        score: p.score ?? null,
        lastCheckinAt: p.lastCheckinAt ?? null,
        hasRiskSignal: p.hasRiskSignal,
        inCheckin: p.conversation.stage === 'em_checkin',
        assignedToName: await userName(ctx, p.assignedTo),
        assignedToMe: p.assignedTo === me,
        fictitious: p.fictitious,
      }))
    );
  },
});

/** Registra no log de auditoria que esta pessoa abriu a ficha (ou o simulador). */
export const open = mutation({
  args: {
    patientId: v.id('patients'),
    context: v.union(v.literal('ficha'), v.literal('simulador')),
  },
  handler: async (ctx, { patientId, context }) => {
    const userId = await requirePsicologa(ctx);
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new ConvexError('Paciente não encontrada.');
    if (context === 'simulador' && !patient.fictitious) {
      throw new ConvexError('O simulador só funciona com pacientes fictícias.');
    }
    return await ctx.db.insert('auditLog', {
      userId,
      patientId,
      action: context === 'ficha' ? 'abrir_ficha' : 'abrir_simulador',
      at: Date.now(),
    });
  },
});

function serializeCheckin(c: Doc<'checkins'>) {
  return {
    _id: c._id,
    status: c.status,
    startedAt: c.startedAt,
    completedAt: c.completedAt ?? null,
    score: c.score ?? null,
    priority: c.priority ?? null,
    riskSignal: c.riskSignal,
    scaleScores: c.scaleScores ?? [],
    answers: c.answers,
    configVersion: c.configVersion ?? null,
  };
}

/** Ficha da paciente. Exige um `accessId` (acesso já registrado na auditoria). */
export const ficha = query({
  args: { patientId: v.id('patients'), accessId: v.id('auditLog') },
  handler: async (ctx, { patientId, accessId }) => {
    const me = await requirePsicologa(ctx);
    const patient = await requireLoggedAccess(ctx, me, patientId, accessId);

    const checkins = await ctx.db
      .query('checkins')
      .withIndex('by_patientId_and_startedAt', (q) => q.eq('patientId', patientId))
      .order('desc')
      .take(52);

    const accesses = await ctx.db
      .query('auditLog')
      .withIndex('by_patientId_and_at', (q) => q.eq('patientId', patientId))
      .order('desc')
      .take(8);

    return {
      patient: {
        _id: patient._id,
        name: patientLabel(patient),
        priority: patient.priority ?? null,
        score: patient.score ?? null,
        hasRiskSignal: patient.hasRiskSignal,
        lastCheckinAt: patient.lastCheckinAt ?? null,
        consentAcceptedAt: patient.consentAcceptedAt ?? null,
        inCheckin: patient.conversation.stage === 'em_checkin',
        assignedToName: await userName(ctx, patient.assignedTo),
        assignedToMe: patient.assignedTo === me,
        assignedAt: patient.assignedAt ?? null,
        fictitious: patient.fictitious,
      },
      checkins: checkins.map(serializeCheckin),
      scales: QUESTIONNAIRE.scales,
      recentAccesses: await Promise.all(
        accesses.map(async (a) => ({
          _id: a._id,
          action: a.action,
          at: a.at,
          userName: await userName(ctx, a.userId),
        }))
      ),
    };
  },
});

/** "Assumir caso": registra qual psicóloga assumiu e quando. */
export const assume = mutation({
  args: { patientId: v.id('patients') },
  handler: async (ctx, { patientId }) => {
    const userId = await requirePsicologa(ctx);
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new ConvexError('Paciente não encontrada.');
    const now = Date.now();
    await ctx.db.patch(patientId, { assignedTo: userId, assignedAt: now });
    await ctx.db.insert('auditLog', { userId, patientId, action: 'assumir_caso', at: now });
    return null;
  },
});
