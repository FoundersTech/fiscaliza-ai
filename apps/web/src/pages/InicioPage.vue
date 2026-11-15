<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import FeedOcorrencias from '@/components/feed/FeedOcorrencias.vue';
import SeloReputacao from '@/components/feed/SeloReputacao.vue';
import AvisoPendentes from '@/components/pendentes/AvisoPendentes.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Ocorrências" com-local />

      <AvisoPendentes />

      <router-link
        v-if="auth.papel === 'AGENTE_ORGAO'"
        to="/atendimento"
        class="atalho fa-card"
        aria-label="Abrir a fila de atendimento do órgão"
      >
        <q-icon name="sym_o_assignment" size="28px" class="atalho__icone" />
        <div class="atalho__texto">
          <strong>Fila de atendimento</strong>
          <span class="fa-legenda">As ocorrências do seu órgão, para triar e responder.</span>
        </div>
        <q-icon name="sym_o_chevron_right" size="20px" class="atalho__seta" />
      </router-link>

      <SeloReputacao />

      <FeedOcorrencias />
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.atalho {
  display: flex;
  align-items: center;
  gap: 16px;
  color: inherit;
  text-decoration: none;
  border-color: var(--fa-azul);
}

.atalho__icone {
  color: var(--fa-azul);
}

.atalho__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;

  strong {
    font-size: 16px;
    font-weight: 600;
  }
}

.atalho__seta {
  color: var(--fa-texto-3);
}
</style>
