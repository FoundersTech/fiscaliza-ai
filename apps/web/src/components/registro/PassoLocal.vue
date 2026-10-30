<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useApi } from '@/boot/api';
import MapaPino from '@/components/registro/MapaPino.vue';
import { type FalhaGps, lerGps, type Ponto, precisaoBaixa } from '@/services/localizacao';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { useRegistroStore } from '@/stores/registro';

/** Espera o pino parar antes de buscar o endereço. */
const ESPERA_ENDERECO_MS = 400;

const AVISOS_SEM_GPS: Record<FalhaGps, string> = {
  NEGADA: 'Sem acesso à sua localização. Arraste o pino ou toque no mapa no local do problema.',
  TEMPO_ESGOTADO:
    'O GPS demorou para responder. Arraste o pino ou toque no mapa no local do problema.',
  INDISPONIVEL:
    'Não foi possível achar sua localização. Arraste o pino ou toque no mapa no local do problema.',
  SEM_SUPORTE:
    'Este aparelho não informa a localização. Arraste o pino ou toque no mapa no local do problema.',
};

const api = useApi();
const auth = useAuthStore();
const config = useConfigStore();
const registro = useRegistroStore();

const buscandoGps = ref(false);
const falhaGps = ref<FalhaGps | null>(null);
const semConfig = ref(false);
const falhaEndereco = ref(false);
let consulta = 0;
let espera: ReturnType<typeof setTimeout> | undefined;

const municipio = computed(() => config.config?.municipio ?? null);
const local = computed(() =>
  municipio.value ? `${municipio.value.nome} · ${municipio.value.uf}` : '',
);

const textoEndereco = computed(() => {
  if (registro.consultandoEndereco) return 'Buscando o endereço…';
  if (registro.endereco) return registro.endereco;
  if (registro.dentroDaArea === false) return 'Fora da área atendida';
  if (falhaEndereco.value) return 'Endereço indisponível agora';
  return 'Endereço será preenchido depois';
});

const textoPrecisao = computed(() => {
  if (registro.origemPonto === 'GPS') return `Precisão do GPS: ${registro.precisaoM} m`;
  if (registro.origemPonto === 'MAPA') return 'Ponto marcado no mapa';
  return 'Centro do município: mova o pino até o problema';
});

async function localizar(): Promise<void> {
  buscandoGps.value = true;
  const leitura = await lerGps();
  buscandoGps.value = false;
  if (leitura.ok) {
    falhaGps.value = null;
    registro.posicionar(leitura.ponto, 'GPS', leitura.precisaoM);
    return;
  }
  falhaGps.value = leitura.falha;
  // Sem GPS, o pino começa no centro e só vale depois de movido.
  if (!registro.ponto && municipio.value) registro.posicionar(municipio.value.centro, 'CENTRO');
}

async function buscarEndereco(ponto: Ponto): Promise<void> {
  const esta = ++consulta;
  try {
    const { data } = await api.GET('/api/v1/geo/reverso', { params: { query: ponto } });
    if (esta !== consulta) return;
    falhaEndereco.value = !data;
    registro.endereco = data?.endereco ?? null;
    registro.dentroDaArea = data?.dentro_da_area ?? null;
  } catch {
    if (esta === consulta) falhaEndereco.value = true;
  } finally {
    if (esta === consulta) registro.consultandoEndereco = false;
  }
}

watch(
  () => registro.ponto,
  (ponto) => {
    clearTimeout(espera);
    if (!ponto) return;
    registro.consultandoEndereco = true;
    espera = setTimeout(() => void buscarEndereco(ponto), ESPERA_ENDERECO_MS);
  },
);

onMounted(async () => {
  semConfig.value = !(await config.carregar(api));
  if (!registro.ponto) {
    await localizar();
  } else if (registro.dentroDaArea === null && !registro.endereco) {
    registro.consultandoEndereco = true;
    void buscarEndereco(registro.ponto);
  }
});

onBeforeUnmount(() => clearTimeout(espera));
</script>

<template>
  <section class="passo-local">
    <MapaPino
      v-if="registro.ponto && config.config"
      :ponto="registro.ponto"
      :map-id="config.config.google_maps_map_id"
      :limites="config.config.municipio.bbox"
      @mover="registro.posicionar($event, 'MAPA')"
    />
    <div v-else class="passo-local__espera">
      <template v-if="buscandoGps">
        <q-spinner size="24px" color="primary" />
        <span>Buscando sua localização…</span>
      </template>
      <p v-else-if="semConfig" class="fa-mensagem fa-mensagem--erro" role="alert">
        Não foi possível carregar o mapa da cidade. Confira sua conexão.
      </p>
    </div>

    <p v-if="falhaGps && registro.origemPonto === 'CENTRO'" class="passo-local__aviso">
      {{ AVISOS_SEM_GPS[falhaGps] }}
    </p>
    <p
      v-if="registro.origemPonto === 'GPS' && precisaoBaixa(registro.precisaoM)"
      class="passo-local__aviso"
    >
      Precisão baixa, confira o pino.
    </p>

    <div v-if="registro.ponto" class="passo-local__endereco fa-card">
      <q-icon name="sym_o_location_on" size="20px" class="passo-local__icone" />
      <div>
        <strong>{{ textoEndereco }}</strong>
        <span>{{ local }}</span>
        <span class="fa-legenda">{{ textoPrecisao }}</span>
      </div>
    </div>

    <p v-if="registro.dentroDaArea === false" class="fa-mensagem fa-mensagem--erro" role="alert">
      O Fiscaliza Aí! ainda não atende esta região. Mova o pino para dentro do município.
    </p>

    <q-btn
      v-if="registro.origemPonto !== 'GPS'"
      flat
      no-caps
      color="primary"
      icon="sym_o_my_location"
      label="Usar minha localização"
      :loading="buscandoGps"
      class="passo-local__gps"
      @click="localizar"
    />

    <q-toggle
      v-model="registro.publicarAutor"
      :label="`Mostrar meu apelido (${auth.usuario?.apelido_publico ?? ''}) na ocorrência`"
    />
  </section>
</template>

<style scoped lang="scss">
.passo-local {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.passo-local__espera {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 260px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-lg);
  color: var(--fa-texto-2);
}

.passo-local__aviso {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--fa-raio-sm);
  font-size: 13px;
  background: var(--fa-recebido-fundo);
  color: var(--fa-recebido-texto);
}

.passo-local__endereco {
  display: flex;
  gap: 10px;
  padding: 14px 16px;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  span:not(.fa-legenda) {
    font-size: 13px;
    color: var(--fa-texto-2);
  }
}

.passo-local__icone {
  color: var(--fa-azul);
  margin-top: 1px;
}

.passo-local__gps {
  align-self: flex-start;
}
</style>
