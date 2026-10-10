// Every visible string, in Simplified Chinese and English. t("key", { vars }) fills {var} slots.
// Internal data values stay in English (brief §3A); only what the screen shows is translated.

const STRINGS = {
  zh: {
    "app.name": "Cycle Garden",
    "nav.home": "今天", "nav.cycles": "周期", "nav.add": "记录", "nav.calendar": "日历", "nav.settings": "设置",
    "lang.toggle": "EN", "lang.toggleLabel": "Switch to English",
    "greet.night": "晚安，Xy", "greet.morning": "早安，Xy", "greet.noon": "午安，Xy", "greet.afternoon": "下午好，Xy", "greet.evening": "晚上好，Xy",

    "action.start": "月经来了", "action.end": "结束这次", "action.logOther": "记录其他日子",
    "status.cycleDay": "周期第 {n} 天",
    "status.empty.head": "从第一次记录开始", "status.empty.sub": "来的那天按下面的按钮，我会从那里开始学你的节奏。",
    "status.learning.head": "再记录 {n} 次就能估算", "status.learning.sub": "至少记录 3 次经期，才看得出你的节奏。",
    "status.waiting.head": "{n} 天后开始准备", "status.waiting.head1": "明天开始准备",
    "status.waiting.sub": "可能从 {date} 开始",
    "status.prep.head": "准备好卫生用品", "status.prep.sub": "最早可能 {n} 天后开始（{date}）", "status.prep.sub1": "最早可能明天开始（{date}）",
    "status.window.head": "在预计窗口内", "status.window.sub": "窗口第 {d} / {l} 天 · {start} – {end}",
    "status.late.head": "比平时晚了 {n} 天", "status.late.head1": "比平时晚了 1 天",
    "status.late.sub": "已经过了你最近最长的周期。压力、生病、作息变化都可能让它推迟。",
    "status.period.head": "经期第 {n} 天", "status.period.sub": "结束时按一下就好，不需要每天记录。",
    "status.period.long": "已经超过 10 天。如果其实已经结束了，改一下结束日期。", "status.period.fix": "设结束日期",
    "range.rough": "粗略估计 · 只有 {n} 个周期", "range.steady": "根据最近 {n} 个周期 · 比较规律", "range.variable": "根据最近 {n} 个周期 · 变化较大",
    "range.window": "{start} – {end}",
    "how.button": "怎么算的？",
    "how.text": "取最近 {n} 个周期里最短的 {min} 天和最长的 {max} 天，从上次开始日 {date} 往后算。周期越不规律，窗口越宽。",
    "how.rough": "因为只有 {n} 个周期，两边各多留 3 天。",
    "how.excluded": "有 {n} 个周期没算进去（可能漏记了一次），可以在「周期」里改。",
    "problems.banner": "{n} 条记录的日期需要修正", "problems.open": "去修正",

    "week.label": "这一周",
    "prep.title": "准备清单", "prep.pads": "卫生巾", "prep.liners": "护垫", "prep.relief": "止痛药", "prep.done": "都准备好了",
    "stat.last": "上次经期", "stat.lastMeta": "持续 {n} 天", "stat.lastOpen": "进行中", "stat.usual": "常见周期",
    "stat.usualValue": "{a}–{b} 天", "stat.usualOne": "{a} 天", "stat.none": "—", "stat.needMore": "记录 3 次后显示",

    "sheet.title": "记录这一天", "sheet.close": "关闭", "sheet.today": "今天", "sheet.yesterday": "昨天", "sheet.earlier": "更早的日子",
    "sheet.period": "经期", "sheet.inPeriod": "经期第 {n} 天", "sheet.startHere": "这天开始了月经", "sheet.endHere": "在这天结束",
    "sheet.editPeriod": "编辑这次经期", "sheet.noPeriod": "这天不在经期内。",
    "sheet.flow": "流量", "flow.spotting": "点滴", "flow.light": "少", "flow.medium": "中", "flow.heavy": "多",
    "sheet.pain": "疼痛", "pain.0": "无", "pain.hint": "0 无痛 · 5 很痛",
    "sheet.symptoms": "身体状况",
    "sym.cramps": "腹痛", "sym.tired": "很累", "sym.mood": "情绪波动", "sym.sleep": "睡不好", "sym.headache": "头痛", "sym.bloating": "腹胀",
    "sheet.note": "备注", "sheet.notePlaceholder": "想补充什么…",
    "sheet.save": "保存", "sheet.deleteLog": "删除这天的记录", "sheet.confirmDelete": "再按一次确认删除",

    "editor.title": "编辑经期", "editor.newTitle": "补记一次经期", "editor.start": "开始日期", "editor.end": "结束日期", "editor.ongoing": "还没结束",
    "editor.count": "这次周期算进预测吗？", "editor.count.auto": "自动", "editor.count.include": "算", "editor.count.exclude": "不算",
    "editor.countHelp": "如果这次之后漏记了一次经期，选「不算」，预测就不会被拉长。",
    "editor.save": "保存", "editor.delete": "删除这次经期", "editor.confirmDelete": "再按一次确认删除",

    "cycles.eyebrow": "周期", "cycles.title": "你的节奏",
    "chart.title": "周期长度", "chart.usual": "你最近的范围 {min}–{max} 天", "chart.empty": "记录两次经期后，这里会显示每个周期的长度。",
    "chart.days": "天", "chart.notCounted": "未计入",
    "stats.shortest": "最短", "stats.longest": "最长", "stats.average": "平均", "stats.period": "经期长度", "stats.days": "{n} 天",
    "flags.title": "值得留意",
    "flag.short": "最近有几次周期短于 21 天。", "flag.long": "最近有几次周期长于 35 天。", "flag.absent": "已经超过 3 个月没有记录月经。",
    "flag.longBleed": "最近几次经期都超过 7 天。", "flag.heavy": "最近几次经期都记录了量多。", "flag.pain": "最近几次经期疼痛都在 4 或以上。",
    "flag.spotting": "两次经期之间记录到了几次出血。",
    "flags.footer": "这不是诊断。如果一直这样，可以找医生聊聊。",
    "list.title": "每一次", "list.started": "{date} 开始", "list.meta": "经期 {p} · 周期 {c}", "list.days": "{n} 天", "list.open": "进行中", "list.current": "本次周期",
    "list.notCounted": "未计入预测", "list.missed": "可能漏记", "list.problem": "需要修正", "list.logs": "{n} 条记录", "list.empty": "还没有任何记录。按「月经来了」开始。",
    "list.add": "补记一次经期",

    "cal.title": "日历", "cal.today": "回到今天",
    "legend.period": "经期", "legend.predicted": "可能的经期", "legend.today": "今天", "legend.note": "有记录",
    "weekdays": "一,二,三,四,五,六,日",

    "settings.title": "设置",
    "settings.reminders": "提醒", "settings.prepDays": "提前几天准备", "settings.reminderTime": "提醒时间", "settings.save": "保存设置",
    "settings.calendar": "日历提醒",
    "settings.calendarBody": "下载 .ics 文件，用日历打开。事件名称是隐晦的：Personal prep、Personal window、Body check-in、Restock essentials。每次新经期后重新下载一次。",
    "settings.calendarButton": "下载 .ics", "settings.calendarNone": "需要至少两次记录才有预测。",
    "settings.sync": "云同步",
    "sync.local": "本机模式：数据只存在这台设备。", "sync.signedOut": "用 Google 登录后，手机、电脑、平板会共享同一份数据。",
    "sync.signedIn": "已登录 {email}。所有设备用同一个 Google 帐号登录就会同步。", "sync.signIn": "用 Google 登录", "sync.signOut": "退出登录",
    "sync.notSet": "云同步未设置",
    "settings.backup": "备份",
    "settings.backupBody": "导出一份 JSON 存好。换设备或清了浏览器资料后，用「导入」还原。导入只会加回记录，不会删除。",
    "settings.export": "导出备份", "settings.import": "导入 / 还原",
    "settings.language": "语言",

    "toast.started": "已记录开始。", "toast.ended": "已记录结束。", "toast.saved": "已保存。", "toast.deleted": "已删除。",
    "toast.settings": "设置已保存。", "toast.exported": "已导出备份，请存到安全的地方。",
    "toast.imported": "已还原：新增 {p} 次经期、{n} 条记录。", "toast.importNone": "备份里的记录这台设备都已经有了。",
    "toast.importBad": "文件格式不对，请用本 app 导出的备份。", "toast.importUnreadable": "这个文件读不了，请再试一次。",
    "toast.signedIn": "已登录，开始同步。", "toast.signedOut": "已退出登录，本机数据还在。", "toast.signInFailed": "登录没成功，请再试一次。",
    "toast.cloudNotSet": "云同步还没设置。",

    "err.startMissing": "请选一个开始日期。", "err.startFuture": "开始日期不能在未来。", "err.endInvalid": "结束日期不对。",
    "err.endBeforeStart": "结束日期不能早于开始日期。", "err.endFuture": "结束日期不能在未来。",
    "err.openExists": "还有一次经期没结束，先给它设结束日期。", "err.overlap": "这些日期和另一次经期重叠了。",
    "err.staleOpen": "这次经期没有结束日期，但之后已经有新的记录了。请补上结束日期。", "err.noOpen": "现在没有进行中的经期。", "err.dateInvalid": "日期不对。", "err.noteEmpty": "还没有要保存的内容。",
  },

  en: {
    "app.name": "Cycle Garden",
    "nav.home": "Today", "nav.cycles": "Cycles", "nav.add": "Log", "nav.calendar": "Calendar", "nav.settings": "Settings",
    "lang.toggle": "中", "lang.toggleLabel": "切换到中文",
    "greet.night": "Good night, Xy", "greet.morning": "Good morning, Xy", "greet.noon": "Good afternoon, Xy", "greet.afternoon": "Good afternoon, Xy", "greet.evening": "Good evening, Xy",

    "action.start": "Period started", "action.end": "Period ended", "action.logOther": "Log a different day",
    "status.cycleDay": "Cycle day {n}",
    "status.empty.head": "Start with your first period", "status.empty.sub": "Tap the button below on the day it starts. I'll learn your pattern from there.",
    "status.learning.head": "{n} more to start estimating", "status.learning.sub": "Predictions start once 3 periods are logged.",
    "status.waiting.head": "Prep starts in {n} days", "status.waiting.head1": "Prep starts tomorrow",
    "status.waiting.sub": "Likely from {date}",
    "status.prep.head": "Pack your essentials", "status.prep.sub": "Could start in {n} days ({date})", "status.prep.sub1": "Could start tomorrow ({date})",
    "status.window.head": "Inside your likely window", "status.window.sub": "Day {d} of {l} · {start} – {end}",
    "status.late.head": "{n} days later than usual", "status.late.head1": "1 day later than usual",
    "status.late.sub": "Past your longest recent cycle. Stress, illness and changes in routine can all push it back.",
    "status.period.head": "Period day {n}", "status.period.sub": "Tap End when it stops. No need to log every day.",
    "status.period.long": "That's more than 10 days. If it already stopped, set the end date.", "status.period.fix": "Set end date",
    "range.rough": "Rough estimate · only {n} cycle(s)", "range.steady": "From your last {n} cycles · fairly steady", "range.variable": "From your last {n} cycles · varies a lot",
    "range.window": "{start} – {end}",
    "how.button": "How is this calculated?",
    "how.text": "Your shortest ({min} days) and longest ({max} days) of the last {n} cycles, counted from your last start on {date}. The less regular your cycles, the wider the window.",
    "how.rough": "With only {n} cycle(s), 3 extra days are added on each side.",
    "how.excluded": "{n} cycle(s) left out because a period was probably not logged. You can change this in Cycles.",
    "problems.banner": "{n} record(s) have dates that need fixing", "problems.open": "Fix",

    "week.label": "This week",
    "prep.title": "Prep kit", "prep.pads": "Pads", "prep.liners": "Liners", "prep.relief": "Pain relief", "prep.done": "All packed",
    "stat.last": "Last period", "stat.lastMeta": "Lasted {n} days", "stat.lastOpen": "In progress", "stat.usual": "Usual cycle",
    "stat.usualValue": "{a}–{b} days", "stat.usualOne": "{a} days", "stat.none": "—", "stat.needMore": "Shows after 3 periods",

    "sheet.title": "Log this day", "sheet.close": "Close", "sheet.today": "Today", "sheet.yesterday": "Yesterday", "sheet.earlier": "Earlier day",
    "sheet.period": "Period", "sheet.inPeriod": "Period day {n}", "sheet.startHere": "Period started this day", "sheet.endHere": "Ended this day",
    "sheet.editPeriod": "Edit this period", "sheet.noPeriod": "Not a period day.",
    "sheet.flow": "Flow", "flow.spotting": "Spotting", "flow.light": "Light", "flow.medium": "Medium", "flow.heavy": "Heavy",
    "sheet.pain": "Pain", "pain.0": "None", "pain.hint": "0 none · 5 severe",
    "sheet.symptoms": "How you feel",
    "sym.cramps": "Cramps", "sym.tired": "Tired", "sym.mood": "Mood swings", "sym.sleep": "Poor sleep", "sym.headache": "Headache", "sym.bloating": "Bloating",
    "sheet.note": "Note", "sheet.notePlaceholder": "Anything else…",
    "sheet.save": "Save", "sheet.deleteLog": "Delete this day's log", "sheet.confirmDelete": "Tap again to delete",

    "editor.title": "Edit period", "editor.newTitle": "Add a past period", "editor.start": "Start date", "editor.end": "End date", "editor.ongoing": "Still going",
    "editor.count": "Count this cycle in predictions?", "editor.count.auto": "Auto", "editor.count.include": "Count", "editor.count.exclude": "Don't count",
    "editor.countHelp": "If you missed logging the period after this one, choose Don't count so the prediction isn't stretched.",
    "editor.save": "Save", "editor.delete": "Delete this period", "editor.confirmDelete": "Tap again to delete",

    "cycles.eyebrow": "Cycles", "cycles.title": "Your pattern",
    "chart.title": "Cycle length", "chart.usual": "Your recent range {min}–{max} days", "chart.empty": "After two periods, each cycle's length shows here.",
    "chart.days": "days", "chart.notCounted": "not counted",
    "stats.shortest": "Shortest", "stats.longest": "Longest", "stats.average": "Average", "stats.period": "Period length", "stats.days": "{n} days",
    "flags.title": "Worth keeping an eye on",
    "flag.short": "Several recent cycles were shorter than 21 days.", "flag.long": "Several recent cycles were longer than 35 days.",
    "flag.absent": "No period logged for more than 3 months.", "flag.longBleed": "Recent periods lasted more than 7 days.",
    "flag.heavy": "Heavy flow was logged in several recent periods.", "flag.pain": "Pain of 4 or more in several recent periods.",
    "flag.spotting": "Some bleeding was logged between periods.",
    "flags.footer": "This isn't a diagnosis. If it keeps happening, it may be worth checking with a doctor.",
    "list.title": "Each cycle", "list.started": "Started {date}", "list.meta": "Period {p} · cycle {c}", "list.days": "{n} days", "list.open": "ongoing", "list.current": "current",
    "list.notCounted": "Not counted", "list.missed": "Possibly missed a log", "list.problem": "Needs fixing", "list.logs": "{n} log(s)", "list.empty": "Nothing logged yet. Tap Period started to begin.",
    "list.add": "Add a past period",

    "cal.title": "Calendar", "cal.today": "Today",
    "legend.period": "Period", "legend.predicted": "Likely period", "legend.today": "Today", "legend.note": "Logged",
    "weekdays": "Mon,Tue,Wed,Thu,Fri,Sat,Sun",

    "settings.title": "Settings",
    "settings.reminders": "Reminders", "settings.prepDays": "Prep reminder, days before", "settings.reminderTime": "Reminder time", "settings.save": "Save settings",
    "settings.calendar": "Calendar reminders",
    "settings.calendarBody": "Download an .ics file and open it with your calendar. Event names are discreet: Personal prep, Personal window, Body check-in, Restock essentials. Download again after each new period.",
    "settings.calendarButton": "Download .ics", "settings.calendarNone": "Needs at least two logged periods to predict.",
    "settings.sync": "Cloud sync",
    "sync.local": "Local mode: data stays on this device only.", "sync.signedOut": "Sign in with Google and your phone, laptop and tablet share the same data.",
    "sync.signedIn": "Signed in as {email}. Any device signed in with this Google account stays in sync.", "sync.signIn": "Sign in with Google", "sync.signOut": "Sign out",
    "sync.notSet": "Cloud sync not set up",
    "settings.backup": "Backup",
    "settings.backupBody": "Export a JSON file and keep it safe. After changing device or clearing browser data, Import restores it. Importing only adds records; it never deletes.",
    "settings.export": "Export backup", "settings.import": "Import / restore",
    "settings.language": "Language",

    "toast.started": "Start saved.", "toast.ended": "End saved.", "toast.saved": "Saved.", "toast.deleted": "Deleted.",
    "toast.settings": "Settings saved.", "toast.exported": "Backup exported. Keep it somewhere safe.",
    "toast.imported": "Restored: {p} period(s) and {n} log(s) added.", "toast.importNone": "This device already has everything in that backup.",
    "toast.importBad": "That file isn't a Cycle Garden backup.", "toast.importUnreadable": "Couldn't read that file. Try again.",
    "toast.signedIn": "Signed in. Syncing now.", "toast.signedOut": "Signed out. Data on this device is still here.", "toast.signInFailed": "Sign-in didn't work. Try again.",
    "toast.cloudNotSet": "Cloud sync isn't set up.",

    "err.startMissing": "Pick a start date.", "err.startFuture": "The start date can't be in the future.", "err.endInvalid": "That end date isn't valid.",
    "err.endBeforeStart": "The end date can't be before the start date.", "err.endFuture": "The end date can't be in the future.",
    "err.openExists": "Another period is still open. Set its end date first.", "err.overlap": "Those dates overlap another period.",
    "err.staleOpen": "This period has no end date, but a later one has started. Add its end date.", "err.noOpen": "There's no period in progress.", "err.dateInvalid": "That date isn't valid.", "err.noteEmpty": "Nothing to save yet.",
  },
};

