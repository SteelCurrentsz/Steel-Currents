// IJN Yamato, built out of her own lines.
//
// Sixty-five thousand tonnes and nine eighteen-inch guns: the largest
// battleship ever built, and the last. Everything about her shape follows from
// one decision -- that she had to be shorter than her displacement wanted so
// she would fit the docks and the Panamax-beam assumptions of everybody else's
// navy -- so she is enormously broad for her length, with a bulbous forefoot,
// a very full midbody and a fine run aft.
//
// Four things have to be right or she is not her.
//
// The first is the sheer. Yamato's forecastle deck runs unbroken from the stem
// to the after end of the bridge tower, and it sweeps -- a long continuous
// curve, highest at the stem, with a deck edge that flares hard forward. No
// other battleship of the war has a bow line like it and it is what you
// recognise her by from the beam.
//
// The second is the pagoda. The Japanese tower bridge is not a tower with
// platforms on it; it is a stack of platforms with a tower somewhere inside,
// each level smaller than the one below, capped by the main director and the
// fifteen-and-a-half-metre rangefinder -- the longest base length ever put to
// sea -- with the Type 21 radar mattress on top of that.
//
// The third is the single funnel, raked aft, capped, and enormous: one uptake
// for twelve boilers, offset very slightly to starboard, standing on its own
// between the tower and the mainmast.
//
// The fourth is that she is a 1945 ship. The two beam 15.5 cm triples were
// landed in 1944 to make room for anti-aircraft guns, so she carries two
// secondary turrets rather than four and is covered from end to end in
// twenty-five millimetre triples -- fifty of them by the time she sailed for
// Okinawa.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up,
// therefore starboard is -X, and y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, ladder } from './shipkit.js';
import { hullForm, plateHull, weatherDeck, guardRail } from './hullform.js';
import {
  fortySix, fifteenFive, typeEightNine, triple25, single25,
  rangefinder, director, typeTwentyOne, typeThirteen, searchlight, cowl, boat,
} from './ijnguns.js';

const CLS = SHIP_CLASSES.yamato;

/**
 * How much bigger than the ship that was built.
 *
 * The same figure the Iowa is drawn at, and for the same reason: the two of
 * them have to stand in the same water and read as the same kind of thing, and
 * everything in the game that is a battleship is drawn at this scale. Her
 * lines are untouched -- every offset below is her real one off the drawing --
 * she is simply larger.
 */
export const SCALE = 1.55;
export const LOA = CLS.hull.length;      // 263 m x SCALE
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;
/** Starboard, in this frame. */
const S = -1;

// Kure Naval Arsenal grey, which is a warmer and slightly darker grey than the
// German ships carry, over a linoleum-brown weather deck. Her decks were teak
// forward and linoleum over steel abaft the bridge.
const P = {
  hull: 0x5c646d,
  hullDark: 0x4c545c,
  boot: 0x1a1d21,
  antifoul: 0x6a2f26,
  deck: 0x6c6350,          // teak
  deckLino: 0x5a5244,      // linoleum, held down with brass strips
  deckSteel: 0x50575f,
  deckDark: 0x424851,
  steel: 0x69717a,
  steelDark: 0x545b63,
  bright: 0x848c95,
  gun: 0x636b74,
  gunDark: 0x3f454c,
  canvas: 0x8a8a7e,
  glass: 0x2a3742,
  cave: 0x14181c,
  brass: 0x8a7340,
  boat: 0x6d6350,
  // The Imperial chrysanthemum on her stem was gilded bronze.
  chrys: 0x9d8140,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) {
    MATS[color] = new THREE.MeshLambertMaterial({ color });
  }
  return MATS[color];
}
/** Her paint, addressed by name. */
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

// Half-breadth, station by station, off her body plan and scaled.
//
// The thing to notice is how long the parallel middle body is and how quickly
// she narrows at both ends: she carries her full 38.9 m from a quarter of her
// length abaft the stem to a quarter forward of the transom, and then comes to
// a fine point at each. That is what a hull designed for maximum beam on
// minimum length looks like, and it is why she was so steady a gun platform.
const HALF_BEAM = [
  [-1.00, 2.60], [-0.96, 4.20], [-0.90, 6.90], [-0.84, 9.20], [-0.76, 11.80],
  [-0.66, 14.40], [-0.54, 16.70], [-0.40, 18.40], [-0.24, 19.35], [-0.08, 19.45],
  [0.08, 19.45], [0.22, 19.30], [0.36, 18.70], [0.48, 17.60], [0.60, 15.80],
  [0.70, 13.70], [0.79, 11.20], [0.87, 8.30], [0.93, 5.40], [0.97, 2.90],
  [1.00, 0.30],
].map(([t, w]) => [t, w * SCALE]);

// Her keel, and the bulbous bow.
//
// Yamato had one of the first full bulbous forefoots in a capital ship -- a
// great rounded blister under the stem that cut her wave-making resistance by
// something like eight per cent, which is a knot and a half for nothing. It
// shows in the profile as a keel line that does not sweep up into the stem but
// runs forward and then stops.
const KEEL = [
  [-1.00, -2.60], [-0.94, -7.40], [-0.86, -9.60], [-0.76, -10.25], [-0.60, -10.45],
  [-0.20, -10.50], [0.24, -10.50], [0.52, -10.40], [0.70, -10.05], [0.82, -9.30],
  [0.90, -8.40], [0.95, -7.60], [0.98, -6.20], [1.00, -2.20],
].map(([t, y]) => [t, y * SCALE]);

