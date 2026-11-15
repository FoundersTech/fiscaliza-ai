import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { ComandoPostgres } from '../src/modules/manutencao/infrastructure/postgres-cli.js';

const COMPOSE_DA_RAIZ = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

const IMAGEM_POSTGRES = 'postgis/postgis:16-3.4';
const VERSAO_DO_SERVIDOR = 16;

/**
 * pg_dump/pg_restore na versão do servidor: um cliente mais novo manda comandos que o 16 não
 * conhece. Usa o do PATH, o do Compose (local) ou o da imagem num container (CI).
 */
export function comandoPostgres(binario: 'pg_dump' | 'pg_restore'): ComandoPostgres {
  if (versaoLocal(binario) === VERSAO_DO_SERVIDOR) return [binario];
  if (composeNoAr()) {
    return ['docker', 'compose', '-f', COMPOSE_DA_RAIZ, 'exec', '-T', 'postgres', binario];
  }
  return ['docker', 'run', '--rm', '-i', '--network', 'host', IMAGEM_POSTGRES, binario];
}

/** "pg_restore (PostgreSQL) 17.6" → 17. */
function versaoLocal(binario: string): number | null {
  const resultado = spawnSync(binario, ['--version'], { encoding: 'utf8' });
  if (resultado.status !== 0) return null;
  const versao = /\(PostgreSQL\)\s+(\d+)/.exec(resultado.stdout);
  return versao ? Number(versao[1]) : null;
}

function composeNoAr(): boolean {
  const resultado = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_DA_RAIZ, 'ps', '-q', '--status', 'running', 'postgres'],
    { encoding: 'utf8' },
  );
  return resultado.status === 0 && resultado.stdout.trim() !== '';
}
