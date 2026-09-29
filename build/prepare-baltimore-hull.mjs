// Turn the owner's USS Baltimore sculpt into what client/js/render/baltimoreHull.js
// ships: her hull, her superstructure, her funnels and her masts as one painted
// mesh; her three 8-inch turrets as the sculpt drew them, cut free so they train
// and elevate; and her twin 5-inch, off the owner's own sculpt of it, as the
// mounting all six of her 5-inch mounts are built from. In order:
//
//   * calibrate her into this game's frame -- bow to +Z by a rotation, scaled
//     to her 205.3 m, and floated at her 7.3 m draft; her paint (see
//     build/baltimore-source.mjs) rides along a triangle at a time;
//   * cut her three turrets out of her exactly, gunhouse and barrels, down to
//     the barbette or ring each trains on; cut out every other gun the sculpt
//     cast into her -- the ten 5-inch gunhouses it drew (six of them are her
//     5-inch mounts, and four stand where her 40 mm quads did; see the photos
//     of her taken at Mare Island in October 1944), the lumps in her 40 mm tubs,
//     her catapults and her screws -- and close every hole;
//   * sand the lumps off her decks, take the dents decimation left out of
//     everything flat on her without rounding her corners, and paint every
//     deck of hers deck blue;
//   * fair her topsides; split her normals at every crease and wherever two
//     paints meet;
//   * read her surface off as a height map, which is what baltimore.js stands
//     every mounting on, and her lines, which is what her interior and her
//     armour are fitted under;
//   * lift her turrets out of the finer decimation of her forecastle and her
//     quarterdeck, each gunhouse in the frame of its mounting with its three
//     barrels turned true along the sculpt's own;
//   * and her 5-inch mount: the owner's sculpt of it with the square base it
//     stood on taken off, turned to face ahead, and its barrels turned true;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file baltimore.js decodes synchronously.
//
// The stages are build/sculpt.mjs and build/sculpt-parts.mjs; what is here is
// what is hers.
//
//   node build/prepare-baltimore-hull.mjs
//
// Reads assets/models/baltimore-hull.glb, baltimore-turrets.glb and
// baltimore-5inch.glb (made by build/baltimore-source.mjs), writes
// client/js/render/baltimoreHull.data.js. Re-run it whenever an asset or
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
  dropLoose, turnInward, thinFaces, subMesh, clone, compact, creased, barrelsOf, turnedBarrels, strippedHouse,
  measureLines,
} from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/models/baltimore-hull.glb');
const TURRET_SRC = path.join(ROOT, 'assets/models/baltimore-turrets.glb');
const GUN_SRC = path.join(ROOT, 'assets/models/baltimore-5inch.glb');
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/baltimoreHull.data.js');

const REAL_LOA = 205.3;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern and across, and her keel, flat along
// the whole of her at -0.2084. She draws 7.3 m. A unit of the sculpt is 108.06
// m of her.
const SCULPT = {
  x0: -0.950192928314209, x1: 0.9496567845344543,
  z0: -0.0996251255273819, z1: 0.09920623898506165,
};
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: (SCULPT.z0 + SCULPT.z1) / 2,
  SCALE: UNIT, localKeel: -0.2084 + 7.3 / UNIT, keelY: 0,
};

