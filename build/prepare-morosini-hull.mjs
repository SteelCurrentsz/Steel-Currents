// Turn the owner's model of the battleship Francesco Morosini into what
// client/js/render/morosiniHull.js ships: her hull, her superstructure, her
// funnels, her masts and every fitting on her as one painted mesh, and every
// gun of hers that trains -- her four 457 mm twins, her eight 135 mm twins,
// her sixteen 90 mm twins and her 37 mm twins -- cut free of her, each as the
// model drew it, with its barrels on a cradle that elevates.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-morosini-hull.mjs [model.glb]
//
// Reads assets/models/RNMorosini-maximum-compressed.glb as the owner uploaded
// it: "Italian Battleship Francesco Morosini" by 全斗焕 (https://skfb.ly/osPxN),
// under Creative Commons Attribution 4.0 -- credited on the game's Credits
// screen. A Sketchfab export of the whole ship, every textured, its bow along
// +Z, its waterline at y = 0. Unlike the Hagen's, the model draws every gun of
// a kind as one piece -- all sixteen 90 mm twins in one, all four turrets in
// another -- and some guns out of several pieces (the 135 mm twins' gunhouses,
// their barrels, their mantlets and their cupolas each a piece of its own), so
// each mounting is found as a cluster of the pieces' parts where it stands.
//
// In order:
//
//   * every piece of the model is flattened into her own frame -- +Z her bow,
//     +Y up, y = 0 her waterline -- and brought up to her own length;
//   * every triangle is painted the colour of the texture under it -- her
//     dazzle, her forecastle's recognition stripes and all -- but for her
//     bottom, cut along her waterline and painted one colour under it; the
//     colours are gathered into a palette;
//   * her guns and her screws are lifted out of her, mounting by mounting;
//     every face of what is left is turned to face the way it can be seen
//     from, and of every plate drawn two-faced one face is kept and drawn from
//     both sides;
//   * it is decimated to what the fleet renders, read off as a height map and
//     as her lines, and packed into length-wise slices;
//   * one of each kind of gun is put in the frame of its own mounting, its
//     barrels taken off its gunhouse and turned true about their trunnions,
//     and where every one of her mountings stands is measured off its own.
//
// Writes client/js/render/morosiniHull.data.js, which is committed, so a fresh
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
const sharp = require('sharp');
const { MeshoptDecoder } = require('meshoptimizer');
const MeshoptSimplifier = await simplifier();
// Prune (taking off loose bits too small to keep) is one of its experimental flags.
MeshoptSimplifier.useExperimentalFeatures = true;
const OUT_DATA = path.join(ROOT, 'client/js/render/morosiniHull.data.js');

// ---- her model ---------------------------------------------------------------------
const SRC = process.argv[2] || path.join(ROOT, 'assets/models/RNMorosini-maximum-compressed.glb');
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
    // Her pieces are the children of the model's one group.
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
// The model is drawn to no scale in particular: 0.188 of its units stem to
// stern and 0.027 across. It is brought up to her length, 212 m over all --
// the Caracciolo class's -- every one of its measures by the same factor,
// which makes her 30.7 m across, with its waterline where the model has it, at
// y = 0, which puts her keel 7.9 m under it. Centred on her length and her
// beam; its bow is already +Z.
export const REAL_LOA = 212;
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < model.P.length; i += 3) {
  for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.P[i + c]); hi[c] = Math.max(hi[c], model.P[i + c]); }
}
export const SCALE = REAL_LOA / (hi[2] - lo[2]);
const XC = (lo[0] + hi[0]) / 2, ZC = (lo[2] + hi[2]) / 2;
export const LOA = REAL_LOA;
for (let i = 0; i < model.P.length; i += 3) {
  model.P[i] = (model.P[i] - XC) * SCALE;
  model.P[i + 1] *= SCALE;
  model.P[i + 2] = (model.P[i + 2] - ZC) * SCALE;
}
console.log(`frame: x${SCALE.toFixed(1)}, ${LOA} m long, ${((hi[0] - lo[0]) * SCALE).toFixed(2)} m across, keel ${(lo[1] * SCALE).toFixed(2)}, truck ${(hi[1] * SCALE).toFixed(2)}`);

// ---- what the fleet cannot draw -------------------------------------------------------
// The grille the model drew as one sheet with a see-through texture over it
// (c005_grid_2_alpha), which the fleet's plating has no way to see through
// and would draw as a block of black.
{
  const keep = (t) => !/c005_grid_2_alpha/i.test(j.nodes[model.L[t]].name || '');
  const T2 = [], G2 = [], L2 = [], M2 = [];
  let gone = 0;
  for (let t = 0; t < model.T.length / 3; t++) {
    if (!keep(t)) { gone++; continue; }
    T2.push(model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]);
    G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
  }
  model.T = T2; model.G = G2; model.L = L2; model.M = M2;
  console.log(`grilles: ${gone} faces taken off`);
}

