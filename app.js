import * as report from "./report.js";
import * as pinLock from "./lock.js";
import * as core from "./core.js";
import * as moonrise from "./moonrise.js";
import { t, setLang, getLang, other, fmtShort, fmtLong, fmtDay, fmtWeekday, fmtMonth } from "./i18n.js";
import { firebaseConfig } from "./firebase-config.js";

// Same key as v1 so existing data loads; the raw v1 value is copied once to BACKUP_KEY before
// it is first rewritten in the v2 shape.
const STORAGE_KEY = "xy-period-tracker-pwa-v1";
const BACKUP_KEY = "xy-period-tracker-pwa-v1-backup-before-v2";
// The Google account the records on this device were last synced with (see onAuthStateChanged).
const OWNER_KEY = "cycle-garden-owner-uid";
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
let moonState = null;
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
  placeMoon();
  if (view === "calendar" && calendarNeedsScroll) {
    calendarNeedsScroll = false;
    scrollToMonth(core.todayIso().slice(0, 7), false);
  }
  renderSheet();
}

// The Today moon sits below the last line of text (measured, so it holds at any screen height).
function placeMoon() {
  if (view !== "home") { moonrise.set(null); return; }
  const bottom = app.querySelector(".home-actions")?.getBoundingClientRect().bottom ?? 0;
  moonrise.set({ ...moonState, clearTop: bottom - phone.getBoundingClientRect().top + app.scrollTop });
}
window.addEventListener("resize", placeMoon);

function renderNav() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-label]").forEach((node) => { node.textContent = t(node.dataset.label); });
  document.querySelector(".nav-add").setAttribute("aria-label", t("nav.add"));
  document.querySelector(".bottom-nav").setAttribute("aria-label", t("nav.main"));
}

