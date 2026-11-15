/**
 * Restaura um backup diário do banco (bucket R2_BUCKET_BACKUP) no banco de DATABASE_URL, que
 * precisa estar vazio. Sem --dia, lista os backups guardados.
 *
 * Uso, no container da API (que tem o pg_restore):
 *   node dist/cli/restaurar-backup.js
 *   node dist/cli/restaurar-backup.js --dia 2026-11-14
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { PREFIXO_BACKUP, diaDoBackup } from '../modules/manutencao/domain/backup.js';
import { BucketS3 } from '../modules/manutencao/infrastructure/bucket-s3.adapter.js';
import { restaurarDump } from '../modules/manutencao/infrastructure/pg-dump.adapter.js';
import { configStorage } from '../modules/midia/infrastructure/storage-r2.adapter.js';
import { validarAmbiente } from '../shared/config/ambiente.js';
import { executarComPrisma } from './seed/prisma-cli.js';

executarComPrisma(async (prisma) => {
  const { values } = parseArgs({ options: { dia: { type: 'string' } } });
  const ambiente = validarAmbiente(process.env);
  const config = configStorage(ambiente);
  const bucket = new BucketS3(config, config.bucketBackup);
  try {
    const dias = (await bucket.listar(PREFIXO_BACKUP))
      .map((chave) => ({ chave, dia: diaDoBackup(chave) }))
      .filter((backup) => backup.dia !== null)
      .sort((a, b) => (a.dia ?? '').localeCompare(b.dia ?? ''));
    if (!values.dia) {
      console.log(`Backups em ${config.bucketBackup}:`);
      for (const { dia } of dias) console.log(`  ${dia}`);
      console.log('Para restaurar: --dia AAAA-MM-DD');
      return;
    }
    const escolhido = dias.find((backup) => backup.dia === values.dia);
    if (!escolhido)
      throw new Error(`Não há backup do dia ${values.dia} em ${config.bucketBackup}.`);

    // Restaurar por cima de dados existentes misturaria as duas bases.
    const linhas = await prisma.$queryRaw<{ tabelas: number }[]>`
      SELECT count(*)::int AS tabelas FROM pg_tables WHERE schemaname = 'public'`;
    const tabelas = linhas[0]?.tabelas ?? 0;
    if (tabelas > 0) {
      throw new Error(
        `O banco de DATABASE_URL já tem ${tabelas} tabelas. Restaure num banco vazio (createdb).`,
      );
    }

    const arquivo = join(tmpdir(), `restauracao-${randomUUID()}.dump`);
    try {
      await bucket.baixar(escolhido.chave, arquivo);
      await restaurarDump(arquivo, ambiente.DATABASE_URL);
    } finally {
      await rm(arquivo, { force: true });
    }
    console.log(`Backup de ${values.dia} restaurado.`);
  } finally {
    bucket.onModuleDestroy();
  }
}).catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
