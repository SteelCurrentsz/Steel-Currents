// Turn the owner's IJN Kongo sculpts into what client/js/render/kongoHull.js
// ships: her hull and deck, her superstructure, her funnels and her bridge as
// one painted mesh, and her 35.6 cm turret, 15.2 cm casemate gun, 12.7 cm twin
// and 25 mm triple as the owner sculpted them, cut so they train and elevate.
// In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a quarter turn, scaled to her 222.05 m, and floated at 9.7 m; her paint
//     (see build/kongo-source.mjs) rides along a triangle at a time;
//   * close every hole the sculpt had, each in its own plane;
//   * read her gunwale off her, a section every half metre: how far out her
//     side is at every height, each side, and where her deck edge is -- her
//     forecastle deck and, a deck lower, her quarterdeck;
//   * cut her four screws off their shafts (kongo.js draws four that turn);
//   * lift her superstructure, her funnels and her mainmast off her, a hand
//     over her deck edge, as the sculpt drew them, rigging and its debris taken
//     off them and the dents and drips the sculpt left smoothed out;
//   * take everything else off her down to just over her waterline and draw
//     her topsides afresh off her own faired sections up to her gunwale,
//     joined to her underwater body point for point, and lay her deck across
//     them on the same points, so she is closed everywhere and no seam shows
//     daylight;
//   * stand her superstructure back on that deck, skirted down into it, with
//     the turrets and the 12.7 cm the sculpt had cast in cut out, and the
//     tower the hull's sculpt drew for her cut off at her shelter deck;
//   * stand the owner's sculpt of her bridge in its place;
//   * paint her decks, split her normals at every crease;
//   * read her surface off as a height map and her lines, which is what her
//     interior and armour are fitted under;
//   * take her turret and her guns off the owner's sculpts of them, each in
//     the frame of its mounting with its barrels on a cradle of their own, and
//     put her casemates in her side;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file kongoHull.js decodes synchronously.
//
//   node build/prepare-kongo-hull.mjs
//
// Reads assets/models/kongo-*.glb (made by build/kongo-source.mjs), writes
// client/js/render/kongoHull.data.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, boxCut, components, closeHoles,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, boxUvs, denoise, smoothFlats,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import { subMesh, dropLoose, turnInward, thinFaces, creased, measureLines } from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/kongoHull.data.js');

const REAL_LOA = 222.05;
const DRAFT = 9.7;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern, and her keel, flat along the middle
// of her at -0.2027 (see build/kongo-source.mjs). She is floated at her 9.7 m
// draft. A unit of the sculpt is 117.3 m of her, and her bow is at -X: so she
// is turned a quarter round,
//
//   world_X =  (local_Z - zc) * SCALE      (her starboard side, -Z, is -X)
//   world_Y =  (local_Y - localKeel) * SCALE
//   world_Z = -(local_X - xc) * SCALE
const SCULPT = { x0: -0.9486, x1: 0.9444, z0: -0.14, z1: 0.14 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: 0, SCALE: UNIT, localKeel: -0.2027 + DRAFT / UNIT,
};

// Her paints, as build/kongo-source.mjs numbers them; and her superstructure's
// grey, which is grey that is left as its sculpt drew it -- not faired, not
// dropped for being small and apart -- until her decks are laid.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5, BRIDGE_GREY = 6;

/** The sculpt's own point `(lx, ly, lz)` in the game's frame, for a part at `s` metres a unit. */
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

