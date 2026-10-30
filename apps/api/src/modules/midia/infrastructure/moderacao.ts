import type { Parametros } from '../../../shared/config/parametros.js';
import type { DecisaoModeracao, ModeracaoPort } from '../application/portas.js';

/** Regra provisória: toda foto que o sharp conseguiu recodificar é aprovada. */
export class ModeracaoAprovarTudo implements ModeracaoPort {
  avaliar(): Promise<DecisaoModeracao> {
    return Promise.resolve({ aprovada: true });
  }
}

const ESTRATEGIAS: Record<Parametros['moderacao_estrategia'], () => ModeracaoPort> = {
  APROVAR_TUDO: () => new ModeracaoAprovarTudo(),
};

export function moderacaoPara(estrategia: Parametros['moderacao_estrategia']): ModeracaoPort {
  return ESTRATEGIAS[estrategia]();
}
