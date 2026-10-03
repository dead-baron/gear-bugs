/* =====================================================================
   67_POND - level 7: archer fish + the bullfrog
   ---------------------------------------------------------------------
   ArcherFish: swims under the surface. When a spider comes close it
     rises, aims (leading the shot) and spits a water jet. A hit knocks
     the spider loose: it falls with the momentum it had - into the water
     means instant defeat, onto a platform means dazed for a second.
     Fish can't be webbed; they're part of the pond.
   Frog: big bullfrog. Walks slowly, makes huge leaps at spiders, has a
     long tongue, and snaps up golden flies (a new one spawns later).
     Takes several webs (it slows with each) before it's stuck; then bite.
   ===================================================================== */
const JET_SPEED = 340;

class ArcherFish extends Enemy {
  constructor(x, y, pond) {
    super('archer', x, y);
    this.r = 6; this.hitR = 0; this.pond = pond; this.st = 'swim'; this.t = Math.random() * 10;
    this.vx = (Math.random() < 0.5 ? -1 : 1) * 26; this.depth = 18 + Math.random() * 32; this.goalX = x;
    this.cd = 6.5 + Math.random() * 3; this.aimT = 0;   // grace period: nobody gets shot during the round intro / first steps this.surfaced = false; this.target = null;
  }
  webbable() { return this.st === 'aim' || (this.st === 'rise' && this.y < WATER_Y + 8); }
  webHit(x, y) { return this.webbable() && dist(x, y, this.x + this.facing * 4, this.y - 2) < 10; }
  biteable() { return false; }
  onWeb(W) {
    // a web in the face spoils the shot: it ducks under and tries again later
    this.st = 'dive'; this.surfaced = false; this.windup = 0; this.cd = 2.5 + Math.random() * 1.5;
    SFX.play('splash'); floater(W, this.x, WATER_Y - 12, 'BLUB!', '#9ad8ff'); burst(W, this.x, WATER_Y, 10, ['#ffffff', '#9ad8ff'], 60, 0.4, 200);
    return 'knock';
  }
  pickTarget(W) {
    const wy = WATER_Y, R = 170 * Math.sqrt(W.D.aggro);
    const t = W.nearestTarget(this.x, wy);
    if (t && t.y < wy - 4 && dist(this.x, wy, t.x, t.y) < R) return t;
    // nobody close: maybe pick off a golden fly instead
    let best = null, bd = R * 0.9;
    for (const f of W.flies) if (f.state === 'free' && !f.heart && f.y < wy - 10) { const d = dist(this.x, wy, f.x, f.y); if (d < bd) { bd = d; best = f; } }
    return best ? { x: best.x, y: best.y, vx: best.vx, vy: best.vy, r: 4, fly: best } : null;
  }
  update(dt, W) {
    if (this.mirror) { this.glide(dt); this.surfaced = this.windup > 0 || this.ty < WATER_Y + 2; this.t += dt; return; }
    const D = W.D, wy = WATER_Y, { x0, x1 } = this.pond;
    this.t += dt; this.cd -= dt;
    // a fly knocked into the water is dinner
    const snack = W.flies.find(f => f.state === 'sunk');
    if (snack && this.st === 'swim') {
      this.goalX = snack.x;
      if (Math.abs(snack.x - this.x) < 8) { this.y = approach(this.y, wy + 2, 80 * dt); if (this.y < wy + 6) { W.flies.splice(W.flies.indexOf(snack), 1); burst(W, snack.x, wy, 8, ['#ffffff', '#9ad8ff', '#ffd23f'], 50, 0.4, 200); floater(W, snack.x, wy - 12, 'GULP!', '#ff8c42'); SFX.play('splash'); if (W.rules.onFlyEaten) W.rules.onFlyEaten(snack); } }
    }
    const t = this.st === 'swim' || this.st === 'dive' ? this.pickTarget(W) : (this.target && this.target.fly && this.target.fly.state !== 'free' ? null : this.pickTarget(W));
    const near = !!t;
    if (this.st === 'swim') {
      if (!snack && (Math.abs(this.goalX - this.x) < 6 || Math.random() < dt * 0.15)) this.goalX = x0 + 14 + Math.random() * (x1 - x0 - 28);
      this.vx = approach(this.vx, Math.sign(this.goalX - this.x) * 30 * D.speed, 40 * dt);
      this.x += this.vx * dt; if (!snack || Math.abs(snack.x - this.x) >= 8) this.y = lerp(this.y, wy + this.depth + Math.sin(this.t * 1.7) * 3, Math.min(1, dt * 2));
      if (Math.abs(this.vx) > 3) this.facing = Math.sign(this.vx);
      this.drawAngle = this.vx * 0.004;
      if (near && this.cd <= 0 && !snack) { this.st = 'rise'; this.target = t; SFX.play('splash', 0.5); }
    } else if (this.st === 'rise') {
      const tx = clamp(t ? t.x - Math.sign(t.x - this.x || 1) * 30 : this.x, x0 + 8, x1 - 8);
      this.x = approach(this.x, tx, 60 * D.speed * dt);
      this.y = approach(this.y, wy - 1, 70 * dt);
      this.drawAngle += angDiff(this.drawAngle, -0.6 * this.facing) * Math.min(1, dt * 6);
      if (!near) { this.st = 'dive'; this.cd = 1.2; }
      else if (this.y <= wy - 0.5) { this.st = 'aim'; this.aimT = 0.55 + D.windup; this.surfaced = true; this.target = t; }
    } else if (this.st === 'aim') {
      this.aimT -= dt;
      // head poking out of the water, tracking its target
      this.y = wy - 1 + Math.sin(this.t * 8) * 0.5;
      if (!near || !t) { this.st = 'dive'; this.surfaced = false; this.cd = 1.5; }
      else {
        const mx = this.x + this.facing * 8, my = wy - 4;
        const d0 = dist(mx, my, t.x, t.y), tof = d0 / JET_SPEED;
        const px = t.x + (t.vx || 0) * tof * 0.9, py = t.y + (t.vy || 0) * tof * 0.9;
        const a = Math.atan2(py - my, px - mx);
        this.facing = Math.cos(a) >= 0 ? 1 : -1;
        this.drawAngle += angDiff(this.drawAngle, clamp(a - (this.facing < 0 ? Math.PI : 0), -1.2, 1.2)) * Math.min(1, dt * 10);
        this.windup = this.aimT;
        if (this.aimT <= 0) {
          const g = 150, vx = Math.cos(a) * JET_SPEED, vy = Math.sin(a) * JET_SPEED - 0.5 * g * tof;
          W.enemyShots.push({ kind: 'jet', x: mx, y: my, vx, vy, life: 1.2, src: this });
          SFX.play('webspit'); burst(W, mx, wy, 6, ['#ffffff', '#9ad8ff'], 40, 0.3, 160, 1);
          this.st = 'dive'; this.windup = 0; this.cd = (3.2 + Math.random() * 2) / D.aggro;
        }
      }
    } else if (this.st === 'dive') {
      this.surfaced = false; this.windup = 0;
      this.y = approach(this.y, wy + this.depth, 50 * dt);
      this.drawAngle += angDiff(this.drawAngle, 0.5 * this.facing) * Math.min(1, dt * 4);
      if (this.y >= wy + this.depth - 1) this.st = 'swim';
    }
    this.x = clamp(this.x, x0 + 6, x1 - 6);
  }
  draw(W) { if (this.alive) drawArcherFish(this.x, this.y, this.drawAngle, this.facing, this.t, { aim: this.windup > 0, hell: W.D.hell }); }
}

