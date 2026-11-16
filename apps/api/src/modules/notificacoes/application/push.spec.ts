import { describe, expect, it, vi } from 'vitest';

import { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';
import type { ConsultasAlertas, DestinatariosDoEvento, LinhaAlerta } from './alertas.js';
import type { InscricaoPush, RepositorioPush } from './portas.js';
import { CancelarPush, EnviarPushEvento, InscreverPush, mensagemDaMudanca } from './push.js';
import type { MensagemPush, PushPort, ResultadoPush } from './push.port.js';

const AGORA = new Date('2026-11-16T03:00:00Z');
const OCORRENCIA_ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';

function linha(mudancas: Partial<LinhaAlerta> = {}): LinhaAlerta {
  return {
    eventoId: 10,
    ocorrenciaId: OCORRENCIA_ID,
    protocolo: 'FA-2026-SOR-000123',
    deStatus: StatusOcorrencia.RECEBIDA,
    paraStatus: StatusOcorrencia.EM_ANALISE,
    criadoEm: AGORA,
    ...mudancas,
  };
}

function inscricao(id: string, usuarioId: string): InscricaoPush {
  return {
    id,
    usuarioId,
    endpoint: `https://push.exemplo.test/${id}`,
    p256dh: `p256dh-${id}`,
    auth: `auth-${id}`,
  };
}

describe('mensagemDaMudanca', () => {
  it('monta título, corpo e url da ocorrência para cada mudança', () => {
    expect(mensagemDaMudanca(linha())).toEqual({
      titulo: 'Ocorrência FA-2026-SOR-000123',
      corpo: 'Está em andamento na prefeitura.',
      url: `/ocorrencias/${OCORRENCIA_ID}`,
    });
    expect(mensagemDaMudanca(linha({ paraStatus: StatusOcorrencia.RESOLVIDA })).corpo).toBe(
      'Foi resolvida pela prefeitura.',
    );
    expect(
      mensagemDaMudanca(
        linha({ deStatus: StatusOcorrencia.RESOLVIDA, paraStatus: StatusOcorrencia.EM_ANALISE }),
      ).corpo,
    ).toBe('Foi reaberta e voltou para análise da prefeitura.');
    expect(mensagemDaMudanca(linha({ paraStatus: StatusOcorrencia.RECUSADA })).corpo).toContain(
      'recusada',
    );
    expect(mensagemDaMudanca(linha({ paraStatus: StatusOcorrencia.DUPLICADA })).corpo).toContain(
      'repetida',
    );
  });
});

describe('InscreverPush e CancelarPush', () => {
  it('salva e remove a inscrição do usuário no repositório', async () => {
    const salvar = vi.fn<RepositorioPush['salvar']>(() => Promise.resolve());
    const removerDoUsuario = vi.fn<RepositorioPush['removerDoUsuario']>(() => Promise.resolve());
    const repositorio: RepositorioPush = {
      salvar,
      removerDoUsuario,
      dosUsuarios: () => Promise.resolve([]),
      apagar: () => Promise.resolve(),
      registrarErro: () => Promise.resolve(),
    };

    await new InscreverPush(repositorio).executar('u1', {
      endpoint: 'https://push.exemplo.test/1',
      p256dh: 'chave',
      auth: 'segredo',
    });
    expect(salvar).toHaveBeenCalledWith('u1', {
      endpoint: 'https://push.exemplo.test/1',
      p256dh: 'chave',
      auth: 'segredo',
    });

    await new CancelarPush(repositorio).executar('u1', 'https://push.exemplo.test/1');
    expect(removerDoUsuario).toHaveBeenCalledWith('u1', 'https://push.exemplo.test/1');
  });
});

describe('EnviarPushEvento', () => {
  function preparar(opcoes: {
    destinatarios?: string[];
    mudanca?: LinhaAlerta | null;
    inscricoes?: InscricaoPush[];
    respostas?: Record<string, ResultadoPush | Error>;
  }) {
    const apagar = vi.fn<RepositorioPush['apagar']>(() => Promise.resolve());
    const registrarErro = vi.fn<RepositorioPush['registrarErro']>(() => Promise.resolve());
    const enviar = vi.fn<PushPort['enviar']>((destino) => {
      const id = destino.endpoint.split('/').pop()!;
      const resposta = opcoes.respostas?.[id] ?? 'ENVIADO';
      if (resposta instanceof Error) return Promise.reject(resposta);
      return Promise.resolve(resposta);
    });

    const destinatarios = {
      executar: vi.fn(() => Promise.resolve(opcoes.destinatarios ?? ['u1'])),
    } as unknown as DestinatariosDoEvento;

    const consultas = {
      mudanca: vi.fn(() =>
        Promise.resolve(opcoes.mudanca === undefined ? linha() : opcoes.mudanca),
      ),
    } as unknown as ConsultasAlertas;

    const repositorio: RepositorioPush = {
      salvar: () => Promise.resolve(),
      removerDoUsuario: () => Promise.resolve(),
      dosUsuarios: vi.fn(() => Promise.resolve(opcoes.inscricoes ?? [])),
      apagar,
      registrarErro,
    };

    const push: PushPort = { enviar };
    const caso = new EnviarPushEvento(destinatarios, consultas, repositorio, push);
    return { caso, apagar, registrarErro, enviar };
  }

  it('envia para os destinatários e apaga inscrições expiradas (404/410)', async () => {
    const { caso, apagar, registrarErro, enviar } = preparar({
      destinatarios: ['u1', 'u2'],
      inscricoes: [inscricao('i1', 'u1'), inscricao('i2', 'u2')],
      respostas: { i1: 'ENVIADO', i2: 'INSCRICAO_EXPIRADA' },
    });

    const resultado = await caso.executar({ eventoId: 10 }, AGORA);

    expect(resultado).toEqual({ enviados: 1, expirados: 1, falharam: [] });
    expect(enviar).toHaveBeenCalledTimes(2);
    const [, mensagem] = enviar.mock.calls[0] as [unknown, MensagemPush];
    expect(mensagem.url).toBe(`/ocorrencias/${OCORRENCIA_ID}`);
    expect(apagar).toHaveBeenCalledWith('i2');
    expect(apagar).not.toHaveBeenCalledWith('i1');
    expect(registrarErro).not.toHaveBeenCalled();
  });

  it('registra erro transitório e devolve somente as inscrições pendentes para nova tentativa', async () => {
    const { caso, apagar, registrarErro, enviar } = preparar({
      destinatarios: ['u1', 'u2'],
      inscricoes: [inscricao('i1', 'u1'), inscricao('i2', 'u2')],
      respostas: { i1: 'ENVIADO', i2: new Error('503') },
    });

    const primeira = await caso.executar({ eventoId: 10 }, AGORA);
    expect(primeira).toEqual({ enviados: 1, expirados: 0, falharam: ['i2'] });
    expect(registrarErro).toHaveBeenCalledWith('i2', AGORA);
    expect(apagar).not.toHaveBeenCalled();

    enviar.mockClear();
    await caso.executar({ eventoId: 10, somenteInscricoes: ['i2'] }, AGORA);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]![0].endpoint).toContain('/i2');
  });

  it('sem destinatários ou sem evento, não busca inscrições nem envia push', async () => {
    const { caso, enviar } = preparar({ destinatarios: [] });
    expect(await caso.executar({ eventoId: 10 }, AGORA)).toEqual({
      enviados: 0,
      expirados: 0,
      falharam: [],
    });
    expect(enviar).not.toHaveBeenCalled();
  });
});
