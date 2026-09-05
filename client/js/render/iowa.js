// USS Iowa, built out of primitives.
//
// This is a portrait rather than the battle's view-model: the fast hull that
// `ships.js` puts on the water is right for forty of them at once, and wrong
// for one ship the eye is meant to rest on. Everything here is to scale off the
// real vessel — 270 m over all, 33 m beam, 11 m draft, nine 16"/50 in three
// triples, twenty 5"/38 in ten twins, twenty quad Bofors and the Oerlikons
// along the deck edges — so the proportions hold whether she is a mile off at
// a dock or filling the bottom of the frame.
//
// Local frame matches the rest of the renderer: +Z is the bow, +X is starboard,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';
import { buildInterior, bySection } from './interior.js';

export const LOA = 270;
export const BEAM = 33;
export const DRAFT = 11;
// Main deck edge amidships, over the waterline: twenty-four and a half feet,
// which is what the drawing's scale bar reads there. Everything built on her
// is stepped off this, and `sheerAt(0)` has to agree with it.
const DECK = 7.54;
// Where the bow section parts from the rest when the magazines go.
const SPLIT_Z = 44;

const P = {
  hull: 0x5b6875,        // measure 22: navy blue up to the sheer strake
  hullUpper: 0x79838d,   // haze grey above it
  deck: 0x3f4753,        // deck blue
  wood: 0x6d6350,        // the teak that is left
  boot: 0x181b1f,
  antifoul: 0x6d2b21,
  gun: 0x6b747d,
  gunDark: 0x474e56,
  canvas: 0x8b8b80,
  glass: 0x2c3a46,
  rail: 0x555c64,
  radar: 0x8e9299,
  plane: 0x33506f,
  brass: 0x8a7340,
};

const MATS = {};
const mat = (color, opts) => {
  const key = color + JSON.stringify(opts || '');
  if (!MATS[key]) MATS[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MATS[key];
};

const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
};

const cyl = (rt, rb, h, color, seg = 12) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));

/** A horizontal tube — a gun barrel, a boom, a yard. */
const tube = (r, len, color, seg = 8) => {
  const m = cyl(r, r, len, color, seg);
  m.rotation.x = Math.PI / 2;
  return m;
};

// ---------------------------------------------------------------- the hull --
//
// Her lines are read off the Navy recognition drawing rather than drawn by
// eye: the plan view gives the half-breadth at every station, the profile
// gives the sheer, the rake of the stem at each height and the overhang of the
// counter, and the drawing's own scale bar -- 0 to 165 feet in fifteen-foot
// steps, with the waterline at 0 -- gives the heights. Read at 0.7212 pixels
// to the foot, her length between the stem head and the after end of the
// quarterdeck comes out at 631 pixels, and the waterline she floats on runs
// from t = -0.987 to t = +0.959 of that, which is 862 feet: her real load
// waterline is 859. That agreement is the check that the reading is right.
//
// t runs -1 at the after end of the quarterdeck to +1 at the stem head.

