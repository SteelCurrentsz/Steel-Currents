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
  box, cyl, tubeZ, tubeX, sphere, smooth, loftRings, loftShape, ladder,
  fairTable, bullnose, planRun, grow,
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
// Thinner across, and full further out towards both ends.
//
// She was drawn fat amidships and needle-fine at the quarters: eleven metres
// of half-breadth falling away to seven by a quarter of her length from the
// transom. From above that reads as a short fat ship with two spikes on it,
// which is the opposite of what a Panzerschiff is -- a hundred and eighty-six
// metres on twenty-one and a half, the proportions of a big cruiser. So the
// maximum comes in by four tenths of a metre and the run aft carries her
// breadth half a station further, which is a longer parallel middle body and
// a shorter, finer taper at each end: leaner across and longer along.
const HALF_BEAM = [
  [-1.00, 0.76], [-0.96, 1.44], [-0.90, 2.52], [-0.84, 3.46], [-0.78, 4.35],
  [-0.68, 5.68], [-0.57, 6.89], [-0.46, 7.94], [-0.34, 8.88], [-0.20, 9.52],
  [-0.06, 9.78], [0.06, 9.82], [0.20, 9.74], [0.34, 9.45], [0.46, 8.82],
  [0.57, 7.85], [0.68, 6.48], [0.78, 4.82], [0.86, 3.26], [0.92, 1.93],
  [0.96, 1.01], [1.00, 0.11],
];

// Her keel and the rise of floor at both ends, off the profile: a flat
// bottom over the machinery, the forefoot sweeping up into a nearly upright
// stem, and the run aft lifting to a counter that clears two screws and a
// single rudder on the centreline.
const KEEL = [
  [-1.00, -1.10], [-0.94, -4.35], [-0.88, -5.95], [-0.80, -6.86], [-0.66, -7.34],
  [-0.34, -7.44], [0.14, -7.44], [0.42, -7.32], [0.62, -6.86], [0.78, -5.42],
  [0.89, -3.15], [0.95, -0.50], [1.00, 1.90],
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
// There is a break in it right aft.
//
// Her plan does not run one sheer line from the stem to the counter. The deck
// carries aft at upper deck level as far as the after mooring space and then
// steps down a metre to a short low quarterdeck, and the two quadruple tube
// mountings and her after capstans are on that lower deck. It is the one thing
// that tells her stern from a cruiser's at any distance, and it is drawn on
// every profile of her.
//
// The step is put between two stations of the loft -- t = -0.715 and -0.696,
// which are frames the shell is actually built at -- so it comes out as a
// break rather than as a ramp smeared across three metres of her.
const SHEER = [
  [-1.00, 4.42], [-0.92, 4.62], [-0.84, 4.78], [-0.760, 4.90],
  [-0.715, 4.95], [-0.696, 5.95], [-0.660, 6.12], [-0.600, 6.22],
  [-0.44, 6.30], [-0.20, 6.38], [0.00, 6.44], [0.22, 6.56], [0.40, 6.74],
  [0.55, 6.98], [0.68, 7.32], [0.78, 7.78], [0.86, 8.28], [0.92, 8.74],
  [0.96, 9.06], [1.00, 9.40],
];

// How far outboard of the waterline the deck edge is carried, in metres.
//
// Modest the whole way, which is the point. A ship without an Atlantic bow
// does not have two metres of flare at the forecastle: she has a hand's
// breadth amidships opening to about a metre forward, and that is why she
// shipped water over Anton in any sort of sea.
const FLARE = [
  [-1.00, 0.08], [-0.60, 0.12], [-0.20, 0.16], [0.10, 0.20], [0.32, 0.34],
  [0.46, 0.54], [0.58, 0.80], [0.68, 1.04], [0.76, 1.22], [0.82, 1.26],
  [0.88, 1.12], [0.93, 0.84], [0.97, 0.45], [1.00, 0.10],
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
const STEM = 6.2;
const COUNTER = 3.0;
function stemAt(y) {
  return STEM * Math.pow(Math.min(1, Math.max(0, y + 7.4) / 16.8), 1.30);
}
function counterAt(y) {
  return COUNTER * Math.pow(Math.min(1, Math.max(0, y + 1.4) / 6.7), 1.45);
}

// The round of her counter.
//
// Her shell is lofted as two panels at plus and minus the half-breadth, so
// where they meet at the after end they meet at an edge -- and an edge nine
// metres tall, with the whole of her run converging on it, reads from astern
// as a wedge driven into the sea. A cruiser stern is round: the station line
// at the very end is carried forward by the radius and the plate across it
// bulges aft to meet the panels on a curve, so what closes her is a rounded
// counter and not a knife.
const COUNTER_R = 0.85;

/** How much of the round applies here: 1 at the sternpost, 0 by frame 180. */
function counterK(t) {
  return smooth(Math.max(0, Math.min(1, (-t - 0.962) / 0.038)));
}

/** How far aft of the station line the plating stands, at `u` of the breadth. */
function counterBulge(t, u) {
  const k = counterK(t);
  if (k <= 0) return 0;
  const a = Math.min(1, Math.abs(u));
  return -COUNTER_R * k * Math.sqrt(Math.max(0, 1 - Math.pow(a, 4)));
}

function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.46) z += smooth((t - 0.46) / 0.54) * (stemAt(y) - STEM);
  else if (t < -0.80) z -= smooth((-t - 0.80) / 0.20) * (counterAt(y) - COUNTER);
  // The corner line, carried forward so the round has room to happen.
  return z + COUNTER_R * counterK(t);
}

/** Her deck edge at a station, in metres from amidships. */
export function deckAt(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return sheer(t) + 0.28;
}

/**
 * Her deck at a station and a distance off the centreline.
 *
 * `deckAt` is the crown of it. Her deck rounds down a quarter of a metre from
 * the centreline to the waterway, so anything standing out near the deck edge
 * -- a bollard, a fairlead, a ventilator -- has to be set to the round of her
 * or it stands that much clear of her planking.
 */
export function deckAtX(x, z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  const y = sheer(t);
  const w = Math.max(0.3, shellAt(t, y));
  const u = Math.min(1, Math.abs(x) / w);
  return y + (1 - u * u) * 0.28;
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
 *
 * Lofted in `RUNGS` courses up the band rather than one course from edge to
 * edge. Her stem and her counter are both raked, and the rake is a curve in
 * `zAt`: a band with a vertex only at its top and its bottom chords straight
 * across that curve, and at the ends -- where the rake is steepest -- the
 * chord falls short of the plate that closes her by four tenths of a metre.
 * That was the slit of daylight down her counter, and a narrower one at her
 * stem. Following the curve closes both, and gives her section the round it
 * should have had between strakes as well.
 */
const RUNGS = 6;
function loftBand(g, m, lo, hi) {
  const loAt = typeof lo === 'function' ? lo : () => lo;
  const hiAt = typeof hi === 'function' ? hi : () => hi;
  const pos = [];
  const idx = [];
  const per = (RUNGS + 1) * 2;
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const kb = keelY(t);
    const a = Math.max(loAt(t), kb);
    const b = Math.max(hiAt(t), kb);
    for (let r = 0; r <= RUNGS; r++) {
      const y = a + ((b - a) * r) / RUNGS;
      const w = shellAt(t, y);
      const z = zAt(t, y);
      pos.push(-w, y, z, w, y, z);
    }
  }
  for (let i = 0; i < STATIONS; i++) {
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
  g.add(new THREE.Mesh(geo, m));
}

/** The flat that closes her in at one end, cut to her own section there. */
function cap(g, t, facing) {
  // Across the breadth as well as up, so the counter can be the rounded plate
  // it is instead of one quad meeting her panels at an edge.
  const NX = 10;
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const pos = [];
    const idx = [];
    // The same courses the band beside it is lofted in, so the two agree
    // vertex for vertex where they meet: sample the rake at different heights
    // and a sliver of daylight opens between them however fine the sampling.
    const N = RUNGS;
    // Her deck is cambered and this plate closes against it, so the top edge
    // of the top strake has to carry the same round-up. Left flat it ran a
    // quarter of a metre under the deck the whole way across, and the deck
    // stood over the counter as a lip with a slot of daylight under it.
    const crowned = Math.abs(hi - sheer(t)) < 1e-6;
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = shellAt(t, y);
      const z = zAt(t, y);
      for (let j = 0; j <= NX; j++) {
        const u = -1 + (2 * j) / NX;
        const crown = crowned ? (1 - u * u) * 0.28 * (i / N) : 0;
        pos.push(u * w, y + crown, z + counterBulge(t, u));
      }
    }
    const per = NX + 1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < NX; j++) {
        const a = i * per + j;
        const b = (i + 1) * per + j;
        if (facing > 0) idx.push(a, a + 1, b + 1, a, b + 1, b);
        else idx.push(a, b + 1, a + 1, a, b, b + 1);
      }
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

/**
 * The weather deck, one flush sheet from the stem to the transom.
 *
 * Cambered, and carried round the counter. It was a dead flat sheet two
 * vertices wide: a deck with no camber at all reads as a sheet of plate glass
 * laid over her, because every highlight on it runs in one unbroken line from
 * her stem to her transom instead of breaking at the crown.
 */
function weatherDeck(g) {
  const pos = [];
  const idx = [];
  const CAM = 5;
  const across = CAM * 2 + 1;
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const y = sheer(t);
    const w = shellAt(t, y);
    const z = zAt(t, y);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;
      // A quarter of a metre of round-up on eleven of half-breadth, which is
      // what a German cruiser's weather deck was given. The figure is the same
      // one `deckAt` stands off the sheer line by, so `deckAt(z)` is her deck
      // on the centreline and `deckAtX` is her deck anywhere else.
      const crown = (1 - u * u) * 0.28;
      pos.push(u * w, y + crown, z + counterBulge(t, u));
    }
  }
  // Wound so her deck faces the sky. Taken the other way round it is a
  // perfectly good deck seen from underneath: it draws correctly from any
  // camera outside her, and a ray dropped on it from above goes straight
  // through -- so nothing standing on her has anything under it, and every
  // shell that lands on her deck lands in her machinery instead.
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
  // The steel margin plate at the deck edge, which is what a rail stands on.
  //
  // Laid along the deck edge rather than square to the keel. Her waterway
  // curves in plan and her ends curve hard: a plate set square to the
  // centreline follows the edge amidships, hangs out over her side where the
  // edge turns in, and at the stem -- where the deck is a hand's breadth
  // across -- stands out on both sides of a hull that is narrower than the
  // plate is wide.
  for (let i = 0; i < STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const t2 = -1 + (2 * (i + 1)) / STATIONS;
    const y = sheer(t);
    const y2 = sheer(t2);
    const w = shellAt(t, y);
    const w2 = shellAt(t2, y2);
    if (Math.min(w, w2) < 1.3) continue;         // no waterway on a knife edge
    const z = zAt(t, y);
    const z2 = zAt(t2, y2);
    for (const sgn of [-1, 1]) {
      const x0 = sgn * (w - 0.3);
      const x1 = sgn * (w2 - 0.3);
      const dx = x1 - x0;
      const dz = z2 - z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      box(g, M.deckSteel, 0.55, 0.10, len + 0.06, (x0 + x1) / 2,
        (y + y2) / 2 + 0.05, (z + z2) / 2, Math.atan2(dx, dz));
    }
  }
}

/**
 * What is on her plating.
 *
 * Her shell was three painted strakes and a row of plate seams and nothing
 * else: from abeam -- which is the bearing a ship is nearly always seen from
 * -- a hundred and eighty-six metres of it had not one thing on it to give the
 * eye a scale, and with nothing to measure her against she read as a short
 * ship. What her drawings show is a row of scuttles the whole length of her
 * upper deck with a second row over the machinery, the sheer strake's own
 * riveted seam under the deck edge, and the scuppers that drain her waterway.
 */
