// FS Surcouf: the croiseur sous-marin, built off her own drawings.
//
// She is the largest submarine in the world from 1934 until the Japanese build
// the I-400s, and every odd thing about her comes from one idea: a submarine
// that raids commerce has to be able to stop a ship and search her, and a
// periscope cannot do that. So she is given a cruiser's gun, a cruiser's
// rangefinder to lay it with, an aeroplane to find something to point it at,
// and a hold to put the crews in afterwards. Three thousand three hundred
// tonnes of submarine, a hundred and ten metres long, and nothing else afloat
// looks remotely like her.
//
// What is on her, bow to stern:
//
//   the casing    a planked wooden deck on top of the saddle tanks, running
//                 nearly her whole length. It is what the crew stand on and
//                 it is the thing that makes her read as long: a black-grey
//                 strip of it, then the turret, then the tower, then eighty
//                 feet of nothing.
//   the turret    two 203 mm/50 Mle 1924 in the Modele 1929 pressure-tight
//                 mounting, forward of the tower. Minus five to plus thirty,
//                 ninety degrees of train either side, three rounds a minute,
//                 sixty rounds a gun, and a five-metre rangefinder let into
//                 the back of the roof lying fore-and-aft so it streamlines
//                 under water. It is the largest gun ever carried by a
//                 submarine.
//   the tower     slab-sided, with the bridge on top, the periscope standards
//                 abaft it and the big rangefinder across the after end. Her
//                 pennant, 17P, is painted on both sides of it.
//   the hangar    a pressure-tight cylinder let into the after end of the
//                 tower, with a Besson MB.411 folded inside and rails on the
//                 casing to wheel her out along.
//   the derrick   which picks the aeroplane up and puts her in the water. It
//                 is the reason the whole arrangement is a bad idea: it takes
//                 twenty minutes at sea and the boat lies on the surface with
//                 a hole open in her for all of it.
//   the tubes     four 55 cm in the bow inside the pressure hull, and abaft
//                 the tower two trainable external mounts, each one a 55 cm
//                 tube with a pair of 40 cm alongside. Nothing else afloat in
//                 1940 can point a torpedo without pointing the whole boat.
//
// Everything is metres and y = 0 is the surfaced waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, ladder, loftRings } from './shipkit.js';
import { arm } from './mounts.js';
import { besson } from './planekit.js';

const CLS = SHIP_CLASSES.surcouf;
export const LOA = CLS.hull.length;      // 110 m
export const BEAM = CLS.hull.beam;       // 9 m
export const DRAFT = CLS.hull.draft;     // 7.25 m
const HALF = LOA / 2;

