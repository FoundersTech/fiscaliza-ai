import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Alerta } from '@/services/alertas';
import type { Api } from '@/services/api';
import { type Papel, type Perfil, useAuthStore } from '@/stores/auth';

import { useAlertasStore } from './alertas';

function alerta(eventoId: number, mudancas: Partial<Alerta> = {}): Alerta {
  return {
    evento_id: eventoId,
    ocorrencia_id: `ocorrencia-${eventoId}`,
    protocolo: `FA-2026-SOR-${String(eventoId).padStart(6, '0')}`,
    para_status_publico: 'EM_ANDAMENTO',
    reaberta: false,
    criado_em: '2026-11-14T12:00:00.000Z',
    ...mudancas,
  };
}

/**
 * Servidor falso com a regra da API: "novos" são os alertas depois do último "vistos".
 * `mudarStatus` simula o agente mudando o status de uma ocorrência.
 */
function servidor() {
  const estado = { alertas: [] as Alerta[], vistosAte: 0, semRede: false };
  const GET = vi.fn((caminho: string) => {
    if (estado.semRede) return Promise.reject(new TypeError('Failed to fetch'));
    if (caminho === '/api/v1/me/alertas/novos') {
      const quantidade = estado.alertas.filter((item) => item.evento_id > estado.vistosAte).length;
      return Promise.resolve({ data: { quantidade } });
    }
    return Promise.resolve({ data: { itens: [...estado.alertas], proximo_cursor: null } });
  });
  const POST = vi.fn(() => {
    estado.vistosAte = estado.alertas[0]?.evento_id ?? 0;
    return Promise.resolve({ response: { ok: true } });
  });
  function mudarStatus(mudancas: Partial<Alerta> = {}): void {
    const id = (estado.alertas[0]?.evento_id ?? 0) + 1;
    estado.alertas = [alerta(id, mudancas), ...estado.alertas];
  }
  return { api: { GET, POST } as unknown as Api, GET, POST, estado, mudarStatus };
}

function entrar(id: string, papel: Papel = 'CIDADAO'): void {
  useAuthStore().iniciarSessao({ access_token: 'token', usuario: { id, papel } as Perfil });
}

describe('alertas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    entrar('u1');
  });

  afterEach(() => {
    useAlertasStore().encerrarConsulta();
    vi.useRealTimers();
  });

  it('abrir a aba zera o indicador, marca como vistos e destaca os que eram novos', async () => {
    const { api, POST, mudarStatus } = servidor();
    mudarStatus();
    mudarStatus({ para_status_publico: 'RESOLVIDO' });
    const alertas = useAlertasStore();
    await alertas.atualizarNovos(api);
    expect(alertas.novos).toBe(2);

    const abrindo = alertas.abrirAba(api);
    // O indicador zera na hora, antes de a lista chegar.
    expect(alertas.novos).toBe(0);
    await abrindo;

    expect(POST).toHaveBeenCalledWith('/api/v1/me/alertas/vistos');
    expect(alertas.itens.map((item) => item.evento_id)).toEqual([2, 1]);
    expect(alertas.destacados).toBe(2);
    // A próxima consulta continua em zero: a API já sabe que foram vistos.
    await alertas.atualizarNovos(api);
    expect(alertas.novos).toBe(0);

    alertas.sairDaAba();
    expect(alertas.destacados).toBe(0);
  });

  it('uma mudança nova aparece no indicador em até 60 s, sem recarregar', async () => {
    const { api, GET, mudarStatus } = servidor();
    const alertas = useAlertasStore();
    alertas.iniciarConsulta(api);
    await vi.advanceTimersByTimeAsync(0);
    expect(alertas.novos).toBe(0);
    expect(GET).toHaveBeenCalledTimes(1);

    mudarStatus();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(alertas.novos).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(alertas.novos).toBe(1);

    mudarStatus({ reaberta: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(alertas.novos).toBe(2);
    expect(GET).toHaveBeenCalledTimes(3);
  });

  it('chamar iniciarConsulta de novo não cria outro relógio, e encerrar para a consulta', async () => {
    const { api, GET } = servidor();
    const alertas = useAlertasStore();
    alertas.iniciarConsulta(api);
    alertas.iniciarConsulta(api);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(GET).toHaveBeenCalledTimes(2);

    alertas.encerrarConsulta();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(GET).toHaveBeenCalledTimes(2);
  });

  it('sem conexão, o indicador fica com o último número conhecido', async () => {
    const { api, estado, mudarStatus } = servidor();
    mudarStatus();
    const alertas = useAlertasStore();
    await alertas.atualizarNovos(api);
    estado.semRede = true;

    await alertas.atualizarNovos(api);
    expect(alertas.novos).toBe(1);
  });

  it('sair da conta zera o indicador e a lista da conta anterior', async () => {
    const { api, mudarStatus } = servidor();
    mudarStatus();
    const alertas = useAlertasStore();
    await alertas.abrirAba(api);
    mudarStatus();
    await alertas.atualizarNovos(api);
    expect(alertas.novos).toBe(1);

    useAuthStore().encerrarSessao();
    await alertas.atualizarNovos(api);
    expect(alertas.novos).toBe(0);
    expect(alertas.itens).toEqual([]);
  });

  it('quem não é cidadão não consulta a API', async () => {
    useAuthStore().encerrarSessao();
    entrar('agente', 'AGENTE_ORGAO');
    const { api, GET, POST } = servidor();
    const alertas = useAlertasStore();

    await alertas.atualizarNovos(api);
    await alertas.abrirAba(api);

    expect(GET).not.toHaveBeenCalled();
    expect(POST).not.toHaveBeenCalled();
  });

  it('com a aba aberta, o que chega depois entra no topo e também fica destacado', async () => {
    const { api, mudarStatus } = servidor();
    mudarStatus();
    const alertas = useAlertasStore();
    await alertas.atualizarNovos(api);
    await alertas.abrirAba(api);
    expect(alertas.destacados).toBe(1);

    mudarStatus({ para_status_publico: 'RESOLVIDO' });
    await alertas.atualizarNovos(api);
    await alertas.abrirAba(api);
    expect(alertas.itens.map((item) => item.evento_id)).toEqual([2, 1]);
    expect(alertas.destacados).toBe(2);
    expect(alertas.novos).toBe(0);
  });
});