function sideDetail(g) {
  const at = (z, drop) => {
    const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
    const y = sheer(t) - drop;
    return [shellAt(t, y), y, zAt(t, y)];
  };
  // The upper row, a metre and a half under the deck edge, the whole length of
  // her; and the lower row over the machinery spaces only.
  for (const [z0, z1, drop, step] of [[-76, 76, 1.55, 3.3], [-32, 44, 3.45, 3.3]]) {
    for (let z = z0; z <= z1; z += step) {
      const [w, y, zz] = at(z, drop);
      if (w < 2.2) continue;
      // Not through a hawse pipe, and not through the anchor's own recess.
      if (Math.abs(z - 76) < 3) continue;
      for (const sgn of [-1, 1]) {
        cyl(g, M.glass, 0.16, 0.16, 0.09, sgn * (w + 0.02), y, zz, 8)
          .rotation.z = Math.PI / 2;
        cyl(g, M.steel, 0.20, 0.20, 0.05, sgn * (w + 0.05), y, zz, 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }
  // The sheer strake's seam: a riveted lap under the deck edge, run the length
  // of her as short plates that follow her own line.
  const SEG = 74;
  for (let i = 0; i < SEG; i++) {
    const z = -80 + (i * 160) / SEG;
    const z2 = -80 + ((i + 1) * 160) / SEG;
    const [w, y, za] = at(z, 0.85);
    const [w2, , zb] = at(z2, 0.85);
    if (w < 1.6 || w2 < 1.6) continue;
    const len = Math.abs(zb - za);
    if (len < 0.05) continue;
    for (const sgn of [-1, 1]) {
      const o = box(g, M.hullDark, 0.1, 0.16, len + 0.05,
        sgn * ((w + w2) / 2 + 0.03), y, (za + zb) / 2);
      o.rotation.y = Math.atan2(sgn * (w2 - w), zb - za);
    }
  }
  // And the scuppers, which is where her waterway drains over the side.
  for (let z = -72; z <= 72; z += 8) {
    const [w, y, zz] = at(z, 0.42);
    if (w < 2.5) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.gunDark, 0.14, 0.2, 0.34, sgn * (w + 0.04), y, zz);
      cyl(g, M.cave, 0.09, 0.09, 0.12, sgn * (w + 0.09), y, zz, 6)
        .rotation.z = Math.PI / 2;
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
  // Flat-shaded, one normal to a face.
  //
  // A house shares the vertices along its deck edge between its side, its roof
  // and its end plate, and averaging the three gives the side a normal that
  // tilts up at the top of the wall and down at the bottom. With a light over
  // her that shades every deckhouse on the ship from bright at the eaves to
  // nearly black at the deck -- so her superstructure read as a dark band
  // running the length of her instead of as painted steel, which is the one
  // thing every photograph of her shows it as.
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(flat, m);
  g.add(mesh);
  return mesh;
}

// ------------------------------------------------- fittings for the works --
//
// The small parts every level of her upperworks is made of. A tower is not a
// stack of boxes: it is a stack of boxes with rails round every open deck,
// windows right round every enclosed one, a door and a ladder on both sides of
// each of them, and brackets under everything that overhangs. Drawn once here
// so both sides of her get the same, and so a level is four lines rather than
// forty.

/**
 * Guard rails round an open platform.
 *
 * A stanchion every metre and a half and three wires rove through them,
 * following a list of [x, z] corners. `close` runs the last corner back to the
 * first; leave it off where the run ends against a house side.
 */
function railLoop(g, pts, y, opts = {}) {
  const { h = 1.02, close = true, step = 1.5 } = opts;
  const n = pts.length;
  if (n < 2) return;
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
      box(g, M.steelDark, 0.07, h, 0.07, a[0] + dx * f, y + h / 2, a[1] + dz * f);
    }
    for (const wy of [0.38, 0.68, 0.97]) {
      box(g, M.wire, 0.045, 0.045, len, a[0] + dx / 2, y + wy, a[1] + dz / 2,
        Math.atan2(dx, dz));
    }
  }
  const end = pts[close ? 0 : n - 1];
  box(g, M.steelDark, 0.07, h, 0.07, end[0], y + h / 2, end[1]);
}

/** The same, round a rectangular platform. */
function railRect(g, half, z0, z1, y, opts) {
  railLoop(g, [[-half, z0], [-half, z1], [half, z1], [half, z0]], y, opts);
}

/**
 * The knees under a platform that overhangs the level below it.
 *
 * A deck carried out past the house under it stands on brackets, and without
 * them it reads as a shelf floating in the air -- which is exactly what the
 * eye catches from the beam.
 */
function knees(g, from, to, y, zs) {
  const span = Math.abs(to - from);
  if (span < 0.3) return;
  for (const z of zs) {
    for (const sgn of [-1, 1]) {
      const k = box(g, M.steel, span + 0.5, 0.85, 0.13,
        sgn * (from + to) / 2, y - 0.42, z);
      k.rotation.z = -sgn * 0.62;
    }
  }
}

/**
 * The brackets under a platform, taken off the platform's own outline.
 *
 * `knees` sets a pair at a fixed distance off the centreline, which works
 * under a rectangular shelf and nothing else: under a rounded one the bracket
 * stands in the air where the plan has come in and sticks out past the eave
 * where it has not. This walks the outline, finds what is under each point of
 * it, and rakes a bracket down to that -- so a platform is carried where it
 * overhangs and left alone where it does not.
 */
function kneesRound(g, outer, inner, y, every = 3, drop = 1.45) {
  for (let i = 0; i < outer.length; i += every) {
    const [x, z] = outer[i];
    // Taken off one beam and mirrored, never off the point list. A ring is a
    // mirror-symmetric set of points but index i is not the mirror of index
    // i + k, so stepping through it hands brackets to one side of her and not
    // the other -- which is exactly the fault this whole model is checked for.
    if (x < -1e-6) continue;
    let bx = 0;
    let bz = 0;
    let bd = Infinity;
    for (const [px, pz] of inner) {
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; bx = px; bz = pz; }
    }
    if (bd < 0.4) continue;                  // nothing overhanging to carry
    // A slim raking strut, not a plate: a bracket given a face half a metre
    // deep comes out of the rotation edge-on to nothing in particular and
    // reads from the beam as a row of fins round every platform on her.
    for (const sgn of x > 1e-6 ? [-1, 1] : [1]) {
      member(g, M.steel, 0.16, [sgn * x, y - 0.13, z],
        [sgn * bx, y - Math.min(drop, bd * 1.35), bz], 0.1);
    }
  }
}

/** A row of bridge windows across a face that looks fore or aft. */
function winFwd(g, half, y, z, n, w = 1.2) {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    box(g, M.glass, w, 0.98, 0.1, f * (half - w * 0.75), y, z);
  }
}

/** And a row down one side, at a station either side of the middle of it. */
function winSide(g, half, y, z0, z1, n, w = 1.2) {
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      box(g, M.glass, 0.1, 0.98, w, sgn * half, y, z0 + (z1 - z0) * f);
    }
  }
}

/** A watertight door in a side face, with the dogs down its shut edge. */
function doorSide(g, half, y, z) {
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.09, 1.85, 0.86, sgn * half, y + 0.93, z);
    box(g, M.bright, 0.05, 0.09, 0.66, sgn * (half + 0.03), y + 0.93, z);
    box(g, M.bright, 0.05, 0.55, 0.07, sgn * (half + 0.03), y + 0.93, z + 0.36);
  }
}

/** Scuttles: a row of them at one height, both sides. */
function scuttles(g, half, y, z0, z1, step = 1.7) {
  for (let z = z0; z <= z1 + 1e-6; z += step) {
    const w = typeof half === 'function' ? half(z) : half;
    for (const sgn of [-1, 1]) {
      cyl(g, M.glass, 0.16, 0.16, 0.09, sgn * (w + 0.02), y, z, 8)
        .rotation.z = Math.PI / 2;
      // The rim in her own paint, not in white: a scuttle is a brass ring
      // painted over, and picked out bright it reads at any range as a row of
      // portholes the size of dinner plates.
      cyl(g, M.steel, 0.20, 0.20, 0.05, sgn * (w + 0.05), y, z, 8)
        .rotation.z = Math.PI / 2;
    }
  }
}

/** A signal lamp on a pedestal: one on each bridge wing. */
function signalLamp(g, x, y, z) {
  cyl(g, M.steelDark, 0.09, 0.11, 1.15, x, y + 0.58, z, 8);
  cyl(g, M.steel, 0.26, 0.26, 0.34, x, y + 1.3, z, 12).rotation.x = Math.PI / 2;
  cyl(g, M.glass, 0.24, 0.24, 0.05, x, y + 1.3, z + 0.19, 12).rotation.x = Math.PI / 2;
}

/** A pelorus: the bearing repeater a navigating officer takes a fix on. */
function pelorus(g, x, y, z) {
  cyl(g, M.steelDark, 0.08, 0.11, 1.0, x, y + 0.5, z, 8);
  cyl(g, M.brass, 0.21, 0.21, 0.14, x, y + 1.06, z, 12);
  box(g, M.bright, 0.5, 0.04, 0.04, x, y + 1.14, z);
}

/**
 * A member between two points: a stay, an aerial, a strut, a bracket.
 *
 * Three's default Euler order is XYZ, so the yaw has to be taken against the
 * member's length in the y-z plane rather than against its run in z alone --
 * get that wrong and a wire leaves both its ends behind.
 */
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

/** A ventilator cowl, turned to the wind. */
function cowl(g, x, y, z, r = 0.3, h = 1.5) {
  cyl(g, M.steel, r, r * 1.1, h, x, y + h / 2, z, 10);
  const bell = cyl(g, M.steel, r * 1.5, r * 1.05, r * 1.5, x, y + h + r * 0.5, z, 10);
  bell.rotation.x = -0.85;
  cyl(g, M.cave, r * 1.35, r * 1.35, 0.06, x, y + h + r * 0.95, z + r * 0.9, 10)
    .rotation.x = Math.PI / 2 - 0.85;
}



/** A level of the tower: its plating from `y0` to `y1`, on a plan. */
function levelOf(g, m, pts, y0, y1) {
  return loftShape(g, m, [{ pts, y: y0 }, { pts, y: y1 }], { cap: false });
}

/** The plate over it, carried a little proud so the level has an eave. */
function roofOf(g, pts, y, t = 0.17) {
  return loftShape(g, M.deckSteel, [{ pts, y: y - t }, { pts, y }],
    { floor: true });
}


/**
 * Glazing carried round a plan, panel by panel.
 *
 * Windows laid as boxes at plus and minus a half-breadth land inside the
 * plating the moment the plating stops being flat, which is the whole of why
 * a rounded bridge front used to come out blind. This walks the outline and
 * sets a light into every panel of it, turned to the panel, with a mullion at
 * each seam -- so a bridge is glazed round its own front the way it was.
 *
 * `keep` is handed the midpoint of a panel and says whether it is glazed;
 * leave it off and the level is glazed the whole way round but the back.
 */
function glazeRound(g, pts, y, h, keep) {
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
    box(g, M.glass, 0.14, h, len * 0.82, mx + nx * 0.02, y, mz + nz * 0.02,
      Math.atan2(dx, dz));
    // Both seams of this light, not the forward one only. Taken one to a
    // light, the run of mullions comes out shifted a panel round the ring
    // from the run on the other bow -- and a bridge with one more window
    // frame to port than to starboard is exactly the fault the symmetry
    // check exists to catch.
    posts.add(i);
    posts.add((i + 1) % n);
  }
  for (const i of posts) {
    box(g, M.steel, 0.16, h + 0.1, 0.16, pts[i][0] * 1.01, y, pts[i][1] * 1.0);
  }
}

/** A watertight door set into whichever panel of a plan is nearest [x, z]. */
function doorAt(g, pts, y, x, z) {
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
  box(g, M.steelDark, 0.1, 1.92, 0.96, mx, y + 0.96, mz, ry);
  box(g, M.gunDark, 0.12, 1.78, 0.84, mx, y + 0.95, mz, ry);
  box(g, M.bright, 0.06, 0.1, 0.62, mx, y + 0.95, mz, ry);
}

/** A life raft, lashed flat to a house side, as the Germans carried them. */
function raft(g, x, y, z, len = 2.2) {
  const r = box(g, M.raft, 0.3, 0.72, len, x, y, z);
  r.rotation.z = 0.08 * Math.sign(x || 1);
  box(g, M.steelDark, 0.34, 0.06, len * 0.9, x, y + 0.3, z);
  box(g, M.steelDark, 0.34, 0.06, len * 0.9, x, y - 0.3, z);
}

// -------------------------------------------------------- her superstructure

