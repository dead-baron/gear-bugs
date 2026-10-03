/* =====================================================================
   85_VS - multiplayer VS mode (up to 4 players)
   ---------------------------------------------------------------------
   Authority model (per spec):
   - Host: world (flies, NPC hazards, bots), match phase machine
     wait -> intro -> play -> result -> final, round clock, scores, roster.
   - Each player: their own spider (position, velocity, state, hp...).
   - Shooter-authoritative hits: per-target counters dmg{id:[slow,freeze]}
     and bites bt{id:n}, tagged with round dr. Victims apply until their
     applied counts match. Shots replay from sh counters.
   - Positions are normalized 0..1e4 over REF_W x REF_H.
   ===================================================================== */
const VS_PTS = { fly: 10, bee: 15, lizard: 40, gecko: 40, widow: 60, dll: 80, leg: 10, ant: 5, fant: 8, queen: 60, frog: 70, elim: 50 };
const VS_ROUNDS = 7;                  // Field > Meadow > Island > Barn > Factory > Anthill > Pond
const VS_ROUND_TIME = 100, VS_INTRO = 3.5, VS_RESULT = 5;
const SLOT_COLORS = [0, 1, 2, 4];
const TEAM_NAMES = ['RED TEAM', 'BLUE TEAM'], TEAM_COLORS = ['#ff4d5e', '#4da3ff'];
const nX = x => Math.round(clamp(x, -200, REF_W + 200) / REF_W * 1e4), nY = y => Math.round(clamp(y, -200, REF_H + 200) / REF_H * 1e4);
const dX = v => v / 1e4 * REF_W, dY = v => v / 1e4 * REF_H;
const ENEMY_CODES = { lizard: 1, gecko: 2, widow: 3, hive: 4, bee: 5, dll: 6, ant: 7, fant: 8, queen: 9, nest: 10, frog: 11, archer: 12 };
const VS_DIFF = Object.assign({}, DIFFS[1], { beeMax: 2, freeze: 6 });

