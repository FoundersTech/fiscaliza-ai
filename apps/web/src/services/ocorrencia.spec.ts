import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import {
  aplicarConfirmacao,
  atributosLegiveis,
  buscarDetalhe,
  buscarMinhas,
  compartilhar,
  type Detalhe,
  estadoTambemVi,
  MINHAS_POR_PAGINA,
  montarLinhaDoTempo,
} from './ocorrencia';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';

function detalhe(mudancas: Partial<Detalhe> = {}): Detalhe {
  return {
    id: ID,
    protocolo: 'FA-2026-SOR-000123',
    categoria: { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb' },
    resumo: 'Poste apagado na esquina',
    endereco: 'Rua Quinze de Novembro, 482 · Centro',
    confirmacoes: 4,
    urgente: false,
    dias_em_aberto: 3,
    miniatura_url: null,
    foto_em_analise: false,
    criada_em: '2026-11-10T12:00:00.000Z',
    status_publico: 'RECEBIDO',
    justificativa_recusa: null,
    original: null,
    descricao: 'Poste apagado na esquina há uma semana',
    atributos: {},
    fotos: [],
    linha_do_tempo: [{ etapa: 'RECEBIDO', data: '2026-11-10T12:00:00.000Z' }],
    respostas: [],
    reaberturas: [],
    ...mudancas,
  };
}

type Resposta = { data?: unknown; error?: unknown; response?: { status: number } };

function apiGet(resposta: Resposta | Error) {
  const GET = vi.fn(() =>
    resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta),
  );
  return { api: { GET } as unknown as Api, GET };
}

describe('buscarDetalhe', () => {
  it('devolve o detalhe pelo id', async () => {
    const { api, GET } = apiGet({ data: detalhe(), response: { status: 200 } });
    await expect(buscarDetalhe(api, ID)).resolves.toEqual({ tipo: 'OK', detalhe: detalhe() });
    expect(GET).toHaveBeenCalledWith('/api/v1/ocorrencias/{id}', { params: { path: { id: ID } } });
  });

  it('404 vira "não encontrada" (inclusive a recusada de outra pessoa)', async () => {
    const { api } = apiGet({
      error: { codigo: 'NAO_ENCONTRADA', mensagem: 'Ocorrência não encontrada.', detalhes: {} },
      response: { status: 404 },
    });
    await expect(buscarDetalhe(api, ID)).resolves.toEqual({ tipo: 'NAO_ENCONTRADA' });
  });

  it('sem conexão, avisa sem lançar', async () => {
    const { api } = apiGet(new TypeError('Failed to fetch'));
    await expect(buscarDetalhe(api, ID)).resolves.toEqual({
      tipo: 'ERRO',
      mensagem: MENSAGEM_SEM_CONEXAO,
    });
  });
});

describe('estadoTambemVi', () => {
  it('visitante vê o botão, que leva ao login', () => {
    expect(estadoTambemVi(detalhe(), false)).toBe('ENTRAR');
  });

  it('cidadão que pode confirmar vê "Também vi"', () => {
    expect(estadoTambemVi(detalhe({ pode_confirmar: true, minha_confirmacao: false }), true)).toBe(
      'CONFIRMAR',
    );
  });

  it('quem já confirmou vê "Você confirmou", mesmo depois de resolvida', () => {
    expect(estadoTambemVi(detalhe({ minha_confirmacao: true, pode_confirmar: false }), true)).toBe(
      'CONFIRMADO',
    );
    expect(
      estadoTambemVi(
        detalhe({ status_publico: 'RESOLVIDO', minha_confirmacao: true, pode_confirmar: false }),
        true,
      ),
    ).toBe('CONFIRMADO');
  });

  it('o autor não vê o botão', () => {
    // A API manda pode_confirmar false para o autor de uma ocorrência aberta.
    expect(estadoTambemVi(detalhe({ pode_confirmar: false, minha_confirmacao: false }), true)).toBe(
      'OCULTO',
    );
  });

  it('ocorrência fechada não mostra o botão, nem para o visitante', () => {
    expect(estadoTambemVi(detalhe({ status_publico: 'RESOLVIDO' }), false)).toBe('OCULTO');
    expect(estadoTambemVi(detalhe({ status_publico: 'RECUSADO' }), true)).toBe('OCULTO');
  });
});

describe('aplicarConfirmacao', () => {
  const podeConfirmar = detalhe({ pode_confirmar: true, minha_confirmacao: false });

  it('depois de confirmar, vira "Você confirmou" e o contador sobe 1', () => {
    const { detalhe: depois, mensagem } = aplicarConfirmacao(
      podeConfirmar,
      { tipo: 'CONFIRMADA', confirmacoes: 5 },
      10,
    );
    expect(depois.confirmacoes).toBe(podeConfirmar.confirmacoes + 1);
    expect(estadoTambemVi(depois, true)).toBe('CONFIRMADO');
    expect(depois.urgente).toBe(false);
    expect(mensagem).toBeNull();
  });

  it('a confirmação que atinge o limiar mostra o selo URGENTE', () => {
    const { detalhe: depois } = aplicarConfirmacao(
      detalhe({ confirmacoes: 9, pode_confirmar: true }),
      { tipo: 'CONFIRMADA', confirmacoes: 10 },
      10,
    );
    expect(depois.urgente).toBe(true);
  });

  it('se já tinha confirmado, mostra "Você confirmou" sem mexer no contador', () => {
    const { detalhe: depois } = aplicarConfirmacao(podeConfirmar, { tipo: 'JA_CONFIRMADA' }, 10);
    expect(depois.confirmacoes).toBe(4);
    expect(estadoTambemVi(depois, true)).toBe('CONFIRMADO');
  });

  it('um erro deixa o detalhe como estava e devolve a mensagem', () => {
    const resultado = aplicarConfirmacao(
      podeConfirmar,
      { tipo: 'ERRO', mensagem: 'Só uma ocorrência aberta pode ser confirmada.' },
      10,
    );
    expect(resultado.detalhe).toBe(podeConfirmar);
    expect(resultado.mensagem).toBe('Só uma ocorrência aberta pode ser confirmada.');
  });
});

