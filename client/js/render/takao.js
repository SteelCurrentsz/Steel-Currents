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
import {
  box, cyl, tubeZ, tubeX, sphere, smooth, ladder, loftShape, loftRings,
  bullnose, canted, planRun, grow,
} from './shipkit.js';
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

export const { deckAt, deckAtX, halfDeck } = F;
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

// And the levels of the castle, reading up from the forecastle deck it stands
// on. They live here rather than inside `bridge` because her light battery
// stands on two of them, and a mounting whose platform moved when the tower
// was rebuilt is a mounting hanging in the air.
const BR_BASE = 7.288;                   // deckAt(BRIDGE_Z), to three places
const BR_01 = BR_BASE + 3.8;             // the lower conning level
const BR_SIG = BR_01 + 3.3 + 0.32;       // the signal deck round the chart house
const BR_02 = BR_01 + 3.3 + 0.16;        // the chart house sole
const BR_03 = BR_02 + 3.4;               // the compass platform
const BR_AA = BR_03 + 3.1 + 0.16;        // the anti-aircraft command position
const BR_ADP = BR_AA + 3.0 + 0.16;       // the air defence platform
const BR_FC = BR_ADP;                    // the fire-control tower stands on it
const BR_DIR = BR_FC + 4.6 + 0.16;       // the main battery director

// ------------------------------------------------------------------ hull --

function hull(g) {
  // Ten strakes under the boot topping and six above it.
  //
  // She was plated in one band each way, which means her bottom was a V and
  // her topsides a flat sheet from the boot topping to the deck edge. All the
  // round that is in her offsets -- the turn of the bilge, the tumblehome
  // amidships, the flare opening as it rises forward -- lives between those
  // heights, and a single band throws every bit of it away. On a Hiraga hull
  // that is the whole shape of the ship.
  plateHull(g, F, M, { bootLo: -2.1, bootHi: 0.6, bands: 10, upper: 6 });
  bulge(g);
}

/**
 * The anti-torpedo bulge worked into her plating amidships.
 *
 * On a Takao it is not a blister bolted on: it is a long shallow swelling
 * carried in the shell itself, from about a fifth of her length forward of
 * amidships to a fifth abaft it, deepest a little below the waterline and
 * fairing out to nothing at both ends. It is the dark line that runs the
 * length of her in every photograph of her in dock.
 *
 * Lofted as a band over her own plating rather than as a row of boxes laid
 * along it: twenty-four boxes on each beam read as twenty-four boxes.
 */
const BULGE_T = 0.30;
function bulge(g) {
  const Z0 = -0.50;
  const Z1 = 0.42;
  const N = 34;
  const RUNGS = 7;
  const LO = -5.3;
  const HI = -0.4;
  // How far the swelling stands out, by station and by height: it is fullest
  // in the middle of its run and at the middle of its depth, and it dies away
  // to nothing at the edges so the plating fairs back into the shell.
  const out = (t, f) => {
    const a = Math.max(0, Math.min(1, (t - Z0) / (Z1 - Z0)));
    const along = Math.sin(Math.PI * a) ** 0.55;
    const up = Math.sin(Math.PI * f) ** 0.7;
    return BULGE_T * along * up;
  };
  const pos = [];
  const idx = [];
  const per = (RUNGS + 1) * 2;
  for (let i = 0; i <= N; i++) {
    const t = Z0 + ((Z1 - Z0) * i) / N;
    for (let r = 0; r <= RUNGS; r++) {
      const f = r / RUNGS;
      const y = LO + (HI - LO) * f;
      const w = F.shellAt(t, y) + out(t, f);
      const z = F.zAt(t, y);
      pos.push(-w, y, z, w, y, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let r = 0; r < RUNGS; r++) {
      const a = i * per + r * 2;
      const b = (i + 1) * per + r * 2;
      idx.push(a, b, a + 2, a + 2, b, b + 2);
      idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.antifoul));
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
//
// A level of her upperworks is a plan extruded through two heights, and
// everything else -- the plate over it, the eave it stands proud on, the
// glazing round it, the brackets under it where it overhangs -- is taken off
// that same plan. Drawn any other way a deckhouse is a box, and a tower built
// out of boxes is what she had.

/** A level: its plating from `y0` to `y1`, on a plan. */
function levelOf(g, m, pts, y0, y1) {
  return loftShape(g, m, [{ pts, y: y0 }, { pts, y: y1 }], { cap: false });
}

/** The plate over it, carried a little proud so the level has an eave. */
function roofOf(g, pts, y, t = 0.16) {
  return loftShape(g, M.deckSteel, [{ pts, y: y - t }, { pts, y }], { floor: true });
}

/** An open platform on a plan: a plate, and the rail round it. */
function deckOf(g, pts, y, t = 0.16) {
  loftShape(g, M.deckSteel, [{ pts, y: y - t }, { pts, y }], { floor: true });
  railPlan(g, grow(pts, -0.18), y);
}

/** Guard rails round a plan: a stanchion every metre and a half, three wires. */
function railPlan(g, pts, y, opts = {}) {
  const { h = 1.05, close = true, step = 1.5 } = opts;
  const n = pts.length;
  const runs = close ? n : n - 1;
  for (let i = 0; i < runs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.06) continue;
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const f = j / k;
      cyl(g, M.steelDark, 0.045, 0.045, h, a[0] + dx * f, y + h / 2, a[1] + dz * f, 5);
    }
    for (const wy of [0.38, 0.72, 1.04]) {
      box(g, M.steelDark, 0.05, 0.05, len, a[0] + dx / 2, y + wy, a[1] + dz / 2,
        Math.atan2(dx, dz));
    }
  }
  // The stanchion at the far end of an open run. Each run plants one at its
  // own start, so without this the last point of an open rail has none -- and
  // a rail round a platform that starts to port and finishes to starboard
  // comes out with one more stanchion on one beam than the other.
  if (!close) {
    const e = pts[n - 1];
    cyl(g, M.steelDark, 0.045, 0.045, h, e[0], y + h / 2, e[1], 5);
  }
}

