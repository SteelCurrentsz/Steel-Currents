// Turn the owner's Richelieu sculpts into what client/js/render/richelieuHull.js
// ships: her hull and her upperworks as one painted mesh, and her 380 mm,
// 152 mm and 100 mm mountings as the owner sculpted them, cut so they train
// and elevate. In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a rotation, scaled to her 247.85 m and her 33 m beam, and floated at
//     9.6 m; her paint (see build/richelieu-source.mjs) rides along a
//     triangle at a time;
//   * read her gunwale off her, a section every half metre: how high her deck
//     edge is and how far out, all the way from her stern to her stem head;
//   * take everything off her down to just over her waterline, and draw her
//     topsides afresh off her own sections, faired, up to her gunwale -- which
//     the sculpt drew flush from stem to stern, and which here breaks down a
//     deck abaft her after turrets to the quarterdeck she worked her aircraft
//     from, as she was built. Her deck is laid across the top of them, flush
//     with her gunwale, so she is closed everywhere and no seam shows
//     daylight;
//   * cut her four melted screws off her shafts (richelieu.js draws four that
//     turn), and fair what is left of her underwater body;
//   * stand her upperworks on her deck as the second sculpt drew them -- her
//     tower and bridge, her mack, her after superstructure, her boats -- at
//     one scale that puts its 380 mm barbette where her second turret's was
//     and the break of its quarterdeck on hers; cut out of them every gun
//     they had cast into their mountings (richelieu.js stands one there that
//     trains), and close the holes;
//   * paint her decks: planking on her upper deck and quarterdeck, steel on
//     her superstructure's;
//   * split her normals at every crease and paint edge;
//   * read her surface off as a height map, which is what richelieu.js stands
//     every mounting on, and her lines, which is what her interior and armour
//     are fitted under;
//   * take her 380 mm quadruple turret, her 152 mm triple turret and her
//     100 mm twin off the owner's sculpts of them, each in the frame of its
//     mounting with its barrels on a cradle of their own;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file richelieu.js decodes synchronously.
//
// The stages are build/sculpt.mjs and build/sculpt-parts.mjs; what is here is
// what is hers.
//
//   node build/prepare-richelieu-hull.mjs
//
// Reads assets/models/richelieu-*.glb (made by build/richelieu-source.mjs),
// writes client/js/render/richelieuHull.data.js. Re-run it whenever an asset or
// anything below changes; the data file is committed, so a fresh clone runs
// without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, toGameFrame, bbox, fixWinding, boxCut, components, recomputeNormals, weld, stations, hardEdges,
  shadePlating, boxUvs, paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
  smoothFlats, denoise,
} from './sculpt.mjs';
import {
  subMesh, dropLoose, turnInward, thinFaces, creased, measureLines, wires, slender,
} from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/richelieuHull.data.js');

const REAL_LOA = 247.85;
const DRAFT = 9.6;
/** Her beam over the sculpt's: it drew her a metre and a half narrower than her 33 m. */
const BEAM_K = 1.045;

// ---- read her, and put her in the game's frame -------------------------------
// Her keel is flat along the middle of her at -0.2237 of the sculpt; she is
// floated at her 9.6 m draft. A unit of the sculpt is 130.2 m of her.
const RAW = readGlb(ASSET('richelieu-hull.glb'));
const SCULPT = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < RAW.pos.length; i += 3) {
    x0 = Math.min(x0, RAW.pos[i]); x1 = Math.max(x1, RAW.pos[i]);
    z0 = Math.min(z0, RAW.pos[i + 2]); z1 = Math.max(z1, RAW.pos[i + 2]);
  }
  return { x0, x1, z0, z1 };
})();
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const KEEL = -0.2237;
const FRAME = { xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: 0, SCALE: UNIT, localKeel: KEEL + DRAFT / UNIT, keelY: 0 };
/** A point of her hull sculpt, in the game's frame. */
const hullPoint = (x, y, z) => [z * UNIT * BEAM_K, (y - FRAME.localKeel) * UNIT, -(x - FRAME.xc) * UNIT];

// Her paints, as build/richelieu-source.mjs numbers them; and her
// superstructure's grey, which is grey that is left as its sculpt drew it --
// not faired, not dropped for being small and apart -- until her decks are
// laid.
const GREY = 0, DECK = 1, STEEL = 2, BOOT = 3, RED = 4, SUPER_GREY = 5;

