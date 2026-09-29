// Turn the owner's USS Massachusetts sculpt into what
// client/js/render/massachusettsHull.js ships: her hull, her superstructure,
// her funnel and her masts as one painted mesh, and her three 16-inch turrets
// as the sculpt drew them, cut free so they train and elevate. In order:
//
//   * calibrate her into this game's frame -- bow to +Z by a rotation, scaled
//     to her 207.26 m, and floated at 9.0 m; her paint (see
//     build/massachusetts-source.mjs) rides along a triangle at a time;
//   * cut her three turrets out of her exactly, gunhouse and barrels, down to
//     the barbette each trains on; cut out every other gun the sculpt cast
//     into her -- the twelve 5-inch gunhouses it drew (ten of them are her
//     5-inch mounts, and two stand where the quad 40 mm abreast her after
//     superstructure did), her melted 40 mm tubs, her Oerlikons, her
//     catapult -- and close every hole;
//   * sand the lumps off her decks, take the dents decimation left out of
//     everything flat on her without rounding her corners, and paint every
//     deck of hers deck blue;
//   * fair her topsides; split her normals at every crease and wherever two
//     paints meet;
//   * read her surface off as a height map, which is what massachusetts.js
//     stands every mounting on, and her lines, which is what her interior and
//     her armour are fitted under;
//   * lift her turrets out of the finer decimation of her forecastle and her
//     quarterdeck, each gunhouse in the frame of its mounting with its three
//     barrels turned true along the sculpt's own;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file massachusetts.js decodes synchronously.
//
// Her twin 5-inch is the owner's sculpt of the mount the Baltimore carries,
// prepared once in build/prepare-baltimore-hull.mjs; what is here is only
// where each of hers stands.
//
// The stages are build/sculpt.mjs and build/sculpt-parts.mjs; what is here is
// what is hers.
//
//   node build/prepare-massachusetts-hull.mjs
//
// Reads assets/models/massachusetts-hull.glb and massachusetts-turrets.glb
// (made by build/massachusetts-source.mjs), writes
// client/js/render/massachusettsHull.data.js. Re-run it whenever an asset or
// anything below changes; the data file is committed, so a fresh clone runs
// without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, toGameFrame, bbox, fixWinding, carve, closeHoles, boxCut,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, boxUvs, findLumps, denoise,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import {
  dropLoose, turnInward, thinFaces, clone, compact, creased, barrelsOf, turnedBarrels, strippedHouse,
  measureLines, flaps,
} from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/models/massachusetts-hull.glb');
const TURRET_SRC = path.join(ROOT, 'assets/models/massachusetts-turrets.glb');
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/massachusettsHull.data.js');

const REAL_LOA = 207.26;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern and across, and her keel, flat along
// the whole of her at -0.2208. She is floated at 9.0 m (see
// build/massachusetts-source.mjs). A unit of the sculpt is 109.45 m of her.
const SCULPT = {
  x0: -0.9504846334457397, x1: 0.9432197213172913,
  z0: -0.12904030084609985, z1: 0.1281159669160843,
};
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: (SCULPT.z0 + SCULPT.z1) / 2,
  SCALE: UNIT, localKeel: -0.2208 + 9.0 / UNIT, keelY: 0,
};

// Her paints, as build/massachusetts-source.mjs numbers them.
const GREY = 0, NAVY = 1, DECK = 2, BOOT = 3, RED = 4;
// Measure 22: 5-H haze grey over 5-N navy blue, 20-B deck blue on every deck,
// a black boot topping and red lead under it.
const PALETTE = [
  [0x87, 0x90, 0x9a],
  [0x32, 0x3f, 0x56],
  [0x3e, 0x48, 0x56],
  [0x15, 0x18, 0x1c],
  [0x7a, 0x32, 0x28],
].map(paletteToLinear);
// Her main deck is 4.5 m up amidships, inside a waterway and a coaming that
// stand to 5.3 at her side; the Measure 22 line is a hand under the top of
// that, at the lowest point of her deck edge. Her main deck and her
// forecastle lie under the line, and are deck blue all the same.
const DECK_Y = 4.5;
const M22 = 5.2;
/** Nothing lower than this faces the sky and is a deck. */
const DECK_FLOOR = 3.5;

/** A painted decimation of her, in the game's frame, with a paint a triangle. */
function load(file) {
  const raw = readGlb(file);
  const m = toGameFrame(raw, { length: REAL_LOA, keelY: 0, frame: FRAME });
  m.C = [];
  for (let t = 0; t < m.T.length; t += 3) m.C.push(Math.round(raw.paint[m.T[t]]));
  return m;
}

