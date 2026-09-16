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
import {
  wildcat, dauntless, avenger, arado, kingfisher, besson,
  zero, suisei, tenzan, jake, muzzlesOf, dressPlane,
} from './planekit.js';

/**
 * Flatten a built model into one geometry with a material group per material.
 *
 * The models are written as a few hundred boxes and cylinders because that is
 * how you write a readable aeroplane. This is what makes them affordable.
 */
/**
 * How many holes are drawn in the whole sky at once.
 *
 * Seventy-two aeroplanes with ten holes apiece is seven hundred and twenty,
 * and most of a sky is undamaged. This is generous and it is one draw call.
 */
export const HOLE_MAX = 640;

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

/** One of each type, in flight trim, welded and ready to instance. */
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
      const at = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      const rot = new THREE.Quaternion().setFromRotationMatrix(node.matrixWorld);
      const base = new THREE.Matrix4().copy(node.matrixWorld).invert();
      const { geo, mats } = weld(node, base);
      node.parent.remove(node);
      parts.push({
        name: spec.name, axis: spec.axis, open: spec.open, fall: spec.fall,
        spin: spec.spin, at, rot, geo, mats,
      });
    }
    out[key] = { ...weld(g), parts };
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
  // And the Japanese four: a Zero, a Suisei, a Tenzan and the Jake the
  // battleships and the cruisers work off their catapults.
  make('zero', (g) => zero(g, 0, 0, 0, 0, false, { gear: false }));
  make('suisei', (g) => suisei(g, 0, 0, 0, 0, false, { gear: false }));
  make('tenzan', (g) => tenzan(g, 0, 0, 0, 0, false, true, { gear: false }));
  make('jake', (g) => jake(g, 0, 0, 0, 0, false, {}));
  return out;
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
  'besson', 'zero', 'suisei', 'tenzan', 'jake']);

/** The machine a flight is: what her ship flies, or what her job takes. */
export function typeOf(type, role) {
  if (type && TYPES.has(type)) return type;
  return ROLE_TYPE[role] || 'avenger';
}

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

/**
 * Where one aeroplane of a flight is, relative to her leader.
 *
 * The same table the formation is drawn from, so a machine that is smoking or
 * going down is smoking or going down in the place she is actually flying
 * rather than at the leader's own position.
 */
export function slotAt(i, heading, out = { x: 0, y: 0, z: 0 }) {
  const [sx, sy, sz] = SLOTS[i % SLOTS.length];
  const sn = Math.sin(heading);
  const cs = Math.cos(heading);
  out.x = sn * sz + cs * sx;
  out.y = sy;
  out.z = cs * sz - sn * sx;
  return out;
}

/**
 * A hole in an aeroplane's skin.
 *
 * Two pieces, because that is what makes it read as a hole rather than as a
 * black sticker: the dark of the inside of her, and a torn lip of bare metal
 * standing proud of the paint round it. The lip is a ring of short petals at
 * irregular lengths -- a clean circle reads as a porthole and a ragged one
 * reads as something a shell did.
 *
 * Built once at unit size and scaled per hole, and drawn as one instanced
 * batch for every aeroplane in the sky: a squadron shot to pieces costs one
 * draw call more than a fresh one.
 */
function holeGeometry() {
  const parts = [];
  // The inside of her, a shade under the lip so the lip always reads.
  const dark = new THREE.CircleGeometry(0.5, 10);
  parts.push({ geo: dark, group: 0 });
  // The torn edge. Eight petals, none the same, each folded a little out of
  // the skin -- which is what the metal actually does when a round goes
  // through it.
  const petals = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = 0.13 + ((i * 7919) % 11) / 11 * 0.17;
    const g = new THREE.PlaneGeometry(0.30, len);
    const m = new THREE.Matrix4();
    m.makeRotationX(-0.55 - ((i * 104729) % 7) / 7 * 0.5);
    m.setPosition(0, 0.5 + len * 0.36, 0.02);
    const r = new THREE.Matrix4().makeRotationZ(a);
    g.applyMatrix4(m);
    g.applyMatrix4(r);
    petals.push(g);
  }
  const lip = mergeGeometries(petals);
  parts.push({ geo: lip, group: 1 });
  return mergeGroups(parts);
}

