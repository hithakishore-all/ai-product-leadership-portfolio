// Readaroo service worker: makes the app installable and lets it open with no connection.
// App files: network first (you always get the latest), falling back to the saved copy offline.
// Fonts and icons: saved copy first. API calls: always the network; offline gets a clear error.
const VERSION = 'readaroo-0.3.0';
const APP_SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'api-http.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ error: "You're offline. Reconnect to borrow, save reading time or book events.", code: 'offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )));
    return;
  }

  const cacheFirst = url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com') || url.pathname.includes('/icons/');
  if (cacheFirst) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') caches.open(VERSION).then((c) => c.put(req, res.clone()));
      return res;
    })));
    return;
  }

  if (url.origin !== location.origin) return;
  event.respondWith(fetch(req).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
