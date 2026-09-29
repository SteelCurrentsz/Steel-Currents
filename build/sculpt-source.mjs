// The first step with an owner's sculpt, whatever ship it is: read the glb it
// came as, cut it level where a paint line has to be straight, carry a paint a
// point with it, decimate it down to what the fleet renders, and write it back
// out as the glb build/prepare-*-hull.mjs goes on from.
//
// Shared by build/rodney-source.mjs and build/baltimore-source.mjs. Only these
// scripts want the decimator (and the Rodney's the image decoder too):
//
//   npm i --no-save meshoptimizer@0.22 sharp
//
// resolved from the repository, or from wherever SCULPT_TOOLS says they were
// installed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const require = createRequire(process.env.SCULPT_TOOLS
  ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);

/** The decimator, ready to use. */
export async function simplifier() {
  const { MeshoptSimplifier } = require('meshoptimizer');
  await MeshoptSimplifier.ready;
  return MeshoptSimplifier;
}

/** The image decoder, for a sculpt that came with a texture. */
export function imageDecoder() {
  return require('sharp');
}

// ---- the glb ----------------------------------------------------------------
/**
 * A sculpt as it came: positions, normals, texture coordinates if it has
 * them, the triangles, and its texture's bytes if it has one.
 */
export function readSource(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8);
  const acc = (i) => {
    const a = j.accessors[i];
    const v = j.bufferViews[a.bufferView];
    const off = (v.byteOffset || 0) + (a.byteOffset || 0);
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const T = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    const stride = v.byteStride || n * T.BYTES_PER_ELEMENT;
    const out = new T(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset + off);
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        const p = k * stride + c * T.BYTES_PER_ELEMENT;
        out[k * n + c] = T === Float32Array ? dv.getFloat32(p, true)
          : T === Uint32Array ? dv.getUint32(p, true) : dv.getUint16(p, true);
      }
    }
    return out;
  };
  const prim = j.meshes[0].primitives[0];
  const out = {
    P: Array.from(acc(prim.attributes.POSITION)),
    N: Array.from(acc(prim.attributes.NORMAL)),
    UV: prim.attributes.TEXCOORD_0 !== undefined ? Array.from(acc(prim.attributes.TEXCOORD_0)) : null,
    T: Array.from(acc(prim.indices)),
    jpg: null,
  };
  const mat = j.materials && j.materials[prim.material];
  const tex = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
  if (tex) {
    const v = j.bufferViews[j.images[j.textures[tex.index].source].bufferView];
    out.jpg = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  }
  return out;
}

/**
 * A mesh as a glb: positions, normals and, if given, a paint per point as the
 * attribute _PAINT. `generator` is the script that made it.
 */
export function writeGlb(file, { P, N, T, paint = null }, generator) {
  const nv = P.length / 3;
  const pos = Buffer.from(Float32Array.from(P).buffer);
  const nrm = Buffer.from(Float32Array.from(N).buffer);
  const pnt = paint ? Buffer.from(Float32Array.from(paint).buffer) : Buffer.alloc(0);
  const ib = Buffer.from(Uint32Array.from(T).buffer);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
  }
  const views = [];
  let off = 0;
  for (const [buf, target] of [[pos, 34962], [nrm, 34962], [pnt, 34962], [ib, 34963]]) {
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target });
    off += buf.length;
  }
  const attributes = { POSITION: 0, NORMAL: 1 };
  const accessors = [
    { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx },
    { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: paint ? nv : 0, type: 'SCALAR' },
    { bufferView: 3, componentType: 5125, count: T.length, type: 'SCALAR' },
  ];
  if (paint) attributes._PAINT = 2;
  const j = {
    asset: { version: '2.0', generator }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes, indices: 3 }] }],
    buffers: [{ byteLength: off }], bufferViews: views, accessors,
  };
  let js = Buffer.from(JSON.stringify(j));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat([pos, nrm, pnt, ib]);
  const pad = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.write('glTF', 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + pad.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(pad.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(file, Buffer.concat([head, c1, js, c2, pad]));
  console.log('wrote', path.relative(ROOT, file), T.length / 3, 'triangles', nv, 'points',
    `${(Buffer.concat([head, c1, js, c2, pad]).length / 1024).toFixed(0)} KB`);
}

// ---- cutting her level ------------------------------------------------------
/**
 * Split every triangle that crosses the level y = c, so that level is an edge
 * of her everywhere. A point made on an edge is shared by everything on that
 * edge, so nothing cracks open; where the texture's seams run, the two sides
 * each get their own, with their own place in the texture.
 */
export function splitAt(m, c) {
  const { P, N, UV } = m;
  const T0 = m.T;
  const made = new Map();
  const EPS = 1e-7;
  const side = (v) => { const d = P[v * 3 + 1] - c; return d > EPS ? 1 : d < -EPS ? -1 : 0; };
  const cross = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let w = made.get(k);
    if (w !== undefined) return w;
    const s = (c - P[a * 3 + 1]) / (P[b * 3 + 1] - P[a * 3 + 1]);
    w = P.length / 3;
    P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * s, c, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * s);
    let nx = N[a * 3] + (N[b * 3] - N[a * 3]) * s, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * s;
    let nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * s;
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
    if (UV) UV.push(UV[a * 2] + (UV[b * 2] - UV[a * 2]) * s, UV[a * 2 + 1] + (UV[b * 2 + 1] - UV[a * 2 + 1]) * s);
    made.set(k, w);
    return w;
  };
  const T = [];
  let split = 0;
  for (let t = 0; t < T0.length; t += 3) {
    const v = [T0[t], T0[t + 1], T0[t + 2]];
    const s = v.map(side);
    if (!(s.includes(1) && s.includes(-1))) { T.push(...v); continue; }
    split++;
    const up = [], down = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3];
      if (sa >= 0) up.push(a);
      if (sa <= 0) down.push(a);
      if (sa * sb < 0) { const w = cross(a, b); up.push(w); down.push(w); }
    }
    for (const poly of [up, down]) for (let k = 1; k + 1 < poly.length; k++) T.push(poly[0], poly[k], poly[k + 1]);
  }
  m.T = T;
  return split;
}

