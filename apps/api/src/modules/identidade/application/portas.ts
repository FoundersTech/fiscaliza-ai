import type { Papel } from '../domain/papel.js';

export const HASHER_SENHA = Symbol('HASHER_SENHA');
export const EMISSOR_TOKEN = Symbol('EMISSOR_TOKEN');
export const REPOSITORIO_USUARIOS = Symbol('REPOSITORIO_USUARIOS');
export const REPOSITORIO_SESSOES = Symbol('REPOSITORIO_SESSOES');
export const REPOSITORIO_TOKENS_ACESSO = Symbol('REPOSITORIO_TOKENS_ACESSO');

export interface HasherSenha {
  gerar(senha: string): Promise<string>;
  conferir(hash: string, senha: string): Promise<boolean>;
}

/** O que o token de acesso carrega: quem é o usuário e o escopo dele. */
export interface DadosToken {
  usuarioId: string;
  papel: Papel;
  municipioId: number | null;
  orgaoId: number | null;
}

export interface EmissorToken {
  emitir(dados: DadosToken): Promise<string>;
  verificar(token: string): Promise<DadosToken | null>;
}

export interface Usuario extends DadosToken {
  nome: string;
  apelidoPublico: string;
  email: string;
  senhaHash: string | null;
  ativo: boolean;
  politicaVersao: string | null;
  anonimizadoEm: Date | null;
}

export interface NovoCidadao {
  nome: string;
  apelidoPublico: string;
  email: string;
  senhaHash: string;
  politicaVersao: string;
  politicaAceitaEm: Date;
}

export interface NovoConvidado {
  nome: string;
  apelidoPublico: string;
  email: string;
  papel: Papel;
}

export interface RepositorioUsuarios {
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  criarCidadao(dados: NovoCidadao): Promise<Usuario>;
  criarConvidado(dados: NovoConvidado): Promise<Usuario>;
  registrarAceitePolitica(id: string, versao: string, agora: Date): Promise<void>;
}

/** De onde veio a requisição; fica gravado no refresh token. */
export interface Origem {
  ip: string | null;
  userAgent: string | null;
}

export interface RefreshGravado {
  id: string;
  usuarioId: string;
  familiaId: string;
  expiraEm: Date;
  usadoEm: Date | null;
  revogadoEm: Date | null;
}

export interface NovoRefresh extends Origem {
  usuarioId: string;
  familiaId: string;
  tokenHash: string;
  expiraEm: Date;
}

export interface RepositorioSessoes {
  criar(dados: NovoRefresh): Promise<void>;
  buscarPorHash(tokenHash: string): Promise<RefreshGravado | null>;
  /**
   * Marca o token como usado e grava o sucessor, juntos. Devolve false se outra requisição usou o
   * token primeiro (duas abas renovando ao mesmo tempo).
   */
  rotacionar(id: string, sucessor: NovoRefresh, agora: Date): Promise<boolean>;
  revogarFamilia(familiaId: string, agora: Date): Promise<void>;
  revogarDoUsuario(usuarioId: string, agora: Date): Promise<void>;
}

export type TipoTokenAcesso = 'REDEFINIR_SENHA' | 'CONVITE';

export interface NovoTokenAcesso {
  usuarioId: string;
  tipo: TipoTokenAcesso;
  tokenHash: string;
  expiraEm: Date;
}

export interface TokenAcessoGravado {
  id: string;
  usuarioId: string;
  expiraEm: Date;
  usadoEm: Date | null;
}

export interface RepositorioTokensAcesso {
  criar(dados: NovoTokenAcesso): Promise<void>;
  buscarPorHash(tokenHash: string): Promise<TokenAcessoGravado | null>;
  /**
   * Marca o token como usado, grava a senha nova e invalida os outros links pendentes do
   * usuário, juntos. Devolve false se outra requisição usou o token primeiro.
   */
  definirSenha(token: TokenAcessoGravado, senhaHash: string, agora: Date): Promise<boolean>;
}