/** A member between two points: a strut, a stay, a bracket. */
function member(g, m, thick, a, b, extra = 0.04, tall = 0) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const o = box(g, m, thick, tall || thick, len + extra,
    (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  o.rotation.y = Math.atan2(dx, Math.hypot(dy, dz));
  o.rotation.x = Math.atan2(-dy, dz);
  return o;
}

/**
 * The brackets under a platform, taken off the platform's own outline.
 *
 * Mirrored off one beam rather than stepped through the point list: a ring is
 * a mirror-symmetric set of points, but index i is not the mirror of index
 * i + k, so walking it hands brackets to one side of her and not the other.
 */
function kneesOf(g, outer, inner, y, every = 3, drop = 1.4) {
  for (let i = 0; i < outer.length; i += every) {
    const [x, z] = outer[i];
    if (x < -1e-6) continue;
    let bx = 0;
    let bz = 0;
    let bd = Infinity;
    for (const [px, pz] of inner) {
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; bx = px; bz = pz; }
    }
    if (bd < 0.4) continue;
    // A bracket taken off a point on the centreline has to land on the
    // centreline too, or the one strut she gets there rakes off to whichever
    // side the nearest bit of house happened to be on.
    const fx = x > 1e-6 ? bx : 0;
    for (const sgn of x > 1e-6 ? [-1, 1] : [1]) {
      member(g, M.steel, 0.14, [sgn * x, y - 0.12, z],
        [sgn * fx, y - Math.min(drop, bd * 1.3), bz], 0.1);
    }
  }
}

/**
 * Glazing carried round a plan, panel by panel.
 *
 * Windows laid as boxes at plus and minus a half-breadth land inside the
 * plating the moment the plating stops being flat, which is the whole of why
 * a canted bridge front used to come out blind. `keep` is handed the midpoint
 * of a panel and says whether it is glazed.
 */
function glazePlan(g, pts, y, h, keep) {
  const n = pts.length;
  const posts = new Set();
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.3) continue;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const nx = -dz / len;
    const nz = dx / len;
    if (keep && !keep(mx, mz)) continue;
    box(g, M.glass, 0.13, h, len * 0.84, mx + nx * 0.02, y, mz + nz * 0.02,
      Math.atan2(dx, dz));
    // Both seams of the light, so the run of mullions is the same on both
    // bows rather than shifted a panel round the ring.
    posts.add(i);
    posts.add((i + 1) % n);
  }
  for (const i of posts) {
    box(g, M.steel, 0.15, h + 0.1, 0.15, pts[i][0] * 1.01, y, pts[i][1]);
  }
}

/** A watertight door set into whichever panel of a plan is nearest [x, z]. */
function doorOn(g, pts, y, x, z) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const b = pts[(i + 1) % pts.length];
    const d = Math.hypot((pts[i][0] + b[0]) / 2 - x, (pts[i][1] + b[1]) / 2 - z);
    if (d < bd) { bd = d; best = i; }
  }
  const a = pts[best];
  const b = pts[(best + 1) % pts.length];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const mx = (a[0] + b[0]) / 2 + (-dz / len) * 0.05;
  const mz = (a[1] + b[1]) / 2 + (dx / len) * 0.05;
  const ry = Math.atan2(dx, dz);
  box(g, M.steelDark, 0.1, 1.9, 0.94, mx, y + 0.95, mz, ry);
  box(g, M.gunDark, 0.12, 1.76, 0.82, mx, y + 0.94, mz, ry);
  box(g, M.bright, 0.06, 0.1, 0.6, mx, y + 0.94, mz, ry);
}

/** Scuttles down both sides of a plan, at one height. */
function scuttleRun(g, half, y, z0, z1, step) {
  for (let z = z0; z <= z1 + 1e-6; z += step) {
    const w = typeof half === 'function' ? half(z) : half;
    for (const sgn of [-1, 1]) {
      cyl(g, M.glass, 0.17, 0.17, 0.08, sgn * (w + 0.02), y, z, 8)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.21, 0.21, 0.05, sgn * (w + 0.05), y, z, 8)
        .rotation.z = Math.PI / 2;
    }
  }
}

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

/**
 * The main deckhouse, and the flats her torpedoes and her secondaries stand on.
 *
 * On a Takao the upper deck between the after turrets and the bridge is one
 * continuous house, narrower than the hull so there is a walkway at the deck
 * edge, and everything that matters is bolted to its edges: the four armoured
 * torpedo houses two a side, the four 12.7 cm twins on sponsons abreast the
 * fore funnel, the boats over them and the light battery along the top.
 *
 * A mounting on the edge of a house wants a deck under it and a bracket under
 * that, or it stands in the air off her side -- which is what the four torpedo
 * mountings and all four secondaries were doing.
 */
