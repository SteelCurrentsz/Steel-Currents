// Admiral Graf Spee, built out of her own lines.
//
// Six hundred and ten feet of Panzerschiff: six twenty-eight centimetre guns
// in two triple turrets, eight single fifteens along her upper deck, diesel
// engines, and a tower foremast with the first seagoing radar set in service
// on top of it. She is the odd ship on this list and she was built to be one
// -- a cruiser hull carrying a battleship's guns, at a range no cruiser can
// answer, on twelve and a half thousand tons.
//
// Three things have to be right or she is not her.
//
// The first is the tower. Deutschland and Scheer carried a light tripod; Graf
// Spee was completed with the heavy armoured tower foremast, and it is the one
// thing that tells the three sisters apart at any distance. It is a broad
// squat block rather than a mast: bridge, chart house, director platforms and
// the big base-length rangefinder stacked on a single trunk, with the FuMO 22
// radar mattress -- a flat rectangular aerial the better part of six metres
// across -- bolted to the front of the rangefinder cupola.
//
// The second is her stem. She never got the Atlantic bow her sisters were
// given in 1940; she went down off Montevideo in December 1939 with the low,
// nearly straight stem she was launched with, and the difference at the bow is
// two metres of freeboard and a deck edge that does not flare.
//
// The third is that both turrets stand on the weather deck. There is no
// superfiring turret on her, because there is no second turret at either end
// to superfire over -- which is why her silhouette is so long and so flat
// between the two of them, and why the tower and the funnel have the whole
// middle of the ship to themselves.
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
  box, cyl, tubeZ, tubeX, sphere, smooth, loftRings, planHouse, ladder,
  fairTable,
} from './shipkit.js';

const CLS = SHIP_CLASSES.spee;
export const LOA = CLS.hull.length;      // 186 m
export const BEAM = CLS.hull.beam;       // 21.6 m
export const DRAFT = CLS.hull.draft;     // 7.4 m
/** Starboard, in this frame. */
const S = -1;

// Kriegsmarine grey, as she was painted for the South Atlantic: a light
// hellgrau on the topsides over a darker hull, and the wood decks in the
// brown-grey deck paint they were holystoned under.
const P = {
  hull: 0x6f7883,
  hullDark: 0x5d666f,
  boot: 0x1d2126,
  antifoul: 0x71352c,
  deck: 0x6a6153,          // planked weather deck
  deckSteel: 0x5b6169,
  deckDark: 0x4b5159,
  steel: 0x7d858f,
  steelDark: 0x636b75,
  bright: 0x9aa2ab,
  gun: 0x6f777f,
  gunDark: 0x3c4249,
  glass: 0x1f252b,
  canvas: 0x6f7267,
  wire: 0x2a3038,
  brass: 0x9a8250,
  cave: 0x14171b,
  raft: 0x3b4046,
  mark: 0xd0ccc0,
  planeTop: 0x5c6a58,      // her Arados: splinter green over pale blue
  planeLow: 0x9fb0bd,
  radar: 0x8d949c,
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
// `t` runs -1 at the transom to +1 at the stem. A Panzerschiff's body plan is
// a cruiser's: a fine entrance, maximum beam a little abaft amidships, a long
// parallel middle body and a broad flat run aft to a transom. She is a
// two-shaft ship -- diesels, which is the whole point of her -- so the run is
// not as wide as a three-shaft cruiser's.

// Half-breadths at the waterline. Extreme beam is 21.6 m at the deck edge; the
// moulded figure at the waterline is a shade over ten and a half.
const HALF_BEAM = [
  [-1.00, 4.10], [-0.94, 5.30], [-0.86, 6.55], [-0.74, 7.95], [-0.60, 9.10],
  [-0.44, 9.92], [-0.26, 10.42], [-0.08, 10.60], [0.10, 10.54], [0.26, 10.24],
  [0.41, 9.48], [0.51, 8.58], [0.61, 7.36], [0.70, 5.80], [0.80, 3.94],
  [0.90, 2.18], [0.95, 1.16], [1.00, 0.14],
];

const KEEL = [
  [-1.00, -2.10], [-0.92, -5.05], [-0.84, -6.55], [-0.70, -7.26], [-0.20, -7.44],
  [0.20, -7.42], [0.52, -7.26], [0.70, -6.62], [0.84, -4.86], [0.93, -2.05],
  [1.00, 1.90],
];

// One deck, flush, stem to transom -- and low. She has no Atlantic bow: the
// forecastle rises about two and a half metres over the last forty, where the
// Hipper's rises four, and that is most of what her critics meant when they
// called her wet forward.
const SHEER = [
  [-1.00, 5.30], [-0.55, 5.28], [0.00, 5.30], [0.30, 5.36], [0.48, 5.50],
  [0.62, 5.76], [0.72, 6.10], [0.80, 6.52], [0.86, 6.96], [0.91, 7.42],
  [0.955, 7.86], [1.00, 8.20],
];

// How far outboard of the waterline the deck edge is carried, in metres.
//
// Modest the whole way. A ship without an Atlantic bow does not have two
// metres of flare at the forecastle: she has a hand's breadth amidships
// opening to about a metre forward, which is why she shipped water over Anton
// in any sort of sea and why her sisters were rebuilt and she was not.
const FLARE = [
  [-1.00, 0.12], [-0.40, 0.18], [0.10, 0.24], [0.31, 0.42], [0.41, 0.60],
  [0.51, 0.80], [0.61, 0.98], [0.70, 1.08], [0.75, 1.10], [0.80, 1.04],
  [0.85, 0.92], [0.90, 0.74], [0.95, 0.46], [1.00, 0.10],
];

const halfBeam = (t) => fairTable(HALF_BEAM, t);
const keelY = (t) => fairTable(KEEL, t);
const sheer = (t) => fairTable(SHEER, t);
const flare = (t) => fairTable(FLARE, t);

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
    const h = Math.min(1, y / Math.max(1, sh));
    half += flare(t) * h * h;
  }
  return Math.max(0.03, half);
}

