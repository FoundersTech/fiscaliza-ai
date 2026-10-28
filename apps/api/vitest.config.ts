import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Cache de módulos por projeto: com `pnpm -r test` em paralelo, o cache padrão
    // (compartilhado na raiz do workspace) dá ENOTEMPTY no Windows.
    fsModuleCachePath: fileURLToPath(new URL('./node_modules/.vitest-cache', import.meta.url)),
  },
});