const frogAllow = p => p.ny < -0.5;   // the frog sits on top of things only
class Frog extends Lizard {
  constructor(x, y, D) {
    super(x, y);
    this.type = 'frog'; this.r = 10; this.hitR = 17; this.headLen = 11; this.tongueLen = 132;
    this.need = D.hell ? 5 : D.speed > 1.1 ? 4 : D.speed < 0.9 ? 2 : 3;
    this.webLevel = 0; this.webDecayT = 0; this.attackCD = 6; this.jumpCD = 6.5;   // a moment to get going before it attacks
    this.webLevel = 0; this.eatCD = 4 + Math.random() * 3; this.snack = null; this.swim = false; this.hurtCD = 0; this.sac = 0;
    const q = findCollision(x, y + 8, this.r + 10); if (q) { attachTo(this, q); this.state = 'stuck'; }
  }
  slowK() { return 1 - 0.7 * Math.min(1, this.webLevel / this.need); }
  onWeb(W, S) {
    if (!S.powered) return Enemy.prototype.onWeb.call(this, W, S);   // NO EFFECT / NEED 5 FLIES
    if (this.frozenT > 0) { this.frozenT = Math.max(this.frozenT, W.D.freeze * 0.6); floater(W, this.x, this.y - 20, 'MORE WEB!', '#ffffff'); return 'freeze'; }
    this.webLevel++; this.webDecayT = 4.5; this.cancelAttacks();
    burst(W, this.x, this.y, 12, ['#ffffff', '#dfe8f5'], 70, 0.5);
    if (this.webLevel >= this.need) {
      this.frozenT = W.D.freeze; SFX.play('trap'); shake(0.15, 2);
      floater(W, this.x, this.y - 22, 'STUCK!', '#ffffff');
      if (W.rules.onEnemyTrapped) W.rules.onEnemyTrapped(this, S);
      return 'freeze';
    }
    SFX.play('slow'); floater(W, this.x, this.y - 22, 'SLOWER! ' + this.webLevel + '/' + this.need, '#dfe8f5');
    return 'slow';
  }
  cancelAttacks() { this.windup = 0; this.tongueT = -1; this.breathT = 0; this.snack = null; }
  update(dt, W) {
    if (this.mirror) { this.mirrorStep(dt, W); return; }
    const D = W.D, wasFrozen = this.frozenT > 0, frozen = this.tickFrozen(dt, W);
    if (wasFrozen && !frozen) this.webLevel = 0;
    if (!frozen && this.webLevel > 0) { this.webDecayT -= dt; if (this.webDecayT <= 0) { this.webLevel--; this.webDecayT = 3; } }
    const k = this.slowK(), t = W.nearestTarget(this.x, this.y), d = t ? dist(this.x, this.y, t.x, t.y) : 999;
    this.jumpCD -= dt; this.eatCD -= dt; this.attackCD -= dt; this.hurtCD -= dt; this.sac += dt;
    const busy = this.windup > 0 || this.tongueT >= 0 || this.breathT > 0;
    if (this.swim) this.updateSwim(dt, W, t, k, frozen);
    else if (this.state === 'air') {
      crawlerFly(this, dt, frogAllow, W);
      if (this.state === 'stuck') { this.swimTotal = 0; SFX.play('land', 0.1); burst(W, this.x, this.y + this.r, 6, ['#5fae58', '#c8d890'], 40, 0.3, 80, 1); }
      if (this.y + this.r * 0.4 >= WATER_Y) { this.swim = true; this.state = 'swim'; this.plat = null; this.vy = 0; this.y = WATER_Y - 3; SFX.play('splash'); burst(W, this.x, WATER_Y, 16, ['#ffffff', '#9ad8ff', '#3b97d9'], 110, 0.6, 300); }
    } else if (!frozen && !busy && t) {
      // a slow waddle toward the nearest spider...
      const g = greedyDir(this, t.x, t.y, frogAllow);
      if (g.sign && g.cur > 30) {
        const sp = 14 * D.speed * k;
        if (crawlMove(this, g.sign * sp * dt, frogAllow) !== 'blocked') { this.facing = g.sign; this.walk += sp * dt; }
      }
      // ...or a massive leap at it
      if (this.jumpCD <= 0 && d > 70 && k > 0.35) {
        jumpToward(this, t.x + (t.vx || 0) * 0.3, t.y - 6, 560 * k, 0.6, 1.25, 290);
        this.jumpCD = (3.5 + Math.random() * 2) / D.aggro; SFX.play('jump');
        this.facing = t.x > this.x ? 1 : -1;
      }
      // snack time: snap up a golden fly
      if (this.eatCD <= 0 && this.state === 'stuck') {
        const f = W.flies.filter(f => f.state === 'free' && !f.heart && dist(this.mouthX, this.mouthY, f.x, f.y) < this.tongueLen && lineOfSight(this.mouthX, this.mouthY, f.x, f.y)).sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0];
        if (f) { this.snack = f; this.windup = 0.28; this.eatCD = (6 + Math.random() * 4) / Math.sqrt(D.aggro); }
        else this.eatCD = 1;
      }
      if (!this.windup && this.attackCD <= 0 && this.state === 'stuck' && d < this.tongueLen + 6 && lineOfSight(this.mouthX, this.mouthY, t.x, t.y)) {
        this.snack = null; this.windup = D.windup + 0.25; this.attackCD = 2.6 / D.aggro; SFX.play('windup');
      }
    }
    if (this.state === 'stuck') {
      syncStuck(this);
      if (t && !busy) { const tg = tangentOf(this), dd = (t.x - this.x) * tg.x + (t.y - this.y) * tg.y; if (Math.abs(dd) > 8) this.facing = Math.sign(dd); }
    }
    const target = this.state === 'stuck' ? Math.atan2(this.ny, this.nx) + Math.PI / 2 : this.swim ? 0 : Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.35;
    this.drawAngle += angDiff(this.drawAngle, target) * Math.min(1, dt * 10);
    this.aimHead(dt, this.snack && this.snack.state === 'free' ? { x: this.snack.x, y: this.snack.y } : t, frozen);
    if (frozen) { this.windup = 0; this.tongueT = -1; return; }
    this.frogTongue(dt, W, t);
    if (this.state === 'stuck' && t) { const h = headFrom(this, 11); hellBreath(this, W, dt, h.x, h.y, Math.atan2(t.y - h.y, t.x - h.x), t); }
    // squashing landing / body slam
    if (this.hurtCD <= 0 && (this.state === 'air' || this.swim)) for (const tg of W.targets()) if (dist(this.x, this.y, tg.x, tg.y) < this.r + tg.r) { W.hurt(tg, 'hit', this); this.hurtCD = 1; }
  }
  /* Swimming: paddle to the near edge of a perch (never under or inside it), then leap up onto it.
     Safety nets: a big vertical leap if it can't get out after a few seconds, and a last-resort
     hop onto the nearest stump so it can never be stranded in the water. */
  updateSwim(dt, W, t, k, frozen) {
    const sy = WATER_Y - 3, r = this.r;
    this.y = sy + Math.sin(T * 3) * 0.8; this.vy = 0;
    this.swimT = (this.swimT || 0) + dt; this.swimTotal = (this.swimTotal || 0) + dt;
    const blocks = x => PLATS.find(p => x + r > p.x && x - r < p.x + p.w && sy + r > p.y && sy - r < p.y + p.h);
    // never sit inside something: pop out to its nearer side
    const ov = blocks(this.x);
    if (ov) { const L = ov.x - r - 1, R = ov.x + ov.w + r + 1; this.x = Math.abs(this.x - L) < Math.abs(R - this.x) ? L : R; }
    if (frozen) return;
    // choose a perch: approach point beside it, landing point just inside its top edge
    if (!this.perch || !PLATS.includes(this.perch.p) || this.swimT > 3) {
      let best = null, bd = Infinity;
      for (const p of PLATS) {
        if (!(p.type === 'stump' || p.type === 'lilypad' || p.type === 'swampleaf' || p.type === 'branch')) continue;
        if (p.y > WATER_Y || p.y < WATER_Y - 140 || p.w < 20) continue;
        for (const side of [-1, 1]) {
          const ax = side < 0 ? p.x - r - 7 : p.x + p.w + r + 7;
          if (ax < 16 + r || ax > 624 - r) continue;
          // the swim there must be clear
          let clear = true;
          for (let x = this.x; Math.abs(x - ax) > 3; x += Math.sign(ax - x) * 3) if (blocks(x)) { clear = false; break; }
          if (!clear || blocks(ax)) continue;
          const cost = Math.abs(ax - this.x) + (WATER_Y - p.y) * 0.5 + (this.perch && this.perch.p === p && this.swimT > 3 ? 400 : 0);
          if (cost < bd) { bd = cost; best = { p, ax, lx: side < 0 ? p.x + 9 : p.x + p.w - 9 }; }
        }
      }
      this.perch = best; if (this.swimT > 3) this.swimT = 0.5;
    }
    const P = this.perch;
    if (P) {
      const dx = P.ax - this.x;
      if (Math.abs(dx) > 3) {
        const step = Math.sign(dx) * Math.min(Math.abs(dx), 48 * W.D.speed * Math.max(0.45, k) * dt);
        if (!blocks(this.x + step)) this.x += step; else this.perch = null;
        this.facing = Math.sign(dx); this.walk += dt * 20;
      } else if (this.swimT > 0.35) {
        // ballistic leap: rise clear above the top edge, come down just inside it
        const top = P.p.y - r - 1, rise = Math.max(14, this.y - top + 16);
        const vy = -Math.sqrt(2 * G * rise), tUp = -vy / G, tDown = Math.sqrt(2 * (rise - (this.y - top)) / G);
        this.leapOut(W, (P.lx - this.x) / (tUp + Math.max(0.05, tDown)), vy);
        return;
      }
    }
    // stuck for a while with nowhere to go: jump straight up and hope to catch something
    if (this.swimT > 2.6 && !P) { this.leapOut(W, (320 - this.x) * 0.3, -430); return; }
    // last resort: never stranded - hop onto the nearest stump
    if (this.swimTotal > 7) {
      const st = PLATS.filter(p => p.type === 'stump').sort((a, b) => Math.abs(a.x + a.w / 2 - this.x) - Math.abs(b.x + b.w / 2 - this.x))[0];
      if (st) { burst(W, this.x, WATER_Y, 14, ['#ffffff', '#9ad8ff'], 90, 0.5, 260); this.swim = false; this.swimTotal = 0; this.x = st.x + st.w / 2; this.y = st.y - r; attachTo(this, st); this.state = 'stuck'; SFX.play('splash'); return; }
    }
    if (t && this.jumpCD <= 0 && k > 0.35 && this.swimT > 0.8) { this.leapOut(W, 0, 0, t); }
  }
  leapOut(W, vx, vy, t) {
    this.swim = false; this.swimT = 0; this.perch = null; this.y -= 4; this.noStickT = 0;
    if (t) { jumpToward(this, t.x, t.y - 6, 520 * this.slowK(), 0.6, 1.2, 280); this.jumpCD = (3.5 + Math.random() * 2) / W.D.aggro; }
    else { this.state = 'air'; this.plat = null; this.vx = vx; this.vy = vy; }
    SFX.play('splash'); burst(W, this.x, WATER_Y, 12, ['#ffffff', '#9ad8ff'], 80, 0.5, 260);
  }
  frogTongue(dt, W, t) {
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        const aim = this.snack && this.snack.state === 'free' ? this.snack : t;
        this.tongueT = 0; this.tongueHit = false; this.tongueAng = aim ? Math.atan2(aim.y - this.mouthY, aim.x - this.mouthX) : this.headWorld; SFX.play('tongue');
      }
    } else if (this.tongueT >= 0) {
      this.tongueT += dt;
      const ext = this.tongueExt(), ex = this.mouthX + Math.cos(this.tongueAng) * ext, ey = this.mouthY + Math.sin(this.tongueAng) * ext;
      if (!this.tongueHit) for (const tg of W.targets()) if (segCircle(this.mouthX, this.mouthY, ex, ey, tg.x, tg.y, tg.r - 1)) { this.tongueHit = true; W.hurt(tg, 'hit', this); break; }
      for (const f of W.flies) if (f.state === 'free' && !f.heart && dist(ex, ey, f.x, f.y) < 9) {
        W.flies.splice(W.flies.indexOf(f), 1);
        floater(W, f.x, f.y - 10, 'GULP! FLY STOLEN', '#ff8c42'); SFX.play('bite'); burst(W, f.x, f.y, 8, ['#ffd23f', '#fff3a0'], 50, 0.3);
        if (W.rules.onFlyEaten) W.rules.onFlyEaten(f);
        break;
      }
      if (this.tongueT >= 0.5) { this.tongueT = -1; this.snack = null; }
    }
  }
  tongueExt() { if (this.mirror) return this.netExt || 0; return this.tongueT >= 0 ? Math.sin(Math.PI * clamp(this.tongueT / 0.5, 0, 1)) * this.tongueLen : 0; }
  netExtra() { return [this.webLevel, this.need, this.swim ? 1 : 0]; }
  applyNetExtra(a) { this.webLevel = a[0]; this.need = a[1]; this.swim = !!a[2]; }
  burstColors() { return ['#3f9a3a', '#c8d890', '#ffd23f', '#ffffff']; }
  draw(W) {
    if (!this.alive) return;
    const o = { air: this.state === 'air' && !this.swim, swim: this.swim, frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5, webK: this.frozenT > 0 ? 1 : this.webLevel / this.need,
      mouthOpen: this.windup > 0 || this.tongueT >= 0 || this.breathT > 0, flash: this.windup > 0 && !this.snack && Math.floor(T * 20) % 2 === 0, hell: W.D.hell, sac: Math.sin(this.sac * 3) };
    drawFrog(this.x, this.y, this.drawAngle, this.facing, this.walk, o);
    drawTongue(this);
    this.drawFreezeBar(W);
  }
}

