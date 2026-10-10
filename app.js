import * as core from "./core.js";
import { t, setLang, getLang, other, fmtShort, fmtLong, fmtDay, fmtWeekday, fmtMonth, greetingKey } from "./i18n.js";
import { firebaseConfig } from "./firebase-config.js";

// Same key as v1 so existing data loads; the raw v1 value is copied once to BACKUP_KEY before
// it is first rewritten in the v2 shape.
const STORAGE_KEY = "xy-period-tracker-pwa-v1";
const BACKUP_KEY = "xy-period-tracker-pwa-v1-backup-before-v2";
const PREP_ITEMS = ["pads", "liners", "relief"];

const app = document.querySelector("#app");
const phone = document.querySelector(".phone");
const sheetRoot = document.querySelector("#sheetRoot");
const toastEl = document.querySelector("#toast");
const importInput = document.querySelector("#importFile");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = loadState();
let view = "home";
let sheet = null;
let sheetOpener = null;
let showHow = false;
let calendarNeedsScroll = true;
setLang(state.language);

// ---------- storage ----------

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked: start empty */ }
  if (!raw) return core.emptyState();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && !parsed.schema) {
      try { if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw); } catch { /* ignore */ }
    }
    return core.normalize(parsed);
  } catch {
    return core.emptyState();
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}

function commit(next, toastKey) {
  state = core.normalize(next);
  persist();
  queuePush();
  render();
  if (toastKey) showToast(t(toastKey));
}

// ---------- helpers ----------

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const dayNum = (iso) => Number(iso.slice(8, 10));
const langAttr = (code) => (code === "zh" ? "zh-Hans" : "en");

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

// ---------- render ----------

function render() {
  phone.dataset.view = view;
  app.className = `app view-${view}`;
  const views = { home: renderHome, cycles: renderCycles, calendar: renderCalendar, settings: renderSettings };
  app.innerHTML = views[view]();
  renderNav();
  if (view === "calendar" && calendarNeedsScroll) {
    calendarNeedsScroll = false;
    scrollToMonth(core.todayIso().slice(0, 7), false);
  }
  renderSheet();
}

function renderNav() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-label]").forEach((node) => { node.textContent = t(node.dataset.label); });
  document.querySelector(".nav-add").setAttribute("aria-label", t("nav.add"));
}

function setView(next) {
  view = next;
  sheet = null;
  showHow = false;
  if (next === "calendar") calendarNeedsScroll = true;
  app.scrollTop = 0;
  render();
  app.querySelector("h1")?.focus({ preventScroll: true });
}

// ---------- home ----------

function statusCopy(st) {
  const p = st.pred;
  switch (st.kind) {
    case "empty":
      return { label: "", head: t("status.empty.head"), sub: t("status.empty.sub") };
    case "learning":
      return {
        label: t("status.cycleDay", { n: st.cycleDay }),
        head: t("status.learning.head", { n: Math.max(1, 3 - state.periods.length) }),
        sub: t("status.learning.sub"),
      };
    case "waiting":
      return {
        label: t("status.cycleDay", { n: st.cycleDay }),
        head: st.daysToPrep === 1 ? t("status.waiting.head1") : t("status.waiting.head", { n: st.daysToPrep }),
        sub: t("status.waiting.sub", { date: fmtShort(p.earliest) }),
      };
    case "prep":
      return {
        label: t("status.cycleDay", { n: st.cycleDay }),
        head: t("status.prep.head"),
        sub: st.daysToWindow === 1 ? t("status.prep.sub1", { date: fmtShort(p.earliest) }) : t("status.prep.sub", { n: st.daysToWindow, date: fmtShort(p.earliest) }),
      };
    case "window":
      return {
        label: t("status.cycleDay", { n: st.cycleDay }),
        head: t("status.window.head"),
        sub: t("status.window.sub", { d: st.windowDay, l: st.windowLength, start: fmtShort(p.earliest), end: fmtShort(p.latest) }),
      };
    case "late":
      return {
        label: t("status.cycleDay", { n: st.cycleDay }),
        head: st.daysLate === 1 ? t("status.late.head1") : t("status.late.head", { n: st.daysLate }),
        sub: t("status.late.sub"),
      };
    case "period":
    default:
      // During a period, cycle day and period day are the same number: show it once.
      return { label: "", head: t("status.period.head", { n: st.day }), sub: t("status.period.sub") };
  }
}

function rangeText(pred) {
  if (pred.level === "rough") return t("range.rough", { n: pred.count });
  return pred.steady ? t("range.steady", { n: pred.count }) : t("range.variable", { n: pred.count });
}

function ringSvg(st, pred, today) {
  const R = 100;
  const C = 2 * Math.PI * R;
  const last = core.latestPeriod(state);
  const parts = [`<circle class="ring-track" cx="120" cy="120" r="${R}"/>`];
  if (last) {
    let total = 28;
    if (pred.level !== "none") total = Math.max(total, core.daysBetween(last.startDate, pred.latest) + 1);
    total = Math.max(total, st.cycleDay + 2);
    const frac = (d) => Math.min(1, Math.max(0, d / total));
    const arc = (from, to, cls) => {
      const length = Math.max(0, (frac(to) - frac(from)) * C);
      return `<circle class="${cls}" cx="120" cy="120" r="${R}" stroke-dasharray="${length.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-frac(from) * C).toFixed(1)}"/>`;
    };
    if (pred.level !== "none" && st.kind !== "period") {
      parts.push(arc(core.daysBetween(last.startDate, pred.earliest), core.daysBetween(last.startDate, pred.latest) + 1, "ring-window"));
    }
    parts.push(arc(0, st.cycleDay, "ring-elapsed"));
    const bleedDays = core.periodLength(last) ?? Math.min(st.cycleDay, core.daysBetween(last.startDate, today) + 1);
    parts.push(arc(0, bleedDays, "ring-period"));
    const angle = frac(st.cycleDay - 0.5) * 2 * Math.PI;
    parts.push(`<circle class="ring-today" cx="${(120 + R * Math.cos(angle)).toFixed(1)}" cy="${(120 + R * Math.sin(angle)).toFixed(1)}" r="8"/>`);
  }
  return `<svg class="ring-svg" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#ff9bb8"/><stop offset="55%" stop-color="#b885ff"/><stop offset="100%" stop-color="#8db8ff"/>
        </linearGradient>
      </defs>
      <g transform="rotate(-90 120 120)">${parts.join("")}</g>
    </svg>`;
}

