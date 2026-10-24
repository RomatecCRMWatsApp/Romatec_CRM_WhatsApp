const CACHE_NAME = 'romatec-crm-v5'; // v5: notificações push (v1.8.0)
const OFFLINE_URL = '/';

// Install - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Push (v1.8.0) — reserva, venda, liberação de lote e sistema atualizado.
// Com o CRM aberto e em foco, a aba recebe o aviso (toca o som do tipo) e não duplica a notificação do sistema.
// Com o app fechado, a notificação é do sistema operacional (o som é o do celular: o Web Push não toca som próprio).
self.addEventListener('push', (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = { titulo: 'CRM Romatec', mensagem: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const emFoco = abertas.find((c) => c.focused && c.visibilityState === 'visible');
    if (emFoco) { emFoco.postMessage({ tipo: 'romatec:notificacao', dados }); return; }
    await self.registration.showNotification(dados.titulo || 'CRM Romatec', {
      body: dados.mensagem || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: dados.id ? 'notif-' + dados.id : undefined,
      data: { url: dados.url || '/', id: dados.id || null },
    });
  })());
});

// Toque na notificação: abre (ou foca) o CRM no item certo e marca a notificação como lida
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const destino = new URL(d.url || '/', self.location.origin);
  if (d.id) destino.searchParams.set('notif', String(d.id));
  event.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const doCrm = abertas.find((c) => new URL(c.url).origin === self.location.origin);
    if (doCrm) {
      await doCrm.focus();
      if ('navigate' in doCrm) return doCrm.navigate(destino.href);
      return;
    }
    return self.clients.openWindow(destino.href);
  })());
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and API calls
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match(OFFLINE_URL);
        });
      })
  );
});
