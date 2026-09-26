const CACHE_NAME = 'formulavest-v5';
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

  // Nunca armazene chamadas de API ou páginas autenticadas. Cachear /me, painéis
  // ou arquivos JS indiscriminadamente fazia a aplicação reaproveitar sessões e
  // versões antigas do front-end.
  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith('/admin') ||
    requestUrl.pathname.startsWith('/professor') ||
    requestUrl.pathname.startsWith('/me') ||
    requestUrl.pathname.startsWith('/provas')
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
        const cached = await caches.match(event.request);
        return cached || (await caches.match('/landing.html'));
      })
  );
});
