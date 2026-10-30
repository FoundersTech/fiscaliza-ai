import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { LimiteTaxa, type RequisicaoLimitada } from '../../../shared/limite-taxa/limite-taxa.js';
import { Cadastrar } from '../application/cadastrar.js';
import { Entrar } from '../application/entrar.js';
import { ObterPerfil } from '../application/obter-perfil.js';
import type { DadosToken } from '../application/portas.js';
import { Autenticado, UsuarioAtual } from './autenticacao.js';
import { CadastroDto, LoginDto, PerfilResposta, SessaoResposta } from './dto.js';

/** E-mail do corpo do login, para o limite contar por IP e conta. */
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
  ) {}

  @Post('cadastro')
  @LimiteTaxa({ nome: 'cadastro', maximo: 5, janelaSegundos: 3600, chave: ({ ip }) => ip })
  @ApiCreatedResponse({ type: SessaoResposta, description: 'Conta de cidadão criada e logada.' })
  @ApiConflictResponse({ description: 'EMAIL_EM_USO' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO ou POLITICA_DESATUALIZADA' })
  async cadastrar(@Body() dto: CadastroDto): Promise<SessaoResposta> {
    const sessao = await this.cadastrarUsuario.executar({
      nome: dto.nome,
      apelidoPublico: dto.apelido_publico,
      email: dto.email,
      senha: dto.senha,
      politicaVersao: dto.politica_versao,
    });
    return SessaoResposta.de(sessao);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @LimiteTaxa({
    nome: 'login',
    maximo: 5,
    janelaSegundos: 60,
    chave: (requisicao) => `${requisicao.ip}|${emailDoCorpo(requisicao)}`,
  })
  @ApiOkResponse({ type: SessaoResposta })
  @ApiUnauthorizedResponse({ description: 'CREDENCIAIS_INVALIDAS' })
  async login(@Body() dto: LoginDto): Promise<SessaoResposta> {
    return SessaoResposta.de(await this.entrar.executar(dto.email, dto.senha));
  }
}

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly obterPerfil: ObterPerfil) {}

  @Get()
  @Autenticado()
  @ApiOkResponse({ type: PerfilResposta })
  async perfil(@UsuarioAtual() usuario: DadosToken): Promise<PerfilResposta> {
    return PerfilResposta.de(await this.obterPerfil.executar(usuario.usuarioId));
  }
}
