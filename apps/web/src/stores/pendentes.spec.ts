import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type { Categoria } from '@/services/registro';
import { agendarSincronizacao } from '@/services/sincronizacao';
import { type Perfil, useAuthStore } from '@/stores/auth';

import { usePendentesStore } from './pendentes';
import { useRegistroStore } from './registro';

const PAVIMENTACAO: Categoria = {
  id: 1,
  slug: 'pavimentacao',
  nome: 'Pavimentação',
  icone: 'add_road',
  schema_atributos: [],
};

type Corpo = Record<string, unknown>;
type Resposta = { data?: unknown; error?: unknown };

/**
 * Servidor falso, idempotente pelo id como a API: repetir o mesmo id devolve a mesma ocorrência.
 * `semRede` faz a chamada falhar como sem conexão; `cairDepoisDeGravar` grava e perde a resposta.
 */
function servidor() {
  const ocorrencias = new Map<string, { protocolo: string; corpo: Corpo }>();
  const registros: Corpo[] = [];
  const uploads: string[] = [];
  const estado = {
    semRede: false,
    cairDepoisDeGravar: false,
    recusa: null as Resposta | null,
    /** Ids que já são de outra pessoa. */
    idsDeOutros: new Set<string>(),
  };
  let links = 0;

  const POST = vi.fn((caminho: string, opcoes: { body: Corpo }): Promise<Resposta> => {
    if (estado.semRede) return Promise.reject(new TypeError('Failed to fetch'));
    if (caminho === '/api/v1/uploads/intencao') {
      links += 1;
      const chave = `ocorrencias/${String(opcoes.body['ocorrencia_id'])}/${links}.jpg`;
      return Promise.resolve({
        data: { upload_url: `https://r2.test/${links}`, upload_key: chave },
      });
    }
    registros.push(opcoes.body);
    if (estado.recusa) return Promise.resolve(estado.recusa);
    const id = String(opcoes.body['id']);
    if (estado.idsDeOutros.has(id)) {
      return Promise.resolve({ error: { codigo: 'ID_EM_USO', mensagem: '…', detalhes: {} } });
    }
    if (!ocorrencias.has(id)) {
      const protocolo = `FA-2026-SOR-${String(ocorrencias.size + 1).padStart(6, '0')}`;
      ocorrencias.set(id, { protocolo, corpo: opcoes.body });
    }
    if (estado.cairDepoisDeGravar) {
      estado.cairDepoisDeGravar = false;
      return Promise.reject(new TypeError('network error'));
    }
    return Promise.resolve({ data: { id, protocolo: ocorrencias.get(id)!.protocolo } });
  });

  const fetch = vi.fn((url: string) => {
    if (estado.semRede) return Promise.reject(new TypeError('Failed to fetch'));
    uploads.push(url);
    return Promise.resolve(new Response(null, { status: 200 }));
  });

  return { api: { POST } as unknown as Api, POST, fetch, ocorrencias, registros, uploads, estado };
}

function entrar(id = 'u1'): void {
  useAuthStore().iniciarSessao({
    access_token: `token-${id}`,
    usuario: { id, papel: 'CIDADAO' } as Perfil,
  });
}

function registroPronto() {
  const registro = useRegistroStore();
  registro.adicionarFoto(new File([new Uint8Array(500)], 'foto.jpg', { type: 'image/jpeg' }));
  registro.avancar();
  registro.escolherCategoria(PAVIMENTACAO);
  registro.descricao = 'Buraco grande na faixa da direita';
  registro.avancar();
  registro.posicionar({ lat: -23.5015, lng: -47.4526 }, 'GPS', 8);
  return registro;
}

/** Reabrir o app: stores novas, o mesmo IndexedDB. */
function reabrir(usuario = 'u1') {
  setActivePinia(createPinia());
  entrar(usuario);
  return usePendentesStore();
}

