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
import { MONSTER } from '../../../shared/monster.js';

// How big a thing fits in her jaws, and in her fist, metres from its middle
// to its edge: a gun or a slab bigger than that is crushed down until it does.
const MOUTH = MONSTER.bite.mouth;
const FIST = 4.5;

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
    // Crushed in her teeth: whatever it was, it goes down to what fits
    // between her jaws -- a turret's gunhouse stove in and folded up on its
    // guns -- and a piece that fitted already is crumpled all the same.
    crushing(f, MOUTH);
    // Its middle right between her jaws.
    f.hang = Math.min(1.2, f.size * 0.25);
    return f.size;
  }

  /**
   * Put `obj` -- a turret or a gun her claws have ripped off its roller
   * path -- into her fist (`side` +1 her left hand, -1 her right): pulled up
   * into it, crushed in it until it is a ball of steel no bigger than her
   * hand can close round, and then let fall into the sea.
   */
  addHand(obj, world, rig, { side = 1, sink = 3, own = false, hold = 1.5 } = {}) {
    const size = this.add(obj, world, { sink, own, spin: 0 });
    const f = this.live[this.live.length - 1];
    f.state = 'hand';
    f.rig = rig;
    f.mt = 0;
    f.hold = hold;
    f.side = side >= 0 ? 1 : -1;
    f.from = f.obj.position.clone();
    f.q0 = f.obj.quaternion.clone();
    f.last = null;
    crushing(f, FIST);
    return size;
  }

  /** A gun in her fist. True while she still has it. */
  hand(f, dt) {
    const o = f.obj;
    const rig = f.rig;
    if (!rig || !rig.group || !rig.group.parent || !rig.group.visible || !rig.palmPoint) { f.state = 'air'; return false; }
    f.mt += dt;
    const at = rig.palmPoint(f.side, V);
    const u = Math.min(1, f.mt / 0.3);
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
    squeeze(f, 0.6);
    // Ground in her fist as her fingers close on it.
    const grind = Math.sin(f.mt * 9) * 0.06 * Math.min(1, f.mt / 0.4);
    o.quaternion.copy(f.q0).premultiply(TMPQ.setFromAxisAngle(AX.set(0.3, 1, 0.2).normalize(), grind + f.mt * 0.3));
    o.updateMatrixWorld(true);
    if (f.mt < f.hold) return true;
    // Let fall from her opening hand, out to her side, away from her.
    rig.group.updateMatrixWorld(true);
    V.set(f.side, 0, 0.2).applyQuaternion(rig.group.getWorldQuaternion(TMPQ));
    V.y = 0;
    V.normalize();
    f.vx = V.x * 6; f.vz = V.z * 6; f.vy = 1;
    f.axis.set(V.z, 0.3, -V.x).normalize();
    f.spin = 0.6 * f.side;
    f.state = 'air';
    f.rig = null;
    return false;
  }

  /** A piece in her jaws. True while she still has it. */
  mouth(f, dt, seaAt = null) {
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
    squeeze(f, 0.4);
    // Worked in her teeth: it shifts and twists as she chews on it.
    const chew = Math.sin(f.mt * 6.5) * 0.08;
    o.quaternion.copy(f.q0).premultiply(TMPQ.setFromAxisAngle(AX.set(1, 0.3, 0).normalize(), chew + f.mt * 0.1));
    o.updateMatrixWorld(true);
    if ((rig.mouthFull ?? 0) > 0.45 && f.mt < 6) return true;
    // Let go at the top of the toss of her head: on the way her head was
    // going, out to the side and up, turning over as it goes.
    // Flung well clear: out to her side and ahead, far enough to come down
    // in open water and not on the ship in her hands or on herself.
    rig.group.updateMatrixWorld(true);
    V.set(f.side, 0, 0.45).applyQuaternion(rig.group.getWorldQuaternion(TMPQ));
    V.y = 0;
    V.normalize();
    const vy = 9 + Math.min(4, f.size * 0.3);
    const hgt = Math.max(0, o.position.y - (seaAt ? seaAt(o.position.x, o.position.z) || 0 : 0));
    const flight = (vy + Math.sqrt(vy * vy + 2 * G * hgt)) / G;
    const range = 70 + f.size * 3;
    const hs = range / Math.max(0.5, flight);
    // A little of the swing of her head is in it, never against it.
    const along = f.vx * V.x + f.vz * V.z;
    const extra = Math.min(8, Math.max(0, along));
    f.vx = V.x * (hs + extra); f.vz = V.z * (hs + extra); f.vy = vy;
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
  step(dt, seaAt = null, groundAt = null) {
    if (!this.live.length) return null;
    const out = [];
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      const o = f.obj;
      if (f.state === 'slide') {
        if (this.slide(f, dt)) continue;
      } else if (f.state === 'mouth') {
        if (this.mouth(f, dt, seaAt)) continue;
      } else if (f.state === 'hand') {
        if (this.hand(f, dt)) continue;
      } else if (f.state === 'ground') {
        if (this.ground(f, dt, groundAt, seaAt)) continue;
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
      // Come down ashore: it lands, and slides if the ground is steep.
      if (!f.wet && f.vy < 0 && groundAt) {
        const g = groundAt(o.position.x, o.position.z);
        if (Number.isFinite(g) && g > sea && o.position.y - f.foot <= g) {
          o.position.y = g + f.foot;
          groundNormal(groundAt, o.position.x, o.position.z, V);
          const vn = f.vx * V.x + f.vy * V.y + f.vz * V.z;
          f.vx = (f.vx - vn * V.x) * 0.3; f.vy = 0; f.vz = (f.vz - vn * V.z) * 0.3;
          f.spin = 0;
          f.lay = 0;
          f.state = 'ground';
          o.updateMatrixWorld(true);
          continue;
        }
      }
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

  /**
   * Lying on the ground ashore: held where the slope is gentle, sliding down
   * it where it is not, and back into the air if it goes off a drop or into
   * the sea. True while it is still on the ground. Cleared away after it has
   * lain still a good while.
   */
  ground(f, dt, groundAt, seaAt) {
    const o = f.obj;
    if (!groundAt) { f.state = 'air'; return false; }
    const sea = seaAt ? seaAt(o.position.x, o.position.z) || 0 : 0;
    const g = groundAt(o.position.x, o.position.z);
    if (!Number.isFinite(g) || g <= sea || g < o.position.y - f.foot - 0.8) { f.state = 'air'; return false; }
    const n = groundNormal(groundAt, o.position.x, o.position.z, V);
    // Gravity along the slope, against its grip.
    const gn = -G * n.y;
    const tx = -gn * n.x, ty = -G - gn * n.y, tz = -gn * n.z;
    const pull = Math.hypot(tx, ty, tz);
    const press = G * n.y;
    let sp = Math.hypot(f.vx, f.vz);
    if (sp < 0.15 && pull <= 0.3 * press) {
      f.vx = f.vz = 0;
      f.lay += dt;
    } else {
      f.lay = 0;
      f.vx += tx * dt; f.vz += tz * dt;
      sp = Math.hypot(f.vx, f.vz);
      if (sp > 1e-6) {
        const k = Math.max(0, sp - 0.22 * press * dt) / sp;
        f.vx *= k; f.vz *= k;
      }
    }
    o.position.x += f.vx * dt;
    o.position.z += f.vz * dt;
    o.position.y = groundAt(o.position.x, o.position.z) + f.foot;
    f.vy = 0;
    o.updateMatrixWorld(true);
    if (f.lay > 40) {
      this.drop(f);
      this.live.splice(this.live.indexOf(f), 1);
      return true;
    }
    return true;
  }

  drop(f) {
    if (f.obj.parent) f.obj.parent.remove(f.obj);
    // Only what was made for the throw is given back: a mounting's shapes are
    // her class's, shared with every other ship of it.
    if (f.own) {
      f.obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !Array.isArray(o.material) && !o.material.userData.kept) o.material.dispose();
      });
    }
  }

  dispose() {
    for (const f of this.live) this.drop(f);
    this.live.length = 0;
  }
}

