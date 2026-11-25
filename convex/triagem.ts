/**
 * Triage over WhatsApp, after the patient accepted the consent term:
 *
 * 1. Sign-up: full name → what she likes to be called → hospital record number ("não sei" is ok).
 * 2. Check-in: the current scale (`escalasTriagem`), one question at a time, with buttons (up to 3
 *    options) or a list (4 to 10). A fixed rule (convex/lib/escala.ts) adds up the points and sets
 *    the priority. A risk answer makes the case urgent at once; the patient gets CVV 188 and
 *    SAMU 192 in the closing message of the check-in.
 * 3. Weekly: every Monday at 9h (Brasília) each signed-up patient gets a new check-in (crons.ts).
 *
 * A finished check-in with priority urgent, high or moderate opens a case in the team queue (or
 * updates the open one). A low one only creates a notice for the team (`avisosEquipe`): nothing
 * to solve. An open case never loses priority by itself: only the team closes it.
 *
 * Called from convex/pacientes.ts (messages after consent, risk words) and convex/canal.ts (bot
 * gave up after 3 wrong answers).
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { MensagemRecebida } from './canal';
import {
  conteudoEscalaValidator,
  definirPrioridade,
  ESCALA_DE_EXEMPLO,
  ORDEM_PRIORIDADE,
  ORDEM_SEM_PRIORIDADE,
  pontuacaoMaxima,
  prioridadeMaisAlta,
  usaBotoes,
  validarEscala,
  type Prioridade,
} from './lib/escala';
import { normalizarTexto } from './lib/texto';
import { MENSAGEM_CRISE, temConsentimentoAtual } from './pacientes';

const PREFIXO_OPCAO_CHECKIN = 'ck:';
const MAX_NOME = 120;
const MAX_APELIDO = 40;
const MAX_PRONTUARIO = 30;
const LOTE_SEMANAL = 25;
/** WhatsApp limit for the text of a message with buttons or a list. */
const MAX_CORPO_PERGUNTA = 1024;

const PERGUNTA_NOME = 'Para começar, qual é o seu nome completo?';
const PERGUNTA_APELIDO = 'Obrigado! E como você gosta de ser chamada?';
const PERGUNTA_PRONTUARIO =
  'Qual é o número do seu prontuário no hospital? Ele aparece na carteirinha ou nos papéis do hospital. Se não souber, responda NÃO SEI.';
const PEDIR_TEXTO = 'Não consegui ler sua resposta. Por favor, escreva com letras.';
const MENSAGEM_FIM_CHECKIN =
  'Obrigado por responder! A equipe de psicologia do hospital vai ver suas respostas. Se quiser falar com a equipe, é só escrever aqui.';

// ---------------------------------------------------------------------------
// Called by convex/pacientes.ts
// ---------------------------------------------------------------------------

/** Right after she accepts the consent term. */
export async function depoisDoAceite(ctx: MutationCtx, paciente: Doc<'pacientes'>) {
  if (paciente.cadastroConcluidoEm) {
    await enviarTexto(ctx, paciente.telefone, 'Obrigado pelo aceite! Vamos continuar.');
    return;
  }
  await ctx.db.patch('pacientes', paciente._id, { etapaCadastro: 'nome' });
  await enviarTexto(ctx, paciente.telefone, `Obrigado pelo aceite! ${PERGUNTA_NOME}`);
}

/** Every message of a patient who has accepted the current term (already stored as history). */
export async function tratarMensagemDepoisDoAceite(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  mensagem: MensagemRecebida
) {
  if (paciente.etapaCadastro) {
    await tratarCadastro(ctx, paciente, paciente.etapaCadastro, mensagem.texto);
    return;
  }
  if (mensagem.opcaoEscolhida?.startsWith(PREFIXO_OPCAO_CHECKIN)) {
    await tratarRespostaDoCheckin(ctx, paciente, mensagem.opcaoEscolhida);
    return;
  }
  // Accepted before sign-up existed: start it now.
  if (!paciente.cadastroConcluidoEm) {
    await ctx.db.patch('pacientes', paciente._id, { etapaCadastro: 'nome' });
    await enviarTexto(ctx, paciente.telefone, PERGUNTA_NOME);
  }
  // Otherwise it is a message for the team: it is in the history and the team answers it there.
}

