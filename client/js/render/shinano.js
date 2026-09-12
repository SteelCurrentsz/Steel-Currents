// IJN Shinano, built out of her own lines.
//
// The third Yamato hull, taken off the slip half-built and finished as an
// armoured aircraft carrier: two hundred and sixty-six metres, seventy-two
// thousand tonnes, and the largest warship ever built to fly aircraft until
// the nuclear carriers. The flight deck is seventy-five millimetres of armour
// over a hundred and ninety of main deck -- she was meant to take a hit that
// would finish anybody else and go on operating -- and under it is a single
// enclosed hangar on a battleship's citadel.
//
// She was torpedoed by a submarine ten days after commissioning, on her first
// voyage, with her watertight doors untested and half her crew aboard for the
// first time. She took seven hours to sink and never flew an aircraft.
//
// Three things have to be right or she is not her.
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
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { DECK_RUN } from '../../../shared/sim.js';
import { box, cyl, tubeZ, sphere, ladder } from './shipkit.js';
import { hullForm, plateHull } from './hullform.js';
import { zero, suisei, tenzan } from './planekit.js';
import {
  typeEightNine, triple25, rocket, rangefinder, director,
  typeTwentyOne, typeThirteen, cowl, boat,
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
  deck: 0x9a9179,          // the flight deck: bare planking over the armour
  deckDark: 0x7d7461,
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
  stripeRed: 0xa33029,     // the barred round-down at the forward end
  chrys: 0x9d8140,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

// A Yamato hull: the same offsets, unchanged, because that is what she is.
const HALF_BEAM = [
  [-1.00, 2.40], [-0.96, 3.90], [-0.90, 6.40], [-0.84, 8.60], [-0.76, 11.00],
  [-0.66, 13.45], [-0.54, 15.60], [-0.40, 17.20], [-0.24, 18.05], [-0.08, 18.15],
  [0.08, 18.15], [0.22, 18.00], [0.36, 17.45], [0.48, 16.40], [0.60, 14.75],
  [0.70, 12.80], [0.79, 10.45], [0.87, 7.75], [0.93, 5.05], [0.97, 2.70],
  [1.00, 0.28],
];

const KEEL = [
  [-1.00, -2.60], [-0.94, -7.30], [-0.86, -9.50], [-0.76, -10.15], [-0.60, -10.35],
  [-0.20, -10.40], [0.24, -10.40], [0.52, -10.30], [0.70, -9.95], [0.82, -9.20],
  [0.90, -8.30], [0.95, -7.50], [0.98, -6.10], [1.00, -2.20],
];

// Her sheer is the hangar-deck edge rather than a weather deck: a carrier's
// hull is closed in right up to it, and the flight deck stands above that on
// its own supports. Flatter than Yamato's, because the flight deck takes care
// of keeping the sea out forward.
const SHEER = [
  [-1.00, 12.30], [-0.80, 12.40], [-0.56, 12.60], [-0.34, 12.85], [-0.14, 13.10],
  [0.04, 13.35], [0.22, 13.60], [0.38, 13.85], [0.52, 14.05], [0.65, 14.25],
  [0.76, 14.45], [0.85, 14.60], [0.92, 14.75], [0.97, 14.85], [1.00, 14.95],
];

const FLARE = [
  [-1.00, 0.10], [-0.70, 0.16], [-0.34, 0.24], [0.00, 0.38], [0.26, 0.66],
  [0.44, 1.05], [0.58, 1.55], [0.70, 2.05], [0.79, 2.40], [0.86, 2.45],
  [0.92, 2.15], [0.96, 1.40], [1.00, 0.28],
];

const F = hullForm({
  loa: LOA,
  half: HALF_BEAM, keel: KEEL, sheer: SHEER, flare: FLARE,
  stem: 5.0, stemLo: -10.4, stemUp: 25.4, stemPow: 1.10,
  counter: 4.2, counterLo: -2.0, counterUp: 9.0, counterPow: 1.40,
  bilge: 0.26,
  stations: 118,
});

export const { deckAt, halfDeck } = F;
/** Her lines, for the tests: the shell, the keel, the sheer and the rake. */
export const LINES = F;
const sheer = F.sheer;

/** The hangar deck, and the flight deck over it. */
const HANGAR = 13.6;
export const FD = 19.9;
/** How wide the flight deck is, and how long. */
const FDW = 20.0;          // half-breadth amidships
const FD_FWD = 122;
const FD_AFT = -128;
/** The two centreline lifts. */
const LIFT_F = 52;
const LIFT_A = -58;
const LIFT_HW = 7.4;
/** The island, on the starboard side. */
const ISL_Z = 12;
const ISL_X = S * 14.2;

// ------------------------------------------------------------------ hull --

function hull(g) {
  plateHull(g, F, M, { bootLo: -3.4, bootHi: 0.9 });
  // The bulbous forefoot, which she has because Yamato had it.
  const bz = F.zAt(1, -8.1);
  sphere(g, M.antifoul, 3.2, 0, -8.0, bz + 1.2, 14).scale.set(0.72, 0.82, 2.1);
  // And her bulges amidships.
  for (const sgn of [-1, 1]) {
    for (let t = -0.62; t <= 0.5; t += 0.08) {
      const y = -6.2;
      const w = F.shellAt(t, y);
      box(g, M.antifoul, 0.5, 2.6, 11, sgn * (w - 0.1), y, F.zAt(t, y));
    }
  }
}

/**
 * The flight deck: one armoured slab from the round-up forward to the
 * round-down aft, with the deck edge carried on the hull under it.
 *
 * Its half-breadth follows her own: full width over the middle two-thirds and
 * drawing in at both ends, so it reads as a deck laid on a ship rather than a
 * rectangle floating over one. Both ends curve down, which every Japanese
 * carrier of this generation has.
 */
function fdHalf(z) {
  const t = z / FD_FWD;
  if (z > 0) {
    const k = Math.max(0, (z - 70) / (FD_FWD - 70));
    return FDW * (1 - 0.52 * k * k);
  }
  const k = Math.max(0, (-z - 84) / (-FD_AFT - 84));
  return FDW * (1 - 0.42 * k * k);
}

/** And how far down the round-down has taken it there. */
function fdDrop(z) {
  if (z > FD_FWD - 14) return Math.pow((z - (FD_FWD - 14)) / 14, 2) * 2.6;
  if (z < FD_AFT + 16) return Math.pow((FD_AFT + 16 - z) / 16, 2) * 3.2;
  return 0;
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
  const plate = (z0, z1) => {
    const N = 16;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const t = (z0 + ((z1 - z0) * i) / N) / (LOA / 2);
      const y = sheer(t);
      const w = F.shellAt(t, y);
      pos.push(-w, y, F.zAt(t, y), w, y, F.zAt(t, y));
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
    g.add(new THREE.Mesh(geo, M.deckSteel));
  };
  plate(FD_FWD - 30, 0.995 * LOA / 2);
  plate(-0.995 * LOA / 2, FD_AFT + 26);
  // And the breakwater across the forecastle, which every Japanese ship has.
  const bw = FD_FWD - 14;
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.26;
    box(g, M.steel, 4.0, 1.4, 0.22, Math.sin(a) * 7.0, sheer(bw / (LOA / 2)) + 0.7,
      bw + Math.cos(a) * 1.6).rotation.y = a;
  }
}