// Her sheer: a long unbroken sweep from the transom to the stem, rising three
// and a half metres over the forward third. This is the line.
const SHEER = [
  [-1.00, 7.10], [-0.80, 7.15], [-0.56, 7.35], [-0.34, 7.70], [-0.14, 8.20],
  [0.04, 8.85], [0.22, 9.70], [0.38, 10.65], [0.52, 11.60], [0.65, 12.50],
  [0.76, 13.30], [0.85, 13.95], [0.92, 14.45], [0.97, 14.85], [1.00, 15.10],
].map(([t, y]) => [t, y * SCALE]);

// And the flare, which forward is very pronounced indeed: her deck edge stands
// nearly three metres outboard of her waterline beam at the forecastle, which
// is what kept a ship with that much freeboard dry at twenty-seven knots.
const FLARE = [
  [-1.00, 0.12], [-0.70, 0.18], [-0.34, 0.26], [0.00, 0.40], [0.26, 0.72],
  [0.44, 1.15], [0.58, 1.70], [0.70, 2.30], [0.79, 2.72], [0.86, 2.80],
  [0.92, 2.45], [0.96, 1.60], [1.00, 0.30],
].map(([t, w]) => [t, w * SCALE]);

const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE,
  // A stem with very little rake above water -- five metres over eighteen of
  // freeboard -- and a counter stern that overhangs four.
  stem: 5.0 * SCALE, stemLo: -10.5 * SCALE, stemUp: 25.6 * SCALE, stemPow: 1.10,
  counter: 4.2 * SCALE, counterLo: -2.0 * SCALE, counterUp: 9.1 * SCALE, counterPow: 1.40,
  // A very full bilge: she is nearly rectangular in section amidships.
  bilge: 0.26,
  stations: 120,
});

export const { deckAt, halfDeck } = F;
/** Her lines, for the tests: the shell, the keel, the sheer and the rake. */
export const LINES = F;
const sheer = F.sheer;

// Where everything stands, in her own frame. Read off her 1945 general
// arrangement and scaled.
const A_Z = 78 * SCALE;          // No. 1 turret
const B_Z = 55 * SCALE;          // No. 2, superfiring
const SEC_F_Z = 36 * SCALE;      // the forward 15.5 cm triple
const TOWER_Z = 16 * SCALE;      // the pagoda
const FUNNEL_Z = -13 * SCALE;
const MAST_Z = -34 * SCALE;
const SEC_A_Z = -48 * SCALE;     // the after 15.5 cm triple
const Y_Z = -68 * SCALE;         // No. 3 turret
const AIR_Z = -100 * SCALE;      // the aircraft deck and the catapults

// The heights of her three built-up levels abaft the forecastle break. The
// forecastle deck runs unbroken to about here, and everything above it is
// superstructure.
const UPPER = 12.6 * SCALE;      // upper deck abaft the break
const L01 = UPPER + 4.4 * SCALE;
const L02 = L01 + 4.2 * SCALE;
const BREAK_Z = -6 * SCALE;      // where the forecastle deck steps down

// ------------------------------------------------------------------ hull --

function hull(g) {
  plateHull(g, F, M, { bootLo: -3.4 * SCALE, bootHi: 0.9 * SCALE });
  // The bulbous bow itself, which the lofted shell only hints at: a rounded
  // blister standing out ahead of the stem, right down on the keel.
  const bz = F.zAt(1, -8.2 * SCALE);
  sphere(g, M.antifoul, 3.3 * SCALE, 0, -8.1 * SCALE, bz + 1.2 * SCALE, 14)
    .scale.set(0.72, 0.82, 2.1);
  // And the anti-torpedo bulge along her middle body, which on a Yamato is
  // built into the shell rather than bolted on -- a long shallow swelling at
  // the turn of the bilge.
  for (const sgn of [-1, 1]) {
    for (let t = -0.62; t <= 0.5; t += 0.08) {
      const y = -6.2 * SCALE;
      const w = F.shellAt(t, y);
      box(g, M.antifoul, 0.5 * SCALE, 2.6 * SCALE, 11 * SCALE,
        sgn * (w - 0.1 * SCALE), y, F.zAt(t, y));
    }
  }
}

function decks(g) {
  weatherDeck(g, F, M);
  // The upper deck abaft the forecastle break, which is one step down and is
  // the deck her after turret and her boat stowage stand on.
  const pos = [];
  const idx = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const z = BREAK_Z - ((BREAK_Z - (-0.97 * LOA / 2)) * i) / N;
    const w = Math.max(0.4, halfDeck(z) - 0.3 * SCALE);
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
  g.add(new THREE.Mesh(geo, M.deckLino));
}

function rails(g) {
  guardRail(g, F, M, {
    from: -0.95 * LOA / 2, to: 0.96 * LOA / 2,
    bulwarkFrom: 0.70 * LOA / 2, step: 3.4 * SCALE,
  });
}

// --------------------------------------------------------- deckhouse kit --

