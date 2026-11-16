import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { errosDosCampos, lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';
import { type AmbientePush, ambienteDoNavegador } from './push';

export type Exportacao = components['schemas']['ExportacaoResposta'];
export type StatusExportacao = components['schemas']['StatusExportacao'];

/** Enquanto a exportação é gerada, a tela consulta o status nesse intervalo. */
export const INTERVALO_EXPORTACAO_MS = 3000;

const MENSAGEM_LISTAR = 'Não foi possível consultar suas exportações. Tente de novo.';
const MENSAGEM_SOLICITAR = 'Não foi possível pedir a exportação. Tente de novo.';
const MENSAGEM_CONSULTAR = 'Não foi possível consultar a exportação. Tente de novo.';
const MENSAGEM_EXCLUIR = 'Não foi possível excluir a conta. Tente de novo.';
const MENSAGEM_SENHA_INCORRETA = 'Senha incorreta.';

const FEEDBACK_PADRAO =
  'mailto:contato@fiscalizaai.app?subject=Feedback%20do%20piloto%20Fiscaliza%20A%C3%AD!';

export type ResultadoExportacoes =
  { tipo: 'OK'; itens: Exportacao[] } | { tipo: 'ERRO'; mensagem: string };

export type ResultadoExportacao =
  { tipo: 'OK'; exportacao: Exportacao } | { tipo: 'ERRO'; mensagem: string };

export type ResultadoSolicitacao =
  { tipo: 'OK'; id: string; status: StatusExportacao } | { tipo: 'ERRO'; mensagem: string };

export type ResultadoExclusao =
  | { tipo: 'EXCLUIDA' }
  | { tipo: 'SENHA_INCORRETA'; mensagem: string }
  | { tipo: 'ERRO'; mensagem: string };

/** As exportações da pessoa, da mais recente para a mais antiga. */
export async function listarExportacoes(api: Api): Promise<ResultadoExportacoes> {
  try {
    const { data, error } = await api.GET('/api/v1/me/exportacoes');
    if (!data)
      return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_LISTAR) };
    return { tipo: 'OK', itens: data };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

/** Pede uma exportação; com uma em andamento ou ainda válida, a API devolve a mesma. */
export async function solicitarExportacao(api: Api): Promise<ResultadoSolicitacao> {
  try {
    const { data, error } = await api.POST('/api/v1/me/exportacoes');
    if (!data)
      return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_SOLICITAR) };
    return { tipo: 'OK', id: data.id, status: data.status };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

export async function consultarExportacao(api: Api, id: string): Promise<ResultadoExportacao> {
  try {
    const { data, error } = await api.GET('/api/v1/me/exportacoes/{id}', {
      params: { path: { id } },
    });
    if (!data)
      return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_CONSULTAR) };
    return { tipo: 'OK', exportacao: data };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

/**
 * Exclui a conta depois de conferir a senha. A API anonimiza os dados, encerra as sessões e
 * apaga o cookie de renovação; as ocorrências continuam públicas, sem o autor.
 */
export async function excluirConta(api: Api, senha: string): Promise<ResultadoExclusao> {
  try {
    const { response, error } = await api.DELETE('/api/v1/me', { body: { senha } });
    if (response.ok) return { tipo: 'EXCLUIDA' };
    const erro = lerErroApi(error);
    if (response.status === 401 && (erro === null || erro.codigo === 'SENHA_INCORRETA')) {
      return { tipo: 'SENHA_INCORRETA', mensagem: MENSAGEM_SENHA_INCORRETA };
    }
    if (response.status === 422) {
      const campo = errosDosCampos(erro)['senha'];
      return {
        tipo: 'SENHA_INCORRETA',
        mensagem: campo ?? mensagemDoErro(erro, 'Informe a senha.'),
      };
    }
    return { tipo: 'ERRO', mensagem: mensagemDoErro(erro, MENSAGEM_EXCLUIR) };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

/**
 * Cancela a inscrição de push deste navegador sem avisar a API: depois da exclusão da conta, a
 * API já apagou as inscrições e o token não vale mais. Qualquer falha é ignorada.
 */
export async function cancelarPushNoNavegador(
  ambiente: AmbientePush = ambienteDoNavegador(),
): Promise<void> {
  try {
    const registro = await ambiente.serviceWorker?.getRegistration();
    const inscricao = await registro?.pushManager.getSubscription();
    await inscricao?.unsubscribe();
  } catch {
    // A inscrição órfã fica no navegador; o servidor não manda mais nada para ela.
  }
}

export function rotuloStatusExportacao(status: StatusExportacao): string {
  switch (status) {
    case 'PROCESSANDO':
      return 'Processando';
    case 'PRONTA':
      return 'Pronta para download';
    case 'EXPIRADA':
      return 'Expirada';
    case 'FALHOU':
      return 'Não foi possível gerar';
  }
}

/** O formulário de feedback do piloto; sem um configurado no build, um e-mail para a equipe. */
export function urlFeedbackPiloto(
  envUrl: string | undefined = import.meta.env.FEEDBACK_URL,
): string {
  const url = envUrl?.trim();
  return url ? url : FEEDBACK_PADRAO;
}

/** Links http(s) abrem em outra aba; o mailto fica com o app de e-mail. */
export function ehLinkExterno(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
