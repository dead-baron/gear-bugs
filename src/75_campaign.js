/* =====================================================================
   75_CAMPAIGN - campaign rules, overworld map with fog of war, ending
   ===================================================================== */
const Campaign = {
  W: null, level: 0, diff: 1, phase: 'play', timer: 0, banner: null, time: 0, flyT: 0, me: null,

  restart() { this.start(this.level, this.diff, undefined, this.opts); },
  start(level, diff, forcedSeed, opts) {
    this.opts = opts || {}; this.practice = !!this.opts.practice; this.infinite = !!this.opts.infinite; this.respawnT = 0;
    this.level = level; this.diff = diff; this.phase = 'play'; this.timer = 0; this.time = 0; this.flyT = 0.5;
    const seed = forcedSeed !== undefined ? forcedSeed : (Math.random() * 0xFFFFFFFF) >>> 0;   // pseudo-random layout every attempt
    const W = this.W = new World({ mode: 'campaign', biome: level, seed, diff, authority: true, rules: this.rules() });
    const L = W.L;
    const me = this.me = new SpiderBody('me', L.spawns[0].x, L.spawns[0].y, { style: save.style, name: 'YOU', facing: 1 });
    W.spiders.push(me); W.localId = me.id;
    const es = L.enemySpawn;
    if (level === 0) W.enemies.push(new Lizard(es.x, es.y));
    else if (level === 1) W.enemies.push(new Hive(L.hive.x, L.hive.y));
    else if (level === 2) W.enemies.push(new Gecko(es.x, es.y));
    else W.enemies.push(new Widow(es.x, es.y, { plat: es.plat }));
    this.boss = W.enemies[0];
    for (let i = 0; i < 2; i++) W.spawnFly();
    const B = BIOMES[level];
    this.banner = { text: 'LEVEL ' + (level + 1) + ': ' + B.name, sub: 'CATCH 5 GOLDEN FLIES, THEN TAKE DOWN THE ' + B.npc, t: 3, max: 3, color: '#ffd23f' };
    track('game_start', { mode: 'campaign', level: level + 1, difficulty: DIFFS[diff].name });
  },
  rules() {
    const C = this;
    return {
      onFlyCollected(sp, f) {
        if (sp.flies >= 5) return;
        sp.flies++;
        floater(C.W, f.x, f.y - 10, '+1 FLY', '#ffd23f');
        if (sp.flies === 5) {
          SFX.play('powerup'); shake(0.2, 2);
          burst(C.W, sp.x, sp.y, 30, ['#ffd23f', '#fff3a0', '#ffffff'], 140, 0.9);
          C.banner = { text: 'POWERED UP!', sub: 'READY TO FIGHT! WEB THE ' + BIOMES[C.level].npc, t: 2.6, max: 2.6, color: '#ffd23f' };
          for (const fl of C.W.flies) if (!fl.heart) burst(C.W, fl.x, fl.y, 4, ['#fff3a0'], 30, 0.3);
          C.W.flies = C.W.flies.filter(fl => fl.heart);
        }
      },
      onEnemyBite(e, sp) { if (sp.powered && e.alive) e.defeat(C.W, sp.slot); },
      onEnemyTrapped(e) { C.banner = { text: e.type === 'hive' ? 'HIVE WEBBED!' : BIOMES[C.level].npc + ' STUCK!', sub: 'CRAWL OVER AND BITE IT!', t: 1.8, max: 1.8, color: '#ffffff' }; },
      onEnemyDefeated(e) {
        if (e !== C.boss) return;
        C.W.starCoin = { x: e.x, y: e.y - 6, vy: -140, landed: false, t: 0 };
        C.banner = { text: BIOMES[C.level].npc + ' DEFEATED!', sub: 'GRAB THE STAR COIN!', t: 2.2, max: 2.2, color: '#7df06a' };
      },
      onBeeDown() {},
      onStarCoin(sp, sc) {
        SFX.play('star');
        burst(C.W, sc.x, sc.y, 40, ['#ffd23f', '#fff3a0', '#ff8cc6', '#9ad0ff', '#7df06a'], 160, 1.0);
        floater(C.W, sc.x, sc.y - 14, '+1 STAR COIN', '#ffd23f');
        C.complete();
      },
      onSpiderDead(sp, cause) {
        if (C.infinite) { C.respawnT = 1.2; C.banner = { text: 'RESPAWNING...', sub: 'INFINITE HEARTS', t: 1.2, max: 1.2, color: '#9ad0ff' }; return; }
        C.phase = 'dead'; C.timer = 1.8;
        C.banner = { text: cause === 'water' ? 'SPLASH!' : cause === 'bite' ? 'BITTEN!' : 'OH NO!', sub: '', t: 1.8, max: 1.8, color: '#ff5a7a' };
      },
    };
  },
  complete() {
    this.phase = 'won'; this.timer = 2.8;
    if (this.practice) {
      SFX.play('complete');
      this.banner = { text: 'PRACTICE CLEAR!', sub: 'NICE! TRY ANOTHER LEVEL OR DIFFICULTY', t: 2.8, max: 2.8, color: '#7df06a' };
      return;
    }
    save.stars++;
    save.cleared[this.diff][this.level] = 1;
    const was = save.unlocked[this.diff];
    save.unlocked[this.diff] = Math.max(was, Math.min(4, this.level + 2));
    this.newUnlock = save.unlocked[this.diff] > was ? save.unlocked[this.diff] - 1 : -1;
    persist();
    SFX.play('complete');
    this.banner = { text: 'LEVEL CLEAR!', sub: 'STAR COINS: ' + save.stars, t: 2.8, max: 2.8, color: '#ffd23f' };
    track('round_end', { mode: 'campaign', level: this.level + 1, secs: Math.round(this.time) });
  },
  update(dt, c) {
    const W = this.W;
    if (this.phase === 'play') this.time += dt;
    W.aim = c.aim;
    W.step(dt, s => s === this.me && this.phase === 'play' ? c : NO_CONTROLS);
    // keep a couple of flies buzzing around until the spider is powered up
    if (this.phase === 'play') W.maybeSpawnHeart(dt, this.time);
    if (this.me.flies < 5 && this.phase === 'play') {
      const active = W.flies.filter(f => !f.heart).length;
      if (active < Math.min(3, 5 - this.me.flies)) { this.flyT -= dt; if (this.flyT <= 0) { W.spawnFly(); this.flyT = 1.4; } }
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    if (this.phase === 'dead') { this.timer -= dt; if (this.timer <= 0) { setScene('gameover'); SFX.play('gameover'); } }
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        const s = W.L.spawns[0], old = this.me;
        const nb = new SpiderBody('me', s.x, s.y, { style: save.style, name: 'YOU', facing: 1 });
        nb.flies = old.flies; nb.invuln = 2;
        W.spiders[W.spiders.indexOf(old)] = nb; this.me = nb;
        burst(W, s.x, s.y, 16, ['#9ad0ff', '#ffffff'], 80, 0.5);
      }
    }
    if (this.phase === 'won') {
      this.timer -= dt;
      if (this.timer <= 0 && this.practice) { setScene('practice'); return; }
      if (this.timer <= 0) {
        if (this.level === 3) { setScene('ending'); SFX.play('complete'); }
        else { Overworld.enter(this.level, this.newUnlock); setScene('overworld'); }
      }
    }
  },
  statusLine() {
    const me = this.me, boss = this.boss, npc = BIOMES[this.level].npc;
    if (!me.alive) return ['OH NO!', '#ff5a7a'];
    if (this.phase === 'won') return ['LEVEL CLEAR!', '#7df06a'];
    if (this.W.starCoin) return ['GRAB THE STAR COIN!', '#ffd23f'];
    if (me.stunT > 0) return ['WEBBED! MASH BUTTONS TO BREAK FREE!', Math.floor(T * 6) % 2 ? '#ffffff' : '#ff5a7a'];
    if (boss.frozenT > 0) return [npc + ' STUCK! BITE IT!', Math.floor(T * 5) % 2 ? '#ffffff' : '#ffd23f'];
    if (me.powered) return ['READY TO FIGHT! WEB THE ' + npc, Math.floor(T * 3) % 2 ? '#ffd23f' : '#ffffff'];
    return ['CATCH 5 GOLDEN FLIES', '#ffffff'];
  },
  draw() {
    this.W.draw();
    drawCampaignHUD(this);
  },
};