/** Straight-line interpolation through a table of [t, value] pairs. */
function lerpTable(tab, t) {
  if (t <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const [t0, v0] = tab[i - 1];
      const [t1, v1] = tab[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return tab[tab.length - 1][1];
}

const clamp01 = (u) => Math.min(1, Math.max(0, u));
const smooth = (u) => { const c = clamp01(u); return c * c * (3 - 2 * c); };

/**
 * Half-breadth at the deck edge, as a fraction of her half-beam.
 *
 * Straight off the plan view. What it says about an Iowa is that she has
 * hardly any parallel middle body at all -- full breadth only from a third
 * abaft amidships to amidships itself -- and then a very long, very fine run
 * forward. Two thirds of the way to the stem she is already down to half her
 * beam. That fineness is the whole reason she made 33 knots, and it is what
 * makes the shape read as her rather than as a generic battleship.
 */
const DECK_HALF = [
  [-1.000, 0.050], [-0.985, 0.300], [-0.970, 0.400], [-0.950, 0.440],
  [-0.920, 0.506], [-0.885, 0.593], [-0.845, 0.679], [-0.810, 0.753],
  [-0.770, 0.802], [-0.735, 0.852], [-0.695, 0.901], [-0.655, 0.926],
  [-0.620, 0.951], [-0.580, 0.963], [-0.545, 0.975], [-0.485, 0.988],
  [-0.400, 0.996], [-0.320, 1.000], [-0.030, 1.000], [0.030, 0.988],
  [0.120, 0.975], [0.180, 0.951], [0.220, 0.926], [0.255, 0.901],
  [0.295, 0.877], [0.330, 0.827], [0.370, 0.802], [0.405, 0.753],
  [0.445, 0.704], [0.485, 0.654], [0.540, 0.556], [0.578, 0.506],
  [0.615, 0.457], [0.655, 0.432], [0.690, 0.383], [0.730, 0.358],
  [0.770, 0.333], [0.805, 0.309], [0.845, 0.272], [0.880, 0.247],
  [0.920, 0.216], [0.955, 0.180], [0.985, 0.090], [1.000, 0.020],
];

/**
 * Where the main deck edge is, in metres over the waterline.
 *
 * Twenty-three feet at the after end, dipping to a shade under twenty-three
 * amidships and then lifting the whole forward third: thirty-six feet abreast
 * the anchors and forty-three at the stem head, which is the dry forecastle
 * she was famous for. Measured at the top of the shell plating.
 */
const SHEER = [
  [-1.00, 7.05], [-0.90, 6.98], [-0.75, 6.91], [-0.60, 6.89],
  [-0.45, 6.94], [-0.30, 7.06], [-0.15, 7.27], [0.00, 7.54],
  [0.15, 7.88], [0.30, 8.22], [0.45, 8.56], [0.58, 8.84],
  [0.70, 9.05], [0.78, 9.35], [0.85, 9.95], [0.90, 10.60],
  [0.94, 11.15], [0.97, 12.05], [1.00, 13.15],
];

/**
 * The bottom of her at each station.
 *
 * Flat at her load draft over the middle half. Aft she keeps her depth a long
 * way -- her inboard shafts run in skegs that carry the bottom down almost to
 * the screws -- and then the counter sweeps up in the last tenth. Forward the
 * forefoot rises over the last quarter to meet the stem.
 *
 * These are stations, not points in space: the counter and the stem carry the
 * top of each end past the bottom of it. These are stations, not
 * points in space: the counter and the stem carry the top of each end past
 * the bottom of it, so the waterline she actually floats on runs 260 metres
 * of her 270, which is what the drawing measures.
 */
const KEEL = [
  [-1.0000, 0.00], [-0.9750, -2.20], [-0.9450, -4.60], [-0.9100, -6.60],
  [-0.8700, -8.20], [-0.8250, -9.30], [-0.7750, -10.00], [-0.7150, -10.40],
  [-0.6550, -10.70], [-0.5900, -10.95], [-0.5300, -11.00], [0.4000, -11.00],
  [0.4800, -10.83], [0.5600, -10.40], [0.6400, -9.70], [0.7150, -8.70],
  [0.7800, -7.50], [0.8400, -6.05], [0.8900, -4.55], [0.9300, -3.05],
  [0.9650, -1.55], [0.9975, 0.00], [1.0000, 0.05],
];

/**
 * How much wider she is at the deck edge than at the waterline.
 *
 * Wall-sided over the middle of her -- an armoured belt wants a flat side to
 * sit behind -- and then a great deal of flare in the forward quarter, which
 * is how a hull this fine at the waterline still has a forecastle wide enough
 * to work an anchor on.
 */
const FLARE = [
  [-1.00, 1.30], [-0.92, 1.14], [-0.85, 1.07], [-0.70, 1.02],
  [-0.40, 1.00], [0.10, 1.00], [0.25, 1.03], [0.40, 1.10],
  [0.52, 1.22], [0.62, 1.36], [0.72, 1.55], [0.80, 1.80],
  [0.87, 2.15], [0.92, 2.60], [0.96, 3.20], [1.00, 4.00],
];

/** Her half-breadth at the deck edge, in metres. */
const deckHalf = (t) => lerpTable(DECK_HALF, t) * (BEAM / 2);
/** And at the waterline, which forward is a very different figure. */
export function halfBeam(t) { return deckHalf(t) / lerpTable(FLARE, t); }
/** The height of the main deck edge at a station. */
export function sheerAt(t) { return lerpTable(SHEER, t); }
/** The bottom of her at a station. */
export function keelAt(t) { return lerpTable(KEEL, t); }
/** Deck breadth over waterline breadth, kept for what is built on her. */
export function flareAt(t) { return lerpTable(FLARE, t); }

/**
 * Her half-breadth at a station and a height: the shape of the section.
 *
 * Below the water, a battleship's section and not a yacht's -- wall sides, a
 * hard turn of bilge and a flat bottom she can be docked on, narrowing to a
 * proper deadrise at the ends where there is no room for a flat. Above it,
 * the flare, all of which is in the forward quarter.
 */
export function shellAt(t, y) {
  const k = keelAt(t);
  if (y <= k) return 0;
  const bw = halfBeam(t);
  if (y >= 0) {
    const u = Math.min(1, y / Math.max(0.4, sheerAt(t)));
    return Math.max(0.03, bw + (deckHalf(t) - bw) * Math.pow(u, 1.6));
  }
  const d = Math.min(1, -y / Math.max(0.4, -k));
  const flat = bw * 0.30 * clamp01(bw / (BEAM / 2));
  return Math.max(0.03, flat + (bw - flat) * Math.pow(1 - Math.pow(d, 3.4), 0.42));
}

// The stem is raked and the counter overhangs, so where the shell is fore and
// aft depends on how high up you look. Both curves are read off the profile,
// the leading edge of the stem and the trailing edge of the counter at each
// height in turn.
//
// Her stem stands very nearly plumb for the first seven feet out of the water
// and then rakes twenty-one feet forward in the next thirty-one, which is
// where her length over all comes from: the stem head overhangs the forefoot
// by six and a half metres.
const STEM = 6.40;
const COUNTER = 2.57;
function stemAt(y) { return STEM * smooth((y - 2.2) / 9.3); }
function counterAt(y) { return COUNTER * Math.pow(clamp01(y / 6.9), 0.62); }

/** Where a station actually is fore and aft, at this height. */
export function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.55) z += smooth((t - 0.55) / 0.45) * (stemAt(y) - STEM);
  else if (t < -0.86) z -= smooth((-t - 0.86) / 0.14) * (counterAt(y) - COUNTER);
  return z;
}

/** Her deck edge at a station, in metres from amidships. */
export function deckAt(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return sheerAt(t) + 0.30;
}

/** And how far outboard the deck edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return deckHalf(t);
}

// ------------------------------------------------------------ her plating --

const BOOT_LO = -1.35;
const BOOT_HI = 1.35;
const STATIONS = 160;

/**
 * Where station `i` falls, as a fraction of her length.
 *
 * Cosine spacing, not even spacing. Two thirds of her is parallel middle body
 * where one station every four metres says everything there is to say, and
 * the last two metres of the counter change breadth faster than the middle
 * hundred put together. Spaced evenly at this station count her stern came
 * out two metres inside her own lines; spaced by the cosine the stations
 * crowd into both ends where the shape is and thin out where it is not.
 */
