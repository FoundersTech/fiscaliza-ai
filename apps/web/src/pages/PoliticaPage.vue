<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import TextoPolitica from '@/components/TextoPolitica.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Política de privacidade" :com-alertas="false" />
      <article class="fa-card">
        <TextoPolitica />
      </article>
    </div>
  </q-page>
</template>
