/* =====================================================================
   40_LEVELS - biomes, seeded pseudo-random level generator, cached art
   ---------------------------------------------------------------------
   generateLevel(biome, seed) is fully deterministic: the VS host only has
   to send the seed for every peer to build the identical arena.
   ===================================================================== */
const BIOMES = [
  { key: 'field',  name: 'GRASSY FIELD',    enemy: 'lizard', npc: 'LIZARD',
    sky: ['#3fa9e6', '#4db3eb', '#5cbdf0', '#6cc7f3', '#7dd0f5', '#8fd9f7', '#a3e2f8', '#b8eaf9'],
    far: ['#a4dc8c', '#b9e8a0'], near: ['#74c95e', '#8ad871'], bush: ['#4fae45', '#63c255'], sun: '#ffe45c' },
  { key: 'meadow', name: 'FLOWER MEADOW',   enemy: 'hive',   npc: 'BEEHIVE',
    sky: ['#7ec8f0', '#8fd0f2', '#a3d8f2', '#b8def0', '#cfe2ee', '#e6dcef', '#f3d2e6', '#f9c9dc'],
    far: ['#b6e3a0', '#c9eeb3'], near: ['#86d16a', '#9ade7c'], bush: ['#5fbf52', '#79cf62'], sun: '#fff1a0' },
  { key: 'island', name: 'TROPICAL ISLAND', enemy: 'gecko',  npc: 'GECKO',
    sky: ['#1fa3e0', '#2fb0e6', '#40bdeb', '#55c8ef', '#6cd2f2', '#86dcf5', '#a2e5f7', '#c0eef9'],
    far: ['#4f9a78', '#66b08c'], near: ['#2a7fc9', '#3b97d9'], bush: ['#3fae3a', '#5fd24b'], sun: '#fff6a8' },
  { key: 'barn',   name: 'OLD BARN',        enemy: 'widow',  npc: 'BLACK WIDOW',
    sky: ['#3d2a6b', '#5a3279', '#7d3b7f', '#a3477c', '#c95a6e', '#e8755d', '#f59a52', '#f8be5c'],
    far: ['#d9a640', '#e8bb52'], near: ['#c48a2e', '#d69d3a'], bush: ['#b8862a', '#d6a540'], sun: '#ff9a3c' },
];
const WOOD_TYPES = new Set(['branch', 'log', 'trunk', 'trunkR', 'palm', 'frond', 'drift', 'beam', 'plank', 'loft', 'fence', 'crate', 'hay', 'barnwall']);
const GROUND_Y = 320;

function mkPlat(x, y, w, h, type, extra) {
  const p = Object.assign({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), type }, extra || {});
  p.wood = WOOD_TYPES.has(type);
  p.soft = type === 'frond';          // palm leaves: the gecko slips straight through them
  return p;
}
function rectsOverlap(a, b, m = 0) { return a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y; }

/* Can candidate c be placed? touch = platforms it may sit flush against */
function fits(c, plats, touch, margin, reserved) {
  if (c.x < 22 || c.x + c.w > 618 || c.y < 34) {
    if (!touch || !touch.length) return false;
  }
  for (const p of plats) {
    if (touch && touch.includes(p)) { if (rectsOverlap(c, p, -1)) return false; continue; }
    if (rectsOverlap(c, p, margin)) return false;
  }
  for (const z of reserved || []) if (rectsOverlap(c, z, 0)) return false;
  return true;
}

