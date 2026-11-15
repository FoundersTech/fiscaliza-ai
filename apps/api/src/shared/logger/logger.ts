import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';

import type { Ambiente } from '../config/ambiente.js';
import { RequestMethod } from '@nestjs/common';

export const CENSURA = '[Redacted]';

export const CAMINHOS_OCULTOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  // O IP do cliente é dado pessoal: nem o do socket nem o que o Caddy repassa vão para o log.
  'req.remoteAddress',
  'req.remotePort',
  'req.headers["x-forwarded-for"]',
  'req.headers["x-real-ip"]',
  'req.headers["cf-connecting-ip"]',
  'res.headers["set-cookie"]',
  ...['senha', 'email', 'token', 'access_token', 'refresh_token'].flatMap((campo) => [
    campo,
    `*.${campo}`,
  ]),
];

const SUFIXO_HEALTH = '/health';

function caminhoDaRequisicao(req: { url?: string; originalUrl?: string }): string {
  return req.originalUrl ?? req.url ?? '';
}

export function criarConfigLogger(
  ambiente: Pick<Ambiente, 'NODE_ENV' | 'LOG_LEVEL'>,
  destino?: DestinationStream,
): Params {
  const opcoes: Options = {
    level: ambiente.LOG_LEVEL,
    redact: { paths: CAMINHOS_OCULTOS, censor: CENSURA },
    autoLogging: { ignore: (req) => caminhoDaRequisicao(req).endsWith(SUFIXO_HEALTH) },
    ...(ambiente.NODE_ENV === 'development' && !destino
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
          },
        }
      : {}),
  };

  return {
    pinoHttp: destino ? [opcoes, destino] : opcoes,
    forRoutes: [{ path: '/{*splat}', method: RequestMethod.ALL }],
  };
}
