// Fills the team site with fictional patients (queue, alerts, notices, check-ins, conversations)
// on the Convex deployment in .env.local. Refuses when the real WhatsApp is configured.
//
//   pnpm run demo:pacientes                       # hospital "ac-camargo" (A.C. Camargo) or the only one registered
//   pnpm run demo:pacientes -- --hospital <slug>  # another hospital (its address/slug)
//
// Running it again recreates the same patients. To remove everything: pnpm run dados:apagar-teste
import { execSync } from 'node:child_process';
import { log, ROOT_DIR } from './lib.mjs';

const posicao = process.argv.indexOf('--hospital');
const hospital = posicao > -1 ? process.argv[posicao + 1] : undefined;
const args = hospital ? { hospital } : {};

// Escaped double quotes work in both POSIX shells and Windows cmd.exe.
const json = JSON.stringify(JSON.stringify(args));
const saida = execSync(`npx convex run demonstracao:criarPacientesFicticias ${json}`, {
  cwd: ROOT_DIR,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const resultado = JSON.parse(saida.trim() || '{}');
log(
  'demo',
  `${resultado.pacientes ?? '?'} pacientes fictícias prontas em "${resultado.hospital ?? '?'}". Abra a Fila no site.`
);
