const CACHE = 'room-borrowing-v5';
const ASSETS = ['index.html', 'css/styles.css', 'js/utils.js', 'js/db.js', 'js/rooms.js', 'js/records.js', 'js/statistics.js', 'js/reports.js', 'js/backup.js', 'js/app.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('index.html'))));
});
