const CACHE_NAME = 'devlog-ai-v11';
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

        // Reload existing installed/mobile clients once so an old ui.js cannot
        // leave newly-rendered buttons without their click handlers.
        if (oldAppCaches.length > 0) {
          const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
          });
          await Promise.all(windows.map((client) =>
            client.navigate(client.url).catch(() => undefined)
          ));
        }
      })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || ['script', 'style'].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

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
    if (request.mode === 'navigate') return caches.match('./index.html');
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
      const targetUrl = new URL('./#/dashboard', self.location.origin).href;

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
