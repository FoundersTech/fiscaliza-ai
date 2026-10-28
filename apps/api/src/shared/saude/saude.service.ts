import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

export type EstadoComponente = 'ok' | 'erro';

export interface RelatorioSaude {
  status: EstadoComponente;
  versao: string;
  db: EstadoComponente;
  redis: EstadoComponente;
}

const TIMEOUT_MS = 2000;

async function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new Error(`timeout de ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promessa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

async function sondar(verificacao: () => Promise<unknown>): Promise<EstadoComponente> {
  try {
    await comTimeout(verificacao(), TIMEOUT_MS);
    return 'ok';
  } catch {
    return 'erro';
  }
}

@Injectable()
export class SaudeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async verificar(): Promise<RelatorioSaude> {
    const [db, redis] = await Promise.all([
      sondar(() => this.prisma.$queryRaw`SELECT 1`),
      sondar(() => this.redis.ping()),
    ]);

    return {
      status: db === 'ok' && redis === 'ok' ? 'ok' : 'erro',
      versao: this.ambiente.APP_VERSAO,
      db,
      redis,
    };
  }
}
