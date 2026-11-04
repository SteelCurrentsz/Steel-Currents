// RF Sovetsky Soyuz, drawn from the owner's model of her.
//
// The name ship of Project 23, the Soviet Union's answer to every battleship
// the treaties had held back: two hundred and seventy metres, nine 406 mm in
// three triples -- A and B forward, B superfiring, C aft -- twelve 152 mm in
// six twin turrets round her superstructure, 100 mm twins abreast her after
// funnel and 37 mm along her deck. Laid down at Leningrad in July 1938; the
// war found her a fifth built, and she never left the slip.
//
// Her hull and superstructure are the model (see soyuzHull.js and
// build/prepare-soyuz-hull.mjs); every one of her guns is the model's own.
// What is built here is everything that moves or fires:
//
//   * her three 406 mm triples, the model's gunhouses on their barbettes,
//     their barrels on a cradle that elevates -- A and B forward, B
//     superfiring; C aft, facing astern;
//   * her six 152 mm twins, three a side, two abreast her tower facing
//     forward and one abreast her after funnel facing aft;
//   * her four 100 mm twins and her eight 37 mm;
//   * her three screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { RIG, fitCatapults } from './catapult.js';
import { kor1 } from './planekit.js';
import {
  buildSoyuzHull, soyuzSurfaceY, MOUNT_SEATS, SCULPT_LINES, soyuzMaterials, gunPiece,
} from './soyuzHull.js';
import { SCREWS } from './soyuzHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.soyuz;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

const P = {
  armour: 0x4a5158,
  steelDark: 0x5a6168,
  gunDark: 0x40464c,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

const L = SCULPT_LINES;
const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
const lerp = (arr, f) => {
  const i = Math.floor(f);
  const u = f - i;
  return arr[i] * (1 - u) + arr[Math.min(arr.length - 1, i + 1)] * u;
};
/** Her station at fraction t of her length, bow +1, as a z. */
export const zAt = (t) => (t * LOA) / 2;
/** The bottom of her keel at station t. */
export function keelY(t) {
  const f = along(zAt(t));
  const i = Math.floor(f);
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  const u = f - i;
  return a * (1 - u) + b * u;
}
/** The deck over her insides at station t. */
export function deckOver(t) {
  return lerp(L.deck, along(zAt(t)));
}
/** How far out from her centreline her side is, at station t and height y. */
export function shellAt(t, y) {
  const f = along(zAt(t));
  const g = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
  const i = Math.floor(f);
  const j = Math.floor(g);
  const u = f - i;
  const v = g - j;
  const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v)
    + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
/** Her lines, for the interior and the tests. */
export const LINES = { loa: LOA, sheer: deckOver, keelY, shellAt, zAt };
const INNER_BOTTOM = 0.15;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => soyuzSurfaceY(0, z);

// ---------------------------------------------------------------- guns ----

/**
 * A mounting off the owner's model of it (see gunPiece): what trains stands
 * at `y`, faces `rest`, and carries its barrels on a cradle about their
 * trunnions, laid back at the elevation the model stowed them at.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, name) {
  const piece = gunPiece(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  if (name) m.userData.name = name;
  // Drawn from both sides: a shield is a sheet seen from behind as often as
  // in front.
  m.add(new THREE.Mesh(piece.house, soyuzMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  cradle.add(new THREE.Mesh(piece.guns, soyuzMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/** The seat the build measured for a mounting of her datasheet, by where it is. */
function seatFor(list, x, z, what) {
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > 0.6) throw new Error(`the Sovetsky Soyuz has a ${what} at ${x}, ${z} her model does not`);
  return best;
}

function mainBattery(g) {
  const turrets = CLS.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.main, t.x, t.z, 'turret');
    return sculpted(g, 'main', s.x, s.y, s.z, t.angle, CLS.gun.traverse, t.name);
  });
  g.userData.turrets = turrets;
  return turrets;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

