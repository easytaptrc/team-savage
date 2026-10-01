// Métricas de seguimiento nutricional / fitness (compartido por coach y cliente)
import { esc, fmtDate, lineChart, toDate, parseYmd } from "./ui.js";

/* ---------- Catálogos ---------- */
export const SEXES = [["M", "Hombre"], ["F", "Mujer"]];
export const GOALS = ["Bajar de peso / grasa", "Ganar masa muscular", "Recomposición corporal", "Mejorar condición física", "Rendimiento deportivo", "Salud y bienestar", "Rehabilitación / movilidad"];
export const ACTIVITY = [
  ["sedentario", "Sedentario (poco o nada de ejercicio)", 1.2],
  ["ligero", "Ligero (1–3 días/semana)", 1.375],
  ["moderado", "Moderado (3–5 días/semana)", 1.55],
  ["intenso", "Intenso (6–7 días/semana)", 1.725],
  ["muy_intenso", "Muy intenso (doble sesión / trabajo físico)", 1.9],
];
export const EXPERIENCE = ["Principiante", "Intermedio", "Avanzado"];

/* Campos de cada registro de progreso. `leg` se conserva como clave de muslo por compatibilidad. */
export const METRIC_GROUPS = [
  { title: "Composición corporal", fields: [
    ["weight", "Peso", "kg"], ["fat", "% Grasa", "%"], ["muscle", "Masa muscular", "kg"],
    ["visceral", "Grasa visceral", "nivel"], ["water", "Agua corporal", "%"], ["bone", "Masa ósea", "kg"], ["metaAge", "Edad metabólica", "años"],
  ] },
  { title: "Medidas (cm)", fields: [
    ["neck", "Cuello", "cm"], ["chest", "Pecho", "cm"], ["waist", "Cintura", "cm"], ["abdomen", "Abdomen", "cm"], ["hip", "Cadera", "cm"],
    ["arm", "Brazo relajado", "cm"], ["armFlex", "Brazo contraído", "cm"], ["leg", "Muslo", "cm"], ["calf", "Pantorrilla", "cm"],
  ] },
  { title: "Salud", fields: [
    ["bpSys", "Presión sistólica", "mmHg"], ["bpDia", "Presión diastólica", "mmHg"], ["hr", "FC en reposo", "lpm"], ["glucose", "Glucosa", "mg/dL"],
  ] },
  { title: "Seguimiento semanal", fields: [
    ["adhDiet", "Apego a la dieta", "/10"], ["adhTrain", "Apego al entrenamiento", "/10"], ["energy", "Energía", "/10"],
    ["sleep", "Sueño", "h"], ["waterL", "Agua tomada", "L"], ["steps", "Pasos diarios", ""],
  ] },
];
export const METRIC_FIELDS = METRIC_GROUPS.flatMap((g) => g.fields);
// Métricas calculadas
export const DERIVED = [["imc", "IMC", ""], ["fatKg", "Masa grasa", "kg"], ["leanKg", "Masa magra", "kg"], ["icc", "Índice cintura-cadera", ""], ["ica", "Índice cintura-estatura", ""]];
export const CHARTABLE = [["weight", "Peso", "kg"], ["imc", "IMC", ""], ["fat", "% Grasa", "%"], ["muscle", "Músculo", "kg"], ["waist", "Cintura", "cm"], ["hip", "Cadera", "cm"],
  ["chest", "Pecho", "cm"], ["arm", "Brazo", "cm"], ["leg", "Muslo", "cm"], ["visceral", "Visceral", ""], ["fatKg", "Masa grasa", "kg"], ["leanKg", "Masa magra", "kg"]];
const LABEL = Object.fromEntries([...METRIC_FIELDS, ...DERIVED].map(([k, l, u]) => [k, { l, u }]));
// En estas métricas "bajar" es lo deseable (para colorear la diferencia)
const LOWER_IS_BETTER = new Set(["fat", "visceral", "waist", "abdomen", "hip", "fatKg", "icc", "ica", "bpSys", "bpDia", "hr", "glucose", "metaAge"]);

/* ---------- Cálculos ---------- */
const num = (v) => (v === "" || v == null || isNaN(v) ? null : Number(v));
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

