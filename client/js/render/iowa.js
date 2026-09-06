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
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SECTIONS } from '../../../shared/sim.js';

/**
 * How much bigger than the ship that was built.
 *
 * Every length in here is her real one, read off the drawing, and then
 * multiplied by this. Multiplying all of them by the same figure is the whole
 * point: her lines are untouched, so the raked stem, the hollow entry, the
 * sheer and the turn of the bilge are exactly the ship the drawing shows --
 * she is simply larger. Change this one number and she changes size, model and
 * datasheet together; nothing else needs touching.
 */
export const SCALE = 1.30;

export const LOA = 270 * SCALE;
export const BEAM = 33 * SCALE;
export const DRAFT = 11 * SCALE;
// Main deck edge amidships, over the waterline: twenty-four and a half feet,
// which is what the drawing's scale bar reads there. Everything built on her
// is stepped off this, and `sheerAt(0)` has to agree with it.
const DECK = 7.54 * SCALE;
// Where the bow section parts from the rest when the magazines go.
const SPLIT_Z = 44 * SCALE;

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
  [-1.0000, 0.00], [-0.9750, -2.40], [-0.9450, -4.90], [-0.9100, -7.10],
  [-0.8700, -8.80], [-0.8250, -9.90], [-0.7750, -10.35], [-0.7150, -10.60],
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
export function sheerAt(t) { return lerpTable(SHEER, t) * SCALE; }
/** The bottom of her at a station. */
export function keelAt(t) { return lerpTable(KEEL, t) * SCALE; }
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
    const u = Math.min(1, y / Math.max(0.4 * SCALE, sheerAt(t)));
    return Math.max(0.03, bw + (deckHalf(t) - bw) * Math.pow(u, 1.6));
  }
  const d = Math.min(1, -y / Math.max(0.4 * SCALE, -k));
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
const STEM = 6.40 * SCALE;
const COUNTER = 2.57 * SCALE;
function stemAt(y) { return STEM * smooth((y - 2.2 * SCALE) / (9.3 * SCALE)); }
function counterAt(y) { return COUNTER * Math.pow(clamp01(y / (6.9 * SCALE)), 0.62); }

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
  return sheerAt(t) + 0.30 * SCALE;
}

/** And how far outboard the deck edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return deckHalf(t);
}

// ------------------------------------------------------------ her plating --

const BOOT_LO = -1.35 * SCALE;
const BOOT_HI = 1.35 * SCALE;
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
    [(t) => keelAt(t) - 0.02 * SCALE, BOOT_LO, P.antifoul, 20, 1.75],
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
  const MARGIN = 1.7 * SCALE;          // the steel waterway at the deck edge
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
      pos.push(u * w, sh + (1 - u * u) * 0.30 * SCALE, z);
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
    const c = 0.22 * SCALE;
    pos.push(-w, sh, z, w, sh, z, -w, sh + c, z, w, sh + c, z);
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
      pos.push(s * w, y, z,
        s * (w + 0.9 * SCALE * taper), y - 0.25 * SCALE * taper, z);
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
  // Written at her real size and scaled bodily, so the thirty-odd figures in
  // here stay readable as the ship's own rather than as her size times a
  // number.
  const gear = new THREE.Group();
  gear.scale.setScalar(SCALE);
  g.add(gear);
  g = gear;
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
 * The station indices her plating is cut at, in pairs.
 *
 * Her shell and her deck are lofted one piece per compartment rather than one
 * piece from end to end. That is how the damage model takes them off her: a
 * compartment blown out has its own plating hidden, and what is behind it --
 * her frames, her decks, her machinery -- is already there to be seen. Welded
 * end to end the whole shell belongs to whichever compartment its middle
 * happens to fall in, and the other four have no plating at all, which was
 * fine while a superstructure stood over them and gave each one something,
 * and is not fine now her deck is bare.
 *
 * Adjacent pieces share the station they part at, so no seam opens between
 * them; so does the break the bow parts along, when she has one.
 */
function seams(breakaway) {
  const at = (t) => Math.round((STATIONS * (1 + (2 / Math.PI) * Math.asin(t))) / 2);
  const cuts = new Set([0, STATIONS]);
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    for (const t of [s.from, s.to]) if (t > -1 && t < 1) cuts.add(at(t));
  }
  if (breakaway) cuts.add(SPLIT_I);
  const sorted = [...cuts].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((i, n) => [i, sorted[n + 1]]);
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

  for (const cut of seams(breakaway)) {
    const into = breakaway && cut[0] >= SPLIT_I ? fwd : g;
    for (const [lo, hi, color, rows, bias] of strakeBands()) {
      loftBand(into, color, lo, hi, cut[0], cut[1], rows, bias);
    }
    weatherDeck(into, cut[0], cut[1]);
    sheerStrake(into, cut[0], cut[1]);
  }
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
// ------------------------------------------------------------------ assembly --

/**
 * The whole ship: her hull, her deck, and what is inside her.
 *
 * Nothing stands on that deck. Her turrets, her secondary battery, her light
 * battery, her towers, her funnels, her masts, her catapults, her aeroplanes,
 * her boats and her rails are all gone, and the barbette, gunhouse, director
 * and airframe builders that drew them have gone with them. They were the
 * old proportional model's, laid out to a hull that no longer exists; her
 * lines are read off her own drawing now and everything above them will be
 * read off the same sheet rather than carried over.
 *
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

  // The bow section stays marked dynamic throughout, so welding the rest of
  // her down leaves it a separate object that can still be blown off.
  if (breakaway) {
    forward.userData.dynamic = true;
    mergeStatic(forward);
  }
  // And what is inside her, fitted to the same lines her plating was lofted
  // through, welded one buffer per compartment so a compartment blown out of
  // her shows what is behind the plating.
  buildInterior(root, {
    loa: LOA, sheer: sheerAt, keelY: keelAt, shellAt, zAt,
  });
  mergeStatic(root, bySection(LOA));

  // Assigned into, not over: buildInterior has already hung the lines she was
  // lofted through on her, and the interior audit reads them back off her.
  Object.assign(root.userData,
    { classId: 'iowa', length: LOA, beam: BEAM, deckY: DECK });
  // Steel where she is plated and planking where she is decked: the maps go
  // on after the weld, when she is a handful of meshes rather than a few
  // hundred, and the weld is what gave her the coordinates to put them on.
  dressShip(root);
  return {
    group: root, turrets: [], forward, length: LOA, beam: BEAM, deckY: DECK,
    secMounts: [], aaMounts: [],
  };
}