function superstructure(g) {
  const Z0 = -0.44 * LOA / 2;
  const Z1 = BRIDGE_Z + 11;
  // How wide the house is at a station: inboard of her deck edge by the width
  // of the walkway, and fined at both ends the way the plan fines it.
  const hAt = (z) => {
    const w = Math.max(1.2, halfDeck(z) - 1.45);
    return Math.min(w, 8.7);
  };
  const pRun = planRun(hAt, Z0, Z1, 5.0, 3.2, { n: 20, arc: 5 });
  levelOf(g, M.steel, pRun, UPPER, L01);
  roofOf(g, planRun((z) => hAt(z) + 0.1, Z0 - 0.1, Z1 + 0.1, 5.0, 3.2,
    { n: 20, arc: 5 }), L01 + 0.16);
  scuttleRun(g, (z) => hAt(z), UPPER + 1.15, Z0 + 6, Z1 - 7, 2.3);
  scuttleRun(g, (z) => hAt(z), UPPER + 2.45, Z0 + 6, Z1 - 7, 2.3);
  for (const z of [BRIDGE_Z + 2, F1_Z + 5, F2_Z - 5, MAST_Z - 5, Z0 + 8]) {
    doorOn(g, pRun, UPPER, hAt(z), z);
    doorOn(g, pRun, UPPER, -hAt(z), z);
  }
  // Rails along the 01 deck edge, and the ladders down to the weather deck at
  // both ends of it.
  railPlan(g, grow(pRun, -0.3), L01 + 0.16, { step: 2.4 });
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * (hAt(Z1 - 3) - 0.5), deckAt(Z1 + 2), UPPER,
      Z1 + 1.4, Z1 - 1.6);
    ladder(g, M.steelDark, sgn * (hAt(Z0 + 3) - 0.5), deckAt(Z0 - 2), UPPER,
      Z0 - 1.4, Z0 + 1.6);
  }

  // ---- the torpedo flats: a plated sponson under each armoured house, out
  // past the side of the deckhouse, carried on brackets down to it.
  for (const z of [TORP_F, TORP_A]) {
    for (const sgn of [-1, 1]) {
      const x = sgn * 8.4;
      const pFlat = planRun(2.5, z - 5.6, z + 5.6, 1.8, 1.8, { n: 4, arc: 3 })
        .map(([px, pz]) => [px + x, pz]);
      loftShape(g, M.deckSteel, [{ pts: pFlat, y: L01 - 0.2 },
        { pts: pFlat, y: L01 }], { floor: true });
      kneesOf(g, pFlat, pRun, L01, 2, 2.2);
      // The reload rails aft of the mounting, the spare fish in their racks,
      // and the derrick that swings them across.
      box(g, M.steelDark, 1.3, 1.5, 7.2, sgn * 6.4, L01 + 0.9, z);
      for (const dz of [-2.2, 0, 2.2]) {
        cyl(g, M.gunDark, 0.32, 0.32, 6.6, sgn * 6.4, L01 + 1.85, z + dz, 10)
          .rotation.z = Math.PI / 2;
      }
      cyl(g, M.steelDark, 0.16, 0.2, 3.4, sgn * 5.6, L01 + 1.7, z - 6.4, 8);
      member(g, M.steelDark, 0.14, [sgn * 5.6, L01 + 3.3, z - 6.4],
        [sgn * 8.6, L01 + 2.3, z - 2.0]);
    }
  }

  // ---- the secondary sponsons: the four 12.7 cm twins abreast the fore
  // funnel, each on its own plate with the ready-use lockers behind it.
  for (const z of [14, 2]) {
    for (const sgn of [-1, 1]) {
      const x = sgn * 7.6;
      cyl(g, M.deckSteel, 2.5, 2.5, 0.2, x, L01 - 0.1, z, 20);
      const t = z / (LOA / 2);
      for (const a of [-0.9, -0.3, 0.3, 0.9]) {
        member(g, M.steel, 0.15,
          [x + sgn * 2.45 * Math.cos(a), L01 - 0.22, z + 2.45 * Math.sin(a)],
          [sgn * (hAt(z) - 0.2), L01 - 2.1, z + Math.sin(a) * 1.0], 0.1);
      }
      box(g, M.steelDark, 1.0, 0.9, 2.0, sgn * 5.6, L01 + 0.45, z);
      box(g, M.steel, 1.06, 0.1, 2.1, sgn * 5.6, L01 + 0.93, z);
    }
  }

  // ---- the 02 boat deck, over the after end of the house.
  const pBoat = planRun(6.2, F2_Z - 9, F1_Z + 6, 2.6, 2.6, { n: 8, arc: 4 });
  levelOf(g, M.steel, pBoat, L01 + 0.16, L02);
  deckOf(g, grow(pBoat, 0.6), L02 + 0.16);
  kneesOf(g, grow(pBoat, 0.6), pBoat, L02 + 0.16, 3, 1.3);

  // ---- the breakwater across the forecastle, which every Japanese ship has
  // and which is what makes a wet bow survivable.
  const bw = 78;
  for (let i = -4; i <= 4; i++) {
    const a = i * 0.22;
    const pl = box(g, M.steel, 2.6, 1.6, 0.22, Math.sin(a) * 6.4,
      deckAt(bw) + 0.8, bw + Math.cos(a) * 1.6);
    pl.rotation.y = a;
    // The knees behind each plate, which is what holds a breakwater up.
    const kn = box(g, M.steelDark, 0.14, 1.3, 1.1, Math.sin(a) * 6.4,
      deckAt(bw) + 0.65, bw + Math.cos(a) * 1.6 - 0.66, a);
    kn.rotation.x = 0.5;
  }
}

/**
 * The castle.
 *
 * Takao and Atago were given a bridge so enormous the class was nicknamed
 * after castles, and it is the single most recognisable thing about her.
 * Nothing else afloat looks like it: one slab of a tower standing on the
 * forecastle, ten levels of it, wider than it is long -- which is the thing
 * to get right, because every other navy's bridge is longer than it is wide.
 *
 * Reading up: the base wrapping No. 3 barbette, the lower conning levels, the
 * chart house, the compass platform stepped out over the front, the
 * anti-aircraft command position, the open air-defence platform, the
 * fire-control tower, and the main battery director with its six-metre
 * rangefinder and the Type 21 mattress on top.
 *
 * Every level is built on a canted plan -- a flat face with a chamfer each
 * side of it -- because that is how Japanese bridgework is plated, and it is
 * what gives her tower its faceted look from anywhere off the bow. Enclosed
 * levels are glazed round their own front panel by panel; open ones are
 * plated, railed and bracketed where they overhang.
 */
