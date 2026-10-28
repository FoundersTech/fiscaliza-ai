import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';

/** Prisma 7 com o adapter `pg`. A conexão abre na primeira consulta. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(AMBIENTE) ambiente: Ambiente) {
    super({ adapter: new PrismaPg({ connectionString: ambiente.DATABASE_URL }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
