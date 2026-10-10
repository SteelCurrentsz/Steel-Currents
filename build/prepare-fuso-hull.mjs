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
      const ox = cx, oz = Math.abs(cz) > 80 ? cz - Math.sign(cz) * 80 : 0;
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
      if (c.hi[1] - gunwaleAt(zc).y > SUPER.low) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    sup = subMesh(sup, (t) => !drop[t]);
    console.log(`her superstructure: ${n} low pieces taken off her deck`);
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
// on a barbette three metres taller, No.3 in front of her
// funnel, facing forward over her bridge's block, back to back with No.4
// abaft it, and No.5 and No.6 aft, facing astern, No.5 superfiring over No.6
// on a barbette three metres taller. Where the superstructure's
// turrets stood is where hers do (see superZ); No.1 and No.2 are where the
// hull sheet has them. `seat` is the top of the barbette each trains on, over
// her waterline; the barbettes themselves are fuso.js's.
export const TURRETS = [
  { name: 'No.1', z: +((0.45 - FRAME.xc) * FRAME.SCALE).toFixed(1), rest: 0, up: 1.6 },
  { name: 'No.2', z: +((0.33 - FRAME.xc) * FRAME.SCALE).toFixed(1), rest: 0, up: 4.6 },
  { name: 'No.3', z: +(superZ(0.38) - 2).toFixed(1), rest: 0, up: 1.7 },
  { name: 'No.4', z: superZ(0.01), rest: Math.PI, up: 1.7 },
  { name: 'No.5', z: superZ(-0.34), rest: Math.PI, up: 5.0 },
  { name: 'No.6', z: superZ(-0.48), rest: Math.PI, up: 1.7 },
].map((t) => ({ ...t, x: 0, seat: +(gunwaleAt(t.z).y + t.up).toFixed(3) }));

// Fourteen 15.2 cm singles, seven a side, each in a casemate in the side of
// her hull: z is how far along her. A port is cut in her side for each, and a
// recess behind it (see below, where they are cut); x and seat are what the
// cut finds -- the gun stands `pivot` inside her side, on the recess's floor.
const PADS = [-0.353, -0.29, -0.23, -0.033, 0.107, 0.197, 0.3]
  .map((x) => +((x - FRAME.xc) * FRAME.SCALE).toFixed(1));
export const CASEMATE = { floor: 3.2, high: 2.95, width: 4.8, deep: 4.6, pivot: 2.3, post: 0.2 };
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
dropLoose(m, { maxArea: 8, maxDiag: 6 });
// Her bridge is her superstructure's grey again, now that nothing is cut out of the one but the other.
for (let t = 0; t < m.C.length; t++) if (m.C[t] === BRIDGE_GREY) m.C[t] = SUPER_GREY;
recomputeNormals(m);
console.log(`faces facing in: ${turnInward(m)} turned`);

