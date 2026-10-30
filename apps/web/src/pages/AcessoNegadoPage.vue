<script setup lang="ts">
import EstadoVazio from '@/components/EstadoVazio.vue';
import TelaCentral from '@/components/TelaCentral.vue';
</script>

<template>
  <TelaCentral>
    <EstadoVazio
      icone="sym_o_block"
      titulo="Acesso negado"
      texto="Sua conta não tem permissão para abrir esta tela."
    >
      <q-btn unelevated no-caps color="primary" to="/" label="Voltar ao início" class="botao" />
    </EstadoVazio>
  </TelaCentral>
</template>

<style scoped lang="scss">
.botao {
  margin-top: 12px;
  border-radius: var(--fa-raio-sm);
  font-weight: 600;
}
</style>
