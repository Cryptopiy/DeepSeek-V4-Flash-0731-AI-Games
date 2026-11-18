// audio.js ----------------------------------------------------------------
// 100% procedural Web Audio: engine, crash, siren, skid, UI clicks.
// Silently no-ops (no context) until the user clicks Start.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null; // {osc, gain, filter}
    this.siren = null;
    this.skid = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(on) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = 900;
    g.gain.value = 0.15;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(t + 0.08);
  }

  engineStart() {
    if (!this.ctx || this.engine) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start();
    // add a second sub-oscillator an octave down for weight
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 25;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    osc2.connect(g2); g2.connect(gain);
    osc2.start();
    this.engine = { osc, osc2, filter, gain };
  }

  engineUpdate(sp01, throttle01) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const f = 45 + sp01 * 95 + throttle01 * 14;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(200 + sp01 * 900, t, 0.08);
    const vol = 0.012 + sp01 * 0.14 + throttle01 * 0.05;
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.08);
  }

  engineStop() {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const g = this.engine.gain;
    g.gain.setTargetAtTime(0, t, 0.05);
    const e = this.engine;
    this.engine = null;
    setTimeout(() => {
      try { e.osc.stop(); e.osc2.stop(); e.osc.disconnect(); e.osc2.disconnect(); e.gain.disconnect(); } catch (err) {}
    }, 400);
  }

  crash(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 * Math.max(0.2, intensity);
    const g = this.ctx.createGain();
    g.gain.value = Math.min(0.5, 0.15 + intensity * 0.2);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g2); g2.connect(this.master);
    o.start(); o.stop(t + 0.35);
  }

  skidSound(on, intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this.skid) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer();
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1200;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      this.skid = { src, g };
    }
    if (this.skid) {
      const target = on ? 0.05 + intensity * 0.1 : 0;
      this.skid.g.gain.setTargetAtTime(target, t, 0.06);
      if (!on) {
        const s = this.skid;
        this.skid = null;
        setTimeout(() => { try { s.src.stop(); s.src.disconnect(); s.g.disconnect(); } catch (e) {} }, 300);
      }
    }
  }

    sirenOn() {
    if (!this.ctx || this.siren) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const o1 = this.ctx.createOscillator();
    o1.type = 'square';
    o1.frequency.value = 540;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 240;
    const g1 = this.ctx.createGain(); g1.gain.value = 0.5;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(g1); g1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(this.master);
    o1.start(); o2.start();
    // two-tone alternation driven in update()
    this.siren = { g, g1, g2, o1, o2, state: 0 };
  }

  sirenUpdate() {
    if (!this.ctx || !this.siren) return;
    const s = this.siren;
    s.state += 0.016;
    const phase = (s.state % 1.2);
    this.ctx.currentTime;
    s.g1.gain.value = (phase < 0.6 ? 1 : 0.05);
    s.g2.gain.value = (phase >= 0.6 ? 1 : 0.05);
    s.g.gain.value = 0.05;
  }

  sirenOff() {
    if (!this.ctx || !this.siren) return;
    const s = this.siren;
    this.siren = null;
    try {
      s.g1.disconnect(); s.g2.disconnect(); s.g.disconnect();
      s.o1.stop(); s.o2.stop(); s.o1.disconnect(); s.o2.disconnect();
    } catch (e) {}
  }
}
