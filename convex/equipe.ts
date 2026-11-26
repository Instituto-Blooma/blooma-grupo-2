/**
 * Site of the hospital psychology team. Every function checks, on the server, that the user is a
 * member of the patient's hospital (organization). Any member of the hospital sees all of its
 * patients; no other hospital sees them.
 *
 * - Queue: open cases, most urgent first, then who has waited longest.
 * - All patients: every patient of the hospital, newest first, with search by full name.
 * - Record: sign-up data, case, check-ins with answers and points, alerts, case history.
 * - Conversation: history (`pacientes.listarMensagens`) and sending a message signed with the
 *   professional's name and role, as set in her profile.
 */
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/auth';
import { ORDEM_PRIORIDADE, ORDEM_SEM_PRIORIDADE } from './lib/escala';
import {
  mensagemDoLink,
  requireAcessoAPaciente,
  requireMembroDoHospital,
  temConsentimentoAtual,
} from './pacientes';

const MAX_TEXTO_MENSAGEM = 3000;
const MAX_ALERTAS_NA_FICHA = 50;
const MAX_EVENTOS_NA_FICHA = 50;
const MAX_ALERTAS_NA_LINHA = 5;
const MAX_NOME_PERFIL = 60;
const MAX_FUNCAO_PERFIL = 40;
const MAX_CONTAGEM = 100;
const MAX_AVISOS_POR_VEZ = 200;
const MAX_PALAVRAS_MOSTRADAS = 100;

// ---------------------------------------------------------------------------
// Professional profile (name and role shown to patients)
// ---------------------------------------------------------------------------

export const meuPerfil = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const perfil = await buscarPerfil(ctx, userId);
    return perfil ? { nome: perfil.nome, funcao: perfil.funcao } : null;
  },
});

export const salvarMeuPerfil = mutation({
  args: { nome: v.string(), funcao: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const nome = args.nome.trim().replace(/\s+/g, ' ');
    const funcao = args.funcao.trim().replace(/\s+/g, ' ');
    if (!nome || nome.length > MAX_NOME_PERFIL) {
      throw new ConvexError(`Escreva seu nome (até ${MAX_NOME_PERFIL} letras).`);
    }
    if (!funcao || funcao.length > MAX_FUNCAO_PERFIL) {
      throw new ConvexError(`Escreva sua função (até ${MAX_FUNCAO_PERFIL} letras).`);
    }
    const existente = await buscarPerfil(ctx, userId);
    if (existente) {
      await ctx.db.patch('perfisEquipe', existente._id, { nome, funcao, atualizadoEm: Date.now() });
    } else {
      await ctx.db.insert('perfisEquipe', { userId, nome, funcao, atualizadoEm: Date.now() });
    }
    return null;
  },
});

