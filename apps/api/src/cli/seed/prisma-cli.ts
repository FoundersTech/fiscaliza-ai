import { existsSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Roda uma tarefa de linha de comando com um PrismaClient próprio, fora do Nest.
 * Como no main.ts, as variáveis vêm do .env em desenvolvimento e do ambiente no servidor.
 */
export async function executarComPrisma(
  tarefa: (prisma: PrismaClient) => Promise<void>,
): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL não definido (copie apps/api/.env.example para apps/api/.env).');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await tarefa(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
