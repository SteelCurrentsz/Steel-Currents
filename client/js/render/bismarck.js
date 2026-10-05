// KMS Bismarck, drawn from the owner's sculpts of her.
//
// Two hundred and fifty-one metres, fifty thousand tonnes at full load, eight
// 38 cm in four twin turrets, twelve 15 cm in six twins on her beam and sixteen
// 10.5 cm in eight twins over them -- on a hull thirty-six metres across, as
// broad as any battleship of her day, which is what made her the steadiest gun
// platform afloat. As she was in May 1941, when she sank Hood.
//
// Her hull and her forward superstructure -- conning tower, bridge, tower mast
// and foretop, funnel and its platforms, her boats -- are the sculpts (see
// bismarckHull.js and build/prepare-bismarck-hull.mjs), and so are her 38 cm
// turret, her 15 cm turret and her 10.5 cm mounting. Built here:
//
//   * her four 38 cm turrets, Anton and Bruno forward, Caesar and Dora aft,
//     each the owner's gunhouse on a barbette of its own, its barrels on a
//     cradle that elevates;
//   * her six 15 cm turrets and her eight 10.5 cm twins, the owner's sculpts,
//     on their barbettes and their platforms;
//   * her light flak: the sixteen 3.7 cm in eight twins, ten 2 cm singles and
//     the two Flakvierlings she had shipped by May 1941 (see kmguns.js);
//   * what stood amidships and aft of her funnel, from her plans: her double
//     catapult athwart her, which works, with an Arado on either end of it;
//     her hangar under her mainmast and a crane either side of it; her after
//     superstructure, with her after control position on it and a director
//     dome on her hangar roof;
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
import { box, cyl, tubeX, tubeZ, strip, sheet, rail, loftShape, planRun, ladder } from './shipkit.js';
import { threeSeven, twoCm } from './kmguns.js';
import { arado } from './planekit.js';
import { RIG, fitCatapults } from './catapult.js';
import {
  buildBismarckHull, bismarckSeatY, bismarckSurfaceY, MOUNT_SEATS, SCULPT_LINES, bismarckMaterials, gunPiece,
} from './bismarckHull.js';
import { SCREWS } from './bismarckHull.data.js';

const CLS = SHIP_CLASSES.bismarck;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: the light grey she wore over
// all her upperworks in May 1941, darker on her decks and her fittings.
const P = {
  steel: 0x9a9fa3,
  steelDark: 0x6c7176,
  deckSteel: 0x5a6066,
  gun: 0x92979b,
  gunDark: 0x3e4349,
  cave: 0x15181b,
  canvas: 0x8c8878,
  teak: 0x9a8f74,
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
export const deckAt = (z) => bismarckSurfaceY(0, z);
/**
 * How far out her deck goes at z, read off her surface: where her deck stops
 * and her side falls away. (Her lines are measured inside her plating, which
 * at her gunwale is a metre or two in from the edge of her deck.)
 */
export function deckEdge(z) {
  const deck = deckOver((2 * z) / LOA) - 0.4;
  let x = 0;
  while (x < BEAM && bismarckSurfaceY(x + 0.1, z) > deck && bismarckSurfaceY(-x - 0.1, z) > deck) x += 0.1;
  return x;
}

// --------------------------------------------- what stands abaft her funnel --
//
// The sculpt of her midships -- her catapult, her hangar and mainmast, her
// cranes -- and of her after superstructure were not to be had, so they are
// built here off her plans, to the same heights and the same grey as the
// sculpt forward of them.
//
// Her upper deck is level at 5.75 m over her waterline from her stern to well
// forward of the middle of her, and her superstructure deck is three metres
// over it: the platform outboard of her funnel the sculpt drew, and the roof
// of her after deckhouse, which her 10.5 cm stand on, forward and aft.
const D = 5.75;
const PLAT = D + 3.0;

// Her catapult: a fixed double catapult athwart her abaft her funnel, thirty-
// two metres of girder on a low house, which throws an Arado off either beam
// -- the port car off the port end of it and the starboard car off the
// starboard. Each car rests far enough out from her centreline that the two
// tails clear, with ten and a half metres of track outboard of it.
export const CAT_Z = -16.8;
export const CAT_Y = PLAT;
const CAT_HALF = 16.2;
const CAT_HOUSE = { hw: 7.6, z0: -19.2, z1: -14.4, top: D + 2.0 };
export const CAT_RIG = {
  ...RIG, BACK: 0, FRONT: CAT_HALF, A: 5.6, STROKE: 10.4, REST: 0, OUT: 0, PLANE_Y: 0.35, PLANE_Z: 0,
};
const DECK_RUN = CLS.planes.deckRun;

// Her hangar, under her mainmast, its doors facing her catapult; her mainmast
// stepped on its roof; and her cranes either side of it, abreast its doors,
// clear of her 15 cm abreast it as they train.
const HANGAR = { hw: 6.2, z0: -34.6, z1: -23.4, top: D + 6.6 };
const MAINMAST = { z: -25.6, top: 47.9 };
const CRANES = { x: 9.0, z: -20.6 };
// The director dome on her hangar roof, abaft her mainmast.
const SL8 = { z: -30.8 };

// Her after superstructure: a broad deckhouse on her upper deck, as wide
// abreast her after 10.5 cm as their platforms need, narrowing at both ends
// -- forward to her hangar, aft clear of Caesar's gunhouse -- and on its roof a
// second deckhouse with her after control position on it.
const AFT1 = { z0: -50.0, z1: -33.0, top: PLAT };
const aft1Half = (z) => {
  if (z > -35.0) return 7.0 + 5.6 * Math.min(1, (-33.0 - z) / 2.0);
  if (z > -46.5) return 12.6;
  return 12.6 - 4.1 * Math.min(1, (-46.5 - z) / 3.5);
};
const AFT2 = { z0: -46.4, z1: -37.4, hw: 6.0, top: PLAT + 2.6 };
const AFT_TOWER = { z: -41.5, r: 2.2, top: AFT2.top + 5.25 };

// The platforms outboard of her funnel that her forward 10.5 cm stand on:
// the sculpt's own deck, carried out over her upper deck as far as a
// mounting needs.
const SPONSON = { x0: 10.0, x1: 16.0, z0: -10.6, z1: 2.4 };

/** The heights of the decks built here, at (x, z), or -99 off all of them. */
export function builtDeckY(x, z) {
  const ax = Math.abs(x);
  let y = -99;
  if (z <= HANGAR.z1 && z >= HANGAR.z0 && ax <= HANGAR.hw) y = Math.max(y, HANGAR.top);
  if (z <= AFT1.z1 && z >= AFT1.z0 && ax <= aft1Half(z)) y = Math.max(y, AFT1.top);
  if (z <= AFT2.z1 && z >= AFT2.z0 && ax <= AFT2.hw) y = Math.max(y, AFT2.top);
  if (z <= SPONSON.z1 && z >= SPONSON.z0 && ax >= SPONSON.x0 && ax <= SPONSON.x1) y = Math.max(y, PLAT);
  return y;
}

// ------------------------------------------------------------ the shapes --

/** A rounded rectangle in plan, wound round its middle. */
function roundRect(x0, x1, z0, z1, r, n = 4) {
  const rr = Math.min(r, (x1 - x0) / 2 - 1e-3, (z1 - z0) / 2 - 1e-3);
  const pts = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  };
  corner(x1 - rr, z1 - rr, 0);
  corner(x0 + rr, z1 - rr, Math.PI / 2);
  corner(x0 + rr, z0 + rr, Math.PI);
  corner(x1 - rr, z0 + rr, (3 * Math.PI) / 2);
  return pts;
}

