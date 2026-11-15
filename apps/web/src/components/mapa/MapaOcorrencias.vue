<script setup lang="ts">
import { MarkerClusterer, type Renderer } from '@googlemaps/markerclusterer';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import { useApi } from '@/boot/api';
import LegendaMapa from '@/components/mapa/LegendaMapa.vue';
import ResumoOcorrencia from '@/components/mapa/ResumoOcorrencia.vue';
import { type FalhaGps, lerGps, type Ponto } from '@/services/localizacao';
import {
  buscarPontos,
  chaveDoPonto,
  criarBuscaPontos,
  destinoDaBusca,
  diferencaDePontos,
  estiloDoAlfinete,
  type Limites,
  limitesDoGoogle,
  type PontoMapa,
  resumoDoPonto,
  type ResultadoPontos,
  STATUS_NO_MAPA,
  ZOOM_PONTO,
} from '@/services/mapa-ocorrencias';
import { carregarBuscaDeLugares, carregarMaps, quandoRecusarChave } from '@/services/mapas';
import type { ConfigPublica } from '@/stores/config';

const props = defineProps<{
  mapId: string;
  municipio: ConfigPublica['municipio'];
  categorias: ConfigPublica['categorias_ativas'];
}>();

const AVISOS_GPS: Record<FalhaGps, string> = {
  NEGADA: 'Sem acesso à sua localização. Libere a localização no navegador.',
  TEMPO_ESGOTADO: 'O GPS demorou para responder. Tente de novo.',
  INDISPONIVEL: 'Não foi possível achar sua localização.',
  SEM_SUPORTE: 'Este aparelho não informa a localização.',
};

const api = useApi();

const elemento = ref<HTMLElement | null>(null);
const caixaBusca = ref<HTMLElement | null>(null);
const estado = ref<'carregando' | 'pronto' | 'indisponivel'>('carregando');
const truncado = ref(false);
const pontosFalharam = ref(false);
const selecionado = shallowRef<PontoMapa | null>(null);
const buscaDisponivel = ref(false);
const localizando = ref(false);
const avisoGps = ref<string | null>(null);

const resumo = computed(() =>
  selecionado.value ? resumoDoPonto(selecionado.value, props.categorias) : null,
);

let mapa: google.maps.Map | null = null;
let agrupador: MarkerClusterer | null = null;
let criarAlfinete: ((ponto: PontoMapa) => google.maps.marker.AdvancedMarkerElement) | null = null;
let marcadorPosicao: google.maps.marker.AdvancedMarkerElement | null = null;
let mostrarPosicao: ((ponto: Ponto) => void) | null = null;
const alfinetes = new Map<string, google.maps.marker.AdvancedMarkerElement>();
let pararDeOuvir: (() => void) | null = null;

const busca = criarBuscaPontos({
  buscar: (bbox) => buscarPontos(api, bbox, props.municipio.id),
  aoResponder: aplicarPontos,
});

function aplicarPontos(resultado: ResultadoPontos): void {
  pontosFalharam.value = !resultado.ok;
  if (!resultado.ok || !agrupador || !criarAlfinete) return;
  truncado.value = resultado.truncado;

  const { entrar, sair } = diferencaDePontos(alfinetes.keys(), resultado.pontos);
  const saindo = sair.flatMap((chave) => {
    const alfinete = alfinetes.get(chave);
    alfinetes.delete(chave);
    return alfinete ? [alfinete] : [];
  });
  const entrando = entrar.map((ponto) => {
    const alfinete = criarAlfinete!(ponto);
    alfinetes.set(chaveDoPonto(ponto), alfinete);
    return alfinete;
  });
  if (selecionado.value && sair.includes(chaveDoPonto(selecionado.value))) {
    selecionado.value = null;
  }
  agrupador.removeMarkers(saindo, true);
  agrupador.addMarkers(entrando, true);
  agrupador.render();
}

/** Círculo com a quantidade de ocorrências agrupadas. */
function rendererDoGrupo(
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement,
): Renderer {
  return {
    render({ count, position }) {
      const tamanho = count < 10 ? 34 : count < 100 ? 40 : 48;
      const circulo = document.createElement('div');
      circulo.textContent = String(count);
      Object.assign(circulo.style, {
        width: `${tamanho}px`,
        height: `${tamanho}px`,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        background: '#0f172a',
        color: '#ffffff',
        font: '600 13px Inter, system-ui, sans-serif',
        border: '3px solid rgb(255 255 255 / 0.85)',
        boxShadow: '0 2px 6px rgb(15 23 42 / 0.35)',
      });
      return new AdvancedMarkerElement({
        position,
        content: circulo,
        title: `${count} ocorrências. Toque para aproximar.`,
        zIndex: 1000 + count,
      });
    },
  };
}

