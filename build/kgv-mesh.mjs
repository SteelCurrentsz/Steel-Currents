// The mesh work build/prepare-kgv-hull.mjs does to the King George V's
// sculpts that is not in build/sculpt.mjs: splitting a mesh along where a
// function of a point is nought, closing the small holes and slits a
// decimation tears, halving long edges, and a ray caster over a mesh for
// finding the faces of her that are single sheets. The first three are as
// build/prepare-hood-hull.mjs does them for the Hood.
import { weld, faceNormal } from './sculpt.mjs';

/** The middle of triangle `t`. */
export const middle = (mesh, t) => {
  const { P, T } = mesh;
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};
/** Append `b` to `a`. */
export function append(a, b) {
  const base = a.P.length / 3;
  for (let i = 0; i < b.P.length; i++) { a.P.push(b.P[i]); a.N.push(b.N[i]); }
  for (let i = 0; i < b.T.length; i++) a.T.push(b.T[i] + base);
  for (let i = 0; i < b.C.length; i++) a.C.push(b.C[i]);
}

/**
 * Split every triangle of `mesh` that `g` (of a point) changes sign across,
 * along where it is nought; with `drop`, what is on its positive side goes.
 * Points are shared along a split edge, so nothing opens. Returns the
 * segments of the split, as [x0, z0, x1, z1].
 */
export function splitAlong(mesh, g, { drop = false } = {}) {
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

/**
 * Close every hole in `m` whose rim, walked round, is shorter than `maxRim`:
 * a fan from the middle of its rim, wound against it so it faces the way the
 * plating round it does, in the paint most of the rim is. Points are matched
 * by where they are, so a crease between two paints is no hole.
 */
export function closeSmallHoles(m, maxRim, { thinRim = 0, thin = 0.12 } = {}) {
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
  // A rim edge is one with no twin: a -> b with no b -> a anywhere. Where
  // two rims pass one point it has two ways on; the shortest way round
  // back to where it started is the hole.
  const out = new Map(), paintAt = new Map();
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = canon[T[t * 3 + e]], b = canon[T[t * 3 + (e + 1) % 3]];
      if (a === b || half.has(key(b, a)) || half.get(key(a, b)) !== 1) continue;
      if (!out.has(a)) out.set(a, []);
      out.get(a).push(b);
      paintAt.set(key(a, b), C[t]);
    }
  }
  const used = new Set();
  let n = 0, tris = 0;
  const dist = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  // The shortest way from b back to a along rim edges not yet closed over,
  // no longer than maxRim less the edge a -> b itself.
  const wayBack = (a, b) => {
    const budget = Math.max(maxRim, thinRim) - dist(a, b);
    const best = new Map([[b, 0]]), from = new Map();
    const open = [[0, b]];
    while (open.length) {
      open.sort((p, q) => q[0] - p[0]);
      const [d, v] = open.pop();
      if (d > best.get(v)) continue;
      if (v === a) {
        const loop = [];
        for (let w = a; w !== b; w = from.get(w)) loop.push(w);
        loop.push(b);
        return loop.reverse();
      }
      for (const w of out.get(v) || []) {
        if (used.has(key(v, w))) continue;
        const dw = d + dist(v, w);
        if (dw > budget || (best.has(w) && best.get(w) <= dw)) continue;
        best.set(w, dw); from.set(w, v); open.push([dw, w]);
      }
    }
    return null;
  };
  for (const [a0, outs] of out) for (const b0 of outs) {
    if (used.has(key(a0, b0))) continue;
    const way = wayBack(a0, b0);
    if (!way || way.length < 3 || way.length > 400) continue;
    // way runs b0 ... a0; the loop is a0 then it.
    const loop = [a0, ...way.slice(0, -1)];
    // Past maxRim only a slit is closed: a tear as long as it likes but, on
    // average, no wider than `thin` times its rim.
    let rim = 0;
    for (let i = 0; i < loop.length; i++) rim += dist(loop[i], loop[(i + 1) % loop.length]);
    if (rim > maxRim) {
      let ax = 0, ay = 0, az = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i] * 3, b = loop[(i + 1) % loop.length] * 3;
        ax += P[a + 1] * P[b + 2] - P[a + 2] * P[b + 1];
        ay += P[a + 2] * P[b] - P[a] * P[b + 2];
        az += P[a] * P[b + 1] - P[a + 1] * P[b];
      }
      if (Math.hypot(ax, ay, az) / 2 > thin * rim) continue;
    }
    for (let i = 0; i < loop.length; i++) used.add(key(loop[i], loop[(i + 1) % loop.length]));
    const mid = [0, 1, 2].map((k) => loop.reduce((s, v) => s + P[v * 3 + k], 0) / loop.length);
    const paints = new Map();
    for (let i = 0; i < loop.length; i++) {
      const pa = paintAt.get(key(loop[i], loop[(i + 1) % loop.length]));
      paints.set(pa, (paints.get(pa) || 0) + 1);
    }
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

