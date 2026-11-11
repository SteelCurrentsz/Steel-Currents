// Turn the owner's model of a Liberty ship into what
// client/js/render/libertyHull.js ships: her hull, her superstructure, her
// masts, booms and every fitting on her as one textured mesh, drawn in the
// model's own paint; her 4-inch as the model drew it, cut free of her, the
// barrel apart from the carriage so it can elevate; and where every gun of
// hers stands -- her two 4-inch, bow and stern, and her eight Oerlikons: the
// six the model drew in their tubs (lifted out of her, the owner's own
// Oerlikon is drawn in their place) and two more on her forecastle gun
// platform.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-liberty-hull.mjs [model.glb]
//
// Reads assets/models/liberty_ship-maximum-compressed.glb as the owner
// uploaded it: "Liberty ship" by AlanTinka (https://skfb.ly/oIxAL), under
// Creative Commons Attribution 4.0 -- credited on the game's Credits screen.
// A Sketchfab export of the whole ship in one piece and one material, painted
// off one texture atlas, bow along +Z.
//
// Unlike the warships, she keeps the model's own texture: her black topsides,
// red bottom, white house and rust streaks are the model's, laid on her by its
// own texture coordinates (LIBERTY_TEXTURE). Her 4-inch is painted off the
// same atlas at the colour each face samples to.
//
// Writes client/js/render/libertyHull.data.js, which is committed, so a fresh
// clone runs without this script.
//
// BOX=x0,x1,y0,y1,z0,z1 lists the model's parts standing wholly inside that
// box, in metres of her frame: what her guns are found among.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heightmap, heightBytes, pack, packPieceCompact, stations } from './sculpt.mjs';
import { measureLines } from './sculpt-parts.mjs';
import { KGV_GUNS } from '../client/js/render/kgvHull.data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptDecoder } = require('meshoptimizer');
const OUT_DATA = path.join(ROOT, 'client/js/render/libertyHull.data.js');

// ---- her model ---------------------------------------------------------------------
const SRC = process.argv[2] || path.join(ROOT, 'assets/models/liberty_ship-maximum-compressed.glb');
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
  const P = [], N = [], UV = [], T = [];
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
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, N, UV, T, j, views };
}

const model = await flatten(glb);
const { j } = model;
console.log('model:', model.T.length / 3, 'triangles,', model.P.length / 3, 'points');

// ---- her frame -----------------------------------------------------------------------
// The model is 0.1407 units from her stem to the after edge of her rudder:
// her 441 ft 6 in overall, 134.57 m. That one scale makes her 17.3 m across
// her hull, as she was. She floats on the line the model paints her bottom
// red up to (WATERLINE_MODEL), her 27 ft 9 in, 8.46 m, of load draught.
export const REAL_LOA = 134.57;
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < model.P.length; i += 3) {
  for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.P[i + c]); hi[c] = Math.max(hi[c], model.P[i + c]); }
}
export const SCALE = REAL_LOA / (hi[2] - lo[2]);
const ZC = (lo[2] + hi[2]) / 2;
const KEEL = lo[1];
export const DRAFT = +(process.env.DRAFT ?? 8.46);
for (let i = 0; i < model.P.length; i += 3) {
  model.P[i] = model.P[i] * SCALE;
  model.P[i + 1] = (model.P[i + 1] - KEEL) * SCALE - DRAFT;
  model.P[i + 2] = (model.P[i + 2] - ZC) * SCALE;
}
// And put on her centreline: the model stands her a third of a metre to port
// of its own origin. Her middle is the middle of her waterline amidships.
export const XC = (() => {
  let a = Infinity, b = -Infinity;
  for (let i = 0; i < model.P.length; i += 3) {
    if (Math.abs(model.P[i + 2]) < 15 && model.P[i + 1] > -1 && model.P[i + 1] < 2) { a = Math.min(a, model.P[i]); b = Math.max(b, model.P[i]); }
  }
  return (a + b) / 2;
})();
for (let i = 0; i < model.P.length; i += 3) model.P[i] -= XC;
console.log(`frame: x${SCALE.toFixed(1)}, ${REAL_LOA} m long, x ${(lo[0] * SCALE).toFixed(2)}..${(hi[0] * SCALE).toFixed(2)}, truck ${((hi[1] - KEEL) * SCALE - DRAFT).toFixed(2)}`);