const VS = {
  net: null, searchNet: null, kind: 'quick',        // quick | private | bots
  sub: 'idle',                                     // searching | connecting | wait | match | closed
  isHost: false, myId: 'local', mySlot: 0,
  roster: [], mode: 'ffa', phase: 'wait', rn: 0, phaseT: 0, seeds: [], countdown: -1,
  scores: [], W: null, me: null, bots: new Map(), warm: null,
  applied: {}, appliedNpc: { h: 0, k: 0, s: 0, g: 0, f: 0, w: 0 }, npcHits: {}, claims: [], processed: {}, credited: {},
  pres: new Map(), pubT: 0, msg: '', msgT: 0, searchT: 0, botWhileWaiting: false, finalT: 0, rematchClosed: false,
  roundRes: null, respawns: [], lastPhase: '', biteCD: {}, hostId: null, banner: null, flyT: 0,

  /* ---------------- entry points ---------------- */
  reset() {
    if (this.net) { try { this.net.close(); } catch (e) {} }
    if (this.searchNet && this.searchNet !== this.net) { try { this.searchNet.close(); } catch (e) {} }
    this.net = null; this.searchNet = null; this.sub = 'idle'; this.isHost = false; this.myId = 'local'; this.mySlot = 0;
    this.roster = []; this.mode = 'ffa'; this.phase = 'wait'; this.rn = 0; this.phaseT = 0; this.seeds = []; this.countdown = -1;
    this.scores = [0, 1, 2, 3].map(() => this.blankScore());
    this.W = null; this.me = null; this.bots = new Map(); this.applied = {}; this.npcHits = {}; this.claims = []; this.processed = {}; this.credited = {};
    this.pres = new Map(); this.msg = ''; this.msgT = 0; this.searchT = 0; this.botWhileWaiting = false; this.finalT = 0; this.rematchClosed = false;
    this.roundRes = null; this.respawns = []; this.biteCD = {}; this.hostId = null; this.banner = null; this.autoT = -1; this.waitStart = nowMs(); this.ready = false;
    this.appliedNpc = { h: 0, k: 0, s: 0, g: 0, f: 0, w: 0 };
  },
  blankScore() { return { pts: 0, fl: 0, kills: 0, npc: 0, wins: 0, rp: 0 }; },
  startQuick() {
    this.reset(); this.kind = 'quick'; this.sub = 'searching'; this.mode = 'ffa';
    const q = this.searchNet = new QuickMatchAdapter();
    this.wireNet(q);
    q.on('matched', (code, role) => this.onMatched(q, code, role));
    q.on('requeue', () => {
      // couldn't get into that lobby (full / unreachable): keep searching
      this.sub = 'searching'; this.isHost = false; this.roster = []; this.ready = false; this.autoT = -1; this.W = null; this.me = null; this.phase = 'wait';
      this.flash('LOBBY UNAVAILABLE - STILL SEARCHING');
    });
    q.search();
    track('game_start', { mode: 'quick' });
  },
  hostPrivate() {
    this.reset(); this.kind = 'private'; this.sub = 'wait';
    const n = this.net = new TrysteroAdapter();
    this.wireNet(n);
    this.isHost = true; this.mySlot = 0;
    this.code = randomCode();
    n.connect(this.code, 'host');
    this.initHostLobby();
    track('game_start', { mode: 'private_host' });
  },
  joinPrivate(code) {
    this.reset(); this.kind = 'private'; this.sub = 'connecting';
    const n = this.net = new TrysteroAdapter();
    this.wireNet(n);
    this.isHost = false; this.code = code;
    n.connect(code, 'join');
    track('game_start', { mode: 'private_join' });
  },
  botMatch() {
    this.reset(); this.kind = 'bots'; this.sub = 'wait';
    const n = this.net = new NullAdapter();
    this.wireNet(n); n.connect('BOTS', 'host');
    this.isHost = true; this.mySlot = 0; this.myId = 'local';
    this.initHostLobby();
    for (let s = 1; s <= 3; s++) this.addBot(s);
    track('game_start', { mode: 'bots' });
  },
  onMatched(q, code, role) {
    // a lobby was found / opened: use the pool link for it
    this.W = null; this.me = null; this.bots = new Map(); this.phase = 'wait';
    this.scores = [0, 1, 2, 3].map(() => this.blankScore());
    this.net = q; this.code = code;
    this.isHost = role === 'host';
    this.ready = false; this.autoT = -1;
    this.mode = 'ffa';
    if (this.isHost) { this.sub = 'wait'; this.mySlot = 0; this.initHostLobby(); this.flash('PLAYERS FOUND - LOBBY OPEN'); }
    else { this.sub = 'connecting'; this.roster = []; this.flash('LOBBY FOUND - JOINING'); }
    SFX.play('join');
  },
  wireNet(n) {
    n.on('status', () => {
      // the host learns its Trystero peer id once the library has loaded
      if (n === this.net && this.isHost && n.selfId && this.myId !== n.selfId) {
        const old = this.myId; this.myId = n.selfId;
        for (const r of this.roster) if (r.id === old) r.id = n.selfId;
        if (this.me) this.me.id = n.selfId;
        if (this.W && this.W.localId === old) this.W.localId = n.selfId;
      }
    });
    n.on('join', (id, slot) => this.onJoin(n, id, slot));
    n.on('linked', (slot, hostId) => { if (n !== this.net) return; this.mySlot = slot; this.hostId = hostId; this.myId = n.selfId; this.sub = 'wait'; SFX.play('join'); if (this.kind === 'quick') this.flash('JOINED THE LOBBY!'); });
    n.on('state', (id, d) => { if (n === this.net) this.onPresence(id, d); });
    n.on('fire', (id, d) => { if (n === this.net) this.onFire(id, d); });
    n.on('snapshot', (w, id) => { if (n === this.net && !this.isHost) this.onSnapshot(w); });
    n.on('leave', (id, why) => { if (n === this.net) this.onLeave(id, why); });
    n.on('hostleft', () => { if (n !== this.net) return; this.flash('HOST LEFT THE MATCH'); this.endToMenu(2.5); });
    n.on('full', () => { if (n !== this.net) return; if (this.kind === 'quick') return; else { this.flash('ROOM FULL OR MATCH IN PROGRESS'); this.endToMenu(2.5); } });
    n.on('code', c => { this.code = c; this.flash('NEW ROOM CODE ' + c); });
    n.on('error', e => { if (n !== this.net && n !== this.searchNet) return; this.flash(e === 'lib' ? "COULDN'T LOAD MULTIPLAYER" : 'NETWORK ERROR'); if (e === 'lib') this.endToMenu(3); });
  },
  flash(m) { this.msg = m; this.msgT = 3; },
  endToMenu(delay) {
    this.sub = 'closed';
    setTimeout(() => { if (VS.sub === 'closed') { VS.reset(); setScene('menu'); } }, delay * 1000);
  },
  leave() {
    if (this.net && this.net.role === 'join' && !this.net.isLinked && this.net.attempt) track('connect_abandon', { attempts: this.net.attempt });
    this.reset(); setScene('menu');
  },

  /* ---------------- roster (host) ---------------- */
  initHostLobby() {
    this.myId = this.net.selfId || 'local';
    this.roster = [{ slot: 0, id: this.myId, name: 'P1', style: Object.assign({}, save.style), bot: false }];
    this.autoT = -1;
  },
  humans() { return this.roster.filter(r => !r.bot); },
  active() { return this.roster.filter(r => !r.spec); },           // players in the current round (not spectating)
  backToLobby(msg) {
    this.phase = 'wait'; this.sub = 'wait'; this.W = null; this.me = null; this.bots = new Map();
    this.ready = false; this.autoT = -1; this.roundRes = null;
    for (const r of this.roster) { r.spec = false; r.ready = false; }
    this.scores = [0, 1, 2, 3].map(() => this.blankScore());
    if (this.net) this.net.matchStarted = false;
    if (msg) this.flash(msg);
  },
  addBot(slot) {
    if (slot === undefined) { const used = new Set(this.roster.map(r => r.slot)); for (let s = 1; s <= 3; s++) if (!used.has(s)) { slot = s; break; } }
    if (slot === undefined || this.roster.some(r => r.slot === slot)) return;
    this.roster.push({ slot, id: 'bot' + slot, name: 'BOT' + (slot + 1), style: { c: SLOT_COLORS[slot], h: [0, 5, 2, 6][slot], p: [0, 1, 2, 3][slot] }, bot: true });
    this.roster.sort((a, b) => a.slot - b.slot);
  },
  removeBot() { for (let i = this.roster.length - 1; i >= 0; i--) if (this.roster[i].bot) { this.roster.splice(i, 1); return; } },
  onJoin(n, id, slot) {
    if (n !== this.net || !this.isHost) return;
    this.roster = this.roster.filter(r => r.slot !== slot && r.id !== id);
    const midMatch = this.phase !== 'wait' && this.phase !== 'final';
    this.roster.push({ slot, id, name: 'P' + (slot + 1), style: { c: SLOT_COLORS[slot], h: 0, p: 0 }, bot: false, spec: midMatch });
    this.roster.sort((a, b) => a.slot - b.slot);
    if (this.phase !== 'wait') this.scores[slot] = this.blankScore();
    SFX.play('join'); this.flash('P' + (slot + 1) + (midMatch ? ' JOINED - PLAYS NEXT ROUND' : ' JOINED'));
    if (this.kind === 'quick' && this.phase === 'wait' && this.autoT >= 0) this.autoT = Math.max(this.autoT, 15);   // give the newcomer time
    if (this.kind !== 'quick' && this.humans().length >= 4 && this.phase === 'wait') this.autoT = Math.min(this.autoT < 0 ? 3 : this.autoT, 3);
  },
  onLeave(id, why) {
    const W = this.W;
    if (W) W.remotes.delete(id);
    this.pres.delete(id);
    if (!this.isHost) return;
    const r = this.roster.find(x => x.id === id);
    if (!r) return;
    SFX.play('leave'); this.flash(r.name + ' LEFT');
    if (this.kind === 'quick') {
      this.roster = this.roster.filter(x => x !== r);
      if (W) W.remotes.delete(id);
      if (this.phase !== 'wait' && this.phase !== 'final' && this.active().length < 2) this.backToLobby('NOT ENOUGH PLAYERS - BACK TO THE LOBBY');
      return;
    }
    if (this.phase === 'wait' || this.phase === 'final') {
      this.roster = this.roster.filter(x => x !== r);
      if (this.net && this.net.peers && this.kind !== 'bots') this.net.matchStarted = false;   // reopen a clean slot
    } else {
      // hand the slot to a bot so the match continues
      r.bot = true; r.id = 'bot' + r.slot; r.name = 'BOT' + (r.slot + 1);
      if (W) {
        const last = this.lastPos && this.lastPos[id];
        const sp = W.L.spawns[r.slot];
        const b = new SpiderBody(r.id, last ? last.x : sp.x, last ? last.y : sp.y, { slot: r.slot, style: r.style, name: r.name, bot: true, team: this.teamOf(r.slot) });
        if (last && !last.al) { b.alive = false; b.hp = 0; }
        b.flies = this.scores[r.slot].fl;
        W.spiders.push(b); this.bots.set(r.slot, { body: b, brain: new BotBrain(b) });
      }
    }
  },
  effectiveStyles() {
    // resolve color clashes by slot: lower slot keeps its pick
    const used = new Set();
    for (const r of this.roster.slice().sort((a, b) => a.slot - b.slot)) {
      let c = r.style.c % SPIDER_COLORS.length;
      if (used.has(c)) { c = SLOT_COLORS[r.slot]; if (used.has(c)) { for (let k = 0; k < SPIDER_COLORS.length; k++) if (!used.has(k)) { c = k; break; } } }
      used.add(c);
      r.eff = { c, h: r.style.h, p: r.style.p };
    }
  },
  teamOf(slot) { return this.mode === '2v2' ? slot % 2 : slot; },
  canStart() {
    const n = this.roster.length, h = this.humans().length;
    if (this.mode === '1v1') return h <= 2 && n >= 1;
    if (this.mode === '2v2') return h <= 4;
    return n >= 2;
  },
  cycleMode(dir = 1) {
    const modes = ['ffa', '1v1', '2v2'];
    let i = modes.indexOf(this.mode);
    for (let k = 0; k < 3; k++) { i = (i + dir + 3) % 3; const m = modes[i]; if (m === '1v1' && this.humans().length > 2) continue; this.mode = m; break; }
    SFX.play('select');
  },

  /* ---------------- match flow (host) ---------------- */
  startMatch() {
    if (!this.isHost) return;
    // fill / trim participants for the chosen mode
    if (this.mode === '1v1') { while (this.roster.length > 2) { const i = this.roster.findIndex(r => r.bot); if (i < 0) break; this.roster.splice(i, 1); } if (this.roster.length < 2) this.addBot(); }
    else if (this.kind === 'quick') { this.mode = 'ffa'; this.roster = this.roster.filter(r => !r.bot); }
    else if (this.mode === '2v2') { while (this.roster.length < 4) this.addBot(); }
    else if (this.roster.length < 2) this.addBot();
    if (this.net) this.net.matchStarted = true;
    this.effectiveStyles();
    this.scores = [0, 1, 2, 3].map(() => this.blankScore());
    this.seeds = Array.from({ length: VS_ROUNDS }, () => (Math.random() * 0xFFFFFFFF) >>> 0);
    this.rematchClosed = false;
    this.beginRound(0);
    this.sub = 'match';
    track('game_start', { mode: 'vs_' + this.mode, players: this.humans().length });
  },
  beginRound(rn) {
    for (const r of this.roster) r.spec = false;
    this.rn = rn; this.phase = 'intro'; this.phaseT = VS_INTRO;
    for (const s of this.scores) { s.fl = 0; s.rp = 0; }
    this.npcHits = {}; this.processed = {}; this.credited = {}; this.respawns = []; this.biteCD = {};
    this.buildRoundWorld();
  },
  buildRoundWorld() {
    const rn = this.rn;
    const W = this.W = new World({ mode: 'vs', biome: rn, seed: this.seeds[rn] || 1, D: VS_DIFF, authority: this.isHost, rules: this.rules() });
    this.effectiveStyles();
    const meR = this.roster.find(r => r.slot === this.mySlot) || { slot: this.mySlot, name: 'P' + (this.mySlot + 1), eff: save.style };
    const sp = W.L.spawns[this.mySlot] || W.L.spawns[0];
    this.me = new SpiderBody(this.myId, sp.x, sp.y, { slot: this.mySlot, style: meR.eff || save.style, name: meR.name, team: this.teamOf(this.mySlot), facing: sp.x < 320 ? 1 : -1 });
    W.spiders.push(this.me); W.localId = this.myId;
    if (meR.spec) { const m = this.me; m.spectator = true; m.alive = false; m.hp = 0; m.x = -999; m.y = 9999; m.vx = m.vy = 0; }
    this.applied = {}; this.appliedNpc = { h: 0, k: 0, s: 0, g: 0, f: 0, w: 0 }; this.claims = [];
    this.bots = new Map();
    if (this.isHost) {
      for (const r of this.roster) if (r.bot) {
        const s = W.L.spawns[r.slot];
        const b = new SpiderBody(r.id, s.x, s.y, { slot: r.slot, style: r.eff, name: r.name, bot: true, team: this.teamOf(r.slot), facing: s.x < 320 ? 1 : -1 });
        W.spiders.push(b); this.bots.set(r.slot, { body: b, brain: new BotBrain(b) });
      }
      this.spawnHazard(rn);
      for (let i = 0; i < 3; i++) W.spawnFly();
      this.flyT = 1;
    }
    this.banner = meR.spec ? { text: 'SPECTATING', sub: 'YOU JOIN AT THE START OF THE NEXT ROUND', t: 3, max: 3, color: '#9ad0ff' }
                           : { text: 'ROUND ' + (rn + 1) + '/' + VS_ROUNDS, sub: BIOMES[rn].name + ' - FIRST TO 5 FLIES GETS THE POWER', t: VS_INTRO, max: VS_INTRO, color: '#ffd23f' };
    SFX.play('round');
  },
  spawnHazard(rn, type) {
    const W = this.W, L = W.L;
    if (rn === 0) W.enemies.push(new Lizard(320, L.spawns[0].y));
    else if (rn === 1) W.enemies.push(new Hive(L.hive.x, L.hive.y, { invulnerable: true }));
    else if (rn === 2) W.enemies.push(new Gecko(320, L.spawns[0].y));
    else if (rn === 3) W.enemies.push(new Widow(L.enemySpawn.x, L.enemySpawn.y, { speedMul: 0.75, plat: L.enemySpawn.plat }));
    else if (rn === 4) W.enemies.push(new LongLegs(L.enemySpawn.x, L.enemySpawn.y, VS_DIFF, { legs: 4 }));
    else if (rn === 5) W.enemies.push(new Nest(W));     // the first player to 5 flies bursts the nest
    else { W.enemies.push(new Frog(L.enemySpawn.x, L.enemySpawn.y, VS_DIFF)); if (!type) spawnArcherFish(W); }
  },
  /* seconds since this round's intro began - drives the factory lifts identically for everyone */
  roundClock() { return this.phase === 'intro' ? VS_INTRO - this.phaseT : this.phase === 'play' ? VS_INTRO + VS_ROUND_TIME - this.phaseT : undefined; },
  rules() {
    const V = this;
    return {
      onFlyCollected(sp, f) {
        if (V.phase !== 'play') return;
        if (V.isHost) V.awardFly(sp.slot, f);
        else if (sp === V.me) { V.claims.push(f.id); if (V.claims.length > 12) V.claims.shift(); V.W.claimed.set(f.id, V.W.time); floater(V.W, f.x, f.y - 10, '+1', '#ffd23f'); }
      },
      onHeart(sp, f) {
        if (V.phase !== 'play') return;
        if (sp.local) healSpider(V.W, sp, f.x, f.y);
        if (!V.isHost && sp === V.me) { V.claims.push(f.id); if (V.claims.length > 12) V.claims.shift(); V.W.claimed.set(f.id, V.W.time); }
      },
      onPvPHit(shooter, target) {
        const k = shooter.dmg[target.id] || (shooter.dmg[target.id] = [0, 0]);
        if (shooter.powered) { k[1]++; SFX.play('trap'); floater(V.W, target.x, target.y - 16, 'FROZEN!', '#ffffff'); }
        else { k[0]++; SFX.play('slow'); floater(V.W, target.x, target.y - 16, 'SLOWED!', '#9ad0ff'); }
      },
      onPvPBite(biter, victim) {
        const key = biter.id + '>' + victim.id;
        if (V.biteCD[key] && V.W.time - V.biteCD[key] < 1.5) return;
        V.biteCD[key] = V.W.time;
        biter.bites[victim.id] = (biter.bites[victim.id] || 0) + 1;
        SFX.play('bite'); floater(V.W, victim.x, victim.y - 16, 'CHOMP!', '#ffd23f');
      },
      onEnemyBite(e, sp) { if (V.isHost && sp.powered && e.alive && e.type !== 'hive') e.defeat(V.W, sp.slot); },
      onBossPhase(e, what, bySlot) { if (V.isHost && what === 'leg' && bySlot !== undefined && bySlot >= 0) V.addPts(bySlot, VS_PTS.leg); },
      onEnemyDefeated(e, bySlot) {
        if (!V.isHost) return;
        if (bySlot !== undefined && bySlot >= 0) V.addPts(bySlot, VS_PTS[e.type] || 30, 'npc');
        V.respawns.push({ type: e.type, t: 10 });
      },
      onFlyEaten() { V.flyT = 3; },
      onBeeDown(bee, S) { if (V.isHost && S && S.slot !== undefined) V.addPts(S.slot, VS_PTS[bee.type] || VS_PTS.bee, 'npc'); },
      onRemoteHurt(id, kind, src) {
        const r = V.roster.find(x => x.id === id);
        if (!r) return;
        const h = V.npcHits[r.slot] || (V.npcHits[r.slot] = { h: 0, k: 0, s: 0, g: 0, f: 0, w: 0 });
        const key = kind === 'kill' ? 'k' : kind === 'stun' ? 's' : kind === 'sting' ? 'g' : kind === 'fire' ? 'f' : kind === 'knock' ? 'w' : 'h';
        const cdk = id + key;
        if (V.biteCD[cdk] && V.W.time - V.biteCD[cdk] < 1.6) return;   // mirror the victim's invulnerability window
        V.biteCD[cdk] = V.W.time;
        h[key]++;
      },
      onSpiderDead(sp, cause, by) {
        if (sp === V.me) { V.myDeath = { cause, by }; }
        if (V.isHost) V.creditDeath(sp.slot, by);
      },
    };
  },
  addPts(slot, n, kind) {
    const s = this.scores[slot]; if (!s) return;
    s.pts += n; s.rp += n;
    if (kind === 'npc') s.npc++;
  },
  awardFly(slot, f) {
    const s = this.scores[slot]; if (!s) return;
    if (s.fl >= 5) { this.addPts(slot, 2); return; }
    s.fl++; this.addPts(slot, VS_PTS.fly);
    const body = this.bodyForSlot(slot);
    if (body) body.flies = s.fl;
    if (s.fl === 5) { const r = this.roster.find(x => x.slot === slot); if (this.W) { floater(this.W, f.x, f.y - 20, (r ? r.name : '') + ' POWERED UP!', '#ffd23f'); SFX.play('powerup'); } }
  },
  bodyForSlot(slot) { if (slot === this.mySlot) return this.me; const b = this.bots.get(slot); return b ? b.body : null; },
  creditDeath(victimSlot, bySlot) {
    if (this.credited[victimSlot]) return;
    this.credited[victimSlot] = true;
    if (bySlot !== undefined && bySlot >= 0 && bySlot !== victimSlot && this.teamOf(bySlot) !== this.teamOf(victimSlot)) { this.scores[bySlot].kills++; this.addPts(bySlot, VS_PTS.elim); }
  },
  aliveBySlot() {
    const out = {};
    for (const r of this.active()) {
      if (r.slot === this.mySlot) out[r.slot] = this.me ? this.me.alive : true;
      else if (r.bot) { const b = this.bots.get(r.slot); out[r.slot] = b ? b.body.alive : false; }
      else { const p = this.pres.get(r.id); out[r.slot] = p && p.dr === this.rn ? !!p.al : true; }
    }
    return out;
  },
  hostPhaseTick(dt) {
    this.phaseT -= dt;
    if (this.phase === 'intro' && this.phaseT <= 0) { this.phase = 'play'; this.phaseT = VS_ROUND_TIME; SFX.play('go'); }
    else if (this.phase === 'play') {
      const alive = this.aliveBySlot();
      const teams = new Set(this.active().map(r => this.teamOf(r.slot)));
      const aliveTeams = new Set(this.active().filter(r => alive[r.slot]).map(r => this.teamOf(r.slot)));
      if ((teams.size >= 2 && aliveTeams.size <= 1) || this.phaseT <= 0) this.endRound(alive, aliveTeams);
      // keep flies buzzing
      if (this.W.flies.filter(f => !f.heart).length < 4) { this.flyT -= dt; if (this.flyT <= 0) { this.W.spawnFly(); this.flyT = 1.5; } }
      this.W.maybeSpawnHeart(dt, VS_ROUND_TIME - this.phaseT);
      for (const r of this.respawns) { r.t -= dt; if (r.t <= 0) { r.done = true; this.spawnHazard(this.rn, r.type); } }
      this.respawns = this.respawns.filter(r => !r.done);
    } else if (this.phase === 'result' && this.phaseT <= 0) {
      if (this.rn < VS_ROUNDS - 1) this.beginRound(this.rn + 1);
      else { this.phase = 'final'; this.phaseT = 60; this.finalT = 0; SFX.play('complete'); track('match_end', { mode: this.mode, humans: this.humans().length }); }
    }
  },
  endRound(alive, aliveTeams) {
    let winTeam = -1, why = '';
    if (aliveTeams.size === 1 && this.phaseT > 0) { winTeam = [...aliveTeams][0]; why = 'LAST SPIDER STANDING'; }
    else {
      const tp = {};
      for (const r of this.active()) { const t = this.teamOf(r.slot); tp[t] = (tp[t] || 0) + this.scores[r.slot].rp + (alive[r.slot] ? 1 : 0); }
      const sorted = Object.entries(tp).sort((a, b) => b[1] - a[1]);
      if (sorted.length && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) { winTeam = +sorted[0][0]; why = 'TIME UP - MOST POINTS'; }
      else why = 'TIME UP - TIED';
    }
    let res = 'DRAW!';
    if (winTeam >= 0) {
      for (const r of this.active()) if (this.teamOf(r.slot) === winTeam) this.scores[r.slot].wins++;
      res = this.mode === '2v2' ? TEAM_NAMES[winTeam] + ' WINS!' : ((this.roster.find(r => r.slot === winTeam) || {}).name || '?') + ' WINS THE ROUND!';
    }
    this.roundRes = { res, why, team: winTeam };
    this.phase = 'result'; this.phaseT = VS_RESULT;
    SFX.play('complete');
    track('round_end', { mode: this.mode, round: this.rn + 1 });
  },
  rematch() {
    if (!this.isHost || this.phase !== 'final' || this.rematchClosed) return;
    this.roster = this.roster.filter(r => r.bot || r.id === this.myId || this.net.peers && this.net.peers.has(r.id));
    this.startMatch();
  },

  /* ---------------- presence / snapshot ---------------- */
  presenceOf(sp) {
    const shotA = Math.round(sp.lastShot.a * 1000);
    return {
      v: 1, on: 1, s: sp.slot, nm: sp.name, cz: [sp.style.c, sp.style.h, sp.style.p],
      x: nX(sp.x), y: nY(sp.y), vx: Math.round(sp.state === 'stuck' ? tangentOf(sp).x * sp.sv : sp.vx || 0), vy: Math.round(sp.state === 'stuck' ? tangentOf(sp).y * sp.sv : sp.vy || 0), a: Math.round(sp.drawAngle * 100), f: sp.facing,
      st: sp.state === 'stuck' ? 's' : sp.state === 'rope' ? 'r' : 'a', al: sp.alive ? 1 : 0, hp: sp.hp,
      frz: Math.round(sp.frozenT * 10) / 10, slw: Math.round(sp.slowT * 10) / 10, stn: Math.round(sp.stunT * 10) / 10,
      sh: sp.sh, sx: nX(sp.lastShot.x), sy: nY(sp.lastShot.y), sa: shotA,
      ra: sp.state === 'rope' && sp.rope ? [nX(sp.rope.ax), nY(sp.rope.ay)] : 0,
      dmg: sp.dmg, bt: sp.bites, dr: this.rn, kb: sp.alive ? -1 : sp.killedBy, pw: sp.powered ? 1 : 0,
    };
  },
  buildPresence() {
    if (this.phase === 'final' || this.sub === 'wait' || !this.me) {
      const p = { v: 1, on: this.phase === 'final' ? 0 : 1, s: this.mySlot, nm: 'P' + (this.mySlot + 1), cz: [save.style.c, save.style.h, save.style.p], dr: this.rn, rdy: this.ready ? 1 : 0 };
      if (this.isHost) p.w = this.buildWorld();
      return p;
    }
    const p = this.presenceOf(this.me);
    p.fc = this.claims;
    if (this.isHost) p.w = this.buildWorld();
    return p;
  },
  buildWorld() {
    const m = {
      ph: this.phase, rn: this.rn, t: Math.round(this.phaseT * 10) / 10, mode: this.mode, sd: this.seeds, cd: this.autoT,
      ro: this.roster.map(r => [r.slot, r.id, r.name, (r.eff || r.style).c, (r.eff || r.style).h, (r.eff || r.style).p, r.bot ? 1 : 0, (r.slot === this.mySlot ? this.ready : r.ready) ? 1 : 0, r.spec ? 1 : 0]),
      sc: this.scores.map(s => [s.pts, s.fl, s.kills, s.npc, s.wins, s.rp]),
      res: this.roundRes ? [this.roundRes.res, this.roundRes.why, this.roundRes.team] : 0, rc: this.rematchClosed ? 1 : 0,
    };
    const w = { m };
    if (this.W && this.phase !== 'wait') {
      w.fl = this.W.flies.filter(f => f.state === 'free').map(f => [f.id, nX(f.x), nY(f.y), f.heart ? 1 : 0]);
      w.en = this.W.enemies.filter(e => e.alive).map(e => [e.id, ENEMY_CODES[e.type], nX(e.x), nY(e.y), Math.round((e.drawAngle || 0) * 100), e.facing || 1,
        Math.round(e.frozenT * 10), (e.windup > 0 ? 1 : 0) | (e.tongueT >= 0 || e.windup > 0 || e.breathT > 0 ? 2 : 0) | (e.state === 'air' ? 4 : 0) | (e.invisible ? 8 : 0) | (e.breathT > 0 ? 16 : 0) | (e.state === 'fall' ? 32 : 0) | (e.descending ? 64 : 0),
        Math.round((e.tongueAng || 0) * 100), e.tongueExt ? Math.round(e.tongueExt()) : 0, Math.round((e.headRel || 0) * 100), Math.round((e.spawnT || 0) * 10), e.netExtra ? e.netExtra() : 0]);
      // enemy projectiles (webs, fireballs, water jets) so guests can see what's coming
      w.es = this.W.enemyShots.map(s => [s.kind === 'jet' ? 3 : s.kind === 'fire' ? 2 : 1, nX(s.x), nY(s.y), Math.round(s.vx), Math.round(s.vy)]);
      w.b = [];
      for (const { body } of this.bots.values()) { const bp = this.presenceOf(body); bp.id = body.id; w.b.push(bp); }
      w.nh = this.npcHits;
    }
    return w;
  },
  onPresence(id, d) {
    this.pres.set(id, d);
    if (!this.lastPos) this.lastPos = {};
    if (d.x !== undefined) this.lastPos[id] = { x: dX(d.x), y: dY(d.y), al: d.al };
    if (this.isHost) {
      const r = this.roster.find(x => x.id === id);
      if (r && !r.bot && this.phase === 'wait') r.ready = !!d.rdy;
      if (r && d.cz && !r.bot) { const changed = r.style.c !== d.cz[0] || r.style.h !== d.cz[1] || r.style.p !== d.cz[2]; r.style = { c: d.cz[0] | 0, h: d.cz[1] | 0, p: d.cz[2] | 0 }; if (changed) this.effectiveStyles(); }
      if (r && this.W && this.phase === 'play' && d.dr === this.rn) {
        // fly claims
        const done = this.processed[r.slot] || (this.processed[r.slot] = new Set());
        for (const fid of d.fc || []) {
          if (done.has(fid)) continue;
          done.add(fid);
          const f = this.W.flies.find(q => q.id === fid);
          if (f) { this.W.flies.splice(this.W.flies.indexOf(f), 1); if (!f.heart) this.awardFly(r.slot, f); }
        }
        if (!d.al) this.creditDeath(r.slot, d.kb);
      }
    }
    this.applyRemoteSpider(id, d);
    this.applyIncoming(id, d);
  },
  applyRemoteSpider(id, d) {
    const W = this.W;
    if (!W || d.x === undefined || d.dr !== this.rn || id === this.myId) return;
    let rs = W.remotes.get(id);
    if (!rs) { rs = new RemoteSpider(id, d.s | 0); W.remotes.set(id, rs); }
    const r = this.roster.find(x => x.id === id || (x.slot === (d.s | 0) && x.bot && id.startsWith('bot')));
    rs.slot = d.s | 0; rs.team = this.teamOf(rs.slot);
    rs.style = r && r.eff ? r.eff : { c: d.cz ? d.cz[0] : rs.slot, h: d.cz ? d.cz[1] : 0, p: d.cz ? d.cz[2] : 0 };
    rs.name = r ? r.name : d.nm || rs.name;
    rs.flies = this.scores[rs.slot] ? this.scores[rs.slot].fl : 0;
    rs.push({ x: dX(d.x), y: dY(d.y), vx: d.vx, vy: d.vy, a: d.a / 100, f: d.f, st: d.st === 's' ? 'stuck' : d.st === 'r' ? 'rope' : 'air', al: d.al, frz: d.frz, slw: d.slw, stn: d.stn, ra: d.ra ? [dX(d.ra[0]), dY(d.ra[1])] : null }, nowMs());
  },
  /* victim-side application of shooter-authoritative hits */
  applyIncoming(shooterId, d) {
    if (!this.W || d.dr !== this.rn || this.phase !== 'play') return;
    const victims = [this.me];
    if (this.isHost) for (const { body } of this.bots.values()) victims.push(body);
    for (const v of victims) {
      if (!v || v.id === shooterId) continue;
      const key = shooterId + '>' + v.id;
      const ap = this.applied[key] || (this.applied[key] = { slow: 0, freeze: 0, bite: 0 });
      const dm = d.dmg && d.dmg[v.id];
      if (dm) {
        while (ap.slow < dm[0]) { ap.slow++; if (v.alive) { v.slowT = 2.5; if (v === this.me) { SFX.play('slow'); floater(this.W, v.x, v.y - 16, 'SLOWED!', '#9ad0ff'); } } }
        while (ap.freeze < dm[1]) { ap.freeze++; if (v.alive) { v.frozenT = 4; if (v.state === 'rope') { v.state = 'air'; v.rope = null; } if (v === this.me) { SFX.play('stuck'); floater(this.W, v.x, v.y - 16, 'FROZEN! MASH!', '#ffffff'); } } }
      }
      const bt = d.bt && d.bt[v.id];
      if (bt) while (ap.bite < bt) { ap.bite++; if (v.alive) { v.invuln = 0; v.die(this.W, 'bite', d.s | 0); } }
    }
  },
  onFire(id, d) {
    const W = this.W;
    if (!W || d.dr !== this.rn || id === this.myId) return;
    const S = { id, slot: d.s | 0, team: this.teamOf(d.s | 0), powered: this.scores[d.s | 0] ? this.scores[d.s | 0].fl >= 5 : false, x: dX(d.sx), y: dY(d.sy) };
    const a = d.sa / 1000;
    W.webs.push(new WebShot(W, S, S.x, S.y, Math.cos(a), Math.sin(a), this.isHost ? { replay: true } : { visual: true }));
  },
  onSnapshot(w) {
    const m = w.m;
    if (!m) return;
    const prevPhase = this.phase, prevRn = this.rn;
    this.mode = m.mode; this.seeds = m.sd || []; this.autoT = m.cd;
    this.roster = (m.ro || []).map(a => ({ slot: a[0], id: a[1], name: a[2], style: { c: a[3], h: a[4], p: a[5] }, eff: { c: a[3], h: a[4], p: a[5] }, bot: !!a[6], ready: !!a[7], spec: !!a[8] }));
    (m.sc || []).forEach((a, i) => { this.scores[i] = { pts: a[0], fl: a[1], kills: a[2], npc: a[3], wins: a[4], rp: a[5] }; });
    this.roundRes = m.res ? { res: m.res[0], why: m.res[1], team: m.res[2] } : null;
    this.rematchClosed = !!m.rc;
    this.phase = m.ph; this.rn = m.rn; this.phaseT = m.t;
    if (m.ph === 'wait' && this.sub === 'match') { this.sub = 'wait'; this.W = null; this.me = null; this.ready = false; }
    if (m.ph !== 'wait' && m.ph !== 'final') this.sub = 'match';
    if (m.ph === 'final' && this.sub !== 'closed') this.sub = 'match';
    if ((m.ph === 'intro' || m.ph === 'play' || m.ph === 'result') && (!this.W || prevRn !== m.rn || (prevPhase === 'final' || prevPhase === 'wait') || this.W.biome !== m.rn)) this.buildRoundWorld();
    if (this.me) this.me.flies = this.scores[this.mySlot] ? this.scores[this.mySlot].fl : 0;
    if (prevPhase === 'intro' && m.ph === 'play') SFX.play('go');
    if (prevPhase === 'play' && m.ph === 'result') SFX.play('complete');
    const W = this.W;
    if (!W || m.ph === 'wait') return;
    // flies
    const seen = new Set();
    for (const [id, x, y, kind] of w.fl || []) {
      seen.add(id);
      if (W.claimed.has(id)) continue;
      let f = W.flies.find(q => q.id === id);
      if (!f) { f = new Fly(dX(x), dY(y), id, kind ? 'heart' : undefined); f.mirror = true; f.life = Infinity; W.flies.push(f); }
      f.tx = dX(x); f.ty = dY(y);
    }
    W.flies = W.flies.filter(f => seen.has(f.id) && !W.claimed.has(f.id) || f.state === 'reel');
    // enemies
    const eseen = new Set();
    for (const a of w.en || []) {
      const [id, code] = a; eseen.add(id);
      let e = W.enemies.find(q => q.netId === id);
      if (!e) {
        const x = dX(a[2]), y = dY(a[3]);
        e = code === 1 ? new Lizard(x, y) : code === 2 ? new Gecko(x, y) : code === 3 ? new Widow(x, y) : code === 4 ? new Hive(x, y, { invulnerable: true }) : code === 6 ? new LongLegs(x, y, VS_DIFF, { legs: 4 }) : code === 7 ? new Ant(x, y, { vx: 0, vy: 0 }) : code === 8 ? new FlyingAnt(x, y, { x, y }) : code === 9 ? new Queen(x, y) : code === 10 ? new Nest(W) : code === 11 ? new Frog(x, y, VS_DIFF) : code === 12 ? new ArcherFish(x, y, W.L.pond) : new Bee(x, y, null);
        e.mirror = true; e.netId = id; e.x = x; e.y = y; W.enemies.push(e);
      }
      e.tx = dX(a[2]); e.ty = dY(a[3]); e.drawAngle = a[4] / 100; e.facing = a[5]; e.frozenT = a[6] / 10;
      const fl = a[7];
      e.windup = fl & 1 ? 0.1 : 0; e.breathT = fl & 16 ? 0.1 : 0; e.state = fl & 32 ? 'fall' : fl & 4 ? 'air' : 'stuck'; e.invisible = !!(fl & 8); e.descending = !!(fl & 64);
      e.tongueAng = a[8] / 100; e.netExt = a[9]; e.headRel = a[10] / 100; e.spawnT = (a[11] || 0) / 10; e.alive = true;
      if (a[12] && e.applyNetExtra) e.applyNetExtra(a[12], W);
    }
    W.enemies = W.enemies.filter(e => eseen.has(e.netId));
    if (w.es) W.enemyShots = w.es.map(a => ({ kind: a[0] === 3 ? 'jet' : a[0] === 2 ? 'fire' : 'web', x: dX(a[1]), y: dY(a[2]), vx: a[3], vy: a[4], life: 0.3 }));
    // bots (host-simulated) appear as remote spiders
    for (const bp of w.b || []) { this.pres.set(bp.id, bp); this.applyRemoteSpider(bp.id, bp); this.applyIncoming(bp.id, bp); if (bp.sh !== undefined) { const prev = this.botSh && this.botSh[bp.id]; if (!this.botSh) this.botSh = {}; if (prev !== undefined && bp.sh > prev) this.onFire(bp.id, bp); this.botSh[bp.id] = bp.sh; } }
    for (const id of [...W.remotes.keys()]) if (id.startsWith('bot') && !(w.b || []).some(b => b.id === id)) W.remotes.delete(id);
    // NPC damage counters for me
    const nh = w.nh && w.nh[this.mySlot];
    if (nh && this.phase === 'play' && this.me) {
      const near = W.nearestEnemy ? null : null;
      const src = W.enemies.reduce((b, e) => !b || dist(e.x, e.y, this.me.x, this.me.y) < dist(b.x, b.y, this.me.x, this.me.y) ? e : b, null);
      for (const [k, kind] of [['h', 'hit'], ['k', 'kill'], ['s', 'stun'], ['g', 'sting'], ['f', 'fire'], ['w', 'knock']]) {
        while (this.appliedNpc[k] < (nh[k] || 0)) { this.appliedNpc[k]++; this.me.invuln = Math.min(this.me.invuln, 0); this.me.applyHurt(kind, src, W); }
      }
    }
  },

  /* ---------------- per-frame ---------------- */
  update(dt, c, nav) {
    if (this.msgT > 0) this.msgT -= dt;
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    // searching: the lobby is a playable warm-up field
    if (this.sub === 'searching') { this.searchT += dt; return; }
    if (this.sub === 'connecting' || this.sub === 'closed') return;
    if (this.sub === 'wait' && this.isHost) {
      // lobby auto-start rules
      const h = this.humans().length;
      if (this.kind === 'quick') {
        // everyone pressed START -> go now; otherwise start 60 s after a second player arrives (no bots)
        const allReady = h >= 2 && this.humans().every(r => r.slot === this.mySlot ? this.ready : r.ready);
        if (allReady) { if (this.autoT < 0 || this.autoT > 1.2) { this.autoT = 1.2; this.allReady = true; SFX.play('go'); } }
        else { this.allReady = false; if (h >= 2 && this.autoT < 0) this.autoT = 60; else if (h < 2) this.autoT = -1; }
        if (this.autoT >= 0) { this.autoT -= dt; if (this.autoT <= 0) { this.autoT = -1; this.startMatch(); } }
      } else if (this.kind !== 'bots') {
        if (h >= 4 && this.autoT < 0) this.autoT = 3;
        else if (h >= 2 && this.autoT < 0) this.autoT = this.kind === 'quick' ? 12 : 45;
        else if (h < 2 && this.kind !== 'bots') this.autoT = -1;
        if (this.autoT >= 0) { this.autoT -= dt; if (this.autoT <= 0) { this.autoT = -1; this.startMatch(); } }
      }
    }
    this.publishTick(dt);
    if (!this.W || this.sub === 'wait') return;
    const W = this.W; W.activate();
    if (this.isHost) this.hostPhaseTick(dt);
    W.moverTarget = this.roundClock();
    const canMove = this.phase === 'play';
    W.aim = canMove ? c.aim : null;
    W.step(dt, s => {
      if (!canMove) return NO_CONTROLS;
      if (s === this.me) return c;
      if (this.isHost && s.isBot) { const b = this.bots.get(s.slot); return b ? b.brain.think(dt, W, this) : NO_CONTROLS; }
      return NO_CONTROLS;
    });
    if (this.isHost && this.phase === 'play') {
      // host: local shooters' hits on local victims (me <-> bots, bot <-> bot)
      const locals = [this.me, ...[...this.bots.values()].map(b => b.body)];
      for (const s of locals) this.applyIncoming(s.id, this.presenceOf(s));
      // remote players biting frozen NPCs
      for (const rs of W.remotes.values()) {
        if (!rs.alive || !rs.powered) continue;
        for (const e of W.enemies) if (e.alive && e.type !== 'hive' && (e.biteCheck ? e.biteCheck(rs) : e.biteable() && dist(rs.x, rs.y, e.x, e.y) < rs.r + e.r + 6)) e.defeat(W, rs.slot);
      }
    }
    if (this.me) this.me.flies = this.scores[this.mySlot] ? this.scores[this.mySlot].fl : this.me.flies;
    for (const rs of W.remotes.values()) rs.flies = this.scores[rs.slot] ? this.scores[rs.slot].fl : 0;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.phase === 'final') { this.finalT += dt; if (this.isHost && this.finalT > 60 && !this.rematchClosed) { this.rematchClosed = true; this.publishTick(1); setTimeout(() => { if (this.net && this.rematchClosed) { this.net.close(); } }, 1500); } }
    if (!this.isHost && this.phase === 'final') { this.finalT += dt; if (this.rematchClosed && this.finalT > 2) { if (this.net && !this.net.closed) this.net.close(); } }
  },
  publishTick(dt) {
    if (!this.net) return;
    this.pubT -= dt;
    const humans = this.isHost ? this.humans().length : this.roster.filter(r => !r.bot).length;
    const rate = this.phase === 'final' && this.sub === 'match' ? 1 : humans >= 4 ? 12 : 15;
    if (this.pubT > 0) return;
    this.pubT = 1 / rate;
    if (this.kind === 'bots' || this.net instanceof NullAdapter) return;
    this.net.publish(this.buildPresence());
  },

  /* ---------------- rendering ---------------- */
  draw() {
    if (this.kind === 'quick' && (this.sub === 'searching' || this.sub === 'connecting' || this.sub === 'wait')) { drawMenuBackdrop(); this.drawQuickLobby(); return; }
    if (this.sub === 'connecting' || (this.sub === 'closed' && !this.W)) { drawMenuBackdrop(); this.drawConnecting(); return; }
    if (this.sub === 'wait') { drawMenuBackdrop(); this.drawLobby(); return; }
    if (!this.W) { drawMenuBackdrop(); this.drawConnecting(); return; }
    this.W.draw();
    this.drawHUD();
    if (this.phase === 'intro') { const n = Math.ceil(this.phaseT - 0.5); if (n >= 1 && n <= 3) drawText(String(n), BW / 2, BH / 2 + 10, 6, '#ffffff', 'center', null, '#140c26'); }
    if (this.phase === 'result') this.drawRoundResult();
    if (this.phase === 'final') this.drawFinal();
    if (this.msgT > 0) drawText(this.msg, BW / 2, BH - 30, 1, '#ffd23f', 'center', null, '#140c26');
  },
  drawHUD() {
    // scoreboard cards
    const ro = this.roster.slice().sort((a, b) => a.slot - b.slot);
    const cw = Math.min(118, Math.floor((BW - 70) / Math.max(1, ro.length))), total = cw * ro.length;
    let x = Math.round(BW / 2 - total / 2);
    const alive = this.isHost ? this.aliveBySlot() : null;
    for (const r of ro) {
      const sc = this.scores[r.slot] || this.blankScore();
      const col = SPIDER_COLORS[(r.eff || r.style).c % 6].ui;
      let al = true;
      if (r.spec) al = false;
      else if (alive) al = alive[r.slot];
      else if (r.slot === this.mySlot) al = this.me ? this.me.alive : true;
      else { const rs = this.W.remotes.get(r.id); al = rs ? rs.alive : true; }
      panel(x + 1, 3, cw - 2, 26, 0.75);
      ctx.fillStyle = this.mode === '2v2' ? TEAM_COLORS[r.slot % 2] : col; ctx.fillRect(x + 1, 3, 3, 26);
      drawText(r.name + (r.slot === this.mySlot ? '*' : ''), x + 8, 6, 1, al ? col : '#6a6a7a');
      drawText(String(sc.pts), x + cw - 6, 6, 1, '#ffffff', 'right');
      for (let i = 0; i < 5; i++) { if (i < sc.fl) pxCircle(ctx, x + 11 + i * 9, 21, 3, '#ffd23f'); else pxCircle(ctx, x + 11 + i * 9, 21, 2, '#3b2b63'); }
      if (r.spec) drawText('NEXT', x + cw - 6, 17, 1, '#9ad0ff', 'right');
      else if (!al) drawText('OUT', x + cw - 6, 17, 1, '#ff5a7a', 'right');
      else if (sc.fl >= 5) drawText('PWR', x + cw - 6, 17, 1, Math.floor(T * 4) % 2 ? '#ffd23f' : '#fff3a0', 'right');
      else drawText('W' + sc.wins, x + cw - 6, 17, 1, '#bba8ff', 'right');
      x += cw;
    }
    const label = 'ROUND ' + (this.rn + 1) + '/' + VS_ROUNDS + '  ' + BIOMES[this.rn].name + (this.phase === 'play' ? '  ' + fmtTime(this.phaseT) : '');
    drawText(label, BW / 2, 33, 1, this.phase === 'play' && this.phaseT < 10 ? '#ff5a7a' : '#ffffff', 'center', '#140c26');
    // my status
    const me = this.me;
    if (me) {
      for (let i = 0; i < me.maxHp; i++) drawHeart(8 + i * 14, BH - 18, 1.5, i < me.hp);
      let st = '';
      if (me.spectator) st = 'SPECTATING - YOU JOIN NEXT ROUND';
      else if (!me.alive) st = 'ELIMINATED - SPECTATING';
      else if (me.frozenT > 0 || me.stunT > 0) st = 'MASH TO BREAK FREE!';
      else if (me.slowT > 0) st = 'SLOWED!';
      else if (me.powered) st = 'POWERED! WEB + BITE RIVALS';
      if (st) drawText(st, 56, BH - 16, 1, me.powered && me.alive ? '#ffd23f' : '#ffffff', 'left', '#140c26');
    }
    if (this.mode === '2v2') drawText('2V2 - ' + TEAM_NAMES[this.teamOf(this.mySlot)], BW - 8, BH - 16, 1, TEAM_COLORS[this.teamOf(this.mySlot)], 'right', '#140c26');
    drawPauseButton();
    if (this.phase !== 'final' && this.phase !== 'result') drawBanner(this.banner);
  },
  drawRoundResult() {
    const rr = this.roundRes; if (!rr) return;
    dim(0.35);
    drawText(rr.res, BW / 2, BH / 2 - 40, 3, rr.team >= 0 ? '#ffd23f' : '#ffffff', 'center', null, '#140c26');
    drawText(rr.why, BW / 2, BH / 2 - 8, 1, '#ffffff', 'center', '#140c26');
    drawText(this.rn < VS_ROUNDS - 1 ? 'NEXT: ' + BIOMES[this.rn + 1].name : 'FINAL RESULTS NEXT', BW / 2, BH / 2 + 10, 1, '#bba8ff', 'center', '#140c26');
  },
  leaderboard() {
    return this.roster.map(r => ({ r, s: this.scores[r.slot] })).sort((a, b) => b.s.wins - a.s.wins || b.s.pts - a.s.pts);
  },
  drawFinal() {
    dim(0.7);
    const lb = this.leaderboard();
    drawText('FINAL RESULTS', BW / 2, 34, 4, '#ffd23f', 'center', null, '#140c26');
    const pw = 360, px = Math.round(BW / 2 - pw / 2);
    let y = 74;
    panel(px, y, pw, 18, 0.9);
    drawText('#   PLAYER      WINS   PTS   FLIES  KO  NPC', px + 10, y + 6, 1, '#bba8ff');
    y += 20;
    lb.forEach((e, i) => {
      const col = SPIDER_COLORS[(e.r.eff || e.r.style).c % 6].ui;
      panel(px, y, pw, 18, i === 0 ? 0.95 : 0.8);
      if (i === 0) { ctx.fillStyle = 'rgba(255,210,63,0.25)'; ctx.fillRect(px, y, pw, 18); }
      const line = (i + 1) + '   ' + (e.r.name + (e.r.slot === this.mySlot ? '*' : '')).padEnd(10, ' ') + '  ' + String(e.s.wins).padStart(4, ' ') + '  ' + String(e.s.pts).padStart(4, ' ') + '   ' + String(e.s.fl).padStart(4, ' ') + '  ' + String(e.s.kills).padStart(2, ' ') + '  ' + String(e.s.npc).padStart(3, ' ');
      drawText(line, px + 10, y + 6, 1, col);
      y += 20;
    });
    if (this.mode === '2v2') {
      const tw = [0, 0], tp = [0, 0];
      for (const e of lb) { const t = e.r.slot % 2; tp[t] += e.s.pts; tw[t] = Math.max(tw[t], e.s.wins); }
      const wt = tw[0] !== tw[1] ? (tw[0] > tw[1] ? 0 : 1) : (tp[0] >= tp[1] ? 0 : 1);
      drawText(TEAM_NAMES[wt] + ' WINS THE MATCH!  (' + tw[0] + '-' + tw[1] + ' ROUNDS, ' + tp[0] + '-' + tp[1] + ' PTS)', BW / 2, y + 6, 1, TEAM_COLORS[wt], 'center', '#140c26');
    } else if (lb[0]) drawText(lb[0].r.name + ' WINS THE MATCH!', BW / 2, y + 6, 2, '#ffd23f', 'center', null, '#140c26');
    drawUIButtons(this.finalButtons(), uiSel);
    const note = this.rematchClosed ? 'LINK CLOSED - START A NEW MATCH FROM THE MENU' : this.isHost ? 'REMATCH REUSES THIS LINK (' + Math.max(0, Math.ceil(60 - this.finalT)) + 'S)' : 'WAITING FOR THE HOST TO START A REMATCH';
    drawText(note, BW / 2, BH - 14, 1, 'rgba(255,255,255,0.8)', 'center', '#140c26');
  },
  finalButtons() {
    const y = BH - 44, b = [];
    if (this.isHost && !this.rematchClosed) b.push({ label: 'REMATCH', x: BW / 2 - 90, y, w: 150, h: 24, action: () => this.rematch() });
    b.push({ label: 'MAIN MENU', x: this.isHost && !this.rematchClosed ? BW / 2 + 90 : BW / 2, y, w: 150, h: 24, action: () => this.leave() });
    return b;
  },
  toggleReady() {
    this.ready = !this.ready;
    SFX.play(this.ready ? 'confirm' : 'back');
    this.publishTick(1);
  },
  overlayButtons() { return []; },
  quickButtons() {
    const y = BH - 30, h = this.roster.filter(r => !r.bot).length;
    const canReady = this.sub === 'wait' && h >= 2;
    return [
      { label: this.ready ? 'READY! (UNDO)' : 'START', x: BW / 2 + 80, y, w: 150, h: 24, disabled: !canReady, action: () => { if (canReady) this.toggleReady(); } },
      { label: 'LEAVE', x: BW / 2 - 80, y, w: 140, h: 24, action: () => this.leave() },
    ];
  },
  drawQuickLobby() {
    dim(0.45);
    drawText('QUICK PLAY', BW / 2, 14, 3, '#ffd23f', 'center', null, '#140c26');
    const dots = '.'.repeat(1 + Math.floor(T * 2) % 3);
    let ro = this.roster.slice().sort((a, b) => a.slot - b.slot);
    if (this.sub !== 'wait') ro = [{ slot: 0, name: 'YOU', style: save.style, eff: save.style }];
    const mine = this.sub === 'wait' ? this.mySlot : 0;
    const h = ro.filter(r => !r.bot).length;
    const status = this.sub === 'searching' ? 'SEARCHING FOR PLAYERS' + dots : this.sub === 'connecting' ? 'JOINING A LOBBY' + dots : h < 2 ? 'LOBBY OPEN - WAITING FOR ANOTHER PLAYER' + dots : h < 4 ? 'STILL SEARCHING FOR MORE PLAYERS' + dots : 'LOBBY FULL!';
    drawText(status, BW / 2, 50, 1, '#7df06a', 'center', '#140c26');
    // 4 slot cards
    const cw = 120, ch = 88, gap = 8, total = cw * 4 + gap * 3, x0 = Math.round(BW / 2 - total / 2), y0 = 76;
    if (this.sub === 'wait') this.effectiveStyles();
    for (let s = 0; s < 4; s++) {
      const x = x0 + s * (cw + gap), r = ro.find(q => q.slot === s);
      panel(x, y0, cw, ch, 0.85);
      drawText('SLOT ' + (s + 1), x + cw / 2, y0 + 7, 1, '#9a90c0', 'center');
      if (r) {
        const st = r.eff || r.style, rdy = r.slot === mine ? this.ready : r.ready;
        drawSpider(x + cw / 2, y0 + 46, 0, 1, T * 6, { style: st, gear: T * 3, scale: 2 });
        drawText(r.name + (r.slot === mine && r.name !== 'YOU' ? ' (YOU)' : ''), x + cw / 2, y0 + 64, 1, SPIDER_COLORS[st.c % 6].ui, 'center');
        drawText(rdy ? 'READY!' : this.sub === 'wait' ? 'NOT READY' : '', x + cw / 2, y0 + 76, 1, rdy ? '#7df06a' : '#9a90c0', 'center');
      } else drawText('SEARCHING' + dots, x + cw / 2, y0 + 44, 1, '#6a6a8a', 'center');
    }
    let info, col = '#ffffff';
    if (this.sub !== 'wait') info = 'YOU WILL BE MATCHED WITH OTHER PLAYERS AUTOMATICALLY';
    else if (this.allReady || (this.autoT >= 0 && this.autoT <= 1.3 && h >= 2 && ro.every(r => r.slot === mine ? this.ready : r.ready))) { info = 'EVERYONE IS READY - GO!'; col = '#7df06a'; }
    else if (this.autoT >= 0) { info = 'STARTING IN ' + Math.ceil(this.autoT) + 'S - OR AS SOON AS EVERYONE PRESSES START'; col = '#ffd23f'; }
    else info = 'THE MATCH CAN START ONCE A SECOND PLAYER JOINS';
    drawText(info, BW / 2, y0 + ch + 12, 1, col, 'center', '#140c26');
    if (this.sub === 'wait' && this.autoT >= 0 && this.autoT <= 10) drawText(String(Math.ceil(this.autoT)), BW / 2, y0 + ch + 26, 3, '#ffd23f', 'center', null, '#140c26');
    drawText('7 ROUNDS, FIELD TO SWAMP.  LATE ARRIVALS WATCH, THEN JOIN NEXT ROUND.', BW / 2, BH - 64, 1, '#bba8ff', 'center', '#140c26');
    const rep = this.sub === 'wait' && this.net ? this.net.report() : this.searchNet ? this.searchNet.report() : '';
    drawText(rep, BW / 2, BH - 52, 1, '#7a70a0', 'center');
    drawUIButtons(this.quickButtons(), uiSel);
    if (this.msgT > 0) drawText(this.msg, BW / 2, 62, 1, '#ffffff', 'center', '#140c26');
  },
  drawConnecting() {
    dim(0.5);
    const t = this.sub === 'closed' ? this.msg : (this.kind === 'quick' ? 'JOINING MATCH' : 'JOINING ROOM ' + (this.code || '')) + '.'.repeat(1 + Math.floor(T * 2) % 3);
    drawText(t, BW / 2, BH / 2 - 30, 2, '#ffd23f', 'center', null, '#140c26');
    if (this.net) drawText(this.net.report(), BW / 2, BH / 2, 1, '#bba8ff', 'center', '#140c26');
    if (this.msgT > 0 && this.sub !== 'closed') drawText(this.msg, BW / 2, BH / 2 + 16, 1, '#ffffff', 'center', '#140c26');
    if (this.sub !== 'closed') drawUIButtons(this.connectButtons(), uiSel);
  },
  connectButtons() { return [{ label: 'CANCEL', x: BW / 2, y: BH / 2 + 50, w: 140, h: 22, action: () => this.leave() }]; },
  lobbyButtons() {
    const b = [];
    const y = BH - 30;
    if (this.isHost) {
      b.push({ label: 'MODE: ' + this.mode.toUpperCase(), x: BW / 2 - 150, y: 100, w: 130, h: 20, action: () => this.cycleMode(1) });
      b.push({ label: '+ BOT', x: BW / 2 + 10, y: 100, w: 70, h: 20, action: () => { if (this.roster.length < 4) { this.addBot(); SFX.play('select'); } } });
      b.push({ label: '- BOT', x: BW / 2 + 90, y: 100, w: 70, h: 20, action: () => { this.removeBot(); SFX.play('select'); } });
      if (this.kind === 'private') b.push({ label: 'SHARE INVITE', x: BW / 2 + 178, y: 58, w: 110, h: 20, action: () => shareInvite(this.code).then(r => this.flash(r === 'copied' ? 'INVITE LINK COPIED' : r === 'shared' ? 'INVITE SHARED' : 'COULD NOT SHARE')) });
      b.push({ label: 'START', x: BW / 2 + 80, y, w: 140, h: 24, disabled: !(this.roster.length >= 2 || this.mode !== 'ffa'), action: () => { if (this.roster.length >= 2 || this.mode !== 'ffa') this.startMatch(); } });
      b.push({ label: 'LEAVE', x: BW / 2 - 80, y, w: 140, h: 24, action: () => this.leave() });
    } else b.push({ label: 'LEAVE', x: BW / 2, y, w: 140, h: 24, action: () => this.leave() });
    return b;
  },
  drawLobby() {
    dim(0.45);
    const title = this.kind === 'quick' ? 'QUICK PLAY LOBBY' : this.kind === 'bots' ? 'BOT MATCH' : 'PRIVATE ROOM';
    drawText(title, BW / 2, 14, 3, '#ffd23f', 'center', null, '#140c26');
    if (this.kind === 'private') {
      drawText('ROOM CODE', BW / 2 - 60, 50, 1, '#bba8ff', 'center');
      drawText(this.code || '----', BW / 2 - 60, 60, 3, '#ffffff', 'center', null, '#140c26');
    } else if (this.kind === 'quick') drawText('MATCHED! WAITING FOR MORE PLAYERS', BW / 2, 52, 1, '#7df06a', 'center', '#140c26');
    if (!this.isHost) drawText('MODE: ' + this.mode.toUpperCase(), BW / 2, 98, 1, '#ffffff', 'center', '#140c26');
    // 4 slot cards
    const cw = 120, ch = 88, gap = 8, total = cw * 4 + gap * 3, x0 = Math.round(BW / 2 - total / 2), y0 = 120;
    this.effectiveStyles();
    for (let s = 0; s < 4; s++) {
      const x = x0 + s * (cw + gap), r = this.roster.find(q => q.slot === s);
      panel(x, y0, cw, ch, 0.85);
      if (this.mode === '2v2') { ctx.fillStyle = TEAM_COLORS[s % 2]; ctx.fillRect(x, y0, cw, 3); }
      drawText('SLOT ' + (s + 1), x + cw / 2, y0 + 7, 1, '#9a90c0', 'center');
      if (r) {
        const st = r.eff || r.style;
        drawSpider(x + cw / 2, y0 + 48, 0, 1, T * 6, { style: st, gear: T * 3, scale: 2 });
        drawText(r.name + (r.slot === this.mySlot ? ' (YOU)' : ''), x + cw / 2, y0 + 66, 1, SPIDER_COLORS[st.c % 6].ui, 'center');
        drawText(r.bot ? 'BOT' : r.slot === 0 ? 'HOST' : 'PLAYER', x + cw / 2, y0 + 78, 1, r.bot ? '#bba8ff' : '#7df06a', 'center');
      } else drawText(this.kind === 'quick' ? 'SEARCHING...' : 'EMPTY', x + cw / 2, y0 + 44, 1, '#6a6a8a', 'center');
    }
    const h = this.roster.filter(r => !r.bot).length;
    let info = '';
    if (this.autoT >= 0) drawText('STARTING IN ' + Math.ceil(this.autoT) + '...', BW / 2, y0 + ch + 6, 2, '#ffd23f', 'center', null, '#140c26');
    else {
      if (this.isHost) info = h >= 2 ? 'PRESS START WHEN READY - BOTS FILL EMPTY SLOTS' : this.kind === 'quick' ? 'STILL LOOKING - OR PRESS START TO PLAY WITH BOTS' : this.kind === 'bots' ? 'PICK A MODE AND PRESS START' : 'SHARE THE CODE - OR PRESS START TO PLAY WITH BOTS';
      else info = 'WAITING FOR THE HOST TO START';
      drawText(info, BW / 2, y0 + ch + 10, 1, '#ffffff', 'center', '#140c26');
    }
    drawText('7 ROUNDS, FIELD TO SWAMP.  5 FLIES = POWER: WEB RIVALS TO FREEZE, THEN BITE.', BW / 2, y0 + ch + 24, 1, '#bba8ff', 'center', '#140c26');
    if (this.net) drawText(this.net.report(), BW / 2, BH - 52, 1, '#7a70a0', 'center');
    drawUIButtons(this.lobbyButtons(), uiSel);
    if (this.msgT > 0) drawText(this.msg, BW / 2, y0 + ch + 38, 1, '#7df06a', 'center', '#140c26');
  },
  currentButtons() {
    if (this.kind === 'quick' && (this.sub === 'searching' || this.sub === 'connecting' || this.sub === 'wait')) return this.quickButtons();
    if (this.sub === 'connecting' || (this.sub === 'closed' && !this.W)) return this.sub === 'closed' ? [] : this.connectButtons();
    if (this.sub === 'wait') return this.lobbyButtons();
    if (this.sub === 'match' && this.phase === 'final') return this.finalButtons();
    return [];
  },
};

