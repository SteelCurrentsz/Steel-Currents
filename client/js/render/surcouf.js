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
// Where the casing starts and stops, for anything outside that wants to walk
// it -- the check that sweeps her for daylight, mostly.
export const CASE_FWD_Z = CASE_FWD;
export const CASE_AFT_Z = CASE_AFT;
const CASE_RISE = 0.44;

// The hangar, and the height of the two gun platforms on the tower. Both are
// written here because the light battery stands on them and has to know where
// they are: a gun floating a foot above its own platform is the commonest way
// a model of a warship goes wrong.
const HANGAR_Z = -13.2;
// The hangar is a D in section, not a pipe: a half-round crown of this radius
// sitting on two straight sides that run all the way down on to the casing.
// It was a pipe, and a pipe laid on a deck touches it along one line and
// leaves daylight either side of that line -- which is exactly what she had
// amidships, a hand's breadth of sky visible under nine metres of hangar.
const HANGAR_R = 1.94;
const HANGAR_AXIS = 1.90;      // the crown's centre, above the casing
const HANGAR_TOP = HANGAR_AXIS + HANGAR_R;
const HANGAR_AFT = -18.44;     // the face the door is bolted to
const HANGAR_FWD = -7.10;      // buried in the after end of the tower
const AA_BRIDGE = 3.55;

// Her tower, written out where the detail pass can read it back. Anything
// fitted to the outside of a lofted body has to be able to ask that body where
// its skin is at a given height and station, or it stands off in the air --
// which on a superellipse, which is what `loftRings` draws, is not a radius.
const TOWER_Z = -2.0;
const TOWER_PX = 0.56;
const TOWER_PZ = 0.68;
const TOWER_RINGS = [
  [2.10, 5.60, -0.30],
  [2.16, 5.75, 0.30],
  [2.12, 5.66, 3.70],
  [1.92, 5.10, 4.45],
];

/**
 * How far out the tower's side is at a height above the casing and a station.
 *
 * Returns 0 where the station is past the end of her at that height, so a
 * fitting placed there can be dropped rather than hung in the air.
 */
function towerSkin(dy, z) {
  let a = TOWER_RINGS[0];
  let b = TOWER_RINGS[TOWER_RINGS.length - 1];
  for (let i = 0; i < TOWER_RINGS.length - 1; i++) {
    if (dy >= TOWER_RINGS[i][2] && dy <= TOWER_RINGS[i + 1][2]) {
      a = TOWER_RINGS[i]; b = TOWER_RINGS[i + 1]; break;
    }
  }
  const u = b[2] === a[2] ? 0 : (dy - a[2]) / (b[2] - a[2]);
  const hw = a[0] + (b[0] - a[0]) * Math.max(0, Math.min(1, u));
  const hd = a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, u));
  const c = Math.abs(z - TOWER_Z) / hd;
  if (c >= 1) return 0;
  const cosA = Math.pow(c, 1 / TOWER_PZ);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  return hw * Math.pow(sinA, TOWER_PX);
}

/**
 * How high the casing stands above the tanks at a station.
 *
 * Full height down the middle of her and faired away to nothing at both ends,
 * because that is how a casing is built and because the alternative is what
 * this was: a strip of deck a foot and a half high that ran out to a point and
 * stopped dead, standing on edge in the air like a fin.
 */
export function casingRise(z) {
  if (z > CASE_FWD || z < CASE_AFT) return 0;
  const t = z >= 0 ? z / CASE_FWD : z / CASE_AFT;
  const k = Math.min(1, Math.max(0, (1 - t) / 0.22));
  return CASE_RISE * (k * k * (3 - 2 * k));
}

