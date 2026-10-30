<script setup lang="ts">
import { useTema } from '@/composables/useTema';

withDefaults(
  defineProps<{
    titulo: string;
    subtitulo?: string;
    /** Mostra "Sorocaba · SP" acima do título. */
    comLocal?: boolean;
    comAlertas?: boolean;
  }>(),
  { comLocal: false, comAlertas: true },
);

const { escuro, alternarTema } = useTema();
</script>

<template>
  <header class="cabecalho">
    <div class="cabecalho__texto">
      <div v-if="comLocal" class="cabecalho__local">
        <q-icon name="sym_o_location_on" size="16px" />
        Sorocaba · SP
      </div>
      <h1 class="fa-titulo">{{ titulo }}</h1>
      <p v-if="subtitulo" class="cabecalho__subtitulo">{{ subtitulo }}</p>
    </div>

    <div class="cabecalho__acoes">
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
        aria-label="Alertas"
      />
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
}

.cabecalho__local {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--fa-texto-3);
  margin-bottom: 2px;
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
}
</style>
