import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  NovoTokenAcesso,
  RepositorioTokensAcesso,
  TokenAcessoGravado,
} from '../application/portas.js';

@Injectable()
export class RepositorioTokensAcessoPrisma implements RepositorioTokensAcesso {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dados: NovoTokenAcesso): Promise<void> {
    await this.prisma.tokenAcesso.create({ data: dados });
  }

  buscarPorHash(tokenHash: string): Promise<TokenAcessoGravado | null> {
    return this.prisma.tokenAcesso.findUnique({
      where: { tokenHash },
      select: { id: true, usuarioId: true, expiraEm: true, usadoEm: true },
    });
  }

  definirSenha(token: TokenAcessoGravado, senhaHash: string, agora: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // A condição usado_em nulo garante que, com duas requisições juntas, só uma usa o token.
      const { count } = await tx.tokenAcesso.updateMany({
        where: { id: token.id, usadoEm: null },
        data: { usadoEm: agora },
      });
      if (count === 0) return false;
      await tx.usuario.update({ where: { id: token.usuarioId }, data: { senhaHash } });
      await tx.tokenAcesso.updateMany({
        where: { usuarioId: token.usuarioId, usadoEm: null },
        data: { usadoEm: agora },
      });
      return true;
    });
  }
}
