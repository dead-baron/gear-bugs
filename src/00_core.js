/* =====================================================================
   00_CORE - constants, helpers, canvas, pixel font, save data
   ===================================================================== */
const BUILD = '__BUILD__';            // stamped by build.py (UTC timestamp)

// Shared reference field. Every level, physics speed and network position
// lives in this coordinate space, so phones/tablets/widescreens play identically.
const REF_W = 640, REF_H = 360;
const G = 760;                        // gravity px/s^2

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / l2, 0, 1) : 0;
  return dist(x1 + dx * t, y1 + dy * t, cx, cy) < r;
}
// Liang-Barsky: does segment intersect axis-aligned rect (optionally inset)?
function segRect(x1, y1, x2, y2, p, inset = 0) {
  const rx = p.x + inset, ry = p.y + inset, rw = p.w - inset * 2, rh = p.h - inset * 2;
  if (rw <= 0 || rh <= 0) return false;
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const ps = [-dx, dx, -dy, dy], qs = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  for (let i = 0; i < 4; i++) {
    if (ps[i] === 0) { if (qs[i] < 0) return false; }
    else {
      const t = qs[i] / ps[i];
      if (ps[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}
// Seeded RNG (mulberry32) - levels, rocks and art are deterministic from a seed
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); c.getContext('2d').imageSmoothingEnabled = false; return c; }
const nowMs = () => performance.now();

/* ---------- Canvas: the canvas IS the low-res pixel buffer, CSS scales it up ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let BW = REF_W, BH = REF_H;     // buffer size (matches the screen aspect)
let OX = 0, OY = 0;             // reference-field offset inside the buffer
let T = 0;                      // global animation clock (seconds)

/* ---------- Pixel drawing primitives ---------- */
function pxCircle(g, cx, cy, r, color) {
  g.fillStyle = color; cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let dy = -r; dy <= r; dy++) { const dx = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
function pxEllipse(g, cx, cy, rx, ry, color) {
  g.fillStyle = color; ry = Math.max(1, Math.round(ry));
  for (let dy = -ry; dy <= ry; dy++) {
    const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    g.fillRect(Math.round(cx - dx), Math.round(cy + dy), dx * 2 + 1, 1);
  }
}
function roundRectPx(g, x, y, w, h, rad, color) {
  g.fillStyle = color; rad = Math.min(rad, Math.floor(h / 2), Math.floor(w / 2));
  for (let i = 0; i < h; i++) {
    let inset = 0;
    if (i < rad) inset = rad - Math.floor(Math.sqrt(rad * rad - (rad - i - 0.5) * (rad - i - 0.5)));
    else if (i > h - 1 - rad) { const k = i - (h - 1 - rad); inset = rad - Math.floor(Math.sqrt(Math.max(0, rad * rad - (k - 0.5) * (k - 0.5)))); }
    g.fillRect(x + inset, y + i, w - inset * 2, 1);
  }
}

/* ---------- Bitmap pixel font (5x7, column-major, bit0 = top) ---------- */
const FONT = {
  'A':[0x7C,0x12,0x11,0x12,0x7C],'B':[0x7F,0x49,0x49,0x49,0x36],'C':[0x3E,0x41,0x41,0x41,0x22],
  'D':[0x7F,0x41,0x41,0x22,0x1C],'E':[0x7F,0x49,0x49,0x49,0x41],'F':[0x7F,0x09,0x09,0x09,0x01],
  'G':[0x3E,0x41,0x49,0x49,0x7A],'H':[0x7F,0x08,0x08,0x08,0x7F],'I':[0x00,0x41,0x7F,0x41,0x00],
  'J':[0x20,0x40,0x41,0x3F,0x01],'K':[0x7F,0x08,0x14,0x22,0x41],'L':[0x7F,0x40,0x40,0x40,0x40],
  'M':[0x7F,0x02,0x0C,0x02,0x7F],'N':[0x7F,0x04,0x08,0x10,0x7F],'O':[0x3E,0x41,0x41,0x41,0x3E],
  'P':[0x7F,0x09,0x09,0x09,0x06],'Q':[0x3E,0x41,0x51,0x21,0x5E],'R':[0x7F,0x09,0x19,0x29,0x46],
  'S':[0x46,0x49,0x49,0x49,0x31],'T':[0x01,0x01,0x7F,0x01,0x01],'U':[0x3F,0x40,0x40,0x40,0x3F],
  'V':[0x1F,0x20,0x40,0x20,0x1F],'W':[0x3F,0x40,0x38,0x40,0x3F],'X':[0x63,0x14,0x08,0x14,0x63],
  'Y':[0x07,0x08,0x70,0x08,0x07],'Z':[0x61,0x51,0x49,0x45,0x43],
  '0':[0x3E,0x51,0x49,0x45,0x3E],'1':[0x00,0x42,0x7F,0x40,0x00],'2':[0x42,0x61,0x51,0x49,0x46],
  '3':[0x21,0x41,0x45,0x4B,0x31],'4':[0x18,0x14,0x12,0x7F,0x10],'5':[0x27,0x45,0x45,0x45,0x39],
  '6':[0x3C,0x4A,0x49,0x49,0x30],'7':[0x01,0x71,0x09,0x05,0x03],'8':[0x36,0x49,0x49,0x49,0x36],
  '9':[0x06,0x49,0x49,0x29,0x1E],
  '!':[0x00,0x00,0x5F,0x00,0x00],'.':[0x00,0x60,0x60,0x00,0x00],',':[0x00,0x50,0x30,0x00,0x00],
  ':':[0x00,0x36,0x36,0x00,0x00],'-':[0x08,0x08,0x08,0x08,0x08],'/':[0x20,0x10,0x08,0x04,0x02],
  '?':[0x02,0x01,0x51,0x09,0x06],'+':[0x08,0x08,0x3E,0x08,0x08],'(':[0x00,0x1C,0x22,0x41,0x00],
  ')':[0x00,0x41,0x22,0x1C,0x00],"'":[0x00,0x05,0x03,0x00,0x00],'>':[0x00,0x41,0x22,0x14,0x08],
  '<':[0x08,0x14,0x22,0x41,0x00],'*':[0x14,0x08,0x3E,0x08,0x14],'=':[0x14,0x14,0x14,0x14,0x14],
  '_':[0x40,0x40,0x40,0x40,0x40],'#':[0x14,0x7F,0x14,0x7F,0x14],'%':[0x23,0x13,0x08,0x64,0x62],
  '&':[0x36,0x49,0x55,0x22,0x50],'[':[0x00,0x7F,0x41,0x41,0x00],']':[0x00,0x41,0x41,0x7F,0x00],
  '"':[0x00,0x07,0x00,0x07,0x00],';':[0x00,0x56,0x36,0x00,0x00],'^':[0x04,0x02,0x01,0x02,0x04],
  '|':[0x00,0x00,0x7F,0x00,0x00],'@':[0x3E,0x41,0x5D,0x55,0x1E],
};
const fontCache = {};
function getFontAtlas(color) {
  if (fontCache[color]) return fontCache[color];
  const chars = Object.keys(FONT);
  const c = makeCanvas(chars.length * 6, 8), g = c.getContext('2d');
  g.fillStyle = color;
  const index = {};
  chars.forEach((ch, i) => {
    index[ch] = i;
    const cols = FONT[ch];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 7; y++) if ((cols[x] >> y) & 1) g.fillRect(i * 6 + x, y, 1, 1);
  });
  return (fontCache[color] = { canvas: c, index });
}
function textWidth(str, scale = 1) { return String(str).length * 6 * scale - scale; }
function drawRaw(str, x, y, scale, color) {
  const a = getFontAtlas(color);
  for (let i = 0; i < str.length; i++) {
    const idx = a.index[str[i]];
    if (idx === undefined) continue;
    ctx.drawImage(a.canvas, idx * 6, 0, 5, 7, x + i * 6 * scale, y, 5 * scale, 7 * scale);
  }
}
/* drawText(str, x, y, scale, color, align, shadowColor, outlineColor) */
function drawText(str, x, y, scale = 1, color = '#fff', align = 'left', shadow = null, outline = null) {
  str = String(str).toUpperCase();
  const w = textWidth(str, scale);
  let sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  sx = Math.round(sx); y = Math.round(y);
  if (outline) {
    const o = Math.max(1, Math.floor(scale / 2));
    for (const [dx, dy] of [[-o,0],[o,0],[0,-o],[0,o],[-o,-o],[o,o],[-o,o],[o,-o]]) drawRaw(str, sx + dx, y + dy, scale, outline);
  }
  if (shadow) drawRaw(str, sx + scale, y + scale, scale, shadow);
  drawRaw(str, sx, y, scale, color);
}
// Word-wrap helper for the pixel font
function wrapText(str, maxW, scale = 1) {
  const words = String(str).split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (textWidth(test, scale) > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/* ---------- Difficulty array ---------- */
const DIFFS = [
  { name: 'EASY',   color: '#7df06a', speed: 0.78, aggro: 0.65, react: 0.55, windup: 0.55, freeze: 8.0, beeMax: 1, stun: 1.5, hell: false },
  { name: 'MEDIUM', color: '#ffd23f', speed: 1.00, aggro: 1.00, react: 0.32, windup: 0.40, freeze: 6.0, beeMax: 2, stun: 2.0, hell: false },
  { name: 'HARD',   color: '#ff8c42', speed: 1.25, aggro: 1.45, react: 0.16, windup: 0.28, freeze: 4.5, beeMax: 3, stun: 2.4, hell: false },
  { name: 'HELL MODE', color: '#ff2d2d', speed: 1.55, aggro: 2.30, react: 0.02, windup: 0.14, freeze: 3.6, beeMax: 3, stun: 2.6, hell: true },
];

/* ---------- Persistent save data ---------- */
const SAVE_KEY = 'gearbugs_v2';
const NUM_LEVELS = 6;                 // Field, Meadow, Island, Barn, Factory, Desert Anthill
const save = {
  stars: 0,                                    // star coin inventory tally (permanent)
  unlocked: [1, 1, 1, 1],                      // levels unlocked per difficulty
  cleared: [0, 0, 0, 0].map(() => new Array(6).fill(0)),
  style: { c: 0, h: 0, p: 0 },                 // spider customization
  diff: 1,
  settings: { sound: true, shake: true, aim: true, autoFull: true },
  name: '',
};
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s && typeof s === 'object') {
    if (typeof s.stars === 'number') save.stars = s.stars;
    // older saves had fewer levels: pad them, and having beaten the old final level opens the next one
    if (Array.isArray(s.cleared) && s.cleared.length === 4) save.cleared = s.cleared.map(r => { const a = Array.isArray(r) ? r.slice(0, NUM_LEVELS).map(v => v ? 1 : 0) : []; while (a.length < NUM_LEVELS) a.push(0); return a; });
    if (Array.isArray(s.unlocked) && s.unlocked.length === 4) save.unlocked = s.unlocked.map((v, d) => { let u = v | 0; while (u < NUM_LEVELS && save.cleared[d][u - 1]) u++; return clamp(u, 1, NUM_LEVELS); });
    if (s.style) save.style = { c: s.style.c | 0, h: s.style.h | 0, p: s.style.p | 0 };
    if (typeof s.diff === 'number') save.diff = clamp(s.diff | 0, 0, 3);
    if (s.settings) Object.assign(save.settings, s.settings);
    if (typeof s.name === 'string') save.name = s.name.slice(0, 8);
  }
} catch (e) { /* storage unavailable */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const settings = save.settings;

/* ---------- Optional analytics hook (GA4 if the page has gtag; never personal data) ---------- */
function track(name, params) {
  try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
}

/* ---------- Small shared helpers ---------- */
function fmtTime(t) { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }
function fmtTimeTenths(t) { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10); return m + ':' + String(s).padStart(2, '0') + '.' + d; }
let shakeT = 0, shakeMag = 0;
function shake(t, mag) { if (!settings.shake) return; shakeT = Math.max(shakeT, t); shakeMag = Math.max(shakeMag, mag); }
