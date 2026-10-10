// Turn the owner's IJN Fuso sculpts into what client/js/render/fusoHull.js
// ships: her hull and deck, her superstructure and her bridge as one painted
// mesh, and her 35.6 cm turret, 15.2 cm gun, 12.7 cm twin and 25 mm triple as
// the owner sculpted them, cut so they train and elevate. In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a quarter turn, scaled to her 212.75 m, and floated at 9.7 m; her paint
//     (see build/fuso-source.mjs) rides along a triangle at a time;
//   * read her gunwale off her, a section every half metre: how high her deck
//     edge is and how far out, all the way from her stern to her stem head;
//   * take everything off her down to that line and lay her upper deck afresh
//     across it, flush with her gunwale and lapped a few centimetres down over
//     her side all round, so she is closed everywhere and no seam shows
//     daylight -- the sculpt's own deck is holed where hatches, skylights and
//     the well of her bridge stood;
//   * cut her four screws off their shafts (fuso.js draws four that turn);
//   * stand her superstructure on her deck as the sculpt of it drew it, from
//     her stern to her bridge, and her bridge in its place, cut round every
//     turret and every light gun it had cast in;
//   * paint her decks, fair her topsides, split her normals at every crease;
//   * read her surface off as a height map and her lines, which is what her
//     interior and armour are fitted under;
//   * take her turret and her guns off the owner's sculpts of them, each in
//     the frame of its mounting with its barrels on a cradle of their own;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file fusoHull.js decodes synchronously.
//
//   node build/prepare-fuso-hull.mjs
//
// Reads assets/models/fuso-*.glb (made by build/fuso-source.mjs), writes
// client/js/render/fusoHull.data.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, boxCut, components, closeHoles,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, boxUvs,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import { blank, box, prism, chamfered, lathe, tube, bar } from './fuso-parts.mjs';
import { subMesh, dropLoose, turnInward, thinFaces, creased, measureLines } from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/fusoHull.data.js');

const REAL_LOA = 212.75;
const DRAFT = 9.7;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern, and her keel, flat along the middle
// of her at -0.4700. She is floated at her 9.7 m draft. A unit of the sculpt
// is 116.3 m of her, and her bow is at +X (not -X, as the Bismarck's is): so
// she is turned a quarter the other way,
//
//   world_X = -(local_Z - zc) * SCALE      (her starboard side, +Z, is -X)
//   world_Y =  (local_Y - localKeel) * SCALE
//   world_Z =  (local_X - xc) * SCALE
const SCULPT = { x0: -0.9510, x1: 0.8785, z0: -0.14, z1: 0.14 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: 0, SCALE: UNIT, localKeel: -0.4700 + DRAFT / UNIT,
};

// Her paints, as build/fuso-source.mjs numbers them; and her superstructure's
// grey, which is grey that is left as its sculpt drew it -- not faired, not
// dropped for being small and apart -- until her decks are laid.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5, BRIDGE_GREY = 6;

/** The sculpt's own point `(lx, ly, lz)` in the game's frame, for a part at `s` metres a unit. */
const toWorld = (lx, ly, lz, f = FRAME) => [-(lz - f.zc) * f.SCALE, (ly - f.localKeel) * f.SCALE, (lx - f.xc) * f.SCALE];