function renderWeek(today, pred) {
  return Array.from({ length: 7 }, (_, index) => {
    const iso = core.addDays(today, index - 3);
    const info = core.dayInfo(state, iso, today, pred);
    const cls = [info.period && "period", info.predicted && "predicted", info.today && "today", info.hasNote && "has-note"].filter(Boolean).join(" ");
    const extra = [info.today && t("legend.today"), info.period && t("legend.period"), info.predicted && t("legend.predicted"), info.hasNote && t("legend.note")].filter(Boolean);
    return `<button class="date-pill ${cls}" type="button" data-action="open-day" data-date="${iso}" ${info.future ? "disabled" : ""}
        aria-label="${esc([fmtDay(iso), ...extra].join(" · "))}">
        <small>${esc(fmtWeekday(iso))}</small><strong>${dayNum(iso)}</strong></button>`;
  }).join("");
}

function prepCard(st) {
  const last = core.latestPeriod(state);
  const key = last?.startDate || "";
  const done = state.prep.cycleStart === key ? state.prep.done : [];
  const emphasis = ["prep", "window", "late"].includes(st.kind);
  const allDone = PREP_ITEMS.every((item) => done.includes(item));
  return `<article class="prep-card glass${emphasis ? " emphasis" : ""}">
      <div class="card-head"><h2>${t("prep.title")}</h2>${allDone ? `<span class="done-tag">${t("prep.done")}</span>` : ""}</div>
      <div class="chips">${PREP_ITEMS.map((item) => `<button class="chip" type="button" data-action="prep-toggle" data-value="${item}" aria-pressed="${done.includes(item)}">${t(`prep.${item}`)}</button>`).join("")}</div>
    </article>`;
}

function renderHome() {
  const today = core.todayIso();
  const st = core.getStatus(state, today);
  const pred = st.pred || core.predict(state);
  const copy = statusCopy(st);
  const problems = core.findProblems(state, today);
  const open = core.openPeriod(state);
  const last = core.latestPeriod(state);
  const stats = core.getStats(state);
  const primaryKey = open ? "action.end" : "action.start";
  const excluded = core.getCycles(state).filter((c) => !c.counted).length;
  const showRange = pred.level !== "none" && !["empty", "learning", "period"].includes(st.kind);
  const how = showRange
    ? [t("how.text", { n: pred.count, min: pred.min, max: pred.max, date: fmtShort(pred.last.startDate) }),
       pred.level === "rough" ? t("how.rough", { n: pred.count }) : "",
       excluded ? t("how.excluded", { n: excluded }) : ""].filter(Boolean).join(" ")
    : "";
  const usual = pred.level !== "none"
    ? (pred.min === pred.max ? t("stat.usualOne", { a: pred.min }) : t("stat.usualValue", { a: pred.min, b: pred.max }))
    : t("stat.none");

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${esc(fmtDay(today))}</p>
        <h1 tabindex="-1">${t(greetingKey(new Date().getHours()))}</h1>
      </div>
      <span class="moon-inline" aria-hidden="true"></span>
      <button class="language-pill" type="button" data-action="toggle-language" aria-label="${t("lang.toggleLabel")}" lang="${langAttr(other())}">${t("lang.toggle")}</button>
    </header>

    <section class="cycle-card glass" aria-labelledby="statusHead">
      ${problems.length ? `<button class="problem-banner" type="button" data-action="goto-cycles"><span>${t("problems.banner", { n: problems.length })}</span><span class="link">${t("problems.open")}${ICON_CHEVRON}</span></button>` : ""}
      <div class="ring-wrap">
        ${ringSvg(st, pred, today)}
        <div class="ring-center">
          ${copy.label ? `<span class="ring-label">${copy.label}</span>` : ""}
          <h2 class="ring-head" id="statusHead">${copy.head}</h2>
        </div>
      </div>
      <p class="status-sub">${copy.sub}</p>
      ${showRange ? `<div class="range-row">
          <span class="range-chip">${rangeText(pred)}</span>
          <button class="text-button" type="button" data-action="toggle-how" aria-expanded="${showHow}" aria-controls="howText">${t("how.button")}</button>
        </div>
        <p class="how" id="howText" ${showHow ? "" : "hidden"}>${how}</p>` : ""}
      ${st.kind === "period" && st.long ? `<div class="notice"><p>${t("status.period.long")}</p><button class="soft-button small" type="button" data-action="edit-period" data-id="${esc(st.open.id)}">${t("status.period.fix")}</button></div>` : ""}
      <button class="primary-action" type="button" data-action="${open ? "end-period" : "start-period"}">
        <strong>${t(primaryKey)}</strong><span lang="${langAttr(other())}">${t(primaryKey, {}, other())}</span>
      </button>
      <button class="text-button center" type="button" data-action="open-day">${t("action.logOther")}</button>
      <div class="week-row" role="group" aria-label="${t("week.label")}">${renderWeek(today, pred)}</div>
    </section>

    <section class="section-block">
      ${prepCard(st)}
      <div class="stat-grid">
        <article class="stat glass">
          <span>${t("stat.last")}</span>
          <strong>${last ? esc(fmtShort(last.startDate)) : t("stat.none")}</strong>
          <small>${last ? (core.periodLength(last) ? t("stat.lastMeta", { n: core.periodLength(last) }) : last.endDate ? "" : t("stat.lastOpen")) : ""}</small>
        </article>
        <article class="stat glass">
          <span>${t("stat.usual")}</span>
          <strong>${usual}</strong>
          <small>${pred.level !== "none" ? `${t("stats.average")} ${t("stats.days", { n: stats.average })}` : t("stat.needMore")}</small>
        </article>
      </div>
    </section>`;
}

// ---------- sheets (day log + period editor) ----------

function draftFor(iso) {
  const note = core.notesOn(state, iso)[0];
  return { noteId: note?.id || null, flow: note?.flow || "", pain: note?.pain ?? null, symptoms: new Set(note?.symptoms || []), note: note?.note || "" };
}

function openDay(date) {
  const today = core.todayIso();
  const iso = date && date <= today ? date : today;
  sheetOpener = document.activeElement;
  sheet = { type: "day", date: iso, confirm: false, error: "", ...draftFor(iso) };
  renderSheet();
  focusSheet();
}

function openPeriodEditor(id) {
  const period = id ? state.periods.find((p) => p.id === id) : null;
  sheetOpener = document.activeElement;
  sheet = {
    type: "period",
    id: period?.id || null,
    createdAt: period?.createdAt || "",
    start: period?.startDate || "",
    end: period && !period.badEnd ? period.endDate : "",
    ongoing: period ? !period.endDate : false,
    mode: period?.cycleMode || "auto",
    confirm: false,
    error: "",
  };
  renderSheet();
  focusSheet();
}

function closeSheet() {
  sheet = null;
  renderSheet();
  if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
  sheetOpener = null;
}

function focusSheet() {
  sheetRoot.querySelector("#sheetTitle")?.focus({ preventScroll: true });
}

function renderSheet(focusSelector) {
  if (!sheet) {
    sheetRoot.innerHTML = "";
    sheetRoot.classList.remove("open");
    phone.classList.remove("sheet-open");
    app.inert = false;
    return;
  }
  sheetRoot.classList.add("open");
  phone.classList.add("sheet-open");
  app.inert = true;
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      ${sheet.type === "day" ? daySheet() : periodSheet()}
    </section>`;
  if (focusSelector) sheetRoot.querySelector(focusSelector)?.focus({ preventScroll: true });
}

