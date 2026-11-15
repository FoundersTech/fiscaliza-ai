import { describe, expect, it } from 'vitest';

import { ErroBancoCarga, lerBancoCarga, lerQuantidade } from './banco-carga.js';

describe('lerBancoCarga', () => {
  it('aceita o banco de carga e aponta a manutenção para o banco postgres', () => {
    expect(lerBancoCarga('postgresql://u:s@localhost:5432/fiscaliza_carga')).toEqual({
      nome: 'fiscaliza_carga',
      url: 'postgresql://u:s@localhost:5432/fiscaliza_carga',
      urlManutencao: 'postgresql://u:s@localhost:5432/postgres',
    });
    expect(lerBancoCarga('postgres://u:s@db:5432/fiscaliza_carga_staging').nome).toBe(
      'fiscaliza_carga_staging',
    );
  });

  it.each([
    'postgresql://u:s@localhost:5432/fiscaliza',
    'postgresql://u:s@localhost:5432/fiscaliza_teste',
    'postgresql://u:s@localhost:5432/postgres',
    'postgresql://u:s@localhost:5432/fiscaliza_cargaX',
    'mysql://u:s@localhost/fiscaliza_carga',
    'não é url',
    undefined,
  ])('recusa %s, que não é um banco de carga', (url) => {
    expect(() => lerBancoCarga(url)).toThrow(ErroBancoCarga);
  });
});

describe('lerQuantidade', () => {
  it('usa 200 mil quando não informada', () => {
    expect(lerQuantidade(undefined)).toBe(200_000);
    expect(lerQuantidade('5000')).toBe(5000);
  });

  it.each(['0', '-1', '1.5', 'abc', '3000000'])('recusa %s', (valor) => {
    expect(() => lerQuantidade(valor)).toThrow(ErroBancoCarga);
  });
});
