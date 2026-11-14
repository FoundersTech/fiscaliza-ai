import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import type { Card } from '../application/card.js';
import type { PaginaFeed } from '../application/listar-feed.js';
import type { PontoMapa, ResultadoMapa } from '../application/listar-mapa.js';
import { StatusPublico } from '../domain/exibicao-publica.js';

export const LIMITE_PADRAO_FEED = 20;
const LIMITE_MAXIMO_FEED = 50;
const STATUS_PUBLICOS = Object.values(StatusPublico);

/** `a,b` ou `?x=a&x=b` viram ['a', 'b']; vazio vira undefined (sem filtro). */
export const lista = Transform(({ value }: { value: unknown }) => {
  const valores = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === 'string')
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  return valores.length ? valores : undefined;
});

// Texto vazio continua vazio, para não virar 0 e passar como número.
export const inteiro = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
);

/** Filtros comuns ao feed e ao mapa. Todos combinam entre si. */
export class FiltrosPublicosQuery {
  @ApiPropertyOptional({
    example: 3552205,
    description: 'Código IBGE; sem ele, todos os municípios atendidos',
  })
  @IsOptional()
  @inteiro
  @IsInt({ message: 'informe o código IBGE do município' })
  municipio?: number;

  @ApiPropertyOptional({
    type: String,
    example: 'RECEBIDO,EM_ANDAMENTO',
    description: `Status como aparecem no app, separados por vírgula: ${STATUS_PUBLICOS.join(', ')}`,
  })
  @IsOptional()
  @lista
  @IsIn(STATUS_PUBLICOS, {
    each: true,
    message: `use status entre ${STATUS_PUBLICOS.join(', ')}`,
  })
  status?: StatusPublico[];

  @ApiPropertyOptional({
    type: String,
    example: 'iluminacao,pavimentacao',
    description: 'Slugs das categorias, separados por vírgula',
  })
  @IsOptional()
  @lista
  @Matches(/^[a-z0-9-]{2,40}$/, { each: true, message: 'categoria inválida' })
  categoria?: string[];
}

export class FeedQuery extends FiltrosPublicosQuery {
  @ApiPropertyOptional({ description: 'O proximo_cursor da página anterior' })
  @IsOptional()
  @IsString({ message: 'cursor inválido' })
  @MaxLength(200, { message: 'cursor inválido' })
  cursor?: string;

  @ApiPropertyOptional({
    default: LIMITE_PADRAO_FEED,
    minimum: 1,
    maximum: LIMITE_MAXIMO_FEED,
  })
  @IsOptional()
  @inteiro
  @IsInt({ message: `o limite deve ser um número de 1 a ${LIMITE_MAXIMO_FEED}` })
  @Min(1, { message: `o limite deve ser um número de 1 a ${LIMITE_MAXIMO_FEED}` })
  @Max(LIMITE_MAXIMO_FEED, { message: `o limite deve ser um número de 1 a ${LIMITE_MAXIMO_FEED}` })
  limite?: number;
}

export class MapaQuery extends FiltrosPublicosQuery {
  @ApiProperty({
    required: true,
    example: '-47.55,-23.60,-47.35,-23.40',
    description: 'Área visível do mapa: minLng,minLat,maxLng,maxLat',
  })
  // Ausente ou malformada vira BBOX_INVALIDA no caso de uso, não VALIDACAO.
  @IsOptional()
  @IsString()
  bbox?: string;
}

export class CategoriaCardResposta {
  @ApiProperty({ example: 'iluminacao' })
  slug!: string;

  @ApiProperty({ example: 'Iluminação' })
  nome!: string;

  @ApiProperty({ example: 'lightbulb' })
  icone!: string;
}

/** Lista explícita de campos: nada de autor, e-mail ou ponto exato além do endereço público. */
export class CardResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'FA-2026-SOR-000123' })
  protocolo!: string;

  @ApiProperty({ type: CategoriaCardResposta })
  categoria!: CategoriaCardResposta;

  @ApiProperty({ enum: STATUS_PUBLICOS })
  status_publico!: StatusPublico;

  @ApiProperty({ description: 'Até 120 caracteres da descrição' })
  resumo!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Rua Quinze de Novembro, 482 · Centro',
    description: 'Null enquanto o endereço não foi preenchido',
  })
  endereco!: string | null;

  @ApiProperty({ example: 4, description: 'Quantas pessoas disseram "também vi"' })
  confirmacoes!: number;

  @ApiProperty({ description: 'Atingiu o limiar de confirmações do selo URGENTE' })
  urgente!: boolean;

  @ApiProperty({ example: 3, description: 'Dias desde o registro, ou até a resolução' })
  dias_em_aberto!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Miniatura da primeira foto aprovada',
  })
  miniatura_url!: string | null;

  @ApiProperty({ description: 'Nenhuma foto aprovada ainda: mostrar "foto em análise"' })
  foto_em_analise!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  criada_em!: string;

  static de(card: Card): CardResposta {
    return {
      id: card.id,
      protocolo: card.protocolo,
      categoria: {
        slug: card.categoria.slug,
        nome: card.categoria.nome,
        icone: card.categoria.icone,
      },
      status_publico: card.statusPublico,
      resumo: card.resumo,
      endereco: card.endereco,
      confirmacoes: card.confirmacoes,
      urgente: card.urgente,
      dias_em_aberto: card.diasEmAberto,
      miniatura_url: card.miniaturaUrl,
      foto_em_analise: card.fotoEmAnalise,
      criada_em: card.criadaEm.toISOString(),
    };
  }
}

export class FeedResposta {
  @ApiProperty({ type: [CardResposta] })
  itens!: CardResposta[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Passe em ?cursor= para a página seguinte; null na última',
  })
  proximo_cursor!: string | null;

  static de(pagina: PaginaFeed): FeedResposta {
    return {
      itens: pagina.itens.map((card) => CardResposta.de(card)),
      proximo_cursor: pagina.proximoCursor,
    };
  }
}

export class PontoMapaResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: -23.5015 })
  lat!: number;

  @ApiProperty({ example: -47.4526 })
  lng!: number;

  @ApiProperty({ enum: STATUS_PUBLICOS, description: 'Define a cor do alfinete' })
  status_publico!: StatusPublico;

  @ApiProperty({ example: 'iluminacao' })
  categoria_slug!: string;

  @ApiProperty()
  urgente!: boolean;

  static de(ponto: PontoMapa): PontoMapaResposta {
    return {
      id: ponto.id,
      lat: ponto.lat,
      lng: ponto.lng,
      status_publico: ponto.statusPublico,
      categoria_slug: ponto.categoriaSlug,
      urgente: ponto.urgente,
    };
  }
}

export class MapaResposta {
  @ApiProperty({ type: [PontoMapaResposta], description: 'No máximo 2000' })
  pontos!: PontoMapaResposta[];

  @ApiProperty({ description: 'Havia mais pontos na área: o PWA pede para aproximar o mapa' })
  truncado!: boolean;

  static de(resultado: ResultadoMapa): MapaResposta {
    return {
      pontos: resultado.pontos.map((ponto) => PontoMapaResposta.de(ponto)),
      truncado: resultado.truncado,
    };
  }
}
