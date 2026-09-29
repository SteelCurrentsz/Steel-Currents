// Take the owner's HMS Rodney sculpt, and the sculpt of her secondary gun,
// down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (this script alone wants them)
//   node build/rodney-source.mjs <Rodney.glb> "<Rodney Secondary Gun.glb>"
//
// The sculpt of her (a single welded mesh of 931 thousand triangles over an
// 8192-pixel texture, not committed: it is 67 MB) is painted, which the
// Graf Spee's and the Takao's were not: she wears her 1942 Admiralty
// disruptive scheme, light grey, dark blue and green, over teak decks and a red
// bottom. The paint is kept, and cleaned: the texture a sculpt like this comes
// with has its lighting baked into it, and smears and stains wherever the
// generator could not decide what a surface was -- five shades of the same
// grey, a brown blotch on a grey bulkhead, an olive smudge between her boot
// topping and her side. So every triangle of her is given one paint out of
// the six she actually wore, and the paint is carried as a seam through
// everything that follows: a camouflage edge stays an edge, and there is no
// such thing as a triangle half grey and half blue.
//
// In order:
//
//   * her hull is cut along two level lines, at her waterline and at the top
//     of her boot topping, so both are straight and exactly where they are;
//   * every triangle of her is looked up in her texture -- the middle of it
//     and a point towards each corner -- and given the nearest of her paints
//     by hue more than by lightness (the lightness is mostly baked shadow):
//     anything facing the sky that is the colour of teak is her deck, and
//     below her waterline and in her boot topping the paint is where it is;
//   * any patch of one paint smaller than a square metre or so is a stain,
//     not camouflage, and takes the paint round it;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps the edge between them where it is and only ever
//     moves along it;
//   * she is decimated to the budget the fleet renders at, and the lengths of
//     her with her three turrets on them much less, because they are what a
//     captain looks at down the barrel when he is laying one.
//
// Writes, into assets/models/:
//
//   rodney-hull.glb       the whole of her, with her paint on every point as
//                         the attribute _PAINT (see PAINTS)
//   rodney-turrets.glb    the length of her forecastle with A, B and X on it,
//                         finer, painted the same way
//   rodney-secondary.glb  her 6-inch twin, decimated
//
// and build/prepare-rodney-hull.mjs goes on from there. Coordinates here are
// the sculpt's own: length along X with her bow at -X, Y up, beam along Z, 1.9
// units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, imageDecoder, readSource as readGlb, writeGlb as writeSourceGlb, splitAt,
  splitByPaint, weldByPaint, decimate as decimateWith,
} from './sculpt-source.mjs';

// The two packages (see sculpt-source.mjs).
const sharp = imageDecoder();
const MeshoptSimplifier = await simplifier();

const [SRC, SEC_SRC] = process.argv.slice(2);
if (!SRC || !SEC_SRC) {
  console.error('usage: node build/rodney-source.mjs <Rodney.glb> "<Rodney Secondary Gun.glb>"');
  process.exit(1);
}

/** Her paints, as build/prepare-rodney-hull.mjs and the data file number them. */
export const PAINTS = ['light', 'dark', 'green', 'deck', 'boot', 'red'];
const LIGHT = 0, DARK = 1, GREEN = 2, DECK = 3, BOOT = 4, RED = 5;
const UNKNOWN = 255;

// Her waterline, where the sculpt's paint turns from her side to her bottom
// (read off it: the red is solid below -0.195 and gone above -0.181), and the
// top of her boot topping three quarters of a metre over it. A unit of the
// sculpt is 113.9 m of her.
const WL = -0.1885;
const BOOT_LO = WL - 0.0035;
const BOOT_HI = WL + 0.0066;

// ---- the glb ----------------------------------------------------------------
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/rodney-source.mjs');

