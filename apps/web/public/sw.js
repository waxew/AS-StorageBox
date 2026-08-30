// AS StorageBox PWA service worker.
// The application shell is cached so every UI page remains launchable when
// the device temporarily loses connectivity. Private API responses and file
// contents are deliberately NOT cached here because they require stricter
// per-user storage and logout invalidation rules.
const CACHE='as-storagebox-shell-v1';
const SHELL=['./','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(fetch(request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(request,copy));
    return response;
  }).catch(()=>caches.match(request).then(hit=>hit||caches.match('./'))));
});
