import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { LimiteTaxa, porUsuario } from '../../../shared/limite-taxa/limite-taxa.js';
import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado, UsuarioAtual } from '../../identidade/presentation/autenticacao.js';
import {
  ConfirmarOcorrencia,
  ocorrenciaNaoEncontrada,
} from '../application/confirmar-ocorrencia.js';
import { AvaliarAtendimento, ReabrirOcorrencia } from '../application/pos-resolucao.js';
import { RegistrarOcorrencia } from '../application/registrar-ocorrencia.js';
import {
  AvaliacaoDto,
  AvaliacaoResposta,
  ConfirmacaoResposta,
  ErroDuplicidadeResposta,
  OcorrenciaCriadaResposta,
  ReaberturaDto,
  ReaberturaFeitaResposta,
  RegistroDto,
} from './dto.js';

const ID = new ParseUUIDPipe({ exceptionFactory: ocorrenciaNaoEncontrada });

interface Resposta {
  status(codigo: number): { send(corpo: unknown): unknown };
}

@ApiTags('ocorrencias')
@Controller('ocorrencias')
export class OcorrenciasController {
  constructor(
    private readonly registrarOcorrencia: RegistrarOcorrencia,
    private readonly confirmarOcorrencia: ConfirmarOcorrencia,
    private readonly avaliarAtendimento: AvaliarAtendimento,
    private readonly reabrirOcorrencia: ReabrirOcorrencia,
  ) {}

  @Post()
  // Só contra robôs, não é limite de negócio. Acima do @Autenticado: conta por usuário.
  @LimiteTaxa(porUsuario('registro-ocorrencia', 60, 3600))
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
    @Param('id', ID) id: string,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<ConfirmacaoResposta> {
    return { confirmacoes: await this.confirmarOcorrencia.executar(id, usuario.usuarioId) };
  }

  @Post(':id/avaliacoes')
  @Autenticado(Papel.CIDADAO)
  @ApiCreatedResponse({ type: AvaliacaoResposta, description: 'Avaliação do atendimento gravada' })
  @ApiForbiddenResponse({
    description:
      'SEM_VINCULO: só o autor ou quem confirmou avalia. ACESSO_NEGADO: só para CIDADAO. POLITICA_PENDENTE: falta aceitar a versão vigente da política.',
  })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'JA_AVALIADA: o usuário já avaliou esta ocorrência' })
  @ApiUnprocessableEntityResponse({
    description:
      'NAO_RESOLVIDA: a ocorrência não está resolvida. FORA_DO_PRAZO: passaram os dias para avaliar depois da resolução. VALIDACAO',
  })
  async avaliar(
    @Param('id', ID) id: string,
    @Body() dto: AvaliacaoDto,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<AvaliacaoResposta> {
    const comentario = dto.comentario || null;
    await this.avaliarAtendimento.executar({
      ocorrenciaId: id,
      usuarioId: usuario.usuarioId,
      nota: dto.nota,
      comentario,
    });
    return { nota: dto.nota, comentario };
  }

  @Post(':id/reabertura')
  @HttpCode(200)
  @Autenticado(Papel.CIDADAO)
  @ApiOkResponse({
    type: ReaberturaFeitaResposta,
    description: 'Reaberta: volta para a análise do órgão, e quem acompanha é avisado',
  })
  @ApiForbiddenResponse({
    description:
      'SEM_VINCULO: só o autor ou quem confirmou reabre. ACESSO_NEGADO: só para CIDADAO. POLITICA_PENDENTE: falta aceitar a versão vigente da política.',
  })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  @ApiConflictResponse({
    description: 'CONFLITO_STATUS: o órgão mudou o status enquanto a pessoa via a ocorrência',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'NAO_RESOLVIDA: a ocorrência não está resolvida. FORA_DO_PRAZO: passaram os dias para reabrir depois da resolução. VALIDACAO',
  })
  async reabrir(
    @Param('id', ID) id: string,
    @Body() dto: ReaberturaDto,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<ReaberturaFeitaResposta> {
    const { estado } = await this.reabrirOcorrencia.executar({
      ocorrenciaId: id,
      usuarioId: usuario.usuarioId,
      justificativa: dto.justificativa,
    });
    return { status: estado.status, reaberturas: estado.reaberturas };
  }
}
