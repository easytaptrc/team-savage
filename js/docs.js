// Exportar e importar rutinas / dietas (PDF, Excel, CSV, Word, texto, imagen)
import { CONFIG, toast, fmtDate, ymd } from "./ui.js";

const LIBS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js",
};
const loaded = {};
export function loadScript(key) {
  return (loaded[key] ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = LIBS[key]; s.async = true;
    s.onload = res; s.onerror = () => { delete loaded[key]; rej(new Error(`No se pudo cargar ${key}`)); };
    document.head.appendChild(s);
  }));
}

export const DAYS_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
export const DAY_LABEL = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };

/* ================= EXPORTAR ================= */
const lines = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean);
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

/** Filas [sección, contenido] comunes a Excel / CSV / texto */
function rowsOf(kind, data) {
  const rows = [];
  if (kind === "routine") {
    DAYS_ORDER.forEach((k) => { const l = lines(data.days?.[k]); if (l.length) l.forEach((x) => rows.push([DAY_LABEL[k], x])); else rows.push([DAY_LABEL[k], "Descanso"]); });
    lines(data.notes).forEach((x) => rows.push(["Notas", x]));
  } else {
    if (data.calories) rows.push(["Calorías", data.calories]);
    if (data.macros) rows.push(["Macros", data.macros]);
    (data.meals || []).forEach((m) => { const l = lines(m.text); (l.length ? l : [""]).forEach((x) => rows.push([m.name, x])); });
    lines(data.notes).forEach((x) => rows.push(["Indicaciones", x]));
  }
  return rows;
}
const titleOf = (kind) => (kind === "routine" ? "Rutina de entrenamiento" : "Plan de alimentación");
const fileName = (kind, member, ext) => `${kind === "routine" ? "rutina" : "dieta"}-${slug(member?.name || "cliente")}-${ymd()}.${ext}`;

function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function logoDataUrl() {
  try {
    if (CONFIG.logo.startsWith("data:")) return CONFIG.logo;
    const b = await (await fetch(CONFIG.logo)).blob();
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  } catch { return null; }
}

