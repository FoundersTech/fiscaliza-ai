import type { EventoHistorico } from '../domain/historico.js';
import type { StatusOcorrencia } from '../domain/ocorrencia.js';

/** Leituras de ocorrências (feed, mapa e detalhe), separadas do repositório de escrita. */
export const CONSULTAS_OCORRENCIAS = Symbol('CONSULTAS_OCORRENCIAS');

export interface FiltroPublico {
  /** Null: todos os municípios ativos. */
  municipioId: number | null;
  /** Status internos aceitos; nunca vazio. */
  status: StatusOcorrencia[];
  /** Slugs das categorias; null: todas. */
  categorias: string[] | null;
}

/**
 * Posição de uma ocorrência na ordem do feed (criada_em DESC, id DESC). A data vai como texto
 * com microssegundos, a precisão do banco, para a página seguinte não repetir nem pular itens.
 */
export interface PosicaoFeed {
  criadaEm: string;
  id: string;
}

export interface CategoriaDoCard {
  slug: string;
  nome: string;
  icone: string;
}

/** O que o banco entrega para montar um card. */
export interface DadosCard {
  id: string;
  protocolo: string;
  status: StatusOcorrencia;
  descricao: string;
  endereco: string | null;
  criadaEm: Date;
  resolvidaEm: Date | null;
  categoria: CategoriaDoCard;
  confirmacoes: number;
  /** Miniatura da primeira foto aprovada, ou null se nenhuma foi aprovada ainda. */
  miniaturaKey: string | null;
}

export interface LinhaFeed extends DadosCard {
  posicao: PosicaoFeed;
}

/** Retângulo do mapa, em graus. */
export interface AreaMapa {
  oeste: number;
  sul: number;
  leste: number;
  norte: number;
}

export interface LinhaPontoMapa {
  id: string;
  lat: number;
  lng: number;
  status: StatusOcorrencia;
  categoriaSlug: string;
  confirmacoes: number;
}

/** A ocorrência original, quando esta foi marcada como duplicada. */
export interface ReferenciaOriginal {
  id: string;
  protocolo: string;
}

export interface FotoPublicada {
  storageKey: string;
  miniaturaKey: string | null;
}

/** O que o banco entrega para montar o detalhe. */
export interface DadosDetalhe extends DadosCard {
  municipioId: number;
  autorId: string | null;
  /** Já vem null quando o autor não quis aparecer ou a conta foi anonimizada. */
  autorApelido: string | null;
  atributos: Record<string, unknown>;
  triadaEm: Date | null;
  duplicadaDeId: string | null;
  reaberturas: number;
  /** Só as aprovadas, em ordem. */
  fotos: FotoPublicada[];
  eventos: EventoHistorico[];
  original: ReferenciaOriginal | null;
}

/** Uma ocorrência na lista do próprio autor, com qualquer status. */
export interface LinhaDoAutor extends LinhaFeed {
  justificativaRecusa: string | null;
  original: ReferenciaOriginal | null;
}

export interface VinculoGravado {
  confirmou: boolean;
  avaliou: boolean;
}

export interface ConsultasOcorrencias {
  /** Até `limite` ocorrências, da mais recente para a mais antiga, depois de `depoisDe`. */
  feed(filtro: FiltroPublico, depoisDe: PosicaoFeed | null, limite: number): Promise<LinhaFeed[]>;
  /** Até `limite` pontos dentro da área, dos mais recentes para os mais antigos. */
  pontosNaArea(filtro: FiltroPublico, area: AreaMapa, limite: number): Promise<LinhaPontoMapa[]>;
  /** Qualquer status: quem chama decide se a pessoa pode ver. */
  detalhe(id: string): Promise<DadosDetalhe | null>;
  /** Se a pessoa já confirmou e já avaliou a ocorrência. */
  vinculo(ocorrenciaId: string, usuarioId: string): Promise<VinculoGravado>;
  /** Até `limite` ocorrências do autor, com todos os status, na ordem do feed. */
  doAutor(autorId: string, depoisDe: PosicaoFeed | null, limite: number): Promise<LinhaDoAutor[]>;
}
