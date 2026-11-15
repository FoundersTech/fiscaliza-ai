import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Os testes de integração usam o docker-compose.yml da raiz (banco, Redis e S3); o CI sobrescreve
// pelo ambiente. Eles rodam num banco próprio, recriado a cada execução (test/preparar-banco.ts).
// Com SUFIXO_TESTE (ex.: `t26`), o banco e o bucket de uploads ganham o sufixo, e duas cópias do repositório
// podem rodar a suíte ao mesmo tempo; cada uma deve usar também outro banco do Redis (REDIS_URL).
const sufixo = process.env.SUFIXO_TESTE?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
const urlBancoTeste = new URL(
  process.env.DATABASE_URL ?? 'postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza',
);
urlBancoTeste.pathname = sufixo ? `/fiscaliza_teste_${sufixo}` : '/fiscaliza_teste';

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
      // Banco 1 do Redis: os workers da API de desenvolvimento não pegam os jobs dos testes.
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379/1',
      PARAMETROS_CAMINHO: 'config/parametros.json',
      SWAGGER_HABILITADO: 'true',
      R2_BUCKET_UPLOADS: sufixo ? `fa-uploads-teste-${sufixo}` : 'fa-uploads-teste',
      // O de fotos é o mesmo para todas: só ele tem leitura anônima no S3 local, e as chaves já
      // trazem o id da ocorrência.
      R2_BUCKET_FOTOS: 'fa-fotos-teste',
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