// Her paint, which is the first thing the references settle and the thing the
// model had wrong.
//
// Every drawing and every built model of her shows the same three bands: red
// oxide antifouling up to the surfaced waterline, a black boot topping across
// it, and Gris Bleu above -- with the casing deck planked in wood and left the
// colour wood goes, which on a boat that spends her life awash is a pale
// silvered grey-brown rather than anything like teak on a battleship.
const P = {
  light: 0x939aa2,         // topsides, tower, turret
  hull: 0x6b727a,          // her sides down to the boot topping
  hullDark: 0x474e56,      // the pressure hull, seen only in a cutaway
  boot: 0x16181c,          // the boot topping at the surfaced waterline
  antifoul: 0x7d3128,      // red oxide, which is what she actually wore
  plank: 0x8b8272,         // the casing decking: salt-bleached wood
  plankDark: 0x736b5d,     // the gratings and the king plank
  deckSteel: 0x4d535a,
  steel: 0x848c94,
  steelDark: 0x4f565e,
  bright: 0x9ea6ae,
  gun: 0x7a828a,
  gunDark: 0x3a4046,
  canvas: 0x7b7b70,
  glass: 0x222e38,
  cave: 0x0d1015,
  brass: 0x8a7340,
  mark: 0xd6dade,
  // The tricolour on her after bridge rail, which is how you tell her from a
  // grey submarine at a distance in every photograph there is of her.
  flagBlue: 0x24417c,
  flagWhite: 0xd8dce0,
  flagRed: 0xa8302c,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

/** The top of her saddle tanks, stern at t = -1 to stem at t = +1. */
const DECKLINE = [
  [-1.00, 1.05], [-0.90, 1.58], [-0.76, 1.90], [-0.58, 2.04], [-0.36, 2.12],
  [-0.12, 2.16], [0.10, 2.18], [0.32, 2.26], [0.50, 2.46], [0.66, 2.84],
  [0.80, 3.24], [0.90, 3.56], [0.96, 3.74], [1.00, 3.82],
];

/** Her keel: seven and a quarter metres down amidships, sweeping up at both ends. */
const KEEL = [
  [-1.00, -0.80], [-0.92, -2.95], [-0.82, -4.50], [-0.68, -5.82], [-0.50, -6.68],
  [-0.28, -7.15], [0.00, -7.25], [0.26, -7.20], [0.46, -6.95], [0.62, -6.40],
  [0.76, -5.38], [0.87, -4.05], [0.95, -2.30], [1.00, -0.55],
];

/** Her greatest half-breadth, over the saddle tanks. */
const HALFB = [
  [-1.00, 0.20], [-0.90, 1.44], [-0.78, 2.55], [-0.62, 3.52], [-0.42, 4.18],
  [-0.20, 4.46], [0.02, 4.50], [0.24, 4.44], [0.42, 4.18], [0.58, 3.70],
  [0.72, 2.98], [0.84, 2.12], [0.93, 1.10], [1.00, 0.18],
];

/** A submarine's section is widest under water, not at the deck. */
const SECTION = [
  [0.00, 0.060], [0.06, 0.32], [0.14, 0.55], [0.24, 0.75], [0.36, 0.90],
  [0.48, 0.972], [0.58, 1.000], [0.68, 0.994], [0.78, 0.955], [0.86, 0.896],
  [0.93, 0.800], [1.00, 0.690],
];

/** The pressure hull: a cylinder five and a half metres across, coned at both ends. */
const PRESSURE = [
  [-1.00, 0.00], [-0.93, 0.32], [-0.84, 0.58], [-0.72, 0.78], [-0.60, 0.90],
  [-0.46, 0.97], [-0.30, 1.00], [0.00, 1.00], [0.24, 1.00], [0.38, 0.98],
  [0.50, 0.93], [0.62, 0.84], [0.73, 0.71], [0.83, 0.54], [0.92, 0.36],
  [0.97, 0.19], [1.00, 0.00],
];
const R = 2.75;
const PY = -3.10;

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

export function hullR(t) { return lerpAt(PRESSURE, t) * R; }
export function keelAt(t) { return lerpAt(KEEL, t); }
export function sheerAt(t) { return lerpAt(DECKLINE, t); }
export function outerR(t) { return lerpAt(HALFB, t); }
function sectionF(v) { return lerpAt(SECTION, Math.max(0, Math.min(1, v))); }

/** Her half-breadth at a station and a height: the shell itself. */
export function shellAt(t, y) {
  const k = keelAt(t);
  const d = sheerAt(t);
  if (d - k < 0.01) return 0.02;
  return outerR(t) * sectionF((y - k) / (d - k));
}

/** The top of her saddle tanks at a point along her, in metres from amidships. */
export function deckAt(z) { return sheerAt(Math.max(-1, Math.min(1, z / HALF))); }

// The casing: the wooden deck that stands on top of the tanks.
//
// It is a separate structure from the hull and it has to be, because it is
// what you see of her. The tanks are round and awash; the casing is a flat
// planked walkway with vertical sides standing on top of them, and the line
// where the two meet is the line that runs the length of every photograph of
// her.
const CASE_FWD = 48.0;
const CASE_AFT = -47.0;
const CASE_RISE = 0.44;

// The hangar, and the height of the two gun platforms on the tower. Both are
// written here because the light battery stands on them and has to know where
// they are: a gun floating a foot above its own platform is the commonest way
// a model of a warship goes wrong.
const HANGAR_Z = -13.2;
const HANGAR_R = 1.98;
const AA_BRIDGE = 3.55;

/** The top of the casing deck at a station, where there is casing. */
export function casingY(z) { return deckAt(z) + CASE_RISE; }

/** How wide the casing is at a station: widest amidships, drawn out at both ends. */
export function casingHalf(z) {
  if (z > CASE_FWD || z < CASE_AFT) return 0;
  const t = z >= 0 ? z / CASE_FWD : z / CASE_AFT;
  // Full width for the middle two thirds of her and then tapered away, which
  // is how a casing is built: it is a fairing over the tanks and it stops
  // where the tanks stop being worth fairing.
  const k = Math.min(1, Math.max(0, (1 - t) / 0.34));
  const w = 2.62 * (k * k * (3 - 2 * k));
  return Math.min(w, Math.max(0.25, outerR(z / HALF) - 0.55));
}

// ------------------------------------------------------------- the hull --

/**
 * One band of her side: a strip of shell between two heights, port and
 * starboard, closed at both ends.
 *
 * She is painted in bands and the bands are separate meshes, which is not how
 * it was written first. The first version lofted the whole shell once and
 * coloured it in the vertices -- which reads beautifully in the geometry and
 * is drawn white, because the weld that bakes a ship down to one buffer per
 * material carries position, normal and texture coordinates and nothing else.
 * A colour attribute goes in and does not come out. So: one loft per band, one
 * material each, and the boundaries land exactly on the waterlines they are
 * supposed to land on instead of being interpolated across a row.
 */
function hullBand(g, m, y0of, y1of, rows, capTop = false) {
  const STATIONS = 60;
  const pos = [];
  const idx = [];
  for (let s = 0; s <= STATIONS; s++) {
    const t = -1 + (2 * s) / STATIONS;
    const a = y0of(t);
    const b = y1of(t);
    for (let r = 0; r <= rows; r++) {
      const y = a + (b - a) * (r / rows);
      pos.push(shellAt(t, y), y, t * HALF);
    }
  }
  const at = (s, r) => s * (rows + 1) + r;
  // Both sides, so the shell is closed: mirrored in x as it is written.
  const half = pos.length / 3;
  for (let i = 0; i < half; i++) {
    pos.push(-pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }
  for (let s = 0; s < STATIONS; s++) {
    for (let r = 0; r < rows; r++) {
      const a = at(s, r);
      const b = at(s + 1, r);
      const c = at(s + 1, r + 1);
      const e = at(s, r + 1);
      // Wound so the starboard sheet's normals point to starboard and the
      // port sheet's to port. Wound the other way -- which is how this was
      // written -- the whole shell faces inward: it still draws, because what
      // you are then looking at is the inside of her far side, and it looks
      // enough like a hull to pass. What gives it away is that her insides
      // draw in front of it wherever they come near the centreline, and that
      // a rope's-end raycast into her side goes straight through.
      idx.push(a, c, b, a, e, c);
      idx.push(half + a, half + b, half + c, half + a, half + c, half + e);
    }
  }
  // The flat of the tank tops between the two sides, on the topmost band only.
  if (capTop) {
    for (let s = 0; s < STATIONS; s++) {
      const a = at(s, rows);
      const b = at(s + 1, rows);
      idx.push(a, half + a, b, b, half + a, half + b);
    }
  }
  // Both ends, closed.
  //
  // A loft is a tube: written without these it is open at the stem and the
  // stern, and what you see there is the inside of her lit from the wrong side
  // -- a flat white sheet where her transom should be. She is a hundred and
  // ten metres long and both of her ends are in shot most of the time.
  for (const [s, wind] of [[0, false], [STATIONS, true]]) {
    for (let r = 0; r < rows; r++) {
      const a = at(s, r);
      const b = at(s, r + 1);
      if (wind) idx.push(a, b, half + b, a, half + b, half + a);
      else idx.push(a, half + b, b, a, half + a, half + b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/**
 * The outside of her: saddle tanks, shell and all, lofted station by station.
 *
 * Four bands up her side, because that is how she was painted and because it
 * is what stops a long grey hull reading as a tube: red oxide antifouling to
 * the surfaced waterline, a narrow black boot topping across it, her Gris Bleu
 * above that, and the tank tops themselves a darker grey because they are
 * awash half the time and nobody paints them twice.
 */
const BOOT_LO = -0.62;
const BOOT_HI = 0.34;
function hull(g) {
  hullBand(g, M.antifoul, keelAt, () => BOOT_LO, 6);
  hullBand(g, M.boot, () => BOOT_LO, () => BOOT_HI, 1);
  hullBand(g, M.hull, () => BOOT_HI, (t) => sheerAt(t) - 0.30, 5);
  hullBand(g, M.deckSteel, (t) => sheerAt(t) - 0.30, sheerAt, 1, true);

  // The free-flooding slots down both sides of the tanks: a long row of them
  // just under the casing line, which is what a saddle-tank boat has instead
  // of a smooth side and what tells the eye she is a submarine and not a very
  // low ship.
  for (let z = -HALF + 14; z < HALF - 16; z += 1.55) {
    const t = z / HALF;
    const y = sheerAt(t) - 0.85;
    const w = shellAt(t, y);
    for (const sgn of [-1, 1]) box(g, M.cave, 0.07, 0.34, 0.80, sgn * w, y, z);
  }
}

// ----------------------------------------------------------- the casing --

/**
 * The planked wooden deck on top of the tanks, and the sides it stands on.
 *
 * Lofted the same way the hull is, as a strip with a flat top and vertical
 * sides, so it takes the same wood texture the Iowa's teak takes and reads as
 * planking rather than as a painted stripe. This is the single largest thing
 * about her appearance and the model did not have it at all: she was a grey
 * tube with a grey line down the middle.
 */
function casing(g) {
  const STATIONS = 84;
  // Two meshes rather than one: the deck is wood and the skirt under it is
  // painted steel, and the surface a thing is made of is chosen off the colour
  // of the material it is built with (see textures.js). One mesh in two
  // colours would be one surface, and the planking would come out as steel.
  const deck = { pos: [], idx: [] };
  const skirt = { pos: [], idx: [] };
  for (let sN = 0; sN <= STATIONS; sN++) {
    const z = CASE_AFT + ((CASE_FWD - CASE_AFT) * sN) / STATIONS;
    const hw = casingHalf(z);
    const yTop = casingY(z);
    const yBot = deckAt(z) - 0.12;
    deck.pos.push(-hw, yTop, z, hw, yTop, z);
    skirt.pos.push(-hw, yTop, z, hw, yTop, z, hw, yBot, z, -hw, yBot, z);
  }
  for (let sN = 0; sN < STATIONS; sN++) {
    const a = sN * 2;
    const b = (sN + 1) * 2;
    deck.idx.push(a + 0, b + 1, a + 1, a + 0, b + 0, b + 1);
    const c = sN * 4;
    const d = (sN + 1) * 4;
    // The two sides, wound outward, and the underside so she is closed.
    skirt.idx.push(c + 1, d + 2, c + 2, c + 1, d + 1, d + 2);
    skirt.idx.push(c + 3, d + 3, d + 0, c + 3, d + 0, c + 0);
    skirt.idx.push(c + 2, d + 3, c + 3, c + 2, d + 2, d + 3);
  }
  // Shut both ends of the skirt, or you see the inside of it from ahead.
  for (const [r, wind] of [[0, true], [STATIONS * 4, false]]) {
    if (wind) skirt.idx.push(r + 0, r + 1, r + 2, r + 0, r + 2, r + 3);
    else skirt.idx.push(r + 0, r + 2, r + 1, r + 0, r + 3, r + 2);
  }
  for (const [part, m] of [[deck, M.plank], [skirt, M.deckSteel]]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
    geo.setIndex(part.idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }

  // The seams a wooden deck is laid in: a king plank down the middle and the
  // butts across her. They are what give the eye something to measure a
  // hundred and ten metres against, and without them the casing is a ramp.
  for (let z = CASE_AFT + 1.2; z < CASE_FWD - 1.2; z += 1.15) {
    const hw = casingHalf(z);
    if (hw < 0.5) continue;
    box(g, M.plankDark, hw * 1.90, 0.02, 0.07, 0, casingY(z) + 0.012, z);
  }
  for (let z = CASE_AFT + 1; z < CASE_FWD - 1; z += 0.9) {
    const hw = casingHalf(z);
    if (hw < 0.5) continue;
    box(g, M.plankDark, 0.07, 0.02, 0.80, 0, casingY(z) + 0.012, z);
  }
}

/**
 * A wire between two points, lying along the line between them.
 *
 * The guard rails and the jumping wires are the two things on her that run the
 * length of the ship, and a cylinder placed at the midpoint and then rotated
 * about two axes in turn does not lie along a chord: it lies somewhere else,
 * and the rails came out crossing her deck diagonally. This is the one way to
 * do it -- build it up the Y axis, then turn Y onto the chord.
 */
const A = new THREE.Vector3();
const B = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function wire(g, m, a, b, r = 0.024, seg = 5) {
  A.set(a[0], a[1], a[2]);
  B.set(b[0], b[1], b[2]);
  const len = A.distanceTo(B);
  if (len < 1e-4) return null;
  const o = cyl(g, m, r, r, len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2, seg);
  o.quaternion.setFromUnitVectors(UP, B.sub(A).normalize());
  return o;
}

// ------------------------------------------------------------ the turret --

/**
 * Two 203 mm/50 Mle 1924 in the Modele 1929 mounting, forward of the tower.
 *
 * A cruiser's guns on a submarine, in a mounting built to be shut and dived
 * with: watertight all round, the two guns two metres sixty apart on one
 * cradle because they are not separately sleeved, muzzle tampions that are
 * worked from inside, and the five-metre rangefinder let into the back of the
 * roof lying fore-and-aft rather than athwartships -- because athwartships it
 * would be two arms sticking out into the water at eighteen knots.
 *
 * Minus five to plus thirty, and ninety degrees of train either side. Two and
 * a half minutes from the order to surface to the first round.
 */
function mainTurret(g) {
  const Z = CLS.turrets[0].z;
  const base = casingY(Z);
  const t = new THREE.Group();
  t.position.set(0, base, Z);
  t.userData.dynamic = true;

  // The barbette: pressure-tight, and it goes down into the hull rather than
  // standing on it -- the turret is part of the pressure envelope.
  cyl(t, M.steelDark, 2.42, 2.52, 1.40, 0, -0.62, 0, 22);
  cyl(t, M.light, 2.36, 2.42, 0.42, 0, 0.20, 0, 22);
  // The ring of clips that hold the mounting down to it.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    box(t, M.steelDark, 0.16, 0.10, 0.16,
      Math.sin(a) * 2.40, 0.42, Math.cos(a) * 2.40, a);
  }

  // The gunhouse. Rounded everywhere, because it has to be pushed through the
  // water at eighteen knots and then dived: a cruiser's slab-sided turret
  // would be a sea anchor and a pressure trap both.
  loftRings(t, M.light, [
    [2.20, 2.74, -0.60, 0.40],
    [2.34, 2.90, -0.55, 0.80],
    [2.32, 2.88, -0.50, 2.00],
    [2.18, 2.74, -0.46, 2.72],
    [1.96, 2.48, -0.44, 3.00],
  ], { n: 24, px: 0.66, pz: 0.70 });
  // The face: a flat plate the guns come through, sloped back a little. A
  // mounting that is round all over has nowhere for the guns to come out of,
  // and what you get is two barrels growing out of a pebble.
  const face = box(t, M.light, 3.60, 2.30, 0.28, 0, 1.70, 2.26);
  face.rotation.x = -0.10;
  box(t, M.steel, 3.72, 0.16, 0.34, 0, 2.86, 2.16);
  box(t, M.steel, 0.20, 2.30, 0.36, 1.78, 1.70, 2.20);
  box(t, M.steel, 0.20, 2.30, 0.36, -1.78, 1.70, 2.20);

  // The five-metre rangefinder, lying fore-and-aft in the roof with a hood at
  // each end: the thing that lets her shoot at twelve thousand metres instead
  // of at what a periscope can see.
  box(t, M.steel, 0.62, 0.40, 4.90, 0, 3.16, -1.10);
  for (const dz of [1.70, -3.90]) {
    const hood = cyl(t, M.gunDark, 0.26, 0.26, 0.34, 0, 3.16, dz, 12);
    hood.rotation.x = Math.PI / 2;
  }
  // The trainer's and layer's sighting hoods either side of the face.
  for (const sgn of [-1, 1]) {
    loftRings(t, M.steel, [
      [0.34, 0.40, 0.70, 2.50],
      [0.36, 0.42, 0.70, 2.86],
      [0.26, 0.32, 0.70, 3.02],
    ], { n: 12, px: 0.6, pz: 0.6 });
    box(t, M.glass, 0.12, 0.14, 0.34, sgn * 1.62, 2.74, 1.00);
  }
  // The access hatch in the roof and the ready-use lockers on the quarters.
  cyl(t, M.steelDark, 0.44, 0.44, 0.10, 0.90, 3.10, -2.40, 14);
  for (const sgn of [-1, 1]) box(t, M.steel, 0.30, 0.52, 0.80, sgn * 1.92, 1.00, -2.70);

  // The cradle, which elevates. Both guns on it, because they are not
  // separately sleeved: she lays them together or not at all.
  //
  // Fifty calibres of gun: ten metres and a sixth of bore. About three of that
  // is breech and slide behind the trunnions, so seven and a half stands out
  // ahead of them -- which is `reach` on her datasheet, and which is measured
  // off this and not guessed. She is a long, thin, unmistakable barrel, and
  // the reason she looks wrong on a submarine is that she is not out of scale:
  // the submarine is.
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.62, 0.10);
  t.add(cradle);
  const muzzles = [];
  for (const x of [-1.30, 1.30]) {
    // The trunnion block, the slide, and the recoil cylinders over the barrel.
    box(cradle, M.gunDark, 0.72, 0.72, 1.60, x, 0, -0.50);
    cyl(cradle, M.steel, 0.30, 0.34, 1.20, x, 0.05, 0.62, 12).rotation.x = Math.PI / 2;
    for (const dy of [0.30, -0.26]) {
      tubeZ(cradle, M.gunDark, 0.085, 1.50, x, dy, 0.80, 8);
    }
    tubeZ(cradle, M.gun, 0.155, 5.00, x, 0.02, 3.10, 14);
    tubeZ(cradle, M.gun, 0.125, 1.90, x, 0.02, 6.55, 14);
    // The muzzle and its tampion, which is worked from inside the turret and
    // is what lets her dive with the guns loaded.
    cyl(cradle, M.gunDark, 0.145, 0.145, 0.34, x, 0.02, 7.38, 14)
      .rotation.x = Math.PI / 2;
    cyl(cradle, M.steelDark, 0.11, 0.11, 0.08, x, 0.02, 7.56, 12)
      .rotation.x = Math.PI / 2;
    muzzles.push([x, 0.02, 7.56]);
    // The blast bag where the gun comes through the face, which is what keeps
    // the sea out of a gunhouse that has to be dived with.
    cyl(cradle, M.canvas, 0.50, 0.36, 0.90, x, 0.02, 2.30, 12)
      .rotation.x = Math.PI / 2;
  }
  arm(t, cradle, muzzles);
  g.add(t);
  return [t];
}

// -------------------------------------------------------------- the tower --

/** Her pennant, 17P, stencilled on both sides of the tower. */
function pennant(g, base, Z) {
  // Segments of a character, as [dz, dy, long-ways?]: the shape a stencil cuts.
  const SEG = {
    1: [[0.22, 0.17, 1], [0.22, -0.17, 1]],
    7: [[0, 0.34], [0.22, 0.17, 1], [0.22, -0.17, 1]],
    P: [[0, 0.34], [0.22, 0.17, 1], [-0.22, 0.17, 1], [0, 0.00], [-0.22, -0.17, 1]],
  };
  for (const sgn of [-1, 1]) {
    for (const [ch, dz0] of [['1', 0.62], ['7', 0.00], ['P', -0.64]]) {
      for (const [dz, dy, up] of SEG[ch]) {
        // Mirrored on the starboard side, or the pennant reads backwards from
        // one beam and right from the other.
        box(g, M.mark, 0.05, up ? 0.40 : 0.08, up ? 0.08 : 0.50,
          sgn * 2.06, base + 1.75 + dy * 1.15, Z + sgn * (dz0 + dz));
      }
    }
  }
}

/**
 * Her conning tower: the bridge, the periscope standards and the rangefinder.
 *
 * Tall and slab-sided because there is a hangar inside the after end of it and
 * a hatch down through the middle, and because she needed the height to put a
 * rangefinder where it could see anything at all. Five metres off the water is
 * what she has, and it is the reason her guns outrange her own eyes.
 */
function tower(g) {
  const Z = -2.0;
  const base = casingY(Z);
  // The tower proper, with the step in it where the bridge deck sits.
  loftRings(g, M.light, [
    [2.10, 5.60, Z, base - 0.30],
    [2.16, 5.75, Z, base + 0.30],
    [2.12, 5.66, Z, base + 3.70],
    [1.92, 5.10, Z, base + 4.45],
  ], { n: 22, px: 0.56, pz: 0.68 });
  // The bulwark round the bridge, open at the after end where the ladder
  // comes up, and the wind deflector along its top.
  loftRings(g, M.steel, [
    [1.62, 2.55, Z + 1.5, base + 4.45],
    [1.68, 2.62, Z + 1.5, base + 4.70],
    [1.60, 2.50, Z + 1.5, base + 5.66],
  ], { n: 20, px: 0.54, pz: 0.64 });
  box(g, M.bright, 3.24, 0.06, 0.28, 0, base + 5.74, Z + 3.80).rotation.x = -0.34;
  // The binnacle and the voice pipes on the bridge floor.
  cyl(g, M.steelDark, 0.20, 0.24, 0.72, 0, base + 4.81, Z + 2.55, 10);
  for (const sgn of [-1, 1]) {
    cyl(g, M.steel, 0.09, 0.09, 0.90, sgn * 0.95, base + 4.90, Z + 1.20, 8);
  }

  // The periscope standards abaft the bridge: the attack periscope forward and
  // the search periscope behind it, which is the order every boat has them in.
  for (const [x, dz, h] of [[0.40, -0.70, 3.40], [-0.40, -1.70, 2.85]]) {
    cyl(g, M.gunDark, 0.135, 0.135, h, x, base + 4.55 + h / 2, Z + dz, 10);
    // The head, which is the only part of her that is ever above water when
    // she is fighting properly.
    box(g, M.gunDark, 0.24, 0.30, 0.34, x, base + 4.55 + h + 0.12, Z + dz);
  }
  // Her wireless mast, stepped on the after end of the bridge.
  cyl(g, M.steel, 0.10, 0.13, 2.80, 0, base + 5.30 + 1.40, Z - 2.55, 8);

  // The big rangefinder across the after end of the bridge, on its own pedestal
  // and turning with it: eight metres of base, which is a light cruiser's.
  const rf = new THREE.Group();
  rf.position.set(0, base + 5.30, Z - 3.60);
  g.add(rf);
  cyl(rf, M.steelDark, 0.46, 0.54, 0.62, 0, 0.31, 0, 14);
  loftRings(rf, M.steel, [
    [0.70, 0.62, 0, 0.62],
    [0.76, 0.68, 0, 0.80],
    [0.66, 0.58, 0, 1.36],
  ], { n: 14, px: 0.6, pz: 0.6 });
  box(rf, M.steel, 5.40, 0.44, 0.48, 0, 1.18, 0);
  for (const sgn of [-1, 1]) {
    cyl(rf, M.gunDark, 0.25, 0.25, 0.30, sgn * 2.70, 1.18, 0, 12)
      .rotation.z = Math.PI / 2;
  }

  // The two gun platforms abaft the bridge, one each side, bracketed off the
  // tower: this is where her machine guns live and it is why they fight on
  // their own beam and not across her.
  for (const sgn of [-1, 1]) {
    const px = sgn * 2.15;
    const pz = Z - 4.20;
    loftRings(g, M.steel, [
      [0.96, 1.10, pz, base + AA_BRIDGE - 0.14],
      [1.02, 1.16, pz, base + AA_BRIDGE],
      [1.02, 1.16, pz, base + AA_BRIDGE + 0.58],
    ], { n: 14, px: 0.6, pz: 0.66, cap: false, floor: true }).position.x = px;
    // The brackets under it, back into the tower side.
    for (const dz of [-0.7, 0.7]) {
      const br = cyl(g, M.steelDark, 0.07, 0.09, 1.50,
        sgn * 1.62, base + AA_BRIDGE - 0.60, pz + dz, 6);
      br.rotation.z = sgn * 0.62;
    }
  }

  // The ladder up the after face, and the hatch at the foot of it.
  ladder(g, M.bright, 0, base + 0.15, base + 4.35, Z - 5.30, Z - 5.60);
  cyl(g, M.steelDark, 0.44, 0.44, 0.12, 0, base + 0.06, Z - 6.30, 14);

  // Her pennant on both sides of the tower.
  pennant(g, base, Z);

  // The tricolour on the after rail of the bridge: three panels, standing out
  // stiff the way a flag does at eighteen knots.
  const flagZ = Z - 5.05;
  const flagY = base + 4.70;
  const bands = [P.flagBlue, P.flagWhite, P.flagRed];
  cyl(g, M.steel, 0.05, 0.05, 1.30, 0.55, flagY + 0.65, flagZ, 8);
  for (let i = 0; i < 3; i++) {
    box(g, mat(bands[i]), 0.03, 0.52, 0.30, 0.55, flagY + 0.92, flagZ - 0.17 - i * 0.30);
  }
}

// ------------------------------------------------------------- the hangar --

/**
 * The pressure-tight hangar, let into the after end of the tower, and the rails.
 *
 * A metre and three quarters of radius and seven and a half long, with a door
 * in the after end that comes off rather than opening: the Besson goes in in
 * pieces and comes out the same way, is wheeled aft on the rails, put together
 * on the casing, and craned over the side. Four minutes alongside. Twenty at
 * sea, and the boat lies on the surface with a hole in her for all of it.
 */
function hangar(g) {
  const HZ = HANGAR_Z;
  const hb = casingY(HZ);
  const axis = hb + HANGAR_R;
  // The cylinder, faired into the tower at its forward end.
  const drum = cyl(g, M.light, 1.86, 1.86, 9.20, 0, axis, HZ, 24);
  drum.rotation.x = Math.PI / 2;
  sphere(g, M.light, 1.86, 0, axis, HZ + 4.52, 16);
  // The coaming and the door in the after end, with its ring of dogs.
  cyl(g, M.steelDark, 1.94, 1.94, 0.26, 0, axis, HZ - 4.66, 24)
    .rotation.x = Math.PI / 2;
  cyl(g, M.steel, 1.76, 1.76, 0.16, 0, axis, HZ - 4.82, 24)
    .rotation.x = Math.PI / 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    box(g, M.gunDark, 0.13, 0.13, 0.22,
      Math.sin(a) * 1.84, axis + Math.cos(a) * 1.84, HZ - 4.78);
  }
  // The fairing that blends the drum into the casing either side, so she is
  // one structure and not a pipe lying on a deck. One lofted shoulder a side
  // rather than a row of slabs: nine boxes in a line under a cylinder read as
  // a comb, which is what they were.
  for (const sgn of [-1, 1]) {
    const sh = loftRings(g, M.light, [
      [0.26, 4.40, HZ, hb - 0.12],
      [0.58, 4.70, HZ, hb + 0.34],
      [0.46, 4.20, HZ, hb + 1.62],
    ], { n: 16, px: 0.72, pz: 0.88, cap: false });
    if (sh) sh.position.x = sgn * 1.62;
  }
  // The rails the trolley runs aft along, and the sleepers under them.
  for (const x of [-0.82, 0.82]) {
    box(g, M.steelDark, 0.16, 0.10, 17.0, x, casingY(HZ - 12) + 0.07, HZ - 12.4);
  }
  for (let i = 0; i < 9; i++) {
    const z = HZ - 5.4 - i * 1.9;
    box(g, M.plankDark, 2.00, 0.05, 0.28, 0, casingY(z) + 0.05, z);
  }
  return { axis, z: HZ };
}

/**
 * The derrick that puts the aeroplane in the water and takes her out again.
 *
 * Stepped abaft the hangar on the centreline and topped over the port side,
 * which is the way she is shown in every photograph: a heel fitting, a boom
 * with a topping lift up to a short king post, and a block and hook on the
 * end of it hanging over the water.
 */
function derrick(g) {
  const cz = -25.6;
  const cb = casingY(cz);
  // The heel and the king post it tops against.
  cyl(g, M.steelDark, 0.34, 0.42, 0.90, 0, cb + 0.45, cz, 12);
  cyl(g, M.steel, 0.20, 0.24, 3.40, 0, cb + 2.60, cz - 0.55, 10);
  // The two stays that hold the king post up, from its head down to the
  // casing on either quarter. They are wires and they lie along the line
  // between their ends, which is the only way a stay ever looks right.
  for (const sgn of [-1, 1]) {
    wire(g, M.gunDark, [0, cb + 4.15, cz - 0.55],
      [sgn * 2.00, casingY(cz - 4.2) + 0.10, cz - 4.2], 0.032);
  }
  // The boom: swung out to port and topped up, which is where she stows it
  // when the aeroplane is on deck.
  const boom = new THREE.Group();
  boom.position.set(0, cb + 0.92, cz);
  boom.rotation.set(0.58, -0.26, 0);
  g.add(boom);
  cyl(boom, M.steel, 0.15, 0.21, 7.60, 0, 3.70, 0, 10);
  // The topping lift from the boom head back to the king post, and the runner
  // from the head down to the block.
  cyl(boom, M.gunDark, 0.03, 0.03, 0.34, 0, 7.36, 0, 6);
  // The block and the hook, hanging where a block hangs: straight down from
  // the boom head, not along the boom.
  const hx = Math.sin(-0.26) * Math.sin(0.58) * 7.40;
  const hy = cb + 0.92 + Math.cos(0.58) * 7.40;
  const hz = cz + Math.cos(-0.26) * Math.sin(0.58) * 7.40;
  wire(g, M.gunDark, [hx, hy, hz], [hx, hy - 2.20, hz], 0.028);
  box(g, M.steelDark, 0.26, 0.42, 0.20, hx, hy - 2.34, hz);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 6, 12), M.steelDark);
  hook.position.set(hx, hy - 2.70, hz);
  hook.rotation.y = Math.PI / 2;
  g.add(hook);
}

/**
 * The Besson on her trolley, abaft the hangar with her wings spread.
 *
 * She is on deck rather than in the tube because a submarine with her
 * aeroplane struck below looks exactly like a submarine, and because this is
 * the state every photograph and every model of the Surcouf is in: the whole
 * point of her, sitting on the casing where it can be seen.
 */
function deckPlane(g) {
  const z = -33.2;
  const deck = casingY(z);
  const cradle = new THREE.Group();
  cradle.position.set(0, deck, z);
  g.add(cradle);
  // The trolley: a frame on four flanged wheels running on the rails.
  box(cradle, M.steelDark, 2.10, 0.22, 3.60, 0, 0.22, 0);
  for (const sx of [-0.82, 0.82]) {
    for (const sz of [-1.40, 1.40]) {
      cyl(cradle, M.gunDark, 0.19, 0.19, 0.12, sx, 0.11, sz, 10)
        .rotation.z = Math.PI / 2;
    }
  }
  // The chocks her float sits in.
  for (const sz of [-1.10, 1.10]) box(cradle, M.plankDark, 1.10, 0.30, 0.40, 0, 0.48, sz);
  // And the aeroplane, sitting on them. She is built in her own frame with the
  // float keel near zero, so she goes on top of the chocks.
  besson(cradle, 0, 0.52, 0.10, Math.PI, { spin: false });
}

// ----------------------------------------------------------------- the AA --

/**
 * Her light battery: a 37 mm twin on the hangar top and two 13.2 mm twins.
 *
 * The 37 mm is a Mle 1925 on a pedestal, hand-worked, and it is the only thing
 * aboard that can reach an aeroplane at any height. The Hotchkiss twins are in
 * watertight housings on the after bridge platform, one each side, and they
 * are what she actually had a chance of hitting anything with.
 */
function flak(g) {
  const out = [];
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      const node = new THREE.Group();
      // Standing on the hangar top, or on one of the two bridge platforms.
      const stand = gun.caliber >= 30
        ? casingY(HANGAR_Z) + HANGAR_R * 2 + 0.12
        : casingY(-2.0) + AA_BRIDGE + 0.58;
      node.position.set(m.x, stand, m.z);
      node.userData.dynamic = true;
      const heavy = gun.caliber >= 30;
      // The pedestal, and the watertight tub the machine guns live in.
      cyl(node, M.steelDark, heavy ? 0.50 : 0.34, heavy ? 0.58 : 0.40,
        0.38, 0, 0.19, 0, 14);
      if (!heavy) {
        loftRings(node, M.light, [
          [0.62, 0.66, 0, 0.00],
          [0.66, 0.70, 0, 0.30],
          [0.60, 0.64, 0, 0.44],
        ], { n: 14, px: 0.6, pz: 0.6, cap: false });
      }
      // The training mass, the shield and the shoulder rests.
      box(node, M.gun, heavy ? 0.76 : 0.50, 0.38, heavy ? 0.86 : 0.56, 0, 0.58, 0);
      if (heavy) box(node, M.steel, 1.05, 0.60, 0.09, 0, 0.86, 0.46);
      const cradle = new THREE.Group();
      cradle.position.set(0, 0.78, 0);
      cradle.rotation.x = -0.30;
      node.add(cradle);
      const muzzles = [];
      const barrels = m.guns || 1;
      for (let i = 0; i < barrels; i++) {
        const x = (i - (barrels - 1) / 2) * (heavy ? 0.36 : 0.24);
        tubeZ(cradle, M.gunDark, heavy ? 0.058 : 0.034,
          heavy ? 2.20 : 1.34, x, 0, heavy ? 1.10 : 0.67, 8);
        // The flash hider on a 37 mm and the cooling jacket on a Hotchkiss.
        if (heavy) cyl(cradle, M.gunDark, 0.09, 0.07, 0.26, x, 0, 2.28, 8)
          .rotation.x = Math.PI / 2;
        else cyl(cradle, M.steel, 0.058, 0.058, 0.60, x, 0, 0.60, 8)
          .rotation.x = Math.PI / 2;
        // The magazine standing up out of the breech, which is what a Hotchkiss
        // and a 37 mm Mle 1925 both feed from.
        box(cradle, M.gunDark, 0.10, heavy ? 0.36 : 0.30, 0.13, x, heavy ? 0.26 : 0.22, 0.08);
        muzzles.push([x, 0, heavy ? 2.34 : 1.36]);
      }
      arm(node, cradle, muzzles);
      g.add(node);
      out.push(node);
    }
  }
  return out;
}

