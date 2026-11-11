// The Higgins boat -- an LCVP, Landing Craft, Vehicle, Personnel -- drawn
// from the owner's model of her.
//
// Thirty-six feet of plywood on a flat, tunnel-sterned bottom, with a steel
// ramp for a bow. Her coxswain stands aft with a gun cockpit either side of
// him, each with a .30-calibre M1919 Browning on its pintle; everything
// forward of them is the well, where up to thirty-six men stand until the
// ramp goes down on the beach.
//
// Her hull, well, coxswain's station and fittings are the model -- "LCVP
// Higgins boat (1945)" by RedC130, under Creative Commons Attribution 4.0,
// credited on the Credits screen -- in its own colours (see
// build/prepare-higgins-hull.mjs). What is built here is everything that
// moves:
//
//   * her two Brownings, each a yoke that trains and a gun that elevates;
//   * her ramp, hinged across the foot of her bow, which falls forward onto
//     the sand when she is run up on a beach (see rampStep in the
//     simulation) and is wound back up when she comes off; and the two wire
//     cables it is lowered on, paying out from the heads of her bow frames.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up. The model is laid
// with her waterline a metre up, where the sea meets every hull in the game
// (FLOAT_Y in breakers.js).

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import {
  HIGGINS_HULL_B64, HIGGINS_SURFACE, HIGGINS_RAMP, HIGGINS_GUNS, HIGGINS_LINES,
} from './higginsHull.data.js';

const CLS = SHIP_CLASSES.higgins;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
const HALF = LOA / 2;

/** Where the sea meets her, in her own frame. */
export const LIFT = 1.0;

// ------------------------------------------------------------- her lines --

const surface = surfaceOf(HIGGINS_SURFACE);
/** Height of her surface at (x, z), or -99 off her. */
export const higginsSurfaceY = surface.surfaceY;

const L = HIGGINS_LINES;
const clampI = (v, n) => Math.max(0, Math.min(n - 1.0001, v));
const lerp = (arr, f) => {
  const i = Math.floor(f);
  const u = f - i;
  return arr[i] * (1 - u) + arr[Math.min(arr.length - 1, i + 1)] * u;
};
const alongZ = (z) => clampI((z - L.z0) / L.dz, L.nz);
/** Her half-breadth at a station (t = -1 transom, +1 bow) and a height. */
export function shellAt(t, y) {
  const f = alongZ(t * HALF);
  const g = clampI((y - L.y0) / L.dy, L.ny);
  const i = Math.floor(f);
  const j = Math.floor(g);
  const u = f - i;
  const v = g - j;
  const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v)
    + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
/** Her keel, and the top of her sides, at station t. */
export const keelAt = (t) => lerp(L.keel, alongZ(t * HALF));
export const gunwaleAt = (t) => lerp(L.deck, alongZ(t * HALF));

// ------------------------------------------------------------ her paint --

let mats = null;
/**
 * Her materials: everything in the model's own colours, a colour a point,
 * drawn from both sides as the model is (her sides, her ramp and her shields
 * are single sheets).
 */
export function higginsMaterials() {
  if (mats) return mats;
  mats = {
    hull: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x1c2024, shininess: 14, side: THREE.DoubleSide,
    }),
    gun: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x30363c, shininess: 30, side: THREE.DoubleSide,
    }),
    cable: new THREE.MeshLambertMaterial({ color: 0x2a2d30 }),
  };
  // Her paint is her own: dressShip leaves a painted material alone.
  for (const m of Object.values(mats)) m.userData.painted = true;
  return mats;
}

let slices = null;
function hull(g) {
  if (!slices) slices = decodeSlices(HIGGINS_HULL_B64);
  const m = higginsMaterials();
  for (const geo of slices) g.add(new THREE.Mesh(geo, m.hull));
}

const pieces = new Map();
function piece(key, b64) {
  if (!pieces.has(key)) pieces.set(key, decodePiece(b64));
  return pieces.get(key);
}

// ---------------------------------------------------------------- guns ----

