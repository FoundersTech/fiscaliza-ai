/** Corpo de erro da API: `{ codigo, mensagem, detalhes }`. */
export interface ErroApi {
  codigo: string;
  mensagem: string;
  detalhes: Record<string, unknown>;
}

export const MENSAGEM_SEM_CONEXAO =
  'Não foi possível falar com o servidor. Confira sua conexão e tente de novo.';

export function lerErroApi(corpo: unknown): ErroApi | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const { codigo, mensagem, detalhes } = corpo as Record<string, unknown>;
  if (typeof codigo !== 'string' || typeof mensagem !== 'string') return null;
  return {
    codigo,
    mensagem,
    detalhes: typeof detalhes === 'object' && detalhes !== null ? { ...detalhes } : {},
  };
}

/** Texto para a tela. O 429 diz a espera em minutos quando passa de um minuto. */
export function mensagemDoErro(erro: ErroApi | null, padrao: string): string {
  if (!erro) return padrao;
  const espera = erro.detalhes['tentar_em_segundos'];
  if (erro.codigo === 'MUITAS_REQUISICOES' && typeof espera === 'number') {
    return `Muitas tentativas. Tente de novo ${descreverEspera(espera)}.`;
  }
  return erro.mensagem;
}

function descreverEspera(segundos: number): string {
  if (segundos <= 60) return segundos === 1 ? 'em 1 segundo' : `em ${segundos} segundos`;
  const minutos = Math.ceil(segundos / 60);
  return minutos === 1 ? 'em 1 minuto' : `em ${minutos} minutos`;
}

/** As mensagens por campo de um 422 VALIDACAO, a primeira de cada campo. */
export function errosDosCampos(erro: ErroApi | null): Record<string, string> {
  const campos = erro?.codigo === 'VALIDACAO' ? erro.detalhes['campos'] : undefined;
  if (typeof campos !== 'object' || campos === null) return {};
  return Object.fromEntries(
    Object.entries(campos).flatMap(([campo, mensagens]: [string, unknown]) => {
      const primeira: unknown = Array.isArray(mensagens) ? mensagens[0] : undefined;
      return typeof primeira === 'string' ? [[campo, comMaiuscula(primeira)]] : [];
    }),
  );
}

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
