import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, validarAmbiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { GEOCODING_PORT, type GeocodingPort } from './application/portas.js';
import { ResolverTerritorio } from './application/territorio.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };
const SAO_PAULO = { lat: -23.5505, lng: -46.6333 };

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

describe('Território e configuração pública', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEOCODING_PORT)
      .useValue(geocoding)
      .overrideProvider(AMBIENTE)
      .useValue(validarAmbiente({ ...process.env, GOOGLE_MAPS_MAP_ID: 'mapa-de-teste' }))
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await aplicarCargaInicial(prisma);

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const redis = app.get<Redis>(REDIS);
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    const cadastro = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/cadastro`,
      payload: {
        nome: 'Maria da Silva',
        apelido_publico: 'maria.s',
        email: 'maria@exemplo.test',
        senha: 'senha-forte-1',
        politica_versao: '1',
      },
    });
    token = cadastro.json<{ access_token: string }>().access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.municipio.update({ where: { id: SOROCABA.id }, data: { ativo: true } });
    await prisma.categoria.updateMany({ data: { ativa: true } });
    geocoding.enderecoDe.mockReset();
  });

  function get(rota: string, autorizado = true) {
    return app.inject({
      method: 'GET',
      url: `/${PREFIXO_API}/${rota}`,
      headers: autorizado ? { authorization: `Bearer ${token}` } : {},
    });
  }

  describe('GET /config/publica', () => {
    it('é pública e traz Sorocaba, as categorias ativas e os parâmetros do PWA', async () => {
      const resposta = await get('config/publica', false);

      expect(resposta.statusCode).toBe(200);
      const config = resposta.json<{
        municipio: {
          centro: { lat: number; lng: number };
          bbox: { sul: number; oeste: number; norte: number; leste: number };
        };
        categorias_ativas: { slug: string; schema_atributos: unknown[] }[];
      }>();
      expect(config).toMatchObject({
        municipio: { id: SOROCABA.id, nome: 'Sorocaba', uf: 'SP' },
        urgente_min_confirmacoes: 10,
        politica_versao: '1',
        google_maps_map_id: 'mapa-de-teste',
      });
      expect(config.categorias_ativas.map((categoria) => categoria.slug)).toEqual([
        'agua-esgoto',
        'iluminacao',
        'limpeza-urbana',
        'pavimentacao',
      ]);
      expect(config.categorias_ativas[0]).toMatchObject({
        id: expect.any(Number) as number,
        nome: 'Água e esgoto',
        icone: 'water_drop',
        schema_atributos: [],
      });

      const { centro, bbox } = config.municipio;
      expect(centro.lat).toBeGreaterThan(bbox.sul);
      expect(centro.lat).toBeLessThan(bbox.norte);
      expect(centro.lng).toBeGreaterThan(bbox.oeste);
      expect(centro.lng).toBeLessThan(bbox.leste);
      const [dentro] = await prisma.$queryRaw<{ dentro: boolean }[]>`
        SELECT ST_Contains(area, ST_SetSRID(ST_MakePoint(${centro.lng}::float8, ${centro.lat}::float8), 4326)) AS dentro
        FROM municipio WHERE id = ${SOROCABA.id}`;
      expect(dentro?.dentro).toBe(true);
    });

    it('categoria desativada sai da lista', async () => {
      await prisma.categoria.update({ where: { slug: 'iluminacao' }, data: { ativa: false } });

      const config = (await get('config/publica', false)).json<{
        categorias_ativas: { slug: string }[];
      }>();

      expect(config.categorias_ativas.map((categoria) => categoria.slug)).not.toContain(
        'iluminacao',
      );
    });

    it('sem município ativo, responde 503', async () => {
      await prisma.municipio.update({ where: { id: SOROCABA.id }, data: { ativo: false } });

      const resposta = await get('config/publica', false);

      expect(resposta.statusCode).toBe(503);
      expect(resposta.json()).toMatchObject({ codigo: 'MUNICIPIO_NAO_CONFIGURADO' });
    });
  });

  describe('GET /geo/reverso', () => {
    function reverso({ lat, lng }: { lat: number | string; lng: number | string }) {
      return get(`geo/reverso?lat=${lat}&lng=${lng}`);
    }

    it('exige login', async () => {
      const resposta = await get(`geo/reverso?lat=${CENTRO.lat}&lng=${CENTRO.lng}`, false);

      expect(resposta.statusCode).toBe(401);
    });

    it('no centro de Sorocaba, devolve o endereço com o bairro', async () => {
      geocoding.enderecoDe.mockResolvedValue({
        rua: 'Rua Quinze de Novembro',
        numero: '482',
        bairro: 'Centro',
      });

      const resposta = await reverso(CENTRO);

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual({
        endereco: 'Rua Quinze de Novembro, 482 · Centro',
        dentro_da_area: true,
      });
      expect(geocoding.enderecoDe).toHaveBeenCalledWith(CENTRO, expect.any(AbortSignal));
    });

    it('um ponto fora de Sorocaba devolve dentro_da_area: false, sem buscar o endereço', async () => {
      const resposta = await reverso(SAO_PAULO);

      expect(resposta.json()).toEqual({ endereco: null, dentro_da_area: false });
      expect(geocoding.enderecoDe).not.toHaveBeenCalled();
    });

    it('com o município desativado, o centro também fica fora da área', async () => {
      await prisma.municipio.update({ where: { id: SOROCABA.id }, data: { ativo: false } });

      expect((await reverso(CENTRO)).json()).toEqual({ endereco: null, dentro_da_area: false });
    });

    it('com o geocodificador fora do ar, o endereço vem null e o ponto continua válido', async () => {
      geocoding.enderecoDe.mockRejectedValue(new Error('Nominatim respondeu 503'));

      const resposta = await reverso(CENTRO);

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual({ endereco: null, dentro_da_area: true });
    });

    it.each([
      [{ lat: '', lng: CENTRO.lng }, 'lat'],
      [{ lat: 'abc', lng: CENTRO.lng }, 'lat'],
      [{ lat: 91, lng: CENTRO.lng }, 'lat'],
      [{ lat: CENTRO.lat, lng: 181 }, 'lng'],
    ])('coordenada inválida %j dá 422 em %s', async (ponto, campo) => {
      const resposta = await reverso(ponto);

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'VALIDACAO',
        detalhes: { campos: { [campo]: expect.any(Array) as string[] } },
      });
    });
  });

  it('ResolverTerritorio devolve o município, a sigla e o órgão do ponto', async () => {
    const orgao = await prisma.orgao.findUniqueOrThrow({ where: { municipioId: SOROCABA.id } });

    expect(await app.get(ResolverTerritorio).executar(CENTRO)).toEqual({
      municipioId: SOROCABA.id,
      municipioSigla: 'SOR',
      orgaoId: orgao.id,
    });
    expect(await app.get(ResolverTerritorio).executar(SAO_PAULO)).toBeNull();
  });
});
