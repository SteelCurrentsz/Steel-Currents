// Admiral Hipper, built out of her own lines.
//
// Six hundred and sixty-five feet of German heavy cruiser: eight twenty-point-
// three centimetre guns in four twin turrets, twelve ten-point-five in six
// stabilised twins, six torpedo tubes a side, and a tower bridge with the
// biggest rangefinder anybody put on a cruiser sitting on top of it.
//
// She is flush-decked, which is the first thing to get right -- no forecastle
// break, no step down to a quarterdeck, one weather deck from the stem to the
// transom with a knuckle running most of her length. The second is the bow.
// She was completed with a straight stem, took green water over Anton in any
// sort of sea, and came out of the yard in 1940 with the raked, flared
// Atlantic bow she is remembered by. The third is the funnel cap: a flat
// mushroom on a raked oval funnel, fitted at the same refit to keep her own
// smoke out of the foretop, and the one silhouette detail that says Hipper and
// not Prinz Eugen at a distance.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up, and
// therefore starboard is -X. y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { arado } from './planekit.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { AERO, catapultProfile } from './aero.js';
import { DECK_RUN } from '../../../shared/sim.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import {
  box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, loftShape,
  planHouse, ladder, sideLadder,
} from './shipkit.js';

const CLS = SHIP_CLASSES.hipper;
export const LOA = CLS.hull.length;      // 203 m
export const BEAM = CLS.hull.beam;       // 21.5 m
export const DRAFT = CLS.hull.draft;     // 7.7 m
/** Starboard, in this frame. */
const S = -1;

// Kriegsmarine grey, which is a colder and lighter grey than measure 21: hellgrau
// 50 on the topsides, dunkelgrau 51 on the hull, and the decks in a brown-grey
// deck paint over the wood.
const P = {
  hull: 0x6d7681,
  hullDark: 0x5c646e,
  boot: 0x1d2126,
  antifoul: 0x71352c,
  deck: 0x655f52,          // planked weather deck
  deckSteel: 0x5a6069,     // and the steel decks round the mountings
  deckDark: 0x4a505a,
  steel: 0x7b838d,
  steelDark: 0x616973,
  bright: 0x99a1aa,
  gun: 0x6e767f,
  gunDark: 0x3b4149,
  glass: 0x1f252b,
  canvas: 0x6e7166,
  wire: 0x2a3038,
  brass: 0x9a8250,
  cave: 0x14171b,
  raft: 0x3a3f46,
  mark: 0xd0ccc0,
  planeTop: 0x5c6a58,      // her Arados: splinter green over pale blue
  planeLow: 0x9fb0bd,
  swast: 0xb4372f,
};
const MATS = {};
const mat = (color, opts) => {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!MATS[key]) MATS[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MATS[key];
};
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ----------------------------------------------------------- her own lines --
//
// `t` runs -1 at the transom to +1 at the stem. A German heavy cruiser's body
// plan: a very fine entrance under a flared bow, maximum beam a little abaft
// amidships, a long parallel middle body, and a broad flat run aft to a
// transom -- she is a three-shaft ship and the water has to get to the wing
// screws.

// Half-breadths at the waterline. Extreme beam is 21.5 m at the deck edge,
// where the flare has had its say, so the moulded figure here is a little over
// ten.
const HALF_BEAM = [
  [-1.00, 4.35], [-0.94, 5.42], [-0.86, 6.62], [-0.74, 7.98], [-0.60, 9.05],
  [-0.44, 9.80], [-0.26, 10.24], [-0.08, 10.42], [0.10, 10.36], [0.26, 10.10],
  [0.41, 9.40], [0.51, 8.55], [0.61, 7.40], [0.70, 5.90], [0.80, 4.10],
  [0.90, 2.35], [0.95, 1.30], [1.00, 0.16],
];

const KEEL = [
  [-1.00, -2.30], [-0.92, -5.30], [-0.84, -6.85], [-0.70, -7.55], [-0.20, -7.74],
  [0.20, -7.72], [0.52, -7.55], [0.70, -6.90], [0.84, -5.10], [0.93, -2.20],
  [1.00, 2.40],
];

// One deck, flush, from stem to transom.
//
// Read off her own profile at the deck edge -- the top of the plating, under
// the guardrail -- rather than drawn by eye. What it says is that she has
// almost no sheer at all over four fifths of her length: five metres eighty
// from the transom to about forty metres from the stem, and then the Atlantic
// bow lifts her four metres in the last fifty. Drawn with the sheer of an
// older ship she stood nearly four metres too high at the stem and carried her
// forecastle turrets up there with her.
const SHEER = [
  [-1.00, 5.80], [-0.55, 5.78], [0.00, 5.78], [0.30, 5.82], [0.48, 5.96],
  [0.62, 6.26], [0.72, 6.68], [0.80, 7.20], [0.86, 7.74], [0.91, 8.36],
  [0.955, 9.10], [1.00, 9.80],
];

// How far outboard of the waterline the deck edge is carried, in metres.
//
// Flare is a breadth, not a fraction of a breadth. Taken as a fraction -- so
// many hundredths of the half-breadth at that station -- it goes to nothing
// exactly where a bow flares hardest, because that is where the waterline has
// gone to nothing: her forecastle came out as a needle a metre and a half
// across thirty metres from the stem, with the fine entrance she is supposed
// to have under it and no deck over it at all.
//
// So it is read off her body plan as an offset. Amidships she is nearly wall
// sided, a hand's breadth; forward it opens to better than two metres by
// twenty-five metres from the stem, which is the whole point of an Atlantic
// bow -- a fine waterline for speed with a broad flared deck over it to lift
// her to a head sea -- and closes again into the stem itself.
const FLARE = [
  [-1.00, 0.14], [-0.40, 0.22], [0.10, 0.30], [0.31, 0.62], [0.41, 0.92],
  [0.51, 1.32], [0.61, 1.76], [0.70, 2.14], [0.75, 2.26], [0.80, 2.22],
  [0.85, 2.02], [0.90, 1.62], [0.95, 1.02], [1.00, 0.15],
];

// ------------------------------------------------------------------------
//
// Reading her offsets as a fair line.
//
// `lerpTable` blends between two entries with a smoothstep, which is flat at
// both ends of every span. On a deckhouse nobody can see it; on a hull it is
// the difference between a line and a flight of steps, because the curve stops
// dead at every station and then hurries to the next one. Her deck edge came
// out scalloped -- a bulge at each offset with a flat between -- which is what
// a shipwright would call an unfair line and send back to the loft floor.
//
// What follows is the monotone cubic through the same offsets: it passes
// through every one of them, takes its slope at each from the two spans either
// side, and is held back where that would make it overshoot -- so a table that
// only narrows gives a line that only narrows, and there is no hollow between
// stations that was never drawn.
const SLOPES = new Map();
function slopesOf(tab) {
  let m = SLOPES.get(tab);
  if (m) return m;
  const n = tab.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    d.push((tab[i + 1][1] - tab[i][1]) / (tab[i + 1][0] - tab[i][0]));
  }
  m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  // Fritsch-Carlson: pull the slopes in wherever the cubic would otherwise
  // bulge past the offsets it is drawn through.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    if (a < 0) m[i] = 0;
    if (b < 0) m[i + 1] = 0;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  SLOPES.set(tab, m);
  return m;
}

/** Read a table of offsets at `t`, as a fair curve through them. */
function fair(tab, t) {
  const n = tab.length;
  if (t <= tab[0][0]) return tab[0][1];
  if (t >= tab[n - 1][0]) return tab[n - 1][1];
  const m = slopesOf(tab);
  let i = 0;
  while (i < n - 2 && t > tab[i + 1][0]) i++;
  const h = tab[i + 1][0] - tab[i][0];
  const u = (t - tab[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * tab[i][1]
    + (u3 - 2 * u2 + u) * h * m[i]
    + (-2 * u3 + 3 * u2) * tab[i + 1][1]
    + (u3 - u2) * h * m[i + 1];
}

const halfBeam = (t) => fair(HALF_BEAM, t);
const keelY = (t) => fair(KEEL, t);
const sheer = (t) => fair(SHEER, t);

/** How far her deck edge stands outboard of her waterline, in metres. */
function flare(t) { return fair(FLARE, t); }

/** Her half-breadth at this station and this height. */
function shellAt(t, y) {
  const w = halfBeam(t);
  const k = keelY(t);
  const sh = sheer(t);
  if (y <= k) return 0;
  const up = Math.min(1, Math.max(0, (y - k) / Math.max(0.6, -k + 0.5)));
  const belly = Math.pow(up, 0.34);
  let half = w * belly;
  if (y > 0) {
    // Above the water her topsides fall outboard, and they do it faster the
    // higher you look: a section through her bow is hollow at the waterline
    // and near enough upright by the time it reaches the deck, which is the
    // shape that throws a head sea outboard instead of shipping it.
    const h = Math.min(1, y / Math.max(1, sh));
    half += flare(t) * h * h;
  }
  return Math.max(0.03, half);
}

// The stem is raked and the counter overhangs, so where the shell is fore and
// aft depends on how high up you look.
//
// Both curves are read off her own profile: the leading edge of the stem at
// each height, and the trailing edge of the counter. Her Atlantic bow is a
// clipper stem with three metres of rake between the waterline and the deck
// edge -- not eight, which is what she had here and which threw her stem head
// out over the sea like a battleship's ram.
const STEM = 6.8;
const COUNTER = 3.4;
function stemAt(y) {
  // Nearly a straight rake above the water, rounding into the forefoot below
  // it. Drawn with a hard exponent the curve was flat for the bottom half of
  // its height and then bent sharply, so her stem met her forefoot in a corner
  // -- a chin under the bow rather than the sweep an Atlantic bow has.
  return STEM * Math.pow(Math.min(1, Math.max(0, y + 8.0) / 17.3), 1.28);
}
function counterAt(y) {
  return COUNTER * Math.pow(Math.min(1, Math.max(0, y + 2.0) / 7.8), 1.5);
}

// Her quarters are rounded into the transom, not cut off square.
//
// The shell is lofted as two panels at plus and minus the half-breadth, so a
// flat plate across the end of them meets her sides at a right angle -- and a
// right angle nine metres wide and eight tall is what made her stern read as
// the back of a lorry with a dark rectangle where her plating should be. So
// the station line at the transom is carried forward by the corner radius and
// the plate across it bulges aft to meet the sides on a curve: flat over the
// middle of her, rounded hard at the quarters, which is what a German cruiser
// stern looks like from astern.
const TRANSOM_R = 1.30;

/** How much of the rounding applies here: 1 at the transom, 0 by frame 190. */
function transomK(t) {
  return smooth(Math.max(0, Math.min(1, (-t - 0.952) / 0.048)));
}

/**
 * How far aft of the station line the shell stands, at `u` of the half-breadth.
 *
 * Nothing at the deck edge, where her sides are, and a full radius on the
 * centreline: a flattened round, which is what a transom is.
 */
function transomBulge(t, u) {
  const k = transomK(t);
  if (k <= 0) return 0;
  const a = Math.min(1, Math.abs(u));
  return -TRANSOM_R * k * Math.sqrt(Math.max(0, 1 - Math.pow(a, 6)));
}

function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.46) z += smooth((t - 0.46) / 0.54) * (stemAt(y) - STEM);
  else if (t < -0.80) z -= smooth((-t - 0.80) / 0.20) * (counterAt(y) - COUNTER);
  // The corner line, carried forward so the round has somewhere to happen.
  return z + TRANSOM_R * transomK(t);
}

/** Her deck edge at a station, in metres from amidships. */
export function deckAt(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return sheer(t) + 0.30;
}

/** And how far outboard the deck edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return shellAt(t, sheer(t));
}

// ------------------------------------------------------------------ hull --

const BOOT_LO = -2.3;
const BOOT_HI = 0.6;
// Stations enough that the chord between two of them lies on her line rather
// than inside it. Her deck loses three metres of breadth in every five of
// length over the last ten forward, and at a hundred and sixteen stations the
// straight edge from one station to the next cut that corner by enough that a
// ray dropped just inside her deck edge went past it and out underneath.
const STATIONS = 152;

/**
 * The three strakes, as functions of the station: red lead below the boot top,
 * the black boot topping through the waterline, and grey from there up to the
 * deck edge.
 */
function strakeBands() {
  return [
    [(t) => keelY(t) - 0.02, BOOT_LO, M.antifoul],
    [BOOT_LO, BOOT_HI, M.boot],
    [BOOT_HI, sheer, M.hull],
  ];
}

/** The same three, evaluated at one station, for capping the ends. */
function strakes(t) {
  const kb = keelY(t);
  return [
    [kb, Math.max(kb, BOOT_LO), M.antifoul],
    [Math.max(kb, BOOT_LO), Math.max(kb, BOOT_HI), M.boot],
    [Math.max(kb, BOOT_HI), sheer(t), M.hull],
  ];
}

/**
 * One band of shell plating, lofted between two heights the whole way round.
 *
 * Either height may be a number or a function of the station. Every band runs
 * the full length and shares its edges with its neighbours, which is what
 * keeps her watertight: a hull built as separate pieces has a seam you can see
 * daylight through wherever two of them disagree by a millimetre.
 */
function loftBand(g, m, lo, hi) {
  const loAt = typeof lo === 'function' ? lo : () => lo;
  const hiAt = typeof hi === 'function' ? hi : () => hi;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const kb = keelY(t);
    const a = Math.max(loAt(t), kb);
    const b = Math.max(hiAt(t), kb);
    for (const [y, w] of [[a, shellAt(t, a)], [b, shellAt(t, b)]]) {
      pos.push(-w, y, zAt(t, y), w, y, zAt(t, y));
    }
  }
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/** Close an end of the shell, painted in the same three strakes. */
function capEnd(g, t, out) {
  // Across the beam as well as up, so the transom can be the rounded plate it
  // is instead of one quad meeting her sides at a right angle.
  const NX = 12;
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const N = 14;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = shellAt(t, y);
      const z = zAt(t, y);
      for (let j = 0; j <= NX; j++) {
        const u = -1 + (2 * j) / NX;
        pos.push(u * w, y, z + transomBulge(t, u));
      }
    }
    const per = NX + 1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < NX; j++) {
        const a = i * per + j;
        const b = (i + 1) * per + j;
        if (out > 0) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }
}

/** Her weather deck: one sheet from the stem to the transom, cambered. */
function weatherDeck(g) {
  const pos = [];
  const idx = [];
  const CAM = 5;
  const across = CAM * 2 + 1;
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const sh = sheer(t);
    const w = shellAt(t, sh);
    const z = zAt(t, sh);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;
      const crown = (1 - u * u) * 0.30;
      pos.push(u * w, sh + crown, z + transomBulge(t, u));
    }
  }
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
}

/**
 * The waterway bar round her deck edge: the angle her sheer strake is capped
 * with, standing a hand's breadth proud of the plating and a hand's breadth
 * over the planking.
 *
 * Every steel ship has one -- it is what the deck drains to and what the
 * stanchion sockets are riveted through -- and without it her deck stops dead
 * at the top of the shell: from straight above, at the one station where the
 * flare has carried the deck edge further out than the plating under it, the
 * eye goes down between the two and out at the bottom.
 */
function deckEdge(g) {
  const pos = [];
  const idx = [];
  const N = STATIONS;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const sh = sheer(t);
    const w = shellAt(t, sh);
    const z = zAt(t, sh);
    const o = Math.min(0.14, w * 0.5);
    for (const sgn of [-1, 1]) {
      pos.push(sgn * w, sh - 0.34, z, sgn * (w + o), sh - 0.24, z,
        sgn * (w + o), sh + 0.24, z, sgn * w, sh + 0.24, z);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 8;
    const b = (i + 1) * 8;
    // Port: the underside, the outboard face and the cap, wound to port.
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
    // Starboard, the other way about.
    const c = a + 4;
    const d = b + 4;
    idx.push(c, c + 1, d, c + 1, d + 1, d);
    idx.push(c + 1, c + 2, d + 1, c + 2, d + 2, d + 1);
    idx.push(c + 2, c + 3, d + 2, c + 3, d + 3, d + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.hull));
}

/**
 * The knuckle, and the bulwark forward of it.
 *
 * A German cruiser has a hard chine in her topsides running most of her
 * length -- the plating turns out at it -- and forward of Anton the deck edge
 * carries a solid bulwark instead of rails, because the Atlantic bow was
 * fitted to keep the sea out of the forecastle and rails do not.
 */
function knuckleAndBulwark(g) {
  // The knuckle: a narrow strake of plating standing proud, from the transom
  // to where the flare takes over forward.
  const pos = [];
  const idx = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i * 0.86) / N;
    const y = sheer(t) - 1.55;
    const w = shellAt(t, y);
    const z = zAt(t, y);
    for (const [yy, ww] of [[y - 0.16, w], [y + 0.16, w + 0.10]]) {
      pos.push(-ww, yy, z, ww, yy, z);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.hullDark));

  // The bulwark: from the stem back to abreast Anton, both sides, with a
  // capping rail along the top of it.
  for (const sgn of [-1, 1]) {
    const bp = [];
    const bi = [];
    const Z0 = 58;
    const Z1 = LOA / 2;
    const K = 26;
    for (let i = 0; i <= K; i++) {
      const z = Z0 + ((Z1 - Z0) * i) / K;
      const t = Math.min(1, z / (LOA / 2));
      const sh = sheer(t);
      const w = shellAt(t, sh);
      const zz = zAt(t, sh);
      const h = 0.45 + smooth((z - Z0) / (Z1 - Z0)) * 0.95;
      bp.push(sgn * w, sh, zz, sgn * w, sh + h, zz);
      bp.push(sgn * (w - 0.16), sh, zz, sgn * (w - 0.16), sh + h, zz);
    }
    for (let i = 0; i < K; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      // Outboard face, inboard face, and the cap between them.
      if (sgn > 0) {
        bi.push(a, a + 1, b, a + 1, b + 1, b);
        bi.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
        bi.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
      } else {
        bi.push(a, b, a + 1, a + 1, b, b + 1);
        bi.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
        bi.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi);
    bg.computeVertexNormals();
    g.add(new THREE.Mesh(bg, M.hull));
  }
  // And closed across the stem head. Her half-breadth at the stem is a hand's
  // width, so the two sheets meet there in a slot narrower than their own
  // plating is thick -- and a ray fired down the centreline goes between them.
  {
    const t = 0.995;
    const sh = sheer(t);
    const zz = zAt(t, sh);
    box(g, M.hull, 0.42, 1.36, 0.5, 0, sh + 0.66, zz - 0.2);
    box(g, M.steelDark, 0.5, 0.12, 0.58, 0, sh + 1.34, zz - 0.2);
  }
}

/** A strut between two points, which is what a shaft bracket is made of. */
function strut(g, m, a, b, w, d) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const s = box(g, m, w, len, d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  s.rotation.z = Math.atan2(-dx, dy);
  s.rotation.x = Math.atan2(dz, Math.hypot(dx, dy));
  return s;
}

/**
 * One screw: a boss and three blades, each with the twist a propeller blade
 * has from root to tip.
 *
 * A blade is not a plank. It is a section of a helix: broad and coarsely
 * pitched at the root, narrower and finer at the tip, and skewed back so that
 * each part of it enters the water a moment after the part inboard of it.
 * Drawn as one flat box turned forty degrees it reads as a fan.
 */
function screw(g, x, y, z, hand, r) {
  const hub = new THREE.Group();
  hub.position.set(x, y, z);
  hub.userData.dynamic = true;
  hub.userData.screw = { hand };
  g.add(hub);
  // The boss, the fairwater cone abaft it and the nut inside that.
  cyl(hub, M.brass, r * 0.28, r * 0.24, r * 0.5, 0, 0, 0, 14).rotation.x = Math.PI / 2;
  cyl(hub, M.brass, 0.04, r * 0.24, r * 0.55, 0, 0, -r * 0.5, 14).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = new THREE.Group();
    bl.rotation.z = (i / 3) * Math.PI * 2;
    hub.add(bl);
    // Five lengths of blade, each set at its own pitch and each a little
    // narrower and thinner than the one inboard of it.
    const N = 5;
    for (let k = 0; k < N; k++) {
      const f0 = k / N;
      const f1 = (k + 1) / N;
      const rad = r * (0.24 + (f0 + f1) / 2 * 0.76);
      const wide = r * (0.52 - Math.pow((f0 + f1) / 2 - 0.35, 2) * 0.95);
      const seg = box(bl, M.brass, wide, (f1 - f0) * r * 0.78, r * 0.075,
        hand * r * 0.1 * ((f0 + f1) / 2), rad, 0);
      // Pitch: coarse at the root, finer at the tip, and handed.
      seg.rotation.y = hand * (0.66 - 0.28 * ((f0 + f1) / 2));
      seg.rotation.z = -hand * 0.14;
    }
  }
  return hub;
}

/**
 * A rudder: a balanced blade on its stock, with the part forward of the stock
 * that makes it balanced and the taper down to its heel.
 */
function rudder(g, x, zc, yTop, yBot) {
  const plan = (c, t) => [
    [c * 0.16, t * 1.55], [c * 0.30, t * 0.7], [c * 0.30, -t * 1.5],
    [c * 0.20, -t * 2.0], [-c * 0.20, -t * 2.0], [-c * 0.30, -t * 1.5],
    [-c * 0.30, t * 0.7], [-c * 0.16, t * 1.55],
  ].map(([w, zz]) => [x + w, zc + zz]);
  // Bottom to top, which is the order `loftShape` lofts in: handed to it the
  // other way up, every side face of the rudder is wound inside out and you
  // look straight through the blade.
  loftShape(g, M.hullDark, [
    { pts: plan(0.66, 0.72), y: yBot },
    { pts: plan(0.94, 0.94), y: yTop - (yTop - yBot) * 0.80 },
    { pts: plan(1.06, 1.02), y: yTop - (yTop - yBot) * 0.35 },
    { pts: plan(1.00, 1.00), y: yTop },
  ], { cap: true, floor: true });
  // The stock, up into the counter where the steering engine is, and the
  // palm the blade is bolted to it by.
  cyl(g, M.steelDark, 0.3, 0.34, 6.2, x, yTop + 2.6, zc + 0.35, 10);
  box(g, M.steelDark, 0.5, 1.1, 1.0, x, yTop - 0.4, zc + 0.35);
}

