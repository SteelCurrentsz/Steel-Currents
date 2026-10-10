// IJN Kongo, drawn from the owner's sculpts of her.
//
// Two hundred and twenty-two metres, thirty-six thousand tonnes, eight
// 35.6 cm in four twin turrets -- two forward, the second superfiring, and two
// aft -- and thirty knots: a battlecruiser built at Barrow to Thurston's design
// and rebuilt twice at home into a fast battleship, with a pagoda of a bridge
// over her forecastle and her 15.2 cm in casemates in her side.
//
// Her hull, her decks, her superstructure, her funnels, her mainmast and her
// bridge are the sculpts (see kongoHull.js and build/prepare-kongo-hull.mjs),
// and so are every one of her guns. What is built here is everything that
// moves or fires:
//
//   * her four 35.6 cm turrets, the sculpt's own gunhouse on a barbette of its
//     own, its barrels on a cradle that elevates;
//   * her eight 15.2 cm, four a side, each in a casemate in her side: the
//     owner's sculpt of the gun, its shield in the embrasure and its barrel out
//     through it, training round its own beam;
//   * her 12.7 cm twins in their tubs and her 25 mm triples on her decks, the
//     owner's sculpts of each;
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
  buildKongoHull, kongoSeatY, kongoSurfaceY, MOUNT_SEATS, SCULPT_LINES, kongoMaterials, gunPiece,
} from './kongoHull.js';
import { SCREWS } from './kongoHull.data.js';

const CLS = SHIP_CLASSES.kongo;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: the fleet's grey on her guns and
// her fittings.
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
export const deckAt = (z) => kongoSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

// Each of her 35.6 cm turrets trains on a barbette ten metres across, inside
// the ring of its own skirt.
const BARBETTE_R = 5.0;

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
  m.add(new THREE.Mesh(piece.house, kongoMaterials().plating));
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

/** The barbettes her turrets train on, from her deck up. */
function barbettes(g) {
  for (const t of MOUNT_SEATS.turrets) {
    const foot = Math.min(deckOver((2 * t.z) / LOA), kongoSurfaceY(t.x, t.z)) - 0.3;
    const top = t.seat - 0.02;
    cyl(g, M.steel, BARBETTE_R, BARBETTE_R, top - foot, t.x, (top + foot) / 2, t.z, 40);
    // The coaming round its foot, where it goes through her deck.
    cyl(g, M.steelDark, BARBETTE_R + 0.18, BARBETTE_R + 0.18, 0.4, t.x, foot + 0.3, t.z, 40);
  }
}

// Her casemates: an embrasure in her side for each 15.2 cm, a dark port in
// her plating with a sill under it and a head over it, standing a hand proud of
// her side, through which the gun's shield shows and its barrel comes out.
const PORT = { long: 6.0, high: 3.0, proud: 0.12 };
function casemates(g) {
  for (const s of MOUNT_SEATS.secondary) {
    const sgn = Math.sign(s.side);
    const y = s.seat + gunPiece('sec').trunnion[1];
    const x = s.side + sgn * PORT.proud / 2;
    box(g, M.gunDark, PORT.proud, PORT.high, PORT.long, x - sgn * 0.04, y, s.z);
    for (const dy of [-1, 1]) box(g, M.steelDark, PORT.proud * 2.2, 0.22, PORT.long + 0.5, x, y + dy * (PORT.high / 2 + 0.08), s.z);
    for (const dz of [-1, 1]) box(g, M.steelDark, PORT.proud * 2.2, PORT.high + 0.4, 0.22, x, y, s.z + dz * (PORT.long / 2 + 0.08));
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
  m.add(new THREE.Mesh(piece.house, kongoMaterials().plating));
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
    const m = sculpted(g, 'sec', seat.x, seat.seat, seat.z, seat.rest, CLS.secondary.traverse);
    // The embrasure it looks out of, for the survey of its arc: its barrel goes
    // out through the port, a barrel's thickness inside its edges.
    m.userData.casemate = {
      x: seat.side, y: seat.seat + gunPiece('sec').trunnion[1], z: seat.z,
      half: PORT.long / 2 - 0.25, high: PORT.high / 2 - 0.25,
    };
    sec.push(m);
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
      const y = m.y !== undefined ? m.y : kongoSeatY(m.x, m.z, gun.caliber === 127 ? 1.8 : 1.2);
      const a = gun.caliber === 127
        ? sculpted(g, 'twin', m.x, y, m.z, stowed(m), 0.28)
        : sculpted(g, 'aa', m.x, y, m.z, stowed(m), 0.9);
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the Kongo built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          203 mm, Barrow's, from her armour deck down under her
 *                     waterline, from No.1's barbette to No.4's
 *   the armour deck   over the citadel, thickened when she was rebuilt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her four turrets, 254 mm, down to the armour deck
 */
const CITADEL = [-71, 64];
const ARMOUR_DECK = 2.6;
const BELT_FOOT = -4.5;

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
// prepare-kongo-hull.mjs): three-bladed, three and a quarter metres across,
// and handed.
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
  ['hullModel', buildKongoHull],
  ['barbettes', barbettes],
  ['casemates', casemates],
  ['armour', armour],
  ['screws', screws],
];

export function buildKongo() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'kongo';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function kongoParts() {
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
