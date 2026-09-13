// IJN Yamato -- her hull, and nothing else yet.
//
// Sixty-five thousand tonnes and nine eighteen-inch guns: the largest
// battleship ever built, and the last. She is being built here from the keel
// up, and at this stage she is a bare hull -- plating, armour, weather deck
// and ground tackle. No turrets, no barbettes, no pagoda, no funnel. Those
// come back on top of this once the hull under them is right, because a
// superstructure hides most of a hull and it is very easy to make a bad hull
// look acceptable by covering it in gun mountings.
//
// Everything about her shape follows from one decision -- that she had to be
// shorter than her displacement wanted, so she would fit the docks -- so she
// is enormously broad for her length: 263 metres over all on 38.9 of beam,
// where the Iowa is 270 on 33. That gives her a very full midbody, fine ends,
// and a block coefficient of about 0.61.
//
// Five things have to be right or the hull is not hers.
//
// The first is the sheer. Yamato is flush-decked: one unbroken weather deck
// from the transom to the stem, rising four and a half metres over the forward
// half in a single fair curve. There is no forecastle break anywhere in her.
// That long sweep is what you recognise her by from the beam.
//
// The second is the flare. Her deck edge forward stands better than three
// metres outboard of her waterline beam, and the sections there are hollow --
// which is what kept eleven metres of freeboard dry at twenty-seven knots and
// what gives her that knife-and-shoulder look from ahead.
//
// The third is the bulbous forefoot. One of the first in a capital ship: a
// great rounded blister under the stem, projecting forward of it, worth some
// eight per cent of her resistance. In profile the keel line does not sweep up
// into the stem the way a 1916 battleship's does; it runs forward and ends in
// the bulb.
//
// The fourth is the stern. A long fine run to a rounded cruiser counter that
// overhangs five metres, with four shafts on two pairs of bossings and two
// rudders in line on the centreline -- the after one small, and the reason she
// could be turned at all with the main rudder jammed.
//
// The fifth is the armour, which is not decoration: an inclined 410 mm belt
// closing on a 200 mm armoured deck over a citadel that covers only her
// magazines and machinery, with everything outside it unarmoured. It is built
// here inside the plating, because that is where it was and because a shell
// that gets through her side ought to find it.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up,
// therefore starboard is -X, and y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, ladder } from './shipkit.js';
import { hullForm, plateHull, guardRail } from './hullform.js';

const CLS = SHIP_CLASSES.yamato;

/**
 * How much bigger than the ship that was built.
 *
 * The same figure the Iowa is drawn at, and for the same reason: the two of
 * them have to stand in the same water and read as the same kind of thing, and
 * everything in the game that is a battleship is drawn at this scale. Her
 * lines are untouched -- every offset below is her real one off the drawing --
 * she is simply larger.
 */
export const SCALE = 1.55;
export const LOA = CLS.hull.length;      // 263 m x SCALE
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;
/** Starboard, in this frame. */
const S = -1;

// Kure Naval Arsenal grey over a teak weather deck, with the red lead of her
// bottom below a black boot topping. These are the colours of the ship as
// completed and as she was photographed: a warmer, slightly darker grey than
// the German ships carry, and a deck that is holystoned wood forward and
// amidships with steel plating at both ends.
const P = {
  hull: 0x6a727c,
  hullDark: 0x59606a,
  boot: 0x191c20,
  antifoul: 0x8c3a2c,
  deck: 0x9a8f74,          // teak, holystoned
  deckSteel: 0x5a626b,     // the plated deck at both ends
  deckDark: 0x474e57,
  steel: 0x69717a,
  steelDark: 0x545b63,
  bright: 0x848c95,
  gun: 0x636b74,
  gunDark: 0x3f454c,
  canvas: 0x8a8a7e,
  glass: 0x2a3742,
  cave: 0x14181c,
  brass: 0x8a7340,
  // The armour, which is a different steel and shows as one: Vickers
  // hardened face plate, darker and colder than her paint.
  armour: 0x4a5158,
  armourDark: 0x3a4046,
  // The Imperial chrysanthemum on her stem was gilded bronze.
  chrys: 0xb08b3c,
  // Her cables were black, and they are the one strong line on the forecastle.
  chain: 0x25282c,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) {
    MATS[color] = new THREE.MeshLambertMaterial({ color });
  }
  return MATS[color];
}
/** Her paint, addressed by name. */
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

// Half-breadth at the design waterline, station by station off her body plan,
// with station -1 at the transom and +1 at the stem.
//
// The shape to notice is the waterplane: she carries very nearly her full
// 38.9 m from a fifth of her length abaft amidships to a tenth forward of it,
// and then falls away -- faster forward than aft, because the entrance is fine
// and the run is long. That is a waterplane coefficient of about 0.71 on a
// block of 0.61, which is what a hull designed for maximum beam on minimum
// length looks like, and it is why she was so steady a gun platform.
const HALF_BEAM = [
  [-1.000, 2.90], [-0.960, 4.90], [-0.920, 6.60], [-0.860, 8.70],
  [-0.800, 10.60], [-0.720, 12.80], [-0.630, 14.80], [-0.530, 16.45],
  [-0.420, 17.80], [-0.310, 18.75], [-0.200, 19.25], [-0.100, 19.43],
  [0.000, 19.45], [0.100, 19.41], [0.200, 19.14], [0.300, 18.52],
  [0.400, 17.50], [0.500, 16.10], [0.600, 14.30], [0.700, 12.10],
  [0.800, 9.35], [0.880, 6.45], [0.940, 3.60], [0.980, 1.40],
  [1.000, 0.22],
].map(([t, w]) => [t, w * SCALE]);

// Her keel line, and the forefoot.
//
// Flat keel at 10.5 m over better than half her length. Aft it lifts into the
// counter; forward it holds its depth almost to the stem and then turns up
// into the bulb, which is built on afterwards -- the lofted shell only gets
// her as far as the forefoot.
const KEEL = [
  [-1.000, -2.10], [-0.960, -4.80], [-0.920, -7.20], [-0.880, -8.60],
  [-0.820, -9.60], [-0.740, -10.15], [-0.620, -10.42], [-0.400, -10.50],
  [0.000, -10.50], [0.300, -10.50], [0.500, -10.47], [0.620, -10.38],
  [0.720, -10.20], [0.800, -9.95], [0.860, -9.55], [0.900, -9.05],
  [0.940, -8.20], [0.970, -6.90], [0.990, -5.20], [1.000, -3.60],
].map(([t, y]) => [t, y * SCALE]);

// Her sheer: the line. Seven metres of freeboard at the transom rising to
// eleven and a half at the stem, in one curve with no break and no knuckle
// anywhere in it.
const SHEER = [
  [-1.000, 7.00], [-0.880, 7.06], [-0.720, 7.18], [-0.560, 7.34],
  [-0.400, 7.56], [-0.240, 7.82], [-0.080, 8.12], [0.080, 8.48],
  [0.240, 8.94], [0.380, 9.42], [0.500, 9.90], [0.620, 10.40],
  [0.720, 10.86], [0.800, 11.28], [0.870, 11.66], [0.920, 11.90],
  [0.955, 11.98], [0.980, 11.72], [1.000, 11.18],
].map(([t, y]) => [t, y * SCALE]);

