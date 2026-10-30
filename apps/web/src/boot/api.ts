import { defineBoot } from '#q-app';
import type { InjectionKey } from 'vue';
import { inject, watch } from 'vue';

import { decidirAcesso } from '@/router/acesso';
import { type Api, criarApi } from '@/services/api';
import { criarSessao, type Sessao } from '@/services/sessao';
import { useAuthStore } from '@/stores/auth';

const CHAVE_API: InjectionKey<Api> = Symbol('api');
const CHAVE_SESSAO: InjectionKey<Sessao> = Symbol('sessao');

/** Quanto o app espera a renovação ao abrir antes de aparecer para um visitante. */
const ESPERA_RENOVACAO_MS = 5000;

export default defineBoot(async ({ app, router, store }) => {
  const auth = useAuthStore(store);
  const api = criarApi(import.meta.env.API_URL, {
    lerToken: () => auth.accessToken,
    renovar: () => sessao.renovar(),
    exigirPolitica: () => auth.marcarPolitica(true),
  });
  const sessao = criarSessao(api, auth);
  app.provide(CHAVE_API, api);
  app.provide(CHAVE_SESSAO, sessao);

  // A sessão acabou (ou começou) com uma tela aberta: o guard decide de novo onde ficar.
  watch(
    () => auth.logado,
    () => {
      const decisao = decidirAcesso(router.currentRoute.value, {
        logado: auth.logado,
        papel: auth.papel,
      });
      if (decisao !== true) void router.replace(decisao);
    },
  );

  // Reabrir ou recarregar o app não pede login de novo: o cookie traz um access token novo.
  await Promise.race([
    sessao.renovar(),
    new Promise((resolver) => setTimeout(resolver, ESPERA_RENOVACAO_MS)),
  ]);
});

/** O cliente da API nos componentes: `const api = useApi()`. */
export function useApi(): Api {
  const api = inject(CHAVE_API);
  if (!api) throw new Error('O boot "api" não foi registrado no quasar.config.ts.');
  return api;
}

/** Renovação e saída da sessão nos componentes. */
export function useSessao(): Sessao {
  const sessao = inject(CHAVE_SESSAO);
  if (!sessao) throw new Error('O boot "api" não foi registrado no quasar.config.ts.');
  return sessao;
}
