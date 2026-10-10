// Pure data and date logic. No DOM, no storage, no network.
// Imported by app.js and by tests.html, so every rule here is testable on its own.

export const DAY = 24 * 60 * 60 * 1000;
export const SCHEMA = 2;
export const FLOWS = ["spotting", "light", "medium", "heavy"];
export const SYMPTOMS = ["cramps", "tired", "mood", "sleep", "headache", "bloating"];

// ---------- dates (ISO yyyy-mm-dd, local calendar days) ----------

export function toIso(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function todayIso() {
  return toIso(new Date());
}

export function parseIso(iso) {
  return new Date(`${iso}T00:00:00`);
}

// Strict: "2026-02-30" is rejected rather than silently rolled into March.
export function isIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseIso(value);
  return !Number.isNaN(date.getTime()) && toIso(date) === value;
}

export function addDays(iso, days) {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function daysBetween(a, b) {
  return Math.round((parseIso(b) - parseIso(a)) / DAY);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Short stable hash (FNV-1a) for ids derived from a record's content.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---------- state shape ----------

export function emptyState() {
  return {
    schema: SCHEMA,
    language: "zh",
    periods: [],
    notes: [],
    deletedPeriodIds: [],
    deletedNoteIds: [],
    settings: { prepDays: 5, reminderTime: "09:00", updatedAt: "" },
    prep: { cycleStart: "", done: [], updatedAt: "" },
  };
}

const strArray = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);

// Period fields that merge one by one, each with its own timestamp in period.t.
export const PERIOD_FIELDS = ["startDate", "endDate", "cycleMode"];

// Accepts anything (v1 localStorage, a backup file, a Firestore doc) and returns a clean v2 state.
// A period with a bad end date is kept (end set to its start, badEnd flagged) and reported by
// findProblems(), because silently deleting or reopening health records is worse than a
// "needs fixing" flag. Only records with no usable date at all are dropped: they cannot be
// placed on a calendar, and no version of the app could create them.
// Records without an id get one derived from their content, so every device derives the same id.
export function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const deletedPeriodIds = strArray(raw.deletedPeriodIds);
  const deletedNoteIds = strArray(raw.deletedNoteIds);
  const deadP = new Set(deletedPeriodIds);
  const deadN = new Set(deletedNoteIds);

  const periods = (Array.isArray(raw.periods) ? raw.periods : [])
    .filter((p) => p && isIso(p.startDate))
    .map((p) => {
      const updatedAt = typeof p.updatedAt === "string" ? p.updatedAt : typeof p.createdAt === "string" ? p.createdAt : "";
      const badEnd = !!p.badEnd || (p.endDate !== undefined && p.endDate !== null && p.endDate !== "" && !isIso(p.endDate));
      const t = {};
      PERIOD_FIELDS.forEach((field) => { t[field] = typeof p.t?.[field] === "string" ? p.t[field] : updatedAt; });
      const period = {
        id: typeof p.id === "string" && p.id ? p.id : `p-${p.startDate}-${hash(JSON.stringify([p.endDate ?? ""]))}`,
        startDate: p.startDate,
        endDate: badEnd ? p.startDate : isIso(p.endDate) ? p.endDate : "",
        cycleMode: ["include", "exclude"].includes(p.cycleMode) ? p.cycleMode : "auto",
        createdAt: typeof p.createdAt === "string" ? p.createdAt : "",
        updatedAt,
        t,
      };
      if (badEnd) period.badEnd = true;
      return period;
    })
    .filter((p) => !deadP.has(p.id));

  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .filter((n) => n && isIso(n.date))
    .map((n) => ({
      id: typeof n.id === "string" && n.id ? n.id : `n-${n.date}-${hash(JSON.stringify([n.note ?? "", n.symptoms ?? [], n.flow ?? "", n.pain ?? null]))}`,
      date: n.date,
      symptoms: strArray(n.symptoms),
      note: typeof n.note === "string" ? n.note : "",
      flow: FLOWS.includes(n.flow) ? n.flow : "",
      pain: Number.isInteger(n.pain) && n.pain >= 0 && n.pain <= 5 ? n.pain : null,
      createdAt: typeof n.createdAt === "string" ? n.createdAt : "",
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : "",
    }))
    .filter((n) => !deadN.has(n.id));

  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const prepDays = Number(s.prepDays);
  const settings = {
    prepDays: Number.isFinite(prepDays) ? Math.min(14, Math.max(1, Math.round(prepDays))) : 5,
    reminderTime: typeof s.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.reminderTime) ? s.reminderTime : "09:00",
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : "",
  };

  const pr = raw.prep && typeof raw.prep === "object" ? raw.prep : {};
  const prep = {
    cycleStart: isIso(pr.cycleStart) ? pr.cycleStart : "",
    done: strArray(pr.done),
    updatedAt: typeof pr.updatedAt === "string" ? pr.updatedAt : "",
  };

  // Canonical order everywhere, so the same data always serialises the same way on every device
  // (merge results compare equal in either direction, and sync does not keep re-writing).
  return {
    schema: SCHEMA,
    language: raw.language === "en" ? "en" : "zh",
    periods: periods.sort(byKey("startDate", "id")),
    notes: notes.sort(byKey("date", "id")),
    deletedPeriodIds: [...new Set(deletedPeriodIds)].sort(),
    deletedNoteIds: [...new Set(deletedNoteIds)].sort(),
    settings,
    prep,
  };
}