/** The top of the casing deck at a station, where there is casing. */
export function casingY(z) { return deckAt(z) + casingRise(z); }

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
function hullBand(g, m, y0of, y1of, rows, capTop = false, capBot = false) {
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

  // And the flat of her bottom between them, on the lowest band.
  //
  // A loft of two mirrored sheets is a pair of sheets, not a solid: it is
  // closed at the stem, closed at the stern and -- with capTop -- closed
  // across the tank tops, and open everywhere those three are not. Her
  // garboard strake does not reach the centreline, so what was left was a slot
  // half a metre wide running the whole hundred and ten metres of her keel,
  // and from anywhere ahead or astern you looked straight up it into her
  // insides. It is the thing you cannot see in profile and cannot miss bow-on.
  if (capBot) {
    for (let s = 0; s < STATIONS; s++) {
      const a = at(s, 0);
      const b = at(s + 1, 0);
      // Wound the other way round from the tank tops, so these normals look
      // down at the sea bed rather than up into her.
      idx.push(a, b, half + a, b, half + b, half + a);
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
  hullBand(g, M.antifoul, keelAt, () => BOOT_LO, 6, false, true);
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

  // The waterway: a steel stringer down each edge of the deck, which is what
  // the planking is laid against and what gives the casing an edge at all. A
  // planked deck that runs straight over the side has no edge, and the eye
  // reads it as a painted stripe rather than as something a man could fall
  // off. Lofted along her with the deck so it follows every curve of it.
  for (const sgn of [-1, 1]) {
    const pos = [];
    const idx = [];
    for (let sN = 0; sN <= STATIONS; sN++) {
      const z = CASE_AFT + ((CASE_FWD - CASE_AFT) * sN) / STATIONS;
      const hw = casingHalf(z);
      const y = casingY(z);
      const w = Math.min(0.16, hw * 0.4);
      // Outboard face, top, inboard face: four points a station.
      pos.push(sgn * hw, y - 0.02, z, sgn * hw, y + 0.09, z,
        sgn * (hw - w), y + 0.09, z, sgn * (hw - w), y - 0.02, z);
    }
    for (let sN = 0; sN < STATIONS; sN++) {
      const a = sN * 4;
      const b = (sN + 1) * 4;
      // Wound so the outboard face looks outboard whichever side she is on.
      const q = (p0, p1, p2, p3) => (sgn > 0
        ? idx.push(a + p0, b + p1, a + p1, a + p0, b + p0, b + p1)
        : idx.push(a + p0, a + p1, b + p1, a + p0, b + p1, b + p0));
      q(0, 1);      // outboard
      q(1, 2);      // top
      q(2, 3);      // inboard
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.deckSteel));
  }

  // The freeing ports in the casing side. A casing is not watertight and is
  // not meant to be: it floods and drains as she dives and surfaces, and the
  // row of slots along it is the most recognisable thing about a submarine's
  // side after the tower itself.
  for (let z = CASE_AFT + 4; z < CASE_FWD - 6; z += 1.9) {
    const hw = casingHalf(z);
    if (hw < 1.2) continue;
    const y = (casingY(z) + deckAt(z)) / 2 - 0.04;
    for (const sgn of [-1, 1]) box(g, M.cave, 0.06, 0.20, 0.62, sgn * hw, y, z);
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

// ---------------------------------------------------------- the gun well --

/**
 * What the turret is bolted to: the well it turns in, let into the casing.
 *
 * This is the part of her nothing else in the game has. Every other turret in
 * this fleet stands on a barbette that rises out of a deck; hers is let into
 * the pressure hull, because the whole mounting is part of the pressure
 * envelope and has to be dived with. What you see on deck is a ring of plating
 * where the planking stops, a coaming round the opening, the barbette coming
 * up through it, and the roller path the mounting turns on with its holding-
 * down clips round the outside.
 *
 * It is built here, with the casing, and not with the turret -- because a
 * barbette does not train. Put it in the mounting's own group and the whole
 * ring of clips goes round with the guns, which is what it used to do.
 */
const WELL_R = 2.45;
function turretWell(g) {
  const Z = CLS.turrets[0].z;
  const deck = casingY(Z);
  // The ring of plating the planking is cut back to, laid on the casing.
  cyl(g, M.deckSteel, 3.12, 3.12, 0.06, 0, deck + 0.02, Z, 28);
  // The coaming round the opening: a raised lip, which is what keeps the sea
  // on the casing out of the well when she is running awash.
  cyl(g, M.light, 2.74, 2.80, 0.26, 0, deck + 0.13, Z, 28);
  // The barbette itself, up through the opening from well below the tank tops.
  // It is one piece and it is solid: there is no line round the foot of this
  // turret where you can see daylight under it.
  cyl(g, M.light, WELL_R, WELL_R + 0.07, 1.98, 0, deck - 0.37, Z, 28);
  // The roller path on top of it, which the mounting actually turns on.
  cyl(g, M.steelDark, WELL_R + 0.02, WELL_R + 0.02, 0.14, 0, deck + 0.55, Z, 28);
  // And the clips that hold the mounting down to it, all round.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    box(g, M.steelDark, 0.17, 0.12, 0.17,
      Math.sin(a) * (WELL_R + 0.06), deck + 0.44, Z + Math.cos(a) * (WELL_R + 0.06), a);
  }
  // The ladder up the side of it, and the grab rail round the coaming: a
  // turret this size is climbed on, and the crew got into it from the casing.
  ladder(g, M.bright, 0, deck + 0.06, deck + 0.56, Z - 2.62, Z - 2.90);
  return deck + 0.62;
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
function mainTurret(g, ringY) {
  const Z = CLS.turrets[0].z;
  const t = new THREE.Group();
  // On the roller path, not on the deck. Everything below this turns with
  // nothing: see turretWell.
  t.position.set(0, ringY, Z);
  t.userData.dynamic = true;

  // The turntable, and the skirt that hangs off it over the barbette.
  //
  // A gunhouse is longer fore and aft than the ring it turns on, so it
  // overhangs the barbette at both ends, and the overhang is plated down to
  // within a hand's breadth of the roller path. Without that plating there is
  // a finger of daylight all round the foot of the turret, which is exactly
  // what she had: a gunhouse balanced on a drum with air under its ends.
  loftRings(t, M.light, [
    [2.24, 2.78, -0.60, -0.50],
    [2.28, 2.82, -0.60, -0.16],
    [2.26, 2.80, -0.60, 0.06],
  ], { n: 24, px: 0.66, pz: 0.70, cap: false, floor: true });

  // The gunhouse. Rounded everywhere, because it has to be pushed through the
  // water at eighteen knots and then dived: a cruiser's slab-sided turret
  // would be a sea anchor and a pressure trap both.
  loftRings(t, M.light, [
    [2.20, 2.74, -0.60, 0.00],
    [2.34, 2.90, -0.55, 0.40],
    [2.32, 2.88, -0.50, 1.60],
    [2.18, 2.74, -0.46, 2.32],
    [1.96, 2.48, -0.44, 2.60],
  ], { n: 24, px: 0.66, pz: 0.70 });
  // The face: a flat plate the guns come through, sloped back a little. A
  // mounting that is round all over has nowhere for the guns to come out of,
  // and what you get is two barrels growing out of a pebble.
  const face = box(t, M.light, 3.60, 2.30, 0.28, 0, 1.30, 2.26);
  face.rotation.x = -0.10;
  box(t, M.steel, 3.72, 0.16, 0.34, 0, 2.46, 2.16);
  box(t, M.steel, 0.20, 2.30, 0.36, 1.78, 1.30, 2.20);
  box(t, M.steel, 0.20, 2.30, 0.36, -1.78, 1.30, 2.20);

  // The five-metre rangefinder, lying fore-and-aft in the roof with a hood at
  // each end: the thing that lets her shoot at twelve thousand metres instead
  // of at what a periscope can see.
  box(t, M.steel, 0.62, 0.40, 4.90, 0, 2.76, -1.10);
  for (const dz of [1.70, -3.90]) {
    const hood = cyl(t, M.gunDark, 0.26, 0.26, 0.34, 0, 2.76, dz, 12);
    hood.rotation.x = Math.PI / 2;
  }
  // The trainer's and layer's sighting hoods either side of the face.
  for (const sgn of [-1, 1]) {
    loftRings(t, M.steel, [
      [0.34, 0.40, 0.70, 2.10],
      [0.36, 0.42, 0.70, 2.46],
      [0.26, 0.32, 0.70, 2.62],
    ], { n: 12, px: 0.6, pz: 0.6 });
    box(t, M.glass, 0.12, 0.14, 0.34, sgn * 1.62, 2.34, 1.00);
  }
  // The access hatch in the roof and the ready-use lockers on the quarters.
  cyl(t, M.steelDark, 0.44, 0.44, 0.10, 0.90, 2.70, -2.40, 14);
  for (const sgn of [-1, 1]) box(t, M.steel, 0.30, 0.52, 0.80, sgn * 1.92, 0.60, -2.70);

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
  cradle.position.set(0, 1.22, 0.10);
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
  const Z = TOWER_Z;
  const base = casingY(Z);
  // The tower proper, with the step in it where the bridge deck sits.
  loftRings(g, M.light, TOWER_RINGS.map(([hw, hd, dy]) => [hw, hd, Z, base + dy]),
    { n: 22, px: TOWER_PX, pz: TOWER_PZ });
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

  masthead(g, base, Z);

  // The two machine-gun sponsons abaft the bridge are not built here: they are
  // built with the guns that stand in them, in `gunPositions`, so that the
  // floor a gun is put on and the floor the model draws are the same number.
  // They were not, and she carried her Hotchkiss twins perched on the rims of
  // their own tubs.

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


/**
 * Her masthead: the periscopes, the wireless and the rangefinder.
 *
 * This is the highest thing on her and therefore the thing the eye goes to,
 * and it was three primitives -- two black posts with a brick on top of each,
 * a bare rod, and a girder with a disc stuck on either end standing in for a
 * five-metre rangefinder. Built as instruments here.
 */
function masthead(g, base, Z) {
  const foot = base + 4.55;

  // The two periscopes, in the order every boat has them: the thin attack
  // glass forward and the fatter navigation glass abaft it. Each comes up out
  // of a fairing over its own raising gear, and each has a head rather than a
  // block -- a barrel with the search window in its forward face and the sky
  // window above that.
  for (const [x, dz, h, r] of [[0.42, -0.72, 3.60, 0.090], [-0.42, -1.76, 3.05, 0.105]]) {
    const z = Z + dz;
    cyl(g, M.steelDark, r * 2.3, r * 2.7, 0.46, x, foot + 0.23, z, 12);
    cyl(g, M.gunDark, r, r, h, x, foot + 0.46 + h / 2, z, 12);
    const hy = foot + 0.46 + h;
    cyl(g, M.gunDark, r * 1.7, r * 1.7, 0.46, x, hy + 0.23, z, 12);
    box(g, M.glass, r * 1.9, 0.17, 0.06, x, hy + 0.16, z + r * 1.72);
    box(g, M.glass, r * 1.5, 0.05, 0.14, x, hy + 0.44, z + r * 1.30);
    cyl(g, M.gunDark, r * 1.5, r * 0.6, 0.18, x, hy + 0.55, z, 10);
    // The hand ring the officer of the watch swings her round on.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 2.4, 0.028, 5, 14), M.bright);
    ring.position.set(x, foot + 0.86, z);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }

  // Her wireless mast, stepped on the after end of the bridge, with the yardarm
  // the aerial is spread from and the direction-finding loop at the head of it.
  // The loop is what a boat of 1934 carries where a later one carries an
  // aerial array, and it is the top hamper in every photograph of her.
  const mz = Z - 2.62;
  cyl(g, M.steel, 0.075, 0.105, 3.10, 0, foot + 1.55, mz, 10);
  const mh = foot + 3.10;
  box(g, M.steel, 2.30, 0.06, 0.07, 0, mh - 0.58, mz);
  for (const sgn of [-1, 1]) {
    cyl(g, M.bright, 0.04, 0.04, 0.16, sgn * 1.10, mh - 0.48, mz, 6);
  }
  cyl(g, M.steelDark, 0.11, 0.13, 0.20, 0, mh + 0.10, mz, 10);
  box(g, M.bright, 0.05, 0.40, 0.05, 0, mh + 0.32, mz);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.032, 6, 18), M.bright);
  loop.position.set(0, mh + 0.60, mz);
  g.add(loop);

  // The five-metre rangefinder across the after end of the bridge.
  //
  // She has to dive with it, so it is a sealed instrument in a pressure-tight
  // housing lying fore and aft rather than the open girder a surface ship
  // carries. Built as the instrument: a pedestal with its roller path, a
  // shield round the operator, a body that tapers out to the two end housings,
  // and a hood over each window.
  const rf = new THREE.Group();
  rf.position.set(0, base + 5.02, Z - 3.76);
  g.add(rf);
  cyl(rf, M.steelDark, 0.40, 0.50, 0.44, 0, 0.22, 0, 16);
  cyl(rf, M.gunDark, 0.53, 0.53, 0.07, 0, 0.47, 0, 16);
  loftRings(rf, M.light, [
    [0.74, 0.66, 0, 0.50],
    [0.82, 0.74, 0, 0.74],
    [0.78, 0.70, 0, 1.04],
  ], { n: 16, px: 0.6, pz: 0.6, cap: false, floor: true });
  // The middle of the instrument, over the pedestal, and the two arms out of it.
  cyl(rf, M.steel, 0.25, 0.25, 0.72, 0, 1.16, 0, 14).rotation.z = Math.PI / 2;
  for (const sgn of [-1, 1]) {
    cyl(rf, M.steel, 0.15, 0.21, 1.86, sgn * 1.29, 1.16, 0, 12)
      .rotation.z = sgn * Math.PI / 2;
    // The end housing, the rim round its window, the window itself set back
    // inside the rim, and the cowl over the top of it that keeps the sun out
    // of the eyepiece. A flat window the full width of the housing reads as an
    // open pipe with the dark of the inside of her showing through it, which
    // is what this was.
    cyl(rf, M.steel, 0.22, 0.30, 0.46, sgn * 2.45, 1.16, 0, 14)
      .rotation.z = sgn * Math.PI / 2;
    cyl(rf, M.steelDark, 0.235, 0.235, 0.07, sgn * 2.66, 1.16, 0, 14)
      .rotation.z = Math.PI / 2;
    cyl(rf, M.glass, 0.155, 0.155, 0.04, sgn * 2.67, 1.16, 0, 14)
      .rotation.z = Math.PI / 2;
    const cowl = box(rf, M.steelDark, 0.30, 0.05, 0.34, sgn * 2.60, 1.36, 0.08);
    cowl.rotation.x = -0.34;
    box(rf, M.steelDark, 0.06, 0.20, 0.05, sgn * 2.60, 1.28, -0.10);
    // The trunnion bracket under each arm.
    box(rf, M.steelDark, 0.16, 0.22, 0.30, sgn * 0.52, 1.00, 0);
  }
  // The operator's handwheels, his seat, and the training rack under it all,
  // which is what says which way round the instrument is meant to be read.
  for (const sgn of [-1, 1]) {
    cyl(rf, M.gunDark, 0.13, 0.13, 0.05, sgn * 0.46, 0.94, -0.34, 10)
      .rotation.x = Math.PI / 2;
  }
  box(rf, M.steelDark, 0.36, 0.06, 0.30, 0, 0.74, -0.52);
  cyl(rf, M.steelDark, 0.05, 0.05, 0.26, 0, 0.61, -0.52, 6);
}

// ------------------------------------------------------------- the hangar --

/**
 * A D in section, lofted station to station: a half-round crown on straight
 * sides that run down on to the deck, with a flat bottom under them.
 *
 * Stations are `[z, r, axisY]`, in increasing z, and the floor of every one of
 * them is taken from the casing at that station so the thing beds down on to
 * the deck it stands on however the deck rises. The section is closed -- the
 * bottom edge is wound like any other face -- so there is no way to see in
 * from underneath, which is what the cylinder this replaces could not say.
 */
function hangarBody(g, m, stations, n = 14, drop = 0.10) {
  const pos = [];
  const idx = [];
  // Points per station: the foot of each side, and n + 1 round the crown.
  // Counted wrong, the strip indices run off the end of one station and into
  // the next, and the body comes out as a heap of twisted ribbons.
  const N = n + 3;
  for (const [z, r, ay] of stations) {
    const fy = casingY(z) - drop;
    // Counter-clockwise in the xy-plane, starting at the foot of the starboard
    // side: up the side, over the crown, down the port side. The closing edge
    // from the port foot back to the starboard one is the flat bottom, and it
    // is wound with the rest.
    pos.push(r, fy, z);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI;
      pos.push(r * Math.cos(a), ay + r * Math.sin(a), z);
    }
    pos.push(-r, fy, z);
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = s * N + i;
      const b = s * N + j;
      const c = (s + 1) * N + j;
      const d = (s + 1) * N + i;
      // (a, b, c) then (a, c, d): checked by hand on the flat of the side,
      // where the outward normal has to come out +x to starboard.
      idx.push(a, b, c, a, c, d);
    }
  }
  // Both ends closed, fanned from the middle of the section.
  const last = (stations.length - 1) * N;
  const fwd = pos.length / 3;
  pos.push(0, stations[stations.length - 1][2], stations[stations.length - 1][0]);
  for (let i = 0; i < N; i++) idx.push(fwd, last + i, last + ((i + 1) % N));
  const aft = pos.length / 3;
  pos.push(0, stations[0][2], stations[0][0]);
  for (let i = 0; i < N; i++) idx.push(aft, ((i + 1) % N), i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  g.add(mesh);
  return mesh;
}

