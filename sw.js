const CACHE_NAME = 'lumina-docs-shell-v13';
const APP_SHELL = ['./', './index.html', './workspace.html', './workspace.css', './workspace.js', './library-store.js', './pdf-tools.html', './organize-pdf.html', './organize-pdf.css', './organize-pdf.js', './pdf-tools.js', './pdf-unlock-worker.js', './vendor/qpdf-0.3.0.js', './slides.html', './slides.css', './slides.js', './vendor/pptxgen-3.12.0.min.js', './vendor/pdf-lib-1.17.1.min.js', './vendor/jszip-3.10.1.min.js', './accessibility.css', './accessibility.js', './lumina-storage.js', './vendor/lucide-1.79.0.min.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const CDN_HOSTS = new Set(['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Best-effort cache of runtime libraries for repeat/offline launches.
    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    ];
    await Promise.allSettled(urls.map(async url => {
      const response = await fetch(url, {mode:'no-cors'});
      if (response && (response.ok || response.type === 'opaque')) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('lumina-docs-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      const page = url.pathname.split('/').pop();
      const shellPage = ['pdf-tools.html', 'slides.html', 'workspace.html', 'organize-pdf.html'].includes(page) ? './' + page : './index.html';
      event.respondWith((async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(shellPage, response.clone());
          }
          return response;
        } catch (error) {
          return (await caches.match(shellPage)) || Response.error();
        }
      })());
      return;
    }
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return Response.error();
      }
    })());
    return;
  }
  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, {ignoreVary:true});
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});