/** She wrote a risk word (the crisis message was already sent by convex/pacientes.ts). */
export async function registrarPalavraDeRisco(ctx: MutationCtx, paciente: Doc<'pacientes'>) {
  if (!paciente.organizationId) return;
  await interromperCheckin(ctx, paciente, 'palavra_de_risco');
  await ctx.db.insert('alertasPaciente', {
    pacienteId: paciente._id,
    organizationId: paciente.organizationId,
    tipo: 'palavra_de_risco',
    criadoEm: Date.now(),
  });
  await colocarNaFila(ctx, paciente._id, 'urgente', 'risco');
}

// ---------------------------------------------------------------------------
// Called by convex/canal.ts
// ---------------------------------------------------------------------------

/** The bot gave up on a question (3 wrong answers in a row): the team must take over. */
export async function registrarQueRoboNaoEntendeu(ctx: MutationCtx, telefone: string) {
  const paciente = await ctx.db
    .query('pacientes')
    .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
    .unique();
  if (!paciente?.organizationId) return;
  await interromperCheckin(ctx, paciente, 'robo_nao_entendeu');
  await ctx.db.insert('alertasPaciente', {
    pacienteId: paciente._id,
    organizationId: paciente.organizationId,
    tipo: 'robo_nao_entendeu',
    ...(paciente.checkinAtualId ? { checkinId: paciente.checkinAtualId } : {}),
    criadoEm: Date.now(),
  });
  await colocarNaFila(ctx, paciente._id, undefined, 'nao_entendeu');
}

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

