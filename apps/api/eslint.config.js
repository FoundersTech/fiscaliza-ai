import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Design, Segurança: SQL cru só como template tagged ($queryRaw / $executeRaw).
  {
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: '$queryRawUnsafe',
          message: 'Use $queryRaw com template tagged (risco de injeção de SQL).',
        },
        {
          property: '$executeRawUnsafe',
          message: 'Use $executeRaw com template tagged (risco de injeção de SQL).',
        },
      ],
    },
  },

  // RNF-09: as dependências entre camadas apontam para dentro.
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*'],
              message: 'A camada domain não importa framework (RNF-09).',
            },
            {
              group: ['@prisma/*', '.prisma/*'],
              message: 'A camada domain não importa ORM (RNF-09).',
            },
            {
              group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'],
              message: 'A camada domain não depende de outras camadas (RNF-09).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/*', '.prisma/*'],
              message: 'A camada application acessa dados só por ports (RNF-09).',
            },
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message:
                'A camada application não depende de infrastructure nem de presentation (RNF-09).',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
