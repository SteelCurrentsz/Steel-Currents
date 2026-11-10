// The owner's B-29, from the glb it came as to the pieces the game flies.
//
//   node build/b29-source.mjs [model.glb]   ->  client/js/render/b29Model.data.js
//
// Wants the decimator and the image decoder (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22 sharp
//
// Reads assets/models/b-29a-bn_with_mk.6-maximum-compressed.glb as the owner
// uploaded it: "B-29A-BN with Mk.6" by Jeyhun1985
// (https://sketchfab.com/3d-models/b-29a-bn-with-mk6-8d0cc8f39bfa43b180fc0019e7316b9e),
// under Creative Commons Attribution 4.0 -- credited on the game's Credits
// screen. A Sketchfab export of the whole aeroplane, every piece textured, in
// metres, up +Y and her nose along +Z already: the game's own frame. Its nodes
// are the material merger's, not hers -- a wing and half a fuselage in one --
// so nothing here is found by node. Her pieces are found by where they are.
//
// What comes out:
//   body   her airframe, painted: every texture sampled at every point
//   glass  her nose, her blisters and her sighting domes
//   prop   one Curtiss Electric four-blade airscrew, about its own hub (she
//          has four of them, all turning the same way, so one shape serves)
//   doorL, doorR   her forward bomb bay doors, cut out of her belly along
//          straight lines, each about the hinge it swings on
//   bay    the inside of the forward bay: what is seen when the doors open
//   bomb   the weapon, as the model has it hanging in the bay
//
// Every piece is decimated to what a vic of her costs to draw, and written in
// the compact form client/js/render/sculpt.js decodes.
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

const SRC = process.argv[2] || path.join(ROOT, 'assets/models/b-29a-bn_with_mk.6-maximum-compressed.glb');
const OUT = path.join(ROOT, 'client/js/render/b29Model.data.js');

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

/** Every triangle of the model where it is: points, normals, uvs, and a material a face. */
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
            // Her scales are uniform, so the normal goes through the same
            // rotation and is put back to unit length.
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
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, N, UV, T, M, j, views };
}

const model = flatten(readFileSync(SRC));
const { P, N, UV, j } = model;
console.log(`model: ${model.T.length / 3} triangles, ${P.length / 3} points`);

// ---- where her parts are ------------------------------------------------
// Measured off the model, in its own metres. The four engines: the front face
// of each cylinder block and the line of its shaft.
const ENGINES = [[4.31, 0.29, 4.48], [9.48, 0.65, 4.01]];
// The forward bomb bay: from just aft of the forward lower turret back to the
// front spar, and the doors' hinge lines along her belly either side, at a
// height where her skin is still steep enough to hinge a door on.
const BAY = { z0: 0.72, z1: 4.66, hingeY: -0.92 };
// The glass is the model's one see-through material.
const GLASS_MAT = 3;
// The Mk.6 is the model's only piece in the first material.
const BOMB_MAT = 0;
// And the cylinders of her engines are the model's fifth.
const ENGINE_MAT = 5;

const centroid = (t) => {
  const a = model.T[t * 3] * 3, b = model.T[t * 3 + 1] * 3, c = model.T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};

// ---- cut her belly along the bay's edges ---------------------------------
// Her skin is split on three planes -- the two ends of the bay and the line
// of the hinges -- so each door is a clean panel with straight edges rather
// than whichever triangles happened to fall inside it.
function cutPlane(test, value, axis, near) {
  const T0 = model.T, M0 = model.M;
  const made = new Map();
  const side = (v) => Math.sign(P[v * 3 + axis] - value) || 1;
  const cross = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (made.has(key)) return made.get(key);
    const s = (value - P[a * 3 + axis]) / (P[b * 3 + axis] - P[a * 3 + axis]);
    const w = P.length / 3;
    for (let c = 0; c < 3; c++) P.push(P[a * 3 + c] + (P[b * 3 + c] - P[a * 3 + c]) * s);
    const nx = N[a * 3] + (N[b * 3] - N[a * 3]) * s, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * s,
      nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * s;
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
    UV.push(UV[a * 2] + (UV[b * 2] - UV[a * 2]) * s, UV[a * 2 + 1] + (UV[b * 2 + 1] - UV[a * 2 + 1]) * s);
    made.set(key, w);
    return w;
  };
  const T2 = [], M2 = [];
  let n = 0;
  for (let t = 0; t < T0.length / 3; t++) {
    const v = [T0[t * 3], T0[t * 3 + 1], T0[t * 3 + 2]];
    const sd = v.map(side);
    if (!near(centroid(t)) || M0[t] === BOMB_MAT || !(sd.includes(1) && sd.includes(-1))) {
      T2.push(...v); M2.push(M0[t]);
      continue;
    }
    n++;
    const a = [], b = [];
    for (let k = 0; k < 3; k++) {
      const p = v[k], q = v[(k + 1) % 3];
      (sd[k] > 0 ? a : b).push(p);
      if (sd[k] !== sd[(k + 1) % 3]) { const w = cross(p, q); a.push(w); b.push(w); }
    }
    for (const poly of [a, b]) for (let k = 1; k + 1 < poly.length; k++) { T2.push(poly[0], poly[k], poly[k + 1]); M2.push(M0[t]); }
  }
  model.T = T2; model.M = M2;
  void test;
  return n;
}
const belly = (c) => Math.abs(c[0]) < 1.7 && c[1] < 0 && c[2] > BAY.z0 - 0.8 && c[2] < BAY.z1 + 0.8;
console.log('bay cuts:',
  cutPlane(null, BAY.z0, 2, belly), cutPlane(null, BAY.z1, 2, belly), cutPlane(null, BAY.hingeY, 1, belly));

