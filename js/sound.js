/* ===== POKER SOUND: короткие звуки, синтезированные в браузере (без файлов) ===== */
var PKSound = (function () {
  'use strict';
  let ctx = null, enabled = true, volume = 0.35;
  function ac() {
    if (!enabled) return null;
    try {
      if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(c, t0, freq, dur, type, gain, slideTo) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((gain || 0.5) * volume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(c, t0, dur, gain, hp) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp || 2000;
    g.gain.value = (gain || 0.4) * volume;
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t0);
  }
  const SOUNDS = {
    deal: (c, t) => noise(c, t, 0.06, 0.5, 3000),
    chip: (c, t) => { tone(c, t, 2400, 0.05, 'triangle', 0.35); tone(c, t + 0.045, 3100, 0.05, 'triangle', 0.25); },
    fold: (c, t) => noise(c, t, 0.09, 0.25, 1200),
    check: (c, t) => { tone(c, t, 380, 0.05, 'square', 0.12); tone(c, t + 0.08, 380, 0.05, 'square', 0.12); },
    win: (c, t) => [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.08, f, 0.22, 'triangle', 0.4)),
    ok: (c, t) => { tone(c, t, 880, 0.12, 'sine', 0.4); tone(c, t + 0.09, 1320, 0.18, 'sine', 0.35); },
    bad: (c, t) => tone(c, t, 220, 0.22, 'sawtooth', 0.18, 150),
    goal: (c, t) => [659, 784, 988, 1319].forEach((f, i) => tone(c, t + i * 0.1, f, 0.3, 'triangle', 0.4)),
    turn: (c, t) => tone(c, t, 660, 0.12, 'sine', 0.3),
    end: (c, t) => { tone(c, t, 440, 0.2, 'sine', 0.4); tone(c, t + 0.2, 330, 0.35, 'sine', 0.4); }
  };
  function play(name) {
    const c = ac(), f = SOUNDS[name];
    if (!c || !f) return;
    try { f(c, c.currentTime + 0.01); } catch (e) { /* звук необязателен */ }
  }
  return {
    play,
    setEnabled(v) { enabled = !!v; if (enabled) ac(); },
    get enabled() { return enabled; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); }
  };
})();
/* ===== END POKER SOUND ===== */
