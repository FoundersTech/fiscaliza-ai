import { describe, expect, it } from 'vitest';

import { HasherArgon2 } from './hasher-argon2.js';

const hasher = new HasherArgon2();

describe('HasherArgon2', () => {
  it('gera argon2id no formato PHC, com os parâmetros mínimos da OWASP', async () => {
    const hash = await hasher.gerar('senha-forte-1');

    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(hash).not.toContain('senha-forte-1');
  });

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hasher.gerar('senha-forte-1');

    expect(await hasher.conferir(hash, 'senha-forte-1')).toBe(true);
    expect(await hasher.conferir(hash, 'senha-forte-2')).toBe(false);
    expect(await hasher.conferir(hash, '')).toBe(false);
  });

  it('usa um sal novo a cada hash', async () => {
    const [primeiro, segundo] = await Promise.all([
      hasher.gerar('mesma-senha'),
      hasher.gerar('mesma-senha'),
    ]);
    expect(primeiro).not.toBe(segundo);
  });

  it('recusa hash fora do formato, sem lançar erro', async () => {
    for (const hash of ['', 'texto', '$argon2i$v=19$m=19456,t=2,p=1$abc$def', '$2b$10$bcrypt']) {
      expect(await hasher.conferir(hash, 'qualquer')).toBe(false);
    }
  });
});
