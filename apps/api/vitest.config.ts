import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Cache de módulos por projeto: com `pnpm -r test` em paralelo, o cache padrão
    // (compartilhado na raiz do workspace) dá ENOTEMPTY no Windows.
    fsModuleCachePath: fileURLToPath(new URL('./node_modules/.vitest-cache', import.meta.url)),
    // Os testes de integração usam o docker-compose.yml da raiz; o CI sobrescreve pelo ambiente.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      PARAMETROS_CAMINHO: 'config/parametros.json',
      SWAGGER_HABILITADO: 'true',
    },
    projects: [
      { extends: true, test: { name: 'unidade', include: ['src/**/*.spec.ts'] } },
      { extends: true, test: { name: 'integracao', include: ['src/**/*.int-spec.ts'] } },
    ],
  },
});
