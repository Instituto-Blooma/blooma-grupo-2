/**
 * 6-digit code sent by e-mail (Resend; emulated in development, see /dev/inbox), used to confirm
 * the e-mail on the first access and to reset a forgotten password.
 */
import { Email } from '@convex-dev/auth/providers/Email';

const VALIDADE_MINUTOS = 15;

function gerarCodigo() {
  const numeros = new Uint32Array(1);
  crypto.getRandomValues(numeros);
  return String(numeros[0] % 1_000_000).padStart(6, '0');
}

function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (letra) => `&#${letra.charCodeAt(0)};`);
}

async function enviarCodigo(email: string, codigo: string, motivo: 'confirmar' | 'senha') {
  const apiKey = process.env.RESEND_API_KEY ?? 're_emulate_test_key';
  const baseUrl = (process.env.RESEND_BASE_URL ?? 'https://api.resend.com').replace(/\/+$/, '');
  const from = process.env.RESEND_FROM ?? 'onboarding@example.com';
  const assunto =
    motivo === 'confirmar'
      ? `${codigo} é o seu código do Olhar Humano`
      : `${codigo} é o código para criar uma nova senha no Olhar Humano`;
  const explicacao =
    motivo === 'confirmar'
      ? 'Use este código para confirmar seu e-mail e terminar seu primeiro acesso ao Olhar Humano.'
      : 'Use este código para criar uma nova senha no Olhar Humano.';
  const resposta = await fetch(`${baseUrl}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: assunto,
      html: `<p>${escaparHtml(explicacao)}</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${codigo}</p><p>O código vale por ${VALIDADE_MINUTOS} minutos. Se você não pediu, ignore este e-mail.</p>`,
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Failed to send code e-mail: ${resposta.status}`);
  }
}

export function codigoPorEmail(id: string, motivo: 'confirmar' | 'senha') {
  return Email({
    id,
    maxAge: VALIDADE_MINUTOS * 60,
    generateVerificationToken: async () => gerarCodigo(),
    sendVerificationRequest: async ({ identifier, token }) => {
      await enviarCodigo(identifier, token, motivo);
    },
  });
}