// Her stem and her counter, as functions of height.
//
// The stem is nearly upright: four metres of rake over her whole freeboard
// against the Hipper's seven, which is what a ship built before anybody had
// been to sea in her looks like. The counter is a cruiser stern with a modest
// overhang over the two screws.
const STEM = 4.2;
const COUNTER = 3.1;
function stemAt(y) {
  return STEM * Math.pow(Math.min(1, Math.max(0, y + 7.6) / 15.8), 1.22);
}
function counterAt(y) {
  return COUNTER * Math.pow(Math.min(1, Math.max(0, y + 1.9) / 7.2), 1.5);
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
  return sheer(t) + 0.28;
}

/** And how far outboard the deck edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return shellAt(t, sheer(t));
}

// ------------------------------------------------------------------ hull --

const BOOT_LO = -2.2;
const BOOT_HI = 0.55;
const STATIONS = 112;

function strakeBands() {
  return [
    [(t) => keelY(t) - 0.02, BOOT_LO, M.antifoul],
    [BOOT_LO, BOOT_HI, M.boot],
    [BOOT_HI, sheer, M.hull],
  ];
}

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

/** The flat that closes her in at one end, cut to her own section there. */
function cap(g, t, facing) {
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const pos = [];
    const idx = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = shellAt(t, y);
      pos.push(-w, y, zAt(t, y), w, y, zAt(t, y));
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      if (facing > 0) idx.push(a, a + 1, b + 1, a, b + 1, b);
      else idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }
}

function hull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  cap(g, -1, -1);
  cap(g, 1, 1);
}

/** The weather deck, one flush sheet from the stem to the transom. */
function weatherDeck(g) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const y = sheer(t);
    const w = shellAt(t, y);
    const z = zAt(t, y);
    pos.push(-w, y, z, w, y, z);
  }
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
  // The steel margin plate at the deck edge, which is what a rail stands on.
  for (let i = 0; i < STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const y = sheer(t);
    const w = shellAt(t, y);
    const z = zAt(t, y);
    const t2 = -1 + (2 * (i + 1)) / STATIONS;
    const z2 = zAt(t2, sheer(t2));
    const d = Math.abs(z2 - z);
    if (d < 0.05) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.deckSteel, 0.55, 0.10, d, sgn * (w - 0.3), y + 0.05, (z + z2) / 2);
    }
  }
}

/** Her bulwark forward and the guardrail everywhere else. */
function rails(g) {
  const stanchion = M.steelDark;
  for (let z = -LOA / 2 + 3; z < LOA / 2 - 5; z += 2.6) {
    const t = z / (LOA / 2);
    const y = sheer(t);
    const w = shellAt(t, y);
    if (w < 1.2) continue;
    for (const sgn of [-1, 1]) {
      box(g, stanchion, 0.09, 1.05, 0.09, sgn * (w - 0.42), y + 0.53, z);
    }
  }
  // Three wires a side, run as one long thin box each.
  for (const h of [0.42, 0.72, 1.0]) {
    for (const sgn of [-1, 1]) {
      const pos = [];
      const idx = [];
      let n = 0;
      for (let z = -LOA / 2 + 3; z < LOA / 2 - 5; z += 2.6) {
        const t = z / (LOA / 2);
        const y = sheer(t) + h;
        const w = shellAt(t, sheer(t)) - 0.42;
        if (w < 0.8) continue;
        pos.push(sgn * w, y - 0.03, z, sgn * w, y + 0.03, z);
        n++;
      }
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        const b = (i + 1) * 2;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
        idx.push(a, b + 1, a + 1, a, b, b + 1);
      }
      if (n < 2) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, M.wire));
    }
  }
  // And the breakwater forward of Anton. Every ship that ships water over her
  // forecastle has one, and she shipped more than most.
  const bw = box(g, M.steel, 12.2, 1.15, 0.28, 0, deckAt(64) + 0.58, 64);
  bw.rotation.x = -0.2;
  for (const sgn of [-1, 1]) {
    const w = box(g, M.steel, 0.28, 1.15, 3.6, sgn * 5.9, deckAt(62) + 0.58, 62);
    w.rotation.y = sgn * 0.2;
  }
}

// -------------------------------------------------------- her superstructure

// The superstructure deck: one long low house running from just abaft Anton to
// just forward of Bruno, with the tower on the front of it and the funnel in
// the middle. Its top is the boat deck, and everything above that is tower,
// funnel, catapult and mast.
const SDECK_Z0 = -46;
const SDECK_Z1 = 42;
const SDECK_H = 3.0;

/** Height of the superstructure deck at a station. */
export function sdeck(z) {
  if (z > SDECK_Z1 || z < SDECK_Z0) return deckAt(z);
  return deckAt(z) + SDECK_H;
}

/** How far out the superstructure deck runs at a station. */
export function sHalf(z) {
  const d = halfDeck(z);
  // Inboard of the deck edge, leaving the walkway the fifteens stand in.
  return Math.max(1.5, d - 2.9);
}

