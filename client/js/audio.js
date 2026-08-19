// All sound is synthesised — no asset downloads. Gunfire is a filtered noise
// burst over a pitch-dropping sine; the sea is filtered pink noise.

import { getSettings } from './settings.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return null; }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = getSettings().volume / 100;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2);
    return this.ctx;
  }

  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume(); }

  setVolume(v) { if (this.master) this.master.gain.value = v / 100; }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // pink-ish
      data[i] = last * 3.2;
    }
    return buf;
  }

  noise(when, dur, { freq = 700, q = 0.7, gain = 0.5, type = 'lowpass', sweep = 0 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    gain = Math.max(0.0002, gain);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + Math.min(0.02, dur * 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(when); src.stop(when + dur + 0.05);
  }

  tone(when, dur, { f0 = 120, f1 = 40, gain = 0.4, type = 'sine' } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    gain = Math.max(0.0002, gain);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(12, f1), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(this.master);
    osc.start(when); osc.stop(when + dur + 0.05);
  }

  /** distance 0..1, 1 being far away — everything gets quieter and duller. */
  gun(caliber = 152, distance = 0) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const big = caliber / 406;
    const near = 1 - distance;
    this.noise(t, 0.45 + big * 0.9, { freq: 900 - big * 550, gain: 0.42 * near, sweep: 0.25 });
    this.tone(t, 0.5 + big * 1.1, { f0: 150 - big * 80, f1: 26, gain: 0.5 * near * (0.5 + big) });
  }

  explosion(scale = 1, distance = 0) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const near = 1 - distance;
    this.noise(t, 0.9 * scale, { freq: 480, gain: 0.5 * near, sweep: 0.12 });
    this.tone(t, 1.1 * scale, { f0: 90, f1: 18, gain: 0.55 * near });
  }

  splash(distance = 0) {
    const ctx = this.ensure(); if (!ctx) return;
    this.noise(ctx.currentTime + 0.01, 0.5, { freq: 2400, gain: 0.16 * (1 - distance), sweep: 0.15, type: 'bandpass', q: 0.9 });
  }

  torpedo() {
    const ctx = this.ensure(); if (!ctx) return;
    this.noise(ctx.currentTime + 0.01, 0.7, { freq: 1400, gain: 0.22, sweep: 0.4, type: 'highpass' });
  }

  alarm() {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.32, 0.22, { f0: 720, f1: 700, gain: 0.16, type: 'square' });
  }

  click() {
    const ctx = this.ensure(); if (!ctx) return;
    this.tone(ctx.currentTime, 0.05, { f0: 420, f1: 260, gain: 0.1, type: 'triangle' });
  }

  hit(kind) {
    const ctx = this.ensure(); if (!ctx) return;
    if (kind === 'citadel') { this.explosion(1.3, 0.1); this.tone(ctx.currentTime, 0.5, { f0: 300, f1: 60, gain: 0.3, type: 'sawtooth' }); }
    else if (kind === 'ricochet' || kind === 'shatter') this.noise(ctx.currentTime, 0.25, { freq: 3200, gain: 0.12, type: 'bandpass', sweep: 0.3 });
    else this.explosion(0.7, 0.2);
  }

  /** Continuous engine and sea bed, started once the battle opens. */
  startAmbience() {
    const ctx = this.ensure(); if (!ctx || this.ambience) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 340;
    const g = ctx.createGain(); g.gain.value = 0.055;
    src.connect(filt).connect(g).connect(this.master);
    src.start();
    const rumble = ctx.createOscillator();
    rumble.type = 'sine'; rumble.frequency.value = 46;
    const rg = ctx.createGain(); rg.gain.value = 0.03;
    rumble.connect(rg).connect(this.master);
    rumble.start();
    this.ambience = { src, g, rumble, rg };
  }

  setEngineLoad(load) {
    if (!this.ambience) return;
    this.ambience.rg.gain.value = 0.014 + load * 0.05;
    this.ambience.rumble.frequency.value = 38 + load * 26;
  }

  stopAmbience() {
    if (!this.ambience) return;
    try { this.ambience.src.stop(); this.ambience.rumble.stop(); } catch { /* already stopped */ }
    this.ambience = null;
  }
}

export const audio = new Audio();
