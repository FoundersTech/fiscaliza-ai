import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';

import type { Ambiente } from '../config/ambiente.js';

export const CENSURA = '[Redacted]';

/**
 * Campos que nunca aparecem nos logs, para não vazar dados pessoais.
 * O `*` cobre um nível de profundidade: { usuario: { email } } é ocultado.
 */
export const CAMINHOS_OCULTOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...['senha', 'email', 'token', 'access_token', 'refresh_token'].flatMap((campo) => [
    campo,
    `*.${campo}`,
  ]),
];

const SUFIXO_HEALTH = '/health';

/** Como middleware do Nest, o `req.url` chega relativo; a URL completa fica em `originalUrl`. */
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
    // O monitor externo chama o /health o tempo todo; não vale encher o log com isso.
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

  return { pinoHttp: destino ? [opcoes, destino] : opcoes };
}
