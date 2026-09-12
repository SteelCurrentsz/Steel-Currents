// IJN Takao, built out of her own lines.
//
// Two hundred and four metres of Japanese heavy cruiser: ten twenty-centimetre
// guns in five twin turrets, sixteen Long Lance tubes on the upper deck, and
// thirty-four and a half knots on fifteen thousand tonnes. She is a torpedo
// ship with a heavy gun armament bolted on, and the thing that makes her
// dangerous is not the guns -- the Type 93 is oxygen-driven, forty knots,
// twenty kilometres, and leaves no wake to see it coming.
//
// Three things have to be right or she is not her.
//
// The first is the bridge. Takao and Atago were given a superstructure so
// enormous that the class was nicknamed after castles: a single slab-sided
// tower ten decks high standing on the forecastle, wider than it is long,
// with the compass platform stepped out over the front of it. Nothing else
// afloat looks like it. It was cut down on both ships in 1939 and this is
// the ship as she was at Leyte Gulf, with the tower trimmed but still huge.
//
// The second is the turret grouping: three forward and two aft, with No. 3
// superfiring over No. 2 which superfires over No. 1. Three twin turrets
// stacked up the forecastle is a Japanese arrangement and nobody else's.
//
// The third is her sheer, which is a wave line -- her deck edge dips
// amidships and rises at both ends -- and the flare of the bow above it.
// Hiraga's hulls all have it and it is why a Japanese cruiser looks fast
// standing still.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, ladder } from './shipkit.js';
import { jake } from './planekit.js';
import { hullForm, plateHull, weatherDeck, guardRail } from './hullform.js';
import {
  eightInch, typeEightNine, triple25, twin25, quadTorp,
  rangefinder, director, typeTwentyOne, typeThirteen, searchlight, cowl, boat,
} from './ijnguns.js';

const CLS = SHIP_CLASSES.takao;
export const LOA = CLS.hull.length;      // 203.8 m
export const BEAM = CLS.hull.beam;       // 20.4 m
export const DRAFT = CLS.hull.draft;     // 6.3 m
/** Starboard, in this frame. */
const S = -1;

// Yokosuka grey, which is darker and bluer than the Kure grey Yamato wears,
// over a linoleum upper deck held down with brass strips.
const P = {
  hull: 0x565e67,
  hullDark: 0x474e56,
  boot: 0x181b1f,
  antifoul: 0x662d24,
  deck: 0x8a6c48,          // linoleum
  deckSteel: 0x4b5259,
  deckDark: 0x3e444b,
  steel: 0x646c75,
  steelDark: 0x4f565e,
  bright: 0x7e868f,
  gun: 0x5e666f,
  gunDark: 0x3b4147,
  canvas: 0x87877c,
  glass: 0x27333e,
  cave: 0x13171b,
  brass: 0x8a7340,
  boat: 0x6a6250,
  chrys: 0x9d8140,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

// Half-breadth off her body plan. A Japanese cruiser of this generation is
// very fine forward and carries her beam a long way aft, which is what thirty-
// four knots on a cruiser hull costs: she is nearly a destroyer's shape scaled
// up, with the bulges worked into the plating amidships.
const HALF_BEAM = [
  [-1.00, 0.90], [-0.95, 1.90], [-0.88, 3.30], [-0.80, 4.55], [-0.70, 5.95],
  [-0.58, 7.35], [-0.44, 8.65], [-0.30, 9.55], [-0.14, 10.10], [0.02, 10.20],
  [0.16, 10.05], [0.30, 9.60], [0.44, 8.75], [0.56, 7.65], [0.68, 6.20],
  [0.78, 4.75], [0.87, 3.25], [0.93, 2.05], [0.97, 1.15], [1.00, 0.18],
];

// Her keel: a fine forefoot sweeping up into a raked stem, a long flat run
// under the machinery, and a cruiser counter over four screws.
const KEEL = [
  [-1.00, -1.20], [-0.95, -3.60], [-0.88, -5.00], [-0.78, -5.80], [-0.62, -6.25],
  [-0.24, -6.35], [0.16, -6.35], [0.44, -6.20], [0.62, -5.70], [0.76, -4.60],
  [0.87, -2.80], [0.94, -0.60], [1.00, 1.40],
];

// Her sheer, and this is the line. Hiraga's wave-form deck: highest at the
// stem, falling to a minimum abreast the after funnel, and lifting again over
// the quarterdeck. Every Japanese cruiser from Furutaka on has it.
const SHEER = [
  [-1.00, 6.05], [-0.88, 5.95], [-0.72, 5.80], [-0.54, 5.70], [-0.36, 5.72],
  [-0.18, 5.90], [0.00, 6.25], [0.18, 6.80], [0.34, 7.45], [0.48, 8.15],
  [0.62, 8.85], [0.74, 9.45], [0.84, 9.95], [0.92, 10.30], [1.00, 10.60],
];

// And the flare, which forward is very pronounced: a Japanese cruiser's bow
// above water is almost a knife edge at the stem opening to a metre and a half
// of overhang by the breakwater.
const FLARE = [
  [-1.00, 0.08], [-0.62, 0.12], [-0.26, 0.16], [0.06, 0.26], [0.30, 0.48],
  [0.48, 0.78], [0.62, 1.10], [0.74, 1.38], [0.83, 1.48], [0.90, 1.35],
  [0.95, 0.95], [1.00, 0.18],
];

const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE,
  // A well-raked stem -- four and a half metres over her freeboard -- and a
  // cruiser counter over the screws.
  stem: 4.6, stemLo: -6.4, stemUp: 17.0, stemPow: 1.12,
  counter: 3.2, counterLo: -1.2, counterUp: 6.4, counterPow: 1.42,
  bilge: 0.33,
  stations: 108,
});

