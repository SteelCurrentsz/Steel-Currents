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
  planHouse, ladder,
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

function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.46) z += smooth((t - 0.46) / 0.54) * (stemAt(y) - STEM);
  else if (t < -0.80) z -= smooth((-t - 0.80) / 0.20) * (counterAt(y) - COUNTER);
  return z;
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
const STATIONS = 116;

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
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const N = 14;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = shellAt(t, y);
      const z = zAt(t, y);
      pos.push(-w, y, z, w, y, z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      if (out > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
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
      pos.push(u * w, sh + crown, z);
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
      const h = 0.55 + smooth((z - Z0) / (Z1 - Z0)) * 0.75;
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
}

/** Three shafts, their brackets, three screws and twin rudders. */
function sternGear(g) {
  // She is a three-shaft ship: one on the centreline and one on each wing.
  for (const [sx, sz, len] of [[0, -78, 16], [S * 5.2, -72, 21], [-S * 5.2, -72, 21]]) {
    const y = keelY(sz / (LOA / 2)) + 1.5;
    tubeZ(g, M.steelDark, 0.42, len, sx, y, sz, 10);
    // The A-bracket carrying the wing shafts, and the boss on the centreline.
    if (sx !== 0) {
      for (const lean of [-0.7, 0.7]) {
        const arm = cyl(g, M.steelDark, 0.28, 0.28, 3.4, sx, y + 1.5, sz - len / 2 + 2.2, 8);
        arm.rotation.z = lean;
      }
    }
    // The screw itself: a boss and three broad blades.
    const hub = new THREE.Group();
    hub.position.set(sx, y, sz - len / 2 - 0.4);
    hub.userData.dynamic = true;
    // The wing screws turn outward and the centre one is right-handed, which
    // is how a three-shaft German cruiser was arranged.
    hub.userData.screw = { hand: sx === 0 ? 1 : Math.sign(sx) };
    g.add(hub);
    cyl(hub, M.brass, 0.5, 0.66, 1.1, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Group();
      bl.rotation.z = (i / 3) * Math.PI * 2;
      hub.add(bl);
      const blade = box(bl, M.brass, 1.15, 2.5, 0.20, 0, 1.6, 0);
      blade.rotation.y = 0.42;
    }
  }
  // Twin rudders, abaft the wing shafts, hung on their stocks.
  for (const sgn of [-1, 1]) {
    const rz = -88;
    const y = keelY(rz / (LOA / 2)) + 2.6;
    const r = box(g, M.steelDark, 0.34, 5.0, 3.6, sgn * 3.4, y, rz);
    r.rotation.y = sgn * 0.02;
    cyl(g, M.steelDark, 0.30, 0.30, 2.0, sgn * 3.4, y + 3.2, rz + 0.7, 8);
  }
}

/** The whole shell: three strakes, both ends capped, the deck over the top. */
function hull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  capEnd(g, 1, 1);
  capEnd(g, -1, -1);
  weatherDeck(g);
  knuckleAndBulwark(g);
  sternGear(g);
  // The transom itself: a flat plate, which is what a transom is, rather than
  // the pinched point the cap alone would leave.
  const t = -1;
  const sh = sheer(t);
  const w = shellAt(t, sh);
  box(g, M.hull, w * 2, 0.5, 0.4, 0, sh - 0.25, zAt(t, sh) - 0.1);
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
    const bag = cyl(guns, M.canvas, 0.48, 0.8, 1.5, bx, 0.14, 1.05, 14);
    bag.rotation.x = Math.PI / 2;
    // The jacket, then four and a quarter metres of taper, then the chase and
    // the swell at the muzzle.
    tubeZ(guns, M.gunDark, 0.345, 1.7, bx, 0.14, 2.4, 14);
    cyl(guns, M.gunDark, 0.25, 0.345, 4.2, bx, 0.14, 5.35, 14)
      .rotation.x = -Math.PI / 2;
    tubeZ(guns, M.gunDark, 0.25, 1.9, bx, 0.14, 8.35, 14);
    tubeZ(guns, M.gunDark, 0.285, 0.44, bx, 0.14, 9.4, 14);
    cyl(guns, M.cave, 0.16, 0.16, 0.34, bx, 0.14, 9.5, 12)
      .rotation.x = Math.PI / 2;
  }
  // Where the two bores come out, in the cradle's own frame: the same numbers
  // that put the muzzle swell there, a hand's breadth further out.
  arm(mount, guns, [[-1.08, 0.14, 9.7], [1.08, 0.14, 9.7]]);
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
  cyl(m, M.steelDark, 0.42, 0.56, 0.7, 0, 0.35, 0, 12);
  const cradle = new THREE.Group();
  cradle.position.set(0, 0.85, 0);
  m.add(cradle);
  box(cradle, M.gunDark, 0.75, 0.4, 0.5, 0, 0.05, -0.1);
  // The shield: a low plate with the notches the barrels come through.
  const shield = box(cradle, M.gun, 1.15, 0.62, 0.1, 0, 0.28, 0.42);
  shield.rotation.x = -0.14;
  const guns = new THREE.Group();
  guns.rotation.x = -0.42;
  cradle.add(guns);
  const spots = quad ? [[-0.22, 0.1], [0.22, 0.1], [-0.22, 0.42], [0.22, 0.42]] : [[0, 0.2]];
  for (const [bx, by] of spots) {
    tubeZ(guns, M.gunDark, 0.045, 1.5, bx, by, 0.85, 6);
    // The drum magazine standing up beside each barrel.
    cyl(guns, M.gunDark, 0.13, 0.13, 0.12, bx, by + 0.2, 0.2, 8);
  }
  m.userData.trainRate = quad ? 2.1 : 2.8;   // the Vierling, and the single
  arm(m, guns, spots.map(([bx, by]) => [bx, by, 1.62]));
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
// out along the girder; she is off the end of it in about seventy feet.
const CAT_A = -8.0;             // the trolley at rest, inboard end of the track
const CAT_STROKE = 20.0;        // and how much track she has to be thrown down
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
  [4, 7.0], [16, 6.8], [28, 6.4], [36, 5.6], [41, 4.4],
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

  // -- 0. the bridge block, and the conning tower inside it ------------------
  // Her decks, off her own profile: the boat deck at ten and a half metres,
  // then twelve seven, fourteen six, and the bridge roof at seventeen. Built
  // to three-metre decks the bridge roof stood at nineteen and a half and
  // carried the tower and the foretop up with it.
  const D1 = 2.2;               // boat deck to the deck over it
  const D2 = 4.1;
  const D3 = 6.5;               // and the bridge roof
  const p0 = at(planHouse({ hw: 6.4, zBack: BRIDGE[0] - zc, zFront: BRIDGE[1] - zc - 2, nose: 5.4, arc: 11 }));
  loftShape(g, M.steel, [{ pts: p0, y: foot }, { pts: p0, y: foot + D1 }]);
  box(g, M.deckSteel, 12.6, 0.16, 24.0, 0, foot + D1 + 0.05, zc - 1);
  // Doors and portholes down both sides of it, and the ladders up to the deck
  // above at the after corners.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.12, 1.9, 0.85, sgn * 6.42, foot + 0.95, zc - 6);
    box(g, M.steelDark, 0.12, 1.9, 0.85, sgn * 6.42, foot + 0.95, zc + 4);
    for (const pz of [-8, -4, 0, 4, 8]) {
      cyl(g, M.cave, 0.17, 0.17, 0.1, sgn * 6.44, foot + 1.9, zc + pz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.06, sgn * 6.44, foot + 1.9, zc + pz, 10)
        .rotation.z = Math.PI / 2;
    }
    ladder(g, M.steelDark, sgn * 5.4, foot, foot + D1, zc - 9.5, zc - 7.6);
    // The 10.5 cm director on its pedestal: a stabilised drum with the
    // rangefinder through it, which is what lays her heavy flak.
    const dir = new THREE.Group();
    dir.position.set(sgn * 5.9, foot + D1 + 0.15, zc + 1.5);
    dir.userData.dynamic = true;
    g.add(dir);
    cyl(dir, M.steelDark, 0.8, 0.95, 1.1, 0, 0.55, 0, 14);
    loftRings(dir, M.gun, [[1.25, 1.15, 0, 1.1], [1.25, 1.15, 0, 2.4], [1.05, 0.95, 0, 2.8]],
      { n: 14, px: 0.74, pz: 0.72 });
    tubeX(dir, M.gun, 0.22, 3.6, 0, 2.0, 0.2, 10);
    for (const e of [-1, 1]) box(dir, M.glass, 0.08, 0.2, 0.3, e * 1.85, 2.02, 0.2);
  }
  // The armoured conning tower, standing through the block: thick plate, a
  // vision slit all the way round, and the tube down to the transmitting
  // station under it.
  loftRings(g, M.steelDark, [
    [2.6, 2.8, zc + 3.0, foot],
    [2.6, 2.8, zc + 3.0, foot + 2.2],
    [2.4, 2.6, zc + 3.0, foot + 3.4],
  ], { n: 16, px: 0.8, pz: 0.8 });
  loftRings(g, M.cave, [
    [2.63, 2.83, zc + 3.0, foot + 2.35],
    [2.63, 2.83, zc + 3.0, foot + 2.72],
  ], { n: 16, px: 0.8, pz: 0.8, cap: false });

  // -- 1. the admiral's bridge ----------------------------------------------
  // Back to the tower, not stopping short of it. Her bridge is one mass with
  // her tower: the decks step out forward of it and wrap round its foot, and
  // the tower rises through them. Built as a separate box five metres forward
  // there was a hole between the two, and from abeam she had no bridge at all
  // -- only a windowed hut and a smooth cylinder behind it.
  const p1 = at(planHouse({ hw: 5.6, zBack: TOWER_Z - zc - 3.0, zFront: 12.4, nose: 4.8, arc: 11 }));
  loftShape(g, M.steel, [{ pts: p1, y: foot + D1 + 0.2 }, { pts: p1, y: foot + D2 }]);
  box(g, M.deckSteel, 14.4, 0.16, 25.0, 0, foot + D2 + 0.05, zc + 0.5);
  // Her window band, carried round the bullnose in one run.
  windowBand(g, p1, foot + D1 + 0.85, 1.05);
  // A rail right round the open part of this deck, with the mattresses lashed
  // along its forward half: an admiral's bridge is a place people stand.
  planRail(g, grow(p1, 0.2), foot + D2 + 0.06, 0.06, 0.62);
  mattresses(g, grow(p1, 0.28), foot + D2 + 0.06, 0.10, 0.58, 13);

  // The wings, and what stands on them: a pelorus, a signal lamp, and the
  // splinter mattresses lashed to the rail.
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 2.6, 0.14, 4.4, sgn * 6.6, foot + D2 + 0.05, zc + 7.5);
    cyl(g, M.brass, 0.16, 0.16, 1.0, sgn * 6.9, foot + D2 + 0.6, zc + 7.9, 10);
    cyl(g, M.gun, 0.3, 0.3, 0.28, sgn * 6.9, foot + D2 + 1.15, zc + 7.9, 12);
    searchlight(g, sgn * 6.4, foot + D2 + 0.15, zc + 5.9, sgn * 1.4);
    railRing(g, sgn * 6.6, foot + D2 + 0.1, zc + 7.5, 1.3, 2.2);
    for (const mz of [zc + 6.1, zc + 7.5, zc + 8.9]) {
      box(g, M.canvas, 0.22, 0.62, 1.1, sgn * 7.7, foot + D2 + 0.5, mz);
    }
    // Voice pipes down the after face of her, and the flag locker.
    cyl(g, M.brass, 0.075, 0.075, 2.0, sgn * 3.4, foot + D1 + 1.0, zc - 1.9);
    box(g, M.steelDark, 1.5, 0.75, 0.6, sgn * 3.6, foot + D2 + 0.45, zc - 1.7);
    ladder(g, M.steelDark, sgn * 4.6, foot + D1 + 0.2, foot + D2, zc - 2.7, zc - 1.0);
  }

  // -- 2. the navigating bridge and the chart house --------------------------
  const p2 = at(planHouse({ hw: 4.6, zBack: TOWER_Z - zc - 2.4, zFront: 11.0, nose: 4.0, arc: 10 }));
  loftShape(g, M.steel, [{ pts: p2, y: foot + D2 + 0.2 }, { pts: p2, y: foot + D3 }]);
  windowBand(g, p2, foot + D2 + 0.85, 0.95);
  box(g, M.deckSteel, 10.4, 0.16, 20.0, 0, foot + D3 + 0.05, zc + 2.0);
  // And round the navigating bridge over it, likewise.
  planRail(g, grow(p2, 0.2), foot + D3 + 0.1, 0.08, 0.60);
  mattresses(g, grow(p2, 0.28), foot + D3 + 0.1, 0.12, 0.56, 11);
  // The chart house abaft it, with its own door and skylight.
  house(g, M.steel, 3.1, zc - 1.0, zc + 3.5, foot + D2 + 0.2, 2.1, { n: 16 });
  box(g, M.steelDark, 0.1, 1.8, 0.8, 3.15, foot + D2 + 1.1, zc + 1.2);
  box(g, M.glass, 1.6, 0.1, 2.0, 0, foot + D3 - 0.2, zc + 1.2);
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * 3.6, foot + D2 + 0.2, foot + D3, zc - 2.0, zc - 0.6);
  }

  // -- 2b. the compass platform ---------------------------------------------
  //
  // The open deck over the navigating bridge: the bridge a captain actually
  // cons and fights her from. Open, not another house -- her drawing puts the
  // bridge roof at seventeen metres and there is nothing above it but the
  // tower, so what goes here is a rail, a pelorus and the wings running out
  // toward her side.
  {
    railRing(g, 0, foot + D3 + 0.1, zc + 5.0, 4.4, 6.0);
    cyl(g, M.brass, 0.16, 0.16, 1.1, 0, foot + D3 + 0.6, zc + 6.4, 10);
    cyl(g, M.gun, 0.3, 0.3, 0.26, 0, foot + D3 + 1.2, zc + 6.4, 12);
    for (const sgn of [-1, 1]) {
      // The bridge wings: out toward the side, with the signal lamp on each.
      box(g, M.deckSteel, 2.8, 0.14, 3.6, sgn * 5.6, foot + D3 + 0.05, zc + 4.0);
      railRing(g, sgn * 5.6, foot + D3 + 0.1, zc + 4.0, 1.4, 1.8);
      cyl(g, M.steel, 0.24, 0.24, 0.9, sgn * 6.0, foot + D3 + 0.5, zc + 4.4, 10);
      cyl(g, M.glass, 0.3, 0.3, 0.3, sgn * 6.0, foot + D3 + 1.05, zc + 4.4, 12);
      const knee = box(g, M.steel, 2.6, 0.12, 1.4, sgn * 5.4, foot + D3 - 0.6, zc + 4.0);
      knee.rotation.z = sgn * 0.42;
    }
  }

  // -- 3. the trunk, and the lights round it --------------------------------
  //
  // Stepped on its own station, not on the middle of the block. Her tower
  // stands abaft the bridge, over the conning tower, and the bridge decks
  // step down forward of it -- which is why the foretop is nearly amidships
  // of the forward superstructure rather than out over the bridge front.
  // Built on the middle of the block the whole fighting top -- foretop,
  // rangefinder, mast and all -- stood fourteen metres too far forward.
  const tz = TOWER_Z;
  loftRings(g, M.steel, [
    [3.6, 3.9, tz, foot + D1],
    [3.3, 3.6, tz, foot + 9.0],
    [3.0, 3.2, tz, foot + 13.5],
    [2.6, 2.8, tz, foot + 17.5],
  ], { n: 18, px: 0.78, pz: 0.78 });
  // A door into it and the ladder up its after face, in a cage.
  box(g, M.steelDark, 1.0, 1.9, 0.1, 0, foot + 8.0, tz - 3.5);
  ladder(g, M.steelDark, 0, foot + D1, foot + 17.5, tz - 3.4, tz - 3.4);
  for (let i = 0; i < 9; i++) {
    const y = foot + 8.0 + i * 0.95;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 10), M.steelDark);
    hoop.position.set(0, y, tz - 3.75);
    hoop.rotation.x = Math.PI / 2;
    g.add(hoop);
  }
  // The searchlight platform out of the face of the tower, which on her is a
  // wide gallery rather than two brackets: thirteen metres up, and the widest
  // thing on the tower between the bridge roof and the foretop.
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 4.2, 0.16, 3.2, sgn * 3.6, foot + 13.0, tz + 1.2);
    railRing(g, sgn * 3.6, foot + 13.05, tz + 1.2, 2.1, 1.7);
    searchlight(g, sgn * 4.4, foot + 13.15, tz + 1.2, sgn * 1.3);
    const br = box(g, M.steel, 2.6, 0.12, 1.2, sgn * 3.6, foot + 12.4, tz + 1.2);
    br.rotation.z = sgn * 0.5;
  }

  // -- 4. the foretop ---------------------------------------------------------
  box(g, M.deckSteel, 8.4, 0.16, 7.0, 0, foot + 17.5, tz);
  railRing(g, 0, foot + 17.55, tz, 4.1, 3.4);
  loftRings(g, M.steel, [
    [3.5, 3.0, tz, foot + 17.6],
    [3.5, 3.0, tz, foot + 20.0],
  ], { n: 18, px: 0.72, pz: 0.7 });
  // The fire-control position's own vision slits, fore and aft.
  for (const zz of [tz + 2.6, tz - 2.6]) {
    box(g, M.glass, 6.2, 0.7, 0.16, 0, foot + 19.0, zz);
    box(g, M.steel, 6.35, 0.1, 0.2, 0, foot + 19.5, zz);
  }
  // The hood, which trains: a squat drum with the seven-metre rangefinder out
  // of it either side, and the sighting hoods on top.
  const top = new THREE.Group();
  top.position.set(0, foot + 20.1, tz);
  top.userData.dynamic = true;
  g.add(top);
  loftRings(top, M.gun, [[2.5, 2.1, 0, 0], [2.5, 2.1, 0, 1.5], [2.1, 1.8, 0, 2.0]],
    { n: 18, px: 0.7, pz: 0.68 });
  tubeX(top, M.gun, 0.36, 7.2, 0, 1.0, 0.4, 12);
  for (const sgn of [-1, 1]) {
    // The end hood over each object glass, standing clear of the cupola: it is
    // the pair of them a mile apart that tells you the base is seven metres
    // and not four.
    box(top, M.gun, 0.72, 0.78, 0.95, sgn * 3.35, 1.0, 0.4);
    box(top, M.gunDark, 0.16, 0.4, 0.56, sgn * 3.72, 1.02, 0.4);
    box(top, M.glass, 0.06, 0.3, 0.42, sgn * 3.80, 1.02, 0.4);
    cyl(top, M.gun, 0.26, 0.3, 0.34, sgn * 1.0, 2.1, 0.2, 10);
  }
  // Her radar: the FuMO 27 mattress on the face of the hood, and it trains with
  // it. Six metres by two, carried on a frame bolted to the front of the
  // cupola and standing only a little proud of it -- a board of that size held
  // out on its own in front of a fire-control top is a billboard, and hers was
  // part of the structure.
  const frame = new THREE.Group();
  frame.position.set(0, 1.85, 1.75);
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

  // The pole mast abaft the tower, stepped on the admiral's bridge roof, with
  // her yards and the wireless aerials off it.
  const mz = MAST_Z;
  const mFoot = foot;
  cyl(g, M.steel, 0.26, 0.46, 21.0, 0, mFoot + 10.5, mz, 10);
  cyl(g, M.steel, 0.13, 0.22, 10.6, 0, mFoot + 24.5, mz, 8);
  for (const [yy, half] of [[mFoot + 14.4, 5.4], [mFoot + 22.6, 3.2]]) {
    tubeX(g, M.steel, 0.11, half * 2, 0, yy, mz, 8);
    // The lifts and halyards hanging off each yardarm.
    for (const sgn of [-1, 1]) {
      box(g, M.wire, 0.04, 1.4, 0.04, sgn * half * 0.9, yy - 0.7, mz);
    }
  }
  // The starfish that carries the after control position's aerials.
  for (const sgn of [-1, 1]) {
    const arm = box(g, M.steel, 2.6, 0.1, 0.1, sgn * 1.3, mFoot + 18.0, mz);
    arm.rotation.z = sgn * 0.22;
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
  // Ten metres of trunk, oval in section, which puts the top of her at
  // twenty-five metres over the water -- seven below the foretop, which is the
  // whole reason the cap was fitted. Drawn at its own height rather than built
  // to eleven and squashed: a squashed funnel is a squashed oval, and hers is
  // a tall one.
  //
  // And upright. She used to be raked eight degrees aft, which is a
  // destroyer's funnel and not hers: on her own profile both sides of the
  // trunk are plumb from the casing to the mouth, and everything that is
  // angled about her funnel is in the mouth and the cap on top of it.
  //
  // Nearly parallel, not a cone. On her profile the trunk narrows by about a
  // twelfth over its whole height -- her funnel is a great oval box standing
  // on the casing, and drawn with a proper taper on it she came out with a
  // lighthouse amidships instead.
  loftRings(f, M.steel, [
    [3.80, 4.95, 0, 0],
    [3.70, 4.82, 0, 3.6],
    [3.58, 4.66, 0, 7.2],
    [3.48, 4.53, 0, 10.1],
  ], { n: 24, px: 0.84, pz: 0.84, cap: false });

  // -- the mouth and the cap ------------------------------------------------
  //
  // Hers is not a hat standing over the funnel on four legs with the sky
  // showing under it. The Kappe fitted in 1940 is part of the funnel: the
  // trunk is carried up on a rake, higher forward than aft, and the cap is
  // built on to the top of it as a band round the mouth -- so what she throws
  // her smoke out of is a raked oval opening, and from abeam the funnel and
  // its cap are one piece of plating from the casing to the rim.
  //
  // Built as a lid on struts, its forward edge stood the better part of a
  // metre clear of the mouth with daylight straight through the top of her
  // funnel, which is neither what she carried nor what a smoke cap is.
  const RAKE = 0.245;
  const RTAN = Math.tan(RAKE);
  // The trunk carried up on the rake to the mouth.
  rakedBand(f, M.steel, [
    [3.48, 4.53, 10.1, 0],
    [3.42, 4.46, 12.20, RTAN],
  ]);
  // The cap: a band standing proud all round the top of it, its own lower edge
  // cut on the same rake. This is the piece you see from a mile off.
  rakedBand(f, M.steel, [
    [3.56, 4.63, 11.05, RTAN],
    [3.66, 4.76, 11.35, RTAN],
    [3.66, 4.76, 12.20, RTAN],
  ]);
  // The rim rolling over into the mouth, and the black of the uptakes in it.
  rakedBand(f, M.steel, [
    [3.66, 4.76, 12.20, RTAN],
    [3.30, 4.30, 12.14, RTAN],
  ]);
  rakedBand(f, M.gunDark, [
    [3.30, 4.30, 12.14, RTAN],
    [3.16, 4.11, 11.55, RTAN],
  ]);
  rakedBand(f, M.cave, [
    [3.16, 4.11, 11.50, RTAN],
    [3.10, 4.03, 11.05, RTAN],
  ], { cap: true });
  // The uptake trunks standing inside the mouth: three fire rooms, three
  // trunks, and you can see the tops of them down the funnel.
  for (const uz of [-1.8, 0, 1.8]) {
    loftRings(f, M.gunDark, [[1.05, 0.75, uz, 9.4], [1.05, 0.75, uz, 11.2 + RTAN * uz]],
      { n: 12, px: 0.8, pz: 0.8 });
  }
  // The bands round her, which is how a funnel is stiffened.
  for (const by of [1.8, 5.4, 8.9]) {
    const k = 1 - by * 0.009;
    loftRings(f, M.steelDark, [
      [3.82 * k, 4.97 * k, 0, by - 0.11],
      [3.90 * k, 5.07 * k, 0, by],
      [3.82 * k, 4.97 * k, 0, by + 0.11],
    ], { n: 24, px: 0.84, pz: 0.84, cap: false });
  }
  // The steam pipes up her after face, the siren, and the ladder in its cage.
  for (const sgn of [-1, 1]) {
    cyl(f, M.steelDark, 0.16, 0.16, 11.0, sgn * 1.6, 5.8, -4.0, 8);
    cyl(f, M.steelDark, 0.2, 0.2, 0.4, sgn * 1.6, 11.4, -4.0, 8);
  }
  cyl(f, M.brass, 0.2, 0.2, 0.7, 0, 9.0, -4.1, 10);
  box(f, M.steelDark, 0.9, 0.5, 0.5, 0, 8.6, -4.2);
  ladder(f, M.steelDark, 0.95, 0.6, 11.0, -4.1, -3.9);
  for (let i = 0; i < 8; i++) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 5, 10), M.steelDark);
    hoop.position.set(0.95, 1.4 + i * 1.2, -4.35);
    hoop.rotation.x = Math.PI / 2;
    f.add(hoop);
  }
  // The grab rails round her, the rungs everybody paints over.
  for (let i = 0; i < 7; i++) {
    box(f, M.steelDark, 0.5, 0.05, 0.05, 3.3, 1.3 + i * 1.2, 0);
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
  const N = opts.n || 24;
  const px = opts.px === undefined ? 0.84 : opts.px;
  const pz = opts.pz === undefined ? 0.84 : opts.pz;
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
    // A cutter: thwarts under a canvas cover, which is how she is stowed.
    box(hull, M.canvas, len * 0.24, 0.12, len * 0.82, 0, 0.5, -0.1);
    for (const tz of [-len * 0.24, 0, len * 0.24]) {
      box(hull, M.steelDark, len * 0.24, 0.06, 0.1, 0, 0.42, tz);
    }
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
  // The hangar: a house with a big roller door in its after face. Between the
  // funnel and the catapult, which is where her drawing puts it -- thirteen
  // metres over the water and a hundred and five abaft the stem.
  house(g, M.steel, 6.2, HANGAR[0], HANGAR[1], foot, 2.5);
  box(g, M.steelDark, 7.0, 2.1, 0.2, 0, foot + 1.15, HANGAR[0] - 0.05);
  for (let i = 0; i < 4; i++) {
    box(g, M.steel, 6.6, 0.08, 0.24, 0, foot + 0.5 + i * 0.5, HANGAR[0] - 0.14);
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
  box(girder, M.steel, 1.9, 0.75, 22.0, 0, 0, 0);
  box(girder, M.steelDark, 2.3, 0.16, 22.0, 0, 0.44, 0);
  for (let i = -4; i <= 4; i++) {
    box(girder, M.steelDark, 2.1, 0.5, 0.16, 0, -0.15, i * 2.4);
  }
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
    arado(g, sgn * 5.6, foot + 0.35, HANGAR[0] - 6.0, sgn * 0.25, true);
    // The dolly she is chocked on and the tracks it runs on into the hangar.
    box(g, M.steelDark, 2.6, 0.3, 1.1, sgn * 5.6, foot + 0.18, HANGAR[0] - 6.0);
    for (const tx of [-1.0, 1.0]) {
      box(g, M.gunDark, 0.14, 0.1, 9.0, sgn * 5.6 + tx, foot + 0.05, HANGAR[0] - 3.4);
    }
    // The trestle her tail sits on, and the tie-down rings.
    box(g, M.steelDark, 0.7, 0.5, 0.5, sgn * 5.6, foot + 0.25, HANGAR[0] - 9.6);
    for (const rz of [HANGAR[0] - 8.4, HANGAR[0] - 3.6]) {
      for (const tx of [-1.5, 1.5]) {
        cyl(g, M.gunDark, 0.11, 0.11, 0.1, sgn * 5.6 + tx, foot + 0.06, rz, 8);
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
  // metres of lattice jib on a king post, with the winch house at its foot.
  // What was here was a pedestal at six and a half metres of half-breadth,
  // which is inside her deckhouse: the whole crane was built inside the
  // casing and nothing of it showed.
  const CRANE_Z = 1.0;
  const crane = new THREE.Group();
  crane.position.set(S * (lowHalf(CRANE_Z) + 0.9), sdeck(CRANE_Z), CRANE_Z);
  // Stowed trained aft and lowered, the way a crane is carried at sea: the jib
  // lies down the deck over the hangar rather than standing up in the wind.
  crane.rotation.y = Math.PI * 0.97;
  g.add(crane);
  // The winch house at the foot of it, and the roller path it slews on.
  box(crane, M.steel, 2.6, 1.9, 3.0, 0, 0.95, -0.9);
  box(crane, M.steelDark, 2.7, 0.14, 3.1, 0, 1.95, -0.9);
  box(crane, M.glass, 0.9, 0.5, 0.06, 0, 1.35, 0.62);
  cyl(crane, M.steelDark, 1.35, 1.5, 0.35, 0, 0.18, 0, 16);
  // The king post: a four-legged lattice tower the jib is stepped in.
  const post = new THREE.Group();
  post.position.y = 1.95;
  crane.add(post);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = box(post, M.steel, 0.16, 4.2, 0.16, sx * 0.72, 2.1, sz * 0.72);
    leg.rotation.z = -sx * 0.05;
    leg.rotation.x = sz * 0.05;
  }
  for (const yy of [0.7, 2.1, 3.5]) {
    for (const sgn of [-1, 1]) {
      box(post, M.steel, 1.6, 0.09, 0.09, 0, yy, sgn * 0.72);
      box(post, M.steel, 0.09, 0.09, 1.6, sgn * 0.72, yy, 0);
    }
    const br = box(post, M.steel, 2.1, 0.07, 0.07, 0, yy + 0.7, 0.72);
    br.rotation.z = 0.7;
  }
  box(post, M.steelDark, 1.8, 0.2, 1.8, 0, 4.25, 0);

  // The jib: two lattice girders converging on the head, with the cross
  // bracing between them and the sheave block on the end.
  const jib = new THREE.Group();
  jib.position.set(0, 4.3, 0);
  jib.rotation.x = 0.30;
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
  box(jib, M.wire, 0.04, 3.2, 0.04, 0, -1.7, JIB + 0.5);
  box(jib, M.gunDark, 0.3, 0.55, 0.3, 0, -3.5, JIB + 0.5);
  // And the topping lift, from the head of the post to the head of the jib.
  const lift = box(post, M.wire, 0.04, 0.04, JIB * 0.96, 0, 5.9, JIB * 0.48);
  lift.rotation.x = -0.20;
}


// ------------------------------------------------------------ the after end --

/** The after control position: a short tower with its own director on top. */
function afterTower(g) {
  const foot = sdeck(-37);
  // The block, roofed at fourteen metres eight -- her own profile -- rather
  // than at whatever three metres of deckhouse came to.
  house(g, M.steel, 5.0, AFT_TOWER[0], AFT_TOWER[1], foot, 4.3);
  const zc = (AFT_TOWER[0] + AFT_TOWER[1]) / 2 + 3.0;
  loftRings(g, M.steel, [
    [3.2, 3.4, zc, foot + 4.4],
    [3.0, 3.2, zc, foot + 5.1],
  ], { n: 16, px: 0.72, pz: 0.7 });
  box(g, M.deckSteel, 7.4, 0.16, 8.0, 0, foot + 5.15, zc);
  railRing(g, 0, foot + 5.2, zc, 3.6, 3.9);

  // The mainmast: a pole stepped abaft the catapult, raked with the funnel,
  // carrying the after yard and the wireless aerials forward to the foretop.
  // Her truck stands forty metres and a half over the water -- the highest
  // thing in the ship after the foremast, and it was a seventeen-metre stub
  // behind the funnel before.
  {
    const mFoot = sdeck(MAIN_MAST_Z);
    // One pole, upright, in one line. The topmast used to be raked and stepped
    // nearly a metre abaft the lower mast, so from abeam she carried two masts
    // that did not meet -- a stick leaning out of the top of another stick.
    cyl(g, M.steel, 0.32, 0.48, 20.0, 0, mFoot + 10.0, MAIN_MAST_Z, 10);
    cyl(g, M.steel, 0.16, 0.30, 11.5, 0, mFoot + 24.6, MAIN_MAST_Z, 8);
    for (const [yy, half] of [[mFoot + 13.6, 4.6], [mFoot + 22.0, 2.6]]) {
      tubeX(g, M.steel, 0.10, half * 2, 0, yy, MAIN_MAST_Z, 8);
      for (const sgn of [-1, 1]) {
        box(g, M.wire, 0.04, 1.2, 0.04, sgn * half * 0.9, yy - 0.6, MAIN_MAST_Z);
      }
    }
    // The starfish and the shrouds that stay a pole this tall.
    for (const sgn of [-1, 1]) {
      const sh = box(g, M.wire, 0.05, 13.0, 0.05, sgn * 2.0, mFoot + 6.5, MAIN_MAST_Z - 1.0);
      sh.rotation.z = sgn * 0.30;
      sh.rotation.x = 0.16;
    }
  }

  // The after director, with its own rangefinder through it, and the short
  // pole over it that carries her after aerials.
  const dir = new THREE.Group();
  dir.position.set(0, foot + 5.3, zc);
  dir.userData.dynamic = true;
  g.add(dir);
  cyl(dir, M.steel, 0.24, 0.30, 7.0, 0, 5.4, -0.2, 8);
  tubeX(dir, M.steel, 0.08, 3.2, 0, 7.4, -0.2, 8);
  loftRings(dir, M.gun, [[2.0, 1.8, 0, 0], [2.0, 1.8, 0, 1.4], [1.7, 1.55, 0, 1.9]],
    { n: 16, px: 0.7, pz: 0.68 });
  tubeX(dir, M.gun, 0.3, 6.2, 0, 0.95, 0.3, 12);
  for (const sgn of [-1, 1]) {
    box(dir, M.gun, 0.5, 0.55, 0.7, sgn * 2.95, 0.95, 0.3);
    box(dir, M.glass, 0.09, 0.24, 0.4, sgn * 3.2, 0.97, 0.3);
  }
  // There is no bandstand over Cäsar. She had none: her after Flakvierling
  // stood on the after superstructure with the rest of the light battery, and
  // a platform carried out over the turret put a metre and a half of nothing
  // above her roof in a silhouette that has nothing there.
  box(g, M.deckSteel, 5.6, 0.18, 4.6, 0, foot + 4.42, AFT_TOWER[0] + 3.0);
  railRing(g, 0, foot + 4.52, AFT_TOWER[0] + 3.0, 2.8, 2.3);
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
  // Capstans and the cable holders on the forecastle.
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.62, 0.7, 0.8, sgn * 3.2, deckAt(80) + 0.4, 80, 12);
    cyl(g, M.gunDark, 0.42, 0.42, 0.6, sgn * 3.2, deckAt(80) + 1.05, 80, 10);
    box(g, M.steelDark, 1.0, 0.5, 1.4, sgn * 5.4, deckAt(74) + 0.25, 74);
  }
  // Bollards down both sides, which is what tells you the scale of a deck.
  for (const z of [86, 70, 34, -14, -44, -70, -84]) {
    for (const sgn of [-1, 1]) {
      const x = sgn * (halfDeck(z) - 0.9);
      for (const dz of [-0.5, 0.5]) {
        cyl(g, M.steelDark, 0.14, 0.16, 0.7, x, deckAt(z) + 0.35, z + dz, 8);
      }
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
  // Carley floats and life rafts stowed against the deckhouse sides -- against
  // them, in racks on the house, not hanging in the air a metre outboard of
  // the deck they are supposed to be on.
  for (const rz of [36, 12, -8, -36]) {
    for (const sgn of [-1, 1]) {
      const r = new THREE.Group();
      r.position.set(sgn * (sHalf(rz) - 0.15), sdeck(rz) + 0.9, rz);
      r.rotation.z = sgn * 0.16;
      g.add(r);
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.2, 7, 14), M.raft);
      t.scale.set(1, 0.62, 1);
      t.rotation.y = Math.PI / 2;
      r.add(t);
    }
  }
  // Her ensign staff aft and the jackstaff forward.
  cyl(g, M.steel, 0.07, 0.1, 4.4, 0, deckAt(-96) + 2.2, -96, 8);
  cyl(g, M.steel, 0.07, 0.1, 3.2, 0, deckAt(96) + 1.6, 96, 8);
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
    // The weather deck, from the break of the forecastle aft to the quarter.
    railRun(g, (t) => {
      const z = 66 - t * 150;
      return [sgn * (halfDeck(z) - 0.35), deckAt(z), z];
    }, 44);
    // And forward of it, round the bow, where the deck narrows fast.
    railRun(g, (t) => {
      const z = 66 + t * 30;
      return [sgn * (halfDeck(z) - 0.35), deckAt(z), z];
    }, 14);
    // The superstructure deck's outboard edge, between the sponsons.
    for (const [z0, z1] of [[38, 26], [22, 4], [-2, -20], [-24, -42]]) {
      railRun(g, (t) => {
        const z = z0 + (z1 - z0) * t;
        return [sgn * (lowHalf(z) + 0.25), sdeck(z), z];
      }, 10);
    }
  }
  // Round the stern, where the two sides meet.
  railRun(g, (t) => {
    const a = -Math.PI / 2 + t * Math.PI;
    const z = -84 - Math.cos(a) * 0;
    return [Math.sin(a) * (halfDeck(-84) - 0.35), deckAt(-84), z];
  }, 10);

  // Ready-use lockers and lifebuoy racks against the house sides, and the
  // hose and wire reels beside them.
  for (const sgn of [-1, 1]) {
    for (const z of [40, 24, 6, -12, -30]) {
      locker(g, sgn * (sHalf(z) - 0.55), sdeck(z), z, 0.85, 0.75, 1.5);
    }
    for (const z of [32, -6, -26]) {
      reel(g, sgn * (sHalf(z) - 0.7), sdeck(z), z, 0.55, sgn * Math.PI / 2);
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
    // Deck lockers and the paravane gear on the forecastle.
    locker(g, sgn * 5.6, deckAt(62), 62, 1.1, 0.6, 2.2);
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
  // Thirty-two metres abaft the stem, where her drawing puts it.
  const bw = box(g, M.steel, 13.0, 1.3, 0.3, 0, deckAt(70) + 0.65, 70);
  bw.rotation.x = -0.22;
  for (const sgn of [-1, 1]) {
    const w = box(g, M.steel, 0.3, 1.3, 4.0, sgn * 6.4, deckAt(68) + 0.65, 68);
    w.rotation.y = sgn * 0.22;
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
