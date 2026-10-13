// Botones "Agregar a Apple Wallet" / "Agregar a Google Wallet" (los pases los firma la función /wallet)
import { FUNCTIONS_URL } from "./firebase.js";
import { downloadPass, toast } from "./ui.js";

let statusP = null;
export function walletStatus() {
  return (statusP ||= fetch(`${FUNCTIONS_URL}/wallet?check=1`).then((r) => (r.ok ? r.json() : { google: false, apple: false })).catch(() => ({ google: false, apple: false })));
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const url = (code, type) => `${FUNCTIONS_URL}/wallet?type=${type}&code=${encodeURIComponent(code)}`;

const appleBadge = `<svg viewBox="0 0 24 24" class="ic" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>`;
const googleBadge = `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff"/><path d="M3 9h18" stroke="#4285F4" stroke-width="2.2"/><path d="M3 12h18" stroke="#34A853" stroke-width="2.2"/><path d="M3 15h18" stroke="#FBBC04" stroke-width="2.2"/><path d="M3 18h18" stroke="#EA4335" stroke-width="1.6"/></svg>`;

/** Pinta los botones dentro de `host` para la reserva `r` (con el pase en `passEl` para la imagen) */
export async function mountWalletButtons(host, r, passEl) {
  const s = await walletStatus();
  const ios = isIOS();
  const btns = [];
  if (ios && s.apple) btns.push(`<a class="wallet-btn apple" href="${url(r.code, "apple")}">${appleBadge}<span><small>Agregar a</small>Apple Wallet</span></a>`);
  if (!ios && s.google) btns.push(`<a class="wallet-btn google" href="${url(r.code, "google")}" target="_blank" rel="noopener">${googleBadge}<span><small>Agregar a</small>Google Wallet</span></a>`);
  // Si su wallet no está disponible, ofrece la otra (ej. iPhone con Google Wallet configurado) y la imagen
  if (!btns.length && s.google && ios) btns.push(`<a class="wallet-btn google" href="${url(r.code, "google")}" target="_blank" rel="noopener">${googleBadge}<span><small>Agregar a</small>Google Wallet</span></a>`);
  host.innerHTML = `${btns.join("")}
    <button type="button" class="btn ${btns.length ? "btn-text" : "btn-metal w100 lg"}" data-img>${btns.length ? "o guardar el pase como imagen" : "Guardar pase (imagen)"}</button>`;
  host.querySelector("[data-img]").onclick = () => downloadPass(passEl, `pase-${r.code}`).catch(() => toast("No se pudo guardar la imagen", "err"));
}