export const { deckAt, halfDeck } = F;
/** Her lines, for the tests: the shell, the keel, the sheer and the rake. */
export const LINES = F;
const sheer = F.sheer;

// Where everything stands, off her 1944 general arrangement.
const T1_Z = 64;        // No. 1 turret
const T2_Z = 53;        // No. 2, superfiring
const T3_Z = 42;        // No. 3, superfiring again
const BRIDGE_Z = 24;    // the castle
const F1_Z = 2;         // the forward funnel, trunked into the after one
const F2_Z = -12;
const TORP_F = -4;      // the forward pair of quadruple mounts
const TORP_A = -20;
const MAST_Z = -26;
const AIR_Z = -38;      // the aircraft deck and the catapults
const T4_Z = -56;
const T5_Z = -68;

// Her built-up levels. The upper deck runs the whole length; the 01 deck
// carries the torpedo mounts and the boat stowage.
const UPPER = 9.2;
const L01 = UPPER + 3.4;
const L02 = L01 + 3.2;

// ------------------------------------------------------------------ hull --

function hull(g) {
  plateHull(g, F, M, { bootLo: -2.1, bootHi: 0.6 });
  // The anti-torpedo bulge worked into her plating amidships, which on a
  // Takao is a long shallow swelling at the turn of the bilge rather than a
  // blister bolted on.
  for (const sgn of [-1, 1]) {
    for (let t = -0.56; t <= 0.44; t += 0.08) {
      const y = -3.6;
      const w = F.shellAt(t, y);
      box(g, M.antifoul, 0.34, 1.7, 7.0, sgn * (w - 0.06), y, F.zAt(t, y));
    }
  }
}

function decks(g) {
  weatherDeck(g, F, M);
  // The upper deck, which on a flush-decked cruiser is a raised deckhouse top
  // running from the bridge to the after turrets.
  const pos = [];
  const idx = [];
  const z0 = -0.44 * LOA / 2;
  const z1 = BRIDGE_Z + 12;
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const z = z0 + ((z1 - z0) * i) / N;
    const w = Math.max(0.4, halfDeck(z) - 1.4);
    pos.push(-w, UPPER, z, w, UPPER, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
}

function rails(g) {
  guardRail(g, F, M, {
    from: -0.95 * LOA / 2, to: 0.95 * LOA / 2,
    bulwarkFrom: 0.74 * LOA / 2, step: 2.6,
  });
}

// --------------------------------------------------------- deckhouse kit --

function house(g, m, rows, y, h, taper = 0.94) {
  const pos = [];
  const idx = [];
  for (const [dz, w] of rows) {
    pos.push(-w, y, dz, w, y, dz, -w * taper, y + h, dz, w * taper, y + h, dz);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b + 2, a + 2, a, b, b + 2);
    idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3);
    idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
    idx.push(a, b + 1, b, a, a + 1, b + 1);
  }
  const n = (rows.length - 1) * 4;
  idx.push(0, 3, 1, 0, 2, 3);
  idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

