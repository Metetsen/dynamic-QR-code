// Un Service Worker básico para pasar la validación de PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Por ahora, solo dejamos que las peticiones pasen normalmente a internet
  event.respondWith(fetch(event.request));
});