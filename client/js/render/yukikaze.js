// IJN Yukikaze, drawn from the owner's sculpts of her.
//
// A hundred and eighteen metres, two and a half thousand tonnes, two 12.7 cm
// Type 3 twins in their C-type gunhouses -- No.1 on her forecastle, No.3 on
// her quarterdeck -- six 25 mm triples and eight singles, two quadruple banks
// of 61 cm tubes on her centreline, and rails and throwers for thirty-six
// depth charges on her quarterdeck: the Kagero-class destroyer that fought
// from the first day of the Pacific war to the last and came home.
//
// Her hull, her decks, her bridge, her funnels, her masts and her deckhouses
// are the sculpt (see yukikazeHull.js and build/prepare-yukikaze-hull.mjs),
// and so are her twins, her triples and her tubes. What is built here is
// everything that moves or fires:
//
//   * her two 12.7 cm twins, the owner's sculpt of the gunhouse, each training
//     on its ring with its barrels on a cradle that elevates;
//   * her six 25 mm triples, likewise;
//   * her eight single 25 mm, drawn afresh -- a pedestal, a cradle and one
//     barrel, the size of a man -- each training and elevating;
//   * her two banks of tubes, which train out on either beam and throw their
//     fish out over her side one after another, on the simulation's clock;
//   * her depth charge rails over her stern, her throwers either side of her
//     quarterdeck and the davit between them, with the charges on them;
//   * her two screws, which turn;
//
// and, inside her, her splinter protection and her interior, fitted to her
// own lines.
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
import { fitTubes } from './tubes.js';
import {
  buildYukikazeHull, yukikazeSurfaceY, MOUNT_SEATS, SCULPT_LINES, yukikazeMaterials, gunPiece,
} from './yukikazeHull.js';
import { SCREWS } from './yukikazeHull.data.js';

const CLS = SHIP_CLASSES.yukikaze;
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
const INNER_BOTTOM = 0.1;
/** Where her deck is at (x, z): her own surface. */
export const deckAt = (z, x = 0) => yukikazeSurfaceY(x, z);

const seatOf = (kind) => MOUNT_SEATS.filter((s) => s.kind === kind);
const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