// Her paints, as build/baltimore-source.mjs numbers them.
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
// Her main deck is 5.55 m up amidships, and the Measure 22 line is a hand
// under it.
const DECK_Y = 5.55;
const M22 = 5.45;

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
// Three 8-inch/55 triples in Mk 14 turrets: No.1 low on her forecastle, No.2
// superfiring over it on a barbette three and a half metres high, and No.3 on
// her quarterdeck facing astern. `z` is the pivot, the middle of the barbette
// each gunhouse trains on (off No.2's, the one the sculpt drew clear of her
// deck: 3.9 m abaft the foot of its face), and `x` where the sculpt put it,
// which is a hand or two off her centreline. `s` is which way it faces, +1
// ahead and -1 astern; every other length is along the turret's own axis
// from the pivot, positive towards its muzzles, and across it. `floor` is the
// top of the barbette or ring it trains on -- the gunhouse is cut off there,
// and what is under it is ship. `face` is where the barrels come out of the
// gunhouse, and `barrels.along` how far out the sculpt's muzzles are.
export const TURRETS = [
  { name: 'No.1', x: 0.25, z: 57.8, s: 1, floor: 6.05, face: 3.3,
    house: { along: [-6.35, 4.3], across: [-3.6, 3.6], top: 10.2 },
    barrels: { along: 10.2, y: [7.2, 8.45] } },
  { name: 'No.2', x: 0.05, z: 44.4, s: 1, floor: 9.25, face: 3.5,
    house: { along: [-6.1, 4.2], across: [-3.6, 3.6], top: 12.9 },
    barrels: { along: 9.9, y: [10.45, 11.75] } },
  { name: 'No.3', x: -0.15, z: -55.5, s: -1, floor: 5.7, face: 3.3,
    house: { along: [-6.35, 4.25], across: [-3.75, 3.75], top: 9.25 },
    barrels: { along: 10.1, y: [6.85, 8.1] } },
];
const BARREL_HALF = 2.6;

/** Her own z of a length `a` along a turret's axis from its pivot. */
const alongZ = (t, a) => t.z + t.s * a;

function turretBoxes(t) {
  const { along, across, top } = t.house;
  const za = alongZ(t, along[0]), zb = alongZ(t, along[1]);
  const ba = alongZ(t, along[1] - 0.01 * t.s), bb = alongZ(t, t.barrels.along);
  return [
    { name: `${t.name} house`, x0: t.x + across[0], x1: t.x + across[1], y0: t.floor, y1: top,
      z0: Math.min(za, zb), z1: Math.max(za, zb) },
    { name: `${t.name} barrels`, x0: t.x - BARREL_HALF, x1: t.x + BARREL_HALF, y0: t.barrels.y[0], y1: t.barrels.y[1],
      z0: Math.min(ba, bb), z1: Math.max(ba, bb), barrels: true },
  ];
}

// ---- her 5-inch ----------------------------------------------------------------
// Six twin 5-inch/38 in Mk 38 mounts: No.51 on the centreline superfiring over
// No.2 turret, No.56 on the centreline aft superfiring over No.3 and facing
// astern, and two a side -- one under her bridge facing ahead, one abreast
// her after superstructure facing astern. Positions are the pivots of the
// sculpt's gunhouses, which is 1.9 m abaft the foot of each face; the box is
// what the sculpt drew there, gunhouse and barrels, no higher than it went,
// and as far in as it went: each wing mount's stands against her
// superstructure, and the box stops at the wall. Each is cut off at `cut`, a
// hand over the deck under it so the cut never runs along the deck itself,
// and what that leaves of the sculpt's gunhouse is then pressed down flat to
// `up`, the deck, which is what the mount stands on: the owner's mount has
// had its square base taken off, and it is not given the sculpt's back as a
// plinth. Wing mounts are given port side.
export const SECONDARY = [
  { name: '5-inch 51', x: 0, z: 31.0, rest: 0, up: 8.22, cut: 8.45, box: { x: [-2.7, 2.7], z: [28.0, 35.8], top: 12.9 } },
  { name: '5-inch 52', x: 7.3, z: 18.45, rest: 0, up: 8.02, cut: 8.15, box: { x: [5.3, 9.8], z: [16.1, 23.4], top: 12.0 } },
  { name: '5-inch 54', x: 7.5, z: -27.45, rest: Math.PI, up: 8.06, cut: 8.3, box: { x: [4.75, 10.3], z: [-33.3, -24.9], top: 12.0 } },
  { name: '5-inch 56', x: 0, z: -41.35, rest: Math.PI, up: 8.05, cut: 8.25, box: { x: [-2.6, 2.6], z: [-46.4, -38.7], top: 12.0 } },
];
const WING = (e) => e.x !== 0;

