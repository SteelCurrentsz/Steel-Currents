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

// Half-breadths at the waterline, read off her plan view.
//
// The plan is drawn to a metre scale along her length and the deck edge is
// measured off it station by station: a long parallel middle body carrying
// her full breadth from about a quarter of her length abaft the stem to a
// quarter forward of the transom, a fine entrance, and a fine pointed cruiser
// stern -- at ten metres from the transom she is under four metres across.
// Maximum beam is a shade forward of amidships, which is where the plan puts
// it and where a ship designed round two triple turrets and a long machinery
// space would carry it.
const HALF_BEAM = [
  [-1.00, 0.55], [-0.96, 1.35], [-0.90, 2.55], [-0.84, 3.55], [-0.78, 4.45],
  [-0.68, 5.85], [-0.57, 7.05], [-0.46, 8.05], [-0.34, 9.15], [-0.20, 10.05],
  [-0.06, 10.62], [0.06, 10.80], [0.20, 10.66], [0.34, 10.26], [0.46, 9.55],
  [0.57, 8.60], [0.68, 7.30], [0.78, 5.70], [0.86, 4.10], [0.92, 2.65],
  [0.96, 1.55], [1.00, 0.16],
];

// Her keel and the rise of floor at both ends, off the profile: a flat
// bottom over the machinery, the forefoot sweeping up into a nearly upright
// stem, and the run aft lifting to a counter that clears two screws and a
// single rudder on the centreline.
const KEEL = [
  [-1.00, -1.30], [-0.94, -4.20], [-0.88, -5.80], [-0.80, -6.70], [-0.66, -7.28],
  [-0.30, -7.42], [0.10, -7.42], [0.40, -7.28], [0.60, -6.80], [0.76, -5.55],
  [0.88, -3.40], [0.95, -0.70], [1.00, 1.60],
];

// One deck, flush, stem to transom -- and low.
//
// Off her profile: the deck edge is very nearly a straight line for four
// fifths of her length, five and a quarter metres over the water, and lifts
// about two and a half metres over the last forty to the stem head. She never
// got the Atlantic bow her two sisters were given in 1940 -- she went down off
// Montevideo in December 1939 with the stem she was launched with -- and the
// difference is that rise and the flare that goes with it. It is most of what
// her critics meant when they called her wet forward.
const SHEER = [
  [-1.00, 6.34], [-0.72, 6.32], [-0.36, 6.36], [0.00, 6.44], [0.26, 6.56],
  [0.42, 6.76], [0.56, 7.08], [0.68, 7.50], [0.78, 7.92], [0.86, 8.30],
  [0.92, 8.62], [0.96, 8.86], [1.00, 9.10],
];

// How far outboard of the waterline the deck edge is carried, in metres.
//
// Modest the whole way, which is the point. A ship without an Atlantic bow
// does not have two metres of flare at the forecastle: she has a hand's
// breadth amidships opening to about a metre forward, and that is why she
// shipped water over Anton in any sort of sea.
const FLARE = [
  [-1.00, 0.10], [-0.60, 0.15], [-0.20, 0.20], [0.10, 0.24], [0.32, 0.40],
  [0.46, 0.58], [0.58, 0.78], [0.68, 0.96], [0.76, 1.06], [0.82, 1.08],
  [0.88, 0.98], [0.93, 0.76], [0.97, 0.42], [1.00, 0.10],
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
// The stem is very nearly upright: about three and a half metres of rake over
// her whole freeboard, against the Admiral Hipper's seven. That is what a ship
// built before anybody had taken her to sea in the Atlantic looks like, and it
// is the single line that tells Graf Spee from the two sisters that were given
// clipper bows. Below the water it sweeps back into a rounded forefoot.
//
// The counter is a cruiser stern: a fine rounded overhang over two screws and
// the rudder, drawn on the plan as a point rather than a transom.
const STEM = 3.6;
const COUNTER = 3.0;
function stemAt(y) {
  return STEM * Math.pow(Math.min(1, Math.max(0, y + 7.4) / 15.4), 1.16);
}
function counterAt(y) {
  return COUNTER * Math.pow(Math.min(1, Math.max(0, y + 1.4) / 6.7), 1.45);
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
  // Wound so her deck faces the sky. Taken the other way round it is a
  // perfectly good deck seen from underneath: it draws correctly from any
  // camera outside her, and a ray dropped on it from above goes straight
  // through -- so nothing standing on her has anything under it, and every
  // shell that lands on her deck lands in her machinery instead.
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b + 1, a + 1, a, b, b + 1);
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
//
// Off the plan: one continuous block of superstructure from just abaft Anton
// to just forward of Bruno, narrower than the hull so that the fifteens stand
// in a walkway at the deck edge on either side of it. The tower stands on its
// forward end, the funnel in the middle of it, the catapult and the crane
// abaft that, and the after control position on its after end.

const SDECK_Z0 = -34;
const SDECK_Z1 = 40;
const SDECK_H = 3.2;

/** Height of the superstructure deck at a station. */
export function sdeck(z) {
  if (z > SDECK_Z1 || z < SDECK_Z0) return deckAt(z);
  return deckAt(z) + SDECK_H;
}

/** How far out the superstructure deck runs at a station. */
export function sHalf(z) {
  // Inboard of the deck edge by the width of the walkway the fifteens stand
  // in, which the plan draws as about three metres of open deck a side.
  return Math.max(1.6, halfDeck(z) - 3.0);
}

/**
 * A house: a box with its own plan, standing on the deck.
 *
 * Sides are drawn as separate quads so the plan can taper -- a deckhouse that
 * follows the ship narrows towards both ends, and a box does not.
 */
function house(g, m, half, z0, z1, y, h, opts = {}) {
  const { px = 1, taper = 0 } = opts;
  const w0 = typeof half === 'function' ? half(z0) : half;
  const w1 = typeof half === 'function' ? half(z1) : half;
  const N = 8;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const z = z0 + (z1 - z0) * f;
    const w = (typeof half === 'function' ? half(z) : (w0 + (w1 - w0) * f)) * px;
    const wt = w * (1 - taper);
    pos.push(-w, y, z, w, y, z, -wt, y + h, z, wt, y + h, z);
  }
  // Wound outwards. They were wound inwards, which meant every deckhouse on
  // her -- the superstructure, the bridge block, the tower trunk and every
  // platform on it, the after works -- was drawn only on its two ends. Back
  // faces are not drawn, so the sides and roofs were not there: you looked
  // down through the bridge roof on to the deck under it.
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b + 2, a + 2, a, b, b + 2);            // port side
    idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3); // starboard side
    idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3); // roof
    idx.push(a, b + 1, b, a, a + 1, b + 1);            // floor
  }
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
  return mesh;
}

