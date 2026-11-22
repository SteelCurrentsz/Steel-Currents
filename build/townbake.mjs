// Bake a Meshy model's texture onto a cut-down copy of it.
//
// Meshy textures its models in hundreds of small pieces, and a model cut down
// to what a town of a hundred houses can afford keeps none of their edges: a
// face of the cut-down model runs across a dozen pieces of the texture, and
// the texture drawn on it is a smear. So the cut-down model gets a texture of
// its own. Its faces are gathered into flat charts -- the faces that touch and
// face the same way of the six, which on a building is a wall, a roof slope
// or a floor of a cornice -- each chart laid out flat in a fresh texture at
// one scale for the whole model, and every texel of it painted with the
// colour the full model has at the nearest point of its surface.
//
// `bake(full, cut, size)`:
//   full: { P, UV, I, img: { data, w, h } } -- the model as Meshy made it, its
//         corners already where the game wants them, its texture as raw RGB;
//   cut:  { P, I, N } -- the cut-down model, its normals one to a corner;
//   size: the new texture's side, in pixels.
// Returns { P, UV, N, I, rgb } -- the cut-down model with its corners split
// where the charts meet, and the new texture as raw RGB, `size` square.

const PAD = 2;

/** The point of triangle abc nearest p, as barycentric weights (after Ericson). */
function nearest(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

export function bake(full, cut, size) {
  const { P: FP, UV: FU, I: FI, img } = full;
  const { P: CP, I: CI, N: CN } = cut;
  const nf = CI.length / 3;
  const pt = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

  // ---- the charts: faces that touch along an edge and face the same way of six
  const axis = new Int8Array(nf);
  const fn = [];
  for (let f = 0; f < nf; f++) {
    const n = cross(sub(pt(CP, CI[f * 3 + 1]), pt(CP, CI[f * 3])), sub(pt(CP, CI[f * 3 + 2]), pt(CP, CI[f * 3])));
    const l = Math.hypot(...n) || 1;
    fn.push(n.map((v) => v / l));
    const k = [0, 1, 2].reduce((m, c) => (Math.abs(n[c]) > Math.abs(n[m]) ? c : m), 0);
    axis[f] = k * 2 + (n[k] < 0 ? 1 : 0);
  }
  const parent = Int32Array.from({ length: nf }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const edges = new Map();
  for (let f = 0; f < nf; f++) {
    for (let k = 0; k < 3; k++) {
      const a = CI[f * 3 + k], b = CI[f * 3 + ((k + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const g = edges.get(key);
      if (g === undefined) edges.set(key, f);
      else if (axis[g] === axis[f]) parent[find(g)] = find(f);
    }
  }
  const byRoot = new Map();
  for (let f = 0; f < nf; f++) {
    const r = find(f);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(f);
  }
  // Each chart flat on the plane it faces: the two co-ordinates that are not
  // its axis, in the model's own units.
  const flat = (ax, p) => (ax >> 1 === 0 ? [p[2], p[1]] : ax >> 1 === 1 ? [p[0], p[2]] : [p[0], p[1]]);
  const charts = [...byRoot.values()].map((faces) => {
    const ax = axis[faces[0]];
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const f of faces) for (let k = 0; k < 3; k++) {
      const [u, v] = flat(ax, pt(CP, CI[f * 3 + k]));
      u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v);
    }
    return { faces, ax, u0, v0, w: u1 - u0, h: v1 - v0 };
  });

  // ---- laid out in the texture: shelves, tallest first, at the largest scale that fits
  charts.sort((a, b) => b.h - a.h || b.w - a.w);
  const area = charts.reduce((s, c) => s + c.w * c.h, 0) || 1;
  const fits = (k) => {
    let x = 0, y = 0, shelf = 0;
    for (const c of charts) {
      const bw = Math.ceil(c.w * k) + PAD * 2, bh = Math.ceil(c.h * k) + PAD * 2;
      if (bw > size) return false;
      if (x + bw > size) { y += shelf; x = 0; shelf = 0; }
      c.x = x + PAD; c.y = y + PAD;
      x += bw; shelf = Math.max(shelf, bh);
    }
    return y + shelf <= size;
  };
  let k = Math.sqrt((size * size * 0.8) / area);
  while (!fits(k)) k *= 0.96;

  // ---- the cut-down model again, its corners split where the charts meet
  const P = [], UV = [], N = [], I = [];
  const own = new Map();
  const tri = [];
  for (const c of charts) {
    for (const f of c.faces) {
      const t = [];
      for (let q = 0; q < 3; q++) {
        const v = CI[f * 3 + q];
        const key = `${v},${c.ax},${c.x},${c.y}`;
        let o = own.get(key);
        const [u, w] = flat(c.ax, pt(CP, v));
        const px = c.x + (u - c.u0) * k, py = c.y + (w - c.v0) * k;
        if (o === undefined) {
          o = P.length / 3;
          own.set(key, o);
          P.push(...pt(CP, v));
          N.push(...pt(CN, v));
          UV.push(px / size, py / size);
        }
        I.push(o);
        t.push([px, py, pt(CP, v)]);
      }
      tri.push({ t, n: fn[f] });
    }
  }

  // ---- the full model in a grid, for finding the nearest point of it fast
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < FP.length; i += 3) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], FP[i + c]); hi[c] = Math.max(hi[c], FP[i + c]);
  }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const cell = ext / 48;
  lo = lo.map((v) => v - cell);
  const dims = [0, 1, 2].map((c) => Math.ceil((hi[c] - lo[c]) / cell) + 2);
  const grid = new Map();
  const cellOf = (p) => [0, 1, 2].map((c) => Math.floor((p[c] - lo[c]) / cell));
  const ffn = [];
  for (let f = 0; f < FI.length / 3; f++) {
    const a = pt(FP, FI[f * 3]), b = pt(FP, FI[f * 3 + 1]), c = pt(FP, FI[f * 3 + 2]);
    const n = cross(sub(b, a), sub(c, a));
    const l = Math.hypot(...n) || 1;
    ffn.push(n.map((v) => v / l));
    const ca = cellOf(a), cb = cellOf(b), cc = cellOf(c);
    for (let x = Math.min(ca[0], cb[0], cc[0]); x <= Math.max(ca[0], cb[0], cc[0]); x++)
      for (let y = Math.min(ca[1], cb[1], cc[1]); y <= Math.max(ca[1], cb[1], cc[1]); y++)
        for (let z = Math.min(ca[2], cb[2], cc[2]); z <= Math.max(ca[2], cb[2], cc[2]); z++) {
          const key = (x * dims[1] + y) * dims[2] + z;
          let g = grid.get(key);
          if (!g) { g = []; grid.set(key, g); }
          g.push(f);
        }
  }
  const sample = (u, v) => {
    // Bilinear, off the full model's texture.
    const x = Math.min(img.w - 1.001, Math.max(0, u * img.w - 0.5));
    const y = Math.min(img.h - 1.001, Math.max(0, v * img.h - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy, ch) => img.data[(yy * img.w + xx) * 3 + ch];
    return [0, 1, 2].map((ch) => (at(x0, y0, ch) * (1 - fx) + at(x0 + 1, y0, ch) * fx) * (1 - fy)
      + (at(x0, y0 + 1, ch) * (1 - fx) + at(x0 + 1, y0 + 1, ch) * fx) * fy);
  };
  /** The full model's colour nearest p, off a face that looks the way n does if one is near. */
  const colourAt = (p, n) => {
    const c0 = cellOf(p);
    let best = Infinity, hit = null;
    for (let r = 1; r <= 3 && !hit; r++) {
      const seen = new Set();
      for (let x = c0[0] - r; x <= c0[0] + r; x++)
        for (let y = c0[1] - r; y <= c0[1] + r; y++)
          for (let z = c0[2] - r; z <= c0[2] + r; z++) {
            const g = grid.get((x * dims[1] + y) * dims[2] + z);
            if (!g) continue;
            for (const f of g) {
              if (seen.has(f)) continue;
              seen.add(f);
              const ia = FI[f * 3], ib = FI[f * 3 + 1], ic = FI[f * 3 + 2];
              const w = nearest(p, pt(FP, ia), pt(FP, ib), pt(FP, ic));
              const q = [0, 1, 2].map((cc) => w[0] * FP[ia * 3 + cc] + w[1] * FP[ib * 3 + cc] + w[2] * FP[ic * 3 + cc]);
              let d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
              // The other side of a thin wall is near too, and the wrong colour.
              const fa = ffn[f];
              if (fa[0] * n[0] + fa[1] * n[1] + fa[2] * n[2] < 0.3) d += cell * 2;
              if (d < best) { best = d; hit = [ia, ib, ic, w]; }
            }
          }
    }
    if (!hit) return null;
    const [ia, ib, ic, w] = hit;
    return sample(w[0] * FU[ia * 2] + w[1] * FU[ib * 2] + w[2] * FU[ic * 2],
      w[0] * FU[ia * 2 + 1] + w[1] * FU[ib * 2 + 1] + w[2] * FU[ic * 2 + 1]);
  };

  // ---- every texel of every face painted, the gutters then filled outward
  const rgb = new Float32Array(size * size * 3);
  const done = new Uint8Array(size * size);
  for (const { t, n } of tri) {
    const [A, B, C] = t;
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])) - 1);
    const x1 = Math.min(size - 1, Math.ceil(Math.max(A[0], B[0], C[0])) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])) - 1);
    const y1 = Math.min(size - 1, Math.ceil(Math.max(A[1], B[1], C[1])) + 1);
    const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / den;
      const b = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / den;
      const c = 1 - a - b;
      // A little past the edges, so the texels the edge passes through are painted too.
      const e = -0.02;
      if (a < e || b < e || c < e) continue;
      const p = [0, 1, 2].map((q) => a * A[2][q] + b * B[2][q] + c * C[2][q]);
      const col = colourAt(p, n);
      if (!col) continue;
      const o = y * size + x;
      rgb.set(col, o * 3);
      done[o] = 1;
    }
  }
  for (let pass = 0; pass < PAD + 2; pass++) {
    const next = done.slice();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = y * size + x;
      if (done[o]) continue;
      const s = [0, 0, 0];
      let m = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size || !done[yy * size + xx]) continue;
        const q = (yy * size + xx) * 3;
        s[0] += rgb[q]; s[1] += rgb[q + 1]; s[2] += rgb[q + 2]; m++;
      }
      if (m) { rgb.set(s.map((v) => v / m), o * 3); next[o] = 1; }
    }
    done.set(next);
  }
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < rgb.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(rgb[i])));
  return { P, UV, N, I, rgb: out, charts: charts.length, scale: k };
}
