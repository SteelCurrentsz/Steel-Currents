// IJN Matsu, drawn from the owner's sculpts of her.
//
// A hundred metres, fourteen hundred tonnes, two 12.7 cm Type 89 twins --
// one in its shield on her forecastle, one open on her upper deck aft -- four
// 25 mm triples, a quadruple bank of 61 cm tubes on her centreline between
// her funnels, and racks and throwers for thirty-six depth charges on her
// quarterdeck: the escort destroyer Japan built in a hurry in 1944.
//
// Her hull, her decks, her bridge, her funnels, her masts and her deckhouses
// are the sculpt (see matsuHull.js and build/prepare-matsu-hull.mjs), and so
// are her guns and her tubes. What is built here is everything that moves or
// fires:
//
//   * her two 12.7 cm twins, the owner's sculpts of them, each training on its
//     ring with its barrels on a cradle that elevates;
//   * her four 25 mm triples, likewise;
//   * her bank of tubes, which trains out on either beam -- under the platform
//     her waist 25 mm stand on -- and throws its fish out over her side one
//     after another, on the simulation's clock;
//   * her depth charge rails over her stern and her throwers either side of
//     her quarterdeck, with the charges on them;
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
  buildMatsuHull, matsuSurfaceY, MOUNT_SEATS, SCULPT_LINES, matsuMaterials, gunPiece,
} from './matsuHull.js';
import { SCREWS, WAIST_PLATFORM } from './matsuHull.data.js';

const CLS = SHIP_CLASSES.matsu;
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
export const deckAt = (z, x = 0) => matsuSurfaceY(x, z);

