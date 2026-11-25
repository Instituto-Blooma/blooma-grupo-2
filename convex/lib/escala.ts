/**
 * Triage scale: questions, points per answer, risk answers and the fixed rule that turns the total
 * into a priority. Stored as data (`escalasTriagem` table) so the psychology team can replace it;
 * this file only has the shape, the validation, the rule and the EXAMPLE scale.
 */
import { ConvexError, v, type Infer } from 'convex/values';

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
export type ConteudoEscala = Infer<typeof conteudoEscalaValidator>;
export type PerguntaEscala = Infer<typeof perguntaEscalaValidator>;
export type Faixas = Infer<typeof faixasValidator>;

/** WhatsApp limits: up to 3 buttons (20 letters each) or a list of up to 10 rows (24 letters). */
const MAX_BOTOES = 3;
const MAX_TITULO_BOTAO = 20;
const MAX_OPCOES_LISTA = 10;
const MAX_TITULO_LISTA = 24;
const MAX_TEXTO_PERGUNTA = 900;
const MAX_PERGUNTAS = 30;
const ID_VALIDO = /^[a-z0-9_]{1,30}$/;

export function usaBotoes(pergunta: PerguntaEscala) {
  return pergunta.opcoes.length <= MAX_BOTOES;
}

/** Throws a message in Portuguese explaining what is wrong with the scale. */
export function validarEscala(escala: ConteudoEscala) {
  if (!escala.versao.trim() || !escala.nome.trim()) {
    throw new ConvexError('Informe a versão e o nome da escala.');
  }
  if (escala.perguntas.length === 0 || escala.perguntas.length > MAX_PERGUNTAS) {
    throw new ConvexError(`A escala precisa ter de 1 a ${MAX_PERGUNTAS} perguntas.`);
  }
  const idsPerguntas = new Set<string>();
  for (const [indice, pergunta] of escala.perguntas.entries()) {
    const nome = `Pergunta ${indice + 1}`;
    if (!ID_VALIDO.test(pergunta.id) || idsPerguntas.has(pergunta.id)) {
      throw new ConvexError(`${nome}: o id deve ser único, com letras minúsculas, números ou _.`);
    }
    idsPerguntas.add(pergunta.id);
    if (!pergunta.texto.trim() || pergunta.texto.length > MAX_TEXTO_PERGUNTA) {
      throw new ConvexError(`${nome}: o texto precisa ter de 1 a ${MAX_TEXTO_PERGUNTA} letras.`);
    }
    if (pergunta.opcoes.length < 2 || pergunta.opcoes.length > MAX_OPCOES_LISTA) {
      throw new ConvexError(`${nome}: use de 2 a ${MAX_OPCOES_LISTA} opções.`);
    }
    const maxTitulo = usaBotoes(pergunta) ? MAX_TITULO_BOTAO : MAX_TITULO_LISTA;
    const idsOpcoes = new Set<string>();
    for (const opcao of pergunta.opcoes) {
      if (!ID_VALIDO.test(opcao.id) || idsOpcoes.has(opcao.id)) {
        throw new ConvexError(
          `${nome}: cada opção precisa de um id único (minúsculas, números, _).`
        );
      }
      idsOpcoes.add(opcao.id);
      if (!opcao.titulo.trim() || opcao.titulo.length > maxTitulo) {
        throw new ConvexError(
          `${nome}: o texto da opção "${opcao.titulo}" precisa ter até ${maxTitulo} letras.`
        );
      }
      if (!Number.isFinite(opcao.pontos) || opcao.pontos < 0) {
        throw new ConvexError(`${nome}: os pontos precisam ser um número maior ou igual a zero.`);
      }
    }
  }
  const { urgenteAPartirDe, altaAPartirDe, moderadaAPartirDe } = escala.faixas;
  if (
    moderadaAPartirDe > altaAPartirDe ||
    (urgenteAPartirDe !== undefined && altaAPartirDe > urgenteAPartirDe)
  ) {
    throw new ConvexError('Os pontos de corte precisam crescer: moderada ≤ alta ≤ urgente.');
  }
}

