// Turn the owner's model of a Higgins boat into what
// client/js/render/higginsHull.js ships: her hull, her well, her coxswain's
// station and every fitting on her as one mesh painted a point in the
// model's own colours; her ramp cut free of her, so it can fall; and her two
// M1919 Brownings cut free of her, each a pintle that trains and a gun that
// elevates, with where each stands.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-higgins-hull.mjs [model.glb]
//
// Reads assets/models/USLandingCraft.glb as the owner uploaded it: "LCVP
// Higgins boat (1945)" by RedC130 (https://skfb.ly/oKNtE), under Creative
// Commons Attribution 4.0 -- credited on the game's Credits screen. A
// Sketchfab export in fourteen meshes and eleven materials, bow along +Z.
//
// The model paints her off six textures and a handful of flat colours. Each
// face of her is painted the colour its own material's texture has under it,
// so she is carried as one vertex-coloured mesh and no textures.
//
// Writes client/js/render/higginsHull.data.js, which is committed, so a fresh
// clone runs without this script.
//
// BOX=x0,x1,y0,y1,z0,z1 lists the model's parts standing wholly inside that
// box, in metres of her frame: what her ramp and her guns are found among.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heightmap, heightBytes, pack, packPieceCompact } from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptDecoder } = require('meshoptimizer');
const OUT_DATA = path.join(ROOT, 'client/js/render/higginsHull.data.js');

// ---- her model ---------------------------------------------------------------------
const SRC = process.argv[2] || path.join(ROOT, 'assets/models/USLandingCraft.glb');
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

/** Every triangle of the model, where it is: positions and texture coordinates a point. */
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
  const P = [], N = [], UV = [], T = [], TM = [], TN = [];
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
        const nrm = prim.attributes.NORMAL !== undefined ? acc(prim.attributes.NORMAL) : null;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
          if (uv) UV.push(uv.out[k * 2], uv.out[k * 2 + 1]); else UV.push(0, 0);
          // Her normals turned as she is: her nodes only turn and scale her
          // alike every way, so the upper 3x3 does, renormalised.
          if (nrm) {
            const a0 = nrm.out[k * nrm.n], a1 = nrm.out[k * nrm.n + 1], a2 = nrm.out[k * nrm.n + 2];
            const nx = w[0] * a0 + w[4] * a1 + w[8] * a2, ny = w[1] * a0 + w[5] * a1 + w[9] * a2, nz = w[2] * a0 + w[6] * a1 + w[10] * a2;
            const l = Math.hypot(nx, ny, nz) || 1;
            N.push(nx / l, ny / l, nz / l);
          } else N.push(0, 1, 0);
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          if (det < 0) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          TM.push(prim.material ?? -1);
          TN.push(ni);
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, N, UV, T, TM, TN, j, views };
}

const model = await flatten(glb);
const { j } = model;
console.log('model:', model.T.length / 3, 'triangles,', model.P.length / 3, 'points');

// ---- what is drawn ---------------------------------------------------------------------
// Three of her meshes are in a material the model draws fully transparent
// (NEUTRE: blended, alpha nought) -- a second skin of her that is never seen.
// They are left out.
const hidden = (t) => {
  if (process.env.SHOWHIDDEN) return false;
  const m = j.materials[model.TM[t]];
  return !m || (m.alphaMode === 'BLEND' && (m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) === 0);
};