/** The slope of the ground at (x, z), as its upward normal, into `out`. */
function groundNormal(groundAt, x, z, out) {
  const h = 1.5;
  const dx = groundAt(x + h, z) - groundAt(x - h, z);
  const dz = groundAt(x, z + h) - groundAt(x, z - h);
  return out.set(-dx, 2 * h, -dz).normalize();
}

/**
 * The very piece of her torn out by Monster One: `tris` the plating that came
 * away ([{ tri: 9 floats in her frame, c: [r, g, b] }], see Plating.take) and
 * `carried` whatever was standing on it (cuts off pieces.js, in her frame).
 * Her paint outside, dark primer on the inside of the plate a hand's breadth
 * behind it, so it has a thickness when it turns over in her jaws.
 *
 * Returns a group set where the piece was on her, or null if there is nothing.
 */
// One material for every piece torn out of a hull, kept for good: made new
// for each, and given back when it sank, the picture had to build its shader
// again for the next one, which is a stall in the middle of her biting.
let PIECE_MAT = null;
function pieceMaterial() {
  if (!PIECE_MAT) {
    PIECE_MAT = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.85, metalness: 0.25, flatShading: true, side: THREE.DoubleSide,
    });
    PIECE_MAT.userData.kept = true;
  }
  return PIECE_MAT;
}

