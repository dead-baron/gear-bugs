/* =====================================================================
   90_MAIN - scene machine, main loop, resize, version check, boot
   ===================================================================== */
let scene = 'menu';
let ignoreRotate = false;
let newVersion = false;

function setScene(name) {
  const from = scene;
  scene = name; uiSel = 0;
  consumeInput();
  if ((name === 'level' || name === 'vs') && Input.last === 'touch' && from !== 'pause') tryFullscreenLandscape();
}
function isGameplay() {
  if (scene === 'level') return true;
  if (scene === 'vs') return VS.sub === 'searching' || (VS.sub === 'match' && VS.phase !== 'final' && !!VS.W);
  return false;
}
function rotateBlocked() { return isTouchDevice && window.innerHeight > window.innerWidth && !ignoreRotate; }
function tryFullscreenLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
    }
  } catch (e) {}
}
function onFocusLost() {
  if (scene === 'level') { pauseFrom = 'level'; setScene('pause'); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onFocusLost();
  else checkVersion();
});
window.addEventListener('pagehide', () => { if (VS.net) { try { VS.net.close(); } catch (e) {} } if (VS.searchNet) { try { VS.searchNet.close(); } catch (e) {} } });

/* ---------- Build stamp: refetch the page to spot new deploys ---------- */
async function checkVersion() {
  if (BUILD.indexOf('__') === 0 || location.protocol === 'file:') return;
  try {
    const r = await fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' });
    const t = await r.text();
    const m = t.match(/const BUILD = '([^']+)'/);
    if (m && m[1] !== BUILD) newVersion = true;
  } catch (e) {}
}
setInterval(checkVersion, 60000);
function versionButton() { return { label: 'NEW VERSION READY', x: BW / 2, y: BH - 12, w: 150, h: 16, action: () => location.reload() }; }

/* ---------- Scene plumbing ---------- */
function sceneButtons() {
  if (scene === 'overworld') return Overworld.buttons();
  if (scene === 'vs') return VS.currentButtons();
  const s = Screens[scene];
  return s && s.buttons ? s.buttons() : [];
}
function backAction() {
  switch (scene) {
    case 'options': Screens.options.confirmReset = false; setScene(optionsReturn); break;
    case 'controls': setScene('options'); break;
    case 'private': setScene('menu'); break;
    case 'nettest': setScene(netTestReturn); break;
    case 'pause': setScene(pauseFrom); break;
    case 'gameover': Overworld.enter(Campaign.level); setScene('overworld'); break;
    case 'ending': setScene('menu'); break;
    case 'overworld': setScene('menu'); break;
    case 'vs': if (VS.sub === 'wait' || VS.sub === 'connecting') VS.leave(); break;
    default: return;
  }
  SFX.play('back');
}
function genericNav(buttons, nav) {
  // pointer taps
  for (const t of Input.taps) {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (!b.disabled && inRect(t, btnRect(b))) { uiSel = i; SFX.play('confirm'); b.action(); consumeInput(); return; }
    }
  }
  // mouse hover selects
  if (Input.last === 'mouse' && Input.mouse.active) {
    for (let i = 0; i < buttons.length; i++) if (inRect(Input.mouse, btnRect(buttons[i]))) { if (uiSel !== i) SFX.play('select'); uiSel = i; }
  }
  const n = buttons.length;
  if (nav.back) { backAction(); return; }
  if (!n) return;
  const step = d => { for (let k = 0; k < n; k++) { uiSel = (uiSel + d + n) % n; if (!buttons[uiSel].disabled) break; } SFX.play('select'); };
  if (nav.up || nav.left) step(-1);
  if (nav.down || nav.right) step(1);
  uiSel = clamp(uiSel, 0, n - 1);
  if (nav.confirm && buttons[uiSel] && !buttons[uiSel].disabled) { SFX.play('confirm'); buttons[uiSel].action(); consumeInput(); }
}
function hoverCursor(buttons) {
  if (Input.last !== 'mouse') return;
  let over = buttons.some(b => inRect(Input.mouse, btnRect(b)));
  if (scene === 'overworld') over = over || Overworld.nodes.some(n => dist(Input.mouse.x - OX, Input.mouse.y - OY, n.x, n.y) < 26);
  canvas.style.cursor = gameplayPointer ? (uiHot.some(r => inRect(Input.mouse, r)) ? 'pointer' : 'none') : over ? 'pointer' : 'default';
}

