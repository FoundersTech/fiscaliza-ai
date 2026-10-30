import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AMBIENTE, validarAmbiente } from '../../shared/config/ambiente.js';
import { ConfiguracaoModule } from '../../shared/config/configuracao.module.js';
import { FilasModule } from '../../shared/filas/filas.module.js';
import { EMAIL_PORT, type EmailPort, ErroEmailPermanente } from './application/email.port.js';
import { FILA_EMAIL, OPCOES_FILA_EMAIL, ServicoEmail } from './application/servico-email.js';
import { NotificacoesModule } from './notificacoes.module.js';

const WEB_URL = 'https://app.exemplo.test';

async function criarModulo(
  ajustar: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<TestingModule> {
  const builder = Test.createTestingModule({
    imports: [ConfiguracaoModule, FilasModule, NotificacoesModule],
  });
  ajustar(builder);
  const modulo = await builder.compile();
  // Começa com a fila vazia, sem jobs de execuções anteriores.
  await modulo.get<Queue>(getQueueToken(FILA_EMAIL)).obliterate({ force: true });
  await modulo.init();
  return modulo;
}

async function encerrar(modulo: TestingModule): Promise<void> {
  await modulo.get<Queue>(getQueueToken(FILA_EMAIL)).obliterate({ force: true });
  await modulo.close();
}

describe('e-mail em desenvolvimento (transporte arquivo)', () => {
  let modulo: TestingModule;
  let pasta: string;

  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'fa-emails-int-'));
    modulo = await criarModulo((builder) => {
      builder
        .overrideProvider(AMBIENTE)
        .useValue(validarAmbiente({ ...process.env, EMAIL_PASTA: pasta, WEB_URL }));
    });
  });

  afterAll(async () => {
    await encerrar(modulo);
    await rm(pasta, { recursive: true, force: true });
  });

  it('enfileirar a redefinição de senha gera o arquivo com o link de uso único', async () => {
    await modulo.get(ServicoEmail).enviarRedefinicaoSenha({
      para: 'ana@exemplo.test',
      nome: 'Ana',
      token: 'tok/en+1',
    });

    const json = await vi.waitFor(
      async () => {
        const arquivo = (await readdir(pasta)).find((nome) => nome.endsWith('.json'));
        expect(arquivo).toBeDefined();
        return arquivo!;
      },
      { timeout: 5000, interval: 50 },
    );
    const mensagem = JSON.parse(await readFile(join(pasta, json), 'utf8')) as Record<
      string,
      string
    >;

    expect(mensagem).toMatchObject({
      para: 'ana@exemplo.test',
      assunto: 'Redefinição de senha do Fiscaliza Aí!',
    });
    expect(mensagem['texto']).toContain(`${WEB_URL}/definir-senha?token=tok%2Fen%2B1`);
  });
});

describe('e-mail com o provedor falhando', () => {
  const enviar = vi.fn<EmailPort['enviar']>();
  let modulo: TestingModule;
  let fila: Queue;

  beforeAll(async () => {
    modulo = await criarModulo((builder) => {
      builder
        .overrideProvider(EMAIL_PORT)
        .useValue({ enviar })
        // Mesmas 5 tentativas da produção, com espera de milissegundos em vez de 30 s.
        .overrideProvider(OPCOES_FILA_EMAIL)
        .useValue({ tentativas: 5, atrasoInicialMs: 10 });
    });
    fila = modulo.get<Queue>(getQueueToken(FILA_EMAIL));
  });

  afterEach(async () => {
    enviar.mockReset();
    await fila.obliterate({ force: true });
  });

  afterAll(async () => {
    await encerrar(modulo);
  });

  async function esperarFalha(): Promise<void> {
    await vi.waitFor(async () => expect(await fila.getFailedCount()).toBe(1), {
      timeout: 10_000,
      interval: 50,
    });
  }

  it('uma falha temporária é tentada 5 vezes', async () => {
    enviar.mockRejectedValue(new Error('Resend respondeu 503'));

    await modulo.get(ServicoEmail).enviarConvite({
      para: 'beto@exemplo.test',
      nome: 'Beto',
      token: 'abc',
      papel: 'AGENTE_ORGAO',
    });
    await esperarFalha();

    expect(enviar).toHaveBeenCalledTimes(5);
    const [job] = await fila.getFailed();
    expect(job!.attemptsMade).toBe(5);
  });

  it('uma falha permanente não é repetida', async () => {
    enviar.mockRejectedValue(new ErroEmailPermanente('Resend respondeu 422 (validation_error)'));

    await modulo.get(ServicoEmail).enviarRedefinicaoSenha({
      para: 'invalido@exemplo.test',
      nome: 'Cris',
      token: 'abc',
    });
    await esperarFalha();

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('sucesso na 3ª tentativa encerra o job, que sai do Redis', async () => {
    enviar
      .mockRejectedValueOnce(new Error('503'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue();

    await modulo.get(ServicoEmail).enviarRedefinicaoSenha({
      para: 'ana@exemplo.test',
      nome: 'Ana',
      token: 'abc',
    });

    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(3), { timeout: 10_000 });
    // Nenhum job em estado nenhum: concluído, ele é removido (removeOnComplete).
    await vi.waitFor(async () => {
      const contagens = Object.values(await fila.getJobCounts());
      expect(contagens.reduce((soma, quantidade) => soma + quantidade, 0)).toBe(0);
    });
  });
});
