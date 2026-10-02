/* =====================================================================
   50_SPRITES - procedural pixel sprites (all drawn with canvas calls)
   Local sprite space: +x = facing direction, -y = away from the surface.
   ===================================================================== */

/* ---------- Spider customization catalogue ---------- */
const SPIDER_COLORS = [
  { name: 'GEAR',     body: '#3a2a5c', dark: '#1f1636', light: '#6a54a8', head: '#4a3772', leg: '#120b20', leg2: '#241a3d', gear: '#f2b233', ui: '#8f6cff' },
  { name: 'CRIMSON',  body: '#8a1c2c', dark: '#4a0d16', light: '#d8485a', head: '#a8263a', leg: '#2a0508', leg2: '#4a0d16', gear: '#ffd23f', ui: '#ff4d5e' },
  { name: 'MINT',     body: '#1f7a6a', dark: '#0f4a40', light: '#5fe0c0', head: '#2a9a86', leg: '#062a24', leg2: '#0f4a40', gear: '#ffffff', ui: '#3ff0c8' },
  { name: 'GOLDEN',   body: '#a87a12', dark: '#5a3f05', light: '#ffd84a', head: '#c99a1a', leg: '#3a2804', leg2: '#5a3f05', gear: '#e0e8f0', ui: '#ffc81f' },
  { name: 'SHADOW',   body: '#1c1c28', dark: '#08080c', light: '#4a4a6a', head: '#26263a', leg: '#000000', leg2: '#14141e', gear: '#3dfcff', ui: '#6a6aff' },
  { name: 'BLOSSOM',  body: '#c4508f', dark: '#7a2456', light: '#ff9ad0', head: '#d8679f', leg: '#3a0a26', leg2: '#5a1640', gear: '#ffffff', ui: '#ff7ac8' },
];
const SPIDER_HATS = ['NONE', 'TOP HAT', 'PARTY HAT', 'CROWN', 'BOW', 'CAP', 'LEAF SPROUT'];
const SPIDER_PATTERNS = ['NONE', 'STRIPES', 'SPOTS', 'BOLT', 'STAR'];

function drawGear(g, cx, cy, r, teeth, rot, color, hole) {
  g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = color;
  for (let i = 0; i < teeth; i++) { g.save(); g.rotate(i * TAU / teeth); g.fillRect(-r * 0.24, -r * 1.3, r * 0.48, r * 0.6); g.restore(); }
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = hole; g.beginPath(); g.arc(0, 0, r * 0.4, 0, TAU); g.fill();
  g.restore();
}
function drawStarShape(g, x, y, r, color, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fillStyle = color; g.fill();
}
function drawCocoon(g, w, h) {
  g.globalAlpha = 0.85;
  pxEllipse(g, 0, -1, w, h, 'rgba(235,245,255,0.55)');
  g.strokeStyle = '#ffffff'; g.lineWidth = 1;
  g.beginPath();
  for (let i = -w; i <= w; i += 4) { g.moveTo(i, -h); g.lineTo(i + 5, h); g.moveTo(i + 4, -h); g.lineTo(i - 1, h); }
  g.moveTo(-w - 1, -1); g.lineTo(w + 2, -2);
  g.stroke();
  g.globalAlpha = 1;
}

