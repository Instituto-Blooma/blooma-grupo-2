import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { resolveActingUserId } from './auth';

type Ctx = QueryCtx | MutationCtx;

export async function hasPsicologaRole(ctx: Ctx, userId: Id<'users'>): Promise<boolean> {
  const role = await ctx.db
    .query('staffRoles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();
  return role?.role === 'psicologa';
}

/**
 * Checagem NO SERVIDOR: login + papel "psicologa".
 * Toda query/mutation que toca dado de paciente começa chamando isto.
 */
export async function requirePsicologa(ctx: Ctx): Promise<Id<'users'>> {
  const userId = await resolveActingUserId(ctx);
  if (!userId) {
    throw new ConvexError('Faça login para continuar.');
  }
  if (!(await hasPsicologaRole(ctx, userId))) {
    throw new ConvexError('Acesso restrito à equipe de psicologia.');
  }
  return userId;
}

/**
 * A tela de simulador pode ser desligada no servidor (ex.: em produção)
 * definindo SIMULADOR_DESLIGADO=1 nas variáveis do Convex.
 */
export function assertSimulatorEnabled() {
  if (process.env.SIMULADOR_DESLIGADO === '1') {
    throw new ConvexError('O simulador está desligado neste ambiente.');
  }
}