// ---- her guns ----------------------------------------------------------------
// Her five gun positions: the four General Electric barbettes and the tail.
// Each is the middle of its dome, at the height of its guns, and the box its
// barrels lie in -- every one of them stowed pointing aft, which is how the
// model has them. The barrels are cut out of her so they can train; what is
// left inside each dome stays where it is.
const GUNS = [
  { name: 'upper', at: [0, 1.55, 6.30], z: [5.02, 5.76], y: [1.46, 1.66] },
  { name: 'lower', at: [0, -1.58, 5.60], z: [4.70, 5.18], y: [-1.68, -1.48] },
  { name: 'aftupper', at: [0, 1.55, -7.40], z: [-8.70, -7.95], y: [1.47, 1.63] },
  { name: 'aftlower', at: [0, -0.31, -13.00], z: [-14.20, -13.45], y: [-0.42, -0.20] },
  { name: 'tail', at: [0, 1.04, -19.20], z: [-20.00, -19.55], y: [0.95, 1.13] },
];

// ---- sort every face into the piece it belongs to -------------------------
const PIECE = new Int8Array(model.T.length / 3);   // 0 body, 1 glass, 2 prop, 3 doorL, 4 doorR, 5 bomb, 6+ guns
const BODY = 0, GLASS = 1, PROP = 2, DOORL = 3, DOORR = 4, BOMB = 5, GUN0 = 6;
for (let t = 0; t < model.T.length / 3; t++) {
  const c = centroid(t);
  const m = model.M[t];
  if (m === BOMB_MAT) { PIECE[t] = BOMB; continue; }
  let prop = false;
  for (const [ex, ey, ez] of ENGINES) {
    for (const sx of [-1, 1]) {
      const r = Math.hypot(c[0] - sx * ex, c[1] - ey);
      // Inside the disc and no further aft than the blade roots: the hub, the
      // spinner and the blades. The cowling's lip stops four tenths of a
      // metre aft of the cylinders' faces and the blades start two tenths
      // aft of them, so nothing of it is caught; the cylinders themselves are
      // their own material.
      if (r < 2.75 && c[2] > ez - 0.3 && c[2] < ez + 1.2 && m !== ENGINE_MAT) prop = true;
    }
  }
  if (prop) { PIECE[t] = PROP; continue; }
  const gun = GUNS.findIndex((q) => Math.abs(c[0]) < 0.34 && c[1] > q.y[0] && c[1] < q.y[1]
    && c[2] > q.z[0] && c[2] < q.z[1]);
  if (gun >= 0 && m !== GLASS_MAT) { PIECE[t] = GUN0 + gun; continue; }
  if (m === GLASS_MAT) { PIECE[t] = GLASS; continue; }
  if (c[2] > BAY.z0 && c[2] < BAY.z1 && c[1] < BAY.hingeY && Math.abs(c[0]) < 1.6) {
    PIECE[t] = c[0] < 0 ? DOORL : DOORR;
    continue;
  }
  PIECE[t] = BODY;
}

// The hubs: the middle of each airscrew's spinner, which is what it turns about.
const hubs = [];
for (const [ex, ey, ez] of ENGINES) {
  for (const sx of [-1, 1]) {
    let s = [0, 0, 0], n = 0;
    for (let t = 0; t < model.T.length / 3; t++) {
      if (PIECE[t] !== PROP) continue;
      const c = centroid(t);
      if (Math.hypot(c[0] - sx * ex, c[1] - ey) < 0.45) { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; }
    }
    hubs.push([s[0] / n, s[1] / n, s[2] / n]);
  }
}
console.log('hubs', hubs.map((h) => h.map((v) => v.toFixed(2)).join(',')));

