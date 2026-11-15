import { describe, expect, it, vi } from 'vitest';

import type { Ambiente } from '../../../shared/config/ambiente.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { ModeracaoFoto } from '../domain/foto.js';
import type { FotoEmRevisao, RepositorioFotos, StoragePort } from './portas.js';
import { ListarFotosParaRevisao, RejeitarFoto } from './revisao-fotos.js';
import { UrlFotos } from './url-fotos.js';

const OCORRENCIA = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
const FOTO = '5c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const BASE = 'https://fotos.exemplo.test';

function foto(mudancas: Partial<FotoEmRevisao> = {}): FotoEmRevisao {
  return {
    id: FOTO,
    ocorrenciaId: OCORRENCIA,
    protocolo: 'FA-2026-SOR-000001',
    ordem: 1,
    moderacao: ModeracaoFoto.APROVADA,
    storageKey: `ocorrencias/${OCORRENCIA}/${FOTO}.jpg`,
    miniaturaKey: `ocorrencias/${OCORRENCIA}/${FOTO}-400.jpg`,
    motivoRejeicao: null,
    criadaEm: new Date('2026-11-10T12:00:00.000Z'),
    ...mudancas,
  };
}

function montar(gravada: FotoEmRevisao | null = foto()) {
  const ordem: string[] = [];
  const fotos = {
    buscarParaRevisao: vi.fn<RepositorioFotos['buscarParaRevisao']>().mockResolvedValue(gravada),
    listarParaRevisao: vi.fn<RepositorioFotos['listarParaRevisao']>(),
    rejeitarAprovada: vi
      .fn<RepositorioFotos['rejeitarAprovada']>()
      .mockImplementation(() => Promise.resolve(void ordem.push('banco'))),
  };
  const storage = {
    despublicar: vi
      .fn<StoragePort['despublicar']>()
      .mockImplementation((chave) => Promise.resolve(void ordem.push(chave))),
  };
  // Os casos de uso da revisão só usam estes métodos das portas.
  const repositorio = fotos as unknown as RepositorioFotos;
  const urlFotos = new UrlFotos({ R2_URL_PUBLICA: BASE } as Ambiente);
  return {
    rejeitar: new RejeitarFoto(repositorio, storage as unknown as StoragePort),
    listar: new ListarFotosParaRevisao(repositorio, urlFotos),
    fotos,
    storage,
    ordem,
  };
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroAplicacao> {
  const erro = await promessa.then(
    () => null,
    (falha: unknown) => falha,
  );
  expect(erro).toBeInstanceOf(ErroAplicacao);
  return erro as ErroAplicacao;
}

describe('RejeitarFoto', () => {
  it('aprovada: grava a rejeição antes de apagar a miniatura e a foto do bucket público', async () => {
    const { rejeitar, fotos, ordem } = montar();

    await rejeitar.executar(FOTO, 'Mostra o rosto de uma pessoa');

    expect(fotos.rejeitarAprovada).toHaveBeenCalledWith(FOTO, 'Mostra o rosto de uma pessoa');
    expect(ordem).toEqual([
      'banco',
      `ocorrencias/${OCORRENCIA}/${FOTO}-400.jpg`,
      `ocorrencias/${OCORRENCIA}/${FOTO}.jpg`,
    ]);
  });

  it('se o storage falhar, a foto já saiu das telas', async () => {
    const { rejeitar, fotos, storage } = montar();
    storage.despublicar.mockRejectedValue(new Error('R2 fora do ar'));

    await expect(rejeitar.executar(FOTO, 'Imprópria')).rejects.toThrow('R2 fora do ar');
    expect(fotos.rejeitarAprovada).toHaveBeenCalled();
  });

  it('já rejeitada: mantém o primeiro motivo e apaga os objetos de novo', async () => {
    const { rejeitar, fotos, storage } = montar(
      foto({ moderacao: ModeracaoFoto.REJEITADA, motivoRejeicao: 'Primeiro motivo' }),
    );

    await rejeitar.executar(FOTO, 'Outro motivo');

    expect(fotos.rejeitarAprovada).not.toHaveBeenCalled();
    expect(storage.despublicar).toHaveBeenCalledTimes(2);
  });

  it('rejeitada no processamento, sem nada publicado: nada a apagar', async () => {
    const { rejeitar, storage } = montar(
      foto({ moderacao: ModeracaoFoto.REJEITADA, storageKey: null, miniaturaKey: null }),
    );

    await rejeitar.executar(FOTO, 'Imprópria');

    expect(storage.despublicar).not.toHaveBeenCalled();
  });

  it('ainda pendente: 409 FOTO_EM_ANALISE, sem mexer em nada', async () => {
    const { rejeitar, fotos, storage } = montar(
      foto({ moderacao: ModeracaoFoto.PENDENTE, storageKey: null, miniaturaKey: null }),
    );

    const erro = await erroDe(rejeitar.executar(FOTO, 'Imprópria'));

    expect(erro).toMatchObject({ codigo: 'FOTO_EM_ANALISE', status: 409 });
    expect(fotos.rejeitarAprovada).not.toHaveBeenCalled();
    expect(storage.despublicar).not.toHaveBeenCalled();
  });

  it('inexistente: 404', async () => {
    const { rejeitar } = montar(null);

    const erro = await erroDe(rejeitar.executar(FOTO, 'Imprópria'));

    expect(erro).toMatchObject({ codigo: 'NAO_ENCONTRADA', status: 404 });
  });
});

describe('ListarFotosParaRevisao', () => {
  it('pede uma a mais para saber se há próxima página; o cursor é o id da última', async () => {
    const { listar, fotos } = montar();
    const tres = ['a', 'b', 'c'].map((letra) => foto({ id: `${letra}${FOTO.slice(1)}` }));
    fotos.listarParaRevisao.mockResolvedValue(tres);

    const pagina = await listar.executar({
      moderacao: ModeracaoFoto.APROVADA,
      cursor: null,
      limite: 2,
    });

    expect(fotos.listarParaRevisao).toHaveBeenCalledWith({
      moderacao: ModeracaoFoto.APROVADA,
      depoisDe: null,
      limite: 3,
    });
    expect(pagina.itens.map((item) => item.id)).toEqual([tres[0]!.id, tres[1]!.id]);
    expect(pagina.proximoCursor).toBe(tres[1]!.id);
  });

  it('só a foto aprovada tem endereço público', async () => {
    const { listar, fotos } = montar();
    fotos.listarParaRevisao.mockResolvedValue([
      foto(),
      foto({ moderacao: ModeracaoFoto.REJEITADA, motivoRejeicao: 'Imprópria' }),
    ]);

    const { itens, proximoCursor } = await listar.executar({
      moderacao: ModeracaoFoto.APROVADA,
      cursor: null,
      limite: 10,
    });

    expect(itens[0]).toMatchObject({
      url: `${BASE}/ocorrencias/${OCORRENCIA}/${FOTO}.jpg`,
      miniaturaUrl: `${BASE}/ocorrencias/${OCORRENCIA}/${FOTO}-400.jpg`,
    });
    expect(itens[1]).toMatchObject({ url: null, miniaturaUrl: null, motivoRejeicao: 'Imprópria' });
    expect(proximoCursor).toBeNull();
  });
});