// And the flare: how far her deck edge stands outboard of her waterline beam.
// Almost nothing amidships, where her side is very nearly vertical; better
// than three metres over the forward quarter, which is the bow.
const FLARE = [
  [-1.000, 2.60], [-0.930, 2.10], [-0.850, 1.45], [-0.720, 0.78],
  [-0.550, 0.40], [-0.300, 0.22], [0.000, 0.22], [0.250, 0.42],
  [0.420, 0.95], [0.550, 1.62], [0.660, 2.35], [0.740, 2.88],
  [0.800, 3.15], [0.850, 3.12], [0.900, 2.78], [0.945, 2.02],
  [0.975, 1.18], [1.000, 0.50],
].map(([t, w]) => [t, w * SCALE]);

// Her tumblehome: how far the deck edge is pulled inboard of her waterline
// beam. This is the thing about a Yamato section that a table of half-breadths
// alone will not give you -- her maximum beam is at the water, at the crown of
// the anti-torpedo bulge, and her upper deck is better than two metres
// narrower than it. Amidships her side leans in the whole way from the
// waterline to the deck edge; forward it goes the other way and becomes the
// flare. Without it she is a slab with a deck on top of it, and from anywhere
// forward of the beam that is exactly what she looks like.
const TUMBLE = [
  [-1.000, 0.00], [-0.900, 0.30], [-0.800, 0.62], [-0.650, 0.92],
  [-0.450, 1.12], [-0.200, 1.22], [0.100, 1.22], [0.300, 1.02],
  [0.480, 0.62], [0.620, 0.26], [0.760, 0.00], [1.000, 0.00],
].map(([t, w]) => [t, w * SCALE]);


const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE, tumble: TUMBLE,
  // A stem that rakes four metres forward over her whole freeboard, curved
  // rather than straight -- she has a trace of clipper in her.
  stem: 4.2 * SCALE, stemLo: -4.2 * SCALE, stemUp: 16.0 * SCALE, stemPow: 1.28,
  // And a counter that overhangs five, which is what makes the stern of a
  // Japanese capital ship look as long as it does.
  counter: 6.4 * SCALE, counterLo: -2.6 * SCALE, counterUp: 9.6 * SCALE,
  counterPow: 1.22,
  // A very full bilge: she is nearly rectangular in section amidships, which
  // is where the stability for all that topweight came from.
  bilge: 0.28,
  stations: 144,
});

export const { deckAt, halfDeck } = F;
/** Her lines, for the tests: the shell, the keel, the sheer and the rake. */
export const LINES = F;
const sheer = F.sheer;

const HALF = LOA / 2;
/** A station as a fraction, from a distance along her. */
const T = (z) => Math.max(-1, Math.min(1, z / HALF));

// Where the armoured citadel begins and ends. It covers her magazines and her
// machinery and nothing else: 54 per cent of her length, which is the shortest
// citadel of any battleship of the war and the whole of the Yamato bargain --
// armour that thick over a box that short, and the ends left bare.
const CIT_F = 0.345 * LOA;
const CIT_A = -0.285 * LOA;

// The three stations her barbettes stand on. No turret is built at this stage,
// but the armoured rings are part of the hull and the deck is laid round them.
const A_Z = 78 * SCALE;
const B_Z = 55 * SCALE;
const Y_Z = -68 * SCALE;

// Where the plated deck at each end gives way to teak.
const WOOD_F = 0.930;
const WOOD_A = -0.740;

// ------------------------------------------------------------------ hull --

/**
 * Her shell.
 *
 * Plated by the common lofting machinery -- red lead below the boot topping,
 * black at it, Kure grey above -- and then given the four things that are hers
 * and that no table of offsets will produce: the bulbous forefoot, the knuckle
 * of the anti-torpedo bulge, the bilge keels, and the bossings her shafts come
 * out of.
 */
function hull(g) {
  // Six strakes: four of them under the boot topping, so the turn of her
  // bilge is a curve rather than the flat V a single band gives.
  plateHull(g, F, M, { bootLo: -2.6 * SCALE, bootHi: 1.65 * SCALE, bands: 9 });
  bulb(g);
  bulge(g);
  bilgeKeels(g);
  sideDetail(g);
}

/**
 * The bulbous bow.
 *
 * A rounded blister on the forefoot, its nose about three metres forward of
 * where the stem cuts the water and its crown some four metres below it. It is
 * lofted rather than dropped in as a sphere, so it fairs into the stem instead
 * of sitting on it: rings of decreasing radius run aft from the nose and die
 * into the plating.
 */
function bulb(g) {
  const nose = F.zAt(1, -6.0 * SCALE) + 3.4 * SCALE;
  const root = F.zAt(1, -7.2 * SCALE) - 9.0 * SCALE;
  const axis = -6.9 * SCALE;                 // the height of its own centreline
  const N = 18;                              // rings from the nose aft
  const SEG = 18;                            // and points round each ring
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    // A blunt half-ellipsoid forward, tapering into nothing at the root: the
    // radius comes off a quarter sine so the nose is round and the tail is
    // fine.
    const r = 3.25 * SCALE * Math.sin(Math.acos(Math.max(-1, Math.min(1, 2 * u - 1))));
    const z = nose + (root - nose) * u;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      // Flattened a little in the vertical, as a bulb is, and carried up
      // toward the stem at the after end so it dies into the plating.
      const lift = 1.6 * SCALE * u * u;
      pos.push(Math.sin(a) * r * 0.86, axis + Math.cos(a) * r * 0.74 + lift, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = i * SEG + k;
      const b = i * SEG + ((k + 1) % SEG);
      idx.push(a, b, a + SEG, a + SEG, b, b + SEG);
    }
  }
  // Close the nose and the root, so she holds water at both ends of it.
  const noseC = pos.length / 3;
  pos.push(0, axis, nose);
  for (let k = 0; k < SEG; k++) idx.push(noseC, (k + 1) % SEG, k);
  const rootC = pos.length / 3;
  pos.push(0, axis + 1.6 * SCALE, root);
  for (let k = 0; k < SEG; k++) {
    idx.push(rootC, N * SEG + k, N * SEG + ((k + 1) % SEG));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.antifoul));
}

/**
 * The anti-torpedo bulge.
 *
 * On a Yamato it is not bolted on the way a refitted 1916 ship's is -- it is
 * built into the shell, and what you see of it from outside is a long shallow
 * knuckle running the length of the citadel at the turn of the bilge, where
 * the bulge plating meets the side plating. It shows in a photograph as one
 * hard line of shadow under the belt and nowhere else.
 */
function bulge(g) {
  const y = -5.4 * SCALE;
  const N = 40;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t0 = -0.70 + (1.44 * i) / N;
      const t1 = -0.70 + (1.44 * (i + 1)) / N;
      const w0 = F.shellAt(t0, y);
      const w1 = F.shellAt(t1, y);
      const z0 = F.zAt(t0, y);
      const z1 = F.zAt(t1, y);
      const seg = box(g, M.antifoul, 0.34 * SCALE, 1.30 * SCALE,
        Math.abs(z1 - z0) + 0.06 * SCALE,
        sgn * ((w0 + w1) / 2 - 0.12 * SCALE), y, (z0 + z1) / 2);
      // Canted with the plating, so the knuckle is a knuckle and not a rail.
      seg.rotation.z = sgn * 0.34;
    }
  }
}