// --------------------------------------------------------- her mountings --

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y` on its ring, faces `rest`, and carries what elevates on a
 * cradle about its trunnions.
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
  m.add(new THREE.Mesh(piece.house, yukikazeMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/** Her two 12.7 cm twins: No.1 on her forecastle, No.3 on her quarterdeck. */
function mainBattery(g) {
  const seats = seatOf('twin');
  const turrets = CLS.turrets.map((spec, i) => {
    const seat = seats[i];
    const m = sculpted(g, 'twin', seat.x, seat.seat, seat.z, seat.rest, CLS.gun.traverse, spec.name);
    m.userData.rest = 0;
    return m;
  });
  g.userData.turrets = turrets;
  return turrets;
}

// The ring each twin trains on, as the sculpt drew it: a low barbette over her
// deck, the roller path the gunhouse stands on, and its foot let down into her
// deck so nothing is seen under it.
const RING = 2.15;
const BARBETTE = 2.45;
function rings(g) {
  for (const s of seatOf('twin')) {
    const top = s.seat - 0.02;
    let foot = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const y = yukikazeSurfaceY(s.x + Math.sin(a) * BARBETTE, s.z + Math.cos(a) * BARBETTE);
      if (y > -50) foot = Math.min(foot, y);
    }
    foot -= 0.3;
    cyl(g, M.steel, BARBETTE, BARBETTE, top - 0.08 - foot, s.x, (top - 0.08 + foot) / 2, s.z, 40);
    cyl(g, M.steelDark, BARBETTE + 0.04, BARBETTE + 0.04, 0.1, s.x, top - 0.07, s.z, 40);
    cyl(g, M.steelDark, RING, RING + 0.06, 0.08, s.x, top - 0.02, s.z, 36);
  }
}

/** A bank of 61 cm tubes: it trains whole on its ring on her deck, its four tubes level. */
function torpedoBank(g, spec, seat) {
  const piece = gunPiece('tubes');
  const m = new THREE.Group();
  m.position.set(seat.x, seat.seat, seat.z);
  m.rotation.y = spec.rest ?? spec.angle;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = `tubes ${spec.id + 1}`;
  m.userData.trainRate = CLS.torpedoes.traverse;
  m.add(new THREE.Mesh(piece.house, yukikazeMaterials().plating));
  // Nothing elevates: the cradle is where the tubes' axes are, so that the
  // muzzles are read off the line the fish leave along.
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  m.add(cradle);
  arm(m, cradle, piece.bores.map(([x, y, , zm]) => [x, y - piece.trunnion[1], zm]));
  m.userData.bores = piece.bores;
  g.add(m);
  return m;
}

// The plate a 25 mm triple stands on: as far out as the sculpt's own was cut,
// over the hole its pedestal went down through.
const AA_PLATE = 1.45;

/**
 * A single 25 mm Type 96, drawn afresh: the sculpt's singles were drips. A
 * pedestal bolted to her deck, a cradle on it that one man trains and
 * elevates by his shoulder rests, and on the cradle the gun -- its receiver,
 * its fifteen-round magazine on top, its barrel a metre and a half long with
 * its flash hider -- and the ring sight over it. A gun a man stands behind,
 * a little under two metres to the top of its sight.
 */
const SINGLE = { trunnion: 1.05, muzzle: 1.62 };
function singleGun(g, spec, y) {
  const m = new THREE.Group();
  m.position.set(spec.x, y, spec.z);
  m.rotation.y = stowed(spec);
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = 1.2;
  // The pedestal and its foot.
  cyl(m, M.steelDark, 0.3, 0.32, 0.08, 0, 0.04, 0, 14);
  cyl(m, M.gun, 0.13, 0.19, 0.8, 0, 0.48, 0, 12);
  // The carriage that trains on it: a yoke up either side of the gun.
  box(m, M.gun, 0.42, 0.12, 0.34, 0, 0.92, 0);
  for (const s of [-1, 1]) box(m, M.gun, 0.05, 0.22, 0.26, s * 0.19, 1.02, 0);
  const cradle = new THREE.Group();
  cradle.position.set(0, SINGLE.trunnion, 0);
  m.add(cradle);
  // The receiver and its magazine; the recoil spring over the barrel's root.
  box(cradle, M.gunDark, 0.13, 0.17, 0.78, 0, 0.0, -0.08);
  box(cradle, M.gunDark, 0.06, 0.22, 0.16, 0, 0.18, -0.02);
  cyl(cradle, M.gunDark, 0.05, 0.05, 0.42, 0, 0.0, 0.48, 10).rotation.x = Math.PI / 2;
  // The barrel, and its flash hider at the muzzle.
  cyl(cradle, M.gunDark, 0.026, 0.03, 1.0, 0, 0.0, 1.0, 8).rotation.x = Math.PI / 2;
  cyl(cradle, M.gunDark, 0.055, 0.03, 0.14, 0, 0.0, SINGLE.muzzle - 0.07, 8).rotation.x = Math.PI / 2;
  // The shoulder rests and the grips under them, behind the breech.
  for (const s of [-1, 1]) {
    box(cradle, M.steelDark, 0.04, 0.04, 0.5, s * 0.22, -0.08, -0.55);
    box(cradle, M.steelDark, 0.06, 0.16, 0.1, s * 0.22, -0.14, -0.8);
  }
  // The ring sight on its post.
  box(cradle, M.steelDark, 0.02, 0.24, 0.02, 0, 0.2, 0.3);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 16), M.steelDark);
  ring.position.set(0, 0.36, 0.3);
  cradle.add(ring);
  arm(m, cradle, [[0, 0, SINGLE.muzzle]]);
  g.add(m);
  return m;
}

function mountings(g) {
  const aa = [];
  const lights = lightMounts(CLS);
  const [triples, singles] = CLS.aa.guns;
  const aaSeats = seatOf('aa');
  const singleSeats = seatOf('single');
  const nearest = (seats, m) => seats.reduce((a, b) => (Math.hypot(b.x - m.x, b.z - m.z) < Math.hypot(a.x - m.x, a.z - m.z) ? b : a));
  for (const m of triples.mounts) {
    // Each stands where the sculpt's own stood, on the floor it was cut out of.
    const seat = nearest(aaSeats, m);
    cyl(g, M.steelDark, AA_PLATE, AA_PLATE, 0.08, m.x, seat.seat - 0.03, m.z, 28);
    const a = sculpted(g, 'aa', m.x, seat.seat, m.z, stowed(m), 0.9);
    a.userData.rest = 0;
    a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
    a.userData.stops = triples.elev || null;
    a.userData.lift = m.lift || null;
    aa.push(a);
  }
  for (const m of singles.mounts) {
    const seat = nearest(singleSeats, m);
    const a = singleGun(g, m, seat.seat);
    a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
    a.userData.stops = singles.elev || null;
    a.userData.lift = m.lift || null;
    aa.push(a);
  }
  if (aa.length !== lights.length) throw new Error('the Yukikaze built a light battery her datasheet does not list');
  const banks = seatOf('tubes');
  const torp = CLS.torpedoes.mounts.map((spec, i) => torpedoBank(g, spec, banks[i]));
  g.userData.secMounts = [];
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { aa, torp };
}

// ------------------------------------------------------- depth charges --
//
// Two rails over her stern with the charges nose to tail on them, a Type 94
// thrower either side of her quarterdeck to put one out on each beam, and the
// davit between them that swings the next charges up out of her magazine.
// Everything stands where her datasheet says, because the simulation drops
// the charges from those stations.

const D = CLS.depthCharges;
// A Type 95 charge: a drum sixty centimetres long and forty-five across.
const DRUM = { r: 0.225, len: 0.62 };
// How far forward of the trip at her stern each rail runs.
const RAIL = 4.6;

function drum(g, x, y, z, upright = false) {
  const c = cyl(g, M.gunDark, DRUM.r, DRUM.r, DRUM.len, x, y, z, 12);
  if (!upright) c.rotation.x = Math.PI / 2;
  for (const e of [-0.28, 0.28]) {
    const h = cyl(g, M.steelDark, DRUM.r + 0.015, DRUM.r + 0.015, 0.05, x, y + (upright ? e : 0), z + (upright ? 0 : e), 12);
    if (!upright) h.rotation.x = Math.PI / 2;
  }
  return c;
}

function depthCharges(g) {
  // The rails: two runs of angle iron apiece, on stanchions off her deck, the
  // charges lying on them waiting to be tripped over her stern one at a time.
  for (const r of D.racks) {
    const z1 = r.z - 1.0;
    const z0 = r.z + RAIL;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const ya = deckAt(za, r.x), yb = deckAt(zb, r.x);
      for (const rail of [-0.26, 0.26]) {
        const len = Math.hypot(zb - za, yb - ya) + 0.02;
        const b = box(g, M.steelDark, 0.09, 0.3, len, r.x + rail, (ya + yb) / 2 + 0.25, (za + zb) / 2);
        b.rotation.x = Math.atan2(yb - ya, za - zb);
      }
      if (i % 2 === 0) {
        box(g, M.steelDark, 0.7, 0.1, 0.14, r.x, ya + 0.05, za);
        for (const rail of [-0.26, 0.26]) box(g, M.steelDark, 0.06, 0.2, 0.06, r.x + rail, ya + 0.1, za);
      }
    }
    for (let i = 0; i < 6; i++) {
      const z = r.z + RAIL - 0.6 - i * 0.72;
      drum(g, r.x, deckAt(z, r.x) + 0.55, z);
    }
    // The trip gear at the after end, and the stop that holds the string.
    const ry = deckAt(r.z, r.x);
    box(g, M.steelDark, 0.8, 0.5, 0.5, r.x, ry + 0.25, r.z + 0.1);
    box(g, M.gunDark, 0.2, 0.7, 0.14, r.x, ry + 0.75, r.z + 0.3);
  }
  // The throwers: a mortar on its bedplate canted out over her side, its
  // arbor loaded with a charge, and the next charges in a rack beside it.
  for (const t of D.throwers) {
    const sgn = Math.sign(t.x);
    const k = new THREE.Group();
    k.position.set(t.x, deckAt(t.z, t.x), t.z);
    k.rotation.z = -sgn * 0.5;
    g.add(k);
    box(k, M.steelDark, 0.8, 0.16, 0.8, 0, 0.08, 0);
    cyl(k, M.gunDark, 0.24, 0.34, 1.3, 0, 0.75, 0, 12);
    cyl(k, M.gunDark, 0.28, 0.28, 0.5, 0, 1.55, 0, 12);
    cyl(k, M.steelDark, 0.26, 0.3, 0.3, 0, 0.12, 0, 10);
    drum(k, 0, 1.95, 0);
    // Ready charges in their chocks, forward of it along her side.
    for (let i = 0; i < 3; i++) {
      const z = t.z + 1.2 + i * 0.7;
      const x = t.x - sgn * 0.15;
      drum(g, x, deckAt(z, x) + 0.32, z, true);
    }
    box(g, M.steelDark, 0.55, 0.12, 2.3, t.x - sgn * 0.15, deckAt(t.z + 1.9, t.x) + 0.06, t.z + 1.9);
  }
  // The davit on her centreline between the throwers: a post, its jib out
  // over her quarterdeck, and the fall hanging from it.
  {
    const z = (D.throwers[0].z + D.racks[0].z + RAIL) / 2 + 1.0;
    const y = deckAt(z);
    cyl(g, M.steelDark, 0.25, 0.25, 0.12, 0, y + 0.06, z, 12);
    cyl(g, M.steel, 0.1, 0.13, 3.4, 0, y + 1.7, z, 10);
    const jib = cyl(g, M.steel, 0.06, 0.08, 2.4, 0, y + 3.0, z - 1.0, 8);
    jib.rotation.x = Math.PI / 2 - 0.35;
    box(g, M.steelDark, 0.02, 1.6, 0.02, 0, y + 2.4, z - 2.0);
    box(g, M.steelDark, 0.18, 0.22, 0.18, 0, y + 1.5, z - 2.0);
  }
}

/** Her ensign staff, right aft over her stern, raked with her. */
function ensignStaff(g) {
  const z = -58.2;
  const y = deckAt(z);
  const s = cyl(g, M.steelDark, 0.05, 0.09, 6.5, 0, y + 3.2, z - 0.4, 8);
  s.rotation.x = -0.12;
  box(g, M.steelDark, 0.5, 0.12, 0.5, 0, y + 0.06, z);
}

// --------------------------------------------- round her fore funnel --
//
// The sculpt melted the foot of her fore funnel into drapes, and
// prepare-yukikaze-hull.mjs takes it off her (CASING_CUT there): drawn here
// instead are the casing the funnel stands in, with its uptakes' hatches and
// a rail round its roof; the low house between it and her bridge, its roof a
// platform; and either side of the casing a 9 m cutter turned in on its pair
// of davits, its canvas cover on, its keel over her deck.

const CASING = { x: 2.2, z0: 10.0, z1: 16.6, top: 7.6 };
const HOUSE = { x: 4.2, z0: 16.2, z1: 19.6, top: 5.7 };
const BOATS = [{ x: -4.1, z: 13.2 }, { x: 4.1, z: 13.2 }];
const BOAT = { half: 4.5, beam: 1.0, depth: 0.85, keel: 5.5 };

function casing(g) {
  const C = CASING;
  // Her deck beside it: over its own middle her surface is the funnel's mouth.
  const deck = (z) => deckAt(z, C.x + 0.6);
  const foot = deck((C.z0 + C.z1) / 2) - 0.3;
  const zm = (C.z0 + C.z1) / 2;
  box(g, M.steel, 2 * C.x, C.top - foot, C.z1 - C.z0, 0, (C.top + foot) / 2, zm);
  box(g, M.steelDark, 2 * C.x + 0.12, 0.1, C.z1 - C.z0 + 0.12, 0, C.top + 0.02, zm);
  // Its doors and the hatches over the uptakes, either side.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.06, 1.8, 0.8, sgn * (C.x + 0.03), deck(C.z0 + 2) + 0.95, C.z0 + 2);
    box(g, M.steelDark, 0.06, 0.6, 1.6, sgn * (C.x + 0.03), C.top - 0.8, zm + 1.2);
    // The rail round its roof.
    box(g, M.steelDark, 0.04, 0.04, C.z1 - C.z0, sgn * (C.x - 0.05), C.top + 0.95, zm);
    for (let k = 0; k <= 5; k++) box(g, M.steelDark, 0.04, 0.9, 0.04, sgn * (C.x - 0.05), C.top + 0.5, C.z0 + 0.1 + (k / 5) * (C.z1 - C.z0 - 0.2));
  }
  // The low house abaft her bridge, and the rail round its roof.
  {
    const H = HOUSE;
    const hz = (H.z0 + H.z1) / 2;
    const hf = deckAt(hz, H.x + 0.5) - 0.3;
    box(g, M.steel, 2 * H.x, H.top - hf, H.z1 - H.z0, 0, (H.top + hf) / 2, hz);
    box(g, M.steelDark, 2 * H.x + 0.1, 0.08, H.z1 - H.z0 + 0.1, 0, H.top + 0.01, hz);
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.06, 1.8, 0.8, sgn * (H.x + 0.03), deckAt(hz, sgn * (H.x + 0.5)) + 0.95, hz);
      box(g, M.steelDark, 0.04, 0.04, H.z1 - H.z0, sgn * (H.x - 0.05), H.top + 0.95, hz);
      for (let k = 0; k <= 3; k++) box(g, M.steelDark, 0.04, 0.9, 0.04, sgn * (H.x - 0.05), H.top + 0.5, H.z0 + 0.1 + (k / 3) * (H.z1 - H.z0 - 0.2));
    }
  }
  // The boats and their davits.
  const hull = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  hull.scale(BOAT.beam, BOAT.depth, BOAT.half);
  const shell = new THREE.MeshLambertMaterial({ color: P.steel, side: THREE.DoubleSide });
  for (const b of BOATS) {
    const sgn = Math.sign(b.x);
    const y = BOAT.keel + BOAT.depth;
    const m = new THREE.Mesh(hull, shell);
    m.position.set(b.x, y, b.z);
    g.add(m);
    // The canvas over her, and her rubbing strake.
    const cover = new THREE.Mesh(new THREE.CircleGeometry(1, 20), M.steelDark);
    cover.rotation.x = -Math.PI / 2;
    cover.scale.set(BOAT.beam * 0.98, BOAT.half * 0.98, 1);
    cover.position.set(b.x, y + 0.02, b.z);
    g.add(cover);
    // The chocks she sits in, on a pair of stools off her deck.
    for (const dz of [-2.2, 2.2]) {
      const fy = deckAt(b.z + dz, b.x);
      const sy = y - BOAT.depth * Math.sqrt(1 - (dz / BOAT.half) ** 2) + 0.05;
      cyl(g, M.steelDark, 0.08, 0.1, sy - fy, b.x, (sy + fy) / 2, b.z + dz, 8);
      box(g, M.steelDark, 1.1, 0.12, 0.25, b.x, sy, b.z + dz);
    }
    // Her davits, at her ends: a post off her deck edge and its arm out
    // over her, the falls down to her.
    for (const dz of [-3.6, 3.6]) {
      const px = b.x + sgn * 0.9, z = b.z + dz;
      const fy = deckAt(z, b.x);
      cyl(g, M.steel, 0.1, 0.13, y + 1.6 - fy, px, (y + 1.6 + fy) / 2, z, 10);
      const arm = cyl(g, M.steel, 0.08, 0.08, 1.1, px - sgn * 0.45, y + 1.75, z, 8);
      arm.rotation.z = Math.PI / 2;
      box(g, M.steelDark, 0.02, 1.6, 0.02, b.x, y + 0.95, z);
    }
  }
}

// ------------------------------------------------------------ her armour --

/**
 * What protection she has, as structure inside her: none of it to be seen
 * while her plating is whole, all of it when a shell has opened her up.
 *
 *   the splinter belt   a thin strake over her machinery -- her three boiler
 *                       rooms under her funnels and her two engine rooms
 *                       abaft them -- from her deck to a metre under her
 *                       waterline
 *   the machinery deck  over it
 *   the magazines       boxed in under each of her twins
 *   the torpedo flats   the lockers her reloads lie in, boxed in beside each
 *                       bank of tubes
 */
const MACHINERY = [-21, 20];
const BELT_FOOT = -1.0;
const MAGAZINES = [[-43, -32], [34, 45]];
const LOCKERS = [[2.5, 8.5], [-16.5, -10.5]];

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.3, shellAt((2 * z) / LOA, y) - in_);
  const top = (z) => Math.min(deckOver((2 * z) / LOA), 3.4) - 0.15;
  const N = 28;
  const [z0, z1] = MACHINERY;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, top(za), 0.3), top(za), za], [sgn * at(za, BELT_FOOT, 0.3), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 0.3), BELT_FOOT, zb], [sgn * at(zb, top(zb), 0.3), top(zb), zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, top(z), 0.3), (z) => top(z) + (up ? 0.05 : -0.05), 28, up));
  }
  for (const [za, zb] of MAGAZINES) {
    // Its floor over her keel where her keel is highest, at its after end
    // aft as her bottom rises to her stern.
    const y0 = Math.max(keelY((2 * za) / LOA), keelY((2 * zb) / LOA)) + 0.6;
    const y1 = Math.min(1.8, deckOver((2 * (za + zb)) / (2 * LOA)) - 0.6);
    const w = Math.min(at(za, y0, 0.6), at(zb, y0, 0.6)) * 2;
    inside(box(g, M.armour, w, y1 - y0, zb - za, 0, (y0 + y1) / 2, (za + zb) / 2));
  }
  // The reload lockers, either side of each bank on her upper deck: four
  // fish to a side, in a steel box over her deck.
  for (const [za, zb] of LOCKERS) {
    const y = deckOver((za + zb) / LOA);
    for (const sgn of [-1, 1]) {
      const x = sgn * (at((za + zb) / 2, y - 0.4, 0.4) - 0.9);
      inside(box(g, M.armour, 1.2, 0.9, zb - za, x, y - 0.6, (za + zb) / 2));
    }
  }
}

// --------------------------------------------------------------- screws --

// Her two screws, on the ends of her shafts where the sculpt drew them (see
// prepare-yukikaze-hull.mjs): three-bladed, two and a half metres across,
// and handed.
function screws(g) {
  for (const s of SCREWS) {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.32, 0.26, 0.65, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.26, 0.06, 0.5, 0, 0, -0.55, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.55, 0.08, s.r * 1.2,
        Math.sin(a) * s.r * 0.5, Math.cos(a) * s.r * 0.5, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * Math.sign(s.x);
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildYukikazeHull],
  ['rings', rings],
  ['casing', casing],
  ['depthCharges', depthCharges],
  ['ensignStaff', ensignStaff],
  ['armour', armour],
  ['screws', screws],
];

export function buildYukikaze() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'yukikaze';
  // Her tubes fire on the simulation's clock.
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function yukikazeParts() {
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

/**
 * Where her depth charge gear stands, for the check that holds the model and
 * the datasheet together. Racks first and then throwers, which is the order
 * everything else numbers them in. See chargeMounts.
 */
export function yukikazeCharges() {
  return [...D.racks, ...D.throwers].map(({ x, z }) => ({ x, z }));
}
