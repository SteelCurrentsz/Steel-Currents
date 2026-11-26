// Thin the heaviest hulls where nobody can see it.
//
// A handful of the owner's models came through build/textured-hull.mjs at
// three to six times the triangles of the rest of the fleet -- the Louisiana
// at three quarters of a million -- and every one of them is paid for in
// full each time she is wanted: megabytes down the wire, unpacked, decoded,
// projected, her insides fitted to her plating, and all of it uploaded to
// the graphics card. Those were the ships that took longest to come in.
//
// This takes the hull a data file already holds and simplifies each of her
// length-wise slices in place, as the build would have written it: points
// that are the same point in every respect are made one, then edges are
// collapsed only where the surface moves by less than `--error` metres
// (two centimetres by default) and her paint and her normals hardly at all,
// and never along the cut between two slices, so they still meet. Her guns,
// her lines, her deck heights and everything else in the file are left as
// they are, and so is the format: the game reads her exactly as before.
//
//   npm i --no-save meshoptimizer@0.22
//   node build/thin-hull.mjs client/js/render/louisianaHull.data.js [--error 0.02]
//
// Run it again and it finds next to nothing more to do: what is left is what
// cannot go without being seen.
//
// Run, at two centimetres, on the Louisiana, the Oregon, the Suzuya, the
// Mogami, the Borgia and the Sevastopol. Not on the Yodo: thinned, even at
// one centimetre, a ray finds its way through her side where two pieces of
// her plating meet (see "the Yodo's shell has no holes in it" in the tests),
// so she is left as she was. Run the hole checks on any hull this touches.
import fs from 'node:fs';
import { MeshoptSimplifier as S, MeshoptEncoder as E } from 'meshoptimizer';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : Number(args[i + 1]); };
const ERROR = opt('--error', 0.02);
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!files.length) { console.error('usage: thin-hull <data file> ... [--error metres]'); process.exit(2); }

await S.ready;
await E.ready;
S.useExperimentalFeatures = true;

// How much a change of normal and of paint counts against the error, against
// a metre of the surface moving: enough that a crease or a paint line stays
// where it was drawn.
const WEIGHTS = [0.5, 0.5, 0.5, 1, 1, 1];

/** The compact hull's slices: { nv, nt, surface, pos (Int16 cm), nrm (Int8), col (Uint8), idx }. */
function readHull(b) {
  const head = b.readUInt32LE(0);
  if (!(head & 0x40000000)) throw new Error('not a compact hull');
  const surfaced = (head & 0x80000000) !== 0;
  const n = head & 0x3fffffff;
  let p = 4;
  const slices = [];
  for (let i = 0; i < n; i++) {
    const nv = b.readUInt32LE(p), nt = b.readUInt32LE(p + 4); p += 8;
    let surface = 0;
    if (surfaced) { surface = b.readUInt32LE(p); p += 4; }
    const pos = new Int16Array(nv * 3); for (let k = 0; k < nv * 3; k++, p += 2) pos[k] = b.readInt16LE(p);
    const nrm = new Int8Array(nv * 3); for (let k = 0; k < nv * 3; k++, p++) nrm[k] = b.readInt8(p);
    const col = new Uint8Array(nv * 3); for (let k = 0; k < nv * 3; k++, p++) col[k] = b[p];
    if (p % 2) p += 1;
    const idx = new Uint32Array(nt * 3); for (let k = 0; k < nt * 3; k++, p += 2) idx[k] = b.readUInt16LE(p);
    slices.push({ nv, nt, surface, pos, nrm, col, idx });
  }
  if (p !== b.length) throw new Error(`hull is ${b.length} bytes, read ${p}`);
  return { surfaced, slices };
}

function writeHull({ surfaced, slices }) {
  let size = 4;
  for (const s of slices) { size += 8 + (surfaced ? 4 : 0) + s.nv * 12; if (size % 2) size++; size += s.nt * 6; }
  const b = Buffer.alloc(size);
  b.writeUInt32LE(((surfaced ? 0x80000000 : 0) | 0x40000000 | slices.length) >>> 0, 0);
  let p = 4;
  for (const s of slices) {
    b.writeUInt32LE(s.nv, p); b.writeUInt32LE(s.nt, p + 4); p += 8;
    if (surfaced) { b.writeUInt32LE(s.surface, p); p += 4; }
    for (let k = 0; k < s.nv * 3; k++, p += 2) b.writeInt16LE(s.pos[k], p);
    for (let k = 0; k < s.nv * 3; k++, p++) b.writeInt8(s.nrm[k], p);
    for (let k = 0; k < s.nv * 3; k++, p++) b[p] = s.col[k];
    if (p % 2) p += 1;
    for (let k = 0; k < s.nt * 3; k++, p += 2) b.writeUInt16LE(s.idx[k], p);
  }
  return b;
}

