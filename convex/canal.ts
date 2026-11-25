/**
 * Messaging channel — everything specific to the WhatsApp Cloud API lives in this file.
 *
 * The rest of the backend only sees the provider-neutral shapes:
 * - incoming: `MensagemRecebida` = { telefone, texto, opcaoEscolhida }
 * - outgoing: the `enviar*` internal mutations below (text, buttons, list, document/video)
 *
 * Simulated mode: while WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID is unset, nothing is sent;
 * each outgoing message is written to the Convex logs as the exact payload it would send.
 *
 * Environment (all optional until the Meta account exists):
 * - WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID — turn on real sending
 * - WHATSAPP_APP_SECRET — required in real mode; checks the X-Hub-Signature-256 of each webhook
 * - WHATSAPP_VERIFY_TOKEN — answer Meta's webhook verification (GET)
 * - WHATSAPP_API_VERSION — Graph API version (default v23.0)
 * - WHATSAPP_TEMPLATE_AVISO, WHATSAPP_TEMPLATE_IDIOMA — approved template sent when the 24h
 *   reply window is closed (default `nova_mensagem_equipe`, `pt_BR`)
 * - CANAL_TOLERAR_ERRO_DIGITACAO — `true` accepts a small typo in a typed option name.
 *   Off by default: for the scales only the option number or the exact name counts.
 * - CANAL_CARTILHA_URL, CANAL_CARTILHA_NOME — public link (and file name) of the guide on how to
 *   use the service, sent again when the patient gets the same question wrong 3 times.
 *
 * Privacy: patient text is written to the logs only in simulated mode.
 *
 * Webhook routes are registered in `convex/http.ts` at `/whatsapp/webhook`.
 */
import { ConvexError, v, type Infer } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { normalizarTexto } from './lib/texto';
import {
  receberMensagemDaPaciente,
  registrarMensagemEnviada,
  type RemetenteSaida,
} from './pacientes';
import { registrarQueRoboNaoEntendeu } from './triagem';
import { mensagemSaidaValidator, opcaoMenuValidator, perguntaValidator } from './schema';

// ---------------------------------------------------------------------------
// Provider-neutral shapes
// ---------------------------------------------------------------------------

/** What the rest of the code receives for every patient message. */
export type MensagemRecebida = {
  /** Digits only, with country code (e.g. `5511999998888`). */
  telefone: string;
  /** What the patient wrote, or the title of the button/list row she tapped. */
  texto: string;
  /** ID of the menu option she chose (tap, typed number or typed name), or `null`. */
  opcaoEscolhida: string | null;
};

type MensagemSaida = Infer<typeof mensagemSaidaValidator>;
type Pergunta = Infer<typeof perguntaValidator>;
type OpcaoMenu = Infer<typeof opcaoMenuValidator>;

const remetenteValidator = v.union(
  v.object({ tipo: v.literal('robo') }),
  v.object({
    tipo: v.literal('profissional'),
    nome: v.string(),
    funcao: v.string(),
    /** Who answered, for the conversation history on the site. */
    usuarioId: v.optional(v.id('users')),
  })
);

const resultadoEnvioValidator = v.object({
  situacao: v.union(v.literal('enviada'), v.literal('aguardando_paciente')),
});

/** WhatsApp only allows free-form messages up to 24h after the patient's last message. */
const JANELA_RESPOSTA_MS = 24 * 60 * 60 * 1000;

/** On the 3rd answer in a row that matches no option, the bot stops asking and the team takes over. */
const MAX_TENTATIVAS_ERRADAS = 3;
const MENSAGEM_NAO_ENTENDI =
  'Não entendi sua resposta. Responda com o número ou o nome de uma das opções.';
const MENSAGEM_EQUIPE_VAI_AJUDAR =
  'Não consegui entender suas respostas. Alguém da equipe vai continuar a conversa com você por aqui.';
/**
 * Text of the approved notice template (WHATSAPP_TEMPLATE_AVISO), sent when the 24h window is
 * closed. WhatsApp sends the text registered at Meta, so the template there must have exactly
 * this text; here it is only written to the conversation history.
 */
export const TEXTO_MODELO_AVISO =
  'Oi, tudo bem? Você tem uma nova mensagem da equipe! Por favor, escreva uma mensagem para te enviarmos a resposta da equipe.';

