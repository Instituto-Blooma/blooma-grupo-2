/**
 * Fictional patients so the team site can be seen with data on a test deployment (for example
 * the Railway preview of a pull request). Only works while WhatsApp is simulated.
 *
 *   pnpm run demo:pacientes                      # hospital "ac-camargo" (A.C. Camargo) or the only one registered
 *   pnpm run demo:pacientes -- --hospital <slug> # another hospital (organization slug)
 *
 * Running it again recreates the same fictional patients. `pnpm run dados:apagar-teste` removes
 * everything. Phones are +55 00 90000-00XX: area code 00 does not exist.
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  definirPrioridade,
  ESCALA_DE_EXEMPLO,
  pontuacaoMaxima,
  type Prioridade,
} from './lib/escala';
import { normalizarTexto } from './lib/texto';
import { tenantsClient } from './lib/tenantsClient';
import { MENSAGEM_CRISE } from './pacientes';
import { colocarNaFila, mensagemFinalDoCheckin, textoDaPergunta } from './triagem';

/** First-setup hospital (convex/testing/e2e.ts); older local setups still have "acme-corp". */
const SLUGS_PADRAO = ['ac-camargo', 'acme-corp'];
const CODIGO_DO_HOSPITAL = 'ACC';
const DIA = 24 * 60 * 60 * 1000;
const LOTE = 500;

type Checkin = {
  diasAtras: number;
  /** Option position (0, 1, 2…) chosen for each question, in order. */
  respostas: number[];
  /** Answers she typed instead of tapping: question position → what she wrote. */
  digitadas?: Record<number, string>;
};

type PacienteFicticia = {
  final: string;
  nomeCompleto: string;
  apelido: string;
  prontuario?: string;
  criadaHaDias: number;
  checkins: Checkin[];
  extra?: 'palavra_de_risco' | 'robo_nao_entendeu' | 'cadastro_incompleto' | 'sem_termo';
};

const PACIENTES: PacienteFicticia[] = [
  {
    final: '01',
    nomeCompleto: 'Joana Pereira',
    apelido: 'Jo',
    prontuario: '000123-4',
    criadaHaDias: 15,
    checkins: [
      { diasAtras: 8, respostas: [1, 1, 1, 0, 0, 0] },
      { diasAtras: 1, respostas: [2, 1, 2, 1, 0, 1], digitadas: { 5: 'dois' } },
    ],
  },
  {
    final: '02',
    nomeCompleto: 'Luíza Costa',
    apelido: 'Lu',
    prontuario: '000245-1',
    criadaHaDias: 20,
    checkins: [{ diasAtras: 2, respostas: [2, 2, 1, 1, 1, 0] }],
    extra: 'palavra_de_risco',
  },
  {
    final: '03',
    nomeCompleto: 'Teresa Alves',
    apelido: 'Teresa',
    criadaHaDias: 22,
    checkins: [
      { diasAtras: 9, respostas: [1, 1, 1, 1, 0, 0] },
      { diasAtras: 2, respostas: [2, 2, 2, 1, 1, 0], digitadas: { 2: 'RUIM' } },
    ],
  },
  {
    final: '04',
    nomeCompleto: 'Cláudia Moura',
    apelido: 'Cau',
    prontuario: '000377-9',
    criadaHaDias: 12,
    checkins: [{ diasAtras: 2, respostas: [1, 1, 1, 1, 0, 0] }],
  },
  {
    final: '05',
    nomeCompleto: 'Rita Gomes',
    apelido: 'Rita',
    criadaHaDias: 6,
    checkins: [],
    extra: 'robo_nao_entendeu',
  },
  {
    final: '06',
    nomeCompleto: 'Maria Silva',
    apelido: 'Mari',
    prontuario: '000412-0',
    criadaHaDias: 30,
    checkins: [
      { diasAtras: 16, respostas: [1, 1, 0, 0, 0, 0] },
      { diasAtras: 9, respostas: [1, 0, 0, 0, 0, 0] },
      { diasAtras: 2, respostas: [1, 0, 1, 0, 0, 0], digitadas: { 0: 'um pouco' } },
    ],
  },
  {
    final: '07',
    nomeCompleto: 'Helena Rocha',
    apelido: 'Helena',
    criadaHaDias: 10,
    checkins: [{ diasAtras: 2, respostas: [0, 1, 0, 0, 0, 0] }],
  },
  {
    final: '08',
    nomeCompleto: 'Beatriz Nunes',
    apelido: '',
    criadaHaDias: 1,
    checkins: [],
    extra: 'cadastro_incompleto',
  },
  {
    final: '09',
    nomeCompleto: '',
    apelido: '',
    criadaHaDias: 0,
    checkins: [],
    extra: 'sem_termo',
  },
];

