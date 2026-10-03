/* =====================================================================
   66_ANTS - level 6: the ant colony
   ---------------------------------------------------------------------
   Nest   : invisible controller. Ants trickle out of the ant hill slowly,
            then faster and faster; every ant that comes out raises the
            sand. When a spider gets 5 flies the nest bursts: a swarm,
            flying ants and the Queen pour out until the Queen falls.
   Ant    : wanders over every surface; locks on and bites when a spider
            gets close. One web kills it (no power-up needed).
   FlyingAnt: flies around the hill, dives at nearby spiders. One web.
   Queen  : big crowned ant. Web her (needs 5 flies), then bite her.
   ===================================================================== */
const allSurfaces = p => p.y > WORLD_TOP + 2;

class Ant extends Enemy {
  constructor(x, y, opts = {}) {
    super('ant', x, y);
    this.r = 5; this.hitR = 10; this.state = 'air'; this.plat = null; this.s = 0; this.nx = 0; this.ny = -1;
    this.vx = opts.vx !== undefined ? opts.vx : (Math.random() - 0.5) * 140; this.vy = opts.vy !== undefined ? opts.vy : -150 - Math.random() * 60;
    this.walk = 0; this.wanderSign = Math.random() < 0.5 ? -1 : 1; this.locked = false; this.calmT = 0.8;
    this.attackCD = 0.6; this.jumpCD = 1 + Math.random(); this.stallT = 0; this.base = 30; this.chase = 62; this.lockR = 58;
  }
  onWeb(W) { this.squash(W, true); return 'kill'; }
  biteable() { return false; }
  squash(W, byWeb) {
    if (!this.alive) return;
    this.alive = false;
    burst(W, this.x, this.y, 10, this.burstColors(), 70, 0.45);
    if (byWeb) { SFX.play('beedown'); floater(W, this.x, this.y - 10, 'SPLAT!', '#ffffff'); }
  }
  burstColors() { return ['#8a2a10', '#c8502a', '#ffffff', '#3a0e06']; }
  update(dt, W) {
    if (this.mirror) { this.glide(dt); return; }
    const D = W.D;
    this.attackCD -= dt; this.jumpCD -= dt; this.calmT -= dt;
    if (this.plat && !PLATS.includes(this.plat)) { this.state = 'air'; this.plat = null; }   // buried under the sand
    const t = W.nearestTarget(this.x, this.y);
    const d = t ? dist(this.x, this.y, t.x, t.y) : 999;
    if (!this.locked && this.calmT <= 0 && t && d < this.lockR * Math.sqrt(D.aggro) && lineOfSight(this.x, this.y, t.x, t.y)) { this.locked = true; this.lockFlash = 0.4; }
    if (this.locked && (d > 160 || !t)) this.locked = false;
    this.lockFlash = Math.max(0, (this.lockFlash || 0) - dt);
    if (this.state === 'air') crawlerFly(this, dt, null, W);
    else if (!this.tickFrozen(dt, W)) {
      let sign = this.wanderSign, speed = this.base * D.speed;
      if (this.locked && t) {
        const g = greedyDir(this, t.x, t.y, allSurfaces);
        sign = g.sign; speed = this.chase * D.speed;
        if (!sign || this.stallT > 0.35) {
          if (this.jumpCD <= 0 && d < 140) { jumpToward(this, t.x, t.y - 4, 300, 0.3, 0.7, 240); this.jumpCD = (1.6 + Math.random()) / D.aggro; this.stallT = 0; }
        }
      } else if (Math.random() < dt * 0.25) this.wanderSign *= -1;
      if (this.state === 'stuck' && sign) {
        const res = crawlMove(this, sign * speed * dt, allSurfaces);
        if (res === 'blocked') { this.stallT += dt; if (!this.locked) this.wanderSign *= -1; }
        else { this.stallT = Math.max(0, this.stallT - dt); this.facing = sign; this.walk += speed * dt; }
      }
      if (this.state === 'stuck' && !this.locked && this.jumpCD <= 0 && Math.random() < dt * 0.08) {   // the odd random hop
        jumpToward(this, this.x + (Math.random() - 0.5) * 120, this.y - 40 - Math.random() * 40, 260, 0.35, 0.7, 200); this.jumpCD = 2.5;
      }
    }
    if (this.state === 'stuck') syncStuck(this);
    const target = this.state === 'stuck' ? Math.atan2(this.ny, this.nx) + Math.PI / 2 : Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.4;
    this.drawAngle += angDiff(this.drawAngle, target) * Math.min(1, dt * 14);
    if (this.frozenT > 0 || !t) return;
    // bite on contact, then back off for a moment
    if (this.locked && this.attackCD <= 0 && d < this.r + t.r + 3) {
      W.hurt(t, 'hit', this); this.attackCD = 1.5; this.locked = false; this.calmT = 1.6; this.wanderSign = -(Math.sign(t.x - this.x) || 1);
    }
  }
  draw(W) {
    if (!this.alive) return;
    drawAnt(this.x, this.y, this.drawAngle, this.facing, this.walk, { angry: this.locked, flash: this.lockFlash > 0, hell: W.D.hell, air: this.state === 'air' });
  }
}