function stationT(i) { return Math.sin((Math.PI / 2) * ((2 * i) / STATIONS - 1)); }

// Where the bow section parts from the rest when the magazines go: a station
// index rather than a metre mark, so both halves share the one station and
// meet along it without a seam.
const SPLIT_I = Math.round(
  (STATIONS * (1 + (2 / Math.PI) * Math.asin(SPLIT_Z / (LOA / 2)))) / 2);

/**
 * The three strakes: red lead below the boot top, black boot topping through
 * the waterline, and Measure 22's navy blue from there up to the deck edge.
 */
function strakeBands() {
  return [
    [(t) => keelAt(t) - 0.02, BOOT_LO, P.antifoul, 20, 1.75],
    [BOOT_LO, BOOT_HI, P.boot, 2, 1],
    [BOOT_HI, sheerAt, P.hull, 5, 1],
  ];
}

/** The same three, evaluated at one station, for capping the ends. */
function strakes(t) {
  const kb = keelAt(t);
  return [
    [kb, Math.max(kb, BOOT_LO), P.antifoul],
    [Math.max(kb, BOOT_LO), Math.max(kb, BOOT_HI), P.boot],
    [Math.max(kb, BOOT_HI), sheerAt(t), P.hull],
  ];
}

/**
 * One band of shell plating, lofted between two heights the whole way round.
 *
 * Either height may be a number or a function of the station. Every band runs
 * the full length of the piece it belongs to and shares its edges with its
 * neighbours, which is what keeps her watertight: a hull built as separate
 * pieces has a seam you can see daylight through wherever two of them
 * disagree by a millimetre. The two pieces she breaks into share the station
 * they part at for the same reason.
 *
 * `rows` is how many times the band is cut between its two edges. A band
 * lofted from its edges alone is a ruled surface -- a straight line between
 * them -- and a straight line from the keel to the boot topping is a punt,
 * not a battleship: it cuts eight metres inside her turn of bilge, and her
 * own boiler rooms stand out through the bottom of her.
 */
function loftBand(g, color, lo, hi, i0, i1, rows, bias = 1) {
  const loAt = typeof lo === 'function' ? lo : () => lo;
  const hiAt = typeof hi === 'function' ? hi : () => hi;
  const pos = [];
  const idx = [];
  for (let i = i0; i <= i1; i++) {
    const t = stationT(i);
    const kb = keelAt(t);
    const a = Math.max(loAt(t), kb);
    const b = Math.max(hiAt(t), kb);
    for (let r = 0; r <= rows; r++) {
      // Cuts crowded towards the keel, where the section turns fastest.
      const y = a + (b - a) * Math.pow(r / rows, bias);
      const w = shellAt(t, y);
      pos.push(-w, y, zAt(t, y), w, y, zAt(t, y));
    }
  }
  const stride = (rows + 1) * 2;
  for (let i = 0; i < i1 - i0; i++) {
    for (let r = 0; r < rows; r++) {
      const a = i * stride + r * 2;
      const b = (i + 1) * stride + r * 2;
      // Port side, normals to port; starboard side, normals to starboard.
      idx.push(a, b, a + 2, a + 2, b, b + 2);
      idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat(color)));
}

/**
 * Close an end of the shell, painted in the same three strakes.
 *
 * `out` says which way the face looks: +1 forward, -1 aft. Used at the stem
 * and the after end, and at the station the bow parts along -- both sides of
 * that one, so that when the bow does go there is a bulkhead standing at each
 * of the two new ends rather than a hole into the inside of her.
 */
function capEnd(g, t, out, color) {
  for (const [lo, hi, c] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const N = 16;
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
    g.add(new THREE.Mesh(geo, mat(color || c)));
  }
}

/**
 * Her main deck: one cambered sheet from the stem head to the after end.
 *
 * Laid as a steel waterway at the edge with teak inboard of it, which is how
 * she was planked, and cut from one grid of points so the two cannot part
 * company. The camber is a foot in her half-breadth -- enough to throw water
 * over the side, not enough to see from a mile off.
 */
function weatherDeck(g, i0, i1) {
  const CAM = 7;
  const across = CAM * 2 + 1;
  const MARGIN = 1.7;                  // the steel waterway at the deck edge
  const pos = [];
  const inner = [];
  const outer = [];
  for (let i = i0; i <= i1; i++) {
    const t = stationT(i);
    const sh = sheerAt(t);
    const w = deckHalf(t);
    const z = zAt(t, sh);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;
      pos.push(u * w, sh + (1 - u * u) * 0.30, z);
    }
  }
  for (let i = 0; i < i1 - i0; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      const t = stationT(i0 + i);
      const w = deckHalf(t);
      // Which sheet this strip belongs to: the margin plate at the edge, or
      // the planking inboard of it.
      const u = Math.abs((j + 0.5 - CAM) / CAM) * w;
      (u > w - MARGIN ? outer : inner).push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  for (const [idx, color] of [[inner, P.wood], [outer, P.deck]]) {
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat(color)));
  }
}

/**
 * The sheer strake standing above the deck edge: a low coaming the whole way
 * round, which is what stops the deck reading as a sheet of paper laid on top
 * of the hull.
 */