async function tratarCadastro(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  etapa: NonNullable<Doc<'pacientes'>['etapaCadastro']>,
  textoRecebido: string
) {
  const texto = textoRecebido.trim().replace(/\s+/g, ' ');
  if (!texto) {
    await enviarTexto(ctx, paciente.telefone, PEDIR_TEXTO);
    return;
  }
  switch (etapa) {
    case 'nome':
      await ctx.db.patch('pacientes', paciente._id, {
        nomeCompleto: texto.slice(0, MAX_NOME),
        etapaCadastro: 'apelido',
      });
      await enviarTexto(ctx, paciente.telefone, PERGUNTA_APELIDO);
      return;
    case 'apelido':
      await ctx.db.patch('pacientes', paciente._id, {
        apelido: texto.slice(0, MAX_APELIDO),
        etapaCadastro: 'prontuario',
      });
      await enviarTexto(ctx, paciente.telefone, PERGUNTA_PRONTUARIO);
      return;
    case 'prontuario': {
      // "não sei", or anything without a number, means she does not know it.
      const sabe = normalizarTexto(texto) !== 'nao sei' && /\d/.test(texto);
      await ctx.db.patch('pacientes', paciente._id, {
        prontuario: sabe ? texto.slice(0, MAX_PRONTUARIO) : undefined,
        etapaCadastro: undefined,
        cadastroConcluidoEm: Date.now(),
      });
      const apelido = paciente.apelido ? `, ${paciente.apelido}` : '';
      await iniciarCheckin(ctx, paciente._id, 'cadastro', `Obrigado${apelido}!`);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** The scale for new check-ins. With none published yet, the EXAMPLE scale is published. */
async function obterEscalaAtual(ctx: MutationCtx) {
  const atual = await ultimaEscala(ctx);
  if (atual) return atual;
  console.warn('[triagem] nenhuma escala publicada: usando a escala de EXEMPLO');
  const id = await ctx.db.insert('escalasTriagem', {
    ...ESCALA_DE_EXEMPLO,
    publicadaEm: Date.now(),
  });
  const criada = await ctx.db.get('escalasTriagem', id);
  if (!criada) throw new Error('Failed to create example scale');
  return criada;
}

async function ultimaEscala(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query('escalasTriagem').withIndex('by_publicadaEm').order('desc').first();
}

async function iniciarCheckin(
  ctx: MutationCtx,
  pacienteId: Id<'pacientes'>,
  motivo: Doc<'checkins'>['motivo'],
  saudacao: string
) {
  const paciente = await ctx.db.get('pacientes', pacienteId);
  if (!paciente?.organizationId) return;
  await interromperCheckin(ctx, paciente, 'sem_resposta');
  const escala = await obterEscalaAtual(ctx);
  const checkinId = await ctx.db.insert('checkins', {
    pacienteId,
    organizationId: paciente.organizationId,
    escalaId: escala._id,
    escalaVersao: escala.versao,
    escalaNome: escala.nome,
    escalaExemplo: escala.exemplo,
    faixas: escala.faixas,
    pontuacaoMaxima: pontuacaoMaxima(escala),
    motivo,
    situacao: 'em_andamento',
    proximaPergunta: 0,
    respostas: [],
    pontuacao: 0,
    teveRisco: false,
    iniciadoEm: Date.now(),
  });
  await ctx.db.patch('pacientes', pacienteId, { checkinAtualId: checkinId });
  const total = escala.perguntas.length;
  const introducao =
    motivo === 'semanal'
      ? `${saudacao} Hora do check-in da semana: são ${total} perguntas rápidas. É só tocar em uma resposta.`
      : `${saudacao} Agora vamos fazer um check-in rápido: são ${total} perguntas. É só tocar em uma resposta.`;
  await enviarPergunta(ctx, paciente.telefone, escala, 0, introducao);
}

async function enviarPergunta(
  ctx: MutationCtx,
  telefone: string,
  escala: Doc<'escalasTriagem'>,
  indice: number,
  introducao?: string
) {
  const pergunta = escala.perguntas[indice];
  const inicio = [
    ...(introducao ? [introducao, ''] : []),
    `*Pergunta ${indice + 1} de ${escala.perguntas.length}*`,
    pergunta.texto,
  ];
  // Numbered options, so she can also type "2" or "dois" instead of tapping.
  const comNumeros = [
    ...inicio,
    '',
    'Toque em uma opção ou responda com o número:',
    ...pergunta.opcoes.map((opcao, posicao) => `${posicao + 1}. ${opcao.titulo}`),
  ].join('\n');
  const texto = comNumeros.length <= MAX_CORPO_PERGUNTA ? comNumeros : inicio.join('\n');
  const opcoes = pergunta.opcoes.map((opcao) => ({
    id: `${PREFIXO_OPCAO_CHECKIN}${pergunta.id}:${opcao.id}`,
    titulo: opcao.titulo,
  }));
  if (usaBotoes(pergunta)) {
    await ctx.runMutation(internal.canal.enviarBotoes, { telefone, texto, opcoes });
  } else {
    await ctx.runMutation(internal.canal.enviarLista, {
      telefone,
      texto,
      textoBotao: 'Ver opções',
      opcoes,
    });
  }
}

async function tratarRespostaDoCheckin(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  opcaoEscolhida: string
) {
  const checkin = paciente.checkinAtualId
    ? await ctx.db.get('checkins', paciente.checkinAtualId)
    : null;
  if (!checkin || checkin.situacao !== 'em_andamento') return;
  const escala = await ctx.db.get('escalasTriagem', checkin.escalaId);
  const pergunta = escala?.perguntas[checkin.proximaPergunta];
  if (!escala || !pergunta) {
    await interromperCheckin(ctx, paciente, 'sem_resposta');
    return;
  }
  const prefixo = `${PREFIXO_OPCAO_CHECKIN}${pergunta.id}:`;
  // A button of another question (e.g. an old message) does not count.
  if (!opcaoEscolhida.startsWith(prefixo)) return;
  const opcao = pergunta.opcoes.find((item) => item.id === opcaoEscolhida.slice(prefixo.length));
  if (!opcao) return;

  const agora = Date.now();
  const respostas = [
    ...checkin.respostas,
    {
      perguntaId: pergunta.id,
      perguntaTexto: pergunta.texto,
      opcaoId: opcao.id,
      opcaoTitulo: opcao.titulo,
      pontos: opcao.pontos,
      risco: opcao.risco,
      respondidaEm: agora,
    },
  ];
  const pontuacao = checkin.pontuacao + opcao.pontos;
  const teveRisco = checkin.teveRisco || opcao.risco;
  const proximaPergunta = checkin.proximaPergunta + 1;

  if (opcao.risco && paciente.organizationId) {
    // The team sees it at once; the patient gets CVV/SAMU at the end of the check-in.
    await ctx.db.insert('alertasPaciente', {
      pacienteId: paciente._id,
      organizationId: paciente.organizationId,
      tipo: 'resposta_de_risco',
      checkinId: checkin._id,
      criadoEm: agora,
    });
    await colocarNaFila(ctx, paciente._id, 'urgente', 'risco');
  }

  if (proximaPergunta < escala.perguntas.length) {
    await ctx.db.patch('checkins', checkin._id, {
      respostas,
      pontuacao,
      teveRisco,
      proximaPergunta,
    });
    await enviarPergunta(ctx, paciente.telefone, escala, proximaPergunta);
    return;
  }

  const prioridade = definirPrioridade(pontuacao, teveRisco, checkin.faixas);
  await ctx.db.patch('checkins', checkin._id, {
    respostas,
    pontuacao,
    teveRisco,
    proximaPergunta,
    prioridade,
    situacao: 'concluido',
    concluidoEm: agora,
  });
  await ctx.db.patch('pacientes', paciente._id, {
    checkinAtualId: undefined,
    ultimoCheckinEm: agora,
    ultimaPontuacao: pontuacao,
    ultimaPrioridade: prioridade,
  });
  const atualizada = await ctx.db.get('pacientes', paciente._id);
  if (prioridade === 'baixa' && atualizada && !atualizada.naFila && paciente.organizationId) {
    // Nothing to solve: no case is opened. The team gets a notice and the answers stay on record.
    await ctx.db.insert('avisosEquipe', {
      organizationId: paciente.organizationId,
      pacienteId: paciente._id,
      checkinId: checkin._id,
      tipo: 'checkin_prioridade_baixa',
      visto: false,
      criadoEm: agora,
    });
  } else {
    await colocarNaFila(ctx, paciente._id, prioridade);
  }
  await enviarTexto(
    ctx,
    paciente.telefone,
    teveRisco ? `${MENSAGEM_FIM_CHECKIN}\n\n${MENSAGEM_CRISE}` : MENSAGEM_FIM_CHECKIN
  );
}

async function interromperCheckin(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  motivo: NonNullable<Doc<'checkins'>['motivoInterrupcao']>
) {
  if (!paciente.checkinAtualId) return;
  const checkin = await ctx.db.get('checkins', paciente.checkinAtualId);
  if (checkin?.situacao === 'em_andamento') {
    await ctx.db.patch('checkins', checkin._id, {
      situacao: 'interrompido',
      motivoInterrupcao: motivo,
    });
  }
  await ctx.db.patch('pacientes', paciente._id, { checkinAtualId: undefined });
}

// ---------------------------------------------------------------------------
// Team queue
// ---------------------------------------------------------------------------

/**
 * Opens a case in the queue, or updates the open one. In an open case the priority only goes
 * up; a closed case starts again with the new priority. `undefined` keeps the current priority.
 * `alerta` marks the case for the queue filters: real risk, or the bot did not understand her.
 */
export async function colocarNaFila(
  ctx: MutationCtx,
  pacienteId: Id<'pacientes'>,
  prioridadeNova: Prioridade | undefined,
  alerta?: 'risco' | 'nao_entendeu'
) {
  const paciente = await ctx.db.get('pacientes', pacienteId);
  if (!paciente) return;
  const aberto = paciente.naFila === true;
  const prioridade: Prioridade | undefined = aberto
    ? prioridadeNova
      ? prioridadeMaisAlta(paciente.prioridade, prioridadeNova)
      : paciente.prioridade
    : prioridadeNova;
  await ctx.db.patch('pacientes', pacienteId, {
    prioridade,
    naFila: true,
    ordemFila: prioridade ? ORDEM_PRIORIDADE[prioridade] : ORDEM_SEM_PRIORIDADE,
    naFilaDesde: aberto ? (paciente.naFilaDesde ?? Date.now()) : Date.now(),
    situacaoCaso: aberto ? (paciente.situacaoCaso ?? 'aguardando') : 'aguardando',
    responsavelId: aberto ? paciente.responsavelId : undefined,
    casoComRisco: (aberto && paciente.casoComRisco === true) || alerta === 'risco',
    casoNaoEntendido: (aberto && paciente.casoNaoEntendido === true) || alerta === 'nao_entendeu',
  });
}

// ---------------------------------------------------------------------------
// Weekly check-in (convex/crons.ts) and terminal commands
// ---------------------------------------------------------------------------

/** Starts this week's check-in for every signed-up patient, 25 at a time. */
export const iniciarCheckinsDaSemana = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pagina = await ctx.db
      .query('pacientes')
      .paginate({ numItems: LOTE_SEMANAL, cursor: args.cursor });
    for (const paciente of pagina.page) {
      if (await podeReceberCheckin(ctx, paciente)) {
        const ola = paciente.apelido ? `Olá, ${paciente.apelido}!` : 'Olá!';
        await iniciarCheckin(ctx, paciente._id, 'semanal', ola);
      }
    }
    if (!pagina.isDone) {
      await ctx.scheduler.runAfter(0, internal.triagem.iniciarCheckinsDaSemana, {
        cursor: pagina.continueCursor,
      });
    }
    return null;
  },
});

