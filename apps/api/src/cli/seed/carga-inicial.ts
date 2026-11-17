import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Carga inicial: os municípios atendidos, o órgão único de cada um
 * e as 4 categorias com prazo provisório. Pode rodar quantas vezes for preciso: o que já existe
 * não é duplicado nem sobrescrito, para não desfazer edições feitas pelos administradores.
 */

interface MunicipioCarga {
  id: number;
  nome: string;
  uf: string;
  sigla: string;
  orgao: { nome: string; sigla: string };
}

export const MUNICIPIOS = [
  {
    id: 3552205,
    nome: 'Sorocaba',
    uf: 'SP',
    sigla: 'SOR',
    orgao: { nome: 'Prefeitura de Sorocaba', sigla: 'PMS' },
  },
  {
    id: 3557006,
    nome: 'Votorantim',
    uf: 'SP',
    sigla: 'VOT',
    orgao: { nome: 'Prefeitura de Votorantim', sigla: 'PMV' },
  },
  {
    id: 3545308,
    nome: 'Salto de Pirapora',
    uf: 'SP',
    sigla: 'SPI',
    orgao: { nome: 'Prefeitura de Salto de Pirapora', sigla: 'PMSP' },
  },
] as const satisfies readonly MunicipioCarga[];

export const SOROCABA = MUNICIPIOS[0];

/** Prazos iniciais, ajustáveis pelo admin. `icone` é um nome do Material Icons. */
export const CATEGORIAS = [
  { slug: 'pavimentacao', nome: 'Pavimentação', icone: 'add_road', slaDias: 30 },
  { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', slaDias: 15 },
  { slug: 'limpeza-urbana', nome: 'Limpeza urbana', icone: 'cleaning_services', slaDias: 7 },
  { slug: 'agua-esgoto', nome: 'Água e esgoto', icone: 'water_drop', slaDias: 10 },
] as const;

/**
 * Malhas municipais da API do IBGE, baixadas com qualidade máxima:
 * https://servicodados.ibge.gov.br/api/v3/malhas/municipios/<id>?formato=application/vnd.geo%2Bjson&qualidade=maxima
 * As coordenadas estão em SIRGAS 2000 (EPSG:4674) e são convertidas para 4326 na gravação.
 */
function caminhoMalha(municipioId: number): string {
  return fileURLToPath(
    new URL(`../../../prisma/dados/municipio-${municipioId}.geojson`, import.meta.url),
  );
}

const esquemaMalha = z.object({
  type: z.literal('FeatureCollection'),
  features: z
    .array(
      z.object({
        geometry: z.object({
          type: z.enum(['Polygon', 'MultiPolygon']),
          coordinates: z.array(z.unknown()),
        }),
      }),
    )
    .length(1),
});

export interface ResumoCargaInicial {
  /** Sorocaba, que os dados de desenvolvimento e os testes usam como referência. */
  municipioId: number;
  orgaoId: number;
  municipios: number;
  categorias: number;
}

export function lerMalhaMunicipal(caminho: string): string {
  const malha = esquemaMalha.parse(JSON.parse(readFileSync(caminho, 'utf8')));
  return JSON.stringify(malha.features[0]!.geometry);
}

async function aplicarMunicipio(prisma: PrismaClient, municipio: MunicipioCarga): Promise<number> {
  const geometria = lerMalhaMunicipal(caminhoMalha(municipio.id));

  // O polígono pode ser atualizado; nome, sigla e `ativo` ficam como estiverem.
  await prisma.$executeRaw`
    INSERT INTO municipio (id, nome, uf, sigla, ativo, area)
    VALUES (${municipio.id}, ${municipio.nome}, ${municipio.uf}, ${municipio.sigla}, true,
            ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geometria}::text), 4674), 4326)))
    ON CONFLICT (id) DO UPDATE SET area = EXCLUDED.area`;

  const orgao = await prisma.orgao.upsert({
    where: { municipioId: municipio.id },
    create: { municipioId: municipio.id, ...municipio.orgao },
    update: {},
  });
  return orgao.id;
}

export async function aplicarCargaInicial(prisma: PrismaClient): Promise<ResumoCargaInicial> {
  const orgaos = new Map<number, number>();
  for (const municipio of MUNICIPIOS) {
    orgaos.set(municipio.id, await aplicarMunicipio(prisma, municipio));
  }

  for (const categoria of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { slug: categoria.slug },
      create: categoria,
      update: {},
    });
  }

  return {
    municipioId: SOROCABA.id,
    orgaoId: orgaos.get(SOROCABA.id)!,
    municipios: MUNICIPIOS.length,
    categorias: CATEGORIAS.length,
  };
}
