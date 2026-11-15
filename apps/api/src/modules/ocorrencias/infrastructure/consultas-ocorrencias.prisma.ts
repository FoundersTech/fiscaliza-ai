import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  AreaMapa,
  ConsultasOcorrencias,
  DadosCard,
  DadosDetalhe,
  FiltroPublico,
  LinhaDoAutor,
  LinhaFeed,
  LinhaPontoMapa,
  PosicaoFeed,
  ReferenciaOriginal,
  VinculoGravado,
} from '../application/consultas.js';
import type { StatusOcorrencia } from '../domain/ocorrencia.js';

interface LinhaCardBanco {
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

interface LinhaDetalheBanco extends LinhaCardBanco {
  municipioId: number;
  autorId: string | null;
  autorApelido: string | null;
  atributos: Record<string, unknown>;
  triadaEm: Date | null;
  duplicadaDeId: string | null;
  reaberturas: number;
  originalProtocolo: string | null;
}

interface LinhaDoAutorBanco extends LinhaCardBanco {
  duplicadaDeId: string | null;
  originalProtocolo: string | null;
  justificativaRecusa: string | null;
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

/** Keyset: a comparação de tupla usa os índices que terminam em (criada_em DESC, id DESC). */
function depoisDaPosicao(depoisDe: PosicaoFeed | null): Prisma.Sql {
  return depoisDe
    ? Prisma.sql`AND (o.criada_em, o.id) < (${depoisDe.criadaEm}::timestamptz, ${depoisDe.id}::uuid)`
    : Prisma.empty;
}

const CONFIRMACOES = Prisma.sql`
  (SELECT count(*)::int FROM confirmacao cf WHERE cf.ocorrencia_id = o.id)`;

/** Colunas de um card, com `o` (ocorrência) e `c` (categoria) no FROM. */
const COLUNAS_CARD = Prisma.sql`
  o.id, o.protocolo, o.status, o.descricao, o.endereco,
  o.criada_em AS "criadaEm", o.resolvida_em AS "resolvidaEm",
  to_char(o.criada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "criadaEmExata",
  c.slug AS "categoriaSlug", c.nome AS "categoriaNome", c.icone AS "categoriaIcone",
  ${CONFIRMACOES} AS confirmacoes,
  (SELECT f.miniatura_key FROM ocorrencia_foto f
    WHERE f.ocorrencia_id = o.id AND f.moderacao = 'APROVADA'
      AND f.miniatura_key IS NOT NULL
    ORDER BY f.ordem LIMIT 1) AS "miniaturaKey"`;

function dadosCard(linha: LinhaCardBanco): DadosCard {
  return {
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
  };
}

function linhaFeed(linha: LinhaCardBanco): LinhaFeed {
  return { ...dadosCard(linha), posicao: { criadaEm: linha.criadaEmExata, id: linha.id } };
}

function referenciaOriginal(
  id: string | null,
  protocolo: string | null,
): ReferenciaOriginal | null {
  return id && protocolo ? { id, protocolo } : null;
}

@Injectable()
export class ConsultasOcorrenciasPrisma implements ConsultasOcorrencias {
  constructor(private readonly prisma: PrismaService) {}

