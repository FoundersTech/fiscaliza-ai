import { describe, expect, it, vi } from 'vitest';

import type { Parametros } from '../../../shared/config/parametros.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import type { FilaNotificacoes } from '../../notificacoes/application/fila-notificacoes.js';
import type { DadosOcorrencia, StatusOcorrencia } from '../domain/ocorrencia.js';
import type { ConsultasOcorrencias, VinculoGravado } from './consultas.js';
import type { RepositorioOcorrencias } from './portas.js';
import { AvaliarAtendimento, ReabrirOcorrencia } from './pos-resolucao.js';

const ID = '7f9c2b1e-0c1d-4b8a-9a43-1f5e8f0e2a10';
const UM_DIA = 24 * 60 * 60 * 1000;
const RESOLVIDA_EM = new Date('2026-11-04T12:00:00Z');
const agora = new Date(RESOLVIDA_EM.getTime() + 3 * UM_DIA);
const parametros = { janela_pos_resolucao_dias: 10 } as Parametros;

function dados(status: StatusOcorrencia = 'RESOLVIDA'): DadosOcorrencia {
  return {
    id: ID,
    municipioId: 3552205,
    autorId: 'autor',
    status,
    criadaEm: new Date('2026-10-20T12:00:00Z'),
    triadaEm: new Date('2026-10-21T12:00:00Z'),
    resolvidaEm: status === 'RESOLVIDA' ? RESOLVIDA_EM : null,
    duplicadaDeId: null,
    reaberturas: 0,
  };
}

interface Cenario {
  status?: StatusOcorrencia;
  vinculo?: VinculoGravado;
  eventoId?: number | null;
  gravouAvaliacao?: boolean;
}

function montar({
  status = 'RESOLVIDA',
  vinculo = { confirmou: false, avaliou: false },
  eventoId = 51,
  gravouAvaliacao = true,
}: Cenario = {}) {
  const repositorio = {
    carregar: vi.fn<RepositorioOcorrencias['carregar']>().mockResolvedValue(dados(status)),
    gravarReabertura: vi
      .fn<RepositorioOcorrencias['gravarReabertura']>()
      .mockResolvedValue(eventoId),
    avaliar: vi.fn<RepositorioOcorrencias['avaliar']>().mockResolvedValue(gravouAvaliacao),
  };
  const consultas = {
    vinculo: vi.fn<ConsultasOcorrencias['vinculo']>().mockResolvedValue(vinculo),
  };
  const fila = { eventoGravado: vi.fn<FilaNotificacoes['eventoGravado']>().mockResolvedValue() };
  const repo = repositorio as unknown as RepositorioOcorrencias;
  const cons = consultas as unknown as ConsultasOcorrencias;
  return {
    avaliar: new AvaliarAtendimento(repo, cons, parametros),
    reabrir: new ReabrirOcorrencia(repo, cons, parametros, fila as unknown as FilaNotificacoes),
    repositorio,
    fila,
  };
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroAplicacao> {
  const erro = await promessa.then(
    () => null,
    (falha: unknown) => falha,
  );
  expect(erro).toBeInstanceOf(ErroAplicacao);
  return erro as ErroAplicacao;
}

const avaliacao = { ocorrenciaId: ID, usuarioId: 'autor', nota: 4, comentario: '  Rápido.  ' };
const reabertura = { ocorrenciaId: ID, usuarioId: 'autor', justificativa: 'Continua apagado.' };

describe('AvaliarAtendimento', () => {
  it('grava a nota com o comentário aparado', async () => {
    const { avaliar, repositorio } = montar();
    await avaliar.executar(avaliacao, agora);
    expect(repositorio.avaliar).toHaveBeenCalledWith({
      ocorrenciaId: ID,
      usuarioId: 'autor',
      nota: 4,
      comentario: 'Rápido.',
      criadaEm: agora,
    });
  });

  it('sem vínculo é 403; fora do prazo e não resolvida, 422', async () => {
    const semVinculo = montar();
    const erro = await erroDe(
      semVinculo.avaliar.executar({ ...avaliacao, usuarioId: 'vizinho' }, agora),
    );
    expect([erro.codigo, erro.status]).toEqual(['SEM_VINCULO', 403]);

    const depois = new Date(RESOLVIDA_EM.getTime() + 11 * UM_DIA);
    const tarde = await erroDe(montar().avaliar.executar(avaliacao, depois));
    expect([tarde.codigo, tarde.status]).toEqual(['FORA_DO_PRAZO', 422]);

    const aberta = await erroDe(montar({ status: 'EM_EXECUCAO' }).avaliar.executar(avaliacao));
    expect([aberta.codigo, aberta.status]).toEqual(['NAO_RESOLVIDA', 422]);
  });

  it('quem já avaliou recebe 409, também quando duas chegam juntas', async () => {
    const jaAvaliou = montar({ vinculo: { confirmou: false, avaliou: true } });
    expect((await erroDe(jaAvaliou.avaliar.executar(avaliacao, agora))).status).toBe(409);
    expect(jaAvaliou.repositorio.avaliar).not.toHaveBeenCalled();

    const corrida = montar({ gravouAvaliacao: false });
    expect((await erroDe(corrida.avaliar.executar(avaliacao, agora))).codigo).toBe('JA_AVALIADA');
  });

  it('recusada de outra pessoa não existe para quem pergunta', async () => {
    const { avaliar } = montar({ status: 'RECUSADA' });
    const erro = await erroDe(avaliar.executar({ ...avaliacao, usuarioId: 'vizinho' }, agora));
    expect(erro.status).toBe(404);
  });
});

describe('ReabrirOcorrencia', () => {
  it('grava o estado novo com quem reabriu e enfileira o aviso do evento', async () => {
    const { reabrir, repositorio, fila } = montar({
      vinculo: { confirmou: true, avaliou: false },
    });
    const resultado = await reabrir.executar({ ...reabertura, usuarioId: 'vizinho' }, agora);

    expect(resultado.estado).toMatchObject({
      status: 'EM_ANALISE',
      resolvidaEm: null,
      reaberturas: 1,
    });
    expect(repositorio.gravarReabertura).toHaveBeenCalledWith({
      estado: resultado.estado,
      evento: {
        deStatus: 'RESOLVIDA',
        paraStatus: 'EM_ANALISE',
        comentario: 'Continua apagado.',
        criadoEm: agora,
      },
      usuarioId: 'vizinho',
    });
    expect(fila.eventoGravado).toHaveBeenCalledWith({ eventoId: 51, ocorrenciaId: ID });
  });

  it('se o órgão mudou o status no meio do caminho, 409 e nenhum aviso', async () => {
    const { reabrir, repositorio, fila } = montar({ eventoId: null });
    repositorio.carregar
      .mockResolvedValueOnce(dados('RESOLVIDA'))
      .mockResolvedValueOnce(dados('EM_ANALISE'));

    const erro = await erroDe(reabrir.executar(reabertura, agora));
    expect([erro.codigo, erro.status, erro.detalhes]).toEqual([
      'CONFLITO_STATUS',
      409,
      { status_atual: 'EM_ANALISE' },
    ]);
    expect(fila.eventoGravado).not.toHaveBeenCalled();
  });

  it('sem vínculo é 403 e nada é gravado', async () => {
    const { reabrir, repositorio } = montar();
    const erro = await erroDe(reabrir.executar({ ...reabertura, usuarioId: 'vizinho' }, agora));
    expect([erro.codigo, erro.status]).toEqual(['SEM_VINCULO', 403]);
    expect(repositorio.gravarReabertura).not.toHaveBeenCalled();
  });
});
