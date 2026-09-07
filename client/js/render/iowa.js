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
import { kingfisher } from './planekit.js';
import { arm } from './mounts.js';
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
export const SCALE = 1.55;

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
    // The outboard screw, in a group of its own so it can turn. It used to be
    // a hub and four loose blades welded into the hull, which is a ship whose
    // screws stand still at thirty-three knots.
    const scrO = new THREE.Group();
    scrO.position.set(s * 9.4, -9.8, -96.5);
    scrO.userData.dynamic = true;
    scrO.userData.screw = { hand: s };
    g.add(scrO);
    scrO.add(cyl(0.5, 0.7, 1.5, P.brass, 10).rotateX(Math.PI / 2));
    for (let b = 0; b < 4; b++) {
      const holder = new THREE.Group();
      holder.position.z = -0.9;
      holder.rotation.z = (b * Math.PI) / 2 + 0.3;
      holder.add(box(0.26, 2.9, 1.5, P.brass, 0, 1.35, 0));
      scrO.add(holder);
    }
    // The inboard shaft comes out of a skeg, so it needs no bracket.
    const skeg = box(1.9, 4.4, 30, P.antifoul, s * 4.4, -10.4, -76);
    g.add(skeg);
    const shIn = tube(0.44, 12, P.gunDark, 10);
    shIn.position.set(s * 4.4, -10.7, -86);
    shIn.rotation.x = Math.PI / 2 - 0.03;
    g.add(shIn);
    // And the inboard one, turning the other way: on a four-shaft ship the
    // inboard pair are handed opposite to the wing pair.
    const scrI = new THREE.Group();
    scrI.position.set(s * 4.4, -10.9, -91.6);
    scrI.userData.dynamic = true;
    scrI.userData.screw = { hand: -s };
    g.add(scrI);
    scrI.add(cyl(0.5, 0.7, 1.5, P.brass, 10).rotateX(Math.PI / 2));
    for (let b = 0; b < 4; b++) {
      const holder = new THREE.Group();
      holder.position.z = -0.8;
      holder.rotation.z = (b * Math.PI) / 2 + 0.3;
      holder.add(box(0.26, 2.7, 1.4, P.brass, 0, 1.25, 0));
      scrI.add(holder);
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

// The raised deck forward, which is what turret two stands on.
//
// She does not superfire off a drum standing up out of the forecastle: the
// deck itself steps up abaft turret one, turret two is set into that, and
// what shows above the planking round it is the ring it trains on and
// nothing else. Her barbette is inside the ship, where the armour is.
const RAISED = { aft: 42, fwd: 65.5, half: 11.4, lift: 4.55 };

/**
 * How far out the raised deck reaches at a station.
 *
 * Drawn in at both ends -- round the barbette forward, and squared off aft
 * where the superstructure will stand -- and never nearer her side than the
 * walkway that has to run past it.
 */
function raisedHalf(z) {
  const nose = smooth((RAISED.fwd - z) / 6.0);
  const tail = smooth((z - RAISED.aft) / 2.5);
  return Math.min(RAISED.half * (0.63 + 0.37 * Math.min(nose, tail)), HB(z) - 1.9);
}

// The two decks she has: the weather deck, and that.
const LEVEL = [
  // The weather deck is the one with camber, and it is a third of a metre of
  // it: a fitting laid on the crown height stands that far off the planking
  // at the deck edge, which is exactly the daylight you see.
  { y: 0.00, a: -HALF, f: HALF, hw: (z) => HB(z) - 0.4, cam: 0.30 },
  { top: 0, a: RAISED.aft, f: RAISED.fwd, hw: raisedHalf },
];
LEVEL[1].top = D(58) + RAISED.lift;            // flat, as a deckhouse roof is

/** The deck of a level at a station, out at x: the crown, less her camber. */
function deckOf(L, x, z) {
  if (L.top) return L.top;
  const u = L.cam ? Math.min(1, Math.abs(x) / Math.max(HB(z), 0.1)) : 0;
  return D(z) + L.y - (L.cam || 0) * u * u;
}

/** Her weather deck itself, out at x -- what a fitting on it stands on. */
const MD = (x, z) => deckOf(LEVEL[0], x, z);

/**
 * A closed box lofted along her length, from a table of stations.
 *
 * Every row is [station, half-breadth, sole, roof]. Each of the four faces
 * and both ends get vertices of their own rather than sharing the corners,
 * because averaged corner normals turn a gunhouse into a bar of soap. `lean`
 * is how far the side plating comes in at the top.
 */
function loftBox(g, rows, color, lean = 0) {
  const corner = (r, j) => {
    const t = Math.max(0.15, r[1] - lean);
    return [[-r[1], r[2]], [-t, r[3]], [t, r[3]], [r[1], r[2]]][j];
  };
  const pos = [];
  const idx = [];
  const push = (r, j) => { const c = corner(r, j); pos.push(c[0], c[1], r[0]); };
  for (let j = 0; j < 4; j++) {
    const n = (j + 1) % 4;
    let a = null;
    for (const r of rows) {
      const i = pos.length / 3;
      push(r, j);
      push(r, n);
      if (a !== null) idx.push(a, i, a + 1, a + 1, i, i + 1);
      a = i;
    }
  }
  for (const [r, fwd] of [[rows[0], false], [rows[rows.length - 1], true]]) {
    const i = pos.length / 3;
    for (let j = 0; j < 4; j++) push(r, j);
    if (fwd) idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    else idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat(color)));
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

// ------------------------------------------------------------ the battery --
//
// The 16"/50 calibre Mark 7 and the three-gun turret it sits in: the heaviest
// gun the United States ever put to sea, and the whole reason the ship is the
// shape she is. Everything here is the mounting's own dimensions.
//
//   bore                     16 in                    0.406 m
//   barrel, overall          816 in                  20.73 m
//   gun axes apart           122 in                   3.10 m
//   barbette, inside         37 ft 3 in              11.35 m
//   elevation               -5 to +45 degrees
//   armour        face 17 in, sides 9.5 in, rear 12 in, roof 7.25 in
//
// The face is one inclined plate and the reason the front of the gunhouse
// falls away so fast; the sides lean in a little; the roof overhangs the rear
// plate. Turrets two and three carry a forty-six-foot rangefinder, whose
// housings are the ears through the after corners of the sides. Turret one
// has none.

const RIFLE = {
  SPACE: 3.10,      // gun axes, 122 inches apart
  AXIS: 2.55,       // the trunnions, above the turret floor
  TRUNNION: 3.20,   // and how far forward of the barbette axis they are
  PORT: 5.10,       // where that axis crosses the sloped face
  MUZZLE: 17.80,    // and where the gun ends, from the axis of the barbette
};

// The gunhouse in section, from the rear plate forward and over the face:
// station, half-breadth, and the height of the roof there.
const HOUSE = [
  [-6.40, 5.55, 4.30],
  [-6.15, 6.02, 4.55],
  [-5.30, 6.18, 4.60],
  [-1.00, 6.20, 4.60],
  [1.80, 6.20, 4.60],
  [3.20, 6.18, 4.58],
  [3.90, 6.10, 4.28],
  [4.60, 6.00, 3.44],
  [5.10, 5.92, 2.62],
  [5.70, 5.74, 1.68],
  [6.10, 5.45, 0.80],
  [6.30, 5.02, 0.14],
];

/** The barbette: thirty-seven feet three inches inside, and the ring on it. */
const BARB_R = 5.95;

/**
 * One rifle, from the slide it runs out on to the muzzle.
 *
 * Sixty-eight feet of gun, of which rather more than half is inside the
 * gunhouse. What shows is the chase, tapering the whole way: a foot of steel
 * round the bore where it comes through the face and four inches of it at the
 * muzzle. No brake, no bell -- a Mark 7 muzzle is a plain cut.
 */
function rifle(g, dx) {
  // Built in the cradle's frame: the trunnion is the origin, because that is
  // what the gun turns about when it is laid. Everything below is the station
  // it stands at on the ship, less the trunnion's own.
  const y = 0;
  const T = RIFLE.TRUNNION;
  // The slide, which is what there is to see through the port behind the bag.
  bx(g, 1.86, 1.72, 4.6, P.gunDark, dx, y - 0.06, 2.3 - T);
  // The bloomer: the canvas boot round the gun where it comes through the
  // face, and the reason a battleship's gun ports do not show daylight.
  const boot = cy(g, 0.74, 1.14, 2.1, P.canvas, dx, y, RIFLE.PORT + 0.75 - T, 14);
  boot.rotation.x = Math.PI / 2;
  // The chase, in three tapers, laid out from where the gun ends rather than
  // by adding up lengths: the muzzle is the figure that is known, and a
  // barrel built forwards from the breech drifts away from it.
  let z = RIFLE.PORT + 1.5 - T;
  const run = RIFLE.MUZZLE - T - 0.40 - z;
  for (const [fwd, aft, share] of [[0.50, 0.62, 0.35], [0.40, 0.50, 0.38],
    [0.315, 0.40, 0.27]]) {
    const len = run * share;
    const seg = cy(g, fwd, aft, len, P.barrel, dx, y, z + len / 2, 16);
    seg.rotation.x = Math.PI / 2;
    z += len;
  }
  // The muzzle: a short reinforce, and the bore itself, which is dark.
  cy(g, 0.335, 0.335, 0.40, P.barrel, dx, y, RIFLE.MUZZLE - T - 0.20, 16)
    .rotation.x = Math.PI / 2;
  cy(g, 0.203, 0.203, 0.5, P.boot, dx, y, RIFLE.MUZZLE - T - 0.16, 12)
    .rotation.x = Math.PI / 2;
}

/**
 * One 16"/50 Mark 7 triple.
 *
 * Nearly thirteen metres across, ten from the face plate to the rear, and
 * seventeen hundred tons of it with the guns in. `range` fits the forty-six
 * foot rangefinder, which turrets two and three had and turret one did not.
 */
function turret16(range = false) {
  const g = new THREE.Group();
  // The armoured box: sides leaning in, the roof over them, the sole, and the
  // one inclined plate that is the face.
  loftBox(g, HOUSE.map(([z, hw, top]) => [z, hw, 0, top]), P.gun, 0.18);
  // The roof plate proper, standing a little proud of the box under it: seven
  // and a quarter inches of it, and the edge is what you see from above.
  bx(g, 12.10, 0.20, 9.90, P.gunDark, 0, 4.68, -1.55);

  // The three guns, in the cradle that elevates them. They lay together --
  // one turret, one elevation -- so it is one group with three rifles in it.
  const guns = new THREE.Group();
  guns.position.set(0, RIFLE.AXIS, RIFLE.TRUNNION);
  g.add(guns);
  for (const dx of [-RIFLE.SPACE, 0, RIFLE.SPACE]) rifle(guns, dx);
  arm(g, guns, [-RIFLE.SPACE, 0, RIFLE.SPACE].map(
    (dx) => [dx, 0, RIFLE.MUZZLE - RIFLE.TRUNNION]));

  // The turret officer's hood aft on the roof, his hatch behind it, and the
  // periscopes for the two men who lay her.
  bx(g, 1.80, 0.60, 1.60, P.gun, 0, 5.06, -3.30);
  bx(g, 1.30, 0.16, 1.30, P.gunDark, 0, 4.86, -5.20);
  for (const s of [-1, 1]) {
    cy(g, 0.22, 0.22, 0.62, P.gunDark, s * 2.30, 5.07, 1.30, 10);
    // Mushroom vents, which every armoured box needs and every model forgets.
    cy(g, 0.46, 0.40, 0.34, P.gunDark, s * 3.70, 4.92, -4.70, 12);
    cy(g, 0.62, 0.62, 0.14, P.gunDark, s * 3.70, 5.14, -4.70, 12);
    // The pointer's and trainer's sighting hoods, out through the shoulders.
    bx(g, 0.85, 0.95, 1.65, P.gun, s * 6.05, 3.55, 2.35);
    bx(g, 0.16, 0.34, 1.10, P.glass, s * 6.48, 3.62, 2.55);
    // And the sight ports in the face itself, beside the wing guns.
    bx(g, 0.44, 0.30, 0.16, P.glass, s * 4.60, 3.35, 4.62);
  }
  // The rangefinder: forty-six feet of base inside her, and the housings out
  // through the after corners of the sides, which are the ears.
  if (range) {
    const t = tube(0.30, 13.10, P.gun, 12);
    t.rotation.z = Math.PI / 2;
    put(g, t, 0, 3.55, -3.80);
    for (const s of [-1, 1]) {
      bx(g, 0.95, 1.15, 2.00, P.gun, s * 6.30, 3.55, -3.80);
      bx(g, 0.16, 0.42, 1.20, P.glass, s * 6.76, 3.60, -3.80);
    }
  }
  // Rungs up the rear plate, which is how the crew get in, and the training
  // gear's hand-hold rail round the after end of the roof.
  ladder(g, 3.60, 0, 4.30, -6.45, -1);
  for (const s of [-1, 1]) {
    bx(g, 0.10, 0.62, 3.40, P.rail, s * 5.30, 5.09, -4.40);
    bx(g, 0.10, 0.10, 3.40, P.rail, s * 5.30, 5.40, -4.40);
  }
  bx(g, 10.60, 0.10, 0.10, P.rail, 0, 5.40, -6.10);
  return g;
}

// ------------------------------------------------------ the aeroplane --


// ------------------------------------------------------ her upperworks --

/**
 * The raised deck forward.
 *
 * All that is left standing on her: the step up in the deck abaft turret one
 * that turret two is set into. It is hull, not superstructure -- plated down
 * to the weather deck the whole way round, drawn in forward round the
 * barbette, and squared off aft where the rest of her will go.
 */
function forwardDeck(g) {
  const rows = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const z = RAISED.aft + ((RAISED.fwd - RAISED.aft) * i) / N;
    const hw = Math.max(0.8, raisedHalf(z));
    // Carried down past her planking rather than sat on top of it: the deck
    // under it has camber and sheer, and a flat sole leaves daylight.
    rows.push([z, hw, MD(hw, z) - 0.9, LEVEL[1].top]);
  }
  loftBox(g, rows, P.hullUpper);
  // The coaming round the edge of it, and the deck itself: a steel waterway
  // at the edge and planking inboard, the same as her weather deck.
  loftBox(g, rows.map(([z, hw, , top]) => [z, hw + 0.26, top, top + 0.20]), P.deck);
  loftBox(g, rows.map(([z, hw, , top]) =>
    [z, Math.max(0.4, hw - 0.95), top + 0.16, top + 0.24]), P.wood);
  // Scuttles down each side of it, and a ladder up from the weather deck.
  for (let z = RAISED.aft + 4; z < RAISED.fwd - 5; z += 5.5) {
    for (const s of [-1, 1]) {
      cy(g, 0.24, 0.24, 0.12, P.gunDark, s * raisedHalf(z), LEVEL[1].top - 1.9,
        z, 10).rotation.z = Math.PI / 2;
    }
  }
  for (const s of [-1, 1]) {
    const x = s * (raisedHalf(RAISED.aft + 2.2) - 1.0);
    ladder(g, x, MD(x, RAISED.aft + 2.2), LEVEL[1].top, RAISED.aft + 2.4);
  }
}

