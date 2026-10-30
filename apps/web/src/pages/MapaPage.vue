<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Mapa" com-local />
      <EstadoVazio
        icone="sym_o_map"
        titulo="O mapa está a caminho"
        texto="Cada ocorrência vai aparecer como um alfinete com a cor do status, por bairro."
      />
    </div>
  </q-page>
</template>
