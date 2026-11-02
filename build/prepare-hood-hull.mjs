// Turn the owner's HMS Hood sculpts into what client/js/render/hoodHull.js
// ships: her hull and her superstructure as one painted mesh, and her 15-inch
// turret, her 5.5-inch, her quadruple pom-pom and her triple bank of tubes as
// the owner sculpted them, cut so they train and elevate. In order:
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
//     quarterdeck, its outline read off the sculpt and run smooth;
//   * paint her decks, split her normals at every crease;
//   * read her surface off as a height map and her lines, which is what her
//     interior and her armour are fitted under;
//   * take her guns off the owner's sculpts of them, each in the frame of its
//     mounting with what elevates on a cradle of its own, and draw her tubes
//     whole forward of where the sculpt of them melted;
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
  readGlb, bbox, fixWinding, boxCut, components,
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
  s.C = new Array(s.T.length / 3).fill(SUPER_GREY);
  const { lo, hi } = bbox(s);
  console.log(`her superstructure: ${before} triangles, ${s.T.length / 3} on her, from ${lo[2].toFixed(1)} to `
    + `${hi[2].toFixed(1)} m along her, ${lo[0].toFixed(1)} to ${hi[0].toFixed(1)} across, ${hi[1].toFixed(1)} m up`);
  return s;
})();
append(m, sup);

// ---- her decks, laid ------------------------------------------------------------------
// Smooth and level across, along her own sheer: out to the edge of the cut
// either side at each half-metre of her, and her deck edge carried down over
// the cut. Her quarterdeck runs forward from her stern to the end of her
// superstructure, where a bulkhead goes up across her to her forecastle deck;
// from there forward a little way her forecastle deck stands on a side drawn
// straight up from her quarterdeck, where the sculpt slumped it. On her
// quarterdeck abaft her superstructure stands her after deck (AFTER_DECK).
export const AFTER_HOUSE = {
  z0: AFTER_DECK.tip, z1: +(MIDDLE.z0 + 0.4).toFixed(2), y1: +(DECKS.shelter - SUPER.sink - 0.02).toFixed(3),
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
    quad(a.st[0], a.st[1], b.st[1], b.st[0], GREY);
    quad(a.pt[0], b.pt[0], b.pt[1], a.pt[1], GREY);
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
  // wedge is there. Its top a finger under her superstructure's deck, and run
  // a hand in under its after end, so the one goes on into the other.
  const { z0, z1, y1 } = AFTER_HOUSE, y0 = quarterAt(z0) - 0.1;
  const half = (z) => Math.min(AFTER_DECK.half(z), breadthAtZ(z) - 0.35);
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
  for (let k = 0; k < n; k++) { T.push(mid, top[k], top[(k + 1) % n]); C.push(SUPER_GREY); }
  console.log(`her after deck laid: ${(2 * half(z1)).toFixed(2)} m across at ${z1}, its point at ${z0}, `
    + `its nose ${(2 * r).toFixed(2)} m across ${L} m from it, ${y0.toFixed(2)} to ${y1}`);
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