/* Archer fish: silver body, black bands, pointed snout */
function drawArcherFish(x, y, ang, facing, t, o) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang); ctx.scale(facing, 1);
  const tail = Math.sin(t * (o.aim ? 4 : 9)) * 2;
  ctx.fillStyle = '#8a9aa8'; ctx.fillRect(-11, -3 + Math.round(tail * 0.5), 3, 6); ctx.fillRect(-12, -4 + Math.round(tail), 2, 3); ctx.fillRect(-12, 1 + Math.round(tail), 2, 3);
  pxEllipse(ctx, -1, 0, 8, 4, '#5a6a7a');
  pxEllipse(ctx, -1, -1, 7, 3, '#e8eef4');
  ctx.fillStyle = '#c8d4e0'; ctx.fillRect(-6, 1, 11, 2);
  ctx.fillStyle = '#1a1a22'; for (const bx of [-6, -2, 2]) { ctx.fillRect(bx, -4, 2, 4 + (bx === 2 ? 1 : 2)); }
  ctx.fillStyle = '#e8eef4'; ctx.fillRect(6, -1, 3, 2); ctx.fillStyle = '#5a6a7a'; ctx.fillRect(9, 0, 1, 1);
  ctx.fillStyle = o.hell ? '#ff2d2d' : '#ffd23f'; ctx.fillRect(4, -2, 2, 2); ctx.fillStyle = '#000'; ctx.fillRect(5, -2, 1, 1);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-4, -5, 4, 1);   // dorsal fin
  ctx.restore();
  if (o.aim && Math.floor(T * 10) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 9, 3, 1); }
}

