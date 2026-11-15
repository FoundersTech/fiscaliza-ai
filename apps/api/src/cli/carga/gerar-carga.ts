import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { aplicarCargaInicial, SOROCABA } from '../seed/carga-inicial.js';
import type { BancoCarga } from './banco-carga.js';

const PRISMA_CLI = createRequire(import.meta.url).resolve('prisma/build/index.js');
const PASTA_API = fileURLToPath(new URL('../../..', import.meta.url));

/** Cidadãos sintéticos: autores das ocorrências e quem confirma ("Também vi"). */
const CIDADAOS = 5000;

/** Centro de Sorocaba: a maior parte dos pontos fica em volta dele, como num uso real. */
const CENTRO = { lng: -47.4584, lat: -23.5015 } as const;

const TEXTO_DESCRICAO =
  'Buraco grande na pista, com risco para motos e carros. Os moradores já reclamaram várias ' +
  'vezes e nada foi feito até agora; à noite a rua fica escura e piora a situação para quem ' +
  'passa a pé. Pedimos a avaliação do órgão e o conserto o quanto antes, por favor.';

function criarPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

async function etapa<T>(nome: string, acao: () => Promise<T>): Promise<T> {
  const inicio = performance.now();
  const resultado = await acao();
  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
  const linhas = typeof resultado === 'number' ? ` (${resultado} linhas)` : '';
  console.log(`- ${nome}${linhas}: ${segundos} s`);
  return resultado;
}

/** O nome já passou pela conferência de lerBancoCarga (só letras minúsculas, números e _). */
function identificador(banco: BancoCarga): Prisma.Sql {
  return Prisma.raw(`"${banco.nome}"`);
}

/** Apaga o banco sintético, desconectando quem ainda estiver nele. */
export async function apagarBancoCarga(banco: BancoCarga): Promise<void> {
  const manutencao = criarPrisma(banco.urlManutencao);
  try {
    await manutencao.$executeRaw`DROP DATABASE IF EXISTS ${identificador(banco)} WITH (FORCE)`;
  } finally {
    await manutencao.$disconnect();
  }
}

async function recriarBanco(banco: BancoCarga): Promise<void> {
  await apagarBancoCarga(banco);
  const manutencao = criarPrisma(banco.urlManutencao);
  try {
    await manutencao.$executeRaw`CREATE DATABASE ${identificador(banco)}`;
  } finally {
    await manutencao.$disconnect();
  }
  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: PASTA_API,
    env: { ...process.env, DATABASE_URL: banco.url },
    stdio: 'pipe',
  });
}

export interface ResumoCarga {
  ocorrencias: number;
  eventos: number;
  fotos: number;
  confirmacoes: number;
}

/**
 * Recria o banco sintético do zero (migrations e carga inicial) e o enche de ocorrências em
 * Sorocaba. Tudo é gerado no próprio Postgres, com INSERT … SELECT generate_series, sem
 * passar linha a linha pelo Prisma.
 */
