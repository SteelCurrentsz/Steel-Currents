// Starting an aero engine on a flight deck.
//
// A radial is not switched on. The starter -- an inertia starter wound up by
// hand, or a cartridge -- throws the airscrew round, and for a few turns
// nothing happens but the blades going over slowly against compression and a
// cylinder firing on its own now and then: a cough, a jerk of the blades, a
// puff of oily smoke out of the stacks. Then enough of them fire together and
// she catches with a bang and a gout of black smoke, the airscrew goes from
// something you can count to a disc, and she settles to a fast idle while the
// smoke blows away aft.
//
// One clock in, one airscrew rate out, and the smoke and the noise on the way:
// the carriers call this through the whole of a launch and turn their
// airscrew by what it says.
import * as THREE from '../../../vendor/three.module.js';
import { audio } from '../audio.js';

/** How long the starter turns her over before she catches, in seconds. */
export const CRANK = 2.6;

/**
 * Advance one engine start.
 *
 * `e` is the engine's own state (start with `{}`); `on` is whether she should
 * be running; `t` is seconds since the start was begun; `power` is the
 * throttle once she is running, 0 idle to 1 full. Returns how fast her
 * airscrew is turning, in radians a second. `plane` and `exhaust` place the
 * smoke: her group, and her stacks in its frame.
 */
export function engineStart(e, on, t, power, dt, fx, plane, exhaust) {
  if (!on) {
    // Shut down: she runs down to a stop in a couple of seconds.
    e.rate = Math.max(0, (e.rate || 0) - dt * 18);
    e.caught = false;
    e.cough = 0;
    return e.rate;
  }
  let want;
  if (t < CRANK) {
    // On the starter: slow, and in jerks -- each cylinder that fires kicks the
    // blades on, and the compression of the next one nearly stops them.
    const base = 2.2 + t * 0.9;
    want = base * (0.55 + 0.45 * Math.abs(Math.sin(t * 7.3)));
    e.cough = (e.cough || 0) - dt;
    if (e.cough <= 0) {
      e.cough = 0.35 + Math.random() * 0.4;
      want += 6;
      e.rate = (e.rate || 0) + 5;
      puff(fx, plane, exhaust, 0.6, 0x55524c);
      cough(plane, false);
    }
  } else {
    if (!e.caught) {
      // She catches.
      e.caught = true;
      for (let i = 0; i < 4; i++) puff(fx, plane, exhaust, 1.3, 0x2a2826);
      cough(plane, true);
      e.rate = Math.max(e.rate || 0, 14);
    }
    // A fast idle, and the throttle on top of it.
    want = 24 + 40 * Math.max(0, Math.min(1, power));
    // And a thin smoke out of the stacks while she is cold.
    e.smoke = (e.smoke || 0) - dt;
    if (e.smoke <= 0 && t < CRANK + 4) {
      e.smoke = 0.18;
      puff(fx, plane, exhaust, 0.35, 0x77736b);
    }
  }
  const k = 1 - Math.exp(-dt * (t < CRANK ? 6 : 2.2));
  e.rate = (e.rate || 0) + (want - (e.rate || 0)) * k;
  return e.rate;
}

/** A cough, where she is -- when there is anybody to hear it. */
function cough(plane, caught) {
  if (typeof window === 'undefined') return;
  audio.cough(where(plane), caught);
}

const V = new THREE.Vector3();
function where(plane) {
  if (!plane) return null;
  plane.updateMatrixWorld();
  V.setFromMatrixPosition(plane.matrixWorld);
  return { x: V.x, y: V.y, z: V.z };
}

function puff(fx, plane, exhaust, size, color) {
  if (!fx || !plane || !exhaust) return;
  plane.updateMatrixWorld();
  for (const at of exhaust) {
    V.fromArray(at).applyMatrix4(plane.matrixWorld);
    fx.spawn({
      x: V.x, y: V.y, z: V.z,
      vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.5,
      size: 0.5 * size, grow: 2.4 * size, ttl: 1.6 + Math.random() * 1.2,
      color, opacity: 0.55, drag: 0.5, lift: 0.8, billow: true,
    });
  }
}
