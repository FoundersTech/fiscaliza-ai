import { Inject, Injectable } from '@nestjs/common';

import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { FilaNotificacoes } from '../../notificacoes/application/fila-notificacoes.js';
import { type DadosOcorrencia, Ocorrencia, StatusOcorrencia } from '../domain/ocorrencia.js';
import { ocorrenciaNaoEncontrada } from './confirmar-ocorrencia.js';
import { REPOSITORIO_OCORRENCIAS, type RepositorioOcorrencias } from './portas.js';

/** Quem atende: o agente e o órgão do token. */
export interface Agente {
  usuarioId: string;
  orgaoId: number | null;
}

export interface PedidoTransicao {
  ocorrenciaId: string;
  agente: Agente;
  statusEsperado: StatusOcorrencia;
  paraStatus: StatusOcorrencia;
  comentario?: string | null;
  protocoloOriginal?: string | null;
}

export interface ResultadoTransicao {
  estado: Readonly<DadosOcorrencia>;
  eventoId: number;
}

/** Códigos do agregado que viram 422: a transição pedida não vale para o estado atual. */
const RECUSAS_DO_DOMINIO = ['TRANSICAO_INVALIDA', 'COMENTARIO_OBRIGATORIO', 'ORIGINAL_INVALIDA'];

export function outroOrgao(): ErroAplicacao {
  return new ErroAplicacao('OUTRO_ORGAO', 'Esta ocorrência é de outro órgão.', 403);
}

/** Só o agente do órgão responsável mexe na ocorrência. */
export function conferirOrgao(orgaoDaOcorrencia: number, agente: Agente): void {
  if (agente.orgaoId === null || agente.orgaoId !== orgaoDaOcorrencia) throw outroOrgao();
}

/**
 * Mudança de status pelo agente do órgão. As transições e o dado exigido por status vêm do
 * agregado; aqui ficam o órgão, a concorrência e a gravação com o evento.
 */
@Injectable()
export class TransicionarStatus {
  constructor(
    @Inject(REPOSITORIO_OCORRENCIAS) private readonly ocorrencias: RepositorioOcorrencias,
    private readonly filaNotificacoes: FilaNotificacoes,
  ) {}

  async executar(pedido: PedidoTransicao, agora = new Date()): Promise<ResultadoTransicao> {
    const carregada = await this.ocorrencias.carregarComOrgao(pedido.ocorrenciaId);
    if (!carregada) throw ocorrenciaNaoEncontrada();
    conferirOrgao(carregada.orgaoId, pedido.agente);

    if (carregada.dados.status !== pedido.statusEsperado) throw conflito(carregada.dados.status);

    const protocolo = pedido.protocoloOriginal?.trim() || null;
    const original =
      pedido.paraStatus === StatusOcorrencia.DUPLICADA && protocolo
        ? await this.ocorrencias.originalPorProtocolo(protocolo)
        : null;

    const ocorrencia = Ocorrencia.reconstituir(carregada.dados);
    let evento;
    try {
      evento = ocorrencia.transicionar({
        paraStatus: pedido.paraStatus,
        comentario: pedido.comentario ?? null,
        original,
        agora,
      });
    } catch (erro) {
      throw recusa(erro, protocolo !== null && original === null);
    }

    const estado = ocorrencia.estado;
    const eventoId = await this.ocorrencias.gravarTransicao({
      statusEsperado: pedido.statusEsperado,
      estado,
      evento,
      agenteId: pedido.agente.usuarioId,
      orgaoId: carregada.orgaoId,
    });
    // Outra pessoa mudou o status entre a leitura e a gravação.
    if (eventoId === null) {
      const atual = await this.ocorrencias.carregar(pedido.ocorrenciaId);
      throw conflito(atual?.status ?? null);
    }

    await this.filaNotificacoes.eventoGravado({ eventoId, ocorrenciaId: estado.id });
    return { estado, eventoId };
  }
}

function conflito(atual: StatusOcorrencia | null): ErroAplicacao {
  return new ErroAplicacao(
    'CONFLITO_STATUS',
    'A ocorrência mudou de status enquanto você a via. Recarregue para ver o estado atual.',
    409,
    { status_atual: atual },
  );
}

function recusa(erro: unknown, protocoloInexistente: boolean): unknown {
  if (!(erro instanceof ErroDominio) || !RECUSAS_DO_DOMINIO.includes(erro.codigo)) return erro;
  const mensagem =
    erro.codigo === 'ORIGINAL_INVALIDA' && protocoloInexistente
      ? 'Nenhuma ocorrência tem o protocolo informado.'
      : erro.message;
  return new ErroAplicacao(erro.codigo, mensagem, 422, erro.detalhes);
}
