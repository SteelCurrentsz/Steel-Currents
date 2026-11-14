// Turn the owner's model of the aircraft carrier Gerald R. Ford into what
// client/js/render/ford.js ships: her hull, her island, her flight deck with
// its markings, her sponsons and every fitting on her as one painted mesh; the
// outline of her flight deck and her island; her three lifts; and every
// mounting of hers that trains -- her three Phalanx, her two Mk 29 Sea Sparrow
// launchers and her two Mk 49 RAM launchers -- cut free of her.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-ford-hull.mjs [model.glb]
//
// Reads assets/models/gerald_r_ford_aircraft_carrier-maximum-compressed.glb as
// the owner uploaded it: "Gerald R Ford aircraft Carrier" by waelXcm
// (https://skfb.ly/oEAwB), under Creative Commons Attribution 4.0 -- credited
// on the game's Credits screen. A Sketchfab export of the whole ship, painted
// by baked textures: every face here takes the colour of the texture under
// it, and her flight deck is cut fine first so that its markings come through.
// The model stands her bow along +Z, her island to starboard along -X, and
// her keel at its lowest point.
//
// Her mountings and her lifts are the model's own pieces, by name: each
// Phalanx is the seven pieces round one `phalanx_back2`, each Mk 29 its two
// halves and trunnion, each Mk 49 its six pieces, and each lift its plate and
// its slab. The Phalanx on her starboard bow sponson, by her island, was drawn
// facing in over her deck: it is turned to face out, as the other two do.
//
// Writes client/js/render/fordHull.data.js, which is committed, so a fresh
// clone runs without this script.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifier, decimate as decimateWith } from './sculpt-source.mjs';
import { heightmap, heightBytes, pack, packPieceCompact, stations, faceNormal } from './sculpt.mjs';
import { measureLines } from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const { MeshoptDecoder } = require('meshoptimizer');
const MeshoptSimplifier = await simplifier();
// Prune (taking off loose bits too small to keep) is one of its experimental flags.
MeshoptSimplifier.useExperimentalFeatures = true;
const OUT_DATA = path.join(ROOT, 'client/js/render/fordHull.data.js');

// ---- her model ---------------------------------------------------------------------
const SRC = process.argv[2] || path.join(ROOT, 'assets/models/gerald_r_ford_aircraft_carrier-maximum-compressed.glb');
const glb = readFileSync(SRC);

/** 4x4 column-major matrices, as glTF has them. */
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

/**
 * Every triangle of the model, where it is: positions, normals and texture
 * coordinates a point; the material, the top-level group and the piece (the
 * node it hangs from) a triangle.
 */
/** Every node's own frame in the model, as the walk finds it. */
const WORLD = [];
async function flatten(buf) {
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  await MeshoptDecoder.ready;
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
  const P = [], N = [], UV = [], T = [], G = [], L = [], M = [];
  const walk = (ni, parent, depth, group) => {
    const n = j.nodes[ni];
    const w = mul(parent, compose(n));
    WORLD[ni] = w;
    // Her pieces are the children of the model's one root piece, ship_deck:
    // each one a node of its own, named for what it is.
    const g = depth === 4 ? ni : group;
    if (n.mesh !== undefined) {
      // The normal matrix: the inverse transpose of the upper 3x3.
      const a = [w[0], w[1], w[2], w[4], w[5], w[6], w[8], w[9], w[10]];
      const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7]) + a[6] * (a[1] * a[5] - a[2] * a[4]);
      const flip = det < 0;
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = acc(prim.attributes.POSITION);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
          N.push(0, 1, 0);
          if (uv) UV.push(uv.out[k * 2], uv.out[k * 2 + 1]); else UV.push(0, 0);
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          if (flip) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          G.push(g); L.push(ni); M.push(prim.material ?? -1);
        }
      }
    }
    for (const c of n.children || []) walk(c, w, depth + 1, g);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I, 0, -1);
  return { P, N, UV, T, G, L, M, j, views };
}

const model = await flatten(glb);
const { j } = model;
console.log('model:', model.T.length / 3, 'triangles,', model.P.length / 3, 'points,', j.nodes.length, 'nodes');

// ---- her frame -----------------------------------------------------------------------
// The model is drawn 12.1 of its units from her stern to her bow, and she is
// 337 m over all: every measure of it is brought to that by one factor, and
// she is floated at her draught of 12 m, her keel -- the lowest of her -- that
// far under the water. Her centreline is the middle of her hull below her
// flight deck. Already in the fleet's frame: her bow +Z, her port side +X.
export const REAL_LOA = 337;
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let t = 0; t < model.T.length; t++) {
  const i = model.T[t] * 3;
  for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.P[i + c]); hi[c] = Math.max(hi[c], model.P[i + c]); }
}
export const SCALE = REAL_LOA / (hi[2] - lo[2]);
export const LOA = REAL_LOA;
const DRAUGHT = 12;
const WATERLINE = 0.0;
// Her centreline: the middle of her hull at her waterline, across.
let XC = 0;
{
  const wl = lo[1] + DRAUGHT / SCALE;
  let x0 = Infinity, x1 = -Infinity;
  for (let t = 0; t < model.T.length; t++) {
    const i = model.T[t] * 3;
    if (Math.abs(model.P[i + 1] - wl) < 0.02) { x0 = Math.min(x0, model.P[i]); x1 = Math.max(x1, model.P[i]); }
  }
  XC = Number.isFinite(x0) ? (x0 + x1) / 2 : (lo[0] + hi[0]) / 2;
}
const ZC = (lo[2] + hi[2]) / 2;
const SINK = lo[1] * SCALE + DRAUGHT;
/** A point of the model's, in her own frame. */
const toFrame = (x, y, z) => [(x - XC) * SCALE, y * SCALE - SINK, (z - ZC) * SCALE];
for (let i = 0; i < model.P.length; i += 3) {
  const [x, y, z] = toFrame(model.P[i], model.P[i + 1], model.P[i + 2]);
  model.P[i] = x; model.P[i + 1] = y; model.P[i + 2] = z;
}
console.log(`frame: x${SCALE.toFixed(5)}, ${LOA} m long, ${((hi[0] - lo[0]) * SCALE).toFixed(2)} m across her flight deck, keel ${(lo[1] * SCALE - SINK).toFixed(2)}, truck ${(hi[1] * SCALE - SINK).toFixed(2)}, centreline ${XC.toFixed(3)}`);

/** Each piece of hers by name, as the model's own pieces: the node under her root. */
const nodeName = (n) => (j.nodes[n] && j.nodes[n].name) || '';

// ---- her flight deck, cut fine --------------------------------------------------------
// Her flight deck is a handful of great faces with its markings painted on in
// the texture. A face here is one colour, so each face of it that looks at the
// sky is cut into triangles no more than DECK_CUT across before it is painted,
// and the decimator joins up again whatever of them are one paint.
const DECK_CUT = +(process.env.DECK_CUT || 1.2);
{
  const P = model.P, UV = model.UV, T = model.T;
  const T2 = [], G2 = [], L2 = [], M2 = [];
  let cut = 0;
  const mid = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let m = mid.get(key);
    if (m !== undefined) return m;
    m = P.length / 3;
    P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
    model.N.push(0, 1, 0);
    UV.push((UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2);
    mid.set(key, m);
    return m;
  };
  const len = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  const split = (a, b, c, g, l, m) => {
    const ab = len(a, b), bc = len(b, c), ca = len(c, a);
    const most = Math.max(ab, bc, ca);
    if (most <= DECK_CUT) { T2.push(a, b, c); G2.push(g); L2.push(l); M2.push(m); return; }
    cut++;
    // Halved across its longest side, which keeps the pieces from going to slivers.
    if (most === ab) { const d = midpoint(a, b); split(a, d, c, g, l, m); split(d, b, c, g, l, m); }
    else if (most === bc) { const d = midpoint(b, c); split(a, b, d, g, l, m); split(a, d, c, g, l, m); }
    else { const d = midpoint(c, a); split(a, b, d, g, l, m); split(d, b, c, g, l, m); }
  };
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const deck = /^ship_deck_(ship|deck side walks)_0$/.test(nodeName(model.L[t]));
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) > 0.9;
    if (deck && up) split(a, b, c, model.G[t], model.L[t], model.M[t]);
    else { T2.push(a, b, c); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]); }
  }
  model.T = T2; model.G = G2; model.L = L2; model.M = M2;
  console.log(`flight deck: ${cut} cuts, ${model.T.length / 3} triangles in all`);
}