export function ageOf(m) {
  if (m?.birth) {
    const b = parseYmd(m.birth), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a >= 0 && a < 120 ? a : null;
  }
  return num(m?.age);
}
export const bmi = (w, hCm) => (w && hCm ? r1(w / (hCm / 100) ** 2) : null);
export function bmiCategory(v) {
  if (v == null) return { t: "—", c: "" };
  if (v < 18.5) return { t: "Bajo peso", c: "warn" };
  if (v < 25) return { t: "Peso normal", c: "ok" };
  if (v < 30) return { t: "Sobrepeso", c: "warn" };
  if (v < 35) return { t: "Obesidad I", c: "err" };
  if (v < 40) return { t: "Obesidad II", c: "err" };
  return { t: "Obesidad III", c: "err" };
}
export function fatCategory(fat, sex) {
  if (fat == null) return "";
  const t = sex === "F" ? [21, 25, 32] : [14, 18, 25];
  return fat < t[0] ? "Atlético" : fat < t[1] ? "Fitness" : fat < t[2] ? "Promedio" : "Elevado";
}
export function iccRisk(icc, sex) {
  if (icc == null) return "";
  const lim = sex === "F" ? 0.85 : 0.9;
  return icc > lim ? "Riesgo cardiometabólico elevado" : "Riesgo bajo";
}
// Mifflin-St Jeor
export function bmr(m, weight) {
  const w = num(weight), h = num(m?.height), a = ageOf(m);
  if (!w || !h || a == null) return null;
  return Math.round(10 * w + 6.25 * h - 5 * a + (m.sex === "F" ? -161 : 5));
}
export function tdee(m, weight) {
  const b = bmr(m, weight);
  const f = ACTIVITY.find((x) => x[0] === m?.activity)?.[2];
  return b && f ? Math.round(b * f) : null;
}
export function idealWeightRange(hCm) {
  if (!hCm) return null;
  const h2 = (hCm / 100) ** 2;
  return [r1(18.5 * h2), r1(24.9 * h2)];
}

/* Completa un registro con sus valores calculados */
export function enrich(p, m) {
  const o = { ...p };
  const h = num(p.height) || num(m?.height);
  o.imc = num(p.weight) ? bmi(num(p.weight), h) : null;
  if (num(p.weight) && num(p.fat)) { o.fatKg = r1((p.weight * p.fat) / 100); o.leanKg = r1(p.weight - o.fatKg); }
  if (num(p.waist) && num(p.hip)) o.icc = r2(p.waist / p.hip);
  if (num(p.waist) && h) o.ica = r2(p.waist / h);
  return o;
}

export function latestOf(prog, key) {
  for (let i = prog.length - 1; i >= 0; i--) if (num(prog[i][key]) != null) return { v: num(prog[i][key]), date: prog[i].date };
  return null;
}
export function firstOf(prog, key) {
  for (const p of prog) if (num(p[key]) != null) return { v: num(p[key]), date: p.date };
  return null;
}

/* ---------- Bloques de interfaz ---------- */
const fmt = (v, u = "") => (v == null ? "—" : `${Number(v).toLocaleString("es-MX", { maximumFractionDigits: 2 })}${u && u !== "/10" ? " " + u : u}`);

