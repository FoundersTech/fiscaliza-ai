import { describe, expect, it } from 'vitest';

import { validarAmbiente } from './ambiente.js';
import { ErroConfiguracao } from './erro-configuracao.js';

const OBRIGATORIAS = {
  DATABASE_URL: 'postgresql://u:s@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

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
    expect(validarAmbiente({ ...OBRIGATORIAS, NODE_ENV: 'production' }).SWAGGER_HABILITADO).toBe(
      false,
    );
  });

  it('respeita SWAGGER_HABILITADO explícito', () => {
    const ambiente = validarAmbiente({
      ...OBRIGATORIAS,
      NODE_ENV: 'production',
      SWAGGER_HABILITADO: 'true',
    });

    expect(ambiente.SWAGGER_HABILITADO).toBe(true);
  });

  it('aponta as variáveis que faltam ou estão erradas', () => {
    expect(() => validarAmbiente({ REDIS_URL: 'http://errado' })).toThrow(ErroConfiguracao);
    expect(() => validarAmbiente({ REDIS_URL: 'http://errado' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL: use uma URL redis:\/\//,
    );
  });
});
