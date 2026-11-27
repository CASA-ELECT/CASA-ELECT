/* CASA-ELECT : permet d'installer le site comme une application (écran d'accueil, plein écran).
   Aucune donnée n'est mise en cache ici : les données restent dans la base et dans la copie locale de l'application. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => new Response('<meta charset="utf-8"><p style="font-family:sans-serif;padding:2rem">Pas de connexion internet. Réessayez dans un instant.</p>', {headers: {'Content-Type': 'text/html; charset=utf-8'}}))); });
