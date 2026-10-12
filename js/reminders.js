// Recordatorios de cita y confirmación de asistencia.
// La MISMA política la aplica la Cloud Function (functions/index.js) con la hora de México.
import { db, doc, updateDoc, Timestamp, registerPush, setDoc, serverTimestamp } from "./firebase.js";
import { parseYmd, fmtTime, fmtDate, toast, icon, esc, $, CONFIG, ymd } from "./ui.js";

export const POLICY = {
  morningEnd: "14:00", // citas antes de esta hora → confirmar un día antes
  confirmAt: 20,       // 8:00 pm del día anterior: 1er aviso "confirma tu asistencia"
  secondAt: 21,        // 9:00 pm: 2º aviso si no confirmó
  releaseAt: 22,       // 10:00 pm: se libera la cita si no confirmó
  dayOfAt: 8,          // citas de la tarde: aviso a las 8:00 am del mismo día
};

const at = (dateStr, h, m = 0) => { const d = parseYmd(dateStr); d.setHours(h, m, 0, 0); return d; };
const dayBefore = (dateStr) => { const d = parseYmd(dateStr); d.setDate(d.getDate() - 1); return ymd(d); };
export const startOf = (r) => { const [h, m] = r.time.split(":").map(Number); return at(r.date, h, m); };
export const isMorning = (r) => r.time < POLICY.morningEnd;

/** Calendario de avisos de una reserva */
export function schedule(r) {
  if (isMorning(r)) {
    const eve = dayBefore(r.date);
    return { kind: "confirm", first: at(eve, POLICY.confirmAt), second: at(eve, POLICY.secondAt), release: at(eve, POLICY.releaseAt) };
  }
  return { kind: "dayof", first: at(r.date, POLICY.dayOfAt) };
}

/** ¿Al crearla ya pasó la hora de confirmar? Entonces no se le pide confirmación (reservó tarde). */
export function skipConfirmAtBooking(r, now = new Date()) {
  const s = schedule(r);
  return s.kind === "confirm" && now >= s.first;
}

const active = (r) => ["pendiente", "confirmada"].includes(r.status);

/** ¿Hay que pedirle que confirme ahora? */
export function needsConfirmation(r, now = new Date()) {
  if (!active(r) || r.attendanceConfirmed || r.skipConfirm) return false;
  const s = schedule(r);
  return s.kind === "confirm" && now >= s.first && now < startOf(r);
}

/** ¿Ya venció la confirmación y la cita debe liberarse? */
export function shouldRelease(r, now = new Date()) {
  if (!active(r) || r.attendanceConfirmed || r.skipConfirm) return false;
  const s = schedule(r);
  return s.kind === "confirm" && now >= s.release;
}

export function confirmText(r) {
  return `${r.className} · ${fmtDate(r.date)} a las ${fmtTime(r.time)}`;
}

/** Confirma la asistencia (lo puede hacer el cliente con o sin cuenta: solo cambia esos dos campos) */
export async function confirmAttendance(code) {
  await updateDoc(doc(db, "reservations", code), { attendanceConfirmed: true, confirmedAt: Timestamp.now() });
  // Actualiza la copia local del pase
  try {
    const list = JSON.parse(localStorage.getItem("ts_passes") || "[]");
    list.forEach((p) => { if (p.code === code) p.attendanceConfirmed = true; });
    localStorage.setItem("ts_passes", JSON.stringify(list));
  } catch {}
}

/** Tarjeta "Confirma tu asistencia" (inicio, mis pases y panel del cliente) */
export function confirmBannerHTML(r) {
  return `<div class="confirm-banner" data-confirm-code="${esc(r.code || r.id)}">
    <div class="cb-ic">${icon("bell")}</div>
    <div class="cb-txt"><b>Confirma tu asistencia</b><span>${esc(confirmText(r))}</span>
      <small>Si no confirmas antes de las ${POLICY.releaseAt}:00 h, tu lugar se libera.</small></div>
    <button class="btn btn-metal sm" data-confirm-btn>Confirmar</button></div>`;
}
export function bindConfirmBanners(root, onDone) {
  root.querySelectorAll("[data-confirm-code]").forEach((el) => {
    el.querySelector("[data-confirm-btn]").onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await confirmAttendance(el.dataset.confirmCode); el.classList.add("done"); el.innerHTML = `<div class="cb-ic">${icon("check")}</div><div class="cb-txt"><b>¡Asistencia confirmada!</b><span>Te esperamos.</span></div>`; onDone?.(); }
      catch (err) { console.error(err); b.disabled = false; toast(err.code === "permission-denied" ? "Esta reserva ya no está activa" : "No se pudo confirmar", "err"); }
    };
  });
}

/* ---------- Activar notificaciones ---------- */
export const notifState = () => (!("Notification" in window) ? "unsupported" : Notification.permission);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/** Pide permiso y registra el dispositivo. owner: "device" | "member:TS1001" | "admin" */
export async function enableNotifications(owner = "device") {
  if (notifState() === "unsupported") {
    toast(/iPhone|iPad/.test(navigator.userAgent) ? "En iPhone primero agrega la app a tu inicio (Compartir → Agregar a inicio)" : "Tu navegador no soporta notificaciones", "err");
    return false;
  }
  if (Notification.permission === "denied") { toast("Las notificaciones están bloqueadas. Actívalas en la configuración del navegador para este sitio.", "err"); return false; }
  const p = await Notification.requestPermission();
  try { localStorage.setItem("ts_notif_prompted", "1"); } catch {}
  if (p !== "granted") { toast("No se activaron las notificaciones", "err"); return false; }
  const token = await registerPush(owner);
  if (token) {
    try { localStorage.setItem("ts_push_token", token); } catch {}
    // Liga el dispositivo a las reservas que ya hizo sin cuenta
    try {
      const list = JSON.parse(localStorage.getItem("ts_passes") || "[]");
      await Promise.all(list.filter((r) => r.date >= ymd()).map((r) => updateDoc(doc(db, "reservations", r.code), { pushToken: token }).catch(() => {})));
    } catch {}
  }
  toast("¡Notificaciones activadas! Te recordaremos tus citas.");
  return true;
}

/** Mensaje "Activa las notificaciones" la primera vez (o la primera vez que abre la app instalada) */
export function maybePromptNotifications(owner = "device", { delay = 1800, key: baseKey = "ts_notif_prompted" } = {}) {
  if (notifState() !== "default") return;
  const key = isStandalone() ? `${baseKey}_app` : baseKey;
  try { if (localStorage.getItem(key)) return; } catch {}
  setTimeout(() => {
    if (notifState() !== "default" || document.querySelector(".notif-sheet")) return;
    const el = document.createElement("div");
    el.className = "notif-sheet";
    el.innerHTML = `<div class="ns-ic">${icon("bell")}</div>
      <div class="ns-txt"><b>Activa las notificaciones</b><span>Te avisamos para confirmar tu cita, recordatorios y mensajes de tu coach.</span></div>
      <div class="ns-btns"><button class="btn btn-text sm" data-no>Ahora no</button><button class="btn btn-metal sm" data-yes>Activar</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    const close = () => { try { localStorage.setItem(key, "1"); } catch {} el.classList.remove("show"); setTimeout(() => el.remove(), 400); };
    el.querySelector("[data-no]").onclick = close;
    el.querySelector("[data-yes]").onclick = async () => { close(); await enableNotifications(owner); document.dispatchEvent(new Event("ts-notif-change")); };
  }, delay);
}
