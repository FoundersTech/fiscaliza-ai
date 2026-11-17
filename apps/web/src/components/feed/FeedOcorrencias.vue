<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';

import { useApi } from '@/boot/api';
import EstadoVazio from '@/components/EstadoVazio.vue';
import type { FiltrosFeed } from '@/services/feed';
import { useConfigStore } from '@/stores/config';
import { useFeedStore } from '@/stores/feed';

import CardOcorrencia from './CardOcorrencia.vue';
import FiltrosFeedComponente from './FiltrosFeed.vue';

const api = useApi();
const feed = useFeedStore();
const config = useConfigStore();

/** Marcador no fim da lista: quando aparece na tela, vem a página seguinte. */
const fimDaLista = ref<HTMLElement | null>(null);
const fimVisivel = ref(false);
let observador: IntersectionObserver | null = null;

onMounted(async () => {
  observador = new IntersectionObserver(
    ([entrada]) => {
      fimVisivel.value = entrada?.isIntersecting ?? false;
    },
    { rootMargin: '0px 0px 400px 0px' },
  );
  if (fimDaLista.value) observador.observe(fimDaLista.value);

  // As categorias dos filtros e o município vêm da configuração pública.
  await config.carregar(api);
  await feed.abrir(api);
});

onBeforeUnmount(() => observador?.disconnect());

// Trocar de cidade no cabeçalho recomeça a lista; a primeira carga fica com o onMounted.
watch(
  () => config.municipio?.id,
  (nova, antiga) => {
    if (antiga !== undefined && nova !== antiga) void feed.recarregar(api);
  },
);

// Enquanto o fim da lista estiver à vista, continua buscando (uma tela alta pode caber duas
// páginas). Um erro para a busca até a pessoa tocar em "Tentar de novo".
watchEffect(() => {
  if (fimVisivel.value && feed.temMais && !feed.carregando && !feed.erro) {
    void feed.carregarMais(api);
  }
});

function filtrar(mudanca: Partial<FiltrosFeed>): void {
  void feed.filtrar(api, mudanca);
}
</script>

<template>
  <FiltrosFeedComponente
    :filtros="feed.filtros"
    :categorias="config.categorias"
    @filtrar="filtrar"
  />

  <section class="feed" aria-label="Ocorrências" :aria-busy="feed.carregando">
    <CardOcorrencia v-for="item in feed.itens" :key="item.id" :ocorrencia="item" />

    <template v-if="feed.carregando">
      <q-skeleton
        v-for="n in feed.itens.length ? 1 : 3"
        :key="n"
        class="feed__esqueleto"
        type="rect"
      />
    </template>

    <div v-if="feed.erro" class="feed__erro">
      <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ feed.erro }}</p>
      <q-btn
        outline
        no-caps
        color="primary"
        label="Tentar de novo"
        class="fa-botao-largo"
        @click="feed.tentarDeNovo(api)"
      />
    </div>

    <EstadoVazio
      v-else-if="feed.vazio && feed.comFiltro"
      icone="sym_o_search_off"
      titulo="Nenhuma ocorrência encontrada"
      texto="Nenhuma ocorrência combina com os filtros escolhidos."
    >
      <q-btn flat no-caps color="primary" label="Limpar filtros" @click="feed.limparFiltros(api)" />
    </EstadoVazio>

    <EstadoVazio
      v-else-if="feed.vazio"
      icone="sym_o_campaign"
      titulo="Nenhuma ocorrência por aqui ainda"
      texto="Os problemas registrados em Sorocaba vão aparecer aqui, com o status de cada um."
    />

    <p v-else-if="feed.carregado && !feed.temMais && !feed.carregando" class="feed__fim fa-legenda">
      Você viu todas as ocorrências.
    </p>

    <div ref="fimDaLista" class="feed__marcador" aria-hidden="true" />
  </section>
</template>

<style scoped lang="scss">
.feed {
  display: flex;
  flex-direction: column;
  gap: var(--fa-pagina);
}

.feed__esqueleto {
  height: 320px;
  border-radius: var(--fa-raio-lg);
}

.feed__erro {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feed__fim {
  margin: 0;
  text-align: center;
}

.feed__marcador {
  height: 1px;
}
</style>