/**
 * A house: a box with its own plan, standing on the deck.
 *
 * Sides are drawn as separate quads so the plan can taper -- a deckhouse that
 * follows the ship narrows towards both ends, and a box does not.
 */
function house(g, m, half, z0, z1, y, h, opts = {}) {
  const { px = 1, pz = 1, taper = 0 } = opts;
  const w0 = typeof half === 'function' ? half(z0) : half;
  const w1 = typeof half === 'function' ? half(z1) : half;
  const N = 8;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const z = z0 + (z1 - z0) * f;
    const w = (w0 + (w1 - w0) * f) * px;
    const wt = w * (1 - taper);
    pos.push(-w, y, z, w, y, z, -wt, y + h, z, wt, y + h, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Port side, starboard side, top.
    idx.push(a, a + 2, b + 2, a, b + 2, b);
    idx.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    idx.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
  }
  // The two ends.
  const end = (i, sgn) => {
    const a = i * 4;
    if (sgn > 0) idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    else idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
  };
  end(0, -1);
  end(N, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  g.add(mesh);
  void pz;
  return mesh;
}

function superstructure(g) {
  const y = deckAt(0);
  house(g, M.steel, sHalf, SDECK_Z0, SDECK_Z1, y, SDECK_H);
  // The boat deck on top of it.
  house(g, M.deckSteel, (z) => sHalf(z) + 0.05, SDECK_Z0, SDECK_Z1,
    y + SDECK_H, 0.14);
  // Scuttles down her superstructure side, two rows.
  for (let z = SDECK_Z0 + 3; z < SDECK_Z1 - 3; z += 3.4) {
    for (const sgn of [-1, 1]) {
      for (const dy of [1.0, 2.1]) {
        cyl(g, M.glass, 0.20, 0.20, 0.08, sgn * (sHalf(z) + 0.02), y + dy, z, 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }
  // Ladders down to the weather deck, fore and aft, both sides.
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * (sHalf(38) - 0.4), y, y + SDECK_H, 38, 35.4);
    ladder(g, M.steelDark, sgn * (sHalf(-42) - 0.4), y, y + SDECK_H, -42, -39.4);
  }
}

// ------------------------------------------------------------ the tower --
//
// Her signature, and the reason she does not look like Deutschland.
//
// A heavy armoured tower foremast: a broad squat trunk standing on the
// superstructure deck, with the conning tower inside it, the bridge round it,
// the chart house above that, the after control position above that, and the
// ten-and-a-half-metre base rangefinder on top under its own cupola. The FuMO
// 22 mattress is bolted to the front of the cupola -- a flat rectangular
// aerial two metres by six, and the first one anybody took to sea.

const TOWER_Z = 26;

function tower(g) {
  const base = sdeck(TOWER_Z);
  // The trunk. Broad and armoured, not a lattice: this is the whole point.
  house(g, M.steel, 5.6, TOWER_Z - 6.2, TOWER_Z + 5.4, base, 3.4);
  // The open bridge wings, wrapped round the trunk one deck up.
  const b1 = base + 3.4;
  house(g, M.steel, 7.4, TOWER_Z - 5.0, TOWER_Z + 4.2, b1, 2.6);
  // The bridge front, faced with windows and raked back a little.
  for (let i = 0; i < 7; i++) {
    const x = -5.4 + i * 1.8;
    box(g, M.glass, 1.55, 1.15, 0.12, x, b1 + 1.5, TOWER_Z + 4.28);
  }
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      box(g, M.glass, 0.12, 1.15, 1.5, sgn * 7.46, b1 + 1.5, TOWER_Z + 3.0 - i * 1.7);
    }
  }
  // The chart house, narrower, above the bridge.
  const b2 = b1 + 2.6;
  house(g, M.steel, 5.0, TOWER_Z - 4.2, TOWER_Z + 3.4, b2, 2.5);
  // The searchlight platforms either side of it.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 2.4, 0.14, 2.4, sgn * 6.1, b2 + 0.07, TOWER_Z - 1.0);
    cyl(g, M.steelDark, 0.12, 0.12, 1.9, sgn * 6.1, b2 - 0.95, TOWER_Z - 1.0, 6);
    searchlight(g, sgn * 6.1, b2 + 0.9, TOWER_Z - 1.0);
  }
  // The after control position.
  const b3 = b2 + 2.5;
  house(g, M.steel, 3.6, TOWER_Z - 3.2, TOWER_Z + 2.6, b3, 2.2);
  // The trunk carrying the director platform above it.
  const b4 = b3 + 2.2;
  cyl(g, M.steel, 2.1, 2.4, 2.0, 0, b4 + 1.0, TOWER_Z, 16);
  // The director, and the great rangefinder across it.
  const dir = new THREE.Group();
  dir.position.set(0, b4 + 2.0, TOWER_Z);
  dir.userData.dynamic = true;
  cyl(dir, M.steel, 1.9, 2.0, 1.5, 0, 0.75, 0, 16);
  sphere(dir, M.steel, 1.9, 0, 1.5, 0, 14).scale.set(1, 0.52, 1);
  // Ten and a half metres of base length, which is nearly half her beam.
  tubeX(dir, M.steel, 0.42, 10.5, 0, 1.55, 0.2, 12);
  for (const sgn of [-1, 1]) {
    box(dir, M.glass, 0.16, 0.42, 0.42, sgn * 5.2, 1.55, 0.42);
  }
  // The radar. A flat mattress of dipoles on a rectangular frame, on the front
  // of the cupola, and the first set anybody took to sea in a warship.
  const mattress = new THREE.Group();
  mattress.position.set(0, 1.55, 1.05);
  box(mattress, M.radar, 6.0, 1.9, 0.14, 0, 0, 0);
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    box(mattress, M.bright, 0.06, 1.5, 0.06, x, 0, 0.12);
    box(mattress, M.bright, 0.5, 0.06, 0.06, x, 0.42, 0.2);
    box(mattress, M.bright, 0.5, 0.06, 0.06, x, -0.42, 0.2);
  }
  dir.add(mattress);
  g.add(dir);
  // Ladders up the front of the tower.
  ladder(g, M.steelDark, S * 3.2, base, b1, TOWER_Z + 4.0, TOWER_Z + 4.0);
  ladder(g, M.steelDark, S * 2.6, b1, b2, TOWER_Z + 3.2, TOWER_Z + 3.2);
}

