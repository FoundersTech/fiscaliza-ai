import { describe, expect, it, vi } from 'vitest';

import {
  type Agente,
  alterarAgente,
  camposDoErro,
  comAgente,
  convidarAgente,
  convidarGestor,
  editarOrgao,
  inicioAdmin,
  listarFotos,
  type Orgao,
  problemaDoMotivo,
  rejeitarFoto,
  salvarCategoria,
  telasAdmin,
} from './administracao';
import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';

type Chamada = (caminho: string, opcoes?: unknown) => Promise<unknown>;

function resposta(status: number, corpo?: unknown) {
  const ok = status >= 200 && status < 300;
  return Promise.resolve({
    data: ok ? corpo : undefined,
    error: ok ? undefined : corpo,
    response: new Response(null, { status }),
  });
}

function erro(status: number, codigo: string, mensagem: string, detalhes = {}) {
  return resposta(status, { codigo, mensagem, detalhes });
}

/** API falsa: cada método responde o que o teste mandar. */
function montar(responder: () => Promise<unknown> = () => resposta(200, {})) {
  const GET = vi.fn<Chamada>(responder);
  const POST = vi.fn<Chamada>(responder);
  const PATCH = vi.fn<Chamada>(responder);
  return { api: { GET, POST, PATCH } as unknown as Api, GET, POST, PATCH };
}

const ORGAO: Orgao = { id: 1, municipio_id: 3552205, nome: 'Prefeitura de Sorocaba', sigla: 'PMS' };

const agente = (nome: string, mudancas: Partial<Agente> = {}): Agente => ({
  id: `id-${nome}`,
  nome,
  email: `${nome.toLowerCase()}@sorocaba.sp.gov.br`,
  ativo: true,
  convite_pendente: true,
  ...mudancas,
});

describe('telas de administração por papel', () => {
  it('o gestor do município cuida do órgão e dos agentes', () => {
    expect(telasAdmin('ADMIN_MUNICIPIO').map((tela) => tela.rota)).toEqual([
      '/admin/orgao',
      '/admin/agentes',
    ]);
    expect(inicioAdmin('ADMIN_MUNICIPIO')).toBe('/admin/orgao');
  });

  it('o admin da plataforma cuida das categorias, dos gestores e das fotos', () => {
    expect(telasAdmin('ADMIN_PLATAFORMA').map((tela) => tela.rota)).toEqual([
      '/admin/categorias',
      '/admin/gestores',
      '/admin/fotos',
    ]);
    expect(inicioAdmin('ADMIN_PLATAFORMA')).toBe('/admin/categorias');
  });

  it.each(['CIDADAO', 'AGENTE_ORGAO', null] as const)('%s não vê o atalho', (papel) => {
    expect(telasAdmin(papel)).toEqual([]);
    expect(inicioAdmin(papel)).toBeNull();
  });
});

describe('camposDoErro', () => {
  it('pega a primeira mensagem de cada campo da validação, com maiúscula', () => {
    expect(
      camposDoErro({
        codigo: 'VALIDACAO',
        mensagem: 'Dados inválidos.',
        detalhes: { campos: { sigla: ['a sigla deve ter de 2 a 10 letras', 'outra'] } },
      }),
    ).toEqual({ sigla: 'A sigla deve ter de 2 a 10 letras' });
  });

  it('põe o erro de negócio no campo a que ele se refere', () => {
    const emUso = { codigo: 'EMAIL_EM_USO', mensagem: 'E-mail já cadastrado.', detalhes: {} };
    expect(camposDoErro(emUso)).toEqual({ email: 'E-mail já cadastrado.' });
    expect(camposDoErro({ codigo: 'SLUG_EM_USO', mensagem: 'Slug em uso.', detalhes: {} })).toEqual(
      { slug: 'Slug em uso.' },
    );
  });

  it('erro sem campos não aponta campo nenhum', () => {
    expect(camposDoErro({ codigo: 'ACESSO_NEGADO', mensagem: 'Não.', detalhes: {} })).toEqual({});
    expect(camposDoErro(null)).toEqual({});
  });
});

