// Richelieu, drawn from the owner's sculpts of her.
//
// Two hundred and forty-eight metres, forty-seven and a half thousand tonnes
// at full load, eight 380 mm in two quadruple turrets both forward of her
// tower, nine 152 mm in three triple turrets aft and twelve 100 mm in six
// twins about her mack -- on a long, fine hull that made thirty-two knots on
// her trials. As she was completed in 1940, with her two catapults and her
// crane on the quarterdeck a deck under her upper deck.
//
// Her hull and her upperworks -- tower and bridge, mack, after superstructure,
// boats -- are the sculpts (see richelieuHull.js and
// build/prepare-richelieu-hull.mjs), and so are her 380 mm turret, her
// 152 mm turret and her 100 mm mounting. Built here:
//
//   * her two 380 mm turrets, I and II, each the owner's gunhouse on a
//     barbette of its own, its four barrels on a cradle that elevates;
//   * her three 152 mm turrets and her six 100 mm twins, the owner's sculpts,
//     on their barbettes and their platforms;
//   * her light flak: six quadruple Bofors in their tubs and ten single
//     Oerlikons;
//   * her quarterdeck: the two catapults either side of it, which work, each
//     with a Loire 130 on it; the crane right aft that recovered them and the
//     hatch of the hangar under it they were struck down into; the bulkhead
//     at the break of her upper deck, and the ladders up it;
//   * what was on her weather deck: the breakwater on her forecastle, her
//     anchor gear and her anchors, her bollards, her jack and ensign staffs;
//   * her four screws, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline, and starboard is -X.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, tubeX, strip, sheet, ladder } from './shipkit.js';
import { quadBofors, oerlikon } from './usnguns.js';
import { loire } from './planekit.js';
import { RIG, fitCatapults } from './catapult.js';
import {
  buildRichelieuHull, richelieuSeatY, richelieuSurfaceY, MOUNT_SEATS, SCULPT_LINES, richelieuMaterials, gunPiece,
} from './richelieuHull.js';
import { SCREWS } from './richelieuHull.data.js';

const CLS = SHIP_CLASSES.richelieu;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: the blue-grey of the Marine
// nationale over all her upperworks, darker on her decks and her fittings.
const P = {
  steel: 0x8b9399,
  steelDark: 0x5f676d,
  deckSteel: 0x5c6369,
  deckDark: 0x4c5359,
  gun: 0x858d93,
  gunDark: 0x3c4247,
  cave: 0x15181b,
  teak: 0xa0957c,
  armour: 0x4a5158,
  brass: 0x8a7340,
  glass: 0xc9d4da,
  chain: 0x2a2d30,
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
/**
 * The bottom of her keel at station t: the shallower of the two stations
 * either side of it, so that where her run lifts steeply to her screws her
 * insides are fitted over the higher of them and not into the plating
 * between.
 */
export function keelY(t) {
  const f = along(zAt(t));
  const i = Math.floor(f);
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  return Math.max(a, b);
}
/** The deck over her insides at station t: her upper deck, and her quarterdeck abaft the break. */
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
export const deckAt = (z) => richelieuSurfaceY(0, z);
/**
 * How far out her deck goes at z, read off her surface: where her deck stops
 * and her side falls away.
 */
export function deckEdge(z) {
  const deck = deckOver((2 * z) / LOA) - 0.4;
  let x = 0;
  while (x < BEAM && richelieuSurfaceY(x + 0.1, z) > deck && richelieuSurfaceY(-x - 0.1, z) > deck) x += 0.1;
  return x;
}

// Her two weather decks: her upper deck, level from her stern turrets to her
// forward turret and rising from there to her stem, and her quarterdeck, a
// deck lower abaft the bulkhead at the break.
const UD = MOUNT_SEATS.upperDeck;
const QD = MOUNT_SEATS.quarterdeck;
export const BREAK_Z = MOUNT_SEATS.breakZ;

// ------------------------------------------------------------ the shapes --

/** A rail athwartships: stanchions and three courses of wire from x0 to x1. */
function railX(g, m, x0, x1, z, y, h = 1.0) {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 2.2));
  for (let i = 0; i <= n; i++) cyl(g, m, 0.045, 0.045, h, x0 + ((x1 - x0) * i) / n, y + h / 2, z, 5);
  for (const f of [0.38, 0.7, 1.0]) box(g, m, Math.abs(x1 - x0), 0.05, 0.05, (x0 + x1) / 2, y + h * f, z);
}