function generateLevel(biomeIdx, seed) {
  const r = rng((seed >>> 0) ^ (biomeIdx * 0x9E3779B1));
  const B = BIOMES[biomeIdx];
  const L = { biome: biomeIdx, B, seed: seed >>> 0, plats: [], spawns: [], enemySpawn: null, hive: null, barn: null, water: null, decor: [] };
  const P = L.plats;
  const M = 24;                       // free gap around platforms so crawlers always fit
  let ground, spawnXs = [70, 570, 200, 440];

  /* ---- Fixed frame per biome ---- */
  if (biomeIdx === 0) {
    ground = mkPlat(-400, GROUND_Y, 1440, 240, 'ground'); P.push(ground);
    P.push(mkPlat(-30, -400, 46, 720, 'trunk'));
    P.push(mkPlat(624, -400, 120, 720, 'cliff'));
  } else if (biomeIdx === 1) {
    ground = mkPlat(-400, GROUND_Y, 1440, 240, 'meadow'); P.push(ground);
    P.push(mkPlat(-30, -400, 46, 720, 'trunk'));
    P.push(mkPlat(624, -400, 46, 720, 'trunkR'));
    const hb = mkPlat(16, 64, 176, 11, 'branch', { hiveBranch: true }); P.push(hb);
    L.hive = { x: 136, y: hb.y + hb.h + 17 };
  } else if (biomeIdx === 2) {
    ground = mkPlat(96, 296, 448, 200, 'sand'); P.push(ground);
    L.water = { y: 330 };
    spawnXs = [150, 490, 250, 390];
  } else {
    ground = mkPlat(-400, GROUND_Y, 1440, 240, 'dirt'); P.push(ground);
    P.push(mkPlat(-30, -400, 46, 720, 'silo'));
    P.push(mkPlat(624, -400, 120, 720, 'barnwall'));
    P.push(mkPlat(330, 72, 294, 10, 'beam'));
    P.push(mkPlat(330, 82, 12, 170, 'barnwall', { inner: true }));
    L.barn = { x0: 330, x1: 624, y0: 72 };
  }
  const frame = P.slice();
  const gTop = ground.y;
  // Keep spawn points clear of ground-sitting props
  const reserved = spawnXs.map(x => ({ x: x - 20, y: gTop - 60, w: 40, h: 60 }));
  if (L.hive) reserved.push({ x: L.hive.x - 34, y: L.hive.y - 20, w: 68, h: 60 });

  const tryPlace = (make, n, tries = 90) => {
    let placed = 0;
    for (let t = 0; t < tries && placed < n; t++) {
      const c = make();
      if (!c) continue;
      if (fits(c, P, c.touch, M, reserved)) { delete c.touch; P.push(c); placed++; }
    }
    return placed;
  };
  const xIn = (w, x0 = 30, x1 = 610) => randInt(r, x0, Math.max(x0, x1 - w));

  /* ---- Biome specific random dressing ---- */
  if (biomeIdx === 0) {
    tryPlace(() => { const w = randInt(r, 96, 136); const c = mkPlat(16, randInt(r, 90, 150), w, 10, 'branch'); c.touch = [P[1]]; return c; }, 1);
    tryPlace(() => { const w = randInt(r, 72, 110); const c = mkPlat(624 - w, randInt(r, 96, 170), w, 13, 'shelf'); c.touch = [P[2]]; return c; }, 1);
    tryPlace(() => { const w = randInt(r, 80, 124); return mkPlat(xIn(w, 120, 560), randInt(r, 56, 130), w, randInt(r, 12, 14), 'ledge'); }, 2);
    tryPlace(() => { const w = randInt(r, 70, 120); return mkPlat(xIn(w), randInt(r, 150, 230), w, randInt(r, 12, 15), 'ledge'); }, 2);
    tryPlace(() => { const w = randInt(r, 46, 76), h = randInt(r, 34, 56); const c = mkPlat(xIn(w, 100, 560), gTop - h, w, h, 'boulder'); c.touch = [ground]; return c; }, 2);
    tryPlace(() => { const w = randInt(r, 34, 48); return mkPlat(xIn(w), randInt(r, 120, 250), w, randInt(r, 15, 19), 'rock'); }, 2);
    L.enemySpawn = { x: 560, y: gTop - 10 };
  } else if (biomeIdx === 1) {
    tryPlace(() => { const w = randInt(r, 64, 104); return mkPlat(xIn(w, 210, 600), randInt(r, 50, 120), w, 10, 'leaf'); }, 2);
    tryPlace(() => { const w = randInt(r, 70, 116); return mkPlat(xIn(w), randInt(r, 140, 230), w, 14, 'log'); }, 2);
    tryPlace(() => { const w = randInt(r, 40, 58); return mkPlat(xIn(w, 60, 590), randInt(r, 170, 250), w, 12, 'mushroom'); }, 2);
    tryPlace(() => { const w = randInt(r, 44, 70), h = randInt(r, 30, 50); const c = mkPlat(xIn(w, 120, 560), gTop - h, w, h, 'boulder'); c.touch = [ground]; return c; }, 2);
    tryPlace(() => { const w = randInt(r, 64, 96); const c = mkPlat(624 - w, randInt(r, 110, 200), w, 12, 'branch', { flip: true }); c.touch = [P[2]]; return c; }, 1);
    L.enemySpawn = { x: L.hive.x, y: L.hive.y };
  } else if (biomeIdx === 2) {
    // palms rising from the plateau with a frond canopy platform on top
    tryPlace(() => {
      const x = randInt(r, 150, 480), top = randInt(r, 120, 190);
      const c = mkPlat(x, top, 12, gTop - top, 'palm'); c.touch = [ground];
      return c;
    }, 2);
    for (const p of P.filter(q => q.type === 'palm')) {
      const f = mkPlat(p.x - 26, p.y - 8, 64, 8, 'frond');
      if (fits(f, P, [p], 14, [])) P.push(f);
    }
    tryPlace(() => { const w = randInt(r, 64, 110); return mkPlat(xIn(w, 14, 626), randInt(r, 60, 150), w, 10, 'drift'); }, 3);
    tryPlace(() => { const w = randInt(r, 50, 90); return mkPlat(xIn(w, 14, 626), randInt(r, 170, 250), w, 10, 'drift'); }, 2);
    tryPlace(() => { const w = randInt(r, 36, 60), h = randInt(r, 18, 30); const c = mkPlat(xIn(w, 120, 520), gTop - h, w, h, 'beachrock'); c.touch = [ground]; return c; }, 2);
    L.enemySpawn = { x: 470, y: gTop - 10 };
  } else {
    // exterior (wheat field side): fence rails and floating planks
    tryPlace(() => { const w = randInt(r, 60, 96); return mkPlat(xIn(w, 40, 300), randInt(r, 215, 262), w, 8, 'fence'); }, 1);
    tryPlace(() => { const w = randInt(r, 60, 100); return mkPlat(xIn(w, 40, 300), randInt(r, 70, 170), w, 10, 'plank'); }, 2);
    tryPlace(() => { const w = randInt(r, 36, 48); return mkPlat(xIn(w, 40, 300), randInt(r, 150, 240), w, randInt(r, 15, 18), 'rock'); }, 1);
    // interior: lofts on the barn wall, crates and hay bales
    tryPlace(() => { const w = randInt(r, 80, 130); const c = mkPlat(624 - w, randInt(r, 130, 190), w, 10, 'loft'); c.touch = [P[2]]; return c; }, 1);
    tryPlace(() => { const w = randInt(r, 60, 100); return mkPlat(xIn(w, 362, 560), randInt(r, 120, 220), w, 10, 'plank'); }, 1);
    tryPlace(() => { const s = randInt(r, 26, 34); const c = mkPlat(xIn(s, 360, 600), gTop - s, s, s, 'crate'); c.touch = [ground]; return c; }, 2);
    tryPlace(() => { const w = randInt(r, 40, 56), h = randInt(r, 24, 30); const c = mkPlat(xIn(w, 60, 600), gTop - h, w, h, 'hay'); c.touch = [ground]; return c; }, 2);
    const beam = P.find(p => p.type === 'beam');
    L.enemySpawn = { x: beam.x + beam.w / 2 + 20, y: beam.y + beam.h + 10, plat: beam };   // the widow drops from the rafters
  }
  // Guarantee at least two high anchors for rope swinging
  let high = P.filter(p => !frame.includes(p) && p.y < 160).length;
  for (let t = 0; t < 60 && high < 2; t++) {
    const w = randInt(r, 60, 100);
    const type = biomeIdx === 0 ? 'ledge' : biomeIdx === 1 ? 'leaf' : biomeIdx === 2 ? 'drift' : 'plank';
    const c = mkPlat(xIn(w, 100, 540), randInt(r, 60, 150), w, 10, type);
    if (fits(c, P, null, M, reserved)) { P.push(c); high++; }
  }
  // Spawn points (on the ground / plateau surface)
  L.spawns = spawnXs.map(x => ({ x, y: gTop - 9 }));
  // Decorative extras
  const dr = rng(seed ^ 0xABCDEF);
  if (biomeIdx === 3) for (let x = -20; x < 340; x += 4 + Math.floor(dr() * 5)) L.decor.push({ k: 'wheat', x, h: 18 + Math.floor(dr() * 22), ph: dr() * TAU });
  if (biomeIdx === 2) for (let i = 0; i < 6; i++) L.decor.push({ k: 'shell', x: 110 + dr() * 420, c: pick(dr, ['#ffb3c1', '#fff3d6', '#ffd29a']) });
  return L;
}

