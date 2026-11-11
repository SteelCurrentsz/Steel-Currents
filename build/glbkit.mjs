// What the build scripts that turn an owner's model into game meshes share:
// reading a .glb (meshopt-compressed or not) into one flat list of faces with
// the paint under each, welding and cutting a part of it down, and packing a
// part into the base64 string client/js/render/vehicles.js decodes.
//
// The same code build/prepare-vehicles.mjs carries inline, lifted out so
// build/prepare-infantry.mjs can use it.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   SCULPT_TOOLS=<that node_modules> node build/prepare-infantry.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');

const mul = (a, b) => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
function compose(n) {
  if (n.matrix) return Float64Array.from(n.matrix);
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

/** Every triangle of a model where it stands, with the colour under each of its corners. */
export async function flatten(file) {
  const buf = readFileSync(file);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const views = j.bufferViews.map((v) => {
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!e) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride,
      bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), e.mode, e.filter);
    return Buffer.from(out.buffer);
  });
  const KIND = {
    5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767],
    5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 1], 5126: ['getFloat32', 4, 1],
  };
  const acc = (i) => {
    const a = j.accessors[i];
    const v = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const [get, size, max] = KIND[a.componentType];
    const b = views[a.bufferView];
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    const stride = v.byteStride || (e && e.byteStride) || n * size;
    const dv = new DataView(b.buffer, b.byteOffset + (a.byteOffset || 0));
    const out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        const x = dv[get](k * stride + c * size, true);
        out[k * n + c] = a.normalized ? Math.max(-1, x / max) : x;
      }
    }
    return { out, n };
  };
  // The textures, decoded once each, to be read under every corner.
  const tex = new Map();
  const texture = async (ti) => {
    if (tex.has(ti)) return tex.get(ti);
    const img = j.images[j.textures[ti].source];
    const { data, info } = await sharp(Buffer.from(views[img.bufferView])).removeAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    const t = { data, w: info.width, h: info.height };
    tex.set(ti, t);
    return t;
  };
  const paint = [];
  for (const m of j.materials || []) {
    const pbr = m.pbrMetallicRoughness || {};
    const f = pbr.baseColorFactor || [1, 1, 1, 1];
    paint.push({ name: m.name, f, tex: pbr.baseColorTexture ? await texture(pbr.baseColorTexture.index) : null });
  }
  const colourAt = (mi, u, v) => {
    const p = paint[mi] || { f: [0.6, 0.6, 0.6, 1] };
    let r = 1, g = 1, b = 1;
    if (p.tex) {
      const t = p.tex;
      const x = Math.min(t.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * t.w)));
      const y = Math.min(t.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * t.h)));
      const o = (y * t.w + x) * 3;
      // sRGB in the file, linear for the factor, sRGB again out.
      const lin = (c) => (c / 255) ** 2.2;
      r = lin(t.data[o]); g = lin(t.data[o + 1]); b = lin(t.data[o + 2]);
    }
    const s = (c) => Math.min(1, Math.max(0, c)) ** (1 / 2.2);
    return [s(r * p.f[0]), s(g * p.f[1]), s(b * p.f[2])];
  };

  const P = [], C = [], T = [], TM = [], TC = [], TN = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const w = mul(parent, compose(n));
    if (n.mesh !== undefined) {
      const a = [w[0], w[1], w[2], w[4], w[5], w[6], w[8], w[9], w[10]];
      const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7]) + a[6] * (a[1] * a[5] - a[2] * a[4]);
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = acc(prim.attributes.POSITION);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const mi = prim.material ?? -1;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
          C.push(...colourAt(mi, uv ? uv.out[k * 2] : 0, uv ? uv.out[k * 2 + 1] : 0));
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          // The face's own colour: the paint under its middle and half way
          // out to each corner, so a big flat plate is the colour of the
          // plate rather than of whatever is under its four corners.
          if (uv) {
            const us = [0, 1, 2].map((k) => uv.out[idx[t + k] * 2]);
            const vs = [0, 1, 2].map((k) => uv.out[idx[t + k] * 2 + 1]);
            const cu = (us[0] + us[1] + us[2]) / 3, cv = (vs[0] + vs[1] + vs[2]) / 3;
            const acc3 = [0, 0, 0];
            const add = (u, v) => { const c = colourAt(mi, u, v); acc3[0] += c[0]; acc3[1] += c[1]; acc3[2] += c[2]; };
            add(cu, cv);
            for (let k = 0; k < 3; k++) add((cu + us[k]) / 2, (cv + vs[k]) / 2);
            TC.push(acc3[0] / 4, acc3[1] / 4, acc3[2] / 4);
          } else TC.push(...colourAt(mi, 0, 0));
          if (det < 0) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          TM.push(mi);
          TN.push(n.mesh);
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, C, T, TM, TC, TN, mats: (j.materials || []).map((m) => m.name) };
}

