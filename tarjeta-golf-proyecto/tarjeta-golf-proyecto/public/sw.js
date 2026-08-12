/* Service worker de Tarjeta de Golf.
   Guarda una copia de la app (HTML, CSS, JS y librerías) para que arranque
   SIN COBERTURA una vez abierta al menos una vez con conexión.
   Sube CACHE_VERSION cada vez que cambien los archivos para forzar la actualización. */
const CACHE_VERSION = 'golf-v3';

/* Núcleo imprescindible: sin esto la app no arranca. Si algo falla, falla la
   instalación (y se reintenta en la siguiente visita). */
const CRITICAL = [
  './',
  './index.html',
  './manifest.json',
  './css/estilos.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* Resto de recursos (todos los JS, datos y librerías CDN). Se cachean con
   tolerancia a fallos: si alguno da 404 (p.ej. un módulo en desarrollo) o la
   CDN no responde, NO se aborta la instalación; el resto queda cacheado igual. */
const OPTIONAL = [
  './handicap.json',
  './js/nucleo.js',
  './js/datos.js',
  './js/comun.js',
  './js/navegacion.js',
  './js/gps-datos.js',
  './js/pantalla-historial.js',
  './js/pantalla-rendimiento.js',
  './js/pantalla-jugar.js',
  './js/pantalla-yo.js',
  './js/pantalla-gps.js',
  './js/buscador-mapa.js',
  './js/inicio.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(CRITICAL);
    await Promise.allSettled(OPTIONAL.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // no tocamos escrituras (Firestore, etc.)
  const url = new URL(req.url);

  // Navegación: intenta la red; si no hay, sirve el index cacheado (arranca offline).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isCDN = url.host === 'www.gstatic.com' || url.host === 'unpkg.com';

  // App shell propio: responde ya desde caché y refresca por detrás (stale-while-revalidate).
  if (sameOrigin) { e.respondWith(staleWhileRevalidate(req)); return; }

  // Librerías CDN (versión fija en la URL): primero caché, luego red.
  if (isCDN) { e.respondWith(cacheFirst(req)); return; }

  // Todo lo demás (teselas de mapa, Firestore/Auth de Google): red normal, sin interceptar.
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || fetch(req);
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
