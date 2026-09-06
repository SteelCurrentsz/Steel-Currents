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
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { RIG, fitCatapults } from './catapult.js';

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
  barrel: 0x3d444a,     // a gun is darker than the mount it sits in
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

// ------------------------------------------------------- what she carries --
//
// Everything above her deck is written at the size of the ship that was built
// and scaled bodily with the hull, so the figures in here read as her own --
// a 16-inch gunhouse is ten metres long because that is what it was -- rather
// than as her real size times a factor. `up` is the group that scaling lives
// in; `D` and `HB` give her deck and her deck edge in the same real metres.

const HALF = LOA / 2 / SCALE;                  // her real half-length
/** Her deck at the centreline, at a station, in her own metres. */
const D = (z) => sheerAt(Math.max(-1, Math.min(1, z / HALF))) / SCALE + 0.30;
/** And how far out her deck edge is there. */
const HB = (z) => halfDeck(z * SCALE) / SCALE;

// Her deckhouses, in the order they stand: each one is a run of stations with
// a half-breadth, and a level above the main deck. Everything on her is
// perched on one of them by `perch` below, which is what stops a mounting
// standing in the air.
const LEVEL = [
  // The weather deck is the only one of them with camber, and it is a third
  // of a metre of it: a fitting laid on the crown height stands that far off
  // the planking at the deck edge, which is exactly the daylight you see.
  { y: 0.00, a: -HALF, f: HALF, hw: (z) => HB(z) - 0.4, cam: 0.30 },
  { y: 3.30, a: -58, f: 50, hw: taper(13.0, -58, 50, 15) },      // the 01
  { y: 6.30, a: -46, f: 41, hw: taper(10.2, -46, 41, 13) },      // the 02
  { y: 9.30, a: -34, f: 24, hw: taper(7.6, -34, 24, 10) },       // the boat deck
];

/** The deck of a level at a station, out at x: the crown, less her camber. */
function deckOf(L, x, z) {
  const u = L.cam ? Math.min(1, Math.abs(x) / Math.max(HB(z), 0.1)) : 0;
  return D(z) + L.y - (L.cam || 0) * u * u;
}

/** Her weather deck itself, out at x -- what a fitting on it stands on. */
const MD = (x, z) => deckOf(LEVEL[0], x, z);

/**
 * Where a thing bolted to her actually stands.
 *
 * Given roughly where it wants to be, this finds the highest deck at that
 * station that reaches out that far, and hauls it inboard if none of them
 * does. It is the whole of how she is kept honest: a mounting laid out on a
 * fixed offset is over the side or hanging off the end of a deckhouse long
 * before you notice, and there is nothing to see from most angles.
 */
function perch(x, z, clear = 1.6) {
  let best = null;
  for (const L of LEVEL) {
    if (z < L.a || z > L.f) continue;
    const room = L.hw(z) - clear;
    if (room < 0.6) continue;
    const at = Math.sign(x || 1) * Math.min(Math.abs(x), room);
    if (!best || L.y > best.lift) {
      best = { x: at, y: deckOf(L, at, z), lift: L.y };
    }
  }
  return best || { x: Math.sign(x || 1) * 0.6, y: deckOf(LEVEL[0], x, z), lift: 0 };
}

/** A mesh into a group, in one line. */
function put(g, m, x, y, z, ry = 0) {
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  g.add(m);
  return m;
}
const bx = (g, w, h, d, c, x, y, z, ry) => put(g, box(w, h, d, c), x, y, z, ry);
const cy = (g, rt, rb, h, c, x, y, z, seg = 14) =>
  put(g, cyl(rt, rb, h, c, seg), x, y, z);

/** A ladder run, which is what tells you how big everything else is. */
function ladder(g, x, y0, y1, z, sgn = 1) {
  const h = y1 - y0;
  if (h < 0.4) return;
  for (const s of [-0.24, 0.24]) bx(g, 0.08, h, 0.08, P.rail, x + s, y0 + h / 2, z);
  for (let i = 0; i * 0.34 < h - 0.2; i++) {
    bx(g, 0.56, 0.05, 0.05, P.rail, x, y0 + 0.2 + i * 0.34, z + sgn * 0.02);
  }
}

/** Splinter screen round an open platform. */
function tub(g, r, y, z, x = 0, h = 1.1, c = P.gun) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const b = ((i + 1) / N) * Math.PI * 2;
    const mx = x + ((Math.sin(a) + Math.sin(b)) / 2) * r;
    const mz = z + ((Math.cos(a) + Math.cos(b)) / 2) * r;
    const len = Math.hypot(Math.sin(b) - Math.sin(a), Math.cos(b) - Math.cos(a)) * r;
    bx(g, 0.14, h, len + 0.06, c, mx, y + h / 2, mz, Math.atan2(
      (Math.sin(b) - Math.sin(a)) * r, (Math.cos(b) - Math.cos(a)) * r));
  }
  cy(g, r + 0.1, r + 0.1, 0.16, P.deck, x, y + 0.08, z, 18);
}

// ------------------------------------------------------------ the battery --

/**
 * One 16"/50 triple: the barbette she trains on, the gunhouse, and the three
 * rifles in their slides.
 *
 * An Iowa's turret is not a box. The face is a single steep plate seventeen
 * inches thick, the sides tumble home a little, the roof overhangs at the
 * back, and the whole of it is nearly twelve metres across and ten deep --
 * which at this scale is a small building that trains.
 */