// ---- her doubled plates ----------------------------------------------------------------
// The model draws a good deal of her twice: a plate in its paint, and under
// it, in the same plane but cut into different triangles, the same plate in
// black. Drawn together the two fight for every pixel and her sides came out
// speckled black and grey, her bottom black and red. Wherever a black face
// lies wholly on a face of another paint, the black one goes.
{
  const BLACK = new Set(j.materials.map((m, i) => [m, i]).filter(([m]) => {
    const f = (m.pbrMetallicRoughness || {}).baseColorFactor || [1, 1, 1, 1];
    return f[0] + f[1] + f[2] < 0.05;
  }).map(([, i]) => i));
  const P = model.P, T = model.T;
  const CELL = 0.6;
  const grid = new Map();
  const tri = (t) => [T[t * 3] * 3, T[t * 3 + 1] * 3, T[t * 3 + 2] * 3];
  const nTri0 = T.length / 3;
  const planes = new Float64Array(nTri0 * 4);
  for (let t = 0; t < nTri0; t++) {
    const [a, b, c] = tri(t);
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    planes.set([nx, ny, nz, nx * P[a] + ny * P[a + 1] + nz * P[a + 2]], t * 4);
    if (BLACK.has(model.M[t])) continue;
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(P[a + k], P[b + k], P[c + k]) / CELL));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(P[a + k], P[b + k], P[c + k]) / CELL));
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 20000) continue;
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = `${x},${y},${z}`;
      let g = grid.get(k);
      if (!g) grid.set(k, g = []);
      g.push(t);
    }
  }
  /** Whether the point lies on face u: in its plane, and inside it. */
  const onFace = (u, x, y, z) => {
    const nx = planes[u * 4], ny = planes[u * 4 + 1], nz = planes[u * 4 + 2], d = planes[u * 4 + 3];
    if (Math.abs(nx * x + ny * y + nz * z - d) > 0.03) return false;
    const [a, b, c] = tri(u);
    const side = (p, q) => {
      const ex = P[q] - P[p], ey = P[q + 1] - P[p + 1], ez = P[q + 2] - P[p + 2];
      const wx = x - P[p], wy = y - P[p + 1], wz = z - P[p + 2];
      return nx * (ey * wz - ez * wy) + ny * (ez * wx - ex * wz) + nz * (ex * wy - ey * wx);
    };
    const tol = -1e-4;
    return side(a, b) >= tol && side(b, c) >= tol && side(c, a) >= tol;
  };
  const SAMPLES = [[1 / 3, 1 / 3], [0.7, 0.15], [0.15, 0.7], [0.15, 0.15], [0.45, 0.45], [0.1, 0.45], [0.45, 0.1]];
  const drop = new Uint8Array(nTri0);
  let gone = 0;
  for (let t = 0; t < nTri0; t++) {
    if (!BLACK.has(model.M[t])) continue;
    const [a, b, c] = tri(t);
    let on = 0;
    for (const [u, v] of SAMPLES) {
      const w = 1 - u - v;
      const x = P[a] * w + P[b] * u + P[c] * v, y = P[a + 1] * w + P[b + 1] * u + P[c + 1] * v, z = P[a + 2] * w + P[b + 2] * u + P[c + 2] * v;
      const list = grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`) || [];
      // In the same plane either way round: the black is often the plate's back.
      if (list.some((q) => Math.abs(planes[q * 4] * planes[t * 4] + planes[q * 4 + 1] * planes[t * 4 + 1] + planes[q * 4 + 2] * planes[t * 4 + 2]) > 0.995 && onFace(q, x, y, z))) on++;
    }
    if (on >= 6) { drop[t] = 1; gone++; }
  }
  const T2 = [], G2 = [], L2 = [], M2 = [];
  for (let t = 0; t < nTri0; t++) {
    if (drop[t]) continue;
    T2.push(T[t * 3], T[t * 3 + 1], T[t * 3 + 2]); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
  }
  model.T = T2; model.G = G2; model.L = L2; model.M = M2;
  console.log(`doubled plates: ${gone} black faces lying on faces of another paint taken off`);
}

// ---- her paint ------------------------------------------------------------------------
// Each face the colour of her texture under its middle and half way out to
// each corner, times its material's own colour.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const require2 = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require2('sharp');
const texCache = new Map();
async function texture(ti) {
  if (texCache.has(ti)) return texCache.get(ti);
  const img = j.images[j.textures[ti].source];
  const { data, info } = await sharp(Buffer.from(model.views[img.bufferView])).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = { data, w: info.width, h: info.height };
  texCache.set(ti, t);
  return t;
}
const PAINT = [];
for (const m of j.materials) {
  const pbr = m.pbrMetallicRoughness || {};
  PAINT.push({ f: pbr.baseColorFactor || [1, 1, 1, 1], tex: pbr.baseColorTexture ? await texture(pbr.baseColorTexture.index) : null });
}
const nTri = model.T.length / 3;
const rgb = new Float32Array(nTri * 3);
for (let t = 0; t < nTri; t++) {
  const p = PAINT[model.M[t]] || { f: [0.5, 0.5, 0.5, 1], tex: null };
  const c = [0, 0, 0];
  if (p.tex) {
    const v = [0, 1, 2].map((k) => model.T[t * 3 + k]);
    const cu = (model.UV[v[0] * 2] + model.UV[v[1] * 2] + model.UV[v[2] * 2]) / 3;
    const cv = (model.UV[v[0] * 2 + 1] + model.UV[v[1] * 2 + 1] + model.UV[v[2] * 2 + 1]) / 3;
    const at = [[cu, cv], ...v.map((q) => [(cu + model.UV[q * 2]) / 2, (cv + model.UV[q * 2 + 1]) / 2])];
    for (const [u, w] of at) {
      const x = Math.min(p.tex.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * p.tex.w)));
      const y = Math.min(p.tex.h - 1, Math.max(0, Math.floor((((w % 1) + 1) % 1) * p.tex.h)));
      const o = (y * p.tex.w + x) * 3;
      for (let k = 0; k < 3; k++) c[k] += toLin(p.tex.data[o + k] / 255) / at.length;
    }
  } else c[0] = c[1] = c[2] = 1;
  for (let k = 0; k < 3; k++) rgb[t * 3 + k] = p.tex ? c[k] * p.f[k] : p.f[k];
}
// Her flight deck's plain non-skid, evened out: the texture under it is
// grime and weather a few pixels across, and painted a small face at a time it
// came out a patchwork. Every face of her flight deck that is deck grey --
// neither a marking nor any other paint -- is the one deck grey.
{
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const plain = [];
  let sum = [0, 0, 0], n = 0;
  for (let t = 0; t < nTri; t++) {
    if (nodeName(model.G[t]) !== 'ship_deck_ship_0' && nodeName(model.L[t]) !== 'ship_deck_ship_0') continue;
    const c = [0, 1, 2].map((k) => toSrgb(rgb[t * 3 + k]));
    const sat = Math.max(...c) - Math.min(...c);
    const l = lum(...c);
    if (sat < 0.09 && l < 0.5) { plain.push(t); for (let k = 0; k < 3; k++) sum[k] += c[k]; n++; }
  }
  const grey = sum.map((v) => toLin(v / Math.max(1, n)));
  for (const t of plain) for (let k = 0; k < 3; k++) rgb[t * 3 + k] = grey[k];
  console.log(`flight deck: ${n} faces of plain deck grey, ${grey.map((v) => toSrgb(v).toFixed(2)).join(' ')}`);
}
if (process.env.SIDES) {
  // What her sides are painted, by height: a look at the texture under them.
  const bands = new Map();
  for (let t = 0; t < nTri; t++) {
    const v = [0, 1, 2].map((k) => model.T[t * 3 + k] * 3);
    const P = model.P;
    const ux = P[v[1]] - P[v[0]], uy = P[v[1] + 1] - P[v[0] + 1], uz = P[v[1] + 2] - P[v[0] + 2];
    const wx = P[v[2]] - P[v[0]], wy = P[v[2] + 1] - P[v[0] + 1], wz = P[v[2] + 2] - P[v[0] + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    if (Math.abs(ny / l) > 0.3) continue;
    const cy = (P[v[0] + 1] + P[v[1] + 1] + P[v[2] + 1]) / 3;
    const cx = (P[v[0]] + P[v[1]] + P[v[2]]) / 3;
    if (Math.abs(cx) < 15) continue;
    const k = `${Math.floor(cy / 3) * 3} ${nodeName(model.G[t])} m${model.M[t]}`;
    const a = Math.hypot(nx, ny, nz) / 2;
    const b = bands.get(k) || [0, 0, 0, 0];
    for (let c = 0; c < 3; c++) b[c] += toSrgb(rgb[t * 3 + c]) * a;
    b[3] += a;
    bands.set(k, b);
  }
  for (const [k, b] of [...bands].sort((x, y) => y[1][3] - x[1][3]).slice(0, 30)) console.log(k.padEnd(40), b.slice(0, 3).map((c) => (c / b[3]).toFixed(2)).join(' '), Math.round(b[3]), 'm2');
  process.exit(0);
}
/**
 * Her colours gathered into a palette of `K`, by k-means in sRGB weighted by
 * area, so that a run of faces that are one paint to the eye is one paint to
 * the decimator, and keeps its edge where another paint meets it.
 */
function triArea(P, T, t) {
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
  const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}
function palette(K) {
  const s = new Float32Array(nTri * 3);
  const wt = new Float32Array(nTri);
  for (let t = 0; t < nTri; t++) {
    for (let k = 0; k < 3; k++) s[t * 3 + k] = toSrgb(rgb[t * 3 + k]);
    wt[t] = Math.sqrt(triArea(model.P, model.T, t)) + 0.01;
  }
  // Seeded off the colours themselves, spread through them by luminance.
  const order = [...Array(nTri).keys()].sort((a, b) => (s[a * 3] + s[a * 3 + 1] + s[a * 3 + 2]) - (s[b * 3] + s[b * 3 + 1] + s[b * 3 + 2]));
  let cent = [...Array(K)].map((_, k) => { const t = order[Math.floor(((k + 0.5) / K) * nTri)]; return [s[t * 3], s[t * 3 + 1], s[t * 3 + 2]]; });
  const lab = new Uint8Array(nTri);
  for (let it = 0; it < 14; it++) {
    const sum = [...Array(K)].map(() => [0, 0, 0, 0]);
    for (let t = 0; t < nTri; t++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < K; k++) {
        const d = (s[t * 3] - cent[k][0]) ** 2 + (s[t * 3 + 1] - cent[k][1]) ** 2 + (s[t * 3 + 2] - cent[k][2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      lab[t] = best;
      const e = sum[best];
      e[0] += s[t * 3] * wt[t]; e[1] += s[t * 3 + 1] * wt[t]; e[2] += s[t * 3 + 2] * wt[t]; e[3] += wt[t];
    }
    cent = cent.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
  }
  return { lab, cent };
}
const PAL = palette(+(process.env.PALETTE || 40));
// Brightened a little: the model was painted to be lit by a renderer's
// floodlight, and under the fleet's sun its grey reads as slate.
const LIFT = +(process.env.LIFT || 1.1);
const PALETTE = PAL.cent.map((c) => c.map((v) => Math.round(toLin(Math.min(1, v * LIFT)) * 255)));

// ---- what is hers and what trains ------------------------------------------------------
/** The runs of faces of the pieces `set` that hang together, each with its box. */
function partsOf(set) {
  const P = model.P, T = model.T;
  const id = new Map(), up = [];
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const node = (v) => {
    const k = `${Math.round(P[v * 3] * 1000)},${Math.round(P[v * 3 + 1] * 1000)},${Math.round(P[v * 3 + 2] * 1000)}`;
    let i = id.get(k);
    if (i === undefined) { i = up.length; id.set(k, i); up.push(i); }
    return i;
  };
  const tris = [], first = [];
  for (let t = 0; t < nTri; t++) {
    if (!set.has(model.L[t])) continue;
    const a = node(T[t * 3]), b = node(T[t * 3 + 1]), c = node(T[t * 3 + 2]);
    up[find(b)] = find(a); up[find(c)] = find(a);
    tris.push(t); first.push(a);
  }
  const parts = new Map();
  tris.forEach((t, i) => {
    const r = find(first[i]);
    if (!parts.has(r)) parts.set(r, { tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    const p = parts.get(r);
    p.tris.push(t);
    for (let k = 0; k < 3; k++) {
      const v = T[t * 3 + k];
      for (let c = 0; c < 3; c++) { p.lo[c] = Math.min(p.lo[c], P[v * 3 + c]); p.hi[c] = Math.max(p.hi[c], P[v * 3 + c]); }
    }
  });
  return [...parts.values()];
}
const near = (A, B, gap) => [0, 1, 2].every((c) => A.lo[c] - gap <= B.hi[c] && B.lo[c] - gap <= A.hi[c]);
/** How far a part lies from a cluster, its height counting ten times over. */
function boxGap(A, B) {
  const d = [0, 1, 2].map((c) => Math.max(0, A.lo[c] - B.hi[c], B.lo[c] - A.hi[c]));
  return Math.hypot(d[0], d[1] * 10, d[2]);
}
/** Whether a part lies wholly inside a box given in the model's own measure. */
function inBox(p, [x0, x1, y0, y1, z0, z1]) {
  const a = toFrame(x0, y0, z0), b = toFrame(x1, y1, z1);
  const lo2 = a.map((v, c) => Math.min(v, b[c])), hi2 = a.map((v, c) => Math.max(v, b[c]));
  return [0, 1, 2].every((c) => p.lo[c] >= lo2[c] - 1e-3 && p.hi[c] <= hi2[c] + 1e-3);
}
// Every piece of hers: the model draws her whole, a piece to a material.
const ALL = new Set(model.L);
const PARTS = partsOf(ALL);
/**
 * Her mountings, each as the model's own pieces: every face of a piece named
 * here is that mounting's. Each Phalanx is seven pieces round its back, each
 * Mk 29 its two halves and its trunnion, each Mk 49 its six.
 */
const MOUNT_NODES = {
  // Her three Phalanx: on her starboard bow sponson, on her fantail, and on
  // her port side amidships.
  ciws: [
    ['pCube9.002', 'pCylinder31.002', 'pCylinder32.002', 'pCylinder34', 'pCylinder36', 'phalanx_back2', 'MASH2_ReproMesh4.002'],
    ['pCube9.004', 'pCylinder31.004', 'pCylinder32.004', 'pCylinder34.002', 'pCylinder36.002', 'phalanx_back2.002', 'MASH2_ReproMesh4.003'],
    ['pCube9.005', 'pCylinder31.005', 'pCylinder32.005', 'pCylinder34.003', 'pCylinder36.003', 'phalanx_back2.001', 'MASH2_ReproMesh4.004'],
  ].map((names) => (n) => names.includes(n)),
  // Her two Mk 29 Sea Sparrow launchers: on her starboard bow and her port quarter.
  sparrow: [['mk29_front', 'mk29_front.001', 'pCylinder113.001'], ['mk29_front.002', 'mk29_front.003', 'pCylinder113.002']]
    .map((names) => (n) => names.includes(n)),
  // Her two Mk 49 RAM launchers: on her port bow and her starboard quarter.
  ram: [['mk49_front', 'pCube9.001', 'pCube209.001', 'pCylinder31.001', 'pCylinder32.001', 'MASH2_ReproMesh4.001'],
    ['mk49_front.001', 'pCube9.003', 'pCube209.002', 'pCylinder31.003', 'pCylinder32.003', 'MASH2_ReproMesh4.005']]
    .map((names) => (n) => names.includes(n)),
};
/** Each Phalanx's barrels, which say which way it faces. */
const BARRELS = { ciws: ['pCylinder34', 'pCylinder34.002', 'pCylinder34.003'] };
const KINDS = {};
for (const [kind, list] of Object.entries(MOUNT_NODES)) {
  KINDS[kind] = list.map((is) => {
    const tris = new Set();
    for (let t = 0; t < nTri; t++) if (is(nodeName(model.G[t]))) tris.add(t);
    if (tris.size < 200) throw new Error(`${kind}: only ${tris.size} faces`);
    return tris;
  });
  console.log(`${kind}: ${KINDS[kind].length} mountings, ${KINDS[kind].map((s) => s.size).join(' ')} faces`);
}
const kindOf = new Map();
for (const [k, list] of Object.entries(KINDS)) for (const set of list) for (const t of set) kindOf.set(t, k);

// ---- her lifts ------------------------------------------------------------------------
/**
 * Her three deck-edge lifts, as the model has them: two to starboard forward
 * of her island and one to port aft, each a plate at her flight deck and the
 * slab under it, out beyond her deck edge. Each is lifted out of her to be run
 * up and down (see ford.js). Forward first.
 */
const LIFT_NODES = [
  ['elevator_right_front', 'pCube78'],
  ['elevator_right_back', 'pCube77'],
  ['elevator_left_back', 'pCube76'],
];
const liftOf = new Map();
const LIFT_SETS = LIFT_NODES.map((names, i) => {
  const set = new Set();
  for (let t = 0; t < nTri; t++) {
    if (kindOf.has(t) || !names.includes(nodeName(model.G[t]))) continue;
    set.add(t); liftOf.set(t, i);
  }
  if (set.size < 12) throw new Error(`lift ${i}: only ${set.size} faces`);
  return set;
});
/** Each lift's plan, [x0, x1, z0, z1], off its own faces. */
const LIFT_AT = LIFT_SETS.map((set) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const t of set) for (let k = 0; k < 3; k++) {
    const v = model.T[t * 3 + k] * 3;
    x0 = Math.min(x0, model.P[v]); x1 = Math.max(x1, model.P[v]); z0 = Math.min(z0, model.P[v + 2]); z1 = Math.max(z1, model.P[v + 2]);
  }
  return [x0, x1, z0, z1];
});
console.log('lifts:', LIFT_SETS.map((s) => s.size).join(' '), 'faces;', LIFT_AT.map((b) => b.map((v) => v.toFixed(1)).join(',')).join(' | '));
/**
 * The model's hangar deck, where it lies under her lifts' doors: her hangar
 * is drawn whole in ford.js on that deck, and the model's own, lying in the
 * same plane, would fight it.
 */
const HANGAR_SILL = +(process.env.HANGAR_SILL || 6.47);
const floorOf = new Set();
for (let t = 0; t < nTri; t++) {
  let ok = true;
  for (let k = 0; k < 3 && ok; k++) {
    const v = model.T[t * 3 + k] * 3;
    const x = model.P[v], y = model.P[v + 1], z = model.P[v + 2];
    if (Math.abs(y - HANGAR_SILL) > 0.08 || Math.abs(x) > 20.5 || z < -126 || z > 36) ok = false;
  }
  if (ok) floorOf.add(t);
}
console.log('hangar deck:', floorOf.size, 'faces of the model\'s taken off');

/** A mesh of the triangles `pick` picks, painted by palette index a triangle. */
function subMeshOf(pick) {
  const map = new Map();
  const P = [], T = [], C = [], LF = [];
  for (let t = 0; t < nTri; t++) {
    if (!pick(t)) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      let w = map.get(v);
      if (w === undefined) { w = P.length / 3; map.set(v, w); P.push(model.P[v * 3], model.P[v * 3 + 1], model.P[v * 3 + 2]); }
      T.push(w);
    }
    C.push(PAL.lab[t]);
    LF.push(model.L[t]);
  }
  return { P, T, C, LF };
}

// ---- welding, decimating, and her normals ---------------------------------------------
/**
 * One point per place and paint: the model drew every face of every part on
 * its own points, and the decimator needs them joined to do anything; where
 * two paints meet, each keeps its own, which is a seam it holds.
 */
function weldPainted(m) {
  // The model drew many of its plates as two faces, back to back on the same
  // points: the decimator takes a pair like that for a fold and closes it up,
  // and whole walls of her went. One face of each pair is kept, and drawn from
  // both sides (`S`).
  const at = new Map();
  const posId = (v) => {
    const key = `${Math.round(m.P[v * 3] * 2000)},${Math.round(m.P[v * 3 + 1] * 2000)},${Math.round(m.P[v * 3 + 2] * 2000)}`;
    let id = at.get(key);
    if (id === undefined) { id = at.size; at.set(key, id); }
    return id;
  };
  const nf = m.T.length / 3;
  const ids = new Int32Array(m.T.length);
  for (let i = 0; i < m.T.length; i++) ids[i] = posId(m.T[i]);
  const seen = new Map();
  const keep = new Uint8Array(nf), two = m.S0 ? Uint8Array.from(m.S0) : new Uint8Array(nf);
  // Of the two faces of a pair, the one that faces up: a deck drawn two-faced
  // is a deck, seen from above, and her height map and her planking go by
  // which way it faces.
  const upness = (t) => {
    const [x, y, z] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
    return y / (Math.hypot(x, y, z) || 1);
  };
  for (let t = 0; t < nf; t++) {
    const a = ids[t * 3], b = ids[t * 3 + 1], c = ids[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    const was = seen.get(key);
    if (was !== undefined) {
      // And of two that face the same way -- the one turned to face out
      // having been drawn facing in -- the one the model drew facing out,
      // whose paint is the paint of that side.
      const better = upness(t) > upness(was) + 0.01
        || (Math.abs(upness(t) - upness(was)) <= 0.01 && m.turned && m.turned[was] && !m.turned[t]);
      if (better) { keep[was] = 0; keep[t] = 1; two[t] = 1; seen.set(key, t); } else two[was] = 1;
      continue;
    }
    seen.set(key, t);
    keep[t] = 1;
  }
  const map = new Map();
  const P = [], paint = [], T = [];
  for (let t = 0; t < nf; t++) {
    if (!keep[t]) continue;
    const pk = m.C[t] * 2 + two[t];
    for (let k = 0; k < 3; k++) {
      const v = m.T[t * 3 + k];
      const key = ids[t * 3 + k] * 128 + pk;
      let w = map.get(key);
      if (w === undefined) { w = P.length / 3; map.set(key, w); P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); paint.push(pk); }
      T.push(w);
    }
  }
  return { P, N: new Array(P.length).fill(0), T, paint };
}

/** Decimated to `target` triangles, its paint back on a triangle, and whether it is seen from both sides. */
function reduce(m, target, error, flags = [], pinned = null) {
  const w = weldPainted(m);
  const ratio = Math.min(1, target / (w.T.length / 3));
  let lock = null;
  if (pinned) {
    lock = new Uint8Array(w.P.length / 3);
    for (let v = 0; v < lock.length; v++) lock[v] = pinned(w.P[v * 3], w.P[v * 3 + 1], w.P[v * 3 + 2]) ? 1 : 0;
  }
  const d = ratio < 1 ? decimateWith(MeshoptSimplifier, w, ratio, error, 0, flags, lock) : w;
  const C = [], S = [];
  for (let t = 0; t < d.T.length / 3; t++) { const pk = d.paint[d.T[t * 3]]; C.push(pk >> 1); S.push(pk & 1); }
  return { P: d.P, T: d.T, C, S };
}

/**
 * Normals split at every crease sharper than `deg` and wherever two paints
 * meet: a point is shared only by the faces round it that lie within the
 * crease of each other and are one paint.
 */
function creaseNormals(m, deg = 38) {
  const { P, T, C } = m;
  const nf = T.length / 3;
  const fn = new Float32Array(nf * 3);
  for (let t = 0; t < nf; t++) {
    const [x, y, z] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    fn[t * 3] = x; fn[t * 3 + 1] = y; fn[t * 3 + 2] = z;
  }
  const cos = Math.cos((deg * Math.PI) / 180);
  const unit = (t) => { const l = Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1; return [fn[t * 3] / l, fn[t * 3 + 1] / l, fn[t * 3 + 2] / l]; };
  const round = new Map();
  for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) {
    const v = T[t * 3 + k];
    if (!round.has(v)) round.set(v, []);
    round.get(v).push(t);
  }
  const P2 = [], N2 = [], T2 = new Array(T.length), keyOf = new Map();
  for (let t = 0; t < nf; t++) {
    const ut = unit(t);
    for (let k = 0; k < 3; k++) {
      const v = T[t * 3 + k];
      let nx = 0, ny = 0, nz = 0;
      const with_ = [];
      for (const u of round.get(v)) {
        if (C[u] !== C[t]) continue;
        const uu = unit(u);
        if (uu[0] * ut[0] + uu[1] * ut[1] + uu[2] * ut[2] < cos) continue;
        nx += fn[u * 3]; ny += fn[u * 3 + 1]; nz += fn[u * 3 + 2];
        with_.push(u);
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const key = `${v},${C[t]},${Math.round(nx * 40)},${Math.round(ny * 40)},${Math.round(nz * 40)}`;
      let w = keyOf.get(key);
      if (w === undefined) { w = P2.length / 3; keyOf.set(key, w); P2.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N2.push(nx, ny, nz); }
      T2[t * 3 + k] = w;
    }
  }
  return { P: P2, N: N2, T: T2, C, S: m.S };
}
// ---- her hull --------------------------------------------------------------------------
const hullRaw = subMeshOf((t) => !kindOf.has(t) && !liftOf.has(t) && !floorOf.has(t));
console.log('hull:', hullRaw.T.length / 3, 'triangles before decimation');

// ---- which way her faces face ---------------------------------------------------------
/**
 * The model drew a good many of its faces the wrong way round -- facing into
 * her -- and drew its plates, bulwarks and screens as single sheets; its
 * renderer drew every face from both sides, and the fleet's plating is drawn
 * from the front only. So every face is turned to face the way it can be
 * seen from, and every face that can be seen from both sides is a sheet,
 * drawn from both.
 *
 * Seen from: her faces are put on a grid of `cell` metres, and from a few
 * points of each face rays go out a dozen ways either side of it, through the
 * grid, to see which get clear of her -- out of her hull's openings a ray
 * from inside her seldom does, and from her side nearly every one does.
 */
function orient(m, cell = 0.4) {
  const { P, T } = m;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[i + c]); hi[c] = Math.max(hi[c], P[i + c]); }
  for (let c = 0; c < 3; c++) { lo[c] -= 1; hi[c] += 1; }
  const n = [0, 1, 2].map((c) => Math.ceil((hi[c] - lo[c]) / cell));
  const nx0 = n[0], nxy = n[0] * n[1];
  const grid = new Uint8Array(n[0] * n[1] * n[2]);
  const nf = T.length / 3;
  for (let t = 0; t < nf; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const len = Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]),
      Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2]));
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
    for (let p = 0; p <= steps; p++) {
      for (let q = 0; q <= steps - p; q++) {
        const u = p / steps, v = q / steps, w = 1 - u - v;
        const i = Math.floor((P[a] * w + P[b] * u + P[c] * v - lo[0]) / cell);
        const j = Math.floor((P[a + 1] * w + P[b + 1] * u + P[c + 1] * v - lo[1]) / cell);
        const k = Math.floor((P[a + 2] * w + P[b + 2] * u + P[c + 2] * v - lo[2]) / cell);
        grid[k * nxy + j * nx0 + i] = 1;
      }
    }
  }
  /** Whether a ray from (x, y, z) along (dx, dy, dz) gets clear of her: a walk through the grid, cell by cell. */
  const clear = (x, y, z, dx, dy, dz) => {
    let i = Math.floor((x - lo[0]) / cell), j = Math.floor((y - lo[1]) / cell), k = Math.floor((z - lo[2]) / cell);
    const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1, sk = dz > 0 ? 1 : -1;
    const ti = Math.abs(cell / (dx || 1e-12)), tj = Math.abs(cell / (dy || 1e-12)), tk = Math.abs(cell / (dz || 1e-12));
    let mi = ((dx > 0 ? (i + 1) * cell + lo[0] - x : x - (i * cell + lo[0]))) * ti / cell;
    let mj = ((dy > 0 ? (j + 1) * cell + lo[1] - y : y - (j * cell + lo[1]))) * tj / cell;
    let mk = ((dz > 0 ? (k + 1) * cell + lo[2] - z : z - (k * cell + lo[2]))) * tk / cell;
    for (;;) {
      if (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2]) return true;
      if (grid[k * nxy + j * nx0 + i]) return false;
      if (mi < mj && mi < mk) { i += si; mi += ti; } else if (mj < mk) { j += sj; mj += tj; } else { k += sk; mk += tk; }
    }
  };
  // Directions round the sphere, a golden spiral of them; along her length
  // only obliquely, which is the long way out of her.
  const DIRS = [];
  for (let q = 0; q < 26; q++) {
    const yy = 1 - (2 * (q + 0.5)) / 26, r = Math.sqrt(1 - yy * yy), th = q * 2.39996;
    const d = [Math.cos(th) * r, yy, Math.sin(th) * r];
    if (Math.abs(d[2]) < 0.8) DIRS.push(d);
  }
  const S0 = new Uint8Array(nf), turned = new Uint8Array(nf);
  let flipped = 0, sheets = 0;
  const lift = cell * 1.6;
  for (let t = 0; t < nf; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    let [fx, fy, fz] = faceNormal(m, a, b, c);
    const l = Math.hypot(fx, fy, fz);
    if (!(l > 1e-12)) continue;
    fx /= l; fy /= l; fz /= l;
    let front = 0, back = 0;
    for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]) {
      const x = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc;
      const y = P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc;
      const z = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
      for (const [dx, dy, dz] of DIRS) {
        const dot = dx * fx + dy * fy + dz * fz;
        if (Math.abs(dot) < 0.25) continue;
        const sgn = dot > 0 ? 1 : -1;
        // Off the face first, out of the cells it is in itself.
        if (clear(x + sgn * fx * lift + dx * lift, y + sgn * fy * lift + dy * lift, z + sgn * fz * lift + dz * lift, dx, dy, dz)) {
          if (sgn > 0) front++; else back++;
        }
      }
    }
    if (front >= 3 && back >= 3) { S0[t] = 1; sheets++; } else if (back > front) {
      T[t * 3 + 1] = c; T[t * 3 + 2] = b;
      turned[t] = 1;
      flipped++;
    }
  }
  console.log(`faces: ${flipped} turned to face out, ${sheets} seen from both sides, on a ${n.join('x')} grid`);
  m.turned = turned;
  return S0;
}
hullRaw.S0 = orient(hullRaw);
// Pruned as it is decimated: what is too small to keep whole -- a cleat, a
// stanchion -- goes, rather than being kept as a shard.
// And her waterline held where it is drawn, the length of her new bottom:
// there her side's plating stops at it and her bottom's skin starts, two
// paints and so two edges, and the decimator, free to slide an edge along
// itself, slid her side's off a metre of her starboard bow and left a notch
// open to her insides.
let hull = creaseNormals(reduce(hullRaw, +(process.env.HULL_TRIS || 140000), +(process.env.HULL_ERROR || 0.004),
  (process.env.HULL_FLAGS ?? 'Prune').split(',').filter(Boolean),
  (x, y) => Math.abs(y - WATERLINE) < 1e-3));
console.log('hull:', hull.T.length / 3, 'triangles,', hull.P.length / 3, 'points');

// Her underwater body cut across every two metres of her length. Decimated,
// her flat midbody is a handful of plates forty metres long, and the damage
// board reads her lines off her points: a station with no point of her in it
// reads as no ship at all. A cut across a plate adds points along it and
// changes nothing of her shape.
{
  const STEP = 2;
  let cuts = 0;
  for (let c = -Math.floor(LOA / 2 / STEP) * STEP; c < LOA / 2; c += STEP) {
    const { P, N, T, C, S } = hull;
    const made = new Map();
    const cross = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (made.has(key)) return made.get(key);
      const s = (c - P[a * 3 + 2]) / (P[b * 3 + 2] - P[a * 3 + 2]);
      const w = P.length / 3;
      P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * s, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * s, c);
      const n = [0, 1, 2].map((k) => N[a * 3 + k] + (N[b * 3 + k] - N[a * 3 + k]) * s);
      const l = Math.hypot(...n) || 1;
      N.push(n[0] / l, n[1] / l, n[2] / l);
      made.set(key, w);
      return w;
    };
    const T2 = [], C2 = [], S2 = [];
    for (let t = 0; t < T.length / 3; t++) {
      const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
      const sd = v.map((i) => Math.sign(P[i * 3 + 2] - c));
      const low = v.some((i) => P[i * 3 + 1] < 0.5);
      if (!low || !(sd.includes(1) && sd.includes(-1))) { T2.push(...v); C2.push(C[t]); S2.push(S[t]); continue; }
      cuts++;
      const fore = [], aft = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3];
        if (sd[k] >= 0) fore.push(a);
        if (sd[k] <= 0) aft.push(a);
        if (sd[k] * sd[(k + 1) % 3] < 0) { const w = cross(a, b); fore.push(w); aft.push(w); }
      }
      for (const poly of [fore, aft]) {
        for (let k = 1; k + 1 < poly.length; k++) { T2.push(poly[0], poly[k], poly[k + 1]); C2.push(C[t]); S2.push(S[t]); }
      }
    }
    hull = { P, N, T: T2, C: C2, S: S2 };
  }
  console.log(`stations: ${cuts} triangles of her underwater body cut every ${STEP} m;`, hull.T.length / 3, 'triangles');
}

// The cracks the decimator leaves between her plates. Where two of the
// model's plates meet edge to edge without sharing their points, each is
// decimated on its own, and the two edges come out different lines: one keeps
// a knuckle the other has straightened, and the sliver between them is open to
// her insides -- on her port bow, under water, it showed her bulkheads to a
// ray along her side. Wherever a corner of an open edge stands off another
// open edge by no more than a sliver's width, the sliver is plated -- under
// water only: above it, her belt's plates lap over one another, an open edge
// there is covered, and plating across one is a bright streak down her side.
{
  const { P, N, T, C, S } = hull;
  const key = (i) => `${Math.round(P[i * 3] * 1000)},${Math.round(P[i * 3 + 1] * 1000)},${Math.round(P[i * 3 + 2] * 1000)}`;
  const id = new Map(), rep = [];
  const vk = (i) => { const k = key(i); let v = id.get(k); if (v === undefined) { v = rep.length; id.set(k, v); rep.push(i); } return v; };
  const edges = new Map();
  for (let t = 0; t < T.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const a = vk(T[t * 3 + k]), b = vk(T[t * 3 + (k + 1) % 3]);
      const e = a < b ? `${a},${b}` : `${b},${a}`;
      const was = edges.get(e);
      edges.set(e, was ? { n: was.n + 1, t } : { n: 1, t });
    }
  }
  const at = (v) => [P[rep[v] * 3], P[rep[v] * 3 + 1], P[rep[v] * 3 + 2]];
  // Her open edges up to two metres over her waterline, not the Hagen's none:
  // the step her belt makes along her bow leaves a crack a ray goes in by.
  const MAXY = +(process.env.CRACK_Y ?? 2), TOL = 0.3, CELL = 1;
  const open = [], ends = new Set();
  for (const [e, { n, t }] of edges) {
    if (n !== 1) continue;
    const [a, b] = e.split(',').map(Number);
    if (at(a)[1] > MAXY && at(b)[1] > MAXY) continue;
    open.push([a, b, t]); ends.add(a); ends.add(b);
  }
  const grid = new Map();
  const cellOf = (p) => p.map((x) => Math.floor(x / CELL));
  for (let i = 0; i < open.length; i++) {
    const [a, b] = open[i].slice(0, 2).map(at);
    const lo = cellOf(a.map((x, d) => Math.min(x, b[d]) - TOL)), hi = cellOf(a.map((x, d) => Math.max(x, b[d]) + TOL));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = `${x},${y},${z}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  }
  let plated = 0;
  for (const v of ends) {
    const p = at(v);
    if (p[1] > MAXY) continue;
    for (const i of grid.get(cellOf(p).join(',')) || []) {
      const [a, b, t] = open[i];
      if (a === v || b === v) continue;
      const pa = at(a), pb = at(b);
      const ab = pb.map((x, d) => x - pa[d]), ap = p.map((x, d) => x - pa[d]);
      const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      if (!(len2 > 1e-6)) continue;
      const s = (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / len2;
      if (s <= 0.02 || s >= 0.98) continue;
      const off = Math.hypot(...ap.map((x, d) => x - ab[d] * s));
      // A sliver, and not the far side of an opening: close to the edge, and
      // thin against its length.
      if (off < 0.005 || off > TOL || off > 0.15 * Math.sqrt(len2)) continue;
      // Painted and lit as the plate it closes -- points of its own, with that
      // plate's normals, not whichever of the points there a deck's normal
      // was split onto -- and drawn from both sides.
      const n = [0, 1, 2].map((d) => N[T[t * 3] * 3 + d] + N[T[t * 3 + 1] * 3 + d] + N[T[t * 3 + 2] * 3 + d]);
      const nl = Math.hypot(...n) || 1;
      const base = P.length / 3;
      for (const q of [pa, p, pb]) { P.push(...q); N.push(n[0] / nl, n[1] / nl, n[2] / nl); }
      T.push(base, base + 1, base + 2); C.push(C[t]); S.push(1);
      plated++;
    }
  }
  console.log(`cracks: ${plated} slivers between her plates closed, of ${open.length} open edges below ${MAXY} m`);
}

// Her decks: painted steel from end to end, non-skid grey: every face of
// her is plating. The plates the model drew two-faced are drawn from both
// sides (2).
const surfaceOf = (t) => (hull.S[t] ? 2 : 0);

// Her surface, as a height map: what every mounting is seated on, and what
// her aircraft taxi on.
const HM = { x0: -52, z0: -172, step: 0.5, nx: 209, nz: 689 };
const hm = heightmap(hull, HM);
// Her lifts are part of her flight deck whenever they are up, which is
// whenever nothing is using them: they are her surface there.
// The height of her lifts' plates, which is her flight deck's.
const FD_LIFT = Math.max(...LIFT_SETS.flatMap((set) => [...set].flatMap((t) => [0, 1, 2].map((k) => model.P[model.T[t * 3 + k] * 3 + 1]))));
for (const [x0, x1, z0, z1] of LIFT_AT) {
  for (let j = Math.ceil((z0 + 0.2 - HM.z0) / HM.step); j <= Math.floor((z1 - 0.2 - HM.z0) / HM.step); j++) {
    for (let i = Math.ceil((x0 + 0.2 - HM.x0) / HM.step); i <= Math.floor((x1 - 0.2 - HM.x0) / HM.step); i++) {
      const k = j * HM.nx + i;
      if (k >= 0 && k < hm.length) hm[k] = Math.max(hm[k], FD_LIFT);
    }
  }
}
/** Her surface at (x, z), off the height map: the median of the cells round it. */
function hullSeat(x, z) {
  const i = Math.round((x - HM.x0) / HM.step), j2 = Math.round((z - HM.z0) / HM.step);
  const ys = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const v = hm[(j2 + dj) * HM.nx + (i + di)];
    if (v > -50) ys.push(v);
  }
  ys.sort((a, b) => a - b);
  return ys.length ? ys[ys.length >> 1] : 0;
}