/**
 * A deckhouse: a closed box with a chamfered top, lofted so that every face
 * looks out of it.
 *
 * `rows` are [dz, half-breadth] from aft forward; `y` is the deck it stands on
 * and `h` how tall it is.
 */
function house(g, m, rows, y, h, opts = {}) {
  const taper = opts.taper ?? 0.94;
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

/** A rectangular deckhouse, which is most of them. */
function block(g, m, half, z0, z1, y, h, taper = 0.95) {
  house(g, m, [[z0, half], [z1, half]], y, h, { taper });
}

/** A row of scuttles down a side. */
function scuttles(g, half, y, z0, z1, step) {
  for (let z = z0; z <= z1; z += step) {
    for (const sgn of [-1, 1]) {
      cyl(g, M.cave, 0.24 * SCALE, 0.24 * SCALE, 0.08, sgn * half, y, z, 8)
        .rotation.z = Math.PI / 2;
    }
  }
}

/** A band of bridge windows across a front. */
function winFwd(g, half, y, z, n, w = 1.1) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (half * 2) / n;
    box(g, M.glass, w * SCALE, 0.85 * SCALE, 0.1, x, y, z);
  }
}

/** And down a side. */
function winSide(g, half, y, z0, z1, n, w = 1.1) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / n;
    for (const sgn of [-1, 1]) {
      box(g, M.glass, 0.1, 0.85 * SCALE, w * SCALE, sgn * half, y, z);
    }
  }
}

/** A railed platform: the deck plate and the three wires round it. */
function platform(g, half, z0, z1, y, opts = {}) {
  const m = opts.mat || M.steel;
  block(g, m, half, z0, z1, y - 0.22 * SCALE, 0.22 * SCALE, 1);
  if (opts.rail === false) return;
  const zs = [z0, z1];
  for (const h of [0.42, 0.8, 1.18]) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.06, 0.06, z1 - z0, sgn * half, y + h * SCALE, (z0 + z1) / 2);
    }
    for (const z of zs) {
      box(g, M.steelDark, half * 2, 0.06, 0.06, 0, y + h * SCALE, z);
    }
  }
  for (let z = z0; z <= z1 + 0.01; z += 2.0 * SCALE) {
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.05, 0.05, 1.24 * SCALE, sgn * half, y + 0.62 * SCALE, z, 5);
    }
  }
}

// --------------------------------------------------------- superstructure --

/**
 * The superstructure deck and the deckhouses on it.
 *
 * From forward: the barbette of No. 2 turret, then the raised platform the
 * forward 15.5 cm triple stands on, then the pagoda's own base block, the
 * boiler casing with the funnel on it, the mainmast house, and the after
 * 15.5 cm triple's platform.
 */
function superstructure(g) {
  // The 01 deckhouse, running from just abaft B's barbette to the mainmast.
  house(g, M.steel, [
    [MAST_Z - 10 * SCALE, 11.0 * SCALE],
    [FUNNEL_Z - 6 * SCALE, 12.4 * SCALE],
    [TOWER_Z - 4 * SCALE, 13.2 * SCALE],
    [SEC_F_Z - 2 * SCALE, 12.0 * SCALE],
    [SEC_F_Z + 9 * SCALE, 9.4 * SCALE],
  ], UPPER, L01 - UPPER);
  scuttles(g, 12.0 * SCALE, UPPER + 2.2 * SCALE,
    MAST_Z - 8 * SCALE, SEC_F_Z + 6 * SCALE, 3.2 * SCALE);
  // Doors out on to the upper deck, port and starboard.
  for (const z of [SEC_F_Z, TOWER_Z - 8 * SCALE, FUNNEL_Z, MAST_Z - 4 * SCALE]) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.1, 2.0 * SCALE, 0.95 * SCALE,
        sgn * 12.2 * SCALE, UPPER + 1.05 * SCALE, z);
    }
  }
  // The 02 deck, narrower, carrying the twelve-seven twins on its edge.
  house(g, M.steel, [
    [MAST_Z - 6 * SCALE, 8.6 * SCALE],
    [FUNNEL_Z - 4 * SCALE, 9.6 * SCALE],
    [TOWER_Z - 2 * SCALE, 10.2 * SCALE],
    [SEC_F_Z + 4 * SCALE, 8.0 * SCALE],
  ], L01, L02 - L01);
  winSide(g, 8.8 * SCALE, L01 + 2.4 * SCALE,
    FUNNEL_Z - 2 * SCALE, TOWER_Z - 4 * SCALE, 5);
  // The raised platforms the two 15.5 cm secondaries stand on: each is a short
  // round barbette on its own deckhouse, one forward of the tower and one
  // abaft the mainmast.
  for (const z of [SEC_F_Z, SEC_A_Z]) {
    cyl(g, M.steel, 4.2 * SCALE, 4.4 * SCALE, 3.2 * SCALE, 0, L01 + 1.6 * SCALE, z, 20);
  }
  block(g, M.steel, 7.6 * SCALE, SEC_A_Z - 7 * SCALE, SEC_A_Z + 7 * SCALE,
    UPPER, L01 - UPPER);
  // The boat deck amidships, between the funnel and the mainmast, where her
  // cutters and launches were stowed under the crane.
  platform(g, 10.4 * SCALE, FUNNEL_Z - 16 * SCALE, FUNNEL_Z - 4 * SCALE, L02);
}