// ---- her paint ------------------------------------------------------------
// Each texture decoded once, at no more than 1024 pixels a side; a point's
// colour is the texture under it, averaged over a few pixels round it.
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
const srgb = (b) => b / 255;
async function colourOf(v, mi) {
  const { t, f } = await texture(mi);
  if (!t) return [f[0], f[1], f[2]];
  const u = ((UV[v * 2] % 1) + 1) % 1, w = ((UV[v * 2 + 1] % 1) + 1) % 1;
  const x = Math.min(t.w - 1, Math.floor(u * t.w)), y = Math.min(t.h - 1, Math.floor(w * t.h));
  const o = (y * t.w + x) * 3;
  return [srgb(t.data[o]) * f[0], srgb(t.data[o + 1]) * f[1], srgb(t.data[o + 2]) * f[2]];
}

/**
 * One piece: the faces sorted into it, each point coloured, points that are
 * the same point in the same paint welded, decimated to `keep` of its faces,
 * and moved so `about` is its origin.
 */
async function piece(which, keep, about = [0, 0, 0], tint = null) {
  // Welded on the point alone, not on its paint or its normal: the model
  // splits nearly every point for one or the other, and a mesh split at
  // every point is one the decimator cannot take anything out of. The paint
  // of a welded point is the mean of what it had on each face, and its
  // normals are worked out again afterwards, with her hard edges kept (see
  // creased).
  const key = new Map();
  const pos = [], nrm = [], col = [], cn = [], idx = [];
  for (let t = 0; t < model.T.length / 3; t++) {
    if (PIECE[t] !== which) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const c = tint || await colourOf(v, model.M[t]);
      const q = (x, s) => Math.round(x * s);
      const id = [q(P[v * 3], 1e4), q(P[v * 3 + 1], 1e4), q(P[v * 3 + 2], 1e4)].join(',');
      let n = key.get(id);
      if (n === undefined) {
        n = pos.length / 3;
        key.set(id, n);
        pos.push(P[v * 3] - about[0], P[v * 3 + 1] - about[1], P[v * 3 + 2] - about[2]);
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
  console.log(`  ${['body', 'glass', 'prop', 'doorL', 'doorR', 'bomb', ...GUNS.map((q) => q.name)][which]}: ${nt} -> ${m.T.length / 3} faces, ${m.P.length / 3} points`);
  return m;
}

/**
 * Normals for a welded, decimated piece: each corner of a face takes the mean
 * of the faces round its point that lie within CREASE of it, so a wing's
 * trailing edge or a fin's tip stays sharp and her skin between them is
 * smooth. A point is split once for each different normal its corners end up
 * with.
 */
const CREASE = Math.cos((50 * Math.PI) / 180);
function creased(pos, col, idx) {
  const nf = idx.length / 3;
  const fn = new Float64Array(nf * 3);
  const round = new Map();
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    // Left at its length, which is twice the area: the mean is weighted by it.
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

/** The same, cut into pieces small enough for 16-bit indices. */
function chunks(m, max = 60000) {
  if (m.P.length / 3 < max) return [m];
  // Along her length, which keeps each chunk a sensible slice of her.
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

// The weapon's middle, which is what it falls about.
const bombBox = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
for (let t = 0; t < model.T.length / 3; t++) {
  if (PIECE[t] !== BOMB) continue;
  for (let k = 0; k < 3; k++) {
    const v = model.T[t * 3 + k];
    for (let c = 0; c < 3; c++) { bombBox.lo[c] = Math.min(bombBox.lo[c], P[v * 3 + c]); bombBox.hi[c] = Math.max(bombBox.hi[c], P[v * 3 + c]); }
  }
}
const bombAt = bombBox.lo.map((v, c) => (v + bombBox.hi[c]) / 2);

// The doors' hinges: along the top edge of each, where the cut was made.
let hx = 0;
for (let t = 0; t < model.T.length / 3; t++) {
  if (PIECE[t] !== DOORR) continue;
  for (let k = 0; k < 3; k++) hx = Math.max(hx, P[model.T[t * 3 + k] * 3]);
}
const hingeL = [-hx, BAY.hingeY, (BAY.z0 + BAY.z1) / 2];
const hingeR = [hx, BAY.hingeY, (BAY.z0 + BAY.z1) / 2];

console.log('pieces:');
const body = chunks(await piece(BODY, +(process.env.KEEP || 0.14)));
const glass = await piece(GLASS, 0.5);
// One airscrew, the starboard inner's, about its own hub.
const propAll = await piece(PROP, 0.35, [0, 0, 0]);
const hub = hubs[1];
const prop = { P: [], N: [], C: [], T: [] };
{
  const map = new Map();
  for (let t = 0; t < propAll.T.length / 3; t++) {
    const a = propAll.T[t * 3];
    if (Math.hypot(propAll.P[a * 3] - hub[0], propAll.P[a * 3 + 1] - hub[1]) > 2.9) continue;
    for (let k = 0; k < 3; k++) {
      const v = propAll.T[t * 3 + k];
      let n = map.get(v);
      if (n === undefined) {
        n = prop.P.length / 3; map.set(v, n);
        prop.P.push(propAll.P[v * 3] - hub[0], propAll.P[v * 3 + 1] - hub[1], propAll.P[v * 3 + 2] - hub[2]);
        prop.N.push(propAll.N[v * 3], propAll.N[v * 3 + 1], propAll.N[v * 3 + 2]);
        prop.C.push(propAll.C[v * 3], propAll.C[v * 3 + 1], propAll.C[v * 3 + 2]);
      }
      prop.T.push(n);
    }
  }
}
const doorL = await piece(DOORL, 0.5, hingeL);
const doorR = await piece(DOORR, 0.5, hingeR);
const bomb = await piece(BOMB, 0.25, bombAt);
// Each turret's guns, about its own middle, and turned the way the client
// trains them: pointing forward from a ring stood the other way round, and
// upside down in a ring that is itself turned over -- so a positive
// elevation lifts them, as a gunner means it to. See b29Model.js. Both of
// those together are the point turned through its own middle.
const guns = [];
for (const [k, q] of GUNS.entries()) {
  const g = await piece(GUN0 + k, 0.6, q.at);
  for (let i = 0; i < g.P.length; i++) { g.P[i] = -g.P[i]; g.N[i] = -g.N[i]; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.P.length / 3; i++) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], g.P[i * 3 + c]); hi[c] = Math.max(hi[c], g.P[i * 3 + c]);
  }
  console.log(`    ${q.name}: ${lo.map((v) => v.toFixed(2))} .. ${hi.map((v) => v.toFixed(2))}`);
  guns.push(g);
}

// ---- the inside of the bay --------------------------------------------------
// A box, open underneath, its faces looking in: the bulkheads at either end,
// the sides up from the hinges and the roof over the weapon. Dark, because
// it is the inside of an aeroplane.
const bay = { P: [], N: [], C: [], T: [] };
{
  const x = hx - 0.04, y0 = BAY.hingeY, y1 = 0.9, z0 = BAY.z0 + 0.02, z1 = BAY.z1 - 0.02;
  const quad = (a, b, c, d, n) => {
    const i = bay.P.length / 3;
    for (const p of [a, b, c, d]) { bay.P.push(...p); bay.N.push(...n); bay.C.push(0.16, 0.17, 0.18); }
    bay.T.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  quad([-x, y0, z0], [-x, y1, z0], [-x, y1, z1], [-x, y0, z1], [1, 0, 0]);
  quad([x, y0, z1], [x, y1, z1], [x, y1, z0], [x, y0, z0], [-1, 0, 0]);
  quad([-x, y1, z0], [x, y1, z0], [x, y1, z1], [-x, y1, z1], [0, -1, 0]);
  quad([x, y0, z0], [x, y1, z0], [-x, y1, z0], [-x, y0, z0], [0, 0, 1]);
  quad([-x, y0, z1], [-x, y1, z1], [x, y1, z1], [x, y0, z1], [0, 0, -1]);
}

const META = {
  hubs: hubs.map((h) => h.map((v) => +v.toFixed(3))),
  bomb: { at: bombAt.map((v) => +v.toFixed(3)), len: +(bombBox.hi[2] - bombBox.lo[2]).toFixed(3),
    r: +((bombBox.hi[0] - bombBox.lo[0]) / 2).toFixed(3) },
  doors: { L: hingeL.map((v) => +v.toFixed(3)), R: hingeR.map((v) => +v.toFixed(3)) },
  bay: { z0: BAY.z0, z1: BAY.z1, y: BAY.hingeY, x: +hx.toFixed(3) },
  guns: GUNS.map((q) => ({ name: q.name, at: q.at })),
};

const lines = [
  '// Generated by build/b29-source.mjs from the owner\'s B-29A-BN with Mk.6.',
  '// Do not hand-edit -- regenerate from assets/models/b-29a-bn_with_mk.6-maximum-compressed.glb instead.',
  `export const B29_PIECES = ${JSON.stringify({
    body: body.map(packed), glass: packed(glass), prop: packed(prop),
    doorL: packed(doorL), doorR: packed(doorR), bay: packed(bay), bomb: packed(bomb),
    guns: guns.map(packed),
  })};`,
  `export const B29_META = ${JSON.stringify(META)};`,
  '',
];
writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${(lines.join('\n').length / 1024).toFixed(0)} KB`, JSON.stringify(META));