// ---- her shell ------------------------------------------------------------------------
// Her hull plating, side and bottom. Over her waterline the model paints her
// in her dazzle, and she keeps it; under it, a weathered bottom that a vertex
// colour a face can say nothing of on her long plates, so under her waterline
// she is painted one colour, cut straight along it. Her shell is what the
// atlas painted on the pieces that go down under her (her hull), facing out or
// down, and either out at her side or under her waterline.
const SHELL_MAT = model.M[model.L.findIndex((l) => /isb006_cristoforo_colombo_1945_856/.test(j.nodes[l].name))];
const WATERLINE = 0.0;
const deep = new Set();
for (let t = 0; t < model.T.length / 3; t++) {
  if (model.P[model.T[t * 3] * 3 + 1] < -5) deep.add(model.G[t]);
}
// Her half-breadth a metre at a time, over the lower part of her side.
const HB = new Float32Array(Math.ceil(LOA) + 4);
for (let t = 0; t < model.T.length / 3; t++) {
  if (!deep.has(model.G[t])) continue;
  for (let k = 0; k < 3; k++) {
    const v = model.T[t * 3 + k];
    const y = model.P[v * 3 + 1];
    if (y < -3 || y > 5) continue;
    const i = Math.round(model.P[v * 3 + 2] + LOA / 2);
    if (i >= 0 && i < HB.length) HB[i] = Math.max(HB[i], Math.abs(model.P[v * 3]));
  }
}
const hbAt = (z) => HB[Math.max(0, Math.min(HB.length - 1, Math.round(z + LOA / 2)))];
function isShell(t) {
  if (model.M[t] !== SHELL_MAT || !deep.has(model.G[t])) return false;
  const [a, b, c] = [model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]];
  const P = model.P;
  const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
  const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (ny > 0.5 * Math.hypot(nx, ny, nz)) return false;
  const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  // Her stern quarters curve in under her counter, further inboard than her
  // half-breadth there: low on her stern, all of her plating is her side.
  return cy < WATERLINE + 0.5 || Math.abs(cx) > hbAt(cz) - 1.2 || (cz < -0.84 * LOA / 2 && cy < 3);
}
// Cut along her waterline: every shell triangle that crosses it is split, so
// the line runs straight along her and each piece is one paint.
{
  const { P, UV, T } = model;
  const nf = T.length / 3;
  const made = new Map();
  const cross = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (made.has(key)) return made.get(key);
    const s = (WATERLINE - P[a * 3 + 1]) / (P[b * 3 + 1] - P[a * 3 + 1]);
    const w = P.length / 3;
    P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * s, WATERLINE, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * s);
    model.N.push(0, 1, 0);
    UV.push(UV[a * 2] + (UV[b * 2] - UV[a * 2]) * s, UV[a * 2 + 1] + (UV[b * 2 + 1] - UV[a * 2 + 1]) * s);
    made.set(key, w);
    return w;
  };
  let split = 0;
  const T2 = [], G2 = [], L2 = [], M2 = [];
  for (let t = 0; t < nf; t++) {
    const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
    const sd = v.map((i) => Math.sign(P[i * 3 + 1] - WATERLINE));
    if (!isShell(t) || !(sd.includes(1) && sd.includes(-1))) {
      T2.push(...v); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
      continue;
    }
    split++;
    const up = [], down = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      if (sd[k] >= 0) up.push(a);
      if (sd[k] <= 0) down.push(a);
      if (sd[k] * sd[(k + 1) % 3] < 0) { const w = cross(a, b); up.push(w); down.push(w); }
    }
    for (const poly of [up, down]) {
      for (let k = 1; k + 1 < poly.length; k++) {
        T2.push(poly[0], poly[k], poly[k + 1]); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
      }
    }
  }
  model.T = T2; model.G = G2; model.L = L2; model.M = M2;
  console.log(`waterline: ${split} triangles of her shell cut along it`);
}

