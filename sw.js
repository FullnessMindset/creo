const CACHE_NAME = 'creo-v1';
const STATIC_ASSETS = [
  '/creo/',
  '/creo/explore.html',
  '/creo/comunidad.html',
  '/creo/profile.html',
  '/creo/index.html',
  '/creo/messages.html',
  '/creo/brand-deals.html',
  '/creo/offline.html',
  '/creo/shared.js',
  '/creo/assets/logo-icon.png',
  '/creo/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.origin === 'https://qddxoyjtoxtdcezwuvcq.supabase.co' ||
      url.origin === 'https://checkout.stripe.com' ||
      url.origin === 'https://connect.stripe.com' ||
      url.hostname === 'api.giphy.com') {
    return;
  }

  if (url.origin === 'https://cdn.tailwindcss.com' || url.origin === 'https://cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetched = fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/creo/offline.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => new Response('', { status: 408 }));
    })
  );
});
