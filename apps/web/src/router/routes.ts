import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'inicio', component: () => import('@/pages/InicioPage.vue') },
      { path: 'mapa', name: 'mapa', component: () => import('@/pages/MapaPage.vue') },
      { path: 'score', name: 'score', component: () => import('@/pages/ScorePage.vue') },
      {
        path: 'alertas',
        name: 'alertas',
        component: () => import('@/pages/AlertasPage.vue'),
        meta: { auth: true, papeis: ['CIDADAO'] },
      },
      {
        path: 'registrar',
        name: 'registrar',
        component: () => import('@/pages/RegistrarPage.vue'),
        meta: { auth: true, papeis: ['CIDADAO'] },
      },
    ],
  },

  // Telas sem a barra inferior.
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue') },
  {
    path: '/acesso-negado',
    name: 'acesso-negado',
    component: () => import('@/pages/AcessoNegadoPage.vue'),
  },

  // A rota coringa (404) precisa ser sempre a última.
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
