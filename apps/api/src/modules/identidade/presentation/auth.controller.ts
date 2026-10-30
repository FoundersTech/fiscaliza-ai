import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { LimiteTaxa, type RequisicaoLimitada } from '../../../shared/limite-taxa/limite-taxa.js';
import { Cadastrar } from '../application/cadastrar.js';
import { Entrar } from '../application/entrar.js';
import { erroCsrf } from '../application/erros.js';
import { ObterPerfil } from '../application/obter-perfil.js';
import { AceitarPolitica } from '../application/politica.js';
import type { DadosToken } from '../application/portas.js';
import { RenovarSessao, Sair } from '../application/sessoes.js';
import { DefinirSenha, PedirRedefinicaoSenha } from '../application/tokens-acesso.js';
import { AutenticadoSemPolitica, UsuarioAtual } from './autenticacao.js';
import {
  lerCookieRefresh,
  limparCookieRefresh,
  origemDe,
  type RequisicaoHttp,
  type RespostaHttp,
  responderSessao,
} from './cookie-refresh.js';
import {
  AceitePoliticaDto,
  CadastroDto,
  DefinirSenhaDto,
  EsqueciSenhaDto,
  LoginDto,
  PerfilResposta,
  SessaoResposta,
} from './dto.js';

/** E-mail do corpo, para o limite contar por conta. */
function emailDoCorpo({ body }: RequisicaoLimitada): string {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

@ApiTags('autenticacao')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly cadastrarUsuario: Cadastrar,
    private readonly entrar: Entrar,
    private readonly renovarSessao: RenovarSessao,
    private readonly sair: Sair,
    private readonly pedirRedefinicao: PedirRedefinicaoSenha,
    private readonly definirSenhaComToken: DefinirSenha,
  ) {}

  @Post('cadastro')
  @LimiteTaxa({ nome: 'cadastro', maximo: 5, janelaSegundos: 3600, chave: ({ ip }) => ip })
  @ApiCreatedResponse({
    type: SessaoResposta,
    description: 'Conta de cidadão criada e logada. O refresh vai no cookie fa_refresh.',
  })
  @ApiConflictResponse({ description: 'EMAIL_EM_USO' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO ou POLITICA_DESATUALIZADA' })
  async cadastrar(
    @Body() dto: CadastroDto,
    @Req() requisicao: RequisicaoHttp,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<SessaoResposta> {
    const sessao = await this.cadastrarUsuario.executar(
      {
        nome: dto.nome,
        apelidoPublico: dto.apelido_publico,
        email: dto.email,
        senha: dto.senha,
        politicaVersao: dto.politica_versao,
      },
      origemDe(requisicao),
    );
    return responderSessao(resposta, sessao);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @LimiteTaxa({
    nome: 'login',
    maximo: 5,
    janelaSegundos: 60,
    chave: (requisicao) => `${requisicao.ip}|${emailDoCorpo(requisicao)}`,
  })
  @ApiOkResponse({ type: SessaoResposta, description: 'O refresh vai no cookie fa_refresh.' })
  @ApiUnauthorizedResponse({ description: 'CREDENCIAIS_INVALIDAS' })
  async login(
    @Body() dto: LoginDto,
    @Req() requisicao: RequisicaoHttp,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<SessaoResposta> {
    const sessao = await this.entrar.executar(dto.email, dto.senha, origemDe(requisicao));
    return responderSessao(resposta, sessao);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-FA-CSRF',
    required: true,
    description: 'Sempre "1". Um site de fora não consegue mandar este header.',
  })
  @ApiOkResponse({ type: SessaoResposta, description: 'Access token novo e cookie novo.' })
  @ApiUnauthorizedResponse({ description: 'SESSAO_INVALIDA: sem cookie, expirado ou revogado' })
  @ApiForbiddenResponse({ description: 'CSRF_AUSENTE' })
  async refresh(
    @Req() requisicao: RequisicaoHttp,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<SessaoResposta> {
    if (requisicao.headers['x-fa-csrf'] !== '1') throw erroCsrf();
    try {
      const sessao = await this.renovarSessao.executar(
        lerCookieRefresh(requisicao),
        origemDe(requisicao),
      );
      return responderSessao(resposta, sessao);
    } catch (erro) {
      limparCookieRefresh(resposta);
      throw erro;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sessão do aparelho encerrada e cookie apagado.' })
  async logout(
    @Req() requisicao: RequisicaoHttp,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<void> {
    await this.sair.executar(lerCookieRefresh(requisicao));
    limparCookieRefresh(resposta);
  }

  @Post('esqueci-senha')
  @HttpCode(HttpStatus.ACCEPTED)
  @LimiteTaxa({ nome: 'esqueci-senha', maximo: 3, janelaSegundos: 3600, chave: emailDoCorpo })
  @ApiAcceptedResponse({
    description:
      'Sempre 202, exista ou não a conta. Se existir, ela recebe o link de redefinição, que vale por 1 hora.',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async esqueciSenha(@Body() dto: EsqueciSenhaDto): Promise<void> {
    await this.pedirRedefinicao.executar(dto.email);
  }

  @Post('definir-senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Senha definida (redefinição ou convite). Todas as sessões do usuário acabam.',
  })
  @ApiBadRequestResponse({ description: 'TOKEN_INVALIDO: inválido, já usado ou expirado' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async definirSenha(@Body() dto: DefinirSenhaDto): Promise<void> {
    await this.definirSenhaComToken.executar(dto.token, dto.senha);
  }
}

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly obterPerfil: ObterPerfil,
    private readonly aceitarPolitica: AceitarPolitica,
  ) {}

  @Get()
  @AutenticadoSemPolitica()
  @ApiOkResponse({ type: PerfilResposta })
  async perfil(@UsuarioAtual() usuario: DadosToken): Promise<PerfilResposta> {
    return PerfilResposta.de(await this.obterPerfil.executar(usuario.usuarioId));
  }

  @Post('politica')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AutenticadoSemPolitica()
  @ApiNoContentResponse({ description: 'Aceite da versão vigente gravado, com a data.' })
  @ApiUnprocessableEntityResponse({ description: 'POLITICA_DESATUALIZADA ou VALIDACAO' })
  async politica(
    @UsuarioAtual() usuario: DadosToken,
    @Body() dto: AceitePoliticaDto,
  ): Promise<void> {
    await this.aceitarPolitica.executar(usuario.usuarioId, dto.versao);
  }
}