function flightDeck(g) {
  const N = 96;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const z = FD_AFT + ((FD_FWD - FD_AFT) * i) / N;
    const w = fdHalf(z);
    const y = FD - fdDrop(z);
    pos.push(-w, y, z, w, y, z);
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
  const deck = new THREE.Mesh(geo, M.deck);
  deck.userData.flightDeck = true;
  g.add(deck);

  // The underside of it, and the deck-edge girder, so she is not a sheet of
  // paper seen from below: a carrier's flight deck is a metre and a half of
  // structure and you can see it from any boat alongside.
  const under = [];
  const uidx = [];
  for (let i = 0; i <= N; i++) {
    const z = FD_AFT + ((FD_FWD - FD_AFT) * i) / N;
    const w = fdHalf(z);
    const y = FD - fdDrop(z) - 1.6;
    under.push(-w, y, z, w, y, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    uidx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const ug = new THREE.BufferGeometry();
  ug.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
  ug.setIndex(uidx);
  ug.computeVertexNormals();
  g.add(new THREE.Mesh(ug, M.hullDark));
  // The girder closing the two together down both edges.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const z0 = FD_AFT + ((FD_FWD - FD_AFT) * i) / N;
      const z1 = FD_AFT + ((FD_FWD - FD_AFT) * (i + 1)) / N;
      const w = (fdHalf(z0) + fdHalf(z1)) / 2;
      const y = FD - (fdDrop(z0) + fdDrop(z1)) / 2 - 0.8;
      box(g, M.hullDark, 0.3, 1.7, z1 - z0 + 0.05, sgn * w, y, (z0 + z1) / 2);
    }
  }
  // And the pillars that carry it, standing on the hangar deck.
  for (let z = FD_AFT + 14; z < FD_FWD - 12; z += 14) {
    for (const sgn of [-1, 1]) {
      const w = Math.min(fdHalf(z) - 1.2, halfDeck(z) - 0.8);
      cyl(g, M.steelDark, 0.4, 0.4, FD - 1.6 - sheer(z / (LOA / 2)),
        sgn * w, (FD - 1.6 + sheer(z / (LOA / 2))) / 2, z, 8);
    }
  }

  // The deck markings: the centreline, the landing area, and the two lift
  // outlines. Laid a hair proud of the planking so they draw over it.
  const y0 = (z) => FD - fdDrop(z) + 0.05;
  for (let z = FD_AFT + 20; z < FD_FWD - 16; z += 6) {
    box(g, M.stripe, 0.55, 0.06, 3.4, 0, y0(z), z);
  }
  // The two long lines down either side, inboard of the deck edge: what a
  // pilot lines up on and what keeps a wheel off the girder in a crosswind.
  for (let z = FD_AFT + 16; z < FD_FWD - 14; z += 5) {
    for (const sgn of [-1, 1]) {
      const w = (fdHalf(z) + fdHalf(z + 5)) / 2 - 2.4;
      box(g, M.stripe, 0.35, 0.06, 5.1, sgn * w, y0(z) + 0.005, z + 2.5);
    }
  }

  // The landing area, marked out aft: a long box a pilot sets her down inside,
  // with the aiming bar across the near end of it.
  const la0 = FD_AFT + 18;
  const la1 = FD_AFT + 96;
  for (const sgn of [-1, 1]) {
    for (let z = la0; z < la1; z += 6) {
      const w = Math.min(fdHalf(z), fdHalf(z + 6)) - 6.2;
      box(g, M.stripe, 0.5, 0.06, 6.1, sgn * w, y0(z) + 0.01, z + 3);
    }
  }
  for (const z of [la0, la1]) {
    box(g, M.stripe, (fdHalf(z) - 6.2) * 2, 0.06, 0.5, 0, y0(z) + 0.01, z);
  }

  // The round-down at the forward end, barred red and white across its whole
  // width. It is the one piece of colour on a Japanese flight deck and it is
  // there for the same reason a kerb is painted: the deck stops falling away
  // under you here, and at a hundred knots you want to have seen it coming.
  const rd0 = FD_FWD - 20;
  for (let i = 0; i < 14; i++) {
    const z = rd0 + (i * 20) / 14;
    const w = fdHalf(z + 0.7);
    box(g, i % 2 ? M.stripeRed : M.stripe, w * 2, 0.06, 20 / 14 + 0.04, 0, y0(z) + 0.01, z + 0.7);
  }
  // And the bar across the after round-down, which is plain white.
  for (const z of [FD_AFT + 12]) {
    box(g, M.stripe, fdHalf(z) * 1.8, 0.06, 1.0, 0, y0(z), z);
  }
  // Arrestor wires across the after third, and the crash barrier.
  for (let i = 0; i < 9; i++) {
    const z = FD_AFT + 26 + i * 7;
    box(g, M.steelDark, fdHalf(z) * 1.7, 0.1, 0.12, 0, y0(z) + 0.08, z);
  }
  for (const z of [-10, -4]) {
    for (const h of [0.5, 1.1, 1.7]) {
      box(g, M.steelDark, fdHalf(z) * 1.7, 0.08, 0.08, 0, y0(z) + h, z);
    }
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.12, 0.14, 1.9, sgn * fdHalf(z) * 0.85, y0(z) + 0.95, z, 8);
    }
  }
}