// ---- her 40 mm ---------------------------------------------------------------------
// Twelve quad 40 mm, which the sculpt drew as melted tubs, as two more 5-inch
// gunhouses a side, and as a block on the platform between her funnels: each
// is cut away down to the deck it stood on (the block to a platform at the
// height of its tub) and baltimore.js stands a quad Bofors in its own tub
// there. Port side; each has its starboard twin, the mirror of it unless
// `xs` says otherwise -- the sculpt stood the gunhouse abreast her after
// funnel further out to starboard than to port, and the box stops at the
// funnel either side. The two on her forecastle stood on a blob the sculpt
// drew across her centreline, and are carved with the lumps, down to the deck
// under it.
const BOFORS_CUTS = [
  { name: 'bofors abreast 51', x: [3.4, 7.5], z: [26.2, 31.0], y: [8.3, 10.4], deck: 8.17 },
  { name: 'bofors fwd funnel', x: [5.35, 10.6], xs: [-10.6, -5.4], z: [5.1, 12.4], y: [8.3, 11.9], deck: 8.05 },
  { name: 'bofors between funnels', x: [4.1, 8.9], z: [-6.9, -2.4], y: [10.9, 12.4] },
  { name: 'bofors aft funnel', x: [6.45, 10.1], xs: [-10.1, -6.75], z: [-20.4, -13.2], y: [8.2, 11.9], deck: 8.05 },
  { name: 'bofors abaft 54', x: [5.9, 9.3], xs: [-9.3, -5.4], z: [-38.3, -34.3], y: [5.75, 7.2], deck: 5.6 },
];

// ---- her 20 mm ----------------------------------------------------------------------
// The sculpt drew her Oerlikons as melted pairs of posts and shields along the
// edge of her 01 level, three pairs a side: they are cut off down to a hand
// over the deck and baltimore.js mounts an Oerlikon for each of them.
const OERLIKON_CUTS = [
  { name: '20 mm abreast the after funnel', x: [7.3, 10.4], z: [-24.7, -21.6], y: [8.2, 10.5], deck: 8.03 },
  { name: '20 mm abaft the forward funnel', x: [8.2, 10.9], z: [-12.4, -9.1], y: [8.4, 10.6], deck: 8.03 },
  { name: '20 mm abreast the forward funnel', x: [6.9, 10.3], z: [0.1, 3.9], y: [8.35, 10.5], deck: 8.1 },
];

// ---- a shard on her waterline -----------------------------------------------------
// Either side of her, abreast her outboard screws, the sculpt left a melted
// shard standing a metre out of her side just over the water: whatever of it
// is outboard of her plating goes, and the hole is closed in her side.
const SHARDS = [{ z: [-71.4, -67.0], y: [-0.1, 0.8], side: (z) => 9.0 + (z + 71.5) * 0.045 + 0.08 }];
const BOW_BLOB = { name: 'bow', x0: -3.4, x1: 3.2, z0: 71.8, z1: 78.4, y1: 8.6,
  floor: (z) => 6.22 + (z - 71.5) * 0.045 };

// ---- her catapults ------------------------------------------------------------------
// Two on her quarterdeck, port and starboard; the sculpt's are girders cast
// into her deck, cut off it here, and baltimore.js mounts two that train.
const CATAPULT_CUTS = [{ x: [5.0, 8.1], z: [-92.3, -68.5], y: [5.8, 8.3] }];

// ---- her screws -----------------------------------------------------------------
// Four shafts, and a screw on each, which turn: the sculpt's own are cut off
// the ends of her shafts and baltimore.js draws them.
export const SCREWS = [
  { x: 4.1, y: -5.6, z: -86.2, r: 2.0 },
  { x: -4.1, y: -5.6, z: -86.2, r: 2.0 },
  { x: 7.4, y: -5.5, z: -69.2, r: 1.6 },
  { x: -7.4, y: -5.5, z: -69.2, r: 1.6 },
];

