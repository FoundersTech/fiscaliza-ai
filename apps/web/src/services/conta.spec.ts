import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import {
  cancelarPushNoNavegador,
  consultarExportacao,
  ehLinkExterno,
  excluirConta,
  listarExportacoes,
  rotuloPapel,
  rotuloStatusExportacao,
  solicitarExportacao,
  urlFeedbackPiloto,
} from './conta';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import type { AmbientePush } from './push';

describe('exportações da conta', () => {
  it('lista, solicita e consulta exportação com os caminhos corretos', async () => {
    const item = {
      id: 'exp-1',
      status: 'PRONTA' as const,
      solicitada_em: '2026-11-15T12:00:00.000Z',
      download_url: 'https://r2.exemplo.test/exp-1.json',
    };
    const GET = vi
      .fn()
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: item });
    const POST = vi.fn().mockResolvedValue({ data: { id: 'exp-1', status: 'PROCESSANDO' } });
    const api = { GET, POST } as unknown as Api;

    await expect(listarExportacoes(api)).resolves.toEqual({ tipo: 'OK', itens: [item] });
    await expect(solicitarExportacao(api)).resolves.toEqual({
      tipo: 'OK',
      id: 'exp-1',
      status: 'PROCESSANDO',
    });
    await expect(consultarExportacao(api, 'exp-1')).resolves.toEqual({
      tipo: 'OK',
      exportacao: item,
    });
    expect(GET).toHaveBeenNthCalledWith(1, '/api/v1/me/exportacoes');
    expect(POST).toHaveBeenCalledWith('/api/v1/me/exportacoes');
    expect(GET).toHaveBeenNthCalledWith(2, '/api/v1/me/exportacoes/{id}', {
      params: { path: { id: 'exp-1' } },
    });
  });

  it('mapeia cada status de exportação para o texto em português', () => {
    expect(rotuloStatusExportacao('PROCESSANDO')).toBe('Processando');
    expect(rotuloStatusExportacao('PRONTA')).toBe('Pronta para download');
    expect(rotuloStatusExportacao('EXPIRADA')).toBe('Expirada');
    expect(rotuloStatusExportacao('FALHOU')).toBe('Não foi possível gerar');
  });
});

describe('excluirConta', () => {
  it('devolve EXCLUIDA em 204 e SENHA_INCORRETA em 401 ou 422', async () => {
    const DELETE = vi
      .fn()
      .mockResolvedValueOnce({ response: { ok: true, status: 204 } })
      .mockResolvedValueOnce({
        response: { ok: false, status: 401 },
        error: { codigo: 'SENHA_INCORRETA', mensagem: 'Senha incorreta.', detalhes: {} },
      })
      .mockResolvedValueOnce({
        response: { ok: false, status: 422 },
        error: {
          codigo: 'VALIDACAO',
          mensagem: 'Dados inválidos.',
          detalhes: { campos: { senha: ['informe a senha'] } },
        },
      });
    const api = { DELETE } as unknown as Api;

    await expect(excluirConta(api, 'segredo123')).resolves.toEqual({ tipo: 'EXCLUIDA' });
    await expect(excluirConta(api, 'errada')).resolves.toEqual({
      tipo: 'SENHA_INCORRETA',
      mensagem: 'Senha incorreta.',
    });
    await expect(excluirConta(api, '')).resolves.toEqual({
      tipo: 'SENHA_INCORRETA',
      mensagem: 'Informe a senha',
    });
  });

  it('trata falta de conexão sem lançar', async () => {
    const api = {
      DELETE: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    } as unknown as Api;
    await expect(excluirConta(api, 'segredo123')).resolves.toEqual({
      tipo: 'ERRO',
      mensagem: MENSAGEM_SEM_CONEXAO,
    });
  });
});

describe('cancelarPushNoNavegador', () => {
  it('remove a inscrição local e não lança quando o navegador falha', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    const ambiente: AmbientePush = {
      temPushManager: true,
      userAgent: 'Chrome',
      serviceWorker: {
        ready: new Promise(() => undefined),
        getRegistration: () =>
          Promise.resolve({
            pushManager: {
              getSubscription: () => Promise.resolve({ toJSON: () => ({}), unsubscribe }),
              subscribe: () => Promise.reject(new Error('sem uso')),
            },
          }),
      },
    };
    await cancelarPushNoNavegador(ambiente);
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await expect(
      cancelarPushNoNavegador({
        temPushManager: true,
        userAgent: 'Chrome',
        serviceWorker: {
          ready: new Promise(() => undefined),
          getRegistration: () => Promise.reject(new Error('falhou')),
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('feedback do piloto e papel', () => {
  it('usa a URL configurada ou cai no mailto padrão e distingue links externos', () => {
    expect(urlFeedbackPiloto('  https://forms.exemplo.test/piloto  ')).toBe(
      'https://forms.exemplo.test/piloto',
    );
    expect(urlFeedbackPiloto('')).toMatch(/^mailto:/);
    expect(ehLinkExterno('https://forms.exemplo.test/piloto')).toBe(true);
    expect(ehLinkExterno('mailto:contato@fiscalizaai.app')).toBe(false);
  });

  it('traduz cada papel da conta para português', () => {
    expect(rotuloPapel('CIDADAO')).toBe('Cidadão');
    expect(rotuloPapel('AGENTE_ORGAO')).toBe('Agente do órgão');
    expect(rotuloPapel('ADMIN_MUNICIPIO')).toBe('Gestor do município');
    expect(rotuloPapel('ADMIN_PLATAFORMA')).toBe('Administrador da plataforma');
  });
});
