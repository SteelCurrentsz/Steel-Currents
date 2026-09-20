// USS Enterprise, CV-6, built off her own drawings.
//
// The Big E: second of the three Yorktowns, laid down at Newport News in 1934,
// at Midway, the Eastern Solomons, Santa Cruz and Guadalcanal, and by the end
// of 1942 the only American carrier still in the fight. This is her in that
// fit -- the 1942 refit, in Measure 21 navy blue, with the 1.1-inch quads gone
// for 40 mm Bofors and Oerlikon galleries down both deck edges.
//
// The numbers everything below is lofted to, off her own particulars:
//
//   length overall        262.0 m      flight deck      254.5 x 26 m
//   waterline beam         25.4 m      extreme beam        34.8 m
//   draft                   7.9 m      hangar deck          7.4 m
//   hangar clear height     5.4 m      flight deck         17.0 m
//   three centreline lifts, nine arresting wires, three barriers
//   eight 5"/38 in four sponsons, eight quad 40 mm, forty-four 20 mm
//   air group: 27 fighters, 38 dive bombers, 15 torpedo bombers
//
// Six things have to be right or she is not a Yorktown.
//
// The first is the hull under all of it. She is a cruiser: a hollow entrance
// carried nearly the whole forebody, a long parallel middle, a fine run into a
// small transom, and over all of it a stem that sweeps -- upright where it
// leaves the water and further forward the higher it goes, with the flare of
// the forecastle standing out over it. That single line is what says thirty-
// three knots from a mile off, and it is why the shell here is pulled through
// a table of offsets rather than out of a formula.
//
// The second is that the flight deck is not part of the hull. It is a
// structure built on top of her, open at both ends, and what you see between
// the waterline and the planking is the hangar side: one sheet of plating with
// a row of large openings cut in it, and above that the gallery storey. Not a
// trellis, not a wall -- a wall with holes in it, and a hangar to see through
// them.
//
// The third is the deck's plan. It is a drawn shape: full breadth over the
// middle two-thirds, drawing in hard forward to a narrow rounded nose and aft
// to a broad rounded one, with a round-down at each end. A rectangle with the
// corners knocked off is an escort carrier.
//
// The fourth is the hangar. It is the reason the ship exists and it is lit --
// a working shed with its deck, its overhead girders, its pillars and its
// aircraft ranged fore and aft along both sides with their wings folded. An
// aeroplane parked athwartships in a hangar twenty-five metres wide has her
// nose out through the plating, which is exactly where they used to be.
//
// The fifth is the lift wells. A well is a hole, and below the gallery deck it
// opens into the hangar on all four sides -- there is no shaft down there to
// plate. Boxed in, the lift ran down a grey chimney with nothing in it.
//
// The sixth is the island: one structure, not a bridge with a chimney beside
// it. The uptakes come up through it and the funnel is its after half, canted
// outboard so the smoke clears the deck, and the whole of it is cantilevered
// out over the starboard deck edge so that not a square metre of landing area
// is lost to it.
//
// Nothing here is a texture. Every plate, gallery, tub, boat, wire and aerial
// is geometry, because the ship is looked at from a masthead at fifty metres
// in the spectator view and a painted-on detail is a smear at that range.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up,
// starboard is -X, and y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { wildcat, dauntless, avenger } from './planekit.js';
import { arm as armMount } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { AERO, launchProfile } from './aero.js';
import { DECK_RUN } from '../../../shared/sim.js';
import {
  box, cyl, tubeZ, tubeX, fairTable, ladder, sideLadder, loftShape, planHouse,
  strip, sheet, rail,
} from './shipkit.js';
import { hullForm, plateHull } from './hullform.js';
import { quadBofors, oerlikon as usnOerlikon } from './usnguns.js';

/** Starboard, in this frame. */
const S = -1;

// ------------------------------------------------------------- materials --
//
// Measure 21: navy blue 5-N from the boot topping to the masthead, and deck
// blue 20-B over every horizontal surface including the planking of the flight
// deck, which from the middle of 1942 was stained rather than left bare fir.
// It is a very dark scheme and it is meant to be -- she was painted to be hard
// to see from the air.

const P = {
  hull: 0x47515e,
  hullDark: 0x3b4551,
  hullLight: 0x505b69,
  boot: 0x191d22,
  antifoul: 0x6b2c24,
  // The flight deck: Douglas fir stained deck blue, with the darker runs the
  // stain always went on unevenly over.
  deck: 0x6d727a,
  deckDark: 0x5d626a,
  deckSteel: 0x49525e,
  steel: 0x5b6572,
  steelDark: 0x454e5a,
  bright: 0x79838f,
  mark: 0xd4d0c2,
  gun: 0x4e5865,
  gunDark: 0x2a3138,
  glass: 0x1b2229,
  canvas: 0x6b6759,
  raft: 0x2a2f34,
  cave: 0x14181c,
  // Inside the hangar. It is a lit space with white-painted deckhead and
  // frames over a grey deck, and it is looked into through the side openings
  // from outside in daylight -- so it is drawn pale rather than dark, or every
  // opening reads as a hole punched in a wall with nothing behind it.
  hangarDeck: 0x5a626c,
  hangarSide: 0x6e7783,
  hangarHead: 0xa2acb8,
  hangarSteel: 0x67707c,
  hangarDark: 0x3c434c,
  lamp: 0xdfd9c2,
  // A rolled fire curtain in a hangar opening: dark grey duck, and set well
  // back inside the frame so the opening keeps its depth.
  curtain: 0x2f353c,
  deckBlue: 0x39434f,
  flagRed: 0xb0392f,
  flagBlue: 0x2f5c92,
  flagGold: 0xd8b452,
  wire: 0x232a31,
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
// A Yorktown's offsets, station by station: -1 at the transom, +1 at the stem,
// against a half-breadth, a depth or a height in metres. Everything about the
// shape of her comes out of these four tables and the rake of her ends.

/**
 * Half-breadths at the waterline.
 *
 * Twelve and three-quarter metres at her widest, held within a hand's breadth
 * over the middle third, and then a long hollow entrance that takes the whole
 * forward half of her to close. A carrier is a cruiser hull with a shed on it
 * and this is the cruiser.
 */
const HALF_BEAM = [
  [-1.000, 5.55], [-0.960, 6.62], [-0.920, 7.48], [-0.860, 8.68],
  [-0.800, 9.62], [-0.720, 10.62], [-0.640, 11.30], [-0.540, 11.96],
  [-0.440, 12.38], [-0.320, 12.64], [-0.200, 12.72], [-0.080, 12.75],
  [0.000, 12.75], [0.100, 12.71], [0.200, 12.58], [0.300, 12.30],
  [0.400, 11.80], [0.500, 11.02], [0.600, 9.92], [0.700, 8.40],
  [0.780, 6.78], [0.850, 4.98], [0.910, 3.18], [0.960, 1.58],
  [0.990, 0.54], [1.000, 0.15],
];

/**
 * The keel line.
 *
 * Flat at her load draft over two-thirds of her, tucked up into the counter
 * over the screws, and cut right away under the forefoot -- her stem leaves
 * the water a good fifteen metres abaft the point the forecastle stands over.
 */
const KEEL = [
  [-1.000, -1.95], [-0.960, -4.05], [-0.920, -5.55], [-0.870, -6.62],
  [-0.820, -7.22], [-0.760, -7.62], [-0.680, -7.83], [-0.560, -7.90],
  [-0.200, -7.90], [0.200, -7.90], [0.440, -7.90], [0.560, -7.87],
  [0.660, -7.76], [0.740, -7.52], [0.800, -7.12], [0.850, -6.52],
  [0.900, -5.50], [0.940, -4.20], [0.970, -2.86], [0.990, -1.62],
  [1.000, -1.05],
];

/**
 * The sheer: her deck edge, which on a carrier is the hangar deck.
 *
 * Dead flat at 7.40 m the whole length of the hangar, because a hangar deck is
 * a hangar deck, and then rising hard forward of the hangar bulkhead into the
 * forecastle. Six metres of rise in the last fifty is what gives a Yorktown
 * her bow, and it is the single line that keeps the sea out of a hangar with
 * no plating across the front of it.
 */
const SHEER = [
  [-1.000, 8.30], [-0.970, 7.92], [-0.930, 7.58], [-0.880, 7.42],
  [-0.800, 7.40], [-0.500, 7.40], [-0.200, 7.40], [0.200, 7.40],
  [0.500, 7.40], [0.620, 7.46], [0.700, 7.96], [0.780, 8.96],
  [0.850, 10.28], [0.905, 11.50], [0.950, 12.52], [0.980, 13.16],
  [1.000, 13.50],
];

/**
 * The flare: how far her deck edge stands outboard of her waterline beam.
 *
 * Almost nothing amidships, where the hangar side is very nearly vertical, and
 * better than two and a half metres over the forward quarter, where the
 * forecastle has to be wide enough to stand a windlass on and the sections
 * have to throw green water clear at thirty knots. Carried right out to the
 * stem: a flare that dies away two stations short leaves the last eight metres
 * of bow as a wedge standing on a curve, and that wedge is the whole of what a
 * camera sees from ahead.
 */
const FLARE = [
  [-1.000, 1.05], [-0.930, 0.70], [-0.850, 0.42], [-0.700, 0.24],
  [-0.400, 0.22], [0.000, 0.28], [0.250, 0.48], [0.420, 0.92],
  [0.550, 1.48], [0.660, 2.06], [0.750, 2.50], [0.820, 2.68],
  [0.880, 2.62], [0.930, 2.28], [0.965, 1.66], [0.988, 0.96],
  [1.000, 0.52],
];

const LOA = 262.0;
const WLB = 25.4;
const FDW = 26.0;
const FDL = 254.5;
const DRAFT = 7.9;

const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE,
  // Eight metres of rake between the forefoot and the forecastle, and hollow
  // rather than straight: the higher the power the later the rake comes on, so
  // the stem leaves the water nearly upright and sweeps forward as it rises.
  stem: 8.0, stemLo: -2.4, stemUp: 15.9, stemPow: 1.52,
  // And a counter that overhangs three and a half over the screws.
  counter: 3.6, counterLo: -1.6, counterUp: 9.9, counterPow: 1.38,
  // A cruiser's bilge: round, but nothing like as full as a battleship's.
  bilge: 0.33,
  // Her ends are where the offsets change fastest -- the half-breadth forward
  // falls five metres in the last tenth of her -- so she is cut fine enough
  // that no station spacing shows as a facet there.
  stations: 190,
});

/** Her lines, for anything that has to know where her plating really is. */
export const LINES = F;
const sheerY = F.sheer;
/** Half-breadth of the shell at the deck edge, at a station in metres. */
const halfDeck = (z) => F.halfDeck(z);
const tOf = (z) => clamp(z / (LOA / 2), -1, 1);

// ------------------------------------------------------------- her decks --

/** The hangar deck, which on a carrier is the upper deck of the hull. */
const HANGAR = 7.40;
/** Its overhead: five metres and a half of clear height, which is what she had. */
const HTOP = 12.80;
/** The gallery deck, slung under the flight deck with the ready rooms on it. */
const GALLERY = 13.40;
/** And the flight deck itself. */
const FD = 17.00;

/** Where the hangar begins and ends. */
const HGR_F = 86.0;
const HGR_A = -96.0;

/**
 * The ship's side at the hangar and gallery storeys.
 *
 * Over the hangar it is the hull's own deck edge carried straight up, because
 * that is what it is -- one continuous surface from the boot topping to the
 * flight deck. Beyond the hangar, where the hull narrows away under an
 * overhanging deck, it follows the deck instead so the plating never stands
 * outboard of the planking it is supposed to be holding up.
 */
function sideHalf(z) {
  return Math.max(1.2, Math.min(halfDeck(z), fdHalf(z) - 0.15));
}

/** The clear width of the hangar inside that plating. */
function hangarHalf(z) {
  if (z > HGR_F || z < HGR_A) return 0;
  return Math.min(12.25, sideHalf(z) - 0.55);
}

// -------------------------------------------------------- the flight deck --

/** Where the deck's midpoint sits: a shade forward of the ship's own midships. */
const FD_MID = LOA * 0.012;
const FD_FWD = FD_MID + FDL / 2;        // +130.4
const FD_AFT = FD_MID - FDL / 2;        // -124.1

/**
 * The flight deck in plan: 254.5 m long on a 262 m hull, 26 m across.
 *
 * Full breadth from a third of the way forward of the round-down to a third of
 * the way aft of the bow, drawing in hard over the forward quarter -- the hull
 * has no beam up there to stand on -- and more gently aft. The table is the
 * deck edge; the last few metres at either end are rounded off it.
 */
const FD_PLAN = [
  [-124.1, 9.30], [-119.0, 11.05], [-113.0, 12.15], [-106.0, 12.75],
  [-98.0, 13.00], [-80.0, 13.00], [-40.0, 13.00], [0.0, 13.00],
  [40.0, 13.00], [66.0, 13.00], [78.0, 12.94], [90.0, 12.62],
  [100.0, 12.06], [109.0, 11.14], [116.0, 9.98], [121.5, 8.50],
  [125.5, 6.80], [128.5, 4.90], [130.4, 3.20],
];

/**
 * A flight deck ends in a nose, not a mitre: the deck edge comes round through
 * a right angle in three or four metres and meets the end face square. Faired
 * on to the table rather than tabulated, because a corner that tight wants
 * stations closer together than anything else on her.
 */
const NOSE_F = 5.0;
const NOSE_A = 8.0;
const TIP_F = 1.60;
const TIP_A = 5.60;

