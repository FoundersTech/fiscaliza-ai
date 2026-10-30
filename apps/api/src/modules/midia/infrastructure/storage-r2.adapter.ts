import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { OnModuleDestroy } from '@nestjs/common';

import type { Ambiente } from '../../../shared/config/ambiente.js';
import type { PedidoEnvio, StoragePort } from '../application/portas.js';

export interface ConfigStorage {
  endpoint: string;
  chave: string;
  segredo: string;
  bucketUploads: string;
}

export function configStorage(ambiente: Ambiente): ConfigStorage {
  return {
    endpoint: ambiente.R2_ENDPOINT,
    chave: ambiente.R2_ACCESS_KEY_ID,
    segredo: ambiente.R2_SECRET_ACCESS_KEY,
    bucketUploads: ambiente.R2_BUCKET_UPLOADS,
  };
}

export function criarClienteS3(config: ConfigStorage): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.chave, secretAccessKey: config.segredo },
    // Sem isso, o SDK põe parâmetros de checksum nas URLs pré-assinadas, e o PUT no R2 falha.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Cloudflare R2 pela API S3 (no desenvolvimento, o S3 local do docker-compose). */
export class StorageR2Adapter implements StoragePort, OnModuleDestroy {
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigStorage) {
    this.s3 = criarClienteS3(config);
  }

  urlDeEnvio({
    chave,
    contentType,
    bytes,
    emitidaEm,
    validadeSegundos,
  }: PedidoEnvio): Promise<string> {
    const comando = new PutObjectCommand({
      Bucket: this.config.bucketUploads,
      Key: chave,
      ContentType: contentType,
      ContentLength: bytes,
    });
    return getSignedUrl(this.s3, comando, {
      expiresIn: validadeSegundos,
      signingDate: emitidaEm,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}

/** Só para o S3 local: no R2, os buckets são criados no painel da Cloudflare. */
export async function criarBucketSeFaltar(config: ConfigStorage, bucket: string): Promise<void> {
  const s3 = criarClienteS3(config);
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (erro) {
    if (!(erro instanceof BucketAlreadyOwnedByYou || erro instanceof BucketAlreadyExists)) {
      throw erro;
    }
  } finally {
    s3.destroy();
  }
}
