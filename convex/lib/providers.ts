/**
 * Camada de "provedor": a única parte que sabe COMO a mensagem chega na paciente.
 *
 * - `simulado` (pronto): não envia nada para fora. A mensagem fica na tabela
 *   `messages` e a tela de simulador mostra.
 * - `whatsapp` (TODO): envio real. O provedor (API oficial da Meta, Twilio,
 *   Z-API, etc.) ainda NÃO foi escolhido — decisão da equipe.
 *
 * Pacientes fictícias (seed/simulador) usam SEMPRE o provedor simulado.
 * Para as outras, vale a variável MESSAGING_PROVIDER do Convex (padrão: simulado).
 *
 * LGPD: nunca registre telefone ou texto da mensagem em log.
 */

export type OutboundPayload = {
  to: string;
  text: string;
  buttons?: { id: string; label: string }[];
  kind: 'bot' | 'crise' | 'lembrete' | 'psicologa';
};

export type DeliveryResult = { ok: true; providerMessageId?: string } | { ok: false; error: string };

export type MessagingProvider = {
  name: 'simulado' | 'whatsapp';
  deliver: (payload: OutboundPayload) => Promise<DeliveryResult>;
};

const simulatedProvider: MessagingProvider = {
  name: 'simulado',
  deliver: async () => ({ ok: true }),
};

const whatsappProvider: MessagingProvider = {
  name: 'whatsapp',
  deliver: async (_payload) => {
    // TODO(equipe): escolher o provedor do WhatsApp e implementar o envio aqui.
    //  - credenciais vêm de variáveis do Convex (nunca no código);
    //  - botões: o WhatsApp aceita até 3 botões de resposta; com mais opções use "lista";
    //  - fora da janela de 24h (ex.: lembrete semanal) só é possível enviar
    //    mensagem de modelo (template) aprovada;
    //  - recebimento: criar a rota do webhook em convex/http.ts e chamar
    //    `processIncoming` (convex/lib/conversationRunner.ts), como o simulador faz.
    return { ok: false, error: 'Provedor do WhatsApp ainda não configurado (TODO).' };
  },
};

export function providerFor(patient: { fictitious: boolean }): MessagingProvider {
  if (patient.fictitious) return simulatedProvider;
  return process.env.MESSAGING_PROVIDER === 'whatsapp' ? whatsappProvider : simulatedProvider;
}