/** Three shafts in their bossings, three screws and twin rudders. */
function sternGear(g) {
  // She is a three-shaft ship: two on bossings out on her quarters and one on
  // the centreline in a skeg, which is what a cruiser with three sets of
  // turbines and a counter stern has under her.
  //
  // What was here was three lengths of pipe hanging in the water with a pair
  // of crossed sticks beside each one: no bossings, so the shafts began
  // nowhere; brackets that met neither the shaft nor the plating; and screws
  // whose blades were flat boards.
  for (const sgn of [-1, 1]) {
    const SX = sgn * 4.4;
    const SY = -5.4;
    // The bossing: the fairing that carries the shaft out of her quarter. It
    // starts buried in the plating and stands proud of it by the time the
    // shaft is clear.
    cyl(g, M.hullDark, 1.35, 0.60, 17.0, SX, SY, -66.5, 14).rotation.x = Math.PI / 2;
    cyl(g, M.hullDark, 0.62, 0.48, 3.0, SX, SY, -76.0, 12).rotation.x = Math.PI / 2;
    tubeZ(g, M.steelDark, 0.40, 14.0, SX, SY, -81.5, 12);
    // The A-bracket at the after end of it: two legs, one up and outboard to
    // the quarter and one up and inboard to the bottom, meeting on the shaft
    // bearing. Both of them touch the plating, which is the whole point of a
    // bracket.
    const BZ = -84.5;
    cyl(g, M.steelDark, 0.62, 0.62, 1.6, SX, SY, BZ, 12).rotation.x = Math.PI / 2;
    strut(g, M.steelDark, [SX, SY, BZ], [sgn * 5.30, -3.55, BZ], 0.34, 0.9);
    strut(g, M.steelDark, [SX, SY, BZ], [sgn * 2.90, -4.10, BZ], 0.30, 0.8);
    // The wing screw, turning outboard at the top the way a wing screw does.
    screw(g, SX, SY, -89.6, sgn, 1.95);
  }
  // The skeg on the centreline, and the shaft that runs out through it: her
  // keel comes up hard under the counter, so the centre shaft is carried down
  // clear of it on a fin rather than left to run out through the plating.
  {
    const pos = [];
    const idx = [];
    const N = 16;
    // From where her keel has risen clear of the shaft line aft to just
    // forward of the screw. Run on further forward it hangs below a bottom
    // that is already deeper than it is, which is a fin under her keel.
    for (let i = 0; i <= N; i++) {
      const z = -96.6 + (i * 10.1) / N;
      const t = z / (LOA / 2);
      const top = keelY(t) + 0.35;
      const bot = Math.min(top - 0.08, -6.45);
      const w = 0.45 + (i / N) * 0.22;
      pos.push(-w, bot, z, w, bot, z, -w, top, z, w, top, z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      idx.push(a, b, a + 2, a + 2, b, b + 2);
      idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    idx.push(0, 2, 1, 1, 2, 3);
    const e = N * 4;
    idx.push(e, e + 1, e + 2, e + 1, e + 3, e + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.hullDark));
    tubeZ(g, M.steelDark, 0.40, 12.0, 0, -5.90, -90.6, 12);
    cyl(g, M.hullDark, 0.72, 0.56, 3.2, 0, -5.90, -85.6, 12).rotation.x = Math.PI / 2;
    // The centre screw is right-handed and the wing screws turn outward, which
    // is how a three-shaft German cruiser was arranged. It is the smallest of
    // the three because it has the least water over it: her keel comes up hard
    // under the counter here, and a wing screw's diameter on the centreline
    // would have its upper blade inside her own bottom.
    screw(g, 0, -5.90, -96.0, 1, 1.55);
  }
  // Twin rudders, one either side of the centre shaft, with their stocks
  // carried up through the counter into the steering flat.
  //
  // Under the counter, and not abaft it. Hung a metre and a half further aft
  // the counter has already run out over them, so their stocks come up out of
  // the sea into clear air and stand there like two posts.
  for (const sgn of [-1, 1]) rudder(g, sgn * 2.9, -98.2, -3.4, -7.0);
}

/**
 * The transom.
 *
 * What was here was one plate across the end of her and nothing else: from
 * astern it read as a dark rectangle the size of a barn door, which is the one
 * thing a stern must never look like. What is actually there is plating in
 * athwartship strakes over a rounded counter, the gunwale and the knuckle
 * carried round the quarters rather than stopping dead at them, the stern
 * light, the quarter chocks the towing hawser leads through, and the drain
 * scuppers out of the steering flat.
 */
function transom(g) {
  const t = -1;
  const tY = sheer(t);
  const tW = shellAt(t, tY);
  const zOf = (y, u) => zAt(t, y) + transomBulge(t, u);
  const SEG = 16;

  // The gunwale, carried round the stern in segments, with the capping rail
  // on top of it and the knuckle a hand's breadth under the deck edge.
  for (let i = 0; i < SEG; i++) {
    const u0 = -1 + (2 * i) / SEG;
    const u1 = -1 + (2 * (i + 1)) / SEG;
    const x0 = u0 * tW;
    const x1 = u1 * tW;
    const z0 = zOf(tY, u0);
    const z1 = zOf(tY, u1);
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.08;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    // Inboard a touch, so the plating stands on her deck and not out past it.
    box(g, M.hull, 0.26, 0.30, len, mx * 0.985, tY + 0.15, mz + 0.14, ry);
    box(g, M.deckSteel, 0.40, 0.11, len, mx * 0.985, tY + 0.35, mz + 0.14, ry);
    box(g, M.hullDark, 0.22, 0.34, len, mx * 0.99, tY - 0.26, mz + 0.05, ry);
  }

  // Plate seams across her, laid athwartships the way the strakes run: a
  // finger proud of the plating, enough to catch the light and break the
  // sheet up, and no more.
  for (const y of [-1.4, 0.2, 1.7, 3.1, 4.4]) {
    const w = shellAt(t, y);
    if (w < 0.6) continue;
    for (let i = 0; i < SEG; i++) {
      const u0 = -1 + (2 * i) / SEG;
      const u1 = -1 + (2 * (i + 1)) / SEG;
      const x0 = u0 * w;
      const x1 = u1 * w;
      const z0 = zOf(y, u0);
      const z1 = zOf(y, u1);
      box(g, y > BOOT_HI ? M.hullDark : M.boot,
        Math.hypot(x1 - x0, z1 - z0) + 0.05, 0.09, 0.09,
        (x0 + x1) / 2, y, (z0 + z1) / 2 - 0.05,
        Math.atan2(-(z1 - z0), x1 - x0));
    }
  }

  // The stern light on its bracket over the ensign staff's step.
  cyl(g, M.steelDark, 0.15, 0.19, 0.5, 0, tY + 0.62, zOf(tY, 0) + 0.3, 8);
  cyl(g, M.bright, 0.21, 0.21, 0.3, 0, tY + 1.02, zOf(tY, 0) + 0.3, 10);
  // The quarter chocks, and the scuppers out of the steering flat under them.
  for (const sgn of [-1, 1]) {
    const u = sgn * 0.66;
    const cx = u * tW;
    const cz = zOf(tY, u) + 0.6;
    box(g, M.steelDark, 0.9, 0.5, 0.9, cx, tY + 0.35, cz);
    cyl(g, M.cave, 0.25, 0.25, 0.5, cx, tY + 0.39, cz, 10)
      .rotation.x = Math.PI / 2;
    const su = sgn * 0.44;
    cyl(g, M.cave, 0.17, 0.17, 0.3, su * shellAt(t, 3.6), 3.6,
      zOf(3.6, su) - 0.1, 8).rotation.x = Math.PI / 2;
  }
}

/** The whole shell: three strakes, both ends capped, the deck over the top. */
function hull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  capEnd(g, 1, 1);
  capEnd(g, -1, -1);
  weatherDeck(g);
  deckEdge(g);
  knuckleAndBulwark(g);
  sternGear(g);
  transom(g);
  // The scuttles down her topsides: a row in the strake between the knuckle
  // and the deck edge, which is where a cruiser's are. They used to be cut in
  // the deckhouse side, on the reading that the deckhouse was her side.
  for (let i = 0; i < 30; i++) {
    const z = -66 + (i * 132) / 29;
    const t2 = z / (LOA / 2);
    const y = sheer(t2) - 0.95;
    ports(g, shellAt(t2, y) + 0.03, y, z - 0.2, z + 0.2, 1);
  }
  // Anchors, hawse pipes and the cable running to the capstans.
  for (const sgn of [-1, 1]) {
    const az = 88;
    const t2 = az / (LOA / 2);
    const y = sheer(t2) - 2.4;
    const wx = shellAt(t2, y);
    const hp = cyl(g, M.cave, 0.5, 0.5, 0.5, sgn * (wx - 0.1), y, zAt(t2, y), 10);
    hp.rotation.z = Math.PI / 2;
    // The stocked anchor sitting in its own recess in the plating.
    box(g, M.gunDark, 0.28, 1.9, 1.15, sgn * (wx - 0.22), y - 0.2, zAt(t2, y) - 0.5);
    box(g, M.gunDark, 0.30, 0.34, 2.0, sgn * (wx - 0.22), y - 1.0, zAt(t2, y) - 0.5);
  }
}

// ------------------------------------------------------------ the battery --

/**
 * The plan of a German heavy gunhouse at one height.
 *
 * Not a rounded box. A Drh LC/34 is a wedge seen from above: a narrow face
 * plate, the front corners cut away on a long chamfer so a splinter takes them
 * on the slant, near-parallel sides, and a rear plate a little narrower again
 * with the corners knocked off it. Everything that looks like a turret about
 * her turrets is in that outline.
 */
function turretPlan(hw, nose, tail, faceHalf) {
  const rearHalf = hw * 0.88;
  return [
    [faceHalf, nose],
    [hw, nose - (hw - faceHalf) * 1.45],
    [hw, -tail + 0.85],
    [rearHalf, -tail],
    [-rearHalf, -tail],
    [-hw, -tail + 0.85],
    [-hw, nose - (hw - faceHalf) * 1.45],
    [-faceHalf, nose],
  ];
}

/**
 * A twin 20.3 cm SK C/34 in its Drh LC/34 mounting.
 *
 * Two hundred and fifty tons of turret on a five-and-a-half-metre roller path,
 * and the shape of it is all armour: a face plate of a hundred and sixty
 * millimetres raked back thirty degrees, seventy-millimetre sides standing
 * plumb, a flat seventy-millimetre roof, and a rear plate sloped the other way
 * so the whole gunhouse tapers from the trunnions aft. It overhangs its
 * barbette all round, which is why a Hipper's turrets sit on their barbettes
 * like a hat rather than growing out of them.
 *
 * The two guns are in separate cradles in one gunhouse, two metres and a sixth
 * apart -- close enough that her salvoes went out in pairs and far enough that
 * each gun lays for itself.
 *
 * `range` gives her the six-metre stereoscopic rangefinder that goes clean
 * through the after end of the gunhouse and stands out in a hood either side:
 * Bruno, Cäsar and Dora carried one, Anton never did.
 */
function eightInch(g, x, y, z, aft, range = false) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = aft ? Math.PI : 0;
  mount.userData.dynamic = true;
  g.add(mount);

  // -- what she trains on ---------------------------------------------------
  // The barbette top, the roller path inside it and the rack the training
  // engines walk her round on. All of it stands a little proud of the deck,
  // and the gunhouse comes down over it far enough to keep the weather out.
  cyl(mount, M.steelDark, 3.95, 4.05, 1.5, 0, -0.62, 0, 24);
  cyl(mount, M.gunDark, 3.62, 3.62, 0.34, 0, 0.15, 0, 24);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    box(mount, M.steelDark, 0.13, 0.2, 0.2,
      Math.sin(a) * 3.58, 0.15, Math.cos(a) * 3.58, a);
  }
  cyl(mount, M.gun, 3.42, 3.42, 0.3, 0, 0.44, 0, 24);

  // -- the gunhouse ---------------------------------------------------------
  // One lofted shell, not a box with a plate leant against it. The rake of the
  // face is in the loft: her nose comes aft a metre and a half over the two
  // and three quarter metres from the skirt to the roof, which is the thirty
  // degrees the face plate is set at, and it is the same piece of steel all
  // the way round to the rear plate.
  const HW = 3.74;
  const house = new THREE.Group();
  house.position.set(0, 0.55, 0);
  mount.add(house);
  const shell = [
    [-0.30, 3.64, 4.26, 4.44, 2.24],
    [0.10, HW, 4.60, 4.66, 2.42],
    [0.65, HW, 4.32, 4.66, 2.42],
    [1.75, HW, 3.74, 4.64, 2.42],
    [2.72, 3.72, 3.16, 4.58, 2.38],
    [2.92, 3.66, 3.04, 4.50, 2.32],
  ];
  loftShape(house, M.gun,
    shell.map(([yy, hw, nose, tail, fh]) => ({ pts: turretPlan(hw, nose, tail, fh), y: yy })),
    { cap: false });
  // Where the face plate laps on to the skirt, which on a German turret is a
  // step you can see from a mile off.
  loftShape(house, M.gunDark, [
    { pts: turretPlan(HW + 0.05, 4.64, 4.70, 2.45), y: 0.02 },
    { pts: turretPlan(HW + 0.05, 4.64, 4.70, 2.45), y: 0.22 },
  ], { cap: false });

  // The roof: one plate, with a lip standing proud all round it.
  loftShape(house, M.gun, [
    { pts: turretPlan(3.66, 3.04, 4.50, 2.32), y: 2.92 },
    { pts: turretPlan(3.80, 3.14, 4.62, 2.42), y: 3.00 },
    { pts: turretPlan(3.80, 3.14, 4.62, 2.42), y: 3.16 },
  ], { cap: true });

  // -- what is on the roof --------------------------------------------------
  for (const sgn of [-1, 1]) {
    // The layer's and trainer's sighting hoods, forward on either quarter of
    // the roof, each with its slit looking out over the guns.
    const hood = new THREE.Group();
    hood.position.set(sgn * 2.30, 3.16, 1.35);
    house.add(hood);
    cyl(hood, M.gun, 0.46, 0.52, 0.44, 0, 0.22, 0, 14);
    cyl(hood, M.gun, 0.38, 0.46, 0.22, 0, 0.53, 0, 14);
    box(hood, M.glass, 0.34, 0.13, 0.1, sgn * 0.30, 0.30, 0.34, sgn * 0.5);
    // The periscope beside it, which is what she is actually laid through.
    cyl(hood, M.gunDark, 0.11, 0.11, 0.36, sgn * 0.55, 0.2, -0.5, 8);
    // Lifting eyes, one at each corner of the roof.
    for (const lz of [2.5, -3.9]) {
      const eye = cyl(house, M.steelDark, 0.13, 0.13, 0.1, sgn * 2.9, 3.24, lz, 8);
      eye.rotation.x = Math.PI / 2;
    }
    // Ventilator mushrooms over the gun bays.
    cyl(house, M.gun, 0.2, 0.22, 0.34, sgn * 1.5, 3.3, -2.35, 10);
    cyl(house, M.gunDark, 0.38, 0.3, 0.16, sgn * 1.5, 3.52, -2.35, 12);
  }
  // The escape hatch aft on the centreline, with its coaming.
  box(house, M.gunDark, 1.15, 0.14, 1.15, 0, 3.22, -3.1);
  box(house, M.gun, 1.0, 0.12, 1.0, 0, 3.31, -3.1);
  cyl(house, M.steelDark, 0.14, 0.14, 0.06, 0.34, 3.39, -3.1, 8);
  // The training stops and the aerial trunk on the after end of the roof.
  box(house, M.steelDark, 0.3, 0.24, 0.3, 0, 3.28, -4.15);

  // -- the rangefinder ------------------------------------------------------
  // Six metres of base, straight through the after end of her, standing out in
  // a hood on either side. It is the one thing that breaks her outline: an
  // armoured box on the end of a tube, half a metre proud of the side plating
  // with the eyepiece window in the outboard face of it.
  if (range) {
    tubeX(house, M.gunDark, 0.34, 8.2, 0, 1.95, -2.7, 14);
    for (const sgn of [-1, 1]) {
      const hd = new THREE.Group();
      hd.position.set(sgn * 3.90, 1.95, -2.7);
      house.add(hd);
      box(hd, M.gun, 1.02, 1.05, 1.25, 0, 0, 0);
      box(hd, M.gun, 0.5, 0.72, 0.9, sgn * 0.62, 0.05, 0);
      box(hd, M.glass, 0.1, 0.34, 0.5, sgn * 0.88, 0.05, 0);
      // The little rain hood over the eyepiece window.
      const brow = box(hd, M.gunDark, 0.24, 0.09, 0.7, sgn * 0.86, 0.3, 0);
      brow.rotation.z = -sgn * 0.35;
    }
    // And the armoured cover over the tube where it crosses the roof.
    box(house, M.gun, 4.4, 0.44, 0.9, 0, 3.06, -2.7);
  }

  // -- the outside of her ---------------------------------------------------
  for (const sgn of [-1, 1]) {
    // The plate seams down her sides: an armoured gunhouse is bolted up out
    // of slabs, and the joins between them are the only thing on her flank.
    for (const sz of [1.9, -0.8, -3.4]) {
      box(house, M.gunDark, 0.06, 2.9, 0.1, sgn * (HW + 0.02), 1.35, sz);
    }
    // The stiffener along the bottom of the side plating.
    box(house, M.gunDark, 0.08, 0.22, 8.3, sgn * (HW + 0.02), 0.32, -0.2);
    // Foot rungs up the after corner, for the crew who go in over the top.
    for (let i = 0; i < 5; i++) {
      box(house, M.steelDark, 0.34, 0.06, 0.06, sgn * 3.5, 0.5 + i * 0.55, -4.25);
    }
  }
  // The door in the rear plate, and the sill under it.
  box(house, M.gunDark, 1.05, 1.75, 0.12, 0, 1.1, -4.62);
  box(house, M.steelDark, 1.25, 0.1, 0.3, 0, 0.2, -4.58);
  cyl(house, M.steelDark, 0.13, 0.13, 0.05, 0.32, 1.1, -4.7, 8)
    .rotation.x = Math.PI / 2;
  // The empty-case ports low in the rear plate, one to a gun.
  for (const sgn of [-1, 1]) {
    box(house, M.cave, 0.5, 0.52, 0.1, sgn * 1.9, 0.85, -4.64);
  }

  // -- the guns -------------------------------------------------------------
  // One cradle, two guns in it, and the trunnions at the height the face plate
  // is cut for. Every barrel is a jacket over a chase over a liner, and it
  // tapers the whole way out with a swell at the muzzle -- which is what tells
  // a naval rifle from a length of pipe at any range you can see one.
  const guns = new THREE.Group();
  guns.position.set(0, 2.05, 2.55);
  mount.add(guns);
  mount.userData.guns = guns;
  // The trunnion carriers, port and starboard, in the cradle.
  for (const sgn of [-1, 1]) {
    box(guns, M.gunDark, 0.5, 0.95, 1.6, sgn * 2.1, -0.12, -0.4);
    cyl(guns, M.steelDark, 0.26, 0.26, 0.24, sgn * 2.38, 0.1, -0.4, 10)
      .rotation.z = Math.PI / 2;
  }
  for (const sgn of [-1, 1]) {
    const bx = sgn * 1.08;
    // The slide the gun runs out in, inside the gunhouse, and the recoil
    // cylinders slung under it.
    box(guns, M.gunDark, 0.92, 0.86, 2.2, bx, -0.04, -0.5);
    for (const off of [-0.32, 0.32]) {
      tubeZ(guns, M.gunDark, 0.16, 1.9, bx + off, -0.46, -0.35, 8);
    }
    // The canvas boot laced round the gun where it comes through the face.
    const bag = cyl(guns, M.canvas, 0.48, 0.82, 1.5, bx, 0.14, 1.15, 14);
    bag.rotation.x = Math.PI / 2;
    // Twelve metres and a sixth of gun: a jacket over the breech end, two
    // lengths of taper, and the swell at the muzzle. It narrows the whole way
    // out, which is what tells a naval rifle from a length of pipe at any
    // range you can see one.
    //
    // A cylinder laid along the bore by turning it a quarter circle about x
    // puts its own top aft, so a taper handed to `cyl` the way it reads on the
    // drawing comes out the other way about: hers used to narrow to a waist a
    // third of the way out, swell back to the jacket's own diameter, and then
    // step down again for the chase. Three diameters in eight metres, with a
    // corner at each of them.
    tubeZ(guns, M.gunDark, 0.325, 2.0, bx, 0.14, 2.40, 14);
    for (const hz of [1.72, 2.30, 2.88]) {
      tubeZ(guns, M.gunDark, 0.345, 0.16, bx, 0.14, hz, 14);
    }
    cyl(guns, M.gun, 0.245, 0.325, 4.30, bx, 0.14, 5.55, 14)
      .rotation.x = Math.PI / 2;
    cyl(guns, M.gun, 0.195, 0.245, 2.60, bx, 0.14, 9.00, 14)
      .rotation.x = Math.PI / 2;
    tubeZ(guns, M.gun, 0.225, 0.44, bx, 0.14, 10.28, 14);
    cyl(guns, M.cave, 0.115, 0.115, 0.40, bx, 0.14, 10.35, 12)
      .rotation.x = Math.PI / 2;
  }
  // Where the two bores come out, in the cradle's own frame: thirteen metres
  // and a twentieth from the centre of her roller path, which is the reach her
  // datasheet gives and the reach the gun flash is drawn at.
  arm(mount, guns, [[-1.08, 0.14, 10.47], [1.08, 0.14, 10.47]]);
  return mount;
}

/**
 * The plan of a 10.5 cm gun shield at one height.
 *
 * Flat plate, not a dome. A C/31 shield is a splinter box: a flat face with
 * the corners cut off on a chamfer, sides running aft and a little inboard,
 * and no back to it at all -- the whole after end is open, because the loading
 * numbers have to get at the breeches and the empty cases have to go
 * somewhere. Drawn with a rounded front it read as a little turret, which is
 * the one thing this mounting is not.
 */
function shieldPlan(hw, front, back) {
  const cheek = hw * 0.50;
  return [
    [cheek, front],
    [hw, front - hw * 0.66],
    [hw * 0.97, -back * 0.5],
    [hw * 0.84, -back],
    [-hw * 0.84, -back],
    [-hw * 0.97, -back * 0.5],
    [-hw, front - hw * 0.66],
    [-cheek, front],
  ];
}

/**
 * A twin 10.5 cm SK C/33 in its Dopp. L. C/31 mounting.
 *
 * The German heavy anti-aircraft gun and the carriage that made it worth
 * having. The C/31 is triaxially stabilised -- it holds the guns laid while
 * the ship rolls under them -- and that is why the mounting reads as tall for
 * its calibre: there is a stabilised platform between the roller path and the
 * gun, and the shield stands on the platform rather than on the deck, so you
 * can see clean under it.
 *
 * Twenty-seven tons of it: a flat-plated splinter shield with the corners cut
 * off, open at the back, two guns a metre apart through one port with their
 * blast boots round them, the layer's and trainer's hoods either side of the
 * port, and the fuse-setting machine, the loading trays and the ready-use
 * racks standing out behind in the open.
 */
