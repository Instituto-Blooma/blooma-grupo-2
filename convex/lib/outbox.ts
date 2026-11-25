import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export type OutgoingDraft = {
  origin: 'bot' | 'crise' | 'lembrete' | 'psicologa';
  text: string;
  buttons?: { id: string; label: string }[];
  authorUserId?: Id<'users'>;
};

/**
 * Grava as mensagens de saída (status "pendente") e agenda UM envio em lote,
 * para que cheguem na ordem certa. Quem entrega é o provedor (lib/providers.ts).
 */
export async function queueOutgoing(
  ctx: MutationCtx,
  patientId: Id<'patients'>,
  drafts: OutgoingDraft[]
): Promise<Id<'messages'>[]> {
  if (drafts.length === 0) return [];
  const now = Date.now();
  const ids: Id<'messages'>[] = [];
  for (const draft of drafts) {
    ids.push(
      await ctx.db.insert('messages', {
        patientId,
        direction: 'saida',
        origin: draft.origin,
        text: draft.text,
        buttons: draft.buttons,
        authorUserId: draft.authorUserId,
        status: 'pendente',
        createdAt: now,
      })
    );
  }
  await ctx.scheduler.runAfter(0, internal.messaging.deliverBatch, { messageIds: ids });
  return ids;
}
