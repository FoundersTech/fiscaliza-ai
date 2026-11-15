<script setup lang="ts">
import { emailValido, tamanho } from '@/services/validacao';

/** Nome e e-mail de quem recebe um convite para definir a senha. */
defineProps<{ erros: Record<string, string> }>();
const nome = defineModel<string>('nome', { required: true });
const email = defineModel<string>('email', { required: true });
const emit = defineEmits<{ editou: [campo: 'nome' | 'email'] }>();

const regraNome = tamanho(2, 100, 'O nome deve ter de 2 a 100 caracteres');
</script>

<template>
  <q-input
    v-model="nome"
    label="Nome"
    outlined
    maxlength="100"
    autocomplete="off"
    lazy-rules
    :rules="[regraNome]"
    :error="!!erros['nome']"
    :error-message="erros['nome']"
    @update:model-value="emit('editou', 'nome')"
  />
  <q-input
    v-model="email"
    label="E-mail"
    type="email"
    inputmode="email"
    outlined
    autocomplete="off"
    lazy-rules
    :rules="[emailValido]"
    :error="!!erros['email']"
    :error-message="erros['email']"
    @update:model-value="emit('editou', 'email')"
  />
</template>