function turret16(range = false) {
  const g = new THREE.Group();
  // The ring above the barbette, which is the only part of her that does not
  // move with the guns.
  cy(g, 6.6, 6.8, 1.1, P.gunDark, 0, -0.55, 0, 24);
  // The gunhouse: sloped face, straight sides, overhanging roof.
  const H = 4.6;
  bx(g, 11.6, H, 8.4, P.gun, 0, H / 2, -0.6);
  const face = bx(g, 11.6, 4.2, 0.9, P.gun, 0, H / 2 + 0.1, 3.9);
  face.rotation.x = -0.30;
  bx(g, 12.2, 0.30, 10.4, P.gunDark, 0, H + 0.15, -0.5);
  bx(g, 12.4, 0.14, 10.6, P.gun, 0, H + 0.02, -0.5);
  // The after face, where the ejection ports and the ladder are.
  bx(g, 10.4, 2.0, 0.3, P.gunDark, 0, 1.6, -4.9);
  ladder(g, 3.4, 0, H, -4.85, -1);
  // Sighting hoods either side, and the periscopes through the roof.
  for (const s of [-1, 1]) {
    cy(g, 0.62, 0.72, 0.9, P.gun, s * 4.3, H + 0.55, 1.1, 12);
    bx(g, 0.7, 0.26, 0.16, P.glass, s * 4.3, H + 0.72, 1.55);
    cy(g, 0.22, 0.22, 0.5, P.gunDark, s * 2.2, H + 0.4, -3.2, 8);
  }
  // The big rangefinder in turrets 2 and 3, sticking out either side of her.
  if (range) {
    const t = tube(0.52, 13.6, P.gun, 12);
    t.rotation.z = Math.PI / 2;
    put(g, t, 0, H + 0.55, -2.6);
    for (const s of [-1, 1]) {
      bx(g, 0.8, 0.9, 1.1, P.gun, s * 6.6, H + 0.55, -2.6);
      bx(g, 0.14, 0.4, 0.6, P.glass, s * 7.05, H + 0.58, -2.6);
    }
  }
  // Three rifles, twenty metres of barrel apiece, in their blast bags.
  for (const dx of [-3.05, 0, 3.05]) {
    const slide = bx(g, 1.9, 1.7, 3.2, P.gunDark, dx, 2.5, 4.2);
    slide.rotation.x = -0.02;
    // The bag: a short fat cone where the barrel comes through the face.
    cy(g, 0.95, 1.25, 1.8, P.canvas, dx, 2.6, 5.4, 12).rotation.x = Math.PI / 2;
    const bar = tube(0.52, 20.5, P.barrel, 14);
    put(g, bar, dx, 2.66, 15.6);
    // The chase is thinner than the breech end, which is what a built-up gun
    // looks like: a step, not a taper.
    put(g, tube(0.62, 7.0, P.barrel, 14), dx, 2.62, 9.4);
  }
  return g;
}

/** One twin 5"/38 in its Mk 28 mount: the gunhouse and two barrels. */
function mount5() {
  const g = new THREE.Group();
  cy(g, 2.5, 2.7, 0.5, P.gunDark, 0, -0.25, 0, 18);
  bx(g, 4.5, 2.5, 4.6, P.gun, 0, 1.25, -0.35);
  const face = bx(g, 4.5, 1.9, 0.5, P.gun, 0, 1.35, 2.0);
  face.rotation.x = -0.26;
  bx(g, 4.7, 0.16, 5.0, P.gunDark, 0, 2.55, -0.35);
  bx(g, 0.6, 0.5, 0.16, P.glass, -1.2, 1.9, 2.2);
  for (const dx of [-0.95, 0.95]) {
    cy(g, 0.42, 0.55, 0.7, P.canvas, dx, 1.5, 2.4, 10).rotation.x = Math.PI / 2;
    put(g, tube(0.19, 5.6, P.barrel, 10), dx, 1.52, 5.1);
  }
  return g;
}

/** A quad 40 mm Bofors on its Mk 4 mounting, with the director beside it. */
function bofors() {
  const g = new THREE.Group();
  cy(g, 1.35, 1.5, 0.45, P.gunDark, 0, -0.2, 0, 14);
  bx(g, 2.5, 1.05, 2.4, P.gun, 0, 0.55, -0.35);
  bx(g, 2.7, 1.5, 0.35, P.gun, 0, 1.0, 0.75);
  for (const dx of [-0.72, -0.24, 0.24, 0.72]) {
    put(g, tube(0.10, 3.4, P.barrel, 8), dx, 1.35, 2.1);
    bx(g, 0.2, 0.34, 0.5, P.gunDark, dx, 1.35, 0.35);
  }
  // The loaders' platforms either side, which is most of what a quad looks
  // like from any distance at all.
  for (const s of [-1, 1]) bx(g, 1.0, 0.1, 2.2, P.deck, s * 1.7, 0.1, -0.7);
  return g;
}

/** A single 20 mm Oerlikon on its pedestal, behind its splinter shield. */
function oerlikon() {
  const g = new THREE.Group();
  cy(g, 0.24, 0.34, 1.0, P.gunDark, 0, 0.5, 0, 10);
  bx(g, 0.95, 0.85, 0.14, P.gun, 0, 1.35, 0.42);
  const b = put(g, tube(0.055, 1.9, P.barrel, 8), 0, 1.45, 1.3);
  b.rotation.x = Math.PI / 2 - 0.30;
  cy(g, 0.26, 0.26, 0.2, P.gunDark, 0, 1.72, 0.9, 10);
  return g;
}

// ------------------------------------------------------- fire control --

/** A Mk 37 director: the box, the rangefinder through it, and its radar. */
function mk37() {
  const g = new THREE.Group();
  cy(g, 1.5, 1.7, 0.6, P.gunDark, 0, -0.3, 0, 14);
  bx(g, 3.0, 2.2, 3.6, P.gun, 0, 1.1, -0.2);
  const t = tube(0.24, 4.6, P.gun, 10);
  t.rotation.z = Math.PI / 2;
  put(g, t, 0, 1.5, 0.6);
  bx(g, 1.6, 1.1, 0.14, P.radar, 0, 2.9, 0.5);
  bx(g, 0.12, 1.1, 0.5, P.gunDark, 0, 2.35, 0.2);
  return g;
}

