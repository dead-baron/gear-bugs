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
  { key: 'factory', name: 'GEAR FACTORY', enemy: 'dll', npc: 'DADDY LONG LEGS', boss: true,
    sky: ['#1c1a28', '#221f30', '#282438', '#2e2940', '#332d46', '#38314a', '#3c344c', '#40374e'],
    far: ['#2a2638', '#332e44'], near: ['#3a3f4c', '#5c6270'], bush: ['#ffd23f', '#1a1a1a'], sun: '#9ad0ff' },
  { key: 'desert', name: 'DESERT ANTHILL', enemy: 'queen', npc: 'QUEEN ANT',
    sky: ['#3f8fd6', '#55a0dc', '#6eb1e0', '#8bc0df', '#a9cbd8', '#c8d2c8', '#e2d6b2', '#f2d9a0'],
    far: ['#d9a06a', '#e8b27a'], near: ['#c98a52', '#dba062'], bush: ['#9a8a4a', '#b8a860'], sun: '#fff1b0' },
  { key: 'pond', name: 'LILY SWAMP', enemy: 'frog', npc: 'BULLFROG',
    sky: ['#0c1a14', '#10221a', '#142a20', '#183226', '#1c3a2c', '#204232', '#264a38', '#2c523e'],
    far: ['#16281e', '#1c3226'], near: ['#2a4a32', '#3a6040'], bush: ['#2f6a34', '#4f8a44'], sun: '#e8f0b0' },
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
  } else if (biomeIdx === 3) {
    ground = mkPlat(-400, GROUND_Y, 1440, 240, 'dirt'); P.push(ground);
    P.push(mkPlat(-30, -400, 46, 720, 'silo'));
    P.push(mkPlat(624, -400, 120, 720, 'barnwall'));
    P.push(mkPlat(330, 72, 294, 10, 'beam'));
    P.push(mkPlat(330, 82, 12, 170, 'barnwall', { inner: true }));
    L.barn = { x0: 330, x1: 624, y0: 72 };
  } else if (biomeIdx === 4) {
    // factory: steel floor, riveted walls and a girder ceiling the spiders can hang from
    ground = mkPlat(-400, GROUND_Y, 1440, 240, 'floor'); P.push(ground);
    P.push(mkPlat(-30, -400, 46, 720, 'fwall'));
    P.push(mkPlat(624, -400, 120, 720, 'fwall'));
    P.push(mkPlat(-400, -400, 1440, 416, 'ceiling'));
    L.movers = [];
  } else if (biomeIdx === 6) {
    // swamp: walled in by tall grass, roofed by a leafy canopy, water across the whole floor
    L.water = { y: 290 };
    P.push(mkPlat(-30, -400, 46, 720, 'reedwall'));
    P.push(mkPlat(624, -400, 120, 720, 'reedwall'));
    P.push(mkPlat(-400, -400, 1440, 418, 'canopy'));
    L.pond = { x0: 16, x1: 624 };
    L.movers = [];
    // mossy stumps rise out of the water: everyone starts on one
    const top = randInt(r, 262, 268), lw = randInt(r, 44, 52), rw = randInt(r, 44, 52), lx = randInt(r, 40, 70), rx = randInt(r, 570, 590) - rw;
    ground = mkPlat(lx, top, lw, 400, 'stump'); P.push(ground);
    P.push(mkPlat(rx, top, rw, 400, 'stump'));
    spawnXs = [lx + lw / 2 - 10, rx + rw / 2 + 10, lx + lw / 2 + 10, rx + rw / 2 - 10];
  } else {
    // desert: rising sand floor between two sandstone mesas
    ground = mkPlat(-400, GROUND_Y, 1440, 240, 'sand2', { dyn: true, rising: true }); P.push(ground);
    P.push(mkPlat(-30, -400, 46, 720, 'mesa'));
    P.push(mkPlat(624, -400, 120, 720, 'mesa'));
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
  } else if (biomeIdx === 3) {
    // exterior (wheat field side): fence rails and floating planks
    tryPlace(() => { const w = randInt(r, 60, 96); return mkPlat(xIn(w, 40, 300), randInt(r, 215, 262), w, 8, 'fence'); }, 1);
    tryPlace(() => { const w = randInt(r, 60, 100); return mkPlat(xIn(w, 40, 300), randInt(r, 70, 170), w, 10, 'plank'); }, 2);
    tryPlace(() => { const w = randInt(r, 36, 48); return mkPlat(xIn(w, 40, 300), randInt(r, 150, 240), w, randInt(r, 15, 18), 'rock'); }, 1);
    // interior: keep a clear column from the rafters to the floor for the widow's silk drop
    const beam = P.find(p => p.type === 'beam');
    const dropX = randInt(r, 384, 520);
    reserved.push({ x: dropX - 18, y: beam.y + beam.h, w: 36, h: gTop - beam.y - beam.h });
    // hay bales stay inside the barn (red wall behind them), crates go out in the wheat
    tryPlace(() => { const w = randInt(r, 40, 52), h = randInt(r, 24, 28); const c = mkPlat(xIn(w, 346, 618), gTop - h, w, h, 'hay'); c.touch = [ground]; return c; }, 1, 160);
    tryPlace(() => { const w = randInt(r, 80, 130); const c = mkPlat(624 - w, randInt(r, 130, 190), w, 10, 'loft'); c.touch = [P[2]]; return c; }, 1);
    tryPlace(() => { const w = randInt(r, 60, 100); return mkPlat(xIn(w, 362, 560), randInt(r, 120, 220), w, 10, 'plank'); }, 1);
    tryPlace(() => { const s = randInt(r, 26, 34); const c = mkPlat(xIn(s, 346, 618), gTop - s, s, s, 'crate'); c.touch = [ground]; return c; }, 1);
    tryPlace(() => { const s = randInt(r, 24, 32); const c = mkPlat(xIn(s, 60, 300), gTop - s, s, s, 'crate'); c.touch = [ground]; return c; }, 2);
    L.enemySpawn = { x: dropX, y: beam.y + beam.h + 10, plat: beam };   // the widow drops from the rafters
  } else if (biomeIdx === 4) {
    // moving lifts first: their whole travel path stays clear of everything else
    const placeMover = (make) => {
      for (let t = 0; t < 120; t++) {
        const c = make(); if (!c) continue;
        const m = c.move, sw = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0) + c.w, h: Math.abs(m.y1 - m.y0) + c.h };
        if (sw.x < 30 || sw.x + sw.w > 610 || sw.y < 44) continue;
        if (!fits(sw, P, null, M, reserved)) continue;
        reserved.push({ x: sw.x - 14, y: sw.y - 14, w: sw.w + 28, h: sw.h + 28 });
        P.push(c); L.movers.push(c); return c;
      }
      return null;
    };
    placeMover(() => {   // overhead trolley lift gliding side to side
      const w = randInt(r, 52, 64), x0 = randInt(r, 90, 300), y = randInt(r, 70, 120), span = randInt(r, 120, 170);
      return mkPlat(x0, y, w, 10, 'lift', { dyn: true, move: { x0, y0: y, x1: x0 + span, y1: y, period: 5 + r() * 1.5, phase: r() }, axis: 'x' });
    });
    placeMover(() => {   // elevator going up and down
      const w = randInt(r, 46, 56), x = pick(r, [randInt(r, 70, 170), randInt(r, 440, 540)]), y1 = randInt(r, 232, 262), y0 = y1 - randInt(r, 100, 130);
      return mkPlat(x, y0, w, 10, 'lift', { dyn: true, move: { x0: x, y0, x1: x, y1, period: 4.2 + r() * 1.2, phase: r() }, axis: 'y' });
    });
    // conveyor belts: one running along the floor, one up in the air on a stand
    const beltSpeed = () => (r() < 0.5 ? -1 : 1) * randInt(r, 42, 58);
    tryPlace(() => { const w = randInt(r, 120, 160); const c = mkPlat(xIn(w, 130, 520), gTop - 12, w, 12, 'conveyor', { dyn: true, belt: beltSpeed() }); c.touch = [ground]; return c; }, 1, 160);
    tryPlace(() => { const w = randInt(r, 96, 136); return mkPlat(xIn(w, 40, 600), randInt(r, 168, 222), w, 12, 'conveyor', { dyn: true, belt: beltSpeed(), stand: true }); }, 1, 160);
    // steel girders and a metal crate
    tryPlace(() => { const w = randInt(r, 70, 110); return mkPlat(xIn(w, 40, 600), randInt(r, 56, 140), w, 10, 'girder'); }, 2);
    tryPlace(() => { const w = randInt(r, 60, 96); return mkPlat(xIn(w, 40, 600), randInt(r, 150, 240), w, 10, 'girder'); }, 1);
    tryPlace(() => { const s = randInt(r, 24, 32); const c = mkPlat(xIn(s, 100, 560), gTop - s, s, s, 'mcrate'); c.touch = [ground]; return c; }, 1);
    L.enemySpawn = { x: 470, y: 150 };
  } else if (biomeIdx === 6) {
    // a middle stump, then lily pads drifting and bobbing on the surface between the stumps
    const sl = P[3], sr = P[4];
    tryPlace(() => { const w = randInt(r, 34, 42); return mkPlat(randInt(r, 250, 390 - w), randInt(r, 254, 270), w, 400, 'stump'); }, 1, 40);
    const x0 = sl.x + sl.w + 6, x1 = sr.x - 6, n = randInt(r, 4, 5), span = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const w = randInt(r, 30, 38), cx = x0 + (i + 0.5) * span + randInt(r, -6, 6), dx = (r() < 0.5 ? -1 : 1) * randInt(r, 5, 10);
      const px = clamp(cx - w / 2, x0 + 4, x1 - w - 4 - Math.max(0, dx)) , y0 = L.water.y - 4;
      if (P.some(q => q.type === 'stump' && px < q.x + q.w + 4 && px + w + Math.abs(dx) > q.x - 4)) continue;
      const pad = mkPlat(px, y0, w, 5, 'lilypad', { dyn: true, move: { x0: px, y0, x1: clamp(px + dx, x0 + 2, x1 - w - 2), y1: y0 + 1, period: 6 + r() * 4, phase: r() }, flower: r() < 0.4 });
      P.push(pad); L.movers.push(pad);
    }
    tryPlace(() => { const w = randInt(r, 64, 96); return mkPlat(xIn(w, 40, 600), randInt(r, 76, 150), w, 10, 'leaf'); }, 2);
    tryPlace(() => { const w = randInt(r, 56, 84); return mkPlat(xIn(w, 60, 580), randInt(r, 165, 222), w, 10, 'leaf'); }, 2);
    tryPlace(() => { const w = randInt(r, 70, 100); const c = mkPlat(16, randInt(r, 110, 200), w, 11, 'branch'); c.touch = [P[0]]; return c; }, 1);
    tryPlace(() => { const w = randInt(r, 70, 100); const c = mkPlat(624 - w, randInt(r, 110, 200), w, 11, 'branch', { flip: true }); c.touch = [P[1]]; return c; }, 1);
    L.enemySpawn = { x: sr.x + sr.w / 2, y: sr.y - 12 };
  } else {
    // the ant hill mound sits on the sand; its hole is where the colony pours out
    const mw = randInt(r, 92, 112), mx = randInt(r, 250, 390 - mw / 2);
    const mound = mkPlat(mx, gTop - 16, mw, 16, 'mound', { dyn: true, rising: true }); P.push(mound);
    L.mound = mound;
    reserved.push({ x: mx - 30, y: 150, w: mw + 60, h: gTop - 150 });   // keep the space above the nest clear
    tryPlace(() => { const w = randInt(r, 70, 120); return mkPlat(xIn(w, 30, 610), randInt(r, 52, 120), w, randInt(r, 12, 14), 'sandstone'); }, 3);
    tryPlace(() => { const w = randInt(r, 60, 100); return mkPlat(xIn(w, 30, 610), randInt(r, 132, 200), w, randInt(r, 12, 14), 'sandstone'); }, 2);
    tryPlace(() => { const w = randInt(r, 40, 64), h = randInt(r, 26, 44); const c = mkPlat(xIn(w, 60, 580), gTop - h, w, h, 'drock', { buriable: true }); c.touch = [ground]; return c; }, 2);
    tryPlace(() => { const w = randInt(r, 64, 90); const c = mkPlat(16, randInt(r, 140, 210), w, 12, 'sandstone'); c.touch = [P[1]]; return c; }, 1);
    tryPlace(() => { const w = randInt(r, 64, 90); const c = mkPlat(624 - w, randInt(r, 140, 210), w, 12, 'sandstone'); c.touch = [P[2]]; return c; }, 1);
    L.enemySpawn = { x: mx + mw / 2, y: gTop - 18 };
  }
  // Guarantee at least two high anchors for rope swinging
  let high = P.filter(p => !frame.includes(p) && p.y < 160 && !p.move).length;
  for (let t = 0; t < 60 && high < 2; t++) {
    const w = randInt(r, 60, 100);
    const type = ['ledge', 'leaf', 'drift', 'plank', 'girder', 'sandstone', 'leaf'][biomeIdx];
    const c = mkPlat(xIn(w, 100, 540), randInt(r, 60, 150), w, 10, type);
    if (fits(c, P, null, M, reserved)) { P.push(c); high++; }
  }
  // Spawn points (on the ground / plateau surface)
  L.spawns = spawnXs.map(x => ({ x, y: gTop - 9 }));
  if (L.movers) for (const m of L.movers) { m.bx = m.x; m.by = m.y; }
  // Decorative extras
  const dr = rng(seed ^ 0xABCDEF);
  if (biomeIdx === 3) for (let x = -20; x < 340; x += 4 + Math.floor(dr() * 5)) L.decor.push({ k: 'wheat', x, h: 18 + Math.floor(dr() * 22), ph: dr() * TAU });
  if (biomeIdx === 6) {
    const { x0, x1 } = L.pond, wy = L.water.y;
    // cattail clumps in the water, avoiding the stumps
    for (let i = 0; i < 4; i++) { const cx = 80 + dr() * 480; if (P.some(q => q.type === 'stump' && cx > q.x - 8 && cx < q.x + q.w + 8)) continue; for (let k = 0; k < 3; k++) L.decor.push({ k: 'cattail', x: cx + k * 4, base: wy + 2, h: 26 + Math.floor(dr() * 26), ph: dr() * TAU, front: k === 1 }); }
    // tall grass blades boxing the level in at both sides (front layer sways over everything)
    for (let x = -24; x < 40; x += 3 + Math.floor(dr() * 3)) L.decor.push({ k: 'blade', x, h: 60 + Math.floor(dr() * 170), ph: dr() * TAU, front: x > 6 && dr() < 0.6, lean: 0.25 + dr() * 0.35 });
    for (let x = 600; x < 664; x += 3 + Math.floor(dr() * 3)) L.decor.push({ k: 'blade', x, h: 60 + Math.floor(dr() * 170), ph: dr() * TAU, front: x < 634 && dr() < 0.6, lean: -(0.25 + dr() * 0.35) });
    // vines hanging from the canopy, some in front of the action
    for (let i = 0; i < 16; i++) L.decor.push({ k: 'vine', x: 24 + dr() * 592, len: 30 + Math.floor(dr() * 120), ph: dr() * TAU, front: dr() < 0.35 });
    // light shafts through gaps in the canopy
    for (let i = 0; i < 5; i++) L.decor.push({ k: 'ray', x: 60 + i * 120 + dr() * 60, w: 14 + dr() * 22, ph: dr() * TAU });
    for (let i = 0; i < 26; i++) L.decor.push({ k: 'weed', x: x0 + 8 + dr() * (x1 - x0 - 16), h: 10 + Math.floor(dr() * 22), ph: dr() * TAU });
    for (let i = 0; i < 40; i++) L.decor.push({ k: 'pebble', x: x0 + dr() * (x1 - x0), y: 344 + dr() * 14, c: pick(dr, ['#7a6a4a', '#9a8a6a', '#5a4a32']) });
  }
  if (biomeIdx === 5) { for (let i = 0; i < 260; i++) L.decor.push({ k: 'grain', x: -60 + dr() * 760, y: 150 + dr() * 260, c: dr() < 0.5 ? '#c99a5a' : '#f6e0a8' }); }
  if (biomeIdx === 4) for (let i = 0; i < 5; i++) L.decor.push({ k: 'lamp', x: 60 + i * 130 + Math.floor(dr() * 30), len: 8 + Math.floor(dr() * 14) });
  if (biomeIdx === 2) for (let i = 0; i < 6; i++) L.decor.push({ k: 'shell', x: 110 + dr() * 420, c: pick(dr, ['#ffb3c1', '#fff3d6', '#ffd29a']) });
  return L;
}

