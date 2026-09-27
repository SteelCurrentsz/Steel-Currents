// Turn the reference Graf Spee sculpt into what client/js/render/speeHull.js
// actually ships: calibrated world-space triangles, painted by height and by
// how much each vertex's normal faces the sky (there is no UV map to paint a
// texture onto), bucketed into length-wise slices -- so the fleet's own
// symmetry, hole and floating-part checks, which all reason about one part at
// a time, see something shaped like what every other builder in spee.js hands
// them, instead of one part spanning her whole two hundred metres -- and
// packed into one small binary blob, base64'd into a source file spee.js
// decodes synchronously. No loader, no fetch, no async: this ships the same
// way every other piece of geometry in the game does.
//
//   node build/prepare-spee-hull.mjs
//
// Reads assets/models/spee-hull.glb, writes
// client/js/render/speeHull.data.js. Re-run it whenever the source asset or
// the calibration below changes; the data file is committed, not built on
// every install, so a fresh clone runs without needing this script at all.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || path.join(ROOT, 'assets/models/spee-hull.glb');
const OUT_DATA = process.argv[3]
  || path.join(ROOT, 'client/js/render/speeHull.data.js');

// ---- read the glb -----------------------------------------------------
const buf = readFileSync(SRC);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const acc = json.accessors, bv = json.bufferViews;
const prim = json.meshes[0].primitives[0];
const posAcc = acc[prim.attributes.POSITION];
const nrmAcc = acc[prim.attributes.NORMAL];
const idxAcc = acc[prim.indices];
// VEC3-of-float accessors only, but the source buffer may interleave several
// attributes in one bufferView (gltf-transform's simplify output packs
// position+normal together with byteStride: 24) -- reading it as if it were
// tightly packed silently reads every attribute's bytes as if they were the
// next vertex's, which corrupts everything after the first vertex without
// throwing. So every read respects byteStride explicitly.
const readVec3 = (a) => {
  const v = bv[a.bufferView];
  const stride = v.byteStride || 12;
  const base = bin.byteOffset + v.byteOffset + (a.byteOffset || 0);
  const out = new Float32Array(a.count * 3);
  const dv = new DataView(bin.buffer);
  for (let i = 0; i < a.count; i++) {
    const p = base + i * stride;
    out[i * 3] = dv.getFloat32(p, true);
    out[i * 3 + 1] = dv.getFloat32(p + 4, true);
    out[i * 3 + 2] = dv.getFloat32(p + 8, true);
  }
  return out;
};
const readIdx = (a) => {
  const v = bv[a.bufferView];
  const stride = v.byteStride || (a.componentType === 5125 ? 4 : 2);
  const base = bin.byteOffset + v.byteOffset + (a.byteOffset || 0);
  const dv = new DataView(bin.buffer);
  const out = new (a.componentType === 5125 ? Uint32Array : Uint16Array)(a.count);
  for (let i = 0; i < a.count; i++) {
    const p = base + i * stride;
    out[i] = a.componentType === 5125 ? dv.getUint32(p, true) : dv.getUint16(p, true);
  }
  return out;
};
const rawPos = readVec3(posAcc);
const rawNrm = readVec3(nrmAcc);
const rawIdx = readIdx(idxAcc);
const nv = posAcc.count;
console.log('source', nv, 'verts', rawIdx.length / 3, 'tris');

