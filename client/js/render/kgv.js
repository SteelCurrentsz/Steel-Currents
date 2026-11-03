// HMS King George V, drawn from the owner's sculpts of her.
//
// The first of the five battleships of her class, and the Home Fleet's
// flagship when it caught Bismarck: two hundred and twenty-seven metres, ten
// 14-inch -- in two quadruple turrets, A forward and Y aft, and a twin, B,
// superfiring over A -- sixteen 5.25-inch dual-purpose in eight twin turrets,
// four a side, and by 1945 more anti-aircraft guns than any ship of her navy
// had carried: her eight-barrelled pom-poms, four quadruple Bofors and
// thirty-six Oerlikons.
//
// Her hull and superstructure are the sculpts (see kgvHull.js and
// build/prepare-kgv-hull.mjs); every one of her guns is a sculpt. What is
// built here is everything that moves or fires:
//
//   * her three 14-inch turrets, the sculpt's own gunhouses on their
//     barbettes, their barrels on a cradle that elevates -- A and B forward,
//     B superfiring; Y aft, facing astern;
//   * her eight 5.25-inch twins, four a side, on the barbettes the sculpts
//     cast them on: two abreast her bridge and fore funnel, two abreast her
//     after funnel and mainmast;
//   * her octuple pom-poms, abreast her foremast and her fore funnel and on
//     her after superstructure over Y;
//   * her four quadruple Bofors and her thirty-six Oerlikons, on her deck and
//     her superstructure;
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
import { box, cyl, strip, sheet } from './shipkit.js';
import {
  buildKgvHull, kgvSurfaceY, MOUNT_SEATS, SCULPT_LINES, kgvMaterials, gunPiece,
} from './kgvHull.js';

const CLS = SHIP_CLASSES.kgv;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: Home Fleet grey on her guns and
// her fittings.
const P = {
  steel: 0x7a8289,
  steelDark: 0x5a6168,
  gun: 0x737b82,
  gunDark: 0x40464c,
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
export const deckAt = (z) => kgvSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

let sheetMat = null;
function gunSheet() {
  if (!sheetMat) { sheetMat = M.gun.clone(); sheetMat.side = THREE.DoubleSide; }
  return sheetMat;
}

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y`, faces `rest`, and carries its barrels on a cradle about
 * their trunnions.
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
  // Every one of her guns is drawn from both sides: a pom-pom's and a
  // Bofors' shields are sheets seen from behind as often as in front, and an
  // Oerlikon's is nothing else.
  m.add(new THREE.Mesh(piece.house, kgvMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, gunSheet()));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

const MAIN_KIND = { A: 'mainA', B: 'mainB', Y: 'mainY' };
function mainBattery(g) {
  const turrets = MOUNT_SEATS.turrets.map((t) => sculpted(g, MAIN_KIND[t.name], t.x, t.seat, t.z, t.rest, CLS.gun.traverse, t.name));
  g.userData.turrets = turrets;
  return turrets;
}

/**
 * A's barbette, from her deck up to its seat: the sculpts have B's and Y's,
 * which stand on their own decks, and kgv.js stands A's gunhouse on its own.
 * And the roller path's lip at the top of each.
 */
function barbettes(g) {
  for (const t of MOUNT_SEATS.turrets) {
    const top = t.seat - 0.02;
    if (t.name === 'A') {
      const foot = t.deck - 0.3;
      cyl(g, M.steel, t.r - 1.0, t.r - 1.0, top - foot, t.x, (top + foot) / 2, t.z, 48);
      cyl(g, M.steelDark, t.r - 0.8, t.r - 0.8, 0.4, t.x, foot + 0.32, t.z, 48);
    }
  }
}

// ------------------------------------------------------ her 5.25-inch -----

/** Each 5.25-inch seat, port and starboard, in the order her datasheet lists them. */
function secondarySeats() {
  return MOUNT_SEATS.secondary.flatMap((s) => [s, { ...s, x: -s.x, rest: -s.rest }]);
}

// ------------------------------------------------ the light guns ------------

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);
const near = (list, x, z) => list.reduce((a, b) => (Math.hypot(b.x - Math.abs(x), b.z - z) < Math.hypot(a.x - Math.abs(x), a.z - z) ? b : a));

/** Which of her sculpted guns a light gun of her datasheet is, by its calibre and barrels. */
function lightKind(gun, m) {
  if (gun.caliber === 20) return 'oerlikon';
  return m.guns === 8 ? 'pompom' : 'bofors';
}

function mountings(g) {
  const sec = [];
  const seats = secondarySeats();
  if (seats.length !== CLS.secondary.mounts.length) throw new Error('the King George V built a secondary battery her datasheet does not list');
  CLS.secondary.mounts.forEach((spec, i) => {
    const s = seats[i];
    const m = sculpted(g, 'sec', spec.x, s.y, spec.z, stowed(spec), CLS.secondary.traverse);
    m.userData.rest = 0;
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    sec.push(m);
  });
  const aa = [];
  const lights = lightMounts(CLS);
  let k = 0;
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      const kind = lightKind(gun, m);
      const seat = near(MOUNT_SEATS[kind], m.x, m.z);
      const a = sculpted(g, kind, m.x, seat.y, m.z, stowed(m), kind === 'oerlikon' ? 1.2 : 0.7);
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the King George V built a light battery her datasheet does not list');
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
 *   the belt          fifteen inches over her magazines, fourteen over her
 *                     machinery, from A's barbette to Y's, vertical, from her
 *                     main deck down four metres under her waterline
 *   the armour deck   six inches over her magazines and five over her
 *                     machinery, at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her three turrets, thirteen inches, down to the
 *                     armour deck
 */
const CITADEL = [-68, 66];
const ARMOUR_DECK = 4.2;
const BELT_FOOT = -4.3;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 64;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 0.9), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 0.9), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 0.9), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 0.9), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 0.9), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.2), wb = at(z, ys[i + 1], 1.2);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of MOUNT_SEATS.turrets) {
    const top = t.deck - 0.3;
    const r = t.r - 1.2;
    inside(cyl(g, M.armour, r, r, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, on the ends of her shafts: three-bladed, four and a half
// metres across, and handed -- the inner pair a little further aft than the
// wing pair, as hers were.
export const SCREWS = [
  { x: -6.6, y: -6.4, z: -88.5, r: 2.2, wing: true },
  { x: 6.6, y: -6.4, z: -88.5, r: 2.2, wing: true },
  { x: -2.8, y: -6.9, z: -94.0, r: 2.2 },
  { x: 2.8, y: -6.9, z: -94.0, r: 2.2 },
];
function screws(g) {
  for (const s of SCREWS) {
    // Its shaft, run forward into her from the hub, and its bracket.
    const shaft = cyl(g, M.steelDark, 0.28, 0.28, 10.0, s.x, s.y + 0.25, s.z + 5.0, 12);
    shaft.rotation.x = Math.PI / 2 - 0.05;
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.5, 0.38, 1.0, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.38, 0.1, 0.7, 0, 0, -0.8, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.55, 0.12, s.r * 1.3,
        Math.sin(a) * s.r * 0.5, Math.cos(a) * s.r * 0.5, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * Math.sign(s.x);
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildKgvHull],
  ['barbettes', barbettes],
  ['armour', armour],
  ['screws', screws],
];

export function buildKgv() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'kgv';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function kgvParts() {
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
