import type { SessaoAberta } from '@/stores/auth';

import type { Api } from './api';
import { criarRenovador, type Travas } from './renovacao';

/** O que a sessão altera na store `auth`. */
export interface EstadoSessao {
  iniciarSessao(sessao: SessaoAberta): void;
  encerrarSessao(): void;
}

export interface Sessao {
  renovar(): Promise<boolean>;
  sair(): Promise<void>;
}

export function criarSessao(api: Api, auth: EstadoSessao, travas?: Travas | null): Sessao {
  const renovar = criarRenovador(async () => {
    try {
      const { data, response } = await api.POST('/api/v1/auth/refresh', {
        params: { header: { 'X-FA-CSRF': '1' } },
      });
      if (data) {
        auth.iniciarSessao(data);
        return true;
      }
      if (response.status === 401) auth.encerrarSessao();
      return false;
    } catch {
      return false;
    }
  }, travas);

  async function sair(): Promise<void> {
    try {
      await api.POST('/api/v1/auth/logout');
    } catch {
      // Sem conexão o cookie continua valendo, mas a sessão desta aba acaba do mesmo jeito.
    } finally {
      auth.encerrarSessao();
    }
  }

  return { renovar, sair };
}
