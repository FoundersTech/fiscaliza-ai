import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import { type Detalhe, montarLinhaDoTempo } from './ocorrencia';
import {
  aplicarAvaliacao,
  avaliarOcorrencia,
  estaReaberta,
  prazoVigente,
  problemaDaJustificativa,
  problemasDaAvaliacao,
  reabrirOcorrencia,
  textoDoPrazo,
} from './pos-resolucao';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';

function detalhe(mudancas: Partial<Detalhe> = {}): Detalhe {
  return {
    id: ID,
    protocolo: 'FA-2026-SOR-000123',
    categoria: { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb' },
    resumo: 'Poste apagado',
    endereco: 'Rua A, 10 · Centro',
    confirmacoes: 2,
    urgente: false,
    dias_em_aberto: 4,
    miniatura_url: null,
    foto_em_analise: false,
    criada_em: '2026-11-01T12:00:00.000Z',
    status_publico: 'RESOLVIDO',
    justificativa_recusa: null,
    original: null,
    descricao: 'Poste apagado há dias',
    atributos: {},
    fotos: [],
    linha_do_tempo: [
      { etapa: 'RECEBIDO', data: '2026-11-01T12:00:00.000Z' },
      { etapa: 'EM_ANDAMENTO', data: '2026-11-02T12:00:00.000Z' },
      { etapa: 'RESOLVIDO', data: '2026-11-05T12:00:00.000Z' },
    ],
    respostas: [],
    reaberturas: [],
    pode_avaliar: true,
    pode_reabrir: true,
    prazo_pos_resolucao_ate: '2026-11-15T12:00:00.000Z',
    ...mudancas,
  };
}

describe('validação da avaliação e da reabertura', () => {
  it('exige nota inteira de 1 a 5 e comentário de até 500 caracteres', () => {
    expect(problemasDaAvaliacao({ nota: null, comentario: '' }).nota).toBeTruthy();
    expect(problemasDaAvaliacao({ nota: 0, comentario: '' }).nota).toBeTruthy();
    expect(problemasDaAvaliacao({ nota: 6, comentario: '' }).nota).toBeTruthy();
    expect(problemasDaAvaliacao({ nota: 3.5, comentario: '' }).nota).toBeTruthy();
    expect(problemasDaAvaliacao({ nota: 4, comentario: 'a'.repeat(501) }).comentario).toBeTruthy();
    expect(problemasDaAvaliacao({ nota: 5, comentario: `  ${'a'.repeat(500)}  ` })).toEqual({});
  });

  it('exige justificativa de 10 a 500 caracteres ao reabrir', () => {
    expect(problemaDaJustificativa('   curta   ')).toBeTruthy();
    expect(problemaDaJustificativa('a'.repeat(501))).toBeTruthy();
    expect(problemaDaJustificativa('Ainda está apagado à noite')).toBeNull();
  });
});

describe('avaliarOcorrencia', () => {
  it('envia nota e comentário aparado (omitindo quando vazio)', async () => {
    const POST = vi.fn(() => Promise.resolve({ data: { nota: 5, comentario: null } }));
    const api = { POST } as unknown as Api;

    await expect(avaliarOcorrencia(api, ID, { nota: 5, comentario: '   ' })).resolves.toEqual({
      tipo: 'AVALIADA',
    });
    expect(POST).toHaveBeenCalledWith('/api/v1/ocorrencias/{id}/avaliacoes', {
      params: { path: { id: ID } },
      body: { nota: 5 },
    });

    await avaliarOcorrencia(api, ID, { nota: 4, comentario: '  Bom atendimento  ' });
    expect(POST).toHaveBeenLastCalledWith('/api/v1/ocorrencias/{id}/avaliacoes', {
      params: { path: { id: ID } },
      body: { nota: 4, comentario: 'Bom atendimento' },
    });
  });

  it('trata JA_AVALIADA e sinaliza recarregamento quando a tela ficou desatualizada', async () => {
    const apiJa = {
      POST: vi.fn(() =>
        Promise.resolve({
          error: { codigo: 'JA_AVALIADA', mensagem: 'Já avaliou.', detalhes: {} },
        }),
      ),
    } as unknown as Api;
    await expect(avaliarOcorrencia(apiJa, ID, { nota: 5 })).resolves.toEqual({
      tipo: 'JA_AVALIADA',
    });

    for (const codigo of ['FORA_DO_PRAZO', 'NAO_RESOLVIDA', 'SEM_VINCULO']) {
      const apiErro = {
        POST: vi.fn(() => Promise.resolve({ error: { codigo, mensagem: 'Erro', detalhes: {} } })),
      } as unknown as Api;
      await expect(avaliarOcorrencia(apiErro, ID, { nota: 5 })).resolves.toMatchObject({
        tipo: 'ERRO',
        codigo,
        recarregar: true,
      });
    }

    const apiOffline = {
      POST: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    } as unknown as Api;
    await expect(avaliarOcorrencia(apiOffline, ID, { nota: 5 })).resolves.toMatchObject({
      tipo: 'ERRO',
      mensagem: MENSAGEM_SEM_CONEXAO,
      recarregar: false,
    });
  });
});

describe('reabrirOcorrencia', () => {
  it('envia justificativa aparada e trata sucesso ou conflito', async () => {
    const POST = vi.fn(() => Promise.resolve({ data: { status: 'EM_ANALISE', reaberturas: 1 } }));
    const api = { POST } as unknown as Api;

    await expect(reabrirOcorrencia(api, ID, '  O poste voltou a apagar  ')).resolves.toEqual({
      tipo: 'REABERTA',
    });
    expect(POST).toHaveBeenCalledWith('/api/v1/ocorrencias/{id}/reabertura', {
      params: { path: { id: ID } },
      body: { justificativa: 'O poste voltou a apagar' },
    });

    const apiConflito = {
      POST: vi.fn(() =>
        Promise.resolve({
          error: { codigo: 'CONFLITO_STATUS', mensagem: 'Mudou', detalhes: {} },
        }),
      ),
    } as unknown as Api;
    await expect(reabrirOcorrencia(apiConflito, ID, 'Ainda sem luz')).resolves.toMatchObject({
      tipo: 'ERRO',
      codigo: 'CONFLITO_STATUS',
      recarregar: true,
    });
  });
});

describe('estado da tela depois da resolução', () => {
  it('aplicarAvaliacao oculta o botão de avaliar', () => {
    const atualizado = aplicarAvaliacao(detalhe());
    expect(atualizado.pode_avaliar).toBe(false);
    expect(atualizado.pode_reabrir).toBe(true);
  });

  it('mostra o prazo enquanto vigente e oculta depois de vencido', () => {
    const prazo = '2026-11-15T12:00:00.000Z';
    expect(prazoVigente(prazo, new Date('2026-11-15T11:59:59.000Z'))).toBe(true);
    expect(textoDoPrazo(prazo, new Date('2026-11-15T11:59:59.000Z'))).toMatch(/^Disponível até /);
    expect(prazoVigente(prazo, new Date('2026-11-15T12:00:01.000Z'))).toBe(false);
    expect(textoDoPrazo(prazo, new Date('2026-11-15T12:00:01.000Z'))).toBeNull();
  });

  it('exibe reabertura na linha do tempo com a justificativa e selo Reaberta enquanto em andamento', () => {
    const reaberta = detalhe({
      status_publico: 'EM_ANDAMENTO',
      pode_avaliar: false,
      pode_reabrir: false,
      linha_do_tempo: [
        { etapa: 'RECEBIDO', data: '2026-11-01T12:00:00.000Z' },
        { etapa: 'EM_ANDAMENTO', data: '2026-11-02T12:00:00.000Z' },
        { etapa: 'RESOLVIDO', data: '2026-11-05T12:00:00.000Z' },
        { etapa: 'REABERTO', data: '2026-11-06T10:00:00.000Z' },
      ],
      reaberturas: [{ justificativa: 'Voltou a piscar à noite', data: '2026-11-06T10:00:00.000Z' }],
    });

    expect(estaReaberta(reaberta)).toBe(true);
    expect(
      estaReaberta(
        detalhe({ reaberturas: [{ justificativa: 'Antes', data: '2026-11-06T10:00:00.000Z' }] }),
      ),
    ).toBe(false);

    const passos = montarLinhaDoTempo(reaberta);
    const passoReaberto = passos.find((p) => p.etapa === 'REABERTO');
    expect(passoReaberto).toMatchObject({
      rotulo: 'Reaberto: não foi resolvido',
      observacao: 'Voltou a piscar à noite',
    });
    expect(passos.at(-1)).toMatchObject({ etapa: 'RESOLVIDO', data: null });
  });
});