  async feed(
    filtro: FiltroPublico,
    depoisDe: PosicaoFeed | null,
    limite: number,
  ): Promise<LinhaFeed[]> {
    const linhas = await this.prisma.$queryRaw<LinhaCardBanco[]>`
      SELECT ${COLUNAS_CARD}
      FROM ocorrencia o
      JOIN categoria c ON c.id = o.categoria_id
      JOIN municipio m ON m.id = o.municipio_id
      WHERE ${condicoes(filtro)} ${depoisDaPosicao(depoisDe)}
      ORDER BY o.criada_em DESC, o.id DESC
      LIMIT ${limite}::int`;
    return linhas.map(linhaFeed);
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

  async detalhe(id: string): Promise<DadosDetalhe | null> {
    // O apelido nem sai do banco quando o autor não quis aparecer.
    const [linha] = await this.prisma.$queryRaw<LinhaDetalheBanco[]>`
      SELECT ${COLUNAS_CARD},
             o.municipio_id AS "municipioId", o.autor_id AS "autorId", o.atributos,
             o.triada_em AS "triadaEm", o.duplicada_de_id AS "duplicadaDeId", o.reaberturas,
             CASE WHEN o.publicar_autor THEN u.apelido_publico END AS "autorApelido",
             orig.protocolo AS "originalProtocolo"
      FROM ocorrencia o
      JOIN categoria c ON c.id = o.categoria_id
      LEFT JOIN usuario u ON u.id = o.autor_id AND u.anonimizado_em IS NULL
      LEFT JOIN ocorrencia orig ON orig.id = o.duplicada_de_id
      WHERE o.id = ${id}::uuid`;
    if (!linha) return null;

    const [fotos, eventos] = await Promise.all([
      this.prisma.ocorrenciaFoto.findMany({
        where: { ocorrenciaId: id, moderacao: 'APROVADA', storageKey: { not: null } },
        orderBy: { ordem: 'asc' },
        select: { storageKey: true, miniaturaKey: true },
      }),
      this.prisma.ocorrenciaEvento.findMany({
        where: { ocorrenciaId: id },
        orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
        // Sem autor_id: quem mudou o status nunca sai em resposta pública.
        select: {
          deStatus: true,
          paraStatus: true,
          comentario: true,
          criadoEm: true,
          orgao: { select: { nome: true } },
        },
      }),
    ]);

    return {
      ...dadosCard(linha),
      municipioId: linha.municipioId,
      autorId: linha.autorId,
      autorApelido: linha.autorApelido,
      atributos: linha.atributos,
      triadaEm: linha.triadaEm,
      duplicadaDeId: linha.duplicadaDeId,
      reaberturas: linha.reaberturas,
      fotos: fotos.flatMap((foto) =>
        foto.storageKey ? [{ storageKey: foto.storageKey, miniaturaKey: foto.miniaturaKey }] : [],
      ),
      eventos: eventos.map((evento) => ({
        deStatus: evento.deStatus,
        paraStatus: evento.paraStatus,
        orgao: evento.orgao?.nome ?? null,
        comentario: evento.comentario,
        criadoEm: evento.criadoEm,
      })),
      original: referenciaOriginal(linha.duplicadaDeId, linha.originalProtocolo),
    };
  }

  async vinculo(ocorrenciaId: string, usuarioId: string): Promise<VinculoGravado> {
    const chave = { ocorrenciaId_usuarioId: { ocorrenciaId, usuarioId } };
    const [confirmacao, avaliacao] = await Promise.all([
      this.prisma.confirmacao.findUnique({ where: chave, select: { criadaEm: true } }),
      this.prisma.avaliacao.findUnique({ where: chave, select: { criadaEm: true } }),
    ]);
    return { confirmou: confirmacao !== null, avaliou: avaliacao !== null };
  }

  async doAutor(
    autorId: string,
    depoisDe: PosicaoFeed | null,
    limite: number,
  ): Promise<LinhaDoAutor[]> {
    // O índice (autor_id) filtra; a ordenação fica em memória, com poucas linhas por autor.
    const linhas = await this.prisma.$queryRaw<LinhaDoAutorBanco[]>`
      SELECT ${COLUNAS_CARD},
             o.duplicada_de_id AS "duplicadaDeId", orig.protocolo AS "originalProtocolo",
             CASE WHEN o.status = 'RECUSADA' THEN
               (SELECT e.comentario FROM ocorrencia_evento e
                 WHERE e.ocorrencia_id = o.id AND e.para_status = 'RECUSADA'
                 ORDER BY e.criado_em DESC, e.id DESC LIMIT 1)
             END AS "justificativaRecusa"
      FROM ocorrencia o
      JOIN categoria c ON c.id = o.categoria_id
      LEFT JOIN ocorrencia orig ON orig.id = o.duplicada_de_id
      WHERE o.autor_id = ${autorId}::uuid ${depoisDaPosicao(depoisDe)}
      ORDER BY o.criada_em DESC, o.id DESC
      LIMIT ${limite}::int`;
    return linhas.map((linha) => ({
      ...linhaFeed(linha),
      justificativaRecusa: linha.justificativaRecusa,
      original: referenciaOriginal(linha.duplicadaDeId, linha.originalProtocolo),
    }));
  }
}
