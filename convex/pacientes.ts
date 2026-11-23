/**
 * Patients, consent and the conversation history the team reads on the site.
 *
 * - The channel (`convex/canal.ts`) calls `receberMensagemDaPaciente` for every incoming message
 *   and `registrarMensagemEnviada` for every outgoing one, using only provider-neutral data.
 * - Text is stored only after the patient accepted the current consent term. Before that, only
 *   her phone number and the fact that she has not accepted yet are kept.
 * - Who sees what: the central team (platform admins) sees only patients with no hospital yet and
 *   routes them; each hospital (organization) sees only its own patients.
 * - Erasure: the patient writes "apagar meus dados"; the central team confirms with
 *   `apagarDadosDaPaciente`, which removes her messages, her record and her channel data.
 */
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { MensagemRecebida } from './canal';
import { requirePlatformAdmin, requireUserId } from './lib/auth';
import { tenantsClient } from './lib/tenantsClient';
import { normalizarTexto } from './lib/texto';

export const OPCAO_TERMO_ACEITO = 'termo_aceito';
export const OPCAO_TERMO_RECUSADO = 'termo_recusado';

const MENSAGEM_ACEITE = 'Obrigado pelo aceite! Vamos continuar.';
const MENSAGEM_RECUSA =
  'Tudo bem. Sem o seu aceite não conseguimos continuar o atendimento por aqui. Se mudar de ideia, é só mandar uma mensagem.';
const MENSAGEM_EXCLUSAO_PEDIDA =
  'Recebemos seu pedido para apagar seus dados. A equipe vai concluir o pedido; você não precisa fazer mais nada.';
const TEXTO_SEM_CONTEUDO = '[mensagem sem texto: áudio, imagem ou outro arquivo]';

/** Typed requests that mean "delete my data" (compared without accents/case/punctuation). */
const PEDIDOS_DE_EXCLUSAO = ['apagar meus dados', 'apague meus dados', 'excluir meus dados'];

/** Largest consent text that fits in the WhatsApp question with the two buttons. */
const MAX_TEXTO_TERMO = 1024;
const LOTE_EXCLUSAO = 100;

export type RemetenteSaida = { tipo: 'robo' } | { tipo: 'profissional'; usuarioId?: Id<'users'> };

// ---------------------------------------------------------------------------
// Called by the channel
// ---------------------------------------------------------------------------

/** Every incoming patient message passes here (after the channel handled menus and retries). */
export async function receberMensagemDaPaciente(ctx: MutationCtx, mensagem: MensagemRecebida) {
  const paciente = await obterOuCriarPaciente(ctx, mensagem.telefone);

  // Works before consent too: the request itself is not stored as conversation text.
  if (PEDIDOS_DE_EXCLUSAO.includes(normalizarTexto(mensagem.texto))) {
    if (!paciente.exclusaoPedidaEm) {
      await ctx.db.patch('pacientes', paciente._id, { exclusaoPedidaEm: Date.now() });
    }
    await enviarTextoDoRobo(ctx, mensagem.telefone, MENSAGEM_EXCLUSAO_PEDIDA);
    return;
  }

  const termo = await termoAtual(ctx);
  if (!termo) {
    console.warn('[pacientes] nenhum termo de consentimento publicado: mensagem não guardada');
    return;
  }

  if (paciente.consentimento?.versaoTermo !== termo.versao) {
    await tratarConsentimento(ctx, paciente, termo, mensagem);
    return;
  }

  await ctx.db.insert('mensagensConversa', {
    pacienteId: paciente._id,
    direcao: 'entrada',
    texto: mensagem.texto || TEXTO_SEM_CONTEUDO,
    remetente: 'paciente',
    enviadaEm: Date.now(),
  });
  // The triage flow (scales and priority) will continue from here.
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

async function tratarConsentimento(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  termo: Doc<'termosConsentimento'>,
  mensagem: MensagemRecebida
) {
  if (mensagem.opcaoEscolhida === OPCAO_TERMO_ACEITO) {
    await ctx.db.patch('pacientes', paciente._id, {
      consentimento: { versaoTermo: termo.versao, aceitoEm: Date.now() },
    });
    await enviarTextoDoRobo(ctx, mensagem.telefone, MENSAGEM_ACEITE);
    return;
  }
  if (mensagem.opcaoEscolhida === OPCAO_TERMO_RECUSADO) {
    await enviarTextoDoRobo(ctx, mensagem.telefone, MENSAGEM_RECUSA);
    return;
  }
  // If the term question is already open, the channel has just repeated it.
  const perguntaAberta: boolean = await ctx.runQuery(internal.canal.temPerguntaAberta, {
    telefone: mensagem.telefone,
  });
  if (!perguntaAberta) {
    await ctx.runMutation(internal.canal.enviarBotoes, {
      telefone: mensagem.telefone,
      texto: termo.texto,
      opcoes: [
        { id: OPCAO_TERMO_ACEITO, titulo: 'Aceito' },
        { id: OPCAO_TERMO_RECUSADO, titulo: 'Não aceito' },
      ],
    });
  }
}

async function enviarTextoDoRobo(ctx: MutationCtx, telefone: string, texto: string) {
  await ctx.runMutation(internal.canal.enviarTexto, {
    telefone,
    texto,
    remetente: { tipo: 'robo' },
  });
}

// ---------------------------------------------------------------------------
// Consent term
// ---------------------------------------------------------------------------

/**
 * Publishes a new consent term version; patients must accept it before anything is stored.
 * Run from the terminal until there is a screen for it:
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

async function termoAtual(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query('termosConsentimento')
    .withIndex('by_publicadoEm')
    .order('desc')
    .first();
}

async function temConsentimentoAtual(ctx: QueryCtx | MutationCtx, paciente: Doc<'pacientes'>) {
  const termo = await termoAtual(ctx);
  return termo !== null && paciente.consentimento?.versaoTermo === termo.versao;
}

// ---------------------------------------------------------------------------
// Site: reading and routing
// ---------------------------------------------------------------------------

/** Central team: patients waiting to be routed to a hospital. */
export const listarSemHospital = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, await requireUserId(ctx));
    const pagina = await ctx.db
      .query('pacientes')
      .withIndex('by_organizationId', (q) => q.eq('organizationId', undefined))
      .order('desc')
      .paginate(args.paginationOpts);
    return { ...pagina, page: pagina.page.map(resumoDaPaciente) };
  },
});

