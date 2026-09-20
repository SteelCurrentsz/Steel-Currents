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
  strip, sheet, rail,
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
  [-1.000, 3.10], [-0.960, 4.74], [-0.920, 6.34], [-0.860, 8.34],
  [-0.800, 10.06], [-0.720, 12.02], [-0.630, 13.84], [-0.530, 15.34],
  [-0.420, 16.56], [-0.310, 17.48], [-0.200, 17.96], [-0.100, 18.13],
  [0.000, 18.15], [0.100, 18.11], [0.200, 17.84], [0.300, 17.20],
  [0.400, 16.06], [0.500, 14.52], [0.600, 12.58], [0.700, 10.28],
  [0.800, 7.52], [0.880, 4.72], [0.940, 2.30], [0.980, 0.80],
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
 * Almost nothing amidships, where her side is very nearly vertical; better
 * than three metres over the forward quarter, which is the bow.
 *
 * Carried further forward and further aft than the first draft of this table
 * had it, and taken out to the caps rather than pinched off short of them. A
 * flare that dies away two stations from the stem leaves the last eight metres
 * of her bow as a straight wedge standing on a curve, and that wedge is the
 * whole of what a camera sees from ahead.
 */
const FLARE = [
  [-1.000, 2.84], [-0.930, 2.30], [-0.850, 1.58], [-0.720, 0.84],
  [-0.550, 0.42], [-0.300, 0.22], [0.000, 0.21], [0.250, 0.46],
  [0.420, 1.16], [0.550, 1.96], [0.660, 2.78], [0.740, 3.36],
  [0.800, 3.74], [0.850, 3.74], [0.900, 3.46], [0.945, 2.82],
  [0.975, 2.06], [0.992, 1.38], [1.000, 0.92],
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
  [-1.000, 0.00], [-0.900, 0.30], [-0.800, 0.62], [-0.650, 0.92],
  [-0.450, 1.12], [-0.200, 1.22], [0.100, 1.22], [0.300, 1.00],
  [0.480, 0.60], [0.620, 0.24], [0.760, 0.00], [1.000, 0.00],
];

const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE, tumble: TUMBLE,
  // A stem that rakes six and a half metres forward between the water and the
  // deck edge, and hollow rather than straight -- she has a trace of clipper
  // in her, and it is the whole of what makes her bow look fast. The higher
  // the power the later the rake comes on, so the stem leaves the water nearly
  // upright and sweeps forward as it rises instead of leaning off the
  // forefoot in one straight line.
  stem: 7.0, stemLo: -4.2, stemUp: 21.5, stemPow: 1.58,
  // And a counter that overhangs eight and a half, which is what makes the
  // stern of a Japanese capital ship look as long as it does. Drawn the same
  // way: a long flat run under the water and the whole of the overhang taken
  // up in the last few metres of freeboard.
  counter: 8.8, counterLo: -2.6, counterUp: 16.0, counterPow: 1.56,
  // A very full bilge: she is nearly rectangular in section amidships, which
  // is where the stability for all that topweight came from.
  bilge: 0.28,
  // Two hundred stations rather than a hundred and fifty. Her ends are where
  // the offsets change fastest -- the half-breadth forward falls eleven metres
  // in the last tenth of her length -- and a station spacing that is
  // comfortable amidships is a visible facet there.
  stations: 200,
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
  [-138.0, 12.6], [-135.0, 13.2], [-132.0, 13.8], [-129.0, 14.4],
  [-126.0, 15.0], [-123.0, 15.6], [-115.0, 16.9], [-105.0, 18.1],
  [-94.0, 19.1], [-80.0, 19.8], [-60.0, 20.0], [-20.0, 20.0],
  [22.0, 20.0], [56.0, 19.9], [74.0, 19.6], [88.0, 19.0],
  [98.0, 18.2], [106.0, 17.2], [113.0, 15.9], [118.5, 14.3],
  [122.5, 12.4], [125.3, 10.2], [127.0, 7.6], [128.0, 5.0],
];

/**
 * The last few metres at either end are rounded in plan rather than run out
 * on the table's own slope.
 *
 * A flight deck ends in a nose. The deck edge comes round through a right
 * angle in two or three metres and meets the end face square, so the corner
 * is a radius and not a mitre -- forward a narrow rounded tip, aft the broad
 * rounded transom a pilot comes over. Faired on to the table rather than
 * tabulated, because a corner that tight wants stations closer together than
 * anything else on her and a table would have to carry them the whole length.
 */
const NOSE_F = 7.0;
const NOSE_A = 9.0;
const TIP_F = 4.4;
const TIP_A = 11.2;

/** Her half-breadth at the flight deck at a station. */
export function fdHalf(z) {
  const w = fairTable(FD_PLAN, z);
  if (z > FD_FWD - NOSE_F) {
    const u = (z - (FD_FWD - NOSE_F)) / NOSE_F;
    return TIP_F + (w - TIP_F) * Math.sqrt(Math.max(0, 1 - u * u));
  }
  if (z < FD_AFT + NOSE_A) {
    const u = (FD_AFT + NOSE_A - z) / NOSE_A;
    return TIP_A + (w - TIP_A) * Math.sqrt(Math.max(0, 1 - u * u));
  }
  return w;
}

/**
 * And how far down the round-down has taken it there.
 *
 * Both ends curve down, which every Japanese carrier of this generation has:
 * forward it is a round-up that is really a round-down the other way, and aft
 * it falls away far harder because that is the end a pilot comes over.
 */
const RD_FWD = 25;
const RD_AFT = 28;
function fdDrop(z) {
  // Taken as a cube rather than a square, and begun further out.
  //
  // A square leaves the deck dead flat and then bends into the fall-away in
  // one station, and however small the drop is that join is a hard crease
  // running right across her -- which is the one thing a round-down is for
  // not having. A cube comes away from the flat with no curvature at all and
  // gathers it as it goes, so the deck rolls over instead of breaking.
  if (z > FD_FWD - RD_FWD) return Math.pow((z - (FD_FWD - RD_FWD)) / RD_FWD, 3) * 3.0;
  if (z < FD_AFT + RD_AFT) return Math.pow((FD_AFT + RD_AFT - z) / RD_AFT, 3) * 3.8;
  return 0;
}

