import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import { useAuthStore } from '@/stores/auth';

import { decidirAcesso } from './acesso';
import routes from './routes';

export default defineRouter(({ store }) => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    // O modo e a base vêm do quasar.config.ts (build.vueRouterMode / build.publicPath).
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
  });

  const auth = useAuthStore(store);
  router.beforeEach((destino) =>
    decidirAcesso(destino, { logado: auth.logado, papel: auth.papel }),
  );

  return router;
});
