export const EMAIL_PORT = Symbol('EMAIL_PORT');

export interface MensagemEmail {
  para: string;
  assunto: string;
  html: string;
  /** Versão em texto puro, para clientes sem HTML e filtros de spam. */
  texto: string;
}

export interface OpcoesEnvio {
  /** Evita e-mail duplicado quando uma tentativa é repetida depois de o provedor aceitar. */
  chaveIdempotencia?: string;
}

/** Envio de e-mail transacional. Falhas lançam erro para a fila tentar de novo. */
export interface EmailPort {
  enviar(mensagem: MensagemEmail, opcoes?: OpcoesEnvio): Promise<void>;
}

/** Falha que não adianta repetir, como endereço recusado ou chave inválida. */
export class ErroEmailPermanente extends Error {
  override readonly name = 'ErroEmailPermanente';
}
