import { Inject, Injectable, Logger } from '@nestjs/common';

import { type StatusExibido, statusExibidoDe } from '../../ocorrencias/domain/exibicao-publica.js';
import {
  CONSULTAS_ALERTAS,
  type ConsultasAlertas,
  DestinatariosDoEvento,
  ehReabertura,
  type LinhaAlerta,
} from './alertas.js';
import { REPOSITORIO_PUSH, type RepositorioPush } from './portas.js';
import { type DestinoPush, type MensagemPush, PUSH_PORT, type PushPort } from './push.port.js';

/** O navegador do cidadão passa a receber push. */
@Injectable()
export class InscreverPush {
  constructor(@Inject(REPOSITORIO_PUSH) private readonly inscricoes: RepositorioPush) {}

  executar(usuarioId: string, destino: DestinoPush): Promise<void> {
    return this.inscricoes.salvar(usuarioId, destino);
  }
}

/** O navegador deixa de receber push. Repetir o pedido não dá erro. */
@Injectable()
export class CancelarPush {
  constructor(@Inject(REPOSITORIO_PUSH) private readonly inscricoes: RepositorioPush) {}

  executar(usuarioId: string, endpoint: string): Promise<void> {
    return this.inscricoes.removerDoUsuario(usuarioId, endpoint);
  }
}

const CORPO_POR_STATUS: Readonly<Record<StatusExibido, string>> = {
  RECEBIDO: 'Foi recebida pela prefeitura.',
  EM_ANDAMENTO: 'Está em andamento na prefeitura.',
  RESOLVIDO: 'Foi resolvida pela prefeitura.',
  RECUSADO: 'Foi recusada pela prefeitura. Toque para ver o motivo.',
  DUPLICADO: 'Foi marcada como repetida. Toque para acompanhar a original.',
};

/** O texto da notificação, igual ao do alerta na aba Alertas. */
export function mensagemDaMudanca(mudanca: LinhaAlerta): MensagemPush {
  return {
    titulo: `Ocorrência ${mudanca.protocolo}`,
    corpo: ehReabertura(mudanca.deStatus, mudanca.paraStatus)
      ? 'Foi reaberta e voltou para análise da prefeitura.'
      : CORPO_POR_STATUS[statusExibidoDe(mudanca.paraStatus)],
    url: `/ocorrencias/${mudanca.ocorrenciaId}`,
  };
}

export interface PedidoPushEvento {
  eventoId: number;
  /** Numa nova tentativa, só as inscrições que falharam antes; sem ele, todas. */
  somenteInscricoes?: readonly string[];
}

/** Como terminou o envio: as inscrições que falharam e merecem nova tentativa. */
export interface ResultadoPushEvento {
  enviados: number;
  expirados: number;
  falharam: string[];
}

/**
 * Push de uma mudança de status para quem a vê na aba Alertas, em cada navegador inscrito.
 * Inscrição que o serviço de push dá como expirada (404 ou 410) é apagada; nas outras falhas o
 * erro fica registrado na inscrição e ela volta na próxima tentativa do job.
 */
@Injectable()
export class EnviarPushEvento {
  private readonly logger = new Logger(EnviarPushEvento.name);

  constructor(
    private readonly destinatarios: DestinatariosDoEvento,
    @Inject(CONSULTAS_ALERTAS) private readonly consultas: ConsultasAlertas,
    @Inject(REPOSITORIO_PUSH) private readonly inscricoes: RepositorioPush,
    @Inject(PUSH_PORT) private readonly push: PushPort,
  ) {}

  async executar(pedido: PedidoPushEvento, agora = new Date()): Promise<ResultadoPushEvento> {
    const resultado: ResultadoPushEvento = { enviados: 0, expirados: 0, falharam: [] };

    const usuarios = await this.destinatarios.executar(pedido.eventoId);
    if (!usuarios.length) return resultado;
    const mudanca = await this.consultas.mudanca(pedido.eventoId);
    if (!mudanca) return resultado;

    let inscricoes = await this.inscricoes.dosUsuarios(usuarios);
    if (pedido.somenteInscricoes) {
      const pendentes = new Set(pedido.somenteInscricoes);
      inscricoes = inscricoes.filter((inscricao) => pendentes.has(inscricao.id));
    }
    if (!inscricoes.length) return resultado;

    const mensagem = mensagemDaMudanca(mudanca);
    await Promise.all(
      inscricoes.map(async (inscricao) => {
        try {
          const envio = await this.push.enviar(inscricao, mensagem);
          if (envio === 'INSCRICAO_EXPIRADA') {
            await this.inscricoes.apagar(inscricao.id);
            resultado.expirados += 1;
          } else if (envio === 'ENVIADO') {
            resultado.enviados += 1;
          }
        } catch (erro) {
          // O endpoint não vai para o log: quem o tiver consegue mandar push para o navegador.
          this.logger.warn(
            `Push do evento ${pedido.eventoId} para a inscrição ${inscricao.id} falhou: ${String(erro)}`,
          );
          resultado.falharam.push(inscricao.id);
          await this.inscricoes.registrarErro(inscricao.id, agora);
        }
      }),
    );
    return resultado;
  }
}
