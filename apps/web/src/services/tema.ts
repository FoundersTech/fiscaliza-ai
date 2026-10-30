/** Preferência de tema: seguir o aparelho, ou forçar claro ou escuro. */
export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'fa:tema';
const VALIDAS: readonly PreferenciaTema[] = ['sistema', 'claro', 'escuro'];

/** Só o que o tema usa do localStorage, para os testes passarem um armazenamento falso. */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

/** Sem preferência salva, ou com o armazenamento bloqueado (aba anônima), segue o aparelho. */
export function lerPreferencia(armazenamento: Armazenamento | undefined): PreferenciaTema {
  try {
    const valor = armazenamento?.getItem(CHAVE);
    return VALIDAS.includes(valor as PreferenciaTema) ? (valor as PreferenciaTema) : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function salvarPreferencia(
  armazenamento: Armazenamento | undefined,
  preferencia: PreferenciaTema,
): void {
  try {
    armazenamento?.setItem(CHAVE, preferencia);
  } catch {
    // Sem armazenamento, o tema vale até fechar o app.
  }
}

/** O botão de lua alterna entre claro e escuro, partindo do que está na tela agora. */
export function alternar(escuroAgora: boolean): PreferenciaTema {
  return escuroAgora ? 'claro' : 'escuro';
}

/** O valor que o Dark do Quasar espera: true, false ou 'auto' (seguir o aparelho). */
export function modoQuasar(preferencia: PreferenciaTema): boolean | 'auto' {
  return preferencia === 'sistema' ? 'auto' : preferencia === 'escuro';
}
