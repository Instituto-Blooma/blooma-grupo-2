import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { conteudoEscalaValidator, faixasValidator, prioridadeValidator } from './lib/escala';

/** One option of a menu sent to a patient (button or list row). Used by `convex/canal.ts`. */
export const opcaoMenuValidator = v.object({
  id: v.string(),
  titulo: v.string(),
  descricao: v.optional(v.string()),
});

/** A question with options (buttons or list) — the kind the patient must answer. */
export const perguntaValidator = v.union(
  v.object({ tipo: v.literal('botoes'), texto: v.string(), opcoes: v.array(opcaoMenuValidator) }),
  v.object({
    tipo: v.literal('lista'),
    texto: v.string(),
    textoBotao: v.string(),
    opcoes: v.array(opcaoMenuValidator),
  })
);

/** Provider-neutral outgoing message. `convex/canal.ts` turns it into the WhatsApp payload. */
export const mensagemSaidaValidator = v.union(
  v.object({ tipo: v.literal('texto'), texto: v.string() }),
  ...perguntaValidator.members,
  v.object({
    tipo: v.literal('midia'),
    midia: v.union(v.literal('documento'), v.literal('video')),
    url: v.string(),
    legenda: v.optional(v.string()),
    nomeArquivo: v.optional(v.string()),
  })
);