// ---- her frame -----------------------------------------------------------------------
// The model draws her with her ramp down, lying out ahead of her bow, so her
// length overall is no measure of her. Her beam is: 10 ft 10 in, 3.29 m,
// across her gunwales, which makes her hull 10.6 m from her transom to the
// head of her ramp's frames -- her 36 ft 3 in with the ramp up. Her keel is
// the model's lowest point; she draws 0.9 m aft. Every hull in the game is floated a
// metre down (FLOAT_Y in breakers.js), so the sea meets her a metre above the
// y = 0 she is drawn to: her waterline is put there, LIFT up.
export const REAL_LOA = 10.97;
export const DRAFT = +(process.env.DRAFT ?? 0.9);
export const LIFT = 1.0;
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let t = 0; t < model.T.length / 3; t++) {
  if (hidden(t)) continue;
  for (let k = 0; k < 3; k++) {
    const v = model.T[t * 3 + k];
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.P[v * 3 + c]); hi[c] = Math.max(hi[c], model.P[v * 3 + c]); }
  }
}
export const REAL_BEAM = 3.29;
export const SCALE = REAL_BEAM / (hi[0] - lo[0]);
// Her middle, fore and aft: half way along her length with the ramp up,
// HULL_FWD of the model's units ahead of its transom.
const ZC = lo[2] + (REAL_LOA / SCALE) / 2;
const XC = (lo[0] + hi[0]) / 2;
const KEEL = lo[1];
for (let i = 0; i < model.P.length; i += 3) {
  model.P[i] = (model.P[i] - XC) * SCALE;
  model.P[i + 1] = (model.P[i + 1] - KEEL) * SCALE - DRAFT + LIFT;
  model.P[i + 2] = (model.P[i + 2] - ZC) * SCALE;
}
console.log(`frame: x${SCALE.toFixed(4)}, ${((hi[2] - lo[2]) * SCALE).toFixed(2)} m with the ramp down, ${((hi[0] - lo[0]) * SCALE).toFixed(2)} m across, ${((hi[1] - lo[1]) * SCALE).toFixed(2)} m keel to top`);