const telefoneDe = (final: string) => `5500900000${final}`;

export const criarPacientesFicticias = internalMutation({
  args: { hospital: v.optional(v.string()) },
  returns: v.object({ hospital: v.string(), pacientes: v.number() }),
  handler: async (ctx, args) => {
    const simulado: boolean = await ctx.runQuery(internal.canal.estaEmModoSimulado, {});
    if (!simulado) {
      throw new ConvexError(
        'O WhatsApp real está ligado: pacientes fictícias só podem ser criadas no modo simulado.'
      );
    }
    const hospital = await escolherHospital(ctx, args.hospital);
    const agora = Date.now();
    const { termo, escala } = await prepararConfiguracao(ctx, hospital._id, agora);

    for (const ficticia of PACIENTES) {
      await apagarPacienteFicticia(ctx, telefoneDe(ficticia.final));
      await criarPaciente(ctx, ficticia, hospital._id, termo, escala, agora);
    }
    return { hospital: hospital.name, pacientes: PACIENTES.length };
  },
});

async function escolherHospital(ctx: MutationCtx, slug: string | undefined) {
  if (slug) {
    const porSlug = await tenantsClient.getOrganizationBySlug(ctx, slug);
    if (!porSlug) throw new ConvexError(`Nenhum hospital com o endereço "${slug}".`);
    return porSlug;
  }
  const cadastrados = await ctx.db.query('hospitais').take(2);
  if (cadastrados.length === 1) {
    const unico = await tenantsClient.getOrganization(ctx, cadastrados[0].organizationId);
    if (unico) return unico;
  }
  for (const padrao of SLUGS_PADRAO) {
    const hospital = await tenantsClient.getOrganizationBySlug(ctx, padrao);
    if (hospital) return hospital;
  }
  throw new ConvexError(
    'Não sei em qual hospital criar as pacientes. Rode de novo com --hospital <endereço do hospital>.'
  );
}

/** Hospital code, consent term, risk words and scale: created only when missing. */
async function prepararConfiguracao(ctx: MutationCtx, organizationId: string, agora: number) {
  const codigo = await ctx.db
    .query('hospitais')
    .withIndex('by_organizationId', (q) => q.eq('organizationId', organizationId))
    .unique();
  if (!codigo) {
    const teste = await ctx.db
      .query('hospitais')
      .withIndex('by_codigo', (q) => q.eq('codigo', CODIGO_DO_HOSPITAL))
      .unique();
    if (!teste) {
      await ctx.db.insert('hospitais', { organizationId, codigo: CODIGO_DO_HOSPITAL });
    }
  }

  let termo = await ctx.db
    .query('termosConsentimento')
    .withIndex('by_publicadoEm')
    .order('desc')
    .first();
  if (!termo) {
    const id = await ctx.db.insert('termosConsentimento', {
      versao: 'rascunho-1',
      texto:
        'RASCUNHO para teste: este atendimento guarda suas mensagens para a equipe de psicologia do hospital. Você pode pedir para apagar seus dados a qualquer momento escrevendo "apagar meus dados". Você aceita?',
      publicadoEm: agora - 60 * DIA,
    });
    termo = await ctx.db.get('termosConsentimento', id);
  }

  if (!(await ctx.db.query('palavrasDeRisco').first())) {
    for (const termoDeRisco of ['quero morrer', 'me matar', 'suicidio', 'tirar minha vida']) {
      await ctx.db.insert('palavrasDeRisco', {
        termo: normalizarTexto(termoDeRisco),
        criadaEm: agora,
      });
    }
  }

  let escala = await ctx.db
    .query('escalasTriagem')
    .withIndex('by_publicadaEm')
    .order('desc')
    .first();
  if (!escala) {
    const id = await ctx.db.insert('escalasTriagem', {
      ...ESCALA_DE_EXEMPLO,
      publicadaEm: agora - 60 * DIA,
    });
    escala = await ctx.db.get('escalasTriagem', id);
  }
  if (!termo || !escala) throw new Error('Failed to prepare demo configuration');
  return { termo, escala };
}