/**
 * Her bilge keels: two long shallow fins at the turn of the bilge, set at the
 * angle the flow leaves her there so they damp her roll without adding
 * resistance. Sixty metres of them a side on a ship this size.
 */
function bilgeKeels(g) {
  const N = 26;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t0 = -0.40 + (0.86 * i) / N;
      const t1 = -0.40 + (0.86 * (i + 1)) / N;
      const y = -7.9 * SCALE;
      const w0 = F.shellAt(t0, y);
      const w1 = F.shellAt(t1, y);
      const z0 = F.zAt(t0, y);
      const z1 = F.zAt(t1, y);
      const fin = box(g, M.antifoul, 1.55 * SCALE, 0.16 * SCALE,
        Math.abs(z1 - z0) + 0.04 * SCALE,
        sgn * ((w0 + w1) / 2 + 0.55 * SCALE), y - 0.5 * SCALE, (z0 + z1) / 2);
      fin.rotation.z = sgn * 0.72;
    }
  }
}

/**
 * What is on her side above water: the scuttles along the forecastle, the
 * hawse recesses her anchors house in, the sea chests, the accommodation
 * ladders stowed against the plating, and the boat booms.
 */
/**
 * A strake run along her side: a knuckle, a seam, a rubbing band.
 *
 * Lofted rather than laid as a run of boxes, for the reason the deck edge is:
 * a straight box on a curving side stands proud of the curve at both its ends,
 * and forty of them give her a side like a file. `yOf` is the height of the
 * line at a station; `out` how far it stands off the plating and `h` how deep
 * it is.
 */
function sideStrake(g, m, t0, t1, yOf, out, h) {
  const N = 64;
  for (const sgn of [-1, 1]) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N;
      const y = yOf(t);
      const w = F.shellAt(t, y) + out;
      const z = F.zAt(t, y);
      pos.push(sgn * w, y + h / 2, z, sgn * w, y - h / 2, z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      if (sgn < 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
      else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }
}

function sideDetail(g) {
  // Scuttles. She has one row forward of the citadel and none along it --
  // there is 410 mm of armour behind that plating and you do not put a
  // sixteen-inch hole in it for the light.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const z = CIT_F + 4.0 * SCALE + i * 4.4 * SCALE;
      const t = T(z);
      if (t > 0.955) break;
      const y = sheer(t) - 2.4 * SCALE;
      const w = F.shellAt(t, y);
      cyl(g, M.cave, 0.30 * SCALE, 0.30 * SCALE, 0.16 * SCALE,
        sgn * (w - 0.02 * SCALE), y, F.zAt(t, y), 10).rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.40 * SCALE, 0.40 * SCALE, 0.10 * SCALE,
        sgn * (w - 0.10 * SCALE), y, F.zAt(t, y), 10).rotation.z = Math.PI / 2;
    }
    // And a shorter row right aft, over the steering gear.
    for (let i = 0; i < 7; i++) {
      const z = CIT_A - 6.0 * SCALE - i * 4.4 * SCALE;
      const t = T(z);
      if (t < -0.93) break;
      const y = sheer(t) - 2.4 * SCALE;
      const w = F.shellAt(t, y);
      cyl(g, M.cave, 0.30 * SCALE, 0.30 * SCALE, 0.16 * SCALE,
        sgn * (w - 0.02 * SCALE), y, F.zAt(t, y), 10).rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.40 * SCALE, 0.40 * SCALE, 0.10 * SCALE,
        sgn * (w - 0.10 * SCALE), y, F.zAt(t, y), 10).rotation.z = Math.PI / 2;
    }
  }

  // The hawse pipes, and the recess in the plating each anchor houses in.
  for (const sgn of [-1, 1]) {
    const t = 0.915;
    const y = sheer(t) - 3.2 * SCALE;
    const w = F.shellAt(t, y);
    const z = F.zAt(t, y);
    // The recess: a shallow plated pocket the fluke sits in.
    box(g, M.hullDark, 0.30 * SCALE, 3.6 * SCALE, 4.2 * SCALE,
      sgn * (w - 0.14 * SCALE), y, z);
    // The anchor itself, housed flush -- a stockless bower, which from
    // outboard is a flat shank between two flukes and nothing more.
    const a = new THREE.Group();
    a.position.set(sgn * (w - 0.02 * SCALE), y, z);
    box(a, M.gunDark, 0.22 * SCALE, 0.55 * SCALE, 3.4 * SCALE, 0, 0, 0);
    for (const dy of [-1, 1]) {
      const fl = box(a, M.gunDark, 0.26 * SCALE, 1.35 * SCALE, 1.30 * SCALE,
        0, dy * 0.95 * SCALE, 1.15 * SCALE);
      fl.rotation.x = dy * 0.22;
    }
    cyl(a, M.gunDark, 0.30 * SCALE, 0.30 * SCALE, 0.50 * SCALE, 0, 0, -1.7 * SCALE, 8)
      .rotation.z = Math.PI / 2;
    g.add(a);
    // The pipe itself, running up through the deck.
    const dz = F.zAt(0.905, sheer(0.905));
    cyl(g, M.steelDark, 0.62 * SCALE, 0.62 * SCALE, 4.4 * SCALE,
      sgn * 6.4 * SCALE, sheer(0.905) - 1.6 * SCALE, dz, 12).rotation.x = 0.62;
  }

  // Two accommodation ladders a side, stowed fore and aft against the plating
  // at the break of the citadel, where the gangway came alongside.
  for (const sgn of [-1, 1]) {
    for (const z0 of [0.16 * LOA, -0.10 * LOA]) {
      const t = T(z0);
      const y = sheer(t);
      const w = F.shellAt(t, y - 1.0 * SCALE);
      ladder(g, M.steelDark, sgn * (w + 0.35 * SCALE),
        y - 4.6 * SCALE, y - 0.7 * SCALE, z0 - 5.2 * SCALE, z0 + 1.4 * SCALE);
      box(g, M.steelDark, 0.30 * SCALE, 0.22 * SCALE, 2.2 * SCALE,
        sgn * (w + 0.3 * SCALE), y - 0.5 * SCALE, z0 + 2.2 * SCALE);
    }
  }

  // The boat booms, swung in against her side and lashed.
  for (const sgn of [-1, 1]) {
    for (const z0 of [0.05 * LOA, -0.18 * LOA]) {
      const t = T(z0);
      const y = sheer(t) - 1.5 * SCALE;
      const w = F.shellAt(t, y);
      tubeZ(g, M.steelDark, 0.20 * SCALE, 13 * SCALE,
        sgn * (w + 0.45 * SCALE), y, z0, 8);
      cyl(g, M.steelDark, 0.26 * SCALE, 0.30 * SCALE, 0.8 * SCALE,
        sgn * (w + 0.2 * SCALE), y, z0 - 6.6 * SCALE, 8).rotation.z = Math.PI / 2;
    }
  }

  // The knuckle in her bow flare.
  //
  // Yamato's forward sections do not open in one smooth curve from the water
  // to the deck edge: there is a hard chine in them, a line running from about
  // amidships up to the stem, and above it the flare opens fast. It is what
  // throws her bow wave clear instead of letting it climb the side, and in any
  // photograph taken from ahead it is the strongest line on her.
  sideStrake(g, M.hullDark, 0.46, 0.995,
    (t) => sheer(t) - 3.1 * SCALE + 1.4 * SCALE * Math.max(0, t - 0.46) / 0.535,
    0.30 * SCALE, 0.30 * SCALE);

  // The top edge of the belt, which shows on her side as one faint step the
  // whole length of the citadel: the armour is inboard of the plating, but the
  // shell is landed on to it there and the seam is visible in any photograph
  // taken from a boat.
  for (const sgn of [-1, 1]) {
    const N = 46;
    for (let i = 0; i < N; i++) {
      const t0 = T(CIT_A) + ((T(CIT_F) - T(CIT_A)) * i) / N;
      const t1 = T(CIT_A) + ((T(CIT_F) - T(CIT_A)) * (i + 1)) / N;
      const y = 4.9 * SCALE;
      const w0 = F.shellAt(t0, y);
      const w1 = F.shellAt(t1, y);
      const z0 = F.zAt(t0, y);
      const z1 = F.zAt(t1, y);
      box(g, M.hullDark, 0.12 * SCALE, 0.22 * SCALE,
        Math.abs(z1 - z0) + 0.04 * SCALE,
        sgn * ((w0 + w1) / 2 + 0.02 * SCALE), y, (z0 + z1) / 2);
    }
  }

  // Scuppers: the drains cut through the waterway that take the sea off her
  // deck, one every few frames the whole length of her.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const t = -0.93 + (1.85 * i) / 29;
      const y = sheer(t);
      const w = F.shellAt(t, y);
      box(g, M.cave, 0.10 * SCALE, 0.26 * SCALE, 0.55 * SCALE,
        sgn * (w + 0.01 * SCALE), y - 0.34 * SCALE, F.zAt(t, y));
    }
  }

  // Sea chests: the gratings her condensers draw through, low down on the
  // side under the citadel.
  for (const sgn of [-1, 1]) {
    for (const z0 of [0.10 * LOA, -0.02 * LOA, -0.14 * LOA]) {
      const t = T(z0);
      const y = -4.6 * SCALE;
      const w = F.shellAt(t, y);
      box(g, M.antifoul, 0.16 * SCALE, 1.5 * SCALE, 3.2 * SCALE,
        sgn * (w - 0.06 * SCALE), y, F.zAt(t, y));
      for (let i = 0; i < 5; i++) {
        box(g, M.armourDark, 0.20 * SCALE, 0.10 * SCALE, 3.0 * SCALE,
          sgn * (w - 0.02 * SCALE), y - 0.6 * SCALE + i * 0.3 * SCALE, F.zAt(t, y));
      }
    }
  }
}

