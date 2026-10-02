/* =====================================================================
   20_INPUT - keyboard, mouse, touch, gamepad -> unified actions
   ---------------------------------------------------------------------
   Gameplay reads readPlayerControls() once per frame; menus read
   readMenuNav() and consume pointer taps from Input.taps.
   ===================================================================== */
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const Input = {
  keys: {}, pressed: {}, typed: [],
  mouse: { x: -100, y: -100, active: false },
  taps: [],                              // UI taps/clicks: {x, y, kind} in buffer coords
  last: (isTouchDevice && window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'touch' : 'mouse',
  shots: [],                             // pending gameplay shots from pointer input
  touchMash: 0,
  wheel: 0,
};
// Touch controls state + layout (buffer coords)
const touch = {
  joy: { id: null, bx: 0, by: 0, vx: 0, vy: 0 },
  web: { id: null, dx: 0, dy: 0 },
  jump: { id: null, pressed: false, held: false },
};
const TL = { joy: { x: 64, y: 0, r: 34 }, jump: { x: 0, y: 0, r: 25 }, web: { x: 0, y: 0, r: 27 }, pause: { x: 0, y: 6, w: 20, h: 20 } };
function layoutTouch() {
  TL.joy.x = 64; TL.joy.y = BH - 62;
  TL.jump.x = BW - 44; TL.jump.y = BH - 46;
  TL.web.x = BW - 110; TL.web.y = BH - 80;
  TL.pause.x = BW - 26; TL.pause.y = 6;
}
let gameplayPointer = false;   // set by the scene machine: true while a gameplay scene owns the pointer

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Escape', 'Tab', 'Backspace']);
window.addEventListener('keydown', e => {
  if (!Input.keys[e.code]) Input.pressed[e.code] = true;
  Input.keys[e.code] = true;
  if (Input.last !== 'mouse' || !Input.mouse.active) Input.last = 'keyboard';
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) Input.typed.push(e.key);
  if (e.code === 'Backspace') Input.typed.push('\b');
  SFX.init();
  if (GAME_KEYS.has(e.code) || (gameplayPointer && /^Key[A-Z]$/.test(e.code))) e.preventDefault();
});
window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in Input.keys) Input.keys[k] = false; onFocusLost(); });

