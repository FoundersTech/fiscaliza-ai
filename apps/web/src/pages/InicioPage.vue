<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import FeedOcorrencias from '@/components/feed/FeedOcorrencias.vue';
import SeloReputacao from '@/components/feed/SeloReputacao.vue';
import AvisoPendentes from '@/components/pendentes/AvisoPendentes.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Ocorrências" com-local />

      <AvisoPendentes />

      <SeloReputacao />

      <FeedOcorrencias />
    </div>
  </q-page>
</template>
