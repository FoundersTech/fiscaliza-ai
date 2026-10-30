import { Inject, Injectable } from '@nestjs/common';

import { ServicoEmail } from '../../notificacoes/application/servico-email.js';
import { Papel } from '../domain/papel.js';
import { erroEmailEmUso } from './erros.js';
import {
  REPOSITORIO_TOKENS_ACESSO,
  REPOSITORIO_USUARIOS,
  type RepositorioTokensAcesso,
  type RepositorioUsuarios,
  type Usuario,
} from './portas.js';
import { novoTokenAcesso } from './tokens-acesso.js';

const NOME_ADMIN_PADRAO = 'Administração da plataforma';

/**
 * Cria um ADMIN_PLATAFORMA sem senha e envia o convite para ele definir a própria. Assim
 * nenhuma senha passa por variável de ambiente nem pelo terminal.
 */
@Injectable()
export class CriarAdminPlataforma {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(REPOSITORIO_TOKENS_ACESSO) private readonly tokens: RepositorioTokensAcesso,
    private readonly emails: ServicoEmail,
  ) {}

  async executar(dados: { email: string; nome?: string }, agora = new Date()): Promise<Usuario> {
    if (await this.usuarios.buscarPorEmail(dados.email)) {
      throw erroEmailEmUso();
    }

    const usuario = await this.usuarios.criarConvidado({
      nome: dados.nome ?? NOME_ADMIN_PADRAO,
      apelidoPublico: 'admin',
      email: dados.email,
      papel: Papel.ADMIN_PLATAFORMA,
    });
    const { token, dados: convite } = novoTokenAcesso(usuario.usuarioId, 'CONVITE', agora);
    await this.tokens.criar(convite);
    await this.emails.enviarConvite({
      para: usuario.email,
      nome: usuario.nome,
      token,
      papel: Papel.ADMIN_PLATAFORMA,
    });
    return usuario;
  }
}
