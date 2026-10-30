import imageCompression from 'browser-image-compression';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { comprimirFoto, FotoMuitoGrande, TAMANHO_MAXIMO_FOTO } from './compressao-foto';

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));

const comprimir = vi.mocked(imageCompression);

function arquivo(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'foto.jpg', { type: 'image/jpeg' });
}

const ORIGINAL = arquivo(5 * 1024 * 1024);

describe('comprimirFoto', () => {
  beforeEach(() => comprimir.mockReset());

  it('para no primeiro tamanho que cabe em 300 KB', async () => {
    comprimir.mockResolvedValue(arquivo(TAMANHO_MAXIMO_FOTO));

    await comprimirFoto(ORIGINAL);

    expect(comprimir).toHaveBeenCalledTimes(1);
    expect(comprimir).toHaveBeenCalledWith(ORIGINAL, {
      maxSizeMB: TAMANHO_MAXIMO_FOTO / (1024 * 1024),
      maxWidthOrHeight: 1600,
      alwaysKeepResolution: true,
      initialQuality: 0.85,
      fileType: 'image/jpeg',
      useWebWorker: false,
    });
  });

  it('se não cabe, reduz a resolução até 800 px', async () => {
    comprimir
      .mockResolvedValueOnce(arquivo(TAMANHO_MAXIMO_FOTO + 1))
      .mockResolvedValueOnce(arquivo(TAMANHO_MAXIMO_FOTO + 1))
      .mockResolvedValueOnce(arquivo(200_000));

    const foto = await comprimirFoto(ORIGINAL);

    expect(foto.size).toBe(200_000);
    expect(comprimir.mock.calls.map(([, opcoes]) => opcoes.maxWidthOrHeight)).toEqual([
      1600, 1200, 800,
    ]);
  });

  it('se nem com 800 px cabe, é "Foto muito grande"', async () => {
    comprimir.mockResolvedValue(arquivo(TAMANHO_MAXIMO_FOTO + 1));

    await expect(comprimirFoto(ORIGINAL)).rejects.toThrow(FotoMuitoGrande);
    expect(comprimir).toHaveBeenCalledTimes(3);
  });
});
