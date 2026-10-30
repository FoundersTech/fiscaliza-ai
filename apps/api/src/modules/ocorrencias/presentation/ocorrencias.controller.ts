import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
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
import {
  ConfirmarOcorrencia,
  ocorrenciaNaoEncontrada,
} from '../application/confirmar-ocorrencia.js';
import { RegistrarOcorrencia } from '../application/registrar-ocorrencia.js';
import {
  ConfirmacaoResposta,
  ErroDuplicidadeResposta,
  OcorrenciaCriadaResposta,
  RegistroDto,
} from './dto.js';

interface Resposta {
  status(codigo: number): { send(corpo: unknown): unknown };
}

@ApiTags('ocorrencias')
@Controller('ocorrencias')
export class OcorrenciasController {
  constructor(
    private readonly registrarOcorrencia: RegistrarOcorrencia,
    private readonly confirmarOcorrencia: ConfirmarOcorrencia,
  ) {}

  @Post()
  @Autenticado(Papel.CIDADAO)
  @ApiCreatedResponse({ type: OcorrenciaCriadaResposta, description: 'Ocorrência criada' })
  @ApiOkResponse({
    type: OcorrenciaCriadaResposta,
    description: 'Reenvio do mesmo id pelo mesmo autor: a ocorrência que já existia',
  })
  @ApiConflictResponse({
    type: ErroDuplicidadeResposta,
    description:
      'DUPLICATA_POSSIVEL: há ocorrência aberta da categoria por perto (reenvie com forcar_criacao para criar assim mesmo). ID_EM_USO: o id é de outra pessoa.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'FORA_DA_AREA, CATEGORIA_INATIVA, ATRIBUTOS_INVALIDOS, FOTO_NAO_ENVIADA ou VALIDACAO',
  })
  async registrar(
    @Body() dto: RegistroDto,
    @UsuarioAtual() usuario: DadosToken,
    @Res() resposta: Resposta,
  ): Promise<void> {
    const registro = await this.registrarOcorrencia.executar({
      id: dto.id,
      autorId: usuario.usuarioId,
      categoriaId: dto.categoria_id,
      descricao: dto.descricao,
      atributos: dto.atributos,
      local: { lat: dto.local.lat, lng: dto.local.lng },
      precisaoM: dto.precisao_m ?? null,
      publicarAutor: dto.publicar_autor ?? false,
      fotos: dto.fotos.map((foto) => ({ uploadKey: foto.upload_key, ordem: foto.ordem })),
      origem: dto.origem,
      forcarCriacao: dto.forcar_criacao ?? false,
    });
    // O status muda conforme o caso, e o Nest sobrescreve o status de @Res({ passthrough }).
    resposta
      .status(registro.criada ? HttpStatus.CREATED : HttpStatus.OK)
      .send(OcorrenciaCriadaResposta.de(registro));
  }

  @Post(':id/confirmacoes')
  @ApiForbiddenResponse({
    description:
      'AUTOR_NAO_CONFIRMA: quem registrou não confirma a própria. ACESSO_NEGADO: só para CIDADAO. POLITICA_PENDENTE: falta aceitar a versão vigente da política.',
  })
  @Autenticado(Papel.CIDADAO)
  @ApiCreatedResponse({ type: ConfirmacaoResposta, description: '"Também vi" registrado' })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'JA_CONFIRMADA: o usuário já confirmou esta ocorrência' })
  @ApiUnprocessableEntityResponse({ description: 'OCORRENCIA_FECHADA: resolvida' })
  async confirmar(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: ocorrenciaNaoEncontrada })) id: string,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<ConfirmacaoResposta> {
    return { confirmacoes: await this.confirmarOcorrencia.executar(id, usuario.usuarioId) };
  }
}
