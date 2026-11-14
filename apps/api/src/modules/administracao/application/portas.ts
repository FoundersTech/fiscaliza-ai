export const REPOSITORIO_ADMINISTRACAO = Symbol('REPOSITORIO_ADMINISTRACAO');

export interface Orgao {
  id: number;
  municipioId: number;
  nome: string;
  sigla: string;
}

export interface Agente {
  id: string;
  nome: string;
  email: string;
  orgaoId: number;
  ativo: boolean;
  /** Ainda não definiu a senha pelo link do convite. */
  convitePendente: boolean;
}

export interface Gestor {
  id: string;
  nome: string;
  email: string;
  municipioId: number;
}

export interface RepositorioAdministracao {
  buscarOrgaoDoMunicipio(municipioId: number): Promise<Orgao | null>;
  atualizarOrgao(id: number, dados: { nome?: string; sigla?: string }): Promise<Orgao>;
  listarAgentes(orgaoId: number): Promise<Agente[]>;
  /** Só devolve contas de AGENTE_ORGAO não anonimizadas, de qualquer órgão. */
  buscarAgente(id: string): Promise<Agente | null>;
  municipioExiste(id: number): Promise<boolean>;
}