async function buscarPerfil(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('perfisEquipe')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

async function nomeDoProfissional(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const perfil = await buscarPerfil(ctx, userId);
  if (perfil) return `${perfil.nome} (${perfil.funcao})`;
  const usuario = await ctx.db.get('users', userId);
  return usuario?.name ?? usuario?.email ?? 'Alguém da equipe';
}

// ---------------------------------------------------------------------------
// Queue and list
// ---------------------------------------------------------------------------

const filtroFilaValidator = v.union(
  v.literal('todos'),
  v.literal('risco'),
  v.literal('nao_entendeu')
);

/**
 * Open cases of the hospital: urgent first, then high, moderate, low; within each, oldest first.
 * Filter "risco": cases with a real-risk alert. Filter "nao_entendeu": the bot did not understand.
 */
export const fila = query({
  args: {
    organizationId: v.string(),
    filtro: v.optional(filtroFilaValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const consulta = ctx.db.query('pacientes');
    const filtro = args.filtro ?? 'todos';
    const pagina = await (
      filtro === 'risco'
        ? consulta.withIndex(
            'by_organizationId_and_alertaRisco_and_ordemFila_and_naFilaDesde',
            (q) =>
              q
                .eq('organizationId', args.organizationId)

                .eq('alertaRisco', true)
          )
        : filtro === 'nao_entendeu'
          ? consulta.withIndex(
              'by_organizationId_and_alertaRobo_and_ordemFila_and_naFilaDesde',
              (q) =>
                q
                  .eq('organizationId', args.organizationId)

                  .eq('alertaRobo', true)
            )
          : consulta.withIndex('by_organizationId_and_naFila_and_ordemFila_and_naFilaDesde', (q) =>
              q.eq('organizationId', args.organizationId).eq('naFila', true)
            )
    ).paginate(args.paginationOpts);
    return {
      ...pagina,
      page: await Promise.all(pagina.page.map((paciente) => linhaDaPaciente(ctx, paciente))),
    };
  },
});

/** How many open cases have each kind of alert, and how many notices are unread (max. 100). */
export const resumoDaFila = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const [comRisco, naoEntendidos, avisos] = await Promise.all([
      ctx.db
        .query('pacientes')
        .withIndex('by_organizationId_and_alertaRisco_and_ordemFila_and_naFilaDesde', (q) =>
          q.eq('organizationId', args.organizationId).eq('alertaRisco', true)
        )
        .take(MAX_CONTAGEM + 1),
      ctx.db
        .query('pacientes')
        .withIndex('by_organizationId_and_alertaRobo_and_ordemFila_and_naFilaDesde', (q) =>
          q
            .eq('organizationId', args.organizationId)

            .eq('alertaRobo', true)
        )
        .take(MAX_CONTAGEM + 1),
      ctx.db
        .query('avisosEquipe')
        .withIndex('by_organizationId_and_visto_and_criadoEm', (q) =>
          q.eq('organizationId', args.organizationId).eq('visto', false)
        )
        .take(MAX_CONTAGEM + 1),
    ]);
    const contar = (lista: unknown[]) => ({
      total: Math.min(lista.length, MAX_CONTAGEM),
      mais: lista.length > MAX_CONTAGEM,
    });
    return {
      risco: contar(comRisco),
      naoEntendeu: contar(naoEntendidos),
      avisosNaoVistos: contar(avisos),
    };
  },
});

// ---------------------------------------------------------------------------
// Notices (low-priority check-ins: no case is opened)
// ---------------------------------------------------------------------------

/** Unread notices (newest first); with `vistos: true`, the ones already read. */
export const avisos = query({
  args: {
    organizationId: v.string(),
    vistos: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const pagina = await ctx.db
      .query('avisosEquipe')
      .withIndex('by_organizationId_and_visto_and_criadoEm', (q) =>
        q.eq('organizationId', args.organizationId).eq('visto', args.vistos)
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...pagina,
      page: await Promise.all(
        pagina.page.map(async (aviso) => {
          const [paciente, checkin] = await Promise.all([
            ctx.db.get('pacientes', aviso.pacienteId),
            ctx.db.get('checkins', aviso.checkinId),
          ]);
          return {
            _id: aviso._id,
            pacienteId: aviso.pacienteId,
            nomeCompleto: paciente?.nomeCompleto ?? null,
            apelido: paciente?.apelido ?? null,
            telefone: paciente?.telefone ?? '',
            concluidoEm: checkin?.concluidoEm ?? aviso.criadoEm,
            pontuacao: checkin?.pontuacao ?? null,
            pontuacaoMaxima: checkin?.pontuacaoMaxima ?? null,
            vistoPor: aviso.vistoPor ? await nomeDoProfissional(ctx, aviso.vistoPor) : null,
            vistoEm: aviso.vistoEm ?? null,
          };
        })
      ),
    };
  },
});

export const marcarAvisoComoVisto = mutation({
  args: { avisoId: v.id('avisosEquipe') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const aviso = await ctx.db.get('avisosEquipe', args.avisoId);
    if (!aviso) throw new ConvexError('Aviso não encontrado.');
    const userId = await requireMembroDoHospital(ctx, aviso.organizationId);
    if (!aviso.visto) {
      await ctx.db.patch('avisosEquipe', aviso._id, {
        visto: true,
        vistoPor: userId,
        vistoEm: Date.now(),
      });
    }
    return null;
  },
});

export const marcarTodosOsAvisosComoVistos = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireMembroDoHospital(ctx, args.organizationId);
    const naoVistos = await ctx.db
      .query('avisosEquipe')
      .withIndex('by_organizationId_and_visto_and_criadoEm', (q) =>
        q.eq('organizationId', args.organizationId).eq('visto', false)
      )
      .take(MAX_AVISOS_POR_VEZ);
    const agora = Date.now();
    for (const aviso of naoVistos) {
      await ctx.db.patch('avisosEquipe', aviso._id, {
        visto: true,
        vistoPor: userId,
        vistoEm: agora,
      });
    }
    return null;
  },
});

