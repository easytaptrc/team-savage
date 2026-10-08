// Utilidades de interfaz compartidas
import { db, doc, getDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where, updateDoc } from "./firebase.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Configuración del gimnasio (editable por el admin) ---------- */
export const DEFAULT_CONFIG = {
  gymName: "Team Savage",
  slogan: "Disciplina • Progreso • Resultados",
  quote: "Más que un gym, un estilo de vida",
  logo: "assets/logo.jpg",
  whatsapp: "528711234567",
  phone: "+52 871 123 4567",
  address: "",
  location: "Torreón, Coah.",
  mapsUrl: "",
  cover: "assets/fondo.jpg",
  links: { instagram: "https://instagram.com/", tiktok: "https://tiktok.com/", youtube: "https://youtube.com/", facebook: "" },
  colors: { bg: "#050505", surface: "#121212", accent: "#e9e9e9", text: "#f2f2f2" },
  classes: [
    { name: "Asesoría personal", capacity: 1 },
    { name: "Asesoría online", capacity: 5 },
    { name: "Asesoría presencial", capacity: 8 },
  ],
  hours: ["06:00", "07:00", "08:00", "09:00", "17:00", "18:00", "19:00", "20:00"],
  closedDays: [0],
  plans: [
    { name: "Mensualidad", price: 600, days: 30 },
    { name: "Semana", price: 200, days: 7 },
    { name: "Visita", price: 60, days: 1 },
    { name: "Asesoría personal (mes)", price: 1800, days: 30 },
    { name: "Asesoría online (mes)", price: 900, days: 30 },
  ],
  autoBlockDefault: 0,
};

export let CONFIG = structuredClone(DEFAULT_CONFIG);

export async function loadConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    if (snap.exists()) CONFIG = deepMerge(structuredClone(DEFAULT_CONFIG), snap.data());
    // Configuraciones guardadas antes de las asesorías (Spinning, Box…) pasan a los nuevos servicios.
    // Al guardar la configuración se marca servicesVersion: 2 y desde ahí se respeta lo que elija el coach.
    if (!CONFIG.classes?.length || (CONFIG.servicesVersion || 1) < 2) CONFIG.classes = structuredClone(DEFAULT_CONFIG.classes);
  } catch (e) { console.warn("Config por defecto:", e.code || e); }
  applyTheme();
  return CONFIG;
}
export function setConfig(c) { CONFIG = deepMerge(structuredClone(DEFAULT_CONFIG), c); applyTheme(); }

function deepMerge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") a[k] = deepMerge(a[k], b[k]);
    else if (b[k] !== undefined && b[k] !== null && b[k] !== "") a[k] = b[k];
  }
  return a;
}

export function applyTheme() {
  const r = document.documentElement.style;
  r.setProperty("--bg", CONFIG.colors.bg);
  r.setProperty("--surface", CONFIG.colors.surface);
  r.setProperty("--accent", CONFIG.colors.accent);
  r.setProperty("--text", CONFIG.colors.text);
  document.title = CONFIG.gymName;
  $$("img[data-logo]").forEach((i) => (i.src = CONFIG.logo));
}

/* ---------- Toasts y modales ---------- */
export function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 3200);
}

export function modal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true">
      <button class="modal-x" aria-label="Cerrar">${icon("x")}</button>${html}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("show"));
  const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 300); onClose?.(); };
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  $(".modal-x", wrap).onclick = close;
  return { el: $(".modal", wrap), close };
}

