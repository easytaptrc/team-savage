// 2. RESERVA — formulario, calendario, hora y objetivo → pase (wallet)
import { db, doc, getDocs, collection, query, where, runTransaction, serverTimestamp } from "../firebase.js";
import { ageOf } from "../metrics.js";

// Un documento por fecha + servicio + hora: { date, key, n } (n = lugares ocupados)
export const slotKey = (cls, time) => `${cls}__${time}`;
export const slotId = (date, cls, time) => `${date}__${encodeURIComponent(cls)}__${time.replace(":", "")}`;
import {
  CONFIG, $, $$, esc, icon, toast, setBusy, ymd, parseYmd, pad, MONTHS, fmtTime, cleanPhone,
  notify, passHTML, enhance, downloadPass, icsFor, fmtDate,
} from "../ui.js";

export async function render(root) {
  root.innerHTML = `
  <section class="page narrow">
    <header class="page-head reveal">
      <a href="#/" class="icon-btn" aria-label="Volver">${icon("back")}</a>
      <img data-logo src="${esc(CONFIG.logo)}" class="head-logo" alt="">
      <span></span>
    </header>
    <h1 class="title reveal">Reserva tu sesión</h1>
    <p class="subtitle reveal">Agenda tu asesoría o entrenamiento</p>
    <div id="reserva-slot"></div>
  </section>`;
  mountReservaForm($("#reserva-slot", root));
}

const DOW = ["L", "M", "M", "J", "V", "S", "D"];