function toBuffer(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * BW / r.width, y: (e.clientY - r.top) * BH / r.height };
}
const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { Input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  SFX.init();
  canvas.focus();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const p = toBuffer(e);
  if (e.pointerType === 'mouse') {
    Input.last = 'mouse'; Input.mouse.x = p.x; Input.mouse.y = p.y; Input.mouse.active = true;
    if (gameplayPointer) {
      const hot = uiHot.find(r => inRect(p, r));
      if (hot) { Input.taps.push({ x: p.x, y: p.y, kind: 'mouse', pause: !!hot.pause }); return; }
      if (e.button === 2) { Input.pressed.MouseRight = true; return; }
      Input.shots.push({ type: 'point', x: p.x - OX, y: p.y - OY });
      return;
    }
    Input.taps.push({ x: p.x, y: p.y, kind: 'mouse' });
    return;
  }
  // ---- touch / pen ----
  Input.last = 'touch';
  if (settings.autoFull && typeof tryFullscreenLandscape === 'function' && !isStandalone()) tryFullscreenLandscape();
  if (!gameplayPointer) { Input.taps.push({ x: p.x, y: p.y, kind: 'touch' }); return; }
  const hot = uiHot.find(r => inRect(p, { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }));
  if (hot) { Input.taps.push({ x: p.x, y: p.y, kind: 'touch', pause: !!hot.pause }); return; }
  if (dist(p.x, p.y, TL.jump.x, TL.jump.y) < TL.jump.r + 10 && touch.jump.id === null) { touch.jump.id = e.pointerId; touch.jump.pressed = true; touch.jump.held = true; Input.touchMash++; return; }
  if (dist(p.x, p.y, TL.web.x, TL.web.y) < TL.web.r + 10 && touch.web.id === null) { touch.web.id = e.pointerId; touch.web.dx = 0; touch.web.dy = 0; Input.touchMash++; return; }
  if (p.x < BW * 0.45 && touch.joy.id === null) { touch.joy.id = e.pointerId; touch.joy.bx = p.x; touch.joy.by = p.y; touch.joy.vx = 0; touch.joy.vy = 0; return; }
  if (p.x >= BW * 0.45) { Input.shots.push({ type: 'point', x: p.x - OX, y: p.y - OY }); Input.touchMash++; }
});
canvas.addEventListener('pointermove', e => {
  const p = toBuffer(e);
  if (e.pointerType === 'mouse') {
    if (Math.abs(p.x - Input.mouse.x) + Math.abs(p.y - Input.mouse.y) > 0.5) { Input.last = 'mouse'; Input.mouse.active = true; }
    Input.mouse.x = p.x; Input.mouse.y = p.y;
    return;
  }
  if (e.pointerId === touch.joy.id) {
    let dx = p.x - touch.joy.bx, dy = p.y - touch.joy.by;
    const d = Math.hypot(dx, dy), R = TL.joy.r;
    if (d > R) { touch.joy.bx += dx / d * (d - R); touch.joy.by += dy / d * (d - R); dx = dx / d * R; dy = dy / d * R; }
    touch.joy.vx = dx / R; touch.joy.vy = dy / R;
  } else if (e.pointerId === touch.web.id) {
    touch.web.dx = p.x - TL.web.x; touch.web.dy = p.y - TL.web.y;
  }
});
function endPointer(e) {
  if (e.pointerId === touch.joy.id) { touch.joy.id = null; touch.joy.vx = touch.joy.vy = 0; }
  if (e.pointerId === touch.jump.id) { touch.jump.id = null; touch.jump.held = false; }
  if (e.pointerId === touch.web.id) {
    touch.web.id = null;
    if (gameplayPointer) {
      const d = Math.hypot(touch.web.dx, touch.web.dy);
      Input.shots.push(d > 10 ? { type: 'dir', x: touch.web.dx, y: touch.web.dy } : { type: 'ahead' });
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- Gamepad (standard mapping: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=Back 9=Start 11=RS 12-15=D-pad) ---------- */
const gp = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, btn: [], prev: [], pressed(i) { return !!this.btn[i] && !this.prev[i]; } };
function pollGamepad() {
  gp.prev = gp.btn.slice(); gp.btn = []; gp.connected = false;
  let pads = [];
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
  let pad = null;
  for (const p of pads || []) if (p && p.connected) { pad = p; break; }
  if (!pad) { gp.lx = gp.ly = gp.rx = gp.ry = 0; return; }
  gp.connected = true;
  const dz = v => Math.abs(v) < 0.22 ? 0 : v;
  gp.lx = dz(pad.axes[0] || 0); gp.ly = dz(pad.axes[1] || 0);
  gp.rx = dz(pad.axes[2] || 0); gp.ry = dz(pad.axes[3] || 0);
  for (let i = 0; i < pad.buttons.length; i++) { const b = pad.buttons[i]; gp.btn[i] = !!(b && (b.pressed || b.value > 0.5)); }
  if (gp.lx || gp.ly || Math.hypot(gp.rx, gp.ry) > 0.3 || gp.btn.some(Boolean)) { Input.last = 'gamepad'; SFX.init(); }
}

/* ---------- Gameplay controls (local player) ---------- */
const MASH_KEYS = ['Space', 'KeyJ', 'KeyK', 'KeyF', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX'];
function readPlayerControls() {
  const k = Input.keys, kp = Input.pressed;
  let mx = 0, my = 0;
  if (k.ArrowLeft || k.KeyA) mx -= 1;
  if (k.ArrowRight || k.KeyD) mx += 1;
  if (k.ArrowUp || k.KeyW) my -= 1;
  if (k.ArrowDown || k.KeyS) my += 1;
  if (gp.connected) {
    mx += gp.lx; my += gp.ly;
    if (gp.btn[14]) mx -= 1; if (gp.btn[15]) mx += 1; if (gp.btn[12]) my -= 1; if (gp.btn[13]) my += 1;
  }
  if (touch.joy.id !== null) { mx += touch.joy.vx; my += touch.joy.vy; }
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }

  const c = {
    mx, my,
    jump: !!(kp.Space || kp.KeyZ || kp.MouseRight) || gp.pressed(0) || touch.jump.pressed,
    jumpHeld: !!(k.Space || k.KeyZ) || !!gp.btn[0] || touch.jump.held,
    shoot: null, mash: 0, pause: false, aim: null,
  };
  touch.jump.pressed = false;
  // mash counting (break free of webs)
  for (const key of MASH_KEYS) if (kp[key]) c.mash++;
  if (gp.connected) for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15]) if (gp.pressed(b)) c.mash++;
  c.mash += Input.touchMash; Input.touchMash = 0;
  if (Input.shots.length) c.mash += Input.shots.length;

  // Shooting: pointer shots first, then keys / gamepad
  if (Input.shots.length) c.shoot = Input.shots[Input.shots.length - 1];
  Input.shots.length = 0;
  if (!c.shoot && (kp.KeyJ || kp.KeyK || kp.KeyF || kp.KeyX)) {
    if (Input.mouse.active && Input.last === 'mouse') c.shoot = { type: 'point', x: Input.mouse.x - OX, y: Input.mouse.y - OY };
    else c.shoot = { type: 'ahead' };
  }
  if (!c.shoot && gp.connected && (gp.pressed(5) || gp.pressed(7) || gp.pressed(4) || gp.pressed(2) || gp.pressed(11))) {
    c.shoot = Math.hypot(gp.rx, gp.ry) > 0.3 ? { type: 'dir', x: gp.rx, y: gp.ry } : { type: 'ahead' };
  }
  // Live aim (for the aim guide)
  if (Input.last === 'mouse' && Input.mouse.active) c.aim = { type: 'point', x: Input.mouse.x - OX, y: Input.mouse.y - OY };
  else if (Input.last === 'gamepad' && Math.hypot(gp.rx, gp.ry) > 0.3) c.aim = { type: 'dir', x: gp.rx, y: gp.ry };
  else if (touch.web.id !== null && Math.hypot(touch.web.dx, touch.web.dy) > 10) c.aim = { type: 'dir', x: touch.web.dx, y: touch.web.dy };

  c.pause = !!(kp.Escape || kp.KeyP) || gp.pressed(9);
  for (const t of Input.taps) if (t.pause) c.pause = true;
  return c;
}
const NO_CONTROLS = { mx: 0, my: 0, jump: false, jumpHeld: false, shoot: null, mash: 0, pause: false, aim: null };