/* ---------- Spider (player / bots / remote players) ---------- */
function drawSpider(x, y, angle, facing, phase, o = {}) {
  const st = o.style || { c: 0, h: 0, p: 0 };
  const P = SPIDER_COLORS[st.c % SPIDER_COLORS.length];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.scale(facing * (o.scale || 1), o.scale || 1);
  if (o.powered) { ctx.globalAlpha = 0.22 + 0.14 * Math.sin(T * 8); pxCircle(ctx, 0, 0, 11, '#ffd23f'); ctx.globalAlpha = 1; }
  if (o.slowed) { ctx.globalAlpha = 0.35; pxCircle(ctx, 0, 0, 10, '#9ad0ff'); ctx.globalAlpha = 1; }
  const hips = [[-4, 0], [-1.5, 1], [1, 1], [3, 0]];
  const feet = [[-11, 8], [-5, 8], [4, 8], [10, 8]];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let layer = 0; layer < 2; layer++) {
    ctx.strokeStyle = layer === 0 ? P.leg : P.leg2;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const ph = phase + i * 1.6 + layer * Math.PI;
      let fx, fy;
      if (o.air) { fx = feet[i][0] * 1.05 + Math.sin(T * 18 + i + layer) * 1.2; fy = 5 + (i % 2) * 2; }
      else { fx = feet[i][0] + Math.sin(ph) * 2.2 + (layer ? 1 : -1); fy = feet[i][1] - Math.max(0, Math.cos(ph)) * 2.5; }
      const hx = hips[i][0], hy = hips[i][1];
      const kx = (hx + fx) / 2 + (fx >= 0 ? 1.5 : -1.5), ky = -6 + (layer ? 0 : 1);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
  }
  // abdomen
  pxEllipse(ctx, -3.5, -1, 6, 5, P.dark);
  pxEllipse(ctx, -3.5, -1.5, 5, 4, P.body);
  // pattern accents
  ctx.fillStyle = P.light;
  if (st.p === 1) { ctx.fillRect(-7, -3, 1, 4); ctx.fillRect(-5, -4, 1, 6); ctx.fillRect(-1, -4, 1, 6); }
  else if (st.p === 2) { ctx.fillRect(-7, -2, 2, 2); ctx.fillRect(-2, -4, 2, 2); ctx.fillRect(-3, 1, 2, 1); }
  else if (st.p === 3) { ctx.fillStyle = '#ffe45c'; ctx.fillRect(-6, -4, 2, 2); ctx.fillRect(-5, -2, 2, 1); ctx.fillRect(-4, -1, 2, 2); ctx.fillRect(-3, 1, 1, 2); }
  else if (st.p === 4) { drawStarShape(ctx, -6, -1, 2.5, '#fff3a0', 0); }
  else pxEllipse(ctx, -4.5, -3.5, 2, 1, P.light);
  drawGear(ctx, -2.5, -1.2, 2.1, 6, o.gear || 0, o.powered ? '#ffe45c' : P.gear, P.body);
  // head
  pxCircle(ctx, 3.5, 0.5, 3, P.head);
  ctx.fillStyle = P.light; ctx.fillRect(3, -2, 2, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(4, -2, 2, 2); ctx.fillRect(6, -1.5, 2, 2);
  ctx.fillStyle = o.powered ? '#ff3355' : '#120b20'; ctx.fillRect(5, -1, 1, 1); ctx.fillRect(7, -0.5, 1, 1);
  ctx.fillStyle = '#ffe7f0'; ctx.fillRect(6, 2.5, 1, 1.5); ctx.fillRect(5, 3, 1, 1);
  drawHat(st.h, P);
  if (o.frozen) { ctx.save(); ctx.scale(0.7, 0.8); drawCocoon(ctx, 12, 7); ctx.restore(); }
  ctx.restore();
}
function drawHat(h, P) {
  switch (h) {
    case 1: ctx.fillStyle = '#111'; ctx.fillRect(1, -4, 6, 1); ctx.fillRect(2, -9, 4, 5); ctx.fillStyle = '#d8304a'; ctx.fillRect(2, -5, 4, 1); break;
    case 2: ctx.fillStyle = '#ff5a9a'; ctx.fillRect(3, -4, 3, 1); ctx.fillRect(3, -5, 2, 1); ctx.fillRect(4, -6, 1, 1); ctx.fillStyle = '#ffe45c'; ctx.fillRect(4, -7, 1, 1); ctx.fillRect(3, -5, 1, 1); break;
    case 3: ctx.fillStyle = '#ffd23f'; ctx.fillRect(2, -5, 5, 2); ctx.fillRect(2, -7, 1, 2); ctx.fillRect(4, -7, 1, 2); ctx.fillRect(6, -7, 1, 2); ctx.fillStyle = '#ff3b5c'; ctx.fillRect(4, -5, 1, 1); break;
    case 4: ctx.fillStyle = '#ff5a9a'; ctx.fillRect(1, -4, 2, 2); ctx.fillRect(4, -4, 2, 2); ctx.fillStyle = '#ffd1e6'; ctx.fillRect(3, -3, 1, 1); break;
    case 5: ctx.fillStyle = '#2d7ff9'; ctx.fillRect(2, -5, 5, 2); ctx.fillRect(6, -4, 3, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(3, -5, 1, 1); break;
    case 6: ctx.fillStyle = '#2f8f3a'; ctx.fillRect(4, -6, 1, 3); ctx.fillStyle = '#5fd24b'; ctx.fillRect(1, -7, 3, 2); ctx.fillRect(5, -8, 3, 2); break;
  }
}

/* ---------- Lizard ---------- */
function drawLizard(x, y, angle, facing, phase, headRot, o = {}) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle); ctx.scale(facing, 1);
  if (o.shiver) ctx.translate(Math.sin(T * 60) * 0.8, 0);
  const body = o.flash ? '#ff7a6a' : '#4fb944', dark = '#2f7f2b', belly = '#c9ec6d', spot = '#2a6a25';
  const legs = [[6, 0], [-6, 1]];
  legs.forEach(([lx], i) => { const off = o.air ? 1 : Math.sin(phase * 0.35 + i * Math.PI + Math.PI) * 2; ctx.fillStyle = dark; ctx.fillRect(lx - 1 + off * 0.5, 1, 2, 4); ctx.fillRect(lx - 2 + off, 5, 4, 1); });
  for (let i = 0; i <= 12; i++) { const t = i / 12; pxCircle(ctx, -8 - t * 22, 1 + Math.sin(T * 2.5 + t * 3) * t * 2.2 + t * 1.5, Math.max(1, Math.round(3.3 * (1 - t) + 0.6)), i % 3 === 0 ? spot : body); }
  pxEllipse(ctx, 0, 0, 10, 4, body);
  ctx.fillStyle = belly; ctx.fillRect(-7, 2, 14, 2);
  ctx.fillStyle = spot; ctx.fillRect(-5, -2, 2, 1); ctx.fillRect(0, -3, 2, 1); ctx.fillRect(4, -2, 2, 1);
  ctx.fillStyle = dark; for (let sx = -7; sx <= 5; sx += 3) { ctx.fillRect(sx, -5, 1, 1); ctx.fillRect(sx - 1, -4, 3, 1); }
  legs.forEach(([lx], i) => { const off = o.air ? -1 : Math.sin(phase * 0.35 + i * Math.PI) * 2; ctx.fillStyle = body; ctx.fillRect(lx - 1 + off * 0.5, 1, 3, 4); ctx.fillStyle = dark; ctx.fillRect(lx - 2 + off, 5, 5, 1); });
  ctx.save(); ctx.translate(8, -1); ctx.rotate(headRot);
  pxEllipse(ctx, 4, 0, 6, 3, body);
  ctx.fillStyle = belly; ctx.fillRect(1, 2, 8, 1);
  if (o.mouthOpen) { ctx.fillStyle = o.fire ? '#ff8a00' : '#7a1f3a'; ctx.fillRect(5, 0, 6, 2); ctx.fillStyle = o.fire ? '#ffe45c' : '#ff5d8f'; ctx.fillRect(6, 1, 4, 1); }
  else { ctx.fillStyle = dark; ctx.fillRect(4, 1, 6, 1); }
  drawEye(3, -3, o);
  ctx.fillStyle = dark; ctx.fillRect(9, -1, 1, 1);
  ctx.restore();
  if (o.frozen) drawCocoon(ctx, 13, 6);
  ctx.restore();
}
function drawEye(x, y, o) {
  if (o.hell) { ctx.globalAlpha = 0.45 + 0.25 * Math.sin(T * 10); pxCircle(ctx, x + 1.5, y + 1.5, 3, '#ff2d2d'); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = o.hell ? '#ff1a1a' : o.windup ? '#ff2d2d' : '#1a1a1a'; ctx.fillRect(x + 1, y + 1, 2, 2);
}

/* ---------- Gecko (fast, sticky toe pads, 360 climber) ---------- */
function drawGecko(x, y, angle, facing, phase, headRot, o = {}) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle); ctx.scale(facing, 1);
  if (o.shiver) ctx.translate(Math.sin(T * 60) * 0.8, 0);
  const body = o.flash ? '#ffd0a0' : '#ff8a2a', dark = '#c45a10', belly = '#ffd27a', spot = '#2aa8e8';
  const legs = [[7, 0], [-6, 0]];
  const foot = (lx, off, near) => { ctx.fillStyle = near ? body : dark; ctx.fillRect(lx - 1 + off * 0.5, 1, 2, 4); ctx.fillStyle = '#ffe0b0'; ctx.fillRect(lx - 2 + off, 5, 1, 1); ctx.fillRect(lx + off, 5, 1, 1); ctx.fillRect(lx + 2 + off, 5, 1, 1); };
  legs.forEach(([lx], i) => foot(lx, o.air ? 2 : Math.sin(phase * 0.5 + i * Math.PI + Math.PI) * 2.5, false));
  for (let i = 0; i <= 10; i++) { const t = i / 10; pxCircle(ctx, -7 - t * 16, 1 + Math.sin(T * 5 + t * 4) * t * 3, Math.max(1, Math.round(2.8 * (1 - t) + 0.5)), i % 3 === 1 ? spot : body); }
  pxEllipse(ctx, 0, 0, 8, 3.5, body);
  ctx.fillStyle = belly; ctx.fillRect(-6, 2, 12, 1);
  ctx.fillStyle = spot; ctx.fillRect(-4, -2, 2, 2); ctx.fillRect(1, -3, 2, 2); ctx.fillRect(4, -1, 1, 1);
  legs.forEach(([lx], i) => foot(lx, o.air ? -2 : Math.sin(phase * 0.5 + i * Math.PI) * 2.5, true));
  ctx.save(); ctx.translate(7, -1); ctx.rotate(headRot);
  pxEllipse(ctx, 4, 0, 5, 3.5, body);
  if (o.mouthOpen) { ctx.fillStyle = o.fire ? '#ff8a00' : '#7a1f3a'; ctx.fillRect(5, 1, 5, 2); }
  else { ctx.fillStyle = dark; ctx.fillRect(4, 2, 5, 1); }
  if (o.hell) { ctx.globalAlpha = 0.5; pxCircle(ctx, 4, -2, 4, '#ff2d2d'); ctx.globalAlpha = 1; }
  pxCircle(ctx, 4, -2, 2.5, '#fff7d0');
  ctx.fillStyle = o.hell ? '#ff1a1a' : o.windup ? '#ff2d2d' : '#1a1a1a'; ctx.fillRect(4, -3, 2, 3);
  ctx.restore();
  if (o.frozen) drawCocoon(ctx, 12, 6);
  ctx.restore();
}

