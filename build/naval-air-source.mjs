// The Nimitz's three aircraft, from the glbs the owner uploaded to the pieces
// the game flies.
//
//   node build/naval-air-source.mjs f18|e2d|sh60   ->  client/js/render/<kind>Model.data.js
//
// Wants the decimator and the image decoder (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22 sharp
//
// Each is a Sketchfab export, credited on the game's Credits screen, under
// Creative Commons Attribution 4.0:
//
//   f18   "McDonnell Douglas F/A-18C Hornet" by Rhine_Lab_Muelsyse
//         (https://skfb.ly/puTvR) -- assets/models/mcdonnell_douglas_fa-18c_hornet.glb
//   e2d   "Grumman E-2D Advanced Hawkeye" by Muhamad Mirza Arrafi
//         (https://skfb.ly/pHKou) -- assets/models/grumman_e-2d_advanced_hawkeye-maximum-compressed.glb
//   sh60  "SH-60B Seahawk Helicopter" by Muhamad Mirza Arrafi
//         (https://skfb.ly/p96qS) -- assets/models/sh-60b_seahawk_helicopter-maximum-compressed.glb
//
// What comes out, in her own frame -- nose +z, up +y, wheels on y = 0, put to
// her real length -- each piece painted at every point off the model's own
// textures:
//   body    her airframe
//   glass   her canopy, where the model draws it see-through
//   gear    her legs and wheels, which come up into her (the F/A-18's and
//           the Hawkeye's; a Seahawk's stay down)
//   spin    what turns, each about its own hub: the Hawkeye's two airscrews
//           and her rotodome, the Seahawk's main and tail rotors
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPieceCompact } from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;

const hyp = Math.hypot;
/**
 * Each of the three: her glb, her real length over all (nose to tail, rotors
 * folded away for the Seahawk: her fuselage), which way the model's nose
 * points, and the piece each face of the model goes to -- by the node it
 * came from where the model names its parts, and otherwise by where it is.
 */
const KINDS = {
  f18: {
    src: 'mcdonnell_douglas_fa-18c_hornet.glb', length: 17.07, keep: 0.85,
    // A Navy Hornet in the light gull grey over white she wore.
    piece: ({ node, mat }) => {
      if (mat === 1) return 'glass';
      if (/^(gear_|nose_gear)/.test(node)) return 'gear';
      return 'body';
    },
    spins: [],
  },
  e2d: {
    src: 'grumman_e-2d_advanced_hawkeye-maximum-compressed.glb', length: 17.6, keep: 0.28,
    piece: ({ c, mat }) => {
      const [x, y, z] = c;
      if (mat === 3) return 'glass';
      // Her two eight-bladed airscrews, on the fronts of her nacelles.
      if (z > 11.7 && z < 19.2 && hyp(Math.abs(x) - 17.69, y - 5.1) < 11) return x > 0 ? 'spin0' : 'spin1';
      // Her rotodome, on its two struts over her back.
      if (y > 16.1 && Math.abs(x) < 21 && z > -36 && z < 5.5) return 'spin2';
      // Her main legs under her nacelles, and her nose leg.
      if (Math.abs(x) > 14.5 && Math.abs(x) < 21 && y < -5.5 && z > -9 && z < -2) return 'gear';
      if (Math.abs(x) < 2.7 && y < -6 && z > 24 && z < 36.5) return 'gear';
      return 'body';
    },
    // Airscrews turn about the fore-and-aft (z); the dome about the vertical (y).
    spins: [
      { name: 'prop0', hub: [17.69, 5.1, 15], axis: 'z' },
      { name: 'prop1', hub: [-17.69, 5.1, 15], axis: 'z' },
      { name: 'dome', hub: [0, 18.4, -15.13], axis: 'y' },
    ],
  },
  sh60: {
    src: 'sh-60b_seahawk_helicopter-maximum-compressed.glb', length: 15.26, keep: 0.4,
    // Her length is her fuselage's, nose to tail rotor, not her rotor's sweep.
    lengthOf: 'body',
    piece: ({ c }) => {
      const [x, y, z] = c;
      if (x > 25 && z < -780 && hyp(y - 446, z + 895) < 200) return 'spin1';
      if (y > 395 && z > -600) return 'spin0';
      return 'body';
    },
    spins: [
      { name: 'rotor', hub: [2.3, 444, 264], axis: 'y' },
      { name: 'tail', hub: [34, 446, -895], axis: 'x' },
    ],
  },
};
const KIND = process.argv[2];
const K = KINDS[KIND];
if (!K) throw new Error(`which aircraft? ${Object.keys(KINDS).join(', ')}`);
const SRC = path.join(ROOT, 'assets/models', K.src);
const OUT = path.join(ROOT, `client/js/render/${KIND}Model.data.js`);