function tenFive(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  g.add(m);

  // -- the carriage ---------------------------------------------------------
  // The deck ring, the roller path on it and the training rack she is walked
  // round by. All of it stands proud, because on a stabilised mounting the
  // gear is above the deck where it can be got at.
  cyl(m, M.steelDark, 1.34, 1.46, 0.34, 0, 0.17, 0, 20);
  cyl(m, M.gunDark, 1.22, 1.22, 0.22, 0, 0.45, 0, 20);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    box(m, M.steelDark, 0.09, 0.16, 0.14,
      Math.sin(a) * 1.2, 0.45, Math.cos(a) * 1.2, a);
  }
  // The stabilised platform: a heavy drum on the roller path with the gimbal
  // trunnions in it, and the two rams that hold it level.
  cyl(m, M.gun, 1.06, 1.14, 0.72, 0, 0.92, 0, 18);
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.3, 0.5, 0.34, sgn * 1.08, 1.0, -0.1);
    const ram = cyl(m, M.steelDark, 0.11, 0.13, 0.75, sgn * 0.82, 0.9, 0.72, 8);
    ram.rotation.x = 0.3;
  }
  cyl(m, M.gunDark, 1.16, 1.10, 0.2, 0, 1.36, 0, 18);

  // -- the shield -----------------------------------------------------------
  const sh = new THREE.Group();
  sh.position.set(0, 1.44, 0);
  m.add(sh);
  loftShape(sh, M.gun, [
    { pts: shieldPlan(1.60, 1.36, 1.24), y: 0 },
    { pts: shieldPlan(1.66, 1.42, 1.30), y: 0.22 },
    { pts: shieldPlan(1.66, 1.36, 1.30), y: 1.42 },
    { pts: shieldPlan(1.60, 1.16, 1.26), y: 1.94 },
    { pts: shieldPlan(1.44, 0.96, 1.12), y: 2.16 },
  ], { cap: true });
  // Its bottom edge, standing a little proud: a shield is a plate on a frame,
  // and the frame is what you see under it.
  loftShape(sh, M.gunDark, [
    { pts: shieldPlan(1.70, 1.46, 1.34), y: -0.06 },
    { pts: shieldPlan(1.70, 1.46, 1.34), y: 0.14 },
  ], { cap: false });
  // The stiffening ribs down the two cheeks of her, which is most of what you
  // see of a shield from abeam.
  for (const sgn of [-1, 1]) {
    for (const rz of [0.45, -0.35]) {
      box(sh, M.gunDark, 0.08, 1.5, 0.1, sgn * 1.63, 0.85, rz);
    }
    // And the plate seam along the top of the side, under the roof.
    box(sh, M.gunDark, 0.07, 0.12, 2.1, sgn * 1.62, 1.72, -0.2);
  }

  // The gun port: one wide opening across the face with a raised bolster round
  // it, and the two boots through it.
  box(sh, M.gun, 1.9, 1.0, 0.24, 0, 0.92, 1.3);
  box(sh, M.cave, 1.62, 0.72, 0.2, 0, 0.92, 1.42);
  // The sighting hoods either side of it: the layer to starboard, the trainer
  // to port, each looking out through his own slit.
  for (const sgn of [-1, 1]) {
    const hd = new THREE.Group();
    hd.position.set(sgn * 1.3, 1.16, 0.86);
    sh.add(hd);
    box(hd, M.gun, 0.46, 0.5, 0.58, 0, 0, 0);
    box(hd, M.gun, 0.3, 0.34, 0.3, sgn * 0.2, 0.02, 0.28);
    box(hd, M.glass, 0.16, 0.16, 0.1, sgn * 0.24, 0.04, 0.42);
    const brow = box(hd, M.gunDark, 0.34, 0.07, 0.3, 0, 0.28, 0.3);
    brow.rotation.x = -0.3;
  }
  // The lifting eyes on the roof, and the handrail along the top of the side
  // that the loading numbers hold on to when she rolls.
  for (const sgn of [-1, 1]) {
    cyl(sh, M.steelDark, 0.08, 0.08, 0.14, sgn * 0.62, 2.2, -0.4, 8);
    box(sh, M.steelDark, 0.06, 0.06, 1.7, sgn * 1.5, 2.24, -0.2);
  }

  // -- the guns -------------------------------------------------------------
  // Two SK C/33 in one cradle, a metre apart, each in its own sleeve. Sixty-
  // five calibres of barrel: six metres and a half of it, four and a half of
  // that outside the shield, tapering the whole way with a reinforce at the
  // muzzle.
  const guns = new THREE.Group();
  guns.position.set(0, 0.92, 0.55);
  guns.rotation.x = -0.20;
  sh.add(guns);
  // The cradle and the recuperators over the barrels, which is the shape you
  // see between the two guns.
  box(guns, M.gunDark, 1.5, 0.42, 1.1, 0, -0.16, -0.15);
  for (const sgn of [-1, 1]) {
    const bx = sgn * 0.52;
    // The recoil cylinder slung over the gun in its own housing.
    tubeZ(guns, M.gunDark, 0.11, 1.5, bx, 0.24, 0.6, 8);
    // The boot: the canvas laced round the gun where it comes through the port.
    const bag = cyl(guns, M.canvas, 0.24, 0.36, 0.62, bx, 0, 0.72, 12);
    bag.rotation.x = Math.PI / 2;
    // The sleeve, then the taper, then the chase and the muzzle reinforce.
    tubeZ(guns, M.gunDark, 0.155, 0.9, bx, 0, 1.5, 12);
    cyl(guns, M.gunDark, 0.105, 0.155, 2.5, bx, 0, 3.2, 12)
      .rotation.x = -Math.PI / 2;
    tubeZ(guns, M.gunDark, 0.105, 1.0, bx, 0, 4.95, 12);
    tubeZ(guns, M.gunDark, 0.125, 0.24, bx, 0, 5.55, 12);
    cyl(guns, M.cave, 0.062, 0.062, 0.2, bx, 0, 5.6, 10)
      .rotation.x = Math.PI / 2;
  }
  m.userData.trainRate = 0.9;      // a triaxially stabilised 10.5 cm twin
  arm(m, guns, [[-0.52, 0, 5.72], [0.52, 0, 5.72]]);

  // -- what is behind an open-backed shield ---------------------------------
  // And the reason it is open: the breeches have to be got at, the rounds have
  // to be fused on their way to them, and the empty cases have to go over the
  // side. All of it stands out in the weather abaft the plate.
  const back = new THREE.Group();
  back.position.set(0, 1.44, 0);
  m.add(back);
  // The breech ends of the two guns, and the loading trays under them.
  for (const sgn of [-1, 1]) {
    box(back, M.gunDark, 0.42, 0.46, 0.8, sgn * 0.52, 0.92, -0.75);
    const tray = box(back, M.steelDark, 0.34, 0.08, 0.9, sgn * 0.52, 0.66, -1.15);
    tray.rotation.x = 0.22;
    // The empty-case chute, which is where the brass goes.
    const ch = box(back, M.steelDark, 0.28, 0.5, 0.1, sgn * 0.9, 0.5, -1.05);
    ch.rotation.x = 0.3;
  }
  // The fuse-setting machine on the centreline behind them, with its dial.
  box(back, M.gunDark, 0.66, 0.6, 0.5, 0, 0.7, -1.6);
  cyl(back, M.steelDark, 0.24, 0.24, 0.1, 0, 1.06, -1.6, 14);
  cyl(back, M.brass, 0.16, 0.16, 0.06, 0, 1.13, -1.6, 12);
  // The platform the loading numbers stand on, and its rail.
  box(back, M.deckSteel, 2.5, 0.12, 1.0, 0, 0.24, -1.5);
  for (const sgn of [-1, 1]) {
    for (const [ry2, dz] of [[0, -2.0], [1, 0]]) {
      if (ry2) {
        box(back, M.steelDark, 0.06, 0.06, 1.1, sgn * 1.24, 0.85, -1.55);
        box(back, M.steelDark, 0.06, 0.06, 1.1, sgn * 1.24, 0.55, -1.55);
      } else {
        box(back, M.steelDark, 2.5, 0.06, 0.06, 0, 0.85, dz);
        box(back, M.steelDark, 2.5, 0.06, 0.06, 0, 0.55, dz);
      }
    }
    box(back, M.steelDark, 0.07, 0.62, 0.07, sgn * 1.24, 0.55, -2.0);
    // The layer's and trainer's seats, out on their own brackets either side,
    // with the handwheels in front of them.
    const seat = new THREE.Group();
    seat.position.set(sgn * 1.42, 0.62, -0.2);
    back.add(seat);
    box(seat, M.gunDark, 0.42, 0.08, 0.4, 0, 0, 0);
    box(seat, M.gunDark, 0.4, 0.34, 0.07, 0, 0.2, -0.2);
    const arm2 = box(seat, M.steelDark, 0.5, 0.09, 0.09, -sgn * 0.25, -0.1, 0);
    arm2.rotation.z = sgn * 0.16;
    const hw = cyl(seat, M.gunDark, 0.24, 0.24, 0.06, -sgn * 0.16, 0.16, 0.42, 14);
    hw.rotation.z = Math.PI / 2;
    cyl(seat, M.steelDark, 0.05, 0.05, 0.3, -sgn * 0.16, 0.16, 0.42, 8)
      .rotation.z = Math.PI / 2;
    // Ready-use rounds in their racks against the outside of the shield: what
    // a mounting in local control fires until the hoist catches up.
    for (const rz of [-0.15, 0.45]) {
      box(m, M.steelDark, 0.26, 0.66, 0.4, sgn * 1.86, 1.9, rz);
      for (let k = 0; k < 3; k++) {
        cyl(m, M.brass, 0.05, 0.05, 0.5, sgn * 1.86, 2.2, rz - 0.12 + k * 0.12, 8);
      }
    }
  }
  // The hoist head, where the rounds come up out of the deck into her.
  cyl(m, M.gunDark, 0.36, 0.4, 0.9, 0, 0.45, -1.75, 12);
  box(m, M.steelDark, 0.5, 0.14, 0.4, 0, 0.95, -1.75);
  return m;
}

/**
 * A twin 3.7 cm SK C/30 in its Dopp. L. C/30 mounting.
 *
 * The mounting is the point of it. The gun was a single-shot 3.7 cm that fired
 * about as fast as a man could feed it, and what made the Kriegsmarine buy it
 * by the hundred was the carriage: triaxially stabilised, so the guns stayed
 * laid while the ship rolled under them. That is a big gimballed frame between
 * two heavy trunnion arms, and it is the whole shape of the thing -- wide, low
 * and open, with the barrels standing well out in front of it and the layer's
 * and trainer's seats out on either side.
 *
 * What was here was a drum, a box and two tubes.
 */
function threeSeven(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  g.add(m);
  // The pedestal, the roller path it trains on, and the toothed rack.
  cyl(m, M.steelDark, 0.60, 0.76, 0.85, 0, 0.42, 0, 14);
  cyl(m, M.gunDark, 0.72, 0.72, 0.16, 0, 0.92, 0, 14);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    box(m, M.gunDark, 0.08, 0.12, 0.12, Math.sin(a) * 0.74, 0.92, Math.cos(a) * 0.74, a);
  }
  cyl(m, M.steelDark, 0.56, 0.56, 0.3, 0, 1.14, 0, 14);

  // The two trunnion arms the stabilised cradle hangs between: the heaviest
  // members on the mounting and the thing you see first from any angle.
  for (const sgn of [-1, 1]) {
    const armY = box(m, M.gun, 0.24, 1.05, 0.62, sgn * 0.82, 1.75, -0.05);
    armY.rotation.z = -sgn * 0.10;
    // The trunnion bearing itself, and its cap.
    cyl(m, M.gunDark, 0.22, 0.22, 0.3, sgn * 0.9, 2.2, -0.05, 12)
      .rotation.z = Math.PI / 2;
    cyl(m, M.steelDark, 0.13, 0.13, 0.38, sgn * 1.02, 2.2, -0.05, 8)
      .rotation.z = Math.PI / 2;
  }
  // The base of the frame, spanning between the arms under the guns.
  box(m, M.gun, 1.75, 0.42, 0.9, 0, 1.32, -0.15);

  // The elevating cradle: the frame the two guns sit in, on the trunnions.
  const cradle = new THREE.Group();
  cradle.position.set(0, 2.2, -0.05);
  m.add(cradle);
  const guns = new THREE.Group();
  guns.rotation.x = -0.30;
  cradle.add(guns);
  // The frame: two side plates with the cross members between them.
  for (const sgn of [-1, 1]) {
    box(guns, M.gun, 0.14, 0.5, 1.5, sgn * 0.62, 0, 0.35);
  }
  box(guns, M.gunDark, 1.4, 0.22, 1.4, 0, -0.2, 0.3);
  box(guns, M.gunDark, 1.4, 0.16, 0.3, 0, 0.2, -0.35);

  for (const sgn of [-1, 1]) {
    const bx = sgn * 0.34;
    // The breech and its casing, which is the bulk of a 3.7 cm gun.
    box(guns, M.gunDark, 0.34, 0.4, 1.05, bx, 0.06, -0.05);
    // The jacket over the chamber end, then the barrel proper, then the
    // muzzle brake: the barrel is nearly three metres of it and it stands
    // right out in front of the carriage.
    tubeZ(guns, M.gunDark, 0.115, 0.55, bx, 0.06, 0.72, 10);
    tubeZ(guns, M.gunDark, 0.062, 1.85, bx, 0.06, 1.9, 10);
    cyl(guns, M.gunDark, 0.085, 0.085, 0.3, bx, 0.06, 2.92, 10)
      .rotation.x = Math.PI / 2;
    cyl(guns, M.cave, 0.04, 0.04, 0.16, bx, 0.06, 3.02, 8).rotation.x = Math.PI / 2;
    // The loading tray on top and the spent-case chute under it: a C/30 is
    // hand-fed a round at a time and the tray is where the loader stands.
    box(guns, M.steelDark, 0.24, 0.07, 0.7, bx, 0.3, -0.15);
    const chute = box(guns, M.steelDark, 0.22, 0.5, 0.22, bx, -0.34, -0.5);
    chute.rotation.x = 0.32;
  }
  m.userData.trainRate = 1.5;      // a stabilised 3.7 cm twin, deliberate
  arm(m, guns, [[-0.34, 0.06, 3.08], [0.34, 0.06, 3.08]]);

  // The layer to starboard and the trainer to port, each on his own seat out
  // on the end of an arm, with the handwheel in front of him. This is what
  // makes a C/30 read as a manned mounting rather than as a gun on a post.
  for (const sgn of [-1, 1]) {
    box(m, M.steelDark, 0.5, 0.09, 0.44, sgn * 1.3, 1.62, -0.5);
    box(m, M.steelDark, 0.09, 0.42, 0.09, sgn * 1.3, 1.4, -0.5);
    cyl(m, M.gunDark, 0.24, 0.24, 0.06, sgn * 1.12, 1.95, -0.05, 12)
      .rotation.z = Math.PI / 2;
    // The bracket that carries the seat out from the frame.
    const br = box(m, M.gun, 0.62, 0.12, 0.3, sgn * 1.05, 1.55, -0.5);
    br.rotation.z = -sgn * 0.1;
  }
  // The splinter plate across the front of the carriage, low, which is all the
  // shield a C/30 has.
  const plate = box(m, M.gun, 1.9, 0.62, 0.09, 0, 1.62, 0.75);
  plate.rotation.x = -0.20;
  // And the ready-use clips in their racks on the after end of the mounting.
  for (const sgn of [-1, 1]) {
    box(m, M.steelDark, 0.26, 0.5, 0.36, sgn * 0.55, 1.62, -0.85);
  }
  return m;
}

/** A 2 cm Flakvierling: four barrels on one carriage behind a light shield. */
function twoCm(g, x, y, z, ry, quad = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  g.add(m);
  // The base: a plate on the deck, the training column standing out of it, and
  // the ring the whole mounting swings on. A Vierling weighs two and a half
  // tons and is trained by one man on a shoulder yoke, so the column is short
  // and fat and everything above it is balanced about it.
  cyl(m, M.steelDark, 0.72, 0.78, 0.12, 0, 0.06, 0, 14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(m, M.steelDark, 0.16, 0.1, 0.4, Math.sin(a) * 0.5, 0.16, Math.cos(a) * 0.5, a);
  }
  cyl(m, M.steelDark, 0.34, 0.46, 0.62, 0, 0.42, 0, 12);
  cyl(m, M.gunDark, 0.4, 0.4, 0.1, 0, 0.78, 0, 12);

  const cradle = new THREE.Group();
  cradle.position.set(0, 0.86, 0);
  m.add(cradle);
  // The trunnion carriers, the layer's seat slung between them, and the two
  // handwheels he lays and trains on.
  for (const sgn of [-1, 1]) {
    box(cradle, M.gunDark, 0.13, 0.55, 0.3, sgn * 0.42, 0.18, -0.05);
    cyl(cradle, M.gunDark, 0.12, 0.12, 0.05, sgn * 0.5, 0.36, -0.05, 10)
      .rotation.z = Math.PI / 2;
  }
  box(cradle, M.gunDark, 0.38, 0.08, 0.34, 0, 0.06, -0.62);
  box(cradle, M.gunDark, 0.34, 0.36, 0.07, 0, 0.26, -0.8);
  for (const sgn of [-1, 1]) {
    cyl(cradle, M.steelDark, 0.16, 0.16, 0.04, sgn * 0.5, 0.2, -0.42, 10)
      .rotation.z = Math.PI / 2;
  }
  // The shield: a low plate across the front with the barrels through it, and
  // the two wings cranked back off it.
  const shield = box(cradle, M.gun, 1.18, 0.78, 0.09, 0, 0.42, 0.5);
  shield.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    const wing = box(cradle, M.gun, 0.4, 0.72, 0.08, sgn * 0.75, 0.4, 0.4);
    wing.rotation.y = -sgn * 0.5;
  }

  const guns = new THREE.Group();
  guns.rotation.x = -0.42;
  cradle.add(guns);
  // Four guns in two pairs, one pair over the other: the Flakvierling 38. The
  // 2 cm single that a few of her sponsons carried is the same gun on its own.
  const spots = quad ? [[-0.24, 0.06], [0.24, 0.06], [-0.24, 0.40], [0.24, 0.40]] : [[0, 0.2]];
  for (const [bx, by] of spots) {
    // The receiver, the barrel, the jacket over its breech end and the cone
    // flash hider on the muzzle.
    box(guns, M.gunDark, 0.14, 0.15, 0.62, bx, by, -0.1);
    tubeZ(guns, M.gunDark, 0.075, 0.34, bx, by, 0.32, 8);
    tubeZ(guns, M.gunDark, 0.042, 1.30, bx, by, 1.05, 6);
    cyl(guns, M.gunDark, 0.075, 0.05, 0.16, bx, by, 1.74, 8).rotation.x = Math.PI / 2;
    // The twenty-round box magazine standing up out of the feed, and the
    // spent-case chute under it.
    box(guns, M.gunDark, 0.1, 0.4, 0.17, bx + 0.17, by + 0.26, -0.06);
    box(guns, M.gunDark, 0.08, 0.2, 0.14, bx - 0.14, by - 0.16, -0.06);
  }
  m.userData.trainRate = quad ? 2.1 : 2.8;   // the Vierling, and the single
  arm(m, guns, spots.map(([bx, by]) => [bx, by, 1.84]));
  return m;
}

/** A triple bank of 53.3 cm tubes on its training ring. */
function torpedoBank(g, x, y, z, ry) {
  const bank = new THREE.Group();
  bank.position.set(x, y, z);
  bank.rotation.y = ry;
  bank.userData.dynamic = true;
  g.add(bank);
  cyl(bank, M.steelDark, 0.95, 1.15, 0.55, 0, 0.28, 0, 16);
  // The three tubes side by side in one cradle, and the layer's shield.
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.05, 0);
  bank.add(cradle);
  box(cradle, M.steelDark, 2.7, 0.5, 1.1, 0, -0.35, 0);
  for (let i = -1; i <= 1; i++) {
    const tx = i * 0.82;
    tubeZ(cradle, M.gun, 0.36, 8.6, tx, 0, 0, 14);
    cyl(cradle, M.gunDark, 0.38, 0.38, 0.25, tx, 0, 4.3, 14).rotation.x = Math.PI / 2;
    cyl(cradle, M.cave, 0.3, 0.3, 0.1, tx, 0, 4.46, 12).rotation.x = Math.PI / 2;
    // The rails and the after door.
    box(cradle, M.steelDark, 0.16, 0.4, 1.0, tx, -0.42, -3.9);
  }
  box(cradle, M.gun, 1.5, 1.15, 0.14, 0, 0.35, -4.5);
  arm(bank, cradle, [[-0.82, 0, 4.5], [0, 0, 4.5], [0.82, 0, 4.5]]);
  return bank;
}

// ------------------------------------------------- deckhouses and the tower --

// Where everything lives along her. Read once, here, rather than typed into
// half a dozen builders that then drift apart.
// Stations off her own profile, in metres from amidships. Forty-five and a
// half metres abaft the stem for Anton, fifty-six for Bruno; the after pair
// mirror them about the same distance from the transom.
const A_Z = 56.6;               // Anton
const B_Z = 46.3;               // Bruno, superfiring over her
// The bridge structure, foot to fore end, and the tower that stands on its
// after half. The two are separate numbers because they are separate things:
// the block runs from abreast Bruno to the boat deck abaft it, and the tower
// -- trunk, foretop and mast -- is stepped well aft in it, over the conning
// tower rather than over the bridge front. Built on the middle of the block
// the whole of her fighting top stood fourteen metres too far forward.
const BRIDGE = [15.8, 41.4];
const TOWER_Z = 21.2;           // the trunk and the foretop
const MAST_Z = 16.7;            // and the pole mast abaft them
const FUNNEL_Z = 8.3;
// Where her boats are stowed: abreast the funnel and just abaft it, in the
// one stretch of her beam that has no gun sponson on it.
const BOAT_Z = 14.0;
const CAT_Z = -12;              // the catapult, athwartships
// Her catapult's stroke. The trolley sits inboard of the ring and is thrown
// out along the girder; she is off the end of it in about fifty feet.
//
// Where the trolley rests is measured out along the girder from her
// centreline, and it decides whether the aeroplane on it is on the ship. An
// Arado spans twelve metres and two fifths and the Hipper is twenty-one and a
// third across, so one parked eight metres off the centreline has three and a
// half metres of wing out over the sea; at four she is inside her own deck
// edge, which is where a ship keeps an aeroplane she is not using.
const CAT_A = -4.0;             // the trolley at rest, inboard end of the track
const CAT_STROKE = 16.0;        // and how much track she has to be thrown down
const CAT_TRAIN = 0.30;         // how far the ring swings round to shoot
const HANGAR = [-5.0, 4.0];     // the aircraft house, abaft the funnel
// Far enough forward that Cäsar can train right round without her rear
// corners going through it. Her gunhouse swings a six-metre circle about her
// barbette at z = -48.9, so anything abaft z = -42.9 is in the way of it --
// and the after superstructure used to end at -44.6, which put a metre and a
// half of deckhouse inside the turret's own sweep.
const AFT_TOWER = [-41.7, -29.1];  // the after control position
const MAIN_MAST_Z = -18.8;      // and the mainmast, abaft the catapult

/**
 * Her superstructure deck, station by station: how far out its edge is.
 *
 * Narrower than her hull the whole way, because a cruiser has a waist -- a
 * walkway outboard of the superstructure that the boats, the tubes and the
 * secondary mountings stand on sponsons off. Built out to the deck edge she
 * has no deck left at all: planking at the bow, planking at the stern, and
 * superstructure everywhere in between.
 */
// The two decks of the superstructure, and how much open weather deck she is
// left each side of the lower one.
// How high the lower tier of her superstructure stands over the weather deck:
// the long grey band that runs from the bridge aft past the funnel and reads
// as a second hull. Drawn at three metres she looked slab-sided from abeam,
// with the deckhouse standing as tall as the freeboard under it.
export const LOW_TIER = 2.5;    // upper deck, over the weather deck
const WALKWAY = 3.0;            // deck edge to the house side
const SUPER_HALF = [
  [-41.7, 5.0], [-38, 5.7], [-32, 6.2], [-22, 6.8], [-10, 7.0],
  [4, 7.0], [16, 6.95], [28, 6.85], [36, 6.6], [41.4, 5.4],
];
const X_Z = -48.9;              // Cäsar
const Y_Z = -62.2;              // Dora

/** A deckhouse: a rounded-corner box standing on the deck at this station. */
function house(g, m, hw, z0, z1, y0, h, opts = {}) {
  const zc = (z0 + z1) / 2;
  const hd = Math.abs(z1 - z0) / 2;
  loftRings(g, m, [
    [hw, hd, zc, y0],
    [hw, hd, zc, y0 + h],
  ], { n: opts.n || 22, px: opts.px === undefined ? 0.90 : opts.px, pz: opts.pz === undefined ? 0.90 : opts.pz });
  // The deck on top of it, a little proud all round: that lip is what makes a
  // deckhouse read as a deckhouse and not as a block.
  loftRings(g, M.deckSteel, [
    [hw + 0.12, hd + 0.12, zc, y0 + h],
    [hw + 0.12, hd + 0.12, zc, y0 + h + 0.14],
  ], { n: opts.n || 22, px: opts.px === undefined ? 0.90 : opts.px, pz: opts.pz === undefined ? 0.90 : opts.pz });
}

