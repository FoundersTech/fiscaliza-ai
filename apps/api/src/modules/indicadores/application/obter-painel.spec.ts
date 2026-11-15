import { describe, expect, it, vi } from 'vitest';

import { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';
import { chaveCachePainel, filtroPainel, ObterPainel } from './obter-painel.js';
import type { CachePainel, ConsultasPainel, PainelCalculado } from './portas.js';

const AGORA = new Date('2026-11-14T12:00:00Z');

function preparar(guardado?: PainelCalculado) {
  const contar = vi.fn<ConsultasPainel['contar']>(() =>
    Promise.resolve({ total: 2, resolvidas: 1, diasMediana: 3, porCategoria: [] }),
  );
  const gravar = vi.fn<CachePainel['gravar']>(() => Promise.resolve());
  const cache: CachePainel = { ler: () => Promise.resolve(guardado), gravar };
  return { contar, gravar, caso: new ObterPainel({ contar }, cache) };
}

describe('filtroPainel e chave do cache', () => {
  it('sem filtros: 30 dias, todos os municípios e categorias', () => {
    const filtro = filtroPainel({});
    expect(filtro).toEqual({ municipioId: null, periodoDias: 30, categorias: null });
    expect(chaveCachePainel(filtro)).toBe('painel:todos:30:todas');
  });

  it('categorias em qualquer ordem e repetidas dão a mesma chave', () => {
    const a = chaveCachePainel(filtroPainel({ categorias: ['pavimentacao', 'iluminacao'] }));
    const b = chaveCachePainel(
      filtroPainel({ categorias: ['iluminacao', 'pavimentacao', 'iluminacao'] }),
    );
    expect(a).toBe(b);
    expect(a).toBe('painel:todos:30:iluminacao,pavimentacao');
  });

  it('município e período entram na chave', () => {
    expect(chaveCachePainel(filtroPainel({ municipioId: 3552205, periodoDias: 365 }))).toBe(
      'painel:3552205:365:todas',
    );
  });
});

describe('ObterPainel', () => {
  it('sem cache, conta só as visíveis ao público desde o início do período e guarda', async () => {
    const { contar, gravar, caso } = preparar();

    const painel = await caso.executar({ periodoDias: 90 }, AGORA);

    const [filtro, status, desde] = contar.mock.calls[0]!;
    expect(filtro.periodoDias).toBe(90);
    expect(status).not.toContain(StatusOcorrencia.RECUSADA);
    expect(status).not.toContain(StatusOcorrencia.DUPLICADA);
    expect(desde).toEqual(new Date('2026-08-16T12:00:00Z'));
    expect(painel).toMatchObject({ vazio: false, total: 2, resolvidasPct: 50 });
    expect(painel.calculadoEm).toEqual(AGORA);
    expect(gravar).toHaveBeenCalledWith('painel:todos:90:todas', painel);
  });

  it('com o painel guardado, não consulta o banco', async () => {
    const guardado: PainelCalculado = {
      vazio: true,
      periodoDias: 30,
      total: 0,
      resolvidas: 0,
      resolvidasPct: null,
      diasMediana: null,
      porCategoria: [],
      calculadoEm: new Date('2026-11-14T11:58:00Z'),
    };
    const { contar, gravar, caso } = preparar(guardado);

    expect(await caso.executar({}, AGORA)).toBe(guardado);
    expect(contar).not.toHaveBeenCalled();
    expect(gravar).not.toHaveBeenCalled();
  });
});