function sheerStrake(g, i0, i1) {
  const pos = [];
  const idx = [];
  for (let i = i0; i <= i1; i++) {
    const t = stationT(i);
    const sh = sheerAt(t);
    const w = deckHalf(t);
    const z = zAt(t, sh);
    pos.push(-w, sh, z, w, sh, z, -w, sh + 0.22, z, w, sh + 0.22, z);
  }
  for (let i = 0; i < i1 - i0; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat(P.hull)));
}

/**
 * Bilge keels: a plate on edge each side, down on the turn of the bilge over
 * the middle third of her. They are hull, they are always in the water, and
 * without them the underwater body is a bare shape with nothing to read scale
 * from.
 */
function bilgeKeels(g) {
  for (const s of [-1, 1]) {
    const pos = [];
    const idx = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = -0.42 + (0.78 * i) / N;
      const y = keelAt(t) * 0.62;
      const w = shellAt(t, y);
      const z = zAt(t, y);
      const taper = Math.sin((Math.PI * i) / N);
      pos.push(s * w, y, z, s * (w + 0.9 * taper), y - 0.25 * taper, z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat(P.antifoul)));
  }
}

/**
 * What hangs under her counter: four shafts, the two outboard ones on struts,
 * four screws and the two rudders.
 *
 * Part of the hull rather than part of the fit-out -- an Iowa's stern without
 * them is a shape with nothing coming out of it -- and the arrangement is her
 * own: inboard shafts in skegs, outboard shafts on A-brackets, and the
 * rudders abaft the inboard screws rather than on the centreline.
 */
function sternGear(g) {
  for (const s of [-1, 1]) {
    // The outboard shaft, on its bracket, and its screw.
    const shaft = tube(0.42, 26, P.gunDark, 10);
    shaft.position.set(s * 9.4, -9.2, -84);
    shaft.rotation.x = Math.PI / 2 - 0.055;
    g.add(shaft);
    for (const [zz, len] of [[-88, 5.2], [-78, 4.4]]) {
      const strut = box(0.5, len, 0.9, P.gunDark, s * 9.4, -9.2 + len / 2 - 1.6, zz);
      strut.rotation.z = s * 0.42;
      g.add(strut);
    }
    const hubO = cyl(0.5, 0.7, 1.5, P.brass, 10);
    hubO.rotation.x = Math.PI / 2;
    hubO.position.set(s * 9.4, -9.8, -96.5);
    g.add(hubO);
    for (let b = 0; b < 4; b++) {
      const holder = new THREE.Group();
      holder.position.set(s * 9.4, -9.8, -97.4);
      holder.rotation.z = (b * Math.PI) / 2 + 0.3;
      holder.add(box(0.26, 2.9, 1.5, P.brass, 0, 1.35, 0));
      g.add(holder);
    }
    // The inboard shaft comes out of a skeg, so it needs no bracket.
    const skeg = box(1.9, 4.4, 30, P.antifoul, s * 4.4, -10.4, -76);
    g.add(skeg);
    const shIn = tube(0.44, 12, P.gunDark, 10);
    shIn.position.set(s * 4.4, -10.7, -86);
    shIn.rotation.x = Math.PI / 2 - 0.03;
    g.add(shIn);
    const hubI = cyl(0.5, 0.7, 1.5, P.brass, 10);
    hubI.rotation.x = Math.PI / 2;
    hubI.position.set(s * 4.4, -10.9, -91.6);
    g.add(hubI);
    for (let b = 0; b < 4; b++) {
      const holder = new THREE.Group();
      holder.position.set(s * 4.4, -10.9, -92.4);
      holder.rotation.z = (b * Math.PI) / 2 + 0.3;
      holder.add(box(0.26, 2.7, 1.4, P.brass, 0, 1.25, 0));
      g.add(holder);
    }
    // The rudder, abaft the inboard screw.
    const rud = box(0.7, 6.4, 4.6, P.antifoul, s * 4.4, -8.6, -99);
    g.add(rud);
    g.add(cyl(0.35, 0.35, 2.2, P.gunDark, 10).translateX(s * 4.4)
      .translateY(-5.0).translateZ(-98.4));
  }
}

/**
 * The hull, in two pieces: everything abaft the forward barbettes, and the bow
 * section forward of them. She is drawn that way so that when her forward
 * magazines go the bow can be heaved up out of the water as a unit, the way it
 * happens to a ship that loses them. The two share the station they part
 * along, and each is capped there, so neither the whole ship nor the wreck of
 * her has a hole in it.
 */
function buildHull(breakaway) {
  const g = new THREE.Group();
  // With the break switched off she is one group, and the two halves of every
  // band weld together into one piece of plating.
  const fwd = breakaway ? new THREE.Group() : g;
  if (breakaway) g.add(fwd);

  for (const [lo, hi, color, rows, bias] of strakeBands()) {
    loftBand(g, color, lo, hi, 0, SPLIT_I, rows, bias);
    loftBand(fwd, color, lo, hi, SPLIT_I, STATIONS, rows, bias);
  }
  weatherDeck(g, 0, SPLIT_I);
  weatherDeck(fwd, SPLIT_I, STATIONS);
  sheerStrake(g, 0, SPLIT_I);
  sheerStrake(fwd, SPLIT_I, STATIONS);
  capEnd(g, -1, -1);
  capEnd(fwd, 1, 1);
  // The bulkheads the break would leave standing, one each side of it: torn
  // plating rather than painted shell, and cut to the station's own section so
  // that no corner of either stands out through her sides while she is still
  // in one piece.
  if (breakaway) {
    const tSplit = stationT(SPLIT_I);
    capEnd(g, tSplit, 1, P.gunDark);
    capEnd(fwd, tSplit, -1, P.gunDark);
  }

  bilgeKeels(g);
  sternGear(g);

  return { group: g, forward: fwd };
}

