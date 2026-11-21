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
const V = new THREE.Vector3();
const AX = new THREE.Vector3();

/**
 * What the water does to something heavy going into it, and down through it.
 *
 * It is not stopped at the surface -- a turret does not land on the sea like a
 * table on a floor. It goes in at the speed it was falling, the water taking
 * its way off it over the next second or so, its tumble dying away as it does,
 * and then it goes on down at the pace a lump of steel sinks: a few metres a
 * second, faster the more of it there is. Nothing hangs at the waterline, and
 * nothing hangs above it.
 */
export function inWater(f, dt, sinkRate) {
  const k = Math.exp(-dt * 1.6);
  f.vx *= k; f.vz *= k;
  // Toward its sinking pace, from however fast it went in.
  const want = -sinkRate;
  f.vy += (want - f.vy) * (1 - Math.exp(-dt * 1.3));
  if (f.vy > -0.6) f.vy = -0.6;
  f.spin *= Math.exp(-dt * 2.2);
}

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
      obj: pivot, inner: obj, own, state: 'air',
      vx, vy, vz,
      axis: (axis || new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)).normalize(),
      spin,
      sink,
      size,
      wet: false,
      // How far below its middle its lowest point is: it is in the water when
      // that is, and splashes then -- not when its middle is.
      foot: Math.max(0.3, C.y - BOX.min.y),
    });
    return size;
  }

  /**
   * Slide `obj` -- a mounting standing on her deck -- off her: it stays on
   * `ship` (her group, so it rides her roll and her way), shifted off its
   * roller path by whatever lifted it, and goes across the deck to the low
   * side, or the side it was pushed to, scraping as it goes; tips over the
   * deck edge, and drops off her into the sea. Not thrown into the air: the
   * thing a heavy mounting does when what was holding it down is gone and
   * there is not the force under it to lift it clear.
   *
   * `side` is +1 or -1, her own x it goes toward; `push` the way it is given
   * at the start, metres a second; `edge` how far out from her centreline the
   * deck ends there.
   */
  addSlide(obj, ship, world, { side = 1, push = 1.5, edge = 10, spin = 0.8, sink = 3, own = false, yaw = 0, vel = null } = {}) {
    obj.updateWorldMatrix(true, true);
    BOX.setFromObject(obj);
    const size = BOX.isEmpty() ? 2 : Math.max(0.5, BOX.getSize(new THREE.Vector3()).length() / 2);
    // About its own foot, on her deck: it pivots over the deck edge on that.
    const pivot = new THREE.Object3D();
    obj.getWorldPosition(C);
    if (!BOX.isEmpty()) { C.x = (BOX.min.x + BOX.max.x) / 2; C.z = (BOX.min.z + BOX.max.z) / 2; C.y = BOX.min.y; }
    pivot.position.copy(ship.worldToLocal(C.clone()));
    ship.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(obj);
    const half = BOX.isEmpty() ? 2 : Math.max(0.6, Math.max(BOX.max.x - BOX.min.x, BOX.max.z - BOX.min.z) / 2);
    this.live.push({
      obj: pivot, inner: obj, own, state: 'slide', ship, world,
      side: side >= 0 ? 1 : -1, u: push, along: (Math.random() - 0.5) * 0.4,
      edge: Math.max(edge, Math.abs(pivot.position.x) + 0.5), half,
      tip: 0, tipRate: 0, yaw, vel,
      spin, sink, size, wet: false,
      vx: 0, vy: 0, vz: 0, axis: new THREE.Vector3(0, 0, 1),
      foot: 0.3,
    });
    return size;
  }

  /**
   * Put `obj` -- a gun torn off a deck, or a piece of plating bitten out of a
   * hull -- into Monster One's jaws: drawn up into them, held and gnawed
   * while her head works at it, and thrown away with a toss of her head (see
   * the rig's `mouthFull`). Then it falls like anything else.
   *
   * `rig` is her MonsterRig: where her mouth is, and how long the mouthful
   * has to go.
   */
  addMouth(obj, world, rig, { sink = 3, own = false, seed = 0 } = {}) {
    const size = this.add(obj, world, { sink, own, spin: 0 });
    const f = this.live[this.live.length - 1];
    f.state = 'mouth';
    f.rig = rig;
    f.mt = 0;
    f.from = f.obj.position.clone();
    f.q0 = f.obj.quaternion.clone();
    f.last = null;
    if (!rig.mouthSide) rig.mouthSide = (seed % 2) ? 1 : -1;
    f.side = rig.mouthSide;
    // Its middle a little below and ahead of the point between her jaws: a
    // big piece is held by its edge, not swallowed.
    f.hang = Math.min(6, size * 0.45);
    return size;
  }

  /** A piece in her jaws. True while she still has it. */
  mouth(f, dt) {
    const o = f.obj;
    const rig = f.rig;
    if (!rig || !rig.group || !rig.group.parent || !rig.group.visible) { f.state = 'air'; return false; }
    f.mt += dt;
    const at = rig.mouthPoint(V);
    at.y -= f.hang;
    // Pulled up into her jaws over the first moments, from where it was torn.
    const u = Math.min(1, f.mt / 0.35);
    const e = u * u * (3 - 2 * u);
    const tx = f.from.x + (at.x - f.from.x) * e;
    const ty = f.from.y + (at.y - f.from.y) * e;
    const tz = f.from.z + (at.z - f.from.z) * e;
    if (f.last && dt > 0) {
      f.vx = (tx - o.position.x) / dt;
      f.vy = (ty - o.position.y) / dt;
      f.vz = (tz - o.position.z) / dt;
    }
    o.position.set(tx, ty, tz);
    f.last = true;
    // Worked in her teeth: it shifts and twists as she chews on it.
    const chew = Math.sin(f.mt * 6.5) * 0.08;
    o.quaternion.copy(f.q0).premultiply(TMPQ.setFromAxisAngle(AX.set(1, 0.3, 0).normalize(), chew + f.mt * 0.1));
    o.updateMatrixWorld(true);
    if ((rig.mouthFull ?? 0) > 0.45 && f.mt < 6) return true;
    // Let go at the top of the toss of her head: on the way her head was
    // going, out to the side and up, turning over as it goes.
    const vmax = 30;
    const sp = Math.hypot(f.vx, f.vy, f.vz);
    if (sp > vmax) { f.vx *= vmax / sp; f.vy *= vmax / sp; f.vz *= vmax / sp; }
    rig.group.updateMatrixWorld(true);
    V.set(f.side, 0.6, 0.4).applyQuaternion(rig.group.getWorldQuaternion(TMPQ)).normalize();
    f.vx += V.x * 9; f.vy = Math.max(f.vy, 0) + 5 + V.y * 4; f.vz += V.z * 9;
    f.axis.set(V.z, 0.2, -V.x).normalize();
    f.spin = 0.9 * f.side;
    f.state = 'air';
    f.rig = null;
    return false;
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
      if (f.state === 'slide') {
        if (this.slide(f, dt)) continue;
      } else if (f.state === 'mouth') {
        if (this.mouth(f, dt)) continue;
      }
      if (!f.wet) {
        f.vy -= G * dt;
        const drag = Math.exp(-dt * 0.04);
        f.vx *= drag; f.vz *= drag;
      } else {
        inWater(f, dt, f.sink);
      }
      o.position.x += f.vx * dt;
      o.position.y += f.vy * dt;
      o.position.z += f.vz * dt;
      if (f.spin) o.quaternion.premultiply(TMPQ.setFromAxisAngle(f.axis, f.spin * dt));
      const sea = seaAt ? seaAt(o.position.x, o.position.z) || 0 : 0;
      if (!f.wet && f.vy < 0 && o.position.y - f.foot < sea) {
        f.wet = true;
        out.push({ x: o.position.x, z: o.position.z, size: f.size * 2, hull: f.size > 3.5, fall: -f.vy });
      }
      o.updateMatrixWorld(true);
      if (f.wet && o.position.y < sea - 30 - f.size * 2) {
        this.drop(f);
        this.live.splice(i, 1);
      }
    }
    return out.length ? out : null;
  }

  /**
   * A mounting going across her deck and over the side. True while it is
   * still on her; once it has gone over the edge it is put into the world
   * with the way it had, and falls like anything else.
   */
  slide(f, dt) {
    const o = f.obj;
    const ship = f.ship;
    if (!ship || !ship.parent) { if (f.world) f.world.attach(o); f.state = 'air'; return false; }
    ship.updateMatrixWorld(true);
    // Downhill across her: how far over she is lying toward the side it is
    // going to, and her deck's own grip on it.
    V.set(f.side, 0, 0).applyQuaternion(ship.getWorldQuaternion(TMPQ));
    const downhill = -V.y; // positive when that side is the low one
    const grip = 0.18;
    const x = Math.abs(o.position.x);
    if (f.tip <= 0 && x < f.edge - f.half * 0.3) {
      // On the deck: the slope and what pushed it against what holds it.
      let a = G * (downhill - grip * Math.sqrt(Math.max(0, 1 - downhill * downhill)));
      // Once it is going it keeps going: a mounting torn off its ring is not
      // held by the deck any more, and her roll and her way work it on
      // across her a little faster every second.
      a = Math.max(a, 1.5);
      f.u = Math.min(9, f.u + a * dt);
      o.position.x += f.side * f.u * dt;
      o.position.z += f.along * f.u * dt;
      o.rotation.y += f.yaw * dt;
    } else {
      // Over the edge: it tips about the deck edge, slowly and then fast, its
      // foot still on her and its weight out over the water.
      f.tipRate += (G / Math.max(1, f.half * 1.6)) * Math.max(0.15, Math.sin(f.tip + 0.25)) * dt;
      f.tip += f.tipRate * dt;
      o.position.x += f.side * Math.max(0.4, f.u * 0.6) * dt;
      o.rotation.z = -f.side * f.tip;
      o.position.y -= f.tip * 0.25 * dt * f.half;
    }
    o.updateMatrixWorld(true);
    if (f.tip < 1.0 && !(f.tip > 0 && Math.abs(o.position.x) > f.edge + f.half)) return true;
    // Off her: into the world, with her way and its own.
    const w = f.world || ship.parent;
    w.attach(o);
    const sv = f.vel || { x: 0, z: 0 };
    V.set(f.side * Math.max(0.8, f.u), -0.5, 0).applyQuaternion(ship.getWorldQuaternion(TMPQ));
    f.vx = (sv.x || 0) + V.x;
    f.vy = Math.min(0, V.y);
    f.vz = (sv.z || 0) + V.z;
    // Still turning over the way it tipped, about her length.
    AX.set(0, 0, -f.side).applyQuaternion(ship.getWorldQuaternion(TMPQ));
    f.axis.copy(AX).normalize();
    f.spin = Math.min(1.4, f.tipRate * 0.7);
    f.state = 'air';
    f.foot = 0.4;
    return false;
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