let lang = "zh";

export function setLang(next) {
  lang = next === "en" ? "en" : "zh";
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
}

export function getLang() {
  return lang;
}

export function other() {
  return lang === "zh" ? "en" : "zh";
}

export function t(key, vars = {}, forLang = lang) {
  const table = STRINGS[forLang];
  const template = table[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}

const locale = () => (lang === "zh" ? "zh-CN" : "en-GB");
const asDate = (iso) => new Date(`${iso}T00:00:00`);

// "10月11日" / "11 Oct"
export function fmtShort(iso) {
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(asDate(iso));
}

// "2026年10月11日" / "11 Oct 2026"
export function fmtLong(iso) {
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }).format(asDate(iso));
}

// "10月11日 周六" / "Sat 11 Oct"
export function fmtDay(iso) {
  return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short" }).format(asDate(iso));
}

// "周六" / "Sat"
export function fmtWeekday(iso) {
  return new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(asDate(iso));
}

// "2026年10月" / "October 2026"
export function fmtMonth(year, month) {
  return new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(new Date(year, month, 1));
}

export function greetingKey(hour) {
  if (hour >= 5 && hour < 11) return "greet.morning";
  if (hour >= 11 && hour < 14) return "greet.noon";
  if (hour >= 14 && hour < 18) return "greet.afternoon";
  if (hour >= 18 && hour < 22) return "greet.evening";
  return "greet.night";
}