// ---- her casemates ----------------------------------------------------------------
// A port is cut in her side for each 15.2 cm gun -- a rectangle `width` across
// and `high` up, its floor `floor` under her deck edge -- and behind it a
// recess `deep` into her, floor, ceiling, walls and back: the gun stands in it
// on a post of its own, `pivot` inside her plating, and its barrel goes out
// through the port. Her side is cut along the rectangle's edges (a triangle of
// it that crosses one is split there, the pieces sharing the vertex either
// side) and the recess is hung from the edge the cut leaves, so the shell is
// still one closed skin.
const plain = { P: m.P.slice(), N: m.N.slice(), T: m.T.slice(), C: m.C.slice() };
{
  const { P, N } = m;
  const BLACK = 3;
  const made = new Map();
  const mid = (a, b, line, f) => {
    // The vertex where edge a-b crosses a line: one for every polygon that has it, by where it is.
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const u = a < b ? f : 1 - f;
    const at = (j) => P[lo * 3 + j] + (P[hi * 3 + j] - P[lo * 3 + j]) * u;
    const key = `${Math.round(at(0) * 1e6)}|${Math.round(at(1) * 1e6)}|${Math.round(at(2) * 1e6)}`;
    if (made.has(key)) return made.get(key);
    P.push(at(0), at(1), at(2));
    N.push(at(0) > 0 ? 1 : -1, 0, 0);
    const w = P.length / 3 - 1;
    made.set(key, w);
    return w;
  };
  /** Cut convex polygon `poly` (vertex indices) by `d(v) <= 0`: [inside, outside]. */
  const clip = (poly, d, line) => {
    const inn = [], out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = d(a), db = d(b);
      if (da <= 1e-9) inn.push(a);
      if (da >= -1e-9) out.push(a);
      if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
        const w = mid(a, b, line, da / (da - db));
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
    // A hair off her stations and rows, so the cut never runs along an edge of her side.
    const y0 = gunwaleAt(c.z).y - CASEMATE.floor + 0.0071, y1 = y0 + CASEMATE.high;
    const z0 = c.z - CASEMATE.width / 2 + 0.0137, z1 = c.z + CASEMATE.width / 2 + 0.0137;
    const rects = [
      [(v) => z0 - P[v * 3 + 2], 'z0'], [(v) => P[v * 3 + 2] - z1, 'z1'],
      [(v) => y0 - P[v * 3 + 1], 'y0'], [(v) => P[v * 3 + 1] - y1, 'y1'],
    ];
    const keep = [], keepC = [];
    for (let t = 0; t < m.T.length / 3; t++) {
      const v = [m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]];
      let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity, xmin = Infinity;
      for (const i of v) {
        zmin = Math.min(zmin, P[i * 3 + 2]); zmax = Math.max(zmax, P[i * 3 + 2]);
        ymin = Math.min(ymin, P[i * 3 + 1]); ymax = Math.max(ymax, P[i * 3 + 1]);
        xmin = Math.min(xmin, Math.abs(P[i * 3]));
      }
      const touches = m.C[t] === GREY && xmin > 8 && v.every((i) => Math.sign(P[i * 3]) === c.side)
        && zmax > z0 && zmin < z1 && ymax > y0 && ymin < y1;
      if (!touches) { keep.push(...v); keepC.push(m.C[t]); continue; }
      // Nine cells, by the four lines; the middle one is the port.
      const outside = [];
      // clip hands back [inside, outside] of `d <= 0`: for z0 the part over it, then the part under.
      const [zr0, zl] = clip(v, rects[0][0], `${c.name}z0`);
      const [zm0, zr] = zr0.length >= 3 ? clip(zr0, rects[1][0], `${c.name}z1`) : [[], []];
      for (const band of [zl, zm0, zr]) {
        if (band.length < 3) continue;
        const [up, lo] = clip(band, rects[2][0], `${c.name}y0`);
        const [mi, hi] = up.length >= 3 ? clip(up, rects[3][0], `${c.name}y1`) : [[], []];
        // `mi` of the middle band is the port; the others are all hers.
        const cells = band === zm0 ? [lo, hi] : [lo, mi, hi];
        for (const cell of cells) if (cell.length >= 3 && area(cell) > 1e-9) outside.push(cell);
      }
      for (const poly of outside) {
        for (let i = 1; i + 1 < poly.length; i++) { keep.push(poly[0], poly[i], poly[i + 1]); keepC.push(GREY); }
      }
    }
    m.T = keep; m.C = keepC;
    const onRect = (v) => {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (Math.sign(x) !== c.side || Math.abs(x) < 8) return false;
      const eps = 1e-5;
      const inZ = z > z0 - eps && z < z1 + eps, inY = y > y0 - eps && y < y1 + eps;
      return inZ && inY && (Math.abs(z - z0) < eps || Math.abs(z - z1) < eps || Math.abs(y - y0) < eps || Math.abs(y - y1) < eps);
    };
    const count = new Map();
    for (let t = 0; t < m.T.length; t += 3) {
      for (let j = 0; j < 3; j++) {
        const a = m.T[t + j], b = m.T[t + (j + 1) % 3];
        if (!onRect(a) || !onRect(b)) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        const e = count.get(k) || { n: 0, a, b };
        e.n++; e.a = a; e.b = b;
        count.set(k, e);
      }
    }
    const edge = [...count.values()].filter((e) => e.n === 1);
    if (!edge.length) throw new Error(`${c.name}: no edge left by the port`);
    // Chained into one loop, whichever way each triangle happens to run its edge.
    const nb = new Map();
    for (const e of edge) {
      if (!nb.has(e.a)) nb.set(e.a, []);
      if (!nb.has(e.b)) nb.set(e.b, []);
      nb.get(e.a).push(e.b); nb.get(e.b).push(e.a);
    }
    if (process.env.DEBUG_CASE) for (const [v, l] of nb) if (l.length !== 2) console.log('degree', l.length, P[v*3+2].toFixed(3), P[v*3+1].toFixed(3), l.map((q) => `${P[q*3+2].toFixed(2)},${P[q*3+1].toFixed(2)}`).join(' '));
    const loop = [edge[0].a];
    for (let prev = loop[0], v = edge[0].b; v !== loop[0];) {
      loop.push(v);
      const n = nb.get(v).filter((q) => q !== prev);
      prev = v; v = n[0];
      if (v === undefined) break;
    }
    if (loop.length !== edge.length) throw new Error(`${c.name}: the port's edge is ${edge.length} edges but its loop ${loop.length}`);
    let hb = 0;
    for (const v of loop) hb += Math.abs(P[v * 3]);
    hb /= loop.length;
    const back = c.side * (hb - CASEMATE.deep);
    c.x = +(c.side * (hb - CASEMATE.pivot)).toFixed(3);
    c.hb = +hb.toFixed(3);
    const inner = loop.map((v) => { P.push(back, P[v * 3 + 1], P[v * 3 + 2]); N.push(0, 0, 0); return P.length / 3 - 1; });
    const cx = c.side * (hb - CASEMATE.deep / 2), cy = (y0 + y1) / 2, cz = c.z;
    const facing = (tri, paintOf) => {
      const [a, b, d] = tri.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const g = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
      const to = n[0] * (cx - g[0]) + n[1] * (cy - g[1]) + n[2] * (cz - g[2]);
      if (Math.hypot(...n) < 1e-12) return;
      m.T.push(...(to >= 0 ? tri : [tri[0], tri[2], tri[1]]));
      m.C.push(paintOf);
    };
    const flat = (v, w) => (Math.abs(P[v * 3 + 1] - y0) < 1e-5 && Math.abs(P[w * 3 + 1] - y0) < 1e-5 ? STEEL : BLACK);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], ia = inner[i], ib = inner[(i + 1) % loop.length];
      const paintOf = flat(a, b);
      facing([a, b, ib], paintOf); facing([a, ib, ia], paintOf);
    }
    P.push(back, cy, cz); N.push(0, 0, 0);
    const mid0 = P.length / 3 - 1;
    for (let i = 0; i < loop.length; i++) facing([inner[i], inner[(i + 1) % loop.length], mid0], BLACK);
    console.log(`${c.name}: casemate at z ${c.z}, her side ${hb.toFixed(2)} m out, port ${loop.length} points round, `
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
// The 25 mm Type 96 triple: 2.3 m a unit, which makes its pedestal two and
// a half metres across.
const AA = gunPiece('fuso-25.glb', {
  scale: 2.3, pivot: [0.33, 0], dir: -1, foot: -0.627, face: 0.63, lanes: [-0.236, 0, 0.236],
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