const m = load(SRC);
{
  const { lo, hi } = bbox(m);
  console.log('calibration: SCALE', FRAME.SCALE.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- her main battery ------------------------------------------------------------
// Nine 16-inch/45 in three Mk 6 triples: No.1 on her forecastle, No.2
// superfiring over it, and No.3 on her quarterdeck facing astern. `z` is the
// pivot, the middle of the barbette each gunhouse trains on -- the sculpt drew
// every barbette as an open ring, and `x` and `z` are its middle -- and `s`
// which way it faces, +1 ahead and -1 astern; every other length is along the
// turret's own axis from the pivot, positive towards its muzzles, and across
// it. `floor` is the top of the barbette it trains on -- the gunhouse is cut
// off there, and what is under it is ship. `face` is where the barrels come
// out of the gunhouse, and `barrels.along` how far out the sculpt's muzzles
// are. The house is cut out of her up to `cut`, which takes the melted 40 mm
// the sculpt stood on the roofs of No.2 and No.3 with it; the gunhouse she
// trains is lifted out of the finer decimation up to `top`, over the roof and
// under what stood on it (massachusetts.js stands a quad Bofors there).
export const TURRETS = [
  { name: 'No.1', x: 0.1, z: 44.75, s: 1, floor: 4.95, seat: 4.95, face: 4.1,
    house: { along: [-8.7, 5.6], across: [-6.3, 6.3], top: 8.7, cut: 8.7 },
    barrels: { along: 16.3, y: [6.3, 8.7] } },
  { name: 'No.2', x: 0, z: 23.9, s: 1, floor: 7.1, seat: 6.95, face: 4.6,
    house: { along: [-8.3, 5.8], across: [-6.5, 6.5], top: 10.45, cut: 11.0 },
    barrels: { along: 17.9, y: [8.3, 10.6] },
    roofCut: { x: [-2.8, 2.3], z: [16.0, 22.8], y: [10.3, 12.8] },
    // And a melted ring on its roof, forward of that, planed off flush.
    roofTrim: { x: [-2.5, 2.0], z: [23.3, 27.2], y: [10.18, 10.6] } },
  { name: 'No.3', x: 0, z: -49.75, s: -1, floor: 4.95, seat: 4.95, face: 4.45,
    house: { along: [-9.6, 5.45], across: [-6.1, 6.1], top: 8.6, cut: 10.2 },
    barrels: { along: 17.1, y: [6.6, 9.5] } },
];
const BARREL_HALF = 3.2;

/** Her own z of a length `a` along a turret's axis from its pivot. */
const alongZ = (t, a) => t.z + t.s * a;

/** The gunhouse's box and the barrels', up to `top` (the piece) or `cut` (the hull). */
function turretBoxes(t, top) {
  const { along, across } = t.house;
  const za = alongZ(t, along[0]), zb = alongZ(t, along[1]);
  const ba = alongZ(t, along[1] - 0.01 * t.s), bb = alongZ(t, t.barrels.along);
  return [
    { name: `${t.name} house`, x0: t.x + across[0], x1: t.x + across[1], y0: t.floor, y1: top,
      z0: Math.min(za, zb), z1: Math.max(za, zb) },
    { name: `${t.name} barrels`, x0: t.x - BARREL_HALF, x1: t.x + BARREL_HALF, y0: t.barrels.y[0], y1: t.barrels.y[1],
      z0: Math.min(ba, bb), z1: Math.max(ba, bb), barrels: true },
  ];
}

/**
 * What of her goes with a turret: its gunhouse and its barrels, and what the
 * sculpt stood on its roof. No.2's gunhouse is cut off under the front of
 * her tower, which the sculpt built down on to its roof; what stood on its
 * roof is cut out clear of the tower, and the lid the cut leaves over the
 * barbette is pressed down on to it.
 */
function hullBoxes(t) {
  const [house, barrels] = turretBoxes(t, t.house.cut);
  if (t.seat !== t.floor) house.deck = t.seat;
  const out = [house, barrels];
  if (t.roofCut) {
    const r = t.roofCut;
    out.push({ name: `${t.name} roof`, x0: r.x[0], x1: r.x[1], z0: r.z[0], z1: r.z[1], y0: r.y[0], y1: r.y[1] });
  }
  return out;
}

// ---- her 5-inch ----------------------------------------------------------------
// Twenty 5-inch/38 in ten twin Mk 28 mounts, five a side, clustered round her
// superstructure: on each side one on her 01 level forward with one on the
// deck over it superfiring, one on her main deck amidships, and one on her
// main deck aft with one on her 01 level forward of it superfiring. Each
// stands at the pivot of the gunhouse the sculpt drew for it -- the middle
// of its barrels, 1.9 m abaft the foot of its face -- and faces the way that
// gunhouse did. The boxes are what the sculpt drew there, gunhouse and then
// barrels, no higher than it went and no further in: a gunhouse that stood
// against her superstructure is cut off at the wall. Each is cut off at `cut`,
// a hand over the deck under it so the cut never runs along the deck itself,
// and what that leaves is pressed down flat to `up`, the deck, which is what
// the mount stands on. The sculpt drew her a little out of true side to side,
// so each side is given where it is.
export const SECONDARY = [
  { name: '5-inch 52', x: 11.5, z: 7.6, rest: 0, up: 7.25, cut: 7.45,
    boxes: [{ x: [9.4, 13.3], z: [5.35, 9.75], top: 9.8 }, { x: [10.6, 12.45], z: [9.75, 12.5], top: 9.6 }] },
  { name: '5-inch 51', x: -11.45, z: 7.6, rest: 0, up: 7.25, cut: 7.45,
    boxes: [{ x: [-13.35, -9.6], z: [5.5, 9.75], top: 9.8 }, { x: [-12.5, -10.4], z: [9.75, 12.5], top: 9.6 }] },
  // A block stands on the deck under the barrels of each of these two, and
  // the front of each gunhouse and its barrels are cut off over it.
  { name: '5-inch 54', x: 7.6, z: -0.5, rest: 0, up: 8.95, cut: 9.3,
    boxes: [{ x: [5.3, 9.7], z: [-2.7, 1.1], top: 12.2 }, { x: [5.3, 9.7], z: [1.1, 1.6], top: 12.2, y0: 9.85 },
      { x: [6.6, 8.7], z: [1.6, 4.1], top: 11.2, y0: 10.0 }] },
  { name: '5-inch 53', x: -7.55, z: -0.5, rest: 0, up: 8.95, cut: 9.3,
    boxes: [{ x: [-9.45, -5.65], z: [-2.45, 1.1], top: 12.2 }, { x: [-9.45, -5.65], z: [1.1, 1.6], top: 12.2, y0: 9.85 },
      { x: [-8.7, -6.4], z: [1.6, 4.1], top: 11.2, y0: 10.0 }] },
  // These two stand on her main deck under the after end of her 01 level,
  // and their barrels lay over it.
  { name: '5-inch 56', x: 12.25, z: -4.35, rest: 0, up: 5.45, cut: 5.65,
    boxes: [{ x: [10.35, 14.1], z: [-6.85, -2.45], top: 8.2 }, { x: [11.3, 13.2], z: [-2.45, 0.3], top: 8.5, y0: 7.38 }] },
  { name: '5-inch 55', x: -12.15, z: -4.35, rest: 0, up: 5.45, cut: 5.65,
    boxes: [{ x: [-13.85, -10.0], z: [-6.35, -2.45], top: 8.2 }, { x: [-13.1, -10.9], z: [-2.45, 0.55], top: 8.5, y0: 7.38 }] },
  { name: '5-inch 58', x: 9.55, z: -12.15, rest: Math.PI, up: 7.25, cut: 7.45,
    boxes: [{ x: [7.6, 11.48], z: [-14.3, -10.35], top: 9.8 }, { x: [8.5, 10.6], z: [-17.0, -14.3], top: 9.2 }] },
  { name: '5-inch 57', x: -9.95, z: -12.15, rest: Math.PI, up: 7.3, cut: 7.5,
    boxes: [{ x: [-12.05, -8.25], z: [-14.3, -10.3], top: 9.8 }, { x: [-10.8, -8.9], z: [-17.0, -14.3], top: 9.2 }] },
  { name: '5-inch 60', x: 12.45, z: -19.9, rest: Math.PI, up: 5.45, cut: 5.65,
    boxes: [{ x: [10.55, 14.1], z: [-22.05, -17.95], top: 8.2 }, { x: [11.55, 13.4], z: [-24.6, -22.05], top: 7.6 }] },
  { name: '5-inch 59', x: -12.2, z: -19.9, rest: Math.PI, up: 5.45, cut: 5.65,
    boxes: [{ x: [-14.1, -10.55], z: [-22.05, -17.95], top: 8.2 }, { x: [-13.15, -11.2], z: [-24.6, -22.05], top: 7.6 }] },
];

// ---- her 40 mm ---------------------------------------------------------------------
// Seventeen quad 40 mm besides the two on her turret roofs, which the sculpt
// drew as melted tubs, as a 5-inch gunhouse either side abreast her after
// superstructure and as a gunhouse on the centreline at the after end of it:
// each is cut away down to the deck it stood on, and massachusetts.js stands a
// quad Bofors in its own tub there. `deck` is that deck; the cut runs a hand
// over it and what it leaves is pressed down on to it.
const BOFORS_CUTS = [
  { name: 'bofors bow port', x: [2.15, 6.9], z: [71.45, 76.3], y: [5.95, 8.4], deck: 5.75 },
  { name: 'bofors bow stbd', x: [-7.1, -2.35], z: [71.45, 76.3], y: [5.95, 8.4], deck: 5.75 },
  { name: 'bofors abreast No.2 port', x: [7.3, 11.75], z: [24.8, 30.4], y: [4.82, 7.2], deck: 4.58 },
  { name: 'bofors abreast No.2 stbd', x: [-11.75, -7.3], z: [24.8, 30.4], y: [4.82, 7.2], deck: 4.58 },
  { name: 'bofors tower fwd port', x: [2.3, 6.15], z: [6.4, 10.2], y: [16.3, 18.5], deck: 15.8 },
  { name: 'bofors tower fwd stbd', x: [-5.45, -2.05], z: [6.7, 9.2], y: [16.3, 18.5], deck: 15.8 },
  { name: 'bofors tower aft port', x: [1.55, 5.85], z: [2.8, 6.4], y: [16.3, 20.2], deck: 15.8 },
  { name: 'bofors tower aft stbd', x: [-5.6, -3.3], z: [2.8, 5.2], y: [16.3, 20.2], deck: 15.8 },
  { name: 'bofors 01 aft port', x: [6.15, 9.85], z: [-31.6, -24.5], y: [7.8, 9.9], deck: 7.6 },
  { name: 'bofors 01 aft stbd', x: [-10.0, -6.3], z: [-31.6, -24.75], y: [7.8, 9.9], deck: 7.6 },
  // Each of these two stood hard against her after superstructure, which
  // steps out towards the tub's forward side: the cut steps with it.
  { name: 'bofors aft port', x: [7.95, 12.85], z: [-35.6, -32.6], y: [4.75, 7.2], deck: 4.6 },
  { name: 'bofors aft port fwd', x: [9.5, 12.85], z: [-32.6, -30.4], y: [4.75, 7.2], deck: 4.6 },
  { name: 'bofors aft stbd', x: [-12.75, -7.75], z: [-35.6, -32.6], y: [4.75, 7.2], deck: 4.6 },
  { name: 'bofors aft stbd fwd', x: [-12.75, -9.3], z: [-32.6, -30.4], y: [4.75, 7.2], deck: 4.6 },
  { name: 'bofors superstructure', x: [-2.2, 2.3], z: [-40.0, -33.65], y: [10.3, 13.0], deck: 10.05 },
  { name: 'bofors quarterdeck port', x: [4.6, 9.15], z: [-72.6, -66.8], y: [4.85, 7.2], deck: 4.62 },
  { name: 'bofors quarterdeck stbd', x: [-9.15, -4.5], z: [-72.5, -66.8], y: [4.85, 7.2], deck: 4.62 },
  { name: 'bofors stern port', x: [1.6, 7.7], z: [-103.0, -97.9], y: [4.72, 7.4], deck: 4.6 },
  { name: 'bofors stern stbd', x: [-7.6, -2.3], z: [-103.0, -97.8], y: [4.72, 7.4], deck: 4.6 },
];

// ---- her 20 mm ----------------------------------------------------------------------
// The sculpt drew the Oerlikons on her quarterdeck, five a side, as melted
// posts: they are cut off down to a hand over the deck and massachusetts.js
// mounts an Oerlikon for each of them.
export const OERLIKONS = [
  { x: 7.9, z: -65.75 }, { x: 7.6, z: -64.0 }, { x: 7.7, z: -61.85 }, { x: 8.7, z: -56.4 }, { x: 8.1, z: -52.3 },
];
const OERLIKON_CUTS = OERLIKONS.flatMap((o) => [1, -1].map((s) => ({
  name: `20 mm ${s > 0 ? 'port' : 'stbd'} ${o.z}`, x: s > 0 ? [o.x - 1.05, o.x + 1.05] : [-o.x - 1.05, -o.x + 1.05],
  z: [o.z - 1.0, o.z + 1.0], y: [4.78, 6.4], deck: 4.55,
})));

// ---- her catapults ------------------------------------------------------------------
// The sculpt drew one, on her port quarter: a girder cast into her deck, cut
// off it here. massachusetts.js mounts two that train, one either side.
const CATAPULT_CUTS = [{ name: 'catapult', x: [3.2, 7.9], z: [-96.7, -78.3], y: [4.75, 8.3] }];

// ---- her screws -----------------------------------------------------------------
// Four shafts, which the sculpt drew ending in bare bosses: massachusetts.js
// draws a screw on the end of each, which turns.
export const SCREWS = [
  { x: 3.3, y: -6.8, z: -87.5, r: 2.0 },
  { x: -3.3, y: -6.8, z: -87.5, r: 2.0 },
  { x: 7.1, y: -6.8, z: -74.5, r: 1.7 },
  { x: -7.1, y: -6.8, z: -74.5, r: 1.7 },
];

// Every cut, as boxes.
const SEC_BOXES = SECONDARY.flatMap((e) => e.boxes.map((b, k) => ({
  name: `${e.name}${k ? ' barrels' : ''}`, x0: b.x[0], x1: b.x[1], z0: b.z[0], z1: b.z[1],
  y0: b.y0 ?? e.cut, y1: b.top, deck: b.y0 === undefined ? e.up : undefined,
})));
const cutBoxes = (list) => list.map((e) => ({
  name: e.name, x0: e.x[0], x1: e.x[1], z0: e.z[0], z1: e.z[1], y0: e.y[0], y1: e.y[1], deck: e.deck,
}));
const BOFORS_BOXES = cutBoxes(BOFORS_CUTS);
const OERLIKON_BOXES = cutBoxes(OERLIKON_CUTS);
const CAT_BOXES = cutBoxes(CATAPULT_CUTS);
const CUT_BOXES = [...SEC_BOXES, ...BOFORS_BOXES, ...OERLIKON_BOXES, ...CAT_BOXES];

// ---- a look at the boxes before anything is cut ------------------------------------
// CHECK=1 prints, for every box, how much of her crosses each of its walls
// over its floor (a cap there is a slab) and how much flat deck lies within
// eight centimetres of its floor (a cut there runs along a deck), and stops.
if (process.env.CHECK) {
  const { P, T } = m;
  const check = (b) => {
    const out = {};
    const walls = [['x0', 0, b.x0, 2, [b.z0, b.z1]], ['x1', 0, b.x1, 2, [b.z0, b.z1]],
      ['z0', 2, b.z0, 0, [b.x0, b.x1]], ['z1', 2, b.z1, 0, [b.x0, b.x1]]];
    for (const [nm, ax, val, other, [o0, o1]] of walls) {
      let len = 0;
      for (let t = 0; t < T.length; t += 3) {
        const v = [T[t], T[t + 1], T[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
        const d = v.map((p) => p[ax] - val);
        if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
        const pts = [];
        for (let k = 0; k < 3; k++) {
          const p = v[k], q = v[(k + 1) % 3], dp = d[k], dq = d[(k + 1) % 3];
          if ((dp < 0) !== (dq < 0)) { const s = dp / (dp - dq); pts.push([0, 1, 2].map((j) => p[j] + (q[j] - p[j]) * s)); }
        }
        if (pts.length < 2) continue;
        const [a, c] = pts;
        const inside = (p) => p[other] >= o0 && p[other] <= o1 && p[1] >= b.y0 && p[1] <= b.y1;
        if (inside(a) || inside(c)) len += Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
      }
      out[nm] = +len.toFixed(1);
    }
    let flat = 0, top = -99;
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t], T[t + 1], T[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const c = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3);
      if (c[0] < b.x0 || c[0] > b.x1 || c[2] < b.z0 || c[2] > b.z1) continue;
      const [nx, ny, nz] = faceNormal(m, T[t], T[t + 1], T[t + 2]);
      const L = Math.hypot(nx, ny, nz);
      if (ny / L > 0.9 && Math.abs(c[1] - b.y0) < 0.08) flat += L / 2;
      if (c[1] < b.y1) top = Math.max(top, c[1]);
    }
    out.flat = +flat.toFixed(2);
    out.top = +top.toFixed(2);
    return out;
  };
  const all = [...CUT_BOXES, ...TURRETS.flatMap(hullBoxes)];
  for (const b of all) {
    if (process.env.CHECK !== '1' && !b.name.includes(process.env.CHECK)) continue;
    console.log(b.name.padEnd(28), JSON.stringify(check(b)));
  }
  process.exit(0);
}

// ---- the lumps on her decks ----------------------------------------------------
// Every bollard, ventilator and locker the sculpt raised as a blob of deck,
// small both ways, low, and standing on a weather deck, is cut out of her and
// the hole closed flush with the deck round it (see findLumps); not where a
// gun is cut out anyway, and not a turret.
const nearGun = (x, z) => CUT_BOXES.some((k) => x > k.x0 - 0.5 && x < k.x1 + 0.5 && z > k.z0 - 0.5 && z < k.z1 + 0.5)
  || TURRETS.some((t) => {
    const [b] = hullBoxes(t);
    return x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1;
  });
const LUMPS = process.env.NOSMOOTH ? [] : findLumps(m, {
  HM: { x0: -14.5, z0: -105, step: 0.25, nx: 117, nz: 841 },
  rBase: 2.0, maxSize: 2.8, rise: [0.12, 1.5], minBase: 3.8, keep: nearGun,
});
// And a lump is only as tall as a lump: nothing passing over it goes with it.
for (const b of LUMPS) b.y1 = b.floor(0) + 2.0;
console.log(`lumps: ${LUMPS.length} to be cut off her decks`);
const CARVE = process.env.NOCARVE ? [] : LUMPS;

// Which carve a hole belongs to, from the middle of its rim: the box it is in,
// or the nearest in plan within a metre; anything that belongs to no carve is
// closed in its own plane.
function boxFor(cx, cz, cy) {
  let best = null, bestD = 1.0;
  for (const k of CARVE) {
    const dx = Math.max(k.x0 - cx, 0, cx - k.x1), dz = Math.max(k.z0 - cz, 0, cz - k.z1);
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (k.y1 !== undefined && cy > k.y1 + 0.6) continue;
    if (cy < k.floor(cz) - 1.2) continue;
    bestD = d; best = k;
  }
  return best;
}

// ---- the flaps on her upperworks ---------------------------------------------------
// The sculpt tore her upperworks: all over her superstructure, her directors
// and her tubs stand small thin sheets with knife edges, where something
// melted into the wall behind it (see flaps). They come off, and the slits
// they stood in are closed in their own planes; not on her crane, whose jib
// is a lattice of just such sheets, and not up her masts.
const FLAPS = process.env.NOSMOOTH ? new Uint8Array(m.T.length / 3) : flaps(m, {
  only: (x, y, z) => y > 5.6 && y < 30 && !(z < -90 && Math.abs(x) < 2.6),
});
console.log(`flaps: ${FLAPS.reduce((s, v) => s + v, 0)} faces of torn plate taken off her upperworks`);

if (CARVE.length) {
  const { keep: kept, cut } = carve(m, CARVE, FLAPS.map((f) => 1 - f));
  console.log('carved:', [...cut].filter(([k]) => !k.startsWith('lump')).map(([k, n]) => `${k} ${n}`).join(', ') || 'lumps only');
  const s = closeHoles(m, kept, boxFor, { open: true, patchPaint: (box, rim) => rim });
  console.log('closed', s.loops, 'holes with', s.capped, 'triangles;', s.skirted, 'skirted;',
    s.fanned, 'fanned;', s.chains, 'open chains;', s.own, 'in their own plane');
}

// Her 5-inch, her 40 mm, her Oerlikons and her catapult, cut out of her
// exactly along the faces of their boxes and closed flat in them (see
// boxCut): a gunhouse that stood against her superstructure leaves a clean
// face on it, not a skirt.
if (!process.env.NOCARVE) {
  for (const b of CUT_BOXES) {
    const r = boxCut(m, b, { rescue: true });
    console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
  }
  // What the cut left of each gunhouse and tub, down on to the deck: the
  // mounting that goes there stands on the deck, not on a stump.
  for (const b of CUT_BOXES.filter((k) => k.deck !== undefined)) {
    let n = 0;
    for (let i = 0; i < m.P.length; i += 3) {
      const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y < b.deck - 0.05 || y > b.y0 + 1e-4) continue;
      m.P[i + 1] = b.deck;
      n++;
    }
    console.log(`${b.name}: ${n} points pressed down on to the deck at ${b.deck}`);
  }
  for (const t of TURRETS) {
    for (const b of hullBoxes(t)) {
      const r = boxCut(m, b, { rescue: true });
      console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
      if (b.deck === undefined) continue;
      let n = 0;
      for (let i = 0; i < m.P.length; i += 3) {
        const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y < b.deck - 0.05 || y > b.y0 + 1e-4) continue;
        m.P[i + 1] = b.deck;
        n++;
      }
      console.log(`${b.name}: ${n} points pressed down on to the barbette at ${b.deck}`);
    }
  }
}
// ---- her transom -------------------------------------------------------------------
// The sculpt crumpled her transom on her port side. It is laid back on the
// surface the rest of it lies on: the aftmost of her starboard side, a metre
// at a time across it and up it, fitted with a curve across her and one up
// her, and every point of the crumple put on that, whether it was pushed in
// or thrust out.
{
  const { P } = m;
  const inRegion = (x, y, z) => z < -100 && Math.abs(x) < 6.2 && y > -1.5 && y < 4.8;
  const cells = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!inRegion(x, y, z)) continue;
    const k = `${Math.round(x)},${Math.round(y)}`;
    cells.set(k, Math.min(cells.get(k) ?? Infinity, z));
  }
  // z = a + b x^2 + c x^4 + d y + e y^2, by least squares over the aftmost
  // points of her starboard side, which the sculpt left whole.
  const basis = (x, y) => [1, x * x, x ** 4, y, y * y];
  const K = 5;
  const rows = [...cells].map(([k, z]) => { const [x, y] = k.split(',').map(Number); return [x, basis(x, y), z]; })
    .filter(([x]) => x <= 0);
  const A = [...Array(K)].map(() => new Array(K).fill(0)), B = new Array(K).fill(0);
  for (const [, r, z] of rows) for (let i = 0; i < K; i++) { B[i] += r[i] * z; for (let j = 0; j < K; j++) A[i][j] += r[i] * r[j]; }
  for (let i = 0; i < K; i++) {
    for (let k = i + 1; k < K; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < K; j++) A[k][j] -= f * A[i][j];
      B[k] -= f * B[i];
    }
  }
  const c = new Array(K).fill(0);
  for (let i = K - 1; i >= 0; i--) {
    let r = B[i];
    for (let j = i + 1; j < K; j++) r -= A[i][j] * c[j];
    c[i] = r / A[i][i];
  }
  const surf = (x, y) => basis(x, y).reduce((s, v, i) => s + v * c[i], 0);
  let n = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!inRegion(x, y, z) || x < 1.5 || x > 5.4) continue;
    const f = surf(x, y);
    const out = x < 4.6 && y > 0.4 && z < f - 0.08 && z > f - 1.0;
    if ((z > f + 0.08 && z < f + 1.5) || out) { P[i + 2] = f; n++; }
  }
  console.log(`transom: ${n} points of the crumple laid back on it, z = ${c.map((v) => v.toFixed(3)).join(' / ')}`);
}
recomputeNormals(m);