/** A painted decimation of her, in the game's frame, with a paint a triangle. */
function load(raw) {
  const mesh = toGameFrame(raw, { length: REAL_LOA, keelY: 0, frame: FRAME });
  for (let i = 0; i < mesh.P.length; i += 3) {
    mesh.P[i] *= BEAM_K;
    const nx = mesh.N[i] / BEAM_K, ny = mesh.N[i + 1], nz = mesh.N[i + 2], l = Math.hypot(nx, ny, nz) || 1;
    mesh.N[i] = nx / l; mesh.N[i + 1] = ny / l; mesh.N[i + 2] = nz / l;
  }
  mesh.C = [];
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

const m = load(RAW);
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
// anything less than `keep` of the breadth she has under it. Each side is
// read on its own.
const GUNWALE = { z0: -125, dz: 0.5, n: 501, keep: 0.85, step: 0.25, under: 0.2 };
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

// ---- the break of her quarterdeck ---------------------------------------------------
// The sculpt drew her flush-decked to her stern. She was not: abaft her after
// turrets her upper deck ends at a bulkhead and her quarterdeck -- where her
// catapults, her crane and her aircraft were -- is a deck lower, for the last
// thirty-nine metres of her. The break is between two of her stations, and
// the after one is drawn a few centimetres from the fore one so that its
// bulkhead stands upright.
export const BREAK_Z = -84.53;
export const QUARTERDECK_DROP = 2.6;
const BREAK_K = Math.round((BREAK_Z - GUNWALE.dz / 2 - GUNWALE.z0) / GUNWALE.dz);
/** Where station k is drawn along her. */
const zOfK = (k) => (k === BREAK_K ? GUNWALE.z0 + (k + 1) * GUNWALE.dz - 0.06 : GUNWALE.z0 + k * GUNWALE.dz);

// Her deck edge over her waterline, metres, along her: level from her stern
// to her forward turret, and rising from there to her stem head, as the
// sculpt has it a few centimetres inboard of its edge (at the edge itself it
// is lumped up wherever something stood there).
const SHEER = [[-130, 8.06], [55.8, 8.06], [63.7, 8.2], [69.0, 8.22], [74.2, 8.33], [79.4, 8.45], [84.7, 8.63],
  [89.9, 8.79], [95.2, 8.89], [100.4, 9.14], [105.7, 9.36], [110.9, 9.58], [116.2, 9.89], [121.4, 10.27], [130, 10.6]];
const sheerAt = (z) => {
  for (let i = 1; i < SHEER.length; i++) {
    if (z > SHEER[i][0]) continue;
    const [a, ya] = SHEER[i - 1], [b, yb] = SHEER[i];
    return ya + (yb - ya) * (z - a) / (b - a);
  }
  return SHEER[SHEER.length - 1][1];
};

const gunwale = (() => {
  const side = sidesOf(m);
  // Her sheer, run smooth over two metres either way; abaft the break it is
  // the same line a deck lower.
  const gy0 = Float64Array.from({ length: GUNWALE.n }, (_, k) => sheerAt(GUNWALE.z0 + k * GUNWALE.dz));
  const gy1 = Float64Array.from(gy0, (v, k) => mean(gy0, k, 4));
  const gy = Float64Array.from(gy1, (v, k) => (k <= BREAK_K ? v - QUARTERDECK_DROP : v));
  // How far out each side is a hand under her deck edge -- the median of two
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
  // Either side of the break, each deck holds its own height to the bulkhead.
  const k = z < BREAK_Z ? Math.min(f, BREAK_K) : Math.max(f, BREAK_K + 1);
  const halves = [lerpAt(gunwale.gw[0], f), lerpAt(gunwale.gw[1], f)];
  return { y: lerpAt(gunwale.gy, k), halves, half: Math.min(...halves) };
};
// Where she ends, as her gunwale has her: her stern and her stem head.
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
  + [-120, -100, -86, -84, -60, -20, 0, 20, 60, 90, 110, 120].map((z) => {
    const g = gunwaleAt(z);
    return `${z}:${g.y.toFixed(2)}/${g.halves.map((h) => h.toFixed(2)).join('|')}`;
  }).join(' '));

// ---- her screws -------------------------------------------------------------------
// Four shafts: the wing pair ending forward of the inner pair, each on a pair
// of brackets. The sculpt melted the screw on the end of each into a lump; it
// is cut off, and richelieu.js draws a three-bladed screw there that turns.
export const SCREWS = [[0.6465, -0.2003, -0.0673, 2.4], [0.6465, -0.2003, 0.0673, 2.4],
  [0.752, -0.199, -0.0337, 2.25], [0.752, -0.199, 0.0337, 2.25]].map(([x, y, z, r]) => {
  const [gx, gy, gz] = hullPoint(x, y, z);
  return { x: +gx.toFixed(2), y: +gy.toFixed(2), z: +gz.toFixed(2), r };
});
for (const s of SCREWS) {
  const r = boxCut(m, { x0: s.x - 2.8, x1: s.x + 2.8, y0: s.y - 2.8, y1: s.y + 2.8, z0: s.z - 0.9, z1: s.z + 0.9 }, { rescue: true });
  console.log(`screw at ${s.x}, ${s.z}: ${r.cut} triangles cut, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
}
dropLoose(m, { maxArea: 3, maxDiag: 4 });

// ---- her topsides, drawn afresh ------------------------------------------------------
// She is cut level `CUT` over her waterline, and her side from there up to her
// gunwale is drawn afresh off her own sections, faired: at every station and
// height, the median of how far out she is over four metres either way along
// her -- which a lump or a pit a few metres long does not move, and her
// lines, her flare and her belt run straight through -- and a running mean
// over a metre to take the grain off it. Toward her ends the window closes in
// evenly, so her stem and her stern are where the sculpt has them.
//
// Her new side is lofted in rows round her, each from her stern on her
// centreline forward along her starboard side to her stem and back along her
// port side: the first row is the rim the cut left in her, point for point,
// so it is joined to what is under it without a seam; the next is the top of
// her boot topping, level; and the rest are spaced up to her gunwale, the
// last of them her deck edge. Her deck is laid across the last row from side
// to side, on the same points -- and at her break, where two of her stations
// stand a deck apart a few centimetres from each other, the strip of deck
// between them is the bulkhead that closes the end of her upper deck.
const CUT = 0.5, BOOT_TOP = 0.9, ROWS = 9;
const FAIR = { r: 8, mean: 2 };
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
  console.log(`cut level ${CUT} m over her waterline: her rim is ${rim.length} points round her, `
    + `${rimArc[rim.length].toFixed(0)} m, from ${Math.min(...rimXZ.map((q) => q[1])).toFixed(1)} to `
    + `${Math.max(...rimXZ.map((q) => q[1])).toFixed(1)} m`);

  // ---- a row of her side, round her, at height y(k) ----
  // Her stations, a point either side at each, and a point on her centreline
  // closing each end a little past her last station: rounded at her stern,
  // fine at her stem. Returns the vertices, and which are which.
  const gyK = (k) => gunwale.gy[k];
  const rowAt = (yOf) => {
    const stb = [], prt = [];
    const ks = [], ws = [[], []];
    for (let k = 0; k < GUNWALE.n; k++) {
      const z = GUNWALE.z0 + k * GUNWALE.dz;
      const gy = gyK(k);
      if (Number.isNaN(gy) || z < ENDS[0] - 1 || z > ENDS[1] + 1) continue;
      // Read no higher than a hand under her deck edge: at her deck itself
      // the sculpt's deck is holed wherever a turret or a deckhouse stood.
      const y = Math.min(yOf(gy), gy - GUNWALE.under);
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
      const z = zOfK(ks[i]), y = yOf(gyK(ks[i]));
      const add = (x) => { P.push(x, y, z); N.push(Math.sign(x), 0, 0); return P.length / 3 - 1; };
      stb.push(add(-ws[0][i])); prt.push(add(ws[1][i]));
    }
    const end = (i, kk) => {
      const z = P[stb[i] * 3 + 2], w = (Math.abs(P[stb[i] * 3]) + P[prt[i] * 3]) / 2;
      const zz = z + kk * w;
      P.push(0, yOf(gunwaleAt(zz).y), zz); N.push(0, 0, Math.sign(kk));
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
  const zip = (a, b, paintOf) => {
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
      m.C.push(paintOf);
      n++;
    }
    return n;
  };
  const rows = [{ loop: rim }];
  for (let j = 1; j <= ROWS; j++) {
    rows.push(rowAt(j === 1 ? () => BOOT_TOP : (gy) => BOOT_TOP + (gy - BOOT_TOP) * (j - 1) / (ROWS - 1)));
  }
  let sideTris = 0;
  for (let j = 0; j < ROWS; j++) sideTris += zip(rows[j].loop, rows[j + 1].loop, j === 0 ? BOOT : GREY);

  // ---- her deck, across her top row ----
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
  const lay = (tri, paintOf) => {
    const [, ny] = faceNormal(m, ...tri);
    m.T.push(...(ny < 0 ? [tri[0], tri[2], tri[1]] : tri));
    m.C.push(paintOf);
    deckTris++;
  };
  let bulkhead = 0;
  for (let i = 0; i + 1 < across.length; i++) {
    const a = across[i], b = across[i + 1];
    // The strip that climbs a deck in a few centimetres is her break's
    // bulkhead: plating, facing aft.
    const wall = Math.abs(P[a[0] * 3 + 1] - P[b[0] * 3 + 1]) > 1;
    let p = 0, q = 0;
    while (p < a.length - 1 || q < b.length - 1) {
      const xa = p < a.length - 1 ? P[a[p + 1] * 3] : Infinity;
      const xb = q < b.length - 1 ? P[b[q + 1] * 3] : Infinity;
      const tri = xa <= xb ? [a[p], a[p + 1], b[q]] : [a[p], b[q + 1], b[q]];
      if (xa <= xb) p++; else q++;
      if (wall) {
        const [, , nz] = faceNormal(m, ...tri);
        m.T.push(...(nz > 0 ? [tri[0], tri[2], tri[1]] : tri));
        m.C.push(GREY);
        bulkhead++;
      } else lay(tri, DECK);
    }
  }
  for (const [tip, row] of [[top.stern, across[0]], [top.stem, across[across.length - 1]]]) {
    for (let k = 0; k + 1 < row.length; k++) lay([tip, row[k], row[k + 1]], DECK);
  }
  console.log(`her topsides: drawn afresh in ${ROWS} rows over her rim of ${rim.length}, ${sideTris} triangles; `
    + `her deck laid across them at ${across.length} stations, ${deckTris} triangles, and her break's bulkhead ${bulkhead}`);
}

// ---- her underwater body, faired ---------------------------------------------------
// Under her waterline she is the sculpt, and the sculpt is lumpy in places:
// every point of her that lies on a fair stretch of her -- none on her keel,
// her bilge, her shafts or her rudder, which are creases -- is drawn toward
// the fair surface through its neighbours, a few centimetres at most.
{
  const canon = weld(m);
  smoothFlats(m, canon, { passes: 12, lambda: 0.5, mu: -0.53, max: 0.12, flat: 25 });
  for (let i = 0; i < m.P.length / 3; i++) {
    const c = canon[i];
    if (c !== i) { m.P[i * 3] = m.P[c * 3]; m.P[i * 3 + 1] = m.P[c * 3 + 1]; m.P[i * 3 + 2] = m.P[c * 3 + 2]; }
  }
}

// ---- her upperworks -------------------------------------------------------------------
// As the second sculpt drew them, cropped to what stands on its deck (see
// build/richelieu-source.mjs): her tower and bridge, her mack, her after
// superstructure and its boats. Bow at -X, Y up, its deck at -0.0968; 106 m a
// unit, which puts the barbette of its one 380 mm turret where her second
// turret's was and the break of its quarterdeck on hers, and stands her tower
// as high over her deck as it was. Its walls go fifteen centimetres into her
// deck.
export const SUPER = { scale: 106, pivot: -0.3435, z: 20.9, deck: -0.0968, sink: 0.15 };
/** A point of the upperworks sculpt, in the game's frame. */
const superPoint = (x, y, z) => {
  const gz = SUPER.z - (x - SUPER.pivot) * SUPER.scale;
  return [z * SUPER.scale, (y - SUPER.deck) * SUPER.scale + gunwaleAt(gz).y - SUPER.sink, gz];
};
const DECK_AMIDSHIPS = gunwaleAt(0).y;

// ---- the foot of her upperworks ------------------------------------------------------
// The sculpt drew them standing on a deck of their own, and that deck and the
// first two metres of everything on it melted: ragged skirts that slope down
// to it, daylight under her tower, plates hanging in the air. So they are cut
// level at her superstructure deck, BASE_TOP over her waterline, and what
// stands on it stands on a deckhouse drawn here instead, from her upper deck
// up to it, under everything the sculpt stood there: its plan, [z, half
// breadth] from forward aft, follows the sculpt's own at that height -- broad
// abreast her tower, waisted between her 100 mm, narrowing aft to the
// barbette of her centreline 152 mm.
export const BASE_TOP = 10.3;
export const BASE_PLAN = [
  [9.0, 13.0], [8.4, 13.9], [-1.6, 13.9], [-2.6, 9.4], [-8.6, 9.4], [-9.4, 14.0], [-15.6, 14.0], [-16.4, 8.6],
  [-20.2, 8.6], [-20.8, 14.2], [-30.2, 14.2], [-30.8, 6.4], [-32.4, 6.4], [-33.0, 13.4], [-43.4, 13.4],
  [-44.0, 6.4], [-47.4, 6.4], [-48.0, 12.6], [-52.6, 12.6], [-53.2, 6.2], [-54.8, 6.2], [-55.4, 7.2],
  [-64.0, 7.2], [-64.6, 4.6], [-67.6, 4.6], [-68.2, 3.9], [-71.0, 3.9],
];

// ---- her rigging -------------------------------------------------------------------
// Between her tower and her mack, over her boats, the sculpt drew nothing of
// hers but rigging -- aerials, a melted yard and the struts it hung off -- and
// over the deck on top of her mack only her pole mast, so melted with its
// yards and gaff that it is drawn afresh in richelieu.js, at MAST, on the roof
// of the house it stood on. `thin` is how high on her mack the stumps of what
// stood on it are taken off from: anything a plate thick standing up off its
// deck. And abaft her mack's cowl the sculpt hung a boat derrick and a sail of
// torn plate from it down to the deckhouse aft: every sheet of plate there
// goes.
export const RIGGED = {
  gap: { z0: -33.8, z1: -22.6, y: 20.6 },
  mack: { z0: -46.0, z1: -33.8, y: 29.3, thin: 27.7 },
  cowl: { z0: -53.0, z1: -44.6, y: 19.5 },
};
export const MAST = { x: 0, z: -36.5 };

// ---- the core of her upperworks --------------------------------------------------
// The sculpt drew her tower, her mack and her deckhouses a sheet of plate
// thick, and melted: there are holes in their walls a man could climb
// through, and through them the sky on the far side. So each is given a core:
// the space her upperworks enclose, found on a grid of `CORE.cell` -- every
// cell a face of hers passes through is plate, the plate is thickened by
// `CORE.close` cells so that a hole narrower than twice that is shut, the
// outside is flooded in from the sides and the top of the grid (her
// superstructure deck closes the bottom), and what the flood did not reach is
// inside her. That is shrunk back by one cell more than it was thickened, so
// it stands a hand inside her own plating everywhere -- hidden where she is
// whole, and seen through her where she is not, as the plating of the far
// side of a compartment. A platform or a deck, a sheet with open air either
// side of it, encloses nothing and has no core.
const CORE = { cell: 0.4, close: 2 };
function solidCore(mesh) {
  const { P, T } = mesh;
  const { lo, hi } = bbox(mesh);
  const c = CORE.cell;
  const x0 = lo[0] - 2 * c, y0 = BASE_TOP, z0 = lo[2] - 2 * c;
  const nx = Math.ceil((hi[0] + 2 * c - x0) / c), ny = Math.ceil((hi[1] + 2 * c - y0) / c), nz = Math.ceil((hi[2] + 2 * c - z0) / c);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  const plate = new Uint8Array(nx * ny * nz);
  // Every cell a face passes through, sampled a fifth of a cell apart.
  const mark = (x, y, z) => {
    const i = Math.floor((x - x0) / c), j = Math.floor((y - y0) / c), k = Math.floor((z - z0) / c);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) plate[id(i, j, k)] = 1;
  };
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, d = T[t + 2] * 3;
    const len = Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]),
      Math.hypot(P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]));
    const n = Math.max(1, Math.ceil(len / (c / 5)));
    for (let u = 0; u <= n; u++) {
      for (let v = 0; v <= n - u; v++) {
        const fu = u / n, fv = v / n;
        mark(P[a] + (P[b] - P[a]) * fu + (P[d] - P[a]) * fv, P[a + 1] + (P[b + 1] - P[a + 1]) * fu + (P[d + 1] - P[a + 1]) * fv,
          P[a + 2] + (P[b + 2] - P[a + 2]) * fu + (P[d + 2] - P[a + 2]) * fv);
      }
    }
  }
  // Grow or shrink a set of cells by `r`, a cube at a time, one axis after another.
  const grow = (src, r, keep) => {
    let cur = src;
    for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const out = new Uint8Array(cur.length);
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let any = keep ? 1 : 0;
        for (let s2 = -r; s2 <= r; s2++) {
          const ii = i + di * s2, jj = j + dj * s2, kk = k + dk * s2;
          const inside = ii >= 0 && jj >= 0 && kk >= 0 && ii < nx && jj < ny && kk < nz ? cur[id(ii, jj, kk)] : 0;
          if (keep) { if (!inside) { any = 0; break; } } else if (inside) { any = 1; break; }
        }
        out[id(i, j, k)] = any;
      }
      cur = out;
    }
    return cur;
  };
  const shut = grow(plate, CORE.close, false);
  // Flood the outside in from the sides and the top.
  const out = new Uint8Array(nx * ny * nz);
  const queue = [];
  const seed = (i, j, k) => { const q = id(i, j, k); if (!shut[q] && !out[q]) { out[q] = 1; queue.push(q); } };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { seed(0, j, k); seed(nx - 1, j, k); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { seed(i, j, 0); seed(i, j, nz - 1); }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) seed(i, ny - 1, k);
  while (queue.length) {
    const q = queue.pop();
    const i = q % nx, j = Math.floor(q / nx) % ny, k = Math.floor(q / (nx * ny));
    if (i > 0) seed(i - 1, j, k);
    if (i < nx - 1) seed(i + 1, j, k);
    if (j > 0) seed(i, j - 1, k);
    if (j < ny - 1) seed(i, j + 1, k);
    if (k > 0) seed(i, j, k - 1);
    if (k < nz - 1) seed(i, j, k + 1);
  }
  const enclosed = Uint8Array.from(out, (v) => (v ? 0 : 1));
  const core = grow(enclosed, CORE.close + 1, true);
  // Its faces: every side of a core cell that is not against another,
  // merged into rectangles a slice at a time.
  const C = [], Pc = [], Nc = [], Tc = [];
  const at = (i, j, k) => (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz ? core[id(i, j, k)] : 0);
  let cells = 0;
  for (let q = 0; q < core.length; q++) cells += core[q];
  const quad = (a, b, d, e, n) => {
    const base = Pc.length / 3;
    for (const p of [a, b, d, e]) { Pc.push(...p); Nc.push(...n); }
    // Wound to face along n.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * n[0] + fy * n[1] + fz * n[2] >= 0) Tc.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else Tc.push(base, base + 2, base + 1, base, base + 3, base + 2);
    C.push(GREY, GREY);
  };
  // For each axis and side, sweep the slices and greedily merge the exposed faces.
  const dims = [nx, ny, nz];
  for (let ax = 0; ax < 3; ax++) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    for (const side of [-1, 1]) {
      const mask = new Uint8Array(dims[u] * dims[v]);
      for (let w = 0; w < dims[ax]; w++) {
        mask.fill(0);
        for (let b = 0; b < dims[v]; b++) for (let a = 0; a < dims[u]; a++) {
          const p = [0, 0, 0]; p[ax] = w; p[u] = a; p[v] = b;
          const q = [...p]; q[ax] += side;
          if (at(...p) && !at(...q)) mask[b * dims[u] + a] = 1;
        }
        for (let b = 0; b < dims[v]; b++) {
          for (let a = 0; a < dims[u];) {
            if (!mask[b * dims[u] + a]) { a++; continue; }
            let wa = 1;
            while (a + wa < dims[u] && mask[b * dims[u] + a + wa]) wa++;
            let hb = 1;
            grow2: while (b + hb < dims[v]) {
              for (let s2 = 0; s2 < wa; s2++) if (!mask[(b + hb) * dims[u] + a + s2]) break grow2;
              hb++;
            }
            for (let bb = 0; bb < hb; bb++) for (let s2 = 0; s2 < wa; s2++) mask[(b + bb) * dims[u] + a + s2] = 0;
            const plane = w + (side > 0 ? 1 : 0);
            const corner = (da, db) => {
              const g = [0, 0, 0]; g[ax] = plane; g[u] = a + da; g[v] = b + db;
              return [x0 + g[0] * c, y0 + g[1] * c, z0 + g[2] * c];
            };
            const n = [0, 0, 0]; n[ax] = side;
            quad(corner(0, 0), corner(wa, 0), corner(wa, hb), corner(0, hb), n);
            a += wa;
          }
        }
      }
    }
  }
  console.log(`the core of her upperworks: ${cells} cells of ${CORE.cell} m inside her plating, `
    + `${Tc.length / 3} triangles`);
  return { P: Pc, N: Nc, T: Tc, C };
}

