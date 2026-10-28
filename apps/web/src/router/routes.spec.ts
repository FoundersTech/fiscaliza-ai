import { describe, expect, it } from 'vitest';

import routes from './routes';

describe('routes', () => {
  it('tem a página inicial na raiz', () => {
    expect(routes[0]?.path).toBe('/');
  });

  it('deixa a rota coringa (404) por último', () => {
    expect(routes.at(-1)?.path).toBe('/:catchAll(.*)*');
  });
});
