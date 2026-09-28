// Turn the owner's HMS Rodney sculpt into what client/js/render/rodneyHull.js
// ships: her hull, her tower, her funnel and her masts as one painted mesh; her
// three 16-inch turrets as the sculpt drew them, cut free so they train and
// elevate; and her 6-inch twin, off the owner's own sculpt of it, as the
// mounting all six of her secondary turrets are built from. In order:
//
//   * calibrate both decimations of her into this game's frame -- bow to +Z by
//     a rotation, scaled to her length, and floated on the waterline the
//     sculpt's own paint draws, where she draws 8.6 m (she drew 9.1 m in
//     1927); her paint rides along a triangle at a time (see
//     build/rodney-source.mjs);
//   * cut her three turrets out of her exactly, gunhouse and barrels, down to
//     the barbette or the roller path each trains on; carve out every other gun
//     the sculpt had cast into her -- the six 6-inch gunhouses aft, which it drew
//     as lumps, the pom-poms in their tubs, her HA guns -- and her screws, which
//     turn; and close every hole, a deck patch in teak where a gun stood on
//     teak;
//   * sand the lumps off her decks -- the sculpt draws every bollard,
//     ventilator and ready-use locker as a blob of deck pushed up -- and take
//     the dents decimation left out of everything flat on her, without rounding
//     her corners; fair her topsides; split her normals at every crease and
//     wherever two paints meet;
//   * read her surface off as a height map, which is what rodney.js stands
//     every mounting on, and her lines, which is what her interior and her
//     armour are fitted under;
//   * lift her turrets out of the finer decimation of her forecastle: each
//     gunhouse, with its paint, in the frame of the mounting, and its three
//     barrels turned true along the sculpt's own -- where each runs, how far
//     apart, how thick along its length -- about trunnions just inside the face;
//   * and her 6-inch twin: the owner's sculpt of it turned to face ahead,
//     scaled to the gunhouses the ship sculpt drew aft, cut off square at its
//     foot where the sculpt's skirt is ragged, and its two barrels turned true
//     the same way;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file rodney.js decodes synchronously.
//
// The stages are build/sculpt.mjs; what is here is what is hers.
//
//   node build/prepare-rodney-hull.mjs
//
// Reads assets/models/rodney-hull.glb, rodney-turrets.glb and
// rodney-secondary.glb (made by build/rodney-source.mjs), writes
// client/js/render/rodneyHull.data.js. Re-run it whenever an asset or anything
// below changes; the data file is committed, so a fresh clone runs without
// this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, toGameFrame, bbox, fixWinding, carve, closeHoles, boxCut,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, boxUvs, findLumps, denoise,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal, components,
} from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/models/rodney-hull.glb');
const TURRET_SRC = path.join(ROOT, 'assets/models/rodney-turrets.glb');
const SEC_SRC = path.join(ROOT, 'assets/models/rodney-secondary.glb');
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/rodneyHull.data.js');

const REAL_LOA = 216.4;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent, stem to stern and across, and its waterline -- where
// its paint turns from her side to her bottom -- so both decimations come off
// the one calibration and her turrets come off her exactly where they were cut
// from her. A unit of the sculpt is 113.85 m of her.
const SCULPT = {
  x0: -0.9515699744224548, x1: 0.9491479992866516,
  z0: -0.14935599267482758, z1: 0.14823199808597565, wl: -0.1885,
};
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: (SCULPT.z0 + SCULPT.z1) / 2,
  SCALE: REAL_LOA / (SCULPT.x1 - SCULPT.x0), localKeel: SCULPT.wl, keelY: 0,
};

// Her paints, as build/rodney-source.mjs numbers them.
const LIGHT = 0, DARK = 1, GREEN = 2, DECK = 3, BOOT = 4, RED = 5;
// What each looks like, chosen off the cleaned texture: the Admiralty light
// grey of her disruptive scheme, its dark blue and its green, her teak, her
// boot topping and her bottom.
const PALETTE = [
  [0x84, 0x9a, 0xa5],
  [0x1f, 0x35, 0x46],
  [0x5f, 0x69, 0x50],
  [0x6f, 0x62, 0x52],
  [0x1a, 0x1c, 0x1f],
  [0x6e, 0x33, 0x25],
].map(paletteToLinear);

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
// Three 16-inch triples, all forward of her tower, as the sculpt has them: A
// low on the forecastle, B superfiring over it on a barbette five metres
// high, and X low again abaft B -- the Nelsons' third turret, which could not
// fire ahead past B's barbette and was stowed with its muzzles under B's
// overhang. `z` is the pivot, the middle of the roller path the sculpt's
// gunhouse is round; every other length is along her axis from the pivot and
// across it. `floor` is the top of the barbette or ring each trains on --
// the gunhouse is cut off there, and what is under it is ship.
//
// `face` is where the barrels come out of the gunhouse; `barrels.along` how
// far out from the pivot the sculpt's muzzles are. X's reach B's barbette:
// her own are turned a hand short of it.
export const TURRETS = [
  { name: 'A', z: 40.4, floor: 10.75, face: 6.9, house: { along: [-7.5, 7.35], across: [-6.9, 6.9], top: 14.45 },
    barrels: { along: 19.1, y: [10.95, 12.95], tip: 19.1 } },
  { name: 'B', z: 21.9, floor: 14.05, face: 5.7, house: { along: [-8.3, 6.05], across: [-6.7, 6.7], top: 19.4 },
    barrels: { along: 17.9, y: [14.45, 16.35], tip: 17.9 } },
  { name: 'X', z: -1.1, floor: 10.9, face: 5.6, house: { along: [-8.8, 5.95], across: [-6.9, 6.9], top: 16.2 },
    barrels: { along: 16.78, y: [11.0, 13.0], tip: 16.6 } },
];
const BARREL_HALF = 3.25;

