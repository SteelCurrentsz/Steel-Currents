// The sea and the wind, as both ends have to know them.
//
// The waves used to be the renderer's alone: the simulation never asked how
// high the water stood anywhere, because in any sea a battle was fought in it
// never stood higher than a gun. A typhoon is a sea that does. Green water
// coming over a forecastle puts the forward turret under for as long as it is
// there, and that is a fact about the battle and not a picture of it -- so the
// server has to be able to work out the same sea the screen is drawing, at the
// same moment, off nothing but the world and its own clock.
//
// So the wave train lives here, and the ocean shader is fed from it (see
// render/ocean.js). The client runs its sea on the server's clock, which is
// what makes the two the same water.

import { getWeather } from './world.js';

const G = 9.81;

// The wave train. Wavelength in metres, amplitude as a fraction of the sea
// state's, steepness, and heading. Eight of them, all running roughly
// downwind, on lengths that share no common measure so the crests never line
// up the same way twice. See render/ocean.js for why it is this shape.
export const WAVES = [
  { len: 452, amp: 0.81, steep: 0.55, dir: [0.860, 0.510] },
  { len: 311, amp: 0.57, steep: 0.60, dir: [0.592, 0.806] },
  { len: 227, amp: 0.44, steep: 0.64, dir: [1.000, -0.006] },
  { len: 163, amp: 0.31, steep: 0.68, dir: [0.735, 0.678] },
  { len: 118, amp: 0.23, steep: 0.72, dir: [0.960, -0.281] },
  { len: 86, amp: 0.17, steep: 0.74, dir: [0.364, 0.931] },
  { len: 61, amp: 0.115, steep: 0.78, dir: [0.972, 0.236] },
  { len: 44, amp: 0.083, steep: 0.80, dir: [-0.029, 1.000] },
];

/** The scale that turns a weather preset into metres of wave. */
export const AMP_SCALE = 0.42;

/** How big the hour's sea runs, before the sea state is put on it. */
export const SEA_AMP = { night: 2.9, dawn: 2.6, dusk: 3.2, day: 2.4 };

/**
 * How much of each wave a sea state and a weather put on the water.
 *
 * `amp` is the overall height, as it always was. `short` is what a storm adds
 * to the short, steep end of the train on top of that: a typhoon is not the
 * same sea scaled up -- scaled up, the long swell carries a ship up and down
 * with it and nothing ever comes aboard her. What comes aboard is the short
 * breaking sea riding on the swell, at a length about her own, and that is
 * the part of it a typhoon builds most.
 */
// The short sea runs from about two hundred and sixty metres down: a wave
// longer than that a ship rises to, and one shorter breaks against her.
const SHORT_TOP = 260;
const SHORT_SPAN = 150;
export function waveScales(short = 0) {
  return WAVES.map((w) => 1 + short * Math.min(1, Math.max(0, (SHORT_TOP - w.len) / SHORT_SPAN)));
}

/** The sea a world was set up with: height, steepness and the short sea. */
export function seaOf(world, hour = null) {
  const wx = getWeather(world?.weather);
  const base = SEA_AMP[hour || world?.time] ?? SEA_AMP.night;
  const state = world?.sea ?? 2;
  return {
    amp: base * (0.4 + state * 0.28) * AMP_SCALE * (wx.swell || 1),
    steep: wx.steep || 1,
    short: wx.short || 0,
  };
}

/**
 * Each wave as the shader has it: heading, wavenumber, frequency, height and
 * steepness, worked out once for the sea rather than on every sample.
 */
export function waveTerms(amp, steep = 1, short = 0) {
  const n = WAVES.length;
  const scale = waveScales(short);
  const t = {
    amp, steep, short, n,
    dirx: new Float64Array(n), dirz: new Float64Array(n), k: new Float64Array(n),
    a: new Float64Array(n), om: new Float64Array(n), q: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const w = WAVES[i];
    const len = Math.hypot(w.dir[0], w.dir[1]);
    t.dirx[i] = w.dir[0] / len;
    t.dirz[i] = w.dir[1] / len;
    const k = (Math.PI * 2) / w.len;
    const a = w.amp * scale[i] * amp;
    t.k[i] = k;
    t.a[i] = a;
    t.om[i] = Math.sqrt(G * k);
    // The same as the shader has it. The sideways throw of a Gerstner wave
    // comes out the same whatever its height, so a storm's short sea stands
    // up taller without folding over itself into loops.
    t.q[i] = (w.steep * steep) / Math.max(k * a * n, 1e-4);
  }
  return t;
}

/**
 * Where the surface is at a world point, and which way it is tilted.
 *
 * This mirrors `gerstner()` in the ocean's vertex shader, so a hull rides the
 * water the screen is drawing. Gerstner waves move the surface sideways as
 * well as up, so the sample point is walked back to the parameter that lands
 * on the point asked about.
 */