/* =====================================================================
   ART: cached sky + scene layers per level, rebuilt on resize
   ===================================================================== */
const ART = { sky: null, scene: null, clouds: [], cloudSprites: [], level: null, bw: 0, bh: 0 };

function buildLevelArt(L) {
  ART.level = L; ART.bw = BW; ART.bh = BH;
  const B = L.B;
  /* ---- Sky ---- */
  ART.sky = makeCanvas(BW, BH);
  let g = ART.sky.getContext('2d');
  const horizon = OY + (L.biome === 2 ? 240 : 290), bandH = Math.ceil(horizon / B.sky.length);
  B.sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * bandH, BW, bandH + 1); });
  g.fillStyle = B.sky[B.sky.length - 1]; g.fillRect(0, horizon, BW, BH);
  // sun
  const sx = OX + (L.biome === 3 ? 140 : 470), sy = OY + (L.biome === 3 ? 230 : 46), sr = L.biome === 3 ? 26 : 14;
  g.globalAlpha = 0.22; pxCircle(g, sx, sy, sr * 1.9, '#fff6c2');
  g.globalAlpha = 0.4; pxCircle(g, sx, sy, sr * 1.4, '#fff6c2');
  g.globalAlpha = 1; pxCircle(g, sx, sy, sr, B.sun); pxCircle(g, sx - sr * 0.25, sy - sr * 0.25, sr * 0.55, '#fff3c0');
  if (L.biome === 3) { // sunset bands across the sun
    g.fillStyle = B.sky[5]; for (let i = 0; i < 4; i++) g.fillRect(sx - sr - 2, sy + 4 + i * 6, sr * 2 + 4, 2);
  }
  if (L.biome === 2) { // sea horizon
    const sh = OY + 238;
    g.fillStyle = B.near[0]; g.fillRect(0, sh, BW, BH - sh);
    g.fillStyle = B.near[1]; for (let y = sh + 6; y < BH; y += 9) g.fillRect(0, y, BW, 2);
    // distant islands
    const ir = rng(L.seed ^ 77);
    for (let i = 0; i < 3; i++) {
      const ix = OX + ir() * REF_W, iw = 40 + ir() * 60;
      pxEllipse(g, ix, sh, iw, 9 + ir() * 6, B.far[0]);
      pxEllipse(g, ix - 6, sh - 3, iw * 0.6, 6, B.far[1]);
    }
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) g.fillRect(Math.floor(ir() * BW), sh + 3 + Math.floor(ir() * (BH - sh)), 2, 1);
  }
  /* ---- Cloud sprites ---- */
  ART.cloudSprites = [];
  const cr = rng(7 + L.biome);
  const cloudTint = L.biome === 3 ? ['#e8a3b0', '#ffd6c2'] : ['#c6e3f5', '#ffffff'];
  for (let i = 0; i < 4; i++) {
    const w = 50 + Math.floor(cr() * 40), h = 26;
    const c = makeCanvas(w + 10, h + 6), cg = c.getContext('2d');
    const blobs = [];
    for (let b = 0; b < 5; b++) blobs.push([8 + cr() * (w - 16), 12 + cr() * 6, 6 + Math.floor(cr() * 7)]);
    blobs.forEach(([bx, by, br]) => pxCircle(cg, bx + 3, by + 3, br, cloudTint[0]));
    blobs.forEach(([bx, by, br]) => pxCircle(cg, bx + 3, by + 1, br, cloudTint[1]));
    ART.cloudSprites.push(c);
  }
  ART.clouds = [];
  const n = Math.max(4, Math.round(BW / 130));
  for (let i = 0; i < n; i++) ART.clouds.push({ x: cr() * BW, y: 8 + cr() * (OY + 110), spr: i % 4, spd: 3 + cr() * 6 });

  /* ---- Scene: hills, structures, platforms ---- */
  ART.scene = makeCanvas(BW, BH);
  g = ART.scene.getContext('2d');
  g.save(); g.translate(OX, OY);
  const xL = -OX - 4, xR = BW - OX + 4;
  if (L.biome !== 2) {
    for (let x = Math.floor(xL / 2) * 2; x < xR; x += 2) {
      const y = Math.round(236 + 22 * Math.sin(x * 0.012 + L.biome) + 10 * Math.sin(x * 0.033 + 1));
      g.fillStyle = B.far[0]; g.fillRect(x, y, 2, 330 - y);
      g.fillStyle = B.far[1]; g.fillRect(x, y, 2, 2);
    }
    const tr = rng(21 + L.biome);
    for (let x = xL + 20; x < xR; x += 70 + Math.floor(tr() * 50)) {
      const base = Math.round(236 + 22 * Math.sin(x * 0.012 + L.biome) + 10 * Math.sin(x * 0.033 + 1)) + 4;
      const th = 14 + Math.floor(tr() * 10);
      if (L.biome === 3) { // distant farmhouse silhouettes / haystacks
        pxEllipse(g, x, base, 8, 6, '#b07a25'); pxEllipse(g, x, base - 2, 6, 4, '#c99236');
        continue;
      }
      g.fillStyle = '#9b8c6c'; g.fillRect(x - 1, base - th, 3, th);
      pxCircle(g, x, base - th - 4, 8 + Math.floor(tr() * 3), L.biome === 1 ? '#9fd88a' : '#86c974');
      pxCircle(g, x - 2, base - th - 6, 5, L.biome === 1 ? '#b5e6a0' : '#9bd786');
      if (L.biome === 1) { g.fillStyle = '#ff9ccf'; g.fillRect(x + 2, base - th - 8, 2, 2); g.fillStyle = '#fff'; g.fillRect(x - 4, base - th - 3, 2, 2); }
    }
    for (let x = Math.floor(xL / 2) * 2; x < xR; x += 2) {
      const y = Math.round(270 + 16 * Math.sin(x * 0.02 + 2 + L.biome) + 7 * Math.sin(x * 0.051));
      g.fillStyle = B.near[0]; g.fillRect(x, y, 2, 330 - y);
      g.fillStyle = B.near[1]; g.fillRect(x, y, 2, 2);
    }
    if (L.biome === 1) { // flower speckles on meadow hills
      const fr = rng(L.seed ^ 5);
      const cols = ['#ff7ab8', '#ffe45c', '#ffffff', '#c58cff', '#ff9a52'];
      for (let i = 0; i < 260; i++) { const x = xL + fr() * (xR - xL), y = 250 + fr() * 70; g.fillStyle = pick(fr, cols); g.fillRect(Math.floor(x), Math.floor(y), 1 + (fr() < 0.3 ? 1 : 0), 1); }
    }
    if (L.biome === 3) { // wheat field texture on the near hills
      const wr = rng(L.seed ^ 9);
      for (let i = 0; i < 400; i++) { const x = xL + wr() * (xR - xL), y = 262 + wr() * 58; g.fillStyle = wr() < 0.5 ? '#e8bb52' : '#a87420'; g.fillRect(Math.floor(x), Math.floor(y), 1, 2 + Math.floor(wr() * 3)); }
    }
    const br = rng(33 + L.biome);
    for (let x = xL; x < xR; x += 14 + Math.floor(br() * 26)) {
      const rr = 5 + Math.floor(br() * 6);
      pxCircle(g, x, 320, rr, B.bush[0]); pxCircle(g, x - 1, 318, rr - 2, B.bush[1]);
    }
  }
  if (L.barn) drawBarnBackdrop(g, L);
  // platforms: big frame pieces first, then props
  for (const p of L.plats) if (p.type === 'ground' || p.type === 'meadow' || p.type === 'dirt' || p.type === 'sand') drawPlatform(g, p, L);
  for (const p of L.plats) if (!(p.type === 'ground' || p.type === 'meadow' || p.type === 'dirt' || p.type === 'sand')) drawPlatform(g, p, L);
  for (const d of L.decor) if (d.k === 'shell') { g.fillStyle = d.c; g.fillRect(Math.round(d.x), 298, 3, 2); g.fillRect(Math.round(d.x) + 1, 297, 1, 1); }
  g.restore();
}

