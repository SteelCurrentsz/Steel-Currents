// Solids for the parts of the Fuso that are drawn here and not taken from a
// sculpt: her funnel and the casing it stands in, and her after tower. Each
// is a convex solid -- a box, a prism, a frustum, a bar -- put in a mesh
// { P, N, T, C } with its faces turned out of it, which is all the pipeline
// in prepare-fuso-hull.mjs asks of anything it is given (it splits the
// normals at the creases and shades the plating itself).

/** A new, empty mesh. */
export const blank = () => ({ P: [], N: [], T: [], C: [] });

/**
 * Add the solid with vertices `pts` ([x, y, z] each) and faces `faces` (lists
 * of indices into it, each flat and convex), with the faces turned to face out
 * of its middle, painted `paint`.
 */
function solid(out, pts, faces, paint) {
  const base = out.P.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (const [x, y, z] of pts) { out.P.push(x, y, z); out.N.push(0, 1, 0); cx += x; cy += y; cz += z; }
  cx /= pts.length; cy /= pts.length; cz /= pts.length;
  for (const f of faces) {
    // The face's own middle, and its normal off the first three corners that are not in a line.
    let mx = 0, my = 0, mz = 0;
    for (const i of f) { mx += pts[i][0]; my += pts[i][1]; mz += pts[i][2]; }
    mx /= f.length; my /= f.length; mz /= f.length;
    let n = null;
    for (let k = 0; k + 2 < f.length && !n; k++) {
      const a = pts[f[k]], b = pts[f[k + 1]], c = pts[f[k + 2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(...w) > 1e-9) n = w;
    }
    if (!n) continue;
    const out_ = n[0] * (mx - cx) + n[1] * (my - cy) + n[2] * (mz - cz) >= 0;
    const ring = out_ ? f : f.slice().reverse();
    for (let k = 1; k + 1 < ring.length; k++) {
      out.T.push(base + ring[0], base + ring[k], base + ring[k + 1]);
      out.C.push(paint);
    }
  }
}

/** A box, `x0..x1` across, `y0..y1` up, `z0..z1` along. */
export function box(out, x0, x1, y0, y1, z0, z1, paint) {
  const p = [];
  for (const y of [y0, y1]) for (const z of [z0, z1]) for (const x of [x0, x1]) p.push([x, y, z]);
  // index = (y * 4) + (z * 2) + x
  solid(out, p, [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]], paint);
}

/**
 * A prism over the outline `poly` ([x, z] each, convex), from `y0` to `y1`.
 */
export function prism(out, poly, y0, y1, paint) {
  const n = poly.length;
  const p = [];
  for (const y of [y0, y1]) for (const [x, z] of poly) p.push([x, y, z]);
  const faces = [poly.map((_, i) => i), poly.map((_, i) => n + i)];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
  solid(out, p, faces, paint);
}

/** The outline of a rectangle `x0..x1` by `z0..z1` with its corners cut off by `c`. */
export function chamfered(x0, x1, z0, z1, c) {
  return [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
}

/**
 * A solid of revolution about the vertical line through (cx, cz), elliptical
 * if `rx` and `rz` differ: `rings` is [[y, k], ...] bottom to top, k how much
 * of (rx, rz) it is at that height. Closed top and bottom.
 */
export function lathe(out, cx, cz, rx, rz, rings, seg, paint) {
  const p = [];
  for (const [y, k] of rings) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      p.push([cx + Math.cos(a) * rx * k, y, cz + Math.sin(a) * rz * k]);
    }
  }
  const faces = [Array.from({ length: seg }, (_, i) => i), Array.from({ length: seg }, (_, i) => (rings.length - 1) * seg + i)];
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      faces.push([r * seg + i, r * seg + j, (r + 1) * seg + j, (r + 1) * seg + i]);
    }
  }
  solid(out, p, faces, paint);
}

/**
 * A round bar from `a` to `b` ([x, y, z] each), `r0` thick at `a` and `r1` at
 * `b`, `seg` sided, closed at both ends. A mast, a pipe, a searchlight, a
 * boom: anything that is round and has an axis.
 */
export function tube(out, a, b, r0, r1, seg, paint) {
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ax);
  const d = ax.map((v) => v / len);
  // Two directions across it.
  const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
  const ul = Math.hypot(...u);
  u = u.map((v) => v / ul);
  const w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const p = [];
  for (const [c, r] of [[a, r0], [b, r1]]) {
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const cs = Math.cos(t) * r, sn = Math.sin(t) * r;
      p.push([c[0] + u[0] * cs + w[0] * sn, c[1] + u[1] * cs + w[1] * sn, c[2] + u[2] * cs + w[2] * sn]);
    }
  }
  const faces = [Array.from({ length: seg }, (_, i) => i), Array.from({ length: seg }, (_, i) => seg + i)];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    faces.push([i, j, seg + j, seg + i]);
  }
  solid(out, p, faces, paint);
}

/**
 * A square bar from `a` to `b`, `w` across and `h` the other way (h is
 * measured across the bar in the plane of a-b and straight up, so a bar
 * leaning fore and aft is `h` thick fore and aft): a strut, a rung, a yard.
 */
export function bar(out, a, b, w, h, paint) {
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ax);
  const d = ax.map((v) => v / len);
  // Across it, level; and the other way, square to both.
  let s = [d[2], 0, -d[0]];
  let sl = Math.hypot(...s);
  if (sl < 1e-6) { s = [1, 0, 0]; sl = 1; }
  s = s.map((v) => v / sl);
  const t = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
  const p = [];
  for (const c of [a, b]) {
    for (const [sa, ta] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.push([c[0] + s[0] * sa * w / 2 + t[0] * ta * h / 2, c[1] + s[1] * sa * w / 2 + t[1] * ta * h / 2,
        c[2] + s[2] * sa * w / 2 + t[2] * ta * h / 2]);
    }
  }
  solid(out, p, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], paint);
}
