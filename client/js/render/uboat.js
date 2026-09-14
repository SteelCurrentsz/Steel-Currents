// U-48, a Type VIIB, built out of her own lines.
//
// Sixty-six and a half metres, seven hundred and fifty tonnes, and the most
// successful submarine of the war: fifty-five ships in twelve patrols. She is
// the only hull in this game that is not a ship, and almost nothing about the
// way the others are drawn applies to her.
//
// Four things have to be right or she is not a Type VII.
//
// The first is that there are two hulls. The pressure hull is a cylinder of
// eighteen-millimetre steel, faired to a cone at each end, and it is the only
// part of her that is watertight. Everything else -- the casing she is walked
// on, the saddle tanks down each side, the whole of the sharp bow and the
// sharp stern -- is free-flooding structure built round it, full of sea the
// moment she dives. That is why her sides are pierced with limber holes: they
// are not detail, they are the whole point of the outer hull.
//
// The second is the tower. A conning tower is not a bridge on a ship; it is a
// pressure-tight cylinder standing on the hull with a hatch down into it, and
// the bridge is the open platform on top. Abaft it is the Wintergarten, an
// open railed gallery carrying the flak, and above it the attack periscope,
// the sky periscope and the direction-finding loop.
//
// The third is the tubes. Five: four in the bow and one in the stern, fixed in
// the hull with nothing to train. A Type VII is aimed by pointing the boat.
// The outer doors are visible on the casing, and they swing.
//
// The fourth is that everything on the outside of the pressure hull drowns.
// The 8.8 cm on the casing and the 2 cm on the Wintergarten are both open
// mountings in the sea when she is down, and the simulation refuses to fire
// them -- see gunsDrowned.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the surfaced waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, ladder } from './shipkit.js';
import { arm } from './mounts.js';

const CLS = SHIP_CLASSES.u48;
export const LOA = CLS.hull.length;      // 66.5 m
export const BEAM = CLS.hull.beam;       // 6.2 m
export const DRAFT = CLS.hull.draft;
const HALF = LOA / 2;