/**
 * The pagoda.
 *
 * Eleven levels and a director on top, each smaller than the one under it, the
 * whole of it hung on a single armoured trunk a little over a metre and a half
 * of plate thick. Reading up: the admiral's quarters, the flag bridge, the
 * compass platform with its windows all round, the air defence platform, the
 * main battery director with its fifteen-and-a-half-metre rangefinder, and the
 * Type 21 radar mattress bolted to the face of it.
 */
function tower(g) {
  const z = TOWER_Z;
  const lv = (y, half, len, h, taper = 0.94) =>
    block(g, M.steel, half, z - len * 0.5, z + len * 0.5, y, h, taper);

  // The trunk, which runs the whole height and is what everything hangs on.
  cyl(g, M.steel, 3.4 * SCALE, 3.4 * SCALE, 30 * SCALE, 0, L02 + 14 * SCALE, z, 16);

  // 03: the base of the tower, and the secondary directors on its wings.
  const T3 = L02;
  lv(T3, 7.2 * SCALE, 22 * SCALE, 4.0 * SCALE);
  winSide(g, 7.3 * SCALE, T3 + 2.3 * SCALE, z - 8 * SCALE, z + 8 * SCALE, 6);
  for (const sgn of [-1, 1]) {
    platform(g, 2.0 * SCALE, z + 5 * SCALE, z + 9 * SCALE, T3 + 4.0 * SCALE,
      { rail: true });
    director(g, M, sgn * 7.6 * SCALE, T3 + 4.0 * SCALE, z + 7 * SCALE,
      1.6 * SCALE, 2.0 * SCALE);
  }

  // 04: the admiral's bridge.
  const T4 = T3 + 4.0 * SCALE;
  lv(T4, 6.2 * SCALE, 17 * SCALE, 3.6 * SCALE);
  winFwd(g, 5.4 * SCALE, T4 + 2.1 * SCALE, z + 8.6 * SCALE, 7);
  winSide(g, 6.3 * SCALE, T4 + 2.1 * SCALE, z - 6 * SCALE, z + 6 * SCALE, 5);

  // 05: the operations level, with the 4.5 m rangefinder out on the wings.
  const T5 = T4 + 3.6 * SCALE;
  lv(T5, 5.4 * SCALE, 14 * SCALE, 3.4 * SCALE);
  winFwd(g, 4.7 * SCALE, T5 + 2.0 * SCALE, z + 7.1 * SCALE, 6);
  for (const sgn of [-1, 1]) {
    platform(g, 1.8 * SCALE, z - 1 * SCALE, z + 4 * SCALE, T5 + 3.4 * SCALE);
    searchlight(g, M, sgn * 6.6 * SCALE, T5 + 5.0 * SCALE, z + 1.5 * SCALE,
      0.9 * SCALE);
  }

  // 06: the compass platform -- the bridge she was conned from, glazed all
  // round, with wings out to either side.
  const T6 = T5 + 3.4 * SCALE;
  lv(T6, 4.8 * SCALE, 12 * SCALE, 3.2 * SCALE);
  winFwd(g, 4.2 * SCALE, T6 + 1.9 * SCALE, z + 6.1 * SCALE, 6);
  winSide(g, 4.9 * SCALE, T6 + 1.9 * SCALE, z - 5 * SCALE, z + 5 * SCALE, 5);
  for (const sgn of [-1, 1]) {
    platform(g, 1.6 * SCALE, z + 1 * SCALE, z + 5.5 * SCALE, T6 + 3.2 * SCALE);
  }
  rangefinder(g, M, 0, T6 + 4.2 * SCALE, z - 4.5 * SCALE, 10.0 * SCALE);

  // 07: the anti-aircraft command position, ringed with 25 mm triples.
  const T7 = T6 + 3.2 * SCALE;
  lv(T7, 4.0 * SCALE, 10 * SCALE, 3.0 * SCALE);
  winFwd(g, 3.5 * SCALE, T7 + 1.8 * SCALE, z + 5.1 * SCALE, 5);

  // 08: the air defence platform, open, with the Type 94 high-angle directors.
  const T8 = T7 + 3.0 * SCALE;
  platform(g, 4.6 * SCALE, z - 5.5 * SCALE, z + 5.5 * SCALE, T8);
  for (const sgn of [-1, 1]) {
    director(g, M, sgn * 3.4 * SCALE, T8, z + 3.4 * SCALE, 1.5 * SCALE, 1.9 * SCALE);
    rangefinder(g, M, sgn * 3.4 * SCALE, T8 + 2.2 * SCALE, z + 3.4 * SCALE,
      4.5 * SCALE);
  }

  // 09: the fire control tower proper.
  const T9 = T8 + 2.6 * SCALE;
  cyl(g, M.steel, 3.0 * SCALE, 3.2 * SCALE, 5.6 * SCALE, 0, T9 + 2.8 * SCALE, z, 16);
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.3;
    box(g, M.cave, 0.9 * SCALE, 0.5 * SCALE, 0.08,
      Math.sin(a) * 3.05 * SCALE, T9 + 3.6 * SCALE, z + Math.cos(a) * 3.05 * SCALE)
      .rotation.y = a;
  }

  // 10: the main battery director and the great rangefinder.
  const T10 = T9 + 5.6 * SCALE;
  const dir = director(g, M, 0, T10, z, 2.8 * SCALE, 3.0 * SCALE);
  rangefinder(dir, M, 0, 3.4 * SCALE, 0, 15.5 * SCALE);
  // And the Type 21 on the face of it, which is the aerial she went to
  // Okinawa with.
  typeTwentyOne(dir, M, 0, 5.6 * SCALE, 0.4 * SCALE, 0, 5.2 * SCALE, 3.0 * SCALE);

  // The ladders up the after face of the tower, which is how anybody actually
  // got to the top of it. Both sides: a pagoda this tall is climbed by a great
  // many men at once and it had a ladder each side of the trunk all the way up.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const y0 = L02 + i * 3.4 * SCALE;
      ladder(g, M.steelDark, sx * 2.2 * SCALE, y0, y0 + 3.4 * SCALE,
        z - 5.6 * SCALE, z - 5.6 * SCALE);
    }
  }
}

