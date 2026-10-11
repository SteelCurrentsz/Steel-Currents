// Turn the owner's KMS Scharnhorst sculpts into what
// client/js/render/scharnhorstHull.js ships: her hull, her bridge and front
// superstructure and her mid and aft superstructure as one painted mesh, and
// her 28 cm triple turret and 15 cm single as the owner sculpted them, cut so
// they train and elevate. In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a quarter turn, 234.9 m long, her sections 30 m across and 14.05 deep
//     (see build/scharnhorst-source.mjs), floated at 9.1 m; her paint rides
//     along a triangle at a time;
//   * close every hole the sculpt had, each in its own plane;
//   * read her gunwale off her, a section every half metre: how high her deck
//     edge is and how far out, all the way from her stern to her stem head;
//   * cut her three screws off her shafts (scharnhorst.js draws three that
//     turn);
//   * take everything off her down to just over her waterline and draw her
//     topsides afresh off her own faired sections up to her gunwale, joined
//     to her underwater body point for point, and lay her deck across them on
//     the same points, so she is closed everywhere and no seam shows daylight;
//   * stand her two superstructures on that deck, each as its own sculpt drew
//     it at the scale that puts its conning tower, funnel, mainmast and after
//     control position where the sculpt of her hull has them; the forward one
//     ends abaft her funnel and the after one begins there;
//   * cut out of them the 15 cm turrets and every light gun they had cast in
//     (scharnhorst.js stands a gun there that trains), take the dents and
//     drips out of their flat faces, and close every hole left in them;
//   * paint her decks: teak on her upper deck, steel on her superstructure's;
//   * split her normals at every crease and paint edge;
//   * read her surface off as a height map, which is what scharnhorst.js
//     stands every mounting on, and her lines, which is what her interior and
//     armour are fitted under;
//   * take her 28 cm turret and her 15 cm single off the owner's sculpts of
//     them, each in the frame of its mounting with its barrels on a cradle of
//     their own (her 15 cm twin, her 10.5 cm and her tubes are the Bismarck's
//     and the Tirpitz's: see bismarckHull.js);
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file scharnhorst.js decodes synchronously.
//
// The stages are build/sculpt.mjs and build/sculpt-parts.mjs; what is here is
// what is hers.
//
//   node build/prepare-scharnhorst-hull.mjs
//
// Reads assets/models/scharnhorst-*.glb (made by build/scharnhorst-source.mjs),
// writes client/js/render/scharnhorstHull.data.js. Re-run it whenever an asset
// or anything below changes; the data file is committed, so a fresh clone runs
// without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, boxCut, closeHoles, components,
  recomputeNormals, weld, stations, hardEdges, shadePlating, boxUvs, denoise, smoothFlats,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import { subMesh, dropLoose, turnInward, thinFaces, creased, measureLines } from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/scharnhorstHull.data.js');

