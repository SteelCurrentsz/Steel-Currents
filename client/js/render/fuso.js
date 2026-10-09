// IJN Fuso, drawn from the owner's sculpts of her.
//
// Two hundred and twelve metres, thirty-five thousand tonnes, twelve 35.6 cm
// in six twin turrets -- more than anything else of her day, on a hull that
// was too small to carry them: three forward of her funnel, three aft, with
// the pagoda of a bridge that she and her sister Yamashiro were known by
// between the two sets. Rebuilt in 1930-35 and again for the 1944 war, she
// carries fourteen 15.2 cm singles in a ring round her upper deck, four
// 12.7 cm twins and a 25 mm battery on her superstructure and her deck, a
// pair of catapults on her quarterdeck and three floatplanes to fly off them.
//
// Her hull, her superstructure, her bridge, her funnel and her mainmast are the
// sculpts (see fusoHull.js and build/prepare-fuso-hull.mjs), and so are every
// one of her guns. What is built here is everything that moves or fires:
//
//   * her six 35.6 cm turrets, the sculpt's own gunhouse on a barbette of its
//     own, its barrels on a cradle that elevates -- No.1 and No.2 forward,
//     No.3 in front of her funnel facing forward over her bridge's block, back
//     to back with No.4 abaft it, and No.5 and No.6 aft, facing astern;
//   * her fourteen 15.2 cm singles in their shields, seven a side, on the
//     round pedestals the hull sheet drew them on;
//   * her 12.7 cm twins and her 25 mm triples, the owner's sculpts of each,
//     on her platforms and her deck;
//   * her two catapults, which train out over her quarters and throw a Jake
//     off on the simulation's clock;
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
import { jake } from './planekit.js';
import { RIG, fitCatapults } from './catapult.js';
import {
  buildFusoHull, fusoSeatY, fusoSurfaceY, MOUNT_SEATS, SCULPT_LINES, fusoMaterials, gunPiece,
} from './fusoHull.js';
import { SCREWS } from './fusoHull.data.js';

const CLS = SHIP_CLASSES.fuso;
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
export const deckAt = (z) => fusoSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

// Each of her 35.6 cm turrets trains on a barbette seven metres and a fifth
// across, inside the ring of its own skirt.
const BARBETTE_R = 3.6;

/**
 * One of her 35.6 cm twins, as the sculpt drew it: the gunhouse trains on its
 * barbette, and its barrels, blast bags and all, are on a cradle about
 * trunnions inside the face that lays them.
 */
