import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Matches } from 'class-validator';

import { inteiro, lista } from '../../ocorrencias/presentation/dto-consultas.js';
import type { PainelCalculado } from '../application/portas.js';
import { PERIODO_PADRAO_PAINEL, PERIODOS_PAINEL, type PeriodoPainel } from '../domain/painel.js';

export class PainelQuery {
  @ApiPropertyOptional({
    example: 3552205,
    description: 'Código IBGE; sem ele, todos os municípios atendidos',
  })
  @IsOptional()
  @inteiro
  @IsInt({ message: 'informe o código IBGE do município' })
  municipio?: number;

  @ApiPropertyOptional({
    enum: PERIODOS_PAINEL,
    default: PERIODO_PADRAO_PAINEL,
    description: 'Últimos N dias, pela data de registro',
  })
  @IsOptional()
  @inteiro
  @IsIn(PERIODOS_PAINEL, { message: `use um período entre ${PERIODOS_PAINEL.join(', ')} dias` })
  periodo?: PeriodoPainel;

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

export class CategoriaPainelResposta {
  @ApiProperty({ example: 'iluminacao' })
  slug!: string;

  @ApiProperty({ example: 'Iluminação' })
  nome!: string;

  @ApiProperty({ example: 'lightbulb' })
  icone!: string;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 7 })
  resolvidas!: number;
}

/** Só números agregados: nenhuma ocorrência, autor, nome, e-mail ou apelido. */
export class PainelResposta {
  @ApiProperty({
    description: 'Nenhuma ocorrência no período: mostrar "Sem ocorrências no período"',
  })
  vazio!: boolean;

  @ApiProperty({ enum: PERIODOS_PAINEL, example: 30 })
  periodo_dias!: PeriodoPainel;

  @ApiProperty({ example: 40 })
  total!: number;

  @ApiProperty({ example: 22 })
  resolvidas!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 55.0,
    description: 'Percentual de resolvidas, com uma casa; null quando vazio',
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
    type: [CategoriaPainelResposta],
    description: 'Só as categorias com ocorrências, da maior para a menor',
  })
  por_categoria!: CategoriaPainelResposta[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Quando os números foram calculados (ficam guardados por até 5 minutos)',
  })
  calculado_em!: string;

  static de(painel: PainelCalculado): PainelResposta {
    return {
      vazio: painel.vazio,
      periodo_dias: painel.periodoDias,
      total: painel.total,
      resolvidas: painel.resolvidas,
      resolvidas_pct: painel.resolvidasPct,
      dias_mediana: painel.diasMediana,
      por_categoria: painel.porCategoria.map((categoria) => ({
        slug: categoria.slug,
        nome: categoria.nome,
        icone: categoria.icone,
        total: categoria.total,
        resolvidas: categoria.resolvidas,
      })),
      calculado_em: painel.calculadoEm.toISOString(),
    };
  }
}
