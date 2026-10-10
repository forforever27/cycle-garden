// Exports for someone else to read: a CSV for spreadsheets and a one-page summary to show a
// doctor. Pure functions; the caller passes the translator and date formatters so the output
// follows the app language. Nothing here leaves the device unless the user shares the file.
import * as core from "./core.js";

// ---------- CSV ----------

// A cell that starts with = + - @ (or a tab/CR) is treated as a formula by Excel and Sheets;
// prefix it so a typed note can never run as one.
function cell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One table, one row per period and one per logged day, in date order, so it sorts and
// filters cleanly. Symptom keys are written as their labels in the current language.
export function buildCsv(state, t) {
  const cycles = new Map(core.getCycles(state).map((c) => [c.from.id, c]));
  const rows = [];
  for (const p of core.sortedPeriods(state)) {
    const cycle = cycles.get(p.id);
    rows.push({ date: p.startDate, cells: [t("csv.kind.period"), p.startDate, core.periodLength(p) === null ? "" : p.endDate, core.periodLength(p) ?? "", cycle ? cycle.length : "", cycle && !cycle.counted ? t("csv.notCounted") : "", "", "", "", ""] });
  }
  for (const n of state.notes) {
    const symptoms = n.symptoms.map((s) => (core.SYMPTOMS.includes(s) ? t(`sym.${s}`) : s)).join("; ");
    rows.push({ date: n.date, cells: [t("csv.kind.log"), n.date, "", "", "", "", n.flow ? t(`flow.${n.flow}`) : "", n.pain ?? "", symptoms, n.note || ""] });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const head = ["csv.kind", "csv.date", "csv.end", "csv.periodDays", "csv.cycleDays", "csv.counted", "csv.flow", "csv.pain", "csv.symptoms", "csv.note"].map((k) => t(k));
  const lines = [head, ...rows.map((r) => r.cells)].map((cells) => cells.map(cell).join(","));
  // BOM so Excel opens Chinese text as UTF-8; CRLF per RFC 4180.
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ---------- doctor summary ----------

const escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// The facts a clinician asks first: recent cycle and period lengths, how regular, flow and pain
// on period days, repeated symptoms, and the app's calm flags. Last 6 cycles, like the app.
export function summaryData(state, today = core.todayIso()) {
  const periods = core.sortedPeriods(state);
  const cycles = new Map(core.getCycles(state).map((c) => [c.from.id, c]));
  const recent = periods.slice(-7);
  const ranges = core.effectiveRanges(state.periods, today);
  const rows = recent.map((p) => {
    const [s, e] = ranges.get(p.id) || [p.startDate, p.startDate];
    const days = state.notes.filter((n) => s <= n.date && n.date <= e);
    const pains = days.map((n) => n.pain).filter((v) => v !== null);
    return {
      start: p.startDate,
      // an end that cannot be read or falls before the start is not shown as a date
      end: core.periodLength(p) === null ? null : p.endDate,
      open: !p.endDate && !p.badEnd,
      length: core.periodLength(p),
      cycle: cycles.get(p.id)?.length ?? null,
      counted: cycles.get(p.id)?.counted ?? true,
      heavyDays: days.filter((n) => n.flow === "heavy").length,
      maxPain: pains.length ? Math.max(...pains) : null,
    };
  });
  const since = recent[0]?.startDate;
  const counts = new Map();
  for (const n of state.notes) {
    if (!since || n.date < since) continue;
    for (const s of n.symptoms) counts.set(s, (counts.get(s) || 0) + 1);
  }
  return {
    today,
    first: periods[0]?.startDate || null,
    total: periods.length,
    stats: core.getStats(state),
    rows,
    symptoms: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8),
    flags: core.healthFlags(state, today),
  };
}

export function buildSummaryHtml(state, { t, fmtLong, fmtShort = fmtLong, lang }, today = core.todayIso()) {
  const d = summaryData(state, today);
  // the year is in the header line; table dates repeat it only when it differs
  const fd = (iso) => (iso.slice(0, 4) === today.slice(0, 4) ? fmtShort(iso) : fmtLong(iso));
  const days = (n) => (n === null || n === undefined ? "—" : t("list.days", { n }));
  const sym = (s) => (core.SYMPTOMS.includes(s) ? t(`sym.${s}`) : s);
  const rows = d.rows.slice().reverse().map((r) => `<tr>
      <td>${escHtml(fd(r.start))}</td>
      <td>${r.end ? escHtml(fd(r.end)) : r.open ? escHtml(t("list.open")) : "—"}</td>
      <td>${days(r.length)}</td>
      <td>${days(r.cycle)}${r.cycle !== null && !r.counted ? ` <small>(${escHtml(t("csv.notCounted"))})</small>` : ""}</td>
      <td>${r.heavyDays || "—"}</td>
      <td>${r.maxPain === null ? "—" : `${r.maxPain}/5`}</td>
    </tr>`).join("");
  const s = d.stats;
  const range = s.shortest === null ? "—" : s.shortest === s.longest ? days(s.shortest) : `${s.shortest}–${days(s.longest)}`;
  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-Hans" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(t("report.title"))}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px 20px 48px; background: #fff; color: #1d1b26;
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  h2 { margin: 28px 0 10px; font-size: 16px; }
  .meta { margin: 0; color: #5d5868; font-size: 13px; }
  dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0 0; }
  dl div { padding: 12px; border: 1px solid #e3e0ea; border-radius: 10px; }
  dt { color: #5d5868; font-size: 12px; }
  dd { margin: 2px 0 0; font-size: 18px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #e3e0ea; text-align: left; vertical-align: top; }
  th { color: #5d5868; font-size: 12px; font-weight: 600; }
  td:nth-child(-n+2) { white-space: nowrap; }
  small { color: #5d5868; }
  ul { margin: 0; padding-left: 20px; }
  .note { margin-top: 28px; color: #5d5868; font-size: 12px; }
  .print { margin-top: 24px; padding: 10px 18px; border: 1px solid #1d1b26; border-radius: 999px; background: #fff; font: inherit; cursor: pointer; }
  @media (max-width: 560px) { dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } th, td { padding: 8px 4px; font-size: 13px; } }
  @media print { body { padding: 0; } .print { display: none; } }
</style>
</head>
<body>
<main>
  <h1>${escHtml(t("report.title"))}</h1>
  <p class="meta">${escHtml(t("report.meta", { date: fmtLong(d.today), n: d.total, first: d.first ? fmtLong(d.first) : "—" }))}</p>
  <dl>
    <div><dt>${escHtml(t("report.cycleRange"))}</dt><dd>${escHtml(range)}</dd></div>
    <div><dt>${escHtml(t("stats.average"))}</dt><dd>${escHtml(days(s.average))}</dd></div>
    <div><dt>${escHtml(t("stats.period"))}</dt><dd>${escHtml(days(s.periodAverage))}</dd></div>
    <div><dt>${escHtml(t("report.cycles"))}</dt><dd>${s.cycleCount}</dd></div>
  </dl>
  <h2>${escHtml(t("report.recent"))}</h2>
  ${d.rows.length ? `<table>
    <thead><tr><th>${escHtml(t("report.start"))}</th><th>${escHtml(t("csv.end"))}</th><th>${escHtml(t("csv.periodDays"))}</th><th>${escHtml(t("csv.cycleDays"))}</th><th>${escHtml(t("report.heavyDays"))}</th><th>${escHtml(t("report.maxPain"))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : `<p>${escHtml(t("report.none"))}</p>`}
  <h2>${escHtml(t("report.symptoms"))}</h2>
  ${d.symptoms.length ? `<ul>${d.symptoms.map(([k, n]) => `<li>${escHtml(sym(k))} · ${escHtml(t("insight.times", { n }))}</li>`).join("")}</ul>` : `<p>—</p>`}
  <h2>${escHtml(t("flags.title"))}</h2>
  ${d.flags.length ? `<ul>${d.flags.map((f) => `<li>${escHtml(t(f))}</li>`).join("")}</ul>` : `<p>${escHtml(t("report.noFlags"))}</p>`}
  <p class="note">${escHtml(t("report.footer"))}</p>
  <button class="print" type="button" onclick="window.print()">${escHtml(t("report.print"))}</button>
</main>
</body>
</html>
`;
}
