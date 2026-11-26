/**
 * Patients, hospital link, crisis check, consent and the conversation history the hospital team
 * reads on the site.
 *
 * - The channel (`convex/canal.ts`) calls `receberMensagemDaPaciente` for every incoming message
 *   and `registrarMensagemEnviada` for every outgoing one, using only provider-neutral data.
 * - Order for each incoming message: risk words → "apagar meus dados" → link to a hospital →
 *   consent term → store the text.
 * - Text is stored only after the patient accepted the current consent term. Before that, only
 *   her phone number (and hospital, once known) is kept.
 * - Each hospital (organization) sees only its own patients. There is no central team.
 * - Hospital codes, risk words and consent terms are data (tables), edited with the internal
 *   functions at the end of this file — not hard-coded.
 */
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { MensagemRecebida, ResultadoRecebimento } from './canal';
import { requireUserId } from './lib/auth';
import { tenantsClient } from './lib/tenantsClient';
import { normalizarTexto } from './lib/texto';
import { depoisDoAceite, registrarPalavraDeRisco, tratarMensagemDepoisDoAceite } from './triagem';

export const OPCAO_TERMO_ACEITO = 'termo_aceito';
export const OPCAO_TERMO_RECUSADO = 'termo_recusado';
const PREFIXO_OPCAO_HOSPITAL = 'hospital:';

/**
 * Ready-made message of the hospital's wa.me link / QR code. The code must stay a separate word:
 * that is how the first message links the patient to the hospital (identificarHospital).
 */
export function mensagemDoLink(codigo: string) {
  return `Oi, sou uma paciente do ${codigo}`;
}

/** Words of the link message itself can never be a hospital code (they are in every message). */
const PALAVRAS_DA_MENSAGEM_DO_LINK = new Set(normalizarTexto(mensagemDoLink('')).split(' '));

export const MENSAGEM_CRISE =
  'Se você está em perigo ou pensando em tirar a própria vida, procure ajuda agora: ligue 188 (CVV, gratuito, 24 horas) ou 192 (SAMU). Você não precisa passar por isso sem ajuda.';
const MENSAGEM_RECUSA =
  'Tudo bem. Sem o seu aceite não conseguimos continuar o atendimento por aqui. Se mudar de ideia, é só mandar uma mensagem.';
const MENSAGEM_EXCLUSAO_PEDIDA =
  'Recebemos seu pedido para apagar seus dados. A equipe do hospital vai concluir o pedido; você não precisa fazer mais nada.';
const PERGUNTA_HOSPITAL = 'Em qual hospital você faz tratamento?';
const TEXTO_SEM_CONTEUDO = '[mensagem sem texto: áudio, imagem ou outro arquivo]';

/** Typed requests that mean "delete my data" (compared without accents/case/punctuation). */
const PEDIDOS_DE_EXCLUSAO = ['apagar meus dados', 'apague meus dados', 'excluir meus dados'];

/** Largest consent text that fits in the WhatsApp question with the two buttons. */
const MAX_TEXTO_TERMO = 1024;
/** A WhatsApp list shows at most 10 options; each title has at most 24 characters. */
const MAX_HOSPITAIS_NA_PERGUNTA = 10;
const MAX_TITULO_OPCAO_LISTA = 24;
const MAX_HOSPITAIS = 100;
const MAX_PALAVRAS_DE_RISCO = 500;
const LOTE_EXCLUSAO = 100;

const SEM_CANCELAR: ResultadoRecebimento = { cancelarPergunta: false };
const CANCELAR: ResultadoRecebimento = { cancelarPergunta: true };

export type RemetenteSaida = { tipo: 'robo' } | { tipo: 'profissional'; usuarioId?: Id<'users'> };

// ---------------------------------------------------------------------------
// Called by the channel
// ---------------------------------------------------------------------------

