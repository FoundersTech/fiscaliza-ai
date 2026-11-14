import { describe, expect, it } from 'vitest';

import { backupsVencidos, chaveBackup, diaDoBackup } from './backup.js';

describe('backup do banco', () => {
  it('usa o dia de São Paulo no nome do arquivo', () => {
    // 01:30 em UTC ainda é dia 13 em São Paulo (UTC−3).
    expect(chaveBackup(new Date('2026-11-14T01:30:00Z'))).toBe(
      'postgres/fiscaliza-2026-11-13.dump',
    );
    expect(chaveBackup(new Date('2026-11-14T07:00:00Z'))).toBe(
      'postgres/fiscaliza-2026-11-14.dump',
    );
  });

  it('lê o dia só das chaves no formato do backup', () => {
    expect(diaDoBackup('postgres/fiscaliza-2026-11-14.dump')).toBe('2026-11-14');
    expect(diaDoBackup('postgres/outro-arquivo.dump')).toBeNull();
    expect(diaDoBackup('fiscaliza-2026-11-14.dump')).toBeNull();
  });

  it('guarda 7 dias, contando o de hoje, e não toca em outros arquivos', () => {
    const chaves = [
      'postgres/fiscaliza-2026-11-14.dump',
      'postgres/fiscaliza-2026-11-08.dump',
      'postgres/fiscaliza-2026-11-07.dump',
      'postgres/fiscaliza-2026-10-30.dump',
      'postgres/anotacao.txt',
    ];

    expect(backupsVencidos(chaves, new Date('2026-11-14T07:00:00Z'))).toEqual([
      'postgres/fiscaliza-2026-11-07.dump',
      'postgres/fiscaliza-2026-10-30.dump',
    ]);
  });
});
