/**
 * Entry triage protocol (decided with the A.C.Camargo psychologists on 26/11): Distress
 * Thermometer (DT), GAD-7 (anxiety) and PHQ-9 (depression). Stored as data in the
 * `protocolosTriagem` table, so the official texts can be pasted and replaced without code.
 *
 * Step types:
 * - numero: the DT thermometer, a whole number from 0 to 10 typed by the patient ("5", "cinco").
 * - problemas: one DT problem category; she types the numbers that apply ("1, 3") or "nenhum",
 *   then confirms with "Certo" / "Corrigir". Marked items are "sim", the others "não".
 * - aberta: the DT open question "Outros problemas" ("nenhum" is fine).
 * - escolha: one GAD-7 / PHQ-9 question with a list of options (typed answers also work).
 *
 * The texts of the scales are NOT written here: PROTOCOLO_RASCUNHO only has the structure, with
 * "[TEXTO OFICIAL PENDENTE ...]" placeholders, until the official texts are published.
 */
import { ConvexError, v, type Infer } from 'convex/values';
import { normalizarTexto } from './texto';

export const escalaValidator = v.union(v.literal('dt'), v.literal('gad7'), v.literal('phq9'));
export type Escala = Infer<typeof escalaValidator>;

export const NOME_DA_ESCALA: Record<Escala, string> = {
  dt: 'Termômetro de Distresse',
  gad7: 'GAD-7',
  phq9: 'PHQ-9',
};

export const etapaValidator = v.union(
  v.object({
    tipo: v.literal('numero'),
    id: v.string(),
    escala: v.literal('dt'),
    texto: v.string(),
    minimo: v.number(),
    maximo: v.number(),
  }),
  v.object({
    tipo: v.literal('problemas'),
    id: v.string(),
    escala: v.literal('dt'),
    categoria: v.string(),
    itens: v.array(v.object({ id: v.string(), texto: v.string() })),
  }),
  v.object({
    tipo: v.literal('aberta'),
    id: v.string(),
    escala: v.literal('dt'),
    texto: v.string(),
  }),
  v.object({
    tipo: v.literal('escolha'),
    id: v.string(),
    escala: v.union(v.literal('gad7'), v.literal('phq9')),
    texto: v.string(),
    opcoes: v.array(v.object({ id: v.string(), titulo: v.string(), pontos: v.number() })),
    /** PHQ-9 question 9: any option with points > 0 is a risk answer. */
    alertaDeRisco: v.boolean(),
  })
);
export type Etapa = Infer<typeof etapaValidator>;

export const conteudoProtocoloValidator = v.object({
  versao: v.string(),
  nome: v.string(),
  /** True while the official texts of the scales were not pasted yet. */
  textoOficialPendente: v.boolean(),
  /** Text sent before the first question of each scale (official instructions). */
  introducoes: v.object({ dt: v.string(), gad7: v.string(), phq9: v.string() }),
  etapas: v.array(etapaValidator),
});
export type ConteudoProtocolo = Infer<typeof conteudoProtocoloValidator>;

/** One answer as stored in `checkins.respostas` (old example-scale answers have only opcao*). */
export const respostaValidator = v.object({
  perguntaId: v.string(),
  perguntaTexto: v.string(),
  respondidaEm: v.number(),
  tipo: v.optional(
    v.union(v.literal('numero'), v.literal('escolha'), v.literal('problemas'), v.literal('aberta'))
  ),
  escala: v.optional(escalaValidator),
  opcaoId: v.optional(v.string()),
  opcaoTitulo: v.optional(v.string()),
  pontos: v.optional(v.number()),
  risco: v.optional(v.boolean()),
  /** numero: the value typed (0 to 10). */
  valor: v.optional(v.number()),
  /** problemas: every item of the category, with sim (marked) or não. */
  itens: v.optional(v.array(v.object({ id: v.string(), texto: v.string(), sim: v.boolean() }))),
  /** aberta: what she wrote, or null for "nenhum". */
  texto: v.optional(v.union(v.string(), v.null())),
});
export type Resposta = Infer<typeof respostaValidator>;

// ---------------------------------------------------------------------------
// Draft protocol: structure only, official texts pending
// ---------------------------------------------------------------------------

const pendente = (onde: string) => `[TEXTO OFICIAL PENDENTE: ${onde}]`;

/** GAD-7 and PHQ-9 options, as given by the psychology team. */
export const OPCOES_FREQUENCIA = [
  { id: 'nenhuma_vez', titulo: 'Nenhuma vez', pontos: 0 },
  { id: 'varios_dias', titulo: 'Vários dias', pontos: 1 },
  { id: 'mais_da_metade', titulo: 'Mais da metade dos dias', pontos: 2 },
  { id: 'quase_todos', titulo: 'Quase todos os dias', pontos: 3 },
];

