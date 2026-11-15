<script setup lang="ts">
import { computed } from 'vue';

import { conviteParaEntrar } from '@/services/sincronizacao';
import { useAuthStore } from '@/stores/auth';
import { usePendentesStore } from '@/stores/pendentes';

/** Faixa para quem tem ocorrências guardadas no aparelho. */
const auth = useAuthStore();
const pendentes = usePendentesStore();

const aviso = computed(() => {
  if (!auth.logado) {
    const texto = conviteParaEntrar(pendentes.totalNoAparelho);
    return texto ? { texto, destino: '/login?voltar=/minhas-ocorrencias' } : null;
  }
  if (auth.papel !== 'CIDADAO' || pendentes.quantidade === 0) return null;
  const n = pendentes.quantidade;
  return {
    texto: n === 1 ? '1 ocorrência aguardando envio' : `${n} ocorrências aguardando envio`,
    destino: '/minhas-ocorrencias',
  };
});
</script>

<template>
  <router-link v-if="aviso" :to="aviso.destino" class="aviso fa-card" role="status">
    <q-icon name="sym_o_cloud_upload" size="20px" />
    <span class="aviso__texto">{{ aviso.texto }}</span>
    <q-icon name="sym_o_chevron_right" size="20px" />
  </router-link>
</template>

<style scoped lang="scss">
.aviso {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--fa-recebido-texto);
  background: var(--fa-recebido-fundo);
  border-color: transparent;
  text-decoration: none;
  font-weight: 600;
}

.aviso__texto {
  flex: 1;
}
</style>