function superstructure(g) {
  const y = deckAt(0);
  // One long house, rounded off at both ends and following her own breadth
  // down its length. It was a box with two square corners on it.
  const pRun = planRun(sHalf, SDECK_Z0, SDECK_Z1, 5.2, 3.4);
  levelOf(g, M.steel, pRun, y, y + SDECK_H);
  roofOf(g, planRun((z) => sHalf(z) + 0.1, SDECK_Z0 - 0.1, SDECK_Z1 + 0.1, 5.2, 3.4),
    y + SDECK_H + 0.16);
  // Two rows of scuttles down both sides of her, as the profile draws them,
  // and a watertight door out on to the walkway at each end of each side.
  scuttles(g, sHalf, y + 1.05, SDECK_Z0 + 3, SDECK_Z1 - 3, 1.8);
  scuttles(g, sHalf, y + 2.25, SDECK_Z0 + 3, SDECK_Z1 - 3, 1.8);
  for (const z of [34, 18, -6, -26]) doorSide(g, sHalf(z), y, z);
  // Ladders down to the weather deck at both ends, both sides.
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * (sHalf(36) - 0.4), y, y + SDECK_H, 36, 33.4);
    ladder(g, M.steelDark, sgn * (sHalf(-30) - 0.4), y, y + SDECK_H, -30, -27.4);
  }
  // Guard rails down both edges of the superstructure deck. It is a three-metre
  // fall from it to the weather deck and her people work along it all day, so
  // the kit photograph shows a rail the whole length of both sides and so does
  // she now.
  const edge = [];
  for (let z = SDECK_Z0 + 0.5; z <= SDECK_Z1 - 0.5; z += 3.0) edge.push(z);
  edge.push(SDECK_Z1 - 0.5);
  for (const sgn of [-1, 1]) {
    railLoop(g, edge.map((z) => [sgn * (sHalf(z) - 0.35), z]), y + SDECK_H + 0.16,
      { close: false, step: 3.0 });
  }

  // Life rafts on both sides of her, where a German ship stowed them: flat
  // against the house, out of the way of the guns' crews.
  for (const sgn of [-1, 1]) {
    for (const z of [30, 26, -14, -18]) {
      raft(g, sgn * (sHalf(z) + 0.2), y + 1.7, z);
    }
  }

  // The lower bridge block between Anton and the tower: a wide low house with
  // the conning tower buried in the front of it. The plan draws it as an
  // eight-sided grey mass a good deal broader than the tower above it.
  const b = y + SDECK_H;
  const BH = 4.5;
  const pBlk = bullnose(6.8, 29, 38.9, 2.2, { arc: 5, side: 6, back: 4 });
  levelOf(g, M.steel, pBlk, b, b + BH);
  // And its forward end, one deck lower: the profile steps down a metre and a
  // half over the last three metres before the notch of open deck abaft Anton,
  // and a block carried out level to forty-one is a wall where she has a step.
  //
  // Bullnosed, because the admiral's bridge looks out of the front of it and a
  // German bridge front is a radius. Squared off, this was the flattest face
  // on the ship and the first thing the eye landed on.
  const pAdm = bullnose(6.2, 38.2, 41.4, 3.4, { arc: 7, side: 2, back: 3 });
  levelOf(g, M.steel, pAdm, b, b + 3.1);
  roofOf(g, grow(pAdm, 0.14), b + 3.1 + 0.16);
  scuttles(g, 6.2, b + 1.5, 39.0, 39.8, 1.6);
  railLoop(g, grow(pAdm, -0.2), b + 3.1 + 0.16);
  // Her people live and work in it, so it is not a blank box: scuttles down
  // both sides, a door out on each beam, and the bridge messenger's ladder.
  // Stopping at the break, not past it. Both rows ran on to thirty-nine and a
  // half at the wider block's own breadth, and forward of thirty-eight the
  // block is narrower: the last scuttle of each row stood half a metre off her
  // plating with nothing behind it.
  scuttles(g, 6.8, b + 1.5, 30.5, 37.7, 1.8);
  scuttles(g, 6.8, b + 3.1, 30.5, 37.7, 1.8);
  doorSide(g, 6.8, b, 33.5);
  doorSide(g, 6.8, b, 38.0);
  // The admiral's bridge looks out of the front of it, right round the
  // bullnose and back down both sides to the break.
  glazeRound(g, pAdm, b + 1.9, 1.0, (x, z) => z > 38.4);
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * 5.4, b, b + BH, 29.6, 32.2);
    raft(g, sgn * 7.0, b + 2.3, 35.6, 2.6);
  }
  // The armoured conning tower standing in it -- a cylinder with a vision slit
  // right round, and the roof of it carried out over the bridge front. The
  // profile puts the top of it sixteen metres over the water, a metre and a
  // half clear of the bridge deck round its foot.
  // Set at thirty-seven and a half rather than out on the block's forward end:
  // the profile has her front sloping up from thirteen metres at forty-one to
  // sixteen at thirty-eight, and a drum carried right out to the front of the
  // block flattens that into a wall.
  // Four and a half metres across, not six: a conning tower is a place for
  // four men and a wheel behind fifteen centimetres of Wotan, and drawn any
  // fatter it flattens the whole front of her bridge into a wall. The profile
  // has a narrow peak at thirty-eight and the bridge deck a metre and a half
  // under it either side.
  cyl(g, M.steel, 2.15, 2.30, 5.70, 0, b + 2.85, 36.8, 18);
  cyl(g, M.cave, 2.32, 2.32, 0.30, 0, b + 4.35, 36.8, 18);      // the slit
  cyl(g, M.gunDark, 2.45, 2.45, 0.30, 0, b + 5.85, 36.8, 20);
  for (let i = 0; i < 8; i++) {                    // rungs up the after side
    box(g, M.steelDark, 0.5, 0.05, 0.05, 0, b + 0.5 + i * 0.62, 34.4);
  }
  // And the open deck round it, which the plan shows as a broad platform:
  // railed, bracketed where it stands out past the house, and carrying the
  // pelorus and the ready-use lockers a navigating bridge works from.
  const bd = b + BH;
  const pBd = bullnose(5.6, 32.6, 38.6, 2.4, { arc: 5, side: 3, back: 3 });
  roofOf(g, grow(pBlk, 0.14), bd);
  loftShape(g, M.deckSteel, [{ pts: pBd, y: bd }, { pts: pBd, y: bd + 0.16 }],
    { floor: true });
  railLoop(g, grow(pBd, -0.2), bd + 0.16);
  railRect(g, 6.8, 29.2, 32.6, bd + 0.16, { close: false });
  for (const sgn of [-1, 1]) {
    // On the bridge deck, which ends at thirty-eight and a bit. They were put
    // at forty, out past the front of it, standing on the air over the step.
    pelorus(g, sgn * 4.4, bd + 0.16, 37.6);
    box(g, M.steelDark, 0.9, 0.8, 1.5, sgn * 4.7, bd + 0.56, 34.4);
    cowl(g, sgn * 5.9, bd + 0.16, 31.2, 0.26, 1.2);
  }
}

// Where the tower's topmast yard finishes up, so the mainmast can rig her
// wireless aerials to it rather than to the air. Written by `tower`, read by
// `mainmast`; STATIC builds them in that order.
let TOPMAST_YARD = { half: 2.7, y: 32.2, z: 19.6 };

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
// Every enclosed level is glazed right round, because that is what it is for:
// a bridge is a place people look out of. Every open one is railed and stands
// on knees where it overhangs. Both sides get the same, which is not a detail
// -- a tower detailed to starboard and blank to port is the one fault you
// cannot see from the side you built it on.
//
// The FuMO 22 mattress is bolted to the front of the cupola: a flat
// rectangular aerial of dipoles on a frame, six metres by two, and the first
// radar set anybody took to sea in a warship.

const TOWER_Z = 24;

