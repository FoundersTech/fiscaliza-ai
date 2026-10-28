/**
 * Exporta o documento OpenAPI para packages/contratos/openapi.json (T-03).
 * Não precisa de banco nem de Redis: o Prisma só conecta na primeira consulta e o Redis é trocado
 * por um cliente que nunca conecta.
 *
 * Uso: pnpm contratos:gerar (na raiz do monorepo).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';

import { AppModule } from '../app.module.js';
import { criarDocumentoOpenApi, PREFIXO_API } from '../app.setup.js';
import { REDIS } from '../shared/redis/redis.module.js';

const DESTINO = resolve(process.cwd(), '../../packages/contratos/openapi.json');

// Versão fixa para o arquivo não mudar a cada commit; a versão real fica no /docs-json.
const VERSAO_CONTRATO = 'v1';

// A validação do ambiente exige as URLs, mas o gerador não se conecta a nada.
process.env.DATABASE_URL ??= 'postgresql://gerador:gerador@localhost:5432/gerador';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.LOG_LEVEL = 'silent';

async function exportar(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS)
    .useValue(new Redis({ lazyConnect: true }))
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  app.setGlobalPrefix(PREFIXO_API);

  const documento = criarDocumentoOpenApi(app, VERSAO_CONTRATO);
  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, `${JSON.stringify(documento, null, 2)}\n`);

  await app.close();
  console.log(`OpenAPI exportado para ${DESTINO}`);
}

exportar().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