// ---- her paint ------------------------------------------------------------------
function lab(r, g, b) {
  const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

// What each paint looks like in the texture, in Lab, off a clustering of her
// sides and decks: the grey, the blue, the green, and the teak.
const PROTO = [
  [LIGHT, 62, -5.3, -7.5],
  [DARK, 16, -3.5, -10.0],
  [GREEN, 40, -8.5, 11.0],
  [DECK, 40, 0.5, 6.5],
];

/** The paint nearest a sampled colour, by hue more than by lightness. */
function nearest(L, a, b, up) {
  let best = UNKNOWN, bd = Infinity;
  for (const [k, pl, pa, pb] of PROTO) {
    if (k === DECK && !up) continue;
    const d = Math.hypot((L - pl) * 0.35, a - pa, b - pb);
    if (d < bd) { bd = d; best = k; }
  }
  // Brown or rust on a wall is a stain, whatever it is nearest.
  if (!up && a > 2 && b > 6) return UNKNOWN;
  return best;
}

async function paintOf(m, jpg) {
  const S = 4096;
  const { data } = await sharp(jpg, { limitInputPixels: false }).resize(S, S).raw().toBuffer({ resolveWithObject: true });
  const sample = (u, v) => {
    const x = (u - Math.floor(u)) * S - 0.5, y = (v - Math.floor(v)) * S - 0.5;
    const x0 = Math.max(0, Math.min(S - 1, Math.floor(x))), y0 = Math.max(0, Math.min(S - 1, Math.floor(y)));
    const x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
    const px = (xx, yy, c) => data[(yy * S + xx) * 3 + c];
    return [0, 1, 2].map((c) => (px(x0, y0, c) * (1 - fx) + px(x1, y0, c) * fx) * (1 - fy)
      + (px(x0, y1, c) * (1 - fx) + px(x1, y1, c) * fx) * fy);
  };
  const { P, UV, T } = m;
  const nt = T.length / 3;
  const paint = new Uint8Array(nt);
  const area = new Float64Array(nt);
  const up = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]);
    const e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n) || 1;
    area[t] = l / 2;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    // Below her waterline and in her boot topping, the paint is where it is.
    if (cy < BOOT_LO) { paint[t] = RED; continue; }
    if (cy < BOOT_HI) { paint[t] = BOOT; continue; }
    const us = [a, b, c].map((q) => [UV[q * 2], UV[q * 2 + 1]]);
    const cu = (us[0][0] + us[1][0] + us[2][0]) / 3, cv = (us[0][1] + us[1][1] + us[2][1]) / 3;
    let r = 0, g = 0, bl = 0;
    for (const [u, w] of [[cu, cv], ...us.map(([u, w]) => [(u + cu) / 2, (w + cv) / 2])]) {
      const s = sample(u, w);
      r += s[0] / 4; g += s[1] / 4; bl += s[2] / 4;
    }
    const [L, A, B] = lab(r, g, bl);
    up[t] = n[1] / l > 0.7 ? 1 : 0;
    paint[t] = nearest(L, A, B, up[t] === 1);
  }
  return { paint, area, up };
}

/**
 * Every triangle's neighbours across an edge, by where its corners are (the
 * sculpt splits a point wherever its texture has a seam, and a seam is not an
 * edge of her).
 */
function neighbours(m) {
  const { P, T } = m;
  const nv = P.length / 3;
  const at = new Map();
  const id = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;
    let w = at.get(k);
    if (w === undefined) { w = at.size; at.set(k, w); }
    id[i] = w;
  }
  const edges = new Map();
  const nt = T.length / 3;
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const a = id[T[t * 3 + e]], b = id[T[t * 3 + (e + 1) % 3]];
      const k = a < b ? a * 4194304 + b : b * 4194304 + a;
      const l = edges.get(k);
      if (l) l.push(t); else edges.set(k, [t]);
    }
  }
  const nb = Array.from({ length: nt }, () => []);
  for (const l of edges.values()) {
    for (let i = 0; i < l.length; i++) for (let j = 0; j < l.length; j++) if (i !== j) nb[l[i]].push(l[j]);
  }
  return nb;
}

/**
 * Stains out: every patch of one paint -- triangles of it joined across edges
 * -- smaller than `minArea` takes the paint most of its border is, smallest
 * first. The paints set by where they are (boot topping, bottom) are left as
 * they are.
 */
