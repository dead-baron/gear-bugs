/* =====================================================================
   30_GEOMETRY - platforms & 360-degree perimeter crawling
   ---------------------------------------------------------------------
   Platforms are axis-aligned rectangles. A crawler of radius r attached to
   a platform lives on the rectangle inflated by r (rounded corners). That
   loop is parameterised by one distance s, clockwise. Crawling changes s,
   so wrapping onto walls and undersides is automatic and smooth. Inner
   corners transfer the crawler to the neighbouring platform.
   ===================================================================== */
let PLATS = [];            // platforms of the active level
let WATER_Y = Infinity;    // water surface (island biome); touching it is deadly
const WORLD_TOP = 4;

const arcLen = r => r * Math.PI / 2;
function perimLen(p, r) { return 2 * p.w + 2 * p.h + 4 * arcLen(r); }
function _pt(x, y, nx, ny) { return { x, y, nx, ny }; }
function _arc(cx, cy, r, th) { const c = Math.cos(th), s = Math.sin(th); return { x: cx + c * r, y: cy + s * r, nx: c, ny: s }; }

/* Position + outward normal at perimeter distance s */
function perim(p, r, s) {
  const w = p.w, h = p.h, A = arcLen(r), L = 2 * w + 2 * h + 4 * A;
  s = ((s % L) + L) % L;
  if (s < w) return _pt(p.x + s, p.y - r, 0, -1); s -= w;
  if (s < A) return _arc(p.x + w, p.y, r, -Math.PI / 2 + s / r); s -= A;
  if (s < h) return _pt(p.x + w + r, p.y + s, 1, 0); s -= h;
  if (s < A) return _arc(p.x + w, p.y + h, r, s / r); s -= A;
  if (s < w) return _pt(p.x + w - s, p.y + h + r, 0, 1); s -= w;
  if (s < A) return _arc(p.x, p.y + h, r, Math.PI / 2 + s / r); s -= A;
  if (s < h) return _pt(p.x - r, p.y + h - s, -1, 0); s -= h;
  return _arc(p.x, p.y, r, Math.PI + s / r);
}
/* Nearest perimeter parameter s for an arbitrary point */
function sFromPoint(p, r, px, py) {
  const w = p.w, h = p.h, A = arcLen(r), x0 = p.x, x1 = p.x + w, y0 = p.y, y1 = p.y + h, HP = Math.PI / 2;
  if (px < x0) {
    if (py < y0) { let th = Math.atan2(py - y0, px - x0); if (th < 0) th += TAU; return 2 * w + 3 * A + 2 * h + r * clamp(th - Math.PI, 0, HP); }
    if (py > y1) { const th = Math.atan2(py - y1, px - x0); return 2 * w + 2 * A + h + r * clamp(th - HP, 0, HP); }
    return 2 * w + 3 * A + h + (y1 - py);
  }
  if (px > x1) {
    if (py < y0) { const th = Math.atan2(py - y0, px - x1); return w + r * clamp(th + HP, 0, HP); }
    if (py > y1) { const th = Math.atan2(py - y1, px - x1); return w + A + h + r * clamp(th, 0, HP); }
    return w + A + (py - y0);
  }
  if (py < y0) return px - x0;
  if (py > y1) return w + 2 * A + h + (x1 - px);
  const dT = py - y0, dB = y1 - py, dL = px - x0, dR = x1 - px, m = Math.min(dT, dB, dL, dR);
  if (m === dT) return px - x0;
  if (m === dB) return w + 2 * A + h + (x1 - px);
  if (m === dL) return 2 * w + 3 * A + h + (y1 - py);
  return w + A + (py - y0);
}
function rectDist(p, px, py) {
  const dx = Math.max(p.x - px, 0, px - (p.x + p.w));
  const dy = Math.max(p.y - py, 0, py - (p.y + p.h));
  return Math.hypot(dx, dy);
}
const pointInRect = (p, px, py) => px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
function syncStuck(e) { const p = perim(e.plat, e.r, e.s); e.x = p.x; e.y = p.y; e.nx = p.nx; e.ny = p.ny; }

