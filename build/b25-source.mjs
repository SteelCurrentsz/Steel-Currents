// The B-25 off the deck of the owner's Hornet, from the glb it came as to the
// pieces the game flies.
//
//   node build/b25-source.mjs [model.glb]   ->  client/js/render/b25Model.data.js
//
// Wants the decimator and the image decoder (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22 sharp
//
// Reads assets/models/u.s._navy_aircraft_carrier_uss_hornetcv-8-maximum-
// compressed.glb, "U.S. Navy Aircraft Carrier USS Hornet(CV-8)" by 全斗焕, under
// Creative Commons Attribution 4.0 -- credited on the game's Credits screen --
// which has nine North American B-25 Mitchells ranged on her flight deck aft,
// the way the Doolittle raiders sailed in April 1942. They are the one
// aeroplane nine times over; the first of them (`wing_l008`) is taken, every
// piece of it textured, in the ship's frame -- up +Y, her nose along +Z --
// with her wheels down on the deck.
//
// What comes out, in her own frame -- nose +z, up +y, wheels on y = 0, put to
// the twenty point six metres a B-25B spanned:
//   body   her airframe, painted: every texture sampled at every point
//   glass  her nose, her cockpit and her turrets
//   prop   one Hamilton Standard three-blade airscrew, about its own hub
//   gear   her three legs and wheels, which come up into her nacelles and nose
//
// Every piece is decimated to what a deckload of sixteen of her costs to
// draw, and written in the compact form client/js/render/sculpt.js decodes.
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

const SRC = process.argv[2] || path.join(ROOT, 'assets/models/u.s._navy_aircraft_carrier_uss_hornetcv-8-maximum-compressed.glb');
const OUT = path.join(ROOT, 'client/js/render/b25Model.data.js');
/** The node of the first B-25 on her deck, `wing_l008`. */
const GROUP = 98;

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
  walk(GROUP, I);
  return { P, N, UV, T, M, j, views };
}

const model = flatten(readFileSync(SRC));
const { j } = model;
if (!/wing_l008/.test(j.nodes[GROUP].name || '')) throw new Error(`node ${GROUP} is ${j.nodes[GROUP].name}, not the first B-25`);
console.log(`model: ${model.T.length / 3} triangles, ${model.P.length / 3} points`);

// ---- her frame -----------------------------------------------------------
// In the ship's frame she stands with her wheels on the deck at y = 10.33 of
// its units, her centreline at x = 2.40 and her length centred on z = 19.25,
// fourteen point six nine of its units across. Brought to her own span.
export const SPAN = 20.6;
const X0 = 2.40, Y0 = 10.33, Z0 = 19.25;
let lo = Infinity, hi = -Infinity;
for (let i = 0; i < model.P.length; i += 3) { lo = Math.min(lo, model.P[i]); hi = Math.max(hi, model.P[i]); }
const S = SPAN / (hi - lo);
// Where her parts are, in the ship's units, read off the model: the main legs
// under her nacelles, the nose leg under her nose, and her airscrews on the
// fronts of her nacelles.
const NACELLE = [-0.2, 5.0];
const MAIN = { z0: 18.55, z1: 20.85, y: 11.3, x: 1.05 };
const NOSE = { z0: 22.35, z1: 24.05, y: 10.95, x: 0.6 };
const PROP = { z0: 22.3, r: 1.45 };
const GLASS_MATS = new Set(j.materials.map((m, i) => (m.alphaMode === 'BLEND' ? i : -1)).filter((i) => i >= 0));

const P = model.P, N = model.N, UV = model.UV;
const centroid = (t) => {
  const a = model.T[t * 3] * 3, b = model.T[t * 3 + 1] * 3, c = model.T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};

// ---- sort every face into the piece it belongs to -------------------------
const BODY = 0, GLASS = 1, PROPS = 2, GEAR = 3;
const NAMES = ['body', 'glass', 'prop', 'gear'];
const PIECE = new Int8Array(model.T.length / 3);
let axisY = 0, axisN = 0;
for (let t = 0; t < model.T.length / 3; t++) {
  const c = centroid(t);
  const nac = NACELLE.find((x) => Math.abs(c[0] - x) < 1.6);
  if (nac !== undefined && c[2] > PROP.z0 && !GLASS_MATS.has(model.M[t])) {
    PIECE[t] = PROPS;
    axisY += c[1]; axisN++;
    continue;
  }
  if (NACELLE.some((x) => Math.abs(c[0] - x) < MAIN.x) && c[1] < MAIN.y && c[2] > MAIN.z0 && c[2] < MAIN.z1) { PIECE[t] = GEAR; continue; }
  if (Math.abs(c[0] - X0) < NOSE.x && c[1] < NOSE.y && c[2] > NOSE.z0 && c[2] < NOSE.z1) { PIECE[t] = GEAR; continue; }
  PIECE[t] = GLASS_MATS.has(model.M[t]) ? GLASS : BODY;
}
// The hubs: the middle of each airscrew, which is what it turns about.
const hubs = NACELLE.map((x) => {
  let s = [0, 0, 0], n = 0;
  for (let t = 0; t < model.T.length / 3; t++) {
    if (PIECE[t] !== PROPS) continue;
    const c = centroid(t);
    if (Math.abs(c[0] - x) > 1.6) continue;
    s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++;
  }
  return [s[0] / n, s[1] / n, s[2] / n];
});
console.log('hubs (model units)', hubs.map((h) => h.map((v) => v.toFixed(2)).join(',')));