export function splitLong(mesh, MAX) {
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

// ---- a ray caster over a mesh ------------------------------------------------------
/**
 * The triangles of `m` bucketed in a grid `cell` metres on a side, and a ray
 * cast through it: `cast(o, d, far, skip)` gives the nearest face hit within
 * `far` of `o` along the unit direction `d` -- its index, its distance, and
 * whether the ray met it from in front (against its normal, as wound) --
 * or null.
 */
export function rayGrid(m, cell = 1.0) {
  const { P, T } = m;
  const nf = T.length / 3;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  for (let k = 0; k < 3; k++) { lo[k] -= 1e-3; hi[k] += 1e-3; }
  const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell)));
  const cells = new Map();
  const idx = (i, j, k) => (i * n[1] + j) * n[2] + k;
  const cl = (v, k) => Math.max(0, Math.min(n[k] - 1, Math.floor((v - lo[k]) / cell)));
  for (let t = 0; t < nf; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const i0 = [0, 1, 2].map((k) => cl(Math.min(P[a + k], P[b + k], P[c + k]), k));
    const i1 = [0, 1, 2].map((k) => cl(Math.max(P[a + k], P[b + k], P[c + k]), k));
    for (let i = i0[0]; i <= i1[0]; i++) for (let j = i0[1]; j <= i1[1]; j++) for (let k = i0[2]; k <= i1[2]; k++) {
      const q = idx(i, j, k);
      let list = cells.get(q);
      if (!list) cells.set(q, list = []);
      list.push(t);
    }
  }
  const hitTri = (t, o, d) => {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;
    const tx = o[0] - P[a], ty = o[1] - P[a + 1], tz = o[2] - P[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
    // The face's normal as wound is n = e1 x e2, and det = e1 . (d x e2) =
    // -d . n: the ray meets its front, running against n, when det is positive.
    return s > 0 ? { s, front: det > 0 } : null;
  };
  const cast = (o, d, far = 1e9, skip = -1) => {
    // Walk the cells the ray passes through (Amanatides & Woo).
    let t0 = 0, t1 = far;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-12) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
      let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 > t1) return null;
    const p = [0, 1, 2].map((k) => o[k] + d[k] * (t0 + 1e-9));
    const c = [0, 1, 2].map((k) => cl(p[k], k));
    const step = d.map((v) => (v > 0 ? 1 : -1));
    const tMax = [0, 1, 2].map((k) => (Math.abs(d[k]) < 1e-12 ? Infinity
      : (lo[k] + (c[k] + (d[k] > 0 ? 1 : 0)) * cell - o[k]) / d[k]));
    const tDelta = d.map((v) => (Math.abs(v) < 1e-12 ? Infinity : cell / Math.abs(v)));
    let best = null;
    for (;;) {
      const list = cells.get(idx(c[0], c[1], c[2]));
      if (list) {
        for (const t of list) {
          if (t === skip) continue;
          const h = hitTri(t, o, d);
          if (h && h.s <= far && (!best || h.s < best.s)) best = { t, s: h.s, front: h.front };
        }
      }
      const k = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      if (best && best.s <= tMax[k]) return best;
      if (tMax[k] > t1) return best;
      c[k] += step[k];
      if (c[k] < 0 || c[k] >= n[k]) return best;
      tMax[k] += tDelta[k];
    }
  };
  return { cast };
}

/**
 * Her single sheets, given their other face. A bulwark, a platform's rim, a
 * boat's gunwale, a sliver the simplification left at a seam: drawn one-sided
 * each is the sky seen from behind. A face is a sheet when, looking out of it
 * from behind, most of `rays` rays go `reach` metres without meeting anything
 * or meet the front of something -- out in the open; the back of a wall that
 * closes a solid looks in at the back of the wall across from it. Each such
 * face is given a twin facing the other way, on points of its own. Only the
 * faces `only(t)` says are looked at. Returns how many were twinned.
 */