// ---- her parts -------------------------------------------------------------------------
// The model is one mesh, and its parts are the runs of faces that hang
// together: every face joined to the next by a point the two share.
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
  let p = PARTS.get(partOf[t]);
  if (!p) PARTS.set(partOf[t], p = { id: partOf[t], tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
  p.tris.push(t);
  for (let k = 0; k < 3; k++) {
    const v = model.T[t * 3 + k];
    for (let c = 0; c < 3; c++) { p.lo[c] = Math.min(p.lo[c], model.P[v * 3 + c]); p.hi[c] = Math.max(p.hi[c], model.P[v * 3 + c]); }
  }
}
console.log(`parts: ${PARTS.size}`);
const f2 = (v) => v.toFixed(2);
const describe = (p) => `part ${p.id} ${p.tris.length}t x ${f2(p.lo[0])}..${f2(p.hi[0])} y ${f2(p.lo[1])}..${f2(p.hi[1])} z ${f2(p.lo[2])}..${f2(p.hi[2])}`;
/** The parts standing wholly inside a box [x0, x1, y0, y1, z0, z1], in metres of her frame. */
const partsIn = ([x0, x1, y0, y1, z0, z1]) => [...PARTS.values()].filter((p) => p.lo[0] >= x0 && p.hi[0] <= x1
  && p.lo[1] >= y0 && p.hi[1] <= y1 && p.lo[2] >= z0 && p.hi[2] <= z1);
if (process.env.BOX) {
  for (const p of partsIn(process.env.BOX.split(',').map(Number))) console.log(describe(p));
  process.exit(0);
}

// ---- her guns, found ---------------------------------------------------------------------
// Every gun the model drew, by the box it stands in: whatever is wholly inside
// the box is the gun, and the deck, the platform and the tub round it are
// not. Her 4-inch on her forecastle platform looking forward and on her poop
// looking aft, alike; four Oerlikons in the tubs at the corners of her flying
// bridge, and two in the tubs on the fore end of her poop deckhouse.
const GUN_BOXES = {
  main: [
    [-1.1, 1.2, 8.4, 10.5, 56, 62.3],
    [-1.3, 1.3, 5.5, 7.5, -67.5, -61],
  ],
  oerlikon: [
    [3.6, 6.0, 10.5, 13, -7.2, -5.2],
    [-5.7, -3.9, 10.5, 13, -7.2, -5.2],
    [3.6, 5.2, 10.5, 13, 4.6, 6.2],
    [-5.1, -3.5, 10.5, 13, 4.6, 6.2],
    [1.9, 3.5, 5.5, 8, -56.2, -54.6],
    [-3.5, -1.9, 5.5, 8, -56.2, -54.6],
  ],
};
const GUN_OF = new Int8Array(nTri).fill(-1);
const FOUND = Object.fromEntries(Object.entries(GUN_BOXES).map(([kind, boxes]) => [kind, boxes.map((b) => {
  const tris = partsIn(b).flatMap((p) => p.tris);
  if (!tris.length) throw new Error(`no ${kind} in ${b}`);
  for (const t of tris) GUN_OF[t] = 1;
  return tris;
})]));
for (const [k, list] of Object.entries(FOUND)) console.log(`${k}: ${list.map((l) => l.length).join(', ')} triangles`);

// ---- her paint ---------------------------------------------------------------------------
// The model's base colour atlas, as it came; what her guns are painted with is
// sampled off it, and her hull carries it as it is.
const atlas = await (async () => {
  const img = j.images[j.textures[j.materials[0].pbrMetallicRoughness.baseColorTexture.index].source];
  const png = Buffer.from(model.views[img.bufferView]);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { png, data, w: info.width, h: info.height };
})();
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** The atlas's colour at (u, v), linear, 0..1 a channel: glTF's v runs down the image. */
function sample(u, v) {
  const x = Math.min(atlas.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * atlas.w)));
  const y = Math.min(atlas.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * atlas.h)));
  const i = (y * atlas.w + x) * 3;
  return [toLin(atlas.data[i] / 255), toLin(atlas.data[i + 1] / 255), toLin(atlas.data[i + 2] / 255)];
}
/** A face's colour: the atlas at its middle and towards each of its corners, averaged. */
function faceColour(t) {
  const [a, b, c] = [model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]];
  const U = model.UV;
  const sum = [0, 0, 0];
  const W = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
  for (const [wa, wb, wc] of W) {
    const s = sample(U[a * 2] * wa + U[b * 2] * wb + U[c * 2] * wc, U[a * 2 + 1] * wa + U[b * 2 + 1] * wb + U[c * 2 + 1] * wc);
    for (let k = 0; k < 3; k++) sum[k] += s[k] / W.length;
  }
  return sum;
}

