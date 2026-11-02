// Turn the owner's HMS Hood sculpts into what client/js/render/hoodHull.js
// ships: her hull and her superstructure as one painted mesh, and her 15-inch
// turret, her 5.5-inch and her quadruple pom-pom as the owner sculpted them,
// cut so they train and elevate. In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a quarter turn, scaled to her 262.3 m and floated at 9.0 m -- and take
//     her in to her own beam: the sculpt drew her a sixth too broad for her
//     length, 37 m on the waterline where she was 31.8;
//   * cut her screws off her shafts (hood.js draws turrets, barbettes and
//     screws that turn);
//   * cut everything of her off a hand under her decks, stem to stern -- the
//     sculpt's turrets, houses, melted fittings and slumped rails with it --
//     and lay her decks again smooth along her own sheer, with her side drawn
//     again where the sculpt slumped it abaft her superstructure;
//   * stand on her forecastle deck the finer sculpt of her bridge, conning
//     tower, funnels, boat deck and mainmast, its funnels over hers -- with
//     the guns it had cast in cut out, for hood.js stands her own there --
//     and stand abaft it her after deck, the wedge the sculpt drew on her
//     quarterdeck, its outline read off the sculpt and run smooth, teak on
//     top, a pom-pom bandstand on it and a splinter-shielded gun position
//     bulged out either side;
//   * paint her decks, split her normals at every crease;
//   * read her surface off as a height map and her lines, which is what her
//     interior and her armour are fitted under;
//   * take her guns off the owner's sculpts of them, each in the frame of its
//     mounting with what elevates on a cradle of its own;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file hoodHull.js decodes synchronously.
//
//   node build/prepare-hood-hull.mjs
//
// Reads assets/models/hood-*.glb (made by build/hood-source.mjs), writes
// client/js/render/hoodHull.data.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, boxCut, components, closeHoles,
  recomputeNormals, weld, stations, hardEdges, shadePlating, boxUvs,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import { blank, box, lathe, tube } from './fuso-parts.mjs';
import { subMesh, dropLoose, turnInward, thinFaces, creased, measureLines } from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/hoodHull.data.js');

const REAL_LOA = 262.3;
const DRAFT = 9.0;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern, and her keel, flat along her middle
// at -0.2253. A unit of it is 138.05 m of her, and her bow is at -X:
//
//   world_X =  local_Z * UNIT * NARROW      (her port side, +Z, is +X)
//   world_Y = (local_Y - WL) * UNIT
//   world_Z = -(local_X - XC) * UNIT
//
// NARROW takes her in to her own beam: 31.8 m over her bulges, where the
// sculpt has her 37.3.
const SCULPT = { x0: -0.951, x1: 0.949, keel: -0.2253 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const XC = (SCULPT.x0 + SCULPT.x1) / 2;
const WL = SCULPT.keel + DRAFT / UNIT;
export const NARROW = 0.853;
const hullToWorld = (lx, ly, lz) => [lz * UNIT * NARROW, (ly - WL) * UNIT, -(lx - XC) * UNIT];
/** The world z of a station of the hull's sculpt, and the world y of a height in it. */
const zOf = (lx) => -(lx - XC) * UNIT;
const yOf = (ly) => (ly - WL) * UNIT;

// Her paints, as build/hood-source.mjs numbers them; and her superstructure's
// grey, which is left as its sculpt drew it until her decks are laid.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5;

/** The middle of triangle `t`. */
const middle = (mesh, t) => {
  const { P, T } = mesh;
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};
/** Append `b` to `a`. */
function append(a, b) {
  const base = a.P.length / 3;
  for (let i = 0; i < b.P.length; i++) { a.P.push(b.P[i]); a.N.push(b.N[i]); }
  for (let i = 0; i < b.T.length; i++) a.T.push(b.T[i] + base);
  for (let i = 0; i < b.C.length; i++) a.C.push(b.C[i]);
}

const m = (() => {
  const raw = readGlb(ASSET('hood-hull.glb'));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...hullToWorld(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    // Normals go through the inverse transpose of the narrowing.
    const nx = raw.nrm[i + 2] / NARROW, ny = raw.nrm[i + 1], nz = -raw.nrm[i];
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
  }
  const mesh = { P, N, T: Array.from(raw.idx), C: [] };
  for (let t = 0; t < mesh.T.length; t += 3) mesh.C.push(raw.paint ? Math.round(raw.paint[mesh.T[t]]) : GREY);
  return mesh;
})();
{
  const { lo, hi } = bbox(m);
  console.log('calibration: UNIT', UNIT.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- her decks ----------------------------------------------------------------------
// Her forecastle deck, from her stem to abaft her mainmast; her shelter deck
// over it amidships, as the hull's sculpt has it; and her quarterdeck, a deck
// lower, from there to her stern.
export const DECKS = { forecastle: +yOf(-0.105).toFixed(3), shelter: +yOf(-0.085).toFixed(3), quarter: +yOf(-0.126).toFixed(3) };
console.log('her decks:', JSON.stringify(DECKS));

// ---- her turrets ----------------------------------------------------------------------
// A and B forward, B superfiring over A on a barbette four metres high; X and
// Y aft, X superfiring over Y from her shelter deck's after end. Where the
// sculpt has each (the middle of its barbette), and the height of the top of
// the barbette it trains on -- where the gunhouse sits -- and of the deck the
// barbette stands on. `rest` is which way it faces stowed.
export const TURRETS = [
  { name: 'A', z: +zOf(-0.514).toFixed(2), rest: 0, seat: +yOf(-0.1025).toFixed(3), deck: DECKS.forecastle },
  { name: 'B', z: +zOf(-0.400).toFixed(2), rest: 0, seat: +yOf(-0.0765).toFixed(3), deck: DECKS.forecastle },
  { name: 'X', z: +zOf(0.551).toFixed(2), rest: Math.PI, seat: +yOf(-0.0985).toFixed(3), deck: DECKS.quarter },
  { name: 'Y', z: +zOf(0.666).toFixed(2), rest: Math.PI, seat: +yOf(-0.1225).toFixed(3), deck: DECKS.quarter },
].map((t) => ({ ...t, x: 0 }));

// ---- her screws ---------------------------------------------------------------------
// Four shafts. The sculpt drew a screw on each wing shaft, left the inner pair
// bare, and fused a screw of no particular shape on to her centreline in front
// of her rudder; all three are cut off, and hood.js draws four that turn --
// the wing pair where the sculpt had them, the inner pair further aft on
// their own shafts carried on to them, as she had them.
export const SCREWS = [
  { x: -4.7, y: -4.1, z: +zOf(0.773).toFixed(2), r: 2.25, wing: true },
  { x: 4.7, y: -4.1, z: +zOf(0.773).toFixed(2), r: 2.25, wing: true },
  { x: -2.6, y: -3.6, z: +zOf(0.829).toFixed(2), r: 2.25 },
  { x: 2.6, y: -3.6, z: +zOf(0.829).toFixed(2), r: 2.25 },
];
for (const s of SCREWS.filter((q) => q.wing)) {
  const r = boxCut(m, { x0: s.x - 2.6, x1: s.x + 2.6, y0: s.y - 2.6, y1: s.y + 2.6, z0: s.z - 0.9, z1: s.z + 0.9 }, { rescue: true });
  console.log(`screw at ${s.x}, ${s.z}: ${r.cut} triangles cut`);
}
{
  const z0 = zOf(0.846), z1 = zOf(0.814);
  const r = boxCut(m, { x0: -2.9, x1: 2.9, y0: -6.2, y1: -2.0, z0, z1 }, { rescue: true });
  console.log(`the screw on her centreline: ${r.cut} triangles cut`);
}
dropLoose(m, { maxArea: 3, maxDiag: 4 });
// Every hole the sculpt and its decimation left in her -- where her shafts
// leave her and along her bossings -- closed, each in its own plane. What is
// over her decks of what this closes is cut off with the rest below.
{
  const st = closeHoles(m, new Uint8Array(m.T.length / 3).fill(1), () => null, { open: true });
  console.log(`her holes: ${st.loops} closed with ${st.capped} triangles`);
}

// ---- her decks, laid again ------------------------------------------------------------
// The sculpt's decks are lumpy -- its fittings melted into them, its rails
// slumped along their edges, the stumps of its barbettes and houses standing
// out of them, cracks along their edges -- so everything of her above a hand
// under her deck comes off her, stem to stern, and her decks are laid again
// smooth over what is left: her forecastle deck from her stem aft to the step
// down to her quarterdeck in front of X turret, carried out to her sides over
// a side drawn straight up from her quarterdeck where the sculpt slumped it,
// and her quarterdeck from there to her stern. The finer sculpt of her
// superstructure stands on her forecastle deck from abaft B's barbette to her
// mainmast; abaft it her after superstructure, a deck high, carries her
// shelter deck on to the step.
export const MIDDLE = { z0: +zOf(0.3781).toFixed(2), z1: 50.0, y0: DECKS.forecastle + 0.12 };
/** The step down from her forecastle deck to her quarterdeck. */
export const STEP = +zOf(0.49).toFixed(2);
/** How far under her deck the sculpt is cut, and how far her deck edge comes down over the cut. */
const UNDER = 0.35, EDGE = 0.5;

/**
 * Split every triangle of `mesh` that `g` (of a point) changes sign across,
 * along where it is nought; with `drop`, what is on its positive side goes.
 * Points are shared along a split edge, so nothing opens. Returns the
 * segments of the split, as [x0, z0, x1, z1].
 */
function splitAlong(mesh, g, { drop = false } = {}) {
  const { P, N, T, C } = mesh;
  const nv = P.length / 3;
  const gv = new Float64Array(nv);
  for (let i = 0; i < nv; i++) gv[i] = g(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const made = new Map();
  const at = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let i = made.get(k);
    if (i !== undefined) return i;
    const f = gv[a] / (gv[a] - gv[b]);
    i = P.length / 3;
    for (let j = 0; j < 3; j++) P.push(P[a * 3 + j] + (P[b * 3 + j] - P[a * 3 + j]) * f);
    const n = [0, 1, 2].map((j) => N[a * 3 + j] + (N[b * 3 + j] - N[a * 3 + j]) * f);
    const l = Math.hypot(...n) || 1;
    N.push(n[0] / l, n[1] / l, n[2] / l);
    made.set(k, i);
    return i;
  };
  const T2 = [], C2 = [], seams = [];
  const put = (a, b, c, paintOf, up) => { if (drop && up) return; T2.push(a, b, c); C2.push(paintOf); };
  for (let t = 0; t < T.length / 3; t++) {
    const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
    const s = v.map((i) => gv[i] > 0);
    if (s[0] === s[1] && s[1] === s[2]) { put(v[0], v[1], v[2], C[t], s[0]); continue; }
    // The vertex alone on its side, and the other two after it in turn.
    const j = s[0] !== s[1] && s[0] !== s[2] ? 0 : s[1] !== s[0] && s[1] !== s[2] ? 1 : 2;
    const v0 = v[j], v1 = v[(j + 1) % 3], v2 = v[(j + 2) % 3];
    const p = at(v0, v1), q = at(v0, v2);
    put(v0, p, q, C[t], s[j]);
    put(p, v1, v2, C[t], !s[j]);
    put(p, v2, q, C[t], !s[j]);
    seams.push([P[p * 3], P[p * 3 + 2], P[q * 3], P[q * 3 + 2]]);
  }
  mesh.T = T2; mesh.C = C2;
  return seams;
}

// Her deck's height along her, off the sculpt: the lowest deck under each
// station across her middle, as nothing on a deck is lower than the deck,
// with a run-of-five median through it.
const deckLine = (() => {
  const { P, T } = m;
  const up = [];
  for (let t = 0; t < T.length; t += 3) {
    const [nx, ny, nz] = faceNormal(m, T[t], T[t + 1], T[t + 2]);
    if (ny > 0.5 * Math.hypot(nx, ny, nz)) up.push(T[t] * 3, T[t + 1] * 3, T[t + 2] * 3);
  }
  const lowest = (x, z, lo = 2, hi = Infinity) => {
    let best = Infinity;
    for (let i = 0; i < up.length; i += 3) {
      const a = up[i], b = up[i + 1], c = up[i + 2];
      const d = (P[b + 2] - P[c + 2]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 2] - P[c + 2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((P[b + 2] - P[c + 2]) * (x - P[c]) + (P[c] - P[b]) * (z - P[c + 2])) / d;
      const l2 = ((P[c + 2] - P[a + 2]) * (x - P[c]) + (P[a] - P[c]) * (z - P[c + 2])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const y = l1 * P[a + 1] + l2 * P[b + 1] + l3 * P[c + 1];
      if (y > lo && y < hi && y < best) best = y;
    }
    return best;
  };
  const z0 = -132, z1 = 132;
  const raw = [];
  for (let z = z0; z <= z1; z++) raw.push(Math.min(...[0, -3, 3, -6, 6, -7.5, 7.5].map((x) => lowest(x, z))));
  // Off her ends, the nearest station that has a deck.
  const first = raw.findIndex(Number.isFinite), last = raw.length - 1 - [...raw].reverse().findIndex(Number.isFinite);
  for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) raw[i] = raw[i < first ? first : i > last ? last : i - 1];
  const med = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 3).sort((p, q) => p - q);
    return w[w.length >> 1];
  });
  // Her forecastle deck is flat, rising only to her stem; her quarterdeck
  // rises steadily to her stern.
  const fore = med.map((y, i) => (z0 + i >= STEP ? Math.max(DECKS.forecastle, y) : y));
  for (let i = 1; i < fore.length; i++) if (z0 + i >= STEP && z0 + i < 95) fore[i] = DECKS.forecastle;
  for (let i = 1; i < fore.length; i++) if (z0 + i >= 95) fore[i] = Math.max(fore[i], fore[i - 1]);
  for (let i = fore.length - 1; i > 0; i--) if (z0 + i <= STEP) fore[i - 1] = Math.max(fore[i - 1], fore[i]);
  // No deck at her very ends rises faster than her sheer does: what the
  // sculpt has there is her stem head and her stern's rail.
  for (let i = 1; i < fore.length; i++) if (z0 + i >= 95) fore[i] = Math.min(fore[i], fore[i - 1] + 0.12);
  for (let i = fore.length - 1; i > 0; i--) if (z0 + i <= STEP) fore[i - 1] = Math.min(fore[i - 1], fore[i] + 0.08);
  if (process.env.DECKLINE) console.log(raw.map((y, i) => `${z0 + i}:${y.toFixed(2)}/${fore[i].toFixed(2)}`).filter((_, i) => z0 + i < -100 || z0 + i > 90).join(' '));
  const at = (z) => {
    const f = Math.min(Math.max(z - z0, 0), z1 - z0);
    const i = Math.min(Math.floor(f), fore.length - 2);
    return fore[i] + (fore[i + 1] - fore[i]) * (f - i);
  };
  return { at, fore, z0, lowest };
})();
// ---- her after deck, as the sculpt drew it ---------------------------------------------
// Abaft her superstructure the sculpt has her shelter deck carried aft as a
// wedge standing on her quarterdeck: the breadth of her where it leaves her
// superstructure, closing to a few metres across over the step. Its outline
// is read off the sculpt -- how far out either side there is deck at the
// height of her shelter deck, a metre at a time -- and a curve fitted through
// it, so its sides run smooth where the sculpt's are melted; its point is
// rounded off.
export const AFTER_DECK = (() => {
  const rows = [];
  for (let z = Math.ceil(STEP + 0.5); z <= Math.floor(MIDDLE.z0); z++) {
    let port = 0, stbd = 0;
    for (let x = 0.25; x < 16; x += 0.25) {
      if (Number.isFinite(deckLine.lowest(x, z, DECKS.shelter - 0.8, DECKS.shelter + 1.0))) port = x;
      if (Number.isFinite(deckLine.lowest(-x, z, DECKS.shelter - 0.8, DECKS.shelter + 1.0))) stbd = x;
    }
    if (port > 1 && stbd > 1) rows.push([z, (port + stbd) / 2]);
  }
  // Least squares, a quadratic in z.
  const n = rows.length, zm = rows.reduce((a, [z]) => a + z, 0) / n;
  const S = [0, 0, 0, 0, 0], R = [0, 0, 0];
  for (const [z, w] of rows) {
    const u = z - zm;
    for (let k = 0; k < 5; k++) S[k] += u ** k;
    for (let k = 0; k < 3; k++) R[k] += w * u ** k;
  }
  const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A);
  const c = [0, 1, 2].map((k) => det(A.map((row, i) => row.map((v, j) => (j === k ? R[i] : v)))) / D);
  const half = (z) => c[0] + c[1] * (z - zm) + c[2] * (z - zm) ** 2;
  const tip = rows[0][0];
  console.log(`her after deck: read at ${n} stations, ${rows.map(([z, w]) => `${z}:${w.toFixed(1)}`).join(' ')}; `
    + `fitted ${half(tip).toFixed(2)} m a side at ${tip} to ${half(MIDDLE.z0).toFixed(2)} at ${MIDDLE.z0}`);
  return { half, tip };
})();