/**
 * The hangar: one enclosed deck under the flight deck, with the sides plated
 * in, the lift wells cut through it and the aircraft ranged along it.
 *
 * Japanese practice is a closed hangar, which is why her sides are plating
 * rather than the open roller-shutter galleries an American carrier has -- and
 * why a bomb that got in among her aircraft had nowhere to vent.
 */
function hangar(g) {
  const z0 = FD_AFT + 22;
  const z1 = FD_FWD - 26;
  // The hangar deck itself.
  const N = 40;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const z = z0 + ((z1 - z0) * i) / N;
    const w = Math.max(0.5, Math.min(fdHalf(z) - 1.6, halfDeck(z) - 0.6));
    pos.push(-w, HANGAR, z, w, HANGAR, z);
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
  const deck = new THREE.Mesh(geo, M.deckSteel);
  deck.userData.inside = true;
  g.add(deck);

  // The hangar sides: plating from the hangar deck up to the flight deck,
  // inboard of the deck edge, with the fire curtains across it.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      const w = Math.min(fdHalf((za + zb) / 2) - 1.6, halfDeck((za + zb) / 2) - 0.6);
      box(g, M.hull, 0.3, FD - 1.6 - HANGAR, zb - za + 0.05,
        sgn * w, (FD - 1.6 + HANGAR) / 2, (za + zb) / 2);
    }
  }
  // The ends of it, which are what makes it a closed hangar.
  for (const [z, facing] of [[z0, -1], [z1, 1]]) {
    const w = Math.min(fdHalf(z) - 1.6, halfDeck(z) - 0.6);
    box(g, M.hull, w * 2, FD - 1.6 - HANGAR, 0.3, 0, (FD - 1.6 + HANGAR) / 2, z);
  }
  // Three rolling fire curtains across her, which is what a closed hangar has
  // instead of the open sides.
  for (const z of [78, 20, -36, -92]) {
    if (z > z1 || z < z0) continue;
    const w = Math.min(fdHalf(z) - 1.8, halfDeck(z) - 0.8);
    box(g, M.steelDark, w * 2, 0.5, 0.25, 0, FD - 2.0, z).userData.inside = true;
  }
}

