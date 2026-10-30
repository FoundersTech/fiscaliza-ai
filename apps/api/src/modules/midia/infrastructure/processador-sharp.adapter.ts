import sharp, { type Sharp } from 'sharp';

import { LADO_FOTO, LADO_MINIATURA } from '../domain/foto.js';
import {
  type FotoPreparada,
  ImagemInvalida,
  type Jpeg,
  type ProcessadorImagem,
} from '../application/portas.js';

const FORMATOS_ACEITOS = new Set(['jpeg', 'png', 'webp']);
// Um arquivo de até 300 KB não chega a isso de forma honesta; acima, é bomba de descompressão.
const PIXELS_MAXIMOS = 40_000_000;
const QUALIDADE = 82;

/**
 * Recodifica com o sharp. A saída não leva nenhum metadado do original (EXIF, GPS, modelo do
 * aparelho, datas); a orientação do EXIF é aplicada antes, nos pixels.
 */
export class ProcessadorSharp implements ProcessadorImagem {
  async preparar(original: Buffer): Promise<FotoPreparada> {
    const imagem = sharp(original, {
      autoOrient: true,
      failOn: 'error',
      limitInputPixels: PIXELS_MAXIMOS,
    });

    let formato: string | undefined;
    try {
      formato = (await imagem.metadata()).format;
    } catch {
      throw new ImagemInvalida('O arquivo enviado não é uma imagem.');
    }
    if (!formato || !FORMATOS_ACEITOS.has(formato)) {
      throw new ImagemInvalida(`Formato de imagem não aceito: ${formato ?? 'desconhecido'}.`);
    }

    try {
      const [foto, miniatura] = await Promise.all([
        jpeg(imagem.clone(), LADO_FOTO),
        jpeg(imagem.clone(), LADO_MINIATURA),
      ]);
      return { foto, miniatura };
    } catch (erro) {
      throw new ImagemInvalida(`A imagem não pôde ser lida: ${(erro as Error).message}`);
    }
  }
}

async function jpeg(imagem: Sharp, lado: number): Promise<Jpeg> {
  const { data, info } = await imagem
    .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALIDADE, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { conteudo: data, largura: info.width, altura: info.height };
}
