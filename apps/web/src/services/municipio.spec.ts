import { describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type { LeituraGps } from '@/services/localizacao';

import {
  detectarMunicipioInicial,
  escolherMunicipio,
  identificarMunicipioPorGps,
  lerEscolhaSalva,
  lerMunicipioSalvo,
  limitesDeTodos,
  type Municipio,
  rotuloMunicipio,
  salvarMunicipio,
} from './municipio';
import type { Armazenamento } from './tema';

function armazenamentoFalso(): Armazenamento {
  const dados = new Map<string, string>();
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => void dados.set(chave, valor),
  };
}

const BLOQUEADO: Armazenamento = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

function municipio(id: number, nome: string, bbox: Municipio['bbox']): Municipio {
  return { id, nome, uf: 'SP', centro: { lat: 0, lng: 0 }, bbox };
}

const SOROCABA = municipio(3552205, 'Sorocaba', {
  sul: -23.6,
  oeste: -47.6,
  norte: -23.35,
  leste: -47.3,
});
const VOTORANTIM = municipio(3557006, 'Votorantim', {
  sul: -23.75,
  oeste: -47.55,
  norte: -23.5,
  leste: -47.3,
});

describe('cidade escolhida', () => {
  it('continua escolhida depois de recarregar', () => {
    const armazenamento = armazenamentoFalso();

    salvarMunicipio(armazenamento, VOTORANTIM.id);

    expect(lerMunicipioSalvo(armazenamento)).toBe(VOTORANTIM.id);
  });

  it('sem escolha salva, valor estranho ou armazenamento bloqueado, não há escolha', () => {
    const estranho = armazenamentoFalso();
    estranho.setItem('fa:municipio', 'sorocaba');

    expect(lerMunicipioSalvo(armazenamentoFalso())).toBeNull();
    expect(lerMunicipioSalvo(estranho)).toBeNull();
    expect(lerMunicipioSalvo(BLOQUEADO)).toBeNull();
    expect(lerMunicipioSalvo(undefined)).toBeNull();
    expect(() => salvarMunicipio(BLOQUEADO, SOROCABA.id)).not.toThrow();
  });

  it('usa a escolhida quando ela ainda é atendida', () => {
    expect(escolherMunicipio([SOROCABA, VOTORANTIM], VOTORANTIM.id)).toBe(VOTORANTIM);
  });

  it('sem escolha, ou com uma cidade que saiu da lista, fica com a primeira', () => {
    expect(escolherMunicipio([SOROCABA, VOTORANTIM], null)).toBe(SOROCABA);
    expect(escolherMunicipio([SOROCABA, VOTORANTIM], 3545308)).toBe(SOROCABA);
    expect(escolherMunicipio([], SOROCABA.id)).toBeNull();
  });
});

describe('limitesDeTodos', () => {
  it('cobre todas as cidades atendidas', () => {
    expect(limitesDeTodos([SOROCABA, VOTORANTIM])).toEqual({
      sul: -23.75,
      oeste: -47.6,
      norte: -23.35,
      leste: -47.3,
    });
  });

  it('sem cidade, não há limites', () => {
    expect(limitesDeTodos([])).toBeNull();
  });
});

it('rotuloMunicipio junta nome e UF', () => {
  expect(rotuloMunicipio(SOROCABA)).toBe('Sorocaba · SP');
});

