import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';

export type Alerta = components['schemas']['AlertaResposta'];

export type ResultadoAlertas =
  | { tipo: 'OK'; itens: Alerta[]; proximoCursor: string | null }
  | { tipo: 'ERRO'; mensagem: string };

export const ALERTAS_POR_PAGINA = 20;
/** Com o app aberto, o indicador é atualizado a cada minuto. */
export const INTERVALO_ALERTAS_MS = 60_000;

const MENSAGEM_ALERTAS = 'Não foi possível carregar seus alertas. Tente de novo.';

/** Uma página da aba Alertas, do mais recente para o mais antigo. */
export async function buscarAlertas(api: Api, cursor: string | null): Promise<ResultadoAlertas> {
  try {
    const { data, error } = await api.GET('/api/v1/me/alertas', {
      params: { query: { limite: ALERTAS_POR_PAGINA, ...(cursor && { cursor }) } },
    });
    if (!data)
      return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_ALERTAS) };
    return { tipo: 'OK', itens: data.itens, proximoCursor: data.proximo_cursor };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

/** Quantos alertas chegaram desde a última visita à aba; null se não deu para saber agora. */
export async function contarAlertasNovos(api: Api): Promise<number | null> {
  try {
    const { data } = await api.GET('/api/v1/me/alertas/novos');
    return data?.quantidade ?? null;
  } catch {
    return null;
  }
}

/** Avisa a API que a pessoa abriu a aba; devolve se deu certo. */
export async function marcarAlertasVistos(api: Api): Promise<boolean> {
  try {
    const { response } = await api.POST('/api/v1/me/alertas/vistos');
    return response.ok;
  } catch {
    return false;
  }
}

/** O que o alerta diz, conforme o novo status da ocorrência. */
export function textoDoAlerta(alerta: Alerta): string {
  if (alerta.reaberta) return 'Foi reaberta e voltou para análise da prefeitura.';
  switch (alerta.para_status_publico) {
    case 'EM_ANDAMENTO':
      return 'Está em andamento na prefeitura.';
    case 'RESOLVIDO':
      return 'Foi resolvida pela prefeitura.';
    case 'RECUSADO':
      return 'Foi recusada pela prefeitura. Toque para ver o motivo.';
    case 'DUPLICADO':
      return 'Foi marcada como repetida. Toque para acompanhar a original.';
    case 'RECEBIDO':
      return 'Foi recebida pela prefeitura.';
  }
}

/** O número do indicador: acima de 9, só "9+". */
export function rotuloDoIndicador(quantidade: number): string | null {
  if (quantidade <= 0) return null;
  return quantidade > 9 ? '9+' : String(quantidade);
}

/** Rótulo acessível do sino e da aba, com a quantidade de alertas novos. */
export function rotuloAcessivelAlertas(quantidade: number): string {
  if (quantidade <= 0) return 'Alertas';
  return quantidade === 1 ? 'Alertas, 1 novo' : `Alertas, ${quantidade} novos`;
}

export interface OpcoesConsulta {
  consultar: () => unknown;
  intervaloMs?: number;
}

/** Consulta agora e a cada minuto enquanto o app está aberto. Devolve a função que para. */
export function agendarConsultaAlertas({
  consultar,
  intervaloMs = INTERVALO_ALERTAS_MS,
}: OpcoesConsulta): () => void {
  const relogio = setInterval(() => void consultar(), intervaloMs);
  void consultar();
  return () => clearInterval(relogio);
}
