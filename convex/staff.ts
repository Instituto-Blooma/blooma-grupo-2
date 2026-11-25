import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { resolveActingUserId } from './lib/auth';
import { PRIORITY_CONFIG } from './lib/priority';
import { hasPsicologaRole } from './lib/staff';
import { normalizeEmail } from './lib/users';

/** Quem está logada e se tem o papel de psicóloga. Não devolve dado de paciente. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return {
      name: user?.name ?? user?.email ?? 'Equipe',
      isPsicologa: await hasPsicologaRole(ctx, userId),
      simulatorEnabled: process.env.SIMULADOR_DESLIGADO !== '1',
      priorityConfig: {
        version: PRIORITY_CONFIG.version,
        provisional: PRIORITY_CONFIG.provisional,
        cutoffs: PRIORITY_CONFIG.cutoffs,
      },
    };
  },
});

/**
 * Dá o papel "psicologa" a uma pessoa já cadastrada. Só roda pelo terminal/painel do Convex:
 *   npx convex run staff:grantPsicologa '{"email":"pessoa@exemplo.org"}'
 * TODO(equipe): definir quem pode liberar acesso em produção.
 */
export const grantPsicologa = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
      .first();
    if (!user) throw new Error('Usuária não encontrada. Ela precisa entrar uma vez antes.');
    const existing = await ctx.db
      .query('staffRoles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first();
    if (!existing) {
      await ctx.db.insert('staffRoles', { userId: user._id, role: 'psicologa', grantedAt: Date.now() });
    }
    return { userId: user._id };
  },
});

export const revokePsicologa = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
      .first();
    if (!user) return null;
    const roles = await ctx.db
      .query('staffRoles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .take(10);
    for (const role of roles) await ctx.db.delete(role._id);
    return null;
  },
});
