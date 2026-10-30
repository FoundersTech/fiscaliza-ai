import { describe, expect, it, vi } from 'vitest';

import { TAMANHO_MAXIMO_FOTO } from '../domain/foto.js';
import { CriarIntencaoUpload, type PedidoIntencao } from './intencao-upload.js';
import type { StoragePort } from './portas.js';

const AGORA = new Date('2026-11-03T12:00:00.000Z');
const OCORRENCIA = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';

function montar() {
  const storage = {
    urlDeEnvio: vi.fn<StoragePort['urlDeEnvio']>().mockResolvedValue('https://s3.exemplo.test/u'),
  };
  return { criar: new CriarIntencaoUpload(storage), storage };
}

function pedido(mudancas: Partial<PedidoIntencao> = {}): PedidoIntencao {
  return {
    ocorrenciaId: OCORRENCIA,
    ordem: 1,
    contentType: 'image/jpeg',
    bytes: 250_000,
    ...mudancas,
  };
}

describe('CriarIntencaoUpload', () => {
  it('assina o PUT com o tipo e o tamanho pedidos, por 5 minutos', async () => {
    const { criar, storage } = montar();

    const intencao = await criar.executar(pedido(), AGORA);

    expect(intencao.uploadUrl).toBe('https://s3.exemplo.test/u');
    expect(intencao.uploadKey).toMatch(
      new RegExp(`^ocorrencias/${OCORRENCIA}/1-[0-9a-f-]{36}\\.jpg$`),
    );
    expect(intencao.expiraEm.toISOString()).toBe('2026-11-03T12:05:00.000Z');
    expect(storage.urlDeEnvio).toHaveBeenCalledWith({
      chave: intencao.uploadKey,
      contentType: 'image/jpeg',
      bytes: 250_000,
      emitidaEm: AGORA,
      validadeSegundos: 300,
    });
  });

  it('cada pedido gera uma chave nova, mesmo para a mesma foto', async () => {
    const { criar } = montar();

    const [primeira, segunda] = await Promise.all([
      criar.executar(pedido({ ordem: 2 }), AGORA),
      criar.executar(pedido({ ordem: 2 }), AGORA),
    ]);

    expect(primeira.uploadKey).not.toBe(segunda.uploadKey);
  });

  it.each([
    ['maior que 300 KB', { bytes: TAMANHO_MAXIMO_FOTO + 1 }],
    ['vazia', { bytes: 0 }],
    ['que não é JPEG', { contentType: 'image/png' }],
  ])('recusa foto %s com 422 FOTO_INVALIDA', async (_caso, mudancas) => {
    const { criar, storage } = montar();

    await expect(criar.executar(pedido(mudancas), AGORA)).rejects.toMatchObject({
      codigo: 'FOTO_INVALIDA',
      status: 422,
      detalhes: { tipos: ['image/jpeg'], bytes_maximo: TAMANHO_MAXIMO_FOTO },
    });
    expect(storage.urlDeEnvio).not.toHaveBeenCalled();
  });
});