// ---- what the cuts left --------------------------------------------------------------
dropLoose(m);
console.log(`faces facing in: ${turnInward(m)} turned`);

// ---- the dents in her flats -----------------------------------------------------
// Decimation dented everything flat on her -- her decks, the sides of her
// deckhouses, her funnel -- and the sculpt was lumpy before that. The dents
// come out along each face's normal, corners and creases held (see denoise):
// her upperworks harder than her hull, because they are the lumpiest part of
// her and there are no lines of hers up there to keep. Her spars, wires and
// rails are left as drawn (see thinFaces).
const thin = thinFaces(m, 0.5);
if (!process.env.NOSMOOTH) {
  console.log(`thin: ${thin.reduce((s, v) => s + v, 0)} faces of spars, wires, rails and plate left as drawn`);
  const up = denoise(m, weld(m), {
    sigmaS: 1.0, sigmaR: 0.33, normalIters: 10, vertexIters: 25, max: 0.35,
    only: (x, y, z, t) => y > DECK_Y + 2.4 && !thin[t],
  });
  console.log(`upperworks denoised: ${up.points} points, ${(up.movedMean * 100).toFixed(1)} cm on average, ${(up.movedMax * 100).toFixed(1)} cm at most`);
  recomputeNormals(m);
  const d = denoise(m, weld(m), {
    sigmaS: 0.6, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.2, only: (x, y, z, t) => !thin[t],
  });
  console.log(`denoised: ${d.points} points, ${(d.movedMean * 100).toFixed(1)} cm on average, ${(d.movedMax * 100).toFixed(1)} cm at most`);
  recomputeNormals(m);
}

