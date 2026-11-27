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
import { configuracaoDoHospital, type ConfiguracaoTriagem } from './lib/configuracaoTriagem';
import {
  calcularResultados,
  definirPrioridadeTriagem,
  lerNumero,
  PROTOCOLO_RASCUNHO,
  type Resposta,
} from './lib/protocolo';
import { normalizarTexto } from './lib/texto';
import { tenantsClient } from './lib/tenantsClient';
import { MENSAGEM_CRISE } from './pacientes';
import { colocarNaFila, mensagemFinalDoCheckin, textoDaEtapa, ultimoProtocolo } from './triagem';

/** First-setup hospital (convex/testing/e2e.ts); older local setups still have "acme-corp". */
const SLUGS_PADRAO = ['ac-camargo', 'acme-corp'];
const CODIGO_DO_HOSPITAL = 'ACC';
const DIA = 24 * 60 * 60 * 1000;
const LOTE = 500;

type Triagem = {
  diasAtras: number;
  /** Distress Thermometer (0 to 10), as she typed it. */
  dt: string;
  /** Marked item numbers of each DT problem category, in protocol order (missing = "nenhum"). */
  problemas?: number[][];
  /** "Outros problemas" (null = "nenhum"). */
  outros?: string | null;
  /** Option position (0 to 3) of each GAD-7 / PHQ-9 question; missing = not applied. */
  gad7?: number[];
  phq9?: number[];
};

type PacienteFicticia = {
  final: string;
  nomeCompleto: string;
  apelido: string;
  prontuario?: string;
  criadaHaDias: number;
  triagem?: Triagem;
  extra?: 'palavra_de_risco' | 'robo_nao_entendeu' | 'cadastro_incompleto' | 'sem_termo';
};