// -------------------------------------------------------------- the tubes --

/**
 * Her tubes: four in the bow, and two trainable triples in the casing aft.
 *
 * The bow four are inside the pressure hull and show as nothing but their
 * caps. The two aft are external mounts standing on the casing -- a 55 cm
 * tube with a 40 cm either side of it, on a ring that trains -- and they are
 * the reason she can put a torpedo on a bearing without putting the boat on
 * one. Nothing else afloat in 1940 can do it.
 */
function tubes(g) {
  const mounts = [];
  // Shaped the way the boat's dive step wants to read them: the bow doors and
  // the stern doors kept apart, each one with the hand it swings on, because
  // opening a cap is a rotation about the hinge and the hinge is on the
  // outboard side of the tube.
  const caps = { bow: [], stern: [] };
  for (const m of CLS.torpedoes.mounts) {
    const node = new THREE.Group();
    node.position.set(m.x, m.my - 0.30, m.z);
    node.userData.dynamic = true;
    if (Math.abs(m.z) > 30) {
      // In the bow: four doors in the stem, hinged outboard so each swings
      // clear of its own tube mouth, and the dark of the tube behind it.
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * 0.66;
        const y = i < 2 ? 0.60 : -0.58;
        cyl(node, M.cave, 0.28, 0.28, 0.44, x, y, 0.76, 12).rotation.x = Math.PI / 2;
        const hinge = new THREE.Group();
        hinge.position.set(x + side * 0.32, y, 1.02);
        hinge.userData.dynamic = true;
        const leaf = cyl(hinge, M.steelDark, 0.32, 0.32, 0.12, -side * 0.32, 0, 0, 12);
        leaf.rotation.x = Math.PI / 2;
        box(hinge, M.steel, 0.09, 0.12, 0.12, -side * 0.05, 0, 0.05);
        node.add(hinge);
        caps.bow.push({ node: hinge, hand: side });
      }
      // The muzzle this mount fires from, so the fish leaves the bow and not
      // the middle of her.
      arm(node, node, [[0, 0, 2.90]]);
    } else {
      // A trainable external triple: the 55 cm on the centreline of the mount
      // with a 40 cm either side, all three on a ring that turns.
      cyl(node, M.steelDark, 0.90, 0.98, 0.42, 0, -0.10, 0, 16);
      const ring = new THREE.Group();
      ring.position.set(0, 0.28, 0);
      node.add(ring);
      // The cradle the three tubes are slung in.
      box(ring, M.steel, 2.10, 0.28, 3.20, 0, -0.22, -0.30);
      const bores = [];
      for (const [x, r] of [[0, 0.325], [-0.72, 0.245], [0.72, 0.245]]) {
        tubeZ(ring, M.steelDark, r, 6.00, x, 0, -0.20, 14);
        // The bow cap on the end of each, and the dark inside it.
        cyl(ring, M.gunDark, r * 1.10, r * 1.10, 0.16, x, 0, 2.78, 14)
          .rotation.x = Math.PI / 2;
        cyl(ring, M.cave, r * 0.82, r * 0.82, 0.10, x, 0, 2.84, 12)
          .rotation.x = Math.PI / 2;
        // The strongback along the top of the tube, which is what a deck
        // mounting has instead of a hull round it.
        box(ring, M.steel, r * 0.6, 0.10, 5.20, x, r + 0.06, -0.20);
        bores.push([x, 0, 2.90]);
      }
      // The training gear and the sight the torpedo officer lays it with.
      box(ring, M.steelDark, 0.42, 0.44, 0.52, 0.92, 0.18, -2.50);
      cyl(ring, M.gunDark, 0.06, 0.06, 0.50, 0.92, 0.62, -2.50, 6);
      arm(node, ring, bores);
    }
    g.add(node);
    mounts.push(node);
  }
  return { mounts, caps };
}