// ---- her flight deck ------------------------------------------------------------------
// Her flight deck is the model's own, its markings and all: one level, the
// highest broad flat of her. Its outline is read off her height map -- at
// every half metre of her length, how far out each way it runs at its own
// height -- and so is her island, which is everything that stands more than
// three metres over it inboard of her deck edge.
const counts = new Map();
for (const v of hm) if (v > 12 && v < 30) { const k = Math.round(v * 20) / 20; counts.set(k, (counts.get(k) || 0) + 1); }
export const FD = [...counts].sort((a, b) => b[1] - a[1])[0][0];
const onDeck = (v) => Math.abs(v - FD) < 0.3;
const plan = { z0: HM.z0, dz: HM.step, nz: HM.nz, port: new Float32Array(HM.nz), stbd: new Float32Array(HM.nz) };
const island = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
for (let jz = 0; jz < HM.nz; jz++) {
  // Out from her centreline each way while the deck, or whatever stands on
  // it (her island, a tractor), holds; a gap of more than two metres off it
  // is her edge.
  for (const [side, s] of [['port', 1], ['stbd', -1]]) {
    let out = 0, miss = 0;
    for (let d = 0; d <= 51; d += HM.step) {
      const i = Math.round((s * d - HM.x0) / HM.step);
      if (i < 0 || i >= HM.nx) break;
      const v = hm[jz * HM.nx + i];
      if (onDeck(v) || v > FD) { out = d; miss = 0; } else if (++miss > 4) break;
    }
    plan[side][jz] = out;
  }
  for (let i = 0; i < HM.nx; i++) {
    const x = HM.x0 + i * HM.step;
    if (x > 0 || hm[jz * HM.nx + i] < FD + 3) continue;
    const z = HM.z0 + jz * HM.step;
    if (x > -15) continue;
    // Her island, abaft her two starboard lifts: not her masts and her
    // aerials forward.
    if (HM.z0 + jz * HM.step > -60) continue;
    island.x0 = Math.min(island.x0, x); island.x1 = Math.max(island.x1, x);
    island.z0 = Math.min(island.z0, z); island.z1 = Math.max(island.z1, z);
  }
}
let FD_AFT = 0, FD_FWD = 0;
for (let k = 0; k < plan.nz; k++) if (plan.port[k] + plan.stbd[k] > 20) { FD_AFT = plan.z0 + k * plan.dz; break; }
for (let k = plan.nz - 1; k >= 0; k--) if (plan.port[k] + plan.stbd[k] > 10) { FD_FWD = plan.z0 + k * plan.dz; break; }
const ISLAND = Object.fromEntries(Object.entries(island).map(([k, v]) => [k, +v.toFixed(2)]));
console.log(`flight deck: ${FD} m, ${FD_AFT} to ${FD_FWD}; island x ${ISLAND.x0}..${ISLAND.x1} z ${ISLAND.z0}..${ISLAND.z1}`);
console.log('her deck outline, starboard|port:', [-160, -150, -100, -50, 0, 50, 100, 150, 160].map((z) => {
  const k = Math.round((z - plan.z0) / plan.dz);
  return `${z}:${plan.stbd[k].toFixed(1)}|${plan.port[k].toFixed(1)}`;
}).join(' '));