class Queen extends Ant {
  constructor(x, y) {
    super(x, y, { vx: (Math.random() - 0.5) * 80, vy: -240 });
    this.type = 'queen'; this.r = 9; this.hitR = 16; this.base = 40; this.chase = 70; this.lockR = 110; this.breathT = 0;
    this.hopT = 3;
  }
  onWeb(W, S) { return Enemy.prototype.onWeb.call(this, W, S); }
  biteable() { return this.frozenT > 0; }
  cancelAttacks() { this.breathT = 0; }
  defeat(W, by) { Enemy.prototype.defeat.call(this, W, by); }
  burstColors() { return ['#8a2a10', '#ffd23f', '#ff8a00', '#ffffff']; }
  update(dt, W) {
    if (this.mirror) { this.glide(dt); return; }
    // she darts around the arena now and then so the fight stays lively
    this.hopT -= dt;
    if (this.state === 'stuck' && this.frozenT <= 0 && this.hopT <= 0 && !this.locked) {
      this.hopT = (3 + Math.random() * 3) / W.D.aggro;
      jumpToward(this, 80 + Math.random() * 480, 60 + Math.random() * 140, 380, 0.4, 0.9, 260);
    }
    super.update(dt, W);
    if (this.frozenT > 0) return;
    const t = W.nearestTarget(this.x, this.y);
    if (t && this.state === 'stuck') { const h = headFrom(this, 12); hellBreath(this, W, dt, h.x, h.y, Math.atan2(t.y - h.y, t.x - h.x), t); }
  }
  draw(W) {
    if (!this.alive) return;
    drawAnt(this.x, this.y, this.drawAngle, this.facing, this.walk, { queen: true, angry: this.locked, hell: W.D.hell, frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5, air: this.state === 'air', fire: this.breathT > 0 });
    this.drawFreezeBar(W);
  }
}

class FlyingAnt extends Bee {
  constructor(x, y, home) {
    super(x, y, null);
    this.type = 'fant'; this.home = home; this.seeR = 100; this.spd = 70; this.vy = -90;
  }
  onWeb(W, S) { this.knock(W, S, false); return 'knock'; }
  draw(W) {
    if (!this.alive) return;
    drawAnt(this.x, this.y, this.state === 'fall' ? T * 9 : 0, this.facing, T * 40, { wings: this.state !== 'fall', angry: this.state === 'chase', hell: W.D.hell, air: true });
  }
}

