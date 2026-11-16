import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'inicio', component: () => import('@/pages/InicioPage.vue') },
      { path: 'mapa', name: 'mapa', component: () => import('@/pages/MapaPage.vue') },
      { path: 'score', name: 'score', component: () => import('@/pages/ScorePage.vue') },
      { path: 'painel', name: 'painel', component: () => import('@/pages/PainelPage.vue') },
      {
        path: 'ocorrencias/:id',
        name: 'ocorrencia',
        component: () => import('@/pages/OcorrenciaPage.vue'),
      },
      {
        path: 'alertas',
        name: 'alertas',
        component: () => import('@/pages/AlertasPage.vue'),
        meta: { auth: true, papeis: ['CIDADAO'] },
      },
      {
        path: 'minhas-ocorrencias',
        name: 'minhas-ocorrencias',
        component: () => import('@/pages/MinhasOcorrenciasPage.vue'),
        meta: { auth: true, papeis: ['CIDADAO'] },
      },
      {
        path: 'conta',
        name: 'conta',
        component: () => import('@/pages/ContaPage.vue'),
        meta: { auth: true },
      },
      {
        path: 'politica-privacidade',
        name: 'politica-privacidade',
        component: () => import('@/pages/PoliticaPage.vue'),
      },

      // Administração: o gestor do município cuida do órgão e dos agentes; o admin da
      // plataforma, das categorias, dos gestores e das fotos.
      {
        path: 'admin/orgao',
        name: 'admin-orgao',
        component: () => import('@/pages/admin/AdminOrgaoPage.vue'),
        meta: { auth: true, papeis: ['ADMIN_MUNICIPIO'] },
      },
      {
        path: 'admin/agentes',
        name: 'admin-agentes',
        component: () => import('@/pages/admin/AdminAgentesPage.vue'),
        meta: { auth: true, papeis: ['ADMIN_MUNICIPIO'] },
      },
      {
        path: 'admin/categorias',
        name: 'admin-categorias',
        component: () => import('@/pages/admin/AdminCategoriasPage.vue'),
        meta: { auth: true, papeis: ['ADMIN_PLATAFORMA'] },
      },
      {
        path: 'admin/gestores',
        name: 'admin-gestores',
        component: () => import('@/pages/admin/AdminGestoresPage.vue'),
        meta: { auth: true, papeis: ['ADMIN_PLATAFORMA'] },
      },
      {
        path: 'admin/fotos',
        name: 'admin-fotos',
        component: () => import('@/pages/admin/AdminFotosPage.vue'),
        meta: { auth: true, papeis: ['ADMIN_PLATAFORMA'] },
      },
    ],
  },

  // Telas sem a barra inferior.
  {
    path: '/registrar',
    name: 'registrar',
    component: () => import('@/pages/RegistrarPage.vue'),
    meta: { auth: true, papeis: ['CIDADAO'] },
  },
  {
    path: '/atendimento',
    name: 'atendimento',
    component: () => import('@/pages/AtendimentoPage.vue'),
    meta: { auth: true, papeis: ['AGENTE_ORGAO'] },
  },
  {
    path: '/atendimento/:id',
    name: 'atendimento-detalhe',
    component: () => import('@/pages/AtendimentoDetalhePage.vue'),
    meta: { auth: true, papeis: ['AGENTE_ORGAO'] },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { visitante: true },
  },
  {
    path: '/cadastro',
    name: 'cadastro',
    component: () => import('@/pages/CadastroPage.vue'),
    meta: { visitante: true },
  },
  {
    path: '/esqueci-senha',
    name: 'esqueci-senha',
    component: () => import('@/pages/EsqueciSenhaPage.vue'),
    meta: { visitante: true },
  },
  {
    path: '/definir-senha',
    name: 'definir-senha',
    component: () => import('@/pages/DefinirSenhaPage.vue'),
  },
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