// Her lines, as the model has them: what her interior and armour are fitted
// under (see measureLines). The deck over her insides is her hangar deck,
// which ford.js lays.
const st = stations(hull, { length: LOA, beamCap: FD - 1.5, edgeCap: FD + 0.5, slice: true, beamFloor: 0 });
const LINES = measureLines(hull, st, { z0: -168, dz: 1, nz: 337, y0: -13, dy: 0.5, ny: 60 }, FD);
console.log('her lines: keel amidships', LINES.keel[168].toFixed(2), 'half-breadth at the waterline amidships',
  LINES.half[168 * LINES.ny + 26].toFixed(2));
// And how far out her plating actually is up the height of her hangar: at
// every metre of her length and every half metre of height, the least span
// between the outermost crossing of her shell to port and to starboard.
{
  const Z0 = -168, NZ = 337, Y0 = 1, DY = 0.5, NY = 36;
  const byZ = Array.from({ length: NZ }, () => []);
  const { P, T } = hull;
  for (let t = 0; t < T.length; t += 3) {
    const zs = [P[T[t] * 3 + 2], P[T[t + 1] * 3 + 2], P[T[t + 2] * 3 + 2]];
    const k0 = Math.max(0, Math.ceil(Math.min(...zs) - Z0)), k1 = Math.min(NZ - 1, Math.floor(Math.max(...zs) - Z0));
    for (let k = k0; k <= k1; k++) byZ[k].push(t);
  }
  const span = (k, y) => {
    const z = Z0 + k;
    let lo2 = Infinity, hi2 = -Infinity;
    for (const t of byZ[k]) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      const d = (P[b + 2] - P[c + 2]) * (P[a + 1] - P[c + 1]) + (P[c + 1] - P[b + 1]) * (P[a + 2] - P[c + 2]);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((P[b + 2] - P[c + 2]) * (y - P[c + 1]) + (P[c + 1] - P[b + 1]) * (z - P[c + 2])) / d;
      const l2 = ((P[c + 2] - P[a + 2]) * (y - P[c + 1]) + (P[a + 1] - P[c + 1]) * (z - P[c + 2])) / d;
      if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
      const x = P[a] * l1 + P[b] * l2 + P[c] * (1 - l1 - l2);
      lo2 = Math.min(lo2, x); hi2 = Math.max(hi2, x);
    }
    return hi2 < lo2 ? 0 : Math.max(0, Math.min(hi2, -lo2));
  };
  const w = [];
  for (let k = 0; k < NZ; k++) for (let jy = 0; jy < NY; jy++) w.push(+span(k, Y0 + jy * DY).toFixed(2));
  LINES.inner = { z0: Z0, dz: 1, nz: NZ, y0: Y0, dy: DY, ny: NY, w };
  console.log('her plating at 12 m, every 30 m:', Array.from({ length: 11 }, (_, i) => w[(i * 30 + 16) * NY + 22]).join(' '));
}

