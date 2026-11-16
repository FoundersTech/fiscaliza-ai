import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type { LeituraGps } from '@/services/localizacao';
import type { Municipio } from '@/services/municipio';

import { type ConfigPublica, useConfigStore } from './config';

function municipio(id: number, nome: string): Municipio {
  return {
    id,
    nome,
    uf: 'SP',
    centro: { lat: -23.5, lng: -47.45 },
    bbox: { sul: -23.6, oeste: -47.6, norte: -23.35, leste: -47.3 },
  };
}

const SOROCABA = municipio(3552205, 'Sorocaba');
const VOTORANTIM = municipio(3557006, 'Votorantim');

function criarApi(opcoes: { municipioPorPonto?: number | null; erroGeo?: boolean } = {}) {
  const config: ConfigPublica = {
    municipios: [SOROCABA, VOTORANTIM],
    categorias_ativas: [],
    urgente_min_confirmacoes: 10,
    politica_versao: '1',
    google_maps_map_id: 'DEMO_MAP_ID',
    vapid_public_key: null,
  };
  const GET = vi.fn((caminho: string) => {
    if (caminho === '/api/v1/config/publica') return Promise.resolve({ data: config });
    if (opcoes.erroGeo) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ data: { municipio_id: opcoes.municipioPorPonto ?? null } });
  });
  return { api: { GET } as unknown as Api, GET };
}

function permissaoConcedida(): Permissions {
  return {
    query: vi.fn().mockResolvedValue({ state: 'granted' }),
  };
}

describe('useConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('troca para o município devolvido pela localização quando não há escolha manual', async () => {
    const { api } = criarApi({ municipioPorPonto: VOTORANTIM.id });
    const store = useConfigStore();
    await store.carregar(api);

    const trocou = await store.detectarPelaLocalizacao(api, {
      permissoes: permissaoConcedida(),
      lerLocalizacao: () =>
        Promise.resolve<LeituraGps>({
          ok: true,
          ponto: { lat: -23.54, lng: -47.43 },
          precisaoM: 12,
        }),
    });

    expect(trocou).toBe(true);
    expect(store.municipio?.id).toBe(VOTORANTIM.id);
    expect(store.origemEscolha).toBe('LOCALIZACAO');
  });

  it('atualização por localização não sobrescreve escolha manual', async () => {
    const { api } = criarApi({ municipioPorPonto: VOTORANTIM.id });
    const store = useConfigStore();
    await store.carregar(api);
    store.selecionarMunicipio(SOROCABA.id, 'MANUAL');

    const trocou = await store.detectarPelaLocalizacao(api, {
      permissoes: permissaoConcedida(),
      lerLocalizacao: () =>
        Promise.resolve<LeituraGps>({
          ok: true,
          ponto: { lat: -23.54, lng: -47.43 },
          precisaoM: 12,
        }),
    });

    expect(trocou).toBe(false);
    expect(store.municipio?.id).toBe(SOROCABA.id);
    expect(store.origemEscolha).toBe('MANUAL');

    store.selecionarMunicipio(VOTORANTIM.id, 'LOCALIZACAO');
    expect(store.municipio?.id).toBe(SOROCABA.id);
  });

  it('mantém o município atual quando a localização vem fora das atendidas ou falha', async () => {
    const fora = criarApi({ municipioPorPonto: null });
    const store = useConfigStore();
    await store.carregar(fora.api);

    const resultadoFora = await store.detectarPelaLocalizacao(fora.api, {
      permissoes: permissaoConcedida(),
      lerLocalizacao: () =>
        Promise.resolve<LeituraGps>({
          ok: true,
          ponto: { lat: -23.55, lng: -46.63 },
          precisaoM: 15,
        }),
    });

    expect(resultadoFora).toBe(false);
    expect(store.municipio?.id).toBe(SOROCABA.id);

    const erroRede = criarApi({ erroGeo: true });
    const resultadoErro = await store.detectarPelaLocalizacao(erroRede.api, {
      permissoes: permissaoConcedida(),
      lerLocalizacao: () =>
        Promise.resolve<LeituraGps>({
          ok: true,
          ponto: { lat: -23.54, lng: -47.43 },
          precisaoM: 15,
        }),
    });

    expect(resultadoErro).toBe(false);
    expect(store.municipio?.id).toBe(SOROCABA.id);
  });

  it('ignora escolha por localização de município fora da lista carregada', async () => {
    const { api } = criarApi({ municipioPorPonto: 9999999 });
    const store = useConfigStore();
    await store.carregar(api);

    const trocou = await store.detectarPelaLocalizacao(api, {
      permissoes: permissaoConcedida(),
      lerLocalizacao: () =>
        Promise.resolve<LeituraGps>({
          ok: true,
          ponto: { lat: -23.5, lng: -47.45 },
          precisaoM: 10,
        }),
    });

    expect(trocou).toBe(false);
    expect(store.municipio?.id).toBe(SOROCABA.id);
  });
});
