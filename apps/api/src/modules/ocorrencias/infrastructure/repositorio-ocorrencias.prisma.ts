import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { Ponto } from '../../territorio/domain/endereco.js';
import type {
  CandidataDuplicidade,
  CategoriaDoRegistro,
  NovaOcorrencia,
  OcorrenciaGravada,
  RepositorioOcorrencias,
  ResultadoGravacao,
} from '../application/portas.js';
import { ABERTAS, StatusOcorrencia } from '../domain/ocorrencia.js';
import { Protocolo } from '../domain/protocolo.js';

const CAMPOS = { id: true, autorId: true, protocolo: true, status: true } as const;

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
