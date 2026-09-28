// Turn the owner's Takao sculpt into what client/js/render/takaoHull.js ships:
// her hull, superstructure, bridge, funnels and masts as one painted mesh,
// and her five turrets as the sculpt drew them, cut free so they train and
// elevate. In order:
//
//   * calibrate both decimations of the sculpt into this game's frame -- bow
//     to +Z by a rotation, scaled to her length, fitted to her keel -- with the
//     one calibration, worked out on the hull, so the turrets come off it in
//     exactly the places they were cut out of;
//   * put back the triangles the decimator wound inside out, and take off the
//     loose pieces: the floatplane parked on her aircraft deck (hers are
//     modelled, and fly) and a sliver at the masthead;
//   * carve out every gun the sculpt had cast into her -- turrets, the 12.7 cm
//     twins in their tubs, the light guns, and the lumps her tubes were -- and
//     close each hole, together with the ones taking her rigging off left;
//   * cut the openings in her side her tubes fire through: three a side, as
//     she has them, square and clean with a sill, a head and two jambs;
//   * fair the dents decimation left in her topsides, split her normals at
//     every crease, and paint her -- Yokosuka grey, black boot topping, red
//     below, linoleum on her decks, and the spaces under her decks in shadow,
//     so an opening in her side reads as an opening and not a grey slot;
//   * read her surface off as a height map, which is what takao.js stands every
//     mounting on;
//   * lift her turrets out of the finer decimation: each gunhouse and its pair
//     of barrels as separate pieces, in the frame of the mounting, with the
//     trunnions the barrels elevate about and where their muzzles are;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file takao.js decodes synchronously.
//
// The stages are build/sculpt.mjs; what is here is what is hers.
//
//   node build/prepare-takao-hull.mjs
//
// Reads assets/models/takao-hull.glb and takao-turrets.glb (both made by
// build/strip-takao-rigging.mjs), writes client/js/render/takaoHull.data.js.
// Re-run it whenever either asset or anything below changes; the data file is
// committed, so a fresh clone runs without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, toGameFrame, bbox, fixWinding, carve, closeHoles, components, cutOpening, boxCut,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, boxUvs, findLumps, denoise,
  paletteToLinear, paint, heightmap, heightBytes, pack, faceNormal,
} from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/models/takao-hull.glb');
const TURRET_SRC = path.join(ROOT, 'assets/models/takao-turrets.glb');
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/takaoHull.data.js');

const REAL_LOA = 203.8;
const REAL_KEEL_Y = -6.35;   // takao.js keel, amidships

