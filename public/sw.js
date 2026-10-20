const CACHE_NAME = 'formulavest-v6';
const SHELL_ASSETS = [
  '/',
  '/landing.html',
  '/landing.css',
  '/landing.js',
  '/manifest.json',
  '/icon.svg',
  '/login.html',
  '/login.css',
  '/login.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Only the explicit offline shell is intercepted; dynamic routes stay network-only.
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    !SHELL_ASSETS.includes(requestUrl.pathname)
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async response => {
        if (response.ok && SHELL_ASSETS.includes(requestUrl.pathname)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        return (await caches.match(event.request)) || new Response('Offline', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