const CATEGORIAS_DT = [
  { id: 'dt_praticos', categoria: 'Problemas práticos' },
  { id: 'dt_familiares', categoria: 'Problemas familiares' },
  { id: 'dt_emocionais', categoria: 'Problemas emocionais' },
  { id: 'dt_espiritual', categoria: 'Preocupações espirituais ou religiosas' },
  { id: 'dt_fisicos', categoria: 'Problemas físicos' },
];

export const PROTOCOLO_RASCUNHO: ConteudoProtocolo = {
  versao: 'rascunho-1',
  nome: 'Triagem de entrada: DT, GAD-7 e PHQ-9 (textos oficiais pendentes)',
  textoOficialPendente: true,
  introducoes: {
    dt: pendente('instrução do Termômetro de Distresse'),
    gad7: pendente('instrução do GAD-7'),
    phq9: pendente('instrução do PHQ-9'),
  },
  etapas: [
    {
      tipo: 'numero',
      id: 'dt_termometro',
      escala: 'dt',
      texto: pendente('pergunta do termômetro (0 a 10)'),
      minimo: 0,
      maximo: 10,
    },
    ...CATEGORIAS_DT.map(({ id, categoria }) => ({
      tipo: 'problemas' as const,
      id,
      escala: 'dt' as const,
      categoria,
      itens: [{ id: 'pendente', texto: pendente(`itens de "${categoria}"`) }],
    })),
    {
      tipo: 'aberta',
      id: 'dt_outros',
      escala: 'dt',
      texto: 'Outros problemas',
    },
    ...Array.from({ length: 7 }, (_, indice) => ({
      tipo: 'escolha' as const,
      id: `gad7_${indice + 1}`,
      escala: 'gad7' as const,
      texto: pendente(`GAD-7, pergunta ${indice + 1}`),
      opcoes: OPCOES_FREQUENCIA,
      alertaDeRisco: false,
    })),
    ...Array.from({ length: 9 }, (_, indice) => ({
      tipo: 'escolha' as const,
      id: `phq9_${indice + 1}`,
      escala: 'phq9' as const,
      texto: pendente(`PHQ-9, pergunta ${indice + 1}`),
      opcoes: OPCOES_FREQUENCIA,
      // Question 9: thinking it would be better to be dead or of hurting herself.
      alertaDeRisco: indice === 8,
    })),
  ],
};

// ---------------------------------------------------------------------------
// Validation of a protocol before it is published
// ---------------------------------------------------------------------------

const ID_VALIDO = /^[a-z0-9_]{1,40}$/;
/** WhatsApp list: at most 10 rows, 24 letters per row title. */
const MAX_OPCOES = 10;
const MAX_TITULO_OPCAO = 24;
/** Text of a message with a list: 1024 letters (the numbered options go in it too). */
const MAX_TEXTO_ESCOLHA = 500;
/** Instruction sent together with the first GAD-7 / PHQ-9 question (same message). */
const MAX_INTRODUCAO_ESCOLHA = 300;
/** Plain text message: 4096 letters. */
const MAX_TEXTO_LIVRE = 3500;

export function validarProtocolo(protocolo: ConteudoProtocolo) {
  if (!protocolo.versao.trim() || !protocolo.nome.trim()) {
    throw new ConvexError('Informe a versão e o nome do protocolo.');
  }
  for (const escala of ['gad7', 'phq9'] as const) {
    if (protocolo.introducoes[escala].length > MAX_INTRODUCAO_ESCOLHA) {
      throw new ConvexError(
        `A instrução do ${NOME_DA_ESCALA[escala]} passa de ${MAX_INTRODUCAO_ESCOLHA} letras (ela vai junto com a primeira pergunta).`
      );
    }
  }
  const ids = new Set<string>();
  for (const [posicao, etapa] of protocolo.etapas.entries()) {
    const nome = `Etapa ${posicao + 1} (${etapa.id})`;
    if (!ID_VALIDO.test(etapa.id) || ids.has(etapa.id)) {
      throw new ConvexError(`${nome}: o id precisa ser único, com minúsculas, números ou _.`);
    }
    ids.add(etapa.id);
    switch (etapa.tipo) {
      case 'numero':
        if (!Number.isInteger(etapa.minimo) || !Number.isInteger(etapa.maximo)) {
          throw new ConvexError(`${nome}: mínimo e máximo precisam ser números inteiros.`);
        }
        break;
      case 'problemas': {
        if (etapa.itens.length === 0) throw new ConvexError(`${nome}: a categoria não tem itens.`);
        const texto = etapa.itens.map((item, i) => `${i + 1}. ${item.texto}`).join('\n');
        if (texto.length > MAX_TEXTO_LIVRE) {
          throw new ConvexError(`${nome}: a lista é longa demais para uma mensagem.`);
        }
        break;
      }
      case 'aberta':
        break;
      case 'escolha':
        if (etapa.opcoes.length < 2 || etapa.opcoes.length > MAX_OPCOES) {
          throw new ConvexError(`${nome}: use de 2 a ${MAX_OPCOES} opções.`);
        }
        if (etapa.texto.length > MAX_TEXTO_ESCOLHA) {
          throw new ConvexError(`${nome}: o texto passa de ${MAX_TEXTO_ESCOLHA} letras.`);
        }
        for (const opcao of etapa.opcoes) {
          if (!opcao.titulo.trim() || opcao.titulo.length > MAX_TITULO_OPCAO) {
            throw new ConvexError(
              `${nome}: a opção "${opcao.titulo}" precisa ter até ${MAX_TITULO_OPCAO} letras.`
            );
          }
        }
        break;
    }
  }
  const primeiraNaoDt = protocolo.etapas.findIndex((etapa) => etapa.escala !== 'dt');
  if (
    primeiraNaoDt !== -1 &&
    protocolo.etapas.slice(primeiraNaoDt).some((e) => e.escala === 'dt')
  ) {
    throw new ConvexError('As etapas da DT precisam vir todas antes do GAD-7 e do PHQ-9.');
  }
  if (!protocolo.etapas.some((etapa) => etapa.tipo === 'numero')) {
    throw new ConvexError('O protocolo precisa ter o termômetro da DT (etapa do tipo número).');
  }
}