function clean(paint, area, nb, minArea) {
  const nt = paint.length;
  let changed = 0;
  for (let pass = 0; pass < 6; pass++) {
    const comp = new Int32Array(nt).fill(-1);
    const comps = [];
    for (let s = 0; s < nt; s++) {
      if (comp[s] >= 0) continue;
      const id = comps.length;
      const tris = [s];
      comp[s] = id;
      let a = 0;
      for (let q = 0; q < tris.length; q++) {
        const t = tris[q];
        a += area[t];
        for (const u of nb[t]) if (comp[u] < 0 && paint[u] === paint[s]) { comp[u] = id; tris.push(u); }
      }
      comps.push({ tris, area: a, paint: paint[s] });
    }
    const order = comps.map((_, i) => i).filter((i) => {
      const c = comps[i];
      return (c.paint === UNKNOWN || c.area < minArea) && c.paint !== BOOT && c.paint !== RED;
    }).sort((i, j) => comps[i].area - comps[j].area);
    let n = 0;
    for (const i of order) {
      const c = comps[i];
      const votes = new Map();
      for (const t of c.tris) {
        for (const u of nb[t]) {
          const p = paint[u];
          if (p === c.paint || p === UNKNOWN || p === BOOT || p === RED) continue;
          votes.set(p, (votes.get(p) || 0) + area[u]);
        }
      }
      let best = -1, bv = 0;
      for (const [p, v] of votes) if (v > bv) { bv = v; best = p; }
      if (best < 0) continue;
      for (const t of c.tris) paint[t] = best;
      n += c.tris.length;
    }
    changed += n;
    if (!n) break;
  }
  let left = 0;
  for (let t = 0; t < nt; t++) if (paint[t] === UNKNOWN) { paint[t] = LIGHT; left++; }
  return { changed, left };
}

/**
 * Her decks swept: the sculpt's texture bleeds the grey of every gunhouse and
 * deckhouse out on to the teak round its foot, in drips and splashes. Any
 * patch of camouflage lying flat on her deck -- facing the sky, and with deck
 * round most of it -- smaller than `maxArea` is teak. A gunhouse roof or the
 * top of a deckhouse is walled, not decked, round its edge, and stays grey.
 */
function sweepDecks(paint, area, up, nb, maxArea) {
  const nt = paint.length;
  const seen = new Uint8Array(nt);
  let swept = 0;
  for (let s = 0; s < nt; s++) {
    if (seen[s] || !CAMO(paint[s]) || !up[s]) continue;
    const tris = [s];
    seen[s] = 1;
    let a = 0;
    for (let q = 0; q < tris.length; q++) {
      const t = tris[q];
      a += area[t];
      for (const u of nb[t]) if (!seen[u] && CAMO(paint[u]) && up[u]) { seen[u] = 1; tris.push(u); }
    }
    if (a > maxArea) continue;
    let deck = 0, other = 0;
    for (const t of tris) {
      for (const u of nb[t]) {
        if (CAMO(paint[u]) && up[u]) continue;
        if (paint[u] === DECK) deck += area[u]; else other += area[u];
      }
    }
    if (deck < 2 * other) continue;
    for (const t of tris) paint[t] = DECK;
    swept += tris.length;
  }
  return swept;
}

/**
 * Cut every triangle of her camouflage down until none is bigger than `area`:
 * her side is a few dozen triangles metres long, and a camouflage edge drawn
 * across one of those is a saw blade. Midpoint subdivision, with a point made
 * on an edge shared by everything on that edge -- found by where the ends of
 * the edge are, not which points they are, so a triangle over a texture seam
 * from one being cut is cut to match rather than left with a crack.
 */