function tower(g) {
  const base = sdeck(TOWER_Z);

  // ---- the trunk. Broad and armoured, not a lattice: this is the point.
  const T0 = 5.4;
  const p0 = bullnose(T0, TOWER_Z - 5.4, TOWER_Z + 5.0, 3.6);
  levelOf(g, M.steel, p0, base, base + 4.4);
  scuttles(g, T0, base + 1.4, TOWER_Z - 4.2, TOWER_Z + 1.2, 1.7);
  scuttles(g, T0, base + 3.0, TOWER_Z - 4.2, TOWER_Z + 1.2, 1.7);
  doorSide(g, T0, base, TOWER_Z - 3.4);
  // The wheelhouse is in here and looks out of it: a band of lights round the
  // bullnose, which is what the forward face of the trunk was.
  glazeRound(g, p0, base + 2.9, 1.0, (x, z) => z > TOWER_Z + 1.0);
  for (const sgn of [-1, 1]) {
    raft(g, sgn * (T0 + 0.2), base + 2.6, TOWER_Z - 3.6, 2.4);
    cowl(g, sgn * (T0 - 1.2), base + 4.4, TOWER_Z - 4.6, 0.24, 1.0);
    // The armoured cable trunk up the after face, which is how the tower is
    // fed, and the sockets the bridge awning spreads off.
    box(g, M.steelDark, 0.5, 4.4, 0.5, sgn * 2.6, base + 2.2, TOWER_Z - 5.5);
  }

  // ---- the navigating bridge, wrapped round the trunk one deck up, with
  // open wings carried out to either side.
  const b1 = base + 4.4;
  const T1 = 6.9;
  const p1 = bullnose(T1, TOWER_Z - 4.6, TOWER_Z + 4.4, 4.6);
  levelOf(g, M.steel, p1, b1, b1 + 3.1);
  // Glazed round the bullnose and down both sides; the after bulkhead carries
  // the chart-house lights instead.
  glazeRound(g, p1, b1 + 1.7, 1.15, (x, z) => z > TOWER_Z - 3.8);
  winFwd(g, T1 - 2.2, b1 + 1.7, TOWER_Z - 4.68, 3, 1.0);
  doorAt(g, p1, b1, T1, TOWER_Z - 3.2);
  doorAt(g, p1, b1, -T1, TOWER_Z - 3.2);
  // The splinter mattresses lashed along the bridge front, which is what every
  // photograph of her off Montevideo shows there: laid on the panels of her
  // own plan rather than on an arc that is not the one she is built to.
  for (let i = 0; i < p1.length; i++) {
    const a = p1[i];
    const b = p1[(i + 1) % p1.length];
    const mz = (a[1] + b[1]) / 2;
    if (mz < TOWER_Z - 1.0) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const mx = (a[0] + b[0]) / 2;
    box(g, M.canvas, 0.26, 0.74, len * 0.84,
      mx - (dz / len) * 0.14, b1 + 0.66, mz + (dx / len) * 0.14,
      Math.atan2(dx, dz));
  }
  // The wings: the bridge deck carried right out to the beam, on knees, with
  // the lamp and the pelorus each side that make a wing a wing.
  const WING = 9.6;
  const b1r = b1 + 3.1;
  const pWing = bullnose(WING, TOWER_Z - 5.4, TOWER_Z + 5.2, 5.4);
  roofOf(g, grow(p1, 0.18), b1r);
  loftShape(g, M.deckSteel, [{ pts: pWing, y: b1r - 0.16 }, { pts: pWing, y: b1r }],
    { floor: true });
  kneesRound(g, pWing, p1, b1r, 3, 1.9);
  railLoop(g, grow(pWing, -0.16), b1r);
  for (const sgn of [-1, 1]) {
    signalLamp(g, sgn * (WING - 1.1), b1r, TOWER_Z + 1.9);
    pelorus(g, sgn * (WING - 2.6), b1r, TOWER_Z + 0.2);
    // The engine-room telegraph on the wing, and the wing screen behind it.
    cyl(g, M.brass, 0.24, 0.28, 0.95, sgn * (WING - 3.8), b1r + 0.48,
      TOWER_Z - 1.4, 10);
    box(g, M.steelDark, 0.16, 1.05, 4.4, sgn * (WING - 0.3), b1r + 0.53,
      TOWER_Z - 2.6);
    // Flag lockers under the screen, which is what a wing is mostly full of.
    for (const dz of [-4.2, -3.1]) {
      box(g, M.steelDark, 1.0, 0.74, 0.95, sgn * (WING - 1.0), b1r + 0.37,
        TOWER_Z + dz);
    }
  }

  // ---- the chart house, narrower, above the bridge.
  const b2 = b1r + 0.16;
  const T2 = 4.7;
  const p2 = bullnose(T2, TOWER_Z - 3.9, TOWER_Z + 3.5, 3.6);
  levelOf(g, M.steel, p2, b2, b2 + 3.0);
  glazeRound(g, p2, b2 + 1.6, 1.05, (x, z) => z > TOWER_Z - 3.2);
  doorAt(g, p2, b2, T2, TOWER_Z - 2.8);
  doorAt(g, p2, b2, -T2, TOWER_Z - 2.8);
  for (const sgn of [-1, 1]) ladder(g, M.steelDark, sgn * 3.4, b2, b2 + 3.0,
    TOWER_Z - 4.0, TOWER_Z - 2.0);

  // ---- the searchlight platform, carried out either side of it: the profile
  // shows a light on each wing at this level.
  const b3 = b2 + 3.0;
  const T3 = 6.5;
  const p3 = bullnose(T3, TOWER_Z - 2.8, TOWER_Z + 3.0, 3.4);
  roofOf(g, grow(p2, 0.16), b3);
  loftShape(g, M.deckSteel, [{ pts: p3, y: b3 - 0.16 }, { pts: p3, y: b3 }],
    { floor: true });
  kneesRound(g, p3, p2, b3, 3, 1.5);
  railLoop(g, grow(p3, -0.16), b3);
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 2.2, 0.14, 2.2, sgn * 5.2, b3 + 0.08, TOWER_Z - 0.4);
    cyl(g, M.steelDark, 0.12, 0.12, 2.4, sgn * 5.2, b3 - 1.2, TOWER_Z - 0.4, 6);
    // On the plate, not eight tenths of a metre over it.
    searchlight(g, sgn * 5.2, b3 + 0.16, TOWER_Z - 0.4);
    // The lookout's binocular stand forward of the light, on the wing.
    cyl(g, M.steelDark, 0.09, 0.12, 1.25, sgn * 4.4, b3 + 0.79, TOWER_Z + 2.1, 8);
    box(g, M.gunDark, 0.5, 0.18, 0.3, sgn * 4.4, b3 + 1.48, TOWER_Z + 2.1);
  }

  // ---- the upper control position, glazed all round: it is a lookout, and
  // the men in it are the ones who see the enemy first.
  const T4 = 3.4;
  const p4 = bullnose(T4, TOWER_Z - 3.0, TOWER_Z + 2.6, 2.8, { side: 3 });
  levelOf(g, M.steel, p4, b3, b3 + 2.9);
  glazeRound(g, p4, b3 + 1.6, 1.0);
  const b4 = b3 + 2.9;

  // ---- the platform the anti-aircraft directors stand on.
  const T5 = 4.4;
  const p5 = bullnose(T5, TOWER_Z - 2.6, TOWER_Z + 2.4, 2.8, { side: 3 });
  roofOf(g, grow(p4, 0.14), b4);
  loftShape(g, M.deckSteel, [{ pts: p5, y: b4 - 0.16 }, { pts: p5, y: b4 }],
    { floor: true });
  kneesRound(g, p5, p4, b4, 3, 1.2);
  railLoop(g, grow(p5, -0.16), b4);
  for (const sgn of [-1, 1]) {
    const d = new THREE.Group();
    d.position.set(sgn * 3.3, b4 + 0.16, TOWER_Z - 0.6);
    d.userData.dynamic = true;
    cyl(d, M.steel, 0.62, 0.7, 1.0, 0, 0.5, 0, 12);
    sphere(d, M.steel, 0.7, 0, 1.0, 0, 10).scale.set(1, 0.6, 1);
    tubeX(d, M.steel, 0.16, 2.4, 0, 1.05, 0.1, 8);
    g.add(d);
  }

  // ---- the trunk carrying the fire-control top, with its own little
  // platform round the foot of it.
  const b5 = b4 + 0.16;
  cyl(g, M.steel, 1.9, 2.2, 3.6, 0, b5 + 1.8, TOWER_Z, 16);
  for (let i = 0; i < 10; i++) {                     // the rungs up it
    box(g, M.steelDark, 0.6, 0.06, 0.06, 0, b5 + 0.35 + i * 0.34, TOWER_Z - 2.16);
  }

  // ---- the top itself, and the great rangefinder across it. Ten and a half
  // metres of base length, which is very nearly half her beam.
  //
  // The cupola is a drum, not a box: her foretop was a cylinder with the
  // rangefinder's trunnions out through the sides of it and a domed hood over
  // the top, and the whole of it trains.
  const dir = new THREE.Group();
  dir.position.set(0, b5 + 3.6, TOWER_Z);
  dir.userData.dynamic = true;
  loftRings(dir, M.steel, [
    [2.55, 2.55, 0, 0.0], [2.62, 2.68, 0, 0.35], [2.62, 2.68, 0, 1.85],
    [2.50, 2.56, 0, 2.20], [2.28, 2.34, 0, 2.55],
  ], { n: 22, px: 1, pz: 1, cap: false, floor: true });
  // Sighting ports round it, so it reads as a thing men are looking out of.
  for (let i = 0; i < 16; i++) {
    const a = ((i - 7.5) / 16) * Math.PI * 2 * 0.62;
    box(dir, M.glass, 0.12, 0.52, 0.78, 2.60 * Math.sin(a), 1.30,
      2.66 * Math.cos(a), a);
  }
  // The hood over the top of it, and the rangefinder itself.
  cyl(dir, M.steel, 2.05, 2.32, 0.5, 0, 2.80, 0, 20);
  sphere(dir, M.steel, 2.05, 0, 3.05, 0, 16).scale.set(1, 0.44, 1);
  tubeX(dir, M.steel, 0.42, 10.5, 0, 3.10, 0.25, 12);
  for (const sgn of [-1, 1]) {
    box(dir, M.glass, 0.16, 0.44, 0.44, sgn * 5.2, 3.10, 0.5);
    // The counterweight housings either side of the trunnions.
    box(dir, M.steelDark, 0.7, 0.5, 0.7, sgn * 1.5, 3.10, -0.55);
    // And the hoods over the rangefinder's own end windows.
    box(dir, M.steelDark, 0.42, 0.14, 0.5, sgn * 5.2, 3.36, 0.42);
  }
  // The radar. A flat mattress of dipoles on a rectangular frame, bolted to
  // the front of the cupola, and the first set anybody took to sea.
  const mattress = new THREE.Group();
  mattress.position.set(0, 3.10, 2.35);
  box(mattress, M.radar, 6.0, 1.9, 0.16, 0, 0, 0);
  for (let i = 0; i < 9; i++) {
    const x = -2.6 + i * 0.65;
    box(mattress, M.bright, 0.06, 1.5, 0.06, x, 0, 0.14);
    box(mattress, M.bright, 0.5, 0.06, 0.06, x, 0.42, 0.22);
    box(mattress, M.bright, 0.5, 0.06, 0.06, x, -0.42, 0.22);
  }
  // The frame it stands off the cupola on.
  for (const sgn of [-1, 1]) {
    box(mattress, M.steelDark, 0.12, 0.12, 1.3, sgn * 1.9, 0.7, -0.68);
    box(mattress, M.steelDark, 0.12, 0.12, 1.3, sgn * 1.9, -0.7, -0.68);
  }
  dir.add(mattress);
  g.add(dir);

  // ---- the topmast abaft the tower, carrying her wireless aerials, with a
  // yard and the spreaders the aerials are rove through. The profile puts her
  // truck thirty-four metres over the water.
  //
  // It is stepped four and a half metres abaft the tower's centre, and the
  // director platform stops two and a half abaft it: the mast stood in the
  // air off her after face. So the step it wants is built -- a platform
  // butted against the after face of the upper control position and carried
  // on knees off it, which is what is under a German topmast.
  const mz = TOWER_Z - 4.4;
  box(g, M.deckSteel, 3.2, 0.16, 2.8, 0, b4 + 0.08, mz);
  for (const sgn of [-1, 1]) {
    const kn = box(g, M.steel, 1.5, 0.14, 0.4, sgn * 1.1, b4 - 0.5, mz - 0.6);
    kn.rotation.x = 0.55;
    member(g, M.steel, 0.16, [sgn * 1.5, b4 - 0.06, mz - 1.3],
      [sgn * 1.5, b4 - 1.9, TOWER_Z - 2.9]);
  }
  railRect(g, 1.6, mz - 1.4, mz + 1.4, b4 + 0.16, { close: false });
  cyl(g, M.steelDark, 0.14, 0.24, 11.0, 0, b4 + 5.66, mz, 10);
  box(g, M.steelDark, 5.4, 0.12, 0.12, 0, b4 + 8.56, mz);
  TOPMAST_YARD = { half: 2.7, y: b4 + 8.56, z: mz };
  box(g, M.steelDark, 3.4, 0.1, 0.1, 0, b4 + 10.36, mz);
  for (const sgn of [-1, 1]) {
    const stay = box(g, M.wire, 0.05, 0.05, 6.4, sgn * 1.4, b4 + 4.4, TOWER_Z - 2.6);
    stay.rotation.x = -0.75;
    stay.rotation.z = sgn * 0.2;
  }

  // ---- and the ladders a man actually gets up her by, on both sides.
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * 3.0, base, b1, TOWER_Z + 3.8, TOWER_Z + 3.8);
    ladder(g, M.steelDark, sgn * 2.5, b1, b2, TOWER_Z + 3.0, TOWER_Z + 3.0);
    ladder(g, M.steelDark, sgn * 2.1, b2, b3, TOWER_Z + 2.6, TOWER_Z + 2.6);
    ladder(g, M.steelDark, sgn * 1.8, b3, b4, TOWER_Z + 2.2, TOWER_Z + 2.2);
  }
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

// -------------------------------------------------- inside her upperworks --
//
// Her hull has an interior fitted to her own lines, and the tower gets decks
// and bulkheads measured off its plating (see interior.js). What neither of
// them puts in is what a bridge is actually full of: a wheel, two telegraphs,
// a chart table, a compass and the men's chairs. A shell through the front of
// a bridge that opens on to an empty box is worse than one that does not open
// at all, and hers opens on to the room.
//
// Everything here hangs under a group marked `inside`, which is what the weld
// keys off: it goes in the one buffer that is never taken away, so it is there
// the moment the plating in front of it is.

/** The wheel: a rim, a hub and eight spokes, on its pedestal. */
function wheel(g, x, y, z, r = 0.62) {
  cyl(g, M.steelDark, 0.16, 0.24, 1.05, x, y + 0.52, z, 10);
  box(g, M.gunDark, 0.5, 0.34, 0.4, x, y + 1.16, z);
  const rim = cyl(g, M.brass, r, r, 0.09, x, y + 1.34, z + 0.24, 20);
  rim.rotation.x = Math.PI / 2;
  cyl(g, M.brass, r * 0.82, r * 0.82, 0.11, x, y + 1.34, z + 0.24, 20)
    .rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = box(g, M.brass, 0.06, r * 1.7, 0.06, x, y + 1.34, z + 0.24);
    sp.rotation.z = a;
    box(g, M.brass, 0.07, 0.2, 0.07,
      x + Math.sin(a) * r * 1.02, y + 1.34 + Math.cos(a) * r * 1.02, z + 0.26);
  }
}

/** An engine-room telegraph: the brass dial a bridge rings her orders on. */
function telegraph(g, x, y, z) {
  cyl(g, M.steelDark, 0.15, 0.2, 0.95, x, y + 0.47, z, 10);
  cyl(g, M.brass, 0.34, 0.34, 0.16, x, y + 1.05, z, 16).rotation.x = Math.PI / 2;
  cyl(g, M.mark, 0.28, 0.28, 0.05, x, y + 1.05, z + 0.1, 16).rotation.x = Math.PI / 2;
  box(g, M.gunDark, 0.05, 0.3, 0.05, x, y + 1.14, z + 0.14);
  box(g, M.brass, 0.42, 0.06, 0.06, x, y + 1.05, z + 0.16);
}

