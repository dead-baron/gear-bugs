/* =====================================================================
   65_LONGLEGS - level 5 boss: a mechanical daddy long legs
   ---------------------------------------------------------------------
   Phase 1 (legs): the round body hovers on long telescoping legs that
   plant on any surface (floor, walls, ceiling, platforms) and re-plant as
   it travels, so it can cross the factory quickly. It stalks slowly and
   only chases and stabs with a leg when a spider gets close.
   To beat it: catch 5 flies, web a leg (it locks in place), then bite
   the leg to tear it off. Repeat for every leg.
   Phase 2 (ball): with no legs left the body drops and rolls, bounces
   and jumps at you. Web it, then bite it like any other creature.
   ===================================================================== */
const LL = { REACH: 230, HIP: 7, STRIKE_RANGE: 150, AGGRO: 120, BALL_R: 11 };

class LongLegs extends Enemy {
  constructor(x, y, D, opts = {}) {
    super('dll', x, y);
    this.r = 11; this.hitR = 14; this.phase = 'legs';
    this.vx = 0; this.vy = 0; this.mode = 'stalk'; this.bootT = 1.8;
    this.relocT = 5; this.reloc = null; this.strikeCD = 2.5; this.fireCD = 4; this.eyeA = Math.PI;
    this.rot = 0; this.jumpCD = 1.5; this.grounded = false; this.debris = []; this.hurtCD = 0;
    const n = opts.legs || (D.hell ? 8 : D.speed < 0.9 ? 4 : 6);
    this.maxLegs = n; this.legs = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i + 0.5) / n * TAU;          // spread all the way round
      const leg = { a, fx: x, fy: y + 40, plat: null, ox: 0, oy: 0, st: 'dangle', t: 0, dur: 0, sx: 0, sy: 0, tx: 0, ty: 0, tplat: null, webT: 0, retryT: 0, bx: x, by: y, hit: false };
      this.legs.push(leg);
      const spot = this.findSpot(leg.a);
      if (spot) this.plant(leg, spot);
    }
  }
  /* ---------- geometry helpers ---------- */
  hip(leg) { return { x: this.x + Math.cos(leg.a) * LL.HIP, y: this.y + Math.sin(leg.a) * LL.HIP }; }
  knee(leg) {
    const h = this.hip(leg), dx = leg.fx - h.x, dy = leg.fy - h.y, d = Math.hypot(dx, dy) || 1;
    let seg = Math.max(58, d * 0.56); if (d > seg * 2) seg = d / 2;
    const lift = Math.sqrt(Math.max(0, seg * seg - d * d / 4));
    let nx = -dy / d, ny = dx / d;
    if (Math.abs(dx) < Math.abs(dy) * 0.5) { if (Math.sign(nx || 1) !== Math.sign(Math.cos(leg.a) || 1)) { nx = -nx; ny = -ny; } }
    else if (ny > 0) { nx = -nx; ny = -ny; }
    return { x: clamp(h.x + dx / 2 + nx * lift, 10, REF_W - 10), y: clamp(h.y + dy / 2 + ny * lift, 20, GROUND_Y - 2) };
  }
  findSpot(ang) {
    for (let tries = 0; tries < 6; tries++) {
      const a = ang + (Math.random() - 0.5) * 0.6 * (1 + tries * 0.5), c = Math.cos(a), s = Math.sin(a);
      const hit = rayPlat(this.x, this.y, c, s, LL.REACH * 0.92, 4);
      if (hit && hit.t > 26) return { x: hit.x - c * 2, y: hit.y - s * 2, plat: hit.plat };
    }
    return null;
  }
  plant(leg, spot) {
    leg.fx = spot.x; leg.fy = spot.y; leg.plat = spot.plat; leg.ox = spot.x - spot.plat.x; leg.oy = spot.y - spot.plat.y;
    leg.st = 'planted'; leg.bx = this.x; leg.by = this.y;
  }
  legSegs(leg) { const h = this.hip(leg), k = this.knee(leg); return [[h.x, h.y, k.x, k.y], [k.x, k.y, leg.fx, leg.fy]]; }
  nearLeg(px, py, pad) {
    let best = null, bd = pad;
    for (const leg of this.legs) for (const [x1, y1, x2, y2] of this.legSegs(leg)) {
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1, t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
      const d = dist(x1 + dx * t, y1 + dy * t, px, py);
      if (d < bd) { bd = d; best = leg; }
    }
    return best;
  }
  /* ---------- web / bite rules ---------- */
  webbable() { return this.alive; }
  webHit(x, y) {
    if (this.phase === 'ball') return dist(x, y, this.x, this.y) < this.hitR;
    this.webLeg = this.nearLeg(x, y, 5);
    if (this.webLeg) return true;
    if (dist(x, y, this.x, this.y) < this.hitR) { this.webLeg = null; return true; }
    return false;
  }
  aimPoints() {
    if (this.phase === 'ball') return [{ x: this.x, y: this.y }];
    const out = [];
    for (const leg of this.legs) if (leg.webT <= 0) { const k = this.knee(leg); out.push(k, { x: (k.x + leg.fx) / 2, y: (k.y + leg.fy) / 2 }); }
    return out;
  }
  onWeb(W, S) {
    if (this.phase === 'ball') return super.onWeb(W, S);
    const leg = this.webLeg;
    if (!leg) {
      SFX.play('noeffect'); burst(W, this.x, this.y, 8, ['#ffffff', '#b8c0cc'], 50, 0.4);
      floater(W, this.x, this.y - 20, 'ARMORED!', '#ffb3c1'); floater(W, this.x, this.y - 8, 'WEB THE LEGS', '#ffd23f');
      return 'none';
    }
    const hx = (this.knee(leg).x + leg.fx) / 2, hy = (this.knee(leg).y + leg.fy) / 2;
    if (!S.powered) {
      SFX.play('noeffect'); burst(W, hx, hy, 8, ['#ffffff', '#b8c0cc'], 50, 0.4);
      floater(W, hx, hy - 18, 'NO EFFECT!', '#ffb3c1'); floater(W, hx, hy - 6, 'NEED 5 FLIES', '#ffd23f');
      return 'none';
    }
    const was = leg.webT > 0;
    if (leg.st !== 'planted') {   // a leg caught mid-swing slams down onto the nearest surface
      const h = this.hip(leg), a = Math.atan2(leg.fy - h.y, leg.fx - h.x);
      const hit = rayPlat(h.x, h.y, Math.cos(a), Math.sin(a), LL.REACH, 4) || rayPlat(h.x, h.y, 0, 1, LL.REACH, 4);
      if (hit) this.plant(leg, { x: hit.x - Math.cos(a) * 2, y: hit.y - 2, plat: hit.plat }); else leg.st = 'planted';
    }
    leg.webT = W.D.freeze;
    SFX.play('trap'); shake(0.15, 2);
    burst(W, hx, hy, 16, ['#ffffff', '#dfe8f5', '#ffd23f'], 90, 0.6);
    floater(W, hx, hy - 18, was ? 'MORE WEB!' : 'LEG WEBBED!', '#ffffff');
    if (!was && W.rules.onEnemyTrapped) W.rules.onEnemyTrapped(this, S);
    return 'freeze';
  }
  biteable() { return this.phase === 'ball' && this.frozenT > 0; }
  biteCheck(s) {
    if (this.phase === 'ball') return this.frozenT > 0 && dist(s.x, s.y, this.x, this.y) < s.r + this.r + 4;
    for (const leg of this.legs) {
      if (leg.webT <= 0) continue;
      for (const [x1, y1, x2, y2] of this.legSegs(leg)) if (segCircle(x1, y1, x2, y2, s.x, s.y, s.r + 4)) { this.biteLeg = leg; return true; }
    }
    return false;
  }
  defeat(W, by) {
    if (this.phase === 'legs') { if (this.biteLeg) this.tearOff(W, this.biteLeg, by); this.biteLeg = null; return; }
    super.defeat(W, by);
  }
  tearOff(W, leg, by) {
    const i = this.legs.indexOf(leg);
    if (i < 0) return;
    const [[hx, hy, kx, ky], [, , fx, fy]] = this.legSegs(leg);
    this.legs.splice(i, 1);
    for (const [x1, y1, x2, y2] of [[hx, hy, kx, ky], [kx, ky, fx, fy]]) {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      this.debris.push({ x: cx, y: cy, hx: (x2 - x1) / 2, hy: (y2 - y1) / 2, rot: 0, vr: (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 80, life: 1.6 });
    }
    SFX.play('bite'); SFX.play('snap'); shake(0.35, 5);
    burst(W, kx, ky, 22, ['#ffd23f', '#ff8a00', '#ffffff', '#9aa4b4'], 140, 0.7);
    burst(W, this.x, this.y, 10, ['#ffd23f', '#ff8a00'], 90, 0.5);
    floater(W, kx, ky - 14, 'LEG DESTROYED!', '#ffd23f');
    if (this.legs.length) {
      floater(W, this.x, this.y - 24, this.legs.length + (this.legs.length === 1 ? ' LEG LEFT' : ' LEGS LEFT'), '#ff8c42');
      this.relocT = 0; this.flee = true;    // scuttle away to regroup
      if (W.rules.onBossPhase) W.rules.onBossPhase(this, 'leg', by);
    } else { if (W.rules.onBossPhase) W.rules.onBossPhase(this, 'leg', by); this.startBall(W); }
  }
  startBall(W) {
    this.phase = 'ball'; this.r = LL.BALL_R; this.hitR = 14; this.vx = (Math.random() - 0.5) * 60; this.vy = -60; this.grounded = false; this.jumpCD = 1.4;
    SFX.play('shriek'); shake(0.4, 5);
    burst(W, this.x, this.y, 30, ['#ffd23f', '#ff8a00', '#ffffff', '#5c6270'], 150, 0.8);
    if (W.rules.onBossPhase) W.rules.onBossPhase(this, 'ball');
  }
  /* ---------- simulation ---------- */
  /* ---------- VS network mirror (host simulates, guests draw) ---------- */
  netExtra() {
    const a = [this.phase === 'ball' ? 1 : 0, Math.round(this.rot * 100), Math.round(this.eyeA * 100), (this.mode === 'chase' ? 1 : 0) | (this.bootT > 0 ? 2 : 0), this.maxLegs];
    for (const l of this.legs) a.push(Math.round(l.a * 100), nX(l.fx), nY(l.fy), (l.st === 'windup' ? 1 : 0) | (l.st === 'strike' || l.st === 'hold' ? 2 : 0), Math.round(l.webT * 10));
    return a;
  }
  applyNetExtra(a, W) {
    const ball = a[0] === 1;
    if (ball && this.phase !== 'ball') { this.phase = 'ball'; this.r = LL.BALL_R; burst(W, this.x, this.y, 30, ['#ffd23f', '#ff8a00', '#ffffff'], 150, 0.8); SFX.play('shriek'); }
    this.rot = a[1] / 100; this.eyeA = a[2] / 100; this.mode = a[3] & 1 ? 'chase' : 'stalk'; this.bootT = a[3] & 2 ? 1 : 0; this.maxLegs = a[4];
    const n = (a.length - 5) / 5;
    if (n < this.legs.length && this.netLegs) { burst(W, this.x, this.y, 18, ['#ffd23f', '#ff8a00', '#ffffff', '#9aa4b4'], 120, 0.6); SFX.play('snap'); }
    this.netLegs = true;
    while (this.legs.length > n) this.legs.pop();
    for (let i = 0; i < n; i++) {
      const k = 5 + i * 5;
      let l = this.legs[i];
      if (!l) { l = { a: 0, fx: this.x, fy: this.y, st: 'planted', webT: 0 }; this.legs.push(l); }
      l.a = a[k] / 100; l.tfx = dX(a[k + 1]); l.tfy = dY(a[k + 2]);
      l.st = a[k + 3] & 1 ? 'windup' : a[k + 3] & 2 ? 'strike' : 'planted'; l.webT = a[k + 4] / 10;
    }
  }
  update(dt, W) {
    if (this.mirror) {
      this.glide(dt);
      for (const l of this.legs) if (l.tfx !== undefined) { const k = Math.min(1, dt * 14); l.fx = lerp(l.fx, l.tfx, k); l.fy = lerp(l.fy, l.tfy, k); }
      return;
    }
    for (const d of this.debris) { d.life -= dt; d.vy += G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; if (d.y > GROUND_Y - 2) { d.y = GROUND_Y - 2; d.vy *= -0.3; d.vx *= 0.6; d.vr *= 0.5; } }
    this.debris = this.debris.filter(d => d.life > 0);
    this.hurtCD -= dt;
    if (this.phase === 'ball') this.updateBall(dt, W); else this.updateLegs(dt, W);
  }
  updateLegs(dt, W) {
    const D = W.D, t = W.nearestTarget(this.x, this.y);
    for (const leg of this.legs) if (leg.webT > 0) { leg.webT -= dt; if (leg.webT <= 0) { leg.webT = 0; floater(W, leg.fx, leg.fy - 16, 'BROKE FREE!', '#ff8c42'); SFX.play('free'); burst(W, leg.fx, leg.fy, 10, ['#ffffff', '#dfe8f5'], 70, 0.5); } }
    if (this.bootT > 0) { this.bootT -= dt; this.updateFeet(dt, W, 2); return; }
    const d = t ? dist(this.x, this.y, t.x, t.y) : 999;
    this.relocT -= dt; this.strikeCD -= dt;
    // choose where to go
    let tx = this.x, ty = this.y, speed = 0;
    if (this.reloc) {
      tx = this.reloc.x; ty = this.reloc.y; speed = 150 * D.speed;
      if (dist(this.x, this.y, tx, ty) < 12 || this.relocTime > 3) { this.reloc = null; this.relocT = (7 + Math.random() * 5) / Math.sqrt(D.aggro); }
      this.relocTime += dt;
    } else if (t) {
      const close = d < LL.AGGRO;
      this.mode = close ? 'chase' : 'stalk';
      tx = t.x; ty = clamp(t.y - (close ? 50 : 70), 40, 250);
      speed = (close ? 60 : 30) * D.speed;
      if (this.relocT <= 0 && (!close || this.flee)) this.startReloc(t);
    }
    // steer the body (it floats on its legs)
    const dx = tx - this.x, dy = ty - this.y, dd = Math.hypot(dx, dy) || 1, s = speed * Math.min(1, dd / 40);
    this.vx = approach(this.vx, dx / dd * s, 320 * dt); this.vy = approach(this.vy, dy / dd * s, 320 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    pushOut(this, this.r + 3);
    this.x = clamp(this.x, 30, REF_W - 30); this.y = clamp(this.y, 34, GROUND_Y - 30);
    // webbed legs hold the body on a leash
    for (const leg of this.legs) if (leg.webT > 0) {
      const ld = dist(this.x, this.y, leg.fx, leg.fy);
      if (ld > LL.REACH) { const k = LL.REACH / ld; this.x = leg.fx + (this.x - leg.fx) * k; this.y = leg.fy + (this.y - leg.fy) * k; }
    }
    this.updateFeet(dt, W, this.reloc ? 3 : 2);
    if (t) this.eyeA += angDiff(this.eyeA, Math.atan2(t.y - this.y, t.x - this.x)) * Math.min(1, dt * 6);
    // attacks: only once a spider is close
    if (t && this.mode === 'chase' && !this.reloc && this.strikeCD <= 0 && d < LL.STRIKE_RANGE && lineOfSight(this.x, this.y, t.x, t.y)) this.startStrike(W, t);
    this.updateStrike(dt, W);
    if (t && this.hurtCD <= 0) for (const tg of W.targets()) if (dist(this.x, this.y, tg.x, tg.y) < this.r + tg.r - 1) { W.hurt(tg, 'hit', this); this.hurtCD = 0.5; }
    this.hellShots(dt, W, t);
  }
  startReloc(t) {
    for (let tries = 0; tries < 30; tries++) {
      const x = 60 + Math.random() * (REF_W - 120), y = 50 + Math.random() * 190;
      const dp = dist(x, y, t.x, t.y);
      if (this.flee ? dp < 170 : (dp < LL.AGGRO + 30 || dp > 230)) continue;
      if (findCollision(x, y, this.r + 12)) continue;
      this.reloc = { x, y }; this.relocTime = 0; this.flee = false; SFX.play('dash');
      return;
    }
    this.relocT = 2; this.flee = false;
  }
  updateFeet(dt, W, maxStep) {
    let stepping = this.legs.filter(l => l.st === 'step').length;
    for (const leg of this.legs) {
      if (leg.st === 'planted') {
        if (leg.plat && leg.plat.move) { leg.fx = leg.plat.x + leg.ox; leg.fy = leg.plat.y + leg.oy; }
        if (leg.webT > 0) continue;
        const h = this.hip(leg), dh = dist(h.x, h.y, leg.fx, leg.fy);
        const moved = dist(this.x, this.y, leg.bx, leg.by) > 70;
        if ((moved || dh > LL.REACH || dh < 16) && (stepping < maxStep || dh > LL.REACH * 1.12)) {
          const spot = this.findSpot(leg.a);
          if (spot) { leg.st = 'step'; leg.t = 0; leg.sx = leg.fx; leg.sy = leg.fy; leg.tplat = spot.plat; leg.tox = spot.x - spot.plat.x; leg.toy = spot.y - spot.plat.y; leg.dur = clamp(dist(leg.fx, leg.fy, spot.x, spot.y) / 520, 0.12, 0.32); stepping++; }
          else if (dh > LL.REACH) leg.st = 'dangle';
        }
      } else if (leg.st === 'step') {
        leg.t += dt;
        const k = smooth01(leg.t / leg.dur), tx = leg.tplat.x + leg.tox, ty = leg.tplat.y + leg.toy;
        const lift = Math.sin(Math.PI * k) * 16;
        leg.fx = lerp(leg.sx, tx, k) + Math.cos(leg.a) * lift * 0.3; leg.fy = lerp(leg.sy, ty, k) - lift;
        if (leg.t >= leg.dur) { this.plant(leg, { x: tx, y: ty, plat: leg.tplat }); SFX.play('step', 0.06); }
      } else if (leg.st === 'dangle') {
        const h = this.hip(leg);
        leg.fx = lerp(leg.fx, h.x + Math.cos(leg.a) * 26, Math.min(1, dt * 6)); leg.fy = lerp(leg.fy, h.y + Math.sin(leg.a) * 26 + 22, Math.min(1, dt * 6));
        leg.retryT -= dt;
        if (leg.retryT <= 0) { leg.retryT = 0.25; const spot = this.findSpot(leg.a); if (spot) { leg.st = 'step'; leg.t = 0; leg.sx = leg.fx; leg.sy = leg.fy; leg.tplat = spot.plat; leg.tox = spot.x - spot.plat.x; leg.toy = spot.y - spot.plat.y; leg.dur = 0.2; } }
      }
    }
  }
  startStrike(W, t) {
    let best = null, bd = Infinity;
    for (const leg of this.legs) if (leg.webT <= 0 && (leg.st === 'planted' || leg.st === 'dangle')) { const d = dist(leg.fx, leg.fy, t.x, t.y); if (d < bd) { bd = d; best = leg; } }
    if (!best) return;
    best.st = 'windup'; best.t = 0; best.dur = 0.35 + W.D.windup; best.aim = { x: t.x, y: t.y }; best.hit = false;
    this.strikeCD = (2.4 + Math.random() * 1.2) / W.D.aggro;
    SFX.play('windup');
  }
  updateStrike(dt, W) {
    for (const leg of this.legs) {
      if (leg.st === 'windup') {
        leg.t += dt;
        const t = W.nearestTarget(this.x, this.y); if (t) leg.aim = { x: t.x, y: t.y };
        const a = Math.atan2(leg.aim.y - this.y, leg.aim.x - this.x);
        leg.fx = lerp(leg.fx, this.x + Math.cos(a) * 26, Math.min(1, dt * 10)); leg.fy = lerp(leg.fy, this.y + Math.sin(a) * 26, Math.min(1, dt * 10));
        if (leg.t >= leg.dur) {
          const len = Math.min(LL.REACH, dist(this.x, this.y, leg.aim.x, leg.aim.y) + 24);
          leg.st = 'strike'; leg.t = 0; leg.tx = this.x + Math.cos(a) * len; leg.ty = this.y + Math.sin(a) * len;
          SFX.play('tongue');
        }
      } else if (leg.st === 'strike') {
        const dx = leg.tx - leg.fx, dy = leg.ty - leg.fy, d = Math.hypot(dx, dy), step = 640 * W.D.speed * dt;
        if (d <= step) { leg.fx = leg.tx; leg.fy = leg.ty; leg.st = 'hold'; leg.t = 0; }
        else { leg.fx += dx / d * step; leg.fy += dy / d * step; }
        const hp = platAt(leg.fx, leg.fy);
        if (hp) { leg.st = 'hold'; leg.t = 0; burst(W, leg.fx, leg.fy, 6, ['#ffd23f', '#ffffff'], 60, 0.3); }
        if (!leg.hit) {
          const k = this.knee(leg);
          for (const tg of W.targets()) if (segCircle(k.x, k.y, leg.fx, leg.fy, tg.x, tg.y, tg.r + 1)) { leg.hit = true; W.hurt(tg, 'hit', this); break; }
        }
      } else if (leg.st === 'hold') {
        leg.t += dt;
        if (leg.t > 0.18) { leg.st = 'dangle'; leg.retryT = 0; }
      }
    }
  }
  hellShots(dt, W, t) {
    if (!W.D.hell || !t || this.frozenT > 0) return;
    this.fireCD -= dt;
    if (this.fireCD <= 0 && dist(this.x, this.y, t.x, t.y) < 210 && lineOfSight(this.x, this.y, t.x, t.y)) {
      this.fireCD = 3.5 + Math.random() * 1.5;
      const a = Math.atan2(t.y - this.y, t.x - this.x);
      W.enemyShots.push({ kind: 'fire', x: this.x, y: this.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, life: 1.2, src: this });
      SFX.play('ignite');
    }
  }
  updateBall(dt, W) {
    const D = W.D, frozen = this.tickFrozen(dt, W), t = W.nearestTarget(this.x, this.y);
    this.jumpCD -= dt;
    if (!frozen && t) {
      const sg = Math.sign(t.x - this.x) || 1, roll = 125 * D.speed;
      this.vx = approach(this.vx, sg * roll, (this.grounded ? 230 : 90) * dt);
      if (this.grounded && this.jumpCD <= 0) {
        this.vy = -(250 + Math.random() * 110) * Math.min(1.25, Math.sqrt(D.speed)); this.vx += sg * 50;
        this.jumpCD = (1.3 + Math.random() * 1.5) / D.aggro; this.grounded = false; SFX.play('jump', 0.1);
      }
    } else this.vx = approach(this.vx, 0, (this.grounded ? 260 : 40) * dt);
    this.vy = Math.min(this.vy + G * dt, 460);
    const sp = Math.hypot(this.vx, this.vy); if (sp > 360) { this.vx *= 360 / sp; this.vy *= 360 / sp; }
    // move in small steps and bounce off every surface
    const steps = Math.max(1, Math.ceil(sp * dt / 3)), sdt = dt / steps;
    this.grounded = false;
    for (let i = 0; i < steps; i++) {
      this.x += this.vx * sdt; this.y += this.vy * sdt;
      for (const p of PLATS) {
        const cx = clamp(this.x, p.x, p.x + p.w), cy = clamp(this.y, p.y, p.y + p.h), ddx = this.x - cx, ddy = this.y - cy, dd = Math.hypot(ddx, ddy);
        if (dd >= this.r) continue;
        let nx, ny;
        if (dd > 0.001) { nx = ddx / dd; ny = ddy / dd; } else { nx = 0; ny = -1; }
        this.x = cx + nx * this.r; this.y = cy + ny * this.r;
        if (p.move) { this.x += p.dx || 0; this.y += p.dy || 0; }
        const vn = this.vx * nx + this.vy * ny;
        if (vn < 0) {
          const bounce = vn < -140 ? 0.55 : 0;
          this.vx -= (1 + bounce) * vn * nx; this.vy -= (1 + bounce) * vn * ny;
          if (vn < -200) { SFX.play('land', 0.08); burst(W, this.x - nx * this.r, this.y - ny * this.r, 4, ['#ffd23f', '#9aa4b4'], 50, 0.3, 80, 1); }
        }
        if (ny < -0.6) { this.grounded = true; if (p.belt) this.x += p.belt * sdt; }
      }
    }
    this.x = clamp(this.x, 20, REF_W - 20);
    if (this.y < WORLD_TOP + this.r + 12) { this.y = WORLD_TOP + this.r + 12; if (this.vy < 0) this.vy = 0; }
    if (this.y > REF_H) { this.x = REF_W / 2; this.y = 60; this.vx = this.vy = 0; }
    this.rot += this.vx / this.r * dt;
    if (t) this.eyeA = Math.atan2(t.y - this.y, t.x - this.x);
    if (frozen || !t) return;
    if (this.hurtCD <= 0) for (const tg of W.targets()) if (dist(this.x, this.y, tg.x, tg.y) < this.r + tg.r - 1) { W.hurt(tg, 'hit', this); this.hurtCD = 0.5; }
    if (Math.random() < dt * 6) W.particles.push({ x: this.x + (Math.random() - 0.5) * 12, y: this.y + (Math.random() - 0.5) * 12, vx: (Math.random() - 0.5) * 30, vy: -40, life: 0.4, max: 0.4, color: pick(Math.random, ['#ffd23f', '#ff8a00']), size: 1, grav: 120 });
    this.hellShots(dt, W, t);
  }
  burstColors() { return ['#ffd23f', '#ff8a00', '#ffffff', '#9aa4b4', '#ff2d2d']; }
  /* ---------- drawing ---------- */
  draw(W) {
    if (!this.alive) return;
    for (const d of this.debris) {
      ctx.globalAlpha = clamp(d.life * 2, 0, 1);
      const c = Math.cos(d.rot), s = Math.sin(d.rot), ax = d.hx * c - d.hy * s, ay = d.hx * s + d.hy * c;
      ctx.strokeStyle = '#1a1c24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(d.x - ax, d.y - ay); ctx.lineTo(d.x + ax, d.y + ay); ctx.stroke();
      ctx.strokeStyle = '#9aa4b4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(d.x - ax, d.y - ay); ctx.lineTo(d.x + ax, d.y + ay); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const bob = this.phase === 'legs' ? Math.sin(T * 2.4) * 1.5 : 0;
    if (this.phase === 'legs') for (const leg of this.legs) this.drawLeg(leg, W, bob);
    drawLongLegsBody(this.x, this.y + bob, {
      eye: this.eyeA, alert: this.mode === 'chase' || this.phase === 'ball', boot: this.bootT, hell: W.D.hell,
      rot: this.rot, ball: this.phase === 'ball', frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5,
      stubs: this.phase === 'legs' ? this.maxLegs - this.legs.length : this.maxLegs,
    });
    if (this.phase === 'ball') this.drawFreezeBar(W);
  }
  drawLeg(leg, W, bob) {
    const h = this.hip(leg); h.y += bob;
    const k = this.knee(leg);
    const warn = leg.st === 'windup' && Math.floor(T * 16) % 2 === 0, hot = leg.st === 'strike' || leg.st === 'hold';
    ctx.lineCap = 'round';
    const seg = (x1, y1, x2, y2, wOut, wIn, col) => {
      ctx.strokeStyle = '#1a1c24'; ctx.lineWidth = wOut; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = wIn; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    const col = warn ? '#ff3b3b' : hot ? '#ffb070' : '#9aa4b4';
    seg(h.x, h.y, k.x, k.y, 3.5, 1.5, col);
    seg(k.x, k.y, leg.fx, leg.fy, 3, 1.2, warn ? '#ff3b3b' : hot ? '#ffd0a0' : '#c4ccd8');
    pxCircle(ctx, k.x, k.y, 3, '#2a2d36'); pxCircle(ctx, k.x, k.y, 2, '#5c6270');
    ctx.fillStyle = W.D.hell || warn ? '#ff2d2d' : '#ffd23f'; ctx.fillRect(Math.round(k.x), Math.round(k.y) - 1, 1, 1);
    pxCircle(ctx, leg.fx, leg.fy, 2, '#2a2d36');
    ctx.fillStyle = '#7a8090'; ctx.fillRect(Math.round(leg.fx) - 2, Math.round(leg.fy) + 1, 1, 2); ctx.fillRect(Math.round(leg.fx) + 2, Math.round(leg.fy) + 1, 1, 2);
    ctx.lineCap = 'butt';
    if (leg.webT > 0) {
      // wrapped in silk: thick white sleeve + criss-cross strands
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(leg.fx, leg.fy); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(k.x, k.y); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = '#ffffff';
      for (let i = 1; i < 6; i++) { const q = i / 6, x = lerp(k.x, leg.fx, q), y = lerp(k.y, leg.fy, q); ctx.fillRect(Math.round(x) - 3, Math.round(y), 7, 1); }
      if (leg.webT < 1.5 && Math.floor(T * 12) % 2) { ctx.fillStyle = '#ff8c42'; ctx.fillRect(Math.round(leg.fx) - 1, Math.round(leg.fy) - 1, 3, 3); }
      const mx = (k.x + leg.fx) / 2, my = (k.y + leg.fy) / 2, w = 22, frac = clamp(leg.webT / W.D.freeze, 0, 1);
      ctx.fillStyle = '#140c26'; ctx.fillRect(Math.round(mx - w / 2 - 1), Math.round(my - 16), w + 2, 4);
      ctx.fillStyle = '#dfe8f5'; ctx.fillRect(Math.round(mx - w / 2), Math.round(my - 15), Math.round(w * frac), 2);
      if (Math.floor(T * 4) % 2 === 0) drawText('BITE!', mx, my - 26, 1, '#ffd23f', 'center', '#140c26');
    }
  }
}

/* Body sprite: riveted steel orb with a single red eye. o.ball = rolling (no legs) */
function drawLongLegsBody(x, y, o) {
  let sx = x, sy = y;
  if (o.shiver) { sx += Math.round(Math.sin(T * 60)); }
  if (o.hell) { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(T * 6); pxCircle(ctx, sx, sy, 17, '#ff2d2d'); ctx.globalAlpha = 1; }
  if (!o.ball) {   // antenna with a blinking light
    ctx.fillStyle = '#2a2d36'; ctx.fillRect(Math.round(sx), Math.round(sy) - 17, 1, 6);
    ctx.fillStyle = Math.floor(T * 3) % 2 ? '#ff2d2d' : '#5a1a1a'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 19, 3, 2);
  }
  pxCircle(ctx, sx, sy, 12, '#1a1c24');
  pxCircle(ctx, sx, sy, 11, '#6a7484');
  pxCircle(ctx, sx - 2, sy - 3, 7, '#8a94a4');
  pxCircle(ctx, sx - 4, sy - 5, 3, '#b4bcc8');
  // panel seams + rivets turn with the body when it rolls
  const r = o.rot || 0;
  ctx.fillStyle = '#3a3f4c';
  for (let k = 0; k < 6; k++) { const a = r + k * Math.PI / 3; ctx.fillRect(Math.round(sx + Math.cos(a) * 9), Math.round(sy + Math.sin(a) * 9), 2, 2); }
  for (let k = 0; k < 2; k++) { const a = r + k * Math.PI; for (let q = 4; q < 11; q++) ctx.fillRect(Math.round(sx + Math.cos(a) * q), Math.round(sy + Math.sin(a) * q), 1, 1); }
  // torn leg stubs spark once legs come off
  if (o.stubs && Math.random() < 0.5) { const a = Math.random() * TAU; ctx.fillStyle = pick(Math.random, ['#ffd23f', '#ff8a00', '#ffffff']); ctx.fillRect(Math.round(sx + Math.cos(a) * 12), Math.round(sy + Math.sin(a) * 12), 1, 1); }
  // eye
  const ex = sx + Math.cos(o.eye) * 4, ey = sy + 1 + Math.sin(o.eye) * 3;
  pxCircle(ctx, ex, ey, 4, '#1a0606');
  const lit = o.boot > 0 ? (Math.random() < 0.5 ? '#5a1a1a' : '#ff2d2d') : o.alert ? '#ff4a2a' : '#c42222';
  pxCircle(ctx, ex, ey, o.alert ? 3 : 2, o.frozen ? '#7a3a3a' : lit);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 1, 1);
  if (o.alert && !o.frozen && o.boot <= 0) { ctx.globalAlpha = 0.25; pxCircle(ctx, ex, ey, 6, '#ff2d2d'); ctx.globalAlpha = 1; }
  if (o.frozen) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * 13, sy + Math.sin(a) * 13); ctx.lineTo(sx - Math.cos(a + 0.9) * 13, sy - Math.sin(a + 0.9) * 13); ctx.stroke(); }
    ctx.globalAlpha = 0.35; pxCircle(ctx, sx, sy, 12, '#ffffff'); ctx.globalAlpha = 1;
  }
}
/* Small static preview for menus (practice card, overworld) */
function drawLongLegsPreview(x, y, t) {
  const bob = Math.sin(t * 2.4) * 1.5, by = y - 26 + bob;
  ctx.lineCap = 'round';
  for (const [fx, kx, ky] of [[-34, -26, -44], [-16, -14, -40], [16, 14, -40], [34, 26, -44]]) {
    ctx.strokeStyle = '#1a1c24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + kx, y + ky); ctx.lineTo(x + fx, y); ctx.stroke();
    ctx.strokeStyle = '#9aa4b4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + kx, y + ky); ctx.lineTo(x + fx, y); ctx.stroke();
    pxCircle(ctx, x + kx, y + ky, 2, '#5c6270');
  }
  ctx.lineCap = 'butt';
  drawLongLegsBody(x, by, { eye: Math.PI * 0.75, alert: false, boot: 0, rot: 0 });
}
