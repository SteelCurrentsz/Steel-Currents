// What build/bf109-source.mjs and build/ju87-source.mjs share: reading an
// owner's aeroplane sculpt into the game's frame, glazing a greenhouse that
// came as bars, a kit of solids for what the sculpt has not got, and packing
// the pieces the way the client's model modules decode them (see
// bf109Model.js and ju87Model.js).
//
// The B5N's, the Suisei's and the Zero's scripts each carry their own copy of
// most of this; these two are written against one.

import { readFileSync } from 'node:fs';

// ---- read ---------------------------------------------------------------
/**
 * A sculpt as it came, turned into the game's frame and put to `span`: the
 * sculpts come nose toward -x, span along z, up +y, and are written nose +z.
 * Measured off its span, whatever unit it was drawn in.
 */
export function readSculpt(file, span) {
  const b = readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.toString('ascii', off + 4, off + 8);
    if (type === 'JSON') json = JSON.parse(b.toString('utf8', off + 8, off + 8 + len));
    else bin = b.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC3: 3 }[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    const start = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
    return new T(bin.buffer.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const p = json.meshes[0].primitives[0];
  const pos = acc(p.attributes.POSITION), nor = acc(p.attributes.NORMAL), idx = acc(p.indices);
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < pos.length; i += 3) { lo = Math.min(lo, pos[i]); hi = Math.max(hi, pos[i]); }
  const S = span / (hi - lo);
  const nv = pos.length / 3;
  const P = new Float64Array(nv * 3);
  const N = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    P[i * 3] = pos[i * 3 + 2] * S;
    P[i * 3 + 1] = pos[i * 3 + 1] * S;
    P[i * 3 + 2] = -pos[i * 3] * S;
    N[i * 3] = nor[i * 3 + 2];
    N[i * 3 + 1] = nor[i * 3 + 1];
    N[i * 3 + 2] = -nor[i * 3];
  }
  return { P, N, T: idx, nv };
}

/**
 * Where a vertical line at (`x`, `z`) meets the sculpt's skin: every height it
 * crosses, lowest first. Read off the triangles, not the points, because a
 * wing panel is a few big triangles with nothing in the middle of them.
 */
export function heightsAt(P, T, keep, x, z) {
  const out = [];
  for (let t = 0; t < T.length; t += 3) {
    if (keep && !keep[t / 3]) continue;
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const x0 = P[a], z0 = P[a + 2], x1 = P[b], z1 = P[b + 2], x2 = P[c], z2 = P[c + 2];
    if (x < Math.min(x0, x1, x2) || x > Math.max(x0, x1, x2)) continue;
    if (z < Math.min(z0, z1, z2) || z > Math.max(z0, z1, z2)) continue;
    const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    if (Math.abs(d) < 1e-12) continue;
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d;
    const l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
    const l2 = 1 - l0 - l1;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    out.push(l0 * P[a + 1] + l1 * P[b + 1] + l2 * P[c + 1]);
  }
  return out.sort((p, q) => p - q);
}

// ---- glaze --------------------------------------------------------------
/**
 * A greenhouse that came as a frame of bars with nothing between them,
 * glazed: a skin laid just inside the envelope of the bars, read off the
 * sculpt about a line along her at height `cy`, from `z0` to `z1`, no further
 * out than `rMax`. Appended to `PP`/`NN`/`TT` as glass on the body.
 */