/* ---------- The nest: spawns the colony and raises the sand ---------- */
class Nest extends Enemy {
  constructor(W) {
    super('nest', W.L.enemySpawn.x, W.L.enemySpawn.y);
    const L = W.L, D = W.D;
    this.mound = L.mound; this.ground = L.plats.find(p => p.type === 'sand2');
    this.gBase = this.ground.y; this.gH = this.ground.h; this.mBase = this.mound.y; this.mH = this.mound.h; this.spawnBase = L.spawns.map(s => s.y);
    this.phase = 'calm'; this.t = 0; this.swarmT = 0; this.spawnT = 3; this.flyT = 0; this.rise = 0; this.riseTarget = 0; this.queen = null;
    this.hellK = D.hell ? 1.4 : 1;
    this.maxRise = 118;
  }
  webbable() { return false; }
  biteable() { return false; }
  hole() { return { x: this.mound.x + this.mound.w / 2, y: this.mound.y - 2 }; }
  count(type) { let n = 0; for (const e of this.W.enemies) if (e.alive && e.type === type) n++; return n; }
  emitAnt(W) {
    const h = this.hole();
    W.enemies.push(new Ant(h.x + (Math.random() - 0.5) * 6, h.y - 4));
    burst(W, h.x, h.y, 5, ['#e8b27a', '#c99560'], 50, 0.4, 200, 1);
    this.riseTarget = Math.min(this.maxRise, this.riseTarget + (this.phase === 'calm' ? 1.6 : 0.9));
  }
  update(dt, W) {
    this.W = W;
    const D = W.D;
    this.t += dt;
    if (this.mound.burstT > 0) this.mound.burstT -= dt;
    if (this.phase === 'calm') {
      // trickle: slow at first, steadily quicker
      const interval = Math.max(1.4, 6.5 - this.t * 0.07) / Math.sqrt(D.aggro);
      const cap = Math.min(9, 3 + Math.floor(this.t / 18)) + (D.hell ? 3 : 0);
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = interval; if (this.count('ant') < cap) this.emitAnt(W); }
      const best = Math.max(0, ...W.spiders.filter(s => s.alive).map(s => s.flies));
      this.mound.tremble = best >= 4;
      if (W.spiders.some(s => s.alive && s.powered)) this.burst(W);
    } else if (this.phase === 'swarm') {
      this.swarmT += dt;
      const interval = Math.max(0.3, 1.1 - this.swarmT * 0.02) / Math.sqrt(D.aggro);
      const cap = Math.round((D.speed < 0.9 ? 11 : 15) * this.hellK + Math.min(8, this.swarmT / 6));
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = interval; if (this.count('ant') < cap) this.emitAnt(W); }
      this.flyT -= dt;
      if (this.flyT <= 0) { this.flyT = 5; if (this.count('fant') < this.fliers) { const h = this.hole(); W.enemies.push(new FlyingAnt(h.x, h.y - 8, { x: h.x, y: 130 })); } }
      this.riseTarget = Math.min(this.maxRise, this.riseTarget + 0.5 * dt);   // the swarm keeps digging
      if (this.queen && !this.queen.alive) this.finish(W);
    } else if (this.phase === 'done') {
      for (const e of W.enemies) if (e.alive && e.poofT !== undefined) { e.poofT -= dt; if (e.poofT <= 0) { e.alive = false; burst(W, e.x, e.y, 6, ['#e8b27a', '#8a2a10'], 50, 0.4); } }
    }
    // the sand creeps up as the colony digs out
    const prev = this.rise;
    this.rise = approach(this.rise, this.riseTarget, 7 * dt);
    const dy = -(this.rise - prev);
    this.ground.y = this.gBase - this.rise; this.ground.h = this.gH + this.rise; this.ground.dy = dy;
    this.mound.y = this.mBase - this.rise; this.mound.dy = dy;
    W.L.spawns.forEach((s, i) => { s.y = this.spawnBase[i] - this.rise; });
    if (dy) this.buryCheck(W);
    if (this.phase === 'swarm' && Math.random() < dt * 8) { const h = this.hole(); W.particles.push({ x: h.x + (Math.random() - 0.5) * 14, y: h.y, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, life: 0.6, max: 0.6, color: '#e8c890', size: 1, grav: 120 }); }
  }
  buryCheck(W) {
    const top = this.ground.y;
    for (let i = PLATS.length - 1; i >= 0; i--) {
      const p = PLATS[i];
      if (!p.buriable || top > p.y + p.h * 0.45) continue;
      PLATS.splice(i, 1);
      burst(W, p.x + p.w / 2, top, 10, ['#e8b27a', '#c99560'], 50, 0.5);
      for (const s of W.spiders) {
        if (s.plat === p) { s.state = 'air'; s.plat = null; s.vx = 0; s.vy = -40; }
        if (s.rope && s.rope.plat === p) { s.state = 'air'; s.rope = null; }
      }
      for (const e of W.enemies) if (e.plat === p) { e.state = 'air'; e.plat = null; }
    }
  }
  burst(W) {
    this.phase = 'swarm'; this.mound.burstT = 1.5; this.mound.open = true; this.mound.tremble = false; this.spawnT = 0.6;
    const D = W.D, h = this.hole();
    SFX.play('shriek'); shake(0.6, 6);
    burst(W, h.x, h.y, 50, ['#e8b27a', '#c99560', '#f6e0a8', '#8a5a2a'], 180, 0.9, 260);
    const n = D.speed < 0.9 ? 6 : D.hell ? 12 : 9;
    for (let i = 0; i < n; i++) W.enemies.push(new Ant(h.x + (Math.random() - 0.5) * 20, h.y - 6, { vx: (Math.random() - 0.5) * 260, vy: -200 - Math.random() * 120 }));
    this.fliers = D.speed < 0.9 ? 2 : D.hell ? 5 : 3;
    for (let i = 0; i < this.fliers; i++) { const f = new FlyingAnt(h.x + (i - 1) * 10, h.y - 10, { x: h.x, y: 130 }); f.vx = (Math.random() - 0.5) * 120; W.enemies.push(f); }
    this.queen = new Queen(h.x, h.y - 10);
    W.enemies.push(this.queen);
    this.riseTarget = Math.min(this.maxRise, this.riseTarget + 10);
    if (W.rules.onBossSpawn) W.rules.onBossSpawn(this.queen);
  }
  finish(W) {
    this.phase = 'done';
    // without their queen the colony scatters
    let k = 0;
    for (const e of W.enemies) if (e.alive && (e.type === 'ant' || e.type === 'fant')) e.poofT = 0.4 + 0.12 * k++;
  }
  draw() {}
}