function sheetHead(title) {
  return `<div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 id="sheetTitle" tabindex="-1">${title}</h2>
      <button class="icon-btn" type="button" data-action="close-sheet" aria-label="${t("sheet.close")}">${ICON_CLOSE}</button>
    </div>`;
}

const pressed = (on) => `aria-pressed="${on ? "true" : "false"}"`;

function daySheet() {
  const today = core.todayIso();
  const d = sheet.date;
  const recent = Array.from({ length: 7 }, (_, i) => core.addDays(today, -i));
  const period = core.periodOn(state, d, today);
  const dateLabel = (iso, i) => (i === 0 ? t("sheet.today") : i === 1 ? t("sheet.yesterday") : `${fmtWeekday(iso)} ${dayNum(iso)}`);

  let periodHtml;
  if (period) {
    const n = core.daysBetween(period.startDate, d) + 1;
    periodHtml = `<p class="sheet-status period-on">${t("sheet.inPeriod", { n })}</p>
      <div class="button-row">
        ${!period.endDate ? `<button class="soft-button" type="button" data-action="end-at">${t("sheet.endHere")}</button>` : ""}
        <button class="plain-button" type="button" data-action="edit-period" data-id="${esc(period.id)}">${t("sheet.editPeriod")}</button>
      </div>`;
  } else {
    periodHtml = `<p class="sheet-status">${t("sheet.noPeriod")}</p>
      <div class="button-row"><button class="soft-button accent" type="button" data-action="start-at">${t("sheet.startHere")}</button></div>`;
  }

  return `${sheetHead(esc(fmtDay(d)))}
    <div class="sheet-body">
      <div class="date-chips" role="group" aria-label="${t("sheet.title")}">
        ${recent.map((iso, i) => `<button class="chip" type="button" data-action="sheet-date" data-value="${iso}" ${pressed(iso === d)}>${esc(dateLabel(iso, i))}</button>`).join("")}
        <label class="date-other"><span>${t("sheet.earlier")}</span><input type="date" id="sheetDate" max="${today}" value="${d}"></label>
      </div>

      <section class="sheet-section" aria-labelledby="secPeriod">
        <h3 id="secPeriod">${t("sheet.period")}</h3>
        ${periodHtml}
      </section>

      <section class="sheet-section" aria-labelledby="secFlow">
        <h3 id="secFlow">${t("sheet.flow")}</h3>
        <div class="chips" role="group" aria-labelledby="secFlow">
          ${core.FLOWS.map((f) => `<button class="chip" type="button" data-action="set-flow" data-value="${f}" ${pressed(sheet.flow === f)}>${t(`flow.${f}`)}</button>`).join("")}
        </div>
      </section>

      <section class="sheet-section" aria-labelledby="secPain">
        <h3 id="secPain">${t("sheet.pain")} <small>${t("pain.hint")}</small></h3>
        <div class="segmented" role="group" aria-labelledby="secPain">
          ${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" data-action="set-pain" data-value="${n}" ${pressed(sheet.pain === n)}>${n === 0 ? t("pain.0") : n}</button>`).join("")}
        </div>
      </section>

      <section class="sheet-section" aria-labelledby="secSym">
        <h3 id="secSym">${t("sheet.symptoms")}</h3>
        <div class="chips" role="group" aria-labelledby="secSym">
          ${core.SYMPTOMS.map((s) => `<button class="chip" type="button" data-action="toggle-sym" data-value="${s}" ${pressed(sheet.symptoms.has(s))}>${t(`sym.${s}`)}</button>`).join("")}
        </div>
      </section>

      <section class="sheet-section">
        <label class="field" for="sheetNote"><span>${t("sheet.note")}</span>
          <textarea id="sheetNote" rows="3" placeholder="${t("sheet.notePlaceholder")}">${esc(sheet.note)}</textarea>
        </label>
      </section>

      ${sheet.error ? `<p class="form-error" role="alert">${sheet.error}</p>` : ""}
      <div class="sheet-actions">
        <button class="primary-action compact" type="button" data-action="save-day"><strong>${t("sheet.save")}</strong></button>
        ${sheet.noteId ? `<button class="danger-button" type="button" data-action="delete-day">${sheet.confirm ? t("sheet.confirmDelete") : t("sheet.deleteLog")}</button>` : ""}
      </div>
    </div>`;
}

function periodSheet() {
  const today = core.todayIso();
  const problem = sheet.id ? core.findProblems(state, today).find((p) => p.id === sheet.id) : null;
  const isLatest = sheet.id && core.latestPeriod(state)?.id === sheet.id;
  return `${sheetHead(sheet.id ? t("editor.title") : t("editor.newTitle"))}
    <div class="sheet-body">
      ${problem ? `<p class="notice-text">${t(problem.code)}</p>` : ""}
      <div class="field-row">
        <label class="field" for="editStart"><span>${t("editor.start")}</span>
          <input type="date" id="editStart" max="${today}" value="${esc(sheet.start)}" required></label>
        <label class="field" for="editEnd"><span>${t("editor.end")}</span>
          <input type="date" id="editEnd" max="${today}" value="${esc(sheet.end)}" ${sheet.ongoing ? "disabled" : ""}></label>
      </div>
      <label class="check"><input type="checkbox" id="editOngoing" ${sheet.ongoing ? "checked" : ""}><span>${t("editor.ongoing")}</span></label>
      ${sheet.id && !isLatest ? `<section class="sheet-section" aria-labelledby="secCount">
          <h3 id="secCount">${t("editor.count")}</h3>
          <div class="segmented" role="group" aria-labelledby="secCount">
            ${["auto", "include", "exclude"].map((m) => `<button type="button" data-action="set-mode" data-value="${m}" ${pressed(sheet.mode === m)}>${t(`editor.count.${m}`)}</button>`).join("")}
          </div>
          <p class="help">${t("editor.countHelp")}</p>
        </section>` : ""}
      ${sheet.error ? `<p class="form-error" role="alert">${sheet.error}</p>` : ""}
      <div class="sheet-actions">
        <button class="primary-action compact" type="button" data-action="save-period"><strong>${t("editor.save")}</strong></button>
        ${sheet.id ? `<button class="danger-button" type="button" data-action="delete-period">${sheet.confirm ? t("editor.confirmDelete") : t("editor.delete")}</button>` : ""}
      </div>
    </div>`;
}

// ---------- cycles (history + insights) ----------

function noteSummary(note) {
  return [note.flow ? `${t("sheet.flow")} ${t(`flow.${note.flow}`)}` : "",
    note.pain !== null ? `${t("sheet.pain")} ${note.pain}` : "",
    ...note.symptoms.map((s) => (core.SYMPTOMS.includes(s) ? t(`sym.${s}`) : s)),
    note.note].filter(Boolean).join(" · ");
}

function cycleChart(cycles, pred) {
  const shown = cycles.slice(-8);
  if (!shown.length) return `<p class="body-copy">${t("chart.empty")}</p>`;
  const W = 320;
  const H = 170;
  const top = 18;
  const bottom = 26;
  const yMax = Math.max(45, Math.ceil((Math.max(...shown.map((c) => c.length)) + 5) / 5) * 5);
  const y = (v) => top + (H - top - bottom) * (1 - v / yMax);
  const slot = W / shown.length;
  const barW = Math.min(26, slot * 0.56);
  const band = pred.level !== "none" ? `<rect class="chart-band" x="0" y="${y(pred.max).toFixed(1)}" width="${W}" height="${Math.max(2, y(pred.min) - y(pred.max)).toFixed(1)}"/>` : "";
  const bars = shown.map((c, i) => {
    const x = slot * i + (slot - barW) / 2;
    const cls = c.counted ? "chart-bar" : "chart-bar excluded";
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y(c.length).toFixed(1)}" width="${barW.toFixed(1)}" height="${(y(0) - y(c.length)).toFixed(1)}" rx="5"/>
      <text class="chart-value" x="${(x + barW / 2).toFixed(1)}" y="${(y(c.length) - 5).toFixed(1)}" text-anchor="middle">${c.length}</text>
      <text class="chart-axis" x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(fmtShort(c.from.startDate))}</text>`;
  }).join("");
  const label = shown.map((c) => `${fmtShort(c.from.startDate)}: ${c.length} ${t("chart.days")}${c.counted ? "" : ` (${t("chart.notCounted")})`}`).join(", ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${t("chart.title")}. ${label}`)}">
      ${band}<line class="chart-base" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>${bars}
    </svg>
    ${pred.level !== "none" ? `<p class="chart-legend"><span class="swatch band"></span>${t("chart.usual", { min: pred.min, max: pred.max })}</p>` : ""}`;
}

function dotStrip(days, bleed) {
  const n = Math.min(days, 60);
  return `<span class="dot-strip" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < bleed ? "on" : ""}"></i>`).join("")}</span>`;
}

