/* =====================================================================
   60_ENTITIES - spider physics & ropes, web shots, flies, enemies, fire
   ===================================================================== */

/* ---------- Spider movement tuning (Mario-like accel / decel) ---------- */
const SP = {
  R: 8, WALK: 96, SPRINT: 168, SPRINT_DELAY: 0.32, SPRINT_RAMP: 0.5,
  ACC: 560, TURN: 1250, FRIC: 380,               // surface accel, reverse-brake, release slide
  AIR_MAX: 150, AIR_ACC: 470, AIR_DRAG: 110,     // air control
  JUMP: 292, MAX_FALL: 480,
  WEB_SPEED: 680, WEB_RANGE: 250, WEB_CD: 0.26,
  ROPE_MAX: 250, ROPE_MIN: 14, ROPE_K: 95, ROPE_DAMP: 7, ROPE_REEL: 46, ROPE_REEL_FAST: 120, ROPE_PUMP: 330,
};

/* ---------- Particles & floating text ---------- */
function burst(W, x, y, n, colors, spd = 80, life = 0.6, grav = 200, size = 2) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.7);
    W.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, color: colors[Math.floor(Math.random() * colors.length)], size, grav });
  }
  if (W.particles.length > 600) W.particles.splice(0, W.particles.length - 600);
}
function floater(W, x, y, text, color = '#ffffff') { W.floaters.push({ x, y, text, color, life: 1.2 }); }

/* =====================================================================
   SPIDER BODY - the physics character used by the local player and bots
   ===================================================================== */
class SpiderBody {
  constructor(id, x, y, opts = {}) {
    this.id = id; this.slot = opts.slot || 0; this.name = opts.name || 'P1';
    this.style = opts.style || { c: 0, h: 0, p: 0 };
    this.team = opts.team !== undefined ? opts.team : this.slot;
    this.isBot = !!opts.bot; this.local = true;
    this.r = SP.R; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.state = 'air'; this.plat = null; this.s = 0; this.sv = 0; this.nx = 0; this.ny = -1;
    this.facing = opts.facing || 1; this.drawAngle = 0; this.walkPhase = 0; this.gear = 0;
    this.holdT = 0; this.holdSign = 0; this.lockDir = null; this.lockSign = 1;
    this.noStickPlat = null; this.noStickT = 0;
    this.rope = null; this.webCD = 0;
    this.maxHp = opts.hp || 3; this.hp = this.maxHp; this.alive = true; this.deadT = 0;
    this.invuln = 1.0; this.frozenT = 0; this.slowT = 0; this.stunT = 0; this.pauseT = 0;
    this.flies = 0; this.sh = 0; this.lastShot = { x, y, a: 0 };
    this.dmg = {}; this.bites = {}; this.killedBy = -1; this.cause = '';
    const hit = findCollision(x, y + 4, this.r + 6, null);
    if (hit) { attachTo(this, hit); this.state = 'stuck'; }
  }
  get powered() { return this.flies >= 5; }
  get immobile() { return this.frozenT > 0 || this.stunT > 0 || this.pauseT > 0; }

  update(dt, c, W) {
    this.webCD -= dt; this.noStickT -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.pauseT = Math.max(0, this.pauseT - dt);
    if (!this.alive) {
      this.deadT += dt; this.vy += G * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.drawAngle += dt * 9;
      return;
    }
    // Break free of webs by mashing
    if (this.stunT > 0) { this.stunT -= dt; if (c.mash) { this.stunT -= 0.16 * c.mash; SFX.play('mash'); burst(W, this.x, this.y, 2, ['#ffffff'], 40, 0.25, 50, 1); } if (this.stunT <= 0) { this.stunT = 0; SFX.play('free'); burst(W, this.x, this.y, 10, ['#ffffff', '#dfe8f5'], 70, 0.4); } }
    if (this.frozenT > 0) { this.frozenT -= dt; if (c.mash) { this.frozenT -= 0.1 * c.mash; SFX.play('mash'); } if (this.frozenT <= 0) { this.frozenT = 0; SFX.play('free'); burst(W, this.x, this.y, 10, ['#ffffff'], 70, 0.4); } }
    const lock = this.immobile;
    const ctl = lock ? NO_CONTROLS : c;
    const speedMul = this.slowT > 0 ? 0.55 : 1;

    // Shooting
    if (ctl.shoot && !lock) this.shoot(ctl, W);

    if (this.state === 'stuck') this.updateStuck(dt, ctl, W, speedMul, lock);
    if (this.state === 'air') this.updateAir(dt, ctl, W, speedMul);
    else if (this.state === 'rope') this.updateRope(dt, ctl, W);

    // Water hazard (island): instant defeat
    if (this.y + this.r * 0.5 >= WATER_Y) { this.die(W, 'water', -1); SFX.play('splash'); burst(W, this.x, WATER_Y, 18, ['#ffffff', '#9ad8ff', '#3b97d9'], 120, 0.7, 300); return; }

    let target = 0;
    if (this.state === 'stuck') target = Math.atan2(this.ny, this.nx) + Math.PI / 2;
    else if (this.state === 'rope' && this.rope) target = Math.atan2(this.rope.ay - this.y, this.rope.ax - this.x) + Math.PI / 2;
    else target = clamp(this.vx * 0.002, -0.3, 0.3);
    this.drawAngle += angDiff(this.drawAngle, target) * Math.min(1, dt * 18);
    if (this.state !== 'stuck') this.gear += dt * 4;
  }

  updateStuck(dt, c, W, speedMul, lock) {
    const mx = c.mx, my = c.my, mag = Math.hypot(mx, my);
    let sign = 0, drop = false;
    if (mag > 0.3) {
      const ix = mx / mag, iy = my / mag, t = tangentOf(this);
      const d = ix * t.x + iy * t.y;
      if (this.lockDir && ix * this.lockDir.x + iy * this.lockDir.y > 0.9) sign = this.lockSign;  // keep circling while the same direction is held
      else {
        if (Math.abs(d) > 0.3) sign = Math.sign(d);
        else if (Math.abs(t.y) > 0.5) sign = t.y < 0 ? 1 : -1;   // pushing into a wall = climb up it
        else if (this.ny > 0.5 && iy > 0.5) drop = true;          // push down while upside down = let go
        this.lockDir = { x: ix, y: iy }; this.lockSign = sign;
      }
    } else this.lockDir = null;
    if (drop) { this.detach(this.sv * tangentOf(this).x, 30); SFX.play('drop'); return; }
    // Mario-like acceleration: walk -> ease into a sprint -> slide to a stop on release
    if (sign !== 0) {
      if (sign !== this.holdSign) { this.holdT = 0; this.holdSign = sign; }
      this.holdT += dt;
      const sprintK = smooth01((this.holdT - SP.SPRINT_DELAY) / SP.SPRINT_RAMP);
      const maxS = (SP.WALK + (SP.SPRINT - SP.WALK) * sprintK) * speedMul * Math.min(1, mag * 1.2);
      const target = sign * maxS;
      const acc = this.sv * sign < 0 ? SP.TURN : SP.ACC;
      this.sv = approach(this.sv, target, acc * dt);
      if (Math.abs(this.sv) > maxS && this.sv * sign > 0) this.sv = approach(this.sv, target, SP.FRIC * dt);
    } else {
      this.holdT = 0; this.holdSign = 0;
      this.sv = approach(this.sv, 0, SP.FRIC * dt);
    }
    if (Math.abs(this.sv) > 0.5) {
      // move in small steps so fast sprints still handle corners
      const total = this.sv * dt, n = Math.max(1, Math.ceil(Math.abs(total) / 3));
      for (let i = 0; i < n; i++) {
        const res = crawlMove(this, total / n, null);
        if (res === 'blocked') { this.sv = 0; break; }
      }
      if (this.sv) { this.facing = Math.sign(this.sv); this.walkPhase += Math.abs(this.sv) * dt * 0.45; this.gear += this.sv * dt * 0.08; }
    }
    syncStuck(this);
    if (c.jump && !lock) this.jump(c, W);
  }

