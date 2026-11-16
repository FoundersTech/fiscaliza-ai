<script setup lang="ts">
import { useQuasar } from 'quasar';
import { computed, ref } from 'vue';

import { useApi } from '@/boot/api';
import { useTema } from '@/composables/useTema';
import { inicioAdmin } from '@/services/administracao';
import { rotuloAcessivelAlertas, rotuloDoIndicador } from '@/services/alertas';
import { identificarMunicipioPorGps, rotuloMunicipio } from '@/services/municipio';
import { useAlertasStore } from '@/stores/alertas';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';

withDefaults(
  defineProps<{
    titulo: string;
    subtitulo?: string;
    comLocal?: boolean;
    comAlertas?: boolean;
  }>(),
  { comLocal: false, comAlertas: true },
);

const { escuro, alternarTema } = useTema();
const alertas = useAlertasStore();
const indicador = computed(() => rotuloDoIndicador(alertas.novos));
const auth = useAuthStore();
/** Atalho para as telas de administração, só para quem administra. */
const rotaAdmin = computed(() => inicioAdmin(auth.papel));
const config = useConfigStore();
const local = computed(() => (config.municipio ? rotuloMunicipio(config.municipio) : ''));
const podeTrocar = computed(() => config.municipios.length > 1);

const api = useApi();
const $q = useQuasar();
const menuAberto = ref(false);
const localizando = ref(false);

/** Pedido explícito da pessoa: conta como escolha dela e só avisa quando não dá certo. */
async function usarLocalizacao(): Promise<void> {
  if (localizando.value) return;
  localizando.value = true;
  try {
    const resultado = await identificarMunicipioPorGps(api);
    if (resultado.ok && config.municipios.some((opcao) => opcao.id === resultado.municipioId)) {
      config.selecionarMunicipio(resultado.municipioId, 'MANUAL');
    } else if (resultado.ok || resultado.motivo === 'FORA_DA_AREA') {
      $q.notify({ message: 'Sua localização está fora das cidades atendidas.', timeout: 3000 });
    } else {
      $q.notify({ message: 'Não foi possível achar sua localização.', timeout: 3000 });
    }
  } catch {
    $q.notify({ message: 'Não foi possível achar sua localização.', timeout: 3000 });
  } finally {
    localizando.value = false;
    menuAberto.value = false;
  }
}
</script>

<template>
  <header class="cabecalho">
    <div class="cabecalho__texto">
      <template v-if="comLocal && local">
        <button
          v-if="podeTrocar"
          type="button"
          class="cabecalho__local cabecalho__local--botao"
          :aria-label="`Cidade: ${local}. Trocar de cidade`"
          data-teste="seletor-cidade"
        >
          <q-icon name="sym_o_location_on" size="16px" />
          {{ local }}
          <q-icon name="sym_o_expand_more" size="16px" />
          <q-menu v-model="menuAberto" anchor="bottom left" self="top left">
            <q-item
              clickable
              :disable="localizando"
              data-teste="usar-localizacao-cidade"
              @click="usarLocalizacao"
            >
              <q-item-section avatar>
                <q-spinner v-if="localizando" size="16px" />
                <q-icon v-else name="sym_o_my_location" size="16px" />
              </q-item-section>
              <q-item-section>Usar minha localização</q-item-section>
            </q-item>
            <q-separator />
            <q-list role="listbox" aria-label="Cidades atendidas">
              <q-item
                v-for="opcao in config.municipios"
                :key="opcao.id"
                v-close-popup
                clickable
                role="option"
                :active="opcao.id === config.municipio?.id"
                :aria-selected="opcao.id === config.municipio?.id"
                @click="config.selecionarMunicipio(opcao.id, 'MANUAL')"
              >
                <q-item-section>{{ rotuloMunicipio(opcao) }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </button>
        <div v-else class="cabecalho__local">
          <q-icon name="sym_o_location_on" size="16px" />
          {{ local }}
        </div>
      </template>
      <h1 class="fa-titulo">{{ titulo }}</h1>
      <p v-if="subtitulo" class="cabecalho__subtitulo">{{ subtitulo }}</p>
    </div>

    <div class="cabecalho__acoes">
      <q-btn
        v-if="rotaAdmin"
        round
        flat
        class="fa-botao-redondo"
        icon="sym_o_admin_panel_settings"
        :to="rotaAdmin"
        aria-label="Administração"
      />
      <!-- O visitante passa pela tela Minha conta até o login. -->
      <q-btn
        round
        flat
        class="fa-botao-redondo"
        icon="sym_o_person"
        to="/conta"
        :aria-label="auth.logado ? 'Minha conta' : 'Entrar na conta'"
        data-teste="atalho-conta"
      />
      <q-btn
        round
        flat
        class="fa-botao-redondo"
        :icon="escuro ? 'sym_o_light_mode' : 'sym_o_dark_mode'"
        :aria-label="escuro ? 'Usar tema claro' : 'Usar tema escuro'"
        @click="alternarTema"
      />
      <q-btn
        v-if="comAlertas"
        round
        flat
        class="fa-botao-redondo"
        icon="sym_o_notifications"
        to="/alertas"
        :aria-label="rotuloAcessivelAlertas(alertas.novos)"
      >
        <q-badge
          v-if="indicador"
          floating
          rounded
          color="negative"
          :label="indicador"
          data-teste="indicador-sino"
        />
      </q-btn>
    </div>
  </header>
</template>

<style scoped lang="scss">
.cabecalho {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 20px) 0 16px;
  border-bottom: 1px solid var(--fa-borda);
  margin: 0 calc(var(--fa-pagina) * -1) 4px;
  padding-left: var(--fa-pagina);
  padding-right: var(--fa-pagina);
}

.cabecalho__texto {
  min-width: 0;
  overflow-wrap: anywhere;
}

.cabecalho__local {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--fa-texto-3);
  margin-bottom: 2px;
}

.cabecalho__local--botao {
  padding: 2px 4px;
  margin-left: -4px;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--fa-texto-2);
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--fa-borda);
  }
}

.cabecalho__subtitulo {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fa-texto-3);
}

.cabecalho__acoes {
  display: flex;
  gap: 8px;
  flex-shrink: 0;

  // Com o atalho de administração, são quatro botões: em telas estreitas o título precisa de espaço.
  @media (max-width: 399px) {
    gap: 4px;
  }
}
</style>