/**
 * Her air group, ranged along the hangar with their wings folded.
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
  const z0 = FD_AFT + 26;
  const z1 = FD_FWD - 30;
  const park = [
    [-8.0, 92], [8.0, 92], [-8.0, 74], [8.0, 74],
    [-8.6, 40], [8.6, 40], [-8.6, 24], [8.6, 24],
    [-8.6, -8], [8.6, -8], [-8.6, -24], [8.6, -24],
    [-8.0, -74], [8.0, -74], [-8.0, -92], [8.0, -92],
  ];
  park.forEach(([x, z], i) => {
    if (z > z1 || z < z0) return;
    // Wings folded, because that is how an aircraft is struck below: spread,
    // a Tenzan is fifteen metres across and two of them abreast are wider than
    // the ship they are inside.
    const a = i % 3 === 0
      ? tenzan(g, x, HANGAR + 1.5, z, x < 0 ? 0.12 : -0.12, true, false, {})
      : i % 3 === 1
        ? suisei(g, x, HANGAR + 1.5, z, x < 0 ? 0.12 : -0.12, true, {})
        : zero(g, x, HANGAR + 1.5, z, x < 0 ? 0.12 : -0.12, true, {});
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
  const ranged = [
    [-6.2, -104, 'zero'], [6.6, -96, 'zero'], [-6.8, -86, 'zero'],
    [6.4, -78, 'suisei'], [-7.0, -68, 'suisei'], [6.8, -58, 'suisei'],
    [-7.2, -46, 'tenzan'], [7.0, -34, 'tenzan'],
  ];
  for (const [x, z, kind] of ranged) {
    const y = FD - fdDrop(z) + 0.12;
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
    for (const sgn of [-1, 1]) {
      // The coaming round the opening, and the rails down the trunk.
      box(g, M.steelDark, 0.4, 0.5, LIFT_HW * 2 + 0.8,
        sgn * (LIFT_HW + 0.2), FD + 0.2, z);
      box(g, M.steelDark, LIFT_HW * 2 + 0.8, 0.5, 0.4,
        0, FD + 0.2, z + sgn * (LIFT_HW + 0.2));
      for (const dz of [-LIFT_HW + 1.0, LIFT_HW - 1.0]) {
        box(g, M.steelDark, 0.3, FD - HANGAR, 0.3,
          sgn * (LIFT_HW + 0.1), (FD + HANGAR) / 2, z + dz);
      }
    }
  }
}

/**
 * The two lifts, which are the only things on her that move but the guns.
 *
 * Each is its own group so the welder leaves it alone, and each is a plated
 * platform with its own planking, its coaming and the guide shoes that ride
 * the rails in the trunk.
 */