// ---- her hull ----------------------------------------------------------------------------
/** The triangles picked, as a mesh of their own: positions, normals, UVs and a colour a face. */
function subMesh(tris) {
  const map = new Map();
  const P = [], N = [], UV = [], T = [], C = [];
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      let w = map.get(v);
      if (w === undefined) {
        w = P.length / 3; map.set(v, w);
        P.push(model.P[v * 3], model.P[v * 3 + 1], model.P[v * 3 + 2]);
        N.push(model.N[v * 3], model.N[v * 3 + 1], model.N[v * 3 + 2]);
        UV.push(model.UV[v * 2], model.UV[v * 2 + 1]);
      }
      T.push(w);
    }
    C.push(faceColour(t));
  }
  return { P, N, UV, T, C };
}
const hull = subMesh([...Array(nTri).keys()].filter((t) => GUN_OF[t] < 0));
console.log('hull:', hull.T.length / 3, 'triangles,', hull.P.length / 3, 'points');
export const LOA = REAL_LOA;

// Her surface, as a height map: what every mounting is seated on.
const HM = { x0: -10, z0: -68, step: 0.5, nx: 41, nz: 273 };
const hm = heightmap(hull, HM);

// Her lines, as the model has them: what her interior is fitted under (see
// measureLines). Her deck is her main deck, 4.4 m over her waterline amidships.
const st = stations(hull, { length: LOA, beamCap: 5.0, edgeCap: 10.0, slice: true, beamFloor: -6 });
const LINES = measureLines(hull, st, { z0: -66, dz: 1, nz: 133, y0: -9, dy: 0.5, ny: 34 }, 4.4);
console.log('lines: keel', Math.min(...LINES.keel).toFixed(2), 'deck', Math.min(...LINES.deck).toFixed(2), '..', Math.max(...LINES.deck).toFixed(2));

// Packed as it is, positions, normals and the model's own texture
// coordinates, every point white: the atlas is her paint.
const white = new Uint8Array(hull.P.length).fill(255);
const packed = pack(hull, white, Float32Array.from(hull.UV), { buckets: +(process.env.BUCKETS || 40), length: LOA });
console.log('packed hull', packed.blob.length, 'bytes in', packed.buckets, 'slices');
// The atlas, as a JPEG small enough to carry.
const jpeg = await sharp(atlas.png).removeAlpha().resize(+(process.env.TEX || 1024)).jpeg({ quality: +(process.env.Q || 82), mozjpeg: true }).toBuffer();
console.log('atlas', jpeg.length, 'bytes');

// ---- her guns, cut free ------------------------------------------------------------------
/** A gun's parts, each run of faces that hangs together, in the frame of her. */
function gunMesh(tris) {
  const m = subMesh(tris);
  m.part = tris.map((t) => partOf[t]);
  return m;
}
/**
 * Where a mounting stands and which way it faces: its pivot is the middle of
 * its foot -- the lowest 0.4 m of it -- and it faces its furthest point from
 * there, the muzzle.
 */
function seatOf(m, foot = 0.4) {
  let y0 = Infinity;
  for (let i = 1; i < m.P.length; i += 3) y0 = Math.min(y0, m.P[i]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < m.P.length; i += 3) {
    if (m.P[i + 1] > y0 + foot) continue;
    x0 = Math.min(x0, m.P[i]); x1 = Math.max(x1, m.P[i]); z0 = Math.min(z0, m.P[i + 2]); z1 = Math.max(z1, m.P[i + 2]);
  }
  const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  let far = -1, rest = 0;
  for (let i = 0; i < m.P.length; i += 3) {
    const d = Math.hypot(m.P[i] - x, m.P[i + 2] - z);
    if (d > far) { far = d; rest = Math.atan2(m.P[i] - x, m.P[i + 2] - z); }
  }
  return { x, z, y: y0, rest };
}
/** A mesh put in the frame of its mounting: pivot at the origin, its foot at y = 0, facing +Z. */
function toMount(m, s) {
  const c = Math.cos(-s.rest), sn = Math.sin(-s.rest);
  const P = m.P.slice(), N = m.N.slice();
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i] - s.x, z = P[i + 2] - s.z;
    P[i] = x * c + z * sn; P[i + 1] -= s.y; P[i + 2] = -x * sn + z * c;
    const nx = N[i], nz = N[i + 2];
    N[i] = nx * c + nz * sn; N[i + 2] = -nx * sn + nz * c;
  }
  return { ...m, P, N };
}
/** A piece packed as the fleet packs a gun: compact, painted a point. */
function packPiece(m) {
  const col = new Array(m.P.length / 3).fill(null);
  for (let t = 0; t < m.T.length / 3; t++) for (let k = 0; k < 3; k++) {
    const v = m.T[t * 3 + k];
    col[v] = m.C[t].map((c) => Math.round(Math.min(1, c) * 255));
  }
  return packPieceCompact(m, (i) => col[i] || [80, 80, 80]).toString('base64');
}
/** Some of a mesh's faces, as a mesh of their own. */
function pick(m, keep) {
  const map = new Map();
  const P = [], N = [], T = [], C = [];
  for (let t = 0; t < m.T.length / 3; t++) {
    if (!keep(t)) continue;
    for (let k = 0; k < 3; k++) {
      const v = m.T[t * 3 + k];
      let w = map.get(v);
      if (w === undefined) { w = P.length / 3; map.set(v, w); P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); N.push(m.N[v * 3], m.N[v * 3 + 1], m.N[v * 3 + 2]); }
      T.push(w);
    }
    C.push(m.C[t]);
  }
  return { P, N, T, C };
}