/* =====================================================================
   ART: cached sky + scene layers per level, rebuilt on resize
   ===================================================================== */
const ART = { sky: null, scene: null, clouds: [], cloudSprites: [], level: null, bw: 0, bh: 0 };

const SWAMP_TINT = { '#2f8f3a': '#1a4a22', '#4fbf43': '#2a6a2e', '#8ef06f': '#5a9a44', '#3fae3a': '#24602a', '#2f7f2b': '#1a4a1e',
  '#8a5530': '#4a3420', '#b07342': '#6a4a2a', '#5e3519': '#2a1a0e', '#6b3f1f': '#3a2614', '#9ad0ff': '#8ab8a0' };
/* A drawing context that swaps colours as they're set (used to darken shared platform art per biome) */
function tintCtx(g, map) {
  return new Proxy(g, {
    set(t, k, v) { t[k] = (k === 'fillStyle' || k === 'strokeStyle') && map[v] ? map[v] : v; return true; },
    get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
  });
}
function buildLevelArt(L) {
  ART.level = L; ART.bw = BW; ART.bh = BH;
  const B = L.B;
  /* ---- Sky ---- */
  ART.sky = makeCanvas(BW, BH);
  let g = ART.sky.getContext('2d');
  if (L.biome === 4) { drawFactoryBackdrop(g, L); ART.clouds = []; ART.cloudSprites = []; }
  else if (L.biome === 6) { drawSwampBackdrop(g, L); ART.clouds = []; ART.cloudSprites = []; }
  else {
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
  }

  /* ---- Scene: hills, structures, platforms ---- */
  ART.scene = makeCanvas(BW, BH);
  g = ART.scene.getContext('2d');
  g.save(); g.translate(OX, OY);
  const xL = -OX - 4, xR = BW - OX + 4;
  if (L.biome !== 2 && L.biome !== 4 && L.biome !== 6) {
    for (let x = Math.floor(xL / 2) * 2; x < xR; x += 2) {
      const y = Math.round(236 + 22 * Math.sin(x * 0.012 + L.biome) + 10 * Math.sin(x * 0.033 + 1));
      g.fillStyle = B.far[0]; g.fillRect(x, y, 2, 330 - y);
      g.fillStyle = B.far[1]; g.fillRect(x, y, 2, 2);
    }
    const tr = rng(21 + L.biome);
    for (let x = xL + 20; x < xR; x += 70 + Math.floor(tr() * 50)) {
      const base = Math.round(236 + 22 * Math.sin(x * 0.012 + L.biome) + 10 * Math.sin(x * 0.033 + 1)) + 4;
      const th = 14 + Math.floor(tr() * 10);
      if (L.biome === 5) { // distant saguaro cacti
        g.fillStyle = '#9a8a4a'; g.fillRect(x, base - th - 6, 3, th + 6); g.fillRect(x - 4, base - th + 2, 2, 6); g.fillRect(x - 4, base - th + 7, 4, 2); g.fillRect(x + 5, base - th - 1, 2, 6); g.fillRect(x + 3, base - th + 4, 3, 2);
        continue;
      }
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
  if (L.biome === 4) drawFactoryFixtures(g, L);
  if (L.pond) {   // the pond floor, seen through the water
    const { x0, x1 } = L.pond, yb = BH - OY + 4;
    g.fillStyle = '#3a4a3a'; g.fillRect(x0, L.water.y, x1 - x0, yb - L.water.y);
    for (let x = x0; x < x1; x += 2) { const fy = Math.round(342 + Math.sin(x * 0.04) * 3 + Math.sin(x * 0.11) * 1.5); g.fillStyle = '#4a3a22'; g.fillRect(x, fy, 2, yb - fy); g.fillStyle = '#6a5a3a'; g.fillRect(x, fy, 2, 1); }
    for (const d of L.decor) if (d.k === 'pebble') { g.fillStyle = d.c; g.fillRect(Math.round(d.x), Math.round(d.y), 3, 2); }
  }
  const big = p => p.type === 'ground' || p.type === 'meadow' || p.type === 'dirt' || p.type === 'sand' || p.type === 'floor';
  for (const p of L.plats) if (big(p) && !p.dyn) drawPlatform(g, p, L);
  const swampG = L.biome === 6 ? tintCtx(g, SWAMP_TINT) : g;   // leaves + branches in the swamp use a darker palette
  for (const p of L.plats) if (!big(p) && !p.dyn) drawPlatform(p.type === 'leaf' || p.type === 'branch' ? swampG : g, p, L);
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
    case 'floor': {
      const x0 = -OX - 4, x1 = BW - OX + 4, y0 = p.y, y1 = BH - OY + 4;
      g.fillStyle = '#3a3f4c'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let yy = y0 + 10; yy < y1; yy += 6) for (let xx = x0 + ((yy / 6) % 2) * 4; xx < x1; xx += 8) { g.fillStyle = '#4a505e'; g.fillRect(xx, yy, 3, 1); g.fillRect(xx + 1, yy + 1, 1, 1); }
      g.fillStyle = '#5c6270'; g.fillRect(x0, y0, x1 - x0, 6); g.fillStyle = '#8a92a2'; g.fillRect(x0, y0, x1 - x0, 1);
      for (let xx = Math.floor(x0 / 12) * 12; xx < x1; xx += 12) { g.fillStyle = '#ffd23f'; g.fillRect(xx, y0 + 6, 6, 3); g.fillStyle = '#1a1a1a'; g.fillRect(xx + 6, y0 + 6, 6, 3); }
      for (let xx = Math.floor(x0 / 24) * 24; xx < x1; xx += 24) { g.fillStyle = '#9aa2b0'; g.fillRect(xx + 3, y0 + 2, 1, 1); }
      break;
    }
    case 'fwall': {
      const yTop = -OY - 4, yBot = 320, left = x < 100, xa = left ? -OX - 4 : x, xb = left ? x + w : BW - OX + 4;
      g.fillStyle = '#4a5060'; g.fillRect(xa, yTop, xb - xa, yBot - yTop);
      for (let yy = Math.floor(yTop / 40) * 40; yy < yBot; yy += 40) { g.fillStyle = '#3a3f4c'; g.fillRect(xa, yy, xb - xa, 2); for (let xx = xa + 4; xx < xb; xx += 10) { g.fillStyle = '#7a8090'; g.fillRect(xx, yy + 5, 2, 2); } }
      const edge = left ? x + w - 3 : x;
      g.fillStyle = '#8a92a2'; g.fillRect(edge, yTop, 3, yBot - yTop); g.fillStyle = '#2a2d36'; g.fillRect(left ? edge - 1 : edge + 3, yTop, 1, yBot - yTop);
      for (let yy = 60; yy < 300; yy += 90) { g.fillStyle = '#ffd23f'; for (let i = 0; i < 4; i++) g.fillRect(left ? edge - 10 + i * 2 : edge + 4 + i * 2, yy + i * 3, 2, 3); }
      break;
    }
    case 'ceiling': {
      const x0 = -OX - 4, x1 = BW - OX + 4, yb = y + h;
      g.fillStyle = '#23252e'; g.fillRect(x0, -OY - 4, x1 - x0, yb + OY + 4);
      g.fillStyle = '#3a3f4c'; g.fillRect(x0, yb - 6, x1 - x0, 6); g.fillStyle = '#5c6270'; g.fillRect(x0, yb - 2, x1 - x0, 2);
      g.strokeStyle = '#3a3f4c'; g.lineWidth = 2; g.beginPath();
      for (let xx = Math.floor(x0 / 20) * 20; xx < x1; xx += 20) { g.moveTo(xx, yb - 6); g.lineTo(xx + 10, yb - 16); g.lineTo(xx + 20, yb - 6); }
      g.stroke();
      break;
    }
    case 'reedwall': {
      const yTop = -OY - 4, yBot = BH - OY + 4, left = x < 100, xa = left ? -OX - 4 : x, xb = left ? x + w : BW - OX + 4;
      g.fillStyle = '#0e2214'; g.fillRect(xa, yTop, xb - xa, yBot - yTop);
      for (let i = 0; i < (xb - xa) * 3; i++) {   // dense vertical blades
        const bx = xa + Math.floor(r() * (xb - xa)), by = yTop + Math.floor(r() * (yBot - yTop)), bh = 10 + Math.floor(r() * 40);
        g.fillStyle = pick(r, ['#1a3a1e', '#24502a', '#2f6a34', '#173020']); g.fillRect(bx, by, 1 + (r() < 0.3 ? 1 : 0), bh);
      }
      const edge = left ? x + w : x;
      for (let yy = yTop; yy < yBot; yy += 2) {   // ragged inner edge of blades
        const d = Math.floor(r() * 6);
        g.fillStyle = pick(r, ['#3f8a3a', '#2f6a34', '#4f9a44']); g.fillRect(left ? edge - 2 - d : edge, yy, d + 2, 2);
      }
      break;
    }
    case 'canopy': {
      const x0 = -OX - 4, x1 = BW - OX + 4, yb = y + h;
      g.fillStyle = '#0a1a10'; g.fillRect(x0, -OY - 4, x1 - x0, yb + OY + 4);
      for (let i = 0; i < (x1 - x0) / 2; i++) {   // leafy clumps drooping from the underside
        const cx = x0 + r() * (x1 - x0), cy = yb - 4 + r() * 10, rr = 4 + Math.floor(r() * 7);
        pxCircle(g, cx, cy, rr, pick(r, ['#12301a', '#1a4022', '#16361c']));
        if (r() < 0.4) pxCircle(g, cx - 1, cy - 1, Math.max(1, rr - 3), '#24562c');
      }
      break;
    }
    case 'stump': {
      const yb = BH - OY + 4;
      g.fillStyle = '#3a2a18'; g.fillRect(x, y, w, yb - y);
      for (let xx = x + 2; xx < x + w - 1; xx += 4) { g.fillStyle = r() < 0.5 ? '#2a1e10' : '#4a3620'; g.fillRect(xx, y + 4, 2, yb - y); }
      g.fillStyle = '#1e140a'; g.fillRect(x, y, 2, yb - y); g.fillRect(x + w - 2, y, 2, yb - y);
      pxEllipse(g, x + w / 2, y + 2, w / 2, 3, '#6a5030'); pxEllipse(g, x + w / 2, y + 2, w / 2 - 4, 2, '#8a6a40'); pxEllipse(g, x + w / 2, y + 2, 3, 1, '#6a5030');
      g.fillStyle = '#3f8a3a'; g.fillRect(x, y - 1, Math.floor(w * 0.6), 2); g.fillStyle = '#5fae4a'; g.fillRect(x + 2, y - 2, Math.floor(w * 0.35), 1);   // moss
      for (let i = 0; i < 6; i++) { g.fillStyle = '#3f8a3a'; g.fillRect(x + Math.floor(r() * w), y + 2 + Math.floor(r() * 20), 2, 3 + Math.floor(r() * 6)); }
      break;
    }
    case 'bank': {
      const left = x < 0, xa = left ? -OX - 4 : x, xb = left ? x + w : BW - OX + 4, yb = BH - OY + 4;
      g.fillStyle = '#5a3e22'; g.fillRect(xa, y, xb - xa, yb - y);
      for (let i = 0; i < (xb - xa) * 2; i++) { g.fillStyle = r() < 0.5 ? '#4a321a' : '#6e4e2e'; g.fillRect(xa + Math.floor(r() * (xb - xa)), y + 6 + Math.floor(r() * (yb - y - 6)), 2, 1); }
      const edge = left ? x + w - 3 : x;
      g.fillStyle = '#3e2a14'; g.fillRect(edge, y + 4, 3, yb - y);
      g.fillStyle = '#3fae3a'; g.fillRect(xa, y, xb - xa, 6); g.fillStyle = '#5fd24b'; g.fillRect(xa, y, xb - xa, 3); g.fillStyle = '#8ef06f'; g.fillRect(xa, y, xb - xa, 1);
      for (let xx = xa; xx < xb; xx += 2) { g.fillStyle = '#3fae3a'; g.fillRect(xx, y + 6, 2, Math.floor(r() * 4)); }
      break;
    }
    case 'mesa': {
      const yTop = -OY - 4, yBot = 330, left = x < 100, xa = left ? -OX - 4 : x, xb = left ? x + w : BW - OX + 4;
      g.fillStyle = '#b8743f'; g.fillRect(xa, yTop, xb - xa, yBot - yTop);
      for (let yy = yTop + (r() * 10 | 0), k = 0; yy < yBot; yy += 9 + Math.floor(r() * 9), k++) { g.fillStyle = k % 2 ? '#c98a52' : '#a8663a'; g.fillRect(xa, yy, xb - xa, 3 + Math.floor(r() * 3)); }
      for (let i = 0; i < 50; i++) { g.fillStyle = '#8a4e2a'; g.fillRect(xa + Math.floor(r() * (xb - xa)), yTop + Math.floor(r() * (yBot - yTop)), 1, 3 + Math.floor(r() * 6)); }
      const edge = left ? x + w - 3 : x;
      g.fillStyle = '#e8a870'; g.fillRect(edge, yTop, 2, yBot - yTop); g.fillStyle = '#7a3e1e'; g.fillRect(left ? edge - 1 : edge + 2, yTop, 1, yBot - yTop);
      break;
    }
    case 'sandstone': case 'drock': {
      const rock = p.type === 'drock';
      roundRectPx(g, x, y, w, h, rock ? 6 : 3, '#8a4e2a');
      roundRectPx(g, x, y, w, h - 2, rock ? 6 : 3, rock ? '#b07a4a' : '#c98a52');
      g.fillStyle = rock ? '#c99a6a' : '#e8b27a'; g.fillRect(x + 3, y + 1, w - 6, 2);
      for (let yy = y + 5; yy < y + h - 3; yy += 4) { g.fillStyle = '#a8663a'; g.fillRect(x + 2, yy, w - 4, 1); }
      for (let i = 0; i < w * h / 40; i++) { g.fillStyle = r() < 0.5 ? '#8a4e2a' : '#f0c890'; g.fillRect(x + 2 + Math.floor(r() * (w - 4)), y + 3 + Math.floor(r() * Math.max(1, h - 5)), 1, 1); }
      g.fillStyle = '#f2d9a0'; g.fillRect(x + 4, y - 1, w - 8, 1);
      if (!rock) for (let xx = x + 5; xx < x + w - 4; xx += 7 + Math.floor(r() * 6)) { g.fillStyle = '#8a4e2a'; g.fillRect(xx, y + h, 1, 1 + Math.floor(r() * 4)); }
      break;
    }
    case 'girder': {
      g.fillStyle = '#8a3418'; g.fillRect(x, y, w, h);
      g.fillStyle = '#c8502a'; g.fillRect(x, y, w, h - 2);
      g.fillStyle = '#e8743c'; g.fillRect(x, y, w, 2);
      g.fillStyle = '#a8401f'; g.fillRect(x, y + 4, w, 1);
      for (let xx = x + 6; xx < x + w - 4; xx += 12) { g.fillStyle = '#5a200e'; g.fillRect(xx, y + 5, 3, 2); }
      g.fillStyle = '#f0a070'; g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1);
      break;
    }
    case 'mcrate': {
      g.fillStyle = '#2a2d36'; g.fillRect(x, y, w, h);
      g.fillStyle = '#6a7480'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = '#8a94a4'; g.fillRect(x + 1, y + 1, w - 2, 2);
      g.strokeStyle = '#4a5260'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + w - 3, y + h - 3); g.moveTo(x + w - 3, y + 3); g.lineTo(x + 3, y + h - 3); g.stroke();
      for (const [cx, cy] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) { g.fillStyle = '#b4bcc8'; g.fillRect(cx, cy, 1, 1); }
      g.fillStyle = '#ffd23f'; g.fillRect(x + 3, y + h - 6, w - 6, 2);
      break;
    }
    case 'hay': {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, y + h - 2, w, 3);     // ground shadow
      roundRectPx(g, x, y, w, h, 4, '#4a2e0a');                              // dark outline so it reads against the straw
      roundRectPx(g, x + 1, y + 1, w - 2, h - 2, 4, '#b8862a');
      roundRectPx(g, x + 1, y + 1, w - 2, h - 4, 4, '#e0b04a');
      for (let i = 0; i < w * h / 6; i++) { g.fillStyle = r() < 0.5 ? '#f3cf6a' : '#c08e2e'; g.fillRect(x + 1 + Math.floor(r() * (w - 2)), y + 1 + Math.floor(r() * (h - 3)), 3, 1); }
      g.fillStyle = '#8a1f14'; g.fillRect(x + Math.floor(w * 0.3), y + 1, 2, h - 2); g.fillRect(x + Math.floor(w * 0.7), y + 1, 2, h - 2);   // red twine
      break;
    }
  }
}

