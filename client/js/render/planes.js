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
import { SLOTS, slotAt } from '../../../shared/formation.js';
import {
  wildcat, dauntless, avenger, arado, kingfisher, besson, loire,
  tenzan, jake, muzzlesOf, dressPlane,
} from './planekit.js';
import {
  ZERO, ZERO_SEGS, zeroGeometries, zeroMaterial, zeroSegOf,
} from './zeroModel.js';
import {
  SUISEI, SUISEI_SEGS, suiseiGeometries, suiseiMaterial, suiseiSegOf, suiseiRest, suiseiHinge,
} from './suiseiModel.js';

/**
 * Flatten a built model into one geometry with a material group per material.
 *
 * The models are written as a few hundred boxes and cylinders because that is
 * how you write a readable aeroplane. This is what makes them affordable.
 */
/**
 * How many holes are cut in the whole sky at once: sixteen in each of five
 * hundred and twelve aeroplanes, which is more machines than a battle puts up.
 */
export const HOLE_MAX = 512 * 16;

/**
 * Unpack a hole report off the wire.
 *
 * Five integers a hole, packed in `protocol.js`: which part, where on it in
 * fiftieths, and how big in twentieths of a metre.
 */
export function unpackHoles(hl) {
  if (!hl || !hl.length) return null;
  const out = [];
  for (let i = 0; i + 4 < hl.length; i += 5) {
    out.push({
      k: HOLE_PARTS[hl[i]] || 'body',
      x: hl[i + 1] / 50, y: hl[i + 2] / 50, z: hl[i + 3] / 50,
      r: hl[i + 4] / 20,
    });
  }
  return out.length ? out : null;
}

/** The part keys in the order the wire packs them; see shared/airframe.js. */
const HOLE_PARTS = ['engine', 'tanks', 'wings', 'tail', 'crew', 'body'];

export function weld(group, about = null) {
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
    // A moving part is welded about its own hinge rather than about the
    // aeroplane's datum, so the batch that draws it can turn it.
    if (about) m.premultiply(about);
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

/**
 * Where each type's forward guns are, in her own frame.
 *
 * Filled in by `flightModels` from the models themselves, so it cannot drift
 * out of step with them. Read with `gunsOf`.
 */
const MUZZLES = {};

/**
 * The muzzles of the guns an aeroplane of this type fires forward.
 *
 * A Wildcat answers with four, two in each wing, and a tracer drawn from them
 * leaves the wings -- which is what a fighter's fire looks like and what a
 * burst from the middle of a nose never did. A Kingfisher answers with the one
 * she had. Nothing answers with an empty list: a machine with no gun modelled
 * falls back to her nose so the game never has nowhere to fire from.
 */
export function gunsOf(kind) {
  const m = MUZZLES[kind];
  return (m && m.length) ? m : [[0, 0, 3.2]];
}

/**
 * The pieces an aeroplane can lose, as bits of a mask.
 *
 * A wing shot off at the root takes its outboard panel and its leg with it; a
 * tail shot off takes the tail wheel. `segGone` says which pieces a mask
 * leaves her without, and everything that draws her goes through it.
 */
export const CUT = { tail: 1, wingInL: 2, wingInR: 4, wingOutL: 8, wingOutR: 16, prop: 32 };

/** The pieces every type is drawn in. */
export const SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];

/** Whether the piece called `name` is gone from an aeroplane with this mask. */
export function segGone(name, cut) {
  if (!cut) return false;
  switch (name) {
    case 'tail': case 'gearT': return (cut & CUT.tail) !== 0;
    case 'wingInL': case 'gearL': return (cut & CUT.wingInL) !== 0;
    case 'wingInR': case 'gearR': return (cut & CUT.wingInR) !== 0;
    case 'wingOutL': return (cut & (CUT.wingOutL | CUT.wingInL)) !== 0;
    case 'wingOutR': return (cut & (CUT.wingOutR | CUT.wingInR)) !== 0;
    case 'prop': return (cut & CUT.prop) !== 0;
    default: return false;
  }
}

/**
 * Which piece of a built-up model a point is in.
 *
 * The models in the kit are not built in pieces, so they are cut by where
 * each triangle is: the last quarter of her length is her tail, the panel
 * outboard of about three fifths of her semi-span is the part of a wing a
 * burst clips off, and the rest of each wing outboard of her fuselage is the
 * wing. Good enough to lose a wing or a tail by; the Zero is cut where her
 * own structure breaks (see zeroModel.js).
 */
function boxSegOf(box) {
  const half = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  const len = box.max.z - box.min.z;
  const tailZ = box.min.z + len * 0.27;
  const bodyW = half * 0.13;
  const fn = (x, y, z) => {
    const ax = Math.abs(x);
    if (z < tailZ) return 'tail';
    if (ax > half * 0.58) return x > 0 ? 'wingOutR' : 'wingOutL';
    if (ax > bodyW) return x > 0 ? 'wingInR' : 'wingInL';
    return 'body';
  };
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (tailZ + box.max.z) / 2;
  fn.breaks = {
    tail: [0, cy, tailZ],
    wingInL: [-bodyW, cy, cz], wingInR: [bodyW, cy, cz],
    wingOutL: [-half * 0.58, cy, cz], wingOutR: [half * 0.58, cy, cz],
    prop: [0, cy, box.max.z],
  };
  return fn;
}

/**
 * Cut one welded geometry into its pieces. Each piece shares the welded
 * buffers and keeps its own triangles, in the same material groups, so a
 * piece is a draw call and no more memory.
 */
