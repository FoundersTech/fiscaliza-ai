import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

import { inteiro } from '../../ocorrencias/presentation/dto-consultas.js';
import type { ScoreOrgao } from '../application/obter-score.js';

export class ScoreQuery {
  @ApiPropertyOptional({
    example: 3552205,
    description: 'Código IBGE; sem ele, o município atendido',
  })
  @IsOptional()
  @inteiro
  @IsInt({ message: 'informe o código IBGE do município' })
  municipio?: number;
}

export class CategoriaScoreResposta {
  @ApiProperty({ example: 3 })
  categoria_id!: number;

  @ApiProperty({ example: 'Iluminação' })
  nome!: string;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 7 })
  resolvidas!: number;
}

/** O último score calculado do órgão: só números agregados, sem dado pessoal. */
export class ScoreResposta {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 7.0,
    description: 'De 0 a 10, com uma casa; null sem ocorrências na janela ou ainda não calculado',
  })
  score!: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Regular' })
  classificacao!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 68.0,
    description: 'Percentual de resolvidas, com uma casa; null sem ocorrências na janela',
  })
  resolvidas_pct!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 6.5,
    description: 'Mediana de dias entre o registro e a resolução; null sem nenhuma resolvida',
  })
  dias_mediana!: number | null;

  @ApiProperty({
    type: [CategoriaScoreResposta],
    description: 'Só as categorias com ocorrências, da maior para a menor',
  })
  por_categoria!: CategoriaScoreResposta[];

  @ApiProperty({ example: 90, description: 'Últimos N dias considerados, pela data de registro' })
  janela_dias!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Quando o score foi recalculado pela última vez; null se ainda não foi',
  })
  calculado_em!: string | null;

  static de(score: ScoreOrgao): ScoreResposta {
    return {
      score: score.score,
      classificacao: score.classificacao,
      resolvidas_pct: score.resolvidasPct,
      dias_mediana: score.diasMediana,
      por_categoria: score.porCategoria.map((categoria) => ({
        categoria_id: categoria.categoriaId,
        nome: categoria.nome,
        total: categoria.total,
        resolvidas: categoria.resolvidas,
      })),
      janela_dias: score.janelaDias,
      calculado_em: score.calculadoEm?.toISOString() ?? null,
    };
  }
}
