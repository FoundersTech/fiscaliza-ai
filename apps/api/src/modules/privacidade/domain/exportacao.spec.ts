import { describe, expect, it } from 'vitest';

import {
  aproveitavel,
  chaveDoArquivo,
  type Exportacao,
  expiracaoDe,
  StatusExportacao,
  statusVigente,
} from './exportacao.js';

const AGORA = new Date('2026-11-14T12:00:00.000Z');

function exportacao(mudancas: Partial<Exportacao> = {}): Exportacao {
  return {
    id: 'exp-1',
    usuarioId: 'usuario-1',
    status: StatusExportacao.PRONTA,
    storageKey: 'exportacoes/usuario-1/exp-1.json',
    solicitadaEm: new Date('2026-11-10T12:00:00.000Z'),
    prontaEm: new Date('2026-11-10T12:01:00.000Z'),
    expiraEm: new Date('2026-11-17T12:01:00.000Z'),
    ...mudancas,
  };
}

describe('exportação de dados', () => {
  it('o arquivo vale por 7 dias depois de pronto', () => {
    expect(expiracaoDe(new Date('2026-11-10T12:00:00.000Z'))).toEqual(
      new Date('2026-11-17T12:00:00.000Z'),
    );
  });

  it('a pronta dentro do prazo continua pronta e é aproveitada', () => {
    expect(statusVigente(exportacao(), AGORA)).toBe(StatusExportacao.PRONTA);
    expect(aproveitavel(exportacao(), AGORA)).toBe(true);
  });

  it('a pronta com o prazo vencido conta como expirada antes da limpeza', () => {
    const vencida = exportacao({ expiraEm: AGORA });

    expect(statusVigente(vencida, AGORA)).toBe(StatusExportacao.EXPIRADA);
    expect(aproveitavel(vencida, AGORA)).toBe(false);
  });

  it('a em andamento é aproveitada; a que falhou ou expirou, não', () => {
    const emAndamento = exportacao({ status: StatusExportacao.PROCESSANDO, expiraEm: null });

    expect(aproveitavel(emAndamento, AGORA)).toBe(true);
    expect(aproveitavel(exportacao({ status: StatusExportacao.FALHOU }), AGORA)).toBe(false);
    expect(aproveitavel(exportacao({ status: StatusExportacao.EXPIRADA }), AGORA)).toBe(false);
  });

  it('o arquivo fica fora do prefixo das fotos das ocorrências', () => {
    const chave = chaveDoArquivo('usuario-1', 'exp-1');

    expect(chave).toBe('exportacoes/usuario-1/exp-1.json');
    expect(chave.startsWith('ocorrencias/')).toBe(false);
  });
});
