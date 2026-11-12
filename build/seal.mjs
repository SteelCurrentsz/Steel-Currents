// Seal a ship's hull mesh: close what the decimator opened, and draw from both
// sides what can only be seen from behind.
//
// Two passes over a hull as the prepare-*-hull scripts hold it -- { P, N, T,
// C, S }, S marking the faces drawn from both sides (a sheet):
//
// mirrorSides: the model is the same ship either side of her centreline, and
// the decimator is not: it takes a plate off one side and keeps its twin on
// the other. She is put, keel to truck, on a grid of her length and height a
// quarter metre square, how far out each side of her reaches in each cell;
// and wherever one side stops more than `slack` short of the other, every
// face of the other side's skin that reaches into that cell is copied across
// her centreline. (The Takao's pass, build/prepare-takao-hull.mjs.)
//
// sealFromOutside: parallel rays from every side of her and from above at a
// slant, a quarter metre apart. The first face each meets is what the eye
// sees there; one that faces away from the ray -- the inside of a house whose
// outer plate the model left out, a roof drawn upside down, a screen drawn as
// one sheet -- would be culled and the eye would look straight through it, to
// the sea. Each such face is made a sheet, and is seen.
import { faceNormal } from './sculpt.mjs';

/** Copy across her centreline each face of the side that reaches out where the other does not. */
export function mirrorSides(hull, { loa, y0 = -12, y1 = 45, cell = 0.25, slack = 0.6, keep = () => true } = {}) {
  const { P, N, T, C, S } = hull;
  const Z0 = -loa / 2 - 2;
  const nz = Math.ceil((loa + 4) / cell), ny = Math.ceil((y1 - y0) / cell);
  const reach = [new Float32Array(nz * ny), new Float32Array(nz * ny)];
  const at = (y, z) => {
    const i = Math.floor((z - Z0) / cell), j = Math.floor((y - y0) / cell);
    return i < 0 || i >= nz || j < 0 || j >= ny ? -1 : j * nz + i;
  };
  const nf = T.length / 3;
  const samples = (t, fn) => {
    const v = [T[t * 3] * 3, T[t * 3 + 1] * 3, T[t * 3 + 2] * 3];
    const len = Math.max(...[0, 1, 2].map((k) => Math.hypot(P[v[k] + 1] - P[v[(k + 1) % 3] + 1], P[v[k] + 2] - P[v[(k + 1) % 3] + 2])));
    const n = Math.max(1, Math.ceil(len / 0.2));
    for (let a = 0; a <= n; a++) for (let b = 0; b <= n - a; b++) {
      const u = a / n, w = b / n, r = 1 - u - w;
      if (fn(P[v[0]] * r + P[v[1]] * u + P[v[2]] * w, P[v[0] + 1] * r + P[v[1] + 1] * u + P[v[2] + 1] * w,
        P[v[0] + 2] * r + P[v[1] + 2] * u + P[v[2] + 2] * w)) return true;
    }
    return false;
  };
  for (let t = 0; t < nf; t++) {
    samples(t, (x, y, z) => {
      const c = at(y, z);
      if (c >= 0) { const sd = x < 0 ? 0 : 1; reach[sd][c] = Math.max(reach[sd][c], Math.abs(x)); }
      return false;
    });
  }
  const open = (c, sd) => reach[1 - sd][c] < reach[sd][c] - slack;
  let copied = 0;
  const holes = new Set();
  for (let t = 0; t < nf; t++) {
    const cx = (P[T[t * 3] * 3] + P[T[t * 3 + 1] * 3] + P[T[t * 3 + 2] * 3]) / 3;
    if (Math.abs(cx) < 0.5 || !keep(t)) continue;
    const sd = cx < 0 ? 0 : 1;
    let hit = -1;
    samples(t, (x, y, z) => {
      const c = at(y, z);
      if (c >= 0 && open(c, sd) && Math.abs(x) > reach[sd][c] - 1) { hit = c; return true; }
      return false;
    });
    if (hit < 0) continue;
    holes.add(hit);
    const base = P.length / 3;
    for (const q of [T[t * 3], T[t * 3 + 2], T[t * 3 + 1]]) {
      P.push(-P[q * 3], P[q * 3 + 1], P[q * 3 + 2]);
      N.push(-N[q * 3], N[q * 3 + 1], N[q * 3 + 2]);
    }
    T.push(base, base + 1, base + 2); C.push(C[t]); S.push(S[t]);
    copied++;
  }
  return { copied, cells: holes.size };
}