function desmontar(): void {
  busca.cancelar();
  agrupador?.clearMarkers(true);
  agrupador?.setMap(null);
  agrupador = null;
  alfinetes.clear();
  if (marcadorPosicao) marcadorPosicao.map = null;
  marcadorPosicao = null;
  mapa = null;
  selecionado.value = null;
  truncado.value = false;
  pontosFalharam.value = false;
  buscaDisponivel.value = false;
  caixaBusca.value?.replaceChildren();
}

async function montar(): Promise<void> {
  desmontar();
  estado.value = 'carregando';
  try {
    const { Map, AdvancedMarkerElement, PinElement } = await carregarMaps();
    if (!elemento.value) return;
    const { bbox, centro } = props.municipio;
    const novoMapa = new Map(elemento.value, {
      center: centro,
      zoom: 13,
      mapId: props.mapId,
      disableDefaultUI: true,
      zoomControl: true,
      // No canto de baixo ficam a legenda e o botão de localização.
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      clickableIcons: false,
      gestureHandling: 'greedy',
      restriction: {
        latLngBounds: { south: bbox.sul, west: bbox.oeste, north: bbox.norte, east: bbox.leste },
        strictBounds: false,
      },
    });

    criarAlfinete = (ponto) => {
      const estilo = estiloDoAlfinete(ponto);
      const alfinete = new AdvancedMarkerElement({
        position: { lat: ponto.lat, lng: ponto.lng },
        content: new PinElement(estilo),
        title: `${STATUS_NO_MAPA[ponto.status_publico].rotulo}${ponto.urgente ? ', urgente' : ''}`,
        zIndex: ponto.urgente ? 2 : 1,
      });
      alfinete.addListener('click', () => {
        selecionado.value = ponto;
      });
      return alfinete;
    };
    mostrarPosicao = (ponto) => {
      if (!marcadorPosicao) {
        const bolinha = document.createElement('div');
        Object.assign(bolinha.style, {
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#2563eb',
          border: '3px solid #ffffff',
          boxShadow: '0 0 0 6px rgb(37 99 235 / 0.25)',
        });
        marcadorPosicao = new AdvancedMarkerElement({
          map: novoMapa,
          content: bolinha,
          title: 'Você está aqui',
          zIndex: 3000,
        });
      }
      marcadorPosicao.position = ponto;
    };

    agrupador = new MarkerClusterer({
      map: novoMapa,
      renderer: rendererDoGrupo(AdvancedMarkerElement),
    });
    // "idle" vem depois de cada arraste ou zoom; a busca espera o mapa parar de vez.
    novoMapa.addListener('idle', () => {
      const area = novoMapa.getBounds()?.toJSON();
      if (area) busca.agendar(limitesDoGoogle(area));
    });
    novoMapa.addListener('click', () => {
      selecionado.value = null;
    });
    mapa = novoMapa;
    estado.value = 'pronto';
    void montarBusca(bbox);
  } catch {
    estado.value = 'indisponivel';
  }
}

/** Busca de bairro ou rua. Se o Places não carregar, o mapa segue sem ela. */
async function montarBusca(bbox: Limites): Promise<void> {
  try {
    const { PlaceAutocompleteElement } = await carregarBuscaDeLugares();
    if (!caixaBusca.value || !mapa) return;
    const campo = new PlaceAutocompleteElement({
      locationRestriction: {
        south: bbox.sul,
        west: bbox.oeste,
        north: bbox.norte,
        east: bbox.leste,
      },
      includedRegionCodes: ['br'],
      requestedLanguage: 'pt-BR',
      requestedRegion: 'br',
    });
    campo.setAttribute('placeholder', 'Buscar bairro ou rua');
    campo.addEventListener('gmp-select', ({ placePrediction }) => {
      void (async () => {
        const lugar = placePrediction.toPlace();
        await lugar.fetchFields({ fields: ['location', 'viewport'] });
        irPara(
          destinoDaBusca({
            viewport: lugar.viewport?.toJSON() ?? null,
            location: lugar.location?.toJSON() ?? null,
          }),
        );
      })().catch(() => undefined);
    });
    caixaBusca.value.replaceChildren(campo);
    buscaDisponivel.value = true;
  } catch {
    buscaDisponivel.value = false;
  }
}

