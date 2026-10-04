// Re-form a melted run of a sculpt: solidify it on a voxel grid and draw its
// surface afresh.
//
// A sculpt made by a generator melts where it is most intricate. A bridge
// tower comes out as a sponge -- pitted through with holes a metre across,
// its platforms fused into one another by webs of plate -- and a mast as a
// lattice of drips, and every wire she was rigged with is a tube fused into
// both. Denoising cannot help: it moves the surface, and what is wrong is the
// surface's topology. So the run is re-formed instead:
//
//   * every triangle of it is laid into a grid of voxels, a surface a voxel
//     thick;
//   * that is closed (grown by `close`, flood-filled from the air, shrunk by
//     `close` again): every pit, pore and slot narrower than twice `close` is
//     filled, and what the air cannot get into is solid;
//   * and opened (shrunk by `open`, grown by `open`): every wire, rail, drip
//     and web thinner than twice `open` goes, and nothing thicker is touched;
//   * what is left standing on her deck is kept, a column at a time, from a
//     little under her deck up -- a column with nothing on it is her deck, and
//     her deck is left as the sculpt drew it;
//   * and its surface is drawn afresh through the grid, smoothed, as a
//     closed skin.
//
// The new skin goes into her under her deck; the sculpt's own triangles of
// what it replaces are listed for taking off, from a hand over her deck up, so
// that the foot of each old wall stands inside the new one and nothing between
// the two can be seen through.
//
// Every length here is in metres, in her own frame (Y up); the grid is laid
// square to it.

/** Closest-point squared distance from p to triangle abc (Ericson 5.1.5). */
function distTri2(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; } else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz);
            } else {
              const den = 1 / (va + vb + vc);
              const v = vb * den, w = vc * den;
              qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/**
 * The squared distance, in voxels, from every voxel to the nearest voxel set
 * in `mask` -- exactly, by Felzenszwalb and Huttenlocher's lower envelope, one
 * axis at a time.
 */
function edt(mask, nx, ny, nz) {
  const N = nx * ny * nz;
  const INF = 1e20;
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = mask[i] ? 0 : INF;
  const nMax = Math.max(nx, ny, nz);
  const f = new Float64Array(nMax), out = new Float64Array(nMax);
  const v = new Int32Array(nMax), zz = new Float64Array(nMax + 1);
  const line = (n) => {
    let k = 0;
    v[0] = 0; zz[0] = -Infinity; zz[1] = Infinity;
    for (let q = 1; q < n; q++) {
      if (f[q] >= INF) continue;
      if (f[v[k]] >= INF) { v[k] = q; zz[k] = -Infinity; zz[k + 1] = Infinity; continue; }
      let s;
      for (;;) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s <= zz[k] && k > 0) k--; else break;
      }
      if (s <= zz[k]) { v[k] = q; zz[k] = -Infinity; zz[k + 1] = Infinity; continue; }
      k++; v[k] = q; zz[k] = s; zz[k + 1] = Infinity;
    }
    if (f[v[0]] >= INF) { for (let q = 0; q < n; q++) out[q] = INF; return; }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (zz[k + 1] < q) k++;
      out[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  const pass = (n, count, at) => {
    for (let l = 0; l < count; l++) {
      for (let q = 0; q < n; q++) f[q] = d[at(l, q)];
      line(n);
      for (let q = 0; q < n; q++) d[at(l, q)] = out[q];
    }
  };
  pass(nx, ny * nz, (l, q) => l * nx + q);
  pass(ny, nx * nz, (l, q) => { const i = l % nx, k = (l / nx) | 0; return i + nx * (q + ny * k); });
  pass(nz, nx * ny, (l, q) => l + nx * ny * q);
  return d;
}

/** Everything within `r` voxels of `mask`. */
function grow(mask, nx, ny, nz, r) {
  const d = edt(mask, nx, ny, nz);
  const out = new Uint8Array(mask.length);
  const r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}

/** Everything of `mask` more than `r` voxels in from its edge. */
function shrink(mask, nx, ny, nz, r) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const g = grow(inv, nx, ny, nz, r);
  for (let i = 0; i < g.length; i++) g[i] = g[i] ? 0 : 1;
  return g;
}

