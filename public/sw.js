// Service Worker for Dropea CRM PWA & Native Mobile Notifications
const CACHE_NAME = 'dropea-assets-v3';
const PRECACHE_URLS = [
  '/notification-logo-d.png',
  '/notification-bag.png',
  '/sonido-shopify.mp3',
  '/shopify.mp3',
  '/pwa-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// Push notification from Web Push Server (works even when PWA is closed / screen locked)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Nuevo pedido',
    body: 'Recibiste un nuevo pedido',
    badge: '/notification-logo-d.png',
    tag: 'sale-' + Date.now()
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  const uniqueTag = data.tag || ('sale-' + Date.now());
  const opts = {
    body: data.body,
    badge: data.badge || '/notification-logo-d.png',
    vibrate: [200, 100, 200, 100, 250],
    data: data.data || { url: '/' },
    tag: uniqueTag,
    renotify: true
  };
  if (data.icon) opts.icon = data.icon;

  event.waitUntil(self.registration.showNotification(data.title, opts));
});

// Direct message from foreground app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const uniqueTag = options?.tag || ('sale-' + Date.now());
    const opts = {
      badge: '/notification-logo-d.png',
      vibrate: [200, 100, 200, 100, 250],
      ...options,
      tag: uniqueTag,
      renotify: true
    };
    self.registration.showNotification(title, opts);
  }
});