// ---- her parts -------------------------------------------------------------------------
// The runs of faces that hang together: every face joined to the next by a
// point the two share.
const nTri = model.T.length / 3;
const partOf = (() => {
  const key = (v) => `${Math.round(model.P[v * 3] * 1000)},${Math.round(model.P[v * 3 + 1] * 1000)},${Math.round(model.P[v * 3 + 2] * 1000)}`;
  const id = new Map(), up = [];
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const node = (v) => { const k = key(v); let i = id.get(k); if (i === undefined) { i = up.length; id.set(k, i); up.push(i); } return i; };
  const first = new Int32Array(nTri);
  for (let t = 0; t < nTri; t++) {
    const a = node(model.T[t * 3]), b = node(model.T[t * 3 + 1]), c = node(model.T[t * 3 + 2]);
    up[find(b)] = find(a); up[find(c)] = find(a);
    first[t] = a;
  }
  return Int32Array.from(first, (a) => find(a));
})();
const PARTS = new Map();
for (let t = 0; t < nTri; t++) {
  if (hidden(t)) continue;
  let p = PARTS.get(partOf[t]);
  if (!p) PARTS.set(partOf[t], p = { id: partOf[t], tris: [], mat: model.TM[t], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
  p.tris.push(t);
  for (let k = 0; k < 3; k++) {
    const v = model.T[t * 3 + k];
    for (let c = 0; c < 3; c++) { p.lo[c] = Math.min(p.lo[c], model.P[v * 3 + c]); p.hi[c] = Math.max(p.hi[c], model.P[v * 3 + c]); }
  }
}
console.log(`parts: ${PARTS.size}`);
const f2 = (v) => v.toFixed(2);
const describe = (p) => `part ${p.id} ${j.materials[p.mat].name} ${p.tris.length}t x ${f2(p.lo[0])}..${f2(p.hi[0])} y ${f2(p.lo[1])}..${f2(p.hi[1])} z ${f2(p.lo[2])}..${f2(p.hi[2])}`;
/** The parts standing wholly inside a box [x0, x1, y0, y1, z0, z1], in metres of her frame. */
const partsIn = ([x0, x1, y0, y1, z0, z1]) => [...PARTS.values()].filter((p) => p.lo[0] >= x0 && p.hi[0] <= x1
  && p.lo[1] >= y0 && p.hi[1] <= y1 && p.lo[2] >= z0 && p.hi[2] <= z1);
// VIEW=side|top|front|iso writes a picture of her, the parts in HIGHLIGHT
// (comma-separated ids) in red: for finding which part is which.
if (process.env.VIEW) {
  const W = 1400, H = 700;
  const img = Buffer.alloc(W * H * 3, 40);
  const zb = new Float32Array(W * H).fill(-1e9);
  const hl = new Set((process.env.HIGHLIGHT || '').split(',').filter(Boolean).map(Number));
  const v = process.env.VIEW;
  const yaw = v === 'iso' ? +(process.env.YAW || 0.7) : 0, pit = v === 'iso' ? +(process.env.PIT || 0.5) : 0;
  const proj = (x, y, z) => {
    if (v === 'side') return [z, y, x];
    if (v === 'top') return [z, x, y];
    if (v === 'front') return [x, y, z];
    const cx = Math.cos(yaw), sx = Math.sin(yaw);
    const X = x * cx - z * sx, Z = x * sx + z * cx;
    const cp = Math.cos(pit), sp = Math.sin(pit);
    return [X, y * cp - Z * sp, y * sp + Z * cp];
  };
  const sc = +(process.env.SC || 110);
  const [cx0, cy0] = (process.env.AT || '0,0').split(',').map(Number);
  const ox = W / 2 - cx0 * sc, oy = H * 0.62 + cy0 * sc;
  const only = new Set((process.env.ONLY || '').split(',').filter(Boolean).map(Number));
  for (const p of PARTS.values()) {
    if (only.size && !only.has(p.id)) continue;
    for (const t of p.tris) {
      const q = [0, 1, 2].map((k) => { const vi = model.T[t * 3 + k]; return proj(model.P[vi * 3], model.P[vi * 3 + 1], model.P[vi * 3 + 2]); });
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2];
      const wx = q[2][0] - q[0][0], wy = q[2][1] - q[0][1], wz = q[2][2] - q[0][2];
      const nz = ux * wy - uy * wx, nx = uy * wz - uz * wy, ny = uz * wx - ux * wz;
      const l = Math.hypot(nx, ny, nz) || 1;
      const sh = 0.35 + 0.65 * Math.abs(nz / l);
      const base = hl.has(p.id) ? [230, 40, 40] : [150, 160, 170];
      const P2 = q.map(([a, b, c]) => [ox + a * sc, oy - b * sc, c]);
      const x0 = Math.max(0, Math.floor(Math.min(...P2.map((r) => r[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...P2.map((r) => r[0]))));
      const y0 = Math.max(0, Math.floor(Math.min(...P2.map((r) => r[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...P2.map((r) => r[1]))));
      const d = (P2[1][1] - P2[2][1]) * (P2[0][0] - P2[2][0]) + (P2[2][0] - P2[1][0]) * (P2[0][1] - P2[2][1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const a = ((P2[1][1] - P2[2][1]) * (px - P2[2][0]) + (P2[2][0] - P2[1][0]) * (py - P2[2][1])) / d;
        const b = ((P2[2][1] - P2[0][1]) * (px - P2[2][0]) + (P2[0][0] - P2[2][0]) * (py - P2[2][1])) / d;
        const c = 1 - a - b;
        if (a < 0 || b < 0 || c < 0) continue;
        const z = a * P2[0][2] + b * P2[1][2] + c * P2[2][2];
        const i = py * W + px;
        if (z <= zb[i]) continue;
        zb[i] = z;
        img[i * 3] = base[0] * sh; img[i * 3 + 1] = base[1] * sh; img[i * 3 + 2] = base[2] * sh;
      }
    }
  }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(process.env.OUT || 'view.png');
  process.exit(0);
}
if (process.env.BOX) {
  const vol = (p) => (p.hi[0] - p.lo[0] + 0.05) * (p.hi[1] - p.lo[1] + 0.05) * (p.hi[2] - p.lo[2] + 0.05);
  const list = partsIn(process.env.BOX.split(',').map(Number)).sort((a, b) => (process.env.BYVOL ? vol(b) - vol(a) : b.tris.length - a.tris.length));
  for (const p of list.slice(0, +(process.env.N || 60))) console.log(describe(p));
  console.log(list.length, 'parts');
  process.exit(0);
}

// ---- her ramp, her cables and her guns, found -------------------------------------------
// Her ramp: the plate lying out ahead of her bow, and the knuckles of its
// hinge across the foot of her bow. The two wire cables from its lip to the
// heads of her bow frames are left out: they are drawn in the game, paying
// out as the ramp falls (see higgins.js).
const RAMP_BOX = [-1.4, 1.4, -1, 1.5, 4.6, 8];
const CABLE_BOX = [-2, 2, -1, 4, 5.3, 8];
// Her Brownings: everything standing above the rim of each gun cockpit.
const GUN_BOXES = [
  [0.3, 1.9, 2.2, 3.5, -4.5, -2.6],
  [-1.9, -0.3, 2.2, 3.5, -4.5, -2.6],
];
const ROLE = new Int8Array(nTri).fill(0);        // 0 hull, 1 ramp, 2 cable, 3+ gun
const rampParts = partsIn(RAMP_BOX);
for (const p of rampParts) for (const t of p.tris) ROLE[t] = 1;
for (const p of partsIn(CABLE_BOX)) if (ROLE[p.tris[0]] === 0) for (const t of p.tris) ROLE[t] = 2;
const gunParts = GUN_BOXES.map((b, i) => {
  const list = partsIn(b);
  if (!list.length) throw new Error(`no gun in ${b}`);
  for (const p of list) for (const t of p.tris) ROLE[t] = 3 + i;
  return list;
});
console.log(`ramp: ${rampParts.length} parts; guns: ${gunParts.map((l) => l.length).join(', ')} parts`);

// ---- her paint ---------------------------------------------------------------------------
// Each material's own texture, decoded, or its flat colour.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const PAINT = await Promise.all(j.materials.map(async (m) => {
  const pbr = m.pbrMetallicRoughness || {};
  const f = pbr.baseColorFactor || [1, 1, 1, 1];
  if (!pbr.baseColorTexture) return { flat: f.slice(0, 3) };
  const img = j.images[j.textures[pbr.baseColorTexture.index].source];
  const { data, info } = await sharp(Buffer.from(model.views[img.bufferView])).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, f };
}));
/** A point's colour, linear, 0..1 a channel: its material's texture at its coordinates. */
function paintAt(mat, u, v) {
  const p = PAINT[mat];
  if (p.flat) return p.flat;
  const x = Math.min(p.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * p.w)));
  const y = Math.min(p.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * p.h)));
  const i = (y * p.w + x) * 3;
  return [0, 1, 2].map((c) => toLin(p.data[i + c] / 255) * p.f[c]);
}
/** A face's colour: its material at its middle and towards each of its corners, averaged. */
function faceColour(t) {
  const [a, b, c] = [model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]];
  const U = model.UV;
  const sum = [0, 0, 0];
  const W = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
  for (const [wa, wb, wc] of W) {
    const s = paintAt(model.TM[t], U[a * 2] * wa + U[b * 2] * wb + U[c * 2] * wc, U[a * 2 + 1] * wa + U[b * 2 + 1] * wb + U[c * 2 + 1] * wc);
    for (let k = 0; k < 3; k++) sum[k] += s[k] / W.length;
  }
  return sum;
}
/** Linear colour to a byte of sRGB, which is what a vertex colour is carried in. */
const toByte = (c) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