describe('órgão', () => {
  it('manda só o que mudou, com a sigla em maiúsculas', async () => {
    const { api, PATCH } = montar(() => resposta(200, { ...ORGAO, sigla: 'SEMOB' }));

    const resultado = await editarOrgao(api, ORGAO, { nome: ORGAO.nome, sigla: ' semob ' });

    expect(PATCH).toHaveBeenCalledWith('/api/v1/admin/orgao', { body: { sigla: 'SEMOB' } });
    expect(resultado).toEqual({ ok: true, dados: { ...ORGAO, sigla: 'SEMOB' } });
  });

  it('sem mudança, nem chama a API', async () => {
    const { api, PATCH } = montar();
    expect(
      await editarOrgao(api, ORGAO, { nome: ' Prefeitura de Sorocaba ', sigla: 'pms' }),
    ).toEqual({ ok: true, dados: ORGAO });
    expect(PATCH).not.toHaveBeenCalled();
  });

  it('a sigla recusada pela API vira erro do campo', async () => {
    const { api } = montar(() =>
      erro(422, 'VALIDACAO', 'Dados inválidos.', { campos: { sigla: ['sigla inválida'] } }),
    );
    expect(await editarOrgao(api, ORGAO, { nome: ORGAO.nome, sigla: 'AB' })).toMatchObject({
      ok: false,
      campos: { sigla: 'Sigla inválida' },
    });
  });
});

describe('agentes', () => {
  it('convida com nome e e-mail sem espaços nas pontas', async () => {
    const novo = agente('Ana');
    const { api, POST } = montar(() => resposta(201, novo));

    const resultado = await convidarAgente(api, {
      nome: ' Ana ',
      email: ' ana@sorocaba.sp.gov.br ',
    });

    expect(POST).toHaveBeenCalledWith('/api/v1/admin/agentes', {
      body: { nome: 'Ana', email: 'ana@sorocaba.sp.gov.br' },
    });
    expect(resultado).toEqual({ ok: true, dados: novo });
  });

  it('o e-mail já usado aparece no campo de e-mail', async () => {
    const { api } = montar(() => erro(409, 'EMAIL_EM_USO', 'Este e-mail já tem uma conta.'));
    expect(await convidarAgente(api, { nome: 'Ana', email: 'ana@x.com' })).toEqual({
      ok: false,
      codigo: 'EMAIL_EM_USO',
      mensagem: 'Este e-mail já tem uma conta.',
      campos: { email: 'Este e-mail já tem uma conta.' },
    });
  });

  it('desativa e reativa pelo PATCH do agente', async () => {
    const { api, PATCH } = montar(() => resposta(200, agente('Ana', { ativo: false })));
    await alterarAgente(api, 'id-Ana', false);
    expect(PATCH).toHaveBeenCalledWith('/api/v1/admin/agentes/{id}', {
      params: { path: { id: 'id-Ana' } },
      body: { ativo: false },
    });
  });

  it('sem conexão, avisa sem lançar', async () => {
    const { api } = montar(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await alterarAgente(api, 'id-Ana', true)).toMatchObject({
      ok: false,
      mensagem: MENSAGEM_SEM_CONEXAO,
    });
  });

  it('a lista fica em ordem de nome, com o agente alterado no lugar do antigo', () => {
    const lista = [agente('Bruna'), agente('Carlos')];
    const alterada = comAgente(lista, agente('Bruna', { ativo: false }));
    expect(alterada.map((item) => [item.nome, item.ativo])).toEqual([
      ['Bruna', false],
      ['Carlos', true],
    ]);
    expect(comAgente(lista, agente('Álvaro')).map((item) => item.nome)).toEqual([
      'Álvaro',
      'Bruna',
      'Carlos',
    ]);
  });
});

