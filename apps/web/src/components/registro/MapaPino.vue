<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import type { Ponto } from '@/services/localizacao';
import { carregarMaps, quandoRecusarChave } from '@/services/mapas';

const props = defineProps<{
  ponto: Ponto;
  mapId: string;
  /** Retângulo do município: o mapa não deixa arrastar a vista para longe dele. */
  limites: { sul: number; oeste: number; norte: number; leste: number };
}>();
const emit = defineEmits<{ mover: [ponto: Ponto] }>();

const elemento = ref<HTMLElement | null>(null);
const estado = ref<'carregando' | 'pronto' | 'indisponivel'>('carregando');
const mapa = shallowRef<google.maps.Map | null>(null);
const pino = shallowRef<google.maps.marker.AdvancedMarkerElement | null>(null);
let pararDeOuvir: (() => void) | null = null;

function lerPonto(posicao: google.maps.LatLng | google.maps.LatLngLiteral): Ponto {
  return typeof posicao.lat === 'function'
    ? { lat: (posicao as google.maps.LatLng).lat(), lng: (posicao as google.maps.LatLng).lng() }
    : (posicao as google.maps.LatLngLiteral);
}

async function montar(): Promise<void> {
  estado.value = 'carregando';
  try {
    const { Map, AdvancedMarkerElement } = await carregarMaps();
    if (!elemento.value) return;
    const novoMapa = new Map(elemento.value, {
      center: props.ponto,
      zoom: 17,
      mapId: props.mapId,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      restriction: {
        latLngBounds: {
          south: props.limites.sul,
          west: props.limites.oeste,
          north: props.limites.norte,
          east: props.limites.leste,
        },
        strictBounds: false,
      },
    });
    const novoPino = new AdvancedMarkerElement({
      map: novoMapa,
      position: props.ponto,
      gmpDraggable: true,
      title: 'Local do problema. Arraste para corrigir.',
    });
    novoPino.addListener('dragend', () => {
      if (novoPino.position) emit('mover', lerPonto(novoPino.position));
    });
    // Tocar no mapa também leva o pino até ali.
    novoMapa.addListener('click', (evento: google.maps.MapMouseEvent) => {
      if (!evento.latLng) return;
      novoPino.position = evento.latLng;
      emit('mover', lerPonto(evento.latLng));
    });
    mapa.value = novoMapa;
    pino.value = novoPino;
    estado.value = 'pronto';
  } catch {
    estado.value = 'indisponivel';
  }
}

// O GPS pode responder depois que o mapa já abriu no centro do município.
watch(
  () => props.ponto,
  (novo) => {
    if (!pino.value || !mapa.value) return;
    const atual = pino.value.position ? lerPonto(pino.value.position) : null;
    if (atual?.lat === novo.lat && atual.lng === novo.lng) return;
    pino.value.position = novo;
    mapa.value.panTo(novo);
  },
);

onMounted(() => {
  pararDeOuvir = quandoRecusarChave(() => {
    estado.value = 'indisponivel';
  });
  void montar();
});

onBeforeUnmount(() => pararDeOuvir?.());
</script>

<template>
  <div class="mapa-pino">
    <div v-show="estado !== 'indisponivel'" ref="elemento" class="mapa-pino__mapa" />
    <div v-if="estado === 'carregando'" class="mapa-pino__aviso">
      <q-spinner size="24px" color="primary" />
    </div>
    <div v-else-if="estado === 'indisponivel'" class="mapa-pino__aviso" role="status">
      <q-icon name="sym_o_map" size="28px" />
      <span>Mapa indisponível</span>
      <q-btn flat dense no-caps color="primary" label="Tentar de novo" @click="montar" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.mapa-pino {
  position: relative;
  height: 260px;
  border-radius: var(--fa-raio-lg);
  overflow: hidden;
  border: 1px solid var(--fa-borda);
  background: repeating-linear-gradient(
    135deg,
    var(--fa-superficie-2) 0 10px,
    var(--fa-superficie) 10px 20px
  );
}

.mapa-pino__mapa {
  position: absolute;
  inset: 0;
}

.mapa-pino__aviso {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--fa-texto-2);
  font-weight: 500;
}
</style>
