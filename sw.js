/* Service Worker - 网络优先，防止缓存过期资源 */
const CACHE_NAME = 'yuwen-teacher-v2';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './vendor/xlsx.full.min.js'
];

self.addEventListener('install', e => {
  // 立即激活新版SW
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 跨域请求直接走网络
  if (url.origin !== self.location.origin) return;

  // 网络优先：先尝试网络，失败时用缓存
  e.respondWith(
    fetch(e.request).then(resp => {
      // 缓存新版本
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});

// 接收心跳消息 - 防止 SW 休眠
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'heartbeat') {
    e.ports[0] && e.ports[0].postMessage({ type: 'pong', ts: Date.now() });
  }
});