const col = new Uint8Array(hull.P.length / 3 * 3);
for (let t = 0; t < hull.T.length / 3; t++) {
  for (let k = 0; k < 3; k++) col.set(PALETTE[hull.C[t]], hull.T[t * 3 + k] * 3);
}
const uv = new Float32Array(hull.P.length / 3 * 2);
const packed = pack(hull, col, uv, { buckets: +(process.env.BUCKETS || 70), length: LOA, surfaceOf, kinds: 3, compact: true });
console.log('packed hull', packed.blob.length, 'bytes in', packed.buckets, 'slices');

// ---- her mountings -----------------------------------------------------------------------
/**
 * A piece's triangles, as a mesh of its own, with the part of it each came
 * from: the model drew every gun as one piece, so its parts -- each barrel,
 * the gunhouse, the shield -- are the runs of it that hang together, every
 * face joined to the next by a point the two share.
 */
function groupMesh(set) {
  const m = subMeshOf((t) => set.has(t));
  const key = (v) => `${Math.round(m.P[v * 3] * 1000)},${Math.round(m.P[v * 3 + 1] * 1000)},${Math.round(m.P[v * 3 + 2] * 1000)}`;
  const id = new Map();
  const up = [];
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const node = (v) => { const k = key(v); let i = id.get(k); if (i === undefined) { i = up.length; id.set(k, i); up.push(i); } return i; };
  const nf = m.T.length / 3;
  const first = new Int32Array(nf);
  for (let t = 0; t < nf; t++) {
    const a = node(m.T[t * 3]), b = node(m.T[t * 3 + 1]), c = node(m.T[t * 3 + 2]);
    up[find(b)] = find(a); up[find(c)] = find(a);
    first[t] = a;
  }
  m.LF = [...first].map((a) => find(a));
  return m;
}