// ---- deck blue -------------------------------------------------------------------
// Every deck of hers, and every flat of her superstructure and her turret
// roofs, is 20-B deck blue in Measure 22: whatever faces the sky -- her main
// deck and her forecastle too, which lie under the Measure 22 line inside the
// coaming round her deck edge and were painted navy with her side. What is
// left after that is the odd face of one paint alone in the other -- the top
// of a rail, a facet of a ventilator -- which takes the paint round it. The
// sculpt rounded her deck edge over, and the rounding is deck too, as far as
// it faces up at all.
{
  const { P, T, C } = m;
  const nf = T.length / 3;
  // How far out her side is, a metre at a time along her.
  const hb = new Map();
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 1] < 0) continue;
    const k = Math.round(P[i + 2]);
    hb.set(k, Math.max(hb.get(k) || 0, Math.abs(P[i])));
  }
  let blue = 0;
  for (let t = 0; t < nf; t++) {
    if (C[t] !== GREY && C[t] !== NAVY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[t * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    if (cy < DECK_FLOOR) continue;
    const edge = Math.abs(cx) > (hb.get(Math.round(cz)) || 99) - 0.9 && cy < M22 + 4;
    if (ny < (edge ? 0.45 : 0.85) * Math.hypot(nx, ny, nz)) continue;
    C[t] = DECK;
    blue++;
  }
  // Islands of one paint in the other, smaller than a square metre, go.
  const canon = weld(m);
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const faces = new Map();
  for (let t = 0; t < nf; t++) {
    for (let j = 0; j < 3; j++) {
      const k = edgeKey(canon[T[t * 3 + j]], canon[T[t * 3 + (j + 1) % 3]]);
      if (!faces.has(k)) faces.set(k, []);
      faces.get(k).push(t);
    }
  }
  const area = (t) => {
    const [x, y, z] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    return Math.hypot(x, y, z) / 2;
  };
  let flipped = 0;
  for (const [from, to] of [[DECK, GREY], [GREY, DECK], [DECK, NAVY], [NAVY, DECK]]) {
    const seen = new Uint8Array(nf);
    for (let t0 = 0; t0 < nf; t0++) {
      if (seen[t0] || C[t0] !== from) continue;
      const island = [t0];
      seen[t0] = 1;
      let a = 0, rim = 0, other = 0, big = false;
      for (let q = 0; q < island.length; q++) {
        const t = island[q];
        a += area(t);
        if (a > 1.0) { big = true; }
        for (let j = 0; j < 3; j++) {
          for (const u of faces.get(edgeKey(canon[T[t * 3 + j]], canon[T[t * 3 + (j + 1) % 3]]))) {
            if (u === t) continue;
            if (C[u] === from) { if (!seen[u]) { seen[u] = 1; island.push(u); } } else if (C[u] === to) rim++; else other++;
          }
        }
      }
      // Only an island wholly in the one paint, across the one boundary.
      if (big || !rim || other) continue;
      // A grey or navy island in the deck blue is turned blue only if it is
      // flat itself.
      if (to === DECK && island.some((t) => {
        const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
        return ny < 0.5 * Math.hypot(nx, ny, nz);
      })) continue;
      for (const t of island) C[t] = to;
      flipped += island.length;
    }
  }
  console.log(`deck blue: ${blue} faces, and ${flipped} faces of islands of one paint in the other`);
}

// ---- and the splinters ------------------------------------------------------------
// Where a cut ran through a grey face at the foot of something, what was left
// of the face on the deck side is a splinter of grey a hand wide and a metre
// or two long, lying in her deck blue -- or standing a few centimetres up out
// of it, where a patch met the deck round it a step down: to the eye a crack
// in her deck. A face that thin and that flat, on a weather deck, with deck
// blue or another splinter along two of its three edges, is deck.
{
  const { P, T, C } = m;
  const nf = T.length / 3;
  const canon = weld(m);
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const faces = new Map();
  for (let t = 0; t < nf; t++) {
    for (let j = 0; j < 3; j++) {
      const k = edgeKey(canon[T[t * 3 + j]], canon[T[t * 3 + (j + 1) % 3]]);
      if (!faces.has(k)) faces.set(k, []);
      faces.get(k).push(t);
    }
  }
  const splinter = new Uint8Array(nf);
  for (let t = 0; t < nf; t++) {
    if (C[t] !== GREY && C[t] !== NAVY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const n2 = Math.hypot(nx, ny, nz);
    // Lying on the deck, or standing on it: the step of a patch is a wall a
    // hand high, and its face can lean a little either way.
    if (ny < -0.2 * n2) continue;
    let cy = 0, longest = 0, lo = Infinity, hi = -Infinity;
    for (let j = 0; j < 3; j++) {
      const a = T[t * 3 + j], b = T[t * 3 + (j + 1) % 3];
      cy += P[a * 3 + 1] / 3;
      lo = Math.min(lo, P[a * 3 + 1]); hi = Math.max(hi, P[a * 3 + 1]);
      longest = Math.max(longest, Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]));
    }
    if (cy < DECK_FLOOR || hi - lo > 0.4) continue;
    // Its width across its longest edge.
    if (n2 / (longest || 1) < 0.25) splinter[t] = 1;
  }
  let swept = 0;
  for (let pass = 0; pass < 8; pass++) {
    const now = [];
    for (let t = 0; t < nf; t++) {
      if (splinter[t] !== 1 || C[t] === DECK) continue;
      // Along the deck, and from the deck inwards: a run of splinters is
      // taken in from its end that lies against the deck.
      let deck = 0, along = 0;
      for (let j = 0; j < 3; j++) {
        const k = edgeKey(canon[T[t * 3 + j]], canon[T[t * 3 + (j + 1) % 3]]);
        const by = faces.get(k).filter((u) => u !== t);
        if (by.some((u) => C[u] === DECK)) deck++;
        if (by.some((u) => C[u] === DECK || splinter[u])) along++;
      }
      if (deck >= 1 && along >= 2) now.push(t);
    }
    for (const t of now) C[t] = DECK;
    swept += now.length;
    if (!now.length) break;
  }
  console.log(`splinters: ${swept} of grey in her deck blue`);
}

