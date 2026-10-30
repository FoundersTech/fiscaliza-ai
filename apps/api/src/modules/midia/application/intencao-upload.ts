import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import {
  chaveDoUpload,
  fotoAceita,
  type OrdemFoto,
  TAMANHO_MAXIMO_FOTO,
  TIPO_FOTO,
} from '../domain/foto.js';
import { STORAGE_PORT, type StoragePort } from './portas.js';

export const VALIDADE_UPLOAD_SEGUNDOS = 5 * 60;

export interface PedidoIntencao {
  ocorrenciaId: string;
  ordem: OrdemFoto;
  contentType: string;
  bytes: number;
}

export interface IntencaoUpload {
  uploadUrl: string;
  uploadKey: string;
  expiraEm: Date;
}

/** Link para o PWA enviar uma foto direto ao storage, sem passar pela API. */
@Injectable()
export class CriarIntencaoUpload {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  async executar(pedido: PedidoIntencao, agora = new Date()): Promise<IntencaoUpload> {
    if (!fotoAceita(pedido.contentType, pedido.bytes)) {
      throw new ErroAplicacao(
        'FOTO_INVALIDA',
        `A foto precisa ser JPEG de até ${TAMANHO_MAXIMO_FOTO / 1024} KB.`,
        422,
        { tipos: [TIPO_FOTO], bytes_maximo: TAMANHO_MAXIMO_FOTO },
      );
    }

    const uploadKey = chaveDoUpload(pedido.ocorrenciaId, pedido.ordem, randomUUID());
    const uploadUrl = await this.storage.urlDeEnvio({
      chave: uploadKey,
      contentType: pedido.contentType,
      bytes: pedido.bytes,
      emitidaEm: agora,
      validadeSegundos: VALIDADE_UPLOAD_SEGUNDOS,
    });
    return {
      uploadUrl,
      uploadKey,
      expiraEm: new Date(agora.getTime() + VALIDADE_UPLOAD_SEGUNDOS * 1000),
    };
  }
}