function turretBoxes(t) {
  const { along, across, top } = t.house;
  return [
    { name: `${t.name} house`, x0: across[0], x1: across[1], y0: t.floor, y1: top, z0: t.z + along[0], z1: t.z + along[1] },
    { name: `${t.name} barrels`, x0: -BARREL_HALF, x1: BARREL_HALF, y0: t.barrels.y[0], y1: t.barrels.y[1],
      z0: t.z + along[1] - 0.01, z1: t.z + t.barrels.along, barrels: true },
  ];
}

// ---- her secondary battery ---------------------------------------------------------
// Twelve 6-inch in six twin turrets, all aft, three a side on and round her
// after superstructure: the forward pair on her upper deck facing ahead, the
// middle pair superfiring over them, and the after pair on her upper deck
// again facing astern. The sculpt drew them as lumps -- the after pair with no
// barrels at all -- and the owner supplied the gun itself, so each lump is cut
// away down to her deck and rodney.js stands that gun there on a barbette.
// Positions are the middles of the sculpt's gunhouses, and each box goes up
// no higher than the gunhouse did -- a box with no roof takes with it
// everything of hers that passes over it, the wireless aerials thirty metres
// up included, and closing where they were cut hangs a curtain from them to
// the deck. `up` is the height of
// the barbette's top, where each gunhouse is seated, chosen so the forward and
// after pairs stand where the sculpt drew them and the middle pair's barrels
// clear the forward pair's roofs.
export const SECONDARY = [
  { name: '6-inch fwd', x: 11.2, z: -60.4, rest: 0, up: 11.75, box: { x: [8.55, 14.9], z: [-65.1, -50.5], top: 15.2 } },
  { name: '6-inch mid', x: 10.9, z: -69.7, rest: 0, up: 13.55, box: { x: [8.3, 14.1], z: [-74.9, -65.1], top: 15.8 } },
  { name: '6-inch aft', x: 9.05, z: -78.1, rest: Math.PI, up: 10.25, box: { x: [5.7, 12.5], z: [-82.7, -74.9], top: 13.8 } },
];
const DECK_Y = 9.3;

// ---- her anti-aircraft guns ----------------------------------------------------
// Where the sculpt has a lump for one of her 4.7-inch HA guns, on her upper
// deck either side of her after superstructure, and the tubs round her funnel
// and abreast her mainmast for her pom-poms. The tubs are ship and stay: only
// what the sculpt stood in them goes, down to their floors.
export const HA_GUNS = [
  { x: 10.5, z: -48.3, box: { x: [9.2, 12.9], z: [-49.7, -46.9], top: 14.6 } },
  { x: 11.0, z: -39.3, box: { x: [9.6, 12.3], z: [-40.6, -37.9], top: 14.6 } },
  { x: 10.0, z: -30.4, box: { x: [8.8, 11.3], z: [-32.0, -28.8], top: 14.6 } },
];
// And what else the sculpt left on her upper deck between them: the melted
// half of a gun it drew twice, the stump of a ventilator, a stone or two. Not
// the same both sides, so each box is where it is, port or starboard; each
// stops short of the platform her pom-poms stand on and her boat deck over it.
const CLUTTER = [
  { name: 'port abaft the funnel', x0: 9.35, x1: 12.4, z0: -46.9, z1: -42.3, y1: 12.8 },
  { name: 'port abreast the funnel', x0: 10.75, x1: 12.6, z0: -38.2, z1: -35.3, y1: 12.5 },
  { name: 'port forward', x0: 10.15, x1: 11.5, z0: -33.4, z1: -31.9, y1: 12.5 },
  { name: 'stbd abaft the funnel', x0: -11.4, x1: -9.35, z0: -46.9, z1: -40.6, y1: 12.8 },
  { name: 'stbd abreast the funnel', x0: -12.6, x1: -11.4, z0: -36.6, z1: -35.4, y1: 11.5 },
  { name: 'stbd outboard', x0: -14.1, x1: -13.2, z0: -42.5, z1: -41.6, y1: 11.0 },
];
// The floor of each tub, port and starboard, as the sculpt has them -- it put
// the starboard funnel platform most of a metre lower than the port one.
export const POMPOM_TUBS = [
  { name: 'pom-pom funnel', x: 6.2, z: -43.3, r: 2.75, floor: [17.52, 16.58], rise: 2.3, guns: 8 },
  { name: 'pom-pom mainmast', x: 7.4, z: -72.8, r: 1.55, floor: [15.23, 15.23], rise: 2.0, guns: 4 },
];

// ---- her screws -----------------------------------------------------------------
// Two shafts, and a four-bladed screw on each, which turn: the sculpt's own are
// cut off the ends of her shafts and rodney.js draws them.
export const SCREWS = [
  { x: -4.3, y: -5.6, z: -90.9, r: 2.7 },
  { x: 4.3, y: -5.6, z: -90.9, r: 2.7 },
];

// Every carve, as boxes: a box is `{ x0, x1, z0, z1, floor(z) }`, and `inside`
// if it is not a box but a disc.
const both = (list, f) => list.flatMap((e) => [1, -1].map((s) => f(e, s)));
const span = (lo, hi, s) => (s > 0 ? [lo, hi] : [-hi, -lo]);
const SEC_BOXES = both(SECONDARY, (e, s) => {
  const [x0, x1] = span(e.box.x[0], e.box.x[1], s);
  return { name: `${e.name} ${s > 0 ? 'port' : 'stbd'}`, x0, x1, z0: e.box.z[0], z1: e.box.z[1], y1: e.box.top, floor: () => DECK_Y + 0.05 };
});
const HA_BOXES = both(HA_GUNS, (e, s) => {
  const [x0, x1] = span(e.box.x[0], e.box.x[1], s);
  return { name: `4.7 ${e.z} ${s > 0 ? 'port' : 'stbd'}`, x0, x1, z0: e.box.z[0], z1: e.box.z[1], y1: e.box.top, floor: () => DECK_Y + 0.05 };
});
// A hole is patched 13 cm under its carve's floor, so each is set that far
// over the floor of the tub.
const TUB_BOXES = both(POMPOM_TUBS, (e, s) => ({
  name: `${e.name} ${s > 0 ? 'port' : 'stbd'}`, x0: s * e.x - e.r, x1: s * e.x + e.r, z0: e.z - e.r, z1: e.z + e.r,
  floor: () => e.floor[s > 0 ? 0 : 1] + 0.13, y1: e.floor[s > 0 ? 0 : 1] + e.rise, disc: { x: s * e.x, z: e.z, r: e.r },
}));
const SCREW_BOXES = SCREWS.map((w) => ({
  name: `screw ${w.x > 0 ? 'port' : 'stbd'}`, x0: w.x - w.r - 0.5, x1: w.x + w.r + 0.5,
  z0: w.z - 2.4, z1: w.z + 1.6, floor: () => -99, y1: w.y + w.r + 0.3, screw: true,
  within: (x) => Math.abs(x) > 1.3,
}));

