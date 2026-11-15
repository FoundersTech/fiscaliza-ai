import { defineBoot } from '#q-app';
import { watch } from 'vue';

import { useApi } from '@/boot/api';
import { agendarSincronizacao } from '@/services/sincronizacao';
import { useAuthStore } from '@/stores/auth';
import { usePendentesStore } from '@/stores/pendentes';

/** Roda depois do boot "api": a sessão já foi renovada quando a primeira sincronização começa. */
export default defineBoot(({ app, store }) => {
  if (typeof indexedDB === 'undefined') return;
  const api = app.runWithContext(() => useApi());
  const auth = useAuthStore(store);
  const pendentes = usePendentesStore(store);
  const sincronizar = () => pendentes.sincronizar(api);

  agendarSincronizacao({ sincronizar });
  // Entrar (de novo) na conta envia o que ficou guardado; sair troca a lista da tela.
  watch(
    () => auth.usuario?.id,
    () => void sincronizar(),
  );
});