/** The height of the flight deck at a station. */
export function fdY(z) { return FD - fdDrop(z); }

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
  // And through the rounded noses at both ends, where the deck edge turns
  // through a right angle in a couple of metres: stations spread evenly down
  // her length are two metres apart there and cut the corner straight off.
  for (let i = 1; i <= 16; i++) {
    const u = (i * i) / 256;
    zs.push(FD_FWD - NOSE_F * u, FD_AFT + NOSE_A * u);
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
  const zs = deckStations(180);
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

/**
 * Her island, level by level: how high the deck is above the flight deck, how
 * far out its side stands, how far forward and aft it runs, and the radius of
 * the bullnose at each end of it.
 *
 * Set out in one table rather than level by level in the builder, because the
 * ladders, the flag deck and the searchlight platforms all have to land on the
 * level they belong to. Worked out separately they stand off it by half a
 * metre and hang in the air beside the bridge.
 *
 * Each level steps in hard on the one under it. A tower whose levels are all
 * within a foot of each other reads as an office block with a rail round it;
 * what makes a Japanese island look like one is the pyramid.
 */
const ISLE = [
  { y: 0.80, h: 3.4, hw: 4.10, zF: 11.4, zB: -13.6, nose: 3.10, tail: 2.40, lip: 0.60 },
  { y: 4.20, h: 3.2, hw: 3.62, zF: 9.40, zB: -10.8, nose: 2.80, tail: 2.10, lip: 0.55 },
  { y: 7.40, h: 3.0, hw: 3.14, zF: 7.20, zB: -7.80, nose: 2.50, tail: 1.80, lip: 0.50 },
];

// ------------------------------------------------------------- machinery --
//
// Twelve Kampon boilers in four rooms, four shafts, two rudders. The whole of
// it is inside the citadel and none of it shows, but the shafts and the screws
// do and they are placed off the same arrangement.
const SHAFT_OUT = 8.0;
const SHAFT_IN = 3.9;

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
  //
  // And seven above it, for the same reason and a better one. The freeboard
  // between the boot topping and the deck edge is fifteen metres, and all her
  // flare and all her tumblehome are in it: plated as one band it is one
  // straight sheet in section from the water to the sheer, so every bit of
  // curve the offsets carry is thrown away and her bow comes out as a flat
  // wedge. Seven strakes follow the section, and the difference is the whole
  // look of her ends.
  plateHull(g, F, M, { bootLo: -3.4, bootHi: 1.05, bands: 14, upper: 7 });
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
/**
 * One propeller blade, lofted the way a blade is actually shaped.
 *
 * A screw was four boxes: flat slabs a hand thick, all four set at the same
 * angle, standing out of a cone. A propeller blade is none of those things.
 * It is a wing wrapped round a helix: it has a chord that is widest about two
 * thirds out and rounds away to nothing at the tip, a thickness that is
 * greatest at mid-chord and goes to a knife edge fore and aft, and -- the
 * whole point of it -- a pitch angle that falls off the whole way out, because
 * the pitch of the helix is the same at every radius and the circumference
 * is not. At the root a blade stands at better than forty degrees to the
 * disc; at the tip it is barely twenty. That twist is what a propeller looks
 * like and a slab set at one angle has none of it.
 *
 * Built in the hub's own frame: the shaft runs along z, the blade out along
 * +y, and `hand` turns the helix the way the shaft turns.
 */
// The developed outline of one blade, as a fraction of its widest chord, from
// the root to the tip in ten equal steps.
//
// A screw blade is narrow where it leaves the boss, widest a little outboard
// of half radius, and comes back in to a tip that is rounded but still has
// real width to it. Drawn off a sine, as this was, the root comes out nearly
// as wide as the middle and the blade reads as a flower petal rather than a
// propeller -- so the outline is tabulated instead, which is how it is faired
// on the drawing.
const BLADE_OUTLINE = [0.40, 0.58, 0.74, 0.86, 0.95, 1.00, 0.99, 0.93, 0.81, 0.60, 0.22];

function bladeWidth(u) {
  const x = clamp(u, 0, 1) * (BLADE_OUTLINE.length - 1);
  const i = Math.min(BLADE_OUTLINE.length - 2, Math.floor(x));
  const f = x - i;
  return BLADE_OUTLINE[i] * (1 - f) + BLADE_OUTLINE[i + 1] * f;
}

function bladeGeo(rHub, rTip, hand, {
  pitch = 1.02, chord = 0.35, thick = 0.048, skew = 0.30, rake = 0.10,
} = {}) {
  const NS = 12;
  const NC = 9;
  const pos = [];
  const idx = [];
  const D = rTip * 2;
  const cMax = chord * D;
  for (let i = 0; i <= NS; i++) {
    const u = i / NS;
    const R = rHub + (rTip - rHub) * u;
    const c = cMax * bladeWidth(u);
    // Constant pitch: the angle falls away as the radius grows. A pitch ratio
    // near one is what a ship's screw is cut to -- at two the root stands
    // nearly edge-on to the water and the blade looks folded over.
    const phi = Math.atan2(pitch * D, 2 * Math.PI * R);
    const cs = Math.cos(phi);
    const sn = Math.sin(phi) * hand;
    // Skew: the blade sweeps back against the turn as it goes out, so it
    // enters the wake a little at a time instead of all at once. Measured off
    // the widest chord, so the sweep does not die away with the tip.
    const sk = -hand * skew * cMax * u * u;
    const tMax = thick * D * (1 - 0.72 * u);
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < NC; k++) {
        const j = side === 0 ? k : NC - 1 - k;
        const s = 0.5 - j / (NC - 1);
        const t = (tMax / 2) * Math.pow(1 - 4 * s * s, 0.55) * (side === 0 ? -1 : 1);
        pos.push(sk + s * c * cs + t * Math.abs(sn),
          R, -s * c * sn + t * cs + rake * R * u);
      }
    }
  }
  const ring = NC * 2;
  for (let i = 0; i < NS; i++) {
    for (let k = 0; k < ring; k++) {
      const j = (k + 1) % ring;
      const a = i * ring + k;
      const b = i * ring + j;
      const c2 = (i + 1) * ring + k;
      const d = (i + 1) * ring + j;
      idx.push(a, c2, d, a, d, b);
    }
  }
  // The tip, closed over.
  const top = NS * ring;
  const hub = pos.length / 3;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let k = 0; k < ring; k++) {
    sx += pos[(top + k) * 3];
    sy += pos[(top + k) * 3 + 1];
    sz += pos[(top + k) * 3 + 2];
  }
  pos.push(sx / ring, sy / ring, sz / ring);
  for (let k = 0; k < ring; k++) idx.push(hub, top + k, top + ((k + 1) % ring));
  // And wound the right way round whichever hand it is. A blade is a closed
  // shell, so the test is whether its first face looks away from the middle of
  // it; handed the other way every triangle in it comes out inside out and the
  // screw is four holes in the water.
  const A = [pos[0], pos[1], pos[2]];
  const B = [pos[ring * 3], pos[ring * 3 + 1], pos[ring * 3 + 2]];
  const C = [pos[(ring + 1) * 3], pos[(ring + 1) * 3 + 1], pos[(ring + 1) * 3 + 2]];
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]];
  // The middle of the section the face belongs to, on the blade's own axis.
  const mid = [0, A[1], 0];
  if (n[0] * (A[0] - mid[0]) + n[2] * (A[2] - mid[2]) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

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
    // out clear of the hull has and which nothing else holds up. Two legs,
    // splayed up and inboard to the plating rather than standing on nothing:
    // one is a strut, two is a bracket, and a bracket is what she had.
    for (const lean of [-0.52, 0.52]) {
      const arm = box(g, M.antifoul, 0.30, 4.2, 1.05,
        x + Math.sin(lean) * 1.9, y + 2.0, z + 5.4);
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
    // The boss: a short barrel with the fairwater cone on the after end of it,
    // which is what closes the shaft off behind the nut.
    cyl(hub, M.brass, 0.58, 0.64, 1.25, 0, 0, 0.15, 16).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.10, 0.58, 1.15, 0, 0, -1.05, 16).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      // The root starts inside the boss, so the blade grows out of it instead
      // of being planted on the face of it.
      const bl = new THREE.Mesh(bladeGeo(0.50, r, hand), M.brass);
      bl.rotation.z = (i / 4) * Math.PI * 2;
      hub.add(bl);
    }
    g.add(hub);
  }
  // The skeg on the centreline between the inner shafts, which is what the
  // sternpost and the forward rudder hang on.
  //
  // Lofted rather than laid as a stack of boxes: a box is a straight sheet
  // between two stations, and ten of them following a counter that rises a
  // metre and a half over its length come out as a staircase under her.
  {
    const sk = strip();
    const NK = 16;
    const prof = (k) => {
      const t = -0.80 - k * 0.145;
      const y = -8.5 + k * 1.9;
      return [Math.max(0.35, 0.78 - k * 0.22), y, at(t, y)];
    };
    for (let i = 0; i < NK; i++) {
      const [wa, ya, za] = prof(i / NK);
      const [wb, yb, zb] = prof((i + 1) / NK);
      for (const sgn of [-1, 1]) {
        sk.quad([sgn * wa, ya, za], [sgn * wa, ya + 2.7, za],
          [sgn * wb, yb + 2.7, zb], [sgn * wb, yb, zb], [sgn, 0, 0]);
        sk.quad([sgn * wa, ya, za], [0, ya - 0.25, za],
          [0, yb - 0.25, zb], [sgn * wb, yb, zb], [sgn, -1, 0]);
      }
    }
    sk.mesh(g, M.antifoul);
  }
  // Two rudders in tandem on the centreline, which is the Yamato arrangement
  // and the reason a hull this size turns as tightly as she does.
  //
  // Each is a plate with a nose on it rather than a slab: a rudder is an
  // aerofoil, thickest a third of the way back from its leading edge, and part
  // of its area stands forward of the stock so the water helps turn it. A
  // rectangle does not read as a rudder from any angle at all.
  for (const [t, hgt, chordLen] of [[-0.895, 6.4, 5.0], [-0.945, 4.4, 3.4]]) {
    const y = -6.0;
    const z = at(t, y);
    const rud = new THREE.Group();
    rud.position.set(0, y, z);
    // The section, as a fraction of the chord: the four-digit thickness line,
    // which is the shape a rudder of this date was faired to. Seven boxes in a
    // stack gave the right silhouette from abeam and a flight of steps from
    // anywhere else, so the whole blade is lofted instead.
    const NC = 16;
    const NV = 5;
    const TR = 0.17;
    const half = (s, c) => 5 * TR * c * (0.2969 * Math.sqrt(s) - 0.1260 * s
      - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1015 * s ** 4);
    const layers = [];
    for (let k = 0; k <= NV; k++) {
      const v = k / NV;                    // 0 at the head, 1 at the heel
      const c = chordLen * (1 - 0.16 * v * v);
      const loop = [];
      for (let i = 0; i <= NC; i++) {
        const sx = i / NC;
        loop.push([half(sx, c), c * (0.5 - sx)]);
      }
      for (let i = NC - 1; i >= 1; i--) {
        const sx = i / NC;
        loop.push([-half(sx, c), c * (0.5 - sx)]);
      }
      // Heel first, so the loft runs bottom to top the way it wants to.
      layers.unshift({ pts: loop, y: hgt * (0.5 - v) });
    }
    loftShape(rud, M.gunDark, layers, { cap: true, floor: true });
    // The stock, a third of the chord back from the leading edge, carried up
    // through the counter into the steering gear.
    cyl(g, M.gunDark, 0.42, 0.42, 3.4, 0, y + hgt / 2 + 1.3, z + chordLen * 0.17, 12);
    rud.userData.rudder = true;
    g.add(rud);
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
 * The station her deck edge is at a given point of her length.
 *
 * It is not z / (LOA / 2). Her stem rakes seven metres forward between the
 * water and the deck edge, so the station whose deck edge is at the forward
 * end of the flight deck is a good way abaft the one the ratio gives -- and
 * built to the ratio the plating runs on ten metres past where the flight deck
 * stops and then gets clamped, which leaves a triangular shelf standing out of
 * her bow that is in no drawing of any ship.
 */
function tAtZ(z) {
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    if (F.zAt(mid, sheer(mid)) < z) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The scallops: where her side is cut away to let a gun sponson into it.
 *
 * This is the thing that makes a carrier's deck edge look the way it does, and
 * the thing that was missing. A sponson is not a drum bolted to the outside of
 * the plating -- the plating is taken in round it, and the tub sits in the
 * recess with its rim out level with the deck edge above. Built without the
 * recess there is nowhere for a tub to go but outboard of the ship, so every
 * one of them ends up standing two to five metres off her side in the air with
 * a pair of struts under it, which from any angle forward of the beam is a row
 * of dustbins hung on a wall.
 *
 * One entry per mounting at the deck edge, at the station it stands at, with
 * how far the plating comes in for it and how far along her the cut runs.
 */
const SCALLOPS = [];
/** What each battery stands in: the tub's radius, its floor, and the recess. */
const TUBS = {
  turret: { r: 3.20, deep: 2.20, wall: 0.85 },
  aa: { r: 2.30, deep: 1.50, wall: 0.80 },
  rocket: { r: 2.45, deep: 1.60, wall: 0.92 },
};
for (const [spec, tub] of [
  ...CLS.turrets.map((s) => [s, TUBS.turret]),
  ...CLS.aa.guns[0].mounts.map((s) => [s, TUBS.aa]),
  ...CLS.aa.guns[1].mounts.map((s) => [s, TUBS.rocket]),
]) {
  if (spec.where && spec.where !== 'edge') continue;
  SCALLOPS.push({ z: spec.z, deep: tub.deep, half: tub.r + 1.3 });
}
/** How deep her side is cut at a station, faired in and out of the recess. */
function scallop(z) {
  let cut = 0;
  for (const s of SCALLOPS) {
    const d = Math.abs(z - s.z);
    if (d >= s.half) continue;
    cut = Math.max(cut, s.deep * 0.5 * (1 + Math.cos((Math.PI * d) / s.half)));
  }
  return cut;
}
/**
 * And the same cut at a height: full at the head of the plating, dying out a
 * couple of metres under the gun floors.
 *
 * A recess carried all the way down is a hull with twenty-odd bites out of its
 * side at the waterline. What she has is a gallery deck let into the top of
 * the side, and nothing below it.
 */
const SCALLOP_LO = FD - 5.8;
function scallopAt(z, y) {
  const c = scallop(z);
  if (c <= 0) return 0;
  return c * ease((y - SCALLOP_LO) / (HANGAR_TOP - SCALLOP_LO));
}

/**
 * How far out her plating is at a point of her length and a height -- below
 * the sheer off her own offsets, and above it up the faired side that carries
 * her to the flight deck, less whatever is cut out of it there.
 *
 * Everything hung on her side wants this and not `sideTop`. A gun floor is
 * three metres under the deck edge, and the plating there is a good way inside
 * where it is at the head of it: a sponson cut against the head hangs off the
 * side of her with daylight behind it, which is exactly what every one of them
 * was doing.
 */
function sideProfile(t, z, y) {
  const y0 = sheer(t);
  if (y <= y0) return F.shellAt(t, Math.max(y, F.keelY(t) + 0.05));
  const w0 = F.shellAt(t, y0);
  const w1 = sideTop(z);
  const u = clamp((y - y0) / Math.max(0.5, HANGAR_TOP - y0), 0, 1);
  return Math.max(1.0, w0 + (w1 - w0) * ease(u) - scallopAt(z, y));
}
export function sideAt(z, y) { return sideProfile(tAtZ(z), z, y); }

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
  const tA = tAtZ(FD_AFT);
  const tF = tAtZ(FD_FWD);
  const N = 150;
  // And it is plated in rows up the side rather than in one sheet from the
  // sheer to the deck edge.
  //
  // Forward the head of this plating stands four metres outboard of the shell
  // under it, because the flight deck is forty metres across where the hull is
  // twenty-eight: run as a single quad that is one flat sheet leaning out at
  // fifty degrees, and it reads from ahead as a shelf welded on to her bow.
  // Taken up in rows on a faired profile it leaves the sheer very nearly
  // upright and rolls out to meet the deck edge, which is the Taiho bow and
  // the thing that makes her ends look drawn rather than cut.
  //
  // And it is the rows that carry her scallops: the recess a sponson sits in
  // is a hollow in this plating and nothing else, so it has to be drawn by the
  // same sheet that draws the side or the tub is let into a hole with no wall
  // behind it.
  const ROWS = 8;
  const { quad, mesh } = strip();
  const top = strip();
  const foot = (t) => [F.shellAt(t, sheer(t)), sheer(t), F.zAt(t, sheer(t))];
  // One station's profile, as [x, y] up the side.
  const at = (t, z, y0, u) => {
    const y = y0 + (HANGAR_TOP - y0) * u;
    return [sideProfile(t, z, y), y];
  };
  // Finer along her length through the scallops than between them: the recess
  // for a 25 mm tub is five metres of her length, and at the spacing the rest
  // of the side wants it comes out as a dent with two corners in it.
  const zs = [];
  for (let i = 0; i <= N; i++) zs.push(tA + ((tF - tA) * i) / N);
  for (const s of SCALLOPS) {
    const t0 = tAtZ(s.z - s.half);
    const t1 = tAtZ(s.z + s.half);
    for (let k = 0; k <= 10; k++) zs.push(t0 + ((t1 - t0) * k) / 10);
  }
  zs.sort((a, b) => a - b);
  const ts = zs.filter((t, i) => t >= tA && t <= tF && (i === 0 || t - zs[i - 1] > 1e-5));
  for (let i = 0; i < ts.length - 1; i++) {
    const ta = ts[i];
    const tb = ts[i + 1];
    const [, ya, za] = foot(ta);
    const [, yb, zb] = foot(tb);
    for (let r = 0; r < ROWS; r++) {
      const [xa0, ya0] = at(ta, za, ya, r / ROWS);
      const [xa1, ya1] = at(ta, za, ya, (r + 1) / ROWS);
      const [xb0, yb0] = at(tb, zb, yb, r / ROWS);
      const [xb1, yb1] = at(tb, zb, yb, (r + 1) / ROWS);
      for (const sgn of [-1, 1]) {
        quad([sgn * xa0, ya0, za], [sgn * xa1, ya1, za],
          [sgn * xb1, yb1, zb], [sgn * xb0, yb0, zb], [sgn, 0, 0]);
      }
    }
    // The head of the plating follows the flight deck's own outline in, so
    // where the deck draws in at the ends the side comes with it -- and where
    // a sponson is let into her, the soffit over it widens to suit.
    const ha = at(ta, za, ya, 1)[0];
    const hb = at(tb, zb, yb, 1)[0];
    for (const sgn of [-1, 1]) {
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
  //
  // Cut in the same rows the sides are plated in, so the three sheets share
  // their corners: a single quad across the end stands inboard of a curved
  // side through the middle heights, and the gap between them is a slot up
  // her stem that a ray from ahead goes straight through.
  for (const [t, z, out] of [[tF, FD_FWD, 1], [tA, FD_AFT, -1]]) {
    const [, y] = foot(t);
    const end = strip();
    for (let r = 0; r < ROWS; r++) {
      const [x0, y0] = at(t, z, y, r / ROWS);
      const [x1, y1] = at(t, z, y, (r + 1) / ROWS);
      end.quad([-x0, y0, z], [x0, y0, z], [x1, y1, z], [-x1, y1, z], [0, 0, out]);
    }
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
  // Off the deck's own stations, so the girder is the sheet's edge to the
  // millimetre and follows it round the noses at both ends.
  const edge = deckStations(N * 2);
  for (let i = 0; i < edge.length - 1; i++) {
    const z0 = edge[i];
    const z1 = edge[i + 1];
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
    // Not over the round-downs: a flat strip a third of a metre long will not
    // lie down on a deck that is falling away under it.
    if (fdDrop(z) > 0.5) continue;
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
  // The narrowest the deck gets anywhere under a mark, which is what a mark
  // has to be cut to.
  //
  // A bar laid to the half-breadth at its own centre is a bar that hangs over
  // the deck edge at both its ends wherever the deck is drawing in -- and the
  // deck draws in hardest over the round-down, which is exactly where the
  // bars are. What it looks like is a row of red and white slivers floating
  // off her quarters.
  const narrow = (z, len) => {
    let w = Infinity;
    for (let k = -2; k <= 2; k++) w = Math.min(w, fdHalf(z + (k * len) / 4));
    return w;
  };
  // A band painted right across her, laid on the deck rather than laid at one
  // height across it.
  //
  // Every mark that runs athwartships is a box, and a box is flat. On the
  // parallel middle of the deck that is right; over the round-down, where she
  // falls away better than a third of a metre in every metre of her length, a
  // flat bar two metres long is buried at one end and standing clear of the
  // deck at the other -- and the last of them, where the deck has rounded
  // away under it as well, is a red plank hanging in the air off her quarter.
  // Drawn as a sheet that follows both, it stays paint.
  const band = (m, z0, z1, lift = 0.02, inset = 0.10) => {
    const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.6));
    const pos = [];
    const idx = [];
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      const w = Math.max(0.2, fdHalf(z) - inset);
      const y = fdY(z) + 0.06 + lift;
      pos.push(-w, y, z, w, y, z);
    }
    for (let i = 0; i < n; i++) {
      const a2 = i * 2;
      const b2 = (i + 1) * 2;
      idx.push(a2, b2 + 1, a2 + 1, a2, b2, b2 + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  };

  // The centreline, dashed, the whole length of the landing and range area --
  // and not across the two wells, because paint laid over a hole is paint
  // hanging in the air the moment the lift goes down.
  for (let z = FD_AFT + RD_AFT; z < FD_FWD - 30; z += 6.2) {
    if (wellHalf(z) > 0 || wellHalf(z + 1.8) > 0 || wellHalf(z - 1.8) > 0) continue;
    line(M.stripe, 0.55, 3.6, 0, z);
  }
  // The two long lines down either side, inboard of the deck edge: what a
  // pilot lines up on and what keeps a wheel off the girder in a crosswind.
  for (let z = FD_AFT + RD_AFT - 4; z < FD_FWD - 18; z += 5) {
    for (const sgn of [-1, 1]) {
      const w = narrow(z + 2.5, 5.1) - 2.6;
      line(M.stripe, 0.35, 5.1, sgn * w, z + 2.5, 0.005);
    }
  }
  // The landing area, marked out aft: a long box a pilot sets her down inside,
  // with a bar across each end of it.
  // The landing area begins where the round-down ends, because that is where
  // there is deck to land on: laid over the fall-away it is a box painted on a
  // slope a pilot cannot put a wheel on.
  const la0 = FD_AFT + RD_AFT;
  const la1 = la0 + 84;
  for (const sgn of [-1, 1]) {
    for (let z = la0; z < la1; z += 6) {
      const w = narrow(z + 3, 6.1) - 6.4;
      line(M.stripe, 0.5, 6.1, sgn * w, z + 3, 0.01);
    }
  }
  for (const z of [la0, la1]) {
    line(M.stripe, (narrow(z, 0.5) - 6.4) * 2, 0.5, 0, z, 0.01);
  }

  // The barred round-down aft: red and white across the whole width of the
  // deck, over the last twenty metres of it.
  //
  // Not over the whole fall-away. The round-down is a long gentle roll and
  // the bars are a warning painted at the end of it -- carried the whole
  // length of the curve they are an eighth of her flight deck in stripes,
  // which is a good deal more of her in red than she ever wore.
  const rd = FD_AFT + 17;
  const bars = 9;
  for (let i = 0; i < bars; i++) {
    const z0 = FD_AFT + (i * (rd - FD_AFT)) / bars;
    const z1 = z0 + (rd - FD_AFT) / bars;
    band(i % 2 ? M.stripeRed : M.stripe, z0, z1, 0.01);
  }
  // The white bar across the forward edge of the barred area, which is where
  // a pilot is told the deck begins to fall away.
  band(M.stripe, rd, rd + 0.7, 0.02);

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
    const z = FD_AFT + RD_AFT + 3 + i * 5.2;
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
  for (let z = FD_AFT + RD_AFT + 4; z < FD_FWD - 30; z += 9.5) {
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
  for (let z = FD_AFT + RD_AFT + 2; z < FD_FWD - 24; z += 7.5) {
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
  const L1 = ISLE[0];
  const I1 = FD + L1.y;
  const R1 = isleLevel(g, I1, L1.h, L1.hw, z + L1.zF, z + L1.zB, L1.nose, L1.tail,
    L1.lip);
  isleWindows(g, I1 + 2.15, L1.hw + 0.05, z + L1.zF - 0.2, z - 6.0, 6, L1.nose);
  isleDoor(g, I1, z + L1.zB + 0.3, L1.hw);
  planRail(g, M.steelDark, R1, I1 + L1.h + 0.22);
  // The flag lockers and the halyard cleats along the signal deck.
  for (let i = 0; i < 5; i++) {
    box(g, M.steelDark, 0.9, 0.85, 1.05, x + L1.hw - 0.5, I1 + L1.h + 0.66,
      z - 8.0 + i * 1.9);
  }

  // Level two: the navigating bridge and the chart house.
  const L2 = ISLE[1];
  const I2 = FD + L2.y;
  const R2 = isleLevel(g, I2, L2.h, L2.hw, z + L2.zF, z + L2.zB, L2.nose, L2.tail,
    L2.lip);
  isleWindows(g, I2 + 2.0, L2.hw + 0.05, z + L2.zF - 0.2, z - 5.0, 5, L2.nose);
  isleDoor(g, I2, z + L2.zB + 0.3, L2.hw);
  planRail(g, M.steelDark, R2, I2 + L2.h + 0.22);

  // Level three: the compass platform, with its wings out over the deck edge
  // and a pelorus on each of them. It is the level she is conned from and it
  // is the one that has to read as a bridge.
  const L3 = ISLE[2];
  const I3 = FD + L3.y;
  const R3 = isleLevel(g, I3, L3.h, L3.hw, z + L3.zF, z + L3.zB, L3.nose, L3.tail,
    L3.lip);
  isleWindows(g, I3 + 1.9, L3.hw + 0.05, z + L3.zF - 0.2, z - 4.0, 5, L3.nose);
  // The windbreak round the front of the compass platform: a plated bulwark
  // with the rail on top of it, not bare stanchions. She is conned from up
  // here at thirty knots and a rail on its own would be nothing to stand
  // behind.
  const bul = islePlan(L3.hw + L3.lip, z + L3.zF + L3.lip, z - 2.0,
    L3.nose + L3.lip * 0.6, 1.2);
  loftShape(g, M.steel, [
    { pts: bul, y: I3 + L3.h + 0.22 }, { pts: bul, y: I3 + L3.h + 1.32 },
  ], { cap: false });
  planRail(g, M.steelDark, R3, I3 + L3.h + 0.22);
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
  const I4 = I3 + L3.h;
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
function isleWindows(g, y, hw, zFront, zBack, n, nose = hw * 0.75) {
  // One strip of glass a side with the mullions across it, not a row of square
  // panes: a bridge window is a continuous band and a row of separate squares
  // is a wardroom.
  //
  // Let a hand's breadth into the face rather than laid on the outside of it.
  // A band of glass standing at the house's own half-breadth is a band of
  // glass standing a centimetre outside it, and where the plan turns -- which
  // on a bullnose is the whole of the front -- the two corners of it come out
  // through the plating and hang in the air either side of the bridge.
  const IN = 0.13;
  for (const sgn of [-1, 1]) {
    box(g, M.glass, 0.10, 0.95, zFront - zBack, ISL_X + sgn * (hw - IN), y,
      (zFront + zBack) / 2);
    for (let i = 0; i <= n; i++) {
      const dz = zBack + ((zFront - zBack) * i) / n;
      box(g, M.steel, 0.13, 1.05, 0.16, ISL_X + sgn * (hw - IN + 0.02), y, dz);
    }
    // The sill under the band and the eyebrow over it, which is what throws
    // the weather and the sun off the glass and what gives a bridge front its
    // line from a mile away.
    box(g, M.steel, 0.16, 0.20, zFront - zBack, ISL_X + sgn * (hw - IN + 0.04),
      y - 0.58, (zFront + zBack) / 2);
    box(g, M.steelDark, 0.30, 0.16, zFront - zBack, ISL_X + sgn * (hw - IN + 0.10),
      y + 0.62, (zFront + zBack) / 2);
  }
  // And across the face, following the bullnose round rather than laid flat
  // across it: a run of lights set on the arc, which is how the front of a
  // Japanese island is glazed. Laid flat, the middle of the pane is a foot
  // inside the plating and its two ends a foot outside it.
  const arc = 5;
  const at = (k) => {
    const a = (k / arc) * (Math.PI / 2) * 0.92;
    return [Math.sin(a) * (hw - IN), (zFront - nose) + (nose - IN) * Math.cos(a)];
  };
  for (let i = -arc; i < arc; i++) {
    const [px, pz] = at(i);
    const [qx, qz] = at(i + 1);
    const len = Math.hypot(qx - px, qz - pz) + 0.02;
    const pane = box(g, M.glass, 0.10, 0.95, len,
      ISL_X + (px + qx) / 2, y, (pz + qz) / 2);
    pane.rotation.y = Math.atan2(qx - px, qz - pz);
    const brow = box(g, M.steelDark, 0.30, 0.16, len,
      ISL_X + (px + qx) / 2, y + 0.62, (pz + qz) / 2);
    brow.rotation.y = pane.rotation.y;
  }
  for (let i = -arc; i <= arc; i++) {
    const [px, pz] = at(i);
    box(g, M.steel, 0.16, 1.05, 0.14, ISL_X + px, y, pz);
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
/**
 * The plan of a funnel casing: a rectangle with its four corners rounded off.
 *
 * Which is what a Japanese uptake casing is, and what an ellipse is not. Drawn
 * as an oval her funnel has no flats on it at all, so the stiffeners, the
 * ladder and the platform all sit on a curve and it reads as a piece of pipe;
 * drawn as a rectangle it reads as a box. It is a rounded rectangle: flat
 * sided fore and aft, flat athwartships, and a quarter circle at each corner.
 */
function boxPlan(hw, hd, rad, arc = 4) {
  const r = Math.min(rad, hw, hd);
  const pts = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    for (let i = 0; i <= arc; i++) {
      // Each corner swept from the side round to the end, so the four run on
      // into one another without a repeated point.
      const a = (i / arc) * (Math.PI / 2);
      const ca = sx * sz > 0 ? a : Math.PI / 2 - a;
      pts.push([sx * (hw - r + r * Math.cos(ca)), sz * (hd - r + r * Math.sin(ca))]);
    }
  }
  return pts;
}

function funnel(g) {
  const f = new THREE.Group();
  // Hung off the flight deck rather than off the top of the casing, and with
  // its foot carried down inside the island: the casing, the trunking and the
  // funnel are one piece of structure on Taiho, and a stack that begins at the
  // deck line is a chimney standing on a shed.
  f.position.set(ISL_X, FD + 0.2, ISL_Z - 15.2);
  f.rotation.z = S * -0.454;   // twenty-six degrees outboard
  const FOOT = -5.2;
  const H = 15.4;
  // The casing: a rounded rectangle in plan, half again as long fore and aft
  // as it is across, drawn in five layers so the taper is a curve and not a
  // cone. Twelve Kampon boilers trunk into this one uptake, and it has to look
  // as though they could.
  const SEC = [
    [FOOT, 3.78, 5.24, 1.48],
    [0.0, 3.50, 4.90, 1.40],
    [5.0, 3.20, 4.50, 1.32],
    [10.4, 2.90, 4.12, 1.24],
    [H, 2.66, 3.80, 1.18],
  ];
  const at = (y) => {
    let i = 0;
    while (i < SEC.length - 2 && y > SEC[i + 1][0]) i++;
    const [y0, w0, d0, r0] = SEC[i];
    const [y1, w1, d1, r1] = SEC[i + 1];
    const u = clamp((y - y0) / (y1 - y0), 0, 1);
    const e = ease(u);
    return [w0 + (w1 - w0) * e, d0 + (d1 - d0) * e, r0 + (r1 - r0) * e];
  };
  const plan = (y, out = 0) => {
    const [w, d, r] = at(y);
    return boxPlan(w + out, d + out, r + out * 0.5);
  };
  const HS = [FOOT, -2.6, 0, 2.5, 5.0, 7.7, 10.4, 12.9, H];
  loftShape(f, M.steel, HS.map((y) => ({ pts: plan(y), y })), { cap: false });
  // The vertical strakes up its corners and its flats, which is the whole of
  // what gives a funnel this size any scale at all. Each is a short stack of
  // plates following the taper, so it lies on the casing the whole way up
  // instead of standing off it at the top.
  for (const [ux, uz] of [[1, 0.62], [-1, 0.62], [1, -0.62], [-1, -0.62],
    [0, 1], [0, -1]]) {
    const NB = 8;
    const y0 = -1.4;
    const y1 = H - 1.0;
    for (let i = 0; i < NB; i++) {
      const ya = y0 + (y1 - y0) * (i / NB);
      const yb = y0 + (y1 - y0) * ((i + 1) / NB);
      const [wa, da] = at(ya);
      const [wb, db] = at(yb);
      // Standing a hand's breadth proud of the plating, not let into it: a
      // strake flush with the casing is a seam, and a seam at this range is
      // nothing at all.
      box(f, M.steelDark, ux ? 0.22 : 0.64, yb - ya, ux ? 0.64 : 0.22,
        (ux * (wa + 0.04) + ux * (wb + 0.04)) / 2, (ya + yb) / 2,
        (uz * (da + 0.04) + uz * (db + 0.04)) / 2);
    }
  }
  // The hoops that stiffen it, which is what a funnel of this size is banded
  // with and what gives the eye something to measure its height against.
  for (const y of [-1.0, 3.4, 8.0, 12.4]) {
    loftShape(f, M.steelDark, [
      { pts: plan(y, 0.16), y: y - 0.17 }, { pts: plan(y, 0.16), y: y + 0.17 },
    ], { cap: false });
  }
  // The coaming round the mouth: a raised rim standing proud of the casing,
  // flared out over the rain lip below it, which is the shape of the funnel
  // head on every drawing of Taiho.
  const rim = plan(H, 0.30);
  loftShape(f, M.gunDark, [
    { pts: plan(H, 0.46), y: H - 1.05 }, { pts: rim, y: H - 0.62 },
  ], { cap: false });
  loftShape(f, M.gunDark, [
    { pts: rim, y: H - 0.62 }, { pts: rim, y: H + 0.52 },
  ], { cap: false });
  // The mouth itself: a hole, with the uptake going down out of sight in it.
  //
  // A funnel used to be capped with a flat disc a good deal wider than the
  // casing, which from anywhere above her reads as a lid. What is up there is
  // an opening: the coaming round it, the dark of the uptake inside it, and
  // the grating across the top that stops anything falling down the boilers.
  const mouth = strip();
  const lo = plan(H, -0.42);
  const hi = plan(H, -0.14);
  for (let i = 0; i < lo.length; i++) {
    const j = (i + 1) % lo.length;
    mouth.quad([lo[i][0], H - 3.0, lo[i][1]], [hi[i][0], H + 0.44, hi[i][1]],
      [hi[j][0], H + 0.44, hi[j][1]], [lo[j][0], H - 3.0, lo[j][1]],
      [-(lo[i][0] + lo[j][0]) / 2, 0, -(lo[i][1] + lo[j][1]) / 2]);
  }
  mouth.mesh(f, M.cave);
  loftShape(f, M.cave, [
    { pts: lo, y: H - 3.2 }, { pts: lo, y: H - 3.0 },
  ], { cap: true, floor: false });
  // The grating over it: bars both ways, each cut to the mouth at its own
  // place on it.
  //
  // Run to the full breadth of the funnel every one of them, the bars near
  // the ends stand a metre and a half out past a casing that has already
  // rounded away under them -- which from the air is four dark fins on the
  // funnel head and is what this looked like.
  const [MWf, MDf, MRf] = at(H);
  const MW = MWf - 0.28;
  const MD = MDf - 0.28;
  const MR = MRf - 0.10;
  const across = (u) => (Math.abs(u) <= MD - MR ? MW
    : (MW - MR) + Math.sqrt(Math.max(0, MR * MR - (Math.abs(u) - (MD - MR)) ** 2)));
  const along = (u) => (Math.abs(u) <= MW - MR ? MD
    : (MD - MR) + Math.sqrt(Math.max(0, MR * MR - (Math.abs(u) - (MW - MR)) ** 2)));
  for (let i = -4; i <= 4; i++) {
    const dz = i * 0.84;
    box(f, M.gunDark, across(dz) * 2, 0.13, 0.20, 0, H + 0.22, dz);
  }
  for (let i = -2; i <= 2; i++) {
    const dx = i * 1.10;
    box(f, M.gunDark, 0.16, 0.13, along(dx) * 2, dx, H + 0.35, 0);
  }
  // The steam pipes up its after face and the siren on its bracket.
  cyl(f, M.steelDark, 0.28, 0.28, H + 2.0, 0, (H - 2.0) / 2, -4.15, 8);
  cyl(f, M.steelDark, 0.20, 0.20, H + 0.4, 0.95, (H - 3.4) / 2, -4.00, 8);
  cyl(f, M.gunDark, 0.34, 0.34, 0.70, 0, H * 0.98, -4.15, 10);
  // The platform round the funnel at two-thirds of its height, which is where
  // the sweeps get at it, with its rail.
  const PL = H * 0.62;
  const deck = plan(PL, 1.00);
  loftShape(f, M.steelDark, [
    { pts: deck, y: PL - 0.11 }, { pts: deck, y: PL + 0.11 },
  ], { cap: true, floor: true });
  for (let i = 0; i < deck.length; i += 2) {
    cyl(f, M.steelDark, 0.045, 0.045, 0.9, deck[i][0], PL + 0.66, deck[i][1], 5);
  }
  for (const h of [0.40, 0.72, 1.0]) {
    for (let i = 0; i < deck.length; i++) {
      const j = (i + 1) % deck.length;
      const len = Math.hypot(deck[j][0] - deck[i][0], deck[j][1] - deck[i][1]);
      const w = box(f, M.steelDark, 0.05, 0.05, len, (deck[i][0] + deck[j][0]) / 2,
        PL + 0.22 + 0.9 * h, (deck[i][1] + deck[j][1]) / 2);
      w.rotation.y = Math.atan2(deck[j][0] - deck[i][0], deck[j][1] - deck[i][1]);
    }
  }
  // And a vertical ladder up its after face from the casing to that platform.
  const LZ = -(at(0)[1] + 0.08);
  for (let i = 0; i < Math.round((PL - 0.7) / 0.34); i++) {
    cyl(f, M.bright, 0.03, 0.03, 0.56, 0, 0.7 + i * 0.34, LZ, 5)
      .rotation.z = Math.PI / 2;
  }
  for (const dx of [-0.28, 0.28]) {
    box(f, M.bright, 0.07, PL - 0.4, 0.07, dx, PL / 2 + 0.5, LZ);
  }
  g.add(f);
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
  // Two 110 cm searchlights on platforms bracketed off the uptake casing,
  // standing out over the water.
  //
  // They were on the inboard side of it, which is the side the flight deck is
  // on: a searchlight there looks along her own runway and is half buried in
  // her own bridge. A carrier puts them outboard, where there is sea to point
  // them at.
  for (const dz of [-8.4, -13.0]) {
    const px = x + S * 4.4;
    const pad = [
      [px - 1.5, z + dz + 1.6], [px + 1.5, z + dz + 1.6],
      [px + 1.5, z + dz - 1.6], [px - 1.5, z + dz - 1.6],
    ];
    loftShape(g, M.steelDark, [
      { pts: pad, y: FD + 6.5 }, { pts: pad, y: FD + 6.72 },
    ], { cap: true, floor: true });
    planRail(g, M.steelDark, pad, FD + 6.72, 0.95);
    searchlight(g, M, px, FD + 6.8, z + dz, 0.78);
    for (const d of [-1.1, 1.1]) {
      const knee = box(g, M.steelDark, 2.2, 0.85, 0.22, x + S * 3.0, FD + 5.7, z + dz + d);
      knee.rotation.z = -S * 0.5;
    }
  }
  // The flag deck: halyard cleats and the two signal yards on the inboard
  // side, where the bunting is worked from.
  for (let i = 0; i < 6; i++) {
    box(g, M.steelDark, 0.24, 0.5, 0.18, x + ISLE[0].hw + ISLE[0].lip - 0.2,
      FD + ISLE[0].y + ISLE[0].h + 0.5, z - 4.0 + i * 1.5);
  }
  // Louvred vents down the after face of the island, which every deckhouse on
  // a Japanese ship carries and which is most of what breaks the plating up.
  for (const [dy, dz] of [[3.2, -11.6], [6.5, -10.9], [9.8, -10.2]]) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 1.1, 1.3, 0.12, x + sgn * 1.9, FD + dy, dz + z);
      for (let k = -2; k <= 2; k++) {
        box(g, M.cave, 0.95, 0.11, 0.06, x + sgn * 1.9, FD + dy + k * 0.24,
          dz + z - 0.07);
      }
    }
  }
  // Ladders up the inboard face of the island, level to level, which is how a
  // man gets from the flight deck to the bridge.
  for (const lv of ISLE) {
    ladder(g, M.steelDark, x + lv.hw + 0.06, FD + lv.y, FD + lv.y + lv.h,
      z - 9.6 - (4.10 - lv.hw), z - 10.9 - (4.10 - lv.hw));
  }
  // And the last flight, from the compass platform up on to the air defence
  // platform over it.
  ladder(g, M.steelDark, x + ISLE[2].hw + 0.06, FD + ISLE[2].y + ISLE[2].h,
    FD + ISLE[2].y + ISLE[2].h + 3.0, z - 5.6, z - 6.9);
  // And the vertical ladder up her outboard face, from the deck to the air
  // defence platform: the one a lookout goes up when there is no time to walk
  // round to the other side of the island.
  sideLadder(g, M.steelDark, {
    out: -1, skin: Math.abs(ISL_X) + 3.5, z: z + 2.6,
    y0: FD + 1.0, y1: FD + 12.4, half: 0.26, stand: 0.20, rail: 0.75,
  });
  // The signal yards and the flag lockers on the flag deck.
  for (const dz of [z + 6.6, z + 4.0]) {
    box(g, M.steelDark, 1.2, 0.9, 1.0, x + ISLE[0].hw - 0.7,
      FD + ISLE[0].y + ISLE[0].h + 0.9, dz);
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
  // Against her plating at the height the walkway is actually at, not at the
  // head of the side three metres above it: a catwalk laid to the head hangs a
  // metre off her hull for the length of the ship.
  const inner = (z) => sideAt(z, GALLERY) + 0.1;
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
      const br = box(g, M.steelDark, 2.0, 0.85, 0.22, sgn * (sideAt(z, GALLERY) + 0.95),
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

  // The sponsons the 12.7 cm twins stand in: two at each corner, let into the
  // recesses cut for them in her side.
  for (const spec of CLS.turrets) {
    const sgn = Math.sign(spec.x);
    const fy = TURRET_Y;
    sponson(g, spec.x, spec.z, TUBS.turret.r, fy, TUBS.turret.wall);
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
    sponson(g, spec.x, spec.z, TUBS.aa.r, AA_Y, TUBS.aa.wall);
  }
  for (const spec of CLS.aa.guns[1].mounts) {
    if (mountKind(spec) !== 'edge') continue;
    sponson(g, spec.x, spec.z, TUBS.rocket.r, ROCKET_Y, TUBS.rocket.wall);
  }
}

/**
 * The plan of a sponson: a circle of radius `r` about (cx, z), carried back on
 * to the ship's side at `xin` however far off it the gun happens to stand.
 *
 * This is the whole of what makes a sponson a sponson rather than a drum hung
 * on the ship. A gun tub at a carrier's deck edge is a piece of platform
 * carried out from her side and plated round its outboard edge: its inboard
 * side is the ship. Drawn as a full circle centred on the gun, a third of
 * every one of them is inside the hull -- so from alongside her deck edge is a
 * row of plating bulges standing in the middle of her own side, and from
 * inside a compartment the tub is a disc through the wall.
 *
 * And drawn as a full circle that never reaches the hull at all -- which is
 * what every one of them was, because a gun laid out at the flight deck's
 * half-breadth stands two to five metres outboard of plating that is drawn to
 * the hull's -- it is a bare drum floating alongside her with daylight all
 * round it and two thin struts in the air under it. That is the one thing
 * about her the eye goes to first.
 *
 * So there are two cases and both of them end on the plating. If the circle
 * cuts the side, what comes back is the outboard arc and the chord that closes
 * it lies along the ship. If it clears the side entirely, what comes back is
 * the arc and a throat: two runs of plating from the back of the tub to the
 * side, which is how a platform carried out on brackets is actually plated in.
 */
function sponsonPlan(cx, z, r, xin, n = 16) {
  const sgn = Math.sign(cx) || 1;
  const out = Math.abs(cx);
  const inb = Math.abs(xin);
  const d = out - inb;
  const pts = [];
  // How far round the tub the plating runs before it turns for the ship. A
  // tub that cuts the side is closed on the chord; one that stands clear of it
  // keeps a little better than three-quarters of its circle and necks in.
  const A = d >= r * 0.92 ? Math.PI * 0.80 : Math.acos(clamp(-d / r, -1, 1));
  for (let i = 0; i <= n; i++) {
    const a = -A + (2 * A * i) / n;
    pts.push([sgn * (out + Math.cos(a) * r), z + Math.sin(a) * r]);
  }
  if (d < r * 0.92) return pts;
  // The throat. One point half way in, so the run from the tub to the side is
  // a curve rather than a straight taper, and one on the plating itself.
  const tail = Math.sin(A) * r;
  for (const k of [1, -1]) {
    pts.push([sgn * (inb + d * 0.42), z + k * tail * 0.74]);
    pts.push([sgn * inb, z + k * tail * 0.40]);
  }
  // Wound as one loop: up the starboard side of the throat, round the arc, and
  // back down the port side of it.
  return [pts[pts.length - 1], pts[pts.length - 2],
    ...pts.slice(0, n + 1), pts[n + 1], pts[n + 2]];
}

/**
 * One sponson, built: the floor, the splinter plating round its outboard edge,
 * the plated haunch under it and the knees that carry it off her side.
 *
 * `fy` is the floor the gun stands on, so the floor a gun is put on and the
 * floor the model draws are the same number.
 */
function sponson(g, cx, z, r, fy, wall, m = M.steel) {
  const sgn = Math.sign(cx) || 1;
  // Cut against the plating at the height of the gun floor, not at the head of
  // the side three metres above it, and tucked a hand's breadth into it rather
  // than flush: two surfaces at the same place fight for the depth buffer and
  // the sponson shows through her side in patches.
  const skin = sideAt(z, fy);
  const xin = sgn * (skin - 0.15);
  const plan = sponsonPlan(cx, z, r, xin);
  // The floor, as a slab with a top and a bottom.
  loftShape(g, M.steelDark, [
    { pts: plan, y: fy - 0.26 },
    { pts: plan, y: fy },
  ], { cap: true, floor: true });
  // The haunch under it: the floor drawn in to the ship's side as it falls, so
  // the platform stands on plating that goes somewhere instead of on air. It
  // is what is under every sponson on every carrier ever built, and it is what
  // was missing.
  const haunch = plan.map(([px, pz]) => [
    sgn * (skin + (Math.abs(px) - skin) * 0.30), z + (pz - z) * 0.62,
  ]);
  loftShape(g, M.steelDark, [
    { pts: haunch, y: fy - 1.75 },
    { pts: plan, y: fy - 0.26 },
  ], { cap: false });
  // The splinter plating round it, flaring a little as it rises the way a
  // plated tub does.
  const lip = plan.map(([px, pz]) => [
    px + (px - sgn * skin) * 0.05, z + (pz - z) * 1.05,
  ]);
  loftShape(g, m, [
    { pts: plan, y: fy },
    { pts: lip, y: fy + wall },
  ], { cap: false });
  // The ready-use locker against the inboard side of the rim, where the
  // loading numbers' hands fall.
  //
  // And no knees. They were two boxes rotated half a radian and set under the
  // floor, which is what you hang a platform on when there is nothing else
  // under it -- and with the haunch there they are two slabs standing out of
  // her plating below every gun on the ship.
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
  const crestY = sheer(1) - 3.5;
  const sz = F.zAt(1, crestY);
  cyl(g, M.gunDark, 0.70, 0.70, 0.5, 0, sheer(1) - 1.0, F.zAt(1, sheer(1) - 1.0) - 0.45, 12)
    .rotation.x = Math.PI / 2;
  chrysanthemum(g, crestY, 0.92);
  // The jackstaff right forward and the ensign staff right aft.
  cyl(g, M.steelDark, 0.11, 0.15, 4.4, 0, sheer(1) + 2.2, sz - 3.0, 8);
  const st = F.zAt(-1, sheer(-1));
  cyl(g, M.steelDark, 0.14, 0.19, 5.2, 0, sheer(-1) + 2.6, st + 2.0, 8);
}

/**
 * The chrysanthemum: the imperial crest on her stem.
 *
 * Sixteen petals round a boss, gilded, and on a Yamato hull the best part of
 * two metres across. It is the one piece of colour on the whole ship and the
 * eye goes straight to it, so it is the one piece that cannot be approximated.
 *
 * It was sixteen boxes. A box is a slab with a thickness in every axis, and
 * the eight of them that lay across the ship stood a good half-metre out
 * through both sides of a stem that is a metre wide there -- so what showed
 * from ahead was not a crest at all but two gold flaps, one on either bow,
 * with nothing between them.
 *
 * Built here as what it is: a single shallow dish with a star cut round its
 * rim, raised to a boss in the middle, lying on the stem and canted with it so
 * its face looks the way the stem looks. Nothing of it stands out sideways
 * because it has no sideways -- it is a disc, and a disc seen edge-on from
 * abeam is a line.
 */
function chrysanthemum(g, y0, r) {
  // Where her shell is, at a breadth and a height, forward of amidships.
  //
  // The crest is a casting bolted to the stem, and the stem at this height is
  // a flat a metre and a half across that falls away fast on either side of
  // it. Set a flat disc on that and its rim goes into the plating; set it
  // clear of the plating and it floats. So every point of it is laid on the
  // shell where that point actually is, and the crest curves round the bow
  // with the stem the way the casting did.
  //
  // Taken off the stem profile with a fair falloff to either side of it rather
  // than off the plating itself: the shell there is strakes and seams, and a
  // crest laid on the plating point by point catches on every one of them.
  const shellZ = (x, y) => F.zAt(1, y) - 0.17 * x * x;
  const PETALS = 16;
  const N = PETALS * 2;
  const pos = [];
  const idx = [];
  const put = (x, y, relief) => {
    pos.push(x, y, shellZ(x, y) + relief);
    return pos.length / 3 - 1;
  };
  // The rim: a petal tip and a valley between every pair of them, the tips
  // standing a little proud of the valleys beside them, which is what gives
  // the crest its relief in a flat light.
  const rim = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.70;
    rim.push(put(Math.sin(a) * rr, y0 + Math.cos(a) * rr, i % 2 === 0 ? 0.24 : 0.16));
  }
  // The inner ring the petals spring from, and the boss they spring round.
  const inner = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    inner.push(put(Math.sin(a) * r * 0.34, y0 + Math.cos(a) * r * 0.34, 0.38));
  }
  const hub = put(0, y0, 0.44);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    idx.push(rim[i], inner[i], inner[j], rim[i], inner[j], rim[j]);
    idx.push(hub, inner[j], inner[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat(P.chrys)));
  // The pad it is bolted to: a plate of the same shape a size larger, laid on
  // the plating under it, so the crest has a landing and not a shadow.
  const pp = [];
  const pi = [];
  const lay = (x, y, relief) => {
    pp.push(x, y, shellZ(x, y) + relief);
    return pp.length / 3 - 1;
  };
  const ring = [];
  const skirt = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = (i % 2 === 0 ? r : r * 0.70) * 1.12;
    ring.push(lay(Math.sin(a) * rr, y0 + Math.cos(a) * rr, 0.13));
    skirt.push(lay(Math.sin(a) * rr, y0 + Math.cos(a) * rr, 0.01));
  }
  const pHub = lay(0, y0, 0.15);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    pi.push(pHub, ring[i], ring[j]);
    pi.push(ring[i], skirt[i], skirt[j], ring[i], skirt[j], ring[j]);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  pg.setIndex(pi);
  pg.computeVertexNormals();
  g.add(new THREE.Mesh(pg, M.steelDark));
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
  bc.position.set(sideAt(94, GALLERY) + 0.6, GALLERY, 94);
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
  cr.position.set(sideAt(-104, GALLERY) + 0.9, GALLERY, -104);
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
 * Her boats, ranged on the quarterdeck under the after end of the flight deck.
 *
 * A carrier carries a great many of them -- she is a floating supply base with
 * two and a half thousand men aboard -- and they live in the one place on her
 * that is out of the way of everything.
 *
 * Which is not where they were. They were on a platform hung a metre and a
 * fifth inboard of the gallery, and the gallery on this ship runs in the
 * overhang between the plating and the deck edge -- so the platform, its
 * chocks, its davits and three eleven-metre launches a side were all inside
 * the hull, showing through her own gun sponsons whenever the light was
 * behind them. Aft of the hangar she has an open weather deck with six metres
 * of headroom under the flight deck and nothing on it at all, which is where
 * a boat deck goes and where her own boat crane already stands.
 */
function boats(g) {
  const deck = (z) => sheer(clamp(z / (LOA / 2), -1, 1));
  for (const sgn of [-1, 1]) {
    for (const [z, len, off] of [[-96, 11, 7.2], [-96, 9, 1.9],
      [-108, 10, 6.0], [-108, 8, 1.6]]) {
      const x = sgn * off;
      const y = deck(z) + 0.55;
      // The chocks she sits on, which is what keeps a boat out of the wet.
      for (const dz of [-len * 0.3, len * 0.3]) {
        box(g, M.steelDark, len * 0.26, 0.55, 0.5, x, deck(z) + 0.28, z + dz);
      }
      boat(g, M, x, y, z, len);
    }
    // The davits over them, swung inboard and stowed.
    for (const z of [-96, -108]) {
      const w = F.shellAt(clamp(z / (LOA / 2), -1, 1), deck(z)) - 1.4;
      const d = cyl(g, M.steelDark, 0.17, 0.22, 4.0, sgn * w, deck(z) + 2.0, z, 8);
      d.rotation.z = sgn * 0.26;
      box(g, M.steelDark, 2.4, 0.18, 0.22, sgn * (w - 1.0), deck(z) + 3.9, z);
    }
  }
  // Carley floats stowed flat against the hangar side on their own rails,
  // which is where every hand's is and the reason a carrier's side is never
  // a blank sheet of plating.
  for (const sgn of [-1, 1]) {
    for (let z = -70; z < 62; z += 11) {
      if (inSponson(z)) continue;
      const x = sgn * (sideAt(z, GALLERY + 1.45) + 0.34);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.20, 5, 14), M.canvas);
      r.position.set(x, GALLERY + 1.45, z);
      r.rotation.y = Math.PI / 2;
      r.scale.set(1, 1, 0.5);
      g.add(r);
      // The rails it is triced to, and the slip that lets it go over the side.
      for (const dy of [-1.0, 1.0]) {
        box(g, M.steelDark, 0.42, 0.10, 2.5, sgn * (sideAt(z, GALLERY + 1.45) + 0.12),
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
      cowl(g, M, sgn * (sideAt(z, GALLERY) - 0.5), GALLERY + 0.35, z, 0.34, 1.5);
    }
  }
  // The big intake trunks either side of the after lift.
  for (const sgn of [-1, 1]) {
    for (const z of [-50, -74]) {
      const w = sideAt(z, GALLERY + 1.9);
      box(g, M.steel, 1.6, 2.6, 3.2, sgn * (w - 1.0), GALLERY + 1.9, z);
      box(g, M.cave, 1.2, 1.4, 0.1, sgn * (w - 1.0), GALLERY + 2.4, z + 1.65);
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
function landZ() { return FD_AFT + RD_AFT + 5; }

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