/**
 * The funnel: one uptake for twelve boilers, raked aft and capped.
 *
 * A Yamato funnel is unmistakable -- vast in section, strongly raked, and with
 * a curved rain cap over a honeycomb grating that was there to keep bomb
 * splinters out of the boiler rooms. It stands on the centreline: all twelve
 * boilers trunk into the one uptake, which is why it is the size it is.
 */
function funnel(g) {
  const m = new THREE.Group();
  m.position.set(0, L02, FUNNEL_Z);
  m.rotation.x = -0.30;
  const H = 16 * SCALE;
  // An oval section, lofted so it narrows going up.
  const rows = [[0, 1.0], [0.55, 0.93], [1.0, 0.84]];
  const pos = [];
  const idx = [];
  const N = 20;
  for (const [k, s] of rows) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.sin(a) * 6.4 * SCALE * s, k * H, Math.cos(a) * 4.5 * SCALE * s);
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
  // The cap, and the grating under it.
  cyl(m, M.gunDark, 5.6 * SCALE, 5.6 * SCALE, 0.3 * SCALE, 0, H + 0.1 * SCALE, 0, 20)
    .scale.set(1, 1, 0.72);
  for (let i = -3; i <= 3; i++) {
    box(m, M.gunDark, 10.2 * SCALE, 0.2 * SCALE, 0.3 * SCALE,
      0, H - 0.5 * SCALE, i * 0.9 * SCALE);
  }
  // The steam pipes up the after face and the siren platform.
  for (const sgn of [-1, 1]) {
    cyl(m, M.steelDark, 0.35 * SCALE, 0.35 * SCALE, H * 0.9,
      sgn * 3.0 * SCALE, H * 0.45, -4.2 * SCALE, 8);
  }
  box(m, M.steelDark, 3.0 * SCALE, 0.2 * SCALE, 1.6 * SCALE,
    0, H * 0.62, -4.8 * SCALE);
  g.add(m);
  // The casing the funnel stands on, which is the boiler-room trunking.
  block(g, M.steel, 8.0 * SCALE, FUNNEL_Z - 8 * SCALE, FUNNEL_Z + 7 * SCALE,
    L02, 3.4 * SCALE);
  // And the 25 mm gun galleries round the base of it, which is where a third
  // of her light battery lived.
  for (const sgn of [-1, 1]) {
    platform(g, 2.6 * SCALE, FUNNEL_Z - 7 * SCALE, FUNNEL_Z + 6 * SCALE,
      L02 + 3.4 * SCALE);
  }
}

/**
 * The mainmast and the after control position.
 *
 * A tripod carrying the after main-battery director with its own ten-metre
 * rangefinder, the Type 13 radar on the starboard leg, and the wireless yards.
 */
function mainmast(g) {
  const z = MAST_Z;
  block(g, M.steel, 6.4 * SCALE, z - 8 * SCALE, z + 6 * SCALE, L01, L02 - L01);
  platform(g, 5.0 * SCALE, z - 6 * SCALE, z + 4 * SCALE, L02);
  // The tripod: one heavy leg forward and two spread aft.
  const legs = [[0, z + 2.2 * SCALE], [-3.2 * SCALE, z - 4.0 * SCALE],
    [3.2 * SCALE, z - 4.0 * SCALE]];
  const topY = L02 + 16 * SCALE;
  for (const [x, lz] of legs) {
    const h = topY - L02;
    const dx = -x;
    const dz = (z + 0.5 * SCALE) - lz;
    const len = Math.hypot(h, dx, dz);
    const leg = cyl(g, M.steel, 0.55 * SCALE, 0.7 * SCALE, len,
      x + dx / 2, L02 + h / 2, lz + dz / 2, 10);
    leg.rotation.order = 'ZYX';
    leg.rotation.z = Math.atan2(-dx, h);
    leg.rotation.x = Math.atan2(dz, h);
  }
  // The after director platform on top, and the director on it.
  platform(g, 3.2 * SCALE, z - 2.6 * SCALE, z + 3.4 * SCALE, topY);
  const dir = director(g, M, 0, topY, z + 0.5 * SCALE, 2.2 * SCALE, 2.4 * SCALE);
  rangefinder(dir, M, 0, 2.8 * SCALE, 0, 10.0 * SCALE);
  // The topmast and her wireless yards.
  cyl(g, M.steelDark, 0.22 * SCALE, 0.3 * SCALE, 12 * SCALE,
    0, topY + 6.4 * SCALE, z + 0.5 * SCALE, 8);
  for (const dy of [3.0, 7.2]) {
    box(g, M.steelDark, 11 * SCALE, 0.16 * SCALE, 0.16 * SCALE,
      0, topY + dy * SCALE, z + 0.5 * SCALE);
  }
}