/** Portholes in a row along a house side, and a door at one end of it. */
function ports(g, x, y, z0, z1, n) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / n;
    for (const sgn of [-1, 1]) {
      cyl(g, M.cave, 0.17, 0.17, 0.08, sgn * x, y, z, 10).rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.05, sgn * x, y, z, 10).rotation.z = Math.PI / 2;
    }
  }
}

/**
 * The superstructure deck: the long, low house that runs from abreast Bruno to
 * abaft the after tower, and which everything else on her stands on.
 *
 * She is flush-decked, so this is the deck the secondary battery, the tubes,
 * the boats and the aircraft all live on, and getting its edge right is most
 * of getting her silhouette right.
 */
function superstructureDeck(g) {
  const Y = deckAt(0);
  // Two tiers, because that is what she has: the upper-deck house standing on
  // the weather deck, and the boat deck above it, narrower again. Neither
  // reaches her side. Three metres of open weather deck are left each side of
  // the lower one -- the walkway her torpedo tubes stand in and fire over --
  // and half a metre of the lower one is left outside the upper, which is the
  // ledge the brackets under her beam mountings stand on.
  const rings = [];
  for (const [z, hw] of SUPER_HALF) rings.push([z, hw]);
  const H = 4.4;
  const LOW = LOW_TIER;         // upper deck: the top of the lower tier

  // A tier of it: a box of four corners a station, wound so that its faces
  // look outwards.
  //
  // Which way round the triangles go is not a detail. A face wound the wrong
  // way is culled from outside and drawn from inside, so the near side of the
  // ship disappears and you see the far side's inner face through the gap --
  // which is exactly what she was doing: three metres of missing side from
  // abreast Bruno to abaft the after tower, the sea showing through it, and
  // the whole superstructure hanging over a hull that was not there.
  const tier = (yBot, yTop, halfAt) => {
    const pos = [];
    const idx = [];
    for (let i = 0; i < rings.length; i++) {
      const z = rings[i][0];
      const hw = halfAt(i);
      pos.push(-hw, yBot(z), z, hw, yBot(z), z, -hw, yTop(z), z, hw, yTop(z), z);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      // Port side, normals to port; starboard side, normals to starboard.
      idx.push(a, b, a + 2, a + 2, b, b + 2);
      idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    }
    // The two ends: the after one facing aft, the forward one facing forward.
    const e0 = 0;
    const e1 = (rings.length - 1) * 4;
    idx.push(e0, e0 + 2, e0 + 1, e0 + 1, e0 + 2, e0 + 3);
    idx.push(e1, e1 + 1, e1 + 2, e1 + 2, e1 + 1, e1 + 3);
    return { pos, idx };
  };

  // -- the lower tier ------------------------------------------------------
  //
  // Down to the top of the shell plating rather than to the deck a foot above
  // it, so there is no slot between the house and the hull, but stopping
  // WALKWAY short of the deck edge. Carried right out to her side it left her
  // tubes nowhere to stand: a cruiser's above-water tubes go on the open
  // weather deck at her side, and the deck has to be there for them.
  {
    const { pos, idx } = tier(
      (z) => deckAt(z) - 0.30, (z) => deckAt(z) + LOW, (i) => lowHalf(rings[i][0]));
    // The walkway on top of it, between her side and the boat deck.
    for (let i = 0; i < rings.length - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setIndex(idx);
    lg.computeVertexNormals();
    g.add(new THREE.Mesh(lg, M.steel));
  }
  // -- and the boat deck above it -------------------------------------------
  {
    const { pos, idx } = tier(
      (z) => deckAt(z) + LOW, (z) => deckAt(z) + H, (i) => rings[i][1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.steel));
  }
  // Its deck, which is where everything above stands.
  const dp = [];
  const di = [];
  for (let i = 0; i < rings.length; i++) {
    const [z, hw] = rings[i];
    const y0 = deckAt(z) + H;
    dp.push(-hw - 0.2, y0, z, hw + 0.2, y0, z);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = i * 2;
    di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setIndex(di);
  dg.computeVertexNormals();
  g.add(new THREE.Mesh(dg, M.deckSteel));
  // The scuttles down the house side, a few centimetres proud of the plating
  // they are cut in, or the rims stand inside it and there is nothing to see.
  for (let i = 0; i < 22; i++) {
    const z = -40.8 + (i * 80.8) / 21;
    ports(g, lowHalf(z) + 0.03, deckAt(z) + 1.6, z - 0.2, z + 0.2, 1);
  }
  // And what else is on eighty metres of house side, which had a row of
  // scuttles and nothing whatever besides: the butts between one plate and the
  // next, the watertight doors out on to the weather deck, the coaming under
  // them, and the ladders up from that deck to the ledge above.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      const z = -40 + (i * 79) / 14;
      box(g, M.steelDark, 0.07, LOW - 0.2, 0.1, sgn * (lowHalf(z) + 0.03),
        deckAt(z) + LOW / 2, z);
    }
    for (const z of [-33, -19, 3, 21, 35]) {
      const x = sgn * (lowHalf(z) + 0.03);
      box(g, M.steelDark, 0.1, 1.95, 0.9, x, deckAt(z) + 0.98, z);
      box(g, M.steel, 0.12, 0.12, 1.1, x, deckAt(z) + 2.02, z);
      box(g, M.steelDark, 0.26, 0.14, 1.0, x, deckAt(z) + 0.07, z);
      cyl(g, M.brass, 0.05, 0.05, 0.3, x, deckAt(z) + 0.95, z + 0.36, 6)
        .rotation.z = Math.PI / 2;
    }
    // The vertical ladders on to the ledge, stood off the plating on their own
    // brackets so a boot fits behind them.
    for (const z of [-26, -9, 14, 30]) {
      sideLadder(g, M.steelDark, {
        out: sgn, skin: lowHalf(z) + 0.04, z, y0: deckAt(z) + 0.2, y1: deckAt(z) + LOW,
        half: 0.26, stand: 0.18, rail: 0.7,
      });
    }
    // The rail along the ledge, which is a walkway and wants one.
    railRun(g, (t) => {
      const z = -40 + t * 79;
      return [sgn * (sHalf(z) + 0.35), deckAt(z) + LOW, z];
    }, 26, 0.85);
  }
  return Y + H;
}

/**
 * How far outboard the upper-deck house goes: the lower of the two tiers.
 *
 * Not to the deck edge. She keeps three and a half metres of open weather deck
 * each side -- the walkway her torpedo tubes stand in and fire over, and the
 * deck her boats and her ready-use lockers are handed down to. Never inside
 * the boat deck above it, which has to have something under it.
 */
export function lowHalf(z) { return Math.max(sHalf(z) + 0.55, halfDeck(z) - WALKWAY); }

/** How high the superstructure deck is at a station. */
/**
 * Her superstructure deck -- the boat deck -- which stands ten and a half
 * metres over the water amidships and is what the bridge, the funnel casing,
 * the crane and the after tower are all stepped on.
 */
function sdeck(z) { return deckAt(z) + 4.4; }

/** And how far outboard its edge is there. */
function sHalf(z) { return lerpTable(SUPER_HALF, z); }

/**
 * A sponson: a platform carried out from the superstructure deck to the deck
 * edge, with the brackets under it that hold it up.
 *
 * Every mounting on her beam stands on one. Without them the secondary
 * battery, the light battery and the tubes are all standing a metre or two
 * outboard of the deck they are supposed to be bolted to, in the air.
 */
function sponson(g, x, z, hw, hd) {
  const y = sdeck(z);
  const sgn = Math.sign(x) || 1;
  // In from the edge of the house far enough to get under the gun, and never
  // in past the house itself. Sprung from the deck edge and no further, a
  // mounting that stands inboard of it -- as the forward 2 cm singles do, on a
  // ship whose deck widens forward -- had its platform starting outboard of
  // its own feet and nothing at all underneath it.
  const inner = Math.max(sHalf(z) + 0.1, Math.min(lowHalf(z), Math.abs(x) - hw - 0.5));
  const outer = Math.abs(x) + hw;
  if (outer <= inner + 0.3) return;
  const mid = (inner + outer) / 2;
  const w = outer - inner;
  box(g, M.deckSteel, w, 0.18, hd * 2, sgn * mid, y + 0.08, z);
  // The brackets. A knee is a stanchion standing on the house below and a
  // raking stay from the outboard corner of the platform down to its foot --
  // two members that each touch something at both ends.
  //
  // They used to be single plates hung under the platform at a lean, which
  // put their inboard ends half a metre clear of the house they were supposed
  // to be bolted to: brackets holding up a platform and standing on nothing.
  const foot = deckAt(z) + LOW_TIER;
  for (const dz of [-hd * 0.8, hd * 0.8]) knee(g, sgn, inner, outer, foot, y - 0.01, z + dz);
  // And a low coaming round the outboard edge of it.
  box(g, M.steel, 0.16, 0.85, hd * 2, sgn * outer, y + 0.5, z);
}

/**
 * One bracket knee: a stanchion on the house side at `inner` carrying `top`,
 * and the raking stay from the platform's outboard edge down to its heel.
 */
function knee(g, sgn, inner, outer, foot, top, z) {
  const h = top - foot;
  if (h < 0.2) return;
  box(g, M.steel, 0.18, h, 0.16, sgn * (inner - 0.10), foot + h / 2, z);
  const run = outer - inner;
  const stay = box(g, M.steel, Math.hypot(run, h), 0.15, 0.14,
    sgn * (inner + run / 2), foot + h / 2, z);
  stay.rotation.z = Math.atan2(h, sgn * run);
}

/**
 * The tower bridge, level by level.
 *
 * A German cruiser's bridge is a tower, not a stack of boxes, and the Hipper's
 * is the tallest thing about her. From the superstructure deck up:
 *
 *   0  the bridge block, with the armoured conning tower inside it and the
 *      two 10.5 cm directors on their pedestals either side
 *   1  the admiral's bridge -- a bullnose front with a continuous window band,
 *      open wings each side carrying a pelorus and a signal lamp
 *   2  the navigating bridge, set back, with the chart house behind it
 *   3  the trunk, and the searchlight platform round it
 *   4  the foretop: the fire-control position, and on top of it the seven-metre
 *      stereoscopic rangefinder in a hood that trains, with the radar mattress
 *      on its face
 *
 * With the ladders between them, the voice pipes, the flag lockers and the
 * splinter mattresses that were lashed round every open bridge in the war.
 */
/**
 * Push a plan outline out by `d` metres, everywhere.
 *
 * Each point goes along its own outward normal -- worked out from its two
 * neighbours and turned away from the middle of the shape -- rather than by
 * scaling the whole outline about its centre, which on a long thin bridge deck
 * moves the ends four times as far as the sides.
 */
function grow(pts, d) {
  const N = pts.length;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= N; cz /= N;
  return pts.map(([x, z], i) => {
    const [px, pz] = pts[(i - 1 + N) % N];
    const [nx, nz] = pts[(i + 1) % N];
    let ex = nx - px;
    let ez = nz - pz;
    const L = Math.hypot(ex, ez) || 1;
    ex /= L; ez /= L;
    // Either normal to the edge; take the one facing away from the middle.
    let ox = ez;
    let oz = -ex;
    if (ox * (x - cx) + oz * (z - cz) < 0) { ox = -ox; oz = -oz; }
    return [x + ox * d, z + oz * d];
  });
}

/**
 * The windows round a bridge front.
 *
 * A German cruiser's bridge is a band of glass carried unbroken round the
 * bullnose and back down both sides, with a sill under it and the eyebrow over
 * it, and it is the single thing that says "bridge" at any range you can see a
 * ship at. Hers were drawn as flat boxes across the centreline: the plan of
 * the house is a rounded bullnose and a box laid across it is inside the
 * plating everywhere except amidships, so from ahead -- which is the only
 * angle anybody looks at a bridge from -- she had no windows at all.
 *
 * So it is lofted off the house's own outline, a few centimetres proud of it,
 * and it goes exactly where the plating goes.
 */
/**
 * A rail round a deck laid out on a house plan, from `t0` to `t1` of the way
 * round it -- so the open part of a bridge deck gets a rail and the part where
 * the house above stands on it does not.
 */
function planRail(g, pts, y, t0 = 0, t1 = 1, height = 1.0) {
  const N = pts.length;
  railRun(g, (t) => {
    const u = (t0 + (t1 - t0) * t) * (N - 1);
    const i = Math.min(N - 2, Math.floor(u));
    const f = u - i;
    const a = pts[i];
    const b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f];
  }, Math.max(8, Math.round((t1 - t0) * N)), height);
}

/**
 * The splinter mattresses lashed to a bridge rail: rolled hammocks and kapok
 * in canvas, which is what a bridge wing was armoured with in 1940 and what
 * gives an open bridge its shape at any distance.
 */
function mattresses(g, pts, y, t0, t1, n) {
  const N = pts.length;
  for (let k = 0; k < n; k++) {
    const u = (t0 + (t1 - t0) * ((k + 0.5) / n)) * (N - 1);
    const i = Math.min(N - 2, Math.floor(u));
    const f = u - i;
    const a = pts[i];
    const b = pts[i + 1];
    const x = a[0] + (b[0] - a[0]) * f;
    const z = a[1] + (b[1] - a[1]) * f;
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    box(g, M.canvas, 0.9, 0.72, 0.26, x, y + 0.44, z, ry);
  }
}

function windowBand(g, pts, y0, h) {
  loftShape(g, M.glass, [
    { pts: grow(pts, 0.05), y: y0 },
    { pts: grow(pts, 0.05), y: y0 + h },
  ], { cap: false });
  // The sill under it and the eyebrow over it, both standing further proud --
  // which is what puts a shadow on the glass and stops it reading as a stripe
  // of paint.
  for (const [yy, t] of [[y0 - 0.16, 0.18], [y0 + h, 0.2]]) {
    loftShape(g, M.steel, [
      { pts: grow(pts, 0.16), y: yy },
      { pts: grow(pts, 0.16), y: yy + t },
    ], { cap: false });
  }
}

