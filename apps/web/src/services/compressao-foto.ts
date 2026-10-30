import imageCompression from 'browser-image-compression';

/** O mesmo limite que a API assina no link de envio. */
export const TAMANHO_MAXIMO_FOTO = 300 * 1024;

/** Lado maior da foto: começa em 1600 px e só desce até 800 px se ela não couber. */
export const LADOS_FOTO = [1600, 1200, 800] as const;

export class FotoMuitoGrande extends Error {
  override readonly name = 'FotoMuitoGrande';

  constructor() {
    super('Foto muito grande');
  }
}

/**
 * JPEG de até 300 KB. O canvas desenha a foto de novo, já na orientação certa, e o arquivo novo
 * não leva o EXIF do original (GPS, modelo do aparelho, data).
 */
export async function comprimirFoto(original: File): Promise<File> {
  for (const lado of LADOS_FOTO) {
    const foto = await imageCompression(original, {
      maxSizeMB: TAMANHO_MAXIMO_FOTO / (1024 * 1024),
      maxWidthOrHeight: lado,
      // Só a qualidade cai dentro de cada tentativa; a resolução desce aqui, em degraus.
      alwaysKeepResolution: true,
      initialQuality: 0.85,
      fileType: 'image/jpeg',
      // No Worker, a biblioteca baixaria o próprio código de uma CDN.
      useWebWorker: false,
    });
    if (foto.size <= TAMANHO_MAXIMO_FOTO) return foto;
  }
  throw new FotoMuitoGrande();
}
