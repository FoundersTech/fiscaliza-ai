import { describe, expect, it } from 'vitest';

import { decidirAcesso, destinoSeguro } from './acesso';
import routes from './routes';

const DESLOGADO = { logado: false, papel: null };
const CIDADAO = { logado: true, papel: 'CIDADAO' as const };
const AGENTE = { logado: true, papel: 'AGENTE_ORGAO' as const };

/** O meta de uma rota filha do layout, como o router vai ver. */
function metaDe(caminho: string) {
  const filha = routes[0]?.children?.find((rota) => rota.path === caminho);
  if (!filha) throw new Error(`rota ${caminho} não existe`);
  return filha.meta ?? {};
}

describe('decidirAcesso', () => {
  it('abrir /alertas deslogado leva para /login?voltar=/alertas', () => {
    expect(decidirAcesso({ fullPath: '/alertas', meta: metaDe('alertas') }, DESLOGADO)).toEqual({
      path: '/login',
      query: { voltar: '/alertas' },
    });
  });

  it('guarda a rota inteira, com a consulta, no voltar', () => {
    const destino = { fullPath: '/registrar?categoria=iluminacao', meta: metaDe('registrar') };
    expect(decidirAcesso(destino, DESLOGADO)).toMatchObject({
      query: { voltar: '/registrar?categoria=iluminacao' },
    });
  });

  it.each(['', 'mapa', 'score'])('a rota pública "/%s" abre sem login', (caminho) => {
    expect(decidirAcesso({ fullPath: `/${caminho}`, meta: metaDe(caminho) }, DESLOGADO)).toBe(true);
  });

  it('o cidadão logado abre /alertas', () => {
    expect(decidirAcesso({ fullPath: '/alertas', meta: metaDe('alertas') }, CIDADAO)).toBe(true);
  });

  it('um agente em rota de cidadão vai para "Acesso negado"', () => {
    expect(decidirAcesso({ fullPath: '/alertas', meta: metaDe('alertas') }, AGENTE)).toEqual({
      path: '/acesso-negado',
      query: { de: '/alertas' },
    });
  });

  it('rota só com auth aceita qualquer papel logado', () => {
    expect(decidirAcesso({ fullPath: '/conta', meta: { auth: true } }, AGENTE)).toBe(true);
  });

  it('o login abre para o visitante', () => {
    expect(decidirAcesso({ fullPath: '/login', meta: { visitante: true } }, DESLOGADO)).toBe(true);
  });

  it('logado, o login segue para o voltar, e sem voltar para o início', () => {
    const login = { fullPath: '/login?voltar=/registrar', meta: { visitante: true } };
    expect(decidirAcesso({ ...login, query: { voltar: '/registrar' } }, CIDADAO)).toBe(
      '/registrar',
    );
    expect(decidirAcesso({ ...login, query: { voltar: 'https://fora.test' } }, CIDADAO)).toBe('/');
    expect(decidirAcesso({ fullPath: '/login', meta: { visitante: true } }, CIDADAO)).toBe('/');
  });
});

describe('destinoSeguro', () => {
  it.each([
    ['/alertas', '/alertas'],
    ['/registrar?x=1', '/registrar?x=1'],
    ['https://site-malicioso.test', '/'],
    ['//site-malicioso.test', '/'],
    [undefined, '/'],
    [['/a', '/b'], '/'],
  ])('%j vira %s', (voltar, esperado) => {
    expect(destinoSeguro(voltar)).toBe(esperado);
  });
});