// ---- calibration: local (x=length,bow=+x; y=up; z=beam) -> game world ----
// (+Z bow, +Y up, y=0 waterline). Two-point fit on Y (keel, masthead-top);
// length-based uniform scale; centred on length and on beam.
let minX = Infinity, maxX = -Infinity;
for (let i = 0; i < nv; i++) { const x = rawPos[i * 3]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
const xc = (minX + maxX) / 2;
const localLen = maxX - minX;
const REAL_LOA = 186;
const SCALE = REAL_LOA / localLen;

const band = localLen * 0.06;
let localKeel = Infinity;
for (let i = 0; i < nv; i++) {
  const x = rawPos[i * 3]; if (Math.abs(x - xc) > band) continue;
  const y = rawPos[i * 3 + 1]; if (y < localKeel) localKeel = y;
}
const REAL_KEEL_Y = -7.44; // spee.js keelY(0)

// world_X = local_Z * SCALE
// world_Y = (local_Y - localKeel) * SCALE + REAL_KEEL_Y
// world_Z = (local_X - xc) * SCALE
function toWorld(lx, ly, lz) {
  return [lz * SCALE, (ly - localKeel) * SCALE + REAL_KEEL_Y, (lx - xc) * SCALE];
}
function normalToWorld(nx, ny, nz) {
  // Axis permutation only (no shear/non-uniform scale beyond a single
  // uniform factor), so the same remap carries normals unchanged in
  // direction; renormalise for safety against decimation drift.
  const wx = nz, wy = ny, wz = nx;
  const len = Math.hypot(wx, wy, wz) || 1;
  return [wx / len, wy / len, wz / len];
}

console.log('calibration: SCALE', SCALE.toFixed(3), 'xc', xc.toFixed(4), 'localKeel', localKeel.toFixed(4));

// ---- transform all verts once ----
const wx = new Float32Array(nv), wy = new Float32Array(nv), wz = new Float32Array(nv);
const wnx = new Float32Array(nv), wny = new Float32Array(nv), wnz = new Float32Array(nv);
for (let i = 0; i < nv; i++) {
  const [X, Y, Z] = toWorld(rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2]);
  wx[i] = X; wy[i] = Y; wz[i] = Z;
  const [NX, NY, NZ] = normalToWorld(rawNrm[i * 3], rawNrm[i * 3 + 1], rawNrm[i * 3 + 2]);
  wnx[i] = NX; wny[i] = NY; wnz[i] = NZ;
}
let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
for (let i = 0; i < nv; i++) {
  if (wx[i] < bx0) bx0 = wx[i]; if (wx[i] > bx1) bx1 = wx[i];
  if (wy[i] < by0) by0 = wy[i]; if (wy[i] > by1) by1 = wy[i];
  if (wz[i] < bz0) bz0 = wz[i]; if (wz[i] > bz1) bz1 = wz[i];
}
console.log('world bbox X', bx0.toFixed(2), bx1.toFixed(2));
console.log('world bbox Y', by0.toFixed(2), by1.toFixed(2));
console.log('world bbox Z', bz0.toFixed(2), bz1.toFixed(2));

// ---- fix inconsistent triangle winding ---------------------------------
// The source mesh's winding cannot be trusted: gltf-transform's quadric
// decimation can flip a triangle's index order as it collapses an edge, and
// this sculpt came out of that with a scattered mix of correctly- and
// backwards-wound triangles -- not one clean global flip, which would at
// least be uniform and cheap to correct, but a triangle-by-triangle mixture
// that showed up at render time as the hull sprouting holes wherever the
// winding lost, worst from a close three-quarter angle where the culled
// backwards faces are most exposed. Every triangle is put back facing the
// way its own vertex normals already agree it should: the geometric normal
// from its (world-space) edges is compared against the average of its three
// vertex normals, and the index order is swapped wherever the two disagree.
const triCount = rawIdx.length / 3;
let flipped = 0;
for (let t = 0; t < triCount; t++) {
  const ia = rawIdx[t * 3], ib = rawIdx[t * 3 + 1], ic = rawIdx[t * 3 + 2];
  const e1x = wx[ib] - wx[ia], e1y = wy[ib] - wy[ia], e1z = wz[ib] - wz[ia];
  const e2x = wx[ic] - wx[ia], e2y = wy[ic] - wy[ia], e2z = wz[ic] - wz[ia];
  const fnx = e1y * e2z - e1z * e2y;
  const fny = e1z * e2x - e1x * e2z;
  const fnz = e1x * e2y - e1y * e2x;
  const vnx = wnx[ia] + wnx[ib] + wnx[ic];
  const vny = wny[ia] + wny[ib] + wny[ic];
  const vnz = wnz[ia] + wnz[ib] + wnz[ic];
  const dot = fnx * vnx + fny * vny + fnz * vnz;
  if (dot < 0) {
    rawIdx[t * 3 + 1] = ic;
    rawIdx[t * 3 + 2] = ib;
    flipped++;
  }
}
console.log('winding fixed:', flipped, 'of', triCount, 'triangles were backwards');