function drawCampaignHUD(C) {
  const me = C.me;
  panel(4, 4, 136, 40);
  for (let i = 0; i < me.maxHp; i++) drawHeart(10 + i * 18, 10, 2, i < me.hp);
  for (let i = 0; i < 5; i++) {
    const fx = 14 + i * 14, fy = 34;
    if (i < me.flies) { pxCircle(ctx, fx, fy, 4, '#ffd23f'); ctx.fillStyle = '#fff3a0'; ctx.fillRect(fx - 1, fy - 2, 1, 1); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(fx - 3, fy - 5, 2, 2); ctx.fillRect(fx + 1, fy - 5, 2, 2); }
    else { pxCircle(ctx, fx, fy, 3, '#3b2b63'); }
  }
  if (me.powered) { const blink = Math.floor(T * 4) % 2 === 0; ctx.fillStyle = blink ? '#ffd23f' : '#f2b233'; ctx.fillRect(84, 28, 52, 12); drawText('POWER', 110, 31, 1, '#2a1a00', 'center'); }
  else drawText(me.flies + '/5', 86, 31, 1, '#ffd23f', 'left', '#140c26');
  // status + level info
  const [msg, col] = C.statusLine();
  const mw = textWidth(msg) + 12;
  let mx = BW / 2;
  if (mx - mw / 2 < 146) mx = 146 + mw / 2;
  panel(Math.round(mx - mw / 2), 6, mw, 13);
  drawText(msg, mx, 9, 1, col, 'center');
  const D = DIFFS[C.diff];
  drawText((C.practice ? 'PRACTICE ' : '') + 'L' + (C.level + 1) + ' ' + BIOMES[C.level].name + ' - ' + D.name + (C.infinite ? ' - INF HEARTS' : '') + '  ' + fmtTime(C.time), mx, 23, 1, D.color, 'center', '#140c26');
  // star tally
  drawStarShape(ctx, BW - 62, 16, 6, '#ffd23f', 0);
  drawText('x' + save.stars, BW - 54, 13, 1, '#ffd23f', 'left', '#140c26');
  drawPauseButton();
  drawBanner(C.banner);
}

