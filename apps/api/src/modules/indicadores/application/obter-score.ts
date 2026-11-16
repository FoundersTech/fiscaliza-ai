import { Inject, Injectable } from '@nestjs/common';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { umaCasa } from '../domain/painel.js';
import { type CategoriaDesempenho, DESEMPENHO_ORGAOS, type DesempenhoOrgaos } from './portas.js';

export interface ScoreOrgao {
  /** Null sem ocorrências na janela ou enquanto não foi calculado. */
  score: number | null;
  classificacao: string | null;
  /** Percentual com uma casa; null sem ocorrências na janela ou enquanto não foi calculado. */
  resolvidasPct: number | null;
  /** Mediana com uma casa; null sem resolvidas ou enquanto não foi calculado. */
  diasMediana: number | null;
  porCategoria: CategoriaDesempenho[];
  janelaDias: number;
  /** Null enquanto não foi calculado. */
  calculadoEm: Date | null;
}

/** O último score calculado do órgão do município, sem calcular nada na hora. */
@Injectable()
export class ObterScore {
  constructor(
    @Inject(DESEMPENHO_ORGAOS) private readonly desempenhos: DesempenhoOrgaos,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
  ) {}

  async executar(municipioId: number | null): Promise<ScoreOrgao> {
    const lido = await this.desempenhos.ler(municipioId);
    if (!lido) {
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Nenhum órgão atendido neste município.', 404);
    }

    const { desempenho } = lido;
    if (!desempenho) {
      return {
        score: null,
        classificacao: null,
        resolvidasPct: null,
        diasMediana: null,
        porCategoria: [],
        janelaDias: this.parametros.score.janela_dias,
        calculadoEm: null,
      };
    }

    return {
      score: desempenho.score,
      classificacao: desempenho.classificacao,
      resolvidasPct:
        desempenho.total === 0 ? null : umaCasa((100 * desempenho.resolvidas) / desempenho.total),
      diasMediana: desempenho.diasMediana === null ? null : umaCasa(desempenho.diasMediana),
      porCategoria: desempenho.porCategoria,
      janelaDias: desempenho.janelaDias,
      calculadoEm: desempenho.calculadoEm,
    };
  }
}