/** Hospital team: its own patients. */
export const listarDoHospital = query({
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

/** Conversation of one patient, newest first. */
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

/** Central team: sends a patient with no hospital to a hospital. */
export const encaminharParaHospital = mutation({
  args: { pacienteId: v.id('pacientes'), organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, await requireUserId(ctx));
    const paciente = await ctx.db.get('pacientes', args.pacienteId);
    if (!paciente) {
      throw new ConvexError('Paciente não encontrada.');
    }
    if (paciente.organizationId) {
      throw new ConvexError('Esta paciente já foi encaminhada para um hospital.');
    }
    if (!(await tenantsClient.getOrganization(ctx, args.organizationId))) {
      throw new ConvexError('Hospital não encontrado.');
    }
    await ctx.db.patch('pacientes', paciente._id, { organizationId: args.organizationId });
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

/** Hospital members only — the central team does not read routed conversations. */
async function requireMembroDoHospital(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const userId = await requireUserId(ctx);
  const membro = await tenantsClient.getMember(ctx, organizationId, userId);
  if (!membro) {
    throw new ConvexError('Você não faz parte deste hospital.');
  }
  return userId;
}

async function requireAcessoAPaciente(ctx: QueryCtx | MutationCtx, pacienteId: Id<'pacientes'>) {
  const paciente = await ctx.db.get('pacientes', pacienteId);
  if (!paciente) {
    throw new ConvexError('Paciente não encontrada.');
  }
  if (paciente.organizationId) {
    await requireMembroDoHospital(ctx, paciente.organizationId);
  } else {
    await requirePlatformAdmin(ctx, await requireUserId(ctx));
  }
  return paciente;
}

// ---------------------------------------------------------------------------
// Site: erasure
// ---------------------------------------------------------------------------

/** Central team: patients who asked to have their data deleted (phone and date only). */
export const listarPedidosDeExclusao = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, await requireUserId(ctx));
    const pagina = await ctx.db
      .query('pacientes')
      .withIndex('by_exclusaoPedidaEm', (q) => q.gt('exclusaoPedidaEm', 0))
      .paginate(args.paginationOpts);
    return { ...pagina, page: pagina.page.map(resumoDaPaciente) };
  },
});

/**
 * Central team: deletes everything about a patient. Her record disappears at once; her messages
 * and channel data are removed in batches right after.
 */
export const apagarDadosDaPaciente = mutation({
  args: { pacienteId: v.id('pacientes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, await requireUserId(ctx));
    const paciente = await ctx.db.get('pacientes', args.pacienteId);
    if (!paciente) {
      throw new ConvexError('Paciente não encontrada.');
    }
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
    const lotes = await Promise.all([
      ctx.db
        .query('mensagensConversa')
        .withIndex('by_pacienteId_and_enviadaEm', (q) => q.eq('pacienteId', args.pacienteId))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('canalMensagensRecebidas')
        .withIndex('by_telefone', (q) => q.eq('telefone', args.telefone))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('canalMensagensPendentes')
        .withIndex('by_telefone', (q) => q.eq('telefone', args.telefone))
        .take(LOTE_EXCLUSAO),
      ctx.db
        .query('canalConversas')
        .withIndex('by_telefone', (q) => q.eq('telefone', args.telefone))
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
