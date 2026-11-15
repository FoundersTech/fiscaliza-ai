import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';
import type { ConsultasPainel, FiltroPainel } from '../application/portas.js';
import type { CategoriaContada, ContagensPainel } from '../domain/painel.js';

const SEGUNDOS_POR_DIA = 86400;

function condicoes(filtro: FiltroPainel, status: StatusOcorrencia[], desde: Date): Prisma.Sql {
  const partes = [
    Prisma.sql`o.status = ANY(${status}::status_ocorrencia[])`,
    Prisma.sql`m.ativo`,
    Prisma.sql`o.criada_em >= ${desde}::timestamptz`,
  ];
  if (filtro.municipioId !== null) {
    partes.push(Prisma.sql`o.municipio_id = ${filtro.municipioId}::int`);
  }
  if (filtro.categorias !== null) {
    partes.push(Prisma.sql`c.slug = ANY(${filtro.categorias}::text[])`);
  }
  return Prisma.join(partes, ' AND ');
}

@Injectable()
export class ConsultasPainelPrisma implements ConsultasPainel {
  constructor(private readonly prisma: PrismaService) {}

  async contar(
    filtro: FiltroPainel,
    status: StatusOcorrencia[],
    desde: Date,
  ): Promise<ContagensPainel> {
    const onde = condicoes(filtro, status, desde);
    const [porCategoria, [mediana]] = await Promise.all([
      this.prisma.$queryRaw<CategoriaContada[]>`
        SELECT c.slug, c.nome, c.icone,
               count(*)::int AS total,
               (count(*) FILTER (WHERE o.status = 'RESOLVIDA'))::int AS resolvidas
        FROM ocorrencia o
        JOIN categoria c ON c.id = o.categoria_id
        JOIN municipio m ON m.id = o.municipio_id
        WHERE ${onde}
        GROUP BY c.slug, c.nome, c.icone`,
      // Mediana do tempo de atendimento, em dias, entre as resolvidas.
      this.prisma.$queryRaw<{ dias: number | null }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM o.resolvida_em - o.criada_em) / ${SEGUNDOS_POR_DIA}::int
               ) AS dias
        FROM ocorrencia o
        JOIN categoria c ON c.id = o.categoria_id
        JOIN municipio m ON m.id = o.municipio_id
        WHERE ${onde} AND o.status = 'RESOLVIDA' AND o.resolvida_em IS NOT NULL`,
    ]);

    return {
      total: porCategoria.reduce((soma, categoria) => soma + categoria.total, 0),
      resolvidas: porCategoria.reduce((soma, categoria) => soma + categoria.resolvidas, 0),
      diasMediana: mediana?.dias ?? null,
      porCategoria,
    };
  }
}
