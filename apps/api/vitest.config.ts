import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Os testes de integração usam o docker-compose.yml da raiz (banco, Redis e S3); o CI sobrescreve
// pelo ambiente. Eles rodam num banco próprio, recriado a cada execução (test/preparar-banco.ts).
const urlBancoTeste = new URL(
  process.env.DATABASE_URL ?? 'postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza',
);
urlBancoTeste.pathname = '/fiscaliza_teste';

export default defineConfig({
  test: {
    environment: 'node',
    // Cache de módulos por projeto: com `pnpm -r test` em paralelo, o cache padrão
    // (compartilhado na raiz do workspace) dá ENOTEMPTY no Windows.
    fsModuleCachePath: fileURLToPath(new URL('./node_modules/.vitest-cache', import.meta.url)),
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urlBancoTeste.href,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      PARAMETROS_CAMINHO: 'config/parametros.json',
      SWAGGER_HABILITADO: 'true',
      R2_BUCKET_UPLOADS: 'fa-uploads-teste',
    },
    projects: [
      { extends: true, test: { name: 'unidade', include: ['src/**/*.spec.ts'] } },
      {
        extends: true,
        test: {
          name: 'integracao',
          include: ['src/**/*.int-spec.ts'],
          globalSetup: ['test/preparar-banco.ts', 'test/preparar-storage.ts'],
          // Os arquivos compartilham o banco de teste e limpam tabelas entre os casos.
          fileParallelism: false,
        },
      },
    ],
  },
});
