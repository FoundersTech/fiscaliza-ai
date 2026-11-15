import { describe, expect, it, vi } from 'vitest';

import { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';
import { type ConsultasAlertas, type LinhaAlerta, ListarAlertas } from './alertas.js';

const USUARIO = 'usuario-1';

function linha(eventoId: number, de: StatusOcorrencia, para: StatusOcorrencia): LinhaAlerta {
  return {
    eventoId,
    ocorrenciaId: 'ocorrencia-1',
    protocolo: 'FA-2026-SOR-000001',
    deStatus: de,
    paraStatus: para,
    criadoEm: new Date('2026-11-14T12:00:00.000Z'),
  };
}

function montar(linhas: LinhaAlerta[]) {
  const consultas = { daPessoa: vi.fn<ConsultasAlertas['daPessoa']>().mockResolvedValue(linhas) };
  const listar = new ListarAlertas(consultas as unknown as ConsultasAlertas);
  return { listar, consultas };
}

const { RECEBIDA, EM_ANALISE, EM_EXECUCAO, RESOLVIDA, RECUSADA } = StatusOcorrencia;

describe('ListarAlertas', () => {
  it('mostra o status como o cidadão enxerga e marca a reabertura', async () => {
    const { listar } = montar([
      linha(4, RESOLVIDA, EM_ANALISE),
      linha(3, EM_EXECUCAO, RESOLVIDA),
      linha(2, EM_ANALISE, EM_EXECUCAO),
      linha(1, RECEBIDA, RECUSADA),
    ]);

    const { itens } = await listar.executar({ usuarioId: USUARIO, limite: 10 });

    expect(itens.map((item) => [item.paraStatusPublico, item.reaberta])).toEqual([
      ['EM_ANDAMENTO', true],
      ['RESOLVIDO', false],
      ['EM_ANDAMENTO', false],
      ['RECUSADO', false],
    ]);
  });

  it('pede um item a mais e devolve o cursor da última da página', async () => {
    const { listar, consultas } = montar([
      linha(9, RECEBIDA, EM_ANALISE),
      linha(7, EM_ANALISE, EM_EXECUCAO),
      linha(5, EM_EXECUCAO, RESOLVIDA),
    ]);

    const pagina = await listar.executar({ usuarioId: USUARIO, limite: 2 });

    expect(consultas.daPessoa).toHaveBeenCalledWith(USUARIO, null, 3);
    expect(pagina.itens).toHaveLength(2);
    expect(pagina.proximoCursor).toBe('7');

    await listar.executar({ usuarioId: USUARIO, cursor: '7', limite: 2 });
    expect(consultas.daPessoa).toHaveBeenLastCalledWith(USUARIO, 7, 3);
  });

  it('sem próxima página, o cursor é null', async () => {
    const { listar } = montar([linha(1, RECEBIDA, EM_ANALISE)]);
    await expect(listar.executar({ usuarioId: USUARIO, limite: 2 })).resolves.toMatchObject({
      proximoCursor: null,
    });
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999999999999'])(
    'cursor inválido (%s) vira VALIDACAO',
    async (cursor) => {
      const { listar } = montar([]);
      await expect(
        listar.executar({ usuarioId: USUARIO, cursor, limite: 2 }),
      ).rejects.toMatchObject({ codigo: 'VALIDACAO', status: 422 });
    },
  );
});
