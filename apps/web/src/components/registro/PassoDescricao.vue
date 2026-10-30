<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import {
  type CampoAtributo,
  DESCRICAO_MAX,
  DESCRICAO_MIN,
  problemaDaDescricao,
  problemaDoAtributo,
} from '@/services/registro';
import { useConfigStore } from '@/stores/config';
import { useRegistroStore } from '@/stores/registro';

const api = useApi();
const config = useConfigStore();
const registro = useRegistroStore();

const carregando = ref(false);
const falhou = ref(false);

async function carregarCategorias(): Promise<void> {
  carregando.value = true;
  falhou.value = !(await config.carregar(api));
  carregando.value = false;
}

onMounted(carregarCategorias);

function regra(campo: CampoAtributo) {
  return (valor: string | number | null) => problemaDoAtributo(campo, valor) ?? true;
}

function rotulo(campo: CampoAtributo): string {
  return campo.obrigatorio ? campo.rotulo : `${campo.rotulo} (opcional)`;
}

/** O campo de número devolve texto; vazio vira null, como "não informado". */
function atualizarNumero(chave: string, valor: string | number | null): void {
  registro.atributos[chave] = valor === null || valor === '' ? null : Number(valor);
}
</script>

<template>
  <section class="passo-descricao">
    <div class="passo-descricao__bloco">
      <h2 class="passo-descricao__titulo">Categoria</h2>
      <div v-if="carregando" class="passo-descricao__estado">
        <q-spinner size="24px" color="primary" />
      </div>
      <div v-else-if="falhou" class="passo-descricao__estado">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">
          Não foi possível carregar as categorias.
        </p>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregarCategorias" />
      </div>
      <div v-else class="passo-descricao__categorias" role="radiogroup" aria-label="Categoria">
        <button
          v-for="categoria in config.categorias"
          :key="categoria.id"
          type="button"
          role="radio"
          class="passo-descricao__categoria"
          :class="{ 'passo-descricao__categoria--ativa': registro.categoria?.id === categoria.id }"
          :aria-checked="registro.categoria?.id === categoria.id"
          @click="registro.escolherCategoria(categoria)"
        >
          <q-icon :name="`sym_o_${categoria.icone}`" size="20px" />
          {{ categoria.nome }}
        </button>
      </div>
    </div>

    <div v-if="registro.categoria?.schema_atributos.length" class="passo-descricao__bloco">
      <h2 class="passo-descricao__titulo">Detalhes de {{ registro.categoria.nome }}</h2>
      <template v-for="campo in registro.categoria.schema_atributos" :key="campo.chave">
        <q-select
          v-if="campo.tipo === 'opcao'"
          v-model="registro.atributos[campo.chave]"
          :options="campo.opcoes ?? []"
          :label="rotulo(campo)"
          outlined
          clearable
          lazy-rules
          :rules="[regra(campo)]"
        />
        <q-input
          v-else-if="campo.tipo === 'numero'"
          :model-value="registro.atributos[campo.chave] ?? null"
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
          v-model="registro.atributos[campo.chave]"
          :label="rotulo(campo)"
          :maxlength="campo.max"
          outlined
          lazy-rules
          :rules="[regra(campo)]"
        />
      </template>
    </div>

    <div class="passo-descricao__bloco">
      <h2 class="passo-descricao__titulo">Descrição</h2>
      <q-input
        v-model="registro.descricao"
        type="textarea"
        autogrow
        outlined
        counter
        :maxlength="DESCRICAO_MAX"
        :hint="`De ${DESCRICAO_MIN} a ${DESCRICAO_MAX} caracteres`"
        placeholder="Ex.: buraco grande na faixa da direita, em frente à escola"
        lazy-rules
        :rules="[(valor: string) => problemaDaDescricao(valor) ?? true]"
        aria-label="Descrição"
        class="passo-descricao__texto"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.passo-descricao {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.passo-descricao__bloco {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.passo-descricao__titulo {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fa-texto-2);
}

.passo-descricao__estado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
}

.passo-descricao__categorias {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.passo-descricao__categoria {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 14px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio);
  background: var(--fa-superficie);
  color: var(--fa-texto);
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &--ativa {
    border-color: var(--fa-azul);
    background: var(--fa-azul-suave);
    color: var(--fa-azul);
  }
}

.passo-descricao__texto :deep(textarea) {
  min-height: 96px;
}
</style>
