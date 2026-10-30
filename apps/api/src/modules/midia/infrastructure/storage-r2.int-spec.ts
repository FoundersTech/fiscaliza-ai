import { randomUUID } from 'node:crypto';

import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, describe, expect, it } from 'vitest';

import { validarAmbiente } from '../../../shared/config/ambiente.js';
import { TAMANHO_MAXIMO_FOTO } from '../domain/foto.js';
import { configStorage, criarClienteS3, StorageR2Adapter } from './storage-r2.adapter.js';

const config = configStorage(validarAmbiente(process.env));
const storage = new StorageR2Adapter(config);
const s3 = criarClienteS3(config);

afterAll(() => {
  storage.onModuleDestroy();
  s3.destroy();
});

function chave(): string {
  return `ocorrencias/${randomUUID()}/1-${randomUUID()}.jpg`;
}

function urlPara(chaveFoto: string, bytes: number, emitidaEm = new Date()): Promise<string> {
  return storage.urlDeEnvio({
    chave: chaveFoto,
    contentType: 'image/jpeg',
    bytes,
    emitidaEm,
    validadeSegundos: 300,
  });
}

function enviar(url: string, bytes: number, contentType = 'image/jpeg') {
  return fetch(url, {
    method: 'PUT',
    body: new Uint8Array(bytes).fill(7),
    headers: { 'Content-Type': contentType },
  });
}

async function existe(chaveFoto: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.bucketUploads, Key: chaveFoto }));
    return true;
  } catch {
    return false;
  }
}

describe('StorageR2Adapter: URL de envio', () => {
  it('um PUT de 300 KB na URL funciona e grava o arquivo com o tipo assinado', async () => {
    const chaveFoto = chave();
    const url = await urlPara(chaveFoto, TAMANHO_MAXIMO_FOTO);

    const resposta = await enviar(url, TAMANHO_MAXIMO_FOTO);

    expect(resposta.status).toBe(200);
    const objeto = await s3.send(
      new GetObjectCommand({ Bucket: config.bucketUploads, Key: chaveFoto }),
    );
    expect(objeto.ContentType).toBe('image/jpeg');
    expect(objeto.ContentLength).toBe(TAMANHO_MAXIMO_FOTO);
  });

  it('assina tipo, tamanho e host, e vale por 300 s', async () => {
    const url = new URL(await urlPara(chave(), 1000));

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect([...url.searchParams.keys()].some((nome) => /checksum/i.test(nome))).toBe(false);
  });

  it('um PUT de 301 KB, ou menor que o assinado, é recusado', async () => {
    const maior = chave();
    const menor = chave();

    const respostaMaior = await enviar(
      await urlPara(maior, TAMANHO_MAXIMO_FOTO),
      TAMANHO_MAXIMO_FOTO + 1024,
    );
    const respostaMenor = await enviar(await urlPara(menor, TAMANHO_MAXIMO_FOTO), 1000);

    expect(respostaMaior.status).toBe(403);
    expect(respostaMenor.status).toBe(403);
    expect(await existe(maior)).toBe(false);
    expect(await existe(menor)).toBe(false);
  });

  it('um PUT com outro Content-Type é recusado', async () => {
    const chaveFoto = chave();

    const resposta = await enviar(await urlPara(chaveFoto, 1000), 1000, 'image/png');

    expect(resposta.status).toBe(403);
    expect(await existe(chaveFoto)).toBe(false);
  });

  it('a URL usada depois de 5 min é recusada; pouco antes, ainda vale', async () => {
    const vencida = chave();
    const noLimite = chave();
    const agora = Date.now();

    const respostaVencida = await enviar(
      await urlPara(vencida, 1000, new Date(agora - 301_000)),
      1000,
    );
    const respostaNoLimite = await enviar(
      await urlPara(noLimite, 1000, new Date(agora - 290_000)),
      1000,
    );

    expect(respostaVencida.status).toBe(403);
    expect(await respostaVencida.text()).toMatch(/expired/i);
    expect(respostaNoLimite.status).toBe(200);
  });
});
