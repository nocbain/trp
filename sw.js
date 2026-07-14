/* Voyage · service worker: app disponible sin conexión.
   - Shell de la app: precacheado en la instalación, cache-first.
   - Mosaicos del mapa (tile.openstreetmap.org): cache-first con
     relleno en segundo plano; se comparte caché con la descarga
     manual de "Guardar mapa sin conexión". */
"use strict";

const SHELL_CACHE = "voyage-shell-v6";
const TILE_CACHE = "voyage-tiles-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./vendor/fonts/inter-latin-400-normal.woff2",
  "./vendor/fonts/inter-latin-500-normal.woff2",
  "./vendor/fonts/inter-latin-600-normal.woff2",
  "./vendor/fonts/inter-latin-700-normal.woff2",
  "./vendor/maplibre/maplibre-gl.js",
  "./vendor/maplibre/maplibre-gl.css",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== TILE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Mapa (mosaicos vectoriales, estilo, sprites y glifos):
  // cache-first, y se guarda todo lo que se navega.
  if (url.hostname === "tiles.openfreemap.org") {
    e.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch {
          return new Response("", { status: 404, statusText: "offline" });
        }
      })
    );
    return;
  }

  // Shell de la app: SIEMPRE la versión precacheada completa, sin
  // actualizar archivos sueltos en segundo plano. Así nunca se mezclan
  // el index.html de una versión con el app.js de otra: las
  // actualizaciones llegan solo como una versión nueva atómica
  // (nuevo SHELL_CACHE precacheado en install y activado de golpe).
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try { return await fetch(e.request); }
        catch { return (await cache.match("./index.html")) || new Response("", { status: 503 }); }
      })
    );
    return;
  }

  // Resto (geocodificador, etc.): red con fallo silencioso.
  e.respondWith(fetch(e.request).catch(() => new Response("", { status: 503 })));
});