describe('envio offline', () => {
  let rede: ReturnType<typeof servidor>;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    rede = servidor();
    vi.stubGlobal('fetch', rede.fetch);
    vi.stubGlobal('navigator', { onLine: true });
    setActivePinia(createPinia());
    entrar();
  });

  afterEach(() => vi.unstubAllGlobals());

  /** "Enviar" em modo avião. */
  async function enviarSemRede() {
    vi.stubGlobal('navigator', { onLine: false });
    rede.estado.semRede = true;
    const registro = registroPronto();
    const resultado = await registro.enviar(rede.api);
    return { registro, resultado };
  }

  function voltarRede(): void {
    vi.stubGlobal('navigator', { onLine: true });
    rede.estado.semRede = false;
  }

  it('em modo avião, "Enviar" guarda a ocorrência como "Aguardando conexão", sem protocolo', async () => {
    const { registro, resultado } = await enviarSemRede();

    expect(resultado).toEqual({ tipo: 'PENDENTE' });
    expect(registro.conclusao).toEqual({ tipo: 'PENDENTE' });
    expect(rede.POST).not.toHaveBeenCalled();
    const [pendente] = usePendentesStore().lista;
    expect(pendente).toMatchObject({
      usuarioId: 'u1',
      categoriaNome: 'Pavimentação',
      estado: 'AGUARDANDO',
      erro: null,
      dados: { id: registro.id, descricao: 'Buraco grande na faixa da direita', precisaoM: 8 },
    });
    expect(pendente!.fotos[0]!.arquivo.size).toBe(500);
  });

  it('com rede mas sem resposta do servidor, também fica guardada no aparelho', async () => {
    rede.estado.semRede = true;
    const registro = registroPronto();

    await expect(registro.enviar(rede.api)).resolves.toEqual({ tipo: 'PENDENTE' });
    expect(usePendentesStore().quantidade).toBe(1);
  });

  it('fechar e reabrir o app mantém a pendente', async () => {
    await enviarSemRede();

    const pendentes = reabrir();
    await pendentes.carregar();

    expect(pendentes.lista).toHaveLength(1);
    expect(pendentes.lista[0]).toMatchObject({ estado: 'AGUARDANDO' });
    expect(pendentes.lista[0]!.fotos[0]!.arquivo.size).toBe(500);
  });

  it('a conexão volta com o app aberto: a pendente recebe protocolo sem nenhum toque', async () => {
    const { registro } = await enviarSemRede();
    const id = registro.id;
    const pendentes = usePendentesStore();
    const janela = new EventTarget();
    const parar = agendarSincronizacao({
      sincronizar: () => pendentes.sincronizar(rede.api),
      janela,
      online: () => navigator.onLine,
    });
    await pendentes.sincronizar(rede.api);
    expect(pendentes.quantidade).toBe(1);

    voltarRede();
    janela.dispatchEvent(new Event('online'));
    await pendentes.sincronizar(rede.api);
    parar();

    expect(pendentes.quantidade).toBe(0);
    expect(pendentes.enviadas).toEqual([
      expect.objectContaining({ protocolo: 'FA-2026-SOR-000001', categoriaNome: 'Pavimentação' }),
    ]);
    expect(rede.registros).toHaveLength(1);
    expect(rede.registros[0]).toMatchObject({ id, origem: 'OFFLINE' });
    expect(
      await reabrir()
        .carregar()
        .then(() => usePendentesStore().quantidade),
    ).toBe(0);
  });

  it('a rede cai no meio do POST: o reenvio usa o mesmo id e vira uma única ocorrência', async () => {
    await enviarSemRede();
    voltarRede();
    rede.estado.cairDepoisDeGravar = true;
    const pendentes = usePendentesStore();

    await pendentes.sincronizar(rede.api);
    expect(pendentes.lista[0]).toMatchObject({ estado: 'AGUARDANDO' });
    expect(pendentes.lista[0]!.fotos[0]!.uploadKey).toBeDefined();

    await pendentes.sincronizar(rede.api);

    expect(rede.registros).toHaveLength(2);
    expect(rede.registros[1]!['id']).toBe(rede.registros[0]!['id']);
    expect(rede.uploads).toHaveLength(1);
    expect(rede.ocorrencias.size).toBe(1);
    expect(pendentes.quantidade).toBe(0);
    expect(pendentes.enviadas.map((e) => e.protocolo)).toEqual(['FA-2026-SOR-000001']);
  });

  it('duas sincronizações ao mesmo tempo não enviam a mesma pendente duas vezes', async () => {
    await enviarSemRede();
    voltarRede();
    const pendentes = usePendentesStore();

    await Promise.all([pendentes.sincronizar(rede.api), pendentes.sincronizar(rede.api)]);

    expect(rede.registros).toHaveLength(1);
  });

  it('fora da área: mostra o motivo, não tenta de novo e pode ser descartada', async () => {
    await enviarSemRede();
    voltarRede();
    rede.estado.recusa = {
      error: {
        codigo: 'FORA_DA_AREA',
        mensagem: 'O Fiscaliza Aí! ainda não atende esta região.',
        detalhes: {},
      },
    };
    const pendentes = usePendentesStore();

    await pendentes.sincronizar(rede.api);
    expect(pendentes.lista[0]).toMatchObject({
      estado: 'ERRO',
      erro: 'O Fiscaliza Aí! ainda não atende esta região.',
    });

    await pendentes.sincronizar(rede.api);
    expect(rede.registros).toHaveLength(1);

    await pendentes.descartar(pendentes.lista[0]!.chave);
    expect(pendentes.quantidade).toBe(0);
    expect(
      await reabrir()
        .carregar()
        .then(() => usePendentesStore().quantidade),
    ).toBe(0);
  });

  it('servidor fora do ar (503) mantém a pendente na fila para a próxima tentativa', async () => {
    await enviarSemRede();
    voltarRede();
    rede.estado.recusa = {
      error: { codigo: 'SERVICO_INDISPONIVEL', mensagem: 'Fora do ar.', detalhes: {} },
    };
    const pendentes = usePendentesStore();

    await pendentes.sincronizar(rede.api);

    expect(pendentes.lista[0]).toMatchObject({ estado: 'AGUARDANDO', erro: null });
  });

  it('id já usado por outra pessoa: gera outro id e sobe as fotos de novo', async () => {
    const { registro } = await enviarSemRede();
    const idAntigo = registro.id;
    voltarRede();
    rede.estado.idsDeOutros.add(idAntigo);
    const pendentes = usePendentesStore();

    await pendentes.sincronizar(rede.api);

    expect(rede.registros.map((r) => r['id'] === idAntigo)).toEqual([true, false]);
    expect(rede.uploads).toHaveLength(2);
    expect(pendentes.quantidade).toBe(0);
  });

  it('só envia as pendentes do usuário logado', async () => {
    await enviarSemRede();
    voltarRede();

    const outro = reabrir('u2');
    await outro.sincronizar(rede.api);

    expect(rede.registros).toHaveLength(0);
    expect(outro.quantidade).toBe(0);
    expect(outro.totalNoAparelho).toBe(1);
  });

  it('deslogado, conta as pendentes do aparelho para o convite de entrar', async () => {
    await enviarSemRede();

    setActivePinia(createPinia());
    const pendentes = usePendentesStore();
    await pendentes.sincronizar(rede.api);

    expect(pendentes.totalNoAparelho).toBe(1);
    expect(pendentes.quantidade).toBe(0);
    expect(rede.POST).not.toHaveBeenCalled();
  });

  it('sair da conta descarta as pendentes de quem saiu', async () => {
    await enviarSemRede();
    const pendentes = usePendentesStore();

    await pendentes.descartarDoUsuario();

    expect(pendentes.quantidade).toBe(0);
    expect(
      await reabrir()
        .carregar()
        .then(() => usePendentesStore().quantidade),
    ).toBe(0);
  });
});
