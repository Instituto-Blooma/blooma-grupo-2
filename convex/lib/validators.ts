import { v } from 'convex/values';

export const priorityLevelValidator = v.union(
  v.literal('alta'),
  v.literal('media'),
  v.literal('baixa')
);

export const conversationStageValidator = v.union(
  v.literal('novo'),
  v.literal('aguardando_consentimento'),
  v.literal('aguardando_apelido'),
  v.literal('ocioso'),
  v.literal('em_checkin')
);

export const conversationStateValidator = v.object({
  stage: conversationStageValidator,
  /** Índice da próxima pergunta do check-in em andamento. */
  questionIndex: v.optional(v.number()),
  checkinId: v.optional(v.id('checkins')),
});