  updateAir(dt, c, W, speedMul) {
    const max = SP.AIR_MAX * speedMul;
    if (Math.abs(c.mx) > 0.15) {
      const target = c.mx * max;
      // never bleed off momentum faster than max from a sprint-jump / swing release
      if (!(Math.abs(this.vx) > max && Math.sign(this.vx) === Math.sign(c.mx))) this.vx = approach(this.vx, target, SP.AIR_ACC * dt);
      else this.vx = approach(this.vx, target, SP.AIR_DRAG * 0.5 * dt);
    } else this.vx = approach(this.vx, 0, SP.AIR_DRAG * dt);
    this.vy = Math.min(this.vy + G * dt, SP.MAX_FALL);
    const hit = this.fly(dt);
    if (hit) this.land(hit, W);
    else if (Math.abs(this.vx) > 10) this.facing = this.vx > 0 ? 1 : -1;
  }

  updateRope(dt, c, W) {
    const R = this.rope;
    if (c.jump) { // jump off the end of the rope, keeping momentum
      this.state = 'air'; this.rope = null; this.vy -= 70; this.noStickT = 0.08; SFX.play('release');
      return;
    }
    const steps = 4, sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vy += G * sdt;
      let dx = this.x - R.ax, dy = this.y - R.ay, d = Math.hypot(dx, dy) || 0.001;
      const ux = dx / d, uy = dy / d, tx = -uy, ty = ux;
      // pump: push along the swing tangent
      if (Math.abs(c.mx) > 0.15) { const f = c.mx * SP.ROPE_PUMP * tx; this.vx += f * tx * sdt; this.vy += f * ty * sdt; }
      // the web slowly reels the spider in (hook-shot); up = faster, down = pay out
      let reel = SP.ROPE_REEL;
      if (c.my < -0.4) reel += SP.ROPE_REEL_FAST;
      if (c.my > 0.4) reel = -SP.ROPE_REEL_FAST * 0.8;
      R.len = clamp(R.len - reel * sdt, SP.ROPE_MIN, SP.ROPE_MAX);
      // elastic tension (spring + damping) only when the line is taut
      if (d > R.len) {
        const stretch = d - R.len, vr = this.vx * ux + this.vy * uy;
        const acc = -SP.ROPE_K * stretch - SP.ROPE_DAMP * vr;
        this.vx += ux * acc * sdt; this.vy += uy * acc * sdt;
        const hardMax = R.len * 1.3 + 8;
        if (d > hardMax) { this.x = R.ax + ux * hardMax; this.y = R.ay + uy * hardMax; const vo = this.vx * ux + this.vy * uy; if (vo > 0) { this.vx -= vo * ux; this.vy -= vo * uy; } }
      }
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 520) { this.vx *= 520 / sp; this.vy *= 520 / sp; }
      this.x += this.vx * sdt; this.y += this.vy * sdt;
      if (this.y < WORLD_TOP + this.r) { this.y = WORLD_TOP + this.r; if (this.vy < 0) this.vy = 0; }
      const hit = findCollision(this.x, this.y, this.r, this.noStickT > 0 ? this.noStickPlat : null);
      if (hit) { this.land(hit, W); return; }
    }
    // rope snaps if a different platform cuts the line
    let blocked = false;
    for (const p of PLATS) if (p !== R.plat && segRect(this.x, this.y, R.ax, R.ay, p, 2)) { blocked = true; break; }
    R.blockT = blocked ? R.blockT + dt : 0;
    if (R.blockT > 0.12) { this.state = 'air'; this.rope = null; SFX.play('snap'); burst(W, this.x, this.y, 5, ['#ffffff'], 50, 0.3, 80, 1); }
    if (Math.abs(this.vx) > 15) this.facing = this.vx > 0 ? 1 : -1;
  }

  fly(dt) {
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) * dt / 3)), sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.x += this.vx * sdt; this.y += this.vy * sdt;
      if (this.y < WORLD_TOP + this.r) { this.y = WORLD_TOP + this.r; if (this.vy < 0) this.vy = 0; }
      if (this.x < -40 || this.x > REF_W + 40) this.x = clamp(this.x, -40, REF_W + 40);
      const hit = findCollision(this.x, this.y, this.r, this.noStickT > 0 ? this.noStickPlat : null);
      if (hit) return hit;
    }
    return null;
  }
  land(hit, W) {
    const vx = this.vx, vy = this.vy;
    attachTo(this, hit);
    this.state = 'stuck'; this.rope = null; this.lockDir = null;
    // keep momentum along the new surface (slide on landing)
    const t = tangentOf(this);
    this.sv = clamp((vx * t.x + vy * t.y) * 0.8, -SP.SPRINT, SP.SPRINT);
    this.holdSign = Math.sign(this.sv); this.holdT = Math.abs(this.sv) > SP.WALK ? SP.SPRINT_DELAY + SP.SPRINT_RAMP : 0;
    this.vx = this.vy = 0;
    if (Math.hypot(vx, vy) > 120) { SFX.play('land'); burst(W, this.x - this.nx * 7, this.y - this.ny * 7, 4, ['#e9e2c8', '#ffffff'], 30, 0.3, 50, 1); }
  }
  detach(vx, vy) {
    if (this.state === 'stuck') { this.noStickPlat = this.plat; this.noStickT = 0.15; }
    this.state = 'air'; this.plat = null; this.rope = null; this.vx = vx; this.vy = vy;
  }
  jump(c, W) {
    const t = tangentOf(this), sv = this.sv;
    if (this.ny < -0.5) { this.detach(t.x * sv + c.mx * 25, -SP.JUMP + Math.min(0, t.y * sv)); SFX.play('jump'); }
    else if (this.ny > 0.5) { this.detach(t.x * sv + c.mx * 40, 50); SFX.play('drop'); }
    else { this.detach(this.nx * 175 + c.mx * 30, Math.min(-200, -200 + t.y * sv * 0.6)); SFX.play('jump'); }
    burst(W, this.x - this.nx * 6, this.y - this.ny * 6, 5, ['#e9e2c8', '#c9b98f'], 40, 0.35, 100, 1);
  }
  attachRope(ax, ay, plat) {
    if (!this.alive) return;
    if (this.state === 'stuck' && dist(ax, ay, this.x, this.y) < 16) return;
    const d = dist(ax, ay, this.x, this.y);
    let len = d * 0.97;
    if (this.state === 'stuck') {
      // yank off the surface toward the anchor so the swing starts immediately
      this.noStickPlat = this.plat; this.noStickT = 0.3;
      const t = tangentOf(this), ux = (ax - this.x) / d, uy = (ay - this.y) / d;
      this.vx = t.x * this.sv + ux * 210; this.vy = t.y * this.sv + uy * 210;
      len = d * 0.86;
      if (ay < this.y - 20) len = Math.min(len, Math.max(SP.ROPE_MIN, this.y - ay - 18));   // swing arc clears the floor
    }
    this.state = 'rope'; this.plat = null;
    this.rope = { ax, ay, plat, len: clamp(len, SP.ROPE_MIN, SP.ROPE_MAX), blockT: 0, born: T };
    SFX.play('attach');
  }
  shoot(c, W) {
    if (this.webCD > 0) return;
    const a = aimVector(this, c.shoot, c, W);
    if (!a) return;
    this.webCD = SP.WEB_CD;
    this.sh++;
    this.lastShot = { x: this.x, y: this.y, a: Math.atan2(a.y, a.x) };
    W.webs.push(new WebShot(W, this, this.x, this.y, a.x, a.y, { owner: this }));
    if (Math.abs(a.x) > 0.2 && this.state !== 'stuck') this.facing = a.x > 0 ? 1 : -1;
    SFX.play('web');
  }
  /* Damage from enemies / hazards. kind: hit | sting | fire | kill | stun | water */
  applyHurt(kind, src, W) {
    if (!this.alive) return;
    if (kind === 'stun') { if (this.invuln > 0.8) return; this.stunT = W.D.stun; if (this.state === 'rope') { this.state = 'air'; this.rope = null; } SFX.play('stuck'); floater(W, this.x, this.y - 16, 'WEBBED! MASH!', '#ffffff'); return; }
    if (this.invuln > 0) return;
    if (kind === 'kill') { this.die(W, 'bite', src && src.slot !== undefined ? src.slot : -1); SFX.play('bite'); return; }
    this.hp--;
    this.invuln = 1.6;
    shake(0.3, 4);
    SFX.play(kind === 'sting' ? 'sting' : 'hurt');
    floater(W, this.x, this.y - 14, kind === 'fire' ? 'BURN!' : 'OUCH!', '#ff5a7a');
    burst(W, this.x, this.y, 10, ['#ff5a7a', '#ffffff', '#3a2a5c'], 90, 0.5);
    const away = src ? (this.x >= src.x ? 1 : -1) : -this.facing;
    this.detach(away * 140, -170);
    if (kind === 'sting') this.pauseT = 0.4;   // combat recoil + brief pause = escape window
    if (this.hp <= 0) this.die(W, kind, -1);
  }
  die(W, cause, by) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.deadT = 0; this.cause = cause; this.killedBy = by;
    this.state = 'air'; this.rope = null; this.vy = -220; this.vx = (Math.random() - 0.5) * 120;
    this.frozenT = 0; this.stunT = 0;
    SFX.play('death');
    burst(W, this.x, this.y, 16, ['#ff5a7a', '#ffffff', SPIDER_COLORS[this.style.c % 6].light], 120, 0.7);
    if (W.rules.onSpiderDead) W.rules.onSpiderDead(this, cause, by);
  }
  draw(W) {
    if (this.invuln > 0 && this.alive && Math.floor(this.invuln * 14) % 2 === 0 && this.invuln < 1.55) return;
    drawSpider(this.x, this.y, this.drawAngle, this.facing, this.walkPhase, {
      air: this.state !== 'stuck', gear: this.gear, style: this.style, powered: this.powered && this.alive,
      frozen: this.frozenT > 0 || this.stunT > 0, slowed: this.slowT > 0,
    });
  }
}

