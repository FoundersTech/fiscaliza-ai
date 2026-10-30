<script setup lang="ts">
import { ref } from 'vue';

import { comprimirFoto, FotoMuitoGrande } from '@/services/compressao-foto';
import { MAX_FOTOS } from '@/services/registro';
import { useRegistroStore } from '@/stores/registro';

const registro = useRegistroStore();
const camera = ref<HTMLInputElement | null>(null);
const galeria = ref<HTMLInputElement | null>(null);
const aviso = ref<string | null>(null);

function abrir(seletor: HTMLInputElement | null): void {
  aviso.value = null;
  seletor?.click();
}

async function aoEscolher(evento: Event): Promise<void> {
  const entrada = evento.target as HTMLInputElement;
  const arquivos = Array.from(entrada.files ?? []);
  // Limpa a escolha: assim a mesma foto pode ser escolhida de novo depois de removida.
  entrada.value = '';

  const cabem = arquivos.slice(0, registro.vagasDeFoto);
  if (arquivos.length > cabem.length) aviso.value = `Cabem só ${MAX_FOTOS} fotos por ocorrência.`;

  await Promise.all(cabem.map((arquivo) => preparar(arquivo)));
}

async function preparar(arquivo: File): Promise<void> {
  registro.preparando += 1;
  try {
    registro.adicionarFoto(await comprimirFoto(arquivo));
  } catch (erro) {
    aviso.value =
      erro instanceof FotoMuitoGrande
        ? 'Foto muito grande. Escolha outra.'
        : 'Não foi possível abrir esta foto. Escolha outra.';
  } finally {
    registro.preparando -= 1;
  }
}
</script>

<template>
  <section class="passo-fotos">
    <input
      ref="camera"
      type="file"
      accept="image/*"
      capture="environment"
      class="passo-fotos__seletor"
      data-teste="seletor-camera"
      @change="aoEscolher"
    />
    <input
      ref="galeria"
      type="file"
      accept="image/*"
      :multiple="registro.vagasDeFoto > 1"
      class="passo-fotos__seletor"
      data-teste="seletor-fotos"
      @change="aoEscolher"
    />

    <div v-if="registro.fotos.length === 0 && registro.preparando === 0" class="passo-fotos__vazio">
      <q-icon name="sym_o_photo_camera" size="32px" />
      <span class="passo-fotos__chamada">Foto do problema</span>
      <span class="fa-legenda">Até {{ MAX_FOTOS }} fotos</span>
      <div class="passo-fotos__botoes">
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="sym_o_photo_camera"
          label="Tirar foto"
          @click="abrir(camera)"
        />
        <q-btn
          outline
          no-caps
          color="primary"
          icon="sym_o_photo_library"
          label="Escolher da galeria"
          @click="abrir(galeria)"
        />
      </div>
    </div>

    <div v-else class="passo-fotos__grade">
      <figure v-for="(foto, indice) in registro.fotos" :key="foto.id" class="passo-fotos__foto">
        <img :src="foto.url" :alt="`Foto ${indice + 1} do problema`" />
        <q-btn
          round
          dense
          unelevated
          size="sm"
          icon="sym_o_close"
          class="passo-fotos__remover"
          :aria-label="`Remover a foto ${indice + 1}`"
          @click="registro.removerFoto(foto.id)"
        />
      </figure>

      <div
        v-for="item in registro.preparando"
        :key="`preparando-${item}`"
        class="passo-fotos__foto"
      >
        <div class="passo-fotos__preparando">
          <q-spinner size="24px" />
          <span class="fa-legenda">Preparando a foto…</span>
        </div>
      </div>

      <div v-if="registro.vagasDeFoto > 0" class="passo-fotos__mais">
        <span class="fa-legenda">Adicionar outra</span>
        <q-btn
          flat
          no-caps
          color="primary"
          icon="sym_o_photo_camera"
          label="Tirar foto"
          @click="abrir(camera)"
        />
        <q-btn
          flat
          no-caps
          color="primary"
          icon="sym_o_photo_library"
          label="Galeria"
          @click="abrir(galeria)"
        />
      </div>
    </div>

    <p v-if="registro.vagasDeFoto === 0 && registro.preparando === 0" class="fa-legenda">
      Limite de {{ MAX_FOTOS }} fotos. Remova uma para trocar.
    </p>
    <p v-if="aviso" class="fa-mensagem fa-mensagem--erro" role="alert">{{ aviso }}</p>
  </section>
</template>

<style scoped lang="scss">
.passo-fotos {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.passo-fotos__seletor {
  display: none;
}

// Área listrada do protótipo, para a primeira foto.
.passo-fotos__vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 240px;
  width: 100%;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-lg);
  color: var(--fa-texto-2);
  background: repeating-linear-gradient(
    135deg,
    var(--fa-superficie-2) 0 10px,
    var(--fa-superficie) 10px 20px
  );
}

.passo-fotos__botoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.passo-fotos__chamada {
  font-weight: 600;
  color: var(--fa-texto);
}

.passo-fotos__grade {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.passo-fotos__foto {
  position: relative;
  margin: 0;
  aspect-ratio: 3 / 4;
  border-radius: var(--fa-raio);
  overflow: hidden;
  background: var(--fa-superficie-2);
  border: 1px solid var(--fa-borda);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.passo-fotos__remover {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgb(15 23 42 / 0.65);
  color: #fff;
}

.passo-fotos__preparando {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--fa-azul);
}

.passo-fotos__mais {
  aspect-ratio: 3 / 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--fa-borda-forte);
  border-radius: var(--fa-raio);
}
</style>
