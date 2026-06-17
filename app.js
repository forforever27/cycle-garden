const STORAGE_KEY = "xy-period-tracker-pwa-v1";
const DAY = 24 * 60 * 60 * 1000;

const initialState = {
  language: "zh",
  periods: [],
  notes: [],
  settings: {
    prepDays: 5,
    reminderTime: "09:00",
  },
};

let state = loadState();
let view = "home";
let selectedSymptoms = new Set();

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  view = button.dataset.view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  render();
});

app.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const symptom = event.target.closest("[data-symptom]")?.dataset.symptom;

  if (symptom) {
    const button = event.target.closest("[data-symptom]");
    if (selectedSymptoms.has(symptom)) selectedSymptoms.delete(symptom);
    else selectedSymptoms.add(symptom);
    button.classList.toggle("active");
    return;
  }

  if (!action) return;
  actions[action]?.();
});

app.addEventListener("change", (event) => {
  if (event.target.id === "importFile") {
    handleImportFile(event.target.files?.[0]);
    event.target.value = "";
  }
});

const actions = {
  "toggle-language": () => {
    state.language = state.language === "zh" ? "en" : "zh";
    saveState();
    render();
  },
  "start-period": () => {
    const date = getRecordDate();
    const active = state.periods.find((period) => !period.endDate);
    if (active) {
      showToast("已经有一段正在记录中。");
      return;
    }
    state.periods.push({ id: crypto.randomUUID(), startDate: date, endDate: "", createdAt: new Date().toISOString() });
    saveState();
    showToast("已记录开始。");
    view = "home";
    render();
  },
  "end-period": () => {
    const date = getRecordDate();
    const active = [...state.periods].reverse().find((period) => !period.endDate);
    if (!active) {
      showToast("目前没有进行中的月经记录。");
      return;
    }
    active.endDate = date;
    active.updatedAt = new Date().toISOString();
    saveState();
    showToast("已记录结束。");
    view = "home";
    render();
  },
  "save-note": () => {
    const note = document.querySelector("#noteText")?.value.trim();
    if (!note && !selectedSymptoms.size) {
      showToast("没有要保存的内容。");
      return;
    }
    state.notes.push({
      id: crypto.randomUUID(),
      date: getRecordDate(),
      symptoms: [...selectedSymptoms],
      note,
      createdAt: new Date().toISOString(),
    });
    selectedSymptoms = new Set();
    saveState();
    showToast("备注已保存。");
    view = "log";
    render();
  },
  "save-settings": () => {
    state.settings.prepDays = Number(document.querySelector("#prepDays").value || 5);
    state.settings.reminderTime = document.querySelector("#reminderTime").value || "09:00";
    saveState();
    showToast("设置已保存。");
  },
  "export-data": () => {
    const stamp = today().replace(/-/g, "");
    downloadFile(`cycle-garden-backup-${stamp}.json`, JSON.stringify(state, null, 2), "application/json");
    showToast("已导出备份，请保存到安全的地方。");
  },
  "import-data": () => document.querySelector("#importFile")?.click(),
  "calendar-ics": () => {
    const ics = buildIcs();
    downloadFile("period-reminders.ics", ics, "text/calendar");
  },
};

function render() {
  const template = document.querySelector(`#${view}-template`);
  app.replaceChildren(template.content.cloneNode(true));

  if (view === "home") renderHome();
  if (view === "record") renderRecord();
  if (view === "log") renderLog();
  if (view === "calendar") renderCalendar();
  if (view === "settings") renderSettings();
}