function thirtyFive(g, spec) {
  const piece = gunPiece('main');
  const m = new THREE.Group();
  m.position.set(spec.x, spec.seat, spec.z);
  m.rotation.y = spec.rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = spec.name;
  m.userData.trainRate = CLS.gun.traverse;
  m.add(new THREE.Mesh(piece.house, fusoMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = MOUNT_SEATS.turrets.map((spec) => thirtyFive(g, spec));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes her turrets and her 15.2 cm train on, from her deck up. */
function barbettes(g) {
  for (const t of MOUNT_SEATS.turrets) {
    const foot = deckOver((2 * t.z) / LOA) - 0.3;
    const top = t.seat - 0.02;
    cyl(g, M.steel, BARBETTE_R, BARBETTE_R, top - foot, t.x, (top + foot) / 2, t.z, 36);
    // The coaming round its foot, where it goes through her deck.
    cyl(g, M.steelDark, BARBETTE_R + 0.18, BARBETTE_R + 0.18, 0.4, t.x, foot + 0.3, t.z, 36);
  }
  for (const s of MOUNT_SEATS.secondary) {
    const foot = deckOver((2 * s.z) / LOA) - 0.3;
    const top = s.seat - 0.02;
    cyl(g, M.steel, 1.35, 1.5, top - foot, s.x, (top + foot) / 2, s.z, 20);
  }
}

// ------------------------------------------------ the sculpted mountings --

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y` on the deck or barbette, faces `rest`, and carries its barrels
 * on a cradle about their trunnions. `bores` draws the barrels afresh where
 * the sculpt's own are stubs.
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
  m.add(new THREE.Mesh(piece.house, fusoMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  let muzzles = piece.muzzles;
  if (bores) {
    muzzles = piece.muzzles.map(([mx]) => [mx, 0, bores.len]);
    for (const [mx] of piece.muzzles) {
      cyl(cradle, M.gun, bores.r * 0.8, bores.r, bores.len, mx, 0, bores.len / 2, 10).rotation.x = Math.PI / 2;
      cyl(cradle, M.gunDark, bores.r * 0.95, bores.r * 0.95, 0.2, mx, 0, bores.len - 0.1, 10).rotation.x = Math.PI / 2;
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
    sec.push(sculpted(g, 'sec', seat.x, seat.seat, seat.z, seat.rest, CLS.secondary.traverse));
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
    for (const m of gun.mounts) {
      const y = m.y !== undefined ? m.y : fusoSeatY(m.x, m.z, gun.caliber === 127 ? 1.8 : 1.2);
      const a = gun.caliber === 127
        ? sculpted(g, 'twin', m.x, y, m.z, stowed(m), 0.28, { r: 0.14, len: 4.6 })
        : sculpted(g, 'aa', m.x, y, m.z, stowed(m), 0.9);
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the Fuso built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------------ aviation ----

// Her catapults, on her quarterdeck right aft: each on a turntable at its
// forward end, stowed pointing aft and a little inboard along her side, as the
// deck narrows to her stern, and trained out over her quarter to shoot. A Jake
// on the car of each. The pedestal stands on her quarterdeck, and the girder
// lies over it, its trusses a hand over the planking.
export const CAT_X = 4.0;
/** Her starboard catapult's turntable is this far aft, and her port one's the next: staggered, so the two Jakes' wings do not meet. */
export const CAT_Z = -77.0;
export const CAT_Z_PORT = -88.0;
const catZ = (sgn) => (sgn < 0 ? CAT_Z : CAT_Z_PORT);
export const CAT_RIG = {
  ...RIG, BACK: -3.0, FRONT: 15.6, A: 2.0, STROKE: 12.8, REST: 0.18, OUT: -0.95, PLANE_Y: 1.1, PLANE_Z: 0.4,
};
const DECK_RUN = CLS.planes.deckRun;
export const catY = () => fusoSurfaceY(0, CAT_Z) + 1.1;

function aviation(g) {
  const cats = [];
  const len = CAT_RIG.FRONT - CAT_RIG.BACK;
  const mid = (CAT_RIG.FRONT + CAT_RIG.BACK) / 2;
  const CAT_Y = catY();
  for (const sgn of [-1, 1]) {
    const x = sgn * CAT_X;
    const z = catZ(sgn);
    const QD = fusoSurfaceY(x, z);
    cyl(g, M.steelDark, 1.4, 1.65, CAT_Y - QD + 0.1, x, (CAT_Y + QD) / 2 - 0.05, z, 20);
    const cat = new THREE.Group();
    cat.position.set(x, CAT_Y, z);
    // Stowed pointing aft: the port one turned in by sgn, so a positive turn
    // of the starboard one is outboard.
    cat.rotation.y = Math.PI + sgn * CAT_RIG.REST;
    cat.userData.dynamic = true;
    g.add(cat);
    cyl(cat, M.steelDark, 1.7, 1.9, 0.45, 0, 0.22, 0, 20);
    for (const rail of [-0.62, 0.62]) {
      box(cat, M.steel, 0.26, 0.42, len, rail, 0.72, mid);
      box(cat, M.steelDark, 0.32, 0.12, len, rail, 0.97, mid);
    }
    for (let i = 0; i < Math.floor(len / 1.9); i++) {
      box(cat, M.steel, 1.5, 0.2, 0.26, 0, 0.5, CAT_RIG.BACK + 0.7 + i * 1.9);
    }
    for (let i = 0; i < 7; i++) {
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
    for (const dz of [-0.9, 1.1]) box(car, M.gunDark, 1.5, 0.22, 0.36, 0, 1.36, dz);
    const plane = jake(car, 0, CAT_RIG.PLANE_Y + 0.3, CAT_RIG.PLANE_Z, 0, false, { spin: true });
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn, base: Math.PI });
  }
  g.userData.catapults = cats;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          305 mm, from her armour deck down to her bilge
 *   the armour deck   over the citadel, with the sloped edge that meets the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her six turrets, 305 mm, down to the armour deck
 */
const CITADEL = [-72, 66];
const ARMOUR_DECK = 2.4;
const BELT_FOOT = -5.5;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 52;
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
    const top = deckOver((2 * t.z) / LOA) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, on the ends of her shafts where the sculpt drew them (see
// prepare-fuso-hull.mjs): three-bladed, four and a half metres across, and
// handed.
function screws(g) {
  for (const s of SCREWS) {
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
  ['hullModel', buildFusoHull],
  ['barbettes', barbettes],
  ['aviation', aviation],
  ['armour', armour],
  ['screws', screws],
];

export function buildFuso() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'fuso';
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: catY(),
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
export function fusoParts() {
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