function mountings(g) {
  const sec = CLS.secondary.mounts.map((spec) => {
    const s = seatFor(MOUNT_SEATS.sec, spec.x, spec.z, '152 mm twin');
    const m = sculpted(g, 'sec', s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    const kind = gun.caliber === 100 ? 'dp' : 'aa';
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`);
      const a = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), kind === 'dp' ? 0.3 : 0.7);
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Sovetsky Soyuz built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = [];
  return { sec, aa, torp: [] };
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          420 mm over her magazines and 375 over her machinery,
 *                     from A's barbette to C's, from her armour deck down
 *                     five metres under her waterline
 *   the armour deck   155 mm, at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her three turrets, 425 mm, down to the armour deck
 */
const CITADEL = [-84, 74];
const ARMOUR_DECK = 3.6;
const BELT_FOOT = -5.0;
const BARBETTE_R = 6.0;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 72;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 1.0), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 1.0), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.0), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 1.0), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 56, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.3), wb = at(z, ys[i + 1], 1.3);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of MOUNT_SEATS.main) {
    const top = deckOver((2 * t.z) / LOA) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her three screws, each as the model drew it, on the end of its shaft: the
// wing pair abreast each other and the centre one further aft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], soyuzMaterials().sheet));
    g.add(hub);
  });
}

// ------------------------------------------------------------- catapult ----
//
// Her catapult: the girder the model drew on her quarterdeck, on her
// centreline between No.3 turret and her stern, on a turntable a little aft
// of its middle. It is the model's and stays where the model put it, fore and
// aft; the car on its rails and the KOR-1 on the car are drawn here and worked
// by fitCatapults, which runs the car aft down the girder and throws the
// scout off over her stern.
//
// Measured off the model's girder (build/prepare-soyuz-hull.mjs, group 47):
// the turntable at 121 m abaft her middle, the rails 8.4 m over her
// waterline, and the girder from 107.5 m to 132 m aft.
export const CAT_Z = -121.0;
export const CAT_Y = 8.40;
export const CAT_RIG = {
  // In the turntable's own frame, which faces astern: its after end is ahead.
  ...RIG, BACK: -13.5, FRONT: 10.8, A: -9.0, STROKE: 19.6, REST: 0, OUT: 0, PLANE_Y: 0.45, PLANE_Z: 0,
};

/** The car on her girder, and the KOR-1 on it facing aft over her stern. */
function aviation(g) {
  const cat = new THREE.Group();
  cat.position.set(0, CAT_Y, CAT_Z);
  cat.rotation.y = Math.PI;
  cat.userData.dynamic = true;
  g.add(cat);
  const car = new THREE.Group();
  car.position.set(0, 0, CAT_RIG.A);
  car.userData.dynamic = true;
  cat.add(car);
  // The trolley on the rails, and the cradle her float sits in: a chock under
  // it forward and aft and the arms up to its shoulders.
  box(car, M.gunDark, 1.6, 0.22, 3.0, 0, 0.11, 0);
  for (const cz of [1.0, -1.1]) {
    box(car, M.steelDark, 0.5, 0.24, 0.4, 0, 0.33, cz);
    for (const sx of [-1, 1]) {
      const arm = box(car, M.steelDark, 0.10, 0.55, 0.12, sx * 0.50, 0.45, cz);
      arm.rotation.z = -sx * 0.35;
    }
  }
  const plane = kor1(car, 0, CAT_RIG.PLANE_Y, CAT_RIG.PLANE_Z, 0, { spin: true });
  g.userData.catapults = [{ group: cat, car, plane, prop: plane.userData.prop, sgn: 1, base: Math.PI }];
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildSoyuzHull],
  ['armour', armour],
  ['screws', screws],
  ['aviation', aviation],
];

export function buildSoyuz() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'soyuz';
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: CAT_Y,
    catX: 0, catZ: CAT_Z, run: CLS.planes.deckRun, aero: 'kor1',
  });
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function soyuzParts() {
  const parts = [];
  const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
  for (const [name, build] of builders) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      let moving = false;
      for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
      o.geometry.computeBoundingBox();
      const lb = o.geometry.boundingBox;
      const bb = lb.clone().applyMatrix4(o.matrixWorld);
      parts.push({
        from: name,
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z],
        size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
        moving,
      });
    });
  }
  return parts;
}
