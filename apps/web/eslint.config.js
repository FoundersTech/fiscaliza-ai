import js from '@eslint/js';
import pluginQuasar from '@quasar/app-vite/eslint';
import prettierSkipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default defineConfigWithVueTs(
  pluginQuasar.configs.recommended(),
  js.configs.recommended,
  pluginVue.configs['flat/essential'],

  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  vueTsConfigs.recommendedTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        process: 'readonly',
      },
    },
    rules: {
      'prefer-promise-reject-errors': 'off',
      'vue/v-slot-style': ['warn', 'shorthand'],

      // Segurança (XSS): conteúdo do usuário nunca é renderizado como HTML.
      'vue/no-v-html': 'error',

      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },

  {
    files: ['src-pwa/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  prettierSkipFormatting,
);