// ---- fair her sides, and split her normals at her creases ------------------------
// Her deck edge amidships is 5.3 m, and 8.6 at the bow.
const FAIR = {
  passes: 24, lambda: 0.5, mu: -0.53, max: 0.3, foot: -3.0, midbody: 0.8,
  planZ: [-100, 100, 5], planY: [-8, 5, 1],
};
let canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: 5.0, edgeCap: 8.8, slice: true, beamFloor: 0 });
if (!process.env.NOFAIR) fair(m, canon, st, FAIR);
recomputeNormals(m);
canon = weld(m);
// Her spars, wires and rails shaded round rather than as prisms.
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: FAIR.foot, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const paintOf = new Float32Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOf[m.T[t * 3 + j]] = m.C[t];
  writeGlb(process.env.DUMP, { P: m.P, N: m.N, T: m.T, paint: paintOf }, 'dump');
}

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -14.5, z0: -105, step: 0.5, nx: 59, nz: 421 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// Every point of her is one paint, the one every triangle round it is (the
// normals were split wherever two paints meet).
const paintOfVertex = new Uint8Array(m.P.length / 3);
for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOfVertex[m.T[t * 3 + j]] = m.C[t];
const uvArr = boxUvs(m);
const col = paint(m, (i) => PALETTE[paintOfVertex[i]]);