function superstructure(g) {
  const y = deckAt(0);
  house(g, M.steel, sHalf, SDECK_Z0, SDECK_Z1, y, SDECK_H);
  house(g, M.deckSteel, (z) => sHalf(z) + 0.06, SDECK_Z0, SDECK_Z1,
    y + SDECK_H, 0.16);
  // Scuttles down her superstructure side, two rows, as the profile draws
  // them.
  for (let z = SDECK_Z0 + 3; z < SDECK_Z1 - 3; z += 3.2) {
    for (const sgn of [-1, 1]) {
      for (const dy of [1.05, 2.25]) {
        cyl(g, M.glass, 0.19, 0.19, 0.08, sgn * (sHalf(z) + 0.02), y + dy, z, 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }
  // Ladders down to the weather deck at both ends, both sides.
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * (sHalf(36) - 0.4), y, y + SDECK_H, 36, 33.4);
    ladder(g, M.steelDark, sgn * (sHalf(-30) - 0.4), y, y + SDECK_H, -30, -27.4);
  }
  // The lower bridge block between Anton and the tower: a wide low house with
  // the conning tower buried in the front of it. The plan draws it as an
  // eight-sided grey mass a good deal broader than the tower above it.
  const b = y + SDECK_H;
  house(g, M.steel, 6.8, 30, 41, b, 4.5);
  // The armoured conning tower standing in it -- a cylinder with a slit, and
  // the roof of it carried out over the bridge front. The profile puts the top
  // of it sixteen metres over the water, a metre and a half clear of the
  // bridge deck round its foot.
  cyl(g, M.steel, 2.9, 3.1, 6.0, 0, b + 3.0, 38.5, 18);
  cyl(g, M.gunDark, 3.05, 3.05, 0.34, 0, b + 5.85, 38.5, 18);
  cyl(g, M.steelDark, 3.3, 3.3, 0.2, 0, b + 6.15, 38.5, 18);
  // And the open deck round it, which the plan shows as a broad platform.
  house(g, M.deckSteel, 5.6, 33.6, 41.4, b + 4.5, 0.16);
}

// ------------------------------------------------------------ the tower --
//
// Her signature, and the reason she does not look like Deutschland.
//
// A heavy armoured tower foremast: a broad trunk standing on the
// superstructure deck with the bridgework wrapped round it, and above that a
// stack of platforms narrowing to the fire-control top. The profile gives the
// order of them -- navigating bridge, chart house, searchlight platform, upper
// control position, director platform, and the ten-and-a-half-metre base
// rangefinder in its cupola on top, twenty-four metres over the deck.
//
// The FuMO 22 mattress is bolted to the front of the cupola: a flat
// rectangular aerial of dipoles on a frame, six metres by two, and the first
// radar set anybody took to sea in a warship.

const TOWER_Z = 24;

function tower(g) {
  const base = sdeck(TOWER_Z);
  // The trunk. Broad and armoured, not a lattice: this is the whole point.
  house(g, M.steel, 5.4, TOWER_Z - 5.4, TOWER_Z + 5.0, base, 4.4);

  // The navigating bridge, wrapped round the trunk one deck up, with open
  // wings carried out to either side.
  const b1 = base + 4.4;
  house(g, M.steel, 6.9, TOWER_Z - 4.6, TOWER_Z + 4.4, b1, 3.1);
  house(g, M.deckSteel, 8.6, TOWER_Z - 3.4, TOWER_Z + 3.6, b1 + 3.1, 0.16);
  // The bridge front, faced with windows, and the wing screens either side.
  for (let i = 0; i < 7; i++) {
    box(g, M.glass, 1.5, 1.2, 0.12, -5.1 + i * 1.7, b1 + 1.5, TOWER_Z + 4.48);
  }
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      box(g, M.glass, 0.12, 1.2, 1.4, sgn * 6.96, b1 + 1.5, TOWER_Z + 2.8 - i * 1.6);
    }
    box(g, M.steelDark, 0.14, 1.05, 6.6, sgn * 8.5, b1 + 3.3, TOWER_Z + 0.2);
  }

  // The chart house, narrower, above the bridge.
  const b2 = b1 + 3.1;
  house(g, M.steel, 4.7, TOWER_Z - 3.9, TOWER_Z + 3.5, b2, 3.0);

  // The searchlight platform, carried out either side of it -- the profile
  // shows a light on each wing at this level.
  const b3 = b2 + 3.0;
  house(g, M.deckSteel, 6.5, TOWER_Z - 2.8, TOWER_Z + 2.6, b3, 0.16);
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 2.2, 0.14, 2.2, sgn * 5.6, b3 + 0.08, TOWER_Z - 0.4);
    cyl(g, M.steelDark, 0.12, 0.12, 2.4, sgn * 5.6, b3 - 1.2, TOWER_Z - 0.4, 6);
    searchlight(g, sgn * 5.6, b3 + 0.95, TOWER_Z - 0.4);
  }

  // The upper control position.
  house(g, M.steel, 3.4, TOWER_Z - 3.0, TOWER_Z + 2.6, b3, 2.9);
  const b4 = b3 + 2.9;
  // The platform the anti-aircraft directors stand on.
  house(g, M.deckSteel, 4.4, TOWER_Z - 2.6, TOWER_Z + 2.4, b4, 0.16);
  for (const sgn of [-1, 1]) {
    const d = new THREE.Group();
    d.position.set(sgn * 3.3, b4 + 0.16, TOWER_Z - 0.6);
    d.userData.dynamic = true;
    cyl(d, M.steel, 0.62, 0.7, 1.0, 0, 0.5, 0, 12);
    sphere(d, M.steel, 0.7, 0, 1.0, 0, 10).scale.set(1, 0.6, 1);
    tubeX(d, M.steel, 0.16, 2.4, 0, 1.05, 0.1, 8);
    g.add(d);
  }

  // The trunk carrying the fire-control top.
  const b5 = b4 + 0.16;
  cyl(g, M.steel, 1.9, 2.2, 3.6, 0, b5 + 1.8, TOWER_Z, 16);

  // The top itself, and the great rangefinder across it. Ten and a half
  // metres of base length, which is very nearly half her beam.
  const dir = new THREE.Group();
  dir.position.set(0, b5 + 3.6, TOWER_Z);
  dir.userData.dynamic = true;
  house(dir, M.steel, 2.3, -2.4, 2.2, 0, 2.0);
  cyl(dir, M.steel, 2.05, 2.15, 0.9, 0, 2.45, -0.1, 16);
  sphere(dir, M.steel, 2.05, 0, 2.9, -0.1, 14).scale.set(1, 0.5, 1);
  tubeX(dir, M.steel, 0.42, 10.5, 0, 2.95, 0.25, 12);
  for (const sgn of [-1, 1]) {
    box(dir, M.glass, 0.16, 0.44, 0.44, sgn * 5.2, 2.95, 0.5);
  }
  // The radar. A flat mattress of dipoles on a rectangular frame, bolted to
  // the front of the cupola, and the first set anybody took to sea.
  const mattress = new THREE.Group();
  mattress.position.set(0, 2.95, 1.15);
  box(mattress, M.radar, 6.0, 1.9, 0.16, 0, 0, 0);
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    box(mattress, M.bright, 0.06, 1.5, 0.06, x, 0, 0.14);
    box(mattress, M.bright, 0.5, 0.06, 0.06, x, 0.42, 0.22);
    box(mattress, M.bright, 0.5, 0.06, 0.06, x, -0.42, 0.22);
  }
  dir.add(mattress);
  g.add(dir);

  // The pole mast abaft the tower, carrying her wireless aerials, and the
  // ladders up the front of the tower.
  cyl(g, M.steelDark, 0.16, 0.26, 15.0, 0, b4 + 7.5, TOWER_Z - 4.4, 10);
  box(g, M.steelDark, 5.4, 0.12, 0.12, 0, b4 + 12.4, TOWER_Z - 4.4);
  ladder(g, M.steelDark, S * 3.0, base, b1, TOWER_Z + 3.8, TOWER_Z + 3.8);
  ladder(g, M.steelDark, S * 2.5, b1, b2, TOWER_Z + 3.0, TOWER_Z + 3.0);
  ladder(g, M.steelDark, S * 2.1, b2, b3, TOWER_Z + 2.6, TOWER_Z + 2.6);
}

