// IJN Musashi, drawn from the owner's sculpts of her.
//
// Yamato's sister: two hundred and sixty-three metres, sixty-five thousand
// tonnes, nine 46 cm guns in three triples behind a belt of 410 mm, and the
// pagoda of a bridge that the class is known by. She keeps all four of her
// 15.5 cm triples -- the two on her centreline and the wing pair abreast her
// tower -- with six 12.7 cm twins round her funnel and twenty-eight triple
// 25 mm about her, clear of the wing turrets' barrels.
//
// Her hull, her superstructure, her bridge, her funnel, her mainmast, her
// catapults and her aircraft crane are the sculpts (see musashiHull.js and
// build/prepare-musashi-hull.mjs). What is built here is everything that
// moves or fires:
//
//   * her three 46 cm turrets, the sculpt's own gunhouses cut free of her,
//     with their barrels turned true along the sculpt's own -- No.1 on her
//     forecastle, No.2 superfiring over it, No.3 on her quarterdeck facing
//     astern -- and the open 25 mm triples on their roofs, which train with
//     them;
//   * her four 15.5 cm triples, the owner's own sculpt of the turret, on the
//     barbettes the superstructure sculpt drew for them -- the centreline
//     pair, and the wing pair on the deckhouses either side between her tower
//     and her funnel;
//   * her six 12.7 cm twins, the owner's sculpt of the mount in its shield, on
//     the columns the superstructure sculpt drew them on;
//   * her 25 mm: in the shields the owner sculpted round her superstructure
//     and right aft, and open on their pedestals forward and aft;
//   * her two catapults, which train out over her quarters and throw a Jake
//     off on the simulation's clock;
//   * her four screws, which turn;
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
import { triple25 } from './ijnguns.js';
import { jake } from './planekit.js';
import { RIG, fitCatapults } from './catapult.js';
import {
  buildMusashiHull, musashiSeatY, musashiSurfaceY, turretPieces, TURRET_PIECES, MOUNT_SEATS,
  SCULPT_LINES, musashiMaterials, gunPiece,
} from './musashiHull.js';
import { SCREWS } from './musashiHull.data.js';

const CLS = SHIP_CLASSES.musashi;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: Kure grey on her guns and her
// fittings.
const P = {
  steel: 0x6a727c,
  steelDark: 0x545b63,
  gun: 0x636b74,
  gunDark: 0x3f454c,
  canvas: 0x8a8a7e,
  armour: 0x4a5158,
  brass: 0x8a7340,
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
/** The deck over her insides at station t: her upper deck, end to end. */
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
export const deckAt = (z) => musashiSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

// Where on each roof the sculpt had an open 25 mm triple: across and along
// the turret's own axis from its pivot, towards its muzzles.
const ROOF_25 = { 'No.1': [[0, -6.4]], 'No.2': [[0, -7.0]], 'No.3': [[-2.6, -6.6], [2.6, -6.6]] };

/**
 * One of her 46 cm/45 Type 94 triples, as the sculpt drew it: the gunhouse is
 * the piece of her the build script's box took out of her, down to the
 * barbette it trains on, so it turns about the middle of that barbette; the
 * barrels are measured off the sculpt and turned true about trunnions inside
 * the face.
 */
function fortySix(g, i) {
  const spec = TURRET_PIECES[i];
  const { house, guns } = turretPieces(i);
  const m = new THREE.Group();
  m.position.set(spec.x, spec.seat, spec.z);
  m.rotation.y = spec.rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.gun.traverse;
  m.add(new THREE.Mesh(house, musashiMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(spec.trunnion[0], spec.trunnion[1], spec.trunnion[2]);
  cradle.rotation.x = -spec.pitch;
  cradle.add(new THREE.Mesh(guns, M.gun));
  // The canvas blast bags where the barrels go through the face.
  for (const [x] of spec.muzzles) {
    cyl(cradle, M.canvas, 0.78, 0.86, 1.2, x, 0, 0.75, 16).rotation.x = Math.PI / 2;
  }
  m.add(cradle);
  arm(m, cradle, spec.muzzles);
  // The open 25 mm on her roof, facing the way she does: it goes round with her.
  for (const [x, z] of ROOF_25[spec.name] || []) {
    const y = roofAt(house, x, z);
    const a = triple25(m, M, x, y, z, 0, false);
    a.userData.rest = 0;
  }
  g.add(m);
  return m;
}

/** The top of a piece at (x, z) in its own frame: the highest point of it near there. */
function roofAt(geo, x, z) {
  const p = geo.attributes.position;
  let top = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i) - x) < 1.2 && Math.abs(p.getZ(i) - z) < 1.2) top = Math.max(top, p.getY(i));
  }
  return Number.isFinite(top) ? top : 3;
}