// ---- the glb, flattened -------------------------------------------------
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
function flatten(buf) {
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  const views = j.bufferViews.map((v) => {
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!e) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride,
      bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), e.mode, e.filter);
    return Buffer.from(out.buffer);
  });
  const TYPE = {
    5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767],
    5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 1], 5126: ['getFloat32', 4, 1],
  };
  const acc = (i) => {
    const a = j.accessors[i];
    const v = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const [get, size, max] = TYPE[a.componentType];
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
  const P = [], UV = [], T = [], M = [], L = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const w = mul(parent, compose(n));
    if (n.mesh !== undefined) {
      const det = w[0] * (w[5] * w[10] - w[6] * w[9]) - w[4] * (w[1] * w[10] - w[2] * w[9])
        + w[8] * (w[1] * w[6] - w[2] * w[5]);
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = acc(prim.attributes.POSITION);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13],
            w[2] * x + w[6] * y + w[10] * z + w[14]);
          if (uv) UV.push(uv.out[k * 2], uv.out[k * 2 + 1]); else UV.push(0, 0);
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          if (det < 0) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          M.push(prim.material ?? -1);
          // The part the model names: the node's own name, or its parent's
          // where the mesh hangs off a node of the part's name.
          L.push(ni);
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, UV, T, M, L, j, views };
}
const model = flatten(readFileSync(SRC));
const { j, P, UV } = model;
const parentOf = new Map();
j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const nameOf = (ni) => (j.nodes[parentOf.get(ni)] || {}).name || j.nodes[ni].name || '';

// ---- sort every face into the piece it belongs to -------------------------
const nt = model.T.length / 3;
const PIECE = new Array(nt);
for (let t = 0; t < nt; t++) {
  const c = [0, 1, 2].map((k) => (P[model.T[t * 3] * 3 + k] + P[model.T[t * 3 + 1] * 3 + k] + P[model.T[t * 3 + 2] * 3 + k]) / 3);
  PIECE[t] = K.piece({ c, mat: model.M[t], node: nameOf(model.L[t]) });
}

// ---- her frame ------------------------------------------------------------
// Nose along +z: whichever end of her her canopy (or, lacking glass, the
// forward of her two ends by where most of her is) is nearer.
const box = (pick) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < nt; t++) {
    if (!pick(t)) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[v * 3 + c]); hi[c] = Math.max(hi[c], P[v * 3 + c]); }
    }
  }
  return [lo, hi];
};
const [alo, ahi] = box(() => true);
const [llo, lhi] = K.lengthOf ? box((t) => PIECE[t] === K.lengthOf) : [alo, ahi];
const S = K.length / (lhi[2] - llo[2]);
// Centred on her length and across her; her wheels (her lowest point) on y = 0.
const ORIGIN = [(alo[0] + ahi[0]) / 2, alo[1], (llo[2] + lhi[2]) / 2];
const toHer = (x, y, z) => [(x - ORIGIN[0]) * S, (y - ORIGIN[1]) * S, (z - ORIGIN[2]) * S];
console.log(`${KIND}: ${nt} faces, x${S.toFixed(5)}, ${((ahi[0] - alo[0]) * S).toFixed(2)} m across, ${((ahi[1] - alo[1]) * S).toFixed(2)} m high`);

// ---- her paint ------------------------------------------------------------
const tex = new Map();
async function texture(mi) {
  if (tex.has(mi)) return tex.get(mi);
  const mat = j.materials[mi] || {};
  const pbr = mat.pbrMetallicRoughness || {};
  const sg = (mat.extensions && mat.extensions.KHR_materials_pbrSpecularGlossiness) || {};
  const tx = sg.diffuseTexture || pbr.baseColorTexture;
  let t = null;
  if (tx) {
    const img = j.images[j.textures[tx.index].source];
    const s = sharp(Buffer.from(model.views[img.bufferView]));
    const meta = await s.metadata();
    const w = Math.min(1024, meta.width), h = Math.min(1024, meta.height);
    const { data, info } = await s.resize(w, h).blur(0.8).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    t = { data, w: info.width, h: info.height };
  }
  const f = sg.diffuseFactor || pbr.baseColorFactor || [1, 1, 1, 1];
  tex.set(mi, { t, f });
  return tex.get(mi);
}
async function colourOf(v, mi) {
  const { t, f } = await texture(mi);
  if (!t) return [f[0], f[1], f[2]];
  const u = ((UV[v * 2] % 1) + 1) % 1, w = ((UV[v * 2 + 1] % 1) + 1) % 1;
  const x = Math.min(t.w - 1, Math.floor(u * t.w)), y = Math.min(t.h - 1, Math.floor(w * t.h));
  const o = (y * t.w + x) * 3;
  return [t.data[o] / 255 * f[0], t.data[o + 1] / 255 * f[1], t.data[o + 2] / 255 * f[2]];
}