function elevators(g) {
  const lifts = [];
  [LIFT_F, LIFT_A].forEach((z, i) => {
    const lift = new THREE.Group();
    lift.position.set(0, FD, z);
    lift.userData.dynamic = true;
    g.add(lift);
    box(lift, M.hullDark, 2 * LIFT_HW - 0.3, 0.5, 2 * LIFT_HW - 0.3, 0, -0.42, 0);
    for (let k = 0; k < 12; k++) {
      const w = (2 * LIFT_HW - 0.5) / 12;
      box(lift, k % 3 === 1 ? M.deckDark : M.deck, w - 0.05, 0.3,
        2 * LIFT_HW - 0.5, -LIFT_HW + 0.25 + w * (k + 0.5), -0.15, 0);
    }
    for (const s of [-1, 1]) {
      box(lift, M.steelDark, 0.2, 0.35, 2 * LIFT_HW - 0.3, s * (LIFT_HW - 0.2), -0.02, 0);
      box(lift, M.steelDark, 2 * LIFT_HW - 0.3, 0.35, 0.2, 0, -0.02, s * (LIFT_HW - 0.2));
      for (const dz of [-LIFT_HW + 1.1, LIFT_HW - 1.1]) {
        box(lift, M.steel, 0.4, 0.6, 0.5, s * (LIFT_HW - 0.35), -0.45, dz);
      }
    }
    mergeStatic(lift);
    lifts.push({ group: lift, phase: i / 2 });
  });
  return lifts;
}

/**
 * The island, and the funnel that is part of it.
 *
 * Small, as a Japanese island is, and standing on the starboard deck edge: the
 * bridge levels forward, the funnel immediately abaft them canted twenty-six
 * degrees outboard so the smoke clears the deck, and the mast on top of that.
 */
function island(g) {
  const x = ISL_X;
  const z = ISL_Z;
  const lv = (y, hw, back, front, h, taper = 0.95) => {
    const rows = [[z - back, hw], [z + front, hw]];
    const pos = [];
    const idx = [];
    for (const [dz, w] of rows) {
      pos.push(x - w, y, dz, x + w, y, dz,
        x - w * taper, y + h, dz, x + w * taper, y + h, dz);
    }
    idx.push(0, 6, 2, 0, 4, 6, 1, 7, 5, 1, 3, 7, 2, 7, 3, 2, 6, 7, 0, 5, 4, 0, 1, 5);
    idx.push(0, 3, 1, 0, 2, 3, 4, 5, 7, 4, 7, 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.steel));
  };
  const win = (y, hw, back, front, n) => {
    for (let i = 0; i < n; i++) {
      const dz = z - back + ((back + front) * (i + 0.5)) / n;
      for (const sgn of [-1, 1]) {
        box(g, M.glass, 0.1, 0.8, 1.1, x + sgn * hw, y, dz);
      }
    }
    for (let i = 0; i < 4; i++) {
      box(g, M.glass, 1.0, 0.8, 0.1, x + (i - 1.5) * 1.5, y, z + front);
    }
  };

  const I1 = FD;
  lv(I1, 3.6, 10, 9, 3.4);
  win(I1 + 2.1, 3.7, 8, 8, 5);
  const I2 = I1 + 3.4;
  lv(I2, 3.2, 9, 8, 3.2);
  win(I2 + 2.0, 3.3, 7, 7, 4);
  // The compass platform, with its wings out over the deck edge.
  const I3 = I2 + 3.2;
  lv(I3, 2.8, 7.5, 7, 3.0);
  win(I3 + 1.9, 2.9, 6, 6, 4);
  for (const dz of [z + 5, z - 5]) {
    box(g, M.steel, 5.6, 0.2, 2.4, x, I3 + 3.0, dz);
    for (const h of [0.4, 0.78, 1.16]) {
      box(g, M.steelDark, 5.6, 0.06, 0.06, x, I3 + 3.0 + h, dz + 1.1);
    }
  }
  // The air defence platform and the directors on it.
  const I4 = I3 + 3.0;
  box(g, M.steel, 6.4, 0.2, 13, x, I4, z);
  for (const h of [0.4, 0.78, 1.16]) {
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.06, 0.06, 13, x + sgn * 3.2, I4 + h, z);
    }
    box(g, M.steelDark, 6.4, 0.06, 0.06, x, I4 + h, z + 6.5);
    box(g, M.steelDark, 6.4, 0.06, 0.06, x, I4 + h, z - 6.5);
  }
  for (const dz of [5, -5]) {
    const d = director(g, M, x, I4, z + dz, 1.3, 1.7);
    rangefinder(d, M, 0, 2.1, 0, 4.5);
  }
  // The main air-search set on its own tower abaft the bridge.
  const I5 = I4 + 2.6;
  cyl(g, M.steel, 1.6, 1.7, 3.6, x, I5 + 1.8, z - 2, 14);
  const top = director(g, M, x, I5 + 3.6, z - 2, 1.5, 1.6);
  typeTwentyOne(top, M, 0, 2.6, 0.3, 0, 3.6, 2.2);
  typeThirteen(g, M, x + 2.4, I4 + 1.0, z + 4, 0, 3.6);

  // The funnel: abaft the island, canted outboard, capped, with the smoke
  // hood over the top of it.
  const f = new THREE.Group();
  f.position.set(x, FD, z - 12);
  f.rotation.z = S * -0.45;   // twenty-six degrees outboard
  const H = 13.0;
  cyl(f, M.steel, 3.0, 3.4, H, 0, H / 2, 0, 18).scale.set(1, 1, 0.78);
  cyl(f, M.gunDark, 3.5, 3.5, 0.3, 0, H + 0.15, 0, 18).scale.set(1, 1, 0.78);
  for (let i = -2; i <= 2; i++) {
    box(f, M.gunDark, 6.2, 0.18, 0.3, 0, H - 0.5, i * 0.8);
  }
  // The steam pipe and the siren bracket up its after face.
  cyl(f, M.steelDark, 0.3, 0.3, H * 0.9, 0, H * 0.45, -2.6, 8);
  g.add(f);
  // The casing the funnel and the island stand on.
  box(g, M.steel, 8.2, 1.6, 34, x, FD - 0.8, z - 3);

  // The gun tubs on the island's own galleries: three for the twenty-five
  // millimetre and two for the rocket launchers, hung off its inboard side
  // where they can fire across the deck and out over the starboard beam.
  for (const spec of CLS.aa.guns[0].mounts) {
    if (Math.abs(spec.x) >= 19) continue;
    cyl(g, M.steel, 2.4, 2.6, 1.9, spec.x, FD - 2.8, spec.z, 14);
  }
  for (const spec of CLS.aa.guns[1].mounts) {
    if (Math.abs(spec.x) >= 19) continue;
    cyl(g, M.steel, 2.2, 2.4, 1.7, spec.x, FD - 3.6, spec.z, 14);
  }

  // Ladders up the inboard face, and the signal yards on the mast.
  for (let i = 0; i < 4; i++) {
    const y0 = FD + i * 3.2;
    ladder(g, M.steelDark, x + 3.8, y0, y0 + 3.2, z - 8, z - 8);
  }
  cyl(g, M.steelDark, 0.18, 0.24, 10, x, I5 + 8, z - 2, 8);
  for (const dy of [3.0, 6.2]) {
    box(g, M.steelDark, 7, 0.12, 0.12, x, I5 + dy, z - 2);
  }
}