function searchlight(g, x, y, z) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  cyl(s, M.steelDark, 0.28, 0.32, 0.30, 0, -0.42, 0, 10);
  cyl(s, M.steel, 0.60, 0.60, 0.76, 0, 0, 0, 14).rotation.x = Math.PI / 2;
  cyl(s, M.glass, 0.56, 0.56, 0.06, 0, 0, 0.41, 14).rotation.x = Math.PI / 2;
  g.add(s);
  return s;
}

// ------------------------------------------------------------ the funnel --
//
// One funnel, upright, oval in plan, with a shallow flat cap. Nothing like the
// Hipper's raked and heavily capped stack: hers is a diesel exhaust trunk, and
// it is short and broad because a diesel ship has no boiler uptakes to carry.
// The plan draws it as a wide oval with the cave down the middle of it and a
// searchlight platform on the fore side.

const FUNNEL_Z = 4.5;

/**
 * How high the funnel platform stands, in metres over the water. The two
 * forward 3.7 cm twins stand on it, so the datasheet and the model both have
 * to know where it is.
 */
export const PLATFORM_Y = 18.2;

function funnel(g) {
  const y = sdeck(FUNNEL_Z) + 0.16;
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    rings.push({ y: y + f * 11.6, rx: 3.8 - f * 0.66, rz: 2.6 - f * 0.5 });
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

  const top = y + 11.6;
  // The cap: a shallow flat ring standing off the rim on brackets.
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    box(g, M.gunDark, 0.66, 0.26, 0.66,
      Math.cos(a) * 3.25, top + 0.13, FUNNEL_Z + Math.sin(a) * 2.2, -a);
  }
  // The black top and the cave down the middle of it.
  cyl(g, M.gunDark, 2.7, 2.9, 1.0, 0, top - 0.5, FUNNEL_Z, 20).scale.set(1, 1, 0.68);
  cyl(g, M.cave, 2.45, 2.45, 0.3, 0, top - 0.05, FUNNEL_Z, 18).scale.set(1, 1, 0.68);
  // Steam and exhaust pipes up the after side.
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.16, 0.16, 10.4, sgn * 1.6, y + 5.2, FUNNEL_Z - 2.5, 8);
  }
  // The siren platform on the fore side, and the searchlights either side of
  // it, which the profile shows abreast the funnel.
  cyl(g, M.brass, 0.22, 0.30, 0.7, 0, PLATFORM_Y + 1.0, FUNNEL_Z + 4.4, 10)
    .rotation.x = Math.PI / 2;

  // The funnel platform.
  //
  // A broad shelf carried right round the stack, well up it and standing well
  // clear of it fore and aft: the profile shows it fourteen metres long and
  // overhanging both ends of the funnel, with the after searchlights on it and
  // two of her 3.7 cm twins standing on it. It is the widest thing on her
  // above the deck and it is what makes the middle of her read as a ship
  // rather than a funnel on a box.
  const py = PLATFORM_Y;
  const pos2 = [];
  const idx2 = [];
  const PN = 10;
  for (let i = 0; i <= PN; i++) {
    const f = i / PN;
    const z = FUNNEL_Z - 6.8 + f * 13.6;
    // Rounded off at both ends, following the funnel's own oval.
    const w = 4.9 * Math.sqrt(Math.max(0.06, 1 - Math.pow((f - 0.5) * 1.86, 4)));
    pos2.push(-w, py, z, w, py, z, -w, py + 0.2, z, w, py + 0.2, z);
  }
  for (let i = 0; i < PN; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx2.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
    idx2.push(a, b, b + 1, a, b + 1, a + 1);
    idx2.push(a, a + 2, b + 2, a, b + 2, b);
    idx2.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
  }
  idx2.push(0, 1, 3, 0, 3, 2);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  pg.setIndex(idx2);
  pg.computeVertexNormals();
  g.add(new THREE.Mesh(pg, M.deckSteel));
  // The brackets that carry it, down onto the funnel casing.
  for (const sgn of [-1, 1]) {
    for (const dz of [-4.6, 0, 4.6]) {
      const br = box(g, M.steelDark, 2.4, 0.14, 0.34, sgn * 3.6, py - 1.1,
        FUNNEL_Z + dz);
      br.rotation.z = sgn * 0.42;
    }
  }
  // The after searchlights, on the after corners of it.
  for (const sgn of [-1, 1]) {
    searchlight(g, sgn * 3.6, py + 1.05, FUNNEL_Z - 5.2);
    cyl(g, M.steelDark, 0.13, 0.13, 0.7, sgn * 3.6, py + 0.55, FUNNEL_Z - 5.2, 6);
  }
  // And a rail round the edge of it.
  for (let i = 0; i <= PN; i++) {
    const f = i / PN;
    const z = FUNNEL_Z - 6.8 + f * 13.6;
    const w = 4.9 * Math.sqrt(Math.max(0.06, 1 - Math.pow((f - 0.5) * 1.86, 4)));
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.08, 0.9, 0.08, sgn * (w - 0.12), py + 0.55, z);
    }
  }
}

