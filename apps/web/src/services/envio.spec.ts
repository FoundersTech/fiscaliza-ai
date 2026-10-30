import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { confirmarOcorrencia, type DadosEnvio, enviarOcorrencia } from './envio';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
const foto = (bytes: number) => new File([new Uint8Array(bytes)], 'f.jpg', { type: 'image/jpeg' });

function dados(mudancas: Partial<DadosEnvio> = {}): DadosEnvio {
  return {
    id: ID,
    categoriaId: 2,
    descricao: '  Poste apagado na esquina  ',
    atributos: {},
    ponto: { lat: -23.5015, lng: -47.4526 },
    precisaoM: 8,
    publicarAutor: true,
    fotos: [
      { arquivo: foto(1000), ordem: 1 },
      { arquivo: foto(2000), ordem: 2 },
    ],
    ...mudancas,
  };
}

type Resposta = { data?: unknown; error?: unknown };

/** API falsa: a intenção devolve um link por foto, e o registro responde `registro`. */
function montar(registro: Resposta = { data: { protocolo: 'FA-2026-SOR-000007' } }) {
  let links = 0;
  const POST = vi.fn<(caminho: string, opcoes: unknown) => Promise<Resposta>>((caminho) => {
    if (caminho === '/api/v1/uploads/intencao') {
      links += 1;
      return Promise.resolve({
        data: { upload_url: `https://r2.test/link-${links}`, upload_key: `chave-${links}` },
      });
    }
    return Promise.resolve(registro);
  });
  const enviarArquivo = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
  return {
    api: { POST } as unknown as Api,
    POST,
    enviarArquivo: enviarArquivo as unknown as typeof fetch & typeof enviarArquivo,
  };
}

/** O corpo do último POST /ocorrencias. */
function corpoDoRegistro(POST: ReturnType<typeof montar>['POST']) {
  const chamada = POST.mock.calls.findLast(([caminho]) => caminho === '/api/v1/ocorrencias');
  return (chamada![1] as { body: Record<string, unknown> }).body;
}