function bridge(g) {
  const z = BRIDGE_Z;
  const base = BR_BASE;

  // The trunk up the middle of her, which every level is threaded on to and
  // which carries the weight of the top.
  cyl(g, M.steel, 2.5, 2.8, 24, 0, base + 12, z - 1.2, 16);

  // ---- the base, standing on the forecastle and wrapping No. 3 barbette.
  const p1 = canted(7.6, z - 9.5, z + 7.6, 2.6, { side: 5, back: 4 });
  levelOf(g, M.steel, p1, base, base + 3.8);
  scuttleRun(g, 7.62, base + 1.3, z - 7.5, z + 3.5, 2.2);
  scuttleRun(g, 7.62, base + 2.7, z - 7.5, z + 3.5, 2.2);
  doorOn(g, p1, base, 7.6, z - 4.0);
  doorOn(g, p1, base, -7.6, z - 4.0);

  // ---- 01: the lower conning level, with the signal deck out round it.
  const b2 = BR_01;
  const p2 = canted(7.0, z - 8.6, z + 7.2, 2.4, { side: 4, back: 3 });
  roofOf(g, grow(p1, 0.14), b2);
  levelOf(g, M.steel, p2, b2, b2 + 3.3);
  glazePlan(g, p2, b2 + 2.0, 1.05, (x, zz) => zz > z - 5.0);
  doorOn(g, p2, b2, 7.0, z - 5.6);
  doorOn(g, p2, b2, -7.0, z - 5.6);
  // The flag lockers and the ready lockers along the after face.
  for (const sgn of [-1, 1]) {
    for (const dz of [-7.4, -6.0]) {
      box(g, M.steelDark, 1.2, 0.9, 1.1, sgn * 4.2, b2 + 0.45, z + dz);
    }
    ladder(g, M.steelDark, sgn * 5.4, b2, b2 + 3.3, z - 8.0, z - 6.2);
  }

  // ---- 02: the chart house, and the signal platform carried out round it.
  const b3 = b2 + 3.3;      // the chart house floor, before its eave
  const p3 = canted(6.2, z - 7.6, z + 6.8, 2.2, { side: 4, back: 3 });
  const pSig = canted(8.4, z - 9.0, z + 7.8, 2.8, { side: 5, back: 4 });
  roofOf(g, grow(p2, 0.14), b3);
  deckOf(g, pSig, b3 + 0.16);
  kneesOf(g, pSig, p2, b3 + 0.16, 2, 1.9);
  levelOf(g, M.steel, p3, b3 + 0.16, b3 + 3.4);
  glazePlan(g, p3, b3 + 2.0, 1.1, (x, zz) => zz > z - 4.6);
  // Her signal flags and the halliards they run on, which on a Japanese
  // cruiser live on this deck and nowhere else.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 1.3, 1.0, 2.6, sgn * 7.1, b3 + 0.66, z + 3.4);
    cyl(g, M.steelDark, 0.08, 0.1, 3.4, sgn * 7.8, b3 + 1.86, z - 1.2, 8);
    searchlight(g, M, sgn * 7.6, b3 + 0.9, z - 5.4, 0.66);
  }

  // ---- 03: the compass platform, stepped out over the front of the tower.
  //
  // This is the Takao signature and it wants to overhang: the navigating
  // bridge is carried a good two metres forward of everything under it, on
  // brackets, glazed the whole way round its own face.
  const b4 = BR_03;
  const p4 = canted(6.0, z - 6.6, z + 9.4, 2.4, { side: 4, back: 3 });
  roofOf(g, grow(p3, 0.14), b4);
  levelOf(g, M.steel, p4, b4, b4 + 3.1);
  glazePlan(g, p4, b4 + 1.9, 1.2, (x, zz) => zz > z - 4.0);
  kneesOf(g, p4, p3, b4, 2, 1.7);
  doorOn(g, p4, b4, 6.0, z - 5.0);
  doorOn(g, p4, b4, -6.0, z - 5.0);
  // The 4.5 m navigational rangefinder on its own house abaft it, and the
  // pelorus repeaters out on the wings.
  rangefinder(g, M, 0, b4 + 3.7, z - 6.0, 4.5);
  for (const sgn of [-1, 1]) {
    cyl(g, M.brass, 0.2, 0.22, 1.0, sgn * 4.6, b4 + 3.7, z + 7.6, 10);
    box(g, M.gunDark, 0.42, 0.14, 0.42, sgn * 4.6, b4 + 4.25, z + 7.6);
  }

  // ---- 04: the anti-aircraft command position, with the two Type 94 high-
  // angle directors out on its wings.
  const b5 = b4 + 3.1;
  const p5 = canted(5.0, z - 5.6, z + 6.4, 2.0, { side: 3, back: 3 });
  const pAa = canted(7.4, z - 6.6, z + 7.4, 2.6, { side: 4, back: 3 });
  roofOf(g, grow(p4, 0.14), b5);
  deckOf(g, pAa, b5 + 0.16);
  kneesOf(g, pAa, p4, b5 + 0.16, 2, 1.6);
  levelOf(g, M.steel, p5, b5 + 0.16, b5 + 3.0);
  glazePlan(g, p5, b5 + 1.8, 1.05, (x, zz) => zz > z - 3.4);
  for (const sgn of [-1, 1]) {
    director(g, M, sgn * 6.0, b5 + 0.16, z + 2.4, 1.25, 1.7);
    ladder(g, M.steelDark, sgn * 3.2, b4, b5, z - 6.2, z - 4.8);
  }

  // ---- 05: the air defence platform, open, with the light battery on it.
  const b6 = b5 + 3.0;
  const p6 = canted(4.6, z - 5.0, z + 5.6, 1.9, { side: 3, back: 3 });
  roofOf(g, grow(p5, 0.14), b6);
  deckOf(g, p6, b6 + 0.16);
  kneesOf(g, p6, p5, b6 + 0.16, 2, 1.3);
  // The look-outs' binocular stands round the rail, which is what an air
  // defence position actually is.
  for (const sgn of [-1, 1]) {
    for (const dz of [1.6, 4.0]) {
      cyl(g, M.steelDark, 0.08, 0.11, 1.35, sgn * 3.8, b6 + 0.84, z + dz, 8);
      box(g, M.gunDark, 0.46, 0.2, 0.3, sgn * 3.8, b6 + 1.6, z + dz);
    }
  }

  // ---- 06: the fire-control tower, a faceted drum with its sighting ports.
  const b7 = BR_FC;
  const p7 = canted(2.9, z - 3.0, z + 3.2, 1.5, { side: 2, back: 2, face: 2 });
  levelOf(g, M.steel, p7, b7, b7 + 4.6);
  glazePlan(g, p7, b7 + 3.4, 0.5, (x, zz) => zz > z - 2.4);
  for (let i = 0; i < 6; i++) {
    box(g, M.steelDark, 0.6, 0.06, 0.06, 0, b7 + 0.5 + i * 0.66, z - 3.05);
  }

  // ---- 07: the main battery director, the six-metre rangefinder over it,
  // and the Type 21 mattress on its face.
  const b8 = b7 + 4.6;
  roofOf(g, grow(p7, 0.16), b8);
  const dir = director(g, M, 0, b8 + 0.16, z, 2.1, 2.3);
  rangefinder(dir, M, 0, 2.6, 0, 6.0);
  typeTwentyOne(dir, M, 0, 4.3, 0.35, 0, 3.6, 2.1);
  // The frame the mattress is bolted to. Without it the aerial stands a third
  // of a metre clear of the rangefinder under it with nothing in between.
  for (const sgn of [-1, 1]) {
    member(dir, M.steelDark, 0.12, [sgn * 1.5, 2.8, 0.2], [sgn * 1.6, 4.3, 0.35]);
  }
  box(dir, M.steelDark, 3.4, 0.14, 0.5, 0, 3.4, 0.28);

  // ---- and what a man gets up her by: ladders the whole way up the after
  // face, both sides of the trunk, and the voice pipes beside them.
  for (const sx of [-1, 1]) {
    for (const [y0, y1, zz] of [
      [base, b2, z - 8.8], [b2, b3, z - 8.0], [b3 + 0.16, b4, z - 7.0],
      [b4, b5 + 0.16, z - 6.0], [b5 + 0.16, b6, z - 5.2],
    ]) {
      ladder(g, M.steelDark, sx * 2.2, y0, y1, zz, zz + 1.6);
    }
    cyl(g, M.steelDark, 0.11, 0.11, b6 - base, sx * 3.4, (base + b6) / 2, z - 8.2, 8);
  }
}

