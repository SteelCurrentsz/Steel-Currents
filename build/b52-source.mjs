// The owner's B-52H, from the glb it came as to the pieces the game flies.
//
//   node build/b52-source.mjs [model.glb]   ->  client/js/render/b52Model.data.js
//
// Wants the decimator and the image decoder (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22 sharp
//
// Reads assets/models/boeing_b-52_stratofortress.glb as the owner uploaded it:
// "Boeing B-52 Stratofortress" by bohmerang (https://skfb.ly/oLo8p), under
// Creative Commons Attribution 4.0 -- credited on the game's Credits screen.
// A Sketchfab export in metres, up +Y, but with her nose along -Z: she is
// turned round here so her nose is along +Z, the game's own frame.
//
// What comes out:
//   body   her airframe, painted: every texture sampled at every point
//   glass  her cockpit glazing
//
// The game hangs her twelve external cruise missiles on their two pylons and
// turns her rotary launcher itself (see b52Model.js): the model has neither.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPieceCompact } from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptSimplifier } = require('meshoptimizer');
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;

const SRC = process.argv[2] || path.join(ROOT, 'assets/models/boeing_b-52_stratofortress.glb');
const OUT = path.join(ROOT, 'client/js/render/b52Model.data.js');

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

/** Every triangle of the model where it is: points, normals, uvs, and a material a face. */
function flatten(buf) {
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  const views = j.bufferViews.map((v) => bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
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
    const stride = v.byteStride || n * size;
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
  const P = [], N = [], UV = [], T = [], M = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const w = mul(parent, compose(n));
    if (n.mesh !== undefined) {
      const det = w[0] * (w[5] * w[10] - w[6] * w[9]) - w[4] * (w[1] * w[10] - w[2] * w[9])
        + w[8] * (w[1] * w[6] - w[2] * w[5]);
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = acc(prim.attributes.POSITION);
        const nor = prim.attributes.NORMAL !== undefined ? acc(prim.attributes.NORMAL) : null;
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13],
            w[2] * x + w[6] * y + w[10] * z + w[14]);
          if (nor) {
            const a = nor.out[k * nor.n], b = nor.out[k * nor.n + 1], c = nor.out[k * nor.n + 2];
            const nx = w[0] * a + w[4] * b + w[8] * c, ny = w[1] * a + w[5] * b + w[9] * c, nz = w[2] * a + w[6] * b + w[10] * c;
            const l = Math.hypot(nx, ny, nz) || 1;
            N.push(nx / l, ny / l, nz / l);
          } else N.push(0, 1, 0);
          if (uv) UV.push(uv.out[k * 2], uv.out[k * 2 + 1]); else UV.push(0, 0);
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          if (det < 0) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          M.push(prim.material ?? -1);
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  // Turned half round about her vertical, so her nose is along +Z.
  const TURN = Float64Array.from([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, TURN);
  return { P, N, UV, T, M, j, views };
}

const model = flatten(readFileSync(SRC));
const { P, N, UV, j } = model;
console.log(`model: ${model.T.length / 3} triangles, ${P.length / 3} points`);
const GLASS_MAT = j.materials.findIndex((m) => m.name === 'Glass');

const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < P.length / 3; i++) for (let c = 0; c < 3; c++) {
  lo[c] = Math.min(lo[c], P[i * 3 + c]); hi[c] = Math.max(hi[c], P[i * 3 + c]);
}
console.log('extent', lo.map((v) => v.toFixed(2)), hi.map((v) => v.toFixed(2)));
// Her middle, along her and across her: what the game measures her from.
const MID = [0, 0, (lo[2] + hi[2]) / 2];

const BODY = 0, GLASS = 1;
const PIECE = new Int8Array(model.T.length / 3);
for (let t = 0; t < model.T.length / 3; t++) PIECE[t] = model.M[t] === GLASS_MAT ? GLASS : BODY;

// ---- her paint ------------------------------------------------------------
const tex = new Map();
async function texture(mi) {
  if (tex.has(mi)) return tex.get(mi);
  const mat = j.materials[mi] || {};
  const pbr = mat.pbrMetallicRoughness || {};
  let t = null;
  if (pbr.baseColorTexture) {
    const img = j.images[j.textures[pbr.baseColorTexture.index].source];
    const s = sharp(Buffer.from(model.views[img.bufferView]));
    const meta = await s.metadata();
    const w = Math.min(1024, meta.width), h = Math.min(1024, meta.height);
    const { data, info } = await s.resize(w, h).blur(0.8).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    t = { data, w: info.width, h: info.height };
  }
  const f = pbr.baseColorFactor || [1, 1, 1, 1];
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
    const l = Math.hypot(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]) || 1;
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
      const l = Math.hypot(nx, ny, nz) || 1;
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

