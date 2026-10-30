import {
  type EmailPort,
  ErroEmailPermanente,
  type MensagemEmail,
  type OpcoesEnvio,
} from '../application/email.port.js';

const URL_RESEND = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface ConfigResend {
  chave: string;
  remetente: string;
}

/** Envio pela API HTTP do Resend, sem SDK. */
export class EmailResendAdapter implements EmailPort {
  constructor(private readonly config: ConfigResend) {}

  async enviar(mensagem: MensagemEmail, opcoes: OpcoesEnvio = {}): Promise<void> {
    const resposta = await fetch(URL_RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.chave}`,
        'Content-Type': 'application/json',
        ...(opcoes.chaveIdempotencia ? { 'Idempotency-Key': opcoes.chaveIdempotencia } : {}),
      },
      body: JSON.stringify({
        from: this.config.remetente,
        to: [mensagem.para],
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (resposta.ok) return;

    // Só o status e o nome do erro: a mensagem do provedor pode repetir o endereço.
    const motivo = `Resend respondeu ${resposta.status} (${await nomeDoErro(resposta)})`;
    // 429 e 5xx passam; os outros 4xx (endereço inválido, chave errada) não mudam ao repetir.
    if (resposta.status === 429 || resposta.status >= 500) {
      throw new Error(motivo);
    }
    throw new ErroEmailPermanente(motivo);
  }
}

async function nomeDoErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { name?: unknown };
    return typeof corpo.name === 'string' ? corpo.name : 'sem detalhes';
  } catch {
    return 'sem detalhes';
  }
}
