// Whole pieces of a ship, thrown.
//
// wreckage.js throws what a burst tears off her as one batch of anonymous
// triangles, which is right for a locker or a boat. A turret is not that. A
// mounting lifted off its roller path by the magazine under it goes up as a
// turret -- gunhouse, barrels and all, in its own paint and its own shape --
// turns over at the top of its climb and comes down into the sea as one, with
// a splash the size of the thing that made it. The same for a gun Monster One
// has torn off a deck in her jaws and flung, and for the slabs of plating her
// claws rip out of a hull.
//
// So the piece itself is moved: the mounting's own object is taken off the
// ship and put into the world, about its own middle, and given gravity. When
// it reaches the sea it stops, settles and goes down out of sight, and only
// then is it let go of.

import * as THREE from '../../../vendor/three.module.js';

const G = 9.81;
const TMPQ = new THREE.Quaternion();
const BOX = new THREE.Box3();
const C = new THREE.Vector3();

export class Tossed {
  constructor() {
    this.live = [];
  }

  /**
   * Throw `obj` -- anything already in the scene, wherever it hangs -- into
   * `world`. It is re-hung about its own middle so it tumbles about that, not
   * about the foot of its barbette.
   *
   * `v` is { vx, vy, vz } in the world, `spin` radians a second, `sink` how
   * fast it goes down once it is in the water. Returns how big it is.
   */
  add(obj, world, { vx = 0, vy = 0, vz = 0, spin = 1, axis = null, sink = 3, own = false } = {}) {
    obj.updateWorldMatrix(true, true);
    BOX.setFromObject(obj);
    if (BOX.isEmpty()) obj.getWorldPosition(C); else BOX.getCenter(C);
    const size = BOX.isEmpty() ? 2 : Math.max(0.5, BOX.getSize(new THREE.Vector3()).length() / 2);
    const pivot = new THREE.Object3D();
    pivot.position.copy(C);
    world.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(obj);
    this.live.push({
      obj: pivot, inner: obj, own,
      vx, vy, vz,
      axis: (axis || new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)).normalize(),
      spin,
      sink,
      size,
      wet: false,
      // The lowest it can come before its underside is in the water.
      foot: Math.max(0.3, (C.y - BOX.min.y) * 0.6),
    });
    return size;
  }

  /**
   * Once a frame. `seaAt(x, z)` is the height of the sea there, if it is
   * known. Returns the splashes made this frame: { x, z, size, hull, fall }.
   */
  step(dt, seaAt = null) {
    if (!this.live.length) return null;
    const out = [];
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      const o = f.obj;
      if (!f.wet) {
        f.vy -= G * dt;
        const drag = Math.exp(-dt * 0.06);
        f.vx *= drag; f.vz *= drag;
      } else {
        // In the water: stopped, and going down.
        const k = Math.exp(-dt * 2.2);
        f.vx *= k; f.vz *= k;
        f.vy = f.vy * k - f.sink * (1 - k);
        f.spin *= Math.exp(-dt * 1.5);
      }
      o.position.x += f.vx * dt;
      o.position.y += f.vy * dt;
      o.position.z += f.vz * dt;
      o.quaternion.premultiply(TMPQ.setFromAxisAngle(f.axis, f.spin * dt));
      const sea = seaAt ? seaAt(o.position.x, o.position.z) || 0 : 0;
      if (!f.wet && f.vy < 0 && o.position.y - f.foot < sea) {
        f.wet = true;
        out.push({ x: o.position.x, z: o.position.z, size: f.size * 2, hull: f.size > 3.5, fall: -f.vy });
      }
      o.updateMatrixWorld(true);
      if (f.wet && o.position.y < sea - 25 - f.size * 2) {
        this.drop(f);
        this.live.splice(i, 1);
      }
    }
    return out.length ? out : null;
  }

  drop(f) {
    if (f.obj.parent) f.obj.parent.remove(f.obj);
    // Only what was made for the throw is given back: a mounting's shapes are
    // her class's, shared with every other ship of it.
    if (f.own) {
      f.obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !Array.isArray(o.material)) o.material.dispose();
      });
    }
  }

  dispose() {
    for (const f of this.live) this.drop(f);
    this.live.length = 0;
  }
}

/**
 * A slab of her side, torn out: a bent, ragged plate with frames behind it,
 * `w` by `h` metres, in her own paint. `rnd` makes the shape.
 */
export function plateSlab(w, h, color, rnd) {
  const g = new THREE.BoxGeometry(w, h, Math.max(0.25, Math.min(w, h) * 0.06), 6, 4, 1);
  const A = g.attributes.position.array;
  // Bent across, dished in, and its edges torn.
  const bend = (rnd() - 0.5) * 0.5;
  const dish = 0.15 + rnd() * 0.35;
  const f0 = rnd() * 6, f1 = rnd() * 6;
  for (let i = 0; i < A.length; i += 3) {
    const x = A[i] / (w / 2), y = A[i + 1] / (h / 2);
    A[i + 2] += bend * x * x * w * 0.4 - dish * (1 - x * x) * (1 - y * y) * Math.min(w, h) * 0.3;
    const edge = Math.max(Math.abs(x), Math.abs(y));
    if (edge > 0.7) {
      A[i] *= 0.8 + 0.35 * Math.abs(Math.sin(y * 7 + f0));
      A[i + 1] *= 0.8 + 0.35 * Math.abs(Math.sin(x * 9 + f1));
    }
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.25, flatShading: true, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, mat);
}