/** Her half-breadth at the flight deck at a station. */
export function fdHalf(z) {
  if (z > FD_FWD || z < FD_AFT) return 0;
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
 * The round-down at each end: the deck falls away over the last few metres so
 * the air coming over it does not burble at the ramp. Aft it is the harder of
 * the two, because that is the end a pilot comes over.
 *
 * Taken as a cube rather than a square. A square leaves the deck dead flat and
 * then bends into the fall-away in one station, and however small the drop is
 * that join is a crease running right across her -- which is the one thing a
 * round-down exists for not having.
 */
const RD_FWD = 13.0;
const RD_AFT = 15.0;
function fdDrop(z) {
  if (z > FD_FWD - RD_FWD) return Math.pow((z - (FD_FWD - RD_FWD)) / RD_FWD, 3) * 0.85;
  if (z < FD_AFT + RD_AFT) return Math.pow((FD_AFT + RD_AFT - z) / RD_AFT, 3) * 1.30;
  return 0;
}

/** The height of the flight deck at a station. */
export function fdY(z) { return FD - fdDrop(clamp(z, FD_AFT, FD_FWD)); }

/**
 * The other way about: how far forward, and aft, the deck reaches at a given
 * breadth. Scanned rather than solved, because the outline is a table.
 */
function fdEndF(x) {
  const w = Math.abs(x);
  for (let z = FD_FWD; z > FD_MID; z -= 0.1) if (fdHalf(z) >= w) return z;
  return FD_MID;
}
function fdEndA(x) {
  const w = Math.abs(x);
  for (let z = FD_AFT; z < FD_MID; z += 0.1) if (fdHalf(z) >= w) return z;
  return FD_MID;
}

// ------------------------------------------------------------- the lifts --

/**
 * The three centreline lifts.
 *
 * Each is a hole through the flight deck and through the gallery deck under
 * it, with a platform running up and down inside. Below the gallery deck there
 * is nothing to run inside: the well opens straight into the hangar on all
 * four sides, which is what a lift trunk on a Yorktown actually is and why a
 * platform coming down arrives in a lit shed rather than at the bottom of a
 * grey chimney.
 */
const LIFT_HW = 7.4;
// Forward, amidships and aft, off her own deck plan: the forward one just
// abaft the forward hangar bulkhead, the after one far enough forward of the
// round-down to leave the whole of the arresting gear clear of it.
const LIFT_Z = [74.0, 2.0, -70.0];
function liftZs() { return LIFT_Z.slice(); }

/** The parts of a fore-and-aft run that are not over a well. */
function clearOfWells(z0, z1, pad = 0) {
  let spans = [[z0, z1]];
  for (const lz of liftZs()) {
    const a = lz - LIFT_HW - pad;
    const b = lz + LIFT_HW + pad;
    const out = [];
    for (const [s0, s1] of spans) {
      if (b <= s0 || a >= s1) { out.push([s0, s1]); continue; }
      if (s0 < a - 0.01) out.push([s0, a]);
      if (s1 > b + 0.01) out.push([b, s1]);
    }
    spans = out;
  }
  return spans;
}

/** Whether a station lies over a well at all. */
function overWell(z) { return liftZs().some((lz) => Math.abs(z - lz) < LIFT_HW); }

/** How far out the well reaches at a station, or nought where the deck is whole. */
function wellHalf(z) {
  for (const lz of liftZs()) {
    if (Math.abs(z - lz) <= LIFT_HW) return LIFT_HW;
  }
  return 0;
}

// ------------------------------------------------------------------ hull --

/**
 * Her shell, and everything the yard did to it that no table of offsets will
 * give you: the stem bar, the rubbing strake along the sheer, two rows of
 * scuttles, the bilge keels, four shafts on their bossings and twin rudders.
 */
function buildHull(g) {
  // Three strakes on one surface -- antifouling from the keel, the boot
  // topping across the waterline, navy blue above it -- and each of them
  // plated in several bands so the section keeps its curve. A fifteen-metre
  // freeboard drawn as one band is a straight line between two heights, and
  // every bit of flare and hollow in the offsets is thrown away between them.
  plateHull(g, F, M, { bootLo: -2.30, bootHi: 0.60, bands: 8, upper: 5 });

  // The hangar deck, which is the top of the hull: one sheet from the transom
  // to the stem, cut to her own deck edge.
  sheet(g, M.deckSteel, -LOA / 2 + 0.4, LOA / 2 - 0.4,
    (z) => Math.max(0.12, halfDeck(z) - 0.05), (z) => sheerY(tOf(z)), 120);

  // The stem bar: a rounded cutwater laid up the profile, painted at each
  // height with whatever the shell beside it is painted.
  {
    const k0 = F.keelY(1);
    const NS = 64;
    const NR = 10;
    const R = 0.26;
    const yOf = (i) => k0 + ((sheerY(1) - k0) * i) / NS;
    // One swept surface per paint, so the three strakes still meet the shell
    // beside them at the right heights.
    for (const [lo, hi, m] of [[-Infinity, -2.30, M.antifoul], [-2.30, 0.60, M.boot],
      [0.60, Infinity, M.hull]]) {
      const sk = strip();
      const ring = (y) => {
        // The section is swept square to the stem's own slope, so the bar
        // keeps its thickness where the profile turns hardest.
        const dz = F.zAt(1, y + 0.05) - F.zAt(1, y - 0.05);
        const a = Math.atan2(dz, 0.1);
        const pts = [];
        for (let k = 0; k < NR; k++) {
          const th = (k / NR) * Math.PI * 2;
          const cx = Math.cos(th) * R;
          const cy = Math.sin(th) * R;
          pts.push([cx, y - cy * Math.sin(a), F.zAt(1, y) + 0.04 + cy * Math.cos(a)]);
        }
        return pts;
      };
      for (let i = 0; i < NS; i++) {
        const ya = yOf(i);
        const yb = yOf(i + 1);
        if (yb < lo || ya > hi) continue;
        const A = ring(Math.max(ya, lo === -Infinity ? ya : lo));
        const B = ring(Math.min(yb, hi === Infinity ? yb : hi));
        for (let k = 0; k < NR; k++) {
          const j = (k + 1) % NR;
          sk.quad(A[k], B[k], B[j], A[j],
            [A[k][0], 0, A[k][2] - F.zAt(1, ya)]);
        }
      }
      sk.mesh(g, m);
    }
  }

  // The knuckle: a rubbing strake along the sheer, which is the line that
  // gives a hull its length when you look down it.
  for (let i = 0; i < 70; i++) {
    const t = -1 + (2 * i) / 70;
    const t2 = -1 + (2 * (i + 1)) / 70;
    const y = (sheerY(t) + sheerY(t2)) / 2 - 0.52;
    const z = (F.zAt(t, y) + F.zAt(t2, y)) / 2;
    const w = (F.shellAt(t, y) + F.shellAt(t2, y)) / 2;
    const len = Math.abs(F.zAt(t2, y) - F.zAt(t, y)) + 0.3;
    for (const sgn of [-1, 1]) {
      const b = box(g, M.hullDark, 0.30, 0.36, len, sgn * (w + 0.08), y, z);
      b.rotation.x = -(sheerY(t2) - sheerY(t)) / len * 0.5;
    }
  }

  // The degaussing cable, carried in its trough round her the whole way: a
  // band the width of a hand about a metre under the deck edge, and on a ship
  // painted one colour from stem to stern it is the one line down her side
  // that anybody can actually see.
  for (let i = 0; i < 70; i++) {
    const t = -0.97 + (1.94 * i) / 70;
    const t2 = -0.97 + (1.94 * (i + 1)) / 70;
    const y = (sheerY(t) + sheerY(t2)) / 2 - 1.45;
    const z = (F.zAt(t, y) + F.zAt(t2, y)) / 2;
    const w = (F.shellAt(t, y) + F.shellAt(t2, y)) / 2;
    const len = Math.abs(F.zAt(t2, y) - F.zAt(t, y)) + 0.25;
    for (const sgn of [-1, 1]) {
      const b = box(g, M.hullLight, 0.14, 0.18, len, sgn * (w + 0.04), y, z);
      b.rotation.x = -(sheerY(t2) - sheerY(t)) / len * 0.5;
    }
  }

  // Scuttles: two rows down the topside, in the parallel body where the
  // accommodation is. Small, and unmistakable at any range.
  for (const row of [HANGAR - 2.5, HANGAR - 4.7]) {
    for (let i = 0; i < 38; i++) {
      const t = -0.66 + (i / 37) * 1.18;
      const z = F.zAt(t, row);
      const w = F.shellAt(t, row);
      if (w < 3) continue;
      for (const sgn of [-1, 1]) {
        cyl(g, M.steelDark, 0.26, 0.26, 0.14, sgn * (w + 0.02), row, z, 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }

  // Bilge keels, laid along the turn of the bilge where they belong.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      const t = -0.44 + (i / 23) * 0.88;
      const y = F.keelY(t) * 0.62;
      const z = F.zAt(t, y);
      const w = F.shellAt(t, y);
      const bk = box(g, M.antifoul, 0.28, 1.25, (0.88 * LOA) / 46 + 0.4,
        sgn * (w + 0.45), y, z);
      bk.rotation.z = sgn * 0.92;
    }
  }

  // Four shafts on their bossings, A-brackets, screws and twin rudders. The
  // wing pair and the inboard pair are handed opposite ways, which is what
  // keeps a four-screw ship from walking her stern round at slow speed.
  for (const sgn of [-1, 1]) {
    for (const o of [0.34, 0.72]) {
      const bx = sgn * WLB * o * 0.5;
      const sh = tubeZ(g, M.antifoul, 0.58, 26, bx, -DRAFT * 0.62, -LOA * 0.34, 10);
      sh.rotation.x = Math.PI / 2 + 0.055;
      const armBr = box(g, M.antifoul, 0.32, 3.0, 0.8, bx, -DRAFT * 0.48, -LOA * 0.415);
      armBr.rotation.z = -sgn * 0.35;
      const boss = cyl(g, M.antifoul, 0.72, 0.84, 2.0, bx, -DRAFT * 0.64, -LOA * 0.40, 12);
      boss.rotation.x = Math.PI / 2;
      const scr = new THREE.Group();
      scr.position.set(bx, -DRAFT * 0.66, -LOA * 0.435);
      scr.userData.dynamic = true;
      scr.userData.screw = { hand: o > 0.5 ? sgn : -sgn };
      g.add(scr);
      cyl(scr, M.hullDark, 0.38, 0.38, 0.7, 0, 0, 0, 10).rotation.x = Math.PI / 2;
      for (let k = 0; k < 4; k++) {
        const bl = box(scr, M.hullDark, 0.3, 2.9, 0.14, 0, 0, 0);
        bl.rotation.z = (k / 4) * Math.PI * 2 + 0.3;
        bl.rotation.y = 0.35;
      }
    }
    // The rudder and its stock, under the counter.
    box(g, M.antifoul, 0.40, 4.5, 3.5, sgn * 3.3, -DRAFT * 0.50, -LOA * 0.462);
    cyl(g, M.antifoul, 0.32, 0.32, 1.6, sgn * 3.3, -DRAFT * 0.10, -LOA * 0.455, 8);
  }

  // The bow: hawse pipes with the chain leading through them, and the anchors
  // stowed home against the shell.
  for (const sgn of [-1, 1]) {
    const t = 0.862;
    const y = sheerY(t) - 2.7;
    const w = F.shellAt(t, y);
    const hz = F.zAt(t, y);
    cyl(g, M.steelDark, 0.56, 0.56, 1.5, sgn * (w - 0.2), y, hz, 10)
      .rotation.z = Math.PI / 2;
    const anc = box(g, M.steelDark, 0.38, 2.3, 1.5, sgn * (w + 0.16), y - 0.3, hz);
    anc.rotation.z = sgn * 0.09;
    box(g, M.steelDark, 0.28, 0.48, 2.3, sgn * (w + 0.16), y + 0.85, hz);
    for (let i = 0; i < 10; i++) {
      const tz = t - 0.010 * i;
      box(g, M.wire, 0.20, 0.20, 0.55, sgn * 2.2, sheerY(tz) + 0.24, F.zAt(tz, sheerY(tz)));
    }
  }
  // Jackstaff at the stem, ensign staff at the transom.
  box(g, M.steel, 0.13, 3.4, 0.13, 0, sheerY(0.985) + 1.7, F.zAt(0.985, sheerY(0.985)));
  box(g, M.steel, 0.13, 3.0, 0.13, 0, sheerY(-0.985) + 1.5, F.zAt(-0.985, sheerY(-0.985)));
}

// ------------------------------------------ forecastle and quarterdeck --

/**
 * The open decks at either end, under the overhang of the flight deck.
 *
 * Forward: the ground tackle -- windlass, wildcats, chain pipes, bitts and a
 * breakwater to keep a head sea out of it. Aft: the capstans and the towing
 * fittings. Neither has anything to do with flying, and both are what makes
 * the ends of her read as a ship rather than as the ends of a runway.
 */
function groundTackle(g) {
  // Deck blue over the open decks at both ends. The hangar deck under them is
  // one continuous sheet of plating, so the paint that belongs on a horizontal
  // surface goes on as a thin plate over the top of it.
  for (const [za, zb] of [[HGR_F - 1, LOA / 2 - 4.5], [-LOA / 2 + 4.5, HGR_A + 1]]) {
    sheet(g, M.deckBlue, za, zb, (z) => Math.max(0.2, halfDeck(z) - 0.18),
      (z) => sheerY(tOf(z)) + 0.10, 22);
  }

  // The breakwater, angled to throw the water outboard.
  {
    const t = 0.755;
    const y = sheerY(t);
    const z = F.zAt(t, y);
    const w = halfDeck(z) - 1.1;
    for (let i = 0; i < 9; i++) {
      const x = -w + (2 * w * (i + 0.5)) / 9;
      const b = box(g, M.hull, (2 * w) / 9 - 0.12, 1.9, 0.32, x, y + 1.05, z);
      b.rotation.x = -0.22;
    }
  }
  // The windlass amidships on the forecastle, a wildcat either side of it.
  {
    const t = 0.815;
    const y = sheerY(t);
    const z = F.zAt(t, y);
    box(g, M.steelDark, 5.0, 1.4, 2.5, 0, y + 0.80, z);
    for (const sgn of [-1, 1]) {
      const w = cyl(g, M.steel, 0.82, 0.82, 0.95, sgn * 3.2, y + 0.92, z, 12);
      w.rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.40, 0.40, 0.5, sgn * 2.1, y + 0.28, z - 3.3, 10);
    }
  }
  // Bitts, chocks and fairleads down both sides of both open decks.
  for (const [ta, tb, n] of [[0.700, 0.930, 5], [-0.955, HGR_A / (LOA / 2) - 0.01, 4]]) {
    for (let i = 0; i < n; i++) {
      const t = ta + ((tb - ta) * (i + 0.5)) / n;
      const y = sheerY(t);
      const z = F.zAt(t, y);
      const x = F.shellAt(t, y) - 1.1;
      if (x < 1) continue;
      for (const sgn of [-1, 1]) {
        for (const dz of [-0.65, 0.65]) {
          cyl(g, M.steelDark, 0.22, 0.26, 0.95, sgn * x, y + 0.5, z + dz, 8);
        }
        box(g, M.steelDark, 0.85, 0.65, 1.8, sgn * (x + 0.66), y + 0.34, z);
      }
    }
  }
  // Two capstans on the quarterdeck, and the after towing bitts between them.
  {
    const t = -0.905;
    const y = sheerY(t);
    const z = F.zAt(t, y);
    for (const sgn of [-1, 1]) cyl(g, M.steel, 0.68, 0.82, 1.05, sgn * 3.0, y + 0.58, z, 12);
    box(g, M.steelDark, 2.9, 0.85, 1.3, 0, y + 0.48, z - 3.2);
  }
  // Guardrails round the open ends.
  for (const [za, zb] of [[HGR_F + 1, LOA / 2 - 6.5], [-LOA / 2 + 6.5, HGR_A - 1]]) {
    rail(g, M.steelDark, za, zb, (z) => Math.max(0.3, halfDeck(z) - 0.35),
      (z) => sheerY(tOf(z)) + 0.14, 2.6);
  }
}

// ------------------------------------------------------------ the hangar --

/**
 * The hangar sides: one sheet of plating a side, with a row of large openings
 * cut in it.
 *
 * This is the part of a Yorktown that gets drawn wrong. The flight deck does
 * not stand on stilts with daylight under it, and the hangar is not a shaded
 * slot: the side is plated from the hangar deck right up to the flight deck
 * edge, and cut in it is a run of openings four metres high that gave her crew
 * light and air and let them run engines on the hangar deck. What you see
 * between the waterline and the planking is a wall with holes in it.
 *
 * Both faces are drawn. The plating is single-sided, so a sheet wound outboard
 * and nothing else leaves the man standing in the hangar looking out through
 * his own ship's side at the sea.
 */
function hangarSides(g) {
  const Z0 = HGR_A + 4.0;
  const Z1 = HGR_F - 4.0;
  const BAYS = 28;
  const PITCH = (Z1 - Z0) / BAYS;
  const PIER = 1.45;
  const SILL = HANGAR + 0.95;
  const HEAD = HTOP - 0.65;
  const TOP = FD - 0.44;

  for (const sgn of [-1, 1]) {
    // Two skins: the ship's side, and the hangar wall a hand's breadth inside
    // it. They are not the same colour and never were. The outboard skin is
    // her paintwork; the inboard one is the inside of a lit working space,
    // painted out pale so that a hangar looked at through her own openings
    // reads as a shed with light in it rather than as the back of the plating
    // -- which is what it was, and why every bay came out as a rectangle of
    // the same grey as the hull around it.
    for (const [inset, out, skin] of [[0, sgn, M.hull], [0.20, -sgn, M.hangarSide]]) {
      const sk = strip();
      const hx = (z) => sgn * (sideHalf(z) - inset);
      const face = [out * sgn > 0 ? sgn : -sgn, 0, 0];
      const n = [face[0], 0, 0];
      const panel = (za, zb, y0, y1) => {
        sk.quad([hx(za), y0, za], [hx(zb), y0, zb], [hx(zb), y1, zb], [hx(za), y1, za], n);
      };
      // Abaft and forward of the bays the side is plated solid the whole way
      // up, in short lengths so it follows the curve of her.
      const solid = (za, zb) => {
        const steps = Math.max(1, Math.round(Math.abs(zb - za) / 3));
        for (let i = 0; i < steps; i++) {
          panel(za + ((zb - za) * i) / steps, za + ((zb - za) * (i + 1)) / steps,
            HANGAR, TOP);
        }
      };
      solid(HGR_A - 1.5, Z0);
      solid(Z1, HGR_F + 1.5);
      for (let i = 0; i < BAYS; i++) {
        const za = Z0 + PITCH * i;
        const zb = za + PITCH;
        const oa = za + PIER;
        // The pier between one bay and the next, full height.
        panel(za, oa, HANGAR, TOP);
        // Sill under the opening and header over it.
        panel(oa, zb, HANGAR, SILL);
        panel(oa, zb, HEAD, TOP);
      }
      sk.mesh(g, skin);
    }
    // The reveal round every opening, which is what gives the plating its
    // thickness and stops a hole in a sheet reading as a painted rectangle.
    for (let i = 0; i < BAYS; i++) {
      const oa = Z0 + PITCH * i + PIER;
      const zb = Z0 + PITCH * (i + 1);
      const zc = (oa + zb) / 2;
      const x = sgn * (sideHalf(zc) - 0.10);
      box(g, M.hullDark, 0.26, 0.16, zb - oa, x, SILL, zc);
      box(g, M.hullDark, 0.26, 0.16, zb - oa, x, HEAD, zc);
      for (const zz of [oa, zb]) {
        box(g, M.hullDark, 0.26, HEAD - SILL, 0.16, sgn * (sideHalf(zz) - 0.10),
          (SILL + HEAD) / 2, zz);
      }
      // One bay in three carries its fire curtain, rolled down and set well
      // back inside the frame. Rolled up, the roller is under the header.
      const shut = i % 3 === 1;
      const rz = zc;
      const rx = sgn * (sideHalf(rz) - 0.95);
      if (shut) {
        box(g, M.curtain, 0.12, HEAD - SILL - 0.3, zb - oa - 0.45, rx, (SILL + HEAD) / 2, rz);
        for (let k = 1; k <= 5; k++) {
          box(g, M.gunDark, 0.16, 0.10, zb - oa - 0.45, rx,
            SILL + ((HEAD - SILL) * k) / 6, rz);
        }
      }
      const rl = cyl(g, M.steelDark, 0.22, 0.22, zb - oa - 0.5, rx, HEAD - 0.34, rz, 8);
      rl.rotation.x = Math.PI / 2;
    }
  }

  // The bulkheads that close the hangar at both ends, with the big rolling
  // doors in them that a tractor takes an aeroplane through.
  for (const [z, face] of [[HGR_F, 1], [HGR_A, -1]]) {
    const w = sideHalf(z) - 0.2;
    box(g, M.hull, 2 * w, HTOP - HANGAR, 0.42, 0, (HANGAR + HTOP) / 2, z);
    // And its inboard face, painted out with the rest of the hangar.
    box(g, M.hangarSide, 2 * w - 0.1, HTOP - HANGAR - 0.1, 0.10,
      0, (HANGAR + HTOP) / 2, z - face * 0.24);
    box(g, M.hangarDark, 9.6, 4.6, 0.22, 0, HANGAR + 2.45, z - face * 0.32);
    for (let i = 1; i < 6; i++) {
      box(g, M.hangarSteel, 0.14, 4.6, 0.16, -4.8 + (i * 9.6) / 6,
        HANGAR + 2.45, z - face * 0.36);
    }
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.28, 2.1, 0.2, sgn * 6.2, HANGAR + 1.25, z - face * 0.3);
    }
  }
}

