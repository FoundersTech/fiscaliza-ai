import { useQuasar } from 'quasar';
import { computed, ref } from 'vue';

import {
  alternar,
  lerPreferencia,
  modoQuasar,
  type PreferenciaTema,
  salvarPreferencia,
} from '@/services/tema';

/** Compartilhada entre o botão do cabeçalho e a tela Minha conta. */
const preferencia = ref<PreferenciaTema>(lerPreferencia(globalThis.localStorage));

export function useTema() {
  const $q = useQuasar();
  const escuro = computed(() => $q.dark.isActive);

  function definirTema(nova: PreferenciaTema): void {
    preferencia.value = nova;
    $q.dark.set(modoQuasar(nova));
    salvarPreferencia(globalThis.localStorage, nova);
  }

  function alternarTema(): void {
    definirTema(alternar($q.dark.isActive));
  }

  return { escuro, preferencia, alternarTema, definirTema };
}
