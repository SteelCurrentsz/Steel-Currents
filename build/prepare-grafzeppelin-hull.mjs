// Turn the owner's KMS Graf Zeppelin sculpt into what
// client/js/render/grafZeppelinHull.js ships. In order:
//
//   * calibrate it into this game's frame -- bow to +Z by a quarter turn,
//     262.5 m from her stem to the after end of her flight deck, floated at
//     her 9.6 m;
//   * close every hole the sculpt had, each in its own plane;
//   * clear her flight deck: everything that stood on it but her island --
//     the crushed aeroplane on her after lift, the heap on her middle lift,
//     the twisted frame-work along both her edges aft, her masts and her
//     cranes -- is carved off down to the deck and the holes closed; and
//     the light flak and the 15 cm the sculpt had cast in as lumps come out
//     of their sponsons, so grafzeppelin.js can stand a gun there that
//     trains;
//   * lay her runway flat: every point of her flight deck from the after
//     round-down to the forward end of it is put on the one plane her deck
//     is at, so the deck an aeroplane runs down has no ripple in it, and the
//     edge of it is a straight line;
//   * cut her three lift wells out of the deck, exactly to their octagons,
//     so the lifts in grafzeppelin.js go down through her and the deck
//     round them is whole;
//   * paint her: red under her boot topping, black through it, light grey
//     over, and her flight deck planked;
//   * read her surface off as a height map and her lines off her sections,
//     which is what grafzeppelin.js stands her fittings on and fits her
//     armour, her hangars and her insides under;
//   * bucket her into length-wise slices and pack her, base64'd, into a
//     source file grafzeppelin.js decodes synchronously.
//
// The stages are build/sculpt.mjs and build/sculpt-parts.mjs; what is here is
// what is hers. Her 15 cm single is the Scharnhorst's and her 10.5 cm twin the
// Bismarck's, as the owner sculpted each (see scharnhorstHull.js and
// bismarckHull.js): they are not taken down again here.
//
//   node build/prepare-grafzeppelin-hull.mjs
//
// Reads assets/models/grafzeppelin-hull.glb (made by
// build/grafzeppelin-source.mjs), writes client/js/render/grafZeppelinHull.data.js.
// Re-run it whenever the asset or anything below changes; the data file is
// committed, so a fresh clone runs without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, carve, closeHoles, nearestBox, components,
  recomputeNormals, weld, stations, hardEdges, shadePlating, boxUvs,
  paletteToLinear, paint, heightmap, heightBytes, pack, faceNormal,
} from './sculpt.mjs';
import { subMesh, dropLoose, measureLines, creased } from './sculpt-parts.mjs';
import { splitAt } from './sculpt-source.mjs';
import { SCHARNHORST_GUNS } from '../client/js/render/scharnhorstHull.data.js';
import { BISMARCK_GUNS } from '../client/js/render/bismarckHull.data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/models/grafzeppelin-hull.glb');
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/grafZeppelinHull.data.js');

const REAL_LOA = 262.5;
/**
 * Her draught as the sculpt has her: a metre deeper than the 8.5 m of her
 * book, because that is where her own lines put her waterline -- on the crown
 * of her bulge -- and where the screws the sculpt hung on her are under it
 * rather than breaking the surface.
 */