/* =====================================================================
   BOT BRAIN - simple VS opponent: hunt flies, power up, web + bite rivals
   ===================================================================== */
class BotBrain {
  constructor(body) { this.b = body; this.t = Math.random(); this.goal = null; this.shootCD = 1 + Math.random(); this.stuckT = 0; this.lx = body.x; this.ly = body.y; this.ropeT = 0; this.mood = Math.random(); }
  think(dt, W, V) {
    const b = this.b, c = { mx: 0, my: 0, jump: false, jumpHeld: false, shoot: null, mash: 0, pause: false, aim: null };
    if (!b.alive) return c;
    if (b.frozenT > 0 || b.stunT > 0) { if (Math.random() < dt * 7) c.mash = 1; return c; }
    this.t -= dt; this.shootCD -= dt;
    // progress tracking
    if (dist(b.x, b.y, this.lx, this.ly) < 1.5) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    this.lx = b.x; this.ly = b.y;
    // danger: flee hazards
    let danger = null;
    for (const e of W.enemies) if (e.alive && e.frozenT <= 0 && e.type !== 'hive' && e.type !== 'nest' && e.type !== 'archer' && dist(b.x, b.y, e.x, e.y) < (e.type === 'widow' ? 80 : e.type === 'dll' ? 90 : e.type === 'ant' ? 26 : e.type === 'queen' ? 60 : e.type === 'frog' ? 70 : 50)) danger = e;
    const rivals = W.allSpiders().filter(o => o !== b && o.alive && o.team !== b.team);
    let target = null, mode = '';
    if (b.powered) {
      const frozen = rivals.filter(o => o.frozenT > 0).sort((p, q) => dist(b.x, b.y, p.x, p.y) - dist(b.x, b.y, q.x, q.y))[0];
      if (frozen) { target = frozen; mode = 'bite'; }
      else { const r = rivals.sort((p, q) => dist(b.x, b.y, p.x, p.y) - dist(b.x, b.y, q.x, q.y))[0]; if (r) { target = r; mode = 'hunt'; } }
    }
    if (!target) {
      const f = W.flies.filter(q => q.state === 'free').sort((p, q) => dist(b.x, b.y, p.x, p.y) - dist(b.x, b.y, q.x, q.y))[0];
      if (f) { target = f; mode = 'fly'; }
      else { const r = rivals[0]; if (r) { target = r; mode = 'hunt'; } }
    }
    if (danger) { target = { x: b.x + (b.x - danger.x) * 2, y: b.y - 40 }; mode = 'flee'; }
    if (!target) return c;
    const d = dist(b.x, b.y, target.x, target.y);
    const los = lineOfSight(b.x, b.y, target.x, target.y);
    // shooting decisions
    if (this.shootCD <= 0 && los) {
      if (mode === 'fly' && d < 235 && d > 16) { c.shoot = { type: 'point', x: target.x + (target.vx || 0) * 0.08, y: target.y + (target.vy || 0) * 0.08 }; this.shootCD = 0.45 + Math.random() * 0.5; }
      else if (mode === 'hunt' && d < 200) { c.shoot = { type: 'point', x: target.x + (target.vx || 0) * 0.15, y: target.y + (target.vy || 0) * 0.15 }; this.shootCD = 0.7 + Math.random() * 0.6; }
      else if (mode === 'fly' && rivals.length && Math.random() < 0.02) { const r = rivals[0]; if (dist(b.x, b.y, r.x, r.y) < 150 && lineOfSight(b.x, b.y, r.x, r.y)) { c.shoot = { type: 'point', x: r.x, y: r.y }; this.shootCD = 1.2; } }
    }
    // movement toward target
    let dx = target.x - b.x, dy = target.y - b.y;
    const m = Math.hypot(dx, dy) || 1;
    const overWaterAt = (x, y) => WATER_Y < Infinity && !rayPlat(x, y, 0, 1, Math.max(4, WATER_Y - y + 2), 4);
    if (b.state === 'stuck') {
      c.mx = dx / m; c.my = dy / m;
      // never walk off an edge into water: stop and swing across instead
      if (WATER_Y < Infinity && b.ny < -0.5 && overWaterAt(b.x + Math.sign(c.mx) * 16, b.y)) { c.mx = 0; c.my = 0; this.stuckT += dt * 3; }
      // target far above: grapple to something above it
      if ((dy < -50 && Math.abs(dx) < 140 && this.stuckT > 0.25) || this.stuckT > 0.8) {
        if (this.shootCD <= 0) {
          const ax = clamp(b.x + dx * 0.6 + (Math.random() - 0.5) * 40, 20, 620), ay = Math.max(20, Math.min(b.y - 60, target.y - 30));
          c.shoot = { type: 'point', x: ax, y: ay }; this.shootCD = 0.6;
        } else if (this.stuckT > 1.2) { c.jump = true; this.stuckT = 0; }
      }
      if (mode === 'flee' && Math.random() < dt * 3) c.jump = true;
      if (b.ny < -0.5 && Math.abs(dx) < 30 && dy < -40 && Math.random() < dt * 2) c.jump = true;
    } else if (b.state === 'rope') {
      this.ropeT += dt;
      c.mx = Math.sign(dx); c.my = dy < -10 ? -1 : 0;
      if (((Math.abs(dx) < 40 && dy > -10) || this.ropeT > 1.6) && !overWaterAt(b.x, b.y)) { c.jump = true; this.ropeT = 0; }
    } else {
      this.ropeT = 0;
      c.mx = Math.sign(dx) * Math.min(1, Math.abs(dx) / 30);
      // falling toward water: web onto something above to save itself
      if (b.vy > 0 && overWaterAt(b.x + b.vx * 0.2, b.y) && this.shootCD <= 0) { c.shoot = { type: 'point', x: clamp(b.x + b.vx * 0.4, 20, 620), y: Math.max(20, b.y - 110) }; this.shootCD = 0.35; }
    }
    return c;
  }
}
