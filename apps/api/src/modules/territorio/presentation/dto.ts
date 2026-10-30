import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

import type { ConfigPublica } from '../application/config-publica.js';
import type { CategoriaAtiva } from '../application/portas.js';
import type { ConsultaPonto } from '../application/territorio.js';

// Texto vazio continua vazio, para não virar 0 e passar como coordenada.
const numero = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
);

export class GeoReversoQuery {
  @ApiProperty({ example: -23.5015, minimum: -90, maximum: 90 })
  @numero
  @IsLatitude({ message: 'informe uma latitude válida' })
  lat!: number;

  @ApiProperty({ example: -47.4526, minimum: -180, maximum: 180 })
  @numero
  @IsLongitude({ message: 'informe uma longitude válida' })
  lng!: number;
}

export class GeoReversoResposta {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Rua Quinze de Novembro, 482 · Centro',
    description: 'Null fora da área ou se o geocodificador falhar ou demorar mais de 2 s',
  })
  endereco!: string | null;

  @ApiProperty({ description: 'Falso fora de um município atendido: o envio fica bloqueado' })
  dentro_da_area!: boolean;

  static de(consulta: ConsultaPonto): GeoReversoResposta {
    return { endereco: consulta.endereco, dentro_da_area: consulta.dentroDaArea };
  }
}

export class PontoResposta {
  @ApiProperty()
  lat!: number;

  @ApiProperty()
  lng!: number;
}

export class BboxResposta {
  @ApiProperty()
  sul!: number;

  @ApiProperty()
  oeste!: number;

  @ApiProperty()
  norte!: number;

  @ApiProperty()
  leste!: number;
}

export class MunicipioResposta {
  @ApiProperty({ example: 3552205, description: 'Código IBGE' })
  id!: number;

  @ApiProperty({ example: 'Sorocaba' })
  nome!: string;

  @ApiProperty({ example: 'SP' })
  uf!: string;

  @ApiProperty({ type: PontoResposta, description: 'Onde o pino começa quando não há GPS' })
  centro!: PontoResposta;

  @ApiProperty({ type: BboxResposta, description: 'Retângulo que contém o município' })
  bbox!: BboxResposta;
}

export class CampoAtributoResposta {
  @ApiProperty({ example: 'numero_poste' })
  chave!: string;

  @ApiProperty({ example: 'Número do poste' })
  rotulo!: string;

  @ApiProperty({ enum: ['texto', 'numero', 'opcao'] })
  tipo!: 'texto' | 'numero' | 'opcao';

  @ApiProperty()
  obrigatorio!: boolean;

  @ApiPropertyOptional({ description: 'Só em numero' })
  min?: number;

  @ApiPropertyOptional({ description: 'Tamanho máximo em texto; valor máximo em numero' })
  max?: number;

  @ApiPropertyOptional({ type: [String], description: 'Só em opcao' })
  opcoes?: string[];
}

export class CategoriaResposta {
  @ApiProperty()
  id!: number;

  @ApiProperty({ example: 'iluminacao' })
  slug!: string;

  @ApiProperty({ example: 'Iluminação' })
  nome!: string;

  @ApiProperty({ example: 'lightbulb', description: 'Nome de um ícone do Material Icons' })
  icone!: string;

  @ApiProperty({ type: [CampoAtributoResposta], description: 'Campos extras do passo 2' })
  schema_atributos!: CampoAtributoResposta[];

  static de(categoria: CategoriaAtiva): CategoriaResposta {
    return {
      id: categoria.id,
      slug: categoria.slug,
      nome: categoria.nome,
      icone: categoria.icone,
      schema_atributos: categoria.schemaAtributos,
    };
  }
}

export class ConfigPublicaResposta {
  @ApiProperty({ type: MunicipioResposta })
  municipio!: MunicipioResposta;

  @ApiProperty({ type: [CategoriaResposta] })
  categorias_ativas!: CategoriaResposta[];

  @ApiProperty({ example: 10, description: 'Confirmações para uma ocorrência virar urgente' })
  urgente_min_confirmacoes!: number;

  @ApiProperty({ example: '1', description: 'Versão vigente da política de privacidade' })
  politica_versao!: string;

  @ApiProperty({ example: 'DEMO_MAP_ID' })
  google_maps_map_id!: string;

  static de(config: ConfigPublica): ConfigPublicaResposta {
    return {
      municipio: config.municipio,
      categorias_ativas: config.categoriasAtivas.map((categoria) =>
        CategoriaResposta.de(categoria),
      ),
      urgente_min_confirmacoes: config.urgenteMinConfirmacoes,
      politica_versao: config.politicaVersao,
      google_maps_map_id: config.googleMapsMapId,
    };
  }
}