function searchlight(g, x, y, z) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  cyl(s, M.steelDark, 0.30, 0.34, 0.30, 0, -0.42, 0, 10);
  cyl(s, M.steel, 0.62, 0.62, 0.78, 0, 0, 0, 14).rotation.x = Math.PI / 2;
  cyl(s, M.glass, 0.58, 0.58, 0.06, 0, 0, 0.42, 14).rotation.x = Math.PI / 2;
  g.add(s);
  return s;
}

// ------------------------------------------------------------ the funnel --
//
// One funnel, upright, oval in plan, with a shallow cap. Nothing like the
// Hipper's raked and heavily capped stack: hers is a plain diesel exhaust
// trunk, and it is short, because a diesel ship has no boiler uptakes to
// carry.

const FUNNEL_Z = -6;

function funnel(g) {
  const y = sdeck(FUNNEL_Z) + 0.14;
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    const h = y + f * 9.4;
    // Oval: wider athwartships than fore and aft, tapering a little upward.
    const rx = 3.5 - f * 0.55;
    const rz = 2.35 - f * 0.4;
    rings.push({ y: h, rx, rz });
  }
  const pos = [];
  const idx = [];
  const N = 20;
  for (const r of rings) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.cos(a) * r.rx, r.y, FUNNEL_Z + Math.sin(a) * r.rz);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = k * N + i;
      const b = k * N + j;
      const c = (k + 1) * N + i;
      const d = (k + 1) * N + j;
      idx.push(a, c, d, a, d, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.steel));
  // The cap: a shallow flat ring round the top, not the Hipper's mushroom.
  const top = y + 9.4;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const a2 = ((i + 0.5) / N) * Math.PI * 2;
    box(g, M.gunDark, 0.62, 0.24, 0.62,
      Math.cos(a2) * 3.15, top + 0.12, FUNNEL_Z + Math.sin(a2) * 2.1,
      -a2);
    void a;
  }
  // The black top, and the cave down the middle of it.
  cyl(g, M.gunDark, 2.55, 2.75, 0.9, 0, top - 0.45, FUNNEL_Z, 20).scale.set(1, 1, 0.68);
  cyl(g, M.cave, 2.35, 2.35, 0.3, 0, top - 0.05, FUNNEL_Z, 18).scale.set(1, 1, 0.68);
  // Steam pipes up the after side.
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.17, 0.17, 8.6, sgn * 1.5, y + 4.3, FUNNEL_Z - 2.3, 8);
  }
  // The siren platform on the fore side.
  box(g, M.steelDark, 2.4, 0.12, 1.0, 0, y + 6.6, FUNNEL_Z + 2.5);
  cyl(g, M.brass, 0.22, 0.30, 0.7, 0, y + 7.0, FUNNEL_Z + 2.5, 10)
    .rotation.x = Math.PI / 2;
}

// -------------------------------------------------------------- the masts --

function masts(g) {
  // The mainmast, a light pole abaft the funnel, carrying her wireless aerials.
  const my = sdeck(-24) + 0.14;
  cyl(g, M.steelDark, 0.20, 0.34, 16.0, 0, my + 8.0, -24, 10);
  box(g, M.steelDark, 7.0, 0.14, 0.14, 0, my + 12.4, -24);
  for (const sgn of [-1, 1]) {
    box(g, M.wire, 0.05, 0.05, 12.0, sgn * 3.4, my + 12.4 - 1.6, -24 - 5.6)
      .rotation.x = 0.26;
  }
  // A short pole on the after control position.
  const ay = sdeck(-42) + 3.2;
  cyl(g, M.steelDark, 0.14, 0.22, 7.0, 0, ay + 3.5, -42, 8);
}

// ------------------------------------------------ the after superstructure --

function afterWorks(g) {
  const y = sdeck(-42);
  // The after control position, with its own director on top.
  house(g, M.steel, 4.2, -47, -37, y, 3.2);
  const dir = new THREE.Group();
  dir.position.set(0, y + 3.2, -42);
  dir.userData.dynamic = true;
  cyl(dir, M.steel, 1.5, 1.7, 1.2, 0, 0.6, 0, 14);
  sphere(dir, M.steel, 1.5, 0, 1.2, 0, 12).scale.set(1, 0.5, 1);
  tubeX(dir, M.steel, 0.32, 6.0, 0, 1.25, 0.15, 10);
  g.add(dir);
}

// -------------------------------------------------- the catapult and crane --

const CAT_Z = -20;
const CAT_A = -8.0;
const CAT_STROKE = 20.0;
const CAT_TRAIN = 1.42;

