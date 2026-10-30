import { fileURLToPath, URL } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';

const SO_NO_NAVEGADOR = 'src/**/*.navegador.spec.ts';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Cache de módulos por projeto: com `pnpm -r test` em paralelo, o cache padrão
    // (compartilhado na raiz do workspace) dá ENOTEMPTY no Windows.
    fsModuleCachePath: fileURLToPath(new URL('./node_modules/.vitest-cache', import.meta.url)),
    projects: [
      {
        extends: true,
        test: {
          name: 'unidade',
          include: ['src/**/*.spec.ts'],
          exclude: [...configDefaults.exclude, SO_NO_NAVEGADOR],
          environment: 'node',
        },
      },
      {
        // O que depende de canvas e de decodificar imagens roda no Chrome instalado na máquina
        // (e no runner do GitHub), sem baixar navegador.
        extends: true,
        test: {
          name: 'navegador',
          include: [SO_NO_NAVEGADOR],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chrome' } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
