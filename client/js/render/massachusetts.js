// USS Massachusetts, drawn from the owner's sculpt of her.
//
// A South Dakota: two hundred and seven metres of the most tightly packed
// battleship the United States built under the treaties -- nine sixteen-inch
// guns in three triple turrets on a hull short enough that her belt could be
// twelve inches of plate inclined inside her, twenty five-inch in ten twin
// mounts, five a side, round a single funnel faired into her tower, and by
// 1944 a light battery of seventy-two 40 mm barrels. Two catapults on her
// fantail throw her Kingfishers off.
//
// Her hull, her superstructure, her funnel, her masts and her aircraft crane
// are the sculpt (see massachusettsHull.js and
// build/prepare-massachusetts-hull.mjs), painted in Measure 22 -- navy blue up
// to her deck edge, haze grey over it, her decks deck blue -- and plated in
// steel. What is built here is everything that moves or fires:
//
//   * her three 16-inch turrets, the sculpt's own gunhouses cut free of her and
//     painted as she is, with their barrels turned true along the sculpt's
//     barrels -- No.1 on her forecastle, No.2 superfiring over it, and No.3 on
//     her quarterdeck facing astern;
//   * her ten twin 5-inch, each the owner's own sculpt of the mount with the
//     square base it was sculpted on taken off, the same mount the Baltimore
//     carries, standing on the deck where the ship sculpt drew a gunhouse
//     for it;
//   * her quadruple 40 mm Bofors in their tubs and her Oerlikons, where the
//     sculpt drew them, and the quad on the roof of No.2 and of No.3, which
//     trains with its turret;
//   * her two catapults, which train out over her quarters and throw a
//     Kingfisher off on the simulation's clock;
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
import { quadBofors, oerlikon } from './usnguns.js';
import { kingfisher } from './planekit.js';
import { RIG, fitCatapults } from './catapult.js';
import { secondaryPieces, SECONDARY_PIECE } from './baltimoreHull.js';
import {
  buildMassachusettsHull, massachusettsSeatY, massachusettsSurfaceY, turretPieces, TURRET_PIECES,
  SECONDARY_SEATS, SCULPT_LINES, massachusettsMaterials,
} from './massachusettsHull.js';
import { SCREWS } from './massachusettsHull.data.js';

