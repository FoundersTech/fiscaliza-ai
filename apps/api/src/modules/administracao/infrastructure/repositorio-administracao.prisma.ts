import { Injectable } from '@nestjs/common';

import { PapelUsuario, type Usuario } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { Agente, Orgao, RepositorioAdministracao } from '../application/portas.js';

const CAMPOS_ORGAO = { id: true, municipioId: true, nome: true, sigla: true } as const;

@Injectable()
export class RepositorioAdministracaoPrisma implements RepositorioAdministracao {
  constructor(private readonly prisma: PrismaService) {}

  buscarOrgaoDoMunicipio(municipioId: number): Promise<Orgao | null> {
    return this.prisma.orgao.findUnique({ where: { municipioId }, select: CAMPOS_ORGAO });
  }

  atualizarOrgao(id: number, dados: { nome?: string; sigla?: string }): Promise<Orgao> {
    return this.prisma.orgao.update({ where: { id }, data: dados, select: CAMPOS_ORGAO });
  }

  async listarAgentes(orgaoId: number): Promise<Agente[]> {
    const agentes = await this.prisma.usuario.findMany({
      where: { orgaoId, papel: PapelUsuario.AGENTE_ORGAO, anonimizadoEm: null },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return agentes.map(paraAgente);
  }

  async buscarAgente(id: string): Promise<Agente | null> {
    const agente = await this.prisma.usuario.findFirst({
      where: { id, papel: PapelUsuario.AGENTE_ORGAO, anonimizadoEm: null },
    });
    return agente && paraAgente(agente);
  }

  async municipioExiste(id: number): Promise<boolean> {
    return (await this.prisma.municipio.count({ where: { id } })) > 0;
  }
}

function paraAgente(usuario: Usuario): Agente {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    // O banco exige o órgão para todo AGENTE_ORGAO.
    orgaoId: usuario.orgaoId!,
    ativo: usuario.ativo,
    convitePendente: usuario.senhaHash === null,
  };
}