// ------------------------------------------------ the after superstructure --

function afterWorks(g) {
  const y = sdeck(-27);
  // The after control position, with its own director and rangefinder on top,
  // standing where the plan puts it -- between the catapult and Bruno.
  // Carried aft to Bruno's rear plate: the profile draws one unbroken mass
  // from the mainmast to the turret, and it used to stop five metres short of
  // her and leave a strip of bare deck showing between the two.
  house(g, M.steel, 4.0, -36, -23, y, 2.4);
  house(g, M.deckSteel, 4.6, -35.4, -23.6, y + 2.4, 0.16);
  const dir = new THREE.Group();
  dir.position.set(0, y + 2.56, -27);
  dir.userData.dynamic = true;
  cyl(dir, M.steel, 1.4, 1.6, 1.0, 0, 0.5, 0, 14);
  sphere(dir, M.steel, 1.4, 0, 1.0, 0, 12).scale.set(1, 0.46, 1);
  tubeX(dir, M.steel, 0.30, 5.6, 0, 1.0, 0.15, 10);
  g.add(dir);
}

// -------------------------------------------------------------- the mast --

/**
 * The mainmast: a light pole abaft the catapult with her wireless aerials on
 * it. The profile shows a plain pole with a single yard and the aerial wires
 * sweeping down to the tower forward and to the stern aft, which is what a
 * ship whose fire control is all in her tower carries aft.
 */