/** A spar from a to b. */
function spar(g, m, a, b, r0, r1 = r0, seg = 8) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const s = cyl(g, m, r1, r0, len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, seg);
  s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  return s;
}

// ---------------------------------------------------------- main battery --

// Each of her 380 mm turrets trains on a barbette fourteen and a half metres
// across, inside the ring of its own skirt.
const BARBETTE_R = 7.25;

/**
 * One of her 380 mm quadruple turrets, Mle 1935, as the owner sculpted it:
 * the gunhouse trains on its barbette, and its four barrels are on a cradle
 * about trunnions inside the face that lays them.
 */
function threeEighty(g, spec) {
  const piece = gunPiece('main');
  const m = new THREE.Group();
  m.position.set(spec.x, spec.seat, spec.z);
  m.rotation.y = spec.rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = spec.name;
  m.userData.trainRate = CLS.gun.traverse;
  m.add(new THREE.Mesh(piece.house, richelieuMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = MOUNT_SEATS.turrets.map((spec) => threeEighty(g, spec));
  g.userData.turrets = turrets;
  return turrets;
}

/**
 * The barbettes her turrets and her 152 mm train on, from what they stand on
 * up to the ring of each gunhouse.
 */
function barbettes(g) {
  for (const t of MOUNT_SEATS.turrets) {
    const foot = deckOver((2 * t.z) / LOA) - 0.3;
    const top = t.seat - 0.02;
    cyl(g, M.steel, BARBETTE_R, BARBETTE_R, top - foot, t.x, (top + foot) / 2, t.z, 44);
    // The coaming round its foot, where it goes through her deck.
    cyl(g, M.steelDark, BARBETTE_R + 0.2, BARBETTE_R + 0.2, 0.5, t.x, foot + 0.3, t.z, 44);
  }
  for (const s of MOUNT_SEATS.secondary) {
    const foot = richelieuSeatY(s.x, s.z, 1.0) - 0.3;
    const top = s.seat - 0.02;
    cyl(g, M.steel, 3.3, 3.3, top - foot, s.x, (top + foot) / 2, s.z, 30);
  }
}

// ------------------------------------------------- her 152 mm and 100 mm --

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y` on its barbette or platform, faces `rest`, and carries its
 * barrels on a cradle about their trunnions.
 */
function sculpted(g, kind, x, y, z, rest, trainRate) {
  const piece = gunPiece(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, richelieuMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

function secondaries(g) {
  const sec = MOUNT_SEATS.secondary.map((s) => sculpted(g, 'sec', s.x, s.seat, s.z, s.rest, CLS.secondary.traverse));
  g.userData.secMounts = sec;
  return sec;
}

// -------------------------------------------------- the anti-aircraft guns --

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/** A tub the sculpt drew for a light gun, cut out of it down to its floor. */
const cutLight = (m) => MOUNT_SEATS.light.find((l) => Math.abs(l.x - m.x) < 0.05 && Math.abs(l.z - m.z) < 0.05);
/** A 100 mm platform, likewise. */
const dpSeat = (m) => MOUNT_SEATS.dp.find((l) => Math.abs(l.x - m.x) < 0.05 && Math.abs(l.z - m.z) < 0.05);

/**
 * A light gun built in a tub of its own stands its mounting on her own
 * deck, and the tub stays behind: the mounting is lifted off it and trains on
 * its own, and the tub is welded into her.
 */
function offTheTub(g, a, m) {
  const t = a.parent;
  a.removeFromParent();
  a.position.set(t.position.x, t.position.y + a.position.y, t.position.z);
  a.rotation.y = stowed(m);
  g.add(a);
  return a;
}

function mountings(g) {
  const sec = secondaries(g);
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let a;
      if (gun.caliber === 100) {
        const seat = dpSeat(m);
        a = sculpted(g, 'dp', m.x, seat ? seat.seat : richelieuSeatY(m.x, m.z, 2.0), m.z, stowed(m), 0.3);
      } else if (gun.caliber === 40) {
        const cut = cutLight(m);
        const y = cut ? cut.floor : richelieuSeatY(m.x, m.z, 1.2);
        a = offTheTub(g, quadBofors(g, M, m.x, y, m.z, stowed(m), { tubR: 2.3, lockers: [] }), m);
      } else {
        a = offTheTub(g, oerlikon(g, M, m.x, richelieuSeatY(m.x, m.z, 0.6), m.z, stowed(m)), m);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Richelieu built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------- her quarterdeck --
//
// Her aviation was all on her quarterdeck, the last thirty-nine metres of her
// a deck under her upper deck: a catapult either side of it on a turntable at
// its forward end, stowed pointing aft and a little inboard along her side and
// trained out over her quarter to shoot; the hatch of the hangar under it
// between them, which her aircraft were struck down into; and her crane right
// aft on her centreline, which swung them out of it and back aboard out of
// the sea.
export const CAT_X = 8.9;
export const CAT_Z = -95.0;
export const CAT_Y = QD + 1.05;
export const CAT_RIG = {
  ...RIG, BACK: -3.2, FRONT: 18.4, A: 2.0, STROKE: 14.6, REST: 0.12, OUT: -0.92, PLANE_Y: 1.02, PLANE_Z: 0.4,
};
const DECK_RUN = CLS.planes.deckRun;
const HATCH = { hw: 3.2, z0: -107.0, z1: -98.5 };
export const CRANE = { z: -113.6 };

/**
 * Her two catapults: each a turntable on a low pedestal and a girder on it,
 * and a car with a Loire 130 on it -- the cars and the aeroplanes left out of
 * the weld and worked by fitCatapults. Her starboard one is listed first,
 * which is the one she shoots first.
 */
function catapults(g) {
  const cats = [];
  const len = CAT_RIG.FRONT - CAT_RIG.BACK;
  const mid = (CAT_RIG.FRONT + CAT_RIG.BACK) / 2;
  for (const sgn of [-1, 1]) {
    const x = sgn * CAT_X;
    // The pedestal, from her quarterdeck up to the turntable.
    cyl(g, M.steelDark, 1.45, 1.7, CAT_Y - QD + 0.1, x, (CAT_Y + QD) / 2 - 0.05, CAT_Z, 20);
    const cat = new THREE.Group();
    cat.position.set(x, CAT_Y, CAT_Z);
    // Stowed pointing aft: the port one turned in by sgn, so a positive turn
    // of the starboard one is outboard.
    cat.rotation.y = Math.PI + sgn * CAT_RIG.REST;
    cat.userData.dynamic = true;
    g.add(cat);
    cyl(cat, M.steelDark, 1.75, 1.95, 0.45, 0, 0.22, 0, 20);
    // The girder: two rails on a lattice of cross-members, a box beam under
    // them that tapers to its outer end, and the training gear at its foot.
    for (const rail of [-0.62, 0.62]) {
      box(cat, M.steel, 0.26, 0.42, len, rail, 0.72, mid);
      box(cat, M.steelDark, 0.32, 0.12, len, rail, 0.97, mid);
    }
    for (let i = 0; i < Math.floor(len / 1.9); i++) {
      box(cat, M.steel, 1.5, 0.2, 0.26, 0, 0.5, CAT_RIG.BACK + 0.7 + i * 1.9);
    }
    for (let i = 0; i < 8; i++) {
      const br = box(cat, M.steel, 0.14, 0.12, 2.3, 0, 0.36, 2.0 + i * 1.95);
      br.rotation.x = i % 2 ? 0.55 : -0.55;
    }
    box(cat, M.steel, 2.0, 1.1, 2.0, 0, 1.0, CAT_RIG.BACK + 0.8);
    box(cat, M.steelDark, 0.9, 0.7, 0.9, 0, 1.7, CAT_RIG.BACK + 0.8);
    box(cat, M.gunDark, 0.5, 0.45, 0.8, 0, 1.0, CAT_RIG.FRONT - 0.3);
    const car = new THREE.Group();
    car.position.set(0, 0, CAT_RIG.A);
    car.userData.dynamic = true;
    cat.add(car);
    box(car, M.steelDark, 1.7, 0.3, 2.6, 0, 1.12, 0);
    // The cradle her hull sits in: two chocks shaped to her planing bottom.
    for (const dz of [-0.9, 1.1]) box(car, M.gunDark, 1.5, 0.22, 0.36, 0, 1.36, dz);
    const plane = loire(car, 0, CAT_RIG.PLANE_Y + 0.3, CAT_RIG.PLANE_Z, 0, { spin: true });
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn, base: Math.PI });
  }
  g.userData.catapults = cats;
}

/**
 * The hatch of her hangar between her catapults, and her crane right aft on
 * her centreline: a king post on a pedestal, the house that slews on it, and a
 * lattice jib stowed lying forward over the hatch.
 */
function hangarAndCrane(g) {
  const h = HATCH;
  const cz = (h.z0 + h.z1) / 2;
  const y = richelieuSurfaceY(0, cz);
  box(g, M.steelDark, 2 * h.hw + 0.5, 0.42, h.z1 - h.z0 + 0.5, 0, y + 0.18, cz);
  box(g, M.deckSteel, 2 * h.hw, 0.1, h.z1 - h.z0, 0, y + 0.42, cz);
  // The sliding leaves of its cover, and their runners.
  for (let i = 1; i < 4; i++) box(g, M.steelDark, 2 * h.hw, 0.06, 0.12, 0, y + 0.48, h.z0 + (i * (h.z1 - h.z0)) / 4);
  for (const sgn of [-1, 1]) box(g, M.gunDark, 0.18, 0.16, h.z1 - h.z0 + 2.4, sgn * (h.hw + 0.4), y + 0.08, cz);
  const z = CRANE.z;
  const foot = richelieuSurfaceY(0, z);
  cyl(g, M.steelDark, 1.5, 1.7, 0.6, 0, foot + 0.3, z, 18);
  cyl(g, M.steel, 0.75, 0.9, 3.4, 0, foot + 2.3, z, 14);
  const c = new THREE.Group();
  c.position.set(0, foot + 4.0, z);
  g.add(c);
  box(c, M.steel, 2.6, 2.0, 3.2, 0, 1.0, -0.4);
  box(c, M.steelDark, 2.7, 0.12, 3.3, 0, 2.06, -0.4);
  box(c, M.steelDark, 2.2, 1.3, 0.9, 0, 0.8, -2.4);
  // The driver's cab on the roof of the house, looking forward along the jib.
  box(c, M.steel, 1.4, 1.1, 1.2, 0, 2.6, 0.6);
  box(c, M.glass, 1.0, 0.45, 0.06, 0, 2.75, 1.22);
  const heel = [0, 1.4, 1.2];
  const jib = 14.0;
  const el = 0.2;
  const tip = [0, heel[1] + Math.sin(el) * jib, heel[2] + Math.cos(el) * jib];
  for (const bx of [-0.5, 0.5]) {
    spar(c, M.steelDark, [bx, heel[1], heel[2]], [bx * 0.4, tip[1], tip[2]], 0.12, 0.09);
    spar(c, M.steelDark, [bx, heel[1] + 0.6, heel[2]], [bx * 0.4, tip[1] + 0.3, tip[2]], 0.1, 0.08);
  }
  for (let i = 1; i < 9; i++) {
    const f = i / 9;
    const p = [0, heel[1] + (tip[1] - heel[1]) * f, heel[2] + (tip[2] - heel[2]) * f];
    const w = 0.5 * (1 - 0.6 * f);
    box(c, M.steelDark, 2 * w, 0.06, 0.06, 0, p[1], p[2]);
    box(c, M.steelDark, 2 * w, 0.06, 0.06, 0, p[1] + 0.6 - 0.3 * f, p[2]);
  }
  cyl(c, M.gunDark, 0.3, 0.3, 0.3, 0, tip[1] + 0.1, tip[2], 10).rotation.z = Math.PI / 2;
  cyl(c, M.chain, 0.025, 0.025, 2.2, 0, tip[1] - 1.1, tip[2], 4);
  box(c, M.gunDark, 0.3, 0.5, 0.2, 0, tip[1] - 2.3, tip[2]);
  spar(c, M.steelDark, [0, 2.1, -1.6], [0, tip[1] + 0.3, tip[2] - 0.2], 0.035);
  // The jib's rest, a crutch on the hatch coaming that it lies in at sea.
  cyl(g, M.steelDark, 0.12, 0.12, 2.2, 0, foot + 1.1, z + 12.6, 6);
}

/**
 * The break of her upper deck: the bulkhead at its after end, with the doors
 * out on to her quarterdeck in it, a ladder either side up to her upper deck,
 * and a rail along its edge.
 */
function theBreak(g) {
  const z = BREAK_Z;
  const half = deckEdge(z + 0.6) - 0.3;
  for (const sgn of [-1, 1]) {
    // A door either side of her centreline, with its frame and dogs.
    box(g, M.steelDark, 1.0, 1.95, 0.1, sgn * 3.2, QD + 1.0, z - 0.05);
    box(g, M.cave, 0.8, 1.75, 0.04, sgn * 3.2, QD + 0.95, z - 0.11);
    // Scuttles along it.
    for (const x of [6.0, 8.2]) {
      cyl(g, M.cave, 0.2, 0.2, 0.08, sgn * x, QD + 1.7, z - 0.04, 10).rotation.x = Math.PI / 2;
    }
    // The ladder up from her quarterdeck to her upper deck, outboard.
    ladder(g, M.steelDark, sgn * (half - 1.4), QD, UD, z - 2.6, z - 0.1);
    // The rail along the edge of her upper deck, either side of the ladder.
    railX(g, M.steelDark, sgn * 0.6, sgn * (half - 2.2), z + 0.15, UD);
  }
}

// --------------------------------------------------- her weather deck ----

/** A pair of bollards on a bedplate, at (x, z). */
function bollards(g, x, z, ry = 0) {
  const y = richelieuSurfaceY(x, z);
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = ry;
  g.add(b);
  box(b, M.steelDark, 0.7, 0.12, 2.0, 0, 0.0, 0);
  for (const dz of [-0.6, 0.6]) {
    cyl(b, M.steelDark, 0.24, 0.26, 0.7, 0, 0.35, dz, 10);
    cyl(b, M.steelDark, 0.32, 0.32, 0.08, 0, 0.72, dz, 10);
  }
}

/** An anchor, stowed in her hawse with its crown against her side. */
function anchor(g, sgn, z, y) {
  const x = sgn * (shellAt((2 * z) / LOA, y) + 0.12);
  const a = new THREE.Group();
  a.position.set(x, y, z);
  a.rotation.y = sgn * 0.14;
  g.add(a);
  box(a, M.chain, 0.35, 2.6, 0.45, 0, -1.0, 0);
  box(a, M.chain, 0.5, 0.5, 2.3, 0, -2.3, 0);
  for (const dz of [-1, 1]) {
    const f = box(a, M.chain, 0.45, 1.0, 0.6, 0, -1.9, dz * 1.1);
    f.rotation.x = -dz * 0.5;
  }
  cyl(a, M.cave, 0.55, 0.55, 0.12, 0, 0.35, 0, 14).rotation.z = Math.PI / 2;
}

/** Her chain, as a run of links from one point on her deck to another. */
function chain(g, a, b) {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.42));
  const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const z = a[1] + ((b[1] - a[1]) * i) / n;
    box(g, M.chain, i % 2 ? 0.08 : 0.3, i % 2 ? 0.3 : 0.08, 0.46, x, richelieuSurfaceY(x, z) + 0.1, z, ry);
  }
}

// The breakwater on her forecastle, a vee with its apex forward, low enough
// that I's barrels clear it at their lowest; her Oerlikons stand in its lee.
const BREAKWATER = { apex: 89.0, arm: 76.5, hw: 10.0 };

function weatherDeck(g) {
  const { apex, arm: z1, hw } = BREAKWATER;
  for (const sgn of [-1, 1]) {
    const x1 = sgn * hw;
    const len = Math.hypot(x1, apex - z1);
    const cx = x1 / 2;
    const cz = (apex + z1) / 2;
    const yy = richelieuSurfaceY(cx, cz);
    box(g, M.steel, 0.12, 1.3, len, cx, yy + 0.5, cz, Math.atan2(x1, z1 - apex));
    for (let i = 1; i <= 5; i++) {
      const f = i / 6;
      const bx = x1 * f;
      const bz = apex + (z1 - apex) * f;
      const br = box(g, M.steelDark, 0.08, 1.0, 0.9, bx, richelieuSurfaceY(bx, bz) + 0.42, bz - 0.45);
      br.rotation.x = 0.6;
    }
  }
  // Her anchor gear: the capstans her cables come back to, the cables from
  // her hawses, and the cable pipes they go down into her by.
  const gear = [
    { x: -2.4, z: 101.0, hx: -2.8, hz: 111.5 },
    { x: 2.4, z: 101.0, hx: 2.8, hz: 111.5 },
    { x: 0, z: 104.5, hx: 0, hz: 117.5 },
  ];
  for (const k of gear) {
    const y = richelieuSurfaceY(k.x, k.z);
    cyl(g, M.steelDark, 0.95, 1.05, 0.25, k.x, y + 0.12, k.z, 18);
    cyl(g, M.steel, 0.62, 0.7, 0.75, k.x, y + 0.6, k.z, 16);
    cyl(g, M.steelDark, 0.75, 0.75, 0.12, k.x, y + 1.02, k.z, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(g, M.steelDark, 0.08, 0.5, 0.18, k.x + Math.sin(a) * 0.68, y + 0.55, k.z + Math.cos(a) * 0.68, a);
    }
    chain(g, [k.x, k.z + 1.0], [k.hx, k.hz]);
    const hy = richelieuSurfaceY(k.hx, k.hz);
    cyl(g, M.steelDark, 0.6, 0.65, 0.2, k.hx, hy + 0.08, k.hz, 14);
    cyl(g, M.cave, 0.42, 0.42, 0.06, k.hx, hy + 0.19, k.hz, 14);
    const py = richelieuSurfaceY(k.x, k.z - 1.8);
    cyl(g, M.steelDark, 0.45, 0.5, 0.22, k.x, py + 0.08, k.z - 1.8, 12);
  }
  for (const sgn of [-1, 1]) {
    const z = 112.0;
    anchor(g, sgn, z, deckOver((2 * z) / LOA) - 1.4);
  }
  // Bollards along both sides of her, forward and aft, where she was made fast.
  for (const z of [106, 95, 70, 44, -62, -80, -90, -104]) {
    for (const sgn of [-1, 1]) bollards(g, sgn * (deckEdge(z) - 1.0), z);
  }
  // Her capstans aft, for her stern lines, either side of her crane.
  for (const sgn of [-1, 1]) {
    const x = sgn * 3.4;
    const z = -117.5;
    const y = richelieuSurfaceY(x, z);
    cyl(g, M.steelDark, 0.8, 0.9, 0.22, x, y + 0.11, z, 16);
    cyl(g, M.steel, 0.55, 0.62, 0.7, x, y + 0.55, z, 14);
    cyl(g, M.steelDark, 0.66, 0.66, 0.1, x, y + 0.95, z, 14);
  }
  // Her jack staff at her stem and her ensign staff at her stern.
  const stem = 121.5;
  const sy = richelieuSurfaceY(0, stem);
  spar(g, M.steelDark, [0, sy - 0.1, stem], [0, sy + 5.0, stem + 0.4], 0.09, 0.05);
  const stern = -122.6;
  const ty = richelieuSurfaceY(0, stern);
  spar(g, M.steelDark, [0, ty - 0.1, stern], [0, ty + 6.0, stern - 0.6], 0.1, 0.05);
  // Hatches and the skylights over her wardroom.
  for (const [x, z, w, d] of [[0, 92.5, 2.0, 2.4], [-5.0, 66.0, 1.6, 1.6], [5.0, 66.0, 1.6, 1.6],
    [-4.0, -90.0, 1.6, 1.6], [4.0, -90.0, 1.6, 1.6]]) {
    const y = richelieuSurfaceY(x, z);
    box(g, M.steelDark, w, 0.5, d, x, y + 0.2, z);
    box(g, M.steel, w - 0.3, 0.12, d - 0.3, x, y + 0.5, z);
  }
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          330 mm, inclined fifteen degrees with its top outboard,
 *                     from her armour deck to four metres under her waterline,
 *                     from I's barbette to abaft her after magazines
 *   the armour deck   over the citadel, at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her two turrets, 405 mm, down to the armour deck
 */
const CITADEL = [-80.0, 61.5];
const ARMOUR_DECK = 5.4;
const BELT_FOOT = -4.0;
const INCLINE = Math.tan((15 * Math.PI) / 180);

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  // Inside her plating at the top of the belt, and further in the lower it
  // goes: the belt leans out at its top.
  const at = (z, y) => Math.max(0.4, shellAt((2 * z) / LOA, y) - 1.0 - (ARMOUR_DECK - y) * INCLINE);
  const N = 56;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i]) - 0.3;
      const wb = at(z, ys[i + 1]) - 0.3;
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of MOUNT_SEATS.turrets) {
    const top = deckOver((2 * t.z) / LOA) - 0.4;
    inside(cyl(g, M.armour, BARBETTE_R - 0.45, BARBETTE_R - 0.45, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, on the ends of her shafts where the sculpt drew them (see
// prepare-richelieu-hull.mjs): three-bladed, the wing pair forward of the
// inner pair, each handed against its opposite number.
function screws(g) {
  SCREWS.forEach((s) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.5, 0.4, 0.95, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.4, 0.1, 0.75, 0, 0, -0.85, 12).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.6, 0.12, s.r * 1.3,
        Math.sin(a) * s.r * 0.55, Math.cos(a) * s.r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * hub.userData.screw.hand;
    }
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildRichelieuHull],
  ['barbettes', barbettes],
  ['aviation', catapults],
  ['hangar', hangarAndCrane],
  ['break', theBreak],
  ['fittings', weatherDeck],
  ['armour', armour],
  ['screws', screws],
];

export function buildRichelieu() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'richelieu';
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: CAT_Y,
    catX: CAT_X, catZ: CAT_Z, run: DECK_RUN, aero: 'loire',
  });
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function richelieuParts() {
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
