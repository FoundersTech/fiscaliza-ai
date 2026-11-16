import type { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';
import type { ContagensPainel, Painel, PeriodoPainel } from '../domain/painel.js';

/** Contagens do painel direto do banco. */
export const CONSULTAS_PAINEL = Symbol('CONSULTAS_PAINEL');

/** Guarda o painel já calculado por alguns minutos. */
export const CACHE_PAINEL = Symbol('CACHE_PAINEL');

export interface FiltroPainel {
  /** Null: todos os municípios ativos. */
  municipioId: number | null;
  periodoDias: PeriodoPainel;
  /** Slugs das categorias, sem repetição e em ordem; null: todas. */
  categorias: string[] | null;
}

export interface ConsultasPainel {
  /** Ocorrências com os status aceitos, registradas a partir de `desde`. */
  contar(filtro: FiltroPainel, status: StatusOcorrencia[], desde: Date): Promise<ContagensPainel>;
}

/** O painel guardado, com o momento em que foi calculado. */
export interface PainelCalculado extends Painel {
  calculadoEm: Date;
}

/** Agregados das ocorrências por órgão e o desempenho gravado em `desempenho_orgao`. */
export const DESEMPENHO_ORGAOS = Symbol('DESEMPENHO_ORGAOS');

export interface OrgaoAtivo {
  orgaoId: number;
  municipioId: number;
}

export interface CategoriaDesempenho {
  categoriaId: number;
  nome: string;
  total: number;
  resolvidas: number;
}

/** Contagens de um órgão na janela, sem as duplicadas; as recusadas contam como não resolvidas. */
export interface AgregadoOrgao {
  total: number;
  resolvidas: number;
  noPrazo: number;
  /** Mediana de dias entre o registro e a resolução; null sem nenhuma resolvida. */
  diasMediana: number | null;
  avaliacoes: number;
  /** Média das notas; null sem avaliações. */
  satisfacaoMedia: number | null;
  /** Só as categorias com ocorrências, da maior para a menor e pelo nome no empate. */
  porCategoria: CategoriaDesempenho[];
}

export interface DesempenhoOrgao extends AgregadoOrgao {
  orgaoId: number;
  municipioId: number;
  janelaDias: number;
  score: number | null;
  classificacao: string | null;
  calculadoEm: Date;
}

export interface DesempenhoOrgaos {
  /** Órgãos ativos de municípios ativos. */
  orgaosAtivos(): Promise<OrgaoAtivo[]>;
  /** Ocorrências do órgão registradas nos últimos `janelaDias` dias contados de `agora`. */
  agregar(orgaoId: number, janelaDias: number, agora: Date): Promise<AgregadoOrgao>;
  /** Substitui o desempenho anterior do órgão. */
  gravar(desempenho: DesempenhoOrgao): Promise<void>;
  /**
   * O órgão ativo do município ativo (o primeiro, sem município) e o último desempenho
   * calculado. Undefined quando não há órgão; `desempenho` null quando nunca foi calculado.
   */
  ler(municipioId: number | null): Promise<{ desempenho: DesempenhoOrgao | null } | undefined>;
}

export interface CachePainel {
  /** Undefined quando não há nada guardado (ou o cache está fora). */
  ler(chave: string): Promise<PainelCalculado | undefined>;
  gravar(chave: string, painel: PainelCalculado): Promise<void>;
}
