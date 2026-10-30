import { existsSync } from 'node:fs';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import { validarAmbiente } from './shared/config/ambiente.js';
import { ErroConfiguracao } from './shared/config/erro-configuracao.js';

// Em desenvolvimento, as variáveis vêm do .env; em staging e produção, do ambiente do container.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

async function bootstrap(): Promise<void> {
  const ambiente = validarAmbiente(process.env);
  // Atrás do Caddy, o IP do cliente vem do X-Forwarded-For; o limite de tentativas depende dele.
  const adaptador = new FastifyAdapter({ trustProxy: ambiente.PROXY_CONFIAVEL });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adaptador, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await configurarApp(app);

  await app.listen(ambiente.PORT, '0.0.0.0');
}

bootstrap().catch((erro: unknown) => {
  console.error(erro instanceof ErroConfiguracao ? erro.message : erro);
  process.exit(1);
});
