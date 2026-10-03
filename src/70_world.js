/* =====================================================================
   70_WORLD - the simulation container shared by campaign, VS and warm-up
   ---------------------------------------------------------------------
   Game-mode rules plug in through a `rules` object of callbacks, so the
   same physics/enemy code runs everywhere.
   ===================================================================== */
class World {
  constructor(o) {
    this.mode = o.mode;                         // 'campaign' | 'vs' | 'warmup'
    this.biome = o.biome; this.seed = o.seed >>> 0;
    this.D = o.D || DIFFS[o.diff !== undefined ? o.diff : 1];
    this.authority = o.authority !== false;     // simulates enemies + flies (offline / host)
    this.rules = o.rules || {};
    this.L = generateLevel(this.biome, this.seed);
    PLATS = this.L.plats;
    WATER_Y = this.L.water ? this.L.water.y : Infinity;
    this.spiders = []; this.remotes = new Map();
    this.enemies = []; this.flies = []; this.webs = []; this.enemyShots = [];
    this.fire = new FireSystem(); this.particles = []; this.floaters = [];
    this.starCoin = null; this.time = 0; this.localId = null; this.aim = null;
    this.claimed = new Map();                   // fly id -> time (guest optimistic claims)
    this.ambient = [];
    const ar = rng(this.seed ^ 0x55);
    const n = this.biome >= 3 ? 26 : 4;
    for (let i = 0; i < n; i++) this.ambient.push({ x: ar() * REF_W, y: 40 + ar() * 220, t: ar() * 10, c: pick(ar, ['#ff8cc6', '#ffd23f', '#9ad0ff', '#ffffff']) });
    buildLevelArt(this.L);
  }
  activate() { PLATS = this.L.plats; WATER_Y = this.L.water ? this.L.water.y : Infinity; if (ART.level !== this.L || ART.bw !== BW || ART.bh !== BH) buildLevelArt(this.L); }