// ---- her guns: where each stands ---------------------------------------------------
// Two quadruple 380 mm turrets, both forward: II on the barbette the
// upperworks sculpt drew for its one turret, close ahead of her tower, and I
// thirty-two metres ahead of it, as her plans have them. II superfires over
// I. `seat` is where the foot of each gunhouse's ring stands, over her
// waterline; the barbettes under them are richelieu.js's.
export const TURRETS = [
  { name: 'I', z: SUPER.z + 32, rest: 0, over: 0.5 },
  { name: 'II', z: SUPER.z, rest: 0, over: 4.4 },
].map((t) => ({ name: t.name, x: 0, z: t.z, rest: t.rest, seat: +(gunwaleAt(t.z).y + t.over).toFixed(3) }));

// Three triple 152 mm turrets aft, where the upperworks sculpt drew them: two
// on her upper deck abreast each other, trained aft, and the third on the
// centreline on the deckhouse forward of them, superfiring over both on a
// short barbette of its own. `cut` is the sculpt's melted turret taken off
// down to `floor`.
export const SECONDARY = [
  { name: 'III', x: 0, z: -67.6, rest: Math.PI, seat: 11.4, cut: { x0: -4.5, x1: 4.5, z0: -74.0, z1: -61.9, floor: 10.85 } },
  { name: 'IV port', x: 7.9, z: -74.95, rest: Math.PI, seat: DECK_AMIDSHIPS + 0.25,
    cut: { x0: 4.0, x1: 13.2, z0: -83.6, z1: -69.4, floor: 7.0 } },
  { name: 'IV stbd', x: -7.9, z: -74.95, rest: Math.PI, seat: DECK_AMIDSHIPS + 0.25,
    cut: { x0: -13.2, x1: -4.0, z0: -83.6, z1: -69.4, floor: 7.0 } },
];