function renderHome() {
  const insights = getInsights();
  bindText("cycleDay", insights.cycleDay ?? "--");
  bindText("predictionWindow", insights.predictionWindow);
  bindText("predictionCopy", insights.predictionCopy);
  bindText("confidenceText", insights.confidence ? `${insights.confidence}%` : "--");
  bindText("lastPeriod", insights.lastPeriodLabel);
  bindText("lastPeriodMeta", insights.lastPeriodMeta);
  bindText("averageCycle", insights.averageCycle ? `${insights.averageCycle}d` : "--");
  bindText("reminderText", insights.reminderText);

  const progress = Math.min(0.92, Math.max(0.08, (insights.cycleDay || 1) / (insights.averageCycle || 31)));
  document.querySelector("[data-bind-style='ring']").style.strokeDashoffset = String(284 - 284 * progress);
  document.querySelector("[data-bind-style='confidence']").style.width = `${insights.confidence || 18}%`;
  document.querySelector("[data-bind='weekRow']").innerHTML = renderWeek();
}

function renderRecord() {
  document.querySelector("#recordDate").value = today();
}

function renderLog() {
  const timeline = document.querySelector("[data-bind='timeline']");
  const periodEvents = state.periods.map((period) => ({
    date: period.startDate,
    title: period.endDate ? `${formatDate(period.startDate)} - ${formatDate(period.endDate)}` : `Started ${formatDate(period.startDate)}`,
    text: period.endDate ? `${daysBetween(period.startDate, period.endDate) + 1} days recorded` : "Currently active",
  }));
  const noteEvents = state.notes.map((note) => ({
    date: note.date,
    title: formatDate(note.date),
    text: [...note.symptoms, note.note].filter(Boolean).join(" · "),
  }));
  const items = [...periodEvents, ...noteEvents].sort((a, b) => new Date(b.date) - new Date(a.date));
  timeline.innerHTML = items.length
    ? items.map((item) => `<article class="event glass"><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.text)}</p></article>`).join("")
    : `<article class="event glass"><h2>还没有记录</h2><p>先按一次“月经来了”就可以开始。</p></article>`;
}

function renderCalendar() {
  const now = new Date();
  bindText("monthTitle", new Intl.DateTimeFormat("zh-CN", { month: "long", year: "numeric" }).format(now));
  document.querySelector("[data-bind='calendarGrid']").innerHTML = buildCalendar(now);
}

function renderSettings() {
  document.querySelector("#prepDays").value = state.settings.prepDays;
  document.querySelector("#reminderTime").value = state.settings.reminderTime;
}

function latestPeriod() {
  return [...state.periods].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).at(-1);
}

function getInsights() {
  const periods = [...state.periods].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const last = periods.at(-1);
  const active = periods.find((period) => !period.endDate);
  const cycleLengths = [];

  for (let i = 1; i < periods.length; i += 1) {
    cycleLengths.push(daysBetween(periods[i - 1].startDate, periods[i].startDate));
  }

  const periodLengths = periods.filter((period) => period.endDate).map((period) => daysBetween(period.startDate, period.endDate) + 1);
  const averageCycle = cycleLengths.length ? Math.round(avg(cycleLengths)) : null;
  const averagePeriod = periodLengths.length ? Math.round(avg(periodLengths)) : 5;
  const cycleDay = last ? daysBetween(last.startDate, today()) + 1 : null;

  let predictionWindow = "资料还不够";
  let predictionCopy = "记录开始和结束日期后，我会慢慢学你的节奏。";
  let confidence = 18;

  if (active) {
    predictionWindow = "正在记录中";
    predictionCopy = "结束时按“结束这次”就好，不需要每天记录。";
    confidence = 80;
  } else if (last && averageCycle) {
    const next = addDays(last.startDate, averageCycle);
    const early = addDays(next, -3);
    const late = addDays(next, 3);
    predictionWindow = `${formatShort(early)} - ${formatShort(late)}`;
    predictionCopy = "周期不稳定，所以这里显示的是温柔提醒，不是硬性倒数。";
    confidence = Math.min(82, 42 + cycleLengths.length * 10);
  }

  return {
    active,
    cycleDay,
    averageCycle,
    averagePeriod,
    predictionWindow,
    predictionCopy,
    confidence,
    lastPeriodLabel: last ? formatDate(last.startDate) : "No data",
    lastPeriodMeta: last?.endDate ? `${daysBetween(last.startDate, last.endDate) + 1} days recorded` : last ? "currently active" : "Start once to begin.",
    reminderText: averageCycle && last
      ? `我会在预计窗口前 ${state.settings.prepDays} 天提醒你准备。`
      : "记录多几次后，我会帮你推测提醒窗口。",
  };
}

function buildCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(`<span class="calendar-day"></span>`);
  for (let day = 1; day <= days; day += 1) {
    const iso = toIso(new Date(year, month, day));
    const cls = getDayClass(iso);
    cells.push(`<span class="calendar-day ${cls}">${day}</span>`);
  }
  return cells.join("");
}

function getDayClass(iso) {
  if (state.periods.some((period) => period.startDate <= iso && (period.endDate || today()) >= iso)) return "period";
  const insights = getInsights();
  const last = latestPeriod();
  if (!last || !insights.averageCycle) return "";
  const next = addDays(last.startDate, insights.averageCycle);
  return iso >= addDays(next, -3) && iso <= addDays(next, 3) ? "predict" : "";
}

function renderWeek() {
  const base = new Date(`${today()}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(base.getTime() + (index - 2) * DAY);
    const iso = toIso(d);
    const cls = iso === today() ? "active" : getDayClass(iso);
    return `<span class="date-pill ${cls}"><strong>${d.getDate()}</strong><small>${new Intl.DateTimeFormat("en", { weekday: "short" }).format(d)}</small></span>`;
  }).join("");
}

function buildIcs() {
  const insights = getInsights();
  const last = latestPeriod();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cycle Garden//PWA//EN"];
  if (last && insights.averageCycle) {
    const next = addDays(last.startDate, insights.averageCycle);
    lines.push(makeIcsEvent("Restock essentials", addDays(next, -state.settings.prepDays)));
    lines.push(makeIcsEvent("Personal prep", addDays(next, -3)));
    lines.push(makeIcsEvent("Personal window", next));
    lines.push(makeIcsEvent("Body check-in", addDays(next, 3)));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function makeIcsEvent(title, iso) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const date = iso.replace(/-/g, "");
  return ["BEGIN:VEVENT", `UID:${crypto.randomUUID()}@cycle-garden`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date}`, `SUMMARY:${title}`, "END:VEVENT"].join("\r\n");
}

function getRecordDate() {
  return document.querySelector("#recordDate")?.value || today();
}

function today() {
  return toIso(new Date());
}

function toIso(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  return toIso(new Date(new Date(`${iso}T00:00:00`).getTime() + days * DAY));
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / DAY);
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
}

function formatShort(iso) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
}

function bindText(name, value) {
  const node = document.querySelector(`[data-bind="${name}"]`);
  if (node) node.textContent = value;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function loadState() {
  try {
    return { ...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showToast("文件读不了，请再试一次。");
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      showToast("这不是有效的 JSON 文件。");
      return;
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.periods) || !Array.isArray(data.notes)) {
      showToast("文件格式不对，请用本 app 导出的备份。");
      return;
    }
    const added = mergeImported(data);
    saveState();
    view = "home";
    render();
    showToast(added.periods + added.notes
      ? `已恢复：新增 ${added.periods} 段月经、${added.notes} 条备注。`
      : "备份里的记录这台设备已经都有了。");
  };
  reader.readAsText(file);
}

function mergeImported(data) {
  const periodIds = new Set(state.periods.map((period) => period.id));
  let periods = 0;
  data.periods.forEach((period) => {
    if (period && period.startDate && !periodIds.has(period.id)) {
      state.periods.push(period);
      periodIds.add(period.id);
      periods += 1;
    }
  });

  const noteIds = new Set(state.notes.map((note) => note.id));
  let notes = 0;
  data.notes.forEach((note) => {
    if (note && note.date && !noteIds.has(note.id)) {
      state.notes.push(note);
      noteIds.add(note.id);
      notes += 1;
    }
  });

  if (data.settings && typeof data.settings === "object") {
    state.settings = { ...state.settings, ...data.settings };
  }
  return { periods, notes };
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

render();