export async function gerarCarga(banco: BancoCarga, quantidade: number): Promise<ResumoCarga> {
  await etapa('banco recriado e migrado', () => recriarBanco(banco));

  const prisma = criarPrisma(banco.url);
  try {
    await etapa('carga inicial (Sorocaba, órgão e categorias)', () => aplicarCargaInicial(prisma));
    await etapa(
      'cidadãos',
      () => prisma.$executeRaw`
        INSERT INTO usuario (nome, apelido_publico, email, papel)
        SELECT 'Cidadão sintético ' || g, 'cidadao' || g, 'carga' || g || '@fiscaliza.test',
               'CIDADAO'
        FROM generate_series(1, ${CIDADAOS}::int) g`,
    );

    // Pontos dentro do polígono do município: 60% concentrados perto do centro (distribuição
    // normal) e 40% espalhados pela área toda. Sobram candidatos para descartar os de fora.
    await prisma.$executeRaw`
      CREATE UNLOGGED TABLE carga_base (
        id uuid PRIMARY KEY, ponto geometry(Point, 4326) NOT NULL, criada_em timestamptz NOT NULL,
        r_status float8 NOT NULL, r_autor float8 NOT NULL, r_categoria float8 NOT NULL)`;
    await etapa(
      'pontos sorteados dentro de Sorocaba',
      () => prisma.$executeRaw`
        WITH m AS (
          SELECT area, ST_XMin(area) AS x0, ST_XMax(area) AS x1,
                 ST_YMin(area) AS y0, ST_YMax(area) AS y1
          FROM municipio WHERE id = ${SOROCABA.id}::int
        ),
        candidatos AS (
          SELECT CASE WHEN random() < 0.6
            THEN ST_SetSRID(ST_MakePoint(
              ${CENTRO.lng}::float8 + 0.035 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random()),
              ${CENTRO.lat}::float8 + 0.030 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random())),
              4326)
            ELSE ST_SetSRID(ST_MakePoint(m.x0 + random() * (m.x1 - m.x0),
                                         m.y0 + random() * (m.y1 - m.y0)), 4326)
          END AS ponto
          FROM m, generate_series(1, ${quantidade * 3}::int)
        )
        INSERT INTO carga_base (id, ponto, criada_em, r_status, r_autor, r_categoria)
        SELECT gen_random_uuid(), c.ponto,
               now() - power(random(), 1.5) * interval '730 days',
               random(), random(), random()
        FROM candidatos c, m
        WHERE ST_Intersects(c.ponto, m.area)
        LIMIT ${quantidade}::int`,
    );

    // Dois anos de histórico (mais ocorrências recentes), status com proporção de uso real e
    // protocolo sequencial por ano, como o registro gera.
    const ocorrencias = await etapa(
      'ocorrências',
      () => prisma.$executeRaw`
        WITH autores AS (
          SELECT array_agg(id) AS ids, count(*)::int AS n FROM usuario WHERE papel = 'CIDADAO'
        ),
        categorias AS (SELECT array_agg(id ORDER BY id) AS ids, count(*)::int AS n FROM categoria),
        orgao AS (SELECT id FROM orgao WHERE municipio_id = ${SOROCABA.id}::int),
        b AS (
          SELECT cb.*, extract(year FROM cb.criada_em)::int AS ano,
                 row_number() OVER (PARTITION BY extract(year FROM cb.criada_em)
                                    ORDER BY cb.criada_em, cb.id) AS seq,
                 (CASE WHEN cb.r_status < 0.30 THEN 'RECEBIDA'
                       WHEN cb.r_status < 0.45 THEN 'EM_ANALISE'
                       WHEN cb.r_status < 0.60 THEN 'EM_EXECUCAO'
                       WHEN cb.r_status < 0.90 THEN 'RESOLVIDA'
                       WHEN cb.r_status < 0.96 THEN 'RECUSADA'
                       ELSE 'DUPLICADA' END)::status_ocorrencia AS status
          FROM carga_base cb
        )
        INSERT INTO ocorrencia (id, protocolo, autor_id, publicar_autor, categoria_id,
                                municipio_id, orgao_id, descricao, local, precisao_m, endereco,
                                status, criada_em, triada_em, resolvida_em)
        SELECT b.id,
               format('FA-%s-%s-%s', b.ano, ${SOROCABA.sigla}::text, lpad(b.seq::text, 6, '0')),
               autores.ids[1 + floor(b.r_autor * autores.n)::int],
               random() < 0.3,
               categorias.ids[1 + floor(b.r_categoria * categorias.n)::int],
               ${SOROCABA.id}::int, orgao.id,
               left(format('Ocorrência sintética %s-%s. %s', b.ano, b.seq, ${TEXTO_DESCRICAO}::text),
                    40 + floor(random() * 260)::int),
               b.ponto::geography,
               CASE WHEN random() < 0.8 THEN (5 + random() * 40)::int END,
               format('Rua Sintética, %s - Sorocaba', 1 + floor(random() * 3000)::int),
               b.status, b.criada_em,
               CASE WHEN b.status <> 'RECEBIDA'
                 THEN least(now(), b.criada_em + random() * interval '3 days') END,
               CASE WHEN b.status = 'RESOLVIDA'
                 THEN least(now(), b.criada_em + interval '3 days' + random() * interval '40 days')
               END
        FROM b, autores, categorias, orgao`,
    );
    await prisma.$executeRaw`DROP TABLE carga_base`;

    await etapa(
      'sequência dos protocolos',
      () => prisma.$executeRaw`
        INSERT INTO protocolo_sequencia (municipio_id, ano, ultimo)
        SELECT ${SOROCABA.id}::int, extract(year FROM criada_em)::smallint, count(*)
        FROM ocorrencia GROUP BY 2
        ON CONFLICT (municipio_id, ano)
          DO UPDATE SET ultimo = greatest(protocolo_sequencia.ultimo, EXCLUDED.ultimo)`,
    );

    const criacao = await etapa(
      'eventos de criação',
      () => prisma.$executeRaw`
        INSERT INTO ocorrencia_evento (ocorrencia_id, de_status, para_status, autor_id, criado_em)
        SELECT id, NULL, 'RECEBIDA', autor_id, criada_em FROM ocorrencia`,
    );
    const transicoes = await etapa(
      'eventos de triagem',
      () => prisma.$executeRaw`
        INSERT INTO ocorrencia_evento (ocorrencia_id, de_status, para_status, orgao_id,
                                       comentario, criado_em)
        SELECT id, 'RECEBIDA', status, orgao_id,
               CASE status
                 WHEN 'RECUSADA' THEN 'Fora da competência do órgão (dado sintético).'
                 WHEN 'RESOLVIDA' THEN 'Serviço concluído pela equipe (dado sintético).'
               END,
               coalesce(resolvida_em, triada_em)
        FROM ocorrencia WHERE status <> 'RECEBIDA'`,
    );

    const fotos = await etapa(
      'fotos aprovadas',
      () => prisma.$executeRaw`
        INSERT INTO ocorrencia_foto (ocorrencia_id, ordem, storage_key, miniatura_key, largura,
                                     altura, bytes, moderacao, exif_removido_em, criada_em)
        SELECT id, 1, 'carga/' || id || '/1.webp', 'carga/' || id || '/1-mini.webp',
               1600, 1200, 250000, 'APROVADA', criada_em, criada_em
        FROM ocorrencia WHERE random() < 0.85`,
    );

    // Poucas confirmações na maioria e muitas em algumas, para o selo de urgente aparecer.
    // O "0 * o.reaberturas" amarra o sorteio a cada ocorrência (senão ele roda uma vez só).
    const confirmacoes = await etapa(
      'confirmações',
      () => prisma.$executeRaw`
        WITH autores AS (
          SELECT array_agg(id) AS ids, count(*)::int AS n FROM usuario WHERE papel = 'CIDADAO'
        )
        INSERT INTO confirmacao (ocorrencia_id, usuario_id, criada_em)
        SELECT o.id, autores.ids[1 + floor(random() * autores.n)::int],
               least(now(), o.criada_em + random() * interval '2 days')
        FROM autores, ocorrencia o
        CROSS JOIN LATERAL generate_series(1, floor(power(random(), 4) * 12 + 0 * o.reaberturas)::int)
        ON CONFLICT DO NOTHING`,
    );

    await etapa('estatísticas do planejador (ANALYZE)', () => prisma.$executeRaw`ANALYZE`);
    return { ocorrencias, eventos: criacao + transicoes, fotos, confirmacoes };
  } finally {
    await prisma.$disconnect();
  }
}