function catapult(g) {
  const y = sdeck(CAT_Z) + 0.14;
  const ring = new THREE.Group();
  ring.position.set(0, y, CAT_Z);
  cyl(ring, M.steelDark, 2.0, 2.2, 0.5, 0, 0.25, 0, 16);
  const cat = new THREE.Group();
  cat.position.set(0, 0.5, 0);
  cat.userData.dynamic = true;
  // The girder, lying athwartships when trained out.
  box(cat, M.steel, 2.0, 0.7, CAT_STROKE + 4.0, 0, 0.35, CAT_A + CAT_STROKE / 2);
  box(cat, M.steelDark, 2.4, 0.16, 1.6, 0, 0.78, CAT_A + CAT_STROKE + 1.4);
  for (let i = 0; i <= 6; i++) {
    const z = CAT_A - 1.4 + i * ((CAT_STROKE + 3) / 6);
    box(cat, M.steelDark, 2.5, 0.5, 0.2, 0, 0.1, z);
  }
  const car = new THREE.Group();
  car.position.set(0, 0.7, CAT_A);
  car.userData.dynamic = true;
  box(car, M.steelDark, 1.9, 0.34, 2.4, 0, 0, 0);
  // The aeroplane on the trolley. She is her own group so the catapult can
  // move her along the girder and let her go off the end of it.
  const plane = new THREE.Group();
  plane.position.set(0, 0.33, 0);
  car.add(plane);
  const p2 = arado(plane, 0, 0, 0, 0, false, { spin: true });
  cat.add(car);
  ring.add(cat);
  g.add(ring);
  g.userData.catapult = { ring, cat, car, plane, prop: p2.userData.prop || null };
}

/** Her second Arado, struck down abaft the catapult with her wings folded. */
function sparePlane(g) {
  const y = sdeck(-34) + 0.16;
  arado(g, -S * 5.4, y + 0.35, -34, -S * 0.22, true);
  box(g, M.steelDark, 2.6, 0.3, 1.1, -S * 5.4, y + 0.18, -34);
  for (const tx of [-1.0, 1.0]) {
    box(g, M.gunDark, 0.14, 0.1, 7.0, -S * 5.4 + tx, y + 0.05, -31.0);
  }
}

function crane(g) {
  const y = sdeck(-30) + 0.14;
  const post = new THREE.Group();
  post.position.set(S * 6.4, y, -30);
  cyl(post, M.steelDark, 0.42, 0.52, 6.4, 0, 3.2, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 6.0, 0);
  jib.rotation.z = S * 0.5;
  jib.userData.dynamic = true;
  for (let i = 0; i < 8; i++) {
    const f = i / 7;
    box(jib, M.steelDark, 0.12, 0.12, 0.12, 0, f * 11.0, 0);
  }
  box(jib, M.steelDark, 0.22, 11.0, 0.22, 0, 5.5, 0);
  box(jib, M.steelDark, 0.16, 0.16, 1.0, 0, 11.0, 0);
  post.add(jib);
  g.add(post);
}

// ---------------------------------------------------------------- her boats --

function boats(g) {
  const y = sdeck(-14) + 0.16;
  for (const [x, z, len] of [[S * 6.0, -12, 9.0], [-S * 6.0, -12, 9.0],
    [S * 6.2, 2, 7.6], [-S * 6.2, 2, 7.6]]) {
    const b = new THREE.Group();
    b.position.set(x, y + 0.9, z);
    // A hull lofted as a shallow lens, not a box.
    const rings = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const w = Math.sin(f * Math.PI) ** 0.7;
      rings.push({ z: (f - 0.5) * len, w: w * 1.35, h: 1.05 });
    }
    const pos = [];
    const idx = [];
    for (const r of rings) {
      pos.push(-r.w, 0, r.z, r.w, 0, r.z, -r.w * 0.62, -r.h, r.z, r.w * 0.62, -r.h, r.z);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      const a = i * 4;
      const b2 = (i + 1) * 4;
      idx.push(a, a + 2, b2 + 2, a, b2 + 2, b2);
      idx.push(a + 1, b2 + 1, b2 + 3, a + 1, b2 + 3, a + 3);
      idx.push(a + 2, a + 3, b2 + 3, a + 2, b2 + 3, b2 + 2);
      idx.push(a, b2, b2 + 1, a, b2 + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    b.add(new THREE.Mesh(geo, M.bright));
    // Chocks and davits.
    g.add(b);
    for (const dz of [-len * 0.32, len * 0.32]) {
      const d = cyl(g, M.steelDark, 0.14, 0.14, 3.0, x + Math.sign(x) * 1.1,
        y + 1.5, z + dz, 8);
      d.rotation.z = Math.sign(x) * 0.35;
    }
  }
  // Carley floats along the funnel casing.
  for (const sgn of [-1, 1]) {
    for (const z of [-2, -18, 12]) {
      const r = cyl(g, M.raft, 1.05, 1.05, 0.28, sgn * (sHalf(z) + 0.2),
        sdeck(z) + 1.5, z, 12);
      r.rotation.x = Math.PI / 2;
      r.rotation.z = Math.PI / 2;
      r.scale.set(1, 1.6, 1);
    }
  }
}

// ----------------------------------------------------------- ground tackle --

function groundTackle(g) {
  // Two bower anchors in hawse pipes, cable running aft to the windlass.
  for (const sgn of [-1, 1]) {
    const z = 76;
    const y = deckAt(z);
    const w = halfDeck(z);
    box(g, M.steelDark, 0.9, 1.5, 1.4, sgn * (w - 0.25), y - 1.6, z);
    box(g, M.gunDark, 0.28, 1.9, 1.2, sgn * (w + 0.06), y - 1.5, z);
    // Cable on deck.
    for (let i = 0; i < 12; i++) {
      box(g, M.gunDark, 0.22, 0.16, 0.5, sgn * 2.4, y + 0.1, z - 2 - i * 1.1);
    }
  }
  // Windlass and capstans.
  cyl(g, M.steelDark, 0.85, 0.95, 1.0, 0, deckAt(70) + 0.5, 70, 12);
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.55, 0.62, 0.8, sgn * 3.6, deckAt(68) + 0.4, 68, 10);
    cyl(g, M.steelDark, 0.55, 0.62, 0.8, sgn * 3.6, deckAt(-78) + 0.4, -78, 10);
  }
  // Bollards down both sides.
  for (let z = -80; z < 80; z += 14) {
    const y = deckAt(z);
    const w = halfDeck(z);
    if (w < 3) continue;
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.2, 0.22, 0.62, sgn * (w - 1.0), y + 0.31, z, 8);
      cyl(g, M.steelDark, 0.2, 0.22, 0.62, sgn * (w - 1.0), y + 0.31, z + 0.9, 8);
    }
  }
}