// What goes to the cloud: everything except the per-device language choice.
export function toCloud(state) {
  const { language, ...rest } = state;
  return rest;
}

// ---------- merge (sync, import) ----------
// Records merge by id and deletions win over everything. Periods merge field by field: each of
// startDate / endDate / cycleMode keeps the value with the newest timestamp, so an end date set on
// one device survives a start-date edit made on another. Notes merge as whole records.
// Ties (same timestamp, different value) break the same way on every device, so they converge.

const later = (a, b) => ((a || "") > (b || "") ? a : b || "");

function mergePeriod(a, b) {
  const out = { ...a, t: { ...a.t } };
  delete out.badEnd;
  let endFrom = a;
  PERIOD_FIELDS.forEach((field) => {
    const ta = a.t[field] || "";
    const tb = b.t[field] || "";
    const tie = tb === ta && (String(b[field]) > String(a[field]) || (String(b[field]) === String(a[field]) && !!b.badEnd > !!a.badEnd));
    if (tb > ta || tie) {
      out[field] = b[field];
      out.t[field] = tb;
      if (field === "endDate") endFrom = b;
    }
  });
  // badEnd describes the end date, so it travels with whichever copy's end date won.
  if (endFrom.badEnd && out.endDate === endFrom.endDate) out.badEnd = true;
  out.updatedAt = later(a.updatedAt, b.updatedAt);
  if (b.createdAt && (!a.createdAt || b.createdAt < a.createdAt)) out.createdAt = b.createdAt;
  return out;
}

function mergeNote(a, b) {
  const ta = a.updatedAt || "";
  const tb = b.updatedAt || "";
  if (tb > ta) return b;
  if (tb === ta && JSON.stringify(b) > JSON.stringify(a)) return b;
  return a;
}

function mergeRecords(local, incoming, deleted, combine) {
  const byId = new Map();
  local.forEach((record) => { if (!deleted.has(record.id)) byId.set(record.id, record); });
  let added = 0;
  incoming.forEach((record) => {
    if (deleted.has(record.id)) return;
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, record);
      added += 1;
    } else {
      byId.set(record.id, combine(existing, record));
    }
  });
  return { records: [...byId.values()], added };
}

const newer = (a, b) => {
  const ta = a?.updatedAt || "";
  const tb = b?.updatedAt || "";
  if (tb > ta) return b;
  if (tb === ta && JSON.stringify(b) > JSON.stringify(a)) return b;
  return a;
};