/**
 * Two funnels, and the forward one is bent.
 *
 * A Takao's forward uptakes are led up and then swept aft in one curved trunk,
 * so that the smoke clears a bridge which is eleven decks high and standing
 * right in front of it. What you see from the beam is a funnel that leaves the
 * boat deck upright and finishes leaning a long way aft, with the second
 * funnel standing straight behind it -- and that curve is one of the two or
 * three things that tell a Takao from a Mogami at any distance.
 *
 * Both are ovals in plan, wider than they are deep, capped with the flat rain
 * guard on struts that every Japanese funnel of the period carries.
 */
function funnels(g) {
  // The boiler-room casing both of them stand on, with the fiddley gratings
  // and the ventilator heads along it.
  const pCase = planRun(5.6, F2_Z - 7.0, F1_Z + 5.0, 2.2, 2.2, { n: 8, arc: 3 });
  levelOf(g, M.steel, pCase, L01, L02);
  roofOf(g, grow(pCase, 0.12), L02 + 0.14);
  scuttleRun(g, 5.62, L01 + 1.4, F2_Z - 4, F1_Z + 2, 2.4);
  for (const sgn of [-1, 1]) {
    doorOn(g, pCase, L01, sgn * 5.6, F1_Z + 1.5);
    for (let zz = F2_Z - 5; zz <= F1_Z + 3; zz += 3.2) {
      cowl(g, M, sgn * 4.6, L02 + 0.14, zz, 0.34, 1.7);
    }
  }

  /** One funnel: a stack of ovals on a centreline that may lean. */
  const stack = (z0, h, lean, rx0, rz0, rx1, rz1) => {
    const rings = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const y = L02 + 0.14 + f * h;
      // Upright off the casing, then sweeping aft: a trunk that starts
      // bending at its foot reads as a funnel that has been knocked over.
      const k = smooth(Math.max(0, (f - 0.22) / 0.78));
      rings.push([rx0 + (rx1 - rx0) * f, rz0 + (rz1 - rz0) * f,
        z0 - lean * k, y]);
    }
    loftRings(g, M.steel, rings, { n: 24, px: 1, pz: 1, cap: false });
    const [rx, rz, zc, y] = rings[N];
    // The cap: a flat rain guard standing off the head on short struts, and
    // the cave down the middle of it.
    cyl(g, M.cave, rx * 0.86, rx * 0.86, 0.3, 0, y - 0.15, zc, 20)
      .scale.set(1, 1, rz / rx);
    const capY = y + 0.62;
    cyl(g, M.gunDark, rx + 0.5, rx + 0.5, 0.22, 0, capY, zc, 22)
      .scale.set(1, 1, (rz + 0.5) / (rx + 0.5));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(g, M.gunDark, 0.12, 0.72, 0.12, Math.sin(a) * rx * 0.88, y + 0.26,
        zc + Math.cos(a) * rz * 0.88);
    }
    // The banding round it and the grab rails up the after face.
    for (const f of [0.28, 0.56, 0.84]) {
      const [bx, bz, bc, by] = rings[Math.round(N * f)];
      cyl(g, M.steelDark, bx + 0.08, bx + 0.08, 0.2, 0, by, bc, 22)
        .scale.set(1, 1, (bz + 0.08) / (bx + 0.08));
    }
    for (let i = 0; i < 12; i++) {
      const f = (i + 0.5) / 12;
      const r = rings[Math.round(N * f)];
      box(g, M.steelDark, 0.5, 0.05, 0.05, 0, r[3], r[2] - r[1] - 0.06);
    }
    return rings;
  };

  // The forward funnel, bent aft over the after one's foot; and the after
  // funnel, upright.
  const fwd = stack(F1_Z, 13.0, 6.4, 3.5, 2.5, 2.35, 1.7);
  const aft = stack(F2_Z, 11.0, 0.9, 3.3, 2.4, 2.55, 1.85);

  // The steam pipes up the after face of each, and the siren platform on the
  // forward one, which is where a Japanese cruiser carries hers.
  for (const [rings, dz] of [[fwd, -0.4], [aft, -0.4]]) {
    for (const sgn of [-1, 1]) {
      const a = rings[1];
      const b = rings[rings.length - 2];
      member(g, M.steelDark, 0.26, [sgn * 1.7, a[3], a[2] - a[1] + dz],
        [sgn * 1.2, b[3], b[2] - b[1] + dz]);
    }
  }
  const sp = fwd[Math.round(fwd.length * 0.55)];
  box(g, M.deckSteel, 3.4, 0.14, 1.6, 0, sp[3], sp[2] - sp[1] - 0.7);
  railPlan(g, [[-1.6, sp[2] - sp[1] - 1.4], [-1.6, sp[2] - sp[1] - 0.1],
    [1.6, sp[2] - sp[1] - 0.1], [1.6, sp[2] - sp[1] - 1.4]], sp[3] + 0.07,
  { close: false });
  cyl(g, M.brass, 0.2, 0.24, 0.8, 0, sp[3] + 0.47, sp[2] - sp[1] - 0.8, 10);

  // And the stays that hold both of them up.
  for (const [rings, foot] of [[fwd, F1_Z + 4.6], [aft, F2_Z + 3.4]]) {
    const top = rings[Math.round(rings.length * 0.8)];
    for (const sgn of [-1, 1]) {
      member(g, M.steelDark, 0.1, [sgn * top[0] * 0.8, top[3], top[2]],
        [sgn * 5.2, L02 + 0.2, foot]);
    }
  }
}