/** A painted decimation of her, in the game's frame, with a paint a triangle. */
function load(file) {
  const raw = readGlb(file);
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...toWorld(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(-raw.nrm[i + 2], raw.nrm[i + 1], raw.nrm[i]);
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

const m = load(ASSET('fuso-hull.glb'));
const isSuper = (t) => m.C[t] === SUPER_GREY;
{
  const { lo, hi } = bbox(m);
  console.log('calibration: SCALE', FRAME.SCALE.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- her gunwale ------------------------------------------------------------------
// A section through her every half metre of her length: how far out her side
// is at every quarter metre of height, each side. Her gunwale is the top of
// her side -- walking up it from her waterline, the last height at which it
// is still her side and not something standing on her deck, which is
// anything less than `keep` of the breadth she has under it. (Amidships she
// tumbles home a metre over her belt and flares out again to her deck, so it
// is the breadth under it, not her widest, that a deckhouse is told apart
// from.) Each side is read on its own: the sculpt drew her a few centimetres
// broader to port than to starboard in places, and her deck is laid out to
// each side where it is.
const GUNWALE = { z0: -112, dz: 0.5, n: 449, keep: 0.85, step: 0.25, under: 0.2 };
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
      // Her blisters are under her waterline, and are not her side: what her
      // side is told from a deckhouse by is her breadth from the waterline up.
      if (y < 0) continue;
      if (top !== null && y > top + 0.6) break;
      if (w >= GUNWALE.keep * under) { under = Math.max(under, w); top = y; }
    }
    if (top !== null) ys[k] = top;
  }
  // Her sheer is fair: each station takes the median of five metres either
  // side of it, which takes out the odd station a lump on her side or a stump
  // on her deck read wrong; and the median of quarter-metre readings is a
  // staircase, which her sheer is not -- a running mean over seven metres
  // either way runs it up smooth.
  const gy0 = Float64Array.from(ys, (_, k) => med(ys, k, 10));
  const gy = Float64Array.from(gy0, (v, k) => (Number.isNaN(v) ? v : mean(gy0, k, 14)));
  // How far out each side is a hand under her deck edge -- under whatever
  // stood on her gunwale there, a sponson or a boom -- the median of two
  // metres either way, and run smooth over a metre.
  const at = (map, y) => {
    const key = Math.round(y / GUNWALE.step);
    for (const d of [0, -1, 1, -2]) if (map.has(key + d)) return map.get(key + d);
    return NaN;
  };
  const gw0 = [0, 1].map((s) => Float64Array.from(gy, (y, k) => (Number.isNaN(y) ? NaN : at(side[s][k], y - GUNWALE.under))));
  const both = Float64Array.from(gw0[0], (a, k) => {
    const b = gw0[1][k];
    if (Number.isNaN(a)) return b;
    if (Number.isNaN(b)) return a;
    return (a + b) / 2;
  });
  // The median of six metres either way and a running mean over three: her
  // deck edge in plan is a long fair curve, and the lumps in it are the sculpt's.
  const m1 = Float64Array.from(both, (_, k) => med(both, k, 12));
  const fairHalf = Float64Array.from(m1, (v, k) => (Number.isNaN(v) ? v : mean(m1, k, 6)));
  const gw = [fairHalf, fairHalf];
  return { gy, gw, side };
})();
const lerpAt = (arr, f) => {
  const i = Math.max(0, Math.min(arr.length - 2, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
  const a = arr[i], b = arr[i + 1];
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return a * (1 - u) + b * u;
};
// Her forecastle deck: the sculpt's hull stops at her upper deck, and over
// the middle of her, from abaft No.1 to before No.5, the kit and her plans
// have a deck more of hull -- her side carried straight up `h` and decked
// over, with her 15.2 cm in casemates in it. It rises in `ramp` at either end,
// one station: a step down to her upper deck that is a bulkhead across her.
export const LEVEL = { z0: -44.75, z1: 49.75, h: 2.5, ramp: 0.5 };
const raiseAt = (z) => {
  const c = (v) => Math.min(1, Math.max(0, v));
  const u = c((z - LEVEL.z0) / LEVEL.ramp) * c((LEVEL.z1 - z) / LEVEL.ramp);
  return LEVEL.h * u * u * (3 - 2 * u);
};
/**
 * Her gunwale at z: how high her deck edge is (`y`, her forecastle deck where
 * she has one; `y0`, the sculpt's upper deck), and how far out each side
 * (starboard, port).
 */
const gunwaleAt = (z) => {
  const f = (z - GUNWALE.z0) / GUNWALE.dz;
  const halves = [lerpAt(gunwale.gw[0], f), lerpAt(gunwale.gw[1], f)];
  const y0 = lerpAt(gunwale.gy, f);
  return { y: y0 + raiseAt(z), y0, halves, half: Math.min(...halves) };
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
// Four shafts, the wing pair abaft the inner pair's hubs. The sculpt drew the
// screw on the end of each as a lump on a shaft; it is cut off, and fuso.js
// draws a three-bladed one there that turns. Her inner shafts are 4.5 m apart
// and her wing shafts 13 m, the wing screws a metre higher than the inner.
export const SCREWS = [
  { x: -6.5, y: -6.83, z: -76.4, r: 2.3 },
  { x: 6.5, y: -6.83, z: -76.4, r: 2.3 },
  { x: -2.25, y: -7.85, z: -83.4, r: 2.3 },
  { x: 2.25, y: -7.85, z: -83.4, r: 2.3 },
];
for (const s of SCREWS) {
  const r = boxCut(m, { x0: s.x - 2.6, x1: s.x + 2.6, y0: s.y - 2.6, y1: s.y + 2.6, z0: s.z - 1.0, z1: s.z + 1.0 }, { rescue: true });
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
const CUT = 0.5, BOOT_TOP = 1.0, ROWS = 9;
const FAIR = { r: 14, mean: 4 };
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
  const one = (s, k, key) => {
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
  // She is drawn the same either side: the sculpt's sides differ from each
  // other by as much as a metre in places, which is the sculptor's hand and
  // not her lines, and shows as a ripple in her deck edge where each is
  // faired to its own.
  return (s, k, key) => {
    const a = one(0, k, key), b = one(1, k, key);
    if (Number.isNaN(a)) return b;
    if (Number.isNaN(b)) return a;
    return (a + b) / 2;
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
      // Over her upper deck, where her forecastle is carried up, her side goes straight up.
      const y = Math.min(yOf(z, g.y), g.y0 - GUNWALE.under);
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
      const ox = cx, oz = Math.abs(cz) > 80 ? cz - Math.sign(cz) * 80 : 0;
      m.T.push(...(nx * ox + nz * oz >= 0 ? tri : [tri[0], tri[2], tri[1]]));
      m.C.push(paint);
      n++;
    }
    return n;
  };
  const rows = [{ loop: rim }];
  for (let j = 1; j <= ROWS; j++) {
    // The rows under her upper deck stay where they are under her forecastle: the last of them
    // comes up to her upper deck's edge there, and the top row is her forecastle deck's.
    rows.push(rowAt(j === 1 ? () => BOOT_TOP : (z) => {
      const g = gunwaleAt(z);
      if (j === ROWS) return g.y;
      const gap = (g.y0 - BOOT_TOP) / (ROWS - 1);
      const under = g.y0 - gap * (1 - (g.y - g.y0) / LEVEL.h);
      return BOOT_TOP + (under - BOOT_TOP) * (j - 1) / (ROWS - 2);
    }));
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
    const [nx, ny, nz] = faceNormal(m, ...tri);
    m.T.push(...(ny < 0 ? [tri[0], tri[2], tri[1]] : tri));
    // The step at either end of her forecastle is a bulkhead, and plated.
    m.C.push(Math.abs(ny) < 0.6 * Math.hypot(nx, ny, nz) ? GREY : DECK);
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

// ---- her superstructure -----------------------------------------------------------
// As the sculpt of it drew it, whole and closed -- her mainmast tower, her
// funnel, the deckhouses between her turrets, her boats and cranes -- from
// her stern to her bridge, at 88 m a unit, which puts her mainmast, funnel and
// turrets within a couple of metres of where the hull sheet has them. Its
// funnel is at 0.15 of its own length and stood at -8 m on her; each point of
// it is put as high over her deck as it was over the slab's, and its feet go a
// metre and a hand into her deck, which is where build/fuso-source.mjs cut it
// off. What stands out past her side where she is narrow -- aft, where the
// slab is much the broader -- is not hers, and goes.
const DECK_AMIDSHIPS = gunwaleAt(0).y;
export const SUPER = { scale: 88, funnelX: 0.15, funnelZ: -8, flat: -0.1755, sink: 1.5, side: 0.4, aft: -80, low: 3.4 };
const superZ = (lx) => (lx - SUPER.funnelX) * SUPER.scale + SUPER.funnelZ;
{
  const raw = readGlb(ASSET('fuso-super.glb'));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    const z = superZ(raw.pos[i]);
    P.push(-raw.pos[i + 2] * SUPER.scale, (raw.pos[i + 1] - SUPER.flat) * SUPER.scale + gunwaleAt(z).y - SUPER.sink, z);
    N.push(-raw.nrm[i + 2], raw.nrm[i + 1], raw.nrm[i]);
  }
  const T = Array.from(raw.idx);
  let sup = { P, N, T, C: new Array(T.length / 3).fill(SUPER_GREY) };
  fixWinding(sup);
  // Inside her side.
  const inside = (t) => {
    const [cx, , cz] = middle(sup, t);
    if (cz < SUPER.aft) return false;
    const g = gunwaleAt(cz);
    return Number.isNaN(g.half) ? false : Math.abs(cx) < g.half - SUPER.side;
  };
  const before = sup.T.length / 3;
  sup = subMesh(sup, inside);
  // What stands no more than three metres over her deck on a piece of its own
  // is not a house: the leaves of deck the slab carried out along her side
  // under her 15 cm, the rims of tubs whose guns are gone. The deck she is
  // laid with is the deck there.
  {
    const drop = new Uint8Array(sup.T.length / 3);
    let n = 0;
    for (const c of components(sup)) {
      const zc = (c.lo[2] + c.hi[2]) / 2;
      // Nor is a piece that hangs in the air over it: the stumps of a boom, a crane's jib, the wires
      // that were left to hold a bit of what was cut away.
      const floating = c.lo[1] - gunwaleAt(zc).y > 1.0;
      if (!floating && c.hi[1] - gunwaleAt(zc).y > SUPER.low) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    sup = subMesh(sup, (t) => !drop[t]);
    console.log(`her superstructure: ${n} low or floating pieces taken off her deck`);
  }
  sup.C = new Array(sup.T.length / 3).fill(SUPER_GREY);
  const { lo, hi } = bbox(sup);
  console.log(`her superstructure: ${before} triangles, ${sup.T.length / 3} inside her side, from ${lo[2].toFixed(1)} to `
    + `${hi[2].toFixed(1)} m along her, ${hi[1].toFixed(1)} m up`);
  append(m, sup);
}

// ---- her bridge --------------------------------------------------------------------
// The tower she is known for, at 18 m a unit: seven decks of it, from the
// block it stands on to the rangefinder over its masthead, 30 m over her deck,
// its compass bridge to her bow and its legs and mast abaft it.
// The sculpt is modelled bow to +Z, as she is, so it stands as it came; the middle
// of its base block (z 0.46, x -0.49 in the sculpt) stands at BRIDGE.z on her.
export const BRIDGE = { scale: 18, x: -0.49, mz: 0.46, foot: -0.861, z: 33, sink: 0.15 };
{
  const raw = readGlb(ASSET('fuso-bridge.glb'));
  const P = [], N = [];
  const U = BRIDGE.scale;
  for (let i = 0; i < raw.pos.length; i += 3) {
    const z = BRIDGE.z + (raw.pos[i + 2] - BRIDGE.mz) * U;
    P.push((raw.pos[i] - BRIDGE.x) * U, (raw.pos[i + 1] - BRIDGE.foot) * U + gunwaleAt(z).y - BRIDGE.sink, z);
    N.push(raw.nrm[i], raw.nrm[i + 1], raw.nrm[i + 2]);
  }
  const T = Array.from(raw.idx);
  const br = { P, N, T, C: new Array(T.length / 3).fill(BRIDGE_GREY) };
  fixWinding(br);
  const { lo, hi } = bbox(br);
  console.log(`her bridge: ${T.length / 3} triangles, from ${lo[2].toFixed(1)} to ${hi[2].toFixed(1)} m along her, `
    + `${lo[0].toFixed(1)} to ${hi[0].toFixed(1)} across, ${hi[1].toFixed(1)} m up`);
  append(m, br);
}

// ---- her guns: where each stands ---------------------------------------------------
// Six twin 35.6 cm turrets: No.1 and No.2 forward, No.2 superfiring over it
// from her forecastle deck, No.3 in front of her
// funnel, facing forward over her bridge's block, back to back with No.4
// abaft it, and No.5 and No.6 aft, facing astern, No.5 superfiring over No.6
// on a barbette three metres taller. Where the superstructure's
// turrets stood is where hers do (see superZ); No.1 and No.2 are where the
// hull sheet has them. `seat` is the top of the barbette each trains on, over
// her waterline; the barbettes themselves are fuso.js's.
export const TURRETS = [
  { name: 'No.1', z: +((0.45 - FRAME.xc) * FRAME.SCALE).toFixed(1), rest: 0, up: 1.6 },
  { name: 'No.2', z: +((0.33 - FRAME.xc) * FRAME.SCALE).toFixed(1), rest: 0, up: 2.3 },
  { name: 'No.3', z: +(superZ(0.38) - 2).toFixed(1), rest: 0, up: 1.7 },
  { name: 'No.4', z: superZ(0.01), rest: Math.PI, up: 1.7 },
  { name: 'No.5', z: superZ(-0.34), rest: Math.PI, up: 5.0 },
  { name: 'No.6', z: superZ(-0.48), rest: Math.PI, up: 1.7 },
].map((t) => ({ ...t, x: 0, seat: +(gunwaleAt(t.z).y + t.up).toFixed(3) }));

// Fourteen 15.2 cm singles, seven a side, each in a casemate at the edge of
// her deck: z is how far along her. A notch is cut in her side and her deck
// for each (see below, where they are cut); x and seat are what the cut
// finds -- the gun stands `pivot` inside her side, on the notch's floor.
const PADS = [-0.353, -0.29, -0.23, -0.033, 0.107, 0.197, 0.3]
  .map((x) => +((x - FRAME.xc) * FRAME.SCALE).toFixed(1));
export const CASEMATE = { floor: LEVEL.h - 0.25, high: 2.3, width: 4.8, deep: 3.8, pivot: 2.0, post: 0.2 };
export const SECONDARY = PADS.flatMap((z, k) => [-1, 1].map((sgn) => ({
  name: `S${k + 1} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * 13, z, rest: sgn * Math.PI / 2,
  seat: +(gunwaleAt(z).y - CASEMATE.floor + CASEMATE.post).toFixed(3), side: sgn,
})));

// The light guns the sculpts drew cast into their tubs and platforms, cut out
// of them down to the floor they stood on (`deck`), `r` round them and up to
// `top` over it; the tub, its rim and the platform stay, and fuso.js stands a
// gun there that trains.
export const SCULPTED_LIGHT = [];

// ---- cut every sculpted gun out of her ---------------------------------------------
// The superstructure's turrets: its houses and barrels, a square either side
// of the turret's middle for the house and a strip along the bore for the
// barrels, from a hand over her deck up. She stands her own on a drum.
const BARREL_REACH = 22;
/**
 * Take out every triangle of her superstructure with a corner in the box.
 * Not boxCut: that closes what it cuts, and a floor laid across a sixteen
 * metre square of open deckhouse, where the superstructure sculpt is not a
 * solid the cut can tell the inside of, is a plate over her deck.
 */
function dropBox(mesh, box) {
  let n = 0;
  const keep = new Uint8Array(mesh.T.length / 3).fill(1);
  for (let t = 0; t < keep.length; t++) {
    if (mesh.C[t] !== SUPER_GREY) continue;
    // Any corner in the box takes the triangle: a long sliver of a deckhouse's
    // wall with its middle outside the box and one end in it is a shard
    // standing on her deck.
    for (let j = 0; j < 3; j++) {
      const v = mesh.T[t * 3 + j] * 3;
      const x = mesh.P[v], y = mesh.P[v + 1], z = mesh.P[v + 2];
      if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1 && z > box.z0 && z < box.z1) { keep[t] = 0; n++; break; }
    }
  }
  const out = subMesh(mesh, (t) => keep[t]);
  mesh.P = out.P; mesh.N = out.N; mesh.T = out.T; mesh.C = out.C;
  return n;
}
{
  for (const t of TURRETS) {
    const dir = t.rest === 0 ? 1 : -1;
    let y0 = -Infinity;
    for (let dz = -9; dz <= 9; dz += 1) y0 = Math.max(y0, gunwaleAt(t.z + dz).y);
    y0 += 0.3;
    const top = t.seat + 6;
    const house = dropBox(m, { x0: -8, x1: 8, y0, y1: top, z0: t.z - 8, z1: t.z + 8 });
    const bar = dropBox(m, { x0: -2.2, x1: 2.2, y0, y1: top,
      z0: Math.min(t.z, t.z + dir * BARREL_REACH), z1: Math.max(t.z, t.z + dir * BARREL_REACH) });
    console.log(`${t.name}: ${house + bar} triangles cut`);
  }
  for (const l of SCULPTED_LIGHT) {
    const n = dropBox(m, { x0: l.x - l.r, x1: l.x + l.r, z0: l.z - l.r, z1: l.z + l.r, y0: l.deck + 0.12, y1: l.deck + l.top });
    if (process.env.VERBOSE) console.log(`cut ${l.name}: ${n} triangles`);
  }
}
// ---- her funnel and her after tower, drawn here -----------------------------------
// The sculpt's funnel is a good cylinder with its collars and its cap torn
// off it, and what stood round its foot -- the casing over her boilers, the
// searchlight tower in front of it -- is a heap of shards; her after tower is
// not there at all, the strip No.4's barrels are cut along and No.5's house
// having taken the middle of it, and what is left is a few platforms in the
// air. So the sculpt's is taken off her from her bridge's block to her mast
// and drawn again, to what the plans and the kit show of her: the casing over
// her uptakes in two tiers with her searchlight tower in front, the funnel
// itself, a tall oval a little narrower aloft with its bands, its cap, its
// ladder and its steam pipes, and her after tower, a trunk on a deckhouse
// with three platforms of control and rangefinders, a legged foot, and her
// mast over it with its yards. They stand clear of the barrels No.4 and No.5
// are cut along, and of where the 12.7 cm twins and the 25 mm stand.
export const FUNNEL = { z: -8, rx: 3.5, rz: 4.0, casing: { x: 6.0, z0: -14.2, z1: -1.4 } };
export const TOWER = { z: -40, trunk: { x: 3.0, z: 3.0 }, mast: 33 };
const drawn = blank();
{
  const take = (box_) => dropBox(m, box_);
  // From No.3's house to No.5's, all of it: between them the sculpt has her boats' booms
  // and the stumps of her casing and platforms, and nothing that stands.
  const nf = take({ x0: -14, x1: 14, y0: -Infinity, y1: Infinity, z0: -90, z1: 28 });
  console.log(`her funnel and her after tower: ${nf} triangles of the sculpt's taken off her`);
  const G = SUPER_GREY;
  const out = drawn;
  const d = (z) => gunwaleAt(z).y;
  // -- the casing over her uptakes, and the tower in front of the funnel --
  const dF = d(FUNNEL.z);
  const C = FUNNEL.casing;
  const yT = dF + 6.2;
  prism(out, chamfered(-C.x, C.x, C.z0, C.z1, 1.8), dF - 0.3, dF + 3.4, G);
  prism(out, chamfered(-C.x + 1.3, C.x - 1.3, C.z0 + 1.2, C.z1, 1.4), dF + 3.4, yT, G);
  // The searchlight tower in front: a box on the casing's roof, two drums on it.
  box(out, -2.9, 2.9, yT, yT + 2.7, C.z1 - 3.4, C.z1 - 1.4, G);
  box(out, -3.3, 3.3, yT + 2.7, yT + 3.0, C.z1 - 3.8, C.z1 - 1.0, G);
  for (const sx of [-1.9, 1.9]) {
    tube(out, [sx, yT + 3.0, C.z1 - 2.9], [sx, yT + 4.2, C.z1 - 2.9], 0.85, 0.85, 14, G);
    tube(out, [sx, yT + 3.6, C.z1 - 2.9], [sx, yT + 3.6, C.z1 - 1.0], 0.5, 0.55, 12, G);
  }
  // -- the funnel --
  const y0 = yT, hF = 11.8;
  lathe(out, 0, FUNNEL.z, FUNNEL.rx, FUNNEL.rz, [[y0, 1.04], [y0 + 0.4, 1.0], [y0 + hF - 0.9, 0.9], [y0 + hF - 0.5, 0.9], [y0 + hF - 0.5, 0.97], [y0 + hF, 0.97]], 28, G);
  // its bands, a hand proud of it, and the rim inside its cap
  for (const [yy, kk] of [[0.12, 1.04], [0.4, 0.99], [0.62, 0.95]]) {
    lathe(out, 0, FUNNEL.z, FUNNEL.rx, FUNNEL.rz, [[y0 + hF * yy - 0.2, kk + 0.035], [y0 + hF * yy + 0.2, kk + 0.035]], 28, G);
  }
  // its cap: a grating over the mouth of it, a lip round it and bars across it
  {
    const yc = y0 + hF;
    lathe(out, 0, FUNNEL.z, FUNNEL.rx, FUNNEL.rz, [[yc - 0.1, 1.0], [yc + 0.5, 1.0]], 28, G);
    for (let k = -3; k <= 3; k++) {
      const f = k / 3.6;
      const w = FUNNEL.rx * 0.97 * Math.sqrt(1 - f * f);
      bar(out, [-w, yc + 0.6, FUNNEL.z + f * FUNNEL.rz * 0.97], [w, yc + 0.6, FUNNEL.z + f * FUNNEL.rz * 0.97], 0.14, 0.14, G);
    }
    bar(out, [0, yc + 0.66, FUNNEL.z - FUNNEL.rz * 0.97], [0, yc + 0.66, FUNNEL.z + FUNNEL.rz * 0.97], 0.16, 0.16, G);
  }
  // her searchlight platform, round the funnel a third of the way up it, with a rail
  const yP = y0 + 4.2;
  prism(out, chamfered(-5.2, 5.2, FUNNEL.z - 5.4, FUNNEL.z + 5.4, 2.2), yP, yP + 0.3, G);
  for (const sx of [-4.4, 4.4]) {
    tube(out, [sx, yP + 0.3, FUNNEL.z + 3.2], [sx, yP + 1.5, FUNNEL.z + 3.2], 0.8, 0.8, 14, G);
    tube(out, [sx, yP + 0.9, FUNNEL.z + 3.2], [sx + (sx > 0 ? 1.4 : -1.4), yP + 0.9, FUNNEL.z + 4.4], 0.45, 0.5, 12, G);
  }
  box(out, -5.2, 5.2, yP + 0.3, yP + 1.0, FUNNEL.z - 5.4, FUNNEL.z - 5.1, G);
  // its ladder, up the front of it
  const zl = FUNNEL.z + FUNNEL.rz * 0.93;
  for (const sx of [-0.55, 0.55]) bar(out, [sx, y0 + 0.4, zl + 0.15], [sx, y0 + hF - 0.4, zl + 0.15], 0.12, 0.18, G);
  for (let y = y0 + 1.0; y < y0 + hF - 0.6; y += 0.9) box(out, -0.55, 0.55, y - 0.05, y + 0.05, zl + 0.08, zl + 0.26, G);
  // its steam pipes, up the back of it, and the whistle
  for (const sx of [-1.3, 1.3]) tube(out, [sx, y0 + 4.0, FUNNEL.z - FUNNEL.rz * 0.93], [sx, y0 + hF + 2.2, FUNNEL.z - FUNNEL.rz * 0.93], 0.26, 0.2, 10, G);
  // cowl ventilators on the casing's shoulders, two a side
  for (const sx of [-1, 1]) {
    for (const zz of [C.z0 + 1.8, C.z1 - 4.6]) {
      const xv = sx * (C.x - 0.7);
      tube(out, [xv, dF + 3.4, zz], [xv, dF + 4.7, zz], 0.42, 0.42, 12, G);
      tube(out, [xv, dF + 4.7, zz], [xv, dF + 5.5, zz + 0.45], 0.42, 0.7, 12, G);
    }
  }
  // -- her after tower --
  // A block of it, as the kit has it: a deckhouse the breadth of her casing,
  // a second over it, and the tower itself, square and solid, carrying three
  // platforms of control, searchlights and rangefinder, its two legs out to
  // the deckhouse's corners; its after face stands at the step down from her
  // forecastle deck, No.5 below and abaft it.
  const dT = d(TOWER.z);
  const T0 = TOWER.z;
  const A = T0 - 4.2;
  prism(out, chamfered(-5.6, 5.6, A, T0 + 5.6, 1.6), dT - 0.3, dT + 3.0, G);
  prism(out, chamfered(-4.4, 4.4, A + 0.6, T0 + 4.6, 1.2), dT + 3.0, dT + 5.8, G);
  box(out, -TOWER.trunk.x, TOWER.trunk.x, dT + 5.8, dT + 15.4, T0 - TOWER.trunk.z, T0 + TOWER.trunk.z, G);
  // the bridge-wing of it: a house on the second deckhouse's roof, abaft the tower
  box(out, -3.2, 3.2, dT + 5.8, dT + 8.2, A + 0.9, T0 - TOWER.trunk.z, G);
  // the foot: two legs, out from the deckhouse's front to the first platform
  for (const sx of [-1, 1]) {
    bar(out, [sx * 4.6, dT + 3.0, T0 + 4.8], [sx * 2.6, dT + 10.0, T0 + 2.4], 0.8, 0.8, G);
  }
  // three platforms, each with a rail round it and its house on it
  const tiers = [
    { y: dT + 10.0, hx: 5.6, hz: 5.4, house: [3.8, 4.4, 2.4] },
    { y: dT + 12.7, hx: 4.6, hz: 4.4, house: [3.4, 3.6, 2.3] },
    { y: dT + 15.4, hx: 3.6, hz: 3.4, house: [0, 0, 0] },
  ];
  for (const t of tiers) {
    prism(out, chamfered(-t.hx, t.hx, T0 - t.hz, T0 + t.hz, 1.3), t.y, t.y + 0.3, G);
    const r = 0.14;
    box(out, -t.hx, t.hx, t.y + 0.3, t.y + 1.0, T0 + t.hz - r, T0 + t.hz, G);
    box(out, -t.hx, t.hx, t.y + 0.3, t.y + 1.0, T0 - t.hz, T0 - t.hz + r, G);
    box(out, -t.hx, -t.hx + r, t.y + 0.3, t.y + 1.0, T0 - t.hz, T0 + t.hz, G);
    box(out, t.hx - r, t.hx, t.y + 0.3, t.y + 1.0, T0 - t.hz, T0 + t.hz, G);
    if (t.house[0]) box(out, -t.house[0], t.house[0], t.y + 0.3, t.y + 0.3 + t.house[2], T0 - t.house[1] + 0.5, T0 + t.house[1] - 0.5, G);
  }
  // searchlights at the corners of the second platform, a rangefinder on the third
  for (const sx of [-3.8, 3.8]) {
    tube(out, [sx, dT + 13.0, T0 - 3.4], [sx, dT + 14.0, T0 - 3.4], 0.7, 0.7, 12, G);
    tube(out, [sx, dT + 13.6, T0 - 3.4], [sx, dT + 13.6, T0 - 5.0], 0.42, 0.46, 10, G);
  }
  box(out, -1.1, 1.1, dT + 15.7, dT + 17.3, T0 - 1.1, T0 + 1.1, G);
  tube(out, [-3.0, dT + 17.9, T0], [3.0, dT + 17.9, T0], 0.6, 0.6, 12, G);
  box(out, -3.4, -2.9, dT + 17.5, dT + 18.3, T0 - 0.6, T0 + 0.6, G);
  box(out, 2.9, 3.4, dT + 17.5, dT + 18.3, T0 - 0.6, T0 + 0.6, G);
  // her mast, from the third platform up, with its yards and its truck
  const yM = dT + 15.8;
  tube(out, [0, yM, T0 - 1.2], [0, dT + TOWER.mast, T0 - 1.2], 0.38, 0.2, 10, G);
  bar(out, [-5.6, dT + 27.0, T0 - 1.2], [5.6, dT + 27.0, T0 - 1.2], 0.22, 0.22, G);
  bar(out, [-3.0, dT + 30.0, T0 - 1.2], [3.0, dT + 30.0, T0 - 1.2], 0.18, 0.18, G);
  lathe(out, 0, T0 - 1.2, 0.45, 0.45, [[dT + TOWER.mast, 0.2], [dT + TOWER.mast + 0.35, 1.0], [dT + TOWER.mast + 0.7, 0.2]], 10, G);
  console.log(`her funnel and her after tower: ${out.T.length / 3} triangles drawn`);
}
dropLoose(m, { maxArea: 8, maxDiag: 6 });
// Her bridge is her superstructure's grey again, now that nothing is cut out of the one but the other.
for (let t = 0; t < m.C.length; t++) if (m.C[t] === BRIDGE_GREY) m.C[t] = SUPER_GREY;
recomputeNormals(m);
console.log(`faces facing in: ${turnInward(m)} turned`);
// Her funnel and her after tower go on after that: they are solids, drawn facing out, and what turns faces
// on the strength of their neighbours would take a face of one for the wrong way round where it meets another.
append(m, drawn);

// ---- her casemates ----------------------------------------------------------------
// Her fourteen 15.2 cm stand in the level of her hull under her forecastle
// deck, in gun positions the deck edge is cut away over, as the kit of her
// shows: a notch `width` along her and `deep` into her, its floor `floor`
// under the deck, open to the sea on its outboard side and to the sky over
// it, with a wall at the back and a wall either side, and the gun on a post of
// its own `pivot` inside her side, firing out over the edge.
//
// Her side is cut along the notch (a triangle that crosses one of its edges
// is split there, the pieces sharing the vertex either side) and so is her
// deck; what is left is a loop of edges, and the notch's floor and walls are
// hung from that loop, so she is still one closed skin.
const plain = { P: m.P.slice(), N: m.N.slice(), T: m.T.slice(), C: m.C.slice() };
{
  const { P, N } = m;
  const made = new Map();
  const vertexAt = (x, y, z, nx = 0, ny = 1, nz = 0) => {
    const key = `${Math.round(x * 1e6)}|${Math.round(y * 1e6)}|${Math.round(z * 1e6)}`;
    if (made.has(key)) return made.get(key);
    P.push(x, y, z); N.push(nx, ny, nz);
    const w = P.length / 3 - 1;
    made.set(key, w);
    return w;
  };
  const cross = (a, b, f) => vertexAt(
    P[a * 3] + (P[b * 3] - P[a * 3]) * f, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * f,
    P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * f, N[a * 3], N[a * 3 + 1], N[a * 3 + 2]);
  // Where it crosses from one end of a to b, the same wherever it is asked, whichever way round.
  const mid = (a, b, f) => (a < b ? cross(a, b, f) : cross(b, a, 1 - f));
  /** Cut convex polygon `poly` (vertex indices) by `d(v) <= 0`: [inside, outside]. */
  const clip = (poly, d) => {
    const inn = [], out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = d(a), db = d(b);
      if (da <= 1e-9) inn.push(a);
      if (da >= -1e-9) out.push(a);
      if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
        const w = mid(a, b, da / (da - db));
        inn.push(w); out.push(w);
      }
    }
    return [inn, out];
  };
  const area = (poly) => {
    let a = 0;
    for (let i = 1; i + 1 < poly.length; i++) {
      const u = [0, 1, 2].map((j) => P[poly[i] * 3 + j] - P[poly[0] * 3 + j]);
      const v = [0, 1, 2].map((j) => P[poly[i + 1] * 3 + j] - P[poly[0] * 3 + j]);
      a += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    }
    return a;
  };
  for (const c of SECONDARY) {
    const sg = c.side;
    // A hair off her stations and rows, so the cut never runs along an edge of her side.
    const y0 = gunwaleAt(c.z).y - CASEMATE.floor + 0.0071;
    const z0 = c.z - CASEMATE.width / 2 + 0.0137, z1 = c.z + CASEMATE.width / 2 + 0.0137;
    // How far out her deck edge is here: the outermost of her deck's points along the notch.
    let hb = 0;
    const edge = [];
    for (let t = 0; t < m.T.length; t++) {
      const v = m.T[t], z = P[v * 3 + 2], x = P[v * 3];
      if (m.C[Math.floor(t / 3)] !== DECK || Math.sign(x) !== sg || Math.abs(x) < 8) continue;
      if (z < z0 - 0.6 || z > z1 + 0.6) continue;
      edge.push(Math.abs(x));
    }
    edge.sort((p, q) => p - q);
    hb = edge[edge.length - 1];
    const xin = sg * (hb - CASEMATE.deep);
    // Her side, and her deck: cut away what is inside the notch.
    const keep = [], keepC = [];
    for (let t = 0; t < m.T.length / 3; t++) {
      const v = [m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]];
      const paintOf = m.C[t];
      let zmin = Infinity, zmax = -Infinity, ymax = -Infinity, ymin = Infinity, xmin = Infinity;
      for (const i of v) {
        zmin = Math.min(zmin, P[i * 3 + 2]); zmax = Math.max(zmax, P[i * 3 + 2]);
        ymin = Math.min(ymin, P[i * 3 + 1]); ymax = Math.max(ymax, P[i * 3 + 1]);
        xmin = Math.min(xmin, Math.abs(P[i * 3]));
      }
      const onSide = v.every((i) => Math.sign(P[i * 3]) === sg);
      const isSide = paintOf === GREY && onSide && xmin > 8 && ymax > y0;
      const isDeck = paintOf === DECK && onSide && Math.max(...v.map((i) => Math.abs(P[i * 3]))) > Math.abs(xin);
      if (!(isSide || isDeck) || !(zmax > z0 && zmin < z1)) { keep.push(...v); keepC.push(paintOf); continue; }
      const cells = [];
      const [zr0, zl] = clip(v, (i) => z0 - P[i * 3 + 2]);
      const [zm, zr] = zr0.length >= 3 ? clip(zr0, (i) => P[i * 3 + 2] - z1) : [[], []];
      // The two outer bands are cut along the notch's other lines as well, though all of them
      // stay, so that the corners of the notch are vertices of everything that meets it.
      const along = isSide ? (i) => y0 - P[i * 3 + 1] : (i) => sg * (P[i * 3] - xin);
      for (const band of [zl, zr]) {
        if (band.length < 3) continue;
        const [a1, a2] = clip(band, along);
        cells.push(a1, a2);
      }
      if (zm.length >= 3) {
        if (isSide) {
          // The part of the middle band under the floor stays; the rest is the notch.
          const [, lo] = clip(zm, (i) => y0 - P[i * 3 + 1]);
          cells.push(lo);
        } else {
          // The part of her deck inboard of the notch's back wall stays.
          const [inb] = clip(zm, (i) => sg * (P[i * 3] - xin));
          cells.push(inb);
        }
      }
      for (const cell of cells) {
        if (cell.length < 3 || area(cell) < 1e-9) continue;
        for (let i = 1; i + 1 < cell.length; i++) { keep.push(cell[0], cell[i], cell[i + 1]); keepC.push(paintOf); }
      }
    }
    m.T = keep; m.C = keepC;
    // The loop the cut left: edges with only one triangle on them, on the notch's faces.
    const eps = 1e-5;
    const inReach = (v) => {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      return Math.sign(x) === sg && z > z0 - eps && z < z1 + eps && y > y0 - eps && Math.abs(x) > Math.abs(xin) - eps;
    };
    const onFace = (v) => {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      return Math.abs(z - z0) < eps || Math.abs(z - z1) < eps || Math.abs(y - y0) < eps || Math.abs(Math.abs(x) - Math.abs(xin)) < eps;
    };
    const count = new Map();
    for (let t = 0; t < m.T.length; t += 3) {
      for (let j = 0; j < 3; j++) {
        const a = m.T[t + j], b = m.T[t + (j + 1) % 3];
        if (!inReach(a) || !inReach(b) || !onFace(a) || !onFace(b)) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        const e = count.get(k) || { n: 0, a, b };
        e.n++;
        count.set(k, e);
      }
    }
    const edges = [...count.values()].filter((e) => e.n === 1);
    if (!edges.length) throw new Error(`${c.name}: no edge left by the notch`);
    const nb = new Map();
    for (const e of edges) {
      if (!nb.has(e.a)) nb.set(e.a, []);
      if (!nb.has(e.b)) nb.set(e.b, []);
      nb.get(e.a).push(e.b); nb.get(e.b).push(e.a);
    }
    for (const [v, l] of nb) if (l.length !== 2) throw new Error(`${c.name}: the notch's edge forks at ${P[v * 3 + 2].toFixed(2)},${P[v * 3 + 1].toFixed(2)} (${l.length})`);
    const loop = [edges[0].a];
    for (let prev = loop[0], v = edges[0].b; v !== loop[0];) {
      loop.push(v);
      const n = nb.get(v).filter((q) => q !== prev);
      prev = v; v = n[0];
      if (v === undefined) break;
    }
    if (loop.length !== edges.length) throw new Error(`${c.name}: the notch's edge is ${edges.length} edges but its loop ${loop.length}`);
    // The runs of it in each face.
    const run = (pred) => {
      const n = loop.length;
      let s0 = -1;
      for (let i = 0; i < n; i++) if (!pred(loop[i])) { s0 = i; break; }
      const out = [];
      for (let k = 1; k <= n; k++) {
        const v = loop[(s0 + k) % n];
        if (pred(v)) out.push(v); else if (out.length) break;
      }
      return out;
    };
    const atZ = (zz) => (v) => Math.abs(P[v * 3 + 2] - zz) < eps;
    const left = run(atZ(z0)), right = run(atZ(z1));
    // The floor's and the back wall's edges run from the notch's forward wall to its after wall,
    // so that closed with the two corners on the floor they go round once and do not cross.
    const along = (list) => (P[list[0] * 3 + 2] > P[list[list.length - 1] * 3 + 2] ? list.slice().reverse() : list);
    const bottom = along(run((v) => Math.abs(P[v * 3 + 1] - y0) < eps));
    const back = along(run((v) => Math.abs(Math.abs(P[v * 3]) - Math.abs(xin)) < eps && P[v * 3 + 1] > y0 + 1));
    const W0 = vertexAt(xin, y0, z0), W1 = vertexAt(xin, y0, z1);
    const cxn = sg * (Math.abs(xin) + (hb - Math.abs(xin)) / 2), cyn = y0 + CASEMATE.floor / 2, czn = (z0 + z1) / 2;
    const facing = (tri, paintOf) => {
      const [a, b, d] = tri.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (Math.hypot(...n) < 1e-12) return;
      const g = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
      const to = n[0] * (cxn - g[0]) + n[1] * (cyn - g[1]) + n[2] * (czn - g[2]);
      m.T.push(...(to >= 0 ? tri : [tri[0], tri[2], tri[1]]));
      m.C.push(paintOf);
    };
    const fan = (poly, paintOf) => {
      let mx = 0, my = 0, mz = 0;
      for (const v of poly) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; }
      const mv = vertexAt(mx / poly.length, my / poly.length, mz / poly.length);
      for (let i = 0; i < poly.length; i++) facing([poly[i], poly[(i + 1) % poly.length], mv], paintOf);
    };
    fan([...left, W0], GREY);
    fan([...right, W1], GREY);
    fan([...back, W1, W0], GREY);
    fan([...bottom, W1, W0], STEEL);
    c.x = +(sg * (hb - CASEMATE.pivot)).toFixed(3);
    c.hb = +hb.toFixed(3);
    console.log(`${c.name}: notch at z ${c.z}, her deck edge ${hb.toFixed(2)} m out, loop ${loop.length} points, `
      + `floor ${y0.toFixed(2)} m, gun at x ${c.x}`);
  }
}

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

// ---- her underwater body, run smooth ----------------------------------------------
// The sculpt's body under her waterline is decimated to a few thousand long
// triangles with her paint lines kept, and where it is not a straight run the
// edges of them zigzag -- a row of teeth along her boot topping, and a lump
// here and there where a long triangle's corners were taken a little off the
// surface. It is run smooth: Taubin's pair of passes, a shrink and a slightly
// larger swell, which does not take her in; every point stays within
// `max` of where the sculpt put it, and the points that are held where they are
// are her rim at the waterline, her keel on the centreline, the edge of every
// hole and her stern, where her shafts and rudder are cut into her.
{
  const SMOOTH = { passes: 24, lambda: 0.5, mu: -0.53, max: 0.45, top: CUT - 0.02, aft: -64 };
  const canon0 = weld(m);
  const { P, T } = m;
  const nv = P.length / 3;
  const nb = new Map();
  const edgeUse = new Map();
  for (let t = 0; t < T.length; t += 3) {
    for (let j = 0; j < 3; j++) {
      const a = canon0[T[t + j]], b = canon0[T[t + (j + 1) % 3]];
      if (a === b) continue;
      if (!nb.has(a)) nb.set(a, new Set());
      if (!nb.has(b)) nb.set(b, new Set());
      nb.get(a).add(b); nb.get(b).add(a);
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edgeUse.set(k, (edgeUse.get(k) || 0) + 1);
    }
  }
  const held = new Set();
  for (const [k, n] of edgeUse) if (n !== 2) { const [a, b] = k.split(',').map(Number); held.add(a); held.add(b); }
  const free = [];
  for (const [c, set] of nb) {
    if (held.has(c)) continue;
    const x = P[c * 3], y = P[c * 3 + 1], z = P[c * 3 + 2];
    if (y > SMOOTH.top || z < SMOOTH.aft || Math.abs(x) < 0.05) continue;
    free.push(c);
  }
  const orig = new Map(free.map((c) => [c, [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]]]));
  const pass = (k) => {
    const next = new Map();
    for (const c of free) {
      const set = nb.get(c);
      let ax = 0, ay = 0, az = 0;
      for (const o of set) { ax += P[o * 3]; ay += P[o * 3 + 1]; az += P[o * 3 + 2]; }
      const n = set.size;
      next.set(c, [P[c * 3] + k * (ax / n - P[c * 3]), P[c * 3 + 1] + k * (ay / n - P[c * 3 + 1]), P[c * 3 + 2] + k * (az / n - P[c * 3 + 2])]);
    }
    for (const [c, v] of next) { P[c * 3] = v[0]; P[c * 3 + 1] = v[1]; P[c * 3 + 2] = v[2]; }
  };
  for (let i = 0; i < SMOOTH.passes; i++) {
    pass(SMOOTH.lambda); pass(SMOOTH.mu);
    // Never further than `max` from where the sculpt put it.
    for (const c of free) {
      const o = orig.get(c);
      const dx = P[c * 3] - o[0], dy = P[c * 3 + 1] - o[1], dz = P[c * 3 + 2] - o[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > SMOOTH.max) { const f = SMOOTH.max / d; P[c * 3] = o[0] + dx * f; P[c * 3 + 1] = o[1] + dy * f; P[c * 3 + 2] = o[2] + dz * f; }
    }
  }
  // Every vertex that welds to a moved one goes with it.
  for (let i = 0; i < nv; i++) {
    const c = canon0[i];
    if (c !== i && orig.has(c)) { P[i * 3] = P[c * 3]; P[i * 3 + 1] = P[c * 3 + 1]; P[i * 3 + 2] = P[c * 3 + 2]; }
  }
  let worst = 0;
  for (const c of free) { const o = orig.get(c); worst = Math.max(worst, Math.hypot(P[c * 3] - o[0], P[c * 3 + 1] - o[1], P[c * 3 + 2] - o[2])); }
  console.log(`her underwater body: ${free.length} points run smooth, the furthest ${worst.toFixed(2)} m`);
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
const HM = { x0: -19, z0: -112, step: 0.5, nx: 77, nz: 449 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// Kure grey, her planking, the dark grey of her steel decks, her black boot
// topping and her red bottom.
const PALETTE = [
  [0x6a, 0x72, 0x7c],
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
//   file      the decimated sculpt (see build/fuso-source.mjs)
//   scale     metres a unit of the sculpt
//   pivot     [x, z] of the pivot, in the sculpt
//   dir       -1 if its barrels point -x in the sculpt, +1 if +x
//   foot      the sculpt's y of the foot: everything under it is dropped
//   face      how far ahead of the pivot the barrels come out (sculpt units)
//   lanes     where across each barrel runs, from the pivot; barrelY its
//             height at the trunnion; r how far out from its axis a barrel's
//             skin is
//   trunnionIn  how far inside the face the trunnions are
function gunPiece(file, { scale, pivot, dir = -1, foot, face, lanes, barrelY, r, trunnionIn = 0.08, elev = 0, roofOver = 99 }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    const x = raw.pos[i], y = raw.pos[i + 1], z = raw.pos[i + 2];
    // dir -1: sculpt -x is ahead, its z is across; dir +1: +x is ahead, and
    // -z across: both a quarter turn, not a reflection.
    if (dir < 0) {
      P.push((z - pivot[1]) * scale, (y - foot) * scale, -(x - pivot[0]) * scale);
      N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
    } else {
      P.push(-(z - pivot[1]) * scale, (y - foot) * scale, (x - pivot[0]) * scale);
      N.push(-raw.nrm[i + 2], raw.nrm[i + 1], raw.nrm[i]);
    }
  }
  const mesh = { P, N, T: Array.from(raw.idx) };
  fixWinding(mesh);
  const side = dir < 0 ? 1 : -1;
  const faceZ = face * scale, yB = (barrelY - foot) * scale, rB = r * scale;
  const tz = faceZ - trunnionIn * scale;
  const offAxis = (x, y, z, lane) => {
    const along = (z - tz) * Math.cos(elev) + (y - yB) * Math.sin(elev);
    const ay = yB + along * Math.sin(elev), az = tz + along * Math.cos(elev);
    return Math.hypot(x - side * lane * scale, y - ay, z - az);
  };
  const isBarrel = (t) => {
    const [x, y, z] = middle(mesh, t);
    return z > faceZ && lanes.some((l) => offAxis(x, y, z, l) < rB);
  };
  const above = (t) => {
    for (let j = 0; j < 3; j++) if (mesh.P[mesh.T[t * 3 + j] * 3 + 1] < -1e-3) return false;
    return true;
  };
  const house = roofed(subMesh(mesh, (t) => above(t) && !isBarrel(t)), roofOver);
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
  const muzzles = lanes.map((l) => [+(side * l * scale).toFixed(3), 0, +tip.toFixed(3)]);
  console.log(`${file}: house ${house.T.length / 3} triangles, roof ${roof.toFixed(2)} m; barrels ${guns.T.length / 3} `
    + `triangles, trunnion ${yB.toFixed(2)} m up and ${tz.toFixed(2)} m ahead, ${tip.toFixed(2)} m to the muzzle`);
  return { house, guns, trunnion: [0, +yB.toFixed(3), +tz.toFixed(3)], muzzles, roof: +roof.toFixed(3) };
}
// The 35.6 cm twin, 3rd Year Type: 10 m a unit, which makes the barbette it
// trains on seven metres across and the gunhouse twelve long and six
// wide. It trains on its barbette with the ring of its skirt; its barrels,
// blast bags and all, are lifted off it at its face.
export const MAIN_SCALE = 10;
const MAIN = gunPiece('fuso-356.glb', {
  scale: MAIN_SCALE, pivot: [0.336, 0], dir: -1, foot: -0.08, face: 0.66, lanes: [-0.108, 0.108],
  barrelY: 0.082, r: 0.045, trunnionIn: 0.22, roofOver: 2.5,
});
// The 15.2 cm/50 Type 41 single in its shield: 6 m a unit, which makes its
// shield two and a half metres across, to turn in a casemate. Sculpted laid up fourteen degrees,
// and turned down level about its trunnion.
const SEC = gunPiece('fuso-152.glb', {
  scale: 6.0, pivot: [-0.41, 0], dir: 1, foot: -0.10, face: 0.31, lanes: [0],
  barrelY: 0.1448, r: 0.05, trunnionIn: 0.30, elev: 0.253, roofOver: 1.5,
});
// The 12.7 cm/40 Type 89 twin: 7.2 m a unit, which makes the base ring it
// trains on four metres across. Sculpted laid up fourteen degrees.
const TWIN = gunPiece('fuso-127.glb', {
  scale: 7.2, pivot: [0.33, -0.12], dir: 1, foot: -0.31, face: 0.22, lanes: [-0.0697, 0.0697],
  barrelY: 0.147, r: 0.045, trunnionIn: 0.15, elev: 0.245, roofOver: 99,
});
// The 25 mm Type 96 triple: 1.5 m a unit, which makes its pedestal a metre and
// three quarters across -- it is a gun a man can stand behind.
const AA = gunPiece('fuso-25.glb', {
  scale: 1.25, pivot: [0.33, 0], dir: -1, foot: -0.627, face: 0.63, lanes: [-0.236, 0, 0.236],
  barrelY: 0.256, r: 0.05, trunnionIn: 0.55, roofOver: 99,
});

// ---- her lines, as the sculpt has them --------------------------------------------
// Measured on planes a few millimetres off the round metre: her topsides are
// lofted through stations on it, and a plane through a station's points cuts
// each triangle there at a corner, where measureLines finds no crossing at all
// -- which drew her two metres narrower than her plating amidships, and no
// width at all at her bow.
// Measured on her side as it was before the ports were cut in it: her interior and her armour are
// drawn to her lines, and a casemate is not a place her side is narrower.
const stPlain = stations(plain, { length: REAL_LOA, beamCap: DECK_AMIDSHIPS - 0.2, edgeCap: 10.0, slice: true, beamFloor: 0 });
const LINES = measureLines(plain, stPlain, { z0: -105.9963, dz: 1, nz: 212, y0: -10, dy: 0.5, ny: 40 }, DECK_AMIDSHIPS);
// Her deck is laid level across her at her gunwale, so that is where it is: what
// measureLines reads, the lowest deck within six metres, would take her
// forecastle deck down to her upper deck for six metres either side of each step.
LINES.deck = LINES.deck.map((v, k) => {
  const y = gunwaleAt(LINES.z0 + k * LINES.dz).y;
  return Number.isNaN(y) ? v : +y.toFixed(2);
});

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
  sculptedLight: SCULPTED_LIGHT.map(({ name, x, z, deck }) => ({ name, x, z, deck })),
  casemate: CASEMATE,
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-fuso-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const FUSO_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see fusoSurfaceY.\n`
  + `export const FUSO_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 35.6 cm turret, 15.2 cm gun, 12.7 cm twin and 25 mm triple, as the\n`
  + `// owner sculpted them, each in the frame of its mounting.\n`
  + `export const FUSO_GUNS = ${JSON.stringify({
    main: piece(MAIN), sec: piece(SEC), twin: piece(TWIN), aa: piece(AA),
  })};\n`
  + `// Where her turrets and her 15.2 cm stand, and the floors of the tubs her\n`
  + `// light guns were cut out of.\n`
  + `export const FUSO_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const FUSO_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
