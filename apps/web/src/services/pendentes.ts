import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { DadosEnvio } from './envio';

/**
 * AGUARDANDO: na fila, esperando conexão. ENVIANDO: o envio está em andamento.
 * ERRO: o servidor recusou (ex.: ponto fora da área); fica com o motivo até ser descartada.
 */
export type EstadoPendente = 'AGUARDANDO' | 'ENVIANDO' | 'ERRO';

export interface FotoPendente {
  arquivo: Blob;
  ordem: 1 | 2;
  /** Já está no storage: o próximo envio só repete o registro. */
  uploadKey?: string | undefined;
}

/** Uma ocorrência guardada no aparelho até chegar ao servidor. */
export interface Pendente {
  /** Chave local. Não muda nem quando o id da ocorrência precisa ser trocado. */
  chave: string;
  usuarioId: string;
  /** Data e hora em que o cidadão tocou em "Enviar" (ISO). */
  criadaEm: string;
  /** Só para a tela: o servidor recebe a categoria pelo id. */
  categoriaNome: string;
  endereco: string | null;
  dados: Omit<DadosEnvio, 'fotos'>;
  fotos: FotoPendente[];
  estado: EstadoPendente;
  erro: string | null;
}

interface EsquemaPendentes extends DBSchema {
  pendentes: {
    key: string;
    value: Pendente;
    indexes: { 'por-usuario': string };
  };
}

export interface RepositorioPendentes {
  /** Sem usuário, devolve as de todos (para o aviso de quem está deslogado). */
  listar(usuarioId?: string): Promise<Pendente[]>;
  salvar(pendente: Pendente): Promise<void>;
  remover(chave: string): Promise<void>;
  /** Apaga as de um usuário, ao sair da conta. */
  removerDoUsuario(usuarioId: string): Promise<void>;
  fechar(): void;
}

export const BANCO_PENDENTES = 'fiscaliza-pendentes';

/** As pendentes ficam no IndexedDB: fechar e reabrir o app não as perde. */
export function abrirPendentes(nomeBanco = BANCO_PENDENTES): RepositorioPendentes {
  let conexao: Promise<IDBPDatabase<EsquemaPendentes>> | null = null;

  function banco(): Promise<IDBPDatabase<EsquemaPendentes>> {
    conexao ??= openDB<EsquemaPendentes>(nomeBanco, 1, {
      upgrade(db) {
        const loja = db.createObjectStore('pendentes', { keyPath: 'chave' });
        loja.createIndex('por-usuario', 'usuarioId');
      },
    });
    return conexao;
  }

  return {
    async listar(usuarioId) {
      const db = await banco();
      const lista = usuarioId
        ? await db.getAllFromIndex('pendentes', 'por-usuario', usuarioId)
        : await db.getAll('pendentes');
      return lista.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    },
    async salvar(pendente) {
      await (await banco()).put('pendentes', pendente);
    },
    async remover(chave) {
      await (await banco()).delete('pendentes', chave);
    },
    async removerDoUsuario(usuarioId) {
      const db = await banco();
      const tx = db.transaction('pendentes', 'readwrite');
      const chaves = await tx.store.index('por-usuario').getAllKeys(usuarioId);
      await Promise.all([...chaves.map((chave) => tx.store.delete(chave)), tx.done]);
    },
    fechar() {
      void conexao?.then((db) => db.close());
      conexao = null;
    },
  };
}