function block(g, m, half, z0, z1, y, h, taper = 0.95) {
  house(g, m, [[z0, half], [z1, half]], y, h, taper);
}

function scuttles(g, half, y, z0, z1, step) {
  for (let z = z0; z <= z1; z += step) {
    for (const sgn of [-1, 1]) {
      cyl(g, M.cave, 0.2, 0.2, 0.08, sgn * half, y, z, 8).rotation.z = Math.PI / 2;
    }
  }
}

function winFwd(g, half, y, z, n, w = 0.9) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (half * 2) / n;
    box(g, M.glass, w, 0.75, 0.1, x, y, z);
  }
}

function winSide(g, half, y, z0, z1, n, w = 0.9) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / n;
    for (const sgn of [-1, 1]) {
      box(g, M.glass, 0.1, 0.75, w, sgn * half, y, z);
    }
  }
}

function platform(g, half, z0, z1, y, opts = {}) {
  block(g, opts.mat || M.steel, half, z0, z1, y - 0.2, 0.2, 1);
  if (opts.rail === false) return;
  for (const h of [0.38, 0.74, 1.10]) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.05, 0.05, z1 - z0, sgn * half, y + h, (z0 + z1) / 2);
    }
    for (const z of [z0, z1]) {
      box(g, M.steelDark, half * 2, 0.05, 0.05, 0, y + h, z);
    }
  }
  for (let z = z0; z <= z1 + 0.01; z += 1.8) {
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.045, 0.045, 1.16, sgn * half, y + 0.58, z, 5);
    }
  }
}

// --------------------------------------------------------- superstructure --

function superstructure(g) {
  // The main deckhouse, from the after turrets to the bridge: it carries the
  // torpedo mounts on its edges and the boats on its top.
  house(g, M.steel, [
    [-0.42 * LOA / 2, 6.6],
    [MAST_Z, 7.6],
    [F2_Z, 8.4],
    [F1_Z, 8.6],
    [BRIDGE_Z - 4, 8.2],
    [BRIDGE_Z + 11, 6.4],
  ], UPPER, L01 - UPPER);
  scuttles(g, 8.2, UPPER + 1.8, -30, BRIDGE_Z + 6, 2.6);
  for (const z of [BRIDGE_Z + 2, F1_Z + 4, F2_Z - 4, MAST_Z - 4]) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.1, 1.9, 0.9, sgn * 8.5, UPPER + 1.0, z);
    }
  }
  // The 02 boat deck, between the funnels.
  block(g, M.steel, 6.0, F2_Z - 6, F1_Z + 4, L01, L02 - L01);
  platform(g, 7.0, F2_Z - 8, F1_Z + 6, L02);
  // The breakwater across the forecastle, which every Japanese ship has and
  // which is what makes a wet bow survivable.
  const bw = 78;
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.28;
    box(g, M.steel, 3.2, 1.5, 0.2, Math.sin(a) * 6.2, deckAt(bw) + 0.75,
      bw + Math.cos(a) * 1.4).rotation.y = a;
  }
}

/**
 * The castle.
 *
 * Ten levels on a single slab of a tower, wider than it is long -- which is
 * the thing to get right, because every other navy's bridge is longer than it
 * is wide. Reading up: the lower conning positions, the chart house, the
 * compass platform stepped out over the front, the anti-aircraft command
 * position, and the main battery director with its six-metre rangefinder and
 * the Type 21 mattress on top.
 */
