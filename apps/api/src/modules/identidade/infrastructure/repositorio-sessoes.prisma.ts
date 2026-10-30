import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { NovoRefresh, RefreshGravado, RepositorioSessoes } from '../application/portas.js';

const CAMPOS = {
  id: true,
  usuarioId: true,
  familiaId: true,
  expiraEm: true,
  usadoEm: true,
  revogadoEm: true,
} as const;

@Injectable()
export class RepositorioSessoesPrisma implements RepositorioSessoes {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dados: NovoRefresh): Promise<void> {
    await this.prisma.refreshToken.create({ data: dados });
  }

  buscarPorHash(tokenHash: string): Promise<RefreshGravado | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash }, select: CAMPOS });
  }

  rotacionar(id: string, sucessor: NovoRefresh, agora: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id, usadoEm: null },
        data: { usadoEm: agora },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({ data: sucessor });
      return true;
    });
  }

  async revogarFamilia(familiaId: string, agora: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familiaId, revogadoEm: null },
      data: { revogadoEm: agora },
    });
  }

  async revogarDoUsuario(usuarioId: string, agora: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: agora },
    });
  }
}
