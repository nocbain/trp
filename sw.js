/* Voyage · service worker: app disponible sin conexión.
   - Shell de la app: precacheado en la instalación, cache-first.
   - Mosaicos del mapa (tile.openstreetmap.org): cache-first con
     relleno en segundo plano; se comparte caché con la descarga
     manual de "Guardar mapa sin conexión". */
"use strict";

const SHELL_CACHE = "voyage-shell-v1";
const TILE_CACHE = "voyage-tiles-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
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

  // Mosaicos del mapa: cache-first, y se guarda lo que se navega.
  if (url.hostname === "tile.openstreetmap.org") {
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

  // Shell de la app: cache-first con actualización en segundo plano.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const hit = await cache.match(e.request);
        const refresh = fetch(e.request)
          .then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; })
          .catch(() => null);
        return hit || refresh.then(r => r || caches.match("./index.html"));
      })
    );
    return;
  }

  // Resto (geocodificador, etc.): red con fallo silencioso.
  e.respondWith(fetch(e.request).catch(() => new Response("", { status: 503 })));
});
