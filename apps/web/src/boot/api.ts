import { defineBoot } from '#q-app';
import type { InjectionKey } from 'vue';
import { inject } from 'vue';

import { type Api, criarApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const CHAVE_API: InjectionKey<Api> = Symbol('api');

export default defineBoot(({ app, store }) => {
  const auth = useAuthStore(store);
  app.provide(
    CHAVE_API,
    criarApi(import.meta.env.API_URL, () => auth.accessToken),
  );
});

/** O cliente da API nos componentes: `const api = useApi()`. */
export function useApi(): Api {
  const api = inject(CHAVE_API);
  if (!api) throw new Error('O boot "api" não foi registrado no quasar.config.ts.');
  return api;
}
