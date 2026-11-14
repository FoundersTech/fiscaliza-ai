import { describe, expect, it, vi } from 'vitest';

import { type Exportacao, StatusExportacao } from '../domain/exportacao.js';
import {
  ConsultarExportacoes,
  type FilaExportacoes,
  GerarExportacao,
  SolicitarExportacao,
} from './exportacoes.js';
import type {
  ArquivosExportacao,
  ColetorDados,
  DadosPessoais,
  RepositorioExportacoes,
} from './portas.js';

const AGORA = new Date('2026-11-14T12:00:00.000Z');

function exportacao(mudancas: Partial<Exportacao> = {}): Exportacao {
  return {
    id: 'exp-1',
    usuarioId: 'usuario-1',
    status: StatusExportacao.PROCESSANDO,
    storageKey: null,
    solicitadaEm: AGORA,
    prontaEm: null,
    expiraEm: null,
    ...mudancas,
  };
}

function repositorio(atual: Exportacao | null = exportacao()) {
  return {
    aproveitarOuCriar: vi
      .fn<RepositorioExportacoes['aproveitarOuCriar']>()
      .mockResolvedValue({ exportacao: atual ?? exportacao(), criada: true }),
    buscar: vi.fn<RepositorioExportacoes['buscar']>().mockResolvedValue(atual),
    doUsuario: vi.fn<RepositorioExportacoes['doUsuario']>().mockResolvedValue([]),
    marcarPronta: vi.fn<RepositorioExportacoes['marcarPronta']>().mockResolvedValue(true),
    marcarFalha: vi.fn<RepositorioExportacoes['marcarFalha']>().mockResolvedValue(),
  };
}

function arquivos() {
  return {
    gravar: vi.fn<ArquivosExportacao['gravar']>().mockResolvedValue(),
    urlDeDownload: vi
      .fn<ArquivosExportacao['urlDeDownload']>()
      .mockResolvedValue('https://s3.exemplo.test/arquivo'),
    apagar: vi.fn<ArquivosExportacao['apagar']>().mockResolvedValue(),
  };
}

const DADOS: DadosPessoais = {
  conta: {
    id: 'usuario-1',
    nome: 'Maria',
    apelido_publico: 'maria',
    email: 'maria@exemplo.test',
    papel: 'CIDADAO',
    criado_em: AGORA.toISOString(),
    politica_versao: '1',
    politica_aceita_em: AGORA.toISOString(),
  },
  ocorrencias: [],
  confirmacoes: [],
  avaliacoes: [],
};

describe('SolicitarExportacao', () => {
  it('agenda a geração da exportação em andamento', async () => {
    const repo = repositorio();
    const fila = { gerar: vi.fn<FilaExportacoes['gerar']>().mockResolvedValue() };
    const solicitar = new SolicitarExportacao(repo, fila as unknown as FilaExportacoes);

    await expect(solicitar.executar('usuario-1', AGORA)).resolves.toMatchObject({ id: 'exp-1' });
    expect(fila.gerar).toHaveBeenCalledWith('exp-1');
  });

  it('não agenda nada para a que já está pronta', async () => {
    const repo = repositorio(exportacao({ status: StatusExportacao.PRONTA }));
    const fila = { gerar: vi.fn<FilaExportacoes['gerar']>() };
    const solicitar = new SolicitarExportacao(repo, fila as unknown as FilaExportacoes);

    await solicitar.executar('usuario-1', AGORA);
    expect(fila.gerar).not.toHaveBeenCalled();
  });

  it('sem Redis, o pedido é aceito e o próximo pedido agenda de novo', async () => {
    const fila = { gerar: vi.fn<FilaExportacoes['gerar']>().mockRejectedValue(new Error('fora')) };
    const solicitar = new SolicitarExportacao(repositorio(), fila as unknown as FilaExportacoes);

    await expect(solicitar.executar('usuario-1', AGORA)).resolves.toMatchObject({ id: 'exp-1' });
  });
});

describe('ConsultarExportacoes', () => {
  it('só a pronta dentro do prazo traz o link', async () => {
    const pronta = exportacao({
      status: StatusExportacao.PRONTA,
      storageKey: 'exportacoes/usuario-1/exp-1.json',
      expiraEm: new Date(AGORA.getTime() + 1000),
    });
    const arq = arquivos();
    const consultar = new ConsultarExportacoes(repositorio(pronta), arq);

    const situacao = await consultar.obter('usuario-1', 'exp-1', AGORA);
    expect(situacao.downloadUrl).toBe('https://s3.exemplo.test/arquivo');
    expect(arq.urlDeDownload).toHaveBeenCalledWith(
      'exportacoes/usuario-1/exp-1.json',
      'fiscaliza-ai-meus-dados-2026-11-14.json',
      900,
    );

    const emAndamento = new ConsultarExportacoes(repositorio(), arq);
    expect((await emAndamento.obter('usuario-1', 'exp-1', AGORA)).downloadUrl).toBeNull();
  });

  it('a de outro usuário é 404', async () => {
    const consultar = new ConsultarExportacoes(repositorio(), arquivos());

    await expect(consultar.obter('outro', 'exp-1', AGORA)).rejects.toMatchObject({
      codigo: 'EXPORTACAO_NAO_ENCONTRADA',
      status: 404,
    });
  });
});

describe('GerarExportacao', () => {
  function montar(atual: Exportacao | null = exportacao(), dados: DadosPessoais | null = DADOS) {
    const repo = repositorio(atual);
    const arq = arquivos();
    const coletor = { coletar: vi.fn<ColetorDados['coletar']>().mockResolvedValue(dados) };
    return { gerar: new GerarExportacao(repo, arq, coletor), repo, arq, coletor };
  }

  it('grava o JSON e marca como pronta por 7 dias', async () => {
    const { gerar, repo, arq } = montar();

    await gerar.executar('exp-1', AGORA);

    const chave = 'exportacoes/usuario-1/exp-1.json';
    const [gravada, json] = arq.gravar.mock.calls[0] ?? [];
    expect(gravada).toBe(chave);
    expect(JSON.parse(json ?? '')).toMatchObject({ gerado_em: AGORA.toISOString(), ...DADOS });
    expect(repo.marcarPronta).toHaveBeenCalledWith(
      'exp-1',
      chave,
      AGORA,
      new Date('2026-11-21T12:00:00.000Z'),
    );
  });

  it('ignora a que sumiu ou já foi decidida', async () => {
    for (const atual of [null, exportacao({ status: StatusExportacao.PRONTA })]) {
      const { gerar, arq, coletor } = montar(atual);
      await gerar.executar('exp-1', AGORA);
      expect(coletor.coletar).not.toHaveBeenCalled();
      expect(arq.gravar).not.toHaveBeenCalled();
    }
  });

  it('conta anonimizada no meio do caminho: falha sem gravar nada', async () => {
    const { gerar, repo, arq } = montar(exportacao(), null);

    await gerar.executar('exp-1', AGORA);
    expect(arq.gravar).not.toHaveBeenCalled();
    expect(repo.marcarFalha).toHaveBeenCalledWith('exp-1');
  });

  it('se a exportação foi apagada enquanto o arquivo era gravado, apaga o arquivo', async () => {
    const { gerar, repo, arq } = montar();
    repo.marcarPronta.mockResolvedValue(false);

    await gerar.executar('exp-1', AGORA);
    expect(arq.apagar).toHaveBeenCalledWith('exportacoes/usuario-1/exp-1.json');
  });
});