function bridge(g) {
  const z = BRIDGE_Z;
  const lv = (y, half, back, front, h, taper = 0.95) =>
    block(g, M.steel, half, z - back, z + front, y, h, taper);

  // The trunk.
  cyl(g, M.steel, 2.2, 2.2, 26, 0, L01 + 13, z, 14);

  // 01: the base, standing on the forecastle deck and wrapping the barbette
  // of No. 3 turret.
  const B1 = UPPER;
  lv(B1, 7.4, 8, 7, 3.6);
  winSide(g, 7.5, B1 + 2.2, z - 6, z + 5, 5);

  // 02: the lower bridge.
  const B2 = B1 + 3.6;
  lv(B2, 6.6, 7, 6.5, 3.2);
  winFwd(g, 5.8, B2 + 1.9, z + 6.6, 6);
  winSide(g, 6.7, B2 + 1.9, z - 5, z + 4, 4);

  // 03: the chart house, with the searchlight platforms out on the wings.
  const B3 = B2 + 3.2;
  lv(B3, 5.8, 6, 6, 3.0);
  winFwd(g, 5.0, B3 + 1.8, z + 6.1, 5);
  for (const sgn of [-1, 1]) {
    platform(g, 1.6, z - 2, z + 2, B3 + 3.0);
    searchlight(g, M, sgn * 6.6, B3 + 4.4, z, 0.75);
  }

  // 04: the compass platform, glazed all round and stepped out over the
  // front of the tower, which is the Takao signature.
  const B4 = B3 + 3.0;
  lv(B4, 5.2, 5, 7.2, 2.9);
  winFwd(g, 4.5, B4 + 1.7, z + 7.3, 5);
  winSide(g, 5.3, B4 + 1.7, z - 4, z + 6, 5);
  for (const sgn of [-1, 1]) {
    platform(g, 1.4, z + 2, z + 6, B4 + 2.9);
  }
  // The 4.5 m navigational rangefinder abaft it.
  rangefinder(g, M, 0, B4 + 3.7, z - 4.2, 4.5);

  // 05: the anti-aircraft command position and the high-angle directors.
  const B5 = B4 + 2.9;
  lv(B5, 4.4, 4.5, 5, 2.7);
  winFwd(g, 3.8, B5 + 1.6, z + 5.1, 4);
  for (const sgn of [-1, 1]) {
    director(g, M, sgn * 4.6, B5 + 2.7, z + 1.0, 1.2, 1.6);
  }

  // 06: the air defence platform, open.
  const B6 = B5 + 2.7;
  platform(g, 4.0, z - 4.5, z + 4.5, B6);

  // 07: the fire control tower.
  const B7 = B6 + 2.4;
  cyl(g, M.steel, 2.3, 2.5, 4.4, 0, B7 + 2.2, z, 14);
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.3;
    box(g, M.cave, 0.7, 0.4, 0.08, Math.sin(a) * 2.35, B7 + 2.9,
      z + Math.cos(a) * 2.35).rotation.y = a;
  }

  // 08: the main battery director and the six-metre rangefinder over it, with
  // the Type 21 on the face.
  const B8 = B7 + 4.4;
  const dir = director(g, M, 0, B8, z, 2.0, 2.2);
  rangefinder(dir, M, 0, 2.5, 0, 6.0);
  typeTwentyOne(dir, M, 0, 4.1, 0.3, 0, 3.4, 2.0);

  // The ladders up the after face, one each side of the trunk.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const y0 = UPPER + i * 3.2;
      ladder(g, M.steelDark, sx * 1.8, y0, y0 + 3.2, z - 6.4, z - 6.4);
    }
  }
}

/**
 * Two funnels, both raked, the forward one trunked outboard into the after.
 *
 * A Takao's forward uptakes are led up and aft in a curved trunk that joins
 * the second funnel -- so what you see from the beam is a thin curved pipe
 * running into a thick straight one, and it is one of the ways to tell her
 * from a Mogami.
 */
