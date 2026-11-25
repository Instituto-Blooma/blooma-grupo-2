'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';

function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (letra) => `&#${letra.charCodeAt(0)};`);
}

async function sendEmail(args: { email: string; organizationName: string; acceptUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY ?? 're_emulate_test_key';
  const baseUrl = (process.env.RESEND_BASE_URL ?? 'https://api.resend.com').replace(/\/+$/, '');
  const from = process.env.RESEND_FROM ?? 'onboarding@example.com';
  const response = await fetch(`${baseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.email],
      subject: `Convite para a equipe do ${args.organizationName} no Olhar Humano`,
      html: `<p>Você foi convidada para a equipe de psicologia do <strong>${escaparHtml(args.organizationName)}</strong> no Olhar Humano.</p><p><a href="${args.acceptUrl}">Aceitar o convite</a></p><p>No primeiro acesso, use este e-mail e crie uma senha.</p>`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send invitation email: ${response.status} ${body}`);
  }
}

export const sendInvitation = internalAction({
  args: {
    email: v.string(),
    organizationName: v.string(),
    invitationId: v.string(),
    acceptUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    await sendEmail(args);
  },
});
