/* Service Worker - 防止浏览器回收页面资源，保持应用常驻 */
const CACHE_NAME = 'yuwen-teacher-v1';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './vendor/xlsx.full.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 跨域请求直接走网络
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        // 缓存新版本
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

// 接收心跳消息 - 防止 SW 休眠
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'heartbeat') {
    e.ports[0] && e.ports[0].postMessage({ type: 'pong', ts: Date.now() });
  }
});