async function podeReceberCheckin(ctx: MutationCtx, paciente: Doc<'pacientes'>) {
  return (
    paciente.organizationId !== undefined &&
    paciente.cadastroConcluidoEm !== undefined &&
    paciente.exclusaoPedidaEm === undefined &&
    (await temConsentimentoAtual(ctx, paciente))
  );
}

/**
 * Sends a new check-in to one patient now (for tests with the simulated channel).
 *   npx convex run triagem:enviarCheckinAgora '{"telefone":"5511999998888"}'
 */
export const enviarCheckinAgora = internalMutation({
  args: { telefone: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const paciente = await ctx.db
      .query('pacientes')
      .withIndex('by_telefone', (q) => q.eq('telefone', args.telefone))
      .unique();
    if (!paciente || !(await podeReceberCheckin(ctx, paciente))) {
      throw new ConvexError('Paciente não encontrada ou ainda sem cadastro completo.');
    }
    const ola = paciente.apelido ? `Olá, ${paciente.apelido}!` : 'Olá!';
    await iniciarCheckin(ctx, paciente._id, 'semanal', ola);
    return null;
  },
});

/**
 * Publishes a new scale version; new check-ins use it (check-ins already started keep theirs).
 *   npx convex run triagem:publicarEscala '{"escala":{"versao":"1","nome":"...","exemplo":false,
 *     "perguntas":[...],"faixas":{"altaAPartirDe":7,"moderadaAPartirDe":4}}}'
 */
export const publicarEscala = internalMutation({
  args: { escala: conteudoEscalaValidator },
  returns: v.id('escalasTriagem'),
  handler: async (ctx, args) => {
    validarEscala(args.escala);
    const existente = await ctx.db
      .query('escalasTriagem')
      .withIndex('by_versao', (q) => q.eq('versao', args.escala.versao))
      .unique();
    if (existente) {
      throw new ConvexError(`A versão "${args.escala.versao}" da escala já existe.`);
    }
    return await ctx.db.insert('escalasTriagem', { ...args.escala, publicadaEm: Date.now() });
  },
});

async function enviarTexto(ctx: MutationCtx, telefone: string, texto: string) {
  await ctx.runMutation(internal.canal.enviarTexto, {
    telefone,
    texto,
    remetente: { tipo: 'robo' },
  });
}