/* ---------- Black Widow (boss) ---------- */
function drawWidow(x, y, angle, facing, phase, o = {}) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle); ctx.scale(facing, 1);
  if (o.shiver) ctx.translate(Math.sin(T * 60) * 1, 0);
  if (o.windup) ctx.translate(Math.sin(T * 50) * 0.7, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const hips = [[-3, 0], [-1, 1], [1.5, 1], [4, 0]];
  const feet = [[-17, 11], [-8, 12], [7, 12], [16, 11]];
  for (let layer = 0; layer < 2; layer++) {
    ctx.strokeStyle = layer ? '#2a2a34' : '#0a0a0e'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ph = phase * 0.9 + i * 1.6 + layer * Math.PI;
      let fx, fy;
      if (o.air) { fx = feet[i][0] * 0.95; fy = 7 + (i % 2) * 2; }
      else { fx = feet[i][0] + Math.sin(ph) * 3 + (layer ? 1.5 : -1.5); fy = feet[i][1] - Math.max(0, Math.cos(ph)) * 3; }
      const kx = (hips[i][0] + fx) / 2 + (fx >= 0 ? 2 : -2), ky = -10 + (layer ? 0 : 1);
      ctx.beginPath(); ctx.moveTo(hips[i][0], hips[i][1]); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
  }
  pxEllipse(ctx, -6, -3, 10, 8, '#050508');
  pxEllipse(ctx, -6, -4, 9, 7, '#14141c');
  pxEllipse(ctx, -9, -8, 3, 2, '#3a3a52');
  // red hourglass
  ctx.fillStyle = '#e8102a'; ctx.fillRect(-8, -3, 5, 1); ctx.fillRect(-7, -2, 3, 1); ctx.fillRect(-6, -1, 1, 1); ctx.fillRect(-7, 0, 3, 1); ctx.fillRect(-8, 1, 5, 1);
  pxCircle(ctx, 5, 0, 5, '#0a0a10');
  pxCircle(ctx, 5, -1, 4, '#1a1a24');
  // eye cluster
  const eye = o.hell || o.windup ? '#ff1a1a' : '#c0102a';
  if (o.hell || o.windup) { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 12); pxCircle(ctx, 7, -2, 5, '#ff2d2d'); ctx.globalAlpha = 1; }
  ctx.fillStyle = eye; ctx.fillRect(6, -3, 2, 2); ctx.fillRect(8, -2, 2, 2); ctx.fillRect(5, -1, 1, 1); ctx.fillRect(9, 0, 1, 1); ctx.fillRect(7, -5, 1, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(6, -3, 1, 1);
  ctx.fillStyle = '#5a0a14'; ctx.fillRect(9, 2, 2, 3); ctx.fillRect(7, 3, 1, 2);
  if (o.mouthOpen) { ctx.fillStyle = '#ff8a00'; ctx.fillRect(9, 1, 3, 2); }
  if (o.frozen) { ctx.save(); ctx.scale(1.4, 1.5); drawCocoon(ctx, 13, 7); ctx.restore(); }
  ctx.restore();
}

