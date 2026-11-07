// The B-25 Mitchell off the owner's Hornet, as the game draws her.
//
// build/b25-source.mjs takes the first of the nine B-25s the model ranges on
// the Hornet's flight deck and turns it into pieces -- her airframe, her
// glass, one airscrew and her three legs -- each painted at every point off
// the model's own textures. This decodes them and puts her together: two
// airscrews on their hubs, and her legs, which come up into her nacelles and
// her nose.
//
// The Doolittle raiders were B-25Bs in olive drab over neutral gray; the
// model's is the J that came after them, with its glazed nose and its
// package guns, in the same paint. She is the only aeroplane in the game that
// cannot come home: she is too big to land on the deck she flew off.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece } from './sculpt.js';

// Fetched by loadB25() -- which loadShips waits on with the other aircraft --
// and not imported with the game.
let PIECES = null;
/** Her measurements -- hubs, span, where her bombs leave her -- once loadB25() is in. */
export let B25 = null;
let loading = null;

/**
 * What she is drawn at, of the model's own size. The model is a B-25J, a
 * metre and a half longer than the B-25Bs Doolittle flew; and at nine-tenths
 * she is a B-25B's length, and sixteen of her range on the Hornet's deck aft
 * of her island without one of them standing in another.
 */
export const B25_SCALE = 0.9;

const scaled = (v) => (Array.isArray(v) ? v.map(scaled) : typeof v === 'number' ? v * B25_SCALE : v);

export function loadB25() {
  loading ||= import('./b25Model.data.js').then((m) => {
    PIECES = m.B25_PIECES;
    B25 = Object.fromEntries(Object.entries(m.B25_META).map(([k, v]) => [k, scaled(v)]));
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** Whether she can be built now, without waiting for anything. */
export function b25Ready() { return !!PIECES; }

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function b25Geometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, v] of Object.entries(PIECES)) GEOS[k] = decodePiece(v).scale(B25_SCALE, B25_SCALE, B25_SCALE);
  return GEOS;
}

let MATS = null;
/** What she is made of: her painted skin, her glass, her airscrews. */
export function b25Materials() {
  if (MATS) return MATS;
  MATS = {
    // Olive drab and neutral gray, flat: the model's textures carry her paint
    // and her markings, and an Army bomber's finish did not shine.
    skin: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x2a2d30, shininess: 14,
    }),
    prop: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x30353a, shininess: 30, side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhongMaterial({
      color: 0x6f8794, specular: 0xe6eef2, shininess: 120,
      transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
    }),
    // Her glass when she flies: welded into one with her and drawn at a
    // distance, where glass reads as dark and shining, not as see-through.
    glassSolid: new THREE.MeshPhongMaterial({
      color: 0x34444e, specular: 0xd8e2e8, shininess: 110, side: THREE.DoubleSide,
    }),
  };
  // Painted in their own colours: dressPlane leaves them alone.
  for (const m of Object.values(MATS)) m.userData.painted = true;
  return MATS;
}

/** How far her legs come up into her, about where they stand. */
const GEAR_UP = 0.9 * B25_SCALE;

/**
 * A whole B-25, nose +z, wheels on y = 0, her length centred on her origin.
 *
 * `opts.solidGlass` glazes her solid, for a model welded into one.
 * `userData.prop` is her port airscrew's hub and `userData.props` both of
 * them, each turning about its own z; `userData.gear(u)` puts her legs down
 * (0) or up (1); `userData.parts` the same, in the form a flight model takes
 * moving parts in (see planes.js flightModels).
 */
export function b25Model(opts = {}) {
  const g = b25Geometries();
  const M = b25Materials();
  const p = new THREE.Group();
  p.add(new THREE.Mesh(g.body, M.skin));
  const glass = new THREE.Mesh(g.glass, opts.solidGlass ? M.glassSolid : M.glass);
  glass.renderOrder = 2;
  p.add(glass);
  p.userData.parts = [];
  p.userData.props = B25.hubs.map((h, i) => {
    const hub = new THREE.Group();
    hub.position.fromArray(h);
    // The starboard one is the port one turned over: a Mitchell's two turned
    // the same way, and the blades are the same blades.
    hub.rotation.z = i * 1.05;
    hub.add(new THREE.Mesh(g.prop, M.prop));
    p.add(hub);
    p.userData.parts.push({ name: i ? 'prop2' : 'prop', node: hub, axis: 'z', open: 0, spin: true });
    return hub;
  });
  p.userData.prop = p.userData.props[0];
  const legs = new THREE.Group();
  legs.add(new THREE.Mesh(g.gear, M.skin));
  p.add(legs);
  p.userData.parts.push({ name: 'gear', node: legs, axis: 'x', open: 0, gear: true, tuck: GEAR_UP });
  p.userData.gear = (u) => {
    const k = Math.max(0, Math.min(1, u));
    legs.position.y = GEAR_UP * k * k * (3 - 2 * k);
    legs.visible = k < 0.985;
  };
  for (const at of B25.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  p.userData.kind = 'mitchell';
  p.userData.span = B25.span;
  p.userData.length = B25.length;
  p.userData.sculpt = true;
  return p;
}