const LIMITES = {
  texto: 4096,
  corpoInterativo: 1024,
  legenda: 1024,
  botoes: 3,
  tituloBotao: 20,
  opcoesLista: 10,
  tituloLinhaLista: 24,
  descricaoLinhaLista: 72,
  textoBotaoLista: 20,
  idOpcao: 200,
} as const;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function configuracao() {
  const token = process.env.WHATSAPP_TOKEN?.trim() || null;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null;
  return {
    token,
    phoneNumberId,
    simulado: !token || !phoneNumberId,
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || null,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null,
    apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || 'v23.0',
    templateAviso: process.env.WHATSAPP_TEMPLATE_AVISO?.trim() || 'nova_mensagem_equipe',
    idiomaTemplate: process.env.WHATSAPP_TEMPLATE_IDIOMA?.trim() || 'pt_BR',
    tolerarErroDeDigitacao: process.env.CANAL_TOLERAR_ERRO_DIGITACAO?.trim() === 'true',
    cartilhaUrl: process.env.CANAL_CARTILHA_URL?.trim() || null,
    cartilhaNome: process.env.CANAL_CARTILHA_NOME?.trim() || 'cartilha.pdf',
  };
}

/** Logs patient data only while simulating; in real mode only the event name is kept. */
function logarSimulado(evento: string, dados: Record<string, unknown>) {
  if (configuracao().simulado) {
    console.log(evento, JSON.stringify(dados));
  } else {
    console.log(evento);
  }
}

// ---------------------------------------------------------------------------
// Incoming: webhook
// ---------------------------------------------------------------------------