function drawBarnBackdrop(g, L) {
  const { x0, x1, y0 } = L.barn;
  // roof triangle above the beam
  for (let y = y0 - 52; y < y0; y++) {
    const k = (y - (y0 - 52)) / 52, half = (x1 - x0) / 2 * (0.25 + 0.75 * k) + 14;
    const cx = (x0 + x1) / 2;
    g.fillStyle = (y % 6 < 3) ? '#8e2a22' : '#7a231c';
    g.fillRect(Math.round(cx - half), y, Math.round(half * 2), 1);
  }
  g.fillStyle = '#5a1712'; g.fillRect(x0 - 14, y0 - 2, x1 - x0 + 28, 3);
  // back wall (dim interior red planks with white trim)
  g.fillStyle = '#5c1d18'; g.fillRect(x0, y0, x1 - x0, GROUND_Y - y0);
  for (let x = x0; x < x1; x += 12) { g.fillStyle = '#4a1612'; g.fillRect(x, y0, 1, GROUND_Y - y0); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, y0, x1 - x0, 24);
  // X-braced loft door in the back wall
  const dx = (x0 + x1) / 2 - 24, dy = 110;
  g.fillStyle = '#3a100c'; g.fillRect(dx, dy, 48, 44);
  g.strokeStyle = '#d9c9b0'; g.lineWidth = 2;
  g.strokeRect(dx + 1, dy + 1, 46, 42);
  g.beginPath(); g.moveTo(dx + 2, dy + 2); g.lineTo(dx + 46, dy + 42); g.moveTo(dx + 46, dy + 2); g.lineTo(dx + 2, dy + 42); g.stroke();
  // light shafts through the doorway
  g.globalAlpha = 0.12; g.fillStyle = '#ffd78a';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x0 + 12, 252 + i * 20); g.lineTo(x0 + 12, 270 + i * 20); g.lineTo(x0 + 120 + i * 40, GROUND_Y); g.lineTo(x0 + 80 + i * 40, GROUND_Y); g.closePath(); g.fill(); }
  g.globalAlpha = 1;
  // hanging lantern
  g.fillStyle = '#2a1a0a'; g.fillRect(x0 + 200, y0 + 10, 1, 20);
  pxCircle(g, x0 + 200, y0 + 34, 4, '#ffcf5a'); g.globalAlpha = 0.18; pxCircle(g, x0 + 200, y0 + 34, 14, '#ffd78a'); g.globalAlpha = 1;
}