function funnels(g) {
  // The after funnel: big, oval, raked, capped.
  const m = new THREE.Group();
  m.position.set(0, L02, F2_Z);
  m.rotation.x = -0.26;
  const H = 11.5;
  const rows = [[0, 1.0], [0.6, 0.92], [1.0, 0.85]];
  const pos = [];
  const idx = [];
  const N = 18;
  for (const [k, s] of rows) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.sin(a) * 3.5 * s, k * H, Math.cos(a) * 2.5 * s);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a = r * N + i;
      const b = r * N + ((i + 1) % N);
      idx.push(a, b, a + N, a + N, b, b + N);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  m.add(new THREE.Mesh(geo, M.steel));
  cyl(m, M.gunDark, 3.1, 3.1, 0.26, 0, H + 0.1, 0, 18).scale.set(1, 1, 0.72);
  for (let i = -2; i <= 2; i++) {
    box(m, M.gunDark, 5.6, 0.16, 0.26, 0, H - 0.4, i * 0.8);
  }
  g.add(m);

  // The forward funnel, thinner, and its trunk curving aft into the after one.
  const f = new THREE.Group();
  f.position.set(0, L02, F1_Z);
  f.rotation.x = -0.24;
  cyl(f, M.steel, 1.9, 2.2, 9.0, 0, 4.5, 0, 16).scale.set(1, 1, 0.72);
  cyl(f, M.gunDark, 2.1, 2.1, 0.24, 0, 9.1, 0, 16).scale.set(1, 1, 0.72);
  g.add(f);
  // The trunk: a run of short cylinders swept from the head of the forward
  // funnel down and aft into the flank of the after one.
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    const z = F1_Z - 2.2 - k * (F1_Z - F2_Z - 3.0);
    const y = L02 + 8.4 - k * 2.6;
    const r = 1.5 - k * 0.25;
    cyl(g, M.steel, r, r, 2.2, 0, y, z, 12).rotation.x = Math.PI / 2 - 0.5;
  }
  // The boiler-room casing both funnels stand on.
  block(g, M.steel, 5.4, F2_Z - 4, F1_Z + 3, L02, 2.6);
  // Steam pipes up the after face of each.
  for (const [z, h] of [[F1_Z, 8], [F2_Z, 10]]) {
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.22, 0.22, h, sgn * 1.6, L02 + h / 2, z - 2.6, 8);
    }
  }
}

/** The mainmast: a tripod with the after director and the Type 13 on it. */
function mainmast(g) {
  const z = MAST_Z;
  platform(g, 4.2, z - 4, z + 3, L01);
  const topY = L01 + 15;
  const legs = [[0, z + 1.8], [-2.4, z - 3.0], [2.4, z - 3.0]];
  for (const [x, lz] of legs) {
    const h = topY - L01;
    const dx = -x;
    const dz = (z + 0.4) - lz;
    const len = Math.hypot(h, dx, dz);
    const leg = cyl(g, M.steel, 0.36, 0.46, len, x + dx / 2, L01 + h / 2, lz + dz / 2, 10);
    leg.rotation.order = 'ZYX';
    leg.rotation.z = Math.atan2(-dx, h);
    leg.rotation.x = Math.atan2(dz, h);
  }
  platform(g, 2.4, z - 2, z + 2.6, topY);
  const dir = director(g, M, 0, topY, z + 0.4, 1.6, 1.8);
  rangefinder(dir, M, 0, 2.1, 0, 6.0);
  cyl(g, M.steelDark, 0.16, 0.22, 9, 0, topY + 4.6, z + 0.4, 8);
  for (const dy of [2.2, 5.4]) {
    box(g, M.steelDark, 7.5, 0.12, 0.12, 0, topY + dy, z + 0.4);
  }
}

/**
 * The Type 13 air-search aerial, lashed up the starboard leg of the mainmast.
 *
 * Its own builder because it is the one thing aboard her with no opposite
 * number: a Type 13 is a ladder of dipoles wired to whatever mast leg was
 * handy, and she carried exactly one.
 */
function radar(g) {
  typeThirteen(g, M, S * 2.6, L01 + 8, MAST_Z - 3.0, 0, 3.6);
}

/**
 * The aircraft deck aft: two catapults, the handling rails and the crane.
 *
 * A Takao worked three float planes off a deck between the mainmast and the
 * after turrets, with the catapults trained out over the quarters.
 */
function aviation(g) {
  const z = AIR_Z;
  platform(g, 7.8, z - 8, z + 8, UPPER, { rail: true });
  for (const sgn of [-1, 1]) {
    const c = new THREE.Group();
    c.position.set(sgn * 5.4, UPPER + 0.4, z);
    c.rotation.y = sgn * 0.14;
    box(c, M.steelDark, 1.5, 0.6, 15, 0, 0.3, 0);
    box(c, M.steel, 1.9, 0.24, 2.0, 0, 0.7, 6.2);
    cyl(c, M.steelDark, 0.9, 1.0, 0.6, 0, 0, -7.0, 12);
    g.add(c);
  }
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.24, 0.12, 16, sgn * 2.2, UPPER + 0.12, z - 1);
  }
  cyl(g, M.steelDark, 2.4, 2.4, 0.14, 0, UPPER + 0.1, z - 6, 18);
  // The crane, stepped abaft the catapults on the centreline.
  const cr = new THREE.Group();
  cr.position.set(0, UPPER, z - 10);
  cyl(cr, M.steel, 0.8, 0.95, 3.2, 0, 1.6, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 3.2, 0);
  jib.rotation.x = 0.44;
  box(jib, M.steelDark, 0.7, 0.7, 13, 0, 0, 6.2);
  for (let i = 1; i < 6; i++) box(jib, M.steelDark, 0.8, 0.08, 0.08, 0, 0, i * 2.1);
  cr.add(jib);
  g.add(cr);
}