async function criarPaciente(
  ctx: MutationCtx,
  ficticia: PacienteFicticia,
  organizationId: string,
  termo: Doc<'termosConsentimento'>,
  escala: Doc<'escalasTriagem'>,
  agora: number
) {
  const telefone = telefoneDe(ficticia.final);
  const criadaEm = agora - ficticia.criadaHaDias * DIA - 3 * 60 * 60 * 1000;
  if (ficticia.extra === 'sem_termo') {
    await ctx.db.insert('pacientes', { telefone, organizationId, criadaEm });
    return;
  }

  const incompleto = ficticia.extra === 'cadastro_incompleto';
  const pacienteId = await ctx.db.insert('pacientes', {
    telefone,
    organizationId,
    criadaEm,
    consentimento: { versaoTermo: termo.versao, aceitoEm: criadaEm + 60_000 },
    nomeCompleto: ficticia.nomeCompleto,
    ...(incompleto
      ? { etapaCadastro: 'apelido' as const }
      : {
          apelido: ficticia.apelido,
          prontuario: ficticia.prontuario,
          cadastroConcluidoEm: criadaEm + 5 * 60_000,
        }),
  });

  // Sign-up conversation.
  let momento = criadaEm + 2 * 60_000;
  const conversa = criarConversa(ctx, pacienteId);
  await conversa.robo('Obrigado pelo aceite! Para começar, qual é o seu nome completo?', momento);
  await conversa.paciente(ficticia.nomeCompleto, (momento += 60_000));
  await conversa.robo('Obrigado! E como você gosta de ser chamada?', (momento += 10_000));
  if (incompleto) return;
  await conversa.paciente(ficticia.apelido, (momento += 60_000));
  await conversa.robo(
    'Qual é o número do seu prontuário no hospital? Ele aparece na carteirinha ou nos papéis do hospital. Se não souber, responda NÃO SEI.',
    (momento += 10_000)
  );
  await conversa.paciente(ficticia.prontuario ?? 'não sei', (momento += 60_000));

  let ultimo: {
    id: Id<'checkins'>;
    pontuacao: number;
    prioridade: Prioridade;
    risco: boolean;
    em: number;
  } | null = null;
  for (const [posicao, checkin] of ficticia.checkins.entries()) {
    ultimo = await criarCheckin(ctx, {
      pacienteId,
      organizationId,
      escala,
      checkin,
      primeiro: posicao === 0,
      apelido: ficticia.apelido,
      conversa,
      agora,
    });
  }

  if (ultimo) {
    await ctx.db.patch('pacientes', pacienteId, {
      ultimoCheckinEm: ultimo.em,
      ultimaPontuacao: ultimo.pontuacao,
      ultimaPrioridade: ultimo.prioridade,
    });
    if (ultimo.risco) {
      await ctx.db.insert('alertasPaciente', {
        pacienteId,
        organizationId,
        tipo: 'resposta_de_risco',
        checkinId: ultimo.id,
        criadoEm: ultimo.em,
      });
    }
    if (ultimo.prioridade === 'baixa') {
      await ctx.db.insert('avisosEquipe', {
        organizationId,
        pacienteId,
        checkinId: ultimo.id,
        tipo: 'checkin_prioridade_baixa',
        visto: false,
        criadoEm: ultimo.em,
      });
    } else {
      await colocarNaFila(ctx, pacienteId, ultimo.prioridade, ultimo.risco ? 'risco' : undefined);
    }
  }

  if (ficticia.extra === 'palavra_de_risco') {
    const em = agora - 5 * 60 * 60 * 1000;
    await conversa.paciente('não aguento mais, quero morrer', em);
    await conversa.robo(MENSAGEM_CRISE, em + 5_000);
    await ctx.db.insert('alertasCrise', { telefone, organizationId, criadoEm: em });
    await ctx.db.insert('alertasPaciente', {
      pacienteId,
      organizationId,
      tipo: 'palavra_de_risco',
      criadoEm: em,
    });
    await colocarNaFila(ctx, pacienteId, 'urgente', 'risco');
  }

  if (ficticia.extra === 'robo_nao_entendeu') {
    const em = agora - 20 * 60 * 60 * 1000;
    const checkinId = await ctx.db.insert('checkins', {
      ...dadosDaEscala(escala),
      pacienteId,
      organizationId,
      motivo: 'cadastro',
      situacao: 'interrompido',
      motivoInterrupcao: 'robo_nao_entendeu',
      proximaPergunta: 0,
      respostas: [],
      pontuacao: 0,
      teveRisco: false,
      iniciadoEm: em,
    });
    const pergunta = textoDaPergunta(
      escala,
      0,
      `Obrigado, ${ficticia.apelido}! Agora vamos fazer um check-in rápido: são ${escala.perguntas.length} perguntas. É só tocar em uma resposta.`
    );
    const naoEntendi =
      'Não entendi sua resposta. Responda com o número ou o nome de uma das opções.';
    await conversa.robo(pergunta, em);
    await conversa.paciente('oi?', em + 60_000);
    await conversa.robo(`${naoEntendi}\n\n${textoDaPergunta(escala, 0)}`, em + 65_000);
    await conversa.paciente('não sei responder isso', em + 120_000);
    await conversa.robo(`${naoEntendi}\n\n${textoDaPergunta(escala, 0)}`, em + 125_000);
    await conversa.paciente('posso falar com alguém?', em + 180_000);
    await conversa.robo(
      'Não consegui entender suas respostas. Alguém da equipe vai continuar a conversa com você por aqui.',
      em + 185_000
    );
    await ctx.db.insert('alertasPaciente', {
      pacienteId,
      organizationId,
      tipo: 'robo_nao_entendeu',
      checkinId,
      criadoEm: em + 185_000,
    });
    await colocarNaFila(ctx, pacienteId, undefined, 'nao_entendeu');
  }
}