/* Aim helper: point / direction / "ahead" with gentle aim assist */
function aimVector(sp, shoot, c, W) {
  let dx, dy;
  if (shoot.type === 'point') { dx = shoot.x - sp.x; dy = shoot.y - sp.y; }
  else if (shoot.type === 'dir') { dx = shoot.x; dy = shoot.y; }
  else {
    if (Math.hypot(c.mx, c.my) > 0.35) { dx = c.mx; dy = c.my; if (dy > -0.2 && sp.state !== 'stuck') dy -= 0.6; }
    else { dx = sp.facing * 0.72; dy = -0.7; }
  }
  const m = Math.hypot(dx, dy);
  if (m < 0.001) return null;
  dx /= m; dy /= m;
  // aim assist toward flies / enemies / opponents roughly in the aim direction
  let best = null, bestDot = shoot.type === 'point' ? 0.985 : 0.94;
  const consider = (x, y) => {
    const ex = x - sp.x, ey = y - sp.y, d = Math.hypot(ex, ey);
    if (d < 10 || d > SP.WEB_RANGE) return;
    const dot = (ex * dx + ey * dy) / d;
    if (dot > bestDot && lineOfSight(sp.x, sp.y, x, y)) { bestDot = dot; best = { x: ex / d, y: ey / d }; }
  };
  for (const f of W.flies) if (f.state === 'free') consider(f.x, f.y);
  for (const e of W.enemies) if (e.alive && e.type !== 'hive') consider(e.x, e.y);
  if (W.mode === 'vs') for (const o of W.allSpiders()) if (o !== sp && o.alive && o.team !== sp.team) consider(o.x, o.y);
  return best || { x: dx, y: dy };
}

/* =====================================================================
   WEB SHOT - projectile; becomes a rope on platforms, reels flies,
   traps enemies, and in VS slows/freezes opponents.
   opts.owner  : local SpiderBody (authoritative effects)
   opts.replay : host replaying a remote player's shot (NPC effects only)
   opts.visual : purely cosmetic replay
   ===================================================================== */
class WebShot {
  constructor(W, shooter, x, y, dx, dy, opts) {
    this.x = x; this.y = y; this.sx = x; this.sy = y; this.dx = dx; this.dy = dy;
    this.traveled = 0; this.dead = false;
    this.owner = opts.owner || null;           // SpiderBody when local
    this.shooter = shooter;                    // { id, slot, team, powered, x, y }
    this.replay = !!opts.replay; this.visual = !!opts.visual;
  }
  update(dt, W) {
    const travel = SP.WEB_SPEED * dt, steps = Math.ceil(travel / 3);
    const S = this.shooter;
    for (let k = 0; k < steps && !this.dead; k++) {
      const px = this.x, py = this.y;
      this.x += this.dx * travel / steps; this.y += this.dy * travel / steps; this.traveled += travel / steps;
      // enemies
      for (const e of W.enemies) {
        if (!e.alive || !e.webbable()) continue;
        if (dist(this.x, this.y, e.x, e.y) < e.hitR) {
          if (!this.visual && W.authority) e.onWeb(W, S);
          else burst(W, this.x, this.y, 6, ['#ffffff'], 40, 0.3);
          this.dead = true; break;
        }
      }
      if (this.dead) break;
      // opponents (VS) - shooter-authoritative
      if (W.mode === 'vs' && this.owner) {
        for (const o of W.allSpiders()) {
          if (o === this.owner || !o.alive || o.team === S.team) continue;
          if (dist(this.x, this.y, o.x, o.y) < o.r + 3) { W.rules.onPvPHit(this.owner, o); this.dead = true; break; }
        }
        if (this.dead) break;
      } else if (W.mode === 'vs' && !this.replay) {
        for (const o of W.allSpiders()) if (o.id !== S.id && o.alive && o.team !== S.team && dist(this.x, this.y, o.x, o.y) < o.r + 3) { burst(W, this.x, this.y, 6, ['#ffffff'], 40, 0.3); this.dead = true; break; }
        if (this.dead) break;
      }
      // flies
      if (this.owner) {
        for (const f of W.flies) {
          if (f.state !== 'free') continue;
          if (dist(this.x, this.y, f.x, f.y) < 12) { f.reelTo(this.owner); SFX.play('reel'); this.dead = true; break; }
        }
        if (this.dead) break;
      }
      // platforms
      const p = platAt(this.x, this.y);
      if (p) {
        const ax = clamp(px, p.x, p.x + p.w), ay = clamp(py, p.y, p.y + p.h);
        burst(W, ax, ay, 5, ['#ffffff', '#dfe8f5'], 40, 0.3, 0, 1);
        if (this.owner) this.owner.attachRope(ax, ay, p);
        this.dead = true; break;
      }
      if (this.traveled > SP.WEB_RANGE || this.y < 0 || this.x < -20 || this.x > REF_W + 20 || this.y > REF_H + 20) { burst(W, this.x, this.y, 3, ['#ffffff'], 25, 0.25, 30, 1); this.dead = true; }
    }
  }
  draw(W) {
    const from = this.owner || W.findSpider(this.shooter.id) || this.shooter;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.fillStyle = this.shooter.powered ? '#fff3a0' : '#ffffff';
    ctx.fillRect(Math.round(this.x) - 2, Math.round(this.y) - 2, 4, 4);
    ctx.fillStyle = '#dfe8f5'; ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
  }
}
function drawRope(x, y, R) {
  const d = dist(x, y, R.ax, R.ay), slack = Math.max(0, R.len - d);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y);
  if (slack > 2) ctx.quadraticCurveTo((x + R.ax) / 2, (y + R.ay) / 2 + Math.min(40, slack * 0.7), R.ax, R.ay);
  else ctx.lineTo(R.ax, R.ay);
  ctx.stroke();
  pxCircle(ctx, R.ax, R.ay, 2, '#ffffff');
}

/* =====================================================================
   GOLDEN FLY - buzzes around, bounces off geometry, can be reeled in
   ===================================================================== */
