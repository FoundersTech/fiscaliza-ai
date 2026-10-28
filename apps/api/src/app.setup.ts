import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const PREFIXO_API = 'api/v1';

/** Configuração compartilhada entre o servidor (main.ts) e os testes. */
export function configurarApp(app: NestFastifyApplication): void {
  app.setGlobalPrefix(PREFIXO_API);
}
