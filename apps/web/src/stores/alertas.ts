import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import {
  type Alerta,
  agendarConsultaAlertas,
  buscarAlertas,
  contarAlertasNovos,
  marcarAlertasVistos,
} from '@/services/alertas';
import type { Api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

/**
 * A aba Alertas e o indicador do sino e da barra inferior. Com o app aberto, a quantidade de
 * alertas novos é consultada a cada minuto; abrir a aba marca tudo como visto.
 */
export const useAlertasStore = defineStore('alertas', () => {
  const auth = useAuthStore();

  /** Alertas desde a última visita à aba: o número do indicador. */
  const novos = ref(0);
  const itens = shallowRef<Alerta[]>([]);
  const proximoCursor = ref<string | null>(null);
  /** Quantos alertas do topo da lista eram novos quando a aba foi aberta (o selo "Novo"). */
  const destacados = ref(0);
  const carregando = ref(false);
  const carregou = ref(false);
  const erro = ref<string | null>(null);
  /** De quem é o que está em memória: trocar de conta não mostra os alertas do anterior. */
  let dono: string | null = null;
  /** Cada recomeço invalida as respostas que ainda estavam a caminho. */
  let geracao = 0;
  let pararConsulta: (() => void) | null = null;

  const temMais = computed(() => carregou.value && proximoCursor.value !== null);

  function ehCidadao(): boolean {
    return auth.logado && auth.papel === 'CIDADAO';
  }

  function conferirDono(): void {
    const usuario = auth.usuario?.id ?? null;
    if (usuario === dono) return;
    dono = usuario;
    geracao += 1;
    novos.value = 0;
    itens.value = [];
    proximoCursor.value = null;
    destacados.value = 0;
    carregou.value = false;
    carregando.value = false;
    erro.value = null;
  }

  /** Atualiza o indicador; sem conexão, fica o último número conhecido. */
  async function atualizarNovos(api: Api): Promise<void> {
    conferirDono();
    if (!ehCidadao()) return;
    const minha = geracao;
    const quantidade = await contarAlertasNovos(api);
    if (minha !== geracao || quantidade === null) return;
    novos.value = quantidade;
  }

  async function buscar(api: Api, cursor: string | null): Promise<void> {
    const minha = geracao;
    carregando.value = true;
    erro.value = null;
    const resultado = await buscarAlertas(api, cursor);
    if (minha !== geracao) return;
    carregando.value = false;
    if (resultado.tipo === 'ERRO') {
      erro.value = resultado.mensagem;
      return;
    }
    const vistos = new Set(cursor ? itens.value.map((item) => item.evento_id) : []);
    const chegaram = resultado.itens.filter((item) => !vistos.has(item.evento_id));
    itens.value = cursor ? [...itens.value, ...chegaram] : chegaram;
    proximoCursor.value = resultado.proximoCursor;
    carregou.value = true;
  }

  /**
   * Abrir a aba: busca a lista, marca como vistos e zera o indicador na hora. Os que eram novos
   * ficam destacados no topo enquanto a aba está aberta.
   */
  async function abrirAba(api: Api): Promise<void> {
    conferirDono();
    if (!ehCidadao()) return;
    // Com a aba já aberta, os que chegam agora entram no topo, acima dos já destacados.
    destacados.value += novos.value;
    novos.value = 0;
    geracao += 1;
    // Marca antes de buscar: um alerta que chegue no meio aparece na lista, em vez de sumir do
    // indicador sem ter sido mostrado.
    const minha = geracao;
    await marcarAlertasVistos(api);
    if (minha !== geracao) return;
    await buscar(api, null);
  }

  /** Sair da aba: o destaque dos novos não volta na próxima visita. */
  function sairDaAba(): void {
    destacados.value = 0;
  }

  /** A página seguinte; não faz nada enquanto outra busca está em andamento ou no fim da lista. */
  function carregarMais(api: Api): Promise<void> {
    if (carregando.value || !temMais.value) return Promise.resolve();
    return buscar(api, proximoCursor.value);
  }

  /** Começa a consulta a cada minuto (e uma agora). Chamar de novo não duplica o relógio. */
  function iniciarConsulta(api: Api): void {
    if (pararConsulta) return;
    pararConsulta = agendarConsultaAlertas({ consultar: () => atualizarNovos(api) });
  }

  function encerrarConsulta(): void {
    pararConsulta?.();
    pararConsulta = null;
  }

  return {
    novos,
    itens,
    proximoCursor,
    destacados,
    carregando,
    carregou,
    erro,
    temMais,
    atualizarNovos,
    abrirAba,
    sairDaAba,
    carregarMais,
    iniciarConsulta,
    encerrarConsulta,
  };
});
