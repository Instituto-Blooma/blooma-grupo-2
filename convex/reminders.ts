import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { runReminderRule } from './lib/conversationRunner';

/**
 * Chamado pelo cron semanal (convex/crons.ts). Marca quem deve receber o
 * lembrete e coloca a mensagem na fila de saída. Quem entrega é o provedor:
 * no simulador aparece na conversa; no WhatsApp o envio real é TODO.
 */
export const markDue = internalMutation({
  args: { onlyFictitious: v.optional(v.boolean()) },
  handler: async (ctx, { onlyFictitious }) => {
    return await runReminderRule(ctx, { onlyFictitious: onlyFictitious ?? false });
  },
});
