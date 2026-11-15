<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import EditorCategoria from '@/components/admin/EditorCategoria.vue';
import PaginaAdmin from '@/components/admin/PaginaAdmin.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import { type CategoriaAdmin, comCategoria, listarCategorias } from '@/services/administracao';

const api = useApi();

const categorias = ref<CategoriaAdmin[]>([]);
const carregando = ref(true);
const erroCarga = ref<string | null>(null);
/** null: a lista; 'nova': cadastro; ou a categoria em edição. */
const editando = ref<CategoriaAdmin | 'nova' | null>(null);
const salva = ref<string | null>(null);

async function carregar(): Promise<void> {
  carregando.value = true;
  erroCarga.value = null;
  const resultado = await listarCategorias(api);
  if (resultado.ok) categorias.value = resultado.dados;
  else erroCarga.value = resultado.mensagem;
  carregando.value = false;
}

onMounted(carregar);

function editar(categoria: CategoriaAdmin | 'nova'): void {
  salva.value = null;
  editando.value = categoria;
  window.scrollTo({ top: 0 });
}

function aoSalvar(categoria: CategoriaAdmin): void {
  categorias.value = comCategoria(categorias.value, categoria);
  salva.value = categoria.nome;
  editando.value = null;
}

function camposExtras(categoria: CategoriaAdmin): string {
  const total = categoria.schema_atributos.length;
  if (!total) return 'Sem campos extras';
  return total === 1 ? '1 campo extra' : `${total} campos extras`;
}
</script>

<template>
  <PaginaAdmin
    titulo="Categorias"
    subtitulo="O que o cidadão escolhe no registro e o prazo de cada uma"
  >
    <EditorCategoria
      v-if="editando"
      :key="editando === 'nova' ? 'nova' : editando.id"
      :categoria="editando === 'nova' ? null : editando"
      @salva="aoSalvar"
      @cancelar="editando = null"
    />

    <template v-else>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="sym_o_add"
        label="Nova categoria"
        class="fa-botao-largo"
        @click="editar('nova')"
      />

      <p v-if="salva" class="fa-mensagem fa-mensagem--sucesso" role="status">
        Categoria {{ salva }} salva.
      </p>

      <div v-if="carregando" class="fa-estado"><q-spinner size="28px" color="primary" /></div>

      <div v-else-if="erroCarga" class="fa-estado">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroCarga }}</p>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregar" />
      </div>

      <EstadoVazio
        v-else-if="!categorias.length"
        icone="sym_o_category"
        titulo="Nenhuma categoria"
        texto="Cadastre a primeira categoria para o cidadão poder registrar ocorrências."
      />

      <ul v-else class="lista">
        <li v-for="categoria in categorias" :key="categoria.id">
          <button type="button" class="categoria fa-card" @click="editar(categoria)">
            <span class="categoria__icone">
              <q-icon :name="`sym_o_${categoria.icone}`" size="22px" />
            </span>
            <span class="categoria__dados">
              <span class="categoria__nome">
                {{ categoria.nome }}
                <span v-if="!categoria.ativa" class="categoria__inativa">Inativa</span>
              </span>
              <span class="fa-legenda">
                {{ categoria.slug }} · {{ categoria.sla_dias }}
                {{ categoria.sla_dias === 1 ? 'dia' : 'dias' }} · {{ camposExtras(categoria) }}
              </span>
            </span>
            <q-icon name="sym_o_chevron_right" size="20px" class="categoria__seta" />
          </button>
        </li>
      </ul>
    </template>
  </PaginaAdmin>
</template>

<style scoped lang="scss">
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.categoria {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.categoria__icone {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--fa-raio);
  background: var(--fa-azul-suave);
  color: var(--fa-azul);
}

.categoria__dados {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.categoria__nome {
  font-weight: 600;
}

.categoria__inativa {
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie-2);
  color: var(--fa-texto-3);
  font-size: 12px;
  font-weight: 500;
}

.categoria__seta {
  color: var(--fa-texto-3);
}
</style>
