// The squadrons in the air.
//
// A flight used to be one aeroplane made of seven boxes, and the same seven
// boxes whether it was four Wildcats or four Avengers. Now it is the aircraft:
// the same models that sit on the Enterprise's deck, in flight trim with the
// wheels up and the wing spread, and there are as many of them in the air as
// the flight actually has.
//
// Drawing a hundred and eighty separate meshes per aeroplane sixty times over
// is not possible, so each type is built once, welded into a single geometry
// with one group per material, and drawn as an instanced batch. One draw call
// per type, however many are up.
//
// They fly in formation because that is how they went: a section of four is a
// leader and a wingman stepped down and back, and another pair outside them.
// It reads as a squadron rather than as a queue of markers, and it is what
// makes a strike look like a strike coming in.

import * as THREE from '../../../vendor/three.module.js';
import { __aircraft } from './enterprise.js';

/**
 * Flatten a built model into one geometry with a material group per material.
 *
 * The models are written as a few hundred boxes and cylinders because that is
 * how you write a readable aeroplane. This is what makes them affordable.
 */
export function weld(group) {
  group.updateMatrixWorld(true);
  const mats = [];
  const buckets = new Map();
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  // A model that can fold its wings has both states built into it and shows
  // one of them. Welding walks the tree rather than the picture, so without
  // this an Avenger came out of here with two sets of wings -- the spread
  // pair she is flying on and the stowed pair lying along her sides.
  const shown = (o) => {
    for (let n = o; n && n !== group.parent; n = n.parent) if (n.visible === false) return false;
    return true;
  };
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    if (!shown(o)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const mat = list[0];
    let b = buckets.get(mat);
    if (!b) {
      b = { pos: [], nor: [], idx: [], slot: mats.length };
      mats.push(mat);
      buckets.set(mat, b);
    }
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    m.copy(o.matrixWorld);
    nm.getNormalMatrix(m);
    const base = b.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      b.pos.push(v.x, v.y, v.z);
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        b.nor.push(v.x, v.y, v.z);
      } else b.nor.push(0, 1, 0);
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) b.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
  });

  const pos = [];
  const nor = [];
  const idx = [];
  const groups = [];
  for (const b of buckets.values()) {
    const start = idx.length;
    const off = pos.length / 3;
    for (let i = 0; i < b.pos.length; i++) pos.push(b.pos[i]);
    for (let i = 0; i < b.nor.length; i++) nor.push(b.nor[i]);
    for (const i of b.idx) idx.push(i + off);
    groups.push([start, idx.length - start, b.slot]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  for (const [start, count, slot] of groups) geo.addGroup(start, count, slot);
  return { geo, mats };
}

/** One of each type, in flight trim, welded and ready to instance. */
export function flightModels() {
  const out = {};
  const make = (key, build) => {
    const g = new THREE.Group();
    const p = build(g);
    // A turning propeller is a disc, not blades: at any range you would see one
    // of these from, the blades are gone and the disc is all there is. Put on
    // the nose the model actually has rather than a guessed offset -- the three
    // machines sit at different heights and have noses of different lengths.
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    const span = bb.max.x - bb.min.x;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(span * 0.135, 18),
      new THREE.MeshBasicMaterial({
        color: 0xdfe6ee, transparent: true, opacity: 0.17,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    // On the thrust line: the middle of the fuselage, not the middle of a box
    // that has a tall fin in it.
    disc.position.set(0, (bb.min.y + bb.max.y) * 0.42, bb.max.z - 0.25);
    p.add(disc);
    out[key] = weld(g);
  };
  make('wildcat', (g) => __aircraft.wildcat(g, 0, 0, 0, 0, false, { gear: false }));
  make('dauntless', (g) => __aircraft.dauntless(g, 0, 0, 0, 0, false, { gear: false }));
  make('avenger', (g) => __aircraft.avenger(g, 0, 0, 0, 0, false, true, { gear: false }));
  return out;
}

/** Which machine flies which job. */
export const ROLE_TYPE = {
  fighter: 'wildcat', dive: 'dauntless', torpedo: 'avenger', scout: 'dauntless',
};

/**
 * Where each aeroplane of a flight sits relative to her leader.
 *
 * A division of four is two sections of two: the wingman stepped back, out and
 * down from his leader, and the second section the same again outside them.
 * The numbers are in metres and they are the real spacing -- close enough that
 * they read as one formation, far enough apart that nobody is flying through
 * anybody.
 */
const SLOTS = [
  [0, 0, 0],
  [22, -6, -18],
  [-26, -4, -22],
  [-48, -9, -42],
  [46, -11, -40],
  [0, -14, -46],
];

export class Flights {
  constructor(scene, max = 72) {
    this.max = max;
    this.models = flightModels();
    this.batches = {};
    for (const [key, { geo, mats }] of Object.entries(this.models)) {
      const mesh = new THREE.InstancedMesh(geo, mats, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.batches[key] = { mesh, n: 0 };
    }
    this.dummy = new THREE.Object3D();
    for (const key of Object.keys(this.batches)) this.parkFrom(key, 0);
  }

  parkFrom(key, from) {
    const b = this.batches[key];
    const d = this.dummy;
    d.position.set(0, -20000, 0);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(0.001);
    d.updateMatrix();
    for (let i = from; i < this.max; i++) b.mesh.setMatrixAt(i, d.matrix);
    b.mesh.instanceMatrix.needsUpdate = true;
  }

  begin() {
    for (const b of Object.values(this.batches)) b.n = 0;
  }

  /**
   * Put one flight in the air: `count` aircraft of her type, in formation on
   * the leader's position and course, banked into whatever turn she is in.
   */
  add(role, x, y, z, heading, bank, pitch, count, skip = -1) {
    const b = this.batches[ROLE_TYPE[role] || 'avenger'];
    if (!b) return;
    const d = this.dummy;
    const sn = Math.sin(heading);
    const cs = Math.cos(heading);
    for (let i = 0; i < count && i < SLOTS.length; i++) {
      if (i === skip) continue;
      if (b.n >= this.max) break;
      const [sx, sy, sz] = SLOTS[i];
      // The slot is in her own frame: across, down, astern.
      d.position.set(
        x + sn * sz + cs * sx,
        y + sy,
        z + cs * sz - sn * sx,
      );
      d.rotation.set(pitch, heading, -bank);
      d.scale.setScalar(1);
      d.updateMatrix();
      b.mesh.setMatrixAt(b.n++, d.matrix);
    }
  }

  /**
   * One aeroplane on her own, at whatever attitude she is in.
   *
   * A formation is a formation; a wreck is an aeroplane going down by herself,
   * end over end, and she needs the whole attitude rather than a slot in
   * somebody's division. Drawn out of the same batch, so she costs nothing.
   */
  one(role, x, y, z, heading, bank, pitch, roll = 0) {
    const b = this.batches[ROLE_TYPE[role] || 'avenger'];
    if (!b || b.n >= this.max) return;
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(pitch, heading, -bank + roll);
    d.scale.setScalar(1);
    d.updateMatrix();
    b.mesh.setMatrixAt(b.n++, d.matrix);
  }

  end() {
    for (const key of Object.keys(this.batches)) {
      this.parkFrom(key, this.batches[key].n);
    }
  }
}
