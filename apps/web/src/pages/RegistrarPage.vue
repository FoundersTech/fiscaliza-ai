<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Nova ocorrência" :com-alertas="false" />
      <EstadoVazio
        icone="sym_o_photo_camera"
        titulo="Registro em três passos"
        texto="Foto do problema, categoria e descrição, e a localização pelo GPS. Ao final, você recebe o protocolo."
      />
    </div>
  </q-page>
</template>
