import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Categoria } from '@/services/registro';

import { useRegistroStore } from './registro';

const foto = () => new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' });

const PAVIMENTACAO: Categoria = {
  id: 1,
  slug: 'pavimentacao',
  nome: 'Pavimentação',
  icone: 'add_road',
  schema_atributos: [],
};
const ILUMINACAO: Categoria = {
  id: 2,
  slug: 'iluminacao',
  nome: 'Iluminação',
  icone: 'lightbulb',
  schema_atributos: [
    { chave: 'numero_poste', rotulo: 'Número do poste', tipo: 'texto', obrigatorio: true, max: 20 },
  ],
};

describe('store do registro', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('não aceita uma terceira foto', () => {
    const registro = useRegistroStore();

    expect(registro.adicionarFoto(foto())).toBe(true);
    expect(registro.adicionarFoto(foto())).toBe(true);
    expect(registro.vagasDeFoto).toBe(0);
    expect(registro.adicionarFoto(foto())).toBe(false);
    expect(registro.fotos).toHaveLength(2);
  });

  it('"Continuar" do passo 1 só vale com uma foto pronta', () => {
    const registro = useRegistroStore();
    expect(registro.passoCompleto).toBe(false);

    registro.preparando = 1;
    expect(registro.vagasDeFoto).toBe(1);
    registro.adicionarFoto(foto());
    expect(registro.passoCompleto).toBe(false);

    registro.preparando = 0;
    expect(registro.passoCompleto).toBe(true);
    registro.avancar();
    expect(registro.passo).toBe(2);
  });

  it('não avança o passo 2 enquanto o atributo obrigatório está vazio', () => {
    const registro = useRegistroStore();
    registro.adicionarFoto(foto());
    registro.avancar();
    registro.escolherCategoria(ILUMINACAO);
    registro.descricao = 'Poste apagado na esquina';

    registro.avancar();
    expect(registro.passo).toBe(2);

    registro.atributos.numero_poste = 'P-123';
    registro.avancar();
    expect(registro.passo).toBe(3);
  });

  it('trocar de categoria limpa os atributos da anterior', () => {
    const registro = useRegistroStore();
    registro.escolherCategoria(ILUMINACAO);
    registro.atributos.numero_poste = 'P-123';

    registro.escolherCategoria(ILUMINACAO);
    expect(registro.atributos).toEqual({ numero_poste: 'P-123' });
    registro.escolherCategoria(PAVIMENTACAO);
    expect(registro.atributos).toEqual({});
  });

  it('remover uma foto abre a vaga de novo, e limpar volta ao começo', () => {
    const registro = useRegistroStore();
    registro.adicionarFoto(foto());
    registro.adicionarFoto(foto());

    registro.removerFoto(registro.fotos[0]!.id);
    expect(registro.vagasDeFoto).toBe(1);

    registro.avancar();
    registro.limpar();
    expect(registro.passo).toBe(1);
    expect(registro.fotos).toEqual([]);
  });
});
