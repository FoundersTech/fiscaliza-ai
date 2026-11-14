import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import {
  FilaNotificacoes,
  JOB_EVENTO,
  type JobNotificacaoEvento,
  TENTATIVAS_NOTIFICACAO,
} from './fila-notificacoes.js';

function montar(add: Queue<JobNotificacaoEvento>['add']) {
  const fila = { add: vi.fn(add) };
  return { fila, servico: new FilaNotificacoes(fila as unknown as Queue<JobNotificacaoEvento>) };
}

describe('FilaNotificacoes', () => {
  it('enfileira um job por evento, com id fixo e tentativas', async () => {
    const { fila, servico } = montar(() => Promise.resolve({} as never));
    await servico.eventoGravado({ eventoId: 12, ocorrenciaId: 'abc' });

    expect(fila.add).toHaveBeenCalledWith(
      JOB_EVENTO,
      { eventoId: 12, ocorrenciaId: 'abc' },
      expect.objectContaining({ jobId: 'evento-12', attempts: TENTATIVAS_NOTIFICACAO }),
    );
  });

  it('sem Redis, não derruba a mudança de status que já foi gravada', async () => {
    const { servico } = montar(() => Promise.reject(new Error('Redis fora do ar')));
    await expect(servico.eventoGravado({ eventoId: 12, ocorrenciaId: 'abc' })).resolves.toBe(
      undefined,
    );
  });
});
