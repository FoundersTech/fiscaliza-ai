import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import {
  type DetalheAtendimento,
  type ItemFila,
  listarFila,
  obterDetalhe,
  type StatusInterno,
  transicionar,
} from '@/services/atendimento';

import { useAtendimentoStore } from './atendimento';

vi.mock('@/services/atendimento', async (original) => ({
  ...(await original<object>()),
  listarFila: vi.fn(),
  obterDetalhe: vi.fn(),
  transicionar: vi.fn(),
}));

const listar = vi.mocked(listarFila);
const obter = vi.mocked(obterDetalhe);
const mudar = vi.mocked(transicionar);
const API = {} as Api;
const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';

const PERMITIDAS: Record<StatusInterno, StatusInterno[]> = {
  RECEBIDA: ['EM_ANALISE', 'RECUSADA', 'DUPLICADA'],
  EM_ANALISE: ['EM_EXECUCAO', 'RECUSADA', 'DUPLICADA'],
  EM_EXECUCAO: ['RESOLVIDA'],
  RESOLVIDA: [],
  RECUSADA: [],
  DUPLICADA: [],
};

function detalhe(status: StatusInterno): DetalheAtendimento {
  return {
    id: ID,
    status,
    transicoes_permitidas: PERMITIDAS[status],
    eventos: [],
  } as unknown as DetalheAtendimento;
}

const item = (protocolo: string) => ({ protocolo }) as ItemFila;

/** Uma API em memória com a ocorrência no status dado, para seguir o fluxo inteiro. */
function servidorCom(inicial: StatusInterno) {
  let status = inicial;
  obter.mockImplementation(() => Promise.resolve({ tipo: 'OK', detalhe: detalhe(status) }));
  mudar.mockImplementation((_api, _id, pedido) => {
    if (pedido.de !== status) return Promise.resolve({ tipo: 'CONFLITO' });
    status = pedido.para;
    return Promise.resolve({ tipo: 'OK', status });
  });
  return { mudarPorFora: (novo: StatusInterno) => (status = novo) };
}

describe('store do atendimento: fila', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it('abre só com as abertas e sem filtro de categoria', async () => {
    listar.mockResolvedValue({ tipo: 'OK', itens: [], proximoCursor: null });
    const atendimento = useAtendimentoStore();

    await atendimento.carregarFila(API);

    expect(listar).toHaveBeenCalledWith(
      API,
      { status: ['RECEBIDA', 'EM_ANALISE', 'EM_EXECUCAO'], categorias: [] },
      null,
    );
  });

  it('marcar e desmarcar filtros muda a consulta', async () => {
    listar.mockResolvedValue({ tipo: 'OK', itens: [], proximoCursor: null });
    const atendimento = useAtendimentoStore();

    atendimento.alternarStatus('EM_EXECUCAO');
    atendimento.alternarStatus('RESOLVIDA');
    atendimento.alternarCategoria('iluminacao');
    await atendimento.carregarFila(API);

    expect(listar).toHaveBeenLastCalledWith(
      API,
      { status: ['RECEBIDA', 'EM_ANALISE', 'RESOLVIDA'], categorias: ['iluminacao'] },
      null,
    );
  });

  it('"carregar mais" junta a página seguinte e para na última', async () => {
    listar
      .mockResolvedValueOnce({ tipo: 'OK', itens: [item('A')], proximoCursor: 'c2' })
      .mockResolvedValueOnce({ tipo: 'OK', itens: [item('B')], proximoCursor: null });
    const atendimento = useAtendimentoStore();

    await atendimento.carregarFila(API);
    await atendimento.carregarMais(API);
    await atendimento.carregarMais(API);

    expect(atendimento.itens.map((i) => i.protocolo)).toEqual(['A', 'B']);
    expect(listar).toHaveBeenCalledTimes(2);
    expect(listar).toHaveBeenLastCalledWith(API, expect.anything(), 'c2');
  });

  it('a resposta de um filtro antigo que chega depois é descartada', async () => {
    let responderAntiga: (valor: Awaited<ReturnType<typeof listarFila>>) => void = () => {};
    listar
      .mockImplementationOnce(() => new Promise((resolver) => (responderAntiga = resolver)))
      .mockResolvedValueOnce({ tipo: 'OK', itens: [item('NOVA')], proximoCursor: null });
    const atendimento = useAtendimentoStore();

    const antiga = atendimento.carregarFila(API);
    atendimento.alternarStatus('RESOLVIDA');
    await atendimento.carregarFila(API);
    responderAntiga({ tipo: 'OK', itens: [item('ANTIGA')], proximoCursor: null });
    await antiga;

    expect(atendimento.itens.map((i) => i.protocolo)).toEqual(['NOVA']);
  });

  it('mostra o erro da consulta', async () => {
    listar.mockResolvedValue({ tipo: 'ERRO', mensagem: 'Sem conexão' });
    const atendimento = useAtendimentoStore();
    await atendimento.carregarFila(API);
    expect(atendimento.erroFila).toBe('Sem conexão');
    expect(atendimento.carregandoFila).toBe(false);
  });
});

