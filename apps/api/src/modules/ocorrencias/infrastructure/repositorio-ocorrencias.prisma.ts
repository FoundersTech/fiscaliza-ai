import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { Ponto } from '../../territorio/domain/endereco.js';
import type {
  CandidataDuplicidade,
  CategoriaDoRegistro,
  NovaAvaliacao,
  NovaOcorrencia,
  OcorrenciaDoOrgao,
  OcorrenciaGravada,
  RepositorioOcorrencias,
  ReaberturaGravavel,
  ResultadoGravacao,
  TransicaoGravavel,
} from '../application/portas.js';
import {
  ABERTAS,
  type DadosOcorrencia,
  type OriginalDuplicidade,
  StatusOcorrencia,
} from '../domain/ocorrencia.js';
import { Protocolo } from '../domain/protocolo.js';

const CAMPOS = { id: true, autorId: true, protocolo: true, status: true } as const;

const CAMPOS_AGREGADO = {
  id: true,
  municipioId: true,
  autorId: true,
  status: true,
  criadaEm: true,
  triadaEm: true,
  resolvidaEm: true,
  duplicadaDeId: true,
  reaberturas: true,
} as const;

@Injectable()
export class RepositorioOcorrenciasPrisma implements RepositorioOcorrencias {
  constructor(private readonly prisma: PrismaService) {}

  buscar(id: string): Promise<OcorrenciaGravada | null> {
    return this.prisma.ocorrencia.findUnique({ where: { id }, select: CAMPOS });
  }

  categoriaAtiva(id: number): Promise<CategoriaDoRegistro | null> {
    return this.prisma.categoria.findFirst({
      where: { id, ativa: true },
      select: { id: true, schemaAtributos: true },
    });
  }

  candidatasDuplicidade({
    categoriaId,
    local,
    raioM,
    limite,
  }: {
    categoriaId: number;
    local: Ponto;
    raioM: number;
    limite: number;
  }): Promise<CandidataDuplicidade[]> {
    return this.prisma.$queryRaw<CandidataDuplicidade[]>`
      SELECT o.id, o.protocolo, o.descricao,
             ST_Distance(o.local, ponto.geo) AS "distanciaM",
             (SELECT count(*)::int FROM confirmacao c WHERE c.ocorrencia_id = o.id) AS confirmacoes
      FROM ocorrencia o,
           (SELECT ST_SetSRID(ST_MakePoint(${local.lng}::float8, ${local.lat}::float8), 4326)::geography AS geo) ponto
      WHERE o.categoria_id = ${categoriaId}
        AND o.status = ANY(${ABERTAS}::status_ocorrencia[])
        AND ST_DWithin(o.local, ponto.geo, ${raioM}::float8)
      ORDER BY "distanciaM", o.criada_em
      LIMIT ${limite}`;
  }

