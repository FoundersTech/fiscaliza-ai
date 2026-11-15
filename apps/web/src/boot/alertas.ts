import { defineBoot } from '#q-app';
import { watch } from 'vue';

import { useApi } from '@/boot/api';
import { useAlertasStore } from '@/stores/alertas';
import { useAuthStore } from '@/stores/auth';

/**
 * Roda depois do boot "api": com a sessão de um cidadão aberta, o indicador de alertas é
 * consultado agora e a cada minuto; ao sair da conta, a consulta para.
 */
export default defineBoot(({ app, store }) => {
  const api = app.runWithContext(() => useApi());
  const auth = useAuthStore(store);
  const alertas = useAlertasStore(store);

  watch(
    () => (auth.logado && auth.papel === 'CIDADAO' ? auth.usuario?.id : null),
    (cidadao) => {
      alertas.encerrarConsulta();
      if (cidadao) alertas.iniciarConsulta(api);
      // Sem cidadão logado, só zera o indicador da conta anterior (não chama a API).
      else void alertas.atualizarNovos(api);
    },
    { immediate: true },
  );
});