function renderCycles() {
  const today = core.todayIso();
  const cycles = core.getCycles(state);
  const stats = core.getStats(state);
  const pred = core.predict(state);
  const flags = core.healthFlags(state, today);
  const problems = new Map(core.findProblems(state, today).map((p) => [p.id, p.code]));
  const asc = core.sortedPeriods(state);
  const byFrom = new Map(cycles.map((c) => [c.from.id, c]));
  const fmtStat = (v) => (v === null ? t("stat.none") : t("stats.days", { n: v }));

  const rows = [...asc].reverse().map((p) => {
    const idx = asc.indexOf(p);
    const next = asc[idx + 1];
    const cycle = byFrom.get(p.id);
    const len = core.periodLength(p);
    const span = next ? core.daysBetween(p.startDate, next.startDate) : Math.max(1, core.daysBetween(p.startDate, today) + 1);
    const bleed = len ?? (!p.endDate ? Math.max(1, core.daysBetween(p.startDate, today) + 1) : 1);
    const until = next ? next.startDate : core.addDays(today, 1);
    const notes = state.notes.filter((n) => n.date >= p.startDate && n.date < until).sort((a, b) => (a.date < b.date ? 1 : -1));
    const badges = [
      problems.has(p.id) && `<span class="badge warn">${t("list.problem")}</span>`,
      cycle && cycle.autoExcluded && `<span class="badge">${t("list.missed")}</span>`,
      cycle && !cycle.counted && !cycle.autoExcluded && `<span class="badge">${t("list.notCounted")}</span>`,
    ].filter(Boolean).join("");
    const meta = t("list.meta", {
      p: len ? t("list.days", { n: len }) : !p.endDate ? t("list.open") : t("stat.none"),
      c: cycle ? t("list.days", { n: cycle.length }) : t("list.current"),
    });
    return `<article class="cycle-row glass">
        <button class="cycle-main" type="button" data-action="edit-period" data-id="${esc(p.id)}">
          <span class="cycle-title"><strong>${t("list.started", { date: esc(fmtLong(p.startDate)) })}</strong>${badges}</span>
          <span class="cycle-meta">${meta}</span>
          ${dotStrip(span, bleed)}
          <span class="row-chevron">${ICON_CHEVRON}</span>
        </button>
        ${notes.length ? `<ul class="note-list">${notes.slice(0, 3).map((n) => `<li><button type="button" data-action="open-day" data-date="${n.date}"><span class="note-date">${esc(fmtShort(n.date))}</span><span>${esc(noteSummary(n))}</span></button></li>`).join("")}
          ${notes.length > 3 ? `<li class="more">${t("list.logs", { n: notes.length })}</li>` : ""}</ul>` : ""}
      </article>`;
  }).join("");

  return `
    <header class="page-header">
      <p class="eyebrow">${t("cycles.eyebrow")}</p>
      <h1 tabindex="-1">${t("cycles.title")}</h1>
    </header>
    <section class="form-card glass chart-card" aria-labelledby="chartTitle">
      <h2 id="chartTitle">${t("chart.title")}</h2>
      ${cycleChart(cycles, pred)}
      <dl class="mini-stats">
        <div><dt>${t("stats.shortest")}</dt><dd>${fmtStat(stats.shortest)}</dd></div>
        <div><dt>${t("stats.longest")}</dt><dd>${fmtStat(stats.longest)}</dd></div>
        <div><dt>${t("stats.average")}</dt><dd>${fmtStat(stats.average)}</dd></div>
        <div><dt>${t("stats.period")}</dt><dd>${fmtStat(stats.periodAverage)}</dd></div>
      </dl>
    </section>
    ${flags.length ? `<section class="form-card glass flags-card" aria-labelledby="flagsTitle">
        <h2 id="flagsTitle">${t("flags.title")}</h2>
        <ul class="flag-list">${flags.map((f) => `<li>${t(f)}</li>`).join("")}</ul>
        <p class="help">${t("flags.footer")}</p>
      </section>` : ""}
    <div class="section-title"><h2>${t("list.title")}</h2><button class="text-button" type="button" data-action="add-period">${t("list.add")}</button></div>
    <section class="timeline">${rows || `<article class="event glass"><p>${t("list.empty")}</p></article>`}</section>`;
}