// ---------------------------------------------------------- her armament --

/**
 * Her nine 16-inch guns: A and B forward, B superfiring, Y right aft.
 *
 * Where they stand is her datasheet's, not this file's -- the simulation
 * fires from those stations and the model has to agree with it or her
 * broadsides come out of points in the air beside her.
 *
 * None of the three stands on a drum. An Iowa's barbette is inside the ship,
 * under the deck, where the armour is; what shows above the planking is the
 * ring the turret trains on and a foot of coaming round it. Turret two is not
 * lifted on a tower either -- the deck under it steps up, and the turret is
 * set into that deck, which is what the photograph shows.
 */
function mainBattery(g) {
  const out = [];
  for (const t of SHIP_CLASSES.iowa.turrets) {
    const z = t.z / SCALE;
    const raised = t.name === 'B';
    const sole = raised ? LEVEL[1].top : MD(0, z);
    // A foot of ring where the deck itself is doing the lifting; a metre on
    // the weather deck, which is what her forward and after turrets show.
    const lift = raised ? 0.34 : 1.02;
    const h = lift + 1.6;
    cy(g, BARB_R + 0.06, BARB_R + 0.06, h, P.hull, 0, sole + lift - h / 2, z, 32);
    // The roller path the turret runs on, just under the gunhouse.
    cy(g, BARB_R - 0.20, BARB_R - 0.20, 0.30, P.gunDark, 0, sole + lift - 0.15,
      z, 32);
    const house = turret16(t.name !== 'A');
    house.position.set(0, sole + lift, z);
    if (t.angle) house.rotation.y = t.angle;
    house.userData.dynamic = true;
    house.userData.rest = t.angle || 0;
    g.add(house);
    out.push(house);
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
    const plane = kingfisher(car, 0, RIG.PLANE_Y, RIG.PLANE_Z, 0, { spin: true });
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
 * Her ground tackle, her staffs and her deck clutter.
 *
 * Nothing here does anything. It is all there because a bare deck reads as a
 * model of a warship, and one with a breakwater, anchors, capstans and a
 * jackstaff reads as a ship. Her boats and her cowls went with the deckhouse
 * roofs they stood on.
 */
function fittings(g) {
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
  run(RAISED.aft + 1.5, RAISED.fwd - 2.5, LEVEL[1], (z) => raisedHalf(z) - 0.3);
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

  forwardDeck(up);
  fittings(up);
  railings(up);
  const turrets = mainBattery(up);
  const cats = aviation(up);

  // Everything that trains comes out of the scaled group and on to the ship
  // herself. The scene walks her top level to find what belongs to which
  // compartment and what has to be laid on a bearing, and `attach` moves a
  // piece without moving it: the scale ends up in the piece's own matrix.
  for (const o of [...turrets, ...cats.map((c) => c.group)]) root.attach(o);
  for (const o of turrets) mergeStatic(o);

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
  // Her secondary and light batteries went with the superstructure they stood
  // on. The simulation still has them on her datasheet -- she fires them --
  // but there is nothing yet to show for it, and the scene wants the lists.
  return {
    group: root, turrets, forward, length: LOA, beam: BEAM, deckY: DECK,
    secMounts: [], aaMounts: [],
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
    ['forwardDeck', forwardDeck], ['fittings', fittings],
    ['mainBattery', mainBattery], ['aviation', aviation],
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