/**
 * One piece: its faces, each point coloured, points that are the same point
 * welded, decimated to `keep` of its faces, in her frame and moved so `about`
 * (in her frame) is its origin.
 */
async function piece(which, keep, about = [0, 0, 0]) {
  const key = new Map();
  const pos = [], col = [], cn = [], idx = [];
  for (let t = 0; t < nt; t++) {
    if (PIECE[t] !== which) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const c = await colourOf(v, model.M[t]);
      const p = toHer(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      const id = p.map((x) => Math.round(x * 1e4)).join(',');
      let n = key.get(id);
      if (n === undefined) {
        n = pos.length / 3;
        key.set(id, n);
        pos.push(p[0] - about[0], p[1] - about[1], p[2] - about[2]);
        col.push(0, 0, 0);
        cn.push(0);
      }
      col[n * 3] += c[0]; col[n * 3 + 1] += c[1]; col[n * 3 + 2] += c[2]; cn[n]++;
      idx.push(n);
    }
  }
  for (let i = 0; i < cn.length; i++) for (let c = 0; c < 3; c++) col[i * 3 + c] /= cn[i];
  let out = Uint32Array.from(idx);
  if (keep < 1 && idx.length) {
    const attr = Float32Array.from(col);
    const target = Math.floor((idx.length / 3) * keep) * 3;
    [out] = MeshoptSimplifier.simplifyWithAttributes(out, Float32Array.from(pos), 3, attr, 3,
      [0.6, 0.6, 0.6], null, target, 0.02, []);
  }
  const m = creased(pos, col, out);
  console.log(`  ${which}: ${idx.length / 3} -> ${m.T.length / 3} faces`);
  return m;
}

/** Normals that keep a crease sharper than fifty degrees, and are smooth across anything gentler. */
const CREASE = Math.cos((50 * Math.PI) / 180);
function creased(pos, col, idx) {
  const nf = idx.length / 3;
  const fn = new Float64Array(nf * 3);
  const round = new Map();
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[f * 3] = uy * vz - uz * vy; fn[f * 3 + 1] = uz * vx - ux * vz; fn[f * 3 + 2] = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      let r = round.get(v);
      if (!r) round.set(v, r = []);
      r.push(f);
    }
  }
  const unit = (f) => {
    const l = hyp(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]) || 1;
    return [fn[f * 3] / l, fn[f * 3 + 1] / l, fn[f * 3 + 2] / l];
  };
  const m = { P: [], N: [], C: [], T: [] };
  const made = new Map();
  for (let f = 0; f < nf; f++) {
    const me = unit(f);
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      let nx = 0, ny = 0, nz = 0;
      for (const g of round.get(v)) {
        const u = unit(g);
        if (u[0] * me[0] + u[1] * me[1] + u[2] * me[2] < CREASE) continue;
        nx += fn[g * 3]; ny += fn[g * 3 + 1]; nz += fn[g * 3 + 2];
      }
      const l = hyp(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const key = `${v},${Math.round(nx * 20)},${Math.round(ny * 20)},${Math.round(nz * 20)}`;
      let n = made.get(key);
      if (n === undefined) {
        n = m.P.length / 3;
        made.set(key, n);
        m.P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        m.N.push(nx, ny, nz);
        m.C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      }
      m.T.push(n);
    }
  }
  return m;
}

const toByte = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
const packed = (m) => packPieceCompact(m, (i) => [toByte(m.C[i * 3]), toByte(m.C[i * 3 + 1]), toByte(m.C[i * 3 + 2])]).toString('base64');
const extent = (m) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.P.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], m.P[i + c]); hi[c] = Math.max(hi[c], m.P[i + c]); }
  return [lo, hi];
};

