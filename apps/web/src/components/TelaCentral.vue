<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="tela">
        <main class="tela__conteudo">
          <slot />
        </main>
        <footer class="tela__rodape">
          <q-icon name="sym_o_location_on" size="16px" />
          Sorocaba · SP
        </footer>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped lang="scss">
// Telas sem a barra inferior: entrada, acesso negado e página não encontrada.
.tela {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 48px) var(--fa-pagina)
    calc(env(safe-area-inset-bottom, 0px) + 24px);
}

.tela__conteudo {
  flex: 1;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.tela__rodape {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--fa-texto-3);
}
</style>
