// The owner's B-29, as the game draws her.
//
// build/b29-source.mjs turns the model into pieces -- her airframe, her
// glass, one airscrew, the two doors of her forward bomb bay and the inside
// of it, and the weapon hanging there -- each painted at every point off the
// model's own textures. This decodes them and puts her together: four
// airscrews on their hubs, the doors on their hinges and the bomb on its
// crutch, so whatever holds her can open the one and let go of the other.
//
// She is a Silverplate machine, which is to say bare metal: no paint, every
// panel the colour the alloy came out of the mill, and polished. The model's
// own textures carry her panel lines and her markings, and the material puts
// the shine back on them.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece } from './sculpt.js';

// Fetched by loadB29() -- which loadShips waits on with the other aircraft
// before a battle or the bomber yard can want her -- and not imported with
// the game: she is a megabyte and a half.
let PIECES = null;
/** Her measurements -- hubs, hinges, where the weapon hangs -- once loadB29() is in. */
export let B29 = null;
let loading = null;

export function loadB29() {
  loading ||= import('./b29Model.data.js').then((m) => {
    PIECES = m.B29_PIECES;
    B29 = m.B29_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** Whether she can be built now, without waiting for anything. */
export function b29Ready() { return !!PIECES; }

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function b29Geometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, v] of Object.entries(PIECES)) {
    GEOS[k] = Array.isArray(v) ? v.map(decodePiece) : decodePiece(v);
  }
  return GEOS;
}

let MATS = null;
/** What she is made of: bare alloy, her glass, and the dark inside of her bay. */
export function b29Materials() {
  if (MATS) return MATS;
  MATS = {
    // Polished alloy. The texture under it is the colour; the specular is
    // what makes a Silverplate machine look like one, high and fairly tight.
    skin: new THREE.MeshPhongMaterial({
      vertexColors: true, color: 0xf2f4f6, specular: 0x8d949b, shininess: 70,
    }),
    // The airscrews: black blades, yellow tips, all in their own paint.
    prop: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x30353a, shininess: 30, side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhongMaterial({
      color: 0x6f8794, specular: 0xe6eef2, shininess: 120,
      transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
    }),
    bay: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    // The weapon is olive drab and black where the model has it so; it is
    // its own paint, not hers.
    bomb: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x2b2f33, shininess: 24 }),
    // Her guns, in their own blued steel.
    gun: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x444a50, shininess: 40 }),
  };
  // Painted in their own colours: dressPlane leaves them alone.
  for (const m of Object.values(MATS)) m.userData.painted = true;
  return MATS;
}

/** How far each door swings open, about its hinge along her belly. */
export const B29_DOOR_OPEN = 1.62;

/**
 * A whole B-29, nose +z, in her own group with the origin at her middle.
 *
 * `userData.props` are her four airscrew hubs, each turning about its own z;
 * `userData.parts` her bay doors (`node`, swung about z by `open` times how
 * far the bay is open); `userData.rack` the crutch the weapon hangs on;
 * `userData.bomb` the weapon itself, as a geometry about its own middle, for
 * whatever draws it falling; `userData.turrets` her five gun positions, each
 * a ring that trains and a cradle that elevates, as every heavy's are (see
 * layTurret), with the arcs `arcs` gives them by name.
 */
export function b29Model(arcs = []) {
  const g = b29Geometries();
  const M = b29Materials();
  const p = new THREE.Group();
  for (const geo of g.body) p.add(new THREE.Mesh(geo, M.skin));
  const glass = new THREE.Mesh(g.glass, M.glass);
  glass.renderOrder = 2;
  p.add(glass);
  p.add(new THREE.Mesh(g.bay, M.bay));
  // Her four airscrews, all the one shape: a Curtiss Electric four-blade,
  // and on a B-29 all four turned the same way.
  p.userData.props = B29.hubs.map((h, i) => {
    const hub = new THREE.Group();
    hub.position.fromArray(h);
    // Each a little round from the last, so the four do not stand in step.
    hub.rotation.z = i * 0.7;
    hub.add(new THREE.Mesh(g.prop, M.prop));
    p.add(hub);
    return hub;
  });
  // The bay doors: each on the hinge along the top of it, so it swings down
  // and out the way a B-29's snap-action doors did.
  p.userData.parts = [];
  for (const [side, name, open] of [['L', 'bayPort', -B29_DOOR_OPEN], ['R', 'bayStbd', B29_DOOR_OPEN]]) {
    const hinge = new THREE.Group();
    hinge.position.fromArray(B29.doors[side]);
    hinge.add(new THREE.Mesh(side === 'L' ? g.doorL : g.doorR, M.skin));
    p.add(hinge);
    p.userData.parts.push({ name, node: hinge, axis: 'z', open });
  }
  // The weapon, on the crutch it hangs from in the bay.
  const cr = new THREE.Group();
  cr.position.fromArray(B29.bomb.at);
  cr.add(new THREE.Mesh(g.bomb, M.bomb));
  p.add(cr);
  p.userData.rack = [cr];
  p.userData.bomb = { geo: g.bomb, mat: M.bomb, len: B29.bomb.len, r: B29.bomb.r };
  // Her guns, on their mountings. Each set of barrels is drawn pointing
  // forward in a ring turned round to point it aft, the way the model has
  // them stowed; and upside down in a ring that is turned over, so that the
  // cradle's elevation lifts them when it is positive -- the sense every
  // gunner in the game lays his guns in.
  const deg = (v, d) => (((v === undefined ? d : v) * Math.PI) / 180);
  p.userData.turrets = B29.guns.map((q, k) => {
    const o = arcs.find((a) => a.name === q.name) || {};
    const ring = new THREE.Group();
    ring.position.fromArray(q.at);
    ring.scale.y = -1;
    ring.rotation.y = Math.PI;
    const cradle = new THREE.Group();
    ring.add(cradle);
    cradle.add(new THREE.Mesh(g.guns[k], M.gun));
    p.add(ring);
    return {
      name: q.name, ring, cradle, home: Math.PI,
      arc: deg(o.arc, 180), up: deg(o.up, 60), down: deg(o.down, 30),
      at: q.at.slice(), r: o.r || 0.5, guns: o.guns || 2,
    };
  });
  p.userData.kind = 'silverplate';
  p.userData.span = 43.05;
  p.userData.length = 30.18;
  p.userData.sculpt = true;
  return p;
}