/**
 * The faces picked, as a mesh of their own, every face with points of its
 * own so it carries its own colour.
 */
function subMesh(tris) {
  const P = [], N = [], T = [], C = [];
  for (const t of tris) {
    const col = faceColour(t).map(toByte);
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      T.push(P.length / 3);
      P.push(model.P[v * 3], model.P[v * 3 + 1], model.P[v * 3 + 2]);
      N.push(model.N[v * 3], model.N[v * 3 + 1], model.N[v * 3 + 2]);
      C.push(...col);
    }
  }
  return { P, N, T, C };
}
/** And welded again where neighbouring faces share a point and a colour. */
function weld(m) {
  const map = new Map();
  const P = [], N = [], T = [], C = [];
  for (let i = 0; i < m.T.length; i++) {
    const v = m.T[i];
    const k = `${m.P[v * 3].toFixed(4)},${m.P[v * 3 + 1].toFixed(4)},${m.P[v * 3 + 2].toFixed(4)},`
      + `${m.N[v * 3].toFixed(2)},${m.N[v * 3 + 1].toFixed(2)},${m.N[v * 3 + 2].toFixed(2)},${m.C[v * 3]},${m.C[v * 3 + 1]},${m.C[v * 3 + 2]}`;
    let w = map.get(k);
    if (w === undefined) {
      w = P.length / 3; map.set(k, w);
      P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]);
      N.push(m.N[v * 3], m.N[v * 3 + 1], m.N[v * 3 + 2]);
      C.push(m.C[v * 3], m.C[v * 3 + 1], m.C[v * 3 + 2]);
    }
    T.push(w);
  }
  return { P, N, T, C };
}