function mainmast(g) {
  const y = sdeck(-20) + 0.16;
  cyl(g, M.steelDark, 0.16, 0.30, 17.0, 0, y + 8.5, -20, 10);
  box(g, M.steelDark, 6.4, 0.13, 0.13, 0, y + 12.8, -20);
  // The aerial wires, sweeping aft and down.
  for (const sgn of [-1, 1]) {
    const w = box(g, M.wire, 0.05, 0.05, 26.0, sgn * 2.2, y + 8.0, -33.0);
    w.rotation.x = 0.30;
  }
  const fwd = box(g, M.wire, 0.05, 0.05, 26.0, 0, y + 9.4, -8.0);
  fwd.rotation.x = -0.24;
}

// -------------------------------------------------- the catapult and crane --

const CAT_Z = -11;
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

/** Her second Arado, struck down abreast the catapult with her wings folded. */
function sparePlane(g) {
  const y = sdeck(-18) + 0.16;
  arado(g, -S * 5.2, y + 0.35, -18, -S * 0.22, true);
  box(g, M.steelDark, 2.6, 0.3, 1.1, -S * 5.2, y + 0.18, -18);
  for (const tx of [-1.0, 1.0]) {
    box(g, M.gunDark, 0.14, 0.1, 6.0, -S * 5.2 + tx, y + 0.05, -15.6);
  }
}

function crane(g) {
  // Just forward of the catapult and offset to starboard, where the plan puts
  // it: she is fished out of the water alongside and swung back onto her
  // trolley, which is the whole of how a catapult ship recovers an aeroplane.
  const y = sdeck(-2) + 0.16;
  const post = new THREE.Group();
  post.position.set(S * 6.0, y, -2);
  cyl(post, M.steelDark, 0.42, 0.52, 5.0, 0, 2.5, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 4.8, 0);
  jib.rotation.z = S * 0.85;
  jib.userData.dynamic = true;
  for (let i = 0; i < 8; i++) {
    const f = i / 7;
    box(jib, M.steelDark, 0.12, 0.12, 0.12, 0, f * 10.0, 0);
  }
  box(jib, M.steelDark, 0.22, 10.0, 0.22, 0, 5.0, 0);
  box(jib, M.steelDark, 0.16, 0.16, 1.0, 0, 10.0, 0);
  post.add(jib);
  g.add(post);
}

// ---------------------------------------------------------------- her boats --

