import { Inject, Injectable } from '@nestjs/common';

import { VISIVEIS_AO_PUBLICO } from '../../ocorrencias/domain/exibicao-publica.js';
import { montarPainel, PERIODO_PADRAO_PAINEL, type PeriodoPainel } from '../domain/painel.js';
import {
  CACHE_PAINEL,
  type CachePainel,
  CONSULTAS_PAINEL,
  type ConsultasPainel,
  type FiltroPainel,
  type PainelCalculado,
} from './portas.js';

export interface PedidoPainel {
  municipioId?: number | null;
  periodoDias?: PeriodoPainel | null;
  categorias?: string[] | null;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Normaliza o pedido: a mesma combinação de filtros sempre dá o mesmo filtro (e a mesma chave). */
export function filtroPainel(pedido: PedidoPainel): FiltroPainel {
  const categorias = [...new Set(pedido.categorias ?? [])].sort();
  return {
    municipioId: pedido.municipioId ?? null,
    periodoDias: pedido.periodoDias ?? PERIODO_PADRAO_PAINEL,
    categorias: categorias.length ? categorias : null,
  };
}

/** Chave do cache: uma por combinação de município, período e categorias. */
export function chaveCachePainel(filtro: FiltroPainel): string {
  const municipio = filtro.municipioId ?? 'todos';
  const categorias = filtro.categorias?.join(',') ?? 'todas';
  return `painel:${municipio}:${filtro.periodoDias}:${categorias}`;
}

/**
 * Indicadores públicos por período e categoria, só com ocorrências visíveis ao público.
 * Calculados na hora e guardados por alguns minutos para cada combinação de filtros.
 */
@Injectable()
export class ObterPainel {
  constructor(
    @Inject(CONSULTAS_PAINEL) private readonly consultas: ConsultasPainel,
    @Inject(CACHE_PAINEL) private readonly cache: CachePainel,
  ) {}

  async executar(pedido: PedidoPainel, agora = new Date()): Promise<PainelCalculado> {
    const filtro = filtroPainel(pedido);
    const chave = chaveCachePainel(filtro);

    const guardado = await this.cache.ler(chave);
    if (guardado) return guardado;

    const desde = new Date(agora.getTime() - filtro.periodoDias * UM_DIA_MS);
    const contagens = await this.consultas.contar(filtro, [...VISIVEIS_AO_PUBLICO], desde);
    const painel: PainelCalculado = {
      ...montarPainel(filtro.periodoDias, contagens),
      calculadoEm: agora,
    };
    await this.cache.gravar(chave, painel);
    return painel;
  }
}