export function seaSample(W, x, z, time, tilt = true) {
  const n = W.n;
  const DX = W.dirx, DZ = W.dirz, K = W.k, A = W.a, OM = W.om, Q = W.q;
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    let dx = 0;
    let dz = 0;
    for (let i = 0; i < n; i++) {
      const ph = K[i] * (DX[i] * px + DZ[i] * pz) - OM[i] * time;
      const c = Math.cos(ph);
      dx += Q[i] * A[i] * DX[i] * c;
      dz += Q[i] * A[i] * DZ[i] * c;
    }
    px = x - dx;
    pz = z - dz;
  }
  let dx = 0, dy = 0, dz = 0;
  let ddxx = 1, ddxy = 0, ddxz = 0, ddzx = 0, ddzy = 0, ddzz = 1;
  for (let i = 0; i < n; i++) {
    const dirx = DX[i], dirz = DZ[i], k = K[i], a = A[i], q = Q[i];
    const ph = k * (dirx * px + dirz * pz) - OM[i] * time;
    const c = Math.cos(ph);
    const s = Math.sin(ph);
    dx += q * a * dirx * c;
    dy += a * s;
    dz += q * a * dirz * c;
    if (!tilt) continue;
    const wa = k * a;
    ddxx += -q * wa * dirx * dirx * s;
    ddxy += wa * dirx * c;
    ddxz += -q * wa * dirx * dirz * s;
    ddzx += -q * wa * dirx * dirz * s;
    ddzy += wa * dirz * c;
    ddzz += -q * wa * dirz * dirz * s;
  }
  px = x - dx;
  pz = z - dz;
  if (!tilt) return { y: dy, px, pz, nx: 0, ny: 1, nz: 0 };
  const nx = ddzy * ddxz - ddzz * ddxy;
  const ny = ddzz * ddxx - ddzx * ddxz;
  const nz = ddzx * ddxy - ddzy * ddxx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return { y: dy, px, pz, nx: nx / l, ny: ny / l, nz: nz / l };
}

/** Just the height of it. */
export function seaHeight(W, x, z, time) {
  return seaSample(W, x, z, time, false).y;
}

/**
 * The attitude a hull of this length and beam takes on the sea here: the mean
 * level under her whole waterplane, and the slope between her halves. See
 * Ocean.attitude, which is this.
 */
export function seaAttitude(W, x, z, heading, length, beam, time, STA = 7) {
  const sh = Math.sin(heading);
  const ch = Math.cos(heading);
  const hl = length * 0.46;
  const hb = Math.max(beam * 0.5, 4);
  let sum = 0, n = 0, fwdSum = 0, aftSum = 0, fwdN = 0, aftN = 0;
  let portSum = 0, stbdSum = 0, armF = 0, armS = 0;
  // The sea along her, station by station, for what her weight does where it
  // has left her: see seaSupport.
  const along = new Float64Array(STA);
  for (let i = 0; i < STA; i++) {
    const u = STA === 1 ? 0 : (i / (STA - 1)) * 2 - 1;
    const fwd = u * hl;
    for (const side of [-hb * 0.7, 0, hb * 0.7]) {
      const h = seaHeight(W, x + sh * fwd + ch * side, z + ch * fwd - sh * side, time);
      along[i] += h / 3;
      sum += h; n++;
      if (u > 0.1) { fwdSum += h; fwdN++; armF += fwd; } else if (u < -0.1) { aftSum += h; aftN++; }
      if (side < 0) { portSum += h; armS += -side; } else if (side > 0) stbdSum += h;
    }
  }
  const armFwd = fwdN ? armF / fwdN : hl;
  const trim = fwdN && aftN ? (fwdSum / fwdN) - (aftSum / aftN) : 0;
  const list = (stbdSum - portSum) / STA;
  const armSide = armS / STA;
  return {
    heave: sum / n,
    // In the renderer's sense, which is the hull's rotation about her own x:
    // positive puts her bow down. So water standing higher under her bow
    // than under her stern is a negative pitch -- her bow lifted to it.
    pitch: Math.atan2(-trim, armFwd * 2),
    roll: Math.atan2(list, armSide * 2),
    along,
    arm: hl,
  };
}

/** How hard the sea holds up an end of her that has come clear of it. */
export const SUPPORT = { gain: 12.0, forefoot: 0.75 };