/* Bullfrog: big green frog, gold-ringed eyes, pale belly, throat sac */
function drawFrog(x, y, ang, facing, walk, o) {
  ctx.save(); ctx.translate(Math.round(x + (o.shiver ? Math.sin(T * 60) : 0)), Math.round(y)); ctx.rotate(ang); ctx.scale(facing, 1);
  const dk = o.hell ? '#3a2a1a' : '#2f6a24', md = o.hell ? '#6a3a1a' : '#4f9a3a', lt = o.hell ? '#9a5a2a' : '#7cc25a';
  if (o.air) {   // legs stretched out behind in a leap
    ctx.fillStyle = dk; ctx.fillRect(-18, 2, 10, 3); ctx.fillRect(-22, 4, 5, 2); ctx.fillRect(4, 5, 6, 2);
  } else {
    pxEllipse(ctx, -8, 5, 6, 4, dk); pxEllipse(ctx, -8, 4, 5, 3, md);    // folded back leg
    ctx.fillStyle = dk; ctx.fillRect(-14, 8, 6, 2); ctx.fillRect(5, 6, 2, 4); ctx.fillRect(4, 9, 4, 1);
  }
  pxEllipse(ctx, -1, 1, 12, 7, dk);
  pxEllipse(ctx, -1, 0, 11, 6, md);
  pxEllipse(ctx, -3, -2, 7, 3, lt);
  ctx.fillStyle = dk; for (const [sx, sy] of [[-7, -1], [-2, 2], [3, -2], [-9, 3]]) ctx.fillRect(sx, sy, 2, 1);   // spots
  pxEllipse(ctx, 3, 4, 7, 2.5, '#e0e8b0');                                       // belly
  const sac = Math.max(0, o.sac || 0);
  if (sac > 0.2 && !o.mouthOpen) pxEllipse(ctx, 8, 5, 3 + sac * 2, 2 + sac * 2, '#f0f0c0');   // throat sac puffs
  // head + eyes on top
  pxEllipse(ctx, 7, -2, 5, 4, md);
  pxCircle(ctx, 5, -6, 3, dk); pxCircle(ctx, 5, -6, 2, '#e8c040'); ctx.fillStyle = '#000'; ctx.fillRect(5, -7, 1, 2);
  if (o.hell) { ctx.fillStyle = '#ff2d2d'; ctx.fillRect(4, -7, 2, 2); }
  ctx.fillStyle = dk; ctx.fillRect(7, 1, 6, 1);                                  // mouth line
  if (o.mouthOpen) { ctx.fillStyle = '#8a1a2a'; ctx.fillRect(8, 0, 5, 3); }
  if (o.flash) { ctx.fillStyle = '#ffffff'; ctx.fillRect(5, -10, 1, 2); }
  ctx.restore();
  // web wrapping grows with every web
  if (o.webK > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    const n = Math.ceil(o.webK * 6);
    for (let i = 0; i < n; i++) { const a = i * 1.1 + 0.3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 13, y + Math.sin(a) * 9); ctx.lineTo(x - Math.cos(a + 1) * 13, y - Math.sin(a + 1) * 9); ctx.stroke(); }
    if (o.frozen) { ctx.globalAlpha = 0.4; pxEllipse(ctx, x, y, 14, 10, '#ffffff'); ctx.globalAlpha = 1; }
  }
}

function spawnArcherFish(W) {
  const pond = W.L.pond, D = W.D, n = D.speed < 0.9 ? 2 : D.hell ? 4 : 3;
  for (let i = 0; i < n; i++) W.enemies.push(new ArcherFish(pond.x0 + (i + 0.5) * (pond.x1 - pond.x0) / n, WATER_Y + 30, pond));
}
