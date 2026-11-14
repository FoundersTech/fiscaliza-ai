import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { Api } from '@/services/api';
import { buscarPainel, type Painel, PERIODO_PADRAO, type PeriodoPainel } from '@/services/painel';

/** Filtros e números do painel público. Cada troca de filtro busca tudo de novo. */
export const usePainelStore = defineStore('painel', () => {
  const periodo = ref<PeriodoPainel>(PERIODO_PADRAO);
  const categorias = ref<string[]>([]);
  const painel = ref<Painel | null>(null);
  const carregando = ref(false);
  const erro = ref<string | null>(null);

  // Só a resposta do pedido mais recente vale: trocar o filtro duas vezes seguidas não deixa
  // os números do primeiro aparecerem por cima do segundo.
  let ultimoPedido = 0;

  async function carregar(api: Api): Promise<void> {
    const pedido = ++ultimoPedido;
    carregando.value = true;
    erro.value = null;
    const resultado = await buscarPainel(api, {
      periodo: periodo.value,
      categorias: categorias.value,
    });
    if (pedido !== ultimoPedido) return;

    carregando.value = false;
    if (resultado.ok) {
      painel.value = resultado.painel;
    } else {
      painel.value = null;
      erro.value = resultado.mensagem;
    }
  }

  function escolherPeriodo(api: Api, dias: PeriodoPainel): Promise<void> {
    periodo.value = dias;
    return carregar(api);
  }

  /** Liga ou desliga uma categoria; nenhuma ligada quer dizer todas. */
  function alternarCategoria(api: Api, slug: string): Promise<void> {
    categorias.value = categorias.value.includes(slug)
      ? categorias.value.filter((atual) => atual !== slug)
      : [...categorias.value, slug];
    return carregar(api);
  }

  function todasCategorias(api: Api): Promise<void> {
    if (!categorias.value.length) return Promise.resolve();
    categorias.value = [];
    return carregar(api);
  }

  return {
    periodo,
    categorias,
    painel,
    carregando,
    erro,
    carregar,
    escolherPeriodo,
    alternarCategoria,
    todasCategorias,
  };
});