const CLS = SHIP_CLASSES.massachusetts;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here, as Measure 22 has them and as her
// sculpt is painted (see build/prepare-massachusetts-hull.mjs): haze grey on
// her guns and her fittings, deck blue on their floors.
const P = {
  steel: 0x87909a,
  steelDark: 0x5c646d,
  gun: 0x87909a,
  gunDark: 0x4d545c,
  deckDark: 0x49535f,
  canvas: 0x8c8a7c,
  glass: 0x25303a,
  brass: 0x8a7340,
  armour: 0x4d555c,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --
//
// Off the sculpt, a metre at a time along her (see the build script): her
// keel, the deck over her insides, and how far out her side is at every half
// metre of height. They are what her interior and her armour are fitted under
// and what the fleet's checks feel her plating over.

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
/** The deck over her insides at station t: her main deck, end to end. */
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
/** How far her inner bottom stands over her keel, which her insides stand on. */
const INNER_BOTTOM = 0.15;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => massachusettsSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

/**
 * One of her 16-inch/45 Mk 6 triples, as the sculpt drew it.
 *
 * The gunhouse is the piece of her the build script's box took out of her,
 * down to the barbette it trains on, so it stands exactly where the sculpt had
 * it and turns about the middle of that barbette. The barrels are measured off
 * the sculpt -- where each runs, how far apart, how thick along its length --
 * and turned true: they elevate about trunnions just inside the face.
 */
function sixteenInch(g, i) {
  const spec = TURRET_PIECES[i];
  const { house, guns } = turretPieces(i);
  const m = new THREE.Group();
  m.position.set(spec.x, spec.seat, spec.z);
  // Her bearing is her rotation: the simulation lays her by setting it. No.3
  // faces astern.
  m.rotation.y = spec.rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.gun.traverse;
  // The gunhouse in her own paint, plated as her upperworks are.
  m.add(new THREE.Mesh(house, massachusettsMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(spec.trunnion[0], spec.trunnion[1], spec.trunnion[2]);
  cradle.rotation.x = -spec.pitch;
  cradle.add(new THREE.Mesh(guns, M.gun));
  // The canvas blast bags where the barrels go through the face, so no
  // elevation shows daylight round them.
  for (const [x] of spec.muzzles) {
    cyl(cradle, M.canvas, 0.62, 0.7, 1.0, x, 0, 0.65, 16).rotation.x = Math.PI / 2;
  }
  m.add(cradle);
  arm(m, cradle, spec.muzzles);
  // The quad Bofors the sculpt stood on her roof, in its tub, facing the way
  // she does: it goes round with her.
  const roof = ROOF_QUADS[spec.name];
  if (roof) quadBofors(m, M, roof[0], spec.roof, roof[1], 0, { tubR: 2.0, lockers: [] });
  g.add(m);
  return m;
}

// Where on the roofs of No.2 and No.3 the sculpt stood a quad 40 mm: across
// and along each turret's own axis from its pivot, towards its muzzles.
const ROOF_QUADS = { 'No.2': [-0.4, -4.6], 'No.3': [-0.2, -5.75] };

function mainBattery(g) {
  const turrets = TURRET_PIECES.map((_, i) => sixteenInch(g, i));
  g.userData.turrets = turrets;
  return turrets;
}

// ------------------------------------------------------ secondary battery --

/**
 * Where each of her 5-inch stands, off the build script: the middle of the
 * gunhouse the sculpt drew for it, which way it faces, and the deck it stands
 * on, each side as the sculpt drew it.
 */
function secondarySeat(m) {
  const seat = SECONDARY_SEATS.find((s) => Math.abs(s.x - m.x) < 0.05 && Math.abs(s.z - m.z) < 0.05);
  if (!seat) throw new Error(`the Massachusetts has a 5-inch at ${m.x}, ${m.z} her build does not`);
  return seat;
}

/**
 * The Baltimore's 5-inch was prepared to the gunhouses her sculpt drew; the
 * ones this sculpt drew are smaller -- three and a half metres across, not
 * four and a third -- and the mount is drawn to them.
 */
export const SEC_SCALE = 0.84;
let secCache = null;
function secondaryDrawn() {
  if (!secCache) {
    const { house, guns } = secondaryPieces();
    const k = SEC_SCALE;
    secCache = {
      house: house.clone().scale(k, k, k),
      guns: guns.clone().scale(k, k, k),
      trunnion: SECONDARY_PIECE.trunnion.map((v) => v * k),
      muzzles: SECONDARY_PIECE.muzzles.map((p) => p.map((v) => v * k)),
      pitch: SECONDARY_PIECE.pitch,
    };
  }
  return secCache;
}

/**
 * One of her twin 5-inch/38 in its Mk 28 mount: the owner's own sculpt of it,
 * the Baltimore's, with the square base it was sculpted standing on taken off
 * -- it stands on its own round pedestal, on her deck -- and its barrels
 * turned true along the sculpt's.
 */
function fiveInch(g, spec) {
  const seat = secondarySeat(spec);
  const piece = secondaryDrawn();
  const m = new THREE.Group();
  m.position.set(spec.x, seat.up, spec.z);
  m.rotation.y = seat.rest;
  // Laid by the bearing the simulation gives her, in her own frame: her
  // rotation is her bearing, not an offset from where she was built.
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.secondary.traverse;
  m.add(new THREE.Mesh(piece.house, massachusettsMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

// -------------------------------------------------- the anti-aircraft guns --

// Drawn where she stows the mounting, not on the middle of its arc.
const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);
/**
 * The radius of a quad Bofors tub: the fleet's usual, but for the four up on
 * the platform round her tower, which stand two to a side a tub's width
 * apart, and the one at the end of her after superstructure, which stands
 * against the deckhouse forward of it.
 */
function quadTub(m) {
  if (m.z > 2 && m.z < 10) return 1.7;
  if (Math.abs(m.x) < 1) return 2.0;
  return 2.2;
}

/**
 * Where round a tub its four ready-use lockers go: on her deck at the height
 * of the tub's floor, as far aft as there is room, a locker's width apart --
 * not over her side, and not into her superstructure.
 */
function lockerBearings(x, y, z, tubR) {
  const free = (a) => [tubR + 0.3, tubR + 0.5, tubR + 0.8].every((r) => {
    const h = massachusettsSurfaceY(x + Math.sin(a) * r, z + Math.cos(a) * r);
    return Math.abs(h - y) < 0.3;
  });
  const out = [];
  const tries = [];
  for (let k = 0; k < 24; k++) tries.push(Math.PI + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 12);
  for (const a of tries) {
    if (out.length === 4) break;
    if (free(a) && out.every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.55)) out.push(a);
  }
  return out;
}

/**
 * A light gun trains inside its tub, and the tub is turned to open behind it;
 * the scene lays the gun by its bearing in her frame, so it hangs off her,
 * not off the tub, where the tub has it.
 */
function offTheTub(g, a, m) {
  const tub = a.parent;
  a.removeFromParent();
  a.position.set(tub.position.x, tub.position.y + a.position.y, tub.position.z);
  a.rotation.y = stowed(m);
  g.add(a);
  return a;
}

function mountings(g) {
  const sec = [];
  const aa = [];
  for (const spec of CLS.secondary.mounts) sec.push(fiveInch(g, spec));
  // Every light mounting is laid by the scene, and carries its own arc and
  // stops off her datasheet (see ShipView.layMounts), and how high its
  // barrels have to be to clear her, bearing by bearing.
  const lights = lightMounts(CLS);
  let k = 0;
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let a;
      if (gun.caliber === 40) {
        const tubR = quadTub(m);
        const y = massachusettsSeatY(m.x, m.z, 1.2);
        const lockers = lockerBearings(m.x, y, m.z, tubR);
        a = offTheTub(g, quadBofors(g, M, m.x, y, m.z, stowed(m), { tubR, lockers }), m);
      } else {
        a = offTheTub(g, oerlikon(g, M, m.x, massachusettsSeatY(m.x, m.z, 0.6), m.z, stowed(m)), m);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the Massachusetts built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------------ aviation ----

// Her catapults, on her fantail either side of her crane, where the sculpt drew
// the one it drew: each on a turntable at its after end with its girder
// running forward from it and a hair outboard, and trained out over her
// quarter to shoot. Six metres off her centreline, which is as close as two
// Kingfishers' wings will go without meeting over her crane.
export const CAT_X = 6.0;
export const CAT_Z = -91.0;
// Her Kingfisher sits on the car just forward of the turntable, where her tail
// clears the quad Bofors on the fantail abaft her, and the girder is long
// enough ahead of her for the whole of the shot.
export const CAT_RIG = { ...RIG, BACK: -4.2, FRONT: 18.6, A: 1.0, REST: 0.12 };
const DECK_RUN = CLS.planes.deckRun;

function aviation(g) {
  const cats = [];
  // The starboard catapult first: the simulation puts her first scout up to
  // starboard, and the two are worked turn and turn about.
  for (const sgn of [-1, 1]) {
    const x = sgn * CAT_X;
    const cat = new THREE.Group();
    cat.position.set(x, massachusettsSeatY(x, CAT_Z, 1.2), CAT_Z);
    cat.rotation.y = sgn * CAT_RIG.REST;
    // She trains, so the welder leaves her and everything under her alone.
    cat.userData.dynamic = true;
    g.add(cat);
    const len = CAT_RIG.FRONT - CAT_RIG.BACK;
    const mid = (CAT_RIG.FRONT + CAT_RIG.BACK) / 2;
    // The turntable, the two rails, and the sleepers between them.
    cyl(cat, M.steelDark, 1.9, 2.1, 0.6, 0, 0.3, 0, 18);
    for (const rail of [-0.75, 0.75]) {
      box(cat, M.steel, 0.3, 0.5, len, rail, 1.05, mid);
      box(cat, M.steelDark, 0.36, 0.14, len, rail, 1.36, mid);
    }
    for (let i = 0; i < Math.floor(len / 1.95); i++) {
      box(cat, M.steel, 1.8, 0.24, 0.3, 0, 0.75, CAT_RIG.BACK + 0.8 + i * 1.95);
    }
    // Trusswork under the girder forward, where it is carried out over the
    // side with nothing under it but the sea.
    for (let i = 0; i < 7; i++) {
      const br = box(cat, M.steel, 0.16, 0.14, 2.4, 0, 0.55, 4.5 + i * 2.0);
      br.rotation.x = i % 2 ? 0.6 : -0.6;
    }
    // The powder charge house at the after end: the catapult is a gun, and
    // this is its breech.
    box(cat, M.steel, 2.2, 1.2, 2.2, 0, 1.25, CAT_RIG.BACK + 0.9);
    box(cat, M.steelDark, 1.0, 0.8, 1.0, 0, 2.0, CAT_RIG.BACK + 0.9);
    // The car she is bolted to, which is the thing that actually moves.
    const car = new THREE.Group();
    car.position.set(0, 0, CAT_RIG.A);
    car.userData.dynamic = true;
    cat.add(car);
    box(car, M.steelDark, 1.9, 0.4, 1.9, 0, 1.75, 0);
    box(car, M.steel, 2.0, 0.24, 0.5, 0, 1.5, -0.9);
    const plane = kingfisher(car, 0, CAT_RIG.PLANE_Y, CAT_RIG.PLANE_Z, 0, { spin: true });
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn });
  }
  g.userData.catapults = cats;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it is to be seen while her
 * plating is whole, and all of it is when a shell has opened her up.
 *
 *   the belt          310 mm of Class A over her magazines and machinery,
 *                     inside her plating and inclined nineteen degrees, top
 *                     outboard, from her second deck down, tapering below the
 *                     water to her triple bottom
 *   the armour deck   152 mm on her second deck over the citadel
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her three turrets down to the armour deck
 */
const CITADEL = [-57, 53];
const ARMOUR_DECK = 3.4;
const BELT_FOOT = -8.0;
const BARBETTE_R = 4.9;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 48;
  const [z0, z1] = CITADEL;
  // The belt, inclined nineteen degrees: a metre inboard of her plating at the
  // armour deck, and the rake of the plate further in at its foot.
  const rake = Math.tan((19 * Math.PI) / 180) * (ARMOUR_DECK - BELT_FOOT);
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 1.0), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 1.0 + rake * 0.4), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.0 + rake * 0.4), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 1.0), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  // The armour deck, over the top of the belt, both faces.
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.08 : -0.08), 40, up));
  }
  // The bulkheads that close the citadel, cut to her section at every height.
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
  // The barbettes of her three turrets, from under her main deck -- above it
  // they are the sculpt's own -- down through her decks to the armour deck:
  // seventeen and a quarter inches of it, and the trunk every shell and every
  // charge comes up. As round as the open ring the sculpt drew each gunhouse
  // on, which is four and three quarter metres to its inside.
  for (const t of TURRET_PIECES) {
    const top = deckOver((2 * t.z) / LOA) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 28));
  }
}

