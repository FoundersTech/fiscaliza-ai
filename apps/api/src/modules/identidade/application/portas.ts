import type { Papel } from '../domain/papel.js';

export const HASHER_SENHA = Symbol('HASHER_SENHA');
export const EMISSOR_TOKEN = Symbol('EMISSOR_TOKEN');
export const REPOSITORIO_USUARIOS = Symbol('REPOSITORIO_USUARIOS');

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
  /** Devolve os dados de um token válido, ou null se ele for inválido ou estiver expirado. */
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

export interface RepositorioUsuarios {
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  criarCidadao(dados: NovoCidadao): Promise<Usuario>;
}
