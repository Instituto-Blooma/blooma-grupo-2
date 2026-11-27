/**
 * Entry triage over WhatsApp, after the patient accepted the consent term:
 *
 * 1. Sign-up: full name → what she likes to be called → hospital record number ("não sei" is ok).
 * 2. Triage: the current protocol (`protocolosTriagem`, convex/lib/protocolo.ts), one step at a
 *    time: the Distress Thermometer (number 0-10, problem list by category with "Certo" /
 *    "Corrigir", "Outros problemas"), then GAD-7 and PHQ-9 (list of options).
 * 3. Weekly re-check (crons.ts) exists but is OFF by setting (`checkinSemanalAtivo`): the MVP is
 *    the entry triage only.
 *
 * A finished triage opens a case in the team queue (or updates the open one), or only a notice
 * for the team when the priority is low. An open case never loses priority by itself.
 *
 * Called from convex/pacientes.ts (messages after consent, risk words) and convex/canal.ts (bot
 * gave up after 3 wrong answers).
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { MensagemRecebida } from './canal';
import { configuracaoDoHospital, type ConfiguracaoTriagem } from './lib/configuracaoTriagem';
import {
  ORDEM_PRIORIDADE,
  ORDEM_SEM_PRIORIDADE,
  prioridadeMaisAlta,
  type Prioridade,
} from './lib/escala';
import {
  calcularResultados,
  conteudoProtocoloValidator,
  definirPrioridadeTriagem,
  lerItensMarcados,
  lerNumero,
  lerTextoAberto,
  NOME_DA_ESCALA,
  PROTOCOLO_RASCUNHO,
  validarProtocolo,
  type ConteudoProtocolo,
  type Resposta,
} from './lib/protocolo';
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
  'Obrigado por responder! A equipe de psicologia do hospital vai ver suas respostas.';
/** The fixed reply is not sent while the team is talking to her (message in the last 24h). */
const JANELA_CONVERSA_EQUIPE_MS = 24 * 60 * 60 * 1000;
const MENSAGENS_OLHADAS = 30;
const MENSAGEM_EQUIPE_VAI_AJUDAR =
  'Não consegui entender suas respostas. Alguém da equipe vai continuar a conversa com você por aqui.';
/** Typed answers in a row that could not be read before the team takes over. */
const MAX_TENTATIVAS_INVALIDAS = 3;

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
  const checkin = paciente.checkinAtualId
    ? await ctx.db.get('checkins', paciente.checkinAtualId)
    : null;
  if (checkin?.situacao === 'em_andamento') {
    await tratarRespostaDaTriagem(ctx, paciente, checkin, mensagem);
    return;
  }
  // Accepted before sign-up existed: start it now.
  if (!paciente.cadastroConcluidoEm) {
    await ctx.db.patch('pacientes', paciente._id, { etapaCadastro: 'nome' });
    await enviarTexto(ctx, paciente.telefone, PERGUNTA_NOME);
  }
  // Not an answer to anything: fixed reply with the hospital channel (editable on Configurações),
  // unless someone from the team wrote to her in the last 24h (that conversation is on the site).
  else if (paciente.organizationId && !(await equipeConversouRecentemente(ctx, paciente))) {
    const configuracao = await configuracaoDoHospital(ctx, paciente.organizationId);
    await enviarTexto(ctx, paciente.telefone, configuracao.mensagemLivre);
  }
}