/** A separable Gaussian blur of a field, sigma in voxels. */
function blur(F, nx, ny, nz, sigma) {
  const R = Math.max(1, Math.ceil(sigma * 2.5));
  const w = [];
  let s = 0;
  for (let k = -R; k <= R; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); s += v; }
  for (let k = 0; k < w.length; k++) w[k] /= s;
  const tmp = new Float32Array(F.length);
  const strides = [1, nx, nx * ny];
  const dims = [nx, ny, nz];
  let src = F, dst = tmp;
  for (let ax = 0; ax < 3; ax++) {
    const st = strides[ax], n = dims[ax];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = [i, j, k][ax];
      const base = i + nx * (j + ny * k);
      let acc = 0;
      for (let o = -R; o <= R; o++) {
        const q = Math.min(n - 1, Math.max(0, c + o));
        acc += w[o + R] * src[base + (q - c) * st];
      }
      dst[base] = acc;
    }
    [src, dst] = [dst, src];
  }
  if (src !== F) F.set(src);
  return F;
}

/**
 * The surface through a field at `iso`, by surface nets: a point in every
 * cell the surface passes through, at the mean of where it crosses the
 * cell's edges, and a quad across every edge of the grid it crosses -- wound
 * so it faces out of what is above `iso`.
 */
function surfaceNets(F, nx, ny, nz, iso) {
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const P = [];
  const at = (i, j, k) => F[i + nx * (j + ny * k)];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float64Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = corners[c];
      val[c] = at(i + a, j + b, k + d);
      if (val[c] > iso) inside++;
    }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [p, q] of edges) {
      const vp = val[p], vq = val[q];
      if ((vp > iso) === (vq > iso)) continue;
      const t = (iso - vp) / (vq - vp);
      const [ax, ay, az] = corners[p], [bx, by, bz] = corners[q];
      sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t;
      n++;
    }
    cell[i + cx * (j + cy * k)] = P.length / 3;
    P.push(i + sx / n, j + sy / n, k + sz / n);
  }
  const T = [];
  const C = (i, j, k) => cell[i + cx * (j + cy * k)];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Split along the shorter diagonal.
    const d1 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d2 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (d1 <= d2) T.push(a, b, c, a, c, d); else T.push(a, b, d, b, c, d);
  };
  // Each edge of the grid the surface crosses, and the four cells round it;
  // the quad faces towards the end of the edge that is outside.
  const emit = (inside, a, b, c, d) => (inside ? quad(a, b, c, d) : quad(d, c, b, a));
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = at(i, j, k) > iso;
    if ((at(i + 1, j, k) > iso) !== v0) emit(v0, C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k));
    if ((at(i, j + 1, k) > iso) !== v0) emit(v0, C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1));
    if ((at(i, j, k + 1) > iso) !== v0) emit(v0, C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k));
  }
  return { P, T };
}

/** Taubin's pair of passes, which smooth without shrinking. */
function taubin(P, T, iters, lambda = 0.5, mu = -0.53) {
  const n = P.length / 3;
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < T.length; t += 3) {
    for (let e = 0; e < 3; e++) { const a = T[t + e], b = T[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  }
  const lists = nb.map((s) => Int32Array.from(s));
  const Q = new Float64Array(P.length);
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 ? mu : lambda;
    for (let v = 0; v < n; v++) {
      const l = lists[v];
      if (!l.length) { Q[v * 3] = P[v * 3]; Q[v * 3 + 1] = P[v * 3 + 1]; Q[v * 3 + 2] = P[v * 3 + 2]; continue; }
      let sx = 0, sy = 0, sz = 0;
      for (const u of l) { sx += P[u * 3]; sy += P[u * 3 + 1]; sz += P[u * 3 + 2]; }
      const k = 1 / l.length;
      Q[v * 3] = P[v * 3] + f * (sx * k - P[v * 3]);
      Q[v * 3 + 1] = P[v * 3 + 1] + f * (sy * k - P[v * 3 + 1]);
      Q[v * 3 + 2] = P[v * 3 + 2] + f * (sz * k - P[v * 3 + 2]);
    }
    for (let i = 0; i < P.length; i++) P[i] = Q[i];
  }
}

/**
 * Square a solid up the way a ship is built: every wall upright and every
 * deck level. A voxel is kept if most of the column of `wy` voxels over and
 * under it is solid -- which takes the bumps and dents out of a wall without
 * moving a deck edge -- and then if most of the square of `wp` voxels round it
 * in its own layer is -- which straightens a wall's run in plan without
 * moving its height. `passes` times over.
 */
