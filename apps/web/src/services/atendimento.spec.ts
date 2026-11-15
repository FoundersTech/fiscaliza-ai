import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import {
  acoesPermitidas,
  type EventoAtendimento,
  formatarDataHora,
  listarFila,
  obterDetalhe,
  problemaDoCampo,
  STATUS_ABERTOS,
  type StatusInterno,
  tituloDoEvento,
  TODOS_STATUS,
  tomDoStatus,
  transicionar,
} from './atendimento';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
type Resposta = { data?: unknown; error?: unknown };

function apiFalsa(resposta: Resposta) {
  const GET = vi.fn<(caminho: string, opcoes: unknown) => Promise<Resposta>>(() =>
    Promise.resolve(resposta),
  );
  const POST = vi.fn<(caminho: string, opcoes: unknown) => Promise<Resposta>>(() =>
    Promise.resolve(resposta),
  );
  return { api: { GET, POST } as unknown as Api, GET, POST };
}

const permitidas = (...transicoes_permitidas: StatusInterno[]) =>
  acoesPermitidas({ transicoes_permitidas });

describe('ações do detalhe', () => {
  it('"Resolver" só aparece quando a API libera RESOLVIDA, o que acontece em EM_EXECUCAO', () => {
    // O que a API devolve em cada status, como na regra de transições do agente.
    const recebida = permitidas('EM_ANALISE', 'RECUSADA', 'DUPLICADA');
    const emAnalise = permitidas('EM_EXECUCAO', 'RECUSADA', 'DUPLICADA');
    const emExecucao = permitidas('RESOLVIDA');

    expect(recebida.map((acao) => acao.rotulo)).toEqual([
      'Iniciar análise',
      'Recusar',
      'Marcar como duplicada',
    ]);
    expect(emAnalise.map((acao) => acao.rotulo)).not.toContain('Resolver');
    expect(emExecucao).toEqual([{ para: 'RESOLVIDA', rotulo: 'Resolver', campo: 'resposta' }]);
  });

  it('um status final não tem ações', () => {
    expect(permitidas()).toEqual([]);
  });

  it('cada status final pede o seu dado: resposta, justificativa ou protocolo', () => {
    const campos = permitidas('RESOLVIDA', 'RECUSADA', 'DUPLICADA', 'EM_ANALISE').map(
      (acao) => acao.campo,
    );
    expect(campos).toEqual(['resposta', 'justificativa', 'protocolo', null]);
  });
});

describe('linha do tempo do agente', () => {
  const evento = (mudancas: Partial<EventoAtendimento>): EventoAtendimento => ({
    de_status: 'RECEBIDA',
    para_status: 'EM_ANALISE',
    orgao: 'SERPP',
    comentario: null,
    criado_em: '2026-11-14T13:05:00.000Z',
    ...mudancas,
  });

  it('descreve o registro, as mudanças do órgão e a reabertura', () => {
    expect(tituloDoEvento(evento({ de_status: null, para_status: 'RECEBIDA', orgao: null }))).toBe(
      'Registrada pelo cidadão',
    );
    expect(tituloDoEvento(evento({}))).toBe('Recebida → Em análise');
    expect(
      tituloDoEvento(evento({ de_status: 'RESOLVIDA', para_status: 'EM_ANALISE', orgao: null })),
    ).toBe('Reaberta: o cidadão disse que não foi resolvido');
  });

  it('mostra a data no horário de Brasília', () => {
    expect(formatarDataHora('2026-11-14T13:05:00.000Z')).toBe('14/11/2026, 10:05');
  });

  it('as cores seguem o status público', () => {
    expect(TODOS_STATUS.map(tomDoStatus)).toEqual([
      'recebido',
      'andamento',
      'andamento',
      'resolvido',
      'final',
      'final',
    ]);
  });
});

describe('problemaDoCampo', () => {
  it('não deixa enviar resposta ou justificativa vazias', () => {
    expect(problemaDoCampo('resposta', '   ')).toBe('Informe a resposta oficial');
    expect(problemaDoCampo('justificativa', '')).toBe('Informe a justificativa da recusa');
    expect(problemaDoCampo('resposta', 'Lâmpada trocada.')).toBeNull();
    expect(problemaDoCampo('resposta', 'a'.repeat(1001))).toBe('Use até 1000 caracteres');
  });

  it('o protocolo original precisa estar no formato do app', () => {
    expect(problemaDoCampo('protocolo', 'FA-2026-SOR-12')).toBe('Use o formato FA-2026-SOR-000123');
    expect(problemaDoCampo('protocolo', ' fa-2026-sor-000101 ')).toBeNull();
  });

  it('ação sem dado obrigatório não tem o que conferir', () => {
    expect(problemaDoCampo(null, '')).toBeNull();
  });
});

