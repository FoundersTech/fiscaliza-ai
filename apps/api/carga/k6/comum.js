// Configuração comum aos cenários do teste de carga (passo a passo em ../README.md).
import http from 'k6/http';

/** Endereço da API, com o prefixo /api/v1. */
export const BASE_URL = (__ENV.BASE_URL || 'http://host.docker.internal:3148/api/v1').replace(
  /\/+$/,
  '',
);

/** Sorocaba (código IBGE) e os limites aproximados da área urbana. */
export const MUNICIPIO = 3552205;
export const AREA = { oeste: -47.6, sul: -23.62, leste: -47.32, norte: -23.38 };

const STATUS = ['RECEBIDO', 'EM_ANDAMENTO', 'RESOLVIDO'];
const CATEGORIAS = ['pavimentacao', 'iluminacao', 'limpeza-urbana', 'agua-esgoto'];

/**
 * Sobe até VUS usuários virtuais em 15 s, fica DURACAO nesse patamar e desce. Cada usuário
 * espera de 0,5 a 1,5 s entre as chamadas, como alguém rolando o feed ou mexendo no mapa.
 * O teste falha se o p95 passar de 500 ms ou se mais de 1% das requisições der erro.
 */
export function opcoes(nome) {
  const vus = Number(__ENV.VUS || 50);
  return {
    scenarios: {
      [nome]: {
        executor: 'ramping-vus',
        stages: [
          { duration: '15s', target: vus },
          { duration: __ENV.DURACAO || '1m', target: vus },
          { duration: '5s', target: 0 },
        ],
        gracefulRampDown: '5s',
      },
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      [`http_req_duration{endpoint:${nome}}`]: ['p(95)<500'],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  };
}

export function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

/** Filtros como o PWA manda: na maioria das vezes nenhum, às vezes status ou categoria. */
export function filtrosAleatorios() {
  const partes = [];
  const sorteio = Math.random();
  if (sorteio < 0.2) partes.push(`status=${sortear(STATUS)}`);
  else if (sorteio < 0.35) partes.push(`categoria=${sortear(CATEGORIAS)}`);
  return partes;
}

export function pausa() {
  return 0.5 + Math.random();
}

export function obter(url, endpoint) {
  return http.get(url, { tags: { endpoint, name: endpoint } });
}