/** Tarjetas de resumen: peso, IMC, grasa, objetivo, TMB/GET */
export function summaryHTML(m, progRaw) {
  const prog = progRaw.map((p) => enrich(p, m));
  const w = latestOf(prog, "weight"), w0 = firstOf(prog, "weight");
  const imc = latestOf(prog, "imc") || (m.height && m.initWeight ? { v: bmi(m.initWeight, m.height) } : null);
  const fat = latestOf(prog, "fat"), waist = latestOf(prog, "waist"), muscle = latestOf(prog, "muscle");
  const cat = bmiCategory(imc?.v);
  const goal = num(m.goalWeight);
  const toGoal = w && goal ? r1(w.v - goal) : null;
  const curW = w?.v ?? num(m.initWeight);
  const B = bmr(m, curW), T = tdee(m, curW);
  const ideal = idealWeightRange(num(m.height));
  const delta = w && w0 && w.date !== w0.date ? r1(w.v - w0.v) : null;
  const card = (label, value, sub = "", cls = "") => `<div class="mcard ${cls}"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
  return `<div class="mcards">
    ${card("Peso actual", fmt(curW, "kg"), delta != null ? `${delta > 0 ? "+" : ""}${delta} kg desde el inicio` : w ? fmtDate(w.date) : "Peso inicial")}
    ${card("IMC", fmt(imc?.v), cat.t, cat.c ? "m-" + cat.c : "")}
    ${card("% Grasa", fmt(fat?.v, "%"), fatCategory(fat?.v, m.sex))}
    ${card("Masa muscular", fmt(muscle?.v, "kg"), muscle ? fmtDate(muscle.date) : "")}
    ${card("Cintura", fmt(waist?.v, "cm"), waist ? fmtDate(waist.date) : "")}
    ${card("Peso objetivo", fmt(goal, "kg"), toGoal != null ? (toGoal === 0 ? "¡Objetivo logrado!" : `Faltan ${Math.abs(toGoal)} kg`) : "")}
    ${card("Metabolismo basal", B ? `${B} kcal` : "—", B ? "Mifflin-St Jeor" : "Falta edad, sexo o estatura")}
    ${card("Gasto diario (GET)", T ? `${T} kcal` : "—", T ? (ACTIVITY.find((x) => x[0] === m.activity)?.[1].split(" (")[0] || "") : "Falta nivel de actividad")}
    ${ideal ? card("Peso saludable", `${ideal[0]}–${ideal[1]} kg`, `IMC 18.5–24.9 · ${m.height} cm`) : ""}
  </div>`;
}

/** Selector de métrica + gráfica */
export function chartBlockHTML() {
  return `<div class="seg scroll" data-metrics>${CHARTABLE.map(([k, l]) => `<button type="button" data-metric="${k}">${l}</button>`).join("")}</div><div data-chart></div>`;
}
export function bindChart(root, m, progRaw, initial = "weight") {
  const prog = progRaw.map((p) => enrich(p, m));
  const draw = (k) => {
    const [, , u] = CHARTABLE.find((x) => x[0] === k);
    root.querySelector("[data-chart]").innerHTML = lineChart(
      prog.filter((p) => num(p[k]) != null).slice(-16).map((p) => ({ label: fmtDate(p.date).slice(0, 6), v: num(p[k]) })),
      { goal: k === "weight" && num(m.goalWeight) ? num(m.goalWeight) : null, unit: u ? " " + u : "" });
    root.querySelectorAll("[data-metric]").forEach((b) => b.classList.toggle("on", b.dataset.metric === k));
  };
  root.querySelectorAll("[data-metric]").forEach((b) => (b.onclick = () => draw(b.dataset.metric)));
  draw(initial);
}

/** Tabla inicial vs actual */
export function comparisonHTML(m, progRaw) {
  const prog = progRaw.map((p) => enrich(p, m));
  const keys = ["weight", "imc", "fat", "fatKg", "leanKg", "muscle", "visceral", "water", "waist", "abdomen", "hip", "chest", "neck", "arm", "armFlex", "leg", "calf", "icc", "ica"];
  const rows = keys.map((k) => {
    const a = firstOf(prog, k), b = latestOf(prog, k);
    if (!a || !b) return "";
    const d = r2(b.v - a.v);
    const good = d === 0 ? "" : (d < 0) === LOWER_IS_BETTER.has(k) || (k === "weight" && m.goalWeight && Math.abs(b.v - m.goalWeight) < Math.abs(a.v - m.goalWeight)) ? "up" : "down";
    const cls = k === "weight" && !m.goalWeight ? "" : good;
    return `<tr><td>${LABEL[k].l}</td><td>${fmt(a.v, LABEL[k].u)}</td><td>${fmt(b.v, LABEL[k].u)}</td><td class="delta ${cls}">${d > 0 ? "+" : ""}${fmt(d)}</td></tr>`;
  }).join("");
  if (!rows) return `<p class="muted">Se mostrará cuando haya registros.</p>`;
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Métrica</th><th>Inicial</th><th>Actual</th><th>Cambio</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${(() => { const i = latestOf(prog, "icc"); return i ? `<p class="small muted mt-s">ICC ${i.v}: ${iccRisk(i.v, m.sex)}</p>` : ""; })()}`;
}

