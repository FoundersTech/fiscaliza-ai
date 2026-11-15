import { describe, expect, it, vi } from 'vitest';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import type { FilaNotificacoes } from '../../notificacoes/application/fila-notificacoes.js';
import type { DadosOcorrencia, StatusOcorrencia } from '../domain/ocorrencia.js';
import type { RepositorioOcorrencias } from './portas.js';
import { TransicionarStatus } from './transicionar-status.js';

const ID = '7f9c2b1e-0c1d-4b8a-9a43-1f5e8f0e2a10';
const ORGAO = 7;
const agora = new Date('2026-11-14T15:00:00Z');

function dados(status: StatusOcorrencia): DadosOcorrencia {
  return {
    id: ID,
    municipioId: 3552205,
    autorId: 'autor',
    status,
    criadaEm: new Date('2026-11-10T12:00:00Z'),
    triadaEm: null,
    resolvidaEm: null,
    duplicadaDeId: null,
    reaberturas: 0,
  };
}

function montar(status: StatusOcorrencia = 'RECEBIDA', eventoId: number | null = 41) {
  const repositorio = {
    carregarComOrgao: vi
      .fn<RepositorioOcorrencias['carregarComOrgao']>()
      .mockResolvedValue({ dados: dados(status), orgaoId: ORGAO }),
    carregar: vi.fn<RepositorioOcorrencias['carregar']>().mockResolvedValue(dados('RECUSADA')),
    originalPorProtocolo: vi
      .fn<RepositorioOcorrencias['originalPorProtocolo']>()
      .mockResolvedValue(null),
    gravarTransicao: vi.fn<RepositorioOcorrencias['gravarTransicao']>().mockResolvedValue(eventoId),
  };
  const fila = { eventoGravado: vi.fn<FilaNotificacoes['eventoGravado']>().mockResolvedValue() };
  const caso = new TransicionarStatus(
    repositorio as unknown as RepositorioOcorrencias,
    fila as unknown as FilaNotificacoes,
  );
  return { caso, repositorio, fila };
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroAplicacao> {
  const erro = await promessa.then(
    () => null,
    (falha: unknown) => falha,
  );
  expect(erro).toBeInstanceOf(ErroAplicacao);
  return erro as ErroAplicacao;
}

const agente = { usuarioId: 'agente', orgaoId: ORGAO };

describe('TransicionarStatus', () => {
  it('grava o estado novo com o status esperado e enfileira o aviso do evento', async () => {
    const { caso, repositorio, fila } = montar();
    const resultado = await caso.executar(
      { ocorrenciaId: ID, agente, statusEsperado: 'RECEBIDA', paraStatus: 'EM_ANALISE' },
      agora,
    );

    expect(resultado.estado).toMatchObject({ status: 'EM_ANALISE', triadaEm: agora });
    expect(repositorio.gravarTransicao).toHaveBeenCalledWith(
      expect.objectContaining({ statusEsperado: 'RECEBIDA', agenteId: 'agente', orgaoId: ORGAO }),
    );
    expect(fila.eventoGravado).toHaveBeenCalledWith({ eventoId: 41, ocorrenciaId: ID });
  });

  it('se outra pessoa mudou o status antes da gravação, 409 com o status atual e sem aviso', async () => {
    const { caso, fila } = montar('RECEBIDA', null);
    const erro = await erroDe(
      caso.executar(
        { ocorrenciaId: ID, agente, statusEsperado: 'RECEBIDA', paraStatus: 'EM_ANALISE' },
        agora,
      ),
    );
    expect(erro).toMatchObject({
      codigo: 'CONFLITO_STATUS',
      status: 409,
      detalhes: { status_atual: 'RECUSADA' },
    });
    expect(fila.eventoGravado).not.toHaveBeenCalled();
  });

  it('agente sem órgão ou de outro órgão recebe 403 OUTRO_ORGAO', async () => {
    for (const orgaoId of [null, ORGAO + 1]) {
      const { caso, repositorio } = montar();
      const erro = await erroDe(
        caso.executar(
          {
            ocorrenciaId: ID,
            agente: { usuarioId: 'agente', orgaoId },
            statusEsperado: 'RECEBIDA',
            paraStatus: 'EM_ANALISE',
          },
          agora,
        ),
      );
      expect(erro).toMatchObject({ codigo: 'OUTRO_ORGAO', status: 403 });
      expect(repositorio.gravarTransicao).not.toHaveBeenCalled();
    }
  });

  it('protocolo que não existe vira 422 ORIGINAL_INVALIDA com mensagem própria', async () => {
    const { caso, repositorio } = montar();
    const erro = await erroDe(
      caso.executar(
        {
          ocorrenciaId: ID,
          agente,
          statusEsperado: 'RECEBIDA',
          paraStatus: 'DUPLICADA',
          protocoloOriginal: ' FA-2026-SOR-999999 ',
        },
        agora,
      ),
    );
    expect(repositorio.originalPorProtocolo).toHaveBeenCalledWith('FA-2026-SOR-999999');
    expect(erro).toMatchObject({ codigo: 'ORIGINAL_INVALIDA', status: 422 });
    expect(erro.message).toBe('Nenhuma ocorrência tem o protocolo informado.');
  });

  it('o protocolo só é buscado quando o destino é DUPLICADA', async () => {
    const { caso, repositorio } = montar();
    await caso.executar(
      {
        ocorrenciaId: ID,
        agente,
        statusEsperado: 'RECEBIDA',
        paraStatus: 'EM_ANALISE',
        protocoloOriginal: 'FA-2026-SOR-000001',
      },
      agora,
    );
    expect(repositorio.originalPorProtocolo).not.toHaveBeenCalled();
  });
});