function irPara(destino: ReturnType<typeof destinoDaBusca>): void {
  if (!mapa || !destino) return;
  selecionado.value = null;
  if ('area' in destino) {
    mapa.fitBounds(destino.area);
  } else {
    mapa.panTo(destino.ponto);
    mapa.setZoom(ZOOM_PONTO);
  }
}

async function localizar(): Promise<void> {
  localizando.value = true;
  const leitura = await lerGps();
  localizando.value = false;
  if (!leitura.ok) {
    avisoGps.value = AVISOS_GPS[leitura.falha];
    return;
  }
  avisoGps.value = null;
  mostrarPosicao?.(leitura.ponto);
  irPara({ ponto: leitura.ponto });
}

onMounted(() => {
  pararDeOuvir = quandoRecusarChave(() => {
    estado.value = 'indisponivel';
  });
  void montar();
});

onBeforeUnmount(() => {
  pararDeOuvir?.();
  desmontar();
});
</script>

<template>
  <div class="mapa">
    <div v-show="estado !== 'indisponivel'" ref="elemento" class="mapa__google" />

    <div v-if="estado === 'carregando'" class="mapa__cobertura">
      <q-spinner size="28px" color="primary" />
    </div>
    <div v-else-if="estado === 'indisponivel'" class="mapa__cobertura" role="status">
      <q-icon name="sym_o_map" size="32px" />
      <span class="mapa__indisponivel">Mapa indisponível</span>
      <q-btn flat no-caps color="primary" label="Tentar de novo" @click="montar" />
    </div>

    <template v-if="estado === 'pronto'">
      <div class="mapa__topo">
        <div v-show="buscaDisponivel" ref="caixaBusca" class="mapa__busca" />
        <p v-if="truncado" class="mapa__aviso" role="status">
          <q-icon name="sym_o_zoom_in" size="18px" />
          Aproxime o mapa para ver todas as ocorrências da área.
        </p>
        <p v-if="pontosFalharam" class="mapa__aviso mapa__aviso--erro" role="alert">
          Não foi possível carregar as ocorrências.
          <q-btn flat dense no-caps color="primary" label="Tentar de novo" @click="busca.repetir" />
        </p>
        <p v-if="avisoGps" class="mapa__aviso" role="status">
          {{ avisoGps }}
          <q-btn
            round
            flat
            dense
            size="sm"
            icon="sym_o_close"
            aria-label="Fechar aviso"
            @click="avisoGps = null"
          />
        </p>
      </div>

      <div class="mapa__base">
        <ResumoOcorrencia v-if="resumo" :resumo="resumo" @fechar="selecionado = null" />
        <div v-else class="mapa__rodape">
          <LegendaMapa />
          <q-btn
            round
            unelevated
            class="mapa__localizar"
            icon="sym_o_my_location"
            aria-label="Centralizar na minha localização"
            :loading="localizando"
            @click="localizar"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.mapa {
  position: relative;
  flex: 1;
  min-height: 320px;
  overflow: hidden;
  background: repeating-linear-gradient(
    135deg,
    var(--fa-superficie-2) 0 10px,
    var(--fa-superficie) 10px 20px
  );
}

.mapa__google {
  position: absolute;
  inset: 0;
}

.mapa__cobertura {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--fa-texto-2);
}

.mapa__indisponivel {
  font-size: 16px;
  font-weight: 600;
}

.mapa__topo,
.mapa__base {
  position: absolute;
  left: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
  margin: 0 auto;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.mapa__topo {
  top: 12px;
}

.mapa__base {
  bottom: 12px;
}

.mapa__busca {
  border-radius: var(--fa-raio);
  box-shadow: var(--fa-sombra);
  overflow: hidden;

  :deep(gmp-place-autocomplete) {
    width: 100%;
  }
}

.mapa__aviso {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  background: var(--fa-superficie);
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio);
  box-shadow: var(--fa-sombra);
  font-size: 13px;
  font-weight: 500;
  color: var(--fa-texto-2);

  &--erro {
    color: var(--fa-urgente);
  }
}

.mapa__rodape {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.mapa__localizar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  background: var(--fa-superficie);
  color: var(--fa-azul);
  border: 1px solid var(--fa-borda);
  box-shadow: var(--fa-sombra);
}
</style>