const schema = defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAnonymous: v.optional(v.boolean()),
    onboardingStatus: v.optional(
      v.union(v.literal('pending'), v.literal('invited'), v.literal('active'))
    ),
    invitedAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  impersonationSessions: defineTable({
    adminUserId: v.id('users'),
    targetUserId: v.id('users'),
    startedAt: v.number(),
    expiresAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index('by_admin', ['adminUserId']),

  todos: defineTable({
    organizationId: v.string(),
    userId: v.id('users'),
    createdBy: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    completed: v.boolean(),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    dueDate: v.optional(v.float64()),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_and_user', ['organizationId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_user_and_completed', ['userId', 'completed'])
    .index('by_user_and_priority', ['userId', 'priority']),

  collabMarkdown: defineTable({
    organizationId: v.string(),
    documentId: v.string(),
    markdown: v.string(),
    updatedAt: v.number(),
    updatedBy: v.id('users'),
  })
    .index('by_documentId', ['documentId'])
    .index('by_org_and_document', ['organizationId', 'documentId']),

  // Messaging channel (WhatsApp today) — owned by convex/canal.ts.
  // Only the provider message ID is kept here, never the patient's text.
  canalMensagensRecebidas: defineTable({
    mensagemId: v.string(),
    telefone: v.string(),
    recebidaEm: v.number(),
  })
    .index('by_mensagemId', ['mensagemId'])
    .index('by_telefone', ['telefone']),

  canalConversas: defineTable({
    telefone: v.string(),
    ultimaMensagemPacienteEm: v.number(),
    // Question waiting for an answer (cleared once answered) and wrong answers to it so far.
    perguntaAtual: v.optional(perguntaValidator),
    tentativasErradas: v.optional(v.number()),
  }).index('by_telefone', ['telefone']),

  // Messages held back because the 24h reply window was closed; sent when the patient writes.
  canalMensagensPendentes: defineTable({
    telefone: v.string(),
    mensagem: mensagemSaidaValidator,
    criadaEm: v.number(),
  }).index('by_telefone', ['telefone']),

  // Patients and their conversation — owned by convex/pacientes.ts.
  // `organizationId` (the hospital) stays empty until the patient is linked to one.
  pacientes: defineTable({
    telefone: v.string(),
    organizationId: v.optional(v.string()),
    consentimento: v.optional(v.object({ versaoTermo: v.string(), aceitoEm: v.number() })),
    exclusaoPedidaEm: v.optional(v.number()),
    criadaEm: v.number(),

    // Sign-up after consent, asked by the bot (owned by convex/triagem.ts). The team can fix it.
    nomeCompleto: v.optional(v.string()),
    apelido: v.optional(v.string()),
    /** Hospital record number, for a future link to the patient's medical record. */
    prontuario: v.optional(v.string()),
    /** Which sign-up answer the bot is waiting for; empty when not in sign-up. */
    etapaCadastro: v.optional(
      v.union(v.literal('nome'), v.literal('apelido'), v.literal('prontuario'))
    ),
    cadastroConcluidoEm: v.optional(v.number()),

    // Check-in and team queue (owned by convex/triagem.ts and convex/equipe.ts).
    checkinAtualId: v.optional(v.id('checkins')),
    ultimoCheckinEm: v.optional(v.number()),
    ultimaPontuacao: v.optional(v.number()),
    prioridade: v.optional(prioridadeValidator),
    /** True while the case waits for the team or is being handled (open case). */
    naFila: v.optional(v.boolean()),
    /** Queue order: 0 urgent … 3 low, 9 no priority yet. See ORDEM_PRIORIDADE. */
    ordemFila: v.optional(v.number()),
    naFilaDesde: v.optional(v.number()),
    situacaoCaso: v.optional(
      v.union(v.literal('aguardando'), v.literal('em_atendimento'), v.literal('concluido'))
    ),
    responsavelId: v.optional(v.id('users')),
  })
    .index('by_telefone', ['telefone'])
    .index('by_organizationId', ['organizationId'])
    .index('by_organizationId_and_exclusaoPedidaEm', ['organizationId', 'exclusaoPedidaEm'])
    .index('by_organizationId_and_naFila_and_ordemFila_and_naFilaDesde', [
      'organizationId',
      'naFila',
      'ordemFila',
      'naFilaDesde',
    ])
    .searchIndex('search_nomeCompleto', {
      searchField: 'nomeCompleto',
      filterFields: ['organizationId'],
    }),

  // How each team member appears to patients: "*Ana (psicóloga):*". Filled on first access.
  perfisEquipe: defineTable({
    userId: v.id('users'),
    nome: v.string(),
    funcao: v.string(),
    atualizadoEm: v.number(),
  }).index('by_userId', ['userId']),

  // Case history: who took over and who closed it, and when.
  eventosCaso: defineTable({
    pacienteId: v.id('pacientes'),
    organizationId: v.string(),
    usuarioId: v.id('users'),
    tipo: v.union(v.literal('assumiu'), v.literal('concluiu')),
    em: v.number(),
  }).index('by_pacienteId_and_em', ['pacienteId', 'em']),

  // Triage scale versions (data, so the psychology team can replace them). The most recent one
  // is used for new check-ins. See convex/lib/escala.ts.
  escalasTriagem: defineTable({
    ...conteudoEscalaValidator.fields,
    publicadaEm: v.number(),
  })
    .index('by_versao', ['versao'])
    .index('by_publicadaEm', ['publicadaEm']),

  // One check-in = one pass through the scale. Answers keep the question and option text as
  // they were shown, so old check-ins still read correctly after the scale changes.
  checkins: defineTable({
    pacienteId: v.id('pacientes'),
    organizationId: v.string(),
    escalaId: v.id('escalasTriagem'),
    escalaVersao: v.string(),
    escalaNome: v.string(),
    escalaExemplo: v.boolean(),
    faixas: faixasValidator,
    pontuacaoMaxima: v.number(),
    motivo: v.union(v.literal('cadastro'), v.literal('semanal')),
    situacao: v.union(v.literal('em_andamento'), v.literal('concluido'), v.literal('interrompido')),
    motivoInterrupcao: v.optional(
      v.union(
        v.literal('sem_resposta'),
        v.literal('palavra_de_risco'),
        v.literal('robo_nao_entendeu')
      )
    ),
    /** Index of the next question to ask. */
    proximaPergunta: v.number(),
    respostas: v.array(
      v.object({
        perguntaId: v.string(),
        perguntaTexto: v.string(),
        opcaoId: v.string(),
        opcaoTitulo: v.string(),
        pontos: v.number(),
        risco: v.boolean(),
        respondidaEm: v.number(),
      })
    ),
    pontuacao: v.number(),
    teveRisco: v.boolean(),
    prioridade: v.optional(prioridadeValidator),
    iniciadoEm: v.number(),
    concluidoEm: v.optional(v.number()),
  }).index('by_pacienteId_and_iniciadoEm', ['pacienteId', 'iniciadoEm']),

  // Alerts shown on the patient's record (the hospital-wide `alertasCrise` stays as it is).
  alertasPaciente: defineTable({
    pacienteId: v.id('pacientes'),
    organizationId: v.string(),
    tipo: v.union(
      v.literal('resposta_de_risco'),
      v.literal('palavra_de_risco'),
      v.literal('robo_nao_entendeu')
    ),
    checkinId: v.optional(v.id('checkins')),
    criadoEm: v.number(),
  }).index('by_pacienteId_and_criadoEm', ['pacienteId', 'criadoEm']),

  // Hospitals the bot serves: one organization each, with a short code ("ACC") that links a
  // patient whose first message contains it (e.g. from a wa.me link or QR code).
  hospitais: defineTable({
    organizationId: v.string(),
    codigo: v.string(),
  })
    .index('by_codigo', ['codigo'])
    .index('by_organizationId', ['organizationId']),

  // Editable list of risk words/phrases (stored normalized: lowercase, no accents).
  palavrasDeRisco: defineTable({
    termo: v.string(),
    criadaEm: v.number(),
  }).index('by_termo', ['termo']),

  // Crisis alerts: phone and time only, never the text. No hospital yet = shown once linked.
  alertasCrise: defineTable({
    telefone: v.string(),
    organizationId: v.optional(v.string()),
    criadoEm: v.number(),
  })
    .index('by_telefone', ['telefone'])
    .index('by_organizationId_and_criadoEm', ['organizationId', 'criadoEm']),

  // Minimal record that a patient's data was deleted — nothing about the patient herself.
  exclusoesRealizadas: defineTable({
    organizationId: v.string(),
    apagadoPor: v.id('users'),
    apagadoEm: v.number(),
  }).index('by_organizationId', ['organizationId']),

  // Stored only after the patient accepted the current consent term.
  mensagensConversa: defineTable({
    pacienteId: v.id('pacientes'),
    direcao: v.union(v.literal('entrada'), v.literal('saida')),
    texto: v.string(),
    remetente: v.union(v.literal('paciente'), v.literal('robo'), v.literal('profissional')),
    profissionalId: v.optional(v.id('users')),
    enviadaEm: v.number(),
  }).index('by_pacienteId_and_enviadaEm', ['pacienteId', 'enviadaEm']),

  // Consent term versions; the most recent one is the term patients must accept.
  termosConsentimento: defineTable({
    versao: v.string(),
    texto: v.string(),
    publicadoEm: v.number(),
  })
    .index('by_versao', ['versao'])
    .index('by_publicadoEm', ['publicadoEm']),
});

export default schema;
