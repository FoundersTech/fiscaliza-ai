<script setup lang="ts">
import TelaCentral from './TelaCentral.vue';

defineProps<{ titulo: string; subtitulo?: string }>();
</script>

<template>
  <TelaCentral>
    <router-link to="/" class="marca" aria-label="Ir para o início">
      <img src="/icons/icon-192x192.png" alt="" width="56" height="56" />
    </router-link>
    <h1 class="fa-titulo">{{ titulo }}</h1>
    <p v-if="subtitulo" class="subtitulo">{{ subtitulo }}</p>

    <section class="cartao fa-card">
      <slot />
    </section>

    <slot name="rodape" />
  </TelaCentral>
</template>

<style scoped lang="scss">
// Moldura das telas de conta: entrar, criar conta, esqueci a senha e definir senha.
.marca img {
  display: block;
  border-radius: var(--fa-raio-lg);
}

.subtitulo {
  margin: 0;
  color: var(--fa-texto-2);
}

.cartao {
  width: 100%;
  margin: 8px 0 4px;
  text-align: left;
}
</style>