// Her 4-inch: the barrel and what elevates with it -- every part of the gun
// that lies along the bore and stands out ahead of the pedestal, at the height
// of the bore -- on a cradle about its trunnions; the pedestal, the carriage,
// the sights and the seats train.
const MAIN = (() => {
  const raw = gunMesh(FOUND.main[0]);
  const s0 = seatOf(raw);
  // Facing straight along her barrel: the middle of its muzzle end, not the
  // furthest corner of it.
  let bx = 0, bz = 0, bn = 0;
  {
    const len = new Map();
    for (let t = 0; t < raw.T.length / 3; t++) {
      const id = raw.part[t];
      let l = len.get(id);
      if (!l) len.set(id, l = { z0: Infinity, z1: -Infinity, d0: Infinity, d1: -Infinity });
      for (let k = 0; k < 3; k++) {
        const v = raw.T[t * 3 + k];
        const d = (raw.P[v * 3] - s0.x) * Math.sin(s0.rest) + (raw.P[v * 3 + 2] - s0.z) * Math.cos(s0.rest);
        l.d0 = Math.min(l.d0, d); l.d1 = Math.max(l.d1, d);
      }
    }
    const [bid] = [...len].sort((a, b) => (b[1].d1 - b[1].d0) - (a[1].d1 - a[1].d0))[0];
    for (let t = 0; t < raw.T.length / 3; t++) {
      if (raw.part[t] !== bid) continue;
      for (let k = 0; k < 3; k++) { const v = raw.T[t * 3 + k]; bx += raw.P[v * 3]; bz += raw.P[v * 3 + 2]; bn++; }
    }
  }
  const s = { ...s0, rest: Math.atan2(bx / bn - s0.x, bz / bn - s0.z) };
  const m = toMount(raw, s);
  // Parts, by the run of faces each is.
  const box = new Map();
  for (let t = 0; t < m.T.length / 3; t++) {
    const id = m.part[t];
    let b = box.get(id);
    if (!b) box.set(id, b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], n: 0 });
    b.n++;
    for (let k = 0; k < 3; k++) {
      const v = m.T[t * 3 + k];
      for (let c = 0; c < 3; c++) { b.lo[c] = Math.min(b.lo[c], m.P[v * 3 + c]); b.hi[c] = Math.max(b.hi[c], m.P[v * 3 + c]); }
    }
  }
  // The bore: the longest part along it is the barrel.
  let barrel = null;
  for (const [id, b] of box) if (!barrel || b.hi[2] - b.lo[2] > barrel.b.hi[2] - barrel.b.lo[2]) barrel = { id, b };
  const boreY = (barrel.b.lo[1] + barrel.b.hi[1]) / 2;
  const elevates = new Set();
  for (const [id, b] of box) {
    const mid = b.lo.map((l, c) => (l + b.hi[c]) / 2);
    const is = Math.abs(mid[0]) < 0.35 && Math.abs(mid[1] - boreY) < 0.3 && b.hi[0] - b.lo[0] < 0.6;
    if (process.env.PARTS) console.log(`  ${is ? 'E' : ' '} ${id} ${b.n}t x ${f2(b.lo[0])}..${f2(b.hi[0])} y ${f2(b.lo[1])}..${f2(b.hi[1])} z ${f2(b.lo[2])}..${f2(b.hi[2])}`);
    if (is) elevates.add(id);
  }
  // The trunnions: under the middle of what elevates, at the height of the bore.
  let zs = 0, n = 0;
  for (const id of elevates) { const b = box.get(id); zs += (b.lo[2] + b.hi[2]) / 2 * b.n; n += b.n; }
  const trunnion = [0, +boreY.toFixed(3), +(Math.min(zs / n, 0.2)).toFixed(3)];
  const house = pick(m, (t) => !elevates.has(m.part[t]));
  const gun = pick(m, (t) => elevates.has(m.part[t]));
  for (let i = 0; i < gun.P.length; i += 3) { gun.P[i + 1] -= trunnion[1]; gun.P[i + 2] -= trunnion[2]; }
  let roof = 0;
  for (let i = 1; i < m.P.length; i += 3) roof = Math.max(roof, m.P[i]);
  const muzzle = [0, 0, +(barrel.b.hi[2] - trunnion[2]).toFixed(3)];
  console.log(`main: seat (${f2(s.x)}, ${f2(s.y)}, ${f2(s.z)}) rest ${(s.rest * 180 / Math.PI).toFixed(1)}, house ${house.T.length / 3}t, gun ${gun.T.length / 3}t, trunnion ${trunnion}, muzzle ${muzzle}, roof ${roof.toFixed(2)}`);
  return { house: packPiece(house), guns: packPiece(gun), trunnion, muzzles: [muzzle], pitch: 0, roof: +roof.toFixed(3) };
})();