// ------------------------------------------------------------- the batteries --

/** One 16"/50 triple: barbette, house, blast bags and three rifles. */
function turret16() {
  const g = new THREE.Group();

  // Barbette: 11.6 m across, standing proud of the deck.
  const barbette = cyl(5.8, 5.9, 3.0, P.hull, 20);
  barbette.position.y = 1.5;
  g.add(barbette);

  // Gunhouse: sloped face, flat roof, overhanging rear.
  const house = box(12.4, 4.4, 10.4, P.gun, 0, 5.2, -0.6);
  g.add(house);
  const face = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.4, 3.6), mat(P.gun));
  face.position.set(0, 5.0, 5.4);
  face.rotation.x = -0.30;
  g.add(face);
  g.add(box(11.6, 0.35, 10.0, P.gunDark, 0, 7.5, -0.8));
  // Rangefinder ears out either side of the house.
  for (const s of [-1, 1]) g.add(box(1.5, 1.1, 3.4, P.gunDark, s * 6.6, 6.4, -3.4));
  // The sighting hoods and the roof-mounted 20 mm tub.
  g.add(box(1.6, 0.9, 1.6, P.gunDark, 0, 7.9, 2.2));

  // Three rifles: 20.7 m of barrel outside the house, tapering to the muzzle.
  for (const off of [-3.9, 0, 3.9]) {
    const bag = cyl(1.35, 1.6, 2.6, P.canvas, 10);
    bag.rotation.x = Math.PI / 2;
    bag.position.set(off, 5.0, 6.6);
    g.add(bag);

    const chase = cyl(0.42, 0.62, 20.7, P.gunDark, 10);
    chase.rotation.x = Math.PI / 2;
    chase.position.set(off, 5.0, 17.6);
    g.add(chase);
    // Muzzle swell.
    const muzzle = cyl(0.5, 0.45, 1.4, P.gunDark, 10);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(off, 5.0, 28.4);
    g.add(muzzle);
  }
  return g;
}

/** A twin 5"/38 in its Mk28 enclosed mount. */
function mount5() {
  const g = new THREE.Group();
  const ring = cyl(2.2, 2.3, 1.2, P.gun, 14);
  ring.position.y = 0.6;
  g.add(ring);
  const house = box(4.4, 2.6, 5.0, P.gun, 0, 2.5, -0.2);
  g.add(house);
  const face = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 1.6), mat(P.gun));
  face.position.set(0, 2.4, 2.5);
  face.rotation.x = -0.35;
  g.add(face);
  for (const off of [-1.0, 1.0]) {
    const bag = cyl(0.55, 0.65, 1.1, P.canvas, 8);
    bag.rotation.x = Math.PI / 2;
    bag.position.set(off, 2.4, 3.2);
    g.add(bag);
    const brl = cyl(0.16, 0.22, 5.6, P.gunDark, 8);
    brl.rotation.x = Math.PI / 2;
    brl.position.set(off, 2.4, 6.2);
    g.add(brl);
  }
  return g;
}

/** A quad 40 mm Bofors in its tub, with the director alongside. */
function bofors() {
  const g = new THREE.Group();
  const tub = cyl(2.6, 2.6, 1.5, P.gun, 14);
  tub.position.y = 0.75;
  g.add(tub);
  g.add(box(2.4, 1.1, 2.6, P.gunDark, 0, 1.9, -0.3));
  for (const s of [-0.55, 0.55]) {
    for (const t of [-0.35, 0.35]) {
      const brl = cyl(0.11, 0.13, 3.6, P.gunDark, 6);
      brl.rotation.x = Math.PI / 2;
      brl.position.set(s, 2.4 + t * 0.25, 2.2);
      g.add(brl);
    }
  }
  return g;
}

/** A single 20 mm Oerlikon behind its splinter shield. */
function oerlikon() {
  const g = new THREE.Group();
  const shield = cyl(0.95, 0.95, 1.2, P.gun, 10);
  shield.position.y = 0.6;
  g.add(shield);
  const brl = cyl(0.07, 0.09, 2.1, P.gunDark, 6);
  brl.rotation.x = Math.PI / 2 - 0.5;
  brl.position.set(0, 1.7, 0.9);
  g.add(brl);
  return g;
}

// ------------------------------------------------------- fire control & masts --

/** Mk37 secondary director, with its Mk12/22 radar aerials on the roof. */
function mk37() {
  const g = new THREE.Group();
  g.add(box(3.4, 2.4, 4.2, P.gun, 0, 1.2, 0));
  for (const s of [-1, 1]) g.add(box(0.8, 0.8, 1.6, P.gunDark, s * 1.9, 1.6, -0.6));
  // The rectangular Mk12 antenna and the orange-peel Mk22 beside it.
  const mk12 = box(2.6, 1.4, 0.25, P.radar, 0, 3.0, 0.4);
  g.add(mk12);
  const mk22 = cyl(0.7, 0.7, 0.2, P.radar, 12);
  mk22.rotation.x = Math.PI / 2;
  mk22.position.set(1.6, 3.1, 0.4);
  mk22.scale.set(0.5, 1, 1);
  g.add(mk22);
  return g;
}