export function confirmDialog(text, okLabel = "Confirmar") {
  return new Promise((res) => {
    const m = modal(`<h3 class="h3">${esc(text)}</h3>
      <div class="row gap mt"><button class="btn btn-ghost" data-n>Cancelar</button><button class="btn btn-metal" data-y>${esc(okLabel)}</button></div>`,
      { onClose: () => res(false) });
    $("[data-n]", m.el).onclick = () => { m.close(); };
    $("[data-y]", m.el).onclick = () => { res(true); m.close(); };
  });
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${label || ""}`; }
  else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
}

/* ---------- Fechas ---------- */
export const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const toDate = (t) => (t?.toDate ? t.toDate() : t instanceof Date ? t : t ? new Date(t) : null);
export const fmtDate = (d) => { d = typeof d === "string" ? parseYmd(d) : toDate(d); return d ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : "—"; };
export const fmtDateTime = (t) => { const d = toDate(t); return d ? `${fmtDate(d)} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : "—"; };
export const fmtTime = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
export const money = (n) => "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const daysSince = (t) => { const d = toDate(t); return d ? Math.floor((Date.now() - d.getTime()) / 864e5) : Infinity; };
export const timeAgo = (t) => {
  const d = toDate(t); if (!d) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "ahora"; if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`; return fmtDate(d);
};

/* ---------- WhatsApp ---------- */
export const cleanPhone = (p) => String(p || "").replace(/\D/g, "");
export function waLink(phone, text) {
  let n = cleanPhone(phone);
  if (n.length === 10) n = "52" + n; // México por defecto
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/* ---------- Estado de socios (bloqueo automático por inactividad) ---------- */
export function effectiveStatus(m) {
  if (!m) return "inactivo";
  if (m.status !== "activo") return m.status;
  const days = Number(m.autoBlockDays || 0);
  const ref = m.lastVisit || m.createdAt;
  if (days > 0 && ref && daysSince(ref) > days) return "bloqueado";
  return "activo";
}
export const statusChip = (s) => `<span class="chip chip-${s}">${{ activo: "Activo", inactivo: "Inactivo", bloqueado: "Bloqueado", pendiente: "Pendiente", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada", vencido: "Vencido" }[s] || esc(s)}</span>`;

/* ---------- Notificaciones ---------- */
export async function notify(to, title, body, type = "info", link = "") {
  try { await addDoc(collection(db, "notifications"), { to, title, body, type, link, read: false, at: serverTimestamp() }); }
  catch (e) { console.warn("notify", e); }
}

let unsubNotif = null;
export function listenNotifications(to, onChange) {
  unsubNotif?.();
  let first = true;
  const seen = new Set();
  unsubNotif = onSnapshot(query(collection(db, "notifications"), where("to", "==", to)), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDate(b.at)?.getTime() || Date.now()) - (toDate(a.at)?.getTime() || Date.now()));
    if (!first) {
      snap.docChanges().forEach((c) => {
        if (c.type === "added" && !seen.has(c.doc.id) && !c.doc.data().read) systemNotify(c.doc.data().title, c.doc.data().body);
      });
    }
    list.forEach((n) => seen.add(n.id));
    first = false;
    onChange(list);
  }, (e) => console.warn("notif", e));
  return () => unsubNotif?.();
}

export async function systemNotify(title, body) {
  toast(`${title} — ${body}`, "info");
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { const reg = await navigator.serviceWorker?.ready; reg ? reg.showNotification(title, { body, icon: "assets/icon-192.png", badge: "assets/icon-96.png", vibrate: [80, 40, 80] }) : new Notification(title, { body }); }
  catch { /* ignore */ }
}

export function notifPanel(list, anchorBtn) {
  const m = modal(`<h3 class="h3">Notificaciones</h3>
    <div class="notif-list">${list.length ? list.slice(0, 60).map((n) => `
      <div class="notif ${n.read ? "" : "unread"}"><div class="notif-dot"></div>
        <div><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${timeAgo(n.at)}</small></div></div>`).join("")
      : `<p class="muted center">Sin notificaciones</p>`}</div>
    ${"Notification" in window && Notification.permission !== "granted" ? `<button class="btn btn-ghost w100 mt" data-perm>${icon("bell")} Activar notificaciones del dispositivo</button>` : ""}`);
  $("[data-perm]", m.el)?.addEventListener("click", async () => { await Notification.requestPermission(); m.close(); });
  list.filter((n) => !n.read).forEach((n) => updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {}));
}

