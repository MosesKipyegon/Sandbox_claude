// Service worker: makes SSD Journal work with no network.
//  - App files ("shell") are saved on install and always served from the device.
//  - Map tiles you have viewed are kept (up to MAX_TILES) so the map works offline where you've looked before.
// VERSION changes whenever a shell file changes (run: node tools/stamp-sw.js), which makes the browser
// fetch the new files and show the "new version" notice.
const VERSION = '83deb8c112';
const SHELL_CACHE = 'ssd-shell-' + VERSION;
const TILE_CACHE = 'ssd-tiles-v1';
const MAX_TILES = 2000;                      // ≈ 40 MB
const TILE_MAX_AGE = 30 * 24 * 3600 * 1000;  // refresh a cached tile after 30 days, when online

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/app.css',
  'js/app.js',
  'js/backup.js',
  'js/config.js',
  'js/data-page.js',
  'js/db.js',
  'js/dom.js',
  'js/drive.js',
  'js/feed.js',
  'js/form.js',
  'js/map.js',
  'js/photos.js',
  'js/pwa.js',
  'js/samples.js',
  'js/seed-places.js',
  'js/sync.js',
  'js/sync-ui.js',
  'js/viewer.js',
  'data/south-sudan.geojson',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/fflate/fflate.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'fonts/fraunces.woff2',
  'fonts/fraunces-italic.woff2',
  'fonts/inter.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  // Don't take over immediately: the page asks the user first (see js/pwa.js)
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('ssd-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(tile(req));
    return;
  }
  if (url.origin !== self.location.origin) return;  // anything else external: browser handles it

  // App pages (hash routes all load index.html)
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then(r => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});

// Map tiles: from the device first; from the network only when missing or very old.
let putsSinceTrim = 0;
async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    const age = Date.now() - new Date(cached.headers.get('date') || 0).getTime();
    if (age < TILE_MAX_AGE || !navigator.onLine) return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      if (++putsSinceTrim >= 50) { putsSinceTrim = 0; trimTiles(cache); }
    }
    return res;
  } catch (e) {
    return cached || Response.error();   // offline and never seen: Leaflet shows the outline underneath
  }
}

async function trimTiles(cache) {
  const keys = await cache.keys();       // oldest first
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