let nextFlyId = 1;
class Fly {
  constructor(x, y, id) {
    this.id = id || nextFlyId++;
    this.x = x; this.y = y; const a = Math.random() * TAU; this.vx = Math.cos(a) * 40; this.vy = Math.sin(a) * 40;
    this.heading = a; this.t = Math.random() * 10; this.state = 'free'; this.reeler = null; this.age = 0;
    this.tx = x; this.ty = y; this.mirror = false;
  }
  reelTo(sp) { this.state = 'reel'; this.reeler = sp; }
  update(dt, W) {
    this.t += dt; this.age += dt;
    if (this.mirror && this.state === 'free') { this.x = lerp(this.x, this.tx, Math.min(1, dt * 10)); this.y = lerp(this.y, this.ty, Math.min(1, dt * 10)); return; }
    if (this.state === 'reel') {
      const s = this.reeler;
      if (!s || !s.alive) { this.state = 'free'; return; }
      const dx = s.x - this.x, dy = s.y - this.y, d = Math.hypot(dx, dy);
      const sp = 340;
      if (d < 8) { W.collectFly(this, s); return; }
      this.x += dx / d * sp * dt; this.y += dy / d * sp * dt;
      return;
    }
    // buzzing: wandering heading + jitter, bounce off platforms
    this.heading += (Math.sin(this.t * 2.3) * 2.2 + (Math.random() - 0.5) * 6) * dt;
    const spd = 42 + Math.sin(this.t * 1.7) * 14;
    this.vx = lerp(this.vx, Math.cos(this.heading) * spd, Math.min(1, dt * 3));
    this.vy = lerp(this.vy, Math.sin(this.heading) * spd, Math.min(1, dt * 3));
    this.x += this.vx * dt; this.y += this.vy * dt + Math.sin(this.t * 9) * 0.3;
    if (pushOut(this, 5)) { this.heading = Math.atan2(this.vy, this.vx) + (Math.random() - 0.5); }
    const floor = Math.min(GROUND_Y - 10, WATER_Y - 18);
    if (this.x < 26) { this.x = 26; this.heading = (Math.random() - 0.5); }
    if (this.x > REF_W - 26) { this.x = REF_W - 26; this.heading = Math.PI + (Math.random() - 0.5); }
    if (this.y < 26) { this.y = 26; this.heading = Math.PI / 2 + (Math.random() - 0.5); }
    if (this.y > floor) { this.y = floor; this.heading = -Math.PI / 2 + (Math.random() - 0.5); }
  }
  draw() { drawFly(this.x, this.y); }
}

/* =====================================================================
   ENEMIES
   ===================================================================== */
let nextEnemyId = 1;
class Enemy {
  constructor(type, x, y) {
    this.id = nextEnemyId++; this.type = type; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.alive = true; this.frozenT = 0; this.r = 6; this.hitR = 12; this.facing = -1; this.drawAngle = 0;
    this.mirror = false; this.tx = x; this.ty = y; this.respawnT = 0;
  }
  webbable() { return true; }
  biteable() { return this.frozenT > 0; }
  // Generic "web to freeze, then bite" rule used by lizard / gecko / widow
  onWeb(W, S) {
    if (!S.powered) {
      SFX.play('noeffect'); burst(W, this.x, this.y, 8, ['#ffffff', '#b8c0cc'], 50, 0.4);
      floater(W, this.x, this.y - 18, 'NO EFFECT!', '#ffb3c1'); floater(W, this.x, this.y - 6, 'NEED 5 FLIES', '#ffd23f');
      return 'none';
    }
    const was = this.frozenT > 0;
    this.frozenT = W.D.freeze * (this.type === 'widow' ? 0.75 : 1);
    this.cancelAttacks();
    SFX.play('trap'); shake(0.15, 2);
    burst(W, this.x, this.y, 16, ['#ffffff', '#dfe8f5', '#ffd23f'], 90, 0.6);
    floater(W, this.x, this.y - 18, was ? 'MORE WEB!' : 'STUCK!', '#ffffff');
    if (!was && W.rules.onEnemyTrapped) W.rules.onEnemyTrapped(this, S);
    return 'freeze';
  }
  cancelAttacks() {}
  tickFrozen(dt, W) {
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      if (this.frozenT <= 0) { this.frozenT = 0; floater(W, this.x, this.y - 16, 'BROKE FREE!', '#ff8c42'); SFX.play('free'); burst(W, this.x, this.y, 12, ['#ffffff', '#dfe8f5'], 70, 0.5); }
    }
    return this.frozenT > 0;
  }
  defeat(W, by) {
    this.alive = false;
    SFX.play('bite'); shake(0.35, 5);
    burst(W, this.x, this.y, 26, this.burstColors(), 130, 0.8);
    floater(W, this.x, this.y - 18, 'CHOMP!', '#ffd23f');
    if (W.rules.onEnemyDefeated) W.rules.onEnemyDefeated(this, by);
  }
  burstColors() { return ['#ffffff', '#ffd23f']; }
  drawFreezeBar(W) {
    if (this.frozenT <= 0) return;
    const w = 26, frac = clamp(this.frozenT / (W.D.freeze * (this.type === 'widow' ? 0.75 : 1)), 0, 1), yy = this.y - (this.type === 'widow' ? 28 : this.type === 'hive' ? 36 : 22);
    ctx.fillStyle = '#140c26'; ctx.fillRect(Math.round(this.x - w / 2 - 1), Math.round(yy), w + 2, 4);
    ctx.fillStyle = '#dfe8f5'; ctx.fillRect(Math.round(this.x - w / 2), Math.round(yy + 1), Math.round(w * frac), 2);
    if (Math.floor(T * 4) % 2 === 0) drawText('BITE!', this.x, yy - 10, 1, '#ffd23f', 'center', '#140c26');
  }
  /* Net mirroring (VS guests glide toward host positions) */
  glide(dt) { const k = Math.min(1, dt * 12); this.x = lerp(this.x, this.tx, k); this.y = lerp(this.y, this.ty, k); }
}

/* ---------- Crawler helpers shared by lizard / gecko / widow ---------- */
function crawlerFly(e, dt, allow, W) {
  e.noStickT = (e.noStickT || 0) - dt;
  e.vy = Math.min(e.vy + G * dt, 480);
  const steps = Math.max(1, Math.ceil(Math.hypot(e.vx, e.vy) * dt / 3)), sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    e.x += e.vx * sdt; e.y += e.vy * sdt;
    if (e.y < WORLD_TOP + e.r) { e.y = WORLD_TOP + e.r; if (e.vy < 0) e.vy = 0; }
    e.x = clamp(e.x, -30, REF_W + 30);
    const q = findCollision(e.x, e.y, e.r, e.noStickT > 0 ? e.noStickPlat : null);
    if (q) {
      const s = sFromPoint(q, e.r, e.x, e.y), p = perim(q, e.r, s);
      if (!allow || allow(p)) { e.plat = q; e.s = s; e.state = 'stuck'; e.vx = e.vy = 0; syncStuck(e); if (allow) {} else attachTo(e, q); return true; }
      e.x = p.x; e.y = p.y; if (e.vy < 0) e.vy = Math.abs(e.vy) * 0.2; e.vx *= 0.5;
    }
  }
  return false;
}
function jumpToward(e, tx, ty, cap, minT = 0.3, maxT = 0.9, spd = 260) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  let Tt = clamp(d / spd, minT, maxT);
  let vx = dx / Tt, vy = dy / Tt - 0.5 * G * Tt;
  const m = Math.hypot(vx, vy);
  if (m > cap) { vx *= cap / m; vy *= cap / m; }
  e.noStickPlat = e.plat; e.noStickT = 0.14;
  e.state = 'air'; e.plat = null; e.vx = vx; e.vy = vy;
}
function greedyDir(e, tx, ty, allow, look = 6) {
  const cur = dist(e.x, e.y, tx, ty);
  const ev = sg => { const p = perim(e.plat, e.r, e.s + sg * look); return (allow && !allow(p)) || p.y < WORLD_TOP + 2 ? Infinity : dist(p.x, p.y, tx, ty); };
  const dp = ev(1), dm = ev(-1);
  let sign = 0;
  if (Math.min(dp, dm) < cur - 0.25) sign = dp < dm ? 1 : -1;
  return { sign, dp, dm, cur };
}
function headFrom(e, len = 8) {
  const a = e.drawAngle, lx = len * e.facing, ly = -1;
  return { x: e.x + Math.cos(a) * lx - Math.sin(a) * ly, y: e.y + Math.sin(a) * lx + Math.cos(a) * ly, fwd: a + (e.facing < 0 ? Math.PI : 0) };
}
const overWater = x => WATER_Y < Infinity && (x < 100 || x > 540);
const dryAllow = p => p.y + 8 < WATER_Y;