export function mergeStates(localRaw, incomingRaw) {
  const local = normalize(localRaw);
  const incoming = normalize(incomingRaw);
  const deadP = new Set([...local.deletedPeriodIds, ...incoming.deletedPeriodIds]);
  const deadN = new Set([...local.deletedNoteIds, ...incoming.deletedNoteIds]);
  const periods = mergeRecords(local.periods, incoming.periods, deadP, mergePeriod);
  const notes = mergeRecords(local.notes, incoming.notes, deadN, mergeNote);
  return {
    state: normalize({
      ...local,
      periods: periods.records,
      notes: notes.records,
      deletedPeriodIds: [...deadP],
      deletedNoteIds: [...deadN],
      settings: newer(local.settings, incoming.settings),
      prep: newer(local.prep, incoming.prep),
    }),
    added: { periods: periods.added, notes: notes.added },
  };
}

export function sameData(a, b) {
  return JSON.stringify(toCloud(normalize(a))) === JSON.stringify(toCloud(normalize(b)));
}

// ---------- periods ----------

// Canonical order: by start date, then id, so every device picks the same "latest" period even
// when two share a start date.
const byKey = (...keys) => (a, b) => {
  for (const key of keys) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
};

export function sortedPeriods(state) {
  return [...state.periods].sort(byKey("startDate", "id"));
}

export function latestPeriod(state) {
  return sortedPeriods(state).at(-1) || null;
}

// Only the most recent period can be in progress. An earlier period with no end date (two devices
// each started one before syncing, or a later period was back-filled) is "stale": it is treated as
// ending the day before the next period starts, and findProblems() asks for its real end date.
export function openPeriod(state) {
  const last = latestPeriod(state);
  return last && !last.endDate ? last : null;
}

export function periodLength(period) {
  if (!period.endDate || period.badEnd || period.endDate < period.startDate) return null;
  return daysBetween(period.startDate, period.endDate) + 1;
}

// The day range a single period covers on its own. Open runs to today; a broken one (end before
// start, or unreadable end) covers only its start day.
export function periodRange(period, today = todayIso()) {
  if (!period.endDate) return [period.startDate, today < period.startDate ? period.startDate : today];
  return [period.startDate, period.endDate < period.startDate ? period.startDate : period.endDate];
}

// Ranges with stale open periods cut off the day before the next period starts.
export function effectiveRanges(periods, today = todayIso()) {
  const sorted = sortedPeriods({ periods });
  const ranges = new Map();
  sorted.forEach((p, i) => {
    let [s, e] = periodRange(p, today);
    const next = sorted[i + 1];
    if (!p.endDate && next) {
      // A stale open period ends the day before the next one starts. If both started the same day
      // (two devices tapped Start before syncing) the stale copy covers no days at all: it is a
      // duplicate, reported by findProblems, and must not block the real one.
      const cut = addDays(next.startDate, -1);
      if (cut < e) e = cut;
    }
    ranges.set(p.id, [s, e]);
  });
  return ranges;
}

// Two day ranges share at least one day. An empty range (end before start) overlaps nothing.
function overlaps([as, ae], [bs, be]) {
  return as <= ae && bs <= be && as <= be && bs <= ae;
}

export function periodOn(state, iso, today = todayIso()) {
  const ranges = effectiveRanges(state.periods, today);
  return state.periods.find((p) => {
    const [s, e] = ranges.get(p.id);
    return s <= iso && iso <= e;
  }) || null;
}