// ---- the lumps on her decks ----------------------------------------------------
// Every bollard, ventilator and locker the sculpt raised as a blob of deck,
// small both ways, low, and standing on a weather deck, is cut out of her like
// a gun and the hole closed flush with the deck round it (see findLumps); not
// where a gun is cut out anyway, and not a turret.
const CLUTTER_BOXES = CLUTTER.map((b) => ({ ...b, floor: () => DECK_Y + 0.05 }));
const GUN_BOXES = [...SEC_BOXES, ...HA_BOXES, ...TUB_BOXES, ...CLUTTER_BOXES];
const nearGun = (x, z) => GUN_BOXES.some((k) => x > k.x0 - 0.5 && x < k.x1 + 0.5 && z > k.z0 - 0.5 && z < k.z1 + 0.5)
  || TURRETS.some((t) => Math.abs(x) < 7.5 && z > t.z + t.house.along[0] - 1 && z < t.z + t.barrels.along + 1);
const LUMPS = process.env.NOSMOOTH ? [] : findLumps(m, {
  HM: { x0: -17, z0: -110, step: 0.25, nx: 137, nz: 881 },
  rBase: 2.4, maxSize: 3.2, rise: [0.12, 1.7], minBase: 8.5, keep: nearGun,
});
// And a lump is only as tall as a lump: nothing passing over it goes with it.
for (const b of LUMPS) b.y1 = b.floor(0) + 2.0;
console.log(`lumps: ${LUMPS.length} to be cut off her decks`);

// The 6-inch and 4.7-inch lumps are cut out of her exactly instead (see
// below), so what is carved here is her tubs, her screws and her lumps.
const CARVE = process.env.NOCARVE ? [] : [...TUB_BOXES, ...SCREW_BOXES, ...LUMPS];

// Which carve a hole belongs to, from the middle of its rim: the box it is in,
// or the nearest in plan within a metre. The screws' holes are in the ends of
// her shafts, and are closed in their own plane; so is anything that belongs
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
// A patch where a gun or a lump stood on her upper deck is teak, whatever
// colour the foot of it was; anywhere else -- a lump on a grey roof, the floor
// of a tub -- it takes the paint of the rim round it.
const patchPaint = (box, rim) => (box && !box.disc && box.floor(0) < DECK_Y + 0.5 ? DECK : rim);

