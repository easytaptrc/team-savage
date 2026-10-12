// Service Worker: caché offline + notificaciones push (FCM)
const CACHE = "ts-v5";
const ASSETS = [
  "./", "index.html", "css/styles.css", "js/app.js", "js/ui.js", "js/firebase.js", "js/metrics.js", "js/docs.js", "js/reminders.js", "js/pdfplan.js",
  "js/views/home.js", "js/views/reserva.js", "js/views/pases.js", "js/views/team.js", "js/views/client.js", "js/views/admin.js",
  "assets/logo.jpg", "assets/fondo.jpg", "assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png", "manifest.json",
];

// Cada archivo se guarda por separado: si alguno falta en el servidor, los demás sí quedan disponibles
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => console.warn("SW: no se pudo guardar", a))))).then(() => self.skipWaiting()));
});
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
// Push de Firebase Cloud Messaging (lo envían las Cloud Functions)
// data: { title, body, link, code?, confirm?: "1" } → si confirm, la notificación trae el botón "Confirmar asistencia"
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/teamsavge-2eff8/databases/(default)/documents";
const API_KEY = "AIzaSyDJwDTPa9iEsEhDFtHqEkNTeSFJaYM4Aho";

self.addEventListener("push", (e) => {
  let raw = {};
  try { raw = e.data.json(); } catch { raw = { data: { title: "Team Savage", body: e.data?.text() } }; }
  const d = { ...(raw.notification || {}), ...(raw.data || {}) };
  const confirm = d.confirm === "1" && d.code;
  e.waitUntil(self.registration.showNotification(d.title || "Team Savage", {
    body: d.body || "", icon: "assets/icon-192.png", badge: "assets/icon-96.png", vibrate: [80, 40, 80],
    tag: d.code ? `res-${d.code}` : undefined, renotify: !!d.code, requireInteraction: !!confirm,
    actions: confirm ? [{ action: "confirm", title: "✓ Confirmar asistencia" }] : [],
    data: { link: d.link || "./", code: d.code || "", confirm: !!confirm },
  }));
});

// Confirma directamente en Firestore (las reglas solo permiten cambiar la confirmación)
async function confirmFromNotification(code) {
  const url = `${FIRESTORE}/reservations/${encodeURIComponent(code)}?updateMask.fieldPaths=attendanceConfirmed&updateMask.fieldPaths=confirmedAt&currentDocument.exists=true&key=${API_KEY}`;
  const res = await fetch(url, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { attendanceConfirmed: { booleanValue: true }, confirmedAt: { timestampValue: new Date().toISOString() } } }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { link, code, confirm } = e.notification.data || {};
  if (e.action === "confirm" && code) {
    e.waitUntil(confirmFromNotification(code)
      .then(() => self.registration.showNotification("¡Asistencia confirmada!", { body: "Te esperamos. 💪", icon: "assets/icon-192.png", badge: "assets/icon-96.png", tag: `res-${code}` }))
      .catch(() => self.clients.openWindow(`./#/confirmar/${encodeURIComponent(code)}`)));
    return;
  }
  const target = confirm && code ? `./#/confirmar/${encodeURIComponent(code)}` : link || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => "focus" in x);
    if (c) { c.navigate?.(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