// Returns an error code (a key for the i18n table) or null when the period is acceptable.
// Overlap is checked on effective ranges: adding or ending a later period is allowed even if an
// earlier one was left open, and that earlier one is then reported as needing an end date.
export function validatePeriod(periods, candidate, today = todayIso()) {
  if (!isIso(candidate.startDate)) return "err.startMissing";
  if (candidate.startDate > today) return "err.startFuture";
  if (candidate.endDate) {
    if (!isIso(candidate.endDate)) return "err.endInvalid";
    if (candidate.endDate < candidate.startDate) return "err.endBeforeStart";
    if (candidate.endDate > today) return "err.endFuture";
  }
  const others = periods.filter((p) => p.id !== candidate.id);
  if (!candidate.endDate) {
    // Only the period actually in progress (the latest one) blocks a new open period. An open
    // candidate that starts before an existing period would be stale the moment it is saved.
    const latestOther = sortedPeriods({ periods: others }).at(-1);
    if (latestOther && !latestOther.endDate) return "err.openExists";
    if (latestOther && latestOther.startDate >= candidate.startDate) return "err.pastNeedsEnd";
  }
  const all = [...others, { ...candidate, id: candidate.id || "__candidate" }];
  const ranges = effectiveRanges(all, today);
  const own = ranges.get(candidate.id || "__candidate");
  for (const p of others) {
    if (overlaps(own, ranges.get(p.id))) return "err.overlap";
  }
  return null;
}

const stamp = () => new Date().toISOString();

export function startPeriod(state, date, now = stamp()) {
  return savePeriod(state, { startDate: date, endDate: "", cycleMode: "auto" }, now);
}

export function endPeriod(state, date, now = stamp()) {
  const open = openPeriod(state);
  if (!open) return { state, error: "err.noOpen" };
  return savePeriod(state, { ...open, endDate: date }, now);
}

// Creates or edits a period. Only fields whose value changed get a new timestamp, which is what
// lets merge keep another device's edit to a different field.
export function savePeriod(state, period, now = stamp()) {
  const existing = period.id ? state.periods.find((p) => p.id === period.id) : null;
  const record = {
    id: existing ? existing.id : period.id || uuid(),
    startDate: period.startDate,
    endDate: period.endDate || "",
    cycleMode: ["include", "exclude"].includes(period.cycleMode) ? period.cycleMode : "auto",
    createdAt: existing?.createdAt || period.createdAt || now,
    updatedAt: now,
    t: {},
  };
  PERIOD_FIELDS.forEach((field) => {
    const unchanged = existing && existing[field] === record[field] && !existing.badEnd;
    record.t[field] = unchanged ? existing.t?.[field] || existing.updatedAt || now : now;
  });
  const error = validatePeriod(state.periods, record);
  if (error) return { state, error };
  const periods = existing ? state.periods.map((p) => (p.id === record.id ? record : p)) : [...state.periods, record];
  return { state: { ...state, periods }, error: null, period: record };
}

export function deletePeriod(state, id) {
  return {
    ...state,
    periods: state.periods.filter((p) => p.id !== id),
    deletedPeriodIds: state.deletedPeriodIds.includes(id) ? state.deletedPeriodIds : [...state.deletedPeriodIds, id],
  };
}

// Periods with dates that cannot be right: saved by the old version (which had no date checks),
// or produced when two devices edit before syncing. One entry per period, first problem only.
export function findProblems(state, today = todayIso()) {
  const found = new Map();
  const flag = (id, code) => { if (!found.has(id)) found.set(id, { id, code }); };
  const sorted = sortedPeriods(state);
  sorted.forEach((p) => {
    if (p.badEnd) flag(p.id, "err.endInvalid");
    else if (p.endDate && p.endDate < p.startDate) flag(p.id, "err.endBeforeStart");
    else if (p.startDate > today) flag(p.id, "err.startFuture");
    else if (p.endDate > today) flag(p.id, "err.endFuture");
  });
  sorted.slice(0, -1).filter((p) => !p.endDate).forEach((p) => flag(p.id, "err.staleOpen"));
  const ranges = effectiveRanges(sorted, today);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (overlaps(ranges.get(sorted[i].id), ranges.get(sorted[j].id))) flag(sorted[j].id, "err.overlap");
    }
  }
  for (let i = 1; i < sorted.length; i += 1) {
    // Reported on the earlier period, whose editor has the "count this cycle" switch; choosing
    // include/exclude there means "both are real" and ends the report. One report per pair.
    const [a, b] = [sorted[i - 1], sorted[i]];
    if (daysBetween(a.startDate, b.startDate) < MIN_GAP && a.cycleMode === "auto" && !found.has(a.id) && !found.has(b.id)) flag(a.id, "err.tooClose");
  }
  return [...found.values()];
}