function bridge(g) {
  const foot = sdeck(BRIDGE[0]);
  const zc = (BRIDGE[0] + BRIDGE[1]) / 2;
  const at = (pts) => pts.map(([x, z]) => [x, z + zc]);
  const tz = TOWER_Z;

  // Her decks, read off the elevation in ONI 204 -- which is the one drawing
  // of her that carries a scale in feet up the side of it. The boat deck is at
  // ten and a half metres, the admiral's bridge at thirteen, the navigating
  // bridge at fifteen and a half, the open bridge at eighteen, the searchlight
  // gallery at twenty-one, the foretop at twenty-four and a half, and the
  // rangefinder over it tops out at twenty-nine. Her masthead is at forty.
  //
  // Built as a smooth cone from the bridge roof to a cupola at thirty-three
  // she carried a lighthouse where her fighting top belongs: the tower was
  // taller than the drawing by four metres and thinner than it by two, and the
  // bridge under it was a pair of shelves.
  const D1 = 2.50;              // admiral's bridge
  const D2 = 5.00;              // navigating bridge
  const D3 = 7.50;              // the open bridge over it
  const D4 = 13.00;             // the searchlight gallery up the tower
  const D5 = 16.40;             // the foretop

  // The trunk's section at a height, so the seams, the door, the ladder cage
  // and the platform knees all land on the plating instead of near it.
  //
  // It is a tower, and a tower is tall and thin. Hers was eight and a half
  // metres across the base and nine deep, and it barely tapered: from abeam
  // that is wider than the five metres of it that show between the bridge roof
  // and the foretop, so the tallest thing about her read as a stump with a
  // fighting top balanced on it. Six and three quarters at the bridge roof
  // drawing in to five at the foretop is the proportion the drawing gives.
  const TRUNK = [
    [D1, 3.35, 3.85],
    [D3, 3.05, 3.50],
    [D4, 2.75, 3.15],
    [D5, 2.50, 2.85],
  ];
  const trunkAt = (d) => {
    if (d <= TRUNK[0][0]) return [TRUNK[0][1], TRUNK[0][2]];
    for (let i = 1; i < TRUNK.length; i++) {
      if (d > TRUNK[i][0]) continue;
      const [d0, w0, h0] = TRUNK[i - 1];
      const [d1, w1, h1] = TRUNK[i];
      const f = (d - d0) / (d1 - d0);
      return [w0 + (w1 - w0) * f, h0 + (h1 - h0) * f];
    }
    return [TRUNK[TRUNK.length - 1][1], TRUNK[TRUNK.length - 1][2]];
  };

  // -- 0. the bridge block, and the conning tower inside it ------------------
  //
  // A German cruiser's bridge is one mass standing on the boat deck and nearly
  // filling its breadth, with the tower rising out of its after half and the
  // bridge decks stepping forward and down from it. Everything else here is
  // hung on that.
  const p0 = at(planHouse({
    hw: 6.2, zBack: BRIDGE[0] - zc, zFront: BRIDGE[1] - zc, nose: 5.4, arc: 11,
  }));
  // Its own deck, laid out a hand's breadth proud of the plating and closed
  // underneath: forward of the bridge front the boat deck has narrowed inside
  // it, and an unfloored plate there is a hole you look up through.
  loftShape(g, M.deckSteel, [
    { pts: grow(p0, 0.18), y: foot - 0.18 },
    { pts: grow(p0, 0.18), y: foot },
  ], { cap: false, floor: true });
  loftShape(g, M.steel, [{ pts: p0, y: foot }, { pts: p0, y: foot + D1 }], { cap: false });
  loftShape(g, M.deckSteel, [
    { pts: grow(p0, 0.22), y: foot + D1 },
    { pts: grow(p0, 0.22), y: foot + D1 + 0.16 },
  ]);
  // The plating seams down her, the doors into the messdecks and the ship's
  // office, the scuttles, and the ladders up from the boat deck.
  for (const sgn of [-1, 1]) {
    for (const dz of [-8.5, -2.0, 4.5, 10.0]) {
      box(g, M.steelDark, 0.06, D1 - 0.1, 0.09, sgn * 6.23, foot + D1 / 2, zc + dz);
    }
    for (const dz of [-6.2, 3.4]) {
      box(g, M.steelDark, 0.1, 1.95, 0.9, sgn * 6.26, foot + 0.98, zc + dz);
      box(g, M.steel, 0.12, 0.12, 1.1, sgn * 6.28, foot + 2.02, zc + dz);
    }
    for (const dz of [-10, -4, 0.5, 6, 11]) {
      cyl(g, M.cave, 0.17, 0.17, 0.1, sgn * 6.26, foot + 1.75, zc + dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.06, sgn * 6.26, foot + 1.75, zc + dz, 10)
        .rotation.z = Math.PI / 2;
    }
    ladder(g, M.steelDark, sgn * 5.2, foot, foot + D1, zc - 12.4, zc - 10.2);
    // The 10.5 cm director on its pedestal: an SL-2 stabilised cupola with the
    // four-metre rangefinder through it, which is what lays her heavy flak.
    const dir = new THREE.Group();
    dir.position.set(sgn * 5.5, foot + D1 + 0.18, zc - 4.6);
    dir.userData.dynamic = true;
    g.add(dir);
    cyl(dir, M.steelDark, 0.85, 1.0, 1.0, 0, 0.5, 0, 14);
    loftRings(dir, M.gun, [[1.3, 1.2, 0, 1.0], [1.3, 1.2, 0, 2.3], [1.08, 1.0, 0, 2.7]],
      { n: 14, px: 0.74, pz: 0.72 });
    tubeX(dir, M.gun, 0.22, 4.1, 0, 1.9, 0.25, 10);
    for (const e of [-1, 1]) {
      box(dir, M.gun, 0.4, 0.44, 0.5, e * 1.9, 1.9, 0.25);
      box(dir, M.glass, 0.07, 0.2, 0.3, e * 2.11, 1.92, 0.25);
    }
  }
  // The armoured conning tower, standing through the block: a hundred and
  // fifty millimetres of plate, a vision slit all the way round it, and the
  // communication tube down to the transmitting station under it.
  loftRings(g, M.steelDark, [
    [2.9, 3.1, zc - 1.5, foot],
    [2.9, 3.1, zc - 1.5, foot + 2.3],
    [2.7, 2.9, zc - 1.5, foot + 3.5],
  ], { n: 16, px: 0.7, pz: 0.7 });
  loftRings(g, M.cave, [
    [2.93, 3.13, zc - 1.5, foot + 2.45],
    [2.93, 3.13, zc - 1.5, foot + 2.82],
  ], { n: 16, px: 0.7, pz: 0.7, cap: false });

  // -- 1. the admiral's bridge ----------------------------------------------
  //
  // Back into the tower, not stopping short of it: her bridge is one mass with
  // her tower, the decks step out forward of it and wrap round its foot, and
  // the tower rises through them.
  const p1 = at(planHouse({
    hw: 5.7, zBack: tz - zc - 3.4, zFront: 11.6, nose: 4.9, arc: 11,
  }));
  loftShape(g, M.steel, [
    { pts: p1, y: foot + D1 + 0.16 }, { pts: p1, y: foot + D2 },
  ], { cap: false });
  loftShape(g, M.deckSteel, [
    { pts: grow(p1, 0.22), y: foot + D2 },
    { pts: grow(p1, 0.22), y: foot + D2 + 0.16 },
  ]);
  windowBand(g, p1, foot + D1 + 0.95, 1.10);
  planRail(g, grow(p1, 0.22), foot + D2 + 0.18, 0.05, 0.64);
  mattresses(g, grow(p1, 0.30), foot + D2 + 0.18, 0.09, 0.60, 15);

  // Her wings: out to the side of the block on their own brackets, with the
  // pelorus, the signal projector, the flag bags and the splinter mattresses
  // lashed to the rail. This is where the officer of the watch stands.
  for (const sgn of [-1, 1]) {
    const wx = sgn * 7.0;
    box(g, M.deckSteel, 3.0, 0.16, 5.2, wx, foot + D2 + 0.08, zc + 5.6);
    for (const dz of [3.4, 7.8]) {
      const br = box(g, M.steel, 2.9, 0.14, 0.9, sgn * 6.5, foot + D2 - 0.55, zc + dz);
      br.rotation.z = sgn * 0.42;
    }
    railRing(g, wx, foot + D2 + 0.16, zc + 5.6, 1.5, 2.6);
    for (const mz of [3.6, 5.0, 6.4, 7.8]) {
      box(g, M.canvas, 0.24, 0.66, 1.15, sgn * 8.4, foot + D2 + 0.62, zc + mz);
    }
    // The pelorus on its stand, and the twenty-inch signal projector beside it.
    cyl(g, M.brass, 0.15, 0.17, 1.0, wx, foot + D2 + 0.66, zc + 4.2, 10);
    cyl(g, M.gun, 0.3, 0.3, 0.26, wx, foot + D2 + 1.25, zc + 4.2, 12);
    searchlight(g, wx + sgn * 0.3, foot + D2 + 0.16, zc + 7.2, sgn * 1.45);
    // The flag bags on the after end of the wing, and the voice pipes down.
    box(g, M.steelDark, 1.5, 0.8, 1.0, wx, foot + D2 + 0.56, zc + 3.0);
    for (let i = 0; i < 4; i++) {
      box(g, M.canvas, 0.3, 0.5, 0.2, wx - 0.55 + i * 0.36, foot + D2 + 0.95, zc + 3.0);
    }
    for (const vz of [-1.5, -0.9]) {
      cyl(g, M.brass, 0.07, 0.07, 2.2, sgn * 4.2, foot + D1 + 1.2, zc + vz, 8);
    }
    ladder(g, M.steelDark, sgn * 4.4, foot + D1 + 0.16, foot + D2, zc - 6.4, zc - 4.6);
  }

  // -- 2. the navigating bridge ----------------------------------------------
  //
  // The enclosed one: wheel, telegraphs, plot and chart table, with the window
  // band carried unbroken round the bullnose and back down both sides.
  const p2 = at(planHouse({
    hw: 4.9, zBack: tz - zc - 2.6, zFront: 10.2, nose: 4.3, arc: 11,
  }));
  loftShape(g, M.steel, [
    { pts: p2, y: foot + D2 + 0.16 }, { pts: p2, y: foot + D3 },
  ], { cap: false });
  loftShape(g, M.deckSteel, [
    { pts: grow(p2, 0.22), y: foot + D3 },
    { pts: grow(p2, 0.22), y: foot + D3 + 0.16 },
  ]);
  windowBand(g, p2, foot + D2 + 0.95, 1.05);
  for (const sgn of [-1, 1]) {
    // The wing doors out of the wheelhouse, and the ladder up to the open
    // bridge over it.
    box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 4.94, foot + D2 + 1.1, zc - 3.4);
    ladder(g, M.steelDark, sgn * 3.6, foot + D2 + 0.16, foot + D3, zc - 5.6, zc - 4.0);
  }

  // -- 3. the open bridge ----------------------------------------------------
  //
  // The deck a captain fights her from, and on a German ship it is open to the
  // weather with a plated splinter bulwark round it rather than a rail: the
  // pelorus on the centreline, the four-metre rangefinder across the front of
  // it, and the two wings running out toward her side.
  const p3 = at(planHouse({
    hw: 4.2, zBack: tz - zc - 1.8, zFront: 8.8, nose: 3.8, arc: 11,
  }));
  loftShape(g, M.steel, [
    { pts: p3, y: foot + D3 + 0.16 }, { pts: p3, y: foot + D3 + 1.15 },
  ], { cap: false });
  loftShape(g, M.steel, [
    { pts: grow(p3, 0.10), y: foot + D3 + 1.15 },
    { pts: grow(p3, 0.10), y: foot + D3 + 1.28 },
  ], { cap: false });
  mattresses(g, grow(p3, 0.20), foot + D3 + 0.16, 0.10, 0.60, 13);
  cyl(g, M.brass, 0.16, 0.18, 1.05, 0, foot + D3 + 0.7, zc + 5.0, 10);
  cyl(g, M.gun, 0.32, 0.32, 0.28, 0, foot + D3 + 1.32, zc + 5.0, 12);
  // The four-metre rangefinder on the bridge front, on its own pedestal.
  {
    const rf = new THREE.Group();
    rf.position.set(0, foot + D3 + 0.16, zc + 7.0);
    rf.userData.dynamic = true;
    g.add(rf);
    cyl(rf, M.steelDark, 0.4, 0.5, 0.9, 0, 0.45, 0, 12);
    loftRings(rf, M.gun, [[0.8, 0.7, 0, 0.9], [0.8, 0.7, 0, 1.7], [0.66, 0.6, 0, 2.0]],
      { n: 12, px: 0.72, pz: 0.7 });
    tubeX(rf, M.gun, 0.17, 4.2, 0, 1.4, 0.1, 10);
    for (const e of [-1, 1]) {
      box(rf, M.gun, 0.34, 0.4, 0.46, e * 1.95, 1.4, 0.1);
      box(rf, M.glass, 0.06, 0.2, 0.28, e * 2.14, 1.4, 0.1);
    }
  }
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 2.6, 0.15, 3.4, sgn * 5.5, foot + D3 + 0.08, zc + 2.6);
    const br = box(g, M.steel, 2.6, 0.13, 1.0, sgn * 5.1, foot + D3 - 0.55, zc + 2.6);
    br.rotation.z = sgn * 0.45;
    railRing(g, sgn * 5.5, foot + D3 + 0.16, zc + 2.6, 1.3, 1.7);
    cyl(g, M.steel, 0.22, 0.26, 0.9, sgn * 5.9, foot + D3 + 0.6, zc + 3.0, 10);
    cyl(g, M.glass, 0.3, 0.3, 0.3, sgn * 5.9, foot + D3 + 1.2, zc + 3.0, 12);
    // The navigation lights, port and starboard, in their screened boxes.
    box(g, M.steelDark, 0.4, 0.7, 0.55, sgn * 6.1, foot + D3 + 0.5, zc + 1.6);
  }

  // -- 4. the tower ----------------------------------------------------------
  //
  // Stepped on its own station over the conning tower, and squared rather than
  // turned: a German tower is a rounded-corner box with the bridge decks
  // wrapped round its foot, which is why the foretop stands nearly amidships
  // of the forward superstructure and not out over the bridge front.
  loftRings(g, M.steel, TRUNK.map(([d, hw, hd]) => [hw, hd, tz, foot + d]),
    { n: 24, px: 0.44, pz: 0.44, cap: false });
  // A tower this slim is a stack of plates, and what says so is the horizontal
  // butt strap at every strake and the vertical seam up the corners of it.
  for (const d of [D1 + 2.1, D3 + 1.3, D4 + 1.5, D5 - 0.9]) {
    const [hw, hd] = trunkAt(d);
    loftRings(g, M.steelDark, [
      [hw + 0.05, hd + 0.05, tz, foot + d - 0.06],
      [hw + 0.05, hd + 0.05, tz, foot + d + 0.06],
    ], { n: 24, px: 0.44, pz: 0.44, cap: false });
  }
  for (const sgn of [-1, 1]) {
    for (const dd of [-1.9, 1.9]) {
      for (let i = 0; i < 9; i++) {
        const d = D1 + 0.4 + (i * (D5 - D1 - 0.8)) / 8;
        const [hw, hd] = trunkAt(d);
        box(g, M.steelDark, 0.08, (D5 - D1 - 0.8) / 8 + 0.1, 0.1,
          sgn * (hw + 0.02), foot + d, tz + dd);
      }
    }
  }
  // The scuttles in it, lighting the plot and the wireless office inside.
  for (const sgn of [-1, 1]) {
    for (const d of [D3 + 2.4, D4 + 1.0, D4 + 3.1]) {
      const [hw] = trunkAt(d);
      for (const dd of [-1.0, 1.0]) {
        cyl(g, M.cave, 0.19, 0.19, 0.12, sgn * (hw - 0.02), foot + d, tz + dd, 10)
          .rotation.z = Math.PI / 2;
        cyl(g, M.steel, 0.25, 0.25, 0.07, sgn * (hw - 0.04), foot + d, tz + dd, 10)
          .rotation.z = Math.PI / 2;
      }
    }
  }
  // The door into the tower off the open bridge, and the ladder up her after
  // face in its cage: both on the plating, which is where the plating now is.
  {
    const [, hdDoor] = trunkAt(D3 + 1.0);
    box(g, M.steelDark, 1.05, 1.95, 0.1, 0, foot + D3 + 1.0, tz - hdDoor + 0.06);
    const [, hdLad] = trunkAt((D3 + D5) / 2);
    ladder(g, M.steelDark, 0, foot + D3 + 0.16, foot + D5,
      tz - hdLad - 0.12, tz - hdLad - 0.12);
    for (let i = 0; i < 8; i++) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 10), M.steelDark);
      hoop.position.set(0, foot + D3 + 1.4 + i * 0.95, tz - hdLad - 0.45);
      hoop.rotation.x = Math.PI / 2;
      g.add(hoop);
    }
  }
  // The signal deck, half way up her: a narrow gallery right round the trunk
  // with the flag lockers on it, which is what fills the height between the
  // bridge roof and the searchlight gallery instead of bare plating.
  {
    const dsig = D3 + 2.4;
    const [hw, hd] = trunkAt(dsig);
    const ring = [[hw + 1.25, hd + 1.25, tz, foot + dsig],
      [hw + 1.25, hd + 1.25, tz, foot + dsig + 0.16]];
    // Capped as well as floored. A platform lofted with its top left open is a
    // ring of plating with nothing between: a ray dropped on it goes straight
    // through and lands four metres lower, so from above the gallery is not
    // there at all and the deck under it is.
    loftRings(g, M.deckSteel, ring, { n: 24, px: 0.44, pz: 0.44, floor: true });
    for (const sgn of [-1, 1]) {
      for (const dd of [-2.0, 0, 2.0]) {
        const kn = box(g, M.steel, 1.5, 0.13, 0.5, sgn * (hw + 0.55),
          foot + dsig - 0.42, tz + dd);
        kn.rotation.z = sgn * 0.5;
      }
      // The flag lockers against the trunk, and the halyard cleats over them.
      box(g, M.steelDark, 0.55, 0.75, 1.9, sgn * (hw + 0.55), foot + dsig + 0.5, tz + 0.6);
      for (let i = 0; i < 4; i++) {
        box(g, M.canvas, 0.4, 0.5, 0.32, sgn * (hw + 0.6),
          foot + dsig + 0.62, tz - 0.15 + i * 0.5);
      }
    }
    // Its rail, and a twenty-inch signal projector on each quarter of it --
    // her three hundred-and-fifties are up on the gallery above and this deck
    // is for talking to the next ship in the line, not for finding her.
    railRing(g, 0, foot + dsig + 0.16, tz, hw + 1.25, hd + 1.25);
    for (const sgn of [-1, 1]) {
      cyl(g, M.steel, 0.15, 0.18, 0.85, sgn * (hw + 0.85), foot + dsig + 0.58, tz - 2.3, 10);
      cyl(g, M.gun, 0.32, 0.32, 0.34, sgn * (hw + 0.85), foot + dsig + 1.18, tz - 2.3, 12)
        .rotation.z = Math.PI / 2;
      cyl(g, M.glass, 0.28, 0.28, 0.06, sgn * (hw + 1.02), foot + dsig + 1.18, tz - 2.3, 12)
        .rotation.z = Math.PI / 2;
    }
  }

  // The searchlight gallery: a wide platform each side out of the face of the
  // tower at twenty-one metres, which is where her hundred-and-fifties lived
  // and the widest thing on the tower between the bridge roof and the foretop.
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 4.2, 0.16, 4.0, sgn * 3.9, foot + D4, tz + 0.4);
    railRing(g, sgn * 3.9, foot + D4 + 0.08, tz + 0.4, 2.1, 2.1);
    searchlight(g, sgn * 4.8, foot + D4 + 0.16, tz + 0.4, sgn * 1.35);
    for (const dz of [-1.4, 1.4]) {
      const br = box(g, M.steel, 2.8, 0.13, 1.0, sgn * 3.8, foot + D4 - 0.62, tz + dz);
      br.rotation.z = sgn * 0.46;
    }
    // The ready-use lockers for the light's gear, against the tower side.
    locker(g, sgn * 2.9, foot + D4 + 0.16, tz + 2.2, 0.7, 0.6, 1.0);
  }

  // -- 5. the foretop --------------------------------------------------------
  //
  // The fire-control position, and on top of it the seven-metre stereoscopic
  // rangefinder in a hood that trains -- which is the reason the tower is that
  // tall and the one thing on her that is worth building a tower for.
  const ftp = at(planHouse({ hw: 5.1, zBack: tz - zc - 4.6, zFront: tz - zc + 4.6, nose: 3.0, tail: 3.0, arc: 8 }));
  loftShape(g, M.deckSteel, [
    { pts: ftp, y: foot + D5 },
    { pts: ftp, y: foot + D5 + 0.18 },
  ], { cap: true, floor: true });
  planRail(g, grow(ftp, 0.1), foot + D5 + 0.18, 0, 1, 1.0);
  for (const sgn of [-1, 1]) {
    for (const dz of [-2.4, 2.4]) {
      const br = box(g, M.steel, 2.9, 0.13, 0.9, sgn * 3.7, foot + D5 - 0.55, tz + dz);
      br.rotation.z = sgn * 0.5;
    }
  }
  loftRings(g, M.steel, [
    [3.70, 3.35, tz, foot + D5 + 0.18],
    [3.70, 3.35, tz, foot + D5 + 2.55],
    [3.42, 3.12, tz, foot + D5 + 2.85],
  ], { n: 20, px: 0.50, pz: 0.50 });
  // Its vision slits, fore and aft, with the hoods over them.
  for (const [zz, w] of [[3.32, 6.0], [-3.32, 5.0]]) {
    box(g, M.glass, w, 0.62, 0.14, 0, foot + D5 + 1.55, tz + zz);
    box(g, M.steel, w + 0.2, 0.1, 0.24, 0, foot + D5 + 2.0, tz + zz);
  }
  for (const sgn of [-1, 1]) {
    box(g, M.glass, 0.14, 0.6, 3.8, sgn * 3.67, foot + D5 + 1.55, tz);
    box(g, M.steel, 0.22, 0.1, 4.0, sgn * 3.71, foot + D5 + 2.0, tz);
  }

  // The hood: a squat drum with the seven-metre base straight through it, the
  // end hoods standing clear either side, and the sighting cupolas on top.
  const top = new THREE.Group();
  top.position.set(0, foot + D5 + 2.9, tz);
  top.userData.dynamic = true;
  g.add(top);
  loftRings(top, M.gun, [
    [2.55, 2.20, 0, 0], [2.55, 2.20, 0, 1.55], [2.15, 1.90, 0, 2.05],
  ], { n: 18, px: 0.68, pz: 0.66 });
  tubeX(top, M.gun, 0.36, 7.3, 0, 1.05, 0.35, 12);
  for (const sgn of [-1, 1]) {
    box(top, M.gun, 0.78, 0.82, 1.0, sgn * 3.4, 1.05, 0.35);
    box(top, M.gunDark, 0.16, 0.42, 0.58, sgn * 3.79, 1.07, 0.35);
    box(top, M.glass, 0.06, 0.32, 0.44, sgn * 3.87, 1.07, 0.35);
    cyl(top, M.gun, 0.27, 0.31, 0.36, sgn * 1.0, 2.15, 0.15, 10);
    box(top, M.glass, 0.2, 0.12, 0.1, sgn * 1.12, 2.2, 0.42);
  }
  // Her radar: the FuMO 27 mattress on the face of the hood, and it trains
  // with it -- an aerial of that size held out on its own in front of a
  // fire-control top is a billboard, and hers was part of the structure.
  const frame = new THREE.Group();
  frame.position.set(0, 1.9, 1.85);
  top.add(frame);
  // The frame itself, then the reflector screen inside it.
  for (const sgn of [-1, 1]) box(frame, M.gun, 0.14, 2.2, 0.14, sgn * 3.0, 0, 0);
  for (const sgn of [-1, 1]) box(frame, M.gun, 6.1, 0.14, 0.14, 0, sgn * 1.03, 0);
  box(frame, M.gunDark, 5.9, 1.95, 0.07, 0, 0, -0.02);
  // The dipoles across it, which are what make it read as an aerial rather
  // than as a board: four rows of eight, on their standoffs.
  for (let i = -3.5; i <= 3.5; i++) {
    for (const yy of [-0.72, -0.24, 0.24, 0.72]) {
      box(frame, M.steel, 0.05, 0.05, 0.34, i * 0.76, yy, 0.19);
      box(frame, M.steel, 0.30, 0.04, 0.04, i * 0.76, yy, 0.34);
    }
  }

  // -- 6. the foremast -------------------------------------------------------
  //
  // A pole stepped on the bridge block abaft the tower and carried up past the
  // foretop to a truck at forty metres, with two yards on it and the wireless
  // aerials strung aft from them.
  const mz = MAST_Z;
  cyl(g, M.steel, 0.30, 0.52, 18.4, 0, foot + D1 + 9.2, mz, 10);
  cyl(g, M.steel, 0.14, 0.26, 11.6, 0, foot + D1 + 21.7, mz, 8);
  for (const [yy, half] of [[D1 + 14.2, 5.2], [D1 + 20.4, 3.0]]) {
    tubeX(g, M.steel, 0.11, half * 2, 0, foot + yy, mz, 8);
    for (const sgn of [-1, 1]) {
      box(g, M.wire, 0.04, 1.4, 0.04, sgn * half * 0.9, foot + yy - 0.7, mz);
      // The yardarm lift, from the yardarm up to the mast above it.
      const lift = box(g, M.wire, 0.04, 2.6, 0.04, sgn * half * 0.55, foot + yy + 1.3, mz);
      lift.rotation.z = sgn * 0.55;
    }
  }
  // The shrouds that stay a pole this tall, set up from the hounds down on to
  // the foretop below them.
  for (const sgn of [-1, 1]) {
    const shroud = box(g, M.wire, 0.05, 6.4, 0.05, sgn * 1.6, foot + D5 + 1.6, mz + 0.4);
    shroud.rotation.z = sgn * 0.26;
    shroud.rotation.x = -0.12;
  }
  return foot;
}

/** A ring of stanchions and a rail, which is what every platform has round it. */
function railRing(g, x, y, z, hw, hd) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push(x + Math.sin(a) * hw, y + 1.0, z + Math.cos(a) * hd);
  }
  const p2 = [];
  for (let i = 0; i < N; i++) {
    p2.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2],
      pts[(i + 1) * 3], pts[(i + 1) * 3 + 1], pts[(i + 1) * 3 + 2]);
    p2.push(pts[i * 3], y, pts[i * 3 + 2], pts[i * 3], y + 1.0, pts[i * 3 + 2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
  g.add(new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color: 0xb9c1c8, transparent: true, opacity: 0.5 })));
}

/**
 * A run of guard rail: stanchions with three wires rove through them.
 *
 * `at(t)` gives a point on the run for t in 0..1, so the same call does a
 * straight length of deck edge or a curve round a sponson. Drawn as lines
 * rather than as geometry -- a rail is wire and inch-and-a-half stanchions,
 * and modelled as tubes it costs more triangles than the turret it stands
 * round and reads as a fence.
 */
function railRun(g, at, n = 20, height = 1.05) {
  const seg = [];
  const wires = [0.36, 0.68, 1.0];
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const p = at(i / n);
    if (prev) {
      for (const w of wires) {
        seg.push(prev[0], prev[1] + height * w, prev[2], p[0], p[1] + height * w, p[2]);
      }
    }
    // A stanchion at every other station: they stand about six feet apart and
    // the run is drawn finer than that so a curve looks like a curve.
    if (i % 2 === 0) seg.push(p[0], p[1], p[2], p[0], p[1] + height, p[2]);
    prev = p;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  g.add(new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color: 0xb9c1c8, transparent: true, opacity: 0.5 })));
}

/**
 * A ready-use locker: the deck box every gun on a ship has beside it, with
 * rounds or line or hose in it depending on whose it is.
 */
function locker(g, x, y, z, w, h, d, ry = 0) {
  const b = new THREE.Group();
  b.position.set(x, y + h / 2, z);
  b.rotation.y = ry;
  g.add(b);
  box(b, M.steelDark, w, h, d, 0, 0, 0);
  // The lid, standing a little proud, and the two clips that hold it down.
  box(b, M.steel, w + 0.06, 0.07, d + 0.06, 0, h / 2, 0);
  for (const sgn of [-1, 1]) box(b, M.gunDark, 0.07, 0.14, 0.05, sgn * w * 0.3, h / 2 - 0.1, d / 2);
}

/** A reel of wire, hose or cable on its stand, lying against a house side. */
function reel(g, x, y, z, r, ry = 0) {
  const d = new THREE.Group();
  d.position.set(x, y + r, z);
  d.rotation.y = ry;
  g.add(d);
  for (const sgn of [-1, 1]) {
    cyl(d, M.steelDark, r, r, 0.06, sgn * r * 0.5, 0, 0, 14).rotation.z = Math.PI / 2;
  }
  cyl(d, M.canvas, r * 0.82, r * 0.82, r * 0.9, 0, 0, 0, 14).rotation.z = Math.PI / 2;
  cyl(d, M.gunDark, 0.05, 0.05, r * 1.3, 0, 0, 0, 8).rotation.z = Math.PI / 2;
  for (const sgn of [-1, 1]) {
    const leg = box(d, M.steelDark, 0.07, r * 1.1, 0.07, sgn * r * 0.62, -r * 0.55, 0);
    leg.rotation.z = sgn * 0.18;
  }
}

/** A signal or fighting searchlight on its pedestal, with the glass in it. */
function searchlight(g, x, y, z, ry) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  cyl(s, M.steelDark, 0.14, 0.18, 0.8, 0, 0.4, 0, 8);
  const drum = cyl(s, M.steel, 0.62, 0.62, 0.8, 0, 1.15, 0, 14);
  drum.rotation.x = Math.PI / 2;
  cyl(s, M.glass, 0.56, 0.56, 0.1, 0, 1.15, 0.42, 14).rotation.x = Math.PI / 2;
  cyl(s, M.steel, 0.66, 0.66, 0.12, 0, 1.15, -0.42, 14).rotation.x = Math.PI / 2;
}

// ------------------------------------------- funnel, hangar and her Arados --

/**
 * Her boiler rooms' uptakes, the casing over them, and the funnel they feed.
 *
 * Twelve high-pressure boilers in three rooms, and every one of them has to
 * get its smoke to the same place, so the whole of her midships is a casing
 * with the uptakes inside it. What is on the outside of that casing is what
 * you actually see of a boiler room: the fan intakes standing up out of it,
 * the mushroom heads, the big cowls each side drawing air down to the fire
 * rooms, the ash hoists and the fan house.
 *
 * And on top, the funnel: raked aft, oval in section, with the flat cap fitted
 * in 1940 on four struts to throw her own smoke clear of the foretop. Prinz
 * Eugen never had one and Hipper always did after that refit, so it is the one
 * detail that tells them apart at any range you can see a ship at.
 */
