// The atomic bomb a Silverplate B-29 carries: how big it is, and how fast what
// it does goes out across the sea.
//
// Shared because the simulation and the screen have to agree on one thing
// above all, which is where the front of the blast is at any moment: a ship
// is wrecked when the shock reaches her, and the ring of white water racing
// out across the sea is drawn where that shock is. Off the one function, the
// two cannot disagree.
//
// The figures are a sea battle's, not a city's. Over Hiroshima the fireball was
// three hundred and seventy metres across and the ring of near-total
// destruction a mile and a half; a warship is a great deal harder than a
// house, and at Bikini an airburst of the same size sank what was within half
// a mile of it and wrecked the topsides of what was within a mile. So: the
// fireball takes anything inside it, everything within NUKE.lethal is lost,
// the blast is heavy out to NUKE.heavy and is still breaking things and
// setting them alight to NUKE.reach -- and the wave thrown up off the sea
// goes out further than any of that.

export const NUKE = {
  /** The weapon, in pounds: what the yard reads out and nothing else uses. */
  pounds: 9700,
  /** Radius of the fireball, metres: inside it nothing survives. */
  fireball: 380,
  /** Everything afloat within this is lost. */
  lethal: 1300,
  /** Out to here the blast wrecks a ship's upperworks and sets her alight. */
  heavy: 3000,
  /** And out to here it still does harm. */
  reach: 5400,
  /** How far an aeroplane can be from it, in the air, and live. */
  air: 2600,
  /** The front's time constant, seconds: see nukeFront. */
  tau: 2.0,
  /**
   * On the ground the same weapon is worse: nothing of it goes into lifting
   * the sea, and the ground reflects the shock back up into the one going
   * out. Every radius of the blast is this much longer on land, and what it
   * does inside them this much heavier.
   */
  landReach: 1.35,
  landBite: 1.3,
  // The crater a burst on the ground digs: radius, depth and the height of
  // the spoil thrown up round it, in metres, for middling ground. Soft ground
  // gives a wider hole; rock a narrower one.
  craterR: 190,
  craterDepth: 34,
  craterLip: 9,
  /**
   * How long a burst on the sea is worth drawing, seconds: the column, its
   * base surge hanging over the water, and the wave running on out under it.
   * (On land the cloud has its own clock: see MUSHROOM_LIFE.)
   */
  life: 300,
  /** The surface wave: how far out it ever gets, metres. */
  waveReach: 9000,
  /** Its time constant, seconds: see nukeWave. */
  waveTau: 75,
  /** How tall it stands where it is thrown up, and how fast that falls away. */
  // Off Baker: a wave nearly thirty metres from crest to trough a thousand
  // feet from the burst, and still five or six two miles out.
  // Made bigger than that for the game: a wall of water forty-five metres
  // high at the burst, and still ten or so three miles out.
  waveHigh: 45,
  waveFall: 3600,
};

/** The most bursts the sea carries at once: the ocean shader's array is this long. */
export const MAX_BURSTS = 4;

/**
 * How far out the shock front is, `age` seconds after the burst.
 *
 * It leaves at many times the speed of sound and slows as it spreads -- a
 * spherical shock loses its strength as the square of the distance and its
 * speed with it -- and the curve that does that, close enough to the measured
 * one for anyone watching, is an exponential approach to its furthest reach.
 * Three kilometres in the first two seconds, and done in ten.
 * The water comes after it, a great deal slower: see nukeWave.
 */
export function nukeFront(age, land = false) {
  if (!(age > 0)) return 0;
  return NUKE.reach * (land ? NUKE.landReach : 1) * (1 - Math.exp(-age / NUKE.tau));
}

/**
 * The three things a burst on the sea does, in the order they happen:
 *
 *   1. the flash and the fireball, in the first thousandths of a second;
 *   2. the shock, racing out through the air and the water at many times
 *      the speed of sound -- the pressure that wrecks ships -- with the spray
 *      dome thrown up off the sea over the burst;
 *   3. the wave: the water the burst shoved aside, coming back as a ring of
 *      heavy surface waves. Big close in, and nothing like a tsunami: a
 *      tsunami is a sea floor moving, and this is a cavity in the water
 *      collapsing, so the wave is steep, short and loses its height fast.
 *
 * nukeFront is the second; this is the third. It leaves at about sixty
 * metres a second and slows, and it is still there, low, at six kilometres.
 */