/** A Browning as the model drew it, on its yoke in its gun cockpit. */
function browning(g, spec, P, name) {
  const m = new THREE.Group();
  m.position.set(P.seat.x, P.seat.y, P.seat.z);
  // The model's own bearing for it is where it rests.
  m.rotation.y = P.seat.rest;
  m.userData.rest = P.seat.rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.gun.traverse;
  m.userData.name = name;
  m.add(new THREE.Mesh(piece(`house${spec.id}`, P.house), higginsMaterials().gun));
  const cradle = new THREE.Group();
  cradle.position.set(...P.trunnion);
  cradle.add(new THREE.Mesh(piece(`gun${spec.id}`, P.guns), higginsMaterials().gun));
  m.add(cradle);
  arm(m, cradle, P.muzzles);
  g.add(m);
  return m;
}

function guns(g) {
  const turrets = CLS.turrets.map((t) => browning(g, t, HIGGINS_GUNS[t.id], t.name));
  g.userData.turrets = turrets;
  g.userData.secMounts = [];
  g.userData.aaMounts = [];
  g.userData.torpMounts = [];
  return turrets;
}

// ---------------------------------------------------------------- ramp ----

const R = HIGGINS_RAMP;
/** How long it takes to fall, and to be wound back up on its cables. */
const RAMP_FALL = 1.4;
const RAMP_WIND = 4.0;
/** Where each cable is made fast on her bow frames, either side. */
const CABLE_X = 1.2;

/**
 * Her ramp, as the model drew it: hinged across the foot of her bow. The
 * model has it down; up, it is turned about the hinge by `raise`, until it
 * lies along the forward edge of her bow frames.
 */
function ramp(g) {
  const hinge = new THREE.Group();
  hinge.position.set(...R.hinge);
  hinge.userData.dynamic = true;
  hinge.add(new THREE.Mesh(piece('ramp', R.piece), higginsMaterials().hull));
  hinge.rotation.x = R.raise;
  g.add(hinge);
  // Her two cables, from the heads of her bow frames to the lip of the ramp:
  // a unit cylinder each, stretched between the two ends as the ramp moves.
  const cables = [-1, 1].map((s) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), higginsMaterials().cable);
    c.userData.dynamic = true;
    c.userData.side = s;
    g.add(c);
    return c;
  });
  return { hinge, cables };
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** Lay the ramp to how far down it is, 0 up and 1 on the sand, and its cables to it. */
function layRamp(r, f) {
  r.hinge.rotation.x = R.raise * (1 - f);
  // The lip, where the cables are shackled: out along the ramp from its hinge.
  const a = -R.droop - R.raise * (1 - f);       // how far above level the ramp now stands
  const ly = R.hinge[1] + Math.sin(a) * R.reach;
  const lz = R.hinge[2] + Math.cos(a) * R.reach;
  for (const c of r.cables) {
    const x = c.userData.side * CABLE_X;
    _a.set(x, R.head[1], R.head[0]);
    _b.set(x, ly, lz);
    const len = _a.distanceTo(_b);
    c.visible = len > 0.08;
    if (!c.visible) continue;
    c.position.copy(_a).add(_b).multiplyScalar(0.5);
    c.scale.set(1, len, 1);
    c.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize());
  }
}

// ---------------------------------------------------------------- build ----

export function buildHiggins() {
  const g = new THREE.Group();
  hull(g);
  // Her lines, for the sea to keep out of her: at her own sides from her keel
  // to her gunwale, her well included -- it is dry inside her.
  g.userData.lines = {
    loa: LOA, shellAt, keelY: keelAt, sheer: gunwaleAt, zAt: (t) => t * HALF,
  };
  const turrets = guns(g);
  const r = ramp(g);
  mergeMoving(g);
  g.userData.classId = 'higgins';
  // The ramp, laid by the wire's `rp`: falling forward under its own weight
  // when she lets it go, wound back up on its cables when she comes off.
  let f = 0;
  layRamp(r, 0);
  g.userData.ramp = (down, dt) => {
    const want = down ? 1 : 0;
    const was = f;
    const rate = dt / (down ? RAMP_FALL : RAMP_WIND);
    f = want > f ? Math.min(want, f + rate * (0.4 + 1.6 * f)) : Math.max(want, f - rate);
    if (f !== was) layRamp(r, f);
    return f;
  };
  g.userData.rampNode = r.hinge;
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: higginsSurfaceY(0, 0),
    secMounts: [], aaMounts: [], torpMounts: [],
  };
}