// ---- her hull ----------------------------------------------------------------------------
const hullTris = [...Array(nTri).keys()].filter((t) => !hidden(t) && ROLE[t] === 0);
const hull = weld(subMesh(hullTris));
console.log('hull:', hull.T.length / 3, 'triangles,', hull.P.length / 3, 'points');
export const LOA = REAL_LOA;
const packed = pack(hull, Uint8Array.from(hull.C), new Float32Array(hull.P.length / 3 * 2),
  { buckets: +(process.env.BUCKETS || 12), length: LOA, compact: true });
console.log('packed hull', packed.blob.length, 'bytes in', packed.buckets, 'slices');

// Her surface, as a height map: her well floor, her engine house, her gunwales.
const HM = { x0: -1.8, z0: -5.6, step: 0.1, nx: 37, nz: 113 };
const hm = heightmap(hull, HM);

// Her lines: her half-breadth outside her plating at every station and
// height, cut off her hull -- what the sea is kept out of (see hullPlan in
// breakers.js), her well included: it is dry inside her.
const LINES = (() => {
  const L = { z0: -5.5, dz: 0.25, nz: 45, y0: 0, dy: 0.1, ny: 36 };
  const half = new Float32Array(L.nz * L.ny);
  const keel = new Float32Array(L.nz).fill(99);
  const deck = new Float32Array(L.nz).fill(-99);
  const { P, T } = hull;
  for (let k = 0; k < L.nz; k++) {
    const z = Math.min(5.45, Math.max(-5.45, L.z0 + k * L.dz));
    // Where her plating crosses this station: a segment off every face it cuts.
    const seg = [];
    for (let t = 0; t < T.length; t += 3) {
      const q = [T[t], T[t + 1], T[t + 2]].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
      const pts = [];
      for (let e = 0; e < 3; e++) {
        const a = q[e], b = q[(e + 1) % 3];
        if ((a[2] - z) * (b[2] - z) > 0 || a[2] === b[2]) continue;
        const u = (z - a[2]) / (b[2] - a[2]);
        pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      }
      if (pts.length >= 2) seg.push(pts[0], pts[1]);
    }
    for (const [, y] of seg) { keel[k] = Math.min(keel[k], y); deck[k] = Math.max(deck[k], y); }
    for (let r = 0; r < L.ny; r++) {
      const y = L.y0 + r * L.dy;
      let w = 0;
      for (let s = 0; s < seg.length; s += 2) {
        const [ax, ay] = seg[s], [bx, by] = seg[s + 1];
        if ((ay - y) * (by - y) > 0) continue;
        const x = ay === by ? Math.max(Math.abs(ax), Math.abs(bx)) : Math.abs(ax + (bx - ax) * (y - ay) / (by - ay));
        w = Math.max(w, x);
      }
      half[k * L.ny + r] = w;
    }
  }
  return { ...L, half: Array.from(half, (v) => +v.toFixed(3)), keel: Array.from(keel, (v) => +v.toFixed(3)), deck: Array.from(deck, (v) => +v.toFixed(3)) };
})();
console.log('lines: keel', Math.min(...LINES.keel).toFixed(2), 'gunwale', Math.min(...LINES.deck).toFixed(2), '..', Math.max(...LINES.deck).toFixed(2));