export function pontuacaoMaxima(escala: Pick<ConteudoEscala, 'perguntas'>) {
  return escala.perguntas.reduce(
    (total, pergunta) => total + Math.max(...pergunta.opcoes.map((opcao) => opcao.pontos)),
    0
  );
}

/**
 * The fixed rule. Any risk answer → urgent. Otherwise the total decides, using the cut-off points
 * of the scale. No AI and no judgement here: same answers always give the same priority.
 */
export function definirPrioridade(pontuacao: number, teveRisco: boolean, faixas: Faixas) {
  if (teveRisco) return 'urgente';
  if (faixas.urgenteAPartirDe !== undefined && pontuacao >= faixas.urgenteAPartirDe) {
    return 'urgente';
  }
  if (pontuacao >= faixas.altaAPartirDe) return 'alta';
  if (pontuacao >= faixas.moderadaAPartirDe) return 'moderada';
  return 'baixa';
}

export function prioridadeMaisAlta(a: Prioridade | undefined, b: Prioridade): Prioridade {
  if (a === undefined) return b;
  return ORDEM_PRIORIDADE[a] <= ORDEM_PRIORIDADE[b] ? a : b;
}

// ---------------------------------------------------------------------------
// EXAMPLE scale — NOT validated. Replace with the scale chosen by the psychology team:
//   npx convex run triagem:publicarEscala '{"escala": {...}}'
// ---------------------------------------------------------------------------

const NADA_POUCO_MUITO = [
  { id: 'nada', titulo: 'Nada', pontos: 0, risco: false },
  { id: 'pouco', titulo: 'Um pouco', pontos: 1, risco: false },
  { id: 'muito', titulo: 'Muito', pontos: 2, risco: false },
];

export const ESCALA_DE_EXEMPLO: ConteudoEscala = {
  versao: 'exemplo-1',
  nome: 'Escala de EXEMPLO (não validada)',
  exemplo: true,
  perguntas: [
    {
      id: 'tristeza',
      texto: 'Nos últimos 7 dias, quanto você se sentiu triste ou desanimada?',
      opcoes: NADA_POUCO_MUITO,
    },
    {
      id: 'ansiedade',
      texto: 'Nos últimos 7 dias, quanto você se sentiu nervosa ou preocupada?',
      opcoes: NADA_POUCO_MUITO,
    },
    {
      id: 'sono',
      texto: 'Como foi o seu sono nos últimos 7 dias?',
      opcoes: [
        { id: 'bom', titulo: 'Bom', pontos: 0, risco: false },
        { id: 'mais_ou_menos', titulo: 'Mais ou menos', pontos: 1, risco: false },
        { id: 'ruim', titulo: 'Ruim', pontos: 2, risco: false },
      ],
    },
    {
      id: 'dia_a_dia',
      texto: 'Você conseguiu fazer as suas atividades do dia a dia?',
      opcoes: [
        { id: 'sim', titulo: 'Sim', pontos: 0, risco: false },
        { id: 'com_dificuldade', titulo: 'Com dificuldade', pontos: 1, risco: false },
        { id: 'nao', titulo: 'Não', pontos: 2, risco: false },
      ],
    },
    {
      id: 'apoio',
      texto: 'Você tem tido alguém com quem contar?',
      opcoes: [
        { id: 'sim', titulo: 'Sim', pontos: 0, risco: false },
        { id: 'as_vezes', titulo: 'Às vezes', pontos: 1, risco: false },
        { id: 'nao', titulo: 'Não', pontos: 2, risco: false },
      ],
    },
    {
      id: 'pensamentos_de_morte',
      texto:
        'Nos últimos 7 dias, você pensou que seria melhor estar morta ou pensou em se machucar?',
      opcoes: [
        { id: 'nao', titulo: 'Não', pontos: 0, risco: false },
        { id: 'algumas_vezes', titulo: 'Algumas vezes', pontos: 3, risco: true },
        { id: 'muitas_vezes', titulo: 'Muitas vezes', pontos: 3, risco: true },
      ],
    },
  ],
  // Example cut-off points (total from 0 to 13).
  faixas: { altaAPartirDe: 7, moderadaAPartirDe: 4 },
};
