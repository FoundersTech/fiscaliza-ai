/** Janelas do painel, em dias, contadas para trás a partir de agora pela data de registro. */
export const PERIODOS_PAINEL = [30, 90, 365] as const;
export type PeriodoPainel = (typeof PERIODOS_PAINEL)[number];
export const PERIODO_PADRAO_PAINEL: PeriodoPainel = 30;

export interface CategoriaContada {
  slug: string;
  nome: string;
  icone: string;
  total: number;
  resolvidas: number;
}

/** O que o banco entrega: contagens das ocorrências visíveis ao público no período. */
export interface ContagensPainel {
  total: number;
  resolvidas: number;
  /** Mediana de dias entre o registro e a resolução, entre as resolvidas; null sem nenhuma. */
  diasMediana: number | null;
  porCategoria: CategoriaContada[];
}

export interface Painel {
  /** Nenhuma ocorrência no período: a tela mostra o aviso em vez de números zerados. */
  vazio: boolean;
  periodoDias: PeriodoPainel;
  total: number;
  resolvidas: number;
  /** Percentual com uma casa; null quando vazio. */
  resolvidasPct: number | null;
  diasMediana: number | null;
  porCategoria: CategoriaContada[];
}

/** Arredonda para uma casa, sem o ruído do ponto flutuante (6,75 guardado como 6,7499…). */
export function umaCasa(valor: number): number {
  return Math.round(Number((valor * 10).toPrecision(12))) / 10;
}

/** Monta o painel a partir das contagens, com as categorias da maior para a menor. */
export function montarPainel(periodoDias: PeriodoPainel, contagens: ContagensPainel): Painel {
  const vazio = contagens.total === 0;
  return {
    vazio,
    periodoDias,
    total: contagens.total,
    resolvidas: contagens.resolvidas,
    resolvidasPct: vazio ? null : umaCasa((100 * contagens.resolvidas) / contagens.total),
    diasMediana: contagens.diasMediana === null ? null : umaCasa(contagens.diasMediana),
    porCategoria: [...contagens.porCategoria]
      .filter((categoria) => categoria.total > 0)
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}