async function equipeConversouRecentemente(ctx: MutationCtx, paciente: Doc<'pacientes'>) {
  const desde = Date.now() - JANELA_CONVERSA_EQUIPE_MS;
  const recentes = await ctx.db
    .query('mensagensConversa')
    .withIndex('by_pacienteId_and_enviadaEm', (q) =>
      q.eq('pacienteId', paciente._id).gte('enviadaEm', desde)
    )
    .order('desc')
    .take(MENSAGENS_OLHADAS);
  return recentes.some((mensagem) => mensagem.remetente === 'profissional');
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
      await iniciarTriagem(ctx, paciente._id, 'cadastro', `Obrigado${apelido}!`);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Entry triage
// ---------------------------------------------------------------------------

/** The protocol for new triages. With none published yet, the draft (texts pending) is used. */
async function obterProtocoloAtual(ctx: MutationCtx) {
  const atual = await ultimoProtocolo(ctx);
  if (atual) return atual;
  console.warn(
    '[triagem] nenhum protocolo publicado: usando o rascunho (textos oficiais pendentes)'
  );
  const id = await ctx.db.insert('protocolosTriagem', {
    ...PROTOCOLO_RASCUNHO,
    publicadoEm: Date.now(),
  });
  const criado = await ctx.db.get('protocolosTriagem', id);
  if (!criado) throw new Error('Failed to create draft protocol');
  return criado;
}

export async function ultimoProtocolo(ctx: QueryCtx | MutationCtx) {
  return await ctx.db.query('protocolosTriagem').withIndex('by_publicadoEm').order('desc').first();
}

async function iniciarTriagem(
  ctx: MutationCtx,
  pacienteId: Id<'pacientes'>,
  motivo: Doc<'checkins'>['motivo'],
  saudacao: string
) {
  const paciente = await ctx.db.get('pacientes', pacienteId);
  if (!paciente?.organizationId) return;
  await interromperCheckin(ctx, paciente, 'sem_resposta');
  const protocolo = await obterProtocoloAtual(ctx);
  const configuracao = await configuracaoDoHospital(ctx, paciente.organizationId);
  const checkinId = await ctx.db.insert('checkins', {
    pacienteId,
    organizationId: paciente.organizationId,
    protocoloId: protocolo._id,
    protocoloVersao: protocolo.versao,
    protocoloNome: protocolo.nome,
    textoOficialPendente: protocolo.textoOficialPendente,
    motivo,
    situacao: 'em_andamento',
    proximaPergunta: 0,
    respostas: [],
    pontuacao: 0,
    teveRisco: false,
    iniciadoEm: Date.now(),
  });
  await ctx.db.patch('pacientes', pacienteId, { checkinAtualId: checkinId });
  const introducao = `${saudacao} Agora vou fazer algumas perguntas para a equipe de psicologia entender como você está.`;
  await enviarEtapa(ctx, paciente.telefone, protocolo, 0, configuracao, introducao);
}

/**
 * Text of a protocol step as the patient sees it (also used by convex/demonstracao.ts).
 * The first step of each scale carries its official instruction; the first problem category
 * carries the explanation of how to answer the list.
 */
export function textoDaEtapa(
  protocolo: Pick<ConteudoProtocolo, 'etapas' | 'introducoes'>,
  indice: number,
  configuracao: Pick<ConfiguracaoTriagem, 'explicacaoListaProblemas'>,
  prefixo?: string,
  repetindo = false
) {
  const etapa = protocolo.etapas[indice];
  const anterior = protocolo.etapas[indice - 1];
  const partes: string[] = [];
  if (prefixo) partes.push(prefixo, '');
  if (!repetindo && (!anterior || anterior.escala !== etapa.escala)) {
    partes.push(protocolo.introducoes[etapa.escala], '');
  }
  if (!repetindo && etapa.tipo === 'problemas' && anterior?.tipo !== 'problemas') {
    partes.push(configuracao.explicacaoListaProblemas, '');
  }
  switch (etapa.tipo) {
    case 'numero':
      partes.push(
        etapa.texto,
        '',
        `Responda com um número inteiro de ${etapa.minimo} a ${etapa.maximo}.`
      );
      break;
    case 'problemas':
      partes.push(
        `*${etapa.categoria}*`,
        ...etapa.itens.map((item, posicao) => `${posicao + 1}. ${item.texto}`),
        '',
        'Escreva os números que acontecem com você (por exemplo: 1, 3) ou "nenhum".'
      );
      break;
    case 'aberta':
      partes.push(
        `*${etapa.texto}*`,
        'Escreva com as suas palavras. Se não houver, escreva "nenhum".'
      );
      break;
    case 'escolha': {
      const daEscala = protocolo.etapas.filter((outra) => outra.escala === etapa.escala);
      const posicao = daEscala.findIndex((outra) => outra.id === etapa.id) + 1;
      partes.push(
        `*${NOME_DA_ESCALA[etapa.escala]}: pergunta ${posicao} de ${daEscala.length}*`,
        etapa.texto,
        '',
        'Toque em uma opção ou responda com o número:',
        ...etapa.opcoes.map((opcao, numero) => `${numero + 1}. ${opcao.titulo}`)
      );
      break;
    }
  }
  return partes.join('\n');
}

/** Closing message of the triage (with CVV/SAMU after a risk answer). */
export function mensagemFinalDoCheckin(teveRisco: boolean) {
  return teveRisco ? `${MENSAGEM_FIM_CHECKIN}\n\n${MENSAGEM_CRISE}` : MENSAGEM_FIM_CHECKIN;
}

async function enviarEtapa(
  ctx: MutationCtx,
  telefone: string,
  protocolo: ConteudoProtocolo,
  indice: number,
  configuracao: ConfiguracaoTriagem,
  prefixo?: string,
  repetindo = false
) {
  const etapa = protocolo.etapas[indice];
  const texto = textoDaEtapa(protocolo, indice, configuracao, prefixo, repetindo);
  if (etapa.tipo === 'escolha') {
    await ctx.runMutation(internal.canal.enviarLista, {
      telefone,
      texto: texto.length <= MAX_CORPO_PERGUNTA ? texto : etapa.texto,
      textoBotao: 'Ver opções',
      opcoes: etapa.opcoes.map((opcao) => ({
        id: `${PREFIXO_OPCAO_CHECKIN}${etapa.id}:${opcao.id}`,
        titulo: opcao.titulo,
      })),
    });
    return;
  }
  await enviarTexto(ctx, telefone, texto);
}

/** Every message she sends while a triage is open. */
async function tratarRespostaDaTriagem(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  checkin: Doc<'checkins'>,
  mensagem: MensagemRecebida
) {
  const protocolo = checkin.protocoloId
    ? await ctx.db.get('protocolosTriagem', checkin.protocoloId)
    : null;
  const etapa = protocolo?.etapas[checkin.proximaPergunta];
  if (!protocolo || !etapa) {
    // Old example-scale check-in or a broken protocol: close it.
    await interromperCheckin(ctx, paciente, 'sem_resposta');
    return;
  }
  const configuracao = await configuracaoDoHospital(ctx, checkin.organizationId);
  const agora = Date.now();
  const prefixoDaEtapa = `${PREFIXO_OPCAO_CHECKIN}${etapa.id}:`;
  const opcao = mensagem.opcaoEscolhida?.startsWith(prefixoDaEtapa)
    ? mensagem.opcaoEscolhida.slice(prefixoDaEtapa.length)
    : null;

  switch (etapa.tipo) {
    case 'escolha': {
      // Typed answers that match no option are repeated by the channel (convex/canal.ts).
      const escolhida = etapa.opcoes.find((item) => item.id === opcao);
      if (!escolhida) return;
      await avancar(ctx, paciente, checkin, protocolo, configuracao, {
        perguntaId: etapa.id,
        perguntaTexto: etapa.texto,
        respondidaEm: agora,
        tipo: 'escolha',
        escala: etapa.escala,
        opcaoId: escolhida.id,
        opcaoTitulo: escolhida.titulo,
        pontos: escolhida.pontos,
        risco: etapa.alertaDeRisco && escolhida.pontos > 0,
      });
      return;
    }
    case 'numero': {
      const valor = lerNumero(mensagem.texto, etapa.minimo, etapa.maximo);
      if (valor === null) {
        await respostaInvalida(
          ctx,
          paciente,
          checkin,
          protocolo,
          configuracao,
          `Não entendi. Responda só com um número inteiro de ${etapa.minimo} a ${etapa.maximo}, por exemplo: 5.`
        );
        return;
      }
      await avancar(ctx, paciente, checkin, protocolo, configuracao, {
        perguntaId: etapa.id,
        perguntaTexto: etapa.texto,
        respondidaEm: agora,
        tipo: 'numero',
        escala: etapa.escala,
        valor,
      });
      return;
    }
    case 'problemas': {
      if (checkin.selecaoPendente) {
        // Waiting for "Certo" / "Corrigir" (typed answers are repeated by the channel).
        if (opcao === 'certo') {
          const marcados = new Set(checkin.selecaoPendente);
          await avancar(ctx, paciente, checkin, protocolo, configuracao, {
            perguntaId: etapa.id,
            perguntaTexto: etapa.categoria,
            respondidaEm: agora,
            tipo: 'problemas',
            escala: etapa.escala,
            itens: etapa.itens.map((item, posicao) => ({
              id: item.id,
              texto: item.texto,
              sim: marcados.has(posicao + 1),
            })),
          });
        } else if (opcao === 'corrigir') {
          await ctx.db.patch('checkins', checkin._id, { selecaoPendente: undefined });
          await enviarEtapa(
            ctx,
            paciente.telefone,
            protocolo,
            checkin.proximaPergunta,
            configuracao,
            'Tudo bem, vamos de novo.',
            true
          );
        }
        return;
      }
      const marcados = lerItensMarcados(mensagem.texto, etapa.itens.length);
      if (marcados === null) {
        await respostaInvalida(
          ctx,
          paciente,
          checkin,
          protocolo,
          configuracao,
          `Não entendi. Escreva só os números dos itens que acontecem com você, separados por vírgula (de 1 a ${etapa.itens.length}), ou "nenhum".`
        );
        return;
      }
      await ctx.db.patch('checkins', checkin._id, {
        selecaoPendente: marcados,
        tentativasInvalidas: 0,
      });
      const entendido = marcados.length
        ? [
            `Entendi que estes itens de "${etapa.categoria}" acontecem com você:`,
            ...marcados.map((numero) => `${numero}. ${etapa.itens[numero - 1].texto}`),
          ]
        : [`Entendi que nenhum item de "${etapa.categoria}" acontece com você.`];
      await ctx.runMutation(internal.canal.enviarBotoes, {
        telefone: paciente.telefone,
        texto: [...entendido, '', 'Você quer corrigir alguma resposta sua?']
          .join('\n')
          .slice(0, MAX_CORPO_PERGUNTA),
        opcoes: [
          { id: `${prefixoDaEtapa}certo`, titulo: 'Certo' },
          { id: `${prefixoDaEtapa}corrigir`, titulo: 'Corrigir' },
        ],
      });
      return;
    }
    case 'aberta': {
      if (!mensagem.texto.trim()) {
        await respostaInvalida(ctx, paciente, checkin, protocolo, configuracao, PEDIR_TEXTO);
        return;
      }
      await avancar(ctx, paciente, checkin, protocolo, configuracao, {
        perguntaId: etapa.id,
        perguntaTexto: etapa.texto,
        respondidaEm: agora,
        tipo: 'aberta',
        escala: etapa.escala,
        texto: lerTextoAberto(mensagem.texto),
      });
      return;
    }
  }
}

/** Could not read the typed answer: explain and ask again; on the 3rd time the team takes over. */
async function respostaInvalida(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  checkin: Doc<'checkins'>,
  protocolo: ConteudoProtocolo,
  configuracao: ConfiguracaoTriagem,
  explicacao: string
) {
  const tentativas = (checkin.tentativasInvalidas ?? 0) + 1;
  if (tentativas >= MAX_TENTATIVAS_INVALIDAS) {
    await enviarTexto(ctx, paciente.telefone, MENSAGEM_EQUIPE_VAI_AJUDAR);
    await registrarQueRoboNaoEntendeu(ctx, paciente.telefone);
    return;
  }
  await ctx.db.patch('checkins', checkin._id, { tentativasInvalidas: tentativas });
  await enviarEtapa(
    ctx,
    paciente.telefone,
    protocolo,
    checkin.proximaPergunta,
    configuracao,
    explicacao,
    true
  );
}

/** Stores the answer and sends the next step, or closes the triage after the last one. */
async function avancar(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  checkin: Doc<'checkins'>,
  protocolo: ConteudoProtocolo,
  configuracao: ConfiguracaoTriagem,
  resposta: Resposta
) {
  const respostas = [...checkin.respostas, resposta];
  const proxima = checkin.proximaPergunta + 1;
  // End of the DT: GAD-7 and PHQ-9 only for DT at or above the cut-off (when so configured).
  const etapaAtual = protocolo.etapas[checkin.proximaPergunta];
  const proximaEtapa = protocolo.etapas[proxima];
  if (
    configuracao.gadPhqSomenteAcimaDoCorteDT &&
    etapaAtual?.escala === 'dt' &&
    proximaEtapa &&
    proximaEtapa.escala !== 'dt'
  ) {
    const { dt } = calcularResultados(respostas, false);
    if (dt === undefined || dt < configuracao.cortes.dt) {
      await concluirTriagem(ctx, paciente, checkin, respostas, configuracao, true);
      return;
    }
  }
  // End of the PHQ-9 with a risk answer on question 9: the team is alerted and the case becomes
  // urgent right now; the patient gets CVV 188 / SAMU 192 in the same message as what follows.
  const fimDoPhq9 = etapaAtual?.escala === 'phq9' && proximaEtapa?.escala !== 'phq9';
  const riscoPhq9 = fimDoPhq9 && respostas.some((r) => r.escala === 'phq9' && r.risco === true);
  if (riscoPhq9) {
    await alertarRiscoPhq9(ctx, paciente, checkin);
  }
  if (proxima < protocolo.etapas.length) {
    await ctx.db.patch('checkins', checkin._id, {
      respostas,
      proximaPergunta: proxima,
      selecaoPendente: undefined,
      tentativasInvalidas: 0,
    });
    await enviarEtapa(
      ctx,
      paciente.telefone,
      protocolo,
      proxima,
      configuracao,
      riscoPhq9 ? MENSAGEM_CRISE : undefined
    );
    return;
  }
  // Last step: the closing message carries CVV 188 / SAMU 192 after a risk answer.
  await concluirTriagem(ctx, paciente, checkin, respostas, configuracao, false);
}

/** PHQ-9 question 9 above "Nenhuma vez": alert on the record and urgent case in the queue. */
async function alertarRiscoPhq9(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  checkin: Doc<'checkins'>
) {
  await ctx.db.insert('alertasPaciente', {
    pacienteId: paciente._id,
    organizationId: checkin.organizationId,
    tipo: 'resposta_de_risco',
    checkinId: checkin._id,
    criadoEm: Date.now(),
  });
  await colocarNaFila(ctx, paciente._id, 'urgente', 'risco');
}

async function concluirTriagem(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'>,
  checkin: Doc<'checkins'>,
  respostas: Resposta[],
  configuracao: ConfiguracaoTriagem,
  gadPhqNaoAplicados: boolean
) {
  const agora = Date.now();
  const resultados = calcularResultados(respostas, gadPhqNaoAplicados);
  const prioridade = definirPrioridadeTriagem(resultados, configuracao.cortes, configuracao.regra);
  await ctx.db.patch('checkins', checkin._id, {
    respostas,
    proximaPergunta: checkin.proximaPergunta + 1,
    selecaoPendente: undefined,
    tentativasInvalidas: undefined,
    resultados,
    teveRisco: resultados.riscoPhq9,
    prioridade,
    situacao: 'concluido',
    concluidoEm: agora,
  });
  await ctx.db.patch('pacientes', paciente._id, {
    checkinAtualId: undefined,
    ultimoCheckinEm: agora,
    ultimaPrioridade: prioridade,
    ultimasNotas: { dt: resultados.dt, gad7: resultados.gad7, phq9: resultados.phq9 },
  });
  const atualizada = await ctx.db.get('pacientes', paciente._id);
  if (prioridade === 'baixa' && atualizada && !atualizada.naFila) {
    // Nothing to solve: no case is opened. The team gets a notice and the answers stay on record.
    await ctx.db.insert('avisosEquipe', {
      organizationId: checkin.organizationId,
      pacienteId: paciente._id,
      checkinId: checkin._id,
      tipo: 'checkin_prioridade_baixa',
      visto: false,
      criadoEm: agora,
    });
  } else {
    await colocarNaFila(ctx, paciente._id, prioridade);
  }
  await enviarTexto(ctx, paciente.telefone, mensagemFinalDoCheckin(resultados.riscoPhq9));
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
    alertaRisco: (aberto && paciente.alertaRisco === true) || alerta === 'risco',
    alertaRobo: (aberto && paciente.alertaRobo === true) || alerta === 'nao_entendeu',
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
    // Only hospitals that turned the weekly re-check on (off by default: entry triage only).
    const ativoPorHospital = new Map<string, boolean>();
    for (const paciente of pagina.page) {
      const hospital = paciente.organizationId;
      if (!hospital) continue;
      if (!ativoPorHospital.has(hospital)) {
        const configuracao = await configuracaoDoHospital(ctx, hospital);
        ativoPorHospital.set(hospital, configuracao.checkinSemanalAtivo);
      }
      if (!ativoPorHospital.get(hospital)) continue;
      if (await podeReceberCheckin(ctx, paciente)) {
        const ola = paciente.apelido ? `Olá, ${paciente.apelido}!` : 'Olá!';
        await iniciarTriagem(ctx, paciente._id, 'semanal', ola);
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
    await iniciarTriagem(ctx, paciente._id, 'semanal', ola);
    return null;
  },
});

/**
 * Publishes a new protocol version (official texts of DT, GAD-7 and PHQ-9); new triages use it
 * (triages already started keep theirs).
 *   npx convex run triagem:publicarProtocolo '{"protocolo": {...}}'
 */
export const publicarProtocolo = internalMutation({
  args: { protocolo: conteudoProtocoloValidator },
  returns: v.id('protocolosTriagem'),
  handler: async (ctx, args) => {
    validarProtocolo(args.protocolo);
    const existente = await ctx.db
      .query('protocolosTriagem')
      .withIndex('by_versao', (q) => q.eq('versao', args.protocolo.versao))
      .unique();
    if (existente) {
      throw new ConvexError(`A versão "${args.protocolo.versao}" do protocolo já existe.`);
    }
    return await ctx.db.insert('protocolosTriagem', {
      ...args.protocolo,
      publicadoEm: Date.now(),
    });
  },
});

async function enviarTexto(ctx: MutationCtx, telefone: string, texto: string) {
  await ctx.runMutation(internal.canal.enviarTexto, {
    telefone,
    texto,
    remetente: { tipo: 'robo' },
  });
}
