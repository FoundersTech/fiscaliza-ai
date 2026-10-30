import { describe, expect, it } from 'vitest';

import { formatarEndereco } from './endereco.js';

describe('formatarEndereco', () => {
  it('junta rua, número e bairro', () => {
    expect(
      formatarEndereco({ rua: 'Rua Quinze de Novembro', numero: '482', bairro: 'Centro' }),
    ).toBe('Rua Quinze de Novembro, 482 · Centro');
  });

  it('sem bairro, mostra só rua e número', () => {
    expect(formatarEndereco({ rua: 'Rua Quinze de Novembro', numero: '482', bairro: null })).toBe(
      'Rua Quinze de Novembro, 482',
    );
  });

  it('sem número, a rua sai com s/n', () => {
    expect(formatarEndereco({ rua: 'Rua Sem Número', numero: '  ', bairro: 'Centro' })).toBe(
      'Rua Sem Número, s/n · Centro',
    );
  });

  it('sem rua, fica só o bairro; sem nada, null', () => {
    expect(formatarEndereco({ rua: null, numero: '10', bairro: 'Éden' })).toBe('Éden');
    expect(formatarEndereco({ rua: ' ', numero: null, bairro: null })).toBeNull();
  });
});
