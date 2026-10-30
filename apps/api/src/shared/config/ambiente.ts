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
    // Base dos links enviados por e-mail (ex.: /definir-senha?token=).
    WEB_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:9000'),
    // `arquivo` grava os e-mails em EMAIL_PASTA, para desenvolvimento e testes.
    EMAIL_TRANSPORTE: z.enum(['arquivo', 'resend']).default('arquivo'),
    EMAIL_PASTA: z.string().min(1).default('tmp/emails'),
    EMAIL_REMETENTE: z
      .string()
      .regex(/^.+ <[^<>\s]+@[^<>\s]+>$/, 'use o formato Nome <endereco@dominio>')
      .default('Fiscaliza Aí! <nao-responda@fiscalizaai.app>'),
    RESEND_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((ambiente, contexto) => {
    if (ambiente.EMAIL_TRANSPORTE === 'resend' && !ambiente.RESEND_API_KEY) {
      contexto.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'obrigatória com EMAIL_TRANSPORTE=resend',
      });
    }
    if (ambiente.NODE_ENV === 'production' && ambiente.EMAIL_TRANSPORTE !== 'resend') {
      contexto.addIssue({
        code: 'custom',
        path: ['EMAIL_TRANSPORTE'],
        message: 'use resend em produção; com arquivo, os e-mails não chegam a ninguém',
      });
    }
  })
  .transform((ambiente) => ({
    ...ambiente,
    WEB_URL: ambiente.WEB_URL.replace(/\/+$/, ''),
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