// ---- read her, and put her in the game's frame -----------------------------
const m = toGameFrame(readGlb(SRC), { length: REAL_LOA, keelY: REAL_KEEL_Y });
const FRAME = m.frame;
console.log('calibration: SCALE', FRAME.SCALE.toFixed(3), 'xc', FRAME.xc.toFixed(4),
  'localKeel', FRAME.localKeel.toFixed(4));
{
  const { lo, hi } = bbox(m);
  console.log('world bbox', lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- the loose pieces ------------------------------------------------------
// Everything but her hull proper: the floatplane the sculpt parked on her
// aircraft deck, and a two-triangle sliver left at the foremast head when the
// rigging came off. Her own floatplanes are built in takao.js, on her
// catapults, where they belong.
const keep0 = new Uint8Array(m.T.length / 3).fill(1);
{
  const parts = components(m);
  for (const c of parts.slice(1)) {
    for (const t of c.tris) keep0[t] = 0;
    console.log('loose piece dropped:', c.tris.length, 'triangles at',
      c.lo.map((v) => v.toFixed(1)).join(','), '..', c.hi.map((v) => v.toFixed(1)).join(','));
  }
}

// ---- her main battery --------------------------------------------------------
// Five twin 20.3 cm turrets, measured off the sculpt. `z` is the pivot, `s`
// which way she faces (+1 ahead, -1 astern), and every other length is along
// her axis from the pivot, positive towards her muzzles, and across it, to
// port when she faces ahead.
//
// No.1 and No.3 stand on the forecastle deck and No.5 on the quarterdeck;
// No.2 and No.4 superfire on barbettes that are ship and stay. No.3 faces
// astern -- the Takaos' No.3 always did, at the foot of the bridge -- and No.2's
// gunhouse overhangs her roof by two metres, so the line between them is cut
// at the height between the two. No.1's rear runs in under No.2's face the
// same way, and is cut at the height of No.2's barbette top.
//
// `face` is where the barrels come out of the gunhouse, along from the pivot;
// `rear` is a lower ceiling over the rear of a gunhouse, abaft `at` for a
// turret facing ahead and forward of it for one facing astern.
export const TURRETS = [
  { name: 'No.1', face: 3.5, z: 61.3, s: 1, floor: 5.5, lift: 0.45, rear: { at: 56.0, top: 8.25 },
    house: { along: [-6.05, 5.1], across: [-4.0, 4.0], top: 9.2 },
    barrels: { along: 9.3, y: [6.0, 7.9] } },
  { name: 'No.2', face: 3.4, z: 51.9, s: 1, floor: 8.1, overhang: { below: 48.5, floor: 8.33 },
    house: { along: [-6.4, 4.1], across: [-4.3, 4.3], top: 12.7 },
    barrels: { along: 9.4, y: [8.8, 11.2] } },
  { name: 'No.3', face: 3.3, z: 43.1, s: -1, floor: 5.5, lift: 0.45, rear: { at: 45.5, top: 8.34 },
    house: { along: [-5.2, 4.0], across: [-4.0, 4.0], top: 8.75 },
    barrels: { along: 9.9, y: [6.0, 7.9] } },
  { name: 'No.4', face: 3.45, z: -49.05, s: -1, floor: 8.85,
    house: { along: [-6.6, 4.25], across: [-4.3, 4.3], top: 12.9 },
    barrels: { along: 9.95, y: [9.2, 11.2] } },
  { name: 'No.5', face: 3.15, z: -57.95, s: -1, floor: 5.72, lift: 0.4,
    house: { along: [-5.4, 4.25], across: [-3.95, 3.95], top: 8.9 },
    barrels: { along: 9.95, y: [6.0, 7.9] } },
];
const BARREL_HALF = 1.4;

// A turret's regions as boxes in her frame, cut out of her exactly (see
// boxCut): the gunhouse down to the deck or barbette it trains on, closed
// flat there; the barrels on a floor and a ceiling of their own, so the deck
// under them stays. No.2's gunhouse over No.3's roof, and No.3 under it, are
// each two boxes, overlapping by a centimetre so nothing is left between.
function turretBoxes(t) {
  const span = (a0, a1) => (t.s > 0 ? [t.z + a0, t.z + a1] : [t.z - a1, t.z - a0]);
  const across = (c0, c1) => (t.s > 0 ? [c0, c1] : [-c1, -c0]);
  const [hz0, hz1] = span(...t.house.along);
  const [hx0, hx1] = across(...t.house.across);
  const [bz0, bz1] = span(t.house.along[1] - 0.01, t.barrels.along);
  const boxes = [];
  const house = (z0, z1, y0, y1) => boxes.push({ name: `${t.name} house`, x0: hx0, x1: hx1, y0, y1, z0, z1 });
  if (t.rear && t.s > 0) {
    house(t.rear.at - 0.01, hz1, t.floor, t.house.top);
    house(hz0, t.rear.at, t.floor, t.rear.top);
  } else if (t.rear) {
    house(hz0, t.rear.at, t.floor, t.house.top);
    house(t.rear.at - 0.01, hz1, t.floor, t.rear.top);
  } else if (t.overhang) {
    house(t.overhang.below, hz1, t.floor, t.house.top);
    house(hz0, t.overhang.below + 0.01, t.overhang.floor, t.house.top);
  } else {
    house(hz0, hz1, t.floor, t.house.top);
  }
  boxes.push({ name: `${t.name} barrels`, x0: -BARREL_HALF, x1: BARREL_HALF,
    y0: t.barrels.y[0], y1: t.barrels.y[1], z0: bz0, z1: bz1, barrels: true });
  return boxes;
}

// ---- the 12.7 cm twins ---------------------------------------------------------
// Four Type 89 twins in open-topped tubs on the shelter deck, two a side
// abreast the funnels. The tub is ship and stays -- its rim runs round the
// outboard side and both ends -- and the gun inside it goes, down to the deck
// of the tub, 9.4 m.
export const TUBS = [
  { name: '12.7 fwd port', x0: 3.9, x1: 9.45, z0: 7.62, z1: 11.78 },
  { name: '12.7 fwd stbd', x0: -9.45, x1: -3.9, z0: 7.62, z1: 11.78 },
  { name: '12.7 aft port', x0: 4.6, x1: 9.45, z0: -12.3, z1: -7.7 },
  { name: '12.7 aft stbd', x0: -9.45, x1: -4.6, z0: -12.3, z1: -7.7 },
].map((b) => ({ ...b, floor: () => 9.55 }));

// ---- the tubes ---------------------------------------------------------------------
// Her four quadruple Type 92 mountings stand on the upper deck, 7.0 m, inside
// her side, two a side: one abreast the after funnel under the shelter deck,
// one in the open well abreast the catapults. The sculpt had each as a lump:
// the forward pair poking out through her side plating and fused to the deck
// over it and under it, the after pair lying fore and aft in the well. All of
// that goes, and so does the lump of reload stowage in the forward opening,
// which is drawn properly in takao.js.
//
// The passage under the shelter deck is 1.75 m high, between the upper deck
// and the deckhead at 8.75: a hole left overhead where a lump was cut from
// under the deckhead is closed flat at the deckhead.
const DECKHEAD = 8.76;
const TUBE_BOXES = [];
for (const side of [1, -1]) {
  const X = (a, b) => (side > 0 ? { x0: a, x1: b } : { x0: -b, x1: -a });
  TUBE_BOXES.push(
    // The forward mounting's muzzles, out through her side.
    // Its hole is in her side plating, and is closed flush with it.
    { name: `tubes fwd outboard ${side}`, ...X(10.08, 12.5), z0: -7.6, z1: 0.2, floor: () => 6.8, flush: true },
    // And the rest of it, fused to the deck and the deckhead.
    { name: `tubes fwd ${side}`, ...X(4.6, 9.3), z0: -7.8, z1: -0.2, floor: () => 7.12, y1: 8.68, passage: true },
    // The after mounting in the well -- short of the catapult platform, which
    // overhangs the after end of the well at 7.6 m outboard of 8.5.
    { name: `tubes aft ${side}`, ...X(4.9, 8.35), z0: -23.4, z1: -15.2, floor: () => 7.14, y1: 9.2 },
    // The reload stowage behind the forward opening.
    { name: `reloads ${side}`, ...X(6.9, 9.35), z0: 2.9, z1: 8.4, floor: () => 7.12, y1: 8.68, passage: true },
  );
}

// ---- the light guns --------------------------------------------------------------
// Ten triple and four twin 25 mm. The sculpt has a lump wherever one of them
// is drawn standing; each is cut away down to the deck the mounting stands
// on, and takao.js stands the mounting there. Their places are on the
// datasheet (shared/ships.js); these are the lumps.
const AA_BOXES = [
  // In the tubs on the wings of the bridge, whose floor is 10.85 m: a lump
  // against the bridge and two posts by the rim. The tub itself stays.
  { name: '25 mm bridge port', x0: 6.28, x1: 8.2, z0: 17.7, z1: 22.6, floor: () => 10.98 },
  { name: '25 mm bridge stbd', x0: -8.2, x1: -6.28, z0: 17.7, z1: 22.6, floor: () => 10.98 },
  // On the forecastle abreast No.3, and on the after deck abreast No.4: a
  // lump each.
  { name: '25 mm fcsle port', x0: 5.0, x1: 7.3, z0: 32.5, z1: 35.0, floor: () => 5.52 },
  { name: '25 mm fcsle stbd', x0: -7.3, x1: -5.0, z0: 32.5, z1: 35.0, floor: () => 5.52 },
  { name: '25 mm aft port', x0: 5.3, x1: 7.3, z0: -49.4, z1: -46.9, floor: () => 5.64 },
  { name: '25 mm aft stbd', x0: -7.3, x1: -5.3, z0: -49.4, z1: -46.9, floor: () => 5.64 },
];

// ---- the lumps on her decks ---------------------------------------------------
// The sculpt draws her bollards, ventilators, capstans and deck gear as blobs
// of deck pushed up, and from any distance a ship is seen at they are rocks.
// Every one that is small both ways, low, and standing on a weather deck is
// cut out of her like a gun and the hole closed flush with the deck round it
// (see findLumps); takao.js draws her capstans and bollards as what they are.
// Not where a gun is cut out anyway, and not a turret.
const GUN_BOXES = [...TUBS, ...TUBE_BOXES, ...AA_BOXES];
const nearGun = (x, z) => GUN_BOXES.some((k) => x > k.x0 - 0.5 && x < k.x1 + 0.5 && z > k.z0 - 0.5 && z < k.z1 + 0.5)
  || TURRETS.some((t) => Math.abs(x) < 5 && Math.abs(z - t.z) < 8.5);
const LUMPS = process.env.NOSMOOTH ? [] : findLumps(m, {
  HM: { x0: -12, z0: -102, step: 0.25, nx: 97, nz: 817 },
  rBase: 2.4, maxSize: 4.0, rise: [0.12, 1.9], minBase: 3.5, keep: nearGun,
});
console.log(`lumps: ${LUMPS.length} to be cut off her decks`);

const CARVE = process.env.NOCARVE ? [] : [...GUN_BOXES, ...LUMPS];

// Which carve a hole belongs to, from the middle of its rim: the box it is
// in, or the nearest in plan within a metre. A hole overhead in the passage
// under the shelter deck is closed at the deckhead; one that belongs to no
// carve -- where her rigging came off -- in its own plane.
function boxFor(cx, cz, cy) {
  let best = null, bestD = 1.0;
  for (const k of CARVE) {
    const dx = Math.max(k.x0 - cx, 0, cx - k.x1), dz = Math.max(k.z0 - cz, 0, cz - k.z1);
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    // Holes well above a box's ceiling are not its.
    if (k.y1 !== undefined && cy > k.y1 + 0.6) continue;
    if (cy < k.floor(cz) - 1.2) continue;
    bestD = d; best = k;
  }
  if (!best || best.flush) return null;
  if (best.passage && cy > (best.floor(cz) + DECKHEAD) / 2) return { ceil: () => DECKHEAD };
  return best;
}

{
  const { keep, cut } = carve(m, CARVE, keep0);
  console.log('carved:', [...cut].map(([k, n]) => `${k} ${n}`).join(', '));
  const s = closeHoles(m, keep, boxFor, { open: true });
  console.log('closed', s.loops, 'holes with', s.capped, 'triangles;', s.skirted, 'skirted;',
    s.fanned, 'fanned;', s.chains, 'open chains;', s.own, 'in their own plane');
}
// And each turret, box by box, keeping what each box takes out of her: that
// is the turret, cut from her exactly where she was cut from it. No.1 before
// No.2, whose face overhangs No.1's rear, and No.2 before No.3, whose roof
// No.2 overhangs: the centimetre their boxes overlap by goes with the first.
const clone = (mesh) => ({ P: mesh.P.slice(), N: mesh.N.slice(), T: mesh.T.slice() });
const taken = new Map();
for (const t of TURRETS) {
  taken.set(t, []);
  for (const b of turretBoxes(t)) {
    const piece = clone(m);
    boxCut(piece, b, { keep: 'inside' });
    // Only the points it uses: the clone carried every point of her.
    const used = new Uint8Array(piece.P.length / 3);
    for (const v of piece.T) used[v] = 1;
    const map = new Int32Array(used.length).fill(-1);
    const P = [], N = [];
    for (let i = 0; i < used.length; i++) {
      if (!used[i]) continue;
      map[i] = P.length / 3;
      P.push(piece.P[i * 3], piece.P[i * 3 + 1], piece.P[i * 3 + 2]);
      N.push(piece.N[i * 3] || 0, piece.N[i * 3 + 1] || 0, piece.N[i * 3 + 2] || 0);
    }
    taken.get(t).push({ box: b, mesh: { P, N, T: piece.T.map((v) => map[v]) } });
    const r = boxCut(m, b);
    console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
  }
}

recomputeNormals(m);

// ---- her bilge keels ---------------------------------------------------------------
// The sculpt draws them as shelves three metres and more down her midbody,
// standing a metre and a half out past her side: wider under the water than
// she is at it, which no bilge keel ever was -- they were kept inside the line
// of her side so she could lie alongside -- and which put a sea a metre and a
// half out past her plating in every compartment the damage board drew full.
// Each point of her under the waterline that stands out past her side at the
// waterline is brought in, to a quarter of a metre inside it: what is left is
// a fin at the turn of her bilge, which is what a bilge keel is. Her midbody
// only, where she is parallel-sided; her forefoot and her screws are left as
// the sculpt has them.
{
  const { P } = m;
  const n = P.length / 3;
  const Z0 = -103;
  const NZ = 207;
  // Her half-breadth at the waterline, a metre at a time along her: where her
  // edges cross three heights about it. (Her side is big triangles, metres
  // long, with hardly a corner near the waterline to measure.)
  const { T } = m;
  const wl = new Float64Array(NZ);
  for (const Y of [-2.0, -1.0, 0.0]) {
    for (let t = 0; t < T.length; t += 3) {
      for (let j = 0; j < 3; j++) {
        const a = T[t + j];
        const b = T[t + (j + 1) % 3];
        const ya = P[a * 3 + 1];
        const yb = P[b * 3 + 1];
        if ((ya - Y) * (yb - Y) > 0 || ya === yb) continue;
        const s = (Y - ya) / (yb - ya);
        const k = Math.round(P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * s - Z0);
        if (k >= 0 && k < NZ) wl[k] = Math.max(wl[k], Math.abs(P[a * 3] + (P[b * 3] - P[a * 3]) * s));
      }
    }
  }
  // The widest within eight metres either way: she is parallel-sided where
  // this matters, and a station her edges happen not to cross is not a
  // station with no side.
  const sideAt = (k) => {
    let w = 0;
    for (let d = -8; d <= 8; d++) if (k + d >= 0 && k + d < NZ) w = Math.max(w, wl[k + d]);
    return w;
  };
  let moved = 0;
  let most = 0;
  for (let i = 0; i < n; i++) {
    const y = P[i * 3 + 1];
    if (y > -2.4 || y < -5.0) continue;
    const k = Math.round(P[i * 3 + 2] - Z0);
    if (k < 0 || k >= NZ) continue;
    const side = sideAt(k);
    if (side < 8.5) continue;
    // Eased in over the half metre under the waterline, so her side there is
    // not stepped.
    const lim = side - 0.25 * Math.min(1, (-2.4 - y) / 0.5);
    const x = P[i * 3];
    if (Math.abs(x) > lim) {
      most = Math.max(most, Math.abs(x) - lim);
      P[i * 3] = Math.sign(x) * lim;
      moved++;
    }
  }
  console.log(`bilge keels brought inside her side: ${moved} points, by ${most.toFixed(2)} m at most`);
}
recomputeNormals(m);

// ---- the dents in her flats --------------------------------------------------------
// Decimation dented everything flat on her -- her decks, the sides of her
// deckhouses, her funnel casings -- so the dents are taken out along each
// face's normal, corners and creases held (see denoise). Her lumps are gone
// already: see LUMPS.
if (!process.env.NOSMOOTH) {
  // Her upperworks harder than her hull: they are the sculpt's lumpiest part,
  // and there are no lines of hers up there to keep. A wider neighbourhood,
  // more passes, and more room to move.
  const up = denoise(m, weld(m), {
    sigmaS: 1.1, sigmaR: 0.33, normalIters: 10, vertexIters: 25, max: 0.4,
    only: (x, y) => y > 9.6,
  });
  console.log(`upperworks denoised: ${up.points} points, ${(up.movedMean * 100).toFixed(1)} cm on average, ${(up.movedMax * 100).toFixed(1)} cm at most`);
  recomputeNormals(m);
  const d = denoise(m, weld(m), { sigmaS: 0.6, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.2 });
  console.log(`denoised: ${d.points} points, ${(d.movedMean * 100).toFixed(1)} cm on average, ${(d.movedMax * 100).toFixed(1)} cm at most`);
  recomputeNormals(m);
}

// ---- fair her sides, and split her normals at her creases ---------------------
// As for the Graf Spee: decimation dented her topsides, and the dents come
// out without her lines moving. Her deck edge amidships is her shelter deck,
// 9.4 m, and the forecastle at the stem is 6.4 with its bulwark.
const FAIR = {
  passes: 24, lambda: 0.5, mu: -0.53, max: 0.3, foot: -2.4, midbody: 0.8,
  planZ: [-90, 90, 5], planY: [-5, 5, 1],
};
let canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: 5.2, edgeCap: 9.6, slice: true, beamFloor: 0 });
if (!process.env.NOFAIR) fair(m, canon, st, FAIR);