/**
 * The gallery deck: the walkway that runs round the deck edge under the flight
 * deck, with the gun sponsons hanging off it.
 */
function galleries(g) {
  const y = FD - 2.6;
  for (const sgn of [-1, 1]) {
    for (let z = FD_AFT + 18; z < FD_FWD - 18; z += 6) {
      const w = Math.min(fdHalf(z) + 1.4, 23.2);
      box(g, M.steelDark, 2.4, 0.2, 6.05, sgn * w, y, z);
      for (const h of [0.4, 0.78, 1.16]) {
        box(g, M.steelDark, 0.06, 0.06, 6.05, sgn * (w + 1.1), y + h, z);
      }
      for (let i = 0; i < 3; i++) {
        cyl(g, M.steelDark, 0.05, 0.05, 1.2, sgn * (w + 1.1), y + 0.6, z - 2 + i * 2, 5);
      }
    }
  }
  // The sponsons the twelve-seven twins stand in: a plated tub hung under the
  // gallery at each of the four stations a side.
  for (const [x, z] of [[-20.4, 84], [20.4, 84], [-21.2, 34], [21.2, 34],
    [-21.2, -34], [21.2, -34], [-20.4, -84], [20.4, -84]]) {
    const sgn = Math.sign(x);
    cyl(g, M.steel, 4.6, 4.8, 3.0, x + sgn * 0.6, FD - 4.2, z, 16);
    box(g, M.steel, 5.0, 0.3, 9.2, x, FD - 2.9, z);
    // The knees under it.
    for (const dz of [-3.4, 3.4]) {
      box(g, M.steelDark, 4.2, 1.6, 0.3, x, FD - 5.4, z + dz);
    }
  }
  // And the tubs for the twenty-five millimetre, which hang lower still. Only
  // the ones on the deck edge: the island has its own, and they belong to it.
  for (const spec of CLS.aa.guns[0].mounts) {
    if (Math.abs(spec.x) < 19) continue;
    cyl(g, M.steel, 2.5, 2.7, 2.0, spec.x, FD - 3.6, spec.z, 14);
  }
  for (const spec of CLS.aa.guns[1].mounts) {
    if (Math.abs(spec.x) < 19) continue;
    cyl(g, M.steel, 2.3, 2.5, 1.8, spec.x, FD - 4.4, spec.z, 14);
  }
}

