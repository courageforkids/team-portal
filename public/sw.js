/* Courage for Kids Team Portal — service worker for phone notifications. */
const PAGES = "cfk-pages-v1", ASSETS = "cfk-assets-v1", DATA = "cfk-data-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const keep = [PAGES, ASSETS, DATA];
  for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

/* Offline: pages and app data are fetched fresh when online and saved; without signal the last saved copy is shown.
   Only GET requests are touched. Sign-in pages, server actions and uploads always go to the network. */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await cache.match("/", { ignoreVary: true });
      if (home) return home;
      return new Response("<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:40px;text-align:center;color:#334'><h2>You're offline</h2><p>Open the portal once while you have signal and it will work offline next time.</p></body>", { headers: { "Content-Type": "text/html" } });
    }
    throw e;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/login") || p.startsWith("/invite") || p.startsWith("/reset-password") || p.startsWith("/forgot-password") || p.startsWith("/api/v1") || p.startsWith("/api/health") || p.startsWith("/launch")) return;
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) { event.respondWith(networkFirst(req, PAGES)); return; }
  if (p.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(p)) { event.respondWith(cacheFirst(req)); return; }
  if (req.mode === "navigate") { event.respondWith(networkFirst(req, PAGES)); return; }
  if (p.startsWith("/api/chat/") || p === "/api/badges" || p.startsWith("/api/files/")) { event.respondWith(networkFirst(req, DATA)); return; }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Courage for Kids", body: event.data && event.data.text() }; }
  const title = data.title || "Courage for Kids";
  // Red number on the home screen icon, like Messages.
  if (typeof data.badge === "number" && self.navigator && self.navigator.setAppBadge) {
    try { data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge(); } catch (e) {}
  }
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: data.tag || undefined,
    data: { href: data.href || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  const url = new URL(href, self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); if ("navigate" in c) return c.navigate(url); return; }
    }
    return self.clients.openWindow(url);
  })());
});