/** A binnacle: the compass under its hood, on the centreline. */
function binnacle(g, x, y, z) {
  cyl(g, M.brass, 0.24, 0.3, 1.1, x, y + 0.55, z, 12);
  sphere(g, M.brass, 0.3, x, y + 1.2, z, 12).scale.set(1, 0.8, 1);
  cyl(g, M.glass, 0.22, 0.22, 0.06, x, y + 1.42, z, 12);
  for (const sgn of [-1, 1]) sphere(g, M.gunDark, 0.16, x + sgn * 0.42, y + 1.1, z, 8);
}

/** A chart table with a chart on it and a light over it. */
function chartTable(g, x, y, z, w = 2.4, d = 1.2) {
  box(g, M.steelDark, w, 0.08, d, x, y + 0.92, z);
  box(g, M.mark, w - 0.3, 0.02, d - 0.2, x, y + 0.97, z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(g, M.steelDark, 0.07, 0.9, 0.07, x + sx * (w / 2 - 0.14), y + 0.45,
        z + sz * (d / 2 - 0.12));
    }
  }
  box(g, M.steelDark, 0.4, 0.06, 0.2, x, y + 1.85, z);
  cyl(g, M.mark, 0.1, 0.1, 0.1, x, y + 1.76, z, 8);
}

/** A watchkeeper's chair, bolted down as they were. */
function chair(g, x, y, z, ry = 0) {
  cyl(g, M.steelDark, 0.13, 0.2, 0.62, x, y + 0.31, z, 8);
  box(g, M.canvas, 0.5, 0.09, 0.48, x, y + 0.66, z, ry);
  box(g, M.canvas, 0.5, 0.6, 0.08, x, y + 0.98, z - 0.22, ry);
}

/** A voice pipe: the brass mouth a bridge talks to the ship through. */
function voicePipe(g, x, y, z, h = 1.3) {
  cyl(g, M.brass, 0.055, 0.07, h, x, y + h / 2, z, 8);
  const bell = cyl(g, M.brass, 0.13, 0.07, 0.2, x, y + h + 0.08, z, 10);
  bell.rotation.x = -0.5;
}

/** A repeater or transmitter dial on a bulkhead. */
function dial(g, x, y, z, r = 0.2, ry = 0) {
  cyl(g, M.gunDark, r, r, 0.1, x, y, z, 12).rotation.set(Math.PI / 2, 0, ry);
  cyl(g, M.mark, r * 0.8, r * 0.8, 0.04, x, y, z + 0.06, 12)
    .rotation.set(Math.PI / 2, 0, ry);
}

/**
 * What is inside her bridge, her chart house, her conning tower and her upper
 * control position -- one level at a time, from the bottom up.
 */
