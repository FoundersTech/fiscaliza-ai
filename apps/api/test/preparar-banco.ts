import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import type { TestProject } from 'vitest/node';

const PRISMA_CLI = createRequire(import.meta.url).resolve('prisma/build/index.js');
const PASTA_API = fileURLToPath(new URL('..', import.meta.url));

/**
 * globalSetup dos testes de integração: recria o banco de teste (o DATABASE_URL do
 * vitest.config.ts) e aplica as migrations. Assim cada execução confirma que as migrations
 * sobem num banco vazio, e os testes não tocam no banco de desenvolvimento.
 */
export default async function prepararBanco(project: TestProject): Promise<void> {
  const urlTeste = project.config.env['DATABASE_URL'];
  if (!urlTeste) throw new Error('DATABASE_URL do banco de teste não definido no vitest.config.ts');

  const banco = new URL(urlTeste).pathname.slice(1);
  const urlManutencao = new URL(urlTeste);
  urlManutencao.pathname = '/postgres';

  const cliente = new pg.Client({ connectionString: urlManutencao.href });
  await cliente.connect();
  try {
    const nome = cliente.escapeIdentifier(banco);
    await cliente.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE ${nome}`);
  } finally {
    await cliente.end();
  }

  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: PASTA_API,
    env: { ...process.env, DATABASE_URL: urlTeste },
    stdio: 'pipe',
  });
}
