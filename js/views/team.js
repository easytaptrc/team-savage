// 3. TEAM — inicio de sesión con ID y creación de contraseña
import {
  auth, db, doc, getDoc, updateDoc, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  memberEmail, serverTimestamp,
} from "../firebase.js";
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { CONFIG, $, esc, icon, toast, setBusy, effectiveStatus, notify } from "../ui.js";

const normId = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

export async function render(root, r) {
  const crear = r.mode === "crear";
  const coachWa = CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hola coach, olvidé mi contraseña del Team. Mi ID es: ")}` : "#";
  root.innerHTML = `
  <section class="page narrow auth-page">
    <header class="page-head reveal"><a href="${crear ? "#/team" : "#/"}" class="icon-btn" aria-label="Volver">${icon("back")}</a><span></span><span></span></header>
    <div class="auth-logo reveal" data-tilt="14"><img data-logo src="${esc(CONFIG.logo)}" alt=""></div>
    <h1 class="title reveal">${crear ? "Crear contraseña" : "Iniciar sesión"}</h1>
    <p class="subtitle reveal">${crear ? "Usa el ID que tu coach te envió por WhatsApp" : "Bienvenido de vuelta al Team"}</p>
    <form class="card card-3d form reveal" novalidate>
      <label class="field"><span>ID de usuario</span>
        <div class="input">${icon("id")}<input name="id" autocomplete="username" autocapitalize="characters" placeholder="Tu ID (ej. TS1001)" required></div></label>
      <label class="field"><span>${crear ? "Nueva contraseña" : "Contraseña"}</span>
        <div class="input">${icon("lock")}<input name="pw" type="password" autocomplete="${crear ? "new-password" : "current-password"}" placeholder="${crear ? "Mínimo 6 caracteres" : "Tu contraseña"}" required>
        <button type="button" class="eye" aria-label="Mostrar">${icon("eye")}</button></div></label>
      ${crear ? `<label class="field"><span>Confirma tu contraseña</span>
        <div class="input">${icon("lock")}<input name="pw2" type="password" autocomplete="new-password" placeholder="Repite la contraseña" required></div></label>` : `
      <div class="row between small"><label class="check"><input type="checkbox" name="remember" checked><span></span>Recordar sesión</label>
        <a href="${coachWa}" target="_blank" rel="noopener" class="link">¿Olvidaste tu contraseña?</a></div>`}
      <button class="btn btn-metal w100 lg" type="submit">${crear ? "Crear y entrar" : "Entrar"} ${icon("chevron")}</button>
    </form>
    ${crear ? "" : `<div class="card first-time reveal"><p class="muted">¿Es tu primera vez?</p>
      <a href="#/team/crear" class="btn btn-ghost w100">Crear contraseña</a></div>`}
  </section>`;

  const form = $("form", root);
  $(".eye", form).onclick = () => { const i = form.pw; i.type = i.type === "password" ? "text" : "password"; if (form.pw2) form.pw2.type = i.type; };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const id = normId(form.id.value), pw = form.pw.value;
    if (!id) return toast("Escribe tu ID", "err");
    if (pw.length < 6) return toast("La contraseña debe tener al menos 6 caracteres", "err");
    if (crear && pw !== form.pw2.value) return toast("Las contraseñas no coinciden", "err");
    const btn = $("button[type=submit]", form);
    setBusy(btn, true, crear ? "Creando…" : "Entrando…");
    window.__authBusy = true;
    try {
      const lg = await getDoc(doc(db, "logins", id));
      if (!lg.exists()) throw msg("Ese ID no existe. Verifica con tu coach.");
      const L = lg.data();
      if (L.status && L.status !== "activo") throw msg(blockedMsg(L.status));
      const email = memberEmail(id, L.v || 1);

      if (crear) {
        if (L.claimed) throw msg("Este ID ya tiene contraseña. Inicia sesión.");
        await setPersistence(auth, browserLocalPersistence);
        try { await createUserWithEmailAndPassword(auth, email, pw); }
        catch (err) { if (err.code === "auth/email-already-in-use") await signInWithEmailAndPassword(auth, email, pw); else throw err; }
        await updateDoc(doc(db, "members", id), { uid: auth.currentUser.uid, activatedAt: serverTimestamp() });
        await updateDoc(doc(db, "logins", id), { claimed: true });
        const m = (await getDoc(doc(db, "members", id))).data();
        notify("admin", "Cuenta activada", `${m?.name || id} creó su contraseña del Team`, "team");
        toast("¡Bienvenido al Team!");
      } else {
        if (!L.claimed) throw msg("Aún no creas tu contraseña. Toca «Crear contraseña».");
        await setPersistence(auth, form.remember.checked ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, pw);
        const snap = await getDoc(doc(db, "members", id));
        const st = effectiveStatus(snap.data());
        if (!snap.exists() || st !== "activo") { await signOut(auth); throw msg(blockedMsg(st)); }
      }
      localStorage.setItem("ts_member", id);
      window.__authBusy = false;
      location.hash = "#/app";
    } catch (err) {
      window.__authBusy = false;
      if (crear && auth.currentUser) await signOut(auth).catch(() => {});
      setBusy(btn, false);
      const code = err.code || "";
      toast(err.userMsg || (code.includes("invalid-credential") || code.includes("wrong-password") ? "Contraseña incorrecta"
        : code.includes("too-many-requests") ? "Demasiados intentos, espera un momento" : code.includes("network") ? "Sin conexión" : "No se pudo continuar"), "err");
      console.warn(err);
    }
  };
}

function msg(t) { const e = new Error(t); e.userMsg = t; return e; }
function blockedMsg(st) {
  return st === "bloqueado" ? "Tu cuenta está bloqueada por inactividad. Contacta a tu coach para reactivarla."
    : "Tu cuenta está inactiva. Contacta a tu coach.";
}