/** Her boats, her ground tackle, her cranes and her ventilators. */
function fittings(g) {
  // The crane on the port quarter, which is how she got a boat or a crashed
  // aircraft off the water.
  const cr = new THREE.Group();
  cr.position.set(-19.0, FD - 3.0, -104);
  cyl(cr, M.steel, 0.8, 0.95, 3.4, 0, 1.7, 0, 12);
  const jib = new THREE.Group();
  jib.position.set(0, 3.4, 0);
  jib.rotation.x = 0.5;
  box(jib, M.steelDark, 0.7, 0.7, 14, 0, 0, 6.6);
  for (let i = 1; i < 6; i++) box(jib, M.steelDark, 0.8, 0.08, 0.08, 0, 0, i * 2.2);
  cr.add(jib);
  g.add(cr);
  // Her boats, stowed on the gallery deck abreast the island.
  for (const sgn of [-1, 1]) {
    boat(g, M, sgn * 18.4, FD - 3.4, -6, 10);
    boat(g, M, sgn * 18.4, FD - 3.4, -20, 9);
  }
  // The forecastle under the flight deck: anchors, capstans and the bullring.
  const bow = 0.92 * LOA / 2;
  for (const sgn of [-1, 1]) {
    box(g, M.gunDark, 0.3, 2.4, 3.2, sgn * (halfDeck(bow) - 0.4), deckAt(bow) - 3.2, bow);
    cyl(g, M.steelDark, 1.2, 1.2, 1.5, sgn * 3.8, deckAt(bow - 9) + 0.75, bow - 9, 14);
  }
  const sz = F.zAt(1, deckAt(LOA / 2) - 1.8);
  cyl(g, mat(P.chrys), 1.7, 1.7, 0.2, 0, deckAt(LOA / 2) - 2.2, sz - 0.4, 20)
    .rotation.x = Math.PI / 2;
  // The two lattice radio masts standing on the port edge of the deck. They
  // are hinged at the foot and lie flat outboard while she is flying off; up,
  // which is how she spends most of her life, they carry her aerials.
  for (const z of [34, -48]) {
    const m = new THREE.Group();
    m.position.set(-(fdHalf(z) - 1.1), FD - fdDrop(z), z);
    for (const sgn of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const leg = box(m, M.steelDark, 0.16, 17, 0.16, sgn * 0.85, 8.5, dz * 0.85);
        leg.rotation.z = -sgn * 0.052;
        leg.rotation.x = -dz * 0.052;
      }
    }
    for (let i = 1; i < 9; i++) {
      const y = i * 1.9;
      const r = 0.85 * (1 - y / 34);
      box(m, M.steelDark, r * 2, 0.1, 0.1, 0, y, r);
      box(m, M.steelDark, r * 2, 0.1, 0.1, 0, y, -r);
      box(m, M.steelDark, 0.1, 0.1, r * 2, r, y, 0);
      box(m, M.steelDark, 0.1, 0.1, r * 2, -r, y, 0);
    }
    cyl(m, M.steelDark, 0.09, 0.12, 3.6, 0, 18.6, 0, 6);
    box(m, M.steelDark, 3.4, 0.1, 0.1, 0, 17.2, 0);
    g.add(m);
  }

  // The heavy crane on the port bow, which lifts a floatplane or a lighter
  // aboard over the deck edge. It is the biggest single fitting she carries
  // and it stands where the reference photographs put it.
  const bc = new THREE.Group();
  bc.position.set(-(fdHalf(96) - 1.4), FD - fdDrop(96), 96);
  cyl(bc, M.steel, 0.95, 1.1, 4.2, 0, 2.1, 0, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(bc, M.steelDark, 0.14, 4.0, 0.14, Math.sin(a) * 0.95, 2.0, Math.cos(a) * 0.95);
  }
  const bj = new THREE.Group();
  bj.position.set(0, 4.2, 0);
  bj.rotation.x = 0.44;
  for (const sgn of [-1, 1]) {
    box(bj, M.steelDark, 0.12, 0.12, 19, sgn * 0.45, 0.45, 9.2);
    box(bj, M.steelDark, 0.12, 0.12, 19, sgn * 0.45, -0.45, 9.2);
  }
  for (let i = 1; i < 9; i++) {
    box(bj, M.steelDark, 1.0, 0.09, 0.09, 0, 0.45, i * 2.1);
    box(bj, M.steelDark, 1.0, 0.09, 0.09, 0, -0.45, i * 2.1);
    box(bj, M.steelDark, 0.09, 1.0, 0.09, 0.45, 0, i * 2.1);
  }
  cyl(bj, M.steelDark, 0.06, 0.06, 6.2, 0, -3.1, 18.4, 6);
  bc.add(bj);
  g.add(bc);

  // Ventilator cowls along the gallery.
  for (let z = -90; z < 100; z += 16) {
    for (const sgn of [-1, 1]) {
      cowl(g, M, sgn * 17.0, FD - 2.4, z, 0.36, 1.6);
    }
  }
  // Her ensign staff right aft, under the round-down.
  cyl(g, M.steelDark, 0.16, 0.2, 5, 0, sheer(-0.96) + 2.5, -0.96 * LOA / 2, 8);
}