// ------------------------------------------------------------- the screws --

function screws(g) {
  // Two shafts. A diesel ship, and the whole argument for her: she could steam
  // twenty thousand miles without refuelling, which is what made a commerce
  // raider out of a ship that could not fight a battleship.
  for (const sgn of [-1, 1]) {
    const x = sgn * 4.2;
    const z = -80;
    // The shaft, in its bossing.
    const sh = cyl(g, M.steelDark, 0.42, 0.42, 12.0, x, -5.4, z + 6.0, 10);
    sh.rotation.x = Math.PI / 2;
    const scr = new THREE.Group();
    scr.position.set(x, -5.4, z);
    scr.userData.dynamic = true;
    scr.userData.screw = true;
    cyl(scr, M.brass, 0.34, 0.42, 0.7, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(scr, M.brass, 0.7, 2.4, 0.1, 0, 0, -0.1);
      bl.rotation.z = a;
      bl.position.set(Math.cos(a + Math.PI / 2) * 1.2, Math.sin(a + Math.PI / 2) * 1.2, -0.1);
      bl.rotation.y = 0.4;
    }
    g.add(scr);
    // And the rudder, on the centreline abaft them.
    void scr;
  }
  const rud = new THREE.Group();
  rud.position.set(0, -4.4, -86);
  rud.userData.dynamic = true;
  rud.userData.rudder = true;
  box(rud, M.hullDark, 0.34, 4.6, 3.2, 0, 0, 0);
  g.add(rud);
}

// ------------------------------------------------------- the main battery --

const A_Z = CLS.turrets[0].z;
const Y_Z = CLS.turrets[1].z;

/**
 * A triple 28 cm turret.
 *
 * German heavy turrets are angular: a sloped face, a flat sloped roof, and a
 * long overhanging rear that carries the counterweight and the rangefinder
 * ports. Nothing about them is round except the ring they train on.
 */
function elevenInch(g, x, y, z, aft) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = aft ? Math.PI : 0;
  m.userData.dynamic = true;
  m.userData.trainRate = CLS.gun.traverse;

  // The ring and the barbette collar it sits on.
  cyl(m, M.gunDark, 5.0, 5.2, 0.5, 0, -0.25, 0, 24);

  // The gunhouse, built as a lofted solid so the face can slope.
  const half = 4.8;
  const len = 9.4;
  const h = 3.5;
  const pos = [];
  const idx = [];
  // Six stations from the rear plate to the face.
  const rows = [
    [-len * 0.5, half * 0.86, 0.0, h * 0.92],
    [-len * 0.28, half * 1.0, 0.0, h],
    [len * 0.06, half * 1.0, 0.0, h],
    [len * 0.30, half * 0.97, 0.06, h * 0.94],
    [len * 0.44, half * 0.88, 0.30, h * 0.80],
    [len * 0.5, half * 0.80, 0.55, h * 0.66],
  ];
  for (const [dz, w, y0, y1] of rows) {
    pos.push(-w, y0, dz, w, y0, dz, -w * 0.9, y1, dz, w * 0.9, y1, dz);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, a + 2, b + 2, a, b + 2, b);
    idx.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    idx.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const n = (rows.length - 1) * 4;
  idx.push(0, 1, 3, 0, 3, 2);
  idx.push(n, n + 3, n + 1, n, n + 2, n + 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  m.add(new THREE.Mesh(geo, M.gun));

  // The rangefinder ports out of the after corners of the roof.
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.9, 0.7, 0.9, sgn * 4.3, h * 0.86, -len * 0.30);
    cyl(m, M.glass, 0.24, 0.24, 0.1, sgn * 4.76, h * 0.86, -len * 0.30, 8)
      .rotation.z = Math.PI / 2;
  }
  // The roof hatches and the sighting hoods.
  for (const sgn of [-1, 1]) {
    cyl(m, M.gunDark, 0.42, 0.42, 0.26, sgn * 2.6, h + 0.1, -1.0, 10);
  }
  // Ladder rungs up the rear plate.
  for (let i = 0; i < 5; i++) {
    box(m, M.gunDark, 0.7, 0.06, 0.06, 0, 0.5 + i * 0.6, -len * 0.5 - 0.06);
  }

  // The cradle: three barrels in one sleeve, which is how a Drh LC/28 was
  // built -- the outer two are not independently sleeved.
  const guns = new THREE.Group();
  guns.position.set(0, 1.62, len * 0.34);
  guns.rotation.x = -0.035;
  const muzzles = [];
  for (const dx of [-2.35, 0, 2.35]) {
    // The jacket, then the chase, then the muzzle.
    tubeZ(guns, M.gunDark, 0.44, 2.6, dx, 0, 1.3, 12);
    tubeZ(guns, M.gun, 0.33, 9.2, dx, 0, 6.4, 12);
    tubeZ(guns, M.gunDark, 0.35, 0.5, dx, 0, 11.0, 12);
    muzzles.push([dx, 0, 11.3]);
  }
  // The blast bags where they come through the face.
  for (const dx of [-2.35, 0, 2.35]) {
    cyl(guns, M.canvas, 0.62, 0.72, 1.0, dx, 0, 0.4, 12).rotation.x = Math.PI / 2;
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = [];
  turrets.push(elevenInch(g, 0, deckAt(A_Z) - 0.2, A_Z, false));
  turrets.push(elevenInch(g, 0, deckAt(Y_Z) - 0.2, Y_Z, true));
  g.userData.turrets = turrets;
  return turrets;
}

