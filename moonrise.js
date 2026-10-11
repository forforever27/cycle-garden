// Moonrise: the Today screen's sky (Locked 2026-10-11, "little prince vibes").
// A grain-glow moon rises from the bottom edge as the cycle goes on, with one rose on top.
// Layers: static stars | floating group { living grain halo (canvas, per-particle motion),
// moon disc, swaying rose }. The halo is the only per-frame work; it pauses whenever the sky
// is hidden, the page is in the background or isActive() says so, and never runs under
// reduced motion. Pure decoration: aria-hidden, no data in it.

const TINTS = { cream: "243,233,214", lilac: "230,219,255", rose: "255,214,225" };
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

let root = null;
let isActive = () => true;
let current = null; // { rise: 0..1, tint }
let drawn = "";
let raf = 0;
let live = null; // halo animation state

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function fit(canvas, extra = 0) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = root.clientWidth;
  const h = root.clientHeight + extra;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return [ctx, w, h];
}

export function mount(el, options = {}) {
  root = el;
  isActive = options.isActive || isActive;
  root.innerHTML = `<canvas class="sky-stars"></canvas>
    <div class="moon-float"><canvas class="moon-halo"></canvas><canvas class="moon-disc"></canvas><canvas class="moon-rose"></canvas></div>`;
  new ResizeObserver(() => { drawn = ""; paint(); }).observe(root);
  document.addEventListener("visibilitychange", wake);
  reduce.addEventListener?.("change", () => { drawn = ""; paint(); });
}

// moon: { rise, tint, clearTop } to show it (clearTop: the y the rose must stay below), null to hide the sky's moon (other screens keep the stars).
export function set(moon) {
  current = moon;
  root.classList.toggle("has-moon", Boolean(moon));
  paint();
}

// Call after anything that changes isActive() (lock, view).
export function wake() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (live && running()) raf = requestAnimationFrame(frame);
}

const running = () => current && !reduce.matches && !document.hidden && isActive();