/** Where the crown of the hangar is, which is what the 37 mm stands on. */
export function hangarTopY() { return casingY(HANGAR_Z) + HANGAR_TOP; }

/**
 * The pressure-tight hangar, let into the after end of the tower, and the rails.
 *
 * Two metres of radius and eleven long, with a door in the after end that comes
 * off rather than opening: the Besson goes in in pieces and comes out the same
 * way, is wheeled aft on the rails, put together on the casing, and craned over
 * the side. Four minutes alongside. Twenty at sea, and the boat lies on the
 * surface with a hole in her for all of it.
 *
 * Her forward end runs on into the tower rather than stopping against it, which
 * is how she was built: the tower is the hangar's forward end, grown upward.
 */
function hangar(g) {
  const HZ = HANGAR_Z;
  const AX = casingY(HZ) + HANGAR_AXIS;
  const R = HANGAR_R;
  hangarBody(g, M.light, [
    [HANGAR_AFT + 0.14, R - 0.20, AX - 0.16],
    [HANGAR_AFT + 0.44, R - 0.02, AX - 0.02],
    [HANGAR_AFT + 1.04, R, AX],
    [HZ, R, AX],
    [-9.40, R, AX],
    [-8.40, R - 0.02, AX + 0.04],
    [-7.60, R - 0.10, AX + 0.10],
    [HANGAR_FWD, R - 0.20, AX + 0.14],
  ], 14);

  // The coaming the door bolts to, standing a hand's breadth proud of the
  // after face, and the door itself inside it.
  hangarBody(g, M.steelDark, [
    [HANGAR_AFT, R - 0.08, AX - 0.18],
    [HANGAR_AFT + 0.16, R - 0.08, AX - 0.17],
  ], 14, 0.12);
  hangarBody(g, M.steel, [
    [HANGAR_AFT - 0.16, R - 0.26, AX - 0.22],
    [HANGAR_AFT - 0.02, R - 0.26, AX - 0.21],
  ], 14, 0.04);

  // The dogs round the rim of it, walked round the D so they sit on the
  // section and not on a circle the section does not have.
  const dr = R - 0.16;
  const dfy = casingY(HANGAR_AFT) + 0.04;
  const rim = [[dr, dfy], [-dr, dfy]];
  for (let k = 0; k <= 9; k++) {
    const a = (k / 9) * Math.PI;
    rim.push([dr * Math.cos(a), AX - 0.20 + dr * Math.sin(a)]);
  }
  for (const [x, y] of rim) {
    box(g, M.gunDark, 0.14, 0.14, 0.24, x, y, HANGAR_AFT - 0.10);
  }
  // The handwheel that drives them, and the two hinges on the port side that
  // take the weight of the leaf while it is walked clear.
  cyl(g, M.gunDark, 0.30, 0.30, 0.07, 0, AX - 0.20, HANGAR_AFT - 0.24, 16)
    .rotation.x = Math.PI / 2;
  cyl(g, M.steelDark, 0.07, 0.07, 0.34, 0, AX - 0.20, HANGAR_AFT - 0.20, 8)
    .rotation.x = Math.PI / 2;
  for (const dy of [-0.70, 0.70]) {
    box(g, M.steelDark, 0.34, 0.20, 0.22, -(R - 0.10), AX - 0.20 + dy, HANGAR_AFT - 0.04);
  }
  // A grab rail each side of the door, for the hands walking it off.
  for (const sgn of [-1, 1]) {
    cyl(g, M.bright, 0.035, 0.035, 0.70, sgn * (R - 0.62), AX - 0.20, HANGAR_AFT - 0.26, 6);
  }

  // The seam where the hangar sides meet the casing, plated over: a welded
  // fillet either side down the whole length of her, which is what kills the
  // last of the line of daylight and what the eye reads as one structure.
  for (const sgn of [-1, 1]) {
    const pos = [];
    const idx = [];
    const zs = [];
    for (let z = HANGAR_AFT; z <= HANGAR_FWD + 0.001; z += 0.7) zs.push(z);
    for (const z of zs) {
      const y = casingY(z);
      pos.push(sgn * R, y + 0.34, z, sgn * (R + 0.34), y + 0.01, z);
    }
    for (let s = 0; s < zs.length - 1; s++) {
      const a = s * 2, b = s * 2 + 1, c = s * 2 + 3, d = s * 2 + 2;
      if (sgn > 0) idx.push(a, b, c, a, c, d);
      else idx.push(a, c, b, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.light));
  }

  // Plating seams along the crown, and the lifting eyes on the top of her.
  for (const sgn of [-1, 1]) {
    for (let z = HANGAR_AFT + 1.4; z < HANGAR_FWD - 1.0; z += 2.1) {
      const a = sgn * 0.62;
      box(g, M.steelDark, 0.06, 0.05, 1.9,
        Math.sin(a) * R, AX + Math.cos(a) * R, z + 0.95);
    }
  }
  for (const z of [HANGAR_AFT + 2.2, HZ + 2.6]) {
    for (const sgn of [-1, 1]) {
      cyl(g, M.bright, 0.10, 0.10, 0.05, sgn * 0.55, AX + R + 0.04, z, 10)
        .rotation.x = Math.PI / 2;
    }
  }

  // The rails the trolley runs aft along, and the sleepers under them.
  for (const x of [-0.82, 0.82]) {
    box(g, M.steelDark, 0.16, 0.10, 17.0, x, casingY(HZ - 12) + 0.07, HZ - 12.4);
  }
  for (let i = 0; i < 9; i++) {
    const z = HZ - 5.4 - i * 1.9;
    box(g, M.plankDark, 2.00, 0.05, 0.28, 0, casingY(z) + 0.05, z);
  }
  return { axis: AX, z: HZ };
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
  const piv = cb + 0.92;
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

  // The boom, in a group of its own because it works: topped on its heel and
  // trained round on the king post. Stowed it lies aft over the aeroplane,
  // which is where a derrick is left when there is one on deck to lift.
  const boom = new THREE.Group();
  boom.position.set(0, piv, cz);
  boom.rotation.set(DERRICK.LEAN_STOW, DERRICK.SW_STOW, 0);
  boom.userData.dynamic = true;
  g.add(boom);
  cyl(boom, M.steel, 0.15, 0.21, DERRICK.L, 0, DERRICK.L / 2, 0, 10);
  // The head fitting and the sheave the runner reeves through.
  cyl(boom, M.gunDark, 0.10, 0.10, 0.34, 0, DERRICK.L + 0.08, 0, 8);
  cyl(boom, M.gunDark, 0.14, 0.14, 0.07, 0, DERRICK.L - 0.12, 0, 10)
    .rotation.z = Math.PI / 2;

  // The fall: the runner, the block and the hook. In the ship's frame and not
  // the boom's, because a fall hangs straight down whatever the boom is doing,
  // and its length is what the winch is paying out.
  const fall = new THREE.Group();
  fall.userData.dynamic = true;
  g.add(fall);
  // Thick enough to be a wire rather than a rumour: a runner drawn at its real
  // diameter is under a pixel wide at any distance you would look at the boat
  // from, and an aeroplane hanging on nothing looks like an aeroplane flying.
  const w2 = cyl(fall, M.gunDark, 0.050, 0.050, 1.0, 0, -0.5, 0, 6);
  const block = box(fall, M.steelDark, 0.26, 0.42, 0.20, 0, -1.14, 0);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 6, 12), M.steelDark);
  hook.position.set(0, -1.46, 0);
  hook.rotation.y = Math.PI / 2;
  fall.add(hook);

  return { boom, fall, wire: w2, block, hook, piv, cz };
}

