import { describe, expect, it } from 'vitest';

import { chaveDoUpload, fotoAceita, prefixoDaOcorrencia, TAMANHO_MAXIMO_FOTO } from './foto.js';

const OCORRENCIA = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';

describe('foto', () => {
  it.each([
    ['image/jpeg', TAMANHO_MAXIMO_FOTO, true],
    ['image/jpeg', 1, true],
    ['image/jpeg', TAMANHO_MAXIMO_FOTO + 1, false],
    ['image/jpeg', 0, false],
    ['image/jpeg', 1.5, false],
    ['image/png', 1000, false],
  ])('%s com %d bytes é aceita: %s', (tipo, bytes, aceita) => {
    expect(fotoAceita(tipo, bytes)).toBe(aceita);
  });

  it('a chave fica dentro do prefixo da ocorrência, com a ordem e o sufixo', () => {
    const chave = chaveDoUpload(OCORRENCIA, 2, 'abc');

    expect(chave).toBe(`ocorrencias/${OCORRENCIA}/2-abc.jpg`);
    expect(chave.startsWith(prefixoDaOcorrencia(OCORRENCIA))).toBe(true);
  });
});
