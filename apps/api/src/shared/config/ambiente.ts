import { z } from 'zod';

import { ErroConfiguracao, formatarProblemas } from './erro-configuracao.js';

export const AMBIENTE = Symbol('AMBIENTE');

const booleano = z.enum(['true', 'false']).transform((valor) => valor === 'true');

/** Só para desenvolvimento e testes; em produção, JWT_SECRET é obrigatório. */
const JWT_SECRET_DESENVOLVIMENTO = 'segredo-de-desenvolvimento-nao-use-em-producao-0001';

/** O storage S3 do docker-compose.yml da raiz (credenciais em deploy/local/s3.json). */
const STORAGE_LOCAL = {
  endpoint: 'http://localhost:9100',
  chave: 'fiscaliza',
  segredo: 'fiscaliza-local',
} as const;

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
    // Endereço do PWA: base dos links dos e-mails e única origem liberada no CORS.
    WEB_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:9000'),
    // `arquivo` grava os e-mails em EMAIL_PASTA, para desenvolvimento e testes.
    EMAIL_TRANSPORTE: z.enum(['arquivo', 'resend']).default('arquivo'),
    EMAIL_PASTA: z.string().min(1).default('tmp/emails'),
    EMAIL_REMETENTE: z
      .string()
      .regex(/^.+ <[^<>\s]+@[^<>\s]+>$/, 'use o formato Nome <endereco@dominio>')
      .default('Fiscaliza Aí! <nao-responda@fiscalizaai.app>'),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Assina os tokens de acesso (HS256). Quem tiver este valor consegue forjar um login.
    JWT_SECRET: z.string().min(32, 'use pelo menos 32 caracteres').optional(),
    // Versão vigente da política de privacidade que o usuário precisa ter aceitado.
    POLITICA_VERSAO: z.string().min(1).default('1'),
    // Atrás do Caddy: o IP do cliente vem do X-Forwarded-For. Sem proxy, deixe false.
    PROXY_CONFIAVEL: booleano.default(false),
    // Endereço reverso. O servidor público aceita no máximo 1 requisição por segundo.
    NOMINATIM_URL: z.url({ protocol: /^https?$/ }).default('https://nominatim.openstreetmap.org'),
    // Map ID do Google Maps que o PWA recebe no /config/publica. DEMO_MAP_ID serve para testes.
    GOOGLE_MAPS_MAP_ID: z.string().min(1).default('DEMO_MAP_ID'),
    // Storage das fotos: o R2 da conta R2_ACCOUNT_ID. Sem ela nem R2_ENDPOINT, o S3 local.
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET_UPLOADS: z.string().min(1).default('fa-uploads'),
  })
  .superRefine((ambiente, contexto) => {
    if (ambiente.NODE_ENV === 'production' && !ambiente.JWT_SECRET) {
      contexto.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'obrigatória em produção',
      });
    }
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
    if (ambiente.NODE_ENV === 'production') {
      if (!ambiente.R2_ACCOUNT_ID && !ambiente.R2_ENDPOINT) {
        contexto.addIssue({
          code: 'custom',
          path: ['R2_ACCOUNT_ID'],
          message: 'obrigatória em produção (ou R2_ENDPOINT)',
        });
      }
      for (const campo of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const) {
        if (!ambiente[campo]) {
          contexto.addIssue({ code: 'custom', path: [campo], message: 'obrigatória em produção' });
        }
      }
    }
  })
  .transform((ambiente) => ({
    ...ambiente,
    WEB_URL: ambiente.WEB_URL.replace(/\/+$/, ''),
    NOMINATIM_URL: ambiente.NOMINATIM_URL.replace(/\/+$/, ''),
    JWT_SECRET: ambiente.JWT_SECRET ?? JWT_SECRET_DESENVOLVIMENTO,
    SWAGGER_HABILITADO: ambiente.SWAGGER_HABILITADO ?? ambiente.NODE_ENV !== 'production',
    R2_ENDPOINT: (
      ambiente.R2_ENDPOINT ??
      (ambiente.R2_ACCOUNT_ID
        ? `https://${ambiente.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : STORAGE_LOCAL.endpoint)
    ).replace(/\/+$/, ''),
    R2_ACCESS_KEY_ID: ambiente.R2_ACCESS_KEY_ID ?? STORAGE_LOCAL.chave,
    R2_SECRET_ACCESS_KEY: ambiente.R2_SECRET_ACCESS_KEY ?? STORAGE_LOCAL.segredo,
  }));

export type Ambiente = z.output<typeof esquemaAmbiente>;

export function validarAmbiente(variaveis: Record<string, string | undefined>): Ambiente {
  const resultado = esquemaAmbiente.safeParse(variaveis);
  if (!resultado.success) {
    throw new ErroConfiguracao(formatarProblemas('Variáveis de ambiente', resultado.error.issues));
  }
  return resultado.data;
}