/* HELL MODE fire breath, shared by the crawling enemies */
function hellBreath(e, W, dt, mx, my, ang, target) {
  if (!W.D.hell || e.frozenT > 0) { e.breathT = 0; return false; }
  if (e.fireCD === undefined) e.fireCD = 4 + Math.random() * 4;
  if (e.breathT > 0) {
    e.breathT -= dt;
    for (let i = 0; i < 3; i++) {
      const a = ang + (Math.random() - 0.5) * 0.7, s = 110 + Math.random() * 80;
      W.particles.push({ x: mx, y: my, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, color: pick(Math.random, ['#ff2d00', '#ff8a00', '#ffe45c']), size: 2, grav: -60 });
    }
    for (const t of W.targets()) {
      const dx = t.x - mx, dy = t.y - my, d = Math.hypot(dx, dy);
      if (d < 78 && Math.abs(angDiff(ang, Math.atan2(dy, dx))) < 0.42) W.hurt(t, 'fire', e);
    }
    e.igniteT = (e.igniteT || 0) - dt;
    if (e.igniteT <= 0) {
      e.igniteT = 0.1;
      const a = ang + (Math.random() - 0.5) * 0.7, hit = rayPlat(mx, my, Math.cos(a), Math.sin(a), 80, 3);
      if (hit) W.fire.ignite(hit.plat, hit.x, hit.y, W);
    }
    return true;
  }
  e.fireCD -= dt;
  if (e.fireCD <= 0 && target && dist(mx, my, target.x, target.y) < 105 && lineOfSight(mx, my, target.x, target.y)) {
    e.breathT = 0.9; e.fireCD = 5 + Math.random() * 4; SFX.play('fire');
  }
  return false;
}

/* ---------- LIZARD: slow chaser, floors + walls only, short tongue ---------- */
const lizAllow = p => p.ny <= 0.35 && p.y > WORLD_TOP + 2;
class Lizard extends Enemy {
  constructor(x, y) {
    super('lizard', x, y);
    this.r = 6; this.hitR = 12; this.state = 'air'; this.plat = null; this.s = 0; this.nx = 0; this.ny = -1;
    this.moveSign = 0; this.walk = 0; this.headRel = 0; this.headWorld = 0;
    this.attackCD = 2.5; this.windup = 0; this.tongueT = -1; this.tongueAng = 0; this.tongueHit = false; this.tongueLen = 62;
    this.idleT = 0; this.wanderT = 0; this.wanderSign = 1; this.mouthX = x; this.mouthY = y; this.breathT = 0;
    this.spawn = { x, y };
    const q = findCollision(x, y + 6, this.r + 8); if (q) { attachTo(this, q); this.state = 'stuck'; }
  }
  cancelAttacks() { this.windup = 0; this.tongueT = -1; this.breathT = 0; }
  mirrorStep(dt, W) {
    this.glide(dt);
    const h = headFrom(this);
    this.headWorld = h.fwd + this.headRel;
    this.mouthX = h.x + Math.cos(this.headWorld) * 8; this.mouthY = h.y + Math.sin(this.headWorld) * 8;
    if (this.breathT > 0) for (let i = 0; i < 2; i++) { const a = this.headWorld + (Math.random() - 0.5) * 0.7, s = 110 + Math.random() * 80; W.particles.push({ x: this.mouthX, y: this.mouthY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, color: pick(Math.random, ['#ff2d00', '#ff8a00', '#ffe45c']), size: 2, grav: -60 }); }
  }
  update(dt, W) {
    if (this.mirror) { this.mirrorStep(dt, W); return; }
    const D = W.D, frozen = this.tickFrozen(dt, W);
    const t = W.nearestTarget(this.x, this.y);
    const tx = t ? t.x : this.x, ty = t ? t.y : this.y;
    const busy = this.windup > 0 || this.tongueT >= 0 || this.breathT > 0;
    if (this.state === 'air') crawlerFly(this, dt, lizAllow, W);
    else if (!frozen && !busy && t) {
      let sign = 0;
      const g = greedyDir(this, tx, ty, lizAllow);
      if (this.wanderT > 0) { this.wanderT -= dt; sign = this.wanderSign; }
      else {
        sign = g.sign;
        if (this.moveSign && sign && sign !== this.moveSign && Math.abs(g.dp - g.dm) < 1) sign = this.moveSign;
        if (Math.abs(this.nx) > 0.7 && ((tx - this.x) * this.nx < -4 || ty < this.y - 20)) { const up = this.nx > 0 ? -1 : 1; if ((up > 0 ? g.dp : g.dm) !== Infinity) sign = up; }
        if (sign === 0 && Math.abs(this.nx) > 0.6 && ty > this.y + 10 && (g.dp === Infinity || g.dm === Infinity)) { this.state = 'air'; this.vx = this.nx * 30; this.vy = 0; this.plat = null; }
        if (g.cur < 20) sign = 0;
      }
      if (sign !== 0 && this.state === 'stuck') {
        const speed = 28 * D.speed;
        const res = crawlMove(this, sign * speed * dt, lizAllow);
        if (res === 'blocked') { if (this.wanderT > 0) this.wanderSign *= -1; this.idleT += dt; }
        else { this.moveSign = sign; this.facing = sign; this.walk += speed * dt; this.idleT = 0; }
      } else this.idleT += dt;
      if (this.idleT > 2.5 && g.cur > 100 && this.wanderT <= 0) { this.wanderT = 1.5 + Math.random() * 2; this.wanderSign = Math.random() < 0.5 ? 1 : -1; this.idleT = 0; }
    }
    if (this.state === 'stuck') {
      syncStuck(this);
      if ((this.moveSign === 0 || this.idleT > 0.2) && !busy) { const tg = tangentOf(this), dd = (tx - this.x) * tg.x + (ty - this.y) * tg.y; if (Math.abs(dd) > 4) this.facing = Math.sign(dd); }
    }
    const target = this.state === 'stuck' ? Math.atan2(this.ny, this.nx) + Math.PI / 2 : 0;
    this.drawAngle += angDiff(this.drawAngle, target) * Math.min(1, dt * 10);
    this.aimHead(dt, t, frozen);
    if (frozen || !t) { this.windup = 0; this.tongueT = -1; return; }
    if (hellBreath(this, W, dt, this.mouthX, this.mouthY, this.headWorld, t)) return;
    this.tongue(dt, W, t, D.windup, 2.2 / D.aggro);
  }
  aimHead(dt, t, frozen) {
    const h = headFrom(this);
    let rel;
    if (this.tongueT >= 0) rel = clamp(angDiff(h.fwd, this.tongueAng), -1.3, 1.3);
    else if (t && !frozen && dist(h.x, h.y, t.x, t.y) < 160) rel = clamp(angDiff(h.fwd, Math.atan2(t.y - h.y, t.x - h.x)), -1.3, 1.3);
    else rel = Math.sin(T * 0.8) * 0.15;
    this.headRel += (rel - this.headRel) * Math.min(1, dt * 8);
    this.headWorld = h.fwd + this.headRel;
    this.mouthX = h.x + Math.cos(this.headWorld) * 8; this.mouthY = h.y + Math.sin(this.headWorld) * 8;
  }
  tongue(dt, W, t, windup, cd) {
    this.attackCD -= dt;
    if (this.windup > 0) { this.windup -= dt; if (this.windup <= 0) { this.tongueT = 0; this.tongueHit = false; this.tongueAng = this.headWorld; SFX.play('tongue'); } }
    else if (this.tongueT >= 0) {
      this.tongueT += dt;
      const ext = Math.sin(Math.PI * clamp(this.tongueT / 0.42, 0, 1)) * this.tongueLen;
      const ex = this.mouthX + Math.cos(this.tongueAng) * ext, ey = this.mouthY + Math.sin(this.tongueAng) * ext;
      const hx = this.mouthX - Math.cos(this.tongueAng) * 10, hy = this.mouthY - Math.sin(this.tongueAng) * 10;
      if (!this.tongueHit) for (const tg of W.targets()) if (segCircle(hx, hy, ex, ey, tg.x, tg.y, tg.r - 1)) { this.tongueHit = true; W.hurt(tg, 'hit', this); break; }
      if (this.tongueT >= 0.42) this.tongueT = -1;
    } else if (this.attackCD <= 0 && this.state === 'stuck' && dist(this.mouthX, this.mouthY, t.x, t.y) < this.tongueLen + 6 && lineOfSight(this.mouthX, this.mouthY, t.x, t.y)) {
      this.windup = windup; this.attackCD = cd; SFX.play('windup');
    }
  }
  tongueExt() { if (this.mirror) return this.netExt || 0; return this.tongueT >= 0 ? Math.sin(Math.PI * clamp(this.tongueT / 0.42, 0, 1)) * this.tongueLen : 0; }
  burstColors() { return ['#4fb944', '#c9ec6d', '#ffffff', '#ffd23f']; }
  draw(W) {
    if (!this.alive) return;
    const o = { frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5, air: this.state === 'air', windup: this.windup > 0, mouthOpen: this.windup > 0 || this.tongueT >= 0 || this.breathT > 0, flash: this.windup > 0 && Math.floor(T * 20) % 2 === 0, hell: W.D.hell, fire: this.breathT > 0 };
    drawLizard(this.x, this.y, this.drawAngle, this.facing, this.walk, this.headRel * this.facing, o);
    drawTongue(this);
    this.drawFreezeBar(W);
  }
}
function drawTongue(e) {
  const ext = e.tongueExt();
  if (ext <= 0) return;
  const tx = e.mouthX + Math.cos(e.tongueAng) * ext, ty = e.mouthY + Math.sin(e.tongueAng) * ext;
  ctx.strokeStyle = '#d63a6a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(e.mouthX, e.mouthY); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = '#ff7aa5'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(e.mouthX, e.mouthY); ctx.lineTo(tx, ty); ctx.stroke();
  pxCircle(ctx, tx, ty, 2, '#ff2d6f');
}

