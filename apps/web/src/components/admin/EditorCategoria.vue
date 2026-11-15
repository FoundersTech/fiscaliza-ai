<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import { useApi } from '@/boot/api';
import CamposAtributos from '@/components/CamposAtributos.vue';
import { type CategoriaAdmin, salvarCategoria } from '@/services/administracao';
import {
  type CampoEditavel,
  campoNovo,
  chaveDoRotulo,
  dadosDoFormulario,
  errosDosCamposExtras,
  formularioDe,
  formularioValido,
  paraEnvio,
  problemaDoIcone,
  problemaDoNome,
  problemaDoPrazo,
  type ProblemasCampo,
  problemaDoSlug,
  problemasDoCampo,
  SLA_MAX,
  slugDoNome,
  TIPOS_CAMPO,
} from '@/services/categorias-admin';
import type { ValoresAtributos } from '@/services/registro';

const props = defineProps<{ categoria: CategoriaAdmin | null }>();
const emit = defineEmits<{ salva: [categoria: CategoriaAdmin]; cancelar: [] }>();

const api = useApi();

/** Cada campo com um id local, para a lista não confundir os campos ao mover ou remover. */
interface ItemCampo {
  id: number;
  /** Campo criado agora: a chave acompanha o rótulo até ser editada à mão. */
  novo: boolean;
  campo: CampoEditavel;
}

let proximoId = 0;
const { campos, ...dados } = formularioDe(props.categoria);
const formulario = reactive({ ...dados });
const itens = ref<ItemCampo[]>(campos.map((campo) => ({ id: proximoId++, novo: false, campo })));
/** O slug acompanha o nome numa categoria nova, até ser editado à mão. */
const slugAutomatico = ref(props.categoria === null);

const salvando = ref(false);
const tentouSalvar = ref(false);
const erro = ref<string | null>(null);
const errosApi = ref<Record<string, string>>({});
const errosApiCampos = ref<Record<number, ProblemasCampo>>({});
const valoresPrevia = ref<ValoresAtributos>({});

const listaCampos = computed(() => itens.value.map((item) => item.campo));
const previa = computed(() =>
  listaCampos.value
    .filter((campo) => !Object.keys(problemasDoCampo(campo, listaCampos.value)).length)
    .map(paraEnvio),
);

// Qualquer edição apaga os erros que a API tinha devolvido.
watch(
  [formulario, itens],
  () => {
    errosApi.value = {};
    errosApiCampos.value = {};
    erro.value = null;
  },
  { deep: true },
);

function atualizarNome(nome: string): void {
  formulario.nome = nome;
  if (slugAutomatico.value) formulario.slug = slugDoNome(nome);
}

function atualizarSlug(slug: string): void {
  formulario.slug = slug.toLowerCase();
  slugAutomatico.value = false;
}

function atualizarRotulo(item: ItemCampo, rotulo: string): void {
  item.campo.rotulo = rotulo;
  if (item.novo) item.campo.chave = chaveDoRotulo(rotulo);
}

function atualizarChave(item: ItemCampo, chave: string): void {
  item.campo.chave = chave.toLowerCase();
  item.novo = false;
}

function atualizarNumero(item: ItemCampo, propriedade: 'min' | 'max', valor: unknown): void {
  item.campo[propriedade] = valor === null || valor === '' ? null : Number(valor);
}

function adicionarCampo(): void {
  itens.value.push({ id: proximoId++, novo: true, campo: campoNovo() });
}

function removerCampo(indice: number): void {
  itens.value.splice(indice, 1);
}

function moverCampo(indice: number, passo: -1 | 1): void {
  const destino = indice + passo;
  if (destino < 0 || destino >= itens.value.length) return;
  const [item] = itens.value.splice(indice, 1);
  if (item) itens.value.splice(destino, 0, item);
}

/** Erro do campo: o da API, ou o da validação local depois da primeira tentativa de salvar. */
function erroDe(campo: string, local: string | null): string | undefined {
  return errosApi.value[campo] ?? (tentouSalvar.value ? (local ?? undefined) : undefined);
}

