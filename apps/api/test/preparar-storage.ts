import type { TestProject } from 'vitest/node';

import {
  configStorage,
  criarBucketSeFaltar,
} from '../src/modules/midia/infrastructure/storage-r2.adapter.js';
import { validarAmbiente } from '../src/shared/config/ambiente.js';

/** globalSetup dos testes de integração: cria os buckets de uploads e de fotos no S3 local. */
export default async function prepararStorage(project: TestProject): Promise<void> {
  const ambiente = validarAmbiente({ ...process.env, ...project.config.env });
  try {
    const config = configStorage(ambiente);
    await criarBucketSeFaltar(config, config.bucketUploads);
    await criarBucketSeFaltar(config, config.bucketFotos);
  } catch (erro) {
    const mensagem = `S3 local indisponível em ${ambiente.R2_ENDPOINT} (rode pnpm infra:up): ${String(erro)}`;
    const falha = new Error(mensagem, { cause: String(erro) });
    // O Vitest quebra ao montar o stack de um erro do globalSetup e esconde a mensagem.
    falha.stack = mensagem;
    throw falha;
  }
}