// ---- her ramp ----------------------------------------------------------------------------
// Put in the frame of its hinge: the axis of the knuckles across the foot of
// her bow at the origin, the ramp lying as the model has it, down. Raised,
// it turns up about the hinge until it lies along the forward edge of her
// bow frames.
const RAMP = (() => {
  const m = weld(subMesh(rampParts.flatMap((p) => p.tris)));
  let hz = Infinity;
  for (let i = 2; i < m.P.length; i += 3) hz = Math.min(hz, m.P[i]);
  // The hinge: the line of the knuckles, at their middle.
  const knuckles = rampParts.filter((p) => p.hi[2] - p.lo[2] < 0.2);
  const hy = knuckles.reduce((s, p) => s + (p.lo[1] + p.hi[1]) / 2, 0) / knuckles.length;
  const hzz = knuckles.reduce((s, p) => s + (p.lo[2] + p.hi[2]) / 2, 0) / knuckles.length;
  // Its lip: the points furthest out ahead.
  let lz = -Infinity;
  for (let i = 2; i < m.P.length; i += 3) lz = Math.max(lz, m.P[i]);
  let ly = 0, ln = 0;
  for (let i = 0; i < m.P.length; i += 3) if (m.P[i + 2] > lz - 0.05) { ly += m.P[i + 1]; ln++; }
  ly /= ln;
  const down = Math.atan2(hy - ly, lz - hzz);              // how far below level it lies
  const reach = Math.hypot(lz - hzz, ly - hy);
  // The forward edge of her bow frames: the furthest forward her hull stands
  // at each height above the hinge.
  let tz = -Infinity, ty = 0;
  for (let i = 0; i < hull.P.length; i += 3) {
    if (hull.P[i + 1] > ty - 1e-6 && hull.P[i + 2] > 4 && Math.abs(hull.P[i]) > 1.0) {
      if (hull.P[i + 1] > ty || hull.P[i + 2] > tz) { ty = hull.P[i + 1]; tz = hull.P[i + 2]; }
    }
  }
  const up = Math.atan2(ty - hy, tz - hzz);                 // how far above level the frames lean
  for (let i = 0; i < m.P.length; i += 3) { m.P[i + 1] -= hy; m.P[i + 2] -= hzz; }
  console.log(`ramp: hinge z ${f2(hzz)} y ${f2(hy)}, ${f2(reach)} m to its lip, lying ${(down * 180 / Math.PI).toFixed(1)} deg down; frames lean to ${(up * 180 / Math.PI).toFixed(1)} deg, head z ${f2(tz)} y ${f2(ty)}`);
  return {
    piece: packPieceCompact(m, (i) => [m.C[i * 3], m.C[i * 3 + 1], m.C[i * 3 + 2]]).toString('base64'),
    hinge: [0, +hy.toFixed(3), +hzz.toFixed(3)],
    // The turn about the hinge from the model's pose to raised: up, by the
    // ramp's own droop and the frames' lean together.
    raise: +(-(up + down)).toFixed(4),
    reach: +reach.toFixed(3),
    // The heads of her bow frames, where the cables are made fast.
    head: [+(tz).toFixed(3), +ty.toFixed(3)],
    lean: +up.toFixed(4), droop: +down.toFixed(4),
  };
})();

// ---- her guns, cut free ------------------------------------------------------------------
/**
 * One Browning in the frame of its mounting: its pintle -- the yoke it sits
 * in, the lowest part of it -- at the origin, its foot at y = 0, facing +Z;
 * and what elevates, the whole of the gun but the yoke, about the yoke's
 * trunnion.
 */
