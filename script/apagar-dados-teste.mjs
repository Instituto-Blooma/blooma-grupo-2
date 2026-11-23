// Deletes all test data from the Convex deployment in .env.local: patients, messages, alerts,
// deletion records and WhatsApp channel records. Refuses when the real WhatsApp is configured.
//
//   pnpm run dados:apagar-teste          # keeps hospital codes, risk words and consent terms
//   pnpm run dados:apagar-teste --tudo   # also deletes hospital codes, risk words and terms
import { execSync } from 'node:child_process';
import { log, ROOT_DIR } from './lib.mjs';

const incluirConfiguracao = process.argv.includes('--tudo');
const args = { confirmar: 'APAGAR DADOS DE TESTE', incluirConfiguracao };

// Escaped double quotes work in both POSIX shells and Windows cmd.exe.
const json = JSON.stringify(JSON.stringify(args));
const saida = execSync(`npx convex run pacientes:apagarDadosDeTeste ${json}`, {
  cwd: ROOT_DIR,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
log('dados', saida.trim());
log(
  'dados',
  incluirConfiguracao
    ? 'Dados de teste e configuração apagados (o restante, se houver muito, termina em segundos).'
    : 'Dados de teste apagados. Códigos de hospital, palavras de risco e termos foram mantidos.'
);