// ---- her paint, as seams -------------------------------------------------------
/**
 * One point per paint: wherever two paints meet, each side of the edge gets
 * its own copy of the points on it, so the decimator sees the edge as a seam
 * and keeps it.
 */
export function splitByPaint(m, paint) {
  const P = [], N = [], T = [], per = [];
  const map = new Map();
  for (let t = 0; t < m.T.length / 3; t++) {
    for (let j = 0; j < 3; j++) {
      const v = m.T[t * 3 + j];
      const k = v * 8 + paint[t];
      let w = map.get(k);
      if (w === undefined) {
        w = P.length / 3;
        map.set(k, w);
        P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]);
        N.push(m.N[v * 3], m.N[v * 3 + 1], m.N[v * 3 + 2]);
        per.push(paint[t]);
      }
      T.push(w);
    }
  }
  return { P, N, T, paint: per };
}

/**
 * Merge the points the sculpt split only for its texture: same place, same
 * paint. What is left split is split because two paints meet there.
 */
export function weldByPaint(m) {
  const map = new Map();
  const remap = new Int32Array(m.P.length / 3);
  const P = [], N = [], paint = [];
  for (let i = 0; i < m.P.length / 3; i++) {
    const k = `${Math.round(m.P[i * 3] * 1e6)},${Math.round(m.P[i * 3 + 1] * 1e6)},${Math.round(m.P[i * 3 + 2] * 1e6)},${m.paint[i]}`;
    let w = map.get(k);
    if (w === undefined) {
      w = P.length / 3;
      map.set(k, w);
      P.push(m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]);
      N.push(m.N[i * 3], m.N[i * 3 + 1], m.N[i * 3 + 2]);
      paint.push(m.paint[i]);
    }
    remap[i] = w;
  }
  return { P, N, paint, T: m.T.map((v) => remap[v]) };
}

// ---- decimation ------------------------------------------------------------------
/**
 * Decimate to `ratio` of her triangles, or `error`, whichever comes first.
 *
 * With the normals weighed in as well as the positions: decimating on
 * positions alone is happy to fold a spar, a yard or a wireless aerial -- a
 * tube a few tens of centimetres across -- flat into a blade, because a blade
 * is within a few centimetres of where the tube was. Its normals are not
 * within anything of where the tube's were, and weighing them keeps the tube
 * round.
 */
export function decimate(simplify, m, ratio, error, normalWeight = 0) {
  const idx = Uint32Array.from(m.T);
  const pos = Float32Array.from(m.P);
  const target = Math.floor((idx.length / 3) * ratio) * 3;
  let out, err;
  if (normalWeight > 0) {
    simplify.useExperimentalFeatures = true;
    [out, err] = simplify.simplifyWithAttributes(idx, pos, 3, Float32Array.from(m.N), 3,
      [normalWeight, normalWeight, normalWeight], null, target, error, []);
  } else {
    [out, err] = simplify.simplify(idx, pos, 3, target, error, []);
  }
  // Only the points still used.
  const used = new Int32Array(m.P.length / 3).fill(-1);
  const P = [], N = [], paint = [], T = [];
  for (const v of out) {
    if (used[v] < 0) {
      used[v] = P.length / 3;
      P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]);
      N.push(m.N[v * 3], m.N[v * 3 + 1], m.N[v * 3 + 2]);
      if (m.paint) paint.push(m.paint[v]);
    }
    T.push(used[v]);
  }
  console.log(`decimated ${idx.length / 3} to ${T.length / 3} triangles, error ${err.toExponential(2)}`);
  return { P, N, T, paint: m.paint ? paint : null };
}