/* ---------- GECKO: fast, jumps, sticks to every surface, long tongue ---------- */
class Gecko extends Lizard {
  constructor(x, y) {
    super(x, y);
    this.type = 'gecko'; this.r = 6; this.hitR = 12; this.tongueLen = 128; this.jumpCD = 1.5; this.stallT = 0; this.splashT = 0;
  }
  update(dt, W) {
    if (this.mirror) { this.mirrorStep(dt, W); return; }
    const D = W.D;
    if (this.splashT > 0) { this.splashT -= dt; if (this.splashT <= 0) { this.x = this.spawn.x; this.y = this.spawn.y - 30; this.vx = this.vy = 0; this.state = 'air'; this.invisible = false; } return; }
    const frozen = this.tickFrozen(dt, W);
    const t = W.nearestTarget(this.x, this.y);
    const busy = this.windup > 0 || this.tongueT >= 0 || this.breathT > 0;
    this.jumpCD -= dt;
    if (this.state === 'air') { crawlerFly(this, dt, null, W); if (this.state === 'stuck') this.stallT = 0; }
    else if (!frozen && !busy && t) {
      const g = greedyDir(this, t.x, t.y, dryAllow);
      const speed = 70 * D.speed;
      let moved = false;
      if (g.sign && g.cur > 22) {
        const n = Math.ceil(speed * dt / 3);
        for (let i = 0; i < n; i++) { if (crawlMove(this, g.sign * speed * dt / n, dryAllow) === 'blocked') break; moved = true; }
        if (moved) { this.facing = g.sign; this.walk += speed * dt; }
      }
      this.stallT = moved ? Math.max(0, this.stallT - dt) : this.stallT + dt;
      const los = lineOfSight(this.x, this.y, t.x, t.y);
      const wantJump = (this.stallT > 0.25 + D.react) || (los && g.cur < 190 && g.cur > 60 && Math.random() < dt * 0.9 * D.aggro);
      if (wantJump && this.jumpCD <= 0 && !overWater(t.x)) {
        jumpToward(this, t.x, t.y - 4, 400, 0.3, 0.8, 280);
        this.jumpCD = (1.2 + Math.random()) / D.aggro; this.stallT = 0;
        SFX.play('jump', 0.2);
      }
    }
    if (this.state === 'stuck') {
      syncStuck(this);
      if (t && !busy) { const tg = tangentOf(this), dd = (t.x - this.x) * tg.x + (t.y - this.y) * tg.y; if (Math.abs(dd) > 6 && this.stallT > 0) this.facing = Math.sign(dd); }
    }
    if (this.state === 'air' && this.y + this.r >= WATER_Y) { SFX.play('splash'); burst(W, this.x, WATER_Y, 14, ['#ffffff', '#9ad8ff'], 100, 0.6, 300); this.splashT = 1.4; this.invisible = true; this.state = 'air'; return; }
    const target = this.state === 'stuck' ? Math.atan2(this.ny, this.nx) + Math.PI / 2 : Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.4;
    this.drawAngle += angDiff(this.drawAngle, target) * Math.min(1, dt * 14);
    this.aimHead(dt, t, frozen);
    if (frozen || !t) { this.windup = 0; this.tongueT = -1; return; }
    if (this.state !== 'stuck') return;
    if (hellBreath(this, W, dt, this.mouthX, this.mouthY, this.headWorld, t)) return;
    this.tongue(dt, W, t, D.windup * 0.85, 2.0 / D.aggro);
  }
  burstColors() { return ['#ff8a2a', '#ffd27a', '#2aa8e8', '#ffffff']; }
  draw(W) {
    if (!this.alive || this.invisible) return;
    const o = { frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5, air: this.state === 'air', windup: this.windup > 0, mouthOpen: this.windup > 0 || this.tongueT >= 0 || this.breathT > 0, flash: this.windup > 0 && Math.floor(T * 20) % 2 === 0, hell: W.D.hell, fire: this.breathT > 0 };
    drawGecko(this.x, this.y, this.drawAngle, this.facing, this.walk, this.headRel * this.facing, o);
    drawTongue(this);
    this.drawFreezeBar(W);
  }
}