function browning(parts) {
  // The yoke: the cradle under the gun, in the dark grey of the model's
  // fittings -- the lowest such part of it. The gun itself, its shield, its
  // belt and its ammunition box are what it carries.
  const dark = parts.filter((p) => j.materials[p.mat].name === 'Gris_anthracite');
  const yoke = dark.reduce((a, p) => (p.lo[1] < a.lo[1] ? p : a));
  const all = weld(subMesh(parts.flatMap((p) => p.tris)));
  const yokeSet = new Set(yoke.tris);
  const x = (yoke.lo[0] + yoke.hi[0]) / 2, z = (yoke.lo[2] + yoke.hi[2]) / 2, y = yoke.lo[1];
  // Which way she points it: along the gun's length, the long axis of it seen
  // from above, toward the end where the barrel is -- the thin end, not the
  // one with the receiver, the grips and the box on it.
  let sxx = 0, sxz = 0, szz = 0, n = 0;
  for (let i = 0; i < all.P.length; i += 3) {
    const dx = all.P[i] - x, dz = all.P[i + 2] - z;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz; n++;
  }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let ax = Math.cos(th), az = Math.sin(th);
  const spreadAt = (sgn) => {
    let far = -Infinity;
    for (let i = 0; i < all.P.length; i += 3) far = Math.max(far, sgn * ((all.P[i] - x) * ax + (all.P[i + 2] - z) * az));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < all.P.length; i += 3) {
      if (sgn * ((all.P[i] - x) * ax + (all.P[i + 2] - z) * az) < far - 0.1) continue;
      lo = Math.min(lo, all.P[i + 1]); hi = Math.max(hi, all.P[i + 1]);
    }
    return hi - lo;
  };
  if (spreadAt(-1) < spreadAt(1)) { ax = -ax; az = -az; }
  const rest = Math.atan2(ax, az);
  const c = Math.cos(-rest), s = Math.sin(-rest);
  const local = (m) => {
    const P = m.P.slice(), N = m.N.slice();
    for (let i = 0; i < P.length; i += 3) {
      const dx = P[i] - x, dz = P[i + 2] - z;
      P[i] = dx * c + dz * s; P[i + 1] -= y; P[i + 2] = -dx * s + dz * c;
      const nx = N[i], nz = N[i + 2];
      N[i] = nx * c + nz * s; N[i + 2] = -nx * s + nz * c;
    }
    return { ...m, P, N };
  };
  const house = local(weld(subMesh(yoke.tris)));
  const gun = local(weld(subMesh(parts.filter((p) => !yokeSet.has(p.tris[0])).flatMap((p) => p.tris))));
  // The trunnion: the top of the yoke, over the pintle.
  let top = 0;
  for (let i = 1; i < house.P.length; i += 3) top = Math.max(top, house.P[i]);
  // The bore: the height of what stands out furthest ahead of the pintle.
  let mz = -Infinity;
  for (let i = 2; i < gun.P.length; i += 3) mz = Math.max(mz, gun.P[i]);
  let by = 0, bn = 0;
  for (let i = 0; i < gun.P.length; i += 3) if (gun.P[i + 2] > mz - 0.06) { by += gun.P[i + 1]; bn++; }
  by /= bn;
  const trunnion = [0, +top.toFixed(3), 0];
  for (let i = 1; i < gun.P.length; i += 3) gun.P[i] -= top;
  const muzzle = [0, +(by - top).toFixed(3), +mz.toFixed(3)];
  const pk = (m) => packPieceCompact(m, (i) => [m.C[i * 3], m.C[i * 3 + 1], m.C[i * 3 + 2]]).toString('base64');
  const out = {
    seat: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), rest: +rest.toFixed(4) },
    house: pk(house), guns: pk(gun), trunnion, muzzles: [muzzle],
  };
  console.log(`browning: seat (${f2(x)}, ${f2(y)}, ${f2(z)}) rest ${(rest * 180 / Math.PI).toFixed(1)}, yoke ${house.T.length / 3}t, gun ${gun.T.length / 3}t, trunnion ${trunnion}, muzzle ${muzzle}, muzzle height ${(y + top + by - top).toFixed(2)}`);
  return out;
}
const GUNS = gunParts.map(browning);

// ---- write ---------------------------------------------------------------------------------
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-higgins-hull.mjs from the owner's model.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const HIGGINS_HULL_B64 = ${JSON.stringify(packed.blob.toString('base64'))};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see higginsSurfaceY.\n`
  + `export const HIGGINS_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her ramp, in the frame of its hinge, lying down as the model has it; and\n`
  + `// the turn that raises it.\n`
  + `export const HIGGINS_RAMP = ${JSON.stringify(RAMP)};\n`
  + `// Her two Brownings, starboard then port, each in the frame of its pintle:\n`
  + `// the yoke that trains and the gun that elevates, and where it stands.\n`
  + `export const HIGGINS_GUNS = ${JSON.stringify(GUNS)};\n`
  + `// Her lines: her half-breadth at every ${LINES.dy} m of height, ${LINES.dz} m at a\n`
  + `// time, and her keel and gunwale at each station.\n`
  + `export const HIGGINS_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', path.relative(ROOT, OUT_DATA), `${(readFileSync(OUT_DATA).length / 1e6).toFixed(2)} MB`);
