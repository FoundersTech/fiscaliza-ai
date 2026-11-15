import { Global, Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js';
import { Cadastrar } from './application/cadastrar.js';
import { AlterarAtivacaoConta, ConvidarUsuario } from './application/contas.js';
import { CriarAdminPlataforma } from './application/criar-admin.js';
import { Entrar } from './application/entrar.js';
import { LimparTokensExpirados } from './application/limpar-tokens-expirados.js';
import { ObterPerfil } from './application/obter-perfil.js';
import { AceitarPolitica, ConferirAcesso } from './application/politica.js';
import {
  EMISSOR_TOKEN,
  HASHER_SENHA,
  REPOSITORIO_SESSOES,
  REPOSITORIO_TOKENS_ACESSO,
  REPOSITORIO_USUARIOS,
} from './application/portas.js';
import { AbrirSessao, RenovarSessao, Sair } from './application/sessoes.js';
import { DefinirSenha, PedirRedefinicaoSenha } from './application/tokens-acesso.js';
import { EmissorJwt } from './infrastructure/emissor-jwt.js';
import { HasherArgon2 } from './infrastructure/hasher-argon2.js';
import { RepositorioSessoesPrisma } from './infrastructure/repositorio-sessoes.prisma.js';
import { RepositorioTokensAcessoPrisma } from './infrastructure/repositorio-tokens-acesso.prisma.js';
import { RepositorioUsuariosPrisma } from './infrastructure/repositorio-usuarios.prisma.js';
import { AuthController, MeController } from './presentation/auth.controller.js';
import { GuardAutenticacao, GuardAutenticacaoOpcional } from './presentation/autenticacao.js';

/**
 * Contas e sessões. É global para que qualquer módulo use @Autenticado() e
 * @AutenticacaoOpcional(): os guards precisam do emissor de tokens e da conferência de conta e
 * política. A administração usa o convite e a ativação de contas daqui.
 */
@Global()
@Module({
  imports: [NotificacoesModule],
  controllers: [AuthController, MeController],
  providers: [
    Cadastrar,
    Entrar,
    ObterPerfil,
    AbrirSessao,
    RenovarSessao,
    Sair,
    PedirRedefinicaoSenha,
    DefinirSenha,
    AceitarPolitica,
    ConferirAcesso,
    ConvidarUsuario,
    AlterarAtivacaoConta,
    CriarAdminPlataforma,
    LimparTokensExpirados,
    GuardAutenticacao,
    GuardAutenticacaoOpcional,
    { provide: HASHER_SENHA, useClass: HasherArgon2 },
    { provide: REPOSITORIO_USUARIOS, useClass: RepositorioUsuariosPrisma },
    { provide: REPOSITORIO_SESSOES, useClass: RepositorioSessoesPrisma },
    { provide: REPOSITORIO_TOKENS_ACESSO, useClass: RepositorioTokensAcessoPrisma },
    {
      provide: EMISSOR_TOKEN,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => new EmissorJwt(ambiente.JWT_SECRET),
    },
  ],
  exports: [
    EMISSOR_TOKEN,
    ConferirAcesso,
    GuardAutenticacao,
    GuardAutenticacaoOpcional,
    ConvidarUsuario,
    AlterarAtivacaoConta,
    HASHER_SENHA,
    LimparTokensExpirados,
  ],
})
export class IdentidadeModule {}