// ---- the openings her tubes fire through --------------------------------------
// Three a side in her plating between the upper deck and the shelter deck,
// as the photographs of her show them: the forward one, under the fore
// funnel, onto her reload stowage; the middle one for the forward mounting;
// the after one for the mounting in the well. Each goes through the side
// plating (0.5 m of it, as the sculpt has it) and nothing else: open air
// inboard of it, in the passage or the well.
export const OPENINGS = [
  { name: 'reloads', za: 3.2, zb: 8.0 },
  { name: 'forward mounting', za: -7.3, zb: -0.9 },
  { name: 'after mounting', za: -20.4, zb: -15.5 },
].map((o) => ({ ...o, ya: 7.25, yb: 8.6 }));
if (!process.env.NOCARVE) {
  for (const side of [1, -1]) {
    for (const o of OPENINGS) {
      if (process.env.BOXCUT_DEBUG) console.log(`opening ${o.name} ${side}`);
      const r = cutOpening(m, { side, xIn: 8.7, xOut: 12.5, za: o.za, zb: o.zb, ya: o.ya, yb: o.yb });
      console.log(`opening ${o.name} ${side > 0 ? 'port' : 'starboard'}: ${r.cut} triangles cut, reveals ${r.reveals.join('/')}`);
    }
  }
}
recomputeNormals(m);
canon = weld(m);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: FAIR.foot,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- her surface, as a height map -------------------------------------------------
// Taken before the paint, which uses it: a part of her with more of her
// standing over it is under a deck.
const HM = { x0: -13, z0: -103, step: 0.5, nx: 53, nz: 413 };
const hm = heightmap(m, HM);
// The lowest of her surface at the four grid points round (x, z): a point
// is under something only if all four of them are over it, not just the
// nearest -- which, at the foot of anything standing on a deck, is the top
// of the thing standing there.
const topAt = (x, z) => {
  const i = Math.floor((x - HM.x0) / HM.step), j = Math.floor((z - HM.z0) / HM.step);
  if (i < 0 || j < 0 || i + 1 >= HM.nx || j + 1 >= HM.nz) return -99;
  return Math.min(hm[j * HM.nx + i], hm[j * HM.nx + i + 1], hm[(j + 1) * HM.nx + i], hm[(j + 1) * HM.nx + i + 1]);
};