// Every cut, as boxes. Port and starboard.
const both = (list, f) => list.flatMap((e) => [1, -1].map((s) => f(e, s)));
const span = (lo, hi, s) => (s > 0 ? [lo, hi] : [-hi, -lo]);
const SEC_BOXES = SECONDARY.flatMap((e) => (WING(e) ? [1, -1] : [1]).map((s) => {
  const [x0, x1] = span(e.box.x[0], e.box.x[1], s);
  return { name: `${e.name} ${WING(e) ? (s > 0 ? 'port' : 'stbd') : ''}`.trim(), x0, x1, z0: e.box.z[0], z1: e.box.z[1],
    y0: e.cut, y1: e.box.top, deck: e.up };
}));
const sideBoxes = (list) => both(list, (e, s) => {
  const [x0, x1] = s < 0 && e.xs ? e.xs : span(e.x[0], e.x[1], s);
  return { name: `${e.name} ${s > 0 ? 'port' : 'stbd'}`, x0, x1, z0: e.z[0], z1: e.z[1], y0: e.y[0], y1: e.y[1], deck: e.deck };
});
const BOFORS_BOXES = sideBoxes(BOFORS_CUTS);
const OERLIKON_BOXES = sideBoxes(OERLIKON_CUTS);
const CAT_BOXES = both(CATAPULT_CUTS, (e, s) => {
  const [x0, x1] = span(e.x[0], e.x[1], s);
  return { name: `catapult ${s > 0 ? 'port' : 'stbd'}`, x0, x1, z0: e.z[0], z1: e.z[1], y0: e.y[0], y1: e.y[1] };
});
const SCREW_BOXES = SCREWS.map((w) => ({
  name: `screw ${w.x > 0 ? 'port' : 'stbd'} ${Math.abs(w.x) > 6 ? 'outer' : 'inner'}`,
  x0: w.x - w.r - 0.3, x1: w.x + w.r + 0.3, z0: w.z - 1.4, z1: w.z + 1.3,
  floor: () => -99, y1: w.y + w.r * 0.97, screw: true, within: (x) => Math.abs(x) > 1.6,
}));
const CUT_BOXES = [...SEC_BOXES, ...BOFORS_BOXES, ...OERLIKON_BOXES, ...CAT_BOXES];

// ---- the lumps on her decks ----------------------------------------------------
// Every bollard, ventilator and locker the sculpt raised as a blob of deck,
// small both ways, low, and standing on a weather deck, is cut out of her and
// the hole closed flush with the deck round it (see findLumps); not where a
// gun is cut out anyway, and not a turret.
const nearGun = (x, z) => CUT_BOXES.some((k) => x > k.x0 - 0.5 && x < k.x1 + 0.5 && z > k.z0 - 0.5 && z < k.z1 + 0.5)
  || TURRETS.some((t) => {
    const [b] = turretBoxes(t);
    return x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1;
  })
  || (x > BOW_BLOB.x0 - 0.5 && x < BOW_BLOB.x1 + 0.5 && z > BOW_BLOB.z0 - 0.5 && z < BOW_BLOB.z1 + 0.5);
const LUMPS = process.env.NOSMOOTH ? [] : findLumps(m, {
  HM: { x0: -11, z0: -103, step: 0.25, nx: 89, nz: 825 },
  rBase: 2.0, maxSize: 2.8, rise: [0.12, 1.5], minBase: 5.0, keep: nearGun,
});
// And a lump is only as tall as a lump: nothing passing over it goes with it.
for (const b of LUMPS) b.y1 = b.floor(0) + 2.0;
console.log(`lumps: ${LUMPS.length} to be cut off her decks`);
const CARVE = process.env.NOCARVE ? [] : [BOW_BLOB, ...SCREW_BOXES, ...LUMPS];

// Which carve a hole belongs to, from the middle of its rim: the box it is in,
// or the nearest in plan within a metre. The screws' holes are in the ends of
// her shafts and are closed in their own plane; so is anything that belongs
// to no carve.
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
  if (!best || best.screw) return null;
  return best;
}

