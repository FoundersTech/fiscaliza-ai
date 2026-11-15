<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import DialogoAdmin from '@/components/admin/DialogoAdmin.vue';
import PaginaAdmin from '@/components/admin/PaginaAdmin.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import {
  type FotoRevisao,
  listarFotos,
  type Moderacao,
  MOTIVO_MAX,
  problemaDoMotivo,
  rejeitarFoto,
} from '@/services/administracao';

const api = useApi();

const FILTROS: { label: string; value: Moderacao }[] = [
  { label: 'Publicadas', value: 'APROVADA' },
  { label: 'Removidas', value: 'REJEITADA' },
];

const moderacao = ref<Moderacao>('APROVADA');
const fotos = ref<FotoRevisao[]>([]);
const cursor = ref<string | null>(null);
const carregando = ref(false);
const erroCarga = ref<string | null>(null);

const aRemover = ref<FotoRevisao | null>(null);
const motivo = ref('');
const removendo = ref(false);
const erroRemocao = ref<string | null>(null);
const removida = ref<string | null>(null);

/** Sem `continuar`, recomeça a lista do filtro atual. */
async function carregar(continuar = false): Promise<void> {
  carregando.value = true;
  erroCarga.value = null;
  const filtro = moderacao.value;
  const resultado = await listarFotos(api, filtro, continuar ? cursor.value : null);
  if (filtro !== moderacao.value) return; // o filtro mudou no meio do caminho
  if (resultado.ok) {
    fotos.value = continuar ? [...fotos.value, ...resultado.dados.itens] : resultado.dados.itens;
    cursor.value = resultado.dados.proximo_cursor;
  } else {
    erroCarga.value = resultado.mensagem;
  }
  carregando.value = false;
}

onMounted(() => carregar());

function trocarFiltro(valor: Moderacao): void {
  moderacao.value = valor;
  fotos.value = [];
  cursor.value = null;
  removida.value = null;
  void carregar();
}

function pedirRemocao(foto: FotoRevisao): void {
  aRemover.value = foto;
  motivo.value = '';
  erroRemocao.value = null;
}

async function remover(): Promise<void> {
  const foto = aRemover.value;
  if (!foto || problemaDoMotivo(motivo.value)) return;
  removendo.value = true;
  erroRemocao.value = null;
  const resultado = await rejeitarFoto(api, foto.id, motivo.value);
  removendo.value = false;
  if (resultado.ok) {
    fotos.value = fotos.value.filter((outra) => outra.id !== foto.id);
    removida.value = foto.protocolo;
    aRemover.value = null;
  } else {
    erroRemocao.value = resultado.campos['motivo'] ?? resultado.mensagem;
  }
}

const formatoData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function dataDa(foto: FotoRevisao): string {
  return formatoData.format(new Date(foto.criada_em));
}
</script>

<template>
  <PaginaAdmin titulo="Fotos" subtitulo="Remova fotos impróprias das telas públicas">
    <q-btn-toggle
      :model-value="moderacao"
      :options="FILTROS"
      no-caps
      unelevated
      spread
      toggle-color="primary"
      class="filtro"
      @update:model-value="trocarFiltro"
    />

    <p v-if="removida" class="fa-mensagem fa-mensagem--sucesso" role="status">
      A foto da ocorrência {{ removida }} foi removida.
    </p>

    <div v-if="carregando && !fotos.length" class="fa-estado">
      <q-spinner size="28px" color="primary" />
    </div>

    <div v-else-if="erroCarga && !fotos.length" class="fa-estado">
      <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroCarga }}</p>
      <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregar()" />
    </div>

    <EstadoVazio
      v-else-if="!fotos.length"
      icone="sym_o_photo_library"
      :titulo="moderacao === 'APROVADA' ? 'Nenhuma foto publicada' : 'Nenhuma foto removida'"
      texto="As fotos das ocorrências aparecem aqui, das mais recentes às mais antigas."
    />

    <template v-else>
      <ul class="grade">
        <li v-for="foto in fotos" :key="foto.id" class="foto fa-card">
          <a
            v-if="foto.url"
            :href="foto.url"
            target="_blank"
            rel="noopener"
            class="foto__imagem"
            :aria-label="`Abrir a foto ${foto.ordem} da ocorrência ${foto.protocolo}`"
          >
            <img :src="foto.miniatura_url ?? foto.url" alt="" loading="lazy" />
          </a>
          <div v-else class="foto__imagem foto__imagem--vazia">
            <q-icon name="sym_o_hide_image" size="28px" />
          </div>
          <div class="foto__dados">
            <span class="foto__protocolo">{{ foto.protocolo }}</span>
            <span class="fa-legenda">Foto {{ foto.ordem }} · {{ dataDa(foto) }}</span>
            <span v-if="foto.motivo_rejeicao" class="fa-legenda">
              Motivo: {{ foto.motivo_rejeicao }}
            </span>
          </div>
          <q-btn
            v-if="foto.moderacao === 'APROVADA'"
            outline
            no-caps
            color="negative"
            icon="sym_o_delete"
            label="Remover"
            class="foto__remover"
            @click="pedirRemocao(foto)"
          />
        </li>
      </ul>

      <p v-if="erroCarga" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroCarga }}</p>
      <q-btn
        v-if="cursor"
        flat
        no-caps
        color="primary"
        label="Carregar mais"
        :loading="carregando"
        @click="carregar(true)"
      />
    </template>

    <DialogoAdmin
      :model-value="aRemover !== null"
      titulo="Remover esta foto?"
      :ocupado="removendo"
      @update:model-value="aRemover = null"
    >
      <p>
        Ela some na hora do feed, do mapa e do detalhe da ocorrência
        {{ aRemover?.protocolo }}. A ocorrência continua publicada.
      </p>
      <q-input
        v-model="motivo"
        type="textarea"
        autogrow
        outlined
        counter
        :maxlength="MOTIVO_MAX"
        label="Motivo"
        placeholder="Ex.: mostra o rosto de uma pessoa"
        :rules="[(valor: string) => problemaDoMotivo(valor) ?? true]"
        lazy-rules
        @update:model-value="erroRemocao = null"
      />
      <p v-if="erroRemocao" class="fa-mensagem fa-mensagem--erro" role="alert">
        {{ erroRemocao }}
      </p>
      <template #acoes>
        <q-btn
          unelevated
          no-caps
          color="negative"
          label="Remover"
          :disable="problemaDoMotivo(motivo) !== null"
          :loading="removendo"
          @click="remover"
        />
      </template>
    </DialogoAdmin>
  </PaginaAdmin>
</template>

<style scoped lang="scss">
.filtro {
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-sm);
}

.grade {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.foto {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  min-width: 0;
}

.foto__imagem {
  display: block;
  aspect-ratio: 4 / 3;
  border-radius: var(--fa-raio-sm);
  overflow: hidden;
  background: var(--fa-superficie-2);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &--vazia {
    display: grid;
    place-items: center;
    color: var(--fa-texto-3);
  }
}

.foto__dados {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-wrap: anywhere;
}

.foto__protocolo {
  font-size: 13px;
  font-weight: 600;
}

.foto__remover {
  margin-top: auto;
  border-radius: var(--fa-raio-sm);
}
</style>
