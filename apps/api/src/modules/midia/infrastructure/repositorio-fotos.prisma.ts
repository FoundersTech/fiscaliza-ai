import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  FiltroRevisao,
  FotoEmRevisao,
  FotoParaProcessar,
  FotoPublicada,
  RepositorioFotos,
} from '../application/portas.js';
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

  async buscarParaRevisao(id: string): Promise<FotoEmRevisao | null> {
    const foto = await this.prisma.ocorrenciaFoto.findUnique({
      where: { id },
      select: CAMPOS_REVISAO,
    });
    return foto && paraRevisao(foto);
  }

  async listarParaRevisao({
    moderacao,
    depoisDe,
    limite,
  }: FiltroRevisao): Promise<FotoEmRevisao[]> {
    // O cursor do Prisma compara com os valores da foto no próprio banco, sem perder os
    // microssegundos de criada_em.
    const fotos = await this.prisma.ocorrenciaFoto.findMany({
      where: { moderacao },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      ...(depoisDe ? { cursor: { id: depoisDe }, skip: 1 } : {}),
      take: limite,
      select: CAMPOS_REVISAO,
    });
    return fotos.map(paraRevisao);
  }

  async rejeitarAprovada(id: string, motivo: string): Promise<void> {
    await this.prisma.ocorrenciaFoto.updateMany({
      where: { id, moderacao: ModeracaoFoto.APROVADA },
      data: { moderacao: ModeracaoFoto.REJEITADA, motivoRejeicao: motivo },
    });
  }
}

const CAMPOS_REVISAO = {
  id: true,
  ocorrenciaId: true,
  ordem: true,
  moderacao: true,
  storageKey: true,
  miniaturaKey: true,
  motivoRejeicao: true,
  criadaEm: true,
  ocorrencia: { select: { protocolo: true } },
} as const;

function paraRevisao({
  ocorrencia,
  ...foto
}: Omit<FotoEmRevisao, 'protocolo'> & { ocorrencia: { protocolo: string } }): FotoEmRevisao {
  return { ...foto, protocolo: ocorrencia.protocolo };
}
