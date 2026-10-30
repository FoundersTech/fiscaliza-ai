import { describe, expect, it, vi } from 'vitest';

import { criarRenovador, type Travas } from './renovacao';

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Uma tarefa por vez, na ordem dos pedidos, como o navigator.locks entre as abas. */
function travasDoNavegador(): Travas {
  let fila: Promise<unknown> = Promise.resolve();
  return {
    request(_nome, tarefa) {
      const resultado = fila.then(tarefa);
      fila = resultado.catch(() => undefined);
      return resultado;
    },
  };
}

/**
 * A rotação do refresh na API, mas sem a tolerância de 10 s: reapresentar um token já usado revoga
 * a sessão. O cookie é um só para todas as abas, como no navegador.
 */
function apiSemTolerancia() {
  let geracao = 1;
  let cookie = 'refresh-1';
  let revogada = false;
  const usados = new Set<string>();

  async function renovar(): Promise<boolean> {
    const enviado = cookie;
    await esperar(5);
    if (revogada || usados.has(enviado)) {
      revogada = true;
      return false;
    }
    usados.add(enviado);
    geracao += 1;
    cookie = `refresh-${geracao}`;
    return true;
  }

  return { renovar, revogada: () => revogada };
}

describe('criarRenovador', () => {
  it('na mesma aba, pedidos simultâneos fazem uma renovação só', async () => {
    const renovar = vi.fn(async () => {
      await esperar(5);
      return true;
    });
    const renovador = criarRenovador(renovar, null);

    const resultados = await Promise.all([renovador(), renovador(), renovador()]);

    expect(resultados).toEqual([true, true, true]);
    expect(renovar).toHaveBeenCalledOnce();

    await renovador();
    expect(renovar).toHaveBeenCalledTimes(2);
  });

  it('uma renovação que falhou não trava as próximas', async () => {
    const renovar = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue(true);
    const renovador = criarRenovador(renovar, travasDoNavegador());

    await expect(renovador()).rejects.toThrow('sem rede');
    await expect(renovador()).resolves.toBe(true);
  });

  it('com duas abas, o access token vencendo nas duas ao mesmo tempo não derruba nenhuma', async () => {
    const api = apiSemTolerancia();
    const travas = travasDoNavegador();
    const abaA = criarRenovador(api.renovar, travas);
    const abaB = criarRenovador(api.renovar, travas);

    expect(await Promise.all([abaA(), abaB()])).toEqual([true, true]);
    expect(api.revogada()).toBe(false);
  });

  it('sem a trava entre abas, as duas mandariam o mesmo token, e só a tolerância da API salvaria a sessão', async () => {
    const api = apiSemTolerancia();
    const abaA = criarRenovador(api.renovar, null);
    const abaB = criarRenovador(api.renovar, null);

    expect(await Promise.all([abaA(), abaB()])).toContain(false);
    expect(api.revogada()).toBe(true);
  });
});