export async function exportPlan(format, kind, data, member) {
  try {
    if (format === "pdf") return await exportPDF(kind, data, member);
    const rows = rowsOf(kind, data);
    const head = [kind === "routine" ? "Día" : "Comida", kind === "routine" ? "Ejercicio" : "Alimentos / porciones"];
    if (format === "xlsx") {
      await loadScript("xlsx");
      const X = window.XLSX;
      const info = [[CONFIG.gymName], [titleOf(kind)], ["Cliente", member?.name || ""], ["ID", member?.id || ""], ["Fecha", fmtDate(new Date())], []];
      const ws = X.utils.aoa_to_sheet([...info, head, ...rows]);
      ws["!cols"] = [{ wch: 18 }, { wch: 70 }];
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, kind === "routine" ? "Rutina" : "Dieta");
      X.writeFile(wb, fileName(kind, member, "xlsx"));
    } else if (format === "csv") {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      download(new Blob(["﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }), fileName(kind, member, "csv"));
    } else if (format === "txt") {
      download(new Blob([planToText(kind, data, member)], { type: "text/plain;charset=utf-8" }), fileName(kind, member, "txt"));
    } else if (format === "copy") {
      await navigator.clipboard.writeText(planToText(kind, data, member)); toast("Texto copiado");
    } else if (format === "whatsapp") {
      return planToText(kind, data, member);
    }
  } catch (e) { console.error(e); toast("No se pudo exportar: " + e.message, "err"); }
}

export function planToText(kind, data, member) {
  const out = [`${CONFIG.gymName.toUpperCase()} — ${titleOf(kind)}`, member?.name ? `Cliente: ${member.name}` : "", `Fecha: ${fmtDate(new Date())}`, ""];
  if (kind === "routine") {
    DAYS_ORDER.forEach((k) => { const l = lines(data.days?.[k]); out.push(`*${DAY_LABEL[k]}*`, ...(l.length ? l.map((x) => `• ${x}`) : ["Descanso"]), ""); });
  } else {
    if (data.calories) out.push(`Calorías: ${data.calories}`);
    if (data.macros) out.push(`Macros: ${data.macros}`);
    if (data.calories || data.macros) out.push("");
    (data.meals || []).forEach((m) => out.push(`*${m.name}*`, ...lines(m.text).map((x) => `• ${x}`), ""));
  }
  if (lines(data.notes).length) out.push(kind === "routine" ? "*Notas*" : "*Indicaciones*", ...lines(data.notes));
  return out.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").trim();
}

async function exportPDF(kind, data, member) {
  await loadScript("jspdf");
  await loadScript("autotable");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.getWidth();
  // Encabezado
  pdf.setFillColor(10, 10, 10); pdf.rect(0, 0, W, 96, "F");
  const logo = await logoDataUrl();
  if (logo) { try { pdf.addImage(logo, logo.includes("image/png") ? "PNG" : "JPEG", 32, 14, 68, 68); } catch {} }
  pdf.setTextColor(235, 235, 235); pdf.setFont("helvetica", "bold"); pdf.setFontSize(20);
  pdf.text(titleOf(kind).toUpperCase(), 116, 44);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(170, 170, 170);
  pdf.text(`${CONFIG.gymName}  ·  ${member?.name || ""}${member?.id ? "  (" + member.id + ")" : ""}  ·  ${fmtDate(new Date())}`, 116, 64);

  let y = 120;
  pdf.setTextColor(30, 30, 30);
  if (kind === "diet" && (data.calories || data.macros)) {
    pdf.setFontSize(11); pdf.setFont("helvetica", "bold");
    pdf.text([data.calories ? `Calorías: ${data.calories}` : "", data.macros ? `Macros: ${data.macros}` : ""].filter(Boolean).join("     "), 40, y);
    y += 16;
  }
  const body = [];
  if (kind === "routine") {
    DAYS_ORDER.forEach((k) => {
      const l = lines(data.days?.[k]);
      body.push([{ content: DAY_LABEL[k].toUpperCase(), colSpan: 2, styles: { fillColor: [25, 25, 25], textColor: 240, fontStyle: "bold" } }]);
      if (!l.length) body.push(["", "Descanso"]);
      l.forEach((x, i) => body.push([String(i + 1), x]));
    });
  } else {
    (data.meals || []).forEach((m) => {
      body.push([{ content: m.name.toUpperCase(), colSpan: 2, styles: { fillColor: [25, 25, 25], textColor: 240, fontStyle: "bold" } }]);
      lines(m.text).forEach((x) => body.push(["•", x]));
    });
  }
  pdf.autoTable({
    startY: y, body, theme: "grid", margin: { left: 40, right: 40 },
    styles: { fontSize: 10.5, cellPadding: 6, lineColor: [215, 215, 215], textColor: [30, 30, 30] },
    columnStyles: { 0: { cellWidth: 28, halign: "center", textColor: [120, 120, 120] } },
  });
  const notes = lines(data.notes);
  if (notes.length) {
    let ny = pdf.lastAutoTable.finalY + 22;
    if (ny > pdf.internal.pageSize.getHeight() - 80) { pdf.addPage(); ny = 50; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.text(kind === "routine" ? "Notas" : "Indicaciones", 40, ny);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10.5);
    pdf.text(pdf.splitTextToSize(notes.join("\n"), W - 80), 40, ny + 16);
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFontSize(8.5); pdf.setTextColor(150, 150, 150);
    pdf.text(`${CONFIG.gymName} · ${CONFIG.phone || ""}`, 40, pdf.internal.pageSize.getHeight() - 20);
    pdf.text(`${i} / ${pages}`, W - 40, pdf.internal.pageSize.getHeight() - 20, { align: "right" });
  }
  pdf.save(fileName(kind, member, "pdf"));
}

/* ================= IMPORTAR (archivo → texto) ================= */
export const IMPORT_ACCEPT = ".pdf,.xlsx,.xls,.ods,.csv,.txt,.docx,.md,image/*";

export async function fileToText(file, onProgress = () => {}) {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop();
  if (ext === "pdf" || file.type === "application/pdf") return pdfToText(file, onProgress);
  if (["xlsx", "xls", "ods"].includes(ext)) return sheetToText(file);
  if (ext === "docx") { await loadScript("mammoth"); return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
  if (ext === "doc") throw new Error("Los .doc antiguos no se pueden leer; guárdalo como .docx o PDF");
  if (file.type.startsWith("image/")) return imageToText(file, onProgress);
  if (ext === "csv") return csvToText(await file.text());
  return file.text();
}

async function pdfToText(file, onProgress) {
  await loadScript("pdfjs");
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress(`Leyendo página ${p} de ${pdf.numPages}…`);
    const content = await (await pdf.getPage(p)).getTextContent();
    // Agrupa por renglón usando la coordenada Y
    const rows = [];
    content.items.forEach((it) => {
      if (!it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x: it.transform[4], s: it.str });
    });
    rows.sort((a, b) => b.y - a.y).forEach((r) => out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim()));
    out.push("");
  }
  const text = out.join("\n").trim();
  if (!text) throw new Error("El PDF no tiene texto (parece escaneado). Súbelo como imagen para leerlo con OCR.");
  return text;
}

async function sheetToText(file) {
  await loadScript("xlsx");
  const X = window.XLSX;
  const wb = X.read(await file.arrayBuffer(), { type: "array" });
  return wb.SheetNames.map((n) => {
    const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: "" });
    return rowsToText(rows);
  }).join("\n\n").trim();
}
function csvToText(csv) {
  const sep = (csv.split("\n")[0].match(/;/g) || []).length > (csv.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const rows = csv.replace(/^﻿/, "").split(/\r?\n/).map((l) => {
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { cells.push(cur); cur = ""; } else cur += c;
    }
    cells.push(cur); return cells;
  });
  return rowsToText(rows);
}
// Filas de tabla → renglones "Celda1: celda2 celda3"
const HEADER_RX = /^(d[ií]as?|ejercicios?|series|reps|repeticiones|peso|carga|descanso|comidas?|alimentos?|porci[oó]n|porciones|cantidad|hora|horario|notas?|tiempo|tempo|rir|rpe|grupo muscular|m[uú]sculo)$/i;
function rowsToText(rows) {
  const clean = rows.map((r) => r.map((c) => String(c).trim()).filter(Boolean)).filter((r) => r.length);
  // Quita la fila de encabezados de la tabla (Día | Ejercicio | Series…)
  if (clean.length > 1 && clean[0].length > 1 && clean[0].every((c) => HEADER_RX.test(c))) clean.shift();
  return clean
    .map((r) => (r.length > 1 ? `${r[0]}: ${r.slice(1).join(" — ")}` : r[0]))
    .join("\n");
}