const PACIENTES: PacienteFicticia[] = [
  {
    final: '01',
    nomeCompleto: 'Joana Pereira',
    apelido: 'Jo',
    prontuario: '000123-4',
    criadaHaDias: 15,
    triagem: {
      diasAtras: 1,
      dt: 'oito',
      problemas: [[1], [], [1], [], [1]],
      outros: 'Não consigo dormir direito',
      gad7: [2, 2, 2, 2, 2, 2, 2],
      phq9: [2, 2, 2, 2, 1, 1, 2, 1, 1],
    },
  },
  {
    final: '02',
    nomeCompleto: 'Luíza Costa',
    apelido: 'Lu',
    prontuario: '000245-1',
    criadaHaDias: 20,
    triagem: {
      diasAtras: 2,
      dt: '7',
      problemas: [[], [1], [1], [], []],
      outros: null,
      gad7: [3, 3, 2, 2, 3, 2, 2],
      phq9: [1, 1, 1, 1, 1, 0, 1, 0, 0],
    },
    extra: 'palavra_de_risco',
  },
  {
    final: '03',
    nomeCompleto: 'Teresa Alves',
    apelido: 'Teresa',
    criadaHaDias: 22,
    triagem: {
      diasAtras: 2,
      dt: '6',
      problemas: [[1], [], [1], [], [1]],
      outros: null,
      gad7: [1, 1, 1, 1, 1, 1, 1],
      phq9: [2, 2, 2, 2, 2, 2, 2, 1, 0],
    },
  },
  {
    final: '04',
    nomeCompleto: 'Cláudia Moura',
    apelido: 'Cau',
    prontuario: '000377-9',
    criadaHaDias: 12,
    triagem: {
      diasAtras: 2,
      dt: '5',
      problemas: [[1], [], [], [], [1]],
      outros: null,
      gad7: [1, 1, 1, 1, 1, 1, 1],
      phq9: [1, 1, 1, 1, 1, 1, 0, 0, 0],
    },
  },
  {
    final: '05',
    nomeCompleto: 'Rita Gomes',
    apelido: 'Rita',
    criadaHaDias: 6,
    extra: 'robo_nao_entendeu',
  },
  {
    final: '06',
    nomeCompleto: 'Maria Silva',
    apelido: 'Mari',
    prontuario: '000412-0',
    criadaHaDias: 30,
    // DT below the cut: GAD-7 and PHQ-9 are not applied.
    triagem: { diasAtras: 2, dt: '2', problemas: [[], [], [], [], [1]], outros: null },
  },
  {
    final: '07',
    nomeCompleto: 'Helena Rocha',
    apelido: 'Helena',
    criadaHaDias: 10,
    triagem: { diasAtras: 2, dt: 'tres', outros: null },
  },
  {
    final: '08',
    nomeCompleto: 'Beatriz Nunes',
    apelido: '',
    criadaHaDias: 1,
    extra: 'cadastro_incompleto',
  },
  {
    final: '09',
    nomeCompleto: '',
    apelido: '',
    criadaHaDias: 0,
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
    const { termo, protocolo } = await prepararConfiguracao(ctx, hospital._id, agora);
    const configuracao = await configuracaoDoHospital(ctx, hospital._id);

    for (const ficticia of PACIENTES) {
      await apagarPacienteFicticia(ctx, telefoneDe(ficticia.final));
      await criarPaciente(ctx, ficticia, hospital._id, termo, protocolo, configuracao, agora);
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

/** Hospital code, consent term, risk words and protocol: created only when missing. */
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

  let protocolo = await ultimoProtocolo(ctx);
  if (!protocolo) {
    const id = await ctx.db.insert('protocolosTriagem', {
      ...PROTOCOLO_RASCUNHO,
      publicadoEm: agora - 60 * DIA,
    });
    protocolo = await ctx.db.get('protocolosTriagem', id);
  }
  if (!termo || !protocolo) throw new Error('Failed to prepare demo configuration');
  return { termo, protocolo };
}

async function criarPaciente(
  ctx: MutationCtx,
  ficticia: PacienteFicticia,
  organizationId: string,
  termo: Doc<'termosConsentimento'>,
  protocolo: Doc<'protocolosTriagem'>,
  configuracao: ConfiguracaoTriagem,
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

  if (ficticia.triagem) {
    await criarTriagem(ctx, {
      pacienteId,
      organizationId,
      protocolo,
      configuracao,
      triagem: ficticia.triagem,
      apelido: ficticia.apelido,
      conversa,
      agora,
    });
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
      ...dadosDoProtocolo(protocolo),
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
    const pergunta = textoDaEtapa(
      protocolo,
      0,
      configuracao,
      `Obrigado, ${ficticia.apelido}! Agora vou fazer algumas perguntas para a equipe de psicologia entender como você está.`
    );
    const naoEntendi = 'Não entendi. Responda só com um número inteiro de 0 a 10, por exemplo: 5.';
    await conversa.robo(pergunta, em);
    await conversa.paciente('oi?', em + 60_000);
    await conversa.robo(textoDaEtapa(protocolo, 0, configuracao, naoEntendi, true), em + 65_000);
    await conversa.paciente('não sei responder isso', em + 120_000);
    await conversa.robo(textoDaEtapa(protocolo, 0, configuracao, naoEntendi, true), em + 125_000);
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

/** One finished entry triage, with the WhatsApp conversation as the bot would have it. */
async function criarTriagem(
  ctx: MutationCtx,
  dados: {
    pacienteId: Id<'pacientes'>;
    organizationId: string;
    protocolo: Doc<'protocolosTriagem'>;
    configuracao: ConfiguracaoTriagem;
    triagem: Triagem;
    apelido: string;
    conversa: ReturnType<typeof criarConversa>;
    agora: number;
  }
) {
  const { protocolo, configuracao, triagem, conversa } = dados;
  const inicio = dados.agora - triagem.diasAtras * DIA;
  let momento = inicio;
  const respostas: Resposta[] = [];
  const aplicarGadPhq = triagem.gad7 !== undefined;
  let categoria = 0;
  const contagem = { gad7: 0, phq9: 0 };

  for (const [indice, etapa] of protocolo.etapas.entries()) {
    if (etapa.escala !== 'dt' && !aplicarGadPhq) break;
    const introducao =
      indice === 0
        ? `Obrigado, ${dados.apelido}! Agora vou fazer algumas perguntas para a equipe de psicologia entender como você está.`
        : undefined;
    await conversa.robo(textoDaEtapa(protocolo, indice, configuracao, introducao), momento);
    momento += 45_000;
    const base = { perguntaId: etapa.id, escala: etapa.escala, respondidaEm: momento };
    switch (etapa.tipo) {
      case 'numero':
        await conversa.paciente(triagem.dt, momento);
        respostas.push({
          ...base,
          perguntaTexto: etapa.texto,
          tipo: 'numero',
          valor: lerNumero(triagem.dt, etapa.minimo, etapa.maximo) ?? 0,
        });
        break;
      case 'problemas': {
        const marcados = new Set(triagem.problemas?.[categoria] ?? []);
        categoria += 1;
        const escrito = marcados.size ? [...marcados].join(', ') : 'nenhum';
        await conversa.paciente(escrito, momento);
        await conversa.robo(
          marcados.size
            ? `Entendi que estes itens de "${etapa.categoria}" acontecem com você:\n${[...marcados].map((n) => `${n}. ${etapa.itens[n - 1].texto}`).join('\n')}\n\nEstá certo?\n1. Certo\n2. Corrigir`
            : `Entendi que nenhum item de "${etapa.categoria}" acontece com você.\n\nEstá certo?\n1. Certo\n2. Corrigir`,
          momento + 5_000
        );
        await conversa.paciente('Certo', momento + 20_000);
        momento += 20_000;
        respostas.push({
          ...base,
          perguntaTexto: etapa.categoria,
          tipo: 'problemas',
          itens: etapa.itens.map((item, posicao) => ({
            id: item.id,
            texto: item.texto,
            sim: marcados.has(posicao + 1),
          })),
        });
        break;
      }
      case 'aberta':
        await conversa.paciente(triagem.outros ?? 'nenhum', momento);
        respostas.push({
          ...base,
          perguntaTexto: etapa.texto,
          tipo: 'aberta',
          texto: triagem.outros ?? null,
        });
        break;
      case 'escolha': {
        const lista = etapa.escala === 'gad7' ? triagem.gad7 : triagem.phq9;
        const posicao = lista?.[contagem[etapa.escala]] ?? 0;
        contagem[etapa.escala] += 1;
        const opcao = etapa.opcoes[Math.min(posicao, etapa.opcoes.length - 1)];
        await conversa.paciente(opcao.titulo, momento);
        respostas.push({
          ...base,
          perguntaTexto: etapa.texto,
          tipo: 'escolha',
          opcaoId: opcao.id,
          opcaoTitulo: opcao.titulo,
          pontos: opcao.pontos,
          risco: etapa.alertaDeRisco && opcao.pontos > 0,
        });
        break;
      }
    }
    momento += 5_000;
  }

  const resultados = calcularResultados(respostas, !aplicarGadPhq);
  const prioridade = definirPrioridadeTriagem(resultados, configuracao.cortes, configuracao.regra);
  await conversa.robo(mensagemFinalDoCheckin(resultados.riscoPhq9), momento);
  const id = await ctx.db.insert('checkins', {
    ...dadosDoProtocolo(protocolo),
    pacienteId: dados.pacienteId,
    organizationId: dados.organizationId,
    motivo: 'cadastro',
    situacao: 'concluido',
    proximaPergunta: respostas.length,
    respostas,
    resultados,
    prioridade,
    pontuacao: 0,
    teveRisco: resultados.riscoPhq9,
    iniciadoEm: inicio,
    concluidoEm: momento,
  });
  await ctx.db.patch('pacientes', dados.pacienteId, {
    ultimoCheckinEm: momento,
    ultimaPrioridade: prioridade,
    ultimasNotas: { dt: resultados.dt, gad7: resultados.gad7, phq9: resultados.phq9 },
  });
  if (prioridade === 'baixa') {
    await ctx.db.insert('avisosEquipe', {
      organizationId: dados.organizationId,
      pacienteId: dados.pacienteId,
      checkinId: id,
      tipo: 'checkin_prioridade_baixa',
      visto: false,
      criadoEm: momento,
    });
  } else {
    await colocarNaFila(ctx, dados.pacienteId, prioridade);
  }
  return { id, resultados, em: momento };
}

function dadosDoProtocolo(protocolo: Doc<'protocolosTriagem'>) {
  return {
    protocoloId: protocolo._id,
    protocoloVersao: protocolo.versao,
    protocoloNome: protocolo.nome,
    textoOficialPendente: protocolo.textoOficialPendente,
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
