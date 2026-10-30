import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { fotoDeCelular, fotoPequena, MODELO_CAMERA } from '../../../../test/fotos.js';
import { ImagemInvalida } from '../application/portas.js';
import { ProcessadorSharp } from './processador-sharp.adapter.js';

const processador = new ProcessadorSharp();

describe('ProcessadorSharp', () => {
  it('a foto sai sem EXIF, em pé, com 1600 px no lado maior e miniatura de 400 px', async () => {
    const original = await fotoDeCelular();
    expect((await sharp(original).metadata()).exif?.includes(MODELO_CAMERA)).toBe(true);

    const { foto, miniatura } = await processador.preparar(original);

    expect([foto.largura, foto.altura]).toEqual([1200, 1600]);
    expect([miniatura.largura, miniatura.altura]).toEqual([300, 400]);
    for (const { conteudo } of [foto, miniatura]) {
      const metadados = await sharp(conteudo).metadata();
      expect(metadados.format).toBe('jpeg');
      expect(metadados).not.toHaveProperty('exif');
      expect(metadados).not.toHaveProperty('xmp');
      expect(metadados).not.toHaveProperty('orientation');
      expect(conteudo.includes(MODELO_CAMERA)).toBe(false);
    }
  });

  it('não aumenta uma foto menor que 1600 px', async () => {
    const { foto, miniatura } = await processador.preparar(await fotoPequena());

    expect([foto.largura, foto.altura]).toEqual([640, 480]);
    expect([miniatura.largura, miniatura.altura]).toEqual([400, 300]);
  });

  it('um texto com extensão .jpg não é imagem', async () => {
    const texto = Buffer.from('isto é um arquivo de texto, não uma foto');

    await expect(processador.preparar(texto)).rejects.toThrow(
      new ImagemInvalida('O arquivo enviado não é uma imagem.'),
    );
  });

  it('recusa formatos fora de JPEG, PNG e WebP', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#fff' },
    })
      .gif()
      .toBuffer();

    await expect(processador.preparar(svg)).rejects.toThrow('Formato de imagem não aceito: svg.');
    await expect(processador.preparar(gif)).rejects.toThrow('Formato de imagem não aceito: gif.');
  });

  it('aceita PNG e devolve JPEG', async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 4, background: '#08f8' },
    })
      .png()
      .toBuffer();

    const { foto } = await processador.preparar(png);

    expect((await sharp(foto.conteudo).metadata()).format).toBe('jpeg');
  });
});
