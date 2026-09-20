// IJN Shinano, built out of her own lines.
//
// The third Yamato hull, taken off the slip half-built and finished as an
// armoured aircraft carrier: two hundred and sixty-six metres, seventy-three
// thousand tonnes at deep load, and the largest warship ever built to fly
// aircraft until the nuclear carriers. Her flight deck is seventy-five
// millimetres of CNC armour on twenty of mild steel over a hundred and ninety
// of main deck, and under it is one enclosed hangar standing on a
// battleship's citadel.
//
// She was torpedoed by the submarine Archerfish ten days after commissioning,
// on her first voyage, with her watertight doors untested and half her crew
// aboard for the first time. She took seven hours to sink and never flew an
// aircraft.
//
// The numbers everything here is built to, off her own particulars:
//
//   length overall      265.8 m          beam            36.3 m
//   draught              10.3 m          deep load       73,000 t
//   flight deck         256 x 40 m       armour           75 mm over 20
//   hangar              163.4 x 33.8 m   clear height      5.0 m
//   hangar aft, min      19.8 m          lifts        two, 15 x 14 m
//   belt                400 mm abreast the magazines, 160 elsewhere
//   armour deck         100-190 mm flat, 230 on the slope
//   machinery           12 Kampon boilers, 4 shafts, 150,000 shp, 28 kn
//   battery             8 x 2  12.7 cm Type 89
//                      35 x 3  25 mm Type 96
//                      12 x 28 12 cm AA rocket
//                       4      Type 94 directors, Type 21 and Type 13 radar
//   air group           47: 18 Reppu, 18 Ryusei, 6 Saiun, and spares
//
// Five things have to be right or she is not her.
//
// The first is the deck edge. Shinano's flight deck is carried on the hull
// rather than overhanging it the way an American carrier's does -- her
// gallery deck is inboard of the deck edge, her sponsons hang below it, and
// the whole of her from the beam is one continuous slab with the guns set into
// its underside.
//
// The second is the island and the funnel, which are one structure. The funnel
// is canted twenty-six degrees outboard so the smoke clears the deck, and it
// stands immediately abaft the bridge on the starboard side rather than
// separately -- which is the Taiho arrangement and Shinano copied it.
//
// The third is the round-down. Both ends of her flight deck curve down, which
// is what a Japanese carrier of this generation has and what an Essex does
// not; the deck does not simply stop.
//
// The fourth is which end is barred. The red and white bars go on the AFTER
// round-down, because they are there to tell a pilot coming up the deck at
// ninety knots with his nose in the way where the deck stops -- and a pilot
// coming aboard is coming aboard over the stern. Forward she carries the
// converging white guide lines a pilot lines up on going off, and nothing red
// at all. Painted the other way round she reads as a carrier steaming astern.
//
// The fifth is her section. She is a Yamato: maximum beam at the waterline, at
// the crown of the anti-torpedo bulge, and her side leaning inboard the whole
// way up from there. Without the tumblehome she is a slab with a runway on it.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { DECK_RUN } from '../../../shared/sim.js';
import {
  box, cyl, tubeZ, ladder, sideLadder, fairTable, loftShape, planHouse,
} from './shipkit.js';
import { hullForm, plateHull } from './hullform.js';
import { zero, suisei, tenzan } from './planekit.js';
import {
  typeEightNine, triple25, rocket, rangefinder, director,
  typeTwentyOne, typeThirteen, cowl, boat, searchlight,
} from './ijnguns.js';

const CLS = SHIP_CLASSES.shinano;
export const LOA = CLS.hull.length;      // 266 m
export const BEAM = CLS.hull.beam;       // 36.3 m
export const DRAFT = CLS.hull.draft;     // 10.3 m
/** Starboard, in this frame. */
const S = -1;

const P = {
  hull: 0x5a626b,
  hullDark: 0x4a525a,
  boot: 0x1a1d21,
  antifoul: 0x6a2f26,
  // The flight deck is not planked. Shinano's armour is covered with a
  // shock-absorbent latex-and-sawdust compound laid on like a screed, which is
  // why the kits call her the concrete-deck ship: a flat mid grey-brown with
  // no plank line in it anywhere.
  deck: 0x7b7973,
  deckDark: 0x6a6862,
  deckSteel: 0x4e555d,
  steel: 0x676f78,
  steelDark: 0x525961,
  bright: 0x828a93,
  gun: 0x616971,
  gunDark: 0x3d434a,
  canvas: 0x8a8a7e,
  glass: 0x2a3742,
  cave: 0x14181c,
  brass: 0x8a7340,
  boat: 0x6d6350,
  stripe: 0xd8dce0,        // the deck centreline and the landing marks
  stripeRed: 0xa33029,     // the barred round-down at the after end
  chrys: 0x9d8140,
  armour: 0x555c64,        // the belt, where it shows
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (k) => { const c = clamp(k, 0, 1); return c * c * (3 - 2 * c); };

// ------------------------------------------------------------- her lines --
//
// A Yamato hull, because that is what she is: the same offsets off the same
// drawing, taken in on the beam to the 36.3 m she was completed at and given
// her own sheer above the armour deck. Every table below is a station -1 (the
// stern) to +1 (the stem) against a half-breadth, a depth or a height in
// metres.

/**
 * Her half-breadths at the waterline.
 *
 * Maximum beam is at the water, at the crown of the anti-torpedo bulge, and it
 * holds within a hand's breadth for better than a third of her length. That
 * long parallel middle body is the whole reason a hull this size could be
 * driven at twenty-eight knots on a hundred and fifty thousand horsepower.
 */
const HALF_BEAM = [
  [-1.000, 2.58], [-0.960, 4.24], [-0.920, 5.92], [-0.860, 8.02],
  [-0.800, 9.86], [-0.720, 11.92], [-0.630, 13.80], [-0.530, 15.32],
  [-0.420, 16.56], [-0.310, 17.48], [-0.200, 17.96], [-0.100, 18.13],
  [0.000, 18.15], [0.100, 18.11], [0.200, 17.84], [0.300, 17.20],
  [0.400, 16.14], [0.500, 14.68], [0.600, 12.82], [0.700, 10.58],
  [0.800, 7.88], [0.880, 5.04], [0.940, 2.54], [0.980, 0.88],
  [1.000, 0.17],
];

/**
 * Her keel line, and the forefoot.
 *
 * Flat keel at 10.4 m over better than half her length. Aft it lifts into the
 * counter; forward it holds its depth almost to the stem and then turns up
 * into the bulb, which is built on afterwards -- the lofted shell only gets
 * her as far as the forefoot.
 */
const KEEL = [
  [-1.000, -1.74], [-0.960, -4.34], [-0.920, -6.78], [-0.880, -8.24],
  [-0.820, -9.34], [-0.740, -9.98], [-0.620, -10.30], [-0.400, -10.40],
  [0.000, -10.40], [0.300, -10.40], [0.500, -10.37], [0.620, -10.28],
  [0.720, -10.10], [0.800, -9.84], [0.860, -9.44], [0.900, -8.92],
  [0.940, -8.04], [0.970, -6.70], [0.990, -4.96], [1.000, -3.34],
];

/**
 * Her sheer: the deck edge of the upper deck, which on a carrier is the top
 * edge of the shell and the level the hangar deck is laid at.
 *
 * Flatter and a great deal higher than a Yamato's, because the hull is carried
 * right up to the hangar instead of stopping at a weather deck, and because
 * the flight deck forward keeps the sea out so she needs no more rise than
 * this. Thirteen and a half metres aft to better than sixteen at the stem.
 */
const SHEER = [
  [-1.000, 13.44], [-0.880, 13.50], [-0.720, 13.62], [-0.560, 13.78],
  [-0.400, 13.99], [-0.240, 14.24], [-0.080, 14.52], [0.080, 14.86],
  [0.240, 15.28], [0.380, 15.66], [0.500, 15.98], [0.620, 16.28],
  [0.720, 16.52], [0.800, 16.70], [0.870, 16.84], [0.920, 16.92],
  [0.955, 16.96], [0.980, 16.84], [1.000, 16.56],
];

/**
 * And the flare: how far her deck edge stands outboard of her waterline beam.
 * Almost nothing amidships, where her side is very nearly vertical; three
 * metres over the forward quarter, which is the bow.
 */
const FLARE = [
  [-1.000, 2.62], [-0.930, 2.12], [-0.850, 1.46], [-0.720, 0.78],
  [-0.550, 0.39], [-0.300, 0.21], [0.000, 0.21], [0.250, 0.42],
  [0.420, 0.97], [0.550, 1.66], [0.660, 2.42], [0.740, 2.98],
  [0.800, 3.26], [0.850, 3.22], [0.900, 2.86], [0.945, 2.08],
  [0.975, 1.20], [1.000, 0.50],
];

/**
 * Her tumblehome: how far the deck edge is pulled inboard of her waterline
 * beam. This is the thing about a Yamato section that a table of half-breadths
 * alone will not give you -- her maximum beam is at the water, at the crown of
 * the anti-torpedo bulge, and her upper deck is better than two metres
 * narrower than it. Amidships her side leans in the whole way from the
 * waterline to the deck edge; forward it goes the other way and becomes the
 * flare.
 */
const TUMBLE = [
  [-1.000, 0.00], [-0.900, 0.28], [-0.800, 0.58], [-0.650, 0.86],
  [-0.450, 1.05], [-0.200, 1.14], [0.100, 1.14], [0.300, 0.95],
  [0.480, 0.58], [0.620, 0.24], [0.760, 0.00], [1.000, 0.00],
];

const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE, tumble: TUMBLE,
  // A stem that rakes five and a half metres forward between the water and
  // the deck edge, curved rather than straight -- she has a trace of clipper
  // in her, and it is the whole of what makes her bow look fast.
  stem: 6.2, stemLo: -4.2, stemUp: 21.0, stemPow: 1.30,
  // And a counter that overhangs seven and a half, which is what makes the
  // stern of a Japanese capital ship look as long as it does.
  counter: 8.4, counterLo: -2.6, counterUp: 16.0, counterPow: 1.22,
  // A very full bilge: she is nearly rectangular in section amidships, which
  // is where the stability for all that topweight came from.
  bilge: 0.28,
  stations: 150,
});

export const { deckAt, halfDeck } = F;
/** Her lines, for the tests: the shell, the keel, the sheer and the rake. */
export const LINES = F;
const sheer = F.sheer;

// ------------------------------------------------------------ her decks --

/** The hangar deck, which on a carrier is the upper deck of the hull. */
const HANGAR = 13.10;
/** The flight deck, and how deep the structure under it is. */
export const FD = 19.90;
const FD_T = 1.70;
/** So the hangar has five metres of clear height, which is what she had. */
const HANGAR_TOP = FD - FD_T;
/**
 * The gallery deck: the catwalk round the deck edge under the flight deck.
 *
 * At the same height as the gun floors, because that is what it is for. A
 * catwalk on its own level with the tubs above or below it is a walkway that
 * goes past every gun on the ship without reaching any of them, and where the
 * two are within a metre of each other the rail stands through the plating.
 */
const GALLERY = FD - 3.00;
/**
 * The three gun floors, written once.
 *
 * `TURRET_Y` is fixed by her datasheet: a Type 89's muzzles are 19.35 m up,
 * which puts the mounting's own base here. The other two are set so the rim of
 * each tub stands just clear under the flight deck rather than swallowing the
 * gun -- a 25 mm behind plating up to its own sights is a gun nobody can see
 * and nobody could have fought.
 */
const TURRET_Y = FD - 2.60;
const AA_Y = FD - 3.00;
const ROCKET_Y = FD - 3.40;

/**
 * The flight deck in plan: 256 m long on a 266 m hull and 40 m across.
 *
 * She overhangs her own counter aft by a couple of metres and stops ten short
 * of the stem forward, which is where her forecastle is. The outline is a
 * table because a carrier's deck is a drawn shape rather than a formula: full
 * width over the middle two-thirds, drawing in forward to about twelve metres
 * across the round-up, and aft to a broad rounded transom.
 */
const FD_FWD = 128;
const FD_AFT = -138;
const FDW = 20.0;
const FD_PLAN = [
  [-138.0, 7.2], [-136.0, 11.6], [-133.0, 14.6], [-128.0, 16.9],
  [-120.0, 18.5], [-109.0, 19.5], [-94.0, 20.0], [-40.0, 20.0],
  [22.0, 20.0], [56.0, 19.9], [76.0, 19.4], [92.0, 18.2],
  [105.0, 16.3], [115.0, 13.6], [122.0, 10.2], [126.0, 7.2],
  [128.0, 5.0],
];

/** Her half-breadth at the flight deck at a station. */
function fdHalf(z) { return fairTable(FD_PLAN, z); }

/**
 * And how far down the round-down has taken it there.
 *
 * Both ends curve down, which every Japanese carrier of this generation has:
 * forward it is a round-up that is really a round-down the other way, and aft
 * it falls away far harder because that is the end a pilot comes over.
 */
function fdDrop(z) {
  if (z > FD_FWD - 18) return Math.pow((z - (FD_FWD - 18)) / 18, 2) * 2.9;
  if (z < FD_AFT + 21) return Math.pow((FD_AFT + 21 - z) / 21, 2) * 3.5;
  return 0;
}

/** The height of the flight deck at a station. */
function fdY(z) { return FD - fdDrop(z); }

/**
 * How far out the lift opening reaches at a station, or nought where the deck
 * is whole.
 *
 * The two wells are holes cut clean through seventy-five millimetres of deck
 * armour, and they have to be holes: the lift was drawn as a platform laid on
 * top of an unbroken deck, so when it went down it simply vanished under the
 * deck and the well it left was a painted outline. A lift down the well is
 * the one thing on a carrier that everybody can see from the air.
 */
const WELL_HW = 7.80;
const WELL_HD = 7.30;
const WELL_CH = 2.30;
function wellHalf(z) {
  for (const lz of [LIFT_F, LIFT_A]) {
    const dz = Math.abs(z - lz);
    if (dz > WELL_HD) continue;
    if (dz <= WELL_HD - WELL_CH) return WELL_HW;
    return WELL_HW - (dz - (WELL_HD - WELL_CH));
  }
  return 0;
}

/**
 * The stations the flight deck is cut at: an even run the length of her, with
 * the four corners of each well dropped in so the octagon comes out as an
 * octagon and not as a staircase.
 */
function deckStations(n) {
  const zs = [];
  for (let i = 0; i <= n; i++) zs.push(FD_AFT + ((FD_FWD - FD_AFT) * i) / n);
  for (const lz of [LIFT_F, LIFT_A]) {
    for (const d of [WELL_HD, WELL_HD - WELL_CH]) {
      zs.push(lz - d, lz + d);
    }
    // And a hair outside each end of the well, so the hole closes across a
    // flat edge rather than running out to a point on the centreline.
    zs.push(lz - WELL_HD - 0.02, lz + WELL_HD + 0.02);
  }
  zs.sort((a, b) => a - b);
  return zs.filter((z, i) => z >= FD_AFT && z <= FD_FWD
    && (i === 0 || z - zs[i - 1] > 1e-4));
}

