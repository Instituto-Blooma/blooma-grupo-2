/**
 * Per-hospital triage settings (table `configuracoesHospital`), edited on the Configurações page.
 * Any field not saved yet uses the default below.
 */
import { v, type Infer } from 'convex/values';
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

/** Cut-off scores: at or above the cut-off the scale is "above the cut". */
export const cortesValidator = v.object({
  dt: v.number(),
  gad7: v.number(),
  phq9: v.number(),
  /** GAD-7 and PHQ-9 cut-offs still have to be confirmed by the psychologists. */
  gad7Confirmado: v.boolean(),
  phq9Confirmado: v.boolean(),
});
export type Cortes = Infer<typeof cortesValidator>;

/**
 * Rule that turns the three scores into a priority (PROVISIONAL until the psychologists define it):
 * - urgente: PHQ-9 question 9 above "Nenhuma vez" (and typed risk words, handled elsewhere);
 * - alta: GAD-7 >= altaGad7AoMenos, or PHQ-9 >= altaPhq9AoMenos, or (with altaSeTresAcimaDoCorte)
 *   the three scales above their cut-offs;
 * - moderada: any scale above its cut-off;
 * - baixa: everything below the cut-offs.
 */
export const regraValidator = v.object({
  provisoria: v.boolean(),
  altaGad7AoMenos: v.number(),
  altaPhq9AoMenos: v.number(),
  altaSeTresAcimaDoCorte: v.boolean(),
});
export type Regra = Infer<typeof regraValidator>;

export type ConfiguracaoTriagem = {
  explicacaoListaProblemas: string;
  cortes: Cortes;
  regra: Regra;
  /** GAD-7 and PHQ-9 only when the DT is at or above its cut-off (decided 27/11). */
  gadPhqSomenteAcimaDoCorteDT: boolean;
  /** Weekly re-check (Mondays 9h). OFF: the MVP is the entry triage only (decided 26/11). */
  checkinSemanalAtivo: boolean;
};

export const CONFIGURACAO_PADRAO: ConfiguracaoTriagem = {
  explicacaoListaProblemas: EXPLICACAO_LISTA_PROBLEMAS_PADRAO,
  // DT: cut-off 4 from the manual. GAD-7 and PHQ-9: 10 (moderate band), to be confirmed.
  cortes: { dt: 4, gad7: 10, phq9: 10, gad7Confirmado: false, phq9Confirmado: false },
  regra: {
    provisoria: true,
    altaGad7AoMenos: 15,
    altaPhq9AoMenos: 15,
    altaSeTresAcimaDoCorte: true,
  },
  gadPhqSomenteAcimaDoCorteDT: true,
  checkinSemanalAtivo: false,
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
    cortes: salva?.cortes ?? CONFIGURACAO_PADRAO.cortes,
    regra: salva?.regra ?? CONFIGURACAO_PADRAO.regra,
    gadPhqSomenteAcimaDoCorteDT:
      salva?.gadPhqSomenteAcimaDoCorteDT ?? CONFIGURACAO_PADRAO.gadPhqSomenteAcimaDoCorteDT,
    checkinSemanalAtivo: salva?.checkinSemanalAtivo ?? CONFIGURACAO_PADRAO.checkinSemanalAtivo,
  };
}