/**
 * The Besson on her trolley, abaft the hangar with her wings spread.
 *
 * She is on deck rather than in the tube because a submarine with her
 * aeroplane struck below looks exactly like a submarine, and because this is
 * the state every photograph and every model of the Surcouf is in: the whole
 * point of her, sitting on the casing where it can be seen.
 *
 * The trolley and the aeroplane are separate groups and both of them move: the
 * trolley runs forward along the rails to under the derrick, and the aeroplane
 * comes off it on the hook. Welded to the casing, as she was, the whole
 * evolution can only be a squadron appearing in the sky while the model of her
 * sits bolted to the deck.
 */
function deckPlane(g) {
  const z = -33.2;
  const deck = casingY(z);
  const cradle = new THREE.Group();
  cradle.position.set(0, deck, z);
  cradle.userData.dynamic = true;
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

  // And the aeroplane, in a group of her own in the ship's frame so she can be
  // taken off the chocks and put in the sea. She is built with the float keel
  // near zero, so the group sits on top of them.
  const plane = new THREE.Group();
  plane.position.set(0, deck + 0.52, z);
  plane.rotation.y = Math.PI;
  plane.userData.dynamic = true;
  g.add(plane);
  const p = besson(plane, 0, 0, 0.10, 0, { spin: true });
  return { cradle, plane, prop: p.userData.prop, stowZ: z, deckY: deck + 0.52 };
}

// ------------------------------------------------------------ the derrick --

/**
 * The derrick, and the evolution it works.
 *
 * She is the only thing afloat in this fleet that does not fly her aeroplane
 * off a deck or off a catapult. The Besson is wheeled forward along the rails
 * until she is under the boom, hooked on, hoisted off her trolley, swung out
 * over the port side, lowered into the sea, slipped, and then she takes off
 * from the water like any other float plane. Four minutes alongside a depot
 * ship. Twenty at sea -- and for the whole of that the boat is on the surface
 * with a hole open in her, which is the reason the whole arrangement was a bad
 * idea and the reason she is interesting.
 *
 * The numbers are fractions of `run`, which is her own launch time, so the
 * moment she unsticks is the moment the simulation puts her flight on the plot
 * however long that is set to.
 */
const DERRICK = {
  L: 8.40,             // the boom
  HANG: 2.35,          // and how far under the hook she rides
  LEAN_STOW: 0.30,     // topped up over her trolley
  LEAN_HOOK: 0.42,     // lowered a little to plumb her
  LEAN_OUT: 1.08,      // and right down to swing her over the side
  SW_STOW: Math.PI,    // trained aft
  SW_OUT: 4.53,        // and round on to the port beam
  WATER: 0.10,         // where her float sits when she is in the sea
  TRAVEL: 0.12,        // wheeled forward to under the boom
  HOIST: 0.26,         // hooked on and lifted off her chocks
  SWING: 0.52,         // swung out over the side
  LOWER: 0.70,         // and lowered into the water
  SLIP: 0.76,          // the hook comes off and the boom goes home
  RUN: 1.00,           // and she runs and unsticks
};

/** Where the boom head is, for a given topping angle and swing. */
function boomHead(lean, sw, piv, cz) {
  return [
    Math.sin(sw) * Math.sin(lean) * DERRICK.L,
    piv + Math.cos(lean) * DERRICK.L,
    cz + Math.cos(sw) * Math.sin(lean) * DERRICK.L,
  ];
}

const ease = (u) => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };
const span = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)));
const mix = (a, b, k) => a + (b - a) * k;

/**
 * Work the derrick.
 *
 * Everything is positioned in the ship's own frame from the clock, rather than
 * parented to the boom: a fall hangs straight down whatever the boom is doing,
 * and a boom that is both topped and trained is two rotations that a parented
 * hook would have to undo again.
 */
function stepDerrick(deck, t) {
  const D = DERRICK;
  const u = deck.launchAt === null ? -1 : (t - deck.launchAt) / deck.run;
  const piv = deck.piv;
  const cz = deck.cz;

  // Where the boom is, and where her trolley is under it.
  let lean = D.LEAN_STOW;
  let sw = D.SW_STOW;
  let cradleZ = deck.stowZ;
  if (u >= 0 && u < D.TRAVEL) {
    const k = ease(span(u, 0, D.TRAVEL));
    lean = mix(D.LEAN_STOW, D.LEAN_HOOK, k);
    cradleZ = mix(deck.stowZ, deck.hookZ, k);
  } else if (u >= D.TRAVEL) {
    cradleZ = deck.hookZ;
    if (u < D.HOIST) lean = D.LEAN_HOOK;
    else if (u < D.SWING) {
      const k = ease(span(u, D.HOIST, D.SWING));
      lean = mix(D.LEAN_HOOK, D.LEAN_OUT, k);
      sw = mix(D.SW_STOW, D.SW_OUT, k);
    } else if (u < D.SLIP) { lean = D.LEAN_OUT; sw = D.SW_OUT; }
    else {
      // The hook is off her and the boom is coming home.
      const k = ease(span(u, D.SLIP, 1));
      lean = mix(D.LEAN_OUT, D.LEAN_STOW, k);
      sw = mix(D.SW_OUT, D.SW_STOW, k);
      cradleZ = mix(deck.hookZ, deck.stowZ, k);
    }
  }
  deck.boom.rotation.set(lean, sw, 0);
  deck.cradle.position.z = cradleZ;

  const head = boomHead(lean, sw, piv, cz);
  deck.fall.position.set(head[0], head[1], head[2]);

  // Where she is, and how much fall there is between her and the hook.
  const out = boomHead(D.LEAN_OUT, D.SW_OUT, piv, cz);
  let px = 0;
  let py = deck.deckY;
  let pz = cradleZ;
  let pry = Math.PI;
  let pitch = 0;
  let fallLen = 1.20;
  let turning = 0;
  if (u < 0 || u < D.TRAVEL) {
    // On her chocks with the hook hanging over her.
    fallLen = Math.max(0.6, head[1] - deck.deckY - 1.20);
  } else if (u < D.HOIST) {
    // Hooked on and coming up off the trolley.
    const k = ease(span(u, D.TRAVEL, D.HOIST));
    py = mix(deck.deckY, head[1] - D.HANG, k);
    fallLen = head[1] - py - 0.62;
    pry = mix(Math.PI, deck.runHeading + Math.PI * 2, k * 0.35);
    turning = 6;
  } else if (u < D.SWING) {
    // Swung out over the side, turning on the fall as she goes.
    const k = ease(span(u, D.HOIST, D.SWING));
    px = head[0]; pz = head[2]; py = head[1] - D.HANG;
    fallLen = D.HANG - 0.62;
    pry = mix(Math.PI, deck.runHeading + Math.PI * 2, 0.35 + k * 0.65);
    turning = 8;
  } else if (u < D.LOWER) {
    // Lowered away into the sea.
    const k = ease(span(u, D.SWING, D.LOWER));
    px = out[0]; pz = out[2];
    py = mix(out[1] - D.HANG, D.WATER, k);
    fallLen = out[1] - py - 0.62;
    pry = deck.runHeading;
    turning = 10 + 20 * k;
  } else if (u < D.SLIP) {
    // In the water on her own bottom, the hook coming off her.
    px = out[0]; pz = out[2]; py = D.WATER;
    fallLen = mix(out[1] - D.WATER - 0.62, 1.6, ease(span(u, D.LOWER, D.SLIP)));
    pry = deck.runHeading;
    turning = 34;
  } else {
    // The run: she opens up, the float unsticks and she climbs away. Squared
    // rather than eased, because an aeroplane on the step is accelerating the
    // whole way and the last second of the run is the fast one.
    const k = span(u, D.SLIP, 1);
    const a = k * k;
    px = mix(out[0], deck.end[0], a);
    pz = mix(out[2], deck.end[2], a);
    py = mix(D.WATER, deck.end[1], Math.max(0, (k - 0.55) / 0.45) ** 2);
    pry = deck.runHeading;
    pitch = -0.30 * Math.max(0, (k - 0.55) / 0.45);
    fallLen = mix(1.6, 1.20, k);
    turning = 40;
  }

  deck.wire.scale.y = Math.max(0.05, fallLen);
  deck.wire.position.y = -fallLen / 2;
  deck.block.position.y = -fallLen - 0.14;
  deck.hook.position.y = -fallLen - 0.46;

  if (u >= 1) {
    // Away. Latched here and not only on the frame the run ends, because a
    // frame can step clean over it -- see the catapult, which learned this the
    // hard way.
    if (!deck.gone) {
      deck.model.position.set(deck.end[0], deck.end[1], deck.end[2]);
      deck.model.rotation.set(-0.30, deck.runHeading, 0);
      deck.model.updateMatrixWorld(true);
      deck.endMatrix = deck.model.matrixWorld.clone();
      deck.gone = true;
    }
    deck.airborne = true;
    deck.model.visible = false;
    return;
  }
  deck.model.visible = true;
  deck.model.position.set(px, py, pz);
  deck.model.rotation.set(pitch, pry, 0);
  if (deck.prop) deck.prop.rotation.z += turning * 0.05;
}