/**
 * The flight deck as a sheet with the two wells cut out of it: one band per
 * pair of stations, whole where there is no well and split into a port and a
 * starboard piece where there is.
 */
function deckSheet(g, m, y, up) {
  const zs = deckStations(120);
  const pos = [];
  const idx = [];
  const P = (x, z) => { pos.push(x, y(z), z); return pos.length / 3 - 1; };
  const quad = (a, b, c, d) => {
    if (up) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i];
    const zb = zs[i + 1];
    const wa = fdHalf(za);
    const wb = fdHalf(zb);
    const ca = wellHalf(za);
    const cb = wellHalf(zb);
    if (ca <= 0 && cb <= 0) {
      quad(P(-wa, za), P(wa, za), P(wb, zb), P(-wb, zb));
    } else {
      for (const sgn of [-1, 1]) {
        const i0 = P(sgn * ca, za);
        const i1 = P(sgn * wa, za);
        const i2 = P(sgn * wb, zb);
        const i3 = P(sgn * cb, zb);
        if (sgn < 0) quad(i1, i0, i3, i2); else quad(i0, i1, i2, i3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const o = new THREE.Mesh(geo, m);
  g.add(o);
  return o;
}

/**
 * The hangar in plan: 163.4 m by 33.8 m, narrowing to 19.8 m right aft.
 *
 * One deck, enclosed, on the citadel. Japanese practice is a closed hangar,
 * which is why her sides are plating rather than the open roller-shutter
 * galleries an American carrier has -- and why a bomb that got in among her
 * aircraft had nowhere to vent.
 */
const HANGAR_F = 81.0;
const HANGAR_A = -88.5;
const HANGAR_PLAN = [
  [-88.5, 9.9], [-81.0, 11.8], [-70.6, 13.8], [-58.1, 15.4],
  [-41.5, 16.6], [-20.8, 16.9], [20.8, 16.9], [45.7, 16.7],
  [60.2, 16.1], [70.6, 15.0], [78.9, 13.4], [81.0, 12.6],
];

/** How wide the hangar is at a station, held inside the deck and the shell. */
function hangarHalf(z) {
  if (z > HANGAR_F || z < HANGAR_A) return 0;
  return Math.min(fairTable(HANGAR_PLAN, z), fdHalf(z) - 1.6,
    F.shellAt(z / (LOA / 2), HANGAR + 1.0) - 0.5);
}

/** The two centreline lifts: fifteen metres by fourteen, one at each end. */
const LIFT_F = 54;
const LIFT_A = -65;
const LIFT_HW = 7.5;
const LIFT_HD = 7.0;

/**
 * The lift opening in plan: an octagon, which is what she carried.
 *
 * A rectangular hole in an armoured deck is four corners for a crack to start
 * from. Taiho's lifts were cut with the corners taken off and Shinano's
 * followed, and it is the one thing about a Japanese armoured carrier's deck
 * that shows in every plan of her.
 */
function liftOutline(hw = LIFT_HW, hd = LIFT_HD, chamfer = 2.3) {
  return [
    [hw, hd - chamfer], [hw - chamfer, hd], [-(hw - chamfer), hd], [-hw, hd - chamfer],
    [-hw, -(hd - chamfer)], [-(hw - chamfer), -hd], [hw - chamfer, -hd],
    [hw, -(hd - chamfer)],
  ];
}

/** The island, on the starboard side, a little forward of amidships. */
const ISL_Z = 19;
const ISL_X = S * 14.6;

// ------------------------------------------------------------- machinery --
//
// Twelve Kampon boilers in four rooms, four shafts, two rudders. The whole of
// it is inside the citadel and none of it shows, but the shafts and the screws
// do and they are placed off the same arrangement.
const SHAFT_OUT = 8.0;
const SHAFT_IN = 3.9;

// ---------------------------------------------------------------- sheets --

/**
 * A sheet built up out of quads, each wound so its face looks the way it is
 * told to. For anything that follows a curve in plan -- the flight deck's
 * girder, the hangar sides -- because a curve drawn as a run of boxes steps
 * sideways between one box and the next and a ray goes through the step.
 */
function strip() {
  const pos = [];
  const idx = [];
  const quad = (a, b, c, d, out) => {
    const n = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    if (flip) idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    else idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const mesh = (g, m) => {
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m);
    g.add(o);
    return o;
  };
  return { quad, mesh };
}

/**
 * A deck: one sheet between a port and a starboard edge given as functions of
 * the station, wound to face the sky (or, with `up` false, the sea).
 */
function sheet(g, m, z0, z1, half, y, n = 96, up = true) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    const w = Math.max(0.05, half(z));
    const h = y(z);
    pos.push(-w, h, z, w, h, z);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    if (up) idx.push(a, b + 1, a + 1, a, b, b + 1);
    else idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const o = new THREE.Mesh(geo, m);
  g.add(o);
  return o;
}

/**
 * A rail: stanchions and three courses of wire along a line in plan.
 *
 * Every catwalk and every gun platform on her carries one, and a warship
 * without them reads as a model of a warship.
 */
function rail(g, m, z0, z1, half, y, step = 2.4, sides = [-1, 1], h = 1.05) {
  for (const sgn of sides) {
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / step));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      cyl(g, m, 0.045, 0.045, h, sgn * half(z), y(z) + h / 2, z, 5);
    }
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      for (const f of [0.38, 0.70, 1.0]) {
        const wire = box(g, m, 0.05, 0.05, Math.hypot(zb - za, half(zb) - half(za)),
          sgn * (half(za) + half(zb)) / 2, (y(za) + y(zb)) / 2 + h * f, (za + zb) / 2);
        wire.rotation.y = sgn * Math.atan2(half(zb) - half(za), zb - za);
      }
    }
  }
}

// ------------------------------------------------------------------ hull --

/**
 * Her shell.
 *
 * Plated by the common lofting machinery -- red lead below the boot topping,
 * black at it, Kure grey above -- and then given the five things that are hers
 * and that no table of offsets will produce: the bulbous forefoot, the knuckle
 * of the anti-torpedo bulge, the bilge keels, the belt where it shows above
 * water, and the bossings her shafts come out of.
 */
function hull(g) {
  // Fourteen strakes under the boot topping, so the turn of her bilge is a
  // curve rather than the flat V a single band gives. Nine was not enough
  // forward: a strake is a straight sheet in section between its two edges,
  // and where the forefoot rolls up hard the chord cuts a fifth of a metre
  // inside the line the interior was fitted to -- which puts her frames
  // outside her own bottom plating at the very place a bulbous bow is most
  // closely looked at.
  plateHull(g, F, M, { bootLo: -3.4, bootHi: 1.05, bands: 14 });
  bulb(g);
  bulge(g);
  bilgeKeels(g);
  beltArmour(g);
  sideDetail(g);
  bossings(g);
}

/**
 * The bulbous bow.
 *
 * A rounded blister on the forefoot, its nose about three metres forward of
 * where the stem cuts the water and its crown some seven below it. Lofted
 * rather than dropped in as a sphere, so it fairs into the stem instead of
 * sitting on it: rings of decreasing radius run aft from the nose and die into
 * the plating.
 */
function bulb(g) {
  const nose = F.zAt(1, -6.0) + 3.3;
  const root = F.zAt(1, -7.2) - 8.8;
  const axis = -6.8;
  const N = 18;
  const SEG = 18;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const r = 3.15 * Math.sin(Math.acos(clamp(2 * u - 1, -1, 1)));
    const z = nose + (root - nose) * u;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const lift = 1.55 * u * u;
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
  const noseC = pos.length / 3;
  pos.push(0, axis, nose);
  for (let k = 0; k < SEG; k++) idx.push(noseC, (k + 1) % SEG, k);
  const rootC = pos.length / 3;
  pos.push(0, axis + 1.55, root);
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
 * A strake run along her side: a knuckle, a seam, a rubbing band, the top edge
 * of the belt.
 *
 * Lofted rather than laid as a run of boxes, because a straight box on a
 * curving side stands proud of the curve at both its ends and forty of them
 * give her a side like a file. `yOf` is the height of the line at a station;
 * `out` how far it stands off the plating and `h` how deep it is.
 */
function sideStrake(g, m, t0, t1, yOf, out, h) {
  const N = 72;
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

/**
 * The anti-torpedo bulge.
 *
 * On a Yamato it is not bolted on the way a refitted 1916 ship's is -- it is
 * built into the shell, and what you see of it from outside is a long shallow
 * knuckle running the length of the citadel at the turn of the bilge, where
 * the bulge plating meets the side plating. It shows in a photograph as one
 * hard line of shadow under the belt and nowhere else.
 *
 * The joint between the top of that bulge and the foot of the belt is the
 * thing that killed her: it was badly designed, it opened on all four torpedo
 * hits, and the water went into the machinery spaces through it.
 */
function bulge(g) {
  sideStrake(g, M.antifoul, -0.72, 0.74, () => -5.35, -0.10, 1.34);
  sideStrake(g, M.antifoul, -0.72, 0.74, () => -4.35, -0.16, 0.42);
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
      const y = -7.85;
      const w0 = F.shellAt(t0, y);
      const w1 = F.shellAt(t1, y);
      const z0 = F.zAt(t0, y);
      const z1 = F.zAt(t1, y);
      const fin = box(g, M.antifoul, 1.50, 0.16, Math.abs(z1 - z0) + 0.05,
        sgn * ((w0 + w1) / 2 + 0.52), y - 0.48, (z0 + z1) / 2);
      fin.rotation.z = sgn * 0.72;
    }
  }
}

/**
 * The belt, where it shows.
 *
 * Four hundred millimetres abreast the magazines, which is what was already
 * riveted on when she was taken off the slip as a battleship, and a hundred
 * and sixty everywhere else -- the rest of it was cut away to pay for the
 * flight deck. Inclined twenty degrees, and its top edge is a hard line a
 * metre above the water that runs the length of the citadel and stops dead at
 * both ends of it. That line is the only part of a belt anybody ever sees.
 */
function beltArmour(g) {
  sideStrake(g, M.armour, -0.70, 0.72, () => 1.35, 0.02, 0.28);
  sideStrake(g, M.armour, -0.70, 0.72, () => -3.30, 0.02, 0.24);
  // The two closing bulkheads at the ends of the citadel, which is where the
  // four hundred millimetre strake stops.
  for (const t of [-0.70, 0.72]) {
    for (const sgn of [-1, 1]) {
      const y = -1.0;
      box(g, M.armour, 0.22, 4.4, 0.5, sgn * (F.shellAt(t, y) - 0.06), y, F.zAt(t, y));
    }
  }
}

/**
 * What is on her side above water: the sea chests and condenser inlets, the
 * scuttles along the hull under the gallery, the hawse recesses her anchors
 * house in, and the accommodation ladders stowed against the plating.
 */
