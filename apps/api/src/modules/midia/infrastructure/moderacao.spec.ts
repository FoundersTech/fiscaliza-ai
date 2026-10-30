import { describe, expect, it } from 'vitest';

import { moderacaoPara } from './moderacao.js';

describe('moderacaoPara', () => {
  it('APROVAR_TUDO aprova qualquer foto', async () => {
    const foto = { conteudo: Buffer.from('jpeg'), largura: 1, altura: 1 };

    await expect(moderacaoPara('APROVAR_TUDO').avaliar(foto)).resolves.toEqual({ aprovada: true });
  });
});