describe('enviarOcorrencia', () => {
  it('sobe cada foto pelo link e registra com as chaves, o ponto e a precisão', async () => {
    const { api, POST, enviarArquivo } = montar();
    const aoEnviarFoto = vi.fn();

    const resultado = await enviarOcorrencia(api, dados(), { enviarArquivo, aoEnviarFoto });

    expect(resultado).toEqual({ tipo: 'CRIADA', protocolo: 'FA-2026-SOR-000007' });
    expect(enviarArquivo).toHaveBeenCalledWith('https://r2.test/link-1', {
      method: 'PUT',
      body: expect.any(File) as File,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(aoEnviarFoto.mock.calls).toEqual([
      [1, 'chave-1'],
      [2, 'chave-2'],
    ]);
    expect(corpoDoRegistro(POST)).toEqual({
      id: ID,
      categoria_id: 2,
      descricao: 'Poste apagado na esquina',
      atributos: {},
      local: { lat: -23.5015, lng: -47.4526 },
      precisao_m: 8,
      publicar_autor: true,
      fotos: [
        { upload_key: 'chave-1', ordem: 1 },
        { upload_key: 'chave-2', ordem: 2 },
      ],
      origem: 'ONLINE',
      forcar_criacao: false,
    });
  });

  it('a intenção leva o tamanho exato da foto comprimida', async () => {
    const { api, POST, enviarArquivo } = montar();

    await enviarOcorrencia(api, dados(), { enviarArquivo });

    expect(POST.mock.calls[0]![1]).toEqual({
      body: { ocorrencia_id: ID, ordem: 1, content_type: 'image/jpeg', bytes: 1000 },
    });
  });

  it('numa repetição, não sobe de novo a foto que já chegou', async () => {
    const { api, enviarArquivo } = montar();

    await enviarOcorrencia(
      api,
      dados({ fotos: [{ arquivo: foto(1000), ordem: 1, uploadKey: 'ja-enviada' }] }),
      { enviarArquivo },
    );

    expect(enviarArquivo).not.toHaveBeenCalled();
  });

  it('link vencido (403) é pedido de novo, até 3 vezes', async () => {
    const { api, POST, enviarArquivo } = montar();
    enviarArquivo
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    const resultado = await enviarOcorrencia(api, dados({ fotos: [dados().fotos[0]!] }), {
      enviarArquivo,
    });

    expect(resultado.tipo).toBe('CRIADA');
    expect(
      POST.mock.calls.filter(([caminho]) => caminho === '/api/v1/uploads/intencao'),
    ).toHaveLength(3);
    expect(corpoDoRegistro(POST)['fotos']).toEqual([{ upload_key: 'chave-3', ordem: 1 }]);
  });

  it('depois de 3 links recusados, desiste sem registrar', async () => {
    const { api, POST, enviarArquivo } = montar();
    enviarArquivo.mockResolvedValue(new Response(null, { status: 403 }));

    const resultado = await enviarOcorrencia(api, dados(), { enviarArquivo });

    expect(resultado).toMatchObject({ tipo: 'ERRO', codigo: 'FOTO_NAO_ENVIADA' });
    expect(POST.mock.calls.some(([caminho]) => caminho === '/api/v1/ocorrencias')).toBe(false);
  });

  it('409 DUPLICATA_POSSIVEL devolve as candidatas; "é outro problema" força a criação', async () => {
    const candidatas = [
      {
        id: 'c1',
        protocolo: 'FA-2026-SOR-000003',
        resumo: 'Poste',
        distancia_m: 42,
        confirmacoes: 2,
      },
    ];
    const { api, POST, enviarArquivo } = montar({
      error: { codigo: 'DUPLICATA_POSSIVEL', mensagem: '…', detalhes: { candidatas } },
    });

    await expect(enviarOcorrencia(api, dados(), { enviarArquivo })).resolves.toEqual({
      tipo: 'DUPLICATA',
      candidatas,
    });

    await enviarOcorrencia(api, dados(), { enviarArquivo, forcarCriacao: true });
    expect(corpoDoRegistro(POST)['forcar_criacao']).toBe(true);
  });

  it('409 ID_EM_USO é devolvido para a store trocar o id', async () => {
    const { api, enviarArquivo } = montar({
      error: { codigo: 'ID_EM_USO', mensagem: '…', detalhes: {} },
    });

    await expect(enviarOcorrencia(api, dados(), { enviarArquivo })).resolves.toEqual({
      tipo: 'ID_EM_USO',
    });
  });

  it('422 traz a mensagem da API, e a falta de conexão, a mensagem de rede', async () => {
    const { api, enviarArquivo } = montar({
      error: {
        codigo: 'FORA_DA_AREA',
        mensagem: 'O Fiscaliza Aí! ainda não atende esta região.',
        detalhes: {},
      },
    });
    await expect(enviarOcorrencia(api, dados(), { enviarArquivo })).resolves.toEqual({
      tipo: 'ERRO',
      codigo: 'FORA_DA_AREA',
      mensagem: 'O Fiscaliza Aí! ainda não atende esta região.',
    });

    enviarArquivo.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(enviarOcorrencia(api, dados(), { enviarArquivo })).resolves.toMatchObject({
      tipo: 'ERRO',
      codigo: null,
    });
  });
});

describe('confirmarOcorrencia', () => {
  function api(resposta: Resposta) {
    const POST = vi.fn(() => Promise.resolve(resposta));
    return { api: { POST } as unknown as Api, POST };
  }

  it('devolve o total de confirmações', async () => {
    const { api: cliente, POST } = api({ data: { confirmacoes: 3 } });

    await expect(confirmarOcorrencia(cliente, 'c1')).resolves.toEqual({
      tipo: 'CONFIRMADA',
      confirmacoes: 3,
    });
    expect(POST).toHaveBeenCalledWith('/api/v1/ocorrencias/{id}/confirmacoes', {
      params: { path: { id: 'c1' } },
    });
  });

  it('quem já tinha confirmado não vê erro', async () => {
    const { api: cliente } = api({
      error: { codigo: 'JA_CONFIRMADA', mensagem: '…', detalhes: {} },
    });

    await expect(confirmarOcorrencia(cliente, 'c1')).resolves.toEqual({ tipo: 'JA_CONFIRMADA' });
  });

  it('o autor recebe a mensagem da API', async () => {
    const { api: cliente } = api({
      error: {
        codigo: 'AUTOR_NAO_CONFIRMA',
        mensagem: 'Você registrou esta ocorrência e não pode confirmá-la.',
        detalhes: {},
      },
    });

    await expect(confirmarOcorrencia(cliente, 'c1')).resolves.toEqual({
      tipo: 'ERRO',
      mensagem: 'Você registrou esta ocorrência e não pode confirmá-la.',
    });
  });
});