describe('listarFila', () => {
  it('manda os status e as categorias separados por vírgula, e o cursor da página', async () => {
    const { api, GET } = apiFalsa({ data: { itens: [], proximo_cursor: 'c2' } });

    const resultado = await listarFila(
      api,
      { status: [...STATUS_ABERTOS], categorias: ['iluminacao', 'pavimentacao'] },
      'c1',
    );

    expect(resultado).toEqual({ tipo: 'OK', itens: [], proximoCursor: 'c2' });
    expect(GET).toHaveBeenCalledWith('/api/v1/atendimento/ocorrencias', {
      params: {
        query: {
          status: 'RECEBIDA,EM_ANALISE,EM_EXECUCAO',
          categoria: 'iluminacao,pavimentacao',
          cursor: 'c1',
        },
      },
    });
  });

  it('sem filtro marcado, não manda o parâmetro', async () => {
    const { api, GET } = apiFalsa({ data: { itens: [], proximo_cursor: null } });
    await listarFila(api, { status: [], categorias: [] });
    expect(GET.mock.calls[0]?.[1]).toEqual({ params: { query: {} } });
  });

  it('sem conexão, devolve a mensagem em vez de lançar', async () => {
    const GET = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const resultado = await listarFila({ GET } as unknown as Api, {
      status: [],
      categorias: [],
    });
    expect(resultado.tipo).toBe('ERRO');
  });
});

describe('obterDetalhe', () => {
  it('uma ocorrência de outro órgão mostra a mensagem da API', async () => {
    const { api } = apiFalsa({
      error: { codigo: 'OUTRO_ORGAO', mensagem: 'Esta ocorrência é de outro órgão.', detalhes: {} },
    });
    expect(await obterDetalhe(api, ID)).toEqual({
      tipo: 'ERRO',
      mensagem: 'Esta ocorrência é de outro órgão.',
    });
  });
});

describe('transicionar', () => {
  it('manda o status que a tela mostrava e a resposta oficial como comentário', async () => {
    const { api, POST } = apiFalsa({
      data: { status: 'RESOLVIDA', triada_em: null, resolvida_em: null },
    });

    const resultado = await transicionar(api, ID, {
      de: 'EM_EXECUCAO',
      para: 'RESOLVIDA',
      valor: '  Buraco tapado.  ',
    });

    expect(resultado).toEqual({ tipo: 'OK', status: 'RESOLVIDA' });
    expect(POST).toHaveBeenCalledWith('/api/v1/atendimento/ocorrencias/{id}/transicoes', {
      params: { path: { id: ID } },
      body: {
        status_esperado: 'EM_EXECUCAO',
        para_status: 'RESOLVIDA',
        comentario: 'Buraco tapado.',
      },
    });
  });

  it('o protocolo da duplicada vai em protocolo_original, em maiúsculas', async () => {
    const { api, POST } = apiFalsa({
      data: { status: 'DUPLICADA', triada_em: null, resolvida_em: null },
    });
    await transicionar(api, ID, { de: 'RECEBIDA', para: 'DUPLICADA', valor: 'fa-2026-sor-000101' });
    expect((POST.mock.calls[0]?.[1] as { body: unknown }).body).toEqual({
      status_esperado: 'RECEBIDA',
      para_status: 'DUPLICADA',
      protocolo_original: 'FA-2026-SOR-000101',
    });
  });

  it('uma ação sem dado não manda comentário', async () => {
    const { api, POST } = apiFalsa({
      data: { status: 'EM_ANALISE', triada_em: null, resolvida_em: null },
    });
    await transicionar(api, ID, { de: 'RECEBIDA', para: 'EM_ANALISE' });
    expect((POST.mock.calls[0]?.[1] as { body: unknown }).body).toEqual({
      status_esperado: 'RECEBIDA',
      para_status: 'EM_ANALISE',
    });
  });

  it('o 409 de status mudado vira CONFLITO, para a tela recarregar', async () => {
    const { api } = apiFalsa({
      error: {
        codigo: 'CONFLITO_STATUS',
        mensagem: 'O status mudou.',
        detalhes: { status_atual: 'EM_ANALISE' },
      },
    });
    expect(await transicionar(api, ID, { de: 'RECEBIDA', para: 'EM_ANALISE' })).toEqual({
      tipo: 'CONFLITO',
    });
  });

  it('as recusas da API chegam com o código e a mensagem', async () => {
    const { api } = apiFalsa({
      error: {
        codigo: 'ORIGINAL_INVALIDA',
        mensagem: 'Não existe ocorrência com esse protocolo.',
        detalhes: {},
      },
    });
    expect(
      await transicionar(api, ID, {
        de: 'RECEBIDA',
        para: 'DUPLICADA',
        valor: 'FA-2026-SOR-999999',
      }),
    ).toEqual({
      tipo: 'ERRO',
      codigo: 'ORIGINAL_INVALIDA',
      mensagem: 'Não existe ocorrência com esse protocolo.',
    });
  });
});