/**
 * Where a mounting stands and which way it faces, off its own group: its
 * pivot is the middle of its foot -- the lowest half metre of it -- and it
 * faces from there towards the furthest of its points, which is a muzzle.
 */
function seatOf(m) {
  let y0 = Infinity;
  for (let i = 1; i < m.P.length; i += 3) y0 = Math.min(y0, m.P[i]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < m.P.length; i += 3) {
    if (m.P[i + 1] > y0 + 0.5) continue;
    x0 = Math.min(x0, m.P[i]); x1 = Math.max(x1, m.P[i]); z0 = Math.min(z0, m.P[i + 2]); z1 = Math.max(z1, m.P[i + 2]);
  }
  const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  // Towards the middle of its furthest points: the muzzles of all its
  // barrels, not the furthest of them, which on a triple is a wing gun's.
  let far = 0;
  for (let i = 0; i < m.P.length; i += 3) far = Math.max(far, Math.hypot(m.P[i] - x, m.P[i + 2] - z));
  let dx = 0, dz = 0;
  for (let i = 0; i < m.P.length; i += 3) {
    if (Math.hypot(m.P[i] - x, m.P[i + 2] - z) < far * 0.85) continue;
    dx += m.P[i] - x; dz += m.P[i + 2] - z;
  }
  return { x, z, y: y0, rest: Math.atan2(dx, dz) };
}

