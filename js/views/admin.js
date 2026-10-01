// 4. PANEL DEL ADMIN / COACH
import {
  auth, db, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp, runTransaction, writeBatch, increment, signInWithEmailAndPassword, signOut,
  AUTH_DOMAIN, isAdminUser, registerPush,
} from "../firebase.js";
import {
  CONFIG, setConfig, $, $$, esc, icon, toast, modal, confirmDialog, setBusy, ymd, parseYmd, pad, fmtDate, fmtTime,
  fmtDateTime, timeAgo, toDate, money, daysSince, effectiveStatus, statusChip, waLink, cleanPhone, notify,
  listenNotifications, notifPanel, lineChart, barChart, compressImage, passHTML, enhance, MONTHS, DAYS,
} from "../ui.js";
import { loadProgress, cancelReservation, changePasswordDialog } from "./client.js";
import {
  SEXES, GOALS, ACTIVITY, EXPERIENCE, ageOf, bmi, bmiCategory, bmr, tdee, METRIC_FIELDS, summaryHTML, chartBlockHTML, bindChart,
  comparisonHTML, historyHTML, beforeAfterHTML, profileFactsHTML, progressFormHTML, readProgressForm,
} from "../metrics.js";
import { exportPlan, fileToText, parseRoutine, parseDiet, IMPORT_ACCEPT, DAYS_ORDER, DAY_LABEL } from "../docs.js";

const NAV = [
  ["inicio", "home", "Inicio"], ["reservas", "calendar", "Reservas"], ["clientes", "users", "Clientes"],
  ["progreso", "chart", "Progreso"], ["rutinas", "dumbbell", "Planes / Rutinas"], ["dietas", "apple", "Dietas"],
  ["chat", "chat", "Chat"], ["reportes", "list", "Reportes"], ["ingresos", "money", "Ingresos"],
  ["avisos", "megaphone", "Avisos"], ["config", "cog", "Configuración"],
];
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");

export async function render(root, r) {
  if (r.section === "login" || !isAdminUser(auth.currentUser)) return renderLogin(root);

  const S = { members: new Map(), reservations: [], chats: [], notifs: [], unsubs: [], section: r.section, arg: r.arg, swept: false, sub: null };
  window.__adm = S;

  root.innerHTML = `
  <div class="admin">
    <aside class="side">
      <div class="side-logo"><img data-logo src="${esc(CONFIG.logo)}" alt=""></div>
      <nav>${NAV.map(([k, ic, l]) => `<a href="#/admin/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span><i class="nav-badge" data-nb="${k}" hidden></i></a>`).join("")}</nav>
      <button class="side-out" data-out>${icon("logout")}<span>Cerrar sesión</span></button>
    </aside>
    <div class="side-scrim" data-scrim></div>
    <section class="admin-main">
      <header class="admin-top">
        <button class="icon-btn only-m" data-menu aria-label="Menú">${icon("menu")}</button>
        <h1 data-title>Inicio</h1>
        <div class="row gap-s">
          <button class="icon-btn" data-checkin title="Check-in con código">${icon("qr")}</button>
          <button class="icon-btn" data-bell aria-label="Notificaciones">${icon("bell")}<i class="badge" hidden></i></button>
          <div class="admin-user">${icon("user")}<span>Admin</span></div>
        </div>
      </header>
      <div class="admin-body" data-body><div class="center pad"><span class="spinner"></span></div></div>
    </section>
  </div>`;

  const closeMenu = () => root.querySelector(".admin").classList.remove("menu-open");
  $("[data-menu]", root).onclick = () => root.querySelector(".admin").classList.add("menu-open");
  $("[data-scrim]", root).onclick = closeMenu;
  $$("[data-nav]", root).forEach((a) => a.addEventListener("click", closeMenu));
  $("[data-out]", root).onclick = async () => { await signOut(auth); location.hash = "#/"; };
  $("[data-bell]", root).onclick = () => notifPanel(S.notifs);
  $("[data-checkin]", root).onclick = () => checkInDialog(S);

  let loaded = { m: false, r: false };
  const rerender = debounce(() => { if (loaded.m && loaded.r) show(S.section, S.arg, true); }, 250);

  S.unsubs.push(onSnapshot(collection(db, "members"), (snap) => {
    S.members = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    loaded.m = true;
    if (!S.swept) { S.swept = true; sweep(S); }
    rerender();
  }, (e) => permError(e)));
  S.unsubs.push(onSnapshot(query(collection(db, "reservations"), orderBy("createdAt", "desc"), limit(1500)), (snap) => {
    S.reservations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    loaded.r = true;
    const newCount = S.reservations.filter((x) => x.status === "pendiente").length;
    badge(root, "reservas", newCount);
    rerender();
  }, (e) => permError(e)));
  S.unsubs.push(onSnapshot(query(collection(db, "chats"), orderBy("lastAt", "desc")), (snap) => {
    S.chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    badge(root, "chat", S.chats.reduce((a, c) => a + (c.unreadAdmin || 0), 0));
    if (S.section === "chat" && !S.sub) rerender();
  }));
  S.unsubs.push(listenNotifications("admin", (list) => {
    S.notifs = list;
    const n = list.filter((x) => !x.read).length;
    const b = $(".badge", root); b.hidden = !n; b.textContent = n > 9 ? "9+" : n;
  }));
  if ("Notification" in window) {
    if (Notification.permission === "default") Notification.requestPermission().then((p) => p === "granted" && registerPush("admin"));
    else if (Notification.permission === "granted") registerPush("admin");
  }

  async function show(section, arg, soft = false) {
    // Evita redibujar si el usuario está escribiendo en un formulario
    if (soft && (S.editing || (document.activeElement && root.contains(document.activeElement) && document.activeElement.matches("input,textarea,select")))) return;
    S.section = section; S.arg = arg;
    if (!soft) { S.sub?.(); S.sub = null; S.editing = false; }
    $$("[data-nav]", root).forEach((a) => a.classList.toggle("on", a.dataset.nav === (section === "cliente" ? "clientes" : section)));
    $("[data-title]", root).textContent = (NAV.find((n) => n[0] === section) || [, , section === "cliente" ? "Cliente" : "Inicio"])[2];
    const body = $("[data-body]", root);
    if (!soft) { body.classList.remove("view-in"); void body.offsetWidth; body.classList.add("view-in"); }
    if (!loaded.m || !loaded.r) return;
    const fn = SECTIONS[section] || SECTIONS.inicio;
    const y = window.scrollY;
    await fn(body, S, arg, soft);
    enhance(body);
    if (soft) window.scrollTo(0, y);
  }
  show(r.section, r.arg);

  return {
    update: (nr) => show(nr.section, nr.arg),
    destroy: () => { S.unsubs.forEach((u) => u?.()); S.sub?.(); },
  };
}

function badge(root, key, n) { const b = root.querySelector(`[data-nb="${key}"]`); if (b) { b.hidden = !n; b.textContent = n > 99 ? "99+" : n; } }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function permError(e) { console.error(e); toast(e.code === "permission-denied" ? "Sin permisos: revisa las reglas de Firestore (ver LEEME)" : "Error de conexión", "err"); }

/* ---------- Login del admin ---------- */
function renderLogin(root) {
  root.innerHTML = `
  <section class="page narrow auth-page">
    <header class="page-head reveal"><a href="#/" class="icon-btn" aria-label="Volver">${icon("back")}</a><span></span><span></span></header>
    <div class="auth-logo reveal" data-tilt="14"><img data-logo src="${esc(CONFIG.logo)}" alt=""></div>
    <h1 class="title reveal">Panel del coach</h1>
    <p class="subtitle reveal">Acceso exclusivo de administración</p>
    <form class="card card-3d form reveal" novalidate>
      <label class="field"><span>Usuario</span><div class="input">${icon("user")}<input name="u" autocomplete="username" autocapitalize="none" placeholder="Usuario" required></div></label>
      <label class="field"><span>Contraseña</span><div class="input">${icon("lock")}<input name="p" type="password" autocomplete="current-password" placeholder="Contraseña" required></div></label>
      <button class="btn btn-metal w100 lg">Entrar ${icon("chevron")}</button>
    </form>
  </section>`;
  const f = $("form", root);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button", f); setBusy(btn, true, "Entrando…");
    const u = f.u.value.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(auth, u.includes("@") ? u : `${u}@${AUTH_DOMAIN}`, f.p.value);
      if (!isAdminUser(auth.currentUser)) { await signOut(auth); throw { code: "not-admin" }; }
      location.hash = "#/admin/inicio";
    } catch (err) {
      setBusy(btn, false);
      toast(err.code === "not-admin" ? "Esta cuenta no es de administrador" : err.code === "auth/operation-not-allowed" ? "Activa Email/Password en Firebase Authentication" : "Usuario o contraseña incorrectos", "err");
    }
  };
}

/* ---------- Tareas automáticas al abrir el panel ---------- */
async function sweep(S) {
  let blocked = 0, reminded = 0;
  for (const m of S.members.values()) {
    try {
      if (m.status === "activo" && effectiveStatus(m) === "bloqueado") {
        await setStatus(m, "bloqueado", `Sin asistir más de ${m.autoBlockDays} días`); blocked++;
      }
      const paid = toDate(m.paidUntil);
      if (m.status === "activo" && paid && m.remindedFor !== ymd(paid)) {
        const d = Math.ceil((paid - Date.now()) / 864e5);
        if (d <= 3) {
          await notify(m.id, d < 0 ? "Membresía vencida" : "Tu membresía está por vencer", d < 0 ? `Tu ${m.plan || "plan"} venció el ${fmtDate(paid)}. Renueva con tu coach.` : `Tu ${m.plan || "plan"} vence el ${fmtDate(paid)}.`, "pago");
          await updateDoc(doc(db, "members", m.id), { remindedFor: ymd(paid) }); reminded++;
        }
      }
    } catch (e) { console.warn("sweep", e); }
  }
  if (blocked) toast(`${blocked} usuario(s) bloqueados automáticamente por inactividad`, "info");
  if (reminded) toast(`${reminded} recordatorio(s) de pago enviados`, "info");
}

/* ---------- Acciones sobre socios ---------- */
async function setStatus(m, status, reason = "") {
  const data = { status, statusReason: reason, statusAt: serverTimestamp() };
  if (status === "activo") data.lastVisit = serverTimestamp(); // evita re-bloqueo inmediato
  await updateDoc(doc(db, "members", m.id), data);
  await setDoc(doc(db, "logins", m.id), { status }, { merge: true });
  if (status === "activo") notify(m.id, "Cuenta reactivada", "¡Bienvenido de vuelta al Team!", "team");
}

async function registerAttendance(m, note = "") {
  await addDoc(collection(db, "members", m.id, "attendance"), { at: serverTimestamp(), date: ymd(), note });
  await updateDoc(doc(db, "members", m.id), { lastVisit: serverTimestamp(), visits: increment(1) });
}

function welcomeMsg(m) {
  return `¡Hola ${m.name.split(" ")[0]}! 💪 Bienvenido a ${CONFIG.gymName}.\n\nTu ID de usuario es: *${m.id}*\n\nCrea tu contraseña aquí:\n${appUrl()}#/team/crear\n\nDespués entra con tu ID para reservar, ver tu progreso, dieta, rutina y chatear con tu coach.`;
}

async function createMember(data) {
  const phone = cleanPhone(data.phone);
  const id = await runTransaction(db, async (tx) => {
    const cRef = doc(db, "counters", "members");
    const c = await tx.get(cRef);
    const next = (c.exists() ? c.data().next : 1001);
    const id = `TS${next}`;
    tx.set(cRef, { next: next + 1 });
    tx.set(doc(db, "members", id), {
      ...data, name: data.name.trim(), phone,
      autoBlockDays: Number(data.autoBlockDays ?? CONFIG.autoBlockDefault ?? 0), status: "activo", uid: null,
      visits: 0, createdAt: serverTimestamp(), lastVisit: serverTimestamp(), paidUntil: null,
    });
    tx.set(doc(db, "logins", id), { v: 1, claimed: false, status: "activo" });
    return id;
  });
  const m = { id, name: data.name.trim(), phone };
  // Las medidas iniciales se guardan como primer registro del historial
  if (data.initWeight || data.initWaist || data.initFat || data.initHip) {
    await addDoc(collection(db, "members", id, "progress"), {
      date: ymd(), weight: data.initWeight || null, waist: data.initWaist || null, hip: data.initHip || null, fat: data.initFat || null,
      height: data.height || null, note: "Valoración inicial", by: "coach", at: serverTimestamp(),
    });
  }
  if (data.attend !== false) await registerAttendance(m, "Alta");
  return m;
}