/** Historial completo (solo columnas con datos) */
export function historyHTML(m, progRaw, { actions = false } = {}) {
  const prog = progRaw.map((p) => enrich(p, m)).slice().reverse();
  const cols = [...METRIC_FIELDS.slice(0, 1), ["imc", "IMC", ""], ...METRIC_FIELDS.slice(1), ["icc", "ICC", ""]].filter(([k]) => prog.some((p) => num(p[k]) != null));
  if (!prog.length) return `<p class="muted center pad">Sin registros</p>`;
  return `<div class="table-wrap"><table class="table nowrap"><thead><tr><th>Fecha</th>${cols.map(([, l, u]) => `<th>${l}${u && u !== "/10" ? ` <small>(${u})</small>` : ""}</th>`).join("")}<th>Notas</th>${actions ? "<th></th>" : ""}</tr></thead>
    <tbody>${prog.map((p) => `<tr><td>${fmtDate(p.date)}${p.by === "member" ? ` <span class="tag">Cliente</span>` : ""}</td>${cols.map(([k]) => `<td>${num(p[k]) ?? "—"}</td>`).join("")}
      <td class="muted small wrap-cell">${esc(p.note || "")}</td>
      ${actions ? `<td class="actions"><button class="icon-btn sm" data-ed="${p.id}" title="Editar">✎</button><button class="icon-btn sm danger" data-dp="${p.id}" title="Eliminar">✕</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

/** Antes / ahora por tipo de foto */
export function beforeAfterHTML(photos) {
  const byLabel = {};
  photos.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => (byLabel[p.label || "Otra"] ||= []).push(p));
  const pairs = Object.entries(byLabel).filter(([, l]) => l.length > 1);
  if (!pairs.length) return "";
  return `<div class="ba-grid">${pairs.map(([label, l]) => `<div class="ba"><h4>${esc(label)}</h4><div class="ba-pair">
    <figure><img src="${l[0].data}" alt=""><figcaption>Antes · ${fmtDate(l[0].date)}</figcaption></figure>
    <figure><img src="${l.at(-1).data}" alt=""><figcaption>Ahora · ${fmtDate(l.at(-1).date)}</figcaption></figure></div></div>`).join("")}</div>`;
}

/** Ficha general del cliente (solo lectura) */
export function profileFactsHTML(m) {
  const act = ACTIVITY.find((x) => x[0] === m.activity)?.[1];
  const facts = [
    ["Edad", ageOf(m) != null ? `${ageOf(m)} años` : ""], ["Sexo", SEXES.find((s) => s[0] === m.sex)?.[1]], ["Estatura", m.height ? `${m.height} cm` : ""],
    ["Peso inicial", m.initWeight ? `${m.initWeight} kg` : ""], ["Masa muscular inicial", m.initMuscle ? `${m.initMuscle} kg` : ""], ["% Grasa inicial", m.initFat ? `${m.initFat} %` : ""], ["Objetivo", [m.goal, m.goalDetail].filter(Boolean).join(" — ")], ["Peso objetivo", m.goalWeight ? `${m.goalWeight} kg` : ""],
    ["Actividad física", act], ["Experiencia", m.experience], ["Servicio", m.service], ["Días para entrenar", m.trainingDays], ["Horario preferido", m.preferredTime],
    ["Ocupación", m.occupation], ["Lesiones", m.injuries], ["Enfermedades", m.conditions], ["Medicamentos", m.medications], ["Alergias / intolerancias", m.allergies],
    ["Cirugías", m.surgeries], ["Horas de sueño", m.sleepHours], ["Agua al día", m.waterIntake], ["Alcohol", m.alcohol], ["Tabaco", m.smoking],
    ["Comidas al día", m.mealsPerDay], ["Preferencias alimentarias", m.foodPrefs], ["Suplementos", m.supplements],
    ["Contacto de emergencia", [m.emergencyName, m.emergencyPhone].filter(Boolean).join(" · ")], ["Correo", m.email],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  return facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>` : `<p class="muted">Sin ficha registrada.</p>`;
}

/** Formulario de registro de progreso (coach o cliente) */
export function progressFormHTML({ simple = false } = {}) {
  const groups = simple
    ? [{ title: "Mi registro", fields: [["weight", "Peso", "kg"], ["waist", "Cintura", "cm"], ["hip", "Cadera", "cm"], ["energy", "Energía", "/10"], ["sleep", "Sueño", "h"], ["adhDiet", "Apego a la dieta", "/10"], ["adhTrain", "Apego al entrenamiento", "/10"], ["waterL", "Agua tomada", "L"]] }]
    : METRIC_GROUPS;
  return groups.map((g, gi) => `<details class="fgroup" ${gi === 0 ? "open" : ""}><summary>${g.title}</summary>
    <div class="grid3">${g.fields.map(([k, l, u]) => `<label class="field"><span>${l}${u ? ` <em>(${u})</em>` : ""}</span><input class="inp" type="number" step="any" inputmode="decimal" name="${k}" ${u === "/10" ? 'min="0" max="10"' : ""}></label>`).join("")}</div></details>`).join("");
}
export function readProgressForm(f, fields = METRIC_FIELDS) {
  const d = {};
  fields.forEach(([k]) => { if (f[k]) d[k] = f[k].value === "" ? null : Number(f[k].value); });
  return d;
}