// ---------------------------------------------------------------- armour --

/**
 * The citadel.
 *
 * Everything that matters about Yamato's protection is that the box is short:
 * 410 mm of belt inclined twenty degrees, 200 mm of armoured deck over it,
 * 300 mm bulkheads closing it at both ends, and beyond those bulkheads nothing
 * at all -- bare plating over her bow and her steering gear. It was a
 * deliberate trade and it is how she was actually hurt, both times.
 *
 * It is built inside the plating and marked as her insides, so the weld keeps
 * it when her side is shot away: a shell that opens her up ought to find
 * armour behind the hole rather than daylight.
 */
/**
 * A plate standing inside her plating, lofted so it follows it.
 *
 * Armour is fitted to the shell: it is landed on the frames a fixed distance
 * inboard of the side and it follows the side wherever the side goes. A slab
 * will not do -- a flat plate hung down a hull that is narrowing under it puts
 * its own bottom corner straight out through her bottom, which is an armour
 * belt you can see from outside the ship and eight metres of it in the water.
 *
 * So every plate here is built the way the shell is: two heights, an inset,
 * and the half-breadth read off the hull at each of them, station by station.
 */
function armourBand(g, m, t0, t1, yLo, yHi, inLo, inHi) {
  const N = 40;
  for (const sgn of [-1, 1]) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N;
      const lo = Math.max(yLo, F.keelY(t) + 0.8 * SCALE);
      const hi = Math.max(lo + 0.2, yHi);
      const wl = Math.max(0.4, F.shellAt(t, lo) - inLo);
      const wh = Math.max(0.4, F.shellAt(t, hi) - inHi);
      const zl = F.zAt(t, lo);
      const zh = F.zAt(t, hi);
      // Outer face and inner face, so the plate has a thickness you can see
      // where a shell has opened her up.
      pos.push(sgn * wl, lo, zl, sgn * wh, hi, zh,
        sgn * (wl - 0.45 * SCALE), lo, zl, sgn * (wh - 0.45 * SCALE), hi, zh);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      if (sgn < 0) {
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      } else {
        idx.push(a, a + 1, b, a + 1, b + 1, b);
        idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m);
    mesh.userData.inside = true;
    g.add(mesh);
  }
}

/** A transverse bulkhead, cut to her own section at that station. */
function bulkhead(g, m, t, yLo, yHi, inset) {
  const N = 14;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const y = yLo + ((yHi - yLo) * i) / N;
    const w = Math.max(0.2, F.shellAt(t, Math.max(y, F.keelY(t) + 0.5)) - inset);
    const z = F.zAt(t, y);
    pos.push(-w, y, z, w, y, z, -w, y, z + 0.34 * SCALE, w, y, z + 0.34 * SCALE);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
    idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  mesh.userData.inside = true;
  g.add(mesh);
}

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const BELT_LO = -3.4 * SCALE;
  const BELT_HI = 4.9 * SCALE;
  const DECK_Y = 5.1 * SCALE;
  const N = 34;
  const tA = T(CIT_A);
  const tF = T(CIT_F);

  // The main belt: inclined twenty degrees with its head outboard, which is
  // what an inclined belt is and why it is worth so much more than its
  // thickness against a flat trajectory. The lean is got by insetting the
  // bottom edge further than the top rather than by tilting a slab, so the
  // plate stays inside her however her sections change under it.
  armourBand(g, M.armour, tA, tF, BELT_LO, BELT_HI, 3.55 * SCALE, 0.55 * SCALE);

  // The torpedo bulkhead under it, leaning the other way and carried down to
  // the double bottom: the lower edge of the belt is the top of it, so a
  // diving shell that gets under the belt still has this to go through.
  armourBand(g, M.armourDark, tA, tF, -8.5 * SCALE, BELT_LO,
    2.40 * SCALE, 3.55 * SCALE);

  // The armoured deck, one flat over the whole citadel, cut to her beam there.
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const z = CIT_A + ((CIT_F - CIT_A) * i) / N;
    const w = Math.max(0.5, F.shellAt(T(z), DECK_Y) - 1.5 * SCALE);
    pos.push(-w, DECK_Y, z, w, DECK_Y, z);
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
  const armDeck = new THREE.Mesh(geo, M.armour);
  armDeck.userData.inside = true;
  g.add(armDeck);

  // And the two transverse bulkheads that close the box, each cut to her own
  // section where it stands.
  bulkhead(g, M.armour, tF, -8.6 * SCALE, BELT_HI + 0.6 * SCALE, 0.9 * SCALE);
  bulkhead(g, M.armour, tA, -8.6 * SCALE, BELT_HI + 0.6 * SCALE, 0.9 * SCALE);

  // The armoured barbette rings. No turret stands on them yet, but the rings
  // themselves are hull: 560 mm of face plate carried from the armoured deck
  // up through the weather deck, and the reason the deck is laid round them
  // rather than over them.
  for (const [z, r] of [[A_Z, 7.0], [B_Z, 7.0], [Y_Z, 7.0]]) {
    const top = sheer(T(z));
    inside(cyl(g, M.armour, r * SCALE, r * SCALE, top - DECK_Y,
      0, (top + DECK_Y) / 2, z, 30));
    // The ring flush with the deck, which is what you actually see of it, and
    // the roller path inside it. With no turret shipped yet the well is closed
    // with a plated cover -- a barbette left open is a hole straight down into
    // her magazine, which is the one thing it never is.
    cyl(g, M.armourDark, (r + 0.55) * SCALE, (r + 0.55) * SCALE, 0.26 * SCALE,
      0, top + 0.02 * SCALE, z, 32);
    cyl(g, M.steelDark, (r - 0.30) * SCALE, (r - 0.30) * SCALE, 0.20 * SCALE,
      0, top + 0.06 * SCALE, z, 32);
    cyl(g, M.steel, (r - 0.75) * SCALE, (r - 0.75) * SCALE, 0.22 * SCALE,
      0, top + 0.10 * SCALE, z, 32);
    // The rollers she would train on, round the path.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      cyl(g, M.gunDark, 0.26 * SCALE, 0.26 * SCALE, 0.34 * SCALE,
        Math.sin(a) * (r - 0.52) * SCALE, top + 0.20 * SCALE,
        z + Math.cos(a) * (r - 0.52) * SCALE, 8).rotation.z = Math.PI / 2;
    }
  }
}

