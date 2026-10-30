import type { paths } from '@fiscaliza/contratos';
import createClient from 'openapi-fetch';

import { lerErroApi } from './erros';

/** O que o cliente precisa da sessão. Recebe funções, e não valores, porque o token muda. */
export interface GanchosSessao {
  lerToken(): string | null;
  renovar(): Promise<boolean>;
  exigirPolitica(): void;
}

const ROTAS_AUTH = '/api/v1/auth/';

function comToken(requisicao: Request, token: string | null): Request {
  if (token) requisicao.headers.set('Authorization', `Bearer ${token}`);
  return requisicao;
}

async function codigoDoErro(resposta: Response): Promise<string | undefined> {
  try {
    return lerErroApi(await resposta.clone().json())?.codigo;
  } catch {
    return undefined;
  }
}

/**
 * Cliente da API com os tipos de packages/contratos: as rotas, os corpos e as respostas são
 * conferidos pelo TypeScript. Ex.: `api.GET('/api/v1/me')`.
 */
export function criarApi(baseUrl: string, sessao: GanchosSessao) {
  async function enviar(requisicao: Request): Promise<Response> {
    const token = sessao.lerToken();
    const repeticao = requisicao.clone();
    const resposta = await fetch(comToken(requisicao, token));

    if (
      resposta.status === 401 &&
      token &&
      !new URL(requisicao.url).pathname.startsWith(ROTAS_AUTH)
    ) {
      const renovada = sessao.lerToken() !== token || (await sessao.renovar());
      const novo = sessao.lerToken();
      return renovada && novo ? fetch(comToken(repeticao, novo)) : resposta;
    }
    if (resposta.status === 403 && (await codigoDoErro(resposta)) === 'POLITICA_PENDENTE') {
      sessao.exigirPolitica();
    }
    return resposta;
  }

  return createClient<paths>({ baseUrl, credentials: 'include', fetch: enviar });
}

export type Api = ReturnType<typeof criarApi>;