// Six twin 100 mm, three a side about her mack, on the platforms the
// upperworks sculpt drew for them: what it drew on each is taken off down to
// the platform, and the mounting stands there.
export const DP = [
  { name: 'fwd', x: 10.8, z: -25.6, seat: BASE_TOP, cut: { x0: 7.6, x1: 14.4, z0: -30.4, z1: -20.6, top: 14.0 } },
  { name: 'mack', x: 10.0, z: -38.2, seat: 12.3, cut: { x0: 6.6, x1: 13.6, z0: -43.8, z1: -32.6, top: 15.6 } },
  { name: 'aft', x: 9.8, z: -50.0, seat: BASE_TOP, cut: { x0: 6.9, x1: 12.8, z0: -52.8, z1: -47.6, top: 12.6 } },
].flatMap((d) => [-1, 1].map((sgn) => ({
  name: `${d.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * d.x, z: d.z, rest: sgn * Math.PI / 2, seat: d.seat,
  cut: { x0: sgn > 0 ? d.cut.x0 : -d.cut.x1, x1: sgn > 0 ? d.cut.x1 : -d.cut.x0, z0: d.cut.z0, z1: d.cut.z1, floor: d.seat, top: d.cut.top },
})));

// The tubs of her 40 mm quadruple Bofors the upperworks sculpt drew -- two on
// her forward superstructure deck abreast her tower, and two on her upper
// deck abaft her after 100 mm -- with the guns it melted into them. They are
// taken off down to the floor each stood on (`floor`), and richelieu.js
// stands a tub and a gun there that trains.
export const LIGHT = [
  { name: 'tower', x: 12.6, z: 1.8, floor: BASE_TOP, cut: { x0: 10.6, x1: 15.6, z0: -1.0, z1: 4.6, top: 15.0 } },
  { name: 'aft', x: 11.4, z: -57.2, floor: DECK_AMIDSHIPS, cut: { x0: 9.3, x1: 13.8, z0: -59.4, z1: -55.2, top: 12.0 } },
].flatMap((l) => [-1, 1].map((sgn) => ({
  name: `${l.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * l.x, z: l.z, floor: l.floor,
  cut: { x0: sgn > 0 ? l.cut.x0 : -l.cut.x1, x1: sgn > 0 ? l.cut.x1 : -l.cut.x0, z0: l.cut.z0, z1: l.cut.z1, top: l.cut.top },
})));

{
  const raw = readGlb(ASSET('richelieu-super.glb'));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...superPoint(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const T = Array.from(raw.idx);
  const sup = { P, N, T, C: new Array(T.length / 3).fill(SUPER_GREY) };
  fixWinding(sup);
  const cut = (name, box) => {
    const r = boxCut(sup, box, { rescue: true });
    if (process.env.VERBOSE) console.log(`cut ${name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
    return r.cut;
  };
  // Its two ends, where the crop went through it, cut square and closed: its
  // forward end clear of II's gunhouse, its after end on her break.
  cut('forward end', { x0: -40, x1: 40, y0: -5, y1: 80, z0: 9.0, z1: 60 });
  cut('after end', { x0: -40, x1: 40, y0: -5, y1: 80, z0: -120, z1: -84.35 });
  cut('foot', { x0: -20, x1: 20, y0: -5, y1: BASE_TOP, z0: -84.4, z1: 9.1 });
  // The melted plates and lockers on the forward corners of her
  // superstructure deck, outboard of her conning tower and forward of the
  // tubs abreast it.
  for (const sgn of [-1, 1]) {
    cut('forward corner', { x0: sgn > 0 ? 5.6 : -15.5, x1: sgn > 0 ? 15.5 : -5.6, y0: BASE_TOP, y1: 13.5, z0: 4.6, z1: 9.1 });
  }
  let n = 0;
  for (const s of SECONDARY) n += cut(s.name, { ...s.cut, y0: s.cut.floor, y1: 40 });
  for (const d of DP) n += cut(d.name, { ...d.cut, y0: d.cut.floor + 0.02, y1: d.cut.top });
  for (const l of LIGHT) n += cut(l.name, { ...l.cut, y0: l.floor + 0.02, y1: l.cut.top });
  console.log(`cut: ${n} triangles of melted guns out of her upperworks, ${SECONDARY.length + DP.length + LIGHT.length} places`);
  // Her rigging, which the sculpt fused into her as tubes that sag between
  // her tower and her mack and hang off both into the air, comes off: all of
  // what stands in the open between them over her boats (RIGGED.gap), her
  // mack's masthead with its yards, gaff and the stumps they stood on
  // (RIGGED.mack -- richelieu.js steps a pole mast there afresh), the
  // derrick and torn sail abaft her cowl (RIGGED.cowl), and every spar or
  // wire elsewhere aloft. Then what is left of her upperworks is
  // drawn toward the fair surface through it -- a few centimetres at most,
  // flats kept flat and corners kept sharp. (Not the thin plate the sculpt
  // tore: that is most of her walls, drawn a sheet thick, and taking it off
  // opens her up.)
  {
    const spars = slender(sup, { only: (x, y) => y > BASE_TOP + 3 });
    const rigging = wires(sup, { only: (x, y) => y > BASE_TOP + 4 });
    const sheet = thinFaces(sup, 0.4);
    const { gap, mack, cowl } = RIGGED;
    const why = new Uint8Array(sup.T.length / 3);
    for (let t = 0; t < why.length; t++) {
      const [, y, z] = middle(sup, t);
      const [nx, ny, nz] = faceNormal(sup, sup.T[t * 3], sup.T[t * 3 + 1], sup.T[t * 3 + 2]);
      const onMack = z > mack.z0 && z < mack.z1;
      if (z > gap.z0 && z < gap.z1 && y > gap.y) why[t] = 1;
      else if (onMack && (y > mack.y || (y > mack.thin && sheet[t] && Math.abs(ny) < 0.5 * Math.hypot(nx, ny, nz)))) why[t] = 2;
      else if (z > cowl.z0 && z < cowl.z1 && y > cowl.y && sheet[t]) why[t] = 3;
      else if (spars[t] || rigging[t]) why[t] = 4;
    }
    const count = (k) => why.reduce((n, v) => n + (v === k ? 1 : 0), 0);
    console.log(`her rigging: ${count(1)} faces between her tower and her mack, ${count(2)} of her masthead, `
      + `${count(3)} abaft her cowl, ${count(4)} of spars and wires elsewhere, taken off`);
    Object.assign(sup, subMesh(sup, (t) => !why[t]));
    const thin = thinFaces(sup, 0.4);
    const d = denoise(sup, weld(sup), {
      sigmaS: 0.8, sigmaR: 0.33, normalIters: 8, vertexIters: 18, max: 0.25, only: (x, y, z, t) => !thin[t],
    });
    console.log(`her upperworks denoised: ${d.points} points, ${(d.movedMean * 100).toFixed(1)} cm on average`);
  }
  dropLoose(sup, { maxArea: 0.6, maxDiag: 1.2 });
  // Her core is found while what hangs in the air is still there: a sheet
  // that closed the front of a deckhouse, however torn, still says there was
  // a deckhouse there, and where it comes off the core stands in its place as
  // a plain wall.
  const core = solidCore(sup);
  // Less the crumbs of it that were the inside of a fold of that sheet.
  {
    const crumbs = components(core).filter((c) => c.lo[1] > BASE_TOP + 1.5
      && Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) < 2.5);
    const drop = new Set(crumbs.flatMap((c) => c.tris));
    Object.assign(core, subMesh(core, (t) => !drop.has(t)));
    console.log(`the core of her upperworks: ${crumbs.length} crumbs of it dropped`);
  }
  // And what the cut at her superstructure deck left lying on it: the
  // stumps of the melted lockers, vents and plates that stood there, each a
  // lump on its own, none of them two metres high; and what the sculpt and
  // the cuts left hanging in the air about her tower and her mack -- shards
  // and ribbons of plate, the stump of the yard, a sheet the forward cut left
  // folded in front of her tower -- joined to nothing and its foot well clear
  // of her superstructure deck.
  {
    const parts = components(sup);
    const drop = new Uint8Array(sup.T.length / 3);
    let lumps = 0, shards = 0;
    for (const c of parts.slice(1)) {
      const low = c.lo[1] < BASE_TOP + 0.3 && c.hi[1] < BASE_TOP + 2.0;
      const small = Math.hypot(c.hi[0] - c.lo[0], c.hi[2] - c.lo[2]) < 7;
      const shard = c.lo[1] > BASE_TOP + 1.5 && Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) < 15;
      if (!(low && small) && !shard) continue;
      for (const t of c.tris) drop[t] = 1;
      if (shard) shards++; else lumps++;
    }
    console.log(`her upperworks: ${shards} pieces hanging in the air taken off`);
    const T2 = [], C2 = [];
    for (let t = 0; t < sup.T.length / 3; t++) {
      if (drop[t]) continue;
      T2.push(sup.T[t * 3], sup.T[t * 3 + 1], sup.T[t * 3 + 2]); C2.push(sup.C[t]);
    }
    sup.T = T2; sup.C = C2;
    console.log(`her superstructure deck cleared of ${lumps} melted lumps`);
  }
  const { lo, hi } = bbox(sup);
  console.log(`her upperworks: ${sup.T.length / 3} triangles, from ${lo[2].toFixed(1)} to ${hi[2].toFixed(1)} m along her, `
    + `${lo[0].toFixed(1)} to ${hi[0].toFixed(1)} across, ${hi[1].toFixed(1)} m up`);
  append(m, sup);
  append(m, core);
}
{
  // The deckhouse under her upperworks: walls round its plan from a hand
  // under her upper deck up to BASE_TOP, and its roof -- her superstructure
  // deck -- laid across it a station at a time.
  const { P, N, T, C } = m;
  const y0 = DECK_AMIDSHIPS - 0.25, y1 = BASE_TOP;
  const add = (x, y, z) => { P.push(x, y, z); N.push(0, 1, 0); return P.length / 3 - 1; };
  const face = (a, b, c, paintOf, want) => {
    const n = faceNormal(m, a, b, c);
    T.push(...(n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0 ? [a, c, b] : [a, b, c]));
    C.push(paintOf);
  };
  const quad = (a, b, c, d, paintOf, want) => { face(a, b, c, paintOf, want); face(a, c, d, paintOf, want); };
  const plan = BASE_PLAN;
  let walls = 0;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i + 1 < plan.length; i++) {
      const [za, ha] = plan[i], [zb, hb] = plan[i + 1];
      // Facing out of her, square to the run from this point to the next.
      quad(add(sgn * ha, y0, za), add(sgn * hb, y0, zb), add(sgn * hb, y1, zb), add(sgn * ha, y1, za), GREY,
        [sgn * (za - zb), 0, hb - ha]);
      walls += 2;
    }
  }
  for (const [z, h, dir] of [[plan[0][0], plan[0][1], 1], [plan[plan.length - 1][0], plan[plan.length - 1][1], -1]]) {
    quad(add(-h, y0, z), add(h, y0, z), add(h, y1, z), add(-h, y1, z), GREY, [0, 0, dir]);
    walls += 2;
  }
  let roof = 0;
  for (let i = 0; i + 1 < plan.length; i++) {
    const [za, ha] = plan[i], [zb, hb] = plan[i + 1];
    quad(add(-ha, y1, za), add(ha, y1, za), add(hb, y1, zb), add(-hb, y1, zb), STEEL, [0, 1, 0]);
    roof += 2;
  }
  console.log(`the foot of her upperworks: a deckhouse ${plan[0][0]} to ${plan[plan.length - 1][0]} m along her, `
    + `${walls} faces of wall and ${roof} of deck`);
}
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
// Her upper deck and her quarterdeck are planked (laid above); her
// superstructure's decks, platforms and flats are steel, the dark grey of a
// deck that is walked on; and its walls the grey she wore in 1940.
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
const HM = { x0: -18, z0: -125, step: 0.5, nx: 73, nz: 501 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// The blue-grey of the Marine nationale over all of her, her planking, the
// dark grey of her steel decks, her black boot topping and her red bottom.
const PALETTE = [
  [0x8b, 0x93, 0x99],
  [0xa0, 0x95, 0x7c],
  [0x5c, 0x63, 0x69],
  [0x1a, 0x1c, 0x1f],
  [0x7c, 0x3a, 0x30],
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
//   file      the decimated sculpt (see build/richelieu-source.mjs)
//   scale     metres a unit of the sculpt
//   pivot     [x, z] of the pivot, in the sculpt; its barrels point -x
//   foot      the sculpt's y of the foot: everything under it is dropped
//   face      how far ahead of the pivot the barrels come out (sculpt units)
//   lanes     where across each barrel runs; barrelY its height at the face;
//             r how far out from its axis a barrel's skin is
//   trunnionIn  how far inside the face the trunnions are
function gunPiece(file, { scale, pivot, foot, face, lanes, barrelY, r, trunnionIn = 0.08, elev = 0, roofOver = 99 }) {
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
  const muzzles = lanes.map((l) => [+(l * scale).toFixed(3), 0, +tip.toFixed(3)]);
  console.log(`${file}: house ${house.T.length / 3} triangles, roof ${roof.toFixed(2)} m; barrels ${guns.T.length / 3} `
    + `triangles, trunnion ${yB.toFixed(2)} m up and ${tz.toFixed(2)} m ahead, ${tip.toFixed(2)} m to the muzzle`);
  return { house, guns, trunnion: [0, +yB.toFixed(3), +tz.toFixed(3)], muzzles, roof: +roof.toFixed(3) };
}
// The 380 mm quadruple, Mle 1935: 15.5 m a unit, which makes the ring it
// trains in fourteen and a half metres across -- the barbette the upperworks
// sculpt drew for it -- and its barrels, two pairs each in a cradle of its own
// in the turret, seventeen metres long.
const MAIN = gunPiece('richelieu-380.glb', {
  scale: 15.5, pivot: [0.313, 0], foot: -0.239, face: 0.493, lanes: [-0.2158, -0.0866, 0.0866, 0.2158],
  barrelY: -0.003, r: 0.05, trunnionIn: 0.1, roofOver: 4.0,
});
// The 152 mm triple, Mle 1936: 6.5 m a unit, which makes its gunhouse seven
// metres across, as the upperworks sculpt drew its turrets, and its ring the
// size of their barbettes.
const SEC = gunPiece('richelieu-152.glb', {
  scale: 6.5, pivot: [0.2636, 0], foot: -0.312, face: 0.514, lanes: [-0.2633, 0, 0.264],
  barrelY: -0.105, r: 0.045, trunnionIn: 0.08, elev: 0.02, roofOver: 1.5,
});
// The 100 mm twin, Mle 1931, in its enclosed shield: 4.5 m a unit, which makes
// it five metres across and three and a half high on its base, and its barrels
// as long as a 45-calibre 100 mm's.
const DPG = gunPiece('richelieu-100.glb', {
  scale: 4.5, pivot: [0.3007, 0], foot: -0.426, face: 0.506, lanes: [-0.1045, 0.1045],
  barrelY: 0.152, r: 0.05, trunnionIn: 0.03, elev: 0.051, roofOver: 99,
});

// ---- her lines, as the sculpt has them --------------------------------------------
// Measured on planes a few millimetres off the round metre: her topsides are
// lofted through stations on the half metre, and a plane through a station's
// points cuts each triangle there at a corner, where measureLines finds no
// crossing at all.
const LINES = measureLines(m, st, { z0: -122.9963, dz: 1, nz: 246, y0: -10, dy: 0.5, ny: 42 }, DECK_AMIDSHIPS);

// ---- slice, pack and write ------------------------------------------------------------
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 64, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const piece = (g) => ({
  trunnion: g.trunnion, muzzles: g.muzzles, roof: g.roof,
  house: packPiece(g.house).toString('base64'), guns: g.guns.T.length ? packPiece(g.guns).toString('base64') : null,
});
const mounts = {
  turrets: TURRETS,
  secondary: SECONDARY.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat: +seat.toFixed(3) })),
  dp: DP.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat })),
  light: LIGHT.map(({ name, x, z, floor }) => ({ name, x, z, floor: +floor.toFixed(3) })),
  breakZ: BREAK_Z, quarterdeck: +gunwaleAt(-100).y.toFixed(3), upperDeck: +DECK_AMIDSHIPS.toFixed(3),
  mast: MAST,
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-richelieu-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const RICHELIEU_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see richelieuSurfaceY.\n`
  + `export const RICHELIEU_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 380 mm turret, 152 mm turret and 100 mm mounting, as the owner sculpted\n`
  + `// them, each in the frame of its mounting.\n`
  + `export const RICHELIEU_GUNS = ${JSON.stringify({ main: piece(MAIN), sec: piece(SEC), dp: piece(DPG) })};\n`
  + `// Where her turrets, her 152 mm and her 100 mm stand, the floors of the tubs\n`
  + `// her light guns were cut out of, and her decks.\n`
  + `export const RICHELIEU_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const RICHELIEU_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