export function mountReservaForm(host, { member = null, onDone } = {}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + 60 * 864e5);
  const state = { month: new Date(today.getFullYear(), today.getMonth(), 1), date: null, time: null, cls: CONFIG.classes[0]?.name || "", slots: {} };

  host.innerHTML = `
  <form class="card card-3d form reveal" novalidate>
    <label class="field"><span>Nombre completo *</span>
      <div class="input">${icon("user")}<input name="name" autocomplete="name" placeholder="Tu nombre" required ${member ? "readonly" : ""} value="${esc(member?.name || "")}"></div></label>
    ${member ? "" : `<div class="grid-age">
      <label class="field"><span>Fecha de nacimiento *</span>
        <div class="input">${icon("calendar")}<input name="birth" type="date" required max="${ymd()}"></div></label>
      <label class="field"><span>Edad</span>
        <div class="input"><input name="age" readonly tabindex="-1" placeholder="—"></div></label>
    </div>
    <label class="field"><span>Correo electrónico *</span>
      <div class="input">${icon("send")}<input name="email" type="email" inputmode="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" required></div></label>`}
    <label class="field"><span>Número de celular *</span>
      <div class="input">${icon("phone")}<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="871 123 4567" required ${member ? "readonly" : ""} value="${esc(member?.phone || "")}"></div></label>
    ${member ? "" : `<label class="field"><span>Teléfono de emergencia *</span>
      <div class="input">${icon("phone")}<input name="emergencyPhone" type="tel" inputmode="tel" placeholder="Familiar o contacto cercano" required></div></label>
    <label class="field"><span>Recomendado por <em>(opcional)</em></span>
      <div class="input">${icon("users")}<input name="ref" placeholder="Nombre"></div></label>`}
    <label class="field"><span>Selecciona el servicio</span>
      <div class="input select">${icon("dumbbell")}<select name="cls">${CONFIG.classes.map((c) => `<option>${esc(c.name)}</option>`).join("")}</select></div></label>
    <div class="field"><span>Selecciona la fecha</span><div class="calendar" data-cal></div></div>
    <div class="field"><span>Selecciona la hora</span><div class="hours" data-hours><p class="muted small">Primero elige una fecha</p></div></div>
    <label class="field"><span>Tu objetivo <em>(opcional)</em></span>
      <textarea name="goal" rows="3" placeholder="Ej. Bajar de peso, mejorar condición, etc.">${esc(member?.goal || "")}</textarea></label>
    <button class="btn btn-metal w100 lg" type="submit">Confirmar reserva ${icon("chevron")}</button>
  </form>`;

  const form = $("form", host);
  const cal = $("[data-cal]", host);
  const hoursEl = $("[data-hours]", host);

  const closed = (d) => (CONFIG.closedDays || []).includes(d.getDay());

  function drawCal() {
    const m = state.month;
    const first = (m.getDay() + 6) % 7; // lunes = 0
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const canPrev = m > new Date(today.getFullYear(), today.getMonth(), 1);
    const canNext = new Date(m.getFullYear(), m.getMonth() + 1, 1) <= maxDate;
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(m.getFullYear(), m.getMonth(), d);
      const key = ymd(dt);
      const off = dt < today || dt > maxDate || closed(dt);
      cells += `<button type="button" class="day ${key === state.date ? "sel" : ""} ${key === ymd(today) ? "today" : ""}" data-d="${key}" ${off ? "disabled" : ""}>${d}</button>`;
    }
    cal.innerHTML = `<div class="cal-head"><b>${MONTHS[m.getMonth()]} ${m.getFullYear()}</b>
      <div><button type="button" class="icon-btn sm" data-p ${canPrev ? "" : "disabled"}>${icon("back")}</button>
      <button type="button" class="icon-btn sm" data-n ${canNext ? "" : "disabled"}>${icon("chevron")}</button></div></div>
      <div class="cal-grid dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="cal-grid days">${cells}</div>`;
    $("[data-p]", cal).onclick = () => { state.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); drawCal(); };
    $("[data-n]", cal).onclick = () => { state.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); drawCal(); };
    $$(".day[data-d]", cal).forEach((b) => (b.onclick = () => { state.date = b.dataset.d; state.time = null; drawCal(); loadSlots(); }));
  }

  async function loadSlots() {
    hoursEl.innerHTML = `<span class="spinner"></span>`;
    try {
      const snap = await getDocs(query(collection(db, "slots"), where("date", "==", state.date)));
      state.slots = Object.fromEntries(snap.docs.map((d) => [d.data().key, d.data().n || 0]));
    }
    catch { state.slots = {}; }
    drawHours();
  }

  function drawHours() {
    if (!state.date) return;
    const cap = CONFIG.classes.find((c) => c.name === state.cls)?.capacity || 99;
    const now = new Date();
    const isToday = state.date === ymd(now);
    hoursEl.innerHTML = CONFIG.hours.map((h) => {
      const used = state.slots[`${state.cls}__${h}`] || 0;
      const [hh, mm] = h.split(":").map(Number);
      const past = isToday && (hh * 60 + mm) <= now.getHours() * 60 + now.getMinutes() + 30;
      const full = used >= cap;
      const left = cap - used;
      return `<button type="button" class="hour ${state.time === h ? "sel" : ""}" data-h="${h}" ${past || full ? "disabled" : ""}>
        ${fmtTime(h)}<small>${full ? "Lleno" : past ? "—" : cap < 99 ? `${left} lugar${left === 1 ? "" : "es"}` : ""}</small></button>`;
    }).join("");
    $$(".hour", hoursEl).forEach((b) => (b.onclick = () => { state.time = b.dataset.h; drawHours(); }));
  }

  form.cls.onchange = () => { state.cls = form.cls.value; state.time = null; drawHours(); };
  // La edad se calcula sola con la fecha de nacimiento
  form.birth?.addEventListener("input", () => { const a = ageOf({ birth: form.birth.value }); form.age.value = a != null ? `${a} años` : ""; });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim().replace(/\s+/g, " ");
    const phone = cleanPhone(form.phone.value);
    if (name.length < 3) return toast("Escribe tu nombre completo", "err");
    if (phone.length < 10) return toast("Escribe un celular válido (10 dígitos)", "err");
    const extra = {};
    if (!member) {
      const age = ageOf({ birth: form.birth.value });
      const email = form.email.value.trim().toLowerCase();
      const emergencyPhone = cleanPhone(form.emergencyPhone.value);
      if (!form.birth.value || age == null || age < 5) return toast("Escribe tu fecha de nacimiento", "err");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Escribe un correo válido", "err");
      if (emergencyPhone.length < 10) return toast("Escribe un teléfono de emergencia válido (10 dígitos)", "err");
      if (emergencyPhone === phone) return toast("El teléfono de emergencia debe ser de otra persona", "err");
      Object.assign(extra, { birth: form.birth.value, age, email, emergencyPhone });
    }
    if (!state.date) return toast("Selecciona una fecha", "err");
    if (!state.time) return toast("Selecciona una hora", "err");

    const btn = $("button[type=submit]", form);
    setBusy(btn, true, "Reservando…");
    const code = "TS-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    const cap = CONFIG.classes.find((c) => c.name === state.cls)?.capacity || 99;
    const key = `${state.cls}__${state.time}`;
    const r = {
      code, type: member ? "team" : "nueva", memberId: member?.id || null,
      name, phone, referredBy: form.ref?.value.trim() || "", className: state.cls,
      date: state.date, time: state.time, goal: form.goal.value.trim(), status: member ? "confirmada" : "pendiente", ...extra,
    };
    try {
      await runTransaction(db, async (tx) => {
        const sRef = doc(db, "slots", slotId(state.date, state.cls, state.time));
        const s = await tx.get(sRef);
        const used = (s.exists() && s.data().n) || 0;
        if (used >= cap) throw new Error("full");
        tx.set(sRef, s.exists() ? { date: state.date, key, n: used + 1 } : { date: state.date, key, n: 1 });
        tx.set(doc(db, "reservations", code), { ...r, createdAt: serverTimestamp() });
      });
      notify("admin", member ? "Reserva Team" : "Nueva reserva", `${name} · ${state.cls} · ${fmtDate(state.date)} ${fmtTime(state.time)}`, "reserva");
      if (!member) {
        try {
          const list = JSON.parse(localStorage.getItem("ts_passes") || "[]");
          list.unshift(r); localStorage.setItem("ts_passes", JSON.stringify(list.slice(0, 20)));
        } catch {}
      }
      showPass(host, r, onDone);
    } catch (err) {
      console.error(err);
      setBusy(btn, false);
      if (err.message === "full") { toast("Ese horario se acaba de llenar, elige otro", "err"); loadSlots(); }
      else toast("No se pudo reservar. Revisa tu conexión.", "err");
    }
  };

  drawCal();
  enhance(host);
}