/** A Mk 38 main-battery director, with its Mk 8 antenna over the hood. */
function mk38() {
  const g = new THREE.Group();
  cy(g, 2.1, 2.3, 0.7, P.gunDark, 0, -0.35, 0, 16);
  bx(g, 4.2, 2.6, 4.4, P.gun, 0, 1.3, -0.2);
  const t = tube(0.30, 8.0, P.gun, 12);
  t.rotation.z = Math.PI / 2;
  put(g, t, 0, 1.7, 0.9);
  for (const s of [-1, 1]) bx(g, 0.6, 0.8, 0.9, P.gun, s * 3.9, 1.7, 0.9);
  // The Mk 8: a long flat box of dipoles, which is the thing that makes her
  // silhouette after 1943 different from her silhouette before it.
  bx(g, 5.0, 1.5, 0.3, P.radar, 0, 3.6, 0.4);
  bx(g, 5.2, 0.16, 0.5, P.gunDark, 0, 2.75, 0.4);
  return g;
}

/** The SK air-search antenna: the bedspring, on its own pedestal. */
function radarSK() {
  const g = new THREE.Group();
  bx(g, 5.2, 5.2, 0.24, P.radar, 0, 2.6, 0);
  for (let i = 1; i < 5; i++) {
    bx(g, 5.2, 0.08, 0.08, P.gunDark, 0, i * 1.04, 0.16);
    bx(g, 0.08, 5.2, 0.08, P.gunDark, i * 1.04 - 2.6, 2.6, 0.16);
  }
  cy(g, 0.3, 0.34, 1.0, P.gunDark, 0, -0.5, 0, 10);
  return g;
}

/** An SG surface-search antenna: a small dish in a cheese-shaped housing. */
function radarSG() {
  const g = new THREE.Group();
  bx(g, 2.6, 0.9, 0.4, P.radar, 0, 0.45, 0);
  bx(g, 2.7, 0.16, 0.5, P.gunDark, 0, 0.94, 0);
  cy(g, 0.22, 0.26, 0.8, P.gunDark, 0, -0.4, 0, 10);
  return g;
}

// ------------------------------------------------------ the aeroplane --

/** An OS2U Kingfisher on her float, which is what she flies off the girder. */
function kingfisher(parent, x, y, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  const body = cy(g, 0.48, 0.30, 9.6, P.plane, 0, 0, 0.2, 10);
  body.rotation.x = Math.PI / 2;
  // The long greenhouse over two seats.
  bx(g, 0.9, 0.7, 3.4, P.glass, 0, 0.55, 0.4);
  // Wings, tail and fin.
  bx(g, 10.9, 0.22, 1.8, P.plane, 0, 0.22, 0.5);
  bx(g, 3.6, 0.18, 1.0, P.plane, 0, 0.75, -3.9);
  bx(g, 0.18, 1.7, 1.2, P.plane, 0, 1.4, -4.1);
  // The great central float on its struts, and the wingtip floats.
  const fl = cy(g, 0.42, 0.30, 7.8, P.plane, 0, -1.5, 0.4, 10);
  fl.rotation.x = Math.PI / 2;
  for (const dz of [-1.6, 1.4]) {
    for (const s of [-1, 1]) {
      const st = bx(g, 0.1, 1.5, 0.1, P.plane, s * 0.5, -0.75, dz);
      st.rotation.z = s * 0.24;
    }
  }
  for (const s of [-1, 1]) {
    const wf = cy(g, 0.17, 0.13, 1.9, P.plane, s * 4.6, -0.6, 0.5, 8);
    wf.rotation.x = Math.PI / 2;
    bx(g, 0.08, 0.8, 0.08, P.plane, s * 4.6, -0.2, 0.5);
  }
  // The engine, and the disc her propeller turns into.
  cy(g, 0.55, 0.55, 1.2, P.gunDark, 0, 0.05, 4.4, 12).rotation.x = Math.PI / 2;
  const prop = new THREE.Mesh(new THREE.CircleGeometry(1.55, 12),
    new THREE.MeshBasicMaterial({
      color: 0x9aa6b2, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    }));
  prop.position.set(0, 0.05, 5.1);
  g.add(prop);
  g.userData.prop = prop;
  return g;
}

// ------------------------------------------------------ her upperworks --

/**
 * A deckhouse, with a lip round its roof.
 *
 * Its half-breadth is a function of the station rather than a number, because
 * a deckhouse is not a brick: the ends are drawn in, and amidships it runs out
 * to within a couple of metres of the ship's side. Lofted from that function
 * so the drawing-in is a shape and not a step.
 */
function house(g, hw, za, zf, sole, roof, color = P.hullUpper, lip = true) {
  const f = typeof hw === 'function' ? hw : () => hw;
  const N = Math.max(2, Math.round((zf - za) / 2.5));
  const pos = [];
  const idx = [];
  const row = (z) => {
    const w = Math.max(0.4, f(z));
    const i = pos.length / 3;
    pos.push(-w, sole, z, w, sole, z, -w, roof, z, w, roof, z);
    return i;
  };
  // The end walls get rows of their own rather than sharing the first and last
  // rows of the sides. Averaged vertex normals are what make a lofted surface
  // read as a curve, and a corner where the end wall and the side share a
  // vertex gets an average of the two -- a bright wedge across the front of
  // every deckhouse on her.
  const aft = row(za);
  idx.push(aft, aft + 2, aft + 1, aft + 1, aft + 2, aft + 3);
  let a = row(za);
  for (let k = 1; k <= N; k++) {
    const b = row(za + ((zf - za) * k) / N);
    idx.push(a, b, a + 2, a + 2, b, b + 2);                    // port side
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);        // starboard
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);        // the roof
    a = b;
  }
  const fwd = row(zf);
  idx.push(fwd, fwd + 1, fwd + 2, fwd + 1, fwd + 3, fwd + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat(color)));
  // The lip: the same shape a quarter of a metre proud, which is the coaming
  // round the edge of the deck above and what makes the level read as a deck.
  if (lip) {
    house(g, (z) => f(z) + 0.28, za - 0.28, zf + 0.28, roof, roof + 0.18,
      P.deck, false);
  }
  return roof;
}

