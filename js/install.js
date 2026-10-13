// Guía para instalar la app (PWA) según el dispositivo, con pasos animados
import { icon, toast } from "./ui.js";
import { isStandalone, notifState, enableNotifications } from "./reminders.js";

const UA = navigator.userAgent;
export function platform() {
  if (/Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Bytedance|Line\/|Snapchat|Twitter/i.test(UA)) return "inapp";
  const ios = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(UA) ? "ios-other" : "ios";
  if (/Android/.test(UA)) return "android";
  return "desktop";
}

/* Iconos tal como se ven en cada navegador */
const ICO = {
  share: `<svg viewBox="0 0 24 24" class="ic" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`,
  addsq: `<svg viewBox="0 0 24 24" class="ic" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" class="ic" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`,
  dotsh: `<svg viewBox="0 0 24 24" class="ic" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" class="ic" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2M12 7v6M9.5 10.5 12 13l2.5-2.5"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" class="ic" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 7v5M9.5 9.5 12 12l2.5-2.5"/></svg>`,
  compass: `<svg viewBox="0 0 24 24" class="ic" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>`,
};

const STEPS = {
  ios: { title: "Instalar en iPhone", steps: [
    { ic: ICO.share, t: "Toca el botón Compartir", d: "Es el cuadro con la flecha hacia arriba, en la barra de Safari (abajo al centro, o arriba a la derecha en iPad).", demo: "share" },
    { ic: ICO.addsq, t: "Elige «Agregar a inicio»", d: "Desliza la lista hacia abajo hasta encontrar «Agregar a la pantalla de inicio».", demo: "menu" },
    { ic: icon("check"), t: "Toca «Agregar»", d: "Arriba a la derecha. El logo de Team Savage aparecerá en tu pantalla de inicio.", demo: "add" },
    { ic: icon("bell"), t: "Abre la app desde el ícono", d: "Ábrela desde tu inicio y activa las notificaciones con la campana. En iPhone solo llegan si la app está instalada.", demo: "home" },
  ] },
  "ios-other": { title: "Abre en Safari", steps: [
    { ic: ICO.compass, t: "Abre esta página en Safari", d: "En iPhone solo Safari puede instalar la app. Copia el enlace y pégalo en Safari.", demo: "copy" },
    { ic: ICO.share, t: "Luego Compartir → «Agregar a inicio»", d: "Sigue los pasos de instalación desde Safari.", demo: "share" },
  ] },
  android: { title: "Instalar en Android", steps: [
    { ic: ICO.dots, t: "Toca el menú ⋮ de Chrome", d: "Son los tres puntos arriba a la derecha.", demo: "dots" },
    { ic: ICO.phone, t: "Elige «Instalar app»", d: "También puede decir «Agregar a la pantalla principal».", demo: "menu" },
    { ic: icon("check"), t: "Confirma «Instalar»", d: "El logo de Team Savage aparecerá con tus apps.", demo: "add" },
    { ic: icon("bell"), t: "Activa las notificaciones", d: "Abre la app y toca la campana para recibir tus recordatorios de cita.", demo: "home" },
  ] },
  desktop: { title: "Instalar en la computadora", steps: [
    { ic: ICO.monitor, t: "Busca el ícono de instalar", d: "En Chrome o Edge aparece a la derecha de la barra de direcciones (un monitor con flecha).", demo: "dots" },
    { ic: icon("check"), t: "Haz clic en «Instalar»", d: "La app se abrirá en su propia ventana y quedará en tu escritorio o menú de inicio.", demo: "add" },
    { ic: icon("bell"), t: "Activa las notificaciones", d: "Toca la campana para recibir avisos aunque la app esté cerrada.", demo: "home" },
  ] },
  inapp: { title: "Abre en tu navegador", steps: [
    { ic: ICO.dotsh, t: "Toca el menú ⋯", d: "Estás dentro de Instagram, TikTok o Facebook. Desde aquí no se puede instalar.", demo: "dots" },
    { ic: ICO.compass, t: "Elige «Abrir en el navegador»", d: "Puede decir «Abrir en Safari», «Abrir en Chrome» o «Abrir en navegador externo».", demo: "menu" },
    { ic: ICO.share, t: "Instala desde ahí", d: "Ya en Safari o Chrome, vuelve a tocar «Instalar app» y sigue los pasos.", demo: "add" },
  ] },
};

