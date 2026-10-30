import { type Job, UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import {
  type EmailPort,
  ErroEmailPermanente,
  type MensagemEmail,
} from '../application/email.port.js';
import { EmailProcessor } from './email.processor.js';

const MENSAGEM: MensagemEmail = { para: 'ana@exemplo.test', assunto: 'Oi', html: '', texto: '' };
const JOB = { id: '7', data: MENSAGEM } as Job<MensagemEmail>;

function processador(enviar: EmailPort['enviar']) {
  return new EmailProcessor({ enviar });
}

describe('EmailProcessor', () => {
  it('envia a mensagem do job com a chave de idempotência do job', async () => {
    const enviar = vi.fn<EmailPort['enviar']>().mockResolvedValue();

    await processador(enviar).process(JOB);

    expect(enviar).toHaveBeenCalledWith(MENSAGEM, { chaveIdempotencia: 'email-7' });
  });

  it('falha permanente vira UnrecoverableError, e o BullMQ não tenta de novo', async () => {
    const enviar = vi.fn<EmailPort['enviar']>().mockRejectedValue(new ErroEmailPermanente('422'));

    await expect(processador(enviar).process(JOB)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('outras falhas passam como estão, para a próxima tentativa', async () => {
    const falha = new Error('Resend respondeu 503');
    const enviar = vi.fn<EmailPort['enviar']>().mockRejectedValue(falha);

    await expect(processador(enviar).process(JOB)).rejects.toBe(falha);
  });
});