/* ---------- BLACK WIDOW: boss hunter, dash/pounce on sight, web spit, one bite kills ---------- */
class Widow extends Enemy {
  constructor(x, y, opts = {}) {
    super('widow', x, y);
    this.r = 10; this.hitR = 16; this.state = 'air'; this.plat = null; this.s = 0; this.sv = 0; this.nx = 0; this.ny = -1;
    this.walk = 0; this.attackCD = 2.2; this.windup = 0; this.dashT = 0; this.webCD = 3; this.jumpCD = 1; this.stallT = 0; this.breathT = 0;
    this.speedMul = opts.speedMul || 1; this.spawn = { x, y }; this.dormant = opts.dormant !== undefined ? opts.dormant : 2.5; this.recoverT = 0;
    const q = findCollision(x, y + 6, this.r + 8); if (q) { attachTo(this, q); this.state = 'stuck'; }
  }
  cancelAttacks() { this.windup = 0; this.dashT = 0; this.breathT = 0; }
  update(dt, W) {
    if (this.mirror) { this.glide(dt); return; }
    const D = W.D, frozen = this.tickFrozen(dt, W);
    const t = W.nearestTarget(this.x, this.y);
    this.attackCD -= dt; this.webCD -= dt; this.jumpCD -= dt; this.recoverT -= dt;
    if (this.dormant > 0) { this.dormant -= dt; if (this.state === 'stuck') syncStuck(this); else crawlerFly(this, dt, null, W); return; }
    if (this.state === 'air') { crawlerFly(this, dt, null, W); if (this.state === 'stuck') { if (this.dashT >= 0) this.recoverT = 0.7; this.dashT = 0; } }
    else if (!frozen && t && this.recoverT > 0) { syncStuck(this); }
    else if (!frozen && t) {
      const los = lineOfSight(this.x, this.y, t.x, t.y), d = dist(this.x, this.y, t.x, t.y);
      if (this.windup > 0) {
        this.windup -= dt;
        if (this.windup <= 0) { // attack!
          SFX.play('dash');
          const sameSurface = t.ref && t.ref.state === 'stuck' && t.ref.plat === this.plat;
          if (sameSurface || (d < 60 && Math.random() < 0.5)) { const g = greedyDir(this, t.x, t.y, null, 10); this.dashT = 0.55; this.sv = (g.sign || this.facing) * 300 * this.speedMul; }
          else jumpToward(this, t.x + (t.vx || 0) * 0.15, t.y - 2, 440 * this.speedMul, 0.25, 0.7, 340);
        }
      } else if (this.dashT > 0) {
        this.dashT -= dt;
        const n = Math.ceil(Math.abs(this.sv) * dt / 3);
        for (let i = 0; i < n; i++) if (crawlMove(this, this.sv * dt / n, null) === 'blocked') { this.dashT = 0; break; }
        this.facing = Math.sign(this.sv); this.walk += Math.abs(this.sv) * dt;
        if (this.dashT <= 0) this.recoverT = 0.7;   // catch its breath: escape window
      } else {
        // hunting
        const g = greedyDir(this, t.x, t.y, null);
        const speed = 86 * D.speed * this.speedMul;
        let moved = false;
        if (g.sign && g.cur > 16) {
          const n = Math.ceil(speed * dt / 3);
          for (let i = 0; i < n; i++) { if (crawlMove(this, g.sign * speed * dt / n, null) === 'blocked') break; moved = true; }
          if (moved) { this.facing = g.sign; this.walk += speed * dt; }
        }
        this.stallT = moved ? Math.max(0, this.stallT - dt) : this.stallT + dt;
        if (los && d < 230 && this.attackCD <= 0) { this.windup = D.windup + 0.18; this.attackCD = 2.8 / D.aggro; SFX.play('shriek'); }
        else if (this.stallT > 0.2 + D.react && this.jumpCD <= 0) { jumpToward(this, t.x, t.y - 4, 420 * this.speedMul, 0.3, 0.85, 290); this.jumpCD = 1 / D.aggro; this.stallT = 0; }
        else if (los && d < 280 && d > 50 && this.webCD <= 0) {
          this.webCD = (4.5 + Math.random() * 2) / D.aggro;
          const a = Math.atan2(t.y - this.y, t.x - this.x);
          W.enemyShots.push({ kind: 'web', x: this.x, y: this.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 1.2, src: this });
          SFX.play('webspit');
        }
      }
    }
    if (this.state === 'stuck') syncStuck(this);
    if (this.y + this.r >= WATER_Y) { this.x = this.spawn.x; this.y = this.spawn.y - 30; this.state = 'air'; this.vx = this.vy = 0; }
    const target = this.state === 'stuck' ? Math.atan2(this.ny, this.nx) + Math.PI / 2 : Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.3;
    this.drawAngle += angDiff(this.drawAngle, target) * Math.min(1, dt * 14);
    if (frozen || !t) return;
    // one bite = instant death
    for (const tg of W.targets()) if (dist(this.x, this.y, tg.x, tg.y) < this.r + tg.r - 1) W.hurt(tg, 'kill', this);
    const h = headFrom(this, 9);
    hellBreath(this, W, dt, h.x, h.y, Math.atan2(t.y - h.y, t.x - h.x), t);
  }
  burstColors() { return ['#14141c', '#e8102a', '#ffffff', '#3a3a52']; }
  draw(W) {
    if (!this.alive) return;
    drawWidow(this.x, this.y, this.drawAngle, this.facing, this.walk, { frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5, air: this.state === 'air', windup: this.windup > 0, hell: W.D.hell, mouthOpen: this.breathT > 0 });
    this.drawFreezeBar(W);
  }
}

/* ---------- BEEHIVE + BEES ---------- */
class Hive extends Enemy {
  constructor(x, y, opts = {}) {
    super('hive', x, y);
    this.r = 13; this.hitR = 16; this.spawnT = 1.5; this.invulnerable = !!opts.invulnerable;
    this.swarm = []; for (let i = 0; i < 18; i++) this.swarm.push({ a: Math.random() * TAU, r: 14 + Math.random() * 18, s: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2), y: (Math.random() - 0.5) * 20 });
  }
  onWeb(W, S) {
    if (this.invulnerable) { SFX.play('noeffect'); floater(W, this.x, this.y - 22, 'TOO TOUGH!', '#ffb3c1'); return 'none'; }
    return super.onWeb(W, S);
  }
  update(dt, W) {
    for (const s of this.swarm) s.a += s.s * dt;
    if (this.mirror) return;
    const frozen = this.tickFrozen(dt, W);
    if (frozen) return;
    const bees = W.enemies.filter(e => e.type === 'bee' && e.alive && e.state !== 'fall').length;
    if (bees < W.D.beeMax) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 3.2 / W.D.aggro; W.enemies.push(new Bee(this.x, this.y + 8, this)); SFX.play('buzz'); }
    }
    if (Math.random() < dt * 0.6) SFX.play('buzz', 1.5);
  }
  defeat(W, by) {
    for (const e of W.enemies) if (e.type === 'bee' && e.alive) e.knock(W, null, true);
    super.defeat(W, by);
  }
  burstColors() { return ['#e0a542', '#ffcf2a', '#8a5418', '#ffffff']; }
  draw(W) {
    if (!this.alive) return;
    drawHive(this.x, this.y, { frozen: this.frozenT > 0, shiver: this.frozenT > 0 && this.frozenT < 1.5 });
    if (this.frozenT <= 0) for (const s of this.swarm) { ctx.fillStyle = Math.sin(s.a * 3) > 0 ? '#ffcf2a' : '#1a1a1a'; ctx.fillRect(Math.round(this.x + Math.cos(s.a) * s.r), Math.round(this.y + 4 + s.y + Math.sin(s.a) * s.r * 0.5), 1, 1); }
    this.drawFreezeBar(W);
  }
}
class Bee extends Enemy {
  constructor(x, y, hive) {
    super('bee', x, y);
    this.r = 4; this.hitR = 8; this.hive = hive; this.state = 'patrol'; this.t = Math.random() * 10; this.phase = Math.random() * TAU;
    this.lastSeen = null; this.lostT = 0; this.stateT = 0; this.fireCD = 4 + Math.random() * 3; this.vy = 30;
  }
  biteable() { return false; }
  onWeb(W, S) { this.knock(W, S, false); return 'knock'; }
  knock(W, S, silent) {
    if (this.state === 'fall') return;
    this.state = 'fall'; this.vx = (Math.random() - 0.5) * 60; this.vy = -60;
    if (!silent) { SFX.play('beedown'); floater(W, this.x, this.y - 10, 'BZZT!', '#ffcf2a'); burst(W, this.x, this.y, 8, ['#ffffff', '#ffcf2a'], 60, 0.4); }
    if (W.rules.onBeeDown) W.rules.onBeeDown(this, S);
  }
  update(dt, W) {
    if (this.mirror) { this.glide(dt); return; }
    this.t += dt; this.stateT -= dt;
    if (this.state === 'fall') {
      this.vy += G * dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (platAt(this.x, this.y + 3) || this.y > REF_H + 10 || this.y >= WATER_Y) { this.alive = false; burst(W, this.x, this.y, 6, ['#ffcf2a', '#1a1a1a', '#ffffff'], 50, 0.4); }
      return;
    }
    const D = W.D, spd = 78 * D.speed;
    let tx, ty, acc = 260;
    const t = W.nearestTarget(this.x, this.y);
    const sees = t && dist(this.x, this.y, t.x, t.y) < 230 && lineOfSight(this.x, this.y, t.x, t.y);
    if (this.state === 'retreat') { if (this.stateT <= 0) { this.state = 'hover'; this.stateT = 1.1; } }
    else if (this.state === 'hover') { this.vx *= 0.9; this.vy *= 0.9; if (this.stateT <= 0) this.state = 'patrol'; }
    else if (sees) { this.state = 'chase'; this.lastSeen = { x: t.x, y: t.y }; this.lostT = 0; tx = t.x; ty = t.y; acc = 300 * Math.min(1.6, D.aggro); }
    else if (this.state === 'chase' && this.lastSeen && this.lostT < 1.5) { this.lostT += dt; tx = this.lastSeen.x; ty = this.lastSeen.y; }
    else { this.state = 'patrol'; }
    if (this.state === 'patrol') {
      const h = this.hive && this.hive.alive ? this.hive : { x: 320, y: 120 };
      tx = h.x + Math.cos(this.t * 0.8 + this.phase) * 60; ty = h.y + 10 + Math.sin(this.t * 1.1 + this.phase) * 34;
      acc = 160;
    }
    if (tx !== undefined) {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
      const s = this.state === 'patrol' ? spd * 0.6 : spd;
      this.vx = approach(this.vx, dx / d * s, acc * dt); this.vy = approach(this.vy, dy / d * s, acc * dt);
    }
    this.vx += Math.sin(this.t * 11) * 30 * dt; this.vy += Math.cos(this.t * 13) * 30 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    pushOut(this, 5);
    this.x = clamp(this.x, 8, REF_W - 8); this.y = clamp(this.y, 8, Math.min(GROUND_Y - 6, WATER_Y - 10));
    if (Math.abs(this.vx) > 5) this.facing = this.vx > 0 ? 1 : -1;
    // sting on contact
    if (this.state === 'chase' && t && dist(this.x, this.y, t.x, t.y) < t.r + 5) {
      W.hurt(t, 'sting', this);
      const a = Math.atan2(this.y - t.y, this.x - t.x);
      this.vx = Math.cos(a) * 150; this.vy = Math.sin(a) * 150 - 40;
      this.state = 'retreat'; this.stateT = 0.7;
    }
    // HELL: occasional fireball
    if (D.hell && this.state === 'chase' && t) {
      this.fireCD -= dt;
      if (this.fireCD <= 0 && dist(this.x, this.y, t.x, t.y) < 160) {
        this.fireCD = 4 + Math.random() * 3;
        const a = Math.atan2(t.y - this.y, t.x - this.x);
        W.enemyShots.push({ kind: 'fire', x: this.x, y: this.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 1.0, src: this });
        SFX.play('ignite');
      }
    }
  }
  draw(W) { if (this.alive) drawBee(this.x, this.y, this.facing, { falling: this.state === 'fall', hell: W.D.hell, angry: this.state === 'chase' }); }
}

