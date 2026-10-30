import sharp from 'sharp';

export const MODELO_CAMERA = 'Pixel 9 Pro';

/**
 * JPEG de 2400 × 1800 como sai de um celular: EXIF com fabricante, modelo, datas, GPS e
 * orientação 6 (a foto precisa girar 90° para ficar em pé).
 */
export function fotoDeCelular(): Promise<Buffer> {
  return sharp({
    create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'Google', Model: MODELO_CAMERA, DateTime: '2026:10:29 08:15:00' },
      IFD2: { DateTimeOriginal: '2026:10:29 08:15:00' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '23/1 30/1 5/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '47/1 27/1 9/1',
      },
    })
    .jpeg()
    .toBuffer();
}

export function fotoPequena(): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 20, g: 90, b: 160 } },
  })
    .jpeg()
    .toBuffer();
}