function boats(g) {
  const y = sdeck(-6) + 0.16;
  for (const [x, z, len] of [[S * 6.4, -6, 9.0], [-S * 6.4, -6, 9.0],
    [S * 6.4, 14, 7.6], [-S * 6.4, 14, 7.6]]) {
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
    for (const z of [0, -24, 22]) {
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
    // Inboard, and far enough forward that the disc stays inside her own
    // beam at the station it turns in: a propeller drawn out past her plating
    // is a propeller that would have been ground off alongside a jetty.
    const x = sgn * 3.0;
    const z = -73;
    // The shaft, in its bossing.
    const sh = cyl(g, M.steelDark, 0.40, 0.40, 12.0, x, -5.2, z + 6.0, 10);
    sh.rotation.x = Math.PI / 2;
    const scr = new THREE.Group();
    scr.position.set(x, -5.2, z);
    scr.userData.dynamic = true;
    scr.userData.screw = true;
    cyl(scr, M.brass, 0.32, 0.40, 0.7, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(scr, M.brass, 0.66, 2.0, 0.1, 0, 0, -0.1);
      bl.rotation.z = a;
      bl.position.set(Math.cos(a + Math.PI / 2) * 1.0, Math.sin(a + Math.PI / 2) * 1.0, -0.1);
      bl.rotation.y = 0.4;
    }
    g.add(scr);
    // And the rudder, on the centreline abaft them.
    void scr;
  }
  const rud = new THREE.Group();
  rud.position.set(0, -4.2, -84);
  rud.userData.dynamic = true;
  rud.userData.rudder = true;
  box(rud, M.hullDark, 0.34, 4.6, 3.2, 0, 0, 0);
  g.add(rud);
}

// ------------------------------------------------------- the main battery --

const A_Z = CLS.turrets[0].z;
const Y_Z = CLS.turrets[1].z;

/**
 * A triple 28 cm turret, Drh LC/28.
 *
 * German heavy turrets of this generation are angular and there is not a
 * curve on them. Off the plan and the profile: twelve and a half metres from
 * the rear plate to the face and nine and a bit across, a face raked back
 * about twenty degrees, a flat roof, vertical sides with a hard chamfer where
 * they meet the roof, and shoulders cut off at forty-five degrees where the
 * sides run into the narrower face. The rear plate is the widest part of her
 * and overhangs the ring, which is what carries the counterweight.
 *
 * Built as a lofted solid through eight stations so the chamfers and the rake
 * come out as one closed shell rather than a stack of boxes with seams in it.
 */
function elevenInch(g, x, y, z, aft) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = aft ? Math.PI : 0;
  m.userData.dynamic = true;
  m.userData.trainRate = CLS.gun.traverse;

  // The ring and the collar it trains on.
  cyl(m, M.gunDark, 5.1, 5.3, 0.55, 0, -0.28, 0, 24);

  // Stations from the rear plate forward: [dz, half-breadth at the deck,
  // half-breadth at the roof, roof height]. The roof is narrower than the
  // sides, which is the chamfer.
  const H = 4.3;
  const rows = [
    [-4.60, 4.30, 3.55, H * 0.86],
    [-4.05, 4.62, 3.95, H * 0.96],
    [-2.60, 4.68, 4.05, H],
    [-0.20, 4.68, 4.05, H],
    [2.10, 4.62, 4.00, H],
    [3.55, 4.35, 3.75, H * 0.97],
    [4.85, 3.70, 3.15, H * 0.86],
    [5.55, 3.25, 2.80, H * 0.70],
  ];
  const pos = [];
  const idx = [];
  for (const [dz, wl, wu, h] of rows) {
    pos.push(-wl, 0, dz, wl, 0, dz, -wu, h, dz, wu, h, dz);
  }
  // Wound so that every face looks out of her.
  //
  // They were wound the other way, and a gunhouse whose plating faces inwards
  // is not there at all: back faces are not drawn, so from outside you saw
  // straight through the near side and into the inside of the far one. It
  // reads as a solid turret at a mile and as an open box from the deck, and
  // the gunlayer's camera stands inside it.
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b + 2, a + 2, a, b, b + 2);            // port side
    idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3); // starboard side
    idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3); // roof
    idx.push(a, b + 1, b, a, a + 1, b + 1);            // floor
  }
  const n = (rows.length - 1) * 4;
  idx.push(0, 3, 1, 0, 2, 3);                        // rear plate
  idx.push(n, n + 1, n + 3, n, n + 3, n + 2);        // face
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  m.add(new THREE.Mesh(geo, M.gun));

  // The turret rangefinder: ports out of both after corners of the roof, with
  // the hood between them. The plan draws it as a raised box abaft the
  // sighting hoods.
  box(m, M.gunDark, 3.0, 0.85, 1.7, 0, H + 0.42, -2.9);
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 1.15, 0.8, 1.0, sgn * 4.05, H * 0.78, -2.5);
    cyl(m, M.glass, 0.24, 0.24, 0.1, sgn * 4.62, H * 0.78, -2.5, 8)
      .rotation.z = Math.PI / 2;
  }
  // Sighting hoods either side of the face, and the roof hatches.
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.9, 0.55, 1.3, sgn * 3.3, H + 0.27, 2.2);
    cyl(m, M.gunDark, 0.44, 0.44, 0.24, sgn * 2.2, H + 0.12, -0.6, 10);
  }
  // Rungs up the rear plate, and the training-gear blister on each quarter.
  for (let i = 0; i < 6; i++) {
    box(m, M.gunDark, 0.75, 0.07, 0.07, 0, 0.45 + i * 0.6, -4.66);
  }
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.5, 1.1, 1.6, sgn * 4.55, 1.3, -1.2);
  }

  // The cradle. A Drh LC/28 carries its three barrels in one sleeve -- the
  // outer two are not separately sleeved -- so they elevate together and the
  // blast bags are one across the face.
  // The trunnions stand three metres over the roller path, not two: the
  // profile puts the axis of her barrels ten metres over the water, and they
  // were laid a metre and a bit under that.
  const guns = new THREE.Group();
  guns.position.set(0, 3.15, 3.9);
  guns.rotation.x = -0.03;
  const muzzles = [];
  // Two metres eight between axes, off the plan.
  for (const dx of [-2.8, 0, 2.8]) {
    // Jacket, chase, and the thickened muzzle.
    tubeZ(guns, M.gunDark, 0.47, 3.0, dx, 0, 1.5, 12);
    tubeZ(guns, M.gun, 0.34, 7.4, dx, 0, 6.5, 12);
    tubeZ(guns, M.gunDark, 0.36, 0.55, dx, 0, 10.4, 12);
    muzzles.push([dx, 0, 10.7]);
  }
  // The blast bags where they come through the face.
  for (const dx of [-2.8, 0, 2.8]) {
    cyl(guns, M.canvas, 0.66, 0.78, 1.1, dx, 0, 0.5, 12).rotation.x = Math.PI / 2;
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = [];
  turrets.push(elevenInch(g, 0, deckAt(A_Z) - 0.24, A_Z, false));
  turrets.push(elevenInch(g, 0, deckAt(Y_Z) - 0.24, Y_Z, true));
  g.userData.turrets = turrets;
  return turrets;
}

// ------------------------------------------------------- the other guns --

/**
 * A single 15 cm SK C/28 in an open shield.
 *
 * A surface gun and nothing else: the mounting will not elevate to an
 * aeroplane, which is exactly why she carries a separate heavy anti-aircraft
 * battery and the Admiral Hipper does not. The profile draws them as low
 * three-sided shields open at the back, standing in the walkway at the deck
 * edge with the barrel out over the rail.
 */
