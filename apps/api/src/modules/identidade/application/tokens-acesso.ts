import { Inject, Injectable } from '@nestjs/common';

import { ServicoEmail } from '../../notificacoes/application/servico-email.js';
import { VALIDADE_HORAS } from '../../notificacoes/application/templates-email.js';
import { erroTokenInvalido } from './erros.js';
import {
  HASHER_SENHA,
  type HasherSenha,
  type NovoTokenAcesso,
  REPOSITORIO_SESSOES,
  REPOSITORIO_TOKENS_ACESSO,
  REPOSITORIO_USUARIOS,
  type RepositorioSessoes,
  type RepositorioTokensAcesso,
  type RepositorioUsuarios,
  type TipoTokenAcesso,
  type Usuario,
} from './portas.js';
import { gerarSegredo, resumirSegredo } from './segredo.js';

const UMA_HORA_MS = 60 * 60 * 1000;

const VALIDADE: Record<TipoTokenAcesso, number> = {
  REDEFINIR_SENHA: VALIDADE_HORAS.redefinicao,
  CONVITE: VALIDADE_HORAS.convite,
};

export function novoTokenAcesso(
  usuarioId: string,
  tipo: TipoTokenAcesso,
  agora: Date,
): { token: string; dados: NovoTokenAcesso } {
  const token = gerarSegredo();
  const expiraEm = new Date(agora.getTime() + VALIDADE[tipo] * UMA_HORA_MS);
  return { token, dados: { usuarioId, tipo, tokenHash: resumirSegredo(token), expiraEm } };
}

/**
 * Conta desativada ou anonimizada não recupera o acesso. Já a conta convidada que deixou o
 * convite vencer, sem nunca ter definido senha, pode usar o "Esqueci minha senha".
 */
function podeRecuperar(usuario: Usuario): boolean {
  return usuario.ativo && usuario.anonimizadoEm === null;
}

@Injectable()
export class PedirRedefinicaoSenha {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(REPOSITORIO_TOKENS_ACESSO) private readonly tokens: RepositorioTokensAcesso,
    private readonly emails: ServicoEmail,
  ) {}

  async executar(email: string, agora = new Date()): Promise<void> {
    const usuario = await this.usuarios.buscarPorEmail(email);
    if (!usuario || !podeRecuperar(usuario)) return;

    const { token, dados } = novoTokenAcesso(usuario.usuarioId, 'REDEFINIR_SENHA', agora);
    await this.tokens.criar(dados);
    await this.emails.enviarRedefinicaoSenha({ para: usuario.email, nome: usuario.nome, token });
  }
}

/** Redefinição de senha e primeiro acesso de convidado. Depois dela, todas as sessões acabam. */
@Injectable()
export class DefinirSenha {
  constructor(
    @Inject(REPOSITORIO_TOKENS_ACESSO) private readonly tokens: RepositorioTokensAcesso,
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(REPOSITORIO_SESSOES) private readonly sessoes: RepositorioSessoes,
    @Inject(HASHER_SENHA) private readonly hasher: HasherSenha,
  ) {}

  async executar(token: string, senha: string, agora = new Date()): Promise<void> {
    const gravado = await this.tokens.buscarPorHash(resumirSegredo(token));
    if (!gravado || gravado.usadoEm || gravado.expiraEm <= agora) {
      throw erroTokenInvalido();
    }
    const usuario = await this.usuarios.buscarPorId(gravado.usuarioId);
    if (!usuario || !podeRecuperar(usuario)) {
      throw erroTokenInvalido();
    }

    const senhaHash = await this.hasher.gerar(senha);
    if (!(await this.tokens.definirSenha(gravado, senhaHash, agora))) {
      throw erroTokenInvalido();
    }
    await this.sessoes.revogarDoUsuario(gravado.usuarioId, agora);
  }
}
