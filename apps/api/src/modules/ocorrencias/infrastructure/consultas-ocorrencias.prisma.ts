import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  AreaMapa,
  ConsultasOcorrencias,
  FiltroPublico,
  LinhaFeed,
  LinhaPontoMapa,
  PosicaoFeed,
} from '../application/consultas.js';
import type { StatusOcorrencia } from '../domain/ocorrencia.js';

interface LinhaFeedBanco {
  id: string;
  protocolo: string;
  status: StatusOcorrencia;
  descricao: string;
  endereco: string | null;
  criadaEm: Date;
  criadaEmExata: string;
  resolvidaEm: Date | null;
  categoriaSlug: string;
  categoriaNome: string;
  categoriaIcone: string;
  confirmacoes: number;
  miniaturaKey: string | null;
}

/** Condições comuns ao feed e ao mapa: município ativo, status visíveis e categorias. */
function condicoes(filtro: FiltroPublico): Prisma.Sql {
  const partes = [
    Prisma.sql`o.status = ANY(${filtro.status}::status_ocorrencia[])`,
    Prisma.sql`m.ativo`,
  ];
  if (filtro.municipioId !== null) {
    partes.push(Prisma.sql`o.municipio_id = ${filtro.municipioId}::int`);
  }
  if (filtro.categorias !== null) {
    partes.push(Prisma.sql`c.slug = ANY(${filtro.categorias}::text[])`);
  }
  return Prisma.join(partes, ' AND ');
}

const CONFIRMACOES = Prisma.sql`
  (SELECT count(*)::int FROM confirmacao cf WHERE cf.ocorrencia_id = o.id)`;

@Injectable()
export class ConsultasOcorrenciasPrisma implements ConsultasOcorrencias {
  constructor(private readonly prisma: PrismaService) {}

  async feed(
    filtro: FiltroPublico,
    depoisDe: PosicaoFeed | null,
    limite: number,
  ): Promise<LinhaFeed[]> {
    // Keyset: a comparação de tupla usa o índice (municipio_id, criada_em DESC, id DESC).
    const posicao = depoisDe
      ? Prisma.sql`AND (o.criada_em, o.id) < (${depoisDe.criadaEm}::timestamptz, ${depoisDe.id}::uuid)`
      : Prisma.empty;
    const linhas = await this.prisma.$queryRaw<LinhaFeedBanco[]>`
      SELECT o.id, o.protocolo, o.status, o.descricao, o.endereco,
             o.criada_em AS "criadaEm", o.resolvida_em AS "resolvidaEm",
             to_char(o.criada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "criadaEmExata",
             c.slug AS "categoriaSlug", c.nome AS "categoriaNome", c.icone AS "categoriaIcone",
             ${CONFIRMACOES} AS confirmacoes,
             (SELECT f.miniatura_key FROM ocorrencia_foto f
               WHERE f.ocorrencia_id = o.id AND f.moderacao = 'APROVADA'
                 AND f.miniatura_key IS NOT NULL
               ORDER BY f.ordem LIMIT 1) AS "miniaturaKey"
      FROM ocorrencia o
      JOIN categoria c ON c.id = o.categoria_id
      JOIN municipio m ON m.id = o.municipio_id
      WHERE ${condicoes(filtro)} ${posicao}
      ORDER BY o.criada_em DESC, o.id DESC
      LIMIT ${limite}::int`;

    return linhas.map((linha) => ({
      id: linha.id,
      protocolo: linha.protocolo,
      status: linha.status,
      descricao: linha.descricao,
      endereco: linha.endereco,
      criadaEm: linha.criadaEm,
      resolvidaEm: linha.resolvidaEm,
      categoria: {
        slug: linha.categoriaSlug,
        nome: linha.categoriaNome,
        icone: linha.categoriaIcone,
      },
      confirmacoes: linha.confirmacoes,
      miniaturaKey: linha.miniaturaKey,
      posicao: { criadaEm: linha.criadaEmExata, id: linha.id },
    }));
  }

  pontosNaArea(filtro: FiltroPublico, area: AreaMapa, limite: number): Promise<LinhaPontoMapa[]> {
    const envelope = Prisma.sql`ST_MakeEnvelope(${area.oeste}::float8, ${area.sul}::float8,
      ${area.leste}::float8, ${area.norte}::float8, 4326)`;
    // O && em `local` usa o índice GiST; a conferência exata é no ponto público, o que aparece.
    return this.prisma.$queryRaw<LinhaPontoMapa[]>`
      SELECT o.id,
             ST_Y(o.local_publico::geometry) AS lat, ST_X(o.local_publico::geometry) AS lng,
             o.status, c.slug AS "categoriaSlug", ${CONFIRMACOES} AS confirmacoes
      FROM ocorrencia o
      JOIN categoria c ON c.id = o.categoria_id
      JOIN municipio m ON m.id = o.municipio_id
      WHERE ${condicoes(filtro)}
        AND o.local && ${envelope}::geography
        AND ST_Intersects(o.local_publico::geometry, ${envelope})
      ORDER BY o.criada_em DESC, o.id DESC
      LIMIT ${limite}::int`;
  }
}