/** A house: a plan drawn up from y0 to y1, roofed. */
function house(g, m, pts, y0, y1) {
  return loftShape(g, m, [{ pts, y: y0 }, { pts, y: y1 }]);
}

/** A rail athwartships: stanchions and three courses of wire from x0 to x1. */
function railX(g, m, x0, x1, z, y, h = 1.0) {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 2.2));
  for (let i = 0; i <= n; i++) cyl(g, m, 0.045, 0.045, h, x0 + ((x1 - x0) * i) / n, y + h / 2, z, 5);
  for (const f of [0.38, 0.7, 1.0]) box(g, m, Math.abs(x1 - x0), 0.05, 0.05, (x0 + x1) / 2, y + h * f, z);
}

/**
 * A rail round a plan, a run of straight lengths between its points, with a
 * stanchion at each end of every length it runs along -- so where it stops
 * short of something it stops at a post, whichever way round the plan was
 * drawn.
 */
function railRound(g, m, pts, y, h = 1.0, skip = () => false) {
  const posts = new Set();
  const post = (x, z) => {
    const k = `${x.toFixed(3)},${z.toFixed(3)}`;
    if (posts.has(k)) return;
    posts.add(k);
    cyl(g, m, 0.045, 0.045, h, x, y + h / 2, z, 5);
  };
  for (let i = 0; i < pts.length; i++) {
    const [xa, za] = pts[i];
    const [xb, zb] = pts[(i + 1) % pts.length];
    if (skip((xa + xb) / 2, (za + zb) / 2)) continue;
    const len = Math.hypot(xb - xa, zb - za);
    if (len < 0.05) continue;
    post(xa, za);
    post(xb, zb);
    const ry = Math.atan2(xb - xa, zb - za);
    for (const f of [0.38, 0.7, 1.0]) box(g, m, 0.05, 0.05, len, (xa + xb) / 2, y + h * f, (za + zb) / 2, ry);
  }
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

/** A dome: a drum under half a sphere. */
function dome(g, m, x, y, z, r, drum) {
  cyl(g, m, r, r, drum, x, y + drum / 2, z, 20);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
  cap.position.set(x, y + drum, z);
  g.add(cap);
  return cap;
}

/** A 150 cm searchlight on its pedestal, looking out along `ry`. */
function searchlight(g, x, y, z, ry) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  cyl(s, M.steelDark, 0.22, 0.3, 0.7, 0, 0.35, 0, 10);
  box(s, M.steelDark, 1.5, 0.12, 0.3, 0, 0.75, 0);
  for (const sgn of [-1, 1]) box(s, M.steelDark, 0.1, 0.7, 0.3, sgn * 0.72, 1.05, 0);
  tubeZ(s, M.steel, 0.68, 1.2, 0, 1.25, 0, 18);
  cyl(s, M.glass, 0.6, 0.6, 0.06, 0, 1.25, 0.62, 18).rotation.x = Math.PI / 2;
  cyl(s, M.steelDark, 0.3, 0.42, 0.4, 0, 1.25, -0.75, 12).rotation.x = Math.PI / 2;
  return s;
}