const m = load(ASSET('kongo-hull.glb'));
const isSuper = (t) => m.C[t] === SUPER_GREY;
{
  const { lo, hi } = bbox(m);
  console.log('calibration: SCALE', FRAME.SCALE.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');
// Every hole the sculpt has, wherever it is -- the pinholes the decimator left
// in her bottom where two of her plates met at a hair's angle, the open ends of
// her booms, the mouths her rigging left where it ran into a mast -- is closed
// in its own plane, before anything else is done to her.
{
  const s = closeHoles(m, new Uint8Array(m.T.length / 3).fill(1), () => null, { open: true });
  console.log(`holes closed: ${s.loops} (${s.capped} triangles, ${s.fanned} fanned)`);
}

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
const GUNWALE = { z0: -112, dz: 0.5, n: 449, keep: 0.65, step: 0.25, under: 0.75 };
/** Where her forecastle breaks to her quarterdeck. */
export const BREAK = -43.1;
const SHEER = [[-112, 4.25], [BREAK - 0.01, 4.25], [BREAK, 6.0], [76, 6.0], [80, 6.25], [100, 6.5], [104, 6.75], [112, 7.0]];
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
      // Her blisters are under her waterline, and are not her side: what her
      // side is told from a deckhouse by is her breadth from the waterline up.
      if (y < 0) continue;
      if (top !== null && y > top + 0.6) break;
      if (w >= GUNWALE.keep * under) { under = Math.max(under, w); top = y; }
    }
    if (top !== null) ys[k] = top;
  }
  if (process.env.RAW) console.log(Array.from(ys).map((y, k) => (k % 4 ? null : `${GUNWALE.z0 + k * GUNWALE.dz}:${y.toFixed(2)}`)).filter(Boolean).join(' '));
  // Her sheer, as those readings have it: her forecastle deck at six metres
  // over her waterline from abaft her No.3 turret forward, rising to seven at
  // her stem; and her quarterdeck a deck lower, at four and a quarter, from the
  // break of her forecastle aft. Read here, not run smooth: a running mean
  // would draw the break of her forecastle as a ramp, and where her forecastle
  // is set in from her side (forward of No.1 and abreast No.3) the reading
  // takes the ledge her side steps out to for her deck.
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
  + [-110, -100, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((z) => {
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
// Four shafts, the wing pair's screws eight metres ahead of the inner pair's,
// before her rudder. The sculpt drew each screw on the end of its shaft; it is
// cut off, and kongo.js draws a three-bladed one there that turns.
export const SCREWS = [
  { x: -6.2, y: -7.0, z: -77.9, r: 1.6 },
  { x: 6.2, y: -7.0, z: -77.9, r: 1.6 },
  { x: -3.2, y: -7.3, z: -85.0, r: 1.6 },
  { x: 3.2, y: -7.3, z: -85.0, r: 1.6 },
];
for (const sc of SCREWS) {
  const r = boxCut(m, { x0: sc.x - 1.9, x1: sc.x + 1.9, y0: sc.y - 1.9, y1: sc.y + 1.9, z0: sc.z - 0.7, z1: sc.z + 0.7 }, { rescue: true });
  console.log(`screw at ${sc.x}, ${sc.z}: ${r.cut} triangles cut, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
}

// ---- her superstructure, lifted off her ---------------------------------------------
// Her superstructure, her funnels, her mainmast and her deckhouses are the
// sculpt's own, as it drew them standing on her: everything a hand over her
// deck edge (LIFT) and inside her side is taken off her before her topsides
// are drawn afresh, cut along that line exactly. Where a wall was cut, a skirt
// is let down from it, square, to SINK under her deck -- so every house stands
// in her new deck, not a hand over it on nothing -- and it is laid back on her
// when her deck is (see below).
export const LIFT = 0.35, SINK = 0.6;
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
const superLevel = (z) => gunwaleAt(z).y + LIFT;
let SUP = null;
{
  const above = splitAlong(m, superLevel);
  // Inside her side: what stands out past it -- her casemates' barrels, her
  // booms -- is not her superstructure.
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
  dropLoose(sup, { maxArea: 0.6, maxDiag: 1.5 });
  // And whatever is small and hangs high up on its own -- a gaff off her
  // mainmast that only her rigging held there -- goes too.
  {
    const drop = new Uint8Array(sup.T.length / 3);
    let n = 0;
    for (const c of components(sup).slice(1)) {
      let area = 0;
      for (const t of c.tris) { const f = faceNormal(sup, sup.T[t * 3], sup.T[t * 3 + 1], sup.T[t * 3 + 2]); area += Math.hypot(...f) / 2; }
      if (area > 10 || c.lo[1] < 18) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    sup = subMesh(sup, (t) => !drop[t]);
    console.log(`her superstructure: ${n} loose pieces aloft dropped`);
  }
  // Smoothed: the sculpt drew her houses and her funnels with drips down
  // them and dents in them. The dents and the drips are taken out of every
  // face of her that is nearly flat and the corners and creases between them
  // left where they are, so a wall is flat and an edge is still an edge.
  {
    const canon = weld(sup);
    const d = denoise(sup, canon, { sigmaS: 0.8, sigmaR: 0.35, normalIters: 8, vertexIters: 20, max: 0.35 });
    const f = smoothFlats(sup, canon, { passes: 10, max: 0.25, flat: 22 });
    console.log(`her superstructure smoothed: ${d.movedMax !== undefined ? d.movedMax.toFixed(2) : '?'} m by its faces, `
      + `${f.movedMax.toFixed(2)} m on its flats`);
  }
  SUP = sup;
  const { lo, hi } = bbox(sup);
  console.log(`her superstructure: ${sup.T.length / 3} triangles, ${skirt} of them skirts, from ${lo[2].toFixed(1)} to `
    + `${hi[2].toFixed(1)} m along her, ${hi[1].toFixed(1)} m up`);
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
// Her rows are at fixed heights, two of them either side of the ledge her
// side steps out to where her forecastle is set in from it (3.75 m), so the
// ledge is a ledge and not a slope; every row is held a hand under the next
// where her deck comes down to it, and the last is her deck edge.
const CUT = 0.5, BOOT_TOP = 1.0;
const ROW_Y = [1.0, 1.8, 2.6, 3.3, 3.6, 3.95, 4.6, 5.3];
const ROWS = ROW_Y.length + 1;
const rowY = (j, gy) => (j >= ROWS ? gy : Math.min(ROW_Y[j - 1] ?? BOOT_TOP, gy - (ROWS - j + 1) * 0.1));
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
  for (let j = 1; j <= ROWS; j++) rows.push(rowAt((z, gy) => rowY(j, gy)));
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

// ---- her guns: where each stands ---------------------------------------------------
// Four twin 35.6 cm turrets, where the sculpt of her has them: No.1 and No.2
// forward, No.2 superfiring over it; No.3 abaft her mainmast, on her
// forecastle deck, facing astern; and No.4 right aft on her quarterdeck. The
// sculpt's turrets are smaller than the owner's sculpt of the turret, which is
// drawn at its own size: each stands with its face where the sculpt's face is,
// its pivot MAIN_FACE behind it. `seat` is the top of the barbette each trains
// on, over her waterline: No.2 high enough that its barrels lie clear of No.1's
// roof. The barbettes themselves are kongo.js's.
export const MAIN_SCALE = 14;
const MAIN_FACE = (0.335 + 0.04) * MAIN_SCALE;
export const TURRETS = [
  { name: 'No.1', face: 63.4, rest: 0, seat: 6.3 },
  { name: 'No.2', face: 50.4, rest: 0, seat: 9.3 },
  { name: 'No.3', face: -30.0, rest: Math.PI, seat: 6.3 },
  { name: 'No.4', face: -70.1, rest: Math.PI, seat: 4.6 },
].map((t) => ({ ...t, x: 0, z: +(t.face - (t.rest === 0 ? 1 : -1) * MAIN_FACE).toFixed(2) }));

// Her 12.7 cm twins stand in the four round tubs the sculpt has for them, two
// a side, abreast her bridge and her mainmast; they were cast in it, and are
// cut out of it (`r` round them, from a hand over the tub's floor up), and
// kongo.js stands the owner's sculpt of the mounting there, training.
export const SCULPTED_LIGHT = [
  { name: 'T1 port', x: 11.0, z: 26.3, r: 2.6 },
  { name: 'T1 stbd', x: -11.6, z: 26.3, r: 2.6 },
  { name: 'T2 port', x: 10.5, z: 0.0, r: 2.6 },
  { name: 'T2 stbd', x: -9.5, z: 0.0, r: 2.6 },
];

// ---- cut every sculpted gun out of her ---------------------------------------------
// Her turrets: the sculpt's gunhouse, from the top of its barbette up, and a
// strip along its barrels. She stands her own on a barbette of her own.
const BARREL_REACH = 16;
/**
 * Take out every triangle of her superstructure with a corner in the box.
 * Not boxCut: a turret is a piece standing on its barbette, and taking it
 * whole off leaves the barbette's top, which is closed.
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
  for (const t of TURRETS) {
    const dir = t.rest === 0 ? 1 : -1;
    // From the face forward of the pivot to the back of the gunhouse.
    const za = t.face, zb = t.z - dir * 8.5;
    const y0 = gunwaleAt(t.z).y + LIFT - 0.01;
    const house = dropBox(sup, { x0: -6.2, x1: 6.2, y0, y1: t.seat + 7, z0: Math.min(za, zb), z1: Math.max(za, zb) });
    const bar = dropBox(sup, { x0: -3.4, x1: 3.4, y0, y1: t.seat + 7,
      z0: Math.min(t.face, t.face + dir * BARREL_REACH), z1: Math.max(t.face, t.face + dir * BARREL_REACH) });
    console.log(`${t.name}: ${house + bar} triangles cut`);
  }
  // The floor of each light gun's tub: the lowest face of her superstructure
  // that faces up, near its middle.
  for (const l of SCULPTED_LIGHT) {
    let floor = Infinity;
    for (let t = 0; t < sup.T.length / 3; t++) {
      const [cx, cy, cz] = middle(sup, t);
      if (Math.hypot(cx - l.x, cz - l.z) > l.r * 0.7) continue;
      const [nx, ny, nz] = faceNormal(sup, sup.T[t * 3], sup.T[t * 3 + 1], sup.T[t * 3 + 2]);
      if (ny > 0.9 * Math.hypot(nx, ny, nz)) floor = Math.min(floor, cy);
    }
    if (!Number.isFinite(floor)) floor = gunwaleAt(l.z).y;
    l.deck = +floor.toFixed(3);
    const n = dropBox(sup, { x0: l.x - l.r, x1: l.x + l.r, z0: l.z - l.r, z1: l.z + l.r, y0: l.deck + 0.12, y1: l.deck + 4 });
    console.log(`${l.name}: floor ${l.deck.toFixed(2)} m, ${n} triangles cut`);
  }
}

// ---- her bridge --------------------------------------------------------------------
// The tower she was known by, the owner's sculpt of it (build/kongo-source.mjs
// took the copy of it that came out whole and turned it square, bow to -X), at
// 45 m a unit: from the block it stands on to the mattress of her Type 21
// radar, thirty metres. The sculpt of her hull drew her a tower of its own,
// smaller and run together; it is cut off her at her shelter deck, over which
// it stood, and hers stands there in its place -- the foot of it on its legs
// let down through that deck, so its block stands on it -- with its rangefinder
// where the hull's sculpt has hers, 28.7 m forward of her middle.
export const BRIDGE = { scale: 45, z: 24.6, legs: 0.03, shelter: 8.8 };
// The house under its forward platforms, in her frame (see below).
const BRIDGE_HOUSE = { x0: -4.3, x1: 4.3, y0: 8.4, y1: 10.4, z0: 24.6, z1: 38.6 };
export const PAGODA_CUT = { x0: -8.4, x1: 8.4, y0: 9.1, y1: 60, z0: 19.0, z1: 40.0 };
// And what her sculpt's tower carried out over her sides, aloft -- its yards,
// its searchlight platforms -- from her funnel's height up.
const PAGODA_ARMS = { x0: -16, x1: 16, y0: 14.5, y1: 60, z0: 19.0, z1: 40.0 };
{
  const r = boxCut(SUP, PAGODA_CUT, { rescue: true });
  const r2 = boxCut(SUP, PAGODA_ARMS, { rescue: true });
  console.log(`her sculpt's own tower: ${r.cut + r2.cut} triangles cut, caps ${r.caps.join('/')}`);
  dropLoose(SUP, { maxArea: 4, maxDiag: 4 });
  append(m, SUP);
  const raw = readGlb(ASSET('kongo-bridge.glb'));
  const P = [], N = [];
  const U = BRIDGE.scale, foot = BRIDGE.shelter - BRIDGE.legs * U;
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(raw.pos[i + 2] * U, raw.pos[i + 1] * U + foot, BRIDGE.z - raw.pos[i] * U);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const T = Array.from(raw.idx);
  const br = { P, N, T, C: new Array(T.length / 3).fill(BRIDGE_GREY) };
  fixWinding(br);
  // A sliver of the copy beside it on the sheet came away with it.
  dropLoose(br, { maxArea: 6, maxDiag: 6 });
  const { lo, hi } = bbox(br);
  console.log(`her bridge: ${T.length / 3} triangles, from ${lo[2].toFixed(1)} to ${hi[2].toFixed(1)} m along her, `
    + `${lo[0].toFixed(1)} to ${hi[0].toFixed(1)} across, ${hi[1].toFixed(1)} m up`);
  append(m, br);
  // Under its forward platforms the sculpt stands it on open legs over the
  // deck its block stood on, a deck high; the tower of the hull's sculpt that
  // stood there was a deckhouse down to her shelter deck. So is hers: a house
  // under them from that deck up to their floor, that nothing is seen through.
  const H = BRIDGE_HOUSE;
  const box = { P: [], N: [], T: [], C: [] };
  // Corners: 0..3 at the foot, 4..7 at the head; x fastest, then z.
  for (const y of [H.y0, H.y1]) for (const z of [H.z0, H.z1]) for (const x of [H.x0, H.x1]) { box.P.push(x, y, z); box.N.push(0, 0, 0); }
  for (const [a0, b0, c0, d0] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
    box.T.push(a0, b0, c0, a0, c0, d0);
    box.C.push(SUPER_GREY, SUPER_GREY);
  }
  append(m, box);
}
const DECK_AMIDSHIPS = gunwaleAt(0).y;
dropLoose(m, { maxArea: 8, maxDiag: 6 });
// Her bridge is her superstructure's grey again, now that nothing is cut out of the one but the other.
for (let t = 0; t < m.C.length; t++) if (m.C[t] === BRIDGE_GREY) m.C[t] = SUPER_GREY;
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
// Her upper deck is planked from stem to stern (laid above); her
// superstructure's decks, platforms and flats are steel, the dark grey of a
// deck that is walked on; and its walls the grey of her sides.
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
// Her grey, her planking, the dark grey of her steel decks, her black boot
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
//   file      the decimated sculpt (see build/kongo-source.mjs)
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
// The 35.6 cm/45 41st Year Type twin: 14 m a unit, which makes the barbette it
// trains on ten metres across, the gunhouse eight and a half wide, and puts
// twelve and a half metres of each barrel out of its face. It trains on its
// barbette with the ring of its skirt; its barrels, blast bags and all, are
// lifted off it at its face.
const MAIN = gunPiece('kongo-356.glb', {
  scale: MAIN_SCALE, pivot: [0.335, 0], dir: -1, foot: -0.125, face: 0.375, lanes: [-0.107, 0.107],
  barrelY: 0.082, r: 0.06, trunnionIn: 0.12, roofOver: 3.4,
});
// The 15.2 cm/50 41st Year Type in its casemate mounting, off the table it was
// sculpted on: 6.2 m a unit, which makes its shield four metres across and its
// barrel fifty calibres. Sculpted laid up fifteen degrees, and turned down
// level about its trunnion.
const SEC = gunPiece('kongo-152.glb', {
  scale: 6.2, pivot: [-0.44, 0], dir: 1, foot: -0.19, face: 0.22, lanes: [0],
  barrelY: 0.142, r: 0.05, trunnionIn: 0.18, elev: 0.258, roofOver: 99,
});
// The 12.7 cm/40 Type 89 twin in its shield: 7.2 m a unit, which makes the base
// ring it trains on four metres across. Sculpted laid up sixteen degrees.
const TWIN = gunPiece('kongo-127.glb', {
  scale: 7.2, pivot: [0.33, -0.12], dir: 1, foot: -0.31, face: 0.22, lanes: [-0.061, 0.061],
  barrelY: 0.149, r: 0.04, trunnionIn: 0.15, elev: 0.279, roofOver: 99,
});
// The 25 mm Type 96 triple: 2.3 m a unit, which makes its pedestal two and
// a half metres across and its barrels a metre and three-quarters.
const AA = gunPiece('kongo-25.glb', {
  scale: 2.3, pivot: [0.33, 0], dir: -1, foot: -0.627, face: 0.63, lanes: [-0.204, 0, 0.204],
  barrelY: 0.26, r: 0.05, trunnionIn: 0.55, roofOver: 99,
});

// ---- her casemates ------------------------------------------------------------------
// Eight 15.2 cm, four a side, in the casemates in her side the sculpt drew
// under her forecastle deck, abreast her bridge, her funnels and her
// mainmast: each gun's bore is CASEMATE_Y over her waterline, as the sculpt's
// embrasures are, and its pivot is in from her side by as much as its shield
// is round, so the face of its shield is in her side and its barrel out
// through it. Stowed, each looks out on her beam.
export const CASEMATE_Y = 4.1;
const CASEMATE_IN = 1.75;
const CASEMATE_Z = [17.5, -0.5, -12.5, -30.0];
const sideAt = (s, z, y) => fairAtY(s, Math.round((z - GUNWALE.z0) / GUNWALE.dz), y);
export const SECONDARY = CASEMATE_Z.flatMap((z, k) => [-1, 1].map((sgn) => {
  const half = sideAt(sgn < 0 ? 0 : 1, z, CASEMATE_Y);
  return {
    name: `S${k + 1} ${sgn > 0 ? 'port' : 'stbd'}`, x: +(sgn * (half - CASEMATE_IN)).toFixed(2), z, rest: sgn * Math.PI / 2,
    seat: +(CASEMATE_Y - SEC.trunnion[1]).toFixed(3), side: +(sgn * half).toFixed(2),
  };
}));
console.log('casemates:', SECONDARY.map((c) => `${c.name} ${c.x}/${c.side} @${c.z}`).join(', '));

// ---- her lines, as the sculpt has them --------------------------------------------
// Measured on planes a few millimetres off the round metre: her topsides are
// lofted through stations on it, and a plane through a station's points cuts
// each triangle there at a corner, where measureLines finds no crossing at all
// -- which drew her two metres narrower than her plating amidships, and no
// width at all at her bow.
const LINES = measureLines(m, st, { z0: -105.9963, dz: 1, nz: 212, y0: -10, dy: 0.5, ny: 40 }, DECK_AMIDSHIPS);

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
  secondary: SECONDARY.map(({ name, x, z, rest, seat, side }) => ({ name, x, z, rest: +rest.toFixed(6), seat, side })),
  sculptedLight: SCULPTED_LIGHT.map(({ name, x, z, deck }) => ({ name, x, z, deck })),
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-kongo-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const KONGO_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see kongoSurfaceY.\n`
  + `export const KONGO_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 35.6 cm turret, 15.2 cm gun, 12.7 cm twin and 25 mm triple, as the\n`
  + `// owner sculpted them, each in the frame of its mounting.\n`
  + `export const KONGO_GUNS = ${JSON.stringify({
    main: piece(MAIN), sec: piece(SEC), twin: piece(TWIN), aa: piece(AA),
  })};\n`
  + `// Where her turrets and her casemates stand, and the floors of the tubs her\n`
  + `// light guns were cut out of.\n`
  + `export const KONGO_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const KONGO_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
