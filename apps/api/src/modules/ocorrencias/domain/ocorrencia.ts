import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';

export const StatusOcorrencia = {
  RECEBIDA: 'RECEBIDA',
  EM_ANALISE: 'EM_ANALISE',
  EM_EXECUCAO: 'EM_EXECUCAO',
  RESOLVIDA: 'RESOLVIDA',
  RECUSADA: 'RECUSADA',
  DUPLICADA: 'DUPLICADA',
} as const;
export type StatusOcorrencia = (typeof StatusOcorrencia)[keyof typeof StatusOcorrencia];

const { RECEBIDA, EM_ANALISE, EM_EXECUCAO, RESOLVIDA, RECUSADA, DUPLICADA } = StatusOcorrencia;

/**transições feitas pelo agente.*/
export const TRANSICOES_AGENTE: Readonly<Record<StatusOcorrencia, readonly StatusOcorrencia[]>> = {
  RECEBIDA: [EM_ANALISE, RECUSADA, DUPLICADA],
  EM_ANALISE: [EM_EXECUCAO, RECUSADA, DUPLICADA],
  EM_EXECUCAO: [RESOLVIDA],
  RESOLVIDA: [],
  RECUSADA: [],
  DUPLICADA: [],
};

const ABERTAS: readonly StatusOcorrencia[] = [RECEBIDA, EM_ANALISE, EM_EXECUCAO];
const EXIGEM_COMENTARIO: readonly StatusOcorrencia[] = [RECUSADA, RESOLVIDA];

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export interface DadosOcorrencia {
  id: string;
  municipioId: number;
  autorId: string | null;
  status: StatusOcorrencia;
  criadaEm: Date;
  triadaEm: Date | null;
  resolvidaEm: Date | null;
  duplicadaDeId: string | null;
  reaberturas: number;
}

export interface EventoStatus {
  deStatus: StatusOcorrencia;
  paraStatus: StatusOcorrencia;
  comentario: string | null;
  criadoEm: Date;
}

export interface OriginalDuplicidade {
  id: string;
  municipioId: number;
  status: StatusOcorrencia;
}

export interface ComandoTransicao {
  paraStatus: StatusOcorrencia;
  comentario?: string | null;
  original?: OriginalDuplicidade | null;
  agora: Date;
}

export interface ComandoReabertura {
  usuarioId: string;
  confirmou: boolean;
  justificativa: string;
  agora: Date;
  /** `janela_pos_resolucao_dias` de parametros.json*/
  janelaDias: number;
}

/**
 * Agregado Ocorrencia:Regras de atendimento e reabertura . Não grava nada: cada mudança devolve o evento para a camada de aplicação
 * persistir junto com o novo estado.
 */
export class Ocorrencia {
  private constructor(private dados: DadosOcorrencia) { }

  static reconstituir(dados: DadosOcorrencia): Ocorrencia {
    return new Ocorrencia({ ...dados });
  }

  get estado(): Readonly<DadosOcorrencia> {
    return { ...this.dados };
  }

  get status(): StatusOcorrencia {
    return this.dados.status;
  }

  estaAberta(): boolean {
    return ABERTAS.includes(this.dados.status);
  }

  /** Autor ou quem confirmou: pode avaliar e reabrir*/
  temVinculo(usuarioId: string, confirmou: boolean): boolean {
    return confirmou || (this.dados.autorId !== null && this.dados.autorId === usuarioId);
  }

  dentroDaJanelaPosResolucao(agora: Date, janelaDias: number): boolean {
    const { status, resolvidaEm } = this.dados;
    if (status !== RESOLVIDA || !resolvidaEm) return false;
    return agora.getTime() <= resolvidaEm.getTime() + janelaDias * UM_DIA_MS;
  }

  /** Transição feita pelo agente do órgão */
  transicionar(comando: ComandoTransicao): EventoStatus {
    const de = this.dados.status;
    const para = comando.paraStatus;

    if (!TRANSICOES_AGENTE[de].includes(para)) {
      throw new ErroDominio('TRANSICAO_INVALIDA', `Não é possível passar de ${de} para ${para}.`, {
        de,
        para,
        permitidas: TRANSICOES_AGENTE[de],
      });
    }

    const comentario = comando.comentario?.trim() || null;
    if (EXIGEM_COMENTARIO.includes(para) && !comentario) {
      throw new ErroDominio(
        'COMENTARIO_OBRIGATORIO',
        para === RESOLVIDA
          ? 'Informe a resposta oficial da resolução.'
          : 'Informe a justificativa da recusa.',
      );
    }

    if (para === DUPLICADA) {
      this.conferirOriginal(comando.original);
    }

    if (de === RECEBIDA && !this.dados.triadaEm) {
      this.dados.triadaEm = comando.agora;
    }
    if (para === RESOLVIDA) {
      this.dados.resolvidaEm = comando.agora;
    }
    if (para === DUPLICADA) {
      this.dados.duplicadaDeId = comando.original!.id;
    }
    this.dados.status = para;

    return { deStatus: de, paraStatus: para, comentario, criadoEm: comando.agora };
  }

  reabrir(comando: ComandoReabertura): EventoStatus {
    if (!this.temVinculo(comando.usuarioId, comando.confirmou)) {
      throw new ErroDominio(
        'SEM_VINCULO',
        'Só o autor ou quem confirmou a ocorrência pode reabri-la.',
      );
    }
    if (this.dados.status !== RESOLVIDA) {
      throw new ErroDominio('NAO_RESOLVIDA', 'Só uma ocorrência resolvida pode ser reaberta.', {
        status: this.dados.status,
      });
    }
    if (!this.dentroDaJanelaPosResolucao(comando.agora, comando.janelaDias)) {
      throw new ErroDominio(
        'FORA_DO_PRAZO',
        `A reabertura só é aceita até ${comando.janelaDias} dias depois da resolução.`,
      );
    }
    const justificativa = comando.justificativa.trim();
    if (!justificativa) {
      throw new ErroDominio('COMENTARIO_OBRIGATORIO', 'Informe por que não foi resolvido.');
    }

    this.dados.status = EM_ANALISE;
    this.dados.resolvidaEm = null;
    this.dados.reaberturas += 1;

    return {
      deStatus: RESOLVIDA,
      paraStatus: EM_ANALISE,
      comentario: justificativa,
      criadoEm: comando.agora,
    };
  }

  /** ("DUPLICADA apontando para ela mesma, para outra DUPLICADA ou outro município"). */
  private conferirOriginal(original: OriginalDuplicidade | null | undefined): void {
    const motivo = !original
      ? 'Informe o protocolo de uma ocorrência original.'
      : original.id === this.dados.id
        ? 'Uma ocorrência não pode ser duplicada dela mesma.'
        : original.status === DUPLICADA
          ? 'A original não pode ser outra ocorrência duplicada.'
          : original.municipioId !== this.dados.municipioId
            ? 'A original precisa ser do mesmo município.'
            : null;
    if (motivo) {
      throw new ErroDominio('ORIGINAL_INVALIDA', motivo);
    }
  }
}
