// KMS Scharnhorst, drawn from the owner's sculpts of her.
//
// Two hundred and thirty-five metres, thirty-eight thousand tonnes at full
// load, nine 28 cm in three triple turrets, twelve 15 cm -- eight in four twin
// turrets and four in single shielded mountings -- on her beam, and her 10.5 cm
// flak, on a hull built for thirty-one knots. As she was in 1943, with the two
// triple banks of torpedo tubes she was given the year before.
//
// Her hull, her bridge and front superstructure and her mid and aft
// superstructure are the sculpts (see scharnhorstHull.js and
// build/prepare-scharnhorst-hull.mjs), and so are her 28 cm turret and her
// 15 cm single; her 15 cm twin turret, her 10.5 cm twin and her tubes are the
// sculpts the Bismarck and the Tirpitz were drawn with (see bismarckHull.js).
// Built here:
//
//   * her three 28 cm turrets, Anton and Bruno forward and Caesar aft, each
//     the owner's gunhouse on a barbette of its own, its three barrels on a
//     cradle that elevates;
//   * her four 15 cm twin turrets on their barbettes and her four 15 cm
//     singles on their pedestals at her deck edge, her seven 10.5 cm twins,
//     four of them on round platforms, her 3.7 cm twins and her 2 cm singles
//     (see kmguns.js) -- all where her plans of 1943 put them;
//   * her two banks of tubes, either side at her deck edge abreast her cranes,
//     which train, and which throw three fish each over her side when they
//     fire, out of three of the four tubes in each;
//   * what was on her weather deck: the breakwater forward of Anton, her
//     anchor gear and her anchors, her bollards, her jack and ensign staffs;
//   * her three screws, which turn;
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
import { box, cyl, strip, sheet } from './shipkit.js';
import { threeSeven, twoCm } from './kmguns.js';
import { gunPiece } from './bismarckHull.js';
import { torpedoBank, fitTubes } from './bismarck.js';
import {
  buildScharnhorstHull, scharnhorstSeatY, scharnhorstSurfaceY, MOUNT_SEATS, SCULPT_LINES, scharnhorstMaterials,
  scharnhorstGun,
} from './scharnhorstHull.js';
import { SCREWS } from './scharnhorstHull.data.js';

