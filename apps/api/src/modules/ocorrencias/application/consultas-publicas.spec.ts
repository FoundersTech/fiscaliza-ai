import { describe, expect, it, vi } from 'vitest';

import type { Ambiente } from '../../../shared/config/ambiente.js';
import type { Parametros } from '../../../shared/config/parametros.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { UrlFotos } from '../../midia/application/url-fotos.js';
import { StatusOcorrencia } from '../domain/ocorrencia.js';
import { MontadorCard } from './card.js';
import type { ConsultasOcorrencias, DadosCard, LinhaFeed, LinhaPontoMapa } from './consultas.js';
import { CursorFeed, ListarFeed } from './listar-feed.js';
import { lerAreaMapa, ListarMapa, MAXIMO_PONTOS_MAPA } from './listar-mapa.js';

const parametros = { urgente_min_confirmacoes: 10 } as Parametros;
const urlFotos = new UrlFotos({ R2_URL_PUBLICA: 'https://fotos.exemplo.test' } as Ambiente);
const montador = new MontadorCard(parametros, urlFotos);
const agora = new Date('2026-11-14T15:00:00Z');

/** As leituras que feed e mapa não usam. */
function outrasConsultas() {
  return {
    detalhe: vi.fn<ConsultasOcorrencias['detalhe']>(),
    vinculo: vi.fn<ConsultasOcorrencias['vinculo']>(),
    doAutor: vi.fn<ConsultasOcorrencias['doAutor']>(),
  };
}

function dados(mudancas: Partial<DadosCard> = {}): DadosCard {
  return {
    id: '7f9c2b1e-0c1d-4b8a-9a43-1f5e8f0e2a10',
    protocolo: 'FA-2026-SOR-000001',
    status: StatusOcorrencia.EM_EXECUCAO,
    descricao: 'Buraco grande na pista perto do ponto de ônibus',
    endereco: 'Rua A, 1 · Centro',
    criadaEm: new Date('2026-11-10T15:00:00Z'),
    resolvidaEm: null,
    categoria: { slug: 'pavimentacao', nome: 'Pavimentação', icone: 'construction' },
    confirmacoes: 3,
    miniaturaKey: 'ocorrencias/abc/foto-400.jpg',
    ...mudancas,
  };
}

function erroDe(funcao: () => unknown): ErroAplicacao {
  try {
    funcao();
  } catch (erro) {
    if (erro instanceof ErroAplicacao) return erro;
  }
  throw new Error('esperava um ErroAplicacao');
}

describe('MontadorCard', () => {
  it('monta o card com status público, dias em aberto e a URL da miniatura', () => {
    expect(montador.montar(dados(), agora)).toMatchObject({
      statusPublico: 'EM_ANDAMENTO',
      diasEmAberto: 4,
      urgente: false,
      miniaturaUrl: 'https://fotos.exemplo.test/ocorrencias/abc/foto-400.jpg',
      fotoEmAnalise: false,
    });
  });

  it('sem foto aprovada: miniatura null e "foto em análise"', () => {
    expect(montador.montar(dados({ miniaturaKey: null }), agora)).toMatchObject({
      miniaturaUrl: null,
      fotoEmAnalise: true,
    });
  });

  it('URGENTE a partir do limiar de confirmações', () => {
    expect(montador.montar(dados({ confirmacoes: 9 }), agora).urgente).toBe(false);
    expect(montador.montar(dados({ confirmacoes: 10 }), agora).urgente).toBe(true);
  });

  it('recusa montar card de ocorrência oculta ao público', () => {
    expect(() => montador.montar(dados({ status: StatusOcorrencia.RECUSADA }), agora)).toThrow();
  });
});