function sideDetail(g) {
  // The seam of the upper deck stringer, right under the deck edge.
  sideStrake(g, M.hullDark, -0.95, 0.95, (t) => sheer(t) - 0.55, 0.02, 0.20);
  // Scuttles: two rows of them the length of her, because a carrier's hull is
  // accommodation from end to end and every one of those spaces has a light.
  for (const sgn of [-1, 1]) {
    for (const dy of [-2.2, -4.6]) {
      for (let t = -0.86; t <= 0.86; t += 0.026) {
        const y = sheer(t) + dy;
        const w = F.shellAt(t, y);
        if (w < 3) continue;
        cyl(g, M.cave, 0.19, 0.19, 0.10, sgn * (w - 0.02), y, F.zAt(t, y), 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }
  // The sea chests and the condenser inlets, low down abreast the machinery.
  for (const sgn of [-1, 1]) {
    for (const t of [-0.34, -0.14, 0.08, 0.28]) {
      const y = -6.4;
      const w = F.shellAt(t, y);
      box(g, M.hullDark, 0.10, 1.5, 3.2, sgn * (w - 0.04), y, F.zAt(t, y));
    }
  }
  // The hawse pipes, where the cable comes out through the bow.
  for (const sgn of [-1, 1]) {
    const t = 0.90;
    const y = sheer(t) - 2.3;
    const w = F.shellAt(t, y);
    cyl(g, M.gunDark, 0.62, 0.62, 0.4, sgn * (w - 0.10), y, F.zAt(t, y), 12)
      .rotation.z = Math.PI / 2;
  }
  // Accommodation ladders, triced up flat against her side where they live at
  // sea. Two a side, abreast the island and abreast the after lift.
  for (const sgn of [-1, 1]) {
    for (const t of [0.12, -0.38]) {
      const y = sheer(t) - 5.0;
      const w = F.shellAt(t, y);
      const z = F.zAt(t, y);
      const lad = box(g, M.steelDark, 0.22, 1.05, 9.6, sgn * (w + 0.16), y, z);
      lad.rotation.x = 0.22;
      for (let i = -4; i <= 4; i++) {
        box(g, M.steelDark, 0.20, 0.06, 0.26, sgn * (w + 0.30), y + i * 0.10, z + i * 1.04);
      }
    }
  }
}

/**
 * The bossings: the fairings her outboard shafts come out of, which on a
 * four-shaft ship are as much of her underwater shape as the bilge keels.
 */
function bossings(g) {
  for (const sgn of [-1, 1]) {
    for (const [x, r] of [[SHAFT_OUT, 1.5], [SHAFT_IN, 1.15]]) {
      const N = 12;
      for (let i = 0; i < N; i++) {
        const k = i / N;
        // Followed along her own counter, not along the bare station: at this
        // depth she ends seven and a half metres forward of where the station
        // says, and a bossing laid on the station runs out into the sea.
        const y = -6.5 - 0.85 * k;
        const t = -0.60 - (i * 0.135) / N;
        cyl(g, M.antifoul, r * (1 - 0.45 * k), r * (1 - 0.45 * (k + 1 / N)),
          (0.135 * LOA) / N + 0.2, sgn * x, y, F.zAt(t, y), 10)
          .rotation.x = Math.PI / 2;
      }
    }
  }
}

/**
 * Four screws and two rudders, which is what a Yamato hull turns on.
 *
 * Everything under her counter is placed through `zAt` and not through the
 * station alone. Her counter overhangs by seven and a half metres, which means
 * the station three-quarters of the way aft is seven and a half metres further
 * forward at the keel than it is at the deck -- so shafts, brackets, screws
 * and rudders laid out on the bare station all came out abaft the ship
 * entirely, turning in open water behind her.
 */
function screws(g) {
  // Where the hull actually is, at a station and a depth.
  const at = (t, y) => F.zAt(t, y);
  for (const [x, t, r, hand] of [
    [-SHAFT_OUT, -0.845, 2.95, -1],
    [SHAFT_OUT, -0.845, 2.95, 1],
    [-SHAFT_IN, -0.885, 2.85, 1],
    [SHAFT_IN, -0.885, 2.85, -1],
  ]) {
    const y = -6.9;
    const z = at(t, y);
    tubeZ(g, M.gunDark, 0.58, 13, x, y, z + 6.5, 10);
    // The A-bracket that carries the tail shaft, which every shaft that comes
    // out clear of the hull has and which nothing else holds up.
    for (const lean of [-0.6, 0.6]) {
      const arm = box(g, M.antifoul, 0.34, 3.4, 1.1,
        x + Math.sin(lean) * 1.5, y + 1.6, z + 5.2);
      arm.rotation.z = lean;
    }
    const hub = new THREE.Group();
    hub.position.set(x, y, z);
    // She turns, so the welder is told to leave her alone: a screw baked into
    // the hull is a propeller standing dead still under a ship at full speed.
    hub.userData.dynamic = true;
    // A screw has a hand. The two shafts of a pair turn opposite ways so
    // their torques cancel, or a ship at full power carries a permanent list
    // and a rudder always over -- and the outer pair are handed against the
    // inner for the same reason.
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.84, 0.58, 1.0, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, r * 0.58, 0.15, r * 1.5,
        Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.42;
    }
    g.add(hub);
  }
  // The skeg on the centreline between the inner shafts, which is what the
  // sternpost and the forward rudder hang on.
  for (let i = 0; i < 10; i++) {
    const t = -0.80 - (i * 0.14) / 10;
    const y = -8.4 + i * 0.16;
    box(g, M.antifoul, 1.5, 2.6, (0.14 * 138) / 10 + 0.15, 0, y, at(t, y));
  }
  // Two rudders in tandem on the centreline, which is the Yamato arrangement
  // and the reason a hull this size turns as tightly as she does.
  for (const [t, w, h] of [[-0.895, 6.4, 4.4], [-0.945, 4.4, 3.2]]) {
    const y = -6.0;
    const z = at(t, y);
    const r = box(g, M.gunDark, 0.55, w, h, 0, y, z);
    // The stock it turns on, carried up into the steering gear.
    cyl(g, M.gunDark, 0.42, 0.42, 3.2, 0, y + w / 2 + 1.2, z, 12);
    r.userData.rudder = true;
  }
}

// ------------------------------------------------------- the upper works --

/**
 * How far out her side is at the flight deck, which is inboard of the deck
 * edge: the flight deck overhangs the hull all round and the gallery runs in
 * the space under the overhang.
 */
function sideTop(z) {
  // Thirty-six metres three of hull under forty of flight deck: the overhang
  // is a metre and five-sixths each side, and the gallery runs in it.
  return Math.max(2.0, Math.min(fdHalf(z) - 1.85, BEAM / 2));
}

/**
 * The side between the shell's top edge and the flight deck.
 *
 * This is what makes her read as one continuous slab from the beam, which is
 * the single most recognisable thing about her: an American carrier's hull
 * stops at a gallery and the flight deck is carried out over it on stanchions,
 * and Shinano's does not -- the plating goes up without a break from the
 * waterline to the deck edge and the guns are set into the underside of it.
 *
 * It is one lofted sheet from the stem to the stern, not a run of boxes: the
 * shell's top edge is a curve in all three axes and anything laid along it in
 * straight lengths steps at every joint, which from ahead is a line of slots
 * the length of her.
 */
function upperSide(g) {
  // The station her deck edge is at a given point of her length.
  //
  // It is not z / (LOA / 2). Her stem rakes four metres forward between the
  // water and the deck edge, so the station whose deck edge is at the forward
  // end of the flight deck is a good way abaft the one the ratio gives -- and
  // built to the ratio the plating runs on ten metres past where the flight
  // deck stops and then gets clamped, which leaves a triangular shelf standing
  // out of her bow that is in no drawing of any ship.
  const tAtZ = (z) => {
    let lo = -1;
    let hi = 1;
    for (let i = 0; i < 36; i++) {
      const mid = (lo + hi) / 2;
      if (F.zAt(mid, sheer(mid)) < z) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const tA = tAtZ(FD_AFT);
  const tF = tAtZ(FD_FWD);
  const N = 120;
  const { quad, mesh } = strip();
  const top = strip();
  const foot = (t) => [F.shellAt(t, sheer(t)), sheer(t), F.zAt(t, sheer(t))];
  for (let i = 0; i < N; i++) {
    const ta = tA + ((tF - tA) * i) / N;
    const tb = tA + ((tF - tA) * (i + 1)) / N;
    const [wa, ya, za] = foot(ta);
    const [wb, yb, zb] = foot(tb);
    // The head of the plating follows the flight deck's own outline in, so
    // where the deck draws in at the ends the side comes with it.
    const ha = sideTop(za);
    const hb = sideTop(zb);
    for (const sgn of [-1, 1]) {
      quad([sgn * wa, ya, za], [sgn * ha, HANGAR_TOP, za],
        [sgn * hb, HANGAR_TOP, zb], [sgn * wb, yb, zb], [sgn, 0, 0]);
      // The narrow ledge between the head of the plating and the deck edge,
      // seen from below as the soffit the gun galleries hang from.
      top.quad([sgn * ha, HANGAR_TOP, za], [sgn * fdHalf(za), HANGAR_TOP, za],
        [sgn * fdHalf(zb), HANGAR_TOP, zb], [sgn * hb, HANGAR_TOP, zb], [0, 1, 0]);
    }
  }
  mesh(g, M.hull);
  top.mesh(g, M.hullDark);
  // And the two end bulkheads, which close her in forward and aft: her bow is
  // plated right up to the flight deck the way Taiho's is, not left open the
  // way an American carrier's is.
  for (const [t, z, out] of [[tF, FD_FWD, 1], [tA, FD_AFT, -1]]) {
    const [w, y] = foot(t);
    const h = sideTop(z);
    const end = strip();
    end.quad([-w, y, z], [w, y, z], [h, HANGAR_TOP, z], [-h, HANGAR_TOP, z],
      [0, 0, out]);
    end.mesh(g, M.hull);
  }
  // Forward of the flight deck she is open: the forecastle, with a bulwark
  // round it instead of plating, which is the one place on her a man can stand
  // in the open and see the sea.
  const bul = strip();
  for (let i = 0; i < 24; i++) {
    const ta = tF + ((1 - tF) * i) / 24;
    const tb = tF + ((1 - tF) * (i + 1)) / 24;
    const [wa, ya, za] = foot(ta);
    const [wb, yb, zb] = foot(tb);
    for (const sgn of [-1, 1]) {
      bul.quad([sgn * wa, ya, za], [sgn * wa, ya + 1.25, za],
        [sgn * wb, yb + 1.25, zb], [sgn * wb, yb, zb], [sgn, 0, 0]);
      bul.quad([sgn * wa, ya + 1.25, za], [sgn * (wa - 0.25), ya + 1.25, za],
        [sgn * (wb - 0.25), yb + 1.25, zb], [sgn * wb, yb + 1.25, zb], [0, 1, 0]);
      bul.quad([sgn * (wa - 0.25), ya + 1.25, za], [sgn * (wa - 0.25), ya, za],
        [sgn * (wb - 0.25), yb, zb], [sgn * (wb - 0.25), yb + 1.25, zb],
        [-sgn, 0, 0]);
    }
  }
  bul.mesh(g, M.hull);
}

/**
 * The forecastle and the quarterdeck: the weather deck at both ends of her,
 * forward of the hangar's forward bulkhead and abaft its after one.
 *
 * A carrier is not a hull with a flight deck balanced on it. She has an upper
 * deck like anybody else -- it is simply roofed over for two-thirds of her
 * length -- and what shows at the ends is her forecastle, with the ground
 * tackle on it, and her quarterdeck. Without them a ray dropped on her bow
 * lands in the sea.
 */
function endDecks(g) {
  // Laid at the shell's own stations, so the deck edge is the top edge of the
  // plating to the millimetre: sampled anywhere else the two disagree between
  // stations and a ray from below slips up between them. Carried right to the
  // caps, which lean with the stem and the counter and show their backs from
  // above wherever the deck stops short of them.
  const plate = (t0, t1) => {
    const NS = F.stations;
    const i0 = Math.max(0, Math.floor(((t0 + 1) / 2) * NS));
    const i1 = Math.min(NS, Math.ceil(((t1 + 1) / 2) * NS));
    const pos = [];
    const idx = [];
    for (let i = i0; i <= i1; i++) {
      const t = -1 + (2 * i) / NS;
      const y = sheer(t);
      const w = F.shellAt(t, y);
      pos.push(-w, y, F.zAt(t, y), w, y, F.zAt(t, y));
    }
    for (let i = 0; i < i1 - i0; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.deckSteel));
  };
  plate(HANGAR_F / (LOA / 2), 1);
  plate(-1, HANGAR_A / (LOA / 2));
  // And the breakwater across the forecastle, which every Japanese ship has.
  const bw = FD_FWD - 22;
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.26;
    box(g, M.steel, 4.0, 1.4, 0.22, Math.sin(a) * 7.0, sheer(bw / (LOA / 2)) + 0.7,
      bw + Math.cos(a) * 1.6).rotation.y = a;
  }
  // The deck beams under both of them, seen from the hangar and from a hole.
  for (const [z0, z1] of [[HANGAR_F, FD_FWD - 4], [FD_AFT + 4, HANGAR_A]]) {
    for (let z = z0; z <= z1; z += 4) {
      const t = clamp(z / (LOA / 2), -1, 1);
      const w = F.shellAt(t, sheer(t)) - 0.4;
      if (w < 1) continue;
      box(g, M.steelDark, w * 2, 0.34, 0.24, 0, sheer(t) - 0.30, z)
        .userData.inside = true;
    }
  }
}

// -------------------------------------------------------- the flight deck --

/**
 * The flight deck: one armoured slab from the round-up forward to the
 * round-down aft, two hundred and fifty-six metres by forty.
 *
 * Seventy-five millimetres of CNC on twenty of mild steel, screeded over with
 * a latex-and-sawdust compound, and it is the whole reason she exists: she was
 * meant to take a 500 kg bomb on the deck and go on operating aircraft off it.
 */
function flightDeck(g) {
  const N = 128;
  deckSheet(g, M.deck, (z) => fdY(z), true).userData.flightDeck = true;
  // The underside of it, so she is not a sheet of paper seen from below: a
  // carrier's flight deck is a metre and a half of structure and you can see
  // it from any boat alongside.
  deckSheet(g, M.hullDark, (z) => fdY(z) - FD_T, false);
  // The girder closing the two together down both edges, and the two end
  // faces: one continuous ribbon following the deck's own outline, not a run
  // of boxes stepping out one at a time -- where the deck draws in at the
  // ends those step nearly a metre apart and a ray from ahead runs between
  // them the length of the ship.
  const { quad, mesh } = strip();
  for (let i = 0; i < N; i++) {
    const z0 = FD_AFT + ((FD_FWD - FD_AFT) * i) / N;
    const z1 = FD_AFT + ((FD_FWD - FD_AFT) * (i + 1)) / N;
    const w0 = fdHalf(z0);
    const w1 = fdHalf(z1);
    const t0 = fdY(z0);
    const t1 = fdY(z1);
    for (const sgn of [-1, 1]) {
      quad([sgn * w0, t0, z0], [sgn * w0, t0 - FD_T, z0],
        [sgn * w1, t1 - FD_T, z1], [sgn * w1, t1, z1], [sgn, 0, 0]);
    }
  }
  for (const [z, out] of [[FD_AFT, -1], [FD_FWD, 1]]) {
    const w = fdHalf(z);
    const t = fdY(z);
    quad([-w, t, z], [w, t, z], [w, t - FD_T, z], [-w, t - FD_T, z], [0, 0, out]);
  }
  mesh(g, M.hullDark);
  // The transverse girders under it, which is what seventy-five millimetres of
  // deck armour has to be carried on.
  for (let z = FD_AFT + 6; z < FD_FWD - 4; z += 7.2) {
    const w = fdHalf(z) - 0.4;
    const c = wellHalf(z);
    if (c > 0) {
      for (const sgn of [-1, 1]) {
        box(g, M.steelDark, w - c, 0.55, 0.26, sgn * (w + c) / 2,
          fdY(z) - FD_T + 0.32, z);
      }
    } else {
      box(g, M.steelDark, w * 2, 0.55, 0.26, 0, fdY(z) - FD_T + 0.32, z);
    }
  }
  // And the pillars that carry the overhang at both ends, which is where a
  // deck this heavy needs them and where she actually had them.
  for (const z of [-124, -116, -106, 96, 106, 114]) {
    for (const sgn of [-1, 1]) {
      const w = Math.min(fdHalf(z) - 1.4, sideTop(z) + 0.3);
      const t = clamp(z / (LOA / 2), -1, 1);
      const foot = sheer(t);
      cyl(g, M.steelDark, 0.42, 0.42, HANGAR_TOP - foot,
        sgn * w, (HANGAR_TOP + foot) / 2, z, 8);
    }
  }
  // The expansion joints across her.
  //
  // Seventy-five millimetres of armour laid over two hundred and sixty metres
  // of hull has to be free to work, so the deck is in panels with a joint
  // between each pair, and every drawing of her shows them as a line right
  // across from edge to edge every dozen metres or so. They are the one thing
  // that gives a flight deck its length when you look down it.
  for (let z = FD_AFT + 12; z < FD_FWD - 8; z += 12.4) {
    if (wellHalf(z) > 0) continue;
    box(g, M.deckDark, fdHalf(z) * 2, 0.07, 0.34, 0, fdY(z) + 0.035, z);
  }
  deckMarks(g);
  arrestorGear(g);
  palisades(g);
}

/**
 * Her deck markings, which are the thing a carrier is recognised by and the
 * thing this model had backwards.
 *
 * The red and white bars go aft. They are there so that a pilot coming up the
 * deck at ninety knots, with his own nose blanking the last forty metres of
 * it, can see where the deck stops -- and he is coming aboard over the stern.
 * Forward there is no red at all: there is the centreline he runs out on and
 * the two converging guide lines that close on it, which is what he lines up
 * between going off.
 */
function deckMarks(g) {
  const y0 = (z) => fdY(z) + 0.05;
  const line = (m, w, len, x, z, lift = 0) =>
    box(g, m, w, 0.06, len, x, y0(z) + 0.01 + lift, z);

  // The centreline, dashed, the whole length of the landing and range area --
  // and not across the two wells, because paint laid over a hole is paint
  // hanging in the air the moment the lift goes down.
  for (let z = FD_AFT + 24; z < FD_FWD - 30; z += 6.2) {
    if (wellHalf(z) > 0 || wellHalf(z + 1.8) > 0 || wellHalf(z - 1.8) > 0) continue;
    line(M.stripe, 0.55, 3.6, 0, z);
  }
  // The two long lines down either side, inboard of the deck edge: what a
  // pilot lines up on and what keeps a wheel off the girder in a crosswind.
  for (let z = FD_AFT + 18; z < FD_FWD - 18; z += 5) {
    for (const sgn of [-1, 1]) {
      const w = (fdHalf(z) + fdHalf(z + 5)) / 2 - 2.6;
      line(M.stripe, 0.35, 5.1, sgn * w, z + 2.5, 0.005);
    }
  }
  // The landing area, marked out aft: a long box a pilot sets her down inside,
  // with a bar across each end of it.
  const la0 = FD_AFT + 22;
  const la1 = FD_AFT + 104;
  for (const sgn of [-1, 1]) {
    for (let z = la0; z < la1; z += 6) {
      const w = Math.min(fdHalf(z), fdHalf(z + 6)) - 6.4;
      line(M.stripe, 0.5, 6.1, sgn * w, z + 3, 0.01);
    }
  }
  for (const z of [la0, la1]) {
    line(M.stripe, (fdHalf(z) - 6.4) * 2, 0.5, 0, z, 0.01);
  }

  // The barred round-down aft: red and white across the whole width of the
  // deck, from the after end forward over the whole of the fall-away.
  const rd = FD_AFT + 21;
  const bars = 13;
  for (let i = 0; i < bars; i++) {
    const z = FD_AFT + (i * (rd - FD_AFT)) / bars;
    const zm = z + (rd - FD_AFT) / (2 * bars);
    line(i % 2 ? M.stripeRed : M.stripe, fdHalf(zm) * 2, (rd - FD_AFT) / bars + 0.05,
      0, zm, 0.01);
  }
  // The white bar across the forward edge of the barred area, which is where
  // a pilot is told the deck begins to fall away.
  line(M.stripe, fdHalf(rd) * 2, 0.7, 0, rd, 0.02);

  // Forward: the take-off guide. Two lines converging on the centreline over
  // the last thirty metres of deck, with the centreline running out between
  // them to the round-up. No red anywhere near it.
  //
  // One straight run each side, laid as a single line of segments all turned
  // through the same angle, because a converging line is a straight line: cut
  // into pieces that each get their own heading it comes out as a scatter of
  // dashes wandering up the deck, which is what it was.
  const g0 = FD_FWD - 36;
  const g1 = FD_FWD - 5;
  const SPREAD = 7.6;
  const lean = Math.atan2(SPREAD, g1 - g0);
  const seg = (g1 - g0) / Math.cos(lean) / 11;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const u = (i + 0.5) / 11;
      const z = g0 + (g1 - g0) * u;
      const mark = box(g, M.stripe, 0.42, 0.06, seg * 0.72,
        sgn * SPREAD * (1 - u), y0(z) + 0.02, z);
      mark.rotation.y = -sgn * lean;
    }
  }
  // The centreline running out between them to the round-up.
  for (let z = FD_FWD - 32; z < FD_FWD - 3; z += 4.4) {
    line(M.stripe, 0.55, 2.6, 0, z, 0.02);
  }

  // The outline of each lift, painted round the opening so nobody walks into
  // a hole the width of the deck in the dark.
  for (const lz of [LIFT_F, LIFT_A]) {
    const pts = liftOutline(LIFT_HW + 0.75, LIFT_HD + 0.75);
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      const mk = box(g, M.stripe, 0.34, 0.06, len,
        (ax + bx) / 2, y0(lz) + 0.02, lz + (az + bz) / 2);
      mk.rotation.y = Math.atan2(bx - ax, bz - az);
    }
  }
}