/** Four screws and two rudders, which is what a Yamato hull turns on. */
function screws(g) {
  for (const [x, z, r, hand] of [
    [-8.8, -0.845 * LOA / 2, 2.9, -1],
    [8.8, -0.845 * LOA / 2, 2.9, 1],
    [-4.3, -0.885 * LOA / 2, 2.8, 1],
    [4.3, -0.885 * LOA / 2, 2.8, -1],
  ]) {
    tubeZ(g, M.gunDark, 0.58, 13, x, -7.5, z + 6.5, 10);
    const hub = new THREE.Group();
    hub.position.set(x, -7.5, z);
    // She turns, so the welder is told to leave her alone: a screw baked into
    // the hull is a propeller standing dead still under a ship at full speed.
    hub.userData.dynamic = true;
    // A screw has a hand. The two shafts of a pair turn opposite ways so
    // their torques cancel, or a ship at full power carries a permanent list
    // and a rudder always over -- and the outer pair are handed against the
    // inner for the same reason.
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.82, 0.58, 1.0, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, r * 0.58, 0.15, r * 1.5,
        Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.42;
    }
    g.add(hub);
  }
  for (const z of [-0.90, -0.945]) {
    box(g, M.gunDark, 0.5, 6.2, 4.2, 0, -6.0, z * LOA / 2);
  }
}

// ---------------------------------------------------------------- guns ----

/** Her eight 12.7 cm twins, which are her main battery. */
function mainBattery(g) {
  const turrets = CLS.turrets.map((spec) =>
    typeEightNine(g, M, spec.x, FD - 2.6, spec.z, spec.angle));
  g.userData.turrets = turrets;
  return turrets;
}

/** And the twenty-five millimetre and the rocket launchers. */
function mountings(g) {
  const aa = [];
  for (const spec of CLS.aa.guns[0].mounts) {
    aa.push(triple25(g, M, spec.x, Math.abs(spec.x) > 10 ? FD - 2.6 : FD + 0.2,
      spec.z, spec.angle));
  }
  for (const spec of CLS.aa.guns[1].mounts) {
    aa.push(rocket(g, M, spec.x, Math.abs(spec.x) > 10 ? FD - 3.4 : FD + 0.2,
      spec.z, spec.angle));
  }
  g.userData.aaMounts = aa;
  return aa;
}

// ----------------------------------------------------------- deck cycle ----

const LIFT_DROP = FD - HANGAR - 0.5;
const ROLL = 9.0;
function ease(k) { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); }
/** Where she picks up a wire: a little way up the deck from the round-down. */
function landZ() { return FD_AFT + 22; }

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
  ['endDecks', endDecks],
  ['flightDeck', flightDeck],
  ['hangar', hangar],
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
  // deck, which is nine metres of ship that is not there.
  buildInterior(g, {
    loa: LOA,
    shellAt: F.shellAt,
    keelY: F.keelY,
    // Her "deck" for this purpose is the hangar deck, not the flight deck:
    // there is nothing below the hangar but the hull, and the hangar itself is
    // built above -- deck, sides, ends, fire curtains and the aircraft in it.
    sheer: () => HANGAR,
    zAt: F.zAt,
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