// ---------------------------------------------------------- main battery --

// Each of her 38 cm turrets trains on a barbette ten and a half metres across,
// inside the ring of its own skirt.
const BARBETTE_R = 5.45;

/**
 * One of her 38 cm twin turrets, Drh LC/34, as the owner sculpted it: the
 * gunhouse trains on its barbette, and its barrels, blast bags and all, are on
 * a cradle about trunnions inside the face that lays them.
 */
function thirtyEight(g, spec) {
  const piece = gunPiece('main');
  const m = new THREE.Group();
  m.position.set(spec.x, spec.seat, spec.z);
  m.rotation.y = spec.rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = spec.name;
  m.userData.trainRate = CLS.gun.traverse;
  m.add(new THREE.Mesh(piece.house, bismarckMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = MOUNT_SEATS.turrets.map((spec) => thirtyEight(g, spec));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes her turrets and her 15 cm train on, from her deck up. */
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
    cyl(g, M.steel, 2.75, 2.75, top - foot, s.x, (top + foot) / 2, s.z, 28);
  }
}

// ------------------------------------------------- her 15 cm and 10.5 cm --

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y` on its barbette or platform, faces `rest`, and carries its
 * barrels on a cradle about their trunnions. `bores` draws the barrels their
 * own length where the sculpt's are stubs.
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
  m.add(new THREE.Mesh(piece.house, bismarckMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  let muzzles = piece.muzzles;
  if (bores) {
    muzzles = piece.muzzles.map(([mx]) => [mx, 0, bores.len]);
    for (const [mx] of piece.muzzles) {
      cyl(cradle, M.gun, bores.r * 0.8, bores.r, bores.len, mx, 0, bores.len / 2, 10).rotation.x = Math.PI / 2;
      // The muzzle, a little proud of the chase.
      cyl(cradle, M.gunDark, bores.r * 0.95, bores.r * 0.95, 0.22, mx, 0, bores.len - 0.11, 10).rotation.x = Math.PI / 2;
    }
  }
  m.add(cradle);
  arm(m, cradle, muzzles);
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

/**
 * Where a light gun stands: on the floor of the tub the sculpt drew it in, or
 * on a deck built here, or on her surface round it.
 */
function lightSeat(m, r) {
  const cut = MOUNT_SEATS.sculptedLight.find((l) => Math.abs(l.x - m.x) < 0.05 && Math.abs(l.z - m.z) < 0.05);
  if (cut) return cut.deck;
  const built = builtDeckY(m.x, m.z);
  return built > 0 ? built : bismarckSeatY(m.x, m.z, r);
}

function mountings(g) {
  const sec = secondaries(g);
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let a;
      if (gun.caliber === 105) {
        a = sculpted(g, 'flak', m.x, lightSeat(m, 2.0), m.z, stowed(m), 0.3, { r: 0.075, len: 4.8 });
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
  if (aa.length !== lights.length) throw new Error('the Bismarck built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------- her midships ----

/**
 * The platforms outboard of her funnel her forward 10.5 cm stand on: the
 * sculpt's own superstructure deck carried out over her upper deck, a
 * deckhouse under it to her deck, and a rail round its edge.
 */
function sponsons(g) {
  for (const sgn of [-1, 1]) {
    const x0 = sgn > 0 ? SPONSON.x0 : -SPONSON.x1;
    const x1 = sgn > 0 ? SPONSON.x1 : -SPONSON.x0;
    const pts = roundRect(x0, x1, SPONSON.z0, SPONSON.z1, 1.2);
    house(g, M.steel, pts, D - 0.3, PLAT - 0.12);
    house(g, M.deckSteel, roundRect(x0 + 0.02, x1 - 0.02, SPONSON.z0 + 0.02, SPONSON.z1 - 0.02, 1.2), PLAT - 0.12, PLAT);
    // Its outboard edge railed; inboard it meets the sculpt's own deck.
    railRound(g, M.steelDark, pts, PLAT, 1.0, (x) => Math.abs(x) < SPONSON.x0 + 0.6);
    // A door in its side, and a ladder up to it from her deck.
    box(g, M.steelDark, 0.08, 1.9, 0.9, sgn * (SPONSON.x1 + 0.02), D + 1.0, -4.2);
    ladder(g, M.steelDark, sgn * (SPONSON.x1 - 1.0), D, PLAT, SPONSON.z1 + 2.2, SPONSON.z1 - 0.1);
  }
}

/**
 * Her catapult: the house it stands on, the girder across her from side to
 * side on its trestles, and the two cars on it with an Arado on each -- the
 * cars and the aeroplanes left out of the weld and worked by fitCatapults.
 */
function catapult(g) {
  const c = CAT_HOUSE;
  house(g, M.steel, roundRect(-c.hw, c.hw, c.z0, c.z1, 0.6), D - 0.3, c.top);
  // Doors and vents on its faces.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 1.0, 1.7, 0.08, sgn * 3.6, D + 0.9, c.z1 + 0.02);
    box(g, M.steelDark, 0.08, 1.7, 1.0, sgn * (c.hw + 0.02), D + 0.9, CAT_Z);
  }
  // The girder: a box beam two metres deep at the middle, tapering to its ends,
  // with the rails along its top and the stiffeners down its sides.
  const yTop = CAT_Y - 0.15;
  const beam = strip();
  const N = 16;
  const depth = (x) => 0.55 + 0.45 * (1 - Math.abs(x) / CAT_HALF);
  for (let i = 0; i < N; i++) {
    const xa = -CAT_HALF + (2 * CAT_HALF * i) / N;
    const xb = -CAT_HALF + (2 * CAT_HALF * (i + 1)) / N;
    for (const sz of [-1, 1]) {
      const z = CAT_Z + sz * 0.7;
      beam.quad([xa, yTop, z], [xb, yTop, z], [xb, yTop - depth(xb), z], [xa, yTop - depth(xa), z], [0, 0, sz]);
    }
    beam.quad([xa, yTop - depth(xa), CAT_Z - 0.7], [xb, yTop - depth(xb), CAT_Z - 0.7],
      [xb, yTop - depth(xb), CAT_Z + 0.7], [xa, yTop - depth(xa), CAT_Z + 0.7], [0, -1, 0]);
  }
  for (const sx of [-1, 1]) {
    beam.quad([sx * CAT_HALF, yTop, CAT_Z - 0.7], [sx * CAT_HALF, yTop, CAT_Z + 0.7],
      [sx * CAT_HALF, yTop - depth(CAT_HALF), CAT_Z + 0.7], [sx * CAT_HALF, yTop - depth(CAT_HALF), CAT_Z - 0.7],
      [sx, 0, 0]);
  }
  beam.mesh(g, M.steel);
  box(g, M.steelDark, 2 * CAT_HALF, 0.1, 1.9, 0, yTop + 0.05, CAT_Z);
  for (const rz of [-0.55, 0.55]) box(g, M.gunDark, 2 * CAT_HALF - 0.4, 0.1, 0.14, 0, CAT_Y - 0.05, CAT_Z + rz);
  for (let i = -7; i <= 7; i++) {
    for (const sz of [-1, 1]) {
      const x = i * 2.1;
      box(g, M.steelDark, 0.12, depth(x) - 0.05, 0.08, x, yTop - depth(x) / 2, CAT_Z + sz * 0.73);
    }
  }
  // The buffers at its two ends.
  for (const sx of [-1, 1]) box(g, M.gunDark, 0.5, 0.5, 1.6, sx * (CAT_HALF - 0.25), CAT_Y + 0.2, CAT_Z);
  // Its trestles outboard of the house, down to her deck.
  for (const ax of [9.8, 13.0, 15.6]) {
    for (const sx of [-1, 1]) {
      const top = yTop - depth(ax);
      for (const sz of [-1, 1]) {
        spar(g, M.steelDark, [sx * ax, D - 0.1, CAT_Z + sz * 1.3], [sx * ax, top + 0.05, CAT_Z + sz * 0.6], 0.14);
      }
      box(g, M.steelDark, 0.3, 0.2, 2.8, sx * ax, D + 0.1, CAT_Z);
    }
  }
  // The two cars, one each side of her centreline, each with an Arado on it
  // facing out over her side.
  const cats = [];
  for (const sgn of [-1, 1]) {
    const cat = new THREE.Group();
    cat.position.set(0, CAT_Y, CAT_Z);
    cat.rotation.y = sgn * (Math.PI / 2);
    cat.userData.dynamic = true;
    g.add(cat);
    const car = new THREE.Group();
    car.position.set(0, 0, CAT_RIG.A);
    car.userData.dynamic = true;
    cat.add(car);
    box(car, M.gunDark, 2.0, 0.3, 2.4, 0, 0.15, 0);
    box(car, M.steelDark, 0.4, 0.5, 0.4, 0, 0.3, -1.4);
    const plane = arado(car, 0, CAT_RIG.PLANE_Y, CAT_RIG.PLANE_Z, 0, false, { spin: true });
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn, base: sgn * (Math.PI / 2) });
  }
  g.userData.catapults = cats;
}

/** Her hangar, its doors facing her catapult, and what stands on its roof. */
function hangar(g) {
  const h = HANGAR;
  const pts = roundRect(-h.hw, h.hw, h.z0, h.z1, 0.8);
  house(g, M.steel, pts, D - 0.3, h.top);
  box(g, M.deckSteel, 2 * h.hw - 0.3, 0.06, h.z1 - h.z0 - 0.3, 0, h.top + 0.03, (h.z0 + h.z1) / 2);
  // The doors: two leaves in a recess the width of a folded Arado and a half,
  // the runner over them and the stiffeners down them.
  box(g, M.cave, 7.6, 4.4, 0.1, 0, D + 2.3, h.z1 + 0.01);
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 3.7, 4.3, 0.12, sgn * 1.9, D + 2.25, h.z1 + 0.08);
    for (const dx of [-1.2, 0, 1.2]) box(g, M.steel, 0.1, 4.2, 0.1, sgn * 1.9 + dx, D + 2.25, h.z1 + 0.16);
  }
  box(g, M.steelDark, 8.4, 0.3, 0.5, 0, D + 4.6, h.z1 + 0.2);
  // Her sides: the scuttles of her workshops, her vents, and the doors aft.
  for (const sgn of [-1, 1]) {
    for (const z of [-25.4, -28.0, -30.6, -33.0]) {
      cyl(g, M.cave, 0.2, 0.2, 0.1, sgn * (h.hw + 0.01), D + 4.4, z, 10).rotation.z = Math.PI / 2;
    }
    box(g, M.steelDark, 0.08, 1.9, 0.9, sgn * (h.hw + 0.02), D + 1.0, -32.6);
    box(g, M.steelDark, 0.1, 0.12, h.z1 - h.z0 - 1.6, sgn * (h.hw + 0.03), D + 3.3, (h.z0 + h.z1) / 2);
    cyl(g, M.steel, 0.35, 0.4, 1.0, sgn * 2.4, h.top + 0.5, -33.6, 10);
    cyl(g, M.steelDark, 0.6, 0.48, 0.3, sgn * 2.4, h.top + 1.1, -33.6, 12);
    ladder(g, M.steelDark, sgn * (h.hw + 0.7), D, h.top, -33.0, -27.5);
  }
  // The rail round its roof, but not across the platforms her guns stand on.
  railRound(g, M.steelDark, roundRect(-h.hw + 0.1, h.hw - 0.1, h.z0 + 0.1, h.z1 - 0.1, 0.7), h.top, 1.0);
  // The director dome abaft her mainmast: the SL-8's stabilised sight under a
  // dome on a drum, on a pedestal off her hangar roof.
  cyl(g, M.steel, 1.25, 1.4, 2.4, 0, h.top + 1.2, SL8.z, 16);
  box(g, M.deckSteel, 5.0, 0.12, 5.0, 0, h.top + 2.4, SL8.z);
  railRound(g, M.steelDark, roundRect(-2.5, 2.5, SL8.z - 2.5, SL8.z + 2.5, 0.4), h.top + 2.46, 0.9);
  dome(g, M.steel, 0, h.top + 2.46, SL8.z, 1.85, 1.2);
  box(g, M.cave, 1.2, 0.5, 0.1, 0, h.top + 3.3, SL8.z + 1.84);
  ladder(g, M.steelDark, 0, h.top, h.top + 2.4, SL8.z + 5.2, SL8.z + 2.5);
}

/**
 * Her mainmast: a pole stepped on her hangar roof, the searchlight platform
 * round it with her after pair of searchlights, the starfish two thirds of the
 * way up, the yard, and the gaff her ensign flew from at sea.
 */
function mainmast(g) {
  const z = MAINMAST.z;
  const foot = HANGAR.top;
  spar(g, M.steel, [0, foot - 0.2, z], [0, 30.5, z], 0.6, 0.38, 14);
  spar(g, M.steel, [0, 30.5, z], [0, MAINMAST.top, z], 0.34, 0.16, 12);
  // The searchlight platform round it, with a light either side.
  const pY = 18.6;
  cyl(g, M.deckSteel, 2.6, 2.6, 0.18, 0, pY, z, 20);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    spar(g, M.steelDark, [Math.sin(a) * 0.5, pY - 2.4, z + Math.cos(a) * 0.5], [Math.sin(a) * 2.2, pY - 0.1, z + Math.cos(a) * 2.2], 0.08);
  }
  const ring = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    ring.push([Math.sin(a) * 2.5, z + Math.cos(a) * 2.5]);
  }
  railRound(g, M.steelDark, ring, pY + 0.09, 0.95);
  for (const sgn of [-1, 1]) searchlight(g, sgn * 1.45, pY + 0.09, z, sgn * (Math.PI / 2));
  // The starfish and the lookout's position on it.
  box(g, M.steel, 1.7, 1.5, 1.7, 0, 30.0, z);
  box(g, M.deckSteel, 2.6, 0.12, 2.6, 0, 30.8, z);
  // The yard across it, with her signal halyards' blocks, and the gaff aft.
  tubeX(g, M.steelDark, 0.11, 9.0, 0, 36.5, z, 8);
  for (const sgn of [-1, 1]) cyl(g, M.steelDark, 0.12, 0.12, 0.3, sgn * 4.3, 36.3, z, 6);
  spar(g, M.steelDark, [0, 34.2, z - 0.2], [0, 41.0, z - 5.6], 0.13, 0.08);
  // Her mast cap and the aerial spreader on it.
  cyl(g, M.steelDark, 0.22, 0.22, 0.4, 0, MAINMAST.top, z, 8);
  tubeX(g, M.steelDark, 0.06, 3.0, 0, MAINMAST.top - 1.5, z, 6);
}

/**
 * Her two cranes, abreast her hangar doors: each a king post on a pedestal,
 * the machinery house that slews on it, and a lattice jib stowed lying aft
 * along her side, clear of her catapult.
 */
function cranes(g) {
  for (const sgn of [-1, 1]) {
    const x = sgn * CRANES.x;
    const z = CRANES.z;
    cyl(g, M.steelDark, 1.5, 1.65, 0.6, x, D + 0.3, z, 18);
    cyl(g, M.steel, 0.75, 0.9, 3.2, x, D + 2.2, z, 14);
    const c = new THREE.Group();
    c.position.set(x, D + 3.8, z);
    c.rotation.y = Math.PI;
    g.add(c);
    // The machinery house, with the counterweight forward and the cab aft.
    box(c, M.steel, 2.6, 2.0, 3.2, 0, 1.0, -0.4);
    box(c, M.steelDark, 2.7, 0.12, 3.3, 0, 2.06, -0.4);
    box(c, M.steelDark, 2.2, 1.3, 0.9, 0, 0.8, -2.4);
    box(c, M.steel, 1.2, 1.4, 1.2, sgn * 0.5, 1.6, 1.4);
    box(c, M.glass, 0.9, 0.5, 0.06, sgn * 0.5, 1.9, 2.02);
    // The jib: two booms and the lattice between them, from the heel pins on
    // the house up to the sheave head, twelve metres off at twenty degrees.
    const heel = [0, 1.4, 1.2];
    const len = 12.0;
    const el = 0.35;
    const tip = [0, heel[1] + Math.sin(el) * len, heel[2] + Math.cos(el) * len];
    for (const bx of [-0.45, 0.45]) {
      spar(c, M.steelDark, [bx, heel[1], heel[2]], [bx * 0.4, tip[1], tip[2]], 0.12, 0.09);
      spar(c, M.steelDark, [bx, heel[1] + 0.6, heel[2]], [bx * 0.4, tip[1] + 0.3, tip[2]], 0.1, 0.08);
    }
    for (let i = 1; i < 8; i++) {
      const f = i / 8;
      const p = [0, heel[1] + (tip[1] - heel[1]) * f, heel[2] + (tip[2] - heel[2]) * f];
      const w = 0.45 * (1 - 0.6 * f);
      box(c, M.steelDark, 2 * w, 0.06, 0.06, 0, p[1], p[2]);
      box(c, M.steelDark, 2 * w, 0.06, 0.06, 0, p[1] + 0.6 - 0.3 * f, p[2]);
    }
    cyl(c, M.gunDark, 0.3, 0.3, 0.3, 0, tip[1] + 0.1, tip[2], 10).rotation.z = Math.PI / 2;
    // The fall, and the hook on it, lashed up under the head.
    cyl(c, M.chain, 0.025, 0.025, 2.4, 0, tip[1] - 1.2, tip[2], 4);
    box(c, M.gunDark, 0.3, 0.5, 0.2, 0, tip[1] - 2.5, tip[2]);
    // The topping lift from the head of the house to the sheave head.
    spar(c, M.steelDark, [0, 2.1, -1.6], [0, tip[1] + 0.3, tip[2] - 0.2], 0.035);
  }
}

/** Her after superstructure, her after control position and its fittings. */
function afterSuperstructure(g) {
  // The deckhouse on her upper deck, its roof her superstructure deck.
  const p1 = planRun(aft1Half, AFT1.z0, AFT1.z1, 1.2, 2.0, { n: 30, arc: 5 });
  house(g, M.steel, p1, D - 0.3, AFT1.top - 0.1);
  house(g, M.deckSteel, planRun((z) => aft1Half(z) - 0.03, AFT1.z0 + 0.03, AFT1.z1 - 0.03, 1.2, 2.0, { n: 30, arc: 5 }),
    AFT1.top - 0.1, AFT1.top);
  railRound(g, M.steelDark, p1, AFT1.top, 1.0, (x, z) => z > -34.2);
  // Doors and scuttles down its sides.
  for (const sgn of [-1, 1]) {
    for (const z of [-38.0, -45.0]) box(g, M.steelDark, 0.08, 1.9, 0.9, sgn * (12.62), D + 1.0, z);
    for (const z of [-36.0, -40.2, -42.4, -47.0]) {
      cyl(g, M.cave, 0.2, 0.2, 0.1, sgn * (aft1Half(z) + 0.01), D + 2.0, z, 10).rotation.z = Math.PI / 2;
    }
    ladder(g, M.steelDark, sgn * 6.0, D, AFT1.top, -52.4, -49.6);
  }
  // The second deckhouse on its roof, round the foot of her after control
  // position, and its rail.
  const p2 = planRun(AFT2.hw, AFT2.z0, AFT2.z1, 1.5, 1.5, { n: 10, arc: 5 });
  house(g, M.steel, p2, AFT1.top - 0.1, AFT2.top - 0.1);
  house(g, M.deckSteel, planRun(AFT2.hw - 0.03, AFT2.z0 + 0.03, AFT2.z1 - 0.03, 1.5, 1.5, { n: 10, arc: 5 }),
    AFT2.top - 0.1, AFT2.top);
  railRound(g, M.steelDark, p2, AFT2.top, 1.0);
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.08, 1.9, 0.9, sgn * (AFT2.hw + 0.01), AFT1.top + 1.0, -43.0);
    ladder(g, M.steelDark, sgn * 3.0, AFT1.top, AFT2.top, -49.4, -46.6);
  }
  // Her after control position: a round tower, the platform round its head,
  // and on that the hood of her after 10.5 m rangefinder, which trains, with
  // the mattress of her after FuMO 23 on its roof and her after pole over it.
  const t = AFT_TOWER;
  cyl(g, M.steel, t.r, t.r + 0.1, t.top - AFT2.top + 0.1, 0, (t.top + AFT2.top) / 2 - 0.05, t.z, 22);
  // Its vision slits, one on each quarter.
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.5) * (Math.PI / 2);
    const slit = box(g, M.cave, 0.9, 0.18, 0.08, Math.sin(a) * (t.r + 0.06), AFT2.top + 3.6, t.z + Math.cos(a) * (t.r + 0.06));
    slit.rotation.y = a;
  }
  cyl(g, M.deckSteel, 3.1, 3.1, 0.16, 0, t.top, t.z, 22);
  const ring = [];
  for (let i = 0; i < 22; i++) ring.push([Math.sin((i / 22) * Math.PI * 2) * 3.0, t.z + Math.cos((i / 22) * Math.PI * 2) * 3.0]);
  railRound(g, M.steelDark, ring, t.top + 0.08, 0.95);
  const hood = new THREE.Group();
  hood.position.set(0, t.top + 0.08, t.z);
  g.add(hood);
  cyl(hood, M.steel, 1.85, 2.0, 1.7, 0, 0.85, 0, 20);
  tubeX(hood, M.steel, 0.38, 10.5, 0, 1.0, 0, 12);
  for (const sgn of [-1, 1]) {
    box(hood, M.steel, 0.9, 1.0, 0.9, sgn * 5.2, 1.0, 0);
    box(hood, M.cave, 0.08, 0.5, 0.5, sgn * 5.66, 1.0, 0);
  }
  box(hood, M.cave, 1.4, 0.3, 0.08, 0, 1.2, 1.97);
  // The radar mattress, on its frame on the hood's roof.
  for (const sgn of [-1, 1]) box(hood, M.steelDark, 0.15, 1.0, 0.15, sgn * 1.6, 2.2, 0);
  box(hood, M.steelDark, 4.0, 2.0, 0.22, 0, 3.6, 0.3);
  for (let i = -3; i <= 3; i++) box(hood, M.gunDark, 0.05, 1.9, 0.06, i * 0.55, 3.6, 0.45);
  spar(g, M.steelDark, [0, t.top + 1.7, t.z - 0.3], [0, 27.0, t.z - 0.3], 0.17, 0.09);
  tubeX(g, M.steelDark, 0.06, 3.4, 0, 25.5, t.z - 0.3, 6);
  // Her after pair of searchlights, abaft her after control position on the
  // after end of its deck.
  for (const sgn of [-1, 1]) searchlight(g, sgn * 1.7, AFT2.top, -45.4, sgn * 2.4);
  // Ventilators on her superstructure deck.
  for (const [x, z] of [[-7.2, -36.2], [7.2, -36.2], [-6.6, -47.4], [6.6, -47.4]]) {
    cyl(g, M.steel, 0.35, 0.4, 1.0, x, AFT1.top + 0.5, z, 10);
    cyl(g, M.steelDark, 0.62, 0.5, 0.3, x, AFT1.top + 1.15, z, 12);
  }
}

// --------------------------------------------------- her weather deck ----

/** A pair of bollards on a bedplate, at (x, z). */
function bollards(g, x, z, ry = 0) {
  const y = bismarckSurfaceY(x, z);
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
  // Lying flat to her side, which flares out over it.
  a.rotation.y = sgn * 0.12;
  g.add(a);
  box(a, M.chain, 0.35, 2.6, 0.45, 0, -1.0, 0);
  box(a, M.chain, 0.5, 0.5, 2.3, 0, -2.3, 0);
  for (const dz of [-1, 1]) {
    const f = box(a, M.chain, 0.45, 1.0, 0.6, 0, -1.9, dz * 1.1);
    f.rotation.x = -dz * 0.5;
  }
  // The hawse pipe it was hove up into.
  cyl(a, M.cave, 0.55, 0.55, 0.12, 0, 0.35, 0, 14).rotation.z = Math.PI / 2;
}

/** Her chain, as a run of links from one point on her deck to another. */
function chain(g, a, b) {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.42));
  const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const z = a[1] + ((b[1] - a[1]) * i) / n;
    const l = box(g, M.chain, i % 2 ? 0.08 : 0.3, i % 2 ? 0.3 : 0.08, 0.46, x, bismarckSurfaceY(x, z) + 0.1, z, ry);
    void l;
  }
}

function weatherDeck(g) {
  // The breakwater forward of Anton: two plates in a vee, braced aft, low
  // enough that her barrels clear it at their lowest.
  const apex = 84.6;
  for (const sgn of [-1, 1]) {
    const x1 = sgn * 7.6;
    const z1 = 79.8;
    const len = Math.hypot(x1, apex - z1);
    const cx = x1 / 2;
    const cz = (apex + z1) / 2;
    const yy = bismarckSurfaceY(cx, cz);
    box(g, M.steel, 0.12, 1.4, len, cx, yy + 0.55, cz, Math.atan2(x1, z1 - apex));
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      const bx = x1 * f;
      const bz = apex + (z1 - apex) * f;
      const by = bismarckSurfaceY(bx, bz);
      const br = box(g, M.steelDark, 0.08, 1.1, 0.9, bx, by + 0.45, bz - 0.45);
      br.rotation.x = 0.6;
    }
  }
  // Her anchor gear: the capstans her cables come back to, the cables from
  // her hawses, and the cable pipes they go down into her by.
  const gear = [
    { x: -2.6, z: 99.0, hx: -2.9, hz: 110.0 },
    { x: 2.6, z: 99.0, hx: 2.9, hz: 110.0 },
    { x: 0, z: 102.5, hx: 0, hz: 117.0 },
  ];
  for (const k of gear) {
    const y = bismarckSurfaceY(k.x, k.z);
    cyl(g, M.steelDark, 0.95, 1.05, 0.25, k.x, y + 0.12, k.z, 18);
    cyl(g, M.steel, 0.62, 0.7, 0.75, k.x, y + 0.6, k.z, 16);
    cyl(g, M.steelDark, 0.75, 0.75, 0.12, k.x, y + 1.02, k.z, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(g, M.steelDark, 0.08, 0.5, 0.18, k.x + Math.sin(a) * 0.68, y + 0.55, k.z + Math.cos(a) * 0.68, a);
    }
    chain(g, [k.x, k.z + 1.0], [k.hx, k.hz]);
    const hy = bismarckSurfaceY(k.hx, k.hz);
    cyl(g, M.steelDark, 0.6, 0.65, 0.2, k.hx, hy + 0.08, k.hz, 14);
    cyl(g, M.cave, 0.42, 0.42, 0.06, k.hx, hy + 0.19, k.hz, 14);
    // The cable pipe aft of the capstan, down to her cable locker.
    const py = bismarckSurfaceY(k.x, k.z - 1.8);
    cyl(g, M.steelDark, 0.45, 0.5, 0.22, k.x, py + 0.08, k.z - 1.8, 12);
  }
  // Her bower anchors, hove up into their hawses either side of her bow.
  for (const sgn of [-1, 1]) {
    const z = 110.0;
    anchor(g, sgn, z, deckOver((2 * z) / LOA) - 1.3);
  }
  // Bollards along both sides of her, forward and aft, where she was made fast.
  for (const z of [104, 92, 74, 40, -60, -88, -104, -116]) {
    for (const sgn of [-1, 1]) bollards(g, sgn * (deckEdge(z) - 1.1), z);
  }
  // Her capstans aft, for her stern lines.
  for (const sgn of [-1, 1]) {
    const x = sgn * 3.6;
    const z = -112.0;
    const y = bismarckSurfaceY(x, z);
    cyl(g, M.steelDark, 0.8, 0.9, 0.22, x, y + 0.11, z, 16);
    cyl(g, M.steel, 0.55, 0.62, 0.7, x, y + 0.55, z, 14);
    cyl(g, M.steelDark, 0.66, 0.66, 0.1, x, y + 0.95, z, 14);
  }
  // Her jack staff at her stem and her ensign staff at her stern.
  const stem = 123.6;
  const sy = bismarckSurfaceY(0, stem);
  spar(g, M.steelDark, [0, sy - 0.1, stem], [0, sy + 5.0, stem + 0.4], 0.09, 0.05);
  const stern = -123.4;
  const ty = bismarckSurfaceY(0, stern);
  spar(g, M.steelDark, [0, ty - 0.1, stern], [0, ty + 6.0, stern - 0.6], 0.1, 0.05);
  // And a hatch or two and the skylights over her wardroom, on her quarterdeck.
  for (const [x, z, w, d] of [[0, -98.0, 2.4, 3.2], [-5.0, -84.0, 1.6, 1.6], [5.0, -84.0, 1.6, 1.6], [0, 92.0, 2.0, 2.4]]) {
    const y = bismarckSurfaceY(x, z);
    box(g, M.steelDark, w, 0.5, d, x, y + 0.2, z);
    box(g, M.steel, w - 0.3, 0.12, d - 0.3, x, y + 0.5, z);
  }
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          320 mm, vertical, from just over her armour deck to two
 *                     and a half metres under her waterline, between Anton's
 *                     barbette and Dora's
 *   the armour deck   over the citadel, at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her four turrets, 340 mm, down to the armour deck
 */
const CITADEL = [-90.5, 79.5];
const ARMOUR_DECK = 3.2;
const BELT_FOOT = -4.6;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 56;
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
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.3);
      const wb = at(z, ys[i + 1], 1.3);
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
// prepare-bismarck-hull.mjs): three-bladed, four metres seventy across, the
// wing shafts handed against each other.
function screws(g) {
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: i === 0 ? 1 : Math.sign(s.x) };
    cyl(hub, M.brass, 0.55, 0.42, 1.0, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.42, 0.1, 0.8, 0, 0, -0.9, 12).rotation.x = Math.PI / 2;
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
  ['hullModel', buildBismarckHull],
  ['barbettes', barbettes],
  ['sponsons', sponsons],
  ['aviation', catapult],
  ['hangar', hangar],
  ['mainmast', mainmast],
  ['cranes', cranes],
  ['afterSuperstructure', afterSuperstructure],
  ['fittings', weatherDeck],
  ['armour', armour],
  ['screws', screws],
];

export function buildBismarck() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'bismarck';
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: CAT_Y,
    catX: 0, catZ: CAT_Z, run: DECK_RUN, aero: 'arado',
  });
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function bismarckParts() {
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
