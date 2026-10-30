import { describe, expect, it, vi } from 'vitest';

import type { EnderecoReverso } from '../../territorio/application/territorio.js';
import { PreencherEndereco } from './enderecos.js';
import type { RepositorioOcorrencias } from './portas.js';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
const LOCAL = { lat: -23.5015, lng: -47.4526 };

function montar(local: typeof LOCAL | null, endereco: string | null) {
  const repositorio = {
    localSemEndereco: vi.fn<RepositorioOcorrencias['localSemEndereco']>().mockResolvedValue(local),
    gravarEndereco: vi.fn<RepositorioOcorrencias['gravarEndereco']>().mockResolvedValue(),
  };
  const enderecoReverso = {
    executar: vi.fn<EnderecoReverso['executar']>().mockResolvedValue(endereco),
  };
  const preencher = new PreencherEndereco(
    repositorio as unknown as RepositorioOcorrencias,
    enderecoReverso as unknown as EnderecoReverso,
  );
  return { preencher, repositorio, enderecoReverso };
}

describe('PreencherEndereco', () => {
  it('grava o endereço encontrado', async () => {
    const { preencher, repositorio } = montar(LOCAL, 'Rua A, 1 · Centro');

    await preencher.executar(ID);

    expect(repositorio.gravarEndereco).toHaveBeenCalledWith(ID, 'Rua A, 1 · Centro');
  });

  it('sem endereço ainda, lança erro para a fila tentar de novo', async () => {
    const { preencher, repositorio } = montar(LOCAL, null);

    await expect(preencher.executar(ID)).rejects.toThrow('endereço ainda indisponível');
    expect(repositorio.gravarEndereco).not.toHaveBeenCalled();
  });

  it('ocorrência que já tem endereço (ou não existe) termina sem consultar', async () => {
    const { preencher, enderecoReverso } = montar(null, 'Rua A, 1');

    await preencher.executar(ID);

    expect(enderecoReverso.executar).not.toHaveBeenCalled();
  });
});
