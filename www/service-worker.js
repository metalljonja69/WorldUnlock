// Netzwerk zuerst, Cache nur als Offline-Rückfall. So kommen neue
// Versionen sofort an, ohne dass der Cache-Name erhöht werden muss.
const cacheName = 'worldunlocked-v12';
const localFiles = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/gps.js',
  './js/map.js',
  './js/storage.js',
  './js/services/exploration-engine.js',
  './js/services/gps-service.js',
  './js/services/location-filter.js',
  './js/services/place-service.js',
  './js/ui/achievements.js',
  './js/ui/avatars.js',
  './js/ui/dashboard.js',
  './js/ui/navigation.js',
  './js/ui/profile.js',
  './js/ui/settings.js',
  './js/ui/statistics.js',
  './js/ui/world.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(localFiles))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== cacheName)
          .map((name) => caches.delete(name))
      )),
      clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Nur eigene Dateien; Karten-Kacheln und APIs gehen direkt ans Netz.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cachedResponse) => (
        cachedResponse || Response.error()
      )))
  );
});
