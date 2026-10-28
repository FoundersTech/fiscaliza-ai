import { z } from 'zod';

import { ErroConfiguracao, formatarProblemas } from './erro-configuracao.js';

export const AMBIENTE = Symbol('AMBIENTE');

const booleano = z.enum(['true', 'false']).transform((valor) => valor === 'true');

const esquemaAmbiente = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'use uma URL postgresql://'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'use uma URL redis://'),
    PARAMETROS_CAMINHO: z.string().min(1).default('config/parametros.json'),
    SWAGGER_HABILITADO: booleano.optional(),
    APP_VERSAO: z.string().min(1).default('dev'),
  })
  .transform((ambiente) => ({
    ...ambiente,
    SWAGGER_HABILITADO: ambiente.SWAGGER_HABILITADO ?? ambiente.NODE_ENV !== 'production',
  }));

export type Ambiente = z.output<typeof esquemaAmbiente>;

export function validarAmbiente(variaveis: Record<string, string | undefined>): Ambiente {
  const resultado = esquemaAmbiente.safeParse(variaveis);
  if (!resultado.success) {
    throw new ErroConfiguracao(formatarProblemas('Variáveis de ambiente', resultado.error.issues));
  }
  return resultado.data;
}