// ----------------------------------------------------------- her fittings --

/**
 * Everything else on her outside.
 *
 * Guard rails down both sides of the casing, the jumping wires, the capstan
 * and bollards, the hatches she is stored through, the anchor, and the
 * motorboat she carried for boarding the ships she stopped -- which is the one
 * fitting on her that says what she was actually for.
 */
function fittings(g) {
  // The guard rails: stanchions every two and a half metres with three wires
  // rove through them, down both sides of the casing. They are the thing that
  // makes the reference photographs read as a ship rather than as a hull, and
  // they stop where the tower, the hangar and the turret stand.
  // Where there is room for them: everything between the after end of the
  // casing and the aeroplane, the stretch between the aeroplane and the
  // derrick, and the whole of the forecastle ahead of the turret. The tower,
  // the turret and the hangar take up the rest of her.
  const CLEAR = [[CASE_AFT + 2.0, -37.5], [-29.0, -21.0], [11.8, CASE_FWD - 2.0]];
  const RAILS = [0.34, 0.66, 0.98];
  for (const sgn of [-1, 1]) {
    for (const [z0, z1] of CLEAR) {
      const steps = Math.max(2, Math.round((z1 - z0) / 2.4));
      const foot = (zz) => [sgn * (casingHalf(zz) - 0.12), casingY(zz), zz];
      for (let i = 0; i <= steps; i++) {
        const z = z0 + ((z1 - z0) * i) / steps;
        if (casingHalf(z) < 0.85) continue;
        const f = foot(z);
        cyl(g, M.bright, 0.035, 0.045, 1.04, f[0], f[1] + 0.52, f[2], 6);
        if (i === steps) continue;
        const zb = z0 + ((z1 - z0) * (i + 1)) / steps;
        if (casingHalf(zb) < 0.85) continue;
        const b = foot(zb);
        for (const h of RAILS) {
          wire(g, M.bright, [f[0], f[1] + h, f[2]], [b[0], b[1] + h, b[2]], 0.022);
        }
      }
    }
  }

  // The jumping wires: stem to tower to stern, over insulators. On a boat they
  // are the wireless aerial and a net deflector both, and on the Surcouf they
  // are the only thing that breaks up eighty feet of empty casing aft.
  const towerTop = casingY(-2.0) + 6.10;
  for (const [z0, y0, z1, y1] of [
    [CASE_FWD - 1.0, casingY(CASE_FWD - 1.0) + 0.35, 2.4, towerTop],
    [-6.4, towerTop, CASE_AFT + 2.0, casingY(CASE_AFT + 2.0) + 0.35],
  ]) {
    const steps = 12;
    // A wire under its own weight is a catenary, and a straight one between
    // two points a boat's length apart reads as a scratch on the lens.
    const sag = (u) => 0.85 * Math.sin(u * Math.PI);
    const at = (u) => [0, y0 + (y1 - y0) * u - sag(u), z0 + (z1 - z0) * u];
    for (let i = 0; i < steps; i++) {
      wire(g, M.gunDark, at(i / steps), at((i + 1) / steps), 0.028, 4);
    }
    // The insulator where it comes down to the casing.
    const end = at(1);
    cyl(g, M.bright, 0.05, 0.05, 0.34, 0, end[1] - 0.17, end[2], 6);
  }

  // The capstan and the bollards forward, and a pair aft.
  cyl(g, M.steelDark, 0.30, 0.36, 0.40, 0, casingY(38.0) + 0.20, 38.0, 12);
  cyl(g, M.gunDark, 0.20, 0.20, 0.14, 0, casingY(38.0) + 0.46, 38.0, 12);
  for (const sgn of [-1, 1]) {
    for (const z of [35.0, 41.0, -36.0]) {
      const hw = casingHalf(z);
      if (hw < 0.6) continue;
      box(g, M.steelDark, 0.34, 0.26, 0.20, sgn * (hw - 0.30), casingY(z) + 0.13, z);
    }
  }

  // Her hatches: the torpedo loading hatch forward, the galley hatch, and the
  // engine room hatch aft. A boat is stored and boarded through these.
  for (const [z, w] of [[29.0, 0.78], [-22.0, 0.62], [-30.0, 0.66]]) {
    cyl(g, M.steelDark, w / 2, w / 2, 0.14, 0, casingY(z) + 0.09, z, 14);
    cyl(g, M.gun, w / 2 - 0.10, w / 2 - 0.10, 0.09, 0, casingY(z) + 0.18, z, 14);
    // The hinge and the clips round the rim.
    box(g, M.gunDark, 0.22, 0.10, 0.12, 0, casingY(z) + 0.20, z - w / 2);
  }

  // The anchor, housed in the port side of the casing forward, which is where
  // she carried hers: a submarine cannot have a hawse pipe through a pressure
  // hull, so it goes into a recess in the tank top instead.
  const az = 33.0;
  box(g, M.cave, 0.10, 0.62, 1.30, -(casingHalf(az) + 0.02), casingY(az) - 0.30, az);
  box(g, M.gunDark, 0.16, 0.50, 1.05, -(casingHalf(az) + 0.02), casingY(az) - 0.30, az);

  // The motorboat, stowed in a recess in the casing abaft the tower under a
  // canvas cover. Four and a half metres of her, and she is how a boarding
  // party got across to the ship the guns had just stopped.
  const bz = -20.6;
  box(g, M.cave, 2.00, 0.50, 4.80, 0, casingY(bz) - 0.20, bz);
  loftRings(g, M.canvas, [
    [0.86, 2.36, bz, casingY(bz) - 0.34],
    [0.94, 2.44, bz, casingY(bz) - 0.02],
    [0.70, 2.10, bz, casingY(bz) + 0.30],
  ], { n: 16, px: 0.6, pz: 0.8 });

  // The forward hydroplanes, folded flat against her sides the way they are
  // stowed on the surface, and the after pair beside the screws.
  for (const sgn of [-1, 1]) {
    const ft = 0.60;
    const fy = -0.90;
    const fp = box(g, M.steelDark, 2.00, 0.18, 1.55,
      sgn * (shellAt(ft, fy) + 0.80), fy, ft * HALF);
    fp.rotation.z = sgn * 0.04;
  }
}

