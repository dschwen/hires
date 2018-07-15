//
// Service worker to make the hires tool offline capable
//

// cache the site (requires recent FF, Chrome, Safari, Edge with
// cache.addAll support)
self.addEventListener('install', (e) => {
  console.log('Installing service worker');
  e.waitUntil(caches.open('hires').then((cache) => {
    return cache.addAll([
      '/hires/',
      '/hires/index.html',
      '/hires/css/style.css',
      '/hires/js/script.js',
      '/hires/js/fullscreen.js'
    ])
  }));
});

// intercept offline requests
self.addEventListener('fetch', (e) => {
  console.log('Intercepting ', e.request.url);
  e.respondWith(
    caches.match(e.request).then((response) => {
      console.log('Response ', response);
      return response || fetch(event.request);
    })
  )
});