// ------------------------------------------------------- the other guns --

/** A single 15 cm in an open shield: a surface gun, and it will not point up. */
function fifteen(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 1.5, 1.65, 0.34, 0, -0.17, 0, 16);
  // The shield: a three-sided box open at the back, with a sloped face.
  const face = box(m, M.gun, 3.0, 2.3, 0.14, 0, 1.15, 1.32);
  face.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    box(m, M.gun, 0.14, 2.3, 2.5, sgn * 1.5, 1.15, 0.1);
  }
  box(m, M.gun, 3.0, 0.14, 2.6, 0, 2.3, 0.05);
  const guns = new THREE.Group();
  guns.position.set(0, 1.15, 1.0);
  guns.rotation.x = -0.03;
  tubeZ(guns, M.gunDark, 0.26, 1.2, 0, 0, 0.6, 10);
  tubeZ(guns, M.gun, 0.19, 6.2, 0, 0, 3.6, 10);
  cyl(guns, M.canvas, 0.36, 0.44, 0.7, 0, 0, 0.3, 10).rotation.x = Math.PI / 2;
  m.add(guns);
  arm(m, guns, [[0, 0, 6.9]]);
  g.add(m);
  return m;
}

/** A twin 10.5 cm C/33 on its stabilised mounting. */
function tenFive(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 1.35, 1.5, 0.32, 0, -0.16, 0, 16);
  // The shield: rounded front, open rear, which is what a C/33 twin looks like.
  cyl(m, M.gun, 1.55, 1.55, 2.0, 0, 1.0, 0.25, 16);
  box(m, M.gun, 3.1, 2.0, 1.6, 0, 1.0, -0.6);
  const guns = new THREE.Group();
  guns.position.set(0, 1.35, 0.9);
  guns.rotation.x = -0.09;
  const muzzles = [];
  for (const dx of [-0.62, 0.62]) {
    tubeZ(guns, M.gunDark, 0.20, 0.9, dx, 0, 0.45, 10);
    tubeZ(guns, M.gun, 0.135, 4.4, dx, 0, 2.6, 10);
    muzzles.push([dx, 0, 4.9]);
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/** A twin 3.7 cm C/30 on its hand-worked stabilised mounting. */
function threeSeven(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 0.72, 0.82, 0.26, 0, -0.13, 0, 12);
  box(m, M.gunDark, 1.5, 0.6, 1.2, 0, 0.3, -0.1);
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.14, 0.9, 0.8, sgn * 0.72, 0.9, -0.15);
  }
  // The layer's seats, which is most of what you see of one of these.
  for (const sgn of [-1, 1]) {
    box(m, M.steelDark, 0.34, 0.08, 0.34, sgn * 0.95, 0.86, -0.55);
  }
  const guns = new THREE.Group();
  guns.position.set(0, 0.95, 0.15);
  guns.rotation.x = -0.20;
  const muzzles = [];
  for (const dx of [-0.30, 0.30]) {
    tubeZ(guns, M.gunDark, 0.10, 0.5, dx, 0, 0.25, 8);
    tubeZ(guns, M.gun, 0.055, 2.5, dx, 0, 1.5, 8);
    muzzles.push([dx, 0, 2.8]);
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/** A single 2 cm Flak 30 on its pedestal. */
function twoCm(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 0.34, 0.42, 0.9, 0, 0.45, 0, 10);
  box(m, M.gunDark, 0.5, 0.3, 0.5, 0, 1.0, 0);
  const guns = new THREE.Group();
  guns.position.set(0, 1.05, 0.1);
  guns.rotation.x = -0.28;
  tubeZ(guns, M.gun, 0.045, 1.9, 0, 0, 0.95, 8);
  // The drum magazine and the conical flash hider.
  cyl(guns, M.gunDark, 0.16, 0.16, 0.1, 0.12, 0.1, 0.5, 10).rotation.z = Math.PI / 2;
  cyl(guns, M.gunDark, 0.1, 0.055, 0.24, 0, 0, 1.95, 8).rotation.x = Math.PI / 2;
  m.add(guns);
  arm(m, guns, [[0, 0, 2.05]]);
  g.add(m);
  return m;
}

