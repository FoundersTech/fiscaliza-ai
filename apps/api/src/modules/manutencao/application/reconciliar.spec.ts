import { describe, expect, it, vi } from 'vitest';

import type { ReconciliarFotos } from '../../midia/application/reconciliar-fotos.js';
import type { ReconciliarEnderecos } from '../../ocorrencias/application/enderecos.js';
import { Reconciliar } from './reconciliar.js';

describe('Reconciliar', () => {
  it('confere fotos e endereços parados há mais de 10 min', async () => {
    const fotos = { executar: vi.fn<ReconciliarFotos['executar']>().mockResolvedValue(1) };
    const enderecos = { executar: vi.fn<ReconciliarEnderecos['executar']>().mockResolvedValue(0) };
    const reconciliar = new Reconciliar(
      fotos as unknown as ReconciliarFotos,
      enderecos as unknown as ReconciliarEnderecos,
    );

    await reconciliar.executar(new Date('2026-11-03T12:00:00.000Z'));

    const limite = new Date('2026-11-03T11:50:00.000Z');
    expect(fotos.executar).toHaveBeenCalledWith(limite);
    expect(enderecos.executar).toHaveBeenCalledWith(limite);
  });
});