/* ---------- Bee ---------- */
function drawBee(x, y, facing, o = {}) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  if (o.falling) ctx.rotate(T * 14);
  ctx.scale(facing * 2, 2);   // bees are drawn at 2x
  const wing = Math.abs(Math.sin(T * 40)) * 3;
  ctx.fillStyle = 'rgba(230,245,255,0.75)';
  if (!o.falling) { ctx.fillRect(-2, -4 - wing, 3, 2 + wing); ctx.fillRect(1, -3 - wing * 0.8, 3, 2 + wing * 0.8); }
  pxEllipse(ctx, 0, 0, 4, 3, '#ffcf2a');
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-2, -3, 1, 6); ctx.fillRect(1, -3, 1, 6);
  ctx.fillRect(-5, 0, 1, 1);
  if (o.hell) { ctx.globalAlpha = 0.6; pxCircle(ctx, 4, -1, 2, '#ff2d2d'); ctx.globalAlpha = 1; }
  ctx.fillStyle = o.hell ? '#ff1a1a' : '#1a1a1a'; ctx.fillRect(3, -1, 1, 1);
  if (o.angry) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(3, -2, 2, 1); }
  ctx.restore();
}

/* ---------- Beehive ---------- */
function drawHive(x, y, o = {}) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  if (o.shiver) ctx.translate(Math.sin(T * 50), 0);
  ctx.fillStyle = '#6b3f1f'; ctx.fillRect(-1, -18, 2, 5);
  const rings = [[-12, 7, 5], [-6, 11, 5], [0, 13, 5], [6, 12, 5], [11, 8, 4]];
  for (const [ry, rw, rh] of rings) { pxEllipse(ctx, 0, ry, rw, rh, '#b8782a'); pxEllipse(ctx, 0, ry - 1, rw - 1, rh - 2, '#e0a542'); }
  for (const [ry, rw] of rings) { ctx.fillStyle = '#8a5418'; ctx.fillRect(-rw + 2, ry + 3, rw * 2 - 4, 1); }
  pxEllipse(ctx, 0, 6, 3, 2.5, '#2a1405');
  ctx.fillStyle = '#ffe98a'; ctx.fillRect(-7, -9, 2, 1); ctx.fillRect(-9, -3, 2, 1);
  ctx.fillStyle = '#ffcf2a'; ctx.fillRect(4, 14, 2, 3); // honey drip
  if (o.frozen) { ctx.save(); ctx.scale(1.15, 2.4); drawCocoon(ctx, 13, 7); ctx.restore(); }
  ctx.restore();
}

