// Sends a sample WhatsApp Cloud API webhook (docs/whatsapp/exemplos/*.json) to the local Convex
// backend, so the channel can be tested without a Meta account.
//
//   pnpm run whatsapp:simular 01-texto-oi
//   pnpm run whatsapp:simular 04-numero-digitado --mesmo-id   # keep the message ID (dedupe test)
//
// By default each run gets the current time and a fresh message ID, so the same example can be
// sent many times. With --mesmo-id the ID from the file is kept: the second send is ignored.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readEnvLocalVar } from './env-file.mjs';
import { log, ROOT_DIR } from './lib.mjs';

const EXEMPLOS_DIR = join(ROOT_DIR, 'docs', 'whatsapp', 'exemplos');

function listarExemplos() {
  return readdirSync(EXEMPLOS_DIR)
    .filter((nome) => nome.endsWith('.json'))
    .map((nome) => nome.replace(/\.json$/, ''));
}

const args = process.argv.slice(2);
const nome = args.find((arg) => !arg.startsWith('--'))?.replace(/\.json$/, '');
const mesmoId = args.includes('--mesmo-id');

if (!nome) {
  log('whatsapp', `Escolha um exemplo: ${listarExemplos().join(', ')}`);
  process.exit(1);
}
const arquivo = join(EXEMPLOS_DIR, `${nome}.json`);
if (!existsSync(arquivo)) {
  log('whatsapp', `Exemplo "${nome}" não existe. Opções: ${listarExemplos().join(', ')}`);
  process.exit(1);
}

const siteUrl = (process.env.CONVEX_SITE_URL ?? readEnvLocalVar('VITE_CONVEX_SITE_URL'))?.replace(
  /\/+$/,
  ''
);
if (!siteUrl) {
  log('whatsapp', 'VITE_CONVEX_SITE_URL não encontrado em .env.local — rode pnpm run setup');
  process.exit(1);
}

const corpo = JSON.parse(readFileSync(arquivo, 'utf8'));
const agora = String(Math.floor(Date.now() / 1000));
const sufixo = Date.now().toString(36);
for (const entry of corpo.entry ?? []) {
  for (const change of entry.changes ?? []) {
    for (const item of [...(change.value?.messages ?? []), ...(change.value?.statuses ?? [])]) {
      item.timestamp = agora;
      if (!mesmoId) item.id = `${item.id}-${sufixo}`;
    }
  }
}

const response = await fetch(`${siteUrl}/whatsapp/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
});
log('whatsapp', `${nome} → ${response.status} ${await response.text()}`);
log('whatsapp', 'Veja o resultado nos logs do Convex (terminal do dev:all ou npx convex logs).');
process.exit(response.ok ? 0 : 1);