/** Every patient of the hospital, newest first, or those whose full name matches `busca`. */
export const todasAsPacientes = query({
  args: {
    organizationId: v.string(),
    busca: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const busca = args.busca?.trim();
    const pagina = busca
      ? await ctx.db
          .query('pacientes')
          .withSearchIndex('search_nomeCompleto', (q) =>
            q.search('nomeCompleto', busca).eq('organizationId', args.organizationId)
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('pacientes')
          .withIndex('by_organizationId', (q) => q.eq('organizationId', args.organizationId))
          .order('desc')
          .paginate(args.paginationOpts);
    return {
      ...pagina,
      page: await Promise.all(pagina.page.map((paciente) => linhaDaPaciente(ctx, paciente))),
    };
  },
});

async function linhaDaPaciente(ctx: QueryCtx, paciente: Doc<'pacientes'>) {
  const alertasDoCaso =
    paciente.naFila && paciente.naFilaDesde !== undefined
      ? await ctx.db
          .query('alertasPaciente')
          .withIndex('by_pacienteId_and_criadoEm', (q) =>
            q.eq('pacienteId', paciente._id).gte('criadoEm', paciente.naFilaDesde ?? 0)
          )
          .order('desc')
          .take(MAX_ALERTAS_NA_LINHA)
      : [];
  return {
    _id: paciente._id,
    nomeCompleto: paciente.nomeCompleto ?? null,
    apelido: paciente.apelido ?? null,
    telefone: paciente.telefone,
    criadaEm: paciente.criadaEm,
    aceitouTermo: await temConsentimentoAtual(ctx, paciente),
    cadastroCompleto: paciente.cadastroConcluidoEm !== undefined,
    prioridade: paciente.prioridade ?? null,
    ultimaPrioridade: paciente.ultimaPrioridade ?? null,
    alertaRisco: paciente.naFila === true && paciente.alertaRisco === true,
    alertaRobo: paciente.naFila === true && paciente.alertaRobo === true,
    ultimaPontuacao: paciente.ultimaPontuacao ?? null,
    ultimoCheckinEm: paciente.ultimoCheckinEm ?? null,
    checkinEmAndamento: paciente.checkinAtualId !== undefined,
    naFila: paciente.naFila === true,
    naFilaDesde: paciente.naFilaDesde ?? null,
    situacaoCaso: paciente.situacaoCaso ?? null,
    responsavel: paciente.responsavelId
      ? await nomeDoProfissional(ctx, paciente.responsavelId)
      : null,
    alertas: [...new Set(alertasDoCaso.map((alerta) => alerta.tipo))],
    exclusaoPedida: paciente.exclusaoPedidaEm !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Patient record
// ---------------------------------------------------------------------------

export const ficha = query({
  args: { pacienteId: v.id('pacientes') },
  handler: async (ctx, args) => {
    const { paciente, userId } = await requireAcessoAPaciente(ctx, args.pacienteId);
    const [alertas, alertasDeCrise, eventos, escala] = await Promise.all([
      ctx.db
        .query('alertasPaciente')
        .withIndex('by_pacienteId_and_criadoEm', (q) => q.eq('pacienteId', paciente._id))
        .order('desc')
        .take(MAX_ALERTAS_NA_FICHA),
      ctx.db
        .query('alertasCrise')
        .withIndex('by_telefone', (q) => q.eq('telefone', paciente.telefone))
        .take(MAX_ALERTAS_NA_FICHA),
      ctx.db
        .query('eventosCaso')
        .withIndex('by_pacienteId_and_em', (q) => q.eq('pacienteId', paciente._id))
        .order('desc')
        .take(MAX_EVENTOS_NA_FICHA),
      ctx.db.query('escalasTriagem').withIndex('by_publicadaEm').order('desc').first(),
    ]);
    const perfil = await buscarPerfil(ctx, userId);
    return {
      linha: await linhaDaPaciente(ctx, paciente),
      prontuario: paciente.prontuario ?? null,
      etapaCadastro: paciente.etapaCadastro ?? null,
      consentimentoEm: paciente.consentimento?.aceitoEm ?? null,
      souResponsavel: paciente.responsavelId === userId,
      tenhoPerfil: perfil !== null,
      escalaAtual: escala ? { nome: escala.nome, exemplo: escala.exemplo } : null,
      alertas: alertas.map((alerta) => ({
        _id: alerta._id,
        tipo: alerta.tipo,
        criadoEm: alerta.criadoEm,
      })),
      // Hospital-wide crisis alerts (risk words), also those from before consent.
      alertasDeCrise: alertasDeCrise.map((alerta) => alerta.criadoEm).toSorted((a, b) => b - a),
      eventos: await Promise.all(
        eventos.map(async (evento) => ({
          _id: evento._id,
          tipo: evento.tipo,
          em: evento.em,
          quem: await nomeDoProfissional(ctx, evento.usuarioId),
        }))
      ),
    };
  },
});

/** Check-ins of one patient, newest first, with every answer and its points. */
export const listarCheckins = query({
  args: { pacienteId: v.id('pacientes'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAcessoAPaciente(ctx, args.pacienteId);
    const pagina = await ctx.db
      .query('checkins')
      .withIndex('by_pacienteId_and_iniciadoEm', (q) => q.eq('pacienteId', args.pacienteId))
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...pagina,
      page: pagina.page.map((checkin) => ({
        _id: checkin._id,
        escalaNome: checkin.escalaNome,
        escalaExemplo: checkin.escalaExemplo,
        motivo: checkin.motivo,
        situacao: checkin.situacao,
        motivoInterrupcao: checkin.motivoInterrupcao ?? null,
        respostas: checkin.respostas,
        pontuacao: checkin.pontuacao,
        pontuacaoMaxima: checkin.pontuacaoMaxima,
        teveRisco: checkin.teveRisco,
        prioridade: checkin.prioridade ?? null,
        iniciadoEm: checkin.iniciadoEm,
        concluidoEm: checkin.concluidoEm ?? null,
      })),
    };
  },
});

/** The team fixes the sign-up data. Empty fields are cleared. */
export const editarCadastro = mutation({
  args: {
    pacienteId: v.id('pacientes'),
    nomeCompleto: v.string(),
    apelido: v.string(),
    prontuario: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { paciente } = await requireAcessoAPaciente(ctx, args.pacienteId);
    const limpar = (texto: string, maximo: number) =>
      texto.trim().replace(/\s+/g, ' ').slice(0, maximo) || undefined;
    await ctx.db.patch('pacientes', paciente._id, {
      nomeCompleto: limpar(args.nomeCompleto, 120),
      apelido: limpar(args.apelido, 40),
      prontuario: limpar(args.prontuario, 30),
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Case: take over and close
// ---------------------------------------------------------------------------

/** "Assumir caso": I am now responsible. Also works on a closed case (it opens again). */
export const assumirCaso = mutation({
  args: { pacienteId: v.id('pacientes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { paciente, userId } = await requireAcessoAPaciente(ctx, args.pacienteId);
    if (paciente.naFila && paciente.responsavelId === userId) return null;
    const aberto = paciente.naFila === true;
    // A new case (e.g. from a low-priority notice) starts with the last check-in's priority.
    const prioridade = aberto ? paciente.prioridade : paciente.ultimaPrioridade;
    await ctx.db.patch('pacientes', paciente._id, {
      naFila: true,
      situacaoCaso: 'em_atendimento',
      responsavelId: userId,
      prioridade,
      naFilaDesde: aberto ? (paciente.naFilaDesde ?? Date.now()) : Date.now(),
      ordemFila: aberto
        ? (paciente.ordemFila ?? ORDEM_SEM_PRIORIDADE)
        : prioridade
          ? ORDEM_PRIORIDADE[prioridade]
          : ORDEM_SEM_PRIORIDADE,
      alertaRisco: aberto ? paciente.alertaRisco === true : false,
      alertaRobo: aberto ? paciente.alertaRobo === true : false,
    });
    await registrarEvento(ctx, paciente, userId, 'assumiu');
    return null;
  },
});

/** "Concluir caso": leaves the queue. A new check-in or alert opens a new case. */
export const concluirCaso = mutation({
  args: { pacienteId: v.id('pacientes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { paciente, userId } = await requireAcessoAPaciente(ctx, args.pacienteId);
    if (!paciente.naFila) {
      throw new ConvexError('Este caso já está concluído.');
    }
    await ctx.db.patch('pacientes', paciente._id, {
      naFila: false,
      situacaoCaso: 'concluido',
      alertaRisco: false,
      alertaRobo: false,
    });
    await registrarEvento(ctx, paciente, userId, 'concluiu');
    return null;
  },
});

async function registrarEvento(
  ctx: MutationCtx,
  paciente: Doc<'pacientes'> & { organizationId: string },
  usuarioId: Id<'users'>,
  tipo: Doc<'eventosCaso'>['tipo']
) {
  await ctx.db.insert('eventosCaso', {
    pacienteId: paciente._id,
    organizationId: paciente.organizationId,
    usuarioId,
    tipo,
    em: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

/** Sends a message to the patient's WhatsApp, starting with "*Ana (psicóloga):*". */
export const enviarMensagem = mutation({
  args: { pacienteId: v.id('pacientes'), texto: v.string() },
  returns: v.object({
    situacao: v.union(v.literal('enviada'), v.literal('aguardando_paciente')),
  }),
  handler: async (ctx, args) => {
    const { paciente, userId } = await requireAcessoAPaciente(ctx, args.pacienteId);
    const texto = args.texto.trim();
    if (!texto) {
      throw new ConvexError('Escreva a mensagem.');
    }
    if (texto.length > MAX_TEXTO_MENSAGEM) {
      throw new ConvexError(`A mensagem pode ter até ${MAX_TEXTO_MENSAGEM} letras.`);
    }
    if (!(await temConsentimentoAtual(ctx, paciente))) {
      throw new ConvexError('Ela ainda não aceitou o termo: não é possível mandar mensagens.');
    }
    if (paciente.exclusaoPedidaEm) {
      throw new ConvexError('Ela pediu para apagar os dados: não é possível mandar mensagens.');
    }
    const perfil = await buscarPerfil(ctx, userId);
    if (!perfil) {
      throw new ConvexError('Preencha seu nome e sua função em "Meu perfil" antes de escrever.');
    }
    const resultado: { situacao: 'enviada' | 'aguardando_paciente' } = await ctx.runMutation(
      internal.canal.enviarTexto,
      {
        telefone: paciente.telefone,
        texto,
        remetente: {
          tipo: 'profissional',
          nome: perfil.nome,
          funcao: perfil.funcao,
          usuarioId: userId,
        },
      }
    );
    return resultado;
  },
});

// ---------------------------------------------------------------------------
// Settings page (read-only data the team should know about)
// ---------------------------------------------------------------------------

/** Hospital code for WhatsApp, current scale and consent term, number of risk words. */
export const configuracoes = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await requireMembroDoHospital(ctx, args.organizationId);
    const [hospital, escala, termo, palavras] = await Promise.all([
      ctx.db
        .query('hospitais')
        .withIndex('by_organizationId', (q) => q.eq('organizationId', args.organizationId))
        .unique(),
      ctx.db.query('escalasTriagem').withIndex('by_publicadaEm').order('desc').first(),
      ctx.db.query('termosConsentimento').withIndex('by_publicadoEm').order('desc').first(),
      ctx.db.query('palavrasDeRisco').take(MAX_PALAVRAS_MOSTRADAS + 1),
    ]);
    return {
      codigoWhatsApp: hospital?.codigo ?? null,
      mensagemDoLink: hospital ? mensagemDoLink(hospital.codigo) : null,
      escala: escala
        ? {
            nome: escala.nome,
            versao: escala.versao,
            exemplo: escala.exemplo,
            perguntas: escala.perguntas.length,
            pontuacaoMaxima: escala.perguntas.reduce(
              (total, pergunta) =>
                total + Math.max(...pergunta.opcoes.map((opcao) => opcao.pontos)),
              0
            ),
            faixas: escala.faixas,
            publicadaEm: escala.publicadaEm,
          }
        : null,
      termo: termo ? { versao: termo.versao, publicadoEm: termo.publicadoEm } : null,
      palavrasDeRisco: {
        total: Math.min(palavras.length, MAX_PALAVRAS_MOSTRADAS),
        mais: palavras.length > MAX_PALAVRAS_MOSTRADAS,
      },
    };
  },
});
