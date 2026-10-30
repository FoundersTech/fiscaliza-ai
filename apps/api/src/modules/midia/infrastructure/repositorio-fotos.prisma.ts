import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { FotoParaProcessar, FotoPublicada, RepositorioFotos } from '../application/portas.js';
import { ModeracaoFoto } from '../domain/foto.js';

@Injectable()
export class RepositorioFotosPrisma implements RepositorioFotos {
  constructor(private readonly prisma: PrismaService) {}

  buscar(id: string): Promise<FotoParaProcessar | null> {
    return this.prisma.ocorrenciaFoto.findUnique({
      where: { id },
      select: { id: true, ocorrenciaId: true, uploadKey: true, moderacao: true },
    });
  }

  async aprovar(id: string, publicada: FotoPublicada): Promise<void> {
    await this.prisma.ocorrenciaFoto.updateMany({
      where: { id, moderacao: ModeracaoFoto.PENDENTE },
      data: { ...publicada, moderacao: ModeracaoFoto.APROVADA },
    });
  }

  async rejeitar(id: string, motivo: string): Promise<void> {
    await this.prisma.ocorrenciaFoto.updateMany({
      where: { id, moderacao: ModeracaoFoto.PENDENTE },
      data: { moderacao: ModeracaoFoto.REJEITADA, motivoRejeicao: motivo },
    });
  }

  async esquecerOriginal(id: string): Promise<void> {
    await this.prisma.ocorrenciaFoto.updateMany({ where: { id }, data: { uploadKey: null } });
  }

  async pendentesCriadasAntes(antesDe: Date, limite: number): Promise<string[]> {
    const fotos = await this.prisma.ocorrenciaFoto.findMany({
      where: { moderacao: ModeracaoFoto.PENDENTE, criadaEm: { lt: antesDe } },
      select: { id: true },
      orderBy: { criadaEm: 'asc' },
      take: limite,
    });
    return fotos.map((foto) => foto.id);
  }
}