/**
 * Fifteen arrestor wires across the after third and three crash barriers.
 *
 * The barriers are what stands between an aircraft that has taken all fifteen
 * wires and the deck park, and they are rigged to stop seven and a half tonnes
 * -- which is what a Ryusei with a torpedo on weighs.
 */
function arrestorGear(g) {
  for (let i = 0; i < 15; i++) {
    const z = FD_AFT + 26 + i * 5.2;
    const w = fdHalf(z) - 3.2;
    // A wire is rove between two sheaves at the deck edge and it does not
    // cross a well: where one would, it is the deck that wins.
    if (wellHalf(z) > 0) continue;
    box(g, M.steelDark, w * 2, 0.10, 0.10, 0, fdY(z) + 0.10, z);
    // The sheaves the wire runs over at each end of it, let into the deck.
    for (const sgn of [-1, 1]) {
      cyl(g, M.gunDark, 0.24, 0.24, 0.12, sgn * w, fdY(z) + 0.06, z, 10);
    }
  }
  for (const z of [-14, -6, 2]) {
    const w = fdHalf(z) - 3.0;
    for (const h of [0.55, 1.15, 1.75]) {
      box(g, M.steelDark, w * 2, 0.08, 0.08, 0, fdY(z) + h, z);
    }
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.13, 0.16, 2.0, sgn * w, fdY(z) + 1.0, z, 8);
      box(g, M.gunDark, 0.5, 0.35, 0.7, sgn * (w + 0.4), fdY(z) + 0.18, z);
    }
  }
}

/**
 * The palisades: the hinged wind breaks down both deck edges, lying flat.
 *
 * They are stood up to shelter a ranged aircraft from the wind over the deck
 * and they lie in the deck the rest of the time, which is where they are here
 * -- flush plates with their hinges showing, because a carrier's deck edge is
 * not a bare strip and a bare strip is what says "model".
 */
function palisades(g) {
  for (let z = FD_AFT + 34; z < FD_FWD - 30; z += 9.5) {
    for (const sgn of [-1, 1]) {
      const w = fdHalf(z) - 1.3;
      box(g, M.deckDark, 1.9, 0.07, 8.6, sgn * w, fdY(z) + 0.035, z);
      for (const dz of [-3.2, 0, 3.2]) {
        box(g, M.steelDark, 2.1, 0.09, 0.22, sgn * w, fdY(z) + 0.05, z + dz);
      }
    }
  }
  // Tie-down rings, in the lines they were actually laid in: a grid over the
  // whole of the range and landing area.
  for (let z = FD_AFT + 30; z < FD_FWD - 24; z += 7.5) {
    for (let k = -2; k <= 2; k++) {
      const w = (fdHalf(z) - 3.4) * (k / 2);
      if (Math.abs(w) < wellHalf(z) + 0.4) continue;
      cyl(g, M.gunDark, 0.16, 0.16, 0.07, w, fdY(z) + 0.04, z, 8);
    }
  }
}

// ------------------------------------------------------------- the hangar --

/**
 * The hangar: one enclosed deck under the flight deck, a hundred and
 * sixty-three metres by thirty-four and five metres in the clear, with the
 * sides plated in, the lift wells cut through it and the aircraft ranged
 * along it.
 *
 * Japanese practice is a closed hangar, which is why her sides are plating
 * rather than the open roller-shutter galleries an American carrier has -- and
 * why a bomb that got in among her aircraft had nowhere to vent. One deck
 * rather than two, which is a stability decision: she is carrying seventy-five
 * millimetres of armour six metres higher up than anybody else.
 */
function hangar(g) {
  const z0 = HANGAR_A;
  const z1 = HANGAR_F;
  const N = 60;
  // The hangar deck itself, and the deckhead over it.
  const deck = sheet(g, M.deckSteel, z0, z1, hangarHalf, () => HANGAR, N);
  deck.userData.inside = true;
  const head = sheet(g, M.steelDark, z0, z1, hangarHalf, () => HANGAR_TOP, N, false);
  head.userData.inside = true;

  // The sides, plated from the hangar deck to the deckhead. Drawn both ways
  // round -- a sheet facing inboard for the man standing in the hangar and one
  // facing outboard for the hole in her side that lets you see it -- because a
  // single-sided sheet is a wall from one side and nothing at all from the
  // other.
  for (const out of [1, -1]) {
    const w = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        w.quad([sgn * hangarHalf(za), HANGAR, za], [sgn * hangarHalf(za), HANGAR_TOP, za],
          [sgn * hangarHalf(zb), HANGAR_TOP, zb], [sgn * hangarHalf(zb), HANGAR, zb],
          [sgn * out, 0, 0]);
      }
    }
    const m = w.mesh(g, out > 0 ? M.hull : M.steelDark);
    if (m) m.userData.inside = out < 0;
  }
  // The two ends of it, which are what makes it a closed hangar.
  for (const [z, out] of [[z0, -1], [z1, 1]]) {
    for (const face of [1, -1]) {
      const e = strip();
      const w = hangarHalf(z);
      e.quad([-w, HANGAR, z], [w, HANGAR, z], [w, HANGAR_TOP, z], [-w, HANGAR_TOP, z],
        [0, 0, out * face]);
      const m = e.mesh(g, face > 0 ? M.hull : M.steelDark);
      if (m) m.userData.inside = face < 0;
    }
  }
  // The frames down both sides, which is the whole look of a hangar from
  // inside it: a rib every four metres with the deckhead beams across.
  for (let z = z0 + 5; z < z1 - 3; z += 4.4) {
    const w = hangarHalf(z);
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.30, HANGAR_TOP - HANGAR, 0.42,
        sgn * (w - 0.18), (HANGAR + HANGAR_TOP) / 2, z).userData.inside = true;
    }
    box(g, M.steelDark, w * 2 - 0.5, 0.36, 0.30, 0, HANGAR_TOP - 0.22, z)
      .userData.inside = true;
  }
  // Four rolling fire curtains across her, which is what a closed hangar has
  // instead of open sides -- and which on the night she sank were never
  // tested, like everything else about her.
  for (const z of [56, 16, -28, -68]) {
    if (z > z1 || z < z0) continue;
    const w = hangarHalf(z) - 0.4;
    box(g, M.steelDark, w * 2, 0.55, 0.28, 0, HANGAR_TOP - 0.55, z)
      .userData.inside = true;
    for (const sgn of [-1, 1]) {
      box(g, M.gunDark, 0.34, 0.9, 0.5, sgn * w, HANGAR_TOP - 0.7, z)
        .userData.inside = true;
    }
  }
  // The deck lighting down the middle of the deckhead, and the ventilation
  // trunks along the sides: large fans, because a closed hangar full of
  // running engines is a gas chamber otherwise.
  for (let z = z0 + 6; z < z1 - 4; z += 7) {
    box(g, M.canvas, 0.7, 0.18, 2.4, 0, HANGAR_TOP - 0.62, z).userData.inside = true;
  }
  for (const sgn of [-1, 1]) {
    for (let z = z0 + 8; z < z1 - 6; z += 12) {
      const w = hangarHalf(z) - 0.55;
      box(g, M.steel, 0.65, 0.65, 10.5, sgn * w, HANGAR_TOP - 1.0, z)
        .userData.inside = true;
    }
  }
  // The workshops, the ready-use lockers and the ordnance stowage along the
  // sides: a hangar is not an empty box, it is a shed with the shipwrights'
  // and armourers' shops built into both walls of it.
  for (const sgn of [-1, 1]) {
    for (const [z, len] of [[62, 10], [34, 12], [-8, 14], [-44, 12], [-74, 10]]) {
      const w = hangarHalf(z) - 1.35;
      if (w < 3) continue;
      box(g, M.steel, 2.5, 2.9, len, sgn * w, HANGAR + 1.45, z).userData.inside = true;
      box(g, M.cave, 0.1, 1.9, 1.1, sgn * (w - 1.3), HANGAR + 0.95, z)
        .userData.inside = true;
    }
  }
  // The bomb and torpedo lifts up from the magazines, on the centreline
  // between the two aircraft lifts.
  for (const z of [26, -32]) {
    box(g, M.steelDark, 2.2, 1.6, 2.2, 0, HANGAR + 0.8, z).userData.inside = true;
    box(g, M.cave, 1.5, 0.1, 1.5, 0, HANGAR + 0.02, z).userData.inside = true;
  }
}

/**
 * Her air group, ranged along the hangar with their wings folded, and a strike
 * ranged aft on the deck with theirs spread.
 *
 * Its own builder, because an aeroplane is not a piece of ship: two of them
 * parked either side of the centreline are the same aeroplane twice, not a
 * mirrored pair, and nothing about the way she was built should be judged on
 * where the handling party happened to leave them.
 *
 * Marked as inside, so the weld keeps them when the deck over them is shot
 * away -- a bomb through her flight deck ought to find aircraft under it.
 */
function airGroup(g) {
  const park = [];
  // Four abreast where the hangar is at its full thirty-four metres, two
  // abreast where it narrows aft. Forty-seven machines is what she was to
  // carry and what is ranged here, allowing for the two lift wells.
  for (const z of [70, 62, 40, 32, 24, 4, -4, -12, -34, -42, -50, -76]) {
    const w = hangarHalf(z);
    const spots = w > 15.5 ? [-11.8, -4.2, 4.2, 11.8] : [-5.2, 5.2];
    for (const x of spots) {
      if (Math.abs(x) > w - 3.2) continue;
      if (Math.abs(z - LIFT_F) < LIFT_HD + 1 || Math.abs(z - LIFT_A) < LIFT_HD + 1) continue;
      park.push([x, z]);
    }
  }
  park.forEach(([x, z], i) => {
    // Wings folded, because that is how an aircraft is struck below: spread,
    // a Tenzan is fifteen metres across and two of them abreast are wider than
    // the space they are parked in.
    const a = i % 3 === 0
      ? tenzan(g, x, HANGAR + 1.5, z, x < 0 ? 0.10 : -0.10, true, false, {})
      : i % 3 === 1
        ? suisei(g, x, HANGAR + 1.5, z, x < 0 ? 0.10 : -0.10, true, {})
        : zero(g, x, HANGAR + 1.5, z, x < 0 ? 0.10 : -0.10, true, {});
    // Only the folded set is kept. Every one of these machines is built with
    // both -- spread to fly and folded to strike below -- and the weld bakes
    // whatever is in the tree whether or not it is being drawn, so an aircraft
    // parked in the hangar with her spread wings still on her is eleven metres
    // of wing welded through the ship's side.
    a.userData.wings?.spread?.removeFromParent();
    a.traverse((o) => { o.userData.inside = true; });
  });

  // And the deck park: a strike ranged aft with wings spread, which is how a
  // carrier actually looks from the air. They are staggered either side of the
  // centreline in the order they would go off -- fighters first, because they
  // need the least deck -- and angled a few degrees so a slipstream does not
  // blow straight into the machine behind.
  //
  // Ranged clear of three things: the spot a returning aircraft picks up a
  // wire and rolls up to, the after lift well, and the crash barriers. A deck
  // park drawn without looking at those is a strike parked on a hole and an
  // aeroplane landing through it.
  const ranged = [
    [-6.4, -98, 'zero'], [6.8, -90, 'zero'], [-7.0, -80, 'zero'],
    [6.6, -72, 'zero'], [-7.2, -50, 'suisei'], [7.0, -42, 'suisei'],
    [-7.4, -34, 'suisei'], [7.2, -24, 'tenzan'],
  ];
  for (const [x, z, kind] of ranged) {
    const y = fdY(z) + 0.12;
    const yaw = x < 0 ? 0.09 : -0.09;
    const a = kind === 'tenzan'
      ? tenzan(g, x, y, z, yaw, false, false, {})
      : kind === 'suisei'
        ? suisei(g, x, y, z, yaw, false, {})
        : zero(g, x, y, z, yaw, false, {});
    // The opposite of the hangar park: these are ranged for flying off, so it
    // is the folded set that has to go or she carries both at once.
    a.userData.wings?.stowed?.removeFromParent();
  }
}