const CLS = SHIP_CLASSES.scharnhorst;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: the light grey she wore over her
// upperworks, darker on her decks and her fittings.
const P = {
  steel: 0x9a9fa3,
  steelDark: 0x6c7176,
  deckSteel: 0x5a6066,
  gun: 0x92979b,
  gunDark: 0x3e4349,
  cave: 0x15181b,
  armour: 0x4a5158,
  brass: 0x8a7340,
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
export const deckAt = (z) => scharnhorstSurfaceY(0, z);
/**
 * How far out her deck goes at z, read off her surface: where her deck stops
 * and her side falls away.
 */
export function deckEdge(z) {
  const deck = deckOver((2 * z) / LOA) - 0.4;
  let x = 0;
  while (x < BEAM && scharnhorstSurfaceY(x + 0.1, z) > deck && scharnhorstSurfaceY(-x - 0.1, z) > deck) x += 0.1;
  return x;
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

// Each of her 28 cm turrets trains on a barbette ten and a half metres across,
// inside the ring of its own skirt; her 15 cm twins on barbettes five and a
// half.
const BARBETTE_R = 5.2;
const SEC_BARBETTE_R = 2.75;

/**
 * A mounting off one of the owner's sculpts of it: what trains stands at `y`
 * on its barbette or platform, faces `rest`, and carries its barrels on a
 * cradle about their trunnions. `bores` draws the barrels their own length
 * where the sculpt's are stubs.
 */
function sculpted(g, piece, x, y, z, rest, trainRate, bores = null) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, scharnhorstMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  let muzzles = piece.muzzles;
  if (bores) {
    muzzles = piece.muzzles.map(([mx]) => [mx, 0, bores.len]);
    for (const [mx] of piece.muzzles) {
      cyl(cradle, M.gun, bores.r * 0.8, bores.r, bores.len, mx, 0, bores.len / 2, 10).rotation.x = Math.PI / 2;
      cyl(cradle, M.gunDark, bores.r * 0.95, bores.r * 0.95, 0.22, mx, 0, bores.len - 0.11, 10).rotation.x = Math.PI / 2;
    }
  }
  m.add(cradle);
  arm(m, cradle, muzzles);
  g.add(m);
  return m;
}

/**
 * One of her 28 cm triple turrets, Drh LC/34, as the owner sculpted it: the
 * gunhouse trains on its barbette, and its three barrels are on a cradle
 * about trunnions inside the face that lays them.
 */
function twentyEight(g, spec) {
  const m = sculpted(g, scharnhorstGun('main'), spec.x, spec.seat, spec.z, spec.rest, CLS.gun.traverse);
  m.userData.rest = undefined;
  m.userData.name = spec.name;
  return m;
}

function mainBattery(g) {
  const turrets = MOUNT_SEATS.turrets.map((spec) => twentyEight(g, spec));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes her turrets and her 15 cm twins train on, from her deck up. */
function barbettes(g) {
  for (const t of MOUNT_SEATS.turrets) {
    const foot = deckOver((2 * t.z) / LOA) - 0.3;
    const top = t.seat - 0.02;
    cyl(g, M.steel, BARBETTE_R, BARBETTE_R, top - foot, t.x, (top + foot) / 2, t.z, 40);
    // The coaming round its foot, where it goes through her deck.
    cyl(g, M.steelDark, BARBETTE_R + 0.18, BARBETTE_R + 0.18, 0.5, t.x, foot + 0.3, t.z, 40);
  }
  for (const s of MOUNT_SEATS.secondary) {
    const foot = deckOver((2 * s.z) / LOA) - 0.3;
    const top = s.seat - 0.02;
    cyl(g, M.steel, SEC_BARBETTE_R, SEC_BARBETTE_R, top - foot, s.x, (top + foot) / 2, s.z, 28);
  }
}

/**
 * The round platforms her 10.5 cm stand on abreast her bridge and by her
 * cranes, a hand over her deck: a low drum with a steel deck on it and a
 * coaming round its edge.
 */
const TUB_R = 3.0;
function flakPlatforms(g) {
  for (const f of MOUNT_SEATS.flak) {
    if (!f.tub) continue;
    const foot = deckOver((2 * f.z) / LOA) - 0.3;
    const top = f.seat - 0.02;
    cyl(g, M.steel, TUB_R, TUB_R + 0.1, top - foot, f.x, (top + foot) / 2, f.z, 32);
    cyl(g, M.deckSteel, TUB_R - 0.05, TUB_R - 0.05, 0.04, f.x, top + 0.01, f.z, 32);
    cyl(g, M.steelDark, TUB_R + 0.04, TUB_R + 0.04, 0.12, f.x, top + 0.06, f.z, 32);
  }
}

// ------------------------------------------- her 15 cm, flak and tubes ----

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/** Where a light gun stands: on the floor of the tub it was cut out of, or on her surface round it. */
function lightSeat(m, r) {
  const cut = MOUNT_SEATS.sculptedLight.find((l) => Math.abs(l.x - m.x) < 0.05 && Math.abs(l.z - m.z) < 0.05);
  if (cut) return cut.deck;
  const flak = MOUNT_SEATS.flak.find((l) => Math.abs(l.x - m.x) < 0.05 && Math.abs(l.z - m.z) < 0.05);
  if (flak) return flak.seat;
  return scharnhorstSeatY(m.x, m.z, r);
}

function mountings(g) {
  // Her 15 cm, in the order her datasheet lists them: the twins, then the
  // singles.
  const sec = [
    ...MOUNT_SEATS.secondary.map((s) => sculpted(g, gunPiece('sec'), s.x, s.seat, s.z, s.rest, CLS.secondary.traverse)),
    ...MOUNT_SEATS.singles.map((s) => sculpted(g, scharnhorstGun('single'), s.x, s.seat, s.z, s.rest, CLS.secondary.traverse)),
  ];
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let a;
      if (gun.caliber === 105) {
        a = sculpted(g, gunPiece('flak'), m.x, lightSeat(m, 2.0), m.z, stowed(m), 0.3, { r: 0.075, len: 4.8 });
      } else if (gun.caliber === 37) {
        a = threeSeven(g, M, m.x, lightSeat(m, 0.8), m.z, stowed(m));
      } else {
        a = twoCm(g, M, m.x, lightSeat(m, 0.7), m.z, stowed(m), m.guns === 4);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Scharnhorst built a light battery her datasheet does not list');
  const T = CLS.torpedoes;
  const torp = T.mounts.map((spec) => torpedoBank(g, spec, T.traverse, scharnhorstSeatY));
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

// --------------------------------------------------- her weather deck ----

/** A pair of bollards on a bedplate, at (x, z). */
function bollards(g, x, z, ry = 0) {
  const y = scharnhorstSurfaceY(x, z);
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
  // Lying flat to her side, which flares out over it at her Atlantic bow.
  a.rotation.y = sgn * 0.14;
  a.rotation.z = -sgn * 0.12;
  g.add(a);
  box(a, M.chain, 0.35, 2.4, 0.42, 0, -0.95, 0);
  box(a, M.chain, 0.48, 0.48, 2.1, 0, -2.15, 0);
  for (const dz of [-1, 1]) {
    const f = box(a, M.chain, 0.42, 0.95, 0.56, 0, -1.8, dz * 1.0);
    f.rotation.x = -dz * 0.5;
  }
  // The hawse pipe it was hove up into.
  cyl(a, M.cave, 0.5, 0.5, 0.12, 0, 0.3, 0, 14).rotation.z = Math.PI / 2;
}

/** Her chain, as a run of links from one point on her deck to another. */
function chain(g, a, b) {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.42));
  const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const z = a[1] + ((b[1] - a[1]) * i) / n;
    box(g, M.chain, i % 2 ? 0.08 : 0.28, i % 2 ? 0.28 : 0.08, 0.44, x, scharnhorstSurfaceY(x, z) + 0.1, z, ry);
  }
}

function weatherDeck(g) {
  // The breakwater forward of Anton: two plates in a vee, braced aft, low
  // enough that her barrels clear it at their lowest.
  const apex = 80.0;
  for (const sgn of [-1, 1]) {
    const x1 = sgn * 6.6;
    const z1 = 75.6;
    const len = Math.hypot(x1, apex - z1);
    const cx = x1 / 2;
    const cz = (apex + z1) / 2;
    const yy = scharnhorstSurfaceY(cx, cz);
    box(g, M.steel, 0.12, 1.2, len, cx, yy + 0.5, cz, Math.atan2(x1, z1 - apex));
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      const bx = x1 * f;
      const bz = apex + (z1 - apex) * f;
      const by = scharnhorstSurfaceY(bx, bz);
      const br = box(g, M.steelDark, 0.08, 0.95, 0.8, bx, by + 0.4, bz - 0.4);
      br.rotation.x = 0.6;
    }
  }
  // Her anchor gear: the capstans her cables come back to, the cables from
  // her hawses, and the cable pipes they go down into her by.
  const gear = [
    { x: -2.3, z: 92.0, hx: -2.6, hz: 103.0 },
    { x: 2.3, z: 92.0, hx: 2.6, hz: 103.0 },
  ];
  for (const k of gear) {
    const y = scharnhorstSurfaceY(k.x, k.z);
    cyl(g, M.steelDark, 0.9, 1.0, 0.25, k.x, y + 0.12, k.z, 18);
    cyl(g, M.steel, 0.6, 0.68, 0.72, k.x, y + 0.58, k.z, 16);
    cyl(g, M.steelDark, 0.72, 0.72, 0.12, k.x, y + 0.98, k.z, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(g, M.steelDark, 0.08, 0.5, 0.18, k.x + Math.sin(a) * 0.66, y + 0.55, k.z + Math.cos(a) * 0.66, a);
    }
    chain(g, [k.x, k.z + 1.0], [k.hx, k.hz]);
    const hy = scharnhorstSurfaceY(k.hx, k.hz);
    cyl(g, M.steelDark, 0.58, 0.62, 0.2, k.hx, hy + 0.08, k.hz, 14);
    cyl(g, M.cave, 0.4, 0.4, 0.06, k.hx, hy + 0.19, k.hz, 14);
    const py = scharnhorstSurfaceY(k.x, k.z - 1.8);
    cyl(g, M.steelDark, 0.44, 0.48, 0.22, k.x, py + 0.08, k.z - 1.8, 12);
  }
  // Her bower anchors, hove up into their hawses either side of her bow.
  for (const sgn of [-1, 1]) {
    const z = 103.0;
    anchor(g, sgn, z, deckOver((2 * z) / LOA) - 1.4);
  }
  // Bollards along both sides of her, forward and aft, where she was made fast.
  for (const z of [96, 86, 70, 30, -57, -80, -100, -110]) {
    for (const sgn of [-1, 1]) bollards(g, sgn * (deckEdge(z) - 1.1), z);
  }
  // Her capstans aft, for her stern lines.
  for (const sgn of [-1, 1]) {
    const x = sgn * 3.2;
    const z = -106.0;
    const y = scharnhorstSurfaceY(x, z);
    cyl(g, M.steelDark, 0.78, 0.88, 0.22, x, y + 0.11, z, 16);
    cyl(g, M.steel, 0.54, 0.6, 0.7, x, y + 0.55, z, 14);
    cyl(g, M.steelDark, 0.64, 0.64, 0.1, x, y + 0.95, z, 14);
  }
  // Her jack staff at her stem and her ensign staff at her stern.
  const stem = 116.4;
  const sy = scharnhorstSurfaceY(0, stem);
  spar(g, M.steelDark, [0, sy - 0.1, stem], [0, sy + 4.6, stem + 0.4], 0.09, 0.05);
  const stern = -115.6;
  const ty = scharnhorstSurfaceY(0, stern);
  spar(g, M.steelDark, [0, ty - 0.1, stern], [0, ty + 5.6, stern - 0.6], 0.1, 0.05);
  // Hatches and the skylights over her wardroom, on her quarterdeck, and one
  // on her forecastle.
  for (const [x, z, w, d] of [[0, -94.0, 2.4, 3.2], [-4.6, -82.0, 1.6, 1.6], [4.6, -82.0, 1.6, 1.6], [0, 84.0, 2.0, 2.4]]) {
    const y = scharnhorstSurfaceY(x, z);
    box(g, M.steelDark, w, 0.5, d, x, y + 0.2, z);
    box(g, M.steel, w - 0.3, 0.12, d - 0.3, x, y + 0.5, z);
  }
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          350 mm, from just over her armour deck to two metres
 *                     under her waterline, between Anton's barbette and
 *                     Caesar's, inclined a little, as hers was, inside her
 *                     plating
 *   the armour deck   over the citadel, at the top of the belt, with its
 *                     slopes down to the belt's foot either side
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her three turrets, 350 mm, down to the armour deck
 *   her ends          70 mm of belt on from the citadel forward and aft
 */
const CITADEL = [-77.0, 68.5];
const ARMOUR_DECK = 1.6;
const BELT_TOP = 3.5;
const BELT_FOOT = -4.2;
const SLOPE_IN = 2.6;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 56;
  const [z0, z1] = CITADEL;
  const belt = strip();
  const ends = strip();
  const band = (s, za, zb, top, foot, inset) => {
    for (const sgn of [-1, 1]) {
      s.quad([sgn * at(za, top, inset), top, za], [sgn * at(za, foot, inset), foot, za],
        [sgn * at(zb, foot, inset), foot, zb], [sgn * at(zb, top, inset), top, zb],
        [-sgn, 0, 0]);
    }
  };
  for (let i = 0; i < N; i++) {
    band(belt, z0 + ((z1 - z0) * i) / N, z0 + ((z1 - z0) * (i + 1)) / N, BELT_TOP, BELT_FOOT, 0.9);
  }
  inside(belt.mesh(g, M.armour));
  // The thin belt at her ends, forward to her stem and aft to her steering
  // gear.
  for (const [a, b] of [[z1, 104.0], [-104.0, z0]]) {
    for (let i = 0; i < 16; i++) band(ends, a + ((b - a) * i) / 16, a + ((b - a) * (i + 1)) / 16, 2.4, -2.6, 0.6);
  }
  inside(ends.mesh(g, M.armour));
  // The armour deck: flat over the middle of her, and sloping down outboard
  // to the foot of her belt.
  const slope = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      const ia = sgn * (at(za, ARMOUR_DECK, 0.9) - SLOPE_IN), ib = sgn * (at(zb, ARMOUR_DECK, 0.9) - SLOPE_IN);
      const oa = sgn * at(za, BELT_FOOT + 1.2, 0.95), ob = sgn * at(zb, BELT_FOOT + 1.2, 0.95);
      for (const up of [1, -1]) {
        slope.quad([ia, ARMOUR_DECK + 0.05 * up, za], [oa, BELT_FOOT + 1.2 + 0.05 * up, za],
          [ob, BELT_FOOT + 1.2 + 0.05 * up, zb], [ib, ARMOUR_DECK + 0.05 * up, zb], [0, up, 0]);
      }
    }
  }
  inside(slope.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 0.9) - SLOPE_IN, () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < BELT_TOP; y += 1.0) ys.push(y);
    ys.push(BELT_TOP);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.2);
      const wb = at(z, ys[i + 1], 1.2);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of MOUNT_SEATS.turrets) {
    const top = deckOver((2 * t.z) / LOA) - 0.4;
    inside(cyl(g, M.armour, BARBETTE_R - 0.4, BARBETTE_R - 0.4, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her three screws, on the ends of her shafts where the sculpt drew them (see
// prepare-scharnhorst-hull.mjs): three-bladed, four metres across, the wing
// shafts handed against each other.
function screws(g) {
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: i === 0 ? 1 : Math.sign(s.x) };
    cyl(hub, M.brass, 0.5, 0.38, 0.9, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.38, 0.1, 0.75, 0, 0, -0.82, 12).rotation.x = Math.PI / 2;
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
  ['hullModel', buildScharnhorstHull],
  ['barbettes', barbettes],
  ['flakPlatforms', flakPlatforms],
  ['fittings', weatherDeck],
  ['armour', armour],
  ['screws', screws],
];

export function buildScharnhorst() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'scharnhorst';
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function scharnhorstParts() {
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