/**
 * A half-breadth that draws in at both ends of a run.
 *
 * `hw` amidships, eased down to a little over half that at each end over the
 * last `run` metres, and never further out than the hull is wide there.
 */
function taper(hw, za, zf, run = 12, keep = 0.58) {
  return (z) => {
    const e = smooth(Math.min(z - za, zf - z) / run);
    return Math.min(hw * (keep + (1 - keep) * e), HB(z) - 1.2);
  };
}

/**
 * The two long deckhouses and the boat deck over them.
 *
 * An Iowa's superstructure is not a tower on a flat deck: it is a hundred and
 * ten metres of house, three storeys of it, stepped in as it goes up, with the
 * five-inch battery standing on the first roof and the boats and the funnels
 * on the third. Everything else on her is bolted to one of these.
 */
function deckhouses(g) {
  const L = LEVEL;
  for (let i = 1; i < L.length; i++) {
    const lv = L[i];
    const y = D((lv.a + lv.f) / 2);
    // Carried down past the lowest deck it stands on rather than sat on top
    // of one height of it: the deck under her has sheer, so a house with a
    // flat sole has daylight under one end of it.
    const sole = Math.min(D(lv.a), D(lv.f), y) + L[i - 1].y - 1.4;
    house(g, lv.hw, lv.a, lv.f, sole, y + lv.y);
    // Scuttles and doors down the side of each storey.
    for (let z = lv.a + 4; z < lv.f - 4; z += 6) {
      for (const s of [-1, 1]) {
        cy(g, 0.22, 0.22, 0.1, P.gunDark, s * lv.hw(z), y + lv.y - 1.4, z, 10)
          .rotation.z = Math.PI / 2;
      }
    }
    // A ladder from the deck below at each end of her.
    for (const s of [-1, 1]) {
      ladder(g, s * (lv.hw(lv.a + 2.0) - 1.2), y + lv.y - 3.0, y + lv.y,
        lv.a + 2.0);
    }
  }
}

/**
 * The forward tower: conning tower, pilot house, navigating bridge, the fire
 * control tower over them and the main battery director on top of that.
 *
 * Read off her profile. It is a stack, not a slab: each level steps in on the
 * one under it and carries a walkway round the step, and the director is
 * thirty-three metres over the water, with the foremast and its air-search
 * bedspring going on up to a hundred and thirty-five feet -- which is the
 * line the drawing itself marks across her.
 */
function bridgeTower(g) {
  const base = D(12) + LEVEL[3].y;               // the boat deck
  // The pilot house and the bridge over it, each stepped in.
  let y = house(g, 6.4, 4, 20, base - 1.0, base + 3.0);
  // Windows: the band round the front of the pilot house is the one thing
  // that says which way a bridge is facing.
  bx(g, 11.0, 1.0, 0.2, P.glass, 0, base + 1.9, 20.05);
  for (const s of [-1, 1]) bx(g, 0.2, 1.0, 7.0, P.glass, s * 6.45, base + 1.9, 16.0);
  y = house(g, 5.4, 5, 18, y - 0.4, y + 2.8);
  bx(g, 9.2, 0.9, 0.2, P.glass, 0, y - 1.4, 18.05);
  // The open bridge wings, which is where she is actually conned from.
  for (const s of [-1, 1]) {
    bx(g, 2.6, 0.16, 4.4, P.deck, s * 6.4, y + 0.08, 15.0);
    tub(g, 1.5, y, 15.0, s * 6.6, 1.05, P.hullUpper);
  }
  // The armoured conning tower standing through the middle of the lot.
  cy(g, 4.2, 4.5, base + 8.2 - D(14), P.gun, 0, (base + 8.2 + D(14)) / 2, 14, 18);
  cy(g, 3.4, 3.4, 0.4, P.gunDark, 0, base + 8.4, 14, 18);
  bx(g, 6.0, 0.5, 0.3, P.glass, 0, base + 6.4, 18.0);

  // The tower above the bridge: five levels of it, each stepped in on the one
  // under it, which is what an Iowa's forward tower actually is. A slab reads
  // as a wall; the steps are what make it read as a ship.
  //
  //   05  sky lookout and the after range-finder
  //   06  the fire control tower proper
  //   07  its top, with the main battery director standing on it
  const TIERS = [
    [4, 16, 4.6, 3.0],
    [5, 13.5, 3.8, 3.4],
    [6, 12.5, 3.2, 3.0],
  ];
  let ly = y;
  let lhw = 5.4;
  for (const [za, zf, hw, h] of TIERS) {
    // A skirt of platform round each step, which is the walkway that goes
    // round a tower level and the reason the steps read from a distance.
    bx(g, lhw * 2, 0.16, (zf - za) + 2.6, P.deck, 0, ly + 0.08, (za + zf) / 2);
    for (const s of [-1, 1]) {
      bx(g, 0.12, 1.0, (zf - za) + 2.6, P.rail, s * lhw, ly + 0.6, (za + zf) / 2);
    }
    ly = house(g, hw, za, zf, ly - 0.6, ly + h);
    lhw = hw;
    ladder(g, lhw - 0.9, ly - h, ly, za + 0.4, -1);
  }
  const top = ly;
  const tz = 9.0;
  // The director platform: the one level that oversails the tower under it,
  // because the director itself is wider than the top of the tower.
  bx(g, 8.4, 0.22, 9.6, P.deck, 0, top + 0.11, tz);
  for (const s of [-1, 1]) bx(g, 0.14, 1.0, 9.6, P.rail, s * 4.2, top + 0.7, tz);
  // Struts under the overhang, so it is carried rather than floating.
  for (const s of [-1, 1]) {
    for (const sz of [tz - 3.2, tz + 3.2]) {
      const st = bx(g, 2.2, 0.16, 0.16, P.gun, s * 3.0, top - 0.9, sz);
      st.rotation.z = -s * 0.62;
    }
  }
  // The main battery director on the tower top, and the SG set beside it.
  const dir = mk38();
  dir.position.set(0, top + 0.22, tz + 1.4);
  dir.userData.dynamic = true;
  dir.userData.rest = 0;
  g.add(dir);
  put(g, radarSG(), 0, top + 0.22, tz - 3.6);

  // The foremast: a stump on the tower top carrying the air-search antenna,
  // her highest point and the one the drawing measures to.
  const mz = tz - 2.6;
  cy(g, 0.34, 0.46, 41.5 - top, P.rail, 0, (41.5 + top) / 2, mz, 10);
  for (const s of [-1, 1]) {
    const stay = bx(g, 0.14, 5.4, 0.14, P.rail, s * 1.4, top + 2.6, mz);
    stay.rotation.z = -s * 0.24;
  }
  bx(g, 9.0, 0.14, 0.14, P.rail, 0, 36.2, mz);          // the yard
  put(g, radarSK(), 0, 36.6, mz + 0.5);
  // The topmast and her wireless aerials, which is what the top of a mast is.
  cy(g, 0.10, 0.16, 3.0, P.rail, 0, 43.0, mz, 8);
  return dir;
}

