import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarApi, type GanchosSessao } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Enviada {
  url: string;
  metodo: string;
  autorizacao: string | null;
  corpo: string;
  credenciais: RequestCredentials;
}

/** Troca o fetch por respostas prontas, na ordem, e guarda o que foi enviado. */
function responderCom(...respostas: Response[]) {
  const enviadas: Enviada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (requisicao: Request) => {
      enviadas.push({
        url: requisicao.url,
        metodo: requisicao.method,
        autorizacao: requisicao.headers.get('authorization'),
        corpo: await requisicao.text(),
        credenciais: requisicao.credentials,
      });
      return respostas.shift() ?? Response.json({ status: 'ok' });
    }),
  );
  return enviadas;
}

function erro(status: number, codigo: string) {
  return Response.json({ codigo, mensagem: 'erro', detalhes: {} }, { status });
}

function sessaoCom(token: string | null, renovar = vi.fn(() => Promise.resolve(false))) {
  const estado = { token };
  const exigirPolitica = vi.fn();
  const ganchos: GanchosSessao = { lerToken: () => estado.token, renovar, exigirPolitica };
  return { estado, ganchos, renovar, exigirPolitica };
}

const URL_API = 'https://api.exemplo.test';

describe('cliente da API', () => {
  it('usa a URL da API, manda o token de quem está logado e inclui os cookies', async () => {
    const enviadas = responderCom();
    const { estado, ganchos } = sessaoCom('token-1');
    const api = criarApi(URL_API, ganchos);

    await api.GET('/api/v1/me');
    estado.token = 'token-2';
    await api.GET('/api/v1/me');

    expect(enviadas[0]).toMatchObject({
      url: 'https://api.exemplo.test/api/v1/me',
      autorizacao: 'Bearer token-1',
      credenciais: 'include',
    });
    expect(enviadas[1]?.autorizacao).toBe('Bearer token-2');
  });

  it('sem sessão, não manda Authorization', async () => {
    const enviadas = responderCom();
    await criarApi(URL_API, sessaoCom(null).ganchos).GET('/api/v1/health');

    expect(enviadas[0]?.autorizacao).toBeNull();
  });

  it('um 401 com token renova a sessão uma vez e repete a requisição, com o mesmo corpo', async () => {
    const enviadas = responderCom(
      erro(401, 'NAO_AUTENTICADO'),
      new Response(null, { status: 204 }),
    );
    const { estado, ganchos, renovar } = sessaoCom('vencido');
    renovar.mockImplementation(() => {
      estado.token = 'novo';
      return Promise.resolve(true);
    });

    const { response } = await criarApi(URL_API, ganchos).POST('/api/v1/me/politica', {
      body: { versao: '1' },
    });

    expect(response.status).toBe(204);
    expect(renovar).toHaveBeenCalledOnce();
    expect(enviadas.map((enviada) => enviada.autorizacao)).toEqual([
      'Bearer vencido',
      'Bearer novo',
    ]);
    expect(enviadas[1]?.corpo).toBe(JSON.stringify({ versao: '1' }));
  });

  it('se a renovação falha, devolve o 401 sem repetir', async () => {
    const enviadas = responderCom(erro(401, 'NAO_AUTENTICADO'));
    const { ganchos, renovar } = sessaoCom('vencido');

    const { response } = await criarApi(URL_API, ganchos).GET('/api/v1/me');

    expect(response.status).toBe(401);
    expect(renovar).toHaveBeenCalledOnce();
    expect(enviadas).toHaveLength(1);
  });

  it('se outra requisição já renovou nesse meio-tempo, repete com o token novo sem renovar de novo', async () => {
    const { estado, ganchos, renovar } = sessaoCom('vencido');
    const enviadas: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((requisicao: Request) => {
        enviadas.push(requisicao.headers.get('authorization'));
        if (enviadas.length === 1) {
          estado.token = 'renovado-por-outra';
          return Promise.resolve(erro(401, 'NAO_AUTENTICADO'));
        }
        return Promise.resolve(Response.json({}));
      }),
    );

    await criarApi(URL_API, ganchos).GET('/api/v1/me');

    expect(renovar).not.toHaveBeenCalled();
    expect(enviadas).toEqual(['Bearer vencido', 'Bearer renovado-por-outra']);
  });

  it.each(['/api/v1/auth/login', '/api/v1/auth/refresh'] as const)(
    'um 401 em %s não dispara renovação',
    async (rota) => {
      responderCom(erro(401, 'CREDENCIAIS_INVALIDAS'));
      const { ganchos, renovar } = sessaoCom('qualquer');
      const api = criarApi(URL_API, ganchos);

      if (rota === '/api/v1/auth/login') {
        await api.POST(rota, { body: { email: 'a@b.test', senha: 'x' } });
      } else {
        await api.POST(rota, { params: { header: { 'X-FA-CSRF': '1' } } });
      }

      expect(renovar).not.toHaveBeenCalled();
    },
  );

  it('um 403 POLITICA_PENDENTE avisa a sessão; outro 403 não', async () => {
    responderCom(erro(403, 'ACESSO_NEGADO'), erro(403, 'POLITICA_PENDENTE'));
    const { ganchos, exigirPolitica } = sessaoCom('token');
    const api = criarApi(URL_API, ganchos);

    await api.GET('/api/v1/me');
    expect(exigirPolitica).not.toHaveBeenCalled();

    const { error } = await api.GET('/api/v1/me');
    expect(exigirPolitica).toHaveBeenCalledOnce();
    // O corpo continua legível para quem chamou.
    expect(error).toMatchObject({ codigo: 'POLITICA_PENDENTE' });
  });
});