/** Her deck at z: her forecastle deck forward of the step, her quarterdeck abaft it. */
const forecastleAt = (z) => Math.max(deckLine.at(Math.max(z, Math.ceil(STEP))), DECKS.forecastle);
const quarterAt = (z) => deckLine.at(Math.min(z, Math.floor(STEP)));
console.log('her deck line:', [-130, -110, -90, -70, STEP - 0.5, 0, 90, 110, 125, 130]
  .map((z) => `${z.toFixed(0)}:${(z < STEP ? quarterAt(z) : forecastleAt(z)).toFixed(2)}`).join(' '));
// Where her forecastle deck meets her side ends where her superstructure
// does; abaft that she is cut down to her quarterdeck and given a side again.
// The sculpt slumped her side from the step to a little forward of the end of
// her superstructure: it is drawn again over that length.
export const NEW_SIDE = { z0: STEP, z1: -41.8 };
const cutAt = (z) => (z < NEW_SIDE.z1 ? quarterAt(z) : forecastleAt(z)) - UNDER;
// Her breadth under her forecastle deck, for her superstructure, before she is cut.
const halfBreadth = breadthOf(DECKS.forecastle - 2.5, DECKS.forecastle - 0.3);
splitAlong(m, (x, y, z) => z - NEW_SIDE.z1);
const rim = splitAlong(m, (x, y, z) => y - cutAt(z), { drop: true });
dropLoose(m, { maxArea: 4, maxDiag: 5 });
console.log(`her decks: cut down to a hand under them, ${rim.length} edges along the cut`);

/**
 * Her half-breadth at z: how far out the section of her through each metre
 * of her length goes between heights `lo` and `hi` -- under her forecastle
 * deck, for her deck edge there. Read off the section and not off her points: a
 * long triangle of her side has none in most metres of her length.
 */
function breadthOf(lo, hi) {
  const bins = new Map();
  const { P, T } = m;
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t] * 3, T[t + 1] * 3, T[t + 2] * 3];
    const zs = v.map((a) => P[a + 2]);
    for (let k = Math.ceil(Math.min(...zs)); k <= Math.floor(Math.max(...zs)); k++) {
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3];
        if ((P[a + 2] - k) * (P[b + 2] - k) > 0 || P[a + 2] === P[b + 2]) continue;
        const f = (k - P[a + 2]) / (P[b + 2] - P[a + 2]);
        const y = P[a + 1] + (P[b + 1] - P[a + 1]) * f;
        if (y < lo || y > hi) continue;
        bins.set(k, Math.max(bins.get(k) || 0, Math.abs(P[a] + (P[b] - P[a]) * f)));
      }
    }
  }
  return (z) => {
    const k = Math.round(z);
    let best = Infinity;
    for (let d = -1; d <= 1; d++) if (bins.has(k + d)) best = Math.min(best, bins.get(k + d));
    return best === Infinity ? 0 : best;
  };
}

