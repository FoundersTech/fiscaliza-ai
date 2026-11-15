// Detalhe público de ocorrências variadas. Os ids saem do próprio feed, no setup.
import { check, sleep } from 'k6';
import http from 'k6/http';

import { BASE_URL, MUNICIPIO, obter, opcoes, pausa, sortear } from './comum.js';

export const options = opcoes('detalhe');

/** Junta 1.000 ids percorrendo 20 páginas de 50 do feed (antes da carga, fora da medição). */
export function setup() {
  const ids = [];
  let cursor = null;
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const url =
      `${BASE_URL}/ocorrencias?municipio=${MUNICIPIO}&limite=50` +
      (cursor ? `&cursor=${cursor}` : '');
    const resposta = http.get(url, { tags: { endpoint: 'setup' } });
    if (resposta.status !== 200) throw new Error(`feed respondeu ${resposta.status}`);
    for (const item of resposta.json('itens')) ids.push(item.id);
    cursor = resposta.json('proximo_cursor');
    if (!cursor) break;
  }
  if (ids.length === 0) throw new Error('o feed veio vazio: gere o banco sintético antes');
  return { ids };
}

export default function (dados) {
  const resposta = obter(`${BASE_URL}/ocorrencias/${sortear(dados.ids)}`, 'detalhe');
  check(resposta, {
    'detalhe: 200': (r) => r.status === 200,
    'detalhe: veio o protocolo': (r) => r.status === 200 && Boolean(r.json('protocolo')),
  });
  sleep(pausa());
}
