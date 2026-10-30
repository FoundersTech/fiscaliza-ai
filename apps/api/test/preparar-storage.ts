import type { TestProject } from 'vitest/node';

import {
  configStorage,
  criarBucketSeFaltar,
} from '../src/modules/midia/infrastructure/storage-r2.adapter.js';
import { validarAmbiente } from '../src/shared/config/ambiente.js';

/** globalSetup dos testes de integração: cria o bucket de uploads no S3 local. */
export default async function prepararStorage(project: TestProject): Promise<void> {
  const ambiente = validarAmbiente({ ...process.env, ...project.config.env });
  try {
    await criarBucketSeFaltar(configStorage(ambiente), ambiente.R2_BUCKET_UPLOADS);
  } catch (erro) {
    const mensagem = `S3 local indisponível em ${ambiente.R2_ENDPOINT} (rode pnpm infra:up): ${String(erro)}`;
    const falha = new Error(mensagem, { cause: String(erro) });
    // O Vitest quebra ao montar o stack de um erro do globalSetup e esconde a mensagem.
    falha.stack = mensagem;
    throw falha;
  }
}