/**
 * A deck with holes in it: one sheet between a port and a starboard edge, cut
 * open where a lift well goes through it.
 *
 * The wells have to be holes. Drawn as a platform laid on an unbroken deck,
 * a lift on its way down simply vanishes under the planking and what it leaves
 * behind is a painted rectangle -- and a lift down the well is the one thing
 * on a carrier that everybody can see.
 */
function holedSheet(g, m, z0, z1, half, y, up, n = 120) {
  const zs = [];
  for (let i = 0; i <= n; i++) zs.push(z0 + ((z1 - z0) * i) / n);
  for (const lz of liftZs()) {
    for (const d of [-LIFT_HW - 0.02, -LIFT_HW, LIFT_HW, LIFT_HW + 0.02]) {
      if (lz + d > z0 && lz + d < z1) zs.push(lz + d);
    }
  }
  zs.sort((a, b) => a - b);
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
    if (zb - za < 1e-4) continue;
    const wa = Math.max(0.05, half(za));
    const wb = Math.max(0.05, half(zb));
    const ca = wellHalf(za);
    const cb = wellHalf(zb);
    if (ca <= 0 && cb <= 0) {
      quad(P(-wa, za), P(wa, za), P(wb, zb), P(-wb, zb));
    } else {
      for (const sgn of [-1, 1]) {
        const i0 = P(sgn * Math.min(ca, wa - 0.05), za);
        const i1 = P(sgn * wa, za);
        const i2 = P(sgn * wb, zb);
        const i3 = P(sgn * Math.min(cb, wb - 0.05), zb);
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
 * The hangar deck, which is the reason the ship exists.
 *
 * A hundred and eighty metres of it, five and a half clear to the overhead. It
 * is a working space and it is lit: plated deck with the tie-down strips let
 * into it, transverse girders and deckhead lamps overhead, pillars taking the
 * flight deck's weight down through it, aircraft ranged fore and aft along
 * both sides with their wings folded, and the benches, drums, crates and
 * tractors of the people who kept them flying. All of it reads through the
 * side openings and, when a lift is down, straight up the well.
 */
function hangarInterior(g) {
  const zA = HGR_A + 0.4;
  const zF = HGR_F - 0.4;

  // The deck, and the overhead over it, both cut round the wells.
  holedSheet(g, M.hangarDeck, zA, zF, hangarHalf, () => HANGAR + 0.08, true, 110);
  holedSheet(g, M.hangarHead, zA, zF, hangarHalf, () => HTOP - 0.05, false, 110);
  // Tie-down strips down the deck fore and aft, stopping either side of a well.
  for (const dx of [-9.6, -6.4, -3.2, 3.2, 6.4, 9.6]) {
    for (const [a, b] of clearOfWells(zA + 1, zF - 1)) {
      if (b - a < 1) continue;
      box(g, M.hangarDark, 0.30, 0.09, b - a, dx, HANGAR + 0.17, (a + b) / 2);
    }
  }

  // The sides of the hangar as the man standing in it sees them: a run of
  // frames with the shell between them, and the two longitudinal girders the
  // deck over his head is carried on.
  const bays = 30;
  for (let i = 0; i <= bays; i++) {
    const z = zA + ((zF - zA) * i) / bays;
    const w = hangarHalf(z);
    if (w <= 1) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.hangarSteel, 0.26, HTOP - HANGAR - 0.2, 0.34,
        sgn * (w - 0.12), (HANGAR + HTOP) / 2, z);
      // The bracket where the frame meets the deckhead.
      const br = box(g, M.hangarSteel, 1.2, 0.26, 0.28, sgn * (w - 0.6), HTOP - 0.72, z);
      br.rotation.z = -sgn * 0.62;
    }
    // Transverse girders overhead, cut round the wells.
    if (i % 2 === 0) {
      if (overWell(z)) {
        for (const sgn of [-1, 1]) {
          const inner = LIFT_HW + 0.25;
          if (w - inner < 0.6) continue;
          box(g, M.hangarSteel, w - inner, 0.5, 0.36,
            sgn * (inner + (w - inner) / 2), HTOP - 0.42, z);
        }
      } else {
        box(g, M.hangarSteel, 2 * w - 0.4, 0.5, 0.36, 0, HTOP - 0.42, z);
      }
    }
    // Deckhead lamps in pairs between the girders, which is what makes a
    // hangar look like a lit shed and not a cave.
    if (i % 2 === 1 && !overWell(z)) {
      for (const sgn of [-1, 1]) {
        box(g, M.lamp, 0.62, 0.14, 0.44, sgn * 5.2, HTOP - 0.62, z);
        box(g, M.lamp, 0.52, 0.12, 0.38, sgn * (w - 2.2), HTOP - 0.62, z);
      }
    }
  }
  for (const sgn of [-1, 1]) {
    for (const [a, b] of clearOfWells(zA, zF)) {
      if (b - a < 1) continue;
      box(g, M.hangarSteel, 0.38, 0.52, b - a, sgn * (LIFT_HW + 0.4),
        HTOP - 0.55, (a + b) / 2);
    }
  }

  // Pillars, carrying the flight deck down through the hangar, clear of the
  // wells and clear of the aircraft lanes.
  for (let i = 0; i < 15; i++) {
    const z = zA + 7 + ((zF - zA - 14) * i) / 14;
    if (overWell(z)) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.hangarSteel, 0.40, HTOP - HANGAR - 0.3, 0.40,
        sgn * (LIFT_HW + 0.4), (HANGAR + HTOP) / 2, z);
    }
  }

  // The fire curtains: rolled divisions that shut the hangar into three.
  for (const z of [zA + (zF - zA) * 0.33, zA + (zF - zA) * 0.67]) {
    if (overWell(z)) continue;
    const w = hangarHalf(z) - 0.35;
    box(g, M.hangarDark, 2 * w, 0.85, 0.26, 0, HTOP - 1.15, z);
    for (const sgn of [-1, 1]) {
      box(g, M.hangarSteel, 0.28, HTOP - HANGAR - 0.3, 0.28,
        sgn * w, (HANGAR + HTOP) / 2, z);
    }
  }

  // Her air group, struck below: ranged fore and aft along the deck with their
  // wings folded, three abreast where the hangar is wide enough for three.
  //
  // Every one of them is checked against the hangar she is actually standing
  // in rather than against a single allowance for all three types. A Wildcat
  // on the Grumman sto-wing is under four metres across the folded panels and
  // an SBD does not fold at all -- she is twelve metres wing to wing in the
  // hangar or nowhere -- so one number for both either wastes half the deck or
  // puts a wing through the ship's side.
  //
  // The check is made at her nose and at her tail as well as amidships,
  // because the hangar draws in three metres over the after quarter, and it
  // takes in the yaw she is parked at: a thirteen-metre aeroplane stood six
  // degrees off the fore-and-aft line reaches most of a metre and a half
  // further outboard than her span alone says.
  const TYPES = {
    avenger: { half: 2.90, nose: 6.42, tail: -6.63, build: avenger },
    dauntless: { half: 6.16, nose: 5.27, tail: -5.67, build: dauntless },
    wildcat: { half: 1.88, nose: 5.17, tail: -4.89, build: wildcat },
  };
  const parked = [];
  const spot = (kind, x, z, ry) => {
    const T = TYPES[kind];
    const len = T.nose - T.tail;
    // Her ends, where they actually come in the ship.
    const c = Math.cos(ry);
    const sn = Math.abs(Math.sin(ry));
    const z0 = z - len / 2 - 0.3;
    const z1 = z + len / 2 + 0.3;
    // Not over a well anywhere along her: a lift on its way down takes the
    // deck out from under whatever is standing on it.
    for (const lz of liftZs()) {
      if (z1 > lz - LIFT_HW - 0.6 && z0 < lz + LIFT_HW + 0.6) return false;
    }
    // Inside the hangar sides at every station she occupies.
    const reach = Math.abs(x) + T.half * Math.abs(c) + (len / 2) * sn;
    for (let zz = z0; zz <= z1 + 1e-6; zz += 1.5) {
      if (reach > hangarHalf(Math.min(z1, zz)) - 0.35) return false;
    }
    if (z0 < zA + 1.5 || z1 > zF - 1.5) return false;
    // And clear of everything already ranged.
    const halfW = T.half * Math.abs(c) + (len / 2) * sn + 0.45;
    for (const p of parked) {
      if (Math.abs(p.z - z) < (p.len + len) / 2 + 1.0
        && Math.abs(p.x - x) < p.halfW + halfW) return false;
    }
    parked.push({ x, z, len, halfW });
    T.build(g, x, HANGAR + 0.6, z, ry, true);
    return true;
  };
  // Torpedo bombers right aft, three abreast where the beam is still there for
  // three; dive bombers amidships, two abreast and staggered half a length so
  // that the one pair of wings in the ship that will not fold has somewhere to
  // go; fighters forward, nearest the lifts, three abreast with their panels
  // swung back along their sides.
  //
  // Ranged in the bands the three wells leave between them, because those are
  // the only parts of the hangar deck that are deck: right aft is the boats'
  // and the last stretch forward is too short to stand anything in.
  for (let i = 0; i < 4; i++) {
    const z = -55.5 + i * 14.0;
    for (const x of [-8.0, 0, 8.0]) {
      spot('avenger', x, z, Math.PI + 0.05 * Math.sign(x || 1));
    }
  }
  for (let i = 0; i < 4; i++) {
    const sgn = i % 2 ? 1 : -1;
    spot('dauntless', sgn * 5.85, 17.5 + i * 6.4, Math.PI + 0.03 * sgn);
  }
  for (let i = 0; i < 3; i++) {
    const z = 42 + i * 9.0;
    for (const x of [-8.4, 0, 8.4]) {
      spot('wildcat', x, z, 0.05 * Math.sign(x || 1));
    }
  }

  // The people's gear: work benches and racks against the sides, oil drums,
  // crates, and a pair of the deck tractors that moved all of it about.
  for (let i = 0; i < 16; i++) {
    const z = zA + 9 + ((zF - zA - 18) * i) / 15;
    if (overWell(z)) continue;
    const sgn = i % 2 ? 1 : -1;
    const x = sgn * (hangarHalf(z) - 0.95);
    box(g, M.hangarDark, 1.2, 0.95, 2.9, x, HANGAR + 0.62, z);
    if (i % 3 === 1) {
      for (const dz of [-0.7, 0.7]) {
        cyl(g, M.gunDark, 0.3, 0.3, 0.88, x - sgn * 1.15, HANGAR + 0.55, z + dz, 10);
      }
    }
    if (i % 4 === 2) box(g, M.canvas, 1.05, 0.85, 1.5, x - sgn * 1.35, HANGAR + 0.53, z);
    if (i % 5 === 3) {
      box(g, M.hangarSteel, 0.9, 2.1, 1.6, x, HANGAR + 1.15, z + 3.4);
    }
  }
  for (const [tz, ts] of [[zA + 26, -1], [zF - 34, 1]]) {
    if (overWell(tz)) continue;
    const tx = ts * 3.4;
    box(g, M.gunDark, 1.5, 0.85, 2.9, tx, HANGAR + 0.62, tz);
    box(g, M.gunDark, 1.25, 0.65, 0.95, tx, HANGAR + 1.35, tz - 0.55);
    for (const dz of [-0.95, 0.95]) {
      for (const sgn of [-1, 1]) {
        cyl(g, M.wire, 0.33, 0.33, 0.28, tx + sgn * 0.8, HANGAR + 0.4, tz + dz, 10)
          .rotation.z = Math.PI / 2;
      }
    }
  }
}