// ---------- notes ----------

export function notesOn(state, iso) {
  return state.notes.filter((n) => n.date === iso).sort((a, b) => ((a.updatedAt || "") < (b.updatedAt || "") ? 1 : -1));
}

export function saveNote(state, note, now = stamp()) {
  const existing = note.id ? state.notes.find((n) => n.id === note.id) : null;
  const record = {
    id: note.id || uuid(),
    date: note.date,
    symptoms: strArray(note.symptoms),
    note: (note.note || "").trim(),
    flow: FLOWS.includes(note.flow) ? note.flow : "",
    pain: Number.isInteger(note.pain) && note.pain >= 0 && note.pain <= 5 ? note.pain : null,
    createdAt: existing?.createdAt || note.createdAt || now,
    updatedAt: now,
  };
  if (!isIso(record.date)) return { state, error: "err.dateInvalid" };
  if (record.date > todayIso()) return { state, error: "err.dateFuture" };
  const empty = !record.note && !record.symptoms.length && !record.flow && record.pain === null;
  if (empty) {
    // Clearing every field of an existing note is a delete.
    if (note.id && state.notes.some((n) => n.id === note.id)) return { state: deleteNote(state, note.id), error: null, deleted: true };
    return { state, error: "err.noteEmpty" };
  }
  const exists = state.notes.some((n) => n.id === record.id);
  const notes = exists ? state.notes.map((n) => (n.id === record.id ? record : n)) : [...state.notes, record];
  return { state: { ...state, notes }, error: null, note: record };
}

export function deleteNote(state, id) {
  return {
    ...state,
    notes: state.notes.filter((n) => n.id !== id),
    deletedNoteIds: state.deletedNoteIds.includes(id) ? state.deletedNoteIds : [...state.deletedNoteIds, id],
  };
}

// ---------- cycles and prediction ----------

// One entry per gap between consecutive period starts.
// The include/exclude switch for a cycle lives on the period that STARTS it (cycle.from), so the
// history row for a period and its editor talk about the same gap.
// counted=false when the user excluded it, or (auto) when it looks like a period was never
// logged: at least twice the median of the other cycles AND a one-off. A long cycle that
// repeats (another cycle within 25% of it) is a real pattern and always counts.
// A cycle shorter than MIN_GAP days is almost always one period logged twice (two devices
// before a sync) or a mistyped date: it is not counted, and findProblems reports the pair.
// Every period is kept, so nothing disappears from the history.
export const MIN_GAP = 10;
export function getCycles(state) {
  const ps = sortedPeriods(state);
  const cycles = [];
  for (let i = 1; i < ps.length; i += 1) {
    cycles.push({ from: ps[i - 1], to: ps[i], length: daysBetween(ps[i - 1].startDate, ps[i].startDate) });
  }
  return cycles.map((cycle, index) => {
    const tooShort = cycle.length < MIN_GAP;
    const others = cycles.filter((c, j) => j !== index && c.length >= MIN_GAP).map((c) => c.length);
    const repeats = others.some((length) => Math.abs(length - cycle.length) <= Math.max(length, cycle.length) * 0.25);
    const likelyMissed = others.length >= 3 && cycle.length >= 2 * median(others) && !repeats;
    const mode = cycle.from.cycleMode;
    const counted = mode === "include" ? true : mode === "exclude" ? false : !likelyMissed && !tooShort;
    return { ...cycle, counted, tooShort, autoExcluded: mode === "auto" && (likelyMissed || tooShort) };
  });
}