function drawPlatform(g, p, L) {
  const r = rng(Math.floor(p.x * 13 + p.y * 7 + p.w * 3 + p.h));
  const { x, y, w, h } = p;
  switch (p.type) {
    case 'ground': case 'meadow': case 'dirt': {
      const x0 = -OX - 4, x1 = BW - OX + 4, y0 = p.y, y1 = BH - OY + 4;
      const dirt = p.type === 'dirt' ? ['#7a5230', '#6d482a', '#5f3e23', '#9a6b40'] : ['#9c5f34', '#8f5530', '#86502b', '#b8743f'];
      g.fillStyle = dirt[0]; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let yy = y0 + 18; yy < y1; yy += 16) { g.fillStyle = dirt[1]; g.fillRect(x0, yy, x1 - x0, 2); }
      const n = Math.floor((x1 - x0) * (y1 - y0) / 45);
      for (let i = 0; i < n; i++) { const xx = x0 + Math.floor(r() * (x1 - x0)), yy = y0 + 9 + Math.floor(r() * (y1 - y0 - 9)); g.fillStyle = r() < 0.5 ? dirt[2] : dirt[3]; g.fillRect(xx, yy, 2, r() < 0.3 ? 2 : 1); }
      for (let i = 0; i < n / 25; i++) { const xx = x0 + Math.floor(r() * (x1 - x0)), yy = y0 + 12 + Math.floor(r() * (y1 - y0 - 12)); g.fillStyle = '#5a3a1f'; g.fillRect(xx, yy + 1, 4, 2); g.fillStyle = '#c9a07a'; g.fillRect(xx, yy, 3, 2); }
      if (p.type === 'dirt') {
        const bx0 = L.barn ? L.barn.x0 : 9999, bx1 = L.barn ? L.barn.x1 : 9999;
        // exterior: dry golden grass; interior: floor boards with straw
        g.fillStyle = '#b8862a'; g.fillRect(x0, y0, bx0 - x0, 5); g.fillStyle = '#d6a540'; g.fillRect(x0, y0, bx0 - x0, 2);
        g.fillStyle = '#b8862a'; g.fillRect(bx1, y0, x1 - bx1, 5); g.fillStyle = '#d6a540'; g.fillRect(bx1, y0, x1 - bx1, 2);
        g.fillStyle = '#7a4a28'; g.fillRect(bx0, y0, bx1 - bx0, 7); g.fillStyle = '#9a6238'; g.fillRect(bx0, y0, bx1 - bx0, 2);
        for (let xx = bx0; xx < bx1; xx += 18) { g.fillStyle = '#5e3519'; g.fillRect(xx, y0, 1, 7); }
        for (let i = 0; i < 70; i++) { const xx = bx0 + r() * (bx1 - bx0); g.fillStyle = r() < 0.5 ? '#e8c45a' : '#c99a36'; g.fillRect(Math.floor(xx), y0 - 1 + Math.floor(r() * 3), 3 + Math.floor(r() * 3), 1); }
        for (let xx = x0; xx < bx0; xx += 3) { const hh = Math.floor(r() * 4); if (hh) { g.fillStyle = r() < 0.5 ? '#d6a540' : '#f0cf6a'; g.fillRect(xx, y0 - hh, 1, hh); } }
        break;
      }
      g.fillStyle = '#3fae3a'; g.fillRect(x0, y0, x1 - x0, 7);
      g.fillStyle = '#5fd24b'; g.fillRect(x0, y0, x1 - x0, 4);
      g.fillStyle = '#8ef06f'; g.fillRect(x0, y0, x1 - x0, 1);
      for (let xx = x0; xx < x1; xx += 2) { g.fillStyle = '#3fae3a'; g.fillRect(xx, y0 + 7, 2, Math.floor(r() * 4)); }
      for (let xx = x0; xx < x1; xx += 3) { const hh = Math.floor(r() * 4); if (hh) { g.fillStyle = r() < 0.5 ? '#5fd24b' : '#8ef06f'; g.fillRect(xx, y0 - hh, 1, hh); } }
      const fcols = p.type === 'meadow' ? ['#ff5a9a', '#ffd23f', '#ffffff', '#b77cff', '#ff8c42', '#ff7ab8'] : ['#ff5a7a', '#ffd23f', '#ffffff', '#b77cff', '#ff8c42'];
      const step = p.type === 'meadow' ? 7 : 16;
      for (let xx = x0 + 6; xx < x1; xx += step + Math.floor(r() * step * 1.5)) {
        const c = pick(r, fcols), hh = p.type === 'meadow' ? 4 + Math.floor(r() * 6) : 4;
        g.fillStyle = '#2f8f2f'; g.fillRect(xx, y0 - hh, 1, hh);
        g.fillStyle = c; g.fillRect(xx - 1, y0 - hh - 2, 3, 1); g.fillRect(xx, y0 - hh - 3, 1, 3);
        g.fillStyle = '#ffe98a'; g.fillRect(xx, y0 - hh - 2, 1, 1);
      }
      break;
    }
    case 'sand': {
      // plateau with cliff sides dropping into the sea
      g.fillStyle = '#c99a5a'; g.fillRect(x, y, w, h);
      for (let yy = y + 12; yy < y + h; yy += 10) { g.fillStyle = (yy / 10) % 2 ? '#b8874a' : '#d6a868'; g.fillRect(x, yy, w, 3); }
      for (let i = 0; i < w * h / 50; i++) { g.fillStyle = r() < 0.5 ? '#a8783e' : '#e2b87a'; g.fillRect(x + Math.floor(r() * w), y + 8 + Math.floor(r() * (h - 8)), 2, 1); }
      g.fillStyle = '#9a6a34'; g.fillRect(x, y, 3, h); g.fillRect(x + w - 3, y, 3, h);
      g.fillStyle = '#f3dca0'; g.fillRect(x, y, w, 6); g.fillStyle = '#fff0c2'; g.fillRect(x, y, w, 2);
      for (let xx = x + 2; xx < x + w - 2; xx += 5) if (r() < 0.35) { g.fillStyle = '#5fbf52'; g.fillRect(xx, y - 2, 1, 2); g.fillRect(xx + 1, y - 3, 1, 3); }
      break;
    }
    case 'trunk': case 'trunkR': {
      const yTop = -OY - 4, yBot = p.y + p.h;
      g.fillStyle = '#7a4a28'; g.fillRect(x, yTop, w, yBot - yTop);
      g.fillStyle = '#95603a'; g.fillRect(x + 4, yTop, 5, yBot - yTop);
      g.fillStyle = '#5e3519'; g.fillRect(x + w - 4, yTop, 4, yBot - yTop);
      for (let i = 0; i < 70; i++) { const xx = x + 3 + Math.floor(r() * (w - 6)), yy = yTop + Math.floor(r() * (320 - yTop)); g.fillStyle = r() < 0.7 ? '#5e3519' : '#a06a40'; g.fillRect(xx, yy, 1, 6 + Math.floor(r() * 18)); }
      pxEllipse(g, x + w / 2 + 1, 210, 4, 6, '#4a2a12'); pxEllipse(g, x + w / 2 + 1, 211, 2, 4, '#2a1508');
      const leaf = [['#2f8f3a', 0], ['#3fae3a', -2], ['#5fd24b', -4]];
      const flip = p.type === 'trunkR';
      const cx = flip ? x + w : x;
      const blobs = flip ? [[20, -12, 38], [-22, -18, 30], [-52, -4, 20], [36, 24, 24], [-8, 20, 20], [-70, -14, 16]]
                         : [[-20, -12, 38], [22, -18, 30], [52, -4, 20], [-36, 24, 24], [8, 20, 20], [70, -14, 16]];
      leaf.forEach(([c, off]) => blobs.forEach(([bx, by, br2]) => pxCircle(g, cx + bx + off, by + off, br2 + (off ? -3 : 0), c)));
      if (L.biome === 1) { const fr = rng(p.x + 3); for (let i = 0; i < 18; i++) { const b = pick(fr, blobs); g.fillStyle = pick(fr, ['#ffb3d9', '#ffffff', '#ff7ab8']); g.fillRect(Math.round(cx + b[0] + (fr() - 0.5) * b[2]), Math.round(b[1] + (fr() - 0.5) * b[2]), 2, 2); } }
      break;
    }
    case 'cliff': case 'silo': {
      const x1 = BW - OX + 4, yTop = -OY - 4, yBot = 320;
      if (p.type === 'silo') {
        const xa = -OX - 4;
        g.fillStyle = '#8f9aa6'; g.fillRect(xa, yTop, x + w - xa, yBot - yTop);
        for (let yy = yTop; yy < yBot; yy += 8) { g.fillStyle = '#7a8591'; g.fillRect(xa, yy, x + w - xa, 2); }
        g.fillStyle = '#b4bfca'; g.fillRect(x + w - 10, yTop, 4, yBot - yTop);
        g.fillStyle = '#5f6973'; g.fillRect(x + w - 3, yTop, 3, yBot - yTop);
        for (let yy = 20; yy < 300; yy += 40) { g.fillStyle = '#c98a3a'; g.fillRect(x + w - 6, yy, 3, 3); }
        break;
      }
      g.fillStyle = '#8a7f74'; g.fillRect(x, yTop, x1 - x, yBot - yTop);
      let alt = 0;
      for (let yy = yBot - 14; yy > yTop; yy -= 12 + Math.floor(r() * 8)) {
        g.fillStyle = alt++ % 2 ? '#7d736a' : '#968a7e'; g.fillRect(x, yy, x1 - x, 5);
        g.fillStyle = '#665d55'; g.fillRect(x, yy + 5, x1 - x, 1);
      }
      for (let i = 0; i < 40; i++) { g.fillStyle = '#5a524b'; g.fillRect(x + 4 + Math.floor(r() * (x1 - x - 4)), yTop + Math.floor(r() * (yBot - yTop)), 1, 4 + Math.floor(r() * 8)); }
      g.fillStyle = '#b0a497'; g.fillRect(x, yTop, 2, yBot - yTop);
      for (let i = 0; i < 10; i++) { const yy = 20 + Math.floor(r() * 280); g.fillStyle = '#5fae45'; g.fillRect(x, yy, 3, 5); g.fillStyle = '#7fd05f'; g.fillRect(x, yy, 2, 3); }
      break;
    }
    case 'barnwall': {
      const yTop = p.inner ? y : -OY - 4, yBot = p.inner ? y + h : 320, x1 = p.inner ? x + w : BW - OX + 4;
      g.fillStyle = '#a3322a'; g.fillRect(x, yTop, x1 - x, yBot - yTop);
      for (let xx = x; xx < x1; xx += 8) { g.fillStyle = '#86271f'; g.fillRect(xx, yTop, 1, yBot - yTop); }
      g.fillStyle = '#e8dcc8'; g.fillRect(x, yTop, 2, yBot - yTop);
      if (p.inner) { g.fillRect(x + w - 2, yTop, 2, yBot - yTop); g.fillRect(x, yBot - 2, w, 2); }
      else { for (let yy = 100; yy < 320; yy += 70) { g.fillRect(x + 2, yy, x1 - x - 2, 2); } }
      break;
    }
    case 'branch': case 'log': {
      g.fillStyle = '#8a5530'; g.fillRect(x, y, w, h);
      g.fillStyle = '#b07342'; g.fillRect(x, y, w, 2);
      g.fillStyle = '#5e3519'; g.fillRect(x, y + h - 2, w, 2);
      for (let i = 0; i < w / 9; i++) { g.fillStyle = '#6b3f1f'; g.fillRect(x + 4 + Math.floor(r() * (w - 8)), y + 3 + Math.floor(r() * Math.max(1, h - 6)), 3 + Math.floor(r() * 4), 1); }
      if (p.type === 'log') {
        pxEllipse(g, x, y + h / 2 - 0.5, 3, h / 2, '#c99a62'); pxEllipse(g, x, y + h / 2 - 0.5, 1, h / 2 - 3, '#8a5530');
        pxEllipse(g, x + w, y + h / 2 - 0.5, 3, h / 2, '#c99a62'); pxEllipse(g, x + w, y + h / 2 - 0.5, 1, h / 2 - 3, '#8a5530');
        for (let xx = x + 4; xx < x + w - 4; xx += 6) if (r() < 0.4) { g.fillStyle = '#5fbf52'; g.fillRect(xx, y - 1, 3, 2); }
        break;
      }
      const tip = p.flip ? x : x + w;
      pxEllipse(g, tip, y + h / 2 - 0.5, 3, 4, '#8a5530');
      g.fillStyle = '#6b3f1f';
      const tw = p.flip ? x + 20 : x + w - 30;
      for (let i = 0; i < 12; i++) g.fillRect(tw + (p.flip ? -i : i), y - i, 2, 2);
      const lx = p.flip ? x - 4 : x + w + 6;
      const leaves = [[tw + (p.flip ? -14 : 14), y - 16, 8], [lx, y - 6, 9], [lx + (p.flip ? 10 : -10), y - 14, 7], [x + w * 0.45, y - 5, 5]];
      leaves.forEach(([a, b, c]) => pxCircle(g, a, b, c, '#2f8f3a'));
      leaves.forEach(([a, b, c]) => pxCircle(g, a - 1, b - 1, c - 2, '#4fbf43'));
      leaves.forEach(([a, b, c]) => pxCircle(g, a - 2, b - 3, Math.max(1, c - 5), '#8ef06f'));
      break;
    }
    case 'rock': case 'boulder': case 'shelf': case 'beachrock': {
      const warm = p.type === 'boulder', beach = p.type === 'beachrock';
      const base = beach ? '#8c8478' : warm ? '#9a9489' : '#848696', light = beach ? '#aca394' : warm ? '#bdb7ab' : '#a7a9b8', hi = beach ? '#cfc6b4' : warm ? '#dcd6ca' : '#c9cbd8', dark = beach ? '#6a6358' : warm ? '#716b62' : '#62647a';
      const rad = p.type === 'shelf' ? 3 : 6;
      roundRectPx(g, x, y, w, h, rad, dark);
      roundRectPx(g, x, y, w, h - 2, rad, base);
      roundRectPx(g, x + 2, y + 1, w - 6, Math.max(3, h - 7), Math.max(1, rad - 2), light);
      g.fillStyle = hi; g.fillRect(x + rad, y + 2, Math.max(2, Math.floor(w / 4)), 2);
      for (let i = 0; i < w * h / 60; i++) { g.fillStyle = dark; g.fillRect(x + 3 + Math.floor(r() * (w - 6)), y + 4 + Math.floor(r() * Math.max(1, h - 6)), 2, 1); }
      if (h > 20) { g.fillStyle = dark; let cx = x + Math.floor(w * 0.6); for (let yy = y + 6; yy < y + h * 0.7; yy++) { g.fillRect(cx, yy, 1, 1); if (r() < 0.4) cx += r() < 0.5 ? -1 : 1; } }
      if (beach) { for (let i = 0; i < 4; i++) { g.fillStyle = '#5fae8a'; g.fillRect(x + 3 + Math.floor(r() * (w - 6)), y + h - 4, 3, 2); } break; }
      const moss = L.biome === 3 ? ['#b8862a', '#d6a540'] : ['#4fae45', '#7fd05f'];
      g.fillStyle = moss[0]; g.fillRect(x + rad - 1, y, w - rad * 2 + 2, 2);
      g.fillStyle = moss[1]; g.fillRect(x + rad, y, w - rad * 2, 1);
      for (let xx = x + rad; xx < x + w - rad; xx += 3) if (r() < 0.6) { g.fillStyle = moss[1]; g.fillRect(xx, y - 1 - Math.floor(r() * 2), 1, 2); }
      if (p.type === 'rock') for (let xx = x + 4; xx < x + w - 4; xx += 5) { g.fillStyle = moss[0]; g.fillRect(xx, y + h, 1, 1 + Math.floor(r() * 3)); }
      break;
    }
    case 'ledge': {
      roundRectPx(g, x, y, w, h, 3, '#7a4a28');
      roundRectPx(g, x, y, w, h - 2, 3, '#a9683a');
      for (let i = 0; i < w / 5; i++) { g.fillStyle = r() < 0.5 ? '#8f5530' : '#c07e48'; g.fillRect(x + 2 + Math.floor(r() * (w - 4)), y + 5 + Math.floor(r() * Math.max(1, h - 7)), 2, 1); }
      g.fillStyle = '#3fae3a'; g.fillRect(x, y, w, 5); g.fillStyle = '#5fd24b'; g.fillRect(x, y, w, 3); g.fillStyle = '#8ef06f'; g.fillRect(x, y, w, 1);
      for (let xx = x; xx < x + w; xx += 2) { g.fillStyle = '#3fae3a'; g.fillRect(xx, y + 5, 2, Math.floor(r() * 3)); }
      for (let xx = x + 1; xx < x + w; xx += 3) { const hh = Math.floor(r() * 4); if (hh) { g.fillStyle = r() < 0.5 ? '#5fd24b' : '#8ef06f'; g.fillRect(xx, y - hh, 1, hh); } }
      for (let xx = x + 5; xx < x + w - 4; xx += 7 + Math.floor(r() * 6)) { g.fillStyle = r() < 0.5 ? '#6b3f1f' : '#3f9a3a'; g.fillRect(xx, y + h, 1, 2 + Math.floor(r() * 6)); }
      break;
    }
    case 'leaf': {
      pxEllipse(g, x + w / 2, y + h / 2, w / 2, h / 2 + 1, '#2f8f3a');
      pxEllipse(g, x + w / 2, y + h / 2 - 1, w / 2 - 2, h / 2 - 1, '#4fbf43');
      g.fillStyle = '#8ef06f'; g.fillRect(x + 6, y + h / 2 - 1, w - 12, 1);
      for (let xx = x + 12; xx < x + w - 10; xx += 9) { g.fillStyle = '#3fae3a'; g.fillRect(xx, y + 2, 1, 2); g.fillRect(xx + 1, y + h - 4, 1, 2); }
      g.fillStyle = '#2f7f2b'; g.fillRect(x + w - 2, y + h / 2, 6, 1);
      if (r() < 0.6) { g.fillStyle = '#9ad0ff'; g.fillRect(x + w * 0.3, y + 2, 2, 2); g.fillStyle = '#ffffff'; g.fillRect(x + w * 0.3, y + 2, 1, 1); }
      break;
    }
    case 'mushroom': {
      // decorative stem down to the ground (not solid)
      g.fillStyle = '#e9dcc4'; g.fillRect(x + w / 2 - 4, y + h, 8, GROUND_Y - y - h);
      g.fillStyle = '#c9b89c'; g.fillRect(x + w / 2 + 2, y + h, 2, GROUND_Y - y - h);
      roundRectPx(g, x, y, w, h + 2, 6, '#a3192a');
      roundRectPx(g, x, y, w, h, 6, '#e8343f');
      g.fillStyle = '#ff7a7a'; g.fillRect(x + 6, y + 2, w / 3, 2);
      for (let i = 0; i < w / 10; i++) pxCircle(g, x + 6 + r() * (w - 12), y + 3 + r() * (h - 6), 1 + Math.floor(r() * 2), '#fff4e0');
      break;
    }
    case 'palm': {
      for (let yy = y; yy < y + h; yy += 6) {
        const off = Math.round(Math.sin(yy * 0.05) * 1);
        g.fillStyle = (yy / 6) % 2 ? '#a0703a' : '#b8844a'; g.fillRect(x + off, yy, w, 6);
        g.fillStyle = '#7a5228'; g.fillRect(x + off, yy + 5, w, 1);
      }
      pxCircle(g, x + 3, y + 4, 3, '#6b4a1a'); pxCircle(g, x + 9, y + 6, 3, '#6b4a1a');
      break;
    }
    case 'frond': {
      const cx = x + w / 2;
      const arms = [[-1, 0.15], [1, 0.15], [-1, 0.6], [1, 0.6]];
      for (const [sgn, droop] of arms) {
        for (let i = 0; i < w / 2 + 6; i++) {
          const fx = cx + sgn * i, fy = y + 3 + Math.round(i * i * droop * 0.02);
          g.fillStyle = '#2f8f3a'; g.fillRect(Math.round(fx), fy, 1, 4);
          g.fillStyle = '#5fd24b'; g.fillRect(Math.round(fx), fy, 1, 2);
          if (i % 3 === 0) { g.fillStyle = '#3fae3a'; g.fillRect(Math.round(fx), fy + 4, 1, 3); }
        }
      }
      g.fillStyle = '#4fbf43'; g.fillRect(x + 6, y, w - 12, 4);
      g.fillStyle = '#8ef06f'; g.fillRect(x + 8, y, w - 16, 1);
      break;
    }
    case 'drift': case 'plank': case 'loft': case 'beam': case 'fence': {
      const cols = p.type === 'drift' ? ['#b8a68a', '#d6c6a8', '#8f7e62', '#a39274'] : p.type === 'beam' ? ['#6b3f1f', '#8a5530', '#4a2a12', '#5e3519'] : ['#a06a3a', '#c08a52', '#6b4220', '#8a5a30'];
      if (p.type === 'fence') { for (const px of [x + 4, x + w - 10]) { g.fillStyle = '#7a5230'; g.fillRect(px, y, 6, GROUND_Y - y); g.fillStyle = '#9a6b40'; g.fillRect(px, y, 2, GROUND_Y - y); } g.fillStyle = cols[0]; g.fillRect(x, y + 22, w, 6); }
      g.fillStyle = cols[0]; g.fillRect(x, y, w, h);
      g.fillStyle = cols[1]; g.fillRect(x, y, w, 2);
      g.fillStyle = cols[2]; g.fillRect(x, y + h - 2, w, 2);
      for (let i = 0; i < w / 7; i++) { g.fillStyle = cols[3]; g.fillRect(x + 2 + Math.floor(r() * (w - 8)), y + 3 + Math.floor(r() * Math.max(1, h - 5)), 4 + Math.floor(r() * 6), 1); }
      if (p.type !== 'drift') for (let xx = x + 3; xx < x + w - 2; xx += 22) { g.fillStyle = '#3a2a1a'; g.fillRect(xx, y + 3, 1, 1); g.fillRect(xx, y + h - 4, 1, 1); }
      else { g.fillStyle = '#5fae8a'; for (let xx = x + 4; xx < x + w - 4; xx += 9) if (r() < 0.5) g.fillRect(xx, y + h, 2, 2); }
      if (p.type === 'loft') { g.fillStyle = '#6b4220'; for (let i = 0; i < 14; i++) g.fillRect(x + 6 + i, y + h + i, 2, 2); }
      if (p.type === 'plank' && !L.barn) break;
      if (p.type === 'plank' && x < 330) { g.fillStyle = '#3a2a1a'; g.fillRect(x + 6, y - 80, 1, 80); g.fillRect(x + w - 7, y - 80, 1, 80); } // hanging ropes
      break;
    }
    case 'crate': {
      g.fillStyle = '#6b4220'; g.fillRect(x, y, w, h);
      g.fillStyle = '#b07a42'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.strokeStyle = '#6b4220'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + w - 3, y + h - 3); g.moveTo(x + w - 3, y + 3); g.lineTo(x + 3, y + h - 3); g.stroke();
      g.fillStyle = '#d09a5a'; g.fillRect(x + 2, y + 2, w - 4, 1);
      break;
    }
    case 'hay': {
      roundRectPx(g, x, y, w, h, 4, '#b8862a');
      roundRectPx(g, x, y, w, h - 2, 4, '#e0b04a');
      for (let i = 0; i < w * h / 6; i++) { g.fillStyle = r() < 0.5 ? '#f3cf6a' : '#c08e2e'; g.fillRect(x + 1 + Math.floor(r() * (w - 2)), y + 1 + Math.floor(r() * (h - 3)), 3, 1); }
      g.fillStyle = '#8a5a1a'; g.fillRect(x + Math.floor(w * 0.3), y, 2, h); g.fillRect(x + Math.floor(w * 0.7), y, 2, h);
      break;
    }
  }
}

