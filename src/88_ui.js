/* =====================================================================
   88_UI - menus, HUD helpers, screens
   ===================================================================== */
let uiSel = 0;
let uiHot = [];               // clickable rects while a gameplay scene owns the pointer
function setHot(list) { for (const b of list) uiHot.push(btnRect(b)); }
const btnRect = b => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });

function panel(x, y, w, h, alpha = 0.75) {
  ctx.fillStyle = `rgba(20,12,40,${alpha})`; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - 1, w, 1);
}
function dim(a) { ctx.fillStyle = `rgba(16,10,32,${a})`; ctx.fillRect(0, 0, BW, BH); }
function drawButton(b, selected) {
  const x = Math.round(b.x - b.w / 2), y = Math.round(b.y - b.h / 2);
  const off = b.disabled;
  ctx.fillStyle = '#140c26'; ctx.fillRect(x - 2, y - 2, b.w + 4, b.h + 4);
  ctx.fillStyle = off ? '#2a2240' : selected ? '#ffd23f' : '#3b2b63'; ctx.fillRect(x, y, b.w, b.h);
  ctx.fillStyle = off ? '#3a3250' : selected ? '#fff3a0' : '#5a4590'; ctx.fillRect(x, y, b.w, 2);
  ctx.fillStyle = off ? '#1e1830' : selected ? '#d99a00' : '#261a45'; ctx.fillRect(x, y + b.h - 3, b.w, 3);
  const scale = textWidth(b.label, 2) > b.w - 12 || b.h < 20 ? 1 : 2;
  drawText(b.label, b.x, y + Math.round((b.h - 7 * scale) / 2) - 1, scale, off ? '#6a6080' : selected ? '#2a1a00' : '#ffffff', 'center', selected || off ? null : '#140c26');
  if (selected && !off && Math.floor(T * 3) % 2 === 0 && b.w > 60) drawText('>', x - 12, y + Math.round((b.h - 14) / 2), 2, '#ffd23f', 'left', '#140c26');
}
function drawUIButtons(list, sel) {
  list.forEach((b, i) => drawButton(b, i === sel && !(Input.last === 'touch')));
}
function drawBanner(bn) {
  if (!bn) return;
  const k = bn.t / bn.max, pop = Math.min(1, (1 - k) * 8);
  const scale = pop < 1 ? 2 : (textWidth(bn.text, 4) > BW - 20 ? 3 : 4);
  const y = Math.round(BH * 0.36);
  ctx.globalAlpha = clamp(bn.t * 3, 0, 1);
  drawText(bn.text, BW / 2, y, scale, bn.color, 'center', null, '#140c26');
  if (bn.sub) drawText(bn.sub, BW / 2, y + 36, 1, '#ffffff', 'center', null, '#140c26');
  ctx.globalAlpha = 1;
}
function drawPauseButton() {
  const pb = TL.pause;
  panel(pb.x, pb.y, pb.w, pb.h, 0.7);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(pb.x + 6, pb.y + 5, 3, 10); ctx.fillRect(pb.x + 11, pb.y + 5, 3, 10);
  uiHot.push({ x: pb.x - 4, y: pb.y - 4, w: pb.w + 8, h: pb.h + 8, pause: true });
}
function drawTouchControls() {
  ctx.save();
  const jb = touch.joy.id !== null ? { x: touch.joy.bx, y: touch.joy.by } : TL.joy;
  ctx.globalAlpha = touch.joy.id !== null ? 0.85 : 0.5;
  ctx.fillStyle = 'rgba(20,12,40,0.45)'; ctx.beginPath(); ctx.arc(jb.x, jb.y, TL.joy.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(jb.x + touch.joy.vx * TL.joy.r, jb.y + touch.joy.vy * TL.joy.r, 13, 0, TAU); ctx.fill();
  ctx.globalAlpha = touch.jump.id !== null ? 0.95 : 0.65;
  ctx.fillStyle = touch.jump.id !== null ? '#8ef06f' : '#3fae3a';
  ctx.beginPath(); ctx.arc(TL.jump.x, TL.jump.y, TL.jump.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#140c26'; ctx.lineWidth = 2; ctx.stroke();
  drawText('JUMP', TL.jump.x, TL.jump.y - 3, 1, '#ffffff', 'center', '#140c26');
  ctx.globalAlpha = touch.web.id !== null ? 0.95 : 0.65;
  ctx.fillStyle = touch.web.id !== null ? '#ffe45c' : '#d99a00';
  ctx.beginPath(); ctx.arc(TL.web.x, TL.web.y, TL.web.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#140c26'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(TL.web.x - Math.cos(a) * 12, TL.web.y - Math.sin(a) * 12); ctx.lineTo(TL.web.x + Math.cos(a) * 12, TL.web.y + Math.sin(a) * 12); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(TL.web.x, TL.web.y, 7, 0, TAU); ctx.stroke();
  drawText('WEB', TL.web.x, TL.web.y + 14, 1, '#ffffff', 'center', '#140c26');
  if (touch.web.id !== null) {
    let dx = touch.web.dx, dy = touch.web.dy; const d = Math.hypot(dx, dy);
    if (d > TL.web.r) { dx = dx / d * TL.web.r; dy = dy / d * TL.web.r; }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(TL.web.x + dx, TL.web.y + dy, 9, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* ---------- Menu backdrop: a cached grassy field with a parade ---------- */
const MENU_ART = { sky: null, scene: null, key: '' };
function drawMenuBackdrop() {
  const key = BW + 'x' + BH;
  if (MENU_ART.key !== key) {
    const savedP = PLATS, savedW = WATER_Y, savedArt = Object.assign({}, ART);
    buildLevelArt(generateLevel(0, 424242));
    MENU_ART.sky = ART.sky; MENU_ART.scene = ART.scene; MENU_ART.clouds = ART.clouds; MENU_ART.cloudSprites = ART.cloudSprites; MENU_ART.key = key;
    Object.assign(ART, savedArt); ART.level = savedArt.level && savedArt.bw === BW ? savedArt.level : null;
    PLATS = savedP; WATER_Y = savedW;
  }
  ctx.drawImage(MENU_ART.sky, 0, 0);
  for (const c of MENU_ART.clouds) { c.x += c.spd / 60; if (c.x > BW + 10) c.x = -80; ctx.drawImage(MENU_ART.cloudSprites[c.spr], Math.round(c.x), Math.round(c.y)); }
  ctx.drawImage(MENU_ART.scene, 0, 0);
}
function drawParade() {
  const span = REF_W + 160, sx = ((T * 60) % span) - 80 + OX;
  drawSpider(sx, OY + 312, 0, 1, T * 25, { style: save.style, gear: T * 6 });
  drawLizard(sx - 60, OY + 314, 0, 1, T * 12, Math.sin(T * 3) * 0.3, { mouthOpen: Math.sin(T * 2) > 0.7 });
  drawBee(sx - 100, OY + 290 + Math.sin(T * 6) * 6, 1, {});
  drawWidow(sx - 150, OY + 310, 0, 1, T * 20, {});
}
function drawTitle(y) {
  const w1 = textWidth('GEAR', 6), w2 = textWidth('BUGS', 6), gap = 30;
  const total = w1 + gap + w2, x0 = Math.round(BW / 2 - total / 2);
  drawGear(ctx, x0 - 26, y + 20, 14, 8, T * 1.5, '#f2b233', '#1b1230');
  drawGear(ctx, x0 - 8, y + 44, 8, 6, -T * 2.6, '#d99a00', '#1b1230');
  drawGear(ctx, x0 + total + 26, y + 20, 14, 8, -T * 1.5, '#7df06a', '#1b1230');
  drawGear(ctx, x0 + total + 8, y + 44, 8, 6, T * 2.6, '#4fb944', '#1b1230');
  const bob = Math.round(Math.sin(T * 2) * 2);
  drawText('GEAR', x0, y + bob, 6, '#ffd23f', 'left', '#8a5a00', '#140c26');
  drawText('BUGS', x0 + w1 + gap, y - bob, 6, '#7df06a', 'left', '#2f7f2b', '#140c26');
  drawGear(ctx, x0 + w1 + gap / 2, y + 20, 6, 6, T * 3, '#ffffff', '#140c26');
}

/* =====================================================================
   SCREENS (each: buttons(), update(dt, nav), draw())
   ===================================================================== */
const Screens = {};

Screens.menu = {
  buttons() {
    const cx = BW / 2, y0 = Math.min(BH - 170, OY + 128), sp = 22;
    const b = [
      { label: 'CAMPAIGN', x: cx, y: y0, w: 170, h: 20, action: () => openStyle('campaign') },
      { label: 'PRACTICE', x: cx, y: y0 + sp, w: 170, h: 20, action: () => setScene('practice') },
      { label: 'QUICK PLAY', x: cx, y: y0 + sp * 2, w: 170, h: 20, action: () => openStyle('quick') },
      { label: 'PRIVATE ROOM', x: cx, y: y0 + sp * 3, w: 170, h: 20, action: () => setScene('private') },
      { label: 'SPIDER STYLE', x: cx, y: y0 + sp * 4, w: 170, h: 20, action: () => openStyle(null) },
      { label: 'OPTIONS', x: cx, y: y0 + sp * 5, w: 170, h: 20, action: () => { optionsReturn = 'menu'; setScene('options'); } },
      { label: 'NETWORK TEST', x: cx, y: y0 + sp * 6, w: 170, h: 20, action: () => { netTestReturn = 'menu'; setScene('nettest'); NetTest.run(); } },
    ];
    if (fsSupported() && !isStandalone()) b.push({ label: isFullscreen() ? 'EXIT FULL' : 'FULLSCREEN', x: BW - 52, y: 16, w: 92, h: 18, action: () => toggleFullscreen() });
    if (deferredInstall && !isStandalone()) b.push({ label: 'INSTALL APP', x: 58, y: 16, w: 100, h: 18, action: () => promptInstall() });
    return b;
  },
  draw() {
    drawMenuBackdrop(); dim(0.3);
    drawTitle(Math.max(10, OY + 40));
    drawText('A TINY SPIDER ADVENTURE', BW / 2, Math.max(10, OY + 40) + 58, 1, '#ffffff', 'center', '#140c26');
    drawParade();
    drawUIButtons(this.buttons(), uiSel);
    drawStarShape(ctx, 18, BH - 14, 6, '#ffd23f', 0);
    drawText('x ' + save.stars + ' STAR COINS', 28, BH - 17, 1, '#ffd23f', 'left', '#140c26');
    drawText('BUILD ' + BUILD, BW - 6, BH - 10, 1, 'rgba(255,255,255,0.55)', 'right');
    if (isIOS && !isStandalone() && !fsSupported()) drawText('IPHONE: TAP SHARE > ADD TO HOME SCREEN TO PLAY FULL SCREEN', BW / 2, BH - 30, 1, '#9ad0ff', 'center', '#140c26');
  },
};

/* ---------- Spider customization (shown before launching gameplay) ---------- */
let styleNext = null;
function openStyle(next) { styleNext = next; Screens.style.row = 0; setScene('style'); }
Screens.style = {
  row: 0,
  rows() { return [['COLOR', SPIDER_COLORS.map(c => c.name), 'c'], ['HAT', SPIDER_HATS, 'h'], ['PATTERN', SPIDER_PATTERNS, 'p']]; },
  change(rowIdx, dir) {
    const [, list, key] = this.rows()[rowIdx];
    save.style[key] = (save.style[key] + dir + list.length) % list.length; persist(); SFX.play('select');
  },
  confirmLabel() { return styleNext === 'campaign' ? 'TO THE WORLD MAP' : styleNext === 'quick' ? 'FIND A MATCH' : styleNext === 'host' ? 'OPEN ROOM' : styleNext === 'join' ? 'JOIN ROOM' : styleNext === 'bots' ? 'START BOT MATCH' : 'DONE'; },
  confirm() {
    SFX.play('confirm');
    if (styleNext === 'campaign') { Overworld.enter(-1); setScene('overworld'); }
    else if (styleNext === 'quick') { VS.startQuick(); setScene('vs'); }
    else if (styleNext === 'host') { VS.hostPrivate(); setScene('vs'); }
    else if (styleNext === 'join') { VS.joinPrivate(Screens.join.code); setScene('vs'); }
    else if (styleNext === 'bots') { VS.botMatch(); setScene('vs'); }
    else setScene('menu');
  },
  buttons() {
    const b = [], cx = BW / 2 + 70, y0 = BH / 2 - 50;
    this.rows().forEach(([, , ], i) => {
      b.push({ label: '<', x: cx - 70, y: y0 + i * 34, w: 22, h: 20, row: i, action: () => this.change(i, -1) });
      b.push({ label: '>', x: cx + 110, y: y0 + i * 34, w: 22, h: 20, row: i, action: () => this.change(i, 1) });
    });
    b.push({ label: this.confirmLabel(), x: cx + 20, y: y0 + 112, w: 190, h: 24, row: 3, action: () => this.confirm() });
    b.push({ label: 'BACK', x: 50, y: BH - 22, w: 80, h: 20, row: 4, action: () => setScene('menu') });
    return b;
  },
  update(dt, nav) {
    if (nav.up) { this.row = (this.row + 4) % 5; SFX.play('select'); }
    if (nav.down) { this.row = (this.row + 1) % 5; SFX.play('select'); }
    if (this.row < 3) { if (nav.left) this.change(this.row, -1); if (nav.right) this.change(this.row, 1); }
    if (nav.confirm) { if (this.row === 4) setScene('menu'); else if (this.row === 3 || true) this.confirm(); }
    if (nav.back) { SFX.play('back'); setScene('menu'); }
    return true;   // handled its own navigation
  },
  draw() {
    drawMenuBackdrop(); dim(0.55);
    drawText('CHOOSE YOUR SPIDER', BW / 2, 16, 3, '#ffd23f', 'center', null, '#140c26');
    const px = BW / 2 - 130, py = BH / 2 + 4;
    panel(px - 80, py - 76, 160, 150, 0.8);
    drawSpider(px, py + 12, 0, 1, T * 8, { style: save.style, gear: T * 4, scale: 3.4 });
    drawText(SPIDER_COLORS[save.style.c].name + ' SPIDER', px, py + 52, 1, SPIDER_COLORS[save.style.c].ui, 'center');
    const cx = BW / 2 + 70, y0 = BH / 2 - 50;
    this.rows().forEach(([label, list, key], i) => {
      const sel = this.row === i;
      drawText(label, cx + 20, y0 + i * 34 - 18, 1, sel ? '#ffd23f' : '#bba8ff', 'center');
      panel(cx - 56, y0 + i * 34 - 10, 152, 20, sel ? 0.95 : 0.7);
      drawText(list[save.style[key]], cx + 20, y0 + i * 34 - 3, 1, '#ffffff', 'center');
    });
    const bs = this.buttons();
    bs.forEach(b => drawButton(b, Input.last !== 'touch' && b.row === this.row && (b.row >= 3 || false)));
    drawText(Input.last === 'touch' ? 'TAP < > TO CUSTOMIZE' : 'UP/DOWN PICK  LEFT/RIGHT CHANGE  ENTER CONFIRM', BW / 2, BH - 44, 1, 'rgba(255,255,255,0.8)', 'center', '#140c26');
  },
};

/* ---------- Practice: pick any level + difficulty, nothing is saved ---------- */
Screens.practice = {
  level: 0, diff: -1, infinite: false,
  buttons() {
    if (this.diff < 0) this.diff = save.diff;
    const cw = Math.min(120, Math.floor((BW - 40) / 4) - 8), gap = 8, total = cw * 4 + gap * 3, x0 = Math.round(BW / 2 - total / 2) + cw / 2, cy = BH / 2 - 34;
    const b = [];
    for (let i = 0; i < 4; i++) b.push({ label: '', card: i, x: x0 + i * (cw + gap), y: cy, w: cw, h: 96, action: () => { if (this.level === i) this.play(); else { this.level = i; SFX.play('select'); } } });
    const y = BH / 2 + 46;
    b.push({ label: '<', x: BW / 2 - 92, y, w: 24, h: 20, action: () => { this.diff = (this.diff + 3) % 4; } });
    b.push({ label: '>', x: BW / 2 + 92, y, w: 24, h: 20, action: () => { this.diff = (this.diff + 1) % 4; } });
    b.push({ label: 'HEARTS: ' + (this.infinite ? 'INFINITE' : 'NORMAL'), x: BW / 2, y: y + 28, w: 200, h: 20, action: () => { this.infinite = !this.infinite; } });
    b.push({ label: 'PLAY ' + BIOMES[this.level].name, x: BW / 2 + 70, y: BH - 26, w: 210, h: 24, action: () => this.play() });
    b.push({ label: 'BACK', x: BW / 2 - 120, y: BH - 26, w: 100, h: 24, action: () => setScene('menu') });
    return b;
  },
  play() { SFX.play('confirm'); Campaign.start(this.level, this.diff, undefined, { practice: true, infinite: this.infinite }); setScene('level'); },
  draw() {
    drawMenuBackdrop(); dim(0.6);
    drawText('PRACTICE', BW / 2, 12, 4, '#ffd23f', 'center', null, '#140c26');
    drawText('PLAY ANY LEVEL - NO STAR COINS, NO PROGRESS, JUST PRACTICE', BW / 2, 48, 1, '#ffffff', 'center', '#140c26');
    const bs = this.buttons();
    bs.forEach((b, i) => {
      if (b.card === undefined) { drawButton(b, i === uiSel && Input.last !== 'touch'); return; }
      const B = BIOMES[b.card], x = Math.round(b.x - b.w / 2), y = Math.round(b.y - b.h / 2), sel = this.level === b.card, hover = i === uiSel && Input.last !== 'touch';
      ctx.fillStyle = sel ? '#ffd23f' : hover ? '#bba8ff' : '#140c26'; ctx.fillRect(x - 3, y - 3, b.w + 6, b.h + 6);
      const bandH = Math.ceil((b.h - 30) / B.sky.length);
      B.sky.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x, y + k * bandH, b.w, bandH); });
      const gy = y + b.h - 30;
      ctx.fillStyle = b.card === 2 ? '#2a7fc9' : b.card === 3 ? '#b8862a' : '#5fd24b'; ctx.fillRect(x, gy, b.w, 4);
      ctx.fillStyle = b.card === 2 ? '#f3dca0' : b.card === 3 ? '#7a5230' : '#9c5f34'; ctx.fillRect(x, gy + 4, b.w, 26);
      const ex = x + b.w / 2, ey = gy - 8;
      if (b.card === 0) drawLizard(ex, ey + 2, 0, -1, T * 10, Math.sin(T * 2) * 0.2, {});
      else if (b.card === 1) { drawHive(ex, ey - 22, {}); drawBee(ex + 22, ey - 18 + Math.sin(T * 5) * 3, -1, {}); }
      else if (b.card === 2) drawGecko(ex, ey + 2, 0, -1, T * 14, 0, {});
      else drawWidow(ex, ey, 0, -1, T * 10, {});
      drawText((b.card + 1) + '. ' + B.name, ex, gy + 8, 1, '#ffffff', 'center', '#140c26');
      drawText(B.npc, ex, gy + 18, 1, sel ? '#ffd23f' : '#bba8ff', 'center', '#140c26');
    });
    const D = DIFFS[this.diff < 0 ? save.diff : this.diff];
    drawText(D.name, BW / 2, BH / 2 + 41, 2, D.color, 'center', '#140c26');
  },
};

/* ---------- Options ---------- */
let optionsReturn = 'menu';
Screens.options = {
  buttons() {
    const cx = BW / 2, y0 = BH / 2 - 96, sp = 24, onoff = v => v ? 'ON' : 'OFF';
    const b = [
      { label: 'SOUND: ' + onoff(settings.sound), action: () => { settings.sound = !settings.sound; persist(); } },
      { label: 'SCREEN SHAKE: ' + onoff(settings.shake), action: () => { settings.shake = !settings.shake; persist(); } },
      { label: 'AIM GUIDE: ' + onoff(settings.aim), action: () => { settings.aim = !settings.aim; persist(); } },
      { label: 'FULLSCREEN: ' + (isFullscreen() || isStandalone() ? 'ON' : 'OFF'), action: () => toggleFullscreen() },
      { label: 'CAMPAIGN: ' + DIFFS[save.diff].name, action: () => { save.diff = (save.diff + 1) % 4; persist(); } },
      { label: 'CONTROLS', action: () => setScene('controls') },
      { label: Screens.options.confirmReset ? 'TAP AGAIN TO ERASE' : 'RESET PROGRESS', action: () => {
        if (!Screens.options.confirmReset) { Screens.options.confirmReset = true; return; }
        save.stars = 0; save.unlocked = [1, 1, 1, 1]; save.cleared = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; persist(); Screens.options.confirmReset = false;
      } },
      { label: 'BACK', action: () => { Screens.options.confirmReset = false; setScene(optionsReturn); } },
    ];
    b.forEach((x, i) => Object.assign(x, { x: cx, y: y0 + i * sp + (i === b.length - 1 ? 6 : 0), w: 210, h: 20 }));
    return b;
  },
  draw() {
    drawMenuBackdrop(); dim(0.6);
    drawText('OPTIONS', BW / 2, BH / 2 - 136, 4, '#ffd23f', 'center', null, '#140c26');
    drawUIButtons(this.buttons(), uiSel);
  },
};
Screens.controls = {
  buttons() { return [{ label: 'BACK', x: BW / 2, y: BH - 22, w: 140, h: 22, action: () => setScene('options') }]; },
  draw() {
    drawMenuBackdrop(); dim(0.7);
    drawText('CONTROLS', BW / 2, 12, 3, '#ffd23f', 'center', null, '#140c26');
    const cols = [
      ['KEYBOARD + MOUSE', '#ffd23f', ['WASD/ARROWS  CRAWL, CLIMB, SPRINT', 'SPACE        JUMP / LET GO OF WEB', 'CLICK        SHOOT WEB AT CURSOR', 'J K F X      SHOOT WEB (AHEAD/DIR)', 'UP ON ROPE   REEL IN FASTER', 'DOWN ON ROPE PAY OUT LINE', 'ESC / P      PAUSE']],
      ['GAMEPAD', '#7df06a', ['L-STICK/DPAD CRAWL, SWING', 'A            JUMP / LET GO', 'R-STICK      AIM', 'RB RT LB X   SHOOT WEB', 'START        PAUSE', 'ANY BUTTON   MASH FREE OF WEBS']],
      ['TOUCH', '#9ad0ff', ['LEFT SIDE    FLOATING STICK', 'JUMP BUTTON  JUMP / LET GO', 'WEB BUTTON   DRAG TO AIM, RELEASE', 'TAP WORLD    SHOOT WEB THERE', 'PAUSE        TOP RIGHT']],
    ];
    const colW = Math.min(212, (BW - 20) / 3);
    cols.forEach(([title, col, lines], i) => {
      const x = Math.round(BW / 2 - colW * 1.5 + i * colW + 4);
      panel(x, 44, colW - 8, 150, 0.85);
      drawText(title, x + 8, 50, 1, col);
      lines.forEach((l, j) => drawText(l, x + 8, 66 + j * 16, 1, '#ffffff'));
    });
    const tips = ['HOLD A DIRECTION TO CRAWL ALL THE WAY AROUND ANY SURFACE - EVEN UPSIDE DOWN.', 'KEEP MOVING TO EASE INTO A SPRINT; JUMP OFF A SPRINT OR SWING TO KEEP THE MOMENTUM.', 'WEB A CEILING TO SWING. THE LINE SLOWLY REELS YOU IN LIKE A HOOK SHOT.', 'WEB A GOLDEN FLY TO REEL IT IN. 5 FLIES POWER YOU UP TO TRAP AND BITE ENEMIES.'];
    tips.forEach((t, i) => drawText(t, BW / 2, 206 + i * 14, 1, '#bba8ff', 'center', '#140c26'));
    drawUIButtons(this.buttons(), uiSel);
  },
};

/* ---------- Private room menu + join code entry ---------- */
Screens.private = {
  buttons() {
    const cx = BW / 2, y0 = BH / 2 - 40;
    return [
      { label: 'HOST A ROOM', x: cx, y: y0, w: 200, h: 22, action: () => openStyle('host') },
      { label: 'JOIN WITH CODE', x: cx, y: y0 + 30, w: 200, h: 22, action: () => { Screens.join.code = ''; setScene('join'); } },
      { label: 'BOT MATCH (OFFLINE)', x: cx, y: y0 + 60, w: 200, h: 22, action: () => openStyle('bots') },
      { label: 'BACK', x: cx, y: y0 + 96, w: 200, h: 22, action: () => setScene('menu') },
    ];
  },
  draw() {
    drawMenuBackdrop(); dim(0.55);
    drawText('PRIVATE ROOM', BW / 2, BH / 2 - 100, 4, '#ffd23f', 'center', null, '#140c26');
    drawText('PLAY WITH FRIENDS: 1V1, 2V2 TEAMS OR 4-PLAYER FREE-FOR-ALL', BW / 2, BH / 2 - 66, 1, '#ffffff', 'center', '#140c26');
    drawUIButtons(this.buttons(), uiSel);
  },
};
Screens.join = {
  code: '',
  keys() {
    const out = [], cols = 8, kw = 26, kh = 20, x0 = BW / 2 - (cols * (kw + 4)) / 2 + kw / 2 + 2, y0 = BH / 2 - 12;
    NET.CODE_CHARS.split('').forEach((ch, i) => out.push({ label: ch, x: x0 + (i % cols) * (kw + 4), y: y0 + Math.floor(i / cols) * (kh + 4), w: kw, h: kh, action: () => this.type(ch) }));
    return out;
  },
  type(ch) { if (this.code.length < 4) { this.code += ch; SFX.play('select'); } },
  buttons() {
    const k = this.keys(), y = BH / 2 + 90;
    k.push({ label: 'DEL', x: BW / 2 - 110, y, w: 80, h: 22, action: () => { this.code = this.code.slice(0, -1); SFX.play('back'); } });
    k.push({ label: 'JOIN', x: BW / 2, y, w: 100, h: 22, disabled: this.code.length !== 4, action: () => { if (this.code.length === 4) openStyle('join'); } });
    k.push({ label: 'BACK', x: BW / 2 + 110, y, w: 80, h: 22, action: () => setScene('private') });
    return k;
  },
  update(dt, nav) {
    for (const ch of Input.typed) {
      if (ch === '\b') this.code = this.code.slice(0, -1);
      else { const u = ch.toUpperCase(); if (NET.CODE_CHARS.includes(u)) this.type(u); }
    }
    if (Input.pressed.Enter && this.code.length === 4) { openStyle('join'); return true; }
    if (Input.pressed.Escape) { setScene('private'); return true; }
    if (Input.pressed.Backspace) return true;
    return false;
  },
  draw() {
    drawMenuBackdrop(); dim(0.6);
    drawText('ENTER ROOM CODE', BW / 2, BH / 2 - 110, 3, '#ffd23f', 'center', null, '#140c26');
    for (let i = 0; i < 4; i++) {
      const x = BW / 2 - 66 + i * 34;
      panel(x, BH / 2 - 76, 28, 34, 0.9);
      const ch = this.code[i] || (i === this.code.length && Math.floor(T * 2) % 2 ? '_' : '');
      drawText(ch, x + 14, BH / 2 - 66, 3, '#ffffff', 'center');
    }
    drawText('TYPE IT OR TAP THE KEYS (NO 0/O/1/I)', BW / 2, BH / 2 - 32, 1, '#bba8ff', 'center', '#140c26');
    drawUIButtons(this.buttons(), uiSel);
  },
};

/* ---------- Network test ---------- */
let netTestReturn = 'menu';
Screens.nettest = {
  buttons() {
    const y = BH - 26;
    return [
      { label: 'COPY REPORT', x: BW / 2 - 140, y, w: 120, h: 22, disabled: NetTest.running, action: () => copyText(NetTest.report()).then(ok => { NetTest.copied = ok ? 2 : -2; }) },
      { label: 'RUN AGAIN', x: BW / 2, y, w: 120, h: 22, disabled: NetTest.running, action: () => NetTest.run() },
      { label: 'BACK', x: BW / 2 + 140, y, w: 120, h: 22, action: () => setScene(netTestReturn) },
    ];
  },
  update(dt) { if (NetTest.copied > 0) NetTest.copied = Math.max(0, NetTest.copied - dt); if (NetTest.copied < 0) NetTest.copied = Math.min(0, NetTest.copied + dt); return false; },
  draw() {
    drawMenuBackdrop(); dim(0.75);
    drawText('NETWORK TEST', BW / 2, 12, 3, '#ffd23f', 'center', null, '#140c26');
    const pw = Math.min(BW - 20, 470), px = Math.round(BW / 2 - pw / 2);
    panel(px, 42, pw, 8 * 22 + 8, 0.9);
    NetTest.steps.forEach((s, i) => {
      const y = 48 + i * 22;
      const icon = s.status === 'ok' ? ['OK', '#7df06a'] : s.status === 'warn' ? ['!!', '#ffd23f'] : s.status === 'fail' ? ['XX', '#ff5a7a'] : s.status === 'run' ? ['..'.slice(0, 1 + Math.floor(T * 3) % 2), '#9ad0ff'] : ['--', '#6a6080'];
      drawText(icon[0], px + 10, y + 3, 1, icon[1]);
      drawText((i + 1) + '. ' + s.name, px + 30, y, 1, '#ffffff');
      drawText(s.detail, px + 30, y + 10, 1, '#9a90c0');
    });
    if (!NetTest.steps.length) drawText('STARTING...', BW / 2, 100, 1, '#ffffff', 'center');
    const v = NetTest.running ? 'TESTING... ' + Math.floor((nowMs() - NetTest.started) / 1000) + 'S' : NetTest.verdict;
    drawText(v, BW / 2, 236, 2, NetTest.running ? '#ffffff' : NetTest.verdictColor, 'center', null, '#140c26');
    drawText('STATUS: ' + (strictNet === true ? 'STRICT NETWORK (RELAY)' : strictNet === false ? 'OPEN NETWORK' : 'NAT UNKNOWN') + (window.TrysteroFailed ? "  - COULDN'T LOAD MULTIPLAYER" : ''), BW / 2, 258, 1, '#bba8ff', 'center');
    if (NetTest.copied) drawText(NetTest.copied > 0 ? 'REPORT COPIED TO CLIPBOARD' : 'COPY FAILED', BW / 2, 272, 1, NetTest.copied > 0 ? '#7df06a' : '#ff5a7a', 'center');
    drawUIButtons(this.buttons(), uiSel);
  },
};

/* ---------- Campaign pause / game over / ending ---------- */
Screens.pause = {
  buttons() {
    const cx = BW / 2, y0 = BH / 2 - 30;
    const inVs = pauseFrom === 'vs';
    const b = [{ label: 'RESUME', x: cx, y: y0, w: 170, h: 22, action: () => setScene(pauseFrom) }];
    if (!inVs) {
      b.push({ label: 'RESTART LEVEL', x: cx, y: y0 + 28, w: 170, h: 22, action: () => { Campaign.restart(); setScene('level'); } });
      b.push(Campaign.practice ? { label: 'PRACTICE MENU', x: cx, y: y0 + 56, w: 170, h: 22, action: () => setScene('practice') }
                               : { label: 'WORLD MAP', x: cx, y: y0 + 56, w: 170, h: 22, action: () => { Overworld.enter(Campaign.level); setScene('overworld'); } });
    } else b.push({ label: 'NETWORK TEST', x: cx, y: y0 + 28, w: 170, h: 22, action: () => { netTestReturn = 'pause'; setScene('nettest'); NetTest.run(); } });
    b.push({ label: 'OPTIONS', x: cx, y: y0 + (inVs ? 56 : 84), w: 170, h: 22, action: () => { optionsReturn = 'pause'; setScene('options'); } });
    b.push({ label: inVs ? 'LEAVE MATCH' : 'MAIN MENU', x: cx, y: y0 + (inVs ? 84 : 112), w: 170, h: 22, action: () => { if (inVs) VS.leave(); else setScene('menu'); } });
    return b;
  },
  draw() {
    if (pauseFrom === 'vs') { VS.draw(); } else Campaign.draw();
    dim(0.6);
    drawText('PAUSED', BW / 2, BH / 2 - 80, 5, '#ffffff', 'center', null, '#140c26');
    if (pauseFrom === 'vs') drawText('THE MATCH KEEPS RUNNING!', BW / 2, BH / 2 - 44, 1, '#ffd23f', 'center', '#140c26');
    drawUIButtons(this.buttons(), uiSel);
  },
};
let pauseFrom = 'level';
Screens.gameover = {
  buttons() {
    const cx = BW / 2, y0 = BH / 2 + 30;
    return [
      { label: 'TRY AGAIN', x: cx, y: y0, w: 170, h: 22, action: () => { Campaign.restart(); setScene('level'); } },
      Campaign.practice ? { label: 'PRACTICE MENU', x: cx, y: y0 + 28, w: 170, h: 22, action: () => setScene('practice') }
                        : { label: 'WORLD MAP', x: cx, y: y0 + 28, w: 170, h: 22, action: () => { Overworld.enter(Campaign.level); setScene('overworld'); } },
      { label: 'MAIN MENU', x: cx, y: y0 + 56, w: 170, h: 22, action: () => setScene('menu') },
    ];
  },
  draw() {
    Campaign.W.draw(); dim(0.62);
    drawText('GAME OVER', BW / 2, BH / 2 - 80, 6, '#ff5a7a', 'center', '#7a1f3a', '#140c26');
    const cause = Campaign.me.cause;
    const why = cause === 'water' ? 'YOU FELL IN THE WATER!' : cause === 'bite' ? 'THE ' + BIOMES[Campaign.level].npc + ' GOT YOU!' : cause === 'fire' ? 'BURNED UP!' : 'OUT OF HEALTH!';
    drawText(why, BW / 2, BH / 2 - 26, 1, '#ffffff', 'center', '#140c26');
    drawText('A NEW LAYOUT AWAITS ON EVERY TRY', BW / 2, BH / 2 - 12, 1, '#bba8ff', 'center', '#140c26');
    drawUIButtons(this.buttons(), uiSel);
  },
};
Screens.ending = {
  fx: [],
  buttons() {
    const cx = BW / 2, y0 = BH / 2 + 46, d = Campaign.diff;
    const b = [];
    if (d < 3) b.push({ label: 'TRY ' + DIFFS[d + 1].name, x: cx, y: y0, w: 190, h: 22, action: () => { save.diff = d + 1; persist(); Overworld.enter(0); setScene('overworld'); } });
    b.push({ label: 'WORLD MAP', x: cx, y: y0 + (d < 3 ? 28 : 0), w: 190, h: 22, action: () => { Overworld.enter(3); setScene('overworld'); } });
    b.push({ label: 'MAIN MENU', x: cx, y: y0 + (d < 3 ? 56 : 28), w: 190, h: 22, action: () => setScene('menu') });
    return b;
  },
  update(dt) {
    if (Math.random() < dt * 3) { const x = Math.random() * BW, y = 30 + Math.random() * BH * 0.4, col = pick(Math.random, ['#ffd23f', '#ff5a7a', '#7df06a', '#9ad0ff', '#b77cff']); for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, s = 30 + Math.random() * 70; this.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.4, col }); } }
    for (const p of this.fx) { p.life -= dt; p.vy += 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.fx = this.fx.filter(p => p.life > 0);
    return false;
  },
  draw() {
    drawMenuBackdrop(); dim(0.55);
    for (const p of this.fx) { ctx.globalAlpha = clamp(p.life, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    ctx.globalAlpha = 1;
    drawText('YOU BEAT THE BLACK WIDOW!', BW / 2, BH / 2 - 112, 2, '#ffffff', 'center', null, '#140c26');
    const s = textWidth('NEW LEVELS COMING SOON!', 4) > BW - 20 ? 3 : 4;
    drawText('NEW LEVELS COMING SOON!', BW / 2, BH / 2 - 80, s, '#ffd23f', 'center', '#8a5a00', '#140c26');
    drawStarShape(ctx, BW / 2 - 40, BH / 2 - 20, 12, '#ffd23f', T);
    drawText('x ' + save.stars, BW / 2 - 22, BH / 2 - 27, 2, '#ffd23f', 'left', '#140c26');
    drawText('CLEARED ON ' + DIFFS[Campaign.diff].name, BW / 2, BH / 2 + 4, 1, DIFFS[Campaign.diff].color, 'center', '#140c26');
    drawParade();
    drawUIButtons(this.buttons(), uiSel);
  },
};
Screens.rotate = {
  draw() {
    ctx.fillStyle = '#1a1330'; ctx.fillRect(0, 0, BW, BH);
    const cx = BW / 2, cy = BH / 2 - 60, a = (Math.sin(T * 2) * 0.5 + 0.5) * Math.PI / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-a);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-30, -52, 60, 104);
    ctx.fillStyle = '#1a1330'; ctx.fillRect(-25, -44, 50, 84);
    ctx.fillStyle = '#7df06a'; ctx.fillRect(-25, 10, 50, 30);
    ctx.restore();
    drawText('ROTATE YOUR DEVICE', cx, cy + 90, 3, '#ffffff', 'center', '#000000');
    drawText('GEAR BUGS PLAYS BEST IN LANDSCAPE', cx, cy + 124, 2, '#ffd23f', 'center');
    drawText('TAP TO PLAY ANYWAY', cx, cy + 160, 2, 'rgba(255,255,255,0.7)', 'center');
  },
};
