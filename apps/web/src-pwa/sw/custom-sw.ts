/*
 * This file (which will be your service worker)
 * is picked up by the build system ONLY if
 * quasar.config file > pwa > workboxMode is set to "InjectManifest"
 */

import { clientsClaim } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

void self.skipWaiting();
clientsClaim();

// Use with precache injection
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

if (import.meta.env.QUASAR_PROD) {
  // Non-SSR/SSG fallbacks to index.html
  // Production SSR/SSG fallbacks to offline.html (except for dev)
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL(import.meta.env.QUASAR_PWA_FALLBACK_HTML), {
      denylist: [new RegExp(import.meta.env.QUASAR_PWA_SERVICE_WORKER_REGEX), /workbox-(.)*\.js$/],
    }),
  );
}

const TITULO_PADRAO = 'Fiscaliza Aí!';
const URL_PADRAO = '/alertas';

interface AvisoPush {
  titulo: string;
  corpo: string;
  url: string;
}

/** A API manda JSON `{ titulo, corpo, url }`; um texto simples vira o corpo do aviso. */
function lerAviso(dados: PushMessageData | null): AvisoPush {
  const aviso: AvisoPush = { titulo: TITULO_PADRAO, corpo: '', url: URL_PADRAO };
  if (!dados) return aviso;
  const texto = dados.text();
  try {
    const json: unknown = JSON.parse(texto);
    if (typeof json === 'object' && json !== null) {
      const { titulo, corpo, url } = json as Record<string, unknown>;
      if (typeof titulo === 'string' && titulo) aviso.titulo = titulo;
      if (typeof corpo === 'string') aviso.corpo = corpo;
      if (typeof url === 'string' && url) aviso.url = url;
      return aviso;
    }
  } catch {
    // Não é JSON: segue como texto simples.
  }
  aviso.corpo = texto;
  return aviso;
}

/** Só abre endereços do próprio app; qualquer outro cai na aba Alertas. */
function destinoNaOrigem(url: unknown): string {
  try {
    const destino = new URL(
      typeof url === 'string' && url ? url : URL_PADRAO,
      self.location.origin,
    );
    if (destino.origin === self.location.origin) return destino.href;
  } catch {
    // URL inválida: usa a padrão.
  }
  return new URL(URL_PADRAO, self.location.origin).href;
}

self.addEventListener('push', (event) => {
  const aviso = lerAviso(event.data);
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.corpo,
      data: { url: aviso.url },
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-128x128.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const dados = event.notification.data as { url?: unknown } | null;
  const destino = destinoNaOrigem(dados?.url);
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const janela = janelas.find(
        (cliente) => new URL(cliente.url).origin === self.location.origin,
      );
      if (janela) {
        const focada = await janela.focus();
        if ('navigate' in focada) await focada.navigate(destino);
        return;
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
