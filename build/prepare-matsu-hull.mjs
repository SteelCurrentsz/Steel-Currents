// Turn the owner's IJN Matsu sculpts into what client/js/render/matsuHull.js
// ships: her hull and decks, her bridge, her funnels, her masts and her
// deckhouses as one painted mesh, and her two 12.7 cm Type 89 twins, her
// 25 mm Type 96 triple and her 61 cm quadruple bank of tubes as the owner
// sculpted them, cut so they train and elevate. In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a quarter turn, scaled to her 100 m, and floated at 3.3 m; her paint
//     (see build/matsu-source.mjs) rides along a triangle at a time;
//   * close every hole the sculpt had, each in its own plane;
//   * read her gunwale off her, a section every half metre: how far out her
//     side is at every height, each side, and where her deck edge is -- her
//     forecastle deck and, a deck lower, her upper deck abaft it;
//   * cut her two screws off their shafts (matsu.js draws two that turn);
//   * lift her bridge, her funnels, her masts and her deckhouses off her, a
//     hand over her deck edge, as the sculpt drew them, rigging and its
//     debris taken off them and the dents and drips the sculpt left smoothed
//     out;
//   * take everything else off her down to just over her waterline and draw
//     her topsides afresh off her own faired sections up to her gunwale,
//     joined to her underwater body point for point, and lay her deck across
//     them on the same points, so she is closed everywhere and no seam shows
//     daylight;
//   * stand her superstructure back on that deck, skirted down into it, with
//     the guns and the tubes the sculpt had cast in cut out;
//   * paint her decks, split her normals at every crease;
//   * read her surface off as a height map and her lines, which is what her
//     interior and armour are fitted under;
//   * take her guns and her tubes off the owner's sculpts of them, each in the
//     frame of its mounting, what elevates on a cradle of its own;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file matsuHull.js decodes synchronously.
//
//   node build/prepare-matsu-hull.mjs
//
// Reads assets/models/matsu-*.glb (made by build/matsu-source.mjs), writes
// client/js/render/matsuHull.data.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, boxCut, components, closeHoles,
  recomputeNormals, weld, stations, hardEdges, shadePlating, boxUvs, denoise, smoothFlats,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import { subMesh, dropLoose, thinFaces, creased, measureLines } from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/matsuHull.data.js');

const REAL_LOA = 100.0;
const DRAFT = 3.3;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern, and her keel, flat along the middle
// of her at -0.227 (see build/matsu-source.mjs). She is floated at her 3.3 m
// draft. A unit of the sculpt is 52.6 m of her, and her bow is at -X: so she
// is turned a quarter round,
//
//   world_X =  (local_Z - zc) * SCALE      (her starboard side, -Z, is -X)
//   world_Y =  (local_Y - localKeel) * SCALE
//   world_Z = -(local_X - xc) * SCALE
const SCULPT = { x0: -0.951, x1: 0.949 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: 0, SCALE: UNIT, localKeel: -0.227 + DRAFT / UNIT,
};

// Her paints, as build/matsu-source.mjs numbers them; and her superstructure's
// grey, which is grey that is left as its sculpt drew it -- not faired, not
// dropped for being small and apart -- until her decks are laid.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5;

/** The sculpt's own point `(lx, ly, lz)` in the game's frame. */
const toWorld = (lx, ly, lz, f = FRAME) => [(lz - f.zc) * f.SCALE, (ly - f.localKeel) * f.SCALE, -(lx - f.xc) * f.SCALE];