function setView(next) {
  view = next;
  sheet = null;
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

// Moonrise (Locked 11 Oct): the moon's visible height is how far through the cycle today is;
// it is rose during a period and lilac from prep through a late start.
function homeMoon(st, pred) {
  const last = core.latestPeriod(state);
  if (!last || !st.cycleDay) return { rise: 0.15, tint: "cream" };
  let total = 28;
  if (pred.level !== "none") total = Math.max(total, core.daysBetween(last.startDate, pred.latest) + 1);
  const rise = Math.min(1, Math.max(0.04, st.cycleDay / total));
  const tint = st.kind === "period" ? "rose" : ["prep", "window", "late"].includes(st.kind) ? "lilac" : "cream";
  return { rise, tint };
}

function prepDone() {
  const key = core.latestPeriod(state)?.startDate || "";
  return state.prep.cycleStart === key ? state.prep.done.filter((item) => PREP_ITEMS.includes(item)) : [];
}

function prepCard(st) {
  const done = prepDone();
  const emphasis = ["prep", "window", "late"].includes(st.kind);
  const allDone = PREP_ITEMS.every((item) => done.includes(item));
  return `<article class="prep-card glass${emphasis ? " emphasis" : ""}" id="prepKit" tabindex="-1">
      <div class="card-head"><h2>${t("prep.title")}</h2>${allDone ? `<span class="done-tag">${t("prep.done")}</span>` : ""}</div>
      <div class="chips">${PREP_ITEMS.map((item) => `<button class="chip" type="button" data-action="prep-toggle" data-value="${item}" aria-pressed="${done.includes(item)}">${t(`prep.${item}`)}</button>`).join("")}</div>
    </article>`;
}

// One focal object (the moon, drawn by moonrise.js), one headline, one sentence, one action.
// Everything else (range, how it is worked out, prep kit, last period, recent logs) is in the
// details sheet behind "看看依据".
function renderHome() {
  const today = core.todayIso();
  const st = core.getStatus(state, today);
  const pred = st.pred || core.predict(state);
  const copy = statusCopy(st);
  const problems = core.findProblems(state, today);
  const open = core.openPeriod(state);
  const primaryKey = open ? "action.end" : "action.start";
  const n = st.kind === "period" ? st.day : st.cycleDay;
  const showDay = st.kind !== "empty" && n;
  const lead = ["period", "empty"].includes(st.kind) ? "" : copy.head;
  const glue = (text) => text.replace(/(\d+) /g, "$1\u00a0");
  moonState = homeMoon(st, pred);

  return `
    <header class="home-top">
      <p class="eyebrow">${esc(fmtDay(today))}</p>
      <button class="language-pill" type="button" data-action="toggle-language" aria-label="${t("lang.toggleLabel")}" lang="${langAttr(other())}">${t("lang.toggle")}</button>
    </header>

    <section class="home" aria-labelledby="statusHead">
      ${st.kind !== "empty" ? `<p class="phase phase-${st.kind}">${t(`phase.${st.kind}`)}</p>` : ""}
      <h1 id="statusHead" class="${showDay ? "home-day" : "home-head"}" tabindex="-1">${showDay ? t("big.day", { n: `<b>${n}</b>` }) : glue(copy.head)}</h1>
      ${lead ? `<p class="home-lead">${glue(lead)}</p>` : ""}
      <p class="home-sub">${copy.sub}</p>
      ${st.kind === "period" && st.long ? `<div class="notice"><p>${t("status.period.long")}</p><button class="soft-button small" type="button" data-action="edit-period" data-id="${esc(st.open.id)}">${t("status.period.fix")}</button></div>` : ""}
      <div class="home-actions">
        <button class="primary-action glass" type="button" data-action="${open ? "end-period" : "start-period"}">${t(primaryKey)}</button>
        <div class="home-links">
          <button class="text-button" type="button" data-action="open-info">${t("info.open")}${ICON_CHEVRON}</button>
          ${["prep", "window", "late"].includes(st.kind) ? `<button class="text-button" type="button" data-action="goto-prep">${t("prep.link", { d: prepDone().length, n: PREP_ITEMS.length })}${ICON_CHEVRON}</button>` : ""}
          ${problems.length ? `<button class="text-button warn" type="button" data-action="goto-cycles"><i aria-hidden="true"></i>${t("problems.banner", { n: problems.length })}${ICON_CHEVRON}</button>` : ""}
        </div>
      </div>
    </section>`;
}

// The details sheet: what Home leaves out.
function infoSheet() {
  const today = core.todayIso();
  const st = core.getStatus(state, today);
  const pred = st.pred || core.predict(state);
  const last = core.latestPeriod(state);
  const stats = core.getStats(state);
  const excluded = core.getCycles(state).filter((c) => !c.counted).length;
  const how = pred.level !== "none"
    ? [t("how.text", { n: pred.count, min: pred.min, max: pred.max, date: fmtShort(pred.last.startDate) }),
       pred.level === "rough" ? t("how.rough", { n: pred.count }) : "",
       excluded ? t("how.excluded", { n: excluded }) : ""].filter(Boolean).join(" ")
    : "";
  const usual = pred.level !== "none"
    ? (pred.min === pred.max ? t("stat.usualOne", { a: pred.min }) : t("stat.usualValue", { a: pred.min, b: pred.max }))
    : t("stat.none");
  return `${sheetHead(t("info.title"))}
    <div class="sheet-body">
      ${pred.level !== "none" ? `<section class="sheet-section info-next" aria-labelledby="infoNext">
          <h3 id="infoNext">${t("info.next")}</h3>
          <p class="info-range">${esc(fmtShort(pred.earliest))} – ${esc(fmtShort(pred.latest))}</p>
          <p class="help">${rangeText(pred)}</p>
          <p class="body-copy">${how}</p>
        </section>` : `<p class="body-copy">${t("status.learning.sub")}</p>`}
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
      ${prepCard(st)}
      ${recentLogs()}
    </div>`;
}

function openInfo(focus) {
  if (!sheet) sheetOpener = describeOpener(document.activeElement);
  sheet = { type: "info" };
  renderSheet();
  const target = focus && sheetRoot.querySelector(focus);
  if (target) {
    target.scrollIntoView({ block: "nearest" });
    target.focus({ preventScroll: true });
  } else focusSheet();
}

// The last three day logs, newest first. Empty until something is logged.
function recentLogs() {
  const notes = [...state.notes].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
  if (!notes.length) return "";
  return `<article class="recent-card glass" aria-labelledby="recentTitle">
      <h2 id="recentTitle">${t("recent.title")}</h2>
      <ul class="note-list">${notes.map((n) => `<li><button type="button" data-action="open-day" data-date="${n.date}"><span class="note-date">${esc(fmtShort(n.date))}</span><span>${esc(noteSummary(n))}</span></button></li>`).join("")}</ul>
    </article>`;
}

// ---------- sheets (day log + period editor) ----------

// Symptoms typed by the user (anything not in the built-in list) from logs in the last 90 days
// plus the open sheet, so they can be reused; an old one drops off once nothing recent uses it.
function customSymptoms() {
  const since = core.addDays(core.todayIso(), -90);
  const recent = state.notes.filter((n) => n.date >= since).flatMap((n) => n.symptoms);
  const all = new Set([...recent, ...(sheet?.symptoms || [])]);
  return [...all].filter((s) => !core.SYMPTOMS.includes(s)).sort();
}

// A typed symptom that matches a built-in label (in either language) becomes that built-in.
function symptomKey(text) {
  const lower = text.toLowerCase();
  return core.SYMPTOMS.find((key) => [t(`sym.${key}`, {}, "zh"), t(`sym.${key}`, {}, "en")].some((label) => label.toLowerCase() === lower)) || text;
}

// Moving to another date keeps what was entered for the current one (until the sheet closes),
// so going back to it does not lose unsaved input.
function switchDate(date) {
  stashDraft();
  Object.assign(sheet, { date, confirm: false, closeArmed: false, error: "", periodError: "" }, sheet.drafts[date] || draftFor(date));
}

function stashDraft() {
  const current = {
    flow: sheet.flow, pain: sheet.pain, symptoms: sheet.symptoms, noteId: sheet.noteId,
    note: sheetRoot.querySelector("#sheetNote")?.value ?? sheet.note,
    custom: sheetRoot.querySelector("#customSym")?.value ?? sheet.custom ?? "",
  };
  sheet.drafts = { ...(sheet.drafts || {}), [sheet.date]: current };
}

// Dates in the open day sheet whose input differs from what is saved.
function dirtyDates() {
  if (sheet?.type !== "day") return [];
  stashDraft();
  return Object.entries(sheet.drafts).filter(([date, d]) => {
    const saved = draftFor(date);
    const same = d.flow === saved.flow && d.pain === saved.pain && d.note.trim() === saved.note.trim() && !d.custom.trim()
      && d.symptoms.size === saved.symptoms.size && [...d.symptoms].every((s) => saved.symptoms.has(s));
    return !same;
  }).map(([date]) => date);
}

// Closing a day sheet with unsaved input asks once (a toast), then lets go on the second try.
function requestClose() {
  if (sheet?.type === "day" && !sheet.closeArmed && dirtyDates().length) {
    sheet.closeArmed = true;
    showToast(t("sheet.unsavedClose"));
    return;
  }
  closeSheet();
}

function draftFor(iso) {
  const note = core.notesOn(state, iso)[0];
  return { noteId: note?.id || null, flow: note?.flow || "", pain: note?.pain ?? null, symptoms: new Set(note?.symptoms || []), note: note?.note || "", custom: "" };
}

// Remembers what opened the sheet as a selector, not an element: saving re-renders the page,
// so the original button is gone by the time the sheet closes.
function describeOpener(el) {
  if (!el || el === document.body) return null;
  if (el.classList?.contains("nav-add")) return ".nav-add";
  if (!el.dataset?.action) return null;
  const attrs = ["date", "id", "value"].filter((k) => el.dataset[k]).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join("");
  const scope = el.closest(".recent-card, .months, .timeline, .home-actions, .section-title, .notice");
  const prefix = scope ? `.${[...scope.classList].find((c) => !["glass", "emphasis"].includes(c))} ` : "";
  return `${prefix}[data-action="${el.dataset.action}"]${attrs}`;
}

function openDay(date) {
  const today = core.todayIso();
  const iso = date && date <= today ? date : today;
  if (!sheet) sheetOpener = describeOpener(document.activeElement);
  // Opened from the details sheet: closing the day log returns there.
  const parent = sheet?.type === "info" ? { type: "info" } : null;
  sheet = { parent, type: "day", date: iso, confirm: false, error: "", periodError: "", ...draftFor(iso) };
  renderSheet();
  focusSheet();
}

function openPeriodEditor(id) {
  const period = id ? state.periods.find((p) => p.id === id) : null;
  // Opened from the day sheet: remember it (with any unsaved inputs) so closing returns there.
  const parent = sheet?.type === "day" ? { ...sheet, note: sheetRoot.querySelector("#sheetNote")?.value ?? sheet.note } : null;
  if (!sheet) sheetOpener = describeOpener(document.activeElement);
  sheet = {
    parent,
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
  if (sheet?.parent) {
    sheet = { ...sheet.parent, confirm: false, error: "", periodError: "" };
    renderSheet();
    focusSheet();
    return;
  }
  sheet = null;
  renderSheet();
  const target = (sheetOpener && document.querySelector(sheetOpener)) || app.querySelector("h1");
  target?.focus({ preventScroll: true });
  sheetOpener = null;
}

// A native date input under a formatted label: the picker stays native (and accessible), but the
// text matches the app's date format instead of the browser's dd/mm/yyyy.
function dateField(id, value, label, { disabled = false } = {}) {
  return `<label class="field" for="${id}"><span>${label}</span>
      <span class="date-shell${disabled ? " is-disabled" : ""}">
        <span class="date-text" aria-hidden="true">${value ? esc(fmtLong(value)) : t("editor.pick")}</span>
        <input type="date" id="${id}" max="${core.todayIso()}" value="${esc(value)}" ${disabled ? "disabled" : ""}>
      </span></label>`;
}

function focusSheet() {
  sheetRoot.querySelector("#sheetTitle")?.focus({ preventScroll: true });
}

function renderSheet(focusSelector) {
  if (!sheet) {
    sheetRoot.innerHTML = "";
    sheetRoot.classList.remove("open");
    phone.classList.remove("sheet-open");
    app.inert = pinLock.isLocked();
    return;
  }
  sheetRoot.classList.add("open");
  phone.classList.add("sheet-open");
  app.inert = true;
  // Redrawing the same sheet (a chip tap, a date switch) keeps its scroll and skips the slide-in.
  const prev = sheetRoot.querySelector(".sheet");
  const scroll = prev && prev.dataset.type === sheet.type ? prev.scrollTop : 0;
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>
    <section class="sheet${prev ? " no-anim" : ""}" data-type="${sheet.type}" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      ${sheet.type === "day" ? daySheet() : sheet.type === "info" ? infoSheet() : periodSheet()}
    </section>`;
  const next = sheetRoot.querySelector(".sheet");
  next.scrollTop = scroll;
  // Centre the selected date chip by scrolling the chip row only (scrollIntoView would also
  // scroll the sheet back to the top).
  const chips = next.querySelector(".date-chips");
  const selected = chips?.querySelector("[aria-pressed='true']");
  if (chips && selected) {
    const a = chips.getBoundingClientRect();
    const b = selected.getBoundingClientRect();
    chips.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }
  if (focusSelector) sheetRoot.querySelector(focusSelector)?.focus({ preventScroll: true });
  if (sheet.confirm) next.querySelector(".danger-button, [data-action='delete-day']")?.scrollIntoView({ block: "nearest" });
}

function sheetHead(title) {
  return `<div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 id="sheetTitle" tabindex="-1">${title}</h2>
      <button class="icon-btn" type="button" data-action="close-sheet" aria-label="${t("sheet.close")}">${ICON_CLOSE}</button>
    </div>`;
}

const pressed = (on) => `aria-pressed="${on ? "true" : "false"}"`;

// Log sheet (Locked 11 Oct, version C of LogSheet_v02): moon week strip, then one glass card per
// field, all open; the value of each field shows at the card's top right; one glowing Save.
const SYM_ICON = {
  cramps: '<path d="M4 13c2-3 4 3 6 0s4 3 6 0 4 3 4 0"/><path d="M8 7c1.5 1 6.5 1 8 0"/>',
  tired: '<rect x="3" y="8" width="16" height="9" rx="3"/><path d="M21 11v3M6 11v3"/>',
  mood: '<path d="M4 12c2.5-4 5.5 4 8 0s5.5 4 8 0"/>',
  sleep: '<path d="M15 4.5a7.5 7.5 0 1 0 4.5 12.5A6.5 6.5 0 0 1 15 4.5z"/>',
  headache: '<circle cx="12" cy="13" r="6"/><path d="M12 3v2M5 6l1.5 1.5M19 6l-1.5 1.5"/>',
  bloating: '<ellipse cx="12" cy="13" rx="8" ry="6"/><path d="M9 13h6"/>',
};
const symIcon = (key) => (SYM_ICON[key] ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYM_ICON[key]}</svg>` : "");

// A drop filled to the flow amount (spotting is a single dot).
function flowDrop(level) {
  const id = `drop-${level}`;
  const shape = "M12 3c3.5 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6 6-11z";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
    <path d="${shape}" fill="none" stroke="#ffc2d4" stroke-width="1.5"/>
    <rect x="0" y="${[20, 15, 11, 3][level]}" width="24" height="24" fill="#ffa8c2" clip-path="url(#${id})"/>${level === 0 ? '<circle cx="12" cy="16" r="2" fill="#ffa8c2"/>' : ""}</svg>`;
}

// Day of the cycle a date falls on (from the latest period that started on or before it).
function cycleDayOn(iso) {
  const start = state.periods.filter((p) => p.startDate <= iso).reduce((a, p) => (!a || p.startDate > a.startDate ? p : a), null);
  return start ? core.daysBetween(start.startDate, iso) + 1 : null;
}

function moonPath(cx, cy, r, t) {
  const k = Math.cos(2 * Math.PI * t), waxing = t < 0.5, rx = Math.abs(k) * r;
  return `M${cx},${cy - r} A${r},${r} 0 0 ${waxing ? 1 : 0} ${cx},${cy + r} A${rx.toFixed(2)},${r} 0 0 ${waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0)} ${cx},${cy - r}Z`;
}

// The last 7 days as moon phases (period = full moon, rose; likely days lilac), oldest first.
function moonWeek(selected, today) {
  const pred = core.predict(state);
  const days = Array.from({ length: 7 }, (_, i) => core.addDays(today, i - 6));
  const earlier = !days.includes(selected);
  const cell = (iso) => {
    const info = core.dayInfo(state, iso, today, pred);
    const cd = cycleDayOn(iso);
    const on = iso === selected;
    const r = on ? 10 : 8.5;
    const fill = info.period ? "#ffa8c2" : info.predicted ? "#d9c6ff" : "rgba(246,239,255,.85)";
    const lit = cd ? `<path d="${moonPath(15, 15, r, (((cd - 1) / 30) + 0.5) % 1)}" fill="${fill}"/>` : "";
    const label = iso === today ? t("sheet.today") : fmtWeekday(iso);
    return `<button class="moon-day${on ? " on" : ""}${info.hasNote ? " noted" : ""}" type="button" data-action="sheet-date" data-value="${iso}" ${pressed(on)} aria-label="${esc(fmtDay(iso))}">
        <svg viewBox="0 0 30 30" aria-hidden="true">${on ? '<circle cx="15" cy="15" r="14" fill="none" stroke="#f6efff" stroke-width="1.2"/>' : ""}<circle cx="15" cy="15" r="${r}" fill="rgba(255,255,255,.1)"/>${lit}</svg>
        <b>${dayNum(iso)}</b><span>${esc(label)}</span></button>`;
  };
  return `<div class="moon-week" role="group" aria-label="${t("sheet.dateGroup")}">
      <span class="moon-day earlier${earlier ? " on" : ""}">
        <svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="10" fill="none" stroke="rgba(255,255,255,.3)" stroke-dasharray="2 3"/><path d="M12 15h6M15 12v6" stroke="rgba(255,255,255,.7)" stroke-linecap="round"/></svg>
        <b>${earlier ? dayNum(selected) : "&nbsp;"}</b><span>${earlier ? esc(fmtShort(selected)) : t("sheet.earlierShort")}</span>
        <input type="date" id="sheetDate" max="${today}" value="${selected}" aria-label="${t("sheet.earlier")}">
      </span>
      ${days.map(cell).join("")}
    </div>`;
}

function painWord(n) {
  return n === null ? "—" : `<i>${n}</i>${t(`pain.w${n}`)}`;
}

function daySheet() {
  const today = core.todayIso();
  const d = sheet.date;
  const period = core.periodOn(state, d, today);
  const cd = cycleDayOn(d);
  const sub = period ? t("sheet.inPeriod", { n: core.daysBetween(period.startDate, d) + 1 }) : cd ? t("status.cycleDay", { n: cd }) : "";

  let periodHtml;
  if (period) {
    periodHtml = `<svg class="period-mark" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="12" fill="#ffa8c2"/><circle cx="17" cy="17" r="16" fill="none" stroke="rgba(255,168,194,.35)"/></svg>
      <p><strong>${t("sheet.inPeriod", { n: core.daysBetween(period.startDate, d) + 1 })}</strong>
        <button class="link-button" type="button" data-action="edit-period" data-id="${esc(period.id)}">${t("sheet.editPeriod")}</button></p>
      ${!period.endDate ? `<button class="cap-button" type="button" data-action="end-at">${t("sheet.endHere")}</button>` : ""}`;
  } else {
    periodHtml = `<svg class="period-mark" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="12" fill="none" stroke="rgba(255,168,194,.7)" stroke-dasharray="2 3.2"/></svg>
      <p><strong>${t("sheet.noPeriodShort")}</strong></p>
      <button class="cap-button" type="button" data-action="start-at">${t("sheet.startHere")}</button>`;
  }

  const p = sheet.pain;
  return `<div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head day-head">
      <div>
        <h2 id="sheetTitle" tabindex="-1">${esc(fmtShort(d))}<span>${d === today ? t("sheet.today") : esc(fmtWeekday(d))}</span></h2>
        ${sub ? `<p class="day-sub${period ? " is-period" : ""}">${sub}</p>` : ""}
      </div>
      <button class="icon-btn" type="button" data-action="close-sheet" aria-label="${t("sheet.close")}">${ICON_CLOSE}</button>
    </div>
    <div class="sheet-body log-body">
      ${moonWeek(d, today)}

      <section class="log-card glass period-card" aria-labelledby="secPeriod">
        <h3 id="secPeriod" class="visually-hidden" tabindex="-1">${t("sheet.period")}</h3>
        ${periodHtml}
        ${sheet.periodError ? `<p class="form-error" role="alert">${sheet.periodError}</p>` : ""}
      </section>

      <section class="log-card glass" aria-labelledby="secFlow">
        <div class="log-top"><h3 id="secFlow">${t("sheet.flow")}</h3><strong>${sheet.flow ? t(`flow.${sheet.flow}`) : "—"}</strong></div>
        <div class="flow-tiles" role="group" aria-labelledby="secFlow">
          ${core.FLOWS.map((f, i) => `<button class="flow-tile" type="button" data-action="set-flow" data-value="${f}" ${pressed(sheet.flow === f)}><i>${flowDrop(i)}</i>${t(`flow.${f}`)}</button>`).join("")}
        </div>
      </section>

      <section class="log-card glass" aria-labelledby="secPain">
        <div class="log-top"><h3 id="secPain">${t("sheet.pain")}</h3><strong id="painWord">${painWord(p)}</strong></div>
        <input type="range" id="painRange" class="pain-range${p === null ? " unset" : ""}" min="0" max="5" step="1" value="${p ?? 0}" style="--p:${((p ?? 0) / 5) * 100}%" aria-labelledby="secPain" aria-valuetext="${p === null ? "—" : `${p} ${t(`pain.w${p}`)}`}">
        <div class="pain-ticks" role="group" aria-label="${t("pain.hint")}">
          ${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" data-action="set-pain" data-value="${n}" ${pressed(p === n)} aria-label="${n} ${t(`pain.w${n}`)}">${n}</button>`).join("")}
        </div>
      </section>

      <section class="log-card glass" aria-labelledby="secSym">
        <div class="log-top"><h3 id="secSym">${t("sheet.symptoms")}</h3><strong>${sheet.symptoms.size ? t("sheet.symCount", { n: sheet.symptoms.size }) : "—"}</strong></div>
        <div class="chips" role="group" aria-labelledby="secSym">
          ${core.SYMPTOMS.map((s) => `<button class="chip" type="button" data-action="toggle-sym" data-value="${s}" ${pressed(sheet.symptoms.has(s))}>${symIcon(s)}${t(`sym.${s}`)}</button>`).join("")}
          ${customSymptoms().map((s) => `<button class="chip" type="button" data-action="toggle-sym" data-value="${esc(s)}" ${pressed(sheet.symptoms.has(s))}>${esc(s)}</button>`).join("")}
        </div>
        <div class="add-row">
          <input type="text" id="customSym" maxlength="24" value="${esc(sheet.custom || "")}" placeholder="${t("sheet.addPlaceholder")}" aria-label="${t("sheet.addLabel")}">
          <button class="soft-button small" type="button" data-action="add-sym">${t("sheet.add")}</button>
        </div>
      </section>

      <section class="log-card glass">
        <label class="log-note" for="sheetNote"><span class="log-top"><h3>${t("sheet.note")}</h3></span>
          <textarea id="sheetNote" rows="2" placeholder="${t("sheet.notePlaceholder")}">${esc(sheet.note)}</textarea>
        </label>
      </section>

      ${sheet.error ? `<p class="form-error" role="alert">${sheet.error}</p>` : ""}
    </div>
    <div class="log-foot">
      <button class="save-glow" type="button" data-action="save-day">${t("sheet.save")}</button>
      ${sheet.noteId ? `<button class="link-button" type="button" data-action="delete-day">${sheet.confirm ? t("sheet.confirmDelete") : t("sheet.deleteLog")}</button>` : ""}
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
        ${dateField("editStart", sheet.start, t("editor.start"))}
        ${dateField("editEnd", sheet.ongoing ? "" : sheet.end, t("editor.end"), { disabled: sheet.ongoing })}
      </div>
      ${!sheet.id || isLatest ? `<label class="check"><input type="checkbox" id="editOngoing" ${sheet.ongoing ? "checked" : ""}><span>${t("editor.ongoing")}</span></label>` : ""}
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
  return [note.flow ? t("summary.flow", { v: t(`flow.${note.flow}`) }) : "",
    note.pain !== null ? t("summary.pain", { n: note.pain }) : "",
    ...note.symptoms.map((s) => (core.SYMPTOMS.includes(s) ? t(`sym.${s}`) : s)),
    note.note].filter(Boolean).join(" · ");
}

// Bars per cycle against the typical 21–35-day range from the brief's health rules (§7), so a
// cycle outside it stands out (Clue's typical / atypical split). Not-counted cycles are dashed.
const TYPICAL = [21, 35];

function cycleChart(cycles) {
  const counted = cycles.filter((c) => c.counted);
  const from = counted.length ? cycles.indexOf(counted[Math.max(0, counted.length - 6)]) : Math.max(0, cycles.length - 6);
  const shown = cycles.slice(from).slice(-8);
  const axis = (iso) => (getLang() === "zh" ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}` : fmtShort(iso));
  if (!shown.length) return `<p class="body-copy">${t("chart.empty")}</p>`;
  const W = 320;
  const H = 176;
  const top = 20;
  const bottom = 28;
  const yMax = Math.max(45, Math.ceil((Math.max(...shown.map((c) => c.length)) + 5) / 5) * 5);
  const y = (v) => top + (H - top - bottom) * (1 - v / yMax);
  const slot = W / shown.length;
  const barW = Math.min(26, slot * 0.56);
  const band = `<rect class="chart-band" x="0" y="${y(TYPICAL[1]).toFixed(1)}" width="${W}" height="${(y(TYPICAL[0]) - y(TYPICAL[1])).toFixed(1)}"/>`;
  const outside = (n) => n < TYPICAL[0] || n > TYPICAL[1];
  const step = shown.length > 6 ? 2 : 1; // every other date label when there are more than 6 bars
  const bars = shown.map((c, i) => {
    const x = slot * i + (slot - barW) / 2;
    const cls = ["chart-bar", !c.counted && "excluded", c.counted && outside(c.length) && "atypical"].filter(Boolean).join(" ");
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y(c.length).toFixed(1)}" width="${barW.toFixed(1)}" height="${(y(0) - y(c.length)).toFixed(1)}" rx="5"/>
      <text class="chart-value" x="${(x + barW / 2).toFixed(1)}" y="${(y(c.length) - 6).toFixed(1)}" text-anchor="middle">${c.length}</text>
      <text class="chart-axis" x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${(shown.length - 1 - i) % step === 0 ? esc(axis(c.from.startDate)) : ""}</text>`;
  }).join("");
  const label = shown.map((c) => `${fmtShort(c.from.startDate)}: ${c.length} ${t("chart.days")}${c.counted ? "" : ` (${t("chart.notCounted")})`}`).join(", ");
  const anyOutside = shown.some((c) => c.counted && outside(c.length));
  const anyExcluded = shown.some((c) => !c.counted);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${t("chart.title")}. ${t("chart.typical")}. ${label}`)}">
      ${band}<line class="chart-base" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>${bars}
    </svg>
    <ul class="chart-legend">
      <li><span class="swatch band"></span>${t("chart.typical")}</li>
      ${anyOutside ? `<li><span class="swatch atypical"></span>${t("chart.atypical")}</li>` : ""}
      ${anyExcluded ? `<li><span class="swatch excluded"></span>${t("chart.notCounted")}</li>` : ""}
    </ul>`;
}

