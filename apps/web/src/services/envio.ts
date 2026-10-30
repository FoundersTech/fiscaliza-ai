import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { type ErroApi, lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';
import type { Ponto } from './localizacao';

export type Candidata = components['schemas']['CandidataDuplicidadeResposta'];

export interface FotoParaEnvio {
  arquivo: File;
  ordem: 1 | 2;
  /** Já está no storage: um novo envio só repete o registro. */
  uploadKey?: string | undefined;
}

export interface DadosEnvio {
  id: string;
  categoriaId: number;
  descricao: string;
  atributos: Record<string, string | number>;
  ponto: Ponto;
  precisaoM: number | null;
  publicarAutor: boolean;
  fotos: FotoParaEnvio[];
}

export type ResultadoEnvio =
  | { tipo: 'CRIADA'; protocolo: string }
  | { tipo: 'DUPLICATA'; candidatas: Candidata[] }
  | { tipo: 'ID_EM_USO' }
  | { tipo: 'ERRO'; codigo: string | null; mensagem: string };

export interface OpcoesEnvio {
  forcarCriacao?: boolean;
  /** Avisa quando uma foto chega ao storage, para não enviá-la de novo numa repetição. */
  aoEnviarFoto?: (ordem: 1 | 2, uploadKey: string) => void;
  enviarArquivo?: typeof fetch;
}

/** Um link de envio que venceu no meio do caminho (403) é pedido de novo, até 3 vezes. */
const TENTATIVAS_FOTO = 3;
const MENSAGEM_FOTOS = 'Não foi possível enviar as fotos. Tente de novo.';

function erro(erroApi: ErroApi | null, padrao: string): ResultadoEnvio {
  return {
    tipo: 'ERRO',
    codigo: erroApi?.codigo ?? null,
    mensagem: mensagemDoErro(erroApi, padrao),
  };
}

/** As fotos vão direto ao storage pelo link de envio; depois, o registro com as chaves. */
export async function enviarOcorrencia(
  api: Api,
  dados: DadosEnvio,
  { forcarCriacao = false, aoEnviarFoto, enviarArquivo = fetch }: OpcoesEnvio = {},
): Promise<ResultadoEnvio> {
  try {
    const fotos: { upload_key: string; ordem: 1 | 2 }[] = [];
    for (const foto of dados.fotos) {
      const chave = foto.uploadKey ?? (await enviarFoto(api, dados.id, foto, enviarArquivo));
      if (typeof chave !== 'string') return chave;
      aoEnviarFoto?.(foto.ordem, chave);
      fotos.push({ upload_key: chave, ordem: foto.ordem });
    }

    const { data, error } = await api.POST('/api/v1/ocorrencias', {
      body: {
        id: dados.id,
        categoria_id: dados.categoriaId,
        descricao: dados.descricao.trim(),
        atributos: dados.atributos,
        local: dados.ponto,
        precisao_m: dados.precisaoM,
        publicar_autor: dados.publicarAutor,
        fotos,
        origem: 'ONLINE',
        forcar_criacao: forcarCriacao,
      },
    });
    if (data) return { tipo: 'CRIADA', protocolo: data.protocolo };

    const erroApi = lerErroApi(error);
    if (erroApi?.codigo === 'DUPLICATA_POSSIVEL') {
      return { tipo: 'DUPLICATA', candidatas: erroApi.detalhes['candidatas'] as Candidata[] };
    }
    if (erroApi?.codigo === 'ID_EM_USO') return { tipo: 'ID_EM_USO' };
    return erro(erroApi, 'Não foi possível enviar a notificação. Tente de novo.');
  } catch {
    return { tipo: 'ERRO', codigo: null, mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

async function enviarFoto(
  api: Api,
  ocorrenciaId: string,
  foto: FotoParaEnvio,
  enviarArquivo: typeof fetch,
): Promise<string | ResultadoEnvio> {
  for (let tentativa = 1; tentativa <= TENTATIVAS_FOTO; tentativa += 1) {
    const { data, error } = await api.POST('/api/v1/uploads/intencao', {
      body: {
        ocorrencia_id: ocorrenciaId,
        ordem: foto.ordem,
        content_type: 'image/jpeg',
        bytes: foto.arquivo.size,
      },
    });
    if (!data) return erro(lerErroApi(error), MENSAGEM_FOTOS);

    const resposta = await enviarArquivo(data.upload_url, {
      method: 'PUT',
      body: foto.arquivo,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    if (resposta.ok) return data.upload_key;
    if (resposta.status !== 403) break;
  }
  return { tipo: 'ERRO', codigo: 'FOTO_NAO_ENVIADA', mensagem: MENSAGEM_FOTOS };
}

export type ResultadoConfirmacao =
  | { tipo: 'CONFIRMADA'; confirmacoes: number }
  | { tipo: 'JA_CONFIRMADA' }
  | { tipo: 'ERRO'; mensagem: string };

/** "Também vi" numa ocorrência que já existe. */
export async function confirmarOcorrencia(api: Api, id: string): Promise<ResultadoConfirmacao> {
  try {
    const { data, error } = await api.POST('/api/v1/ocorrencias/{id}/confirmacoes', {
      params: { path: { id } },
    });
    if (data) return { tipo: 'CONFIRMADA', confirmacoes: data.confirmacoes };
    const erroApi = lerErroApi(error);
    if (erroApi?.codigo === 'JA_CONFIRMADA') return { tipo: 'JA_CONFIRMADA' };
    return {
      tipo: 'ERRO',
      mensagem: mensagemDoErro(erroApi, 'Não foi possível confirmar. Tente de novo.'),
    };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}
