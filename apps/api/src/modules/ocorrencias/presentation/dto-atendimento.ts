import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { DetalheAtendimento, ItemFila, PaginaFila } from '../application/atendimento.js';
import type { ResultadoTransicao } from '../application/transicionar-status.js';
import { StatusOcorrencia } from '../domain/ocorrencia.js';
import { CardResposta, DetalheResposta, FeedQuery, lista } from './dto-consultas.js';

const STATUS = Object.values(StatusOcorrencia);
const TAMANHO_COMENTARIO = 1000;

export class FilaQuery extends PickType(FeedQuery, ['categoria', 'cursor', 'limite'] as const) {
  @ApiPropertyOptional({
    type: String,
    example: 'RECEBIDA,EM_ANALISE',
    description: `Status internos, separados por vírgula: ${STATUS.join(', ')}. Sem ele, todos.`,
  })
  @IsOptional()
  @lista
  @IsIn(STATUS, { each: true, message: `use status entre ${STATUS.join(', ')}` })
  status?: StatusOcorrencia[];
}

export class ItemFilaResposta extends CardResposta {
  @ApiProperty({ enum: STATUS })
  status!: StatusOcorrencia;

  @ApiProperty({ description: 'Já foi reaberta alguma vez: mostrar o selo "Reaberta"' })
  reaberta!: boolean;

  static deItem(item: ItemFila): ItemFilaResposta {
    return { ...CardResposta.de(item), status: item.status, reaberta: item.reaberta };
  }
}

export class FilaResposta {
  @ApiProperty({ type: [ItemFilaResposta], description: 'Da mais antiga para a mais recente' })
  itens!: ItemFilaResposta[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Passe em ?cursor= para a página seguinte; null na última',
  })
  proximo_cursor!: string | null;

  static de(pagina: PaginaFila): FilaResposta {
    return {
      itens: pagina.itens.map((item) => ItemFilaResposta.deItem(item)),
      proximo_cursor: pagina.proximoCursor,
    };
  }
}

export class EventoResposta {
  @ApiProperty({ enum: STATUS, nullable: true, description: 'Null no evento de criação' })
  de_status!: StatusOcorrencia | null;

  @ApiProperty({ enum: STATUS })
  para_status!: StatusOcorrencia;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Órgão que fez a mudança; null quando foi o cidadão (criação ou reabertura)',
  })
  orgao!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Resposta oficial, justificativa de recusa ou de reabertura',
  })
  comentario!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: string;
}

export class DetalheAtendimentoResposta extends DetalheResposta {
  @ApiProperty({ enum: STATUS })
  status!: StatusOcorrencia;

  @ApiProperty({ description: 'Já foi reaberta alguma vez' })
  reaberta!: boolean;

  @ApiProperty({ type: [EventoResposta], description: 'Todos, do mais antigo ao mais recente' })
  eventos!: EventoResposta[];

  @ApiProperty({
    enum: STATUS,
    isArray: true,
    description: 'Para onde o agente pode levar a ocorrência agora; vazio nos status finais',
  })
  transicoes_permitidas!: StatusOcorrencia[];

  static deAtendimento(detalhe: DetalheAtendimento): DetalheAtendimentoResposta {
    return {
      ...DetalheResposta.deDetalhe(detalhe),
      status: detalhe.status,
      reaberta: detalhe.reaberta,
      eventos: detalhe.eventos.map((evento) => ({
        de_status: evento.deStatus,
        para_status: evento.paraStatus,
        orgao: evento.orgao,
        comentario: evento.comentario,
        criado_em: evento.criadoEm.toISOString(),
      })),
      transicoes_permitidas: [...detalhe.transicoesPermitidas],
    };
  }
}

export class TransicaoDto {
  @ApiProperty({
    enum: STATUS,
    description: 'O status que a tela mostrava; se mudou nesse meio-tempo, 409 CONFLITO_STATUS',
  })
  @IsIn(STATUS, { message: `use um status entre ${STATUS.join(', ')}` })
  status_esperado!: StatusOcorrencia;

  @ApiProperty({ enum: STATUS })
  @IsIn(STATUS, { message: `use um status entre ${STATUS.join(', ')}` })
  para_status!: StatusOcorrencia;

  @ApiPropertyOptional({
    maxLength: TAMANHO_COMENTARIO,
    description: 'Obrigatório para RESOLVIDA (resposta oficial) e RECUSADA (justificativa)',
  })
  @IsOptional()
  @IsString({ message: 'o comentário deve ser um texto' })
  @MaxLength(TAMANHO_COMENTARIO, {
    message: `o comentário deve ter até ${TAMANHO_COMENTARIO} caracteres`,
  })
  comentario?: string;

  @ApiPropertyOptional({
    example: 'FA-2026-SOR-000101',
    description: 'Obrigatório para DUPLICADA: protocolo da ocorrência original, do mesmo município',
  })
  @IsOptional()
  @IsString({ message: 'informe o protocolo da ocorrência original' })
  @MaxLength(30, { message: 'protocolo inválido' })
  protocolo_original?: string;
}

export class TransicaoResposta {
  @ApiProperty({ enum: STATUS })
  status!: StatusOcorrencia;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Primeira saída de RECEBIDA',
  })
  triada_em!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvida_em!: string | null;

  static de({ estado }: ResultadoTransicao): TransicaoResposta {
    return {
      status: estado.status,
      triada_em: estado.triadaEm?.toISOString() ?? null,
      resolvida_em: estado.resolvidaEm?.toISOString() ?? null,
    };
  }
}