/** Every mounting of a kind where it stands: pivot, seat, which way it faces. */
const MOUNTS = Object.fromEntries(Object.entries(FOUND).map(([kind, list]) => [kind, list.map((tris) => {
  const s = seatOf(gunMesh(tris));
  return { x: +s.x.toFixed(3), z: +s.z.toFixed(3), y: +s.y.toFixed(3), rest: +s.rest.toFixed(4) };
})]));
// And the two Oerlikons the model has no tubs for, which make her eight: on
// her forecastle gun platform, either side abaft her 4-inch, where she
// carried a pair. Seated on the platform, off her height map.
{
  const seat = (x, z) => {
    const ys = [];
    for (let dz = -0.5; dz <= 0.5; dz += 0.5) for (let dx = -0.5; dx <= 0.5; dx += 0.5) {
      const i = Math.round((x + dx - HM.x0) / HM.step), k = Math.round((z + dz - HM.z0) / HM.step);
      ys.push(hm[k * HM.nx + i]);
    }
    ys.sort((a, b) => a - b);
    return ys[ys.length >> 1];
  };
  for (const x of [2.6, -2.6]) MOUNTS.oerlikon.push({ x, z: 54, y: +seat(x, 54).toFixed(3), rest: Math.sign(x) * Math.PI / 2, added: true });
}
for (const [k, list] of Object.entries(MOUNTS)) console.log(k, list.map((s) => `(${s.x}, ${s.z}) y ${s.y} rest ${(s.rest * 180 / Math.PI).toFixed(0)}`).join('\n   '));

// ---- write ---------------------------------------------------------------------------------
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-liberty-hull.mjs from the owner's model.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const LIBERTY_HULL_B64 = ${JSON.stringify(packed.blob.toString('base64'))};\n`
  + `// The model's own paint: its base colour atlas, which her hull's texture\n`
  + `// coordinates are laid on.\n`
  + `export const LIBERTY_TEXTURE = ${JSON.stringify(`data:image/jpeg;base64,${jpeg.toString('base64')}`)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see libertySurfaceY.\n`
  + `export const LIBERTY_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 4-inch as the model drew it, in the frame of its own mounting: what\n`
  + `// trains, and what elevates about its trunnions; and her Oerlikon, the\n`
  + `// owner's own model of one, as the King George V carries it.\n`
  + `export const LIBERTY_GUNS = ${JSON.stringify({ main: MAIN, oerlikon: KGV_GUNS.oerlikon })};\n`
  + `// Where every one of her guns stands, and which way the model faces it.\n`
  + `export const LIBERTY_MOUNTS = ${JSON.stringify(MOUNTS)};\n`
  + `// Her lines as the model has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const LIBERTY_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', path.relative(ROOT, OUT_DATA), `${(readFileSync(OUT_DATA).length / 1e6).toFixed(2)} MB`);
