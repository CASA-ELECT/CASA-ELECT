/* CASA-ELECT : permet d'installer le site comme une application (écran d'accueil, plein écran).
   Aucune donnée n'est mise en cache ici : les données restent dans la base et dans la copie locale de l'application. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => new Response('<meta charset="utf-8"><p style="font-family:sans-serif;padding:2rem">Pas de connexion internet. Réessayez dans un instant.</p>', {headers: {'Content-Type': 'text/html; charset=utf-8'}}))); });
/* Notifications de l'agenda envoyées par la base (Edge Function « rappels ») */
self.addEventListener('push', e => { let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = {title: 'CASA-ELECT', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'CASA-ELECT', {body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: {url: d.url || './#agenda'}})); });
self.addEventListener('notificationclick', e => { e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(L => { for (const c of L) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); })); });
