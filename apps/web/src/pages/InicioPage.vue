<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import FeedOcorrencias from '@/components/feed/FeedOcorrencias.vue';
import SeloReputacao from '@/components/feed/SeloReputacao.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Ocorrências" com-local />

      <SeloReputacao />

      <FeedOcorrencias />
    </div>
  </q-page>
</template>