// ------------------------------------------------------ the gallery deck --

/**
 * The gallery deck: a plated storey slung under the flight deck, carrying the
 * ready rooms, the guns' crews and the five-inch sponsons.
 *
 * It follows the flight deck's own outline and draws in with it at both ends.
 * Run out square, its plating stands proud of the deck edge where the deck has
 * tapered away, and the pillars under the after overhang come out as a bare
 * frame hanging in the air abaft the round-down.
 */
function galleryDeck(g) {
  const z0 = fdEndA(0) + 2.5;
  const z1 = fdEndF(0) - 2.5;
  const half = (z) => Math.max(0.6, Math.min(sideHalf(z), fdHalf(z) - 0.25));

  holedSheet(g, M.deckSteel, z0, z1, half, () => GALLERY, true, 100);
  holedSheet(g, M.steelDark, z0, z1, half, () => GALLERY - 0.28, false, 100);

  // The side of the gallery storey, from the gallery deck up to the flight
  // deck, wherever the hangar's own plating is not already carrying it.
  for (const sgn of [-1, 1]) {
    for (const [za, zb] of [[z0, HGR_A - 1.4], [HGR_F + 1.4, z1]]) {
      if (zb - za < 2) continue;
      const sk = strip();
      const n = [sgn, 0, 0];
      const steps = Math.max(2, Math.round((zb - za) / 3));
      for (let i = 0; i < steps; i++) {
        const a = za + ((zb - za) * i) / steps;
        const b = za + ((zb - za) * (i + 1)) / steps;
        sk.quad([sgn * half(a), GALLERY - 0.3, a], [sgn * half(b), GALLERY - 0.3, b],
          [sgn * half(b), FD - 0.44, b], [sgn * half(a), FD - 0.44, a], n);
      }
      sk.mesh(g, M.hull);
    }
    // Scuttles down the gallery and a watertight door every few frames, the
    // whole length of her -- this is where her people lived and worked.
    for (let i = 0; i < 40; i++) {
      const z = z0 + ((z1 - z0) * (i + 0.5)) / 40;
      const x = sgn * (half(z) + 0.08);
      if (i % 2 === 0) {
        cyl(g, M.glass, 0.27, 0.27, 0.12, x, GALLERY + 1.55, z, 8).rotation.z = Math.PI / 2;
      }
      if (i % 5 === 2) box(g, M.steelDark, 0.12, 1.85, 0.8, x, GALLERY + 1.05, z);
    }
  }

  // Where the gallery deck runs past the ends of the hangar it stands on its
  // own legs, down to the forecastle and the quarterdeck below.
  for (const [za, zb] of [[HGR_F + 2, z1 - 3], [z0 + 3, HGR_A - 2]]) {
    const n = Math.max(2, Math.round(Math.abs(zb - za) / 9));
    for (let i = 0; i <= n; i++) {
      const z = za + ((zb - za) * i) / n;
      const y = sheerY(tOf(z));
      const w = Math.min(half(z) - 1.0, halfDeck(z) - 0.5);
      if (w <= 1.2 || GALLERY - y < 1) continue;
      for (const sgn of [-1, 1]) {
        box(g, M.steelDark, 0.42, GALLERY - y - 0.3, 0.42, sgn * w, (GALLERY - 0.3 + y) / 2, z);
      }
      box(g, M.steelDark, 2 * w, 0.32, 0.42, 0, GALLERY - 0.45, z);
    }
  }
}

// ------------------------------------------------------- the flight deck --

/**
 * The flight deck: two hundred and fifty-four metres of planking on a steel
 * deck, marked out, with three holes in it and a round-down at each end.
 *
 * Built as a slab rather than as a sheet -- a top, an underside and an edge
 * band joining them -- because from a boat alongside the thing you look at is
 * the edge of it, and a deck with no thickness reads as a sheet of paper.
 */
function flightDeck(g) {
  const half = (z) => fdHalf(z);
  const T = 0.42;

  holedSheet(g, M.deck, FD_AFT, FD_FWD, half, fdY, true, 190);
  holedSheet(g, M.deckSteel, FD_AFT, FD_FWD, half, (z) => fdY(z) - T, false, 190);

  // The edge band round the whole outline, and round each well.
  {
    const sk = strip();
    const N = 190;
    for (let i = 0; i < N; i++) {
      const za = FD_AFT + ((FD_FWD - FD_AFT) * i) / N;
      const zb = FD_AFT + ((FD_FWD - FD_AFT) * (i + 1)) / N;
      const wa = Math.max(0.05, half(za));
      const wb = Math.max(0.05, half(zb));
      for (const sgn of [-1, 1]) {
        sk.quad([sgn * wa, fdY(za) - T, za], [sgn * wb, fdY(zb) - T, zb],
          [sgn * wb, fdY(zb), zb], [sgn * wa, fdY(za), za], [sgn, 0, 0]);
      }
    }
    // And the two end faces, which close the outline fore and aft.
    for (const [z, face] of [[FD_FWD, 1], [FD_AFT, -1]]) {
      const w = Math.max(0.05, half(z - face * 0.05));
      sk.quad([-w, fdY(z) - T, z], [w, fdY(z) - T, z], [w, fdY(z), z], [-w, fdY(z), z],
        [0, 0, face]);
    }
    sk.mesh(g, M.deckSteel);
  }

  // The planking: a run of darker seams laid fore and aft over the deck, every
  // fourth plank, because that is the scale the eye picks the run of a deck up
  // at from a masthead.
  for (let i = 0; i < 26; i++) {
    const x = -13.0 + (26.0 * (i + 0.5)) / 26;
    const zf = fdEndF(Math.abs(x) + 0.5);
    const za = fdEndA(Math.abs(x) + 0.5);
    const runs = Math.abs(x) < LIFT_HW ? clearOfWells(za, zf) : [[za, zf]];
    for (const [a, b] of runs) {
      if (b - a < 1) continue;
      const steps = Math.max(1, Math.round((b - a) / 14));
      for (let k = 0; k < steps; k++) {
        const p = a + ((b - a) * k) / steps;
        const q = a + ((b - a) * (k + 1)) / steps;
        const pl = box(g, M.deckDark, 0.22, 0.06, q - p, x, (fdY(p) + fdY(q)) / 2 + 0.03,
          (p + q) / 2);
        pl.rotation.x = -Math.atan2(fdY(q) - fdY(p), q - p);
      }
    }
  }

  // Deck edge coaming: a low curb the whole way round, which is what a pilot
  // lines up on and what keeps a tyre out of the catwalk.
  for (let i = 0; i < 90; i++) {
    const za = FD_AFT + ((FD_FWD - FD_AFT) * i) / 90;
    const zb = FD_AFT + ((FD_FWD - FD_AFT) * (i + 1)) / 90;
    const xa = half(za);
    const xb = half(zb);
    const len = Math.hypot(zb - za, xb - xa);
    for (const sgn of [-1, 1]) {
      const c = box(g, M.steelDark, 0.24, 0.34, len + 0.08,
        sgn * (xa + xb) / 2, (fdY(za) + fdY(zb)) / 2 + 0.16, (za + zb) / 2);
      c.rotation.y = sgn * Math.atan2(xb - xa, zb - za);
    }
  }

  // Markings. The centreline runs the whole deck and stops at every well: the
  // line is painted on the deck, so where there is no deck there is no line.
  for (const [a, b] of clearOfWells(FD_AFT + 7, FD_FWD - 7)) {
    if (b - a < 1) continue;
    const steps = Math.max(1, Math.round((b - a) / 12));
    for (let k = 0; k < steps; k++) {
      const p = a + ((b - a) * k) / steps;
      const q = a + ((b - a) * (k + 1)) / steps;
      const m = box(g, M.mark, 0.5, 0.05, q - p, 0, (fdY(p) + fdY(q)) / 2 + 0.06, (p + q) / 2);
      m.rotation.x = -Math.atan2(fdY(q) - fdY(p), q - p);
    }
  }
  // And the dashed lines marking the edges of the landing area, drawing in
  // with the deck as it narrows.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 40; i++) {
      const z = FD_AFT + 7 + i * 4.6;
      if (z > FD_FWD - 12) break;
      const x = sgn * (half(z) - 2.1);
      const m = box(g, M.mark, 0.3, 0.05, 2.5, x, fdY(z) + 0.06, z);
      m.rotation.y = sgn * Math.atan2(half(z + 2) - half(z - 2), 4);
      m.rotation.x = -Math.atan2(fdY(z + 2) - fdY(z - 2), 4);
    }
  }

  // The structure under the deck: transverse girders down on to the gallery
  // deck, and the pillars they stand on.
  for (let i = -15; i <= 15; i++) {
    const z = FD_MID + (i / 15) * (FDL / 2 - 7);
    const w = Math.min(fdHalf(z), sideHalf(z) + 0.3);
    if (w < 2) continue;
    if (overWell(z)) {
      for (const sgn of [-1, 1]) {
        if (w - LIFT_HW - 0.4 < 0.6) continue;
        box(g, M.steelDark, w - LIFT_HW - 0.4, 0.62, 0.42,
          sgn * (LIFT_HW + 0.4 + (w - LIFT_HW - 0.4) / 2), fdY(z) - T - 0.34, z);
      }
    } else {
      box(g, M.steelDark, 2 * w, 0.62, 0.42, 0, fdY(z) - T - 0.34, z);
    }
    const foot = z > HGR_F || z < HGR_A ? GALLERY : HTOP;
    for (const sgn of [-1, 1]) {
      const x = sgn * (w - 0.7);
      if (fdY(z) - T - 0.6 - foot < 0.4) continue;
      box(g, M.steelDark, 0.34, fdY(z) - T - 0.6 - foot, 0.34, x,
        (fdY(z) - T - 0.6 + foot) / 2, z);
    }
  }

  // The three wells: a coaming round the opening in the flight deck, and the
  // trunk that carries it down through the gallery storey.
  //
  // Down through the gallery storey and no further. Below the gallery deck
  // there is nothing to plate: the well opens into the hangar on all four
  // sides, which is what a lift trunk on a Yorktown actually is and why a
  // platform on its way down arrives in a lit shed instead of at the bottom of
  // a grey chimney. It was boxed in the whole way to the hangar deck, and what
  // everybody saw down an open well was four grey walls.
  for (const z of liftZs()) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.26, 0.40, 2 * LIFT_HW + 0.5, sgn * LIFT_HW, FD + 0.16, z);
      box(g, M.steelDark, 2 * LIFT_HW + 0.5, 0.40, 0.26, 0, FD + 0.16, z + sgn * LIFT_HW);
      box(g, M.hullDark, 0.28, FD - HTOP, 2 * LIFT_HW,
        sgn * (LIFT_HW + 0.14), (FD + HTOP) / 2, z);
      box(g, M.hullDark, 2 * LIFT_HW + 0.56, FD - HTOP, 0.28,
        0, (FD + HTOP) / 2, z + sgn * (LIFT_HW + 0.14));
      // Faced inboard with the hangar's own paint, because that is what you
      // are looking at down an open well: the trunk is part of the hangar, and
      // in the hull's dark grey a lift on its way down went into a chimney.
      box(g, M.hangarSide, 0.10, FD - HTOP - 0.1, 2 * LIFT_HW - 0.1,
        sgn * LIFT_HW, (FD + HTOP) / 2, z);
      box(g, M.hangarSide, 2 * LIFT_HW - 0.1, FD - HTOP - 0.1, 0.10,
        0, (FD + HTOP) / 2, z + sgn * LIFT_HW);
      // The guide rails the platform runs on, which do go the whole way down.
      for (const dz of [-LIFT_HW + 1.2, LIFT_HW - 1.2]) {
        box(g, M.steel, 0.20, FD - HANGAR - 0.3, 0.30, sgn * (LIFT_HW - 0.10),
          (FD + HANGAR) / 2, z + dz);
      }
      // And the sheaves over the head of the trunk that the falls run on.
      const sh = cyl(g, M.steelDark, 0.46, 0.46, 0.28, sgn * (LIFT_HW - 0.5), FD - 0.9, z, 12);
      sh.rotation.z = Math.PI / 2;
    }
  }

  // Arresting gear: nine wires across the after third on their fairleads, all
  // of them abaft the after lift -- a wire laid across a well has nothing
  // under it for half its length the moment the platform drops.
  for (let i = 0; i < 9; i++) {
    const z = FD_AFT + 11 + i * 3.8;
    const w = fdHalf(z) - 1.3;
    tubeX(g, M.wire, 0.07, 2 * w, 0, fdY(z) + 0.40, z, 6);
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.46, 0.26, 0.46, sgn * w, fdY(z) + 0.26, z);
    }
  }
  // Three crash barriers forward of the wires: stanchions and their cables.
  for (let i = 0; i < 3; i++) {
    const z = -61.0 + i * 6.0;
    const w = fdHalf(z) - 1.0;
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.30, 1.45, 0.30, sgn * w, fdY(z) + 0.72, z);
    }
    tubeX(g, M.wire, 0.085, 2 * w, 0, FD + 1.45, z, 6);
    tubeX(g, M.wire, 0.085, 2 * w, 0, FD + 0.88, z, 6);
  }

  // Palisades: the folding wind screens forward of the parking area, lying
  // down, which is how they lie whenever there is no deck park behind them.
  {
    const z = 66.0;
    const w = fdHalf(z) - 2;
    for (let i = 0; i < 7; i++) {
      const x = -w + i * ((2 * w) / 6);
      const p = box(g, M.canvas, (2 * w) / 6 - 0.4, 1.9, 0.14, x, FD + 0.12, z - 0.85);
      p.rotation.x = Math.PI / 2 - 0.06;
    }
  }
}

/**
 * The catwalks: a gallery slung under the deck edge for the whole length of
 * her, with the light guns in their tubs off it and the life rafts on its
 * rails.
 *
 * This is the detail that reads at any range. A carrier without them is a
 * plank on a hull; with them the deck edge has depth and the ship has a scale.
 */
function catwalks(g) {
  const y = FD - 1.86;
  for (const sgn of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 46; i++) {
      const z = FD_AFT + 6 + ((FDL - 16) * i) / 46;
      const hw = sideHalf(z);
      const x = sgn * (hw + 0.95);
      const ang = sgn * Math.atan2(sideHalf(z + 3) - sideHalf(z - 3), 6);
      box(g, M.steelDark, 2.0, 0.12, (FDL - 16) / 46 + 0.2, x, y, z, ang);
      if (i % 2 === 0) {
        const br = box(g, M.steelDark, 2.3, 0.2, 0.18, sgn * (hw + 0.25), y + 0.52, z);
        br.rotation.z = sgn * 0.5;
      }
      pts.push([x + sgn * 0.9, y + 0.06, z]);
      if (i % 3 === 1) {
        const r = cyl(g, M.raft, 0.30, 0.30, 1.8, x + sgn * 0.72, y + 0.95, z, 8);
        r.rotation.x = Math.PI / 2;
      }
    }
    for (let i = 1; i < pts.length; i++) {
      const [x, yy, z] = pts[i];
      const [px, py, pz] = pts[i - 1];
      box(g, M.steelDark, 0.055, 1.0, 0.055, x, yy + 0.5, z);
      const len = Math.hypot(x - px, z - pz);
      for (const f of [0.38, 0.70, 1.0]) {
        const w = box(g, M.steelDark, 0.045, 0.045, len,
          (x + px) / 2, (yy + py) / 2 + f, (z + pz) / 2);
        w.rotation.y = Math.atan2(x - px, z - pz);
      }
    }
    // Ladders down from the catwalk to the gallery deck, where her people
    // actually went up and down.
    for (const z of [-92, -44, 12, 58, 104]) {
      if (Math.abs(z) > FDL / 2 - 12) continue;
      ladder(g, M.steel, sgn * (sideHalf(z) + 0.4), GALLERY, y - 0.1, z + 2.4, z - 0.6);
    }
  }
}

