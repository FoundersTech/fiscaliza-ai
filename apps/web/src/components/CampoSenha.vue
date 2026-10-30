<script setup lang="ts">
import type { ValidationRule } from 'quasar';
import { ref } from 'vue';

const valor = defineModel<string>({ required: true });

defineProps<{
  rotulo: string;
  autocomplete: 'current-password' | 'new-password';
  regras?: ValidationRule[];
  dica?: string;
  erro?: string | undefined;
}>();

const visivel = ref(false);
</script>

<template>
  <q-input
    v-model="valor"
    :type="visivel ? 'text' : 'password'"
    :label="rotulo"
    :autocomplete="autocomplete"
    :rules="regras"
    :hint="dica"
    :error="erro ? true : undefined"
    :error-message="erro"
    outlined
    lazy-rules
  >
    <template #append>
      <q-btn
        flat
        round
        dense
        :icon="visivel ? 'sym_o_visibility_off' : 'sym_o_visibility'"
        :aria-label="visivel ? 'Esconder a senha' : 'Mostrar a senha'"
        :aria-pressed="visivel"
        @click="visivel = !visivel"
      />
    </template>
  </q-input>
</template>
