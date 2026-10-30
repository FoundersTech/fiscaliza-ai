import type { paths } from '@fiscaliza/contratos';
import createClient, { type Middleware } from 'openapi-fetch';

/**
 * Coloca o token de acesso em cada requisição, se houver sessão. Recebe uma função para ler o
 * token na hora, e não o valor, porque ele muda a cada login.
 */
export function middlewareToken(lerToken: () => string | null): Middleware {
  return {
    onRequest({ request }) {
      const token = lerToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  };
}

/**
 * Cliente da API com os tipos de packages/contratos: as rotas, os corpos e as respostas são
 * conferidos pelo TypeScript. Ex.: `api.GET('/api/v1/me')`.
 */
export function criarApi(baseUrl: string, lerToken: () => string | null) {
  const cliente = createClient<paths>({ baseUrl });
  cliente.use(middlewareToken(lerToken));
  return cliente;
}

export type Api = ReturnType<typeof criarApi>;