// Range prediction (brief §6): last 6 counted cycles, window from shortest to longest.
// level: "none" (fewer than 3 periods: "not enough data yet", brief §6)
//        "rough" (2 cycles: widened by 3 days each side, at least 7 days wide) · "recent" (3+).
export const MIN_CYCLES = 2;
export function predict(state) {
  const last = latestPeriod(state);
  const cycles = getCycles(state).filter((c) => c.counted).slice(-6);
  const lengths = cycles.map((c) => c.length);
  if (!last || lengths.length < MIN_CYCLES) return { level: "none", count: lengths.length, last };
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const level = lengths.length < 3 ? "rough" : "recent";
  const pad = level === "rough" ? 3 : 0;
  const lo = Math.max(14, min - pad);
  const hi = Math.max(level === "rough" ? lo + 6 : lo + 4, max + pad);
  return {
    level,
    count: lengths.length,
    last,
    min,
    max,
    avg: Math.round(mean(lengths)),
    spread: max - min,
    steady: level === "recent" && max - min <= 7,
    earliest: addDays(last.startDate, lo),
    latest: addDays(last.startDate, hi),
  };
}

// What the Home screen should say today.
// kind: empty · period · learning · waiting · prep · window · late
export function getStatus(state, today = todayIso()) {
  const last = latestPeriod(state);
  if (!last) return { kind: "empty" };
  const cycleDay = Math.max(1, daysBetween(last.startDate, today) + 1);
  const open = openPeriod(state);
  if (open) {
    const day = Math.max(1, daysBetween(open.startDate, today) + 1);
    return { kind: "period", day, long: day > 10, cycleDay, open, pred: predict(state) };
  }
  const pred = predict(state);
  if (pred.level === "none") return { kind: "learning", cycleDay, pred };
  const prepStart = addDays(pred.earliest, -state.settings.prepDays);
  const base = { cycleDay, pred, prepStart };
  if (today < prepStart) return { ...base, kind: "waiting", daysToPrep: daysBetween(today, prepStart), daysToWindow: daysBetween(today, pred.earliest) };
  if (today < pred.earliest) return { ...base, kind: "prep", daysToWindow: daysBetween(today, pred.earliest) };
  if (today <= pred.latest) {
    return { ...base, kind: "window", windowDay: daysBetween(pred.earliest, today) + 1, windowLength: daysBetween(pred.earliest, pred.latest) + 1 };
  }
  return { ...base, kind: "late", daysLate: daysBetween(pred.latest, today) };
}

// Day classification used by the week strip and the calendar.
export function dayInfo(state, iso, today = todayIso(), pred = predict(state)) {
  const period = periodOn(state, iso, today);
  const predicted = !period && !openPeriod(state) && pred.level !== "none" && iso >= pred.earliest && iso <= pred.latest && iso >= today;
  return { period: !!period, predicted, today: iso === today, future: iso > today, hasNote: state.notes.some((n) => n.date === iso) };
}

// ---------- insights and health flags (brief §7) ----------

export function getStats(state) {
  const cycles = getCycles(state).filter((c) => c.counted).slice(-6).map((c) => c.length);
  const lengths = sortedPeriods(state).map(periodLength).filter((n) => n !== null).slice(-6);
  return {
    cycleCount: cycles.length,
    shortest: cycles.length ? Math.min(...cycles) : null,
    longest: cycles.length ? Math.max(...cycles) : null,
    average: cycles.length ? Math.round(mean(cycles)) : null,
    periodAverage: lengths.length ? Math.round(mean(lengths)) : null,
  };
}