// ---- recompute vertex normals from the corrected geometry --------------
// The source normals only had to be good enough to call the winding above --
// agreeing on which way is roughly out is not the same as being smooth
// enough to shade with, and a decimator's normals can be noisy in a way a
// directional heuristic still sees through but Lambert shading would not.
// An area-weighted face normal, accumulated at each vertex from the
// triangles that now consistently agree on which way they face and
// renormalised, is smooth by construction and does not carry that noise
// forward.
const newNrm = new Float32Array(nv * 3);
for (let t = 0; t < triCount; t++) {
  const ia = rawIdx[t * 3], ib = rawIdx[t * 3 + 1], ic = rawIdx[t * 3 + 2];
  const e1x = wx[ib] - wx[ia], e1y = wy[ib] - wy[ia], e1z = wz[ib] - wz[ia];
  const e2x = wx[ic] - wx[ia], e2y = wy[ic] - wy[ia], e2z = wz[ic] - wz[ia];
  const fnx = e1y * e2z - e1z * e2y;
  const fny = e1z * e2x - e1x * e2z;
  const fnz = e1x * e2y - e1y * e2x;
  for (const v of [ia, ib, ic]) {
    newNrm[v * 3] += fnx; newNrm[v * 3 + 1] += fny; newNrm[v * 3 + 2] += fnz;
  }
}
for (let i = 0; i < nv; i++) {
  const x = newNrm[i * 3], y = newNrm[i * 3 + 1], z = newNrm[i * 3 + 2];
  const len = Math.hypot(x, y, z) || 1;
  wnx[i] = x / len; wny[i] = y / len; wnz[i] = z / len;
}

// ---- a crude UV so the steel-plating texture every other ship gets has
// something to sample: not a real unwrap (nothing marks where a seam should
// fall), just length over STEEL_TILE and girth-height over the same, which
// gives the plating noise something continuous to land on rather than
// leaving the hull an unlit flat tint. The real UV work a proper unwrap wants
// is future work, not this pass.
const STEEL_TILE = 16.0;
const uvArr = new Float32Array(nv * 2);
for (let i = 0; i < nv; i++) {
  uvArr[i * 2] = wz[i] / STEEL_TILE;
  uvArr[i * 2 + 1] = wy[i] / STEEL_TILE;
}

// ---- paint: height/normal -> the hull palette ----
// A material built with `new THREE.Color(hex)` -- which is every other
// colour in this game, always read off a hex constant -- is decoded from
// sRGB to the renderer's linear working space automatically; that is what
// makes a hex constant chosen by eye come out on screen looking like the
// colour it was chosen to look like. A raw vertex-colour byte buffer gets no
// such decode: the renderer takes it as already-linear and encodes it back
// to sRGB for display, which is a brightening curve, not the identity, and
// it is why these four colours, packed straight from the hex below, rendered
// as a nearly featureless pale wash -- correct-looking hue survived only
// where a channel was already low (the antifouling red kept reading red),
// everything closer to mid-grey bleached toward white. sRGB-decoding each
// byte here before it is packed is the same conversion `new THREE.Color`
// does internally, done once at build time instead of once a frame.
const srgbToLinearByte = (b) => {
  const c = b / 255;
  const lin = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return Math.round(lin * 255);
};
const paletteToLinear = (hex) => hex.map(srgbToLinearByte);
const HULL = paletteToLinear([0x6f, 0x78, 0x83]);
const BOOT = paletteToLinear([0x1d, 0x21, 0x26]);
const ANTI = paletteToLinear([0x71, 0x35, 0x2c]);
const DECK = paletteToLinear([0x6a, 0x61, 0x53]);
const BOOT_LO = -2.2, BOOT_HI = 0.55;
const col = new Uint8Array(nv * 3);
for (let i = 0; i < nv; i++) {
  const y = wy[i], up = wny[i];
  let c;
  if (up > 0.55 && y > BOOT_HI - 0.5) c = DECK;
  else if (y < BOOT_LO) c = ANTI;
  else if (y <= BOOT_HI) c = BOOT;
  else c = HULL;
  col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
}