/* Move a crawler along its surface. allow(point) may forbid orientations
   (the lizard can't hang upside down). Returns 'ok' | 'transfer' | 'blocked'. */
function crawlMove(e, delta, allow) {
  const np = perim(e.plat, e.r, e.s + delta);
  if (np.y < WORLD_TOP + e.r * 0.5) return 'blocked';
  if (allow && !allow(np)) return 'blocked';
  for (const q of PLATS) {
    if (q === e.plat || (e.passSoft && q.soft)) continue;
    if (rectDist(q, np.x, np.y) < e.r - 0.5) {
      const s2 = sFromPoint(q, e.r, np.x, np.y);
      const p2 = perim(q, e.r, s2);
      if (allow && !allow(p2)) return 'blocked';
      for (const o of PLATS) if (o !== q && !(e.passSoft && o.soft) && rectDist(o, p2.x, p2.y) < e.r - 1.5) return 'blocked';
      e.plat = q; e.s = s2;
      return 'transfer';
    }
  }
  e.s += delta;
  return 'ok';
}
/* Attach a free-flying crawler to platform q at its nearest point (resolves inner corners) */
function attachTo(e, q) {
  e.plat = q; e.s = sFromPoint(q, e.r, e.x, e.y);
  syncStuck(e);
  for (let iter = 0; iter < 4; iter++) {
    let fixed = true;
    for (const o of PLATS) {
      if (o !== e.plat && !(e.passSoft && o.soft) && rectDist(o, e.x, e.y) < e.r - 0.5) { e.plat = o; e.s = sFromPoint(o, e.r, e.x, e.y); syncStuck(e); fixed = false; break; }
    }
    if (fixed) break;
  }
}
function findCollision(x, y, r, exclude, passSoft) {
  let best = null, bd = r;
  for (const p of PLATS) {
    if (p === exclude || (passSoft && p.soft)) continue;
    const d = rectDist(p, x, y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function platAt(x, y) { for (const p of PLATS) if (pointInRect(p, x, y)) return p; return null; }
function lineOfSight(x1, y1, x2, y2, ignore) {
  for (const p of PLATS) if (p !== ignore && segRect(x1, y1, x2, y2, p, 1)) return false;
  return true;
}
/* March a ray; returns the first platform hit {x,y,plat} or null */
function rayPlat(x, y, dx, dy, maxLen, step = 3) {
  for (let t = 0; t <= maxLen; t += step) {
    const px = x + dx * t, py = y + dy * t;
    const p = platAt(px, py);
    if (p) return { x: px, y: py, plat: p, t };
  }
  return null;
}
/* Tangent (clockwise) of a stuck crawler */
const tangentOf = e => ({ x: -e.ny, y: e.nx });
/* Push a free point/circle out of platforms; returns true if it collided.
   Used for flies, bees and fireballs that bounce instead of sticking. */
function pushOut(o, r) {
  let hit = false;
  for (const p of PLATS) {
    const cx = clamp(o.x, p.x, p.x + p.w), cy = clamp(o.y, p.y, p.y + p.h);
    const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d < r) {
      hit = true;
      if (d > 0.001) { o.x = cx + dx / d * r; o.y = cy + dy / d * r; const nx = dx / d, ny = dy / d, vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= 1.8 * vn * nx; o.vy -= 1.8 * vn * ny; } }
      else {
        // centre inside the rect: push out along the shallowest axis
        const l = o.x - p.x, rr = p.x + p.w - o.x, t = o.y - p.y, b = p.y + p.h - o.y, m = Math.min(l, rr, t, b);
        if (m === l) { o.x = p.x - r; o.vx = -Math.abs(o.vx); } else if (m === rr) { o.x = p.x + p.w + r; o.vx = Math.abs(o.vx); }
        else if (m === t) { o.y = p.y - r; o.vy = -Math.abs(o.vy); } else { o.y = p.y + p.h + r; o.vy = Math.abs(o.vy); }
      }
    }
  }
  return hit;
}