function funnel(g) {
  const foot = sdeck(FUNNEL_Z);
  const Z0 = FUNNEL_Z - 8;
  const Z1 = FUNNEL_Z + 8;
  // -- the casing over the fire rooms ---------------------------------------
  house(g, M.steel, 5.6, Z0, Z1, foot, 2.0);
  const base = foot + 2.0;
  // Its doors, and the ash hoist trunks at the after corners.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 5.62, foot + 0.95, FUNNEL_Z - 4.5);
    box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 5.62, foot + 0.95, FUNNEL_Z + 4.5);
    cyl(g, M.steel, 0.42, 0.42, 2.0, sgn * 4.6, foot + 1.0, Z0 + 0.9, 10);
    cyl(g, M.steelDark, 0.5, 0.5, 0.3, sgn * 4.6, foot + 2.1, Z0 + 0.9, 10);
    ladder(g, M.steelDark, sgn * 5.0, foot, base, Z0 + 0.4, Z0 + 1.9);
    // The big boiler-room air cowls: what a fire room breathes through.
    for (const cz of [FUNNEL_Z - 6.2, FUNNEL_Z + 6.2]) {
      const v = new THREE.Group();
      v.position.set(sgn * 5.0, base, cz);
      g.add(v);
      cyl(v, M.steel, 0.55, 0.62, 3.0, 0, 1.5, 0, 14);
      const bell = cyl(v, M.steel, 0.95, 0.58, 1.2, 0, 3.4, 0.35, 16);
      bell.rotation.x = -1.05;
      cyl(v, M.cave, 0.78, 0.78, 0.1, 0, 3.72, 0.9, 16).rotation.x = -1.05;
      // The stay that holds a three-metre cowl up in a seaway.
      const stay = box(v, M.steelDark, 0.07, 2.4, 0.07, sgn * 0.5, 1.6, -0.5);
      stay.rotation.z = -sgn * 0.2;
    }
  }
  // The fan house on the casing top, and the mushroom heads round it.
  house(g, M.steel, 3.2, FUNNEL_Z - 6.5, FUNNEL_Z - 2.5, base, 1.9, { n: 16 });
  for (const sgn of [-1, 1]) {
    for (const mz of [FUNNEL_Z + 5.6, FUNNEL_Z + 2.2]) {
      cyl(g, M.steel, 0.3, 0.34, 0.9, sgn * 3.7, base + 0.45, mz, 12);
      cyl(g, M.steelDark, 0.62, 0.5, 0.32, sgn * 3.7, base + 1.05, mz, 14);
    }
  }
  // Gratings over the uptakes: the one part of a boiler room you can see down
  // into from the deck above it.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      box(g, M.gunDark, 0.9, 0.06, 0.16, sgn * 2.2, base + 0.09, FUNNEL_Z - 1.4 + i * 0.7);
    }
  }

  // -- the funnel -----------------------------------------------------------
  const f = new THREE.Group();
  f.position.set(0, base, FUNNEL_Z);
  g.add(f);
  // Ten metres of trunk, oval in section, which puts the rim at twenty-four
  // and a half metres over the water -- three below the searchlight gallery on
  // the tower and five below the foretop, which is the whole reason the cap
  // was fitted.
  //
  // Oval, and a flattened one: a Hipper's funnel is a good quarter as deep
  // again fore and aft as it is broad, and the sides of it are near enough
  // flat. Drawn as a rounded superellipse a fifth as flat it read as a
  // gasholder.
  //
  // And upright. Both sides of the trunk are plumb from the casing to the
  // mouth on her own profile, and everything that is angled about her funnel
  // is in the mouth and the cap on top of it -- so the rings round her stand
  // over one another rather than walking aft up the height of her.
  loftRings(f, M.steelDark, [
    [4.14, 5.28, 0, -0.40], [4.02, 5.14, 0, 0.00],
  ], { n: 26, px: 0.70, pz: 0.80, cap: false });
  loftRings(f, M.steel, [
    [3.98, 5.08, 0, 0.0],
    [3.88, 4.95, 0, 3.5],
    [3.78, 4.83, 0, 7.0],
    [3.68, 4.72, 0, 10.0],
  ], { n: 26, px: 0.70, pz: 0.80, cap: false });

  // -- the mouth and the cap ------------------------------------------------
  //
  // Hers is not a hat standing over the funnel on four legs with the sky
  // showing under it. The Kappe fitted in 1940 is part of the funnel: the
  // trunk is carried up on a rake, higher forward than aft, and the cap is
  // built on to the top of it as a band round the mouth -- so what she throws
  // her smoke out of is a raked oval opening, and from abeam the funnel and
  // its cap are one piece of plating from the casing to the rim.
  //
  // What it has to be is a band you can see. Built flush with the trunk and a
  // twentieth proud of it she read from abeam as a plain pipe cut off on a
  // slant: the cap is nearly a foot of overhang all round and it puts a
  // shadow under itself, which is the whole of why you can tell her from
  // Prinz Eugen at eight miles.
  const RAKE = 0.245;
  const RTAN = Math.tan(RAKE);
  // The trunk carried up on the rake to the mouth.
  rakedBand(f, M.steel, [
    [3.68, 4.72, 10.00, 0],
    [3.62, 4.64, 12.10, RTAN],
  ]);
  // The cap: a band standing proud all round the top of it, its own lower edge
  // cut on the same rake. This is the piece you see from a mile off.
  rakedBand(f, M.steel, [
    [3.74, 4.79, 10.80, RTAN],
    [4.24, 5.44, 11.25, RTAN],
    [4.24, 5.44, 12.10, RTAN],
  ]);
  // The rim rolling over into the mouth, and the inside of the funnel under
  // it: sooty plate the whole way down to the tops of the uptakes.
  //
  // It has to be there as a surface of its own. The trunk is a single sheet
  // whose faces look outward, so a ray that comes in over the after rim and
  // down the mouth meets the forward wall from the wrong side and is not
  // stopped by it: from astern and a little above, you could see in through
  // the top of her funnel and out through the front of it.
  rakedBand(f, M.steel, [
    [4.24, 5.44, 12.10, RTAN],
    [3.52, 4.50, 12.00, RTAN],
  ]);
  rakedBand(f, M.gunDark, [
    [3.52, 4.50, 12.00, RTAN],
    [3.66, 4.68, 6.00, RTAN * 0.5],
    [3.80, 4.86, 0.60, 0],
  ]);
  rakedBand(f, M.cave, [
    [3.80, 4.86, 0.60, 0],
    [3.70, 4.74, 0.20, 0],
  ], { cap: true });
  // The uptake trunks standing inside the mouth: three fire rooms, three
  // trunks, and you can see the tops of them down the funnel.
  for (const uz of [-1.9, 0, 1.9]) {
    loftRings(f, M.gunDark, [
      [1.05, 0.78, uz, 9.0], [1.05, 0.78, uz, 11.0 + RTAN * uz],
    ], { n: 12, px: 0.8, pz: 0.8 });
  }
  // The bands round her, which is how a funnel is stiffened.
  for (const [by, k] of [[1.6, 1.000], [4.8, 0.985], [8.0, 0.971]]) {
    loftRings(f, M.steelDark, [
      [4.00 * k, 5.10 * k, 0, by - 0.12],
      [4.10 * k, 5.24 * k, 0, by],
      [4.00 * k, 5.10 * k, 0, by + 0.12],
    ], { n: 26, px: 0.70, pz: 0.80, cap: false });
  }
  // The steam pipes up her after face, the siren, and the ladder in its cage.
  for (const sgn of [-1, 1]) {
    cyl(f, M.steelDark, 0.16, 0.16, 11.0, sgn * 1.7, 5.6, -4.9, 8);
    cyl(f, M.steelDark, 0.21, 0.21, 0.4, sgn * 1.7, 11.3, -4.9, 8);
  }
  cyl(f, M.brass, 0.21, 0.21, 0.75, 0, 8.6, -4.95, 10);
  box(f, M.steelDark, 0.95, 0.5, 0.5, 0, 8.1, -5.05);
  ladder(f, M.steelDark, 0.95, 0.6, 10.4, -4.4, -4.4);
  for (let i = 0; i < 8; i++) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 5, 10), M.steelDark);
    hoop.position.set(0.95, 1.4 + i * 1.15, -4.7);
    hoop.rotation.x = Math.PI / 2;
    f.add(hoop);
  }
  // The grab rails round her, the rungs everybody paints over.
  for (let i = 0; i < 7; i++) {
    box(f, M.steelDark, 0.5, 0.05, 0.05, 3.55, 1.3 + i * 1.2, 0);
  }


  // The searchlight platform round her, which is where the big lights live.
  box(g, M.deckSteel, 13.0, 0.16, 4.4, 0, base + 5.0, FUNNEL_Z + 1);
  for (const sgn of [-1, 1]) {
    searchlight(g, sgn * 5.6, base + 5.1, FUNNEL_Z + 1, sgn * 1.5);
    railRing(g, sgn * 5.6, base + 5.05, FUNNEL_Z + 1, 1.6, 1.9);
    // Carried out from the funnel on brackets, and reached by a ladder.
    const br = box(g, M.steel, 3.0, 0.12, 1.4, sgn * 4.6, base + 4.3, FUNNEL_Z + 1);
    br.rotation.z = sgn * 0.42;
    ladder(g, M.steelDark, sgn * 4.4, base, base + 5.0, FUNNEL_Z + 3.4, FUNNEL_Z + 2.2);
  }
  // The boat deck each side of the casing, and what is on it.
  //
  // She carried her boats here, abreast the funnel where the crane could reach
  // them: a motor pinnace and a cutter a side, on chocks, under radial davits.
  // What was drawn was two four-metre dinghies -- a boat that size is a ship's
  // skiff, and a heavy cruiser stows something you could put forty men in.
  // The boats sit down on the deck, on chocks a hand's breadth high: stowed a
  // foot clear of it they were resting on nothing and holding nothing down.
  const bDeck = sdeck(BOAT_Z) + 0.04;
  for (const sgn of [-1, 1]) {
    // Out where a boat will actually fit. The casing is seven and a half
    // metres of half-breadth at this station and the boats were stowed at six
    // and a half, so they were buried in the deckhouse up to their gunwales.
    //
    // The deck they belong on is a shelf off the side of the superstructure,
    // bracketed the same way her gun sponsons are -- carried on four thin
    // stanchions it was eighteen metres of plate standing on nothing.
    //
    // And it is abaft the forward pair of 10.5 cm mountings and forward of the
    // middle pair, which is the one stretch of her beam that is free: a boat
    // deck laid over a gun's sponson takes its sky away.
    for (const [zz, hd] of [[BOAT_Z + 4.4, 4.0], [BOAT_Z - 4.6, 3.6]]) {
      sponson(g, sgn * 9.0, zz, 1.6, hd);
    }
    // The rail along the outboard edge of it.
    railRun(g, (t) => [sgn * 10.55, bDeck, BOAT_Z - 8.9 + t * 17.8], 12, 0.95);
    for (const [bz, len, motor] of [[BOAT_Z + 4.4, 9.2, true], [BOAT_Z - 4.6, 7.6, false]]) {
      boat(g, sgn * 9.0, bDeck, bz, len, motor);
      // The davits that swing her out: radial davits, which are a curved arm
      // on a socket with the falls hanging from the head of it.
      for (const dz of [bz - len * 0.34, bz + len * 0.34]) {
        const dav = new THREE.Group();
        dav.position.set(sgn * 10.3, bDeck, dz);
        dav.rotation.z = sgn * -0.30;
        g.add(dav);
        cyl(dav, M.steel, 0.13, 0.17, 3.9, 0, 1.95, 0, 8);
        // The head of it, curving out over the boat, and the block on it.
        const head = cyl(dav, M.steel, 0.11, 0.13, 1.5, 0, 3.85, -0.55, 8);
        head.rotation.x = 0.75;
        box(dav, M.gunDark, 0.16, 0.3, 0.16, 0, 4.35, -1.15);
        // And the fall, hanging down to the boat under it.
        box(dav, M.wire, 0.04, 2.3, 0.04, 0, 3.15, -1.2);
      }
    }
  }
}

/**
 * A band of oval plating whose rings are cut on a rake.
 *
 * `loftRings` knows level rings only, so anything built out of it can be cut
 * off square and no other way. Her funnel is not cut off square: the mouth is
 * cut on the same rake the cap is built at, higher forward than aft, and that
 * is the whole reason the cap is part of the funnel instead of a hat balanced
 * over it on legs.
 *
 * Rings are `[halfWidth, halfDepth, yOnTheCentreline, risePerMetreForward]`.
 */
function rakedBand(g, m, rings, opts = {}) {
  const N = opts.n || 26;
  const px = opts.px === undefined ? 0.70 : opts.px;
  const pz = opts.pz === undefined ? 0.80 : opts.pz;
  const pos = [];
  const idx = [];
  for (const [hw, hd, y, tan] of rings) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s2 = Math.sin(a);
      const zz = hd * Math.sign(c) * Math.pow(Math.abs(c), pz);
      pos.push(hw * Math.sign(s2) * Math.pow(Math.abs(s2), px), y + tan * zz, zz);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      idx.push(r * N + i, (r + 1) * N + j, (r + 1) * N + i,
        r * N + i, r * N + j, (r + 1) * N + j);
    }
  }
  if (opts.cap) {
    const top = (rings.length - 1) * N;
    const hub = pos.length / 3;
    pos.push(0, rings[rings.length - 1][2], 0);
    for (let i = 0; i < N; i++) idx.push(hub, top + i, top + ((i + 1) % N));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  g.add(mesh);
  return mesh;
}

/**
 * A ship's boat on her chocks: pointed at both ends, with a cover over her.
 *
 * `motor` gives her a wheelhouse and a funnel instead of thwarts, which is
 * the difference between the pinnace and the cutter beside it.
 */
function boat(g, x, y, z, len, motor = false) {
  const hull = new THREE.Group();
  hull.position.set(x, y + 0.7, z);
  g.add(hull);
  const N = 9;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1;
    const w = (len * 0.135) * Math.pow(Math.max(0, 1 - u * u), 0.42);
    const zz = u * (len / 2);
    const sh = 0.42 + 0.2 * u * u;
    pos.push(-w, -0.42, zz, w, -0.42, zz, -w * 1.05, sh, zz, w * 1.05, sh, zz);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  hull.add(new THREE.Mesh(geo, M.steel));
  // Her cover, stretched gunwale to gunwale over a ridge pole and lashed down.
  //
  // A boat stowed on her chocks at sea is covered -- and a boat built as an
  // open shell is a hole in the ship from above: you look down into her, and
  // what is there to be seen is the inside of her own planking, which faces
  // the other way and is not drawn at all.
  const cov = [];
  const ci = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1;
    const w = (len * 0.135) * Math.pow(Math.max(0, 1 - u * u), 0.42) * 1.05;
    const zz = u * (len / 2);
    const sh = 0.42 + 0.2 * u * u;
    cov.push(-w, sh, zz, 0, sh + 0.3 * Math.max(0, 1 - u * u), zz, w, sh, zz);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    ci.push(a, b, a + 1, a + 1, b, b + 1);
    ci.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cov, 3));
  cg.setIndex(ci);
  cg.computeVertexNormals();
  hull.add(new THREE.Mesh(cg, M.canvas));
  // The gunwale, which is what gives a boat her sheer line at any distance.
  for (const sgn of [-1, 1]) {
    box(hull, M.steelDark, 0.09, 0.13, len * 0.9, sgn * len * 0.132, 0.5, 0);
  }
  if (motor) {
    // A pinnace: a wheelhouse forward of amidships, her funnel abaft it, and
    // the cabin top over the after half of her.
    box(hull, M.steel, len * 0.2, 0.62, len * 0.2, 0, 0.72, len * 0.1);
    box(hull, M.glass, len * 0.21, 0.26, len * 0.205, 0, 0.86, len * 0.1);
    box(hull, M.steel, len * 0.22, 0.34, len * 0.34, 0, 0.6, -len * 0.24);
    cyl(hull, M.gunDark, 0.11, 0.11, 0.7, 0, 1.2, -len * 0.02, 8);
    // Her rubbing strake and the bollard on her stem.
    cyl(hull, M.gunDark, 0.06, 0.06, 0.24, 0, 0.6, len * 0.42, 6);
  } else {
    // A cutter: her thwarts and her mast, struck down along them under the
    // cover, and the gripes that hold her into her chocks.
    for (const tz of [-len * 0.24, 0, len * 0.24]) {
      box(hull, M.steelDark, len * 0.24, 0.06, 0.1, 0, 0.42, tz);
    }
    tubeZ(hull, M.steelDark, 0.07, len * 0.7, 0, 0.55, 0, 6);
  }
  // The chocks she sits on.
  for (const cz of [-len * 0.22, len * 0.22]) {
    box(g, M.steelDark, len * 0.3, 0.5, 0.34, x, y + 0.25, z + cz);
  }
}

/**
 * The aircraft: a hangar, a catapult across her, a crane, and two Arado 196s.
 *
 * A Hipper carried three of them and worked them off a single athwartships
 * catapult on the centreline abaft the funnel, with a hangar forward of it and
 * a heavy crane on the starboard side to fish them out of the water again.
 */
function aircraft(g) {
  const foot = sdeck(0);
  // The hangar: a house with a big sliding door in its after face, standing
  // abaft the funnel casing and half a metre taller than it so the two read as
  // two things and not as one long slab. Thirteen metres over the water and a
  // hundred and five abaft the stem, which is where her drawing puts it.
  const HH = 3.0;
  house(g, M.steel, 6.0, HANGAR[0], HANGAR[1], foot, HH);
  // The door: a recessed opening in the after face with the runner over it,
  // the two leaves in their tracks, and the stiffeners down them.
  box(g, M.cave, 7.4, 2.5, 0.12, 0, foot + 1.3, HANGAR[0] + 0.02);
  for (const sgn of [-1, 1]) {
    box(g, M.steel, 3.55, 2.4, 0.22, sgn * 1.9, foot + 1.3, HANGAR[0] - 0.12);
    for (const dx of [-1.1, 0, 1.1]) {
      box(g, M.steelDark, 0.1, 2.3, 0.1, sgn * 1.9 + dx, foot + 1.3, HANGAR[0] - 0.24);
    }
    box(g, M.steelDark, 0.24, 0.3, 0.3, sgn * 3.5, foot + 1.3, HANGAR[0] - 0.24);
  }
  box(g, M.steelDark, 8.4, 0.26, 0.5, 0, foot + 2.66, HANGAR[0] - 0.14);
  box(g, M.steelDark, 8.4, 0.18, 0.4, 0, foot + 0.09, HANGAR[0] - 0.14);
  // Her sides: the plate seams, the workshop scuttles and the vents that take
  // the petrol fumes out of an aircraft hangar.
  for (const sgn of [-1, 1]) {
    for (const dz of [-7.0, -3.5, 0.5]) {
      box(g, M.steelDark, 0.07, HH - 0.2, 0.09, sgn * 6.03, foot + HH / 2, dz);
    }
    for (const dz of [-8.4, -5.4, -2.4]) {
      cyl(g, M.cave, 0.17, 0.17, 0.1, sgn * 6.04, foot + 1.9, dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.06, sgn * 6.04, foot + 1.9, dz, 10)
        .rotation.z = Math.PI / 2;
    }
    cyl(g, M.steel, 0.32, 0.36, 1.1, sgn * 4.4, foot + HH + 0.7, -6.6, 10);
    cyl(g, M.steelDark, 0.58, 0.46, 0.28, sgn * 4.4, foot + HH + 1.35, -6.6, 12);
    box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 6.05, foot + 1.0, -1.0);
  }
  // The catapult: a long girder across her on a training ring, with the
  // trolley on it and an Arado sitting on the trolley.
  //
  // It works. The ring trains, the trolley runs out along the girder and the
  // aeroplane is thrown off the end of it -- so the whole thing is left out of
  // the weld and driven by stepCatapult below, the same way the carrier's
  // lifts and the Cleveland's catapults are.
  const cat = new THREE.Group();
  cat.position.set(0, sdeck(CAT_Z) + 4.0, CAT_Z);
  cat.userData.dynamic = true;
  g.add(cat);
  cyl(cat, M.steelDark, 2.0, 2.5, 3.5, 0, -2.05, 0, 18);
  // The girder itself, athwartships, twenty-two metres of it. Her stroke runs
  // out along its own +z, so the group is turned to lie across her and the
  // trolley runs to starboard.
  const girder = new THREE.Group();
  girder.rotation.y = Math.PI / 2;
  cat.add(girder);
  box(girder, M.steel, 1.9, 0.75, 24.0, 0, 0, 0);
  box(girder, M.steelDark, 2.3, 0.16, 24.0, 0, 0.44, 0);
  for (let i = -5; i <= 5; i++) {
    box(girder, M.steelDark, 2.1, 0.5, 0.16, 0, -0.15, i * 2.3);
  }
  // The rails the trolley runs on, and the buffer at the outboard end of them.
  for (const rx of [-0.72, 0.72]) {
    box(girder, M.gunDark, 0.16, 0.14, 23.4, rx, 0.56, 0);
  }
  box(girder, M.gunDark, 1.9, 0.7, 0.5, 0, 0.5, 11.7);
  box(girder, M.gunDark, 1.9, 0.7, 0.5, 0, 0.5, -11.7);
  // The trolley, and the aeroplane on it.
  const car = new THREE.Group();
  car.position.z = CAT_A;
  girder.add(car);
  box(car, M.gunDark, 2.2, 0.34, 3.0, 0, 0, 0);
  const plane = new THREE.Group();
  plane.position.set(0, 0.33, 0);
  car.add(plane);
  const p2 = arado(plane, 0, 0, 0, 0, false, { spin: true });
  g.userData.catapult = { cat, girder, car, plane, prop: p2.userData.prop };
  // And the other two struck down either side of the hangar, wings folded
  // back. She carried three: one on the catapult and one a side.
  //
  // Only the starboard one was here, so her port side had bare deck where her
  // starboard side had an aeroplane, a dolly and the gear to handle it -- and
  // she was one aircraft short of the three on her own datasheet.
  for (const sgn of [-1, 1]) {
    // In from the deck edge far enough that a folded wing stays over her own
    // deck: an Arado with her wings swung back is four metres and a third
    // across, and stowed at five and a half of half-breadth her wingtip stood
    // three quarters of a metre out over the sea.
    const ax = sgn * 4.95;
    arado(g, ax, foot + 0.35, HANGAR[0] - 6.0, sgn * 0.22, true);
    // The dolly she is chocked on and the tracks it runs on into the hangar.
    box(g, M.steelDark, 2.6, 0.3, 1.1, ax, foot + 0.18, HANGAR[0] - 6.0);
    for (const tx of [-1.0, 1.0]) {
      box(g, M.gunDark, 0.14, 0.1, 9.0, ax + tx, foot + 0.05, HANGAR[0] - 3.4);
    }
    // The trestle her tail sits on, and the tie-down rings.
    box(g, M.steelDark, 0.7, 0.5, 0.5, ax, foot + 0.25, HANGAR[0] - 9.6);
    for (const rz of [HANGAR[0] - 8.4, HANGAR[0] - 3.6]) {
      for (const tx of [-1.5, 1.5]) {
        cyl(g, M.gunDark, 0.11, 0.11, 0.1, ax + tx, foot + 0.06, rz, 8);
      }
    }
  }
  // ------------------------------------------------------------- the crane --
  //
  // The heavy crane on her starboard side, which is how a scout gets back
  // aboard: she lands alongside, taxis up under it, and is hoisted in.
  //
  // It stood on the superstructure deck abaft the funnel, out by the ship's
  // side, and it is the biggest single thing on her upper deck -- eighteen
  // metres of lattice jib on a king post, with the machinery house, the cab
  // and the counterweight slewing under it.
  const CRANE_Z = -1.0;
  // The platform it slews on, carried out from the boat deck to her side on
  // knees, the same way her gun sponsons are. It has to be there: the boat
  // deck is seven metres of half-breadth at this station and the crane stands
  // at eight and a half, so set straight down on a number it was a ten-ton
  // crane a metre and a half outboard of anything to stand on.
  sponson(g, S * 8.6, CRANE_Z, 2.0, 2.6);
  const crane = new THREE.Group();
  crane.position.set(S * 8.6, sdeck(CRANE_Z) + 0.17, CRANE_Z);
  // Stowed trained aft, the way a crane is carried at sea: the jib lies fore
  // and aft over her own quarter rather than athwart her, so it is out of the
  // way of the aircraft on the catapult and out of the wind.
  crane.rotation.y = Math.PI * 1.004;
  g.add(crane);
  // The roller path it slews on, the machinery house that turns with it, and
  // the driver's cab looking out along the jib.
  cyl(crane, M.steelDark, 1.55, 1.7, 0.4, 0, 0.2, 0, 18);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    box(crane, M.gunDark, 0.13, 0.2, 0.2, Math.sin(a) * 1.5, 0.4, Math.cos(a) * 1.5, a);
  }
  box(crane, M.steel, 3.0, 2.2, 3.6, 0, 1.55, -1.3);
  box(crane, M.steelDark, 3.15, 0.14, 3.75, 0, 2.7, -1.3);
  box(crane, M.steel, 1.5, 1.5, 1.3, 0, 1.9, 0.85);
  box(crane, M.glass, 1.3, 0.7, 0.06, 0, 2.15, 1.52);
  box(crane, M.glass, 0.06, 0.7, 1.0, 0.76, 2.15, 0.85);
  box(crane, M.steelDark, 0.1, 1.85, 0.7, -0.76, 1.6, -0.4);
  // The counterweight abaft the house, which is what lets a jib this long pick
  // an aeroplane out of the sea.
  box(crane, M.gunDark, 2.4, 1.0, 0.9, 0, 0.9, -3.2);
  // The king post: a four-legged lattice tower the jib is stepped in.
  const post = new THREE.Group();
  post.position.y = 2.7;
  crane.add(post);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = box(post, M.steel, 0.2, 5.0, 0.2, sx * 0.9, 2.5, sz * 0.9);
    leg.rotation.z = -sx * 0.06;
    leg.rotation.x = sz * 0.06;
  }
  for (const yy of [0.8, 2.5, 4.2]) {
    for (const sgn of [-1, 1]) {
      box(post, M.steel, 2.0, 0.1, 0.1, 0, yy, sgn * 0.9);
      box(post, M.steel, 0.1, 0.1, 2.0, sgn * 0.9, yy, 0);
    }
    const br = box(post, M.steel, 2.5, 0.08, 0.08, 0, yy + 0.85, 0.9);
    br.rotation.z = 0.7;
    const br2 = box(post, M.steel, 0.08, 0.08, 2.5, -0.9, yy + 0.85, 0);
    br2.rotation.x = 0.7;
  }
  box(post, M.steelDark, 2.2, 0.22, 2.2, 0, 5.1, 0);

  // The jib: two lattice girders converging on the head, with the cross
  // bracing between them and the sheave block on the end.
  const jib = new THREE.Group();
  jib.position.set(0, 5.2, 0);
  jib.rotation.x = 0.26;
  post.add(jib);
  const JIB = 17.5;
  for (const sgn of [-1, 1]) {
    // The booms taper together toward the head, which is what makes a jib
    // read as a jib rather than as a ladder.
    for (let i = 0; i < 7; i++) {
      const t0 = i / 7;
      const t1 = (i + 1) / 7;
      const w0 = 0.62 - t0 * 0.36;
      const w1 = 0.62 - t1 * 0.36;
      const h0 = 0.5 - t0 * 0.26;
      const h1 = 0.5 - t1 * 0.26;
      for (const sy of [-1, 1]) {
        const seg = box(jib, M.steel, 0.11, 0.11, JIB / 7 + 0.05,
          sgn * (w0 + w1) / 2, sy * (h0 + h1) / 2, (t0 + t1) / 2 * JIB);
        seg.rotation.y = -sgn * (w0 - w1) / (JIB / 7);
        seg.rotation.x = sy * (h0 - h1) / (JIB / 7);
      }
    }
  }
  for (let i = 0; i <= 11; i++) {
    const t = i / 11;
    const w = 0.62 - t * 0.36;
    const h = 0.5 - t * 0.26;
    const z = t * JIB;
    for (const sy of [-1, 1]) box(jib, M.steel, w * 2, 0.07, 0.07, 0, sy * h, z);
    for (const sx of [-1, 1]) box(jib, M.steel, 0.07, h * 2, 0.07, sx * w, 0, z);
    if (i < 11) {
      const d = box(jib, M.steel, 0.06, h * 2.3, 0.06, w, 0, z + JIB / 22);
      d.rotation.x = 0.62;
      const d2 = box(jib, M.steel, 0.06, h * 2.3, 0.06, -w, 0, z + JIB / 22);
      d2.rotation.x = -0.62;
    }
  }
  // The head: the sheave, the hook block hanging under it, and the whip.
  box(jib, M.steelDark, 0.7, 0.7, 0.6, 0, 0, JIB + 0.35);
  cyl(jib, M.gunDark, 0.34, 0.34, 0.12, 0, 0, JIB + 0.55, 12).rotation.y = Math.PI / 2;
  // The hook, hove close up under the head: a crane stowed for sea does not
  // leave four metres of fall and a block swinging about over her own deck.
  box(jib, M.wire, 0.04, 0.9, 0.04, 0, -0.75, JIB + 0.5);
  box(jib, M.gunDark, 0.3, 0.55, 0.3, 0, -1.45, JIB + 0.5);
  // And the topping lift, from the head of the post to the head of the jib.
  const lift = box(post, M.wire, 0.05, 0.05, JIB * 0.96, 0, 6.9, JIB * 0.48);
  lift.rotation.x = -0.22;
  // And the whip from the winch up to the head, which is what actually hoists.
  const whip = box(post, M.wire, 0.04, 0.04, JIB * 0.97, 0, 5.4, JIB * 0.49);
  whip.rotation.x = -0.12;
}