const REAL_LOA = 234.9;
const DRAFT = 9.1;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern, and her keel, flat along the middle
// of her at -0.2330 (see build/scharnhorst-source.mjs). Her length is 123.7 m
// a unit of the sculpt and her sections, across and up, 106 m a unit, which
// makes her 30 m across and 14.05 m from her keel to her upper deck
// amidships, as she was. Her bow is at -X: so she is turned a quarter round,
//
//   world_X =  (local_Z - zc) * SECTION    (her starboard side, -Z, is -X)
//   world_Y =  (local_Y - localKeel) * SECTION
//   world_Z = -(local_X - xc) * UNIT
const SCULPT = { x0: -0.95099, x1: 0.94788 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const SECTION = 106.0;
const FRAME = { xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: 0, localKeel: -0.2330 + DRAFT / SECTION };

// Her paints, as build/scharnhorst-source.mjs numbers them; and her
// superstructure's grey, which is grey that is left as its sculpt drew it --
// not faired, not dropped for being small and apart -- until her decks are
// laid.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5;

/** A point of her hull's sculpt in the game's frame. */
const toWorld = (lx, ly, lz) => [(lz - FRAME.zc) * SECTION, (ly - FRAME.localKeel) * SECTION, -(lx - FRAME.xc) * UNIT];
/** A normal of her hull's sculpt in the game's frame: the frame stretches her, so it is skewed back. */
const normalToWorld = (nx, ny, nz) => {
  const wx = nz / SECTION, wy = ny / SECTION, wz = -nx / UNIT;
  const l = Math.hypot(wx, wy, wz) || 1;
  return [wx / l, wy / l, wz / l];
};

/** A painted decimation of her, in the game's frame, with a paint a triangle. */
function load(file) {
  const raw = readGlb(file);
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...toWorld(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(...normalToWorld(raw.nrm[i], raw.nrm[i + 1], raw.nrm[i + 2]));
  }
  const mesh = { P, N, T: Array.from(raw.idx), C: [] };
  for (let t = 0; t < mesh.T.length; t += 3) mesh.C.push(raw.paint ? Math.round(raw.paint[mesh.T[t]]) : GREY);
  return mesh;
}

/** Append `b` to `a`. */
function append(a, b) {
  const base = a.P.length / 3;
  for (let i = 0; i < b.P.length; i++) { a.P.push(b.P[i]); a.N.push(b.N[i]); }
  for (let i = 0; i < b.T.length; i++) a.T.push(b.T[i] + base);
  for (let i = 0; i < b.C.length; i++) a.C.push(b.C[i]);
}

/** The middle of triangle `t`. */
const middle = (mesh, t) => {
  const { P, T } = mesh;
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};

const m = load(ASSET('scharnhorst-hull.glb'));
{
  const { lo, hi } = bbox(m);
  console.log('calibration: UNIT', UNIT.toFixed(3), 'SECTION', SECTION, 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');
// Every hole the sculpt has, wherever it is -- the pinholes the decimator left
// in her bottom where two of her plates met at a hair's angle, the open ends of
// her shafts -- is closed in its own plane, before anything else is done to her.
{
  const s = closeHoles(m, new Uint8Array(m.T.length / 3).fill(1), () => null, { open: true });
  console.log(`holes closed: ${s.loops} (${s.capped} triangles, ${s.fanned} fanned)`);
}

// ---- her gunwale ------------------------------------------------------------------
// A section through her every half metre of her length: how far out her side
// is at every quarter metre of height, each side. Her gunwale is the top of
// her side -- walking up it from her waterline, the last height at which it
// is still her side and not something standing on her deck, which is
// anything less than `keep` of the breadth she has under it. Each side is read
// on its own, and her deck is laid out to each side where it is.
const GUNWALE = { z0: -118, dz: 0.5, n: 473, keep: 0.85, step: 0.25, under: 0.2 };
/**
 * Her deck edge over her waterline, metres, along her: level at 4.1 from her
 * quarterdeck to forward of Bruno, and rising from there to her stem head, as
 * the sculpt has it where her deck is clear.
 */
const SHEER = [[-118, 4.3], [-110, 4.15], [-100, 4.1], [32, 4.1], [44, 4.25], [60, 4.35], [80, 4.5], [92, 4.85],
  [100, 5.15], [104, 5.4], [108, 5.7], [112, 6.1], [118, 6.7]];
const sheerAt = (z) => {
  if (z <= SHEER[0][0]) return SHEER[0][1];
  for (let i = 1; i < SHEER.length; i++) {
    if (z > SHEER[i][0]) continue;
    const [a, ya] = SHEER[i - 1], [b, yb] = SHEER[i];
    return ya + (yb - ya) * (z - a) / (b - a);
  }
  return SHEER[SHEER.length - 1][1];
};
const med = (arr, k, r) => {
  const v = [];
  for (let d = -r; d <= r; d++) if (arr[k + d] !== undefined && !Number.isNaN(arr[k + d])) v.push(arr[k + d]);
  v.sort((p, q) => p - q);
  return v.length ? v[v.length >> 1] : NaN;
};
const mean = (arr, k, r) => {
  let sum = 0, n = 0;
  for (let d = -r; d <= r; d++) if (arr[k + d] !== undefined && !Number.isNaN(arr[k + d])) { sum += arr[k + d]; n++; }
  return n ? sum / n : NaN;
};
/** Her side as sections: for each station and side, max |x| per quarter metre of height. */
function sidesOf(mesh) {
  const { P, T } = mesh;
  const side = [0, 1].map(() => Array.from({ length: GUNWALE.n }, () => new Map()));
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t] * 3, T[t + 1] * 3, T[t + 2] * 3];
    const zs = v.map((a) => P[a + 2]);
    const k0 = Math.max(0, Math.ceil((Math.min(...zs) - GUNWALE.z0) / GUNWALE.dz));
    const k1 = Math.min(GUNWALE.n - 1, Math.floor((Math.max(...zs) - GUNWALE.z0) / GUNWALE.dz));
    for (let k = k0; k <= k1; k++) {
      const z = GUNWALE.z0 + k * GUNWALE.dz;
      const pts = [];
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3];
        if ((P[a + 2] - z) * (P[b + 2] - z) > 0 || P[a + 2] === P[b + 2]) continue;
        const f = (z - P[a + 2]) / (P[b + 2] - P[a + 2]);
        pts.push([P[a] + (P[b] - P[a]) * f, P[a + 1] + (P[b + 1] - P[a + 1]) * f]);
      }
      if (pts.length < 2) continue;
      const [[xa, ya], [xb, yb]] = pts;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(yb - ya), Math.abs(xb - xa)) / 0.05));
      for (let s = 0; s <= n; s++) {
        const x = xa + (xb - xa) * s / n, y = ya + (yb - ya) * s / n;
        const key = Math.round(y / GUNWALE.step);
        const map = side[x < 0 ? 0 : 1][k];
        map.set(key, Math.max(map.get(key) || 0, Math.abs(x)));
      }
    }
  }
  return side;
}
const gunwale = (() => {
  const side = sidesOf(m);
  const ys = new Float64Array(GUNWALE.n).fill(NaN);
  for (let k = 0; k < GUNWALE.n; k++) {
    const both = new Map();
    for (const s of [0, 1]) for (const [key, w] of side[s][k]) both.set(key, Math.max(both.get(key) || 0, w));
    const keys = [...both.keys()].sort((p, q) => p - q);
    let under = 0, top = null;
    for (const key of keys) {
      const y = key * GUNWALE.step, w = both.get(key);
      if (y < 0) { under = Math.max(under, w); continue; }
      if (top !== null && y > top + 0.6) break;
      if (w >= GUNWALE.keep * under) { under = Math.max(under, w); top = y; }
    }
    if (top !== null) ys[k] = top;
  }
  // Her sheer is fair: each station takes the median of a metre and a half
  // either side of it, which takes out the odd station a lump on her side or
  // a stump on her deck read wrong; and the median of quarter-metre readings
  // is a staircase, which her sheer is not -- a running mean over two metres
  // either way runs it up smooth.
  const gy0 = Float64Array.from(ys, (_, k) => med(ys, k, 3));
  // Her sheer, though, is not read off her where the sculpt fused the feet of
  // her superstructure, her 15 cm and her flak into her deck edge -- from forty
  // metres abaft her middle to fifteen forward of it the sculpt's deck edge
  // wanders a metre up and down -- but taken from where her deck is clear of
  // them, fore and aft (SHEER).
  const gy = Float64Array.from(gy0, (v, k) => (Number.isNaN(v) ? v : sheerAt(GUNWALE.z0 + k * GUNWALE.dz)));
  // How far out each side is a hand under her deck edge -- under whatever
  // stood on her gunwale there, a sponson or a boom -- the median of two
  // metres either way, and run smooth over a metre.
  // (The widest of the readings round it: her side is grooved along her
  // rubbing strake a hand under her deck edge, where one reading alone is
  // three or four metres in from her side.)
  const at = (map, y) => {
    const key = Math.round(y / GUNWALE.step);
    let w = NaN;
    for (const d of [0, -1, 1, -2]) if (map.has(key + d) && !(map.get(key + d) <= w)) w = map.get(key + d);
    return w;
  };
  const gw = [0, 1].map((s) => {
    const raw = Float64Array.from(gy, (y, k) => (Number.isNaN(y) ? NaN : at(side[s][k], y - GUNWALE.under)));
    const m1 = Float64Array.from(raw, (_, k) => med(raw, k, 4));
    return Float64Array.from(m1, (v, k) => (Number.isNaN(v) ? v : mean(m1, k, 2)));
  });
  return { gy, gw, side };
})();
const lerpAt = (arr, f) => {
  const i = Math.max(0, Math.min(arr.length - 2, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
  const a = arr[i], b = arr[i + 1];
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return a * (1 - u) + b * u;
};
/** Her gunwale at z: how high her deck edge is, and how far out each side (starboard, port). */
const gunwaleAt = (z) => {
  const f = (z - GUNWALE.z0) / GUNWALE.dz;
  const halves = [lerpAt(gunwale.gw[0], f), lerpAt(gunwale.gw[1], f)];
  return { y: lerpAt(gunwale.gy, f), halves, half: Math.min(...halves) };
};
// Where she ends, as her gunwale has her: her stern and her stem head -- the
// last stations at which she has a side half a metre under her deck edge
// that is more than a hand out from her middle, before any smoothing.
const ENDS = (() => {
  let a = -Infinity, b = Infinity;
  const at = (map, y) => {
    const key = Math.round(y / GUNWALE.step);
    for (const d of [0, -1, 1]) if (map.has(key + d)) return map.get(key + d);
    return 0;
  };
  for (let k = 0; k < GUNWALE.n; k++) {
    const y = gunwale.gy[k];
    if (Number.isNaN(y) || !(Math.min(at(gunwale.side[0][k], y - 0.5), at(gunwale.side[1][k], y - 0.5)) > 0.3)) continue;
    const z = GUNWALE.z0 + k * GUNWALE.dz;
    if (a === -Infinity) a = z;
    b = z;
  }
  return [a, b];
})();
console.log(`her gunwale: from ${ENDS[0]} to ${ENDS[1]} m; `
  + [-120, -100, -60, -20, 0, 20, 60, 90, 110, 122].map((z) => {
    const g = gunwaleAt(z);
    return `${z}:${g.y.toFixed(2)}/${g.halves.map((h) => h.toFixed(2)).join('|')}`;
  }).join(' '));

// ---- her screws -------------------------------------------------------------------
// Three shafts, the centre one ending abaft the wing pair. The sculpt drew a
// screw on the end of each; it is cut off, and scharnhorst.js draws a
// three-bladed screw there that turns.
export const SCREWS = [
  { x: 0, y: -6.2, z: -98.3, r: 2.0 },
  { x: -5.2, y: -5.3, z: -97.0, r: 1.9 },
  { x: 5.2, y: -5.3, z: -97.0, r: 1.9 },
];
for (const s of SCREWS) {
  const r = boxCut(m, { x0: s.x - s.r - 0.4, x1: s.x + s.r + 0.4, y0: s.y - s.r - 0.4, y1: s.y + s.r + 0.4, z0: s.z - 0.8, z1: s.z + 0.8 },
    { rescue: true });
  console.log(`screw at ${s.x}, ${s.z}: ${r.cut} triangles cut, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
}
dropLoose(m, { maxArea: 3, maxDiag: 4 });

// ---- her topsides, drawn afresh ------------------------------------------------------
// Over her waterline the sculpt melted: her hawse pipes and the anchors in
// them are lumps and pits on her bow, her stern quarters are folded over on
// themselves, and everything that stood on her deck edge -- boats, booms,
// rails -- came down her side in drips. Under her waterline she is clean. So
// she is cut level `CUT` over her waterline, and her side from there up to
// her gunwale is drawn afresh off her own sections, faired: at every station
// and height, the median of how far out she is over four metres either way
// along her -- which a lump or a pit a few metres long does not move, and her
// lines, her flare, her belt and her tumblehome run straight through -- and a
// running mean over a metre to take the grain off it. Toward her ends the
// window closes in evenly, so her stem and her stern are where the sculpt has
// them and not where a window half off her end would put them.
//
// Her new side is lofted in rows round her, each from her stern on her
// centreline forward along her starboard side to her stem and back along her
// port side: the first row is the rim the cut left in her, point for point,
// so it is joined to what is under it without a seam; the next is the top of
// her boot topping, level; and the rest are spaced up to her gunwale, the
// last of them her deck edge. Each row is laid round her by arc length in the
// same proportions as the first, so a point of one row is above its fellow in
// the row under it all the way round. Her deck is laid across the last row
// from side to side, on the same points -- she is closed, and there is no
// edge anywhere in her that the sea can be seen through.
const CUT = 0.5, BOOT_TOP = 0.9, ROWS = 9;
const FAIR = { r: 8, mean: 2 };
const KEY = (y) => Math.round(y / GUNWALE.step);
/** Her faired half-breadth on side `s` (0 starboard, 1 port) at station `k` and height key `key`. */
const fairHB = (() => {
  const { side } = gunwale;
  const cache = new Map();
  const has = (s, k, key) => k >= 0 && k < GUNWALE.n && side[s][k].has(key);
  const median = (s, k, key) => {
    if (!has(s, k, key)) return NaN;
    let lo = k, hi = k;
    while (has(s, lo - 1, key) && k - lo < FAIR.r) lo--;
    while (has(s, hi + 1, key) && hi - k < FAIR.r) hi++;
    const r = Math.min(k - lo, hi - k);
    const v = [];
    for (let d = -r; d <= r; d++) v.push(side[s][k + d].get(key));
    v.sort((p, q) => p - q);
    return v[v.length >> 1];
  };
  return (s, k, key) => {
    const id = (s * GUNWALE.n + k) * 4096 + key + 2048;
    if (cache.has(id)) return cache.get(id);
    if (!has(s, k, key)) { cache.set(id, NaN); return NaN; }
    let lo = k, hi = k;
    while (has(s, lo - 1, key) && k - lo < FAIR.mean) lo--;
    while (has(s, hi + 1, key) && hi - k < FAIR.mean) hi++;
    const r = Math.min(k - lo, hi - k);
    let sum = 0, n = 0;
    for (let d = -r; d <= r; d++) { const v = median(s, k + d, key); if (!Number.isNaN(v)) { sum += v; n++; } }
    const out = n ? sum / n : NaN;
    cache.set(id, out);
    return out;
  };
})();
/** Her faired half-breadth on side `s`, at station `k` and any height: between the quarter metres. */
const fairAtY = (s, k, y) => {
  const f = y / GUNWALE.step, a = Math.floor(f), u = f - a;
  const va = fairHB(s, k, a), vb = fairHB(s, k, a + 1);
  if (Number.isNaN(va)) return u > 0.5 ? vb : NaN;
  if (Number.isNaN(vb)) return u < 0.5 ? va : NaN;
  return va * (1 - u) + vb * u;
};
{
  // ---- cut her level ----
  const { P, N, T, C } = m;
  const made = new Map();
  const side = (v) => P[v * 3 + 1] - CUT;
  const cross = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (made.has(k)) return made.get(k);
    const f = (CUT - P[a * 3 + 1]) / (P[b * 3 + 1] - P[a * 3 + 1]);
    P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * f, CUT, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * f);
    N.push(N[a * 3], N[a * 3 + 1], N[a * 3 + 2]);
    const w = P.length / 3 - 1;
    made.set(k, w);
    return w;
  };
  const T2 = [], C2 = [];
  for (let t = 0; t < T.length / 3; t++) {
    const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
    const sd = v.map(side);
    if (sd.every((d) => d <= 1e-7)) { T2.push(...v); C2.push(C[t]); continue; }
    if (sd.every((d) => d >= -1e-7)) continue;
    const below = [];
    for (let j = 0; j < 3; j++) {
      const a = v[j], b = v[(j + 1) % 3], da = sd[j], db = sd[(j + 1) % 3];
      if (da <= 1e-7) below.push(a);
      if ((da < -1e-7 && db > 1e-7) || (da > 1e-7 && db < -1e-7)) below.push(cross(a, b));
    }
    for (let j = 1; j + 1 < below.length; j++) { T2.push(below[0], below[j], below[j + 1]); C2.push(C[t]); }
  }
  m.T = T2; m.C = C2;
  // ---- the rim the cut left, as one loop ----
  const pos = (v) => `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
  const onCut = (v) => Math.abs(P[v * 3 + 1] - CUT) < 1e-6;
  const edges = new Map();
  for (let t = 0; t < m.T.length; t += 3) {
    for (let j = 0; j < 3; j++) {
      const a = m.T[t + j], b = m.T[t + (j + 1) % 3];
      if (!onCut(a) || !onCut(b)) continue;
      const ka = pos(a), kb = pos(b);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edges.get(k) || { n: 0, a, b };
      e.n++;
      edges.set(k, e);
    }
  }
  const next = new Map();
  const vOf = new Map();
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    const ka = pos(e.a), kb = pos(e.b);
    vOf.set(ka, e.a); vOf.set(kb, e.b);
    if (!next.has(ka)) next.set(ka, []);
    if (!next.has(kb)) next.set(kb, []);
    next.get(ka).push(kb); next.get(kb).push(ka);
  }
  const seen = new Set();
  let rim = [];
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const loop = [k0];
    seen.add(k0);
    let prev = null, cur = k0;
    for (;;) {
      const nb = next.get(cur).filter((q) => q !== prev && !seen.has(q));
      if (!nb.length) break;
      prev = cur; cur = nb[0];
      seen.add(cur); loop.push(cur);
    }
    if (loop.length > rim.length) rim = loop;
  }
  rim = rim.map((k) => vOf.get(k));
  // From her stern on her centreline, forward along her starboard side.
  let i0 = 0;
  for (let i = 1; i < rim.length; i++) if (P[rim[i] * 3 + 2] < P[rim[i0] * 3 + 2]) i0 = i;
  rim = [...rim.slice(i0), ...rim.slice(0, i0)];
  const quarter = rim[Math.floor(rim.length / 4)];
  if (P[quarter * 3] > 0) rim = [rim[0], ...rim.slice(1).reverse()];
  const arc = (pts) => {
    const out = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      out.push(out[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    return out;
  };
  const rimXZ = rim.map((v) => [P[v * 3], P[v * 3 + 2]]);
  const rimArc = arc(rimXZ);
  const frac = rimArc.slice(0, rim.length).map((d) => d / rimArc[rim.length]);
  console.log(`cut level ${CUT} m over her waterline: her rim is ${rim.length} points round her, `
    + `${rimArc[rim.length].toFixed(0)} m, from ${Math.min(...rimXZ.map((q) => q[1])).toFixed(1)} to `
    + `${Math.max(...rimXZ.map((q) => q[1])).toFixed(1)} m`);

  // ---- a row of her side, round her, at height y(z) ----
  // Her stations, a point either side at each, and a point on her centreline
  // closing each end a little past her last station: rounded at her stern,
  // fine at her stem. Returns the vertices, and which are which.
  const rowAt = (yOf) => {
    const stb = [], prt = [];
    // Each side read at every station she has, and a station that reads
    // nothing at that height between two that do takes the line between them
    // -- a station is never left out of one row and kept in the next, which
    // creases her side.
    const ks = [], ws = [[], []];
    for (let k = 0; k < GUNWALE.n; k++) {
      const z = GUNWALE.z0 + k * GUNWALE.dz;
      const g = gunwaleAt(z);
      if (Number.isNaN(g.y) || z < ENDS[0] - 1 || z > ENDS[1] + 1) continue;
      // Read no higher than a hand under her deck edge: at her deck itself
      // the sculpt's deck is holed wherever a turret or a deckhouse stood,
      // and what is read there is the stump of it, not her side.
      const y = Math.min(yOf(z, g.y), g.y - GUNWALE.under);
      ks.push(k);
      for (const sd of [0, 1]) { const v = fairAtY(sd, k, y); ws[sd].push(Number.isNaN(v) || v < 0.05 ? NaN : v); }
    }
    const good = ks.map((_, i) => !Number.isNaN(ws[0][i]) && !Number.isNaN(ws[1][i]));
    const first = good.indexOf(true), last = good.lastIndexOf(true);
    for (const sd of [0, 1]) {
      for (let i = first; i <= last; i++) {
        if (!Number.isNaN(ws[sd][i])) continue;
        let a = i - 1, b = i + 1;
        while (Number.isNaN(ws[sd][a])) a--;
        while (Number.isNaN(ws[sd][b])) b++;
        ws[sd][i] = ws[sd][a] + (ws[sd][b] - ws[sd][a]) * (i - a) / (b - a);
      }
    }
    // And run smooth along her over a metre and a half either way, closing in
    // evenly toward her ends.
    for (const sd of [0, 1]) {
      const raw = ws[sd].slice();
      for (let i = first; i <= last; i++) {
        const r = Math.min(3, i - first, last - i);
        let sum = 0;
        for (let d = -r; d <= r; d++) sum += raw[i + d];
        ws[sd][i] = sum / (2 * r + 1);
      }
    }
    for (let i = first; i <= last; i++) {
      const z = GUNWALE.z0 + ks[i] * GUNWALE.dz, y = yOf(z, gunwaleAt(z).y);
      const add = (x) => { P.push(x, y, z); N.push(Math.sign(x), 0, 0); return P.length / 3 - 1; };
      stb.push(add(-ws[0][i])); prt.push(add(ws[1][i]));
    }
    const end = (i, k) => {
      const z = P[stb[i] * 3 + 2], w = (Math.abs(P[stb[i] * 3]) + P[prt[i] * 3]) / 2;
      const zz = z + k * w;
      P.push(0, yOf(zz, gunwaleAt(zz).y), zz); N.push(0, 0, Math.sign(k));
      return P.length / 3 - 1;
    };
    const stern = end(0, -0.55), stem = end(stb.length - 1, 0.25);
    return { loop: [stern, ...stb, stem, ...prt.slice().reverse()], stb, prt, stern, stem };
  };
  const xz = (v) => [P[v * 3], P[v * 3 + 2]];
  const fracs = (loop) => {
    const d = arc(loop.map(xz));
    return d.map((v) => v / d[loop.length]);
  };
  /** Stitch two closed rows, both from her stern round by starboard, by arc length. */
  const zip = (a, b, paint) => {
    const fa = fracs(a), fb = fracs(b);
    let i = 0, j = 0, n = 0;
    while (i < a.length || j < b.length) {
      const ta = fa[i + 1], tb = fb[j + 1];
      const tri = ta <= tb ? [a[i % a.length], a[(i + 1) % a.length], b[j % b.length]]
        : [a[i % a.length], b[(j + 1) % b.length], b[j % b.length]];
      if (ta <= tb) i++; else j++;
      // Facing out of her: away from her centreline, or off her end.
      const [cx, , cz] = middle({ P, T: tri }, 0);
      const [nx, , nz] = faceNormal(m, ...tri);
      const ox = cx, oz = Math.abs(cz) > 100 ? cz - Math.sign(cz) * 100 : 0;
      m.T.push(...(nx * ox + nz * oz >= 0 ? tri : [tri[0], tri[2], tri[1]]));
      m.C.push(paint);
      n++;
    }
    return n;
  };
  const rows = [{ loop: rim }];
  for (let j = 1; j <= ROWS; j++) {
    rows.push(rowAt(j === 1 ? () => BOOT_TOP : (z, gy) => BOOT_TOP + (gy - BOOT_TOP) * (j - 1) / (ROWS - 1)));
  }
  let sideTris = 0;
  for (let j = 0; j < ROWS; j++) sideTris += zip(rows[j].loop, rows[j + 1].loop, j === 0 ? 3 : GREY);

  // ---- her deck, across her top row ----
  // A row across her at each of her stations, from her starboard gunwale to
  // her port one through points no more than two metres apart, each stitched
  // to the next; and a fan from each end of her into the first and last.
  const top = rows[ROWS];
  const across = top.stb.map((sv, i) => {
    const pv = top.prt[i];
    const xa = P[sv * 3], xb = P[pv * 3], y = P[sv * 3 + 1], z = P[sv * 3 + 2];
    const n = Math.max(1, Math.ceil((xb - xa) / 2.0));
    const row = [sv];
    for (let k = 1; k < n; k++) { P.push(xa + (xb - xa) * k / n, y, z); N.push(0, 1, 0); row.push(P.length / 3 - 1); }
    row.push(pv);
    return row;
  });
  let deckTris = 0;
  const up = (tri) => {
    const [, ny] = faceNormal(m, ...tri);
    m.T.push(...(ny < 0 ? [tri[0], tri[2], tri[1]] : tri));
    m.C.push(DECK);
    deckTris++;
  };
  for (let i = 0; i + 1 < across.length; i++) {
    const a = across[i], b = across[i + 1];
    let p = 0, q = 0;
    while (p < a.length - 1 || q < b.length - 1) {
      const xa = p < a.length - 1 ? P[a[p + 1] * 3] : Infinity;
      const xb = q < b.length - 1 ? P[b[q + 1] * 3] : Infinity;
      if (xa <= xb) { up([a[p], a[p + 1], b[q]]); p++; } else { up([a[p], b[q + 1], b[q]]); q++; }
    }
  }
  for (const [tip, row] of [[top.stern, across[0]], [top.stem, across[across.length - 1]]]) {
    for (let k = 0; k + 1 < row.length; k++) up([tip, row[k], row[k + 1]]);
  }
  console.log(`her topsides: drawn afresh in ${ROWS} rows over her rim of ${rim.length}, ${sideTris} triangles; `
    + `her deck laid across them at ${across.length} stations, ${deckTris} triangles`);
}

// ---- her two superstructures ----------------------------------------------------
// Each as its own sculpt drew it, put on her by the transform that lays it
// over the low, soft superstructure the sculpt of her hull drew for her (found
// by matching the two height for height, plan for plan): `s` is how many units
// of her hull's sculpt one of its own is, `dx` where its origin falls along
// her hull's sculpt, and `deck` the level it was taken off its own deck at,
// which is stood on hers amidships a hand deep. The after one was sculpted
// bow to +X, and is turned end for end.
//
//   fore   her conning tower, bridge, tower mast and foretop, her funnel and
//          the platforms, boats and searchlights round them, from abaft
//          Bruno's barbette to abaft her funnel
//   aft    from abaft her funnel to forward of Caesar: her cranes, her hangar,
//          her mainmast, her after superstructure and after control position
export const FORE = { s: 0.455, dx: -0.214, deck: -0.145, turn: 1 };
export const AFT = { s: 0.73, dx: 0.196, deck: -0.1885, turn: -1 };
const SINK = 0.15;
const DECK_AMIDSHIPS = gunwaleAt(0).y;
function superstructure(file, f) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  const a = f.turn * f.s * SECTION, b = f.s * SECTION, c = -f.turn * f.s * UNIT;
  for (let i = 0; i < raw.pos.length; i += 3) {
    const hx = f.turn * f.s * raw.pos[i] + f.dx;
    P.push(a * raw.pos[i + 2], DECK_AMIDSHIPS - SINK + (raw.pos[i + 1] - f.deck) * b, -(hx - FRAME.xc) * UNIT);
    const nx = raw.nrm[i + 2] / a, ny = raw.nrm[i + 1] / b, nz = raw.nrm[i] / c;
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
  }
  const T = Array.from(raw.idx);
  const sup = { P, N, T, C: new Array(T.length / 3).fill(SUPER_GREY) };
  fixWinding(sup);
  // Nothing of it out past her side: the rails and the plating of its own
  // deck's edge, sculpted narrower than hers, stay with its sculpt.
  const inside = subMesh(sup, (t) => {
    const [cx, , cz] = middle(sup, t);
    const g = gunwaleAt(cz);
    return !Number.isNaN(g.half) && Math.abs(cx) < g.half - 0.3;
  });
  const { lo, hi } = bbox(inside);
  console.log(`${file}: ${inside.T.length / 3} triangles, from ${lo[2].toFixed(1)} to ${hi[2].toFixed(1)} m along her, `
    + `${lo[0].toFixed(1)} to ${hi[0].toFixed(1)} across, ${hi[1].toFixed(1)} m up`);
  return inside;
}
const FORE_SUP = superstructure('scharnhorst-fore.glb', FORE);
const AFT_SUP = superstructure('scharnhorst-aft.glb', AFT);


// ---- her guns: where each stands ---------------------------------------------------
// Three triple 28 cm turrets: Anton and Bruno forward, Bruno superfiring over
// Anton, and Caesar aft on her quarterdeck. `seat` is the top of the barbette
// each trains on, over her waterline; the barbettes themselves are
// scharnhorst.js's.
export const TURRETS = [
  { name: 'Anton', z: 59.5, rest: 0, over: 0.8 },
  { name: 'Bruno', z: 41.9, rest: 0, over: 3.75 },
  { name: 'Caesar', z: -68.5, rest: Math.PI, over: 0.8 },
].map(({ over, ...t }) => ({ ...t, x: 0, seat: +(gunwaleAt(t.z).y + over).toFixed(3) }));

// Her four 15 cm twin turrets on her upper deck, one either side abreast her
// bridge and one either side abreast her mainmast, each on a short barbette of
// its own; and her four 15 cm singles in their shields at her deck edge between
// them, either side of the 10.5 cm abreast her funnel -- as her plans of 1943
// have them.
const sides = (list, seat) => list.flatMap((d) => [-1, 1].map((sgn) => ({
  name: `${d.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * d.x, z: d.z, rest: sgn * Math.PI / 2,
  seat: +(gunwaleAt(d.z).y + seat).toFixed(3),
})));
export const SECONDARY = sides([{ name: 'S1', x: 9.5, z: 17.1 }, { name: 'S4', x: 8.8, z: -35.6 }], 0.7);
export const SINGLES = sides([{ name: 'S2', x: 12.4, z: 2.5 }, { name: 'S3', x: 12.4, z: -8.1 }], 0.25);

// What the two superstructure sculpts carried that is not theirs to keep, and
// stands where a gun of hers that trains goes: cut out down to the floor it
// stood on and up past its top, and closed over. The after sculpt's own after
// 15 cm turrets, abreast her mainmast where hers stand; what the two sculpts
// stood on her upper deck either side of her funnel, from her bridge to her
// cranes, where her 10.5 cm and her 15 cm singles stand; and the 10.5 cm on the
// after end of her after superstructure.
const box = (x0, x1, z0, z1, y0, y1) => ({ x0, x1, z0, z1, y0, y1 });
const both = (b) => [b, { ...b, x0: -b.x1, x1: -b.x0 }];
export const CUTS = [
  ...both(box(4.9, 11.0, -44.6, -30.6, 4.35, 10.5)),
  ...both(box(7.1, 14.5, -16.0, -10.3, 4.3, 8.4)),
  ...both(box(7.1, 14.5, -10.3, 4.9, 4.3, 8.4)),
  ...both(box(7.1, 14.5, 4.9, 11.9, 4.3, 8.2)),
  box(-4.0, 4.0, -59.6, -50.4, 6.02, 9.5),
];
// The point of her conning tower, and how far out either side of it the
// house it stands on goes: nothing of the forward sculpt stands forward of it
// but the cut ends of the fittings its own deck carried abaft Bruno.
export const CONNING_TOWER = { tip: 31.55, half: 4.6 };
// The light guns that stand where those were, on the floor of the tub or
// platform each stood on (`deck`), which the cut goes from a hand over.
export const SCULPTED_LIGHT = [
  { name: '3.7 bridge', x: 4.6, z: 18.8, r: 1.4, deck: 9.8 },
  { name: '3.7 funnel', x: 3.3, z: 3.6, r: 1.6, deck: 10.9 },
  { name: '3.7 after', x: 3.0, z: -40.1, r: 1.3, deck: 8.8 },
].flatMap((l) => [-1, 1].map((sgn) => ({ ...l, name: `${l.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * l.x })));
// Her 10.5 cm twins, seven of them as her plans of 1943 have them: three either
// side -- on a round platform abreast her bridge (`tub`, its height over her
// deck), on her deck edge abreast her funnel between her 15 cm singles, and on
// a round platform abaft her funnel by her cranes -- and one on the after end
// of her after superstructure, trained aft over Caesar.
export const FLAK = [
  ...[{ name: '10.5 I', x: 10.8, z: 8.1, tub: 0.6 }, { name: '10.5 II', x: 11.9, z: -2.7 },
    { name: '10.5 III', x: 10.8, z: -13.0, tub: 0.6 }].flatMap((d) => [-1, 1].map((sgn) => ({
    ...d, name: `${d.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * d.x, rest: sgn * Math.PI / 2,
  }))),
  { name: '10.5 aft', x: 0, z: -54.2, rest: Math.PI, floor: 5.92 },
];

/** Take out every triangle of `mesh` with a corner in the box; returns how many. */
function dropBox(mesh, b) {
  const keep = new Uint8Array(mesh.T.length / 3).fill(1);
  let n = 0;
  for (let t = 0; t < keep.length; t++) {
    for (let j = 0; j < 3; j++) {
      const v = mesh.T[t * 3 + j] * 3;
      const x = mesh.P[v], y = mesh.P[v + 1], z = mesh.P[v + 2];
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) { keep[t] = 0; n++; break; }
    }
  }
  const out = subMesh(mesh, (t) => keep[t]);
  mesh.P = out.P; mesh.N = out.N; mesh.T = out.T; mesh.C = out.C;
  return n;
}

// ---- smooth them, cut her guns out of them, and close them -------------------------
// Each superstructure is smoothed first: its sculpt drew its houses and its
// funnel with drips down them and dents in them, and the decimation left a
// grain on its flats. The dents, the drips and the grain are taken out of
// every face of it that is nearly flat, and the corners and the creases
// between them left where they are, so a wall is flat and an edge is still an
// edge. Then what stands where a gun of hers trains is cut out of it (CUTS),
// and every hole in
// it -- left by the cuts, by the wires taken off it, or by the decimation where
// two of its plates met at a hair's angle -- is closed in its own plane.
for (const [name, sup] of [['fore', FORE_SUP], ['aft', AFT_SUP]]) {
  {
    const canon = weld(sup);
    const d = denoise(sup, canon, { sigmaS: 0.6, sigmaR: 0.3, normalIters: 8, vertexIters: 20, max: 0.25 });
    const f = smoothFlats(sup, canon, { passes: 10, max: 0.2, flat: 22 });
    console.log(`${name}: smoothed ${d && d.movedMax !== undefined ? d.movedMax.toFixed(2) : '?'} m by its faces, `
      + `${f.movedMax.toFixed(2)} m on its flats`);
  }
  let n = 0;
  for (const b of CUTS) n += dropBox(sup, b);
  for (const l of SCULPTED_LIGHT) {
    n += dropBox(sup, { x0: l.x - l.r, x1: l.x + l.r, z0: l.z - l.r, z1: l.z + l.r, y0: l.deck + 0.12, y1: l.deck + 3.2 });
  }
  dropLoose(sup, { maxArea: 0.4, maxDiag: 1.2 });
  // The forward one was taken off its sculpt across the stumps of what stood
  // on its deck abaft Bruno: what is left of them, low down in front of her
  // conning tower, is cut ends and nothing else.
  if (name === 'fore') {
    const low = DECK_AMIDSHIPS + 2.8;
    n += dropBox(sup, box(-20, 20, CONNING_TOWER.tip, 40, -20, 99));
    for (const b of both(box(CONNING_TOWER.half, 20, CONNING_TOWER.tip - 3.3, CONNING_TOWER.tip, -20, low))) n += dropBox(sup, b);
  }
  const s = closeHoles(sup, new Uint8Array(sup.T.length / 3).fill(1), () => null, { open: true });
  console.log(`${name}: ${n} triangles of her guns cut out; holes closed: ${s.loops} (${s.capped} triangles, ${s.fanned} fanned)`);
  sup.C = new Array(sup.T.length / 3).fill(SUPER_GREY);
  append(m, sup);
}
// Where each gun stands that was cut out of them: on the floor its sculpt
// stood it on.
for (const f of FLAK) f.seat = +(f.floor ?? gunwaleAt(f.z).y + (f.tub || 0)).toFixed(3);
recomputeNormals(m);
console.log(`faces facing in: ${turnInward(m)} turned`);

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const paintOf = new Float32Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOf[m.T[t * 3 + j]] = m.C[t];
  writeGlb(process.env.DUMP, { P: m.P, N: m.N, T: m.T, paint: paintOf }, 'dump');
  if (process.env.STAGE === 'dump') process.exit(0);
}

// ---- her decks -------------------------------------------------------------------
// Her upper deck is teak from stem to stern (laid above); her superstructure's
// decks, platforms and flats are steel, the dark grey of a deck that is
// walked on; and its walls the light grey she wore in May 1941, when the
// stripes she had carried in the Baltic had been painted out.
{
  const { P, T, C } = m;
  let steel = 0;
  for (let t = 0; t < T.length / 3; t++) {
    if (C[t] !== SUPER_GREY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const [, cy] = middle(m, t);
    if (ny > 0.8 * Math.hypot(nx, ny, nz) && cy > DECK_AMIDSHIPS + 0.3) { C[t] = STEEL; steel++; } else C[t] = GREY;
  }
  console.log(`decks: ${steel} faces of her superstructure's decks steel`);
}

// ---- split her normals at her creases --------------------------------------------
let canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: DECK_AMIDSHIPS - 0.2, edgeCap: 10.0, slice: true, beamFloor: 0 });
recomputeNormals(m);
canon = weld(m);
const thin = thinFaces(m, 0.5);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: -4.0, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -16, z0: -118, step: 0.5, nx: 65, nz: 473 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// Light grey, teak, the dark grey of her steel decks, her black boot topping
// and her red bottom.
const PALETTE = [
  [0x9a, 0x9f, 0xa3],
  [0x9a, 0x8f, 0x74],
  [0x5a, 0x60, 0x66],
  [0x1a, 0x1c, 0x1f],
  [0x7a, 0x38, 0x2e],
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
/** Its roof and every flat of it over `over` steel deck, the rest grey. */
function roofed(mesh, over) {
  mesh.C = [];
  for (let t = 0; t < mesh.T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(mesh, mesh.T[t * 3], mesh.T[t * 3 + 1], mesh.T[t * 3 + 2]);
    let cy = 0;
    for (let j = 0; j < 3; j++) cy += mesh.P[mesh.T[t * 3 + j] * 3 + 1] / 3;
    mesh.C.push(ny > 0.85 * Math.hypot(nx, ny, nz) && cy > over ? STEEL : GREY);
  }
  return mesh;
}

// ---- her guns, as the owner sculpted them ------------------------------------------
// Each is put in the frame of its mounting: the pivot at the origin, the foot
// of what trains at y = 0, the bore along +z. Its barrels are lifted off it
// and go on the cradle, about trunnions a little inside the face; what is
// left -- the gunhouse, the shield -- trains. A barrel sculpted laid up at
// `elev` is turned down level about its trunnion, so the cradle lays it.
//
//   file      the decimated sculpt (see build/scharnhorst-source.mjs)
//   scale     metres a unit of the sculpt
//   pivot     [x, z] of the pivot, in the sculpt; its barrels point -x
//   foot      the sculpt's y of the foot: everything under it is dropped
//   face      how far ahead of the pivot the barrels come out (sculpt units)
//   lanes     where across each barrel runs; barrelY its height at the face;
//             r how far out from its axis a barrel's skin is
//   trunnionIn  how far inside the face the trunnions are
//   clear     { r, y }: anything of the sculpt further than `r` from the pivot
//             and lower than `y` is the deck it was sculpted on, not the gun
function gunPiece(file, { scale, pivot, foot, face, lanes, barrelY, r, trunnionIn = 0.08, elev = 0, roofOver = 99,
  clear = null }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push((raw.pos[i + 2] - pivot[1]) * scale, (raw.pos[i + 1] - foot) * scale, -(raw.pos[i] - pivot[0]) * scale);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const mesh = { P, N, T: Array.from(raw.idx) };
  fixWinding(mesh);
  const faceZ = face * scale, yB = (barrelY - foot) * scale, rB = r * scale;
  const tz = faceZ - trunnionIn * scale;
  const tan = Math.tan(elev);
  // A point's distance from a barrel's axis, which runs from the trunnion out
  // along +z, rising at `elev`.
  const offAxis = (x, y, z, lane) => {
    const along = (z - tz) * Math.cos(elev) + (y - yB) * Math.sin(elev);
    const ay = yB + along * Math.sin(elev), az = tz + along * Math.cos(elev);
    return Math.hypot(x - lane * scale, y - ay, z - az);
  };
  const isBarrel = (t) => {
    const [x, y, z] = middle(mesh, t);
    return z > faceZ && lanes.some((l) => offAxis(x, y, z, l) < rB);
  };
  const above = (t) => {
    for (let j = 0; j < 3; j++) if (mesh.P[mesh.T[t * 3 + j] * 3 + 1] < -1e-3) return false;
    return true;
  };
  const onDeck = (t) => {
    if (!clear) return false;
    const [x, y, z] = middle(mesh, t);
    return y < clear.y && Math.hypot(x, z) > clear.r;
  };
  const house = roofed(subMesh(mesh, (t) => above(t) && !isBarrel(t) && !onDeck(t)), roofOver);
  dropLoose(house, { maxArea: 0.05 * scale * scale, maxDiag: 0.15 * scale });
  creased(house, 40);
  const guns = subMesh(mesh, (t) => isBarrel(t));
  // Into the frame of the cradle -- origin on the trunnions, bore along +z --
  // and turned down level if it was sculpted laid up.
  const c = Math.cos(elev), s2 = Math.sin(elev);
  for (let i = 0; i < guns.P.length; i += 3) {
    const y = guns.P[i + 1] - yB, z = guns.P[i + 2] - tz;
    guns.P[i + 1] = y * c - z * s2; guns.P[i + 2] = y * s2 + z * c;
    const ny = guns.N[i + 1], nz = guns.N[i + 2];
    guns.N[i + 1] = ny * c - nz * s2; guns.N[i + 2] = ny * s2 + nz * c;
  }
  if (guns.T.length) creased(guns, 40);
  let tip = 0;
  for (let i = 2; i < guns.P.length; i += 3) tip = Math.max(tip, guns.P[i]);
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const muzzles = lanes.map((l) => [+(l * scale).toFixed(3), 0, +tip.toFixed(3)]);
  console.log(`${file}: house ${house.T.length / 3} triangles, roof ${roof.toFixed(2)} m; barrels ${guns.T.length / 3} `
    + `triangles, trunnion ${yB.toFixed(2)} m up and ${tz.toFixed(2)} m ahead, ${tip.toFixed(2)} m to the muzzle`);
  return { house, guns, trunnion: [0, +yB.toFixed(3), +tz.toFixed(3)], muzzles, roof: +roof.toFixed(3) };
}
// The 28 cm triple, Drh LC/34: 10.8 m a unit, which makes its gunhouse twelve
// metres long and ten and a half across and the ring of its skirt as wide as
// her barbettes. It trains on its barbette with that ring; its three barrels
// are lifted off it at its face.
const MAIN = gunPiece('scharnhorst-28.glb', {
  scale: 10.8, pivot: [0.306, 0], foot: -0.195, face: 0.50, lanes: [-0.283, 0, 0.283],
  barrelY: 0.019, r: 0.095, trunnionIn: 0.11, roofOver: 3.0,
});
// The 15 cm single, MPL C/35, in its shield: 5.8 m a unit, which makes its
// shield three metres across and its barrel six and a half metres out of it --
// and its muzzle as far out from its pivot, near enough, as her 15 cm twin's.
// What trains is from the foot of its pedestal.
const SINGLE = gunPiece('scharnhorst-15.glb', {
  scale: 5.8, pivot: [0.406, 0], foot: -0.32, face: 0.29, lanes: [0],
  barrelY: 0.101, r: 0.07, trunnionIn: 0.08, roofOver: 1.5,
});

// ---- her lines, as the sculpt has them --------------------------------------------
const LINES = measureLines(m, st, { z0: -116.9963, dz: 1, nz: 235, y0: -10, dy: 0.5, ny: 40 }, DECK_AMIDSHIPS);

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
const mounts = {
  turrets: TURRETS.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat })),
  secondary: SECONDARY.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat })),
  singles: SINGLES.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat })),
  flak: FLAK.map(({ name, x, z, rest, seat, tub }) => ({ name, x, z, rest: +rest.toFixed(6), seat, ...(tub ? { tub } : {}) })),
  sculptedLight: SCULPTED_LIGHT.map(({ name, x, z, deck }) => ({ name, x, z, deck })),
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-scharnhorst-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const SCHARNHORST_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see scharnhorstSurfaceY.\n`
  + `export const SCHARNHORST_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 28 cm turret and her 15 cm single, as the owner sculpted them, each in\n`
  + `// the frame of its mounting.\n`
  + `export const SCHARNHORST_GUNS = ${JSON.stringify({ main: piece(MAIN), single: piece(SINGLE) })};\n`
  + `// Where her turrets, her 15 cm and her 10.5 cm stand, and the floors of the\n`
  + `// tubs her light guns were cut out of.\n`
  + `export const SCHARNHORST_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her three screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const SCHARNHORST_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