/** Merge a list of geometries into one, all in the same material group. */
function mergeGeometries(list) {
  const pos = [];
  const nor = [];
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const idx = g.index ? g.index.array : null;
    const put = (i) => {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    };
    if (idx) for (let i = 0; i < idx.length; i++) put(idx[i]);
    else for (let i = 0; i < p.count; i++) put(i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** Two geometries into one, each keeping its own material group. */
function mergeGroups(parts) {
  const flat = parts.map((q) => (q.geo.index ? q.geo.toNonIndexed() : q.geo));
  const merged = mergeGeometries(flat);
  let at = 0;
  flat.forEach((g, i) => {
    const n = g.attributes.position.count;
    merged.addGroup(at, n, i);
    at += n;
  });
  return merged;
}

/**
 * Every hole in every aeroplane a renderer is drawing, in one instanced batch.
 *
 * Holes look the same whatever they are in, so there is no reason for a
 * Wildcat's to be a different draw call from a Lancaster's. A renderer owns one
 * of these, clears it at the top of the frame, stamps a hole for each round
 * that has been through each machine it draws, and publishes the count at the
 * end -- exactly the way the aeroplanes themselves are drawn.
 */
export class HoleField {
  constructor(scene, max = HOLE_MAX) {
    this.max = max;
    // Where each hole actually sits on each aeroplane, worked out once.
    //
    // The part boxes the simulation records a hole in are boxes: a wing runs
    // from wingtip to wingtip and a fuselage is a tube, and a point taken
    // inside one of those is very often not on the aeroplane at all. A hole
    // three quarters of the way out a Wildcat's wing sat where the wing is,
    // and the same number on a Lancaster sat in clear air two metres outboard
    // of hers; a hole in the tail box sat behind the rudder. They floated.
    //
    // So the box says roughly where, and the model itself says exactly where:
    // a ray is cast in at the point from outside her, and the hole is put on
    // the first piece of aeroplane it finds and laid in that surface. A ray
    // that finds nothing is a hole in fresh air and is not drawn.
    //
    // Cached, because a hole does not move about on the aeroplane it is in and
    // the numbers come off the wire as fixed integers.
    this.snapped = new Map();
    this.probe = new THREE.Raycaster();
    this.probeMesh = new Map();
    this.from = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 0, 1);
    this.q = new THREE.Quaternion();
    const mats = [
      // The inside of her: not black, because nothing is, but dark enough that
      // the eye reads it as a way through.
      new THREE.MeshBasicMaterial({ color: 0x0a0b0d, side: THREE.DoubleSide }),
      // Torn metal, bright where the paint has gone off it.
      new THREE.MeshStandardMaterial({
        color: 0x8d9299, roughness: 0.55, metalness: 0.75, side: THREE.DoubleSide,
      }),
    ];
    this.mesh = new THREE.InstancedMesh(holeGeometry(), mats, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.n = 0;
    this.dummy = new THREE.Object3D();
    this.m = new THREE.Matrix4();
  }

  begin() { this.n = 0; }

  /**
   * Put one aeroplane's holes on her.
   *
   * `holes` is the unpacked list off the wire: which part, where on it, and how
   * big. `turn` rotates the list, so the second machine of a formation carries
   * a different set from the leader's rather than the same aeroplane drawn
   * three times.
   *
   * The position comes out of the part box and her span, so a hole in a wing is
   * out on the wing of whatever she happens to be -- one normalised box does
   * for an eleven-metre fighter and a thirty-one-metre bomber.
   */
  /**
   * Where a hole really is on this model, and which way that piece of her
   * faces. Null when the ray finds no aeroplane there.
   */
  snap(key, geo, h, span) {
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
    const py = h.y * span * 0.30;
    const pz = h.z * len * 0.5;
    // In at her from outside. A wing and a tailplane are found from above or
    // below, a fuselage from the side -- which is also the direction the round
    // came from, so the hole ends up on the side it went in.
    const flat = h.k === 'wings' || h.k === 'tail';
    const reach = span * 1.2;
    if (flat) this.dir.set(0, py >= 0 ? -1 : 1, 0);
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
        if (flat) this.from.set(px + ox, py >= 0 ? reach : -reach, pz + oz);
        else this.from.set(px >= 0 ? reach : -reach, py + ox * 0.5, pz + oz);
        this.probe.set(this.from, this.dir);
        const hit = this.probe.intersectObject(probe, false)[0];
        if (hit && hit.face) {
          const out = { p: hit.point.clone(), n: hit.face.normal.clone() };
          this.snapped.set(id, out);
          return out;
        }
      }
    }
    this.snapped.set(id, null);
    return null;
  }

  on(body, holes, span, turn = 0, geo = null, key = '') {
    if (!holes || !holes.length) return;
    const d = this.dummy;
    for (let i = 0; i < holes.length; i++) {
      if (this.n >= this.max) return;
      const h = holes[(i + turn) % holes.length];
      const at = this.snap(key, geo, h, span);
      // No aeroplane there. A hole in fresh air is worse than no hole.
      if (!at) continue;
      d.position.copy(at.p);
      // Laid in the skin rather than squared to her axes: a hole in a wing
      // that has dihedral lies at the dihedral, and one in the round of her
      // fuselage lies on the round. The disc is built facing +z, so this is
      // the rotation that takes +z to the surface normal.
      this.q.setFromUnitVectors(this.up, at.n);
      d.quaternion.copy(this.q);
      // And a whisker proud of it, or it fights with the skin it is in.
      d.position.addScaledVector(at.n, 0.03);
      d.scale.setScalar(Math.max(0.12, h.r));
      d.updateMatrix();
      this.m.copy(d.matrix).premultiply(body);
      this.mesh.setMatrixAt(this.n++, this.m);
    }
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Flights {
  constructor(scene, max = 72) {
    this.max = max;
    this.models = flightModels();
    this.batches = {};
    for (const [key, { geo, mats, parts }] of Object.entries(this.models)) {
      const mesh = new THREE.InstancedMesh(geo, mats, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      // One batch per moving part as well, drawn at whatever angle that part
      // is at on each aeroplane: a squadron with her bays open is the same
      // number of draw calls as a squadron with them shut.
      const moving = (parts || []).map((sp) => {
        const pm = new THREE.InstancedMesh(sp.geo, sp.mats, max);
        pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pm.frustumCulled = false;
        scene.add(pm);
        return { spec: sp, mesh: pm, n: 0 };
      });
      this.batches[key] = { mesh, n: 0, parts: moving };
    }
    // Every hole in every aeroplane in the sky, in one batch.
    this.holes = new HoleField(scene);
    this.part = new THREE.Matrix4();
    this.hinge = new THREE.Matrix4();
    this.slide = new THREE.Matrix4();
    this.spin = new THREE.Quaternion();
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
    // Nothing in the air yet. An instanced mesh is born with identity matrices
    // -- every aeroplane it can hold stacked at the origin at full size -- so
    // the count goes to nought before it is ever drawn.
    for (const key of Object.keys(this.batches)) {
      this.batches[key].mesh.count = 0;
      this.batches[key].mesh.visible = false;
      for (const q of this.batches[key].parts) { q.mesh.count = 0; q.mesh.visible = false; }
    }
  }

  /**
   * Draw one aeroplane's moving parts at the attitude her trim says they are
   * in: `bay` is how far the doors are open, 0 shut to 1 wide; `fall` is how
   * far the weapon has dropped clear of her, or null while it is still on the
   * rack.
   */
  trimParts(b, body, trim) {
    if (!b.parts.length) return;
    const bay = trim && trim.bay ? Math.max(0, Math.min(1, trim.bay)) : 0;
    const fall = trim && trim.fall !== undefined && trim.fall !== null ? trim.fall : null;
    const turn = trim && trim.prop ? trim.prop : 0;
    for (const q of b.parts) {
      if (q.n >= this.max) continue;
      // A weapon that has gone is not drawn at all, and once it is clear of
      // her the simulation's own bomb or torpedo has taken it over.
      if (q.spec.fall && fall !== null && fall > 3.5) continue;
      this.axis.set(q.spec.axis === 'x' ? 1 : 0, q.spec.axis === 'y' ? 1 : 0,
        q.spec.axis === 'z' ? 1 : 0);
      // An airscrew is wound on rather than swung open: the angle is where it
      // has got to, and it goes round faster the faster she is going.
      this.spin.setFromAxisAngle(this.axis, q.spec.spin ? turn : q.spec.open * bay);
      this.hinge.makeRotationFromQuaternion(this.spin);
      this.part.makeRotationFromQuaternion(q.spec.rot).multiply(this.hinge);
      this.part.setPosition(q.spec.at);
      if (q.spec.fall && fall !== null) {
        // Straight down and a little astern, the way a weapon leaves.
        this.slide.makeTranslation(0, -fall, -fall * 0.18);
        this.part.premultiply(this.slide);
      }
      this.part.premultiply(body);
      q.mesh.setMatrixAt(q.n++, this.part);
    }
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
    for (const b of Object.values(this.batches)) {
      b.n = 0;
      for (const q of b.parts) q.n = 0;
    }
    this.holes.begin();
  }

  /** Put one aeroplane's holes on her; see HoleField. */
  holesOn(body, holes, span, turn = 0, b = null, key = '') {
    this.holes.on(body, holes, span, turn, b && b.mesh.geometry, key);
  }

  /**
   * Put one flight in the air: `count` aircraft of her type, in formation on
   * the leader's position and course, banked into whatever turn she is in.
   */
  add(role, x, y, z, heading, bank, pitch, count, skip = -1, type = null, trim = null,
    holes = null, span = 12) {
    const key = type && this.batches[type] ? type : (ROLE_TYPE[role] || 'avenger');
    const b = this.batches[key];
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
      // Nose up is a negative rotation about her own X axis, the same way a
      // gun's muzzle is raised: passed straight through, every aeroplane in
      // the game was drawn climbing when she was diving and diving when she
      // was climbing.
      d.rotation.set(-pitch, heading, -bank);
      d.scale.setScalar(1);
      d.updateMatrix();
      b.mesh.setMatrixAt(b.n++, d.matrix);
      this.trimParts(b, d.matrix, trim);
      // And what has been shot through her. The list is turned one place for
      // each machine, so the wingman is not the leader's holes drawn twice.
      this.holesOn(d.matrix, holes, span, i, b, key);
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
    holes = null, span = 12) {
    const key = type && this.batches[type] ? type : (ROLE_TYPE[role] || 'avenger');
    const b = this.batches[key];
    if (!b || b.n >= this.max) return;
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(-pitch, heading, -bank + roll);
    d.scale.setScalar(1);
    d.updateMatrix();
    b.mesh.setMatrixAt(b.n++, d.matrix);
    this.trimParts(b, d.matrix, trim);
    this.holesOn(d.matrix, holes, span, 0, b, key);
  }

  /**
   * Close the frame: draw the aeroplanes that are in the air and no others.
   *
   * An instanced batch draws every instance it is told it has, whatever is in
   * the matrix -- so a batch built to hold ninety-six machines drew ninety-six
   * of them every frame for the whole action, ninety of them parked twenty
   * kilometres under the sea at a thousandth of their size where nobody could
   * see them and nothing could cull them. Five types of aeroplane, five or six
   * thousand triangles apiece: two and a half million triangles a frame to
   * draw an empty sky, which was three quarters of everything the card was
   * being asked for.
   *
   * `count` is the instanced mesh's own word for how many are real. Setting it
   * costs nothing, changes nothing anybody can see, and stops the batch at the
   * last aeroplane actually flying.
   */
  end() {
    this.holes.end();
    for (const key of Object.keys(this.batches)) {
      const b = this.batches[key];
      b.mesh.count = b.n;
      b.mesh.visible = b.n > 0;
      if (b.n > 0) b.mesh.instanceMatrix.needsUpdate = true;
      for (const q of b.parts) {
        q.mesh.count = q.n;
        q.mesh.visible = q.n > 0;
        if (q.n > 0) q.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
