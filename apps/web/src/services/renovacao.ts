export interface Travas {
  request<T>(nome: string, tarefa: () => Promise<T>): Promise<T>;
}

const TRAVA = 'fa:renovar-sessao';

/**
 * Uma renovação de sessão por vez. Na mesma aba, quem pede durante uma renovação recebe o mesmo
 * resultado. Entre abas, o `navigator.locks` faz uma esperar a outra terminar, e assim cada uma
 * manda o cookie que a anterior acabou de gravar, em vez de reapresentar um token já usado. Sem
 * `navigator.locks`, a API ainda aceita o token anterior por 10 s.
 */
export function criarRenovador(
  renovar: () => Promise<boolean>,
  travas: Travas | null = globalThis.navigator?.locks ?? null,
): () => Promise<boolean> {
  let emAndamento: Promise<boolean> | null = null;
  return () => {
    emAndamento ??= (travas ? travas.request(TRAVA, renovar) : renovar()).finally(() => {
      emAndamento = null;
    });
    return emAndamento;
  };
}
