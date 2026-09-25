/* Minik Çiftçiler – service worker: uygulama internetsiz de açılır.
   Sayfa: önce ağ (güncel içerik), ağ yoksa/yavaşsa önbellek.
   İkon/manifest: önbellekten anında, arkada güncellenir. */
const CACHE = 'kucuk-ciftciler-v4';
const SHELL = [
  './',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];
const NETWORK_TIMEOUT = 4000; /* zayıf wifi'de çocuk beklemesin */

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SCOPE = new URL('./', self.location).pathname;
function isAppPage(url) {
  return url.pathname === SCOPE || url.pathname === SCOPE + 'index.html';
}

async function pageNetworkFirst(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then(res => {
    if (res.ok && isAppPage(new URL(res.url))) cache.put('./', res.clone());
    return res;
  });
  event.waitUntil(network.then(() => {}, () => {})); /* zaman aşımında da önbellek güncellensin */
  const cached = await cache.match('./');
  if (!cached) return network;
  const timeout = new Promise(res => setTimeout(() => res(cached), NETWORK_TIMEOUT));
  return Promise.race([network.catch(() => cached), timeout]);
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const network = fetch(event.request).then(res => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(network.then(() => {}, () => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return; /* CDN vb. doğrudan ağdan */
  if (req.mode === 'navigate') {
    /* eski adres yönlendirme sayfası ağdan gelsin; ağ yoksa uygulamayı aç */
    if (!isAppPage(url)) {
      event.respondWith(fetch(req).catch(() => caches.match('./')));
      return;
    }
    event.respondWith(pageNetworkFirst(event));
    return;
  }
  event.respondWith(staleWhileRevalidate(event));
});
