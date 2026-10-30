import { PREFIXO_API } from '../../../app.setup.js';
import type { Sessao } from '../application/perfil.js';
import type { Origem } from '../application/portas.js';
import { SessaoResposta } from './dto.js';

export const COOKIE_REFRESH = 'fa_refresh';

/**
 * O cookie só vai para as rotas de autenticação, nunca é lido por JavaScript (HttpOnly), só
 * trafega em HTTPS (Secure) e não acompanha requisições vindas de outros sites (SameSite=Strict).
 */
const OPCOES = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: `/${PREFIXO_API}/auth`,
} as const;

const TAMANHO_USER_AGENT = 500;

export interface RequisicaoHttp {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}

export interface RespostaHttp {
  setCookie(nome: string, valor: string, opcoes: object): unknown;
  clearCookie(nome: string, opcoes: object): unknown;
}

export function origemDe(requisicao: RequisicaoHttp): Origem {
  const userAgent = requisicao.headers['user-agent'];
  return {
    ip: requisicao.ip || null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, TAMANHO_USER_AGENT) : null,
  };
}

export function lerCookieRefresh(requisicao: RequisicaoHttp): string | undefined {
  return requisicao.cookies?.[COOKIE_REFRESH];
}

export function responderSessao(resposta: RespostaHttp, sessao: Sessao): SessaoResposta {
  resposta.setCookie(COOKIE_REFRESH, sessao.refresh.token, {
    ...OPCOES,
    expires: sessao.refresh.expiraEm,
  });
  return SessaoResposta.de(sessao);
}

export function limparCookieRefresh(resposta: RespostaHttp): void {
  resposta.clearCookie(COOKIE_REFRESH, OPCOES);
}
