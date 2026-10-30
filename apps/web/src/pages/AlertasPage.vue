<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Alertas" :com-alertas="false" />
      <EstadoVazio
        icone="sym_o_notifications"
        titulo="Nenhum alerta"
        texto="Quando uma ocorrência sua mudar de status, o aviso aparece aqui."
      />
    </div>
  </q-page>
</template>