/**
 * Her two funnels.
 *
 * Iowa's are oval, tapered and raked a little aft, capped flat, and the after
 * one is grown into the after superstructure rather than standing free. Both
 * come up off the boat deck.
 */
function funnels(g) {
  for (const [z, h] of [[-14, 30.0], [-36, 29.0]]) {
    const foot = D(z) + LEVEL[3].y;
    const f = new THREE.Group();
    f.position.set(0, foot, z);
    f.rotation.x = -0.06;
    g.add(f);
    const H = h - foot;
    // The trunk: a tapering oval, drawn as a squashed cylinder so the section
    // is right rather than round.
    const trunk = cy(f, 2.9, 3.7, H, P.hullUpper, 0, H / 2, 0, 20);
    trunk.scale.set(1, 1, 0.78);
    const cap = cy(f, 3.0, 3.0, 0.5, P.gunDark, 0, H + 0.2, 0, 20);
    cap.scale.set(1, 1, 0.78);
    cy(f, 2.4, 2.4, 0.2, P.boot, 0, H + 0.34, 0, 18).scale.set(1, 1, 0.78);
    // The bands round her, and the steam pipes up the after side.
    for (const by of [H * 0.35, H * 0.7]) {
      cy(f, 3.45 - by * 0.02, 3.45 - by * 0.02, 0.26, P.gunDark, 0, by, 0, 20)
        .scale.set(1, 1, 0.78);
    }
    for (const s of [-1, 1]) {
      cy(f, 0.16, 0.16, H * 0.92, P.rail, s * 0.9, H * 0.46, -2.6, 8);
    }
    ladder(f, 1.2, 0, H - 1.0, -2.9, -1);
    // The uptake casing round her foot, which is what she stands on.
    bx(g, 8.6, 2.2, 9.0, P.hullUpper, 0, foot + 1.1, z);
    bx(g, 9.2, 0.18, 9.6, P.deck, 0, foot + 2.2, z);
  }
}

/**
 * The after superstructure: the tower carrying the after main-battery
 * director, the mainmast on top of it, and the after five-inch director.
 *
 * Stepped the same way the forward tower is, because it is the same kind of
 * structure -- a shorter one with no bridge in it.
 */
function afterTower(g) {
  const TIERS = [
    [-60, -38, 5.6, 3.2],
    [-56, -41, 4.4, 3.2],
    [-53, -43, 3.4, 3.0],
  ];
  const sole = D(-48) + LEVEL[2].y;              // up off the 02 roof
  // Where the mainmast stands and where the after five-inch director does:
  // the roofs of the first two steps.
  const firstRoof = sole + TIERS[0][3];
  const secondRoof = firstRoof + TIERS[1][3];
  let ly = sole;
  let lhw = 7.4;
  for (const [za, zf, hw, h] of TIERS) {
    bx(g, lhw * 2, 0.16, (zf - za) + 2.4, P.deck, 0, ly + 0.08, (za + zf) / 2);
    for (const s of [-1, 1]) {
      bx(g, 0.12, 1.0, (zf - za) + 2.4, P.rail, s * lhw, ly + 0.6, (za + zf) / 2);
    }
    ly = house(g, hw, za, zf, ly - 0.6, ly + h);
    lhw = hw;
    ladder(g, lhw - 0.8, ly - h, ly, zf - 0.4, 1);
  }
  const top = ly;
  // The after main-battery director, on a platform that oversails the tower.
  bx(g, 8.0, 0.22, 8.4, P.deck, 0, top + 0.11, -47.5);
  for (const s of [-1, 1]) bx(g, 0.14, 1.0, 8.4, P.rail, s * 4.0, top + 0.7, -47.5);
  for (const s of [-1, 1]) {
    for (const sz of [-50.5, -44.5]) {
      const st = bx(g, 2.0, 0.16, 0.16, P.gun, s * 2.8, top - 0.9, sz);
      st.rotation.z = -s * 0.62;
    }
  }
  const dir = mk38();
  dir.position.set(0, top + 0.22, -46.5);
  dir.rotation.y = Math.PI;
  dir.userData.dynamic = true;
  dir.userData.rest = Math.PI;
  g.add(dir);
  // The after five-inch director, a level down and looking the same way.
  const sec = mk37();
  sec.position.set(0, secondRoof + 0.2, -42.0);
  sec.rotation.y = Math.PI;
  g.add(sec);
  // The mainmast: a pole off the after end of the lowest step, carrying the
  // surface-search set, with the after yard on it.
  const mz = -58.0;
  cy(g, 0.30, 0.42, 34.0 - firstRoof, P.rail, 0, (34.0 + firstRoof) / 2, mz, 10);
  bx(g, 7.6, 0.14, 0.14, P.rail, 0, 29.6, mz);
  put(g, radarSG(), 0, 30.0, mz + 0.5);
  for (const s of [-1, 1]) {
    const stay = bx(g, 0.14, 4.6, 0.14, P.rail, s * 1.2, firstRoof + 2.2, mz);
    stay.rotation.z = -s * 0.22;
  }
  return dir;
}