function paint() {
  if (!root || !root.clientWidth) return;
  const key = current ? `${root.clientWidth}x${root.clientHeight}|${current.tint}|${current.rise.toFixed(3)}|${Math.round(current.clearTop || 0)}` : `${root.clientWidth}x${root.clientHeight}|none`;
  if (key === drawn) { wake(); return; }
  drawn = key;

  const r = rng(7);
  const [sx, w, h] = fit(root.querySelector(".sky-stars"));
  sx.clearRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    sx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`;
    const s = r() < 0.9 ? 1 : 1.6;
    sx.fillRect(r() * w, r() * h * 0.62, s, s);
  }
  if (!current) { live = null; wake(); return; }

  // The moon's visible cap grows with the cycle; the float group extends 24px below the screen
  // so the bob never shows an edge.
  const col = TINTS[current.tint] || TINTS.cream;
  const R = Math.min(240, Math.max(180, w * 0.55));
  const cx = w / 2;
  // On a short screen the cap is limited so the rose (about 70px tall) never reaches the text.
  let cap = Math.min(110, h * 0.13) + current.rise * Math.min(210, h * 0.23);
  if (current.clearTop) cap = Math.max(90, Math.min(cap, h - current.clearTop - 80));
  const cy = h + R - cap;
  const [dx, , dh] = fit(root.querySelector(".moon-disc"), 24);
  dx.clearRect(0, 0, w, dh);
  const g = dx.createRadialGradient(cx - R * 0.3, cy - R * 0.45, R * 0.1, cx, cy, R);
  g.addColorStop(0, `rgba(${col},1)`);
  g.addColorStop(1, `rgba(${col},.84)`);
  dx.fillStyle = g;
  dx.beginPath(); dx.arc(cx, cy, R, 0, 6.3); dx.fill();
  for (let i = 0; i < R * 40; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    dx.fillStyle = `rgba(80,64,110,${r() * 0.13})`;
    dx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1);
  }

  const roseCanvas = root.querySelector(".moon-rose");
  const [rx, , rh] = fit(roseCanvas, 24);
  rx.clearRect(0, 0, w, rh);
  const bx = cx + 6, by = cy - R + 2;
  rose(rx, bx, by, 1.3);
  roseCanvas.style.transformOrigin = `${bx}px ${by}px`;

  const [hx, , hh] = fit(root.querySelector(".moon-halo"), 24);
  live = halo(r, hx, w, hh, cx, cy, R, col);
  frame(performance.now());
}

function halo(r, ctx, w, h, cx, cy, R, col) {
  const spread = 34;
  const P = [];
  for (let i = 0; i < 14000; i++) {
    const d = R - 10 + -Math.log(1 - r() * 0.995) * spread;
    const out = Math.max(0, d - R);
    P.push({ a: r() * 6.283, d, al: (0.12 + r() * 0.6) * Math.exp(-out / (spread * 1.45)),
      w: (r() - 0.5) * 0.03 * (1 + out / 40), amp: 1 + out * 0.12 + r() * 2, f: 0.4 + r() * 0.8, ph: r() * 6.283 });
  }
  const mote = (fresh) => ({ a: -Math.PI / 2 + (r() - 0.5) * 2.2, life: fresh ? 0 : r(), sp: 0.05 + r() * 0.08, sw: r() * 6.283, s: r() < 0.75 ? 1.5 : 2.2 });
  return { ctx, w, h, cx, cy, R, col, P, M: Array.from({ length: 90 }, () => mote(false)), mote, t0: performance.now(), last: performance.now() };
}

// Every grain speck drifts round the moon, breathes in and out and twinkles; motes lift off the rim.
function frame(now) {
  const L = live;
  if (!L) return;
  const t = (now - L.t0) / 1000;
  const dt = Math.min(0.05, (now - L.last) / 1000);
  L.last = now;
  const { ctx, w, h, cx, cy, R } = L;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `rgb(${L.col})`;
  for (const p of L.P) {
    p.a += p.w * dt;
    const d = p.d + Math.sin(t * p.f + p.ph) * p.amp;
    const py = cy + Math.sin(p.a) * d;
    if (py > h) continue;
    ctx.globalAlpha = p.al * (0.72 + 0.28 * Math.sin(t * p.f * 1.7 + p.ph));
    ctx.fillRect(cx + Math.cos(p.a) * d, py, 1.1, 1.1);
  }
  for (const m of L.M) {
    m.life += m.sp * dt;
    if (m.life > 1) Object.assign(m, L.mote(true));
    ctx.globalAlpha = Math.sin(m.life * Math.PI) * 0.9;
    ctx.fillRect(cx + Math.cos(m.a) * R + Math.sin(m.life * 6 + m.sw) * 10, cy + Math.sin(m.a) * R - m.life * 130, m.s, m.s);
  }
  ctx.globalAlpha = 1;
  raf = running() ? requestAnimationFrame(frame) : 0;
}

// A small line-drawn rose standing on the moon (Cycle Garden; the Little Prince's rose).
function rose(x, px, py, s) {
  x.save();
  x.translate(px, py);
  x.scale(s, s);
  x.strokeStyle = "#7fa08a";
  x.lineWidth = 1.6;
  x.lineCap = "round";
  x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(1, -10, -2, -20, 0, -30); x.stroke();
  x.fillStyle = "#7fa08a";
  x.beginPath(); x.ellipse(-5, -12, 5, 2.2, -0.5, 0, 6.3); x.fill();
  x.beginPath(); x.ellipse(5, -17, 5, 2.2, 0.5, 0, 6.3); x.fill();
  const glow = x.createRadialGradient(0, -36, 0, 0, -36, 26);
  glow.addColorStop(0, "rgba(255,168,194,.45)");
  glow.addColorStop(1, "rgba(255,168,194,0)");
  x.fillStyle = glow;
  x.beginPath(); x.arc(0, -36, 26, 0, 6.3); x.fill();
  x.fillStyle = "#ffa8c2";
  x.beginPath(); x.moveTo(-7, -33); x.quadraticCurveTo(-8, -44, 0, -45); x.quadraticCurveTo(8, -44, 7, -33); x.quadraticCurveTo(0, -27, -7, -33); x.fill();
  x.fillStyle = "rgba(160,59,109,.55)";
  x.beginPath(); x.moveTo(-3, -40); x.quadraticCurveTo(0, -35, 3, -40); x.quadraticCurveTo(0, -37.5, -3, -40); x.fill();
  x.restore();
}
