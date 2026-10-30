import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';

/** Partes de um protocolo `FA-AAAA-SIG-NNNNNN` */
export interface PartesProtocolo {
  ano: number;
  sigla: string;
  numero: number;
}

const FORMATO = /^FA-(\d{4})-([A-Z]{3})-(\d{6})$/;
const NUMERO_MAXIMO = 999_999;

// O ano do protocolo é o do calendário de quem registra, não o de UTC.
const ANO_EM_SAO_PAULO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
});

/**
 * Protocolo da ocorrência: `FA-<ano de criação>-<sigla do município>-<sequencial>`.
 * O sequencial é por município e ano, e vem de `protocolo_sequencia`; aqui só se monta e se lê.
 */
export const Protocolo = {
  anoDe(data: Date): number {
    return Number(ANO_EM_SAO_PAULO.format(data));
  },

  formatar(ano: number, sigla: string, numero: number): string {
    if (!Number.isInteger(ano) || ano < 1000 || ano > 9999) {
      throw new ErroDominio('PROTOCOLO_INVALIDO', `Ano inválido para o protocolo: ${ano}.`);
    }
    if (!/^[A-Z]{3}$/.test(sigla)) {
      throw new ErroDominio('PROTOCOLO_INVALIDO', `Sigla inválida para o protocolo: ${sigla}.`);
    }
    if (!Number.isInteger(numero) || numero < 1 || numero > NUMERO_MAXIMO) {
      throw new ErroDominio(
        'PROTOCOLO_INVALIDO',
        `Sequencial fora do intervalo 1–${NUMERO_MAXIMO}: ${numero}.`,
      );
    }
    return `FA-${ano}-${sigla}-${String(numero).padStart(6, '0')}`;
  },

  ler(texto: string): PartesProtocolo | null {
    const partes = FORMATO.exec(texto.trim().toUpperCase());
    if (!partes) return null;
    const numero = Number(partes[3]);
    if (numero < 1) return null;
    return { ano: Number(partes[1]), sigla: partes[2]!, numero };
  },
};