export function twinSheets(m, { rays = 7, reach = 6, only = () => true } = {}) {
  const grid = rayGrid(m, 1.0);
  const { P, N, T, C } = m;
  const nf = T.length / 3;
  const twin = [];
  // Directions about the back normal: straight back and a ring at 50 degrees.
  const fan = (n) => {
    const out = [n];
    const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
    const ul = Math.hypot(...u); for (let k = 0; k < 3; k++) u[k] /= ul;
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const c = Math.cos(0.87), s = Math.sin(0.87);
    for (let i = 0; i < rays - 1; i++) {
      const a2 = (2 * Math.PI * i) / (rays - 1);
      out.push([0, 1, 2].map((k) => n[k] * c + (u[k] * Math.cos(a2) + v[k] * Math.sin(a2)) * s));
    }
    return out;
  };
  for (let t = 0; t < nf; t++) {
    if (!only(t)) continue;
    const fn = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const l = Math.hypot(...fn);
    if (l < 1e-12) continue;
    const back = fn.map((v) => -v / l);
    const c = middle(m, t);
    const o = c.map((v, k) => v + back[k] * 0.01);
    let open = 0;
    for (const d of fan(back)) {
      const h = grid.cast(o, d, reach, t);
      if (!h || h.front) open++;
    }
    if (open * 2 > rays) twin.push(t);
  }
  for (const t of twin) {
    const v = [T[t * 3], T[t * 3 + 2], T[t * 3 + 1]];
    const base = P.length / 3;
    for (const i of v) { P.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); N.push(-N[i * 3], -N[i * 3 + 1], -N[i * 3 + 2]); }
    T.push(base, base + 1, base + 2);
    C.push(C[t]);
  }
  return twin.length;
}

/**
 * Cap what a cut across z = `at` left open: every loop of rim edges lying
 * on that plane (within `tol`) is filled, however big, as the polygon it is
 * -- ear-clipped, not fanned, since a deckhouse cut across can be any shape
 * -- facing `face` along z (-1 or +1), and painted as the face it bounds.
 */
export function capPlane(m, at, face, { tol = 0.03, ShapeUtils, Vector2 } = {}) {
  const { P, N, T, C } = m;
  const canon = weld(m);
  const nTri = T.length / 3;
  const on = (v) => Math.abs(P[v * 3 + 2] - at) < tol;
  const key = (a, b) => `${a},${b}`;
  const half = new Set();
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) half.add(key(canon[T[t * 3 + e]], canon[T[t * 3 + (e + 1) % 3]]));
  }
  const next = new Map(), paintAt = new Map();
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = canon[T[t * 3 + e]], b = canon[T[t * 3 + (e + 1) % 3]];
      if (a === b || half.has(key(b, a)) || !on(a) || !on(b)) continue;
      if (!next.has(a)) next.set(a, []);
      next.get(a).push(b);
      paintAt.set(a, C[t]);
    }
  }
  const used = new Set();
  let n = 0, tris = 0;
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [start];
    used.add(start);
    let v = start, closed = false;
    for (let guard = 0; guard < 5000; guard++) {
      const outs = (next.get(v) || []).filter((w) => w === start || !used.has(w));
      if (!outs.length) break;
      const w = outs.includes(start) && loop.length > 2 ? start : outs[0];
      if (w === start) { closed = true; break; }
      loop.push(w); used.add(w); v = w;
    }
    if (!closed || loop.length < 3) continue;
    const pts = loop.map((u) => new Vector2(P[u * 3], P[u * 3 + 1]));
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      area += p.x * q.y - q.x * p.y;
    }
    if (Math.abs(area) / 2 < 0.02) continue;
    const faces = ShapeUtils.triangulateShape(pts, []);
    const base = P.length / 3;
    for (const u of loop) { P.push(P[u * 3], P[u * 3 + 1], at); N.push(0, 0, face); }
    for (const [a, b, c] of faces) {
      // Wound so its face looks along `face`.
      const [pa, pb, pc] = [pts[a], pts[b], pts[c]];
      const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      if (cross * face > 0) T.push(base + a, base + b, base + c);
      else T.push(base + a, base + c, base + b);
      C.push(paintAt.get(loop[a]) ?? C[0]);
      tris++;
    }
    n++;
  }
  return { n, tris };
}
