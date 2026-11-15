import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** O arquivo vai para a raiz do build (public/), e o Cloudflare Pages aplica os headers dele. */
const HEADERS = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const WORKFLOW = readFileSync(
  new URL('../../../.github/workflows/deploy-staging.yml', import.meta.url),
  'utf8',
);

/** Os headers do bloco de um caminho do _headers (linhas indentadas abaixo dele). */
function headersDe(caminho: string): Map<string, string> {
  const linhas = HEADERS.split(/\r?\n/).filter((linha) => !linha.trimStart().startsWith('#'));
  const inicio = linhas.indexOf(caminho);
  expect(inicio, `bloco ${caminho} no _headers`).toBeGreaterThanOrEqual(0);
  const headers = new Map<string, string>();
  for (const linha of linhas.slice(inicio + 1)) {
    if (!/^\s+\S/.test(linha)) break;
    const [nome, ...valor] = linha.trim().split(':');
    headers.set(nome!.toLowerCase(), valor.join(':').trim());
  }
  return headers;
}

const csp = new Map(
  (headersDe('/*').get('content-security-policy') ?? '')
    .split(';')
    .map((diretiva) => diretiva.trim().split(/\s+/))
    .filter(([nome]) => nome)
    .map(([nome, ...fontes]) => [nome!, fontes]),
);

/** Se a diretiva (ou o default-src, na falta dela) libera a URL. */
function libera(diretiva: string, endereco: string): boolean {
  const fontes = csp.get(diretiva) ?? csp.get('default-src') ?? [];
  const { protocol, host } = new URL(endereco);
  return fontes.some((fonte) => {
    if (fonte === `${protocol}`) return true;
    const curinga = /^https:\/\/\*\.(.+)$/.exec(fonte);
    if (curinga) return protocol === 'https:' && host.endsWith(`.${curinga[1]}`);
    return fonte === `${protocol}//${host}`;
  });
}

describe('headers do PWA no Cloudflare Pages', () => {
  it('toda resposta tem Content-Security-Policy, e o resto dos headers de segurança', () => {
    const headers = headersDe('/*');

    expect(headers.get('content-security-policy')).toBeTruthy();
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('só a própria origem por padrão, sem plugins, sem ser embutido e sem script inline', () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
  });

  it('libera a API de staging (a do deploy) e a de produção', () => {
    const apiStaging = /API_URL:\s*(\S+)/.exec(WORKFLOW)?.[1];
    expect(apiStaging).toBeDefined();

    expect(libera('connect-src', apiStaging!)).toBe(true);
    expect(libera('connect-src', 'https://api.fiscalizaai.app')).toBe(true);
    expect(libera('connect-src', 'https://api.outro-site.com')).toBe(false);
  });

  it('libera as fotos públicas e o envio direto ao R2 pela URL pré-assinada', () => {
    expect(libera('img-src', 'https://fotos-staging.fiscalizaai.app/x.webp')).toBe(true);
    expect(libera('img-src', 'https://fotos.fiscalizaai.app/x.webp')).toBe(true);
    expect(libera('img-src', 'blob:')).toBe(true);
    expect(libera('connect-src', 'https://conta123.r2.cloudflarestorage.com/fa-uploads/x')).toBe(
      true,
    );
  });

  it('libera o Maps JavaScript API e o que ele carrega', () => {
    expect(libera('script-src', 'https://maps.googleapis.com/maps/api/js')).toBe(true);
    expect(libera('script-src', 'https://maps.gstatic.com/x.js')).toBe(true);
    expect(libera('img-src', 'https://maps.gstatic.com/tile.png')).toBe(true);
    expect(libera('connect-src', 'https://maps.googleapis.com/$rpc')).toBe(true);
    expect(libera('style-src', 'https://fonts.googleapis.com/css')).toBe(true);
    expect(libera('font-src', 'https://fonts.gstatic.com/roboto.woff2')).toBe(true);
    expect(csp.get('worker-src')).toContain('blob:');
  });
});
