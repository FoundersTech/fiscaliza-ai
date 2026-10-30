import { describe, expect, it } from 'vitest';

import { emailValido, igualA, obrigatorio, senhaValida, tamanho } from './validacao';

describe('regras dos formulários de conta', () => {
  it('a senha precisa de 8 a 128 caracteres, e espaços contam', () => {
    expect(senhaValida('1234567')).toBe('A senha deve ter de 8 a 128 caracteres');
    expect(senhaValida('12345678')).toBe(true);
    expect(senhaValida('       a')).toBe(true);
    expect(senhaValida('x'.repeat(129))).not.toBe(true);
  });

  it.each([
    ['maria@exemplo.test', true],
    [' maria@exemplo.test ', true],
    ['maria@exemplo', 'Informe um e-mail válido'],
    ['maria exemplo.test', 'Informe um e-mail válido'],
  ])('o e-mail %j dá %j', (email, esperado) => {
    expect(emailValido(email)).toBe(esperado);
  });

  it('obrigatorio e tamanho ignoram os espaços das pontas', () => {
    expect(obrigatorio('Informe')('   ')).toBe('Informe');
    expect(tamanho(2, 30, 'Tamanho')(' a ')).toBe('Tamanho');
    expect(tamanho(2, 30, 'Tamanho')(' ab ')).toBe(true);
  });

  it('a confirmação compara com o valor atual do outro campo', () => {
    let senha = 'primeira';
    const confirma = igualA(() => senha, 'Diferentes');
    expect(confirma('primeira')).toBe(true);
    senha = 'segunda';
    expect(confirma('primeira')).toBe('Diferentes');
  });
});