// ---- paint -------------------------------------------------------------------------
// Yokosuka grey, which is darker and bluer than the Kure grey Yamato wears;
// linoleum on her weather decks up to the shelter deck, and bare steel above
// that; black boot topping and red below. Anything with a deck over it -- the
// passage her tubes stand in, under her overhangs -- is in shadow, since a
// vertex colour is the only light there is to paint it with.
const uvArr = boxUvs(m);
const HULL = paletteToLinear([0x56, 0x5e, 0x67]);
const BOOT = paletteToLinear([0x18, 0x1b, 0x1f]);
const ANTI = paletteToLinear([0x66, 0x2d, 0x24]);
const DECK = paletteToLinear([0x8a, 0x6c, 0x48]);
const STEEL = paletteToLinear([0x4b, 0x52, 0x59]);
const BOOT_LO = -2.1, BOOT_HI = 0.6;
const SHADE = 0.42;
const isDeck = new Uint8Array(m.P.length / 3);
// A deck is anything facing the sky above four metres, which is lower than
// the lowest of her weather decks and higher than any ledge on her side, and
// under the shelter deck: above it she is bare steel. Not a test of how far
// out it is: her decks run out to her side, and the big triangles the
// decimator made of them carry a colour picked by position right across
// themselves -- grey from one corner at the deck edge washing half over a
// linoleum deck.
// And within forty degrees of level: the rounded edge the sculpt runs along
// her deck is her side, and painted as deck it is a brown streak down her.
// Not the cap of a bulwark or a coaming, though: that faces the sky too, and
// it is steel. A cap is a ridge -- her surface is lower just outboard of it,
// and lower all the way in across the deck it stands at the edge of -- and it
// is the same ridge on both sides of her, so it is looked for at the point and
// at its mirror.
const hNear = (x, z) => {
  const i = Math.round((x - HM.x0) / HM.step), j = Math.round((z - HM.z0) / HM.step);
  return i < 0 || j < 0 || i >= HM.nx || j >= HM.nz ? -99 : hm[j * HM.nx + i];
};
const ridge = (x, y, z) => {
  const s = Math.sign(x) || 1;
  if (hNear(x + s * 0.8, z) > y - 0.3) return false;
  let inboard = -99;
  for (const d of [0.8, 1.2, 1.6]) inboard = Math.max(inboard, hNear(x - s * Math.min(d, Math.abs(x)), z));
  return inboard < y - 0.3;
};
const upward = (i) => m.N[i * 3 + 1] > 0.77 && m.P[i * 3 + 1] > 3.5;
let caps = 0;
for (let i = 0; i < isDeck.length; i++) {
  const x = m.P[i * 3], y = m.P[i * 3 + 1], z = m.P[i * 3 + 2];
  if (!upward(i) || y >= 9.7) continue;
  if (ridge(x, y, z) || ridge(-x, y, z)) { caps++; continue; }
  isDeck[i] = 1;
}
console.log(`deck: ${caps} corners on the caps of her bulwarks and coamings left steel`);
// And deck on one side of her only where the same place on her other side is
// deck too. Her decks, platforms and caps are the same both sides, but the
// sculpt's normals are not quite: the rounded cap of her forecastle bulwark
// faced the sky enough to be painted linoleum to port and not to starboard.
// Where there is nothing of her at the mirror of a point to go by, its own
// normal decides.
{
  const { P } = m;
  const R = 0.35;
  const cell = (v) => Math.floor(v / R);
  const grid = new Map();
  for (let i = 0; i < isDeck.length; i++) {
    const k = `${cell(P[i * 3])},${cell(P[i * 3 + 1])},${cell(P[i * 3 + 2])}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const raw = isDeck.slice();
  let cleared = 0;
  for (let i = 0; i < isDeck.length; i++) {
    if (!raw[i] || Math.abs(P[i * 3]) < 0.5) continue;
    const x = -P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let near = 0;
    let deck = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(`${cell(x) + dx},${cell(y) + dy},${cell(z) + dz}`) || []) {
        if (Math.hypot(P[j * 3] - x, P[j * 3 + 1] - y, P[j * 3 + 2] - z) > R) continue;
        near++;
        if (raw[j]) deck++;
      }
    }
    if (near && !deck) { isDeck[i] = 0; cleared++; }
  }
  console.log(`deck: ${cleared} corners painted deck on one side of her only, painted as the other`);
}
const col = paint(m, (i) => {
  const { P, N } = m;
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], up = N[i * 3 + 1];
  const k = st.zBin(z);
  let c;
  if (upward(i)) c = y >= 9.7 ? STEEL : isDeck[i] ? DECK : HULL;
  else if (y < BOOT_LO) c = ANTI;
  else if (y <= BOOT_HI) c = BOOT;
  else c = HULL;
  // Under a deck: the top of her here is well above this point, and the
  // point is inboard of her side plating.
  const under = y > BOOT_HI && topAt(x, z) > y + 0.6 && Math.abs(x) < st.halfB[k] - 0.6 && up < 0.9;
  const under2 = y > BOOT_HI && up >= 0.9 && topAt(x, z) > y + 0.6;
  return under || under2 ? c.map((v) => Math.round(v * SHADE)) : c;
});

// ---- her turrets ----------------------------------------------------------------------
// What each turret's boxes took out of her: the gunhouse, and the barrels
// out past its face. Split into what trains -- the gunhouse -- and what
// elevates as well -- the two barrels, root and all -- in the frame of the
// mounting, and each closed where the barrels were parted from the face.

/** The triangles of `mesh` selected by `pick(t)`, as a mesh of their own. */
function subMesh(mesh, pick) {
  const map = new Map();
  const P = [], N = [], T = [];
  for (let t = 0; t < mesh.T.length / 3; t++) {
    if (!pick(t)) continue;
    for (let j = 0; j < 3; j++) {
      const v = mesh.T[t * 3 + j];
      let w = map.get(v);
      if (w === undefined) {
        w = P.length / 3;
        map.set(v, w);
        P.push(mesh.P[v * 3], mesh.P[v * 3 + 1], mesh.P[v * 3 + 2]);
        N.push(mesh.N[v * 3] || 0, mesh.N[v * 3 + 1] || 0, mesh.N[v * 3 + 2] || 0);
      }
      T.push(w);
    }
  }
  return { P, N, T };
}

/** Several meshes as one. */
function merged(list) {
  const out = { P: [], N: [], T: [] };
  for (const mesh of list) {
    const base = out.P.length / 3;
    out.P.push(...mesh.P);
    out.N.push(...mesh.N);
    for (const v of mesh.T) out.T.push(base + v);
  }
  return out;
}

/**
 * Normals split at creases, the same way the hull's are, for a piece with no
 * side plating to speak of.
 */
function creased(mesh, deg) {
  recomputeNormals(mesh);
  const flat = { zBin: () => 0, halfB: [Infinity], edgeY: [-Infinity] };
  hardEdges(mesh, weld(mesh), flat, { crease: deg * Math.PI / 180, plateTilt: 0, foot: 0 });
  return mesh;
}

/** Least-squares line through points: across and y as linear in along. */
function fitLine(pts) {
  const n = pts.length;
  let sa = 0, sc = 0, sy = 0, saa = 0, sac = 0, say = 0;
  for (const [a, c, y] of pts) { sa += a; sc += c; sy += y; saa += a * a; sac += a * c; say += a * y; }
  const den = n * saa - sa * sa;
  const kc = (n * sac - sa * sc) / den, kyv = (n * say - sa * sy) / den;
  return { c0: (sc - kc * sa) / n, kc, y0: (sy - kyv * sa) / n, ky: kyv };
}

// ---- her barrels ---------------------------------------------------------------------
// The hull's decimation leaves each barrel a few dozen facets, and nothing
// rounds that into a gun. So the barrels are measured off the finer turret
// decimation instead -- where each one runs, and how thick it is along its
// length, jacket and chase and muzzle -- and turned true to those numbers:
// the sculpt's own guns, made round.
const tm = toGameFrame(readGlb(TURRET_SRC), { length: REAL_LOA, keelY: REAL_KEEL_Y, frame: FRAME });

/**
 * One turret's pair of barrels: half the distance between them, the height
 * of their axis along the mounting (`yAt(along)`), the elevation they are
 * stowed at, how far out the muzzles are and the radius profile, the same
 * for both.
 */
function barrelsOf(t) {
  const [by0, by1] = t.barrels.y;
  const tipMax = t.barrels.along;
  const pts = [[], []];
  for (let i = 0; i < tm.P.length; i += 3) {
    const x = t.s * tm.P[i], y = tm.P[i + 1], z = t.s * (tm.P[i + 2] - t.z);
    if (z < t.face + 0.6 || z > tipMax || Math.abs(x) > 1.6 || y < by0 || y > by1) continue;
    pts[x < 0 ? 0 : 1].push([z, x, y]);
  }
  const lines = pts.map((side) => {
    let f = fitLine(side);
    for (let it = 0; it < 3; it++) {
      const d = side.map(([a, c, y]) => Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a)));
      const med = d.slice().sort((p, q) => p - q)[d.length >> 1];
      f = fitLine(side.filter((_, k) => d[k] < med * 1.6 + 0.05));
    }
    let tip = -Infinity;
    for (const [a, c, y] of side) if (Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a)) < 0.8) tip = Math.max(tip, a);
    return { f, tip, side };
  });
  const mid = (t.face + lines[0].tip) / 2;
  const half = (Math.abs(lines[0].f.c0 + lines[0].f.kc * mid) + Math.abs(lines[1].f.c0 + lines[1].f.kc * mid)) / 2;
  const ky = (lines[0].f.ky + lines[1].f.ky) / 2;
  const yMid = (lines[0].f.y0 + lines[0].f.ky * mid + lines[1].f.y0 + lines[1].f.ky * mid) / 2;
  const yAt = (a) => yMid + ky * (a - mid);
  const tipAlong = (lines[0].tip + lines[1].tip) / 2;
  // The radius every half metre along, both barrels together: the upper
  // third of the distances of the surface from the axis, which is the
  // surface and not whatever of the other barrel strays into the bin.
  const bins = [];
  for (const { f, side } of lines) {
    for (const [a, c, y] of side) {
      const r = Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a));
      if (r > 0.8) continue;
      const k = Math.floor((a - t.face) / 0.5);
      (bins[k] ||= []).push(r);
    }
  }
  const raw = bins.map((b) => (b && b.length >= 3 ? b.sort((p, q) => p - q)[Math.floor(b.length * 0.7)] : null));
  const fill = raw.map((_, k) => {
    let s2 = 0, w = 0;
    for (let d = -1; d <= 1; d++) { const v = raw[k + d]; if (v != null) { const ww = d === 0 ? 2 : 1; s2 += v * ww; w += ww; } }
    return w ? s2 / w : null;
  });
  // Made monotone from the jacket to the chase -- a barrel does not swell
  // and pinch along its length -- bar the swell at the muzzle.
  const prof = [];
  let last = Infinity;
  fill.forEach((r, k) => {
    if (r == null) return;
    const a = t.face + (k + 0.5) * 0.5;
    if (a > tipAlong - 0.6) return;
    last = Math.min(last, r);
    prof.push([a, Math.max(0.36, Math.min(0.66, last))]);
  });
  const pitch = Math.atan(ky);
  const reachFrom = (z0) => (tipAlong - z0) / Math.cos(pitch);
  return { half, yAt, ky, pitch, face: t.face, tipAlong, profile: prof, reach: reachFrom(t.face - 0.6), reachFrom };
}

/**
 * A pair of barrels turned true, in the frame of the cradle: its origin on
 * the trunnions, the bore along +z, level -- the cradle is what is laid at
 * the elevation the sculpt stows them at. From a metre behind the face, out
 * of sight inside the gunhouse however far they elevate, to the muzzle: the
 * jacket where they come out of the face, the chase, and a swell at the
 * muzzle round a bore you can see down.
 */
function turnedBarrels(bar, trunnion) {
  const SEG = 20;
  const cp = Math.cos(bar.pitch);
  const alongToS = (a) => (a - trunnion[2]) / cp;
  const L = bar.reach;
  const rJacket = bar.profile.length ? bar.profile[0][1] : 0.6;
  const rChase = bar.profile.length ? bar.profile[bar.profile.length - 1][1] : 0.48;
  const ring = [[-0.4, rJacket]];
  for (const [a, r] of bar.profile) ring.push([alongToS(a), r]);
  const rSwell = Math.min(rJacket, rChase * 1.1);
  ring.push([L - 0.55, rChase], [L - 0.4, rSwell], [L - 0.06, rSwell], [L, rSwell * 0.9]);
  ring.sort((p, q) => p[0] - q[0]);
  const P = [], N = [], T = [];
  for (const x0 of [-bar.half, bar.half]) {
    const base = P.length / 3;
    // Sides: rings with smooth normals, sloped by the profile.
    for (let k = 0; k < ring.length; k++) {
      const [sz, r] = ring[k];
      const prev = ring[Math.max(0, k - 1)], next = ring[Math.min(ring.length - 1, k + 1)];
      const dr = (next[1] - prev[1]) / Math.max(1e-6, next[0] - prev[0]);
      const nl = Math.hypot(1, dr);
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        const cx = Math.cos(a), cy = Math.sin(a);
        P.push(x0 + cx * r, cy * r, sz);
        N.push(cx / nl, cy / nl, -dr / nl);
      }
    }
    for (let k = 0; k < ring.length - 1; k++) {
      for (let j = 0; j < SEG; j++) {
        const a = base + k * SEG + j, b = base + k * SEG + ((j + 1) % SEG);
        const c = a + SEG, d = b + SEG;
        T.push(a, b, d, a, d, c);
      }
    }
    // The breech end, closed.
    {
      const [sz, r] = ring[0];
      const c = P.length / 3;
      P.push(x0, 0, sz); N.push(0, 0, -1);
      const b0 = P.length / 3;
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * r, Math.sin(a) * r, sz); N.push(0, 0, -1); }
      for (let j = 0; j < SEG; j++) T.push(c, b0 + ((j + 1) % SEG), b0 + j);
    }
    // The muzzle: a face round the bore, and the bore going in.
    {
      const [sz, r] = ring[ring.length - 1];
      const rb = r * 0.42;
      const o = P.length / 3;
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * r, Math.sin(a) * r, sz); N.push(0, 0, 1); }
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * rb, Math.sin(a) * rb, sz); N.push(0, 0, 1); }
      for (let j = 0; j < SEG; j++) {
        const a = o + j, b = o + ((j + 1) % SEG), c = o + SEG + j, d = o + SEG + ((j + 1) % SEG);
        T.push(a, b, d, a, d, c);
      }
      const o2 = P.length / 3;
      for (const dz of [0, -0.9]) {
        for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * rb, Math.sin(a) * rb, sz + dz); N.push(-Math.cos(a), -Math.sin(a), 0); }
      }
      for (let j = 0; j < SEG; j++) {
        const a = o2 + j, b = o2 + ((j + 1) % SEG), c = o2 + SEG + j, d = o2 + SEG + ((j + 1) % SEG);
        T.push(a, c, d, a, d, b);
      }
      const c = P.length / 3;
      P.push(x0, 0, sz - 0.9); N.push(0, 0, 1);
      for (let j = 0; j < SEG; j++) T.push(c, o2 + SEG + j, o2 + SEG + ((j + 1) % SEG));
    }
  }
  return { P, N, T };
}

const turretParts = [];
for (const t of TURRETS) {
  // Into the mounting's frame: along her axis towards the muzzles, across to
  // port when she faces ahead, and up from the deck or barbette she trains on.
  const local = (mesh) => {
    const out = { P: [], N: [], T: mesh.T.slice() };
    for (let i = 0; i < mesh.P.length; i += 3) {
      out.P.push(t.s * mesh.P[i], mesh.P[i + 1], t.s * (mesh.P[i + 2] - t.z));
      out.N.push(t.s * (mesh.N[i] || 0), mesh.N[i + 1] || 0, t.s * (mesh.N[i + 2] || 0));
    }
    return out;
  };
  const pieces = taken.get(t);
  const house0 = local(merged(pieces.filter((p) => !p.box.barrels).map((p) => p.mesh)));
  // Her barrels, off the finer decimation: where each runs and how thick it
  // is along its length (see barrelsOf). They are turned afresh below, so the
  // sculpt's own go altogether: everything its barrels' box took out of her,
  // and everything of the gunhouse more than a hand's breadth ahead of where
  // the barrels come out of the face -- the roots of the old barrels, and the
  // fins decimation left round them. The gunhouse is cut off square there and
  // closed.
  const bar = barrelsOf(t);
  const trimmed = clone(house0);
  // A turret on the open deck is lifted off it at `lift`, above the flange the
  // sculpt runs round its foot -- which a box cuts into rags -- and stands on a
  // roller path of its own, in takao.js.
  const y0 = t.lift ? t.floor + t.lift : -10;
  boxCut(trimmed, { x0: -8, x1: 8, y0, y1: 40, z0: -20, z1: t.face + 0.35 }, { keep: 'inside' });
  // And the last of the old roots: the skin of each old barrel between the
  // face and that cut -- close round the new barrel's axis and facing out
  // from it, where the face plate round it faces along it -- and the disc the
  // cut closed it with. That leaves a hole in the face where each barrel came
  // out of it, closed flat in the face; the new barrels come out of them.
  const tip = t.face + 0.35;
  const nearAxis = (x, y, z) => z >= t.face - 0.3 && Math.hypot(Math.abs(x) - bar.half, y - bar.yAt(z)) < 0.75;
  let house = subMesh(trimmed, (tri) => {
    const vs = [0, 1, 2].map((j) => trimmed.T[tri * 3 + j]);
    for (const v of vs) if (!nearAxis(trimmed.P[v * 3], trimmed.P[v * 3 + 1], trimmed.P[v * 3 + 2])) return true;
    if (vs.every((v) => Math.abs(trimmed.P[v * 3 + 2] - tip) < 1e-3)) return false;
    const [nx, ny, nz] = faceNormal(trimmed, vs[0], vs[1], vs[2]);
    const nl = Math.hypot(nx, ny, nz) || 1;
    const along = Math.abs((ny * bar.ky + nz) / (nl * Math.hypot(bar.ky, 1)));
    return along >= 0.6;
  });
  // Only the gunhouse and what is part of it: not a scrap of a flange the
  // box left standing on its own.
  {
    const parts = components(house);
    const big = new Set();
    for (const c of parts) if (c.tris.length >= parts[0].tris.length * 0.08) for (const q of c.tris) big.add(q);
    house = subMesh(house, (tri) => big.has(tri));
  }
  {
    const s1 = closeHoles(house, new Uint8Array(house.T.length / 3).fill(1), () => null, { open: true });
    console.log(`${t.name}: gunhouse ${house.T.length / 3} triangles (${s1.loops} holes closed)`);
  }
  if (!process.env.NOSMOOTH) {
    // The dents taken out of her gunhouse, its corners kept.
    recomputeNormals(house);
    denoise(house, weld(house), { sigmaS: 0.45, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.12 });
  }
  // The barrels, turned true about trunnions a little inside the face.
  const trunnion = [0, bar.yAt(t.face - 0.6), t.face - 0.6];
  const guns = turnedBarrels(bar, trunnion);
  const pitch = bar.pitch;
  const muzzles = [-bar.half, bar.half].map((x) => [+x.toFixed(3), 0, +bar.reach.toFixed(3)]);
  creased(house, 40);
  // Seated at its floor: the mounting's origin is the pivot, on the deck or
  // barbette it trains on.
  for (let i = 1; i < house.P.length; i += 3) house.P[i] -= t.floor;
  trunnion[1] -= t.floor;
  console.log(`   barrels: ${(2 * bar.half).toFixed(2)} m apart, ${bar.reach.toFixed(2)} m from trunnion to muzzle, `
    + `stowed at ${(pitch * 180 / Math.PI).toFixed(1)} degrees; radius ${bar.profile.map(([a, r]) => `${a.toFixed(1)}:${r.toFixed(2)}`).join(' ')}`);
  turretParts.push({
    name: t.name, z: t.z, facing: t.s > 0 ? 0 : Math.PI, seat: t.floor, lift: t.lift || 0,
    trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +pitch.toFixed(4),
    house, guns,
  });
}

/** One piece as a blob: u32 nv, u32 nt, f32 pos, f32 nrm, u16 idx. */
function packPiece(mesh) {
  const nv = mesh.P.length / 3, nt = mesh.T.length / 3;
  if (nv >= 65536) throw new Error('piece too big for Uint16 indices');
  const h = Buffer.alloc(8);
  h.writeUInt32LE(nv, 0);
  h.writeUInt32LE(nt, 4);
  return Buffer.concat([h, Buffer.from(Float32Array.from(mesh.P).buffer),
    Buffer.from(Float32Array.from(mesh.N).buffer), Buffer.from(Uint16Array.from(mesh.T).buffer)]);
}

// ---- her lines, as the sculpt has them --------------------------------------------
// What her interior is fitted under and what the fleet's structural checks
// feel her over: a metre at a time along her, the lowest point of her keel,
// the deck over her insides -- the lowest deck anywhere across her with open
// air over it, so nothing fitted inside her stands up into the passage her
// tubes are in, or into the well -- and how far out her side is at every half
// metre of height.
const LINES = { z0: -102, dz: 1, nz: 205, y0: -7, dy: 0.5, ny: 41 };
{
  const { P, T } = m;
  const sectionAt = (z) => {
    const segs = [];
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t], T[t + 1], T[t + 2]];
      const pts = [];
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3];
        const za = P[a * 3 + 2], zb = P[b * 3 + 2];
        if ((za - z) * (zb - z) > 0 || za === zb) continue;
        const s2 = (z - za) / (zb - za);
        pts.push([P[a * 3] + (P[b * 3] - P[a * 3]) * s2, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * s2, t / 3]);
      }
      if (pts.length === 2) segs.push(pts);
    }
    return segs;
  };
  const faceUp = (tri) => {
    const [x, y, z] = faceNormal(m, T[tri * 3], T[tri * 3 + 1], T[tri * 3 + 2]);
    return y / (Math.hypot(x, y, z) || 1);
  };
  const keel = [], deck = [], half = [];
  for (let k = 0; k < LINES.nz; k++) {
    const z = LINES.z0 + k * LINES.dz;
    const segs = sectionAt(z);
    // The keel: the bottom of her on the centreline. Not the lowest of her
    // near it: her bottom is rounded, and its lowest point is a few
    // centimetres off the centreline and a few centimetres under it -- which,
    // taken as the keel, stood the keel of her interior out through her
    // bottom plating. Where nothing of her crosses the centreline (past her
    // stern, between her screws), the lowest of her within a metre and a half
    // of it.
    let kl = Infinity;
    for (const [[xa, ya], [xb, yb]] of segs) {
      if (xa * xb > 0 || xa === xb) continue;
      kl = Math.min(kl, ya + (yb - ya) * (-xa / (xb - xa)));
    }
    if (!Number.isFinite(kl)) {
      for (const [[xa, ya], [xb, yb]] of segs) {
        if (Math.abs(xa) < 1.5) kl = Math.min(kl, ya);
        if (Math.abs(xb) < 1.5) kl = Math.min(kl, yb);
      }
    }
    keel.push(Number.isFinite(kl) ? kl : 99);
    // How far out she is at each height: the outermost crossing.
    for (let j = 0; j < LINES.ny; j++) {
      const y = LINES.y0 + j * LINES.dy;
      let w = 0;
      for (const [[xa, ya], [xb, yb]] of segs) {
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        const x = xa + (xb - xa) * ((y - ya) / (yb - ya));
        w = Math.max(w, Math.abs(x));
      }
      half.push(w);
    }
    // The deck over her insides: down a line of verticals across her, the
    // lowest upward-facing surface with air over it.
    const hw = st.halfB[st.zBin(z)];
    let lowest = Infinity;
    for (let x = -hw * 0.8; x <= hw * 0.8 + 1e-6; x += 0.5) {
      const hits = [];
      for (const [[xa, ya, ta], [xb, yb]] of segs) {
        if ((xa - x) * (xb - x) > 0 || xa === xb) continue;
        hits.push([ya + (yb - ya) * ((x - xa) / (xb - xa)), faceUp(ta)]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      for (let h = 0; h < hits.length; h++) {
        const [y, up] = hits[h];
        if (y < 2.0 || up < 0.5) continue;
        const next = hits[h + 1];
        if (!next || next[1] < -0.3 || next[0] - y > 1.2) { lowest = Math.min(lowest, y); break; }
      }
    }
    deck.push(Number.isFinite(lowest) ? lowest : NaN);
  }
  // Held to the lowest of it within six metres either way, so the deck over
  // her insides steps down before any deck of hers does, never after.
  const filled = deck.map((v, k) => (Number.isNaN(v) ? (deck[k - 1] ?? deck[k + 1] ?? 5) : v));
  LINES.deck = filled.map((_, k) => {
    let v = Infinity;
    for (let d = -6; d <= 6; d++) { const q = filled[k + d]; if (q !== undefined) v = Math.min(v, q); }
    return +v.toFixed(2);
  });
  LINES.keel = keel.map((v) => +v.toFixed(2));
  LINES.half = half.map((v) => +v.toFixed(2));
  const at = (z) => LINES.deck[Math.round((z - LINES.z0) / LINES.dz)];
  console.log('the deck over her insides:', [-90, -60, -40, -20, 0, 20, 40, 60, 90].map((z) => `${z}:${at(z)}`).join(' '));
}

// ---- slice, pack and write ------------------------------------------------------
if (process.env.DEBUG_GLB) {
  const { writeGlb } = await import(process.env.DEBUG_GLB_LIB);
  writeGlb(process.env.DEBUG_GLB, m, col);
  for (const p of turretParts) {
    writeGlb(process.env.DEBUG_GLB.replace('.glb', `-${p.name.replace('.', '')}-house.glb`), p.house);
    writeGlb(process.env.DEBUG_GLB.replace('.glb', `-${p.name.replace('.', '')}-guns.glb`), p.guns);
  }
}
// Her decks are drawn as decks and the rest of her as plating: a triangle is
// deck when most of its corners were painted deck.
const surfaceOf = (t) => (isDeck[m.T[t * 3]] + isDeck[m.T[t * 3 + 1]] + isDeck[m.T[t * 3 + 2]] >= 2 ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 52, length: REAL_LOA, surfaceOf });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const turrets = turretParts.map((p) => ({
  name: p.name, z: p.z, facing: +p.facing.toFixed(6), seat: p.seat, lift: p.lift, trunnion: p.trunnion,
  muzzles: p.muzzles, pitch: p.pitch,
  house: packPiece(p.house).toString('base64'),
  guns: packPiece(p.guns).toString('base64'),
}));
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-takao-hull.mjs from the owner's sculpt. Do not\n`
  + `// hand-edit -- regenerate from the source assets instead.\n`
  + `export const TAKAO_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see takaoSurfaceY.\n`
  + `export const TAKAO_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her five turrets as the sculpt drew them, each in the frame of its own\n`
  + `// mounting: the gunhouse, and the barrels about their trunnions.\n`
  + `export const TAKAO_TURRETS = ${JSON.stringify(turrets)};\n`
  + `// The openings in her side her tubes fire through, both sides.\n`
  + `export const TAKAO_OPENINGS = ${JSON.stringify(OPENINGS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const TAKAO_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
