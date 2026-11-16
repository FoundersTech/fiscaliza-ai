import type { components } from '@fiscaliza/contratos';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { Api } from '@/services/api';
import {
  type DepsDeteccaoMunicipio,
  detectarMunicipioInicial,
  escolherMunicipio,
  lerEscolhaSalva,
  type OrigemMunicipio,
  salvarMunicipio,
} from '@/services/municipio';

export type ConfigPublica = components['schemas']['ConfigPublicaResposta'];

/** Alguns navegadores lançam erro só de acessar o localStorage com o armazenamento bloqueado. */
function armazenamento(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Cidades atendidas, categorias ativas e parâmetros públicos, buscados uma vez por sessão do app.
 * Guarda também a cidade que a pessoa escolheu ver no feed, no mapa e no registro.
 */
export const useConfigStore = defineStore('config', () => {
  const config = ref<ConfigPublica | null>(null);
  const escolhaSalva = lerEscolhaSalva(armazenamento());
  const municipioEscolhido = ref<number | null>(escolhaSalva?.id ?? null);
  const origemEscolha = ref<OrigemMunicipio | null>(escolhaSalva?.origem ?? null);
  let pedido: Promise<boolean> | null = null;
  let detectou = false;

  const categorias = computed(() => config.value?.categorias_ativas ?? []);
  const municipios = computed(() => config.value?.municipios ?? []);
  const municipio = computed(() => escolherMunicipio(municipios.value, municipioEscolhido.value));

  function atendido(id: number): boolean {
    return municipios.value.some((opcao) => opcao.id === id);
  }

  /** A escolha da pessoa sempre vence: a localização nunca troca uma cidade escolhida à mão. */
  function selecionarMunicipio(id: number, origem: OrigemMunicipio = 'MANUAL'): void {
    if (origem === 'LOCALIZACAO') {
      if (origemEscolha.value === 'MANUAL') return;
      if (municipios.value.length > 0 && !atendido(id)) return;
    }
    municipioEscolhido.value = id;
    origemEscolha.value = origem;
    salvarMunicipio(armazenamento(), id, origem);
  }

  /** true quando a localização trocou a cidade; sem permissão já dada, não pergunta nada. */
  async function detectarPelaLocalizacao(
    api: Api,
    deps?: Partial<Omit<DepsDeteccaoMunicipio, 'api'>>,
  ): Promise<boolean> {
    const id = await detectarMunicipioInicial({
      api,
      armazenamento: deps?.armazenamento ?? armazenamento(),
      permissoes: deps?.permissoes ?? globalThis.navigator?.permissions,
      lerLocalizacao: deps?.lerLocalizacao,
    });
    if (id === null) return false;
    if (municipios.value.length > 0 && !atendido(id)) return false;
    selecionarMunicipio(id, 'LOCALIZACAO');
    return municipioEscolhido.value === id && origemEscolha.value === 'LOCALIZACAO';
  }

  /** false quando a API não respondeu; a tela oferece tentar de novo. */
  function carregar(api: Api): Promise<boolean> {
    if (config.value) return Promise.resolve(true);
    pedido ??= api
      .GET('/api/v1/config/publica')
      .then(({ data }) => {
        if (data) config.value = data;
        if (data && !detectou) {
          detectou = true;
          // Em segundo plano: a tela não espera pelo GPS.
          void detectarPelaLocalizacao(api);
        }
        return data !== undefined;
      })
      .catch(() => false)
      .finally(() => {
        pedido = null;
      });
    return pedido;
  }

  return {
    config,
    categorias,
    municipios,
    municipio,
    origemEscolha,
    selecionarMunicipio,
    detectarPelaLocalizacao,
    carregar,
  };
});