// ------------------------------------------------------------- the island --

/** Where she stands: starboard side, a little forward of amidships. */
const ISL_Z = 16.0;
const ISL_W = 5.6;
const ISL_CX = S * 14.2;                // the centreline of the island itself
const ISL_IN = S * (14.2 - ISL_W / 2);  // its inboard face, a metre and a half in from the deck edge

/** Athwartships, in island terms: outboard is positive whichever side she is. */
const ox = (d) => ISL_CX + S * d;
/** A level's floor, as a height above the water. */
const D = (h) => FD + h;

/**
 * The island: small, on the starboard side, with the funnel built into it.
 *
 * A Yorktown's island is about an eighth of the deck's length and six metres
 * wide, and it is one structure -- the uptakes come up through it and the
 * funnel is its after half, canted a few degrees outboard so the smoke clears
 * the deck. Everything on it is stepped in from the level below, which is what
 * gives it its profile, and everything stands on the level below: there is
 * nothing on a warship that is not bolted to something.
 *
 * Only a metre or so of it is on the flight deck. The rest is cantilevered out
 * past the deck edge on a sponson, which is the whole point -- every square
 * metre of island kept inboard is a square metre taken off the landing area.
 */
function island(g) {
  const Z = ISL_Z;
  const cx = ISL_CX;

  // ------------------------------------------------------------ the base --
  // The sponson under it: a plated box off the gallery deck reaching out past
  // the deck edge, with deep brackets under that down on to the ship's side.
  {
    const sxi = S * 9.4;
    const sxo = ox(ISL_W / 2 + 1.3);
    const sw = Math.abs(sxo - sxi);
    const scx = (sxi + sxo) / 2;
    box(g, M.steelDark, sw, 0.32, 31.0, scx, GALLERY, Z);
    box(g, M.hull, 0.30, FD - GALLERY - 0.24, 31.0, sxo, (GALLERY + FD) / 2, Z);
    for (const dz of [-15.4, 15.4]) {
      box(g, M.hull, sw, FD - GALLERY - 0.24, 0.28, scx, (GALLERY + FD) / 2, Z + dz);
    }
    for (let i = 0; i < 8; i++) {
      const z = Z - 14 + i * 4;
      const br = box(g, M.steelDark, sw + 1.2, 0.26, 0.26, scx, GALLERY - 1.5, z);
      br.rotation.z = -S * 0.42;
      box(g, M.steelDark, 0.22, 3.3, 0.22, sxo, GALLERY - 1.6, z);
    }
    // The 20 mm gallery outboard of the sponson, under the island's own side.
    box(g, M.steelDark, 2.4, 0.14, 26.0, sxo + S * 1.1, GALLERY + 0.08, Z);
    rail(g, M.steelDark, Z - 12.5, Z + 12.5, () => Math.abs(sxo) + 2.2,
      () => GALLERY + 0.15, 2.5, [S], 1.0);
  }

  // The island proper: three storeys of plating standing on the flight deck
  // and overhanging the side, each drawn as a shape with a rounded forward end
  // rather than as a box, because that is what the forward face of an island
  // is and it is the whole of its profile from ahead.
  const level = (m, y0, y1, hw, zF, zB, nose, tail) => loftShape(g, m, [
    { pts: planHouse({ hw, nose, tail, zFront: zF, zBack: zB, arc: 7 })
      .map(([x, z]) => [cx + x, z]), y: y0 },
    { pts: planHouse({ hw, nose, tail, zFront: zF, zBack: zB, arc: 7 })
      .map(([x, z]) => [cx + x, z]), y: y1 },
  ], { cap: true, floor: true });

  level(M.hull, D(0), D(4.2), ISL_W / 2, Z + 15.0, Z - 15.0, 3.2, 2.2);
  box(g, M.steelDark, ISL_W + 0.6, 0.26, 30.4, cx, D(4.2), Z);
  // The gallery round the foot of it, which is where her people walk.
  for (const sgn of [-1, 1]) {
    const gx = cx + S * sgn * (ISL_W / 2 + 0.85);
    box(g, M.steelDark, 1.8, 0.14, 24.0, gx, D(4.3), Z);
    for (const bz of [-9, -3, 3, 9]) {
      const br = box(g, M.steelDark, 2.0, 0.15, 0.15, cx + S * sgn * (ISL_W / 2 + 0.55),
        D(3.7), Z + bz);
      br.rotation.z = -S * sgn * 0.5;
    }
    rail(g, M.steelDark, Z - 11.5, Z + 11.5,
      () => Math.abs(cx) + sgn * S * S * (ISL_W / 2 + 1.7) * (sgn > 0 ? 1 : -1),
      () => D(4.4), 2.6, [S], 1.0);
  }
  // Doors, ready lockers and ladders down the inboard face, where the deck
  // crew reach it.
  for (const dz of [-10.5, -4.5, 1.5, 7.5, 12.5]) {
    box(g, M.steelDark, 0.14, 1.95, 0.85, ISL_IN - S * 0.02, D(0.98), Z + dz);
  }
  for (const dz of [-12.0, 9.0]) {
    sideLadder(g, M.steel, {
      out: -S, skin: () => ISL_IN, z: Z + dz, y0: D(0.02), y1: D(4.2), half: 0.3,
    });
  }
  for (const dz of [-8.0, -2.0, 4.0]) {
    box(g, M.steelDark, 1.0, 1.2, 2.4, ox(ISL_W / 2 + 0.5), D(0.6), Z + dz);
  }
  for (const dz of [-13.0, 10.5]) {
    const r = cyl(g, M.raft, 0.32, 0.32, 2.3, ox(ISL_W / 2 + 0.32), D(2.5), Z + dz, 8);
    r.rotation.x = Math.PI / 2;
  }

  // ------------------------------------------------- the second storey --
  level(M.hull, D(4.2), D(6.8), ISL_W / 2 - 0.35, Z + 12.6, Z - 13.4, 2.9, 2.0);
  box(g, M.steelDark, ISL_W + 0.2, 0.24, 26.6, cx, D(6.8), Z - 0.4);

  // ----------------------------------------------------- the bridge decks --
  // Lower and longer than a battleship's tower: a Yorktown's island is a
  // wheelhouse on a box, not a pagoda, and the whole of it stands well under
  // the height of her funnel.
  const decks = [
    ['pilot', 6.8, 2.60, 2.9, Z + 11.2, Z + 1.6, 2.7, 1.8],
    ['flag', 9.7, 2.35, 2.6, Z + 9.8, Z + 2.4, 2.4, 1.6],
    ['plot', 12.3, 2.05, 2.3, Z + 8.4, Z + 3.0, 2.1, 1.4],
  ];
  for (const [name, y, hw, h, zF, zB, nose, tail] of decks) {
    level(M.hull, D(y), D(y + h), hw, zF, zB, nose, tail);
    box(g, M.steelDark, hw * 2 + 0.5, 0.22, zF - zB + nose + tail + 0.5,
      cx, D(y + h), (zF + zB) / 2 + (nose - tail) / 2);
    // The window band, round the front and both sides of a pilot house.
    box(g, M.glass, hw * 2 + 0.12, h * 0.34, (zF - zB) * 0.92, cx, D(y) + h * 0.66,
      (zF + zB) / 2);
    box(g, M.glass, hw * 1.7, h * 0.34, zF - zB + nose * 0.9, cx, D(y) + h * 0.66,
      (zF + zB) / 2 + nose * 0.42);
    // Wing bridges: a platform out each side on its brackets, with a rail.
    for (const sgn of [-1, 1]) {
      const wx = cx + S * sgn * (hw + 0.8);
      const wz = (zF + zB) / 2 + 1.0;
      box(g, M.steelDark, 1.7, 0.13, (zF - zB) * 0.8, wx, D(y) + 0.06, wz);
      for (const bz of [-(zF - zB) * 0.3, (zF - zB) * 0.3]) {
        const br = box(g, M.steelDark, 1.9, 0.14, 0.14, cx + S * sgn * (hw + 0.55),
          D(y) - 0.5, wz + bz);
        br.rotation.z = -S * sgn * 0.46;
      }
      const rx = Math.abs(cx + S * sgn * (hw + 1.55));
      rail(g, M.steelDark, wz - (zF - zB) * 0.4, wz + (zF - zB) * 0.4,
        () => rx, () => D(y) + 0.1, 2.0, [Math.sign(cx + S * sgn * (hw + 1.55)) || S], 1.0);
    }
  }

  // ------------------------------------------------------- the open bridge --
  // A Yorktown was conned from the open bridge, not from behind glass: a
  // walkway wrapped round the front and both sides of the pilot house behind a
  // splinter bulwark, with the pelorus on each wing and the engine telegraphs
  // by the centreline. It is the shape that makes the forward end of the
  // island read as a bridge rather than as another box on the pile.
  for (const [y, hw, zc, od, bh] of [[6.8, 2.60, Z + 6.4, 6.6, 1.25],
    [9.7, 2.35, Z + 6.1, 5.6, 1.15]]) {
    const ow = hw + 1.6;
    const N = 19;
    for (let i = 0; i < N; i++) {
      const a = -1.95 + (i / (N - 1)) * 3.9;
      const px = cx + Math.sin(a) * ow;
      const pz = zc + Math.cos(a) * od;
      box(g, M.hull, 1.0, bh, 0.20, px, D(y) + bh / 2, pz, a);
      box(g, M.steelDark, 1.0, 0.14, 1.8, px - Math.sin(a) * 0.8,
        D(y) + 0.07, pz - Math.cos(a) * 0.8, a);
      if (i % 3 === 0) {
        const br = box(g, M.steelDark, 1.9, 0.15, 0.15,
          cx + Math.sin(a) * (ow - 0.85), D(y) - 0.58, zc + Math.cos(a) * (od - 0.85));
        br.rotation.y = -a;
        br.rotation.z = Math.sin(a) > 0 ? 0.48 : -0.48;
      }
    }
    // The pelorus on each wing, and the telegraphs by the centreline.
    for (const sgn of [-1, 1]) {
      const px = cx + sgn * (ow - 0.65);
      cyl(g, M.steelDark, 0.15, 0.19, 0.95, px, D(y) + 0.48, zc + od * 0.3, 8);
      cyl(g, M.bright, 0.32, 0.32, 0.15, px, D(y) + 1.0, zc + od * 0.3, 12);
      cyl(g, M.steelDark, 0.19, 0.23, 1.05, cx + sgn * 1.05, D(y) + 0.53, zc + od - 0.85, 8);
      box(g, M.bright, 0.34, 0.38, 0.2, cx + sgn * 1.05, D(y) + 1.15, zc + od - 0.85);
    }
    // The windscreen over the front of the bulwark.
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + (i / 4) * 1.0;
      const wv = box(g, M.glass, 0.95, 0.5, 0.1, cx + Math.sin(a) * (ow + 0.02),
        D(y) + bh + 0.24, zc + Math.cos(a) * (od + 0.02), a);
      wv.rotation.x = -0.22;
    }
  }
  // The two 24-inch signal lamps on the pilot house wings, and the flag bags
  // on the flag bridge.
  for (const sgn of [-1, 1]) {
    const wx = cx + S * sgn * 3.4;
    box(g, M.steelDark, 0.28, 0.8, 0.28, wx, D(6.8) + 0.53, Z + 11.4);
    cyl(g, M.bright, 0.42, 0.42, 0.56, wx, D(6.8) + 1.18, Z + 11.4, 12)
      .rotation.x = Math.PI / 2;
    box(g, M.canvas, 1.3, 0.75, 2.1, cx + S * sgn * 3.15, D(9.7) + 0.48, Z + 3.4);
  }
  // Sky control: an open platform over air plot behind a splinter bulwark.
  {
    const y = D(14.6);
    box(g, M.steelDark, 4.4, 0.24, 6.2, cx, y, Z + 5.6);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      box(g, M.steel, 0.85, 1.05, 0.16, cx + Math.sin(a) * 2.1, y + 0.64,
        Z + 5.6 + Math.cos(a) * 3.0, a);
    }
  }

  // ------------------------------------------------------------ the funnel --
  // The uptake casing is not a chimney stuck on the back of the bridge: it is
  // the whole after half of the island, twelve metres of it fore and aft,
  // canted a few degrees outboard so the smoke clears the deck, with the cap
  // flaring off the top and a grille across the mouth.
  const FZ = Z - 6.4;
  const FY0 = 4.2;
  const FY1 = 16.6;
  const FH = FY1 - FY0;
  const FL = 13.0;
  const fun = new THREE.Group();
  fun.position.set(ox(0.45), D((FY0 + FY1) / 2), FZ);
  fun.rotation.z = -S * 0.06;
  g.add(fun);
  box(fun, M.hull, ISL_W + 0.5, FH, FL, 0, 0, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(fun, M.hullDark, 0.3, FH, 0.3, sx * (ISL_W + 0.5) / 2, 0, sz * (FL / 2 - 0.2));
    }
  }
  for (let i = 1; i <= 4; i++) {
    const y = -FH / 2 + (i * FH) / 5;
    box(fun, M.hullDark, ISL_W + 0.8, 0.2, FL + 0.26, 0, y, 0);
  }
  // The vertical strakes up her sides and her after face.
  //
  // A funnel this size is thirteen metres of flat plate with four bands round
  // it, and from any distance at all that is a slab. What tells the eye it is
  // a funnel is the stiffening: the standing seams up the faces, which are the
  // only thing on it that runs the way its height does.
  for (const sx of [-1, 1]) {
    for (const dz of [-4.2, -1.4, 1.4, 4.2]) {
      box(fun, M.hullDark, 0.22, FH - 0.5, 0.52, sx * (ISL_W + 0.62) / 2, 0, dz);
    }
  }
  for (const dx of [-1.5, 0, 1.5]) {
    box(fun, M.hullDark, 0.52, FH - 0.5, 0.22, dx, 0, -(FL + 0.24) / 2);
  }
  // The cap: a flared collar standing well proud of the casing, a black band
  // round it, and the grille of bars across the mouth with the dark of the
  // uptake behind them.
  box(fun, M.steelDark, ISL_W + 2.1, 0.5, FL + 1.5, 0, FH / 2 + 0.25, 0);
  box(fun, M.steelDark, ISL_W + 1.5, 0.34, FL + 1.0, 0, FH / 2 - 0.16, 0);
  box(fun, M.boot, ISL_W + 1.2, 0.8, FL + 0.66, 0, FH / 2 + 0.90, 0);
  box(fun, M.cave, ISL_W - 0.6, 0.28, FL - 1.2, 0, FH / 2 + 1.14, 0);
  for (let i = 0; i < 7; i++) {
    box(fun, M.steelDark, 0.15, 0.28, FL - 1.0,
      -(ISL_W - 0.8) / 2 + (i * (ISL_W - 0.8)) / 6, FH / 2 + 1.26, 0);
  }
  for (let i = 0; i < 3; i++) {
    box(fun, M.steelDark, ISL_W - 0.6, 0.28, 0.15, 0, FH / 2 + 1.26,
      -(FL - 1.4) / 2 + (i * (FL - 1.4)) / 2);
  }
  // Steam pipes up the after face with their whistles, the siren forward, and
  // a ladder up the outboard side.
  for (const sgn of [-1, 1]) {
    cyl(fun, M.steelDark, 0.24, 0.24, FH + 2.0, sgn * 1.5, 1.0, -FL / 2 - 0.28, 8);
    box(fun, M.steelDark, 0.46, 0.42, 0.46, sgn * 1.5, FH / 2 + 1.4, -FL / 2 - 0.28);
    cyl(fun, M.bright, 0.3, 0.4, 0.85, sgn * 0.85, FH / 2 - 2.0, FL / 2 + 0.3, 10)
      .rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 12; i++) {
    box(fun, M.steel, 0.1, 0.07, 0.46, -S * (ISL_W + 0.5) / 2 - S * 0.2,
      -FH / 2 + 0.6 + i * (FH - 1.2) / 11, 1.2);
  }
  for (const dz of [0.95, 1.45]) {
    box(fun, M.steel, 0.1, FH - 0.8, 0.1, -S * (ISL_W + 0.5) / 2 - S * 0.2, 0, dz);
  }
  // Searchlight platforms either side of the funnel, on their brackets.
  for (const sgn of [-1, 1]) {
    const px = cx + S * sgn * (ISL_W / 2 + 1.9);
    box(g, M.steelDark, 3.2, 0.26, 4.2, px, D(11.6), FZ + 0.5);
    for (const bz of [-1.3, 1.3]) {
      const br = box(g, M.steelDark, 2.9, 0.17, 0.17, cx + S * sgn * (ISL_W / 2 + 1.05),
        D(10.9), FZ + 0.5 + bz);
      br.rotation.z = -S * sgn * 0.5;
    }
    cyl(g, M.bright, 0.74, 0.74, 1.1, px, D(12.45), FZ + 0.5, 14).rotation.x = Math.PI / 2;
    box(g, M.steelDark, 0.46, 0.95, 0.46, px, D(12.05), FZ + 0.5);
    rail(g, M.steelDark, FZ - 1.4, FZ + 2.4, () => Math.abs(px) + 1.5,
      () => D(11.75), 1.4, [Math.sign(px) || S], 1.0);
  }

  // -------------------------------------------------------- the tripod mast --
  // Stepped on the second storey between the bridge and the funnel, so its
  // legs land on structure rather than on air. The legs are splayed at the
  // foot and gather at the truck, which is what makes it a tripod rather than
  // three posts standing side by side.
  const mastZ = Z + 1.2;
  const mastFoot = D(6.8);
  const mastTop = D(25.8);
  for (const [dx, dz] of [[0, 1.8], [-2.1, -1.8], [2.1, -1.8]]) {
    const x0 = cx + S * dx;
    const z0 = mastZ + dz;
    const rise = mastTop - mastFoot;
    const len = Math.hypot(cx - x0, rise, mastZ - z0);
    const leg = cyl(g, M.steel, 0.18, 0.32, len,
      (x0 + cx) / 2, (mastFoot + mastTop) / 2, (z0 + mastZ) / 2, 8);
    leg.rotation.x = Math.atan2(mastZ - z0, rise);
    leg.rotation.z = Math.atan2(x0 - cx, rise);
  }
  for (const h of [9.8, 13.0, 16.2, 19.4, 22.6]) {
    const k = 1 - (h - 6.8) / (25.8 - 6.8);
    box(g, M.steel, 4.2 * k + 0.5, 0.15, 0.15, cx, D(h), mastZ - 2.0 * k);
    box(g, M.steel, 0.15, 0.15, 4.2 * k + 0.5, cx, D(h), mastZ + 0.4 * k);
  }
  // The lookout's platform, and the signal yard with its halyards.
  box(g, M.steelDark, 3.2, 0.2, 2.8, cx, D(17.8), mastZ);
  rail(g, M.steelDark, mastZ - 1.3, mastZ + 1.3, () => Math.abs(ox(1.4)),
    () => D(17.9), 1.3, [Math.sign(ox(1.4)) || S], 1.0);
  box(g, M.steel, 10.6, 0.17, 0.17, cx, D(21.4), mastZ);
  for (const sgn of [-1, 1]) {
    for (let i = 1; i <= 3; i++) {
      const wr = box(g, M.wire, 0.05, 5.4, 0.05, cx + S * sgn * i * 1.65, D(18.7), mastZ);
      wr.rotation.z = -S * sgn * 0.15 * i;
    }
  }
  // A hoist of bunting on the outboard halyard. On a ship painted one colour
  // from her boot topping to her masthead the signal flags are the only colour
  // there is, and at any range they are the first thing the eye finds on her.
  {
    const bunting = [M.flagRed, M.mark, M.flagBlue, M.flagGold, M.flagRed, M.mark, M.flagBlue];
    const hx = cx + S * 3 * 1.65;
    const drop = 1.0;
    const step = 0.23;
    const rope = box(g, M.wire, 0.055, drop * bunting.length + 0.6, 0.055,
      hx + S * (0.5 + step * (bunting.length - 1) / 2),
      D(21.1) - (drop * (bunting.length - 1)) / 2 - 0.35, mastZ);
    rope.rotation.z = -S * Math.atan2(step * (bunting.length - 1), drop * (bunting.length - 1));
    for (let i = 0; i < bunting.length; i++) {
      const y = D(21.1) - 0.35 - i * drop;
      const f = box(g, bunting[i], 0.1, 0.82, 0.9, hx + S * (0.5 + i * step), y, mastZ);
      f.rotation.z = -S * 0.45;
      f.rotation.y = 0.12 * (i % 2 ? 1 : -1);
    }
  }
  for (const sgn of [-1, 1]) {
    const hw = box(g, M.wire, 0.05, 11.0, 0.05, cx + S * sgn * 2.8, D(15.6), mastZ + 1.2);
    hw.rotation.x = -0.30;
    hw.rotation.z = -S * sgn * 0.16;
  }
  // CXAM air search: a wide rectangular mattress of dipoles on a short topmast
  // above the truck. It is the biggest single thing on her upperworks and the
  // one that says 1942 rather than 1938, so it is built at the size it was.
  box(g, M.steel, 2.5, 0.55, 2.7, cx, D(24.8), mastZ);
  cyl(g, M.steel, 0.17, 0.23, 2.5, cx, D(26.2), mastZ, 8);
  const sc = new THREE.Group();
  sc.position.set(cx, D(27.3), mastZ);
  sc.rotation.y = 1.15;
  g.add(sc);
  const SCW = 6.2;
  const SCH = 2.6;
  for (const y of [0, SCH]) box(sc, M.steel, SCW, 0.17, 0.32, 0, y, 0);
  for (const sx of [-1, 1]) box(sc, M.steel, 0.17, SCH, 0.32, sx * SCW / 2, SCH / 2, 0);
  for (let i = 0; i < 13; i++) {
    const x = -SCW / 2 + 0.24 + (i * (SCW - 0.48)) / 12;
    box(sc, M.steel, 0.1, SCH - 0.2, 0.1, x, SCH / 2, 0);
    for (const y of [SCH * 0.3, SCH * 0.7]) box(sc, M.steel, 0.07, 0.07, 0.82, x, y, 0.4);
  }
  box(sc, M.steel, SCW - 0.6, 0.12, 0.12, 0, SCH / 2, -0.34);
  for (const sx of [-1, 1]) box(sc, M.steel, 0.12, 0.12, 0.78, sx * 1.4, SCH / 2, -0.2);
  cyl(sc, M.steelDark, 0.28, 0.28, 0.68, 0, -0.5, 0, 10);
  // SG surface search in its cheese housing, on the starboard yardarm.
  const sg = cyl(g, M.steel, 0.9, 0.9, 0.52, ox(2.3), D(22.9), mastZ, 14);
  sg.rotation.x = Math.PI / 2;
  box(g, M.steel, 0.3, 1.9, 0.2, ox(2.3), D(22.0), mastZ);
  // Whip aerials down the outboard side of the island, hinged out.
  for (const dz of [-13.0, -7.0, 6.0, 12.0]) {
    const w = cyl(g, M.wire, 0.05, 0.08, 5.6, ox(ISL_W / 2 + 0.25), D(4.2), Z + dz, 6);
    w.rotation.z = S * 0.35;
  }

  // -------------------------------------------------------- fire control --
  // Two Mk 37 directors with their Mk 4 antennas: one over air plot looking
  // forward, one on a platform carried off the island's after end.
  for (const [y, z, fwd] of [[D(14.6), Z + 8.4, 1], [D(10.4), Z - 15.4, -1]]) {
    if (fwd < 0) {
      box(g, M.steelDark, 5.2, 0.28, 4.8, cx, y - 0.14, z);
      for (const sgn of [-1, 1]) {
        const br = box(g, M.steelDark, 2.5, 0.17, 0.17, cx + S * sgn * 1.5, y - 0.85, z);
        br.rotation.z = -S * sgn * 0.5;
      }
      box(g, M.hull, 3.1, 3.5, 5.4, cx, y - 1.85, z + 1.9);
    }
    const d = new THREE.Group();
    d.position.set(cx, y, z);
    d.rotation.y = fwd > 0 ? 0 : Math.PI;
    g.add(d);
    cyl(d, M.gun, 1.5, 1.7, 0.95, 0, 0.48, 0, 14);
    box(d, M.gun, 2.9, 1.85, 3.3, 0, 1.9, 0);
    box(d, M.gunDark, 3.0, 0.48, 0.2, 0, 2.42, 1.65);
    box(d, M.glass, 2.1, 0.38, 0.15, 0, 2.15, 1.7);
    box(d, M.steel, 2.5, 1.85, 0.15, 0, 3.45, 0.2);
    for (let i = 0; i < 5; i++) box(d, M.steel, 0.08, 0.08, 0.48, -1.0 + i * 0.5, 3.45, 0.44);
    for (const sgn of [-1, 1]) {
      cyl(d, M.gun, 0.19, 0.19, 0.48, sgn * 1.35, 2.88, 0.2, 8).rotation.z = Math.PI / 2;
    }
  }

  // The short pole mast abaft the funnel with its yard and the after signal
  // light on it: the second stick every photograph of her shows.
  {
    const pz = Z - 15.4;
    const py = D(10.4);
    cyl(g, M.steel, 0.15, 0.25, 10.6, cx, py + 5.3, pz, 8);
    box(g, M.steel, 5.8, 0.13, 0.13, cx, py + 8.1, pz);
    for (const sgn of [-1, 1]) {
      cyl(g, M.bright, 0.25, 0.25, 0.38, cx + S * sgn * 2.5, py + 8.4, pz, 10)
        .rotation.x = Math.PI / 2;
      const st = box(g, M.wire, 0.05, 5.2, 0.05, cx + S * sgn * 2.1, py + 5.8, pz);
      st.rotation.z = -S * sgn * 0.16;
    }
    cyl(g, M.steel, 0.1, 0.13, 2.9, cx, py + 11.8, pz, 6);
  }
  // The flag staff at the island's truck.
  box(g, M.steel, 0.13, 3.3, 0.13, cx, D(16.2), Z + 8.4);
}

