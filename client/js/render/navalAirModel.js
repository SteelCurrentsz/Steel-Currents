// The Nimitz's air wing, as the game draws it: the F/A-18C Hornet, the E-2D
// Advanced Hawkeye and the SH-60 Seahawk, each off the owner's model of her.
//
// build/naval-air-source.mjs turns each glb into pieces -- her airframe, her
// canopy, her legs, and what turns about its own hub -- painted at every point
// off the model's own textures. This decodes them and puts each together: the
// Hawkeye's two airscrews and the rotodome over her back, which turns slowly
// whenever she is flying; the Seahawk's main and tail rotors; and the legs of
// the two that fold them away.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece } from './sculpt.js';

/** Each kind's data module, fetched by loadNavalAir() and not imported with the game. */
const SOURCES = {
  f18: () => import('./f18Model.data.js').then((m) => [m.F18_PIECES, m.F18_META]),
  e2d: () => import('./e2dModel.data.js').then((m) => [m.E2D_PIECES, m.E2D_META]),
  sh60: () => import('./sh60Model.data.js').then((m) => [m.SH60_PIECES, m.SH60_META]),
};
const PIECES = {};
/** Each kind's measurements -- span, length, hubs -- once loadNavalAir() is in. */
export const NAVAL_AIR = {};
let loading = null;

export function loadNavalAir() {
  loading ||= Promise.all(Object.entries(SOURCES).map(([k, f]) => f().then(([p, m]) => {
    PIECES[k] = p;
    NAVAL_AIR[k] = m;
  }))).catch((e) => { loading = null; throw e; });
  return loading;
}

/** Whether they can be built now, without waiting for anything. */
export function navalAirReady() { return !!(PIECES.f18 && PIECES.e2d && PIECES.sh60); }

const GEOS = {};
function geometries(kind) {
  if (GEOS[kind]) return GEOS[kind];
  GEOS[kind] = {};
  for (const [k, v] of Object.entries(PIECES[kind])) GEOS[kind][k] = decodePiece(v);
  return GEOS[kind];
}

let MATS = null;
function materials() {
  if (MATS) return MATS;
  MATS = {
    skin: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x30353a, shininess: 18 }),
    blades: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x30353a, shininess: 24, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhongMaterial({
      color: 0x6f8794, specular: 0xe6eef2, shininess: 120,
      transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
    }),
    glassSolid: new THREE.MeshPhongMaterial({ color: 0x34444e, specular: 0xd8e2e8, shininess: 110, side: THREE.DoubleSide }),
  };
  // Painted in their own colours: dressPlane leaves them alone.
  for (const m of Object.values(MATS)) m.userData.painted = true;
  return MATS;
}

/**
 * How fast each thing that turns goes against her airscrews' own rate: a
 * rotodome goes round six times a minute, and a helicopter's rotors are
 * wound on at a quarter of an airscrew's pace -- they are long, and a
 * blade's tip goes nearly as fast as a propeller's.
 */
const RATE = { dome: 0.012, rotor: 0.22, tail: 1.1 };

/** How far each kind's legs rise into her as they come up. */
const GEAR_UP = { f18: 1.2, e2d: 1.4 };

/**
 * One of the three, nose +z, wheels on y = 0, her length centred on her
 * origin. `opts.solidGlass` glazes her solid, for a model welded into one.
 * `userData.props` are her turning hubs; `userData.gear(u)` puts her legs
 * down (0) or up (1); `userData.dome` is the Hawkeye's rotodome;
 * `userData.parts` the moving parts in the form a flight model takes them
 * (see planes.js flightModels).
 */
export function navalAirModel(kind, opts = {}) {
  const g = geometries(kind);
  const M = materials();
  const meta = NAVAL_AIR[kind];
  const p = new THREE.Group();
  p.add(new THREE.Mesh(g.body, M.skin));
  if (g.glass) {
    const glass = new THREE.Mesh(g.glass, opts.solidGlass ? M.glassSolid : M.glass);
    glass.renderOrder = 2;
    p.add(glass);
  }
  p.userData.parts = [];
  p.userData.props = meta.spins.map((s) => {
    const hub = new THREE.Group();
    hub.position.fromArray(s.hub);
    hub.add(new THREE.Mesh(g[s.name], M.blades));
    p.add(hub);
    hub.userData.axis = s.axis;
    hub.userData.rate = RATE[s.name] ?? 1;
    p.userData.parts.push({ name: s.name, node: hub, axis: s.axis, open: 0, spin: true, rate: hub.userData.rate });
    if (s.name === 'dome') p.userData.dome = hub;
    return hub;
  });
  p.userData.prop = p.userData.props[0] || null;
  if (g.gear) {
    const legs = new THREE.Group();
    legs.add(new THREE.Mesh(g.gear, M.skin));
    p.add(legs);
    const up = GEAR_UP[kind] || 1;
    p.userData.parts.push({ name: 'gear', node: legs, axis: 'x', open: 0, gear: true, tuck: up });
    p.userData.gear = (u) => {
      const k = Math.max(0, Math.min(1, u));
      legs.position.y = up * k * k * (3 - 2 * k);
      legs.visible = k < 0.985;
    };
  } else p.userData.gear = () => {};
  // Turn whatever turns by `rate` radians of airscrew: each at its own pace.
  p.userData.turn = (rate) => {
    for (const h of p.userData.props) {
      const a = rate * h.userData.rate;
      if (h.userData.axis === 'y') h.rotation.y += a;
      else if (h.userData.axis === 'x') h.rotation.x += a;
      else h.rotation.z += a;
    }
  };
  for (const at of meta.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  p.userData.kind = kind;
  p.userData.span = meta.span;
  p.userData.length = meta.length;
  p.userData.sculpt = true;
  return p;
}