/** A piece in the compact form, painted by its paint a triangle. */
function packPiece(mesh) {
  if (!mesh.C) return packPieceCompact(mesh);
  const byV = new Uint8Array(mesh.P.length / 3);
  for (let t = 0; t < mesh.T.length / 3; t++) for (let j = 0; j < 3; j++) byV[mesh.T[t * 3 + j]] = mesh.C[t];
  return packPieceCompact(mesh, (i) => PALETTE[byV[i]]);
}

/** Its roof and every flat of it deck blue, the rest haze grey. */
function roofed(mesh, over) {
  mesh.C = [];
  for (let t = 0; t < mesh.T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(mesh, mesh.T[t * 3], mesh.T[t * 3 + 1], mesh.T[t * 3 + 2]);
    let cy = 0;
    for (let j = 0; j < 3; j++) cy += mesh.P[mesh.T[t * 3 + j] * 3 + 1] / 3;
    mesh.C.push(ny > 0.85 * Math.hypot(nx, ny, nz) && cy > over ? DECK : GREY);
  }
  return mesh;
}

// ---- her turrets ----------------------------------------------------------------------
// Out of the finer decimation of her forecastle and her quarterdeck, box by
// box, exactly as they came out of her: the gunhouse down to the barbette it
// trains on, and the sculpt's barrels measured and turned afresh. Each is put
// in the frame of its own mounting -- turned half round if it faces astern.
const tm = load(TURRET_SRC);
fixWinding(tm);
const turretParts = [];
for (const t of TURRETS) {
  const toLocal = (x, z) => [t.s * (x - t.x), t.s * (z - t.z)];
  const boxes = turretBoxes(t, t.house.top);
  const piece = clone(tm);
  boxCut(piece, boxes[0], { keep: 'inside' });
  if (t.roofTrim) {
    const r = t.roofTrim;
    boxCut(piece, { x0: r.x[0], x1: r.x[1], z0: r.z[0], z1: r.z[1], y0: r.y[0], y1: r.y[1] }, { rescue: true });
  }
  const house0 = compact(piece);
  for (let i = 0; i < house0.P.length; i += 3) {
    const [x, z] = toLocal(house0.P[i], house0.P[i + 2]);
    house0.P[i] = x; house0.P[i + 2] = z;
    house0.N[i] *= t.s; house0.N[i + 2] *= t.s;
  }
  const pts = [];
  for (let i = 0; i < tm.P.length; i += 3) {
    const [x, z] = toLocal(tm.P[i], tm.P[i + 2]);
    const y = tm.P[i + 1];
    if (z < t.face + 0.6 || z > t.barrels.along || Math.abs(x) > BARREL_HALF || y < t.barrels.y[0] || y > t.barrels.y[1]) continue;
    pts.push([z, x, y]);
  }
  const bar = barrelsOf(pts, 3, t.face, t.barrels.along, { rMin: 0.18, rMax: 0.7, bin: 0.4 });
  const { house: stripped, holes } = strippedHouse(house0, bar, t.face, t.floor + 0.02, { ahead: 0.3, axisR: 0.7 });
  let house = stripped;
  if (!process.env.NOSMOOTH) {
    recomputeNormals(house);
    const thinH = thinFaces(house, 0.4);
    denoise(house, weld(house), {
      sigmaS: 0.45, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.12, only: (x, y, z, q) => !thinH[q],
    });
  }
  roofed(house, t.floor + 1.5);
  creased(house, 40);
  // Its foot down on to the barbette, where the cut was taken a hand over it.
  for (let i = 1; i < house.P.length; i += 3) house.P[i] = (house.P[i] < t.floor + 0.01 ? t.seat : house.P[i]) - t.seat;
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const trunnion = [0, bar.yAt(t.face - 0.9) - t.seat, t.face - 0.9];
  const reach = bar.reachFrom(t.face - 0.9);
  const guns = turnedBarrels({ ...bar, yAt: (a) => bar.yAt(a) - t.seat }, trunnion, reach, 18);
  const muzzles = bar.xs.map((x) => [+x.toFixed(3), 0, +reach.toFixed(3)]);
  console.log(`${t.name}: gunhouse ${house.T.length / 3} triangles (${holes} holes closed), roof ${roof.toFixed(2)} m up; barrels at `
    + `${bar.xs.map((x) => x.toFixed(2)).join('/')}, ${reach.toFixed(2)} m trunnion to muzzle, stowed at `
    + `${(bar.pitch * 180 / Math.PI).toFixed(1)} degrees; radius ${bar.profile.map(([a, r]) => `${a.toFixed(1)}:${r.toFixed(2)}`).join(' ')}`);
  turretParts.push({
    name: t.name, x: t.x, z: t.z, rest: t.s > 0 ? 0 : Math.PI, seat: t.seat, roof: +roof.toFixed(3),
    trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +bar.pitch.toFixed(4), house, guns,
  });
}