/* ---------- Per-frame animated environment pieces ---------- */
function drawWater(L, t) {
  if (!L.water) return;
  const wy = L.water.y, x0 = -OX - 4, x1 = BW - OX + 4, y1 = BH - OY + 4;
  ctx.fillStyle = '#1f6fb8'; ctx.fillRect(x0, wy + 3, x1 - x0, y1 - wy);
  ctx.fillStyle = '#185a99';
  for (let y = wy + 12; y < y1; y += 10) ctx.fillRect(x0, y, x1 - x0, 3);
  for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
    const h = Math.round(Math.sin(x * 0.08 + t * 2.4) * 1.5 + Math.sin(x * 0.031 - t * 1.3) * 1.5);
    ctx.fillStyle = '#3b97d9'; ctx.fillRect(x, wy + h, 2, 6);
    ctx.fillStyle = '#9ad8ff'; ctx.fillRect(x, wy + h, 2, 1);
  }
  // foam where the plateau meets the sea
  for (const p of L.plats) if (p.type === 'sand') {
    for (const ex of [p.x - 6, p.x + p.w]) { for (let i = 0; i < 6; i++) { const fx = ex + Math.round(Math.sin(t * 3 + i) * 2) + i, fy = wy - 1 + (i % 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, fy, 2, 1); } }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 12; i++) { const sx = ((i * 97 + t * 14) % (x1 - x0)) + x0, sy = wy + 8 + (i * 37) % Math.max(1, y1 - wy - 10); if (Math.sin(t * 4 + i * 2) > 0.6) ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1); }
}
function drawWheat(L, t, front) {
  for (const d of L.decor) {
    if (d.k !== 'wheat') continue;
    if ((d.x % 3 === 0) !== front) continue;
    const sway = Math.sin(t * 1.6 + d.ph + d.x * 0.03) * 2.5;
    const bx = d.x, by = GROUND_Y + (front ? 2 : 0);
    ctx.fillStyle = front ? '#b8862a' : '#a87420';
    for (let i = 0; i < d.h; i++) ctx.fillRect(Math.round(bx + sway * i / d.h), by - i, 1, 1);
    const hx = Math.round(bx + sway), hy = by - d.h;
    ctx.fillStyle = front ? '#f0cf6a' : '#d6a540';
    for (let i = 0; i < 6; i++) { ctx.fillRect(hx - 1, hy - i * 2, 1, 2); ctx.fillRect(hx + 1, hy - i * 2 - 1, 1, 2); }
    ctx.fillRect(hx, hy - 13, 1, 3);
  }
}