/**
 * The Type 13 air-search aerial, lashed up the starboard leg of the mainmast.
 *
 * Its own builder because it is the one thing aboard her that has no opposite
 * number: a Type 13 is a ladder of dipoles wired to whatever mast leg was
 * handy, and every photograph of her in 1945 shows exactly one, on the
 * starboard side.
 */
function radar(g) {
  typeThirteen(g, M, S * 3.4 * SCALE, L02 + 9 * SCALE, MAST_Z - 4.0 * SCALE, 0,
    5.0 * SCALE);
}

/**
 * The aircraft deck right aft: two catapults, the handling rails and the crane.
 *
 * Yamato worked seven float planes off a deck abaft Y turret with the aircraft
 * struck below into a hangar under it. The catapults train out over the
 * quarters and the crane picks the aircraft out of the water again.
 */
function aviation(g) {
  const z = AIR_Z;
  platform(g, 11.0 * SCALE, z - 16 * SCALE, z + 14 * SCALE, UPPER, { rail: false });
  // The hangar under the deck, with its door forward.
  block(g, M.steel, 8.4 * SCALE, z - 12 * SCALE, z + 10 * SCALE,
    UPPER - 4.2 * SCALE, 4.2 * SCALE);
  box(g, M.steelDark, 7.0 * SCALE, 3.4 * SCALE, 0.2,
    0, UPPER - 2.1 * SCALE, z + 10.1 * SCALE);
  // Two catapults on the quarters, trained fore and aft at rest.
  for (const sgn of [-1, 1]) {
    const c = new THREE.Group();
    c.position.set(sgn * 7.4 * SCALE, UPPER + 0.4 * SCALE, z);
    c.rotation.y = sgn * 0.12;
    box(c, M.steelDark, 1.9 * SCALE, 0.8 * SCALE, 19 * SCALE, 0, 0.4 * SCALE, 0);
    box(c, M.steel, 2.4 * SCALE, 0.3 * SCALE, 2.6 * SCALE, 0, 0.9 * SCALE, 8 * SCALE);
    cyl(c, M.steelDark, 1.1 * SCALE, 1.3 * SCALE, 0.8 * SCALE, 0, 0, -9 * SCALE, 12);
    g.add(c);
  }
  // The handling rails on the deck between them, and the turntable.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.3 * SCALE, 0.14 * SCALE, 24 * SCALE,
      sgn * 3.0 * SCALE, UPPER + 0.14 * SCALE, z - 2 * SCALE);
  }
  cyl(g, M.steelDark, 3.4 * SCALE, 3.4 * SCALE, 0.16 * SCALE,
    0, UPPER + 0.12 * SCALE, z - 10 * SCALE, 20);
  // The crane on the centreline abaft the catapults.
  const cr = new THREE.Group();
  cr.position.set(0, UPPER, z - 17 * SCALE);
  cyl(cr, M.steel, 1.1 * SCALE, 1.3 * SCALE, 4.0 * SCALE, 0, 2.0 * SCALE, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 4.0 * SCALE, 0);
  jib.rotation.x = 0.42;
  box(jib, M.steelDark, 0.9 * SCALE, 0.9 * SCALE, 17 * SCALE, 0, 0, 8 * SCALE);
  for (let i = 1; i < 7; i++) {
    box(jib, M.steelDark, 1.0 * SCALE, 0.1 * SCALE, 0.1 * SCALE,
      0, 0, i * 2.3 * SCALE);
  }
  cr.add(jib);
  g.add(cr);
}

