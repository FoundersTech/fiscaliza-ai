import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { type Exportacao, StatusExportacao } from '../domain/exportacao.js';
import type { RepositorioExportacoes } from '../application/portas.js';

@Injectable()
export class RepositorioExportacoesPrisma implements RepositorioExportacoes {
  constructor(private readonly prisma: PrismaService) {}

  aproveitarOuCriar(
    usuarioId: string,
    agora: Date,
    aproveitavel: (exportacao: Exportacao) => boolean,
  ): Promise<{ exportacao: Exportacao; criada: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // Trava o usuário: o segundo pedido simultâneo espera e encontra a exportação do primeiro.
      await tx.$queryRaw`SELECT 1 FROM usuario WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      const recentes = await tx.exportacaoDados.findMany({
        where: {
          usuarioId,
          status: { in: [StatusExportacao.PROCESSANDO, StatusExportacao.PRONTA] },
        },
        orderBy: { solicitadaEm: 'desc' },
      });
      const atual = recentes.find(aproveitavel);
      if (atual) return { exportacao: atual, criada: false };

      const nova = await tx.exportacaoDados.create({ data: { usuarioId, solicitadaEm: agora } });
      return { exportacao: nova, criada: true };
    });
  }

  buscar(id: string): Promise<Exportacao | null> {
    return this.prisma.exportacaoDados.findUnique({ where: { id } });
  }

  doUsuario(usuarioId: string, limite: number): Promise<Exportacao[]> {
    return this.prisma.exportacaoDados.findMany({
      where: { usuarioId },
      orderBy: { solicitadaEm: 'desc' },
      take: limite,
    });
  }

  async marcarPronta(
    id: string,
    storageKey: string,
    prontaEm: Date,
    expiraEm: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.exportacaoDados.updateMany({
      where: { id, status: StatusExportacao.PROCESSANDO },
      data: { status: StatusExportacao.PRONTA, storageKey, prontaEm, expiraEm },
    });
    return count > 0;
  }

  async marcarFalha(id: string): Promise<void> {
    await this.prisma.exportacaoDados.updateMany({
      where: { id, status: StatusExportacao.PROCESSANDO },
      data: { status: StatusExportacao.FALHOU },
    });
  }

  // Os dois abaixo atendem a limpeza diária do módulo de manutenção, que recebe esta classe.

  /** Exportações prontas cujo prazo de download passou antes de `agora`. */
  vencidas(agora: Date, limite: number): Promise<{ id: string; storageKey: string | null }[]> {
    return this.prisma.exportacaoDados.findMany({
      where: { status: StatusExportacao.PRONTA, expiraEm: { lt: agora } },
      select: { id: true, storageKey: true },
      orderBy: { expiraEm: 'asc' },
      take: limite,
    });
  }

  /** Muda para EXPIRADA e esquece o arquivo. */
  async marcarExpirada(id: string): Promise<void> {
    await this.prisma.exportacaoDados.update({
      where: { id },
      data: { status: StatusExportacao.EXPIRADA, storageKey: null },
    });
  }
}
