import { describe, expect, it, vi } from 'vitest';

import type { HasherSenha } from '../../identidade/application/portas.js';
import { ExcluirConta } from './excluir-conta.js';
import type { ArquivosExportacao, RepositorioContas } from './portas.js';

const AGORA = new Date('2026-11-14T12:00:00.000Z');

interface Cenario {
  hash?: string | null;
  confere?: boolean;
  arquivos?: string[];
}

function montar({ hash = 'hash', confere = true, arquivos = ['a.json'] }: Cenario = {}) {
  const contas = {
    senhaDe: vi.fn<RepositorioContas['senhaDe']>().mockResolvedValue(hash),
    anonimizar: vi.fn<RepositorioContas['anonimizar']>().mockResolvedValue(arquivos),
  };
  const hasher = {
    gerar: vi.fn<HasherSenha['gerar']>(),
    conferir: vi.fn<HasherSenha['conferir']>().mockResolvedValue(confere),
  };
  const armazem = {
    gravar: vi.fn<ArquivosExportacao['gravar']>(),
    urlDeDownload: vi.fn<ArquivosExportacao['urlDeDownload']>(),
    apagar: vi.fn<ArquivosExportacao['apagar']>().mockResolvedValue(),
  };
  return { excluir: new ExcluirConta(contas, hasher, armazem), contas, armazem };
}

describe('ExcluirConta', () => {
  it('confere a senha, anonimiza e apaga os arquivos das exportações', async () => {
    const { excluir, contas, armazem } = montar();

    await excluir.executar('usuario-1', 'senha-certa', AGORA);
    expect(contas.anonimizar).toHaveBeenCalledWith('usuario-1', AGORA);
    expect(armazem.apagar).toHaveBeenCalledWith('a.json');
  });

  it('senha errada é 401 SENHA_INCORRETA, sem anonimizar', async () => {
    const { excluir, contas } = montar({ confere: false });

    await expect(excluir.executar('usuario-1', 'errada', AGORA)).rejects.toMatchObject({
      codigo: 'SENHA_INCORRETA',
      status: 401,
    });
    expect(contas.anonimizar).not.toHaveBeenCalled();
  });

  it('conta sem senha também é 401 SENHA_INCORRETA', async () => {
    const { excluir, contas } = montar({ hash: null });

    await expect(excluir.executar('usuario-1', 'qualquer', AGORA)).rejects.toMatchObject({
      codigo: 'SENHA_INCORRETA',
    });
    expect(contas.anonimizar).not.toHaveBeenCalled();
  });

  it('falha ao apagar o arquivo não desfaz a exclusão', async () => {
    const { excluir, armazem } = montar({ arquivos: ['a.json', 'b.json'] });
    armazem.apagar.mockRejectedValueOnce(new Error('S3 fora'));

    await expect(excluir.executar('usuario-1', 'senha-certa', AGORA)).resolves.toBeUndefined();
    expect(armazem.apagar).toHaveBeenCalledTimes(2);
  });
});