// ---------- calendar ----------

function monthKey(iso) {
  return iso.slice(0, 7);
}

function renderCalendar() {
  const today = core.todayIso();
  const pred = core.predict(state);
  const first = core.sortedPeriods(state)[0]?.startDate;
  let start = core.addDays(`${monthKey(today)}-01`, -62).slice(0, 7);
  if (first && monthKey(first) < start) start = monthKey(first);
  const floor = `${Number(today.slice(0, 4)) - 2}${today.slice(4, 7)}`;
  if (start < floor) start = floor;
  let end = core.addDays(`${monthKey(today)}-01`, 75).slice(0, 7);
  if (pred.level !== "none" && monthKey(pred.latest) > end) end = monthKey(pred.latest);

  const weekdays = t("weekdays").split(",");
  const months = [];
  for (let ym = start; ym <= end;) {
    const [y, m] = ym.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const count = new Date(y, m, 0).getDate();
    const cells = Array.from({ length: offset }, () => `<span class="calendar-day blank" aria-hidden="true"></span>`);
    for (let d = 1; d <= count; d += 1) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      const info = core.dayInfo(state, iso, today, pred);
      const cls = [info.period && "period", info.predicted && "predict", info.today && "today", info.hasNote && "has-note"].filter(Boolean).join(" ");
      const extra = [info.today && t("legend.today"), info.period && t("legend.period"), info.predicted && t("legend.predicted"), info.hasNote && t("legend.note")].filter(Boolean);
      cells.push(`<button class="calendar-day ${cls}" type="button" data-action="open-day" data-date="${iso}" ${info.future ? "disabled" : ""} aria-label="${esc([fmtLong(iso), ...extra].join(" · "))}">${d}</button>`);
    }
    months.push(`<section class="month" data-month="${ym}" aria-label="${esc(fmtMonth(y, m - 1))}">
        <h2>${esc(fmtMonth(y, m - 1))}</h2>
        <div class="calendar-grid">${cells.join("")}</div>
      </section>`);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  return `
    <header class="page-header row">
      <h1 tabindex="-1">${t("cal.title")}</h1>
      <button class="soft-button small" type="button" data-action="cal-today">${t("cal.today")}</button>
    </header>
    <div class="calendar-sticky glass">
      <ul class="legend">
        <li><i class="key period"></i>${t("legend.period")}</li>
        <li><i class="key predict"></i>${t("legend.predicted")}</li>
        <li><i class="key today"></i>${t("legend.today")}</li>
        <li><i class="key note"></i>${t("legend.note")}</li>
      </ul>
      <div class="calendar-grid calendar-head" aria-hidden="true">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
    </div>
    <div class="months">${months.join("")}</div>`;
}