/**
 * Wire her derrick up: what a launch is, and what comes after one.
 *
 * Same contract the catapult ships work to, so the scene does not have to know
 * that this one puts her aeroplane in the water instead of throwing it off a
 * girder: it says when the order was given and she plays the rest herself.
 */
function fitDerrick(g, parts) {
  const piv = parts.piv;
  const cz = parts.cz;
  const deck = {
    ...parts,
    live: null, launchAt: null, airborne: false, gone: false,
    flightId: 0, pending: [], endMatrix: null,
    piv, cz,
    hookZ: boomHead(DERRICK.LEAN_HOOK, DERRICK.SW_STOW, piv, cz)[2],
    rig: DERRICK,
  };
  // Two names for the aeroplane on purpose. The scene hands the model about by
  // `deckPlane`, and the approach spins the airscrew through `deck.plane.prop`
  // -- which is the shape the catapult ships publish. `model` is the group this
  // evolution positions.
  deck.model = deck.plane;
  deck.plane = { group: deck.model, prop: deck.prop };
  g.userData.deck = deck;
  g.userData.deckPlane = deck.model;
  g.userData.landingSpot = [0, deck.deckY, deck.stowZ];
  g.userData.step = (t) => stepDerrick(deck, t);
  g.userData.launch = (t) => {
    deck.launchAt = t;
    deck.airborne = false;
    deck.gone = false;
    deck.endMatrix = null;
    deck.model.visible = true;
  };
  // Craned aboard again and bolted down on her trolley. There is nowhere else
  // for her to go: a submarine's hangar takes her in pieces and that is a
  // day's work alongside, not something done between strikes.
  g.userData.recover = () => {
    deck.launchAt = null;
    deck.airborne = false;
    deck.gone = false;
    deck.endMatrix = null;
    deck.model.visible = true;
    stepDerrick(deck, 0);
  };
  g.userData.stow = g.userData.recover;
  return deck;
}

// --------------------------------------------------------- the gun decks --

// How tall each pedestal is. The gun stands on top of it and the pedestal
// stands on the platform, and both numbers are written once, here, so that the
// thing a gun is put on and the thing the model draws are the same thing.
const AA_PED_HEAVY = 0.42;
const AA_PED_LIGHT = 0.32;

/** The floor of the 37 mm bandstand on the crown of the hangar. */
function bandstandY() { return hangarTopY() + 0.14; }
/** The floor of the two machine-gun sponsons on the tower. */
function aaTubY() { return casingY(-2.0) + AA_BRIDGE; }
/** Where a gun of this calibre has its trunnion base. */
function aaStandY(caliber) {
  return caliber >= 30 ? bandstandY() + AA_PED_HEAVY : aaTubY() + AA_PED_LIGHT;
}

/**
 * The platforms the light battery stands on: built static, and built here.
 *
 * This is a separate pass from `flak` on purpose. Everything inside a gun's
 * training group turns with the gun, and a tub that turns with the gun it is
 * meant to hold is the single most obvious thing that can be wrong with a
 * model of a warship -- the bandstand sweeps round with the barrels like a
 * skirt. Her tubs, her gratings, her ready-use lockers and her pedestals are
 * all structure; only the mounting above the pedestal moves.
 */
function gunPositions(g) {
  for (const gun of CLS.aa.guns) {
    const heavy = gun.caliber >= 30;
    for (const m of gun.mounts) {
      if (heavy) bandstand(g, m.x, m.z);
      else aaSponson(g, m.x, m.z);
      // The pedestal, which is structure: the gun turns on top of it.
      cyl(g, M.steelDark, heavy ? 0.52 : 0.36, heavy ? 0.60 : 0.42,
        heavy ? AA_PED_HEAVY : AA_PED_LIGHT, m.x,
        (heavy ? bandstandY() : aaTubY()) + (heavy ? AA_PED_HEAVY : AA_PED_LIGHT) / 2,
        m.z, 16);
      // The roller path the mounting runs on, standing just proud of it.
      cyl(g, M.gunDark, heavy ? 0.56 : 0.40, heavy ? 0.56 : 0.40, 0.06, m.x,
        aaStandY(gun.caliber) - 0.03, m.z, 16);
    }
  }
}

/**
 * The 37 mm bandstand, bedded down on to the round crown of the hangar.
 *
 * The crown is a half-cylinder, so a flat disc laid on it touches along one
 * line and stands in the air everywhere else. The seat is lofted instead: a
 * skirt that starts inside the crown and comes up out of it to a flat floor,
 * with the splinter plating carried round above that.
 */
function bandstand(g, x, z) {
  const crown = hangarTopY();
  const deck = bandstandY();
  const seat = loftRings(g, M.light, [
    [1.44, 1.48, z, crown - 0.78],
    [1.58, 1.62, z, crown - 0.02],
    [1.60, 1.64, z, deck],
  ], { n: 20, px: 0.62, pz: 0.62 });
  if (seat) seat.position.x = x;
  const tub = loftRings(g, M.steel, [
    [1.60, 1.64, z, deck],
    [1.69, 1.73, z, deck + 0.24],
    [1.65, 1.69, z, deck + 0.82],
  ], { n: 20, px: 0.62, pz: 0.62, cap: false });
  if (tub) tub.position.x = x;
  // The gratings on the floor of it, and the drain scuttles at the foot of
  // the plating, which is what stops a tub full of green water.
  for (let i = -4; i <= 4; i++) {
    box(g, M.steelDark, 2.90, 0.03, 0.09, x, deck + 0.03, z + i * 0.32);
  }
  for (const a of [0.9, 2.24, 4.04, 5.38]) {
    box(g, M.cave, 0.16, 0.10, 0.16,
      x + Math.sin(a) * 1.62, deck + 0.08, z + Math.cos(a) * 1.66);
  }
  // Ready-use lockers round the after half of it: 37 mm comes up in six-round
  // clips and they are kept where the loader's hand falls.
  for (const a of [2.34, 2.80, 3.48, 3.94]) {
    const b = box(g, M.steelDark, 0.48, 0.36, 0.32,
      x + Math.sin(a) * 1.34, deck + 0.18, z + Math.cos(a) * 1.38);
    b.rotation.y = a;
  }
  // The training handrail round the inside, on its stanchions.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    cyl(g, M.bright, 0.03, 0.03, 0.34,
      x + Math.sin(a) * 1.50, deck + 0.99, z + Math.cos(a) * 1.54, 6);
  }
  // The ladder up the starboard side of the hangar to it, and the grab rail
  // at the head of it.
  ladder(g, M.bright, HANGAR_R + 0.10, casingY(z) + 0.10, deck + 0.10,
    z + 1.30, z + 1.58);
  cyl(g, M.bright, 0.035, 0.035, 0.66, HANGAR_R - 0.28, deck + 0.52, z + 1.44, 6);
}

