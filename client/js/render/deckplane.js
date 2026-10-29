// The aeroplane a carrier draws going down her deck: one of each of the three
// types she flies, the clock the evolution is played to, and her airscrew.
//
// Both carriers launch the same way and both used to do it with one type: the
// Enterprise sent every strike off as an Avenger -- so the fighters you had
// ordered up went down the deck as a sixteen-metre torpedo bomber and came out
// of the hand-over as a Wildcat -- and the Shinano ran a curve drawn by hand
// that had nothing to do with how any aeroplane accelerates.
import * as THREE from '../../../vendor/three.module.js';
import { AERO, launchProfile } from './aero.js';

/** Which job is which kind, on each side of the Pacific -- and on the one German carrier. */
export const DECK_KINDS = {
  usa: { fighter: 'hellcat', dive: 'dauntless', torpedo: 'avenger' },
  ijn: { fighter: 'zero', dive: 'suisei', torpedo: 'b5n' },
  ger: { fighter: 'bf109', dive: 'ju87c', torpedo: 'ju87d' },
};

/**
 * Put a turning airscrew's disc on a deck model's hub, and give her blades a
 * material of their own so they can fade into it.
 *
 * Past a few hundred revolutions a minute a propeller is not blades going
 * round: it is a disc, faintly visible, with the blades a blur in it. Drawn as
 * blades turning at the true rate every frame they alias -- a three-blade
 * airscrew turning a little faster than a sixth of a revolution a frame looks
 * as if it is slowing down, and then as if it is going backwards -- which is
 * exactly what the airscrew of an aeroplane running up for take-off did. So
 * the blades are drawn turning while they can be seen to turn, and the disc
 * takes over as she winds up.
 *
 * Returns a function of her airscrew's rate in radians a second.
 */
export function propBlur(hub) {
  if (!hub) return () => {};
  hub.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(hub.matrixWorld).invert();
  const v = new THREE.Vector3();
  let rad = 0;
  const mats = [];
  hub.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      rad = Math.max(rad, Math.hypot(v.x, v.y));
    }
    // Her own blades, not every airscrew of the type.
    const list = [].concat(o.material).map((q) => {
      const c = q.clone();
      c.transparent = true;
      mats.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? list : list[0];
  });
  if (rad < 0.2) return () => {};
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(rad * 0.3, rad * 0.99, 32, 1),
    new THREE.MeshBasicMaterial({
      color: 0x6f7a86, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  disc.position.z = 0.05;
  disc.userData.blur = true;
  hub.add(disc);
  const smooth = (a, b, x) => {
    const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return (rate) => {
    // How far she has wound up: blades plain at idle, a disc at full power.
    const k = smooth(22, 70, rate);
    for (const m of mats) m.opacity = 1 - 0.82 * k;
    disc.material.opacity = 0.03 + 0.16 * k;
  };
}

/**
 * How fast the airscrew should look to turn, as the engine winds her up.
 *
 * Her engine's own rate (deckengine.js) plus the bite the airscrew takes as
 * the air comes faster at it: a constant-speed airscrew on the brakes is not
 * yet at the revolutions it will be at with eighty knots of air through it.
 */
export function propRate(engineRate, speed, vr) {
  return engineRate + 46 * Math.max(0, Math.min(1.2, speed / Math.max(1, vr)));
}

/**
 * The launch evolution's clock.
 *
 * The run itself is flown, so it is played at the speed it was integrated
 * at: an aeroplane accelerating down a deck in slow motion is not one. The
 * handling before it -- the lift, the taxi, the run-up -- is a deck crew's job
 * and is played at whatever pace makes her wheels leave the deck on the
 * simulation's clock. `raw` is how long the handling takes in the evolution's
 * own seconds; `dur` is how long the simulation gives the whole of it.
 *
 * Returns `{ handling, flown, pace, at(el) }`: `at` turns seconds since the
 * flag into the evolution's own time, handling first and the run after.
 */
export function deckClock(raw, flown, dur) {
  // Never quicker than this: a lift does not come up the well in a second.
  const handling = Math.max(raw * 0.45, dur - flown);
  const pace = raw / handling;
  return {
    handling, flown, pace,
    at: (el) => (el < handling ? el * pace : raw + (el - handling)),
  };
}

/** One integrated launch per kind of aeroplane a deck flies, for a deck this long. */
export function deckProfiles(kinds, deckAhead) {
  const out = {};
  for (const [role, kind] of Object.entries(kinds)) {
    out[role] = launchProfile(AERO[kind] || AERO.avenger, deckAhead);
  }
  return out;
}

/** Her speed over the deck at a row of the profile. */
export function rowSpeed(pr, i) {
  const r = pr.rows[Math.max(0, Math.min(pr.rows.length - 1, i))];
  return r[4] ?? 0;
}

/** How fast she is going over the deck as her hook takes a wire, in metres a second. */
const TRAP_SPEED = 38;
/** The most deck a wire pays out before it has her stopped. */
const TRAP_RUN = 32;
/** How fast she is taxied up the deck to the lift once the wire has let her go. */
const TAXI_SPEED = 12;
/** On the lift, wings going back, before it takes her down. */
const ON_LIFT = 0.4;
/** And the lift down the well into the hangar. */
export const LAND_SINK = 3.4;

/**
 * Where an aeroplane just landed is on her deck, `k` seconds after her wheels
 * went on at `landZ`, on her way to the lift at `liftZ`.
 *
 * She does not roll up the deck at a stroll. She arrives at the round-down at
 * something like seventy knots over the deck, her hook takes a wire, and the
 * wire has her stopped in thirty metres and a second and a half -- which is
 * the whole point of an arrester. Then the wire is cleared, she is taxied
 * forward onto the after lift with her wings going back as she goes, and the
 * lift takes her down.
 *
 * Returns `{ z, lift, wings, turning, done }`: how far down the well the lift
 * is, nought at the flight deck and one at the hangar; how far her wings are
 * spread; how fast her airscrew is going round; and whether she is below.
 */
export function recoveryAt(k, landZ, liftZ) {
  const room = Math.max(4, liftZ - landZ);
  const run = Math.min(TRAP_RUN, room * 0.8);
  const stop = (2 * run) / TRAP_SPEED;
  const taxi = Math.max(1, (room - run) / TAXI_SPEED);
  const fold = (u) => 1 - Math.max(0, Math.min(1, u));
  if (k < stop) {
    // On the wire: the speed coming off her evenly, which is what the
    // arresting engine is built to do.
    const u = k / stop;
    return { z: landZ + run * (1 - (1 - u) * (1 - u)), lift: 0, wings: 1, turning: 30 * (1 - u) + 8, done: false };
  }
  if (k < stop + taxi) {
    const u = (k - stop) / taxi;
    const e = u * u * (3 - 2 * u);
    return { z: landZ + run + (room - run) * e, lift: 0, wings: fold(u / 0.8), turning: 8, done: false };
  }
  if (k < stop + taxi + ON_LIFT) return { z: liftZ, lift: 0, wings: 0, turning: 4, done: false };
  const t = k - stop - taxi - ON_LIFT;
  if (t < LAND_SINK) {
    const u = t / LAND_SINK;
    return { z: liftZ, lift: u * u * (3 - 2 * u), wings: 0, turning: 0, done: false };
  }
  return { z: liftZ, lift: 1, wings: 0, turning: 0, done: true };
}