function scrollToMonth(ym, smooth) {
  const target = app.querySelector(`[data-month="${ym}"]`);
  if (!target) return;
  const sticky = app.querySelector(".calendar-sticky");
  const offset = target.offsetTop - (sticky ? sticky.offsetHeight + 12 : 0);
  app.scrollTo({ top: Math.max(0, offset), behavior: smooth && !reduceMotion.matches ? "smooth" : "auto" });
}

// ---------- settings ----------

function renderSettings() {
  const pred = core.predict(state);
  let syncText = t("sync.local");
  let syncButton = `<button class="soft-button" type="button" disabled>${t("sync.notSet")}</button>`;
  if (cloud.ready && cloud.user) {
    syncText = t("sync.signedIn", { email: esc(cloud.user.email || "") });
    syncButton = `<button class="plain-button" type="button" data-action="cloud-auth">${t("sync.signOut")}</button>`;
  } else if (cloud.ready) {
    syncText = t("sync.signedOut");
    syncButton = `<button class="soft-button accent" type="button" data-action="cloud-auth">${t("sync.signIn")}</button>`;
  }
  return `
    <header class="page-header">
      <h1 tabindex="-1">${t("settings.title")}</h1>
    </header>

    <section class="form-card glass" aria-labelledby="setLang">
      <h2 id="setLang">${t("settings.language")}</h2>
      <div class="segmented" role="group" aria-labelledby="setLang">
        <button type="button" data-action="set-lang" data-value="zh" lang="zh-Hans" ${pressed(getLang() === "zh")}>中文</button>
        <button type="button" data-action="set-lang" data-value="en" lang="en" ${pressed(getLang() === "en")}>English</button>
      </div>
    </section>

    <section class="form-card glass" aria-labelledby="setRem">
      <h2 id="setRem">${t("settings.reminders")}</h2>
      <div class="field-row">
        <label class="field" for="prepDays"><span>${t("settings.prepDays")}</span>
          <input type="number" id="prepDays" min="1" max="14" inputmode="numeric" value="${state.settings.prepDays}"></label>
        <label class="field" for="reminderTime"><span>${t("settings.reminderTime")}</span>
          <input type="time" id="reminderTime" value="${state.settings.reminderTime}"></label>
      </div>
      <button class="soft-button" type="button" data-action="save-settings">${t("settings.save")}</button>
    </section>

    <section class="form-card glass" aria-labelledby="setCal">
      <h2 id="setCal">${t("settings.calendar")}</h2>
      <p class="body-copy">${t("settings.calendarBody")}</p>
      ${pred.level === "none" ? `<p class="help">${t("settings.calendarNone")}</p>` : ""}
      <button class="plain-button" type="button" data-action="calendar-ics" ${pred.level === "none" ? "disabled" : ""}>${t("settings.calendarButton")}</button>
    </section>

    <section class="form-card glass" aria-labelledby="setSync">
      <h2 id="setSync">${t("settings.sync")}</h2>
      <p class="body-copy">${syncText}</p>
      ${syncButton}
    </section>

    <section class="form-card glass" aria-labelledby="setBackup">
      <h2 id="setBackup">${t("settings.backup")}</h2>
      <p class="body-copy">${t("settings.backupBody")}</p>
      <div class="button-row">
        <button class="plain-button" type="button" data-action="export-data">${t("settings.export")}</button>
        <button class="plain-button" type="button" data-action="import-data">${t("settings.import")}</button>
      </div>
    </section>`;
}

// ---------- actions ----------

function setLanguage(next) {
  state = { ...state, language: next === "en" ? "en" : "zh" };
  setLang(state.language);
  persist();
  render();
}

function sheetResult(result, toastKey) {
  if (result.error) {
    sheet.error = t(result.error);
    renderSheet("[role=alert]");
    sheetRoot.querySelector("#sheetTitle")?.focus({ preventScroll: true });
    return false;
  }
  commit(result.state, toastKey);
  return true;
}