/**
 * The four Mark 37 secondary directors, and her searchlights.
 *
 * A five-inch battery is only as good as what is telling it where to shoot,
 * and she carried four of these: one over the bridge, two abreast the funnels
 * on the boat deck, one on the after tower. The after one goes up with the
 * tower; these are the other three, and the pair of thirty-six-inch lights
 * that stand between the funnels.
 */
function secondaryDirectors(g) {
  // Forward, on the platform over the pilot house, looking ahead.
  const fwd = mk37();
  const at = perch(0, 20.0, 3.0);
  fwd.position.set(0, at.y + 3.2, 20.5);
  g.add(fwd);
  // Abreast the funnels, on the boat deck, one each side.
  for (const s of [-1, 1]) {
    const on = perch(s * 6.4, -25.0, 2.4);
    const d = mk37();
    d.position.set(on.x, on.y, -25.0);
    d.rotation.y = s * 1.2;
    g.add(d);
    // And a searchlight on its own tower abaft it.
    const lt = perch(s * 6.2, -30.0, 1.8);
    cy(g, 0.5, 0.6, 2.4, P.hullUpper, lt.x, lt.y + 1.2, -30.0, 12);
    const drum = cy(g, 0.95, 0.95, 1.1, P.gunDark, lt.x, lt.y + 3.0, -30.0, 16);
    drum.rotation.z = Math.PI / 2;
    cy(g, 0.88, 0.88, 0.12, P.glass, lt.x + s * 0.58, lt.y + 3.0, -30.0, 16)
      .rotation.z = Math.PI / 2;
  }
}

// ---------------------------------------------------------- her armament --

/**
 * The main battery: three 16"/50 triples, on their barbettes.
 *
 * A and B forward, B superfiring over her, and Y right aft. Where they stand
 * is her datasheet's, not this file's -- the simulation fires from those
 * stations and the model has to agree with it or her broadsides come out of
 * points in the air beside her.
 */
function mainBattery(g) {
  const out = [];
  const spec = SHIP_CLASSES.iowa.turrets;
  for (const t of spec) {
    const z = t.z / SCALE;
    const deck = D(z);
    const lift = t.name === 'B' ? 4.6 : 1.2;
    // The barbette: an armoured cylinder standing out of the deck, and the
    // ring the turret trains on.
    cy(g, 7.0, 7.3, lift + 1.4, P.hull, 0, deck + (lift - 1.4) / 2, z, 24);
    cy(g, 7.2, 7.2, 0.3, P.gunDark, 0, deck + lift - 0.15, z, 24);
    const house = turret16(t.name !== 'A');
    house.position.set(0, deck + lift, z);
    if (t.angle) house.rotation.y = t.angle;
    house.userData.dynamic = true;
    house.userData.rest = t.angle || 0;
    g.add(house);
    out.push(house);
  }
  return out;
}

/** The secondary battery: ten twin five-inch, five a side, on the 01 roof. */
function secondaries(g) {
  const out = [];
  for (const m of SHIP_CLASSES.iowa.secondary.mounts) {
    const z = m.z / SCALE;
    const at = perch(m.x / SCALE, z, 2.6);
    const mt = mount5();
    mt.position.set(at.x, at.y, z);
    mt.rotation.y = m.angle;
    mt.userData.dynamic = true;
    mt.userData.rest = m.angle;
    g.add(mt);
    out.push(mt);
    // The handling room under her, which is what a mount stands on.
    cy(g, 2.9, 3.1, 1.0, P.hullUpper, at.x, at.y - 0.5, z, 16);
  }
  return out;
}

/**
 * The light battery: twenty quad Bofors and the Oerlikons along her edges.
 *
 * Every one of them is put on the highest deck at its own station that
 * actually reaches out that far, and hauled inboard if none of them does.
 * She is very fine forward -- six metres of half-breadth abreast the anchors
 * -- so a gun laid out on a fixed offset is over the side long before the bow.
 */
function lightBattery(g) {
  const out = [];
  for (const gun of SHIP_CLASSES.iowa.aa.guns) {
    for (const m of gun.mounts) {
      const z = m.z / SCALE;
      const quad = gun.caliber === 40;
      const at = perch(m.x / SCALE, z, quad ? 2.6 : 1.4);
      const mt = quad ? bofors() : oerlikon();
      mt.position.set(at.x, at.y + (quad ? 0.55 : 0.16), z);
      mt.rotation.y = m.angle;
      mt.userData.dynamic = true;
      mt.userData.rest = m.angle;
      g.add(mt);
      out.push(mt);
      // Every quad stands in a splinter tub, which is both what held the
      // crew in and what makes the gun read at any distance.
      if (quad) tub(g, 2.9, at.y, z, at.x, 1.15);
      else bx(g, 1.5, 0.16, 1.5, P.deck, at.x, at.y + 0.08, z);
    }
  }
  return out;
}

// ----------------------------------------------------------- her aviation --

const CAT_Z = -108;                            // where the turntables stand
const CAT_X = 8.5;                             // and how far off the centreline

/**
 * The quarterdeck: two catapults, the crane between them, and the aircraft.
 *
 * This is the after end of an Iowa, and it is the one part of her a captain
 * flies from: the girders train out over the quarter, the charge throws the
 * cradle down the track, and the Kingfisher is in the air. What happens on
 * them is in catapult.js, because a cruiser does exactly the same thing.
 */