/* Ant sprite: head, thorax, big abdomen, six scurrying legs. o.queen adds a crown, o.wings flutters */
function drawAnt(x, y, ang, facing, walk, o) {
  const q = !!o.queen, s = q ? 2 : 1;
  ctx.save(); ctx.translate(Math.round(x + (o.shiver ? Math.sin(T * 60) : 0)), Math.round(y)); ctx.rotate(ang); ctx.scale(facing * s, s);
  const dark = o.hell ? '#3a0a06' : q ? '#5a1a0a' : '#4a1408', mid = o.hell ? '#8a1a10' : q ? '#a0381a' : '#8a2a10', hi = q ? '#e0703a' : '#c8502a';
  // legs (drawn under the body), alternating tripod gait
  ctx.fillStyle = dark;
  for (let i = 0; i < 3; i++) {
    const ph = Math.sin(walk * 0.5 + i * 2.1) * (o.air ? 0.4 : 1.6), lx = -1 + i * 2;
    ctx.fillRect(Math.round(lx + ph), 1, 1, 3); ctx.fillRect(Math.round(lx - ph * 0.6) - 1, 3, 2, 1);
  }
  if (o.wings) { const f = Math.sin(T * 60) > 0; ctx.fillStyle = 'rgba(220,235,255,0.75)'; ctx.fillRect(-4, f ? -6 : -4, 5, 2); ctx.fillRect(-1, f ? -7 : -5, 5, 2); }
  // abdomen, thorax, head
  pxEllipse(ctx, -5, -1, q ? 4 : 3, q ? 3 : 2, dark);
  pxEllipse(ctx, -5, -2, q ? 3 : 2, q ? 2 : 1, mid);
  if (q) { ctx.fillStyle = '#d6a540'; ctx.fillRect(-8, -1, 1, 3); ctx.fillRect(-6, -1, 1, 3); ctx.fillRect(-4, -1, 1, 3); }
  ctx.fillStyle = dark; ctx.fillRect(-1, -2, 3, 2); ctx.fillStyle = mid; ctx.fillRect(-1, -2, 2, 1);
  pxCircle(ctx, 3, -2, 1.5, dark); ctx.fillStyle = hi; ctx.fillRect(3, -3, 1, 1);
  ctx.fillStyle = o.angry || o.flash ? '#ff3b3b' : '#ffd27a'; ctx.fillRect(4, -2, 1, 1);
  // antennae + mandibles
  ctx.fillStyle = dark; ctx.fillRect(4, -5, 1, 2); ctx.fillRect(5, -6, 1, 1); ctx.fillRect(2, -5, 1, 2); ctx.fillRect(1, -6, 1, 1);
  if (o.angry) { ctx.fillStyle = '#ffe6c8'; ctx.fillRect(5, -1, 1, 1); }
  if (q) { // crown
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(1, -5, 5, 1); ctx.fillRect(1, -7, 1, 2); ctx.fillRect(3, -8, 1, 3); ctx.fillRect(5, -7, 1, 2);
    ctx.fillStyle = '#ff2d4a'; ctx.fillRect(3, -6, 1, 1);
  }
  ctx.restore();
  if (o.frozen) { ctx.globalAlpha = 0.6; pxCircle(ctx, x, y - 2, q ? 14 : 7, '#ffffff'); ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 12, y - 8); ctx.lineTo(x + 12, y + 4); ctx.moveTo(x - 10, y + 4); ctx.lineTo(x + 11, y - 9); ctx.stroke(); }
  if (o.fire && Math.random() < 0.3) { ctx.fillStyle = '#ffe45c'; ctx.fillRect(Math.round(x + facing * 10), Math.round(y - 4), 2, 2); }
}