/**
 * The mainmast: a tripod carrying the after director, and her aerials.
 *
 * Three heavy legs off the 01 deck to a platform, the after main-battery
 * director and its six-metre rangefinder on that, and a pole topmast over it
 * with the yard her wireless is rove through. The Type 13 air-search ladder is
 * lashed up the starboard leg, which is where she carried hers.
 */
let MAST_TOP = { y: 30, z: MAST_Z };
function mainmast(g) {
  const z = MAST_Z;
  const foot = L01 + 0.16;
  const pPlat = canted(4.6, z - 4.6, z + 3.4, 1.6, { side: 3, back: 3 });
  deckOf(g, pPlat, foot);
  const topY = foot + 14.5;
  const legs = [[0, z + 2.2], [-2.8, z - 3.4], [2.8, z - 3.4]];
  for (const [x, lz] of legs) {
    const h = topY - foot;
    const dx = -x;
    const dz = (z + 0.4) - lz;
    const len = Math.hypot(h, dx, dz);
    const leg = cyl(g, M.steel, 0.34, 0.5, len,
      x + dx / 2, foot + h / 2, lz + dz / 2, 10);
    leg.rotation.order = 'ZYX';
    leg.rotation.z = Math.atan2(-dx, h);
    leg.rotation.x = Math.atan2(dz, h);
  }
  // The cross-bracing between the legs, which is what makes a tripod stiff.
  for (const f of [0.34, 0.66]) {
    const y = foot + (topY - foot) * f;
    const k = 1 - f;
    const pts = legs.map(([x, lz]) => [x * k, lz + (z + 0.4 - lz) * f]);
    for (let i = 0; i < 3; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 3];
      member(g, M.steelDark, 0.13, [a[0], y, a[1]], [b[0], y, b[1]]);
    }
  }
  // The searchlight platform half way up, and the boat derrick off the foot.
  const pSl = canted(3.0, z - 3.2, z + 2.2, 1.2, { side: 2, back: 2 });
  deckOf(g, pSl, foot + 6.4);
  kneesOf(g, pSl, pPlat, foot + 6.4, 2, 1.5);
  for (const sgn of [-1, 1]) {
    searchlight(g, M, sgn * 2.1, foot + 6.56, z - 0.4, 0.78);
  }

  const pTop = canted(2.6, z - 2.6, z + 2.8, 1.0, { side: 2, back: 2 });
  deckOf(g, pTop, topY);
  const dir = director(g, M, 0, topY + 0.16, z + 0.4, 1.65, 1.85);
  rangefinder(dir, M, 0, 2.15, 0, 6.0);
  // The pole topmast over it, and the yard her aerials are rove through.
  cyl(g, M.steelDark, 0.14, 0.22, 10.5, 0, topY + 5.4, z - 1.4, 8);
  box(g, M.steelDark, 8.4, 0.12, 0.12, 0, topY + 6.2, z - 1.4);
  box(g, M.steelDark, 5.0, 0.1, 0.1, 0, topY + 8.6, z - 1.4);
  for (const sgn of [-1, 1]) {
    member(g, M.steelDark, 0.06, [sgn * 4.2, topY + 6.2, z - 1.4],
      [sgn * 1.4, topY + 9.6, z - 1.4]);
  }
  MAST_TOP = { y: topY + 6.2, z: z - 1.4, half: 4.2, truck: topY + 10.6 };
}

/**
 * Her wireless aerials.
 *
 * Two masts and a set of wires between them, which on a Japanese cruiser is a
 * great deal of what she looks like from the beam: the main aerial span from
 * the foretop to the mainmast yard, the leads down off both ends of it, and
 * the triatic stay between the two mastheads.
 */
function rigging(g) {
  const fore = { y: BR_DIR + 6.4, z: BRIDGE_Z - 1.2 };
  const wire = (a, b) => member(g, M.steelDark, 0.045, a, b);
  // The triatic, and the aerial span under it.
  wire([0, fore.y, fore.z], [0, MAST_TOP.truck, MAST_TOP.z]);
  for (const sgn of [-1, 1]) {
    wire([0, fore.y - 0.6, fore.z], [sgn * MAST_TOP.half, MAST_TOP.y, MAST_TOP.z]);
    // The leads down off the yard to the after superstructure, and off the
    // foretop to the forecastle.
    wire([sgn * MAST_TOP.half, MAST_TOP.y, MAST_TOP.z],
      [sgn * 3.0, UPPER + 1.2, MAST_Z - 14]);
    wire([sgn * 1.2, fore.y - 1.2, fore.z],
      [sgn * 4.6, deckAt(58) + 1.0, 58]);
    // And the shrouds that stay the topmast.
    wire([sgn * MAST_TOP.half * 0.6, MAST_TOP.truck - 0.6, MAST_TOP.z],
      [sgn * 2.8, L01 + 0.3, MAST_Z - 3.4]);
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
  typeThirteen(g, M, S * 2.4, L01 + 8.4, MAST_Z - 2.4, 0, 3.6);
}

/**
 * What is on her plating.
 *
 * Two hundred and four metres of painted steel with nothing on it reads as a
 * short ship, because there is nothing to measure her against. What her
 * drawings show is two rows of scuttles the length of her, the sheer strake's
 * riveted lap under the deck edge, the scuppers that drain her waterway, and
 * the boat booms and accommodation ladders stowed against her side.
 */
function sideDetail(g) {
  const at = (z, drop) => {
    const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
    const y = sheer(t) - drop;
    return [F.shellAt(t, y), y, F.zAt(t, y)];
  };
  for (const [z0, z1, drop, step] of [[-84, 84, 1.5, 3.0], [-40, 52, 3.3, 3.0]]) {
    for (let z = z0; z <= z1; z += step) {
      const [w, y, zz] = at(z, drop);
      if (w < 2.4) continue;
      if (Math.abs(z - 84) < 4) continue;          // clear of the hawse pipes
      for (const sgn of [-1, 1]) {
        cyl(g, M.glass, 0.17, 0.17, 0.08, sgn * (w + 0.02), y, zz, 8)
          .rotation.z = Math.PI / 2;
        cyl(g, M.steel, 0.21, 0.21, 0.05, sgn * (w + 0.05), y, zz, 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }
  // The sheer strake's own seam, run as short plates that follow her line.
  const SEG = 76;
  for (let i = 0; i < SEG; i++) {
    const z = -88 + (i * 176) / SEG;
    const z2 = -88 + ((i + 1) * 176) / SEG;
    const [w, y, za] = at(z, 0.8);
    const [w2, , zb] = at(z2, 0.8);
    if (w < 1.8 || w2 < 1.8) continue;
    const len = Math.abs(zb - za);
    if (len < 0.05) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.hullDark, 0.09, 0.15, len + 0.05,
        sgn * ((w + w2) / 2 + 0.03), y, (za + zb) / 2,
        Math.atan2(sgn * (w2 - w), zb - za));
    }
  }
  // The scuppers, and the boat booms stowed fore and aft against her side.
  for (let z = -78; z <= 78; z += 8) {
    const [w, y, zz] = at(z, 0.4);
    if (w < 2.6) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.gunDark, 0.13, 0.2, 0.32, sgn * (w + 0.04), y, zz);
      cyl(g, M.cave, 0.08, 0.08, 0.12, sgn * (w + 0.09), y, zz, 6)
        .rotation.z = Math.PI / 2;
    }
  }
  for (const sgn of [-1, 1]) {
    const [w, y, zz] = at(-2, 1.0);
    cyl(g, M.steelDark, 0.16, 0.2, 13.0, sgn * (w + 0.28), y - 0.4, zz, 8)
      .rotation.x = Math.PI / 2;
    // And the accommodation ladder, triced up against her quarter.
    const [w2, y2, z2] = at(-30, 0.6);
    const l = box(g, M.steelDark, 0.12, 0.9, 7.0, sgn * (w2 + 0.3), y2 - 2.6, z2);
    l.rotation.x = -0.34;
  }
}