/** The lift wells, cut through the flight deck, with their guide rails. */
function liftWells(g) {
  for (const z of [LIFT_F, LIFT_A]) {
    const pts = liftOutline(WELL_HW, WELL_HD, WELL_CH);
    // The coaming round the opening, following the octagon she was cut to.
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az) + 0.2;
      const c = box(g, M.steelDark, 0.42, 0.52, len,
        (ax + bx) / 2, FD + 0.22, z + (az + bz) / 2);
      c.rotation.y = Math.atan2(bx - ax, bz - az);
      // And the trunk down to the hangar deck, so the well is a well and not
      // a hole with the sea visible through it.
      const trunk = box(g, M.steelDark, 0.26, HANGAR_TOP - HANGAR, len,
        (ax + bx) / 2, (HANGAR_TOP + HANGAR) / 2, z + (az + bz) / 2);
      trunk.rotation.y = c.rotation.y;
      trunk.userData.inside = true;
    }
    // The guide rails the lift's shoes run in, four to a well.
    for (const sgn of [-1, 1]) {
      for (const dz of [-LIFT_HD + 1.6, LIFT_HD - 1.6]) {
        box(g, M.steelDark, 0.32, FD - HANGAR, 0.32,
          sgn * (LIFT_HW + 0.12), (FD + HANGAR) / 2, z + dz);
      }
    }
  }
}

/**
 * The two lifts, which are the only things on her that move but the guns.
 *
 * Each is fifteen metres by fourteen and rated at seven and a half tonnes --
 * enough for a Ryusei with a torpedo slung. Each is its own group so the
 * welder leaves it alone, and each is a plated octagonal platform with its
 * own screed, its coaming and the guide shoes that ride the rails in the
 * trunk.
 */
function elevators(g) {
  const lifts = [];
  [LIFT_F, LIFT_A].forEach((z, i) => {
    const lift = new THREE.Group();
    lift.position.set(0, FD, z);
    lift.userData.dynamic = true;
    g.add(lift);
    const pts = liftOutline(LIFT_HW - 0.18, LIFT_HD - 0.18);
    // The platform: an octagonal plate on its own grillage.
    const pos = [];
    const idx = [];
    for (const [px, pz] of pts) pos.push(px, 0, pz);
    for (const [px, pz] of pts) pos.push(px, -0.55, pz);
    const n = pts.length;
    const hubTop = pos.length / 3;
    pos.push(0, 0, 0);
    const hubBot = pos.length / 3;
    pos.push(0, -0.55, 0);
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      idx.push(hubTop, k, j);
      idx.push(hubBot, n + j, n + k);
      idx.push(k, n + k, n + j, k, n + j, j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    lift.add(new THREE.Mesh(geo, M.deck));
    // The grillage under it and the shoes that ride the rails.
    for (let k = -3; k <= 3; k++) {
      box(lift, M.steelDark, 0.28, 0.42, 2 * LIFT_HD - 2.6, k * 2.1, -0.75, 0);
    }
    box(lift, M.steelDark, 2 * LIFT_HW - 1.4, 0.34, 0.5, 0, -0.98, 0);
    for (const s of [-1, 1]) {
      for (const dz of [-LIFT_HD + 1.6, LIFT_HD - 1.6]) {
        box(lift, M.steel, 0.5, 0.65, 0.55, s * (LIFT_HW - 0.34), -0.5, dz);
      }
    }
    // The safety rails round the platform, which drop flat when it is at the
    // flight deck and stand up when it is down the well. Drawn down, because
    // that is what the deck looks like for all but a few seconds at a time.
    for (const [px, pz] of pts) {
      box(lift, M.steelDark, 0.55, 0.10, 0.55, px * 0.94, 0.06, pz * 0.94);
    }
    mergeStatic(lift);
    lifts.push({ group: lift, phase: i / 2 });
  });
  return lifts;
}

// ------------------------------------------------------------- the island --

/**
 * Where a light mounting lives, off its own station in the class data.
 *
 * Three places, and each of them is a different platform at a different
 * height: 'edge' is a tub hung under the flight deck's overhang down both
 * sides, 'end' is one standing on the flight deck itself right forward or
 * right aft where there is no overhang left to hang anything from, and
 * 'island' is one on the island's own galleries. Everything that builds a
 * tub, a floor or a gun asks this, so the floor a gun is put on and the floor
 * the model draws are the same number -- a gun floating a foot above its own
 * platform is the commonest way a model of a warship goes wrong.
 */
function mountKind(spec) {
  // Anything the class data has already named belongs where it says.
  if (spec.where) return spec.where;
  // And everything else is a sponson scalloped into her deck edge, wherever
  // that edge happens to be at that station. There is no third case: nothing
  // stands on her runway.
  return 'edge';
}

/** A deckhouse plan shifted on to the island's own centreline. */
function islePlan(hw, zFront, zBack, nose = hw * 0.85, tail = hw * 0.5) {
  return planHouse({ arc: 7, hw, nose, tail, zFront, zBack })
    .map(([x, z]) => [ISL_X + x, z]);
}

/**
 * A guardrail round a plan outline: stanchions at the corners and three
 * courses of wire between them.
 *
 * Every platform on a bridge tower carries one, and a tower without them is
 * a stack of blocks. `rail` above runs along a hull, which is symmetrical
 * about the centreline; an island is not, so it needs its own.
 */
function planRail(g, m, pts, y, h = 1.05, step = 1.9) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const u = j / k;
      cyl(g, m, 0.045, 0.045, h, ax + (bx - ax) * u, y + h / 2, az + (bz - az) * u, 5);
    }
    for (const f of [0.4, 0.72, 1.0]) {
      const w = box(g, m, 0.05, 0.05, len, (ax + bx) / 2, y + h * f, (az + bz) / 2);
      w.rotation.y = Math.atan2(bx - ax, bz - az);
    }
  }
}

/**
 * One level of the island: the house, the deck standing out round the top of
 * it, and the rail round the deck.
 *
 * A bridge tower is not a stack of boxes. Every level is a house with a deck
 * a foot or two wider than it laid on top, and that lip with its rail round it
 * is most of what the eye reads as "warship bridge" -- take it away and the
 * whole structure goes flat.
 */
function isleLevel(g, y, h, hw, zF, zB, nose, tail, lip = 0.55) {
  const foot = islePlan(hw, zF, zB, nose, tail);
  const head = islePlan(hw - 0.06, zF - 0.1, zB + 0.1, nose, tail);
  loftShape(g, M.steel, [{ pts: foot, y }, { pts: head, y: y + h }], { cap: false });
  const rim = islePlan(hw + lip, zF + lip, zB - lip, nose + lip * 0.6, tail + lip * 0.6);
  loftShape(g, M.steelDark, [
    { pts: rim, y: y + h },
    { pts: rim, y: y + h + 0.22 },
  ], { cap: true, floor: true });
  return rim;
}

/**
 * The island, and the funnel that is part of it.
 *
 * Small, as a Japanese island is, and standing on the starboard deck edge a
 * little forward of amidships. The arrangement is Taiho's, copied exactly: the
 * bridge levels forward, the funnel immediately abaft them and canted
 * twenty-six degrees outboard so the smoke clears the deck, and the mast on
 * top of that. Nobody else built a carrier this way and it is the one thing
 * about her that says at a glance which navy she belongs to.
 */
function island(g) {
  const z = ISL_Z;
  const x = ISL_X;

  // The casing the island and the funnel both stand on, which is the top of
  // the uptakes coming up out of the boiler rooms, and the gallery round the
  // edge of it that her own light guns stand on.
  loftShape(g, M.steel, [
    { pts: islePlan(4.8, z + 15.6, z - 21.0, 3.2, 2.6), y: FD - 0.9 },
    { pts: islePlan(4.7, z + 15.4, z - 20.8, 3.2, 2.6), y: FD + 0.8 },
  ], { cap: true, floor: false });
  const gallery = islePlan(5.5, z + 16.3, z - 21.6, 3.6, 2.8);
  loftShape(g, M.steelDark, [
    { pts: gallery, y: FD + 0.66 },
    { pts: gallery, y: FD + 0.90 },
  ], { cap: true, floor: false });
  // The knees under the gallery, which is what carries it off the casing.
  for (let i = 0; i < gallery.length; i += 2) {
    const [px, pz] = gallery[i];
    const kn = box(g, M.steelDark, 1.1, 0.8, 0.22, x + (px - x) * 0.8, FD + 0.18, pz);
    kn.rotation.z = Math.sign(px - x) * 0.55;
  }

  // Level one: the air operations room and the flag office, with the ship's
  // office behind them. Her signal platform is the deck over it.
  const I1 = FD + 0.8;
  const R1 = isleLevel(g, I1, 3.4, 3.9, z + 10.4, z - 12.6, 2.9, 2.2, 0.60);
  isleWindows(g, I1 + 2.15, 3.95, z + 10.2, z - 6.0, 6);
  isleDoor(g, I1, z - 12.3, 3.9);
  planRail(g, M.steelDark, R1, I1 + 3.62);
  // The flag lockers and the halyard cleats along the signal deck.
  for (let i = 0; i < 5; i++) {
    box(g, M.steelDark, 0.9, 0.85, 1.05, x + 3.4, I1 + 4.06, z - 8.0 + i * 1.9);
  }

  // Level two: the navigating bridge and the chart house.
  const I2 = I1 + 3.4;
  const R2 = isleLevel(g, I2, 3.2, 3.5, z + 9.6, z - 11.8, 2.7, 2.0, 0.55);
  isleWindows(g, I2 + 2.0, 3.55, z + 9.4, z - 5.0, 5);
  isleDoor(g, I2, z - 11.5, 3.5);
  planRail(g, M.steelDark, R2, I2 + 3.42);

  // Level three: the compass platform, with its wings out over the deck edge
  // and a pelorus on each of them. It is the level she is conned from and it
  // is the one that has to read as a bridge.
  const I3 = I2 + 3.2;
  const R3 = isleLevel(g, I3, 3.0, 3.1, z + 8.4, z - 10.8, 2.5, 1.8, 0.50);
  isleWindows(g, I3 + 1.9, 3.15, z + 8.2, z - 4.0, 5);
  planRail(g, M.steelDark, R3, I3 + 3.22);
  for (const dz of [z + 5.6, z - 4.6]) {
    const wing = [
      [x - 3.3, dz + 1.3], [x + 3.3, dz + 1.3], [x + 3.3, dz - 1.3], [x - 3.3, dz - 1.3],
    ];
    loftShape(g, M.steel, [
      { pts: wing, y: I3 + 2.98 }, { pts: wing, y: I3 + 3.2 },
    ], { cap: true, floor: true });
    planRail(g, M.steelDark, wing, I3 + 3.2, 0.95);
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.11, 0.13, 1.1, x + sgn * 2.5, I3 + 3.75, dz, 8);
      cyl(g, M.gunDark, 0.24, 0.24, 0.16, x + sgn * 2.5, I3 + 4.35, dz, 10);
    }
  }
  // The searchlight control and the voice pipes on the compass platform.
  cyl(g, M.steelDark, 0.22, 0.26, 0.95, x - 1.6, I3 + 3.7, z + 3.2, 10);
  cyl(g, M.gunDark, 0.34, 0.34, 0.34, x - 1.6, I3 + 4.34, z + 3.2, 12);
  for (const dx of [-0.8, 0.8]) {
    cyl(g, M.steel, 0.09, 0.09, 1.2, x + dx, I3 + 3.82, z + 1.0, 8);
  }

  // The air defence platform: the topmost deck of the island proper, with the
  // two Type 94 directors that lay her 12.7 cm, the 12 cm binoculars round the
  // rail, and the after director looking over the funnel.
  const I4 = I3 + 3.0;
  const ADP = islePlan(3.4, z + 7.0, z - 9.2, 2.8, 2.2);
  loftShape(g, M.steel, [
    { pts: ADP, y: I4 - 0.24 }, { pts: ADP, y: I4 },
  ], { cap: true, floor: true });
  planRail(g, M.steelDark, ADP, I4, 1.1);
  for (const dz of [5.0, -6.2]) {
    const d = director(g, M, x, I4 + 0.1, z + dz, 1.35, 1.75);
    rangefinder(d, M, 0, 2.2, 0, 4.5);
  }
  // The 12 cm binoculars on their pedestals, which is what a Japanese ship
  // actually searches the sky with -- the directors are for shooting.
  for (const [dx, dz] of [[2.4, 1.6], [-2.4, 1.6], [2.4, -2.6], [-2.4, -2.6]]) {
    cyl(g, M.gunDark, 0.13, 0.17, 1.0, x + dx, I4 + 0.62, z + dz, 8);
    box(g, M.gunDark, 0.46, 0.20, 0.22, x + dx, I4 + 1.20, z + dz);
  }

  // The tower over the after end of the platform, carrying the main air-search
  // set: a Type 21 mattress on its own training drum.
  const I5 = I4;
  cyl(g, M.steel, 1.5, 1.75, 3.8, x, I5 + 1.9, z - 4.4, 14);
  for (let i = 0; i < 4; i++) {
    box(g, M.steelDark, 0.12, 3.8, 0.12,
      x + Math.sin(i * 1.571 + 0.79) * 1.6, I5 + 1.9,
      z - 4.4 + Math.cos(i * 1.571 + 0.79) * 1.6);
  }
  const top = director(g, M, x, I5 + 3.8, z - 4.4, 1.35, 1.5);
  typeTwentyOne(top, M, 0, 2.5, 0.25, 0, 3.6, 2.2);

  funnel(g);
  isleMast(g);
  isleFittings(g);
}

/** A watertight door in the after face of a level, with its clips. */
function isleDoor(g, y, dz, hw) {
  box(g, M.steelDark, 1.05, 1.95, 0.12, ISL_X + hw * 0.34, y + 1.0, dz);
  box(g, M.cave, 0.86, 1.72, 0.06, ISL_X + hw * 0.34, y + 1.0, dz - 0.05);
  for (const dy of [-0.5, 0.5]) {
    box(g, M.bright, 0.1, 0.1, 0.1, ISL_X + hw * 0.34 + 0.42, y + 1.0 + dy, dz - 0.1);
  }
}

/**
 * One of the island's own gun platforms: a tub standing on the casing, on the
 * gallery bracketed round it, with the ready-use lockers and the rail.
 */
function isleTub(g, x, z, r) {
  const floor = FD + 0.9;
  const sgn = Math.sign(x - ISL_X) || 1;
  cyl(g, M.steel, r, r + 0.15, 1.5, x, floor + 0.15, z, 16);
  cyl(g, M.steelDark, r + 0.15, r + 0.15, 0.22, x, floor - 0.72, z, 16);
  // The knees back into the island's own plating, which is what holds it up.
  for (const dz of [-1.5, 1.5]) {
    const knee = box(g, M.steelDark, 2.2, 0.85, 0.24, x - sgn * 1.1, floor - 1.25,
      z + dz);
    knee.rotation.z = -sgn * 0.5;
  }
  box(g, M.steelDark, 0.5, 0.55, 1.1, x - sgn * (r - 0.35), floor + 0.5, z);
}

