/**
 * Dados de desenvolvimento: carga inicial, 1 usuário por papel, 50 ocorrências e os buckets de
 * uploads e de fotos no S3 local. Recusa rodar fora de NODE_ENV=development ou test.
 *
 * Uso: pnpm db:seed:dev (na raiz do monorepo).
 */
import {
  configStorage,
  criarBucketSeFaltar,
} from '../modules/midia/infrastructure/storage-r2.adapter.js';
import { validarAmbiente } from '../shared/config/ambiente.js';
import { aplicarDadosDev, ErroAmbienteSeedDev } from './seed/dados-dev.js';
import { executarComPrisma } from './seed/prisma-cli.js';

executarComPrisma(async (prisma) => {
  const resumo = await aplicarDadosDev(prisma, process.env['NODE_ENV']);
  console.log(
    resumo.ocorrenciasCriadas > 0
      ? `Dados de desenvolvimento criados: ${resumo.usuarios} usuários e ${resumo.ocorrenciasCriadas} ocorrências.`
      : `Dados de desenvolvimento já existiam: ${resumo.usuarios} usuários conferidos, nenhuma ocorrência nova.`,
  );

  const ambiente = validarAmbiente(process.env);
  const config = configStorage(ambiente);
  for (const bucket of [config.bucketUploads, config.bucketFotos]) {
    await criarBucketSeFaltar(config, bucket);
    console.log(`Bucket ${bucket} pronto em ${config.endpoint}.`);
  }
}).catch((erro: unknown) => {
  console.error(erro instanceof ErroAmbienteSeedDev ? erro.message : erro);
  process.exit(1);
});
