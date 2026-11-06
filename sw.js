// Offline support. Serves cached files instantly and refreshes them in the
// background. Bump the version on every release: the new worker then
// downloads all files fresh, and the page reloads itself onto the new
// version (see js/app.js).
const CACHE = 'kanjilearn-v7';

// Always ask the server (it answers "not modified" cheaply when nothing
// changed). Without this the browser's own HTTP cache, which GitHub Pages
// lets keep files for 10 minutes, could hand back the old version and it
// would be stored as the new one.
const fresh = (url) => fetch(url, { cache: 'no-cache' });

const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/quiz.js',
  'js/storage.js',
  'js/strokes.js',
  'js/tracer.js',
  'js/map.js',
  'js/city.js',
  'js/mapscreen.js',
  'data/kanji.json',
  'data/strokes.json',
  'data/map.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(FILES.map(async (file) => {
    const response = await fresh(file);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    await cache.put(file, response);
  }))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const refresh = fresh(request.url)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    return refresh;
  }));
});
