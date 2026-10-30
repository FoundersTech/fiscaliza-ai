import { describe, expect, it } from 'vitest';

import { Protocolo } from './protocolo.js';

describe('Protocolo', () => {
  it('formata com o sequencial em 6 dígitos', () => {
    expect(Protocolo.formatar(2026, 'SOR', 123)).toBe('FA-2026-SOR-000123');
    expect(Protocolo.formatar(2027, 'SOR', 1)).toBe('FA-2027-SOR-000001');
    expect(Protocolo.formatar(2026, 'SOR', 999_999)).toBe('FA-2026-SOR-999999');
  });

  it.each([
    [26, 'SOR', 1],
    [2026, 'sor', 1],
    [2026, 'SORO', 1],
    [2026, 'SOR', 0],
    [2026, 'SOR', 1_000_000],
    [2026, 'SOR', 1.5],
  ])('recusa formatar(%s, %s, %s)', (ano, sigla, numero) => {
    expect(() => Protocolo.formatar(ano, sigla, numero)).toThrow(
      expect.objectContaining({ codigo: 'PROTOCOLO_INVALIDO' }) as Error,
    );
  });

  it('lê um protocolo válido, tolerando espaços e minúsculas', () => {
    expect(Protocolo.ler(' fa-2026-sor-000123 ')).toEqual({ ano: 2026, sigla: 'SOR', numero: 123 });
  });

  it.each(['FA-2026-SOR-123', 'FA-26-SOR-000123', 'XX-2026-SOR-000123', 'FA-2026-SOR-000000', ''])(
    'devolve null para %j',
    (texto) => {
      expect(Protocolo.ler(texto)).toBeNull();
    },
  );

  it('ler desfaz formatar', () => {
    expect(Protocolo.ler(Protocolo.formatar(2026, 'SOR', 42))).toEqual({
      ano: 2026,
      sigla: 'SOR',
      numero: 42,
    });
  });
});
