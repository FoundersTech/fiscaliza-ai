import type { CampoAtributo } from '../../ocorrencias/domain/schema-atributos.js';
import type { PartesEndereco, Ponto } from '../domain/endereco.js';

export const GEOCODING_PORT = Symbol('GEOCODING_PORT');
export const REPOSITORIO_TERRITORIO = Symbol('REPOSITORIO_TERRITORIO');

/** Endereço reverso. Falhas lançam erro; o sinal cancela a consulta. */
export interface GeocodingPort {
  /** Null quando o geocodificador não conhece endereço nenhum no ponto. */
  enderecoDe(ponto: Ponto, sinal: AbortSignal): Promise<PartesEndereco | null>;
}

/** Município ativo que contém o ponto e o órgão único dele, para onde a ocorrência vai. */
export interface Territorio {
  municipioId: number;
  municipioSigla: string;
  orgaoId: number;
}

export interface MunicipioAtendido {
  id: number;
  nome: string;
  uf: string;
  centro: Ponto;
  bbox: { sul: number; oeste: number; norte: number; leste: number };
}

export interface CategoriaAtiva {
  id: number;
  slug: string;
  nome: string;
  icone: string;
  schemaAtributos: CampoAtributo[];
}

export interface RepositorioTerritorio {
  localizar(ponto: Ponto): Promise<Territorio | null>;
  municipioAtendido(): Promise<MunicipioAtendido | null>;
  categoriasAtivas(): Promise<CategoriaAtiva[]>;
}
