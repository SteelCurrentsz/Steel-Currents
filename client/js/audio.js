// The battle's sound: every noise put where it happened and heard from where
// the camera is.
//
// The sounds themselves are built in sfx.js, sample by sample, in a worker so
// the battle never waits on one. What this file does is the hearing: a gun
// fifteen hundred metres off arrives a beat and a half after its flash, a
// great deal quieter than one alongside and with the crack gone out of it,
// because air takes the top off a sound long before it takes the bottom. A
// ship close aboard is heard working through the water and her machinery
// turning; one going down is heard creaking. Bring the camera in on any of
// it and it gets louder and brighter, because you are nearer to it.
//
// Nothing here is allowed to stop the game. Web Audio refuses a value that is
// not a number -- `AudioParam` and the schedulers all throw "the provided
// value is non-finite" rather than ignoring it -- and every figure in this
// file is worked out from something that happened in the battle. So every
// number is checked on the way in, and a sound that cannot be worked out is
// simply not played.

import { getSettings } from './settings.js';
import { sfxKit, RECIPES, rng } from './sfx.js';
import { loadVoiceLines } from './render/voicebank.js';
import { GPU } from './render/gpusafe.js';

/** A number, or the fallback -- so nothing that is not a number reaches the API. */
function num(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }

/** A number held between two others, with anything that is not a number at `lo`. */
function span(v, lo, hi, fallback = lo) {
  if (!Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

/** The rate the takes are built at: all a sound at a distance needs, and quick. */
const BUILD_RATE = 32000;
/** Sound in air, metres a second. */
const SPEED_OF_SOUND = 343;
/** The longest a sound is held back for its distance: past it, it is too quiet to matter. */
const MAX_DELAY = 1.6;
const MAX_VOICES = 48;
/** How many ships are heard working through the water at once, nearest first. */
const SHIP_VOICES = 4;

/**
 * Everything said on the bridge: the orders that go a second before a weapon
 * does, and the reports -- what has happened to her, and what has been seen.
 * A report waiting on him keeps longer than an order, which is no use once the
 * weapon it was for has gone.
 */
const LINES = {
  main: 'order', sec: 'order', torp: 'order', aa: 'order', dc: 'order',
  abandon: 'report', lastShell: 'report', spotted: 'report', torpPort: 'report',
  torpStbd: 'report', breach: 'report', seal: 'report',
};
const KEEPS = { order: 2.5, report: 8 };
/** The navies that have their own voice; any other ship speaks as an American. */
const NAVIES = new Set(['usa', 'gbr', 'ger', 'fra', 'jpn']);

/**
 * The order the takes are built in: what is heard in the first seconds of a
 * battle first, the rare things last.
 */
const BUILD_ORDER = [
  'gunMedium', 'gunHeavy', 'gunLight', 'splashSmall', 'splashLarge', 'sea', 'wash',
  'turbines', 'boomSmall', 'clang', 'pom', 'rattle', 'boomInside', 'boomLarge',
  'ricochet', 'shatter', 'splashBomb', 'launch', 'torpHit', 'crash', 'creak', 'groan',
  'bang', 'vent', 'magazine', 'wind', 'diesels', 'alarm', 'shellAir',
];

function seedOf(name, take) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h ^ Math.imul(take + 1, 0x9E3779B1)) >>> 0;
}

/**
 * Ease an audio parameter toward `v` -- but not every frame. Each call puts an
 * event on the parameter's timeline, and a sound updated sixty times a second
 * for the length of a battle piled up tens of thousands of them: on an iPad,
 * where the sound is run by the same process as the graphics, that was more
 * than it would carry. So a change too small to hear is skipped, and none is
 * sent sooner than a tenth of a second after the last.
 */