// ---------------------------------------------------------------------------
// Reading what she typed
// ---------------------------------------------------------------------------

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
};

/** Words that may go around the numbers without changing the answer. */
const PALAVRAS_DE_LIGACAO = new Set(['e', 'a', 'o', 'item', 'itens', 'numero', 'numeros', 'nota']);

/** Numbers in the text ("5", "cinco", "1, 3 e 5"); `null` if there is any other word in it. */
function numerosNoTexto(texto: string): number[] | null {
  const palavras = normalizarTexto(texto).split(' ').filter(Boolean);
  const numeros: number[] = [];
  for (const palavra of palavras) {
    if (/^\d+$/.test(palavra)) numeros.push(Number(palavra));
    else if (palavra in NUMEROS_POR_EXTENSO) numeros.push(NUMEROS_POR_EXTENSO[palavra]);
    else if (!PALAVRAS_DE_LIGACAO.has(palavra)) return null;
  }
  return numeros;
}

/** Thermometer: a single whole number between minimo and maximo, or null (ask again). */
export function lerNumero(texto: string, minimo: number, maximo: number): number | null {
  // "5,5" or "5.5" are not whole numbers.
  if (/\d\s*[.,]\s*\d/.test(texto)) return null;
  const numeros = numerosNoTexto(texto);
  if (!numeros || numeros.length !== 1) return null;
  const [valor] = numeros;
  return valor >= minimo && valor <= maximo ? valor : null;
}

const NENHUM = new Set(['nenhum', 'nenhuma', 'nada', 'nao', 'nenhum deles', 'nenhuma delas']);

/** Problem list: the marked item numbers (1-based), [] for "nenhum", or null (ask again). */
export function lerItensMarcados(texto: string, totalDeItens: number): number[] | null {
  const normalizado = normalizarTexto(texto);
  if (NENHUM.has(normalizado)) return [];
  const numeros = numerosNoTexto(texto);
  if (!numeros || numeros.length === 0) return null;
  if (numeros.some((numero) => numero < 1 || numero > totalDeItens)) return null;
  return [...new Set(numeros)].toSorted((a, b) => a - b);
}

/** Open question: what she wrote, or null for "nenhum". */
export function lerTextoAberto(texto: string): string | null {
  const limpo = texto.trim().replace(/\s+/g, ' ');
  return NENHUM.has(normalizarTexto(limpo)) ? null : limpo.slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export type Resultados = {
  dt?: number;
  gad7?: number;
  phq9?: number;
  riscoPhq9: boolean;
  gadPhqNaoAplicados: boolean;
};

/** DT = thermometer value; GAD-7 and PHQ-9 = sum of points; risk = PHQ-9 q9 above "Nenhuma vez". */
export function calcularResultados(respostas: Resposta[], gadPhqNaoAplicados: boolean): Resultados {
  const soma = (escala: Escala) => {
    const daEscala = respostas.filter((r) => r.escala === escala && r.tipo === 'escolha');
    return daEscala.length ? daEscala.reduce((total, r) => total + (r.pontos ?? 0), 0) : undefined;
  };
  const termometro = respostas.find((r) => r.escala === 'dt' && r.tipo === 'numero');
  return {
    dt: termometro?.valor,
    gad7: soma('gad7'),
    phq9: soma('phq9'),
    riscoPhq9: respostas.some((r) => r.escala === 'phq9' && r.risco === true),
    gadPhqNaoAplicados,
  };
}