/**
 * Close every hole in `m` whose rim, walked round, is shorter than `maxRim`:
 * a fan from the middle of its rim, wound against it so it faces the way the
 * plating round it does, in the paint most of the rim is. Points are matched
 * by where they are, so a crease between two paints is no hole.
 */
function closeSmallHoles(m, maxRim) {
  const { P, N, T, C } = m;
  const canon = weld(m);
  const nTri = T.length / 3;
  const half = new Map();
  const key = (a, b) => `${a},${b}`;
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = canon[T[t * 3 + e]], b = canon[T[t * 3 + (e + 1) % 3]];
      if (a === b) continue;
      half.set(key(a, b), (half.get(key(a, b)) || 0) + 1);
    }
  }
  // A rim edge is one with no twin: a -> b with no b -> a anywhere.
  const next = new Map(), paintAt = new Map();
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = canon[T[t * 3 + e]], b = canon[T[t * 3 + (e + 1) % 3]];
      if (a === b || half.has(key(b, a)) || half.get(key(a, b)) !== 1) continue;
      if (next.has(a)) { next.set(a, -1); continue; } // a point two rims pass: leave it
      next.set(a, b);
      paintAt.set(a, C[t]);
    }
  }
  const seen = new Set();
  let n = 0, tris = 0;
  const dist = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  for (const start of next.keys()) {
    if (seen.has(start) || next.get(start) < 0) continue;
    const loop = [start];
    let len = 0, ok = false;
    for (let v = start; loop.length < 400;) {
      const w = next.get(v);
      if (w === undefined || w < 0) break;
      len += dist(v, w);
      if (len > maxRim) break;
      if (w === start) { ok = true; break; }
      if (loop.includes(w)) break;
      loop.push(w); v = w;
    }
    for (const v of loop) seen.add(v);
    if (!ok || loop.length < 3) continue;
    const mid = [0, 1, 2].map((k) => loop.reduce((s, v) => s + P[v * 3 + k], 0) / loop.length);
    const paints = new Map();
    for (const v of loop) paints.set(paintAt.get(v), (paints.get(paintAt.get(v)) || 0) + 1);
    const paintOf = [...paints].sort((a, b) => b[1] - a[1])[0][0];
    // Its normal: the rim's own winding, reversed (the patch runs against it).
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const [ax, ay, az] = [0, 1, 2].map((k) => P[a * 3 + k] - mid[k]), [bx, by, bz] = [0, 1, 2].map((k) => P[b * 3 + k] - mid[k]);
      nx += ay * bz - az * by; ny += az * bx - ax * bz; nz += ax * by - ay * bx;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    const nrm = [-nx / l, -ny / l, -nz / l];
    const base = P.length / 3;
    P.push(...mid); N.push(...nrm);
    const own = loop.map((v) => { P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N.push(...nrm); return P.length / 3 - 1; });
    for (let i = 0; i < own.length; i++) { T.push(base, own[(i + 1) % own.length], own[i]); C.push(paintOf); tris++; }
    n++;
  }
  return { n, tris };
}

// ---- her superstructure -----------------------------------------------------------
// The sculpt of it, at 55.55 m a unit: its funnels, 0.3355 apart in it, are
// put over hers, 0.135 apart in the sculpt of her hull. Its slab's forecastle
// deck (SLAB.low) goes on hers, and its shelter deck (SLAB.high) on hers; what
// is between them -- the walls of the shelter deck -- is taken in to fit, and
// what is over her shelter deck stands at its own scale. It is sunk a hand,
// so nothing of it stands clear of the deck it is on.
/**
 * The 5.5-inch guns the sculpt cast into her superstructure, port side (the
 * starboard ones are their mirror): one on her shelter deck abreast her fore
 * funnel, and three on her forecastle deck in bays under it.
 */
const SCULPT_GUNS = process.env.NOGUNCUT ? [] : [
  { x0: 7.85, x1: 11.6, y0: 10.3, y1: 12.7, z0: 15.8, z1: 21.6 },
  { x0: 10.3, x1: 13.9, y0: 7.3, y1: 9.75, z0: 14.1, z1: 24.9 },
  { x0: 10.6, x1: 14.4, y0: 7.3, y1: 9.9, z0: -6.95, z1: -0.85 },
  { x0: 10.1, x1: 13.6, y0: 7.3, y1: 9.9, z0: -28.3, z1: -22.2 },
];
/**
 * The bay abaft her bridge, port side, opened out for the 5.5-inch in it:
 * from its back wall to past her wall over it, its ends square across her,
 * from her forecastle deck to a hand under her shelter deck. `mouth(z)` is
 * how far out her wall over it is, along it: her bridge rounds in forward.
 */
export const BRIDGE_BAY = {
  x0: 4.2, x1: 12.5, y0: DECKS.forecastle + 0.04, y1: 10.17, z0: 29.6, z1: 33.9, back: 4.15,
  mouth: (z) => 11.05 - (z - 29.6) * (11.05 - 7.55) / (33.9 - 29.6),
};
/** The bandstand on her centreline at the after end of her after deck, her third pom-pom on it. */
export const AFTER_PLATFORM = { z: -58.5, r: 2.6, floor: 11.25, shield: 1.0 };
/** Her gun positions bulged out either side of her after deck, splinter shields and all. */
export const AFTER_SPONSONS = { z: -60.0, r: 2.1, shield: 1.25 };
/**
 * Her pom-pom tubs, port side: abreast her bridge on the platform at the
 * foot of her tower, and abreast her mainmast on her shelter deck aft. The
 * sculpt drew a melted gun in the one and two stubs in the other; tub and
 * all are taken off down to the floor, and hood.js stands the owner's quad
 * there on its own platform inside its own splinter shield.
 */
