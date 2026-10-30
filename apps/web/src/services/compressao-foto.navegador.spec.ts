import { describe, expect, it } from 'vitest';

import { comprimirFoto, TAMANHO_MAXIMO_FOTO } from './compressao-foto';

// Segmento APP1 como o de uma câmera de celular: fabricante, modelo, datas, GPS (23°30'5" S,
// 47°27'9" W) e orientação 6 (a foto precisa girar 90° para ficar em pé).
const EXIF_DE_CELULAR =
  '/+EBmkV4aWYAAElJKgAIAAAACgAPAQIABwAAAJYAAAAQAQIADAAAALIAAAASAQMAAQAAAAYAAAAaAQUAAQAAAIYAAAAbAQUAAQAAAI4AAAAoAQMAAQAAAAIAAAAyAQIAFAAAAJ4AAAATAgMAAQAAAAEAAABphwQAAQAAAL4AAAAliAQAAQAAACwBAAAAAAAAOGMAAOgDAAA4YwAA6AMAAEdvb2dsZQAAMjAyNjoxMDoyOSAwODoxNTowMABQaXhlbCA5IFBybwAHAACQBwAEAAAAMDIxMAOQAgAUAAAAGAEAAAGRBwAEAAAAAQIDAACgBwAEAAAAMDEwMAGgAwABAAAA//8AAAKgBAABAAAACAAAAAOgBAABAAAACAAAAAAAAAAyMDI2OjEwOjI5IDA4OjE1OjAwAAQAAQACAAIAAABTAAAAAgAFAAMAAABiAQAAAwACAAIAAABXAAAABAAFAAMAAAB6AQAAAAAAABcAAAABAAAAHgAAAAEAAAAFAAAAAQAAAC8AAAABAAAAGwAAAAEAAAAJAAAAAQAAAA==';
const MODELO = 'Pixel 9 Pro';
const DATA_ORIGINAL = '2026:10:29 08:15:00';

/** Ruído previsível: o mesmo arquivo em toda execução. */
function geradorDeRuido(semente: number) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 2 ** 32 - 0.5;
  };
}

/** JPEG de câmera: degradê com ruído (comprime mal, como uma foto real) e o EXIF logo após o SOI. */
async function fotoDeCelular(largura: number, altura: number): Promise<File> {
  const canvas = new OffscreenCanvas(largura, altura);
  const contexto = canvas.getContext('2d')!;
  const degrade = contexto.createLinearGradient(0, 0, largura, altura);
  degrade.addColorStop(0, '#6b8fb5');
  degrade.addColorStop(0.5, '#b59a6b');
  degrade.addColorStop(1, '#4f6b3a');
  contexto.fillStyle = degrade;
  contexto.fillRect(0, 0, largura, altura);

  const imagem = contexto.getImageData(0, 0, largura, altura);
  const ruido = geradorDeRuido(42);
  for (let i = 0; i < imagem.data.length; i += 4) {
    const variacao = ruido() * 90;
    imagem.data[i] = imagem.data[i]! + variacao;
    imagem.data[i + 1] = imagem.data[i + 1]! + variacao;
    imagem.data[i + 2] = imagem.data[i + 2]! + ruido() * 60;
  }
  contexto.putImageData(imagem, 0, 0);

  const jpeg = new Uint8Array(
    await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer(),
  );
  const exif = Uint8Array.from(atob(EXIF_DE_CELULAR), (letra) => letra.charCodeAt(0));
  return new File([jpeg.subarray(0, 2), exif, jpeg.subarray(2)], 'IMG_0001.jpg', {
    type: 'image/jpeg',
  });
}

async function texto(arquivo: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await arquivo.arrayBuffer());
}

describe('comprimirFoto (no Chrome)', () => {
  it('uma foto de celular de 5 MB sai com até 300 KB, em pé e sem EXIF', async () => {
    const original = await fotoDeCelular(4000, 3000);
    expect(original.size).toBeGreaterThan(5 * 1024 * 1024);
    expect(await texto(original)).toContain(MODELO);

    const foto = await comprimirFoto(original);

    expect(foto.type).toBe('image/jpeg');
    expect(foto.size).toBeLessThanOrEqual(TAMANHO_MAXIMO_FOTO);
    const conteudo = await texto(foto);
    expect(conteudo).not.toContain('Exif');
    expect(conteudo).not.toContain(MODELO);
    expect(conteudo).not.toContain(DATA_ORIGINAL);

    const { width, height } = await createImageBitmap(foto);
    expect(height).toBeGreaterThan(width);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1600);
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(800);
  });

  it('não aumenta uma foto menor que 1600 px', async () => {
    const foto = await comprimirFoto(await fotoDeCelular(640, 480));

    const { width, height } = await createImageBitmap(foto);
    expect(Math.max(width, height)).toBe(640);
    expect(Math.min(width, height)).toBe(480);
  });
});
