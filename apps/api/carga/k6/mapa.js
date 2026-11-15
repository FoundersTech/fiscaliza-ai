// Mapa público: áreas de tamanhos variados dentro de Sorocaba, como em zooms diferentes.
import { check, sleep } from 'k6';

import { AREA, BASE_URL, filtrosAleatorios, obter, opcoes, pausa, sortear } from './comum.js';

export const options = opcoes('mapa');

/**
 * Largura da área em graus, de acordo com o zoom do Google Maps num celular: a cidade
 * inteira (zoom 11-12), um bairro (zoom 14) e algumas ruas (zoom 16).
 */
const ZOOMS = [
  { peso: 0.25, largura: 0.2 },
  { peso: 0.45, largura: 0.04 },
  { peso: 0.3, largura: 0.01 },
];

function areaAleatoria() {
  let sorteio = Math.random();
  const zoom = ZOOMS.find((z) => (sorteio -= z.peso) < 0) || sortear(ZOOMS);
  const largura = zoom.largura;
  const altura = largura * 1.8; // tela em pé
  const oeste = AREA.oeste + Math.random() * Math.max(AREA.leste - AREA.oeste - largura, 0);
  const sul = AREA.sul + Math.random() * Math.max(AREA.norte - AREA.sul - altura, 0);
  return [oeste, sul, oeste + largura, sul + altura].map((n) => n.toFixed(5)).join(',');
}

export default function () {
  const consulta = [`bbox=${areaAleatoria()}`, ...filtrosAleatorios()];
  const resposta = obter(`${BASE_URL}/ocorrencias/mapa?${consulta.join('&')}`, 'mapa');
  check(resposta, {
    'mapa: 200': (r) => r.status === 200,
    'mapa: veio a lista de pontos': (r) => r.status === 200 && Array.isArray(r.json('pontos')),
  });
  sleep(pausa());
}