{
  // The discs, which a box carve does not know how to be: everything inside
  // the tub above its floor.
  const keep = new Uint8Array(m.T.length / 3).fill(1);
  const { P, T } = m;
  for (let t = 0; t < T.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[t * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    for (const k of TUB_BOXES) {
      if (Math.hypot(cx - k.disc.x, cz - k.disc.z) < k.disc.r - 0.25 && cy > k.floor() + 0.06 && cy < k.y1) { keep[t] = 0; break; }
    }
    // Only the screws' blades and bosses, not her rudder.
    for (const k of SCREW_BOXES) {
      if (cx > k.x0 && cx < k.x1 && cz > k.z0 && cz < k.z1 && cy < k.y1 && k.within(cx)) { keep[t] = 0; break; }
    }
  }
  const boxes = CARVE.filter((k) => !k.disc && !k.screw);
  const { keep: kept, cut } = carve(m, boxes, keep);
  console.log('carved:', [...cut].map(([k, n]) => `${k} ${n}`).filter((s) => !s.startsWith('lump')).join(', '));
  const s = closeHoles(m, kept, boxFor, { open: true, patchPaint });
  console.log('closed', s.loops, 'holes with', s.capped, 'triangles;', s.skirted, 'skirted;',
    s.fanned, 'fanned;', s.chains, 'open chains;', s.own, 'in their own plane');
}

// Her 6-inch and 4.7-inch lumps, cut out of her exactly along the faces of
// their boxes and closed flat in them (see boxCut): a lump that stood against
// her superstructure leaves a clean vertical face on it, not a skirt, and the
// hole in her deck is closed a hand over the deck, level. A patch that had
// to be fitted to the ragged outline such a lump leaves at the foot of a wall
// fans out across her deck in splinters.
if (!process.env.NOCARVE) {
  for (const b of [...SEC_BOXES, ...HA_BOXES, ...CLUTTER_BOXES]) {
    const r = boxCut(m, { x0: b.x0, x1: b.x1, y0: DECK_Y + 0.12, y1: b.y1, z0: b.z0, z1: b.z1 });
    console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
  }
}

// Her turrets, box by box, cut out of her exactly: gunhouse and barrels, down
// to the barbette each trains on, closed flat there.
if (!process.env.NOCARVE) {
  for (const t of TURRETS) {
    for (const b of turretBoxes(t)) {
      const r = boxCut(m, b);
      console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
    }
  }
  // X's muzzles ran into B's barbette, and the last hand's breadth of them is
  // still standing out of its face: taken off, the holes closed in the face.
  const X = TURRETS[2];
  const keep = new Uint8Array(m.T.length / 3).fill(1);
  const { P, T } = m;
  let n = 0;
  for (let t = 0; t < T.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[t * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    if (cz < X.z + X.barrels.along - 0.05 || cz > X.z + X.barrels.along + 1.2) continue;
    if (cy < X.barrels.y[0] || cy > X.barrels.y[1] || Math.abs(cx) > BARREL_HALF) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    // The skin of a barrel faces out from its axis, not along her.
    if (Math.abs(nz) > 0.6 * Math.hypot(nx, ny, nz)) continue;
    keep[t] = 0; n++;
  }
  const s = closeHoles(m, keep, () => null, { open: false });
  console.log(`X's muzzles off B's barbette: ${n} triangles, ${s.loops} holes closed`);
}
recomputeNormals(m);

// ---- the loose pieces ------------------------------------------------------------
// What the cuts left standing free of her: a sliver of cap on the face of a box
// where the thing it closed went with the box, the stumps of her shaft
// brackets where her screws came off. Nothing of hers is that small and apart.
{
  const parts = components(m);
  const drop = new Uint8Array(m.T.length / 3);
  for (const c of parts.slice(1)) {
    let area = 0;
    for (const t of c.tris) {
      const [x, y, z] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
      area += Math.hypot(x, y, z) / 2;
    }
    const d = Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    if (area > 8 || d > 6) continue;
    for (const t of c.tris) drop[t] = 1;
    console.log(`loose piece dropped: ${c.tris.length} triangles, ${area.toFixed(1)} m2 at`,
      c.lo.map((v) => v.toFixed(1)).join(','), '..', c.hi.map((v) => v.toFixed(1)).join(','));
  }
  const T = [], C = [];
  for (let t = 0; t < m.T.length / 3; t++) {
    if (drop[t]) continue;
    T.push(m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
    C.push(m.C[t]);
  }
  m.T = T;
  m.C = C;
}

// ---- her after deck, swept -------------------------------------------------------
// The sculpt's texture painted her teak grey round the foot of every gun it
// drew on her upper deck aft, as it bled the grey of her superstructure down
// on to the deck everywhere it met it. With the guns cut away that is grey
// deck with nothing standing on it, and it is teak: every face of her upper
// deck there -- facing the sky, at the height of that deck -- that is not.
{
  const { P, T, C } = m;
  let swept = 0;
  for (let t = 0; t < T.length / 3; t++) {
    if (C[t] === DECK || C[t] === BOOT || C[t] === RED) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    if (ny < 0.9 * Math.hypot(nx, ny, nz)) continue;
    let cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { cy += P[T[t * 3 + j] * 3 + 1] / 3; cz += P[T[t * 3 + j] * 3 + 2] / 3; }
    if (cz < -96 || cz > -24 || cy < DECK_Y - 0.4 || cy > DECK_Y + 0.6) continue;
    C[t] = DECK;
    swept++;
  }
  console.log(`after deck swept: ${swept} faces of grey on her teak`);
}

// ---- and the rest of her weather decks ------------------------------------------
// Everywhere else the texture smeared grey across her teak -- her forecastle
// worst, where it drew her cables and let their paint run -- a face that is
// flat, faces the sky and lies at the height of the teak round it is teak
// too. What stands up off the deck, a capstan or a cable or a coaming, is not
// at that height and keeps its grey. It spreads from the teak inwards, a few
// rings at a time, so a smear is taken in from its edges.
{
  const { P, T, C } = m;
  const nf = T.length / 3;
  const cx = new Float64Array(nf), cy = new Float64Array(nf), cz = new Float64Array(nf);
  const flat = new Uint8Array(nf);
  for (let t = 0; t < nf; t++) {
    for (let j = 0; j < 3; j++) {
      const v = T[t * 3 + j];
      cx[t] += P[v * 3] / 3; cy[t] += P[v * 3 + 1] / 3; cz[t] += P[v * 3 + 2] / 3;
    }
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    flat[t] = ny > 0.93 * Math.hypot(nx, ny, nz) && cy[t] > 8.4 && cy[t] < 11.6 ? 1 : 0;
  }
  const CELL = 1.0, R = 2.0;
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  let swept = 0;
  for (let ring = 0; ring < 6; ring++) {
    const teak = new Map();
    for (let t = 0; t < nf; t++) {
      if (!flat[t] || C[t] !== DECK) continue;
      const k = key(cx[t], cz[t]);
      if (!teak.has(k)) teak.set(k, []);
      teak.get(k).push(t);
    }
    const now = [];
    for (let t = 0; t < nf; t++) {
      if (!flat[t] || (C[t] !== LIGHT && C[t] !== DARK && C[t] !== GREEN)) continue;
      const hs = [];
      const gx = Math.floor(cx[t] / CELL), gz = Math.floor(cz[t] / CELL);
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        for (const u of teak.get(`${gx + a},${gz + b}`) || []) {
          if (Math.hypot(cx[u] - cx[t], cz[u] - cz[t]) < R) hs.push(cy[u]);
        }
      }
      if (hs.length < 3) continue;
      hs.sort((p, q) => p - q);
      if (Math.abs(cy[t] - hs[hs.length >> 1]) < 0.14) now.push(t);
    }
    for (const t of now) C[t] = DECK;
    swept += now.length;
    if (!now.length) break;
  }
  console.log(`weather decks swept: ${swept} faces of grey on her teak`);
}

// ---- and the splinters ------------------------------------------------------------
// Where a cut ran through a grey face at the foot of something, what was left
// of the face on the deck side is a splinter of grey a hand wide and a metre
// or two long, lying in the teak -- or standing a few centimetres up out of
// it, where a patch met the deck round it a step down: to the eye a crack in
// her deck. A face that thin and that low, at the height of a weather deck,
// with teak or another splinter along two of its three edges, is teak.
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
    if (C[t] !== LIGHT && C[t] !== DARK && C[t] !== GREEN) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const n2 = Math.hypot(nx, ny, nz);
    if (ny < 0) continue;
    let cy = 0, longest = 0, lo = Infinity, hi = -Infinity;
    for (let j = 0; j < 3; j++) {
      const a = T[t * 3 + j], b = T[t * 3 + (j + 1) % 3];
      cy += P[a * 3 + 1] / 3;
      lo = Math.min(lo, P[a * 3 + 1]); hi = Math.max(hi, P[a * 3 + 1]);
      longest = Math.max(longest, Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]));
    }
    if (cy < 8.4 || cy > 11.6 || hi - lo > 0.3) continue;
    // Its width across its longest edge.
    if (n2 / (longest || 1) < 0.25) splinter[t] = 1;
  }
  let swept = 0;
  for (let pass = 0; pass < 8; pass++) {
    const now = [];
    for (let t = 0; t < nf; t++) {
      if (splinter[t] !== 1 || C[t] === DECK) continue;
      // Along teak, and from the teak inwards: a run of splinters is taken
      // in from its end that lies against the teak.
      let teak = 0, along = 0;
      for (let j = 0; j < 3; j++) {
        const k = edgeKey(canon[T[t * 3 + j]], canon[T[t * 3 + (j + 1) % 3]]);
        const by = faces.get(k).filter((u) => u !== t);
        if (by.some((u) => C[u] === DECK)) teak++;
        if (by.some((u) => C[u] === DECK || splinter[u])) along++;
      }
      if (teak >= 1 && along >= 2) now.push(t);
    }
    for (const t of now) C[t] = DECK;
    swept += now.length;
    if (!now.length) break;
  }
  console.log(`splinters: ${swept} of grey in her teak`);
}

