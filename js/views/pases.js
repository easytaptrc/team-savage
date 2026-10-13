// Pases guardados en este dispositivo (reservas sin cuenta) + confirmación de asistencia
import { CONFIG, $, esc, icon, passHTML, enhance, downloadPass, parseYmd, toast } from "../ui.js";
import { mountWalletButtons } from "../wallet.js";
import { needsConfirmation, confirmBannerHTML, bindConfirmBanners, confirmAttendance } from "../reminders.js";

export async function render(root, r) {
  // Viene de la notificación: #/confirmar/TS-XXXXXX
  if (r?.confirm) {
    try { await confirmAttendance(r.confirm); toast("¡Asistencia confirmada! Te esperamos."); }
    catch (err) { toast(err.code === "permission-denied" ? "Esta reserva ya no está activa" : "No se pudo confirmar, intenta de nuevo", "err"); }
    history.replaceState(null, "", "#/pases");
  }
  let list = [];
  try { list = JSON.parse(localStorage.getItem("ts_passes") || "[]"); } catch {}
  const today = new Date(); today.setHours(0, 0, 0, 0);
  list = list.filter((p) => parseYmd(p.date) >= today);
  const pending = list.filter((p) => needsConfirmation(p));
  root.innerHTML = `
  <section class="page narrow">
    <header class="page-head reveal"><a href="#/" class="icon-btn" aria-label="Volver">${icon("back")}</a>
      <img data-logo src="${esc(CONFIG.logo)}" class="head-logo" alt=""><span></span></header>
    <h1 class="title reveal">Mis pases</h1>
    <p class="subtitle reveal">Pases de tus próximas reservas en este dispositivo</p>
    ${pending.length ? `<div class="stack mb-s">${pending.map(confirmBannerHTML).join("")}</div>` : ""}
    <div class="stack">${list.length ? list.map((p, i) => `<div class="reveal">${passHTML(p)}
      ${p.attendanceConfirmed ? `<p class="small center mt-s" style="color:var(--ok)">${icon("check")} Asistencia confirmada</p>` : ""}
      <div class="wallet-box mt-s" data-wallet="${i}"><span class="spinner"></span></div></div>`).join("")
      : `<div class="card center muted reveal">No tienes pases próximos.<br><a class="btn btn-metal mt" href="#/reserva">Reservar</a></div>`}</div>
  </section>`;
  enhance(root);
  bindConfirmBanners(root);
  root.querySelectorAll("[data-wallet]").forEach((box) => mountWalletButtons(box, list[box.dataset.wallet], box.parentElement.querySelector(".pass")));
}