/* ---------- Menu navigation (any device) ---------- */
let navCD = 0, navCDx = 0;
function readMenuNav(dt) {
  const kp = Input.pressed;
  let up = !!(kp.ArrowUp || kp.KeyW), down = !!(kp.ArrowDown || kp.KeyS);
  let left = !!(kp.ArrowLeft || kp.KeyA), right = !!(kp.ArrowRight || kp.KeyD);
  let confirm = !!(kp.Enter || kp.Space), back = !!(kp.Escape || kp.Backspace);
  let tabL = !!kp.KeyQ, tabR = !!kp.KeyE;
  if (gp.connected) {
    up = up || gp.pressed(12); down = down || gp.pressed(13); left = left || gp.pressed(14); right = right || gp.pressed(15);
    confirm = confirm || gp.pressed(0); back = back || gp.pressed(1);
    tabL = tabL || gp.pressed(4); tabR = tabR || gp.pressed(5);
    navCD -= dt; navCDx -= dt;
    if (Math.abs(gp.ly) > 0.6 && navCD <= 0) { if (gp.ly < 0) up = true; else down = true; navCD = 0.24; }
    if (Math.abs(gp.ly) < 0.3) navCD = 0;
    if (Math.abs(gp.lx) > 0.6 && navCDx <= 0) { if (gp.lx < 0) left = true; else right = true; navCDx = 0.24; }
    if (Math.abs(gp.lx) < 0.3) navCDx = 0;
  }
  if (Input.wheel) { if (Input.wheel < 0) up = true; else down = true; Input.wheel = 0; }
  return { up, down, left, right, confirm, back, tabL, tabR };
}
function endFrameInput() {
  for (const k in Input.pressed) delete Input.pressed[k];
  Input.taps.length = 0;
  Input.typed.length = 0;
  touch.jump.pressed = false;
}
function consumeInput() {
  endFrameInput();
  gp.prev = gp.btn.slice();
  Input.shots.length = 0;
  Input.touchMash = 0;
}
