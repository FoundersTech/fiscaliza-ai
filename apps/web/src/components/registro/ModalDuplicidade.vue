<script setup lang="ts">
import type { Candidata } from '@/services/envio';

defineProps<{
  candidatas: Candidata[];
  enviando: boolean;
  erro: string | null;
}>();
const aberto = defineModel<boolean>({ required: true });
const emit = defineEmits<{ tambemVi: [candidata: Candidata]; outroProblema: [] }>();

function identificacao(candidata: Candidata): string {
  return `${candidata.protocolo} · a ${candidata.distancia_m} m`;
}

function confirmacoes(total: number): string {
  if (total === 0) return 'Nenhuma confirmação ainda';
  return total === 1 ? '1 confirmação' : `${total} confirmações`;
}
</script>

<template>
  <q-dialog v-model="aberto" position="bottom" :persistent="enviando">
    <q-card class="duplicidade">
      <h2 class="duplicidade__titulo">Já registraram algo parecido aqui</h2>
      <p class="duplicidade__texto">
        Na mesma categoria, bem perto do seu ponto. Se for o mesmo problema, confirme a ocorrência
        que já existe: ela ganha força com cada vizinho que também viu.
      </p>

      <ul class="duplicidade__lista">
        <li v-for="candidata in candidatas" :key="candidata.id" class="duplicidade__item">
          <div class="duplicidade__dados">
            <span class="fa-sobrelinha">{{ identificacao(candidata) }}</span>
            <span class="duplicidade__resumo">{{ candidata.resumo }}</span>
            <span class="fa-legenda">{{ confirmacoes(candidata.confirmacoes) }}</span>
          </div>
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Também vi"
            :disable="enviando"
            @click="emit('tambemVi', candidata)"
          />
        </li>
      </ul>

      <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>

      <q-btn
        outline
        no-caps
        color="primary"
        class="fa-botao-largo"
        label="É outro problema"
        :loading="enviando"
        @click="emit('outroProblema')"
      />
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.duplicidade {
  width: 100%;
  max-width: 560px;
  padding: var(--fa-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--fa-superficie);
  border-radius: var(--fa-raio-lg) var(--fa-raio-lg) 0 0;
}

.duplicidade__titulo {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.duplicidade__texto {
  margin: 0;
  font-size: 13px;
  color: var(--fa-texto-2);
}

.duplicidade__lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.duplicidade__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio);
}

.duplicidade__dados {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.duplicidade__resumo {
  font-weight: 500;
}
</style>
