import { describe, expect, it } from 'vitest';

import routes from './routes';

describe('routes', () => {
  it('as abas da barra inferior ficam dentro do layout', () => {
    const abas = routes[0]?.children?.map((rota) => rota.path);
    expect(routes[0]?.path).toBe('/');
    expect(abas).toEqual(expect.arrayContaining(['', 'mapa', 'score', 'alertas']));
  });

  it('o registro ocupa a tela toda, sem a barra inferior, e é só para cidadão', () => {
    const registrar = routes.find((rota) => rota.path === '/registrar');
    expect(routes[0]?.children?.some((rota) => rota.path === 'registrar')).toBe(false);
    expect(registrar?.meta).toEqual({ auth: true, papeis: ['CIDADAO'] });
  });

  it('login, cadastro e esqueci a senha são só para visitantes; definir senha abre para todos', () => {
    const meta = (caminho: string) => routes.find((rota) => rota.path === caminho)?.meta;
    expect(meta('/login')).toEqual({ visitante: true });
    expect(meta('/cadastro')).toEqual({ visitante: true });
    expect(meta('/esqueci-senha')).toEqual({ visitante: true });
    expect(meta('/definir-senha')).toBeUndefined();
  });

  it('deixa a rota coringa (404) por último', () => {
    expect(routes.at(-1)?.path).toBe('/:catchAll(.*)*');
  });
});