// Every side of her, and from above at a slant: what anybody looks at her from.
const R = Math.SQRT1_2;
const AXES = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [R, 0, R], [R, 0, -R],
  [R, -R, 0], [-R, -R, 0], [0, -R, R], [0, -R, -R],
];

/** Make a sheet of every face that is the first thing a ray from outside her meets, and faces away from it. */
export function sealFromOutside(hull, { pitch = 0.25, bin = 0.75, keep = () => true } = {}) {
  const { P, T, S } = hull;
  const nf = T.length / 3;
  const NF = new Float32Array(nf * 3);
  for (let t = 0; t < nf; t++) {
    const [x, y, z] = faceNormal(hull, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const l = Math.hypot(x, y, z) || 1;
    NF[t * 3] = x / l; NF[t * 3 + 1] = y / l; NF[t * 3 + 2] = z / l;
  }
  const nv = P.length / 3;
  const pu = new Float32Array(nv), pv = new Float32Array(nv), pd = new Float32Array(nv);
  let made = 0;
  for (const d of AXES) {
    // Two directions square to d.
    const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = [a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0]];
    const l1 = Math.hypot(...e1); e1 = e1.map((v) => v / l1);
    const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (let i = 0; i < nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      pu[i] = x * e1[0] + y * e1[1] + z * e1[2];
      pv[i] = x * e2[0] + y * e2[1] + z * e2[2];
      pd[i] = x * d[0] + y * d[1] + z * d[2];
      u0 = Math.min(u0, pu[i]); u1 = Math.max(u1, pu[i]); v0 = Math.min(v0, pv[i]); v1 = Math.max(v1, pv[i]);
    }
    const nu = Math.ceil((u1 - u0) / bin) + 1, nvv = Math.ceil((v1 - v0) / bin) + 1;
    const cells = new Map();
    for (let t = 0; t < nf; t++) {
      const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2];
      const ca = Math.floor((Math.min(pu[i0], pu[i1], pu[i2]) - u0) / bin), cb = Math.floor((Math.max(pu[i0], pu[i1], pu[i2]) - u0) / bin);
      const cc = Math.floor((Math.min(pv[i0], pv[i1], pv[i2]) - v0) / bin), cd = Math.floor((Math.max(pv[i0], pv[i1], pv[i2]) - v0) / bin);
      for (let j = cc; j <= cd; j++) for (let i = ca; i <= cb; i++) {
        const k = j * nu + i;
        let c = cells.get(k);
        if (!c) cells.set(k, (c = []));
        c.push(t);
      }
    }
    // Both ways along d: the nearest face from each end.
    for (let v = v0 + pitch / 2; v < v1; v += pitch) {
      for (let u = u0 + pitch / 2; u < u1; u += pitch) {
        const list = cells.get(Math.floor((v - v0) / bin) * nu + Math.floor((u - u0) / bin));
        if (!list) continue;
        let tMin = Infinity, fMin = -1, tMax = -Infinity, fMax = -1;
        for (const t of list) {
          const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2];
          const ax = pu[i0], ay = pv[i0], bx = pu[i1], by = pv[i1], cx = pu[i2], cy = pv[i2];
          const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
          if (Math.abs(den) < 1e-12) continue;
          const w0 = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / den;
          const w1 = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / den;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const h = w0 * pd[i0] + w1 * pd[i1] + w2 * pd[i2];
          if (h < tMin) { tMin = h; fMin = t; }
          if (h > tMax) { tMax = h; fMax = t; }
        }
        // Travelling +d, the nearest is the least; it faces away if n.d > 0.
        for (const [f, sgn] of [[fMin, 1], [fMax, -1]]) {
          if (f < 0 || S[f] || !keep(f)) continue;
          const nd = NF[f * 3] * d[0] + NF[f * 3 + 1] * d[1] + NF[f * 3 + 2] * d[2];
          if (nd * sgn > 0.05) { S[f] = 1; made++; }
        }
      }
    }
    void nvv;
  }
  return { made };
}