// ----------------------------------------------------------------- decks --

/**
 * One band of weather deck between two stations.
 *
 * Every band is generated from the same offsets at the same stations, so two
 * that meet share their edge vertex for vertex: the teak and the plating butt
 * against each other without a seam you can see daylight through.
 */
function deckBand(g, m, t0, t1, inset = 0, rise = 0) {
  const N = Math.max(8, Math.round((t1 - t0) * 140));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const y = sheer(t);
    const w = Math.max(0.05, F.shellAt(t, y) - inset);
    pos.push(-w, y + rise, F.zAt(t, y), w, y + rise, F.zAt(t, y));
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
  g.add(new THREE.Mesh(geo, m));
}

/**
 * A strip of deck between two distances in from the deck edge, lofted the
 * whole length so it follows the sheer and the flare without a step in it.
 *
 * The waterway and the covering board are drawn with this rather than with a
 * run of boxes. A box laid along a curving deck edge cannot follow it: each
 * one is straight, so every one of them stands a little proud of the curve at
 * its ends, and two hundred of them round a battleship give her a deck edge
 * like a bandsaw blade. This gives her the edge she actually has.
 */
function deckStrip(g, m, t0, t1, in0, in1, rise = 0) {
  const N = Math.max(10, Math.round((t1 - t0) * 160));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const y = sheer(t);
    const z = F.zAt(t, y);
    const w = F.shellAt(t, y);
    const a = Math.max(0.04, w - in0);
    const b = Math.max(0.02, w - in1);
    pos.push(-a, y + rise, z, -b, y + rise, z, b, y + rise, z, a, y + rise, z);
  }
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    const q = (i + 1) * 4;
    // Port strip, then starboard, each wound so it faces the sky.
    idx.push(p, q + 1, p + 1, p, q, q + 1);
    idx.push(p + 3, p + 2, q + 2, p + 3, q + 2, q + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/**
 * Her weather deck: flush from the transom to the stem, plated at both ends
 * and laid in teak between them, with the steel waterway at the edge and the
 * covering board inboard of it.
 *
 * The wood is not decoration. A Japanese capital ship's upper deck is planked
 * over her armour everywhere a man has to work or a gun has to be fought from,
 * and bare plate at the ends where the ground tackle and the aircraft handling
 * gear are -- so the line between them runs where the work changes, not where
 * a draughtsman found it convenient.
 */
const WATERWAY = 1.55 * SCALE;     // the plated margin at the deck edge
const COVER = 0.42 * SCALE;        // and the caulked board inboard of it

function decks(g) {
  // The deck itself, laid inside the waterway: plated at both ends, teak
  // between them, and every band generated from the same offsets at the same
  // stations so two that meet share their edge vertex for vertex.
  const IN = WATERWAY + COVER;
  deckBand(g, M.deckSteel, -1.000, WOOD_A, IN);
  deckBand(g, M.deck, WOOD_A, WOOD_F, IN);
  deckBand(g, M.deckSteel, WOOD_F, 1.000, IN);

  // The steel waterway round the whole deck edge -- the plated margin a man
  // walks on and a wire is shackled to -- and the dark caulked covering board
  // the planking is finished against inboard of it, which is what draws the
  // line of her deck from the air.
  deckStrip(g, M.deckSteel, -1.000, 1.000, 0, WATERWAY, 0.012 * SCALE);
  deckStrip(g, M.deckDark, -1.000, 1.000, WATERWAY, IN, 0.016 * SCALE);

  // The king plank down her centreline, the length of the teak: the one plank
  // the others are laid off, and the line a deck is judged by.
  kingPlank(g, WOOD_A, WOOD_F);

  // The angled fore-deck.
  //
  // Her sheer does not run up to the stem head and stop there: it tops out a
  // few metres abaft it and the plating forward of that is laid as one flat
  // panel canted down and forward to the stem. You can see it in any bow
  // photograph of her -- the deck falls away ahead of the break, and the
  // bullring sits at the bottom of the fall. The deck itself comes out of the
  // sheer table; what is drawn here is the seam across the break and the
  // heavier plating forward of it, which is what makes it read as a panel
  // rather than as a dip.
  deckBand(g, M.deckDark, 0.9520, 0.9565, WATERWAY + COVER, 0.03 * SCALE);
  deckBand(g, M.steelDark, 0.9565, 1.000, WATERWAY + COVER, 0.035 * SCALE);
  // The two strengthening strakes laid down the panel, which is the only thing
  // on it: the plating there takes the whole weight of the sea coming aboard.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const t = 0.958 + (0.038 * i) / 10;
      const t2 = 0.958 + (0.038 * (i + 1)) / 10;
      const y = sheer(t) + 0.05 * SCALE;
      const w = F.shellAt(t, sheer(t)) - 2.6 * SCALE;
      if (w < 0.6 * SCALE) continue;
      const z = F.zAt(t, sheer(t));
      const z2 = F.zAt(t2, sheer(t2));
      box(g, M.deckDark, 0.26 * SCALE, 0.07 * SCALE, Math.abs(z2 - z) + 0.05 * SCALE,
        sgn * w * 0.55, y, (z + z2) / 2);
    }
  }
}

/** The centreline plank, lofted so it rides the sheer instead of stepping. */
function kingPlank(g, t0, t1) {
  const N = 160;
  const pos = [];
  const idx = [];
  const hw = 0.34 * SCALE;
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const y = sheer(t) + 0.022 * SCALE;
    const z = F.zAt(t, sheer(t));
    pos.push(-hw, y, z, hw, y, z);
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
  g.add(new THREE.Mesh(geo, M.deckDark));
}

