// Feed público: primeira página e, em parte das visitas, mais algumas páginas pelo cursor.
import { check, sleep } from 'k6';

import { BASE_URL, filtrosAleatorios, MUNICIPIO, obter, opcoes, pausa } from './comum.js';

export const options = opcoes('feed');

export default function () {
  const filtros = [`municipio=${MUNICIPIO}`, ...filtrosAleatorios()];
  // 60% só olham a primeira página; o resto rola até 5 páginas.
  const paginas = Math.random() < 0.6 ? 1 : 2 + Math.floor(Math.random() * 4);
  let cursor = null;

  for (let pagina = 0; pagina < paginas; pagina += 1) {
    const consulta = cursor ? [...filtros, `cursor=${cursor}`] : filtros;
    const resposta = obter(`${BASE_URL}/ocorrencias?${consulta.join('&')}`, 'feed');
    const ok = check(resposta, {
      'feed: 200': (r) => r.status === 200,
      'feed: veio uma página': (r) => r.status === 200 && Array.isArray(r.json('itens')),
    });
    if (!ok) break;
    cursor = resposta.json('proximo_cursor');
    sleep(pausa());
    if (!cursor) break;
  }
}
