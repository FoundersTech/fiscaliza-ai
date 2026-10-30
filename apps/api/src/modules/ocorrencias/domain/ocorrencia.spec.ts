import { describe, expect, it } from 'vitest';

import {
  type DadosOcorrencia,
  Ocorrencia,
  StatusOcorrencia,
  TRANSICOES_AGENTE,
} from './ocorrencia.js';

const { RECEBIDA, EM_ANALISE, EM_EXECUCAO, RESOLVIDA, RECUSADA, DUPLICADA } = StatusOcorrencia;
const TODOS = Object.values(StatusOcorrencia);

const AUTOR = 'autor-1';
const UM_DIA = 24 * 60 * 60 * 1000;
const CRIADA = new Date('2026-10-01T12:00:00Z');
const AGORA = new Date('2026-10-20T12:00:00Z');

function ocorrencia(dados: Partial<DadosOcorrencia> = {}): Ocorrencia {
  return Ocorrencia.reconstituir({
    id: 'oc-1',
    municipioId: 3552205,
    autorId: AUTOR,
    status: RECEBIDA,
    criadaEm: CRIADA,
    triadaEm: null,
    resolvidaEm: null,
    duplicadaDeId: null,
    reaberturas: 0,
    ...dados,
  });
}

const ORIGINAL = { id: 'oc-original', municipioId: 3552205, status: EM_ANALISE };

function codigo(acao: () => unknown): string | undefined {
  try {
    acao();
  } catch (erro) {
    return (erro as { codigo?: string }).codigo;
  }
  return undefined;
}

describe('Ocorrencia: transições do agente', () => {
  const pares = TODOS.flatMap((de) => TODOS.map((para) => [de, para] as const));

  it.each(pares)('%s → %s', (de, para) => {
    const permitida = TRANSICOES_AGENTE[de].includes(para);
    const alvo = ocorrencia({ status: de });

    // Comentário e original sempre válidos: só o par (de, para) decide.
    const resultado = codigo(() =>
      alvo.transicionar({ paraStatus: para, comentario: 'ok', original: ORIGINAL, agora: AGORA }),
    );

    if (permitida) {
      expect(resultado).toBeUndefined();
      expect(alvo.status).toBe(para);
    } else {
      expect(resultado).toBe('TRANSICAO_INVALIDA');
      expect(alvo.status).toBe(de);
    }
  });

  it('a tabela de transições do agente', () => {
    expect(TRANSICOES_AGENTE).toEqual({
      RECEBIDA: [EM_ANALISE, RECUSADA, DUPLICADA],
      EM_ANALISE: [EM_EXECUCAO, RECUSADA, DUPLICADA],
      EM_EXECUCAO: [RESOLVIDA],
      RESOLVIDA: [],
      RECUSADA: [],
      DUPLICADA: [],
    });
  });

  it('devolve o evento da transição', () => {
    const evento = ocorrencia().transicionar({
      paraStatus: EM_ANALISE,
      comentario: '  Equipe a caminho.  ',
      agora: AGORA,
    });

    expect(evento).toEqual({
      deStatus: RECEBIDA,
      paraStatus: EM_ANALISE,
      comentario: 'Equipe a caminho.',
      criadoEm: AGORA,
    });
  });
});