/* =====================================================================
   FIRE SYSTEM (HELL MODE) - flames creep slowly along wooden platforms
   ===================================================================== */
class FireSystem {
  constructor() { this.nodes = []; }
  ignite(plat, x, y, W) {
    if (!plat || !plat.wood || this.nodes.length >= 70) return;
    const s = sFromPoint(plat, 3, x, y);
    this.add(plat, s, W);
  }
  add(plat, s, W) {
    const L = perimLen(plat, 3);
    s = ((s % L) + L) % L;
    let count = 0;
    for (const n of this.nodes) if (n.plat === plat) { count++; const ds = Math.abs(n.s - s); if (Math.min(ds, L - ds) < 7) return; }
    if (count >= 16) return;
    const p = perim(plat, 3, s);
    if (p.y < WORLD_TOP || p.y > REF_H) return;
    this.nodes.push({ plat, s, x: p.x, y: p.y, nx: p.nx, ny: p.ny, life: 9 + Math.random() * 4, spreadT: 1.2 + Math.random(), seed: Math.random() * 10 });
    if (W) SFX.play('ignite', 0.25);
  }
  update(dt, W) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      n.life -= dt; n.spreadT -= dt;
      if (n.life <= 0) { this.nodes.splice(i, 1); burst(W, n.x, n.y, 3, ['#555', '#888'], 20, 0.6, -30, 1); continue; }
      if (n.spreadT <= 0) { n.spreadT = 1.0 + Math.random() * 0.7; if (Math.random() < 0.75) this.add(n.plat, n.s + (Math.random() < 0.5 ? -9 : 9), W); }
      for (const t of W.targets()) if (dist(t.x, t.y, n.x - n.nx * 2, n.y - n.ny * 2) < t.r + 4) W.hurt(t, 'fire', n);
      if (Math.random() < dt * 3) W.particles.push({ x: n.x, y: n.y - 4, vx: (Math.random() - 0.5) * 10, vy: -30, life: 0.6, max: 0.6, color: '#ffb347', size: 1, grav: -20 });
    }
  }
  draw() {
    for (const n of this.nodes) {
      const sz = 5 + Math.min(1, n.life / 2) * 3;
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(Math.atan2(n.ny, n.nx) + Math.PI / 2);
      drawFlame(0, 2, sz, n.seed);
      ctx.restore();
    }
  }
}

/* =====================================================================
   REMOTE SPIDER - another player's spider, rendered ~130 ms in the past
   ===================================================================== */
const INTERP_DELAY = 130;
class RemoteSpider {
  constructor(id, slot) {
    this.id = id; this.slot = slot; this.local = false; this.isBot = false;
    this.buf = []; this.x = -100; this.y = -100; this.vx = 0; this.vy = 0; this.r = SP.R;
    this.a = 0; this.facing = 1; this.st = 'stuck'; this.alive = true; this.frozenT = 0; this.slowT = 0; this.stunT = 0;
    this.flies = 0; this.style = { c: slot % 6, h: 0, p: 0 }; this.name = 'P' + (slot + 1); this.team = slot;
    this.rope = null; this.walk = 0; this.gear = 0; this.lastRx = 0; this.hp = 3;
  }
  get powered() { return this.flies >= 5; }
  push(s, tRecv) {
    this.buf.push(Object.assign({ t: tRecv }, s));
    if (this.buf.length > 30) this.buf.shift();
    this.lastRx = tRecv;
  }
  update(dt) {
    const rt = nowMs() - INTERP_DELAY, b = this.buf;
    if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
    let k = c.t > a.t ? clamp((rt - a.t) / (c.t - a.t), 0, 1) : 1;
    if (rt > c.t) { // extrapolate briefly
      const ex = Math.min(0.1, (rt - c.t) / 1000);
      a = c; k = 0; this.x = c.x + (c.vx || 0) * ex; this.y = c.y + (c.vy || 0) * ex;
    } else { this.x = lerp(a.x, c.x, k); this.y = lerp(a.y, c.y, k); }
    const src = k < 0.5 ? a : c;
    const ox = this.prevX === undefined ? this.x : this.prevX;
    this.walk += Math.abs(this.x - ox) * 0.45; this.prevX = this.x;
    this.vx = src.vx || 0; this.vy = src.vy || 0;
    this.a = a.a + angDiff(a.a, c.a) * k; this.facing = src.f || 1; this.st = src.st;
    this.alive = !!src.al; this.frozenT = src.frz || 0; this.slowT = src.slw || 0; this.stunT = src.stn || 0;
    this.rope = src.ra ? { ax: src.ra[0], ay: src.ra[1], len: dist(this.x, this.y, src.ra[0], src.ra[1]) } : null;
    this.gear += dt * 4;
  }
  draw() {
    if (this.x < -50) return;
    if (this.rope) drawRope(this.x, this.y, this.rope);
    drawSpider(this.x, this.y, this.alive ? this.a : this.a + T * 9, this.facing, this.walk, {
      air: this.st !== 'stuck', gear: this.gear, style: this.style, powered: this.powered && this.alive,
      frozen: this.frozenT > 0 || this.stunT > 0, slowed: this.slowT > 0,
    });
  }
}
