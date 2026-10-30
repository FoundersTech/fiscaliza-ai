import { Global, Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { Cadastrar } from './application/cadastrar.js';
import { Entrar } from './application/entrar.js';
import { ObterPerfil } from './application/obter-perfil.js';
import {
  EMISSOR_TOKEN,
  HASHER_SENHA,
  REPOSITORIO_SESSOES,
  REPOSITORIO_USUARIOS,
} from './application/portas.js';
import { AbrirSessao, RenovarSessao, Sair } from './application/sessoes.js';
import { EmissorJwt } from './infrastructure/emissor-jwt.js';
import { HasherArgon2 } from './infrastructure/hasher-argon2.js';
import { RepositorioSessoesPrisma } from './infrastructure/repositorio-sessoes.prisma.js';
import { RepositorioUsuariosPrisma } from './infrastructure/repositorio-usuarios.prisma.js';
import { AuthController, MeController } from './presentation/auth.controller.js';
import { GuardAutenticacao } from './presentation/autenticacao.js';

/**
 * Contas e sessões. É global para que qualquer módulo use @Autenticado(): o guard precisa do
 * emissor de tokens.
 */
@Global()
@Module({
  controllers: [AuthController, MeController],
  providers: [
    Cadastrar,
    Entrar,
    ObterPerfil,
    AbrirSessao,
    RenovarSessao,
    Sair,
    GuardAutenticacao,
    { provide: HASHER_SENHA, useClass: HasherArgon2 },
    { provide: REPOSITORIO_USUARIOS, useClass: RepositorioUsuariosPrisma },
    { provide: REPOSITORIO_SESSOES, useClass: RepositorioSessoesPrisma },
    {
      provide: EMISSOR_TOKEN,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => new EmissorJwt(ambiente.JWT_SECRET),
    },
  ],
  exports: [EMISSOR_TOKEN, GuardAutenticacao],
})
export class IdentidadeModule {}