function fifteen(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 1.45, 1.6, 0.36, 0, -0.18, 0, 16);
  // The shield: a sloped face, sides that taper aft, and an open back.
  const face = box(m, M.gun, 2.9, 2.15, 0.14, 0, 1.08, 1.42);
  face.rotation.x = -0.14;
  for (const sgn of [-1, 1]) {
    const side = box(m, M.gun, 0.13, 2.15, 2.6, sgn * 1.45, 1.08, 0.15);
    side.rotation.y = sgn * 0.035;
  }
  box(m, M.gun, 2.9, 0.13, 2.7, 0, 2.14, 0.1);
  // The ready-use lockers behind it, which the plan shows at every mounting.
  box(m, M.steelDark, 1.9, 0.7, 0.7, 0, 0.35, -1.5);
  const guns = new THREE.Group();
  guns.position.set(0, 1.08, 1.1);
  guns.rotation.x = -0.035;
  tubeZ(guns, M.gunDark, 0.28, 1.3, 0, 0, 0.65, 10);
  tubeZ(guns, M.gun, 0.20, 6.0, 0, 0, 3.5, 10);
  tubeZ(guns, M.gunDark, 0.215, 0.3, 0, 0, 6.6, 10);
  cyl(guns, M.canvas, 0.38, 0.46, 0.72, 0, 0, 0.32, 10).rotation.x = Math.PI / 2;
  m.add(guns);
  arm(m, guns, [[0, 0, 6.85]]);
  g.add(m);
  return m;
}

/** A twin 10.5 cm SK C/33 on its stabilised C/31 mounting. */
function tenFive(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 1.3, 1.45, 0.34, 0, -0.17, 0, 16);
  // The shield: a rounded front and a squared-off back, which is what a C/31
  // twin looks like from any angle.
  cyl(m, M.gun, 1.5, 1.5, 2.0, 0, 1.0, 0.3, 16);
  box(m, M.gun, 3.0, 2.0, 1.7, 0, 1.0, -0.6);
  box(m, M.gun, 3.0, 0.12, 2.0, 0, 2.0, -0.2);
  const guns = new THREE.Group();
  guns.position.set(0, 1.35, 0.95);
  guns.rotation.x = -0.10;
  const muzzles = [];
  for (const dx of [-0.62, 0.62]) {
    tubeZ(guns, M.gunDark, 0.21, 1.0, dx, 0, 0.5, 10);
    tubeZ(guns, M.gun, 0.14, 4.3, dx, 0, 2.6, 10);
    muzzles.push([dx, 0, 4.85]);
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/** A twin 3.7 cm SK C/30 on its hand-worked stabilised mounting. */
function threeSeven(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 0.70, 0.80, 0.28, 0, -0.14, 0, 12);
  // The cradle frame and the two layers' seats, which is most of what you see
  // of one of these.
  box(m, M.gunDark, 1.5, 0.62, 1.2, 0, 0.31, -0.1);
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.14, 0.9, 0.8, sgn * 0.72, 0.92, -0.15);
    box(m, M.steelDark, 0.34, 0.08, 0.34, sgn * 0.98, 0.88, -0.6);
    box(m, M.steelDark, 0.1, 0.42, 0.1, sgn * 0.98, 0.66, -0.6);
  }
  const guns = new THREE.Group();
  guns.position.set(0, 0.96, 0.15);
  guns.rotation.x = -0.20;
  const muzzles = [];
  for (const dx of [-0.30, 0.30]) {
    tubeZ(guns, M.gunDark, 0.11, 0.55, dx, 0, 0.28, 8);
    tubeZ(guns, M.gun, 0.055, 2.4, dx, 0, 1.45, 8);
    muzzles.push([dx, 0, 2.75]);
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
  cyl(m, M.gunDark, 0.32, 0.40, 0.9, 0, 0.45, 0, 10);
  box(m, M.gunDark, 0.48, 0.3, 0.48, 0, 1.0, 0);
  const guns = new THREE.Group();
  guns.position.set(0, 1.05, 0.1);
  guns.rotation.x = -0.28;
  tubeZ(guns, M.gun, 0.045, 1.9, 0, 0, 0.95, 8);
  // The drum magazine, the shoulder rest and the conical flash hider.
  cyl(guns, M.gunDark, 0.17, 0.17, 0.1, 0.13, 0.1, 0.5, 10).rotation.z = Math.PI / 2;
  box(guns, M.gunDark, 0.22, 0.16, 0.34, 0, -0.14, -0.28);
  cyl(guns, M.gunDark, 0.1, 0.055, 0.24, 0, 0, 1.95, 8).rotation.x = Math.PI / 2;
  m.add(guns);
  arm(m, guns, [[0, 0, 2.05]]);
  g.add(m);
  return m;
}

/**
 * A quadruple bank of 53.3 cm tubes on the quarterdeck.
 *
 * The plan draws two of them abaft Bruno, one each side, each a squat body
 * with four tubes side by side and the reload rails behind. Side by side, not
 * two over two: it is a low mounting on an open deck.
 */