/** Her stern: two handed screws, the shaft brackets, the rudder and the planes. */
function stern(g) {
  const z = -HALF + 3.4;
  const shaftY = keelAt(-0.93) + 2.05;
  for (const [x, hand] of [[-1.62, -1], [1.62, 1]]) {
    // The shaft out of the hull, and the A-bracket that carries it.
    tubeZ(g, M.gunDark, 0.19, 4.20, x, shaftY, z + 2.60, 10);
    const br = box(g, M.hull, 0.26, 1.50, 0.56, x, shaftY + 0.80, z + 1.40);
    br.rotation.z = -Math.sign(x) * 0.28;
    const hub = new THREE.Group();
    hub.position.set(x, shaftY, z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.28, 0.18, 0.34, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, 0.56, 0.070, 0.96,
        Math.sin(a) * 0.48, Math.cos(a) * 0.48, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.42;
    }
    g.add(hub);
  }
  // One big rudder on the centreline abaft the screws, and the after planes
  // outboard of them.
  box(g, M.hull, 0.20, 2.90, 2.10, 0, keelAt(-0.965) + 1.90, z - 1.90);
  for (const sgn of [-1, 1]) {
    const ap = box(g, M.steelDark, 2.40, 0.18, 1.60, sgn * 2.90, shaftY - 0.40, z + 0.40);
    ap.rotation.z = sgn * 0.04;
  }
  // The stern light and the after fairing over the shafts.
  cyl(g, M.steel, 0.07, 0.07, 0.42, 0, casingY(CASE_AFT) + 0.22, CASE_AFT - 0.4, 8);
}

