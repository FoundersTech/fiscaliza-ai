import type { components } from '@fiscaliza/contratos';

import type { Api } from '@/services/api';
import { type LeituraGps, lerGps, type Ponto } from '@/services/localizacao';
import type { Armazenamento } from '@/services/tema';

export type Municipio = components['schemas']['MunicipioResposta'];
export type Limites = Municipio['bbox'];

/** Quem escolheu a cidade: a pessoa, no seletor, ou o app, pela localização. */
export type OrigemMunicipio = 'MANUAL' | 'LOCALIZACAO';

export interface EscolhaMunicipio {
  id: number;
  origem: OrigemMunicipio;
}

const CHAVE = 'fa:municipio';

function idValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

function origemValida(valor: unknown): valor is OrigemMunicipio {
  return valor === 'MANUAL' || valor === 'LOCALIZACAO';
}

/**
 * A cidade escolhida da última vez e quem a escolheu; null sem escolha salva, com valor estranho
 * ou com o armazenamento bloqueado. Um número sozinho é o formato antigo e conta como escolha
 * da pessoa.
 */
export function lerEscolhaSalva(armazenamento: Armazenamento | undefined): EscolhaMunicipio | null {
  try {
    const bruto = armazenamento?.getItem(CHAVE);
    if (bruto === null || bruto === undefined) return null;
    const valor: unknown = JSON.parse(bruto);
    if (idValido(valor)) return { id: valor, origem: 'MANUAL' };
    if (typeof valor !== 'object' || valor === null) return null;
    const { id, origem } = valor as Record<string, unknown>;
    return idValido(id) && origemValida(origem) ? { id, origem } : null;
  } catch {
    return null;
  }
}

/** A cidade escolhida da última vez; null sem escolha salva ou com o armazenamento bloqueado. */
export function lerMunicipioSalvo(armazenamento: Armazenamento | undefined): number | null {
  return lerEscolhaSalva(armazenamento)?.id ?? null;
}

export function salvarMunicipio(
  armazenamento: Armazenamento | undefined,
  id: number,
  origem: OrigemMunicipio = 'MANUAL',
): void {
  try {
    armazenamento?.setItem(CHAVE, JSON.stringify({ id, origem } satisfies EscolhaMunicipio));
  } catch {
    // Sem armazenamento, a escolha vale até fechar o app.
  }
}

/** Código IBGE da cidade atendida que contém o ponto; null fora delas ou se a API falhar. */
export async function consultarMunicipioPorPonto(api: Api, ponto: Ponto): Promise<number | null> {
  try {
    const { data } = await api.GET('/api/v1/geo/municipio', { params: { query: ponto } });
    return data?.municipio_id ?? null;
  } catch {
    return null;
  }
}

export interface DepsDeteccaoMunicipio {
  armazenamento?: Armazenamento | undefined;
  permissoes?: Permissions | undefined;
  lerLocalizacao?: (() => Promise<LeituraGps>) | undefined;
  api: Api;
}

/**
 * Cidade pela localização ao abrir o app, sem incomodar: só lê o GPS se a permissão já foi
 * dada e nunca troca uma cidade que a pessoa escolheu. Qualquer falha devolve null.
 */
export async function detectarMunicipioInicial(
  deps: DepsDeteccaoMunicipio,
): Promise<number | null> {
  if (lerEscolhaSalva(deps.armazenamento)?.origem === 'MANUAL') return null;
  const permissoes = deps.permissoes;
  if (typeof permissoes?.query !== 'function') return null;
  try {
    const { state } = await permissoes.query({ name: 'geolocation' });
    if (state !== 'granted') return null;
    const leitura = await (deps.lerLocalizacao ?? (() => lerGps()))();
    if (!leitura.ok) return null;
    return await consultarMunicipioPorPonto(deps.api, leitura.ponto);
  } catch {
    return null;
  }
}

export type IdentificacaoMunicipio =
  { ok: true; municipioId: number } | { ok: false; motivo: 'FORA_DA_AREA' | 'FALHA_GPS' };

/**
 * Cidade pela localização quando a pessoa pede. FORA_DA_AREA só quando a API respondeu que o
 * ponto não está em nenhuma cidade atendida; GPS sem resposta ou API fora do ar são FALHA_GPS.
 */
export async function identificarMunicipioPorGps(
  api: Api,
  lerLocalizacao: () => Promise<LeituraGps> = () => lerGps(),
): Promise<IdentificacaoMunicipio> {
  try {
    const leitura = await lerLocalizacao();
    if (!leitura.ok) return { ok: false, motivo: 'FALHA_GPS' };
    const { data } = await api.GET('/api/v1/geo/municipio', {
      params: { query: leitura.ponto },
    });
    if (!data) return { ok: false, motivo: 'FALHA_GPS' };
    return data.municipio_id === null
      ? { ok: false, motivo: 'FORA_DA_AREA' }
      : { ok: true, municipioId: data.municipio_id };
  } catch {
    return { ok: false, motivo: 'FALHA_GPS' };
  }
}

/**
 * A cidade que as telas mostram: a escolhida, se ainda for atendida; senão a primeira da lista.
 * Uma cidade desativada depois de escolhida não deixa o app sem cidade.
 */
export function escolherMunicipio(
  municipios: readonly Municipio[],
  escolhido: number | null,
): Municipio | null {
  return municipios.find((municipio) => municipio.id === escolhido) ?? municipios[0] ?? null;
}

/** Retângulo que cobre todas as cidades atendidas; null sem cidade nenhuma. */
export function limitesDeTodos(municipios: readonly Municipio[]): Limites | null {
  if (municipios.length === 0) return null;
  return {
    sul: Math.min(...municipios.map((municipio) => municipio.bbox.sul)),
    oeste: Math.min(...municipios.map((municipio) => municipio.bbox.oeste)),
    norte: Math.max(...municipios.map((municipio) => municipio.bbox.norte)),
    leste: Math.max(...municipios.map((municipio) => municipio.bbox.leste)),
  };
}

export function rotuloMunicipio(municipio: Pick<Municipio, 'nome' | 'uf'>): string {
  return `${municipio.nome} · ${municipio.uf}`;
}