/* ---------- Glowing red heart butterfly ---------- */
function drawButterfly(x, y, seed, fade = 1) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(1.4, 1.4);
  ctx.globalAlpha = (0.3 + 0.15 * Math.sin(T * 7 + seed)) * fade;
  pxCircle(ctx, 0, 0, 11, '#ff2d4a');
  ctx.globalAlpha = fade;
  const flap = Math.abs(Math.sin(T * 16 + seed));
  const w = 1 + flap * 5;
  // wings (upper + lower lobes each side)
  ctx.fillStyle = '#ff2d4a';
  ctx.fillRect(-1 - w, -5, w, 5); ctx.fillRect(1, -5, w, 5);
  ctx.fillStyle = '#c4102a';
  ctx.fillRect(-1 - w * 0.75, 0, w * 0.75, 4); ctx.fillRect(1, 0, w * 0.75, 4);
  ctx.fillStyle = '#ffb3c1';
  if (w > 2.5) { ctx.fillRect(-w + 0.5, -4, 1.5, 1.5); ctx.fillRect(w - 1.5, -4, 1.5, 1.5); }
  // body + antennae
  ctx.fillStyle = '#2a0a12'; ctx.fillRect(-1, -5, 2, 9);
  ctx.fillRect(-2, -7, 1, 2); ctx.fillRect(1, -7, 1, 2);
  // tiny heart badge
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -3, 1, 1); ctx.fillRect(0, -3, 1, 1);
  ctx.restore(); ctx.globalAlpha = 1;
}

