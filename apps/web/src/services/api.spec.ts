import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarApi } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function capturarRequisicoes() {
  const requisicoes: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((requisicao: Request) => {
      requisicoes.push(requisicao);
      return Promise.resolve(Response.json({ status: 'ok' }));
    }),
  );
  return requisicoes;
}

describe('cliente da API', () => {
  it('usa a URL da API e manda o token de quem está logado', async () => {
    const requisicoes = capturarRequisicoes();
    let token: string | null = 'token-1';
    const api = criarApi('https://api.exemplo.test', () => token);

    await api.GET('/api/v1/me');
    token = 'token-2';
    await api.GET('/api/v1/me');

    expect(requisicoes[0]?.url).toBe('https://api.exemplo.test/api/v1/me');
    expect(requisicoes[0]?.headers.get('authorization')).toBe('Bearer token-1');
    expect(requisicoes[1]?.headers.get('authorization')).toBe('Bearer token-2');
  });

  it('sem sessão, não manda Authorization', async () => {
    const requisicoes = capturarRequisicoes();
    await criarApi('https://api.exemplo.test', () => null).GET('/api/v1/health');

    expect(requisicoes[0]?.headers.has('authorization')).toBe(false);
  });
});
