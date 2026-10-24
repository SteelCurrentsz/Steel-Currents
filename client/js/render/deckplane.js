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
  usa: { fighter: 'wildcat', dive: 'dauntless', torpedo: 'avenger' },
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
