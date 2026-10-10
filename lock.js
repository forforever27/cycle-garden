// Optional PIN lock: a privacy screen over the app, so someone picking up the phone does not
// see it. It is NOT encryption — the data stays readable to anyone with the browser's dev
// tools — and the Settings copy says so. The PIN is stored only on this device (never synced),
// as a salted PBKDF2 hash.
const KEY = "cycle-garden-lock-v1";
const RELOCK_MS = 5 * 60 * 1000; // back in front after this long in the background → locked
const MAX_TRIES = 5;
const WAIT_MS = 30 * 1000; // held in memory: a reload resets it, which is fine for a glance-proof screen lock

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

function write(value) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
    return true;
  } catch { return false; }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (text) => new Uint8Array(text.match(/../g).map((h) => parseInt(h, 16)));

async function derive(pin, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, 256));
}

export const isValidPin = (pin) => /^\d{4,6}$/.test(pin);
export const isEnabled = () => !!read()?.hash;
export const pinLength = () => read()?.length || 4;

export async function setPin(pin) {
  if (!isValidPin(pin)) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return write({ hash: await derive(pin, salt), salt: hex(salt), length: pin.length });
}

export function clearPin() {
  return write(null);
}

export async function verify(pin) {
  const saved = read();
  if (!saved?.hash) return true;
  try {
    return (await derive(pin, unhex(saved.salt))) === saved.hash;
  } catch {
    return false; // a damaged record never unlocks; "Forgot PIN" explains the way out
  }
}

// ---------- lock screen ----------

let hiddenAt = 0;
let locked = false;
let tries = 0;
let waitUntil = 0;

export function isLocked() {
  return locked;
}

// Builds the keypad overlay into `root` and wires it. `t` is the app translator; `onUnlock`
// runs after a correct PIN (the app re-renders and restores focus).
export function lock(root, { t, onUnlock, cover = [] }) {
  if (!isEnabled()) return;
  locked = true;
  cover.forEach((el) => { el.inert = true; });
  let entry = "";
  const length = pinLength();
  root.hidden = false;
  root.innerHTML = `
    <div class="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lockTitle">
      <span class="moon-inline lock-mark" aria-hidden="true"></span>
      <h1 id="lockTitle" tabindex="-1">${t("lock.title")}</h1>
      <div class="lock-dots" aria-hidden="true">${Array.from({ length }, () => "<i></i>").join("")}</div>
      <p class="lock-status" role="status" aria-live="polite"></p>
      <div class="lock-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-key="${n}">${n}</button>`).join("")}
        <span></span><button type="button" data-key="0">0</button>
        <button type="button" data-key="back" aria-label="${t("lock.delete")}">⌫</button>
      </div>
      <button class="text-button lock-forgot" type="button" data-key="forgot">${t("lock.forgot")}</button>
    </div>`;
  const dots = [...root.querySelectorAll(".lock-dots i")];
  const status = root.querySelector(".lock-status");
  const paint = () => dots.forEach((dot, i) => dot.classList.toggle("on", i < entry.length));
  const say = (text) => { status.textContent = text; };

  let busy = false;
  const submit = async () => {
    busy = true;
    const ok = await verify(entry);
    busy = false;
    if (ok) {
      locked = false;
      tries = 0;
      root.hidden = true;
      root.innerHTML = "";
      cover.forEach((el) => { el.inert = false; });
      document.removeEventListener("keydown", onKey, true);
      onUnlock();
      return;
    }
    tries += 1;
    entry = "";
    paint();
    root.querySelector(".lock-dots").classList.add("shake");
    setTimeout(() => root.querySelector(".lock-dots")?.classList.remove("shake"), 400);
    if (tries >= MAX_TRIES) {
      waitUntil = Date.now() + WAIT_MS;
      tries = 0;
      say(t("lock.wait", { n: WAIT_MS / 1000 }));
    } else say(t("lock.wrong"));
  };

  const press = (key) => {
    if (key === "forgot") { say(t("lock.forgotHelp")); return; }
    if (busy) return;
    if (Date.now() < waitUntil) { say(t("lock.wait", { n: Math.ceil((waitUntil - Date.now()) / 1000) })); return; }
    if (key === "back") entry = entry.slice(0, -1);
    else if (entry.length < length) entry += key;
    paint();
    if (entry.length === length) submit();
  };

  root.onclick = (event) => {
    const key = event.target.closest("[data-key]")?.dataset.key;
    if (key) press(key);
  };
  // Keys are captured so nothing reaches the app underneath while it is locked.
  function onKey(event) {
    if (!locked) return;
    if (event.key !== "Tab") event.stopImmediatePropagation();
    if (event.key === "Escape") event.preventDefault();
    if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key); }
    else if (event.key === "Backspace") { event.preventDefault(); press("back"); }
    else if (event.key === "Tab") {
      const items = [...root.querySelectorAll("button")];
      const i = items.indexOf(document.activeElement);
      if (event.shiftKey && i <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && (i === -1 || i === items.length - 1)) { event.preventDefault(); items[0].focus(); }
    }
  }
  document.addEventListener("keydown", onKey, true);
  root.querySelector("#lockTitle").focus({ preventScroll: true });
}

// Call from a visibilitychange listener: remembers when the app went to the background and
// locks again if it was away long enough.
export function onVisibility(root, options) {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  if (!locked && isEnabled() && hiddenAt && Date.now() - hiddenAt >= RELOCK_MS) lock(root, options);
}