// Calm, non-diagnostic flags. Each needs a repeated pattern, never a single event.
export function healthFlags(state, today = todayIso()) {
  const flags = [];
  const cycles = getCycles(state).filter((c) => c.counted).slice(-6).map((c) => c.length);
  if (cycles.filter((n) => n < 21).length >= 2) flags.push("flag.short");
  if (cycles.filter((n) => n > 35).length >= 2) flags.push("flag.long");
  const last = latestPeriod(state);
  if (last && !openPeriod(state) && daysBetween(last.startDate, today) >= 90) flags.push("flag.absent");
  const recent = sortedPeriods(state).slice(-3);
  const ranges = effectiveRanges(state.periods, today);
  // Only the period actually in progress counts days so far; a stale open one has no known length.
  const current = openPeriod(state);
  const daysSoFar = (p) => periodLength(p) ?? (current && p.id === current.id ? daysBetween(p.startDate, today) + 1 : 0);
  if (recent.filter((p) => daysSoFar(p) > 7).length >= 2) flags.push("flag.longBleed");
  const covers = (p, n) => {
    const [s, e] = ranges.get(p.id);
    return s <= n.date && n.date <= e;
  };
  const recentNotes = recent.length ? state.notes.filter((n) => n.date >= recent[0].startDate) : [];
  const periodsWith = (test) => recent.filter((p) => recentNotes.some((n) => test(n) && covers(p, n))).length;
  if (periodsWith((n) => n.flow === "heavy") >= 2) flags.push("flag.heavy");
  if (periodsWith((n) => n.pain !== null && n.pain >= 4) >= 2) flags.push("flag.pain");
  // Spotting between periods counts by episode (days more than 3 apart), so one 2-day episode
  // is not a pattern.
  const outside = recentNotes
    .filter((n) => (n.flow === "spotting" || n.flow === "light") && !recent.some((p) => covers(p, n)))
    .map((n) => n.date)
    .sort();
  const episodes = outside.filter((date, i) => i === 0 || daysBetween(outside[i - 1], date) > 3).length;
  if (episodes >= 2) flags.push("flag.spotting");
  return flags;
}

// ---------- calendar export ----------
// Event names are deliberately discreet (Locked in 00_START_HERE.md). Never rename them.
// Reminder plan (brief §9): prep reminder prepDays before the earliest date · the window itself
// · a check-in every 2 days through the window · a check-in the day after the window if nothing
// was logged · restock once a month. Alarms fire at the reminder time on the event day.
// UIDs are stable per predicted window so re-importing updates instead of duplicating.

export function buildIcs(state, now = new Date(), today = todayIso()) {
  const pred = predict(state);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cycle Garden//PWA//EN", "CALSCALE:GREGORIAN"];
  if (pred.level !== "none" && !openPeriod(state)) {
    const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const key = pred.earliest.replace(/-/g, "");
    const [hh, mm] = state.settings.reminderTime.split(":").map(Number);
    const ymd = (iso) => iso.replace(/-/g, "");
    const event = (uid, title, start, endExclusive, rrule) => [
      "BEGIN:VEVENT",
      `UID:${uid}@cycle-garden`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(endExclusive)}`,
      ...(rrule ? [`RRULE:${rrule}`] : []),
      `SUMMARY:${title}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${title}`, `TRIGGER;RELATED=START:PT${hh}H${mm}M`, "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
    // Monthly restock anchored on day 28 at the latest, so FREQ=MONTHLY never skips a short month.
    let restock = addDays(pred.earliest, -state.settings.prepDays - 2);
    if (Number(restock.slice(8, 10)) > 28) restock = `${restock.slice(0, 8)}28`;
    lines.push(event("restock", "Restock essentials", restock, addDays(restock, 1), "FREQ=MONTHLY;COUNT=12"));
    if (today <= pred.latest) {
      const prep = addDays(pred.earliest, -state.settings.prepDays);
      if (prep >= today) lines.push(event(`prep-${key}`, "Personal prep", prep, addDays(prep, 1)));
      lines.push(event(`window-${key}`, "Personal window", pred.earliest, addDays(pred.latest, 1)));
      lines.push(event(`checkin-${key}`, "Body check-in", pred.earliest, addDays(pred.earliest, 1), `FREQ=DAILY;INTERVAL=2;UNTIL=${ymd(pred.latest)}`));
      // The start-date reminder (brief §9): the day after the window, whatever the window's length.
      const after = addDays(pred.latest, 1);
      lines.push(event(`checkin-after-${key}`, "Body check-in", after, addDays(after, 1)));
    } else {
      // Already later than the window: one check-in tomorrow instead of events in the past. Same
      // UID for the whole late stretch, so importing again moves it instead of adding another.
      const tomorrow = addDays(today, 1);
      lines.push(event(`checkin-after-${key}`, "Body check-in", tomorrow, addDays(tomorrow, 1)));
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