/**
 * One of the two machine-gun sponsons bracketed off the side of the tower.
 *
 * A floor with a bulwark round it and the gun standing on the floor, which is
 * what a tub is. She had the tub drawn as a shallow bowl with the gun sitting
 * on its rim, three quarters of a metre above the deck her crew were standing
 * on -- so the gunner was firing over his own head.
 */
function aaSponson(g, x, z) {
  const floor = aaTubY();
  const sgn = Math.sign(x) || 1;
  const seat = loftRings(g, M.light, [
    [1.14, 1.28, z, floor - 0.52],
    [1.26, 1.40, z, floor - 0.08],
    [1.28, 1.42, z, floor],
  ], { n: 18, px: 0.6, pz: 0.66 });
  if (seat) seat.position.x = x;
  const tub = loftRings(g, M.steel, [
    [1.28, 1.42, z, floor],
    [1.35, 1.49, z, floor + 0.22],
    [1.31, 1.45, z, floor + 0.74],
  ], { n: 18, px: 0.6, pz: 0.66, cap: false });
  if (tub) tub.position.x = x;
  // The gratings, and the brackets back into the tower side that hold the
  // whole thing up.
  for (let i = -3; i <= 3; i++) {
    box(g, M.steelDark, 2.40, 0.03, 0.09, x, floor + 0.03, z + i * 0.32);
  }
  for (const dz of [-0.82, 0.82]) {
    const br = cyl(g, M.steelDark, 0.07, 0.09, 1.70,
      x - sgn * 0.52, floor - 0.82, z + dz, 6);
    br.rotation.z = sgn * 0.56;
  }
  box(g, M.steelDark, 1.30, 0.12, 0.22, x - sgn * 0.30, floor - 0.06, z);
  // Two ready-use boxes of drum magazines, outboard where they are out of the
  // way of the training gear.
  for (const dz of [-0.72, 0.72]) {
    box(g, M.steelDark, 0.30, 0.34, 0.48, x + sgn * 1.02, floor + 0.17, z + dz);
  }
  // A drain scuttle each side of the tub.
  for (const dz of [-1.20, 1.20]) {
    box(g, M.cave, 0.14, 0.09, 0.14, x + sgn * 1.24, floor + 0.07, z + dz);
  }
}

// --------------------------------------------------------- the light guns --

/**
 * The mountings themselves: a pedestal cap, a cradle and the barrels.
 *
 * Nothing structural goes in here. Everything below `arm` is inside a group
 * that trains, and whatever is put in it trains too.
 */