/** One slice, welded, simplified and laid out again for the vertex cache. */
function thin(s) {
  // Points that are the same in every respect, one point.
  const key = new Map();
  const remap = new Uint32Array(s.nv);
  const keep = [];
  for (let v = 0; v < s.nv; v++) {
    const k = `${s.pos[v * 3]},${s.pos[v * 3 + 1]},${s.pos[v * 3 + 2]},${s.nrm[v * 3]},${s.nrm[v * 3 + 1]},${s.nrm[v * 3 + 2]},${s.col[v * 3]},${s.col[v * 3 + 1]},${s.col[v * 3 + 2]}`;
    let w = key.get(k);
    if (w === undefined) { w = keep.length; key.set(k, w); keep.push(v); }
    remap[v] = w;
  }
  const nw = keep.length;
  const pos = new Float32Array(nw * 3), att = new Float32Array(nw * 6);
  for (let w = 0; w < nw; w++) {
    const v = keep[w];
    for (let j = 0; j < 3; j++) {
      pos[w * 3 + j] = s.pos[v * 3 + j] / 100;
      att[w * 6 + j] = s.nrm[v * 3 + j] / 127;
      att[w * 6 + 3 + j] = s.col[v * 3 + j] / 255;
    }
  }
  let idx = new Uint32Array(s.idx.length);
  for (let k = 0; k < idx.length; k++) idx[k] = remap[s.idx[k]];
  // Collapse what moves her surface, her paint and her shading by less than
  // can be seen; her cut faces, where she meets the next slice, stay put.
  const [out] = S.simplifyWithAttributes(idx, pos, 3, att, 6, WEIGHTS, null, 0, ERROR, ['LockBorder', 'ErrorAbsolute']);
  idx = out;
  // And laid out in the order the triangles are drawn, the points they use
  // and no others.
  const [order, unique] = E.reorderMesh(idx, true, true);
  const P = new Int16Array(unique * 3), N = new Int8Array(unique * 3), C = new Uint8Array(unique * 3);
  for (let w = 0; w < nw; w++) {
    const to = order[w];
    if (to === 0xffffffff) continue;
    const v = keep[w];
    for (let j = 0; j < 3; j++) { P[to * 3 + j] = s.pos[v * 3 + j]; N[to * 3 + j] = s.nrm[v * 3 + j]; C[to * 3 + j] = s.col[v * 3 + j]; }
  }
  return { nv: unique, nt: idx.length / 3, surface: s.surface, pos: P, nrm: N, col: C, idx };
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/export const ([A-Z0-9_]*HULL_B64) = "([A-Za-z0-9+/=]+)";/);
  if (!m) { console.error(`${file}: no hull`); continue; }
  const hull = readHull(Buffer.from(m[2], 'base64'));
  let v0 = 0, t0 = 0, v1 = 0, t1 = 0;
  const slices = hull.slices.map((s) => {
    v0 += s.nv; t0 += s.nt;
    const o = thin(s);
    v1 += o.nv; t1 += o.nt;
    return o;
  });
  const b64 = writeHull({ surfaced: hull.surfaced, slices }).toString('base64');
  // As a check: what was written reads back as what was meant.
  const back = readHull(Buffer.from(b64, 'base64'));
  if (back.slices.length !== slices.length || back.slices.some((s, i) => s.nt !== slices[i].nt || s.nv !== slices[i].nv)) throw new Error('round trip failed');
  fs.writeFileSync(file, src.replace(m[0], () => `export const ${m[1]} = "${b64}";`));
  console.log(`${file}: ${t0} -> ${t1} triangles (${(100 * t1 / t0).toFixed(0)}%), ${v0} -> ${v1} points (${(100 * v1 / v0).toFixed(0)}%), ${(m[2].length / 1e6).toFixed(1)} -> ${(b64.length / 1e6).toFixed(1)} MB of base64`);
}
