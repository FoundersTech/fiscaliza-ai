/**
 * Cria um administrador da plataforma sem senha e envia o convite por e-mail; a pessoa define a
 * própria senha pelo link. Nenhuma senha passa por variável de ambiente nem pelo terminal.
 *
 * Uso: pnpm criar-admin --email voce@exemplo.com [--nome "Seu Nome"] (na raiz do monorepo).
 * No container da API: node dist/cli/criar-admin.js --email voce@exemplo.com
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { isEmail } from 'class-validator';

import { AppModule } from '../app.module.js';
import { CriarAdminPlataforma } from '../modules/identidade/application/criar-admin.js';
import { VALIDADE_HORAS } from '../modules/notificacoes/application/templates-email.js';

async function principal(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const { values } = parseArgs({
    options: { email: { type: 'string' }, nome: { type: 'string' } },
  });
  const email = values.email?.trim();
  if (!email || !isEmail(email)) {
    throw new Error('Informe o e-mail do administrador: --email voce@exemplo.com');
  }
  const nome = values.nome?.trim();
  if (nome !== undefined && (nome.length < 2 || nome.length > 100)) {
    throw new Error('O nome deve ter de 2 a 100 caracteres.');
  }

  // O contexto sobe sem servidor HTTP; o convite entra na mesma fila de e-mail da API.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await app.get(CriarAdminPlataforma).executar({ email, nome });
  } finally {
    await app.close();
  }

  console.log(
    `Administrador criado. O convite foi enviado para ${email} e vale por ` +
      `${VALIDADE_HORAS.convite} horas.`,
  );
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
