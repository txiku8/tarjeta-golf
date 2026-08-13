/* Service worker de Tarjeta de Golf.
   Guarda una copia de la app (HTML, CSS, JS y librerías) para que arranque
   SIN COBERTURA una vez abierta al menos una vez con conexión.

   ESTRATEGIA: app-shell atómico. Todo el "esqueleto" (index + CSS + todos los JS)
   se guarda junto bajo una misma versión y se sirve SIEMPRE de la misma versión,
   para que el HTML y el JavaScript NUNCA sean de generaciones distintas (eso
   causaba la pantalla en blanco). Al cambiar archivos, sube CACHE_VERSION: el
   nuevo worker borra la caché vieja entera y recarga la app limpia. */
const CACHE_VERSION = 'golf-v19';

/* Esqueleto propio: se guarda de forma atómica (o todo, o nada). Todos existen. */
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/estilos.css',
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
  './handicap.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* Librerías CDN (versión fija en la URL). Mejor esfuerzo: si alguna no responde
   al instalar, NO abortamos; se cachean luego en la primera petición con red. */
const CDN = [
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(SHELL);                                  // atómico: shell coherente
    await Promise.allSettled(CDN.map(u => cache.add(u)));       // tolerante
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))); // borra lo viejo
    await self.clients.claim();
    // Recarga las ventanas abiertas para que dejen atrás cualquier copia rota.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) { try { await c.navigate(c.url); } catch (_) {} }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // no tocamos escrituras (Firestore, etc.)
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCDN = url.host === 'www.gstatic.com' || url.host === 'unpkg.com';

  // Navegación → sirve SIEMPRE el index de esta versión (coherente con su JS).
  if (req.mode === 'navigate') {
    e.respondWith(shellIndex());
    return;
  }
  // Esqueleto propio y librerías CDN → primero caché (coherente), si no, red.
  if (sameOrigin || isCDN) { e.respondWith(cacheFirst(req)); return; }
  // Resto (teselas de mapa, Firestore/Auth de Google): red normal, sin interceptar.
});

async function shellIndex() {
  const cache = await caches.open(CACHE_VERSION);
  const cached = (await cache.match('./index.html')) || (await cache.match('./'));
  if (cached) return cached;
  try { return await fetch('./index.html'); } catch (_) { return Response.error(); }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return cached || Response.error();
  }
}