{
  const keep = new Uint8Array(m.T.length / 3).fill(1);
  const { P, T } = m;
  // Only the screws' blades and bosses, not her rudder or her skegs; and
  // what stands out of her side at the shards.
  for (let t = 0; t < T.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[t * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    for (const k of SCREW_BOXES) {
      if (cx > k.x0 && cx < k.x1 && cz > k.z0 && cz < k.z1 && cy < k.y1 && k.within(cx)) { keep[t] = 0; break; }
    }
    for (const k of SHARDS) {
      if (cz > k.z[0] && cz < k.z[1] && cy > k.y[0] && cy < k.y[1] && Math.abs(cx) > k.side(cz)) keep[t] = 0;
    }
  }
  const boxes = CARVE.filter((k) => !k.screw);
  const { keep: kept, cut } = carve(m, boxes, keep);
  console.log('carved:', [...cut].map(([k, n]) => `${k} ${n}`).filter((s) => !s.startsWith('lump')).join(', '));
  const s = closeHoles(m, kept, boxFor, { open: true, patchPaint: (box, rim) => rim });
  console.log('closed', s.loops, 'holes with', s.capped, 'triangles;', s.skirted, 'skirted;',
    s.fanned, 'fanned;', s.chains, 'open chains;', s.own, 'in their own plane');
}

// Her 5-inch, her 40 mm and her catapults, cut out of her exactly along the
// faces of their boxes and closed flat in them (see boxCut): a gunhouse that
// stood against her superstructure leaves a clean face on it, not a skirt.
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
    for (const b of turretBoxes(t)) {
      const r = boxCut(m, b, { rescue: true });
      console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
    }
  }
}
recomputeNormals(m);

// ---- what the cuts left --------------------------------------------------------------
dropLoose(m);
console.log(`faces facing in: ${turnInward(m)} turned`);

// ---- the dents in her flats -----------------------------------------------------
// Decimation dented everything flat on her -- her decks, the sides of her
// deckhouses, her funnels -- and the sculpt was lumpy before that. The dents
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
// roofs, is 20-B deck blue in Measure 22: whatever faces the sky over the
// Measure 22 line. What is left after that is the odd face of one paint alone
// in the other -- the top of a rail, a facet of a ventilator -- which takes
// the paint round it. The sculpt rounded her deck edge over, and the rounding
// is deck too, as far as it faces up at all: the navy blue of her side runs
// up to her deck, not to a grey kerb round it.
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
    if (C[t] !== GREY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[t * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    if (cy < M22 - 0.3) continue;
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
  for (const [from, to] of [[DECK, GREY], [GREY, DECK]]) {
    const seen = new Uint8Array(nf);
    for (let t0 = 0; t0 < nf; t0++) {
      if (seen[t0] || C[t0] !== from) continue;
      const island = [t0];
      seen[t0] = 1;
      let a = 0, rim = 0, big = false;
      for (let q = 0; q < island.length; q++) {
        const t = island[q];
        a += area(t);
        if (a > 1.0) { big = true; }
        for (let j = 0; j < 3; j++) {
          for (const u of faces.get(edgeKey(canon[T[t * 3 + j]], canon[T[t * 3 + (j + 1) % 3]]))) {
            if (u === t) continue;
            if (C[u] === from) { if (!seen[u]) { seen[u] = 1; island.push(u); } } else if (C[u] === to) rim++;
          }
        }
      }
      if (big || !rim) continue;
      // Only across the one boundary: a grey island in the deck blue is
      // turned blue only if it is flat itself.
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
// in her deck. A face that thin and that flat, over the Measure 22 line, with
// deck blue or another splinter along two of its three edges, is deck.
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
    if (C[t] !== GREY) continue;
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
    if (cy < M22 - 0.3 || hi - lo > 0.4) continue;
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
// Her deck edge amidships is her main deck, 5.55 m, and 8.6 at the bow.
const FAIR = {
  passes: 24, lambda: 0.5, mu: -0.53, max: 0.3, foot: -2.4, midbody: 0.8,
  planZ: [-95, 95, 5], planY: [-7, 5, 1],
};
let canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: 5.2, edgeCap: 9.2, slice: true, beamFloor: 0 });
if (!process.env.NOFAIR) fair(m, canon, st, FAIR);
recomputeNormals(m);
canon = weld(m);
// Her spars, wires and rails shaded round rather than as prisms.
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: FAIR.foot, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -11, z0: -103.5, step: 0.5, nx: 45, nz: 415 };
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
  const boxes = turretBoxes(t);
  const piece = clone(tm);
  boxCut(piece, boxes[0], { keep: 'inside' });
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
  const bar = barrelsOf(pts, 3, t.face, t.barrels.along, { rMin: 0.16, rMax: 0.5, bin: 0.4 });
  const { house: stripped, holes } = strippedHouse(house0, bar, t.face, t.floor + 0.02, { ahead: 0.3, axisR: 0.5 });
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
  for (let i = 1; i < house.P.length; i += 3) house.P[i] -= t.floor;
  const trunnion = [0, bar.yAt(t.face - 0.8) - t.floor, t.face - 0.8];
  const reach = bar.reachFrom(t.face - 0.8);
  const guns = turnedBarrels({ ...bar, yAt: (a) => bar.yAt(a) - t.floor }, trunnion, reach, 16);
  const muzzles = bar.xs.map((x) => [+x.toFixed(3), 0, +reach.toFixed(3)]);
  console.log(`${t.name}: gunhouse ${house.T.length / 3} triangles (${holes} holes closed); barrels at `
    + `${bar.xs.map((x) => x.toFixed(2)).join('/')}, ${reach.toFixed(2)} m trunnion to muzzle, stowed at `
    + `${(bar.pitch * 180 / Math.PI).toFixed(1)} degrees; radius ${bar.profile.map(([a, r]) => `${a.toFixed(1)}:${r.toFixed(2)}`).join(' ')}`);
  turretParts.push({
    name: t.name, x: t.x, z: t.z, rest: t.s > 0 ? 0 : Math.PI, seat: t.floor,
    trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +bar.pitch.toFixed(4), house, guns,
  });
}

