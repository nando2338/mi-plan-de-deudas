// Cambia en cada versión publicada: así el navegador detecta la versión nueva.
const CACHE='mpd-cache-v1.6';
const ASSETS=['/manifest.webmanifest','/logo-192.png','/logo-512.png','/logo-maskable-512.png','/logo-180.png','/logo-32.png','/logo-encabezado.png','/app-version.js','/existing-install.js','/navigation-views.css','/navigation-views.js','/education-help-v2.css','/education-help-v2.js','/backup-validation.js','/backup-safe.js','/backup-preferences.js','/debt-engine.js','/reminders.js','/reminders-ui.js','/reminders-today.js','/foreground-notices.js','/foreground-notices-ui.js','/i18n.js','/config.js','/cloud-core.js','/cloud-sync.js','/account-ui.js','/account.css','/privacidad.html','/terminos.html','/legal.css','/legal.js','/money.js','/schedule-core.js','/calendario.js','/grafico.js','/ajustes-v12.js','/actualizacion.js','/v12.css','/plan-core.js','/plan-ui.js','/plan.css','/notificaciones.js','/metodos.js','/metodos.css'];
// Exact, version-pinned supabase-js file (verified by SRI in the page). It contains no user data.
const LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
// Always fetched from the network first so a new config.js takes effect without a new cache version.
const NETWORK_FIRST=['/config.js','/privacidad.html','/terminos.html'];
// Install: download every file fresh (bypassing the HTTP cache) and keep a fresh copy of the
// home page for offline use. The new version waits until the user taps "Actualizar".
self.addEventListener('install',event=>event.waitUntil((async()=>{const keys=await caches.keys();const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})));// Required: if the home page cannot be saved, the install fails and the browser retries later.
const r=await fetch(new Request('/',{cache:'reload'}));if(!r.ok||r.redirected||!(r.headers.get('content-type')||'').includes('text/html'))throw new Error('home page not cached');await cache.put('/offline-home',r);
// Versions before 1.2 (deudas-pwa-*) have no update banner and would serve old scripts
// with the new page: replace them right away. From 1.2 on, wait for "Actualizar".
if(keys.some(k=>k.startsWith('deudas-pwa-')))self.skipWaiting()})()));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
// Remove the caches of previous versions (this version saved its own home page at install).
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>(k.startsWith('deudas-pwa-')||k.startsWith('mpd-cache-'))&&k!==CACHE).map(k=>caches.delete(k)))})()));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET')return;
if(url.origin!==location.origin){
// Supabase (database, auth, functions) and any other origin: never cached, never intercepted.
if(url.href===LIB)event.respondWith(caches.open(CACHE).then(cache=>cache.match(LIB).then(cached=>cached||fetch(req).then(r=>{if(r.ok&&r.type==='cors')cache.put(LIB,r.clone());return r}))));
return}
if(req.mode==='navigate'){const home=url.pathname==='/'||url.pathname==='/index.html';
if(!home&&ASSETS.includes(url.pathname)){event.respondWith(fetch(req).catch(()=>caches.match(url.pathname).then(r=>r||Response.error())));return}
// Home page: serve the copy saved with THIS version, so the page always matches the cached
// scripts. A newer version is detected by the update check and applied with "Actualizar".
if(home){event.respondWith(caches.open(CACHE).then(c=>c.match('/offline-home')).then(cached=>cached||fetch(req).then(async response=>{if(response.ok&&!response.redirected&&(response.headers.get('content-type')||'').includes('text/html'))await(await caches.open(CACHE)).put('/offline-home',response.clone());return response})).catch(async()=>await caches.match('/offline-home')||Response.error()));return}
event.respondWith(fetch(req).catch(async()=>await caches.match('/offline-home')||Response.error()));return}
if(NETWORK_FIRST.includes(url.pathname)){event.respondWith(fetch(req).then(async r=>{if(r.ok)await(await caches.open(CACHE)).put(url.pathname,r.clone());return r}).catch(()=>caches.match(url.pathname).then(r=>r||Response.error())));return}
if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(req)))});
// 1.4 Web push: reminders sent by the account's server (payload is JSON text).
const PUSH_DEFAULT_URL='/?vista=calendario';
function pushUrl(raw){try{const u=new URL(typeof raw==='string'?raw:PUSH_DEFAULT_URL,self.location.origin);return u.origin===self.location.origin?u.pathname+u.search:PUSH_DEFAULT_URL}catch(_){return PUSH_DEFAULT_URL}}
self.addEventListener('push',event=>{let d=null;try{d=event.data?JSON.parse(event.data.text()):null}catch(_){d=null}if(!d||typeof d!=='object'||Array.isArray(d))d={};
const title=typeof d.title==='string'&&d.title.trim()?d.title.slice(0,120):'Mi Plan de Deudas';const body=typeof d.body==='string'?d.body.slice(0,400):'';const tag=typeof d.tag==='string'&&d.tag?d.tag.slice(0,120):'mpdd-recordatorio';
event.waitUntil(self.registration.showNotification(title,{body,icon:'/logo-192.png',badge:'/logo-192.png',tag,data:{url:pushUrl(d.url)}}))});
// Tap: focus an open window of the app (and show the requested tab) or open the app.
self.addEventListener('notificationclick',event=>{event.notification.close();const url=pushUrl(event.notification.data&&event.notification.data.url);
event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){let same=false;try{same=new URL(c.url).origin===self.location.origin}catch(_){}if(same&&'focus' in c){c.postMessage({type:'MPDD_OPEN',url});return c.focus()}}return self.clients.openWindow?self.clients.openWindow(url):undefined}))});