function flak(g) {
  const out = [];
  for (const gun of CLS.aa.guns) {
    const heavy = gun.caliber >= 30;
    for (const m of gun.mounts) {
      const node = new THREE.Group();
      node.position.set(m.x, aaStandY(gun.caliber), m.z);
      node.userData.dynamic = true;
      // The training mass, the shield and the shoulder rests.
      cyl(node, M.gun, heavy ? 0.46 : 0.32, heavy ? 0.46 : 0.32, 0.16, 0, 0.08, 0, 14);
      box(node, M.gun, heavy ? 0.76 : 0.50, 0.38, heavy ? 0.86 : 0.56, 0, 0.36, 0);
      if (heavy) box(node, M.steel, 1.05, 0.60, 0.09, 0, 0.64, 0.46);
      // The layer's and trainer's seats, out on their brackets either side.
      for (const sgn of [-1, 1]) {
        cyl(node, M.steelDark, heavy ? 0.16 : 0.13, heavy ? 0.16 : 0.13, 0.05,
          sgn * (heavy ? 0.52 : 0.38), 0.40, -0.22, 10);
        cyl(node, M.gunDark, 0.035, 0.035, 0.30,
          sgn * (heavy ? 0.52 : 0.38), 0.24, -0.22, 6);
      }
      const cradle = new THREE.Group();
      cradle.position.set(0, 0.56, 0);
      cradle.rotation.x = -0.30;
      node.add(cradle);
      // The trunnion the cradle swings on, drawn across the mounting.
      cyl(node, M.gunDark, 0.07, 0.07, heavy ? 0.94 : 0.66, 0, 0.56, 0, 10)
        .rotation.z = Math.PI / 2;
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
        // The spent-case chute under it.
        box(cradle, M.steelDark, 0.12, 0.16, 0.22, x, -0.16, 0.02);
        muzzles.push([x, 0, heavy ? 2.34 : 1.36]);
      }
      // The breech block and the recoil cylinder behind the barrels.
      box(cradle, M.gun, heavy ? 0.50 : 0.34, 0.26, 0.42, 0, 0.02, -0.26);
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

// -------------------------------------------------------- the detail pass --

/**
 * The hundred small things that are the difference between a shape and a ship.
 *
 * Everything in here is structure, built before the merge, and everything in
 * here is on the outside of her where it can be seen: frame lines and butt
 * straps down the tanks, vent risers and kingston fairings, draught marks,
 * anodes, the docking keel, then on top of her the ringbolts, mushroom heads,
 * fairleads, staffs, floats and scuttles that a casing is covered in.
 *
 * None of it is load-bearing and none of it moves. It is there because a bare
 * lofted hull the length of a football pitch has nothing on it for the eye to
 * measure itself against, and reads as a toy however good its lines are.
 */
function detail(g) {
  hullDetail(g);
  casingDetail(g);
  towerDetail(g);
}

/**
 * The outside of the kiosque: what a conning tower is actually covered in.
 *
 * Every fitting here is put on the skin by asking `towerSkin` where the skin
 * is, rather than by guessing a radius off a superellipse -- which is how a
 * door ends up floating a hand's breadth off the side of a tower.
 */
function towerDetail(g) {
  const base = casingY(TOWER_Z);
  const on = (dy, z, dx = 0) => {
    const w = towerSkin(dy, z);
    return w ? w + dx : 0;
  };

  // The venting slots low down in the tower sides, which is what lets the
  // free-flooding space inside the kiosque drain when she surfaces. A French
  // boat's tower is drilled with them and they are the thing that says at a
  // glance that the tower is a fairing and not a deckhouse.
  for (let z = TOWER_Z - 5.0; z < TOWER_Z + 4.9; z += 0.86) {
    const w = on(0.22, z);
    if (!w) continue;
    for (const sgn of [-1, 1]) box(g, M.cave, 0.06, 0.26, 0.42, sgn * w, base + 0.22, z);
  }

  // The horizontal plating seams up her, and the vertical butt straps: three
  // strakes, which is how a tower this size is put together.
  for (const dy of [1.05, 2.15, 3.25]) {
    for (let z = TOWER_Z - 5.4; z < TOWER_Z + 5.4; z += 0.55) {
      const w = on(dy, z);
      if (!w) continue;
      for (const sgn of [-1, 1]) box(g, M.light, 0.045, 0.07, 0.58, sgn * w, base + dy, z);
    }
  }
  for (const z of [TOWER_Z - 4.2, TOWER_Z - 1.4, TOWER_Z + 1.4, TOWER_Z + 4.2]) {
    for (let dy = 0.5; dy < 3.6; dy += 0.45) {
      const w = on(dy, z);
      if (!w) continue;
      for (const sgn of [-1, 1]) box(g, M.light, 0.04, 0.48, 0.12, sgn * w, base + dy, z);
    }
  }

  // The watertight door into the tower on the after face, with its hinges, its
  // dogs and the handwheel in the middle of it.
  const dz = TOWER_Z - 5.62;
  box(g, M.steelDark, 0.96, 1.86, 0.10, 0, base + 1.05, dz);
  box(g, M.steel, 0.76, 1.66, 0.09, 0, base + 1.05, dz - 0.08);
  for (const dyy of [-0.62, 0.0, 0.62]) {
    box(g, M.gunDark, 0.10, 0.10, 0.16, -0.40, base + 1.05 + dyy, dz - 0.14);
    box(g, M.gunDark, 0.10, 0.10, 0.16, 0.40, base + 1.05 + dyy, dz - 0.14);
  }
  cyl(g, M.gunDark, 0.17, 0.17, 0.06, 0, base + 1.05, dz - 0.18, 12)
    .rotation.x = Math.PI / 2;
  box(g, M.steelDark, 0.30, 0.16, 0.16, 0, base + 0.10, dz + 0.02);

  // The spray strake carried round the forward face at bridge-deck level,
  // which is what throws the water off her at eighteen knots.
  for (let z = TOWER_Z + 1.0; z < TOWER_Z + 5.7; z += 0.42) {
    const w = on(3.90, z);
    if (!w) continue;
    for (const sgn of [-1, 1]) {
      const st = box(g, M.steel, 0.20, 0.07, 0.46, sgn * (w + 0.06), base + 3.90, z);
      st.rotation.z = -sgn * 0.5;
    }
  }

  // Two life buoys on the after screen of the bridge, and a signal projector
  // each side of it on its own bracket.
  for (const sgn of [-1, 1]) {
    const lz = TOWER_Z - 2.10;
    const lw = on(4.10, lz);
    if (lw) {
      const ring = cyl(g, M.mark, 0.38, 0.38, 0.10, sgn * (lw + 0.10), base + 4.02, lz, 14);
      ring.rotation.y = Math.PI / 2;
      cyl(g, M.light, 0.26, 0.26, 0.12, sgn * (lw + 0.10), base + 4.02, lz, 14)
        .rotation.y = Math.PI / 2;
    }
    const pz2 = TOWER_Z + 1.20;
    cyl(g, M.steelDark, 0.05, 0.06, 0.52, sgn * 1.42, base + 4.95, pz2, 6);
    cyl(g, M.steel, 0.20, 0.22, 0.30, sgn * 1.42, base + 5.32, pz2, 12)
      .rotation.x = Math.PI / 2;
    cyl(g, M.glass, 0.17, 0.17, 0.05, sgn * 1.42, base + 5.32, pz2 + 0.17, 12)
      .rotation.x = Math.PI / 2;
  }

  // The searchlight on the front of the bridge, which is how she found the
  // ship she had just stopped at night. It stands here and not abaft the
  // periscopes because the eight-metre rangefinder is back there and the two
  // of them were drawn in the same cubic metre of air.
  const sz = TOWER_Z + 3.05;
  cyl(g, M.steelDark, 0.11, 0.14, 0.72, 0, base + 4.81, sz, 10);
  cyl(g, M.steel, 0.40, 0.40, 0.50, 0, base + 5.35, sz, 16)
    .rotation.x = Math.PI / 2;
  cyl(g, M.glass, 0.35, 0.35, 0.05, 0, base + 5.35, sz + 0.27, 16)
    .rotation.x = Math.PI / 2;
  cyl(g, M.steelDark, 0.14, 0.14, 0.22, 0, base + 5.35, sz - 0.32, 10)
    .rotation.x = Math.PI / 2;

  // Grab rails up the after face beside the ladder, and the two footholds cut
  // in the tower above the door.
  for (const sgn of [-1, 1]) {
    for (let dy = 1.40; dy < 4.30; dy += 0.52) {
      const w = on(dy, TOWER_Z - 5.30);
      if (!w) continue;
      cyl(g, M.bright, 0.030, 0.030, 0.26, sgn * 0.62, base + dy, TOWER_Z - 5.42, 6)
        .rotation.z = Math.PI / 2;
    }
  }
}

/** Down her sides: the plating, the openings in it, and the marks on it. */
function hullDetail(g) {
  // Plating relief is painted the colour of the plate it is raised out of, or
  // it is not relief at all: a grey strap carried down over red oxide reads as
  // a rail bolted to her side, which is what the first pass of this looked
  // like -- a picket fence the length of the boat.
  const band = (y) => (y < BOOT_LO ? M.antifoul : y < BOOT_HI ? M.boot : M.hull);

  /**
   * Where to stand a fitting on the shell so that it stays on the shell.
   *
   * A box put at x = shellAt(t, y) is only seated if the plating is going the
   * way the box is: at the turn of the bilge, at the stem and at the stern the
   * shell falls away faster than the box is deep, and half of it ends up
   * hanging in the water. A row of them all down a hull that is tapering reads
   * as a fringe of tabs round the silhouette -- barnacles, or damage.
   *
   * So the seat is taken as the narrowest the shell gets anywhere the fitting
   * touches, in y and in z both, and set inboard by half the fitting's own
   * thickness. Where that comes out narrower than `min` there is no room for
   * the thing at all and it is left off, which is what keeps the marks at her
   * stem from stacking up on the centreline and reading as a slot.
   */
  const seat = (t, y0, y1, dz, thick, min) => {
    let w = Infinity;
    for (let i = 0; i <= 2; i++) {
      const y = y0 + ((y1 - y0) * i) / 2;
      for (const d of [-dz, 0, dz]) {
        const tt = Math.max(-1, Math.min(1, t + d / HALF));
        w = Math.min(w, shellAt(tt, y));
      }
    }
    return w >= min ? w - thick / 2 : 0;
  };

  // The transverse frame lines: a raised strap every four metres over the
  // whole of her middle body, standing a couple of centimetres proud and
  // following the round of the shell, so it goes round her rather than being
  // a flat plate leaning on her.
  for (let z = -HALF + 12; z < HALF - 12; z += 4.0) {
    const t = z / HALF;
    const y0 = keelAt(t) + 0.55;
    const y1 = sheerAt(t) - 0.20;
    const rows = 8;
    const h = (y1 - y0) / rows;
    for (let r = 0; r <= rows; r++) {
      const y = y0 + h * r;
      const w = seat(t, y - h / 2, y + h / 2, 0.07, 0.045, 0.55);
      if (!w) continue;
      for (const sgn of [-1, 1]) box(g, band(y), 0.045, h + 0.04, 0.13, sgn * w, y, z);
    }
  }

  // The horizontal butt straps: three seams the length of her, which is how
  // the strakes of a real shell are joined and what tells the eye the side is
  // plate and not a skin.
  for (const frac of [0.22, 0.52, 0.80]) {
    for (let z = -HALF + 8; z < HALF - 8; z += 1.4) {
      const t = z / HALF;
      const y = keelAt(t) + (sheerAt(t) - keelAt(t)) * frac;
      const w = seat(t, y - 0.05, y + 0.05, 0.75, 0.04, 0.60);
      if (!w) continue;
      for (const sgn of [-1, 1]) box(g, band(y), 0.04, 0.09, 1.50, sgn * w, y, z);
    }
  }

  // The main vent risers along the top of the saddle tanks: the pipes the air
  // goes out of when she opens her vents to dive, standing just under the edge
  // of the casing where they can be seen from a quarter.
  for (let z = -34; z < 34; z += 5.2) {
    const t = z / HALF;
    const y = sheerAt(t) - 0.34;
    const w = seat(t, y - 0.26, y + 0.36, 0.16, 0.22, 1.10);
    if (!w) continue;
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.11, 0.13, 0.52, sgn * (w - 0.04), y, z, 8);
      cyl(g, M.steel, 0.16, 0.10, 0.12, sgn * (w - 0.04), y + 0.30, z, 8);
    }
  }

  // The kingston fairings on the bottom of the tanks, which is where the water
  // comes in. Tucked almost flush: stood off the shell and canted, as these
  // were, a row of them along the turn of the bilge catches the silhouette and
  // she grows a set of teeth down both sides.
  for (let z = -30; z < 30; z += 6.4) {
    const t = z / HALF;
    const y = keelAt(t) + 0.95;
    const w = seat(t, y - 0.21, y + 0.21, 0.55, 0.14, 1.00);
    if (!w) continue;
    for (const sgn of [-1, 1]) box(g, M.antifoul, 0.14, 0.42, 1.10, sgn * (w - 0.04), y, z);
  }

  // The docking keel down the middle of her, which is what she sits on in dry
  // dock. Only along the flat of her bottom: carried out to the ends it stands
  // proud of a keel that is rising away under it and reads as a fin.
  for (let z = -26; z < 26; z += 2.0) {
    const t = z / HALF;
    box(g, M.antifoul, 0.34, 0.20, 1.90, 0, keelAt(t) + 0.13, z);
  }

  // The zinc anodes abaft the tanks, near the screws, where the wear is.
  for (let z = -46; z < -36; z += 2.6) {
    const t = z / HALF;
    const y = Math.min(keelAt(t) + 1.30, BOOT_LO - 0.30);
    const w = seat(t, y - 0.13, y + 0.13, 0.30, 0.05, 0.70);
    if (!w) continue;
    for (const sgn of [-1, 1]) box(g, M.bright, 0.05, 0.26, 0.60, sgn * w, y, z);
  }

  // Draught marks up the stem and up the stern post, in feet, which is what a
  // French boat of 1934 was marked in decimetres of -- but the marks read the
  // same either way from twenty yards, and without them a bow is a wedge.
  //
  // Stepped aft from the very end until the shell is broad enough to carry
  // them. Painted at the stem itself, where her half-breadth is an inch, both
  // sides land on the centreline and stack into a white stripe down the middle
  // of her -- which is what it looked like, and what read as a slot.
  for (const [z0, up] of [[HALF - 3.2, 1], [-HALF + 4.0, -1]]) {
    for (let step = 0; step < 14; step++) {
      const z = z0 - up * step * 0.8;
      const t = z / HALF;
      let any = 0;
      for (let i = 0; i < 9; i++) {
        const y = keelAt(t) + 0.9 + i * 0.62;
        if (y > sheerAt(t) - 0.6) break;
        const w = seat(t, y - 0.09, y + 0.09, 0.66, 0.03, 0.70);
        if (!w) continue;
        any = 1;
        for (const sgn of [-1, 1]) {
          box(g, M.mark, 0.03, 0.18, 0.16, sgn * w, y, z + up * 0.30);
          box(g, M.mark, 0.03, 0.06, 0.34, sgn * w, y, z + up * 0.62);
        }
      }
      if (any) break;
    }
  }

  // Her pennant on the bow, which is what she is identified by in every
  // photograph of her: 17 P, a foot and a half high, both sides.
  for (const sgn of [-1, 1]) {
    // Three characters of different widths, so it reads as a number and a
    // letter at a cable rather than as three identical dabs of white.
    for (const [dz, w2] of [[0.0, 0.20], [1.00, 0.52], [2.10, 0.50]]) {
      const z = HALF - 9.0 - dz;
      const t = z / HALF;
      const y = sheerAt(t) - 1.55;
      const w = seat(t, y - 0.33, y + 0.33, w2 / 2, 0.03, 0.80);
      if (!w) continue;
      box(g, M.mark, 0.03, 0.66, w2, sgn * w, y, z);
    }
  }

  // The hydrophone fairing under the bow, and the row of limber holes along
  // the turn of the bilge that let the tank tops drain.
  const ht = 0.74;
  const hy = keelAt(ht) + 1.20;
  loftRings(g, M.antifoul, [
    [0.80, 3.20, ht * HALF, hy - 0.34],
    [0.94, 3.40, ht * HALF, hy],
    [0.70, 2.90, ht * HALF, hy + 0.30],
  ], { n: 14, px: 0.7, pz: 0.85 });
  for (let z = -40; z < 40; z += 2.3) {
    const t = z / HALF;
    const y = keelAt(t) + 0.42;
    const w = seat(t, y - 0.08, y + 0.08, 0.15, 0.05, 0.75);
    if (!w) continue;
    for (const sgn of [-1, 1]) box(g, M.cave, 0.05, 0.16, 0.30, sgn * (w - 0.01), y, z);
  }
}

