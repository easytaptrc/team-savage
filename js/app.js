// Router principal de la app
import { auth, onAuthStateChanged, isAdminUser } from "./firebase.js";
import { loadConfig, enhance } from "./ui.js";

const views = {
  home: () => import("./views/home.js"),
  reserva: () => import("./views/reserva.js"),
  pases: () => import("./views/pases.js"),
  team: () => import("./views/team.js"),
  client: () => import("./views/client.js"),
  admin: () => import("./views/admin.js"),
};

let cleanup = null;
let user = null;
let ready = false;

function parse() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (!a) return { view: "home" };
  if (a === "reserva") return { view: "reserva" };
  if (a === "pases") return { view: "pases" };
  if (a === "team") return { view: "team", mode: b === "crear" ? "crear" : "login" };
  if (a === "app") return { view: "client", section: b || "inicio", arg: c };
  if (a === "admin") return { view: "admin", section: b || "inicio", arg: c };
  return { view: "home" };
}

async function route() {
  if (!ready) return;
  const r = parse();
  // Protección de rutas
  if (r.view === "client" && (!user || isAdminUser(user))) return go("#/team");
  if (r.view === "team" && user && !isAdminUser(user)) return go("#/app");
  if (r.view === "admin" && user && !isAdminUser(user)) r.section = "login";
  if (r.view === "admin" && !user) r.section = "login";

  const root = document.getElementById("app");
  const mod = await views[r.view]();
  const sameShell = cleanup && cleanup.view === r.view && cleanup.update && r.section !== "login";
  if (sameShell) { await cleanup.update(r); enhance(root); window.scrollTo({ top: 0, behavior: "smooth" }); return; }

  cleanup?.fn?.();
  root.classList.remove("view-in");
  void root.offsetWidth;
  const res = await mod.render(root, r, { user });
  root.classList.add("view-in");
  cleanup = { view: r.view, fn: res?.destroy, update: res?.update };
  enhance(root);
  window.scrollTo(0, 0);
}

export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.go = go;

window.addEventListener("hashchange", route);

(async () => {
  await loadConfig();
  onAuthStateChanged(auth, (u) => {
    const changed = (u?.uid || null) !== (user?.uid || null);
    user = u;
    if (window.__authBusy) return; // la vista de login termina su flujo y navega ella misma
    if (!ready) { ready = true; route(); }
    else if (changed) { cleanup?.fn?.(); cleanup = null; route(); }
  });
})();

// PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e)));
}
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; document.body.classList.add("can-install"); });
window.installApp = async () => { if (!deferredInstall) return; deferredInstall.prompt(); deferredInstall = null; document.body.classList.remove("can-install"); };