export function glaze({ P, nv, used, PP, NN, TT, tags, segs, tag, cy, z0, z1, rMax, inset = 0.93, nz = 34, na = 19, near = 0.12 }) {
  const env = [];
  for (let iz = 0; iz < nz; iz++) {
    const z = z0 + (z1 - z0) * iz / (nz - 1);
    const row = new Array(na).fill(0.2);
    env.push(row);
    for (let i = 0; i < nv; i++) {
      if (used && !used[i]) continue;
      if (Math.abs(P[i * 3 + 2] - z) > near) continue;
      const x = P[i * 3], y = P[i * 3 + 1] - cy;
      if (y < -0.02 || Math.abs(x) > rMax) continue;
      const r = Math.hypot(x, y);
      const ia = Math.round((Math.atan2(x, y) / Math.PI + 0.5) * (na - 1));
      if (ia < 0 || ia >= na) continue;
      for (let d = -1; d <= 1; d++) {
        const j = ia + d;
        if (j >= 0 && j < na) row[j] = Math.max(row[j], Math.min(rMax, r));
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const copy = env.map((r) => r.slice());
    for (let iz = 0; iz < nz; iz++) {
      for (let ia = 0; ia < na; ia++) {
        let s = 0, n = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let da = -1; da <= 1; da++) {
            const a = iz + dz, b = ia + da;
            if (a < 0 || a >= nz || b < 0 || b >= na) continue;
            const w = dz === 0 && da === 0 ? 2 : 1;
            s += copy[a][b] * w; n += w;
          }
        }
        env[iz][ia] = Math.max(copy[iz][ia] * 0.96, s / n);
      }
    }
  }
  const base = PP.length / 3;
  for (let iz = 0; iz < nz; iz++) {
    const z = z0 + (z1 - z0) * iz / (nz - 1);
    for (let ia = 0; ia < na; ia++) {
      const a = (ia / (na - 1) - 0.5) * Math.PI;
      const r = env[iz][ia] * inset;
      PP.push(Math.sin(a) * r, cy + Math.cos(a) * r, z);
      NN.push(Math.sin(a), Math.cos(a), 0);
    }
  }
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ia = 0; ia < na - 1; ia++) {
      const a = base + iz * na + ia, b = a + 1, c = a + na, d = c + 1;
      TT.push(a, c, b, b, c, d);
      tags.push(tag, tag);
      segs.push('body', 'body');
    }
  }
}

/** One vertex per (point, key), so a paint line or a break is a seam the decimator keeps. */
export function splitBy(PP, NN, TT, key) {
  const map = new Map();
  const P2 = [], N2 = [], T2 = [];
  for (let t = 0; t < TT.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const v = TT[t + k];
      const id = v + '|' + key(t / 3);
      let n = map.get(id);
      if (n === undefined) {
        n = P2.length / 3;
        map.set(id, n);
        P2.push(PP[v * 3], PP[v * 3 + 1], PP[v * 3 + 2]);
        N2.push(NN[v * 3], NN[v * 3 + 1], NN[v * 3 + 2]);
      }
      T2.push(n);
    }
  }
  return { P: P2, N: N2, T: T2 };
}

// ---- a kit of solids ----------------------------------------------------
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

function basis(axis) {
  const w = V.norm(axis);
  const t = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = V.norm(V.cross(t, w));
  return [u, V.cross(w, u), w];
}

/**
 * Solids written into `pieces` through `put(name, p, n, tag)`, which returns
 * the index of the point it wrote.
 */