function mainBattery(g) {
  const turrets = TURRET_PIECES.map((_, i) => fortySix(g, i));
  g.userData.turrets = turrets;
  return turrets;
}

// ------------------------------------------------- the sculpted mountings --

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y` on the deck or barbette, faces `rest`, and carries its barrels
 * on a cradle about their trunnions. `bores` draws the barrels afresh where
 * the decimation left too little of the sculpt's own.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, bores = null) {
  const piece = gunPiece(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, musashiMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  let muzzles = piece.muzzles;
  if (bores) {
    muzzles = piece.muzzles.map(([mx]) => [mx, 0, bores.len]);
    for (const [mx] of piece.muzzles) {
      cyl(cradle, M.gun, bores.r * 0.8, bores.r, bores.len, mx, 0, bores.len / 2, 10).rotation.x = Math.PI / 2;
    }
  }
  m.add(cradle);
  arm(m, cradle, muzzles);
  g.add(m);
  return m;
}

function secondaries(g) {
  const sec = [];
  CLS.secondary.mounts.forEach((spec, i) => {
    const seat = MOUNT_SEATS.secondary[i];
    sec.push(sculpted(g, 'sec6', seat.x, seat.seat, seat.z, seat.rest, CLS.secondary.traverse));
  });
  g.userData.secMounts = sec;
  return sec;
}

// -------------------------------------------------- the anti-aircraft guns --

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

function mountings(g) {
  const sec = secondaries(g);
  const aa = [];
  const lights = lightMounts(CLS);
  let k = 0;
  for (const gun of CLS.aa.guns) {
    gun.mounts.forEach((m, j) => {
      let a;
      if (gun.caliber === 127) {
        const seat = MOUNT_SEATS.dp[j];
        a = sculpted(g, 'sec5', m.x, seat.seat, m.z, stowed(m), 0.28, { r: 0.11, len: 3.6 });
      } else if (m.pod) {
        a = sculpted(g, 'pod', m.x, musashiSeatY(m.x, m.z, 1.0), m.z, stowed(m), 0.9);
      } else {
        a = triple25(g, M, m.x, musashiSeatY(m.x, m.z, 0.8), m.z, stowed(m), false);
        a.rotation.y = stowed(m);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    });
  }
  if (k !== lights.length) throw new Error('the Musashi built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------------ aviation ----

// Her catapults, on her aircraft deck right aft either side of her crane: each
// on a turntable at its after end, raised on a pedestal so its girder clears
// the step up to her quarterdeck forward of it, stowed pointing forward and a
// little outboard, as the sculpt drew them, and trained out over her quarter
// to shoot. A Jake on the car of each.
export const CAT_X = 9.6;
export const CAT_Z = -122.5;
const CAT_Y = 8.0;
export const CAT_RIG = { ...RIG, BACK: -4.2, FRONT: 18.6, A: 1.4, REST: 0.13 };
const DECK_RUN = CLS.planes.deckRun;

function aviation(g) {
  const cats = [];
  for (const sgn of [-1, 1]) {
    const x = sgn * CAT_X;
    const foot = musashiSurfaceY(x, CAT_Z);
    const base = foot > 0 ? foot : 5.3;
    // The pedestal, from her aircraft deck up to the turntable.
    cyl(g, M.steelDark, 1.5, 1.8, CAT_Y - base + 0.2, x, (CAT_Y + base) / 2 - 0.1, CAT_Z, 18);
    const cat = new THREE.Group();
    cat.position.set(x, CAT_Y, CAT_Z);
    cat.rotation.y = sgn * CAT_RIG.REST;
    cat.userData.dynamic = true;
    g.add(cat);
    const len = CAT_RIG.FRONT - CAT_RIG.BACK;
    const mid = (CAT_RIG.FRONT + CAT_RIG.BACK) / 2;
    cyl(cat, M.steelDark, 1.9, 2.1, 0.6, 0, 0.3, 0, 18);
    for (const rail of [-0.75, 0.75]) {
      box(cat, M.steel, 0.3, 0.5, len, rail, 1.05, mid);
      box(cat, M.steelDark, 0.36, 0.14, len, rail, 1.36, mid);
    }
    for (let i = 0; i < Math.floor(len / 1.95); i++) {
      box(cat, M.steel, 1.8, 0.24, 0.3, 0, 0.75, CAT_RIG.BACK + 0.8 + i * 1.95);
    }
    for (let i = 0; i < 7; i++) {
      const br = box(cat, M.steel, 0.16, 0.14, 2.4, 0, 0.55, 4.5 + i * 2.0);
      br.rotation.x = i % 2 ? 0.6 : -0.6;
    }
    box(cat, M.steel, 2.2, 1.2, 2.2, 0, 1.25, CAT_RIG.BACK + 0.9);
    box(cat, M.steelDark, 1.0, 0.8, 1.0, 0, 2.0, CAT_RIG.BACK + 0.9);
    const car = new THREE.Group();
    car.position.set(0, 0, CAT_RIG.A);
    car.userData.dynamic = true;
    cat.add(car);
    box(car, M.steelDark, 1.9, 0.4, 1.9, 0, 1.75, 0);
    box(car, M.steel, 2.0, 0.24, 0.5, 0, 1.5, -0.9);
    const plane = jake(car, 0, CAT_RIG.PLANE_Y, CAT_RIG.PLANE_Z, 0, false, { spin: true });
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn });
  }
  g.userData.catapults = cats;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          410 mm, inclined twenty degrees, top outboard, from her
 *                     armour deck down to the lower belt that runs on to her
 *                     bottom
 *   the armour deck   200 mm over the citadel
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her three turrets, 560 mm, down to the armour deck
 */
const CITADEL = [-74, 66];
const ARMOUR_DECK = 3.6;
const BELT_FOOT = -7.0;
const BARBETTE_R = 7.0;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 56;
  const [z0, z1] = CITADEL;
  const rake = Math.tan((20 * Math.PI) / 180) * (ARMOUR_DECK - BELT_FOOT);
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 1.2), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 1.2 + rake * 0.4), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.2 + rake * 0.4), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 1.2), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.2), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.5), wb = at(z, ys[i + 1], 1.5);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of TURRET_PIECES) {
    const top = deckOver((2 * t.z) / LOA) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, on the ends of her shafts where the sculpt drew them (see
// prepare-musashi-hull.mjs): four-bladed, five metres across, and handed.
function screws(g) {
  for (const s of SCREWS) {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.6, 0.45, 1.1, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.45, 0.12, 0.8, 0, 0, -0.9, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.55, 0.12, s.r * 1.4,
        Math.sin(a) * s.r * 0.55, Math.cos(a) * s.r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * Math.sign(s.x);
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildMusashiHull],
  ['aviation', aviation],
  ['armour', armour],
  ['screws', screws],
];

export function buildMusashi() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'musashi';
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: CAT_Y,
    catX: CAT_X, catZ: CAT_Z, run: DECK_RUN, aero: 'jake',
  });
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function musashiParts() {
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