// One dot per day, scaled to fit one line (Apple Health's cycle strip).
function dotStrip(days, bleed) {
  const n = Math.max(1, Math.min(days, 60));
  return `<span class="dot-strip" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < bleed ? "on" : ""}"></i>`).join("")}</span>`;
}

// Most common symptoms over the last three cycles, for the Insights card (brief §8).
function recentSymptoms(asc) {
  const since = asc.length >= 3 ? asc[asc.length - 3].startDate : asc[0]?.startDate;
  if (!since) return [];
  const counts = new Map();
  state.notes.filter((n) => n.date >= since).forEach((n) => n.symptoms.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

let expandedRows = new Set();

function renderCycles() {
  const today = core.todayIso();
  const cycles = core.getCycles(state);
  const stats = core.getStats(state);
  const flags = core.healthFlags(state, today);
  const problems = new Map(core.findProblems(state, today).map((p) => [p.id, p.code]));
  const asc = core.sortedPeriods(state);
  const byFrom = new Map(cycles.map((c) => [c.from.id, c]));
  const fmtStat = (v) => (v === null ? t("stat.none") : t("stats.days", { n: v }));
  const symptoms = recentSymptoms(asc);
  const symLabel = (s) => (core.SYMPTOMS.includes(s) ? t(`sym.${s}`) : s);
  const isLatest = (p) => asc[asc.length - 1]?.id === p.id;

  const rows = [...asc].reverse().map((p) => {
    const idx = asc.indexOf(p);
    const next = asc[idx + 1];
    const cycle = byFrom.get(p.id);
    const len = core.periodLength(p);
    const open = !p.endDate && isLatest(p);
    const span = next ? core.daysBetween(p.startDate, next.startDate) : Math.max(1, core.daysBetween(p.startDate, today) + 1);
    const bleed = len ?? (open ? Math.max(1, core.daysBetween(p.startDate, today) + 1) : 0);
    const until = next ? next.startDate : core.addDays(today, 1);
    // Logs in date order; heavy flow and pain 4+ are marked in the list instead of moved.
    const notes = state.notes.filter((n) => n.date >= p.startDate && n.date < until)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const expanded = expandedRows.has(p.id);
    const shownNotes = expanded ? notes : notes.slice(0, 3);
    const badges = [
      problems.has(p.id) && problems.get(p.id) !== "err.tooClose" && `<span class="badge warn">${t("list.problem")}</span>`,
      cycle && cycle.autoExcluded && `<span class="badge${cycle.tooShort ? " warn" : ""}">${t(cycle.tooShort ? "list.tooClose" : "list.missed")}</span>`,
      cycle && !cycle.counted && !cycle.autoExcluded && `<span class="badge">${t("list.notCounted")}</span>`,
    ].filter(Boolean).join("");
    const title = len ? t("list.range", { start: esc(fmtShort(p.startDate)), end: esc(fmtShort(p.endDate)) }) : t("list.started", { date: esc(fmtShort(p.startDate)) });
    const meta = t("list.meta", {
      p: len ? t("list.days", { n: len }) : open ? t("list.open") : t("stat.none"),
      c: cycle ? t("list.days", { n: cycle.length }) : t("list.current", { n: span }),
    });
    return `<article class="cycle-row glass">
        <button class="cycle-main" type="button" data-action="edit-period" data-id="${esc(p.id)}">
          <span class="cycle-year">${p.startDate.slice(0, 4)}</span>
          <span class="cycle-title"><strong>${title}</strong>${badges}</span>
          <span class="cycle-meta">${meta}</span>
          ${dotStrip(span, bleed)}
          <span class="row-chevron">${ICON_CHEVRON}</span>
        </button>
        ${notes.length ? `<ul class="note-list">${shownNotes.map((n) => `<li><button type="button" data-action="open-day" data-date="${n.date}"${n.flow === "heavy" || (n.pain ?? 0) >= 4 ? ' class="marked"' : ""}><span class="note-date">${esc(fmtShort(n.date))}</span><span>${esc(noteSummary(n))}</span></button></li>`).join("")}
          ${notes.length > 3 ? `<li><button class="more" type="button" data-action="toggle-row" data-id="${esc(p.id)}" aria-expanded="${expanded}">${expanded ? t("list.less") : t("list.all", { n: notes.length })}</button></li>` : ""}</ul>` : ""}
      </article>`;
  }).join("");

  return `
    <header class="page-header">
      <p class="eyebrow">${t("cycles.eyebrow")}</p>
      <h1 tabindex="-1">${t("cycles.title")}</h1>
    </header>
    <section class="form-card glass chart-card" aria-labelledby="chartTitle">
      <h2 id="chartTitle">${t("chart.title")}</h2>
      ${cycleChart(cycles)}
      <dl class="mini-stats">
        <div><dt>${t("stats.shortest")}</dt><dd>${fmtStat(stats.shortest)}</dd></div>
        <div><dt>${t("stats.longest")}</dt><dd>${fmtStat(stats.longest)}</dd></div>
        <div><dt>${t("stats.average")}</dt><dd>${fmtStat(stats.average)}</dd></div>
        <div><dt>${t("stats.period")}</dt><dd>${fmtStat(stats.periodAverage)}</dd></div>
      </dl>
      ${symptoms.length ? `<div class="sym-summary"><h3>${t("insight.symptoms")}</h3>
        <ul class="sym-counts">${symptoms.map(([s, n]) => `<li>${esc(symLabel(s))}<span>${t("insight.times", { n })}</span></li>`).join("")}</ul></div>` : ""}
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
  let end = monthKey(core.addDays(today, 75));
  if (pred.level !== "none" && monthKey(pred.latest) > end) end = monthKey(pred.latest);

  const weekdays = t("weekdays").split(",");
  const months = [];
  for (let ym = start; ym <= end;) {
    const [y, m] = ym.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const count = new Date(y, m, 0).getDate();
    const cells = Array.from({ length: offset }, () => `<span class="calendar-day blank" aria-hidden="true"></span>`);
    const infos = Array.from({ length: count }, (_, i) => core.dayInfo(state, `${ym}-${String(i + 1).padStart(2, "0")}`, today, pred));
    const kind = (info) => (info?.period ? "period" : info?.predicted ? "predict" : "");
    for (let d = 1; d <= count; d += 1) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      const info = infos[d - 1];
      const col = (offset + d - 1) % 7;
      const run = kind(info);
      const runStart = run && (col === 0 || kind(infos[d - 2]) !== run);
      const runEnd = run && (col === 6 || kind(infos[d]) !== run);
      const cls = [info.period && "period", info.predicted && !info.period && "predict", runStart && "run-start", runEnd && "run-end", info.today && "today", info.hasNote && "has-note"].filter(Boolean).join(" ");
      const extra = [info.today && t("legend.today"), info.period && t("legend.period"), info.predicted && t("legend.predicted"), info.hasNote && t("legend.note")].filter(Boolean);
      cells.push(`<button class="calendar-day ${cls}" type="button" data-action="open-day" data-date="${iso}" ${info.future ? "disabled" : ""} aria-label="${esc([fmtLong(iso), ...extra].join(" · "))}">${d}</button>`);
    }
    months.push(`<section class="month" data-month="${ym}">
        <h2>${esc(fmtMonth(y, m - 1))}</h2>
        <div class="calendar-grid days">${cells.join("")}</div>
      </section>`);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  return `
    <div class="calendar-sticky">
      <header class="page-header row">
        <h1 tabindex="-1">${t("cal.title")}</h1>
        <button class="soft-button small" type="button" data-action="cal-today">${t("cal.today")}</button>
      </header>
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
  const padTop = parseFloat(getComputedStyle(app).paddingTop) || 0;
  const offset = target.offsetTop - padTop - (sticky ? sticky.offsetHeight + 8 : 0);
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

    <section class="form-card glass" aria-labelledby="setShare">
      <h2 id="setShare">${t("settings.share")}</h2>
      <p class="body-copy">${t("settings.shareBody")}</p>
      <div class="button-row">
        <button class="plain-button" type="button" data-action="export-summary" ${state.periods.length ? "" : "disabled"}>${t("settings.summary")}</button>
        <button class="plain-button" type="button" data-action="export-csv" ${state.periods.length || state.notes.length ? "" : "disabled"}>${t("settings.csv")}</button>
      </div>
    </section>

    <section class="form-card glass" aria-labelledby="setLock">
      <h2 id="setLock">${t("settings.lock")}</h2>
      <p class="body-copy">${t("settings.lockBody")}</p>
      <label class="field" for="lockPin"><span>${t(pinLock.isEnabled() ? "settings.lockCurrent" : "settings.lockPin")}</span>
        <input type="password" id="lockPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></label>
      ${pinLock.isEnabled() ? "" : `<label class="field" for="lockPin2"><span>${t("settings.lockPin2")}</span>
        <input type="password" id="lockPin2" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></label>`}
      <p class="field-error" id="lockError" role="alert"></p>
      <button class="plain-button" type="button" data-action="${pinLock.isEnabled() ? "lock-off" : "lock-on"}">${t(pinLock.isEnabled() ? "settings.lockOff" : "settings.lockOn")}</button>
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

// Shows a core.js error next to the control that caused it (field = "error" or "periodError"),
// scrolled into view, or commits the new state.
function sheetResult(result, toastKey, field = "error") {
  if (result.error) {
    sheet.error = "";
    sheet.periodError = "";
    sheet[field] = t(result.error);
    renderSheet();
    const alert = sheetRoot.querySelector("[role=alert]");
    alert?.scrollIntoView({ block: "nearest" });
    alert?.setAttribute("tabindex", "-1");
    alert?.focus({ preventScroll: true });
    return false;
  }
  if (sheet) {
    sheet.error = "";
    sheet.periodError = "";
  }
  commit(result.state, toastKey);
  return true;
}

const actions = {
  "toggle-language": () => setLanguage(other()),
  "set-lang": (el) => setLanguage(el.dataset.value),
  "goto-cycles": () => setView("cycles"),
  "open-info": () => openInfo(),
  "goto-prep": () => openInfo("#prepKit"),

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
    document.querySelector(`[data-action="prep-toggle"][data-value="${el.dataset.value}"]`)?.focus({ preventScroll: true });
  },

  "open-day": (el) => openDay(el.dataset.date),
  "close-sheet": () => requestClose(),
  "sheet-date": (el) => {
    switchDate(el.dataset.value);
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
    renderSheet(`[data-action="toggle-sym"][data-value="${CSS.escape(s)}"]`);
  },
  "add-sym": () => {
    const input = sheetRoot.querySelector("#customSym");
    const value = (input?.value || "").trim().slice(0, 24);
    if (!value) return;
    sheet.note = sheetRoot.querySelector("#sheetNote")?.value ?? sheet.note;
    sheet.symptoms.add(symptomKey(value));
    sheet.custom = "";
    sheet.confirm = false;
    renderSheet("#customSym");
  },
  "start-at": () => {
    const latest = core.latestPeriod(state);
    if ((latest && sheet.date < latest.startDate) || core.daysBetween(sheet.date, core.todayIso()) > 10) {
      // A past period (before the latest one, or long ago) needs both dates: hand over to the editor.
      const start = sheet.date;
      openPeriodEditor(null);
      sheet.start = start;
      renderSheet("#editEnd");
      return;
    }
    if (sheetResult(core.startPeriod(state, sheet.date), "toast.started", "periodError")) renderSheet("#secPeriod");
  },
  "end-at": () => {
    if (sheetResult(core.endPeriod(state, sheet.date), "toast.ended", "periodError")) renderSheet("#secPeriod");
  },
  "save-day": () => {
    const dates = dirtyDates();
    if (!dates.length) dates.push(sheet.date);
    // The date on screen last, so an error on another date can switch to it first.
    dates.sort((a, b) => (a === sheet.date) - (b === sheet.date));
    let next = state;
    let deleted = false;
    for (const date of dates) {
      const d = sheet.drafts[date];
      const pending = d.custom.trim().slice(0, 24);
      const symptoms = new Set(d.symptoms);
      if (pending) symptoms.add(symptomKey(pending));
      const id = d.noteId && next.notes.some((n) => n.id === d.noteId) ? d.noteId : null;
      const result = core.saveNote(next, { id, date, flow: d.flow, pain: d.pain, symptoms: [...symptoms], note: d.note });
      if (result.error) {
        if (date !== sheet.date) switchDate(date);
        sheetResult(result, null);
        return;
      }
      next = result.state;
      deleted = deleted || !!result.deleted;
    }
    commit(next, dates.length > 1 ? null : deleted ? "toast.deleted" : "toast.saved");
    if (dates.length > 1) showToast(t("toast.savedDays", { n: dates.length }));
    closeSheet();
  },
  "delete-day": () => {
    if (!sheet.confirm) {
      sheet.confirm = true;
      renderSheet("[data-action='delete-day']");
      return;
    }
    const others = dirtyDates().filter((date) => date !== sheet.date);
    commit(core.deleteNote(state, sheet.noteId), "toast.deleted");
    if (!others.length) { closeSheet(); return; }
    delete sheet.drafts[sheet.date];
    Object.assign(sheet, { confirm: false, closeArmed: false }, draftFor(sheet.date));
    renderSheet();
    focusSheet();
  },

  "edit-period": (el) => openPeriodEditor(el.dataset.id),
  "toggle-row": (el) => {
    const id = el.dataset.id;
    if (expandedRows.has(id)) expandedRows.delete(id);
    else expandedRows.add(id);
    const top = app.scrollTop;
    render();
    app.scrollTop = top;
    app.querySelector(`[data-action="toggle-row"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  },
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
      sheetResult({ error: "err.endMissing" }, null);
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
  "export-summary": () => {
    download(`cycle-summary-${core.todayIso()}.html`, report.buildSummaryHtml(state, { t, fmtLong, fmtShort, lang: state.language }), "text/html;charset=utf-8");
  },
  "export-csv": () => {
    download(`cycle-garden-${core.todayIso()}.csv`, report.buildCsv(state, t), "text/csv;charset=utf-8");
  },
  "lock-on": async () => {
    const input = document.querySelector("#lockPin");
    const pin = input?.value || "";
    if (!pinLock.isValidPin(pin)) { document.querySelector("#lockError").textContent = t("err.pinFormat"); input?.focus(); return; }
    if (document.querySelector("#lockPin2")?.value !== pin) { document.querySelector("#lockError").textContent = t("err.pinMismatch"); document.querySelector("#lockPin2")?.focus(); return; }
    await pinLock.setPin(pin);
    render();
    showToast(t("toast.lockOn"));
  },
  "lock-off": async () => {
    const input = document.querySelector("#lockPin");
    if (!(await pinLock.verify(input?.value || ""))) { document.querySelector("#lockError").textContent = t("err.pinWrong"); input?.focus(); return; }
    pinLock.clearPin();
    render();
    showToast(t("toast.lockOff"));
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
  // Any action other than the delete button itself disarms "tap again to delete".
  if (sheet?.confirm && !["delete-day", "delete-period"].includes(el.dataset.action)) sheet.confirm = false;
  actions[el.dataset.action]?.(el, event);
});

