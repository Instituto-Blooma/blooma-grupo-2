import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { providerFor } from './lib/providers';

/** Entrega um lote de mensagens, em ordem, pelo provedor da paciente. */
export const deliverBatch = internalAction({
  args: { messageIds: v.array(v.id('messages')) },
  handler: async (ctx, { messageIds }) => {
    for (const messageId of messageIds) {
      const item = await ctx.runQuery(internal.messaging.getForDelivery, { messageId });
      if (!item) continue;
      const provider = providerFor({ fictitious: item.fictitious });
      let result;
      try {
        result = await provider.deliver(item.payload);
      } catch {
        // Sem detalhes no log: pode conter dado da paciente.
        result = { ok: false as const, error: 'Falha no envio.' };
      }
      await ctx.runMutation(internal.messaging.markDelivery, {
        messageId,
        provider: provider.name,
        ok: result.ok,
        error: result.ok ? undefined : result.error,
      });
    }
    return null;
  },
});

export const getForDelivery = internalQuery({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message || message.direction !== 'saida' || message.status !== 'pendente') return null;
    const patient = await ctx.db.get(message.patientId);
    if (!patient) return null;
    if (message.origin === 'paciente') return null;
    return {
      fictitious: patient.fictitious,
      payload: {
        to: patient.phone,
        text: message.text,
        buttons: message.buttons,
        kind: message.origin,
      },
    };
  },
});

export const markDelivery = internalMutation({
  args: {
    messageId: v.id('messages'),
    provider: v.string(),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: args.ok ? 'enviada' : 'falhou',
      provider: args.provider,
      providerError: args.error,
    });
    return null;
  },
});
