import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { OnModuleDestroy } from '@nestjs/common';

import {
  type ConfigStorage,
  criarClienteS3,
} from '../../midia/infrastructure/storage-r2.adapter.js';
import type { ArquivosExportacao } from '../application/portas.js';

/** Arquivos de exportação no bucket privado de uploads (R2, ou o S3 local). */
export class ArquivosExportacaoR2 implements ArquivosExportacao, OnModuleDestroy {
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigStorage) {
    this.s3 = criarClienteS3(config);
  }

  async gravar(chave: string, json: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucketUploads,
        Key: chave,
        Body: json,
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'private, no-store',
      }),
    );
  }

  urlDeDownload(chave: string, nomeArquivo: string, validadeSegundos: number): Promise<string> {
    const comando = new GetObjectCommand({
      Bucket: this.config.bucketUploads,
      Key: chave,
      ResponseContentDisposition: `attachment; filename="${nomeArquivo}"`,
    });
    return getSignedUrl(this.s3, comando, { expiresIn: validadeSegundos });
  }

  async apagar(chave: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucketUploads, Key: chave }));
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}