/** The guardrail round her, and the plated bulwark over the forecastle. */
function rails(g) {
  guardRail(g, F, M, {
    from: -0.955 * HALF * 2 / 2, to: 0.965 * HALF,
    bulwarkFrom: 0.760 * HALF, step: 3.2 * SCALE,
  });
}

// -------------------------------------------------------------- fittings --

/**
 * Everything on her deck that is not a gun.
 *
 * A battleship's forecastle is the busiest flat surface she has: two bower
 * cables running from the hawse pipes to the navel pipes through their
 * stoppers, the capstans that heave them, the breakwater set up to throw the
 * sea off, bollards and fairleads all round the edge, the paravane gear, and
 * the chrysanthemum on the stem. Aft she is emptier -- the after capstans, the
 * warping gear and the ensign staff -- and amidships she carries her hatches,
 * her ventilators and her ready-use lockers.
 */
function fittings(g) {
  const dy = (z) => sheer(T(z));

  // ---- the forecastle ----------------------------------------------------

  // The two bower cables. Each runs from its hawse pipe aft along the deck,
  // through a chain stopper, round the capstan and down the navel pipe to the
  // locker. They are the strongest line on the forecastle and they are what
  // the plan view of any battleship is recognised by.
  for (const sgn of [-1, 1]) {
    const x = sgn * 6.4 * SCALE;
    const z0 = F.zAt(0.905, sheer(0.905)) - 1.0 * SCALE;
    const z1 = z0 - 26 * SCALE;
    const links = 34;
    for (let i = 0; i < links; i++) {
      const z = z0 - ((z0 - z1) * i) / links;
      const y = dy(z) + 0.22 * SCALE;
      const lk = box(g, M.chain, 0.34 * SCALE, 0.30 * SCALE, 0.62 * SCALE, x, y, z);
      lk.rotation.z = i % 2 ? Math.PI / 2 : 0;
    }
    // The chain stopper, which is what actually holds her when she is at anchor.
    box(g, M.steelDark, 1.1 * SCALE, 0.75 * SCALE, 1.6 * SCALE,
      x, dy(z0 - 9 * SCALE) + 0.38 * SCALE, z0 - 9 * SCALE);
    box(g, M.gunDark, 0.42 * SCALE, 1.1 * SCALE, 0.36 * SCALE,
      x, dy(z0 - 9 * SCALE) + 0.9 * SCALE, z0 - 9 * SCALE);
    // The navel pipe the cable drops through.
    cyl(g, M.steelDark, 0.55 * SCALE, 0.55 * SCALE, 0.5 * SCALE,
      x, dy(z1) + 0.2 * SCALE, z1 - 1.0 * SCALE, 12);
    // And the capstan that heaves it: a drum with a whelped barrel.
    const cz = z1 + 2.4 * SCALE;
    cyl(g, M.steelDark, 1.30 * SCALE, 1.45 * SCALE, 1.55 * SCALE,
      x, dy(cz) + 0.78 * SCALE, cz, 16);
    cyl(g, M.steel, 1.55 * SCALE, 1.55 * SCALE, 0.24 * SCALE,
      x, dy(cz) + 1.62 * SCALE, cz, 16);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      box(g, M.steelDark, 0.16 * SCALE, 1.5 * SCALE, 0.30 * SCALE,
        x + Math.sin(a) * 1.34 * SCALE, dy(cz) + 0.78 * SCALE,
        cz + Math.cos(a) * 1.34 * SCALE, a);
    }
  }

  // The breakwater: a chevron of plating set up across the forecastle abaft the
  // cables, to throw the green water she takes over the bow outboard instead of
  // down the deck. Every ship with a low forecastle carries one and it is the
  // one piece of deck furniture you cannot miss from the air.
  const bwZ = A_Z + 15.0 * SCALE;
  for (const sgn of [-1, 1]) {
    const wEdge = halfDeck(bwZ) * 0.94;
    for (let i = 0; i < 8; i++) {
      const u = i / 8;
      const u1 = (i + 1) / 8;
      const x0 = sgn * u * wEdge;
      const x1 = sgn * u1 * wEdge;
      const dz0 = -4.2 * SCALE * u * u;
      const dz1 = -4.2 * SCALE * u1 * u1;
      const seg = box(g, M.steel, Math.abs(x1 - x0) + 0.22 * SCALE,
        2.05 * SCALE, 0.34 * SCALE, (x0 + x1) / 2,
        dy(bwZ) + 1.02 * SCALE, bwZ + (dz0 + dz1) / 2);
      seg.rotation.y = Math.atan2(dz1 - dz0, x1 - x0);
      // The knee bracketing it to the deck.
      const kn = box(g, M.steelDark, 0.18 * SCALE, 1.0 * SCALE, 1.2 * SCALE,
        (x0 + x1) / 2, dy(bwZ) + 0.5 * SCALE,
        bwZ + (dz0 + dz1) / 2 - 0.7 * SCALE);
      kn.rotation.y = Math.atan2(dz1 - dz0, x1 - x0);
    }
  }

  // The paravane booms, stowed fore and aft on the forecastle with their
  // chains, and the towing points on the stem below them.
  for (const sgn of [-1, 1]) {
    const pz = A_Z + 30 * SCALE;
    tubeZ(g, M.steelDark, 0.26 * SCALE, 11 * SCALE,
      sgn * 8.2 * SCALE, dy(pz) + 0.9 * SCALE, pz, 8);
    cyl(g, M.steelDark, 0.34 * SCALE, 0.40 * SCALE, 1.2 * SCALE,
      sgn * 8.2 * SCALE, dy(pz) + 0.5 * SCALE, pz - 5.2 * SCALE, 8);
  }

  // The bullring on the stem head, which every cable she passes goes through.
  const brZ = F.zAt(0.985, sheer(0.985));
  cyl(g, M.steelDark, 1.35 * SCALE, 1.35 * SCALE, 0.55 * SCALE,
    0, dy(brZ) + 0.3 * SCALE, brZ, 16);
  cyl(g, M.cave, 0.80 * SCALE, 0.80 * SCALE, 0.70 * SCALE,
    0, dy(brZ) + 0.3 * SCALE, brZ, 16);

  // The chrysanthemum crest, gilded bronze, on the stem below the bullring.
  // Sixteen petals, one and a half metres across, and the only bright thing on
  // a ship painted entirely grey.
  const crestY = sheer(1) - 2.9 * SCALE;
  const crestZ = F.zAt(1, crestY);
  const crest = new THREE.Group();
  crest.position.set(0, crestY, crestZ - 0.20 * SCALE);
  crest.rotation.x = Math.PI / 2;
  cyl(crest, mat(P.chrys), 0.78 * SCALE, 0.78 * SCALE, 0.22 * SCALE, 0, 0, 0, 20);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const pet = box(crest, mat(P.chrys), 0.34 * SCALE, 0.20 * SCALE, 0.95 * SCALE,
      Math.sin(a) * 1.06 * SCALE, 0, Math.cos(a) * 1.06 * SCALE);
    pet.rotation.y = a;
  }
  g.add(crest);

  // The jackstaff right forward, struck down at sea and up in harbour.
  cyl(g, M.steelDark, 0.11 * SCALE, 0.15 * SCALE, 5.2 * SCALE,
    0, dy(brZ) + 2.6 * SCALE, brZ - 2.6 * SCALE, 8);

  // ---- bollards, fairleads and cleats, all round -------------------------

  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const t = -0.90 + (1.80 * i) / 15;
      const z = F.zAt(t, sheer(t));
      const y = sheer(t);
      const w = F.shellAt(t, y) - 1.5 * SCALE;
      if (w < 1.0 * SCALE) continue;
      // A pair of bitts on a common base.
      box(g, M.steelDark, 1.10 * SCALE, 0.22 * SCALE, 0.62 * SCALE,
        sgn * w, y + 0.11 * SCALE, z);
      for (const dx of [-0.32, 0.32]) {
        cyl(g, M.steelDark, 0.19 * SCALE, 0.21 * SCALE, 0.80 * SCALE,
          sgn * w + dx * SCALE, y + 0.58 * SCALE, z, 10);
        cyl(g, M.steelDark, 0.25 * SCALE, 0.25 * SCALE, 0.12 * SCALE,
          sgn * w + dx * SCALE, y + 1.02 * SCALE, z, 10);
      }
      // And the fairlead in the waterway outboard of it.
      const we = F.shellAt(t, y);
      box(g, M.deckSteel, 0.55 * SCALE, 0.34 * SCALE, 0.95 * SCALE,
        sgn * (we - 0.62 * SCALE), y + 0.19 * SCALE, z);
      box(g, M.cave, 0.62 * SCALE, 0.17 * SCALE, 0.50 * SCALE,
        sgn * (we - 0.62 * SCALE), y + 0.25 * SCALE, z);
    }
  }

  // ---- amidships ---------------------------------------------------------

  // Hatches, with their coamings: the way down to everything under the
  // armoured deck, and each one a raised box with a hinged lid on it.
  for (const sgn of [-1, 1]) {
    for (const z of [0.30 * LOA, 0.21 * LOA, 0.07 * LOA,
      -0.06 * LOA, -0.17 * LOA, -0.24 * LOA]) {
      const y = dy(z);
      const x = sgn * Math.min(9.5 * SCALE, halfDeck(z) - 5.5 * SCALE);
      if (x === 0) continue;
      box(g, M.steelDark, 2.4 * SCALE, 0.55 * SCALE, 3.2 * SCALE, x, y + 0.28 * SCALE, z);
      box(g, M.steel, 2.0 * SCALE, 0.16 * SCALE, 2.8 * SCALE, x, y + 0.62 * SCALE, z);
      for (const dz of [-1, 1]) {
        cyl(g, M.gunDark, 0.10 * SCALE, 0.10 * SCALE, 0.4 * SCALE,
          x, y + 0.68 * SCALE, z + dz * 1.2 * SCALE, 6);
      }
    }
  }

  // Mushroom ventilators and cowls down both sides -- a Japanese weather deck
  // is covered in them, and they are what stops the whole of her reading as an
  // empty plate from above.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const z = 0.36 * LOA - i * 0.052 * LOA;
      const y = dy(z);
      const w = halfDeck(z);
      const x = sgn * Math.min(12.5 * SCALE, w - 2.8 * SCALE);
      if (i % 3 === 0) {
        // A cowl, turned to face forward.
        cyl(g, M.steel, 0.42 * SCALE, 0.48 * SCALE, 2.1 * SCALE, x, y + 1.05 * SCALE, z, 12);
        const bell = cyl(g, M.steel, 0.78 * SCALE, 0.44 * SCALE, 1.0 * SCALE,
          x, y + 2.35 * SCALE, z + 0.45 * SCALE, 12);
        bell.rotation.x = 1.05;
        cyl(g, M.cave, 0.66 * SCALE, 0.66 * SCALE, 0.12 * SCALE,
          x, y + 2.72 * SCALE, z + 0.80 * SCALE, 12).rotation.x = 1.05;
      } else {
        // A mushroom head, which is what most of them are.
        cyl(g, M.steel, 0.46 * SCALE, 0.52 * SCALE, 1.15 * SCALE, x, y + 0.58 * SCALE, z, 12);
        cyl(g, M.steelDark, 0.72 * SCALE, 0.60 * SCALE, 0.34 * SCALE,
          x, y + 1.30 * SCALE, z, 12);
      }
    }
  }

  // The sockets an awning's stanchions step into, all down the waterway. Every
  // Japanese ship spent half her life under awnings in the tropics and the
  // sockets are there whether the awning is spread or not.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 34; i++) {
      const t = -0.90 + (1.80 * i) / 33;
      const y = sheer(t);
      const w = F.shellAt(t, y);
      if (w < 3.0 * SCALE) continue;
      cyl(g, M.steelDark, 0.13 * SCALE, 0.13 * SCALE, 0.30 * SCALE,
        sgn * (w - 0.75 * SCALE), y + 0.16 * SCALE, F.zAt(t, y), 8);
    }
  }

  // Ready-use lockers and the fire main risers along the deck edge.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 0.28 * LOA - i * 0.075 * LOA;
      const y = dy(z);
      const w = halfDeck(z);
      box(g, M.steel, 1.0 * SCALE, 1.15 * SCALE, 1.8 * SCALE,
        sgn * (w - 2.0 * SCALE), y + 0.6 * SCALE, z);
      cyl(g, M.steelDark, 0.14 * SCALE, 0.14 * SCALE, 1.0 * SCALE,
        sgn * (w - 1.25 * SCALE), y + 0.5 * SCALE, z + 2.6 * SCALE, 8);
    }
  }

  // ---- the quarterdeck ---------------------------------------------------

  // The after capstans and the warping gear.
  for (const sgn of [-1, 1]) {
    const cz = -0.395 * LOA;
    cyl(g, M.steelDark, 1.15 * SCALE, 1.30 * SCALE, 1.35 * SCALE,
      sgn * 5.6 * SCALE, dy(cz) + 0.68 * SCALE, cz, 14);
    cyl(g, M.steel, 1.40 * SCALE, 1.40 * SCALE, 0.22 * SCALE,
      sgn * 5.6 * SCALE, dy(cz) + 1.42 * SCALE, cz, 14);
    // The stern cable, flaked down on deck.
    for (let i = 0; i < 12; i++) {
      const z = cz - 1.8 * SCALE - i * 0.62 * SCALE;
      const lk = box(g, M.chain, 0.30 * SCALE, 0.26 * SCALE, 0.55 * SCALE,
        sgn * 5.6 * SCALE, dy(z) + 0.2 * SCALE, z);
      lk.rotation.z = i % 2 ? Math.PI / 2 : 0;
    }
  }

  // The stern anchor, housed in its own recess in the quarterdeck plating on
  // the starboard quarter, with the slip and the cable leading to it. She
  // carried one aft as well as the two bowers, for anchoring by the stern in
  // a tideway.
  for (const sgn of [-1, 1]) {
    const t = -0.905;
    const y = sheer(t) - 2.6 * SCALE;
    const w = F.shellAt(t, y);
    const z = F.zAt(t, y);
    box(g, M.hullDark, 0.26 * SCALE, 2.6 * SCALE, 3.0 * SCALE,
      sgn * (w - 0.12 * SCALE), y, z);
    const a = new THREE.Group();
    a.position.set(sgn * (w - 0.02 * SCALE), y, z);
    box(a, M.gunDark, 0.20 * SCALE, 0.42 * SCALE, 2.4 * SCALE, 0, 0, 0);
    for (const dy of [-1, 1]) {
      const fl = box(a, M.gunDark, 0.22 * SCALE, 1.00 * SCALE, 0.95 * SCALE,
        0, dy * 0.70 * SCALE, 0.85 * SCALE);
      fl.rotation.x = dy * 0.22;
    }
    g.add(a);
    // The slip and the deck sheave the cable runs over.
    cyl(g, M.steelDark, 0.42 * SCALE, 0.42 * SCALE, 0.5 * SCALE,
      sgn * 4.2 * SCALE, dy(-0.885 * HALF) + 0.24 * SCALE, -0.885 * HALF, 12);
    box(g, M.steelDark, 0.8 * SCALE, 0.6 * SCALE, 1.4 * SCALE,
      sgn * 4.2 * SCALE, dy(-0.865 * HALF) + 0.3 * SCALE, -0.865 * HALF);
  }

  // The towing slip right aft, and the after fairleads either side of it.
  for (const sgn of [-1, 1]) {
    const z = -0.935 * HALF;
    const w = halfDeck(z);
    box(g, M.steelDark, 0.7 * SCALE, 0.5 * SCALE, 1.5 * SCALE,
      sgn * (w - 1.1 * SCALE), dy(z) + 0.25 * SCALE, z);
    box(g, M.cave, 0.8 * SCALE, 0.24 * SCALE, 0.8 * SCALE,
      sgn * (w - 1.1 * SCALE), dy(z) + 0.34 * SCALE, z);
  }

  // The ensign staff right aft, and the after bullring.
  const stZ = -0.955 * HALF;
  cyl(g, M.steelDark, 0.13 * SCALE, 0.18 * SCALE, 6.0 * SCALE,
    0, dy(stZ) + 3.0 * SCALE, stZ, 8);
  cyl(g, M.steelDark, 1.0 * SCALE, 1.0 * SCALE, 0.45 * SCALE,
    0, dy(stZ + 4 * SCALE) + 0.24 * SCALE, stZ + 4 * SCALE, 14);
  cyl(g, M.cave, 0.58 * SCALE, 0.58 * SCALE, 0.60 * SCALE,
    0, dy(stZ + 4 * SCALE) + 0.24 * SCALE, stZ + 4 * SCALE, 14);
}