// ------------------------------------------------------------ the after end --

/** The after control position: a short tower with its own director on top. */
function afterTower(g) {
  const foot = sdeck(-37);
  const zc = (AFT_TOWER[0] + AFT_TOWER[1]) / 2;

  // -- the after control position -------------------------------------------
  //
  // The block, roofed at fourteen metres eight -- her own profile -- and a
  // short tower on the after half of it carrying the after director. It is the
  // forward end of it that matters: Cäsar swings a six-metre circle about her
  // barbette, so the house has to stop clear of her sweep, and the platform
  // over it carries her after light battery.
  house(g, M.steel, 5.2, AFT_TOWER[0], AFT_TOWER[1], foot, 4.3);
  for (const sgn of [-1, 1]) {
    for (const dz of [-3.6, 3.0]) {
      box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 5.22, foot + 0.95, zc + dz);
      box(g, M.steel, 0.12, 0.12, 1.1, sgn * 5.24, foot + 2.0, zc + dz);
    }
    for (const dz of [-5.0, -1.4, 1.4, 5.0]) {
      cyl(g, M.cave, 0.17, 0.17, 0.1, sgn * 5.23, foot + 2.9, zc + dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.06, sgn * 5.23, foot + 2.9, zc + dz, 10)
        .rotation.z = Math.PI / 2;
    }
    box(g, M.steelDark, 0.06, 4.1, 0.09, sgn * 5.23, foot + 2.15, zc - 1.4);
    box(g, M.steelDark, 0.06, 4.1, 0.09, sgn * 5.23, foot + 2.15, zc + 2.0);
    ladder(g, M.steelDark, sgn * 4.2, foot, foot + 4.3, AFT_TOWER[0] + 0.6, AFT_TOWER[0] + 2.4);
  }
  // The after light battery's bandstand, over the forward end of the house:
  // her centreline Flakvierling stands here with the rest of her after guns.
  box(g, M.deckSteel, 6.0, 0.18, 5.0, 0, foot + 4.42, AFT_TOWER[0] + 3.0);
  railRing(g, 0, foot + 4.52, AFT_TOWER[0] + 3.0, 3.0, 2.5);

  // The tower over the after half of it, and the deck on top that the after
  // director trains on.
  const tzc = zc + 3.2;
  loftRings(g, M.steel, [
    [3.4, 3.7, tzc, foot + 4.4],
    [3.3, 3.55, tzc, foot + 6.4],
    [3.15, 3.35, tzc, foot + 7.0],
  ], { n: 18, px: 0.52, pz: 0.52, cap: false });
  box(g, M.steelDark, 1.0, 1.9, 0.1, 0, foot + 5.35, tzc - 3.72);
  loftRings(g, M.deckSteel, [
    [3.55, 3.75, tzc, foot + 7.0],
    [3.55, 3.75, tzc, foot + 7.16],
  ], { n: 18, px: 0.52, pz: 0.52 });
  railRing(g, 0, foot + 7.2, tzc, 3.6, 3.8);
  for (const sgn of [-1, 1]) {
    // Her after searchlights, on brackets off the tower where they can see
    // astern past the after turrets.
    box(g, M.deckSteel, 2.4, 0.15, 2.6, sgn * 3.6, foot + 5.6, tzc + 0.4);
    const br = box(g, M.steel, 2.2, 0.13, 0.9, sgn * 3.5, foot + 5.1, tzc + 0.4);
    br.rotation.z = sgn * 0.5;
    searchlight(g, sgn * 4.1, foot + 5.75, tzc + 0.4, sgn * 1.9);
    railRing(g, sgn * 3.6, foot + 5.68, tzc + 0.4, 1.3, 1.4);
    ladder(g, M.steelDark, sgn * 2.2, foot + 4.42, foot + 7.0, tzc - 3.4, tzc - 2.0);
  }

  // The after director, with its own rangefinder through it: a six-metre base
  // rather than the seven she carries forward, in a hood of the same pattern.
  const dir = new THREE.Group();
  dir.position.set(0, foot + 7.2, tzc);
  dir.userData.dynamic = true;
  g.add(dir);
  loftRings(dir, M.gun, [[2.15, 1.92, 0, 0], [2.15, 1.92, 0, 1.45], [1.82, 1.66, 0, 1.95]],
    { n: 16, px: 0.7, pz: 0.68 });
  tubeX(dir, M.gun, 0.32, 6.3, 0, 0.98, 0.3, 12);
  for (const sgn of [-1, 1]) {
    box(dir, M.gun, 0.6, 0.66, 0.8, sgn * 2.9, 0.98, 0.3);
    box(dir, M.gunDark, 0.14, 0.34, 0.48, sgn * 3.24, 1.0, 0.3);
    box(dir, M.glass, 0.06, 0.26, 0.38, sgn * 3.32, 1.0, 0.3);
    cyl(dir, M.gun, 0.24, 0.28, 0.32, sgn * 0.85, 2.02, 0.15, 10);
  }
  // The short pole over it that carries her after aerials.
  cyl(dir, M.steel, 0.1, 0.18, 5.6, 0, 4.7, -0.3, 8);
  tubeX(dir, M.steel, 0.07, 2.8, 0, 6.6, -0.3, 8);

  // -- the mainmast ----------------------------------------------------------
  //
  // A pole stepped abaft the catapult on the superstructure deck, raked with
  // the funnel, with a topmast above the hounds, two yards, the gaff her
  // ensign flies from at sea, and the wireless aerials forward to the foretop.
  // Her truck stands thirty-nine metres over the water, which is a metre and a
  // half under the foremast and the second-highest thing in the ship.
  {
    const mz = MAIN_MAST_Z;
    const mFoot = sdeck(mz);
    // The tabernacle the heel is stepped in, so a pole this tall stands on
    // something rather than growing out of a deck plate.
    house(g, M.steel, 1.1, mz - 1.3, mz + 1.3, mFoot, 1.5, { n: 12 });
    const lower = cyl(g, M.steel, 0.34, 0.54, 17.2, 0, mFoot + 9.1, mz - 0.45, 12);
    lower.rotation.x = -0.10;
    const topm = cyl(g, M.steel, 0.15, 0.30, 11.4, 0, mFoot + 23.0, mz - 1.83, 8);
    topm.rotation.x = -0.10;
    // The hounds: the band the topmast is fidded at and the shrouds set up to.
    cyl(g, M.steelDark, 0.4, 0.4, 0.5, 0, mFoot + 17.2, mz - 1.28, 12);
    for (const [yy, half, dz] of [[13.4, 5.6, -1.05], [21.4, 3.2, -1.85]]) {
      tubeX(g, M.steel, 0.12, half * 2, 0, mFoot + yy, mz + dz, 8);
      for (const sgn of [-1, 1]) {
        box(g, M.wire, 0.04, 1.5, 0.04, sgn * half * 0.92, mFoot + yy - 0.75, mz + dz);
        const lift = box(g, M.wire, 0.04, 2.8, 0.04, sgn * half * 0.5, mFoot + yy + 1.4, mz + dz);
        lift.rotation.z = sgn * 0.52;
      }
    }
    // The gaff abaft her, which is where the ensign is worn under way.
    const gaff = cyl(g, M.steel, 0.09, 0.14, 5.6, 0, mFoot + 9.4, mz - 2.2, 8);
    gaff.rotation.x = 0.85;
    // The shrouds: a pair a side from the hounds down on to the boat deck,
    // which is what stays a pole mast in a seaway.
    for (const sgn of [-1, 1]) {
      for (const [dz, lean] of [[-2.6, 0.30], [2.0, 0.30]]) {
        // Set up on to the boat deck, not stopped a metre over it: a shroud
        // that does not reach the deck is holding nothing.
        const sh = box(g, M.wire, 0.05, 18.2, 0.05, sgn * 2.3, mFoot + 8.62, mz + dz);
        sh.rotation.z = sgn * lean;
        sh.rotation.x = dz < 0 ? 0.10 : -0.16;
      }
    }
  }
}

/**
 * A pair of bollards on their common base plate: what a ship is tied up with,
 * and the one fitting that gives a bare deck its scale.
 */
function bollards(g, x, y, z, ry = 0) {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = ry;
  g.add(b);
  box(b, M.steelDark, 1.35, 0.1, 0.7, 0, 0.05, 0);
  for (const dz of [-0.38, 0.38]) {
    cyl(b, M.steelDark, 0.15, 0.17, 0.62, 0, 0.41, dz, 8);
    cyl(b, M.steelDark, 0.2, 0.2, 0.09, 0, 0.76, dz, 8);
  }
}

/**
 * A mooring chock at the deck edge: the horns a wire or a rope is led out
 * through, bolted down on the waterway bar.
 */
function chock(g, sgn, z) {
  const y = deckAt(z);
  const x = sgn * (halfDeck(z) - 0.05);
  box(g, M.steelDark, 0.5, 0.42, 1.25, x, y + 0.2, z);
  box(g, M.cave, 0.55, 0.22, 0.6, x, y + 0.22, z);
  for (const dz of [-0.48, 0.48]) {
    cyl(g, M.steelDark, 0.1, 0.1, 0.5, x, y + 0.36, z + dz, 8).rotation.z = Math.PI / 2;
  }
}

/**
 * A capstan: the drum a cable or a warp is hove in on, the warping head over
 * it, and the ring of whelps round the barrel.
 */
function capstan(g, x, y, z, r, cable = false) {
  const c = new THREE.Group();
  c.position.set(x, y, z);
  g.add(c);
  cyl(c, M.deckSteel, r * 1.35, r * 1.35, 0.1, 0, 0.05, 0, 16);
  cyl(c, M.steelDark, r, r * 1.14, 0.75, 0, 0.47, 0, 16);
  // The whelps: the ribs on the barrel a rope surges against.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    box(c, M.gunDark, 0.09, 0.66, 0.16, Math.sin(a) * r * 1.02, 0.47, Math.cos(a) * r * 1.02, a);
  }
  cyl(c, M.gunDark, r * 0.72, r * 0.88, 0.5, 0, 1.1, 0, 14);
  cyl(c, M.steelDark, r * 0.5, r * 0.5, 0.14, 0, 1.4, 0, 12);
  if (cable) {
    // The cable holder under the warping head, with the snugs the links lie in.
    cyl(c, M.gunDark, r * 1.2, r * 1.2, 0.3, 0, 0.98, 0, 5);
  }
}

/** A deck hatch, with the coaming round it and the dogs on the lid. */
function hatch(g, x, y, z, w, d, ry = 0) {
  const h = new THREE.Group();
  h.position.set(x, y, z);
  h.rotation.y = ry;
  g.add(h);
  box(h, M.steelDark, w + 0.16, 0.26, d + 0.16, 0, 0.13, 0);
  box(h, M.deckSteel, w, 0.1, d, 0, 0.28, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cyl(h, M.gunDark, 0.05, 0.05, 0.12, sx * w * 0.36, 0.36, sz * d * 0.4, 6);
    }
  }
}

/** A mushroom ventilator head, which is what a deck breathes through. */
function mushroom(g, x, y, z, r) {
  cyl(g, M.steel, r * 0.62, r * 0.7, 0.55, x, y + 0.28, z, 10);
  cyl(g, M.steelDark, r, r * 0.78, 0.26, x, y + 0.66, z, 12);
  cyl(g, M.steel, r * 0.5, r * 0.5, 0.07, x, y + 0.82, z, 10);
}

/**
 * A run of anchor cable on the deck, link by link.
 *
 * Twenty links of two-and-a-half-inch stud cable between the hawse pipe and
 * the navel pipe is what a forecastle is for, and without it the capstans and
 * the stoppers are machinery standing in the open with nothing to work on.
 */
function cableRun(g, x, y, z0, z1, n = 22) {
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const z = z0 + (z1 - z0) * f;
    const link = cyl(g, M.gunDark, 0.15, 0.15, 0.34, x, y + 0.14, z, 6);
    link.rotation.x = Math.PI / 2;
    if (i % 2) link.rotation.z = Math.PI / 2;
  }
}