function segment(geo, segOf) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const lists = {};
  for (const name of SEGS) lists[name] = [];
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: idx.count, materialIndex: 0 }];
  for (const gr of groups) {
    for (const name of SEGS) lists[name].push({ slot: gr.materialIndex, idx: [] });
    const at = lists.body.length - 1;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      lists[segOf(cx, cy, cz)][at].idx.push(a, b, c);
    }
  }
  const out = {};
  for (const name of SEGS) {
    const all = [];
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
    for (const { slot, idx: list } of lists[name]) {
      if (!list.length) continue;
      g.addGroup(all.length, list.length, slot);
      for (const v of list) all.push(v);
    }
    if (!all.length) continue;
    g.setIndex(all);
    g.computeBoundingSphere();
    out[name] = g;
  }
  return out;
}

/**
 * Her wingtips, the furthest point of her out each side, and her nose: where
 * her vapour trails and her contrail come off.
 */
function tipsOf(key, geo) {
  if (key === 'zero') return { tips: ZERO.tips, nose: [0, ZERO.prop[1] - 0.2, ZERO.prop[2] - 1.2] };
  if (key === 'suisei') return { tips: SUISEI.tips, nose: [0, SUISEI.prop[1] - 0.2, SUISEI.prop[2] - 1.2] };
  const pos = geo.attributes.position;
  let l = null, r = null, front = -Infinity, fy = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (!l || x < l[0]) l = [x, y, z];
    if (!r || x > r[0]) r = [x, y, z];
    if (Math.abs(x) < 0.5 && z > front) { front = z; fy = y; }
  }
  return { tips: [l || [-5, 0, 0], r || [5, 0, 0]], nose: [0, fy, front - 1] };
}

/** The middle of the triangles a geometry actually draws, in its own frame. */
function centroidOf(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const c = new THREE.Vector3();
  if (!idx || !idx.count) return c;
  for (let i = 0; i < idx.count; i++) {
    const v = idx.getX(i);
    c.x += pos.getX(v); c.y += pos.getY(v); c.z += pos.getZ(v);
  }
  return c.multiplyScalar(1 / idx.count);
}

/** The faint smoky ring a turning airscrew is past a few hundred yards. */
function discMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x6f7a86, transparent: true, opacity: 0.085,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

/**
 * A sculpt's airscrew, about its own hub, with the disc a turning one is past
 * a few hundred yards welded into it as its own group -- the same as every
 * other type's (see flightModels below).
 */
function withDisc(blades, radius) {
  const ring = new THREE.RingGeometry(radius * 0.3, radius * 0.99, 28, 1).translate(0, 0, 0.12);
  const prop = new THREE.BufferGeometry();
  const bp = blades.attributes.position, bn = blades.attributes.normal, bc = blades.attributes.color;
  const rp = ring.attributes.position;
  const nb = bp.count, nr = rp.count;
  const pos = new Float32Array((nb + nr) * 3);
  const nor = new Float32Array((nb + nr) * 3);
  const col = new Uint8Array((nb + nr) * 3);
  pos.set(bp.array, 0); nor.set(bn.array, 0); col.set(bc.array, 0);
  pos.set(rp.array, nb * 3);
  for (let i = 0; i < nr; i++) nor[(nb + i) * 3 + 2] = 1;
  const idx = Array.from(blades.index.array);
  const bi = idx.length;
  for (let i = 0; i < ring.index.count; i++) idx.push(nb + ring.index.getX(i));
  prop.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  prop.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  prop.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  prop.setIndex(idx);
  prop.addGroup(0, bi, 0);
  prop.addGroup(bi, idx.length - bi, 1);
  return prop;
}

/** Every piece of a sculpt that is skin, in one: what a hole is snapped onto. */
function probeOf(geos, names) {
  const pos = [];
  const idx = [];
  for (const k of names) {
    const g = geos[k];
    const base = pos.length / 3;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
  }
  const probe = new THREE.BufferGeometry();
  probe.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  probe.setIndex(idx);
  return probe;
}

/** The Zero: the owner's sculpt, already in her pieces. */
function zeroFlightModel() {
  const geos = zeroGeometries();
  const mat = zeroMaterial();
  const segs = {};
  for (const k of ZERO_SEGS) segs[k] = { geo: geos[k], mats: [mat] };
  // What a hole is snapped onto: every piece of her that is skin, in one.
  const probe = probeOf(geos, ZERO_SEGS);
  // Her airscrew and her legs, each about its own hinge, as the kit's moving
  // parts are.
  const local = (g, at) => {
    const c = g.clone();
    c.translate(-at[0], -at[1], -at[2]);
    return c;
  };
  const parts = [];
  const rot = new THREE.Quaternion();
  // Her airscrew, with the faint disc a turning one is past a few hundred
  // yards welded into it as its own group -- the same as every other type's
  // (see flightModels below).
  parts.push({
    name: 'prop', axis: 'z', open: 0, spin: true,
    at: new THREE.Vector3().fromArray(ZERO.prop), rot,
    geo: withDisc(local(geos.prop, ZERO.prop), ZERO.propR), mats: [mat, discMaterial()],
  });
  for (const k of ['gearL', 'gearR', 'gearT']) {
    const spec = ZERO[k];
    parts.push({
      name: k, axis: spec.axis, open: spec.up, gear: true, tuck: spec.tuck || 0,
      slide: spec.slide || 0,
      at: new THREE.Vector3().fromArray(spec.at), rot,
      geo: local(geos[k], spec.at), mats: [mat],
    });
  }
  const segOf = zeroSegOf;
  segOf.breaks = ZERO.breaks;
  return { segs, parts, probe, segOf, cy: 1.65, geo: probe, mats: [mat] };
}

/**
 * The Suisei: the owner's sculpt, in her pieces, with everything of her that
 * moves on its own hinge -- her airscrew, her bomb doors, the bomb on its
 * crutch, the gunner's gun and her three legs.
 */