// ------------------------------------------------------- shafts and helm --

/**
 * Four screws on two pairs of shafts, and two rudders in line.
 *
 * The inner pair come out of the hull on bossings faired into the run; the
 * outer pair stand off on A-brackets. The rudders are on the centreline one
 * behind the other -- a big main rudder and a small auxiliary well forward of
 * it -- which is a Japanese arrangement and the reason a torpedo aft could
 * take her steering away in one hit.
 */
function screws(g) {
  const SHAFT = [
    [-9.0 * SCALE, -0.845 * HALF * 2 / 2, 3.05 * SCALE, -1, true],
    [9.0 * SCALE, -0.845 * HALF * 2 / 2, 3.05 * SCALE, 1, true],
    [-4.4 * SCALE, -0.885 * HALF * 2 / 2, 2.95 * SCALE, 1, false],
    [4.4 * SCALE, -0.885 * HALF * 2 / 2, 2.95 * SCALE, -1, false],
  ];
  for (const [x, z, r, hand, outer] of SHAFT) {
    const y = -7.6 * SCALE;
    // The bossing: a faired swelling on the hull that the shaft runs out of,
    // tapering to nothing forward.
    const bo = cyl(g, M.antifoul, 1.35 * SCALE, 0.30 * SCALE, 20 * SCALE,
      x, y + 0.9 * SCALE, z + 14 * SCALE, 14);
    bo.rotation.x = Math.PI / 2;
    // The shaft itself.
    tubeZ(g, M.gunDark, 0.60 * SCALE, 12 * SCALE, x, y, z + 6.2 * SCALE, 10);
    if (outer) {
      // The A-bracket: two legs to the hull, which is what carries an outer
      // shaft where there is no bossing to run it in.
      for (const dx of [-1, 1]) {
        const leg = box(g, M.antifoul, 0.34 * SCALE, 4.6 * SCALE, 1.25 * SCALE,
          x + dx * 1.5 * SCALE, y + 2.3 * SCALE, z + 3.4 * SCALE);
        leg.rotation.z = dx * 0.36;
      }
    }
    const hub = new THREE.Group();
    hub.position.set(x, y, z);
    // She turns, so the welder is told to leave her alone: a screw baked into
    // the hull is a propeller standing dead still under a ship at full speed.
    hub.userData.dynamic = true;
    // A screw has a hand. The two shafts of a pair turn opposite ways so their
    // torques cancel, or a ship at full power carries a permanent list and a
    // rudder always over -- and the outer pair are handed against the inner
    // for the same reason.
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.88 * SCALE, 0.60 * SCALE, 1.05 * SCALE, 0, 0, 0, 12)
      .rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.30 * SCALE, 0.12 * SCALE, 0.9 * SCALE, 0, 0, -0.9 * SCALE, 10)
      .rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, r * 0.60, 0.16 * SCALE, r * 1.55,
        Math.sin(a) * r * 0.56, Math.cos(a) * r * 0.56, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.44;
    }
    g.add(hub);
  }

  // The two rudders, one behind the other on the centreline, each hung on its
  // own stock. Both are balanced -- part of the blade stands forward of the
  // stock -- which is how a rudder that size is turned at all.
  for (const [z, hgt, chord] of [[-0.900 * HALF, 7.2, 5.6], [-0.946 * HALF, 5.6, 3.9]]) {
    cyl(g, M.gunDark, 0.52 * SCALE, 0.52 * SCALE, 3.0 * SCALE,
      0, -3.6 * SCALE, z, 10);
    box(g, M.gunDark, 0.55 * SCALE, hgt * SCALE, chord * SCALE,
      0, -6.4 * SCALE, z);
    box(g, M.gunDark, 0.40 * SCALE, hgt * 0.55 * SCALE, chord * 0.42 * SCALE,
      0, -6.4 * SCALE, z + chord * 0.56 * SCALE);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hull', hull],
  ['armour', armour],
  ['decks', decks],
  ['rails', rails],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildYamato() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides are built to her own lines, with the deck they stop under a
  // quarter of a metre below her deck edge: a bulkhead lands under the deck it
  // holds up, not flush with the edge of it, and a frame built exactly level
  // with the sheer strake is a frame standing in the deck seam.
  buildInterior(g, {
    loa: LOA,
    shellAt: F.shellAt,
    keelY: F.keelY,
    sheer: (t) => sheer(t) - 0.25,
    zAt: F.zAt,
  });
  mergeStatic(g, bySection(LOA));
  mergeMoving(g);
  g.userData.classId = 'yamato';
  dressShip(g);
  return {
    group: g,
    // She is a bare hull at this stage: her battery is not built, so there is
    // nothing here to lay or to fire from. Every consumer of these takes an
    // empty list -- the guns come back when the hull under them is right.
    turrets: [], length: LOA, beam: BEAM, deckY: sheer(0),
    secMounts: [], aaMounts: [], torpMounts: [],
  };
}

export function yamatoParts() {
  const parts = [];
  for (const [name, build] of STATIC) {
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