export function showPass(host, r, onDone) {
  host.innerHTML = `
  <div class="confirm reveal">
    <div class="check-burst">${icon("check")}</div>
    <h2 class="title sm">¡Reserva ${r.status === "confirmada" ? "confirmada" : "recibida"}!</h2>
    <p class="subtitle">${r.status === "confirmada" ? "Aquí está tu pase de acceso" : "Tu coach la confirmará pronto. Guarda tu pase."}</p>
    ${passHTML(r)}
    <div class="stack mt">
      <button class="btn btn-metal w100 lg" data-save>${icon("wallet")} Guardar en wallet</button>
      <div class="btn-row">
        <button class="btn btn-ghost w100" data-ics>${icon("calendar")} Agregar al calendario</button>
        ${CONFIG.whatsapp ? `<a class="btn btn-ghost w100" target="_blank" rel="noopener" href="https://wa.me/${CONFIG.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, hice una reserva: ${r.className} el ${fmtDate(r.date)} a las ${fmtTime(r.time)}. Código ${r.code}`)}">${icon("whatsapp")} Avisar al coach</a>` : ""}
      </div>
      <button class="btn btn-text" data-back>${onDone ? "Volver al panel" : "Volver al inicio"}</button>
    </div>
  </div>`;
  enhance(host);
  $("[data-save]", host).onclick = () => downloadPass($(".pass", host), `pase-${r.code}`);
  $("[data-ics]", host).onclick = () => icsFor(r);
  $("[data-back]", host).onclick = () => (onDone ? onDone() : (location.hash = "#/"));
}