function regularise(solid, nx, ny, nz, { wy, wp, passes }) {
  const sxy = nx * ny;
  const col = new Int32Array(ny + 1);
  const plan = new Int32Array((nx + 1) * (nz + 1));
  const next = new Uint8Array(solid.length);
  for (let p = 0; p < passes; p++) {
    if (wy > 0) {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        col[0] = 0;
        for (let j = 0; j < ny; j++) col[j + 1] = col[j] + solid[i + nx * j + sxy * k];
        for (let j = 0; j < ny; j++) {
          const a = Math.max(0, j - wy), b = Math.min(ny, j + wy + 1);
          next[i + nx * j + sxy * k] = (col[b] - col[a]) * 2 > b - a ? 1 : 0;
        }
      }
      solid.set(next);
    }
    if (wp > 0) {
      const W = nx + 1;
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) {
          plan[i + W * k] = i === 0 || k === 0 ? 0
            : solid[(i - 1) + nx * j + sxy * (k - 1)] + plan[(i - 1) + W * k] + plan[i + W * (k - 1)] - plan[(i - 1) + W * (k - 1)];
        }
        for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
          const i0 = Math.max(0, i - wp), i1 = Math.min(nx, i + wp + 1);
          const k0 = Math.max(0, k - wp), k1 = Math.min(nz, k + wp + 1);
          const sum = plan[i1 + W * k1] - plan[i0 + W * k1] - plan[i1 + W * k0] + plan[i0 + W * k0];
          next[i + nx * j + sxy * k] = sum * 2 > (i1 - i0) * (k1 - k0) ? 1 : 0;
        }
      }
      solid.set(next);
    }
  }
  return solid;
}

/**
 * Terrace what stands on her deck. Every column of it is one run of solid
 * from under her deck up to a height -- so every wall is upright -- and each
 * column's height is the median of the heights round it, `r` voxels each
 * way: every deck and roof is flat, every step between two of them stays as
 * sharp as it was, and a lump or a dent smaller than the window goes. What
 * stands clear over a gap (the arms of a rangefinder, a platform's wing) is
 * kept as it is, if it is at least `minRun` voxels thick. `passes` times.
 */
function terrace(solid, nx, ny, nz, deckJ, { r = 3, passes = 2, minRun = 3, lowJ, riseJ }) {
  const sxy = nx * ny;
  const H = new Int32Array(nx * nz);
  const at = (i, j, k) => i + nx * j + sxy * k;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = i + nx * k;
    const jd = deckJ[c];
    // The run the deck is in, from the foot of the column.
    let top = -1;
    if (solid[at(i, Math.max(0, jd - lowJ), k)] || solid[at(i, Math.min(ny - 1, jd + riseJ), k)]) {
      let j = Math.max(0, jd - lowJ);
      while (j < ny && !solid[at(i, j, k)]) j++;
      while (j < ny && solid[at(i, j, k)]) j++;
      top = j - 1;
    }
    H[c] = top < jd ? jd : top;
  }
  const win = [];
  for (let p = 0; p < passes; p++) {
    const H2 = new Int32Array(H.length);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      win.length = 0;
      for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
        if (di * di + dk * dk > r * r + r) continue;
        const ii = Math.min(nx - 1, Math.max(0, i + di)), kk = Math.min(nz - 1, Math.max(0, k + dk));
        win.push(H[ii + nx * kk]);
      }
      win.sort((a, b) => a - b);
      H2[i + nx * k] = win[win.length >> 1];
    }
    H.set(H2);
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = i + nx * k;
    const jd = deckJ[c];
    const top = H[c];
    let j = 0;
    // The ground run, from its foot to its new top.
    for (; j <= top && j < ny; j++) solid[at(i, j, k)] = j >= jd - lowJ && top > jd ? 1 : 0;
    // Over it: what stands clear, if it is thick enough to be anything.
    let run = 0;
    for (j = top + 1; j < ny; j++) {
      if (solid[at(i, j, k)]) { run++; continue; }
      if (run && run < minRun) for (let q = j - run; q < j; q++) solid[at(i, q, k)] = 0;
      run = 0;
    }
    if (run && run < minRun) for (let q = ny - run; q < ny; q++) solid[at(i, q, k)] = 0;
    // A clear gap of a voxel or two under an overhang is closed down on to
    // the run under it.
    if (top + 1 < ny && !solid[at(i, top + 1, k)] && top + 2 < ny && solid[at(i, top + 2, k)]) solid[at(i, top + 1, k)] = 1;
  }
  return solid;
}