/**
 * What her own weight does to the part of her the sea has left.
 *
 * Her pitch and heave are springs pushed towards a share of the sea's slope
 * and level (see seakeeping.js), and a share is all a long hull should take of
 * a sea shorter than she is. But a share of a slope is not a slope: in a big
 * enough trough it held her bow up in the air over the water with nothing
 * under it, for seconds at a time. Nothing holds steel up but water. So the
 * sea is read along her, station by station, and wherever her keel stands
 * clear of it, that length of her is weight with no buoyancy under it, and
 * falls: it puts her down by the head (or the stern) and down altogether,
 * as hard as the water would have held her up had it been there.
 *
 * Her keel there is her draft, cut up towards her stem and her counter the way
 * a forefoot is, so a bow lifted over a trough falls before the whole of her
 * draft is out. Returns accelerations in units of her own spring's stiffness:
 * `heave` in metres, `pitch` in radians, positive putting her bow down.
 */
export function seaSupport(att, heave, pitch, draft, out = { heave: 0, pitch: 0 }) {
  out.heave = 0;
  out.pitch = 0;
  const along = att?.along;
  const n = along ? along.length : 0;
  if (n < 2) return out;
  const sp = Math.sin(pitch);
  let sb = 0, sbz = 0, dh = 0, dp = 0;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    const z = u * att.arm;
    // Fuller amidships than at her ends.
    const b = 1 - 0.55 * u * u;
    const a = Math.abs(u);
    const t = Math.min(1, Math.max(0, (a - 0.55) / 0.45));
    const keel = draft * (1 - SUPPORT.forefoot * t * t * (3 - 2 * t));
    // How far the bottom of her there stands above the water.
    const dry = Math.max(0, (heave - z * sp - keel) - along[i]);
    sb += b;
    sbz += b * z * z;
    dh -= b * dry;
    dp += b * z * dry;
  }
  out.heave = SUPPORT.gain * dh / sb;
  out.pitch = sbz > 0 ? SUPPORT.gain * dp / sbz : 0;
  return out;
}

/**
 * How much of the sea a hull rides up, in a weather: all of it in any sea
 * short of a storm, and in a typhoon a share -- of her heave, and rather more
 * of her pitch and roll, so she still works in the seaway while the crests go
 * over her instead of carrying her. Both ends use this, so the guns the server
 * puts under are the guns the screen shows under.
 */
export function rideOf(world) {
  const r = getWeather(world?.weather).ride ?? 1;
  return { heave: r, tilt: 0.5 + 0.5 * r };
}

/**
 * How a hull answers the sea, as both ends integrate it (see seakeeping.js and
 * stepSeaway in sim.js, which have to agree).
 *
 * She is heavy. A few thousand tons does not lift the moment a crest arrives
 * under her and stop the moment it has passed: she comes up late, carries on a
 * little past the level of the water, and is still settling when the next sea
 * arrives -- so her bow goes down into the face of it and the sea comes back
 * up her flare in a sheet, instead of her floating over the top like a cork.
 * Heave and pitch are therefore slower than her own hull would make them on a
 * spring alone, and damped short of critical so the weight shows as momentum.
 */
export const SEAWAY = {
  rollZeta: 0.13,
  pitchZeta: 0.62,
  heaveZeta: 0.55,
  // Her natural heave and pitch periods, as multiples of pitchPeriod().
  heaveSlow: 1.25 * 1.35,
  pitchSlow: 1.18,
};

/** How much of the sea's slope reaches her athwartships. See seakeeping.js. */
export function rollHeed(length) {
  return Math.min(1, Math.max(0.16, Math.pow(47 / length, 0.915)));
}

/** And fore and aft, which is much less. */
export function pitchHeed(length) {
  return Math.min(1, Math.max(0.06, Math.pow(63 / length, 1.78)));
}

/**
 * The wind, at a moment.
 *
 * It blows the way the sea is running, and it does not blow evenly: a gale
 * comes in gusts, and veers a few degrees either way as each one goes
 * through. Worked out off the clock rather than stepped, so the server and
 * every client have the same gust at the same moment without being told.
 * `speed` is in metres a second; `blow` is how much of it the simulation acts
 * on -- nothing short of a typhoon is wind enough to move a shell or an
 * aeroplane far enough to matter.
 */
export function windAt(world, t) {
  const wx = getWeather(world?.weather);
  const mean = wx.wind ?? 6;
  const gust = 1 + 0.22 * Math.sin(t * 0.31 + 1.3) + 0.14 * Math.sin(t * 0.83 + 0.4)
    + 0.08 * Math.sin(t * 2.1 + 2.2);
  const veer = 0.12 * Math.sin(t * 0.17 + 0.6) + 0.05 * Math.sin(t * 0.57);
  const [dx0, dz0] = WAVES[0].dir;
  const c = Math.cos(veer), s = Math.sin(veer);
  const dx = dx0 * c - dz0 * s;
  const dz = dx0 * s + dz0 * c;
  const speed = mean * gust;
  return { x: dx * speed, z: dz * speed, speed, mean, gust, blow: wx.blow || 0 };
}