/* ---------- Per-frame animated environment pieces ---------- */
function drawWater(L, t, W) {
  if (!L.water) return;
  if (L.pond) { drawPondWater(L, t, W); return; }
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

/* ---------- Factory (level 5) art ---------- */
function drawFactoryBackdrop(g, L) {
  g.fillStyle = '#1c1a28'; g.fillRect(0, 0, BW, BH);
  g.save(); g.translate(OX, OY);
  const x0 = -OX - 4, x1 = BW - OX + 4, y0 = -OY - 4, y1 = BH - OY + 4;
  // dark brick back wall
  for (let yy = Math.floor(y0 / 8) * 8, row = 0; yy < y1; yy += 8, row++) {
    for (let xx = Math.floor(x0 / 16) * 16 - (row % 2) * 8; xx < x1; xx += 16) {
      g.fillStyle = ((xx * 7 + yy * 3) & 31) < 6 ? '#2e2a3c' : '#28243a'; g.fillRect(xx, yy, 15, 7);
    }
  }
  // tall factory windows with cool light
  const wr = rng(L.seed ^ 31);
  for (let i = 0; i < 4; i++) {
    const wx = 40 + i * 156 + Math.floor(wr() * 20), wy = 34, ww = 64, wh = 104;
    g.fillStyle = '#14121c'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    g.fillStyle = '#3b4f78'; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#4c6494'; g.fillRect(wx, wy, ww, wh / 2);
    g.fillStyle = '#14121c'; for (let k = 1; k < 4; k++) g.fillRect(wx + k * 16, wy, 2, wh); for (let k = 1; k < 5; k++) g.fillRect(wx, wy + k * 21, ww, 2);
    g.fillStyle = 'rgba(200,220,255,0.18)'; for (let k = 0; k < 6; k++) g.fillRect(wx + 4 + k * 9, wy + 4 + k * 12, 8, 2);
    if (wr() < 0.6) { g.fillStyle = '#1c1a28'; g.fillRect(wx + 16 * Math.floor(wr() * 4) + 2, wy + 21 * Math.floor(wr() * 5) + 2, 14, 19); }
    g.globalAlpha = 0.07; g.fillStyle = '#9ad0ff';
    g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx + ww, wy + wh); g.lineTo(wx + ww + 60, 320); g.lineTo(wx + 30, 320); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  // pipes along the wall
  for (const [py, c1, c2] of [[262, '#4a5a6a', '#7a8ea2'], [284, '#5a4a3a', '#9a7a5a']]) {
    g.fillStyle = c1; g.fillRect(x0, py, x1 - x0, 7); g.fillStyle = c2; g.fillRect(x0, py + 1, x1 - x0, 2);
    for (let xx = Math.floor(x0 / 70) * 70 + 20; xx < x1; xx += 70) { g.fillStyle = '#2a2d36'; g.fillRect(xx, py - 1, 4, 9); }
  }
  for (const px of [180, 470]) { g.fillStyle = '#4a5a6a'; g.fillRect(px, 140, 7, 122); g.fillStyle = '#7a8ea2'; g.fillRect(px + 1, 140, 2, 122); pxCircle(g, px + 3, 156, 6, '#5c6270'); pxCircle(g, px + 3, 156, 3, '#c43a3a'); }
  g.restore();
}
/* Lamps hanging from the ceiling and the tracks the lifts ride on (cached with the scene) */
function drawFactoryFixtures(g, L) {
  for (const d of L.decor) if (d.k === 'lamp') {
    g.fillStyle = '#1a1a22'; g.fillRect(d.x, 16, 1, d.len);
    const ly = 16 + d.len;
    g.fillStyle = '#5c6270'; g.fillRect(d.x - 5, ly, 11, 3); g.fillRect(d.x - 3, ly - 2, 7, 2);
    g.fillStyle = '#fff3c0'; g.fillRect(d.x - 2, ly + 3, 5, 2);
    g.globalAlpha = 0.06; g.fillStyle = '#ffe9a0';
    g.beginPath(); g.moveTo(d.x - 4, ly + 4); g.lineTo(d.x + 5, ly + 4); g.lineTo(d.x + 40, 320); g.lineTo(d.x - 40, 320); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  for (const m of L.movers || []) {
    const mv = m.move;
    if (m.axis === 'x') {   // ceiling rail
      g.fillStyle = '#2a2d36'; g.fillRect(mv.x0 + m.w / 2 - 6, 16, mv.x1 - mv.x0 + 12, 4);
      g.fillStyle = '#7a8090'; g.fillRect(mv.x0 + m.w / 2 - 6, 17, mv.x1 - mv.x0 + 12, 1);
    } else {                // elevator guide rails down to the floor
      for (const gx of [m.x - 3, m.x + m.w + 1]) { g.fillStyle = '#2a2d36'; g.fillRect(gx, mv.y0 - 10, 2, GROUND_Y - mv.y0 + 10); g.fillStyle = '#5c6270'; g.fillRect(gx, mv.y0 - 10, 1, GROUND_Y - mv.y0 + 10); }
    }
  }
  for (const p of L.plats) if (p.type === 'conveyor' && p.stand) {   // support stand for a raised belt
    for (const sx of [p.x + 10, p.x + p.w - 14]) { g.fillStyle = '#2a2d36'; g.fillRect(sx, p.y + p.h, 4, GROUND_Y - p.y - p.h); g.fillStyle = '#5c6270'; g.fillRect(sx + 1, p.y + p.h, 1, GROUND_Y - p.y - p.h); }
  }
}
/* Animated pieces: gears behind the scene, then lifts + conveyors drawn every frame */
function drawFactoryGears(t) {
  for (const [gx, gy, rr, sp] of [[110, 210, 34, 0.4], [168, 176, 18, -0.75], [560, 200, 40, -0.3]]) drawGearShape(ctx, gx, gy, rr, t * sp, '#24212f', '#2c2838');
}
function drawGearShape(g, cx, cy, rr, ang, c1, c2) {
  const teeth = Math.max(8, Math.round(rr / 3.5));
  g.fillStyle = c1; g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = ang + i * Math.PI / teeth, R = i % 2 ? rr : rr + 5;
    const a2 = a + Math.PI / teeth;
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a2 - 0.08) * R, cy + Math.sin(a2 - 0.08) * R);
  }
  g.closePath(); g.fill();
  pxCircle(g, cx, cy, rr * 0.62, c2); pxCircle(g, cx, cy, rr * 0.22, c1);
  g.fillStyle = c1; for (let k = 0; k < 4; k++) { const a = ang + k * Math.PI / 2; g.fillRect(Math.round(cx + Math.cos(a) * rr * 0.42) - 2, Math.round(cy + Math.sin(a) * rr * 0.42) - 2, 4, 4); }
}
function drawDynPlatform(p, t) {
  const x = Math.round(p.x), y = Math.round(p.y), w = p.w, h = p.h;
  if (p.type === 'lilypad') return;   // drawn on top of the water by drawPondWater
  if (p.type === 'sand2') { drawRisingSand(p, t); return; }
  if (p.type === 'mound') { drawMound(p, t); return; }
  if (p.type === 'lift') {
    if (p.axis === 'x') { ctx.fillStyle = '#1a1a22'; ctx.fillRect(x + 6, 20, 1, y - 20); ctx.fillRect(x + w - 7, 20, 1, y - 20); ctx.fillStyle = '#5c6270'; ctx.fillRect(x + w / 2 - 8, 16, 16, 5); }
    else { ctx.fillStyle = '#2a2d36'; ctx.fillRect(x + w / 2 - 3, y + h, 6, GROUND_Y - y - h); ctx.fillStyle = '#9aa2b0'; ctx.fillRect(x + w / 2 - 2, y + h, 2, GROUND_Y - y - h); }
    ctx.fillStyle = '#2a2d36'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#8a94a4'; ctx.fillRect(x + 1, y, w - 2, h - 2);
    ctx.fillStyle = '#c4ccd8'; ctx.fillRect(x + 1, y, w - 2, 2);
    for (let xx = x + 2; xx < x + w - 2; xx += 8) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(xx, y + 4, 4, h - 6); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(xx + 4, y + 4, 4, h - 6); }
    ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff5a3a' : '#7a2a1a'; ctx.fillRect(x + 2, y + 1, 2, 1); ctx.fillRect(x + w - 4, y + 1, 2, 1);
    return;
  }
  if (p.type === 'conveyor') {
    const rr = h / 2, off = ((t * p.belt) % 8 + 8) % 8;
    ctx.fillStyle = '#2a2d36'; ctx.fillRect(x - 1, y, w + 2, h);
    ctx.fillStyle = '#16171c'; ctx.fillRect(x + 2, y, w - 4, 3); ctx.fillRect(x + 2, y + h - 3, w - 4, 3);
    ctx.fillStyle = '#5c6270'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    for (let xx = x + 3 + off; xx < x + w - 3; xx += 8) { ctx.fillStyle = '#4a4e58'; ctx.fillRect(Math.round(xx), y, 3, 3); }
    for (let xx = x + w - 3 - off; xx > x + 3; xx -= 8) { ctx.fillStyle = '#4a4e58'; ctx.fillRect(Math.round(xx) - 3, y + h - 3, 3, 3); }
    // direction arrows along the side
    const dir = Math.sign(p.belt);
    for (let xx = x + 12; xx < x + w - 12; xx += 22) { ctx.fillStyle = '#ffd23f'; for (let k = 0; k < 3; k++) ctx.fillRect(xx + dir * k, y + 4 + k, 1, h - 8 - k * 2); }
    for (const ex of [x + rr, x + w - rr]) {
      pxCircle(ctx, ex, y + rr, rr, '#8a94a4'); pxCircle(ctx, ex, y + rr, rr - 2, '#3a3f4c');
      const a = t * p.belt / rr; ctx.fillStyle = '#c4ccd8'; ctx.fillRect(Math.round(ex + Math.cos(a) * (rr - 3)), Math.round(y + rr + Math.sin(a) * (rr - 3)), 1, 1);
    }
  }
}
/* Move lifts to where they are at time t; carry ropes anchored to them */
function updateMovers(L, t) {
  if (!L.movers) return;
  for (const p of L.movers) {
    const m = p.move, k = 0.5 - 0.5 * Math.cos(TAU * (t / m.period + m.phase));
    const nx = m.x0 + (m.x1 - m.x0) * k, ny = m.y0 + (m.y1 - m.y0) * k;
    p.dx = nx - p.x; p.dy = ny - p.y; p.x = nx; p.y = ny;
  }
}

