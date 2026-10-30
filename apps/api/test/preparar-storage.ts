import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { TestProject } from 'vitest/node';

import {
  type ConfigStorage,
  configStorage,
  criarBucketSeFaltar,
  criarClienteS3,
} from '../src/modules/midia/infrastructure/storage-r2.adapter.js';
import { validarAmbiente } from '../src/shared/config/ambiente.js';

/** globalSetup dos testes de integração: cria os buckets de uploads e de fotos no S3 local. */
export default async function prepararStorage(project: TestProject): Promise<void> {
  const ambiente = validarAmbiente({ ...process.env, ...project.config.env });
  try {
    const config = configStorage(ambiente);
    for (const bucket of [config.bucketUploads, config.bucketFotos]) {
      await criarBucketSeFaltar(config, bucket);
      await aquecer(config, bucket);
    }
  } catch (erro) {
    const mensagem = `S3 local indisponível em ${ambiente.R2_ENDPOINT} (rode pnpm infra:up): ${String(erro)}`;
    const falha = new Error(mensagem, { cause: String(erro) });
    // O Vitest quebra ao montar o stack de um erro do globalSetup e esconde a mensagem.
    falha.stack = mensagem;
    throw falha;
  }
}

/**
 * Num SeaweedFS recém-criado, como o do CI, a primeira gravação num bucket reserva o espaço em
 * disco e leva vários segundos. Gravar e apagar um arquivo aqui tira essa espera dos testes.
 */
async function aquecer(config: ConfigStorage, bucket: string): Promise<void> {
  const s3 = criarClienteS3(config);
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: 'aquecimento', Body: '' }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'aquecimento' }));
  } finally {
    s3.destroy();
  }
}
