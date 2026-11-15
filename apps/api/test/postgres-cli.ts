import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { ComandoPostgres } from '../src/modules/manutencao/infrastructure/postgres-cli.js';

const COMPOSE_DA_RAIZ = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

/**
 * O pg_dump ou o pg_restore para os testes. A API chama o binário da própria imagem; aqui, ele
 * vem do PATH quando existe (no CI, o runner já traz o cliente do PostgreSQL) e, senão, do
 * container `postgres` do docker-compose.yml da raiz, que tem a mesma versão do servidor. O
 * banco de teste responde em localhost:5432 nos dois casos.
 */
export function comandoPostgres(binario: 'pg_dump' | 'pg_restore'): ComandoPostgres {
  const local = spawnSync(binario, ['--version'], { stdio: 'ignore' });
  if (local.status === 0) return [binario];
  return ['docker', 'compose', '-f', COMPOSE_DA_RAIZ, 'exec', '-T', 'postgres', binario];
}
