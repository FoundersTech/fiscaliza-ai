import { describe, expect, it, vi } from 'vitest';

import type { LimparTokensExpirados } from '../../identidade/application/limpar-tokens-expirados.js';
import type { LimparUploadsOrfaos } from '../../midia/application/limpar-uploads-orfaos.js';
import { ExpirarExportacoes } from './expirar-exportacoes.js';
import { Limpeza } from './limpeza.js';
import type { ArquivosExportacao, RepositorioExportacoes } from './portas.js';

describe('Limpeza', () => {
  it('olha uploads de mais de 24 h, tokens expirados há mais de 30 dias e exportações vencidas', async () => {
    const uploads = { executar: vi.fn<LimparUploadsOrfaos['executar']>().mockResolvedValue(2) };
    const tokens = {
      executar: vi
        .fn<LimparTokensExpirados['executar']>()
        .mockResolvedValue({ sessoes: 3, links: 1 }),
    };
    const exportacoes = { executar: vi.fn<ExpirarExportacoes['executar']>().mockResolvedValue(0) };
    const limpeza = new Limpeza(
      uploads as unknown as LimparUploadsOrfaos,
      tokens as unknown as LimparTokensExpirados,
      exportacoes as unknown as ExpirarExportacoes,
    );
    const agora = new Date('2026-11-14T06:00:00.000Z');

    expect(await limpeza.executar(agora)).toEqual({
      uploads: 2,
      sessoes: 3,
      links: 1,
      exportacoes: 0,
    });
    expect(uploads.executar).toHaveBeenCalledWith(new Date('2026-11-13T06:00:00.000Z'));
    expect(tokens.executar).toHaveBeenCalledWith(new Date('2026-10-15T06:00:00.000Z'));
    expect(exportacoes.executar).toHaveBeenCalledWith(agora);
  });
});

describe('ExpirarExportacoes', () => {
  function montar() {
    const repositorio = {
      vencidas: vi.fn<RepositorioExportacoes['vencidas']>().mockResolvedValue([
        { id: 'e1', storageKey: 'exportacoes/e1.json' },
        { id: 'e2', storageKey: null },
      ]),
      marcarExpirada: vi.fn<RepositorioExportacoes['marcarExpirada']>().mockResolvedValue(),
    };
    const arquivos = { apagar: vi.fn<ArquivosExportacao['apagar']>().mockResolvedValue() };
    return { caso: new ExpirarExportacoes(repositorio, arquivos), repositorio, arquivos };
  }

  it('apaga o arquivo e marca a exportação como expirada', async () => {
    const { caso, repositorio, arquivos } = montar();

    expect(await caso.executar(new Date())).toBe(2);
    expect(arquivos.apagar.mock.calls).toEqual([['exportacoes/e1.json']]);
    expect(repositorio.marcarExpirada.mock.calls).toEqual([['e1'], ['e2']]);
  });

  it('se o arquivo não sai do bucket, a exportação continua para a próxima vez', async () => {
    const { caso, repositorio, arquivos } = montar();
    arquivos.apagar.mockRejectedValue(new Error('R2 fora do ar'));

    await expect(caso.executar(new Date())).rejects.toThrow('R2 fora do ar');
    expect(repositorio.marcarExpirada).not.toHaveBeenCalled();
  });
});
