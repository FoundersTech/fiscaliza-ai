import { Injectable } from '@nestjs/common';

import {
  PapelUsuario,
  Prisma,
  type Usuario as UsuarioPrisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { erroEmailEmUso } from '../application/erros.js';
import type {
  NovoCidadao,
  NovoConvidado,
  RepositorioUsuarios,
  Usuario,
} from '../application/portas.js';

@Injectable()
export class RepositorioUsuariosPrisma implements RepositorioUsuarios {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    return usuario && paraUsuario(usuario);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    return usuario && paraUsuario(usuario);
  }

  criarCidadao(dados: NovoCidadao): Promise<Usuario> {
    return this.criar({ ...dados, papel: PapelUsuario.CIDADAO });
  }

  criarConvidado(dados: NovoConvidado): Promise<Usuario> {
    return this.criar(dados);
  }

  async registrarAceitePolitica(id: string, versao: string, agora: Date): Promise<void> {
    await this.prisma.usuario.updateMany({
      where: { id, OR: [{ politicaVersao: null }, { politicaVersao: { not: versao } }] },
      data: { politicaVersao: versao, politicaAceitaEm: agora },
    });
  }

  private async criar(data: Prisma.UsuarioCreateInput): Promise<Usuario> {
    try {
      return paraUsuario(await this.prisma.usuario.create({ data }));
    } catch (erro) {
      // O índice único em lower(email) pega o cadastro simultâneo que passou pela checagem.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw erroEmailEmUso();
      }
      throw erro;
    }
  }
}

function paraUsuario(usuario: UsuarioPrisma): Usuario {
  return {
    usuarioId: usuario.id,
    nome: usuario.nome,
    apelidoPublico: usuario.apelidoPublico,
    email: usuario.email,
    senhaHash: usuario.senhaHash,
    papel: usuario.papel,
    municipioId: usuario.municipioId,
    orgaoId: usuario.orgaoId,
    ativo: usuario.ativo,
    politicaVersao: usuario.politicaVersao,
    anonimizadoEm: usuario.anonimizadoEm,
  };
}