function aviation(g) {
  const qd = MD(CAT_X, CAT_Z);   // out on the quarter, where the camber is
  const cats = [];
  for (const sgn of [-1, 1]) {
    const cat = new THREE.Group();
    cat.position.set(sgn * CAT_X, qd, CAT_Z);
    cat.rotation.y = sgn * RIG.REST;
    cat.userData.dynamic = true;
    g.add(cat);
    const len = RIG.FRONT - RIG.BACK;
    const mid = (RIG.FRONT + RIG.BACK) / 2;
    // The turntable, the two rails, and the sleepers between them.
    cy(cat, 2.2, 2.4, 0.6, P.gunDark, 0, 0.3, 0, 18);
    for (const rail of [-0.8, 0.8]) {
      bx(cat, 0.32, 0.5, len, P.gun, rail, 1.05, mid);
      bx(cat, 0.38, 0.14, len, P.gunDark, rail, 1.36, mid);
    }
    for (let i = 0; i < 10; i++) {
      bx(cat, 1.9, 0.24, 0.3, P.gun, 0, 0.75, RIG.BACK + 0.9 + i * 1.95);
    }
    // Trusswork under the girder forward, where it is carried out over the
    // side with nothing under it but the sea.
    for (let i = 0; i < 6; i++) {
      const br = bx(cat, 0.16, 0.14, 2.4, P.gun, 0, 0.55, RIG.BACK + 6.4 + i * 1.9);
      br.rotation.x = i % 2 ? 0.6 : -0.6;
    }
    // The charge house at the after end: a catapult is a gun, and this is the
    // breech of it.
    bx(cat, 2.3, 1.3, 2.6, P.gun, 0, 1.3, RIG.BACK + 0.6);
    bx(cat, 1.1, 0.9, 1.1, P.gunDark, 0, 2.1, RIG.BACK + 0.6);
    // The car she is bolted to, which is the thing that actually moves.
    const car = new THREE.Group();
    car.position.set(0, 0, RIG.A);
    car.userData.dynamic = true;
    cat.add(car);
    bx(car, 2.0, 0.4, 2.0, P.gunDark, 0, 1.75, 0);
    bx(car, 2.1, 0.24, 0.5, P.gun, 0, 1.5, -0.9);
    const plane = kingfisher(car, 0, RIG.PLANE_Y, RIG.PLANE_Z, 0);
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn });
  }

  // The crane on the centreline abaft them, which is how a scout gets back
  // aboard: she lands alongside, taxis on to a sled, and is picked up.
  const cz = -96;
  const cr = new THREE.Group();
  cr.position.set(0, D(cz), cz);
  g.add(cr);
  cy(cr, 1.3, 1.6, 5.0, P.hullUpper, 0, 2.5, 0, 16);
  cy(cr, 1.9, 1.9, 0.3, P.gunDark, 0, 0.15, 0, 18);
  const jib = new THREE.Group();
  jib.position.set(0, 4.9, 0);
  jib.rotation.x = -0.16;
  cr.add(jib);
  for (const s of [-1, 1]) {
    for (const dx of [-0.5, 0.5]) bx(jib, 0.18, 0.18, 17.0, P.gun, dx, s * 0.5, 8.2);
  }
  for (let i = 0; i < 8; i++) {
    for (const s of [-1, 1]) {
      const br = bx(jib, 0.12, 1.0, 0.12, P.rail, s * 0.5, 0, 1.0 + i * 2.0);
      br.rotation.x = i % 2 ? 0.5 : -0.5;
    }
  }
  bx(jib, 1.2, 0.16, 1.2, P.gunDark, 0, 0, 16.4);
  bx(cr, 0.08, 3.0, 0.08, P.rail, 0, 5.6, 16.0);         // the whip
  ladder(cr, 1.5, 0, 4.6, -0.1, -1);
  return cats;
}

// ---------------------------------------------------------- her fittings --

/**
 * Boats, ground tackle, ventilators, staffs and the rest of it.
 *
 * Nothing here does anything. It is all there because a warship with a bare
 * deckhouse roof reads as a model of a warship, and one with boats in chocks,
 * cowls, ready-use lockers and a jackstaff reads as a ship.
 */
function fittings(g) {
  // The boats, on the 02 roof under their davits.
  const by = D(-26) + LEVEL[2].y;
  for (const s of [-1, 1]) {
    for (const z of [-20, -30]) {
      const hull = cy(g, 1.15, 0.8, 11.0, P.wood, s * 8.0, by + 1.4, z, 10);
      hull.rotation.x = Math.PI / 2;
      hull.scale.set(1, 0.55, 1);
      bx(g, 2.6, 0.5, 2.2, P.wood, s * 8.0, by + 1.9, z - 3.0);
      for (const dz of [-4.4, 4.4]) {
        cy(g, 0.16, 0.20, 4.0, P.rail, s * 8.9, by + 2.0, z + dz, 8);
        bx(g, 0.9, 0.16, 0.16, P.rail, s * 8.5, by + 3.9, z + dz);
      }
      bx(g, 3.0, 0.6, 1.2, P.gunDark, s * 8.0, by + 0.3, z);
    }
  }
  // Ventilator cowls in pairs down the 01 roof, and ready-use lockers.
  const vy = D(0) + LEVEL[1].y;
  for (const z of [34, 14, -6, -26, -46]) {
    for (const s of [-1, 1]) {
      cy(g, 0.42, 0.5, 2.2, P.hullUpper, s * 12.0, vy + 1.1, z, 12);
      const bell = cy(g, 0.75, 0.45, 0.9, P.hullUpper, s * 12.0, vy + 2.5, z + 0.3, 14);
      bell.rotation.x = -1.05;
      bx(g, 1.4, 1.0, 2.4, P.hullUpper, s * 12.0, vy + 0.5, z + 5.0);
    }
  }
  // Her ground tackle: the breakwater, two anchors in their hawses, capstans.
  const fz = 104;
  const bwx = HB(fz) * 0.85;
  const bwLo = MD(bwx, fz) - 0.10;               // down to the deck at its ends
  bx(g, bwx * 2, D(fz) + 1.5 - bwLo, 0.5, P.hullUpper, 0,
    (D(fz) + 1.5 + bwLo) / 2, fz);
  for (const s of [-1, 1]) {
    const az = 118;
    bx(g, 0.5, 2.4, 3.0, P.gunDark, s * (HB(az) - 0.5), D(az) - 2.2, az);
    const cx = s * (HB(112) - 3.0);
    cy(g, 1.3, 1.3, 1.1, P.gunDark, cx, MD(cx, 112) + 0.55, 112, 14);
    // The chain, running aft from the hawse to the deck pipe.
    const hx = s * (HB(114) - 2.4);
    bx(g, 0.4, 0.16, 9.0, P.gunDark, hx, MD(hx, 114) + 0.08, 114);
  }
  // A jackstaff forward and an ensign staff right aft.
  cy(g, 0.10, 0.14, 7.0, P.rail, 0, D(130) + 3.5, 130, 8);
  cy(g, 0.10, 0.14, 7.0, P.rail, 0, D(-130) + 3.5, -130, 8);
  // Depth-charge-sized deck clutter aft: bollards, fairleads, capstans.
  for (const z of [-118, -104, 96, 112]) {
    for (const s of [-1, 1]) {
      const bxx = s * (HB(z) - 1.4);
      cy(g, 0.22, 0.26, 0.9, P.gunDark, bxx, MD(bxx, z) + 0.45, z, 8);
    }
  }
}