/**
 * The aircraft deck aft: two catapults, the handling rails, and the crane.
 *
 * A Takao worked three floatplanes off a deck between the mainmast and the
 * after turrets. The catapults are trained out over the quarters to launch,
 * the trolleys run back inboard on the rails, and the crane abaft them is what
 * picks an aeroplane out of the water and puts it back on the deck.
 */
function aviation(g) {
  const z = AIR_Z;
  const pDeck = planRun(8.0, z - 9.5, z + 9.5, 3.4, 3.4, { n: 8, arc: 4 });
  loftShape(g, M.deckSteel, [{ pts: pDeck, y: UPPER - 0.2 },
    { pts: pDeck, y: UPPER }], { floor: true });
  railPlan(g, grow(pDeck, -0.3), UPPER, { step: 2.4 });

  for (const sgn of [-1, 1]) {
    // The catapult: a girder on a training ring, with the trolley on it and
    // the charge house at the inboard end.
    const c = new THREE.Group();
    c.position.set(sgn * 5.6, UPPER + 0.5, z);
    c.rotation.y = sgn * 0.16;
    c.userData.dynamic = true;
    cyl(g, M.steelDark, 1.35, 1.5, 0.4, sgn * 5.6, UPPER + 0.2, z, 16);
    box(c, M.steel, 1.6, 0.75, 17.0, 0, 0.38, 0.5);
    // The girder's own webs and the rails along the top of it.
    for (let i = -7; i <= 7; i++) {
      box(c, M.steelDark, 1.7, 0.14, 0.22, 0, 0.05, i * 1.15 + 0.5);
    }
    for (const dx of [-0.52, 0.52]) {
      box(c, M.steelDark, 0.16, 0.16, 17.0, dx, 0.8, 0.5);
    }
    box(c, M.steelDark, 1.9, 0.5, 1.9, 0, 0.5, -7.8);      // the charge house
    box(c, M.steel, 2.1, 0.22, 2.4, 0, 0.9, 7.6);          // the head
    cyl(c, M.gunDark, 0.3, 0.3, 1.9, 0, 0.55, -8.6, 10)
      .rotation.z = Math.PI / 2;
    g.add(c);
    // The handling rails on the deck, and the turntable the trolley runs to.
    box(g, M.steelDark, 0.22, 0.12, 15.0, sgn * 2.4, UPPER + 0.1, z - 1.5);
    box(g, M.steelDark, 0.22, 0.12, 15.0, sgn * 3.9, UPPER + 0.1, z - 1.5);
  }
  cyl(g, M.steelDark, 2.6, 2.6, 0.14, 0, UPPER + 0.09, z - 7.5, 20);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(g, M.steel, 0.5, 0.06, 0.14, Math.sin(a) * 1.9, UPPER + 0.17,
      z - 7.5 + Math.cos(a) * 1.9, a);
  }

  // The crane: a king post and a laced lattice jib, stepped on the starboard
  // quarter abaft the catapults, which is where her plan puts it and where it
  // has to be to reach the water alongside.
  const cr = new THREE.Group();
  cr.position.set(S * 5.8, UPPER, z - 9.0);
  cyl(cr, M.steelDark, 1.25, 1.35, 0.32, 0, 0.16, 0, 16);
  const post = new THREE.Group();
  post.position.set(0, 0.32, 0);
  post.userData.dynamic = true;
  cr.add(post);
  box(post, M.steel, 1.9, 1.8, 1.7, 0, 0.9, -1.0);
  cyl(post, M.steel, 0.38, 0.48, 3.6, 0, 1.8, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 3.5, 0);
  jib.rotation.x = 0.46;
  post.add(jib);
  const JL = 12.0;
  const sAt = (f) => 0.42 - 0.2 * f;
  for (let i = 0; i < 9; i++) {
    const f0 = i / 9;
    const f1 = (i + 1) / 9;
    const s0 = sAt(f0);
    const s1 = sAt(f1);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        member(jib, M.steelDark, 0.1, [sx * s0, sy * s0, f0 * JL],
          [sx * s1, sy * s1, f1 * JL]);
      }
    }
    for (const sx of [-1, 1]) {
      member(jib, M.steelDark, 0.07, [sx * s0, -s0, f0 * JL],
        [sx * s1, s1, f1 * JL]);
    }
    member(jib, M.steelDark, 0.07, [-s0, s0, f0 * JL], [s1, s1, f1 * JL]);
  }
  cyl(jib, M.steelDark, 0.3, 0.3, 0.16, 0, 0, JL + 0.1, 12)
    .rotation.z = Math.PI / 2;
  cr.add(jib);
  // The whip and the hook hanging off the head of it.
  const head = [0, 3.5 + Math.sin(0.46) * JL, Math.cos(0.46) * JL];
  member(cr, M.steelDark, 0.05, head, [head[0], head[1] - 4.6, head[2]]);
  box(cr, M.gunDark, 0.3, 0.5, 0.3, head[0], head[1] - 4.9, head[2]);
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

