<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import TelaCentral from '@/components/TelaCentral.vue';
import { destinoSeguro } from '@/router/acesso';

const rota = useRoute();
const voltar = computed(() => destinoSeguro(rota.query.voltar));
</script>

<template>
  <TelaCentral>
    <img src="/icons/icon-192x192.png" alt="" width="96" height="96" class="logo" />
    <h1 class="fa-titulo">Fiscaliza Aí!</h1>
    <p class="slogan">Viu um problema? Fiscaliza Aí!</p>

    <section class="aviso fa-card">
      <q-icon name="sym_o_lock" size="24px" class="aviso__icone" />
      <p>Para continuar, entre na sua conta. A tela de entrada está quase pronta.</p>
      <p v-if="voltar !== '/'" class="fa-legenda">
        Depois de entrar, você volta para {{ voltar }}.
      </p>
    </section>

    <q-btn unelevated no-caps color="primary" to="/" label="Voltar ao início" class="botao" />
  </TelaCentral>
</template>

<style scoped lang="scss">
.logo {
  border-radius: 22px;
  margin-bottom: 8px;
}

.slogan {
  margin: 0 0 12px;
  color: var(--fa-texto-2);
}

.aviso {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;

  p {
    margin: 0;
  }
}

.aviso__icone {
  color: var(--fa-azul);
}

.botao {
  width: 100%;
  height: 44px;
  border-radius: var(--fa-raio-sm);
  font-weight: 600;
}
</style>