/** Every incoming patient message passes here (after the channel matched menu answers). */
export async function receberMensagemDaPaciente(
  ctx: MutationCtx,
  mensagem: MensagemRecebida
): Promise<ResultadoRecebimento> {
  let paciente = await obterOuCriarPaciente(ctx, mensagem.telefone);
  const textoNormalizado = normalizarTexto(mensagem.texto);
  const consentiu = await temConsentimentoAtual(ctx, paciente);

  // 1. Risk words come first, even before the consent term.
  if (await contemPalavraDeRisco(ctx, textoNormalizado)) {
    await ctx.db.insert('alertasCrise', {
      telefone: paciente.telefone,
      ...(paciente.organizationId ? { organizationId: paciente.organizationId } : {}),
      criadoEm: Date.now(),
    });
    if (consentiu) {
      await guardarMensagemDaPaciente(ctx, paciente, mensagem.texto);
    }
    await enviarTextoDoRobo(ctx, paciente.telefone, MENSAGEM_CRISE);
    // The case becomes urgent in the team queue (and an open check-in stops here).
    await registrarPalavraDeRisco(ctx, paciente);
    return CANCELAR;
  }

  // 2. Works before consent too: the request itself is not stored as conversation text.
  if (PEDIDOS_DE_EXCLUSAO.includes(textoNormalizado)) {
    if (!paciente.exclusaoPedidaEm) {
      await ctx.db.patch('pacientes', paciente._id, { exclusaoPedidaEm: Date.now() });
    }
    await enviarTextoDoRobo(ctx, paciente.telefone, MENSAGEM_EXCLUSAO_PEDIDA);
    return CANCELAR;
  }

  // 3. Link to a hospital: code in the message, answer to the question, or the only hospital.
  if (!paciente.organizationId) {
    const organizationId = await identificarHospital(ctx, textoNormalizado, mensagem);
    if (!organizationId) {
      return SEM_CANCELAR;
    }
    paciente = await ligarAoHospital(ctx, paciente, organizationId);
  }

  // 4. Consent term.
  const termo = await termoAtual(ctx);
  if (!termo) {
    console.warn('[pacientes] nenhum termo de consentimento publicado: mensagem não guardada');
    return SEM_CANCELAR;
  }
  if (paciente.consentimento?.versaoTermo !== termo.versao) {
    await tratarConsentimento(ctx, paciente, termo, mensagem);
    return SEM_CANCELAR;
  }

  // 5. Consented: keep the text for the hospital team, then the triage flow (convex/triagem.ts).
  await guardarMensagemDaPaciente(ctx, paciente, mensagem.texto);
  await tratarMensagemDepoisDoAceite(ctx, paciente, mensagem);
  return SEM_CANCELAR;
}

/** Every outgoing message passes here; it is stored only if the patient consented. */
export async function registrarMensagemEnviada(
  ctx: MutationCtx,
  telefone: string,
  texto: string,
  remetente: RemetenteSaida
) {
  const paciente = await buscarPacientePorTelefone(ctx, telefone);
  if (!paciente || !(await temConsentimentoAtual(ctx, paciente))) {
    return;
  }
  await ctx.db.insert('mensagensConversa', {
    pacienteId: paciente._id,
    direcao: 'saida',
    texto,
    remetente: remetente.tipo,
    ...(remetente.tipo === 'profissional' && remetente.usuarioId
      ? { profissionalId: remetente.usuarioId }
      : {}),
    enviadaEm: Date.now(),
  });
}