/* ---------- Desert (level 6): rising sand + the ant hill ---------- */
function drawRisingSand(p, t) {
  const L = ART.level, x0 = -OX - 4, x1 = BW - OX + 4, y0 = Math.round(p.y), y1 = BH - OY + 4;
  ctx.fillStyle = '#d9a866'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = '#c99a5a'; for (let yy = y0 + 14; yy < y1; yy += 12) ctx.fillRect(x0, yy, x1 - x0, 2);
  if (L) for (const d of L.decor) if (d.k === 'grain' && d.y > y0 + 4) { ctx.fillStyle = d.c; ctx.fillRect(Math.round(d.x), Math.round(d.y), 2, 1); }
  // rippled top edge, drifting slowly
  for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
    const hh = Math.round(Math.sin(x * 0.05 + t * 0.6) * 1.2 + Math.sin(x * 0.013) * 1.5);
    ctx.fillStyle = '#f2d9a0'; ctx.fillRect(x, y0 - 1 + hh, 2, 3);
    ctx.fillStyle = '#fff0c8'; ctx.fillRect(x, y0 - 1 + hh, 2, 1);
  }
}
function drawMound(p, t) {
  const x = p.x, y = p.y, w = p.w, h = p.h, cx = x + w / 2, burst = p.burstT || 0;
  const sh = burst > 0 ? Math.round(Math.sin(t * 50) * Math.min(2, burst)) : (p.tremble ? Math.round(Math.sin(t * 40)) : 0);
  // hill: stacked rows narrowing to the top, wider than the collision box at the base
  for (let i = 0; i < h + 6; i++) {
    const k = i / (h + 6), half = (w / 2 + 14) * (0.35 + 0.65 * k);
    ctx.fillStyle = i < 2 ? '#e8b27a' : i % 4 === 0 ? '#b8834a' : '#c99560';
    ctx.fillRect(Math.round(cx - half + sh), Math.round(y + i), Math.round(half * 2), 1);
  }
  for (let i = 0; i < 18; i++) { const a = (i * 2.4) % 1, b = (i * 0.37) % 1; ctx.fillStyle = i % 2 ? '#a8733e' : '#e2b27a'; ctx.fillRect(Math.round(cx + (a - 0.5) * w * 0.9 + sh), Math.round(y + 3 + b * h), 2, 1); }
  // the nest hole
  const hr = burst > 0 || p.open ? 9 : 6;
  pxEllipse(ctx, cx + sh, y + 1, hr + 2, 3, '#8a5a2a');
  pxEllipse(ctx, cx + sh, y + 1, hr, 2, '#1a0e06');
}