function problemaDoItem(indice: number, propriedade: keyof ProblemasCampo): string | undefined {
  const daApi = errosApiCampos.value[indice]?.[propriedade];
  if (daApi) return daApi;
  if (!tentouSalvar.value) return undefined;
  const campo = itens.value[indice]?.campo;
  return campo ? problemasDoCampo(campo, listaCampos.value)[propriedade] : undefined;
}

async function salvar(): Promise<void> {
  tentouSalvar.value = true;
  const completo = { ...formulario, campos: listaCampos.value };
  if (!formularioValido(completo)) {
    erro.value = 'Confira os campos destacados.';
    return;
  }
  salvando.value = true;
  erro.value = null;
  const resultado = await salvarCategoria(
    api,
    props.categoria?.id ?? null,
    dadosDoFormulario(completo),
  );
  salvando.value = false;
  if (resultado.ok) {
    emit('salva', resultado.dados);
    return;
  }
  const extras = errosDosCamposExtras(resultado.campos);
  errosApi.value = resultado.campos;
  errosApiCampos.value = extras.porCampo;
  const temErroNoCampo =
    ['slug', 'nome', 'icone', 'sla_dias'].some((campo) => resultado.campos[campo]) ||
    Object.keys(extras.porCampo).length > 0;
  erro.value = temErroNoCampo
    ? (extras.geral ?? 'Confira os campos destacados.')
    : resultado.mensagem;
}
</script>