  /* ---------- queries ---------- */
  allSpiders() { const a = this.spiders.slice(); for (const r of this.remotes.values()) a.push(r); return a; }
  findSpider(id) { for (const s of this.spiders) if (s.id === id) return s; return this.remotes.get(id) || null; }
  localSpider() { return this.spiders.find(s => s.id === this.localId) || null; }
  targets() {
    const out = [];
    for (const s of this.spiders) if (s.alive) { const st = s.state === 'stuck', tg = st ? tangentOf(s) : null; out.push({ x: s.x, y: s.y, r: s.r, vx: st ? tg.x * s.sv : s.vx, vy: st ? tg.y * s.sv : s.vy, id: s.id, ref: s, local: true }); }
    if (this.authority) for (const s of this.remotes.values()) if (s.alive && s.x > -50) out.push({ x: s.x, y: s.y, r: s.r, vx: s.vx, vy: s.vy, id: s.id, ref: s, local: false });
    return out;
  }
  nearestTarget(x, y) {
    let best = null, bd = Infinity;
    for (const t of this.targets()) { const d = dist(x, y, t.x, t.y); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  hurt(t, kind, src) {
    if (t.local) t.ref.applyHurt(kind, src, this);
    else if (this.rules.onRemoteHurt) this.rules.onRemoteHurt(t.id, kind, src);
  }

  /* ---------- flies ---------- */
  spawnFly(id, kind) {
    for (let tries = 0; tries < 60; tries++) {
      const x = 40 + Math.random() * (REF_W - 80), y = 40 + Math.random() * 220;
      if (y > WATER_Y - 30) continue;
      if (platAt(x, y) || findCollision(x, y, 10)) continue;
      let ok = true;
      for (const s of this.spiders) if (dist(x, y, s.x, s.y) < 70) ok = false;
      if (!ok) continue;
      const f = new Fly(x, y, id, kind);
      this.flies.push(f);
      burst(this, x, y, 8, kind === 'heart' ? ['#ff2d4a', '#ffb3c1'] : ['#fff3a0', '#ffd23f'], 50, 0.4, 0, 1);
      return f;
    }
    return null;
  }
  collectFly(f, sp) {
    const i = this.flies.indexOf(f);
    if (i >= 0) this.flies.splice(i, 1);
    if (f.heart) { if (this.rules.onHeart) this.rules.onHeart(sp, f); else healSpider(this, sp, f.x, f.y); return; }
    burst(this, f.x, f.y, 10, ['#ffd23f', '#fff3a0', '#ffffff'], 80, 0.5);
    if (this.rules.onFlyCollected) this.rules.onFlyCollected(sp, f);
  }

  /* ---------- simulation step ---------- */
  step(dt, controlsFor) {
    this.time += dt;
    if (this.L.movers) {
      // lifts run on a round clock; VS nudges it toward the host's so everyone sees the same positions
      this.moverT = (this.moverT || 0) + dt;
      if (this.moverTarget !== undefined) { const err = this.moverTarget - this.moverT; if (Math.abs(err) > 1) this.moverT = this.moverTarget; else this.moverT += err * Math.min(1, dt * 3); }
      updateMovers(this.L, this.moverT);
    }
    // ropes anchored to a moving lift or the rising sand travel with it
    for (const s of this.spiders) if (s.rope && s.rope.plat && (s.rope.plat.dx || s.rope.plat.dy)) { s.rope.ax += s.rope.plat.dx || 0; s.rope.ay += s.rope.plat.dy || 0; }
    for (const s of this.spiders) s.update(dt, controlsFor(s), this);
    for (const r of this.remotes.values()) r.update(dt);
    for (const e of this.enemies) if (e.alive) e.update(dt, this);
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (!e.alive && (e.type === 'bee' || e.type === 'ant' || e.type === 'fant')) this.enemies.splice(i, 1); }
    for (const w of this.webs) w.update(dt, this);
    this.webs = this.webs.filter(w => !w.dead);
    this.updateEnemyShots(dt);
    if (this.authority) this.fire.update(dt, this);
    for (const f of this.flies.slice()) f.update(dt, this);
    this.flies = this.flies.filter(f => !f.gone);
    // touching a fly collects it
    for (const s of this.spiders) {
      if (!s.alive) continue;
      for (const f of this.flies.slice()) if (f.state === 'free' && dist(s.x, s.y, f.x, f.y) < s.r + (f.heart ? 9 : 6)) { if (!f.heart) SFX.play('fly'); this.collectFly(f, s); }
    }
    // bites: a powered spider touching a frozen enemy defeats it
    for (const s of this.spiders) {
      if (!s.alive || s.immobile) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const can = e.biteCheck ? e.biteCheck(s) : e.biteable() && dist(s.x, s.y, e.x, e.y) < s.r + e.r + 4;
        if (can && this.rules.onEnemyBite) this.rules.onEnemyBite(e, s);
      }
      if (this.mode === 'vs' && s.powered && this.rules.onPvPBite) {
        for (const o of this.allSpiders()) if (o !== s && o.alive && o.team !== s.team && o.frozenT > 0 && dist(s.x, s.y, o.x, o.y) < s.r + o.r + 3) this.rules.onPvPBite(s, o);
      }
    }
    // star coin (campaign)
    if (this.starCoin) {
      const sc = this.starCoin; sc.t += dt;
      if (!sc.landed) {
        const prevY = sc.y;
        sc.vy = Math.min(sc.vy + G * dt, 400); sc.y += sc.vy * dt;
        for (const p of PLATS) if (sc.vy > 0 && sc.x >= p.x - 3 && sc.x <= p.x + p.w + 3 && prevY + 9 <= p.y + 1 + Math.max(0, -(p.dy || 0)) && sc.y + 9 >= p.y) { sc.y = p.y - 9; sc.landed = true; sc.vy = 0; if (p.move) { sc.plat = p; sc.ox = sc.x - p.x; } break; }
        if (sc.y > WATER_Y - 20) { sc.y = WATER_Y - 20; sc.landed = true; sc.vy = 0; }
      }
      if (sc.plat) { sc.x = sc.plat.x + sc.ox; sc.y = sc.plat.y - 9; }
      for (const s of this.spiders) if (s.alive && sc.t > 0.6 && dist(s.x, s.y, sc.x, sc.y) < s.r + 11) { this.starCoin = null; if (this.rules.onStarCoin) this.rules.onStarCoin(s, sc); break; }
      if (this.starCoin && Math.random() < dt * 12) this.particles.push({ x: sc.x + (Math.random() - 0.5) * 16, y: sc.y + (Math.random() - 0.5) * 16, vx: 0, vy: -15, life: 0.5, max: 0.5, color: '#fff3a0', size: 1, grav: 0 });
    }
    // particles / floaters / ambient
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt; if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) { const f = this.floaters[i]; f.life -= dt; f.y -= 22 * dt; if (f.life <= 0) this.floaters.splice(i, 1); }
    for (const a of this.ambient) { a.t += dt; if (this.biome >= 3) { a.x += Math.sin(a.t * 0.5) * 6 * dt; a.y += Math.cos(a.t * 0.7) * 4 * dt; } else { a.x += Math.cos(a.t * 0.7) * 20 * dt; a.y += Math.sin(a.t * 1.3) * 15 * dt; } a.x = clamp(a.x, 20, 620); a.y = clamp(a.y, 30, 290); }
    for (const [id, t] of this.claimed) if (this.time - t > 3) this.claimed.delete(id);
  }
  updateEnemyShots(dt) {
    for (const s of this.enemyShots) {
      s.life -= dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.kind === 'jet') { s.vy += 150 * dt; if (Math.random() < 0.9) this.particles.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 20, vy: 10, life: 0.3, max: 0.3, color: pick(Math.random, ['#9ad8ff', '#ffffff', '#5ab0e8']), size: 1, grav: 200 }); if (s.vy > 0 && s.y > WATER_Y + 2) { s.life = 0; burst(this, s.x, WATER_Y, 5, ['#ffffff', '#9ad8ff'], 40, 0.3, 200, 1); continue; } }
      if (s.kind === 'fire') { s.vy += 60 * dt; if (Math.random() < 0.7) this.particles.push({ x: s.x, y: s.y, vx: 0, vy: -10, life: 0.25, max: 0.25, color: pick(Math.random, ['#ff8a00', '#ffe45c']), size: 2, grav: 0 }); }
      const p = platAt(s.x, s.y);
      if (p) {
        s.life = 0;
        if (s.kind === 'fire') { if (this.authority) this.fire.ignite(p, s.x - s.vx * 0.02, s.y - s.vy * 0.02, this); burst(this, s.x, s.y, 6, ['#ff8a00', '#ffe45c'], 50, 0.3); }
        else if (s.kind === 'jet') burst(this, s.x, s.y, 8, ['#ffffff', '#9ad8ff', '#5ab0e8'], 60, 0.35, 200);
        else burst(this, s.x, s.y, 8, ['#ffffff', '#cccccc'], 40, 0.4);
        continue;
      }
      if (!this.authority) continue;
      for (const t of this.targets()) if (dist(s.x, s.y, t.x, t.y) < t.r + 4) { s.life = 0; this.hurt(t, s.kind === 'fire' ? 'fire' : s.kind === 'jet' ? 'knock' : 'stun', s.kind === 'jet' ? s : s.src || s); burst(this, s.x, s.y, 8, s.kind === 'fire' ? ['#ff8a00', '#ffe45c'] : s.kind === 'jet' ? ['#ffffff', '#9ad8ff', '#5ab0e8'] : ['#ffffff'], 60, 0.4); break; }
    }
    this.enemyShots = this.enemyShots.filter(s => s.life > 0);
  }

  /* ---------- rendering ---------- */
  draw() {
    this.activate();
    let sx = 0, sy = 0;
    if (shakeT > 0) { sx = Math.round((Math.random() - 0.5) * shakeMag * 2); sy = Math.round((Math.random() - 0.5) * shakeMag * 2); }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.drawImage(ART.sky, 0, 0);
    for (const c of ART.clouds) ctx.drawImage(ART.cloudSprites[c.spr], Math.round(c.x), Math.round(c.y));
    if (this.biome === 4) { ctx.save(); ctx.translate(OX, OY); drawFactoryGears(T); ctx.restore(); }
    ctx.drawImage(ART.scene, 0, 0);
    ctx.translate(OX, OY);
    for (const p of PLATS) if (p.dyn) drawDynPlatform(p, this.time);
    drawWheat(this.L, T, false);
    if (this.L.pond) { drawPondPlants(this.L, T, false); drawPondUnder(this.L, T); }
    this.drawAmbient();
    this.fire.draw();
    for (const f of this.flies) f.draw();
    if (this.starCoin) drawStarCoin(this.starCoin.x, this.starCoin.y + (this.starCoin.landed ? Math.sin(T * 3) * 2 : 0));
    for (const e of this.enemies) if (e.type === 'hive') e.draw(this);
    for (const e of this.enemies) if (e.type !== 'hive') e.draw(this);
    for (const s of this.spiders) if (s.rope && s.state === 'rope') drawRope(s.x, s.y, s.rope);
    for (const w of this.webs) w.draw(this);
    this.drawAimGuide();
    for (const r of this.remotes.values()) r.draw();
    for (const s of this.spiders) s.draw(this);
    if (this.mode === 'vs') for (const s of this.allSpiders()) this.drawNameTag(s);
    for (const s of this.enemyShots) {
      if (s.kind === 'fire') { pxCircle(ctx, s.x, s.y, 3, '#ff6a00'); pxCircle(ctx, s.x, s.y, 2, '#ffe45c'); }
      else if (s.kind === 'jet') { const m = Math.hypot(s.vx, s.vy) || 1; for (let k = 0; k < 4; k++) { ctx.fillStyle = k ? '#9ad8ff' : '#ffffff'; ctx.fillRect(Math.round(s.x - s.vx / m * k * 3) - 1, Math.round(s.y - s.vy / m * k * 3) - 1, k ? 2 : 3, k ? 2 : 3); } }
      else { pxCircle(ctx, s.x, s.y, 3, '#e8e8f0'); ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2); }
    }
    for (const p of this.particles) { ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
    ctx.globalAlpha = 1;
    drawWater(this.L, T, this);
    drawWheat(this.L, T, true);
    if (this.L.pond) { drawPondPlants(this.L, T, true); drawSwampLight(this.L, T); }
    for (const f of this.floaters) { ctx.globalAlpha = clamp(f.life * 2, 0, 1); drawText(f.text, f.x, f.y, 1, f.color, 'center', '#140c26'); }
    ctx.globalAlpha = 1;
    // mouse crosshair
    const me = this.localSpider();
    if (me && me.alive && Input.last === 'mouse' && Input.mouse.active && gameplayPointer) {
      const cx = Math.round(Input.mouse.x - OX), cy = Math.round(Input.mouse.y - OY);
      ctx.fillStyle = '#140c26'; ctx.fillRect(cx - 5, cy - 1, 11, 3); ctx.fillRect(cx - 1, cy - 5, 3, 11);
      ctx.fillStyle = me.powered ? '#ffd23f' : '#ffffff'; ctx.fillRect(cx - 4, cy, 3, 1); ctx.fillRect(cx + 2, cy, 3, 1); ctx.fillRect(cx, cy - 4, 1, 3); ctx.fillRect(cx, cy + 2, 1, 3);
    }
    ctx.restore();
  }
  /* rare glowing red heart butterfly: random chance once `elapsed` passes 10 s */
  maybeSpawnHeart(dt, elapsed) {
    if (elapsed < 10 || this.flies.some(f => f.heart)) return;
    if (Math.random() < dt / 50) this.spawnFly(undefined, 'heart');
  }
  drawAmbient() {
    for (const a of this.ambient) {
      if (this.biome === 6) { const gl = 0.5 + 0.5 * Math.sin(a.t * 3); if (gl > 0.3) { ctx.globalAlpha = gl; ctx.fillStyle = '#d8ff70'; ctx.fillRect(Math.round(a.x), Math.round(Math.min(a.y, 270)), 1, 1); ctx.globalAlpha = gl * 0.3; pxCircle(ctx, a.x, Math.min(a.y, 270), 2, '#d8ff70'); ctx.globalAlpha = 1; } continue; }
      if (this.biome === 5) { const gx = Math.round(((a.x + this.time * 40 + a.t * 7) % 680) - 20), gy = Math.round(a.y); ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff0c8'; ctx.fillRect(gx, gy, 2, 1); ctx.globalAlpha = 1; continue; }
      if (this.biome === 4) { ctx.globalAlpha = 0.25 + 0.25 * Math.sin(a.t * 2); ctx.fillStyle = '#cfe0ff'; ctx.fillRect(Math.round(a.x), Math.round(a.y), 1, 1); ctx.globalAlpha = 1; continue; }
      if (this.biome === 3) { if (a.x > 330 && a.y > 80) { ctx.globalAlpha = 0.35 + 0.3 * Math.sin(a.t * 2); ctx.fillStyle = '#ffe3a0'; ctx.fillRect(Math.round(a.x), Math.round(a.y), 1, 1); ctx.globalAlpha = 1; } continue; }
      if (this.biome === 2) { // seagulls
        const fy = Math.round(a.y * 0.4), fx = Math.round(a.x), w = Math.sin(a.t * 6) > 0 ? 1 : 0;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(fx - 3, fy - w, 3, 1); ctx.fillRect(fx + 1, fy - w, 3, 1); ctx.fillRect(fx, fy, 1, 1);
        continue;
      }
      const f = Math.abs(Math.sin(a.t * 14)) * 2;
      ctx.fillStyle = a.c; ctx.fillRect(Math.round(a.x - 1 - f), Math.round(a.y - 1), Math.ceil(f) + 1, 2); ctx.fillRect(Math.round(a.x + 1), Math.round(a.y - 1), Math.ceil(f) + 1, 2);
      ctx.fillStyle = '#2a1a3a'; ctx.fillRect(Math.round(a.x), Math.round(a.y - 1), 1, 3);
    }
  }
  drawNameTag(s) {
    if (s.x < -50 || !s.alive) return;
    const col = SPIDER_COLORS[s.style.c % 6].ui;
    const label = s.name + (s.flies ? ' ' + Math.min(5, s.flies) : '');
    drawText(label, s.x, s.y - 20, 1, col, 'center', '#140c26');
    if (s.powered) drawText('*', s.x + textWidth(label) / 2 + 5, s.y - 20, 1, '#ffd23f', 'left', '#140c26');
  }
  drawAimGuide() {
    const me = this.localSpider(), aim = this.aim;
    if (!settings.aim || !me || !me.alive || !aim) return;
    let dx, dy;
    if (aim.type === 'point') { dx = aim.x - me.x; dy = aim.y - me.y; } else { dx = aim.x; dy = aim.y; }
    const m = Math.hypot(dx, dy); if (m < 0.01) return;
    dx /= m; dy /= m;
    const hit = rayPlat(me.x, me.y, dx, dy, SP.WEB_RANGE, 3);
    const len = hit ? hit.t : SP.WEB_RANGE;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let t = 12; t < len; t += 7) ctx.fillRect(Math.round(me.x + dx * t), Math.round(me.y + dy * t), 1, 1);
    if (hit) { ctx.fillStyle = '#7df06a'; ctx.fillRect(Math.round(hit.x) - 2, Math.round(hit.y), 5, 1); ctx.fillRect(Math.round(hit.x), Math.round(hit.y) - 2, 1, 5); }
  }
}