export function buildSurcouf() {
  const g = new THREE.Group();
  hull(g);
  // Her insides, on the pressure hull's lines -- the only part of her that has
  // an inside at all -- and built before anything is put on top of her.
  //
  // The order matters, and it matters more for her than for any ship in the
  // game. The interior builder measures the plating already in the group and
  // fits her out inside it, and anything standing above her deck it takes for
  // a deckhouse and fills with cabins. Everything above a submarine's tank
  // tops is a deckhouse by that reckoning: the tower, the hangar, and -- the
  // one that actually did it -- the casing, which is a foot and a half of
  // fairing over the tanks with nothing inside it at all. She was being given
  // a compartment in it, standing out through her own plating where the
  // casing edge falls away.
  //
  // So her interior is built against the bare hull and nothing else. She is a
  // pressure hull with things bolted on top of it, and what is inside her is
  // inside that tube.
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
  casing(g);
  tower(g);
  hangar(g);
  derrick(g);
  deckPlane(g);
  fittings(g);
  stern(g);
  mergeStatic(g, bySection(LOA));
  const turrets = mainTurret(g);
  const aaMounts = flak(g);
  const { mounts: torpMounts, caps } = tubes(g);
  mergeMoving(g);
  g.userData.classId = 'surcouf';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: casingY(0),
    secMounts: [], aaMounts, torpMounts, tubeCaps: caps,
  };
}
