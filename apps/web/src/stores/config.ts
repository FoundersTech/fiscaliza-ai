import type { components } from '@fiscaliza/contratos';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { Api } from '@/services/api';

export type ConfigPublica = components['schemas']['ConfigPublicaResposta'];

/** Município, categorias ativas e parâmetros públicos, buscados uma vez por sessão do app. */
export const useConfigStore = defineStore('config', () => {
  const config = ref<ConfigPublica | null>(null);
  let pedido: Promise<boolean> | null = null;

  const categorias = computed(() => config.value?.categorias_ativas ?? []);

  /** false quando a API não respondeu; a tela oferece tentar de novo. */
  function carregar(api: Api): Promise<boolean> {
    if (config.value) return Promise.resolve(true);
    pedido ??= api
      .GET('/api/v1/config/publica')
      .then(({ data }) => {
        if (data) config.value = data;
        return data !== undefined;
      })
      .catch(() => false)
      .finally(() => {
        pedido = null;
      });
    return pedido;
  }

  return { config, categorias, carregar };
});
