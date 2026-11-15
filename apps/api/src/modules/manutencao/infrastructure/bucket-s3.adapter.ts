import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { OnModuleDestroy } from '@nestjs/common';

import {
  type ConfigStorage,
  criarClienteS3,
  listarObjetos,
} from '../../midia/infrastructure/storage-r2.adapter.js';
import type { ArmazemBackup, ArquivosExportacao } from '../application/portas.js';

/** Um bucket privado do R2 (no desenvolvimento, do S3 local). */
export class BucketS3 implements ArmazemBackup, ArquivosExportacao, OnModuleDestroy {
  private readonly s3: S3Client;

  constructor(
    config: ConfigStorage,
    private readonly bucket: string,
  ) {
    this.s3 = criarClienteS3(config);
  }

  async enviar(chave: string, caminho: string, bytes: number): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: createReadStream(caminho),
        ContentLength: bytes,
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async listar(prefixo: string): Promise<string[]> {
    const chaves: string[] = [];
    for await (const pagina of listarObjetos(this.s3, this.bucket, prefixo)) {
      for (const { Key } of pagina) if (Key) chaves.push(Key);
    }
    return chaves;
  }

  /** Grava o arquivo do bucket em `caminho`, para a restauração. */
  async baixar(chave: string, caminho: string): Promise<void> {
    const resposta = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    if (!(resposta.Body instanceof Readable)) throw new Error(`${chave} veio sem conteúdo`);
    await pipeline(resposta.Body, createWriteStream(caminho));
  }

  async apagar(chave: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}