/** Mk38 main battery director: the tower top with the Mk8 "bedspring". */
function mk38() {
  const g = new THREE.Group();
  g.add(box(4.6, 3.0, 5.0, P.gun, 0, 1.5, 0));
  for (const s of [-1, 1]) g.add(box(1.2, 1.0, 2.2, P.gunDark, s * 2.6, 1.9, -0.4));
  // Mk8 fire-control radar: a flat rectangular array.
  const array = box(4.6, 1.8, 0.3, P.radar, 0, 4.0, 0.6);
  g.add(array);
  for (let i = -2; i <= 2; i++) g.add(box(0.12, 1.6, 0.5, P.gunDark, i * 0.9, 4.0, 0.8));
  return g;
}

/** The tower foremast, its platforms and the air-search aerials. */
function foremast() {
  const g = new THREE.Group();
  const leg = cyl(0.9, 1.3, 26, P.gun, 8);
  leg.position.y = 13;
  g.add(leg);
  for (const [y, r] of [[8, 3.2], [15, 2.6], [21, 2.0]]) {
    const plat = cyl(r, r, 0.3, P.gunDark, 14);
    plat.position.y = y;
    g.add(plat);
  }
  // SK air-search: the big flat mattress that identifies her at a distance.
  const sk = box(5.4, 5.4, 0.3, P.radar, 0, 27.5, 0);
  sk.rotation.x = -0.25;
  g.add(sk);
  for (let i = -2; i <= 2; i++) g.add(box(0.1, 5.0, 0.4, P.gunDark, i * 1.1, 27.5, 0.3));
  // Yardarms with their signal halyards.
  const yard = tube(0.14, 13, P.rail, 6);
  yard.rotation.z = Math.PI / 2;
  yard.rotation.x = 0;
  yard.position.y = 22.5;
  g.add(yard);
  const topmast = cyl(0.18, 0.32, 8, P.rail, 6);
  topmast.position.y = 32;
  g.add(topmast);
  return g;
}

// ------------------------------------------------------------ the aeroplanes --

