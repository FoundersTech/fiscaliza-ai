import { HttpException } from '@nestjs/common';

import { ErroAplicacao } from './erro-aplicacao.js';

/** Formato de erro de toda a API. */
export interface CorpoErro {
  codigo: string;
  mensagem: string;
  detalhes: Record<string, unknown>;
}

export interface ErroTraduzido {
  status: number;
  corpo: CorpoErro;
}

type Padrao = Omit<CorpoErro, 'detalhes'>;

const PADROES_POR_STATUS: Record<number, Padrao> = {
  400: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Requisição inválida.' },
  401: { codigo: 'NAO_AUTENTICADO', mensagem: 'Autenticação necessária.' },
  403: { codigo: 'ACESSO_NEGADO', mensagem: 'Acesso negado.' },
  404: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.' },
  405: { codigo: 'METODO_NAO_PERMITIDO', mensagem: 'Método não permitido.' },
  409: { codigo: 'CONFLITO', mensagem: 'Conflito com o estado atual do recurso.' },
  413: { codigo: 'CORPO_MUITO_GRANDE', mensagem: 'O corpo da requisição é grande demais.' },
  415: { codigo: 'TIPO_NAO_SUPORTADO', mensagem: 'Tipo de conteúdo não suportado.' },
  422: { codigo: 'VALIDACAO', mensagem: 'Dados inválidos.' },
  429: {
    codigo: 'MUITAS_REQUISICOES',
    mensagem: 'Muitas requisições. Tente de novo em instantes.',
  },
  503: {
    codigo: 'SERVICO_INDISPONIVEL',
    mensagem: 'Serviço indisponível. Tente de novo em instantes.',
  },
};

const ERRO_INTERNO: Padrao = {
  codigo: 'ERRO_INTERNO',
  mensagem: 'Erro interno. Tente de novo mais tarde.',
};

const ERRO_HTTP_GENERICO: Padrao = {
  codigo: 'REQUISICAO_INVALIDA',
  mensagem: 'Não foi possível processar a requisição.',
};

function padraoPara(status: number): CorpoErro {
  const padrao = PADROES_POR_STATUS[status] ?? (status >= 500 ? ERRO_INTERNO : ERRO_HTTP_GENERICO);
  return { ...padrao, detalhes: {} };
}

function ehCorpoErro(valor: unknown): valor is Omit<CorpoErro, 'detalhes'> & {
  detalhes?: Record<string, unknown>;
} {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidato = valor as Record<string, unknown>;
  return typeof candidato.codigo === 'string' && typeof candidato.mensagem === 'string';
}

/** Erros do Fastify (corpo inválido, tipo não suportado...) chegam com `statusCode`. */
function statusDeErroHttp(excecao: unknown): number | undefined {
  if (typeof excecao !== 'object' || excecao === null) return undefined;
  const status = (excecao as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Converte qualquer exceção no formato de erro da API.
 * Mensagens internas (em inglês, ou com detalhes de implementação) nunca vão para o cliente.
 */
export function traduzirErro(excecao: unknown): ErroTraduzido {
  if (excecao instanceof ErroAplicacao) {
    return {
      status: excecao.status,
      corpo: { codigo: excecao.codigo, mensagem: excecao.message, detalhes: excecao.detalhes },
    };
  }

  if (excecao instanceof HttpException) {
    const status = excecao.getStatus();
    const resposta = excecao.getResponse();
    if (ehCorpoErro(resposta)) {
      return {
        status,
        corpo: {
          codigo: resposta.codigo,
          mensagem: resposta.mensagem,
          detalhes: resposta.detalhes ?? {},
        },
      };
    }
    return { status, corpo: padraoPara(status) };
  }

  const status = statusDeErroHttp(excecao);
  if (status !== undefined && status >= 400 && status < 500) {
    return { status, corpo: padraoPara(status) };
  }

  return { status: 500, corpo: padraoPara(500) };
}
