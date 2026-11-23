import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

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
  // `organizationId` (the hospital) stays empty until the central team routes the patient.
  pacientes: defineTable({
    telefone: v.string(),
    organizationId: v.optional(v.string()),
    consentimento: v.optional(v.object({ versaoTermo: v.string(), aceitoEm: v.number() })),
    exclusaoPedidaEm: v.optional(v.number()),
    criadaEm: v.number(),
  })
    .index('by_telefone', ['telefone'])
    .index('by_organizationId', ['organizationId'])
    .index('by_exclusaoPedidaEm', ['exclusaoPedidaEm']),

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
