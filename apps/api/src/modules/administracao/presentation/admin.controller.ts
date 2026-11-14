import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado, UsuarioAtual } from '../../identidade/presentation/autenticacao.js';
import { AlterarAgente, ConvidarAgente, ListarAgentes } from '../application/agentes.js';
import { erroAgenteNaoEncontrado } from '../application/erros.js';
import { ConvidarGestor } from '../application/gestores.js';
import { EditarOrgao, ObterOrgao } from '../application/orgao.js';
import {
  AgenteResposta,
  AlteracaoAgenteDto,
  ConviteDto,
  ConviteGestorDto,
  EdicaoOrgaoDto,
  GestorResposta,
  OrgaoResposta,
} from './dto.js';

const SEM_ORGAO = 'MUNICIPIO_SEM_ORGAO: falha da carga inicial';

@ApiTags('administracao')
@Controller('admin/orgao')
@Autenticado(Papel.ADMIN_MUNICIPIO)
export class OrgaoController {
  constructor(
    private readonly obterOrgao: ObterOrgao,
    private readonly editarOrgao: EditarOrgao,
  ) {}

  @Get()
  @ApiOkResponse({ type: OrgaoResposta, description: 'O órgão do município do gestor' })
  @ApiUnprocessableEntityResponse({ description: SEM_ORGAO })
  async obter(@UsuarioAtual() gestor: DadosToken): Promise<OrgaoResposta> {
    return OrgaoResposta.de(await this.obterOrgao.executar(gestor));
  }

  @Patch()
  @ApiOkResponse({ type: OrgaoResposta, description: 'Órgão com o nome e a sigla novos' })
  @ApiUnprocessableEntityResponse({ description: `VALIDACAO ou ${SEM_ORGAO}` })
  async editar(
    @UsuarioAtual() gestor: DadosToken,
    @Body() dto: EdicaoOrgaoDto,
  ): Promise<OrgaoResposta> {
    return OrgaoResposta.de(
      await this.editarOrgao.executar(gestor, { nome: dto.nome, sigla: dto.sigla }),
    );
  }
}

@ApiTags('administracao')
@Controller('admin/agentes')
export class AgentesController {
  constructor(
    private readonly listarAgentes: ListarAgentes,
    private readonly convidarAgente: ConvidarAgente,
    private readonly alterarAgente: AlterarAgente,
  ) {}

  @Get()
  @Autenticado(Papel.ADMIN_MUNICIPIO)
  @ApiOkResponse({
    type: AgenteResposta,
    isArray: true,
    description: 'Agentes do órgão do município do gestor, em ordem de nome',
  })
  @ApiUnprocessableEntityResponse({ description: SEM_ORGAO })
  async listar(@UsuarioAtual() gestor: DadosToken): Promise<AgenteResposta[]> {
    return (await this.listarAgentes.executar(gestor)).map((agente) => AgenteResposta.de(agente));
  }

  @Post()
  @Autenticado(Papel.ADMIN_MUNICIPIO)
  @ApiCreatedResponse({
    type: AgenteResposta,
    description: 'Agente criado sem senha; o convite para definir a senha vale por 72 horas',
  })
  @ApiConflictResponse({ description: 'EMAIL_EM_USO' })
  @ApiUnprocessableEntityResponse({ description: `VALIDACAO ou ${SEM_ORGAO}` })
  async convidar(
    @UsuarioAtual() gestor: DadosToken,
    @Body() dto: ConviteDto,
  ): Promise<AgenteResposta> {
    return AgenteResposta.de(
      await this.convidarAgente.executar(gestor, { nome: dto.nome, email: dto.email }),
    );
  }

  @Patch(':id')
  @ApiForbiddenResponse({
    description:
      'OUTRO_MUNICIPIO: o agente é de outro município. ACESSO_NEGADO: só para ADMIN_MUNICIPIO. POLITICA_PENDENTE: falta aceitar a versão vigente da política.',
  })
  @Autenticado(Papel.ADMIN_MUNICIPIO)
  @ApiOkResponse({
    type: AgenteResposta,
    description: 'Agente ativado ou desativado. Desativar encerra todas as sessões dele na hora.',
  })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADO' })
  @ApiUnprocessableEntityResponse({ description: `VALIDACAO ou ${SEM_ORGAO}` })
  async alterar(
    @UsuarioAtual() gestor: DadosToken,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: erroAgenteNaoEncontrado })) id: string,
    @Body() dto: AlteracaoAgenteDto,
  ): Promise<AgenteResposta> {
    return AgenteResposta.de(await this.alterarAgente.executar(gestor, id, { ativo: dto.ativo }));
  }
}

@ApiTags('administracao')
@Controller('admin/gestores')
export class GestoresController {
  constructor(private readonly convidarGestor: ConvidarGestor) {}

  @Post()
  @Autenticado(Papel.ADMIN_PLATAFORMA)
  @ApiCreatedResponse({
    type: GestorResposta,
    description: 'ADMIN_MUNICIPIO criado sem senha; o convite vale por 72 horas',
  })
  @ApiConflictResponse({ description: 'EMAIL_EM_USO' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO ou MUNICIPIO_INEXISTENTE' })
  async convidar(@Body() dto: ConviteGestorDto): Promise<GestorResposta> {
    return GestorResposta.de(
      await this.convidarGestor.executar({
        nome: dto.nome,
        email: dto.email,
        municipioId: dto.municipio_id,
      }),
    );
  }
}
