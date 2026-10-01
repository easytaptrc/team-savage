// 3b. PANEL DEL CLIENTE (Team)
import {
  auth, db, doc, getDoc, getDocs, updateDoc, setDoc, addDoc, collection, query, where, orderBy, onSnapshot,
  serverTimestamp, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential, runTransaction, increment,
  memberIdFromEmail, registerPush,
} from "../firebase.js";
import {
  CONFIG, $, $$, esc, icon, toast, setBusy, effectiveStatus, listenNotifications, notifPanel, notify, lineChart,
  fmtDate, fmtTime, fmtDateTime, timeAgo, passHTML, enhance, downloadPass, confirmDialog, modal, ymd, parseYmd, toDate, money, daysSince,
  cleanPhone, compressImage,
} from "../ui.js";
import { mountReservaForm, slotId } from "./reserva.js";
import {
  summaryHTML, chartBlockHTML, bindChart, comparisonHTML, historyHTML, beforeAfterHTML, profileFactsHTML, progressFormHTML, readProgressForm,
  bmi, bmiCategory, METRIC_FIELDS,
} from "../metrics.js";
import { exportPlan, DAYS_ORDER, DAY_LABEL } from "../docs.js";

const TABS = [
  ["inicio", "home", "Inicio"], ["reservar", "calendar", "Reservar"], ["progreso", "chart", "Progreso"],
  ["chat", "chat", "Coach"], ["perfil", "user", "Perfil"],
];

export async function render(root, r) {
  const id = memberIdFromEmail(auth.currentUser.email);
  const S = { id, member: null, notifs: [], unsubs: [], section: r.section, chatUnsub: null };

  root.innerHTML = `
  <div class="client">
    <header class="client-top">
      <div class="hello"><div class="avatar" data-avatar>·</div><div><b data-name>Hola</b><small>Miembro ${esc(CONFIG.gymName)} · <span class="mono">${esc(id)}</span></small></div></div>
      <div class="row gap-s"><button class="icon-btn" data-bell aria-label="Notificaciones">${icon("bell")}<i class="badge" hidden></i></button>
      <a class="icon-btn" href="#/app/perfil" aria-label="Perfil">${icon("user")}</a></div>
    </header>
    <div class="client-body" data-body><div class="center pad"><span class="spinner"></span></div></div>
    <nav class="tabbar">${TABS.map(([k, ic, l]) => `<a href="#/app/${k}" data-tab="${k}">${icon(ic)}<span>${l}</span></a>`).join("")}</nav>
  </div>`;

  $("[data-bell]", root).onclick = () => notifPanel(S.notifs);

  // Socio en tiempo real: si el coach lo bloquea, se cierra sesión
  S.unsubs.push(onSnapshot(doc(db, "members", id), async (snap) => {
    if (!snap.exists() || effectiveStatus(snap.data()) !== "activo" || snap.data().uid !== auth.currentUser?.uid) {
      toast("Tu acceso no está activo. Contacta a tu coach.", "err");
      await signOut(auth); location.hash = "#/team"; return;
    }
    const first = !S.member;
    S.member = { id, ...snap.data() };
    $("[data-name]", root).textContent = `Hola, ${S.member.name.split(" ")[0]}`;
    $("[data-avatar]", root).innerHTML = S.member.avatar ? `<img src="${S.member.avatar}" alt="">` : esc(S.member.name[0] || "·");
    if (first) { updateDoc(doc(db, "members", id), { lastSeen: serverTimestamp() }).catch(() => {}); show(S.section); }
  }, async (e) => {
    // Sin permiso = el coach eliminó al socio o restableció su acceso
    console.warn(e);
    if (e.code === "permission-denied") { toast("Tu acceso cambió. Vuelve a iniciar sesión o contacta a tu coach.", "err"); await signOut(auth); location.hash = "#/team"; }
  }));

  S.unsubs.push(listenNotifications(id, (list) => {
    S.notifs = list;
    const n = list.filter((x) => !x.read).length;
    const b = $(".badge", root); b.hidden = !n; b.textContent = n > 9 ? "9+" : n;
  }));
  if ("Notification" in window && Notification.permission === "granted") registerPush(`member:${id}`);

  async function show(section) {
    S.section = section;
    S.chatUnsub?.(); S.chatUnsub = null;
    $$("[data-tab]", root).forEach((a) => a.classList.toggle("on", a.dataset.tab === section));
    const body = $("[data-body]", root);
    body.classList.remove("view-in"); void body.offsetWidth; body.classList.add("view-in");
    if (!S.member) return;
    const fn = SECTIONS[section] || SECTIONS.inicio;
    await fn(body, S);
    enhance(body);
  }

  return {
    update: (nr) => show(nr.section),
    destroy: () => { S.unsubs.forEach((u) => u?.()); S.chatUnsub?.(); },
  };
}