// ---- bucket triangles into Z-slices by centroid, re-indexing per bucket --
// Fine enough that a bucket's own bounding box -- which the fleet's
// floating-part check compares against the hull's beam at the bucket's
// midpoint station only -- stays a fair stand-in for the beam anywhere
// within it. Sixteen buckets put over eleven metres of her flaring bow
// taper in one box, so its widest point (near the box's aft edge) was
// compared against a midpoint far enough forward to still read narrow,
// which the check saw as hull material standing out past the ship's own
// side. Forty-eight keeps each slice under four metres.
const N_BUCKETS = 48;
const half = REAL_LOA / 2;
const bucketOf = (z) => Math.max(0, Math.min(N_BUCKETS - 1,
  Math.floor(((z + half) / REAL_LOA) * N_BUCKETS)));
const buckets = Array.from({ length: N_BUCKETS }, () => ({
  map: new Map(), pos: [], nrm: [], col: [], uv: [], idx: [],
}));
const ntri = rawIdx.length / 3;
for (let t = 0; t < ntri; t++) {
  const a = rawIdx[t * 3], b = rawIdx[t * 3 + 1], c = rawIdx[t * 3 + 2];
  const cz = (wz[a] + wz[b] + wz[c]) / 3;
  const bk = buckets[bucketOf(cz)];
  for (const v of [a, b, c]) {
    let li = bk.map.get(v);
    if (li === undefined) {
      li = bk.pos.length / 3;
      bk.map.set(v, li);
      bk.pos.push(wx[v], wy[v], wz[v]);
      bk.nrm.push(wnx[v], wny[v], wnz[v]);
      bk.col.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      bk.uv.push(uvArr[v * 2], uvArr[v * 2 + 1]);
    }
    bk.idx.push(li);
  }
}
const nonEmpty = buckets.filter((bk) => bk.idx.length > 0);
console.log('buckets', nonEmpty.length, 'of', N_BUCKETS, 'tri counts',
  nonEmpty.map((bk) => bk.idx.length / 3).join(','));

// ---- pack into one binary blob: header + per-bucket typed arrays --------
// Layout: u32 bucketCount; per bucket: u32 vertCount, u32 triCount, then
// Float32 pos[vertCount*3], Float32 nrm[vertCount*3], Uint8 col[vertCount*3],
// Float32 uv[vertCount*2], Uint16 idx[triCount*3] (every bucket has well
// under 65536 verts).
const parts = [];
const head = Buffer.alloc(4);
head.writeUInt32LE(nonEmpty.length, 0);
parts.push(head);
for (const bk of nonEmpty) {
  const nvb = bk.pos.length / 3, ntb = bk.idx.length / 3;
  if (nvb >= 65536) throw new Error('bucket too big for Uint16 indices: ' + nvb);
  const h = Buffer.alloc(8);
  h.writeUInt32LE(nvb, 0);
  h.writeUInt32LE(ntb, 4);
  parts.push(h);
  const pb = Buffer.from(Float32Array.from(bk.pos).buffer);
  const nb = Buffer.from(Float32Array.from(bk.nrm).buffer);
  const cb = Buffer.from(Uint8Array.from(bk.col).buffer);
  const uvb = Buffer.from(Float32Array.from(bk.uv).buffer);
  const ib = Buffer.from(Uint16Array.from(bk.idx).buffer);
  parts.push(pb, nb, cb, uvb, ib);
}
const blob = Buffer.concat(parts);
const b64 = blob.toString('base64');
console.log('packed blob', blob.length, 'bytes ->', b64.length, 'base64 chars');

writeFileSync(OUT_DATA,
  `// Generated by build/prepare-spee-hull.mjs from the reference sculpt. Do not\n`
  + `// hand-edit -- regenerate from the source asset instead.\n`
  + `export const SPEE_HULL_B64 = ${JSON.stringify(b64)};\n`);
console.log('wrote', OUT_DATA);