// Kriegsmarine grey, and it is two greys and not one.
//
// A Type VII went to sea in Hellgrau 50 on everything above the top of her
// saddle tanks -- the casing side, the tower, the gun -- and Dunkelgrau 51 on
// the tank sides below it, with a black boot topping at the surfaced waterline
// and the casing itself darker than either. The line between the two greys is
// the top of the saddle tanks and it runs the whole length of her, which is
// why she reads as a low dark hull with a light tower on it in every
// photograph and is the single most useful thing about her colouring.
const P = {
  light: 0x8b929a,         // Hellgrau 50: topsides, tower, everything above
  hull: 0x6b727a,          // Dunkelgrau 51: the saddle tanks
  hullDark: 0x4c535b,      // the pressure hull, seen only in a cutaway
  boot: 0x1a1d21,          // the boot topping at the waterline
  antifoul: 0x3d423e,      // and the dull green-black under it
  deck: 0x4c4d48,          // the wooden grating on the casing
  deckSteel: 0x4a5057,
  steel: 0x7d858d,
  steelDark: 0x4a5159,
  bright: 0x99a1a9,
  gun: 0x757d85,
  gunDark: 0x3a4046,
  canvas: 0x7d7d72,
  glass: 0x24303a,
  cave: 0x0e1116,
  brass: 0x8a7340,
  // The boat's number, painted white on the tower early in the war and
  // painted out later. Hers was there in 1940.
  mark: 0xd2d6da,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --
//
// A Type VII is lofted from four curves, and every one of them is a curve --
// nothing about a submarine is a cylinder except the pressure hull inside her,
// and the mistake that makes a U-boat look like a toy is drawing the outside
// as one. The casing does not hang in the air over a tube: it is the top of
// the hull, and the hull comes up to meet it the whole length of the boat.
//
// Everything is metres, and y = 0 is the surfaced waterline.

/**
 * Her profile: the top of the casing, station by station from the stern at
 * t = -1 to the stem at t = +1.
 *
 * Nearly flat over the middle of her and lifting hard forward of the tower --
 * a Type VII's freeboard is under two metres amidships and getting on for four
 * at the stem, which is what keeps her dry enough to fight the gun in the
 * Atlantic and what gives her the profile everyone knows.
 */
const DECKLINE = [
  [-1.00, 1.02], [-0.93, 1.34], [-0.82, 1.58], [-0.64, 1.72], [-0.42, 1.82],
  [-0.18, 1.88], [0.08, 1.90], [0.30, 1.96], [0.48, 2.12], [0.64, 2.42],
  [0.77, 2.80], [0.87, 3.16], [0.94, 3.48], [1.00, 3.74],
];

/**
 * Her keel: four metres and three quarters down amidships, which is her
 * surfaced draught, sweeping up at both ends.
 *
 * Forward the sweep is the forefoot and it carries the stem clear of the water
 * a little abaft the extreme bow. Aft it is finer still, because everything
 * in the after body has to clear two screws and two rudders.
 */
const KEEL = [
  [-1.00, -1.10], [-0.96, -2.35], [-0.90, -3.40], [-0.82, -4.20], [-0.70, -4.60],
  [-0.50, -4.74], [-0.20, -4.74], [0.10, -4.74], [0.34, -4.70], [0.50, -4.56],
  [0.64, -4.24], [0.76, -3.66], [0.86, -2.84], [0.93, -1.82], [0.98, -0.68],
  [1.00, 0.20],
];

/**
 * Her half-breadth over the saddle tanks: 3.10 m, so 6.2 m of beam.
 *
 * The saddle tanks are the main ballast, blistered on to the pressure hull
 * outside it, and they are why she is wider than the tube she is built round.
 * They run about two thirds of her length and die away at both ends.
 */
const HALFB = [
  [-1.00, 0.13], [-0.95, 0.52], [-0.88, 1.08], [-0.78, 1.78], [-0.64, 2.42],
  [-0.46, 2.88], [-0.24, 3.06], [0.00, 3.10], [0.20, 3.08], [0.36, 2.96],
  [0.50, 2.70], [0.62, 2.32], [0.74, 1.82], [0.84, 1.28], [0.92, 0.74],
  [0.97, 0.34], [1.00, 0.10],
];

/**
 * And the section: her half-breadth as a fraction of the maximum, from the
 * keel at v = 0 to the edge of the casing at v = 1.
 *
 * This is the one curve that is the same at every station, and it is the shape
 * of a saddle-tank boat: a narrow flat keel, a hard turn of bilge, the widest
 * point a metre below the waterline where the tanks bulge, and then a long
 * tumblehome up to a casing three quarters of her beam wide. A ship's section
 * is widest at the deck. A submarine's is widest under water.
 */
const SECTION = [
  [0.00, 0.055], [0.06, 0.30], [0.14, 0.53], [0.24, 0.73], [0.36, 0.88],
  [0.48, 0.965], [0.58, 1.000], [0.68, 0.995], [0.78, 0.960], [0.86, 0.905],
  [0.93, 0.812], [1.00, 0.706],
];

/**
 * The pressure hull: the only watertight thing aboard.
 *
 * A cylinder of eighteen-millimetre steel, four metres seventy across, coned
 * away at both ends, sitting low in the outer hull with its crown a hand's
 * breadth above the surfaced waterline. Radius as a fraction of the maximum.
 */
const PRESSURE = [
  [-1.00, 0.00], [-0.94, 0.30], [-0.86, 0.55], [-0.76, 0.74], [-0.64, 0.88],
  [-0.50, 0.96], [-0.34, 1.00], [0.00, 1.00], [0.26, 1.00], [0.40, 0.98],
  [0.52, 0.93], [0.64, 0.84], [0.74, 0.72], [0.84, 0.55], [0.92, 0.37],
  [0.97, 0.20], [1.00, 0.00],
];
/** Her greatest pressure-hull radius, and the height of its axis. */
const R = 2.35;
const PY = -2.10;

function lerpAt(table, t) {
  const c = Math.max(table[0][0], Math.min(table[table.length - 1][0], t));
  if (c <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (c <= table[i][0]) {
      const [t0, v0] = table[i - 1];
      const [t1, v1] = table[i];
      const k = (c - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
    }
  }
  return table[table.length - 1][1];
}

/** Her pressure-hull radius at a station. */
export function hullR(t) { return lerpAt(PRESSURE, t) * R; }
/** Her keel at a station, and the top of her casing there. */
export function keelAt(t) { return lerpAt(KEEL, t); }
export function sheerAt(t) { return lerpAt(DECKLINE, t); }
/** Her greatest half-breadth at a station -- over the saddle tanks. */
export function outerR(t) { return lerpAt(HALFB, t); }
/** The section fraction at a height fraction. */
function sectionF(v) { return lerpAt(SECTION, Math.max(0, Math.min(1, v))); }

/**
 * Her half-breadth at a station and a height: the shell itself.
 *
 * This is the function the whole outside of her is built from, and everything
 * that has to sit on her side -- limber holes, planes, tube doors -- asks it
 * where the side is rather than guessing.
 */
export function shellAt(t, y) {
  const k = keelAt(t);
  const d = sheerAt(t);
  if (d - k < 0.01) return 0.02;
  return outerR(t) * sectionF((y - k) / (d - k));
}

/** The height of the casing -- the walking deck -- at a station. */
export function deckAt(z) { return sheerAt(Math.max(-1, Math.min(1, z / HALF))); }
/** How far outboard the casing edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / HALF));
  return Math.max(0.10, outerR(t) * SECTION[SECTION.length - 1][1]);
}

// ------------------------------------------------------------------ hull --

/**
 * A body of revolution, lofted from a table of radii.
 *
 * Used for the pressure hull and for nothing else: the outside of her is not
 * a body of revolution and drawing it as one is the whole of what is wrong
 * with most models of a U-boat.
 */
function revolve(g, m, rad, yOf, t0, t1, N = 60, SEG = 20, squash = 1) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const r = Math.max(0.01, rad(t));
    const y = yOf(t);
    const z = t * HALF;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      pos.push(Math.sin(a) * r, y + Math.cos(a) * r * squash, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = i * SEG + k;
      const b = i * SEG + ((k + 1) % SEG);
      idx.push(a, b, a + SEG, a + SEG, b, b + SEG);
    }
  }
  // Both ends closed on a centre point, or she is a pipe.
  const aft = pos.length / 3;
  pos.push(0, yOf(t0), t0 * HALF);
  for (let k = 0; k < SEG; k++) idx.push(aft, (k + 1) % SEG, k);
  const fwd = pos.length / 3;
  pos.push(0, yOf(t1), t1 * HALF);
  for (let k = 0; k < SEG; k++) idx.push(fwd, N * SEG + k, N * SEG + ((k + 1) % SEG));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/** The pressure hull, which is the boat. Everything else is built round it. */
function pressureHull(g) {
  revolve(g, M.hullDark, hullR, () => PY, -0.96, 0.96, 56, 20);
}

/**
 * The outer hull, lofted station by station off the four curves.
 *
 * A ring at each station runs up the starboard side from the keel to the edge
 * of the casing, straight across the casing, and down the port side back to
 * the keel -- so the deck she is walked on is the top of the same closed
 * surface as her bottom, and there is no seam between them and nothing hanging
 * in the air. `band` is a strake: the shell is plated in horizontal bands
 * rather than lofted in one piece, so that the boot topping and the
 * anti-fouling below it are the plating and not a decal laid over it.
 */
function shell(g, m, v0, v1, t0 = -0.995, t1 = 0.995, N = 96, K = 7, swell = 1) {
  const pos = [];
  const idx = [];
  const ring = (K + 1) * 2;
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const k = keelAt(t);
    const d = sheerAt(t);
    const w = outerR(t) * swell;
    for (let j = 0; j <= K; j++) {
      const v = v0 + ((v1 - v0) * j) / K;
      pos.push(w * sectionF(v), k + (d - k) * v, t * HALF);
    }
    for (let j = K; j >= 0; j--) {
      const v = v0 + ((v1 - v0) * j) / K;
      pos.push(-w * sectionF(v), k + (d - k) * v, t * HALF);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      idx.push(a, b, a + ring, a + ring, b, b + ring);
    }
  }
  // Both ends shut on a point, so she holds water.
  for (const [base, t, flip] of [[0, t0, true], [N * ring, t1, false]]) {
    const c = pos.length / 3;
    const k = keelAt(t);
    const d = sheerAt(t);
    pos.push(0, k + (d - k) * (v0 + v1) / 2, t * HALF);
    for (let j = 0; j < ring; j++) {
      const a = base + j;
      const b = base + ((j + 1) % ring);
      if (flip) idx.push(c, b, a); else idx.push(c, a, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/**
 * The outside of her: the free-flooding casing over the pressure hull, the
 * saddle tanks down each side, the sharp bow and the finer stern.
 *
 * None of it is watertight and none of it ever was -- the sea is inside it the
 * whole time she is under -- which is why her sides are cut with limber holes
 * and why a shell through it does nothing at all.
 *
 * She is plated in strakes rather than lofted in one piece, and the strakes
 * are where her colours change: anti-fouling to the boot topping, the boot to
 * Dunkelgrau 51 over the tanks, and Dunkelgrau to Hellgrau 50 at the top of
 * the tanks, which is the line that runs the whole length of her.
 */
function outerHull(g) {
  shell(g, M.antifoul, 0.000, 0.656, -0.995, 0.995, 104, 8);
  shell(g, M.boot, 0.646, 0.762, -0.995, 0.995, 104, 3, 1.003);
  shell(g, M.hull, 0.752, 0.880, -0.995, 0.995, 104, 4, 1.003);
  shell(g, M.light, 0.872, 1.000, -0.995, 0.995, 104, 5, 1.004);

  // The strake along the top of the saddle tanks: a raised welt of plating,
  // and the line the two greys meet on.
  shell(g, M.steelDark, 0.868, 0.886, -0.985, 0.985, 104, 2, 1.017);
  // And two plating seams down the tank side, which is what tells you at a
  // glance that she is a riveted-and-welded hull and not a moulding.
  shell(g, M.hullDark, 0.786, 0.794, -0.96, 0.96, 96, 2, 1.010);
  shell(g, M.hullDark, 0.700, 0.707, -0.94, 0.94, 96, 2, 1.008);

  limberHoles(g);
}

/**
 * The limber holes, which after the tower are the most recognisable thing
 * about a U-boat's outline.
 *
 * They are not decoration. The whole of the outer hull floods, and it has to
 * do it fast enough that she is under in half a minute and drain fast enough
 * that she is not carrying tons of the North Atlantic around on the surface.
 * So she is cut with three separate runs of them, and the plans show all
 * three: a dense row of small slots immediately under the edge of the casing
 * from the bow to the stern, a row of larger free-flooding vents along the top
 * of the saddle tanks, and the flood ports low down that the tanks breathe
 * through.
 */
function limberHoles(g) {
  for (const sgn of [-1, 1]) {
    // The run under the casing edge. Broken abreast the tower, because there
    // is tower fairing there and not casing.
    for (let i = 0; i < 62; i++) {
      const t = -0.885 + (1.77 * i) / 61;
      const z = t * HALF;
      if (z > -2.4 && z < 4.6) continue;      // under the tower fairing
      const y = deckAt(z) - 0.52;
      const w = shellAt(t, y);
      if (w < 0.62) continue;
      box(g, M.cave, 0.13, 0.28, 0.44, sgn * (w - 0.05), y, z);
    }
    // The free-flooding vents along the top of the tanks: fewer, longer, and
    // lower -- right under the strake.
    for (let i = 0; i < 22; i++) {
      const t = -0.72 + (1.42 * i) / 21;
      const z = t * HALF;
      const y = deckAt(z) - 1.32;
      const w = shellAt(t, y);
      if (w < 1.1) continue;
      box(g, M.cave, 0.12, 0.26, 0.82, sgn * (w - 0.03), y, z);
    }
    // And the flood ports the tanks breathe through, at the turn of bilge.
    for (let i = 0; i < 12; i++) {
      const t = -0.54 + (1.06 * i) / 11;
      const y = -2.70;
      const w = shellAt(t, y);
      if (w < 1.4) continue;
      box(g, M.cave, 0.11, 0.34, 0.56, sgn * (w - 0.03), y, t * HALF);
    }
  }
  // The four bow tube doors show on the stem as rings of plating round the
  // mouths; the tubes themselves are built with the mountings.
  // The anchor, recessed into the starboard bow with its hawse: a Type VII
  // carried one, on that side, and it is the only break in her port-starboard
  // symmetry above water.
  const at = 0.905;
  const az = at * HALF;
  const ay = deckAt(az) - 1.05;
  const aw = shellAt(at, ay);
  box(g, M.cave, 0.16, 0.62, 0.92, aw - 0.05, ay, az);
  box(g, M.steelDark, 0.11, 0.44, 0.66, aw - 0.02, ay, az);
  cyl(g, M.cave, 0.13, 0.13, 0.30, aw - 0.10, deckAt(az) - 0.30, az + 0.30, 10)
    .rotation.z = Math.PI / 2;
}

/**
 * The casing: the wooden walking deck laid on top of the hull, the steel
 * margin it is laid in, and the coaming down each edge.
 *
 * The deck surface itself is the top of the hull -- see `shell` -- so what is
 * built here is only what is laid on it.
 */
function casing(g) {
  const N = 84;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = -0.955 + (1.91 * i) / N;
    const z = t * HALF;
    const w = Math.max(0.06, halfDeck(z) - 0.30);
    const y = deckAt(z) + 0.035;
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
  g.add(new THREE.Mesh(geo, M.deck));

  // The coaming down each edge of the casing.
  for (let i = 0; i < N; i++) {
    const t = -0.955 + (1.91 * i) / N;
    const t2 = -0.955 + (1.91 * (i + 1)) / N;
    const z = t * HALF;
    const z2 = t2 * HALF;
    const w = (halfDeck(z) + halfDeck(z2)) / 2 - 0.08;
    if (w < 0.12) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.deckSteel, 0.16, 0.10, Math.abs(z2 - z) + 0.03,
        sgn * w, (deckAt(z) + deckAt(z2)) / 2 + 0.05, (z + z2) / 2);
    }
  }
  // The deck grating's own planking runs athwartships on a boat, not fore and
  // aft, and the battens that hold it read as a ladder from above.
  for (let i = 0; i < 64; i++) {
    const t = -0.92 + (1.84 * i) / 63;
    const z = t * HALF;
    const w = halfDeck(z) - 0.30;
    if (w < 0.25) continue;
    box(g, M.deckSteel, w * 2 - 0.14, 0.035, 0.09, 0, deckAt(z) + 0.07, z);
  }
}


// ----------------------------------------------------------------- tower --
//
// Where the tower is, and how high, in one place: the flak stands on the
// Wintergarten and the tower's inside is fitted to the same figures, so none
// of them may be guessed twice.
const TZ = 1.0;                  // she sits a little abaft amidships
const T_BASE = deckAt(TZ);       // the casing the fairing stands on
const T_FAIR = 1.62;             // and the height of the free-flooding skirt
const T_BRIDGE = T_BASE + 2.48;  // the bridge deck: nine metres over her keel
const T_WG = T_BRIDGE - 0.54;    // the Wintergarten, one step down abaft it

/**
 * The plan of the tower, station by station, as it is drawn on her plans: the
 * free-flooding fairing, the pressure tower standing inside it, the bridge
 * coaming on top of that, and the Wintergarten abaft.
 *
 * Rows are [dz from the tower's centre, half-breadth]. The first and last row
 * of each give only a station: the ends close on the centreline there, which
 * is what makes the shape a rounded one in plan rather than a box.
 */
const FAIR_PLAN = [
  [-3.20, 0], [-2.88, 0.64], [-2.38, 1.16], [-1.62, 1.53], [-0.70, 1.70],
  [0.30, 1.72], [1.20, 1.64], [1.96, 1.44], [2.56, 1.10], [3.06, 0.62], [3.42, 0],
];
const TOWER_PLAN = [
  [-2.48, 0], [-2.18, 0.54], [-1.72, 0.98], [-1.06, 1.26], [-0.26, 1.37],
  [0.56, 1.37], [1.26, 1.27], [1.82, 1.05], [2.22, 0.66], [2.52, 0],
];
const BRIDGE_PLAN = [
  [-2.34, 0], [-2.04, 0.51], [-1.62, 0.93], [-1.02, 1.21], [-0.22, 1.32],
  [0.54, 1.32], [1.20, 1.22], [1.72, 1.01], [2.10, 0.65], [2.38, 0],
];
const WG_PLAN = [
  [-1.62, 0], [-1.40, 0.58], [-0.96, 0.98], [-0.36, 1.16], [0.34, 1.16],
  [0.96, 1.06], [1.60, 0.92], [2.30, 0],
];

/**
 * A closed plan outline from a half-breadth table.
 *
 * The table describes one side of something symmetrical about the centreline,
 * which is how a tower is drawn. This walks up the starboard side and back
 * down the port one and hands back the closed curve everything below is swept
 * along.
 */
function outlinePts(rows, z0) {
  const pts = [[0, z0 + rows[0][0]]];
  for (let i = 1; i < rows.length - 1; i++) pts.push([rows[i][1], z0 + rows[i][0]]);
  pts.push([0, z0 + rows[rows.length - 1][0]]);
  for (let i = rows.length - 2; i > 0; i--) pts.push([-rows[i][1], z0 + rows[i][0]]);
  return pts;
}

/** The outward normal of a closed outline at each of its points. */
function outNormals(pts) {
  const n = pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    let nx = b[1] - a[1];
    let nz = -(b[0] - a[0]);
    const len = Math.hypot(nx, nz) || 1;
    nx /= len; nz /= len;
    if (nx * pts[i][0] + nz * (pts[i][1] - cz) < 0) { nx = -nx; nz = -nz; }
    out.push([nx, nz]);
  }
  return out;
}

/**
 * A bulwark: a wall of plating following a closed outline.
 *
 * This is the thing a bridge coaming actually is, and the reason it matters is
 * that a bridge is an open platform. Drawn as a solid box it reads as a
 * deckhouse with a lid; drawn as a wall you can see over it and see the men
 * and the gear standing inside it, which is what a conning tower looks like.
 *
 * `flare` pushes the top of the outer face outboard -- the spray deflector
 * round the front of a Type VII's bridge, which is the single most
 * recognisable thing about her above the casing.
 */
function bulwark(g, m, pts, y, h, thick, flare = 0) {
  const n = pts.length;
  const nn = outNormals(pts);
  const pos = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i];
    const [nx, nz] = nn[i];
    // Only the forward half gets the deflector: it is there to throw a head
    // sea over the men, and abaft the beam there is no head sea.
    const f = flare * Math.max(0, Math.min(1, (nz + 0.15) / 0.85));
    pos.push(x, y, z);                                       // outer foot
    pos.push(x - nx * thick, y, z - nz * thick);             // inner foot
    pos.push(x - nx * thick, y + h, z - nz * thick);         // inner head
    pos.push(x + nx * f, y + h + f * 0.25, z + nz * f);      // outer head
  }
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = ((i + 1) % n) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      idx.push(a + k, a + k2, b + k, a + k2, b + k2, b + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/** A platform: a slab of deck filling a closed outline. */
function platformSlab(g, m, pts, y, thick) {
  const n = pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / n;
  const pos = [];
  const idx = [];
  for (const [x, z] of pts) pos.push(x, y + thick, z);
  for (const [x, z] of pts) pos.push(x, y, z);
  const ct = pos.length / 3; pos.push(0, y + thick, cz);
  const cb = pos.length / 3; pos.push(0, y, cz);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(ct, j, i);
    idx.push(cb, n + i, n + j);
    idx.push(i, j, n + i, j, n + j, n + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  g.add(mesh);
  return mesh;
}

/**
 * A closed body lofted between two heights from a plan outline, tapering as it
 * goes up. The fairing and the pressure tower are both this.
 */
function loftTower(g, m, rows, z0, y, h, taper = 0.95) {
  const lo = outlinePts(rows, z0);
  const n = lo.length;
  const pos = [];
  const idx = [];
  for (const [x, z] of lo) pos.push(x, y, z);
  for (const [x, z] of lo) pos.push(x * taper, y + h, z0 + (z - z0) * taper);
  const cb = pos.length / 3; pos.push(0, y, z0);
  const ct = pos.length / 3; pos.push(0, y + h, z0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Wound so the outside faces out. Wound the other way the tower is a
    // closed shape you can see straight into: from astern a ray goes through
    // the after plating, past the brass in the tower compartment, and meets
    // the inside of the forward face -- which reads as solid until something
    // is standing in there, and then it is a hole.
    idx.push(i, n + i, j, j, n + i, n + j);
    idx.push(cb, i, j);
    idx.push(ct, n + j, n + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/**
 * The conning tower.
 *
 * Four things stacked, and the plans show all four. The bottom is the fairing:
 * free-flooding plating wrapped round the foot of the tower, slotted along its
 * base, and it is what makes a Type VII's tower wider at the bottom than the
 * top. Inside it stands the pressure tower, a second pressure vessel with a
 * hatch down into the control room and another up on to the bridge. On top of
 * that is the bridge itself -- an open platform inside a coaming, with the
 * spray deflector flared round the front of it, the UZO on the centreline, the
 * compass, the voicepipes and the upper hatch. And abaft it, one step down,
 * the Wintergarten: the railed gallery the flak stands on.
 *
 * Above it all the periscope shears, the DF loop and the jumping wire.
 */
function tower(g) {
  const base = T_BASE;

  // The fairing, and the free-flooding slots round the foot of it. The sea is
  // inside this the moment she dives and it has to get in and out.
  loftTower(g, M.light, FAIR_PLAN, TZ, base, T_FAIR, 0.90);
  const fairPts = outlinePts(FAIR_PLAN, TZ);
  const fairN = outNormals(fairPts);
  for (let i = 0; i < fairPts.length; i++) {
    const [x, z] = fairPts[i];
    const [nx, nz] = fairN[i];
    if (Math.abs(x) < 0.55) continue;                    // not on the ends
    for (const dy of [0.26, 0.68]) {
      const slot = box(g, M.cave, 0.07, 0.18, 0.38,
        x - nx * 0.045, base + dy, z - nz * 0.045);
      // Turned so the slot lies ALONG the plating and its thin face is the
      // one pointing out of it. Turned to the normal instead -- which is the
      // easy mistake -- every slot stands a third of a metre off her side.
      slot.rotation.y = Math.atan2(nz, -nx);
    }
  }

  // The pressure tower inside it, and the step of plating where the fairing
  // ends and it carries on up.
  loftTower(g, M.light, TOWER_PLAN, TZ, base + T_FAIR, T_BRIDGE - base - T_FAIR, 0.96);

  // The bridge deck, and the coaming round it with the spray deflector flared
  // over the forward half.
  platformSlab(g, M.deckSteel, outlinePts(BRIDGE_PLAN, TZ), T_BRIDGE - 0.10, 0.10);
  bulwark(g, M.light, outlinePts(BRIDGE_PLAN, TZ), T_BRIDGE, 0.92, 0.13, 0.20);
  // And the grating the watch stands on, which is not the deck: a Type VII's
  // bridge floor is slatted so the sea goes through it.
  platformSlab(g, M.steelDark, outlinePts(BRIDGE_PLAN.map(([dz, w]) => [dz * 0.86, w * 0.80]), TZ),
    T_BRIDGE + 0.02, 0.04);

  // What is on the bridge. The upper hatch first, because it is the reason
  // there is a bridge at all: it is the only way in or out of the boat at sea.
  cyl(g, M.steelDark, 0.42, 0.45, 0.16, 0, T_BRIDGE + 0.10, TZ - 0.30, 14);
  cyl(g, M.bright, 0.36, 0.36, 0.09, 0.10, T_BRIDGE + 0.21, TZ - 0.30, 14);
  box(g, M.steelDark, 0.10, 0.09, 0.26, -0.34, T_BRIDGE + 0.21, TZ - 0.30);

  // The UZO on the forward coaming: a pair of big ship's binoculars on a
  // pedestal with a bearing ring under them, and it is what she actually aims
  // a surface attack with. The tubes do not train; the boat does.
  cyl(g, M.steelDark, 0.11, 0.15, 0.86, 0, T_BRIDGE + 0.45, TZ + 1.62, 10);
  cyl(g, M.gunDark, 0.20, 0.20, 0.07, 0, T_BRIDGE + 0.90, TZ + 1.62, 14);
  box(g, M.gunDark, 0.40, 0.16, 0.14, 0, T_BRIDGE + 1.00, TZ + 1.62);
  for (const sgn of [-1, 1]) {
    tubeZ(g, M.gunDark, 0.055, 0.34, sgn * 0.11, T_BRIDGE + 1.06, TZ + 1.70, 8);
  }

  // The magnetic compass in its binnacle, and the two voicepipes down to the
  // control room -- the tube she is conned through.
  cyl(g, M.steelDark, 0.13, 0.15, 0.52, -0.62, T_BRIDGE + 0.28, TZ + 0.90, 10);
  sphere(g, M.bright, 0.15, -0.62, T_BRIDGE + 0.58, TZ + 0.90, 10);
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.055, 0.055, 0.70, sgn * 0.80, T_BRIDGE + 0.37, TZ + 0.30, 8);
    const bell = cyl(g, M.steelDark, 0.10, 0.055, 0.14, sgn * 0.80, T_BRIDGE + 0.78, TZ + 0.30, 8);
    bell.rotation.z = sgn * 0.35;
  }
  // Navigation lights, port and starboard on the coaming, in their screens.
  for (const [sgn, col] of [[-1, 0x2a5d33], [1, 0x6d2a2a]]) {
    box(g, M.steelDark, 0.14, 0.24, 0.20, sgn * 1.22, T_BRIDGE + 0.58, TZ + 0.72);
    box(g, mat(col), 0.05, 0.16, 0.13, sgn * 1.31, T_BRIDGE + 0.58, TZ + 0.72);
  }

  // The periscope shears: the housing abaft the bridge that the two scopes
  // come up through, and the scopes themselves. The sky periscope is the
  // fatter one and is used from the bridge; the attack scope is the thin one
  // and is used from inside the tower, which is why it stands further aft.
  loftTower(g, M.light, [
    [-1.30, 0], [-1.05, 0.42], [-0.60, 0.60], [0.20, 0.62], [0.70, 0.46], [1.00, 0],
  ], TZ - 1.55, T_BRIDGE, 1.15, 0.88);
  const scopes = new THREE.Group();
  scopes.position.set(0, T_BRIDGE + 1.15, TZ - 1.55);
  cyl(scopes, M.steelDark, 0.125, 0.135, 2.90, -0.26, 1.45, -0.42, 10);
  box(scopes, M.steelDark, 0.28, 0.32, 0.19, -0.26, 3.02, -0.34);
  cyl(scopes, M.steelDark, 0.075, 0.082, 3.60, 0.28, 1.80, 0.28, 8);
  box(scopes, M.steelDark, 0.20, 0.28, 0.14, 0.28, 3.72, 0.34);
  g.add(scopes);

  // The direction-finding loop, on its short folding mast on the fore part of
  // the bridge: the aerial she takes a bearing on a convoy's radio with, and
  // it folds flat into the casing of the bridge when she dives.
  cyl(g, M.steelDark, 0.055, 0.065, 0.92, 0, T_BRIDGE + 0.52, TZ + 0.98, 8);
  const loop = cyl(g, M.steelDark, 0.40, 0.40, 0.06, 0, T_BRIDGE + 1.06, TZ + 0.98, 18);
  loop.rotation.x = Math.PI / 2;
  cyl(g, M.steelDark, 0.34, 0.34, 0.05, 0, T_BRIDGE + 1.06, TZ + 0.98, 18)
    .rotation.x = Math.PI / 2;

  // The Wintergarten abaft the bridge, one step down: the deck, the bulwark
  // round it, and the rail on top of that. The flak stands in the middle of it
  // and is built with the other mountings.
  const wgPts = outlinePts(WG_PLAN, TZ - 4.60);
  const plat = platformSlab(g, M.deckSteel, wgPts, T_WG - 0.10, 0.10);
  plat.userData.name = 'wintergarten';
  bulwark(g, M.light, wgPts, T_WG, 0.62, 0.11);
  const wgN = outNormals(wgPts);
  for (let i = 0; i < wgPts.length; i++) {
    const j = (i + 1) % wgPts.length;
    const [x, z] = wgPts[i];
    const [x2, z2] = wgPts[j];
    if (z > TZ - 3.4 && z2 > TZ - 3.4) continue;          // open into the bridge
    const len = Math.hypot(x2 - x, z2 - z);
    for (const h of [0.28, 0.56]) {
      const rail = box(g, M.steelDark, 0.04, 0.04, len + 0.02,
        (x + x2) / 2, T_WG + 0.62 + h, (z + z2) / 2);
      rail.rotation.y = Math.atan2(x2 - x, z2 - z);
    }
    const [nx, nz] = wgN[i];
    box(g, M.steelDark, 0.045, 0.60, 0.045, x - nx * 0.05, T_WG + 0.92, z - nz * 0.05);
  }

  // The ladder up the after face of the fairing to the Wintergarten, and the
  // step rungs up the tower side from the casing.
  ladder(g, M.steelDark, 0, base + 0.25, T_WG - 0.05, TZ - 3.55, TZ - 4.15);
  for (let i = 0; i < 5; i++) {
    box(g, M.steelDark, 0.34, 0.045, 0.045, 0, base + 0.34 + i * 0.27, TZ + 3.02);
  }

  // Her number on the fairing, painted white: three strokes a side, and they
  // were painted out once the boats started being hunted by aircraft.
  // Segments of a digit, as [dz, dy, long-ways?]: top, upper two uprights,
  // middle, lower two uprights, bottom -- the shape a stencil cuts.
  // A four has no top bar, which is the whole of what tells it from a nine.
  const SEG = {
    4: [[0.26, 0.17, 1], [-0.26, 0.17, 1], [0, 0.00], [-0.26, -0.17, 1]],
    8: [[0, 0.34], [0.26, 0.17, 1], [-0.26, 0.17, 1], [0, 0.00],
      [0.26, -0.17, 1], [-0.26, -0.17, 1], [0, -0.34]],
  };
  for (const sgn of [-1, 1]) {
    // Mirrored on the starboard side, or the number reads backwards from the
    // one beam and right from the other.
    const flip = sgn;
    for (const [digit, dz0] of [[4, 0.44], [8, -0.40]]) {
      for (const [dz, dy, up] of SEG[digit]) {
        box(g, mat(P.mark), 0.04, up ? 0.34 : 0.07, up ? 0.07 : 0.50,
          sgn * 1.66, base + 0.92 + dy, TZ + flip * (dz0 + dz));
      }
    }
  }

  // The jumping wires: the aerial running from the stem over the tower to the
  // stern. They are the boat's radio aerial and a net-deflector both, and they
  // are the only thing about her outline above the casing besides the tower.
  // Each one runs over an insulator on the tower and down to a fitting on the
  // casing at either end.
  for (const sgn of [-1, 1]) {
    cyl(g, M.bright, 0.07, 0.07, 0.22, sgn * 0.55, T_BRIDGE + 1.00, TZ - 2.25, 8);
  }
  for (const [z0, z1, y0, y1, x] of [
    [TZ - 2.25, 0.965 * HALF, T_BRIDGE + 1.12, deckAt(0.965 * HALF) + 0.34, 0.55],
    [TZ - 2.25, 0.965 * HALF, T_BRIDGE + 1.12, deckAt(0.965 * HALF) + 0.34, -0.55],
    [TZ - 2.25, -0.955 * HALF, T_BRIDGE + 1.12, deckAt(-0.955 * HALF) + 0.28, 0],
  ]) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const ya = y0 + (y1 - y0) * Math.pow(i / n, 0.75);
      const yb = y0 + (y1 - y0) * Math.pow((i + 1) / n, 0.75);
      const xa = x * (1 - i / n);
      const seg = box(g, M.steelDark, 0.045, 0.045, Math.hypot(zb - za, yb - ya),
        xa, (ya + yb) / 2, (za + zb) / 2);
      seg.rotation.x = -Math.atan2(yb - ya, zb - za);
    }
  }
}

/**
 * The inside of the conning tower.
 *
 * A Type VII's tower is not a bridge: it is a second pressure vessel standing
 * on the first, with a hatch down into the control room and another up on to
 * the bridge, and a man in it at action stations. What is in there is the
 * attack periscope's lower body, the aiming gear it drives, the helm repeater
 * and the ladder between the two hatches -- and it is in here for the same
 * reason a cruiser's bridge is furnished: a shell through the tower ought to
 * open on to the room, not on to a lit box.
 */
function towerInside(g) {
  const inside = new THREE.Group();
  inside.userData.inside = true;
  const FLOOR = T_BASE + 0.18;
  const ROOF = T_BRIDGE - 0.16;

  // The deck of the tower compartment, with the lower hatch through it, and
  // the underside of the bridge deck over it.
  box(inside, M.steelDark, 1.75, 0.09, 3.10, 0, FLOOR, TZ);
  box(inside, M.steelDark, 1.70, 0.09, 3.00, 0, ROOF, TZ);
  cyl(inside, M.cave, 0.34, 0.34, 0.10, 0, FLOOR + 0.06, TZ - 0.95, 12);
  cyl(inside, M.steelDark, 0.40, 0.40, 0.08, 0, ROOF - 0.06, TZ + 0.55, 12);

  // The attack periscope, which is the whole reason for the compartment: its
  // barrel comes down through the deck into the well below, and the layer sits
  // at it on a saddle that goes round with the scope.
  cyl(inside, M.steelDark, 0.11, 0.11, 2.00, 0.30, FLOOR + 1.02, TZ + 0.55, 10);
  cyl(inside, M.gunDark, 0.24, 0.24, 0.34, 0.30, FLOOR + 1.30, TZ + 0.55, 12);
  box(inside, M.gunDark, 0.30, 0.16, 0.46, 0.30, FLOOR + 1.16, TZ + 0.20);
  box(inside, M.steelDark, 0.34, 0.10, 0.34, 0.66, FLOOR + 0.62, TZ + 0.45);
  // And the sky periscope's barrel going up through the after end of it.
  cyl(inside, M.steelDark, 0.16, 0.16, 2.00, -0.34, FLOOR + 1.02, TZ - 0.40, 10);

  // The helm repeater and the two telegraphs on the forward bulkhead: she is
  // steered from down in the control room and conned from up here, and these
  // are what carries one to the other.
  cyl(inside, M.brass, 0.26, 0.26, 0.06, 0, FLOOR + 1.18, TZ + 1.32, 14)
    .rotation.x = Math.PI / 2;
  for (const sgn of [-1, 1]) {
    cyl(inside, M.steelDark, 0.10, 0.13, 0.80, sgn * 0.56, FLOOR + 0.40, TZ + 1.18, 10);
    cyl(inside, M.brass, 0.17, 0.17, 0.07, sgn * 0.56, FLOOR + 0.84, TZ + 1.18, 12);
  }

  // The torpedo-aiming calculator on the port side, and the plot board beside
  // it: a bearing and a range go in, a gyro angle goes down to the tubes.
  box(inside, M.steelDark, 0.26, 0.72, 0.90, -0.72, FLOOR + 0.44, TZ + 0.10);
  box(inside, M.bright, 0.05, 0.34, 0.50, -0.56, FLOOR + 0.74, TZ + 0.10);
  box(inside, M.steelDark, 0.24, 0.50, 0.70, 0.74, FLOOR + 0.33, TZ - 0.70);

  // The ladder between the two hatches, and the voicepipe beside it.
  for (let i = 0; i < 7; i++) {
    box(inside, M.steelDark, 0.44, 0.045, 0.045, -0.55,
      FLOOR + 0.18 + i * ((ROOF - FLOOR - 0.30) / 6), TZ - 0.72);
  }
  for (const sgn of [-1, 1]) {
    box(inside, M.steelDark, 0.05, ROOF - FLOOR - 0.20, 0.05,
      -0.55 + sgn * 0.22, (FLOOR + ROOF) / 2, TZ - 0.72);
  }
  cyl(inside, M.steelDark, 0.07, 0.07, ROOF - FLOOR - 0.2, -0.80, (FLOOR + ROOF) / 2, TZ - 1.05, 8);

  // The bench the watch below sits on, and the lamp over the chart shelf.
  box(inside, M.steelDark, 0.60, 0.09, 0.90, -0.30, FLOOR + 0.46, TZ - 1.05);
  box(inside, M.canvas, 0.18, 0.10, 0.18, 0.40, ROOF - 0.20, TZ - 0.10);
  g.add(inside);
}

// ------------------------------------------------------------------ guns --

/**
 * The 8.8 cm SK C/35 on the casing forward of the tower.
 *
 * A deck gun, which is a different animal from a ship's gun: no shield, no
 * turret, no director and no power. It stands on a pedestal on the casing,
 * it is trained and laid by hand by men standing in the open on a wet deck,
 * and the ready-use rounds come up through the hatch one at a time. It is for
 * a merchantman not worth a torpedo.
 */
function deckGun(g) {
  const z = 9.0;
  const y = deckAt(z);
  const m = new THREE.Group();
  m.position.set(0, y, z);
  m.userData.dynamic = true;
  m.userData.mounting = true;
  // The pedestal and the training ring.
  cyl(g, M.steelDark, 0.62, 0.72, 0.42, 0, y + 0.21, z, 14);
  cyl(m, M.gunDark, 0.50, 0.56, 0.30, 0, 0.45, 0, 14);
  // The saddle, the trunnion standards and the layer's seat.
  box(m, M.gun, 0.78, 0.42, 0.70, 0, 0.78, 0);
  for (const sgn of [-1, 1]) box(m, M.gun, 0.14, 0.52, 0.34, sgn * 0.40, 1.12, 0);
  box(m, M.gunDark, 0.30, 0.10, 0.36, -0.62, 0.92, -0.35);
  cyl(m, M.gunDark, 0.30, 0.30, 0.05, -0.72, 1.14, -0.15, 12).rotation.z = Math.PI / 2;

  // The gun itself, in its cradle: it elevates, so it is its own node.
  const guns = new THREE.Group();
  guns.position.set(0, 1.12, 0);
  guns.rotation.x = -0.05;
  tubeZ(guns, M.gunDark, 0.16, 0.72, 0, 0, 0.18, 12);     // breech ring
  box(guns, M.gunDark, 0.30, 0.30, 0.40, 0, 0, -0.30);    // breech
  tubeZ(guns, M.gun, 0.095, 3.30, 0, 0, 1.95, 12);        // chase
  tubeZ(guns, M.gunDark, 0.105, 0.16, 0, 0, 3.62, 12);    // muzzle swell
  // The recuperator over the barrel, which is what a C/35 has instead of a
  // shield and is the easiest way to tell one at a distance.
  tubeZ(guns, M.gunDark, 0.075, 1.30, 0, 0.20, 0.90, 8);
  m.add(guns);
  arm(m, guns, [[0, 0, 3.78]]);
  g.add(m);
  g.userData.turrets = [m];
  return [m];
}

/**
 * The 2 cm C/30 on the Wintergarten.
 *
 * One barrel on a pedestal mounting with a shoulder rest and a twenty-round
 * magazine standing up out of the receiver. Like the deck gun it is outside
 * the pressure hull and it drowns.
 */
function flak(g) {
  const z = -3.9;
  const y = T_WG + 0.12;
  const m = new THREE.Group();
  m.position.set(0, y, z);
  m.userData.dynamic = true;
  m.userData.mounting = true;
  cyl(m, M.gunDark, 0.22, 0.28, 0.30, 0, 0.15, 0, 12);
  box(m, M.gun, 0.34, 0.26, 0.30, 0, 0.42, 0);
  const guns = new THREE.Group();
  guns.position.set(0, 0.56, 0);
  guns.rotation.x = -0.30;
  box(guns, M.gunDark, 0.16, 0.18, 0.46, 0, 0, -0.10);    // receiver
  tubeZ(guns, M.gun, 0.032, 1.30, 0, 0, 0.82, 8);         // barrel
  tubeZ(guns, M.gunDark, 0.05, 0.16, 0, 0, 1.48, 8);      // flash hider
  box(guns, M.gunDark, 0.08, 0.30, 0.12, 0.14, 0.16, -0.05);  // the magazine
  box(guns, M.gunDark, 0.10, 0.10, 0.30, 0, -0.14, -0.34);    // shoulder rest
  m.add(guns);
  arm(m, guns, [[0, 0, 1.58]]);
  g.add(m);
  g.userData.aaMounts = [m];
  return [m];
}

// ----------------------------------------------------------------- tubes --

/**
 * The torpedo tubes: four in the bow and one in the stern.
 *
 * What is built here is the outer doors -- the bow caps -- and they are the
 * one thing on this boat that moves for a reason other than being aimed. A
 * tube is blown, the cap swings out of the way, the fish goes, and the cap
 * shuts again. They are their own nodes and the welder is told to leave them
 * alone, because a door baked into the casing is a door that never opens.
 *
 * `torpMounts` gets the two banks, so the simulation has something to fire
 * from and the muzzles are where the doors are.
 */
function tubes(g) {
  const caps = { bow: [], stern: [] };
  const mounts = [];

  // The bow: four doors in two pairs, one pair above the other, which is how a
  // Type VII's are arranged. They are well down the stem and well under water,
  // so each one is set on the shell at its own height rather than on a flat
  // face -- a tube door standing off the plating is a door on the wrong boat.
  const bt = 0.855;
  const bz = bt * HALF;
  const bow = new THREE.Group();
  bow.position.set(0, 0, bz);
  bow.userData.dynamic = true;
  bow.userData.mounting = true;
  const bores = [];
  for (const [side, dy] of [[-1, -1.05], [1, -1.05], [-1, -2.05], [1, -2.05]]) {
    const dx = side * Math.max(0.34, shellAt(bt, dy) - 0.30);
    bores.push([dx, dy, 0.62]);
    // The tube mouth, recessed into the bow.
    cyl(bow, M.cave, 0.28, 0.28, 0.34, dx, dy, 0.30, 12).rotation.x = Math.PI / 2;
    cyl(bow, M.steelDark, 0.35, 0.35, 0.16, dx, dy, 0.44, 12).rotation.x = Math.PI / 2;
    // And the door, hinged outboard so it swings clear of the mouth.
    const hinge = new THREE.Group();
    hinge.position.set(dx + side * 0.33, dy, 0.52);
    hinge.userData.dynamic = true;
    const leaf = cyl(hinge, M.steel, 0.33, 0.33, 0.09, -side * 0.33, 0, 0, 12);
    leaf.rotation.x = Math.PI / 2;
    box(hinge, M.steelDark, 0.10, 0.12, 0.12, -side * 0.06, 0, 0.04);
    bow.add(hinge);
    caps.bow.push({ node: hinge, hand: side });
  }
  arm(bow, bow, bores);
  g.add(bow);
  mounts.push(bow);

  // And the one aft, on the centreline between the screws.
  const st = -0.872;
  const sz = st * HALF;
  const sy = -1.55;
  const stern = new THREE.Group();
  stern.position.set(0, 0, sz);
  stern.userData.dynamic = true;
  stern.userData.mounting = true;
  cyl(stern, M.cave, 0.28, 0.28, 0.34, 0, sy, -0.30, 12).rotation.x = Math.PI / 2;
  cyl(stern, M.steelDark, 0.35, 0.35, 0.16, 0, sy, -0.44, 12).rotation.x = Math.PI / 2;
  const sh = new THREE.Group();
  sh.position.set(0.33, sy, -0.52);
  sh.userData.dynamic = true;
  cyl(sh, M.steel, 0.33, 0.33, 0.09, -0.33, 0, 0, 12).rotation.x = Math.PI / 2;
  stern.add(sh);
  caps.stern.push({ node: sh, hand: 1 });
  arm(stern, stern, [[0, sy, -0.62]]);
  g.add(stern);
  mounts.push(stern);

  g.userData.torpMounts = mounts;
  g.userData.tubeCaps = caps;
  return { mounts, caps };
}

// -------------------------------------------------------------- fittings --

/**
 * Everything else on her outside: the net cutter on the stem, the diving
 * planes fore and aft, the capstan, the bollards, the hatches a boat is
 * stored and boarded through, and the ready-use ammunition locker for the
 * deck gun.
 */
function fittings(g) {
  // The net cutter: a serrated blade along the top of the stem, for cutting
  // through harbour nets. Early-war boats all carried one.
  for (let i = 0; i < 9; i++) {
    const t = 0.88 + (0.11 * i) / 8;
    const z = t * HALF;
    const y = deckAt(z) - 0.1 + 0.5 * (i / 8);
    box(g, M.steelDark, 0.09, 0.34 - 0.02 * i, 0.42, 0, y, z);
  }

  // The diving planes: the forward pair out of the casing at the bow and the
  // after pair beside the screws. They are what she is held down by -- a
  // submarine at depth is flying, not floating.
  for (const sgn of [-1, 1]) {
    const fz = 0.70 * HALF;
    const fp = box(g, M.steelDark, 1.55, 0.13, 1.05,
      sgn * (shellAt(0.70, -1.55) + 0.70), -1.55, fz);
    fp.rotation.z = sgn * 0.05;
    const az = -0.82 * HALF;
    const ap = box(g, M.steelDark, 1.75, 0.13, 1.25,
      sgn * (shellAt(-0.82, -1.85) + 0.78), -1.85, az);
    ap.rotation.z = sgn * 0.05;
  }

  // The capstan and the bollards forward, and the bollards aft.
  cyl(g, M.steelDark, 0.24, 0.28, 0.30, 0, deckAt(0.80 * HALF) + 0.15, 0.80 * HALF, 12);
  for (const sgn of [-1, 1]) {
    for (const t of [0.74, -0.74]) {
      const z = t * HALF;
      box(g, M.steelDark, 0.30, 0.22, 0.16, sgn * (halfDeck(z) - 0.22), deckAt(z) + 0.11, z);
    }
  }

  // The hatches: the fore-ends torpedo loading hatch, the galley hatch and the
  // engine-room hatch. A boat is stored through these and they are on the
  // casing where the deck is widest.
  for (const [z, w] of [[0.55 * HALF, 0.62], [-0.30 * HALF, 0.50], [-0.62 * HALF, 0.54]]) {
    cyl(g, M.steelDark, w / 2, w / 2, 0.12, 0, deckAt(z) + 0.08, z, 14);
    cyl(g, M.gunDark, w / 2 - 0.09, w / 2 - 0.09, 0.08, 0, deckAt(z) + 0.15, z, 14);
  }

  // The ready-use locker for the deck gun, which is the only thing on the
  // casing forward of the tower besides the gun itself.
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 0.48, 0.30, 0.78, sgn * 0.86, deckAt(6.6) + 0.15, 6.6);
    box(g, M.steelDark, 0.40, 0.05, 0.70, sgn * 0.86, deckAt(6.6) + 0.32, 6.6);
  }

  // Her number goes on the tower, and it is painted there -- see tower().
}

