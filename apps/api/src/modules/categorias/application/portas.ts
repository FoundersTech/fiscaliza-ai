import type { CampoAtributo } from '../../ocorrencias/domain/schema-atributos.js';

export interface Categoria {
  id: number;
  slug: string;
  nome: string;
  icone: string;
  slaDias: number;
  schemaAtributos: CampoAtributo[];
  ativa: boolean;
}

export type DadosCategoria = Omit<Categoria, 'id'>;

export const REPOSITORIO_CATEGORIAS = Symbol('REPOSITORIO_CATEGORIAS');

export interface RepositorioCategorias {
  /** Todas, ativas e inativas, em ordem de nome. */
  listar(): Promise<Categoria[]>;
  buscar(id: number): Promise<Categoria | null>;
  /** Lança SLUG_EM_USO se outra categoria já tem o slug. */
  criar(dados: DadosCategoria): Promise<Categoria>;
  /** Lança SLUG_EM_USO se outra categoria já tem o slug. Null se a categoria não existe. */
  atualizar(id: number, dados: Partial<DadosCategoria>): Promise<Categoria | null>;
}