// ---- her 5-inch ---------------------------------------------------------------------
// The owner's sculpt of the mount: barrels along -X, Y up, across Z, two units
// long. The square base it was sculpted standing on is cut off -- the round
// pedestal above it is the mount's own, and what it trains on -- and it is
// turned a quarter about the vertical to face ahead, a rotation as her hull
// is, and scaled to the gunhouses the ship sculpt drew for it: 4.7 m of
// gunhouse and 4.3 m across, which is a Mk 38.
const GUN_SCALE = 3.8;
// The top of the square base, which is the foot of the pedestal.
const GUN_CUT = -0.418;
// The middle of the pedestal, which is what it trains about, and where its
// barrels come out of its sloped face.
const GUN_PIVOT = 0.187;
const secondaryPart = (() => {
  const raw = readGlb(GUN_SRC);
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    const x = raw.pos[i], y = raw.pos[i + 1], z = raw.pos[i + 2];
    P.push(z * GUN_SCALE, (y - GUN_CUT) * GUN_SCALE, -(x - GUN_PIVOT) * GUN_SCALE);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const g = { P, N, T: Array.from(raw.idx) };
  fixWinding(g);
  // Its barrels run out of the sloped face of the shield a metre and a half
  // ahead of the pivot and a little over two metres up, which is where the
  // face is measured: the front of the shield at the height of the barrels,
  // between and outboard of them. The shield leans back from its foot, so its
  // foot stands further forward than that.
  const BARREL_Y = [1.85, 2.6];
  const inLane = (x) => Math.abs(x) > 0.6 && Math.abs(x) < 1.35;
  let tip = -Infinity, face = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    tip = Math.max(tip, P[i + 2]);
    if (P[i + 1] > BARREL_Y[0] && P[i + 1] < BARREL_Y[1] && !inLane(P[i]) && Math.abs(P[i]) < 1.9) face = Math.max(face, P[i + 2]);
  }
  const pts = [];
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 2] < face + 0.15 || P[i + 1] < BARREL_Y[0] || P[i + 1] > BARREL_Y[1] || !inLane(P[i])) continue;
    pts.push([P[i + 2], P[i], P[i + 1]]);
  }
  const bar = barrelsOf(pts, 2, face, tip, { rMin: 0.07, rMax: 0.2, bin: 0.2 });
  // Everything above the base, and nothing of the base.
  const body = clone(g);
  boxCut(body, { x0: -10, x1: 10, y0: 0, y1: 10, z0: -10, z1: 10 }, { keep: 'inside' });
  // The barrels come off it, and nothing of the shield: its foot, forward of
  // the face, stays.
  const { house: stripped, holes } = strippedHouse(compact(body), bar, face, 0.001, { ahead: tip - face + 1, axisR: 0.2 });
  const house = stripped;
  if (!process.env.NOSMOOTH) {
    recomputeNormals(house);
    const thinH = thinFaces(house, 0.2);
    denoise(house, weld(house), {
      sigmaS: 0.2, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.04, only: (x, y, z, q) => !thinH[q],
    });
  }
  roofed(house, 1.5);
  creased(house, 40);
  const trunnion = [0, bar.yAt(face - 0.4), face - 0.4];
  const reach = bar.reachFrom(face - 0.4);
  const guns = turnedBarrels(bar, trunnion, reach, 12);
  const muzzles = bar.xs.map((x) => [+x.toFixed(3), 0, +reach.toFixed(3)]);
  let top = 0;
  for (let i = 1; i < house.P.length; i += 3) top = Math.max(top, house.P[i]);
  console.log(`5-inch: gunhouse ${house.T.length / 3} triangles (${holes} holes closed), ${top.toFixed(2)} m high; `
    + `barrels at ${bar.xs.map((x) => x.toFixed(2)).join('/')}, face ${face.toFixed(2)}, ${reach.toFixed(2)} m trunnion to muzzle, `
    + `stowed at ${(bar.pitch * 180 / Math.PI).toFixed(1)} degrees; radius ${bar.profile.map(([a, r]) => `${a.toFixed(1)}:${r.toFixed(2)}`).join(' ')}`);
  return { trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +bar.pitch.toFixed(4), height: +top.toFixed(3), house, guns };
})();

