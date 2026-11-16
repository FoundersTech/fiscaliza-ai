import { Inject, Injectable, Logger } from '@nestjs/common';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { CalculoScore } from '../domain/calculo-score.js';
import { DESEMPENHO_ORGAOS, type DesempenhoOrgaos, type OrgaoAtivo } from './portas.js';

/** Fila `indicadores` e o job do score, agendado pelo `recalculo_cron` dos parâmetros. */
export const FILA_INDICADORES = 'indicadores';
export const JOB_RECALCULAR_SCORE = 'indicadores.recalcular-score';

/**
 * Recalcula o score de cada órgão ativo e grava em `desempenho_orgao`. Se um órgão falhar,
 * o erro vai para o log e o desempenho anterior dele continua valendo, com o `calculado_em`
 * antigo à vista.
 */
@Injectable()
export class RecalcularScore {
  private readonly logger = new Logger(RecalcularScore.name);

  constructor(
    @Inject(DESEMPENHO_ORGAOS) private readonly desempenhos: DesempenhoOrgaos,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
  ) {}

  async executar(agora = new Date()): Promise<void> {
    const calculo = new CalculoScore(this.parametros.score);
    const orgaos = await this.desempenhos.orgaosAtivos();

    let falhas = 0;
    for (const orgao of orgaos) {
      try {
        await this.recalcular(orgao, calculo, agora);
      } catch (erro) {
        falhas += 1;
        this.logger.error(
          `Score do órgão ${orgao.orgaoId} não foi recalculado: ${String(erro)}`,
          erro instanceof Error ? erro.stack : undefined,
        );
      }
    }
    this.logger.log(`Score recalculado para ${orgaos.length - falhas} de ${orgaos.length} órgãos`);
  }

  private async recalcular(orgao: OrgaoAtivo, calculo: CalculoScore, agora: Date): Promise<void> {
    const janelaDias = this.parametros.score.janela_dias;
    const agregado = await this.desempenhos.agregar(orgao.orgaoId, janelaDias, agora);
    const { score, classificacao } = calculo.calcular({
      total: agregado.total,
      resolvidas: agregado.resolvidas,
      noPrazo: agregado.noPrazo,
      avaliacoes: agregado.avaliacoes,
      mediaAvaliacoes: agregado.satisfacaoMedia,
    });
    await this.desempenhos.gravar({
      ...orgao,
      ...agregado,
      janelaDias,
      score,
      classificacao,
      calculadoEm: agora,
    });
  }
}