function subdivide(m, area, only) {
  const { P, N, UV } = m;
  const pk = (v) => `${Math.round(P[v * 3] * 1e6)},${Math.round(P[v * 3 + 1] * 1e6)},${Math.round(P[v * 3 + 2] * 1e6)}`;
  const areaOf = (a, b, c) => {
    const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]);
    const e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
    return Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
  };
  let made = 0;
  for (let pass = 0; pass < 8; pass++) {
    const T = m.T;
    // Every edge of a triangle too big is cut, and so is that edge wherever
    // else it is an edge.
    const cut = new Set();
    const ekey = (a, b) => { const x = pk(a), y = pk(b); return x < y ? `${x}|${y}` : `${y}|${x}`; };
    for (let t = 0; t < T.length; t += 3) {
      if (!only(t / 3) || areaOf(T[t], T[t + 1], T[t + 2]) <= area) continue;
      for (let e = 0; e < 3; e++) cut.add(ekey(T[t + e], T[t + (e + 1) % 3]));
    }
    if (!cut.size) break;
    const mid = new Map();
    const midpoint = (a, b) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let w = mid.get(k);
      if (w !== undefined) return w;
      w = P.length / 3;
      // The same arithmetic in the same order from both ends, so both sides of
      // a texture seam put the point in exactly the same place.
      const [p, q] = pk(a) < pk(b) ? [a, b] : [b, a];
      P.push((P[p * 3] + P[q * 3]) / 2, (P[p * 3 + 1] + P[q * 3 + 1]) / 2, (P[p * 3 + 2] + P[q * 3 + 2]) / 2);
      const nx = N[a * 3] + N[b * 3], ny = N[a * 3 + 1] + N[b * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      N.push(nx / l, ny / l, nz / l);
      UV.push((UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2);
      mid.set(k, w);
      return w;
    };
    const out = [];
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t], T[t + 1], T[t + 2]];
      const c = [0, 1, 2].map((e) => cut.has(ekey(v[e], v[(e + 1) % 3])));
      const n = c.filter(Boolean).length;
      if (!n) { out.push(...v); continue; }
      made++;
      const m01 = c[0] ? midpoint(v[0], v[1]) : -1;
      const m12 = c[1] ? midpoint(v[1], v[2]) : -1;
      const m20 = c[2] ? midpoint(v[2], v[0]) : -1;
      if (n === 3) {
        out.push(v[0], m01, m20, m01, v[1], m12, m20, m12, v[2], m01, m12, m20);
      } else if (n === 1) {
        const e = c.indexOf(true);
        const a = v[e], b = v[(e + 1) % 3], d = v[(e + 2) % 3];
        const w = [m01, m12, m20][e];
        out.push(a, w, d, w, b, d);
      } else {
        // Two edges cut: the corner between them is a triangle of its own, and
        // the rest a quadrilateral, split on its shorter diagonal.
        const e = c.indexOf(false);
        const a = v[e], b = v[(e + 1) % 3], d = v[(e + 2) % 3];
        const mb = [m01, m12, m20][(e + 1) % 3], md = [m01, m12, m20][(e + 2) % 3];
        out.push(mb, d, md);
        const d1 = Math.hypot(P[a * 3] - P[mb * 3], P[a * 3 + 1] - P[mb * 3 + 1], P[a * 3 + 2] - P[mb * 3 + 2]);
        const d2 = Math.hypot(P[b * 3] - P[md * 3], P[b * 3 + 1] - P[md * 3 + 1], P[b * 3 + 2] - P[md * 3 + 2]);
        if (d1 < d2) out.push(a, b, mb, a, mb, md); else out.push(a, b, md, b, mb, md);
      }
    }
    m.T = out;
  }
  return made;
}

const CAMO = (p) => p === LIGHT || p === DARK || p === GREEN;

/**
 * Draw her camouflage edges where they are rather than where the triangles
 * happen to end.
 *
 * Every point of her takes a share of each camouflage paint from the
 * triangles round it, smoothed over the next few points out, so the three
 * shares are a smooth field over her surface; each triangle is then cut along
 * the line where the leading paint changes -- linearly between its corners,
 * with the point on an edge worked out off that edge alone, so the triangle
 * on the other side of it cuts it at the same place. A corner where three
 * paints meet is cut to its middle. Only her camouflage: her deck ends where
 * her deck does, and her boot topping and her bottom are cut level already.
 */