function bridgeInside(g) {
  const inside = new THREE.Group();
  inside.userData.inside = true;
  g.add(inside);
  const i = inside;
  const y0 = deckAt(0);
  const b = y0 + SDECK_H;                          // the bridge block's sole
  const base = sdeck(TOWER_Z);                     // the tower's

  // ---- the admiral's bridge, in the block abaft Anton. A sea cabin, the
  // table he takes his meals and his decisions at, and the chairs round it.
  chartTable(i, 0, b, 39.2, 2.8, 1.4);
  for (const sgn of [-1, 1]) chair(i, sgn * 1.9, b, 39.2, sgn * 1.2);
  chair(i, 0, b, 37.4, Math.PI);
  box(i, M.steelDark, 1.6, 1.9, 0.5, 0, b + 0.95, 35.0);      // chart lockers
  for (const sgn of [-1, 1]) {
    box(i, M.canvas, 0.9, 0.4, 2.0, sgn * 4.6, b + 0.6, 33.6);  // bunks
    dial(i, sgn * 3.0, b + 1.7, 40.9, 0.22);
  }

  // ---- the conning tower: a wheel, a telegraph either side of it, and the
  // armoured sight slit to look out of. Four men and fifteen centimetres of
  // Wotan, which is the whole of what a conning tower is.
  wheel(i, 0, b + 0.1, 36.0, 0.5);
  for (const sgn of [-1, 1]) telegraph(i, sgn * 1.15, b + 0.1, 36.3);
  binnacle(i, 0, b + 0.1, 37.9);
  voicePipe(i, 0.75, b + 0.1, 35.4);
  voicePipe(i, -0.75, b + 0.1, 35.4);

  // ---- the wheelhouse, in the trunk of the tower under the bridge: the
  // sea-going steering position, and the one she is actually conned from.
  wheel(i, 0, base + 0.1, 27.0);
  for (const sgn of [-1, 1]) {
    telegraph(i, sgn * 1.5, base + 0.1, 27.4);
    chair(i, sgn * 3.2, base + 0.1, 26.0, sgn * 0.6);
    voicePipe(i, sgn * 2.2, base + 0.1, 28.0);
    // Abaft the nose of the trunk: at twenty-eight and nine the bullnose is
    // half a metre off the centreline and a dial a metre out stood through it.
    dial(i, sgn * 1.0, base + 1.9, 27.3, 0.2);
  }
  binnacle(i, 0, base + 0.1, 28.4);
  chartTable(i, 0, base + 0.1, 22.0, 2.6, 1.3);
  box(i, M.steelDark, 3.6, 2.0, 0.5, 0, base + 1.0, 19.0);     // the after bulkhead gear

  // ---- the navigating bridge above it: the compass platform's own binnacle,
  // the captain's chair, the plot, and the telegraphs repeated.
  const b1 = base + 4.4;
  binnacle(i, 0, b1 + 0.1, 27.6);
  wheel(i, 0, b1 + 0.1, 26.2, 0.52);
  for (const sgn of [-1, 1]) {
    telegraph(i, sgn * 1.4, b1 + 0.1, 26.6);
    chair(i, sgn * 4.2, b1 + 0.1, 26.4, sgn * 0.7);
    voicePipe(i, sgn * 2.6, b1 + 0.1, 24.6);
    // On the after bulkhead, not the bullnose: her bridge front is a radius
    // and at twenty-eight and a third it is a metre and a half off the
    // centreline, so a repeat five metres out stood in the open air.
    dial(i, sgn * 3.4, b1 + 1.8, 20.2, 0.22);
    dial(i, sgn * 5.0, b1 + 1.8, 20.2, 0.18);
  }
  chartTable(i, 0, b1 + 0.1, 21.4, 3.0, 1.4);
  box(i, M.steelDark, 5.2, 2.2, 0.55, 0, b1 + 1.1, 19.9);      // signal lockers

  // ---- the chart house over that: the plotting table she navigates on, the
  // wireless office beside it, and the chart drawers under both.
  const b2 = b1 + 3.1 + 0.16;
  chartTable(i, 0, b2 + 0.1, 25.4, 3.2, 1.6);
  box(i, M.steelDark, 2.2, 1.5, 0.6, 0, b2 + 0.75, 21.6);
  for (const sgn of [-1, 1]) {
    box(i, M.gunDark, 1.0, 1.3, 0.55, sgn * 2.8, b2 + 0.65, 21.8);
    dial(i, sgn * 2.8, b2 + 1.5, 21.5, 0.16);
    chair(i, sgn * 2.6, b2 + 0.1, 23.6, Math.PI);
  }

  // ---- the upper control position at the top: the gunnery officer's seat,
  // his transmitting gear, and the ready plot of the range.
  const b3 = b2 + 3.0;
  for (const sgn of [-1, 1]) {
    chair(i, sgn * 1.5, b3 + 0.1, 24.6, 0);
    dial(i, sgn * 1.6, b3 + 1.6, 25.2, 0.2);
  }
  box(i, M.gunDark, 2.6, 1.2, 0.6, 0, b3 + 0.7, 22.2);
  chartTable(i, 0, b3 + 0.1, 23.6, 2.0, 1.0);
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
  const rxT = 3.8 - 0.66;
  const rzT = 2.6 - 0.50;
  // The black top and the cave down the middle of it.
  cyl(g, M.gunDark, 2.7, 2.9, 1.0, 0, top - 0.5, FUNNEL_Z, 20).scale.set(1, 1, 0.68);
  cyl(g, M.cave, 2.45, 2.45, 0.3, 0, top - 0.05, FUNNEL_Z, 18).scale.set(1, 1, 0.68);
  // The cap.
  //
  // A ring of brackets round the rim and nothing on them: from any bearing the
  // funnel was an open pipe with a row of blocks round its mouth. What belongs
  // there is the plate they carry -- the flat oval cap, a hand's breadth clear
  // of the rim all round so the smoke still draws, with the clinker screen
  // showing in the gap under it.
  const capPos = [];
  const capIdx = [];
  const CR = 1.14;                 // how far the cap oversails the rim
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const cx = Math.cos(a) * (rxT + CR);
    const cz = FUNNEL_Z + Math.sin(a) * (rzT + CR);
    capPos.push(cx, top + 0.72, cz, cx, top + 0.94, cz);
  }
  const hubLo = capPos.length / 3;
  capPos.push(0, top + 0.72, FUNNEL_Z, 0, top + 0.94, FUNNEL_Z);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a = i * 2;
    const b = j * 2;
    // Wound outward, up and down respectively. The rings run counter-clockwise
    // seen from above, so a fan taken in ring order faces down and a band
    // taken in ring order faces inboard: all three were the wrong way round,
    // and a cap whose top is not drawn is a cap you see the sky through.
    capIdx.push(a, b + 1, b, a, a + 1, b + 1);          // the rim band
    capIdx.push(hubLo + 1, b + 1, a + 1);               // the top
    capIdx.push(hubLo, a, b);                           // and the underside
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  capGeo.setIndex(capIdx);
  const capFlat = capGeo.toNonIndexed();
  capFlat.computeVertexNormals();
  g.add(new THREE.Mesh(capFlat, M.gunDark));
  // The brackets that hold it off the rim, and the clinker screen behind them.
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    box(g, M.gunDark, 0.66, 0.66, 0.30,
      Math.cos(a) * (rxT + 0.5), top + 0.4, FUNNEL_Z + Math.sin(a) * (rzT + 0.4), -a);
  }
  for (let i = 0; i < N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2;
    box(g, M.cave, 0.1, 0.62, 0.22,
      Math.cos(a) * (rxT + 0.06), top + 0.38, FUNNEL_Z + Math.sin(a) * (rzT + 0.04), -a);
  }
  // Steam and exhaust pipes up the after side.
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.16, 0.16, 10.4, sgn * 1.6, y + 5.2, FUNNEL_Z - 2.5, 8);
  }
  // The siren platform on the fore side, and the searchlights either side of
  // it, which the profile shows abreast the funnel.
  // On a stand off the platform, which it was half a metre clear of.
  cyl(g, M.steelDark, 0.13, 0.16, 0.85, 0, PLATFORM_Y + 0.62, FUNNEL_Z + 4.4, 8);
  cyl(g, M.brass, 0.22, 0.30, 0.7, 0, PLATFORM_Y + 1.15, FUNNEL_Z + 4.4, 10)
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
  // Wound out of her, every face of it. The whole shelf was inside out -- top,
  // bottom and both sides -- so from above you looked down through the widest
  // platform on her and on to the casing under it, and one of its two ends was
  // never closed at all.
  for (let i = 0; i < PN; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx2.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);   // the deck, up
    idx2.push(a, b + 1, b, a, a + 1, b + 1);               // the soffit, down
    idx2.push(a, b + 2, a + 2, a, b, b + 2);               // port, outboard
    idx2.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3);   // and starboard
  }
  idx2.push(0, 3, 1, 0, 2, 3);                             // the after end
  const e2 = PN * 4;
  idx2.push(e2, e2 + 1, e2 + 3, e2, e2 + 3, e2 + 2);       // and the fore end
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  pg.setIndex(idx2);
  const pgFlat = pg.toNonIndexed();
  pgFlat.computeVertexNormals();
  g.add(new THREE.Mesh(pgFlat, M.deckSteel));
  // The brackets that carry it, down onto the funnel casing.
  //
  // Only where the casing is. The platform is thirteen and a half metres long
  // and the funnel four and a half, so the brackets at four and a half metres
  // fore and aft of it reached for plating that is not there and hung in the
  // air off both ends of her funnel. What carries the overhangs is a pair of
  // raking struts each end, running inboard and down to the casing itself.
  for (const sgn of [-1, 1]) {
    for (const dz of [-1.5, 0, 1.5]) {
      const br = box(g, M.steelDark, 2.4, 0.14, 0.34, sgn * 3.6, py - 1.1,
        FUNNEL_Z + dz);
      br.rotation.z = sgn * 0.42;
    }
    for (const end of [-1, 1]) {
      member(g, M.steelDark, 0.24,
        [sgn * 1.7, py - 0.1, FUNNEL_Z + end * 6.1],
        [sgn * 1.1, py - 3.0, FUNNEL_Z + end * 2.15]);
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


// ----------------------------------------------------- her machinery casing --
//
// What is under her funnel is not a boiler uptake.
//
// She is a diesel ship, and that is the whole point of her: eight MAN
// nine-cylinder double-acting two-strokes in two engine rooms, geared through
// Vulcan couplings on to two shafts, which is where the sixteen thousand miles
// of endurance a commerce raider needs comes from. So what runs along the boat
// deck between the tower and the catapult is the casing over those engine
// rooms -- the exhaust trunk up into the stack, the air the engines breathe
// coming down through cowls on top of it, the silencers either side of the
// funnel's foot, and the two auxiliary boilers that make her steam for
// everything the diesels do not, venting into the same stack.
//
// It stood on that deck and it was drawn as bare plating.

function machinery(g) {
  const y = sdeck(FUNNEL_Z) + 0.16;

  /** One run of casing: plating, a grating roof over it, and its coaming. */
  const run = (z0, z1, half, h) => {
    const pts = planRun(half, z0, z1, 1.3, 1.3, { n: 6, arc: 3 });
    levelOf(g, M.steel, pts, y, y + h);
    roofOf(g, grow(pts, 0.12), y + h + 0.14);
    // The stiffeners down both sides, which is what a casing side actually is.
    for (const sgn of [-1, 1]) {
      for (let z = z0 + 1.2; z <= z1 - 1.2; z += 1.8) {
        box(g, M.steel, 0.12, h - 0.2, 0.22, sgn * (half + 0.06), y + h / 2, z);
      }
    }
    return pts;
  };

  // Forward of the stack: number one engine room, up against the tower.
  const fwd = run(7.6, 18.2, 4.3, 1.75);
  // Abaft it: number two, ending short of the catapult's training ring.
  const aft = run(-9.0, 1.4, 4.0, 1.6);

  // The engine-room supply cowls. Eight of them, turned out to either beam,
  // because sixteen thousand horsepower of diesel wants a great deal of air.
  for (const sgn of [-1, 1]) {
    for (const z of [9.4, 12.6, 15.8]) cowl(g, sgn * 3.1, y + 1.89, z, 0.42, 2.1);
    for (const z of [-7.4, -4.2]) cowl(g, sgn * 2.9, y + 1.74, z, 0.40, 2.0);
    // Mushroom heads on the casing tops, over the spaces that are not engine
    // rooms: the generator flat and the workshop.
    for (const z of [11.0, 14.2, 17.4]) {
      cyl(g, M.steelDark, 0.34, 0.30, 0.42, sgn * 1.5, y + 2.10, z, 10);
      cyl(g, M.steel, 0.46, 0.46, 0.09, sgn * 1.5, y + 2.36, z, 10);
    }
    for (const z of [-1.0, -5.6]) {
      cyl(g, M.steelDark, 0.34, 0.30, 0.42, sgn * 1.5, y + 1.95, z, 10);
      cyl(g, M.steel, 0.46, 0.46, 0.09, sgn * 1.5, y + 2.21, z, 10);
    }
    // The engine-room skylights: a frame of glass over each space, which is
    // how a man on the boat deck knows what is under his feet.
    for (const z of [8.6, 16.6]) {
      box(g, M.steelDark, 2.4, 0.22, 1.5, sgn * 2.0, y + 1.86, z);
      box(g, M.glass, 2.0, 0.1, 1.15, sgn * 2.0, y + 1.98, z);
    }
    // The silencers: two drums off the funnel's foot, lagged and banded, with
    // the trunk from each of them into the stack.
    cyl(g, M.steelDark, 0.92, 0.92, 4.2, sgn * 4.4, y + 2.1, FUNNEL_Z, 14);
    for (const dy of [0.7, 2.1, 3.5]) {
      cyl(g, M.steel, 1.0, 1.0, 0.2, sgn * 4.4, y + dy, FUNNEL_Z, 14);
    }
    member(g, M.steelDark, 0.7, [sgn * 4.4, y + 3.9, FUNNEL_Z],
      [sgn * 2.4, y + 4.9, FUNNEL_Z], 0.1, 0.7);
    // And the ladder up the casing side, so the deck above is reachable.
    ladder(g, M.steelDark, sgn * 3.4, y, y + 1.89, 18.0, 16.6);
  }

  // The auxiliary boiler room's own uptake, trunked up the after side of the
  // stack: she still needs steam for her galleys, her heating and her
  // distillers, and it has to go somewhere.
  loftRings(g, M.steel, [
    [1.5, 0.75, FUNNEL_Z - 3.5, y + 1.6], [1.4, 0.70, FUNNEL_Z - 3.2, y + 4.4],
    [1.2, 0.60, FUNNEL_Z - 3.0, y + 6.6],
  ], { n: 14, px: 1, pz: 1, cap: true });

  // Rails round both casing tops, so her people can work along them.
  railLoop(g, grow(fwd, -0.25), y + 1.89, { step: 2.2 });
  railLoop(g, grow(aft, -0.25), y + 1.74, { step: 2.2 });
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
  const yard = y + 12.8;
  // The ensign staff right aft, which is what her after aerials come down to.
  const sz = -87.5;
  const sy = deckAt(sz);
  cyl(g, M.bright, 0.08, 0.12, 5.2, 0, sy + 2.6, sz, 8);
  cyl(g, M.steelDark, 0.24, 0.30, 0.4, 0, sy + 0.2, sz, 10);
  // Her wireless aerials: rove from the topmast yard on the tower, through the
  // mainmast yard, and down to the staff.
  //
  // They used to be two lengths of wire laid across the air abaft her, held at
  // neither end: a box rotated about its own middle keeps neither end where
  // the thing it is made fast to is. Every one of them now runs between two
  // points that exist.
  for (const sgn of [-1, 1]) {
    member(g, M.wire, 0.05, [sgn * 3.15, yard, -20],
      [sgn * TOPMAST_YARD.half, TOPMAST_YARD.y, TOPMAST_YARD.z]);
    member(g, M.wire, 0.05, [sgn * 3.15, yard, -20], [sgn * 0.55, sy + 4.9, sz]);
    // And the mast's own shrouds, down to the after superstructure.
    member(g, M.wire, 0.05, [sgn * 0.22, yard - 1.2, -20],
      [sgn * 3.4, sdeck(-27) + 2.6, -25.4]);
  }
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

/**
 * The reserve Arado's stowage, on the starboard side of the boat deck under
 * the crane's jib: the track her trolley runs on, the trolley, and her
 * mainplanes lashed down under canvas beside it.
 *
 * She shipped one aeroplane on the catapult and one in reserve, and the
 * reserve one came aboard in pieces -- there is no deck between the boats and
 * the catapult wide enough for a second airframe. A folded Arado is four
 * metres across and ten and a half long; the widest clear lane on this deck is
 * two and a half, so one drawn here stands straight through the catapult
 * aeroplane's starboard wing and float. What was actually on this deck, and
 * what is drawn, is the gear.
 */
function sparePlane(g) {
  const cx = S * 5.4;
  const y = sdeck(-14) + 0.16;
  // The track: two rails on their tie plates, running fore and aft, so the
  // crane can land her forward of the trolley and she can be run back.
  for (const tx of [-1.05, 1.05]) {
    box(g, M.gunDark, 0.16, 0.13, 7.0, cx + tx, y + 0.07, -14);
    for (let i = 0; i <= 7; i++) {
      box(g, M.steelDark, 0.44, 0.05, 0.24, cx + tx, y + 0.03, -17.3 + i * 0.94);
    }
  }
  // The trolley, standing at the after end of the track: a frame on four
  // flanged wheels with the float cradle over the middle of it.
  const tz = -15.4;
  for (const tx of [-1.05, 1.05]) {
    for (const dz of [-1.35, 1.35]) {
      cyl(g, M.gunDark, 0.18, 0.18, 0.13, cx + tx, y + 0.32, tz + dz, 10)
        .rotation.z = Math.PI / 2;
    }
    box(g, M.steelDark, 0.16, 0.2, 3.4, cx + tx, y + 0.42, tz);
  }
  box(g, M.steelDark, 2.5, 0.24, 3.6, cx, y + 0.60, tz);
  for (const dz of [-1.1, 1.1]) {
    // A saddle the float sits in, and the chocks either side that hold it.
    box(g, M.steel, 2.2, 0.5, 0.30, cx, y + 0.97, tz + dz);
    for (const tx of [-0.62, 0.62]) {
      box(g, M.steelDark, 0.16, 0.36, 0.32, cx + tx, y + 1.35, tz + dz);
    }
  }
  box(g, M.steelDark, 0.5, 0.34, 2.4, cx, y + 0.89, tz);
  // The bar a working party pushes her by, at each end of the frame.
  for (const dz of [-1.7, 1.7]) {
    cyl(g, M.gunDark, 0.06, 0.06, 2.2, cx, y + 0.86, tz + dz, 8)
      .rotation.z = Math.PI / 2;
    for (const tx of [-1.1, 1.1]) {
      box(g, M.gunDark, 0.08, 0.5, 0.08, cx + tx, y + 0.63, tz + dz);
    }
  }
  // Her mainplanes, off her and lashed down under a cover on the deck
  // inboard of the track, with the eyeplates they are lashed to.
  const wx = cx - S * 2.0;
  box(g, M.canvas, 1.5, 0.62, 6.0, wx, y + 0.35, -12.6);
  box(g, M.canvas, 1.2, 0.18, 5.6, wx, y + 0.72, -12.6);
  for (const dz of [-2.3, 0, 2.3]) {
    box(g, M.gunDark, 1.7, 0.06, 0.12, wx, y + 0.36, -12.6 + dz);
  }
  for (const dz of [-2.6, 0.2, 3.0]) {
    for (const tx of [-0.95, 0.95]) {
      cyl(g, M.steelDark, 0.14, 0.14, 0.08, wx + tx, y + 0.04, -12.6 + dz, 8);
    }
  }
  // Her beaching wheels, stowed in a rack against the trolley's track.
  for (const dz of [-0.55, 0.55]) {
    cyl(g, M.gunDark, 0.52, 0.52, 0.18, cx - S * 0.0, y + 0.56, -10.6 + dz, 14);
  }
  box(g, M.steelDark, 1.9, 0.12, 1.8, cx, y + 0.04, -10.6);
  for (const tx of [-0.8, 0.8]) {
    box(g, M.steelDark, 0.12, 1.1, 0.14, cx + tx, y + 0.55, -10.6);
  }
}

function crane(g) {
  // Just forward of the catapult and offset to starboard, where the plan puts
  // it: she is fished out of the water alongside and swung back onto her
  // trolley, which is the whole of how a catapult ship recovers an aeroplane.
  //
  // A crane is a ring on the deck, a machinery house that trains with it, a
  // king post and a lattice jib on a topping lift. This one was a pipe with a
  // ten-metre bar stuck out of it and eight cubes threaded on the bar, which
  // from any bearing is a stick.
  const y = sdeck(-2) + 0.16;
  const base = new THREE.Group();
  base.position.set(S * 6.0, y, -2);
  g.add(base);
  cyl(base, M.steelDark, 1.25, 1.35, 0.3, 0, 0.15, 0, 16);
  const post = new THREE.Group();
  post.position.set(0, 0.3, 0);
  post.userData.dynamic = true;
  base.add(post);
  // The machinery house, set back from the pivot, and the king post itself.
  box(post, M.steel, 1.9, 1.7, 1.5, 0, 0.85, -S * 1.0);
  box(post, M.steelDark, 2.0, 0.14, 1.6, 0, 1.7, -S * 1.0);
  box(post, M.gunDark, 0.7, 1.1, 0.12, 0, 0.75, -S * 1.78);
  cyl(post, M.steel, 0.36, 0.46, 3.4, 0, 1.7, 0, 12);
  // The jib: four chords laced together, tapering to the head.
  const jib = new THREE.Group();
  jib.position.set(0, 3.4, 0);
  jib.rotation.z = S * 0.85;
  post.add(jib);
  const JL = 10.4;
  const sAt = (f) => 0.40 - 0.22 * f;
  for (let i = 0; i < 8; i++) {
    const f0 = i / 8;
    const f1 = (i + 1) / 8;
    const s0 = sAt(f0);
    const s1 = sAt(f1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        member(jib, M.steelDark, 0.11,
          [sx * s0, f0 * JL, sz * s0], [sx * s1, f1 * JL, sz * s1]);
      }
    }
    for (const sz of [-1, 1]) {
      member(jib, M.steelDark, 0.08, [-s1, f1 * JL, sz * s1], [s1, f1 * JL, sz * s1]);
    }
    for (const sx of [-1, 1]) {
      member(jib, M.steelDark, 0.08, [sx * s0, f0 * JL, -s0], [sx * s1, f1 * JL, s1]);
    }
  }
  // The head sheave, the whip and the hook, and the topping lift back to the
  // head of the post.
  cyl(jib, M.steelDark, 0.24, 0.24, 0.4, 0, JL + 0.12, 0, 10)
    .rotation.z = Math.PI / 2;
  box(jib, M.wire, 0.05, 1.9, 0.05, 0, JL - 0.85, 0);
  const hook = box(jib, M.gunDark, 0.34, 0.44, 0.34, 0, JL - 1.95, 0);
  hook.rotation.y = 0.4;
  const head = [
    Math.sin(S * 0.85) * -JL, 3.4 + Math.cos(S * 0.85) * JL, 0,
  ];
  member(post, M.wire, 0.06, [head[0], head[1], head[2]], [0, 3.3, -S * 0.6]);
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
  // Carley floats along the funnel casing, stowed on end in their racks.
  //
  // They were set a metre and a half over the superstructure deck against a
  // house that stops at it, so all three pairs stood in the air: a float lying
  // against plating has to have plating to lie against. Each one now sits on
  // the deck in a rack of two stanchions and two bars, which is how a German
  // ship carried them.
  for (const sgn of [-1, 1]) {
    for (const z of [0, -24, 22]) {
      const sx = sgn * (sHalf(z) + 0.2);
      const dy = sdeck(z) + 0.16;
      const r = cyl(g, M.raft, 1.05, 1.05, 0.28, sx, dy + 1.06, z, 12);
      r.rotation.x = Math.PI / 2;
      r.rotation.z = Math.PI / 2;
      r.scale.set(1, 1.6, 1);
      for (const dz of [-1.2, 1.2]) {
        cyl(g, M.steelDark, 0.07, 0.08, 2.5, sx + sgn * 0.3, dy + 1.25, z + dz, 6);
      }
      for (const yy of [0.55, 1.85]) {
        box(g, M.steelDark, 0.1, 0.09, 2.6, sx + sgn * 0.3, dy + yy, z);
      }
      box(g, M.steelDark, 0.7, 0.12, 2.6, sx - sgn * 0.12, dy + 0.06, z);
    }
  }
}

/**
 * What a weather deck actually carries.
 *
 * Forty metres of forecastle and fifty of quarterdeck, and between the anchor
 * gear at one end and the tube banks at the other there was nothing at all on
 * either: two long stretches of bare planking. Her plan draws them covered --
 * mushroom heads and cowls over the messdecks, store and ammunition hatches,
 * ready-use lockers, the chain stoppers on both cables, the paravane gear
 * forward and the towing slip aft.
 */
function deckGear(g) {
  // Mushroom ventilator heads over the messdecks, and the bigger cowls that
  // draw for the spaces under them.
  for (const [z, r] of [[62, 0.34], [54, 0.34], [-54, 0.32], [-66, 0.32],
    [-80, 0.28]]) {
    for (const sgn of [-1, 1]) {
      const w = halfDeck(z);
      if (w < 3.4) continue;
      const x = sgn * (w - 2.3);
      const y = deckAtX(x, z);
      cyl(g, M.steel, r, r * 1.08, 0.52, x, y + 0.26, z, 12);
      cyl(g, M.steelDark, r * 1.5, r * 1.15, 0.3, x, y + 0.66, z, 12);
    }
  }
  for (const [z, sgn] of [[58, -1], [58, 1], [-58, -1], [-58, 1]]) {
    const w = halfDeck(z);
    const x = sgn * (w - 3.6);
    cowl(g, x, deckAtX(x, z), z, 0.3, 1.5);
  }
  // Ready-use and store lockers, shut up against the breakwater forward and
  // along the quarterdeck aft where the tube crews keep their gear.
  for (const [z, d] of [[59.4, 1.5], [-49, 1.8], [-71, 1.6]]) {
    for (const sgn of [-1, 1]) {
      const w = halfDeck(z);
      if (w < 4) continue;
      const x = sgn * (w - 1.9);
      const y = deckAtX(x, z);
      box(g, M.steel, 1.1, 0.85, d, x, y + 0.43, z);
      box(g, M.steelDark, 1.16, 0.09, d + 0.06, x, y + 0.9, z);
    }
  }
  // The chain stoppers on both cables, between the wildcat and the hawse: the
  // bottle screw and its bar, which is what the cable is actually held by.
  for (const sgn of [-1, 1]) {
    for (const z of [73.2, 68.4]) {
      const y = deckAtX(2.4, z);
      box(g, M.steelDark, 0.62, 0.42, 0.8, sgn * 2.4, y + 0.21, z);
      box(g, M.gunDark, 0.24, 0.5, 0.22, sgn * 2.4, y + 0.55, z);
    }
  }
  // The paravane gear on the forecastle: the towing chains coiled on their
  // reels, one each side, which every German capital ship carried forward.
  for (const sgn of [-1, 1]) {
    const x = sgn * 4.2;
    const y = deckAtX(x, 50);
    cyl(g, M.steelDark, 0.62, 0.62, 0.9, x, y + 0.62, 50, 14)
      .rotation.z = Math.PI / 2;
    cyl(g, M.gunDark, 0.48, 0.48, 0.94, x, y + 0.62, 50, 12)
      .rotation.z = Math.PI / 2;
    for (const dz of [-0.62, 0.62]) {
      box(g, M.steelDark, 0.16, 1.3, 0.16, x, y + 0.5, 50 + dz);
    }
  }
  // Skylights over the wardroom aft and the cable locker forward.
  for (const [z, w, d] of [[-46, 2.2, 1.4], [66, 1.8, 1.2]]) {
    const y = deckAtX(0, z);
    box(g, M.steelDark, w, 0.3, d, 0, y + 0.15, z);
    const lid = box(g, M.glass, w - 0.3, 0.12, d - 0.26, 0, y + 0.34, z);
    lid.rotation.x = 0.1;
  }
  // The towing slip right aft and the stern fairlead over it.
  {
    const z = -84.5;
    const y = deckAtX(0, z);
    box(g, M.steelDark, 1.5, 0.6, 1.0, 0, y + 0.3, z);
    box(g, M.gunDark, 0.5, 0.36, 1.1, 0, y + 0.62, z);
    const w = halfDeck(z);
    box(g, M.steelDark, 0.9, 0.54, 0.8, 0, deckAtX(0, z - 2.6) + 0.27, z - 2.6);
    cyl(g, M.cave, 0.2, 0.2, 1.0, 0, deckAtX(0, z - 2.6) + 0.34, z - 2.6, 8)
      .rotation.x = Math.PI / 2;
    if (w > 1.4) {
      for (const sgn of [-1, 1]) {
        cyl(g, M.steelDark, 0.18, 0.2, 0.55, sgn * (w - 0.7),
          deckAtX(w - 0.7, z + 3) + 0.28, z + 3, 8);
      }
    }
  }
  // And the jackstaff at her stem head.
  {
    const z = 88.5;
    const y = deckAtX(0, z);
    cyl(g, M.bright, 0.07, 0.10, 4.0, 0, y + 2.0, z, 8);
    cyl(g, M.steelDark, 0.2, 0.26, 0.35, 0, y + 0.17, z, 10);
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
  // Bollards down both sides, with a mooring fairlead in the bulwark abreast
  // of each pair: what the plan view draws all the way down both her sides,
  // and what a ship is actually made fast by.
  for (let z = -80; z < 80; z += 14) {
    const w = halfDeck(z);
    if (w < 3) continue;
    for (const sgn of [-1, 1]) {
      const y = deckAtX(w - 1.0, z);
      const ye = deckAtX(w - 0.28, z);
      cyl(g, M.steelDark, 0.2, 0.22, 0.62, sgn * (w - 1.0), y + 0.31, z, 8);
      cyl(g, M.steelDark, 0.2, 0.22, 0.62, sgn * (w - 1.0), y + 0.31, z + 0.9, 8);
      box(g, M.steelDark, 0.34, 0.16, 1.1, sgn * (w - 1.0), y + 0.7, z + 0.45);
      // The fairlead itself: a shoe at the deck edge with the mouth cut in it.
      box(g, M.steelDark, 0.5, 0.5, 0.9, sgn * (w - 0.28), ye + 0.25, z + 0.45);
      box(g, M.cave, 0.56, 0.24, 0.5, sgn * (w - 0.28), ye + 0.3, z + 0.45);
    }
  }

  // Hatches: a raised coaming with the lid dogged down on it, where her plan
  // puts the ammunition and store trunks fore and aft.
  for (const [z, w, d] of [[70, 2.4, 2.0], [58, 2.0, 1.8], [-62, 2.2, 2.0],
    [-74, 2.0, 1.8], [-84, 1.8, 1.6]]) {
    const y = deckAt(z);
    box(g, M.steelDark, w, 0.32, d, 0, y + 0.16, z);
    box(g, M.gunDark, w - 0.3, 0.1, d - 0.3, 0, y + 0.36, z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(g, M.bright, 0.1, 0.1, 0.1, sx * (w / 2 - 0.2), y + 0.36,
          z + sz * (d / 2 - 0.2));
      }
    }
  }

  // Skylights over the messdecks, both sides, with the glass in them.
  for (const z of [64, -70]) {
    const y = deckAt(z);
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 1.3, 0.5, 1.3, sgn * 3.4, y + 0.25, z);
      const lid = box(g, M.glass, 1.1, 0.08, 1.1, sgn * 3.4, y + 0.52, z);
      lid.rotation.x = -0.16;
    }
  }

  // The accommodation ladders, stowed fore and aft against her side where a
  // ship carries them at sea, one on each beam.
  for (const sgn of [-1, 1]) {
    const z = -44;
    const w = halfDeck(z);
    const lad = box(g, M.steelDark, 0.16, 0.9, 8.5, sgn * (w + 0.22),
      deckAt(z) - 0.9, z);
    lad.rotation.x = 0.06;
    for (let k = 0; k < 12; k++) {
      box(g, M.steelDark, 0.7, 0.05, 0.16, sgn * (w + 0.5),
        deckAt(z) - 0.9 + k * 0.04, z - 3.8 + k * 0.68);
    }
    box(g, M.steelDark, 0.9, 0.08, 0.9, sgn * (w + 0.5), deckAt(z) - 0.5, z + 4.6);
  }

  // Ready-use lockers by the fifteens and the close-range guns, both sides.
  for (const [x, z] of [[9.0, 36], [9.6, 16], [9.6, -12], [9.2, -32]]) {
    for (const sgn of [-1, 1]) {
      const y = deckAt(z);
      box(g, M.steelDark, 0.7, 0.9, 1.5, sgn * (x - 1.4), y + 0.45, z + 2.6);
      box(g, M.gunDark, 0.74, 0.1, 1.54, sgn * (x - 1.4), y + 0.9, z + 2.6);
    }
  }
}


