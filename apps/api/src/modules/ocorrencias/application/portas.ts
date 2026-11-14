import type { Ponto } from '../../territorio/domain/endereco.js';
import type {
  DadosOcorrencia,
  EventoStatus,
  OriginalDuplicidade,
  StatusOcorrencia,
} from '../domain/ocorrencia.js';
import type { Atributos } from '../domain/schema-atributos.js';

export const REPOSITORIO_OCORRENCIAS = Symbol('REPOSITORIO_OCORRENCIAS');

export interface OcorrenciaGravada {
  id: string;
  autorId: string | null;
  protocolo: string;
  status: StatusOcorrencia;
}

export interface CategoriaDoRegistro {
  id: number;
  schemaAtributos: unknown;
}

export interface CandidataDuplicidade {
  id: string;
  protocolo: string;
  descricao: string;
  distanciaM: number;
  confirmacoes: number;
}

export interface NovaOcorrencia {
  id: string;
  autorId: string;
  publicarAutor: boolean;
  categoriaId: number;
  municipioId: number;
  municipioSigla: string;
  orgaoId: number;
  descricao: string;
  atributos: Atributos;
  local: Ponto;
  precisaoM: number | null;
  endereco: string | null;
  fotos: { ordem: number; uploadKey: string }[];
  criadaEm: Date;
}

export interface ResultadoGravacao {
  /** Falso quando outra requisição gravou o mesmo id primeiro. */
  criada: boolean;
  ocorrencia: OcorrenciaGravada;
  fotoIds: string[];
}

/** A ocorrência e o órgão responsável por ela. */
export interface OcorrenciaDoOrgao {
  dados: DadosOcorrencia;
  orgaoId: number;
}

/** Estado novo depois de uma transição do agente, com o evento que a registra. */
export interface TransicaoGravavel {
  /** O status lido antes da transição: se outra pessoa mudou antes, nada é gravado. */
  statusEsperado: StatusOcorrencia;
  estado: DadosOcorrencia;
  evento: EventoStatus;
  agenteId: string;
  orgaoId: number;
}

export interface RepositorioOcorrencias {
  buscar(id: string): Promise<OcorrenciaGravada | null>;
  categoriaAtiva(id: number): Promise<CategoriaDoRegistro | null>;
  candidatasDuplicidade(filtro: {
    categoriaId: number;
    local: Ponto;
    raioM: number;
    limite: number;
  }): Promise<CandidataDuplicidade[]>;
  criar(nova: NovaOcorrencia): Promise<ResultadoGravacao>;
  localSemEndereco(id: string): Promise<Ponto | null>;
  gravarEndereco(id: string, endereco: string): Promise<void>;
  semEnderecoCriadasAntes(antesDe: Date, limite: number): Promise<string[]>;
  carregar(id: string): Promise<DadosOcorrencia | null>;
  confirmar(ocorrenciaId: string, usuarioId: string, criadaEm: Date): Promise<number | null>;
  carregarComOrgao(id: string): Promise<OcorrenciaDoOrgao | null>;
  originalPorProtocolo(protocolo: string): Promise<OriginalDuplicidade | null>;
  /** Devolve o id do evento, ou null quando o status já não era o esperado. */
  gravarTransicao(transicao: TransicaoGravavel): Promise<number | null>;
}