sheetRoot.addEventListener("change", (event) => {
  if (!sheet) return;
  const { id } = event.target;
  const today = core.todayIso();
  if (id === "sheetDate" && core.isIso(event.target.value)) {
    const future = event.target.value > today;
    switchDate(future ? today : event.target.value);
    renderSheet("#sheetDate");
    if (future) showToast(t("err.dateFuture"));
  } else if (id === "editStart" || id === "editEnd") {
    sheet.start = sheetRoot.querySelector("#editStart")?.value || "";
    sheet.end = sheetRoot.querySelector("#editEnd")?.value || "";
    sheet.confirm = false;
    renderSheet(`#${id}`);
  } else if (id === "editOngoing") {
    sheet.ongoing = event.target.checked;
    sheet.start = sheetRoot.querySelector("#editStart")?.value || sheet.start;
    sheet.end = sheetRoot.querySelector("#editEnd")?.value || sheet.end;
    sheet.confirm = false;
    renderSheet("#editOngoing");
  }
});

// Open the native picker on click (desktop browsers otherwise only focus the hidden segments).
sheetRoot.addEventListener("click", (event) => {
  const input = event.target.closest(".date-shell input[type=date], .moon-day.earlier input[type=date]");
  if (input && !input.disabled) {
    try { input.showPicker?.(); } catch { /* not allowed here: the input still works by keyboard */ }
  }
});

