import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';

export type ItemFila = components['schemas']['ItemFilaResposta'];
export type DetalheAtendimento = components['schemas']['DetalheAtendimentoResposta'];
export type EventoAtendimento = components['schemas']['EventoResposta'];
export type StatusInterno = ItemFila['status'];

export const TODOS_STATUS: readonly StatusInterno[] = [
  'RECEBIDA',
  'EM_ANALISE',
  'EM_EXECUCAO',
  'RESOLVIDA',
  'RECUSADA',
  'DUPLICADA',
];

/** A fila abre com o que ainda espera o órgão. */
export const STATUS_ABERTOS: readonly StatusInterno[] = ['RECEBIDA', 'EM_ANALISE', 'EM_EXECUCAO'];

export const ROTULO_STATUS: Record<StatusInterno, string> = {
  RECEBIDA: 'Recebida',
  EM_ANALISE: 'Em análise',
  EM_EXECUCAO: 'Em execução',
  RESOLVIDA: 'Resolvida',
  RECUSADA: 'Recusada',
  DUPLICADA: 'Duplicada',
};

export const AVISO_CONFLITO = 'A ocorrência mudou, recarregando';

/** Grupo de cor do selo de status: as mesmas cores do status público. */
export function tomDoStatus(
  status: StatusInterno,
): 'recebido' | 'andamento' | 'resolvido' | 'final' {
  if (status === 'RECEBIDA') return 'recebido';
  if (status === 'EM_ANALISE' || status === 'EM_EXECUCAO') return 'andamento';
  return status === 'RESOLVIDA' ? 'resolvido' : 'final';
}

/** Título de um evento na linha do tempo do agente. */
export function tituloDoEvento(evento: EventoAtendimento): string {
  if (evento.de_status === null) return 'Registrada pelo cidadão';
  if (evento.orgao === null) return 'Reaberta: o cidadão disse que não foi resolvido';
  return `${ROTULO_STATUS[evento.de_status]} → ${ROTULO_STATUS[evento.para_status]}`;
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function formatarDataHora(iso: string): string {
  return DATA_HORA.format(new Date(iso));
}

/** O dado que cada status final exige do agente. */
export type CampoObrigatorio = 'resposta' | 'justificativa' | 'protocolo';

export interface Acao {
  para: StatusInterno;
  rotulo: string;
  campo: CampoObrigatorio | null;
}

const ACOES: Record<StatusInterno, Omit<Acao, 'para'>> = {
  RECEBIDA: { rotulo: 'Voltar para recebida', campo: null },
  EM_ANALISE: { rotulo: 'Iniciar análise', campo: null },
  EM_EXECUCAO: { rotulo: 'Iniciar execução', campo: null },
  RESOLVIDA: { rotulo: 'Resolver', campo: 'resposta' },
  RECUSADA: { rotulo: 'Recusar', campo: 'justificativa' },
  DUPLICADA: { rotulo: 'Marcar como duplicada', campo: 'protocolo' },
};

/** Os botões vêm só das transições que a API diz estarem liberadas agora. */
export function acoesPermitidas(
  detalhe: Pick<DetalheAtendimento, 'transicoes_permitidas'>,
): Acao[] {
  return detalhe.transicoes_permitidas.map((para) => ({ para, ...ACOES[para] }));
}

export const ROTULO_CAMPO: Record<CampoObrigatorio, string> = {
  resposta: 'Resposta oficial',
  justificativa: 'Justificativa da recusa',
  protocolo: 'Protocolo da ocorrência original',
};

export const COMENTARIO_MAX = 1000;
const PROTOCOLO = /^FA-\d{4}-[A-Z]{2,}-\d{6}$/;

/** O mesmo que a API confere, para avisar antes de enviar. */
export function problemaDoCampo(campo: CampoObrigatorio | null, valor: string): string | null {
  if (!campo) return null;
  const texto = valor.trim();
  if (!texto) return `Informe a ${ROTULO_CAMPO[campo].toLowerCase()}`;
  if (campo === 'protocolo') {
    return PROTOCOLO.test(texto.toUpperCase()) ? null : 'Use o formato FA-2026-SOR-000123';
  }
  return texto.length <= COMENTARIO_MAX ? null : `Use até ${COMENTARIO_MAX} caracteres`;
}

export interface FiltrosFila {
  status: StatusInterno[];
  categorias: string[];
}

export type ResultadoFila =
  | { tipo: 'OK'; itens: ItemFila[]; proximoCursor: string | null }
  | { tipo: 'ERRO'; mensagem: string };

export async function listarFila(
  api: Api,
  filtros: FiltrosFila,
  cursor: string | null = null,
): Promise<ResultadoFila> {
  try {
    const { data, error } = await api.GET('/api/v1/atendimento/ocorrencias', {
      params: {
        query: {
          ...(filtros.status.length ? { status: filtros.status.join(',') } : {}),
          ...(filtros.categorias.length ? { categoria: filtros.categorias.join(',') } : {}),
          ...(cursor ? { cursor } : {}),
        },
      },
    });
    if (data) return { tipo: 'OK', itens: data.itens, proximoCursor: data.proximo_cursor };
    return {
      tipo: 'ERRO',
      mensagem: mensagemDoErro(lerErroApi(error), 'Não foi possível carregar a fila.'),
    };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

export type ResultadoDetalhe =
  { tipo: 'OK'; detalhe: DetalheAtendimento } | { tipo: 'ERRO'; mensagem: string };

export async function obterDetalhe(api: Api, id: string): Promise<ResultadoDetalhe> {
  try {
    const { data, error } = await api.GET('/api/v1/atendimento/ocorrencias/{id}', {
      params: { path: { id } },
    });
    if (data) return { tipo: 'OK', detalhe: data };
    return {
      tipo: 'ERRO',
      mensagem: mensagemDoErro(lerErroApi(error), 'Não foi possível abrir a ocorrência.'),
    };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

export interface PedidoTransicao {
  /** O status que a tela mostrava quando o agente escolheu a ação. */
  de: StatusInterno;
  para: StatusInterno;
  /** Resposta oficial, justificativa ou protocolo, conforme a ação. */
  valor?: string;
}

export type ResultadoTransicao =
  | { tipo: 'OK'; status: StatusInterno }
  /** Alguém mudou o status antes: a tela recarrega. */
  | { tipo: 'CONFLITO' }
  | { tipo: 'ERRO'; codigo: string | null; mensagem: string };

export async function transicionar(
  api: Api,
  id: string,
  pedido: PedidoTransicao,
): Promise<ResultadoTransicao> {
  const campo = ACOES[pedido.para].campo;
  const valor = pedido.valor?.trim() ?? '';
  try {
    const { data, error } = await api.POST('/api/v1/atendimento/ocorrencias/{id}/transicoes', {
      params: { path: { id } },
      body: {
        status_esperado: pedido.de,
        para_status: pedido.para,
        ...(campo === 'protocolo' && valor ? { protocolo_original: valor.toUpperCase() } : {}),
        ...(campo !== 'protocolo' && valor ? { comentario: valor } : {}),
      },
    });
    if (data) return { tipo: 'OK', status: data.status };
    const erro = lerErroApi(error);
    if (erro?.codigo === 'CONFLITO_STATUS') return { tipo: 'CONFLITO' };
    return {
      tipo: 'ERRO',
      codigo: erro?.codigo ?? null,
      mensagem: mensagemDoErro(erro, 'Não foi possível mudar o status. Tente de novo.'),
    };
  } catch {
    return { tipo: 'ERRO', codigo: null, mensagem: MENSAGEM_SEM_CONEXAO };
  }
}