function contour(m, paint, smooth = 3) {
  const { P, N, T } = m;
  const nv = P.length / 3;
  const id = new Int32Array(nv);
  const at = new Map();
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(P[i * 3] * 1e6)},${Math.round(P[i * 3 + 1] * 1e6)},${Math.round(P[i * 3 + 2] * 1e6)}`;
    let w = at.get(k);
    if (w === undefined) { w = at.size; at.set(k, w); }
    id[i] = w;
  }
  const nw = at.size;
  let w = new Float64Array(nw * 3);
  const wsum = new Float64Array(nw);
  const nb = Array.from({ length: nw }, () => new Set());
  const nt = T.length / 3;
  for (let t = 0; t < nt; t++) {
    if (!CAMO(paint[t])) continue;
    const vs = [id[T[t * 3]], id[T[t * 3 + 1]], id[T[t * 3 + 2]]];
    for (let j = 0; j < 3; j++) {
      w[vs[j] * 3 + paint[t]] += 1;
      wsum[vs[j]] += 1;
      nb[vs[j]].add(vs[(j + 1) % 3]);
      nb[vs[j]].add(vs[(j + 2) % 3]);
    }
  }
  for (let i = 0; i < nw; i++) if (wsum[i]) for (let k = 0; k < 3; k++) w[i * 3 + k] /= wsum[i];
  for (let it = 0; it < smooth; it++) {
    const next = new Float64Array(nw * 3);
    for (let i = 0; i < nw; i++) {
      if (!wsum[i]) continue;
      let n = 1;
      for (let k = 0; k < 3; k++) next[i * 3 + k] = w[i * 3 + k];
      for (const j of nb[i]) {
        if (!wsum[j]) continue;
        for (let k = 0; k < 3; k++) next[i * 3 + k] += w[j * 3 + k];
        n++;
      }
      for (let k = 0; k < 3; k++) next[i * 3 + k] /= n;
    }
    w = next;
  }
  const lead = (i) => {
    const b = id[i] * 3;
    return w[b] >= w[b + 1] && w[b] >= w[b + 2] ? LIGHT : w[b + 1] >= w[b + 2] ? DARK : GREEN;
  };
  // Where along the edge from a to b the leading paint goes from a's to b's.
  const made = new Map();
  const cross = (a, b) => {
    const [p, q] = id[a] < id[b] ? [a, b] : [b, a];
    const k = `${id[p]},${id[q]}`;
    let v = made.get(k);
    if (v !== undefined) return v;
    const A = lead(p), B = lead(q);
    const gp = w[id[p] * 3 + A] - w[id[p] * 3 + B], gq = w[id[q] * 3 + A] - w[id[q] * 3 + B];
    const s = Math.max(0.05, Math.min(0.95, gp / ((gp - gq) || 1e-9)));
    v = P.length / 3;
    P.push(P[p * 3] + (P[q * 3] - P[p * 3]) * s, P[p * 3 + 1] + (P[q * 3 + 1] - P[p * 3 + 1]) * s,
      P[p * 3 + 2] + (P[q * 3 + 2] - P[p * 3 + 2]) * s);
    const nx = N[p * 3] + (N[q * 3] - N[p * 3]) * s, ny = N[p * 3 + 1] + (N[q * 3 + 1] - N[p * 3 + 1]) * s;
    const nz = N[p * 3 + 2] + (N[q * 3 + 2] - N[p * 3 + 2]) * s;
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
    made.set(k, v);
    return v;
  };
  const T2 = [], paint2 = [];
  let cut = 0;
  const emit = (poly, p) => { for (let k = 1; k + 1 < poly.length; k++) { T2.push(poly[0], poly[k], poly[k + 1]); paint2.push(p); } };
  for (let t = 0; t < nt; t++) {
    const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
    if (!CAMO(paint[t])) { T2.push(...v); paint2.push(paint[t]); continue; }
    const c = v.map(lead);
    if (c[0] === c[1] && c[1] === c[2]) { T2.push(...v); paint2.push(c[0]); continue; }
    cut++;
    if (c[0] !== c[1] && c[1] !== c[2] && c[2] !== c[0]) {
      // Three paints: each corner keeps its own, out to the middle.
      const mid = P.length / 3;
      P.push((P[v[0] * 3] + P[v[1] * 3] + P[v[2] * 3]) / 3, (P[v[0] * 3 + 1] + P[v[1] * 3 + 1] + P[v[2] * 3 + 1]) / 3,
        (P[v[0] * 3 + 2] + P[v[1] * 3 + 2] + P[v[2] * 3 + 2]) / 3);
      N.push(N[v[0] * 3], N[v[0] * 3 + 1], N[v[0] * 3 + 2]);
      const x = [cross(v[0], v[1]), cross(v[1], v[2]), cross(v[2], v[0])];
      for (let j = 0; j < 3; j++) emit([v[j], x[j], mid, x[(j + 2) % 3]], c[j]);
      continue;
    }
    // Two paints: the corner on its own is one side of the line.
    const j = c[0] === c[1] ? 2 : c[1] === c[2] ? 0 : 1;
    const a = v[j], b = v[(j + 1) % 3], d = v[(j + 2) % 3];
    const xb = cross(a, b), xd = cross(d, a);
    emit([a, xb, xd], c[j]);
    emit([xb, b, d, xd], c[(j + 1) % 3]);
  }
  m.T = T2;
  return { paint: Uint8Array.from(paint2), cut };
}

const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);

// ---- her --------------------------------------------------------------------------
const raw = readGlb(SRC);
console.log('sculpt', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
for (const y of [BOOT_LO, BOOT_HI]) console.log(`cut level at ${y}: ${splitAt(raw, y)} triangles split`);
// A square metre of her, in the sculpt's own units.
const M2 = 1 / (113.86 * 113.86);
{
  const cy = (t) => (raw.P[raw.T[t * 3] * 3 + 1] + raw.P[raw.T[t * 3 + 1] * 3 + 1] + raw.P[raw.T[t * 3 + 2] * 3 + 1]) / 3;
  const n = subdivide(raw, 0.12 * M2, (t) => cy(t) > BOOT_HI);
  console.log(`subdivided ${n} triangles of her topsides and upperworks: ${raw.T.length / 3} triangles`);
}
const sampled = await paintOf(raw, raw.jpg);
const nb = neighbours(raw);
const c = clean(sampled.paint, sampled.area, nb, 1.5 * M2);
console.log(`stains: ${c.changed} triangles took the paint round them, ${c.left} left grey`);
console.log(`decks swept: ${sweepDecks(sampled.paint, sampled.area, sampled.up, nb, 12 * M2)} triangles of grey on her teak`);
const { paint, cut } = contour(raw, sampled.paint);
console.log(`camouflage edges: ${cut} triangles cut along them`);
{
  const tally = new Array(PAINTS.length).fill(0);
  for (let t = 0; t < sampled.paint.length; t++) tally[sampled.paint[t]] += sampled.area[t];
  const all = tally.reduce((s, v) => s + v, 0);
  console.log('paint:', PAINTS.map((p, k) => `${p} ${(tally[k] / all * 100).toFixed(1)}%`).join(', '));
}
const painted = weldByPaint(splitByPaint(raw, paint));
console.log('painted', painted.P.length / 3, 'points');

const hull = decimate(painted, +(process.env.HULL_RATIO || 0.07), +(process.env.HULL_ERROR || 0.0004), +(process.env.HULL_NW ?? 0.02));
writeGlb(path.join(ROOT, 'assets/models/rodney-hull.glb'), hull);

// Her forecastle, from her deck up, with A, B and X on it: more of her than the
// turrets, which is what lets them be cut out of it cleanly.
{
  const keep = [];
  const P = painted.P, T = painted.T;
  for (let t = 0; t < T.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = T[t + k]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    if (cx > -0.60 && cx < 0.10 && Math.abs(cz) < 0.062 && cy > -0.105) keep.push(T[t], T[t + 1], T[t + 2]);
  }
  const turrets = decimate({ ...painted, T: keep }, +(process.env.TURRET_RATIO || 0.3), 0.00012);
  writeGlb(path.join(ROOT, 'assets/models/rodney-turrets.glb'), turrets);
}

// ---- her secondary gun ------------------------------------------------------------
// She carries six of it, and it is six metres long: a thirtieth of the sculpt
// is all of its shape there is to see at that size.
{
  const sec = readGlb(SEC_SRC);
  console.log('secondary', sec.P.length / 3, 'points', sec.T.length / 3, 'triangles');
  const out = decimate({ P: sec.P, N: sec.N, T: sec.T, paint: null },
    +(process.env.SEC_RATIO || 0.035), 0.0015);
  writeGlb(path.join(ROOT, 'assets/models/rodney-secondary.glb'), out);
}
