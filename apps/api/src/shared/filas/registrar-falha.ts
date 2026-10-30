import type { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

/** Aviso enquanto o job ainda tem tentativas; erro quando elas acabam. */
export function registrarFalha(logger: Logger, assunto: string, job: Job, erro: Error): void {
  const tentativas = job.opts.attempts ?? 1;
  const desistiu = job.attemptsMade >= tentativas;
  logger[desistiu ? 'error' : 'warn'](
    `${assunto} falhou na tentativa ${job.attemptsMade} de ${tentativas}` +
      `${desistiu ? ', sem novas tentativas' : ''}: ${erro.message}`,
  );
}
