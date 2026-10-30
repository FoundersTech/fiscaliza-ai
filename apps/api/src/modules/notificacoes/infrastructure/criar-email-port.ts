import type { Ambiente } from '../../../shared/config/ambiente.js';
import type { EmailPort } from '../application/email.port.js';
import { EmailArquivoAdapter } from './email-arquivo.adapter.js';
import { EmailResendAdapter } from './email-resend.adapter.js';

/** Escolhe o transporte pelo EMAIL_TRANSPORTE (a validação do ambiente garante a chave). */
export function criarEmailPort(ambiente: Ambiente): EmailPort {
  if (ambiente.EMAIL_TRANSPORTE === 'resend') {
    return new EmailResendAdapter({
      chave: ambiente.RESEND_API_KEY!,
      remetente: ambiente.EMAIL_REMETENTE,
    });
  }
  return new EmailArquivoAdapter(ambiente.EMAIL_PASTA);
}
