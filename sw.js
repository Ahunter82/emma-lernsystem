const CACHE = 'emma-v2';
const ASSETS = [
  '/emma-lernsystem/',
  '/emma-lernsystem/index.html',
  '/emma-lernsystem/style.css',
  '/emma-lernsystem/app.js',
  '/emma-lernsystem/drive.js',
  '/emma-lernsystem/pdf.js',
  '/emma-lernsystem/icon-192.svg',
  '/emma-lernsystem/icon-512.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network first, Cache fallback
self.addEventListener('fetch', e => {
  // Nur eigene Dateien cachen, keine API-Calls
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