function suiseiFlightModel() {
  const geos = suiseiGeometries();
  const mat = suiseiMaterial();
  const segs = {};
  for (const k of SUISEI_SEGS) segs[k] = { geo: geos[k], mats: [mat] };
  const probe = probeOf(geos, SUISEI_SEGS);
  const at = (k) => new THREE.Vector3().fromArray(suiseiHinge(k));
  const parts = [{
    name: 'prop', axis: 'z', open: 0, spin: true, at: at('prop'), rot: suiseiRest('prop'),
    geo: withDisc(geos.prop, SUISEI.propR), mats: [mat, discMaterial()],
  }];
  for (const k of ['bayPort', 'bayStbd']) {
    parts.push({
      name: k, axis: 'z', open: SUISEI[k].open, at: at(k), rot: suiseiRest(k),
      geo: geos[k], mats: [mat],
    });
  }
  parts.push({ name: 'store', axis: 'z', open: 0, fall: true, at: at('store'), rot: suiseiRest('store'),
    geo: geos.store, mats: [mat] });
  parts.push({ name: 'gun', axis: 'y', open: 0, turret: true, at: at('gun'), rot: suiseiRest('gun'),
    geo: geos.gun, mats: [mat] });
  for (const k of ['gearL', 'gearR', 'gearT']) {
    const spec = SUISEI[k];
    parts.push({
      name: k, axis: spec.axis, open: spec.up, gear: true, tuck: spec.tuck || 0,
      slide: spec.slide || 0,
      at: at(k), rot: suiseiRest(k), geo: geos[k], mats: [mat],
    });
  }
  const segOf = suiseiSegOf;
  segOf.breaks = SUISEI.breaks;
  return { segs, parts, probe, segOf, cy: 1.3, geo: probe, mats: [mat] };
}

/**
 * Where the gunner's gun is on a type that has one, in her own frame: its
 * pivot, the rotation it sits at, and its muzzle about the pivot laid aft.
 * Null for a type with nobody facing aft.
 */
export function rearGunOf(kind) {
  if (kind === 'suisei') {
    return { at: SUISEI.gun.at, rot: suiseiRest('gun'), muzzle: SUISEI.gun.muzzle };
  }
  return null;
}

/**
 * Where a carrier bomber's gunner sits and what he has, for somebody going to
 * sit there: his eye in her own frame, just over the ring his gun swings on,
 * and the cone it swings through -- everything abaft her wing and over her
 * tail, which is the arc the simulation gives him (see stepRearGunners). The
 * Avenger's is her ball turret, with her fifty in it.
 */
const REAR_SEATS = {
  dauntless: { x: 0, y: 2.55, z: -2.0, cal: 0.0077, guns: 2 },
  suisei: { x: 0, y: SUISEI.gun.at[1] + 0.5, z: SUISEI.gun.at[2] - 0.25, cal: 0.0077, guns: 1 },
  avenger: { x: 0, y: 3.25, z: -0.5, cal: 0.0127, guns: 1 },
  tenzan: { x: 0, y: 2.85, z: -1.7, cal: 0.0077, guns: 1 },
};

/** A carrier bomber's rear gun, in the shape a heavy's turrets are; or null. */
export function rearSeatOf(kind) {
  const s = REAR_SEATS[kind];
  return s ? { name: 'rear', arc: 110, up: 70, down: 25, ...s } : null;
}

/**
 * Where each type's weapon hangs, in her own frame, with the bay open: filled
 * in by `flightModels` off the part that falls, so it cannot drift out of step
 * with the model. Read with `storeOf`.
 */
const STORES = {};

/**
 * Where a type's bomb is when it is let go -- the middle of it, in her own
 * frame, with her bay open and her crutch swung out -- the way it is lying,
 * and how long and how fat it is. Null for a type with nothing on a rack.
 */
export function storeOf(kind) {
  return STORES[kind] || null;
}

function readStore(key, parts) {
  const sp = parts.find((q) => q.fall);
  if (!sp) return;
  sp.geo.computeBoundingBox();
  const bb = sp.geo.boundingBox;
  const c = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const axis = new THREE.Vector3(sp.axis === 'x' ? 1 : 0, sp.axis === 'y' ? 1 : 0, sp.axis === 'z' ? 1 : 0);
  const swing = new THREE.Quaternion().setFromAxisAngle(axis, sp.open || 0);
  const q = sp.rot.clone().multiply(swing);
  STORES[key] = {
    at: c.applyQuaternion(q).add(sp.at).toArray(),
    q, len: size.z, r: Math.max(size.x, size.y) * 0.5,
    // The type's own weapon: what falls is what hung in her.
    geo: sp.geo, mats: sp.mats, mid: bb.getCenter(new THREE.Vector3()),
  };
}