/** An OS2U Kingfisher on the quarterdeck catapult. */
function kingfisher() {
  const g = new THREE.Group();
  const body = cyl(0.55, 0.35, 10.2, P.plane, 8);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  g.add(box(11.0, 0.25, 1.9, P.plane, 0, 0.3, 0.6));
  g.add(box(3.6, 0.2, 1.1, P.plane, 0, 0.9, -4.2));
  g.add(box(0.2, 1.8, 1.3, P.plane, 0, 1.5, -4.4));
  // The great central float and the wingtip floats that go with it.
  const float = cyl(0.5, 0.35, 8.4, P.plane, 8);
  float.rotation.x = Math.PI / 2;
  float.position.set(0, -1.5, 0.4);
  g.add(float);
  for (const s of [-1, 1]) {
    const wf = cyl(0.2, 0.16, 2.0, P.plane, 6);
    wf.rotation.x = Math.PI / 2;
    wf.position.set(s * 4.8, -0.7, 0.6);
    g.add(wf);
  }
  const prop = new THREE.Mesh(new THREE.CircleGeometry(1.6, 10),
    new THREE.MeshBasicMaterial({ color: 0x9aa6b2, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
  prop.position.z = 5.3;
  g.add(prop);
  return g;
}

// ------------------------------------------------------------------ assembly --

/**
 * The whole ship.
 * @returns {{group: THREE.Group, turrets: THREE.Group[], length: number,
 *            beam: number, deckY: number}}
 */
export function buildIowa(opts = {}) {
  // Whether her bow is built as a piece that can be blown off.
  //
  // The title screen wants it: a battleship at her moorings losing her forward
  // magazines and settling is the shot the menu is built round. A battle does
  // not -- there her plating is welded one buffer per compartment and torn
  // triangle by triangle where she is actually hit, and a bow held out of that
  // weld as one rigid lump is a third of her that no shell can touch.
  const breakaway = opts.breakaway !== false;
  const root = new THREE.Group();
  const { group: hull, forward } = buildHull(breakaway);
  root.add(hull);

  // Anything standing forward of the break goes with the bow section, so that
  // when it lifts it takes A and B turrets and the forecastle with it.
  const place = (obj, z) => (breakaway && z >= SPLIT_Z ? forward : root).add(obj);

  // Nothing bolted to a deck may stand outboard of that deck's own edge. She
  // is a very fine hull forward -- six metres of half-breadth abreast the
  // anchors where she has sixteen and a half amidships -- so a mounting laid
  // out on a fixed offset is over the side long before it reaches the bow.
  const inboard = (x, z, clear) => {
    const room = halfDeck(z) - clear;
    return Math.sign(x) * Math.min(Math.abs(x), Math.max(1.2, room));
  };


  const turrets = [];
  // Everything else aboard that trains: the secondary mountings and the light
  // battery. Each is marked so the welder leaves it alone, and each remembers
  // the bearing it rests on so the scene can lay it in the ship's own frame.
  const secMounts = [];
  const aaMounts = [];
  const trains = (obj, rest, into) => {
    obj.userData.dynamic = true;
    obj.userData.rest = rest;
    into.push(obj);
    return obj;
  };

  // -- main battery --------------------------------------------------------
  // A and B forward, superfiring; Y aft. The barbette heights step up.
  for (const [z, lift, aft] of [[76, 0, false], [58, 4.2, false], [-70, 0, true]]) {
    const t = turret16();
    t.position.set(0, sheerAt(z / (LOA / 2)) + lift, z);
    if (aft) t.rotation.y = Math.PI;
    place(t, z);
    turrets.push(t);
    // The deckhouse the superfiring turret stands on.
    if (lift) place(box(15, lift, 15, P.hullUpper, 0, sheerAt(z / (LOA / 2)) + lift / 2, z), z);
  }

  // -- superstructure ------------------------------------------------------
  const S = DECK + 0.4;

  // 01 deck: the long deckhouse the secondary battery stands on. It stops at
  // the break, so nothing of it is left overhanging when the bow goes.
  root.add(box(26, 4.2, 96, P.hullUpper, 0, S + 2.1, -5));
  // 02 deck, narrower, carrying the funnels and the boat deck.
  root.add(box(20, 3.8, 86, P.hullUpper, 0, S + 6.1, 6));

  // Conning tower and bridge: the armoured citadel with the pilot house round it.
  const conning = cyl(4.6, 5.0, 7.0, P.gun, 16);
  conning.position.set(0, S + 11.5, 40);
  root.add(conning);
  root.add(box(15, 3.0, 12, P.hullUpper, 0, S + 9.5, 38));
  root.add(box(12.5, 2.8, 9.5, P.hullUpper, 0, S + 12.4, 37));
  root.add(box(10.0, 2.6, 8.0, P.hullUpper, 0, S + 15.1, 36));
  // Bridge wings and their windows.
  for (const s of [-1, 1]) root.add(box(3.0, 0.4, 7.0, P.gunDark, s * 7.4, S + 11.1, 38));
  root.add(box(11.4, 1.3, 0.3, P.glass, 0, S + 12.8, 41.6));
  root.add(box(9.2, 1.2, 0.3, P.glass, 0, S + 15.4, 39.8));

  // Main battery director over the bridge, and the foremast behind it.
  const fwdDir = mk38();
  fwdDir.position.set(0, S + 17.4, 35);
  root.add(fwdDir);
  const fm = foremast();
  fm.position.set(0, S + 16, 28);
  root.add(fm);

  // Secondary directors: one either side forward, one aft.
  for (const [x, y, z] of [[-8.5, S + 13.6, 30], [8.5, S + 13.6, 30], [0, S + 12.0, -44]]) {
    const d = mk37();
    d.position.set(x, y, z);
    root.add(d);
  }

  // Funnels: raked, capped, with the steam pipes up the after side.
  for (const z of [14, -16]) {
    const f = cyl(3.1, 3.6, 11.0, P.hullUpper, 14);
    f.position.set(0, S + 13.5, z);
    f.rotation.x = -0.06;
    root.add(f);
    const cap = cyl(3.5, 3.2, 0.8, P.gunDark, 14);
    cap.position.set(0, S + 19.2, z - 0.3);
    root.add(cap);
    for (const s of [-1, 1]) {
      const pipe = cyl(0.28, 0.28, 12, P.gunDark, 6);
      pipe.position.set(s * 2.4, S + 14, z - 2.9);
      root.add(pipe);
    }
    // A gallery of Oerlikons round the base of each funnel.
    for (const s of [-1, 1]) {
      const o = oerlikon();
      o.position.set(s * 5.0, S + 8.0, z);
      trains(o, 0, aaMounts);
      root.add(o);
    }
  }

  // Mainmast aft, with its own yard and the aft director on the deckhouse.
  const mm = cyl(0.55, 0.8, 20, P.rail, 8);
  mm.position.set(0, S + 16, -30);
  root.add(mm);
  const mYard = tube(0.12, 10, P.rail, 6);
  mYard.rotation.z = Math.PI / 2;
  mYard.position.set(0, S + 22, -30);
  root.add(mYard);
  const aftDir = mk38();
  aftDir.position.set(0, S + 9.9, -50);
  root.add(aftDir);

  // -- secondary battery ---------------------------------------------------
  // Five twin 5"/38 a side, standing on the 01 deck.
  for (const z of [46, 24, -2, -26, -50]) {
    for (const s of [-1, 1]) {
      const m = mount5();
      m.position.set(inboard(s * 12.2, z, 1.4), S + 4.2, z);
      m.rotation.y = s > 0 ? 1.35 : -1.35;
      trains(m, m.rotation.y, secMounts);
      root.add(m);
    }
  }

  // -- light AA ------------------------------------------------------------
  // Twenty quad Bofors: round the turrets, along the 02 deck, and on the fantail.
  const bofPlaces = [
    [-14, DECK + 0.2, 96], [14, DECK + 0.2, 96],
    [-17, S + 4.4, 62], [17, S + 4.4, 62],
    [-13, S + 8.2, 44], [13, S + 8.2, 44],
    [-11.5, S + 10.0, 22], [11.5, S + 10.0, 22],
    [-11.5, S + 10.0, 2], [11.5, S + 10.0, 2],
    [-11.5, S + 8.2, -22], [11.5, S + 8.2, -22],
    [-15, S + 4.4, -40], [15, S + 4.4, -40],
    [-16, S + 4.4, -58], [16, S + 4.4, -58],
    [-11, DECK + 0.2, -92], [11, DECK + 0.2, -92],
    [0, DECK + 0.2, -104], [0, DECK + 4.4, 86],
  ];
  for (const [x, y, z] of bofPlaces) {
    const b = bofors();
    // Those on the main deck are held inside her deck edge; those up on the
    // 01 and 02 decks stand on houses narrower again.
    b.position.set(inboard(x, z, y > DECK + 2 ? 6.4 : 2.6), y, z);
    b.rotation.y = x < 0 ? -0.7 : 0.7;
    trains(b, b.rotation.y, aaMounts);
    place(b, z);
  }

  // Oerlikons down both deck edges, wherever there is room for a man to stand.
  for (let z = -110; z <= 110; z += 11) {
    if (Math.abs(z) < 20) continue;
    const t = z / (LOA / 2);
    const edge = halfBeam(t) * flareAt(t) - 1.6;
    if (edge < 4) continue;
    for (const s of [-1, 1]) {
      const o = oerlikon();
      o.position.set(s * edge, sheerAt(t), z);
      o.rotation.y = s * 0.9;
      trains(o, o.rotation.y, aaMounts);
      place(o, z);
    }
  }

  // -- quarterdeck ---------------------------------------------------------
  // Two catapults over the transom, a Kingfisher on each.
  for (const s of [-1, 1]) {
    const cat = box(2.6, 0.7, 22, P.gunDark, inboard(s * 8.5, -114, 1.8),
      DECK + 1.2, -114);
    cat.rotation.y = s * 0.10;
    root.add(cat);
    const p = kingfisher();
    p.position.set(inboard(s * 8.5, -114, 1.8), DECK + 3.2, -112);
    p.rotation.y = s * 0.10 + Math.PI;
    root.add(p);
  }
  // The aircraft crane between them.
  const crane = cyl(0.7, 0.9, 9, P.gun, 8);
  crane.position.set(0, DECK + 4.5, -98);
  root.add(crane);
  const jib = tube(0.35, 16, P.gun, 6);
  jib.rotation.x = 1.2;
  jib.position.set(0, DECK + 10, -103);
  root.add(jib);

  // Boats on the 02 deck under their davits.
  for (const s of [-1, 1]) {
    for (const z of [-4, -14]) {
      const boat = cyl(1.0, 0.7, 8.0, P.wood, 8);
      boat.rotation.x = Math.PI / 2;
      boat.scale.set(1, 0.5, 1);
      boat.position.set(s * 11.5, S + 8.6, z);
      root.add(boat);
      for (const dz of [-3, 3]) {
        const dav = cyl(0.16, 0.16, 3.4, P.rail, 6);
        dav.position.set(s * 11.5, S + 9.8, z + dz);
        root.add(dav);
      }
    }
  }

  // -- forecastle ----------------------------------------------------------
  // Breakwater, anchors in their hawsepipes, capstans and the jackstaff.
  const bw = box(halfDeck(106) * 1.8, 1.6, 0.5, P.hullUpper, 0,
    sheerAt(0.78) + 0.8, 106);
  forward.add(bw);
  for (const s of [-1, 1]) {
    forward.add(box(2.0, 2.2, 0.6, P.gunDark,
      inboard(s * 6.5, 122, 1.3), sheerAt(0.90) - 1.2, 122));
    const cap = cyl(1.1, 1.1, 1.0, P.gunDark, 12);
    cap.position.set(inboard(s * 5.0, 110, 1.5), sheerAt(0.80) + 0.5, 110);
    forward.add(cap);
  }
  const jack = cyl(0.12, 0.16, 7, P.rail, 6);
  jack.position.set(0, sheerAt(0.97) + 3.5, 132);
  forward.add(jack);
  const ensign = cyl(0.12, 0.16, 7, P.rail, 6);
  ensign.position.set(0, DECK + 3.5, -131);
  root.add(ensign);

  // -- railings ------------------------------------------------------------
  // Three courses of wire down each side: at this scale they are what stops the
  // deck edge from reading as a cliff. Run in two pieces, parting where the
  // hull does — one length of wire drawn over the break leaves the outline of
  // a bow standing in the air after the bow itself has gone.
  const railMat = new THREE.LineBasicMaterial({ color: P.rail });
  const rails = (z0, z1) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = -1 + (2 * i) / 40;
      const z = (t * LOA) / 2;
      if (z < z0 || z > z1) continue;
      const w = halfBeam(t) * flareAt(t) - 0.4;
      for (const h of [0.5, 1.0, 1.4]) pts.push({ z, w, y: sheerAt(t) + h });
    }
    const linePos = [];
    for (let i = 0; i < pts.length - 3; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = pts[i + k], b = pts[i + 3 + k];
        for (const s of [-1, 1]) linePos.push(s * a.w, a.y, a.z, s * b.w, b.y, b.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    return new THREE.LineSegments(geo, railMat);
  };
  if (breakaway) {
    root.add(rails(-LOA, SPLIT_Z));
    forward.add(rails(SPLIT_Z, LOA));
  } else {
    root.add(rails(-LOA, LOA));
  }

  // Weld her down. The turrets train and the bow section can be blown off, so
  // those are baked on their own and left as separate objects; everything else
  // becomes one mesh per colour.
  for (const t of turrets) { t.userData.dynamic = true; mergeStatic(t); }
  // The bow section stays marked dynamic throughout, so welding the rest of her
  // down leaves it a separate object that can still be blown off.
  if (breakaway) {
    forward.userData.dynamic = true;
    mergeStatic(forward);
  }
  // And what is inside her, fitted to the same lines her plating was lofted
  // through, welded one buffer per compartment so a compartment blown out of
  // her shows what is behind the plating. Her bow section is already its own
  // object -- it can be blown off whole -- so it is left alone.
  buildInterior(root, {
    loa: LOA, sheer: sheerAt, keelY: keelAt, shellAt, zAt,
  });
  mergeStatic(root, bySection(LOA));

  // Assigned into, not over: buildInterior has already hung the lines she was
  // lofted through on her, and the interior audit reads them back off her.
  Object.assign(root.userData,
    { classId: 'iowa', length: LOA, beam: BEAM, deckY: DECK });
  return {
    group: root, turrets, forward, length: LOA, beam: BEAM, deckY: DECK,
    secMounts, aaMounts,
  };
}