describe('detecção inicial pela localização', () => {
  function criarApiGeo(resposta: { data?: { municipio_id: number | null }; erro?: boolean }) {
    const GET = vi.fn(() => {
      if (resposta.erro) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ data: resposta.data });
    });
    return { api: { GET } as unknown as Api, GET };
  }

  function permissoesComEstado(state: PermissionState): Permissions {
    return {
      query: vi.fn().mockResolvedValue({ state }),
    };
  }

  it('lê formato antigo de localStorage como escolha manual e preserva origem na gravação', () => {
    const armazenamento = armazenamentoFalso();
    armazenamento.setItem('fa:municipio', '3557006');
    expect(lerEscolhaSalva(armazenamento)).toEqual({ id: VOTORANTIM.id, origem: 'MANUAL' });

    salvarMunicipio(armazenamento, SOROCABA.id, 'LOCALIZACAO');
    expect(lerEscolhaSalva(armazenamento)).toEqual({ id: SOROCABA.id, origem: 'LOCALIZACAO' });
  });

  it('quando permissão já foi concedida, consulta GPS e API e devolve o município', async () => {
    const { api, GET } = criarApiGeo({ data: { municipio_id: VOTORANTIM.id } });
    const lerLocalizacao = vi.fn<() => Promise<LeituraGps>>().mockResolvedValue({
      ok: true,
      ponto: { lat: -23.54, lng: -47.43 },
      precisaoM: 12,
    });

    const encontrado = await detectarMunicipioInicial({
      armazenamento: armazenamentoFalso(),
      permissoes: permissoesComEstado('granted'),
      lerLocalizacao,
      api,
    });

    expect(encontrado).toBe(VOTORANTIM.id);
    expect(lerLocalizacao).toHaveBeenCalledTimes(1);
    expect(GET).toHaveBeenCalledWith('/api/v1/geo/municipio', {
      params: { query: { lat: -23.54, lng: -47.43 } },
    });
  });

  it.each(['prompt', 'denied'] as const)(
    'quando permissão está em %s, não lê GPS nem consulta a API',
    async (estado) => {
      const { api, GET } = criarApiGeo({ data: { municipio_id: SOROCABA.id } });
      const lerLocalizacao = vi.fn<() => Promise<LeituraGps>>();

      const encontrado = await detectarMunicipioInicial({
        armazenamento: armazenamentoFalso(),
        permissoes: permissoesComEstado(estado),
        lerLocalizacao,
        api,
      });

      expect(encontrado).toBeNull();
      expect(lerLocalizacao).not.toHaveBeenCalled();
      expect(GET).not.toHaveBeenCalled();
    },
  );

  it('sem Permissions API, não lê GPS nem pede permissão', async () => {
    const { api, GET } = criarApiGeo({ data: { municipio_id: SOROCABA.id } });
    const lerLocalizacao = vi.fn<() => Promise<LeituraGps>>();

    const encontrado = await detectarMunicipioInicial({
      armazenamento: armazenamentoFalso(),
      permissoes: undefined,
      lerLocalizacao,
      api,
    });

    expect(encontrado).toBeNull();
    expect(lerLocalizacao).not.toHaveBeenCalled();
    expect(GET).not.toHaveBeenCalled();
  });

  it('quando já há escolha manual salva (inclusive formato antigo), não sobrescreve nem lê GPS', async () => {
    const armazenamento = armazenamentoFalso();
    salvarMunicipio(armazenamento, SOROCABA.id, 'MANUAL');
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    const permissoes: Permissions = { query };
    const lerLocalizacao = vi.fn<() => Promise<LeituraGps>>();
    const { api, GET } = criarApiGeo({ data: { municipio_id: VOTORANTIM.id } });

    expect(
      await detectarMunicipioInicial({ armazenamento, permissoes, lerLocalizacao, api }),
    ).toBeNull();

    const legado = armazenamentoFalso();
    legado.setItem('fa:municipio', String(SOROCABA.id));
    expect(
      await detectarMunicipioInicial({ armazenamento: legado, permissoes, lerLocalizacao, api }),
    ).toBeNull();

    expect(query).not.toHaveBeenCalled();
    expect(lerLocalizacao).not.toHaveBeenCalled();
    expect(GET).not.toHaveBeenCalled();
  });

  it('quando a escolha salva veio de localização, permite atualizar pela localização', async () => {
    const armazenamento = armazenamentoFalso();
    salvarMunicipio(armazenamento, SOROCABA.id, 'LOCALIZACAO');
    const { api } = criarApiGeo({ data: { municipio_id: VOTORANTIM.id } });

    const encontrado = await detectarMunicipioInicial({
      armazenamento,
      permissoes: permissoesComEstado('granted'),
      lerLocalizacao: () =>
        Promise.resolve({ ok: true, ponto: { lat: -23.54, lng: -47.43 }, precisaoM: 10 }),
      api,
    });

    expect(encontrado).toBe(VOTORANTIM.id);
  });

  it('devolve null em silêncio quando ponto vem fora da área, GPS falha ou rede falha', async () => {
    const pontoOk = () =>
      Promise.resolve<LeituraGps>({ ok: true, ponto: { lat: -23.55, lng: -46.63 }, precisaoM: 10 });
    const fora = criarApiGeo({ data: { municipio_id: null } });
    expect(
      await detectarMunicipioInicial({
        armazenamento: armazenamentoFalso(),
        permissoes: permissoesComEstado('granted'),
        lerLocalizacao: pontoOk,
        api: fora.api,
      }),
    ).toBeNull();

    const erroRede = criarApiGeo({ erro: true });
    expect(
      await detectarMunicipioInicial({
        armazenamento: armazenamentoFalso(),
        permissoes: permissoesComEstado('granted'),
        lerLocalizacao: pontoOk,
        api: erroRede.api,
      }),
    ).toBeNull();

    const semGps = criarApiGeo({ data: { municipio_id: SOROCABA.id } });
    expect(
      await detectarMunicipioInicial({
        armazenamento: armazenamentoFalso(),
        permissoes: permissoesComEstado('granted'),
        lerLocalizacao: () => Promise.resolve({ ok: false, falha: 'INDISPONIVEL' }),
        api: semGps.api,
      }),
    ).toBeNull();
  });
});

describe('identificarMunicipioPorGps', () => {
  it('devolve município encontrado, FORA_DA_AREA quando null e FALHA_GPS em erro', async () => {
    const lerOk = () =>
      Promise.resolve<LeituraGps>({ ok: true, ponto: { lat: -23.5, lng: -47.45 }, precisaoM: 8 });
    const apiOk = {
      GET: vi.fn().mockResolvedValue({ data: { municipio_id: SOROCABA.id } }),
    } as unknown as Api;
    expect(await identificarMunicipioPorGps(apiOk, lerOk)).toEqual({
      ok: true,
      municipioId: SOROCABA.id,
    });

    const apiFora = {
      GET: vi.fn().mockResolvedValue({ data: { municipio_id: null } }),
    } as unknown as Api;
    expect(await identificarMunicipioPorGps(apiFora, lerOk)).toEqual({
      ok: false,
      motivo: 'FORA_DA_AREA',
    });

    const lerFalha = () => Promise.resolve<LeituraGps>({ ok: false, falha: 'NEGADA' });
    expect(await identificarMunicipioPorGps(apiOk, lerFalha)).toEqual({
      ok: false,
      motivo: 'FALHA_GPS',
    });

    const apiErro = {
      GET: vi.fn().mockRejectedValue(new Error('offline')),
    } as unknown as Api;
    expect(await identificarMunicipioPorGps(apiErro, lerOk)).toEqual({
      ok: false,
      motivo: 'FALHA_GPS',
    });
  });
});
