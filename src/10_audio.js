/* =====================================================================
   10_AUDIO - retro arcade sound effects synthesized with the Web Audio API
   ===================================================================== */
const SFX = {
  ac: null, master: null, noiseBuf: null, last: {},
  init() {
    try {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ac.destination);
        const len = this.ac.sampleRate;
        this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { /* audio unavailable */ }
  },
  tone(f0, f1, dur, type = 'square', vol = 0.2, delay = 0) {
    if (!settings.sound || !this.ac) return;
    const c = this.ac, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, vol = 0.2, freq = 1200, delay = 0, ftype = 'lowpass') {
    if (!settings.sound || !this.ac) return;
    const c = this.ac, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.03);
  },
  // Play a named effect. `gap` throttles repeats (seconds) so swarms don't spam.
  play(name, gap = 0) {
    if (!settings.sound || !this.ac) return;
    if (gap) { const n = this.ac.currentTime; if (this.last[name] && n - this.last[name] < gap) return; this.last[name] = n; }
    switch (name) {
      case 'jump':    this.tone(280, 640, 0.12, 'square', 0.13); break;
      case 'drop':    this.tone(300, 200, 0.08, 'triangle', 0.12); break;
      case 'land':    this.tone(160, 90, 0.05, 'square', 0.05); break;
      case 'web':     this.tone(1150, 260, 0.13, 'sawtooth', 0.07); this.noise(0.07, 0.08, 3200, 0, 'highpass'); break;
      case 'attach':  this.tone(520, 880, 0.06, 'triangle', 0.14); break;
      case 'release': this.tone(500, 320, 0.08, 'triangle', 0.1); break;
      case 'snap':    this.noise(0.08, 0.15, 2400, 0, 'highpass'); break;
      case 'fly':     this.tone(988, 988, 0.07, 'square', 0.12); this.tone(1480, 1480, 0.2, 'square', 0.12, 0.07); break;
      case 'reel':    this.tone(700, 1200, 0.15, 'triangle', 0.12); break;
      case 'powerup': [523, 659, 784, 1047, 1319].forEach((f, i) => { this.tone(f, f, 0.14, 'square', 0.12, i * 0.08); this.tone(f / 2, f / 2, 0.14, 'triangle', 0.11, i * 0.08); }); break;
      case 'trap':    this.noise(0.25, 0.22, 900); this.tone(300, 80, 0.3, 'square', 0.15); this.tone(1200, 1900, 0.2, 'triangle', 0.1, 0.1); break;
      case 'noeffect':this.tone(190, 160, 0.08, 'square', 0.13); this.tone(140, 110, 0.14, 'square', 0.13, 0.09); break;
      case 'slow':    this.tone(400, 150, 0.25, 'triangle', 0.14); break;
      case 'windup':  this.tone(90, 140, 0.28, 'sawtooth', 0.07); break;
      case 'tongue':  this.tone(180, 560, 0.15, 'triangle', 0.2); break;
      case 'hurt':    this.tone(420, 70, 0.35, 'sawtooth', 0.2); this.noise(0.2, 0.2, 800); break;
      case 'bite':    this.noise(0.15, 0.32, 600); this.tone(160, 55, 0.2, 'square', 0.24); this.tone(900, 1400, 0.12, 'square', 0.1, 0.15); break;
      case 'star':    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.12, i * 0.06)); break;
      case 'free':    this.tone(200, 420, 0.2, 'sawtooth', 0.1); break;
      case 'buzz':    this.tone(210, 230, 0.18, 'sawtooth', 0.035); break;
      case 'sting':   this.tone(1400, 600, 0.12, 'square', 0.13); this.noise(0.1, 0.15, 3000, 0, 'highpass'); break;
      case 'beedown': this.tone(900, 120, 0.35, 'square', 0.1); break;
      case 'splash':  this.noise(0.45, 0.3, 1400); this.tone(400, 90, 0.4, 'sine', 0.2); break;
      case 'dash':    this.noise(0.18, 0.18, 1800, 0, 'bandpass'); this.tone(120, 380, 0.18, 'sawtooth', 0.12); break;
      case 'shriek':  this.tone(1800, 900, 0.25, 'sawtooth', 0.1); this.tone(1700, 800, 0.25, 'square', 0.06, 0.04); break;
      case 'webspit': this.tone(300, 120, 0.2, 'sawtooth', 0.12); this.noise(0.15, 0.1, 1500); break;
      case 'stuck':   this.tone(200, 140, 0.2, 'square', 0.12); break;
      case 'mash':    this.tone(500 + Math.random() * 200, 300, 0.05, 'square', 0.07); break;
      case 'fire':    this.noise(0.4, 0.2, 700, 0, 'lowpass'); this.tone(90, 60, 0.4, 'sawtooth', 0.1); break;
      case 'ignite':  this.noise(0.2, 0.12, 1200, 0, 'bandpass'); break;
      case 'death':   this.tone(600, 40, 0.7, 'sawtooth', 0.2); this.noise(0.4, 0.2, 500); break;
      case 'complete': {
        const notes = [523, 659, 784, 1047, 0, 784, 1047, 1319, 1319], durs = [0.11, 0.11, 0.11, 0.24, 0.07, 0.11, 0.11, 0.28, 0.4];
        let t = 0;
        notes.forEach((f, i) => { if (f) { this.tone(f, f, durs[i], 'square', 0.12, t); this.tone(f / 2, f / 2, durs[i], 'triangle', 0.12, t); } t += durs[i]; });
        break;
      }
      case 'gameover': [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.97, 0.26, 'square', 0.13, i * 0.22)); break;
      case 'round':   [392, 523, 659].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.12, i * 0.1)); break;
      case 'count':   this.tone(660, 660, 0.09, 'square', 0.12); break;
      case 'go':      this.tone(1047, 1047, 0.3, 'square', 0.14); this.tone(523, 523, 0.3, 'triangle', 0.12); break;
      case 'step':    this.tone(330, 330, 0.03, 'square', 0.05); break;
      case 'unlock':  [659, 784, 988, 1319].forEach((f, i) => this.tone(f, f, 0.1, 'triangle', 0.14, i * 0.07)); break;
      case 'join':    this.tone(660, 990, 0.12, 'triangle', 0.14); break;
      case 'leave':   this.tone(500, 250, 0.2, 'triangle', 0.12); break;
      case 'select':  this.tone(660, 660, 0.04, 'square', 0.07); break;
      case 'confirm': this.tone(880, 1320, 0.08, 'square', 0.11); break;
      case 'back':    this.tone(600, 400, 0.08, 'square', 0.09); break;
    }
  }
};