/** One of each type, in flight trim, welded, cut into her pieces and ready to instance. */
export function flightModels() {
  const out = {};
  const make = (key, build) => {
    const g = new THREE.Group();
    const p = build(g);
    g.updateMatrixWorld(true);
    // Her guns, off the model, before anything else is hung on it: reading
    // them here rather than after welding is the point, because welding throws
    // the tree away.
    MUZZLES[key] = muzzlesOf(p);
    // A turning airscrew is a disc as much as it is blades: past a few hundred
    // yards the blades smear and what is left is a faint smoky ring. It goes
    // on the hub the model actually has, at the radius her own blades actually
    // reach, so it turns with them and sits on the thrust line. Hung off the
    // model's bounding box instead -- which is what it used to be -- it came
    // out low and behind the spinner, and read as a pale white plate under the
    // nose that no propeller has.
    const hub = p.userData.prop;
    if (hub) {
      hub.updateMatrixWorld(true);
      const at = new THREE.Vector3().setFromMatrixPosition(hub.matrixWorld);
      const v = new THREE.Vector3();
      let rad = 0;
      hub.traverse((n) => {
        if (!n.isMesh || !n.geometry || !n.geometry.attributes.position) return;
        const pos = n.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld).sub(at);
          rad = Math.max(rad, Math.hypot(v.x, v.y));
        }
      });
      if (rad > 0.2) {
        // A ring, not a plate. The middle of a propeller disc is spinner and
        // crankcase -- solid metal you can see -- and a filled circle laid
        // over it is exactly the white thing that had no business being there.
        const blur = new THREE.Mesh(
          new THREE.RingGeometry(rad * 0.34, rad * 0.99, 28, 1),
          new THREE.MeshBasicMaterial({
            color: 0x6f7a86, transparent: true, opacity: 0.085,
            side: THREE.DoubleSide, depthWrite: false,
          }),
        );
        blur.position.set(0, 0, 0.03);
        hub.add(blur);
      }
    }
    // Her skin, before the weld: flush-riveted alloy under paint, with the
    // panel joints and the streaking that go with it. After the weld there is
    // no tree left to walk. See dressPlane.
    dressPlane(g);
    // The pieces of her that move -- bay doors, a displacing trapeze, the
    // weapon on the rack -- come out of the body before it is welded and are
    // welded on their own about their hinges. Welded into the body they would
    // be as fixed as the wings. See planekit's animPart.
    const parts = [];
    for (const spec of (p.userData.parts || [])) {
      const node = spec.node;
      node.updateMatrixWorld(true);
      // Her hinge and its rotation, without the scale she was put to her true
      // size with: that goes into the part's own geometry instead, so a part
      // welded about its hinge is the same size as the aeroplane it is on.
      const at = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      node.matrixWorld.decompose(at, rot, new THREE.Vector3());
      const base = new THREE.Matrix4().compose(at, rot, new THREE.Vector3(1, 1, 1)).invert();
      const { geo, mats } = weld(node, base);
      node.parent.remove(node);
      parts.push({
        name: spec.name, axis: spec.axis, open: spec.open, fall: spec.fall,
        spin: spec.spin, at, rot, geo, mats,
      });
    }
    const { geo, mats } = weld(g);
    geo.computeBoundingBox();
    const segOf = boxSegOf(geo.boundingBox);
    const segs = {};
    for (const [name, sg] of Object.entries(segment(geo, segOf))) segs[name] = { geo: sg, mats };
    out[key] = { segs, parts, probe: geo, segOf, cy: 0, geo, mats };
    readStore(key, parts);
  };
  make('wildcat', (g) => wildcat(g, 0, 0, 0, 0, false, { gear: false }));
  make('dauntless', (g) => dauntless(g, 0, 0, 0, 0, false, { gear: false }));
  make('avenger', (g) => avenger(g, 0, 0, 0, 0, false, true, { gear: false }));
  // The two float planes fly as themselves. A cruiser's scout used to be
  // drawn as whatever the carrier had in the same role -- which is `dive` --
  // so a Dauntless dive bomber came off a battleship's quarterdeck, and the
  // Arado and the Kingfisher existed only as models sitting on a catapult.
  make('arado', (g) => arado(g, 0, 0, 0, 0, false, {}));
  make('kingfisher', (g) => kingfisher(g, 0, 0, 0, 0, {}));
  // And the Besson, which flies off one boat and nothing else.
  make('besson', (g) => besson(g, 0, 0, 0, 0, {}));
  // And the Loire 130 the Richelieu works off her quarterdeck.
  make('loire', (g) => loire(g, 0, 0, 0, 0, {}));
  // And the Japanese four: a Zero, a Suisei, a Tenzan and the Jake the
  // battleships and the cruisers work off their catapults. The Zero is the
  // owner's sculpt of her, in the pieces she is built to come apart in.
  out.zero = zeroFlightModel();
  MUZZLES.zero = ZERO.guns.slice().sort((a, b) => a[0] - b[0]);
  out.suisei = suiseiFlightModel();
  MUZZLES.suisei = SUISEI.guns.slice().sort((a, b) => a[0] - b[0]);
  readStore('suisei', out.suisei.parts);
  make('tenzan', (g) => tenzan(g, 0, 0, 0, 0, false, true, { gear: false }));
  make('jake', (g) => jake(g, 0, 0, 0, 0, false, {}));
  return out;
}

/** Where on her each piece breaks away, in her own frame. */
export function breaksOf(models, kind) {
  const m = models[kind];
  return (m && m.segOf && m.segOf.breaks) || null;
}

/**
 * Which machine flies which job, for a ship that flies more than one.
 *
 * A carrier's group is three types and the role says which; a cruiser flies
 * one type whatever the job is, and says so on the wire instead -- see
 * `typeOf`.
 */
export const ROLE_TYPE = {
  fighter: 'wildcat', dive: 'dauntless', torpedo: 'avenger', scout: 'dauntless',
};

const TYPES = new Set(['wildcat', 'dauntless', 'avenger', 'arado', 'kingfisher',
  'besson', 'loire', 'zero', 'suisei', 'tenzan', 'jake']);

/** The machine a flight is: what her ship flies, or what her job takes. */
export function typeOf(type, role) {
  if (type && TYPES.has(type)) return type;
  return ROLE_TYPE[role] || 'avenger';
}

// Where each aeroplane of a flight sits relative to her leader. The table
// lives in shared/formation.js now, where the simulation can read it too.
export { slotAt };

/**
 * How many holes one aeroplane carries into the shader, and how many
 * aeroplanes a frame can draw holed.
 */
const HOLES_PER = 16;
const HOLE_ROWS = 512;

/**
 * Cut an aeroplane's skin where she has been hit.
 *
 * A hole is not drawn on her. It is a place where she is not: every fragment
 * of her skin inside it is thrown away, so what shows through is whatever is
 * behind it -- the inside of her other side, painted in the primer she was
 * finished in inside, or for a round through a wing, which is two skins a
 * hand's breadth apart, the sky. Round the edge the paint is burned and torn
 * off back to bare metal, and the edge itself is ragged, because a round does
 * not punch a clean circle.
 *
 * It used to be a disc of near-black laid on the skin with a ring of grey
 * petals round it. That is a sticker: it reads as a hole from a long way off
 * and as a black patch close to, and nothing went through it.
 *
 * Patches a material so that it reads which holes to cut from `field`'s
 * texture, by the row each instance carries in its `holeRow` attribute.
 * Returns a clone; the original -- on the deck models and everywhere else
 * that draws an unbroken aeroplane -- is left alone.
 */