async function criarCheckin(
  ctx: MutationCtx,
  dados: {
    pacienteId: Id<'pacientes'>;
    organizationId: string;
    escala: Doc<'escalasTriagem'>;
    checkin: Checkin;
    primeiro: boolean;
    apelido: string;
    conversa: ReturnType<typeof criarConversa>;
    agora: number;
  }
) {
  const { escala, checkin, conversa } = dados;
  const inicio = dados.agora - checkin.diasAtras * DIA;
  let momento = inicio;
  const respostas: Doc<'checkins'>['respostas'] = [];
  let pontuacao = 0;
  let teveRisco = false;

  for (const [indice, pergunta] of escala.perguntas.entries()) {
    const opcao =
      pergunta.opcoes[Math.min(checkin.respostas[indice] ?? 0, pergunta.opcoes.length - 1)];
    const introducao =
      indice === 0
        ? dados.primeiro
          ? `Obrigado, ${dados.apelido}! Agora vamos fazer um check-in rápido: são ${escala.perguntas.length} perguntas. É só tocar em uma resposta.`
          : `Olá, ${dados.apelido}! Hora do check-in da semana: são ${escala.perguntas.length} perguntas rápidas. É só tocar em uma resposta.`
        : undefined;
    await conversa.robo(textoDaPergunta(escala, indice, introducao), momento);
    momento += 45_000;
    await conversa.paciente(checkin.digitadas?.[indice] ?? opcao.titulo, momento);
    momento += 5_000;
    respostas.push({
      perguntaId: pergunta.id,
      perguntaTexto: pergunta.texto,
      opcaoId: opcao.id,
      opcaoTitulo: opcao.titulo,
      pontos: opcao.pontos,
      risco: opcao.risco,
      respondidaEm: momento,
    });
    pontuacao += opcao.pontos;
    teveRisco ||= opcao.risco;
  }

  const prioridade = definirPrioridade(pontuacao, teveRisco, escala.faixas);
  await conversa.robo(mensagemFinalDoCheckin(teveRisco), momento);
  const id = await ctx.db.insert('checkins', {
    ...dadosDaEscala(escala),
    pacienteId: dados.pacienteId,
    organizationId: dados.organizationId,
    motivo: dados.primeiro ? 'cadastro' : 'semanal',
    situacao: 'concluido',
    proximaPergunta: escala.perguntas.length,
    respostas,
    pontuacao,
    teveRisco,
    prioridade,
    iniciadoEm: inicio,
    concluidoEm: momento,
  });
  return { id, pontuacao, prioridade, risco: teveRisco, em: momento };
}

