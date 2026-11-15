import { describe, expect, it, vi } from 'vitest';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { CriarCategoria, EditarCategoria, type NovaCategoria } from './categorias.js';
import type { Categoria, RepositorioCategorias } from './portas.js';

const POSTE = {
  chave: 'numero_poste',
  rotulo: 'Número do poste',
  tipo: 'texto',
  obrigatorio: false,
  max: 20,
} as const;

const ILUMINACAO: Categoria = {
  id: 2,
  slug: 'iluminacao',
  nome: 'Iluminação',
  icone: 'lightbulb',
  slaDias: 15,
  schemaAtributos: [],
  ativa: true,
};

function montar() {
  const repositorio = {
    listar: vi.fn<RepositorioCategorias['listar']>(),
    buscar: vi.fn<RepositorioCategorias['buscar']>().mockResolvedValue(ILUMINACAO),
    criar: vi
      .fn<RepositorioCategorias['criar']>()
      .mockImplementation((dados) => Promise.resolve({ id: 9, ...dados })),
    atualizar: vi
      .fn<RepositorioCategorias['atualizar']>()
      .mockImplementation((id, dados) => Promise.resolve({ ...ILUMINACAO, id, ...dados })),
  };
  return {
    criar: new CriarCategoria(repositorio),
    editar: new EditarCategoria(repositorio),
    repositorio,
  };
}

function nova(mudancas: Partial<NovaCategoria> = {}): NovaCategoria {
  return {
    slug: 'sugestao',
    nome: 'Sugestão',
    icone: 'lightbulb_outline',
    slaDias: 30,
    schemaAtributos: [],
    ...mudancas,
  };
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroAplicacao> {
  const erro = await promessa.then(
    () => null,
    (falha: unknown) => falha,
  );
  expect(erro).toBeInstanceOf(ErroAplicacao);
  return erro as ErroAplicacao;
}

describe('CriarCategoria', () => {
  it('nasce ativa, com o schema de atributos já normalizado', async () => {
    const { criar, repositorio } = montar();

    const categoria = await criar.executar(
      nova({ schemaAtributos: [{ ...POSTE, rotulo: '  Número do poste  ' }] }),
    );

    expect(categoria.ativa).toBe(true);
    expect(repositorio.criar).toHaveBeenCalledWith({
      slug: 'sugestao',
      nome: 'Sugestão',
      icone: 'lightbulb_outline',
      slaDias: 30,
      schemaAtributos: [POSTE],
      ativa: true,
    });
  });

  it('pode nascer inativa', async () => {
    const { criar } = montar();

    expect((await criar.executar(nova({ ativa: false }))).ativa).toBe(false);
  });

  it.each([
    ['chave fora do formato', [{ ...POSTE, chave: 'Número' }]],
    ['tipo desconhecido', [{ ...POSTE, tipo: 'data' }]],
    ['texto sem max', [{ chave: 'obs', rotulo: 'Obs', tipo: 'texto', obrigatorio: false }]],
    ['chave repetida', [POSTE, POSTE]],
    [
      'opção sem opções',
      [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'opcao', obrigatorio: true, opcoes: [] }],
    ],
    ['não é lista', { numero_poste: 'texto' }],
  ])('schema inválido (%s): 422 SCHEMA_INVALIDO, sem gravar', async (_caso, schema) => {
    const { criar, repositorio } = montar();

    const erro = await erroDe(criar.executar(nova({ schemaAtributos: schema })));

    expect(erro).toMatchObject({ codigo: 'SCHEMA_INVALIDO', status: 422 });
    expect(Object.keys(erro.detalhes['campos'] as object)[0]).toMatch(/^schema_atributos/);
    expect(repositorio.criar).not.toHaveBeenCalled();
  });
});

describe('EditarCategoria', () => {
  it('muda só os campos enviados; ausentes e nulos ficam como estão', async () => {
    const { editar, repositorio } = montar();

    await editar.executar(2, { ativa: false, nome: undefined, slaDias: null as unknown as number });

    expect(repositorio.atualizar).toHaveBeenCalledWith(2, { ativa: false });
  });

  it('valida o schema novo antes de gravar', async () => {
    const { editar, repositorio } = montar();

    const erro = await erroDe(editar.executar(2, { schemaAtributos: [{ chave: 'x' }] }));

    expect(erro.codigo).toBe('SCHEMA_INVALIDO');
    expect(repositorio.atualizar).not.toHaveBeenCalled();
  });

  it('sem nenhum campo, devolve a categoria como está', async () => {
    const { editar, repositorio } = montar();

    expect(await editar.executar(2, {})).toEqual(ILUMINACAO);
    expect(repositorio.atualizar).not.toHaveBeenCalled();
  });

  it('categoria inexistente: 404', async () => {
    const { editar, repositorio } = montar();
    repositorio.atualizar.mockResolvedValue(null);

    const erro = await erroDe(editar.executar(77, { ativa: false }));

    expect(erro).toMatchObject({ codigo: 'NAO_ENCONTRADA', status: 404 });
  });

  it.each([0, -1, 40_000])('id %i fora do intervalo: 404 sem ir ao banco', async (id) => {
    const { editar, repositorio } = montar();

    const erro = await erroDe(editar.executar(id, { ativa: false }));

    expect(erro.status).toBe(404);
    expect(repositorio.atualizar).not.toHaveBeenCalled();
    expect(repositorio.buscar).not.toHaveBeenCalled();
  });
});
