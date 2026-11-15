<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Ocorrências" com-local />

      <router-link
        v-if="auth.papel === 'AGENTE_ORGAO'"
        to="/atendimento"
        class="atalho fa-card"
        aria-label="Abrir a fila de atendimento do órgão"
      >
        <q-icon name="sym_o_assignment" size="28px" class="atalho__icone" />
        <div class="selo__texto">
          <strong>Fila de atendimento</strong>
          <span class="fa-legenda">As ocorrências do seu órgão, para triar e responder.</span>
        </div>
        <q-icon name="sym_o_chevron_right" size="20px" class="selo__seta" />
      </router-link>

      <router-link to="/score" class="selo fa-card" aria-label="Ver a reputação da gestão">
        <div class="selo__nota">
          <span class="selo__valor">–</span>
          <span class="selo__escala">/10</span>
        </div>
        <div class="selo__texto">
          <span class="fa-sobrelinha">Reputação da gestão</span>
          <strong>Sem dados suficientes</strong>
          <span class="fa-legenda">A nota aparece com as primeiras ocorrências.</span>
        </div>
        <q-icon name="sym_o_chevron_right" size="20px" class="selo__seta" />
      </router-link>

      <EstadoVazio
        icone="sym_o_campaign"
        titulo="Nenhuma ocorrência por aqui ainda"
        texto="Os problemas registrados em Sorocaba vão aparecer aqui, com o status de cada um."
      />
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

.selo {
  display: flex;
  align-items: center;
  gap: 16px;
  color: inherit;
  text-decoration: none;
}

.selo__nota {
  display: grid;
  place-items: center;
  align-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-azul-suave);
  color: var(--fa-azul);
}

.selo__valor {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.selo__escala {
  font-size: 10px;
}

.selo__texto {
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

.selo__seta {
  color: var(--fa-texto-3);
}
</style>
