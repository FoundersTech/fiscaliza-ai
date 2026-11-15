import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado } from '../../identidade/presentation/autenticacao.js';
import { CriarCategoria, EditarCategoria, ListarCategorias } from '../application/categorias.js';
import { erroCategoriaNaoEncontrada } from '../application/erros.js';
import { CategoriaAdminResposta, EdicaoCategoriaDto, NovaCategoriaDto } from './dto.js';

const ERROS_CADASTRO = 'VALIDACAO ou SCHEMA_INVALIDO (campos extras malformados)';

@ApiTags('administracao')
@Controller('admin/categorias')
@Autenticado(Papel.ADMIN_PLATAFORMA)
export class CategoriasController {
  constructor(
    private readonly listarCategorias: ListarCategorias,
    private readonly criarCategoria: CriarCategoria,
    private readonly editarCategoria: EditarCategoria,
  ) {}

  @Get()
  @ApiOkResponse({
    type: CategoriaAdminResposta,
    isArray: true,
    description: 'Todas as categorias, ativas e inativas, em ordem de nome',
  })
  async listar(): Promise<CategoriaAdminResposta[]> {
    return (await this.listarCategorias.executar()).map((categoria) =>
      CategoriaAdminResposta.de(categoria),
    );
  }

  @Post()
  @ApiCreatedResponse({ type: CategoriaAdminResposta })
  @ApiConflictResponse({ description: 'SLUG_EM_USO' })
  @ApiUnprocessableEntityResponse({ description: ERROS_CADASTRO })
  async criar(@Body() dto: NovaCategoriaDto): Promise<CategoriaAdminResposta> {
    return CategoriaAdminResposta.de(
      await this.criarCategoria.executar({
        slug: dto.slug,
        nome: dto.nome,
        icone: dto.icone,
        slaDias: dto.sla_dias,
        schemaAtributos: dto.schema_atributos,
        ...(dto.ativa === undefined ? {} : { ativa: dto.ativa }),
      }),
    );
  }

  @Patch(':id')
  @ApiOkResponse({
    type: CategoriaAdminResposta,
    description:
      'Categoria alterada. Inativa, ela sai do registro de novas ocorrências; as que já existem continuam com ela.',
  })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'SLUG_EM_USO' })
  @ApiUnprocessableEntityResponse({ description: ERROS_CADASTRO })
  async editar(
    @Param('id', new ParseIntPipe({ exceptionFactory: erroCategoriaNaoEncontrada })) id: number,
    @Body() dto: EdicaoCategoriaDto,
  ): Promise<CategoriaAdminResposta> {
    return CategoriaAdminResposta.de(
      await this.editarCategoria.executar(id, {
        slug: dto.slug,
        nome: dto.nome,
        icone: dto.icone,
        slaDias: dto.sla_dias,
        schemaAtributos: dto.schema_atributos,
        ativa: dto.ativa,
      }),
    );
  }
}