/** Her boats, her ground tackle, her ventilators and her deck gear. */
function fittings(g) {
  // The boats on the deck between the funnels, in their chocks under the
  // derricks that hoist them.
  for (const sgn of [-1, 1]) {
    for (const [z, len] of [[F2_Z - 3, 8.5], [F1_Z - 1, 7.5]]) {
      boat(g, M, sgn * 5.4, L02 + 1.15, z, len);
      for (const dz of [-len * 0.28, len * 0.28]) {
        box(g, M.steelDark, 1.9, 0.9, 0.34, sgn * 5.4, L02 + 0.65, z + dz);
      }
    }
  }
  // Ventilator cowls down both sides of the 01 deck, turned outboard.
  for (let z = F2_Z - 14; z < BRIDGE_Z + 4; z += 4.4) {
    for (const sgn of [-1, 1]) {
      const w = Math.min(8.6, Math.max(1.2, halfDeck(z) - 1.45));
      cowl(g, M, sgn * (w - 0.9), L01 + 0.16, z, 0.32, 1.6, sgn * 1.4);
    }
  }

  // ---- her ground tackle, on the forecastle.
  const bow = 0.92 * LOA / 2;
  for (const sgn of [-1, 1]) {
    // The anchor in its recess, the hawse pipe it comes up, and the bill
    // board round it.
    const hx = halfDeck(bow) - 0.25;
    box(g, M.gunDark, 0.26, 1.9, 2.5, sgn * hx, deckAt(bow) - 2.5, bow);
    cyl(g, M.cave, 0.5, 0.5, 0.4, sgn * hx, deckAt(bow) - 1.0, bow, 10)
      .rotation.z = Math.PI / 2;
    box(g, M.hullDark, 0.1, 2.6, 3.4, sgn * (hx + 0.06), deckAt(bow) - 2.2, bow);
    // The cable, the capstan it comes to, and the compressor over the navel
    // pipe it goes down.
    box(g, M.gunDark, 0.36, 0.2, 7.5, sgn * 2.9, deckAtX(2.9, bow - 5) + 0.12,
      bow - 5);
    cyl(g, M.steelDark, 0.95, 1.05, 1.3, sgn * 2.9,
      deckAtX(2.9, bow - 8.5) + 0.65, bow - 8.5, 14);
    cyl(g, M.gunDark, 1.15, 1.15, 0.2, sgn * 2.9,
      deckAtX(2.9, bow - 8.5) + 1.4, bow - 8.5, 14);
    box(g, M.steelDark, 0.9, 0.5, 0.9, sgn * 2.9,
      deckAtX(2.9, bow - 11.5) + 0.25, bow - 11.5);
    // The paravane on its chock at the deck edge, which every Japanese
    // cruiser carried forward.
    box(g, M.steelDark, 0.5, 0.5, 3.2, sgn * 5.0,
      deckAtX(5.0, bow - 16) + 0.55, bow - 16);
    cyl(g, M.gunDark, 0.32, 0.18, 1.4, sgn * 5.0,
      deckAtX(5.0, bow - 16) + 0.55, bow - 14.4, 10).rotation.x = Math.PI / 2;
    // Bollards and fairleads down the forecastle, and the same aft.
    for (const z of [bow - 2, bow - 13, bow - 22, -bow + 4, -bow + 13]) {
      const hw = halfDeck(z) - 0.9;
      if (hw < 1) continue;
      for (const dz of [-0.45, 0.45]) {
        cyl(g, M.steelDark, 0.22, 0.24, 0.8, sgn * hw,
          deckAtX(hw, z) + 0.4, z + dz, 8);
      }
      box(g, M.steelDark, 1.0, 0.24, 1.5, sgn * hw, deckAtX(hw, z) + 0.12, z);
    }
  }
  // The capstan on the centreline forward, and the chrysanthemum on her stem.
  cyl(g, M.steelDark, 1.0, 1.1, 0.5, 0, deckAt(0.96 * LOA / 2) + 0.25,
    0.96 * LOA / 2, 14);
  const sz = F.zAt(1, deckAt(LOA / 2) - 1.6);
  cyl(g, mat(P.chrys), 1.3, 1.3, 0.18, 0, deckAt(LOA / 2) - 1.9, sz - 0.3, 18)
    .rotation.x = Math.PI / 2;

  // ---- and the quarterdeck: the after capstan, the depth-charge rails she
  // carried in 1944, and the ensign staff.
  const aft = -0.9 * LOA / 2;
  cyl(g, M.steelDark, 0.95, 1.05, 0.5, 0, deckAt(aft + 6) + 0.25, aft + 6, 14);
  for (const sgn of [-1, 1]) {
    const hw = Math.max(1.0, halfDeck(aft) - 1.6);
    box(g, M.steelDark, 0.7, 0.55, 9.0, sgn * hw, deckAtX(hw, aft) + 0.28, aft);
    for (let i = 0; i < 5; i++) {
      cyl(g, M.gunDark, 0.34, 0.34, 0.9, sgn * hw,
        deckAtX(hw, aft) + 0.58, aft - 3.4 + i * 1.7, 12).rotation.x = Math.PI / 2;
    }
  }
  cyl(g, M.steelDark, 0.11, 0.16, 5.0, 0, deckAt(-0.95 * LOA / 2) + 2.5,
    -0.95 * LOA / 2, 8);
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
    // The forward two pairs stand on the signal deck round the chart house,
    // which is the platform her plan puts them on. Set at a height of their
    // own they stood in the air off the side of the tower.
    tri(sgn * 6.4, BR_SIG, 26, sgn * 1.10);
    tri(sgn * 6.4, BR_SIG, 20, sgn * 1.57);
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
  ['sideDetail', sideDetail],
  ['superstructure', superstructure],
  ['bridge', bridge],
  ['funnels', funnels],
  ['mainmast', mainmast],
  ['rigging', rigging],
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