/* Mini “pantalla de teléfono” animada para cada paso */
function demoHTML(kind, plat) {
  const isIOS = plat.startsWith("ios");
  const bar = isIOS
    ? `<div class="ig-bar bottom"><span></span><span class="hl-share">${ICO.share}</span><span></span><span></span></div>`
    : `<div class="ig-bar top"><span class="ig-url">team-savage.com</span><span class="hl-dots">${plat === "inapp" ? ICO.dotsh : ICO.dots}</span></div>`;
  const menuItems = isIOS
    ? ["Copiar", "Agregar a favoritos", "Agregar a inicio", "Marcar"]
    : plat === "inapp" ? ["Copiar enlace", "Abrir en el navegador", "Compartir", "Reportar"] : ["Nueva pestaña", "Favoritos", "Instalar app", "Compartir…"];
  const target = isIOS ? 2 : plat === "inapp" ? 1 : 2;
  const screens = {
    share: `${bar}<i class="ig-tap ${isIOS ? "at-share" : "at-dots"}"></i>`,
    dots: `${bar}<i class="ig-tap at-dots"></i>`,
    menu: `${bar}<div class="ig-menu ${isIOS ? "from-bottom" : ""}">${menuItems.map((m, i) => `<div class="${i === target ? "hl" : ""}">${m}</div>`).join("")}</div><i class="ig-tap at-menu ${isIOS ? "from-bottom" : ""}"></i>`,
    add: `<div class="ig-dialog"><img src="assets/icon-192.png" alt=""><b>Team Savage</b><span>team-savage.com</span><div class="ig-btns"><em>Cancelar</em><strong>${isIOS ? "Agregar" : "Instalar"}</strong></div></div><i class="ig-tap at-add"></i>`,
    home: `<div class="ig-home">${"<i></i>".repeat(5)}<div class="ig-app"><img src="assets/icon-192.png" alt=""><small>Team Savage</small></div>${"<i></i>".repeat(6)}</div>`,
    copy: `<div class="ig-bar top"><span class="ig-url hl-url">team-savage.com</span></div><div class="ig-toast">Enlace copiado ✓</div>`,
  };
  return `<div class="ig-phone"><div class="ig-screen">${screens[kind] || screens.home}</div></div>`;
}

export function showInstallGuide({ deferred } = {}) {
  const plat = platform();
  const cfg = STEPS[plat];
  let i = 0;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop install-guide";
  wrap.innerHTML = `<div class="modal ig-modal" role="dialog" aria-modal="true" aria-label="${cfg.title}">
    <button class="modal-x" aria-label="Cerrar">${icon("x")}</button>
    <div class="ig-head"><img src="assets/icon-192.png" alt=""><div><b>${cfg.title}</b><small>Tarda 10 segundos · gratis · sin tienda de apps</small></div></div>
    ${deferred ? `<button class="btn btn-metal w100 lg" data-native>${icon("download")} Instalar ahora</button><p class="muted small center mt-s">o sigue los pasos:</p>` : ""}
    <div class="ig-stage" data-stage></div>
    <div class="ig-dots">${cfg.steps.map((_, k) => `<button data-go="${k}" aria-label="Paso ${k + 1}"></button>`).join("")}</div>
    <div class="row gap-s mt"><button class="btn btn-ghost" data-prev>${icon("back")}</button><button class="btn btn-metal grow" data-next>Siguiente</button></div>
    ${plat === "inapp" || plat === "ios-other" ? `<button class="btn btn-ghost w100 mt-s" data-copy>Copiar enlace</button>` : ""}
  </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("show"));
  const close = () => { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 300); clearInterval(auto); };
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector(".modal-x").onclick = close;

  const stage = wrap.querySelector("[data-stage]");
  const draw = () => {
    const s = cfg.steps[i];
    stage.innerHTML = `<div class="ig-step" key="${i}">
      ${demoHTML(s.demo, plat)}
      <div class="ig-text"><span class="ig-num">Paso ${i + 1} de ${cfg.steps.length}</span><div class="ig-title"><span class="ig-ic">${s.ic}</span><b>${s.t}</b></div><p>${s.d}</p></div></div>`;
    wrap.querySelectorAll("[data-go]").forEach((b) => b.classList.toggle("on", +b.dataset.go === i));
    wrap.querySelector("[data-prev]").disabled = i === 0;
    wrap.querySelector("[data-next]").textContent = i === cfg.steps.length - 1 ? "Listo" : "Siguiente";
  };
  const go = (n) => { i = Math.max(0, Math.min(cfg.steps.length - 1, n)); draw(); };
  wrap.querySelector("[data-prev]").onclick = () => { stop(); go(i - 1); };
  wrap.querySelector("[data-next]").onclick = () => { stop(); i === cfg.steps.length - 1 ? close() : go(i + 1); };
  wrap.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { stop(); go(+b.dataset.go); }));
  wrap.querySelector("[data-copy]")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast("Enlace copiado. Pégalo en Safari o Chrome."); } catch { toast(location.origin, "info"); } });
  wrap.querySelector("[data-native]")?.addEventListener("click", async () => { close(); await window.installApp?.(); });
  // Avanza solo, como un video; se detiene si la persona toca algo
  let auto = setInterval(() => go((i + 1) % cfg.steps.length), 4200);
  const stop = () => clearInterval(auto);
  draw();
}

/** Botón/aviso de instalación en la portada */
export function installCTA() {
  if (isStandalone()) return "";
  return `<button class="cover-install" data-install>${icon("download")}<span>Instala la app</span></button>`;
}
export function bindInstallCTA(root) {
  const b = root.querySelector("[data-install]");
  if (!b) return;
  b.onclick = () => showInstallGuide({ deferred: !!window.__deferredInstall });
}
export { notifState, enableNotifications };