console.log('pieces:');
const PIECES = {};
const DUMPS = {};
const body = await piece('body', K.keep);
DUMPS.body = { m: body };
PIECES.body = packed(body);
if (PIECE.includes('glass')) { const m = await piece('glass', 0.8); DUMPS.glass = { m }; PIECES.glass = packed(m); }
if (PIECE.includes('gear')) { const m = await piece('gear', Math.min(1, K.keep * 1.4)); DUMPS.gear = { m }; PIECES.gear = packed(m); }
const SPINS = [];
for (let i = 0; i < K.spins.length; i++) {
  const s = K.spins[i];
  const hub = toHer(...s.hub);
  const m = await piece(`spin${i}`, Math.min(1, K.keep * 1.5), hub);
  let r = 0;
  for (let q = 0; q < m.P.length; q += 3) {
    const [x, y, z] = [m.P[q], m.P[q + 1], m.P[q + 2]];
    r = Math.max(r, s.axis === 'y' ? hyp(x, z) : s.axis === 'x' ? hyp(y, z) : hyp(x, y));
  }
  PIECES[s.name] = packed(m);
  DUMPS[s.name] = { m, at: hub };
  SPINS.push({ name: s.name, hub: hub.map((v) => +v.toFixed(3)), axis: s.axis, r: +r.toFixed(2) });
}
const [blo, bhi] = extent(body);
const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
const META = {
  span: +(bhi[0] - blo[0]).toFixed(2),
  length: +(bhi[2] - blo[2]).toFixed(2),
  height: +(bhi[1] - blo[1]).toFixed(2),
  spins: SPINS,
  // Where her contrails come off her: her wingtips, aft.
  tips: [[r3([blo[0] + 0.3, (blo[1] + bhi[1]) / 2, 0])[0], +((blo[1] + bhi[1]) / 2).toFixed(2), 0],
    [r3([bhi[0] - 0.3])[0], +((blo[1] + bhi[1]) / 2).toFixed(2), 0]],
  // What she fires forward from: her nose.
  guns: [[0, +((blo[1] + bhi[1]) / 2).toFixed(2), +(bhi[2] - 0.4).toFixed(2)]],
};
const NAME = KIND.toUpperCase();
const lines = [
  `// Generated by build/naval-air-source.mjs from ${K.src}.`,
  '// Do not hand-edit -- regenerate from the source asset instead.',
  `export const ${NAME}_PIECES = ${JSON.stringify(PIECES)};`,
  `export const ${NAME}_META = ${JSON.stringify(META)};`,
  '',
];
writeFileSync(OUT, lines.join('\n'));
// DUMP=file.glb: every piece, in place, as one coloured mesh to look at.
if (process.env.DUMP) {
  const Pd = [], Nd = [], Cd = [], Td = [];
  const add = (m, at = [0, 0, 0]) => {
    const base = Pd.length / 3;
    for (let i = 0; i < m.P.length; i += 3) { Pd.push(m.P[i] + at[0], m.P[i + 1] + at[1], m.P[i + 2] + at[2]); Nd.push(m.N[i], m.N[i + 1], m.N[i + 2]); Cd.push(m.C[i], m.C[i + 1], m.C[i + 2]); }
    for (const v of m.T) Td.push(base + v);
  };
  for (const [k, m] of Object.entries(DUMPS)) add(m.m, m.at);
  const f32 = (a) => Buffer.from(Float32Array.from(a).buffer);
  const bufs = [f32(Pd), f32(Nd), f32(Cd), Buffer.from(Uint32Array.from(Td).buffer)];
  let off = 0;
  const views = bufs.map((b) => { const v = { buffer: 0, byteOffset: off, byteLength: b.length }; off += b.length; return v; });
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < Pd.length; i++) { mn[i % 3] = Math.min(mn[i % 3], Pd[i]); mx[i % 3] = Math.max(mx[i % 3], Pd[i]); }
  const js = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 }, doubleSided: true }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: Pd.length / 3, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: Pd.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: Pd.length / 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5125, count: Td.length, type: 'SCALAR' }] }));
  const jsPad = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bodyB = Buffer.concat(bufs);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsPad.length + 8 + bodyB.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(jsPad.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bodyB.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(process.env.DUMP, Buffer.concat([head, c1, jsPad, c2, bodyB]));
}
console.log(`wrote ${path.relative(ROOT, OUT)}: ${(lines.join('\n').length / 1024).toFixed(0)} KB`, JSON.stringify(META));