export function holedMaterial(mat, field) {
  const made = field.mats.get(mat);
  if (made) return made;
  const m = mat.clone();
  const inner = mat.onBeforeCompile && mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
    ? mat.onBeforeCompile : null;
  // Both faces: through a hole in one side of her the inside of the other
  // side is what you see, and it has to be there to be seen.
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (sh, r) => {
    if (inner) inner.call(mat, sh, r);
    sh.uniforms.holeTex = field.uniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float holeRow;
varying vec3 vHoleP;
flat varying float vHoleRow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHoleP = position;
vHoleRow = holeRow;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D holeTex;
varying vec3 vHoleP;
flat varying float vHoleRow;
float holeHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float holeRim = 0.0;
if (vHoleRow >= 0.0) {
  int row = int(vHoleRow + 0.5);
  for (int i = 0; i < ${HOLES_PER}; i++) {
    vec4 h = texelFetch(holeTex, ivec2(i, row), 0);
    if (h.w <= 0.0) break;
    vec3 d = vHoleP - h.xyz;
    float dist = length(d);
    // Torn, not punched: the radius goes in and out round the edge.
    vec3 dir = d / max(dist, 1e-4);
    float tear = holeHash(floor(dir * 3.5) + h.xyz) * 0.6 + holeHash(floor(dir * 9.0) + h.xyz) * 0.4;
    float rr = h.w * (0.72 + 0.5 * tear);
    if (dist < rr) discard;
    holeRim = max(holeRim, 1.0 - smoothstep(rr, rr * 1.22, dist));
  }
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// The inside of her, seen through a hole: zinc-chromate primer, in her own
// shadow.
if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.24, 0.27, 0.16);
// And the paint burned and torn back off the metal round the edge.
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.44), holeRim * 0.7);`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.call(mat) : '';
  m.customProgramCacheKey = () => `${key}|holes`;
  field.mats.set(mat, m);
  return m;
}

/**
 * Every hole in every aeroplane a renderer is drawing.
 *
 * Holes are cut in the shader (see holedMaterial), so what this keeps is a
 * texture: a row per aeroplane drawn this frame, each texel a hole -- where it
 * is in her own frame and how big. A renderer clears it at the top of the
 * frame, asks for a row for each machine that has been hit, and hands the row
 * to the instance it draws her as.
 */
export class HoleField {
  constructor(scene = null, rows = HOLE_ROWS) {
    this.rows = rows;
    // Where each hole actually sits on each aeroplane, worked out once.
    //
    // The part boxes the simulation records a hole in are boxes: a wing runs
    // from wingtip to wingtip and a fuselage is a tube, and a point taken
    // inside one of those is very often not on the aeroplane at all. So the
    // box says roughly where, and the model itself says exactly where: a ray
    // is cast in at the point from outside her, and the hole is put on the
    // first piece of aeroplane it finds. A ray that finds nothing is a hole
    // in fresh air and is not cut.
    //
    // Cached, because a hole does not move about on the aeroplane it is in and
    // the numbers come off the wire as fixed integers.
    this.snapped = new Map();
    this.probe = new THREE.Raycaster();
    this.probeMesh = new Map();
    this.from = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.data = new Float32Array(HOLES_PER * rows * 4);
    this.tex = new THREE.DataTexture(this.data, HOLES_PER, rows, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.uniform = { value: this.tex };
    this.mats = new Map();
    this.n = 0;
    this.count = 0;
    this.dirty = false;
  }

  begin() { this.n = 0; this.count = 0; }

  /** A material that cuts this field's holes; see holedMaterial. */
  material(mat) {
    if (Array.isArray(mat)) return mat.map((q) => holedMaterial(q, this));
    return holedMaterial(mat, this);
  }

  /** Where hole `i` of row `row` is and how big, for anything that wants to look. */
  hole(row, i) {
    const o = (row * HOLES_PER + i) * 4;
    if (row < 0 || i >= HOLES_PER || this.data[o + 3] <= 0) return null;
    return { x: this.data[o], y: this.data[o + 1], z: this.data[o + 2], r: this.data[o + 3] };
  }

  /**
   * Where a hole really is on this model, and which way that piece of her
   * faces. Null when the ray finds no aeroplane there.
   */
  snap(key, geo, h, span, cy = 0) {
    if (!geo) return null;
    const id = `${key}|${h.k}|${h.x}|${h.y}|${h.z}`;
    if (this.snapped.has(id)) return this.snapped.get(id);
    let probe = this.probeMesh.get(geo);
    if (!probe) {
      // Never added to the scene and never drawn: it exists to be cast at.
      probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      probe.updateMatrixWorld(true);
      this.probeMesh.set(geo, probe);
    }
    const len = span * 0.72;
    const px = h.x * span * 0.5;
    const py = cy + h.y * span * 0.30;
    const pz = h.z * len * 0.5;
    // In at her from outside. A wing and a tailplane are found from above or
    // below, a fuselage from the side -- which is also the direction the round
    // came from, so the hole ends up on the side it went in.
    const flat = h.k === 'wings' || h.k === 'tail';
    const reach = span * 1.2;
    if (flat) this.dir.set(0, py >= cy ? -1 : 1, 0);
    else this.dir.set(px >= 0 ? -1 : 1, 0, 0);
    this.probe.far = reach * 2.4;
    // The point itself first, and then round about it.
    //
    // A part box is a box: the wing box runs the whole span and a good deal of
    // the length, and most of a box is not aeroplane -- a ray straight down at
    // a point taken in one found nothing about four times in five, so four
    // holes in five were thrown away and a machine that had been shot to
    // pieces came out of the flak with two marks on her. Searching out from
    // the intended point instead puts the hole on the nearest piece of her
    // there actually is, which is what the box was always trying to say.
    // Out to about a quarter of her span and no further. Past that the nearest
    // piece of aeroplane is not the piece the round went through, and a hole
    // half a span from where it belongs is worse than no hole at all.
    const RINGS = [0, 0.05, 0.11, 0.18, 0.26];
    for (const ring of RINGS) {
      const tries = ring === 0 ? 1 : 8;
      for (let t = 0; t < tries; t++) {
        const a = (t / Math.max(1, tries)) * Math.PI * 2;
        const ox = ring * span * Math.cos(a);
        const oz = ring * span * Math.sin(a);
        // Offset across the two axes the ray is not travelling along.
        if (flat) this.from.set(px + ox, py >= cy ? cy + reach : cy - reach, pz + oz);
        else this.from.set(px >= 0 ? reach : -reach, py + ox * 0.5, pz + oz);
        this.probe.set(this.from, this.dir);
        const hits = this.probe.intersectObject(probe, false);
        const hit = hits[0];
        if (hit && hit.face) {
          const out = {
            p: hit.point.clone(), n: hit.face.normal.clone(), mid: hit.point.clone(), through: 0,
          };
          // A wing or a tailplane is two skins a hand's breadth apart, and a
          // round goes through both. The hole is cut about a point between
          // them and is at least deep enough to open each: you see sky
          // through it.
          const far = hits.find((q) => q.distance > hit.distance + 0.01);
          if (flat && far && far.distance - hit.distance < 0.9) {
            out.mid.lerp(far.point, 0.5);
            out.through = (far.distance - hit.distance) * 0.5;
          }
          this.snapped.set(id, out);
          return out;
        }
      }
    }
    this.snapped.set(id, null);
    return null;
  }

  /**
   * Put one aeroplane's holes in the field, and say which row they are in --
   * or -1 when she has none to cut.
   *
   * `holes` is the unpacked list off the wire: which part, where on it, and how
   * big. `turn` rotates the list, so the second machine of a formation carries
   * a different set from the leader's rather than the same aeroplane drawn
   * twice. `body` is not needed to cut a hole -- the hole is in her own frame
   * and goes where she goes -- and is kept so callers need not change.
   */
  on(body, holes, span, turn = 0, geo = null, key = '', segOf = null, cut = 0, cy = 0) {
    if (!holes || !holes.length || this.n >= this.rows) return -1;
    const row = this.n;
    let k = 0;
    for (let i = 0; i < holes.length && k < HOLES_PER; i++) {
      const h = holes[(i + turn) % holes.length];
      const at = this.snap(key, geo, h, span, cy);
      // No aeroplane there. A hole in fresh air is worse than no hole.
      if (!at) continue;
      // Nor in a piece of her that is not there any more.
      if (cut && segOf && segGone(segOf(at.p.x, at.p.y, at.p.z), cut)) continue;
      // About the size of what made it, torn a little round the edge -- a
      // hole, not a crater: drawn at twice the size of the round they read as
      // pieces missing from her, and the camera is close enough now to see
      // the difference. Through a wing it is still just deep enough to open
      // both skins, so there is sky through it.
      const r = Math.max(0.07, h.r * 0.6, at.through * 1.4);
      const o = (row * HOLES_PER + k) * 4;
      this.data[o] = at.mid.x;
      this.data[o + 1] = at.mid.y;
      this.data[o + 2] = at.mid.z;
      this.data[o + 3] = r;
      k++;
    }
    if (!k) return -1;
    if (k < HOLES_PER) this.data[(row * HOLES_PER + k) * 4 + 3] = 0;
    this.n++;
    this.count += k;
    this.dirty = true;
    return row;
  }

  end() {
    if (this.dirty) this.tex.needsUpdate = true;
    this.dirty = false;
  }
}

/** Give an instanced batch the attribute that says which row of holes each instance cuts. */
export function holeRows(mesh, max) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-1), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('holeRow', attr);
  return attr;
}

/**
 * A geometry of its own that shares another's buffers: so an instanced batch
 * can carry an attribute of its own without it landing on every other mesh
 * drawn from the same pieces.
 */
function shareGeometry(geo) {
  const g = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(geo.attributes)) g.setAttribute(k, v);
  g.setIndex(geo.index);
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  g.boundingSphere = geo.boundingSphere;
  return g;
}

export class Flights {
  constructor(scene, max = 72) {
    this.max = max;
    this.models = flightModels();
    this.batches = {};
    // Every hole in every aeroplane in the sky, cut out of her skin.
    this.holes = new HoleField(scene);
    const batch = (geo, mats, holed = false) => {
      // A list of materials is drawn group by group, and a geometry with no
      // groups under a list is drawn as nothing at all.
      let mat = Array.isArray(mats) && !geo.groups.length ? mats[0] : mats;
      // Her skin is cut where she has been hit; her moving parts are not.
      if (holed) {
        geo = shareGeometry(geo);
        mat = this.holes.material(mat);
      }
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      if (holed) mesh.userData.holeRow = holeRows(mesh, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      // Nothing in the air yet. An instanced mesh is born with identity
      // matrices -- every aeroplane it can hold stacked at the origin at full
      // size -- so the count goes to nought before it is ever drawn.
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    };
    for (const [key, model] of Object.entries(this.models)) {
      // One batch per piece of her: a squadron with a wing shot off one of its
      // machines is the same handful of draw calls as a whole one, the piece
      // simply left out of that machine.
      const segs = {};
      for (const [name, { geo, mats }] of Object.entries(model.segs)) {
        segs[name] = { mesh: batch(geo, mats, true), n: 0, center: centroidOf(geo) };
      }
      // One batch per moving part as well, drawn at whatever angle that part
      // is at on each aeroplane: a squadron with her bays open is the same
      // number of draw calls as a squadron with them shut.
      const moving = (model.parts || []).map((sp) => ({ spec: sp, mesh: batch(sp.geo, sp.mats), n: 0 }));
      this.batches[key] = {
        // The body is the batch every machine of the type is in, whatever she
        // has lost: what anything asking for "her batch" is given.
        mesh: segs.body.mesh,
        segs, parts: moving, probe: model.probe, segOf: model.segOf, cy: model.cy || 0,
        ...tipsOf(key, model.probe),
      };
    }
    this.part = new THREE.Matrix4();
    this.hinge = new THREE.Matrix4();
    this.slide = new THREE.Matrix4();
    this.spin = new THREE.Quaternion();
    this.turret = new THREE.Euler();
    this.axis = new THREE.Vector3();
    this.dummy = new THREE.Object3D();
    // Yaw, then pitch, then roll -- which is how an aeroplane's attitude is
    // built and the only order in which it means anything.
    //
    // Left at the default, the pitch was applied about the world's own X axis
    // *before* the heading, so it only did anything at all to an aeroplane
    // flying due north or due south. On any other heading it went into the
    // yaw and vanished: a dive bomber going down at fifty degrees on an
    // easterly heading was drawn dead level, and so was everything else in
    // the game that was not pointed at the top of the chart.
    this.dummy.rotation.order = 'YXZ';
    // The world matrix of each machine the last `add` or `one` put up, for
    // what is drawn on them afterwards: trails off their tips, flashes at
    // their guns.
    this.slotM = SLOTS.map(() => new THREE.Matrix4());
    this.slotN = 0;
  }

  /** Her wingtips and her engine, in her own frame: where her trails come off. */
  tips(kind) {
    const b = this.batches[kind];
    return b ? { tips: b.tips, nose: b.nose } : null;
  }

  /** Where on her each piece of this type breaks away, in her own frame. */
  breaks(kind) { return breaksOf(this.models, kind); }

  /** The middle of one piece of this type, in her own frame: what it tumbles about. */
  centerOf(kind, name) {
    const b = this.batches[kind];
    if (!b) return null;
    if (b.segs[name]) return b.segs[name].center;
    const q = b.parts.find((p) => p.spec.name === name);
    return q ? q.spec.at : null;
  }

  /**
   * Draw one aeroplane's moving parts at the attitude her trim says they are
   * in: `bay` is how far the doors are open, 0 shut to 1 wide; `fall` is how
   * far the weapon has dropped clear of her, or null while it is still on the
   * rack; `gear` is her legs, 0 down to 1 up, and up unless she says.
   */
  trimParts(b, body, trim, cut = 0) {
    if (!b.parts.length) return;
    const bay = trim && trim.bay ? Math.max(0, Math.min(1, trim.bay)) : 0;
    const fall = trim && trim.fall !== undefined && trim.fall !== null ? trim.fall : null;
    const turn = trim && trim.prop ? trim.prop : 0;
    const gear = trim && trim.gear !== undefined ? Math.max(0, Math.min(1, trim.gear)) : 1;
    for (const q of b.parts) {
      if (q.n >= this.max) continue;
      if (segGone(q.spec.name, cut)) continue;
      // A weapon that has gone is not drawn at all, and once it is clear of
      // her the simulation's own bomb or torpedo has taken it over.
      if (q.spec.fall && fall !== null && fall > 3.5) continue;
      // And a bomb that has been handed to the bombs in the air is the one
      // falling: the one on the rack goes the same instant, or she is drawn
      // twice -- once leaving and once still hanging in the bay.
      if (q.spec.fall && trim && trim.handed) continue;
      this.axis.set(q.spec.axis === 'x' ? 1 : 0, q.spec.axis === 'y' ? 1 : 0,
        q.spec.axis === 'z' ? 1 : 0);
      // An airscrew is wound on rather than swung open: the angle is where it
      // has got to, and it goes round faster the faster she is going. A leg
      // is swung up on its hinge as far as it has got.
      let ang = q.spec.open * bay;
      let tuck = 0;
      let slide = 0;
      if (q.spec.spin) ang = turn;
      else if (q.spec.gear) {
        // Up, with the doors shut over it: not drawn. See planekit's gearRig.
        if (gear >= 0.985) continue;
        const e = gear * gear * (3 - 2 * gear);
        ang = q.spec.open * e;
        tuck = (q.spec.tuck || 0) * e;
        slide = (q.spec.slide || 0) * e;
      }
      if (q.spec.turret) {
        // A gun on a mounting: round in azimuth about her vertical, then up
        // in elevation, at whatever the gunner has it laid on.
        this.turret.set(trim && trim.gunPitch !== undefined ? trim.gunPitch : 0.25,
          trim && trim.gunYaw ? trim.gunYaw : 0, 0, 'YXZ');
        this.spin.setFromEuler(this.turret);
      } else this.spin.setFromAxisAngle(this.axis, ang);
      this.hinge.makeRotationFromQuaternion(this.spin);
      this.part.makeRotationFromQuaternion(q.spec.rot).multiply(this.hinge);
      this.part.setPosition(q.spec.at);
      if (tuck) this.part.elements[13] += tuck;
      if (slide) this.part.elements[q.spec.axis === 'z' ? 12 : 14] += slide;
      if (q.spec.fall && fall !== null) {
        // Straight down and a little astern, the way a weapon leaves.
        this.slide.makeTranslation(0, -fall, -fall * 0.18);
        this.part.premultiply(this.slide);
      }
      this.part.premultiply(body);
      q.mesh.setMatrixAt(q.n++, this.part);
    }
  }

  /**
   * Put one aeroplane's pieces in at `matrix`, less what she has lost, cut
   * with the holes in `row` of the hole field (-1 for none).
   */
  body(b, matrix, cut = 0, row = -1) {
    for (const [name, sg] of Object.entries(b.segs)) {
      if (sg.n >= this.max) continue;
      if (segGone(name, cut)) continue;
      const rows = sg.mesh.userData.holeRow;
      if (rows) rows.array[sg.n] = row;
      sg.mesh.setMatrixAt(sg.n++, matrix);
    }
  }

  begin() {
    for (const b of Object.values(this.batches)) {
      for (const sg of Object.values(b.segs)) sg.n = 0;
      for (const q of b.parts) q.n = 0;
    }
    this.holes.begin();
  }

  /** Put one aeroplane's holes in the field, and say which row; see HoleField. */
  holesOn(body, holes, span, turn = 0, b = null, key = '', cut = 0) {
    if (!b) return -1;
    return this.holes.on(body, holes, span, turn, b.probe, key, b.segOf, cut, b.cy);
  }

  /**
   * Put one flight in the air: `count` aircraft of her type, in formation on
   * the leader's position and course, banked into whatever turn she is in.
   *
   * `cut` is what one of them has lost -- the machine in slot `cutSlot` --
   * and `att`, when it is given, is the leader's whole attitude as a
   * quaternion: the aeroplane under the player's hands, which goes over the
   * top and round in a roll in a way three angles cannot say smoothly.
   *
   * `mask`, when it is given, is which stations are flying, a bit each: a
   * machine lost out of the middle of a formation leaves a gap there, rather
   * than the rest closing up over her while she falls out of the same place.
   */
  add(role, x, y, z, heading, bank, pitch, count, skip = -1, type = null, trim = null,
    holes = null, span = 12, cut = 0, cutSlot = 0, att = null, mask = 0) {
    const key = type && this.batches[type] ? type : (ROLE_TYPE[role] || 'avenger');
    const b = this.batches[key];
    if (!b) return;
    const d = this.dummy;
    const sn = Math.sin(heading);
    const cs = Math.cos(heading);
    this.slotN = 0;
    for (let i = 0; i < SLOTS.length; i++) {
      if (mask ? !((mask >> i) & 1) : i >= count) continue;
      if (i === skip) continue;
      const [sx, sy, sz] = SLOTS[i];
      // The slot is in her own frame: across, down, astern.
      d.position.set(
        x + sn * sz + cs * sx,
        y + sy,
        z + cs * sz - sn * sx,
      );
      if (att && i === 0) d.quaternion.copy(att);
      // Nose up is a negative rotation about her own X axis, the same way a
      // gun's muzzle is raised: passed straight through, every aeroplane in
      // the game was drawn climbing when she was diving and diving when she
      // was climbing.
      else d.rotation.set(-pitch, heading, -bank);
      d.scale.setScalar(1);
      d.updateMatrix();
      // Kept in the order drawn, gaps left out, for whatever wants each
      // machine that is actually there: the bombs off her racks, her trails.
      this.slotM[this.slotN++].copy(d.matrix);
      const c = i === cutSlot ? cut : 0;
      // What has been shot through her, cut out of her. The list is turned
      // one place for each machine, so the wingman is not the leader's holes
      // drawn twice.
      const row = this.holesOn(d.matrix, holes, span, i, b, key, c);
      this.body(b, d.matrix, c, row);
      this.trimParts(b, d.matrix, trim, c);
    }
  }

  /**
   * One aeroplane on her own, at whatever attitude she is in.
   *
   * A formation is a formation; a wreck is an aeroplane going down by herself,
   * end over end, and she needs the whole attitude rather than a slot in
   * somebody's division. Drawn out of the same batch, so she costs nothing.
   */
  one(role, x, y, z, heading, bank, pitch, roll = 0, type = null, trim = null,
    holes = null, span = 12, cut = 0, att = null) {
    const key = type && this.batches[type] ? type : (ROLE_TYPE[role] || 'avenger');
    const b = this.batches[key];
    if (!b) return;
    const d = this.dummy;
    d.position.set(x, y, z);
    if (att) d.quaternion.copy(att);
    else d.rotation.set(-pitch, heading, -bank + roll);
    d.scale.setScalar(1);
    d.updateMatrix();
    this.slotM[0].copy(d.matrix);
    this.slotN = 1;
    const row = this.holesOn(d.matrix, holes, span, 0, b, key, cut);
    this.body(b, d.matrix, cut, row);
    this.trimParts(b, d.matrix, trim, cut);
  }

  /**
   * One piece that has come off an aeroplane -- a wing, a tail, an airscrew --
   * on its own way down, at `matrix`, which places it the way it sat on her.
   */
  piece(type, name, matrix) {
    const b = this.batches[type];
    if (!b) return;
    const sg = b.segs[name];
    if (sg) {
      if (sg.n < this.max) {
        const rows = sg.mesh.userData.holeRow;
        if (rows) rows.array[sg.n] = -1;
        sg.mesh.setMatrixAt(sg.n++, matrix);
      }
      return;
    }
    // A moving part, at its hinge.
    for (const q of b.parts) {
      if (q.spec.name !== name || q.n >= this.max) continue;
      this.part.makeRotationFromQuaternion(q.spec.rot);
      this.part.setPosition(q.spec.at);
      this.part.premultiply(matrix);
      q.mesh.setMatrixAt(q.n++, this.part);
    }
  }

  /**
   * Close the frame: draw the aeroplanes that are in the air and no others.
   *
   * An instanced batch draws every instance it is told it has, whatever is in
   * the matrix -- so a batch built to hold ninety-six machines drew ninety-six
   * of them every frame for the whole action, ninety of them parked twenty
   * kilometres under the sea at a thousandth of their size where nobody could
   * see them and nothing could cull them. `count` is the instanced mesh's own
   * word for how many are real, and it stops the batch at the last aeroplane
   * actually flying.
   */
  end() {
    this.holes.end();
    const close = (q) => {
      q.mesh.count = q.n;
      q.mesh.visible = q.n > 0;
      if (q.n > 0) q.mesh.instanceMatrix.needsUpdate = true;
      if (q.n > 0 && q.mesh.userData.holeRow) q.mesh.userData.holeRow.needsUpdate = true;
    };
    for (const b of Object.values(this.batches)) {
      for (const sg of Object.values(b.segs)) close(sg);
      for (const q of b.parts) close(q);
    }
  }
}