function glide(param, v, now, tc) {
  if (!param || !Number.isFinite(v)) return;
  const last = param.__v;
  const ago = now - (param.__t ?? -1e9);
  if (last != null) {
    const small = Math.abs(v - last) <= 0.03 * Math.max(Math.abs(last), 0.02);
    if (ago < 0.08 || (small && ago < 0.6)) return;
  }
  param.__v = v; param.__t = now;
  param.setTargetAtTime(v, now, tc);
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.bank = new Map();
    this.voices = 0;
    this.recent = new Map();
    this.ear = { x: 0, y: 30, z: 0, rx: 1, rz: 0, set: false };
    this.shipVoices = new Map();
    this.creaks = new Map();
    this.ambience = null;
    this.orders = new Map();
    this.orderGiven = {};
    this.speakingUntil = 0;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return null; }
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = span(getSettings().volume / 100, 0, 1);
    this.master.connect(ctx.destination);
    // Everything that happens goes through one compressor, the way an ear
    // closes up under gunfire: a broadside alongside is not allowed to clip,
    // and the sea goes quiet under it for a moment.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.35;
    comp.connect(this.master);
    // Everything but the bridge goes through one more gain, which drops
    // while an order is being shouted and comes back after it: the guns and
    // the sea are held under him so every order is heard, however much is
    // going off.
    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.85;
    this.sfx.connect(this.duck);
    this.amb = ctx.createGain();
    this.amb.gain.value = 1;
    this.amb.connect(this.duck);
    // And the bridge has a path of its own: loud, past the battle's
    // compressor, with a limiter of its own so a shout as loud as this
    // stays clean.
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4;
    lim.knee.value = 2;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.12;
    lim.connect(this.master);
    this.voice = ctx.createGain();
    this.voice.gain.value = 1.7;
    this.voice.connect(lim);
    this.startBuilding();
    return ctx;
  }

  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume(); }

  setVolume(v) { if (this.master) this.master.gain.value = span(v / 100, 0, 1); }

  // ------------------------------------------------------------ building ----

  /**
   * Every take of every sound, built off the main thread: one at a time, in
   * the order they are wanted. Without a worker -- a host that refuses one --
   * they are built here instead, one between frames.
   */
  startBuilding() {
    const jobs = [];
    for (const name of BUILD_ORDER) {
      const r = RECIPES[name];
      if (!r) continue;
      for (let take = 0; take < r.takes; take++) jobs.push({ name, take });
    }
    this.jobs = jobs;
    try {
      const src = `const K = (${sfxKit.toString()})();\n`
        + 'onmessage = (e) => { const { name, take, sr, seed } = e.data;'
        + ' const chs = K.RECIPES[name].make(sr, K.rng(seed));'
        + ' postMessage({ name, take, sr, chs }, chs.map((c) => c.buffer)); };';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (e) => { this.store(e.data); this.nextJob(); };
      w.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this.worker = null;
        try { w.terminate(); } catch { /* gone */ }
        // Whatever was in hand goes back on the list for the main thread.
        if (this.inHand) this.jobs.unshift(this.inHand);
        this.inHand = null;
        this.buildHere();
      };
      this.worker = w;
      this.nextJob();
    } catch {
      this.worker = null;
      this.buildHere();
    }
  }

  nextJob() {
    const job = this.jobs.shift();
    this.inHand = job || null;
    if (!job || !this.worker) return;
    this.worker.postMessage({ ...job, sr: BUILD_RATE, seed: seedOf(job.name, job.take) });
  }

  buildHere() {
    const step = () => {
      const job = this.jobs.shift();
      if (!job) return;
      try {
        const chs = RECIPES[job.name].make(BUILD_RATE, rng(seedOf(job.name, job.take)));
        this.store({ ...job, sr: BUILD_RATE, chs });
      } catch { /* that one is not heard */ }
      setTimeout(step, 60);
    };
    setTimeout(step, 0);
  }

  store({ name, sr, chs }) {
    const ctx = this.ctx;
    if (!ctx || !chs || !chs.length) return;
    try {
      const buf = ctx.createBuffer(chs.length, chs[0].length, sr);
      chs.forEach((c, i) => buf.copyToChannel ? buf.copyToChannel(c, i) : buf.getChannelData(i).set(c));
      if (!this.bank.has(name)) this.bank.set(name, []);
      this.bank.get(name).push(buf);
      // A loop that was waiting on its take starts now.
      if (this.ambience && (name === 'sea' || name === 'wind')) this.startAmbienceLoops();
    } catch { /* a buffer the device would not make */ }
  }

  take(name) {
    const list = this.bank.get(name);
    if (!list || !list.length) return null;
    return list[(Math.random() * list.length) | 0];
  }

  // ------------------------------------------------------------- hearing ----

  /** Where the ears are: the camera, every frame. */
  listen(camera) {
    if (!camera || !camera.position) return;
    const p = camera.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    const e = camera.matrixWorld && camera.matrixWorld.elements;
    let rx = 1, rz = 0;
    if (e && Number.isFinite(e[0]) && Number.isFinite(e[2])) {
      const l = Math.hypot(e[0], e[2]);
      if (l > 1e-4) { rx = e[0] / l; rz = e[2] / l; }
    }
    this.ear = { x: p.x, y: p.y, z: p.z, rx, rz, set: true };
    this.updateAmbience();
  }

  /**
   * How a sound at `at` reaches the camera: how loud, how dull, which side
   * and how late. `at` is a point in the world; nothing is a sound at the
   * ears themselves (the ship's own alarm); and a bare number is the old 0..1
   * of how far off, for a caller that has no point to give.
   */
  hear(at, ref) {
    if (at == null) return { g: 1, fc: 20000, pan: 0, delay: 0 };
    if (typeof at === 'number') {
      const f = span(at, 0, 1, 1);
      return { g: (1 - f) * (1 - f), fc: 20000 * (1 - f) + 300, pan: 0, delay: 0 };
    }
    const ear = this.ear;
    const x = num(at.x, NaN), z = num(at.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const y = num(at.y, 4);
    const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z;
    const d = Math.hypot(dx, dy, dz);
    // Spreading: half as loud for twice as far, once past the sound's own size.
    const g = ref / Math.max(ref, d);
    // And the air: the top goes first.
    const fc = span(19000 / (1 + d / 260), 160, 19000);
    const side = d > 1 ? (dx * ear.rx + dz * ear.rz) / d : 0;
    const pan = span(side * Math.min(1, d / 40) * 0.8, -0.8, 0.8, 0);
    const delay = Math.min(MAX_DELAY, d / SPEED_OF_SOUND);
    return { g, fc, pan, delay, d };
  }

  /**
   * One sound, once, where it happened. `level` is how loud it is at `ref`
   * metres; `rate` pitches it (and its length) by that much; `dull` takes more
   * of the top off, for something heard through a hull or the sea.
   */
  play(name, at, { level = 1, ref = 200, rate = 1, dull = 1, after = 0 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    const buf = this.take(name);
    if (!buf) return;
    const h = this.hear(at, span(ref, 1, 1e5, 200));
    if (!h) return;
    const g = h.g * span(level, 0, 4, 0);
    if (g < 0.0025) return;
    if (this.voices >= MAX_VOICES || (this.voices >= MAX_VOICES * 0.7 && g < 0.06)) return;
    // The same noise at the same place in the same instant is one noise: a
    // salvo of nine landing together is not nine times as loud.
    // (A burst put down round by round is not: those are held apart on purpose.)
    if (at && typeof at === 'object' && !(after > 0)) {
      const key = `${name}|${Math.round(num(at.x) / 30)}|${Math.round(num(at.z) / 30)}`;
      const last = this.recent.get(key);
      if (last != null && ctx.currentTime - last < 0.04) return;
      this.recent.set(key, ctx.currentTime);
      if (this.recent.size > 200) this.recent.clear();
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = span(rate * (0.96 + Math.random() * 0.08), 0.25, 4, 1);
      const gain = ctx.createGain();
      gain.gain.value = span(g, 0, 4, 0);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = span(h.fc / span(dull, 1, 40, 1), 60, 20000, 20000);
      lp.Q.value = 0.5;
      let tail = src.connect(gain).connect(lp);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = h.pan;
        tail = tail.connect(pan);
      }
      tail.connect(this.sfx);
      this.voices++;
      src.onended = () => { this.voices--; try { src.disconnect(); gain.disconnect(); lp.disconnect(); } catch { /* gone */ } };
      src.start(ctx.currentTime + 0.005 + h.delay + span(after, 0, 10, 0));
    } catch { /* not heard */ }
  }

  // ---------------------------------------------------------------- guns ----

  /**
   * A gun, or a turret's worth of them, going off at `at`. Heavier guns are
   * louder and carry further, and what is heard of them from far off is the
   * roll and not the crack -- the air sees to that.
   */
  gun(caliber = 152, at = null, barrels = 1) {
    const cal = span(caliber, 7, 510, 152);
    const n = span(barrels, 1, 4, 1);
    const more = 1 + 0.18 * (n - 1);
    if (cal >= 250) {
      this.play('gunHeavy', at, { level: (0.8 + 0.2 * (cal - 250) / 210) * more, ref: 200 + cal * 1.4, rate: 1.06 - (cal - 250) / 1600 });
    } else if (cal >= 120) {
      this.play('gunMedium', at, { level: (0.55 + 0.3 * (cal - 120) / 130) * more, ref: 120 + cal * 1.4, rate: 1.12 - (cal - 120) / 700 });
    } else if (cal >= 60) {
      this.play('gunLight', at, { level: (0.42 + 0.15 * (cal - 60) / 60) * more, ref: 90 + cal * 1.3, rate: 1.15 - (cal - 60) / 500 });
    } else if (cal >= 30) {
      this.play('pom', at, { level: 0.38, ref: 90, rate: 1.1 - (cal - 30) / 120 });
    } else {
      this.play('rattle', at, { level: 0.3, ref: 60, rate: 1.05 - cal / 200 });
    }
  }

  /**
   * The light battery firing at aircraft: the automatic guns going in short
   * bursts, as many rounds as there are barrels on her, about, or the heavy
   * dual-purpose mountings banging away out at long range.
   */
  aa(caliber = 40, barrels = 4, at = null) {
    const cal = span(caliber, 7, 200, 40);
    const n = span(barrels, 1, 80, 4);
    if (cal >= 75) {
      this.play('gunLight', at, { level: 0.42, ref: 200, rate: 1.1 });
      if (n > 6) this.play('gunLight', at, { level: 0.32, ref: 200, rate: 1.04, after: 0.08 + Math.random() * 0.12 });
      return;
    }
    const pom = cal >= 30;
    const shots = Math.min(pom ? 4 : 7, Math.max(1, Math.round(pom ? n / 5 : n / 3)));
    const gap = pom ? 0.075 : 0.045;
    for (let i = 0; i < shots; i++) {
      this.play(pom ? 'pom' : 'rattle', at, {
        level: pom ? 0.34 : 0.24, ref: pom ? 110 : 70,
        rate: (pom ? 1.0 : 1.08) + (Math.random() - 0.5) * 0.06,
        after: i * gap + Math.random() * gap,
      });
    }
  }

  // ------------------------------------------------------ what lands ----

  /** A round into the sea (`caliber` in mm), or a bomb if `bomb`. */
  splash(caliber = 150, at = null, bomb = false) {
    // The old call: splash(distance).
    if (typeof caliber === 'number' && at == null && caliber <= 1) {
      this.play('splashSmall', caliber, { level: 0.5 });
      return;
    }
    const cal = span(caliber, 5, 2000, 150);
    if (bomb) { this.play('splashBomb', at, { level: 0.95, ref: 380, rate: 0.95 + Math.random() * 0.1 }); return; }
    if (cal < 30) return;
    if (cal >= 200) {
      this.play('splashLarge', at, { level: 0.5 + 0.3 * Math.min(1, (cal - 200) / 260), ref: 180 + cal * 0.5, rate: 1.08 - Math.min(0.2, (cal - 200) / 1300) });
    } else {
      this.play('splashSmall', at, { level: 0.3 + 0.3 * (cal - 30) / 170, ref: 70 + cal * 0.6, rate: 1.15 - (cal - 30) / 900 });
    }
  }

  /**
   * A round arriving on a ship. What got in goes off inside her, deadened by
   * the plating round it; what did not, rings the plate; a citadel is the
   * worst of both.
   */
  hit(kind, caliber = 150, at = null) {
    const cal = span(caliber, 5, 510, 150);
    const big = Math.min(1, cal / 406);
    const ref = 140 + cal * 0.9;
    switch (kind) {
      case 'citadel':
        this.play('boomInside', at, { level: 1, ref, rate: 0.9 });
        this.play('boomLarge', at, { level: 0.6, ref, after: 0.05 });
        break;
      case 'pen':
        this.play('boomInside', at, { level: 0.55 + 0.4 * big, ref, rate: 1.1 - 0.2 * big });
        break;
      case 'he':
        this.play(cal >= 200 ? 'boomLarge' : 'boomSmall', at, { level: 0.5 + 0.4 * big, ref, rate: 1.1 - 0.15 * big });
        break;
      case 'overpen':
        // In one side and out of the other without going off: a hard punch
        // through the plate.
        this.play('clang', at, { level: 0.5 + 0.3 * big, ref, rate: 0.85 });
        break;
      case 'shatter':
        this.play('shatter', at, { level: 0.5 + 0.3 * big, ref, rate: 1.1 - 0.25 * big });
        break;
      case 'ricochet':
        this.play('ricochet', at, { level: 0.5 + 0.3 * big, ref, rate: 1.1 - 0.25 * big });
        break;
      case 'splash':
        break;
      default:
        this.play('clang', at, { level: 0.45 + 0.3 * big, ref, rate: 1.15 - 0.3 * big });
    }
  }

  /**
   * Anything else blowing up. `scale` is the old measure of how big (0.5 a
   * small burst, 2 and over something very large); `at` a point, or the old
   * 0..1 of how far off.
   */
  explosion(scale = 1, at = null) {
    const s = span(scale, 0.1, 4, 1);
    const name = s >= 1.35 ? 'boomLarge' : 'boomSmall';
    this.play(name, at, { level: Math.min(1, 0.45 + s * 0.3), ref: 150 + s * 220, rate: 1.12 - Math.min(0.3, s * 0.1) });
  }

  /** A magazine going up: heard from anywhere in the action. */
  magazine(at = null) {
    this.play('magazine', at, { level: 1.1, ref: 2600 });
  }

  /** A torpedo leaving her tubes. */
  torpedo(at = null) { this.play('launch', at, { level: 0.5, ref: 80 }); }

  /** A torpedo going off against a hull. */
  torpHit(at = null) { this.play('torpHit', at, { level: 1, ref: 500, rate: 0.95 + Math.random() * 0.1 }); }

  /** A depth charge: a deep, deadened blow, and the sea going up over it. */
  depthCharge(at = null, depth = 0) {
    const shallow = span(1 - depth / 90, 0.3, 1, 1);
    this.play('splashBomb', at, { level: 0.9 * shallow, ref: 320, rate: 0.85, dull: 1 + (1 - shallow) * 4 });
  }

  /** Two hulls meeting, as hard as `v` metres a second. */
  crash(at = null, v = 5) {
    const hard = span(v / 10, 0.2, 1.6, 0.5);
    this.play('crash', at, { level: 0.5 + 0.4 * Math.min(1, hard), ref: 200, rate: 1.1 - 0.2 * Math.min(1, hard) });
  }

  /** Steel tearing: a back breaking, a bow coming off. */
  tear(at = null, size = 1) {
    const s = span(size, 0.3, 2, 1);
    this.play('groan', at, { level: 1, ref: 260 * s, rate: 1.15 - s * 0.2 });
    this.play('crash', at, { level: 0.7, ref: 220 * s, rate: 0.75, after: 0.15 });
    this.play('splashLarge', at, { level: 0.7, ref: 260 * s, rate: 0.8, after: 0.5 });
  }

  /** Thousands of tonnes of her going into the sea at once. */
  slam(at = null, size = 1) {
    this.play('splashBomb', at, { level: 0.9, ref: 300 * span(size, 0.3, 2, 1), rate: 0.75 });
  }

  /** The sea closing over her: the air in her coming out all at once. */
  founder(at = null) {
    this.play('vent', at, { level: 1, ref: 220, rate: 0.85 });
    this.play('bang', at, { level: 0.8, ref: 220, after: 0.4 });
    this.play('splashLarge', at, { level: 0.6, ref: 240, rate: 0.7, after: 0.2 });
  }

  // ------------------------------------------------------------ the bridge ----

  /**
   * An order shouted on the bridge of the ship you are on: `order` is 'main',
   * 'sec', 'torp', 'aa' or 'dc', `many` whether it is a spread of torpedoes or
   * more than one aeroplane, and `nation` her navy, whose language he speaks.
   */
  order(order, nation = 'usa', many = false) {
    this.say(order, nation, { many });
  }

  /**
   * Anything said on the bridge (see LINES), in her navy's language. `digits`
   * follows the line with a bearing read out figure by figure -- "bearing
   * two-seven-zero" -- the way a lookout reports one. One man says one thing
   * at a time: a second line while he is still on the first follows straight
   * after it, if it is still worth saying then, and the same line twice in a
   * breath is one line.
   */
  say(line, nation = 'usa', { many = false, digits = null } = {}) {
    if (getSettings().voices === false) return;
    if (!LINES[line]) return;
    const ctx = this.ensure(); if (!ctx) return;
    const now = ctx.currentTime;
    const tag = digits ? `${line}:${digits}` : line;
    if (now - (this.orderGiven[tag] ?? -1e9) < 0.6) return;
    if (now < this.speakingUntil) {
      const q = (this.orderQueue || []).filter((w) => w.tag !== tag);
      q.push({ order: line, nation, many, digits, tag, at: now });
      // What has happened to her before what is to be done.
      q.sort((x, y) => (LINES[y.order] === 'report') - (LINES[x.order] === 'report'));
      this.orderQueue = q;
      if (!this.orderTimer) {
        this.orderTimer = setTimeout(() => this.nextOrder(), Math.max(50, (this.speakingUntil - now) * 1000));
      }
      return;
    }
    this.orderGiven[tag] = now;
    // Held while the line is fetched and opened, so a salvo of four turrets
    // in one tick does not start four of him.
    this.speakingUntil = now + 3;
    const navy = NAVIES.has(nation) ? nation : 'usa';
    const key = many && (line === 'torp' || line === 'aa') ? `${line}s` : line;
    const keys = [key, ...(digits ? String(digits).split('').map((d) => `d${d}`) : [])];
    Promise.all(keys.map((k) => this.orderBuffer(navy, k))).then((bufs) => {
      bufs = bufs.filter(Boolean);
      if (!bufs.length || !this.ctx) { this.speakingUntil = 0; return; }
      try {
        const c = this.ctx;
        const rate = 0.98 + Math.random() * 0.05;
        const at = c.currentTime + 0.02;
        let t = at;
        for (let i = 0; i < bufs.length; i++) {
          const src = c.createBufferSource();
          src.buffer = bufs[i];
          src.playbackRate.value = rate;
          const g = c.createGain();
          g.gain.value = 1;
          // On the bridge's own path, past the battle's compressor: he is
          // standing next to you, and the guns are not allowed to swallow him.
          src.connect(g).connect(this.voice || this.master);
          src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* gone */ } };
          src.start(t);
          // A breath after the line before the figures, and none between them.
          t += bufs[i].duration / rate + (i === 0 && bufs.length > 1 ? 0.12 : 0.02);
        }
        const len = t - at;
        // Everything else held well down under him for as long as he speaks,
        // and brought back up after.
        if (this.duck) {
          const d = this.duck.gain;
          d.cancelScheduledValues(at);
          d.setTargetAtTime(0.28, at - 0.02, 0.03);
          d.setTargetAtTime(1, at + len, 0.35);
        }
        this.speakingUntil = c.currentTime + len + 0.4;
      } catch { this.speakingUntil = 0; }
    }, () => { this.speakingUntil = 0; });
  }

  /** The next line waiting on him, if it is not stale by now. */
  nextOrder() {
    this.orderTimer = null;
    const ctx = this.ctx;
    if (!ctx || !this.orderQueue || !this.orderQueue.length) return;
    const now = ctx.currentTime;
    if (now < this.speakingUntil) {
      this.orderTimer = setTimeout(() => this.nextOrder(), Math.max(50, (this.speakingUntil - now) * 1000));
      return;
    }
    const q = this.orderQueue.shift();
    if (now - q.at < KEEPS[LINES[q.order]]) this.say(q.order, q.nation, { many: q.many, digits: q.digits });
    if (this.orderQueue.length && !this.orderTimer) this.orderTimer = setTimeout(() => this.nextOrder(), 100);
  }

  /** One order opened for playing, kept once it has been. */
  orderBuffer(navy, key) {
    const id = `${navy}:${key}`;
    if (this.orders.has(id)) return this.orders.get(id);
    const p = loadVoiceLines().then((lines) => {
      const set = lines && lines[navy];
      // Japanese has no plural, so it has no line for one.
      const b64 = set && (set[key] || set[key.replace(/s$/, '')]);
      if (!b64 || !this.ctx) return null;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Promise((res, rej) => {
        // The callback form, for the Safari that has no promise from it.
        const q = this.ctx.decodeAudioData(bytes.buffer, res, rej);
        if (q && q.then) q.then(res, rej);
      });
    }).catch(() => { this.orders.delete(id); return null; });
    this.orders.set(id, p);
    return p;
  }

  /** Have her navy's orders ready before the first is given. */
  readyOrders(nation) {
    if (getSettings().voices === false || !this.ensure()) return;
    const navy = NAVIES.has(nation) ? nation : 'usa';
    for (const k of ['main', 'sec', 'torp', 'torps', 'aa', 'aas', 'dc', 'abandon', 'lastShell',
      'spotted', 'torpPort', 'torpStbd', 'breach', 'seal', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6',
      'd7', 'd8', 'd9']) this.orderBuffer(navy, k);
  }

  alarm() {
    const ctx = this.ensure(); if (!ctx) return;
    if (this.take('alarm')) { this.play('alarm', null, { level: 0.3 }); return; }
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.42, 0.5, { f0: 430, f1: 425, gain: 0.08, type: 'sine' });
  }

  click() {
    const ctx = this.ensure(); if (!ctx) return;
    this.tone(ctx.currentTime, 0.05, { f0: 420, f1: 260, gain: 0.1, type: 'triangle' });
  }

  tone(when, dur, { f0 = 120, f1 = 40, gain = 0.4, type = 'sine' } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    when = num(when, ctx.currentTime);
    dur = span(dur, 0.01, 8, 0.3);
    gain = span(gain, 0.0002, 1, 0.0002);
    f0 = span(f0, 12, 20000, 120);
    f1 = span(f1, 12, 20000, 40);
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

  // --------------------------------------------------------------- ships ----

  /**
   * The ships near the camera, every frame: `{ id, x, z, load, len, sub,
   * depth, alive, sinking }`. The nearest few are heard under way -- the
   * water at her bow and along her side, her machinery -- louder the harder
   * she is steaming; and any going down is heard creaking and groaning as she
   * goes, now and then, from wherever she is.
   */
  ships(list) {
    const ctx = this.ctx;
    if (!ctx || !this.ambience || !Array.isArray(list)) return;
    const now = ctx.currentTime;
    const scored = [];
    for (const s of list) {
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
      const len = span(s.len, 10, 400, 150);
      const h = this.hear({ x: s.x, y: 3, z: s.z }, 60 + len * 0.6);
      if (!h) continue;
      scored.push({ s, h, len });
    }
    scored.sort((a, b) => b.h.g - a.h.g);
    const keep = new Set();
    let n = 0;
    for (const e of scored) {
      if (!e.s.alive || n >= SHIP_VOICES || e.h.g < 0.01) continue;
      n++;
      keep.add(e.s.id);
      this.shipVoice(e.s, e.h, e.len, now);
    }
    for (const [id, v] of this.shipVoices) {
      if (keep.has(id)) continue;
      this.fadeShip(v, now);
      if (now - v.quietSince > 1.5) { this.dropShip(v); this.shipVoices.delete(id); }
    }
    // And those going down.
    let sinking = 0;
    const live = new Set();
    for (const e of scored) {
      if (!e.s.sinking || sinking >= 3) continue;
      sinking++;
      live.add(e.s.id);
      let next = this.creaks.get(e.s.id);
      if (next == null) { next = now + 0.8 + Math.random() * 1.8; this.creaks.set(e.s.id, next); }
      if (now < next) continue;
      this.creaks.set(e.s.id, now + 2.2 + Math.random() * 4.5);
      const r = Math.random();
      const name = r < 0.4 ? 'creak' : r < 0.68 ? 'groan' : r < 0.86 ? 'bang' : 'vent';
      // Heard from her, low down: most of what is making it is under water.
      const at = { x: e.s.x + (Math.random() - 0.5) * e.len * 0.6, y: -1, z: e.s.z + (Math.random() - 0.5) * e.len * 0.3 };
      const big = Math.min(1.2, e.len / 220);
      this.play(name, at, { level: 0.75 + 0.25 * big, ref: 90 + e.len * 0.7, rate: 1.12 - 0.25 * big + (Math.random() - 0.5) * 0.12 });
    }
    for (const id of [...this.creaks.keys()]) if (!live.has(id)) this.creaks.delete(id);
  }

  /**
   * The rounds in the air near the camera, every frame: `{ i, x, y, z, c }`
   * (c the calibre in mm). A shell going through the air shrieks: torn air,
   * pitched by how big the shell is and how fast it is going, and pitched up
   * coming on and down going away, so a round passing overhead is heard
   * falling in pitch as it goes by. Riding one on the shell camera it is a
   * steady scream that slowly drops as she loses her speed. The nearest few
   * only; the rest are too far off to be heard over the guns.
   */
  shells(list, dt) {
    const ctx = this.ctx;
    if (!ctx || !this.ambience || !Array.isArray(list)) return;
    // Left off on a device that has lost its graphics (see gpusafe.js).
    if (!GPU.whistles) list = [];
    const now = ctx.currentTime;
    const ear = this.ear;
    const seen = this.shellSeen || (this.shellSeen = new Map());
    const voices = this.shellVoices || (this.shellVoices = new Map());
    const step = Math.max(1 / 240, num(dt, 1 / 60));
    const near = [];
    for (const sh of list) {
      if (!sh || !Number.isFinite(sh.x) || !Number.isFinite(sh.z)) continue;
      const y = num(sh.y, 0);
      const d = Math.hypot(sh.x - ear.x, y - ear.y, sh.z - ear.z);
      const was = seen.get(sh.i);
      let speed = 0, closing = 0;
      if (was) {
        speed = Math.hypot(sh.x - was.x, y - was.y, sh.z - was.z) / step;
        closing = (was.d - d) / step;
        // Faster than a shell flies is a jump of the camera, not a shell.
        if (speed > 1500) { speed = was.speed || 0; closing = 0; }
      }
      seen.set(sh.i, { x: sh.x, y, z: sh.z, d, speed, t: now });
      const reach = 250 + span(num(sh.c, 150), 20, 460, 150) * 1.6;
      if (d < reach && y > 0.5) near.push({ sh, d, speed, closing, reach });
    }
    for (const [id, w] of seen) if (now - w.t > 1) seen.delete(id);
    near.sort((a, b) => a.d - b.d);
    const keep = new Set();
    for (const e of near.slice(0, 3)) {
      keep.add(e.sh.i);
      this.shellVoice(e, now);
    }
    for (const [id, v] of voices) {
      if (keep.has(id)) continue;
      try { v.g.gain.setTargetAtTime(0, now, 0.08); v.g.gain.__v = 0; v.g.gain.__t = now; } catch { /* gone */ }
      if (v.quietSince == null) v.quietSince = now;
      if (now - v.quietSince > 0.6) {
        try { v.src.stop(); v.src.disconnect(); v.g.disconnect(); v.bp.disconnect(); v.bp2.disconnect(); v.lp.disconnect(); v.pan && v.pan.disconnect(); } catch { /* gone */ }
        voices.delete(id);
      }
    }
  }

  shellVoice(e, now) {
    const ctx = this.ctx;
    const voices = this.shellVoices;
    let v = voices.get(e.sh.i);
    if (!v) {
      const buf = this.take('shellAir');
      if (!buf) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        // The shriek: a narrow band of the torn air, and under it the rush.
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 11;
        const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.Q.value = 0.9;
        const g = ctx.createGain(); g.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
        let tail = g.connect(lp);
        let pan = null;
        if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); tail = tail.connect(pan); }
        tail.connect(this.sfx);
        const g1 = ctx.createGain(); g1.gain.value = 1;
        const g2 = ctx.createGain(); g2.gain.value = 0.35;
        src.connect(bp).connect(g1).connect(g);
        src.connect(bp2).connect(g2).connect(g);
        src.start(now, Math.random() * buf.duration);
        v = { src, bp, bp2, g, lp, pan, quietSince: null };
        voices.set(e.sh.i, v);
      } catch { return; }
    }
    v.quietSince = null;
    const cal = span(num(e.sh.c, 150), 20, 460, 150);
    // The bigger the round the lower it sings; the slower, the lower still.
    const base = 1250 - 1.6 * cal;
    const pace = Math.sqrt(span(e.speed / 650, 0.3, 1.6, 1));
    // Coming on, higher; going away, lower. Supersonic, the formula runs away:
    // held to what still sounds like the thing.
    const c = SPEED_OF_SOUND;
    const dop = span(c / Math.max(60, c - span(e.closing, -c * 0.6, c * 0.8, 0)), 0.6, 2.2, 1);
    const f = span(base * pace * dop, 180, 5000, 800);
    const h = this.hear({ x: e.sh.x, y: e.sh.y, z: e.sh.z }, 30);
    if (!h) return;
    // Loud close by, gone at the edge of hearing it.
    const edge = 1 - span(e.d / e.reach, 0, 1, 1);
    const level = 0.55 * (0.5 + cal / 460) * h.g * edge * edge;
    const tc = 0.05;
    try {
      glide(v.bp.frequency, f, now, tc);
      glide(v.bp2.frequency, f * 0.55, now, tc);
      glide(v.src.playbackRate, span(0.8 + 0.3 * dop, 0.5, 2, 1), now, tc);
      glide(v.g.gain, span(level, 0, 1.5, 0), now, tc);
      glide(v.lp.frequency, span(h.fc, 200, 20000, 20000), now, tc);
      if (v.pan) glide(v.pan.pan, h.pan, now, tc);
    } catch { /* next frame */ }
  }

  shipVoice(s, h, len, now) {
    const ctx = this.ctx;
    let v = this.shipVoices.get(s.id);
    const sub = !!s.sub;
    const machName = sub ? 'diesels' : 'turbines';
    if (!v) {
      const washBuf = this.take('wash'), machBuf = this.take(machName);
      if (!washBuf || !machBuf) return;
      try {
        const out = ctx.createGain(); out.gain.value = 1;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = h.fc;
        let tail = out.connect(lp);
        let pan = null;
        if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); tail = tail.connect(pan); }
        tail.connect(this.sfx);
        const loop = (buf) => {
          const src = ctx.createBufferSource();
          src.buffer = buf; src.loop = true;
          const g = ctx.createGain(); g.gain.value = 0;
          src.connect(g).connect(out);
          src.start(now + Math.random() * 0.05, Math.random() * buf.duration);
          return { src, g };
        };
        v = { wash: loop(washBuf), mach: loop(machBuf), out, lp, pan, quietSince: Infinity };
        this.shipVoices.set(s.id, v);
      } catch { return; }
    }
    v.quietSince = Infinity;
    const load = span(s.load, 0, 1, 0);
    const size = span(len / 250, 0.3, 1.2, 0.6);
    const under = sub && num(s.depth, 0) > 4;
    const wash = under ? 0 : 0.5 * size * Math.pow(load, 1.3);
    // Machinery is heard close to, being inside her: it falls away over a
    // much shorter distance than the water she is throwing about.
    const near = 40 + len * 0.3;
    const machG = near / Math.max(near, num(h.d, 0));
    const mach = 0.34 * size * (0.4 + 0.6 * load) * (under ? 0.4 : 1) * machG;
    const tc = 0.3;
    try {
      glide(v.wash.g.gain, span(wash * h.g, 0, 2, 0), now, tc);
      glide(v.mach.g.gain, span(mach, 0, 2, 0), now, tc);
      glide(v.wash.src.playbackRate, span(0.85 + 0.3 * load, 0.5, 2, 1), now, tc);
      glide(v.mach.src.playbackRate, span(0.65 + 0.6 * load, 0.3, 2, 1), now, tc);
      glide(v.lp.frequency, span(under ? Math.min(380, h.fc) : h.fc, 60, 20000, 20000), now, tc);
      if (v.pan) glide(v.pan.pan, h.pan, now, tc);
    } catch { /* next frame */ }
  }

  fadeShip(v, now) {
    if (v.quietSince === Infinity) {
      v.quietSince = now;
      try {
        for (const g of [v.wash.g.gain, v.mach.g.gain]) { g.setTargetAtTime(0, now, 0.3); g.__v = 0; g.__t = now; }
      } catch { /* gone */ }
    }
  }

  dropShip(v) {
    for (const p of [v.wash, v.mach]) {
      try { p.src.stop(); p.src.disconnect(); p.g.disconnect(); } catch { /* gone */ }
    }
    try { v.out.disconnect(); v.lp.disconnect(); v.pan && v.pan.disconnect(); } catch { /* gone */ }
  }

  // ------------------------------------------------------------ ambience ----

  /** The sea and the wind, started once the battle opens. */
  startAmbience() {
    const ctx = this.ensure(); if (!ctx || this.ambience) return;
    const bed = (name) => {
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(this.amb);
      return { g, src: null, name };
    };
    this.ambience = { sea: bed('sea'), wind: bed('wind') };
    this.startAmbienceLoops();
  }

  startAmbienceLoops() {
    const ctx = this.ctx;
    const a = this.ambience;
    if (!ctx || !a) return;
    for (const bed of [a.sea, a.wind]) {
      if (bed.src) continue;
      const buf = this.take(bed.name);
      if (!buf) continue;
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(bed.g);
        src.start(ctx.currentTime, Math.random() * buf.duration);
        bed.src = src;
      } catch { /* not heard */ }
    }
    this.updateAmbience();
  }

  /** Low over the water it is the sea; high up, the wind. */
  updateAmbience() {
    const a = this.ambience, ctx = this.ctx;
    if (!a || !ctx) return;
    const h = span(this.ear.y, 0, 5000, 30);
    const sea = 0.2 * span(1 - (h - 15) / 700, 0.12, 1, 1);
    const wind = 0.035 + 0.11 * span((h - 60) / 900, 0, 1, 0);
    try {
      glide(a.sea.g.gain, sea, ctx.currentTime, 0.6);
      glide(a.wind.g.gain, wind, ctx.currentTime, 0.6);
    } catch { /* next frame */ }
  }

  /** Kept for the callers: her machinery is heard with every other ship's now. */
  setEngineLoad() {}

  stopAmbience() {
    const a = this.ambience;
    if (a) {
      for (const bed of [a.sea, a.wind]) {
        try { if (bed.src) bed.src.stop(); bed.g.disconnect(); } catch { /* already stopped */ }
      }
    }
    this.ambience = null;
    for (const v of this.shipVoices.values()) this.dropShip(v);
    this.shipVoices.clear();
    this.creaks.clear();
  }
}

export const audio = new Audio();
