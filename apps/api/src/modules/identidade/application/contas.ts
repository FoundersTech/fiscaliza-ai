import { Inject, Injectable } from '@nestjs/common';

import { ServicoEmail } from '../../notificacoes/application/servico-email.js';
import type { PapelConvidado } from '../../notificacoes/application/templates-email.js';
import { erroEmailEmUso } from './erros.js';
import {
  REPOSITORIO_SESSOES,
  REPOSITORIO_TOKENS_ACESSO,
  REPOSITORIO_USUARIOS,
  type RepositorioSessoes,
  type RepositorioTokensAcesso,
  type RepositorioUsuarios,
  type Usuario,
} from './portas.js';
import { novoTokenAcesso } from './tokens-acesso.js';

export interface DadosConvite {
  nome: string;
  email: string;
  papel: PapelConvidado;
  /** Nome que aparece nas ocorrências; sem ele, usa o próprio nome. */
  apelidoPublico?: string;
  municipioId?: number | null;
  orgaoId?: number | null;
  /** Nome do órgão, citado no e-mail do convite de agente. */
  nomeOrgao?: string;
}

const APELIDO_MAX = 30;

/**
 * Cria a conta sem senha e envia o convite com o link para a pessoa definir a própria. Serve
 * para todos os papéis que não se cadastram sozinhos.
 */
@Injectable()
export class ConvidarUsuario {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(REPOSITORIO_TOKENS_ACESSO) private readonly tokens: RepositorioTokensAcesso,
    private readonly emails: ServicoEmail,
  ) {}

  async executar(dados: DadosConvite, agora = new Date()): Promise<Usuario> {
    if (await this.usuarios.buscarPorEmail(dados.email)) {
      throw erroEmailEmUso();
    }

    const usuario = await this.usuarios.criarConvidado({
      nome: dados.nome,
      apelidoPublico: dados.apelidoPublico ?? dados.nome.slice(0, APELIDO_MAX).trim(),
      email: dados.email,
      papel: dados.papel,
      municipioId: dados.municipioId ?? null,
      orgaoId: dados.orgaoId ?? null,
    });
    const { token, dados: convite } = novoTokenAcesso(usuario.usuarioId, 'CONVITE', agora);
    await this.tokens.criar(convite);
    await this.emails.enviarConvite({
      para: usuario.email,
      nome: usuario.nome,
      token,
      papel: dados.papel,
      ...(dados.nomeOrgao ? { orgao: dados.nomeOrgao } : {}),
    });
    return usuario;
  }
}

/**
 * Ativa ou desativa uma conta sem apagar dados. Desativar encerra na hora todas as sessões:
 * o refresh seguinte devolve 401 e o access token em uso deixa de passar pelo guard.
 */
@Injectable()
export class AlterarAtivacaoConta {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(REPOSITORIO_SESSOES) private readonly sessoes: RepositorioSessoes,
  ) {}

  async executar(usuarioId: string, ativo: boolean, agora = new Date()): Promise<void> {
    await this.usuarios.definirAtivo(usuarioId, ativo);
    if (!ativo) {
      await this.sessoes.revogarDoUsuario(usuarioId, agora);
    }
  }
}