describe('gestores', () => {
  it('convida para o município escolhido', async () => {
    const { api, POST } = montar(() =>
      resposta(201, { id: 'g1', nome: 'Gil', email: 'gil@x.com', municipio_id: 3552205 }),
    );
    const resultado = await convidarGestor(api, {
      nome: 'Gil',
      email: 'gil@x.com',
      municipio_id: 3552205,
    });
    expect(POST).toHaveBeenCalledWith('/api/v1/admin/gestores', {
      body: { nome: 'Gil', email: 'gil@x.com', municipio_id: 3552205 },
    });
    expect(resultado.ok).toBe(true);
  });

  it('município inexistente vira erro do campo do município', async () => {
    const { api } = montar(() => erro(422, 'MUNICIPIO_INEXISTENTE', 'Município não cadastrado.'));
    expect(
      await convidarGestor(api, { nome: 'Gil', email: 'gil@x.com', municipio_id: 1 }),
    ).toMatchObject({ ok: false, campos: { municipio_id: 'Município não cadastrado.' } });
  });
});

describe('categorias', () => {
  const dados = {
    slug: 'sugestao',
    nome: 'Sugestão',
    icone: 'lightbulb',
    sla_dias: 30,
    ativa: true,
    schema_atributos: [],
  };

  it('sem id cria pelo POST; com id edita pelo PATCH', async () => {
    const { api, POST, PATCH } = montar(() => resposta(200, { id: 9, ...dados }));

    await salvarCategoria(api, null, dados);
    await salvarCategoria(api, 9, { ...dados, ativa: false });

    expect(POST).toHaveBeenCalledWith('/api/v1/admin/categorias', { body: dados });
    expect(PATCH).toHaveBeenCalledWith('/api/v1/admin/categorias/{id}', {
      params: { path: { id: 9 } },
      body: { ...dados, ativa: false },
    });
  });

  it('o schema recusado traz os erros de cada campo extra', async () => {
    const { api } = montar(() =>
      erro(422, 'SCHEMA_INVALIDO', 'O schema de atributos da categoria é inválido.', {
        campos: { 'schema_atributos.0.chave': ['use de 2 a 30 letras minúsculas ou _'] },
      }),
    );
    expect(await salvarCategoria(api, 9, dados)).toMatchObject({
      ok: false,
      codigo: 'SCHEMA_INVALIDO',
      campos: { 'schema_atributos.0.chave': 'Use de 2 a 30 letras minúsculas ou _' },
    });
  });
});

describe('fotos', () => {
  it('lista as publicadas e continua pelo cursor', async () => {
    const { api, GET } = montar(() => resposta(200, { itens: [], proximo_cursor: null }));

    await listarFotos(api, 'APROVADA');
    await listarFotos(api, 'APROVADA', 'abc');

    expect(GET).toHaveBeenNthCalledWith(1, '/api/v1/admin/fotos', {
      params: { query: { moderacao: 'APROVADA', limite: 24 } },
    });
    expect(GET).toHaveBeenNthCalledWith(2, '/api/v1/admin/fotos', {
      params: { query: { moderacao: 'APROVADA', limite: 24, cursor: 'abc' } },
    });
  });

  it('remove a foto com o motivo, e o 204 é sucesso', async () => {
    const { api, POST } = montar(() => resposta(204));
    expect(await rejeitarFoto(api, 'f1', '  Mostra o rosto de uma pessoa ')).toEqual({
      ok: true,
      dados: undefined,
    });
    expect(POST).toHaveBeenCalledWith('/api/v1/admin/fotos/{id}/rejeicao', {
      params: { path: { id: 'f1' } },
      body: { motivo: 'Mostra o rosto de uma pessoa' },
    });
  });

  it('foto ainda em análise mostra a mensagem da API', async () => {
    const { api } = montar(() =>
      erro(409, 'FOTO_EM_ANALISE', 'A foto ainda está sendo processada.'),
    );
    expect(await rejeitarFoto(api, 'f1', 'Imprópria')).toMatchObject({
      ok: false,
      codigo: 'FOTO_EM_ANALISE',
      mensagem: 'A foto ainda está sendo processada.',
    });
  });

  it.each([
    ['ok', 'Explique o motivo com pelo menos 3 caracteres'],
    ['   ab  ', 'Explique o motivo com pelo menos 3 caracteres'],
    ['abc', null],
    ['x'.repeat(501), 'O motivo aceita até 500 caracteres'],
  ])('o motivo %j dá %j', (motivo, esperado) => {
    expect(problemaDoMotivo(motivo)).toBe(esperado);
  });
});