// ---------------------------------------------------------------- weapons --

// The light guns built during the current pass, so the builder can hand them
// to the scene. Reset when a build starts: two Enterprises in one action must
// not end up sharing one another's mountings.
let AA_MOUNTS = [];

/**
 * A 5"/38 single in an open mount with a shield: eight of them, in four
 * sponsons at the corners of the flight deck.
 *
 * Marked dynamic and recorded, because these are the guns the simulation lays,
 * and each one trains on its own pintle. Being dynamic also keeps the welder
 * off it, which is what lets it turn at all.
 */
function fiveInch(g, root, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  m.userData.rest = ry;
  (root.userData.turrets || (root.userData.turrets = [])).push(m);
  g.add(m);
  // The pintle and the roller path it turns on.
  cyl(m, M.gunDark, 1.2, 1.32, 0.46, 0, 0.23, 0, 16);
  cyl(m, M.steelDark, 1.46, 1.46, 0.12, 0, 0.06, 0, 18);
  // The shield: a front plate with the gun port in it, two sides and a roof,
  // open at the back, which is what a 5"/38 single wore on a carrier.
  box(m, M.gun, 2.4, 2.0, 0.16, 0, 1.52, 1.12);
  for (const sgn of [-1, 1]) box(m, M.gun, 0.16, 2.0, 2.2, sgn * 1.2, 1.52, 0.05);
  box(m, M.gun, 2.5, 0.16, 2.3, 0, 2.6, 0.05);
  box(m, M.gunDark, 0.9, 0.85, 0.12, 0, 1.55, 1.2);
  for (const sgn of [-1, 1]) box(m, M.glass, 0.26, 0.2, 0.1, sgn * 0.72, 1.95, 1.21);
  // Trunnions, cradle and the barrel through the shield.
  for (const sgn of [-1, 1]) {
    cyl(m, M.gunDark, 0.2, 0.2, 0.38, sgn * 0.58, 1.48, 0.18, 10).rotation.z = Math.PI / 2;
  }
  const arm = new THREE.Group();
  arm.position.set(0, 1.48, 0.18);
  arm.rotation.x = -0.2;
  m.add(arm);
  box(arm, M.gunDark, 0.72, 0.68, 1.5, 0, 0, -0.38);
  cyl(arm, M.canvas, 0.34, 0.38, 0.4, 0, 0, 0.9, 12).rotation.x = Math.PI / 2;
  tubeZ(arm, M.gun, 0.13, 4.5, 0, 0, 2.35, 12);
  tubeZ(arm, M.gunDark, 0.175, 0.46, 0, 0, 0.75, 12);
  cyl(arm, M.gunDark, 0.145, 0.15, 0.24, 0, 0, 4.5, 12).rotation.x = Math.PI / 2;
  m.userData.trainRate = 0.9;      // a 5"/38 single, worked by its crew
  armMount(m, arm, [[0, 0, 4.7]]);
  // The loader's platform and the ready-service racks round the base, which is
  // the whole after half of the mounting and where its crew of eleven stood.
  cyl(m, M.steelDark, 2.0, 2.0, 0.09, 0, 0.045, -0.55, 16);
  for (let i = 0; i < 9; i++) {
    const a = -2.0 + i * 0.5;
    box(m, M.steelDark, 0.26, 0.85, 0.26, Math.sin(a) * 1.85, 0.48, Math.cos(a) * 1.85 - 0.55);
  }
  for (const sgn of [-1, 1]) box(m, M.gunDark, 0.5, 0.4, 0.5, sgn * 0.85, 1.15, -1.5);
  mergeStatic(m);
  return m;
}

/** A quadruple 40 mm Bofors in its tub, with its own Mk 51 director alongside. */
function bofors(g, x, y, z, ry) {
  const m = quadBofors(g, M, x, y, z, ry);
  AA_MOUNTS.push(m);
  return m;
}

/** A single 20 mm Oerlikon in its splinter tub. */
function oerlikon(g, x, y, z, ry) {
  const m = usnOerlikon(g, M, x, y, z, ry);
  AA_MOUNTS.push(m);
  return m;
}

/**
 * The second gun of a twenty-millimetre pair.
 *
 * Drawn exactly like the first and deliberately not registered as a mounting:
 * the arsenal names the position, a captain presses the position, and the pair
 * on it fires together. Registering both would make her arsenal twice as long
 * as her gallery and put half its circles on a gun nobody thinks of as a
 * separate weapon.
 */
function mate(g, x, y, z, ry) {
  const m = oerlikon(g, x, y, z, ry);
  AA_MOUNTS.pop();
  return m;
}

// Where the light battery stands, read off the model as it is built so the
// datasheet and the geometry cannot drift apart.
const FORTY_AT = [
  [1, 113.0], [-1, 113.0],
  [1, 99.0], [-1, 99.0],
  [-1, -3.0], [-1, -16.0],
  [1, -104.0], [-1, -100.0],
];
const SPONSON_AT = [
  [-1, 78.6], [-1, -62.9],       // starboard, forward and aft
  [1, 68.1], [1, -73.4],         // port
];

