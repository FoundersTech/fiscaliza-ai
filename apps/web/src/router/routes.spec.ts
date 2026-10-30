import { describe, expect, it } from 'vitest';

import routes from './routes';

describe('routes', () => {
  it('as abas da barra inferior ficam dentro do layout', () => {
    const abas = routes[0]?.children?.map((rota) => rota.path);
    expect(routes[0]?.path).toBe('/');
    expect(abas).toEqual(expect.arrayContaining(['', 'mapa', 'score', 'alertas', 'registrar']));
  });

  it('deixa a rota coringa (404) por último', () => {
    expect(routes.at(-1)?.path).toBe('/:catchAll(.*)*');
  });
});
