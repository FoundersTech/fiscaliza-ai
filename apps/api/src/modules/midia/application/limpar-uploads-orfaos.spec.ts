import { describe, expect, it, vi } from 'vitest';

import { LimparUploadsOrfaos } from './limpar-uploads-orfaos.js';
import type { RepositorioFotos, StoragePort } from './portas.js';

const ANTES_DE = new Date('2026-11-13T03:00:00.000Z');

function montar(paginas: string[][], emUso: string[]) {
  const storage = {
    uploadsGravadosAntes: vi.fn<StoragePort['uploadsGravadosAntes']>(async function* () {
      for (const pagina of paginas) yield await Promise.resolve(pagina);
    }),
    apagarUpload: vi.fn<StoragePort['apagarUpload']>().mockResolvedValue(),
  };
  const fotos = {
    uploadsEmUso: vi
      .fn<RepositorioFotos['uploadsEmUso']>()
      .mockImplementation((chaves) =>
        Promise.resolve(new Set(chaves.filter((chave) => emUso.includes(chave)))),
      ),
  };
  const caso = new LimparUploadsOrfaos(
    storage as unknown as StoragePort,
    fotos as unknown as RepositorioFotos,
  );
  return { caso, storage };
}

describe('LimparUploadsOrfaos', () => {
  it('apaga só os originais antigos que nenhuma foto usa, de todas as páginas', async () => {
    const { caso, storage } = montar(
      [['ocorrencias/a/1-x.jpg', 'ocorrencias/b/1-y.jpg'], ['ocorrencias/c/2-z.jpg']],
      ['ocorrencias/b/1-y.jpg'],
    );

    expect(await caso.executar(ANTES_DE)).toBe(2);

    expect(storage.uploadsGravadosAntes).toHaveBeenCalledWith('ocorrencias/', ANTES_DE);
    expect(storage.apagarUpload.mock.calls).toEqual([
      ['ocorrencias/a/1-x.jpg'],
      ['ocorrencias/c/2-z.jpg'],
    ]);
  });

  it('sem nada antigo no bucket, não apaga nada', async () => {
    const { caso, storage } = montar([[]], []);

    expect(await caso.executar(ANTES_DE)).toBe(0);
    expect(storage.apagarUpload).not.toHaveBeenCalled();
  });
});