<template>
  <form class="editor" novalidate @submit.prevent="salvar">
    <section class="fa-card editor__secao">
      <h2 class="editor__titulo">
        {{ categoria ? `Editar ${categoria.nome}` : 'Nova categoria' }}
      </h2>
      <q-input
        :model-value="formulario.nome"
        label="Nome"
        outlined
        maxlength="60"
        :error="!!erroDe('nome', problemaDoNome(formulario.nome))"
        :error-message="erroDe('nome', problemaDoNome(formulario.nome))"
        @update:model-value="atualizarNome(String($event ?? ''))"
      />
      <q-input
        :model-value="formulario.slug"
        label="Slug"
        hint="Identificador na URL: letras minúsculas, números e hífens"
        outlined
        maxlength="40"
        :error="!!erroDe('slug', problemaDoSlug(formulario.slug))"
        :error-message="erroDe('slug', problemaDoSlug(formulario.slug))"
        @update:model-value="atualizarSlug(String($event ?? ''))"
      />
      <div class="editor__linha">
        <q-input
          v-model="formulario.icone"
          label="Ícone"
          hint="Nome no Material Icons"
          outlined
          maxlength="60"
          class="editor__icone"
          :error="!!erroDe('icone', problemaDoIcone(formulario.icone))"
          :error-message="erroDe('icone', problemaDoIcone(formulario.icone))"
        >
          <template #prepend>
            <q-icon
              :name="problemaDoIcone(formulario.icone) ? 'sym_o_help' : `sym_o_${formulario.icone}`"
            />
          </template>
        </q-input>
        <q-input
          :model-value="formulario.slaDias"
          label="Prazo (dias)"
          type="number"
          inputmode="numeric"
          min="1"
          :max="SLA_MAX"
          outlined
          class="editor__prazo"
          :error="!!erroDe('sla_dias', problemaDoPrazo(formulario.slaDias))"
          :error-message="erroDe('sla_dias', problemaDoPrazo(formulario.slaDias))"
          @update:model-value="
            formulario.slaDias = $event === null || $event === '' ? null : Number($event)
          "
        />
      </div>
      <q-toggle
        v-model="formulario.ativa"
        label="Ativa: aparece no registro de novas ocorrências"
        color="primary"
      />
    </section>

    <section class="fa-card editor__secao">
      <h2 class="editor__titulo">Campos extras</h2>
      <p class="fa-legenda editor__texto">
        Perguntas a mais no registro desta categoria, como o número do poste.
      </p>

      <div v-for="(item, indice) in itens" :key="item.id" class="campo">
        <div class="campo__topo">
          <span class="fa-sobrelinha">Campo {{ indice + 1 }}</span>
          <div>
            <q-btn
              flat
              round
              dense
              icon="sym_o_arrow_upward"
              :disable="indice === 0"
              :aria-label="`Subir o campo ${indice + 1}`"
              @click="moverCampo(indice, -1)"
            />
            <q-btn
              flat
              round
              dense
              icon="sym_o_arrow_downward"
              :disable="indice === itens.length - 1"
              :aria-label="`Descer o campo ${indice + 1}`"
              @click="moverCampo(indice, 1)"
            />
            <q-btn
              flat
              round
              dense
              color="negative"
              icon="sym_o_delete"
              :aria-label="`Remover o campo ${indice + 1}`"
              @click="removerCampo(indice)"
            />
          </div>
        </div>
        <q-input
          :model-value="item.campo.rotulo"
          label="Rótulo"
          outlined
          dense
          :error="!!problemaDoItem(indice, 'rotulo')"
          :error-message="problemaDoItem(indice, 'rotulo')"
          @update:model-value="atualizarRotulo(item, String($event ?? ''))"
        />
        <div class="editor__linha">
          <q-input
            :model-value="item.campo.chave"
            label="Chave"
            outlined
            dense
            maxlength="30"
            class="editor__metade"
            :error="!!problemaDoItem(indice, 'chave')"
            :error-message="problemaDoItem(indice, 'chave')"
            @update:model-value="atualizarChave(item, String($event ?? ''))"
          />
          <q-select
            v-model="item.campo.tipo"
            :options="TIPOS_CAMPO"
            option-value="valor"
            option-label="rotulo"
            emit-value
            map-options
            label="Tipo"
            outlined
            dense
            class="editor__metade"
          />
        </div>
        <div v-if="item.campo.tipo !== 'opcao'" class="editor__linha">
          <q-input
            v-if="item.campo.tipo === 'numero'"
            :model-value="item.campo.min"
            label="Mínimo"
            type="number"
            outlined
            dense
            class="editor__metade"
            :error="!!problemaDoItem(indice, 'min')"
            :error-message="problemaDoItem(indice, 'min')"
            @update:model-value="atualizarNumero(item, 'min', $event)"
          />
          <q-input
            :model-value="item.campo.max"
            :label="item.campo.tipo === 'texto' ? 'Máximo de caracteres' : 'Máximo'"
            type="number"
            outlined
            dense
            class="editor__metade"
            :error="!!problemaDoItem(indice, 'max')"
            :error-message="problemaDoItem(indice, 'max')"
            @update:model-value="atualizarNumero(item, 'max', $event)"
          />
        </div>
        <q-select
          v-else
          v-model="item.campo.opcoes"
          label="Opções"
          hint="Digite cada opção e tecle Enter"
          outlined
          dense
          multiple
          use-input
          use-chips
          hide-dropdown-icon
          new-value-mode="add-unique"
          input-debounce="0"
          :error="!!problemaDoItem(indice, 'opcoes')"
          :error-message="problemaDoItem(indice, 'opcoes')"
        />
        <q-toggle v-model="item.campo.obrigatorio" label="Obrigatório" color="primary" dense />
      </div>

      <q-btn
        outline
        no-caps
        color="primary"
        icon="sym_o_add"
        label="Adicionar campo"
        class="editor__adicionar"
        @click="adicionarCampo"
      />
    </section>

    <section v-if="previa.length" class="fa-card editor__secao">
      <h2 class="editor__titulo">Prévia no registro</h2>
      <p class="fa-legenda editor__texto">Como o cidadão vê os campos extras no passo 2.</p>
      <div class="editor__previa">
        <CamposAtributos v-model="valoresPrevia" :campos="previa" />
      </div>
    </section>

    <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>

    <div class="editor__acoes">
      <q-btn flat no-caps label="Cancelar" :disable="salvando" @click="emit('cancelar')" />
      <q-btn
        type="submit"
        unelevated
        no-caps
        color="primary"
        label="Salvar categoria"
        :loading="salvando"
      />
    </div>
  </form>
</template>

<style scoped lang="scss">
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--fa-pagina);
}

.editor__secao {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editor__titulo {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.editor__texto {
  margin: -4px 0 8px;
}

.editor__linha {
  display: flex;
  gap: 8px;
}

.editor__icone,
.editor__metade {
  flex: 1;
  min-width: 0;
}

.editor__prazo {
  width: 130px;
  flex-shrink: 0;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio);
}

.campo__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor__adicionar {
  align-self: flex-start;
  border-radius: var(--fa-raio-sm);
}

.editor__previa {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editor__acoes {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
