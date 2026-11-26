// Zero-cache pass-through Service Worker (v2026.11.26b): clears all legacy Workbox/HTML caches
// and never intercepts fetch() requests so video uploads and auth cookies always go direct.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // Ignore cache cleanup errors
      }
      try {
        await self.clients.claim();
        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clientList) {
          client.postMessage({ type: 'SW_UPDATED' });
        }
      } catch {
        // Ignore claim errors
      }
    })()
  );
});
