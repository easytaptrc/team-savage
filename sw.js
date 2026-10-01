// Service Worker: caché offline + notificaciones push (FCM)
const CACHE = "ts-v2";
const ASSETS = [
  "./", "index.html", "css/styles.css", "js/app.js", "js/ui.js", "js/firebase.js", "js/metrics.js", "js/docs.js",
  "js/views/home.js", "js/views/reserva.js", "js/views/pases.js", "js/views/team.js", "js/views/client.js", "js/views/admin.js",
  "assets/logo.jpg", "assets/icon-192.png", "assets/icon-512.png", "manifest.json",
];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Red primero para archivos propios (siempre la versión más nueva), caché como respaldo sin conexión
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

// Push de Firebase Cloud Messaging (enviado por la Cloud Function)
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { notification: { title: "Team Savage", body: e.data?.text() } }; }
  const n = data.notification || data.data || {};
  e.waitUntil(self.registration.showNotification(n.title || "Team Savage", {
    body: n.body || "", icon: "assets/icon-192.png", badge: "assets/icon-96.png", vibrate: [80, 40, 80],
    data: { link: (data.data && data.data.link) || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => "focus" in x);
    return c ? c.focus() : self.clients.openWindow(e.notification.data?.link || "./");
  }));
});
