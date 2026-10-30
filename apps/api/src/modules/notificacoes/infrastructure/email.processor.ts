import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';

import {
  EMAIL_PORT,
  type EmailPort,
  ErroEmailPermanente,
  type MensagemEmail,
} from '../application/email.port.js';
import { FILA_EMAIL } from '../application/servico-email.js';

/** Worker da fila `email`: envia pelo EmailPort; o BullMQ repete as falhas. */
@Processor(FILA_EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(@Inject(EMAIL_PORT) private readonly email: EmailPort) {
    super();
  }

  async process(job: Job<MensagemEmail>): Promise<void> {
    try {
      await this.email.enviar(job.data, { chaveIdempotencia: `email-${job.id}` });
    } catch (erro) {
      // Falha permanente: o BullMQ para de tentar na hora.
      if (erro instanceof ErroEmailPermanente) throw new UnrecoverableError(erro.message);
      throw erro;
    }
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<MensagemEmail> | undefined, erro: Error): void {
    if (!job) return;
    const tentativas = job.opts.attempts ?? 1;
    const desistiu = erro instanceof UnrecoverableError || job.attemptsMade >= tentativas;
    // Sem o destinatário no log: os logs não registram e-mail.
    this.logger[desistiu ? 'error' : 'warn'](
      `E-mail ${job.id} ("${job.data.assunto}") falhou na tentativa ${job.attemptsMade} de ${tentativas}` +
        `${desistiu ? ', sem novas tentativas' : ''}: ${erro.message}`,
    );
  }
}
