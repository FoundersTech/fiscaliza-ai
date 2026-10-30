import { Inject, Injectable } from '@nestjs/common';

import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { Ocorrencia } from '../domain/ocorrencia.js';
import { REPOSITORIO_OCORRENCIAS, type RepositorioOcorrencias } from './portas.js';

const STATUS_POR_CODIGO: Readonly<Record<string, number>> = {
  AUTOR_NAO_CONFIRMA: 403,
  OCORRENCIA_FECHADA: 422,
};

export function ocorrenciaNaoEncontrada(): ErroAplicacao {
  return new ErroAplicacao('NAO_ENCONTRADA', 'Ocorrência não encontrada.', 404);
}

@Injectable()
export class ConfirmarOcorrencia {
  constructor(
    @Inject(REPOSITORIO_OCORRENCIAS) private readonly ocorrencias: RepositorioOcorrencias,
  ) {}

  /** Devolve o total de confirmações da ocorrência, já com esta. */
  async executar(ocorrenciaId: string, usuarioId: string, agora = new Date()): Promise<number> {
    const dados = await this.ocorrencias.carregar(ocorrenciaId);
    const ocorrencia = dados && Ocorrencia.reconstituir(dados);
    // Recusada e duplicada só existem para o autor.
    if (!ocorrencia?.visivelPara(usuarioId)) throw ocorrenciaNaoEncontrada();

    try {
      ocorrencia.validarConfirmacao(usuarioId);
    } catch (erro) {
      const status = erro instanceof ErroDominio ? STATUS_POR_CODIGO[erro.codigo] : undefined;
      if (erro instanceof ErroDominio && status) {
        throw new ErroAplicacao(erro.codigo, erro.message, status, erro.detalhes);
      }
      throw erro;
    }

    const confirmacoes = await this.ocorrencias.confirmar(ocorrenciaId, usuarioId, agora);
    if (confirmacoes === null) {
      throw new ErroAplicacao('JA_CONFIRMADA', 'Você já confirmou esta ocorrência.', 409);
    }
    return confirmacoes;
  }
}
