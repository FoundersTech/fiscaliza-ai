import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import {
  buscarPontos,
  chaveDoPonto,
  criarBuscaPontos,
  destinoDaBusca,
  diferencaDePontos,
  ESPERA_PONTOS_MS,
  estiloDoAlfinete,
  LEGENDA,
  limitesDoGoogle,
  montarBbox,
  type PontoMapa,
  resumoDoPonto,
  type ResultadoPontos,
} from './mapa-ocorrencias';

const CENTRO = { sul: -23.56, oeste: -47.5, norte: -23.45, leste: -47.4 };

function ponto(mudancas: Partial<PontoMapa> = {}): PontoMapa {
  return {
    id: '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21',
    lat: -23.5015,
    lng: -47.4526,
    status_publico: 'RECEBIDO',
    categoria_slug: 'iluminacao',
    urgente: false,
    ...mudancas,
  };
}

describe('cores por status', () => {
  it('pinta Recebido de laranja, Em andamento de azul e Resolvido de verde', () => {
    expect(estiloDoAlfinete(ponto({ status_publico: 'RECEBIDO' })).background).toBe('#f97316');
    expect(estiloDoAlfinete(ponto({ status_publico: 'EM_ANDAMENTO' })).background).toBe('#2563eb');
    expect(estiloDoAlfinete(ponto({ status_publico: 'RESOLVIDO' })).background).toBe('#16a34a');
  });

  it('marca a urgente com "!" e mantém a cor do status', () => {
    const estilo = estiloDoAlfinete(ponto({ status_publico: 'EM_ANDAMENTO', urgente: true }));
    expect(estilo).toMatchObject({ background: '#2563eb', glyphText: '!' });
    expect(estiloDoAlfinete(ponto()).glyphText).toBeNull();
  });

  it('a legenda tem os três status, na ordem do andamento, com as mesmas cores dos alfinetes', () => {
    expect(LEGENDA.map(({ rotulo, cor }) => [rotulo, cor])).toEqual([
      ['Recebido', '#f97316'],
      ['Em andamento', '#2563eb'],
      ['Resolvido', '#16a34a'],
    ]);
  });
});

describe('montarBbox', () => {
  it('monta minLng,minLat,maxLng,maxLat a partir da área visível', () => {
    expect(montarBbox(CENTRO)).toBe('-47.5,-23.56,-47.4,-23.45');
  });

  it('converte os limites do Google e arredonda em 6 casas', () => {
    const area = limitesDoGoogle({
      south: -23.561234567,
      west: -47.512345678,
      north: -23.451,
      east: -47.401,
    });
    expect(montarBbox(area)).toBe('-47.512346,-23.561235,-47.401,-23.451');
  });

  it('com o mapa todo afastado, não manda nada fora dos limites que a API aceita', () => {
    expect(montarBbox({ sul: -95, oeste: 170, norte: 95, leste: -170 })).toBe('-180,-90,180,90');
    expect(montarBbox({ sul: -10, oeste: -200, norte: 10, leste: 200 })).toBe('-180,-10,180,10');
  });
});

describe('diferencaDePontos', () => {
  it('só cria os alfinetes novos e só tira os que saíram da área', () => {
    const a = ponto({ id: 'a' });
    const b = ponto({ id: 'b' });
    const c = ponto({ id: 'c' });

    const { entrar, sair } = diferencaDePontos([chaveDoPonto(a), chaveDoPonto(b)], [b, c]);

    expect(entrar).toEqual([c]);
    expect(sair).toEqual([chaveDoPonto(a)]);
  });

  it('troca o alfinete quando o status ou a urgência mudam', () => {
    const antes = ponto({ id: 'a' });
    const depois = ponto({ id: 'a', status_publico: 'RESOLVIDO' });

    const { entrar, sair } = diferencaDePontos([chaveDoPonto(antes)], [depois]);

    expect(entrar).toEqual([depois]);
    expect(sair).toEqual([chaveDoPonto(antes)]);
  });
});

describe('buscarPontos', () => {
  it('pede a área e o município e devolve os pontos com o aviso de truncado', async () => {
    const GET = vi.fn(() => Promise.resolve({ data: { pontos: [ponto()], truncado: true } }));

    const resultado = await buscarPontos(
      { GET } as unknown as Api,
      '-47.5,-23.56,-47.4,-23.45',
      3552205,
    );

    expect(GET).toHaveBeenCalledWith('/api/v1/ocorrencias/mapa', {
      params: { query: { bbox: '-47.5,-23.56,-47.4,-23.45', municipio: 3552205 } },
    });
    expect(resultado).toEqual({ ok: true, pontos: [ponto()], truncado: true });
  });

  it('erro da API ou falha de rede vêm como falha, sem exceção', async () => {
    const comErro = { GET: () => Promise.resolve({ error: { codigo: 'BBOX_INVALIDA' } }) };
    const semRede = { GET: () => Promise.reject(new TypeError('Failed to fetch')) };

    expect(await buscarPontos(comErro as unknown as Api, 'x')).toEqual({ ok: false });
    expect(await buscarPontos(semRede as unknown as Api, 'x')).toEqual({ ok: false });
  });
});