function torpedoBank(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  m.userData.trainRate = CLS.torpedoes.traverse;
  cyl(m, M.steelDark, 0.9, 1.0, 0.44, 0, -0.22, 0, 14);
  box(m, M.steelDark, 3.4, 0.55, 1.8, 0, 0.28, -0.4);
  const muzzles = [];
  for (const dx of [-1.28, -0.43, 0.43, 1.28]) {
    tubeZ(m, M.steel, 0.36, 8.4, dx, 0.85, 0, 12);
    cyl(m, M.gunDark, 0.38, 0.38, 0.22, dx, 0.85, 4.3, 12).rotation.x = Math.PI / 2;
    // The tube's own bands.
    for (const dz of [-2.6, 0, 2.6]) {
      cyl(m, M.steelDark, 0.39, 0.39, 0.16, dx, 0.85, dz, 12).rotation.x = Math.PI / 2;
    }
    muzzles.push([dx, 0.85, 4.5]);
  }
  // The layer's platform and sight on the inboard side.
  box(m, M.steelDark, 0.6, 0.1, 0.6, -1.95, 0.5, 0.8);
  cyl(m, M.steelDark, 0.09, 0.09, 0.9, -1.95, 0.95, 0.8, 8);
  arm(m, m, muzzles);
  g.add(m);
  return m;
}

function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  // The fifteens stand in the walkway at the deck edge, outboard of the
  // superstructure, which is where a Panzerschiff's single mounts are and what
  // the plan draws.
  for (const m of CLS.secondary.mounts) {
    sec.push(fifteen(g, m.x, deckAt(m.z) + 0.04, m.z, m.angle));
  }
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let y;
      if (gun.caliber === 105) {
        // Two on sponsons off the superstructure deck abreast the funnel, one
        // right aft on the roof of the after control position.
        y = m.x === 0 ? sdeck(-27) + 3.16 : sdeck(m.z) + 0.16;
      } else if (gun.caliber === 37) {
        // The forward pair stand on the funnel platform, well up the stack;
        // the after pair on the superstructure deck.
        y = m.z > 0 ? PLATFORM_Y + 0.2 : sdeck(m.z) + 0.16;
      } else {
        // The twenties are wherever there is a rail to bolt one to: on the
        // superstructure where there is superstructure, on the weather deck
        // forward and aft where there is not.
        y = (m.z < SDECK_Z1 && m.z > SDECK_Z0)
          ? sdeck(m.z) + 0.16 : deckAt(m.z) + 0.04;
      }
      aa.push(gun.caliber === 105 ? tenFive(g, m.x, y, m.z, m.angle)
        : gun.caliber === 37 ? threeSeven(g, m.x, y, m.z, m.angle)
          : twoCm(g, m.x, y, m.z, m.angle));
    }
  }
  for (const m of CLS.torpedoes.mounts) {
    torp.push(torpedoBank(g, m.x, deckAt(m.z) + 0.04, m.z, m.angle));
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
}

/**
 * The sponsons the two waist 10.5 cm mountings stand on, and the platforms
 * under the 3.7 cm twins. They are part of the ship rather than part of the
 * gun, so they are built with her and welded into her.
 */
function sponsons(g) {
  for (const gun of CLS.aa.guns) {
    if (gun.caliber !== 105 && gun.caliber !== 37) continue;
    for (const m of gun.mounts) {
      if (m.x === 0) continue;
      // The funnel platform carries its own guns; it does not want a sponson
      // hanging in the air twelve metres under each of them.
      if (gun.caliber === 37 && m.z > 0) continue;
      const y = sdeck(m.z);
      const r = gun.caliber === 105 ? 2.3 : 1.5;
      const inboard = sHalf(m.z);
      // Only where the mounting stands outboard of the house it is bracketed
      // to: a platform under a gun that is already on the deck is a step.
      if (Math.abs(m.x) <= inboard + 0.2) continue;
      cyl(g, M.deckSteel, r, r, 0.18, m.x, y + 0.08, m.z, 14);
      // The brackets down to the house side.
      for (const dz of [-r * 0.7, r * 0.7]) {
        const br = box(g, M.steelDark, Math.abs(m.x) - inboard + 0.4, 0.12, 0.35,
          (m.x + Math.sign(m.x) * inboard) / 2, y - 0.9, m.z + dz);
        br.rotation.z = Math.sign(m.x) * 0.5;
      }
    }
  }
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
  ['mainmast', mainmast],
  ['catapult', catapult],
  ['sparePlane', sparePlane],
  ['crane', crane],
  ['sponsons', sponsons],
  ['boats', boats],
  ['groundTackle', groundTackle],
  ['screws', screws],
];

/**
 * The barbettes her two turrets train on, which are ship and not gun.
 *
 * They barely stand out of the deck: both turrets are on the weather deck and
 * the plan shows only the roller-path ring round each of them, a few inches
 * proud, with the training rack inside it.
 */
function barbettes(g) {
  for (const z of [A_Z, Y_Z]) {
    const y = deckAt(z);
    cyl(g, M.steel, 5.25, 5.4, 0.5, 0, y + 0.25, z, 24);
    cyl(g, M.deckSteel, 5.6, 5.6, 0.14, 0, y + 0.07, z, 24);
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

export { sheer, shellAt, zAt, keelY, deckAt as deckEdge };