/** Her boats, her ground tackle, her ventilators and her paravanes. */
function fittings(g) {
  // The cutters and launches on the boat deck, under the crane.
  for (const sgn of [-1, 1]) {
    boat(g, M, sgn * 8.2 * SCALE, L02 + 1.4 * SCALE, FUNNEL_Z - 8 * SCALE,
      11 * SCALE);
    boat(g, M, sgn * 8.2 * SCALE, L02 + 1.4 * SCALE, FUNNEL_Z - 14 * SCALE,
      9 * SCALE);
  }
  // Ventilator cowls along the deckhouse, which a Japanese superstructure is
  // covered in.
  for (let z = FUNNEL_Z - 20 * SCALE; z < TOWER_Z + 6 * SCALE; z += 5 * SCALE) {
    for (const sgn of [-1, 1]) {
      cowl(g, M, sgn * 11.0 * SCALE, UPPER, z, 0.42 * SCALE, 2.0 * SCALE);
    }
  }
  // The forecastle: two anchors in their hawse pipes, the capstans, the
  // bullring, and the chrysanthemum on the stem.
  const bow = 0.93 * LOA / 2;
  for (const sgn of [-1, 1]) {
    box(g, M.gunDark, 0.3 * SCALE, 2.6 * SCALE, 3.4 * SCALE,
      sgn * (halfDeck(bow) - 0.4 * SCALE), deckAt(bow) - 3.4 * SCALE, bow);
    cyl(g, M.steelDark, 1.3 * SCALE, 1.3 * SCALE, 1.7 * SCALE,
      sgn * 4.4 * SCALE, deckAt(bow - 10 * SCALE) + 0.85 * SCALE, bow - 10 * SCALE, 14);
    // The cable running forward to the hawse.
    box(g, M.gunDark, 0.5 * SCALE, 0.22 * SCALE, 9 * SCALE,
      sgn * 4.4 * SCALE, deckAt(bow - 5 * SCALE) + 0.14 * SCALE, bow - 5 * SCALE);
  }
  cyl(g, M.steelDark, 1.5 * SCALE, 1.5 * SCALE, 0.5 * SCALE,
    0, deckAt(0.965 * LOA / 2) + 0.3 * SCALE, 0.965 * LOA / 2, 14);
  // The chrysanthemum crest, gilded, on the stem below the bullring.
  const sz = F.zAt(1, deckAt(LOA / 2) - 2.0 * SCALE);
  cyl(g, mat(P.chrys), 1.9 * SCALE, 1.9 * SCALE, 0.22 * SCALE,
    0, deckAt(LOA / 2) - 2.4 * SCALE, sz - 0.4 * SCALE, 20)
    .rotation.x = Math.PI / 2;
  // Paravane booms and the sweep gear on the forecastle.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.28 * SCALE, 0.28 * SCALE, 7 * SCALE,
      sgn * 7.0 * SCALE, deckAt(bow - 22 * SCALE) + 0.5 * SCALE, bow - 22 * SCALE);
  }
  // The stern: her ensign staff and the depth-charge-free quarterdeck.
  cyl(g, M.steelDark, 0.16 * SCALE, 0.2 * SCALE, 6 * SCALE,
    0, UPPER + 3 * SCALE, -0.955 * LOA / 2, 8);
}

/** Four screws and two rudders, which is what she turned on. */
function screws(g) {
  for (const [x, z, r, hand] of [
    [-9.0 * SCALE, -0.845 * LOA / 2, 3.0 * SCALE, -1],
    [9.0 * SCALE, -0.845 * LOA / 2, 3.0 * SCALE, 1],
    [-4.4 * SCALE, -0.885 * LOA / 2, 2.9 * SCALE, 1],
    [4.4 * SCALE, -0.885 * LOA / 2, 2.9 * SCALE, -1],
  ]) {
    // The shaft and its A-bracket.
    tubeZ(g, M.gunDark, 0.6 * SCALE, 14 * SCALE, x, -7.6 * SCALE, z + 7 * SCALE, 10);
    const hub = new THREE.Group();
    hub.position.set(x, -7.6 * SCALE, z);
    // She turns, so the welder is told to leave her alone: a screw baked into
    // the hull is a propeller standing dead still under a ship at full speed.
    hub.userData.dynamic = true;
    // A screw has a hand. The two shafts of a pair turn opposite ways so
    // their torques cancel, or a ship at full power carries a permanent list
    // and a rudder always over -- and the outer pair are handed against the
    // inner for the same reason.
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.85 * SCALE, 0.6 * SCALE, 1.1 * SCALE, 0, 0, 0, 12)
      .rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, r * 0.58, 0.16 * SCALE, r * 1.5,
        Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.42;
    }
    g.add(hub);
  }
  // Two rudders in line, one behind the other, which is the arrangement that
  // let a Yamato turn in her own length and also the arrangement that made
  // her uncontrollable when the after one jammed.
  for (const z of [-0.90, -0.945]) {
    box(g, M.gunDark, 0.5 * SCALE, 6.5 * SCALE, 4.4 * SCALE,
      0, -6.0 * SCALE, z * LOA / 2);
  }
}

// ---------------------------------------------------------------- guns ----