async function guardarMensagemDaPaciente(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  texto: string
) {
  await ctx.db.insert('mensagensConversa', {
    pacienteId: paciente._id,
    direcao: 'entrada',
    texto: texto || TEXTO_SEM_CONTEUDO,
    remetente: 'paciente',
    enviadaEm: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Hospital link
// ---------------------------------------------------------------------------

/**
 * Which hospital this message links the patient to, or `null` (then the question was asked,
 * is still open, or there is no hospital registered).
 */
async function identificarHospital(
  ctx: MutationCtx,
  textoNormalizado: string,
  mensagem: MensagemRecebida
): Promise<string | null> {
  const hospitais = await ctx.db.query('hospitais').take(MAX_HOSPITAIS);
  if (hospitais.length === 0) {
    console.warn('[pacientes] nenhum hospital cadastrado: paciente não pode ser atendida');
    return null;
  }

  // A known code anywhere in the message, as a whole word ("Oi, sou uma paciente do ACC").
  const palavras = new Set(textoNormalizado.split(' '));
  const porCodigo = hospitais.find((hospital) => palavras.has(normalizarTexto(hospital.codigo)));
  if (porCodigo) return porCodigo.organizationId;

  // Answer to "Em qual hospital você faz tratamento?".
  if (mensagem.opcaoEscolhida?.startsWith(PREFIXO_OPCAO_HOSPITAL)) {
    const escolhido = mensagem.opcaoEscolhida.slice(PREFIXO_OPCAO_HOSPITAL.length);
    if (hospitais.some((hospital) => hospital.organizationId === escolhido)) return escolhido;
  }

  if (hospitais.length === 1) return hospitais[0].organizationId;

  // More than one hospital and no code: ask (unless the question is already open — then the
  // channel has just repeated it).
  const perguntaAberta: boolean = await ctx.runQuery(internal.canal.temPerguntaAberta, {
    telefone: mensagem.telefone,
  });
  if (!perguntaAberta) {
    const opcoes = await Promise.all(
      hospitais.slice(0, MAX_HOSPITAIS_NA_PERGUNTA).map(async (hospital) => ({
        id: `${PREFIXO_OPCAO_HOSPITAL}${hospital.organizationId}`,
        titulo: limitar(await nomeDoHospital(ctx, hospital), MAX_TITULO_OPCAO_LISTA),
      }))
    );
    await ctx.runMutation(internal.canal.enviarLista, {
      telefone: mensagem.telefone,
      texto: PERGUNTA_HOSPITAL,
      textoBotao: 'Ver hospitais',
      opcoes,
    });
  }
  return null;
}

async function ligarAoHospital(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  organizationId: string
): Promise<Doc<'pacientes'>> {
  await ctx.db.patch('pacientes', paciente._id, { organizationId });
  // Crisis alerts sent before she chose a hospital now show up for that hospital.
  const alertasSemHospital = await ctx.db
    .query('alertasCrise')
    .withIndex('by_telefone', (q) => q.eq('telefone', paciente.telefone))
    .take(LOTE_EXCLUSAO);
  for (const alerta of alertasSemHospital) {
    if (!alerta.organizationId) {
      await ctx.db.patch('alertasCrise', alerta._id, { organizationId });
    }
  }
  return { ...paciente, organizationId };
}

/** Organization name, or the code if it cannot be read (e.g. the organization was removed). */
async function nomeDoHospital(ctx: QueryCtx | MutationCtx, hospital: Doc<'hospitais'>) {
  try {
    const organizacao = await tenantsClient.getOrganization(ctx, hospital.organizationId);
    return organizacao?.name ?? hospital.codigo;
  } catch {
    return hospital.codigo;
  }
}

function limitar(texto: string, maximo: number) {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

// ---------------------------------------------------------------------------
// Risk words
// ---------------------------------------------------------------------------

async function contemPalavraDeRisco(ctx: MutationCtx, textoNormalizado: string) {
  if (!textoNormalizado) return false;
  const palavras = await ctx.db.query('palavrasDeRisco').take(MAX_PALAVRAS_DE_RISCO);
  const comEspacos = ` ${textoNormalizado} `;
  // Whole words or phrases only: "morrer" matches "quero morrer", not "morrerão".
  return palavras.some((palavra) => comEspacos.includes(` ${palavra.termo} `));
}

// ---------------------------------------------------------------------------
// Consent term
// ---------------------------------------------------------------------------

async function tratarConsentimento(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  termo: Doc<'termosConsentimento'>,
  mensagem: MensagemRecebida
) {
  if (mensagem.opcaoEscolhida === OPCAO_TERMO_ACEITO) {
    const consentimento = { versaoTermo: termo.versao, aceitoEm: Date.now() };
    await ctx.db.patch('pacientes', paciente._id, { consentimento });
    // Thanks her and starts the sign-up (or just continues if she was already signed up).
    await depoisDoAceite(ctx, { ...paciente, consentimento });
    return;
  }
  if (mensagem.opcaoEscolhida === OPCAO_TERMO_RECUSADO) {
    await enviarTextoDoRobo(ctx, paciente.telefone, MENSAGEM_RECUSA);
    return;
  }
  // If the term question is already open, the channel has just repeated it.
  const perguntaAberta: boolean = await ctx.runQuery(internal.canal.temPerguntaAberta, {
    telefone: paciente.telefone,
  });
  if (!perguntaAberta) {
    await ctx.runMutation(internal.canal.enviarBotoes, {
      telefone: paciente.telefone,
      texto: termo.texto,
      opcoes: [
        { id: OPCAO_TERMO_ACEITO, titulo: 'Aceito' },
        { id: OPCAO_TERMO_RECUSADO, titulo: 'Não aceito' },
      ],
    });
  }
}

async function termoAtual(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query('termosConsentimento')
    .withIndex('by_publicadoEm')
    .order('desc')
    .first();
}

export async function temConsentimentoAtual(
  ctx: QueryCtx | MutationCtx,
  paciente: Doc<'pacientes'>
) {
  const termo = await termoAtual(ctx);
  return termo !== null && paciente.consentimento?.versaoTermo === termo.versao;
}

async function enviarTextoDoRobo(ctx: MutationCtx, telefone: string, texto: string) {
  await ctx.runMutation(internal.canal.enviarTexto, {
    telefone,
    texto,
    remetente: { tipo: 'robo' },
  });
}

// ---------------------------------------------------------------------------
// Site: hospital team (members of the organization only)
// ---------------------------------------------------------------------------

/** The hospital's patients, newest first. */
export const listarPacientes = query({
  args: { organizationId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const pagina = await ctx.db
      .query('pacientes')
      .withIndex('by_organizationId', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .paginate(args.paginationOpts);
    return { ...pagina, page: pagina.page.map(resumoDaPaciente) };
  },
});

/** Conversation of one patient of the hospital, newest first. */
export const listarMensagens = query({
  args: { pacienteId: v.id('pacientes'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAcessoAPaciente(ctx, args.pacienteId);
    return await ctx.db
      .query('mensagensConversa')
      .withIndex('by_pacienteId_and_enviadaEm', (q) => q.eq('pacienteId', args.pacienteId))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

/** Crisis alerts of the hospital, newest first: phone and time only. */
export const listarAlertasDeCrise = query({
  args: { organizationId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const pagina = await ctx.db
      .query('alertasCrise')
      .withIndex('by_organizationId_and_criadoEm', (q) =>
        q.eq('organizationId', args.organizationId)
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...pagina,
      page: pagina.page.map((alerta) => ({
        _id: alerta._id,
        telefone: alerta.telefone,
        criadoEm: alerta.criadoEm,
      })),
    };
  },
});

/** Patients of the hospital who asked to have their data deleted. */
export const listarPedidosDeExclusao = query({
  args: { organizationId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const pagina = await ctx.db
      .query('pacientes')
      .withIndex('by_organizationId_and_exclusaoPedidaEm', (q) =>
        q.eq('organizationId', args.organizationId).gt('exclusaoPedidaEm', 0)
      )
      .paginate(args.paginationOpts);
    return { ...pagina, page: pagina.page.map(resumoDaPaciente) };
  },
});

/**
 * Hospital team confirms a patient's request to delete her data. Her record disappears at once;
 * her messages, alerts and channel data are removed in batches right after. Only a minimal record
 * (hospital, who deleted, when) is kept.
 */
export const apagarDadosDaPaciente = mutation({
  args: { pacienteId: v.id('pacientes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { paciente, userId } = await requireAcessoAPaciente(ctx, args.pacienteId);
    if (!paciente.exclusaoPedidaEm) {
      throw new ConvexError('Esta paciente não pediu para apagar os dados.');
    }
    await ctx.db.insert('exclusoesRealizadas', {
      organizationId: paciente.organizationId,
      apagadoPor: userId,
      apagadoEm: Date.now(),
    });
    await ctx.db.delete('pacientes', paciente._id);
    await ctx.scheduler.runAfter(0, internal.pacientes.apagarRestoDosDados, {
      pacienteId: paciente._id,
      telefone: paciente.telefone,
    });
    return null;
  },
});

export const apagarRestoDosDados = internalMutation({
  args: { pacienteId: v.id('pacientes'), telefone: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { telefone } = args;
    const lotes = await Promise.all([
      ctx.db
        .query('mensagensConversa')
        .withIndex('by_pacienteId_and_enviadaEm', (q) => q.eq('pacienteId', args.pacienteId))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('alertasCrise')
        .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('canalMensagensRecebidas')
        .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('canalMensagensPendentes')
        .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('canalConversas')
        .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('checkins')
        .withIndex('by_pacienteId_and_iniciadoEm', (q) => q.eq('pacienteId', args.pacienteId))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('alertasPaciente')
        .withIndex('by_pacienteId_and_criadoEm', (q) => q.eq('pacienteId', args.pacienteId))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('eventosCaso')
        .withIndex('by_pacienteId_and_em', (q) => q.eq('pacienteId', args.pacienteId))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('avisosEquipe')
        .withIndex('by_pacienteId', (q) => q.eq('pacienteId', args.pacienteId))
        .take(LOTE_EXCLUSAO),
    ]);
    for (const documento of lotes.flat()) {
      await ctx.db.delete(documento._id);
    }
    if (lotes.some((lote) => lote.length === LOTE_EXCLUSAO)) {
      await ctx.scheduler.runAfter(0, internal.pacientes.apagarRestoDosDados, args);
    }
    return null;
  },
});

function resumoDaPaciente(paciente: Doc<'pacientes'>) {
  return {
    _id: paciente._id,
    telefone: paciente.telefone,
    criadaEm: paciente.criadaEm,
    aceitouTermo: paciente.consentimento !== undefined,
    exclusaoPedidaEm: paciente.exclusaoPedidaEm ?? null,
  };
}

export async function requireMembroDoHospital(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const userId = await requireUserId(ctx);
  const membro = await tenantsClient.getMember(ctx, organizationId, userId);
  if (!membro) {
    throw new ConvexError('Você não faz parte deste hospital.');
  }
  return userId;
}

/** Only members of the patient's hospital; a patient with no hospital yet is seen by no one. */
export async function requireAcessoAPaciente(
  ctx: QueryCtx | MutationCtx,
  pacienteId: Id<'pacientes'>
) {
  const paciente = await ctx.db.get('pacientes', pacienteId);
  if (!paciente?.organizationId) {
    throw new ConvexError('Paciente não encontrada.');
  }
  const userId = await requireMembroDoHospital(ctx, paciente.organizationId);
  return { paciente: { ...paciente, organizationId: paciente.organizationId }, userId };
}

// ---------------------------------------------------------------------------
// Data editing (run from the terminal until there are screens for it)
// ---------------------------------------------------------------------------

/**
 * Registers a hospital for the bot, or changes its code.
 *   npx convex run pacientes:definirCodigoDoHospital '{"organizationId":"...","codigo":"ACC"}'
 */
export const definirCodigoDoHospital = internalMutation({
  args: { organizationId: v.string(), codigo: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const codigo = args.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(codigo)) {
      throw new ConvexError('O código deve ter de 2 a 10 letras ou números, sem espaços.');
    }
    if (PALAVRAS_DA_MENSAGEM_DO_LINK.has(normalizarTexto(codigo))) {
      throw new ConvexError(
        `O código ${codigo} é uma palavra da mensagem do link ("${mensagemDoLink('ACC')}"). Escolha outro.`
      );
    }
    if (!(await tenantsClient.getOrganization(ctx, args.organizationId))) {
      throw new ConvexError('Hospital (organização) não encontrado.');
    }
    const comCodigo = await ctx.db
      .query('hospitais')
      .withIndex('by_codigo', (q) => q.eq('codigo', codigo))
      .unique();
    if (comCodigo && comCodigo.organizationId !== args.organizationId) {
      throw new ConvexError(`O código ${codigo} já é de outro hospital.`);
    }
    const existente = await ctx.db
      .query('hospitais')
      .withIndex('by_organizationId', (q) => q.eq('organizationId', args.organizationId))
      .unique();
    if (existente) {
      await ctx.db.patch('hospitais', existente._id, { codigo });
    } else {
      await ctx.db.insert('hospitais', { organizationId: args.organizationId, codigo });
    }
    return null;
  },
});

/** Registered hospitals with their codes and the message to put in the wa.me link. */
export const listarHospitais = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      organizationId: v.string(),
      nome: v.string(),
      codigo: v.string(),
      mensagemDoLink: v.string(),
    })
  ),
  handler: async (ctx) => {
    const hospitais = await ctx.db.query('hospitais').take(MAX_HOSPITAIS);
    return await Promise.all(
      hospitais.map(async (hospital) => ({
        organizationId: hospital.organizationId,
        nome: await nomeDoHospital(ctx, hospital),
        codigo: hospital.codigo,
        mensagemDoLink: mensagemDoLink(hospital.codigo),
      }))
    );
  },
});

/** Adds a word or phrase to the risk list (stored without accents/case). */
export const adicionarPalavraDeRisco = internalMutation({
  args: { termo: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const termo = normalizarTexto(args.termo);
    if (!termo) {
      throw new ConvexError('Informe a palavra ou frase.');
    }
    const existente = await ctx.db
      .query('palavrasDeRisco')
      .withIndex('by_termo', (q) => q.eq('termo', termo))
      .unique();
    if (!existente) {
      await ctx.db.insert('palavrasDeRisco', { termo, criadaEm: Date.now() });
    }
    return null;
  },
});

export const removerPalavraDeRisco = internalMutation({
  args: { termo: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existente = await ctx.db
      .query('palavrasDeRisco')
      .withIndex('by_termo', (q) => q.eq('termo', normalizarTexto(args.termo)))
      .unique();
    if (existente) {
      await ctx.db.delete('palavrasDeRisco', existente._id);
    }
    return null;
  },
});

/**
 * Publishes a new consent term version; patients must accept it before anything is stored.
 *   npx convex run pacientes:publicarTermo '{"versao":"1","texto":"..."}'
 */
export const publicarTermo = internalMutation({
  args: { versao: v.string(), texto: v.string() },
  returns: v.id('termosConsentimento'),
  handler: async (ctx, args) => {
    const versao = args.versao.trim();
    const texto = args.texto.trim();
    if (!versao || !texto) {
      throw new ConvexError('Informe a versão e o texto do termo.');
    }
    if (texto.length > MAX_TEXTO_TERMO) {
      throw new ConvexError(
        `O texto do termo passa de ${MAX_TEXTO_TERMO} letras. Resuma e coloque o link do termo completo no texto.`
      );
    }
    const existente = await ctx.db
      .query('termosConsentimento')
      .withIndex('by_versao', (q) => q.eq('versao', versao))
      .unique();
    if (existente) {
      throw new ConvexError(`A versão "${versao}" do termo já existe.`);
    }
    return await ctx.db.insert('termosConsentimento', {
      versao,
      texto,
      publicadoEm: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Test data reset
// ---------------------------------------------------------------------------

const CONFIRMACAO_APAGAR_TESTE = 'APAGAR DADOS DE TESTE';
const TABELAS_DE_CONVERSA = [
  'pacientes',
  'mensagensConversa',
  'alertasCrise',
  'exclusoesRealizadas',
  'canalMensagensRecebidas',
  'canalConversas',
  'canalMensagensPendentes',
  'checkins',
  'alertasPaciente',
  'eventosCaso',
  'avisosEquipe',
] as const;
const TABELAS_DE_CONFIGURACAO = [
  'hospitais',
  'palavrasDeRisco',
  'termosConsentimento',
  'escalasTriagem',
] as const;

/**
 * Deletes every patient, message, alert and channel record (and, with `incluirConfiguracao`,
 * hospital codes, risk words and terms). Refuses to run outside simulated mode.
 * Use `pnpm run dados:apagar-teste` instead of calling it by hand.
 */
export const apagarDadosDeTeste = internalMutation({
  args: { confirmar: v.string(), incluirConfiguracao: v.optional(v.boolean()) },
  returns: v.object({ apagados: v.number(), continua: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.confirmar !== CONFIRMACAO_APAGAR_TESTE) {
      throw new ConvexError(`Para confirmar, envie confirmar: "${CONFIRMACAO_APAGAR_TESTE}".`);
    }
    const simulado: boolean = await ctx.runQuery(internal.canal.estaEmModoSimulado, {});
    if (!simulado) {
      throw new ConvexError(
        'O WhatsApp real está ligado: os dados de teste não podem ser apagados assim.'
      );
    }
    const tabelas = [
      ...TABELAS_DE_CONVERSA,
      ...(args.incluirConfiguracao ? TABELAS_DE_CONFIGURACAO : []),
    ];
    let apagados = 0;
    let continua = false;
    for (const tabela of tabelas) {
      const lote = await ctx.db.query(tabela).take(LOTE_EXCLUSAO);
      for (const documento of lote) {
        await ctx.db.delete(documento._id);
      }
      apagados += lote.length;
      continua ||= lote.length === LOTE_EXCLUSAO;
    }
    if (continua) {
      await ctx.scheduler.runAfter(0, internal.pacientes.apagarDadosDeTeste, args);
    }
    return { apagados, continua };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buscarPacientePorTelefone(ctx: QueryCtx | MutationCtx, telefone: string) {
  return await ctx.db
    .query('pacientes')
    .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
    .unique();
}

async function obterOuCriarPaciente(ctx: MutationCtx, telefone: string) {
  const existente = await buscarPacientePorTelefone(ctx, telefone);
  if (existente) return existente;
  const id = await ctx.db.insert('pacientes', { telefone, criadaEm: Date.now() });
  const criada = await ctx.db.get('pacientes', id);
  if (!criada) throw new Error('Failed to create patient');
  return criada;
}