/** On top of her: what a casing is actually covered in. */
function casingDetail(g) {
  // Ringbolts down both sides of the planking, which is what a boat's deck is
  // studded with and what the crew hook a lifeline to in a seaway.
  for (let z = CASE_AFT + 3; z < CASE_FWD - 3; z += 2.2) {
    const hw = casingHalf(z);
    if (hw < 0.9) continue;
    for (const sgn of [-1, 1]) {
      cyl(g, M.gunDark, 0.09, 0.09, 0.04, sgn * (hw - 0.42), casingY(z) + 0.02, z, 8)
        .rotation.x = Math.PI / 2;
    }
  }

  // Mushroom ventilator heads and deck scuttles along her, clear of the
  // hangar, the tower and the gun.
  for (const z of [26.5, 20.0, -24.5, -33.0, -39.5]) {
    if (casingHalf(z) < 0.8) continue;
    for (const sgn of [-1, 1]) {
      cyl(g, M.steelDark, 0.13, 0.15, 0.20, sgn * 0.62, casingY(z) + 0.10, z, 10);
      cyl(g, M.steel, 0.19, 0.11, 0.13, sgn * 0.62, casingY(z) + 0.26, z, 10);
    }
  }

  // Fairleads at the deck edge, forward and aft, where the wires go over the
  // side, and the cleats beside them.
  for (const z of [43.0, 37.0, -40.0, -44.0]) {
    const hw = casingHalf(z);
    if (hw < 0.55) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.30, 0.22, 0.46, sgn * (hw - 0.16), casingY(z) + 0.11, z);
      box(g, M.cave, 0.16, 0.13, 0.30, sgn * (hw - 0.16), casingY(z) + 0.14, z);
      box(g, M.gunDark, 0.13, 0.13, 0.36, sgn * (hw - 0.52), casingY(z) + 0.09, z - 0.9);
    }
  }

  // The jackstaff in the bow and the ensign staff aft, with her colours on the
  // after one: a boat rigs both in harbour and it is the first thing that
  // tells you which way she is lying.
  const jz = CASE_FWD - 1.4;
  cyl(g, M.bright, 0.055, 0.045, 2.30, 0, casingY(jz) + 1.15, jz, 8);
  const ez = CASE_AFT + 1.6;
  cyl(g, M.bright, 0.055, 0.045, 2.60, 0, casingY(ez) + 1.30, ez, 8);
  for (let i = 0; i < 3; i++) {
    const c = [P.flagBlue, P.flagWhite, P.flagRed][i];
    box(g, mat(c), 0.03, 0.56, 0.34, 0.05, casingY(ez) + 2.10, ez - 0.22 - i * 0.34);
  }

  // Two Carley floats stowed on edge against the after side of the tower and
  // one on the casing forward, in their chocks.
  for (const [x, z] of [[-1.35, -8.6], [1.35, -8.6], [0, 22.5]]) {
    const fl = loftRings(g, M.canvas, [
      [0.13, 0.86, z, casingY(z) + 0.10],
      [0.20, 0.96, z, casingY(z) + 0.62],
      [0.13, 0.86, z, casingY(z) + 1.12],
    ], { n: 14, px: 0.62, pz: 0.72, cap: false });
    if (fl) fl.position.x = x;
    for (const dz of [-0.62, 0.62]) {
      box(g, M.steelDark, 0.28, 0.24, 0.10, x, casingY(z) + 0.14, z + dz);
    }
  }

  // The ready-use hatch beside the gun well, which is where the 203 mm comes
  // up from the shell room, and the two hand rails beside it.
  const rz = CLS.turrets[0].z - 3.9;
  cyl(g, M.steelDark, 0.44, 0.44, 0.13, 0, casingY(rz) + 0.08, rz, 14);
  cyl(g, M.gun, 0.34, 0.34, 0.09, 0, casingY(rz) + 0.17, rz, 14);
  for (const sgn of [-1, 1]) {
    cyl(g, M.bright, 0.035, 0.035, 1.10, sgn * 0.78, casingY(rz) + 0.32, rz, 6)
      .rotation.x = Math.PI / 2;
  }

  // The crutch the derrick's jib is stowed in when she is not hoisting, on the
  // centreline abaft the hangar.
  const cz = HANGAR_AFT - 3.4;
  for (const sgn of [-1, 1]) {
    const st = cyl(g, M.steelDark, 0.07, 0.09, 1.05, sgn * 0.42,
      casingY(cz) + 0.52, cz, 6);
    st.rotation.z = -sgn * 0.20;
  }
  box(g, M.gunDark, 1.00, 0.10, 0.22, 0, casingY(cz) + 1.02, cz);

  // Navigation lights on the bridge screens, port and starboard, in their
  // boxes: red to port and green to starboard, which is the one piece of
  // colour on a grey boat.
  const nb = casingY(-2.0) + 4.62;
  for (const [sgn, c] of [[-1, 0x8e2a26], [1, 0x2f7a40]]) {
    box(g, M.steelDark, 0.22, 0.34, 0.24, sgn * 1.68, nb + 0.17, -0.4);
    box(g, mat(c), 0.05, 0.20, 0.16, sgn * 1.80, nb + 0.18, -0.4);
  }
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
  //
  // And clamped inside her plating at every station, which the pressure hull's
  // own table does not do for her. Her outer shell is an inch wide at the stem
  // and at the stern post; the pressure hull table still has two feet of
  // radius in it there, because a pressure hull is a cylinder with dished ends
  // and it stops well short of both -- so taken at face value her insides come
  // out through her bow, and what you see from dead ahead is a grey slab of
  // compartment standing in front of the stem.
  const inside = (t, y) => {
    const r = hullR(t);
    const dy = y - PY;
    const tube = Math.abs(dy) >= r
      ? 0.02 : Math.sqrt(Math.max(0, r * r - dy * dy)) * 0.94;
    return Math.max(0.02, Math.min(tube, shellAt(t, y) - 0.12));
  };
  buildInterior(g, {
    loa: LOA,
    shellAt: inside,
    keelY: (t) => Math.max(PY - hullR(t) * 0.94, keelAt(t) + 0.12),
    sheer: (t) => Math.min(PY + hullR(t) * 0.88, sheerAt(t) - 0.12),
    zAt: (t) => t * HALF,
  });
  casing(g);
  turretWell(g);
  tower(g);
  hangar(g);
  const crane = derrick(g);
  const air = deckPlane(g);
  fittings(g);
  stern(g);
  gunPositions(g);
  detail(g);
  mergeStatic(g, bySection(LOA));
  const turrets = mainTurret(g, casingY(CLS.turrets[0].z) + 0.62);
  const aaMounts = flak(g);
  const { mounts: torpMounts, caps } = tubes(g);
  // Her derrick, and the evolution that puts the Besson in the water. Wired up
  // after the weld, because everything it works has to have survived it.
  const P = CLS.planes;
  const bearing = (P.runBearing || 0) * (P.runSide ?? 1);
  fitDerrick(g, {
    ...crane, ...air,
    run: P.deckRun,
    runHeading: bearing,
    end: [Math.sin(bearing) * P.runOut, P.runHeight, Math.cos(bearing) * P.runOut],
  });
  mergeMoving(g);
  g.userData.step(0);
  g.userData.classId = 'surcouf';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: casingY(0),
    secMounts: [], aaMounts, torpMounts, tubeCaps: caps,
  };
}