/** Three courses of wire down every open deck edge. */
function railings(g) {
  const pts = [];
  const run = (z0, z1, L, hw) => {
    const N = Math.max(2, Math.round(Math.abs(z1 - z0) / 5));
    for (const s of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const za = z0 + ((z1 - z0) * i) / N;
        const zb = z0 + ((z1 - z0) * (i + 1)) / N;
        const xa = s * hw(za);
        const xb = s * hw(zb);
        const ya = deckOf(L, xa, za);
        const yb = deckOf(L, xb, zb);
        for (const h of [0.45, 0.9, 1.3]) pts.push(xa, ya + h, za, xb, yb + h, zb);
        pts.push(xa, ya, za, xa, ya + 1.3, za);
      }
    }
  };
  run(-132, 100, LEVEL[0], (z) => HB(z) - 0.5);
  run(-56, 48, LEVEL[1], () => 12.6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color: P.rail, transparent: true, opacity: 0.5 })));
}

// ------------------------------------------------------------------ assembly --

/**
 * The whole ship: her hull, her deck, and what is inside her.
 *
 * Her hull and her deck are lofted through her own lines; everything standing
 * on them is laid out on the same drawing, at the size of the ship that was
 * built, and scaled bodily with her.
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

  // Everything above her deck is drawn at the size of the ship that was built
  // and scaled bodily with the hull, so every figure in those builders is her
  // own: a sixteen-inch gunhouse is ten metres long because that is what one
  // was, not because it is her size times a factor.
  const up = new THREE.Group();
  up.scale.setScalar(SCALE);
  root.add(up);

  deckhouses(up);
  const directors = [bridgeTower(up), afterTower(up)];
  funnels(up);
  secondaryDirectors(up);
  fittings(up);
  railings(up);
  const turrets = mainBattery(up);
  const secMounts = secondaries(up);
  const aaMounts = lightBattery(up);
  const cats = aviation(up);

  // Everything that trains comes out of the scaled group and on to the ship
  // herself. The scene walks her top level to find what belongs to which
  // compartment and what has to be laid on a bearing, and `attach` moves a
  // piece without moving it: the scale ends up in the piece's own matrix.
  for (const o of [...turrets, ...secMounts, ...aaMounts, ...directors,
    ...cats.map((c) => c.group)]) {
    root.attach(o);
  }
  for (const o of [...turrets, ...secMounts, ...aaMounts, ...directors]) mergeStatic(o);

  // Her catapults. The scene only tells her when the order was given; what a
  // launch looks like is in catapult.js, and a cruiser does the same thing.
  fitCatapults(root, {
    cats, deckY: MD(CAT_X, CAT_Z) * SCALE, catX: CAT_X * SCALE,
    catZ: CAT_Z * SCALE,
    run: SHIP_CLASSES.iowa.planes.deckRun, aero: 'kingfisher', scale: SCALE,
  });

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
  // Steel where she is plated and planking where she is decked: the maps go
  // on after the weld, when she is a handful of meshes rather than a few
  // hundred, and the weld is what gave her the coordinates to put them on.
  dressShip(root);

  // Assigned into, not over: buildInterior has already hung the lines she was
  // lofted through on her, and the interior audit reads them back off her.
  Object.assign(root.userData,
    { classId: 'iowa', length: LOA, beam: BEAM, deckY: DECK });
  return {
    group: root, turrets, forward, length: LOA, beam: BEAM, deckY: DECK,
    secMounts, aaMounts, directors,
  };
}

/**
 * Every piece of her upperworks and where it stands, for the tests.
 *
 * Built one builder at a time and unwelded, the same way the Hipper's is, so
 * a check can say which part of her a lone piece came out of. Everything is
 * reported in her own metres -- the size the ship was built -- because that
 * is the size every figure in this file is written at.
 *
 * `moving` marks a piece under a group the welder is told to leave alone: a
 * gunhouse, a director, a catapult and its aeroplane.
 */
export function iowaParts() {
  const parts = [];
  const builders = [
    ['deckhouses', deckhouses], ['bridge', bridgeTower], ['funnels', funnels],
    ['afterTower', afterTower], ['directors', secondaryDirectors],
    ['fittings', fittings],
    ['mainBattery', mainBattery], ['secondaries', secondaries],
    ['lightBattery', lightBattery], ['aviation', aviation],
  ];
  for (const [name, build] of builders) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      let moving = false;
      for (let n = o; n; n = n.parent) {
        if (n.userData && n.userData.dynamic) { moving = true; break; }
      }
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

/** Her decks, for the tests: where each one is and how far out it reaches. */
export function iowaDecks() {
  return LEVEL.map((L) => ({
    lift: L.y, aft: L.a, fwd: L.f, half: (z) => L.hw(z), deck: (x, z) => deckOf(L, x, z),
  }));
}
