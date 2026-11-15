import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type { MinhaOcorrencia } from '@/services/ocorrencia';
import { type Perfil, useAuthStore } from '@/stores/auth';

import { useMinhasOcorrenciasStore } from './minhas-ocorrencias';

function ocorrencia(id: string, mudancas: Partial<MinhaOcorrencia> = {}): MinhaOcorrencia {
  return {
    id,
    protocolo: `FA-2026-SOR-${id.padStart(6, '0')}`,
    categoria: { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb' },
    resumo: 'Poste apagado',
    endereco: null,
    confirmacoes: 0,
    urgente: false,
    dias_em_aberto: 1,
    miniatura_url: null,
    foto_em_analise: true,
    criada_em: '2026-11-10T12:00:00.000Z',
    status_publico: 'RECEBIDO',
    justificativa_recusa: null,
    original: null,
    ...mudancas,
  };
}

type Pagina = { itens: MinhaOcorrencia[]; proximo_cursor: string | null };

/** Servidor falso: cada cursor devolve a sua página; `semRede` faz a chamada falhar. */
function servidor(paginas: Record<string, Pagina>) {
  const estado = { semRede: false };
  const GET = vi.fn((_caminho: string, opcoes: { params: { query: { cursor?: string } } }) => {
    if (estado.semRede) return Promise.reject(new TypeError('Failed to fetch'));
    const pagina = paginas[opcoes.params.query.cursor ?? 'inicio'];
    return Promise.resolve({ data: pagina });
  });
  return { api: { GET } as unknown as Api, GET, estado };
}

function entrar(id: string): void {
  useAuthStore().iniciarSessao({
    access_token: 'token',
    usuario: { id, papel: 'CIDADAO' } as Perfil,
  });
}

const RECUSADA = ocorrencia('2', {
  status_publico: 'RECUSADO',
  justificativa_recusa: 'O local é área particular.',
});
const DUPLICADA = ocorrencia('3', {
  status_publico: 'DUPLICADO',
  original: { id: 'orig', protocolo: 'FA-2026-SOR-000101' },
});

describe('minhas ocorrências', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    entrar('u1');
  });

  it('traz a recusada com a justificativa e a duplicada com a original', async () => {
    const { api } = servidor({
      inicio: { itens: [ocorrencia('1'), RECUSADA, DUPLICADA], proximo_cursor: null },
    });
    const minhas = useMinhasOcorrenciasStore();

    await minhas.recarregar(api);

    expect(minhas.itens).toHaveLength(3);
    expect(minhas.itens[1]).toMatchObject({
      status_publico: 'RECUSADO',
      justificativa_recusa: 'O local é área particular.',
    });
    expect(minhas.itens[2]?.original).toEqual({ id: 'orig', protocolo: 'FA-2026-SOR-000101' });
    expect(minhas.temMais).toBe(false);
  });

  it('busca a página seguinte pelo cursor, sem repetir itens', async () => {
    const { api, GET } = servidor({
      inicio: { itens: [ocorrencia('1'), ocorrencia('2')], proximo_cursor: 'c2' },
      c2: { itens: [ocorrencia('2'), ocorrencia('3')], proximo_cursor: null },
    });
    const minhas = useMinhasOcorrenciasStore();

    await minhas.recarregar(api);
    expect(minhas.temMais).toBe(true);
    await minhas.carregarMais(api);

    expect(minhas.itens.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(minhas.temMais).toBe(false);
    await minhas.carregarMais(api);
    expect(GET).toHaveBeenCalledTimes(2);
  });

  it('não pede a mesma página duas vezes enquanto a primeira não volta', async () => {
    const { api, GET } = servidor({
      inicio: { itens: [ocorrencia('1')], proximo_cursor: 'c2' },
      c2: { itens: [ocorrencia('2')], proximo_cursor: null },
    });
    const minhas = useMinhasOcorrenciasStore();
    await minhas.recarregar(api);

    await Promise.all([minhas.carregarMais(api), minhas.carregarMais(api)]);

    expect(GET).toHaveBeenCalledTimes(2);
    expect(minhas.itens.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('sem conexão, guarda a mensagem e mantém o que já estava na tela', async () => {
    const { api, estado } = servidor({
      inicio: { itens: [ocorrencia('1')], proximo_cursor: 'c2' },
      c2: { itens: [ocorrencia('2')], proximo_cursor: null },
    });
    const minhas = useMinhasOcorrenciasStore();
    await minhas.recarregar(api);

    estado.semRede = true;
    await minhas.carregarMais(api);
    expect(minhas.erro).toMatch(/conexão/);
    expect(minhas.itens.map((i) => i.id)).toEqual(['1']);

    estado.semRede = false;
    await minhas.carregarMais(api);
    expect(minhas.erro).toBeNull();
    expect(minhas.itens.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('a resposta de uma busca anterior que chega atrasada é descartada', async () => {
    let liberar: (valor: { data: Pagina }) => void = () => {};
    const GET = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolver) => (liberar = resolver)))
      .mockResolvedValueOnce({ data: { itens: [ocorrencia('novo')], proximo_cursor: null } });
    const api = { GET } as unknown as Api;
    const minhas = useMinhasOcorrenciasStore();

    const primeira = minhas.recarregar(api);
    await minhas.recarregar(api);
    liberar({ data: { itens: [ocorrencia('velho')], proximo_cursor: 'x' } });
    await primeira;

    expect(minhas.itens.map((i) => i.id)).toEqual(['novo']);
    expect(minhas.temMais).toBe(false);
  });

  it('outra conta no mesmo aparelho não vê a lista da anterior', async () => {
    const { api } = servidor({ inicio: { itens: [ocorrencia('1')], proximo_cursor: null } });
    const minhas = useMinhasOcorrenciasStore();
    await minhas.recarregar(api);

    entrar('u2');
    const pedido = minhas.recarregar(api);
    expect(minhas.itens).toEqual([]);
    await pedido;
  });
});
