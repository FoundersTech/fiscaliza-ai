import { describe, expect, it, vi } from 'vitest';

import { FazerBackup } from './fazer-backup.js';
import type { ArmazemBackup, GeradorDump } from './portas.js';

const AGORA = new Date('2026-11-14T07:00:00.000Z');

function montar(existentes: string[]) {
  const descartar = vi.fn(() => Promise.resolve());
  const gerador = {
    gerar: vi
      .fn<GeradorDump['gerar']>()
      .mockResolvedValue({ caminho: '/tmp/dump', bytes: 1234, descartar }),
  };
  const armazem = {
    enviar: vi.fn<ArmazemBackup['enviar']>().mockResolvedValue(),
    listar: vi.fn<ArmazemBackup['listar']>().mockResolvedValue(existentes),
    apagar: vi.fn<ArmazemBackup['apagar']>().mockResolvedValue(),
  };
  return { caso: new FazerBackup(gerador, armazem), gerador, armazem, descartar };
}

describe('FazerBackup', () => {
  it('grava a cópia do dia, apaga o temporário e os backups de mais de 7 dias', async () => {
    const { caso, armazem, descartar } = montar([
      'postgres/fiscaliza-2026-11-14.dump',
      'postgres/fiscaliza-2026-11-08.dump',
      'postgres/fiscaliza-2026-11-07.dump',
    ]);

    expect(await caso.executar(AGORA)).toEqual({
      chave: 'postgres/fiscaliza-2026-11-14.dump',
      bytes: 1234,
      apagados: ['postgres/fiscaliza-2026-11-07.dump'],
    });
    expect(armazem.enviar).toHaveBeenCalledWith(
      'postgres/fiscaliza-2026-11-14.dump',
      '/tmp/dump',
      1234,
    );
    expect(armazem.apagar).toHaveBeenCalledTimes(1);
    expect(descartar).toHaveBeenCalled();
  });

  it('se o envio falha, apaga o temporário e não mexe nos backups antigos', async () => {
    const { caso, armazem, descartar } = montar(['postgres/fiscaliza-2026-11-01.dump']);
    armazem.enviar.mockRejectedValue(new Error('R2 fora do ar'));

    await expect(caso.executar(AGORA)).rejects.toThrow('R2 fora do ar');

    expect(descartar).toHaveBeenCalled();
    expect(armazem.apagar).not.toHaveBeenCalled();
  });

  it('se o pg_dump falha, nada é enviado', async () => {
    const { caso, gerador, armazem } = montar([]);
    gerador.gerar.mockRejectedValue(new Error('pg_dump terminou com código 1'));

    await expect(caso.executar(AGORA)).rejects.toThrow('pg_dump');
    expect(armazem.enviar).not.toHaveBeenCalled();
  });
});
