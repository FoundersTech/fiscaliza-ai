import { describe, expect, it, vi } from 'vitest';

import { type DadosOcorrencia, StatusOcorrencia } from '../domain/ocorrencia.js';
import { ConfirmarOcorrencia } from './confirmar-ocorrencia.js';
import type { RepositorioOcorrencias } from './portas.js';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
const AUTOR = 'autor-1';
const VIZINHO = 'vizinho-1';
const AGORA = new Date('2026-11-03T12:00:00.000Z');

function montar(dados: Partial<DadosOcorrencia> | null = {}, total: number | null = 3) {
  const repositorio = {
    carregar: vi.fn<RepositorioOcorrencias['carregar']>().mockResolvedValue(
      dados && {
        id: ID,
        municipioId: 3552205,
        autorId: AUTOR,
        status: StatusOcorrencia.RECEBIDA,
        criadaEm: new Date('2026-11-01T12:00:00.000Z'),
        triadaEm: null,
        resolvidaEm: null,
        duplicadaDeId: null,
        reaberturas: 0,
        ...dados,
      },
    ),
    confirmar: vi.fn<RepositorioOcorrencias['confirmar']>().mockResolvedValue(total),
  };
  const confirmar = new ConfirmarOcorrencia(repositorio as unknown as RepositorioOcorrencias);
  return { confirmar, repositorio };
}

describe('ConfirmarOcorrencia', () => {
  it('grava a confirmação e devolve o total', async () => {
    const { confirmar, repositorio } = montar();

    await expect(confirmar.executar(ID, VIZINHO, AGORA)).resolves.toBe(3);
    expect(repositorio.confirmar).toHaveBeenCalledWith(ID, VIZINHO, AGORA);
  });

  it('a segunda confirmação da mesma pessoa é 409 JA_CONFIRMADA', async () => {
    const { confirmar } = montar({}, null);

    await expect(confirmar.executar(ID, VIZINHO, AGORA)).rejects.toMatchObject({
      codigo: 'JA_CONFIRMADA',
      status: 409,
    });
  });

  it('o autor recebe 403 AUTOR_NAO_CONFIRMA, sem gravar nada', async () => {
    const { confirmar, repositorio } = montar();

    await expect(confirmar.executar(ID, AUTOR, AGORA)).rejects.toMatchObject({
      codigo: 'AUTOR_NAO_CONFIRMA',
      status: 403,
    });
    expect(repositorio.confirmar).not.toHaveBeenCalled();
  });

  it('a resolvida é 422 OCORRENCIA_FECHADA', async () => {
    const { confirmar, repositorio } = montar({ status: StatusOcorrencia.RESOLVIDA });

    await expect(confirmar.executar(ID, VIZINHO, AGORA)).rejects.toMatchObject({
      codigo: 'OCORRENCIA_FECHADA',
      status: 422,
      detalhes: { status: 'RESOLVIDA' },
    });
    expect(repositorio.confirmar).not.toHaveBeenCalled();
  });

  it.each([
    ['não existe', null],
    ['é recusada de outra pessoa', { status: StatusOcorrencia.RECUSADA }],
    ['é duplicada de outra pessoa', { status: StatusOcorrencia.DUPLICADA }],
  ])('ocorrência que %s é 404 NAO_ENCONTRADA', async (_caso, dados) => {
    const { confirmar } = montar(dados);

    await expect(confirmar.executar(ID, VIZINHO, AGORA)).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADA',
      status: 404,
    });
  });
});