/**
 * Her guns: eight 5-inch in four sponsons at the corners of the flight deck,
 * eight quadruple Bofors, and Oerlikons the whole length of both catwalks.
 *
 * The five-inch cannot fire across the deck -- the deck is in the way of
 * everything -- which is why they are where they are, why each is laid abeam,
 * and why a Yorktown was always short of guns on the engaged side and had to
 * turn to bring the other four to bear.
 */
function armament(g) {
  const gy = GALLERY;
  for (const [sgn, z] of SPONSON_AT) {
    const x = sgn * 14.2;
    // The sponson: a platform on brackets off the gallery deck, with a
    // splinter bulwark round its outboard edge.
    box(g, M.steelDark, 6.6, 0.3, 13.6, x + sgn * 1.0, gy, z);
    // The knees that carry it: from the ship's side below the hangar openings
    // up and out to the sponson's outboard edge.
    //
    // They used to spring from a point halfway up the openings, which put a
    // metre of each one inside the hangar and drew three diagonal braces
    // straight across the bays from outside -- and they leaned the wrong way
    // besides, high at the ship's side and low at the sponson, so the platform
    // was hanging off them rather than standing on them.
    for (const dz of [-5.0, 0, 5.0]) {
      const foot = HANGAR + 0.2;
      const head = gy - 0.28;
      const xi = sgn * (sideHalf(z + dz) - 0.3);
      const xo = x + sgn * 4.2;
      const len = Math.hypot(xo - xi, head - foot);
      const br = box(g, M.steelDark, len, 0.40, 0.40,
        (xi + xo) / 2, (foot + head) / 2, z + dz);
      br.rotation.z = Math.atan2(head - foot, xo - xi);
      box(g, M.steelDark, 0.26, gy - foot - 0.3, 0.26, xo, (foot + head) / 2, z + dz);
    }
    for (let i = 0; i < 11; i++) {
      const zz = z - 6.4 + (i * 12.8) / 10;
      box(g, M.steel, 0.2, 1.1, 1.4, x + sgn * 4.2, gy + 0.55, zz);
    }
    box(g, M.steel, 1.4, 1.1, 0.2, x + sgn * 3.6, gy + 0.55, z);
    // The two guns, the ammunition hoist between them, and the ready lockers.
    fiveInch(g, g, x + sgn * 1.2, gy + 0.15, z + 3.4, sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
    fiveInch(g, g, x + sgn * 1.2, gy + 0.15, z - 3.4, sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
    box(g, M.steelDark, 1.5, 1.35, 2.1, x + sgn * 3.1, gy + 0.85, z);
    box(g, M.steelDark, 1.1, 1.9, 1.5, x - sgn * 1.6, gy + 1.1, z);
  }

  // Eight quad Bofors in their tubs: two right forward on the bow gallery
  // where a Yorktown was blindest and where they were the first thing added,
  // two behind them, two abaft the island on the starboard deck edge, and two
  // right aft.
  const forty = [];
  for (const [sgn, z] of FORTY_AT) {
    const x = sgn * Math.min(fdHalf(z) + 1.1, sideHalf(z) + 1.4);
    forty.push([sgn, z, x]);
    box(g, M.steelDark, 6.6, 0.3, 6.6, x, gy + 0.55, z);
    for (const dz of [-2.2, 2.2]) {
      const br = box(g, M.steelDark, 3.4, 0.22, 0.22, x - sgn * 1.5, gy - 0.2, z + dz);
      br.rotation.z = sgn * 0.5;
    }
    bofors(g, x, gy + 0.7, z, z > 0 ? 0 : Math.PI);
    for (const dz of [-2.4, 2.4]) {
      box(g, M.steelDark, 1.0, 0.95, 1.3, x - sgn * 2.8, gy + 1.05, z + dz);
    }
  }

  // Four Oerlikon positions in the island's own galleries, and the rest down
  // both catwalks wherever the sponsons and the forty-millimetre tubs leave
  // room. The two sides do not match, and on a Yorktown they did not: the
  // island takes the room out of the starboard catwalk.
  const isleX = S * 19.3;
  for (const z of [ISL_Z + 6.4, ISL_Z + 10.2, ISL_Z - 10.1, ISL_Z - 3.7]) {
    oerlikon(g, isleX, GALLERY + 0.15, z, S * 1.45);
    mate(g, isleX, GALLERY + 0.15, z + 2.0, S * 1.45);
  }

  const CAT_Y = FD - 1.80;
  const taken = (sgn, z, d) => SPONSON_AT.some(([ss, sz]) => ss === sgn && Math.abs(sz - z) < d)
    || forty.some(([ss, sz]) => ss === sgn && Math.abs(sz - z) < d);
  for (const sgn of [-1, 1]) {
    // Starboard carries one fewer, because the island's sponson is in the way
    // of the middle of her catwalk.
    const zs = sgn === S
      ? [-112, -91, -79, -46, -30, 20, 36, 53, 69]
      : [-96, -63, -46, -30, -13, 3, 20, 36, 53, 86];
    for (const z of zs) {
      if (taken(sgn, z, 7)) continue;
      const x = sgn * (sideHalf(z) + 1.45);
      oerlikon(g, x, CAT_Y, z, sgn > 0 ? 1.5 : -1.5);
      const x2 = sgn * (sideHalf(z + 2.4) + 1.45);
      mate(g, x2, CAT_Y, z + 2.4, sgn > 0 ? 1.5 : -1.5);
    }
  }
}

// -------------------------------------------------------- boats and cranes --

function boatsAndCranes(g) {
  // The aircraft crane on the starboard side abaft the island: a boom on a
  // king post, which is how a wrecked aeroplane, a boat or a lighter's load
  // came over the side. It stands on the gallery deck, not on the planking --
  // nothing stands on a flight deck.
  const kz = -32.0;
  const kx = S * (sideHalf(kz) - 0.9);
  box(g, M.steelDark, 3.4, 0.3, 4.6, kx, GALLERY, kz);
  cyl(g, M.steel, 0.46, 0.56, 7.4, kx, GALLERY + 3.7, kz, 10);
  box(g, M.steelDark, 2.6, 1.5, 2.6, kx, GALLERY + 0.75, kz);
  const boom = cyl(g, M.steel, 0.26, 0.38, 13.5, kx - S * 4.2, GALLERY + 6.6, kz + 1.0, 10);
  boom.rotation.z = S * 1.02;
  boom.rotation.y = -S * 0.24;
  // The fall hangs straight down off the boom head with the hook block on it.
  const fx = kx - S * 8.0;
  box(g, M.wire, 0.055, 6.4, 0.055, fx, GALLERY + 5.2, kz + 2.2);
  box(g, M.steelDark, 0.55, 0.75, 0.55, fx, GALLERY + 1.6, kz + 2.2);
  cyl(g, M.steelDark, 0.38, 0.38, 0.22, fx, GALLERY + 2.1, kz + 2.2, 10)
    .rotation.z = Math.PI / 2;

  // Her boats live in the hangar, on their chocks, and go over the side on
  // that crane: two thirty-five foot motor launches and a motor whaleboat.
  for (const [bz, bx] of [[-91, -7.6], [-91, 7.6], [-83, 0]]) {
    if (overWell(bz)) continue;
    const hull = box(g, M.bright, 2.3, 1.35, 9.0, bx, HANGAR + 1.15, bz);
    hull.rotation.z = 0.04;
    box(g, M.steelDark, 1.9, 0.22, 8.4, bx, HANGAR + 1.62, bz);
    box(g, M.canvas, 1.8, 0.8, 3.0, bx, HANGAR + 2.05, bz - 2.0);
    for (const dz of [-3.2, 3.2]) {
      box(g, M.hangarSteel, 2.6, 0.55, 0.6, bx, HANGAR + 0.4, bz + dz);
    }
  }
}
// ------------------------------------------------------------ the lifts --

/**
 * The three lift platforms, which are the only moving thing on her but the guns.
 *
 * Each is its own group so the welder leaves it alone, and each carries what it
 * is bringing up: an aircraft comes off the hangar deck, rides up the well and
 * is on the flight deck a few seconds later. That is the whole point of the
 * ship, and until now the elevators were three painted rectangles.
 *
 * @returns {Array<{group: THREE.Group, phase: number}>}
 */
function elevators(g) {
  const lifts = [];
  const zs = liftZs();
  zs.forEach((z, i) => {
    const lift = new THREE.Group();
    lift.position.set(0, FD, z);
    lift.userData.dynamic = true;
    g.add(lift);
    // The platform: a plated deck with its own planking over the steel.
    box(lift, M.hullDark, 2 * LIFT_HW - 0.3, 0.5, 2 * LIFT_HW - 0.3, 0, -0.42, 0);
    for (let k = 0; k < 14; k++) {
      const w = (2 * LIFT_HW - 0.5) / 14;
      box(lift, k % 3 === 1 ? M.deckDark : M.deck, w - 0.05, 0.28, 2 * LIFT_HW - 0.5,
        -LIFT_HW + 0.25 + w * (k + 0.5), -0.15, 0);
    }
    // Its edge coaming, and the guide shoes that ride the rails in the trunk.
    for (const s of [-1, 1]) {
      box(lift, M.steelDark, 0.2, 0.35, 2 * LIFT_HW - 0.3, s * (LIFT_HW - 0.2), -0.02, 0);
      box(lift, M.steelDark, 2 * LIFT_HW - 0.3, 0.35, 0.2, 0, -0.02, s * (LIFT_HW - 0.2));
      for (const dz of [-LIFT_HW + 1.2, LIFT_HW - 1.2]) {
        box(lift, M.steel, 0.4, 0.6, 0.5, s * (LIFT_HW - 0.35), -0.45, dz);
      }
    }
    // The forward and midships lifts run empty. A lift at the top is part of
    // the flight deck, so an aeroplane parked on one is an aeroplane on the
    // runway -- and there is never anything on the runway but the one going
    // off it. The ready aircraft is on the after lift, and it is not built
    // into the lift: it lives on the ship and rides it, so it can get off.
    mergeStatic(lift);
    lifts.push({ group: lift, phase: i / zs.length });
  });
  return lifts;
}

/** The aircraft that flies when she launches, and where it waits. */
function deckAircraft(g) {
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  g.add(plane);
  const body = avenger(plane, 0, 0, 0, 0, true, true);
  return {
    group: plane,
    prop: body.userData.prop || null,
    wings: body.userData.wings || null,
    gear: body.userData.gear || null,
  };
}

const LIFT_DROP = FD - HANGAR - 0.55;

// The launch, phase by phase. Everything before the flag is deck handling and
// is timed; the run itself is flown and takes as long as the aeroplane takes.
const DOWN = 1.2;       // the lift on its way to the hangar
const UP = 3.6;         // and back to the flight deck, wings going out on the way
const TAXIED = 8.6;     // taxied aft off the lift to the spot and lined up
const ROLL = 10.0;      // run up against the brakes, and the flag
// And coming home the other way: she picks up a wire at the round-down, rolls
// up the deck to the after lift, and the lift takes her below.
const LAND_ROLL = 3.0;  // up the deck from the round-down onto the lift
const LAND_SINK = 3.4;  // and down the well into the hangar
/** Where she picks up a wire: a little way up the deck from the round-down. */
function landZ() { return fdEndA(0) + 14; }

/**
 * Her deck cycle: the lifts working, and the launch when one is called for.
 *
 * Idle, each lift runs its own slow round -- at the flight deck, down the well,
 * on the hangar deck, back up -- staggered so the three are never doing the
 * same thing at once, and the after lift has the ready aircraft standing on it.
 *
 * A launch is the whole evolution, because that is what it looks like from the
 * bridge and it is the reason the ship exists: the after lift takes her down to
 * the hangar deck, brings her up, she taxis aft to the spot, runs up against
 * the brakes, and goes down the deck and off over the bow. Twelve seconds, and
 * the aeroplane the simulation then flies is the one you watched leave.
 */
/**
 * Put her below, on the after lift, in the hangar.
 *
 * The resting place for the deck model whenever there is no evolution to draw
 * her in. It is inside the ship, so nothing shows even if something turns her
 * visible again, and it is where the next launch expects to find her.
 */
function below(deck, p, aft) {
  // Only if she is still ours. While somebody else is flying her the model is
  // parented to the world, and ship coordinates put into world space are a
  // long way from the ship and generally under the sea.
  if (deck.owner && p.parent !== deck.owner) return;
  p.position.set(0, FD - LIFT_DROP + 0.34, aft.group.position.z - 0.45);
  p.rotation.set(0, 0.08, 0);
}

export function stepDeck(deck, t) {
  if (!deck) return;
  const { lifts, plane } = deck;
  const aft = lifts[lifts.length - 1];
  // How long each part of the evolution takes. Everything up to the flag is a
  // handling job and is timed; everything after it is flown, and takes as long
  // as the aeroplane takes.
  const LAUNCH = ROLL + (deck.profile ? deck.profile.rows.length * deck.profile.dt : 12);
  // Played so that she leaves the deck exactly when the simulation puts her
  // squadron in the air. Left to run at its own length the evolution took four
  // seconds longer, and for those four seconds the squadron was already up:
  // three markers flying off the bow while the aeroplane you were watching was
  // still on the planking, which is the aircraft that appeared out of nothing.
  const pace = LAUNCH / DECK_RUN;
  const run = deck.launchAt === null ? -1 : (t - deck.launchAt) * pace;

  // Ranging for a launch: the deck is made flush before anything goes down it.
  //
  // A lift down the well is a hole in the flight deck the width of the deck,
  // and an aeroplane taking off across one is an aeroplane in the hangar. So
  // the whole time an evolution is on, every lift is at the flight deck --
  // brought up as the flag goes up rather than snapped there, because a
  // fifteen-ton platform does not teleport. When the evolution is over they
  // pick their own cycle up again, and go back down just as smoothly.
  const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
  deck.lastT = t;
  const ranging = run >= 0 && run < LAUNCH + 2;
  const FLUSH = 1.4;                             // seconds to come up and level
  deck.flush = Math.max(0, Math.min(1,
    (deck.flush ?? 0) + (ranging ? dt / FLUSH : -dt / FLUSH)));

  // The lifts, idling.
  const PERIOD = 34;
  const working = (run >= 0 && run < LAUNCH) || deck.landAt != null;
  for (const l of lifts) {
    if (l === aft && working) continue;
    let u = ((t / PERIOD) + l.phase) % 1;
    if (u < 0) u += 1;
    let k = 0;                                   // 0 at the flight deck, 1 below
    if (u < 0.36) k = 0;
    else if (u < 0.48) k = (u - 0.36) / 0.12;
    else if (u < 0.86) k = 1;
    else k = 1 - (u - 0.86) / 0.14;
    const idle = FD - LIFT_DROP * ease(k);
    l.group.position.y = idle + (FD - idle) * ease(deck.flush);
  }

  if (!plane) return;
  const p = plane.group;
  // The model belongs to the ship, and everything below positions her in the
  // ship's own frame. While she is flying she is parented to the world
  // instead: run the evolution on her then and she is put at ship coordinates
  // in world space, which is to say a long way from the ship and generally
  // under the sea. That is the take-off where no aeroplane appears -- order a
  // second squadron up while the first is still out and the deck went through
  // the whole evolution with nothing on it. Whoever took her has to give her
  // back before the deck can be used again.
  if (deck.owner && p.parent !== deck.owner) return;
  const AFT_Z = aft.group.position.z;
  // Wings spread or stowed. Folded she is struck below and rides the lift;
  // spread she is ready to go, and she cannot fly any other way.
  const wings = (out) => {
    if (!plane.wings) return;
    plane.wings.spread.visible = out;
    plane.wings.stowed.visible = !out;
  };
  const gear = (u) => { if (plane.gear) plane.gear(u); };

  // She is away, and her flight is being drawn out where the deck run left
  // her. The model on the deck is not a second aeroplane: it is put out of
  // sight until the lift brings the next one up.
  //
  // It used to be left exactly where the run ended, which is a hundred and
  // fifty metres off the bow and forty metres up -- an aeroplane that took off
  // and then stopped, hanging in the air, for the rest of the sortie.
  // Struck below the moment she is away, and struck below she stays. Hiding
  // her was not enough on its own: she was hidden where the deck run left her,
  // which is a hundred and fifty metres off the bow and forty metres up, and
  // anything that showed her again -- the next evolution starting on the same
  // tick, a recovery, a spectator switching ships -- showed her there. That is
  // the aeroplane hanging over the runway. She goes to the lift, in the
  // hangar, which is where a carrier's aircraft are when they are not on deck.
  if (deck.airborne) { p.visible = false; below(deck, p, aft); return; }
  if (run >= LAUNCH) {
    // The evolution is over, so she went -- and she has to be handed over
    // whether or not a frame happened to land in the last tenth of a second of
    // the deck run. At five frames a second it would not, and she would snap
    // back to the lift with the squadron she is flying still in the air.
    deck.airborne = true;
    aft.group.position.y = FD;
    wings(true);
    gear(1);
    p.visible = false;
    // Where the deck run left her is published on the deck as `endPose`, off
    // the profile, for anything that wants to take her over. The model itself
    // goes below: it is not the aeroplane that is flying, and a model left at
    // the end of the run is a model standing in the air.
    below(deck, p, aft);
    return;
  }
  const LIFT_Z0 = AFT_Z - 0.45;
  if (run < 0) {
    // Not launching. Either she is being recovered -- rolling up the deck from
    // the round-down and riding the lift down -- or she is already below in the
    // hangar, waiting for the next time the flag goes up.
    //
    // She used to stand on the after lift on the flight deck between sorties,
    // riding its idle cycle up and down in plain view. An aircraft carrier
    // does not park her aircraft on the lift: she strikes them below, which is
    // what the lift is for, and it is why the launch begins with the lift
    // going down to fetch one.
    if (deck.landAt != null) {
      const r = t - deck.landAt;
      gear(0);
      p.visible = true;
      if (r < LAND_ROLL) {
        // Up the deck under her own power, slowing, wings folding as she goes.
        const k = ease(r / LAND_ROLL);
        wings(r < LAND_ROLL * 0.55);
        aft.group.position.y = FD;
        const LAND_Z = landZ();
        p.position.set(0, FD + 0.34, LAND_Z + (LIFT_Z0 - LAND_Z) * k);
        p.rotation.set(0, 0.08 * k, 0);
        if (plane.prop) plane.prop.rotation.z += (1 - k) * 0.6;
        return;
      }
      if (r < LAND_ROLL + LAND_SINK) {
        // Down the well with her, and she is below.
        const k = ease((r - LAND_ROLL) / LAND_SINK);
        wings(false);
        const ly = FD - LIFT_DROP * k;
        aft.group.position.y = ly;
        p.position.set(0, ly + 0.34, LIFT_Z0);
        p.rotation.set(0, 0.08, 0);
        if (plane.prop) plane.prop.rotation.z = 0;
        return;
      }
      deck.landAt = null;
      deck.stowed = true;
    }
    wings(false);
    gear(0);
    p.visible = true;
    p.position.set(0,
      (deck.stowed ? FD - LIFT_DROP : aft.group.position.y) + 0.34, LIFT_Z0);
    p.rotation.set(0, 0.08, 0);
    if (plane.prop) plane.prop.rotation.z = 0;
    return;
  }

  // Where she starts her run: off the lift and aft to the round-down, which is
  // the after end of the flight deck and where a deck launch begins. She used
  // to line up twenty metres forward of the after lift and take off over the
  // middle of the ship, using a fifth of the deck: that is a catapult shot
  // without the catapult. She is ranged right aft now and has the whole of it,
  // which is what all that planking is for.
  const LIFT_Z = AFT_Z - 0.45;
  const SPOT = deck.spot ?? LIFT_Z;
  let y = FD;
  let z = LIFT_Z;
  let pitch = 0;
  let yaw = 0.08;
  let turning = 0;                      // how fast the propeller is going round

  if (run < DOWN) {
    // The lift down the well. She rides it if she is on it; if she is already
    // struck below -- which she is between sorties -- it is coming down to
    // fetch her and she stands on the hangar deck until it arrives.
    wings(false);
    gear(0);
    const k = ease(run / DOWN);
    const ly = deck.startY + (FD - LIFT_DROP - deck.startY) * k;
    aft.group.position.y = ly;
    y = deck.stowed ? FD - LIFT_DROP : ly;
  } else if (run < UP) {
    // And back up, which is the lift doing the job it is there for. Her wings
    // go out on the way, once she is clear of the hangar overhead.
    const k = ease((run - DOWN) / (UP - DOWN));
    y = (FD - LIFT_DROP) + LIFT_DROP * k;
    aft.group.position.y = y;
    turning = k * 8;
    wings(run > UP - 0.9);
    deck.stowed = false;                 // she is on the platform now
  } else if (run < TAXIED) {
    // Taxiing: aft off the lift under her own power, swinging onto the
    // centreline as she goes. Seventeen knots, which is a deck being ranged
    // in a hurry, because that is what a strike going off is.
    const k = ease((run - UP) / (TAXIED - UP));
    aft.group.position.y = FD;
    wings(true);
    gear(0);
    z = LIFT_Z + (SPOT - LIFT_Z) * k;
    yaw = 0.08 * (1 - k);
    turning = 11;
    // She rocks a little on her oleos as she rolls.
    pitch = 0.006 * Math.sin(run * 9);
  } else if (run < ROLL) {
    // Held on the brakes with the engine wound right up, waiting for the flag.
    aft.group.position.y = FD;
    z = SPOT;
    yaw = 0;
    turning = 30;
    pitch = -0.012 * Math.sin((run - TAXIED) * 22);
  } else {
    // The deck run, flown rather than drawn: thrust against drag and rolling
    // friction, the wing taking her weight as the speed builds, and the wheels
    // leaving the planking when it finally does. Read out of the profile the
    // physics was integrated into, so the evolution is the same every time and
    // the same on every screen.
    aft.group.position.y = FD;
    wings(true);
    const pr = deck.profile;
    const i = Math.min(pr.rows.length - 1, Math.max(0, Math.round((run - ROLL) / pr.dt)));
    const [s2, h, th, up] = pr.rows[i];
    z = SPOT + s2;
    y = FD + h;
    // Nose up, which is what a climb is. It was negated here, so an aeroplane
    // coming off the round-down was drawn nose down all the way up the deck --
    // and the formation that took her over a moment later was drawn nose up,
    // which is a seventeen-degree flick at the hand-over.
    pitch = th;
    yaw = 0;
    turning = 34;
    gear(up ? Math.min(1, (h - 3) / 14) : 0);
    // Once she is well clear of the bow -- and once the simulation has actually
    // put her squadron up -- she belongs to whatever is flying her.
    if (z > fdEndF(0) + 40 && run >= LAUNCH) deck.airborne = true;
  }

  p.visible = true;
  p.position.set(0, y + 0.34, z);
  p.rotation.set(pitch, yaw, 0);
  if (plane.prop) plane.prop.rotation.z += turning * 0.05;
}

/**
 * When each part of the evolution happens, on the clock the ship is stepped
 * with rather than on the evolution's own.
 *
 * The whole thing is played at whatever pace makes her leave the deck exactly
 * when the simulation puts her squadron up, so the wall-clock time of "wings
 * out" moves with the aeroplane's deck run. Anything that wants to know when
 * a phase happens has to ask, not count seconds of its own.
 */
export function deckPhases(deck) {
  const LAUNCH = ROLL + (deck && deck.profile ? deck.profile.rows.length * deck.profile.dt : 12);
  const k = DECK_RUN / LAUNCH;
  return { down: DOWN * k, up: UP * k, taxied: TAXIED * k, roll: ROLL * k, launch: DECK_RUN };
}

/** Kept for the tests and for anything that only wants the lifts moved. */
export function stepLifts(lifts, t) {
  stepDeck({ lifts, plane: null, launchAt: null, startY: FD, airborne: false }, t);
}

// ------------------------------------------------------------- the air group --

// Her aircraft are built in planekit.js, with the same tools every other
// aeroplane in the game is built with -- the lofted body, the wing with a real
// section on it, the radial, the greenhouse and the gear.
//
// Nothing is ranged on the flight deck. A carrier lying in her berth with a
// deck park is a carrier that cannot land an aircraft or work her lifts, and
// it is not how one is found at the start of a watch: the group is struck
// below and what is coming up is on the lifts. The deck is a runway, and a
// runway with aeroplanes parked on it is a car park.

// ------------------------------------------------------------------ build --

/** Everything she is built from, before the weld, in the order it goes on. */
function assemble(g) {
  buildHull(g);
  groundTackle(g);
  hangarSides(g);
  hangarInterior(g);
  galleryDeck(g);
  flightDeck(g);
  catwalks(g);
  island(g);
  armament(g);
  boatsAndCranes(g);
}

/**
 * Every piece she is built from, in world axis-aligned boxes, before the weld.
 *
 * Only used by the tests, which check that nothing is left hanging in the air:
 * a model this size is easy to break by moving one deck and forgetting what
 * stood on it.
 */
export function enterpriseParts() {
  AA_MOUNTS = [];
  const g = new THREE.Group();
  assemble(g);
  elevators(g);
  deckAircraft(g);
  g.updateMatrixWorld(true);
  const parts = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // Whether it rides something that moves -- a lift platform, a gun mounting.
    // Those are allowed over an open well; the deck is not.
    let moving = false;
    for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
    o.geometry.computeBoundingBox();
    const lb = o.geometry.boundingBox;
    const bb = lb.clone().applyMatrix4(o.matrixWorld);
    parts.push({
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
      // Its own size, before it was turned: a gun barrel laid at forty degrees
      // has a fat axis-aligned box and is still a stick.
      size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
      moving,
    });
  });
  return parts;
}