async function deleteMember(m) {
  for (const sub of ["progress", "photos", "attendance", "plan"]) {
    const s = await getDocs(collection(db, "members", m.id, sub));
    await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
  }
  const msgs = await getDocs(collection(db, "chats", m.id, "messages"));
  await Promise.all(msgs.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "chats", m.id)).catch(() => {});
  await deleteDoc(doc(db, "logins", m.id));
  await deleteDoc(doc(db, "members", m.id));
}

async function resetAccess(m) {
  const L = (await getDoc(doc(db, "logins", m.id))).data() || { v: 1 };
  await setDoc(doc(db, "logins", m.id), { v: (L.v || 1) + 1, claimed: false, status: m.status }, { merge: true });
  await updateDoc(doc(db, "members", m.id), { uid: null });
}

/* ---------- Ficha completa del cliente (alta y edición) ---------- */
const TEXT_FIELDS = ["name", "email", "birth", "sex", "goal", "goalDetail", "activity", "experience", "service", "plan", "preferredTime", "occupation",
  "emergencyName", "emergencyPhone", "injuries", "conditions", "medications", "allergies", "surgeries", "alcohol", "smoking", "foodPrefs", "supplements",
  "referredBy", "notes", "waterIntake"];
const NUM_FIELDS = ["age", "height", "initWeight", "initWaist", "initHip", "initFat", "goalWeight", "trainingDays", "sleepHours", "mealsPerDay"];