describe('store do atendimento: detalhe e ações', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it('leva uma ocorrência de RECEBIDA até RESOLVIDA, recarregando depois de cada ação', async () => {
    servidorCom('RECEBIDA');
    const atendimento = useAtendimentoStore();
    await atendimento.abrirDetalhe(API, ID);

    await atendimento.executar(API, 'EM_ANALISE');
    expect(atendimento.detalhe?.status).toBe('EM_ANALISE');
    await atendimento.executar(API, 'EM_EXECUCAO');
    expect(atendimento.detalhe?.transicoes_permitidas).toEqual(['RESOLVIDA']);
    const resultado = await atendimento.executar(API, 'RESOLVIDA', 'Buraco tapado.');

    expect(resultado).toEqual({ tipo: 'OK', status: 'RESOLVIDA' });
    expect(atendimento.detalhe?.status).toBe('RESOLVIDA');
    expect(atendimento.detalhe?.transicoes_permitidas).toEqual([]);
    expect(mudar).toHaveBeenLastCalledWith(API, ID, {
      de: 'EM_EXECUCAO',
      para: 'RESOLVIDA',
      valor: 'Buraco tapado.',
    });
    expect(obter).toHaveBeenCalledTimes(4);
    expect(atendimento.aviso).toBeNull();
  });

  it('uma ação feita antes em outra aba avisa e recarrega com o status novo', async () => {
    const servidor = servidorCom('RECEBIDA');
    const atendimento = useAtendimentoStore();
    await atendimento.abrirDetalhe(API, ID);

    servidor.mudarPorFora('EM_ANALISE');
    const resultado = await atendimento.executar(API, 'EM_ANALISE');

    expect(resultado).toEqual({ tipo: 'CONFLITO' });
    expect(atendimento.aviso).toBe('A ocorrência mudou, recarregando');
    expect(atendimento.detalhe?.status).toBe('EM_ANALISE');
    expect(atendimento.detalhe?.transicoes_permitidas).toContain('EM_EXECUCAO');
  });

  it('uma recusa da API não recarrega e mantém o status', async () => {
    servidorCom('RECEBIDA');
    mudar.mockResolvedValue({
      tipo: 'ERRO',
      codigo: 'ORIGINAL_INVALIDA',
      mensagem: 'Não existe ocorrência com esse protocolo.',
    });
    const atendimento = useAtendimentoStore();
    await atendimento.abrirDetalhe(API, ID);

    const resultado = await atendimento.executar(API, 'DUPLICADA', 'FA-2026-SOR-999999');

    expect(resultado?.tipo).toBe('ERRO');
    expect(obter).toHaveBeenCalledTimes(1);
    expect(atendimento.detalhe?.status).toBe('RECEBIDA');
    expect(atendimento.executando).toBe(false);
  });

  it('abrir outra ocorrência limpa o detalhe e o aviso da anterior', async () => {
    const servidor = servidorCom('RECEBIDA');
    const atendimento = useAtendimentoStore();
    await atendimento.abrirDetalhe(API, ID);
    servidor.mudarPorFora('EM_ANALISE');
    await atendimento.executar(API, 'EM_ANALISE');

    obter.mockReturnValue(new Promise(() => {}));
    void atendimento.abrirDetalhe(API, 'outra');

    expect(atendimento.detalhe).toBeNull();
    expect(atendimento.aviso).toBeNull();
  });
});