/** A mesh put in the frame of its mounting: pivot at the origin, its foot at y = 0, facing +Z. */
function toMount(m, s) {
  const c = Math.cos(-s.rest), sn = Math.sin(-s.rest);
  const P = m.P.slice();
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i] - s.x, z = P[i + 2] - s.z;
    P[i] = x * c + z * sn;
    P[i + 1] -= s.y;
    P[i + 2] = -x * sn + z * c;
  }
  return { ...m, P };
}

/**
 * One of a kind, in the frame of its mounting, trained whole: none of hers
 * has barrels long enough to be worth a cradle of their own -- a Phalanx's
 * six are short under its dome, and a launcher's missiles are in its cells.
 * Its muzzle is the middle of its face, the furthest of it forward.
 */
function mountKind(kind, { tris, which = 0, rest = null }) {
  const raw = groupMesh(KINDS[kind][which]);
  const s = seatOf(raw);
  if (rest !== null) s.rest = rest;
  const local = toMount(raw, s);
  const hd = creaseNormals(reduce(local, tris, 0.002));
  let roof = 0, tip = null, far = -Infinity;
  for (let i = 0; i < hd.P.length; i += 3) {
    roof = Math.max(roof, hd.P[i + 1]);
    if (hd.P[i + 2] > far) { far = hd.P[i + 2]; tip = [0, hd.P[i + 1], hd.P[i + 2]]; }
  }
  const trunnion = [0, +(roof * 0.55).toFixed(3), 0];
  const muzzles = [[0, +(tip[1] - trunnion[1]).toFixed(3), +tip[2].toFixed(3)]];
  const byV = new Uint8Array(hd.P.length / 3);
  for (let t = 0; t < hd.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[hd.T[t * 3 + k]] = hd.C[t];
  console.log(`${kind}: ${hd.T.length / 3} triangles, muzzle ${muzzles[0].join(',')}, roof ${roof.toFixed(2)}`);
  DEBUG[kind] = { hd, bd: { P: [], N: [], T: [], C: [] }, trunnion, pitch: 0 };
  return {
    house: packPieceCompact(hd, (i) => PALETTE[byV[i]]).toString('base64'), guns: null,
    trunnion, muzzles, pitch: 0, roof: +roof.toFixed(3),
  };
}

const DEBUG = {};
/**
 * Which way mounting `i` of a kind faces, as the model stands it: a Phalanx
 * from its pivot toward its barrels; a launcher the way its own first piece
 * looks, its +Z.
 */
function facingOf(kind, i) {
  const set = KINDS[kind][i];
  const s = seatOf(groupMesh(set));
  if (BARRELS[kind]) {
    let x = 0, z = 0, n = 0;
    for (const t of set) {
      if (nodeName(model.G[t]) !== BARRELS[kind][i]) continue;
      for (let k = 0; k < 3; k++) { const v = model.T[t * 3 + k] * 3; x += model.P[v]; z += model.P[v + 2]; n++; }
    }
    return Math.atan2(x / n - s.x, z / n - s.z);
  }
  const first = j.nodes.findIndex((nd, q) => nd && [...set].some((t) => model.G[t] === q));
  const w = WORLD[first];
  return Math.atan2(w[8], w[10]);
}
const FACES = Object.fromEntries(Object.keys(KINDS).map((k) => [k, KINDS[k].map((_, i) => facingOf(k, i))]));
for (const [k, list] of Object.entries(FACES)) console.log(`${k} faces, as drawn:`, list.map((a) => (a * 180 / Math.PI).toFixed(0)).join(' '));
// Each kind drawn off the one of it the model draws best: her port Phalanx,
// which faces out over her side as a Phalanx should.
const TEMPLATE = { ciws: 2, sparrow: 0, ram: 0 };
const GUNS = {
  ciws: mountKind('ciws', { tris: 1600, which: TEMPLATE.ciws, rest: FACES.ciws[TEMPLATE.ciws] }),
  sparrow: mountKind('sparrow', { tris: 1000, which: TEMPLATE.sparrow, rest: FACES.sparrow[TEMPLATE.sparrow] }),
  ram: mountKind('ram', { tris: 1000, which: TEMPLATE.ram, rest: FACES.ram[TEMPLATE.ram] }),
};

/** Every mounting of a kind where it stands, which way it faces, and its muzzle's reach and height. */
function seats(kind) {
  const g = GUNS[kind];
  return KINDS[kind].map((gi, i) => {
    const s = seatOf(groupMesh(gi));
    const [mx, my, mz] = g.muzzles[0];
    // Stowed facing out from her: over her side, or over her stern for one on
    // her centreline aft. The Phalanx the model drew by her island facing in
    // over her own flight deck is turned round to face out with the others.
    const out = Math.abs(s.x) > 8 ? Math.sign(s.x) * Math.PI / 2 : (s.z < 0 ? Math.PI : 0);
    return {
      x: +s.x.toFixed(3), z: +s.z.toFixed(3), y: +s.y.toFixed(3), rest: +out.toFixed(4),
      drawn: +FACES[kind][i].toFixed(4),
      reach: +Math.hypot(mx, mz).toFixed(2), my: +(s.y + g.trunnion[1] + my).toFixed(2),
    };
  });
}
const MOUNTS = Object.fromEntries(Object.keys(GUNS).map((k) => [k, seats(k)]));
for (const [k, list] of Object.entries(MOUNTS)) {
  console.log(k, list.map((s) => `(${s.x}, ${s.z}) y ${s.y} rest ${(s.rest * 180 / Math.PI).toFixed(0)} reach ${s.reach} my ${s.my}`).join('\n   '));
}

// PLAN=file.png writes her from overhead, every face of her hull as it is
// painted, a pixel to half a metre, her bow up: what her catapults and her
// spots are placed off.
if (process.env.PLAN) {
  const W = HM.nx, H = HM.nz;
  const img = Buffer.alloc(W * H * 3, 40);
  const top = new Float32Array(W * H).fill(-1e9);
  for (let t = 0; t < hull.T.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = hull.T[t * 3 + k] * 3; cx += hull.P[v] / 3; cy += hull.P[v + 1] / 3; cz += hull.P[v + 2] / 3; }
    // Every pixel the face covers, roughly: its corners and its middle.
    for (let k = -1; k < 3; k++) {
      let x = cx, z = cz;
      if (k >= 0) { const v = hull.T[t * 3 + k] * 3; x = (hull.P[v] + 2 * cx) / 3; z = (hull.P[v + 2] + 2 * cz) / 3; }
      const i = Math.round((x - HM.x0) / HM.step), jz = Math.round((z - HM.z0) / HM.step);
      if (i < 0 || i >= W || jz < 0 || jz >= H) continue;
      const q = (H - 1 - jz) * W + (W - 1 - i);
      if (cy < top[q]) continue;
      top[q] = cy;
      img.set(PALETTE[hull.C[t]].map((c) => Math.round(toSrgb(c / 255) * 255)), q * 3);
    }
  }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(process.env.PLAN);
  console.log('plan written to', process.env.PLAN);
}

