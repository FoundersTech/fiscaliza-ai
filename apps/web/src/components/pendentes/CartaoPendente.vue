<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import type { Pendente } from '@/services/pendentes';

const props = defineProps<{ pendente: Pendente }>();
const emit = defineEmits<{ descartar: [] }>();

const ROTULOS = {
  AGUARDANDO: 'Aguardando conexão',
  ENVIANDO: 'Enviando…',
  ERRO: 'Não enviada',
} as const;

const confirmando = ref(false);
const capa = props.pendente.fotos[0]?.arquivo;
const miniatura = capa ? URL.createObjectURL(capa) : null;
onBeforeUnmount(() => {
  if (miniatura) URL.revokeObjectURL(miniatura);
});

const quando = computed(() =>
  new Date(props.pendente.criadaEm).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
);

function descartar(): void {
  confirmando.value = false;
  emit('descartar');
}
</script>

<template>
  <article class="pendente fa-card" :data-estado="pendente.estado">
    <img v-if="miniatura" :src="miniatura" alt="" class="pendente__foto" />
    <div class="pendente__corpo">
      <span class="pendente__selo" :class="`pendente__selo--${pendente.estado.toLowerCase()}`">
        <q-spinner v-if="pendente.estado === 'ENVIANDO'" size="12px" />
        <q-icon v-else-if="pendente.estado === 'AGUARDANDO'" name="sym_o_cloud_off" size="14px" />
        <q-icon v-else name="sym_o_error" size="14px" />
        {{ ROTULOS[pendente.estado] }}
      </span>
      <strong class="pendente__categoria">{{ pendente.categoriaNome }}</strong>
      <p class="pendente__descricao">{{ pendente.dados.descricao }}</p>
      <span class="fa-legenda">
        {{ pendente.endereco ? `${pendente.endereco} · ` : '' }}Registrada em {{ quando }}
      </span>

      <template v-if="pendente.estado === 'ERRO'">
        <p class="fa-mensagem fa-mensagem--erro pendente__motivo" role="alert">
          {{ pendente.erro }}
        </p>
        <q-btn
          flat
          no-caps
          dense
          color="negative"
          icon="sym_o_delete"
          label="Descartar"
          class="pendente__descartar"
          @click="confirmando = true"
        />
      </template>
    </div>

    <q-dialog v-model="confirmando">
      <q-card class="pendente__dialogo">
        <q-card-section>
          <h2 class="fa-titulo">Descartar esta ocorrência?</h2>
          <p>Ela sai do aparelho e não vai ser enviada. Não dá para desfazer.</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps label="Cancelar" />
          <q-btn unelevated no-caps color="negative" label="Descartar" @click="descartar" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </article>
</template>

<style scoped lang="scss">
.pendente {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.pendente__foto {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--fa-raio-sm);
}

.pendente__corpo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.pendente__selo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
  background: var(--fa-borda);
  color: var(--fa-texto-2);

  &--enviando {
    background: var(--fa-andamento-fundo);
    color: var(--fa-andamento-texto);
  }

  &--erro {
    background: transparent;
    color: var(--fa-urgente);
    padding-left: 0;
  }
}

.pendente__categoria {
  font-size: 15px;
  font-weight: 600;
}

.pendente__descricao {
  margin: 0;
  color: var(--fa-texto-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pendente__motivo {
  margin: 8px 0 0;
}

.pendente__descartar {
  align-self: flex-start;
}

.pendente__dialogo {
  max-width: 360px;

  h2 {
    margin: 0 0 8px;
  }

  p {
    margin: 0;
    color: var(--fa-texto-2);
  }
}
</style>
