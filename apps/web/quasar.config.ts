// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';

export default defineConfig(() => {
  return {
    // O tema é aplicado antes de montar o app, para não piscar claro antes do escuro.
    boot: ['tema', 'api'],

    css: ['app.scss'],

    // Ícones de traço, como no protótipo. https://github.com/quasarframework/quasar/tree/dev/extras
    extras: ['material-symbols-outlined'],

    build: {
      typescript: {
        strict: true,
        vueShim: true,
      },

      // As rotas usam paths (/ocorrencias/:id), então o modo é history.
      vueRouterMode: 'history',

      // O deploy define API_URL no ambiente do build; sem ela, a API local.
      // A chave do Maps é pública por natureza (fica no navegador); quem a protege são as
      // restrições de site e de API no Google Cloud. Sem ela, o mapa do registro fica
      // indisponível e o envio segue com o ponto do GPS.
      define: {
        'import.meta.env.API_URL': JSON.stringify(process.env.API_URL ?? 'http://localhost:3000'),
        'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(
          process.env.GOOGLE_MAPS_API_KEY ?? '',
        ),
      },
    },

    devServer: {
      open: false,
      // A mesma porta da WEB_URL padrão da API (links dos e-mails).
      port: 9000,
    },

    framework: {
      config: {},
      lang: 'pt-BR',
      iconSet: 'material-symbols-outlined',
      plugins: [],
    },

    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    // InjectManifest: o service worker próprio recebe o handler de push.
    pwa: {
      workboxMode: 'InjectManifest',
    },
  };
});