// Her decks and her sides cut small. The model plates a deck or a side in
// triangles tens of metres long, and the paint a face gets is the mean of
// what its texture holds -- her dazzle's light and dark, her forecastle's red
// and white stripes, or a share of each. Cut to a metre or so, each face is
// painted with what is under it, and her two sides can be matched where the
// paint changes. A face looking at the sky, or any face of her hull and her
// deckhouses, has its longest edge cut in two, and so has every face on that
// edge, until none is bigger than AMAX.
const PAINTED = new Set(model.L.filter((l, i, a) => a.indexOf(l) === i
  && /isb006_cristoforo_colombo_1945_(856|deckhouse)/.test(j.nodes[l].name || '')));
{
  const AMAX = +(process.env.AMAX || 0.4);
  const { P, UV } = model;
  const area = (T, t) => {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    return ny > 0.85 * l || PAINTED.has(model.L[t]) ? l / 2 : 0;
  };
  const len2 = (a, b) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  let made = 0;
  for (let pass = 0; pass < 16; pass++) {
    const T = model.T, nf = T.length / 3;
    const cut = new Map();
    for (let t = 0; t < nf; t++) {
      if (area(T, t) <= AMAX) continue;
      const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
      let e = 0;
      for (let k = 1; k < 3; k++) if (len2(v[k], v[(k + 1) % 3]) > len2(v[e], v[(e + 1) % 3])) e = k;
      cut.set(key(v[e], v[(e + 1) % 3]), -1);
    }
    if (!cut.size) break;
    const mid = (a, b) => {
      const k = key(a, b);
      let w = cut.get(k);
      if (w >= 0) return w;
      w = P.length / 3;
      P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
      model.N.push(0, 1, 0);
      UV.push((UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2);
      cut.set(k, w);
      return w;
    };
    const T2 = [], G2 = [], L2 = [], M2 = [];
    const put = (t, a, b, c) => { T2.push(a, b, c); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]); };
    for (let t = 0; t < nf; t++) {
      const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
      const on = [0, 1, 2].map((k) => cut.has(key(v[k], v[(k + 1) % 3])));
      const n = on.filter(Boolean).length;
      if (!n) { put(t, ...v); continue; }
      // Turned so that the first edge cut is v0-v1.
      let r = on.indexOf(true);
      if (n === 2 && !on[(r + 1) % 3]) r = (r + 2) % 3;
      const [a, b, c] = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
      const ab = mid(a, b);
      if (n === 1) { put(t, a, ab, c); put(t, ab, b, c); } else if (n === 2) {
        const bc = mid(b, c);
        put(t, ab, b, bc); put(t, a, ab, bc); put(t, a, bc, c);
      } else {
        const bc = mid(b, c), ca = mid(c, a);
        put(t, a, ab, ca); put(t, ab, b, bc); put(t, ca, bc, c); put(t, ab, bc, ca);
      }
      made += n;
    }
    model.T = T2; model.G = G2; model.L = L2; model.M = M2;
  }
  console.log(`decks: cut to ${AMAX} m2 a face, ${made} edges halved, ${model.T.length / 3} triangles`);
}
// ---- her paint ------------------------------------------------------------------------
// Every texture decoded once, at no more than 512 pixels a side, blurred a
// little: a vertex colour is the paint of a few square metres of her, not the
// grain of one plank.
const textures = new Map();
async function texture(mi) {
  const mat = j.materials[mi];
  const pbr = (mat && mat.pbrMetallicRoughness) || {};
  if (!pbr.baseColorTexture) return null;
  const ti = pbr.baseColorTexture.index;
  if (!textures.has(ti)) {
    const img = j.images[j.textures[ti].source];
    const meta = await sharp(Buffer.from(model.views[img.bufferView])).metadata();
    const k = Math.min(1, 512 / Math.max(meta.width, meta.height));
    const { data, info } = await sharp(Buffer.from(model.views[img.bufferView]))
      .resize(Math.max(4, Math.round(meta.width * k)), Math.max(4, Math.round(meta.height * k)))
      .blur(1.2).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.set(ti, { data, w: info.width, h: info.height });
  }
  return textures.get(ti);
}
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/** The texture's colour at (u, v), in linear light, bilinear and wrapped. */
function sample(tex, u, v) {
  const x = (((u % 1) + 1) % 1) * tex.w - 0.5, y = (((v % 1) + 1) % 1) * tex.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const px = (xx, yy) => {
    const i = ((((yy % tex.h) + tex.h) % tex.h) * tex.w + (((xx % tex.w) + tex.w) % tex.w)) * 3;
    return [toLin(tex.data[i] / 255), toLin(tex.data[i + 1] / 255), toLin(tex.data[i + 2] / 255)];
  };
  const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
  return [0, 1, 2].map((k) => (a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy);
}
// Its glass: the one see-through material, a dark tinted pane.
const GLASS = [0.02, 0.025, 0.035];
const nTri = model.T.length / 3;
const rgb = new Float32Array(nTri * 3);
for (let t = 0; t < nTri; t++) {
  const mi = model.M[t];
  const mat = j.materials[mi] || {};
  const pbr = mat.pbrMetallicRoughness || {};
  const f = pbr.baseColorFactor || [1, 1, 1, 1];
  let c;
  if (mat.alphaMode === 'BLEND') c = GLASS;
  else {
    const tex = await texture(mi);
    if (!tex) c = [f[0], f[1], f[2]];
    else {
      const [a, b, d] = [model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]];
      const U = model.UV;
      // How many points to average over: one a texel or so of what the
      // triangle covers in the texture, up to a hundred.
      const du = Math.abs((U[b * 2] - U[a * 2]) * (U[d * 2 + 1] - U[a * 2 + 1]) - (U[d * 2] - U[a * 2]) * (U[b * 2 + 1] - U[a * 2 + 1])) * tex.w * tex.h / 2;
      const steps = Math.max(1, Math.min(13, Math.round(Math.sqrt(du) / 4)));
      const acc = [0, 0, 0];
      let n = 0;
      for (let p = 0; p <= steps; p++) {
        for (let q = 0; q <= steps - p; q++) {
          const l1 = (p + 1 / 3) / (steps + 1), l2 = (q + 1 / 3) / (steps + 1), l0 = 1 - l1 - l2;
          const s = sample(tex, U[a * 2] * l0 + U[b * 2] * l1 + U[d * 2] * l2, U[a * 2 + 1] * l0 + U[b * 2 + 1] * l1 + U[d * 2 + 1] * l2);
          acc[0] += s[0]; acc[1] += s[1]; acc[2] += s[2]; n++;
        }
      }
      c = acc.map((v, k) => (v / n) * f[k]);
    }
  }
  rgb[t * 3] = c[0]; rgb[t * 3 + 1] = c[1]; rgb[t * 3 + 2] = c[2];
}
// (Her two sides are not matched one to the other, as the Hagen's are: her
// dazzle was painted differently on each, and that is how she wore it.)
// Her bottom, one paint under her waterline: the mean of what the atlas
// painted there. Over it she keeps her dazzle.
{
  const shell = new Uint8Array(nTri);
  const sum = [0, 0, 0, 0];
  for (let t = 0; t < nTri; t++) {
    if (!isShell(t)) continue;
    let cy = 0;
    for (let k = 0; k < 3; k++) cy += model.P[model.T[t * 3 + k] * 3 + 1] / 3;
    if (cy >= WATERLINE) continue;
    shell[t] = 1;
    const a = triArea(model.P, model.T, t);
    for (let k = 0; k < 3; k++) sum[k] += rgb[t * 3 + k] * a;
    sum[3] += a;
  }
  const paint = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
  for (let t = 0; t < nTri; t++) if (shell[t]) rgb.set(paint, t * 3);
  console.log('bottom paint:', paint.map((v) => Math.round(toSrgb(v) * 255)).join(','));
}
// A part of her painted one colour is one colour: where every face of a piece
// in one material is within a shade of the others, the texture's grain is
// taken off it and the whole piece given their mean. A piece that is two
// paints -- her hull, decks and side and bottom off the one atlas -- keeps
// its faces' own.
{
  const byPiece = new Map();
  for (let t = 0; t < nTri; t++) {
    const k = model.L[t] * 1024 + model.M[t] + 1;
    if (!byPiece.has(k)) byPiece.set(k, []);
    byPiece.get(k).push(t);
  }
  let flat = 0;
  for (const tris of byPiece.values()) {
    const m = [0, 0, 0];
    let w = 0;
    const s = tris.map((t) => [toSrgb(rgb[t * 3]), toSrgb(rgb[t * 3 + 1]), toSrgb(rgb[t * 3 + 2])]);
    tris.forEach((t, i) => { const a = triArea(model.P, model.T, t) + 1e-6; w += a; for (let k = 0; k < 3; k++) m[k] += s[i][k] * a; });
    for (let k = 0; k < 3; k++) m[k] /= w;
    let v = 0;
    tris.forEach((t, i) => { const a = triArea(model.P, model.T, t) + 1e-6; v += a * ((s[i][0] - m[0]) ** 2 + (s[i][1] - m[1]) ** 2 + (s[i][2] - m[2]) ** 2); });
    if (Math.sqrt(v / w) > 0.04) continue;
    for (const t of tris) for (let k = 0; k < 3; k++) rgb[t * 3 + k] = toLin(m[k]);
    flat++;
  }
  console.log(`paint: ${flat} of ${byPiece.size} pieces one colour each`);
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
const PAL = palette(+(process.env.PALETTE || 28));
// Brightened a little: the model was painted to be lit by a renderer's
// floodlight, and under the fleet's sun its grey reads as slate.
const LIFT = +(process.env.LIFT || 1.85);
const PALETTE = PAL.cent.map((c) => c.map((v) => Math.round(toLin(Math.min(1, v * LIFT)) * 255)));
console.log('palette:', PAL.cent.map((c) => c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')).join(' '));

// ---- what is hers and what trains ------------------------------------------------------
// The model draws every gun of a kind in one piece -- all four of her turrets
// in one, all sixteen of her 90 mm twins in another -- and some guns out of
// several: a 135 mm twin is a gunhouse in one piece, its barrels in another,
// its mantlets, its cupola and its aerial in three more. So a mounting is
// found where it stands. The parts of the pieces that draw a kind's gunhouses
// -- each part a run of faces that hang together -- are gathered into
// clusters, a cluster to a mounting, where they lie within `gap` of each
// other; and every part of the pieces that draw what goes on them (barrels,
// mantlets, cupolas) goes to the cluster it is nearest, height counting ten
// times over: a barrel of the superfiring turret runs out over the roof of
// the one before it, and is that turret's, not the one it lies over.
const leavesOf = (re) => {
  const out = new Set();
  j.nodes.forEach((n, i) => { if (n.mesh !== undefined && re.test(n.name || '')) out.add(i); });
  if (!out.size) throw new Error(`no piece of her is ${re}`);
  return out;
};
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
/**
 * Her mountings of a kind, each as the set of her faces that draw it: the
 * parts of the pieces `house` clustered where they lie within `gap` of each
 * other (a negative gap: where they overlap by that much), the clusters of at
 * least `min` faces her mountings, and every other cluster, and every part of
 * the pieces `fit`, that lies within `reach` of one given to the nearest. Bow
 * first.
 */
function mountsOf(kind, { house, fit = null, min = 0, gap = 0.3, reach = 3, count }) {
  const hs = leavesOf(house);
  const all = partsOf(hs);
  let clusters = all.map((p) => ({ tris: [...p.tris], lo: [...p.lo], hi: [...p.hi] }));
  for (let merged = true; merged;) {
    merged = false;
    for (let a = 0; a < clusters.length && !merged; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        if (!near(clusters[a], clusters[b], gap)) continue;
        const A = clusters[a], B = clusters[b];
        A.tris.push(...B.tris);
        for (let c = 0; c < 3; c++) { A.lo[c] = Math.min(A.lo[c], B.lo[c]); A.hi[c] = Math.max(A.hi[c], B.hi[c]); }
        clusters.splice(b, 1);
        merged = true;
        break;
      }
    }
  }
  // What clusters smaller than `min` faces is not a mounting but a part of
  // one: a barrel, a sight.
  const rest = clusters.filter((c) => c.tris.length < min);
  clusters = clusters.filter((c) => c.tris.length >= min);
  if (fit) rest.push(...partsOf(leavesOf(fit)));
  // The parts go to the clusters as the clusters stood, not as they grow.
  const boxes = clusters.map((c) => ({ lo: [...c.lo], hi: [...c.hi] }));
  let left = 0;
  for (const p of rest) {
    let best = -1, bd = Infinity;
    boxes.forEach((b, i) => { const d = boxGap(p, b); if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > reach) { left += p.tris.length; continue; }
    clusters[best].tris.push(...p.tris);
  }
  clusters.sort((a, b) => (b.lo[2] + b.hi[2]) - (a.lo[2] + a.hi[2]) || (a.lo[0] + a.hi[0]) - (b.lo[0] + b.hi[0]));
  if (count && clusters.length !== count) {
    throw new Error(`${kind}: found ${clusters.length} mountings, not ${count}: `
      + clusters.map((c) => `(${((c.lo[0] + c.hi[0]) / 2).toFixed(1)}, ${((c.lo[2] + c.hi[2]) / 2).toFixed(1)})`).join(' '));
  }
  console.log(`${kind}: ${clusters.length} mountings, ${clusters.reduce((s, c) => s + c.tris.length, 0)} faces${left ? `, ${left} left with her` : ''}`);
  return clusters.map((c) => new Set(c.tris));
}
const KINDS = {
  // Her four 457 mm twins: A and B forward, B superfiring, X superfiring
  // over Y aft. The model's gunhouses are its biggest parts.
  main: mountsOf('main', { house: /igm068_381mm_50_quad_otto/, gap: -1, min: 300, reach: 8, count: 4 }),
  // Her eight 135 mm twins, four a side: their gunhouses, their barrels, their
  // mantlets, their cupolas and their aerials.
  sec: mountsOf('sec', {
    house: /midfront_Material #[2-7]_0$/, gap: 0.6,
    fit: /igm051_135_45_oto|AGM077_6in47_MK16|RM304_Shtag_B|RM163_Antenna_UCV/, reach: 3, count: 8,
  }),
  // Her sixteen 90 mm twins, eight a side down her upper deck.
  dp: mountsOf('dp', { house: /igs034_90mm50_barrels_2/, gap: 0.6, fit: /rgs070_130mm_bl_109a|fgm084_138_6mm50_twin/, reach: 1.5, count: 16 }),
  // Her 37 mm Breda twins, on her forecastle and her quarterdeck. (Her other
  // 37 mm and her 20 mm stay with her: the model drew them too small and too
  // tangled into their mountings to be cut free of them.)
  aa: mountsOf('aa', { house: /iga004_breda_37mm_double/, gap: 0.3, count: 6 }),
  // Her four screws.
  screw: mountsOf('screw', { house: /propeller/, gap: 0.3, count: 4 }),
};
const kindOf = new Map();
for (const [k, list] of Object.entries(KINDS)) for (const set of list) for (const t of set) kindOf.set(t, k);

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
function reduce(m, target, error, flags = []) {
  const w = weldPainted(m);
  const ratio = Math.min(1, target / (w.T.length / 3));
  const d = ratio < 1 ? decimateWith(MeshoptSimplifier, w, ratio, error, 0, flags) : w;
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
const hullRaw = subMeshOf((t) => !kindOf.has(t));
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
let hull = creaseNormals(reduce(hullRaw, +(process.env.HULL_TRIS || 115000), +(process.env.HULL_ERROR || 0.002),
  (process.env.HULL_FLAGS ?? 'Prune').split(',').filter(Boolean)));
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

// Her decks: whatever faces the sky and is the colour of her planking -- her
// main deck, which was laid in wood; her superstructure decks were painted
// steel, and are plating.
const isWood = (c) => {
  const [r, g, b] = PAL.cent[c];
  return r > b + 0.06 && r > 0.25 && r - g < 0.08;
};
// And the plates the model drew two-faced are drawn from both sides (2).
const surfaceOf = (t) => {
  const [x, y, z] = faceNormal(hull, hull.T[t * 3], hull.T[t * 3 + 1], hull.T[t * 3 + 2]);
  if (y > 0.85 * Math.hypot(x, y, z) && isWood(hull.C[t])) return 1;
  return hull.S[t] ? 2 : 0;
};

// Her surface, as a height map: what every mounting is seated on.
const HM = { x0: -16, z0: -107, step: 0.5, nx: 65, nz: 429 };
const hm = heightmap(hull, HM);

// Her lines, as the model has them: what her interior and armour are fitted
// under (see measureLines).
const st = stations(hull, { length: LOA, beamCap: 6.0, edgeCap: 12.0, slice: true, beamFloor: -7 });
const LINES = measureLines(hull, st, { z0: -106, dz: 1, nz: 213, y0: -8.5, dy: 0.5, ny: 44 }, 6.4);

const col = new Uint8Array(hull.P.length / 3 * 3);
for (let t = 0; t < hull.T.length / 3; t++) {
  for (let k = 0; k < 3; k++) col.set(PALETTE[hull.C[t]], hull.T[t * 3 + k] * 3);
}
const uv = new Float32Array(hull.P.length / 3 * 2);
const packed = pack(hull, col, uv, { buckets: +(process.env.BUCKETS || 60), length: LOA, surfaceOf, kinds: 3, compact: true });
console.log('packed hull', packed.blob.length, 'bytes in', packed.buckets, 'slices');

// ---- her guns ----------------------------------------------------------------------------
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
 * Its barrels, off its gunhouse. The face of the gunhouse is the furthest
 * forward its full breadth goes; a piece of the model is a barrel if it is
 * narrow, lies along the bore, and runs out past the face.
 */
function splitBarrels(m, guns, minLen, test = null) {
  let wide = 0;
  for (let i = 0; i < m.P.length; i += 3) wide = Math.max(wide, Math.abs(m.P[i]));
  // The face: a metre-by-metre profile of how far across it goes.
  const zs = [];
  for (let i = 2; i < m.P.length; i += 3) zs.push(m.P[i]);
  const zMax = Math.max(...zs), zMin = Math.min(...zs);
  let face = zMin;
  for (let z = zMin; z < zMax; z += 0.1) {
    let w = 0;
    for (let i = 0; i < m.P.length; i += 3) if (Math.abs(m.P[i + 2] - z) < 0.06) w = Math.max(w, Math.abs(m.P[i]));
    if (w > wide * 0.6) face = z;
  }
  // Pieces by the node they came from.
  const pieces = new Map();
  for (let t = 0; t < m.T.length / 3; t++) {
    const lf = m.LF[t];
    if (!pieces.has(lf)) pieces.set(lf, []);
    pieces.get(lf).push(t);
  }
  const isBarrel = new Uint8Array(m.T.length / 3);
  for (const tris of pieces.values()) {
    let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity, py0 = Infinity, py1 = -Infinity;
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const v = m.T[t * 3 + k];
      px0 = Math.min(px0, m.P[v * 3]); px1 = Math.max(px1, m.P[v * 3]);
      py0 = Math.min(py0, m.P[v * 3 + 1]); py1 = Math.max(py1, m.P[v * 3 + 1]);
      pz0 = Math.min(pz0, m.P[v * 3 + 2]); pz1 = Math.max(pz1, m.P[v * 3 + 2]);
    }
    const narrow = px1 - px0 < Math.max(0.9, (wide * 2) / guns * 0.6);
    const along = pz1 - pz0 > (py1 - py0) * 1.5;
    if (process.env.PARTS) console.log(`  part ${tris.length}t x ${px0.toFixed(2)}..${px1.toFixed(2)} y ${py0.toFixed(2)}..${py1.toFixed(2)} z ${pz0.toFixed(2)}..${pz1.toFixed(2)} (face ${face.toFixed(2)})`);
    const is = test ? test({ px0, px1, py0, py1, pz0, pz1, face })
      : narrow && ((pz1 > face + minLen && along) || pz0 > face - 0.05);
    if (is) for (const t of tris) isBarrel[t] = 1;
  }
  const part = (want) => {
    const map = new Map();
    const P = [], T = [], C = [];
    for (let t = 0; t < m.T.length / 3; t++) {
      if (isBarrel[t] !== want) continue;
      for (let k = 0; k < 3; k++) {
        const v = m.T[t * 3 + k];
        let w = map.get(v);
        if (w === undefined) { w = P.length / 3; map.set(v, w); P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); }
        T.push(w);
      }
      C.push(m.C[t]);
    }
    return { P, T, C };
  };
  return { house: part(0), barrels: part(1), face };
}

/**
 * The barrels' bores: each barrel's points, grouped across it, and a line
 * fitted up the middle of them -- how far up it runs and at what elevation --
 * and where its muzzle is.
 */
function boresOf(bar, guns, face) {
  const xs = [];
  for (let i = 0; i < bar.P.length; i += 3) if (bar.P[i + 2] > face + 0.5) xs.push(bar.P[i]);
  xs.sort((a, b) => a - b);
  // Split across the bore into `guns` runs at the widest gaps.
  const gaps = [];
  for (let i = 1; i < xs.length; i++) gaps.push([xs[i] - xs[i - 1], (xs[i] + xs[i - 1]) / 2]);
  const cuts = gaps.sort((a, b) => b[0] - a[0]).slice(0, guns - 1).map((g) => g[1]).sort((a, b) => a - b);
  const laneOf = (x) => cuts.filter((c) => x > c).length;
  const lanes = [...Array(guns)].map(() => ({ sz: 0, sy: 0, szz: 0, szy: 0, n: 0, sx: 0, tip: -Infinity }));
  for (let i = 0; i < bar.P.length; i += 3) {
    const x = bar.P[i], y = bar.P[i + 1], z = bar.P[i + 2];
    if (z < face + 0.3) continue;
    const l = lanes[laneOf(x)];
    l.sz += z; l.sy += y; l.szz += z * z; l.szy += z * y; l.n++; l.sx += x; l.tip = Math.max(l.tip, z);
  }
  const fits = lanes.map((l) => {
    const slope = (l.n * l.szy - l.sz * l.sy) / (l.n * l.szz - l.sz * l.sz);
    const icpt = (l.sy - slope * l.sz) / l.n;
    return { x: l.sx / l.n, slope, yAt: (z) => icpt + slope * z, tip: l.tip };
  });
  const slope = fits.reduce((s, f) => s + f.slope, 0) / guns;
  return { fits, pitch: Math.atan(slope) };
}

/**
 * One of each kind, in the frame of its mounting: the gunhouse, and the
 * barrels on their cradle -- the trunnions just inside the face, the bore
 * along +Z -- with their muzzles. Painted as the model painted it.
 */
function gunKind(kind, { guns, minLen, tris, barrelTris, inside = 0.6, test = null, barrelPaint = null }) {
  const g0 = KINDS[kind][0];
  const raw = groupMesh(g0);
  const s = seatOf(raw);
  const local = toMount(raw, s);
  const { house, barrels, face } = splitBarrels({ ...local, LF: raw.LF }, guns, minLen, test);
  const { fits, pitch } = boresOf(barrels, guns, face);
  const tz = face - inside;
  const ty = fits.reduce((a, f) => a + f.yAt(tz), 0) / guns;
  const trunnion = [0, ty, tz];
  // The barrels about their trunnions, turned down level: the cradle lays
  // them back at their elevation.
  const c = Math.cos(pitch), sn = Math.sin(pitch);
  const level = (x, y, z) => {
    const dy = y - ty, dz = z - tz;
    return [x, dy * c - dz * sn, dy * sn + dz * c];
  };
  const bp = barrels.P.slice();
  for (let i = 0; i < bp.length; i += 3) {
    const [x, y, z] = level(bp[i], bp[i + 1], bp[i + 2]);
    bp[i] = x; bp[i + 1] = y; bp[i + 2] = z;
  }
  const muzzles = fits.map((f) => level(f.x, f.yAt(f.tip), f.tip).map((v) => +v.toFixed(3)));
  const hd = creaseNormals(reduce(house, tris, 0.003));
  // Barrels the atlas paints off a patch of some other colour are given the
  // one they were: `barrelPaint`, the palette's nearest to it.
  const nearest = (c) => PAL.cent.reduce((b, q, i) => (Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])
    < Math.hypot(PAL.cent[b][0] - c[0], PAL.cent[b][1] - c[1], PAL.cent[b][2] - c[2]) ? i : b), 0);
  const bc = barrelPaint ? barrels.C.map(() => nearest(barrelPaint)) : barrels.C;
  const bd = creaseNormals(reduce({ P: bp, T: barrels.T, C: bc }, barrelTris, 0.002));
  let roof = 0;
  for (let i = 1; i < hd.P.length; i += 3) roof = Math.max(roof, hd.P[i]);
  const paintOf = (m) => {
    const byV = new Uint8Array(m.P.length / 3);
    for (let t = 0; t < m.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[m.T[t * 3 + k]] = m.C[t];
    return (i) => PALETTE[byV[i]];
  };
  console.log(`${kind}: gunhouse ${hd.T.length / 3} triangles, barrels ${bd.T.length / 3}; face ${face.toFixed(2)}, `
    + `trunnion ${trunnion.map((v) => v.toFixed(2)).join('/')}, stowed at ${(pitch * 180 / Math.PI).toFixed(1)} deg, `
    + `muzzles ${muzzles.map((m) => m.join(',')).join(' ')}, roof ${roof.toFixed(2)}`);
  DEBUG[kind] = { hd, bd, trunnion, pitch };
  return {
    house: packPieceCompact(hd, paintOf(hd)).toString('base64'),
    guns: packPieceCompact(bd, paintOf(bd)).toString('base64'),
    trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +pitch.toFixed(4), roof: +roof.toFixed(3),
  };
}

const DEBUG = {};
const GUNS = {
  main: gunKind('main', { guns: 2, minLen: 2, tris: 4000, barrelTris: 800 }),
  sec: gunKind('sec', { guns: 2, minLen: 1.0, tris: 2000, barrelTris: 400 }),
  dp: gunKind('dp', { guns: 2, minLen: 0.8, tris: 1200, barrelTris: 300, barrelPaint: [0.13, 0.13, 0.14] }),
  aa: gunKind('aa', { guns: 2, minLen: 0.5, tris: 900, barrelTris: 200, inside: 0.3 }),
};

/**
 * Every mounting of a kind where it stands: its pivot, its seat, which way it
 * faces, and -- for the simulation -- how far its muzzles stand out from its
 * pivot and how high they are, stowed.
 */
function seats(kind) {
  const g = GUNS[kind];
  return KINDS[kind].map((gi) => {
    const s = seatOf(groupMesh(gi));
    const c = Math.cos(g.pitch), sn = Math.sin(g.pitch);
    const out = g.muzzles.map(([x, y, z]) => {
      // Back up off the level the cradle frame has them in.
      const yy = y * c + z * sn + g.trunnion[1], zz = -y * sn + z * c + g.trunnion[2];
      return [Math.hypot(x, zz), yy];
    });
    const reach = out.reduce((a, o) => a + o[0], 0) / out.length;
    const my = out.reduce((a, o) => a + o[1], 0) / out.length + s.y;
    return { x: +s.x.toFixed(3), z: +s.z.toFixed(3), y: +s.y.toFixed(3), rest: +s.rest.toFixed(4), reach: +reach.toFixed(2), my: +my.toFixed(2) };
  });
}
const MOUNTS = Object.fromEntries(Object.keys(GUNS).map((k) => [k, seats(k)]));
for (const [k, list] of Object.entries(MOUNTS)) {
  console.log(k, list.map((s) => `(${s.x}, ${s.z}) y ${s.y} rest ${(s.rest * 180 / Math.PI).toFixed(0)} reach ${s.reach} my ${s.my}`).join('\n   '));
}
// ---- her screws -------------------------------------------------------------------------
// Each as the model drew it, about its own hub: the middle of its blades.
const SCREWS = KINDS.screw.map((gi) => {
  const raw = groupMesh(gi);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < raw.P.length; i += 3) {
    x0 = Math.min(x0, raw.P[i]); x1 = Math.max(x1, raw.P[i]);
    y0 = Math.min(y0, raw.P[i + 1]); y1 = Math.max(y1, raw.P[i + 1]);
    z0 = Math.min(z0, raw.P[i + 2]); z1 = Math.max(z1, raw.P[i + 2]);
  }
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const P = raw.P.slice();
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) P[i + k] -= c[k];
  const m = creaseNormals(reduce({ P, T: raw.T, C: raw.C }, 400, 0.001));
  const byV = new Uint8Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[m.T[t * 3 + k]] = m.C[t];
  return {
    x: +c[0].toFixed(3), y: +c[1].toFixed(3), z: +c[2].toFixed(3), r: +(Math.max(x1 - x0, y1 - y0) / 2).toFixed(2),
    piece: packPieceCompact(m, (i) => PALETTE[byV[i]]).toString('base64'),
  };
});
console.log('screws:', SCREWS.map((s) => `(${s.x}, ${s.y}, ${s.z}) r ${s.r}`).join(' '));

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
    const d = DEBUG[kind];
    for (const s of list) {
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
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-morosini-hull.mjs from the owner's model.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const MOROSINI_HULL_B64 = ${JSON.stringify(packed.blob.toString('base64'))};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see morosiniSurfaceY.\n`
  + `export const MOROSINI_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// One of each of her guns as the model drew it, each in the frame of its own\n`
  + `// mounting: the gunhouse, and the barrels about their trunnions.\n`
  + `export const MOROSINI_GUNS = ${JSON.stringify(GUNS)};\n`
  + `// Where every one of her mountings stands, which way it faces, and its\n`
  + `// muzzles' reach and height stowed.\n`
  + `export const MOROSINI_MOUNTS = ${JSON.stringify(MOUNTS)};\n`
  + `// Her four screws, each about its hub.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the model has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const MOROSINI_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', path.relative(ROOT, OUT_DATA), `${(readFileSync(OUT_DATA).length / 1e6).toFixed(2)} MB`);