// ------------------------------------------------------------- her armour --
//
// The argument about the whole type, made visible.
//
// Eighty millimetres of Wotan Weich on her side, forty on the deck over her
// machinery, a hundred and forty on a turret face and a hundred and fifty
// round the conning tower: enough to keep a six-inch out at any sensible
// range, and no use whatever against the eight-inch of the cruisers she was
// built to run away from. Her turret faces are thicker than her belt, which is
// the fact that tells you what she was for.
//
// Her belt was external and it showed. It is hung on the side over the shell
// rather than worked flush into it -- a plate standing proud with a chamfer
// top and bottom, butt straps down it every few frames, and a closing
// bulkhead at each end of the citadel where it stops. That step in her
// plating is in every photograph of her and it was not on the model.
const BELT_Z0 = -60;
const BELT_Z1 = 58;
const BELT_LO = -2.4;
const BELT_HI = 3.4;
const BELT_T = 0.13;                       // what eighty millimetres looks like

function armour(g) {
  const N = 40;
  const tOf = (i) => (BELT_Z0 + ((BELT_Z1 - BELT_Z0) * i) / N) / (LOA / 2);

  /**
   * One course of belt plating, standing `BELT_T` proud of the shell under it.
   *
   * Built the way the shell is -- vertices following `zAt` at every height, so
   * it lies on her rather than chording across her rake -- and chamfered at
   * both edges so the plate has a visible thickness rather than a painted
   * line.
   */
  const course = (m, lo, hi, chamLo, chamHi) => {
    const pos = [];
    const idx = [];
    const rungs = [
      [lo, chamLo ? 0 : BELT_T], [lo + 0.22, BELT_T],
      [hi - 0.22, BELT_T], [hi, chamHi ? 0 : BELT_T],
    ];
    const per = rungs.length * 2;
    for (let i = 0; i <= N; i++) {
      const t = tOf(i);
      for (const [y, out] of rungs) {
        const w = shellAt(t, y) + out;
        const z = zAt(t, y);
        pos.push(-w, y, z, w, y, z);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let r = 0; r < rungs.length - 1; r++) {
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
    g.add(new THREE.Mesh(geo, m));
  };

  // Painted as she is painted: the part of the belt under the boot-topping is
  // black like the rest of it, and a belt drawn all in hull grey reads as a
  // grey stripe through her boot-topping rather than as armour.
  course(M.boot, BELT_LO, BOOT_HI, true, false);
  course(M.hull, BOOT_HI, BELT_HI, false, true);

  // The closing bulkhead at each end of the citadel, raked the way her
  // transverse armour was, and the butt straps down the belt between them.
  for (const zEnd of [BELT_Z0, BELT_Z1]) {
    const t = zEnd / (LOA / 2);
    const sgnZ = Math.sign(zEnd);
    for (const sgn of [-1, 1]) {
      const w = shellAt(t, 0.8) + BELT_T / 2;
      box(g, M.steelDark, 0.2, BELT_HI - BELT_LO, 0.5,
        sgn * w, (BELT_LO + BELT_HI) / 2, zAt(t, 0.8) - sgnZ * 0.25);
    }
  }
  // No butt straps down it. They were drawn in hull grey over the whole depth
  // of the belt, and the belt runs a good deal further down her than her
  // topside paint does: below the boot-topping line every one of them showed
  // as a grey bar hanging down her black side, which is not what a butt strap
  // looks like from anywhere. The belt reads as a plate from its chamfered
  // edges, and that is enough.

  // The barbette armour: a hundred and twenty-five millimetres round each
  // trunk, standing proud of the deck it comes through, with the bolt heads
  // that hold the strakes together.
  for (const z of [A_Z, Y_Z]) {
    const y = deckAt(z);
    cyl(g, M.steel, 5.62, 5.7, 0.42, 0, y + 0.21, z, 28);
    cyl(g, M.steelDark, 5.74, 5.74, 0.1, 0, y + 0.05, z, 28);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      cyl(g, M.hullDark, 0.07, 0.07, 0.06, Math.cos(a) * 5.68, y + 0.3,
        z + Math.sin(a) * 5.68, 6).rotation.z = Math.PI / 2;
    }
  }

  // The armoured hatches in the weather deck: the way down into the magazines
  // and the machinery, each one a plate in its own coaming with the dogs
  // round the edge of it.
  for (const z of [A_Z + 9.5, A_Z - 9.5, Y_Z + 9.5, Y_Z - 9.5, 46, -46]) {
    const y = deckAtX(3.2, z);
    for (const sgn of [-1, 1]) {
      box(g, M.deckSteel, 1.7, 0.1, 1.7, sgn * 3.2, y + 0.06, z);
      box(g, M.steelDark, 1.9, 0.14, 1.9, sgn * 3.2, y + 0.02, z);
      for (const dx of [-0.7, 0.7]) {
        for (const dz of [-0.7, 0.7]) {
          cyl(g, M.hullDark, 0.07, 0.07, 0.08, sgn * 3.2 + dx, y + 0.12, z + dz, 6);
        }
      }
    }
  }

}

// ------------------------------------------------- her secondary stations --
//
// Eight single 15 cm in the waist, four a side, and the deck they stand on is
// narrower than they are.
//
// The walkway between the superstructure and the deck edge is three metres
// wide; a 15 cm SK C/28 on its pedestal wants four, and the plan puts the
// mountings on the deck edge rather than inboard of it. So every one of them
// stands out past her plating, and what carries that is a sponson: a plate
// worked out from the shell, bracketed back to it underneath, with a splinter
// screen round the outboard side of it and the ready-use lockers inboard.
//
// Without one the mounting hangs over the sea on nothing, which is exactly
// what it was doing.
function secondaryStations(g) {
  const SP_R = 2.15;
  for (const m of CLS.secondary.mounts) {
    const sgn = Math.sign(m.x);
    const t = Math.max(-1, Math.min(1, m.z / (LOA / 2)));
    const y = deckAtX(m.x, m.z);
    const edge = halfDeck(m.z);
    const over = Math.abs(m.x) + SP_R - edge;      // how far past her side

    // The sponson plate and the coaming round its edge.
    cyl(g, M.deckSteel, SP_R, SP_R, 0.2, m.x, y + 0.02, m.z, 22);
    cyl(g, M.steelDark, SP_R + 0.06, SP_R + 0.06, 0.1, m.x, y - 0.08, m.z, 22);

    // The splinter screen: a low bulwark round the outboard half of it, which
    // is all an open gun deck on a Panzerschiff ever had.
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI;
      const px = m.x + sgn * SP_R * Math.cos(a);
      const pz = m.z + SP_R * Math.sin(a);
      box(g, M.steel, 0.14, 1.0, (2 * Math.PI * SP_R) / 20 + 0.08,
        px, y + 0.62, pz, sgn * a);
      if (i % 2 === 0) {
        box(g, M.steelDark, 0.2, 0.12, 0.42, px, y + 1.14, pz, sgn * a);
      }
    }

    // What carries it: brackets from under the rim, raking down and inboard
    // to her plating. Only where the plate actually overhangs -- a bracket
    // under a sponson that is already on the deck is a bar across a walkway.
    if (over > 0.25) {
      for (const a of [-0.95, -0.35, 0.35, 0.95]) {
        const px = m.x + sgn * SP_R * Math.cos(a) * 0.98;
        const pz = m.z + SP_R * Math.sin(a) * 0.98;
        const drop = 2.4;
        const foot = shellAt(t, y - drop) * sgn;
        member(g, M.steel, 0.17, [px, y - 0.12, pz],
          [foot, y - drop, m.z + Math.sin(a) * 0.5], 0.1, 0.42);
      }
      // And the girder along the shell the brackets land on.
      const foot = shellAt(t, y - 2.4) * sgn;
      box(g, M.steelDark, 0.24, 0.34, SP_R * 1.9, foot, y - 2.4, m.z);
    }

    // The ready-use lockers each side of it, inboard of the screen, and the
    // coaming that keeps the walkway dry behind the mounting.
    for (const dz of [-3.1, 3.1]) {
      box(g, M.steelDark, 1.1, 0.85, 1.3, m.x - sgn * 0.3, y + 0.44, m.z + dz);
      box(g, M.steel, 1.16, 0.1, 1.36, m.x - sgn * 0.3, y + 0.89, m.z + dz);
    }
    box(g, M.steel, 0.14, 1.05, 4.8, m.x - sgn * (SP_R - 0.1), y + 0.54, m.z);
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
    // A screw has a hand: the two shafts turn opposite ways so their torques
    // cancel, or a ship at full power carries a permanent list and a rudder
    // always over. It was written as a bare flag here, which the renderer
    // reads as a right-handed screw -- so both of hers turned the same way.
    scr.userData.screw = { hand: sgn };
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
  //
  // Flat over the top. A Drh LC/28 is a plated box: vertical sides with a
  // chamfer along the top edge, a flat roof, a rear plate square to the deck
  // and the face raked back over the ports. Drawn with the roof curving down
  // at both ends and the chamfer cut a metre deep it came out as a smooth
  // casting -- a turret off a warship a generation older than she is.
  const H = 4.3;
  const rows = [
    [-4.60, 4.30, 4.02, H * 0.97],
    [-4.05, 4.62, 4.32, H],
    [-2.60, 4.68, 4.40, H],
    [-0.20, 4.68, 4.40, H],
    [2.10, 4.62, 4.34, H],
    [3.55, 4.35, 4.06, H],
    [4.85, 3.70, 3.44, H * 0.95],
    [5.55, 3.25, 3.00, H * 0.83],
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
  // Flat-shaded, like the plated box it is. Averaged over the vertices her
  // roof shares with her sides, the chamfer between the two disappears and
  // eleven inches of armour reads as a smooth casting.
  const gunhouse = geo.toNonIndexed();
  gunhouse.computeVertexNormals();
  m.add(new THREE.Mesh(gunhouse, M.gun));

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
  // The shield.
  //
  // An MPL C/28 is not a box. It is a tall narrow shield with its front plate
  // raked back over the gun, the front corners cut away on a chamfer, sides
  // that draw in as they rise, a roof that falls away aft, and no back at all
  // -- the crew work it from the open deck behind. Three flat plates and a lid
  // gave her eight identical packing cases along her sides.
  loftRings(m, M.gun, [
    [1.46, 1.42, 0.10, 0.00],
    [1.48, 1.44, 0.12, 0.62],
    [1.40, 1.38, 0.05, 1.70],
    [1.22, 1.20, -0.10, 2.14],
  ], { n: 14, px: 0.60, pz: 0.66, cap: false });
  // The face, raked back, with the port the gun runs out through.
  const face = box(m, M.gun, 2.52, 2.15, 0.16, 0, 1.06, 1.36);
  face.rotation.x = -0.15;
  box(m, M.gunDark, 0.92, 0.95, 0.2, 0, 1.12, 1.47);
  // The roof, sloping aft, and the rain gutter along the top of the face.
  const roof = box(m, M.gun, 2.56, 0.14, 2.66, 0, 2.16, 0.02);
  roof.rotation.x = 0.06;
  box(m, M.gunDark, 2.6, 0.12, 0.2, 0, 2.18, 1.24);
  for (const sgn of [-1, 1]) {
    // The sighting hood each side, which is what tells a German shield from
    // anybody else's, and the layer's port in the face beside the gun.
    box(m, M.gun, 0.34, 0.5, 0.8, sgn * 1.34, 1.52, 0.72);
    box(m, M.glass, 0.1, 0.22, 0.34, sgn * 1.52, 1.54, 0.78);
    box(m, M.gunDark, 0.14, 0.14, 0.14, sgn * 0.78, 1.5, 1.45);
    // The training handwheel and the elevating gear on the after quarters.
    cyl(m, M.steelDark, 0.26, 0.26, 0.07, sgn * 1.0, 0.72, -1.05, 10)
      .rotation.z = Math.PI / 2;
  }
  // The ready-use lockers behind it, which the plan shows at every mounting.
  box(m, M.steelDark, 1.9, 0.7, 0.7, 0, 0.35, -1.5);
  box(m, M.gunDark, 1.96, 0.08, 0.76, 0, 0.72, -1.5);
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
    // Drawn where she stows the mounting, not on the middle of its arc.
    sec.push(fifteen(g, m.x, deckAt(m.z) + 0.04, m.z,
      m.rest === undefined ? m.angle : m.rest));
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
  ['sideDetail', sideDetail],
  ['armour', armour],
  ['secondaryStations', secondaryStations],
  ['superstructure', superstructure],
  ['tower', tower],
  ['bridgeInside', bridgeInside],
  ['funnel', funnel],
  ['machinery', machinery],
  ['afterWorks', afterWorks],
  ['mainmast', mainmast],
  ['catapult', catapult],
  ['sparePlane', sparePlane],
  ['crane', crane],
  ['sponsons', sponsons],
  ['boats', boats],
  ['groundTackle', groundTackle],
  ['deckGear', deckGear],
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
