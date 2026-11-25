import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { conversationStateValidator, priorityLevelValidator } from './lib/validators';

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

  // ---------------------------------------------------------------------------
  // Triagem psicológica (equipe de psicologia)
  // ---------------------------------------------------------------------------

  /** Papéis da equipe. Só quem tem `psicologa` acessa dados de paciente. */
  staffRoles: defineTable({
    userId: v.id('users'),
    role: v.literal('psicologa'),
    grantedAt: v.number(),
  }).index('by_userId', ['userId']),

  patients: defineTable({
    /** Nome ou apelido que a própria paciente informou. */
    displayName: v.optional(v.string()),
    /** Telefone no formato do provedor. Nunca vai para log, URL ou tela da fila. */
    phone: v.string(),
    /** Quando a paciente aceitou o termo. Sem aceite, o check-in não começa. */
    consentAcceptedAt: v.optional(v.number()),
    consentDeclinedAt: v.optional(v.number()),
    /** Estado da conversa (máquina em convex/lib/conversation.ts). */
    conversation: conversationStateValidator,
    // Resumo do último check-in (desnormalizado para a fila).
    priority: v.optional(priorityLevelValidator),
    /** 0 = alta, 1 = média, 2 = baixa, 3 = sem check-in. */
    priorityRank: v.number(),
    score: v.optional(v.number()),
    lastCheckinAt: v.optional(v.number()),
    hasRiskSignal: v.boolean(),
    lastReminderAt: v.optional(v.number()),
    assignedTo: v.optional(v.id('users')),
    assignedAt: v.optional(v.number()),
    /** true para pacientes do seed/simulador (nunca dado real). */
    fictitious: v.boolean(),
  })
    .index('by_phone', ['phone'])
    .index('by_priorityRank', ['priorityRank'])
    .index('by_fictitious', ['fictitious']),

  checkins: defineTable({
    patientId: v.id('patients'),
    status: v.union(v.literal('em_andamento'), v.literal('concluido')),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    /** Respostas pergunta a pergunta, com o texto da época (o questionário pode mudar). */
    answers: v.array(
      v.object({
        questionId: v.string(),
        scaleId: v.string(),
        questionText: v.string(),
        optionLabel: v.string(),
        value: v.number(),
        triggeredRisk: v.boolean(),
        answeredAt: v.number(),
      })
    ),
    scaleScores: v.optional(
      v.array(v.object({ scaleId: v.string(), label: v.string(), score: v.number(), max: v.number() }))
    ),
    score: v.optional(v.number()),
    priority: v.optional(priorityLevelValidator),
    riskSignal: v.boolean(),
    /** Versão da configuração usada no cálculo (PROVISÓRIO). */
    configVersion: v.optional(v.string()),
  }).index('by_patientId_and_startedAt', ['patientId', 'startedAt']),

  messages: defineTable({
    patientId: v.id('patients'),
    direction: v.union(v.literal('entrada'), v.literal('saida')),
    origin: v.union(
      v.literal('paciente'),
      v.literal('bot'),
      v.literal('psicologa'),
      v.literal('lembrete'),
      v.literal('crise')
    ),
    text: v.string(),
    buttons: v.optional(v.array(v.object({ id: v.string(), label: v.string() }))),
    authorUserId: v.optional(v.id('users')),
    status: v.union(
      v.literal('recebida'),
      v.literal('pendente'),
      v.literal('enviada'),
      v.literal('falhou')
    ),
    provider: v.optional(v.string()),
    providerError: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_patientId_and_createdAt', ['patientId', 'createdAt']),

  /** Quem acessou cada ficha e quando (LGPD). */
  auditLog: defineTable({
    userId: v.id('users'),
    patientId: v.id('patients'),
    action: v.union(
      v.literal('abrir_ficha'),
      v.literal('abrir_simulador'),
      v.literal('assumir_caso'),
      v.literal('enviar_mensagem')
    ),
    at: v.number(),
  })
    .index('by_patientId_and_at', ['patientId', 'at'])
    .index('by_userId_and_at', ['userId', 'at']),

  collabMarkdown: defineTable({
    organizationId: v.string(),
    documentId: v.string(),
    markdown: v.string(),
    updatedAt: v.number(),
    updatedBy: v.id('users'),
  })
    .index('by_documentId', ['documentId'])
    .index('by_org_and_document', ['organizationId', 'documentId']),
});

export default schema;
