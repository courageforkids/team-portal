/* Courage for Kids Team Portal — service worker for phone notifications. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Courage for Kids", body: event.data && event.data.text() }; }
  const title = data.title || "Courage for Kids";
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
