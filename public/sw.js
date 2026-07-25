/* BITTICK WEB - SERVICE WORKER v3.1.0
   Network-first for HTML/CSS/JS (always fresh)
   Cache-first for images (bots/)
   Auto-updates on every page load
*/
var CACHE_NAME = 'bittick-static-v6';

self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);

  if(url.pathname.indexOf('/api/') === 0){
    e.respondWith(
      fetch(e.request).catch(function(){
        return new Response(JSON.stringify({ exito: false, error: 'Sin conexion' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  if(url.pathname.indexOf('/bots/') === 0){
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache){
        return cache.match(e.request).then(function(resp){
          if(resp) return resp;
          return fetch(e.request).then(function(networkResp){
            cache.put(e.request, networkResp.clone());
            return networkResp;
          });
        });
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request).then(function(networkResp){
      if(e.request.method === 'GET' && networkResp.status === 200){
        var clone = networkResp.clone();
        caches.open(CACHE_NAME).then(function(cache){
          cache.put(e.request, clone);
        });
      }
      return networkResp;
    }).catch(function(){
      return caches.match(e.request).then(function(resp){
        return resp || new Response('Offline', { status: 503 });
      });
    })
  );
});

self.addEventListener('push', function(e){
  var data = e.data ? e.data.json() : {};
  var title = data.title || 'Bittick';
  var body = data.body || 'Nueva notificación';
  var icon = data.icon || '/bots/bot_44.png';
  e.waitUntil(self.registration.showNotification(title, { body: body, icon: icon, badge: icon }));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