function memberForm(m = {}, { isNew = false } = {}) {
  const ab = m.autoBlockDays ?? CONFIG.autoBlockDefault ?? 0;
  const custom = ![0, 30, 60].includes(Number(ab));
  const v = (k) => esc(m[k] ?? "");
  const inp = (k, label, attrs = "") => `<label class="field"><span>${label}</span><input class="inp" name="${k}" value="${v(k)}" ${attrs}></label>`;
  const num = (k, label, step = "0.1") => inp(k, label, `type="number" step="${step}" inputmode="decimal"`);
  const sel = (k, label, opts, empty = "—") => {
    const list = opts.map((o) => (Array.isArray(o) ? o : [o, o]));
    if (m[k] && !list.some(([val]) => val === m[k])) list.push([m[k], m[k]]);
    return `<label class="field"><span>${label}</span><select class="inp" name="${k}"><option value="">${empty}</option>${list.map(([val, l]) => `<option value="${esc(val)}" ${m[k] === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  };
  const area = (k, label, ph = "") => `<label class="field"><span>${label}</span><textarea class="inp" name="${k}" rows="2" placeholder="${esc(ph)}">${v(k)}</textarea></label>`;
  const group = (title, body, open = true) => `<details class="fgroup" ${open ? "open" : ""}><summary>${title}</summary>${body}</details>`;
  return `
    ${group("Datos generales", `<div class="grid3">
      <label class="field span2"><span>Nombre completo *</span><input class="inp" name="name" value="${v("name")}" required autocomplete="off"></label>
      ${sel("sex", "Sexo", SEXES)}
      <label class="field"><span>Fecha de nacimiento</span><input class="inp" name="birth" type="date" value="${v("birth")}"></label>
      ${num("age", "Edad", "1")}
      <label class="field"><span>Celular (WhatsApp) *</span><input class="inp" name="phone" type="tel" value="${v("phone")}" required></label>
      ${inp("email", "Correo", 'type="email"')}
      ${inp("occupation", "Ocupación")}
      ${inp("referredBy", "Recomendado por")}
      ${inp("emergencyName", "Contacto de emergencia")}
      ${inp("emergencyPhone", "Tel. de emergencia", 'type="tel"')}
    </div>`)}
    ${group("Medidas iniciales", `<div class="grid3">
      ${num("height", "Estatura (cm)", "0.5")}
      ${num("initWeight", "Peso (kg)")}
      <div class="field"><span>IMC</span><div class="calc" data-imc>—</div></div>
      ${num("initWaist", "Cintura (cm)")}
      ${num("initHip", "Cadera (cm)")}
      ${num("initFat", "% Grasa (si se midió)")}
    </div>${isNew ? `<p class="muted small">Se guardan como primer registro del historial de progreso.</p>` : ""}`)}
    ${group("Objetivo y entrenamiento", `<div class="grid3">
      ${sel("goal", "Objetivo", GOALS)}
      ${num("goalWeight", "Peso objetivo (kg)")}
      ${sel("activity", "Nivel de actividad física", ACTIVITY.map(([k, l]) => [k, l]))}
      ${sel("experience", "Experiencia entrenando", EXPERIENCE)}
      ${sel("service", "Servicio", CONFIG.classes.map((c) => c.name))}
      ${sel("plan", "Plan", CONFIG.plans.map((p) => p.name))}
      ${num("trainingDays", "Días por semana para entrenar", "1")}
      ${inp("preferredTime", "Horario preferido", 'placeholder="Ej. 7:00 AM"')}
      <div class="field"><span>Requerimiento estimado</span><div class="calc" data-tdee>—</div></div>
    </div>${area("goalDetail", "Detalle del objetivo", "Ej. bajar 8 kg para diciembre, prepararse para un 10K…")}`)}
    ${group("Salud", `<div class="grid2">
      ${area("injuries", "Lesiones o dolores", "Rodilla, espalda baja…")}
      ${area("conditions", "Enfermedades / condiciones", "Diabetes, hipertensión, tiroides…")}
      ${area("medications", "Medicamentos")}
      ${area("allergies", "Alergias / intolerancias alimentarias", "Lactosa, gluten, mariscos…")}
      ${area("surgeries", "Cirugías recientes")}
      ${area("supplements", "Suplementos que consume")}
    </div>`, isNew)}
    ${group("Hábitos y alimentación", `<div class="grid3">
      ${num("sleepHours", "Horas de sueño", "0.5")}
      ${inp("waterIntake", "Agua al día", 'placeholder="Ej. 2 L"')}
      ${num("mealsPerDay", "Comidas al día", "1")}
      ${sel("alcohol", "Alcohol", ["No", "Ocasional", "Fines de semana", "Frecuente"])}
      ${sel("smoking", "Tabaco", ["No", "Sí", "Ocasional"])}
    </div>${area("foodPrefs", "Preferencias alimentarias", "Alimentos que no le gustan, vegetariano, horarios de comida…")}`, isNew)}
    ${group("Cuenta y notas", `
      <div class="field"><span>Bloqueo automático por inactividad</span>
        <div class="seg" data-ab>${[[0, "Nunca"], [30, "1 mes"], [60, "2 meses"], ["c", "Personalizado"]].map(([val, l]) => `<button type="button" data-v="${val}" class="${(custom ? "c" : String(ab)) === String(val) ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="row gap-s mt-s" data-abc ${custom ? "" : "hidden"}><input class="inp" name="abDays" type="number" min="1" value="${custom ? ab : 45}" style="max-width:120px"><span class="muted">días sin venir</span></div></div>
      ${area("notes", "Notas del coach", "Observaciones generales")}`)}`;
}
function bindMemberForm(f) {
  $$("[data-ab] button", f).forEach((b) => (b.onclick = () => {
    $$("[data-ab] button", f).forEach((x) => x.classList.toggle("on", x === b));
    $("[data-abc]", f).hidden = b.dataset.v !== "c";
  }));
  // Cálculos en vivo: edad, IMC y requerimiento calórico
  const calc = () => {
    if (f.birth.value) { const a = ageOf({ birth: f.birth.value }); if (a != null) f.age.value = a; }
    const w = Number(f.initWeight.value) || null, h = Number(f.height.value) || null;
    const b = bmi(w, h), c = bmiCategory(b);
    $("[data-imc]", f).innerHTML = b ? `<b>${b}</b> <span class="chip-mini ${c.c}">${c.t}</span>` : "—";
    const m = { sex: f.sex.value, height: h, birth: f.birth.value, age: f.age.value, activity: f.activity.value };
    const B = bmr(m, w), T = tdee(m, w);
    $("[data-tdee]", f).innerHTML = B ? `TMB <b>${B}</b> kcal${T ? ` · GET <b>${T}</b> kcal` : ""}` : `<span class="muted small">Sexo, edad, estatura y peso</span>`;
  };
  ["birth", "age", "initWeight", "height", "sex", "activity"].forEach((k) => f[k].addEventListener("input", calc));
  calc();
}
function readMemberForm(f) {
  const on = $("[data-ab] .on", f)?.dataset.v || "0";
  const d = {};
  TEXT_FIELDS.forEach((k) => { if (f[k]) d[k] = f[k].value.trim(); });
  NUM_FIELDS.forEach((k) => { if (f[k]) d[k] = f[k].value === "" ? null : Number(f[k].value); });
  d.phone = cleanPhone(f.phone.value);
  d.emergencyPhone = cleanPhone(d.emergencyPhone);
  if (d.birth) d.age = ageOf({ birth: d.birth });
  d.autoBlockDays = on === "c" ? Math.max(1, Number(f.abDays.value) || 30) : Number(on);
  return d;
}

export function newMemberDialog(S, prefill = {}, onCreated) {
  const d = modal(`<h3 class="h3">Nuevo cliente · Dar asistencia</h3>
    <p class="muted small">Se genera un ID automáticamente y se registra su primera asistencia.</p>
    <form class="form" novalidate>${memberForm(prefill, { isNew: true })}
      <button type="submit" class="btn btn-metal w100 lg mt" data-submit>${icon("plus")} Crear cliente y generar ID</button></form>`, { wide: true });
  const f = $("form", d.el); bindMemberForm(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const data = readMemberForm(f);
    if (data.name.length < 3) return toast("Escribe el nombre completo", "err");
    if (data.phone.length < 10) return toast("Celular inválido", "err");
    const dup = [...S.members.values()].find((m) => cleanPhone(m.phone) === data.phone || m.name.toLowerCase() === data.name.toLowerCase());
    if (dup && !(await confirmDialog(`Ya existe ${dup.name} (${dup.id}) con ese nombre o teléfono. ¿Crear de todos modos?`, "Crear"))) return;
    const btn = $("[data-submit]", f); setBusy(btn, true, "Creando…");
    try {
      const m = await createMember(data);
      d.close();
      shareIdDialog({ ...m, ...data });
      onCreated?.(m);
    } catch (err) { console.error(err); setBusy(btn, false); toast("No se pudo crear", "err"); }
  };
}

function shareIdDialog(m) {
  const d = modal(`<div class="center">
    <div class="check-burst">${icon("check")}</div>
    <h3 class="h3">Cliente registrado</h3><p class="muted">${esc(m.name)}</p>
    <div class="id-card" data-tilt="10"><small>ID de usuario</small><b class="mono">${esc(m.id)}</b></div>
    <a class="btn btn-metal w100 lg mt" target="_blank" rel="noopener" href="${waLink(m.phone, welcomeMsg(m))}">${icon("whatsapp")} Enviar ID por WhatsApp</a>
    <button class="btn btn-ghost w100 mt-s" data-copy>Copiar mensaje</button></div>`);
  enhance(d.el);
  $("[data-copy]", d.el).onclick = () => { navigator.clipboard.writeText(welcomeMsg(m)); toast("Copiado"); };
}

/* ---------- Check-in por código / QR ---------- */
function checkInDialog(S) {
  const d = modal(`<h3 class="h3">Check-in de reserva</h3>
    <form class="row gap-s" data-f><input class="inp mono" name="c" placeholder="TS-XXXXXX" autocapitalize="characters"><button class="btn btn-metal">Buscar</button></form>
    ${"BarcodeDetector" in window ? `<button class="btn btn-ghost w100 mt-s" data-cam>${icon("camera")} Escanear QR</button><video data-v playsinline hidden class="scan"></video>` : ""}
    <div data-res class="mt"></div>`, { onClose: () => stop() });
  let stream = null, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const find = (code) => {
    code = code.trim().toUpperCase();
    const r = S.reservations.find((x) => x.code === code || x.id === code);
    const box = $("[data-res]", d.el);
    if (!r) { box.innerHTML = `<p class="muted center">No se encontró la reserva</p>`; return; }
    box.innerHTML = `${passHTML(r)}<div class="row gap mt-s">${statusChip(r.status)}<span class="grow"></span>
      ${r.status !== "completada" && r.status !== "cancelada" ? `<button class="btn btn-metal" data-ok>${icon("check")} Registrar asistencia</button>` : ""}</div>`;
    enhance(box);
    $("[data-ok]", box)?.addEventListener("click", async () => { await completeReservation(S, r); toast("Asistencia registrada"); d.close(); });
  };
  $("[data-f]", d.el).onsubmit = (e) => { e.preventDefault(); find(e.target.c.value); };
  $("[data-cam]", d.el)?.addEventListener("click", async () => {
    try {
      const v = $("[data-v]", d.el); v.hidden = false;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      v.srcObject = stream; await v.play();
      const det = new window.BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        const codes = await det.detect(v).catch(() => []);
        if (codes[0]) { stop(); v.hidden = true; find(codes[0].rawValue); return; }
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { toast("No se pudo abrir la cámara", "err"); }
  });
}

async function completeReservation(S, r) {
  await updateDoc(doc(db, "reservations", r.id), { status: "completada", completedAt: serverTimestamp() });
  const m = r.memberId && S.members.get(r.memberId);
  if (m) await registerAttendance(m, `${r.className} ${r.time}`);
}

/* ================= SECCIONES ================= */
const SECTIONS = {
  async inicio(el, S) {
    const today = ymd();
    const todays = S.reservations.filter((r) => r.date === today && r.status !== "cancelada").sort((a, b) => a.time.localeCompare(b.time));
    const members = [...S.members.values()];
    const active = members.filter((m) => effectiveStatus(m) === "activo");
    const pend = S.reservations.filter((r) => r.status === "pendiente");
    const overdue = active.filter((m) => m.paidUntil && toDate(m.paidUntil) < new Date());
    const risk = active.filter((m) => daysSince(m.lastVisit) >= 10).sort((a, b) => daysSince(b.lastVisit) - daysSince(a.lastVisit));
    const bdays = active.filter((m) => m.birth && m.birth.slice(5) === today.slice(5));
    el.innerHTML = `
      <div class="kpi-grid">
        ${kpi("Reservas hoy", todays.length, "calendar")}${kpi("Por confirmar", pend.length, "bell", pend.length ? "#/admin/reservas" : "")}
        ${kpi("Clientes activos", active.length, "users")}${kpi("Pagos vencidos", overdue.length, "money", overdue.length ? "#/admin/ingresos" : "")}
      </div>
      <div class="grid2 mt">
        <div class="card reveal"><div class="row between"><h3 class="h3">Agenda de hoy</h3><a class="link small" href="#/admin/reservas">Ver todas</a></div>
          ${todays.length ? `<div class="list">${todays.map((r) => `<div class="li"><b class="mono">${fmtTime(r.time)}</b><div class="grow"><b>${esc(r.name)}</b><small>${esc(r.className)} · ${r.type === "team" ? "Team" : "Nuevo"}</small></div>${statusChip(r.status)}</div>`).join("")}</div>` : `<p class="muted">Sin reservas para hoy</p>`}</div>
        <div class="card reveal"><h3 class="h3">Acciones rápidas</h3>
          <div class="quick"><button class="btn btn-metal" data-new>${icon("plus")} Nuevo cliente</button>
          <button class="btn btn-ghost" data-ci>${icon("qr")} Check-in</button>
          <a class="btn btn-ghost" href="#/admin/ingresos">${icon("money")} Registrar pago</a>
          <a class="btn btn-ghost" href="#/admin/avisos">${icon("megaphone")} Enviar aviso</a></div>
          ${bdays.length ? `<div class="alert alert-ok mt">🎂 Cumpleaños hoy: ${bdays.map((m) => `<a target="_blank" rel="noopener" href="${waLink(m.phone, `¡Feliz cumpleaños ${m.name.split(" ")[0]}! 🎉 De parte de todo ${CONFIG.gymName}.`)}">${esc(m.name)}</a>`).join(", ")}</div>` : ""}
        </div>
      </div>
      <div class="grid2 mt">
        <div class="card reveal"><h3 class="h3">En riesgo (sin venir 10+ días)</h3>
          ${risk.length ? `<div class="list">${risk.slice(0, 8).map((m) => `<div class="li"><div class="grow"><a href="#/admin/cliente/${m.id}"><b>${esc(m.name)}</b></a><small>${m.lastVisit ? `Última visita ${timeAgo(m.lastVisit)}` : "Sin visitas"}${m.autoBlockDays ? ` · bloqueo a los ${m.autoBlockDays} días` : ""}</small></div>
            <a class="icon-btn sm" target="_blank" rel="noopener" href="${waLink(m.phone, `¡Hola ${m.name.split(" ")[0]}! Te extrañamos en ${CONFIG.gymName} 💪 ¿Te agendo tu próxima sesión?`)}" title="WhatsApp">${icon("whatsapp")}</a></div>`).join("")}</div>` : `<p class="muted">Todos vienen constante 🔥</p>`}</div>
        <div class="card reveal"><h3 class="h3">Pagos vencidos</h3>
          ${overdue.length ? `<div class="list">${overdue.slice(0, 8).map((m) => `<div class="li"><div class="grow"><a href="#/admin/cliente/${m.id}"><b>${esc(m.name)}</b></a><small>${esc(m.plan || "Plan")} · venció ${fmtDate(m.paidUntil)}</small></div>
            <a class="icon-btn sm" target="_blank" rel="noopener" href="${waLink(m.phone, `Hola ${m.name.split(" ")[0]}, tu ${m.plan || "membresía"} en ${CONFIG.gymName} venció el ${fmtDate(m.paidUntil)}. ¿Te ayudo a renovarla?`)}">${icon("whatsapp")}</a></div>`).join("")}</div>` : `<p class="muted">Sin adeudos</p>`}</div>
      </div>`;
    $("[data-new]", el).onclick = () => newMemberDialog(S);
    $("[data-ci]", el).onclick = () => checkInDialog(S);
  },

  async reservas(el, S) {
    S.resTab ??= "nuevas"; S.resDate ??= "";
    const today = ymd();
    const tabs = {
      nuevas: (r) => r.type !== "team" && ["pendiente", "confirmada"].includes(r.status) && r.date >= today,
      team: (r) => r.type === "team" && ["pendiente", "confirmada"].includes(r.status) && r.date >= today,
      completadas: (r) => r.status === "completada" || (r.status === "confirmada" && r.date < today),
      canceladas: (r) => r.status === "cancelada" || (r.status === "pendiente" && r.date < today),
    };
    const count = (k) => S.reservations.filter(tabs[k]).length;
    let list = S.reservations.filter(tabs[S.resTab]);
    if (S.resDate) list = list.filter((r) => r.date === S.resDate);
    list.sort((a, b) => (S.resTab === "nuevas" || S.resTab === "team" ? 1 : -1) * (a.date + a.time).localeCompare(b.date + b.time));
    el.innerHTML = `
      <div class="row between wrap gap">
        <div class="seg">${[["nuevas", "Nuevas"], ["team", "Team"], ["completadas", "Completadas"], ["canceladas", "Canceladas"]].map(([k, l]) => `<button data-t="${k}" class="${S.resTab === k ? "on" : ""}">${l} (${count(k)})</button>`).join("")}</div>
        <div class="row gap-s"><input type="date" class="inp" data-date value="${S.resDate}">${S.resDate ? `<button class="btn btn-ghost sm" data-clr>Todas</button>` : ""}</div>
      </div>
      <div class="card table-wrap mt reveal"><table class="table">
        <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Objetivo</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map((r) => `<tr>
          <td>${fmtDate(r.date)}</td><td class="mono">${fmtTime(r.time)}</td>
          <td><b>${r.memberId ? `<a href="#/admin/cliente/${r.memberId}">${esc(r.name)}</a>` : esc(r.name)}</b><small class="block muted">${esc(r.phone)}${r.referredBy ? ` · Ref: ${esc(r.referredBy)}` : ""}</small></td>
          <td>${esc(r.className)}</td><td class="muted small">${esc(r.goal || "—")}</td><td>${statusChip(r.status)}</td>
          <td class="actions">
            ${r.status === "pendiente" ? `<button class="icon-btn sm" data-a="ok" data-id="${r.id}" title="Confirmar">${icon("check")}</button>` : ""}
            ${["pendiente", "confirmada"].includes(r.status) ? `<button class="icon-btn sm" data-a="done" data-id="${r.id}" title="Asistió">${icon("flame")}</button>` : ""}
            <a class="icon-btn sm" target="_blank" rel="noopener" href="${waLink(r.phone, `Hola ${r.name.split(" ")[0]}, tu reserva de ${r.className} el ${fmtDate(r.date)} a las ${fmtTime(r.time)} en ${CONFIG.gymName} está confirmada ✅ Código: ${r.code}`)}" title="WhatsApp">${icon("whatsapp")}</a>
            ${!r.memberId ? `<button class="icon-btn sm" data-a="member" data-id="${r.id}" title="Crear socio">${icon("plus")}</button>` : ""}
            ${["pendiente", "confirmada"].includes(r.status) ? `<button class="icon-btn sm danger" data-a="cancel" data-id="${r.id}" title="Cancelar">${icon("x")}</button>` : ""}
          </td></tr>`).join("") || `<tr><td colspan="7" class="center muted pad">Sin reservas</td></tr>`}</tbody></table></div>`;
    $$("[data-t]", el).forEach((b) => (b.onclick = () => { S.resTab = b.dataset.t; SECTIONS.reservas(el, S); enhance(el); }));
    $("[data-date]", el).onchange = (e) => { S.resDate = e.target.value; SECTIONS.reservas(el, S); enhance(el); };
    $("[data-clr]", el)?.addEventListener("click", () => { S.resDate = ""; SECTIONS.reservas(el, S); enhance(el); });
    $$("[data-a]", el).forEach((b) => (b.onclick = async () => {
      const r = S.reservations.find((x) => x.id === b.dataset.id);
      const a = b.dataset.a;
      try {
        if (a === "ok") { await updateDoc(doc(db, "reservations", r.id), { status: "confirmada" }); if (r.memberId) notify(r.memberId, "Reserva confirmada", `${r.className} · ${fmtDate(r.date)} ${fmtTime(r.time)}`, "reserva"); toast("Reserva confirmada"); }
        if (a === "done") { await completeReservation(S, r); toast("Asistencia registrada"); }
        if (a === "cancel") {
          if (!(await confirmDialog(`¿Cancelar la reserva de ${r.name}?`, "Cancelar reserva"))) return;
          await cancelReservation(r);
          if (r.memberId) notify(r.memberId, "Reserva cancelada", `Tu reserva de ${r.className} (${fmtDate(r.date)} ${fmtTime(r.time)}) fue cancelada por el coach.`, "reserva");
          toast("Reserva cancelada");
        }
        if (a === "member") newMemberDialog(S, { name: r.name, phone: r.phone, goal: r.goal, referredBy: r.referredBy }, async (m) => {
          await updateDoc(doc(db, "reservations", r.id), { memberId: m.id, status: r.date <= today ? "completada" : r.status });
        });
      } catch (e) { console.error(e); toast("No se pudo actualizar", "err"); }
    }));
  },

  async clientes(el, S) {
    S.cq ??= ""; S.cf ??= "todos";
    const all = [...S.members.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const draw = () => {
      const q = S.cq.toLowerCase();
      const list = all.filter((m) => (S.cf === "todos" || effectiveStatus(m) === S.cf) && (!q || `${m.id} ${m.name} ${m.phone}`.toLowerCase().includes(q)));
      $("[data-rows]", el).innerHTML = list.map((m) => {
        const st = effectiveStatus(m);
        const paid = toDate(m.paidUntil);
        return `<tr>
          <td class="mono">${esc(m.id)}</td>
          <td><a href="#/admin/cliente/${m.id}"><b>${esc(m.name)}</b></a><small class="block muted">${esc(m.phone)}${m.uid ? "" : " · sin contraseña"}</small></td>
          <td>${statusChip(st)}</td>
          <td class="small">${esc(m.plan || "—")}${paid ? `<small class="block ${paid < new Date() ? "txt-err" : "muted"}">hasta ${fmtDate(paid)}</small>` : ""}</td>
          <td class="small">${m.lastVisit ? timeAgo(m.lastVisit) : "—"}<small class="block muted">${m.visits || 0} visitas</small></td>
          <td class="actions">
            <button class="icon-btn sm" data-att="${m.id}" title="Dar asistencia">${icon("check")}</button>
            <a class="icon-btn sm" href="#/admin/cliente/${m.id}/progreso" title="Progreso">${icon("chart")}</a>
            <a class="icon-btn sm" href="#/admin/cliente/${m.id}" title="Editar">${icon("edit")}</a>
            <a class="icon-btn sm" target="_blank" rel="noopener" href="${waLink(m.phone, `Hola ${m.name.split(" ")[0]} 👋`)}" title="WhatsApp">${icon("whatsapp")}</a>
          </td></tr>`;
      }).join("") || `<tr><td colspan="6" class="center muted pad">Sin clientes</td></tr>`;
      $$("[data-att]", el).forEach((b) => (b.onclick = async () => {
        const m = S.members.get(b.dataset.att);
        if (effectiveStatus(m) !== "activo") {
          if (!(await confirmDialog(`${m.name} está ${effectiveStatus(m)}. ¿Reactivar y registrar asistencia?`, "Reactivar"))) return;
          await setStatus(m, "activo");
        }
        await registerAttendance(m); toast(`Asistencia de ${m.name.split(" ")[0]} registrada`);
      }));
    };
    el.innerHTML = `
      <div class="row between wrap gap">
        <div class="input grow" style="max-width:380px">${icon("search")}<input data-q placeholder="Buscar por nombre, ID o teléfono…" value="${esc(S.cq)}"></div>
        <div class="row gap-s wrap"><div class="seg">${["todos", "activo", "inactivo", "bloqueado"].map((k) => `<button data-f="${k}" class="${S.cf === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
        <button class="btn btn-ghost" data-csv>${icon("download")} CSV</button>
        <button class="btn btn-metal" data-new>${icon("plus")} Nuevo cliente</button></div>
      </div>
      <div class="card table-wrap mt reveal"><table class="table"><thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Plan</th><th>Última visita</th><th>Acciones</th></tr></thead><tbody data-rows></tbody></table></div>`;
    $("[data-q]", el).oninput = (e) => { S.cq = e.target.value; draw(); };
    $$("[data-f]", el).forEach((b) => (b.onclick = () => { S.cf = b.dataset.f; $$("[data-f]", el).forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    $("[data-new]", el).onclick = () => newMemberDialog(S);
    $("[data-csv]", el).onclick = () => csv("clientes", ["ID", "Nombre", "Celular", "Estado", "Plan", "Vigencia", "Visitas", "Ultima visita", "Alta"],
      all.map((m) => [m.id, m.name, m.phone, effectiveStatus(m), m.plan, m.paidUntil ? fmtDate(m.paidUntil) : "", m.visits || 0, m.lastVisit ? fmtDate(m.lastVisit) : "", fmtDate(m.createdAt)]));
    draw();
  },

  async cliente(el, S, arg, soft = false) {
    const id = String(arg || "").split("/")[0];
    const tabFromHash = location.hash.split("/")[4];
    const m = S.members.get(id);
    if (!m) { el.innerHTML = `<div class="card center muted">Cliente no encontrado. <a href="#/admin/clientes" class="link">Volver</a></div>`; return; }
    const st = effectiveStatus(m);
    const age = ageOf(m);
    const hero = `
        <a href="#/admin/clientes" class="icon-btn sm">${icon("back")}</a>
        <div class="avatar lg">${m.avatar ? `<img src="${m.avatar}" alt="">` : esc(m.name[0])}</div>
        <div class="grow"><h2>${esc(m.name)}</h2><p class="muted"><span class="mono">${esc(m.id)}</span> · ${esc(m.phone)}${age != null ? ` · ${age} años` : ""}${m.sex ? ` · ${m.sex === "F" ? "Mujer" : "Hombre"}` : ""}${m.height ? ` · ${m.height} cm` : ""}${m.goal ? ` · ${esc(m.goal)}` : ""}</p>
          <p class="muted small">${esc(m.service || "")}${m.service ? " · " : ""}${m.visits || 0} visitas · ${m.uid ? "Cuenta activa" : "Sin contraseña aún"}</p></div>
        ${statusChip(st)}`;
    // En actualizaciones automáticas solo se refresca el encabezado para no borrar lo que el coach está capturando
    if (soft && S.ctabFor === id && $("[data-ctab]", el)) { $(".client-hero", el).innerHTML = hero; return; }
    S.ctab = tabFromHash || S.ctab || "datos";
    if (S.ctabFor !== id) { S.ctab = tabFromHash || "datos"; S.ctabFor = id; }
    el.innerHTML = `
      <div class="client-hero card reveal">${hero}</div>
      <div class="seg scroll mt">${[["datos", "Ficha"], ["progreso", "Progreso"], ["rutina", "Rutina"], ["dieta", "Dieta"], ["pagos", "Pagos"], ["asistencias", "Asistencias"]].map(([k, l]) => `<button data-ct="${k}" class="${S.ctab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div data-ctab class="mt"></div>`;
    $$("[data-ct]", el).forEach((b) => (b.onclick = () => { S.ctab = b.dataset.ct; history.replaceState(null, "", `#/admin/cliente/${id}/${S.ctab}`); $$("[data-ct]", el).forEach((x) => x.classList.toggle("on", x === b)); drawTab(); }));
    const drawTab = async () => { const c = $("[data-ctab]", el); c.innerHTML = `<div class="center pad"><span class="spinner"></span></div>`; await CTABS[S.ctab](c, S, S.members.get(id) || m); enhance(c); };
    drawTab();
  },

  async progreso(el, S) { pickClient(el, S, "progreso", "Selecciona un cliente para ver o subir su progreso"); },
  async rutinas(el, S) { pickClient(el, S, "rutina", "Selecciona un cliente para asignar su rutina", "routine"); },
  async dietas(el, S) { pickClient(el, S, "dieta", "Selecciona un cliente para asignar su dieta", "diet"); },

  async chat(el, S, arg) {
    const open = arg;
    el.innerHTML = `<div class="chat-admin card reveal">
      <div class="chat-list ${open ? "hide-m" : ""}">
        <div class="input">${icon("search")}<input data-cs placeholder="Buscar cliente…"></div>
        <div data-cl></div></div>
      <div class="chat-thread ${open ? "" : "hide-m"}" data-th>${open ? "" : `<div class="center muted pad">Selecciona una conversación</div>`}</div></div>`;
    const drawList = (q = "") => {
      const withChat = new Set(S.chats.map((c) => c.id));
      const extra = [...S.members.values()].filter((m) => !withChat.has(m.id) && q && m.name.toLowerCase().includes(q.toLowerCase())).map((m) => ({ id: m.id, name: m.name }));
      const items = [...S.chats.filter((c) => !q || (c.name || "").toLowerCase().includes(q.toLowerCase())), ...extra];
      $("[data-cl]", el).innerHTML = items.map((c) => `<a href="#/admin/chat/${c.id}" class="chat-item ${c.id === open ? "on" : ""}">
        <div class="avatar sm">${esc((c.name || S.members.get(c.id)?.name || "?")[0])}</div>
        <div class="grow"><b>${esc(c.name || S.members.get(c.id)?.name || c.id)}</b><small>${esc(c.lastMsg || "Nueva conversación")}</small></div>
        ${c.unreadAdmin ? `<i class="badge">${c.unreadAdmin}</i>` : `<small class="muted">${c.lastAt ? timeAgo(c.lastAt) : ""}</small>`}</a>`).join("") || `<p class="muted pad small">Aún no hay conversaciones. Busca un cliente para escribirle.</p>`;
    };
    $("[data-cs]", el).oninput = (e) => drawList(e.target.value);
    drawList();
    if (!open) return;
    const m = S.members.get(open);
    const th = $("[data-th]", el);
    th.innerHTML = `<div class="thread-head"><a href="#/admin/chat" class="icon-btn sm only-m">${icon("back")}</a><b>${esc(m?.name || open)}</b>
      <a class="link small" href="#/admin/cliente/${open}">Ver perfil</a></div>
      <div class="chat-msgs" data-msgs></div>
      <form class="chat-form"><input name="t" placeholder="Escribe un mensaje…" autocomplete="off"><button class="icon-btn metal">${icon("send")}</button></form>`;
    const box = $("[data-msgs]", th);
    S.sub?.();
    S.sub = onSnapshot(query(collection(db, "chats", open, "messages"), orderBy("at", "asc")), (snap) => {
      box.innerHTML = snap.docs.map((d) => d.data()).map((x) => `<div class="msg ${x.from === "admin" ? "me" : ""}"><p>${esc(x.text)}</p><small>${timeAgo(x.at)}</small></div>`).join("") || `<p class="muted center pad">Sin mensajes</p>`;
      box.scrollTop = box.scrollHeight;
      setDoc(doc(db, "chats", open), { unreadAdmin: 0 }, { merge: true }).catch(() => {});
    });
    const f = $(".chat-form", th);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const text = f.t.value.trim(); if (!text) return; f.t.value = "";
      await addDoc(collection(db, "chats", open, "messages"), { from: "admin", text, at: serverTimestamp() });
      await setDoc(doc(db, "chats", open), { memberId: open, name: m?.name || open, lastMsg: text, lastAt: serverTimestamp(), unreadMember: increment(1) }, { merge: true });
      notify(open, "Mensaje de tu coach", text.slice(0, 120), "chat");
    };
  },

  async reportes(el, S) {
    S.rMonth ??= ymd().slice(0, 7);
    const [y, mo] = S.rMonth.split("-").map(Number);
    const prevKey = `${mo === 1 ? y - 1 : y}-${pad(mo === 1 ? 12 : mo - 1)}`;
    el.innerHTML = `<div class="center pad"><span class="spinner"></span></div>`;
    const pays = (await getDocs(query(collection(db, "payments"), where("date", ">=", prevKey + "-01"), where("date", "<=", S.rMonth + "-31")))).docs.map((d) => d.data());
    const inMonth = (d, k) => d && d.startsWith(k);
    const rev = (k) => pays.filter((p) => inMonth(p.date, k)).reduce((a, p) => a + Number(p.amount || 0), 0);
    const res = (k) => S.reservations.filter((r) => inMonth(r.date, k) && r.status !== "cancelada");
    const members = [...S.members.values()];
    const newC = (k) => members.filter((m) => toDate(m.createdAt) && ymd(toDate(m.createdAt)).startsWith(k)).length;
    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
    const cur = { rev: rev(S.rMonth), res: res(S.rMonth).length, nc: newC(S.rMonth) };
    const prv = { rev: rev(prevKey), res: res(prevKey).length, nc: newC(prevKey) };
    const active = members.filter((m) => effectiveStatus(m) === "activo").length;
    const days = new Date(y, mo, 0).getDate();
    const byDay = Array.from({ length: days }, (_, i) => {
      const k = `${S.rMonth}-${pad(i + 1)}`;
      const v = pays.filter((p) => p.date === k).reduce((a, p) => a + Number(p.amount || 0), 0);
      return { label: fmtDate(k), short: (i + 1) % 5 === 1 ? String(i + 1) : "", v, fmt: money(v) };
    });
    const byClass = CONFIG.classes.map((c) => ({ label: c.name, v: res(S.rMonth).filter((r) => r.className === c.name).length }));
    const byHour = CONFIG.hours.map((h) => ({ label: fmtTime(h), short: fmtTime(h).replace(":00", ""), v: res(S.rMonth).filter((r) => r.time === h).length }));
    const byMethod = {}; pays.filter((p) => inMonth(p.date, S.rMonth)).forEach((p) => (byMethod[p.method || "Otro"] = (byMethod[p.method || "Otro"] || 0) + Number(p.amount || 0)));
    const top = members.slice().sort((a, b) => (b.visits || 0) - (a.visits || 0)).slice(0, 8);
    const refs = {}; members.forEach((m) => m.referredBy && (refs[m.referredBy] = (refs[m.referredBy] || 0) + 1));
    el.innerHTML = `
      <div class="row between wrap gap"><h2 class="h2">Reporte de ${MONTHS[mo - 1]} ${y}</h2>
        <div class="row gap-s"><input type="month" class="inp" data-m value="${S.rMonth}"><button class="btn btn-ghost" data-csv>${icon("download")} Pagos CSV</button></div></div>
      <div class="kpi-grid mt">
        ${kpi("Ingresos", money(cur.rev), "money", "", pct(cur.rev, prv.rev))}
        ${kpi("Clientes activos", active, "users")}
        ${kpi("Reservas totales", cur.res, "calendar", "", pct(cur.res, prv.res))}
        ${kpi("Nuevos clientes", cur.nc, "plus", "", pct(cur.nc, prv.nc))}
      </div>
      <div class="card mt reveal"><h3 class="h3">Ingresos por día</h3>${barChart(byDay)}</div>
      <div class="grid2 mt">
        <div class="card reveal"><h3 class="h3">Reservas por servicio</h3>${hbars(byClass)}</div>
        <div class="card reveal"><h3 class="h3">Horarios más solicitados</h3>${barChart(byHour, { height: 140 })}</div>
        <div class="card reveal"><h3 class="h3">Ingresos por método</h3>${hbars(Object.entries(byMethod).map(([k, v]) => ({ label: k, v, fmt: money(v) })))}</div>
        <div class="card reveal"><h3 class="h3">Clientes más constantes</h3><div class="list">${top.map((m, i) => `<div class="li"><b class="mono">${i + 1}</b><a class="grow" href="#/admin/cliente/${m.id}">${esc(m.name)}</a><b>${m.visits || 0}</b></div>`).join("") || `<p class="muted">Sin datos</p>`}</div></div>
        <div class="card reveal"><h3 class="h3">Estado de clientes</h3>${hbars(["activo", "inactivo", "bloqueado"].map((s) => ({ label: s[0].toUpperCase() + s.slice(1), v: members.filter((m) => effectiveStatus(m) === s).length })))}</div>
        <div class="card reveal"><h3 class="h3">Top recomendadores</h3>${hbars(Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: k, v })))}</div>
      </div>`;
    $("[data-m]", el).onchange = (e) => { S.rMonth = e.target.value || ymd().slice(0, 7); SECTIONS.reportes(el, S).then(() => enhance(el)); };
    $("[data-csv]", el).onclick = () => csv(`pagos-${S.rMonth}`, ["Fecha", "Cliente", "Concepto", "Método", "Monto"], pays.filter((p) => inMonth(p.date, S.rMonth)).map((p) => [p.date, p.name, p.concept, p.method, p.amount]));
  },

  async ingresos(el, S) {
    S.iMonth ??= ymd().slice(0, 7);
    el.innerHTML = `<div class="center pad"><span class="spinner"></span></div>`;
    const snap = await getDocs(query(collection(db, "payments"), where("date", ">=", S.iMonth + "-01"), where("date", "<=", S.iMonth + "-31")));
    const pays = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
    const total = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
    const overdue = [...S.members.values()].filter((m) => effectiveStatus(m) === "activo" && m.paidUntil && toDate(m.paidUntil) < new Date());
    el.innerHTML = `
      <div class="row between wrap gap"><div class="row gap-s"><input type="month" class="inp" data-m value="${S.iMonth}"><div class="pill-total">Total: <b>${money(total)}</b></div></div>
        <button class="btn btn-metal" data-add>${icon("plus")} Registrar pago</button></div>
      ${overdue.length ? `<div class="alert alert-warn mt">${icon("money")} ${overdue.length} cliente(s) con pago vencido: ${overdue.slice(0, 6).map((m) => `<a href="#/admin/cliente/${m.id}/pagos">${esc(m.name)}</a>`).join(", ")}${overdue.length > 6 ? "…" : ""}</div>` : ""}
      <div class="card table-wrap mt reveal"><table class="table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th>Método</th><th class="r">Monto</th><th></th></tr></thead>
      <tbody>${pays.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${p.memberId ? `<a href="#/admin/cliente/${p.memberId}">${esc(p.name)}</a>` : esc(p.name)}</td><td>${esc(p.concept)}</td><td>${esc(p.method)}</td><td class="r"><b>${money(p.amount)}</b></td>
        <td class="actions"><button class="icon-btn sm danger" data-del="${p.id}">${icon("trash")}</button></td></tr>`).join("") || `<tr><td colspan="6" class="center muted pad">Sin pagos este mes</td></tr>`}</tbody></table></div>`;
    $("[data-m]", el).onchange = (e) => { S.iMonth = e.target.value || ymd().slice(0, 7); SECTIONS.ingresos(el, S).then(() => enhance(el)); };
    $("[data-add]", el).onclick = () => paymentDialog(S, null, () => SECTIONS.ingresos(el, S).then(() => enhance(el)));
    $$("[data-del]", el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmDialog("¿Eliminar este pago?", "Eliminar"))) return;
      await deleteDoc(doc(db, "payments", b.dataset.del)); toast("Pago eliminado"); SECTIONS.ingresos(el, S).then(() => enhance(el));
    }));
  },

  async avisos(el, S) {
    const active = [...S.members.values()].filter((m) => effectiveStatus(m) === "activo");
    el.innerHTML = `<div class="grid2">
      <form class="card form reveal" data-f><h3 class="h3">Enviar aviso al Team</h3>
        <p class="muted small">Llega como notificación a la app de cada socio.</p>
        <label class="field"><span>Título</span><input class="inp" name="t" maxlength="60" placeholder="Ej. Horario especial" required></label>
        <label class="field"><span>Mensaje</span><textarea class="inp" name="b" rows="4" maxlength="400" placeholder="Este lunes abrimos de 7 a 12…" required></textarea></label>
        <label class="field"><span>Destinatarios</span><select class="inp" name="to"><option value="all">Todos los activos (${active.length})</option>${CONFIG.plans.map((p) => `<option value="plan:${esc(p.name)}">Plan: ${esc(p.name)}</option>`).join("")}</select></label>
        <button class="btn btn-metal w100">${icon("send")} Enviar aviso</button></form>
      <div class="card reveal"><h3 class="h3">Mensajes rápidos por WhatsApp</h3><p class="muted small">Abre WhatsApp con el mensaje listo para cada cliente.</p>
        <div class="list" data-wa>${active.slice(0, 50).map((m) => `<div class="li"><span class="grow">${esc(m.name)}</span><a class="icon-btn sm" target="_blank" rel="noopener" data-wa-to="${m.id}" href="#">${icon("whatsapp")}</a></div>`).join("")}</div></div></div>`;
    const f = $("[data-f]", el);
    $$("[data-wa-to]", el).forEach((a) => a.addEventListener("click", () => {
      const m = S.members.get(a.dataset.waTo);
      a.href = waLink(m.phone, `${f.t.value ? `*${f.t.value}*\n` : ""}${f.b.value || `Hola ${m.name.split(" ")[0]} 👋`}`);
    }));
    f.onsubmit = async (e) => {
      e.preventDefault();
      const t = f.t.value.trim(), b = f.b.value.trim(); if (!t || !b) return toast("Completa título y mensaje", "err");
      const to = f.to.value;
      const targets = active.filter((m) => to === "all" || m.plan === to.slice(5));
      if (!(await confirmDialog(`¿Enviar aviso a ${targets.length} socio(s)?`, "Enviar"))) return;
      const btn = $("button", f); setBusy(btn, true);
      for (let i = 0; i < targets.length; i += 400) {
        const batch = writeBatch(db);
        targets.slice(i, i + 400).forEach((m) => batch.set(doc(collection(db, "notifications")), { to: m.id, title: t, body: b, type: "aviso", read: false, at: serverTimestamp() }));
        await batch.commit();
      }
      await addDoc(collection(db, "announcements"), { title: t, body: b, to, count: targets.length, at: serverTimestamp() });
      setBusy(btn, false); f.reset(); toast(`Aviso enviado a ${targets.length} socio(s)`);
    };
  },

  async config(el, S) {
    S.editing = true;
    const C = structuredClone(CONFIG);
    const PRESETS = [["Plata", "#050505", "#121212", "#e9e9e9", "#f2f2f2"], ["Oro", "#070605", "#15120d", "#d9b56a", "#f5efe3"], ["Rojo", "#060505", "#141010", "#e04646", "#f4eeee"], ["Azul", "#04060a", "#0e131b", "#5aa2ff", "#eef3fb"], ["Verde", "#040705", "#0e1510", "#46d17d", "#eef7f1"]];
    el.innerHTML = `
    <form class="config" data-f>
      <div class="grid2">
        <div class="card reveal"><h3 class="h3">Identidad</h3>
          <div class="row gap"><img class="cfg-logo" data-logo-prev src="${esc(C.logo)}" alt=""><div class="stack grow">
            <label class="btn btn-ghost">${icon("camera")} Cambiar logo<input type="file" accept="image/*" data-logo-file hidden></label>
            <button type="button" class="btn btn-text sm" data-logo-reset>Restaurar logo original</button></div></div>
          <label class="field"><span>Nombre del gym</span><input class="inp" name="gymName" value="${esc(C.gymName)}"></label>
          <label class="field"><span>Eslogan</span><input class="inp" name="slogan" value="${esc(C.slogan)}"></label>
          <label class="field"><span>Frase</span><input class="inp" name="quote" value="${esc(C.quote)}"></label>
        </div>
        <div class="card reveal"><h3 class="h3">Contacto y redes</h3>
          <label class="field"><span>WhatsApp del coach (con lada, ej. 528711234567)</span><input class="inp" name="whatsapp" value="${esc(C.whatsapp)}"></label>
          <label class="field"><span>Teléfono visible</span><input class="inp" name="phone" value="${esc(C.phone)}"></label>
          ${["instagram", "tiktok", "youtube", "facebook"].map((k) => `<label class="field"><span>${k[0].toUpperCase() + k.slice(1)}</span><div class="input">${icon(k)}<input name="l_${k}" value="${esc(C.links[k] || "")}" placeholder="https://… (vacío = oculto)"></div></label>`).join("")}
        </div>
        <div class="card reveal"><h3 class="h3">Colores</h3>
          <div class="presets">${PRESETS.map((p) => `<button type="button" class="preset" data-preset='${JSON.stringify(p.slice(1))}' style="--a:${p[3]};--b:${p[1]}"><i></i>${p[0]}</button>`).join("")}</div>
          <div class="grid2 mt-s">${[["bg", "Fondo"], ["surface", "Tarjetas"], ["accent", "Acento / botones"], ["text", "Texto"]].map(([k, l]) => `<label class="field color"><span>${l}</span><input type="color" name="c_${k}" value="${esc(C.colors[k])}"></label>`).join("")}</div>
        </div>
        <div class="card reveal"><h3 class="h3">Horarios</h3>
          <label class="field"><span>Horas disponibles (separadas por coma, formato 24h)</span><input class="inp mono" name="hours" value="${esc(C.hours.join(", "))}"></label>
          <div class="field"><span>Días cerrados</span><div class="days-pick">${DAYS.map((d, i) => `<label class="check"><input type="checkbox" name="cd" value="${i}" ${C.closedDays.includes(i) ? "checked" : ""}><span></span>${d.slice(0, 3)}</label>`).join("")}</div></div>
          <label class="field"><span>Bloqueo automático por defecto para nuevos clientes (días, 0 = nunca)</span><input class="inp" type="number" min="0" name="autoBlockDefault" value="${esc(C.autoBlockDefault)}"></label>
        </div>
        <div class="card reveal"><h3 class="h3">Servicios y cupo</h3><div data-classes></div><button type="button" class="btn btn-ghost sm" data-add-class>${icon("plus")} Agregar servicio</button></div>
        <div class="card reveal"><h3 class="h3">Planes y precios</h3><div data-plans></div><button type="button" class="btn btn-ghost sm" data-add-plan>${icon("plus")} Agregar plan</button></div>
      </div>
      <div class="save-bar"><button type="button" class="btn btn-ghost" data-pw>${icon("lock")} Cambiar contraseña admin</button><button class="btn btn-metal lg">${icon("check")} Guardar cambios</button></div>
    </form>`;
    const f = $("[data-f]", el);
    const rowsCls = () => { $("[data-classes]", el).innerHTML = C.classes.map((c, i) => `<div class="row gap-s mb-s"><input class="inp grow" data-cn="${i}" value="${esc(c.name)}" placeholder="Servicio"><input class="inp" style="width:90px" type="number" min="1" data-cc="${i}" value="${c.capacity}" title="Cupo"><button type="button" class="icon-btn sm danger" data-cd="${i}">${icon("trash")}</button></div>`).join("");
      $$("[data-cd]", el).forEach((b) => (b.onclick = () => { sync(); C.classes.splice(+b.dataset.cd, 1); rowsCls(); })); };
    const rowsPlans = () => { $("[data-plans]", el).innerHTML = C.plans.map((p, i) => `<div class="row gap-s mb-s"><input class="inp grow" data-pn="${i}" value="${esc(p.name)}" placeholder="Plan"><input class="inp" style="width:90px" type="number" min="0" data-pp="${i}" value="${p.price}" title="Precio"><input class="inp" style="width:80px" type="number" min="0" data-pd="${i}" value="${p.days ?? 30}" title="Días de vigencia"><button type="button" class="icon-btn sm danger" data-pdel="${i}">${icon("trash")}</button></div>`).join("") + `<p class="muted small">Nombre · precio · días de vigencia</p>`;
      $$("[data-pdel]", el).forEach((b) => (b.onclick = () => { sync(); C.plans.splice(+b.dataset.pdel, 1); rowsPlans(); })); };
    const sync = () => {
      C.classes = C.classes.map((c, i) => ({ name: $(`[data-cn="${i}"]`, el)?.value.trim() || c.name, capacity: Number($(`[data-cc="${i}"]`, el)?.value) || 1 }));
      C.plans = C.plans.map((p, i) => ({ name: $(`[data-pn="${i}"]`, el)?.value.trim() || p.name, price: Number($(`[data-pp="${i}"]`, el)?.value) || 0, days: Number($(`[data-pd="${i}"]`, el)?.value) || 0 }));
    };
    rowsCls(); rowsPlans();
    $("[data-add-class]", el).onclick = () => { sync(); C.classes.push({ name: "Nuevo servicio", capacity: 5 }); rowsCls(); };
    $("[data-add-plan]", el).onclick = () => { sync(); C.plans.push({ name: "Nuevo plan", price: 0, days: 30 }); rowsPlans(); };
    $$("[data-preset]", el).forEach((b) => (b.onclick = () => { const [bg, s, a, t] = JSON.parse(b.dataset.preset); f.c_bg.value = bg; f.c_surface.value = s; f.c_accent.value = a; f.c_text.value = t; preview(); }));
    const preview = () => { const r = document.documentElement.style; r.setProperty("--bg", f.c_bg.value); r.setProperty("--surface", f.c_surface.value); r.setProperty("--accent", f.c_accent.value); r.setProperty("--text", f.c_text.value); };
    $$("input[type=color]", f).forEach((i) => (i.oninput = preview));
    $("[data-logo-file]", el).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; C.logo = await compressImage(file, 700, 0.9); $("[data-logo-prev]", el).src = C.logo; };
    $("[data-logo-reset]", el).onclick = () => { C.logo = "assets/logo.jpg"; $("[data-logo-prev]", el).src = C.logo; };
    $("[data-pw]", el).onclick = () => changePasswordDialog();
    f.onsubmit = async (e) => {
      e.preventDefault(); sync();
      const hours = f.hours.value.split(/[,\s]+/).map((h) => h.trim()).filter((h) => /^\d{1,2}:\d{2}$/.test(h)).map((h) => h.padStart(5, "0")).sort();
      if (!hours.length) return toast("Agrega al menos una hora válida (ej. 07:00)", "err");
      const data = {
        gymName: f.gymName.value.trim() || "Team Savage", slogan: f.slogan.value.trim(), quote: f.quote.value.trim(), logo: C.logo,
        whatsapp: cleanPhone(f.whatsapp.value), phone: f.phone.value.trim(),
        links: Object.fromEntries(["instagram", "tiktok", "youtube", "facebook"].map((k) => [k, f[`l_${k}`].value.trim()])),
        colors: { bg: f.c_bg.value, surface: f.c_surface.value, accent: f.c_accent.value, text: f.c_text.value },
        hours, closedDays: $$("input[name=cd]:checked", f).map((i) => Number(i.value)),
        classes: C.classes.filter((c) => c.name), plans: C.plans.filter((p) => p.name), autoBlockDefault: Number(f.autoBlockDefault.value) || 0, servicesVersion: 2,
        updatedAt: serverTimestamp(),
      };
      const btn = $(".save-bar .btn-metal", f); setBusy(btn, true, "Guardando…");
      try { await setDoc(doc(db, "config", "app"), data); setConfig(data); toast("Configuración guardada"); }
      catch (err) { console.error(err); toast(err.code === "invalid-argument" ? "El logo es muy pesado, usa una imagen más pequeña" : "No se pudo guardar", "err"); }
      setBusy(btn, false);
    };
  },
};

/* ---------- Pestañas del detalle de cliente ---------- */
const CTABS = {
  async datos(c, S, m) {
    const st = effectiveStatus(m);
    c.innerHTML = `<div class="grid-side">
      <form class="card form reveal" data-f><h3 class="h3">Ficha del cliente</h3>${memberForm(m)}
        <button type="submit" class="btn btn-metal w100 lg" data-submit>${icon("check")} Guardar ficha</button></form>
      <div class="stack">
        <div class="card reveal"><h3 class="h3">Estado de la cuenta</h3>
          <p class="muted small">${m.statusReason ? esc(m.statusReason) + " · " : ""}${m.lastVisit ? `Última visita ${timeAgo(m.lastVisit)}` : ""}</p>
          <div class="seg mt-s">${["activo", "inactivo", "bloqueado"].map((s) => `<button type="button" data-st="${s}" class="${st === s ? "on" : ""}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div>
          <button class="btn btn-ghost w100 mt" data-att>${icon("check")} Dar asistencia ahora</button></div>
        <div class="card reveal"><h3 class="h3">Acceso a la app</h3>
          <p class="muted small">${m.uid ? "El cliente ya creó su contraseña." : "Aún no crea su contraseña."}</p>
          <a class="btn btn-ghost w100" target="_blank" rel="noopener" href="${waLink(m.phone, welcomeMsg(m))}">${icon("whatsapp")} Reenviar ID por WhatsApp</a>
          <button class="btn btn-ghost w100 mt-s" data-reset>${icon("refresh")} Restablecer contraseña</button></div>
        <div class="card reveal"><h3 class="h3">Foto de perfil</h3><div class="row gap"><div class="avatar lg">${m.avatar ? `<img src="${m.avatar}" alt="">` : esc(m.name[0])}</div>
          <label class="btn btn-ghost">${icon("camera")} Subir<input type="file" accept="image/*" data-av hidden></label></div></div>
        <div class="card danger-zone reveal"><h3 class="h3">Zona de riesgo</h3><button class="btn btn-ghost danger w100" data-del>${icon("trash")} Eliminar cliente definitivamente</button></div>
      </div></div>`;
    const f = $("[data-f]", c); bindMemberForm(f);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = readMemberForm(f);
      if (d.name.length < 3 || d.phone.length < 10) return toast("Nombre y celular son obligatorios", "err");
      const btn = $("[data-submit]", f); setBusy(btn, true, "Guardando…");
      try { await updateDoc(doc(db, "members", m.id), d); toast("Ficha guardada"); }
      catch (err) { console.error(err); toast("No se pudo guardar", "err"); }
      setBusy(btn, false);
    };
    // El estado se lee al momento (la ficha no se redibuja en actualizaciones automáticas)
    const liveStatus = () => effectiveStatus(S.members.get(m.id) || m);
    const markSeg = (s) => $$("[data-st]", c).forEach((x) => x.classList.toggle("on", x.dataset.st === s));
    $$("[data-st]", c).forEach((b) => (b.onclick = async () => {
      const s = b.dataset.st;
      if (s === liveStatus()) return;
      if (!(await confirmDialog(s === "activo" ? `¿Reactivar a ${m.name}?` : `¿Marcar a ${m.name} como ${s}? No podrá entrar a la app.`, "Confirmar"))) return;
      await setStatus(m, s, s === "activo" ? "" : "Manual por el coach"); markSeg(s); toast("Estado actualizado");
    }));
    $("[data-att]", c).onclick = async () => {
      if (liveStatus() !== "activo") { await setStatus(m, "activo"); markSeg("activo"); }
      await registerAttendance(m); toast("Asistencia registrada");
    };
    $("[data-reset]", c).onclick = async () => {
      if (!(await confirmDialog(`¿Restablecer el acceso de ${m.name}? Deberá crear una nueva contraseña con su mismo ID.`, "Restablecer"))) return;
      await resetAccess(m);
      toast("Acceso restablecido");
      window.open(waLink(m.phone, `Hola ${m.name.split(" ")[0]}, restablecí tu acceso a la app de ${CONFIG.gymName}.\nTu ID sigue siendo *${m.id}*.\nCrea tu nueva contraseña aquí: ${appUrl()}#/team/crear`), "_blank");
    };
    $("[data-av]", c).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; await updateDoc(doc(db, "members", m.id), { avatar: await compressImage(file, 240, 0.8) }); toast("Foto actualizada"); };
    $("[data-del]", c).onclick = async () => {
      if (!(await confirmDialog(`¿Eliminar a ${m.name} (${m.id}) y todo su historial? Esta acción no se puede deshacer.`, "Eliminar"))) return;
      try { await deleteMember(m); toast("Cliente eliminado"); location.hash = "#/admin/clientes"; } catch (err) { console.error(err); toast("No se pudo eliminar", "err"); }
    };
  },

  async progreso(c, S, m) {
    const [prog, photosSnap] = await Promise.all([loadProgress(m.id), getDocs(collection(db, "members", m.id, "photos"))]);
    const photos = photosSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
    c.innerHTML = `
    ${summaryHTML(m, prog)}
    <div class="grid-side mt">
      <form class="card form reveal" data-f novalidate>
        <div class="row between"><h3 class="h3" data-ftitle>Nuevo registro</h3><button type="button" class="btn btn-text sm" data-cancel hidden>Cancelar edición</button></div>
        <label class="field"><span>Fecha</span><input class="inp" type="date" name="date" value="${ymd()}"></label>
        ${progressFormHTML()}
        <label class="field"><span>Notas / observaciones</span><textarea class="inp" name="note" rows="2" placeholder="Cambios en la dieta, molestias, logros…"></textarea></label>
        <input type="hidden" name="editId"><button type="submit" class="btn btn-metal w100 lg" data-submit>${icon("plus")} Guardar registro</button></form>
      <div class="stack">
        <div class="card reveal"><h3 class="h3">Evolución</h3>${chartBlockHTML()}</div>
        <div class="card reveal"><h3 class="h3">Inicial vs actual</h3>${comparisonHTML(m, prog)}</div>
        <div class="card reveal"><h3 class="h3">Ficha rápida</h3>${profileFactsHTML(m)}<a class="link small" href="#/admin/cliente/${m.id}/datos">Editar ficha</a></div>
      </div>
    </div>
    <div class="card mt reveal"><h3 class="h3">Historial completo</h3>${historyHTML(m, prog, { actions: true })}</div>
    <div class="card mt reveal"><div class="row between wrap gap"><h3 class="h3">Fotos de progreso</h3>
      <div class="row gap-s"><select class="inp" data-pl><option>Frente</option><option>Lateral</option><option>Espalda</option><option>Otra</option></select>
      <label class="btn btn-metal">${icon("camera")} Subir fotos<input type="file" accept="image/*" multiple data-up hidden></label></div></div>
      ${beforeAfterHTML(photos)}
      <div class="photos mt">${photos.map((p) => `<figure class="photo"><img src="${p.data}" alt="" loading="lazy"><figcaption>${fmtDate(p.date)} · ${esc(p.label || "")}</figcaption><button class="icon-btn sm danger ph-del" data-dph="${p.id}">${icon("trash")}</button></figure>`).join("") || `<p class="muted">Sin fotos</p>`}</div></div>`;
    bindChart(c, m, prog);
    const f = $("[data-f]", c);
    const reload = () => CTABS.progreso(c, S, S.members.get(m.id) || m).then(() => enhance(c));
    f.onsubmit = async (e) => {
      e.preventDefault();
      const data = { date: f.date.value || ymd(), note: f.note.value.trim(), ...readProgressForm(f) };
      if (!METRIC_FIELDS.some(([k]) => data[k] != null) && !data.note) return toast("Captura al menos un dato", "err");
      if (m.height) data.height = m.height;
      const btn = $("[data-submit]", f); setBusy(btn, true, "Guardando…");
      try {
        if (f.editId.value) await updateDoc(doc(db, "members", m.id, "progress", f.editId.value), data);
        else {
          await addDoc(collection(db, "members", m.id, "progress"), { ...data, by: "coach", at: serverTimestamp() });
          const imc = bmi(data.weight, m.height);
          notify(m.id, "Nuevo registro de progreso", `Tu coach actualizó tu progreso${data.weight ? ` · ${data.weight} kg` : ""}${imc ? ` · IMC ${imc}` : ""}`, "progreso");
        }
        toast("Progreso guardado"); reload();
      } catch (err) { console.error(err); setBusy(btn, false); toast("No se pudo guardar", "err"); }
    };
    $("[data-cancel]", c).onclick = () => reload();
    $$("[data-ed]", c).forEach((b) => (b.onclick = () => {
      const p = prog.find((x) => x.id === b.dataset.ed);
      f.date.value = p.date; f.note.value = p.note || ""; f.editId.value = p.id;
      METRIC_FIELDS.forEach(([k]) => f[k] && (f[k].value = p[k] ?? ""));
      $$("details.fgroup", f).forEach((d) => (d.open = true));
      $("[data-ftitle]", c).textContent = `Editando ${fmtDate(p.date)}`; $("[data-cancel]", c).hidden = false;
      f.scrollIntoView({ behavior: "smooth" });
    }));
    $$("[data-dp]", c).forEach((b) => (b.onclick = async () => { if (await confirmDialog("¿Eliminar este registro?", "Eliminar")) { await deleteDoc(doc(db, "members", m.id, "progress", b.dataset.dp)); reload(); } }));
    $$("[data-dph]", c).forEach((b) => (b.onclick = async () => { if (await confirmDialog("¿Eliminar esta foto?", "Eliminar")) { await deleteDoc(doc(db, "members", m.id, "photos", b.dataset.dph)); reload(); } }));
    $$(".photo img, .ba img", c).forEach((img) => (img.onclick = () => modal(`<img class="photo-full" src="${img.src}" alt="">`, { wide: true })));
    $("[data-up]", c).onchange = async (e) => {
      const files = [...e.target.files]; if (!files.length) return;
      toast(`Subiendo ${files.length} foto(s)…`, "info");
      try {
        for (const file of files) await addDoc(collection(db, "members", m.id, "photos"), { data: await compressImage(file, 900, 0.75), date: ymd(), label: $("[data-pl]", c).value, at: serverTimestamp() });
        notify(m.id, "Nuevas fotos de progreso", "Tu coach subió fotos de tu avance 📸", "progreso");
      } catch (err) { console.error(err); toast("No se pudo subir una foto", "err"); }
      reload();
    };
  },

  async rutina(c, S, m) {
    const d = (await getDoc(doc(db, "members", m.id, "plan", "routine"))).data() || { days: {}, notes: "" };
    const tpls = (await getDocs(query(collection(db, "templates"), where("kind", "==", "routine")))).docs.map((x) => ({ id: x.id, ...x.data() }));
    c.innerHTML = `<form class="card form reveal" data-f>
      <div class="row between wrap gap"><h3 class="h3">Rutina semanal</h3>${planToolbar(tpls)}</div>
      <p class="muted small">Un ejercicio por línea. Ej: <span class="mono">Sentadilla 4x12 — 60kg</span>. Deja vacío el día de descanso.</p>
      <div class="grid2">${DAYS_ORDER.map((k) => `<label class="field"><span>${DAY_LABEL[k]}</span><textarea class="inp" rows="6" name="${k}">${esc(d.days?.[k] || "")}</textarea></label>`).join("")}
        <label class="field"><span>Notas generales</span><textarea class="inp" rows="6" name="notes">${esc(d.notes || "")}</textarea></label></div>
      <button type="submit" class="btn btn-metal w100 lg" data-submit>${icon("check")} Guardar y notificar</button></form>`;
    const f = $("[data-f]", c);
    const read = () => ({ days: Object.fromEntries(DAYS_ORDER.map((k) => [k, f[k].value])), notes: f.notes.value });
    $("[data-tpl]", c)?.addEventListener("change", (e) => { const t = tpls.find((x) => x.id === e.target.value); if (!t) return; DAYS_ORDER.forEach((k) => (f[k].value = t.data.days?.[k] || "")); f.notes.value = t.data.notes || ""; });
    $("[data-save-tpl]", c).onclick = () => saveTemplate("routine", read());
    bindPlanToolbar(c, "routine", read, m, (text, dest, mode) => {
      const put = (name, val) => { f[name].value = mode === "append" && f[name].value.trim() ? `${f[name].value.trim()}\n${val}` : val; };
      if (dest === "auto") {
        const r = parseRoutine(text);
        if (!r.found) { put("notes", text); return "No se encontraron días (Lunes, Martes, Día 1…); el texto se puso en Notas."; }
        // Reemplazar = la rutina queda exactamente como el archivo (los días que no vienen quedan en descanso)
        if (mode === "replace") { DAYS_ORDER.forEach((k) => (f[k].value = "")); f.notes.value = ""; }
        Object.entries(r.days).forEach(([k, v]) => put(k, v));
        if (r.notes) put("notes", r.notes);
        return `Se repartió en ${Object.keys(r.days).length} día(s).`;
      }
      put(dest, text);
      return `Texto pegado en ${dest === "notes" ? "Notas" : DAY_LABEL[dest]}.`;
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      await setDoc(doc(db, "members", m.id, "plan", "routine"), { ...read(), updatedAt: serverTimestamp() });
      notify(m.id, "Rutina actualizada", "Tu coach actualizó tu rutina 🏋️", "rutina"); toast("Rutina guardada");
    };
  },

  async dieta(c, S, m) {
    const d = (await getDoc(doc(db, "members", m.id, "plan", "diet"))).data() || { meals: [{ name: "Desayuno", text: "" }, { name: "Colación", text: "" }, { name: "Comida", text: "" }, { name: "Colación", text: "" }, { name: "Cena", text: "" }] };
    const tpls = (await getDocs(query(collection(db, "templates"), where("kind", "==", "diet")))).docs.map((x) => ({ id: x.id, ...x.data() }));
    let meals = (d.meals || []).slice();
    const w = (await loadProgress(m.id)).filter((p) => p.weight).at(-1)?.weight || m.initWeight;
    const T = tdee(m, w);
    c.innerHTML = `<form class="card form reveal" data-f>
      <div class="row between wrap gap"><h3 class="h3">Plan de alimentación</h3>${planToolbar(tpls)}</div>
      ${T ? `<p class="muted small">Referencia: TMB ${bmr(m, w)} kcal · GET ${T} kcal (${esc(m.goal || "sin objetivo")}). Déficit sugerido −15–20 % · superávit +10 %.</p>` : ""}
      <div class="grid2"><label class="field"><span>Calorías diarias</span><input class="inp" name="calories" value="${esc(d.calories || "")}" placeholder="${T ? T + " kcal" : "2,100 kcal"}"></label>
        <label class="field"><span>Macros</span><input class="inp" name="macros" value="${esc(d.macros || "")}" placeholder="P 160g · C 200g · G 60g"></label></div>
      <div data-meals></div><button type="button" class="btn btn-ghost sm" data-add>${icon("plus")} Agregar comida</button>
      <label class="field mt"><span>Indicaciones</span><textarea class="inp" rows="3" name="notes">${esc(d.notes || "")}</textarea></label>
      <button type="submit" class="btn btn-metal w100 lg" data-submit>${icon("check")} Guardar y notificar</button></form>`;
    const f = $("[data-f]", c);
    const sync = () => { meals = meals.map((x, i) => ({ name: $(`[data-mn="${i}"]`, c)?.value ?? x.name, text: $(`[data-mt="${i}"]`, c)?.value ?? x.text })); };
    const draw = () => {
      $("[data-meals]", c).innerHTML = meals.map((x, i) => `<div class="meal-edit"><div class="row gap-s"><input class="inp grow" data-mn="${i}" value="${esc(x.name)}"><button type="button" class="icon-btn sm danger" data-rm="${i}">${icon("trash")}</button></div>
        <textarea class="inp" rows="4" data-mt="${i}" placeholder="Alimentos y porciones">${esc(x.text)}</textarea></div>`).join("");
      $$("[data-rm]", c).forEach((b) => (b.onclick = () => { sync(); meals.splice(+b.dataset.rm, 1); draw(); }));
    };
    draw();
    const read = () => { sync(); return { meals: meals.filter((x) => x.name.trim()), calories: f.calories.value, macros: f.macros.value, notes: f.notes.value }; };
    $("[data-add]", c).onclick = () => { sync(); meals.push({ name: "Comida", text: "" }); draw(); };
    $("[data-tpl]", c)?.addEventListener("change", (e) => { const t = tpls.find((x) => x.id === e.target.value); if (!t) return; meals = t.data.meals.slice(); f.calories.value = t.data.calories || ""; f.macros.value = t.data.macros || ""; f.notes.value = t.data.notes || ""; draw(); });
    $("[data-save-tpl]", c).onclick = () => saveTemplate("diet", read());
    bindPlanToolbar(c, "diet", read, m, (text, dest, mode) => {
      sync();
      const putNotes = (v) => { f.notes.value = mode === "append" && f.notes.value.trim() ? `${f.notes.value.trim()}\n${v}` : v; };
      if (dest === "auto") {
        const r = parseDiet(text);
        if (!r.found) { putNotes(text); return "No se encontraron comidas (Desayuno, Comida, Cena…); el texto se puso en Indicaciones."; }
        meals = mode === "append" ? [...meals.filter((x) => x.text.trim()), ...r.meals] : r.meals;
        if (mode === "replace") f.notes.value = "";
        if (r.calories) f.calories.value = r.calories;
        if (r.macros) f.macros.value = r.macros;
        if (r.notes) putNotes(r.notes);
        draw();
        return `Se separó en ${r.meals.length} comida(s).`;
      }
      if (dest === "notes") { putNotes(text); return "Texto pegado en Indicaciones."; }
      meals.push({ name: "Plan importado", text }); draw();
      return "Se agregó como una comida nueva.";
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      await setDoc(doc(db, "members", m.id, "plan", "diet"), { ...read(), updatedAt: serverTimestamp() });
      notify(m.id, "Dieta actualizada", "Tu coach actualizó tu plan de alimentación 🥗", "dieta"); toast("Dieta guardada");
    };
  },

  async pagos(c, S, m) {
    const pays = (await getDocs(query(collection(db, "payments"), where("memberId", "==", m.id)))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
    const paid = toDate(m.paidUntil);
    c.innerHTML = `<div class="row between wrap gap"><div class="pill-total">${m.plan ? esc(m.plan) : "Sin plan"} · ${paid ? `vigente hasta <b class="${paid < new Date() ? "txt-err" : ""}">${fmtDate(paid)}</b>` : "sin vigencia"}</div>
      <button class="btn btn-metal" data-add>${icon("plus")} Registrar pago</button></div>
      <div class="card table-wrap mt reveal"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th class="r">Monto</th></tr></thead>
      <tbody>${pays.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.concept)}</td><td>${esc(p.method)}</td><td class="r"><b>${money(p.amount)}</b></td></tr>`).join("") || `<tr><td colspan="4" class="center muted pad">Sin pagos</td></tr>`}</tbody></table></div>`;
    $("[data-add]", c).onclick = () => paymentDialog(S, m, () => CTABS.pagos(c, S, S.members.get(m.id) || m).then(() => enhance(c)));
  },

  async asistencias(c, S, m) {
    const list = (await getDocs(collection(db, "members", m.id, "attendance"))).docs.map((d) => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const byMonth = {};
    list.forEach((a) => { const k = (a.date || "").slice(0, 7); byMonth[k] = (byMonth[k] || 0) + 1; });
    const months = Object.keys(byMonth).sort().slice(-6);
    c.innerHTML = `<div class="grid2"><div class="card reveal"><h3 class="h3">Asistencias por mes</h3>${barChart(months.map((k) => ({ label: `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`, short: MONTHS[+k.slice(5) - 1].slice(0, 3), v: byMonth[k] })), { height: 140 })}</div>
      <div class="card reveal"><h3 class="h3">Historial (${list.length})</h3><div class="list scroll-y">${list.slice(0, 100).map((a) => `<div class="li"><span class="grow">${fmtDate(a.date)}</span><small class="muted">${esc(a.note || "")}</small></div>`).join("") || `<p class="muted">Sin asistencias</p>`}</div></div></div>`;
  },
};

/* ---------- Importar / exportar rutina y dieta ---------- */
function planToolbar(tpls) {
  return `<div class="row gap-s wrap plan-tools">
    ${tpls.length ? `<select class="inp sm-inp" data-tpl><option value="">Cargar plantilla…</option>${tpls.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select>` : ""}
    <button type="button" class="btn btn-ghost sm" data-save-tpl>Guardar plantilla</button>
    <button type="button" class="btn btn-ghost sm" data-import>${icon("download", "rot180")} Importar archivo</button>
    <div class="menu-wrap"><button type="button" class="btn btn-metal sm" data-export>${icon("download")} Exportar</button>
      <div class="menu" data-menu hidden>
        <button type="button" data-fmt="pdf">PDF</button><button type="button" data-fmt="xlsx">Excel (.xlsx)</button>
        <button type="button" data-fmt="csv">CSV</button><button type="button" data-fmt="txt">Texto (.txt)</button>
        <button type="button" data-fmt="copy">Copiar texto</button><button type="button" data-fmt="whatsapp">Enviar por WhatsApp</button>
      </div></div>
  </div>`;
}

function bindPlanToolbar(c, kind, read, m, apply) {
  const menu = $("[data-menu]", c);
  $("[data-export]", c).onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  const close = (e) => {
    if (!menu.isConnected) return document.removeEventListener("click", close);
    if (!e.target.closest(".menu-wrap")) menu.hidden = true;
  };
  document.addEventListener("click", close);
  $$("[data-fmt]", c).forEach((b) => (b.onclick = async () => {
    menu.hidden = true;
    const fmt = b.dataset.fmt;
    toast(fmt === "copy" ? "Copiando…" : "Generando archivo…", "info");
    const r = await exportPlan(fmt, kind, read(), m);
    if (fmt === "whatsapp" && r) window.open(waLink(m.phone, r), "_blank");
  }));
  $("[data-import]", c).onclick = () => importDialog(kind, apply);
}

function importDialog(kind, apply) {
  const isR = kind === "routine";
  const d = modal(`<h3 class="h3">Importar ${isR ? "rutina" : "dieta"}</h3>
    <p class="muted small">Sube un PDF, Excel, CSV, Word (.docx), texto o una foto. Se convierte a texto, lo revisas y se acomoda en ${isR ? "la rutina" : "la dieta"}.</p>
    <label class="dropzone" data-drop><input type="file" accept="${IMPORT_ACCEPT}" data-file hidden>
      ${icon("download", "rot180")}<b>Elegir o arrastrar archivo</b><small>PDF · XLSX · CSV · DOCX · TXT · imagen</small></label>
    <p class="small muted" data-status></p>
    <label class="field"><span>Texto (puedes editarlo o pegarlo aquí)</span><textarea class="inp mono-sm" rows="10" data-text placeholder="${isR ? "Lunes\nSentadilla 4x12\nPrensa 3x15\n\nMartes\n…" : "Desayuno\n2 huevos + 1 tortilla\n\nComida\n150 g pollo + arroz…"}"></textarea></label>
    <div class="grid2">
      <label class="field"><span>¿Dónde colocarlo?</span><select class="inp" data-dest>
        <option value="auto">${isR ? "Repartir automáticamente por días" : "Separar automáticamente por comidas"}</option>
        ${isR ? DAYS_ORDER.map((k) => `<option value="${k}">Solo en ${DAY_LABEL[k]}</option>`).join("") : `<option value="meal">Como una comida nueva</option>`}
        <option value="notes">En ${isR ? "Notas generales" : "Indicaciones"}</option></select></label>
      <label class="field"><span>Modo</span><select class="inp" data-mode><option value="replace">Reemplazar lo que haya</option><option value="append">Agregar al final</option></select></label>
    </div>
    <button type="button" class="btn btn-metal w100 lg mt" data-apply>${icon("check")} Colocar en ${isR ? "la rutina" : "la dieta"}</button>
    <p class="muted small center mt-s">Después revisa y presiona «Guardar y notificar».</p>`, { wide: true });
  const st = $("[data-status]", d.el), ta = $("[data-text]", d.el), drop = $("[data-drop]", d.el);
  const handle = async (file) => {
    if (!file) return;
    st.innerHTML = `<span class="spinner"></span> Leyendo ${esc(file.name)}…`;
    try {
      const text = await fileToText(file, (msg) => (st.innerHTML = `<span class="spinner"></span> ${esc(msg)}`));
      ta.value = text.replace(/\n{3,}/g, "\n\n").trim();
      st.textContent = `✓ ${file.name} convertido (${ta.value.split("\n").filter(Boolean).length} renglones). Revisa el texto.`;
    } catch (err) { console.error(err); st.textContent = "✕ " + (err.message || "No se pudo leer el archivo"); }
  };
  $("[data-file]", d.el).onchange = (e) => handle(e.target.files[0]);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
  $("[data-apply]", d.el).onclick = () => {
    const text = ta.value.trim();
    if (!text) return toast("No hay texto para colocar", "err");
    const msg = apply(text, $("[data-dest]", d.el).value, $("[data-mode]", d.el).value);
    toast(msg || "Listo"); d.close();
  };
}

function pickClient(el, S, tab, text) {
  const all = [...S.members.values()].filter((m) => effectiveStatus(m) === "activo").sort((a, b) => a.name.localeCompare(b.name));
  el.innerHTML = `<p class="muted">${text}</p>
    <div class="input mt-s" style="max-width:420px">${icon("search")}<input data-q placeholder="Buscar cliente…"></div>
    <div class="pick-grid mt" data-g></div>`;
  const draw = (q = "") => {
    $("[data-g]", el).innerHTML = all.filter((m) => !q || `${m.name} ${m.id}`.toLowerCase().includes(q.toLowerCase())).map((m) =>
      `<a class="pick card reveal in" data-tilt="8" href="#/admin/cliente/${m.id}/${tab}"><div class="avatar">${m.avatar ? `<img src="${m.avatar}" alt="">` : esc(m.name[0])}</div><div><b>${esc(m.name)}</b><small class="mono muted">${m.id}</small></div></a>`).join("") || `<p class="muted">Sin clientes activos</p>`;
    enhance(el);
  };
  $("[data-q]", el).oninput = (e) => draw(e.target.value);
  draw();
}

async function saveTemplate(kind, data) {
  const d = modal(`<h3 class="h3">Guardar plantilla</h3><form class="form"><label class="field"><span>Nombre</span><input class="inp" name="n" placeholder="${kind === "diet" ? "Déficit 1800 kcal" : "Hipertrofia 5 días"}" required></label><button class="btn btn-metal w100">Guardar</button></form>`);
  $("form", d.el).onsubmit = async (e) => { e.preventDefault(); await addDoc(collection(db, "templates"), { kind, name: e.target.n.value.trim(), data, at: serverTimestamp() }); toast("Plantilla guardada"); d.close(); };
}

function paymentDialog(S, member, onSaved) {
  const members = [...S.members.values()].sort((a, b) => a.name.localeCompare(b.name));
  const d = modal(`<h3 class="h3">Registrar pago</h3>
    <form class="form" novalidate>
      <label class="field"><span>Cliente</span>${member ? `<input class="inp" value="${esc(member.name)} (${member.id})" readonly>` : `<input class="inp" list="ml" name="who" placeholder="Nombre o ID (vacío = venta general)"><datalist id="ml">${members.map((m) => `<option value="${esc(m.id)} — ${esc(m.name)}">`).join("")}</datalist>`}</label>
      <label class="field"><span>Concepto</span><select class="inp" name="concept">${CONFIG.plans.map((p) => `<option data-price="${p.price}" data-days="${p.days || 0}">${esc(p.name)}</option>`).join("")}<option data-price="" data-days="0">Otro</option></select></label>
      <div class="grid2"><label class="field"><span>Monto</span><input class="inp" type="number" min="0" step="0.01" name="amount" value="${CONFIG.plans[0]?.price || ""}"></label>
      <label class="field"><span>Método</span><select class="inp" name="method"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label></div>
      <div class="grid2"><label class="field"><span>Fecha</span><input class="inp" type="date" name="date" value="${ymd()}"></label>
      <label class="field"><span>Nota</span><input class="inp" name="note"></label></div>
      <label class="check"><input type="checkbox" name="extend" checked><span></span>Extender vigencia del cliente según el plan</label>
      <button class="btn btn-metal w100 lg mt">${icon("check")} Guardar pago</button></form>`);
  const f = $("form", d.el);
  f.concept.onchange = () => { const o = f.concept.selectedOptions[0]; if (o.dataset.price) f.amount.value = o.dataset.price; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    let m = member;
    if (!m && f.who.value.trim()) { const id = f.who.value.split("—")[0].trim().toUpperCase(); m = S.members.get(id) || members.find((x) => x.name.toLowerCase() === f.who.value.trim().toLowerCase()); }
    const amount = Number(f.amount.value);
    if (!(amount > 0)) return toast("Monto inválido", "err");
    const opt = f.concept.selectedOptions[0];
    const btn = $("button", f); setBusy(btn, true);
    try {
      await addDoc(collection(db, "payments"), { memberId: m?.id || null, name: m?.name || (f.who?.value.trim() || "Venta general"), concept: f.concept.value, amount, method: f.method.value, date: f.date.value || ymd(), note: f.note.value.trim(), createdAt: serverTimestamp() });
      const days = Number(opt.dataset.days || 0);
      if (m && f.extend.checked && days > 0) {
        const cur = toDate(m.paidUntil);
        const base = cur && cur > new Date() ? cur : new Date();
        const until = new Date(base.getTime() + days * 864e5);
        await updateDoc(doc(db, "members", m.id), { paidUntil: Timestamp.fromDate(until), plan: f.concept.value });
        notify(m.id, "Pago registrado", `Gracias por tu pago de ${money(amount)}. Tu ${f.concept.value} está vigente hasta ${fmtDate(until)}.`, "pago");
      }
      toast("Pago registrado"); d.close(); onSaved?.();
    } catch (err) { console.error(err); setBusy(btn, false); toast("No se pudo guardar", "err"); }
  };
}

/* ---------- helpers de UI admin ---------- */
function kpi(label, value, ic, href = "", delta = null) {
  const tag = href ? "a" : "div";
  return `<${tag} class="kpi reveal" data-tilt="8" ${href ? `href="${href}"` : ""}><div class="kpi-ic">${icon(ic)}</div><small>${esc(label)}</small><b>${esc(value)}</b>
    ${delta !== null ? `<span class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)}% vs mes anterior</span>` : ""}</${tag}>`;
}
function hbars(items) {
  if (!items.length || !items.some((i) => i.v)) return `<p class="muted">Sin datos</p>`;
  const max = Math.max(...items.map((i) => i.v), 1);
  return `<div class="hbars">${items.map((i, k) => `<div class="hbar"><span>${esc(i.label)}</span><div><i style="--w:${(i.v / max) * 100}%;--d:${k * 60}ms"></i></div><b>${esc(i.fmt ?? i.v)}</b></div>`).join("")}</div>`;
}
function csv(name, head, rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click();
}