/* ---------- Swamp (level 7): backdrop, plants, deep water, light shafts ---------- */
function drawSwampBackdrop(g, L) {
  const B = L.B, bandH = Math.ceil(BH / B.sky.length);
  B.sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * bandH, BW, bandH + 1); });
  g.save(); g.translate(OX, OY);
  const x0 = -OX - 4, x1 = BW - OX + 4, tr = rng(L.seed ^ 61);
  // far trunks fading into the gloom, then nearer ones
  for (const [n, c1, c2, wmin] of [[14, '#132a1c', '#173220', 6], [8, '#0e2016', '#142a1c', 12]]) {
    for (let i = 0; i < n; i++) {
      const tx = x0 + tr() * (x1 - x0), tw = wmin + Math.floor(tr() * wmin);
      g.fillStyle = c1; g.fillRect(Math.round(tx), -OY - 4, tw, 340); g.fillStyle = c2; g.fillRect(Math.round(tx) + 1, -OY - 4, 2, 340);
      // roots flaring into the water
      for (let k = 0; k < 3; k++) { g.fillStyle = c1; g.fillRect(Math.round(tx - 4 + k * (tw / 2)), 278 + k, 4, 14); }
    }
  }
  // foliage masses hanging high up
  for (let i = 0; i < 70; i++) { const cx = x0 + tr() * (x1 - x0), cy = 10 + tr() * 90, rr = 8 + tr() * 18; pxCircle(g, cx, cy, rr, tr() < 0.5 ? '#0e2214' : '#12281a'); }
  // misty glow over the water
  for (let k = 0; k < 6; k++) { g.globalAlpha = 0.05; g.fillStyle = '#b8d8b0'; g.fillRect(x0, 250 + k * 6, x1 - x0, 40 - k * 6); }
  g.globalAlpha = 1;
  g.restore();
}
function drawPondPlants(L, t, front) {
  for (const d of L.decor) {
    if (d.k === 'cattail' && !!d.front === front) {
      const sway = Math.sin(t * 1.3 + d.ph) * 3;
      for (let i = 0; i < d.h; i++) { ctx.fillStyle = i % 5 ? '#3f7a2e' : '#2f6a24'; ctx.fillRect(Math.round(d.x + sway * i / d.h), d.base - i, 1, 1); }
      const hx = Math.round(d.x + sway), hy = d.base - d.h;
      ctx.fillStyle = '#4a2a12'; ctx.fillRect(hx - 1, hy, 3, 9); ctx.fillStyle = '#6a4020'; ctx.fillRect(hx - 1, hy + 1, 1, 7);
      ctx.fillStyle = '#3f7a2e'; ctx.fillRect(hx, hy - 4, 1, 4);
      const lf = Math.sin(t * 1.6 + d.ph * 2) * 2;
      for (let i = 0; i < d.h * 0.7; i++) { ctx.fillStyle = '#4f9a3a'; ctx.fillRect(Math.round(d.x + 2 + (sway + lf) * i / d.h + i * 0.08), d.base - i, 1, 1); }
    } else if (d.k === 'blade' && !!d.front === front) {
      // tall grass rising out of the water at the edges, leaning in and swaying
      const sway = Math.sin(t * 0.9 + d.ph) * 4, base = L.water.y + 6;
      for (let i = 0; i < d.h; i += 1) {
        const k = i / d.h, bx = d.x + (d.lean * i * 0.35 + sway * k * k);
        ctx.fillStyle = front ? (k > 0.85 ? '#6fbe4a' : i % 7 ? '#3f8a34' : '#2f6a2a') : (i % 7 ? '#24502a' : '#1a3a1e');
        ctx.fillRect(Math.round(bx), base - i, k < 0.6 ? 2 : 1, 1);
      }
    } else if (d.k === 'vine' && !!d.front === front) {
      // vines dangling from the canopy, leaves along their length
      let px = d.x, py = 16;
      for (let i = 0; i < d.len; i += 2) {
        const sw = Math.sin(t * 1.1 + d.ph + i * 0.03) * (i / d.len) * 6;
        const vx = d.x + sw;
        ctx.fillStyle = front ? '#2f6a24' : '#1e4a1e'; ctx.fillRect(Math.round(vx), py + i, 1, 2);
        if (i % 10 === 4) { const s = (i / 10) % 2 ? 1 : -1; ctx.fillStyle = front ? '#4f9a3a' : '#2f6a2a'; ctx.fillRect(Math.round(vx) + (s > 0 ? 1 : -3), py + i, 3, 2); ctx.fillStyle = front ? '#7cc25a' : '#3f7a2e'; ctx.fillRect(Math.round(vx) + (s > 0 ? 2 : -2), py + i, 1, 1); }
        px = vx;
      }
    }
  }
}
function drawPondUnder(L, t) {   // weeds swaying under the surface (deeper parts fade into the dark water)
  for (const d of L.decor) if (d.k === 'weed') {
    for (let i = 0; i < d.h; i++) { const sw = Math.sin(t * 1.2 + d.ph + i * 0.18) * (i / d.h) * 4; ctx.fillStyle = i % 3 ? '#1f5a2a' : '#2f7a34'; ctx.fillRect(Math.round(d.x + sw), 346 - i, 1, 1); if (i % 6 === 3) ctx.fillRect(Math.round(d.x + sw) + 1, 346 - i, 2, 1); }
  }
}
function drawPondWater(L, t, W) {
  const wy = L.water.y, x0 = -OX - 4, x1 = BW - OX + 4, yb = BH - OY + 4;
  // murky water: fairly clear at the top, darker and darker with depth
  const gr = ctx.createLinearGradient(0, wy, 0, yb);
  gr.addColorStop(0, 'rgba(60,120,96,0.55)'); gr.addColorStop(0.18, 'rgba(34,84,70,0.78)'); gr.addColorStop(0.5, 'rgba(14,44,40,0.92)'); gr.addColorStop(1, 'rgba(4,14,14,0.98)');
  ctx.fillStyle = gr; ctx.fillRect(x0, wy + 1, x1 - x0, yb - wy);
  // drifting specks and shimmer just below the surface
  ctx.fillStyle = 'rgba(200,240,210,0.14)';
  for (let i = 0; i < 26; i++) { const cx = x0 + ((i * 47 + t * (6 + i % 5 * 2)) % (x1 - x0)), cy = wy + 5 + (i * 13) % 26; ctx.fillRect(Math.round(cx), Math.round(cy + Math.sin(t * 2 + i) * 1.5), 4 + (i % 3) * 3, 1); }
  // light shafts carry on a little way into the water
  for (const d of L.decor) if (d.k === 'ray') {
    const sx = d.x + (wy - 16) * 0.42;
    ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t * 0.7 + d.ph);
    ctx.fillStyle = '#d8f0b0'; ctx.beginPath(); ctx.moveTo(sx, wy + 1); ctx.lineTo(sx + d.w, wy + 1); ctx.lineTo(sx + d.w + 18, wy + 40); ctx.lineTo(sx + 14, wy + 40); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // rippling surface line with glints where the light lands
  for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
    const h = Math.round(Math.sin(x * 0.09 + t * 2.0) * 1.1 + Math.sin(x * 0.031 - t * 1.3) * 1.1);
    ctx.fillStyle = 'rgba(30,70,56,0.8)'; ctx.fillRect(x, wy + h + 1, 2, 2);
    let lit = false; for (const d of L.decor) if (d.k === 'ray') { const sx = d.x + (wy - 16) * 0.42; if (x > sx && x < sx + d.w) lit = true; }
    ctx.fillStyle = lit ? '#f0ffd0' : '#9ccfa8'; ctx.fillRect(x, wy + h, 2, 1);
  }
  // ripple rings: around lily pads, stumps, aiming fish and the odd drip
  ctx.strokeStyle = 'rgba(200,240,210,0.45)'; ctx.lineWidth = 1;
  const ring = (cx, rr) => { ctx.beginPath(); ctx.ellipse(Math.round(cx) + 0.5, wy + 0.5, rr, Math.max(1, rr * 0.22), 0, 0, TAU); ctx.stroke(); };
  for (const p of L.plats) if (p.type === 'lilypad') ring(p.x + p.w / 2, p.w / 2 + 3 + (Math.sin(t * 2 + p.x) + 1) * 1.5);
  for (const p of L.plats) if (p.type === 'stump') ring(p.x + p.w / 2, p.w / 2 + 3 + (Math.sin(t * 1.4 + p.x) + 1) * 1.2);
  if (W) for (const e of W.enemies) if (e.type === 'archer' && e.alive && e.surfaced) { const k = (t * 1.5) % 1; ring(e.x, 4 + k * 12); }
  for (let i = 0; i < 5; i++) { const k = (t * 0.5 + i * 0.2) % 1, cx = 40 + ((i * 97 + Math.floor(t * 0.5 + i * 0.2) * 61) % 560); ctx.globalAlpha = 1 - k; ring(cx, 2 + k * 14); ctx.globalAlpha = 1; }
  // low mist drifting over the surface
  for (let i = 0; i < 7; i++) {
    const mx = ((i * 120 + t * (5 + i)) % 760) - 60;
    ctx.globalAlpha = 0.07; pxEllipse(ctx, mx, wy - 4 - (i % 3) * 3, 50 + (i % 3) * 16, 4, '#d8ecd0'); ctx.globalAlpha = 1;
  }
  for (const p of L.plats) if (p.type === 'lilypad') drawLilyPad(p, t);
}
/* Sunbeams slanting down through gaps in the canopy, drawn over everything */
function drawSwampLight(L, t) {
  const wy = L.water.y;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const d of L.decor) if (d.k === 'ray') {
    const a = 0.055 + 0.03 * Math.sin(t * 0.6 + d.ph) + 0.015 * Math.sin(t * 2.3 + d.ph * 3);
    const gr = ctx.createLinearGradient(0, 16, 0, wy);
    gr.addColorStop(0, 'rgba(240,255,190,' + (a * 2.2).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(240,255,190,' + (a * 0.6).toFixed(3) + ')');
    ctx.fillStyle = gr;
    const dx = (wy - 16) * 0.42;
    ctx.beginPath(); ctx.moveTo(d.x, 16); ctx.lineTo(d.x + d.w * 0.6, 16); ctx.lineTo(d.x + dx + d.w, wy); ctx.lineTo(d.x + dx, wy); ctx.closePath(); ctx.fill();
    // motes drifting in the beam
    for (let i = 0; i < 6; i++) {
      const k = ((t * 0.05 + i / 6 + d.ph) % 1), my = 16 + k * (wy - 20), mx = d.x + dx * k + d.w * (0.2 + 0.6 * ((i * 0.37 + d.ph) % 1)) + Math.sin(t + i) * 2;
      ctx.fillStyle = 'rgba(255,255,210,0.5)'; ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
    }
  }
  // canopy glints where the light breaks through
  for (const d of L.decor) if (d.k === 'ray') { ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.7 + d.ph); pxEllipse(ctx, d.x + d.w * 0.3, 15, d.w * 0.4, 2, '#d8f0a0'); }
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawLilyPad(p, t) {
  const cx = p.x + p.w / 2, cy = p.y + 2, rx = p.w / 2 + 2;
  pxEllipse(ctx, cx, cy + 1, rx, 3, '#2f7a2a');
  pxEllipse(ctx, cx, cy, rx, 3, '#4fae45');
  pxEllipse(ctx, cx - 2, cy - 1, rx - 5, 1.5, '#6fce5a');
  ctx.fillStyle = '#2f7a2a'; for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(cx + 2 + i * 2), Math.round(cy - 2 + i), 2, 1);   // the notch
  ctx.fillStyle = '#3f9a3a'; ctx.fillRect(Math.round(cx - rx * 0.5), Math.round(cy), Math.round(rx), 1);
  if (p.flower) { const fx = Math.round(cx - rx * 0.4), fy = Math.round(cy - 3); ctx.fillStyle = '#ff9acb'; ctx.fillRect(fx - 2, fy, 5, 2); ctx.fillRect(fx - 1, fy - 2, 3, 2); ctx.fillStyle = '#fff3a0'; ctx.fillRect(fx, fy - 1, 1, 1); }
}
