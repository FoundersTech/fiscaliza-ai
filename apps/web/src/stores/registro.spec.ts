import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import { confirmarOcorrencia, enviarOcorrencia } from '@/services/envio';
import type { Categoria } from '@/services/registro';

import { useRegistroStore } from './registro';

vi.mock('@/services/envio', () => ({ enviarOcorrencia: vi.fn(), confirmarOcorrencia: vi.fn() }));

const enviar = vi.mocked(enviarOcorrencia);
const confirmar = vi.mocked(confirmarOcorrencia);
const API = {} as Api;
const CENTRO = { lat: -23.4645, lng: -47.4467 };

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

  describe('passo 3 e envio', () => {
    function prontoParaEnviar() {
      const registro = useRegistroStore();
      registro.adicionarFoto(foto());
      registro.avancar();
      registro.escolherCategoria(PAVIMENTACAO);
      registro.descricao = 'Buraco grande na faixa da direita';
      registro.avancar();
      return registro;
    }

    beforeEach(() => {
      enviar.mockReset();
      confirmar.mockReset();
    });

    it('com a localização negada, o pino no centro só libera o envio depois de movido', () => {
      const registro = prontoParaEnviar();
      registro.posicionar(CENTRO, 'CENTRO');
      registro.dentroDaArea = true;
      expect(registro.passoCompleto).toBe(false);

      registro.posicionar({ lat: -23.5015, lng: -47.4526 }, 'MAPA');
      registro.dentroDaArea = true;
      expect(registro.passoCompleto).toBe(true);
    });

    it('o pino posto à mão vai sem a precisão do GPS', () => {
      const registro = prontoParaEnviar();
      registro.posicionar(CENTRO, 'GPS', 12);
      expect(registro.precisaoM).toBe(12);

      registro.posicionar(CENTRO, 'MAPA', 12);
      expect(registro.precisaoM).toBeNull();
    });

    it('criada: guarda o protocolo para a tela de conclusão', async () => {
      const registro = prontoParaEnviar();
      registro.posicionar(CENTRO, 'GPS', 8);
      enviar.mockResolvedValue({ tipo: 'CRIADA', protocolo: 'FA-2026-SOR-000009' });

      await registro.enviar(API);

      expect(registro.conclusao).toEqual({ tipo: 'CRIADA', protocolo: 'FA-2026-SOR-000009' });
      expect(enviar.mock.calls[0]![1]).toMatchObject({
        id: registro.id,
        categoriaId: 1,
        precisaoM: 8,
        fotos: [{ ordem: 1 }],
      });
    });

    it('a repetição usa o mesmo id e não sobe de novo a foto que já chegou', async () => {
      const registro = prontoParaEnviar();
      registro.posicionar(CENTRO, 'GPS', 8);
      enviar.mockImplementationOnce((_api, _dados, opcoes) => {
        opcoes?.aoEnviarFoto?.(1, 'chave-1');
        return Promise.resolve({ tipo: 'ERRO', codigo: null, mensagem: 'sem rede' });
      });
      enviar.mockResolvedValueOnce({ tipo: 'CRIADA', protocolo: 'FA-2026-SOR-000010' });

      await registro.enviar(API);
      await registro.enviar(API);

      const [primeira, segunda] = enviar.mock.calls.map(([, dados]) => dados);
      expect(segunda!.id).toBe(primeira!.id);
      expect(segunda!.fotos[0]!.uploadKey).toBe('chave-1');
    });

    it('ID_EM_USO: troca o id, esquece as chaves das fotos e tenta de novo', async () => {
      const registro = prontoParaEnviar();
      registro.posicionar(CENTRO, 'GPS', 8);
      const idAntigo = registro.id;
      enviar
        .mockImplementationOnce((_api, _dados, opcoes) => {
          opcoes?.aoEnviarFoto?.(1, 'chave-do-id-antigo');
          return Promise.resolve({ tipo: 'ID_EM_USO' });
        })
        .mockResolvedValueOnce({ tipo: 'CRIADA', protocolo: 'FA-2026-SOR-000011' });

      await registro.enviar(API);

      const segunda = enviar.mock.calls[1]![1];
      expect(segunda.id).not.toBe(idAntigo);
      expect(segunda.fotos[0]!.uploadKey).toBeUndefined();
      expect(registro.conclusao?.protocolo).toBe('FA-2026-SOR-000011');
    });

    it('"Também vi" conclui com o protocolo da existente e o novo total', async () => {
      const registro = prontoParaEnviar();
      confirmar.mockResolvedValue({ tipo: 'CONFIRMADA', confirmacoes: 4 });
      const candidata = {
        id: 'c1',
        protocolo: 'FA-2026-SOR-000003',
        resumo: 'Buraco',
        distancia_m: 40,
        confirmacoes: 3,
      };

      await registro.confirmar(API, candidata);

      expect(registro.conclusao).toEqual({
        tipo: 'CONFIRMADA',
        protocolo: 'FA-2026-SOR-000003',
        confirmacoes: 4,
      });
    });
  });
});