export function hullPiece(tris, carried = []) {
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const { tri } of tris) {
    cx += tri[0] + tri[3] + tri[6]; cy += tri[1] + tri[4] + tri[7]; cz += tri[2] + tri[5] + tri[8];
    n += 3;
  }
  for (const c of carried) { cx += c.x * 3; cy += c.y * 3; cz += c.z * 3; n += 3; }
  if (!n) return null;
  cx /= n; cy /= n; cz /= n;
  const group = new THREE.Group();
  group.position.set(cx, cy, cz);
  const mat = pieceMaterial();
  let size = 0.5;
  if (tris.length) {
    const T = 0.3;
    const pos = new Float32Array(tris.length * 18);
    const col = new Float32Array(tris.length * 18);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
    tris.forEach(({ tri, c }, i) => {
      A.set(tri[0] - cx, tri[1] - cy, tri[2] - cz);
      B.set(tri[3] - cx, tri[4] - cy, tri[5] - cz);
      C.set(tri[6] - cx, tri[7] - cy, tri[8] - cz);
      N.subVectors(B, A).cross(C.clone().sub(A)).normalize();
      // Outward is up off a deck and out from her centreline off a side; the
      // back of the plate is inboard of that.
      const mx = (tri[0] + tri[3] + tri[6]) / 3;
      const up = Math.abs(N.y) > 0.6;
      if ((up ? N.y : N.x * mx) < 0) N.negate();
      const o = i * 18;
      const outer = [A, B, C];
      const inner = [A, C, B].map((v) => v.clone().addScaledVector(N, -T));
      outer.forEach((v, k) => {
        pos[o + k * 3] = v.x; pos[o + k * 3 + 1] = v.y; pos[o + k * 3 + 2] = v.z;
        col[o + k * 3] = c[0]; col[o + k * 3 + 1] = c[1]; col[o + k * 3 + 2] = c[2];
        size = Math.max(size, v.length());
      });
      inner.forEach((v, k) => {
        pos[o + 9 + k * 3] = v.x; pos[o + 9 + k * 3 + 1] = v.y; pos[o + 9 + k * 3 + 2] = v.z;
        col[o + 9 + k * 3] = 0.24; col[o + 9 + k * 3 + 1] = 0.17; col[o + 9 + k * 3 + 2] = 0.13;
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
  }
  for (const c of carried) {
    const pos = new Float32Array(c.pos.length);
    for (let i = 0; i < c.pos.length; i += 3) {
      pos[i] = c.pos[i] + c.x - cx; pos[i + 1] = c.pos[i + 1] + c.y - cy; pos[i + 2] = c.pos[i + 2] + c.z - cz;
      size = Math.max(size, Math.hypot(pos[i], pos[i + 1], pos[i + 2]));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c.col, 3));
    g.setIndex(new THREE.BufferAttribute(c.idx, 1));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
  }
  group.userData.size = size;
  return group;
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

/**
 * How far a piece is to be crushed to fit in `room` (its middle to its
 * edge): flattened more than it is narrowed, the way steel folds up under a
 * closing jaw or fist. Never left as it was: even a piece that fitted is
 * crumpled.
 */
function crushing(f, room) {
  const k = Math.min(0.85, room / Math.max(0.5, f.size));
  f.crush = { x: k * (1.05 + (Math.random() - 0.5) * 0.2), y: k * 0.62, z: k * (0.95 + (Math.random() - 0.5) * 0.2), t: 0 };
  f.size = Math.min(f.size, room);
  f.foot = Math.max(0.3, f.foot * k * 0.62);
}

/** The crush, as far as it has got, over `over` seconds. */
function squeeze(f, over) {
  const c = f.crush;
  if (!c || c.t >= 1) return;
  c.t = Math.min(1, f.mt / over);
  // Most of it at once, as the jaws or fingers meet it, the rest yielding.
  const e = 1 - (1 - c.t) * (1 - c.t);
  f.obj.scale.set(1 + (c.x - 1) * e, 1 + (c.y - 1) * e, 1 + (c.z - 1) * e);
}