describe('montarLinhaDoTempo', () => {
  it('recebida: a primeira etapa com data e as outras duas ainda por vir', () => {
    expect(montarLinhaDoTempo(detalhe())).toEqual([
      {
        etapa: 'RECEBIDO',
        rotulo: 'Recebido',
        data: '2026-11-10T12:00:00.000Z',
        observacao: null,
      },
      { etapa: 'EM_ANDAMENTO', rotulo: 'Em andamento', data: null, observacao: null },
      { etapa: 'RESOLVIDO', rotulo: 'Resolvido', data: null, observacao: null },
    ]);
  });

  it('reaberta: a reabertura entra com a data e a justificativa, e falta resolver de novo', () => {
    const passos = montarLinhaDoTempo(
      detalhe({
        status_publico: 'EM_ANDAMENTO',
        linha_do_tempo: [
          { etapa: 'RECEBIDO', data: '2026-11-01T12:00:00.000Z' },
          { etapa: 'EM_ANDAMENTO', data: '2026-11-02T12:00:00.000Z' },
          { etapa: 'RESOLVIDO', data: '2026-11-05T12:00:00.000Z' },
          { etapa: 'REABERTO', data: '2026-11-07T12:00:00.000Z' },
        ],
        reaberturas: [
          { justificativa: 'O poste continua apagado', data: '2026-11-07T12:00:00.000Z' },
        ],
      }),
    );
    expect(passos.map((p) => [p.etapa, p.data !== null])).toEqual([
      ['RECEBIDO', true],
      ['EM_ANDAMENTO', true],
      ['RESOLVIDO', true],
      ['REABERTO', true],
      ['RESOLVIDO', false],
    ]);
    expect(passos[3]?.observacao).toBe('O poste continua apagado');
  });

  it('recusada termina na recusa, sem etapas por vir', () => {
    const passos = montarLinhaDoTempo(
      detalhe({
        status_publico: 'RECUSADO',
        linha_do_tempo: [
          { etapa: 'RECEBIDO', data: '2026-11-01T12:00:00.000Z' },
          { etapa: 'RECUSADO', data: '2026-11-02T12:00:00.000Z' },
        ],
      }),
    );
    expect(passos.map((p) => p.rotulo)).toEqual(['Recebido', 'Recusado pela prefeitura']);
  });
});

describe('atributosLegiveis', () => {
  const campos = [
    { chave: 'numero_poste', rotulo: 'Número do poste', tipo: 'texto', obrigatorio: false },
    { chave: 'lampadas', rotulo: 'Lâmpadas apagadas', tipo: 'numero', obrigatorio: true },
  ] as const;

  it('usa o rótulo da categoria, na ordem do formulário, e pula os vazios', () => {
    expect(atributosLegiveis({ lampadas: 2, numero_poste: '', antigo: 'x' }, [...campos])).toEqual([
      { rotulo: 'Lâmpadas apagadas', valor: '2' },
      { rotulo: 'antigo', valor: 'x' },
    ]);
  });
});

describe('compartilhar', () => {
  const dados = { titulo: 'Iluminação', texto: 'Poste apagado', url: 'https://app.test/o/1' };

  it('abre o compartilhamento nativo quando existe', async () => {
    const share = vi.fn(() => Promise.resolve());
    await expect(compartilhar(dados, { share })).resolves.toBe('COMPARTILHADO');
    expect(share).toHaveBeenCalledWith({
      title: 'Iluminação',
      text: 'Poste apagado',
      url: 'https://app.test/o/1',
    });
  });

  it('fechar a folha de compartilhamento não copia nada', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('cancelado', 'AbortError')));
    const writeText = vi.fn(() => Promise.resolve());
    const resultado = await compartilhar(dados, {
      share,
      clipboard: { writeText } as unknown as Clipboard,
    });
    expect(resultado).toBe('CANCELADO');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('sem compartilhamento nativo, copia o link', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const resultado = await compartilhar(dados, {
      clipboard: { writeText } as unknown as Clipboard,
    });
    expect(resultado).toBe('COPIADO');
    expect(writeText).toHaveBeenCalledWith('https://app.test/o/1');
  });

  it('sem nenhum dos dois, avisa para copiar à mão', async () => {
    await expect(compartilhar(dados, {})).resolves.toBe('INDISPONIVEL');
  });
});

describe('buscarMinhas', () => {
  it('pede a página pelo cursor e devolve o próximo', async () => {
    const { api, GET } = apiGet({ data: { itens: [], proximo_cursor: 'c2' } });
    await expect(buscarMinhas(api, 'c1')).resolves.toEqual({
      tipo: 'OK',
      itens: [],
      proximoCursor: 'c2',
    });
    expect(GET).toHaveBeenCalledWith('/api/v1/me/ocorrencias', {
      params: { query: { limite: MINHAS_POR_PAGINA, cursor: 'c1' } },
    });
  });

  it('a primeira página vai sem cursor', async () => {
    const { api, GET } = apiGet({ data: { itens: [], proximo_cursor: null } });
    await buscarMinhas(api, null);
    expect(GET).toHaveBeenCalledWith('/api/v1/me/ocorrencias', {
      params: { query: { limite: MINHAS_POR_PAGINA } },
    });
  });
});
