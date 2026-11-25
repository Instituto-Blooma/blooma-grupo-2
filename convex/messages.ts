import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireLoggedAccess } from './lib/access';
import { queueOutgoing } from './lib/outbox';
import { requirePsicologa } from './lib/staff';

/** Histórico da conversa (ficha e simulador). Exige acesso registrado. */
export const list = query({
  args: { patientId: v.id('patients'), accessId: v.id('auditLog') },
  handler: async (ctx, { patientId, accessId }) => {
    const me = await requirePsicologa(ctx);
    await requireLoggedAccess(ctx, me, patientId, accessId);
    const recent = await ctx.db
      .query('messages')
      .withIndex('by_patientId_and_createdAt', (q) => q.eq('patientId', patientId))
      .order('desc')
      .take(200);
    const names = new Map<string, string>();
    const rows = [];
    for (const m of recent.reverse()) {
      let authorName: string | null = null;
      if (m.authorUserId) {
        if (!names.has(m.authorUserId)) {
          const user = await ctx.db.get(m.authorUserId);
          names.set(m.authorUserId, user?.name ?? user?.email ?? 'Equipe');
        }
        authorName = names.get(m.authorUserId) ?? null;
      }
      rows.push({
        _id: m._id,
        direction: m.direction,
        origin: m.origin,
        text: m.text,
        buttons: m.buttons ?? [],
        status: m.status,
        provider: m.provider ?? null,
        providerError: m.providerError ?? null,
        createdAt: m.createdAt,
        authorName,
      });
    }
    return rows;
  },
});

/** A psicóloga escreve na ficha e a mensagem vai para o WhatsApp da paciente (via provedor). */
export const sendFromStaff = mutation({
  args: { patientId: v.id('patients'), text: v.string() },
  handler: async (ctx, { patientId, text }) => {
    const userId = await requirePsicologa(ctx);
    const body = text.trim();
    if (!body) throw new ConvexError('Escreva uma mensagem.');
    if (body.length > 2000) throw new ConvexError('Mensagem muito longa (máximo 2000 caracteres).');
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new ConvexError('Paciente não encontrada.');
    // TODO(WhatsApp): fora da janela de 24h desde a última mensagem da paciente,
    // o WhatsApp só aceita mensagem de modelo (template) aprovada.
    await queueOutgoing(ctx, patientId, [{ origin: 'psicologa', text: body, authorUserId: userId }]);
    await ctx.db.insert('auditLog', { userId, patientId, action: 'enviar_mensagem', at: Date.now() });
    return null;
  },
});
