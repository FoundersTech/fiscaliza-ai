import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ExportacaoVencida, RepositorioExportacoes } from '../application/portas.js';

@Injectable()
export class RepositorioExportacoesPrisma implements RepositorioExportacoes {
  constructor(private readonly prisma: PrismaService) {}

  vencidas(agora: Date, limite: number): Promise<ExportacaoVencida[]> {
    return this.prisma.exportacaoDados.findMany({
      where: { status: 'PRONTA', expiraEm: { lt: agora } },
      select: { id: true, storageKey: true },
      orderBy: { expiraEm: 'asc' },
      take: limite,
    });
  }

  async marcarExpirada(id: string): Promise<void> {
    await this.prisma.exportacaoDados.update({
      where: { id },
      data: { status: 'EXPIRADA', storageKey: null },
    });
  }
}