/** Depth charge rails, paravanes and the other things bolted to her quarter. */
function fittings(g) {
  // The wireless aerial, slung between the mastheads over the funnel. Rigging
  // rather than funnel: hung off the funnel it was the highest thing the
  // funnel owned, which made the cap look as though it were not there.
  {
    const aerial = box(g, M.wire, 0.05, 0.05, 34.0, 0, sdeck(0) + 15.6, -1.0);
    aerial.rotation.x = -0.06;
  }

  // ------------------------------------------------------- the forecastle --
  //
  // Everything forward of Anton, which on a ship with an Atlantic bow is
  // twenty-five metres of open deck inside a bulwark, and which she had
  // nothing on at all.
  for (const sgn of [-1, 1]) {
    // The anchor capstan and the cable holder on it, the navel pipe the cable
    // goes down, the stopper it is held on, and the cable between them.
    capstan(g, sgn * 3.6, deckAt(80) + 0.02, 80, 0.72, true);
    cableRun(g, sgn * 3.6, deckAt(84.5), 83.0, 87.6, 12);
    box(g, M.steelDark, 0.95, 0.42, 1.5, sgn * 3.6, deckAt(83) + 0.2, 82.4);
    cyl(g, M.cave, 0.42, 0.42, 0.2, sgn * 3.6, deckAt(78) + 0.08, 77.8, 12);
    cyl(g, M.steelDark, 0.55, 0.55, 0.14, sgn * 3.6, deckAt(78) + 0.05, 77.8, 12);
    // Out to the hawse pipe, where the cable turns down into her bow.
    const hz = 88;
    const hx = shellAt(hz / (LOA / 2), sheer(hz / (LOA / 2)) - 2.4);
    cableRun(g, sgn * (3.6 + (hx - 4.6) * 0.5), deckAt(hz) + 0.1, 87.6, 90.6, 8);
    // The warping capstan abaft them, the bitts, and the ventilators.
    capstan(g, sgn * 5.0, deckAt(70) + 0.02, 70, 0.5);
    bollards(g, sgn * (halfDeck(74) - 1.2), deckAt(74), 74, Math.PI / 2);
    bollards(g, sgn * (halfDeck(86) - 1.0), deckAt(86), 86, Math.PI / 2);
    mushroom(g, sgn * 5.4, deckAt(66), 66, 0.42);
    mushroom(g, sgn * 2.6, deckAt(90), 90, 0.34);
    hatch(g, sgn * 4.4, deckAt(76), 76, 1.5, 1.9);
    // The paravane, chocked down on the forecastle with its towing span: the
    // otter that streams from her forefoot to cut a moored mine's wire.
    const pv = new THREE.Group();
    pv.position.set(sgn * 6.4, deckAt(64) + 0.55, 64);
    g.add(pv);
    cyl(pv, M.gunDark, 0.26, 0.34, 2.6, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    cyl(pv, M.gunDark, 0.1, 0.26, 0.7, 0, 0, 1.6, 10).rotation.x = Math.PI / 2;
    box(pv, M.steelDark, 1.5, 0.1, 0.7, 0, -0.1, -0.5);
    box(pv, M.steelDark, 0.1, 0.9, 0.6, 0, 0.5, -0.9);
    for (const dz of [-0.9, 0.9]) box(g, M.steelDark, 0.9, 0.5, 0.3, sgn * 6.4, deckAt(64) + 0.25, 64 + dz);
    locker(g, sgn * 5.6, deckAt(60), 60, 1.1, 0.6, 2.2);
  }
  // The bullnose on the stem head, and the jackstaff in it.
  {
    const bz = 94.5;
    box(g, M.steelDark, 1.9, 0.6, 1.3, 0, deckAt(bz) + 0.3, bz);
    box(g, M.cave, 0.8, 0.32, 1.4, 0, deckAt(bz) + 0.34, bz);
    hatch(g, 0, deckAt(72), 72, 1.8, 2.2);
  }

  // ------------------------------------------------------ the quarterdeck --
  //
  // And everything abaft Dora, which was forty metres of bare planking with a
  // flagstaff on the end of it.
  for (const sgn of [-1, 1]) {
    capstan(g, sgn * 3.4, deckAt(-80) + 0.02, -80, 0.62, true);
    cyl(g, M.cave, 0.38, 0.38, 0.2, sgn * 3.4, deckAt(-76) + 0.08, -76.4, 12);
    cyl(g, M.steelDark, 0.5, 0.5, 0.14, sgn * 3.4, deckAt(-76) + 0.05, -76.4, 12);
    bollards(g, sgn * (halfDeck(-74) - 1.1), deckAt(-74), -74, Math.PI / 2);
    bollards(g, sgn * (halfDeck(-90) - 0.9), deckAt(-90), -90, Math.PI / 2);
    chock(g, sgn, -70);
    chock(g, sgn, -93);
    mushroom(g, sgn * 4.6, deckAt(-72), -72, 0.42);
    mushroom(g, sgn * 2.4, deckAt(-88), -88, 0.34);
    hatch(g, sgn * 4.2, deckAt(-84), -84, 1.6, 2.0);
    // The mine rails: she was built to lay them, and they run from abreast the
    // after superstructure right aft to her transom. They are the reason the
    // whole of that deck is kept clear.
    for (const dx of [-0.75, 0.75]) {
      for (let i = 0; i < 16; i++) {
        const z = -55 - i * 2.95;
        // In from her own deck edge at that station, and never out over it:
        // her quarters come in fast abaft the after turret and a rail laid on
        // a number rather than on the deck runs off into the sea.
        const rx = sgn * Math.min(5.4 + dx, halfDeck(z) - 1.4 + dx);
        box(g, M.steelDark, 0.14, 0.14, 2.9, rx, deckAt(z) + 0.14, z);
        // A chair every third length, which is what holds a rail to a deck.
        if (i % 3 === 0) box(g, M.steelDark, 0.2, 0.22, 0.3, rx, deckAt(z) + 0.06, z + 1.35);
      }
    }
    // The slip the towing pendant is let go from, abaft the capstans.
    box(g, M.steelDark, 0.9, 0.55, 1.2, sgn * 2.2, deckAt(-95) + 0.28, -95);
  }
  // The transom itself: the two mine ports in it, and the stern light over them.
  for (const sgn of [-1, 1]) {
    box(g, M.cave, 1.3, 1.1, 0.24, sgn * 2.4, deckAt(-99) - 0.75, zAt(-1, sheer(-1)) + 0.5);
  }
  box(g, M.steelDark, 0.5, 0.55, 0.4, 0, deckAt(-99) + 0.3, zAt(-1, sheer(-1)) + 0.8);
  // Her ensign staff aft and the jackstaff forward.
  cyl(g, M.steel, 0.07, 0.1, 4.4, 0, deckAt(-96) + 2.2, -96, 8);
  cyl(g, M.steel, 0.07, 0.1, 3.2, 0, deckAt(96) + 1.6, 96, 8);

  // ---------------------------------------------------------- amidships --
  //
  // Bollards down both sides, which is what tells you the scale of a deck.
  for (const z of [34, -14, -44]) {
    for (const sgn of [-1, 1]) {
      bollards(g, sgn * (halfDeck(z) - 1.0), deckAt(z), z, Math.PI / 2);
    }
  }
  // Ventilator cowls along the superstructure deck, turned to the wind. In
  // pairs, one each side at every station: they used to be staggered down
  // alternate sides, which from ahead made her look built lopsided.
  for (const vz of [30, 18, -2, -16, -38]) for (const sgn of [-1, 1]) {
    const v = new THREE.Group();
    v.position.set(sgn * (sHalf(vz) + 0.6), sdeck(vz), vz);
    g.add(v);
    cyl(v, M.steel, 0.3, 0.36, 1.9, 0, 0.95, 0, 10);
    const bell = cyl(v, M.steel, 0.55, 0.32, 0.7, 0, 2.1, 0.22, 12);
    bell.rotation.x = -1.1;
    cyl(v, M.cave, 0.44, 0.44, 0.08, 0, 2.3, 0.54, 12).rotation.x = -1.1;
  }
  // The after boat deck, between the catapult and the after tower, which was
  // twenty metres of bare plate: the aircraft handling track out of the
  // hangar, the trolleys and the spreaders that go with it, the ready-use
  // lockers, and the aviation stores.
  for (const sgn of [-1, 1]) {
    for (const tx of [-0.9, 0.9]) {
      for (let i = 0; i < 6; i++) {
        const z = -16.5 - i * 2.4;
        box(g, M.gunDark, 0.13, 0.1, 2.3, sgn * 3.3 + tx, sdeck(z) + 0.05, z);
      }
    }
    locker(g, sgn * 6.0, sdeck(-22), -22, 1.0, 0.8, 2.0);
    locker(g, sgn * 5.6, sdeck(-27), -27, 0.9, 0.7, 1.4);
    mushroom(g, sgn * 2.4, sdeck(-25), -25, 0.38);
    // The sling and the spreader bar an Arado is hoisted on, on their rack.
    box(g, M.steelDark, 0.3, 0.16, 4.4, sgn * 4.6, sdeck(-30) + 0.4, -30);
    for (const dz of [-1.8, 1.8]) {
      box(g, M.steelDark, 0.5, 0.42, 0.3, sgn * 4.6, sdeck(-30) + 0.2, -30 + dz);
    }
  }

  // Her spare torpedoes, in their stowage racks on the weather deck abreast
  // the tubes: twelve carried and six in the tubes, so six live out here under
  // covers with the loading davit over them.
  for (const sgn of [-1, 1]) {
    // Clear of the tubes' own swing: a bank at the deck edge sweeps a circle
    // five metres about its ring, and a spare stowed inside that is a spare
    // the tubes train through.
    for (const dz of [-26.0, -16.5, 7.0]) {
      const x = sgn * (lowHalf(dz) + 0.75);
      tubeZ(g, M.canvas, 0.33, 7.6, x, deckAt(dz) + 0.62, dz, 10);
      for (const cz of [-2.6, 2.6]) {
        box(g, M.steelDark, 0.85, 0.65, 0.4, x, deckAt(dz) + 0.3, dz + cz);
      }
      box(g, M.steelDark, 0.18, 0.18, 8.0, x, deckAt(dz) + 0.06, dz);
    }
    // The davit that swings a torpedo across into the tube.
    const dav = cyl(g, M.steel, 0.12, 0.16, 3.2, sgn * (lowHalf(-12) + 0.3),
      deckAt(-12) + 1.6, -12.0, 8);
    dav.rotation.z = sgn * 0.12;
    const head = cyl(g, M.steel, 0.1, 0.12, 1.6, sgn * (lowHalf(-12) + 0.85),
      deckAt(-12) + 3.05, -12.0, 8);
    head.rotation.z = sgn * 1.2;
  }

  // Carley floats stowed against the deckhouse sides -- against them, in racks
  // on the house, not hanging in the air a metre outboard of the deck they are
  // supposed to be on.
  //
  // A Carley float is a kapok ring in a canvas cover with a slatted grating
  // slung inside it, stowed on edge in a rack with a slip that lets it go over
  // the side. Drawn as a bare torus it read as a coil of rope nailed to the
  // bridge.
  for (const rz of [26, 10, -10, -34]) {
    for (const sgn of [-1, 1]) {
      const r = new THREE.Group();
      r.position.set(sgn * (sHalf(rz) - 0.12), sdeck(rz) + 1.05, rz);
      r.rotation.z = sgn * 0.14;
      g.add(r);
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.21, 6, 16), M.raft);
      t.scale.set(1, 0.66, 1);
      t.rotation.y = Math.PI / 2;
      r.add(t);
      // The grating inside the ring, and the beckets round the outside of it.
      for (let i = -2; i <= 2; i++) {
        box(r, M.canvas, 0.1, 0.07, 1.3, 0, i * 0.2, 0);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(r, M.canvas, 0.09, 0.1, 0.1, 0, Math.sin(a) * 0.62, Math.cos(a) * 0.98);
      }
      // The rack it stands in, and the slip that lets it go.
      for (const dz of [-0.7, 0.7]) {
        const arm = box(g, M.steelDark, 0.55, 0.1, 0.1,
          sgn * (sHalf(rz) - 0.35), sdeck(rz) + 0.28, rz + dz);
        arm.rotation.z = -sgn * 0.3;
      }
      box(g, M.steelDark, 0.12, 1.5, 0.1, sgn * (sHalf(rz) - 0.06), sdeck(rz) + 0.9, rz);
    }
  }
  // Accommodation ladders stowed against her side amidships, with their
  // platforms and the handrails rigged on them.
  for (const sgn of [-1, 1]) {
    const x = sgn * (halfDeck(-2) - 0.3);
    const l = box(g, M.steelDark, 0.2, 0.5, 7.0, x, deckAt(-2) - 1.2, -2);
    l.rotation.x = 0.06;
    // The treads, and the two stanchions that carry the manrope.
    for (let i = -6; i <= 6; i++) {
      box(g, M.steel, 0.7, 0.05, 0.24, x + sgn * 0.3, deckAt(-2) - 1.2 + i * 0.06, -2 + i * 0.5);
    }
    for (const dz of [-3.2, 3.2]) {
      box(g, M.steelDark, 0.06, 0.9, 0.06, x + sgn * 0.5, deckAt(-2) - 0.75, -2 + dz);
    }
    box(g, M.steelDark, 0.05, 0.05, 6.6, x + sgn * 0.5, deckAt(-2) - 0.35, -2);
    // The boat boom, topped up against her side, that a boat lies off at anchor.
    const boom = cyl(g, M.steel, 0.11, 0.16, 9.0, x - sgn * 0.35, deckAt(-24) - 0.9, -24, 8);
    boom.rotation.x = Math.PI / 2;
    boom.rotation.y = sgn * 0.05;
    for (const dz of [-3.4, 3.4]) {
      box(g, M.wire, 0.04, 1.5, 0.04, x - sgn * 0.35, deckAt(-24) - 0.2, -24 + dz);
    }
  }

  // ------------------------------------------------------- the deck itself --
  //
  // What is on a ship's side amidships, which is the part of her anybody
  // actually stands next to. She had bollards and vents and nothing else: a
  // hundred and eighty metres of bare grey plate, with a gun every thirty of
  // it and the sea over the edge.

  // Guard rails: down both sides of the weather deck, round the forecastle,
  // and along the superstructure deck. This is the single thing that makes a
  // warship's side read as a place people work rather than as a wall.
  for (const sgn of [-1, 1]) {
    // The weather deck, from where the bulwark takes over forward right aft to
    // the transom. It used to stop eighteen metres short of her stern, with a
    // fence run straight across her quarterdeck where the two sides were meant
    // to meet -- so the after end of her was railed off across the middle and
    // open at the edges, which is the wrong way round.
    railRun(g, (t) => {
      const z = 58 - t * 158.8;
      return [sgn * (halfDeck(z) - 0.35), deckAt(z), z];
    }, 48);
    // The superstructure deck's outboard edge, between the sponsons.
    for (const [z0, z1] of [[38, 26], [22, 4], [-2, -20], [-24, -42]]) {
      railRun(g, (t) => {
        const z = z0 + (z1 - z0) * t;
        return [sgn * (lowHalf(z) + 0.25), sdeck(z), z];
      }, 10);
    }
  }
  // And across her transom, where the two sides meet.
  railRun(g, (t) => {
    const z = -100.8;
    return [(t * 2 - 1) * (halfDeck(z) - 0.35), deckAt(z), z];
  }, 8);

  // Ready-use lockers and lifebuoy racks against the house sides, and the
  // hose and wire reels beside them.
  for (const sgn of [-1, 1]) {
    for (const z of [40, 24, 6, -12, -30]) {
      locker(g, sgn * (sHalf(z) - 0.55), sdeck(z), z, 0.85, 0.75, 1.5);
    }
    for (const z of [32, -6, -26]) {
      reel(g, sgn * (sHalf(z) - 0.7), sdeck(z), z, 0.55, sgn * Math.PI / 2);
    }
    // The fire main down the house side, with a hydrant at every station. In
    // lengths that each follow the house at their own station: her deckhouse
    // is half a metre wider amidships than at its ends, and one straight pipe
    // laid to the breadth at the middle of it stands off the plating at both.
    for (let i = 0; i < 12; i++) {
      const z = 39 - i * 6.5;
      box(g, M.steelDark, 0.14, 0.14, 6.6, sgn * (lowHalf(z) - 0.2), deckAt(z) + 1.9, z - 3.25);
    }
    for (const z of [34, 16, -4, -22, -38]) {
      cyl(g, M.steelDark, 0.09, 0.09, 0.8, sgn * (lowHalf(z) - 0.2), deckAt(z) + 1.4, z, 6);
      cyl(g, M.brass, 0.07, 0.07, 0.3, sgn * (lowHalf(z) - 0.32), deckAt(z) + 1.1, z, 6)
        .rotation.z = Math.PI / 2;
    }
    // Lifebuoys on the rail, which is where they live and where they are grabbed.
    for (const z of [52, 16, -22, -56]) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 6, 12), M.mark);
      b.position.set(sgn * (halfDeck(z) - 0.25), deckAt(z) + 0.75, z);
      b.rotation.y = Math.PI / 2;
      g.add(b);
    }
    // Ammunition scuttles and the gratings over the trunks, along the deck.
    for (const z of [58, 44, -50, -66]) {
      cyl(g, M.steelDark, 0.34, 0.34, 0.14, sgn * 3.2, deckAt(z) + 0.07, z, 12);
      cyl(g, M.gunDark, 0.24, 0.24, 0.06, sgn * 3.2, deckAt(z) + 0.16, z, 10);
    }
    locker(g, sgn * (halfDeck(-58) - 1.4), deckAt(-58), -58, 1.0, 0.7, 1.8);
  }
}

// ------------------------------------------------------------------ build --

/** Everything that does not move, in the order it is built. */
const STATIC = [
  ['hull', hull],
  ['superstructureDeck', superstructureDeck],
  ['bridge', bridge],
  ['funnel', funnel],
  ['aircraft', aircraft],
  ['afterTower', afterTower],
  ['sponsons', sponsons],
  ['fittings', fittings],
];

/** Her main battery: four twin eight-inch, Cäsar with the rangefinder. */
function mainBattery(g) {
  const turrets = [];
  // Anton and Bruno stand on the weather deck and on a barbette above it;
  // Cäsar and Dora the same the other way round.
  // Set so each roof stands where her own profile puts it: Anton at nine and a
  // half metres over the water, Bruno at twelve and a half, Cäsar at thirteen
  // and Dora at nine and a half again. They were three to five metres high
  // before, which put Anton's roof level with the bridge windows.
  turrets.push(eightInch(g, 0, deckAt(A_Z) - 0.27, A_Z, false));
  turrets.push(eightInch(g, 0, deckAt(B_Z) + 2.85, B_Z, false, true));
  turrets.push(eightInch(g, 0, deckAt(X_Z) + 3.57, X_Z, true, true));
  turrets.push(eightInch(g, 0, deckAt(Y_Z) - 0.43, Y_Z, true));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes B and C stand on, which are part of the ship, not the guns. */
function barbettes(g) {
  // A barbette is a barbette: an armoured cylinder a little wider than the ring
  // the turret trains on, standing out of the deck. It used to be a
  // fifteen-metre deckhouse the full breadth of the superstructure, which
  // buried Bruno and Cäsar in it -- from abeam you could not tell there was a
  // turret there at all, only a long grey block with a gun sticking out.
  for (const [z, h] of [[B_Z, 2.85], [X_Z, 3.57]]) {
    const y = deckAt(z);
    cyl(g, M.steel, 4.55, 4.7, h, 0, y + h / 2, z, 24);
    cyl(g, M.deckSteel, 4.7, 4.7, 0.16, 0, y + h + 0.06, z, 24);
    // The trunk it stands on runs out fore and aft into the deck round it.
    // Kept short: a trunk carried six and a half metres forward of Bruno's
    // barbette reached under Anton's rear plate, so training Anton aft ground
    // a metre of gunhouse through the structure abaft her.
    house(g, M.steel, 3.9, z - 4.9, z + 4.9, y, h * 0.62, { px: 0.9, pz: 0.9 });
  }
  // The breakwater forward of Anton, which every ship with an Atlantic bow has.
  //
  // A chevron: apex on the centreline with the arms raking aft and outboard to
  // the deck edge, so a sea that comes over the bow is thrown outboard instead
  // of down the forecastle. Drawn as a plate across her with two stubs beside
  // it, it read as a packing case left on deck.
  //
  // Twenty-six metres abaft the stem, where her drawing puts it, and a metre
  // high: the apex is four metres forward of Anton's muzzles at their own
  // height and her arms are out at four and a half of half-breadth by the time
  // they are abreast of them, so she can train and elevate over it.
  {
    const APEX = 75.0;
    const H = 0.95;
    const limbs = [];
    for (const sgn of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const f = i / 7;
        const z = APEX - f * 9.0;
        pts.push([sgn * f * (halfDeck(z) - 0.7), z]);
      }
      limbs.push(pts);
    }
    const pts = [...limbs[0].slice().reverse(), ...limbs[1].slice(1)];
    const pos = [];
    const idx = [];
    for (const [x, z] of pts) {
      const y = deckAt(z);
      // Four points a station: the foot and the head of the forward face, and
      // the head and the foot of the after face, so the plate has a thickness
      // and a capping bar along the top of it.
      pos.push(x, y, z + 0.16, x, y + H, z + 0.16, x, y + H, z - 0.16, x, y, z - 0.16);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1);              // forward face
      idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);  // the cap
      idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);  // after face
    }
    // And the ends closed, so the plate is not a sheet of paper on edge.
    for (const e of [0, (pts.length - 1) * 4]) {
      if (e === 0) idx.push(e, e + 1, e + 2, e, e + 2, e + 3);
      else idx.push(e, e + 2, e + 1, e, e + 3, e + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.steel));
    // The knees on the after face that hold a metre of plate up to a head sea.
    for (const limb of limbs) {
      for (const [x, z] of limb.filter((_, i) => i % 2 === 1)) {
        const k = box(g, M.steel, 0.12, 0.95, 1.0, x, deckAt(z) + 0.42, z - 0.62);
        k.rotation.x = 0.42;
      }
    }
  }
}

/**
 * The platforms every beam mounting stands on, built before the welder runs so
 * they are part of the ship rather than part of the gun.
 */
function sponsons(g) {
  for (const m of CLS.secondary.mounts) sponson(g, m.x, m.z, 2.3, 2.6);
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      if (m.x === 0) continue;
      sponson(g, m.x, m.z, gun.caliber === 37 ? 1.5 : 1.2, gun.caliber === 37 ? 1.7 : 1.4);
    }
  }
}

/** The secondary battery, the light battery and the tubes, off the datasheet. */
function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  for (const m of CLS.secondary.mounts) {
    sec.push(tenFive(g, m.x, sdeck(m.z) + 0.16, m.z, m.angle));
  }
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      // The one on the centreline right aft is on the bandstand carried over
      // Cäsar; the rest stand on the superstructure deck or on a sponson.
      // The one on the centreline stands on the after superstructure's roof
      // with the rest of her after light battery; everything else is on the
      // superstructure deck or on a sponson off it.
      const y = m.x === 0 ? sdeck(-37) + 4.46 : sdeck(m.z) + 0.16;
      aa.push(gun.caliber === 37
        ? threeSeven(g, m.x, y, m.z, m.angle)
        : twoCm(g, m.x, y, m.z, m.angle));
    }
  }
  // The tubes stand on the open weather deck at her side, in the walkway
  // between the house and the deck edge, which is where a cruiser's
  // above-water tubes are: they have to fire over the rail, and a bank up on
  // the boat deck fires over the boats and the funnel casing instead.
  for (const m of CLS.torpedoes.mounts) {
    const x = Math.sign(m.x) * (halfDeck(m.z) - 1.95);
    torp.push(torpedoBank(g, x, deckAt(m.z) + 0.02, m.z, m.angle));
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
}

/**
 * The whole ship.
 *
 * Everything static is welded into as few meshes as the materials allow; the
 * mountings are built afterwards and left alone, because they have to train.
 */
/**
 * Her catapult, working.
 *
 * The same evolution the Cleveland flies, athwartships instead of fore and
 * aft: the ring trains round into the wind, the engine runs up on the trolley,
 * and the shot itself is read off the integrated catapult profile -- thrust
 * against her weight down twenty metres of track and then flying. Once she is
 * off the end of it the flight is drawn out where the shot left her, so the
 * model goes out of sight until she is craned back aboard.
 */
const CAT_TRAIN_T = 2.4;        // seconds to swing the ring round
const CAT_RUNUP = 5.4;          // and to wind the engine up on the trolley

function stepCatapult(deck, t) {
  const c = deck.cat;
  if (!c) return;
  const pr = deck.profile;
  const shot = pr.rows.length * pr.dt;
  // Paced so she leaves the track at the moment the simulation puts her
  // flight up, however long the integrated shot takes.
  const pace = (CAT_RUNUP + shot) / deck.run;
  const run = deck.launchAt === null ? -1 : (t - deck.launchAt) * pace;

  // The ring trains out on the order and comes back afterwards.
  let out = 0;
  if (run >= 0) {
    if (run < CAT_TRAIN_T) out = smooth(run / CAT_TRAIN_T);
    else if (run < CAT_RUNUP + shot) out = 1;
    else out = 1 - smooth((run - CAT_RUNUP - shot) / 3.5);
  }
  c.cat.rotation.y = CAT_TRAIN * out;

  if (run < 0) {
    // On the trolley, inboard, with the engine ticking over.
    c.car.position.z = CAT_A;
    c.plane.position.set(0, 0.33, 0);
    c.plane.rotation.set(0, 0, 0);
    c.plane.visible = !deck.gone;
    if (c.prop && !deck.gone) c.prop.rotation.z += 0.04;
    return;
  }
  if (deck.gone) { c.plane.visible = false; return; }

  let along = CAT_A;
  let y = 0;
  let pitch = 0;
  let turning = 3;
  if (run < CAT_TRAIN_T) {
    turning = 3 + 14 * out;
  } else if (run < CAT_RUNUP) {
    // Held on the trolley with the engine wound right up: she shakes.
    turning = 30;
    pitch = 0.005 * Math.sin((run - CAT_TRAIN_T) * 26);
  } else if (run < CAT_RUNUP + shot) {
    turning = 34;
    const i = Math.min(pr.rows.length - 1,
      Math.max(0, Math.round((run - CAT_RUNUP) / pr.dt)));
    const [s2, h, th] = pr.rows[i];
    along = CAT_A + s2;
    y = h;
    // Nose up: she is climbing away off the end of the girder.
    pitch = th;
  } else {
    deck.airborne = true;
    deck.gone = true;
    c.plane.visible = false;
    return;
  }
  c.car.position.z = Math.min(CAT_A + CAT_STROKE, along);
  // Past the end of the girder there is no trolley under her: she carries on
  // along the line of the track on her own.
  c.plane.position.set(0, 0.33 + y,
    Math.max(0, along - (CAT_A + CAT_STROKE)));
  c.plane.rotation.set(pitch, 0, 0);
  c.plane.visible = true;
  if (c.prop) c.prop.rotation.z += turning * 0.05;
}

export function buildHipper() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  barbettes(g);
  // Her insides, fitted to her own lines, and the weld split one buffer per
  // compartment so a compartment blown out of her can have its plating taken
  // off and you can see them. See interior.js.
  buildInterior(g, { loa: LOA, shellAt, keelY, sheer, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  // And inside every part of her that moves -- after her batteries are on her,
  // because they are put on after the hull is welded and a weld run before
  // them finds nothing to do. A mounting is welded in its own frame, so it
  // goes on training and elevating exactly as it did and costs two draw calls
  // instead of a hundred and nineteen. See mergeMoving.
  mergeMoving(g);
  g.userData.classId = 'hipper';

  // Her catapult, and the handful of calls the scene works it with. She flies
  // her Arados off it the same way the Cleveland flies her Kingfishers: the
  // simulation says when, and the ship knows what a launch looks like.
  const deck = {
    cat: g.userData.catapult, live: null, launchAt: null, airborne: false,
    gone: false, plane: null, flightId: 0, pending: [], endMatrix: null,
    // Paced to her own launch, not the carrier's. Both ships used to take the
    // carrier's twenty-four-second deck cycle, so the simulation put a scout
    // on the plot fifteen seconds before the model left the girder.
    aero: 'arado', run: CLS.planes ? CLS.planes.deckRun : DECK_RUN,
    profile: catapultProfile(AERO.arado, CAT_STROKE),
  };
  g.userData.deck = deck;
  g.userData.deckPlane = g.userData.catapult ? g.userData.catapult.plane : null;
  g.userData.step = (t) => stepCatapult(deck, t);
  g.userData.launch = (t) => {
    deck.launchAt = t;
    deck.airborne = false;
    deck.gone = false;
    if (deck.cat) deck.cat.plane.visible = true;
  };
  // She has no hangar lift and no arrester wire: a floatplane alights
  // alongside and is fished out by the crane and put back on her trolley, so
  // being recovered and being struck below are the same evolution.
  g.userData.recover = () => {
    deck.airborne = false;
    deck.launchAt = null;
    deck.gone = false;
    if (!deck.cat) return;
    if (deck.cat.plane.parent !== deck.cat.car) deck.cat.car.add(deck.cat.plane);
    deck.cat.plane.position.set(0, 0.33, 0);
    deck.cat.plane.rotation.set(0, 0, 0);
    deck.cat.plane.visible = true;
    deck.cat.car.position.z = CAT_A;
    deck.cat.cat.rotation.y = 0;
  };
  g.userData.stow = g.userData.recover;
  // Where she comes back to: her own trolley, out on the end of the girder.
  g.userData.landingSpot = [S * 9, sdeck(CAT_Z) + 2.4, CAT_Z];

  // Steel where she is plated and planking where she is decked: the maps go
  // on after the weld, when she is a handful of meshes rather than a few
  // hundred, and the weld is what gave her the coordinates to put them on.
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
    deckPlane: g.userData.deckPlane,
  };
}

/**
 * Every piece of her and where it sits, for the tests.
 *
 * `moving` marks anything under a group the welder was told to leave alone --
 * a gun mounting, a training bank of tubes -- so a check can tell a mounting
 * that swings out over the side from a locker bolted to the deck.
 */
export function hipperParts() {
  const parts = [];
  const builders = [...STATIC, ['barbettes', barbettes], ['mainBattery', mainBattery],
    ['mountings', mountings]];
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

export { sheer, shellAt, zAt, sdeck, sHalf };