/** Twin screws on twin shafts, twin rudders, and the after planes' guards. */
function screws(g) {
  for (const [x, hand] of [[-1.15, -1], [1.15, 1]]) {
    const z = -0.90 * HALF;
    tubeZ(g, M.gunDark, 0.16, 3.4, x, -1.95, z + 2.1, 10);
    // The bracket carrying the shaft out of the hull.
    const br = box(g, M.hull, 0.22, 1.2, 0.48, x, -1.55, z + 1.3);
    br.rotation.z = -Math.sign(x) * 0.26;
    const hub = new THREE.Group();
    hub.position.set(x, -1.95, z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.26, 0.16, 0.30, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, 0.50, 0.065, 0.86,
        Math.sin(a) * 0.42, Math.cos(a) * 0.42, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.40;
    }
    g.add(hub);
  }
  // Two rudders, one behind each screw, which is what gives a Type VII her
  // turning circle on the surface.
  for (const x of [-1.15, 1.15]) {
    box(g, M.gunDark, 0.12, 1.70, 1.05, x, -1.90, -0.952 * HALF);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['pressureHull', pressureHull],
  ['outerHull', outerHull],
  ['casing', casing],
  ['tower', tower],
  ['towerInside', towerInside],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildUboat() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides. A boat is one long tube of compartments with no bulkhead deck
  // and no citadel: fore-ends, forward berthing, control room, engine room,
  // motor room, after-ends. The interior builder wants a ship's lines, so it
  // is given the pressure hull's -- which is the only part of her that has an
  // inside at all.
  buildInterior(g, {
    loa: LOA,
    shellAt: (t, y) => {
      const r = hullR(t);
      const dy = y - PY;
      if (Math.abs(dy) >= r) return 0.02;
      return Math.sqrt(Math.max(0, r * r - dy * dy)) * 0.94;
    },
    keelY: (t) => PY - hullR(t) * 0.94,
    sheer: (t) => PY + hullR(t) * 0.88,
    zAt: (t) => t * HALF,
  });
  mergeStatic(g, bySection(LOA));
  const turrets = deckGun(g);
  const aaMounts = flak(g);
  const { mounts: torpMounts, caps } = tubes(g);
  mergeMoving(g);
  g.userData.classId = 'u48';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckAt(0),
    secMounts: [], aaMounts, torpMounts,
    // The bow caps, for the client to swing when a tube fires.
    tubeCaps: caps,
  };
}

export function uboatParts() {
  const parts = [];
  const builders = [...STATIC, ['deckGun', deckGun], ['flak', flak], ['tubes', tubes]];
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
