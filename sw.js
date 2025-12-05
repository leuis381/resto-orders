const CACHE = "resto-orders-v2";
const ASSETS = [
  "/index.html","/kitchen.html","/admin.html","/login.html","/ticket.html",
  "/assets/styles.css","/assets/common.js","/assets/app.js","/assets/kitchen.js","/assets/admin.js",
  "/manifest.webmanifest"
];
self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e)=>{
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