export function kit(pieces, put) {
  /** A body of revolution: `prof` is [along, radius] pairs from `from` along `axis`. */
  function lathe(name, from, axis, prof, tag, seg = 12, tagAt = null) {
    const [u, v, w] = basis(axis);
    const pc = pieces[name];
    const ring = (i, t) => {
      const [s, r] = prof[i];
      const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
      const ds = b[0] - a[0], dr = b[1] - a[1];
      const l = Math.hypot(ds, dr) || 1;
      const row = [];
      for (let j = 0; j < seg; j++) {
        const th = (j / seg) * Math.PI * 2;
        const radial = V.add(V.mul(u, Math.cos(th)), V.mul(v, Math.sin(th)));
        const p = V.add(V.add(from, V.mul(w, s)), V.mul(radial, r));
        const n = V.norm(V.add(V.mul(radial, ds / l), V.mul(w, -dr / l)));
        row.push(put(name, p, n, t));
      }
      return row;
    };
    for (let i = 0; i < prof.length - 1; i++) {
      const t = tagAt ? tagAt((prof[i][0] + prof[i + 1][0]) / 2, (prof[i][1] + prof[i + 1][1]) / 2) : tag;
      const r0 = ring(i, t), r1 = ring(i + 1, t);
      for (let j = 0; j < seg; j++) {
        const j1 = (j + 1) % seg;
        pc.T.push(r0[j], r1[j], r1[j1], r0[j], r1[j1], r0[j1]);
      }
    }
  }
  /** A box, centred at `c`, along the axes `ax` (three unit vectors) with half sizes `h`. */
  function slab(name, c, ax, h, tag) {
    const pc = pieces[name];
    for (let f = 0; f < 3; f++) {
      for (const s of [-1, 1]) {
        const n = V.mul(ax[f], s);
        const a = ax[(f + 1) % 3], b = ax[(f + 2) % 3];
        const ha = h[(f + 1) % 3], hb = h[(f + 2) % 3];
        const ctr = V.add(c, V.mul(n, h[f]));
        const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
          put(name, V.add(V.add(ctr, V.mul(a, i * ha)), V.mul(b, j * hb)), n, tag));
        if (s > 0) pc.T.push(q[0], q[1], q[2], q[0], q[2], q[3]);
        else pc.T.push(q[0], q[2], q[1], q[0], q[3], q[2]);
      }
    }
  }
  /** A tube between two points. */
  function rod(name, a, b, r, tag, seg = 8) {
    const d = V.sub(b, a);
    lathe(name, a, d, [[0, r], [Math.hypot(d[0], d[1], d[2]), r]], tag, seg);
  }
  /**
   * A bomb about its own middle `c`, nose +z: an SC case with its box tail and
   * the band round it where it is filled, and the lugs on its back.
   */
  function bomb(name, c, L, R, t) {
    const tail = V.add(c, [0, 0, -L / 2]);
    lathe(name, tail, Z, [
      [0, R * 0.40], [L * 0.16, R * 0.62], [L * 0.32, R * 0.96], [L * 0.40, R], [L * 0.70, R],
      [L * 0.80, R * 0.92], [L * 0.90, R * 0.70], [L * 0.97, R * 0.34], [L, 0],
    ], t.bomb, 14, (s) => (s > L * 0.62 && s < L * 0.68 ? t.band : t.bomb));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const o = [Math.sin(a), Math.cos(a), 0];
      const sd = [Math.cos(a), -Math.sin(a), 0];
      // A fin, and the ring that boxes the four of them in.
      slab(name, V.add(tail, [o[0] * R * 0.85, o[1] * R * 0.85, L * 0.08]), [sd, o, Z],
        [0.01, R * 0.55, L * 0.09], t.bomb);
      slab(name, V.add(tail, [o[0] * R * 1.36, o[1] * R * 1.36, L * 0.07]), [o, sd, Z],
        [0.01, R * 0.70, L * 0.07], t.bomb);
    }
    for (const dz of [-0.18, 0.18]) slab(name, V.add(c, [0, R + 0.025, dz * L / 1.6]), [X, Y, Z], [0.03, 0.025, 0.035], t.metal);
  }
  return { lathe, slab, rod, bomb };
}

// ---- pack ---------------------------------------------------------------
/**
 * u32 vertex count, u32 triangle count, Int16 positions in millimetres, Int8
 * normals, a tag byte a vertex, a byte of padding to an even offset, Uint16
 * indices: what the model modules' `decode` reads.
 */
export function pack(pc) {
  const nv = pc.P.length / 3, nt = pc.T.length / 3;
  if (nv >= 65536) throw new Error('piece too big for Uint16 indices');
  const h = Buffer.alloc(8);
  h.writeUInt32LE(nv, 0);
  h.writeUInt32LE(nt, 4);
  const pos = Buffer.from(Int16Array.from(pc.P, (v) => Math.round(v * 1000)).buffer);
  const nrm = Buffer.from(Int8Array.from(pc.N, (v) => Math.max(-127, Math.min(127, Math.round(v * 127)))).buffer);
  const tag = Buffer.from(Uint8Array.from(pc.G));
  const head = 8 + pos.length + nrm.length + tag.length;
  return Buffer.concat([h, pos, nrm, tag, Buffer.alloc(head % 2),
    Buffer.from(Uint16Array.from(pc.T).buffer)]).toString('base64');
}

export const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