/** A painted decimation of her, in the game's frame, with a paint a triangle. */
function load(file) {
  const raw = readGlb(file);
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...toWorld(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
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

const m = load(ASSET('matsu-hull.glb'));
{
  const { lo, hi } = bbox(m);
  console.log('calibration: SCALE', FRAME.SCALE.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');
// Every hole the sculpt has, wherever it is -- the pinholes the decimator left
// where two of her plates met at a hair's angle, the open ends of her booms
// and her yards, the mouths her rigging left where it ran into a mast -- is
// closed in its own plane, before anything else is done to her.
{
  const s = closeHoles(m, new Uint8Array(m.T.length / 3).fill(1), () => null, { open: true });
  console.log(`holes closed: ${s.loops} (${s.capped} triangles, ${s.fanned} fanned)`);
}

// ---- her gunwale ------------------------------------------------------------------
// A section through her every half metre of her length: how far out her side
// is at every fifth of a metre of height, each side. Her gunwale is the top of
// her side -- walking up it from her waterline, the last height at which it
// is still her side and not something standing on her deck, which is
// anything less than `keep` of the breadth she has under it. Each side is
// read on its own: the sculpt drew her a few centimetres broader to one side
// than the other in places, and her deck is laid out to each side where it is.
const GUNWALE = { z0: -51, dz: 0.5, n: 205, keep: 0.65, step: 0.2, under: 0.4 };
/** Where her forecastle breaks to her upper deck. */
export const BREAK = 14.7;
// Her upper deck at 2.8 m over her waterline from her quarter to her
// forecastle, rising aft over her counter and forward to the break; her
// forecastle deck at 4.8 m, rising from her forward mounting to 7 m at her
// stem. As her gunwale reads it, a section at a time.
const SHEER = [[-51, 3.65], [-48, 3.4], [-46, 3.2], [-44, 3.0], [-42, 2.8], [10, 2.8], [BREAK, 3.4], [BREAK + 0.01, 4.8],
  [28, 4.8], [33, 5.05], [39, 5.5], [42, 5.9], [44, 6.2], [47, 6.6], [49, 7.0], [51, 7.2]];
/** Her deck edge, over her waterline, at z. */
export function sheerAt(z) {
  if (z <= SHEER[0][0]) return SHEER[0][1];
  for (let i = 1; i < SHEER.length; i++) {
    const [z0, y0] = SHEER[i - 1], [z1, y1] = SHEER[i];
    if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return SHEER[SHEER.length - 1][1];
}
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
      // What her side is told from a deckhouse by is her breadth from the
      // waterline up.
      if (y < 0) continue;
      if (top !== null && y > top + 0.6) break;
      if (w >= GUNWALE.keep * under) { under = Math.max(under, w); top = y; }
    }
    if (top !== null) ys[k] = top;
  }
  if (process.env.RAW) console.log(Array.from(ys).map((y, k) => (k % 4 ? null : `${GUNWALE.z0 + k * GUNWALE.dz}:${y.toFixed(2)}`)).filter(Boolean).join(' '));
  // Her sheer, as those readings have it (see SHEER): set here, not run
  // smooth, since a running mean would draw the break of her forecastle as a
  // ramp.
  const gy = Float64Array.from(ys, (v, k) => (Number.isNaN(v) ? v : sheerAt(GUNWALE.z0 + k * GUNWALE.dz)));
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
  + [-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 12, 14, 15, 20, 25, 30, 35, 40, 45, 50].map((z) => {
    const g = gunwaleAt(z);
    return `${z}:${g.y.toFixed(2)}/${g.halves.map((h) => h.toFixed(2)).join('|')}`;
  }).join(' '));
if (process.env.PROFILE) {
  for (const z of process.env.PROFILE.split(',').map(Number)) {
    const k = Math.round((z - GUNWALE.z0) / GUNWALE.dz);
    for (const sd of [0, 1]) {
      const mp = gunwale.side[sd][k];
      console.log(`z ${z} side ${sd}: ` + [...mp.keys()].sort((a, b) => a - b).filter((q) => q * GUNWALE.step > -1)
        .map((q) => `${(q * GUNWALE.step).toFixed(2)}:${mp.get(q).toFixed(1)}`).join(' '));
    }
  }
}
if (process.env.STAGE === 'gunwale') process.exit(0);

// ---- her screws -------------------------------------------------------------------
// Two shafts, their screws just ahead of her rudder. The sculpt drew each screw
// on the end of its shaft; it is cut off, and matsu.js draws a three-bladed
// one there that turns.
export const SCREWS = [
  { x: -2.8, y: -2.2, z: -42.5, r: 1.05 },
  { x: 2.8, y: -2.2, z: -42.5, r: 1.05 },
];
for (const sc of SCREWS) {
  const r = boxCut(m, { x0: sc.x - 1.3, x1: sc.x + 1.3, y0: sc.y - 1.3, y1: sc.y + 1.3, z0: sc.z - 0.45, z1: sc.z + 0.45 }, { rescue: true });
  console.log(`screw at ${sc.x}, ${sc.z}: ${r.cut} triangles cut, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
}

// ---- her superstructure, lifted off her ---------------------------------------------
// Her bridge, her funnels, her masts and her deckhouses are the sculpt's own,
// as it drew them standing on her: everything a hand over her deck edge (LIFT)
// and inside her side is taken off her before her topsides are drawn afresh,
// cut along that line exactly. Where a wall was cut, a skirt is let down from
// it, square, to SINK under her deck -- so every house stands in her new deck,
// not a hand over it on nothing -- and it is laid back on her when her deck is
// (see below).
export const LIFT = 0.25, SINK = 0.4;
const SUPER_SIDE = 0.2;
/** Cut `mesh` along y = level(z), in place, to what is under it; returns the triangles over it. */
function splitAlong(mesh, level) {
  const { P, N, T, C } = mesh;
  const made = new Map();
  const side = (v) => P[v * 3 + 1] - level(P[v * 3 + 2]);
  const cross = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (made.has(k)) return made.get(k);
    const sa = side(a), sb = side(b), f = sa / (sa - sb);
    const z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * f;
    P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * f, level(z), z);
    N.push(N[a * 3], N[a * 3 + 1], N[a * 3 + 2]);
    const w = P.length / 3 - 1;
    made.set(k, w);
    return w;
  };
  const lo = { T: [], C: [] }, hi = { T: [], C: [] };
  for (let t = 0; t < T.length / 3; t++) {
    const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
    const sd = v.map(side);
    if (sd.every((d) => d <= 1e-7)) { lo.T.push(...v); lo.C.push(C[t]); continue; }
    if (sd.every((d) => d >= -1e-7)) { hi.T.push(...v); hi.C.push(C[t]); continue; }
    for (const [out, sgn] of [[lo, -1], [hi, 1]]) {
      const poly = [];
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3], da = sd[j] * sgn, db = sd[(j + 1) % 3] * sgn;
        if (da >= -1e-7) poly.push(a);
        if ((da < -1e-7 && db > 1e-7) || (da > 1e-7 && db < -1e-7)) poly.push(cross(a, b));
      }
      for (let j = 1; j + 1 < poly.length; j++) { out.T.push(poly[0], poly[j], poly[j + 1]); out.C.push(C[t]); }
    }
  }
  mesh.T = lo.T; mesh.C = lo.C;
  return { P, N, T: hi.T, C: hi.C };
}

// ---- her funnels, lofted afresh ------------------------------------------------------
// Her two funnels as the sculpt drew them -- a little over two metres through,
// oval, raked aft -- with dents and drips down them. Each is lofted afresh off
// its own sections, every thirty centimetres of its height: how far out it is
// each way round its middle, run smooth round it and up it, about middles
// that run up it on a straight line, so it keeps its rake. Its foot is let
// down into the casing it stands on, and its top is open: a lip round it and
// a lining a metre and a half down inside it, the black of a funnel's mouth.
export const FUNNELS = [
  { name: 'fore funnel', x0: -1.3, x1: 1.3, z0: 3.0, z1: 6.9, y0: 5.0, y1: 10.55, sink: 0.4 },
  { name: 'after funnel', x0: -1.3, x1: 1.3, z0: -13.8, z1: -10.4, y0: 6.5, y1: 10.6, sink: 0.5 },
];
const BLACK = 3;
function loftFunnel(sup, F) {
  const inBox = (x, y, z) => x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1 && y > F.y0 - 0.05;
  const NA = 40;
  const levels = [];
  for (let y = F.y0; y <= F.y1 + 1e-6; y += 0.3) {
    const pts = [];
    for (let t = 0; t < sup.T.length / 3; t++) {
      const v = [0, 1, 2].map((j) => sup.T[t * 3 + j] * 3);
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3];
        const ya = sup.P[a + 1], yb = sup.P[b + 1];
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        const f = (y - ya) / (yb - ya);
        const x = sup.P[a] + (sup.P[b] - sup.P[a]) * f, z = sup.P[a + 2] + (sup.P[b + 2] - sup.P[a + 2]) * f;
        if (inBox(x, y, z)) pts.push([x, z]);
      }
    }
    if (pts.length < 12) continue;
    const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
    const cz = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
    const r = new Float64Array(NA);
    for (const [x, z] of pts) {
      const k = ((Math.round(Math.atan2(x - cx, z - cz) / (2 * Math.PI) * NA) % NA) + NA) % NA;
      r[k] = Math.max(r[k], Math.hypot(x - cx, z - cz));
    }
    for (let k = 0; k < NA; k++) if (!r[k]) r[k] = Math.max(r[(k + NA - 1) % NA], r[(k + 1) % NA]);
    const sorted = Array.from(r).sort((p, q) => p - q), med = sorted[NA >> 1];
    for (let k = 0; k < NA; k++) r[k] = Math.min(Math.max(r[k], med * 0.8), med * 1.15);
    levels.push({ y, cx, cz, r });
  }
  if (levels.length < 4) { console.log(`${F.name}: too few sections, left as it is`); return sup; }
  // Its middles on a straight line up it.
  const n = levels.length, my = levels.reduce((q, l) => q + l.y, 0) / n;
  const fit = (k) => {
    const m0 = levels.reduce((q, l) => q + l[k], 0) / n;
    const sl = levels.reduce((q, l) => q + (l.y - my) * (l[k] - m0), 0) / levels.reduce((q, l) => q + (l.y - my) ** 2, 0);
    return (y) => m0 + sl * (y - my);
  };
  const fx = fit('cx'), fz = fit('cz');
  // Round each section and up it.
  const smoothRound = (r) => Float64Array.from(r, (_, k) => (r[(k + NA - 2) % NA] + 2 * r[(k + NA - 1) % NA] + 3 * r[k]
    + 2 * r[(k + 1) % NA] + r[(k + 2) % NA]) / 9);
  for (const L of levels) L.r = smoothRound(smoothRound(smoothRound(L.r)));
  const up = levels.map((L, i) => {
    const w = levels.slice(Math.max(0, i - 3), i + 4);
    return { y: L.y, r: Float64Array.from(L.r, (_, k) => w.reduce((q, l) => q + l.r[k], 0) / w.length) };
  });
  up.unshift({ ...up[0], y: F.y0 - F.sink });
  const n0 = sup.T.length / 3;
  const out = subMesh(sup, (t) => !inBox(...middle(sup, t)));
  const base = out.P.length / 3;
  const ring = (L, scale = 1, y = L.y) => {
    const first = out.P.length / 3;
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * 2 * Math.PI;
      out.P.push(fx(y) + Math.sin(a) * L.r[k] * scale, y, fz(y) + Math.cos(a) * L.r[k] * scale);
      out.N.push(Math.sin(a), 0, Math.cos(a));
    }
    return first;
  };
  const rings = up.map((L) => ring(L));
  const band = (a0, b0, paint, flipIt = false) => {
    for (let k = 0; k < NA; k++) {
      const a = a0 + k, a1 = a0 + (k + 1) % NA, b = b0 + k, b1 = b0 + (k + 1) % NA;
      if (flipIt) out.T.push(a, a1, b, a1, b1, b); else out.T.push(a, b, a1, a1, b, b1);
      out.C.push(paint, paint);
    }
  };
  for (let i = 0; i + 1 < rings.length; i++) band(rings[i], rings[i + 1], SUPER_GREY);
  // The lip, and the lining inside it down to a black floor.
  const top = up[up.length - 1];
  const lip = ring(top, 0.9);
  band(rings[rings.length - 1], lip, SUPER_GREY);
  const deep = ring(top, 0.9, top.y - 1.5);
  band(lip, deep, BLACK, true);
  const ci = out.P.length / 3;
  out.P.push(fx(top.y - 1.5), top.y - 1.5, fz(top.y - 1.5)); out.N.push(0, 1, 0);
  for (let k = 0; k < NA; k++) { out.T.push(deep + k, deep + (k + 1) % NA, ci); out.C.push(BLACK); }
  console.log(`${F.name}: ${n0 - (out.T.length / 3 - (rings.length + 1) * NA * 2 - NA)} faces of the sculpt lofted afresh `
    + `in ${up.length} sections, ${top.y.toFixed(1)} m high, ${(2 * Math.max(...top.r)).toFixed(2)} m through`);
  void base;
  return out;
}

const superLevel = (z) => gunwaleAt(z).y + LIFT;
let SUP = null;
{
  const above = splitAlong(m, superLevel);
  // Inside her side: what stands out past it -- her booms, her paravanes --
  // is not her superstructure.
  const inside = (t) => {
    const [cx, , cz] = middle(above, t);
    const g = gunwaleAt(cz);
    return !Number.isNaN(g.half) && Math.abs(cx) < g.half - SUPER_SIDE;
  };
  let sup = subMesh(above, inside);
  // Its rim along the cut, walked edge by edge: each edge that only one
  // triangle has, both of whose ends are on the cut, has a skirt let down
  // from it.
  const onCut = (v) => Math.abs(sup.P[v * 3 + 1] - superLevel(sup.P[v * 3 + 2])) < 1e-5;
  const uses = new Map();
  const ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let t = 0; t < sup.T.length; t += 3) {
    for (let j = 0; j < 3; j++) {
      const k = ek(sup.T[t + j], sup.T[t + (j + 1) % 3]);
      uses.set(k, (uses.get(k) || 0) + 1);
    }
  }
  const low = new Map();
  const lowOf = (v) => {
    if (!low.has(v)) {
      const z = sup.P[v * 3 + 2];
      sup.P.push(sup.P[v * 3], gunwaleAt(z).y - SINK, z);
      sup.N.push(sup.N[v * 3], 0, sup.N[v * 3 + 2]);
      low.set(v, sup.P.length / 3 - 1);
    }
    return low.get(v);
  };
  const nT = sup.T.length;
  let skirt = 0;
  for (let t = 0; t < nT; t += 3) {
    for (let j = 0; j < 3; j++) {
      const a = sup.T[t + j], b = sup.T[t + (j + 1) % 3];
      if (uses.get(ek(a, b)) !== 1 || !onCut(a) || !onCut(b)) continue;
      // The triangle runs a to b; its skirt, beside it, runs b to a.
      const a2 = lowOf(a), b2 = lowOf(b);
      sup.T.push(b, a, a2, b, a2, b2);
      skirt += 2;
    }
  }
  sup.C = new Array(sup.T.length / 3).fill(SUPER_GREY);
  // What is left of her rigging's blocks and of her fittings that only the
  // cut left standing on their own, small and apart, goes.
  dropLoose(sup, { maxArea: 0.15, maxDiag: 0.6 });
  // And whatever is small and hangs high up on its own -- a gaff off her
  // mainmast, a yardarm that only her rigging held there -- goes too.
  {
    const drop = new Uint8Array(sup.T.length / 3);
    let n = 0;
    for (const c of components(sup).slice(1)) {
      let area = 0;
      for (const t of c.tris) { const f = faceNormal(sup, sup.T[t * 3], sup.T[t * 3 + 1], sup.T[t * 3 + 2]); area += Math.hypot(...f) / 2; }
      if (area > 2 || c.lo[1] < 9) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    sup = subMesh(sup, (t) => !drop[t]);
    console.log(`her superstructure: ${n} loose pieces aloft dropped`);
  }
  // Smoothed: the sculpt drew her houses, her bridge and her funnels with
  // drips down them and dents in them. The dents and the drips are taken out of every
  // face of her that is nearly flat and the corners and creases between them
  // left where they are, so a wall is flat and an edge is still an edge.
  {
    const canon = weld(sup);
    const d = denoise(sup, canon, { sigmaS: 0.4, sigmaR: 0.35, normalIters: 8, vertexIters: 20, max: 0.15 });
    const f = smoothFlats(sup, canon, { passes: 10, max: 0.12, flat: 22 });
    console.log(`her superstructure smoothed: ${d.movedMax !== undefined ? d.movedMax.toFixed(2) : '?'} m by its faces, `
      + `${f.movedMax.toFixed(2)} m on its flats`);
  }
  for (const F of FUNNELS) sup = loftFunnel(sup, F);
  SUP = sup;
  const { lo, hi } = bbox(sup);
  console.log(`her superstructure: ${sup.T.length / 3} triangles, ${skirt} of them skirts, from ${lo[2].toFixed(1)} to `
    + `${hi[2].toFixed(1)} m along her, ${hi[1].toFixed(1)} m up`);
}
dropLoose(m, { maxArea: 1, maxDiag: 2 });
// ---- her topsides, drawn afresh ------------------------------------------------------
// Over her waterline the sculpt melted: her anchors are lumps on her bow,
// and everything that stood on her deck edge -- boats, booms, rails, her
// paravanes -- came down her side in drips. Under her waterline she is clean. So
// she is cut level `CUT` over her waterline, and her side from there up to
// her gunwale is drawn afresh off her own sections, faired: at every station
// and height, the median of how far out she is over three metres either way
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
// Her rows are at fixed heights, half a metre apart, closest where her flare
// turns; every row is held a hand under the next where her deck comes down
// to it, and the last is her deck edge.
const CUT = 0.3, BOOT_TOP = 0.5;
const ROW_Y = [0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];
const ROWS = ROW_Y.length + 1;
const rowY = (j, gy) => (j >= ROWS ? gy : Math.min(ROW_Y[j - 1] ?? BOOT_TOP, gy - (ROWS - j + 1) * 0.05));
const FAIR = { r: 6, mean: 2 };
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
      // what is read is whatever stood on it, not her side.
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
      // Its height is her last station's: past it her gunwale reads nothing.
      const zz = z + k * w;
      P.push(0, yOf(z, gunwaleAt(z).y), zz); N.push(0, 0, Math.sign(k));
      return P.length / 3 - 1;
    };
    const stern = end(0, -0.2), stem = end(stb.length - 1, 0.25);
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
      const ox = cx, oz = Math.abs(cz) > 38 ? cz - Math.sign(cz) * 38 : 0;
      m.T.push(...(nx * ox + nz * oz >= 0 ? tri : [tri[0], tri[2], tri[1]]));
      m.C.push(paint);
      n++;
    }
    return n;
  };
  const rows = [{ loop: rim }];
  for (let j = 1; j <= ROWS; j++) rows.push(rowAt((z, gy) => rowY(j, gy)));
  let sideTris = 0;
  for (let j = 0; j < ROWS; j++) sideTris += zip(rows[j].loop, rows[j + 1].loop, j === 0 ? 3 : GREY);

  // ---- her deck, across her top row ----
  // A row across her at each of her stations, from her starboard gunwale to
  // her port one through points no more than a metre apart, each stitched
  // to the next; and a fan from each end of her into the first and last.
  const top = rows[ROWS];
  const across = top.stb.map((sv, i) => {
    const pv = top.prt[i];
    const xa = P[sv * 3], xb = P[pv * 3], y = P[sv * 3 + 1], z = P[sv * 3 + 2];
    const n = Math.max(1, Math.ceil((xb - xa) / 1.0));
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

// ---- her guns and her tubes: where each stands -------------------------------------
// Where the sculpt of her hull drew each of them, measured off it: her two
// 12.7 cm twins -- the one in its shield on her forecastle, laid over her bow,
// and the open one on her upper deck aft, laid over her stern; her bank of
// tubes on her centreline between her funnels, stowed with its muzzles
// forward under the platform her midships 25 mm stand on; and her four 25 mm
// triples, two on the wings of that platform, one on the bandstand abaft her
// after funnel and one on the platform over her after deckhouse. Each was
// cast into her, and is cut out of her -- `cut` round it, from a hand over the
// floor it stands on up -- and matsu.js stands the owner's sculpt of it there.
// `floor` is the floor each stands on, as the sculpt has it: the ring her
// forward twin trains on, the ring under the after one, the platform over her
// waist, the bandstand and the after platform; the tubes stand on her deck.
// The rings her twins stand on the sculpt melted into ragged plates, and are
// taken off `whole` with the guns: matsu.js stands each twin on a ring of its
// own at the same height.
export const MOUNTS = [
  { name: 'fwd', kind: 'shield', x: 0, z: 31.7, rest: 0, floor: 5.3, whole: true, cut: { x0: -3.7, x1: 3.7, z0: 27.4, z1: 38.8 } },
  { name: 'aft', kind: 'open', x: 0, z: -33.9, rest: Math.PI, floor: 3.3, whole: true, cut: { x0: -3.7, x1: 3.7, z0: -39.0, z1: -29.8 } },
  { name: 'tubes', kind: 'tubes', x: 0, z: -1.9, rest: 0, floor: 'deck', cut: { x0: -3.9, x1: 3.9, z0: -4.9, z1: 2.8 } },
  { name: 'aa port', kind: 'aa', x: 3.77, z: -6.97, rest: Math.PI / 2, floor: 5.4, r: 1.3 },
  { name: 'aa stbd', kind: 'aa', x: -3.77, z: -6.97, rest: -Math.PI / 2, floor: 5.4, r: 1.3 },
  { name: 'aa bandstand', kind: 'aa', x: 0.07, z: -14.78, rest: Math.PI, floor: 5.45, r: 1.35 },
  { name: 'aa aft', kind: 'aa', x: 0, z: -24.85, rest: Math.PI, floor: 6.7, r: 1.35 },
];

// And what the sculpt drew on her quarterdeck for her depth charge rails --
// a bed of drums melted into one lump -- and the ensign staff over it: taken
// off her, and matsu.js draws her rails, her throwers and her staff afresh.
export const STERN_CUT = { x0: -4.2, x1: 4.2, y0: -1, y1: 14, z0: -51, z1: -38.8 };
// And under the platform over her waist, the legs it stood on, which the
// sculpt drew as drips: taken off from her deck to a hand under the platform,
// and matsu.js stands it on posts at its corners, clear of where her tubes
// swing under it.
export const PLATFORM = { x0: -4.9, x1: 4.9, z0: -9.4, z1: -4.9, top: 5.4 };
const UNDER_PLATFORM = { ...PLATFORM, y0: -1, y1: PLATFORM.top - 0.35 };

/**
 * Take out every triangle of her superstructure with a corner in the box.
 * Not boxCut: a mounting is a piece standing on its floor, and taking it
 * whole off leaves the floor under it, which is closed.
 */
function dropBox(mesh, box) {
  let n = 0;
  const keep = new Uint8Array(mesh.T.length / 3).fill(1);
  for (let t = 0; t < keep.length; t++) {
    if (mesh.C[t] !== SUPER_GREY) continue;
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
  const sup = SUP;
  for (const mt of MOUNTS) {
    const r = mt.r || 2.5;
    // A mounting on her deck itself stands on her deck.
    if (mt.floor === 'deck') mt.floor = +gunwaleAt(mt.z).y.toFixed(3);
    const box = mt.cut || { x0: mt.x - r, x1: mt.x + r, z0: mt.z - r, z1: mt.z + r };
    const n = dropBox(sup, { ...box, y0: mt.whole ? -1 : mt.floor + 0.12, y1: mt.floor + 7 });
    console.log(`${mt.name}: floor ${mt.floor.toFixed(2)} m, ${n} triangles cut`);
  }
  console.log(`her quarterdeck: ${dropBox(sup, STERN_CUT)} triangles cut`);
  console.log(`under her waist platform: ${dropBox(sup, UNDER_PLATFORM)} triangles cut`);
  // What the cuts left standing on its own, and every scrap of rail and wire
  // the sculpt drew in the air that is not part of anything: a piece of less
  // than a square metre on its own, or of less than four standing clear over
  // her decks, is a remnant.
  dropLoose(sup, { maxArea: 1.0, maxDiag: 1.6 });
  {
    const drop = new Uint8Array(sup.T.length / 3);
    let n = 0;
    for (const c of components(sup).slice(1)) {
      let area = 0;
      for (const t of c.tris) { const f = faceNormal(sup, sup.T[t * 3], sup.T[t * 3 + 1], sup.T[t * 3 + 2]); area += Math.hypot(...f) / 2; }
      if (area > 4 || c.lo[1] < gunwaleAt((c.lo[2] + c.hi[2]) / 2).y + 1.2) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    const kept = subMesh(sup, (t) => !drop[t]);
    sup.P = kept.P; sup.N = kept.N; sup.T = kept.T; sup.C = kept.C;
    console.log(`her superstructure: ${n} scraps in the air dropped`);
  }
  // Where a pedestal went down through a platform the cut leaves a hole in
  // it; matsu.js lays a plate over each, under the mounting that stands there.
  append(m, sup);
}

/**
 * Every face of her turned out. The sculpt was drawn to be seen from both
 * sides, and its winding says nothing: a deckhouse roof can face into the
 * house and its walls out of it. A face drawn inward is a hole in her when
 * only the outside of her is drawn. So each piece of her -- everything joined
 * to everything else through edges two faces share -- is first wound one way
 * throughout, each face against its neighbours, and then the whole piece is
 * turned so it faces out of itself: so the volume it closes is positive. A
 * piece that closes next to nothing -- a plate, a rail, as thin on the whole
 * as three centimetres -- faces up if it lies
 * flat and away from her centreline if it stands. Returns how many faces
 * were turned.
 */
function orient(mesh) {
  const { P, T } = mesh;
  const nf = T.length / 3;
  const canon = weld(mesh);
  const edges = new Map();
  for (let t = 0; t < nf; t++) {
    for (let j = 0; j < 3; j++) {
      const a = canon[T[t * 3 + j]], b = canon[T[t * 3 + (j + 1) % 3]];
      if (a === b) continue;
      const k = a < b ? a * 4194304 + b : b * 4194304 + a;
      let e = edges.get(k);
      if (!e) edges.set(k, (e = []));
      e.push(t);
    }
  }
  // Does face t run the edge a->b forward?
  const runs = (t, a, b) => {
    for (let j = 0; j < 3; j++) if (canon[T[t * 3 + j]] === a && canon[T[t * 3 + (j + 1) % 3]] === b) return true;
    return false;
  };
  const flip = (t) => { const b = T[t * 3 + 1]; T[t * 3 + 1] = T[t * 3 + 2]; T[t * 3 + 2] = b; };
  const seen = new Uint8Array(nf);
  let turned = 0;
  for (let t0 = 0; t0 < nf; t0++) {
    if (seen[t0]) continue;
    const piece = [t0];
    seen[t0] = 1;
    const flipped = [];
    for (let q = 0; q < piece.length; q++) {
      const t = piece[q];
      for (let j = 0; j < 3; j++) {
        const a = canon[T[t * 3 + j]], b = canon[T[t * 3 + (j + 1) % 3]];
        if (a === b) continue;
        const e = edges.get(a < b ? a * 4194304 + b : b * 4194304 + a);
        if (e.length !== 2) continue;
        const u = e[0] === t ? e[1] : e[0];
        if (seen[u]) continue;
        seen[u] = 1;
        // Its neighbour runs the edge the other way, or it is wound against her.
        if (runs(u, a, b)) { flip(u); flipped.push(u); }
        piece.push(u);
      }
    }
    turned += flipped.length;
    // Which way the piece faces: the volume it closes, about its own middle.
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const t of piece) for (let j = 0; j < 3; j++) { const v = T[t * 3 + j] * 3; cx += P[v]; cy += P[v + 1]; cz += P[v + 2]; n++; }
    cx /= n; cy /= n; cz /= n;
    let vol = 0, area = 0, up = 0, out = 0;
    for (const t of piece) {
      const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      const ax = P[a] - cx, ay = P[a + 1] - cy, az = P[a + 2] - cz;
      const bx = P[b] - cx, by = P[b + 1] - cy, bz = P[b + 2] - cz;
      const qx = P[c] - cx, qy = P[c + 1] - cy, qz = P[c + 2] - cz;
      vol += ax * (by * qz - bz * qy) + ay * (bz * qx - bx * qz) + az * (bx * qy - by * qx);
      const [fx, fy, fz] = faceNormal(mesh, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
      const fa = Math.hypot(fx, fy, fz);
      area += fa;
      up += fy;
      out += fx * Math.sign((P[a] + P[b] + P[c]) / 3 || 1);
    }
    vol /= 6; area /= 2;
    // How thick it is, on the whole: what it closes over what it is.
    const plate = Math.abs(vol) < 0.03 * area;
    let wrong;
    if (!plate) wrong = vol < 0;
    else wrong = Math.abs(up) >= Math.abs(out) ? up < 0 : out < 0;
    if (wrong) {
      for (const t of piece) flip(t);
      turned += piece.length - 2 * flipped.length;
    }
  }
  return turned;
}
const DECK_AMIDSHIPS = gunwaleAt(0).y;
dropLoose(m, { maxArea: 1, maxDiag: 2 });
console.log(`faces turned out: ${orient(m)}`);
recomputeNormals(m);

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const paintOf = new Float32Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOf[m.T[t * 3 + j]] = m.C[t];
  writeGlb(process.env.DUMP, { P: m.P, N: m.N, T: m.T, paint: paintOf }, 'dump');
  if (process.env.STAGE === 'dump') process.exit(0);
}

// ---- her decks -------------------------------------------------------------------
// Her weather decks, forecastle and upper deck, are laid in the linoleum an
// IJN destroyer's were (laid above); her superstructure's decks, platforms
// and flats are steel, the dark grey of a deck that is walked on; and its
// walls the grey of her sides.
{
  const { T, C } = m;
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
const st = stations(m, { length: REAL_LOA, beamCap: DECK_AMIDSHIPS - 0.2, edgeCap: 4.0, slice: true, beamFloor: 0 });
recomputeNormals(m);
canon = weld(m);
const thin = thinFaces(m, 0.25);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: -1.6, smooth: thin,
});
shadePlating(m, plating, { along: 2.0, up: 0.4 });

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -6, z0: -51, step: 0.25, nx: 49, nz: 409 };
const hm = heightmap(m, HM);
/** The median of her surface within `r` of (x, z): where a mounting stands. */
function seatOf(x, z, r) {
  const hs = [];
  for (let dz = -r; dz <= r + 1e-6; dz += HM.step) {
    for (let dx = -r; dx <= r + 1e-6; dx += HM.step) {
      if (dx * dx + dz * dz > r * r) continue;
      const i = Math.round((x + dx - HM.x0) / HM.step), j = Math.round((z + dz - HM.z0) / HM.step);
      if (i >= 0 && j >= 0 && i < HM.nx && j < HM.nz && hm[j * HM.nx + i] > -50) hs.push(hm[j * HM.nx + i]);
    }
  }
  hs.sort((p, q) => p - q);
  return hs[hs.length >> 1];
}
// Each stands on its floor; and the floor is checked against her surface as
// it is now, so a platform the cut took with it is caught here.
for (const mt of MOUNTS) {
  mt.seat = mt.floor;
  const under = seatOf(mt.x, mt.z, mt.kind === 'aa' ? 0.6 : 1.0);
  console.log(`${mt.name} stands at ${mt.seat} m, on her surface at ${under.toFixed(2)} m`);
}

// ---- paint -----------------------------------------------------------------------------
// Her grey, the brown linoleum of her weather decks, the dark grey of her
// steel decks, her black boot topping and her red bottom.
const PALETTE = [
  [0x6a, 0x72, 0x7c],
  [0x7a, 0x62, 0x4e],
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
// of what trains at y = 0, the bore along +z. What elevates -- `cradle(x, y, z)`
// in the sculpt's own coordinates -- is lifted off it and goes on the cradle,
// about `trunnion` ([x, y] in the sculpt, on the middle of its bores); what is
// left trains. Guns sculpted laid up at `elev` are turned down level about
// their trunnions, so the cradle lays them.
//
//   facing    '-x' if its bores point -x in the sculpt, '+x' if +x
//   pivot     [x, z] of the pivot, in the sculpt
//   foot      the sculpt's y of the foot: everything under it is dropped
//   lanes     where across each bore runs, from the pivot, in the sculpt
function gunPiece(file, { scale, pivot, facing, foot, cradle, trunnion, elev = 0, lanes }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  const toLocal = (x, y, z) => (facing === '-x'
    ? [(z - pivot[1]) * scale, (y - foot) * scale, -(x - pivot[0]) * scale]
    : [-(z - pivot[1]) * scale, (y - foot) * scale, (x - pivot[0]) * scale]);
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...toLocal(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(...(facing === '-x' ? [raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]] : [-raw.nrm[i + 2], raw.nrm[i + 1], raw.nrm[i]]));
  }
  const mesh = { P, N, T: Array.from(raw.idx) };
  fixWinding(mesh);
  const fromLocal = (x, y, z) => (facing === '-x'
    ? [pivot[0] - z / scale, y / scale + foot, pivot[1] + x / scale]
    : [pivot[0] + z / scale, y / scale + foot, pivot[1] - x / scale]);
  const isCradle = (t) => cradle(...fromLocal(...middle(mesh, t)));
  const above = (t) => {
    for (let j = 0; j < 3; j++) if (mesh.P[mesh.T[t * 3 + j] * 3 + 1] < -1e-3) return false;
    return true;
  };
  const house = roofed(subMesh(mesh, (t) => above(t) && !isCradle(t)), 99);
  dropLoose(house, { maxArea: 0.05 * scale * scale, maxDiag: 0.15 * scale });
  creased(house, 40);
  const [, ty, tz] = toLocal(trunnion[0], trunnion[1], pivot[1]);
  const guns = subMesh(mesh, (t) => isCradle(t));
  // Into the frame of the cradle -- origin on the trunnions, bore along +z --
  // and turned down level if it was sculpted laid up.
  const c = Math.cos(elev), s = Math.sin(elev);
  for (let i = 0; i < guns.P.length; i += 3) {
    const y = guns.P[i + 1] - ty, z = guns.P[i + 2] - tz;
    guns.P[i + 1] = y * c - z * s; guns.P[i + 2] = y * s + z * c;
    const ny = guns.N[i + 1], nz = guns.N[i + 2];
    guns.N[i + 1] = ny * c - nz * s; guns.N[i + 2] = ny * s + nz * c;
  }
  creased(guns, 40);
  const laneX = lanes.map((l) => (facing === '-x' ? l : -l) * scale);
  // Where each bore ends, along it: the most forward point of the cradle
  // within a barrel's reach of its lane.
  let tip = 0;
  for (let i = 0; i < guns.P.length; i += 3) {
    if (laneX.some((lx) => Math.hypot(guns.P[i] - lx, guns.P[i + 1]) < 0.3)) tip = Math.max(tip, guns.P[i + 2]);
  }
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const muzzles = laneX.map((x) => [+x.toFixed(3), 0, +tip.toFixed(3)]);
  console.log(`${file}: house ${house.T.length / 3} triangles, roof ${roof.toFixed(2)} m; cradle ${guns.T.length / 3} `
    + `triangles, trunnion ${ty.toFixed(2)} m up and ${tz.toFixed(2)} m ahead, ${tip.toFixed(2)} m to the muzzle`);
  return { house, guns, trunnion: [0, +ty.toFixed(3), +tz.toFixed(3)], muzzles, roof: +roof.toFixed(3) };
}
/** Within `r` of a bore laid up at `elev` through (x0, y0) toward `dir` in x, at z = `lane`. */
const nearBore = (x0, y0, dir, elev, lanes, r) => (x, y, z) => {
  const dx = dir * Math.cos(elev), dy = Math.sin(elev);
  const px = x - x0, py = y - y0;
  const perp = Math.abs(px * dy - py * dx);
  return lanes.some((l) => Math.hypot(perp, z - l) < r);
};
// Her 12.7 cm/40 Type 89 twin in its shield, on her forecastle: 9.6 m a unit,
// which is the gunhouse the sculpt of her hull drew there, four metres high;
// its barrels 0.67 m apart, sculpted laid up twenty degrees. The barrels and
// their slides elevate, through the slot in the face of the shield; the
// shield, its roof and the platform it stands on train.
const SHIELD_ELEV = Math.atan(0.359);
const SHIELD = gunPiece('matsu-127s.glb', {
  scale: 9.6, pivot: [-0.511, -0.3235], facing: '-x', foot: -0.313, elev: SHIELD_ELEV,
  lanes: [-0.0335, 0.0335], trunnion: [-0.52, 0.021 + 0.359 * (-0.66 + 0.52)],
  cradle: (x, y, z) => x < -0.38 && nearBore(-0.66, 0.021, -1, SHIELD_ELEV, [-0.357, -0.2905], 0.03)(x, y, z),
});
// Her 12.7 cm/40 Type 89 open twin, on her upper deck aft: 7.3 m a unit, which
// draws its barrels a quarter of a metre through at the chase and its
// pedestal four metres across; sculpted laid up eighteen degrees. The barrels,
// their slides and the recuperators over them elevate; the pedestal, the
// carriage and its fuze setters train.
const OPEN_ELEV = Math.atan(0.321);
const OPEN = gunPiece('matsu-127.glb', {
  scale: 7.3, pivot: [0.328, -0.1185], facing: '+x', foot: -0.321, elev: OPEN_ELEV,
  lanes: [-0.0605, 0.0605], trunnion: [0.42, 0.2865 + 0.321 * (0.42 - 0.88)],
  cradle: (x, y, z) => x > 0.2 && nearBore(0.88, 0.2865, 1, OPEN_ELEV, [-0.179, -0.058], 0.05)(x, y, z),
});
// The open 25 mm Type 96 triple, the same sculpt the Musashi's is: 1.7 m a
// unit, three and a quarter metres from the back of it to the muzzles and a
// little over two high -- a gun a man stands behind, not a turret. What
// elevates is the whole of the gun block over the carriage, about trunnions
// on the line of its bores at the top of the carriage; the base ring, the
// carriage and the layers' seats train with it and do not lift.
const AA = gunPiece('matsu-25.glb', {
  scale: 1.7, pivot: [0.33, 0], facing: '-x', foot: -0.627, lanes: [-0.21, 0, 0.21],
  trunnion: [0.33, 0.254], cradle: (x, y) => y > 0.12 && x < 0.97,
});

// Her 61 cm Type 92 quadruple bank, as the owner sculpted it: 4.0 m a unit,
// which is the bank the sculpt of her hull drew between her funnels -- seven
// and a half metres from the muzzles to the back of its shield, two and a
// half high, so it trains under the platform abaft it. It trains whole on the
// ring it stands on; nothing of it elevates. `bores` is each tube's axis in
// the frame of its mounting -- [x, y, z at the breech, z at the muzzle] --
// which is what a torpedo is shot out along.
function tubePiece(file, { scale, pivot, foot, lanes, axisY, breech, muzzle }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push((raw.pos[i + 2] - pivot[1]) * scale, (raw.pos[i + 1] - foot) * scale, -(raw.pos[i] - pivot[0]) * scale);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const mesh = { P, N, T: Array.from(raw.idx) };
  fixWinding(mesh);
  const house = roofed(mesh, 99);
  dropLoose(house, { maxArea: 0.05 * scale * scale, maxDiag: 0.15 * scale });
  creased(house, 40);
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const y = +((axisY - foot) * scale).toFixed(3);
  const zBreech = +(-(breech - pivot[0]) * scale).toFixed(3), zMuzzle = +(-(muzzle - pivot[0]) * scale).toFixed(3);
  const bores = lanes.map((l) => [+((l - pivot[1]) * scale).toFixed(3), y, zBreech, zMuzzle]);
  console.log(`${file}: ${house.T.length / 3} triangles, ${roof.toFixed(2)} m high; ${lanes.length} tubes `
    + `${(zMuzzle - zBreech).toFixed(2)} m long, ${y} m up, muzzles ${zMuzzle} m ahead of the pivot`);
  return {
    house, guns: { T: [] }, trunnion: [0, y, 0], muzzles: bores.map(([x, by, , z]) => [x, by, z]),
    roof: +roof.toFixed(3), bores,
  };
}
const TUBES = tubePiece('matsu-tubes.glb', {
  scale: 4.0, pivot: [0.13, 0], foot: -0.314, lanes: [-0.214, -0.0715, 0.0715, 0.214],
  axisY: -0.068, breech: 0.55, muzzle: -0.953,
});

// ---- her lines, as the sculpt has them --------------------------------------------
// Measured on planes a few millimetres off the round metre: her topsides are
// lofted through stations on it, and a plane through a station's points cuts
// each triangle there at a corner, where measureLines finds no crossing at all.
const LINES = measureLines(m, st, { z0: -49.4963, dz: 1, nz: 99, y0: -4, dy: 0.25, ny: 48 }, DECK_AMIDSHIPS);

// ---- slice, pack and write ------------------------------------------------------------
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 48, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const piece = (g) => ({
  trunnion: g.trunnion, muzzles: g.muzzles, roof: g.roof, ...(g.bores ? { bores: g.bores } : {}),
  house: packPiece(g.house).toString('base64'), guns: g.guns.T.length ? packPiece(g.guns).toString('base64') : null,
});
const mounts = MOUNTS.map(({ name, kind, x, z, rest, seat, floor }) => ({ name, kind, x, z, rest: +rest.toFixed(6), seat, floor }));
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-matsu-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const MATSU_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see matsuSurfaceY.\n`
  + `export const MATSU_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 12.7 cm twins, her 25 mm triple and her bank of tubes, as the owner\n`
  + `// sculpted them, each in the frame of its mounting.\n`
  + `export const MATSU_GUNS = ${JSON.stringify({
    shield: piece(SHIELD), open: piece(OPEN), aa: piece(AA), tubes: piece(TUBES),
  })};\n`
  + `// Where each of them stands, and the floor it was cut out of.\n`
  + `export const MATSU_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her two screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// The platform over her waist, which matsu.js stands on posts.\n`
  + `export const WAIST_PLATFORM = ${JSON.stringify(PLATFORM)};\n`
  + `// Her deck edge over her waterline, stem to stern: [z, y], straight between.\n`
  + `export const SHEER = ${JSON.stringify(SHEER)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every quarter metre of height, a metre at a time.\n`
  + `export const MATSU_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