/** A row of bridge windows down both sides of a level and across its face. */
function isleWindows(g, y, hw, zFront, zBack, n) {
  // One strip of glass a side with the mullions across it, not a row of square
  // panes: a bridge window is a continuous band and a row of separate squares
  // is a wardroom.
  for (const sgn of [-1, 1]) {
    box(g, M.glass, 0.10, 0.95, zFront - zBack, ISL_X + sgn * hw, y,
      (zFront + zBack) / 2);
    for (let i = 0; i <= n; i++) {
      const dz = zBack + ((zFront - zBack) * i) / n;
      box(g, M.steel, 0.13, 1.05, 0.16, ISL_X + sgn * hw, y, dz);
    }
    // The sill and the head of the band, which is what gives it an edge.
    for (const dy of [-0.56, 0.56]) {
      box(g, M.steel, 0.14, 0.18, zFront - zBack, ISL_X + sgn * hw, y + dy,
        (zFront + zBack) / 2);
    }
  }
  box(g, M.glass, hw * 1.7, 0.95, 0.10, ISL_X, y, zFront + 0.04);
  for (let i = -2; i <= 2; i++) {
    box(g, M.steel, 0.16, 1.05, 0.13, ISL_X + i * (hw * 0.82) / 2, y, zFront + 0.04);
  }
}

/**
 * The funnel: abaft the island, canted twenty-six degrees outboard, capped,
 * with the smoke hood over the top of it.
 *
 * It is not a separate structure. On Taiho and on Shinano the uptakes are
 * trunked into the island and come out of the back of it, leaning out over the
 * water so the smoke goes away from the deck instead of lying on it. It is the
 * single most recognisable thing about either ship.
 */
function funnel(g) {
  const f = new THREE.Group();
  f.position.set(ISL_X, FD + 0.6, ISL_Z - 15.5);
  f.rotation.z = S * -0.454;   // twenty-six degrees outboard
  const H = 13.6;
  // The casing, oval in section with the long axis fore and aft.
  cyl(f, M.steel, 3.0, 3.5, H, 0, H / 2, 0, 20).scale.set(1, 1, 0.76);
  // The grating cap over the mouth, and the rain hood round it.
  cyl(f, M.gunDark, 3.6, 3.6, 0.32, 0, H + 0.16, 0, 20).scale.set(1, 1, 0.78);
  for (let i = -3; i <= 3; i++) {
    box(f, M.gunDark, 6.4, 0.18, 0.30, 0, H - 0.45, i * 0.62);
  }
  // The steam pipes and the siren bracket up its after face, and the two
  // hoops that stiffen it.
  cyl(f, M.steelDark, 0.28, 0.28, H * 0.92, 0, H * 0.46, -2.55, 8);
  cyl(f, M.steelDark, 0.20, 0.20, H * 0.80, 0.9, H * 0.42, -2.45, 8);
  cyl(f, M.gunDark, 0.34, 0.34, 0.70, 0, H * 0.94, -2.55, 10);
  for (const h of [H * 0.34, H * 0.68]) {
    cyl(f, M.steelDark, 3.3, 3.3, 0.20, 0, h, 0, 20).scale.set(1, 1, 0.78);
  }
  // The platform round the funnel at two-thirds of its height, which is where
  // the sweeps get at it, with its rail.
  const PL = H * 0.62;
  cyl(f, M.steelDark, 4.05, 4.05, 0.22, 0, PL, 0, 20).scale.set(1, 1, 0.80);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    cyl(f, M.steelDark, 0.045, 0.045, 0.9,
      Math.sin(a) * 3.85, PL + 0.56, Math.cos(a) * 3.0, 5);
  }
  // And a vertical ladder up its after face from the casing to that platform.
  for (let i = 0; i < Math.round(PL / 0.34); i++) {
    cyl(f, M.bright, 0.03, 0.03, 0.56, 0, 0.7 + i * 0.34, -2.95, 5)
      .rotation.z = Math.PI / 2;
  }
  for (const dx of [-0.28, 0.28]) {
    box(f, M.bright, 0.07, PL - 0.4, 0.07, dx, PL / 2 + 0.5, -2.95);
  }
  g.add(f);
  // The fairing between the funnel and the island, which is what makes the two
  // of them one structure rather than a chimney standing beside a bridge.
  //
  // Carried up to the height of the bridge levels rather than stopping at the
  // casing: on Taiho and on Shinano the uptakes are trunked into the back of
  // the island and the funnel grows out of it, and a fairing that dies away at
  // deck level leaves a chimney standing in a gap behind a tower.
  loftShape(g, M.steel, [
    { pts: islePlan(3.9, ISL_Z - 8.0, ISL_Z - 19.0, 2.6, 2.2), y: FD + 0.8 },
    { pts: islePlan(3.5, ISL_Z - 8.6, ISL_Z - 18.6, 2.4, 2.1), y: FD + 7.4 },
    { pts: islePlan(3.0, ISL_Z - 9.2, ISL_Z - 17.6, 2.1, 1.9), y: FD + 10.6 },
  ], { cap: true });
}

/**
 * Her mast: a tripod on the after end of the island carrying the Type 13, the
 * signal yards and the aerial spreaders.
 */
function isleMast(g) {
  const x = ISL_X;
  const z = ISL_Z - 4.4;
  const foot = FD + 13.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = cyl(g, M.steelDark, 0.14, 0.20, 9.0,
      x + Math.sin(a) * 0.55, foot + 4.5, z + Math.cos(a) * 0.55, 8);
    leg.rotation.z = -Math.sin(a) * 0.055;
    leg.rotation.x = Math.cos(a) * 0.055;
  }
  cyl(g, M.steelDark, 0.10, 0.14, 5.0, x, foot + 11.0, z, 8);
  for (const [dy, span] of [[6.6, 7.6], [9.4, 5.2]]) {
    box(g, M.steelDark, span, 0.11, 0.11, x, foot + dy, z);
    for (const sgn of [-1, 1]) {
      cyl(g, M.bright, 0.05, 0.05, 0.22, x + sgn * span / 2, foot + dy - 0.16, z, 6);
    }
  }
  // The Type 13 lashed to the mast, which is how every late-war Japanese ship
  // carried one: a cheap vertical dipole array that worked.
  typeThirteen(g, M, x, foot + 7.6, z - 0.6, 0, 3.6);
  // The masthead light and the halyards' block.
  cyl(g, M.bright, 0.12, 0.12, 0.3, x, foot + 13.6, z, 8);
}

/** The gun tubs, ladders, searchlights and boats that belong to the island. */
function isleFittings(g) {
  const x = ISL_X;
  const z = ISL_Z;
  // The gun tubs on the island's own galleries.
  //
  // They stand on the casing and on the gallery bracketed round the island,
  // above the flight deck. Hung under it instead -- which is where the deck
  // edge tubs go -- every one of them is inside the island, because the island
  // is eight metres wide and all five of their stations are under it.
  for (const spec of CLS.aa.guns[0].mounts) {
    if (mountKind(spec) !== 'island') continue;
    isleTub(g, spec.x, spec.z, 2.35);
  }
  for (const spec of CLS.aa.guns[1].mounts) {
    if (mountKind(spec) !== 'island') continue;
    isleTub(g, spec.x, spec.z, 2.15);
  }
  // Two 110 cm searchlights on brackets off the funnel casing.
  for (const dz of [-8.0, -12.4]) {
    searchlight(g, M, x + 4.2, FD + 7.4, z + dz, 0.78);
    box(g, M.steelDark, 2.0, 0.18, 1.6, x + 3.4, FD + 6.6, z + dz);
  }
  // Ladders up the inboard face of the island, level to level, which is how a
  // man gets from the flight deck to the bridge.
  for (let i = 0; i < 4; i++) {
    const y0 = FD + 0.8 + i * 3.2;
    ladder(g, M.steelDark, x + 3.9, y0, y0 + 3.2, z - 9.6, z - 10.9);
  }
  // And the vertical ladder up her outboard face, from the deck to the air
  // defence platform: the one a lookout goes up when there is no time to walk
  // round to the other side of the island.
  sideLadder(g, M.steelDark, {
    out: -1, skin: Math.abs(ISL_X) + 3.5, z: z + 2.6,
    y0: FD + 1.0, y1: FD + 12.4, half: 0.26, stand: 0.20, rail: 0.75,
  });
  // The signal yards and the flag lockers on the flag deck.
  for (const dz of [z + 6.6, z + 4.0]) {
    box(g, M.steelDark, 1.2, 0.9, 1.0, x + 3.2, FD + 4.9, dz);
  }
  // Her ensign staff and the jack on the island top.
  cyl(g, M.steelDark, 0.09, 0.11, 3.2, x + 2.6, FD + 11.8, z + 6.0, 8);
}

// ----------------------------------------------------- galleries and tubs --

/**
 * The gallery deck: the walkway that runs round the deck edge under the flight
 * deck, with the gun sponsons hanging off it.
 *
 * On Shinano the gallery is inboard of the deck edge -- it runs in the
 * metre and five-sixths of overhang between the hull's side and the edge of
 * the flight deck -- rather than being bracketed out beyond the hull the way
 * an American carrier's catwalk is. That is why her beam from ahead is one
 * clean slab and not a ship with a shelf round it.
 */
/** Whether a station falls inside one of her gun sponsons. */
function inSponson(z) {
  for (const spec of CLS.turrets) {
    if (Math.abs(z - spec.z) < 3.9) return true;
  }
  for (const gun of CLS.aa.guns) {
    for (const spec of gun.mounts) {
      if (mountKind(spec) !== 'edge') continue;
      if (Math.abs(z - spec.z) < 2.7) return true;
    }
  }
  return false;
}

function galleries(g) {
  const y = GALLERY;
  const inner = (z) => sideTop(z) + 0.1;
  const outer = (z) => fdHalf(z) - 0.15;
  const z0 = FD_AFT + 22;
  const z1 = FD_FWD - 22;
  const N = 72;
  for (const sgn of [-1, 1]) {
    // The walkway itself, one continuous sheet following the deck edge in.
    const walk = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      walk.quad([sgn * inner(za), y, za], [sgn * outer(za), y, za],
        [sgn * outer(zb), y, zb], [sgn * inner(zb), y, zb], [0, 1, 0]);
      walk.quad([sgn * inner(za), y - 0.22, za], [sgn * outer(za), y - 0.22, za],
        [sgn * outer(zb), y - 0.22, zb], [sgn * inner(zb), y - 0.22, zb], [0, -1, 0]);
      walk.quad([sgn * outer(za), y, za], [sgn * outer(za), y - 0.22, za],
        [sgn * outer(zb), y - 0.22, zb], [sgn * outer(zb), y, zb], [sgn, 0, 0]);
    }
    walk.mesh(g, M.steelDark);
  }
  // The knees that carry it off the ship's side.
  for (let z = z0 + 2; z < z1; z += 4.8) {
    for (const sgn of [-1, 1]) {
      const br = box(g, M.steelDark, 2.0, 0.85, 0.22, sgn * (sideTop(z) + 0.95),
        y - 0.62, z);
      br.rotation.z = sgn * 0.42;
    }
  }
  // The rail along the outboard edge of it, which is the one thing that makes
  // a catwalk read as somewhere a man stands -- and nowhere near as tall as
  // the space it stands in. Carried to the flight deck it fills the whole of
  // the overhang and she reads from abeam as a ship inside scaffolding.
  //
  // It stops at every sponson, because a sponson's own splinter plating is
  // what a man holds on to there. Run straight through, the rail crosses
  // twenty tubs a side and the stanchions stand up through their floors.
  for (const sgn of [-1, 1]) {
    let run = null;
    for (let z = z0; z <= z1; z += 1.6) {
      const clear = !inSponson(z);
      if (clear && run === null) run = z;
      if ((!clear || z + 1.6 > z1) && run !== null) {
        if (z - run > 3) {
          rail(g, M.steelDark, run + 0.4, z - 0.4,
            (zz) => outer(zz) - 0.15, () => y, 2.6, [sgn], 0.86);
        }
        run = null;
      }
    }
  }

  // The sponsons the 12.7 cm twins stand in: two at each corner, carried out
  // from her side far enough that the shields clear the deck edge.
  for (const spec of CLS.turrets) {
    const sgn = Math.sign(spec.x);
    const fy = TURRET_Y;
    sponson(g, spec.x, spec.z, 3.6, fy, 0.85);
    // The ready-use lockers round the back of it, where the loaders' hands
    // fall: a Type 89 is hand-loaded and it eats fourteen rounds a minute.
    for (const dz of [-2.4, 2.4]) {
      box(g, M.steelDark, 0.7, 0.8, 1.2, spec.x - sgn * 2.5, fy + 0.5, spec.z + dz);
    }
  }

  // And the sponsons for the 25 mm and the rocket launchers down the deck
  // edge. Only those: the island has its own and they belong to it. Their
  // rims stand just under the flight deck, which is what a photograph of her
  // shows -- a continuous run of them in the shadow of the overhang.
  for (const spec of CLS.aa.guns[0].mounts) {
    if (mountKind(spec) !== 'edge') continue;
    sponson(g, spec.x, spec.z, 2.30, AA_Y, 0.80);
  }
  for (const spec of CLS.aa.guns[1].mounts) {
    if (mountKind(spec) !== 'edge') continue;
    sponson(g, spec.x, spec.z, 2.45, ROCKET_Y, 0.92);
  }
}

/**
 * The plan of a sponson: a circle of radius `r` about (cx, z), cut off flat
 * wherever it would go inboard of the ship's side at `xin`.
 *
 * This is the whole of what makes a sponson a sponson rather than a drum hung
 * on the ship. A gun tub at a carrier's deck edge is a piece of platform
 * carried out from her side and plated round its outboard edge: its inboard
 * side is the ship. Drawn as a full circle centred on the gun, a third of
 * every one of them is inside the hull -- so from alongside her deck edge is a
 * row of plating bulges standing in the middle of her own side, and from
 * inside a compartment the tub is a disc through the wall.
 *
 * Cut here instead. If the circle clears the plating on its own, it comes back
 * whole; if it does not, what comes back is the outboard arc, and the chord
 * that closes it lies along the ship's side.
 */