/**
 * Her three floatplanes: two on the catapults, one struck down on the
 * handling deck with her wings folded.
 *
 * Kept out of the ship's own builders for the reason the carrier's are -- an
 * aeroplane on one catapult is not the mirror of the aeroplane on the other,
 * it is the same machine parked twice, and nothing about how she was built
 * should be judged on it.
 */
function airGroup(g) {
  const z = AIR_Z;
  for (const sgn of [-1, 1]) {
    const a = jake(g, sgn * 5.4, UPPER + 1.3, z + 2.2, sgn * 0.14, false, {});
    a.userData.wings?.stowed?.removeFromParent();
  }
  const a = jake(g, 0, UPPER + 0.2, z - 13, Math.PI - 0.18, true, {});
  a.userData.wings?.spread?.removeFromParent();
}

/** Her boats, her ground tackle, her ventilators and her paravanes. */
function fittings(g) {
  for (const sgn of [-1, 1]) {
    boat(g, M, sgn * 5.4, L02 + 1.0, F2_Z - 3, 8.5);
    boat(g, M, sgn * 5.4, L02 + 1.0, F1_Z - 1, 7.5);
  }
  for (let z = F2_Z - 12; z < BRIDGE_Z + 4; z += 4.5) {
    for (const sgn of [-1, 1]) {
      cowl(g, M, sgn * 8.0, UPPER, z, 0.3, 1.5);
    }
  }
  const bow = 0.92 * LOA / 2;
  for (const sgn of [-1, 1]) {
    box(g, M.gunDark, 0.24, 1.8, 2.4, sgn * (halfDeck(bow) - 0.3),
      deckAt(bow) - 2.4, bow);
    cyl(g, M.steelDark, 0.9, 0.9, 1.2, sgn * 2.8, deckAt(bow - 7) + 0.6, bow - 7, 12);
    box(g, M.gunDark, 0.36, 0.18, 6.5, sgn * 2.8, deckAt(bow - 4) + 0.12, bow - 4);
    box(g, M.steelDark, 0.22, 0.22, 5, sgn * 4.6, deckAt(bow - 16) + 0.4, bow - 16);
  }
  cyl(g, M.steelDark, 1.0, 1.0, 0.4, 0, deckAt(0.96 * LOA / 2) + 0.24,
    0.96 * LOA / 2, 12);
  const sz = F.zAt(1, deckAt(LOA / 2) - 1.6);
  cyl(g, mat(P.chrys), 1.3, 1.3, 0.18, 0, deckAt(LOA / 2) - 1.9, sz - 0.3, 18)
    .rotation.x = Math.PI / 2;
  // Her depth charge rails and the ensign staff right aft.
  cyl(g, M.steelDark, 0.12, 0.16, 4.5, 0, deckAt(-0.95 * LOA / 2) + 2.2,
    -0.95 * LOA / 2, 8);
  // The reload racks for the torpedo mounts, alongside them on the 01 deck.
  for (const sgn of [-1, 1]) {
    for (const z of [TORP_F, TORP_A]) {
      box(g, M.steelDark, 1.1, 1.4, 9.0, sgn * 6.0, L01 + 0.7, z);
    }
  }
}

/** Four screws and two rudders. */
function screws(g) {
  for (const [x, z, r, hand] of [
    [-5.2, -0.845 * LOA / 2, 1.85, -1],
    [5.2, -0.845 * LOA / 2, 1.85, 1],
    [-2.4, -0.885 * LOA / 2, 1.8, 1],
    [2.4, -0.885 * LOA / 2, 1.8, -1],
  ]) {
    tubeZ(g, M.gunDark, 0.35, 9, x, -4.5, z + 4.5, 10);
    const hub = new THREE.Group();
    hub.position.set(x, -4.5, z);
    // She turns, so the welder is told to leave her alone: a screw baked into
    // the hull is a propeller standing dead still under a ship at full speed.
    hub.userData.dynamic = true;
    // A screw has a hand. The two shafts of a pair turn opposite ways so
    // their torques cancel, or a ship at full power carries a permanent list
    // and a rudder always over -- and the outer pair are handed against the
    // inner for the same reason.
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.5, 0.35, 0.7, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, r * 0.6, 0.1, r * 1.5,
        Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.42;
    }
    g.add(hub);
  }
  box(g, M.gunDark, 0.34, 4.0, 2.8, 0, -3.4, -0.915 * LOA / 2);
}