describe('Ocorrencia: dado exigido por status final', () => {
  it.each([
    [RECUSADA, RECEBIDA],
    [RESOLVIDA, EM_EXECUCAO],
  ])('%s sem comentário é rejeitada', (para, de) => {
    for (const comentario of [undefined, null, '', '   ']) {
      const alvo = ocorrencia({ status: de });
      expect(codigo(() => alvo.transicionar({ paraStatus: para, comentario, agora: AGORA }))).toBe(
        'COMENTARIO_OBRIGATORIO',
      );
      expect(alvo.status).toBe(de);
    }
  });

  it('EM_ANALISE e EM_EXECUCAO aceitam ficar sem comentário', () => {
    const alvo = ocorrencia();
    expect(alvo.transicionar({ paraStatus: EM_ANALISE, agora: AGORA }).comentario).toBeNull();
    expect(alvo.transicionar({ paraStatus: EM_EXECUCAO, agora: AGORA }).comentario).toBeNull();
  });

  it.each([
    ['sem original', null],
    ['apontando para ela mesma', { ...ORIGINAL, id: 'oc-1' }],
    ['apontando para outra DUPLICADA', { ...ORIGINAL, status: DUPLICADA }],
    ['de outro município', { ...ORIGINAL, municipioId: 3550308 }],
  ])('DUPLICADA %s é rejeitada', (_caso, original) => {
    const alvo = ocorrencia();
    expect(codigo(() => alvo.transicionar({ paraStatus: DUPLICADA, original, agora: AGORA }))).toBe(
      'ORIGINAL_INVALIDA',
    );
    expect(alvo.estado.duplicadaDeId).toBeNull();
  });

  it('DUPLICADA válida guarda a original', () => {
    const alvo = ocorrencia();
    alvo.transicionar({ paraStatus: DUPLICADA, original: ORIGINAL, agora: AGORA });
    expect(alvo.estado).toMatchObject({ status: DUPLICADA, duplicadaDeId: 'oc-original' });
  });
});

describe('Ocorrencia: datas de triagem e resolução', () => {
  it('a primeira saída de RECEBIDA preenche triada_em, e a resolução preenche resolvida_em', () => {
    const alvo = ocorrencia();
    const depois = new Date(AGORA.getTime() + UM_DIA);

    alvo.transicionar({ paraStatus: EM_ANALISE, agora: AGORA });
    alvo.transicionar({ paraStatus: EM_EXECUCAO, agora: depois });
    alvo.transicionar({ paraStatus: RESOLVIDA, comentario: 'Feito.', agora: depois });

    expect(alvo.estado).toMatchObject({ triadaEm: AGORA, resolvidaEm: depois });
  });

  it('recusar direto de RECEBIDA também conta como triagem', () => {
    const alvo = ocorrencia();
    alvo.transicionar({ paraStatus: RECUSADA, comentario: 'Via estadual.', agora: AGORA });
    expect(alvo.estado.triadaEm).toEqual(AGORA);
  });
});

describe('Ocorrencia: reabertura', () => {
  const resolvidaEm = new Date('2026-10-10T12:00:00Z');
  const resolvida = () =>
    ocorrencia({ status: RESOLVIDA, triadaEm: CRIADA, resolvidaEm, reaberturas: 1 });
  const reabrir = (
    alvo: Ocorrencia,
    mudancas: Partial<Parameters<Ocorrencia['reabrir']>[0]> = {},
  ) =>
    alvo.reabrir({
      usuarioId: AUTOR,
      confirmou: false,
      justificativa: 'O buraco continua lá.',
      agora: new Date(resolvidaEm.getTime() + 3 * UM_DIA),
      janelaDias: 10,
      ...mudancas,
    });

  it('volta para EM_ANALISE, limpa resolvida_em, conta a reabertura e devolve o evento', () => {
    const alvo = resolvida();
    const agora = new Date(resolvidaEm.getTime() + 3 * UM_DIA);

    const evento = reabrir(alvo, { agora });

    expect(alvo.estado).toMatchObject({ status: EM_ANALISE, resolvidaEm: null, reaberturas: 2 });
    expect(evento).toEqual({
      deStatus: RESOLVIDA,
      paraStatus: EM_ANALISE,
      comentario: 'O buraco continua lá.',
      criadoEm: agora,
    });
  });

  it('aceita no 10º dia e rejeita no 11º', () => {
    const limite = new Date(resolvidaEm.getTime() + 10 * UM_DIA);
    expect(codigo(() => reabrir(resolvida(), { agora: limite }))).toBeUndefined();

    const alvo = resolvida();
    const decimoPrimeiroDia = new Date(limite.getTime() + 1);
    expect(codigo(() => reabrir(alvo, { agora: decimoPrimeiroDia }))).toBe('FORA_DO_PRAZO');
    expect(alvo.status).toBe(RESOLVIDA);
  });

  it('quem confirmou também pode reabrir; outra pessoa não', () => {
    expect(
      codigo(() => reabrir(resolvida(), { usuarioId: 'vizinho', confirmou: true })),
    ).toBeUndefined();
    expect(codigo(() => reabrir(resolvida(), { usuarioId: 'vizinho', confirmou: false }))).toBe(
      'SEM_VINCULO',
    );
  });

  it('autor anonimizado (autor_id nulo) não dá vínculo a ninguém', () => {
    const alvo = ocorrencia({ status: RESOLVIDA, resolvidaEm, autorId: null });
    expect(codigo(() => reabrir(alvo, { usuarioId: AUTOR }))).toBe('SEM_VINCULO');
  });

  it.each(TODOS.filter((status) => status !== RESOLVIDA))('%s não pode ser reaberta', (status) => {
    // Mesmo com resolvida_em preenchido, só o status decide.
    const alvo = ocorrencia({ status, resolvidaEm });
    expect(codigo(() => reabrir(alvo))).toBe('NAO_RESOLVIDA');
    expect(alvo.status).toBe(status);
  });

  it('exige justificativa', () => {
    expect(codigo(() => reabrir(resolvida(), { justificativa: '   ' }))).toBe(
      'COMENTARIO_OBRIGATORIO',
    );
  });

  it('reaberta e resolvida de novo, a janela recomeça do novo resolvida_em', () => {
    const alvo = resolvida();
    reabrir(alvo);
    const novaResolucao = new Date(resolvidaEm.getTime() + 20 * UM_DIA);
    alvo.transicionar({ paraStatus: EM_EXECUCAO, agora: novaResolucao });
    alvo.transicionar({ paraStatus: RESOLVIDA, comentario: 'Refeito.', agora: novaResolucao });

    expect(
      alvo.dentroDaJanelaPosResolucao(new Date(novaResolucao.getTime() + 9 * UM_DIA), 10),
    ).toBe(true);
  });
});

