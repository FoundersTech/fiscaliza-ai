import type { components } from '@fiscaliza/contratos';

import type { Papel } from '@/stores/auth';

import type { Api } from './api';
import { type ErroApi, lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';

export type Orgao = components['schemas']['OrgaoResposta'];
export type Agente = components['schemas']['AgenteResposta'];
export type Gestor = components['schemas']['GestorResposta'];
export type ConviteGestor = components['schemas']['ConviteGestorDto'];
export type CategoriaAdmin = components['schemas']['CategoriaAdminResposta'];
export type DadosCategoria = components['schemas']['NovaCategoriaDto'];
export type FotoRevisao = components['schemas']['FotoRevisaoResposta'];
export type PaginaFotos = components['schemas']['RevisaoFotosResposta'];
export type Moderacao = FotoRevisao['moderacao'];

export interface Convite {
  nome: string;
  email: string;
}

/** Ação de admin: os dados, ou a mensagem para a tela e os erros de cada campo. */
export type Resultado<T> =
  | { ok: true; dados: T }
  | { ok: false; codigo: string | null; mensagem: string; campos: Record<string, string> };

// ---------------------------------------------------------------------------------------------
// Navegação

export interface TelaAdmin {
  rotulo: string;
  icone: string;
  rota: string;
}

const TELAS_ADMIN: Partial<Record<Papel, readonly TelaAdmin[]>> = {
  ADMIN_MUNICIPIO: [
    { rotulo: 'Órgão', icone: 'sym_o_account_balance', rota: '/admin/orgao' },
    { rotulo: 'Agentes', icone: 'sym_o_badge', rota: '/admin/agentes' },
  ],
  ADMIN_PLATAFORMA: [
    { rotulo: 'Categorias', icone: 'sym_o_category', rota: '/admin/categorias' },
    { rotulo: 'Gestores', icone: 'sym_o_supervisor_account', rota: '/admin/gestores' },
    { rotulo: 'Fotos', icone: 'sym_o_photo_library', rota: '/admin/fotos' },
  ],
};

/** As telas de administração que o papel abre (nenhuma para cidadão e agente). */
export function telasAdmin(papel: Papel | null): readonly TelaAdmin[] {
  return (papel && TELAS_ADMIN[papel]) || [];
}

/** Para onde leva o atalho "Administração"; null quando o papel não administra nada. */
export function inicioAdmin(papel: Papel | null): string | null {
  return telasAdmin(papel)[0]?.rota ?? null;
}

// ---------------------------------------------------------------------------------------------
// Erros

/** Erros de negócio que pertencem a um campo do formulário. */
const CAMPO_DO_CODIGO: Record<string, string> = {
  EMAIL_EM_USO: 'email',
  SLUG_EM_USO: 'slug',
  MUNICIPIO_INEXISTENTE: 'municipio_id',
};

/**
 * A primeira mensagem de cada campo: as da validação (422 VALIDACAO e SCHEMA_INVALIDO trazem
 * `detalhes.campos`) e a do erro de negócio ligado a um campo, como o e-mail já usado.
 */
export function camposDoErro(erro: ErroApi | null): Record<string, string> {
  if (!erro) return {};
  const campoDoCodigo = CAMPO_DO_CODIGO[erro.codigo];
  if (campoDoCodigo) return { [campoDoCodigo]: erro.mensagem };
  const campos = erro.detalhes['campos'];
  if (typeof campos !== 'object' || campos === null) return {};
  return Object.fromEntries(
    Object.entries(campos).flatMap(([campo, mensagens]: [string, unknown]) => {
      const primeira: unknown = Array.isArray(mensagens) ? mensagens[0] : undefined;
      return typeof primeira === 'string' ? [[campo, comMaiuscula(primeira)]] : [];
    }),
  );
}

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

interface RespostaApi<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

async function chamar<T>(
  pedido: () => Promise<RespostaApi<T>>,
  padrao: string,
): Promise<Resultado<T>> {
  try {
    const { data, error, response } = await pedido();
    if (response.ok) return { ok: true, dados: data as T };
    const erro = lerErroApi(error);
    return {
      ok: false,
      codigo: erro?.codigo ?? null,
      mensagem: mensagemDoErro(erro, padrao),
      campos: camposDoErro(erro),
    };
  } catch {
    return { ok: false, codigo: null, mensagem: MENSAGEM_SEM_CONEXAO, campos: {} };
  }
}

// ---------------------------------------------------------------------------------------------
// Órgão e agentes (gestor do município)

export const SIGLA_REGEX = /^[A-Z0-9]{2,10}$/;

export function carregarOrgao(api: Api): Promise<Resultado<Orgao>> {
  return chamar(() => api.GET('/api/v1/admin/orgao'), 'Não foi possível carregar o órgão.');
}

/** Só manda o que mudou; sem mudança, nem chama a API. */
export function editarOrgao(
  api: Api,
  atual: Orgao,
  novo: { nome: string; sigla: string },
): Promise<Resultado<Orgao>> {
  const body: { nome?: string; sigla?: string } = {};
  const nome = novo.nome.trim();
  const sigla = novo.sigla.trim().toUpperCase();
  if (nome !== atual.nome) body.nome = nome;
  if (sigla !== atual.sigla) body.sigla = sigla;
  if (!Object.keys(body).length) return Promise.resolve({ ok: true, dados: atual });
  return chamar(
    () => api.PATCH('/api/v1/admin/orgao', { body }),
    'Não foi possível salvar o órgão.',
  );
}

export function listarAgentes(api: Api): Promise<Resultado<Agente[]>> {
  return chamar(() => api.GET('/api/v1/admin/agentes'), 'Não foi possível carregar os agentes.');
}

export function convidarAgente(api: Api, convite: Convite): Promise<Resultado<Agente>> {
  return chamar(
    () =>
      api.POST('/api/v1/admin/agentes', {
        body: { nome: convite.nome.trim(), email: convite.email.trim() },
      }),
    'Não foi possível convidar o agente.',
  );
}

export function alterarAgente(api: Api, id: string, ativo: boolean): Promise<Resultado<Agente>> {
  return chamar(
    () => api.PATCH('/api/v1/admin/agentes/{id}', { params: { path: { id } }, body: { ativo } }),
    ativo ? 'Não foi possível reativar o agente.' : 'Não foi possível desativar o agente.',
  );
}

/** A lista em ordem de nome, com o agente novo ou alterado no lugar certo. */
export function comAgente(agentes: readonly Agente[], agente: Agente): Agente[] {
  return [...agentes.filter((outro) => outro.id !== agente.id), agente].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

// ---------------------------------------------------------------------------------------------
// Gestores, categorias e fotos (admin da plataforma)

export function convidarGestor(api: Api, convite: ConviteGestor): Promise<Resultado<Gestor>> {
  return chamar(
    () =>
      api.POST('/api/v1/admin/gestores', {
        body: {
          nome: convite.nome.trim(),
          email: convite.email.trim(),
          municipio_id: convite.municipio_id,
        },
      }),
    'Não foi possível convidar o gestor.',
  );
}

export function listarCategorias(api: Api): Promise<Resultado<CategoriaAdmin[]>> {
  return chamar(
    () => api.GET('/api/v1/admin/categorias'),
    'Não foi possível carregar as categorias.',
  );
}

/** Cria (sem id) ou edita (com id) a categoria, mandando o cadastro inteiro. */
export function salvarCategoria(
  api: Api,
  id: number | null,
  dados: DadosCategoria,
): Promise<Resultado<CategoriaAdmin>> {
  const padrao = 'Não foi possível salvar a categoria.';
  return id === null
    ? chamar(() => api.POST('/api/v1/admin/categorias', { body: dados }), padrao)
    : chamar(
        () =>
          api.PATCH('/api/v1/admin/categorias/{id}', {
            params: { path: { id } },
            body: dados,
          }),
        padrao,
      );
}

/** A lista em ordem de nome, com a categoria nova ou alterada no lugar certo. */
export function comCategoria(
  categorias: readonly CategoriaAdmin[],
  categoria: CategoriaAdmin,
): CategoriaAdmin[] {
  return [...categorias.filter((outra) => outra.id !== categoria.id), categoria].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

export const FOTOS_POR_PAGINA = 24;
export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 500;

export function listarFotos(
  api: Api,
  moderacao: Moderacao,
  cursor: string | null = null,
): Promise<Resultado<PaginaFotos>> {
  return chamar(
    () =>
      api.GET('/api/v1/admin/fotos', {
        params: {
          query: { moderacao, limite: FOTOS_POR_PAGINA, ...(cursor ? { cursor } : {}) },
        },
      }),
    'Não foi possível carregar as fotos.',
  );
}

export function problemaDoMotivo(motivo: string): string | null {
  const tamanho = motivo.trim().length;
  if (tamanho < MOTIVO_MIN) return `Explique o motivo com pelo menos ${MOTIVO_MIN} caracteres`;
  if (tamanho > MOTIVO_MAX) return `O motivo aceita até ${MOTIVO_MAX} caracteres`;
  return null;
}

export function rejeitarFoto(api: Api, id: string, motivo: string): Promise<Resultado<void>> {
  return chamar(
    () =>
      api.POST('/api/v1/admin/fotos/{id}/rejeicao', {
        params: { path: { id } },
        body: { motivo: motivo.trim() },
      }),
    'Não foi possível remover a foto.',
  );
}
