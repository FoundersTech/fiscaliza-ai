<script setup lang="ts">
import { computed } from 'vue';

import type { Conclusao } from '@/stores/registro';

const props = defineProps<{ conclusao: Conclusao }>();
const emit = defineEmits<{ inicio: []; outra: [] }>();

const titulo = computed(() =>
  props.conclusao.tipo === 'CRIADA' ? 'Notificação enviada' : 'Confirmação registrada',
);

const texto = computed(() => {
  const { conclusao } = props;
  if (conclusao.tipo === 'CRIADA') return 'Seus vizinhos já podem confirmar a ocorrência.';
  if (conclusao.confirmacoes === null) return 'Você já tinha confirmado esta ocorrência.';
  return conclusao.confirmacoes === 1
    ? 'Ela agora tem 1 confirmação. Obrigado por avisar.'
    : `Ela agora tem ${conclusao.confirmacoes} confirmações. Obrigado por avisar.`;
});
</script>

<template>
  <section class="concluido">
    <div class="concluido__selo">
      <q-icon name="sym_o_check" size="36px" />
    </div>
    <h1 class="concluido__titulo">{{ titulo }}</h1>
    <p class="concluido__protocolo">
      Protocolo <strong data-teste="protocolo">{{ conclusao.protocolo }}</strong>
    </p>
    <p class="concluido__texto">{{ texto }}</p>

    <div class="concluido__acoes">
      <q-btn
        unelevated
        no-caps
        color="primary"
        class="fa-botao-largo"
        label="Ir para o início"
        @click="emit('inicio')"
      />
      <q-btn flat no-caps color="primary" label="Registrar outra" @click="emit('outra')" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.concluido {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  padding: var(--fa-secao) var(--fa-pagina);
}

// Círculo azul com halo, como no protótipo.
.concluido__selo {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-bottom: 12px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-azul);
  color: #fff;
  box-shadow: 0 0 0 10px var(--fa-azul-suave);
}

.concluido__titulo {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.concluido__protocolo,
.concluido__texto {
  margin: 0;
  color: var(--fa-texto-2);
}

.concluido__protocolo strong {
  color: var(--fa-texto);
  letter-spacing: 0.02em;
}

.concluido__acoes {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 24px;
}
</style>
