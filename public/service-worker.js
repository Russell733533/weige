// 定义缓存名称
const CACHE_NAME = 'book-management-v1';

// 需要缓存的资源列表
const urlsToCache = [
  '/',
  '/index.html',
  '/add-book.html',
  '/edit-book.html',
  '/student.html'
];

// 安装 Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 激活 Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 处理网络请求
self.addEventListener('fetch', event => {
  // 如果是API请求或非GET请求，使用网络优先策略
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    event.respondWith(
      fetch(event.request)
        .catch(error => {
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在缓存中找到响应，则返回缓存的响应
        if (response) {
          return response;
        }

        // 否则发起网络请求
        return fetch(event.request).then(
          response => {
            // 检查是否收到有效的响应
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // 克隆响应，因为响应流只能被使用一次
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});