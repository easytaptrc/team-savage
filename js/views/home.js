// 1. INDEX — portada minimalista: imagen de fondo, RESERVA, TEAM y redes
import { CONFIG, icon, esc } from "../ui.js";

export async function render(root) {
  const L = CONFIG.links;
  const wa = CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp.replace(/\D/g, "")}` : "";
  const socials = [["instagram", L.instagram], ["tiktok", L.tiktok], ["youtube", L.youtube], ["facebook", L.facebook], ["whatsapp", wa]].filter(([, u]) => u);
  const loc = CONFIG.location || "";
  const mapUrl = CONFIG.mapsUrl || (loc ? `https://www.google.com/maps/search/${encodeURIComponent(`${CONFIG.gymName} ${loc}`)}` : "");
  let passes = [];
  try { passes = JSON.parse(localStorage.getItem("ts_passes") || "[]"); } catch {}
  const cover = esc(CONFIG.cover || "assets/fondo.jpg");

  root.innerHTML = `
  <section class="cover-page">
    <div class="cover-backdrop" style="background-image:url('${cover}')" aria-hidden="true"></div>
    <div class="cover-col">
      <div class="cover-media" aria-hidden="true"><img src="${cover}" alt="" fetchpriority="high"></div>
      <div class="cover-content">
        <a href="#/reserva" class="pill pill-main">
          <span class="pill-ic">${icon("calendar")}</span><span class="pill-label">Reserva</span><span class="pill-arrow">${arrow()}</span>
        </a>
        <a href="#/team" class="pill pill-sub">
          <span class="pill-ic">${icon("users")}</span><i class="pill-div"></i><span class="pill-label">Team</span><span class="pill-arrow">${arrow()}</span>
        </a>
        ${passes.length ? `<a href="#/pases" class="cover-link">Mis pases (${passes.length})</a>` : ""}
        <footer class="cover-foot">
          <i class="foot-line"></i>
          <nav class="foot-items" aria-label="Redes sociales">
            ${socials.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${n}">${icon(n)}</a>`).join("")}
            ${loc ? `<a class="foot-loc" href="${esc(mapUrl)}" target="_blank" rel="noopener">${pin()}<span>${esc(loc)}</span></a>` : ""}
          </nav>
          <i class="foot-line"></i>
        </footer>
        <div class="cover-extra">
          <button class="cover-link install-only" onclick="installApp()">Instalar app</button>
          <a href="#/admin" class="cover-link coach">Acceso coach</a>
        </div>
      </div>
    </div>
  </section>`;
}

const arrow = () => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M14 7l5 5-5 5"/></svg>`;
const pin = () => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