function dadosDaEscala(escala: Doc<'escalasTriagem'>) {
  return {
    escalaId: escala._id,
    escalaVersao: escala.versao,
    escalaNome: escala.nome,
    escalaExemplo: escala.exemplo,
    faixas: escala.faixas,
    pontuacaoMaxima: pontuacaoMaxima(escala),
  };
}

function criarConversa(ctx: MutationCtx, pacienteId: Id<'pacientes'>) {
  return {
    robo: (texto: string, enviadaEm: number) =>
      ctx.db.insert('mensagensConversa', {
        pacienteId,
        direcao: 'saida',
        remetente: 'robo',
        texto,
        enviadaEm,
      }),
    paciente: (texto: string, enviadaEm: number) =>
      ctx.db.insert('mensagensConversa', {
        pacienteId,
        direcao: 'entrada',
        remetente: 'paciente',
        texto,
        enviadaEm,
      }),
  };
}

/** Removes a fictional patient created by an earlier run (everything, right away). */
async function apagarPacienteFicticia(ctx: MutationCtx, telefone: string) {
  const paciente = await ctx.db
    .query('pacientes')
    .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
    .unique();
  const porTelefone = await Promise.all([
    ctx.db
      .query('alertasCrise')
      .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
      .take(LOTE),
    ctx.db
      .query('canalConversas')
      .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
      .take(LOTE),
    ctx.db
      .query('canalMensagensPendentes')
      .withIndex('by_telefone', (q) => q.eq('telefone', telefone))
      .take(LOTE),
  ]);
  for (const documento of porTelefone.flat()) await ctx.db.delete(documento._id);
  if (!paciente) return;
  const pacienteId = paciente._id;
  const porPaciente = await Promise.all([
    ctx.db
      .query('mensagensConversa')
      .withIndex('by_pacienteId_and_enviadaEm', (q) => q.eq('pacienteId', pacienteId))
      .take(LOTE),
    ctx.db
      .query('checkins')
      .withIndex('by_pacienteId_and_iniciadoEm', (q) => q.eq('pacienteId', pacienteId))
      .take(LOTE),
    ctx.db
      .query('alertasPaciente')
      .withIndex('by_pacienteId_and_criadoEm', (q) => q.eq('pacienteId', pacienteId))
      .take(LOTE),
    ctx.db
      .query('eventosCaso')
      .withIndex('by_pacienteId_and_em', (q) => q.eq('pacienteId', pacienteId))
      .take(LOTE),
    ctx.db
      .query('avisosEquipe')
      .withIndex('by_pacienteId', (q) => q.eq('pacienteId', pacienteId))
      .take(LOTE),
  ]);
  for (const documento of porPaciente.flat()) await ctx.db.delete(documento._id);
  await ctx.db.delete('pacientes', pacienteId);
}
