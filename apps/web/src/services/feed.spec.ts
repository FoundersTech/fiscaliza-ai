import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import { buscarPagina, ITENS_POR_PAGINA, rotuloDoStatus, textoDosDias } from './feed';

type Resposta = { data?: unknown; error?: unknown };

function montar(resposta: Resposta | Error) {
  const GET = vi.fn<(caminho: string, opcoes: { params: { query: unknown } }) => Promise<Resposta>>(
    () => (resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)),
  );
  return { api: { GET } as unknown as Api, GET };
}

const query = (GET: ReturnType<typeof montar>['GET']) => GET.mock.calls[0]![1].params.query;

describe('busca de uma página do feed', () => {
  it('sem filtros, pede só o tamanho da página', async () => {
    const { api, GET } = montar({ data: { itens: [], proximo_cursor: null } });

    await buscarPagina(api, { categoria: null, status: null });

    expect(GET).toHaveBeenCalledWith('/api/v1/ocorrencias', expect.anything());
    expect(query(GET)).toEqual({ limite: ITENS_POR_PAGINA });
  });

  it('manda categoria, status, município e cursor juntos', async () => {
    const { api, GET } = montar({ data: { itens: [], proximo_cursor: null } });

    await buscarPagina(api, {
      categoria: 'iluminacao',
      status: 'RESOLVIDO',
      municipio: 3552205,
      cursor: 'abc',
    });

    expect(query(GET)).toEqual({
      limite: ITENS_POR_PAGINA,
      categoria: 'iluminacao',
      status: 'RESOLVIDO',
      municipio: 3552205,
      cursor: 'abc',
    });
  });

  it('devolve os itens e o cursor da página seguinte', async () => {
    const card = { id: '1' };
    const { api } = montar({ data: { itens: [card], proximo_cursor: 'prox' } });

    expect(await buscarPagina(api, { categoria: null, status: null })).toEqual({
      tipo: 'OK',
      itens: [card],
      proximoCursor: 'prox',
    });
  });

  it('um erro da API vira a mensagem dela', async () => {
    const { api } = montar({
      error: { codigo: 'VALIDACAO', mensagem: 'Filtro inválido.', detalhes: {} },
    });

    expect(await buscarPagina(api, { categoria: null, status: null })).toEqual({
      tipo: 'ERRO',
      mensagem: 'Filtro inválido.',
    });
  });

  it('sem conexão, pede para conferir a rede', async () => {
    const { api } = montar(new TypeError('Failed to fetch'));

    expect(await buscarPagina(api, { categoria: null, status: null })).toEqual({
      tipo: 'ERRO',
      mensagem: MENSAGEM_SEM_CONEXAO,
    });
  });
});

describe('textos do card', () => {
  it('mostra o status como aparece no app', () => {
    expect(rotuloDoStatus('RECEBIDO')).toBe('Recebido');
    expect(rotuloDoStatus('EM_ANDAMENTO')).toBe('Em andamento');
    expect(rotuloDoStatus('RESOLVIDO')).toBe('Resolvido');
  });

  it('conta os dias em aberto, ou quanto levou para resolver', () => {
    expect(textoDosDias(0, 'RECEBIDO')).toBe('Aberta hoje');
    expect(textoDosDias(1, 'EM_ANDAMENTO')).toBe('1 dia em aberto');
    expect(textoDosDias(9, 'RECEBIDO')).toBe('9 dias em aberto');
    expect(textoDosDias(0, 'RESOLVIDO')).toBe('Resolvido no mesmo dia');
    expect(textoDosDias(1, 'RESOLVIDO')).toBe('Resolvido em 1 dia');
    expect(textoDosDias(12, 'RESOLVIDO')).toBe('Resolvido em 12 dias');
  });
});
