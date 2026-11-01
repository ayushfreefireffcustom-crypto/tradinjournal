/* TRADElogs service worker: Web Push notifications, and an offline page for
   the installed app (H14). Pages always come from the network; only when the
   network is down is the cached offline page shown. API calls are never
   touched or cached. */

const OFFLINE = 'tl-offline-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE).then(c => c.addAll(['/offline.html', '/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tl-offline-') && k !== OFFLINE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
});

self.addEventListener('push', event => {
  let data = { title: 'TRADElogs', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    /* non-JSON payload — keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.url || 'tradelogs',
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
