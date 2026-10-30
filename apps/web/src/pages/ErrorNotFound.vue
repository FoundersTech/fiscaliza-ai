<script setup lang="ts">
import EstadoVazio from '@/components/EstadoVazio.vue';
import TelaCentral from '@/components/TelaCentral.vue';
</script>

<template>
  <TelaCentral>
    <EstadoVazio
      icone="sym_o_explore_off"
      titulo="Página não encontrada"
      texto="O endereço pode ter mudado ou estar incompleto."
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
