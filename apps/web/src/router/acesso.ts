import type { RouteLocationRaw } from 'vue-router';

import type { Papel } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** Exige login: sem ele, vai para /login?voltar=<rota>. */
    auth?: boolean;
    /** Papéis que podem abrir a rota; os outros veem "Acesso negado". */
    papeis?: readonly Papel[];
  }
}

export interface Destino {
  fullPath: string;
  meta: { auth?: boolean; papeis?: readonly Papel[] };
}

export interface SessaoAtual {
  logado: boolean;
  papel: Papel | null;
}

/** true libera a navegação; senão, devolve para onde redirecionar. */
export function decidirAcesso(destino: Destino, sessao: SessaoAtual): true | RouteLocationRaw {
  const exigeLogin = destino.meta.auth === true || (destino.meta.papeis?.length ?? 0) > 0;
  if (!exigeLogin) return true;

  if (!sessao.logado) {
    return { path: '/login', query: { voltar: destino.fullPath } };
  }
  const papeis = destino.meta.papeis;
  if (papeis?.length && (!sessao.papel || !papeis.includes(sessao.papel))) {
    return { path: '/acesso-negado', query: { de: destino.fullPath } };
  }
  return true;
}

/** Só aceita voltar para dentro do app: um ?voltar=https://outro.site é ignorado. */
export function destinoSeguro(voltar: unknown): string {
  return typeof voltar === 'string' && voltar.startsWith('/') && !voltar.startsWith('//')
    ? voltar
    : '/';
}
