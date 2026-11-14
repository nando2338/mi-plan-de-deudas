const CACHE='deudas-pwa-v7';
const ASSETS=['/manifest.webmanifest','/icon-192.png','/icon-512.png','/icon-maskable.png','/icon-180.png','/icon-32.png','/app-version.js','/existing-install.js','/navigation-views.css','/navigation-views.js','/currency-ghost.css','/currency-ghost.js','/education-help-v2.css','/education-help-v2.js','/backup-validation.js','/backup-safe.js','/backup-preferences.js','/debt-engine.js','/candidate-finance.js','/reminders.js','/reminders-ui.js','/reminders-today.js','/foreground-notices.js','/foreground-notices-ui.js','/i18n.js','/config.js','/cloud-core.js','/cloud-sync.js','/account-ui.js','/account.css','/privacidad.html','/terminos.html','/legal.css','/legal.js'];
// Exact, version-pinned supabase-js file (verified by SRI in the page). It contains no user data.
const LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
// Always fetched from the network first so a new config.js takes effect without a new cache version.
const NETWORK_FIRST=['/config.js','/privacidad.html','/terminos.html'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Carry the saved offline home page over from the previous cache before removing old caches.
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys(),cache=await caches.open(CACHE);if(!(await cache.match('/offline-home')))for(const k of keys){if(k===CACHE)continue;const old=await(await caches.open(k)).match('/offline-home');if(old){await cache.put('/offline-home',old);break}}await Promise.all(keys.filter(k=>k.startsWith('deudas-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))})()));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET')return;
if(url.origin!==location.origin){
// Supabase (database, auth, functions) and any other origin: never cached, never intercepted.
if(url.href===LIB)event.respondWith(caches.open(CACHE).then(cache=>cache.match(LIB).then(cached=>cached||fetch(req).then(r=>{if(r.ok&&r.type==='cors')cache.put(LIB,r.clone());return r}))));
return}
if(req.mode==='navigate'){const home=url.pathname==='/'||url.pathname==='/index.html';
if(!home&&ASSETS.includes(url.pathname)){event.respondWith(fetch(req).catch(()=>caches.match(url.pathname).then(r=>r||Response.error())));return}
event.respondWith(fetch(req).then(async response=>{if(home&&response.ok&&!response.redirected&&(response.headers.get('content-type')||'').includes('text/html'))await(await caches.open(CACHE)).put('/offline-home',response.clone());return response}).catch(async()=>await caches.match('/offline-home')||Response.error()));return}
if(NETWORK_FIRST.includes(url.pathname)){event.respondWith(fetch(req).then(async r=>{if(r.ok)await(await caches.open(CACHE)).put(url.pathname,r.clone());return r}).catch(()=>caches.match(url.pathname).then(r=>r||Response.error())));return}
if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(req)))});
