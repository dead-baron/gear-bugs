/* =====================================================================
   80_NET - browser P2P multiplayer (Neon Asteroids spec, 4 players)
   ---------------------------------------------------------------------
   Trystero (Nostr strategy) for matchmaking + WebRTC, public Nostr relays
   for signaling, STUN + free Metered TURN for connectivity. The game only
   ever talks to the adapter interface:
     connect(code, role)  publish(stateObj)  close()  linked()  report()
     events: state, fire, leave, snapshot, code, full  (+ join, linked,
             hostleft, matched, error, status)
   ===================================================================== */
const NET = {
  APP_ID: 'gear-bugs-v2',          // v2: 5-round matches (older builds can't play round 5)
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  POOL_ROOM: 'quick-match-pool-v2',
  TRYSTERO_URLS: ['https://cdn.jsdelivr.net/npm/trystero@0.25.4/nostr/+esm', 'https://esm.run/trystero@0.25.4'],
  RELAY_PROBES: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social', 'wss://nostr.mom'],
};
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },          // keep it to 2; more slows gathering
];
const METERED_TURN = {          // dead-baron's free Metered.ca account (0.5 GB/month, shared with Neon Asteroids)
  urls: [
    'turn:global.relay.metered.ca:80',
    'turn:global.relay.metered.ca:80?transport=tcp',
    'turn:global.relay.metered.ca:443',
    'turns:global.relay.metered.ca:443?transport=tcp',
  ],
  username: 'c9c0aac7648fe5536290ed7c',
  credential: 'ycotpF9yAbeN2DrD',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function randomCode() {
  const a = new Uint8Array(4);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 4; i++) a[i] = Math.random() * 256; }
  let s = ''; for (let i = 0; i < 4; i++) s += NET.CODE_CHARS[a[i] % NET.CODE_CHARS.length];
  return s;
}
function inviteLink(code) { return location.origin + location.pathname + '?room=' + code; }
async function shareInvite(code) {
  const url = inviteLink(code), text = 'Join my GEAR BUGS match! Room ' + code;
  try { if (navigator.share) { await navigator.share({ title: 'GEAR BUGS', text, url }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  return (await copyText(url)) ? 'copied' : 'failed';
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}

/* ---------- Library loader: dynamic ESM import with fallback ---------- */
let Trystero = null, trysteroPromise = null;
window.TrysteroFailed = false;
function loadTrystero() {
  if (trysteroPromise) return trysteroPromise;
  trysteroPromise = (async () => {
    for (const url of NET.TRYSTERO_URLS) {
      try {
        const m = await import(url);
        const lib = m && (m.joinRoom ? m : m.default && m.default.joinRoom ? m.default : null);
        if (lib) { Trystero = lib; return lib; }
      } catch (e) { console.warn('[net] trystero load failed', url, e); }
    }
    window.TrysteroFailed = true;
    return null;
  })();
  return trysteroPromise;
}
/* Trystero API shim - works with both the array-style ([send, onMessage])
   and object-style ({send, onMessage}) action APIs across versions. */
let TR_ARRAY_API = false;      // older Trystero: makeAction returns [send, onMessage]; room.onPeerJoin(fn)
function trAction(room, name) {
  const r = room.makeAction(name);
  TR_ARRAY_API = Array.isArray(r);
  const seen = new WeakSet();
  // Trystero 0.25 passes (data, {peerId, metadata}); older versions pass (data, peerId)
  const wrap = fn => (data, from) => {
    const peerId = typeof from === 'string' ? from : from && from.peerId;
    if (!peerId) return;
    if (data && typeof data === 'object') { if (seen.has(data)) return; seen.add(data); }
    fn(data, peerId);
  };
  if (Array.isArray(r)) return { send: (d, to) => r[0](d, to || null), on: fn => r[1](wrap(fn)) };
  return {
    send: (d, to) => r.send(d, to ? { target: to } : undefined),
    on: fn => { const h = wrap(fn); if (typeof r.onMessage === 'function') { try { r.onMessage(h); } catch (e) {} } try { r.onMessage = h; } catch (e) {} },
  };
}
function trRoomEvent(room, ev, fn) {
  const recent = new Map();
  const h = id => { const t = recent.get(id); const now = nowMs(); if (t && now - t < 150) return; recent.set(id, now); fn(id); };
  // 0.25+: onPeerJoin/onPeerLeave are setter properties; older versions take a callback
  if (TR_ARRAY_API && typeof room[ev] === 'function') { try { room[ev](h); } catch (e) {} }
  else { try { room[ev] = h; } catch (e) {} }
}
function trJoin(rtcConfig, roomId) {
  return Trystero.joinRoom({ appId: NET.APP_ID, rtcConfig }, roomId);
}

/* ---------- ICE servers (STUN + TURN, cached 1 h, 3 s timeout) ---------- */
let iceCache = null, iceCacheT = 0;
async function iceServers() {
  if (iceCache && Date.now() - iceCacheT < 3600e3) return iceCache;
  let turn = [];
  try {
    // Static free-tier credentials; kept async + timed so an API-issued credential can drop in later.
    turn = await Promise.race([Promise.resolve([METERED_TURN]), sleep(3000).then(() => { throw new Error('timeout'); })]);
  } catch (e) { turn = []; }
  iceCache = { all: STUN_SERVERS.concat(turn), turn: turn.length ? turn : STUN_SERVERS };
  iceCacheT = Date.now();
  return iceCache;
}

/* ---------- Strict-network (symmetric NAT) detection, Safari-safe ---------- */
let strictNet = null, natDetectPromise = null;
function parseCand(s) {
  const p = String(s).replace(/^a=/, '').split(' ');
  if (p.length < 8) return null;
  const o = { proto: (p[2] || '').toLowerCase(), ip: p[4], port: +p[5], type: p[7] };
  const ri = p.indexOf('raddr'); if (ri > 0) o.raddr = p[ri + 1];
  const rp = p.indexOf('rport'); if (rp > 0) o.rport = p[rp + 1];
  return o;
}
function gatherCandidates(config, ms) {
  return new Promise(resolve => {
    const out = [];
    let pc;
    try { pc = new RTCPeerConnection(config); pc.createDataChannel('probe'); } catch (e) { resolve(out); return; }
    const done = () => { try { pc.close(); } catch (e) {} resolve(out); };
    pc.onicecandidate = e => { if (!e.candidate) { setTimeout(done, 50); return; } const c = parseCand(e.candidate.candidate); if (c) out.push(c); };
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(done);
    setTimeout(done, ms);
  });
}
function classifyNat(cands) {
  const srflx = cands.filter(c => c.type === 'srflx');
  const hostUdp = new Set(cands.filter(c => c.type === 'host' && c.proto === 'udp').map(c => c.ip + ':' + c.port));
  if (!srflx.length) return null;
  const hidden = srflx.every(c => !c.raddr || c.raddr === '0.0.0.0' || c.raddr === '::');
  if (!hidden) {
    // Symmetric NAT = the same local socket maps to different public ports per STUN server
    const groups = {};
    for (const c of srflx) { const k = c.raddr + ':' + c.rport; (groups[k] = groups[k] || new Set()).add(c.ip + ':' + c.port); }
    return Object.values(groups).some(s => s.size > 1);
  }
  // Safari / iOS hides raddr: only call it strict with exactly one UDP host socket, else unknown
  const pub = new Set(srflx.map(c => c.ip + ':' + c.port));
  if (hostUdp.size === 1) return pub.size > 1;
  return null;
}
function detectStrictNat(force) {
  if (natDetectPromise && !force) return natDetectPromise;
  natDetectPromise = (async () => {
    if (!window.RTCPeerConnection) return null;
    const c = await gatherCandidates({ iceServers: STUN_SERVERS }, 3500);
    return classifyNat(c);
  })().then(v => { strictNet = v; return v; }).catch(() => null);
  return natDetectPromise;
}

/* =====================================================================
   ADAPTERS
   ===================================================================== */
class NetAdapter {
  constructor() { this.h = {}; this.closed = false; }
  on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.h[ev] || []) { try { f(...a); } catch (e) { console.error('[net]', ev, e); } } }
  connect(code, role) {}
  publish(obj) {}
  close() { this.closed = true; }
  linked() { return false; }
  report() { return ''; }
}
/* Offline / bots: the local player is the host of a room with nobody else */
class NullAdapter extends NetAdapter {
  constructor() { super(); this.role = 'host'; this.code = 'BOTS'; this.selfId = 'local'; }
  connect(code, role) { this.code = code || 'BOTS'; this.emit('status'); }
  linked() { return true; }
  report() { return 'OFFLINE - BOT MATCH'; }
}

/* Private rooms (room codes / invite links) */
class TrysteroAdapter extends NetAdapter {
  constructor() {
    super();
    this.room = null; this.code = ''; this.role = 'host'; this.attempt = 0; this.relay = false;
    this.peers = new Map();           // peerId -> { slot, lastSeen, leaveT, sh }
    this.hostId = null; this.isLinked = false; this.slot = 0; this.selfId = null;
    this.matchStarted = false; this.timer = null; this.startedT = 0; this.roomT = 0;
    this.idleRefresh = true;
  }
  async connect(code, role) {
    if (this.closed) return;
    this.code = String(code).toUpperCase(); this.role = role; this.attempt++;
    this.isLinked = false; this.hostId = null;
    const lib = await loadTrystero();
    if (!lib) { this.emit('error', 'lib'); return; }
    if (this.closed) return;
    this.selfId = lib.selfId;
    await Promise.race([detectStrictNat(), sleep(600)]);
    if (this.leaving) await this.leaving;
    if (this.closed) return;
    const ice = await iceServers();
    this.relay = strictNet === true || this.attempt % 2 === 0;
    const rtc = this.relay ? { iceServers: ice.turn, iceTransportPolicy: 'relay' } : { iceServers: ice.all };
    this.joinRoom('room-' + this.code.toLowerCase(), rtc);
    this.startedT = this.roomT = nowMs();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000);
    this.emit('status');
  }
  joinRoom(roomId, rtc) {
    this.rtc = rtc; this.roomId = roomId;
    this.room = trJoin(rtc, roomId);
    const A = n => trAction(this.room, n);
    this.aHi = A('hi'); this.aOk = A('ok'); this.aFull = A('full'); this.aP = A('p');
    this.aHi.on((d, id) => this.onHi(d, id));
    this.aOk.on((d, id) => this.onOk(d, id));
    this.aFull.on((d, id) => this.onFull(d, id));
    this.aP.on((d, id) => this.onP(d, id));
    trRoomEvent(this.room, 'onPeerJoin', id => this.onPeerJoin(id));
    trRoomEvent(this.room, 'onPeerLeave', id => this.onPeerLeave(id));
  }
  joinerCount() { let n = 0; for (const p of this.peers.values()) if (p.slot > 0) n++; return n; }
  freeSlot() { const used = new Set([...this.peers.values()].map(p => p.slot)); for (let s = 1; s <= 3; s++) if (!used.has(s)) return s; return -1; }
  onPeerJoin(id) { try { this.aHi.send({ v: 1, role: this.role }, id); } catch (e) {} }
  onHi(d, id) {
    if (!d || d.v !== 1) return;
    if (this.role === 'host') {
      if (d.role === 'host') {           // two hosts raced onto one code
        if (String(this.selfId) > String(id)) this.rehost();
        return;
      }
      const p = this.peers.get(id);
      if (p && p.slot > 0) { this.aOk.send({ v: 1, slot: p.slot }, id); return; }   // idempotent
      const slot = this.freeSlot();
      if ((this.matchStarted && !this.lateJoin) || slot < 0 || this.acceptJoiner === false) { this.aFull.send({ v: 1 }, id); return; }
      this.peers.set(id, { slot, lastSeen: nowMs(), leaveT: 0 });
      this.aOk.send({ v: 1, slot }, id);
      this.emit('join', id, slot);
    } else if (d.role === 'host') {
      this.aHi.send({ v: 1, role: 'join' }, id);   // joiners re-send hi when they see a host
    }
  }
  onOk(d, id) {
    if (this.role !== 'join' || !d || d.v !== 1) return;
    if (this.isLinked && this.hostId === id) return;
    this.hostId = id; this.isLinked = true; this.slot = d.slot | 0;
    this.peers.set(id, { slot: 0, lastSeen: nowMs(), leaveT: 0 });
    track('match_found', { secs: Math.round((nowMs() - this.startedT) / 1000), relay: this.relay, strict: strictNet, attempts: this.attempt });
    this.emit('linked', this.slot, id);
    this.emit('status');
  }
  onFull(d, id) { if (this.role === 'join' && !this.isLinked) this.emit('full'); }
  onP(d, id) {
    if (!d || typeof d !== 'object') return;
    let rec = this.peers.get(id);
    if (this.role === 'host' && !rec) return;            // not an accepted joiner
    if (this.role === 'join') {
      if (!this.isLinked) return;
      if (!rec) { rec = { slot: d.s | 0, lastSeen: nowMs(), leaveT: 0 }; this.peers.set(id, rec); }
    }
    rec.lastSeen = nowMs(); rec.leaveT = 0;
    if (d.bye) { this.dropPeer(id, 'bye'); return; }
    this.emit('state', id, d);
    if (id === this.hostId && d.w) this.emit('snapshot', d.w, id);
    if (typeof d.sh === 'number') { if (rec.sh !== undefined && d.sh > rec.sh) this.emit('fire', id, d); rec.sh = d.sh; }
  }
  onPeerLeave(id) { const rec = this.peers.get(id); if (rec) rec.leaveT = nowMs(); }   // counts only after 3 s grace
  tick() {
    if (this.closed) return;
    const now = nowMs();
    for (const [id, rec] of [...this.peers]) {
      if (rec.leaveT && now - rec.leaveT > 3000 && now - rec.lastSeen > 3000) this.dropPeer(id, 'left');
      else if (now - rec.lastSeen > 6000) this.dropPeer(id, 'timeout');
    }
    if (this.role === 'join' && !this.isLinked && this.room && now - this.startedT > (this.relay ? 50000 : 35000)) {
      track('connect_retry', { attempt: this.attempt, relay: this.relay });
      this.retry();
    }
    if (this.role === 'host' && this.idleRefresh && this.joinerCount() === 0 && !this.matchStarted && this.room && now - this.roomT > 60000) {
      this.roomT = now; this.leaveRoom();                                           // recover from dropped relay sockets
      const id = this.roomId, rtc = this.rtc;
      (this.leaving || Promise.resolve()).then(() => { if (!this.closed && !this.room) this.joinRoom(id, rtc); });
    }
  }
  dropPeer(id, why) {
    if (!this.peers.has(id)) return;
    this.peers.delete(id);
    this.emit('leave', id, why);
    if (this.role === 'join' && id === this.hostId) { this.isLinked = false; this.emit('hostleft', why); }
    this.emit('status');
  }
  publish(obj) { if (this.aP && this.room) { try { this.aP.send(obj); } catch (e) {} } }
  sendBye() { this.publish({ bye: 1 }); }
  leaveRoom() {
    try { if (this.room) { const p = this.room.leave(); this.leaving = Promise.resolve(p).catch(() => {}).then(() => { this.leaving = null; }); } } catch (e) {}
    this.room = null; this.aP = null;
  }
  retry() { this.leaveRoom(); this.peers.clear(); this.connect(this.code, this.role); }
  rehost() { this.leaveRoom(); this.peers.clear(); const c = randomCode(); this.attempt = 0; this.emit('code', c); this.connect(c, 'host'); }
  close() {
    if (this.closed) return;
    this.sendBye();
    this.closed = true;
    const room = this.room;
    setTimeout(() => { try { if (room) room.leave(); } catch (e) {} }, 120);   // let the bye flush
    this.room = null; this.aP = null;
    clearInterval(this.timer); this.timer = null; this.peers.clear(); this.isLinked = false;
  }
  linked() { return this.role === 'host' ? true : this.isLinked; }
  report() {
    return (this.role === 'host' ? 'HOST' : 'JOIN') + ' ' + this.code + '  ' + (this.linked() ? (this.role === 'host' ? 'OPEN' : 'LINKED') : 'CONNECTING') +
      '  TRY ' + this.attempt + (this.relay ? '  RELAY' : '') + '  PEERS ' + this.peers.size + (strictNet === true ? '  STRICT NAT' : '');
  }
}

