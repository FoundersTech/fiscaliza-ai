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

export interface CachePainel {
  /** Undefined quando não há nada guardado (ou o cache está fora). */
  ler(chave: string): Promise<PainelCalculado | undefined>;
  gravar(chave: string, painel: PainelCalculado): Promise<void>;
}
