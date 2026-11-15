import { Inject, Injectable } from '@nestjs/common';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { FilaNotificacoes } from '../../notificacoes/application/fila-notificacoes.js';
import { type DadosOcorrencia, Ocorrencia } from '../domain/ocorrencia.js';
import { ocorrenciaNaoEncontrada } from './confirmar-ocorrencia.js';
import { CONSULTAS_OCORRENCIAS, type ConsultasOcorrencias } from './consultas.js';
import { REPOSITORIO_OCORRENCIAS, type RepositorioOcorrencias } from './portas.js';
import { conflito } from './transicionar-status.js';

/** Códigos do agregado e o status HTTP de cada um; os demais seguem como erro interno. */
const STATUS_POR_CODIGO: Readonly<Record<string, number>> = {
  SEM_VINCULO: 403,
  NAO_RESOLVIDA: 422,
  FORA_DO_PRAZO: 422,
  COMENTARIO_OBRIGATORIO: 422,
};

function recusa(erro: unknown): unknown {
  const status = erro instanceof ErroDominio ? STATUS_POR_CODIGO[erro.codigo] : undefined;
  if (!(erro instanceof ErroDominio) || !status) return erro;
  return new ErroAplicacao(erro.codigo, erro.message, status, erro.detalhes);
}

/**
 * A ocorrência e o vínculo de quem pede. Recusada e duplicada só existem para o autor, e
 * nenhuma das duas chega a ser resolvida: para os demais, 404 como no detalhe.
 */
async function carregarComVinculo(
  ocorrencias: RepositorioOcorrencias,
  consultas: ConsultasOcorrencias,
  ocorrenciaId: string,
  usuarioId: string,
): Promise<{ ocorrencia: Ocorrencia; confirmou: boolean; avaliou: boolean }> {
  const dados = await ocorrencias.carregar(ocorrenciaId);
  const ocorrencia = dados && Ocorrencia.reconstituir(dados);
  if (!ocorrencia?.visivelPara(usuarioId)) throw ocorrenciaNaoEncontrada();
  const vinculo = await consultas.vinculo(ocorrenciaId, usuarioId);
  return { ocorrencia, ...vinculo };
}

export interface PedidoAvaliacao {
  ocorrenciaId: string;
  usuarioId: string;
  nota: number;
  comentario?: string | null;
}

/** "Avaliar atendimento": uma nota por pessoa, nos dias seguintes à resolução. */
@Injectable()
export class AvaliarAtendimento {
  constructor(
    @Inject(REPOSITORIO_OCORRENCIAS) private readonly ocorrencias: RepositorioOcorrencias,
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
  ) {}

  async executar(pedido: PedidoAvaliacao, agora = new Date()): Promise<void> {
    const { ocorrencia, confirmou, avaliou } = await carregarComVinculo(
      this.ocorrencias,
      this.consultas,
      pedido.ocorrenciaId,
      pedido.usuarioId,
    );
    try {
      ocorrencia.validarAvaliacao({
        usuarioId: pedido.usuarioId,
        confirmou,
        agora,
        janelaDias: this.parametros.janela_pos_resolucao_dias,
      });
    } catch (erro) {
      throw recusa(erro);
    }
    if (avaliou) throw jaAvaliada();

    const gravou = await this.ocorrencias.avaliar({
      ocorrenciaId: pedido.ocorrenciaId,
      usuarioId: pedido.usuarioId,
      nota: pedido.nota,
      comentario: pedido.comentario?.trim() || null,
      criadaEm: agora,
    });
    // Duas avaliações ao mesmo tempo: a chave do banco deixa passar só a primeira.
    if (!gravou) throw jaAvaliada();
  }
}

function jaAvaliada(): ErroAplicacao {
  return new ErroAplicacao('JA_AVALIADA', 'Você já avaliou esta ocorrência.', 409);
}

export interface PedidoReabertura {
  ocorrenciaId: string;
  usuarioId: string;
  justificativa: string;
}

export interface ResultadoReabertura {
  estado: Readonly<DadosOcorrencia>;
  eventoId: number;
}

/**
 * "Não foi resolvido": a ocorrência volta para a análise do órgão. O evento gravado leva quem
 * reabriu, para que o aviso vá ao autor e a quem confirmou, menos a própria pessoa.
 */
@Injectable()
export class ReabrirOcorrencia {
  constructor(
    @Inject(REPOSITORIO_OCORRENCIAS) private readonly ocorrencias: RepositorioOcorrencias,
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
    private readonly filaNotificacoes: FilaNotificacoes,
  ) {}

  async executar(pedido: PedidoReabertura, agora = new Date()): Promise<ResultadoReabertura> {
    const { ocorrencia, confirmou } = await carregarComVinculo(
      this.ocorrencias,
      this.consultas,
      pedido.ocorrenciaId,
      pedido.usuarioId,
    );
    let evento;
    try {
      evento = ocorrencia.reabrir({
        usuarioId: pedido.usuarioId,
        confirmou,
        justificativa: pedido.justificativa,
        agora,
        janelaDias: this.parametros.janela_pos_resolucao_dias,
      });
    } catch (erro) {
      throw recusa(erro);
    }

    const estado = ocorrencia.estado;
    const eventoId = await this.ocorrencias.gravarReabertura({
      estado,
      evento,
      usuarioId: pedido.usuarioId,
    });
    // O agente mudou o status entre a leitura e a gravação.
    if (eventoId === null) {
      const atual = await this.ocorrencias.carregar(pedido.ocorrenciaId);
      throw conflito(atual?.status ?? null);
    }

    await this.filaNotificacoes.eventoGravado({ eventoId, ocorrenciaId: estado.id });
    return { estado, eventoId };
  }
}
