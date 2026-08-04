const CACHE_NAME = 'formulavest-v1';
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
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      if (event.request.method === 'GET') {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match('/landing.html')))
  );
});