async function piece(which, keep) {
  const key = new Map();
  const pos = [], nrm = [], col = [], cn = [], idx = [];
  for (let t = 0; t < model.T.length / 3; t++) {
    if (PIECE[t] !== which) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const c = await colourOf(v, model.M[t]);
      const q = (x) => Math.round(x * 1e4);
      const id = [q(P[v * 3]), q(P[v * 3 + 1]), q(P[v * 3 + 2])].join(',');
      let n = key.get(id);
      if (n === undefined) {
        n = pos.length / 3;
        key.set(id, n);
        pos.push(P[v * 3] - MID[0], P[v * 3 + 1] - MID[1], P[v * 3 + 2] - MID[2]);
        nrm.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        col.push(0, 0, 0);
        cn.push(0);
      }
      col[n * 3] += c[0]; col[n * 3 + 1] += c[1]; col[n * 3 + 2] += c[2]; cn[n]++;
      idx.push(n);
    }
  }
  for (let i = 0; i < cn.length; i++) for (let c = 0; c < 3; c++) col[i * 3 + c] /= cn[i];
  const nt = idx.length / 3;
  let out = Uint32Array.from(idx);
  if (keep < 1) {
    const attr = new Float32Array((pos.length / 3) * 6);
    for (let i = 0; i < pos.length / 3; i++) {
      attr.set([nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], col[i * 3], col[i * 3 + 1], col[i * 3 + 2]], i * 6);
    }
    const target = Math.floor(nt * keep) * 3;
    [out] = MeshoptSimplifier.simplifyWithAttributes(out, Float32Array.from(pos), 3, attr, 6,
      [0.05, 0.05, 0.05, 0.6, 0.6, 0.6], null, target, 0.02, []);
  }
  const m = creased(pos, col, out);
  console.log(`  ${['body', 'glass'][which]}: ${nt} -> ${m.T.length / 3} faces, ${m.P.length / 3} points`);
  return m;
}

function chunks(m, max = 60000) {
  if (m.P.length / 3 < max) return [m];
  const out = [];
  const nt = m.T.length / 3;
  const order = [...Array(nt).keys()].sort((a, b) => m.P[m.T[a * 3] * 3 + 2] - m.P[m.T[b * 3] * 3 + 2]);
  let cur = null, map = null;
  for (const t of order) {
    if (!cur || cur.P.length / 3 > max - 3) { cur = { P: [], N: [], C: [], T: [] }; map = new Map(); out.push(cur); }
    for (let k = 0; k < 3; k++) {
      const v = m.T[t * 3 + k];
      let n = map.get(v);
      if (n === undefined) {
        n = cur.P.length / 3; map.set(v, n);
        cur.P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]);
        cur.N.push(m.N[v * 3], m.N[v * 3 + 1], m.N[v * 3 + 2]);
        cur.C.push(m.C[v * 3], m.C[v * 3 + 1], m.C[v * 3 + 2]);
      }
      cur.T.push(n);
    }
  }
  return out;
}

const toByte = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
const packed = (m) => packPieceCompact(m, (i) => [toByte(m.C[i * 3]), toByte(m.C[i * 3 + 1]), toByte(m.C[i * 3 + 2])]).toString('base64');

console.log('pieces:');
const body = chunks(await piece(BODY, +(process.env.KEEP || 0.6)));
const glass = await piece(GLASS, 1);

const META = {
  span: +(hi[0] - lo[0]).toFixed(2),
  length: +(hi[2] - lo[2]).toFixed(2),
  // How far down her belly goes and where her wing is: what the game hangs
  // her pylons and her rotary launcher off.
  belly: +(lo[1] - MID[1]).toFixed(3),
};

const lines = [
  '// Generated by build/b52-source.mjs from the owner\'s Boeing B-52 Stratofortress.',
  '// Do not hand-edit -- regenerate from assets/models/boeing_b-52_stratofortress.glb instead.',
  `export const B52_PIECES = ${JSON.stringify({ body: body.map(packed), glass: packed(glass) })};`,
  `export const B52_META = ${JSON.stringify(META)};`,
  '',
];
writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${(lines.join('\n').length / 1024).toFixed(0)} KB`, JSON.stringify(META));
