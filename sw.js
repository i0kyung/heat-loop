// sw.js — 오프라인 대비 서비스워커. 네트워크 우선, 실패하면 캐시로 응답한다.
// (시연장 와이파이가 끊겨도 마지막으로 열었던 화면이 동작하도록)
const CACHE = 'heatloop-v3-3';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/style.css', './css/app-shell.css',
  './js/app.js', './js/factors.js', './js/thermal.js', './js/simulation.js', './js/sensor-adapter.js',
  './js/suitability.js', './js/economics.js', './js/flowviz.js', './js/chart.js', './js/product-art.js', './js/storage.js',
  './js/building-model.js', './js/building3d.js',
  './icons/icon-64.png', './assets/claim-logo.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('pretendard') || req.url.includes('/three@0.160.0/'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