// ---- the dents in her flats -----------------------------------------------------
// Decimation dented everything flat on her -- her decks, the sides of her
// tower, her funnel -- and the sculpt was lumpy before that. The dents come out
// along each face's normal, corners and creases held (see denoise): her
// upperworks harder than her hull, because they are the lumpiest part of her
// and there are no lines of hers up there to keep.
/**
 * Which faces of a mesh are part of something thin -- a spar, a yard, a
 * wireless aerial, a rail, a bulwark: a face with another facing roughly the
 * other way within `r` of it. Denoising a thing like that averages the faces
 * round it into one another until it is flat, and a mast goes into the water
 * as a stack of blades; it is left as the sculpt drew it.
 */
function thinFaces(mesh, r) {
  const { P, T } = mesh;
  const nf = T.length / 3;
  const c = new Float64Array(nf * 3), n = new Float64Array(nf * 3);
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / r)},${Math.floor(y / r)},${Math.floor(z / r)}`;
  for (let t = 0; t < nf; t++) {
    const [x, y, z] = faceNormal(mesh, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const l = Math.hypot(x, y, z) || 1;
    n[t * 3] = x / l; n[t * 3 + 1] = y / l; n[t * 3 + 2] = z / l;
    for (let k = 0; k < 3; k++) c[t * 3 + k] = (P[T[t * 3] * 3 + k] + P[T[t * 3 + 1] * 3 + k] + P[T[t * 3 + 2] * 3 + k]) / 3;
    const kk = key(c[t * 3], c[t * 3 + 1], c[t * 3 + 2]);
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(t);
  }
  const thin = new Uint8Array(nf);
  for (let t = 0; t < nf; t++) {
    const gx = Math.floor(c[t * 3] / r), gy = Math.floor(c[t * 3 + 1] / r), gz = Math.floor(c[t * 3 + 2] / r);
    search: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      for (const u of grid.get(`${gx + a},${gy + b},${gz + d}`) || []) {
        if (n[t * 3] * n[u * 3] + n[t * 3 + 1] * n[u * 3 + 1] + n[t * 3 + 2] * n[u * 3 + 2] > -0.5) continue;
        if (Math.hypot(c[t * 3] - c[u * 3], c[t * 3 + 1] - c[u * 3 + 1], c[t * 3 + 2] - c[u * 3 + 2]) > r) continue;
        thin[t] = 1;
        break search;
      }
    }
  }
  return thin;
}

const thin = thinFaces(m, 0.6);
if (!process.env.NOSMOOTH) {
  console.log(`thin: ${thin.reduce((s, v) => s + v, 0)} faces of spars, wires, rails and plate left as drawn`);
  const up = denoise(m, weld(m), {
    sigmaS: 1.1, sigmaR: 0.33, normalIters: 10, vertexIters: 25, max: 0.4,
    only: (x, y, z, t) => y > 11.0 && !thin[t],
  });
  console.log(`upperworks denoised: ${up.points} points, ${(up.movedMean * 100).toFixed(1)} cm on average, ${(up.movedMax * 100).toFixed(1)} cm at most`);
  recomputeNormals(m);
  const d = denoise(m, weld(m), {
    sigmaS: 0.6, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.2, only: (x, y, z, t) => !thin[t],
  });
  console.log(`denoised: ${d.points} points, ${(d.movedMean * 100).toFixed(1)} cm on average, ${(d.movedMax * 100).toFixed(1)} cm at most`);
  recomputeNormals(m);
}

// ---- fair her sides, and split her normals at her creases ------------------------
// Her deck edge amidships is her upper deck, 9.3 m, and 10.2 at the stem.
const FAIR = {
  passes: 24, lambda: 0.5, mu: -0.53, max: 0.3, foot: -2.4, midbody: 0.8,
  planZ: [-100, 100, 5], planY: [-7, 8, 1],
};
let canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: 8.5, edgeCap: 10.6, slice: true, beamFloor: 0 });
if (!process.env.NOFAIR) fair(m, canon, st, FAIR);
recomputeNormals(m);
canon = weld(m);
// Her spars, wires and rails shaded round rather than as prisms.
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: FAIR.foot, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -17.5, z0: -109, step: 0.5, nx: 71, nz: 437 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// Every point of her is one paint, the one every triangle round it is (the
// normals were split wherever two paints meet).
const paintOfVertex = new Uint8Array(m.P.length / 3);
for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOfVertex[m.T[t * 3 + j]] = m.C[t];
const uvArr = boxUvs(m);
const col = paint(m, (i) => PALETTE[paintOfVertex[i]]);

// ---- her turrets ----------------------------------------------------------------------
// Out of the finer decimation of her forecastle, box by box, exactly as they
// came out of her: the gunhouse down to the barbette it trains on, and the
// sculpt's barrels measured and turned afresh.

/** The triangles of `mesh` selected by `pick(t)`, as a mesh of their own, paint and all. */
function subMesh(mesh, pick) {
  const map = new Map();
  const P = [], N = [], T = [], C = [];
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
    if (mesh.C) C.push(mesh.C[t]);
  }
  return mesh.C ? { P, N, T, C } : { P, N, T };
}
const clone = (mesh) => ({ P: mesh.P.slice(), N: mesh.N.slice(), T: mesh.T.slice(), ...(mesh.C ? { C: mesh.C.slice() } : {}) });
/** Only the points a mesh uses. */
const compact = (mesh) => subMesh(mesh, () => true);

/** Normals split at creases (and paints), for a piece with no side plating. */
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

/**
 * A mounting's barrels, off points of it in its own frame (along +z, across x,
 * up y): `n` of them, told apart by how far across each is. Where each runs,
 * the elevation they are stowed at, how far out the muzzles are, and the
 * radius along them -- the same for all of them.
 */
function barrelsOf(pts, n, face, tipMax, { rMin, rMax, bin }) {
  // Split across into n lanes, by where the points bunch.
  const xs = pts.map(([, x]) => x).sort((a, b) => a - b);
  const lo = xs[Math.floor(xs.length * 0.02)], hi = xs[Math.floor(xs.length * 0.98)];
  const lane = (x) => Math.max(0, Math.min(n - 1, Math.floor(((x - lo) / (hi - lo)) * n)));
  const sides = Array.from({ length: n }, () => []);
  for (const [z, x, y] of pts) sides[lane(x)].push([z, x, y]);
  const lines = sides.map((side) => {
    let f = fitLine(side);
    for (let it = 0; it < 3; it++) {
      const d = side.map(([a, c, y]) => Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a)));
      const med = d.slice().sort((p, q) => p - q)[d.length >> 1];
      f = fitLine(side.filter((_, k) => d[k] < med * 1.6 + 0.05));
    }
    let tip = -Infinity;
    for (const [a, c, y] of side) if (Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a)) < rMax * 1.4) tip = Math.max(tip, a);
    return { f, tip: Math.min(tip, tipMax), side };
  });
  const tipAlong = lines.reduce((s, l) => s + l.tip, 0) / n;
  const mid = (face + tipAlong) / 2;
  const across = lines.map((l) => l.f.c0 + l.f.kc * mid).sort((a, b) => a - b);
  // Evenly spaced about their own middle, as a mounting's barrels are.
  const centre = across.reduce((s, v) => s + v, 0) / n;
  const pitchAcross = n > 1 ? (across[n - 1] - across[0]) / (n - 1) : 0;
  const xsOut = Array.from({ length: n }, (_, k) => centre + (k - (n - 1) / 2) * pitchAcross);
  const ky = lines.reduce((s, l) => s + l.f.ky, 0) / n;
  const yMid = lines.reduce((s, l) => s + l.f.y0 + l.f.ky * mid, 0) / n;
  const yAt = (a) => yMid + ky * (a - mid);
  const bins = [];
  for (const { f, side } of lines) {
    for (const [a, c, y] of side) {
      const r = Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a));
      if (r > rMax * 1.4) continue;
      const k = Math.floor((a - face) / bin);
      (bins[k] ||= []).push(r);
    }
  }
  const raw = bins.map((b) => (b && b.length >= 3 ? b.sort((p, q) => p - q)[Math.floor(b.length * 0.7)] : null));
  const fill = raw.map((_, k) => {
    let s2 = 0, w = 0;
    for (let d = -1; d <= 1; d++) { const v = raw[k + d]; if (v != null) { const ww = d === 0 ? 2 : 1; s2 += v * ww; w += ww; } }
    return w ? s2 / w : null;
  });
  // Made monotone from the jacket to the chase -- a barrel does not swell and
  // pinch along its length -- bar the swell at the muzzle.
  const prof = [];
  let last = Infinity;
  fill.forEach((r, k) => {
    if (r == null) return;
    const a = face + (k + 0.5) * bin;
    if (a > tipAlong - bin) return;
    last = Math.min(last, r);
    prof.push([a, Math.max(rMin, Math.min(rMax, last))]);
  });
  const pitch = Math.atan(ky);
  const reachFrom = (z0) => (tipAlong - z0) / Math.cos(pitch);
  return { xs: xsOut, yAt, ky, pitch, face, tipAlong, profile: prof, reachFrom };
}

/**
 * The barrels turned true, in the frame of the cradle: its origin on the
 * trunnions, the bore along +z, level -- the cradle is what is laid at the
 * elevation the sculpt stows them at. From a metre behind the face, out of
 * sight inside the gunhouse however far they elevate, to the muzzle: the
 * jacket where they come out of the face, the chase, and a swell at the
 * muzzle round a bore you can see down.
 */
function turnedBarrels(bar, trunnion, reach, SEG = 20) {
  const cp = Math.cos(bar.pitch);
  const alongToS = (a) => (a - trunnion[2]) / cp;
  const L = reach;
  const rJacket = bar.profile.length ? bar.profile[0][1] : 0.6;
  const rChase = bar.profile.length ? bar.profile[bar.profile.length - 1][1] : 0.48;
  const ring = [[-0.4, rJacket]];
  for (const [a, r] of bar.profile) if (alongToS(a) < L - 0.6) ring.push([alongToS(a), r]);
  const rSwell = Math.min(rJacket, rChase * 1.1);
  ring.push([L - 0.55, rChase], [L - 0.4, rSwell], [L - 0.06, rSwell], [L, rSwell * 0.9]);
  ring.sort((p, q) => p[0] - q[0]);
  const P = [], N = [], T = [];
  for (const x0 of bar.xs) {
    const base = P.length / 3;
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
    {
      const [sz, r] = ring[0];
      const c = P.length / 3;
      P.push(x0, 0, sz); N.push(0, 0, -1);
      const b0 = P.length / 3;
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * r, Math.sin(a) * r, sz); N.push(0, 0, -1); }
      for (let j = 0; j < SEG; j++) T.push(c, b0 + ((j + 1) % SEG), b0 + j);
    }
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

/**
 * A gunhouse with the sculpt's own barrels taken off it: everything more than
 * `ahead` of the face, and the skin of each old barrel between the face and
 * that cut, out to `axisR` from its axis. What is left is closed; the new
 * barrels come out of the holes.
 */
function strippedHouse(house0, bar, face, y0, { ahead = 0.35, axisR = 0.8 } = {}) {
  const trimmed = clone(house0);
  boxCut(trimmed, { x0: -12, x1: 12, y0, y1: 40, z0: -20, z1: face + ahead }, { keep: 'inside' });
  const tip = face + ahead;
  const nearAxis = (x, y, z) => z >= face - 0.3 && bar.xs.some((bx) => Math.hypot(x - bx, y - bar.yAt(z)) < axisR);
  let house = subMesh(trimmed, (tri) => {
    const vs = [0, 1, 2].map((j) => trimmed.T[tri * 3 + j]);
    for (const v of vs) if (!nearAxis(trimmed.P[v * 3], trimmed.P[v * 3 + 1], trimmed.P[v * 3 + 2])) return true;
    if (vs.every((v) => Math.abs(trimmed.P[v * 3 + 2] - tip) < 1e-3)) return false;
    const [nx, ny, nz] = faceNormal(trimmed, vs[0], vs[1], vs[2]);
    const nl = Math.hypot(nx, ny, nz) || 1;
    const along = Math.abs((ny * bar.ky + nz) / (nl * Math.hypot(bar.ky, 1)));
    return along >= 0.6;
  });
  // Only the gunhouse and what is part of it: not a scrap the box left
  // standing on its own.
  const parts = components(house);
  const big = new Set();
  for (const c of parts) if (c.tris.length >= parts[0].tris.length * 0.08) for (const q of c.tris) big.add(q);
  house = subMesh(house, (tri) => big.has(tri));
  const s1 = closeHoles(house, new Uint8Array(house.T.length / 3).fill(1), () => null, { open: true });
  return { house, holes: s1.loops };
}

const tm = load(TURRET_SRC);
fixWinding(tm);
const turretParts = [];
for (const t of TURRETS) {
  const boxes = turretBoxes(t);
  const piece = clone(tm);
  boxCut(piece, boxes[0], { keep: 'inside' });
  const house0 = compact(piece);
  // Into the mounting's frame: along her axis towards the muzzles, across to
  // port, and up from the barbette she trains on. All three face ahead.
  for (let i = 0; i < house0.P.length; i += 3) house0.P[i + 2] -= t.z;
  // Her barrels, off the finer decimation: where each runs and how thick.
  const pts = [];
  for (let i = 0; i < tm.P.length; i += 3) {
    const x = tm.P[i], y = tm.P[i + 1], z = tm.P[i + 2] - t.z;
    if (z < t.face + 0.8 || z > t.barrels.tip || Math.abs(x) > BARREL_HALF || y < t.barrels.y[0] || y > t.barrels.y[1]) continue;
    pts.push([z, x, y]);
  }
  const bar = barrelsOf(pts, 3, t.face, t.barrels.tip, { rMin: 0.3, rMax: 0.8, bin: 0.5 });
  const { house: stripped, holes } = strippedHouse(house0, bar, t.face, t.floor + 0.02);
  let house = stripped;
  if (!process.env.NOSMOOTH) {
    recomputeNormals(house);
    const thin = thinFaces(house, 0.45);
    denoise(house, weld(house), {
      sigmaS: 0.45, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.12, only: (x, y, z, t) => !thin[t],
    });
  }
  creased(house, 40);
  for (let i = 1; i < house.P.length; i += 3) house.P[i] -= t.floor;
  const trunnion = [0, bar.yAt(t.face - 0.8) - t.floor, t.face - 0.8];
  const reach = bar.reachFrom(t.face - 0.8);
  const guns = turnedBarrels({ ...bar, yAt: (a) => bar.yAt(a) - t.floor }, trunnion, reach);
  const muzzles = bar.xs.map((x) => [+x.toFixed(3), 0, +reach.toFixed(3)]);
  console.log(`${t.name}: gunhouse ${house.T.length / 3} triangles (${holes} holes closed); barrels at `
    + `${bar.xs.map((x) => x.toFixed(2)).join('/')}, ${reach.toFixed(2)} m trunnion to muzzle, stowed at `
    + `${(bar.pitch * 180 / Math.PI).toFixed(1)} degrees; radius ${bar.profile.map(([a, r]) => `${a.toFixed(1)}:${r.toFixed(2)}`).join(' ')}`);
  turretParts.push({
    name: t.name, z: t.z, seat: t.floor, trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles,
    pitch: +bar.pitch.toFixed(4), house, guns,
  });
}

// ---- her 6-inch twin ---------------------------------------------------------------------
// The owner's sculpt of the gun: barrels along -X, Y up, across Z, about two
// units long. Turned a quarter about the vertical to face ahead -- a rotation,
// as her hull is -- and scaled to the gunhouses the ship sculpt drew for it,
// which are seven and a half metres long and six and a half across. Its skirt
// is ragged where the sculpt ended it, so the gunhouse is cut off square a
// few centimetres above the worst of it, and that is its floor.
const SEC_SCALE = 6.3;
const SEC_CUT = -0.16;
// The middle of its gunhouse in plan, which is what it trains about, and
// where its barrels come out of its sloped face -- the face runs on forward
// under them to its foot, and is kept.
const SEC_PIVOT = 0.365;
const SEC_FACE = -0.13;
const secondaryPart = (() => {
  const raw = readGlb(SEC_SRC);
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    const x = raw.pos[i], y = raw.pos[i + 1], z = raw.pos[i + 2];
    P.push(z * SEC_SCALE, (y - SEC_CUT) * SEC_SCALE, -(x - SEC_PIVOT) * SEC_SCALE);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const g = { P, N, T: Array.from(raw.idx) };
  fixWinding(g);
  const face = -(SEC_FACE - SEC_PIVOT) * SEC_SCALE;
  let tip = -Infinity;
  for (let i = 0; i < P.length; i += 3) tip = Math.max(tip, P[i + 2]);
  const pts = [];
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 2] < face + 0.6 || P[i + 2] > tip) continue;
    pts.push([P[i + 2], P[i], P[i + 1]]);
  }
  const bar = barrelsOf(pts, 2, face, tip, { rMin: 0.12, rMax: 0.36, bin: 0.25 });
  const body = clone(g);
  boxCut(body, { x0: -10, x1: 10, y0: 0, y1: 10, z0: -10, z1: 10 }, { keep: 'inside' });
  const { house: stripped, holes } = strippedHouse(compact(body), bar, face, 0.001, { ahead: 0.62, axisR: 0.34 });
  const house = stripped;
  if (!process.env.NOSMOOTH) {
    recomputeNormals(house);
    const thin = thinFaces(house, 0.3);
    denoise(house, weld(house), {
      sigmaS: 0.25, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.05, only: (x, y, z, t) => !thin[t],
    });
  }
  creased(house, 40);
  const trunnion = [0, bar.yAt(face - 0.5), face - 0.5];
  const reach = bar.reachFrom(face - 0.5);
  const guns = turnedBarrels(bar, trunnion, reach, 14);
  const muzzles = bar.xs.map((x) => [+x.toFixed(3), 0, +reach.toFixed(3)]);
  let top = 0;
  for (let i = 1; i < house.P.length; i += 3) top = Math.max(top, house.P[i]);
  console.log(`6-inch: gunhouse ${house.T.length / 3} triangles (${holes} holes closed), ${top.toFixed(2)} m high; `
    + `barrels at ${bar.xs.map((x) => x.toFixed(2)).join('/')}, face ${face.toFixed(2)}, ${reach.toFixed(2)} m trunnion to muzzle, `
    + `stowed at ${(bar.pitch * 180 / Math.PI).toFixed(1)} degrees; radius ${bar.profile.map(([a, r]) => `${a.toFixed(1)}:${r.toFixed(2)}`).join(' ')}`);
  return { trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +bar.pitch.toFixed(4), height: +top.toFixed(3), house, guns };
})();

/** A piece in the compact form, painted if it carries a paint a triangle. */
function packPiece(mesh) {
  if (!mesh.C) return packPieceCompact(mesh);
  const byV = new Uint8Array(mesh.P.length / 3);
  for (let t = 0; t < mesh.T.length / 3; t++) for (let j = 0; j < 3; j++) byV[mesh.T[t * 3 + j]] = mesh.C[t];
  return packPieceCompact(mesh, (i) => PALETTE[byV[i]]);
}

// ---- her lines, as the sculpt has them --------------------------------------------
// What her interior and her armour are fitted under and what the fleet's
// structural checks feel her over: a metre at a time along her, the bottom of
// her keel, the deck over her insides -- the lowest deck anywhere across her
// with open air over it -- and how far out her side is at every half metre of
// height.
const LINES = { z0: -108, dz: 1, nz: 217, y0: -9, dy: 0.5, ny: 43 };
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
    for (let j = 0; j < LINES.ny; j++) {
      const y = LINES.y0 + j * LINES.dy;
      let w = 0;
      for (const [[xa, ya], [xb, yb]] of segs) {
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        w = Math.max(w, Math.abs(xa + (xb - xa) * ((y - ya) / (yb - ya))));
      }
      half.push(w);
    }
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
  const filled = deck.map((v, k) => (Number.isNaN(v) ? (deck[k - 1] ?? deck[k + 1] ?? DECK_Y) : v));
  LINES.deck = filled.map((_, k) => {
    let v = Infinity;
    for (let d = -6; d <= 6; d++) { const q = filled[k + d]; if (q !== undefined) v = Math.min(v, q); }
    return +v.toFixed(2);
  });
  LINES.keel = keel.map((v) => +v.toFixed(2));
  LINES.half = half.map((v) => +v.toFixed(2));
  const at = (z) => LINES.deck[Math.round((z - LINES.z0) / LINES.dz)];
  console.log('the deck over her insides:', [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100].map((z) => `${z}:${at(z)}`).join(' '));
}

// ---- slice, pack and write ------------------------------------------------------------
if (process.env.DEBUG_GLB) {
  const { writeGlb } = await import(process.env.DEBUG_GLB_LIB);
  writeGlb(process.env.DEBUG_GLB, m, col);
}
// Her decks are drawn as decks and the rest of her as plating.
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 56, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const turrets = turretParts.map((p) => ({
  name: p.name, z: p.z, seat: p.seat, trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch,
  house: packPiece(p.house).toString('base64'),
  guns: packPiece(p.guns).toString('base64'),
}));
const secondary = {
  trunnion: secondaryPart.trunnion, muzzles: secondaryPart.muzzles, pitch: secondaryPart.pitch,
  height: secondaryPart.height,
  // Where each of the six stands: the middle of the lump it replaces, which
  // way it faces, and the top of the barbette it trains on. Port side; the
  // starboard turrets are their mirrors.
  seats: SECONDARY.map(({ name, x, z, rest, up }) => ({ name, x, z, rest: +rest.toFixed(6), up })),
  house: packPiece(secondaryPart.house).toString('base64'),
  guns: packPiece(secondaryPart.guns).toString('base64'),
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-rodney-hull.mjs from the owner's sculpts. Do not\n`
  + `// hand-edit -- regenerate from the source assets instead.\n`
  + `export const RODNEY_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see rodneySurfaceY.\n`
  + `export const RODNEY_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her three turrets as the sculpt drew them, each in the frame of its own\n`
  + `// mounting: the gunhouse, painted, and the barrels about their trunnions.\n`
  + `export const RODNEY_TURRETS = ${JSON.stringify(turrets)};\n`
  + `// Her 6-inch twin, off the owner's sculpt of it, in the frame of the mounting.\n`
  + `export const RODNEY_SECONDARY = ${JSON.stringify(secondary)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const RODNEY_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