describe('criarBuscaPontos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const OK: ResultadoPontos = { ok: true, pontos: [], truncado: false };
  const mover = (deslocamento: number) => ({
    ...CENTRO,
    oeste: CENTRO.oeste + deslocamento,
    leste: CENTRO.leste + deslocamento,
  });

  it('espera o mapa parar: vários movimentos seguidos viram uma só busca, da última área', async () => {
    const buscar = vi.fn(() => Promise.resolve(OK));
    const aoResponder = vi.fn();
    const busca = criarBuscaPontos({ buscar, aoResponder });

    busca.agendar(mover(0));
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS - 50);
    busca.agendar(mover(0.01));
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS - 50);
    busca.agendar(mover(0.02));
    expect(buscar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);

    expect(buscar).toHaveBeenCalledOnce();
    expect(buscar).toHaveBeenCalledWith(montarBbox(mover(0.02)));
    expect(aoResponder).toHaveBeenCalledWith(OK);
  });

  it('não busca de novo a mesma área já carregada', async () => {
    const buscar = vi.fn(() => Promise.resolve(OK));
    const busca = criarBuscaPontos({ buscar, aoResponder: vi.fn() });

    busca.agendar(CENTRO);
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);
    busca.agendar(CENTRO);
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);

    expect(buscar).toHaveBeenCalledOnce();
  });

  it('descarta a resposta lenta de uma área que o usuário já deixou para trás', async () => {
    const respostas: ((resultado: ResultadoPontos) => void)[] = [];
    const buscar = vi.fn(
      () => new Promise<ResultadoPontos>((resolver) => respostas.push(resolver)),
    );
    const aoResponder = vi.fn();
    const busca = criarBuscaPontos({ buscar, aoResponder });

    busca.agendar(mover(0));
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);
    busca.agendar(mover(0.05));
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);

    const nova: ResultadoPontos = { ok: true, pontos: [ponto({ id: 'nova' })], truncado: false };
    respostas[1]!(nova);
    await vi.advanceTimersByTimeAsync(0);
    respostas[0]!({ ok: true, pontos: [ponto({ id: 'velha' })], truncado: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(aoResponder).toHaveBeenCalledOnce();
    expect(aoResponder).toHaveBeenCalledWith(nova);
  });

  it('depois de uma falha, "Tentar de novo" busca a mesma área sem esperar', async () => {
    const buscar = vi
      .fn<(bbox: string) => Promise<ResultadoPontos>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(OK);
    const aoResponder = vi.fn();
    const busca = criarBuscaPontos({ buscar, aoResponder });

    busca.agendar(CENTRO);
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);
    expect(aoResponder).toHaveBeenLastCalledWith({ ok: false });

    busca.repetir();
    await vi.advanceTimersByTimeAsync(0);

    expect(buscar).toHaveBeenNthCalledWith(2, montarBbox(CENTRO));
    expect(aoResponder).toHaveBeenLastCalledWith(OK);
  });

  it('a mesma área volta a ser buscada se a última tentativa falhou', async () => {
    const buscar = vi
      .fn<(bbox: string) => Promise<ResultadoPontos>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(OK);
    const busca = criarBuscaPontos({ buscar, aoResponder: vi.fn() });

    busca.agendar(CENTRO);
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);
    busca.agendar(CENTRO);
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);

    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('ao sair da tela, nada mais chega', async () => {
    const buscar = vi.fn(() => Promise.resolve(OK));
    const aoResponder = vi.fn();
    const busca = criarBuscaPontos({ buscar, aoResponder });

    busca.agendar(CENTRO);
    busca.cancelar();
    await vi.advanceTimersByTimeAsync(ESPERA_PONTOS_MS);

    expect(buscar).not.toHaveBeenCalled();
    expect(aoResponder).not.toHaveBeenCalled();
  });
});

describe('resumoDoPonto', () => {
  const categorias = [
    { id: 1, slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', schema_atributos: [] },
  ];

  it('mostra categoria, status, urgência e o link para o detalhe', () => {
    const resumo = resumoDoPonto(
      ponto({ status_publico: 'EM_ANDAMENTO', urgente: true }),
      categorias,
    );

    expect(resumo).toMatchObject({
      titulo: 'Iluminação',
      icone: 'sym_o_lightbulb',
      statusPublico: 'EM_ANDAMENTO',
      status: { rotulo: 'Em andamento' },
      urgente: true,
      link: '/ocorrencias/0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21',
    });
  });

  it('categoria que saiu da lista de ativas ainda abre o resumo', () => {
    const resumo = resumoDoPonto(ponto({ categoria_slug: 'desativada' }), categorias);
    expect(resumo).toMatchObject({ titulo: 'Ocorrência', icone: 'sym_o_location_on' });
  });
});

describe('destinoDaBusca', () => {
  const viewport = { south: -23.52, west: -47.47, north: -23.49, east: -47.44 };
  const location = { lat: -23.505, lng: -47.455 };

  it('um bairro vem com área: o mapa enquadra o bairro', () => {
    expect(destinoDaBusca({ viewport, location })).toEqual({ area: viewport });
  });

  it('sem área, centraliza no ponto do lugar', () => {
    expect(destinoDaBusca({ viewport: null, location })).toEqual({ ponto: location });
  });

  it('lugar sem posição não move o mapa', () => {
    expect(destinoDaBusca({})).toBeNull();
  });
});
