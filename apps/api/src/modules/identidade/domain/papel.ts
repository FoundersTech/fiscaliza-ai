export const Papel = {
  CIDADAO: 'CIDADAO',
  AGENTE_ORGAO: 'AGENTE_ORGAO',
  ADMIN_MUNICIPIO: 'ADMIN_MUNICIPIO',
  ADMIN_PLATAFORMA: 'ADMIN_PLATAFORMA',
} as const;
export type Papel = (typeof Papel)[keyof typeof Papel];

export const PAPEIS: readonly Papel[] = Object.values(Papel);