const actions = {
  "toggle-language": () => setLanguage(other()),
  "set-lang": (el) => setLanguage(el.dataset.value),
  "goto-cycles": () => setView("cycles"),
  "toggle-how": () => {
    showHow = !showHow;
    const how = app.querySelector("#howText");
    const button = app.querySelector("[data-action='toggle-how']");
    if (how) how.hidden = !showHow;
    if (button) button.setAttribute("aria-expanded", String(showHow));
  },

  "start-period": () => {
    const result = core.startPeriod(state, core.todayIso());
    if (result.error) showToast(t(result.error));
    else commit(result.state, "toast.started");
  },
  "end-period": () => {
    const result = core.endPeriod(state, core.todayIso());
    if (result.error) showToast(t(result.error));
    else commit(result.state, "toast.ended");
  },
  "prep-toggle": (el) => {
    const key = core.latestPeriod(state)?.startDate || "";
    const done = new Set(state.prep.cycleStart === key ? state.prep.done : []);
    if (done.has(el.dataset.value)) done.delete(el.dataset.value);
    else done.add(el.dataset.value);
    commit({ ...state, prep: { cycleStart: key, done: [...done], updatedAt: new Date().toISOString() } });
    app.querySelector(`[data-action="prep-toggle"][data-value="${el.dataset.value}"]`)?.focus({ preventScroll: true });
  },

  "open-day": (el) => openDay(el.dataset.date),
  "close-sheet": () => closeSheet(),
  "sheet-date": (el) => {
    Object.assign(sheet, { date: el.dataset.value, confirm: false, error: "" }, draftFor(el.dataset.value));
    renderSheet(`[data-action="sheet-date"][data-value="${el.dataset.value}"]`);
  },
  "set-flow": (el) => {
    sheet.flow = sheet.flow === el.dataset.value ? "" : el.dataset.value;
    renderSheet(`[data-action="set-flow"][data-value="${el.dataset.value}"]`);
  },
  "set-pain": (el) => {
    const n = Number(el.dataset.value);
    sheet.pain = sheet.pain === n ? null : n;
    renderSheet(`[data-action="set-pain"][data-value="${n}"]`);
  },
  "toggle-sym": (el) => {
    const s = el.dataset.value;
    if (sheet.symptoms.has(s)) sheet.symptoms.delete(s);
    else sheet.symptoms.add(s);
    renderSheet(`[data-action="toggle-sym"][data-value="${s}"]`);
  },
  "start-at": () => {
    if (sheetResult(core.startPeriod(state, sheet.date), "toast.started")) renderSheet("#secPeriod");
  },
  "end-at": () => {
    if (sheetResult(core.endPeriod(state, sheet.date), "toast.ended")) renderSheet("#secPeriod");
  },
  "save-day": () => {
    const result = core.saveNote(state, {
      id: sheet.noteId,
      date: sheet.date,
      flow: sheet.flow,
      pain: sheet.pain,
      symptoms: [...sheet.symptoms],
      note: sheetRoot.querySelector("#sheetNote")?.value || "",
    });
    if (sheetResult(result, result.deleted ? "toast.deleted" : "toast.saved")) closeSheet();
  },
  "delete-day": () => {
    if (!sheet.confirm) {
      sheet.confirm = true;
      renderSheet("[data-action='delete-day']");
      return;
    }
    commit(core.deleteNote(state, sheet.noteId), "toast.deleted");
    closeSheet();
  },

  "edit-period": (el) => openPeriodEditor(el.dataset.id),
  "add-period": () => openPeriodEditor(null),
  "set-mode": (el) => {
    sheet.mode = el.dataset.value;
    renderSheet(`[data-action="set-mode"][data-value="${el.dataset.value}"]`);
  },
  "save-period": () => {
    const start = sheetRoot.querySelector("#editStart")?.value || "";
    const end = sheetRoot.querySelector("#editEnd")?.value || "";
    const ongoing = sheetRoot.querySelector("#editOngoing")?.checked;
    Object.assign(sheet, { start, end, ongoing });
    if (!ongoing && !end) {
      sheet.error = t("err.endInvalid");
      renderSheet("[role=alert]");
      return;
    }
    const result = core.savePeriod(state, { id: sheet.id, startDate: start, endDate: ongoing ? "" : end, cycleMode: sheet.mode, createdAt: sheet.createdAt });
    if (sheetResult(result, "toast.saved")) closeSheet();
  },
  "delete-period": () => {
    if (!sheet.confirm) {
      sheet.confirm = true;
      renderSheet("[data-action='delete-period']");
      return;
    }
    commit(core.deletePeriod(state, sheet.id), "toast.deleted");
    closeSheet();
  },

  "cal-today": () => scrollToMonth(core.todayIso().slice(0, 7), true),

  "save-settings": () => {
    const prepDays = Number(app.querySelector("#prepDays")?.value || 5);
    const reminderTime = app.querySelector("#reminderTime")?.value || "09:00";
    commit({ ...state, settings: { prepDays, reminderTime, updatedAt: new Date().toISOString() } }, "toast.settings");
  },
  "export-data": () => {
    const stamp = core.todayIso().replace(/-/g, "");
    download(`cycle-garden-backup-${stamp}.json`, JSON.stringify(state, null, 2), "application/json");
    showToast(t("toast.exported"));
  },
  "import-data": () => importInput.click(),
  "calendar-ics": () => download("cycle-garden-reminders.ics", core.buildIcs(state), "text/calendar"),
  "cloud-auth": () => cloudAuthToggle(),
};

document.addEventListener("click", (event) => {
  const nav = event.target.closest(".nav-item[data-view]");
  if (nav) {
    setView(nav.dataset.view);
    return;
  }
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  actions[el.dataset.action]?.(el, event);
});

