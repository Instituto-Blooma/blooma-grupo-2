/**
 * Priorities of the team queue, and the shape of the OLD example scale (table `escalasTriagem`),
 * kept only so earlier test data still reads. The entry triage now uses convex/lib/protocolo.ts.
 */
import { v, type Infer } from 'convex/values';

export const prioridadeValidator = v.union(
  v.literal('urgente'),
  v.literal('alta'),
  v.literal('moderada'),
  v.literal('baixa')
);
export type Prioridade = Infer<typeof prioridadeValidator>;

/** Lower number = needs the team sooner. Used to sort the queue. */
export const ORDEM_PRIORIDADE: Record<Prioridade, number> = {
  urgente: 0,
  alta: 1,
  moderada: 2,
  baixa: 3,
};
/** Queue position for a patient in the queue without any priority yet (e.g. bot gave up). */
export const ORDEM_SEM_PRIORIDADE = 9;

export const opcaoEscalaValidator = v.object({
  id: v.string(),
  titulo: v.string(),
  pontos: v.number(),
  /** Choosing it makes the case urgent and sends CVV 188 / SAMU 192 at the end of the check-in. */
  risco: v.boolean(),
});

export const perguntaEscalaValidator = v.object({
  id: v.string(),
  texto: v.string(),
  opcoes: v.array(opcaoEscalaValidator),
});

export const faixasValidator = v.object({
  /** Total from which the case is urgent even without a risk answer (optional). */
  urgenteAPartirDe: v.optional(v.number()),
  altaAPartirDe: v.number(),
  moderadaAPartirDe: v.number(),
});

export const conteudoEscalaValidator = v.object({
  versao: v.string(),
  nome: v.string(),
  /** True while it is not a validated scale chosen by the psychology team. */
  exemplo: v.boolean(),
  perguntas: v.array(perguntaEscalaValidator),
  faixas: faixasValidator,
});

export function prioridadeMaisAlta(a: Prioridade | undefined, b: Prioridade): Prioridade {
  if (a === undefined) return b;
  return ORDEM_PRIORIDADE[a] <= ORDEM_PRIORIDADE[b] ? a : b;
}
