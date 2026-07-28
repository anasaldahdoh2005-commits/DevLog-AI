const CACHE_NAME = 'devlog-ai-v15';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/script.js',
  './js/router.js',
  './js/auth.js',
  './js/ui.js',
  './js/db.js',
  './js/store.js',
  './js/supabase.js',
  './js/ai.js',
  './js/linkedin.js',
  './manifest.webmanifest',
  './imges/logo-192.png',
  './imges/logo-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(async (keys) => {
        const oldAppCaches = keys.filter(
          (key) => key.startsWith('devlog-ai-') && key !== CACHE_NAME
        );

        await Promise.all(oldAppCaches.map((key) => caches.delete(key)));
        await self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (['script', 'style'].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request);
    const requestUrl = new URL(request.url);
    if (
      response
      && response.status === 200
      && response.type === 'basic'
      && !requestUrl.search
    ) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('./index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('./index.html')) || Response.error();
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status === 200 && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetUrl = new URL('./#/dashboard', self.registration.scope).href;

      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
