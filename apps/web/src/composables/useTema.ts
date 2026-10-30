import { useQuasar } from 'quasar';
import { computed } from 'vue';

import { alternar, modoQuasar, salvarPreferencia } from '@/services/tema';

export function useTema() {
  const $q = useQuasar();
  const escuro = computed(() => $q.dark.isActive);

  function alternarTema(): void {
    const preferencia = alternar($q.dark.isActive);
    $q.dark.set(modoQuasar(preferencia));
    salvarPreferencia(globalThis.localStorage, preferencia);
  }

  return { escuro, alternarTema };
}
