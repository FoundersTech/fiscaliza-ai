// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';

export default defineConfig(() => {
  return {
    boot: [],

    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: ['material-icons'],

    build: {
      typescript: {
        strict: true,
        vueShim: true,
      },

      // As rotas do design usam paths (/ocorrencias/:id), então o modo é history.
      vueRouterMode: 'history',
    },

    devServer: {
      open: false,
    },

    framework: {
      config: {},
      lang: 'pt-BR',
      plugins: [],
    },

    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    // InjectManifest: o service worker próprio recebe o handler de push (T-34).
    pwa: {
      workboxMode: 'InjectManifest',
    },
  };
});
