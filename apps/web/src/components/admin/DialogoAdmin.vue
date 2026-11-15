<script setup lang="ts">
/** Confirmação de uma ação de admin: título, explicação e os botões em `acoes`. */
defineProps<{ titulo: string; ocupado?: boolean }>();
const aberto = defineModel<boolean>({ required: true });
</script>

<template>
  <q-dialog v-model="aberto" :persistent="ocupado">
    <q-card class="dialogo">
      <h2 class="dialogo__titulo">{{ titulo }}</h2>
      <slot />
      <div class="dialogo__acoes">
        <q-btn flat no-caps label="Cancelar" :disable="ocupado" v-close-popup />
        <slot name="acoes" />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.dialogo {
  width: 100%;
  max-width: 420px;
  padding: var(--fa-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--fa-superficie);
  border-radius: var(--fa-raio-lg);

  :slotted(p) {
    margin: 0;
    color: var(--fa-texto-2);
  }
}

.dialogo__titulo {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.dialogo__acoes {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
