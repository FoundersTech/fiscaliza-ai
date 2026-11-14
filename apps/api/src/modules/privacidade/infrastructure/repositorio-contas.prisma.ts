import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { RepositorioContas } from '../application/portas.js';

export const NOME_ANONIMO = 'Usuário removido';
// A coluna não aceita nulo e exige de 2 a 30 caracteres; o apelido nunca aparece sem autor.
export const APELIDO_ANONIMO = 'removido';

export function emailAnonimo(usuarioId: string): string {
  return `removido+${usuarioId}@invalid`;
}

@Injectable()
export class RepositorioContasPrisma implements RepositorioContas {
  constructor(private readonly prisma: PrismaService) {}

  async senhaDe(usuarioId: string): Promise<string | null> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, ativo: true, anonimizadoEm: null },
      select: { senhaHash: true },
    });
    return usuario?.senhaHash ?? null;
  }

  anonimizar(usuarioId: string, agora: Date): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          nome: NOME_ANONIMO,
          apelidoPublico: APELIDO_ANONIMO,
          email: emailAnonimo(usuarioId),
          senhaHash: null,
          ativo: false,
          anonimizadoEm: agora,
          politicaVersao: null,
          politicaAceitaEm: null,
          alertasVistosEm: null,
        },
      });
      await tx.ocorrencia.updateMany({
        where: { autorId: usuarioId },
        data: { autorId: null, publicarAutor: false },
      });
      await tx.refreshToken.deleteMany({ where: { usuarioId } });
      await tx.tokenAcesso.deleteMany({ where: { usuarioId } });
      await tx.pushInscricao.deleteMany({ where: { usuarioId } });

      const exportacoes = await tx.exportacaoDados.findMany({
        where: { usuarioId, storageKey: { not: null } },
        select: { storageKey: true },
      });
      await tx.exportacaoDados.deleteMany({ where: { usuarioId } });
      return exportacoes.flatMap(({ storageKey }) => (storageKey ? [storageKey] : []));
    });
  }
}