export function nukeWave(age) {
  if (!(age > 0)) return 0;
  return NUKE.waveReach * (1 - Math.exp(-age / NUKE.waveTau));
}

/** How tall the wave stands when it has run out `r` metres, crest to trough. */
export function waveHeight(r) {
  return NUKE.waveHigh * Math.exp(-Math.max(0, r) / NUKE.waveFall) + 1.5;
}

/**
 * What the blast is worth at a distance, as a share of a ship's whole life:
 * past one, she is lost. Falls away from the fireball's edge to the reach,
 * steeply at first -- which is what overpressure does -- and to nothing.
 */
export function nukeBite(d, land = false) {
  if (land) return NUKE.landBite * nukeBite(d / NUKE.landReach);
  if (d <= NUKE.fireball) return 2.5;
  if (d <= NUKE.lethal) return 1.6;
  if (d >= NUKE.reach) return 0;
  if (d <= NUKE.heavy) {
    const k = (d - NUKE.lethal) / (NUKE.heavy - NUKE.lethal);
    return 1.0 - 0.7 * k;
  }
  const k = (d - NUKE.heavy) / (NUKE.reach - NUKE.heavy);
  return 0.3 * (1 - k) * (1 - k);
}

// ------------------------------------------------------------ the sea itself

/**
 * The wave as water: how high the sea stands, `r` metres from a burst `age`
 * seconds old, and how fast that changes outward (dh/dr). Zero away from it.
 *
 * Not a ring painted on the sea but the sea: the ocean's vertex shader lifts
 * the surface by exactly this (see BURST_GLSL in ocean.js), and the same
 * function is what a hull is floated on, on the screen (seaAttitude) and in
 * the simulation (seaOver) -- so a ship is seen to climb the face of it, hang
 * on the crest and drop into the trough behind it, and the water that comes
 * over her deck edge is the water drawn there.
 *
 * A short train rather than one hump: a steep leading crest standing taller
 * than the troughs are deep, the way a breaking wave does, and two or three
 * smaller ones behind it, lengthening as the train runs out.
 */
export function burstSwell(age, r, out) {
  out.y = 0; out.dr = 0;
  if (!(age > 0)) return out;
  const R = nukeWave(age);
  const lam = 160 + 0.06 * R;
  const s = r - R;
  // Nothing more than four of its lengths behind the front or one ahead.
  if (s > lam * 1.2 || s < -lam * 4.2) return out;
  const grow = Math.min(1, age / 5);
  const fade = Math.min(1, Math.max(0, (NUKE.life - age) / 60));
  const A = 0.5 * waveHeight(R) * grow * grow * (3 - 2 * grow) * fade;
  if (!(A > 0)) return out;
  const k = (Math.PI * 2) / lam;
  const sig = s > 0 ? 0.3 * lam : 1.25 * lam;
  const env = Math.exp(-(s * s) / (sig * sig));
  const c = Math.cos(k * s), c2 = Math.cos(2 * k * s);
  const y = A * (c + 0.3 * c2) * env;
  out.y = y;
  out.dr = A * env * (-k * Math.sin(k * s) - 0.6 * k * Math.sin(2 * k * s)) + y * (-2 * s / (sig * sig));
  return out;
}

const SW = { y: 0, dr: 0 };
/**
 * Every burst's wave at a point: `bursts` is [{ x, z, t0 }], `time` the
 * clock they were set off on. Adds into `out.y` and the slope `out.gx`,
 * `out.gz`.
 */
export function burstSea(bursts, x, z, time, out) {
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i];
    const dx = x - b.x, dz = z - b.z;
    const r = Math.sqrt(dx * dx + dz * dz);
    burstSwell(time - b.t0, r, SW);
    if (SW.y === 0 && SW.dr === 0) continue;
    out.y += SW.y;
    if (r > 1e-3) { out.gx += SW.dr * dx / r; out.gz += SW.dr * dz / r; }
  }
  return out;
}
