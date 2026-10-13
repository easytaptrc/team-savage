// PDF de la rutina / dieta: se guarda tal cual (en partes, dentro de Firestore) y se previsualiza con pdf.js
import { db, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "./firebase.js";
import { esc, icon, toast } from "./ui.js";
import { loadScript } from "./docs.js";

const CHUNK = 700000;           // caracteres base64 por documento (< 1 MB de Firestore)
export const MAX_PDF_MB = 5;

const toBase64 = (buf) => {
  let bin = ""; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
// Cada versión del PDF usa sus propias partes (kind_ver_i): si una subida falla, el PDF anterior sigue intacto
const partRef = (memberId, kind, i, ver) => doc(db, "members", memberId, "planfiles", ver ? `${kind}_${ver}_${i}` : `${kind}_${i}`);
const planRef = (memberId, kind) => doc(db, "members", memberId, "plan", kind);

/** Sube el PDF (reemplaza el anterior). kind: "routine" | "diet" */
export async function uploadPlanPdf(memberId, kind, file, prev) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("El archivo debe ser PDF");
  if (file.size > MAX_PDF_MB * 1024 * 1024) throw new Error(`El PDF pesa más de ${MAX_PDF_MB} MB. Comprímelo (ej. ilovepdf.com) y vuelve a intentar.`);
  const b64 = toBase64(await file.arrayBuffer());
  const parts = Math.ceil(b64.length / CHUNK);
  const ver = Date.now().toString(36);
  for (let i = 0; i < parts; i++) await setDoc(partRef(memberId, kind, i, ver), { data: b64.slice(i * CHUNK, (i + 1) * CHUNK), i });
  const meta = { name: file.name, size: file.size, chunks: parts, ver, uploadedAt: serverTimestamp() };
  await setDoc(planRef(memberId, kind), { pdf: meta, updatedAt: serverTimestamp() }, { merge: true });
  // Ya con el nuevo activo, se borran las partes del anterior
  for (let i = 0; i < (prev?.chunks || 0); i++) await deleteDoc(partRef(memberId, kind, i, prev.ver)).catch(() => {});
  return meta;
}

export async function removePlanPdf(memberId, kind, meta) {
  await setDoc(planRef(memberId, kind), { pdf: null, updatedAt: serverTimestamp() }, { merge: true });
  for (let i = 0; i < (meta?.chunks || 0); i++) await deleteDoc(partRef(memberId, kind, i, meta.ver)).catch(() => {});
}

export async function loadPlanPdf(memberId, kind, meta) {
  const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => getDoc(partRef(memberId, kind, i, meta.ver))));
  const b64 = parts.map((p) => p.data()?.data || "").join("");
  return new Blob([fromBase64(b64)], { type: "application/pdf" });
}

/** Visor: dibuja todas las páginas (funciona en celulares, donde el navegador no abre PDFs incrustados) */
export async function mountPdfViewer(host, { memberId, kind, meta, title = "Plan" }) {
  host.innerHTML = `<div class="pdfv">
    <div class="pdfv-bar"><div class="pdfv-name">${icon("list")}<span>${esc(meta.name || "plan.pdf")}</span></div>
      <div class="row gap-s"><button class="btn btn-ghost sm" data-full>Pantalla completa</button><a class="btn btn-metal sm" data-dl>${icon("download")} Descargar</a></div></div>
    <div class="pdfv-pages" data-pages><div class="center pad"><span class="spinner"></span> Cargando PDF…</div></div></div>`;
  try {
    const blob = await loadPlanPdf(memberId, kind, meta);
    if (host.__pdfUrl) URL.revokeObjectURL(host.__pdfUrl);
    const url = (host.__pdfUrl = URL.createObjectURL(blob));
    const dl = host.querySelector("[data-dl]"); dl.href = url; dl.download = meta.name || `${title}.pdf`;
    host.querySelector("[data-full]").onclick = () => host.querySelector(".pdfv").classList.toggle("full");
    await loadScript("pdfjs");
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const pages = host.querySelector("[data-pages]"); pages.innerHTML = "";
    const width = Math.min(pages.clientWidth || 600, 900);
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * Math.min(devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height; c.className = "pdfv-page";
      pages.appendChild(c);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    }
    return url;
  } catch (e) {
    console.error(e);
    host.querySelector("[data-pages]").innerHTML = `<p class="muted center pad">No se pudo mostrar el PDF. ${e.code === "permission-denied" ? "Sin permiso." : "Intenta descargarlo."}</p>`;
    toast("No se pudo cargar el PDF", "err");
  }
}