export const POMPOM_TUBS = [
  { name: 'pom-pom bridge', x: 5.3, z: 35.3, r: 2.0, floor: 14.0 },
  { name: 'pom-pom mainmast', x: 7.0, z: -42.3, r: 1.8, floor: 11.7 },
  // And one on her centreline on the roof of her after deck, abaft her
  // mainmast, where her third multiple pom-pom stood from 1937. Nothing of
  // the sculpt is there to cut: it stands on the bandstand (AFTER_PLATFORM)
  // laid on the roof laid in AFTER_HOUSE.
  { name: 'pom-pom after deck', x: 0, z: -58.5, r: 1.8, floor: 11.25, laid: true },
];
export const SUPER = {
  k: 0.135 / 0.3355, funnel: -0.249, hullFunnel: -0.104, low: -0.257, high: -0.194, sink: 0.15, side: 0.35,
};
const superToWorld = (sx, sy, sz) => {
  const hx = SUPER.hullFunnel + (sx - SUPER.funnel) * SUPER.k;
  const y = sy <= SUPER.high
    ? DECKS.forecastle + (sy - SUPER.low) * (DECKS.shelter - DECKS.forecastle) / (SUPER.high - SUPER.low)
    : DECKS.shelter + (sy - SUPER.high) * SUPER.k * UNIT;
  return [sz * SUPER.k * UNIT, y - SUPER.sink, zOf(hx)];
};
const sup = (() => {
  const raw = readGlb(ASSET('hood-super.glb'));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...superToWorld(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  let s = { P, N, T: Array.from(raw.idx), C: new Array(raw.idx.length / 3).fill(SUPER_GREY) };
  fixWinding(s);
  // The decimation left pinholes and torn seams in her plating -- through her
  // funnels, through the walls of her bridge -- that the sea shows through:
  // each small one is closed over, its own way round. Her funnel tops and
  // what she stands on are holes far too big for that, and stay open.
  {
    const { n, tris } = closeSmallHoles(s, 12.0);
    console.log(`her superstructure: ${n} pinholes closed, ${tris} triangles`);
  }
  const before = s.T.length / 3;
  // Inside her side and abaft B's barbette; and not the slab's own deck, where
  // it was left standing a little proud of the cut -- hers is there.
  s = subMesh(s, (t) => {
    const [cx, cy, cz] = middle(s, t);
    if (cz > MIDDLE.z1) return false;
    if (Math.abs(cx) > halfBreadth(cz) - SUPER.side) return false;
    const [nx, ny, nz] = faceNormal(s, s.T[t * 3], s.T[t * 3 + 1], s.T[t * 3 + 2]);
    if (ny > 0.9 * Math.hypot(nx, ny, nz) && cy < DECKS.forecastle + 0.3) return false;
    return true;
  });
  // What of it is a piece on its own and lies on her deck -- the slab's
  // handrails, laid flat along its edges when the slab went -- is not hers;
  // nor is a scrap of wire still hanging in the air over her, or a length of
  // one standing loose: a piece that is small and high, or long and as thin
  // as a wire both ways.
  {
    const drop = new Uint8Array(s.T.length / 3);
    let low = 0, aloft = 0;
    for (const c of components(s)) {
      const ext = [0, 1, 2].map((k) => c.hi[k] - c.lo[k]).sort((a, b) => a - b);
      const diag = Math.hypot(...ext);
      const isLow = c.hi[1] < DECKS.forecastle + 1.0;
      const isAloft = diag < 3 && c.tris.length < 200 && c.lo[1] > DECKS.shelter + 6;
      const isWire = ext[2] > 2.5 && ext[1] < 0.35;
      // And a speck, anywhere: a scrap the decimation left floating.
      const isSpeck = diag < 0.6;
      if (!isLow && !isAloft && !isWire && !isSpeck) continue;
      for (const t of c.tris) drop[t] = 1;
      if (isLow) low++; else aloft++;
    }
    s = subMesh(s, (t) => !drop[t]);
    console.log(`her superstructure: ${low} pieces lying on her deck and ${aloft} scraps of wire taken off it`);
  }
  // And a wire strung aloft that the decimation flattened into a sliver --
  // metres long and a finger or two wide -- is plating with one face: lying
  // face down over her funnels it is not there from above. Each such sliver
  // is given its other face, on points of its own; and so is every wire
  // she has, which the eye looks along as often as across.
  {
    let n = 0;
    const T = s.T.length / 3;
    // A wire is a piece of her a hand across both ways, however long.
    const wire = new Uint8Array(T);
    for (const c of components(s)) {
      const ext = [0, 1, 2].map((k) => c.hi[k] - c.lo[k]).sort((a, b) => a - b);
      if (ext[1] < 0.35 && ext[2] > 1.0) for (const t of c.tris) wire[t] = 1;
    }
    for (let t = 0; t < T; t++) {
      const ids = [0, 1, 2].map((k) => s.T[t * 3 + k]);
      const v = ids.map((i) => [s.P[i * 3], s.P[i * 3 + 1], s.P[i * 3 + 2]]);
      if (!wire[t] && Math.min(v[0][1], v[1][1], v[2][1]) < DECKS.shelter + 10) continue;
      const e = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => Math.hypot(...[0, 1, 2].map((k) => v[a][k] - v[b][k])));
      const long = Math.max(...e);
      const [ax, ay, az] = [0, 1, 2].map((k) => v[1][k] - v[0][k]), [bx, by, bz] = [0, 1, 2].map((k) => v[2][k] - v[0][k]);
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const twice = Math.hypot(cx, cy, cz);
      if (!wire[t] && !(long > 0.5 && twice / long < 0.15)) continue;
      if (!twice) continue;
      const nrm = [-cx / twice, -cy / twice, -cz / twice];
      const base = s.P.length / 3;
      for (const p of v) { s.P.push(...p); s.N.push(...nrm); }
      s.T.push(base, base + 2, base + 1);
      s.C.push(s.C[t]);
      n++;
    }
    console.log(`her superstructure: ${n} slivers of wire aloft given their other face`);
  }
  // What stands free along her sides between her forecastle deck and a deck
  // over her shelter deck -- the 5.5-inch guns the sculpt cast in, on her
  // forecastle deck in their bays and on her shelter deck, and the odd scrap
  // with them -- comes off: within a box along each side, outboard of her
  // superstructure's walls, every piece that does not run out of the box into
  // the rest of her. hood.js stands her own guns there.
  {
    const box = { x: 9.4, y0: DECKS.forecastle - 0.3, y1: DECKS.shelter + 3, z0: -48, z1: 45 };
    const drop = new Uint8Array(s.T.length / 3);
    let n = 0, tris = 0;
    for (const c of components(s)) {
      const outboard = c.lo[0] > box.x || c.hi[0] < -box.x;
      if (!outboard || c.lo[1] < box.y0 || c.hi[1] > box.y1 || c.lo[2] < box.z0 || c.hi[2] > box.z1) continue;
      for (const t of c.tris) drop[t] = 1;
      n++; tris += c.tris.length;
    }
    s = subMesh(s, (t) => !drop[t]);
    console.log(`her superstructure: ${n} pieces standing free along her sides taken off, ${tris} triangles`);
  }
  // And the guns cast in her, each side, each where the sculpt has it: its
  // shield and the barrel ahead of it, off the deck it stands on. Read off a
  // plan of her at each height.
  for (const b of SCULPT_GUNS) {
    for (const side of [-1, 1]) {
      // Cut along where the box's own distance is nought, so only what is at
      // the box is split.
      const inside = (x, y, z) => Math.min(side * x - b.x0, b.x1 - side * x, y - b.y0, b.y1 - y, z - b.z0, b.z1 - z);
      const before = s.T.length / 3;
      splitAlong(s, inside, { drop: true });
      s = subMesh(s, () => true);
      if (process.env.FREE) console.log(`gun at ${b.z0}..${b.z1} ${side}: ${before - s.T.length / 3} triangles`);
    }
  }
  // The forward bay's cut went through the paravane stowed along her deck
  // beside it, and left its forward half lying there with its end sheared
  // off: that comes off too, down to her deck, short of the block it lay
  // against.
  for (const side of [-1, 1]) {
    const b = { x0: 11.2, x1: 13.0, y0: 7.3, y1: 8.75, z0: 25.3, z1: 28.4 };
    splitAlong(s, (x, y, z) => Math.min(side * x - b.x0, b.x1 - side * x, y - b.y0, b.y1 - y, z - b.z0, b.z1 - z), { drop: true });
    s = subMesh(s, () => true);
  }
  // What the cuts opened is closed again. A bay under her shelter deck took
  // its back wall with the gun that stood against it: it is plated across at
  // the cut, from her forecastle deck up into the deck over it, and faces
  // out. Where a gun stood on her shelter deck the cut went through the deck:
  // it is plated over a hair above the cut, facing up.
  {
    const vtx = (x, y, z, n) => { s.P.push(x, y, z); s.N.push(...n); return s.P.length / 3 - 1; };
    const face = (a, b, c, d) => { s.T.push(a, b, c, a, c, d); s.C.push(SUPER_GREY, SUPER_GREY); };
    for (const b of SCULPT_GUNS) {
      for (const side of [-1, 1]) {
        if (b.y0 < DECKS.forecastle) {
          const x = side * b.x0, y0 = DECKS.forecastle - 0.05, y1 = DECKS.shelter - SUPER.sink - 0.08, n = [side, 0, 0];
          const q = [vtx(x, y0, b.z0, n), vtx(x, y1, b.z0, n), vtx(x, y1, b.z1, n), vtx(x, y0, b.z1, n)];
          if (side > 0) face(...q); else face(q[3], q[2], q[1], q[0]);
        } else {
          const y = b.y0 + 0.01, n = [0, 1, 0];
          const q = [vtx(side * b.x0, y, b.z0, n), vtx(side * b.x0, y, b.z1, n), vtx(side * b.x1, y, b.z1, n), vtx(side * b.x1, y, b.z0, n)];
          if (side > 0) face(...q); else face(q[3], q[2], q[1], q[0]);
        }
      }
    }
  }
  // The bay under her shelter deck abaft her bridge, where a 5.5-inch stands
  // (BRIDGE_BAY): the sculpt drew it a man's height deep and narrowing to its
  // mouth, too low and too tight for the gun. It is opened out square, up to
  // a hand under her shelter deck, and plated again: its two ends, and its
  // deckhead out to her wall over it.
  for (const side of [-1, 1]) {
    const b = BRIDGE_BAY;
    const inside = (x, y, z) => Math.min(side * x - b.x0, b.x1 - side * x, y - b.y0, b.y1 - y, z - b.z0, b.z1 - z);
    splitAlong(s, inside, { drop: true });
    s = subMesh(s, () => true);
    const vtx = (x, y, z, n) => { s.P.push(x, y, z); s.N.push(...n); return s.P.length / 3 - 1; };
    // Wound for the port side; the starboard side is its mirror, wound back.
    const face = (q, n) => {
      const v = q.map(([x, y, z]) => vtx(side * x, y, z, [side * n[0], n[1], n[2]]));
      if (side > 0) s.T.push(v[0], v[1], v[2], v[0], v[2], v[3]); else s.T.push(v[0], v[2], v[1], v[0], v[3], v[2]);
      s.C.push(SUPER_GREY, SUPER_GREY);
    };
    const back = b.back, y0 = DECKS.forecastle - 0.05, y1 = b.y1;
    // Its back, facing out, the height of it: the sculpt's stops at its old
    // deckhead.
    face([[back, y0, b.z0], [back, y1, b.z0], [back, y1, b.z1], [back, y0, b.z1]], [1, 0, 0]);
    // Its after end, facing forward; its forward end, facing aft.
    face([[back, y0, b.z0], [b.mouth(b.z0), y0, b.z0], [b.mouth(b.z0), y1, b.z0], [back, y1, b.z0]], [0, 0, 1]);
    face([[back, y0, b.z1], [back, y1, b.z1], [b.mouth(b.z1), y1, b.z1], [b.mouth(b.z1), y0, b.z1]], [0, 0, -1]);
    // Its deckhead, facing down, out to her wall over it.
    const n = 16;
    for (let k = 0; k < n; k++) {
      const za = b.z0 + ((b.z1 - b.z0) * k) / n, zb = b.z0 + ((b.z1 - b.z0) * (k + 1)) / n;
      face([[back, y1, za], [b.mouth(za), y1, za], [b.mouth(zb), y1, zb], [back, y1, zb]], [0, -1, 0]);
    }
  }
  // And the empty bay just abaft that one, where the sculpt stowed the
  // paravane that is gone: it is plated across, in line with her wall abaft
  // it, from her deck up behind the edge of the deck over it.
  {
    const b = { x: 10.3, y0: DECKS.forecastle - 0.05, y1: 9.75, z0: 24.85, z1: 28.15 };
    for (const side of [-1, 1]) {
      const v = [[b.y0, b.z0], [b.y0, b.z1], [b.y1, b.z1], [b.y1, b.z0]].map(([y, z]) => {
        s.P.push(side * b.x, y, z); s.N.push(side, 0, 0); return s.P.length / 3 - 1;
      });
      // Facing out: wound anticlockwise seen from outboard.
      if (side > 0) s.T.push(v[0], v[2], v[1], v[0], v[3], v[2]); else s.T.push(v[0], v[1], v[2], v[0], v[2], v[3]);
      s.C.push(SUPER_GREY, SUPER_GREY);
    }
  }
  // And what the cuts left lying loose on her deck -- the end of a paravane
  // whose other end stood in a bay -- comes off with the rest of what lay there.
  {
    const drop = new Uint8Array(s.T.length / 3);
    let n = 0;
    for (const c of components(s)) {
      if (c.hi[1] >= DECKS.forecastle + 1.0 && Math.hypot(...[0, 1, 2].map((k) => c.hi[k] - c.lo[k])) >= 0.6) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    s = subMesh(s, (t) => !drop[t]);
    console.log(`her superstructure: ${n} pieces the gun cuts left loose taken off`);
  }
  // The length of aerial strung aft from her foremast's yard, and what hung
  // off its end: the rest of it, to her mainmast, did not come through the
  // decimation, and what did hangs in the air over her funnels by itself.
  {
    const drop = new Uint8Array(s.T.length / 3);
    let n = 0;
    for (const c of components(s)) {
      if (c.lo[1] < 32 || c.hi[1] > 36 || c.lo[2] < 4 || c.hi[2] > 22 || c.lo[0] < -1.2 || c.hi[0] > 1.2) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    s = subMesh(s, (t) => !drop[t]);
    console.log(`her superstructure: ${n} pieces of aerial left hanging taken off`);
  }
  for (const tub of POMPOM_TUBS) {
    if (tub.laid) continue;
    for (const side of [-1, 1]) {
      const inside = (x, y, z) => Math.min(tub.r + 0.35 - Math.hypot(x - side * tub.x, z - tub.z), y - (tub.floor + 0.08), tub.floor + 2.6 - y);
      const before = s.T.length / 3;
      splitAlong(s, inside, { drop: true });
      s = subMesh(s, () => true);
      console.log(`${tub.name} ${side > 0 ? 'port' : 'stbd'}: ${before - s.T.length / 3} triangles of tub cut away`);
    }
  }
  s.C = new Array(s.T.length / 3).fill(SUPER_GREY);
  const { lo, hi } = bbox(s);
  console.log(`her superstructure: ${before} triangles, ${s.T.length / 3} on her, from ${lo[2].toFixed(1)} to `
    + `${hi[2].toFixed(1)} m along her, ${lo[0].toFixed(1)} to ${hi[0].toFixed(1)} across, ${hi[1].toFixed(1)} m up`);
  return s;
})();
// ---- her plating, in pieces short enough to measure -----------------------------
// The decimation drew her side amidships as a few triangles tens of metres
// long, and everything that reads her shape off her points -- the damage
// board's lines, the stations her normals are split at -- finds most metres
// of her with no point of her side in them, and takes her for narrower than
// she is. Every edge of her longer than `MAX` is halved, and the halves
// shared with the triangle across it, until none is.
function splitLong(mesh, MAX) {
  for (let pass = 0; pass < 12; pass++) {
    const { P, N, T, C } = mesh;
    const len = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    const mids = new Map();
    const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const mid = (a, b) => {
      const k = key(a, b);
      let i = mids.get(k);
      if (i !== undefined) return i;
      i = P.length / 3;
      for (let j = 0; j < 3; j++) P.push((P[a * 3 + j] + P[b * 3 + j]) / 2);
      const n = [0, 1, 2].map((j) => N[a * 3 + j] + N[b * 3 + j]);
      const l = Math.hypot(...n) || 1;
      N.push(n[0] / l, n[1] / l, n[2] / l);
      mids.set(k, i);
      return i;
    };
    // Mark first, so both triangles on an edge split it.
    const marked = new Set();
    for (let t = 0; t < T.length; t += 3) {
      for (let j = 0; j < 3; j++) {
        const a = T[t + j], b = T[t + (j + 1) % 3];
        if (len(a, b) > MAX) marked.add(key(a, b));
      }
    }
    if (!marked.size) return;
    const T2 = [], C2 = [];
    for (let t = 0; t < T.length / 3; t++) {
      const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
      const m = [0, 1, 2].map((j) => (marked.has(key(v[j], v[(j + 1) % 3])) ? mid(v[j], v[(j + 1) % 3]) : -1));
      const put = (a, b, c) => { T2.push(a, b, c); C2.push(C[t]); };
      const n = m.filter((x) => x >= 0).length;
      if (n === 0) { put(v[0], v[1], v[2]); continue; }
      if (n === 3) {
        put(v[0], m[0], m[2]); put(m[0], v[1], m[1]); put(m[2], m[1], v[2]); put(m[0], m[1], m[2]);
        continue;
      }
      // Turned so the first split edge is v0-v1.
      let r = m.findIndex((x) => x >= 0);
      if (n === 2 && m[(r + 2) % 3] >= 0 && m[r] >= 0 && r === 0 && m[2] >= 0) r = 2;
      const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
      const mab = m[r], mbc = m[(r + 1) % 3];
      if (n === 1) { put(a, mab, c); put(mab, b, c); continue; }
      // Two: a-b and b-c split (the run of split edges starts at r).
      put(a, mab, c); put(mab, b, mbc); put(mab, mbc, c);
    }
    mesh.T = T2; mesh.C = C2;
  }
}
{
  const before = m.T.length / 3;
  splitLong(m, 2.0);
  console.log(`her plating: ${before} triangles split to ${m.T.length / 3}, none longer than 2 m along an edge`);
}
append(m, sup);

// ---- her decks, laid ------------------------------------------------------------------
// Smooth and level across, along her own sheer: out to the edge of the cut
// either side at each half-metre of her, and her deck edge carried down over
// the cut. Her quarterdeck runs forward from her stern to the end of her
// superstructure, where a bulkhead goes up across her to her forecastle deck;
// from there forward a little way her forecastle deck stands on a side drawn
// straight up from her quarterdeck, where the sculpt slumped it. On her
// quarterdeck abaft her superstructure stands her after deck (AFTER_DECK).
// Its top is a centimetre under the deck the sculpt of her superstructure
// has at its after end -- 10.345 m, read off it: the sculpt's deck stands a
// little prouder than her shelter deck -- and runs a metre in under it, past
// the rounded lip of that deck and the notches at its after corners, so the
// one deck goes on into the other.
export const AFTER_HOUSE = {
  z0: AFTER_DECK.tip, z1: +(MIDDLE.z0 + 1.05).toFixed(2), y1: 10.335,
};
{
  const H = 0.5, ACROSS = 10;
  const port = new Map(), stbd = new Map();
  for (const [x0, z0, x1, z1] of rim) {
    if (z0 === z1) continue;
    for (let k = Math.ceil(Math.min(z0, z1) / H); k <= Math.floor(Math.max(z0, z1) / H); k++) {
      const x = x0 + (x1 - x0) * (k * H - z0) / (z1 - z0);
      const side = x > 0 ? port : stbd;
      side.set(k, Math.max(side.get(k) || 0, Math.abs(x)));
    }
  }
  const ks = [...new Set([...port.keys(), ...stbd.keys()])].sort((a, b) => a - b);
  // Each station: where it is, its breadth either side, its deck, and how far
  // down its edge comes. The end of her superstructure and the end of her new
  // side are stations twice over, so her deck steps there.
  const st = [];
  const station = (z, bs, bp, deck, foot) => st.push({ z, bs, bp, deck, foot });
  const breadthAt = (k) => [stbd.get(k) || port.get(k), port.get(k) || stbd.get(k)];
  const Z0 = MIDDLE.z0, Z1 = NEW_SIDE.z1;
  for (const k of ks) {
    const z = k * H;
    const [bs, bp] = breadthAt(k);
    if (z > Z0 && st.length && st[st.length - 1].z < Z0) {
      // Up from her quarterdeck to her forecastle deck, over the same breadth.
      const p = st[st.length - 1];
      const foot = quarterAt(Z0) - EDGE;
      station(Z0, p.bs, p.bp, quarterAt(Z0), foot);
      station(Z0, p.bs, p.bp, forecastleAt(Z0), foot);
    }
    if (z > Z1 && st.length && st[st.length - 1].z < Z1) {
      const p = st[st.length - 1];
      station(Z1, p.bs, p.bp, forecastleAt(Z1), p.foot);
      station(Z1, bs, bp, forecastleAt(Z1), forecastleAt(Z1) - EDGE);
    }
    if (z < Z0) station(z, bs, bp, quarterAt(z), quarterAt(z) - EDGE);
    else if (z < Z1) station(z, bs, bp, forecastleAt(z), quarterAt(z) - EDGE);
    else station(z, bs, bp, forecastleAt(z), forecastleAt(z) - EDGE);
  }
  // Over her new side its foot is her side at her quarterdeck, and its head
  // is as much further out as her side flares between her quarterdeck and her
  // forecastle deck where her old side takes over.
  for (const s of st) { s.fs = s.bs; s.fp = s.bp; }
  const j = st.findIndex((s, i) => s.z === Z1 && st[i + 1] && st[i + 1].z === Z1);
  const flare = [st[j + 1].bs - st[j].bs, st[j + 1].bp - st[j].bp].map((d) => Math.max(0, d));
  for (let i = 0; i <= j; i++) {
    if (st[i].z < Z0 || st[i].deck < DECKS.forecastle) continue;
    st[i].bs += flare[0]; st[i].bp += flare[1];
  }
  const breadthAtZ = (z) => {
    const s = st.reduce((b, q) => (Math.abs(q.z - z) < Math.abs(b.z - z) ? q : b));
    return Math.min(s.fs, s.fp);
  };
  const { P, N, T, C } = m;
  const vtx = (x, y, z, n) => { P.push(x, y, z); N.push(...n); return P.length / 3 - 1; };
  const quad = (a, b, c, d, paintOf) => { T.push(a, b, c, a, c, d); C.push(paintOf, paintOf); };
  const rows = st.map((s) => {
    const deck = [];
    for (let c = 0; c <= ACROSS; c++) deck.push(vtx(-s.bs + (s.bs + s.bp) * c / ACROSS, s.deck, s.z, [0, 1, 0]));
    const o = 0.01;
    return {
      deck,
      st: [vtx(-s.fs - o, s.foot, s.z, [-1, 0, 0]), vtx(-s.bs - o, s.deck, s.z, [-1, 0, 0])],
      pt: [vtx(s.fp + o, s.foot, s.z, [1, 0, 0]), vtx(s.bp + o, s.deck, s.z, [1, 0, 0])],
    };
  });
  for (let i = 0; i + 1 < st.length; i++) {
    const a = rows[i], b = rows[i + 1];
    // Where two stations are one, what is between them stands up: a bulkhead.
    const across = st[i].z === st[i + 1].z && st[i].deck !== st[i + 1].deck ? GREY : DECK;
    for (let c = 0; c < ACROSS; c++) quad(a.deck[c], b.deck[c], b.deck[c + 1], a.deck[c + 1], across);
    // Her deck edge, either side, facing out.
    quad(a.st[0], b.st[0], b.st[1], a.st[1], GREY);
    quad(a.pt[0], a.pt[1], b.pt[1], b.pt[0], GREY);
  }
  // Her ends, closed down to her deck edge's foot.
  for (const [i, flip] of [[0, false], [st.length - 1, true]]) {
    const r = rows[i], s = st[i];
    const foot = [];
    for (let c = 0; c <= ACROSS; c++) foot.push(vtx(-s.fs + (s.fs + s.fp) * c / ACROSS, s.foot, s.z, [0, 0, flip ? 1 : -1]));
    for (let c = 0; c < ACROSS; c++) {
      if (flip) quad(foot[c], foot[c + 1], r.deck[c + 1], r.deck[c], GREY);
      else quad(foot[c], r.deck[c], r.deck[c + 1], foot[c + 1], GREY);
    }
  }
  const at = (z) => st.reduce((b, s) => (Math.abs(s.z - z) < Math.abs(b.z - z) ? s : b));
  console.log(`her decks laid: ${st.length} stations from ${st[0].z} to ${st[st.length - 1].z}; her breadth at `
    + [-120, STEP, -55, MIDDLE.z0, -42, -41, 0, 100].map((z) => `${z.toFixed(0)} ${at(z).bs.toFixed(2)}/${at(z).bp.toFixed(2)}`).join(', ')
    + `; her new side flares out ${flare.map((v) => v.toFixed(2)).join('/')}`);

  // Her after deck: the sculpt's wedge (AFTER_DECK), on her quarterdeck, its
  // sides along the curve fitted to it -- never closer than a hand and a half
  // to her side -- and its point rounded off in a half-circle as wide as the
  // wedge is there. Over its forward FLARE metres its sides swing out to her
  // own, so at the step down from her forecastle deck her side goes straight
  // on up into its wall, with no ledge of quarterdeck between and no end of
  // her forecastle deck's side standing out past it.
  const { z0, z1, y1 } = AFTER_HOUSE, y0 = quarterAt(z0) - 0.1;
  const FLARE = 6.0, zf = MIDDLE.z0 - FLARE;
  const half = (z) => {
    const wedge = Math.min(AFTER_DECK.half(z), breadthAtZ(z) - 0.35);
    if (z <= zf) return wedge;
    const u = Math.min(1, (z - zf) / FLARE), w = u * u * (3 - 2 * u);
    return wedge + (breadthAtZ(Math.min(z, MIDDLE.z0)) - 0.05 - wedge) * w;
  };
  // Its point: a round nose over the last few metres, as broad as the wedge
  // where it starts, its sides running on into the wedge's with the same lean.
  const L = 3.0, nose = half(z0 + L);
  const sideAt = (z) => (z >= z0 + L ? half(z) : nose * Math.sqrt(Math.max(0, z - z0) / L));
  const zs = [];
  for (let z = z1; z > z0 + L; z -= 0.5) zs.push(z);
  for (let k = 12; k >= 0; k--) zs.push(z0 + L * (k / 12) ** 2);
  const outline = [
    ...zs.map((z) => [-sideAt(z), z]),
    ...zs.slice(0, -1).reverse().map((z) => [sideAt(z), z]),
  ];
  const r = nose;
  // Each side's points a little along the curve: what is between two is a
  // flat of her wall, and the creases between them are shaded round.
  const n = outline.length;
  const lo = outline.map(([x, z]) => vtx(x, y0, z, [0, 0, 0])), hi = outline.map(([x, z]) => vtx(x, y1, z, [0, 0, 0]));
  for (let k = 0; k < n; k++) quad(lo[k], hi[k], hi[(k + 1) % n], lo[(k + 1) % n], SUPER_GREY);
  // Its deck, a fan from a point inside it: it is convex.
  // Its own points, so it is shaded flat and its walls round.
  const top = outline.map(([x, z]) => vtx(x, y1, z, [0, 1, 0]));
  const mid = vtx(0, y1, (z0 + z1) / 2, [0, 1, 0]);
  // Wound to face up: the outline runs down her starboard side and back up
  // her port side, which seen from above is clockwise.
  for (let k = 0; k < n; k++) { T.push(mid, top[(k + 1) % n], top[k]); C.push(DECK); }
  console.log(`her after deck laid: ${(2 * half(z1)).toFixed(2)} m across at ${z1}, its point at ${z0}, `
    + `its nose ${(2 * r).toFixed(2)} m across ${L} m from it, ${y0.toFixed(2)} to ${y1}`);

  // What stands on it. Round things: a wall at radius `rad` round (cx, cz),
  // from angle a0 to a1 (x = cos, z = sin), from ya to yb, facing out (or in).
  const SEG = 40;
  const ring = (cx, cz, rad, a0, a1, ya, yb, out, paintOf, sx = 1) => {
    const pts = [];
    for (let k = 0; k <= SEG; k++) {
      const a = a0 + ((a1 - a0) * k) / SEG;
      pts.push([cx + rad * Math.cos(a), cz + rad * Math.sin(a)]);
    }
    for (let k = 0; k < SEG; k++) {
      const [xa, za] = pts[k], [xb, zb] = pts[k + 1];
      const q = [[xa, ya, za], [xa, yb, za], [xb, yb, zb], [xb, ya, zb]].map(([x, y, z]) => vtx(sx * x, y, z, [0, 0, 0]));
      // Seen from outside with the angle running anticlockwise from above,
      // lo, hi, hi', lo' faces out; mirrored, or facing in, it runs back.
      if (out === (sx > 0)) quad(q[0], q[1], q[2], q[3], paintOf); else quad(q[3], q[2], q[1], q[0], paintOf);
    }
  };
  // A flat at height y over the same sector, from radius r0 out to r1,
  // facing up.
  const flat = (cx, cz, r0, r1, a0, a1, y, paintOf, sx = 1) => {
    for (let k = 0; k < SEG; k++) {
      const a = a0 + ((a1 - a0) * k) / SEG, b2 = a0 + ((a1 - a0) * (k + 1)) / SEG;
      const q = [[r0, a], [r1, a], [r1, b2], [r0, b2]].map(([rr, aa]) => vtx(sx * (cx + rr * Math.cos(aa)), y, cz + rr * Math.sin(aa), [0, 1, 0]));
      if (sx > 0) quad(q[0], q[3], q[2], q[1], paintOf); else quad(q[0], q[1], q[2], q[3], paintOf);
    }
  };
  // Her third pom-pom's bandstand, on her centreline over the after end of
  // her after deck: a drum a deck-hand's height, teak on top, and a round
  // splinter shield all the way round it.
  {
    const b = AFTER_PLATFORM;
    ring(0, b.z, b.r, 0, 2 * Math.PI, y1 - 0.02, b.floor, true, SUPER_GREY);
    flat(0, b.z, 0, b.r - 0.1, 0, 2 * Math.PI, b.floor, DECK);
    ring(0, b.z, b.r, 0, 2 * Math.PI, b.floor, b.floor + b.shield, true, SUPER_GREY);
    ring(0, b.z, b.r - 0.1, 0, 2 * Math.PI, b.floor, b.floor + b.shield, false, SUPER_GREY);
    flat(0, b.z, b.r - 0.1, b.r, 0, 2 * Math.PI, b.floor + b.shield, SUPER_GREY);
  }
  // And either side of it, her gun positions out over her side: a half-round
  // of her wall bulged out from her quarterdeck to a man's chest over her
  // after deck, its floor teak and open to the deck inboard -- the splinter
  // shield is her wall, carried up and round.
  for (const sx of [1, -1]) {
    const b = AFTER_SPONSONS;
    const cx = half(b.z) - 0.05;
    // Her wall there runs in towards her centreline going aft: the half-round
    // is turned square to it.
    const lean = Math.atan2(half(b.z + 0.5) - half(b.z - 0.5), 1);
    const face = -lean; // the way out from her wall, as an angle (x = cos, z = sin)
    const a0 = face - Math.PI / 2, a1 = face + Math.PI / 2;
    ring(cx, b.z, b.r, a0, a1, y0, y1 + b.shield, true, SUPER_GREY, sx);
    ring(cx, b.z, b.r - 0.08, a0, a1, y1, y1 + b.shield, false, SUPER_GREY, sx);
    flat(cx, b.z, b.r - 0.08, b.r, a0, a1, y1 + b.shield, SUPER_GREY, sx);
    flat(cx, b.z, 0, b.r - 0.08, a0, a1, y1, DECK, sx);
  }
  console.log(`her after deck: a bandstand ${(2 * AFTER_PLATFORM.r).toFixed(1)} m across at ${AFTER_PLATFORM.z}, `
    + `its floor ${AFTER_PLATFORM.floor}; gun positions either side at ${AFTER_SPONSONS.z}, ${(2 * AFTER_SPONSONS.r).toFixed(1)} m across`);
}

// ---- her paint, where the decimation smeared it ---------------------------------------
// A long triangle of her side that ran down to her bottom took her red with
// it on to her deck here and there. Nothing over her boot topping is red, and
// nothing a metre and a half over her waterline is boot topping.
{
  let n = 0;
  for (let t = 0; t < m.C.length; t++) {
    if (m.C[t] !== 3 && m.C[t] !== 4) continue;
    const [, cy] = middle(m, t);
    if ((m.C[t] === 4 && cy > 0.4) || (m.C[t] === 3 && cy > 1.4)) { m.C[t] = GREY; n++; }
  }
  console.log(`her paint: ${n} triangles over her boot topping painted grey`);
}

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const paintOf = new Float32Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOf[m.T[t * 3 + j]] = m.C[t];
  writeGlb(process.env.DUMP, { P: m.P, N: m.N, T: m.T, paint: paintOf }, 'dump');
  if (process.env.STAGE === 'merge') process.exit(0);
}
if (process.env.STAGE === 'guns') process.env.SKIP_HULL = '1';

// ---- her guns, as the owner sculpted them ------------------------------------------
// Each is put in the frame of its mounting: the pivot at the origin, the foot
// of what trains at y = 0, the bore along +z. What elevates -- the barrels
// and what carries them -- is lifted off it on to a cradle about its
// trunnions, turned down level if it was sculpted laid up; what is left
// trains. Every one of them points its barrels -x in the owner's sculpt.
//
//   file      the decimated sculpt (see build/hood-source.mjs)
//   scale     metres a unit of the sculpt
//   pivot     [x, z] of what it trains about, in the sculpt
//   foot      the sculpt's y of its foot: it is cut off square there
//   trunnion  [x, y] of its trunnions, in the sculpt
//   elev      how far it was sculpted laid up, radians
//   cradle    (u, v, z, x, y) => whether a point of the sculpt elevates: u
//             along the bore from the trunnions, v square to it, up
//   muzzles   [z, v, u] of each muzzle, in the sculpt's units off the trunnions
function gunPiece(file, { scale, pivot, foot, trunnion, elev = 0, cradle, muzzles, ahead = -Infinity }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    const x = raw.pos[i], y = raw.pos[i + 1], z = raw.pos[i + 2];
    P.push((z - pivot[1]) * scale, (y - foot) * scale, -(x - pivot[0]) * scale);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const mesh = { P, N, T: Array.from(raw.idx), C: new Array(raw.idx.length / 3).fill(GREY) };
  fixWinding(mesh);
  // Off square at its foot, along the cut: nothing under it.
  splitAlong(mesh, (x, y) => -y, { drop: true });
  const c = Math.cos(elev), s = Math.sin(elev);
  const [tx, ty] = trunnion;
  const sculptOf = (X, Y, Z) => [pivot[0] - Z / scale, foot + Y / scale, pivot[1] + X / scale];
  const lifts = (t) => {
    const [X, Y, Z] = middle(mesh, t);
    const [x, y, z] = sculptOf(X, Y, Z);
    const u = (tx - x) * c + (y - ty) * s, v = -(tx - x) * s + (y - ty) * c;
    return cradle(u, v, z, x, y);
  };
  // Nothing of what trains reaches further ahead than `ahead` in the sculpt:
  // the shards the decimation left standing off a shield's face.
  const forward = (t) => [0, 1, 2].some((j) => {
    const v = mesh.T[t * 3 + j] * 3;
    return sculptOf(mesh.P[v], mesh.P[v + 1], mesh.P[v + 2])[0] < ahead;
  });
  const house = subMesh(mesh, (t) => !lifts(t) && !forward(t));
  dropLoose(house, { maxArea: 0.002 * scale * scale, maxDiag: 0.04 * scale });
  for (let t = 0; t < house.T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(house, house.T[t * 3], house.T[t * 3 + 1], house.T[t * 3 + 2]);
    house.C[t] = ny > 0.9 * Math.hypot(nx, ny, nz) && middle(house, t)[1] < 0.6 ? STEEL : GREY;
  }
  creased(house, 40);
  const guns = subMesh(mesh, lifts);
  // Into the cradle's frame: origin on the trunnions, the bore along +z.
  const T0 = [0, (ty - foot) * scale, -(tx - pivot[0]) * scale];
  for (let i = 0; i < guns.P.length; i += 3) {
    const y = guns.P[i + 1] - T0[1], z = guns.P[i + 2] - T0[2];
    guns.P[i] -= T0[0];
    guns.P[i + 1] = y * c - z * s; guns.P[i + 2] = y * s + z * c;
    const ny = guns.N[i + 1], nz = guns.N[i + 2];
    guns.N[i + 1] = ny * c - nz * s; guns.N[i + 2] = ny * s + nz * c;
  }
  if (guns.T.length) creased(guns, 40);
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const out = {
    house, guns, trunnion: T0.map((v) => +v.toFixed(3)), roof: +roof.toFixed(3),
    muzzles: muzzles.map(([z, v, u]) => [+(z * scale).toFixed(3), +(v * scale).toFixed(3), +(u * scale).toFixed(3)]),
  };
  console.log(`${file}: house ${house.T.length / 3} triangles, ${roof.toFixed(2)} m high; cradle ${guns.T.length / 3} `
    + `triangles about trunnions ${T0[1].toFixed(2)} m up, ${T0[2].toFixed(2)} m ahead; muzzles ${out.muzzles.map((m) => m.join('/')).join(' ')}`);
  return out;
}

// The 5.5-inch BL Mk I in its shield: 5.5 m a unit, which makes the shield
// two and three quarter metres across. Sculpted laid up seven and a half
// degrees. The decimation left its barrel in splinters, so everything of it
// ahead of the shield's face within a barrel's thickness of the bore is taken
// off, and the barrel drawn afresh on the cradle: from inside the shield to a
// muzzle five metres out, tapered, with its swell at the muzzle.
const SEC = gunPiece('hood-55.glb', {
  scale: 5.5, pivot: [0.11, 0], foot: -0.135, trunnion: [0.0, 0.0976], elev: 0.131,
  cradle: (u, v, z, x) => x < -0.15 && Math.hypot(v, z) < 0.1,
  muzzles: [[0, 0, 0.93]], ahead: -0.19,
});
// Its shield's face came out of the decimation torn -- shards standing off
// it round the gun port, holes punched through it either side -- so the face
// is taken off down to a hand behind it, from its foot plate to the brow of
// its roof, and plated again on its own curve: smooth, with a gun port the
// barrel clears from five down to thirty up, lined back into the shield.
{
  const h = SEC.house;
  // How far forward the shield's face is at x, low down where it is whole.
  const faceAt = (x, y) => {
    let best = -Infinity;
    for (let t = 0; t < h.T.length / 3; t++) {
      const a = h.T[t * 3] * 3, b = h.T[t * 3 + 1] * 3, c = h.T[t * 3 + 2] * 3;
      const d = (h.P[b + 1] - h.P[c + 1]) * (h.P[a] - h.P[c]) + (h.P[c] - h.P[b]) * (h.P[a + 1] - h.P[c + 1]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((h.P[b + 1] - h.P[c + 1]) * (x - h.P[c]) + (h.P[c] - h.P[b]) * (y - h.P[c + 1])) / d;
      const l2 = ((h.P[c + 1] - h.P[a + 1]) * (x - h.P[c]) + (h.P[a] - h.P[c]) * (y - h.P[c + 1])) / d;
      if (l1 < 0 || l2 < 0 || 1 - l1 - l2 < 0) continue;
      best = Math.max(best, l1 * h.P[a + 2] + l2 * h.P[b + 2] + (1 - l1 - l2) * h.P[c + 2]);
    }
    return best;
  };
  const W = 1.35, Y0 = 0.62, Y1 = 1.9, Y2 = 2.07, BROW = 0.88;
  const PORT = { x: 0.27, y0: 1.02, y1: 1.86, depth: 0.3 };
  const xs = [];
  for (let k = 0; k <= 30; k++) xs.push(-W + (2 * W * k) / 30);
  xs.push(-PORT.x, PORT.x);
  xs.sort((a, b) => a - b);
  const zf = xs.map((x) => faceAt(Math.max(-W + 0.01, Math.min(W - 0.01, x)), 0.4));
  const zOf = (x) => { // the face at x, between the columns
    for (let k = 0; k + 1 < xs.length; k++) if (x <= xs[k + 1]) return zf[k] + (zf[k + 1] - zf[k]) * (x - xs[k]) / ((xs[k + 1] - xs[k]) || 1);
    return zf[zf.length - 1];
  };
  const before = h.T.length / 3;
  const cut = subMesh(h, (t) => ![0, 1, 2].every((j) => {
    const v = h.T[t * 3 + j] * 3, x = h.P[v], y = h.P[v + 1], z = h.P[v + 2];
    return Math.abs(x) < W + 0.02 && y > Y0 && y < Y2 + 0.03 && z > Math.min(zOf(x), y > Y1 ? BROW + 0.25 : 9) - 0.3;
  }));
  const off = before - cut.T.length / 3;
  const { P, N, T, C } = cut;
  const vtx = (x, y, z, n) => { P.push(x, y, z); N.push(...n); return P.length / 3 - 1; };
  const quad = (a, b, c, d, n) => {
    const q = [a, b, c, d].map((p) => vtx(...p, n));
    T.push(q[0], q[1], q[2], q[0], q[2], q[3]); C.push(GREY, GREY);
  };
  const nrm = (a, b, c) => {
    const u = [0, 1, 2].map((k) => b[k] - a[k]), w = [0, 1, 2].map((k) => c[k] - a[k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1;
    return n.map((v) => v / l);
  };
  // Wound so it faces out, forward (+z) and up: quad(a, b, c, d) with a..d
  // going round anticlockwise seen from ahead.
  const face = (a, b, c, d) => quad(a, b, c, d, nrm(a, b, c));
  const o = 0.01;
  for (let k = 0; k + 1 < xs.length; k++) {
    const xa = xs[k], xb = xs[k + 1], za = zf[k] + o, zb = zf[k + 1] + o;
    const inPort = xa >= -PORT.x - 1e-6 && xb <= PORT.x + 1e-6;
    const spans = inPort ? [[Y0, PORT.y0], [PORT.y1, Y1]] : [[Y0, Y1]];
    for (const [ya, yb] of spans) face([xa, ya, za], [xb, ya, zb], [xb, yb, zb], [xa, yb, za]);
    // The brow: back up to the roof's front edge.
    const ba = Math.min(za, BROW + o), bb = Math.min(zb, BROW + o);
    face([xa, Y1, za], [xb, Y1, zb], [xb, Y2, bb], [xa, Y2, ba]);
  }
  // The gun port, lined back into the shield.
  const zp = zOf(0) + o, zb = zp - PORT.depth, { x: px, y0: py0, y1: py1 } = PORT;
  face([-px, py0, zp], [px, py0, zp], [px, py0, zb], [-px, py0, zb]); // sill, facing up
  face([-px, py1, zb], [px, py1, zb], [px, py1, zp], [-px, py1, zp]); // head, facing down
  face([px, py0, zp], [px, py1, zp], [px, py1, zb], [px, py0, zb]); // port side, facing in
  face([-px, py0, zb], [-px, py1, zb], [-px, py1, zp], [-px, py0, zp]); // starboard side, facing in
  SEC.house = cut;
  console.log(`hood-55.glb: shield face replated, ${off} triangles of torn face off, its face ${zOf(0).toFixed(2)} m ahead`);
}
{
  const len = 0.93 * 5.5;
  const g = blank();
  tube(g, [0, 0, -0.4], [0, 0, 1.0], 0.17, 0.15, 24, GREY);
  tube(g, [0, 0, 1.0], [0, 0, len - 0.35], 0.135, 0.1, 24, GREY);
  tube(g, [0, 0, len - 0.35], [0, 0, len - 0.05], 0.1, 0.118, 24, GREY);
  tube(g, [0, 0, len - 0.05], [0, 0, len], 0.118, 0.112, 24, GREY);
  creased(g, 40);
  SEC.guns = g;
  SEC.muzzles = [[0, 0, +len.toFixed(3)]];
}
// The quadruple 2-pounder Mk VII: 2.0 m a unit, which makes its platform and
// splinter shield nearly four metres across, to stand in her tubs. Sculpted
// laid up thirty degrees; its cradle is its four barrels, their breeches and
// the ammunition boxes on them, and not the shield in front of it.
const POMPOM = gunPiece('hood-pompom.glb', {
  scale: 2.0, pivot: [-0.11, 0], foot: -0.46, trunnion: [-0.04, 0.14], elev: 0.52,
  cradle: (u, v, z, x, y) => u > -0.25 && u < 1.05 && v > -0.27 && v < 0.3 && Math.abs(z) < 0.27 && (x > -0.48 || y > 0.3),
  muzzles: [[-0.14, 0.19, 0.81], [0.14, 0.19, 0.81], [-0.14, -0.11, 0.98], [0.14, -0.11, 0.98]],
});

// Her 15-inch Mk II twin: 10.3 m a unit, which makes the barbette it trains
// on -- the drum the sculpt stands it on -- nine and a half metres across,
// as hers was. The sculpt's rocket launcher and its railed platform on the
// roof are gone (see build/hood-source.mjs), and so is its drum, which
// hood.js draws as each turret's barbette at that turret's own height: the
// gunhouse is cut off square at its skirt. Its barrels, blast bags and all,
// are lifted off at the face on to the cradle; the sculpt drew them half the
// length of a 15-inch/42, so forward of the blast bags they are drawn out
// to it.
export const MAIN_SCALE = 10.3;
const MAIN = gunPiece('hood-15.glb', {
  scale: MAIN_SCALE, pivot: [0.30, 0], foot: -0.07, trunnion: [-0.05, 0.072], elev: -0.0095,
  cradle: (u, v, z, x) => x < -0.19 && Math.min(Math.hypot(v, z - 0.1042), Math.hypot(v, z + 0.1042)) < 0.075,
  muzzles: [[0.1042, 0, 0.9], [-0.1042, 0, 0.9]],
});
{
  const bag = 3.1, STRETCH = 1.6;
  let tip = 0;
  for (let i = 2; i < MAIN.guns.P.length; i += 3) {
    if (MAIN.guns.P[i] > bag) MAIN.guns.P[i] = bag + (MAIN.guns.P[i] - bag) * STRETCH;
    tip = Math.max(tip, MAIN.guns.P[i]);
  }
  MAIN.muzzles = MAIN.muzzles.map(([x, y]) => [x, y, +tip.toFixed(3)]);
  console.log(`hood-15.glb: barrels drawn out to ${tip.toFixed(2)} m from the trunnions`);
}

if (process.env.STAGE === 'guns') {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const dir = process.env.PIECES || '.';
  for (const [name, g] of Object.entries({ main: MAIN, sec: SEC, pompom: POMPOM })) {
    for (const [part, mesh] of [['house', g.house], ['guns', g.guns]]) {
      if (!mesh.T.length) continue;
      const paint = new Float32Array(mesh.P.length / 3);
      if (mesh.C) for (let t = 0; t < mesh.T.length / 3; t++) for (let j = 0; j < 3; j++) paint[mesh.T[t * 3 + j]] = mesh.C[t];
      writeGlb(path.join(dir, `${name}-${part}.glb`), { P: mesh.P, N: mesh.N, T: mesh.T, paint }, 'piece');
    }
    // And the two together, the cradle level on its trunnions.
    const all = { P: [...g.house.P], N: [...g.house.N], T: [...g.house.T], C: [...g.house.C] };
    if (g.guns.T.length) {
      const moved = { P: g.guns.P.map((v, i) => v + g.trunnion[i % 3]), N: g.guns.N, T: g.guns.T, C: g.guns.C };
      append(all, moved);
    }
    writeGlb(path.join(dir, `${name}-all.glb`), { P: all.P, N: all.N, T: all.T }, 'piece');
  }
  process.exit(0);
}

// ---- where her guns stand ------------------------------------------------------------
// Port side; the starboard ones are their mirrors. `y` is the deck each
// stands on, `rest` which way it faces stowed.
//
// Her twelve 5.5-inch, six a side: one on her forecastle deck abreast her
// bridge, under the platforms round it, and one in the empty bay under her
// shelter deck just abaft it; three in the bays under her shelter deck
// further aft, each where the sculpt cast one; and one on her shelter deck itself,
// abreast her fore funnel at the deck's edge, where the sculpt cast one too.
// Each is stowed trained abeam: a gun stowed fore and aft in a bay lies along
// the wall at the bay's end.
export const SECONDARY = [
  { name: '5.5 bridge fwd', x: 11.5, z: 39.5, y: DECKS.forecastle, rest: Math.PI / 2 },
  { name: '5.5 bridge aft', x: 9.4, z: 31.75, y: DECKS.forecastle, rest: Math.PI / 2 },
  { name: '5.5 shelter deck', x: 9.7, z: 17.8, y: 10.31, rest: Math.PI / 2 },
  { name: '5.5 fwd bay', x: 12.1, z: 16.1, y: DECKS.forecastle, rest: Math.PI / 2 },
  { name: '5.5 mid bay', x: 12.4, z: -5.25, y: DECKS.forecastle, rest: Math.PI / 2 },
  { name: '5.5 aft bay', x: 11.75, z: -26.55, y: DECKS.forecastle, rest: Math.PI / 2 },
];

// ---- her decks' paint ---------------------------------------------------------------
// Her weather decks are teak (laid above); her superstructure's decks,
// platforms and flats are steel, the dark grey of a deck that is walked on,
// and its walls her grey.
{
  const { T, C } = m;
  let steel = 0;
  for (let t = 0; t < T.length / 3; t++) {
    if (C[t] !== SUPER_GREY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const [, cy] = middle(m, t);
    if (ny > 0.8 * Math.hypot(nx, ny, nz) && cy > DECKS.quarter + 0.3) { C[t] = STEEL; steel++; } else C[t] = GREY;
  }
  console.log(`decks: ${steel} faces of her superstructure's decks steel`);
}

// ---- the faces that face in, and her normals split at her creases --------------------
console.log(`faces facing in: ${turnInward(m)} turned`);
recomputeNormals(m);
const st = stations(m, { length: REAL_LOA, beamCap: DECKS.forecastle - 0.2, edgeCap: 10.0, slice: true, beamFloor: 0 });
let canon = weld(m);
const thin = thinFaces(m, 0.5);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: -4.0, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -19, z0: -135, step: 0.5, nx: 77, nz: 541 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// The Home Fleet's medium grey she wore in May 1941, her teak, the dark grey
// of her steel decks, her black boot topping and her red bottom.
const PALETTE = [
  [0x7a, 0x82, 0x89],
  [0x9a, 0x8f, 0x74],
  [0x55, 0x5c, 0x65],
  [0x19, 0x1c, 0x20],
  [0x8c, 0x3a, 0x2c],
].map(paletteToLinear);
const paintOfVertex = new Uint8Array(m.P.length / 3);
for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOfVertex[m.T[t * 3 + j]] = m.C[t];
const uvArr = boxUvs(m);
const col = paint(m, (i) => PALETTE[paintOfVertex[i]]);

function packPiece(mesh) {
  if (!mesh.C) return packPieceCompact(mesh);
  const byV = new Uint8Array(mesh.P.length / 3);
  for (let t = 0; t < mesh.T.length / 3; t++) for (let j = 0; j < 3; j++) byV[mesh.T[t * 3 + j]] = mesh.C[t];
  return packPieceCompact(mesh, (i) => PALETTE[byV[i]]);
}

// ---- her lines, as the sculpt has them --------------------------------------------
// Off the round metre, so a plane through a station's points does not cut
// each triangle there at a corner (see prepare-fuso-hull.mjs).
const LINES = measureLines(m, st, { z0: -130.9963, dz: 1, nz: 262, y0: -10, dy: 0.5, ny: 48 }, DECKS.forecastle);

// ---- slice, pack and write ------------------------------------------------------------
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 64, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const piece = (g) => ({
  trunnion: g.trunnion, muzzles: g.muzzles, roof: g.roof, ...(g.bores ? { bores: g.bores } : {}),
  house: packPiece(g.house).toString('base64'), guns: g.guns.T.length ? packPiece(g.guns).toString('base64') : null,
});
const r6 = (v) => +v.toFixed(6);
const mounts = {
  turrets: TURRETS.map(({ name, x, z, rest, seat, deck }) => ({ name, x, z, rest: r6(rest), seat, deck })),
  secondary: SECONDARY.map(({ name, x, z, y, rest }) => ({ name, x, z, y: +y.toFixed(3), rest: r6(rest) })),
  pompom: POMPOM_TUBS.map(({ name, x, z, floor }) => ({ name, x, z, y: floor })),
  afterDeck: { z0: AFTER_HOUSE.z0, z1: AFTER_HOUSE.z1, y: AFTER_HOUSE.y1 },
  decks: DECKS,
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-hood-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const HOOD_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see hoodSurfaceY.\n`
  + `export const HOOD_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 15-inch twin, her 5.5-inch and her quadruple pom-pom, as the owner\n`
  + `// sculpted them, each in the frame of its mounting.\n`
  + `export const HOOD_GUNS = ${JSON.stringify({ main: piece(MAIN), sec: piece(SEC), pompom: piece(POMPOM) })};\n`
  + `// Where her turrets, her 5.5-inch and her pom-poms stand; port\n`
  + `// side, the starboard ones their mirrors.\n`
  + `export const HOOD_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const HOOD_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