/* ---------- Golden fly ---------- */
function drawFly(x, y, o = {}) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  ctx.globalAlpha = 0.25 + 0.12 * Math.sin(T * 6 + x);
  pxCircle(ctx, 0, 0, 7, '#fff3a0');
  ctx.globalAlpha = 1;
  const wing = Math.abs(Math.sin(T * 45 + x)) * 3;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-3, -3 - wing, 3, 2 + wing); ctx.fillRect(1, -3 - wing, 3, 2 + wing);
  pxEllipse(ctx, 0, 0, 3, 2, '#c08a00');
  pxEllipse(ctx, 0, -0.5, 2, 1, '#ffd23f');
  ctx.fillStyle = '#fff6c2'; ctx.fillRect(-1, -1, 1, 1);
  ctx.fillStyle = '#7a1f1f'; ctx.fillRect(2, -1, 1, 1);
  ctx.restore();
}
function drawStarCoin(x, y, s = 1) {
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(T * 6);
  pxCircle(ctx, x, y, 14 * s, '#fff3a0');
  ctx.globalAlpha = 1;
  const rot = Math.sin(T * 2) * 0.2;
  drawStarShape(ctx, x + 1, y + 1, 10 * s, '#8a5a00', rot);
  drawStarShape(ctx, x, y, 10 * s, '#ffd23f', rot);
  drawStarShape(ctx, x - 1, y - 1, 5 * s, '#fff3a0', rot);
}
function drawHeart(x, y, s, filled) {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  for (let ry = 0; ry < rows.length; ry++) for (let rx = 0; rx < 7; rx++) {
    if (rows[ry][rx] !== '#') continue;
    ctx.fillStyle = filled ? '#ff3b5c' : '#3b2b55'; ctx.fillRect(x + rx * s, y + ry * s, s, s);
  }
  ctx.fillStyle = '#1b1230';
  const outline = [[1,-1],[2,-1],[4,-1],[5,-1],[0,0],[3,0],[6,0],[-1,1],[7,1],[-1,2],[7,2],[0,3],[6,3],[1,4],[5,4],[2,5],[4,5],[3,6]];
  outline.forEach(([ox, oy]) => ctx.fillRect(x + ox * s, y + oy * s, s, s));
  if (filled) { ctx.fillStyle = '#ffb3c1'; ctx.fillRect(x + s, y + s, s, s); }
}
/* ---------- Fire flame (HELL MODE) ---------- */
function drawFlame(x, y, size, seed) {
  const f = Math.floor(T * 12 + seed * 7) % 3;
  const h = size * (1 + f * 0.15), w = size * 0.6;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
  ctx.globalAlpha = 0.25; pxCircle(ctx, 0, -h * 0.4, size, '#ff6a00'); ctx.globalAlpha = 1;
  ctx.fillStyle = '#d81e05';
  ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w, -h * 0.6, (f - 1) * 1.5, -h); ctx.quadraticCurveTo(w, -h * 0.6, w, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff8a00';
  ctx.beginPath(); ctx.moveTo(-w * 0.6, 0); ctx.quadraticCurveTo(-w * 0.6, -h * 0.45, (1 - f) * 1, -h * 0.72); ctx.quadraticCurveTo(w * 0.6, -h * 0.45, w * 0.6, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe45c'; ctx.fillRect(-1, -h * 0.35, 2, h * 0.35);
  ctx.restore();
}