/* Quick Play: shared pool room + open lobbies.
   - Everyone searching sits in one pool room and broadcasts `seek` every
     few seconds ({ t: waitStart, lob: code|0, n: players, done }).
   - An open lobby seen in the pool is joined straight away (no handshake).
   - With no lobby around, the lowest peer id among the visible seekers
     opens one and keeps advertising it until it starts or fills up.
   - Duplicate empty lobbies merge into the one with the lower host id.
   - Self-healing: re-enter the pool after 20 s alone / 15 s with no lobby
     forming, keeping the original wait-start time. */
class QuickMatchAdapter extends TrysteroAdapter {
  constructor() {
    super();
    this.pool = null; this.poolTimer = null; this.seekers = new Map(); this.waitStart = Date.now();
    this.mode = 'idle';                  // idle | seek | joining | lobby | linked
    this.lobbyCode = null; this.lobbyOpen = false; this.badLobbies = new Map();
    this.poolEnterT = 0; this.lastSeekT = 0; this.poolAttempts = 0; this.joinT = 0;
    this.idleRefresh = false;
    this.lateJoin = true;               // players may join mid-match (they spectate until the next round)
  }
  async search() {
    if (this.closed) return;
    this.mode = 'seek';
    const lib = await loadTrystero();
    if (!lib) { this.emit('error', 'lib'); return; }
    this.selfId = lib.selfId;
    if (this.pool) { this.broadcastSeek(); this.emit('status'); return; }
    try { await this.enterPool(); }
    catch (e) { console.warn('[net] pool entry failed', e); setTimeout(() => { if (!this.closed && this.mode === 'seek') this.search(); }, 3000); }
  }
  async enterPool() {
    await Promise.race([detectStrictNat(), sleep(600)]);
    if (this.poolLeaving) await this.poolLeaving;
    if (this.closed || this.pool) return;
    const ice = await iceServers();
    const rtc = strictNet === true ? { iceServers: ice.turn, iceTransportPolicy: 'relay' } : { iceServers: ice.all };  // the pool never forces relay otherwise
    this.poolAttempts++;
    this.pool = trJoin(rtc, NET.POOL_ROOM);
    this.qSeek = trAction(this.pool, 'seek');
    this.qSeek.on((d, id) => this.onSeek(d, id));
    trRoomEvent(this.pool, 'onPeerJoin', id => { try { this.qSeek.send(this.seekMsg(), id); } catch (e) {} });
    trRoomEvent(this.pool, 'onPeerLeave', id => this.seekers.delete(id));
    this.poolEnterT = nowMs(); this.lastSeekT = 0;
    if (!this.poolTimer) this.poolTimer = setInterval(() => this.poolTick(), 500);
    this.broadcastSeek();
    this.emit('status');
  }
  players() { return 1 + this.joinerCount(); }
  seekMsg() {
    const lobby = this.mode === 'lobby' && this.lobbyOpen && this.players() < 4;
    return { v: 1, t: this.waitStart, lob: lobby ? this.lobbyCode : 0, n: lobby ? this.players() : 0, done: this.mode === 'joining' || this.mode === 'linked' || (this.mode === 'lobby' && !lobby) ? 1 : 0 };
  }
  broadcastSeek() { if (this.pool && this.qSeek) { try { this.qSeek.send(this.seekMsg()); } catch (e) {} } this.lastSeekT = nowMs(); }
  leavePool() {
    if (this.pool) {
      try { this.qSeek.send({ v: 1, t: this.waitStart, done: 1 }); } catch (e) {}
      const p = this.pool;
      this.poolLeaving = sleep(150).then(() => p.leave()).catch(() => {}).then(() => { this.poolLeaving = null; });
    }
    this.pool = null; this.seekers.clear();
  }
  onSeek(d, id) {
    if (!d || d.v !== 1) return;
    if (d.done) { this.seekers.delete(id); return; }
    const s = this.seekers.get(id) || { id, firstSeen: nowMs() };
    s.t = d.t; s.lob = d.lob || 0; s.n = d.n || 0; s.lastSeen = nowMs();
    this.seekers.set(id, s);
  }
  openLobbies(now) {
    return [...this.seekers.values()].filter(s => s.lob && s.n < 4 && now - s.lastSeen < 9000 && !(this.badLobbies.get(s.lob) > now));
  }
  poolTick() {
    if (this.closed || !this.pool) return;
    const now = nowMs();
    for (const [id, s] of this.seekers) if (now - s.lastSeen > 15000) this.seekers.delete(id);
    if (now - this.lastSeekT > (this.mode === 'lobby' ? 2000 : 3000)) this.broadcastSeek();
    if (this.mode === 'seek') {
      const lobbies = this.openLobbies(now).sort((a, b) => b.n - a.n || a.t - b.t);
      if (lobbies.length) { this.joinLobby(lobbies[0].lob); return; }
      const others = [...this.seekers.values()].filter(s => !s.lob && now - s.lastSeen < 9000);
      if (others.length && now - this.poolEnterT > 1200 && others.every(s => String(this.selfId) < String(s.id))) { this.openLobby(); return; }
      // self-healing pool
      if ((!others.length && now - this.poolEnterT > 20000) || (others.length && now - this.poolEnterT > 15000)) {
        this.leavePool(); this.enterPool().catch(() => setTimeout(() => this.search(), 3000));
      }
    } else if (this.mode === 'lobby') {
      // two lobbies opened at once: an empty one folds into the lower host id's lobby
      if (this.joinerCount() === 0) {
        const other = this.openLobbies(now).filter(s => s.lob !== this.lobbyCode && String(s.id) < String(this.selfId)).sort((a, b) => b.n - a.n)[0];
        if (other) { this.leaveRoom(); this.peers.clear(); this.joinLobby(other.lob); }
      }
    } else if (this.mode === 'joining') {
      if (this.isLinked) { this.mode = 'linked'; this.leavePool(); return; }
      if (now - this.joinT > 12000) { this.giveUp(this.code); }
    }
  }
  openLobby() {
    this.attempt = 0;
    this.mode = 'lobby'; this.lobbyCode = randomCode(); this.lobbyOpen = true; this.matchStarted = false;
    this.emit('matched', this.lobbyCode, 'host');
    this.connect(this.lobbyCode, 'host').then(() => this.broadcastSeek());
    this.broadcastSeek();
  }
  joinLobby(code) {
    this.attempt = 0;
    this.mode = 'joining'; this.joinT = nowMs(); this.lobbyOpen = false;
    this.broadcastSeek();
    this.emit('matched', code, 'join');
    this.connect(code, 'join');
  }
  giveUp(code) {
    // couldn't get into that lobby: avoid it for a while and keep searching
    this.badLobbies.set(code, nowMs() + 30000);
    this.leaveRoom(); this.peers.clear(); this.isLinked = false;
    this.mode = 'seek'; this.poolEnterT = nowMs();
    this.emit('requeue');
    if (!this.pool) this.search(); else this.broadcastSeek();
  }
  onFull() { if (this.role === 'join' && !this.isLinked && this.mode === 'joining') this.giveUp(this.code); }
  onOk(d, id) { super.onOk(d, id); if (this.isLinked && this.mode === 'joining') { this.mode = 'linked'; this.leavePool(); } }
  closeLobby() { if (this.mode === 'lobby') { this.lobbyOpen = false; this.broadcastSeek(); this.leavePool(); } }
  close() { this.leavePool(); clearInterval(this.poolTimer); this.poolTimer = null; super.close(); }
  report() {
    if (this.mode === 'seek') return 'SEARCHING  SEEN ' + this.seekers.size + '  POOL TRY ' + this.poolAttempts + (strictNet === true ? '  STRICT NAT' : '');
    if (this.mode === 'lobby') return 'LOBBY ' + this.lobbyCode + '  PLAYERS ' + this.players() + '/4  ' + (this.lobbyOpen ? 'OPEN' : 'CLOSED') + '  SEEN ' + this.seekers.size;
    return super.report();
  }
}

