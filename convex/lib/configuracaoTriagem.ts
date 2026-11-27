/**
 * Per-hospital triage settings (table `configuracoesHospital`), edited on the Configurações page.
 * Any field not saved yet uses the default below.
 */
import type { MutationCtx, QueryCtx } from '../_generated/server';

/** Proposal approved as the starting text; the psychologists will review it. */
export const EXPLICACAO_LISTA_PROBLEMAS_PADRAO = [
  'Agora vou mostrar uma lista de problemas que podem estar acontecendo com você. A lista está separada em grupos.',
  '',
  'Em cada grupo, escreva os números dos itens que acontecem com você, separados por vírgula. Por exemplo: 1, 3',
  '',
  'Os itens que você não escrever contam como "não".',
  '',
  'Se nenhum item do grupo acontecer com você, escreva "nenhum".',
].join('\n');

export type ConfiguracaoTriagem = {
  explicacaoListaProblemas: string;
};

export const CONFIGURACAO_PADRAO: ConfiguracaoTriagem = {
  explicacaoListaProblemas: EXPLICACAO_LISTA_PROBLEMAS_PADRAO,
};

export async function buscarConfiguracao(ctx: QueryCtx | MutationCtx, organizationId: string) {
  return await ctx.db
    .query('configuracoesHospital')
    .withIndex('by_organizationId', (q) => q.eq('organizationId', organizationId))
    .unique();
}

/** Saved settings of the hospital, with the defaults for whatever was never saved. */
export async function configuracaoDoHospital(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
): Promise<ConfiguracaoTriagem> {
  const salva = await buscarConfiguracao(ctx, organizationId);
  return {
    explicacaoListaProblemas:
      salva?.explicacaoListaProblemas ?? CONFIGURACAO_PADRAO.explicacaoListaProblemas,
  };
}