/* =====================================================================
   OVERWORLD - Super Mario World style map, fog of war over locked biomes
   ===================================================================== */
const Overworld = {
  nodes: [
    { x: 92,  y: 262, biome: 0 },
    { x: 226, y: 170, biome: 1 },
    { x: 400, y: 236, biome: 2 },
    { x: 548, y: 122, biome: 3 },
  ],
  cur: 0, tok: { x: 92, y: 262 }, walk: null, unlockAnim: null, map: null, mapKey: '', fog: null, puffs: [],
  enter(fromLevel, newUnlock) {
    this.diff = save.diff;
    if (fromLevel !== undefined && fromLevel >= 0) this.cur = fromLevel;
    this.cur = Math.min(this.cur, save.unlocked[this.diff] - 1);
    const n = this.nodes[this.cur];
    this.tok = { x: n.x, y: n.y }; this.walk = null;
    this.unlockAnim = newUnlock >= 0 && newUnlock !== undefined ? { node: newUnlock, t: 0 } : null;
    if (this.unlockAnim) SFX.play('unlock');
    if (!this.puffs.length) { const r = rng(99); for (let i = 0; i < 40; i++) this.puffs.push({ x: r() * REF_W, y: r() * REF_H, r: 18 + r() * 30, s: 3 + r() * 6, ph: r() * TAU }); }
  },
  unlockedCount() { return save.unlocked[this.diff]; },
  moveTo(i) {
    if (i < 0 || i >= this.nodes.length || i >= this.unlockedCount() || this.walk) return;
    if (i === this.cur) return;
    this.walk = { from: this.cur, to: i, t: 0 };
    SFX.play('step');
  },
  update(dt, nav) {
    if (this.unlockAnim) { this.unlockAnim.t += dt; if (this.unlockAnim.t > 2.2) { const nd = this.unlockAnim.node; this.unlockAnim = null; this.moveTo(nd); } }
    if (this.walk) {
      const a = this.nodes[this.walk.from], b = this.nodes[this.walk.to];
      const len = dist(a.x, a.y, b.x, b.y) * Math.abs(this.walk.to - this.walk.from);
      this.walk.t += dt * 140 / Math.max(1, len);
      const k = clamp(this.walk.t, 0, 1);
      const pathPt = this.pathPoint(this.walk.from, this.walk.to, k);
      this.tok.x = pathPt.x; this.tok.y = pathPt.y;
      if (Math.floor(this.walk.t * 12) !== Math.floor((this.walk.t - dt * 140 / Math.max(1, len)) * 12)) SFX.play('step');
      if (k >= 1) { this.cur = this.walk.to; this.walk = null; }
      return;
    }
    if (nav.right || nav.up) this.moveTo(this.cur + 1);
    if (nav.left || nav.down) this.moveTo(this.cur - 1);
    if (nav.tabL) this.setDiff(this.diff - 1);
    if (nav.tabR) this.setDiff(this.diff + 1);
  },
  setDiff(d) {
    d = clamp(d, 0, 3);
    if (d === this.diff) return;
    this.diff = save.diff = d; persist();
    this.cur = Math.min(this.cur, this.unlockedCount() - 1);
    const n = this.nodes[this.cur]; this.tok = { x: n.x, y: n.y };
    SFX.play('select');
  },
  pathPoint(from, to, k) {
    // walk along consecutive node segments with a gentle arc
    const dir = to > from ? 1 : -1, segs = Math.abs(to - from);
    const f = k * segs, i = Math.min(segs - 1, Math.floor(f)), lk = f - i;
    const a = this.nodes[from + dir * i], b = this.nodes[from + dir * (i + 1)];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 24;
    const u = 1 - lk;
    return { x: u * u * a.x + 2 * u * lk * mx + lk * lk * b.x, y: u * u * a.y + 2 * u * lk * my + lk * lk * b.y };
  },
  buildMap() {
    const key = BW + 'x' + BH;
    if (this.map && this.mapKey === key) return;
    this.mapKey = key;
    this.map = makeCanvas(BW, BH);
    const g = this.map.getContext('2d');
    // ocean
    g.fillStyle = '#2a7fc9'; g.fillRect(0, 0, BW, BH);
    g.fillStyle = '#3b97d9'; for (let y = 0; y < BH; y += 12) g.fillRect(0, y, BW, 2);
    const r = rng(1234);
    g.fillStyle = '#9ad8ff'; for (let i = 0; i < 120; i++) g.fillRect(Math.floor(r() * BW), Math.floor(r() * BH), 3, 1);
    g.save(); g.translate(OX, OY);
    // landmass
    const land = [[60, 270, 70], [140, 240, 80], [230, 180, 85], [320, 210, 70], [400, 240, 70], [480, 170, 70], [560, 120, 70], [600, 200, 50], [300, 290, 60], [180, 300, 60]];
    land.forEach(([x, y, rr]) => pxCircle(g, x, y + 4, rr + 4, '#e8d29a'));
    land.forEach(([x, y, rr]) => pxCircle(g, x, y, rr, '#5fbf52'));
    // biome regions
    pxCircle(g, 92, 262, 48, '#4fae45'); // field
    pxCircle(g, 226, 170, 50, '#8fd474'); for (let i = 0; i < 60; i++) { g.fillStyle = pick(r, ['#ff7ab8', '#ffe45c', '#ffffff', '#c58cff']); const a = r() * TAU, d = r() * 44; g.fillRect(Math.round(226 + Math.cos(a) * d), Math.round(170 + Math.sin(a) * d), 2, 2); }
    pxCircle(g, 400, 236, 50, '#2a7fc9'); pxCircle(g, 400, 236, 36, '#f3dca0'); pxCircle(g, 400, 232, 30, '#e8c880');
    pxCircle(g, 548, 122, 50, '#d6a540'); for (let i = 0; i < 80; i++) { const a = r() * TAU, d = r() * 46; g.fillStyle = r() < 0.5 ? '#f0cf6a' : '#a87420'; g.fillRect(Math.round(548 + Math.cos(a) * d), Math.round(122 + Math.sin(a) * d), 1, 3); }
    // decorations: trees, hive, palm, barn
    for (const [tx, ty] of [[60, 236], [120, 290], [70, 300], [130, 240]]) { g.fillStyle = '#7a4a28'; g.fillRect(tx - 1, ty, 3, 8); pxCircle(g, tx, ty - 2, 7, '#2f8f3a'); pxCircle(g, tx - 2, ty - 4, 4, '#5fd24b'); }
    g.fillStyle = '#7a4a28'; g.fillRect(196, 132, 3, 22); pxCircle(g, 197, 128, 12, '#2f8f3a'); pxEllipse(g, 206, 146, 4, 6, '#e0a542');
    g.fillStyle = '#a0703a'; g.fillRect(420, 206, 3, 22); for (let i = -10; i <= 10; i++) { g.fillStyle = '#3fae3a'; g.fillRect(421 + i, 204 + Math.abs(i) / 3, 1, 2); }
    g.fillStyle = '#a3322a'; g.fillRect(560, 96, 30, 22); g.fillStyle = '#7a231c'; for (let i = 0; i < 12; i++) g.fillRect(560 + i, 96 - i, 30 - i * 2, 1);
    g.fillStyle = '#e8dcc8'; g.fillRect(571, 106, 8, 12);
    g.fillStyle = '#8f9aa6'; g.fillRect(594, 90, 8, 28); pxCircle(g, 598, 90, 4, '#b4bfca');
    // paths
    for (let i = 0; i < this.nodes.length - 1; i++) {
      for (let k = 0; k <= 1.0001; k += 0.04) { const p = this.pathPoint(i, i + 1, k); g.fillStyle = '#5a3a1f'; g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 1, 4, 4); g.fillStyle = '#f3e3b0'; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2); }
    }
    g.restore();
  },
  drawFog() {
    const fw = Math.ceil(BW / 2), fh = Math.ceil(BH / 2);
    if (!this.fog || this.fog.width !== fw || this.fog.height !== fh) this.fog = makeCanvas(fw, fh);
    const g = this.fog.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, fw, fh);
    g.fillStyle = 'rgba(40,30,70,0.82)'; g.fillRect(0, 0, fw, fh);
    // drifting cloud puffs give the fog texture
    for (const p of this.puffs) {
      const x = ((p.x + T * p.s) % (REF_W + 80)) - 40, y = p.y + Math.sin(T * 0.4 + p.ph) * 6;
      const gr = g.createRadialGradient((OX + x) / 2, (OY + y) / 2, 0, (OX + x) / 2, (OY + y) / 2, p.r / 2);
      gr.addColorStop(0, 'rgba(200,190,235,0.35)'); gr.addColorStop(1, 'rgba(200,190,235,0)');
      g.fillStyle = gr; g.fillRect((OX + x - p.r) / 2, (OY + y - p.r) / 2, p.r, p.r);
    }
    // carve soft holes around unlocked nodes and the revealed paths
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, rr, a = 1) => {
      const gr = g.createRadialGradient((OX + x) / 2, (OY + y) / 2, rr * 0.25, (OX + x) / 2, (OY + y) / 2, rr / 2);
      gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc((OX + x) / 2, (OY + y) / 2, rr / 2, 0, TAU); g.fill();
    };
    const un = this.unlockedCount();
    for (let i = 0; i < this.nodes.length; i++) {
      let a = i < un ? 1 : 0;
      if (this.unlockAnim && i === this.unlockAnim.node) a = smooth01(this.unlockAnim.t / 1.6);
      if (a > 0) hole(this.nodes[i].x, this.nodes[i].y, 150 * (0.6 + 0.4 * a), a);
      if (i < this.nodes.length - 1 && a > 0) {
        const na = i + 1 < un ? 1 : (this.unlockAnim && this.unlockAnim.node === i + 1 ? smooth01(this.unlockAnim.t / 1.6) : 0.35);
        for (let k = 0.15; k < 0.9; k += 0.15) { const p = this.pathPoint(i, i + 1, k); hole(p.x, p.y, 70, na); }
      }
    }
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fog, 0, 0, BW, BH);
    ctx.restore(); ctx.imageSmoothingEnabled = false;
  },
  buttons() {
    const y = BH - 24;
    return [
      { label: '<', x: BW / 2 - 108, y, w: 24, h: 20, action: () => this.setDiff(this.diff - 1) },
      { label: '>', x: BW / 2 + 108, y, w: 24, h: 20, action: () => this.setDiff(this.diff + 1) },
      { label: 'PLAY', x: BW - 70, y, w: 100, h: 22, action: () => this.play() },
      { label: 'BACK', x: 56, y, w: 84, h: 22, action: () => setScene('menu') },
    ];
  },
  play() { if (this.walk || this.unlockAnim) return; SFX.play('confirm'); Campaign.start(this.cur, this.diff); setScene('level'); },
  tapNode(p) {
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (dist(p.x - OX, p.y - OY, n.x, n.y) < 26) { if (i === this.cur && !this.walk) this.play(); else this.moveTo(i); return true; }
    }
    return false;
  },
  draw() {
    this.buildMap();
    ctx.drawImage(this.map, 0, 0);
    ctx.save(); ctx.translate(OX, OY);
    const un = this.unlockedCount();
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i], open = i < un, clr = save.cleared[this.diff][i];
      pxCircle(ctx, n.x, n.y + 2, 11, '#140c26');
      pxCircle(ctx, n.x, n.y, 10, open ? (clr ? '#ffd23f' : '#ff5a7a') : '#5a5a6a');
      pxCircle(ctx, n.x, n.y - 1, 7, open ? (clr ? '#fff3a0' : '#ff9aac') : '#7a7a8a');
      drawText(String(i + 1), n.x, n.y - 4, 1, '#140c26', 'center');
      if (clr) drawStarShape(ctx, n.x + 10, n.y - 10, 5, '#ffd23f', T);
    }
    // the player's spider token
    const bob = this.walk ? Math.abs(Math.sin(T * 12)) * 2 : Math.sin(T * 3);
    drawSpider(this.tok.x, this.tok.y - 12 - bob, 0, this.walk && this.walk.to < this.walk.from ? -1 : 1, this.walk ? T * 30 : 0, { style: save.style, gear: T * 3 });
    ctx.restore();
    this.drawFog();
    // node labels on top of the fog
    ctx.save(); ctx.translate(OX, OY);
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i], open = i < un;
      drawText(open ? BIOMES[i].name : '???', n.x, n.y + 16, 1, open ? '#ffffff' : '#9a90c0', 'center', '#140c26');
    }
    ctx.restore();
    // HUD
    panel(0, 0, BW, 30, 0.7);
    drawText('WORLD MAP', 10, 8, 2, '#ffd23f', 'left', '#140c26');
    drawStarShape(ctx, BW - 60, 15, 7, '#ffd23f', 0);
    drawText('x ' + save.stars, BW - 50, 11, 1, '#ffd23f', 'left', '#140c26');
    const cn = this.nodes[this.cur];
    if (!this.walk) {
      const B = BIOMES[this.cur], cl = save.cleared[this.diff][this.cur];
      const lines = ['LEVEL ' + (this.cur + 1) + ': ' + B.name, 'ENEMY: ' + B.npc + (cl ? '   CLEARED *' : '')];
      const pw = 190, px = clamp(OX + cn.x - pw / 2, 4, BW - pw - 4), py = OY + cn.y - 66;
      panel(px, py, pw, 28, 0.85);
      drawText(lines[0], px + pw / 2, py + 5, 1, '#ffd23f', 'center'); drawText(lines[1], px + pw / 2, py + 16, 1, '#ffffff', 'center');
    }
    panel(0, BH - 38, BW, 38, 0.7);
    const D = DIFFS[this.diff];
    drawText('DIFFICULTY', BW / 2, BH - 34, 1, '#bba8ff', 'center');
    drawText(D.name, BW / 2, BH - 24, 2, D.color, 'center', '#140c26');
    drawUIButtons(this.buttons(), -1);
    const hint = Input.last === 'touch' ? 'TAP A LEVEL TO TRAVEL - TAP AGAIN TO PLAY' : Input.last === 'gamepad' ? 'D-PAD MOVE  A PLAY  LB/RB DIFFICULTY  B BACK' : 'ARROWS MOVE  ENTER PLAY  Q/E DIFFICULTY  ESC BACK';
    drawText(hint, BW / 2, 34, 1, 'rgba(255,255,255,0.85)', 'center', '#140c26');
    if (this.unlockAnim) drawBanner({ text: 'NEW AREA UNLOCKED!', sub: BIOMES[this.unlockAnim.node].name, t: 2.2 - this.unlockAnim.t, max: 2.2, color: '#7df06a' });
  },
};