/* =====================================================================
   NETWORK TEST (diagnostics screen, ~15 s)
   ===================================================================== */
const NetTest = {
  steps: [], running: false, verdict: '', verdictColor: '#ffffff', copied: 0, started: 0,
  NAMES: ['Browser has WebRTC + secure context', 'Matchmaking library loaded', 'Page server reachable', 'Nostr relays reachable', 'STUN gives a public address', 'TURN allocation works', 'Relay link (message via TURN)', 'NAT type'],
  async run() {
    if (this.running) return;
    this.running = true; this.verdict = ''; this.started = nowMs();
    this.steps = this.NAMES.map(n => ({ name: n, status: 'wait', detail: '' }));
    const S = this.steps;
    const set = (i, status, detail) => { S[i].status = status; S[i].detail = detail || ''; };
    track('net_test', {});
    // 1
    set(0, 'run');
    const hasRTC = !!window.RTCPeerConnection, secure = !!window.isSecureContext;
    set(0, hasRTC && secure ? 'ok' : 'fail', !hasRTC ? 'NO WEBRTC IN THIS BROWSER' : !secure ? 'NOT A SECURE (HTTPS) PAGE' : 'OK');
    // 2
    set(1, 'run');
    const lib = await Promise.race([loadTrystero(), sleep(8000).then(() => null)]);
    set(1, lib ? 'ok' : 'fail', lib ? 'TRYSTERO 0.25.4 (NOSTR)' : 'COULD NOT LOAD FROM CDN');
    // 3
    set(2, 'run');
    try { const r = await Promise.race([fetch(location.href.split('#')[0], { cache: 'no-store' }), sleep(5000).then(() => null)]); set(2, r && r.ok ? 'ok' : 'warn', r ? 'HTTP ' + r.status : 'TIMEOUT'); }
    catch (e) { set(2, 'warn', 'UNREACHABLE'); }
    // 4 + 5 in parallel
    set(3, 'run'); set(4, 'run');
    const relayP = Promise.all(NET.RELAY_PROBES.map(u => new Promise(res => {
      let ws; const t = setTimeout(() => { try { ws.close(); } catch (e) {} res(false); }, 4500);
      try { ws = new WebSocket(u); ws.onopen = () => { clearTimeout(t); try { ws.close(); } catch (e) {} res(true); }; ws.onerror = () => { clearTimeout(t); res(false); }; } catch (e) { clearTimeout(t); res(false); }
    })));
    const stunP = hasRTC ? gatherCandidates({ iceServers: STUN_SERVERS }, 4000) : Promise.resolve([]);
    const [relays, stunC] = await Promise.all([relayP, stunP]);
    const nOpen = relays.filter(Boolean).length;
    set(3, nOpen >= 2 ? 'ok' : nOpen === 1 ? 'warn' : 'fail', nOpen + '/' + relays.length + ' RELAYS OPEN');
    const srflx = stunC.filter(c => c.type === 'srflx');
    set(4, srflx.length ? 'ok' : 'warn', srflx.length ? 'PUBLIC ADDRESS FOUND' : 'NO PUBLIC ADDRESS (UDP BLOCKED?)');
    // 6
    set(5, 'run');
    const ice = await iceServers();
    const turnC = hasRTC ? await gatherCandidates({ iceServers: ice.turn, iceTransportPolicy: 'relay' }, 6000) : [];
    const relayC = turnC.filter(c => c.type === 'relay');
    set(5, relayC.length ? 'ok' : 'fail', relayC.length ? 'RELAY ALLOCATED' : 'NO RELAY CANDIDATE');
    // 7
    set(6, 'run');
    let link = false;
    if (relayC.length) link = await this.relayLink(ice, 7000);
    set(6, link ? 'ok' : 'fail', link ? 'MESSAGE DELIVERED' : relayC.length ? 'NO MESSAGE THROUGH RELAY' : 'SKIPPED');
    // 8
    set(7, 'run');
    const nat = classifyNat(stunC);
    strictNet = nat;
    set(7, nat === false ? 'ok' : nat === true ? 'warn' : 'warn', nat === false ? 'OPEN / CONE' : nat === true ? 'STRICT (SYMMETRIC) - WILL USE RELAY' : 'UNKNOWN');
    // verdict
    const ok = i => S[i].status === 'ok';
    if (!ok(0) || !ok(1) || nOpen === 0) { this.verdict = 'MAY NOT CONNECT'; this.verdictColor = '#ff5a7a'; }
    else if (ok(4) && nat !== true) { this.verdict = 'GOOD TO CONNECT'; this.verdictColor = '#7df06a'; }
    else if (ok(5) && ok(6)) { this.verdict = 'SHOULD CONNECT (VIA RELAY)'; this.verdictColor = '#ffd23f'; }
    else { this.verdict = 'MAY NOT CONNECT - TRY ANOTHER NETWORK'; this.verdictColor = '#ff5a7a'; }
    this.running = false;
  },
  async relayLink(ice, ms) {
    let a, b;
    try {
      const cfg = { iceServers: ice.turn, iceTransportPolicy: 'relay' };
      a = new RTCPeerConnection(cfg); b = new RTCPeerConnection(cfg);
      a.onicecandidate = e => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
      b.onicecandidate = e => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
      const ch = a.createDataChannel('t');
      const got = new Promise(res => { b.ondatachannel = e => { e.channel.onmessage = m => res(m.data === 'ping'); }; });
      ch.onopen = () => { try { ch.send('ping'); } catch (e) {} };
      const offer = await a.createOffer(); await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
      const ans = await b.createAnswer(); await b.setLocalDescription(ans); await a.setRemoteDescription(ans);
      return await Promise.race([got, sleep(ms).then(() => false)]);
    } catch (e) { return false; }
    finally { try { a && a.close(); } catch (e) {} try { b && b.close(); } catch (e) {} }
  },
  report() {
    const lines = ['GEAR BUGS network test', 'Build: ' + BUILD, 'When: ' + new Date().toISOString(), 'Browser: ' + navigator.userAgent, ''];
    this.steps.forEach((s, i) => lines.push((i + 1) + '. ' + s.name + ': ' + s.status.toUpperCase() + (s.detail ? ' - ' + s.detail : '')));
    lines.push('', 'Verdict: ' + (this.verdict || '(running)'));
    return lines.join('\n');
  },
};