function sponsonPlan(cx, z, r, xin, n = 16) {
  const sgn = Math.sign(cx) || 1;
  const out = Math.abs(cx);
  const d = out - Math.abs(xin);
  const pts = [];
  if (d >= r - 0.05) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([sgn * (out + Math.cos(a) * r), z + Math.sin(a) * r]);
    }
    return pts;
  }
  const A = Math.acos(clamp(-d / r, -1, 1));
  for (let i = 0; i <= n; i++) {
    const a = -A + (2 * A * i) / n;
    pts.push([sgn * (out + Math.cos(a) * r), z + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * One sponson, built: the floor, the splinter plating round its outboard edge,
 * and the knees that carry it off her side.
 *
 * `fy` is the floor the gun stands on, so the floor a gun is put on and the
 * floor the model draws are the same number.
 */
function sponson(g, cx, z, r, fy, wall, m = M.steel) {
  const sgn = Math.sign(cx) || 1;
  // Tucked a hand's breadth into the plating rather than flush with it: two
  // surfaces at the same place fight for the depth buffer and the sponson
  // shows through her side in patches.
  const xin = sgn * (sideTop(z) - 0.15);
  const plan = sponsonPlan(cx, z, r, xin);
  // The floor, as a slab with a top and a bottom.
  loftShape(g, M.steelDark, [
    { pts: plan, y: fy - 0.26 },
    { pts: plan, y: fy },
  ], { cap: true, floor: true });
  // The splinter plating round it, flaring a little as it rises the way a
  // plated tub does.
  const lip = plan.map(([px, pz]) => [
    px + (px - sgn * sideTop(z)) * 0.05, z + (pz - z) * 1.05,
  ]);
  loftShape(g, m, [
    { pts: plan, y: fy },
    { pts: lip, y: fy + wall },
  ], { cap: false });
  // The knees under it, and the ready-use locker on the after side of the rim.
  for (const dz of [-r * 0.62, r * 0.62]) {
    const knee = box(g, M.steelDark, r * 1.5, 0.95, 0.26,
      sgn * (Math.abs(cx) - r * 0.35), fy - 1.1, z + dz);
    knee.rotation.z = sgn * 0.5;
  }
  box(g, M.steelDark, 0.5, 0.55, 1.2, sgn * (Math.abs(cx) - r + 0.45), fy + 0.45, z);
  return plan;
}

// ---------------------------------------------------------------- guns ----

/**
 * Her eight 12.7 cm twins, which are her main battery.
 *
 * Sixteen barrels of 40-calibre Type 89 in eight twin mounts, two at each
 * corner, and not one of them can fire across the ship: the flight deck is in
 * the way. That is why a carrier is always short of guns on the engaged side
 * and why she carries a hundred and five 25 mm barrels as well.
 */
function mainBattery(g) {
  const turrets = CLS.turrets.map((spec) =>
    typeEightNine(g, M, spec.x, TURRET_Y, spec.z, spec.angle));
  g.userData.turrets = turrets;
  return turrets;
}

/** And the thirty-five 25 mm triples and the twelve rocket launchers. */
function mountings(g) {
  const aa = [];
  // Both heights are the floor of the tub the gun actually stands in, so the
  // floor a gun is put on and the floor the model draws are the same number.
  const AT = { edge: AA_Y, island: FD + 1.05 };
  for (const spec of CLS.aa.guns[0].mounts) {
    aa.push(triple25(g, M, spec.x, AT[mountKind(spec)], spec.z, spec.angle));
  }
  const RT = { edge: ROCKET_Y, island: FD + 1.05 };
  for (const spec of CLS.aa.guns[1].mounts) {
    aa.push(rocket(g, M, spec.x, RT[mountKind(spec)], spec.z, spec.angle));
  }
  g.userData.aaMounts = aa;
  return aa;
}

// ------------------------------------------------------------- fittings ----

/** Her boats, her ground tackle, her cranes, her masts and her ventilators. */
function fittings(g) {
  groundTackle(g);
  cranes(g);
  boats(g);
  radioMasts(g);
  ventilation(g);
}

/**
 * The forecastle: anchors, capstans, the bullring and the chrysanthemum.
 *
 * All of it is under the forward end of the flight deck, in the ten metres of
 * her that the deck does not cover, and it is the one part of a carrier that
 * looks like any other ship.
 */
function groundTackle(g) {
  const bow = 0.92 * LOA / 2;
  const deck = (z) => sheer(clamp(z / (LOA / 2), -1, 1));
  for (const sgn of [-1, 1]) {
    // The anchors, housed in their recesses in the plating.
    const t = 0.90;
    const y = sheer(t) - 2.3;
    const w = F.shellAt(t, y);
    box(g, M.gunDark, 0.42, 2.6, 3.4, sgn * (w - 0.30), y, F.zAt(t, y));
    box(g, M.gunDark, 0.34, 0.9, 1.6, sgn * (w - 0.30), y + 1.7, F.zAt(t, y) - 0.4);
    // The capstans and the cable holders on the forecastle.
    cyl(g, M.steelDark, 1.25, 1.35, 1.6, sgn * 4.4, deck(bow - 9) + 0.8, bow - 9, 14);
    cyl(g, M.gunDark, 0.95, 0.95, 0.45, sgn * 4.4, deck(bow - 9) + 1.75, bow - 9, 14);
    // The cable itself, ranged along the deck to the naval pipe.
    for (let i = 0; i < 9; i++) {
      cyl(g, M.gunDark, 0.19, 0.19, 1.05, sgn * (4.4 + i * 0.12),
        deck(bow - 9) + 0.2, bow - 9 - i * 1.0, 6).rotation.x = Math.PI / 2;
    }
    // Bollards and fairleads down both sides of her.
    for (const z of [bow - 3, bow - 16, bow - 24]) {
      const ww = F.shellAt(clamp(z / (LOA / 2), -1, 1), deck(z)) - 1.0;
      if (ww < 2) continue;
      for (const d of [-0.5, 0.5]) {
        cyl(g, M.steelDark, 0.24, 0.26, 0.9, sgn * ww, deck(z) + 0.45, z + d, 8);
      }
    }
  }
  // The bullring on the stem, and the chrysanthemum crest above it, which
  // every ship of the Imperial Navy carries and which was gilded even on a
  // ship completed in the last year of the war.
  const crestY = sheer(1) - 2.6;
  const sz = F.zAt(1, crestY);
  cyl(g, M.gunDark, 0.70, 0.70, 0.5, 0, sheer(1) - 1.0, F.zAt(1, sheer(1) - 1.0) - 0.45, 12)
    .rotation.x = Math.PI / 2;
  // The chrysanthemum itself: sixteen petals round a boss, set flush on the
  // stem a couple of metres under the forecastle deck edge, and gilded even on
  // a ship completed in the last year of the war.
  cyl(g, mat(P.chrys), 0.62, 0.62, 0.20, 0, crestY, sz - 0.18, 20)
    .rotation.x = Math.PI / 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const petal = box(g, mat(P.chrys), 0.30, 0.82, 0.14,
      Math.sin(a) * 0.62, crestY + Math.cos(a) * 0.62, sz - 0.16);
    petal.rotation.z = a;
  }
  // The jackstaff right forward and the ensign staff right aft.
  cyl(g, M.steelDark, 0.11, 0.15, 4.4, 0, sheer(1) + 2.2, sz - 3.0, 8);
  const st = F.zAt(-1, sheer(-1));
  cyl(g, M.steelDark, 0.14, 0.19, 5.2, 0, sheer(-1) + 2.6, st + 2.0, 8);
}

/**
 * Her two cranes: the heavy one on the port bow that lifts a lighter or a
 * ditched aircraft aboard over the deck edge, and the smaller one on the port
 * quarter that works her boats.
 *
 * Both stand to port, which is where a carrier puts anything that has to
 * train over the side: the starboard deck edge is the island's.
 */
function cranes(g) {
  // The heavy crane on the port bow.
  //
  // Trained fore and aft and the jib lowered, which is how a deck-edge crane
  // is stowed: swung inboard and cocked up it is twenty metres of lattice
  // standing over the flight deck, and nothing that stands over a flight deck
  // is ever left there. It lives on the gallery under the deck edge, which is
  // where the photographs of her put it.
  const bc = new THREE.Group();
  bc.position.set(sideTop(94) + 0.6, GALLERY, 94);
  bc.rotation.y = Math.PI;
  cyl(bc, M.steel, 1.0, 1.15, 4.0, 0, 2.0, 0, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(bc, M.steelDark, 0.14, 3.8, 0.14, Math.sin(a) * 1.0, 1.9, Math.cos(a) * 1.0);
  }
  const bj = new THREE.Group();
  bj.position.set(0, 4.0, 0);
  bj.rotation.x = -0.13;
  for (const sgn of [-1, 1]) {
    box(bj, M.steelDark, 0.13, 0.13, 20, sgn * 0.48, 0.48, 9.6);
    box(bj, M.steelDark, 0.13, 0.13, 20, sgn * 0.48, -0.48, 9.6);
  }
  for (let i = 1; i < 10; i++) {
    box(bj, M.steelDark, 1.06, 0.09, 0.09, 0, 0.48, i * 2.0);
    box(bj, M.steelDark, 1.06, 0.09, 0.09, 0, -0.48, i * 2.0);
    box(bj, M.steelDark, 0.09, 1.06, 0.09, 0.48, 0, i * 2.0);
  }
  bc.add(bj);
  // The hook, hove close up to the jib head where it is stowed.
  cyl(bc, M.steelDark, 0.06, 0.06, 1.6, 0, 4.0 + 19.4 * Math.sin(0.13) - 0.8,
    19.4 * Math.cos(0.13), 6);
  cyl(bc, M.gunDark, 0.3, 0.3, 0.7, 0, 4.0 + 19.4 * Math.sin(0.13) - 1.9,
    19.4 * Math.cos(0.13), 8);
  // The crutch the jib head rests in when it is down.
  box(bc, M.steelDark, 1.4, 1.5, 0.5, 0, 4.0 + 19.4 * Math.sin(0.13) - 0.8,
    19.4 * Math.cos(0.13) + 0.8);
  g.add(bc);

  // The boat crane on the port quarter, standing on the gallery.
  const cr = new THREE.Group();
  cr.position.set(sideTop(-104) + 0.9, GALLERY, -104);
  cyl(cr, M.steel, 0.85, 1.0, 3.6, 0, 1.8, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 3.6, 0);
  jib.rotation.x = -0.46;
  box(jib, M.steelDark, 0.7, 0.7, 15, 0, 0, 7.2);
  for (let i = 1; i < 7; i++) box(jib, M.steelDark, 0.8, 0.09, 0.09, 0, 0, i * 2.2);
  cr.add(jib);
  g.add(cr);
}

/**
 * Her boats, on a platform between the ship's side and the gallery.
 *
 * A carrier carries a great many of them -- she is a floating supply base with
 * two and a half thousand men aboard -- and they live in the one place on her
 * that is out of the way of everything, which is under the flight deck aft.
 */
function boats(g) {
  for (const sgn of [-1, 1]) {
    const x = sgn * (sideTop(-20) - 1.2);
    box(g, M.steelDark, 4.6, 0.26, 30, x, GALLERY - 1.9, -20);
    for (const z of [-33, -20, -7]) {
      box(g, M.steelDark, 3.6, 1.3, 0.65, x, GALLERY - 2.7, z);
    }
    boat(g, M, x, GALLERY - 1.7, -8, 11);
    boat(g, M, x, GALLERY - 1.7, -21, 10);
    boat(g, M, x, GALLERY - 1.7, -31, 8);
    // The davits over them.
    for (const z of [-8, -21, -31]) {
      const d = cyl(g, M.steelDark, 0.16, 0.20, 3.4, x - sgn * 1.9,
        GALLERY - 0.4, z, 8);
      d.rotation.z = -sgn * 0.3;
    }
  }
  // Carley floats stowed flat against the hangar side on their own rails,
  // which is where every hand's is and the reason a carrier's side is never
  // a blank sheet of plating.
  for (const sgn of [-1, 1]) {
    for (let z = -70; z < 62; z += 11) {
      if (inSponson(z)) continue;
      const x = sgn * (sideTop(z) + 0.34);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.20, 5, 14), M.canvas);
      r.position.set(x, GALLERY + 1.45, z);
      r.rotation.y = Math.PI / 2;
      r.scale.set(1, 1, 0.5);
      g.add(r);
      // The rails it is triced to, and the slip that lets it go over the side.
      for (const dy of [-1.0, 1.0]) {
        box(g, M.steelDark, 0.42, 0.10, 2.5, sgn * (sideTop(z) + 0.12),
          GALLERY + 1.45 + dy * 0.8, z);
      }
    }
  }
}

/**
 * The two lattice radio masts on the port edge of the deck.
 *
 * They are hinged at the foot and lie flat outboard while she is flying off;
 * up, which is how she spends most of her life, they carry her aerials. A
 * carrier cannot have a mast anywhere near her deck and this is everybody's
 * answer to it.
 */
function radioMasts(g) {
  for (const z of [40, -18, -76]) {
   for (const side of [-1, 1]) {
    const m = new THREE.Group();
    m.position.set(side * (fdHalf(z) - 0.6), fdY(z) - 0.5, z);
    // Lowered: they lie out over the water at the deck edge, which is how a
    // Japanese carrier's masts are whenever she is working aircraft and how
    // she is in every photograph taken from the air. Standing up, they are
    // eighteen metres of lattice beside the landing area.
    // Out over the water, not in over the deck: a positive turn about z
    // carries the mast's own up-axis toward negative x, so the sign has to be
    // against the side she is stepped on or all six of them lie across the
    // flight deck.
    m.rotation.z = -side * (Math.PI / 2 - 0.09);
    for (const sgn of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const leg = box(m, M.steelDark, 0.16, 10.2, 0.16, sgn * 0.78, 5.1, dz * 0.78);
        leg.rotation.z = -sgn * 0.052;
        leg.rotation.x = -dz * 0.052;
      }
    }
    for (let i = 1; i < 7; i++) {
      const y = i * 1.45;
      const r = 0.78 * (1 - y / 26);
      box(m, M.steelDark, r * 2, 0.1, 0.1, 0, y, r);
      box(m, M.steelDark, r * 2, 0.1, 0.1, 0, y, -r);
      box(m, M.steelDark, 0.1, 0.1, r * 2, r, y, 0);
      box(m, M.steelDark, 0.1, 0.1, r * 2, -r, y, 0);
    }
    cyl(m, M.steelDark, 0.08, 0.11, 2.4, 0, 11.2, 0, 6);
    box(m, M.steelDark, 2.8, 0.1, 0.1, 0, 10.4, 0);
    g.add(m);
    // The hinge and its tabernacle, which is what it swings on.
    cyl(g, M.gunDark, 0.34, 0.34, 2.2, side * (fdHalf(z) - 0.6), fdY(z) - 0.5, z, 10)
      .rotation.z = Math.PI / 2;
    box(g, M.steel, 1.6, 1.0, 2.6, side * (fdHalf(z) - 1.1), fdY(z) - 0.9, z);
   }
  }
}

/**
 * Ventilator cowls and uptake trunks along the gallery.
 *
 * A closed hangar with forty aircraft in it and their engines being run needs
 * an enormous amount of air moved through it, and all of that plant breathes
 * out through the deck edge.
 */
function ventilation(g) {
  for (let z = -96; z < 100; z += 9) {
    if (inSponson(z)) continue;
    for (const sgn of [-1, 1]) {
      cowl(g, M, sgn * (sideTop(z) - 0.5), GALLERY + 0.35, z, 0.34, 1.5);
    }
  }
  // The big intake trunks either side of the after lift.
  for (const sgn of [-1, 1]) {
    for (const z of [-50, -74]) {
      box(g, M.steel, 1.6, 2.6, 3.2, sgn * (sideTop(z) - 1.0), GALLERY + 1.9, z);
      box(g, M.cave, 1.2, 1.4, 0.1, sgn * (sideTop(z) - 1.0), GALLERY + 2.4, z + 1.65);
    }
  }
}