/** GET — Meta calls this once when the webhook URL is configured. */
export const verificarWebhook = httpAction(async (_ctx, req) => {
  const params = new URL(req.url).searchParams;
  const { verifyToken } = configuracao();
  if (
    verifyToken &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === verifyToken
  ) {
    return new Response(params.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
});

/** POST — every patient message (and delivery status) arrives here. */
export const receberWebhook = httpAction(async (ctx, req) => {
  const bytes = await req.arrayBuffer();
  const config = configuracao();

  if (config.appSecret) {
    const valida = await assinaturaValida(
      bytes,
      req.headers.get('x-hub-signature-256'),
      config.appSecret
    );
    if (!valida) {
      return new Response('Invalid signature', { status: 401 });
    }
  } else if (!config.simulado) {
    console.error('[canal] WHATSAPP_APP_SECRET is required when WHATSAPP_TOKEN is set');
    return new Response('Webhook signature secret not configured', { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!isRecord(corpo)) {
    return new Response('Invalid body', { status: 400 });
  }

  for (const mensagem of extrairMensagens(corpo)) {
    await ctx.runMutation(internal.canal.registrarMensagemRecebida, mensagem);
  }
  // Always 200 for a well-formed body, otherwise Meta keeps retrying the same delivery.
  return new Response('OK', { status: 200 });
});

type MensagemWhatsApp = {
  mensagemId: string;
  telefone: string;
  texto: string;
  idEscolhido: string | null;
  recebidaEm: number;
};

/** Reads `entry[].changes[].value.messages[]` from a Cloud API webhook; ignores everything else. */
function extrairMensagens(corpo: Record<string, unknown>): MensagemWhatsApp[] {
  const resultado: MensagemWhatsApp[] = [];
  for (const entry of lista(corpo.entry)) {
    if (!isRecord(entry)) continue;
    for (const change of lista(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      for (const msg of lista(change.value.messages)) {
        const convertida = converterMensagem(msg);
        if (convertida) resultado.push(convertida);
      }
    }
  }
  return resultado;
}

function converterMensagem(msg: unknown): MensagemWhatsApp | null {
  if (!isRecord(msg)) return null;
  const mensagemId = textoOu(msg.id);
  const telefone = somenteDigitos(textoOu(msg.from) ?? '');
  if (!mensagemId || !telefone) return null;

  const segundos = Number(textoOu(msg.timestamp));
  // The 24h window counts from when the patient sent the message (never later than now).
  const recebidaEm =
    Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos * 1000, Date.now()) : Date.now();

  let texto = '';
  let idEscolhido: string | null = null;
  switch (msg.type) {
    case 'text':
      texto = isRecord(msg.text) ? (textoOu(msg.text.body) ?? '') : '';
      break;
    case 'interactive': {
      // Tap on a reply button or on a list row.
      const interativo = isRecord(msg.interactive) ? msg.interactive : {};
      const resposta = isRecord(interativo.button_reply)
        ? interativo.button_reply
        : isRecord(interativo.list_reply)
          ? interativo.list_reply
          : null;
      if (resposta) {
        idEscolhido = textoOu(resposta.id) ?? null;
        texto = textoOu(resposta.title) ?? '';
      }
      break;
    }
    case 'button':
      // Quick-reply button on a template message.
      if (isRecord(msg.button)) {
        idEscolhido = textoOu(msg.button.payload) ?? null;
        texto = textoOu(msg.button.text) ?? '';
      }
      break;
    default:
      // Audio, image, sticker, location...: delivered with empty text so the flow can say
      // it only understands written messages.
      break;
  }
  return { mensagemId, telefone, texto: texto.trim(), idEscolhido, recebidaEm };
}

export const registrarMensagemRecebida = internalMutation({
  args: {
    mensagemId: v.string(),
    telefone: v.string(),
    texto: v.string(),
    idEscolhido: v.union(v.string(), v.null()),
    recebidaEm: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Meta may deliver the same message more than once: ignore repeats by message ID.
    const repetida = await ctx.db
      .query('canalMensagensRecebidas')
      .withIndex('by_mensagemId', (q) => q.eq('mensagemId', args.mensagemId))
      .unique();
    if (repetida) {
      return null;
    }
    await ctx.db.insert('canalMensagensRecebidas', {
      mensagemId: args.mensagemId,
      telefone: args.telefone,
      recebidaEm: args.recebidaEm,
    });

    const conversa = await buscarConversa(ctx, args.telefone);
    const pergunta = conversa?.perguntaAtual;
    const opcaoEscolhida = pergunta
      ? escolherOpcao(pergunta, args.texto, args.idEscolhido)
      : args.idEscolhido;
    const respondeuPergunta = pergunta !== undefined && opcaoEscolhida !== null;

    if (conversa) {
      await ctx.db.patch('canalConversas', conversa._id, {
        ultimaMensagemPacienteEm: Math.max(conversa.ultimaMensagemPacienteEm, args.recebidaEm),
        // An answered question closes before the product logic runs (it may ask the next one).
        ...(respondeuPergunta ? { perguntaAtual: undefined, tentativasErradas: undefined } : {}),
      });
    } else {
      await ctx.db.insert('canalConversas', {
        telefone: args.telefone,
        ultimaMensagemPacienteEm: args.recebidaEm,
      });
    }

    // The patient wrote, so the 24h window is open again: send what was waiting for her.
    await enviarPendentes(ctx, args.telefone);

    // Every message reaches the product logic first — including answers that matched no option,
    // so a written request for help is never lost and can stop the question from repeating.
    const { cancelarPergunta } = await entregarParaTriagem(ctx, {
      telefone: args.telefone,
      texto: args.texto,
      opcaoEscolhida,
    });

    if (pergunta && !respondeuPergunta) {
      await tratarRespostaErrada(ctx, args.telefone, pergunta, cancelarPergunta);
    }
    return null;
  },
});

/** What the product logic tells the channel after handling a message. */
export type ResultadoRecebimento = {
  /** Stop asking the open question (e.g. a crisis message or a request to delete data). */
  cancelarPergunta: boolean;
};

/**
 * The single hand-off point from the channel to the rest of the product.
 * It only ever receives `{ telefone, texto, opcaoEscolhida }`.
 */
async function entregarParaTriagem(
  ctx: MutationCtx,
  mensagem: MensagemRecebida
): Promise<ResultadoRecebimento> {
  logarSimulado('[canal] mensagem recebida', mensagem);
  return await receberMensagemDaPaciente(ctx, mensagem);
}

/** Open question + no matching option: repeat it, or hand over on the 3rd wrong answer in a row. */
async function tratarRespostaErrada(
  ctx: MutationCtx,
  telefone: string,
  pergunta: Pergunta,
  cancelarPergunta: boolean
) {
  const conversa = await buscarConversa(ctx, telefone);
  // The product logic may already have asked a different question: then there is nothing to do.
  if (
    !conversa?.perguntaAtual ||
    JSON.stringify(conversa.perguntaAtual) !== JSON.stringify(pergunta)
  ) {
    return;
  }
  const tentativasErradas = (conversa.tentativasErradas ?? 0) + 1;
  if (cancelarPergunta || tentativasErradas >= MAX_TENTATIVAS_ERRADAS) {
    await ctx.db.patch('canalConversas', conversa._id, {
      perguntaAtual: undefined,
      tentativasErradas: undefined,
    });
    if (!cancelarPergunta) {
      await encaminharParaEquipe(ctx, telefone);
    }
    return;
  }
  await ctx.db.patch('canalConversas', conversa._id, { tentativasErradas });
  await repetirPergunta(ctx, telefone, pergunta);
}

/**
 * The bot gives up on a question (3 wrong answers in a row): tells the patient a person will
 * take over and sends the guide on how to use the service again (when CANAL_CARTILHA_URL is set).
 * The case then goes to the team queue (convex/triagem.ts).
 */
async function encaminharParaEquipe(ctx: MutationCtx, telefone: string) {
  const { cartilhaUrl, cartilhaNome } = configuracao();
  const mensagens: MensagemSaida[] = [{ tipo: 'texto', texto: MENSAGEM_EQUIPE_VAI_AJUDAR }];
  if (cartilhaUrl) {
    const cartilha: MensagemSaida = {
      tipo: 'midia',
      midia: 'documento',
      url: cartilhaUrl,
      legenda: 'Cartilha: como usar o atendimento por aqui',
      nomeArquivo: cartilhaNome,
    };
    try {
      validarMensagem(cartilha);
      mensagens.push(cartilha);
    } catch {
      // A wrong setting must not stop the patient's message from being handled.
      console.error('[canal] CANAL_CARTILHA_URL inválida: cartilha não enviada');
    }
  }
  await agendarEmSequenciaDoRobo(ctx, telefone, mensagens);
  // The case goes to the team queue with the alert "o robô não entendeu".
  await registrarQueRoboNaoEntendeu(ctx, telefone);
  logarSimulado('[canal] conversa precisa da equipe', { telefone });
}

/** Robot messages that must arrive in this order; each is also kept in the conversation history. */
async function agendarEmSequenciaDoRobo(
  ctx: MutationCtx,
  telefone: string,
  mensagens: MensagemSaida[]
) {
  for (const mensagem of mensagens) {
    validarMensagem(mensagem);
    await registrarMensagemEnviada(ctx, telefone, textoParaHistorico(mensagem), { tipo: 'robo' });
  }
  await ctx.scheduler.runAfter(0, internal.canal.entregarEmSequencia, { telefone, mensagens });
}

/** True while no WhatsApp token is configured (nothing is really sent). */
export const estaEmModoSimulado = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async () => configuracao().simulado,
});

/** Whether the patient has a question with options waiting for her answer. */
export const temPerguntaAberta = internalQuery({
  args: { telefone: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const conversa = await ctx.db
      .query('canalConversas')
      .withIndex('by_telefone', (q) => q.eq('telefone', args.telefone))
      .unique();
    return conversa?.perguntaAtual !== undefined;
  },
});

/**
 * Which option an answer picks for the open question, or `null`.
 * A tap counts only if it is an option of this question (not a button from an older message).
 */
function escolherOpcao(pergunta: Pergunta, texto: string, idEscolhido: string | null) {
  if (idEscolhido !== null) {
    return pergunta.opcoes.some((opcao) => opcao.id === idEscolhido) ? idEscolhido : null;
  }
  return resolverOpcaoDigitada(texto, pergunta.opcoes, {
    tolerarErroDeDigitacao: configuracao().tolerarErroDeDigitacao,
  });
}

/** Sends the open question again, starting with "Não entendi…". The window is open: she just wrote. */
async function repetirPergunta(ctx: MutationCtx, telefone: string, pergunta: Pergunta) {
  const comAviso = `${MENSAGEM_NAO_ENTENDI}\n\n${pergunta.texto}`;
  // One message (not two) so the warning can never arrive after the question.
  const texto = comAviso.length <= LIMITES.corpoInterativo ? comAviso : pergunta.texto;
  await agendarEmSequenciaDoRobo(ctx, telefone, [{ ...pergunta, texto }]);
}

// ---------------------------------------------------------------------------
// Matching a typed answer to the last menu
// ---------------------------------------------------------------------------

/**
 * Turns what the patient typed into an option ID of the open question.
 * Accepts the option number ("2", "2.", "opção 2"), the number in words ("dois", "segunda") or
 * the exact option name, ignoring accents, case and punctuation ("INSONIA" = "Insônia"). With `tolerarErroDeDigitacao` it also accepts a
 * small typo ("ansieade") when only one option is that close — off unless the team approves it.
 */
export function resolverOpcaoDigitada(
  texto: string,
  menu: OpcaoMenu[] | undefined,
  { tolerarErroDeDigitacao = false }: { tolerarErroDeDigitacao?: boolean } = {}
): string | null {
  if (!menu || menu.length === 0) return null;

  const numero = /^\s*(?:(?:op[cç][aã]o|n[uú]mero|resposta)\s*)?(\d{1,2})\s*[.):ºª°-]?\s*$/i.exec(
    texto
  );
  if (numero) {
    const indice = Number(numero[1]) - 1;
    return menu[indice]?.id ?? null;
  }

  const digitado = normalizarTexto(texto);
  if (!digitado) return null;

  const exatas = menu.filter((opcao) => normalizarTexto(opcao.titulo) === digitado);
  if (exatas.length === 1) return exatas[0].id;
  if (exatas.length > 1) return null;

  // Number written in words: "dois" = "2", "segunda" = "2", "opção três" = "3".
  const porExtenso = numeroPorExtenso(digitado);
  if (porExtenso !== null) {
    const escolhida = menu[porExtenso - 1];
    if (!escolhida) return null;
    // "uma" could also be the start of the option "Uma vez": ambiguous, ask again.
    const palavra = digitado.split(' ').at(-1) ?? '';
    const ambigua = menu.some(
      (opcao) =>
        opcao.id !== escolhida.id && normalizarTexto(opcao.titulo).split(' ')[0] === palavra
    );
    return ambigua ? null : escolhida.id;
  }
  if (!tolerarErroDeDigitacao) return null;

  const tolerancia = digitado.length >= 8 ? 2 : digitado.length >= 4 ? 1 : 0;
  if (tolerancia === 0) return null;
  const distancias = menu.map((opcao) => ({
    id: opcao.id,
    distancia: distanciaEdicao(digitado, normalizarTexto(opcao.titulo)),
  }));
  const melhor = Math.min(...distancias.map((d) => d.distancia));
  const empatadas = distancias.filter((d) => d.distancia === melhor);
  return melhor <= tolerancia && empatadas.length === 1 ? empatadas[0].id : null;
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  duas: 2,
  segundo: 2,
  segunda: 2,
  tres: 3,
  terceiro: 3,
  terceira: 3,
  quatro: 4,
  quarto: 4,
  quarta: 4,
  cinco: 5,
  quinto: 5,
  quinta: 5,
  seis: 6,
  sexto: 6,
  sexta: 6,
  sete: 7,
  setimo: 7,
  setima: 7,
  oito: 8,
  oitavo: 8,
  oitava: 8,
  nove: 9,
  nono: 9,
  nona: 9,
  dez: 10,
  decimo: 10,
  decima: 10,
};

/** "dois", "opcao dois", "a segunda", "numero 3" (already normalized) → the number, or `null`. */
function numeroPorExtenso(normalizado: string): number | null {
  const correspondencia =
    /^(?:(?:a|o|opcao|numero|resposta)\s+)*(?:(?:a|o)\s+)?([a-z]+)(?:\s+opcao)?$/.exec(normalizado);
  if (!correspondencia) return null;
  return NUMEROS_POR_EXTENSO[correspondencia[1]] ?? null;
}

/** Levenshtein distance between two short strings. */
function distanciaEdicao(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

// ---------------------------------------------------------------------------
// Outgoing: public API for the rest of the backend
// ---------------------------------------------------------------------------

/**
 * Sends text to a patient. Used by the bot and by professionals answering from the site;
 * a professional's message starts with her first name and role, e.g. "*Ana (psicóloga):*".
 */
export const enviarTexto = internalMutation({
  args: { telefone: v.string(), texto: v.string(), remetente: remetenteValidator },
  returns: resultadoEnvioValidator,
  handler: async (ctx, args) => {
    let texto = args.texto.trim();
    if (args.remetente.tipo === 'profissional') {
      const primeiroNome = args.remetente.nome.trim().split(/\s+/)[0] ?? '';
      const funcao = args.remetente.funcao.trim();
      if (!primeiroNome || !funcao) {
        throw new ConvexError('Informe o nome e a função de quem está respondendo.');
      }
      texto = `*${primeiroNome} (${funcao}):*\n${texto}`;
    }
    const remetente =
      args.remetente.tipo === 'profissional'
        ? { tipo: 'profissional' as const, usuarioId: args.remetente.usuarioId }
        : { tipo: 'robo' as const };
    return await enviarOuGuardar(ctx, args.telefone, { tipo: 'texto', texto }, remetente);
  },
});

/** Sends a message with up to 3 reply buttons. */
export const enviarBotoes = internalMutation({
  args: { telefone: v.string(), texto: v.string(), opcoes: v.array(opcaoMenuValidator) },
  returns: resultadoEnvioValidator,
  handler: async (ctx, args) => {
    return await enviarOuGuardar(ctx, args.telefone, {
      tipo: 'botoes',
      texto: args.texto.trim(),
      opcoes: args.opcoes,
    });
  },
});

/** Sends a list menu with up to 10 options, opened by a button labelled `textoBotao`. */
export const enviarLista = internalMutation({
  args: {
    telefone: v.string(),
    texto: v.string(),
    textoBotao: v.string(),
    opcoes: v.array(opcaoMenuValidator),
  },
  returns: resultadoEnvioValidator,
  handler: async (ctx, args) => {
    return await enviarOuGuardar(ctx, args.telefone, {
      tipo: 'lista',
      texto: args.texto.trim(),
      textoBotao: args.textoBotao.trim(),
      opcoes: args.opcoes,
    });
  },
});

/** Sends a document (PDF, etc.) or a video from a public link. */
export const enviarMidia = internalMutation({
  args: {
    telefone: v.string(),
    midia: v.union(v.literal('documento'), v.literal('video')),
    url: v.string(),
    legenda: v.optional(v.string()),
    nomeArquivo: v.optional(v.string()),
  },
  returns: resultadoEnvioValidator,
  handler: async (ctx, args) => {
    const { telefone, ...midia } = args;
    return await enviarOuGuardar(ctx, telefone, { tipo: 'midia', ...midia });
  },
});

// ---------------------------------------------------------------------------
// Outgoing: 24h window, pending messages and delivery
// ---------------------------------------------------------------------------

async function enviarOuGuardar(
  ctx: MutationCtx,
  telefoneInformado: string,
  mensagem: MensagemSaida,
  remetente: RemetenteSaida = { tipo: 'robo' }
): Promise<Infer<typeof resultadoEnvioValidator>> {
  const telefone = validarTelefone(telefoneInformado);
  validarMensagem(mensagem);
  // Kept in the history when it is sent, even if it waits for the 24h window to reopen.
  await registrarMensagemEnviada(ctx, telefone, textoParaHistorico(mensagem), remetente);

  const conversa = await buscarConversa(ctx, telefone);
  const agora = Date.now();
  const janelaAberta =
    conversa !== null && agora - conversa.ultimaMensagemPacienteEm < JANELA_RESPOSTA_MS;

  if (janelaAberta) {
    await agendarEntrega(ctx, conversa, telefone, mensagem);
    return { situacao: 'enviada' };
  }

  // Window closed: keep the message and send the approved template once, so the patient
  // knows there is a reply waiting. Everything goes out when she writes back.
  const jaAvisada = await ctx.db
    .query('canalMensagensPendentes')
    .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
    .first();
  await ctx.db.insert('canalMensagensPendentes', { telefone, mensagem, criadaEm: agora });
  if (!jaAvisada) {
    // Kept in the history too, so the team sees that she was notified.
    await registrarMensagemEnviada(ctx, telefone, TEXTO_MODELO_AVISO, { tipo: 'robo' });
    await ctx.scheduler.runAfter(0, internal.canal.entregarAviso, { telefone });
  }
  return { situacao: 'aguardando_paciente' };
}

async function enviarPendentes(ctx: MutationCtx, telefone: string) {
  const pendentes = await ctx.db
    .query('canalMensagensPendentes')
    .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
    .take(50);
  for (const pendente of pendentes) {
    const conversa = await buscarConversa(ctx, telefone);
    await agendarEntrega(ctx, conversa, telefone, pendente.mensagem);
    await ctx.db.delete('canalMensagensPendentes', pendente._id);
  }
}

/**
 * Schedules delivery. A new question (buttons or list) becomes the open question, so a typed
 * "2" or "insônia" can be matched, and its wrong-answer count starts over.
 */
async function agendarEntrega(
  ctx: MutationCtx,
  conversa: Doc<'canalConversas'> | null,
  telefone: string,
  mensagem: MensagemSaida
) {
  if (conversa && (mensagem.tipo === 'botoes' || mensagem.tipo === 'lista')) {
    await ctx.db.patch('canalConversas', conversa._id, {
      perguntaAtual: mensagem,
      tentativasErradas: 0,
    });
  }
  await ctx.scheduler.runAfter(0, internal.canal.entregar, { telefone, mensagem });
}

export const entregar = internalAction({
  args: { telefone: v.string(), mensagem: mensagemSaidaValidator },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await chamarCloudApi(args.telefone, conteudoWhatsApp(args.mensagem));
    return null;
  },
});

/** Sends several messages one after the other, so they arrive in this order. */
export const entregarEmSequencia = internalAction({
  args: { telefone: v.string(), mensagens: v.array(mensagemSaidaValidator) },
  returns: v.null(),
  handler: async (_ctx, args) => {
    for (const mensagem of args.mensagens) {
      await chamarCloudApi(args.telefone, conteudoWhatsApp(mensagem));
    }
    return null;
  },
});

/** Readable version of an outgoing message for the conversation history on the site. */
function textoParaHistorico(mensagem: MensagemSaida): string {
  switch (mensagem.tipo) {
    case 'texto':
      return mensagem.texto;
    case 'botoes':
    case 'lista':
      return [
        mensagem.texto,
        ...mensagem.opcoes.map((opcao, indice) => `${indice + 1}. ${opcao.titulo}`),
      ].join('\n');
    case 'midia': {
      const rotulo = mensagem.midia === 'documento' ? 'Documento' : 'Vídeo';
      const detalhe = mensagem.legenda ?? mensagem.nomeArquivo ?? mensagem.url;
      return `[${rotulo}] ${detalhe}`;
    }
  }
}

export const entregarAviso = internalAction({
  args: { telefone: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const { templateAviso, idiomaTemplate } = configuracao();
    await chamarCloudApi(args.telefone, {
      type: 'template',
      template: { name: templateAviso, language: { code: idiomaTemplate } },
    });
    return null;
  },
});

/** Converts a provider-neutral message into the Cloud API `messages` payload fields. */
function conteudoWhatsApp(mensagem: MensagemSaida): Record<string, unknown> {
  switch (mensagem.tipo) {
    case 'texto':
      return { type: 'text', text: { body: mensagem.texto, preview_url: false } };
    case 'botoes':
      return {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: mensagem.texto },
          action: {
            buttons: mensagem.opcoes.map((opcao) => ({
              type: 'reply',
              reply: { id: opcao.id, title: opcao.titulo },
            })),
          },
        },
      };
    case 'lista':
      return {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: mensagem.texto },
          action: {
            button: mensagem.textoBotao,
            sections: [
              {
                rows: mensagem.opcoes.map((opcao) => ({
                  id: opcao.id,
                  title: opcao.titulo,
                  ...(opcao.descricao ? { description: opcao.descricao } : {}),
                })),
              },
            ],
          },
        },
      };
    case 'midia':
      if (mensagem.midia === 'documento') {
        return {
          type: 'document',
          document: {
            link: mensagem.url,
            ...(mensagem.legenda ? { caption: mensagem.legenda } : {}),
            ...(mensagem.nomeArquivo ? { filename: mensagem.nomeArquivo } : {}),
          },
        };
      }
      return {
        type: 'video',
        video: { link: mensagem.url, ...(mensagem.legenda ? { caption: mensagem.legenda } : {}) },
      };
  }
}

