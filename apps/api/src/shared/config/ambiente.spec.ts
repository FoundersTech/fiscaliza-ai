import { describe, expect, it } from 'vitest';

import { validarAmbiente } from './ambiente.js';
import { ErroConfiguracao } from './erro-configuracao.js';

const OBRIGATORIAS = {
  DATABASE_URL: 'postgresql://u:s@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

const PRODUCAO = { NODE_ENV: 'production', EMAIL_TRANSPORTE: 'resend', RESEND_API_KEY: 're_teste' };

describe('validarAmbiente', () => {
  it('aplica os valores padrão', () => {
    const ambiente = validarAmbiente(OBRIGATORIAS);

    expect(ambiente).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      PARAMETROS_CAMINHO: 'config/parametros.json',
      SWAGGER_HABILITADO: true,
      APP_VERSAO: 'dev',
    });
  });

  it('converte PORT para número', () => {
    expect(validarAmbiente({ ...OBRIGATORIAS, PORT: '8080' }).PORT).toBe(8080);
  });

  it('desliga o Swagger em produção por padrão', () => {
    expect(validarAmbiente({ ...OBRIGATORIAS, ...PRODUCAO }).SWAGGER_HABILITADO).toBe(false);
  });

  it('respeita SWAGGER_HABILITADO explícito', () => {
    const ambiente = validarAmbiente({
      ...OBRIGATORIAS,
      ...PRODUCAO,
      SWAGGER_HABILITADO: 'true',
    });

    expect(ambiente.SWAGGER_HABILITADO).toBe(true);
  });

  it('grava e-mails em arquivo por padrão e tira a barra final da WEB_URL', () => {
    const ambiente = validarAmbiente({ ...OBRIGATORIAS, WEB_URL: 'https://app.exemplo.test/' });

    expect(ambiente).toMatchObject({
      EMAIL_TRANSPORTE: 'arquivo',
      EMAIL_PASTA: 'tmp/emails',
      WEB_URL: 'https://app.exemplo.test',
    });
  });

  it('exige RESEND_API_KEY com EMAIL_TRANSPORTE=resend', () => {
    expect(() => validarAmbiente({ ...OBRIGATORIAS, EMAIL_TRANSPORTE: 'resend' })).toThrow(
      /RESEND_API_KEY: obrigatória/,
    );
    expect(
      validarAmbiente({ ...OBRIGATORIAS, EMAIL_TRANSPORTE: 'resend', RESEND_API_KEY: 're_x' })
        .EMAIL_TRANSPORTE,
    ).toBe('resend');
  });

  it('recusa o transporte em arquivo em produção', () => {
    expect(() => validarAmbiente({ ...OBRIGATORIAS, NODE_ENV: 'production' })).toThrow(
      /EMAIL_TRANSPORTE: use resend em produção/,
    );
  });

  it('recusa remetente fora do formato Nome <endereco>', () => {
    expect(() =>
      validarAmbiente({ ...OBRIGATORIAS, EMAIL_REMETENTE: 'nao-responda@fiscalizaai.app' }),
    ).toThrow(/EMAIL_REMETENTE/);
  });

  it('aponta as variáveis que faltam ou estão erradas', () => {
    expect(() => validarAmbiente({ REDIS_URL: 'http://errado' })).toThrow(ErroConfiguracao);
    expect(() => validarAmbiente({ REDIS_URL: 'http://errado' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL: use uma URL redis:\/\//,
    );
  });
});