sheetRoot.addEventListener("change", (event) => {
  if (!sheet) return;
  const { id } = event.target;
  if (id === "sheetDate" && core.isIso(event.target.value)) {
    Object.assign(sheet, { date: event.target.value, confirm: false, error: "" }, draftFor(event.target.value));
    renderSheet("#sheetDate");
  } else if (id === "editOngoing") {
    sheet.ongoing = event.target.checked;
    sheet.start = sheetRoot.querySelector("#editStart")?.value || sheet.start;
    sheet.end = sheetRoot.querySelector("#editEnd")?.value || sheet.end;
    renderSheet("#editOngoing");
  }
});

sheetRoot.addEventListener("input", (event) => {
  if (sheet?.type === "day" && event.target.id === "sheetNote") sheet.note = event.target.value;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheet) {
    event.preventDefault();
    closeSheet();
  }
  // Keep Tab inside an open sheet.
  if (event.key === "Tab" && sheet) {
    const focusable = [...sheetRoot.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea, [tabindex='-1']")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showToast(t("toast.importUnreadable"));
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { showToast(t("toast.importBad")); return; }
    if (!data || typeof data !== "object" || (!Array.isArray(data.periods) && !Array.isArray(data.notes))) {
      showToast(t("toast.importBad"));
      return;
    }
    const { state: merged, added } = core.mergeStates(state, data);
    commit(merged);
    showToast(added.periods + added.notes ? t("toast.imported", { p: added.periods, n: added.notes }) : t("toast.importNone"));
  };
  reader.readAsText(file);
});

// ---------- cloud sync (Firebase) ----------
// Local-only until firebase-config.js has an apiKey. Every write is a Firestore transaction that
// reads the cloud copy, merges it with this device (core.mergeStates) and writes the result, so
// a device can never overwrite edits it has not seen yet.

const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const cloud = { ready: false, user: null, auth: null, authMod: null, fs: null, db: null, docRef: null, unsubscribe: null };

function adoptMerged(merged) {
  if (core.sameData(merged, state)) return;
  state = core.normalize({ ...merged, language: state.language });
  persist();
  if (sheet) renderSheet();
  else render();
}

let pushTimer = null;
function queuePush() {
  if (!cloud.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushCloud, 500);
}

async function pushCloud() {
  if (!cloud.ready || !cloud.user || !cloud.docRef) return;
  try {
    const merged = await cloud.fs.runTransaction(cloud.db, async (tx) => {
      const snap = await tx.get(cloud.docRef);
      const remote = snap.exists() ? snap.data() : null;
      const next = remote ? core.mergeStates(state, remote).state : state;
      if (!remote || !core.sameData(next, remote)) {
        tx.set(cloud.docRef, { ...core.toCloud(next), updatedAt: new Date().toISOString() });
      }
      return next;
    });
    adoptMerged(merged);
  } catch (error) {
    console.warn("Cloud sync failed; will retry on the next change or when back online.", error);
  }
}

async function initCloud() {
  if (!firebaseConfig || !firebaseConfig.apiKey) return;
  let appMod;
  let authMod;
  let fsMod;
  try {
    [appMod, authMod, fsMod] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
    ]);
  } catch (error) {
    console.warn("Cloud sync unavailable (offline or blocked).", error);
    return;
  }
  const fbApp = appMod.initializeApp(firebaseConfig);
  cloud.auth = authMod.getAuth(fbApp);
  cloud.authMod = authMod;
  cloud.fs = fsMod;
  cloud.db = fsMod.getFirestore(fbApp);
  cloud.ready = true;
  if (view === "settings") render();

  // Finishes a redirect sign-in started from the installed app.
  authMod.getRedirectResult(cloud.auth).catch((error) => {
    console.warn("Redirect sign-in failed.", error);
    showToast(t("toast.signInFailed"));
  });

  authMod.onAuthStateChanged(cloud.auth, (user) => {
    cloud.user = user;
    cloud.unsubscribe?.();
    cloud.unsubscribe = null;
    if (user) {
      cloud.docRef = fsMod.doc(cloud.db, "users", user.uid);
      pushCloud();
      cloud.unsubscribe = fsMod.onSnapshot(cloud.docRef, (snap) => {
        if (!snap.exists()) return;
        const remote = snap.data();
        const merged = core.mergeStates(state, remote).state;
        adoptMerged(merged);
        if (!core.sameData(merged, remote)) queuePush();
      }, (error) => console.warn("Live sync stopped.", error));
    } else {
      cloud.docRef = null;
    }
    if (view === "settings") render();
  });
}

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const REDIRECT_FALLBACK = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request", "auth/popup-closed-by-user"];

async function cloudAuthToggle() {
  if (!cloud.ready) {
    showToast(t("toast.cloudNotSet"));
    return;
  }
  const { authMod } = cloud;
  try {
    if (cloud.user) {
      await authMod.signOut(cloud.auth);
      showToast(t("toast.signedOut"));
      return;
    }
    const provider = new authMod.GoogleAuthProvider();
    if (isStandalone()) {
      // Popups are unreliable in home-screen apps (iOS especially): go straight to a redirect.
      await authMod.signInWithRedirect(cloud.auth, provider);
      return;
    }
    try {
      await authMod.signInWithPopup(cloud.auth, provider);
      showToast(t("toast.signedIn"));
    } catch (error) {
      if (!REDIRECT_FALLBACK.includes(error.code) || error.code === "auth/popup-closed-by-user") throw error;
      await authMod.signInWithRedirect(cloud.auth, provider);
    }
  } catch (error) {
    console.warn("Auth error", error);
    if (error.code !== "auth/popup-closed-by-user") showToast(t("toast.signInFailed"));
  }
}

window.addEventListener("online", queuePush);

// Re-render when the app comes back to the foreground on a new day, so "today" is never stale.
let renderedDay = core.todayIso();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && core.todayIso() !== renderedDay) {
    renderedDay = core.todayIso();
    render();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

render();
initCloud();
