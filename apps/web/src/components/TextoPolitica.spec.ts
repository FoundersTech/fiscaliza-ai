import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { POLITICA_VERSAO } from '@/services/politica';

const COMPONENTE = readFileSync(new URL('./TextoPolitica.vue', import.meta.url), 'utf8');
const PAGINA = readFileSync(new URL('../pages/PoliticaPage.vue', import.meta.url), 'utf8');

describe('política de privacidade v1', () => {
  it('mantém a versão 1 e exibe a versão junto ao texto', () => {
    expect(POLITICA_VERSAO).toBe('1');
    expect(COMPONENTE).toContain('Versão {{ POLITICA_VERSAO }}');
    expect(PAGINA).toContain('<TextoPolitica');
  });

  it('cobre as seis seções exigidas sem texto provisório', () => {
    expect(COMPONENTE).not.toContain('será publicado');
    expect(COMPONENTE).toContain('1. Dados coletados');
    expect(COMPONENTE).toContain('2. Finalidade do tratamento');
    expect(COMPONENTE).toContain('3. Base legal');
    expect(COMPONENTE).toContain('4. Retenção e segurança');
    expect(COMPONENTE).toContain('5. Direitos do titular');
    expect(COMPONENTE).toContain('6. Contato');
  });

  it('detalha exportação em 48 horas, exclusão com anonimização e contato', () => {
    expect(COMPONENTE).toMatch(/48 horas/i);
    expect(COMPONENTE).toMatch(/exclusão da conta/i);
    expect(COMPONENTE).toMatch(/anonimizados/i);
    expect(COMPONENTE).toContain('mailto:');
  });
});
