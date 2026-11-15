import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { abrirPendentes, type Pendente } from './pendentes';

function pendente(chave: string, usuarioId: string, criadaEm: string): Pendente {
  return {
    chave,
    usuarioId,
    criadaEm,
    categoriaNome: 'Iluminação',
    endereco: null,
    dados: {
      id: `id-${chave}`,
      categoriaId: 2,
      descricao: 'Poste apagado na esquina',
      atributos: { numero_poste: 'P-12' },
      ponto: { lat: -23.5015, lng: -47.4526 },
      precisaoM: 8,
      publicarAutor: false,
    },
    fotos: [{ arquivo: new Blob([new Uint8Array(1234)], { type: 'image/jpeg' }), ordem: 1 }],
    estado: 'AGUARDANDO',
    erro: null,
  };
}

describe('pendentes no IndexedDB', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('fechar e reabrir o app mantém a pendente, com a foto', async () => {
    const antes = abrirPendentes();
    await antes.salvar(pendente('a', 'u1', '2026-11-14T10:00:00.000Z'));
    antes.fechar();

    const depois = abrirPendentes();
    const [guardada] = await depois.listar('u1');

    expect(guardada).toMatchObject({ chave: 'a', estado: 'AGUARDANDO', dados: { id: 'id-a' } });
    expect(guardada!.fotos[0]!.arquivo.size).toBe(1234);
  });

  it('separa por usuário, da mais antiga para a mais nova', async () => {
    const repositorio = abrirPendentes();
    await repositorio.salvar(pendente('b', 'u1', '2026-11-14T11:00:00.000Z'));
    await repositorio.salvar(pendente('a', 'u1', '2026-11-14T10:00:00.000Z'));
    await repositorio.salvar(pendente('c', 'u2', '2026-11-14T09:00:00.000Z'));

    expect((await repositorio.listar('u1')).map((p) => p.chave)).toEqual(['a', 'b']);
    expect((await repositorio.listar('u2')).map((p) => p.chave)).toEqual(['c']);
    expect(await repositorio.listar()).toHaveLength(3);
  });

  it('remove uma, ou todas as de um usuário', async () => {
    const repositorio = abrirPendentes();
    await repositorio.salvar(pendente('a', 'u1', '2026-11-14T10:00:00.000Z'));
    await repositorio.salvar(pendente('b', 'u1', '2026-11-14T11:00:00.000Z'));
    await repositorio.salvar(pendente('c', 'u2', '2026-11-14T09:00:00.000Z'));

    await repositorio.remover('a');
    expect((await repositorio.listar('u1')).map((p) => p.chave)).toEqual(['b']);

    await repositorio.removerDoUsuario('u1');
    expect((await repositorio.listar()).map((p) => p.chave)).toEqual(['c']);
  });
});
