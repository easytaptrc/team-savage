// Pases guardados en este dispositivo (reservas sin cuenta)
import { CONFIG, $, esc, icon, passHTML, enhance, downloadPass, parseYmd } from "../ui.js";

export async function render(root) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem("ts_passes") || "[]"); } catch {}
  const today = new Date(); today.setHours(0, 0, 0, 0);
  list = list.filter((r) => parseYmd(r.date) >= today);
  root.innerHTML = `
  <section class="page narrow">
    <header class="page-head reveal"><a href="#/" class="icon-btn" aria-label="Volver">${icon("back")}</a>
      <img data-logo src="${esc(CONFIG.logo)}" class="head-logo" alt=""><span></span></header>
    <h1 class="title reveal">Mis pases</h1>
    <p class="subtitle reveal">Pases de tus próximas reservas en este dispositivo</p>
    <div class="stack">${list.length ? list.map((r, i) => `<div class="reveal">${passHTML(r)}
      <button class="btn btn-ghost w100 mt-s" data-dl="${i}">${icon("download")} Descargar</button></div>`).join("")
      : `<div class="card center muted reveal">No tienes pases próximos.<br><a class="btn btn-metal mt" href="#/reserva">Reservar</a></div>`}</div>
  </section>`;
  enhance(root);
  root.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = () => downloadPass(b.previousElementSibling, `pase-${list[b.dataset.dl].code}`)));
}