/**
 * Re-form what stands on her deck inside `box` (`{ x0, x1, y0, y1, z0, z1 }`).
 *
 *   h        the voxel, in metres
 *   close    the radius every pit and slot is closed at
 *   open     the radius every wire and web is opened at
 *   deck     (x, z) => the height of her deck there
 *   rise     how far over her deck a column has to have something on it to
 *            be re-formed at all
 *   bury     how far under her deck the new skin goes down
 *   skip     (x, y, z) => true for a triangle not to be laid in at all -- a
 *            mast that is to be drawn afresh in the ship, not re-formed
 *   minCells a piece left standing on its own smaller than this many voxels
 *            goes
 *   sigma    the blur the surface is drawn through, in voxels
 *   smooth   how many Taubin passes the new skin is given
 *   square   `{ wy, wp, passes }`: square it up afterwards (see regularise)
 *   terraced `{ r, passes, minRun }`: and terrace it (see terrace)
 *
 * `m` is `{ P, T }` in metres. Returns `{ skin, drop, stats }`: the new skin
 * as `{ P, T }`, and one byte a triangle of `m`, set on each of hers it
 * replaces.
 */
export function reform(m, box, {
  h = 0.2, close = 0.5, open = 0.25, deck, rise = 0.45, bury = 0.4, keep = 0.5,
  skip = () => false, minCells = 60, sigma = 0.75, smooth = 4, debug = null,
  square = null, terraced = null,
} = {}) {
  const { P, T } = m;
  const pad = 3;
  const x0 = box.x0 - pad * h, y0 = box.y0 - pad * h, z0 = box.z0 - pad * h;
  const nx = Math.ceil((box.x1 - box.x0) / h) + 2 * pad + 1;
  const ny = Math.ceil((box.y1 - box.y0) / h) + 2 * pad + 1;
  const nz = Math.ceil((box.z1 - box.z0) / h) + 2 * pad + 1;
  const N = nx * ny * nz;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const stats = { grid: [nx, ny, nz], laid: 0, skipped: 0 };
  // ---- lay her in -------------------------------------------------------
  const surf = new Uint8Array(N);
  const reach = h * 0.62;
  const nTri = T.length / 3;
  const inBox = new Uint8Array(nTri);
  for (let t = 0; t < nTri; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
    const lx = Math.min(ax, bx, cx), hx = Math.max(ax, bx, cx);
    const ly = Math.min(ay, by, cy), hy = Math.max(ay, by, cy);
    const lz = Math.min(az, bz, cz), hz = Math.max(az, bz, cz);
    if (hx < box.x0 || lx > box.x1 || hy < box.y0 || ly > box.y1 || hz < box.z0 || lz > box.z1) continue;
    inBox[t] = 1;
    if (skip((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3)) { stats.skipped++; continue; }
    stats.laid++;
    const i0 = Math.max(0, Math.floor((lx - reach - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((hx + reach - x0) / h));
    const j0 = Math.max(0, Math.floor((ly - reach - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((hy + reach - y0) / h));
    const k0 = Math.max(0, Math.floor((lz - reach - z0) / h)), k1 = Math.min(nz - 1, Math.ceil((hz + reach - z0) / h));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = idx(i, j, k);
      if (surf[q]) continue;
      if (distTri2(x0 + i * h, y0 + j * h, z0 + k * h, ax, ay, az, bx, by, bz, cx, cy, cz) <= reach * reach) surf[q] = 1;
    }
  }
  // ---- close ----------------------------------------------------------------
  const rc = close / h;
  const grown = grow(surf, nx, ny, nz, rc);
  // The air: flood-filled from the top of the grid and its sides, over her
  // deck -- not from its floor, which is inside her.
  const air = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const seed = (i, j, k) => {
    const q = idx(i, j, k);
    if (grown[q] || air[q]) return;
    air[q] = 1; queue[qt++] = q;
  };
  const deckJ = new Int32Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    deckJ[i + nx * k] = Math.round((deck(x0 + i * h, z0 + k * h) - y0) / h);
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) seed(i, ny - 1, k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { seed(0, j, k); seed(nx - 1, j, k); }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (j > deckJ[i] + 2) seed(i, j, 0);
    if (j > deckJ[i + nx * (nz - 1)] + 2) seed(i, j, nz - 1);
  }
  const sxy = nx * ny;
  while (qh < qt) {
    const q = queue[qh++];
    const i = q % nx, j = ((q / nx) | 0) % ny, k = (q / sxy) | 0;
    if (i > 0) seed(i - 1, j, k);
    if (i < nx - 1) seed(i + 1, j, k);
    if (j > 0) seed(i, j - 1, k);
    if (j < ny - 1) seed(i, j + 1, k);
    if (k > 0) seed(i, j, k - 1);
    if (k < nz - 1) seed(i, j, k + 1);
  }
  const solid0 = new Uint8Array(N);
  for (let q = 0; q < N; q++) solid0[q] = air[q] ? 0 : 1;
  const closed = shrink(solid0, nx, ny, nz, rc);
  if (debug) debug({ surf, solid0, closed, nx, ny, nz, x0, y0, z0, h });
  // ---- open -------------------------------------------------------------------
  const ro = open / h;
  const solid = grow(shrink(closed, nx, ny, nz, ro), nx, ny, nz, ro);
  if (square) regularise(solid, nx, ny, nz, square);
  // ---- only what stands on her deck ---------------------------------------
  const riseJ = Math.round(rise / h), buryJ = Math.round(bury / h);
  const column = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = i + nx * k;
    const jd = deckJ[c];
    let has = false;
    for (let j = Math.max(0, jd + riseJ); j < ny && !has; j++) if (solid[idx(i, j, k)]) has = true;
    column[c] = has ? 1 : 0;
    for (let j = 0; j < ny; j++) {
      if (!has || j < jd - buryJ) solid[idx(i, j, k)] = 0;
    }
  }
  if (terraced) terrace(solid, nx, ny, nz, deckJ, { ...terraced, lowJ: buryJ, riseJ });
  // Nothing on the grid's own walls: the skin is closed all round.
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i < 2 || j < 2 || k < 2 || i >= nx - 2 || j >= ny - 2 || k >= nz - 2) solid[idx(i, j, k)] = 0;
  }
  // ---- and nothing standing on its own that is too small to be anything ----
  {
    const label = new Int32Array(N).fill(-1);
    let dropped = 0, pieces = 0;
    for (let s = 0; s < N; s++) {
      if (!solid[s] || label[s] >= 0) continue;
      qh = 0; qt = 0;
      queue[qt++] = s; label[s] = s;
      while (qh < qt) {
        const q = queue[qh++];
        const i = q % nx, j = ((q / nx) | 0) % ny, k = (q / sxy) | 0;
        const nbrs = [i > 0 ? q - 1 : -1, i < nx - 1 ? q + 1 : -1, j > 0 ? q - nx : -1, j < ny - 1 ? q + nx : -1,
          k > 0 ? q - sxy : -1, k < nz - 1 ? q + sxy : -1];
        for (const u of nbrs) if (u >= 0 && solid[u] && label[u] < 0) { label[u] = s; queue[qt++] = u; }
      }
      pieces++;
      if (qt < minCells) { for (let r = 0; r < qt; r++) solid[queue[r]] = 0; dropped++; }
    }
    stats.pieces = pieces;
    stats.droppedPieces = dropped;
  }
  // ---- draw it ----------------------------------------------------------------
  const F = new Float32Array(N);
  for (let q = 0; q < N; q++) F[q] = solid[q];
  blur(F, nx, ny, nz, sigma);
  const net = surfaceNets(F, nx, ny, nz, 0.5);
  if (smooth) taubin(net.P, net.T, smooth);
  const skin = { P: new Array(net.P.length), T: net.T };
  for (let v = 0; v < net.P.length; v += 3) {
    skin.P[v] = x0 + net.P[v] * h;
    skin.P[v + 1] = y0 + net.P[v + 1] * h;
    skin.P[v + 2] = z0 + net.P[v + 2] * h;
  }
  stats.skin = skin.T.length / 3;
  // ---- what of hers it replaces --------------------------------------------
  // Over a column the skin stands on, everything from `keep` over her deck up;
  // anywhere else in the box, everything that stood higher than `rise` -- the
  // wires over her open deck and what the opening took away -- and whatever
  // was not laid in at all.
  const drop = new Uint8Array(nTri);
  const colAt = (x, z) => {
    const i = Math.round((x - x0) / h), k = Math.round((z - z0) / h);
    for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) {
      const ii = i + di, kk = k + dk;
      if (ii >= 0 && ii < nx && kk >= 0 && kk < nz && column[ii + nx * kk]) return true;
    }
    return false;
  };
  let dropped = 0;
  for (let t = 0; t < nTri; t++) {
    if (!inBox[t]) continue;
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    if (cx < box.x0 || cx > box.x1 || cz < box.z0 || cz > box.z1) continue;
    const d = deck(cx, cz);
    const under = colAt(cx, cz);
    if (skip(cx, cy, cz) || (under && cy > d + keep) || (!under && cy > d + rise)) {
      drop[t] = 1; dropped++;
    }
  }
  stats.dropped = dropped;
  return { skin, drop, stats };
}