/* ---------- Imágenes (se comprimen y guardan en Firestore) ---------- */
export function compressImage(file, max = 900, quality = 0.78) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- Gráfica de línea SVG ---------- */
export function lineChart(points, { height = 160, goal = null, unit = "" } = {}) {
  if (!points.length) return `<div class="empty-chart">Aún no hay registros</div>`;
  const W = 600, H = height, P = 28;
  const vals = points.map((p) => p.v).concat(goal != null ? [goal] : []);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => P + (points.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1));
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${goal != null ? `<line x1="${P}" x2="${W - P}" y1="${y(goal)}" y2="${y(goal)}" class="goal-line"/><text x="${W - P}" y="${y(goal) - 6}" text-anchor="end" class="chart-lbl">Objetivo ${goal}${unit}</text>` : ""}
    <path d="${area}" fill="url(#ga)" class="chart-area"/>
    <path d="${path}" class="chart-line" pathLength="1"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4.5" class="chart-dot"><title>${esc(p.label)}: ${p.v}${unit}</title></circle>`).join("")}
    ${points.map((p, i) => (points.length <= 8 || i % Math.ceil(points.length / 8) === 0) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="chart-lbl">${esc(p.label)}</text>` : "").join("")}
  </svg>`;
}

export function barChart(bars, { height = 170 } = {}) {
  if (!bars.length) return `<div class="empty-chart">Sin datos</div>`;
  const max = Math.max(...bars.map((b) => b.v), 1);
  return `<div class="bars" style="height:${height}px">${bars.map((b, i) => `
    <div class="bar-col" title="${esc(b.label)}: ${esc(b.fmt ?? b.v)}"><div class="bar" style="--h:${(b.v / max) * 100}%;--d:${i * 25}ms"></div><span>${esc(b.short ?? b.label)}</span></div>`).join("")}</div>`;
}

/* ---------- Pase (wallet) de reserva ---------- */
export function passHTML(r) {
  return `<div class="pass tilt" data-tilt>
    <div class="pass-shine"></div>
    <div class="pass-top"><img data-logo src="${esc(CONFIG.logo)}" alt=""><div><small>Servicio</small><b>${esc(r.className)}</b><small>Fecha</small><b>${fmtDate(r.date)}</b></div></div>
    <div class="pass-mid">
      <div><small>Hora</small><b>${fmtTime(r.time)}</b><small>Nombre</small><b>${esc(r.name)}</b><small>Código</small><b class="mono">${esc(r.code)}</b></div>
      <div class="qr" data-qr="${esc(r.code)}"></div>
    </div>
    <div class="pass-foot">${esc(CONFIG.gymName.toUpperCase())} · Presenta este pase en recepción</div>
  </div>`;
}
export function renderQRs(root = document) {
  $$("[data-qr]", root).forEach((el) => {
    if (el.dataset.done || !window.QRCode) return;
    el.dataset.done = 1;
    new window.QRCode(el, { text: el.dataset.qr, width: 128, height: 128, colorDark: "#000", colorLight: "#fff", correctLevel: window.QRCode.CorrectLevel.M });
  });
}
export async function downloadPass(el, name = "pase") {
  if (!window.html2canvas) return toast("No se pudo generar la imagen", "err");
  const canvas = await window.html2canvas(el, { backgroundColor: null, scale: 2 });
  const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `${name}.png`; a.click();
}
export function icsFor(r) {
  const [h, m] = r.time.split(":").map(Number);
  const d = parseYmd(r.date); d.setHours(h, m);
  const end = new Date(d.getTime() + 60 * 60000);
  const f = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TeamSavage//ES\r\nBEGIN:VEVENT\r\nUID:${r.code}@teamsavage\r\nDTSTART:${f(d)}\r\nDTEND:${f(end)}\r\nSUMMARY:${r.className} - ${CONFIG.gymName}\r\nDESCRIPTION:Código ${r.code}\r\nBEGIN:VALARM\r\nTRIGGER:-PT60M\r\nACTION:DISPLAY\r\nDESCRIPTION:Tu sesión empieza en 1 hora\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = `reserva-${r.code}.ics`; a.click();
}

/* ---------- Efecto 3D (tilt) ---------- */
export function bindTilt(root = document) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $$("[data-tilt]", root).forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = 1;
    const max = Number(el.dataset.tilt) || 10;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(px + 0.5) * 100}%`);
      el.style.setProperty("--my", `${(py + 0.5) * 100}%`);
    });
    el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
  });
}

/* ---------- Revelado al hacer scroll ---------- */
const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 }) : null;
export function reveal(root = document) {
  $$(".reveal:not(.in)", root).forEach((el, i) => { el.style.setProperty("--i", i % 12); io ? io.observe(el) : el.classList.add("in"); });
}
export function enhance(root = document) { reveal(root); bindTilt(root); renderQRs(root); }

/* ---------- Iconos (trazos propios, estilo lineal) ---------- */
const ICONS = {
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>', back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M4.5 12.5l5 5L20 7"/>',
  phone: '<path d="M5 3.5h3.5l1.8 4.6-2.3 1.5a11 11 0 0 0 6.4 6.4l1.5-2.3 4.6 1.8V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  apple: '<path d="M12 7.5c-1-1.7-3.9-2.3-5.6-.6C4.3 9 4.8 13.6 7 17c1.4 2.1 2.6 3 3.6 2.7.7-.2 1-.6 1.4-.6s.7.4 1.4.6c1 .3 2.2-.6 3.6-2.7 2.2-3.4 2.7-8 .6-10.1-1.7-1.7-4.6-1.1-5.6.6z"/><path d="M12 7.5c0-2 1-3.8 3-4.5"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9.5h8M8 12.5h5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  home: '<path d="M3 11l9-7.5L21 11"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>',
  whatsapp: '<path d="M4 20l1.2-4A8 8 0 1 1 8 18.8L4 20z"/><path d="M9 9.2c.2 2.4 2.4 4.6 4.8 4.8l1.2-1.3 1.8.9c-.3 1.2-1.3 1.9-2.5 1.8-3.5-.4-6.3-3.2-6.7-6.7-.1-1.2.6-2.2 1.8-2.5l.9 1.8L9 9.2z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor"/>',
  tiktok: '<path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8"/><path d="M14 3.5c.4 2.6 2.2 4.4 5 4.6"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.2v5.6l4.8-2.8-4.8-2.8z" fill="currentColor"/>',
  facebook: '<path d="M14 21v-7.5h2.6l.4-3H14V8.6c0-.9.3-1.5 1.6-1.5H17V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8.3v3H11V21"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3zM20.5 14v6.5H17M17 20.5"/>',
  wallet: '<path d="M4 7.5V18a2 2 0 0 0 2 2h14V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4"/><circle cx="16.5" cy="14" r="1.2" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  megaphone: '<path d="M3.5 10v4h3l8 5V5l-8 5h-3z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z"/>', refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.6 1.8 1.5 2.8 2.6 3.3.1-2.8 1.2-5.3 3.3-6.8-.4 3.6 3.5 6.2 3.5 11.6 0 3.8-2.5 6.4-6.5 6.4z"/>',
};
export const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
