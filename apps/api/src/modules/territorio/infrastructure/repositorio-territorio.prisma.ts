import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CampoAtributo } from '../../ocorrencias/domain/schema-atributos.js';
import type { Ponto } from '../domain/endereco.js';
import type {
  CategoriaAtiva,
  MunicipioAtendido,
  RepositorioTerritorio,
  Territorio,
} from '../application/portas.js';

interface LinhaMunicipio {
  id: number;
  nome: string;
  uf: string;
  lat: number;
  lng: number;
  sul: number;
  oeste: number;
  norte: number;
  leste: number;
}

@Injectable()
export class RepositorioTerritorioPrisma implements RepositorioTerritorio {
  constructor(private readonly prisma: PrismaService) {}

  async localizar({ lat, lng }: Ponto): Promise<Territorio | null> {
    const [territorio] = await this.prisma.$queryRaw<Territorio[]>`
      SELECT m.id AS "municipioId", m.sigla AS "municipioSigla", o.id AS "orgaoId"
      FROM municipio m
      JOIN orgao o ON o.municipio_id = m.id
      WHERE m.ativo
        AND ST_Contains(m.area, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326))
      LIMIT 1`;
    return territorio ?? null;
  }

  async municipioAtendido(): Promise<MunicipioAtendido | null> {
    // O centroide de um polígono côncavo pode cair fora dele; aí vale um ponto da superfície.
    const [linha] = await this.prisma.$queryRaw<LinhaMunicipio[]>`
      SELECT id, nome, uf, ST_Y(centro) AS lat, ST_X(centro) AS lng,
             ST_YMin(area) AS sul, ST_XMin(area) AS oeste, ST_YMax(area) AS norte, ST_XMax(area) AS leste
      FROM (
        SELECT m.*, CASE WHEN ST_Contains(m.area, ST_Centroid(m.area)) THEN ST_Centroid(m.area)
                         ELSE ST_PointOnSurface(m.area) END AS centro
        FROM municipio m
        JOIN orgao o ON o.municipio_id = m.id
        WHERE m.ativo
        ORDER BY m.id
        LIMIT 1
      ) atendido`;
    if (!linha) return null;

    const { id, nome, uf, lat, lng, sul, oeste, norte, leste } = linha;
    return { id, nome, uf, centro: { lat, lng }, bbox: { sul, oeste, norte, leste } };
  }

  async categoriasAtivas(): Promise<CategoriaAtiva[]> {
    const categorias = await this.prisma.categoria.findMany({
      where: { ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, slug: true, nome: true, icone: true, schemaAtributos: true },
    });
    // O schema é validado ao salvar a categoria.
    return categorias.map((categoria) => ({
      ...categoria,
      schemaAtributos: categoria.schemaAtributos as unknown as CampoAtributo[],
    }));
  }
}