// ---- her lines, as the sculpt has them --------------------------------------------
// What her interior and her armour are fitted under (see measureLines).
const LINES = measureLines(m, st, { z0: -103, dz: 1, nz: 207, y0: -8.5, dy: 0.5, ny: 44 }, DECK_Y);

// ---- slice, pack and write ------------------------------------------------------------
// Her decks are drawn as decks and the rest of her as plating.
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 52, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const turrets = turretParts.map((p) => ({
  name: p.name, x: p.x, z: p.z, rest: +p.rest.toFixed(6), seat: p.seat, trunnion: p.trunnion, muzzles: p.muzzles,
  pitch: p.pitch, house: packPiece(p.house).toString('base64'), guns: packPiece(p.guns).toString('base64'),
}));
const secondary = {
  trunnion: secondaryPart.trunnion, muzzles: secondaryPart.muzzles, pitch: secondaryPart.pitch,
  height: secondaryPart.height,
  // Where each of the six stands: the pivot of the gunhouse the sculpt drew,
  // which way it faces, and the deck it stands on. The wing mounts are given
  // port side; the starboard ones are their mirrors.
  seats: SECONDARY.map(({ name, x, z, rest, up }) => ({ name, x, z, rest: +rest.toFixed(6), up })),
  house: packPiece(secondaryPart.house).toString('base64'),
  guns: packPiece(secondaryPart.guns).toString('base64'),
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-baltimore-hull.mjs from the owner's sculpts. Do\n`
  + `// not hand-edit -- regenerate from the source assets instead.\n`
  + `export const BALTIMORE_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see baltimoreSurfaceY.\n`
  + `export const BALTIMORE_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her three turrets as the sculpt drew them, each in the frame of its own\n`
  + `// mounting: the gunhouse, painted, and the barrels about their trunnions.\n`
  + `export const BALTIMORE_TURRETS = ${JSON.stringify(turrets)};\n`
  + `// Her twin 5-inch, off the owner's sculpt of it, in the frame of the mounting.\n`
  + `export const BALTIMORE_SECONDARY = ${JSON.stringify(secondary)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const BALTIMORE_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
