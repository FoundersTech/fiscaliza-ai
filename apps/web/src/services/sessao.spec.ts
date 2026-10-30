import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarApi } from './api';
import { criarSessao } from './sessao';

afterEach(() => {
  vi.unstubAllGlobals();
});

const PERFIL = {
  id: 'f2b6c1de-0000-4000-8000-000000000001',
  nome: 'Maria da Silva',
  apelido_publico: 'maria.s',
  email: 'maria@exemplo.test',
  papel: 'CIDADAO' as const,
  municipio_id: null,
  orgao_id: null,
  precisa_aceitar_politica: false,
};

function montar(responder: (requisicao: Request) => Promise<Response>) {
  const requisicoes: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((requisicao: Request) => {
      requisicoes.push(requisicao);
      return responder(requisicao);
    }),
  );
  const auth = { iniciarSessao: vi.fn(), encerrarSessao: vi.fn() };
  const api = criarApi('https://api.exemplo.test', {
    lerToken: () => null,
    renovar: () => Promise.resolve(false),
    exigirPolitica: () => undefined,
  });
  return { sessao: criarSessao(api, auth, null), auth, requisicoes };
}

describe('sessão', () => {
  it('renovar manda o cookie com X-FA-CSRF e abre a sessão com o token novo', async () => {
    const { sessao, auth, requisicoes } = montar(() =>
      Promise.resolve(Response.json({ access_token: 'novo', usuario: PERFIL })),
    );

    expect(await sessao.renovar()).toBe(true);

    const [requisicao] = requisicoes;
    expect(requisicao?.url).toBe('https://api.exemplo.test/api/v1/auth/refresh');
    expect(requisicao?.method).toBe('POST');
    expect(requisicao?.headers.get('x-fa-csrf')).toBe('1');
    expect(requisicao?.credentials).toBe('include');
    expect(auth.iniciarSessao).toHaveBeenCalledWith({ access_token: 'novo', usuario: PERFIL });
  });

  it('um 401 na renovação encerra a sessão', async () => {
    const { sessao, auth } = montar(() =>
      Promise.resolve(
        Response.json({ codigo: 'SESSAO_INVALIDA', mensagem: '', detalhes: {} }, { status: 401 }),
      ),
    );

    expect(await sessao.renovar()).toBe(false);
    expect(auth.encerrarSessao).toHaveBeenCalledOnce();
  });

  it('sem conexão, a renovação falha mas a sessão não é encerrada', async () => {
    const { sessao, auth } = montar(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await sessao.renovar()).toBe(false);
    expect(auth.encerrarSessao).not.toHaveBeenCalled();
  });

  it('sair chama o logout e encerra a sessão, mesmo sem conexão', async () => {
    const { sessao, auth, requisicoes } = montar(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    await sessao.sair();

    expect(requisicoes[0]?.url).toBe('https://api.exemplo.test/api/v1/auth/logout');
    expect(auth.encerrarSessao).toHaveBeenCalledOnce();
  });
});
