import type { Job, Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { FilaFotos, type JobProcessarFoto } from './fotos-enviadas.js';

function job(falhou: boolean) {
  return {
    isFailed: vi.fn<Job['isFailed']>().mockResolvedValue(falhou),
    retry: vi.fn<Job['retry']>().mockResolvedValue(),
  };
}

function montar(jobs: Record<string, ReturnType<typeof job>> = {}) {
  const fila = {
    getJob: vi.fn((id: string) => Promise.resolve(jobs[id])),
    addBulk: vi.fn<Queue<JobProcessarFoto>['addBulk']>().mockResolvedValue([]),
  };
  return { filaFotos: new FilaFotos(fila as unknown as Queue<JobProcessarFoto>), fila };
}

describe('FilaFotos', () => {
  it('enfileira cada foto com o id do job derivado do id da foto', async () => {
    const { filaFotos, fila } = montar();

    await filaFotos.processar(['f1', 'f2']);

    const [itens] = fila.addBulk.mock.calls[0]!;
    expect(itens.map((item) => [item.data.fotoId, item.opts?.jobId, item.opts?.attempts])).toEqual([
      ['f1', 'foto-f1', 5],
      ['f2', 'foto-f2', 5],
    ]);
  });

  it('sem Redis, o registro segue e a foto fica para a reconciliação', async () => {
    const { filaFotos, fila } = montar();
    fila.addBulk.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(filaFotos.processar(['f1'])).resolves.toBeUndefined();
  });

  it('ao reenfileirar, dá nova rodada ao job que desistiu e cria o que falta', async () => {
    const desistiu = job(true);
    const naFila = job(false);
    const { filaFotos, fila } = montar({ 'foto-f1': desistiu, 'foto-f2': naFila });

    await filaFotos.reenfileirar(['f1', 'f2', 'f3']);

    expect(desistiu.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(naFila.retry).not.toHaveBeenCalled();
    const [itens] = fila.addBulk.mock.calls[0]!;
    expect(itens.map((item) => item.opts?.jobId)).toEqual(['foto-f1', 'foto-f2', 'foto-f3']);
  });

  it('na reconciliação, a falha do Redis aparece como erro do job', async () => {
    const { filaFotos, fila } = montar();
    fila.addBulk.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(filaFotos.reenfileirar(['f1'])).rejects.toThrow('ECONNREFUSED');
  });
});