  criar(nova: NovaOcorrencia): Promise<ResultadoGravacao> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${nova.id}, 0))`;
      const existente = await tx.ocorrencia.findUnique({ where: { id: nova.id }, select: CAMPOS });
      if (existente) return { criada: false, ocorrencia: existente, fotoIds: [] };

      const ano = Protocolo.anoDe(nova.criadaEm);
      const [sequencia] = await tx.$queryRaw<{ ultimo: number }[]>`
        INSERT INTO protocolo_sequencia (municipio_id, ano, ultimo)
        VALUES (${nova.municipioId}, ${ano}, 1)
        ON CONFLICT (municipio_id, ano)
        DO UPDATE SET ultimo = protocolo_sequencia.ultimo + 1
        RETURNING ultimo`;
      const protocolo = Protocolo.formatar(ano, nova.municipioSigla, sequencia!.ultimo);

      await tx.$executeRaw`
        INSERT INTO ocorrencia (id, protocolo, autor_id, publicar_autor, categoria_id, municipio_id,
                                orgao_id, descricao, atributos, local, precisao_m, endereco,
                                status, criada_em)
        VALUES (${nova.id}::uuid, ${protocolo}, ${nova.autorId}::uuid, ${nova.publicarAutor},
                ${nova.categoriaId}, ${nova.municipioId}, ${nova.orgaoId}, ${nova.descricao},
                ${JSON.stringify(nova.atributos)}::jsonb,
                ST_SetSRID(ST_MakePoint(${nova.local.lng}::float8, ${nova.local.lat}::float8), 4326)::geography,
                ${nova.precisaoM}, ${nova.endereco}, 'RECEBIDA', ${nova.criadaEm})`;
      await tx.ocorrenciaEvento.create({
        data: {
          ocorrenciaId: nova.id,
          paraStatus: StatusOcorrencia.RECEBIDA,
          autorId: nova.autorId,
          criadoEm: nova.criadaEm,
        },
      });
      const fotos = nova.fotos.map((foto) => ({ id: randomUUID(), ...foto }));
      await tx.ocorrenciaFoto.createMany({
        data: fotos.map((foto) => ({
          id: foto.id,
          ocorrenciaId: nova.id,
          ordem: foto.ordem,
          uploadKey: foto.uploadKey,
          criadaEm: nova.criadaEm,
        })),
      });

      return {
        criada: true,
        ocorrencia: {
          id: nova.id,
          autorId: nova.autorId,
          protocolo,
          status: StatusOcorrencia.RECEBIDA,
        },
        fotoIds: fotos.map((foto) => foto.id),
      };
    });
  }

  async localSemEndereco(id: string): Promise<Ponto | null> {
    const [linha] = await this.prisma.$queryRaw<Ponto[]>`
      SELECT ST_Y(local::geometry) AS lat, ST_X(local::geometry) AS lng
      FROM ocorrencia WHERE id = ${id}::uuid AND endereco IS NULL`;
    return linha ?? null;
  }

  async gravarEndereco(id: string, endereco: string): Promise<void> {
    await this.prisma.ocorrencia.updateMany({ where: { id, endereco: null }, data: { endereco } });
  }

  carregar(id: string): Promise<DadosOcorrencia | null> {
    return this.prisma.ocorrencia.findUnique({ where: { id }, select: CAMPOS_AGREGADO });
  }

  async carregarComOrgao(id: string): Promise<OcorrenciaDoOrgao | null> {
    const linha = await this.prisma.ocorrencia.findUnique({
      where: { id },
      select: { ...CAMPOS_AGREGADO, orgaoId: true },
    });
    if (!linha) return null;
    const { orgaoId, ...dados } = linha;
    return { dados, orgaoId };
  }

  originalPorProtocolo(protocolo: string): Promise<OriginalDuplicidade | null> {
    return this.prisma.ocorrencia.findUnique({
      where: { protocolo },
      select: { id: true, municipioId: true, status: true },
    });
  }

  gravarTransicao({
    statusEsperado,
    estado,
    evento,
    agenteId,
    orgaoId,
  }: TransicaoGravavel): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      // O filtro pelo status lido barra a segunda de duas mudanças feitas ao mesmo tempo.
      const { count } = await tx.ocorrencia.updateMany({
        where: { id: estado.id, status: statusEsperado },
        data: {
          status: estado.status,
          triadaEm: estado.triadaEm,
          resolvidaEm: estado.resolvidaEm,
          duplicadaDeId: estado.duplicadaDeId,
        },
      });
      if (!count) return null;
      const { id } = await tx.ocorrenciaEvento.create({
        data: {
          ocorrenciaId: estado.id,
          deStatus: evento.deStatus,
          paraStatus: evento.paraStatus,
          autorId: agenteId,
          orgaoId,
          comentario: evento.comentario,
          criadoEm: evento.criadoEm,
        },
        select: { id: true },
      });
      return id;
    });
  }

  gravarReabertura({ estado, evento, usuarioId }: ReaberturaGravavel): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      // Só reabre se ainda estiver resolvida: uma ação do agente no meio do caminho vence.
      const { count } = await tx.ocorrencia.updateMany({
        where: { id: estado.id, status: StatusOcorrencia.RESOLVIDA },
        data: { status: estado.status, resolvidaEm: null, reaberturas: { increment: 1 } },
      });
      if (!count) return null;
      const { id } = await tx.ocorrenciaEvento.create({
        data: {
          ocorrenciaId: estado.id,
          deStatus: evento.deStatus,
          paraStatus: evento.paraStatus,
          autorId: usuarioId,
          comentario: evento.comentario,
          criadoEm: evento.criadoEm,
        },
        select: { id: true },
      });
      return id;
    });
  }

  async avaliar(avaliacao: NovaAvaliacao): Promise<boolean> {
    // A chave (ocorrencia_id, usuario_id) barra a segunda avaliação, mesmo em paralelo.
    const { count } = await this.prisma.avaliacao.createMany({
      data: [avaliacao],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async confirmar(ocorrenciaId: string, usuarioId: string, criadaEm: Date): Promise<number | null> {
    // A chave (ocorrencia_id, usuario_id) barra a segunda confirmação, mesmo em paralelo.
    const { count } = await this.prisma.confirmacao.createMany({
      data: [{ ocorrenciaId, usuarioId, criadaEm }],
      skipDuplicates: true,
    });
    if (!count) return null;
    return this.prisma.confirmacao.count({ where: { ocorrenciaId } });
  }

  async semEnderecoCriadasAntes(antesDe: Date, limite: number): Promise<string[]> {
    const ocorrencias = await this.prisma.ocorrencia.findMany({
      where: { endereco: null, criadaEm: { lt: antesDe } },
      select: { id: true },
      orderBy: { criadaEm: 'asc' },
      take: limite,
    });
    return ocorrencias.map((ocorrencia) => ocorrencia.id);
  }
}
