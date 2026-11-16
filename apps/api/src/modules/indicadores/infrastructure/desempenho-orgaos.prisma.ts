import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  AgregadoOrgao,
  CategoriaDesempenho,
  DesempenhoOrgao,
  DesempenhoOrgaos,
  OrgaoAtivo,
} from '../application/portas.js';

const SEGUNDOS_POR_DIA = 86400;

/** Como a categoria fica guardada no JSON de `desempenho_orgao.por_categoria`. */
interface CategoriaGuardada {
  categoria_id: number;
  nome: string;
  total: number;
  resolvidas: number;
}

interface LinhaContagens {
  total: number;
  resolvidas: number;
  no_prazo: number;
  dias_mediana: number | null;
}

interface LinhaAvaliacoes {
  avaliacoes: number;
  satisfacao_media: number | null;
}

type DesempenhoGuardado = Prisma.DesempenhoOrgaoGetPayload<object>;

function numero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : valor.toNumber();
}

function categoriasGuardadas(valor: Prisma.JsonValue): CategoriaDesempenho[] {
  if (!Array.isArray(valor)) return [];
  return (valor as unknown as CategoriaGuardada[]).map((categoria) => ({
    categoriaId: categoria.categoria_id,
    nome: categoria.nome,
    total: categoria.total,
    resolvidas: categoria.resolvidas,
  }));
}

function desempenhoDe(linha: DesempenhoGuardado): DesempenhoOrgao {
  return {
    orgaoId: linha.orgaoId,
    municipioId: linha.municipioId,
    janelaDias: linha.janelaDias,
    total: linha.total,
    resolvidas: linha.resolvidas,
    noPrazo: linha.noPrazo,
    diasMediana: numero(linha.diasMediana),
    avaliacoes: linha.avaliacoes,
    satisfacaoMedia: numero(linha.satisfacaoMedia),
    score: numero(linha.score),
    classificacao: linha.classificacao,
    porCategoria: categoriasGuardadas(linha.porCategoria),
    calculadoEm: linha.calculadoEm,
  };
}

@Injectable()
export class DesempenhoOrgaosPrisma implements DesempenhoOrgaos {
  constructor(private readonly prisma: PrismaService) {}

  async orgaosAtivos(): Promise<OrgaoAtivo[]> {
    return this.prisma.$queryRaw<OrgaoAtivo[]>`
      SELECT o.id AS "orgaoId", o.municipio_id AS "municipioId"
      FROM orgao o
      JOIN municipio m ON m.id = o.municipio_id
      WHERE o.ativo = true AND m.ativo = true
      ORDER BY o.id`;
  }

  async agregar(orgaoId: number, janelaDias: number, agora: Date): Promise<AgregadoOrgao> {
    // Ocorrências do órgão na janela; as duplicadas ficam de fora, as recusadas contam.
    const naJanela = Prisma.sql`
      oc.orgao_id = ${orgaoId}::int
      AND oc.status <> 'DUPLICADA'
      AND oc.criada_em >= ${agora}::timestamptz - make_interval(days => ${janelaDias}::int)`;

    const [[contagens], [avaliacoes], porCategoria] = await Promise.all([
      this.prisma.$queryRaw<LinhaContagens[]>`
        SELECT count(*)::int AS total,
               (count(*) FILTER (WHERE oc.status = 'RESOLVIDA'))::int AS resolvidas,
               (count(*) FILTER (
                  WHERE oc.status = 'RESOLVIDA'
                    AND oc.resolvida_em IS NOT NULL
                    AND oc.resolvida_em <= oc.criada_em + (c.sla_dias * interval '1 day')
               ))::int AS no_prazo,
               (percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY extract(epoch FROM oc.resolvida_em - oc.criada_em)
                           / ${SEGUNDOS_POR_DIA}::int
               ) FILTER (
                  WHERE oc.status = 'RESOLVIDA' AND oc.resolvida_em IS NOT NULL
               ))::float8 AS dias_mediana
        FROM ocorrencia oc
        JOIN categoria c ON c.id = oc.categoria_id
        WHERE ${naJanela}`,
      this.prisma.$queryRaw<LinhaAvaliacoes[]>`
        SELECT count(*)::int AS avaliacoes, avg(a.nota)::float8 AS satisfacao_media
        FROM avaliacao a
        JOIN ocorrencia oc ON oc.id = a.ocorrencia_id
        WHERE ${naJanela}`,
      this.prisma.$queryRaw<CategoriaDesempenho[]>`
        SELECT c.id::int AS "categoriaId", c.nome,
               count(*)::int AS total,
               (count(*) FILTER (WHERE oc.status = 'RESOLVIDA'))::int AS resolvidas
        FROM ocorrencia oc
        JOIN categoria c ON c.id = oc.categoria_id
        WHERE ${naJanela}
        GROUP BY c.id, c.nome
        ORDER BY total DESC, c.nome ASC`,
    ]);

    const quantasAvaliacoes = avaliacoes?.avaliacoes ?? 0;
    return {
      total: contagens?.total ?? 0,
      resolvidas: contagens?.resolvidas ?? 0,
      noPrazo: contagens?.no_prazo ?? 0,
      diasMediana: contagens?.dias_mediana ?? null,
      avaliacoes: quantasAvaliacoes,
      satisfacaoMedia: quantasAvaliacoes === 0 ? null : (avaliacoes?.satisfacao_media ?? null),
      porCategoria: porCategoria.filter((categoria) => categoria.total > 0),
    };
  }

  async gravar(desempenho: DesempenhoOrgao): Promise<void> {
    const porCategoria: CategoriaGuardada[] = desempenho.porCategoria.map((categoria) => ({
      categoria_id: categoria.categoriaId,
      nome: categoria.nome,
      total: categoria.total,
      resolvidas: categoria.resolvidas,
    }));
    const dados = {
      municipioId: desempenho.municipioId,
      janelaDias: desempenho.janelaDias,
      total: desempenho.total,
      resolvidas: desempenho.resolvidas,
      noPrazo: desempenho.noPrazo,
      avaliacoes: desempenho.avaliacoes,
      diasMediana: desempenho.diasMediana,
      satisfacaoMedia: desempenho.satisfacaoMedia,
      score: desempenho.score,
      classificacao: desempenho.classificacao,
      porCategoria: porCategoria as unknown as Prisma.InputJsonValue,
      calculadoEm: desempenho.calculadoEm,
    };
    await this.prisma.desempenhoOrgao.upsert({
      where: { orgaoId: desempenho.orgaoId },
      create: { orgaoId: desempenho.orgaoId, ...dados },
      update: dados,
    });
  }

  async ler(
    municipioId: number | null,
  ): Promise<{ desempenho: DesempenhoOrgao | null } | undefined> {
    const orgao = await this.prisma.orgao.findFirst({
      where: {
        ativo: true,
        municipio: { ativo: true },
        ...(municipioId === null ? {} : { municipioId }),
      },
      orderBy: { municipioId: 'asc' },
      include: { desempenho: true },
    });
    if (!orgao) return undefined;
    return { desempenho: orgao.desempenho ? desempenhoDe(orgao.desempenho) : null };
  }
}