function mainBattery(g) {
  const turrets = [];
  turrets.push(fortySix(g, M, 0, deckAt(A_Z) - 0.3 * SCALE, A_Z, false, true));
  turrets.push(fortySix(g, M, 0, deckAt(B_Z) + 6.2 * SCALE, B_Z, false, false));
  turrets.push(fortySix(g, M, 0, UPPER + 0.4 * SCALE, Y_Z, true, true));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes her three turrets train on. */
function barbettes(g) {
  const at = (z, y, h) => {
    cyl(g, M.steel, 6.9 * SCALE, 7.0 * SCALE, h, 0, y + h / 2, z, 28);
    cyl(g, M.deckSteel, 7.3 * SCALE, 7.3 * SCALE, 0.2 * SCALE,
      0, y + h + 0.1 * SCALE, z, 28);
  };
  at(A_Z, deckAt(A_Z) - 0.9 * SCALE, 0.6 * SCALE);
  at(B_Z, deckAt(B_Z) - 0.4 * SCALE, 6.6 * SCALE);
  at(Y_Z, UPPER - 0.5 * SCALE, 0.9 * SCALE);
}

/**
 * Her secondary and light batteries.
 *
 * Two 15.5 cm triples on the centreline, twelve 12.7 cm twins along the
 * superstructure deck edges, and the twenty-five millimetre everywhere there
 * is room for it.
 */
function mountings(g) {
  const sec = [];
  const aa = [];
  // The two 15.5 cm triples, fore and aft on the centreline.
  sec.push(fifteenFive(g, M, 0, L01 + 3.2 * SCALE, SEC_F_Z, 0));
  sec.push(fifteenFive(g, M, 0, L01 + 3.2 * SCALE, SEC_A_Z, Math.PI));

  // Twelve 12.7 cm Type 89 twins: six a side along the 02 deck edge, laid
  // abeam. They cannot fire across her -- the pagoda and the funnel are in the
  // way -- which is the whole reason there are twelve of them. They are
  // dual-purpose, so they belong to her anti-aircraft battery and not to her
  // secondary, which on a Yamato is the two 15.5 cm triples and nothing else.
  const secZ = [30, 18, 4, -10, -22, -38];
  for (const z0 of secZ) {
    for (const sgn of [-1, 1]) {
      const z = z0 * SCALE;
      const half = z > TOWER_Z - 4 * SCALE ? 8.4 : z > MAST_Z ? 10.4 : 8.2;
      aa.push(typeEightNine(g, M, sgn * half * SCALE, L02, z,
        sgn < 0 ? -Math.PI / 2 : Math.PI / 2));
    }
  }

  // The twenty-five millimetre. Fifty triples and a scattering of singles, on
  // every platform and sponson she has: round the tower, round the funnel,
  // along both deck edges, on the turret roofs of B and Y, and right forward
  // and right aft.
  const tri = (x, y, z, a) => aa.push(triple25(g, M, x, y, z, a));
  // Round the pagoda.
  for (const sgn of [-1, 1]) {
    tri(sgn * 7.8 * SCALE, L02 + 4.0 * SCALE, TOWER_Z + 7 * SCALE, sgn * 0.9);
    tri(sgn * 7.8 * SCALE, L02 + 4.0 * SCALE, TOWER_Z + 1 * SCALE, sgn * 1.4);
    tri(sgn * 7.6 * SCALE, L02 + 4.0 * SCALE, TOWER_Z - 5 * SCALE, sgn * 1.9);
  }
  // Round the funnel and along the boat deck.
  for (const sgn of [-1, 1]) {
    for (const z0 of [-6, -12, -18, -24]) {
      tri(sgn * 10.2 * SCALE, L02 + 3.6 * SCALE, z0 * SCALE, sgn * 1.57);
    }
  }
  // Along the 01 deck edge, port and starboard.
  for (const sgn of [-1, 1]) {
    for (const z0 of [40, 26, 10, -2, -16, -30, -44]) {
      tri(sgn * 12.4 * SCALE, L01 + 0.3 * SCALE, z0 * SCALE, sgn * 1.57);
    }
  }
  // On the forecastle either side of A and B, and on the quarterdeck.
  for (const sgn of [-1, 1]) {
    const fz = 92 * SCALE;
    tri(sgn * (halfDeck(fz) - 3.0 * SCALE), deckAt(fz) + 0.3 * SCALE, fz, sgn * 0.5);
    const az = -84 * SCALE;
    tri(sgn * (halfDeck(az) - 3.0 * SCALE), UPPER + 0.3 * SCALE, az, sgn * 2.3);
    const qz = -112 * SCALE;
    tri(sgn * (halfDeck(qz) - 2.6 * SCALE), UPPER + 0.3 * SCALE, qz, sgn * 2.6);
  }
  // Two on the roof of B turret, where she actually carried a pair.
  for (const sgn of [-1, 1]) {
    tri(sgn * 3.2 * SCALE, deckAt(B_Z) + 12.0 * SCALE, B_Z - 3 * SCALE, sgn * 0.4);
  }
  // And the singles, on the shelter deck round the after tower.
  for (const sgn of [-1, 1]) {
    aa.push(single25(g, M, sgn * 6.0 * SCALE, L02 + 0.3 * SCALE,
      MAST_Z + 2 * SCALE, sgn * 1.2));
    aa.push(single25(g, M, sgn * 6.0 * SCALE, L02 + 0.3 * SCALE,
      MAST_Z - 4 * SCALE, sgn * 1.9));
  }

  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hull', hull],
  ['decks', decks],
  ['rails', rails],
  ['superstructure', superstructure],
  ['tower', tower],
  ['funnel', funnel],
  ['mainmast', mainmast],
  ['radar', radar],
  ['aviation', aviation],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildYamato() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  barbettes(g);
  // Her insides are built to her own lines, with the deck they stop under a
  // quarter of a metre below her deck edge: a bulkhead lands under the deck it
  // holds up, not flush with the edge of it, and a frame built exactly level
  // with the sheer strake is a frame standing in the deck seam.
  buildInterior(g, {
    loa: LOA,
    shellAt: F.shellAt,
    keelY: F.keelY,
    sheer: (t) => sheer(t) - 0.25,
    zAt: F.zAt,
  });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'yamato';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function yamatoParts() {
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
