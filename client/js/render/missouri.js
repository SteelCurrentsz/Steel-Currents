// USS Missouri (BB-63) as she was in 1991, drawn from the owner's model of her.
//
// The last battleship to fire in anger: recommissioned in 1986 with her nine
// 16-inch guns and six of her ten 5-inch twins, her 40 mm and 20 mm landed
// and in their place four Phalanx close-in weapon systems, eight armoured box
// launchers for thirty-two Tomahawks and four quadruple Harpoon canisters.
// She fired twenty-eight Tomahawks and seven hundred and fifty-nine sixteen-
// inch rounds in the Gulf in 1991.
//
// Her hull and superstructure are the model -- "USS Missouri (BB-63) 1991"
// by 全斗焕 (https://skfb.ly/oHyvM), under Creative Commons Attribution 4.0
// -- (see missouriHull.js and build/prepare-missouri-hull.mjs); every gun and
// launcher of hers is the model's own. What is built here is everything that
// moves or fires:
//
//   * her three 16-inch triples, the model's gunhouses on their barbettes,
//     their barrels on a cradle that elevates;
//   * her six 5-inch twins and her four Phalanx;
//   * her eight armoured box launchers, each raised on its hinge to fire;
//   * her four screws, the model's, which turn;
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
import { box, cyl, strip, sheet, tubeZ, sphere } from './shipkit.js';
import {
  buildMissouriHull, missouriSurfaceY, MOUNT_SEATS, SCULPT_LINES, missouriMaterials, gunPiece,
} from './missouriHull.js';
import { SCREWS, BOX_LAUNCHERS, HARPOON_TUBES } from './missouriHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.missouri;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

const P = {
  phalanxWhite: 0xe4e4df,
  phalanxGrey: 0x9aa0a6,
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
/** Where the mouth of each of her Harpoon canisters is, and which way it points. */
export const HARPOONS = HARPOON_TUBES;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => missouriSurfaceY(0, z);

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
  m.add(new THREE.Mesh(piece.house, missouriMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, missouriMaterials().sheet));
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
  if (!best || bd > 0.6) throw new Error(`the Missouri has a ${what} at ${x}, ${z} her model does not`);
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

/**
 * A Phalanx Mk 15, at its own size: the square pedestal it is bolted to, the
 * turntable and the barbette over it, and on the cradle between the arms the
 * radar dome over the six-barrelled gun and the drum that feeds it. Built
 * here rather than off the model, which draws it in a hundred and fifty
 * thousand faces of bolts (see build/prepare-missouri-hull.mjs). The gun,
 * the dome and the drum elevate together; it trains and elevates faster
 * than anything else aboard.
 */
function phalanx(g, x, y, z, rest) {
  const piece = gunPiece('ciws');
  // The pedestal, which does not train.
  box(g, M.phalanxGrey, 2.3, 1.25, 2.3, x, y + 0.62, z);
  const m = new THREE.Group();
  m.position.set(x, y + 1.25, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = 2.4;
  cyl(m, M.phalanxGrey, 0.82, 0.86, 0.32, 0, 0.16, 0, 20);
  cyl(m, M.phalanxWhite, 0.5, 0.74, 0.95, 0, 0.8, 0, 16);
  // Its arms, either side of the cradle.
  for (const sx of [-0.62, 0.62]) box(m, M.phalanxWhite, 0.2, 1.05, 0.8, sx, 1.65, 0);
  const cradle = new THREE.Group();
  cradle.position.set(0, piece.trunnion[1] - 1.25, 0);
  // The dome: the search and track radars, the white barrel standing over
  // the gun that gives the whole thing its look.
  cyl(cradle, M.phalanxWhite, 0.56, 0.56, 1.2, 0, 0.82, -0.12, 20);
  const cap = sphere(cradle, M.phalanxWhite, 0.56, 0, 1.42, -0.12);
  cap.scale.y = 0.55;
  // The drum under the gun, feeding it from behind.
  tubeZ(cradle, M.phalanxWhite, 0.4, 1.3, 0, -0.18, -0.55, 16);
  // The gun: six barrels round its axis, clamped, out ahead of the dome.
  tubeZ(cradle, M.phalanxGrey, 0.16, 0.6, 0, -0.05, 0.3, 12);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    tubeZ(cradle, M.gunDark, 0.028, 1.6, Math.cos(a) * 0.075, -0.05 + Math.sin(a) * 0.075, 1.35, 6);
  }
  tubeZ(cradle, M.gunDark, 0.13, 0.18, 0, -0.05, 1.45, 12);
  m.add(cradle);
  arm(m, cradle, piece.muzzles.map(([mx, my, mz]) => [mx, my, mz]));
  g.add(m);
  return m;
}

function mountings(g) {
  const sec = CLS.secondary.mounts.map((spec) => {
    const s = seatFor(MOUNT_SEATS.sec, spec.x, spec.z, '5-inch twin');
    const m = sculpted(g, 'sec', s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    const kind = gun.piece;
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`);
      // A Phalanx is built at its own size (see phalanx), and slews like
      // nothing else aboard: well over a hundred degrees a second.
      const a = kind === 'ciws' ? phalanx(g, s.x, s.y, s.z, stowed(spec)) : sculpted(g, kind, s.x, s.y, s.z, stowed(spec), 0.7);
      if (kind === 'ciws') a.userData.ciws = true;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Missouri built a light battery her datasheet does not list');
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
 *   the belt          307 mm -- twelve inches and a bit -- inclined inside her,
 *                     from A's barbette to Y's, from her armour deck down
 *                     five metres under her waterline
 *   the armour deck   152 mm, at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her three turrets, down to the armour deck
 */
const CITADEL = [-76, 70];
const ARMOUR_DECK = 3.2;
const BELT_FOOT = -5.0;
const BARBETTE_R = 6.2;

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

// Her four screws, each as the model drew it, on the end of its shaft: the
// wing pair abreast each other and the inner pair further aft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], missouriMaterials().sheet));
    g.add(hub);
  });
}

// ------------------------------------------------------------ launchers ----
//
// Her eight armoured box launchers, each as the model drew it, on the hinge at
// its inboard end: stowed flat on her deck, and raised -- the whole box,
// lid and all -- to fire, its four Tomahawks leaving by its outboard end.
// `lift` is the box about its hinge; the game raises it off the wire.
export const ABL_RAISE = 0.6;
let ablGeo = null;
function launchers(g) {
  if (!ablGeo) ablGeo = BOX_LAUNCHERS.map((b) => decodePiece(b.piece));
  g.userData.launchers = BOX_LAUNCHERS.map((b, i) => {
    const base = new THREE.Group();
    base.position.set(b.x, b.y, b.z);
    base.rotation.y = b.rest;
    base.userData.dynamic = true;
    const lift = new THREE.Group();
    lift.userData.dynamic = true;
    lift.add(new THREE.Mesh(ablGeo[i], missouriMaterials().sheet));
    base.add(lift);
    g.add(base);
    return { base, lift, len: b.len, h: b.h, raise: 0 };
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildMissouriHull],
  ['armour', armour],
  ['screws', screws],
  ['launchers', launchers],
];

export function buildMissouri() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'missouri';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function missouriParts() {
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