// --------------------------------------------------------------- screws --

// Her four shafts, and the screw on the end of each, where the sculpt drew its
// bare bosses (see prepare-massachusetts-hull.mjs).

function screws(g) {
  for (const s of SCREWS) {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    // She turns, so the welder is told to leave her alone.
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.55, 0.4, 1.0, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.4, 0.12, 0.7, 0, 0, -0.8, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.55, 0.11, s.r * 1.4,
        Math.sin(a) * s.r * 0.55, Math.cos(a) * s.r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * Math.sign(s.x);
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

// What is built here besides her guns: the sculpt, and the parts of her that
// are not the sculpt -- her catapults and their aeroplanes, her armour and her
// screws.
const STATIC = [
  ['hullModel', buildMassachusettsHull],
  ['aviation', aviation],
  ['armour', armour],
  ['screws', screws],
];

export function buildMassachusetts() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides stand on her inner bottom, a hand's breadth over her keel.
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  // And inside every part of her that moves, after her batteries are on her.
  mergeMoving(g);
  g.userData.classId = 'massachusetts';
  // Her catapults. She carries her own launch: the scene only tells her when
  // the order was given, and she knows what a launch looks like.
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: massachusettsSeatY(CAT_X, CAT_Z, 1.2),
    catX: CAT_X, catZ: CAT_Z, run: DECK_RUN, aero: 'kingfisher',
  });
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function massachusettsParts() {
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