const back = (title) => `<div class="sub-head reveal"><a href="#/app" class="icon-btn" aria-label="Volver">${icon("back")}</a><h2>${esc(title)}</h2><span></span></div>`;

const SECTIONS = {
  async inicio(el, S) {
    const tiles = [
      ["reservar", "calendar", "Reservar"], ["progreso", "chart", "Mi progreso"], ["dieta", "apple", "Mi dieta"],
      ["rutina", "dumbbell", "Mi rutina"], ["chat", "chat", "Chat con coach"], ["reservas", "list", "Mis reservas"],
    ];
    const m = S.member;
    const paid = toDate(m.paidUntil);
    const due = paid ? Math.ceil((paid - Date.now()) / 864e5) : null;
    el.innerHTML = `
      ${due !== null && due <= 5 ? `<div class="alert ${due < 0 ? "alert-err" : "alert-warn"} reveal">${icon("money")}
        ${due < 0 ? `Tu ${esc(m.plan || "membresía")} venció el ${fmtDate(paid)}.` : `Tu ${esc(m.plan || "membresía")} vence en ${due} día${due === 1 ? "" : "s"} (${fmtDate(paid)}).`}</div>` : ""}
      <div class="tiles">${tiles.map(([k, ic, l]) => `<a href="#/app/${k}" class="tile reveal" data-tilt="12"><span class="tile-ic">${icon(ic)}</span><b>${l}</b><span class="tile-glow"></span></a>`).join("")}</div>
      <div class="card reveal" data-prog><div class="row between"><h3 class="h3">Mi progreso</h3><a href="#/app/progreso" class="link small">Ver historial</a></div><div class="center pad"><span class="spinner"></span></div></div>
      <div class="stats3 reveal">
        <div class="stat"><small>Visitas</small><b>${m.visits || 0}</b></div>
        <div class="stat"><small>Última visita</small><b>${m.lastVisit ? timeAgo(m.lastVisit) : "—"}</b></div>
        <div class="stat"><small>Plan</small><b>${esc(m.plan || "—")}</b></div>
      </div>
      <div class="banner reveal" data-tilt="6"><div><b>Disciplina hoy</b><b>Resultados siempre</b></div>${icon("flame", "banner-ic")}</div>`;
    const prog = await loadProgress(S.id);
    const ws = prog.filter((p) => p.weight);
    const last = ws.at(-1), first = ws[0];
    const imc = bmi(last?.weight, m.height), cat = bmiCategory(imc);
    $("[data-prog]", el).innerHTML = `<div class="row between"><h3 class="h3">Mi progreso</h3><a href="#/app/progreso" class="link small">Ver todo</a></div>
      <div class="row gap kpis wrap"><div><small>Peso actual</small><b>${last ? last.weight + " kg" : "—"}</b></div>
      <div><small>IMC</small><b>${imc ?? "—"}</b>${imc ? `<span class="chip-mini ${cat.c}">${cat.t}</span>` : ""}</div>
      <div><small>Objetivo</small><b>${m.goalWeight ? m.goalWeight + " kg" : "—"}</b></div>
      ${last && first && last !== first ? `<div><small>Cambio</small><b>${(last.weight - first.weight > 0 ? "+" : "") + (last.weight - first.weight).toFixed(1)} kg</b></div>` : ""}</div>
      ${lineChart(ws.slice(-10).map((p) => ({ label: fmtDate(p.date).slice(0, 6), v: +p.weight })), { goal: m.goalWeight ? +m.goalWeight : null, unit: " kg" })}`;
  },

  async reservar(el, S) {
    el.innerHTML = `${back("Reservar")}<div data-f></div>`;
    mountReservaForm($("[data-f]", el), { member: S.member, onDone: () => (location.hash = "#/app/reservas") });
  },

  async reservas(el, S) {
    el.innerHTML = `${back("Mis reservas")}<div class="stack" data-l><div class="center pad"><span class="spinner"></span></div></div>`;
    const snap = await getDocs(query(collection(db, "reservations"), where("memberId", "==", S.id)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const today = ymd();
    const up = list.filter((r) => r.date >= today && r.status !== "cancelada" && r.status !== "completada");
    const past = list.filter((r) => !up.includes(r));
    const L = $("[data-l]", el);
    L.innerHTML = `${up.length ? up.map((r) => `<div class="reveal">${passHTML(r)}
        <div class="btn-row mt-s"><button class="btn btn-ghost w100" data-dl="${r.id}">${icon("download")} Guardar</button>
        <button class="btn btn-ghost danger w100" data-cancel="${r.id}">${icon("x")} Cancelar</button></div></div>`).join("")
      : `<div class="card center muted reveal">No tienes reservas próximas<br><a class="btn btn-metal mt" href="#/app/reservar">Reservar ahora</a></div>`}
      ${past.length ? `<h3 class="h3 mt">Historial</h3><div class="card list reveal">${past.slice(0, 30).map((r) => `
        <div class="li"><div><b>${esc(r.className)}</b><small>${fmtDate(r.date)} · ${fmtTime(r.time)}</small></div>${chip(r.status, r.date < today)}</div>`).join("")}</div>` : ""}`;
    enhance(L);
    $$("[data-dl]", L).forEach((b) => (b.onclick = () => downloadPass(b.closest(".reveal").querySelector(".pass"), `pase-${b.dataset.dl}`)));
    $$("[data-cancel]", L).forEach((b) => (b.onclick = async () => {
      const r = list.find((x) => x.id === b.dataset.cancel);
      if (!(await confirmDialog("¿Cancelar esta reserva?", "Sí, cancelar"))) return;
      await cancelReservation(r);
      notify("admin", "Reserva cancelada", `${S.member.name} canceló ${r.className} ${fmtDate(r.date)} ${fmtTime(r.time)}`, "reserva");
      toast("Reserva cancelada"); SECTIONS.reservas(el, S);
    }));
  },

  async progreso(el, S) {
    el.innerHTML = `${back("Mi progreso")}<div data-c><div class="center pad"><span class="spinner"></span></div></div>`;
    const [prog, photos] = await Promise.all([loadProgress(S.id), getDocs(collection(db, "members", S.id, "photos"))]);
    const ph = photos.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date));
    const m = S.member;
    const C = $("[data-c]", el);
    C.innerHTML = `
      <div class="reveal">${summaryHTML(m, prog)}</div>
      <p class="muted small center mt-s reveal">Tu coach registra y actualiza tu progreso. Si notas algún dato incorrecto, escríbele por el chat.</p>
      <div class="card mt reveal"><h3 class="h3">Evolución</h3>${chartBlockHTML()}</div>
      <div class="card mt reveal"><h3 class="h3">Inicial vs actual</h3>${comparisonHTML(m, prog)}</div>
      <h3 class="h3 mt reveal">Fotos</h3>
      <div class="reveal">${beforeAfterHTML(ph)}</div>
      <div class="photos reveal">${ph.length ? ph.slice().reverse().map((p) => `<figure class="photo"><img src="${p.data}" alt="" loading="lazy"><figcaption>${fmtDate(p.date)}${p.label ? " · " + esc(p.label) : ""}</figcaption></figure>`).join("") : `<p class="muted">Tu coach subirá tus fotos de progreso.</p>`}</div>
      <h3 class="h3 mt reveal">Historial</h3>
      <div class="card reveal">${historyHTML(m, prog)}</div>`;
    bindChart(C, m, prog);
    $$(".photo img, .ba img", C).forEach((img) => (img.onclick = () => modal(`<img class="photo-full" src="${img.src}" alt="">`, { wide: true })));
  },

  async dieta(el, S) {
    el.innerHTML = `${back("Mi dieta")}<div data-c><div class="center pad"><span class="spinner"></span></div></div>`;
    const d = (await getDoc(doc(db, "members", S.id, "plan", "diet"))).data();
    const C = $("[data-c]", el);
    C.innerHTML = d?.meals?.length ? `
      ${d.calories || d.macros ? `<div class="stats3 reveal">${d.calories ? `<div class="stat"><small>Calorías</small><b>${esc(d.calories)}</b></div>` : ""}${d.macros ? `<div class="stat wide"><small>Macros</small><b>${esc(d.macros)}</b></div>` : ""}</div>` : ""}
      <div class="stack">${d.meals.map((m) => `<div class="card meal reveal"><div class="meal-ic">${icon("apple")}</div><div><h4>${esc(m.name)}</h4><p class="pre">${esc(m.text)}</p></div></div>`).join("")}</div>
      ${d.notes ? `<div class="card reveal mt"><h4>Indicaciones del coach</h4><p class="pre muted">${esc(d.notes)}</p></div>` : ""}
      <div class="btn-row mt reveal"><button class="btn btn-ghost" data-pdf>${icon("download")} Descargar PDF</button><button class="btn btn-ghost" data-xlsx>${icon("download")} Excel</button></div>
      <p class="muted small center mt">Actualizada ${fmtDateTime(d.updatedAt)}</p>`
      : `<div class="card center muted reveal">Tu coach aún no asigna tu dieta.<br><a class="btn btn-ghost mt" href="#/app/chat">Escribir al coach</a></div>`;
    $("[data-pdf]", C)?.addEventListener("click", () => exportPlan("pdf", "diet", d, S.member));
    $("[data-xlsx]", C)?.addEventListener("click", () => exportPlan("xlsx", "diet", d, S.member));
  },

  async rutina(el, S) {
    el.innerHTML = `${back("Mi rutina")}<div data-c><div class="center pad"><span class="spinner"></span></div></div>`;
    const d = (await getDoc(doc(db, "members", S.id, "plan", "routine"))).data();
    const days = DAYS_ORDER.filter((k) => d?.days?.[k]?.trim());
    const C = $("[data-c]", el);
    if (!days.length) { C.innerHTML = `<div class="card center muted reveal">Tu coach aún no asigna tu rutina.<br><a class="btn btn-ghost mt" href="#/app/chat">Escribir al coach</a></div>`; return; }
    const todayKey = DAYS_ORDER[(new Date().getDay() + 6) % 7];
    const pick = (k) => {
      $$("[data-day]", C).forEach((b) => b.classList.toggle("on", b.dataset.day === k));
      const lines = d.days[k].split("\n").filter((l) => l.trim());
      $("[data-list]", C).innerHTML = lines.map((l, i) => `<label class="ex reveal in" style="--i:${i}"><input type="checkbox"><span class="ex-box">${icon("check")}</span><span>${esc(l)}</span></label>`).join("");
    };
    C.innerHTML = `<div class="seg scroll reveal">${days.map((k) => `<button data-day="${k}">${DAY_LABEL[k]}${k === todayKey ? " •" : ""}</button>`).join("")}</div>
      <div class="card reveal"><div class="ex-list" data-list></div></div>
      ${d.notes ? `<div class="card reveal mt"><h4>Notas</h4><p class="pre muted">${esc(d.notes)}</p></div>` : ""}
      <div class="btn-row mt reveal"><button class="btn btn-ghost" data-pdf>${icon("download")} Descargar PDF</button><button class="btn btn-ghost" data-xlsx>${icon("download")} Excel</button></div>`;
    $$("[data-day]", C).forEach((b) => (b.onclick = () => pick(b.dataset.day)));
    $("[data-pdf]", C).onclick = () => exportPlan("pdf", "routine", d, S.member);
    $("[data-xlsx]", C).onclick = () => exportPlan("xlsx", "routine", d, S.member);
    pick(days.includes(todayKey) ? todayKey : days[0]);
  },

  async chat(el, S) {
    el.innerHTML = `${back("Chat con coach")}
      <div class="chat card"><div class="chat-msgs" data-msgs><div class="center pad"><span class="spinner"></span></div></div>
      <form class="chat-form"><input name="t" placeholder="Escribe un mensaje…" autocomplete="off" maxlength="1000"><button class="icon-btn metal" aria-label="Enviar">${icon("send")}</button></form></div>`;
    const box = $("[data-msgs]", el);
    S.chatUnsub = onSnapshot(query(collection(db, "chats", S.id, "messages"), orderBy("at", "asc")), (snap) => {
      box.innerHTML = snap.docs.map((d) => d.data()).map((m) => `<div class="msg ${m.from === "member" ? "me" : ""}"><p>${esc(m.text)}</p><small>${timeAgo(m.at)}</small></div>`).join("")
        || `<p class="muted center pad">Escríbele a tu coach: dudas de tu rutina, dieta o reservas.</p>`;
      box.scrollTop = box.scrollHeight;
      setDoc(doc(db, "chats", S.id), { unreadMember: 0 }, { merge: true }).catch(() => {});
    });
    const f = $(".chat-form", el);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const text = f.t.value.trim(); if (!text) return;
      f.t.value = "";
      await addDoc(collection(db, "chats", S.id, "messages"), { from: "member", text, at: serverTimestamp() });
      await setDoc(doc(db, "chats", S.id), { memberId: S.id, name: S.member.name, lastMsg: text, lastAt: serverTimestamp(), unreadAdmin: increment(1) }, { merge: true });
      notify("admin", `Mensaje de ${S.member.name}`, text.slice(0, 120), "chat");
    };
  },

  async perfil(el, S) {
    const m = S.member;
    el.innerHTML = `${back("Mi perfil")}
      <div class="card reveal profile">
        <label class="avatar-edit" title="Cambiar foto"><div class="avatar xl">${m.avatar ? `<img src="${m.avatar}" alt="">` : esc(m.name[0])}</div>
          <span class="avatar-cam">${icon("camera")}</span><input type="file" accept="image/*" data-av hidden></label>
        <h3>${esc(m.name)}</h3><p class="muted mono">${esc(S.id)}</p>
        <div class="kv"><span>Plan</span><b>${esc(m.plan || "—")}</b></div>
        <div class="kv"><span>Vigencia</span><b>${m.paidUntil ? fmtDate(m.paidUntil) : "—"}</b></div>
        <div class="kv"><span>Miembro desde</span><b>${fmtDate(m.createdAt)}</b></div></div>
      <form class="card form reveal" data-pf novalidate><h3 class="h3">Mis datos de contacto</h3>
        <label class="field"><span>Correo electrónico</span><div class="input">${icon("send")}<input name="email" type="email" inputmode="email" value="${esc(m.email || "")}" placeholder="tucorreo@ejemplo.com"></div></label>
        <label class="field"><span>Celular (WhatsApp) *</span><div class="input">${icon("phone")}<input name="phone" type="tel" inputmode="tel" value="${esc(m.phone || "")}"></div></label>
        <label class="field"><span>Contacto de emergencia</span><div class="input">${icon("user")}<input name="emergencyName" value="${esc(m.emergencyName || "")}" placeholder="Nombre"></div></label>
        <label class="field"><span>Teléfono de emergencia</span><div class="input">${icon("phone")}<input name="emergencyPhone" type="tel" inputmode="tel" value="${esc(m.emergencyPhone || "")}"></div></label>
        <button type="submit" class="btn btn-metal w100" data-submit>${icon("check")} Guardar cambios</button></form>
      <div class="card reveal mt"><h3 class="h3">Mi ficha</h3>${profileFactsHTML(m)}<p class="muted small mt-s">Tu ficha, medidas y progreso solo los modifica tu coach. Si algo cambió, avísale por el chat.</p></div>
      <div class="card reveal stack mt">
        <button class="btn btn-ghost w100" data-notif>${icon("bell")} Activar notificaciones</button>
        <button class="btn btn-ghost w100" data-pw>${icon("lock")} Cambiar contraseña</button>
        <button class="btn btn-ghost w100 install-only" onclick="installApp()">${icon("download")} Instalar app</button>
        <button class="btn btn-ghost danger w100" data-out>${icon("logout")} Cerrar sesión</button></div>`;
    // Lo único que el socio puede modificar: foto de perfil y datos de contacto
    $("[data-av]", el).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        await updateDoc(doc(db, "members", S.id), { avatar: await compressImage(file, 240, 0.8), profileUpdatedAt: serverTimestamp() });
        toast("Foto actualizada");
      } catch (err) { console.error(err); toast("No se pudo subir la foto", "err"); }
    };
    const f = $("[data-pf]", el);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const email = f.email.value.trim().toLowerCase();
      const phone = cleanPhone(f.phone.value), emergencyPhone = cleanPhone(f.emergencyPhone.value);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Correo inválido", "err");
      if (phone.length < 10 || phone.length > 15) return toast("Celular inválido (10 dígitos)", "err");
      if (emergencyPhone && emergencyPhone.length < 10) return toast("Teléfono de emergencia inválido", "err");
      const btn = $("[data-submit]", f); setBusy(btn, true, "Guardando…");
      try {
        await updateDoc(doc(db, "members", S.id), { email, phone, emergencyName: f.emergencyName.value.trim(), emergencyPhone, profileUpdatedAt: serverTimestamp() });
        notify("admin", "Perfil actualizado", `${m.name} actualizó sus datos de contacto`, "team");
        toast("Datos guardados");
      } catch (err) { console.error(err); toast("No se pudo guardar", "err"); }
      setBusy(btn, false);
    };
    $("[data-out]", el).onclick = async () => { await signOut(auth); location.hash = "#/"; };
    $("[data-notif]", el).onclick = async () => {
      if (!("Notification" in window)) return toast("Tu navegador no soporta notificaciones", "err");
      const p = await Notification.requestPermission();
      if (p === "granted") { await registerPush(`member:${S.id}`); toast("Notificaciones activadas"); } else toast("Permiso denegado", "err");
    };
    $("[data-pw]", el).onclick = () => changePasswordDialog();
  },
};

