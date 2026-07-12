/* MOF Explorer — Service Worker
   - Cache-first strategy for our static assets so the whole app
     (HTML/CSS/JS/CIF data) works offline once installed.
   - Network-only for the AI feedback API (needs live Gemini calls). */

const CACHE_NAME = 'mof-explorer-v3';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './structure.html',
  './game.html',
  './report.html',
  './css/common.css',
  './js/nav.js',
  './js/structure.js',
  './js/game.js',
  './js/report.js',
  './js/mof-viewer.js',
  './js/mof-cif-data.js',
  './favicon.svg',
  './manifest.webmanifest',
  './HKUST1.cif',
  './MOF5.cif',
  './UiO-66.cif',
  // Google Fonts CSS (fonts themselves are cached on demand)
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap',
  // Three.js CDN
  'https://unpkg.com/three@0.147.0/build/three.min.js',
];

/* ---- install: pre-cache core assets ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(OFFLINE_ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(err => {
          console.warn('[SW] failed to cache', url, err);
        })
      ))
    )
  );
  // become active immediately
  self.skipWaiting();
});

/* ---- activate: purge older caches ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ---- fetch strategy ---- */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET (POST for AI must always go to network).
  if (req.method !== 'GET') return;

  // API and AI endpoints — never cache, always network.
  const isApi =
    url.pathname.startsWith('/api/') ||
    url.host.endsWith('.vercel.app') ||
    url.host === 'api.mof-explorer.com' ||
    url.host === 'generativelanguage.googleapis.com';
  if (isApi) return;

  // Cache-first for everything else. Fall back to network. Fall back to
  // whatever is already cached (offline).
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached || Response.error());
    })
  );
});

/* ---- message: allow the page to trigger skipWaiting ---- */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
