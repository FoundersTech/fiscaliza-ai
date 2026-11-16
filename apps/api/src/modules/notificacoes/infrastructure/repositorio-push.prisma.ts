import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { InscricaoPush, RepositorioPush } from '../application/portas.js';
import type { DestinoPush } from '../application/push.port.js';

@Injectable()
export class RepositorioPushPrisma implements RepositorioPush {
  constructor(private readonly prisma: PrismaService) {}

  async salvar(usuarioId: string, destino: DestinoPush): Promise<void> {
    const dados = { usuarioId, p256dh: destino.p256dh, auth: destino.auth, ultimoErroEm: null };
    await this.prisma.pushInscricao.upsert({
      where: { endpoint: destino.endpoint },
      create: { endpoint: destino.endpoint, ...dados },
      update: dados,
    });
  }

  async removerDoUsuario(usuarioId: string, endpoint: string): Promise<void> {
    await this.prisma.pushInscricao.deleteMany({ where: { usuarioId, endpoint } });
  }

  dosUsuarios(usuarioIds: string[]): Promise<InscricaoPush[]> {
    return this.prisma.pushInscricao.findMany({
      where: { usuarioId: { in: usuarioIds } },
      select: { id: true, usuarioId: true, endpoint: true, p256dh: true, auth: true },
      orderBy: { criadaEm: 'asc' },
    });
  }

  async apagar(id: string): Promise<void> {
    // deleteMany: a inscrição pode ter sido removida pelo próprio usuário enquanto o push saía.
    await this.prisma.pushInscricao.deleteMany({ where: { id } });
  }

  async registrarErro(id: string, quando: Date): Promise<void> {
    await this.prisma.pushInscricao.updateMany({ where: { id }, data: { ultimoErroEm: quando } });
  }
}