function chip(status, past) {
  const s = status === "confirmada" && past ? "completada" : status;
  return `<span class="chip chip-${s}">${{ pendiente: "Pendiente", confirmada: "Confirmada", completada: "Completada", cancelada: "Cancelada" }[s]}</span>`;
}

export async function loadProgress(id) {
  const s = await getDocs(collection(db, "members", id, "progress"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function cancelReservation(r) {
  await runTransaction(db, async (tx) => {
    // Se relee la reserva: si ya estaba cancelada (por el coach u otra pestaña) no se libera el lugar dos veces
    const rRef = doc(db, "reservations", r.id || r.code);
    const cur = await tx.get(rRef);
    if (!cur.exists() || cur.data().status === "cancelada") return;
    const sRef = doc(db, "slots", slotId(r.date, r.className, r.time));
    const s = await tx.get(sRef);
    const used = (s.exists() && s.data().n) || 0;
    if (used > 0) tx.update(sRef, { n: used - 1 });
    tx.update(rRef, { status: "cancelada", cancelledAt: serverTimestamp() });
  });
}

export function changePasswordDialog() {
  const m = modal(`<h3 class="h3">Cambiar contraseña</h3>
    <form class="form stack" novalidate>
      <label class="field"><span>Contraseña actual</span><div class="input">${icon("lock")}<input name="a" type="password" autocomplete="current-password"></div></label>
      <label class="field"><span>Nueva contraseña</span><div class="input">${icon("lock")}<input name="b" type="password" autocomplete="new-password"></div></label>
      <label class="field"><span>Confirmar nueva</span><div class="input">${icon("lock")}<input name="c" type="password" autocomplete="new-password"></div></label>
      <button class="btn btn-metal w100">Guardar</button></form>`);
  const f = $("form", m.el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.b.value.length < 6) return toast("Mínimo 6 caracteres", "err");
    if (f.b.value !== f.c.value) return toast("Las contraseñas no coinciden", "err");
    const btn = $("button", f); setBusy(btn, true);
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, f.a.value));
      await updatePassword(auth.currentUser, f.b.value);
      toast("Contraseña actualizada"); m.close();
    } catch (err) { setBusy(btn, false); toast(err.code?.includes("credential") ? "Contraseña actual incorrecta" : "No se pudo cambiar", "err"); }
  };
}
