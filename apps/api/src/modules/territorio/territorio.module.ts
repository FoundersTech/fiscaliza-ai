import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { ObterConfigPublica } from './application/config-publica.js';
import { GEOCODING_PORT, REPOSITORIO_TERRITORIO } from './application/portas.js';
import { ConsultarPonto, EnderecoReverso, ResolverTerritorio } from './application/territorio.js';
import { GeocodingComCache } from './infrastructure/geocoding-com-cache.js';
import {
  GeocodingNominatimAdapter,
  INTERVALO_NOMINATIM_MS,
} from './infrastructure/geocoding-nominatim.adapter.js';
import { IntervaloRedis } from './infrastructure/intervalo-redis.js';
import { RepositorioTerritorioPrisma } from './infrastructure/repositorio-territorio.prisma.js';
import { TerritorioController } from './presentation/territorio.controller.js';

/** Município e órgão de cada ponto, endereço reverso e a configuração pública do PWA. */
@Module({
  controllers: [TerritorioController],
  providers: [
    ResolverTerritorio,
    EnderecoReverso,
    ConsultarPonto,
    ObterConfigPublica,
    { provide: REPOSITORIO_TERRITORIO, useClass: RepositorioTerritorioPrisma },
    {
      provide: GEOCODING_PORT,
      inject: [AMBIENTE, REDIS],
      useFactory: (ambiente: Ambiente, redis: Redis) =>
        new GeocodingComCache(
          redis,
          new GeocodingNominatimAdapter(
            {
              url: ambiente.NOMINATIM_URL,
              // A política de uso do Nominatim exige identificar o app.
              userAgent: `FiscalizaAi/${ambiente.APP_VERSAO} (+${ambiente.WEB_URL})`,
            },
            new IntervaloRedis(redis, 'geo:nominatim:proximo', INTERVALO_NOMINATIM_MS),
          ),
        ),
    },
  ],
  exports: [ResolverTerritorio, EnderecoReverso],
})
export class TerritorioModule {}
