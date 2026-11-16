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

  it('a fila e o detalhe do atendimento são só para o agente do órgão, sem a barra inferior', () => {
    for (const caminho of ['/atendimento', '/atendimento/:id']) {
      const rota = routes.find((item) => item.path === caminho);
      expect(rota?.meta).toEqual({ auth: true, papeis: ['AGENTE_ORGAO'] });
    }
    expect(routes[0]?.children?.some((rota) => rota.path.startsWith('atendimento'))).toBe(false);
  });

  it('login, cadastro e esqueci a senha são só para visitantes; definir senha abre para todos', () => {
    const meta = (caminho: string) => routes.find((rota) => rota.path === caminho)?.meta;
    expect(meta('/login')).toEqual({ visitante: true });
    expect(meta('/cadastro')).toEqual({ visitante: true });
    expect(meta('/esqueci-senha')).toEqual({ visitante: true });
    expect(meta('/definir-senha')).toBeUndefined();
  });

  it('minhas ocorrências e minha conta ficam na barra inferior e são só para cidadão', () => {
    const minhas = routes[0]?.children?.find((rota) => rota.path === 'minhas-ocorrencias');
    const conta = routes[0]?.children?.find((rota) => rota.path === 'conta');
    expect(minhas?.meta).toEqual({ auth: true, papeis: ['CIDADAO'] });
    expect(conta?.meta).toEqual({ auth: true, papeis: ['CIDADAO'] });
  });

  it('o detalhe da ocorrência abre sem login, para o link compartilhado', () => {
    const detalhe = routes[0]?.children?.find((rota) => rota.path === 'ocorrencias/:id');
    expect(detalhe).toBeDefined();
    expect(detalhe?.meta).toBeUndefined();
  });

  it('deixa a rota coringa (404) por último', () => {
    expect(routes.at(-1)?.path).toBe('/:catchAll(.*)*');
  });
});
