import { Writable } from 'node:stream';

import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CAMINHOS_OCULTOS, CENSURA, criarConfigLogger } from './logger.js';

/** Guarda tudo o que o pino escreve, para o teste inspecionar. */
class Captura extends Writable {
  readonly linhas: string[] = [];

  override _write(pedaco: Buffer, _codificacao: string, terminar: () => void): void {
    this.linhas.push(pedaco.toString());
    terminar();
  }
}

@Controller('ocorrencias')
class OcorrenciasController {
  @Get()
  listar(): string[] {
    return [];
  }
}

@Controller('health')
class HealthController {
  @Get()
  saude(): { status: string } {
    return { status: 'ok' };
  }
}

describe('logs da API (pino)', () => {
  const captura = new Captura();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot(criarConfigLogger({ NODE_ENV: 'test', LOG_LEVEL: 'info' }, captura)),
      ],
      controllers: [OcorrenciasController, HealthController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('oculta os headers Authorization e Cookie', async () => {
    await app.inject({
      method: 'GET',
      url: '/ocorrencias',
      headers: { authorization: 'Bearer token-secreto-123', cookie: 'fa_refresh=abc' },
    });

    const log = captura.linhas.join('');
    expect(log).toContain('/ocorrencias');
    expect(log).toContain(`"authorization":"${CENSURA}"`);
    expect(log).toContain(`"cookie":"${CENSURA}"`);
    expect(log).not.toContain('token-secreto-123');
    expect(log).not.toContain('fa_refresh=abc');
  });

  it('não registra as chamadas ao /health', async () => {
    const antes = captura.linhas.length;

    await app.inject({ method: 'GET', url: '/health' });

    expect(captura.linhas.slice(antes).join('')).not.toContain('/health');
  });

  it('oculta senha, e-mail e tokens em objetos logados', () => {
    const saida = new Captura();
    const logger = pino({ redact: { paths: CAMINHOS_OCULTOS, censor: CENSURA } }, saida);

    logger.info({ email: 'ana@exemplo.com', usuario: { senha: '123456', token: 'abc' } }, 'login');

    const log = saida.linhas.join('');
    expect(log).not.toContain('ana@exemplo.com');
    expect(log).not.toContain('123456');
    expect(log).not.toContain('"abc"');
  });
});