/** A quadruple bank of 53.3 cm tubes on the quarterdeck. */
function torpedoBank(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  m.userData.trainRate = CLS.torpedoes.traverse;
  cyl(m, M.steelDark, 0.85, 0.95, 0.42, 0, -0.21, 0, 14);
  box(m, M.steelDark, 2.2, 0.5, 1.6, 0, 0.25, 0);
  const muzzles = [];
  // Four tubes, two over two, which is how a German quad bank was arranged.
  for (const [dx, dy] of [[-0.62, 0.62], [0.62, 0.62], [-0.62, 1.5], [0.62, 1.5]]) {
    tubeZ(m, M.steel, 0.34, 8.2, dx, dy, 0, 12);
    cyl(m, M.gunDark, 0.36, 0.36, 0.2, dx, dy, 4.2, 12).rotation.x = Math.PI / 2;
    muzzles.push([dx, dy, 4.4]);
  }
  // The sight and the layer's platform.
  box(m, M.steelDark, 0.5, 0.1, 0.5, -1.5, 0.5, 0.6);
  cyl(m, M.steelDark, 0.09, 0.09, 0.9, -1.5, 0.95, 0.6, 8);
  arm(m, m, muzzles);
  g.add(m);
  return m;
}

function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  for (const m of CLS.secondary.mounts) {
    // The fifteens stand in the walkway at the deck edge, outboard of the
    // superstructure, which is where a Panzerschiff's single mounts are.
    sec.push(fifteen(g, m.x, deckAt(m.z) + 0.02, m.z, m.angle));
  }
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      // The centreline heavy mounting right aft stands on the after control
      // position's roof; everything else is on the superstructure deck.
      const on = m.z > SDECK_Z0 && m.z < SDECK_Z1;
      let y = on ? sdeck(m.z) + 0.16 : deckAt(m.z) + 0.02;
      if (gun.caliber === 105 && m.x === 0) y = sdeck(-42) + 3.36;
      aa.push(gun.caliber === 105 ? tenFive(g, m.x, y, m.z, m.angle)
        : gun.caliber === 37 ? threeSeven(g, m.x, y, m.z, m.angle)
          : twoCm(g, m.x, y, m.z, m.angle));
    }
  }
  for (const m of CLS.torpedoes.mounts) {
    torp.push(torpedoBank(g, m.x, deckAt(m.z) + 0.02, m.z, m.angle));
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
}

// ------------------------------------------------------------ the catapult --

function stepCatapult(deck, t) {
  const c = deck.cat;
  if (!c) return;
  const pr = deck.profile;
  const shot = pr.rows.length * pr.dt;
  const CAT_TRAIN_T = 6;
  const CAT_RUNUP = 9;
  const run = deck.launchAt === null ? -1 : t - deck.launchAt;
  const out = run < 0 ? 0 : Math.min(1, run / CAT_TRAIN_T);
  c.cat.rotation.y = CAT_TRAIN * out;
  if (run < 0) {
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
    turning = 30;
    pitch = 0.005 * Math.sin((run - CAT_TRAIN_T) * 26);
  } else if (run < CAT_RUNUP + shot) {
    turning = 34;
    const i = Math.min(pr.rows.length - 1,
      Math.max(0, Math.round((run - CAT_RUNUP) / pr.dt)));
    const [s2, h, th] = pr.rows[i];
    along = CAT_A + s2;
    y = h;
    pitch = th;
  } else {
    deck.airborne = true;
    deck.gone = true;
    c.plane.visible = false;
    return;
  }
  c.car.position.z = Math.min(CAT_A + CAT_STROKE, along);
  c.plane.position.set(0, 0.33 + y, Math.max(0, along - (CAT_A + CAT_STROKE)));
  c.plane.rotation.set(pitch, 0, 0);
  c.plane.visible = true;
  if (c.prop) c.prop.rotation.z += turning * 0.05;
}

// ------------------------------------------------------------- the whole ship

const STATIC = [
  ['hull', hull],
  ['weatherDeck', weatherDeck],
  ['rails', rails],
  ['superstructure', superstructure],
  ['tower', tower],
  ['funnel', funnel],
  ['afterWorks', afterWorks],
  ['masts', masts],
  ['catapult', catapult],
  ['sparePlane', sparePlane],
  ['crane', crane],
  ['boats', boats],
  ['groundTackle', groundTackle],
  ['screws', screws],
];

/** The barbettes her two turrets train on, which are ship and not gun. */
function barbettes(g) {
  for (const z of [A_Z, Y_Z]) {
    const y = deckAt(z);
    cyl(g, M.steel, 5.15, 5.3, 0.55, 0, y + 0.28, z, 24);
  }
}

export function buildSpee() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  barbettes(g);
  buildInterior(g, { loa: LOA, shellAt, keelY, sheer, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  // And inside every part of her that moves -- after her batteries are on her,
  // because they are put on after the hull is welded and a weld run before
  // them finds nothing to do. See mergeMoving.
  mergeMoving(g);
  g.userData.classId = 'spee';

  const deck = {
    cat: g.userData.catapult, live: null, launchAt: null, airborne: false,
    gone: false, plane: null, flightId: 0, pending: [], endMatrix: null,
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
  g.userData.landingSpot = [S * 8, sdeck(CAT_Z) + 2.4, CAT_Z];

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
export function speeParts() {
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

export { sheer, shellAt, zAt, loftRings, planHouse };
