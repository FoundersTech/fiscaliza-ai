import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Carga inicial: Sorocaba, o órgão único do município
 * e as 4 categorias com prazo provisório. Pode rodar quantas vezes for preciso: o que já existe
 * não é duplicado nem sobrescrito, para não desfazer edições feitas pelos administradores.
 */

export const SOROCABA = {
  id: 3552205,
  nome: 'Sorocaba',
  uf: 'SP',
  sigla: 'SOR',
} as const;

/** Nome e sigla iniciais do órgão; o ADMIN_MUNICIPIO pode editá-los. */
const ORGAO_SOROCABA = { nome: 'Prefeitura de Sorocaba', sigla: 'PMS' } as const;

/** Prazos iniciais, ajustáveis pelo admin. `icone` é um nome do Material Icons. */
export const CATEGORIAS = [
  { slug: 'pavimentacao', nome: 'Pavimentação', icone: 'add_road', slaDias: 30 },
  { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', slaDias: 15 },
  { slug: 'limpeza-urbana', nome: 'Limpeza urbana', icone: 'cleaning_services', slaDias: 7 },
  { slug: 'agua-esgoto', nome: 'Água e esgoto', icone: 'water_drop', slaDias: 10 },
] as const;

/**
 * Malha municipal da API do IBGE, baixada em 29/10/2026 com qualidade máxima:
 * https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3552205?formato=application/vnd.geo%2Bjson&qualidade=maxima
 * As coordenadas estão em SIRGAS 2000 (EPSG:4674) e são convertidas para 4326 na gravação.
 */
const CAMINHO_MALHA = fileURLToPath(
  new URL(`../../../prisma/dados/municipio-${SOROCABA.id}.geojson`, import.meta.url),
);

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
  municipioId: number;
  orgaoId: number;
  categorias: number;
}

export function lerMalhaMunicipal(caminho = CAMINHO_MALHA): string {
  const malha = esquemaMalha.parse(JSON.parse(readFileSync(caminho, 'utf8')));
  return JSON.stringify(malha.features[0]!.geometry);
}

export async function aplicarCargaInicial(prisma: PrismaClient): Promise<ResumoCargaInicial> {
  const geometria = lerMalhaMunicipal();

  // O polígono pode ser atualizado; nome, sigla e `ativo` ficam como estiverem.
  await prisma.$executeRaw`
    INSERT INTO municipio (id, nome, uf, sigla, ativo, area)
    VALUES (${SOROCABA.id}, ${SOROCABA.nome}, ${SOROCABA.uf}, ${SOROCABA.sigla}, true,
            ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geometria}::text), 4674), 4326)))
    ON CONFLICT (id) DO UPDATE SET area = EXCLUDED.area`;

  const orgao = await prisma.orgao.upsert({
    where: { municipioId: SOROCABA.id },
    create: { municipioId: SOROCABA.id, ...ORGAO_SOROCABA },
    update: {},
  });

  for (const categoria of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { slug: categoria.slug },
      create: categoria,
      update: {},
    });
  }

  return { municipioId: SOROCABA.id, orgaoId: orgao.id, categorias: CATEGORIAS.length };
}