async function chamarCloudApi(telefone: string, conteudo: Record<string, unknown>) {
  const config = configuracao();
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    ...conteudo,
  };

  if (config.simulado) {
    console.log('[canal:simulado] enviaria', JSON.stringify(payload));
    return;
  }

  const response = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send WhatsApp message: ${response.status} ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Validation and helpers
// ---------------------------------------------------------------------------

function validarTelefone(telefone: string): string {
  const digitos = somenteDigitos(telefone);
  if (digitos.length < 10 || digitos.length > 15) {
    throw new ConvexError('Telefone inválido: use DDI + DDD + número, por exemplo 5511999998888.');
  }
  return digitos;
}

function validarMensagem(mensagem: MensagemSaida) {
  switch (mensagem.tipo) {
    case 'texto':
      exigirTexto(mensagem.texto, LIMITES.texto, 'A mensagem');
      return;
    case 'botoes':
      exigirTexto(mensagem.texto, LIMITES.corpoInterativo, 'O texto acima dos botões');
      validarOpcoes(mensagem.opcoes, LIMITES.botoes, LIMITES.tituloBotao, 'botões');
      return;
    case 'lista':
      exigirTexto(mensagem.texto, LIMITES.corpoInterativo, 'O texto da lista');
      exigirTexto(mensagem.textoBotao, LIMITES.textoBotaoLista, 'O texto do botão da lista');
      validarOpcoes(mensagem.opcoes, LIMITES.opcoesLista, LIMITES.tituloLinhaLista, 'opções');
      for (const opcao of mensagem.opcoes) {
        if (opcao.descricao && opcao.descricao.length > LIMITES.descricaoLinhaLista) {
          throw new ConvexError(
            `A descrição de "${opcao.titulo}" passa de ${LIMITES.descricaoLinhaLista} letras.`
          );
        }
      }
      return;
    case 'midia': {
      let url: URL;
      try {
        url = new URL(mensagem.url);
      } catch {
        throw new ConvexError('O link do arquivo não é válido.');
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new ConvexError('O link do arquivo precisa começar com https://.');
      }
      if (mensagem.legenda && mensagem.legenda.length > LIMITES.legenda) {
        throw new ConvexError(`A legenda passa de ${LIMITES.legenda} letras.`);
      }
      return;
    }
  }
}