/* ---------- Per-frame update ---------- */
function update(dt) {
  if (rotateBlocked()) {
    if (Input.taps.length || Input.pressed.Enter || Input.pressed.Space || gp.pressed(0)) ignoreRotate = true;
    if (VS.sub !== 'idle' && scene === 'vs') VS.update(dt, NO_CONTROLS, {});
    return;
  }
  // "NEW VERSION READY" pill (menus, lobbies, results)
  if (newVersion && !gameplayPointer) {
    const vb = versionButton();
    for (const t of Input.taps) if (inRect(t, btnRect(vb))) { vb.action(); return; }
  }
  const nav = readMenuNav(dt);
  if (scene === 'level') {
    const c = readPlayerControls();
    if (c.pause) { pauseFrom = 'level'; setScene('pause'); SFX.play('select'); return; }
    Campaign.update(dt, c);
    return;
  }
  if (scene === 'vs') {
    if (isGameplay()) {
      // overlay buttons (search screen) take taps before gameplay
      if (VS.sub === 'searching') { for (const t of Input.taps) for (const b of VS.searchButtons()) if (inRect(t, btnRect(b))) { SFX.play('confirm'); b.action(); consumeInput(); return; } }
      const c = readPlayerControls();
      if (c.pause && VS.sub === 'match') { pauseFrom = 'vs'; setScene('pause'); SFX.play('select'); VS.update(dt, NO_CONTROLS, nav); return; }
      if (c.pause && VS.sub === 'searching') { VS.leave(); return; }
      VS.update(dt, c, nav);
      return;
    }
    VS.update(dt, NO_CONTROLS, nav);
    if (scene === 'vs') {
      const bs = VS.currentButtons();
      if (VS.sub === 'wait' && VS.isHost && (nav.tabL || nav.tabR)) VS.cycleMode(nav.tabL ? -1 : 1);
      genericNav(bs, nav);
    }
    return;
  }
  if (scene === 'pause' && pauseFrom === 'vs') VS.update(dt, NO_CONTROLS, nav);
  if (scene === 'pause' && pauseFrom === 'vs' && scene === 'pause' && VS.sub === 'idle') { setScene('menu'); return; }
  if (scene === 'overworld') {
    for (const t of Input.taps) {
      const bs = Overworld.buttons();
      const hitBtn = bs.find(b => inRect(t, btnRect(b)));
      if (hitBtn) { SFX.play('confirm'); hitBtn.action(); consumeInput(); return; }
      if (Overworld.tapNode(t)) { consumeInput(); return; }
    }
    if (nav.confirm) { Overworld.play(); return; }
    if (nav.back) { backAction(); return; }
    Overworld.update(dt, nav);
    return;
  }
  const S = Screens[scene];
  if (S && S.update && S.update(dt, nav)) {
    // screen handled its own navigation; still honour pointer taps on its buttons
    for (const t of Input.taps) for (const b of S.buttons()) if (!b.disabled && inRect(t, btnRect(b))) { SFX.play('confirm'); b.action(); consumeInput(); return; }
    return;
  }
  genericNav(sceneButtons(), nav);
}

/* ---------- Render ---------- */
function render() {
  ctx.imageSmoothingEnabled = false;
  uiHot = [];
  if (rotateBlocked()) { Screens.rotate.draw(); return; }
  switch (scene) {
    case 'level': Campaign.draw(); break;
    case 'overworld': Overworld.draw(); break;
    case 'vs': VS.draw(); break;
    default: if (Screens[scene]) Screens[scene].draw(); break;
  }
  if (gameplayPointer && Input.last === 'touch' && !(scene === 'vs' && VS.sub === 'match' && VS.me && !VS.me.alive)) drawTouchControls();
  if (newVersion && !gameplayPointer) drawButton(versionButton(), Math.floor(T * 2) % 2 === 0);
  hoverCursor(gameplayPointer ? [] : sceneButtons());
}

/* ---------- Resize ---------- */
function resize() {
  const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
  const aspect = vw / vh;
  if (aspect >= REF_W / REF_H) { BH = REF_H; BW = Math.round(REF_H * aspect); }
  else { BW = REF_W; BH = Math.round(REF_W / aspect); }
  canvas.width = BW; canvas.height = BH;
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  OX = Math.floor((BW - REF_W) / 2);
  OY = Math.floor((BH - REF_H) / 2);
  ctx.imageSmoothingEnabled = false;
  ART.level = null;            // force art rebuild at the new size
  layoutTouch();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------- Main loop ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  T += dt;
  pollGamepad();
  gameplayPointer = isGameplay();
  try { update(dt); } catch (e) { console.error(e); }
  gameplayPointer = isGameplay();
  try { render(); } catch (e) { console.error(e); }
  endFrameInput();
  requestAnimationFrame(frame);
}

/* ---------- Boot ---------- */
resize();
(function boot() {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || '').toUpperCase();
  if (room.length === 4 && [...room].every(ch => NET.CODE_CHARS.includes(ch))) { Screens.join.code = room; scene = 'join'; }
  // warm the network stack at page load (ICE servers + strict-NAT detection)
  iceServers();
  setTimeout(() => { detectStrictNat(); }, 400);
  setTimeout(() => { loadTrystero(); }, 1500);
  setTimeout(checkVersion, 5000);
})();
requestAnimationFrame(frame);
