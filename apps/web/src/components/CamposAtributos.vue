<script setup lang="ts">
import { type CampoAtributo, problemaDoAtributo, type ValoresAtributos } from '@/services/registro';

/** Os campos extras de uma categoria, no registro e na prévia do cadastro de categorias. */
defineProps<{ campos: readonly CampoAtributo[] }>();
const valores = defineModel<ValoresAtributos>({ required: true });

function regra(campo: CampoAtributo) {
  return (valor: string | number | null) => problemaDoAtributo(campo, valor) ?? true;
}

function rotulo(campo: CampoAtributo): string {
  return campo.obrigatorio ? campo.rotulo : `${campo.rotulo} (opcional)`;
}

/** O campo de número devolve texto; vazio vira null, como "não informado". */
function atualizarNumero(chave: string, valor: string | number | null): void {
  valores.value[chave] = valor === null || valor === '' ? null : Number(valor);
}
</script>

<template>
  <template v-for="campo in campos" :key="campo.chave">
    <q-select
      v-if="campo.tipo === 'opcao'"
      v-model="valores[campo.chave]"
      :options="campo.opcoes ?? []"
      :label="rotulo(campo)"
      outlined
      clearable
      lazy-rules
      :rules="[regra(campo)]"
    />
    <q-input
      v-else-if="campo.tipo === 'numero'"
      :model-value="valores[campo.chave] ?? null"
      type="number"
      inputmode="numeric"
      :min="campo.min"
      :max="campo.max"
      :label="rotulo(campo)"
      outlined
      lazy-rules
      :rules="[regra(campo)]"
      @update:model-value="atualizarNumero(campo.chave, $event)"
    />
    <q-input
      v-else
      v-model="valores[campo.chave]"
      :label="rotulo(campo)"
      :maxlength="campo.max"
      outlined
      lazy-rules
      :rules="[regra(campo)]"
    />
  </template>
</template>