function validarOpcoes(opcoes: OpcaoMenu[], maximo: number, maxTitulo: number, nome: string) {
  if (opcoes.length === 0 || opcoes.length > maximo) {
    throw new ConvexError(`Use de 1 a ${maximo} ${nome}.`);
  }
  const ids = new Set<string>();
  for (const opcao of opcoes) {
    exigirTexto(opcao.titulo, maxTitulo, `O título "${opcao.titulo}"`);
    if (!opcao.id || opcao.id.length > LIMITES.idOpcao || ids.has(opcao.id)) {
      throw new ConvexError(`Cada opção precisa de um id único (problema em "${opcao.titulo}").`);
    }
    ids.add(opcao.id);
  }
}

function exigirTexto(texto: string, maximo: number, nome: string) {
  if (!texto.trim()) {
    throw new ConvexError(`${nome} não pode ficar vazio.`);
  }
  if (texto.length > maximo) {
    throw new ConvexError(`${nome} passa de ${maximo} letras.`);
  }
}

async function buscarConversa(ctx: MutationCtx, telefone: string) {
  return await ctx.db
    .query('canalConversas')
    .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
    .unique();
}

async function assinaturaValida(corpo: ArrayBuffer, assinatura: string | null, segredo: string) {
  if (!assinatura?.startsWith('sha256=')) return false;
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', chave, corpo));
  const esperado = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  const recebido = assinatura.slice('sha256='.length).toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diferenca === 0;
}

function isRecord(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function textoOu(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

function somenteDigitos(valor: string): string {
  return valor.replace(/\D+/g, '');
}
