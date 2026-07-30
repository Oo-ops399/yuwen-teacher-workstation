// Service Worker 简化版 - 不缓存资源，确保永远获取最新版本
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 所有请求走网络
self.addEventListener('fetch', e => {
  // 不拦截，直接走网络
});

// 心跳消息支持（保持 SW 活跃）
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'heartbeat') {
    e.ports[0] && e.ports[0].postMessage({ type: 'pong', ts: Date.now() });
  }
});