// ---------------------------------------------------------------- guns ----

function mainBattery(g) {
  const turrets = [];
  turrets.push(eightInch(g, M, 0, deckAt(T1_Z) - 0.2, T1_Z, 0, true));
  turrets.push(eightInch(g, M, 0, deckAt(T2_Z) + 2.9, T2_Z, 0, false));
  turrets.push(eightInch(g, M, 0, deckAt(T3_Z) + 5.8, T3_Z, 0, false));
  turrets.push(eightInch(g, M, 0, UPPER + 2.9, T4_Z, Math.PI, false));
  turrets.push(eightInch(g, M, 0, deckAt(T5_Z) - 0.2, T5_Z, Math.PI, true));
  g.userData.turrets = turrets;
  return turrets;
}

function barbettes(g) {
  const at = (z, y, h, r = 3.2) => {
    cyl(g, M.steel, r, r + 0.1, h, 0, y + h / 2, z, 20);
    cyl(g, M.deckSteel, r + 0.3, r + 0.3, 0.14, 0, y + h + 0.07, z, 20);
  };
  at(T1_Z, deckAt(T1_Z) - 0.7, 0.5);
  at(T2_Z, deckAt(T2_Z) - 0.4, 3.3);
  at(T3_Z, deckAt(T3_Z) - 0.4, 6.2);
  at(T4_Z, UPPER - 0.4, 3.3);
  at(T5_Z, deckAt(T5_Z) - 0.7, 0.5);
}

function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  // Four 12.7 cm Type 89 twins, two a side abreast the forward funnel.
  for (const z of [14, 2]) {
    for (const sgn of [-1, 1]) {
      sec.push(typeEightNine(g, M, sgn * 7.6, L01, z, sgn < 0 ? -Math.PI / 2 : Math.PI / 2));
    }
  }
  // Four quadruple Long Lance mounts, two a side on the 01 deck.
  for (const z of [TORP_F, TORP_A]) {
    for (const sgn of [-1, 1]) {
      torp.push(quadTorp(g, M, sgn * 8.4, L01, z, sgn < 0 ? -Math.PI / 2 : Math.PI / 2));
    }
  }
  // The twenty-five millimetre: ten triples and four twins, on the bridge
  // wings, along the 01 deck edge and round the aircraft deck.
  const tri = (x, y, z, a) => aa.push(triple25(g, M, x, y, z, a));
  for (const sgn of [-1, 1]) {
    tri(sgn * 6.4, L01 + 3.4, 26, sgn * 1.10);
    tri(sgn * 6.4, L01 + 3.4, 20, sgn * 1.57);
    tri(sgn * 7.2, L01 + 0.3, -8, sgn * 1.57);
    tri(sgn * 7.2, L01 + 0.3, -24, sgn * 1.57);
    tri(sgn * 5.6, UPPER + 0.3, -36, sgn * 2.00);
  }
  for (const sgn of [-1, 1]) {
    aa.push(twin25(g, M, sgn * 4.4, deckAt(34) + 0.3, 34, sgn * 0.70));
    aa.push(twin25(g, M, sgn * 5.0, UPPER + 0.3, -44, sgn * 2.40));
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hull', hull],
  ['decks', decks],
  ['rails', rails],
  ['superstructure', superstructure],
  ['bridge', bridge],
  ['funnels', funnels],
  ['mainmast', mainmast],
  ['radar', radar],
  ['aviation', aviation],
  ['airGroup', airGroup],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildTakao() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  barbettes(g);
  buildInterior(g, {
    loa: LOA, shellAt: F.shellAt, keelY: F.keelY, sheer, zAt: F.zAt,
  });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'takao';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function takaoParts() {
  const parts = [];
  const builders = [...STATIC, ['barbettes', barbettes],
    ['mainBattery', mainBattery], ['mountings', mountings]];
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