const seatOf = (kind) => MOUNT_SEATS.filter((s) => s.kind === kind);

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
  m.add(new THREE.Mesh(piece.house, matsuMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/** Her two 12.7 cm twins: the one in its shield forward, the open one aft. */
function mainBattery(g) {
  const turrets = CLS.turrets.map((spec, i) => {
    const seat = seatOf(i === 0 ? 'shield' : 'open')[0];
    const m = sculpted(g, seat.kind, seat.x, seat.seat, seat.z, seat.rest, CLS.gun.traverse, spec.name);
    m.userData.rest = 0;
    return m;
  });
  g.userData.turrets = turrets;
  return turrets;
}

// The platforms her twins train on, as the sculpt drew them -- a round one
// half a metre high over her forecastle, a broader one over her upper deck
// aft -- each with the ring the mounting stands on, a coaming round its
// edge, and its foot down into her deck so nothing is seen under it.
const RING = { shield: 1.7, open: 2.0 };
const PLATFORM = { shield: 3.0, open: 3.4 };
function rings(g) {
  for (const kind of ['shield', 'open']) {
    const s = seatOf(kind)[0];
    const top = s.seat - 0.02;
    const R = PLATFORM[kind];
    let foot = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const y = matsuSurfaceY(s.x + Math.sin(a) * R, s.z + Math.cos(a) * R);
      if (y > -50) foot = Math.min(foot, y);
    }
    foot -= 0.3;
    cyl(g, M.steel, R, R, top - 0.1 - foot, s.x, (top - 0.1 + foot) / 2, s.z, 40);
    cyl(g, M.steelDark, R + 0.04, R + 0.04, 0.12, s.x, top - 0.08, s.z, 40);
    cyl(g, M.steelDark, RING[kind], RING[kind] + 0.06, 0.1, s.x, top - 0.03, s.z, 36);
  }
}

/** Her bank of 61 cm tubes: it trains whole on its ring on her deck, its four tubes level. */
function torpedoBank(g, spec, seat) {
  const piece = gunPiece('tubes');
  const m = new THREE.Group();
  m.position.set(seat.x, seat.seat, seat.z);
  m.rotation.y = spec.rest ?? spec.angle;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = 'tubes';
  m.userData.trainRate = CLS.torpedoes.traverse;
  m.add(new THREE.Mesh(piece.house, matsuMaterials().plating));
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

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);
// The plate a 25 mm stands on: as far out as the sculpt's own was cut.
const AA_PLATE = 1.45;

function mountings(g) {
  const aa = [];
  const lights = lightMounts(CLS);
  const aaSeats = seatOf('aa');
  let k = 0;
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      // Each stands where the sculpt's own stood, on the floor it was cut out of.
      const seat = aaSeats.reduce((a, b) => (Math.hypot(b.x - m.x, b.z - m.z) < Math.hypot(a.x - m.x, a.z - m.z) ? b : a));
      // The plate it stands on, over the hole its pedestal went down through
      // in the sculpt.
      cyl(g, M.steelDark, AA_PLATE, AA_PLATE, 0.08, m.x, seat.seat - 0.03, m.z, 28);
      const a = sculpted(g, 'aa', m.x, seat.seat, m.z, stowed(m), 0.9);
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the Matsu built a light battery her datasheet does not list');
  const T = CLS.torpedoes;
  const torp = T.mounts.map((spec) => torpedoBank(g, spec, seatOf('tubes')[0]));
  g.userData.secMounts = [];
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { aa, torp };
}

// ------------------------------------------------------- depth charges --
//
// Two rails over her stern with the charges nose to tail on them, and a
// Type 94 thrower either side of her quarterdeck to put one out on each beam.
// Everything stands where her datasheet says, because the simulation drops
// the charges from those stations.

const D = CLS.depthCharges;
// A Type 95 charge: a drum sixty centimetres long and forty-five across.
const DRUM = { r: 0.225, len: 0.62 };

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
  // The rails: two runs of angle iron apiece, sleepers under them, the
  // charges lying on them waiting to be tripped over her stern one at a time.
  for (const r of D.racks) {
    const z1 = r.z - 1.2;
    const z0 = r.z + 6.0;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const ya = deckAt(za, r.x), yb = deckAt(zb, r.x);
      for (const rail of [-0.26, 0.26]) {
        const len = Math.hypot(zb - za, yb - ya) + 0.02;
        const b = box(g, M.steelDark, 0.09, 0.3, len, r.x + rail, (ya + yb) / 2 + 0.25, (za + zb) / 2);
        b.rotation.x = Math.atan2(yb - ya, za - zb);
      }
      if (i % 2 === 0) box(g, M.steelDark, 0.7, 0.1, 0.14, r.x, ya + 0.05, za);
    }
    for (let i = 0; i < 8; i++) {
      const z = r.z + 5.4 - i * 0.72;
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
}

/**
 * The posts the platform over her waist stands on: one at each corner and one
 * either side between, steel tube braced to her deck, out at its edges where
 * her tubes swing clear of them.
 */
function platformPosts(g) {
  const W = WAIST_PLATFORM;
  const top = W.top - 0.3;
  for (const x of [W.x0 + 0.5, W.x1 - 0.5]) {
    for (const z of [W.z0 + 0.4, (W.z0 + W.z1) / 2, W.z1 - 0.4]) {
      const foot = deckAt(z, x) - 0.2;
      cyl(g, M.steel, 0.11, 0.13, top - foot, x, (top + foot) / 2, z, 10);
      cyl(g, M.steelDark, 0.2, 0.2, 0.08, x, deckAt(z, x) + 0.04, z, 10);
    }
    // A girder along its edge under it, from post to post.
    box(g, M.steelDark, 0.16, 0.3, W.z1 - W.z0 - 0.6, x, top - 0.12, (W.z0 + W.z1) / 2);
  }
}

/** Her ensign staff, right aft over her stern, raked with her. */
function ensignStaff(g) {
  const z = -49.0;
  const y = deckAt(z);
  const s = cyl(g, M.steelDark, 0.05, 0.09, 6.5, 0, y + 3.2, z - 0.4, 8);
  s.rotation.x = -0.12;
  box(g, M.steelDark, 0.5, 0.12, 0.5, 0, y + 0.06, z);
}

// ------------------------------------------------------------ her armour --

/**
 * What protection she has, as structure inside her: none of it to be seen
 * while her plating is whole, all of it when a shell has opened her up.
 *
 *   the splinter belt   a thin strake over her machinery, her boiler rooms
 *                       and her engine room, from her deck to a metre under
 *                       her waterline
 *   the machinery deck  over it
 *   the magazines       boxed in under each of her twins
 */
const MACHINERY = [-22, 10];
const BELT_FOOT = -1.0;
const MAGAZINES = [[-37, -29], [26, 34]];

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.3, shellAt((2 * z) / LOA, y) - in_);
  const top = (z) => Math.min(deckOver((2 * z) / LOA), 2.8) - 0.15;
  const N = 24;
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
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, top(z), 0.3), (z) => top(z) + (up ? 0.05 : -0.05), 24, up));
  }
  for (const [za, zb] of MAGAZINES) {
    // Its floor over her keel where her keel is highest, at its after end
    // aft as her bottom rises to her stern.
    const y0 = Math.max(keelY((2 * za) / LOA), keelY((2 * zb) / LOA)) + 0.6;
    const y1 = Math.min(1.4, deckOver((2 * (za + zb)) / (2 * LOA)) - 0.6);
    const w = Math.min(at(za, y0, 0.6), at(zb, y0, 0.6)) * 2;
    inside(box(g, M.armour, w, y1 - y0, zb - za, 0, (y0 + y1) / 2, (za + zb) / 2));
  }
}

// --------------------------------------------------------------- screws --

// Her two screws, on the ends of her shafts where the sculpt drew them (see
// prepare-matsu-hull.mjs): three-bladed, two metres across, and handed.
function screws(g) {
  for (const s of SCREWS) {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.3, 0.24, 0.6, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.24, 0.06, 0.45, 0, 0, -0.5, 12).rotation.x = Math.PI / 2;
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
  ['hullModel', buildMatsuHull],
  ['rings', rings],
  ['depthCharges', depthCharges],
  ['ensignStaff', ensignStaff],
  ['platformPosts', platformPosts],
  ['armour', armour],
  ['screws', screws],
];

export function buildMatsu() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'matsu';
  // Her tubes fire on the simulation's clock.
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes.launch);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function matsuParts() {
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
export function matsuCharges() {
  return [...D.racks, ...D.throwers].map(({ x, z }) => ({ x, z }));
}