/**
 * The whole ship, welded down to one mesh per material.
 *
 * @returns {{group: THREE.Group, length: number, beam: number, deckY: number}}
 */
export function buildEnterprise() {
  AA_MOUNTS = [];
  const g = new THREE.Group();
  assemble(g);
  const lifts = elevators(g);
  const plane = deckAircraft(g);
  // What is under her hangar deck. A carrier is a hull with a hangar and a
  // flight deck built on top of it, and everything that makes her steam --
  // nine boilers and four sets of turbines, in her case -- is below the
  // hangar, which is what the interior builder fits into her lines. The hangar
  // itself is already modelled above it.
  //
  // The weld is split one buffer per compartment so a compartment blown out of
  // her can have its plating taken off.
  buildInterior(g, {
    loa: LOA,
    shellAt: (t, y) => F.shellAt(t, y),
    zAt: (t, y) => F.zAt(t, y),
    keelY: (t) => F.keelY(t),
    // Her "deck" for this purpose is the hangar deck, not the flight deck:
    // there is nothing below the hangar but the hull.
    sheer: () => HANGAR,
    // And nothing above it that the interior builder has any business
    // furnishing. Left to itself it reads the top of the plating it can see,
    // decides the space over it is a deckhouse and fills it with decks and
    // bulkheads -- which on a carrier is the hangar and the runway. What that
    // put on her was a mess deck laid nine centimetres above her own flight
    // deck for sixty metres of her length, and grey compartment walls standing
    // in the middle of the hangar.
    hollow: true,
  });
  mergeStatic(g, bySection(LOA));
  // And inside every part of her that moves. A mounting is welded in its own
  // frame, so it goes on training and elevating exactly as it did and costs
  // two draw calls instead of a hundred. See mergeMoving.
  mergeMoving(g);
  // Her take-off, integrated once out of her own weight and wing so it can be
  // read back the same way every time. She is ranged right aft, at the
  // round-down, with her tail wheel just inside the deck edge -- which is
  // where a deck launch starts and why the deck is as long as it is.
  const spot = fdEndA(0) + 6.5;
  const deck = {
    lifts, plane, launchAt: null, startY: FD, airborne: false, spot,
    // Which flight in the air she is, once she is off the deck.
    flightId: 0,
    // Flights whose wheels have left the planking and are waiting for a model
    // to be handed to them.
    pending: [],
    // Struck below between sorties, which is where a carrier keeps her
    // aircraft, and the reason the launch begins with the lift going down.
    stowed: true, landAt: null,
    profile: launchProfile(AERO.avenger, fdEndF(0) - spot),
  };
  // Whose frame the deck evolution is drawn in. See stepDeck.
  deck.owner = plane.group.parent;
  // Where the deck run leaves her, in the ship's own frame: the last row of
  // the profile the launch was integrated into. Whatever takes her over flies
  // her from here, and it reads this rather than looking at where the model
  // happens to be.
  {
    const end = deck.profile.rows[deck.profile.rows.length - 1];
    deck.endPose = { x: 0, y: FD + end[1] + 0.34, z: spot + end[0], pitch: end[2] };
  }
  g.userData.deck = deck;
  // Where an aeroplane coming home puts her wheels down. The approach flies to
  // this and the recovery rolls up the deck from it, so the two agree.
  g.userData.landingSpot = [0, FD + 0.34, landZ()];
  g.userData.deckPlane = plane.group;
  g.userData.step = (t) => stepDeck(deck, t);
  g.userData.launch = (t) => {
    deck.launchAt = t;
    deck.airborne = false;
    deck.landAt = null;
    deck.startY = lifts[lifts.length - 1].group.position.y;
    // The evolution starts with the lift going down to fetch her, so she has
    // to be down there when it does -- not still standing where the last one
    // finished.
    if (deck.stowed) below(deck, plane.group, lifts[lifts.length - 1]);
  };
  // She is down: wheels on the planking at the round-down, hook in a wire.
  // What follows is the recovery -- up the deck to the after lift, wings
  // folding, and the lift down into the hangar -- and stepDeck flies it.
  g.userData.recover = (t = deck.lastT ?? 0) => {
    deck.airborne = false;
    deck.launchAt = null;
    deck.landAt = t;
    deck.stowed = false;
    if (plane.gear) plane.gear(0);
  };
  // And the other way a sortie ends, which is not coming home at all: shot
  // down, or struck below out where her squadron was. There is no evolution to
  // watch, so she is simply below.
  g.userData.stow = () => {
    deck.airborne = false;
    deck.launchAt = null;
    deck.landAt = null;
    deck.stowed = true;
    below(deck, plane.group, lifts[lifts.length - 1]);
    if (plane.gear) plane.gear(0);
    if (plane.wings) {
      plane.wings.spread.visible = false;
      plane.wings.stowed.visible = true;
    }
    plane.group.rotation.set(0, 0.08, 0);
  };
  // Steel where she is plated and planking where she is decked: the maps go on
  // after the weld, when she is a handful of meshes rather than a few hundred,
  // and the weld is what gave her the coordinates to put them on.
  dressShip(g);
  return {
    group: g,
    lifts,
    deckPlane: plane.group,
    // In the order the sponsons were built, which is the order the datasheet
    // lists them: starboard forward pair, starboard after pair, then port.
    turrets: g.userData.turrets || [],
    aaMounts: AA_MOUNTS,
    length: LOA, beam: FDW, deckY: HANGAR, flightDeckY: FD,
  };
}

// The three types on their own, so they can be looked at and measured without
// a ship round them.
export const __aircraft = { wildcat, dauntless, avenger };

export { LOA, FDW, FDL, HANGAR, HTOP, GALLERY, FD, LIFT_HW, liftZs };