describe('Ocorrencia: aberta', () => {
  it.each([
    [RECEBIDA, true],
    [EM_ANALISE, true],
    [EM_EXECUCAO, true],
    [RESOLVIDA, false],
    [RECUSADA, false],
    [DUPLICADA, false],
  ])('%s → %s', (status, aberta) => {
    expect(ocorrencia({ status }).estaAberta()).toBe(aberta);
  });
});

describe('Ocorrencia: confirmação', () => {
  it.each([RECEBIDA, EM_ANALISE, EM_EXECUCAO])('outra pessoa confirma uma %s', (status) => {
    expect(codigo(() => ocorrencia({ status }).validarConfirmacao('vizinho'))).toBeUndefined();
  });

  it.each([RESOLVIDA, RECUSADA, DUPLICADA])('%s não aceita confirmação', (status) => {
    expect(codigo(() => ocorrencia({ status }).validarConfirmacao('vizinho'))).toBe(
      'OCORRENCIA_FECHADA',
    );
  });

  it('o autor não confirma a própria, nem depois de fechada', () => {
    expect(codigo(() => ocorrencia().validarConfirmacao(AUTOR))).toBe('AUTOR_NAO_CONFIRMA');
    expect(codigo(() => ocorrencia({ status: RESOLVIDA }).validarConfirmacao(AUTOR))).toBe(
      'AUTOR_NAO_CONFIRMA',
    );
  });

  it('com o autor anonimizado, qualquer pessoa pode confirmar', () => {
    expect(codigo(() => ocorrencia({ autorId: null }).validarConfirmacao('vizinho'))).toBe(
      undefined,
    );
  });
});

describe('Ocorrencia: visibilidade', () => {
  it.each([
    [RECEBIDA, true],
    [RESOLVIDA, true],
    [RECUSADA, false],
    [DUPLICADA, false],
  ])('%s aparece para outra pessoa: %s', (status, visivel) => {
    expect(ocorrencia({ status }).visivelPara('vizinho')).toBe(visivel);
    expect(ocorrencia({ status }).visivelPara(null)).toBe(visivel);
  });

  it('o autor vê a própria recusada ou duplicada', () => {
    expect(ocorrencia({ status: RECUSADA }).visivelPara(AUTOR)).toBe(true);
    expect(ocorrencia({ status: DUPLICADA }).visivelPara(AUTOR)).toBe(true);
  });
});