describe('CursorFeed', () => {
  const posicao = {
    criadaEm: '2026-11-14T12:00:00.123456Z',
    id: '7f9c2b1e-0c1d-4b8a-9a43-1f5e8f0e2a10',
  };

  it('ida e volta preservam os microssegundos', () => {
    expect(CursorFeed.decodificar(CursorFeed.codificar(posicao))).toEqual(posicao);
  });

  it.each([
    'nao-e-cursor',
    Buffer.from('[1,2]').toString('base64url'),
    Buffer.from('["2026-11-14", "x"]').toString('base64url'),
    Buffer.from(JSON.stringify([posicao.criadaEm, 'nao-e-uuid'])).toString('base64url'),
  ])('cursor inválido (%s) vira 422 VALIDACAO', (cursor) => {
    const erro = erroDe(() => CursorFeed.decodificar(cursor));
    expect(erro.codigo).toBe('VALIDACAO');
    expect(erro.status).toBe(422);
    expect(erro.detalhes).toHaveProperty('campos.cursor');
  });
});

describe('ListarFeed', () => {
  function linha(indice: number): LinhaFeed {
    const id = `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`;
    return {
      ...dados({ id }),
      posicao: { criadaEm: `2026-11-14T12:00:00.00000${indice}Z`, id },
    };
  }

  it('pede um item a mais e devolve o cursor do último da página', async () => {
    const consultas = {
      ...outrasConsultas(),
      feed: vi.fn<ConsultasOcorrencias['feed']>().mockResolvedValue([linha(1), linha(2), linha(3)]),
      pontosNaArea: vi.fn<ConsultasOcorrencias['pontosNaArea']>(),
    };
    const pagina = await new ListarFeed(consultas, montador).executar({ limite: 2 }, agora);

    expect(consultas.feed).toHaveBeenCalledWith(expect.anything(), null, 3);
    expect(pagina.itens).toHaveLength(2);
    expect(CursorFeed.decodificar(pagina.proximoCursor!)).toEqual(linha(2).posicao);
  });

  it('na última página, proximo_cursor é null', async () => {
    const consultas = {
      ...outrasConsultas(),
      feed: vi.fn<ConsultasOcorrencias['feed']>().mockResolvedValue([linha(1)]),
      pontosNaArea: vi.fn<ConsultasOcorrencias['pontosNaArea']>(),
    };
    const pagina = await new ListarFeed(consultas, montador).executar({ limite: 2 }, agora);
    expect(pagina.proximoCursor).toBeNull();
  });
});

describe('lerAreaMapa', () => {
  it('lê minLng,minLat,maxLng,maxLat', () => {
    expect(lerAreaMapa('-47.6,-23.6,-47.3,-23.4')).toEqual({
      oeste: -47.6,
      sul: -23.6,
      leste: -47.3,
      norte: -23.4,
    });
  });

  it.each([
    null,
    '',
    '1,2,3',
    '1,2,3,4,5',
    'a,b,c,d',
    '-47.6,,-47.3,-23.4',
    '-200,-23.6,-47.3,-23.4',
    '-47.6,-95,-47.3,-23.4',
    '-47.3,-23.6,-47.6,-23.4',
    '-47.6,-23.4,-47.3,-23.6',
  ])('%s vira 422 BBOX_INVALIDA', (bbox) => {
    const erro = erroDe(() => lerAreaMapa(bbox));
    expect(erro.codigo).toBe('BBOX_INVALIDA');
    expect(erro.status).toBe(422);
  });
});

describe('ListarMapa', () => {
  it('corta em 2000 pontos e marca truncado', async () => {
    const ponto: LinhaPontoMapa = {
      id: 'x',
      lat: -23.5,
      lng: -47.4,
      status: StatusOcorrencia.RECEBIDA,
      categoriaSlug: 'iluminacao',
      confirmacoes: 0,
    };
    const consultas = {
      ...outrasConsultas(),
      feed: vi.fn<ConsultasOcorrencias['feed']>(),
      pontosNaArea: vi
        .fn<ConsultasOcorrencias['pontosNaArea']>()
        .mockResolvedValue(Array.from({ length: MAXIMO_PONTOS_MAPA + 1 }, () => ponto)),
    };
    const resultado = await new ListarMapa(consultas, montador).executar({
      bbox: '-48,-24,-47,-23',
    });

    expect(consultas.pontosNaArea).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      MAXIMO_PONTOS_MAPA + 1,
    );
    expect(resultado.pontos).toHaveLength(MAXIMO_PONTOS_MAPA);
    expect(resultado.truncado).toBe(true);
  });
});