async function imageToText(file, onProgress) {
  onProgress("Cargando lector de imágenes (OCR)…");
  await loadScript("tesseract");
  const { data } = await window.Tesseract.recognize(file, "spa", {
    logger: (m) => m.status === "recognizing text" && onProgress(`Leyendo imagen… ${Math.round(m.progress * 100)}%`),
  });
  return data.text.trim();
}

/* ================= ACOMODAR TEXTO EN RUTINA / DIETA ================= */
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DAY_RX = /^\s*[*#\-•\s]*(lunes|martes|miercoles|jueves|viernes|sabado|domingo|dia\s*([1-7]))\b\s*[:.\-–—)]?\s*/i;

// Encabezado que manda el texto siguiente a Notas / Indicaciones
const NOTES_RX = /^\s*[*#\-•\s]*(notas?|observaciones|indicaciones|recomendaciones|importante)\b\s*[:.\-–—)]?\s*/i;

/** Reparte el texto por días si encuentra encabezados "Lunes", "Día 1", etc. */
export function parseRoutine(text) {
  const days = {}; const notes = []; let cur = null; let found = false;
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.normalize("NFC").trim(); // NFC: misma longitud que su versión sin acentos
    if (!line) return;
    const m = norm(line).match(DAY_RX);
    if (m) {
      found = true;
      cur = m[2] ? DAYS_ORDER[Number(m[2]) - 1] : m[1];
      const rest = line.slice(m[0].length).trim();
      if (rest && !/^descanso$/i.test(rest)) (days[cur] ||= []).push(rest.replace(/^[—–-]\s*/, ""));
      return;
    }
    const n = line.match(NOTES_RX);
    if (n) { cur = null; const rest = line.slice(n[0].length).trim(); if (rest) notes.push(rest); return; }
    const clean = line.replace(/^[•*\-–]\s*/, "");
    if (cur) (days[cur] ||= []).push(clean); else notes.push(clean);
  });
  return { found, days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, v.join("\n")])), notes: notes.join("\n") };
}

const MEAL_RX = /^\s*[*#\-•\s]*(desayuno|colaci[oó]n(?:\s*\d)?|media\s+ma[nñ]ana|almuerzo|comida\s*\d|comida|merienda|cena|snack(?:\s*\d)?|pre[\s-]?entreno|post[\s-]?entreno|antes de dormir)\b\s*[:.\-–—)]?\s*/i;

/** Separa el texto por comidas si encuentra encabezados "Desayuno", "Comida", etc. */
export function parseDiet(text) {
  const meals = []; const notes = []; let cur = null; let calories = "", macros = "";
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.normalize("NFC").trim();
    if (!line) return;
    // 1) Encabezado de comida (antes que kcal/macros: "Desayuno (450 kcal)" sigue siendo comida)
    const m = line.match(MEAL_RX);
    if (m) {
      const name = m[1].replace(/\s+/g, " ");
      cur = { name: name[0].toUpperCase() + name.slice(1).toLowerCase(), text: [] };
      meals.push(cur);
      const rest = line.slice(m[0].length).trim();
      if (rest) cur.text.push(rest.replace(/^[—–-]\s*/, ""));
      return;
    }
    // 2) Calorías y macros totales: solo fuera de una comida o si el renglón lo dice explícitamente
    const kc = line.match(/(\d[\d.,]*)\s*(kcal|calor[ií]as)/i);
    if (kc && !calories && line.length < 60 && (!cur || /^(total|calor|plan|kcal)/i.test(line))) { calories = `${kc[1]} kcal`; return; }
    if (!macros && line.length < 90 && /\d+\s*g/i.test(line) && (/^macros?\b/i.test(line) || (!cur && /prote[ií]na|carbohidrato|grasa/i.test(line)))) {
      macros = line.replace(/^macros?\s*[:\-]\s*/i, ""); return;
    }
    const n = line.match(NOTES_RX);
    if (n) { cur = null; const rest = line.slice(n[0].length).trim(); if (rest) notes.push(rest); return; }
    const clean = line.replace(/^[•*\-–]\s*/, "");
    if (cur) cur.text.push(clean); else notes.push(clean);
  });
  return { found: meals.length > 0, meals: meals.map((m) => ({ name: m.name, text: m.text.join("\n") })), notes: notes.join("\n"), calories, macros };
}