export function bounds(P, T) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of T) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], P[v * 3 + c]); hi[c] = Math.max(hi[c], P[v * 3 + c]);
  }
  return { lo, hi };
}

/**
 * One part of a model as a mesh the game can carry: its corners welded where
 * they meet (their colours averaged), then cut down to about `want` faces.
 */
export function part(model, tris, want, xf) {
  const key = new Map();
  const pos = [], col = [], cnt = [];
  const idx = [];
  for (const t of tris) {
    // Weighted by its area, so a sliver does not colour a whole plate.
    const pa = [0, 1, 2].map((k) => model.T[t * 3 + k]);
    const e1 = [0, 1, 2].map((c) => model.P[pa[1] * 3 + c] - model.P[pa[0] * 3 + c]);
    const e2 = [0, 1, 2].map((c) => model.P[pa[2] * 3 + c] - model.P[pa[0] * 3 + c]);
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) + 1e-9;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const p = xf(model.P[v * 3], model.P[v * 3 + 1], model.P[v * 3 + 2]);
      const kk = `${Math.round(p[0] * 400)},${Math.round(p[1] * 400)},${Math.round(p[2] * 400)}`;
      let i = key.get(kk);
      if (i === undefined) {
        i = pos.length / 3;
        key.set(kk, i);
        pos.push(...p);
        col.push(0, 0, 0);
        cnt.push(0);
      }
      col[i * 3] += model.TC[t * 3] * area; col[i * 3 + 1] += model.TC[t * 3 + 1] * area; col[i * 3 + 2] += model.TC[t * 3 + 2] * area;
      cnt[i] += area;
      idx.push(i);
    }
  }
  for (let i = 0; i < cnt.length; i++) for (let c = 0; c < 3; c++) col[i * 3 + c] /= cnt[i];
  // Faces collapsed to a line by the weld are dropped.
  const clean = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (a !== b && b !== c && a !== c) clean.push(a, b, c);
  }
  const P32 = new Float32Array(pos);
  let I = new Uint32Array(clean);
  if (I.length / 3 > want) {
    // Her small fittings are each a closed run of faces of their own, so
    // nothing is locked at its edges: a bolt head may go to nothing.
    let err = 0.004;
    for (let k = 0; k < 6 && I.length / 3 > want * 1.15; k++, err *= 2.2) {
      [I] = MeshoptSimplifier.simplify(I, P32, 3, want * 3, err, []);
    }
  }
  // Only the corners still used.
  const remap = new Map();
  const P2 = [], C2 = [], I2 = [];
  for (const v of I) {
    let n = remap.get(v);
    if (n === undefined) {
      n = P2.length / 3;
      remap.set(v, n);
      P2.push(P32[v * 3], P32[v * 3 + 1], P32[v * 3 + 2]);
      C2.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
    }
    I2.push(n);
  }
  return { P: P2, C: C2, I: I2 };
}

/** A part packed: corners at a millimetre-ish over its own box, bytes of colour, and its faces. */
export function pack(p) {
  const { lo, hi } = bounds(p.P, Array.from({ length: p.P.length / 3 }, (_, i) => i));
  const n = p.P.length / 3;
  const head = new Float32Array([n, p.I.length, ...lo, ...hi]);
  const q = new Uint16Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const s = hi[c] - lo[c] || 1;
    q[i * 3 + c] = Math.round(((p.P[i * 3 + c] - lo[c]) / s) * 65535);
  }
  const col = Uint8Array.from(p.C, (c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
  const big = n > 65535;
  const ix = big ? Uint32Array.from(p.I) : Uint16Array.from(p.I);
  const parts = [Buffer.from(head.buffer), Buffer.from(q.buffer), Buffer.from(col)];
  // Pad the colour bytes so the faces start on their own boundary.
  const pad = (4 - ((head.byteLength + q.byteLength + col.byteLength) % 4)) % 4;
  parts.push(Buffer.alloc(pad), Buffer.from(ix.buffer));
  console.log(`  ${n} points, ${p.I.length / 3} faces`);
  return Buffer.concat(parts).toString('base64');
}