// Into her own frame, everything.
const toHer = (x, y, z) => [(x - X0) * S, (y - Y0) * S, (z - Z0) * S];
for (let i = 0; i < P.length; i += 3) {
  const q = toHer(P[i], P[i + 1], P[i + 2]);
  P[i] = q[0]; P[i + 1] = q[1]; P[i + 2] = q[2];
}
const HUBS = hubs.map((h) => toHer(...h));

// ---- her paint ------------------------------------------------------------
// Each texture decoded once, at no more than 1024 pixels a side; a point's
// colour is the texture under it. The model's materials are specular-
// glossiness: the paint is the diffuse.
const tex = new Map();
async function texture(mi) {
  if (tex.has(mi)) return tex.get(mi);
  const mat = j.materials[mi] || {};
  const sg = (mat.extensions && mat.extensions.KHR_materials_pbrSpecularGlossiness) || {};
  let t = null;
  if (sg.diffuseTexture) {
    const img = j.images[j.textures[sg.diffuseTexture.index].source];
    const s = sharp(Buffer.from(model.views[img.bufferView]));
    const meta = await s.metadata();
    const w = Math.min(1024, meta.width), h = Math.min(1024, meta.height);
    const { data, info } = await s.resize(w, h).blur(0.8).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    t = { data, w: info.width, h: info.height };
  }
  const f = sg.diffuseFactor || [1, 1, 1, 1];
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
 * the same point welded, decimated to `keep` of its faces, and moved so
 * `about` is its origin.
 */
async function piece(which, keep, about = [0, 0, 0], tint = null) {
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
  console.log(`  ${NAMES[which]}: ${nt} -> ${m.T.length / 3} faces, ${m.P.length / 3} points`);
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

console.log('pieces:');
const body = await piece(BODY, +(process.env.KEEP || 0.45));
const glass = await piece(GLASS, 0.6);
const gear = await piece(GEAR, 0.4);
// One airscrew, the port one's, about its own hub.
const propAll = await piece(PROPS, 0.6);
const prop = { P: [], N: [], C: [], T: [] };
{
  const hub = HUBS[0];
  const map = new Map();
  for (let t = 0; t < propAll.T.length / 3; t++) {
    const a = propAll.T[t * 3];
    if (propAll.P[a * 3] > 0) continue;
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
let propR = 0;
for (let i = 0; i < prop.P.length; i += 3) propR = Math.max(propR, Math.hypot(prop.P[i], prop.P[i + 1]));
const box = (m) => {
  const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.P.length; i += 3) for (let c = 0; c < 3; c++) { a[c] = Math.min(a[c], m.P[i + c]); b[c] = Math.max(b[c], m.P[i + c]); }
  return [a, b];
};
const [blo, bhi] = box(body);
console.log('her box', blo.map((v) => v.toFixed(2)), bhi.map((v) => v.toFixed(2)), 'airscrew radius', propR.toFixed(2));

const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
const META = {
  span: SPAN,
  length: +(bhi[2] - blo[2]).toFixed(2),
  hubs: HUBS.map(r3),
  propR: +propR.toFixed(2),
  // Her bomb bay, under her wing: where the bombs leave her.
  bay: [0, +(0.95).toFixed(2), 0.4],
  // The fifty in her nose, which is what she fires forward.
  guns: [[0, 1.6, +(bhi[2] - 0.2).toFixed(2)]],
  tips: [[-SPAN / 2 + 0.3, 2.4, 0.3], [SPAN / 2 - 0.3, 2.4, 0.3]],
};

const lines = [
  "// Generated by build/b25-source.mjs from the B-25s on the owner's Hornet.",
  '// Do not hand-edit -- regenerate from assets/models/u.s._navy_aircraft_carrier_uss_hornetcv-8-maximum-compressed.glb instead.',
  `export const B25_PIECES = ${JSON.stringify({ body: packed(body), glass: packed(glass), prop: packed(prop), gear: packed(gear) })};`,
  `export const B25_META = ${JSON.stringify(META)};`,
  '',
];
writeFileSync(OUT, lines.join('\n'));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${(lines.join('\n').length / 1024).toFixed(0)} KB`, JSON.stringify(META));
