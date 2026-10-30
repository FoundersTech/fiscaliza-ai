<script setup lang="ts">
const ITENS_ESQUERDA = [
  { rotulo: 'Início', icone: 'sym_o_home', rota: '/' },
  { rotulo: 'Mapa', icone: 'sym_o_map', rota: '/mapa' },
] as const;

const ITENS_DIREITA = [
  { rotulo: 'Score', icone: 'sym_o_speed', rota: '/score' },
  { rotulo: 'Alertas', icone: 'sym_o_notifications', rota: '/alertas' },
] as const;
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <router-view />
    </q-page-container>

    <q-footer class="barra">
      <nav class="barra__itens" aria-label="Navegação principal">
        <router-link
          v-for="item in ITENS_ESQUERDA"
          :key="item.rota"
          :to="item.rota"
          class="barra__item"
          exact-active-class="barra__item--ativo"
        >
          <q-icon :name="item.icone" size="24px" />
          <span>{{ item.rotulo }}</span>
        </router-link>

        <div class="barra__centro">
          <q-btn
            round
            unelevated
            color="primary"
            icon="sym_o_add"
            size="18px"
            to="/registrar"
            class="barra__mais"
            aria-label="Registrar ocorrência"
          />
        </div>

        <router-link
          v-for="item in ITENS_DIREITA"
          :key="item.rota"
          :to="item.rota"
          class="barra__item"
          active-class="barra__item--ativo"
        >
          <q-icon :name="item.icone" size="24px" />
          <span>{{ item.rotulo }}</span>
        </router-link>
      </nav>
    </q-footer>
  </q-layout>
</template>

<style scoped lang="scss">
.barra {
  background: var(--fa-superficie);
  color: var(--fa-texto-3);
  border-top: 1px solid var(--fa-borda);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.barra__itens {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  max-width: 560px;
  margin: 0 auto;
  height: 64px;
}

.barra__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 100%;
  font-size: 11px;
  font-weight: 500;
  color: inherit;
  text-decoration: none;

  &--ativo {
    color: var(--fa-azul);
  }
}

.barra__centro {
  display: flex;
  justify-content: center;
  align-self: stretch;
}

// O "+" flutua acima da barra, como no protótipo.
.barra__mais {
  width: 56px;
  height: 56px;
  margin-top: -20px;
  box-shadow: 0 6px 16px rgb(37 99 235 / 0.35);
}
</style>