// ---- her lifts, as pieces ---------------------------------------------------------------
/**
 * Each lift as a piece of its own: its plate and its markings, put about the
 * middle of its plate with its top at y = 0, and where that middle is.
 */
const LIFTS = LIFT_SETS.map((set) => {
  const m = subMeshOf((t) => set.has(t));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = -Infinity;
  for (let i = 0; i < m.P.length; i += 3) {
    x0 = Math.min(x0, m.P[i]); x1 = Math.max(x1, m.P[i]);
    z0 = Math.min(z0, m.P[i + 2]); z1 = Math.max(z1, m.P[i + 2]);
    top = Math.max(top, m.P[i + 1]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const local = { ...m, P: m.P.map((v, i) => (i % 3 === 0 ? v - cx : i % 3 === 1 ? v - top : v - cz)) };
  const w = reduce(local, 1e9, 0);
  const hd = creaseNormals(w);
  const byV = new Uint8Array(hd.P.length / 3);
  for (let t = 0; t < hd.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[hd.T[t * 3 + k]] = hd.C[t];
  return {
    x: +cx.toFixed(3), z: +cz.toFixed(3), y: +top.toFixed(3),
    hw: +((x1 - x0) / 2).toFixed(3), hd: +((z1 - z0) / 2).toFixed(3),
    piece: packPieceCompact(hd, (i) => PALETTE[byV[i]]).toString('base64'),
  };
});
for (const l of LIFTS) console.log(`lift at (${l.x}, ${l.z}), ${(l.hw * 2).toFixed(1)} by ${(l.hd * 2).toFixed(1)} m, top ${l.y}`);

// ---- a look at her ------------------------------------------------------------------
// DUMP=file.glb writes her whole, guns and all, as one coloured mesh, to be
// looked at in any glTF viewer.
if (process.env.DUMP) {
  const P = [], N = [], C = [], T = [];
  const add = (m, place) => {
    const base = P.length / 3;
    const byV = new Uint8Array(m.P.length / 3);
    for (let t = 0; t < m.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[m.T[t * 3 + k]] = m.C[t];
    for (let i = 0; i < m.P.length / 3; i++) {
      const [p, n] = place([m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]], [m.N[i * 3], m.N[i * 3 + 1], m.N[i * 3 + 2]]);
      P.push(...p); N.push(...n); C.push(...PALETTE[byV[i]].map((v) => v / 255));
    }
    for (const v of m.T) T.push(base + v);
  };
  add(hull, (p, n) => [p, n]);
  const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  for (const [kind, list] of Object.entries(MOUNTS)) {
    for (const s of list) {
      const d = kind === 'tubes' ? DEBUG[`tubes${s.piece}`] : DEBUG[kind];
      const at = (v) => { const r = rotY(v, s.rest); return [r[0] + s.x, r[1] + s.y, r[2] + s.z]; };
      add(d.hd, (p, n) => [at(p), rotY(n, s.rest)]);
      add(d.bd, (p, n) => {
        const q = rotX(p, -d.pitch);
        return [at([q[0] + d.trunnion[0], q[1] + d.trunnion[1], q[2] + d.trunnion[2]]), rotY(rotX(n, -d.pitch), s.rest)];
      });
    }
  }
  const f32 = (a) => Buffer.from(Float32Array.from(a).buffer);
  const bufs = [f32(P), f32(N), f32(C), Buffer.from(Uint32Array.from(T).buffer)];
  let off = 0;
  const views = bufs.map((b, i) => { const v = { buffer: 0, byteOffset: off, byteLength: b.length, target: i < 3 ? 34962 : 34963 }; off += b.length; return v; });
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) { mn[i % 3] = Math.min(mn[i % 3], P[i]); mx[i % 3] = Math.max(mx[i % 3], P[i]); }
  const js = Buffer.from(JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 }, doubleSided: true }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: P.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: P.length / 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5125, count: T.length, type: 'SCALAR' },
    ],
  }));
  const jsPad = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat(bufs);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsPad.length + 8 + body.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(jsPad.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(body.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(process.env.DUMP, Buffer.concat([head, c1, jsPad, c2, body]));
  console.log('dumped', process.env.DUMP);
}

// ---- write ---------------------------------------------------------------------------------
const round = (a, d = 2) => Array.from(a, (v) => +v.toFixed(d));
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-ford-hull.mjs from the owner's model,\n// "Gerald R Ford aircraft Carrier" by waelXcm (https://skfb.ly/oEAwB), CC BY 4.0.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const FORD_HULL_B64 = ${JSON.stringify(packed.blob.toString('base64'))};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see fordSurfaceY.\n`
  + `export const FORD_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her flight deck: its height, its ends, and how far out it runs each way\n`
  + `// every half metre.\n`
  + `export const FORD_DECK = ${JSON.stringify({ y: FD, aft: FD_AFT, fwd: FD_FWD, z0: plan.z0, dz: plan.dz, nz: plan.nz, port: round(plan.port, 1), stbd: round(plan.stbd, 1) })};\n`
  + `// Her island, which nothing on her deck is laid across.\n`
  + `export const FORD_ISLAND = ${JSON.stringify(ISLAND)};\n`
  + `// One of each of her mountings as the model drew it, in the frame of its own\n`
  + `// mounting.\n`
  + `export const FORD_GUNS = ${JSON.stringify(GUNS)};\n`
  + `// Where every one of her mountings stands, which way it faces, and its\n`
  + `// muzzle's reach and height.\n`
  + `export const FORD_MOUNTS = ${JSON.stringify(MOUNTS)};\n`
  + `// Her three lifts, each its plate and its markings about its own middle, top\n`
  + `// at y = 0: where that middle is, and how big each is.\n`
  + `export const FORD_LIFTS = ${JSON.stringify(LIFTS)};\n`
  + `// Her lines as the model has them: keel, and her half-breadth at every half\n`
  + `// metre of height, a metre at a time; and the breadth inside her plating.\n`
  + `export const FORD_LINES = ${JSON.stringify({ ...LINES, keel: round(LINES.keel), deck: round(LINES.deck), half: round(LINES.half) })};\n`);
console.log('wrote', path.relative(ROOT, OUT_DATA), `${(readFileSync(OUT_DATA).length / 1e6).toFixed(2)} MB`);