export const DRAFT = 9.6;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt is 1.9024 units from her stem to the after end of her flight
// deck, which is her 262.5 m overall, and that one scale does for her across
// and up as well: it makes her 36 m across her bulges, 23.6 m from her keel
// to her flight deck, and puts her runway 15.6 m over the water. Her keel is
// the flat of her bottom, -0.2010 in the sculpt. Her bow is at -X and her
// island to -Z, so she is turned a quarter round and her island comes out on
// her starboard side, -X here, as it was:
//
//   world_X =  local_Z * UNIT
//   world_Y = (local_Y - KEEL) * UNIT - DRAFT
//   world_Z = -(local_X - xc) * UNIT
const SCULPT = { x0: -0.9580, x1: 0.9444, keel: -0.2010 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const XC = (SCULPT.x0 + SCULPT.x1) / 2;

function load(file) {
  const raw = readGlb(file);
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(raw.pos[i + 2] * UNIT, (raw.pos[i + 1] - SCULPT.keel) * UNIT - DRAFT, -(raw.pos[i] - XC) * UNIT);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  return { P, N, T: Array.from(raw.idx) };
}

let m = load(SRC);
{
  const { lo, hi } = bbox(m);
  console.log('calibration: UNIT', UNIT.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- her decks --------------------------------------------------------------------
/** Her flight deck: where its top is, and how far fore and aft it is flat. */
export const FD = 15.60;
const FLAT = { aft: -116.0, fwd: 106.0 };
/**
 * Her island, and everything that is part of it standing on her flight deck
 * to starboard: its two director domes at either end, the crane at its after
 * end, its galleries out over her side. Nothing in here is carved.
 */
export const ISLAND = { x0: -21.5, x1: -6.8, z0: -16.5, z1: 40.5 };
const inIsland = (x, z) => x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1;

/** The middle of triangle `t`. */
const middle = (mesh, t) => {
  const { P, T } = mesh;
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};

// ---- clear her flight deck ------------------------------------------------------------
// Everything standing over her flight deck but her island goes, down to a
// hand over the deck: in four boxes round the island.
const OVER = FD + 0.08;
const CLEAR_DECK = [
  { name: 'forward of the island', x0: -40, x1: 40, z0: ISLAND.z1, z1: 140, floor: () => OVER },
  { name: 'abaft the island', x0: -40, x1: 40, z0: -140, z1: ISLAND.z0, floor: () => OVER },
  { name: 'abreast the island', x0: ISLAND.x1, x1: 40, z0: ISLAND.z0, z1: ISLAND.z1, floor: () => OVER },
  { name: 'outboard of the island', x0: -40, x1: ISLAND.x0, z0: ISLAND.z0, z1: ISLAND.z1, floor: () => OVER },
  // And the two spars hung across the forward end of her flight deck, out
  // past both her sides, with nothing to do with anything.
  { name: 'spars forward, starboard', x0: -20, x1: -12.4, z0: 105.0, z1: 108.5, floor: () => FD - 7 },
  { name: 'spars forward, port', x0: 12.4, x1: 20, z0: 105.0, z1: 108.5, floor: () => FD - 7 },
];
{
  const { keep, cut } = carve(m, CLEAR_DECK);
  console.log('deck cleared:', [...cut].map(([k, n]) => `${k} ${n}`).join(', '));
  // Her deck is not level as the sculpt drew it: aft it rises in patches a
  // few hands over the plane her runway is laid at, and her side plating goes
  // up to meet them. A face of her side that stands on edge, comes up from
  // well under her deck and stops at it is her side and not something left
  // on her deck, whatever the carve's floor says.
  let kept = 0;
  for (let t = 0; t < m.T.length / 3; t++) {
    if (keep[t]) continue;
    const ys = [0, 1, 2].map((j) => m.P[m.T[t * 3 + j] * 3 + 1]);
    const [nx, ny, nz] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
    if (Math.abs(ny) > 0.3 * Math.hypot(nx, ny, nz)) continue;
    if (Math.max(...ys) > FD + 0.6 || Math.min(...ys) > FD - 0.4) continue;
    keep[t] = 1;
    kept++;
  }
  console.log(`  ${kept} faces of her side put back`);
  const s = closeHoles(m, keep, nearestBox(CLEAR_DECK));
  console.log('closed', s.loops, 'holes with', s.capped, 'triangles;', s.skirted, 'skirted;', s.fanned, 'fanned;', s.chains, 'open chains');
}
dropLoose(m, { maxArea: 1.5, maxDiag: 3 });

// ---- her runway -------------------------------------------------------------------------
// The sculpt's runway is a sheet of clay: it ripples, it has pans pressed
// into it where her lifts are, and the carve leaves seams across it wherever
// it took something off. None of that is what an aeroplane runs down. So it
// is taken off her -- all of it inboard of a band along her deck edge, down
// through anything pressed into it -- and grafzeppelin.js lays her flight
// deck afresh over the outline she has here: one flat planked sheet at `FD`,
// with her three lift wells cut through it to their octagons.
//
// Her outline is read off her before it goes: at every half metre of her
// length, how far out each way her deck runs at its own height, and then the
// running median over five metres, which keeps every step her deck edge has
// and takes out the sponsons at its height that stand out past it for a few
// metres at a time. Abreast her island the starboard edge is the island's
// inboard face. The band along her edge is kept and put on the deck plane,
// so the new sheet lies on the edge of her and not in the air beside it.
const PLAN = { z0: -134, dz: 0.5, nz: 537 };
const BAND = 0.8;
let plan;
{
  const HM = { x0: -24, z0: PLAN.z0, step: 0.25, nx: 193, nz: (PLAN.nz - 1) * 2 + 1 };
  const hm = heightmap(m, HM);
  const deckAt = (x, z) => {
    const i = Math.round((x - HM.x0) / HM.step), j = Math.round((z - HM.z0) / HM.step);
    if (i < 0 || j < 0 || i >= HM.nx || j >= HM.nz) return false;
    const y = hm[j * HM.nx + i];
    return y > FD - 0.6 && y < OVER + 0.1;
  };
  const port = new Float32Array(PLAN.nz), stbd = new Float32Array(PLAN.nz);
  for (let k = 0; k < PLAN.nz; k++) {
    const z = PLAN.z0 + k * PLAN.dz;
    if (!deckAt(0, z)) continue;
    let p = 0; while (p < 23 && deckAt(p + 0.25, z)) p += 0.25;
    let q = 0; while (q < 23 && deckAt(-q - 0.25, z) && !inIsland(-q - 0.25, z)) q += 0.25;
    port[k] = p; stbd[k] = q;
  }
  const median = (a) => Float32Array.from(a, (_, k) => {
    const w = [];
    for (let d = -5; d <= 5; d++) if (k + d >= 0 && k + d < a.length) w.push(a[k + d]);
    w.sort((u, v) => u - v);
    return w[w.length >> 1];
  });
  plan = { ...PLAN, port: median(port), stbd: median(stbd) };
  // Abreast her island the median would carry the starboard edge under the
  // island's foot; it stops at its face.
  for (let k = 0; k < PLAN.nz; k++) {
    const z = PLAN.z0 + k * PLAN.dz;
    if (z > ISLAND.z0 && z < ISLAND.z1) plan.stbd[k] = Math.min(plan.stbd[k], -ISLAND.x1 + 0.3);
  }
}
/** How far out her deck runs each way at z, 0 off it. */
const planAt = (side, z) => {
  const k = Math.round((z - plan.z0) / plan.dz);
  return k < 0 || k >= plan.nz ? 0 : plan[side][k];
};
{
  let gone = 0;
  const keep = subMesh(m, (t) => {
    const [cx, cy, cz] = middle(m, t);
    if (cy < FD - 2.3 || cy > OVER + 0.1 || inIsland(cx, cz)) return true;
    const out = cx > 0 ? planAt('port', cz) : planAt('stbd', cz);
    if (out <= BAND || Math.abs(cx) >= out - BAND) return true;
    // Her runway faces the sky, and so does anything pressed into it. What
    // stands on edge is her side -- on her quarters it is set well in under
    // her deck edge, behind her galleries -- and taken off it is a row of
    // holes along her with the sky through them; the walls of a pan pressed
    // into her runway that are kept with it are under the new deck.
    const [nx, ny, nz] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
    if (ny < 0.3 * Math.hypot(nx, ny, nz)) return true;
    gone++;
    return false;
  });
  m = { P: keep.P, N: keep.N, T: keep.T };
  console.log(`her runway taken off: ${gone} triangles inboard of the band along her deck edge`);
  // Only what faces the sky: a point on the lip of her deck edge or on a wall
  // standing on it, put up on the deck, turns the face under it inside out.
  let n = 0;
  for (let i = 0; i < m.P.length; i += 3) {
    const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
    if (z < FLAT.aft || z > FLAT.fwd || y > OVER + 0.05 || m.N[i + 1] < 0.4) continue;
    if (y >= FD - (inIsland(x, z) ? 0.15 : 0.45)) { m.P[i + 1] = FD; n++; }
  }
  console.log(`the band along her deck edge put on the deck at ${FD} m: ${n} points`);
  const widths = [-110, -80, -40, 0, 20, 40, 80, 100].map((z) => `${z}:${planAt('stbd', z).toFixed(2)}|${planAt('port', z).toFixed(2)}`);
  console.log('her deck outline, starboard|port:', widths.join(' '));
}
// ---- her guns, out of their casemates and sponsons ---------------------------------------
// Her 15 cm stand where the sculpt cast them in as lumps: a pair a side in the
// long casemate in her side under the forward end of her flight deck, and a
// pair a side on the ledge of the sponson low on her quarter -- the forward of
// them where the sculpt cast its shield, the after one abaft the pillar the
// flak tub over it stands on. Each is carved down to the floor it stands on,
// under the casemate's head and the tub, and grafzeppelin.js stands the
// owner's 15 cm single there.
//
// The two in each casemate stood out from the wall at its back, staggered as
// her bow fines away, and were cast into it: what is carved off there is not
// closed, because the wall is not a plane the hole can be closed in. The gun
// grafzeppelin.js stands in its place has its back in that wall where the
// cast one did, and the casemate's own back is drawn there behind it.
//
// The floors are read off the sculpt: the casemate's at 4.96 m, the ledge's
// at 7.10. The tub over each ledge has a light gun cast in it, which goes
// down to its rim at 13.62.
export const CASEMATE = { floor: 4.96, head: 9.60, z0: 72.7, z1: 92.7 };
export const LEDGE = { floor: 7.10 };
export const POD_TUB = { rim: 13.62 };
const SECONDARY_SEATS = [
  { name: 'casemate forward', x: 9.9, z: 85.96, seat: CASEMATE.floor, casemate: true },
  { name: 'casemate after', x: 12.85, z: 78.3, seat: CASEMATE.floor, casemate: true },
  { name: 'ledge forward', x: 14.2, z: -66.3, seat: LEDGE.floor },
  { name: 'ledge after', x: 14.2, z: -78.0, seat: LEDGE.floor },
];
const bothSides = (list) => list.flatMap((b) => [
  { ...b, name: `${b.name}, port` },
  { ...b, name: `${b.name}, starboard`, x0: -b.x1, x1: -b.x0 },
]);
const CARVE_CASEMATES = bothSides([
  { name: '15 cm cast in the casemate, forward', x0: 7.6, x1: 13.2, z0: 83.6, z1: 88.2, floor: () => CASEMATE.floor + 0.02, y1: CASEMATE.head },
  { name: '15 cm cast in the casemate, after', x0: 10.9, x1: 15.8, z0: 75.7, z1: 80.8, floor: () => CASEMATE.floor + 0.02, y1: CASEMATE.head },
]);
const CARVE_GUNS = bothSides([
  { name: '15 cm shield cast on the ledge', x0: 11.5, x1: 17.5, z0: -71.2, z1: -61.8, floor: () => LEDGE.floor + 0.02, y1: 10.8 },
  { name: 'light gun cast in the tub', x0: 12.5, x1: 17.5, z0: -76.0, z1: -68.5, floor: () => POD_TUB.rim + 0.03 },
]).concat([
  // And on her port side only, the 3.7 cm the sculpt cast on the sponson
  // abreast her island: down to the sponson's floor at 11.3.
  { name: '3.7 cm cast on the port sponson amidships', x0: 15.7, x1: 17.85, z0: -4.3, z1: -2.7, floor: () => 11.42 },
]).concat(bothSides([
  // And the pair cast on her quarter platforms aft, down to the platform at 11.6.
  { name: '3.7 cm cast on the quarter platform', x0: 11.3, x1: 13.3, z0: -116.4, z1: -115.1, floor: () => 11.74 },
]));

// ---- her screws -------------------------------------------------------------------------
// Four shafts, the wing pair ending forward of the inner pair. The sculpt drew
// a screw on the end of each; it is cut off, and grafzeppelin.js draws a
// three-bladed screw there that turns.
export const SCREWS = [
  { x: -7.18, y: -2.56, z: -105.4, r: 2.1 },
  { x: 7.18, y: -2.56, z: -105.4, r: 2.1 },
  { x: -3.24, y: -2.56, z: -111.0, r: 2.1 },
  { x: 3.24, y: -2.56, z: -111.0, r: 2.1 },
];
const CARVE_SCREWS = SCREWS.map((sc, i) => ({
  name: `screw ${i + 1}`, x0: sc.x - sc.r - 0.4, x1: sc.x + sc.r + 0.4, z0: sc.z - 0.9, z1: sc.z + 0.9,
  floor: () => sc.y - sc.r - 0.6, y1: sc.y + sc.r + 0.4,
}));
{
  const boxes = [...CARVE_GUNS, ...CARVE_SCREWS];
  const { keep, cut } = carve(m, boxes);
  console.log('carved:', [...cut].map(([k, n]) => `${k} ${n}`).join(', '));
  const s2 = closeHoles(m, keep, nearestBox(boxes));
  console.log('closed', s2.loops, 'holes with', s2.capped, 'triangles;', s2.skirted, 'skirted;', s2.fanned, 'fanned;', s2.chains, 'open chains');
}
{
  const { keep, cut } = carve(m, CARVE_CASEMATES);
  console.log('carved, and left open:', [...cut].map(([k, n]) => `${k} ${n}`).join(', '));
  const kept = subMesh(m, (t) => keep[t]);
  m = { P: kept.P, N: kept.N, T: kept.T };
}
dropLoose(m, { maxArea: 1.5, maxDiag: 3 });
recomputeNormals(m);

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  // Back into the sculpt's frame, so the same tools look at it.
  const P = [], N = [];
  for (let i = 0; i < m.P.length; i += 3) {
    P.push(-m.P[i + 2] / UNIT + XC, (m.P[i + 1] + DRAFT) / UNIT + SCULPT.keel, m.P[i] / UNIT);
    N.push(-m.N[i + 2], m.N[i + 1], m.N[i]);
  }
  writeGlb(process.env.DUMP, { P, N, T: m.T }, 'build/prepare-grafzeppelin-hull.mjs');
  process.exit(0);
}

// ---- her paint, and her normals split at her creases and its edges ------------------------
// The Kriegsmarine's light grey over her sides and her island, the dark grey
// of her steel decks where they face the sky, a black boot topping through
// her waterline and red under it. She is cut level along the top and the
// bottom of her boot topping first, so both are straight lines, and each
// triangle takes the paint of the band it is in; the normals are split where
// the paint changes as well as at her creases, so each edge is an edge.
const PALETTE = [
  [0x9a, 0x9f, 0xa3],
  [0x5a, 0x60, 0x66],
  [0x1a, 0x1c, 0x1f],
  [0x7a, 0x38, 0x2e],
].map(paletteToLinear);
const GREY = 0, STEEL = 1, BOOT = 2, RED = 3;
const BOOT_LO = -1.2, BOOT_HI = 0.6;
for (const y of [BOOT_LO, BOOT_HI]) console.log(`cut level at ${y} m: ${splitAt(m, y)} triangles split`);
m.C = [];
for (let t = 0; t < m.T.length / 3; t++) {
  const [, cy] = middle(m, t);
  const [nx, ny, nz] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
  m.C.push(cy < BOOT_LO ? RED : cy < BOOT_HI ? BOOT : ny > 0.85 * Math.hypot(nx, ny, nz) && cy > 2 ? STEEL : GREY);
}
creased(m, 40);

// ---- her surface, as a height map --------------------------------------------------
// With her flight deck on it: the sheet grafzeppelin.js lays is what anything
// standing on her runway stands on.
const HM = { x0: -24, z0: -134, step: 0.5, nx: 97, nz: 537 };
const hm = heightmap(m, HM);
for (let j = 0; j < HM.nz; j++) {
  const z = HM.z0 + j * HM.step;
  if (z < FLAT.aft || z > FLAT.fwd) continue;
  for (let i = 0; i < HM.nx; i++) {
    const x = HM.x0 + i * HM.step;
    const out = x > 0 ? planAt('port', z) : planAt('stbd', z);
    if (out > 0 && Math.abs(x) <= out) hm[j * HM.nx + i] = Math.max(hm[j * HM.nx + i], FD);
  }
}
const surfaceAt = (x, z) => {
  const i = Math.round((x - HM.x0) / HM.step), j = Math.round((z - HM.z0) / HM.step);
  return i < 0 || j < 0 || i >= HM.nx || j >= HM.nz ? -99 : hm[j * HM.nx + i];
};

// ---- her lines, as the sculpt has them --------------------------------------------
// Her keel and her half-breadths off her sections. The deck over her insides
// is not read off her: on a carrier it is her lower hangar deck, which
// grafzeppelin.js lays, and her runway is not a deck anything is fitted
// under.
const st = stations(m, { length: REAL_LOA, beamCap: FD - 1.5, edgeCap: FD + 0.5, slice: true, beamFloor: 0 });
const LINES = measureLines(m, st, { z0: -130, dz: 1, nz: 261, y0: -10, dy: 0.5, ny: 54 }, FD);
console.log('her lines: keel amidships', LINES.keel[130].toFixed(2), 'half-breadth at the waterline amidships',
  LINES.half[130 * LINES.ny + 20].toFixed(2));

// ---- paint -----------------------------------------------------------------------------
const paintOfVertex = new Uint8Array(m.P.length / 3);
for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOfVertex[m.T[t * 3 + j]] = m.C[t];
const col = paint(m, (i) => PALETTE[paintOfVertex[i]]);
const uvArr = boxUvs(m);

// ---- where her guns stand ------------------------------------------------------------------
const mounts = {
  secondary: SECONDARY_SEATS.flatMap((g) => [
    { name: `${g.name}, starboard`, x: -g.x, z: g.z, rest: -Math.PI / 2, seat: g.seat, ...(g.casemate ? { casemate: true } : {}) },
    { name: `${g.name}, port`, x: g.x, z: g.z, rest: Math.PI / 2, seat: g.seat, ...(g.casemate ? { casemate: true } : {}) },
  ]),
};
for (const g of mounts.secondary) {
  const under = surfaceAt(g.x, g.z);
  console.log(`  ${g.name}: seat ${g.seat} m, her surface under its pivot ${under.toFixed(2)} m`);
}

// ---- slice, pack and write ------------------------------------------------------------
const packed = pack(m, col, uvArr, { buckets: 72, length: REAL_LOA, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const round = (a, d = 2) => Array.from(a, (v) => +v.toFixed(d));
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-grafzeppelin-hull.mjs from the owner's sculpt.\n`
  + `// Do not hand-edit -- regenerate from the source asset instead.\n`
  + `export const GZ_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m, her flight deck on it: see grafZeppelinSurfaceY.\n`
  + `export const GZ_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her flight deck: its height, how far fore and aft it is flat, and how far\n`
  + `// out it runs each way every half metre along her.\n`
  + `export const GZ_DECK = ${JSON.stringify({ y: FD, flat: FLAT, z0: plan.z0, dz: plan.dz, nz: plan.nz, port: round(plan.port), stbd: round(plan.stbd) })};\n`
  + `// Her island, which nothing on her runway is laid across.\n`
  + `export const GZ_ISLAND = ${JSON.stringify(ISLAND)};\n`
  + `// Where her 15 cm stand: the floors they were carved down to.\n`
  + `export const GZ_MOUNTS = ${JSON.stringify({ ...mounts, casemate: CASEMATE, ledge: LEDGE, podTub: POD_TUB })};\n`
  + `// Her 15 cm single and her 10.5 cm twin: the owner's sculpts of them, as\n`
  + `// build/prepare-scharnhorst-hull.mjs and build/prepare-bismarck-hull.mjs\n`
  + `// packed them for the Scharnhorst and the Bismarck, carried here so she\n`
  + `// does not fetch either of their hulls to get her guns.\n`
  + `export const GZ_GUNS = ${JSON.stringify({ single: SCHARNHORST_GUNS.single, flak: BISMARCK_GUNS.flak })};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const GZ_SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, and her half-breadth at every half\n`
  + `// metre of height, a metre at a time.\n`
  + `export const GZ_LINES = ${JSON.stringify({ ...LINES, keel: round(LINES.keel), deck: round(LINES.deck), half: round(LINES.half) })};\n`);
console.log('wrote', OUT_DATA);