// --------------------------------------------------------------- armour ----

/**
 * Her armour, as structure inside the ship.
 *
 * None of this is visible while her plating is whole, and all of it is visible
 * the moment a compartment is blown out of her -- which is the point. A
 * carrier that is famous for being armoured ought to show armour when she is
 * opened up, and what she showed was an empty box.
 *
 * What is laid here is her scheme as designed:
 *
 *   the belt          400 mm abreast the magazines, 160 elsewhere, inclined
 *                     twenty degrees, from a metre above the water down to
 *                     the top of the bulge
 *   the armour deck   100-190 mm flat over the machinery and the magazines,
 *                     230 on the slopes down to the foot of the belt
 *   the holding       the longitudinal torpedo bulkhead inboard of the bulge,
 *                     and the cofferdam round the avgas tanks that they
 *                     filled with two and a half thousand tonnes of concrete
 *   the hangar deck   190 mm, which is the ship's strength deck and the
 *                     thing the flight deck's 75 mm is a roof over
 */
function armour(g) {
  const T0 = -0.70;
  const T1 = 0.72;
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (t, y, in_ = 0.9) => Math.max(0.4, F.shellAt(t, y) - in_);

  // The flat of the armour deck, and the slope down to the foot of the belt.
  const N = 48;
  const flat = strip();
  const slope = strip();
  for (let i = 0; i < N; i++) {
    const ta = T0 + ((T1 - T0) * i) / N;
    const tb = T0 + ((T1 - T0) * (i + 1)) / N;
    const za = F.zAt(ta, 1.3);
    const zb = F.zAt(tb, 1.3);
    const fa = at(ta, 1.3, 4.2);
    const fb = at(tb, 1.3, 4.2);
    const ea = at(ta, -3.3, 0.8);
    const eb = at(tb, -3.3, 0.8);
    for (const sgn of [-1, 1]) {
      flat.quad([sgn * fa, 1.30, za], [sgn * fa, 1.10, za],
        [sgn * fb, 1.10, zb], [sgn * fb, 1.30, zb], [sgn, 0, 0]);
      slope.quad([sgn * fa, 1.30, za], [sgn * ea, -3.30, za],
        [sgn * eb, -3.30, zb], [sgn * fb, 1.30, zb], [sgn, 1, 0]);
    }
  }
  inside(flat.mesh(g, M.armour));
  inside(slope.mesh(g, M.armour));
  // The flat itself, as a deck: 190 mm over the magazines and the machinery.
  inside(sheet(g, M.armour, F.zAt(T0, 1.3), F.zAt(T1, 1.3),
    (z) => at(clamp(z / (LOA / 2), -1, 1), 1.3, 4.2), () => 1.30, 40));

  // The belt, inclined twenty degrees, inboard of the plating.
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const ta = T0 + ((T1 - T0) * i) / N;
    const tb = T0 + ((T1 - T0) * (i + 1)) / N;
    const za = F.zAt(ta, 0);
    const zb = F.zAt(tb, 0);
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(ta, 1.3, 0.5), 1.30, za], [sgn * at(ta, -3.3, 1.9), -3.30, za],
        [sgn * at(tb, -3.3, 1.9), -3.30, zb], [sgn * at(tb, 1.3, 0.5), 1.30, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));

  // The longitudinal holding bulkhead inboard of the bulge, which is what a
  // torpedo has to get through after the bulge has taken the shock -- and
  // which on the night of 29 November did not.
  const hold = strip();
  for (let i = 0; i < N; i++) {
    const ta = T0 + ((T1 - T0) * i) / N;
    const tb = T0 + ((T1 - T0) * (i + 1)) / N;
    const za = F.zAt(ta, -5);
    const zb = F.zAt(tb, -5);
    for (const sgn of [-1, 1]) {
      hold.quad([sgn * at(ta, -3.3, 2.6), -3.30, za], [sgn * at(ta, -8.0, 2.2), -8.00, za],
        [sgn * at(tb, -8.0, 2.2), -8.00, zb], [sgn * at(tb, -3.3, 2.6), -3.30, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(hold.mesh(g, M.steelDark));

  // The hangar deck: a hundred and ninety millimetres, and the strength deck
  // of the ship. Laid as her beams, so it reads as deck rather than as a
  // second skin.
  for (let z = F.zAt(T0, HANGAR); z < F.zAt(T1, HANGAR); z += 5.6) {
    const t = clamp(z / (LOA / 2), -1, 1);
    const w = at(t, HANGAR - 0.8, 1.2);
    if (w < 2) continue;
    inside(box(g, M.armour, w * 2, 0.42, 0.5, 0, HANGAR - 0.55, z));
  }
  // The transverse armoured bulkheads that close the citadel at both ends.
  //
  // Cut to her section at every height rather than laid in as a rectangle: a
  // slab of bulkhead the width of the ship at the waterline is wider than the
  // ship four metres down, so the corners of it stand out through her bottom
  // and show from alongside -- which is the one thing an interior must never
  // do.
  for (const t of [T0, T1]) {
    const bh = strip();
    const ys = [];
    for (let y = -9.4; y <= HANGAR; y += 1.4) ys.push(y);
    ys.push(HANGAR);
    for (let i = 0; i < ys.length - 1; i++) {
      const ya = ys[i];
      const yb = ys[i + 1];
      const wa = Math.max(0.2, at(t, ya, 1.2));
      const wb = Math.max(0.2, at(t, yb, 1.2));
      const z = F.zAt(t, (ya + yb) / 2);
      for (const face of [1, -1]) {
        bh.quad([-wa, ya, z], [wa, ya, z], [wb, yb, z], [-wb, yb, z],
          [0, 0, face * Math.sign(t)]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  // The avgas cofferdam: seven hundred and twenty thousand litres of petrol in
  // a concrete box, which is the only way anybody found to stop an aviation
  // fuel tank being a bomb.
  for (const z of [-58, 66]) {
    inside(box(g, M.steelDark, 13.0, 5.2, 13.0, 0, -4.4, z));
    inside(box(g, M.canvas, 11.4, 4.4, 11.4, 0, -4.4, z));
  }
}

// ----------------------------------------------------------- deck cycle ----

const LIFT_DROP = FD - HANGAR - 0.6;
const ROLL = 9.0;
/** Where she picks up a wire: a little way up the deck from the round-down. */
function landZ() { return FD_AFT + 26; }

/** The aircraft that flies when she launches, and where it waits. */
function deckAircraft(g) {
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  g.add(plane);
  const body = tenzan(plane, 0, 0, 0, 0, true, true);
  return {
    group: plane,
    prop: body.userData.prop || null,
    wings: body.userData.wings || null,
    gear: body.userData.gear || null,
  };
}

function below(deck, p, aft) {
  if (deck.owner && p.parent !== deck.owner) return;
  p.position.set(0, FD - LIFT_DROP + 0.34, aft.group.position.z - 0.45);
  p.rotation.set(0, 0.08, 0);
}

/**
 * Her deck cycle: the lifts working, and the launch when one is called for.
 *
 * Idle, each lift runs its own slow round -- at the flight deck, down the
 * well, on the hangar deck, back up -- staggered so the two are never doing
 * the same thing at once. A launch brings the after lift up with the aircraft
 * on it, she taxis forward to the spot, runs up against the brakes, and goes
 * down the deck and off over the bow.
 *
 * The whole time an evolution is on, both lifts are at the flight deck: a lift
 * down the well is a hole the width of the deck, and an aeroplane taking off
 * across one is an aeroplane in the hangar.
 */
export function stepDeck(deck, t) {
  if (!deck) return;
  const { lifts, plane } = deck;
  const aft = lifts[lifts.length - 1];
  const LAUNCH = ROLL + 12;
  const pace = LAUNCH / DECK_RUN;
  const run = deck.launchAt === null || deck.launchAt === undefined
    ? -1 : (t - deck.launchAt) * pace;

  const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
  deck.lastT = t;
  const ranging = run >= 0 && run < LAUNCH + 2;
  const FLUSH = 1.4;
  deck.flush = Math.max(0, Math.min(1,
    (deck.flush ?? 0) + (ranging ? dt / FLUSH : -dt / FLUSH)));

  const PERIOD = 38;
  const working = (run >= 0 && run < LAUNCH) || deck.landAt != null;
  for (const l of lifts) {
    if (l === aft && working) continue;
    let u = ((t / PERIOD) + l.phase) % 1;
    if (u < 0) u += 1;
    let k = 0;
    if (u < 0.36) k = 0;
    else if (u < 0.48) k = (u - 0.36) / 0.12;
    else if (u < 0.86) k = 1;
    else k = 1 - (u - 0.86) / 0.14;
    const idle = FD - LIFT_DROP * ease(k);
    l.group.position.y = idle + (FD - idle) * ease(deck.flush);
  }

  if (!plane) return;
  const p = plane.group;
  if (deck.owner && p.parent !== deck.owner) return;
  const AFT_Z = aft.group.position.z;
  const wings = (out) => {
    if (!plane.wings) return;
    plane.wings.spread.visible = out;
    plane.wings.stowed.visible = !out;
  };

  // Coming home: she picks up a wire at the round-down, rolls up the deck to
  // the after lift and the lift takes her below.
  if (deck.landAt != null) {
    const k = t - deck.landAt;
    if (k < 3.0) {
      const u = ease(k / 3.0);
      p.visible = true;
      wings(true);
      aft.group.position.y = FD;
      p.position.set(0, FD + 0.34, landZ() + (AFT_Z - landZ()) * u);
      p.rotation.set(0, 0, 0);
      return;
    }
    if (k < 6.4) {
      const u = ease((k - 3.0) / 3.4);
      wings(false);
      aft.group.position.y = FD - LIFT_DROP * u;
      p.position.set(0, FD - LIFT_DROP * u + 0.34, AFT_Z - 0.45);
      p.visible = true;
      return;
    }
    deck.landAt = null;
    deck.stowed = true;
    p.visible = false;
    below(deck, p, aft);
    return;
  }

  if (run < 0 || run > LAUNCH + 1) {
    // Nothing on. She waits below on the after lift, and the lift goes back to
    // running its own idle round with the other one -- which the loop above
    // has already done, so nothing is set here.
    if (deck.stowed) { p.visible = false; below(deck, p, aft); }
    return;
  }

  // The evolution.
  p.visible = true;
  if (run < 3.6) {
    // The lift comes up out of the hangar with her on it, wings going out.
    const u = ease(run / 3.6);
    aft.group.position.y = FD - LIFT_DROP * (1 - u);
    wings(u > 0.55);
    p.position.set(0, aft.group.position.y + 0.34, AFT_Z - 0.45);
    p.rotation.set(0, 0.08 * (1 - u), 0);
    return;
  }
  aft.group.position.y = FD;
  wings(true);
  if (run < ROLL) {
    // Taxied forward off the lift to the spot and lined up on the centreline.
    const u = ease((run - 3.6) / (ROLL - 3.6));
    const spot = AFT_Z + 26;
    p.position.set(0, FD + 0.34, AFT_Z - 0.45 + (spot - (AFT_Z - 0.45)) * u);
    p.rotation.set(0, 0, 0);
    return;
  }
  // And the run itself: down the deck and off over the round-up.
  const u = Math.min(1, (run - ROLL) / 12);
  const spot = AFT_Z + 26;
  const z = spot + (FD_FWD - spot) * (u * u * 0.75 + u * 0.25);
  const lift = Math.max(0, (u - 0.82) / 0.18);
  p.position.set(0, FD + 0.34 + lift * 5, z);
  p.rotation.set(-lift * 0.14, 0, 0);
  if (u >= 1) p.visible = false;
}

/** Kept for the tests and for anything that only wants the lifts moved. */
export function stepLifts(lifts, t) {
  stepDeck({ lifts, plane: null, launchAt: null }, t);
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hull', hull],
  ['upperSide', upperSide],
  ['endDecks', endDecks],
  ['flightDeck', flightDeck],
  ['hangar', hangar],
  ['armour', armour],
  ['airGroup', airGroup],
  ['liftWells', liftWells],
  ['island', island],
  ['galleries', galleries],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildShinano() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides are fitted to the hull, not to the flight deck.
  //
  // A carrier is the one shape where the widest thing on her is not her hull:
  // the flight deck stands six metres above her deck edge and overhangs it,
  // and her sponsons hang off that. So the lines her interior is built to are
  // held to her own plating at the deck edge and no higher -- otherwise every
  // frame and bulkhead in the hangar is drawn out to the width of the flight
  // deck, which is four metres of ship that is not there.
  buildInterior(g, {
    loa: LOA,
    shellAt: F.shellAt,
    keelY: F.keelY,
    // Her "deck" for this purpose is the hangar deck, not the flight deck:
    // there is nothing below the hangar but the hull, and the hangar itself is
    // built above -- deck, sides, ends, fire curtains and the aircraft in it.
    sheer: () => HANGAR,
    zAt: F.zAt,
    // And nothing is to be fitted above that deck.
    //
    // The interior builder finds whatever plating stands above the deck it is
    // given and furnishes it as a deckhouse -- mess decks, cabins, a
    // fore-and-aft passage. On a ship with a bridge tower that is exactly
    // right. On this one the thing standing above the hangar deck is the
    // hangar, and the thing standing above that is the runway, so what it
    // furnished was a hundred and seventy metres of cabin bulkhead through the
    // middle of her hangar with deck plates cutting up through her flight
    // deck. Every one of those spaces is built here instead, by hand, because
    // on a carrier they are the ship rather than the accommodation in it.
    hollow: true,
  });
  const lifts = elevators(g);
  const plane = deckAircraft(g);
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'shinano';

  const deck = {
    lifts, plane, launchAt: null, landAt: null, stowed: true,
    owner: g, flush: 0, lastT: 0,
  };
  g.userData.deck = deck;
  g.userData.deckPlane = plane.group;
  g.userData.landingSpot = [0, FD + 0.34, landZ()];
  g.userData.step = (t) => stepDeck(deck, t);
  g.userData.launch = (t) => {
    deck.launchAt = t;
    deck.landAt = null;
    deck.stowed = false;
    plane.group.visible = true;
  };
  g.userData.recover = (t = deck.lastT ?? 0) => {
    deck.landAt = t;
    deck.launchAt = null;
    deck.stowed = false;
    plane.group.visible = true;
  };
  g.userData.stow = () => {
    deck.launchAt = null;
    deck.landAt = null;
    deck.stowed = true;
    plane.group.visible = false;
    below(deck, plane.group, lifts[lifts.length - 1]);
  };
  g.userData.stow();

  dressShip(g);
  return {
    group: g, turrets, lifts,
    deckPlane: plane.group,
    length: LOA, beam: BEAM, deckY: HANGAR, flightDeckY: FD,
    secMounts: [], aaMounts: g.userData.aaMounts || [], torpMounts: [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function shinanoParts() {
  const parts = [];
  const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
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