sheetRoot.addEventListener("input", (event) => {
  if (sheet?.type === "day" && event.target.id === "painRange") {
    const n = Number(event.target.value);
    sheet.pain = n;
    event.target.classList.remove("unset");
    event.target.style.setProperty("--p", `${(n / 5) * 100}%`);
    event.target.setAttribute("aria-valuetext", `${n} ${t(`pain.w${n}`)}`);
    sheetRoot.querySelector("#painWord").innerHTML = painWord(n);
    sheetRoot.querySelectorAll("[data-action='set-pain']").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.value) === n)));
  }
  if (sheet?.type === "day" && event.target.id === "sheetNote") sheet.note = event.target.value;
  if (sheet?.type === "day" && event.target.id === "customSym") sheet.custom = event.target.value;
  if (sheet) sheet.closeArmed = false;
  if (sheet?.confirm) {
    sheet.confirm = false;
    const del = sheetRoot.querySelector("[data-action='delete-day'], [data-action='delete-period']");
    if (del) del.textContent = t(sheet.type === "day" ? "sheet.deleteLog" : "editor.delete");
  }
});

sheetRoot.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.id === "customSym") {
    event.preventDefault();
    actions["add-sym"]();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheet) {
    event.preventDefault();
    requestClose();
  }
  // Keep Tab inside an open sheet. Only the two ends and focus that has left the sheet need help;
  // anywhere else (including a heading or alert with tabindex=-1) the browser's order is right.
  if (event.key === "Tab" && sheet) {
    const focusable = [...sheetRoot.querySelectorAll(".sheet button:not([disabled]), .sheet input:not([disabled]), .sheet textarea")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const outside = !sheetRoot.contains(active);
    if (event.shiftKey && (active === first || outside || active?.id === "sheetTitle")) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || outside)) { event.preventDefault(); first.focus(); }
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
  const top = app.scrollTop;
  render();
  app.scrollTop = top;
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
    // Merge into the state as it is now: anything committed while the transaction ran stays,
    // and that commit has already queued its own push.
    adoptMerged(core.mergeStates(state, merged).state);
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
      let owner = null;
      try { owner = localStorage.getItem(OWNER_KEY); } catch { /* storage blocked: treat as first sign-in */ }
      if (owner && owner !== user.uid && (state.periods.length || state.notes.length || state.deletedPeriodIds.length || state.deletedNoteIds.length)) {
        cloud.user = null;
        cloud.rejected = true;
        authMod.signOut(cloud.auth);
        showToast(t("toast.otherAccount"));
        return;
      }
      try { localStorage.setItem(OWNER_KEY, user.uid); } catch { /* sync still works this session */ }
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
      cloud.rejected = false;
      await authMod.signInWithPopup(cloud.auth, provider);
      if (!cloud.rejected) showToast(t("toast.signedIn"));
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
const lockRoot = document.querySelector("#lockRoot");
const lockOptions = () => ({
  t,
  cover: [app, document.querySelector(".bottom-nav"), sheetRoot],
  onUnlock: () => {
    moonrise.wake();
    if (sheet) { renderSheet(); focusSheet(); }
    else app.querySelector("h1")?.focus({ preventScroll: true });
  },
});
moonrise.mount(document.querySelector("#sky"), { isActive: () => view === "home" && !pinLock.isLocked() });
pinLock.lock(lockRoot, lockOptions());

document.addEventListener("visibilitychange", () => {
  pinLock.onVisibility(lockRoot, lockOptions());
  moonrise.wake();
  if (document.visibilityState === "visible" && core.todayIso() !== renderedDay) {
    renderedDay = core.todayIso();
    render();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Offline mode unavailable.", error));
}

render();
initCloud();