// ---- her lines, as the sculpt has them --------------------------------------------
// What her interior and her armour are fitted under (see measureLines).
const LINES = measureLines(m, st, { z0: -104, dz: 1, nz: 209, y0: -9.5, dy: 0.5, ny: 48 }, DECK_Y);

// ---- slice, pack and write ------------------------------------------------------------
// Her decks are drawn as decks and the rest of her as plating.
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 52, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const turrets = turretParts.map((p) => ({
  name: p.name, x: p.x, z: p.z, rest: +p.rest.toFixed(6), seat: p.seat, roof: p.roof, trunnion: p.trunnion,
  muzzles: p.muzzles, pitch: p.pitch,
  house: packPiece(p.house).toString('base64'), guns: packPiece(p.guns).toString('base64'),
}));
const secondary = {
  // Where each of the ten stands: the pivot of the gunhouse the sculpt drew,
  // which way it faces, and the deck it stands on.
  seats: SECONDARY.map(({ name, x, z, rest, up }) => ({ name, x, z, rest: +rest.toFixed(6), up })),
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-massachusetts-hull.mjs from the owner's sculpt.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const MASSACHUSETTS_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see massachusettsSurfaceY.\n`
  + `export const MASSACHUSETTS_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her three turrets as the sculpt drew them, each in the frame of its own\n`
  + `// mounting: the gunhouse, painted, and the barrels about their trunnions.\n`
  + `export const MASSACHUSETTS_TURRETS = ${JSON.stringify(turrets)};\n`
  + `// Where each of her twin 5-inch stands.\n`
  + `export const MASSACHUSETTS_SECONDARY = ${JSON.stringify(secondary)};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const MASSACHUSETTS_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
