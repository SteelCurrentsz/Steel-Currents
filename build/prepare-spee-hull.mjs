// Turn the reference Graf Spee sculpt into what client/js/render/speeHull.js
// actually ships. In order:
//
//   * calibrate it into this game's frame: bow to +Z by a rotation, not a
//     reflection; scaled to her length and fitted to her keel;
//   * put back the few triangles the decimator wound inside out;
//   * carve out every gun the sculpt had cast into her deck, and close each
//     hole, so spee.js can stand a real mounting there that trains and fires;
//   * fair the dents decimation left in her topsides, without moving her
//     lines, and split her normals at every crease so deck, side and belt
//     shade as three surfaces rather than one;
//   * paint her by height and by how much each vertex faces the sky (there is
//     no UV map to paint a texture onto);
//   * read her surface off as a height map, which is what spee.js seats every
//     mounting on;
//   * bucket her into length-wise slices -- so the fleet's own symmetry, hole
//     and floating-part checks, which all reason about one part at a time, see
//     something shaped like what every other builder in spee.js hands them,
//     instead of one part spanning her whole two hundred metres -- and pack it
//     all into one binary blob, base64'd into a source file spee.js decodes
//     synchronously. No loader, no fetch, no async: this ships the same way
//     every other piece of geometry in the game does.
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

// ---- calibration: local (x=length, bow=-x; y=up; z=beam) -> game world ----
// (+Z bow, +Y up, y=0 waterline). Keel fitted to hers; length-based uniform
// scale; centred on length and on beam.
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < nv; i++) {
  const x = rawPos[i * 3], z = rawPos[i * 3 + 2];
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const xc = (minX + maxX) / 2;
const zc = (minZ + maxZ) / 2;
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

// Her bow is the sculpt's -X end: the tall forward control tower, Anton, the
// anchors and the stem are all that side of amidships, and her screws and
// rudder are at +X. So a quarter turn about the vertical, not a swap of two
// axes -- a swap is a reflection, which put her bow at the stern *and* built
// her as her own mirror image, port for starboard.
//
//   world_X =  (local_Z - zc) * SCALE
//   world_Y =  (local_Y - localKeel) * SCALE + REAL_KEEL_Y
//   world_Z = -(local_X - xc) * SCALE
function toWorld(lx, ly, lz) {
  return [(lz - zc) * SCALE, (ly - localKeel) * SCALE + REAL_KEEL_Y, -(lx - xc) * SCALE];
}
function normalToWorld(nx, ny, nz) {
  // The same rotation, with no scale to undo; renormalised for safety.
  const wx = nz, wy = ny, wz = -nx;
  const len = Math.hypot(wx, wy, wz) || 1;
  return [wx / len, wy / len, wz / len];
}

console.log('calibration: SCALE', SCALE.toFixed(3), 'xc', xc.toFixed(4), 'localKeel', localKeel.toFixed(4));

// ---- transform all verts once ----
// Plain arrays from here on: the carve below adds vertices where it closes
// the holes it leaves.
const P = [];
const N = [];
for (let i = 0; i < nv; i++) {
  P.push(...toWorld(rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2]));
  N.push(...normalToWorld(rawNrm[i * 3], rawNrm[i * 3 + 1], rawNrm[i * 3 + 2]));
}
let T = Array.from(rawIdx);
{
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) {
    const k = i % 3;
    if (P[i] < lo[k]) lo[k] = P[i];
    if (P[i] > hi[k]) hi[k] = P[i];
  }
  console.log('world bbox X', lo[0].toFixed(2), hi[0].toFixed(2));
  console.log('world bbox Y', lo[1].toFixed(2), hi[1].toFixed(2));
  console.log('world bbox Z', lo[2].toFixed(2), hi[2].toFixed(2));
}

// ---- winding ----------------------------------------------------------------
// The sculpt's own winding agrees with its own normals, bar a couple of
// hundred slivers the decimator folded over. Each triangle is put back facing
// the way its three vertex normals say it faces.
const faceNormal = (a, b, c) => {
  const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
  const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
  return [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
};
{
  let flipped = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const [fx, fy, fz] = faceNormal(a, b, c);
    const vx = N[a * 3] + N[b * 3] + N[c * 3];
    const vy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1];
    const vz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * vx + fy * vy + fz * vz < 0) { T[t + 1] = c; T[t + 2] = b; flipped++; }
  }
  console.log('winding fixed:', flipped, 'of', T.length / 3, 'triangles were backwards');
}

// ---- carve the guns out of her ----------------------------------------------
// The sculpt is one welded solid: her turrets, her fifteens, her flak and her
// tube banks are lumps of hull with no seam between them and the deck. So they
// are cut away here, down to the deck (or sponson, or platform) each one
// stands on, and spee.js stands a real mounting in each place -- one that
// trains, elevates and fires.
//
// Each cut is a box in her own frame, and a triangle goes if its centroid is
// inside the box and above `floor`, which is a hand's breadth over the deck
// measured beside that mounting. Floors are read off the sculpt: forecastle
// 5.1 m rising to 5.6 m at Anton's muzzles, main deck 4.9 m, superstructure
// deck and the funnel sponsons 7.4-7.55 m, quarterdeck 3.2 m.
const PORT_AND_STARBOARD = (c) => [c, { ...c, name: c.name + ' stbd', x0: -c.x1, x1: -c.x0 }];
const CARVE = process.env.NOCARVE ? [] : [
  // Anton: gunhouse and barbette, then her barrels on their own higher floor so
  // the forecastle under them is left alone.
  { name: 'Anton', x0: -6.6, x1: 6.6, z0: 41.7, z1: 56.4, floor: (z) => 5.25 + (z - 42) * 0.032 },
  { name: 'Anton barrels', x0: -3.8, x1: 3.8, z0: 56.2, z1: 66.6, floor: () => 7.0 },
  // Bruno, likewise; stopping short of the after end of the superstructure.
  { name: 'Bruno', x0: -6.6, x1: 6.6, z0: -50.7, z1: -37.3, floor: () => 5.02 },
  { name: 'Bruno barrels', x0: -3.8, x1: 3.8, z0: -60.3, z1: -50.5, floor: () => 6.4 },
  // The after 10.5 cm twin on the roof of the after superstructure, and the
  // barrel it lays out over Bruno.
  { name: 'after 10.5', x0: -2.6, x1: 2.6, z0: -35.7, z1: -30.9, floor: () => 7.7 },
  { name: 'after 10.5 barrel', x0: -0.9, x1: 0.9, z0: -40.2, z1: -35.6, floor: () => 8.6 },
  // Her fifteens: four a side on the main deck at the deck edge. The forward
  // pair are laid ahead and the after pair astern, and each barrel is cut on
  // its own floor so the deck and the bollards under it stay.
  ...PORT_AND_STARBOARD({ name: '15 cm 1', x0: 7.1, x1: 10.7, z0: 16.8, z1: 20.8, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 1 barrel', x0: 8.1, x1: 9.6, z0: 20.6, z1: 25.7, floor: () => 6.2 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 2', x0: 7.1, x1: 10.7, z0: 10.3, z1: 13.9, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 2 barrel', x0: 8.1, x1: 9.6, z0: 13.7, z1: 17.6, floor: () => 6.2 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 3', x0: 7.1, x1: 10.7, z0: -10.7, z1: -6.5, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 3 barrel', x0: 8.1, x1: 9.6, z0: -14.3, z1: -10.5, floor: () => 6.2 }),
  // The boat on the superstructure deck comes out to 7.7 m beside this one.
  ...PORT_AND_STARBOARD({ name: '15 cm 4', x0: 7.75, x1: 10.7, z0: -17.4, z1: -13.7, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 4 barrel', x0: 8.1, x1: 9.6, z0: -21.4, z1: -17.2, floor: () => 6.2 }),
  // The waist 10.5 cm twins, on the sponsons abreast the funnel.
  ...PORT_AND_STARBOARD({ name: '10.5 waist', x0: 7.55, x1: 10.8, z0: 3.3, z1: 9.9, floor: () => 7.56 }),
  // The 3.7 cm twins on the funnel platform.
  ...PORT_AND_STARBOARD({ name: '3.7 platform', x0: 3.2, x1: 4.8, z0: 3.2, z1: 4.8, floor: () => 16.62 }),
  // The two quadruple tube banks on the quarterdeck, stowed fore and aft.
  ...PORT_AND_STARBOARD({ name: 'tubes', x0: 1.3, x1: 6.1, z0: -77.3, z1: -67.7, floor: () => 3.38 }),
];

const nTri = T.length / 3;
const keep = new Uint8Array(nTri).fill(1);
{
  const cut = new Map();
  for (let t = 0; t < nTri; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    for (const k of CARVE) {
      // By the centroid, and also by any corner standing well clear of the
      // floor inside the box: a long sliver of a shield whose centroid falls
      // just outside the box still reaches up into it, and left behind it
      // drags the patch up into a tent over the deck.
      let hit = cx >= k.x0 && cx <= k.x1 && cz >= k.z0 && cz <= k.z1 && cy > k.floor(cz);
      // And by the middle of each edge, for a long sliver from outside the box
      // whose corners all miss it but whose length runs across it.
      const probes = [[a, a], [b, b], [c, c], [a, b], [b, c], [c, a]];
      for (const [u, w] of probes) {
        if (hit) break;
        const vx = (P[u * 3] + P[w * 3]) / 2;
        const vy = (P[u * 3 + 1] + P[w * 3 + 1]) / 2;
        const vz = (P[u * 3 + 2] + P[w * 3 + 2]) / 2;
        hit = vx >= k.x0 && vx <= k.x1 && vz >= k.z0 && vz <= k.z1 && vy > k.floor(vz) + 0.1;
      }
      if (!hit) continue;
      keep[t] = 0;
      cut.set(k.name, (cut.get(k.name) || 0) + 1);
      break;
    }
  }
  console.log('carved:', [...cut].map(([k, n]) => `${k} ${n}`).join(', '));
}

// ---- close what the carve opened ------------------------------------------------
// Every edge the carve cut through has one kept triangle on it now, and those
// edges run round each hole in closed loops -- the outline where a gunhouse or
// a shield met the deck. Each loop is filled in plan, by ear clipping: a fan
// from its middle folds over wherever the outline is not star-shaped about
// that middle, and a folded triangle faces down into the ship and is culled,
// which left slivers of daylight round a patched barbette. The patch is wound
// against the kept triangle along every edge of the loop, so it faces the
// same way as the deck it is let into.
function earClip(loop) {
  const idx = loop.slice();
  const X = (v) => P[v * 3], Z = (v) => P[v * 3 + 2];
  let area = 0;
  for (let i = 0; i < idx.length; i++) {
    const a = idx[i], b = idx[(i + 1) % idx.length];
    area += X(a) * Z(b) - X(b) * Z(a);
  }
  const sgn = Math.sign(area) || 1;
  const cross = (a, b, c) => ((X(b) - X(a)) * (Z(c) - Z(a)) - (Z(b) - Z(a)) * (X(c) - X(a))) * sgn;
  const inTri = (p, a, b, c) => cross(a, b, p) > 1e-9 && cross(b, c, p) > 1e-9 && cross(c, a, p) > 1e-9;
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 1e-9) continue;
      let blocked = false;
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        if (inTri(p, a, b, c)) { blocked = true; break; }
      }
      if (blocked) continue;
      out.push(a, b, c);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}
{
  const edges = new Map();
  const ek = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = T[t * 3 + e], b = T[t * 3 + ((e + 1) % 3)];
      const k = ek(a, b);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push([t, a, b]);
    }
  }
  // An edge is on the rim of a hole if the carve took triangles off it and it
  // is left with an odd number: one, where the sculpt is a plain closed
  // surface, or three where it is not -- a few dozen of its edges carry three
  // or four triangles, and a rim that runs along one of those has to be seen
  // there too or the loop round the hole never closes.
  //
  // Walked without regard to direction, because the sculpt's winding is only
  // as consistent as the per-triangle repair above could make it. Which way a
  // patch is wound is settled per loop instead, by majority: the kept
  // triangles along the rim mostly run one way round it, and the patch runs
  // the other.
  const adj = new Map();
  const dirOf = new Map();
  for (const [k, list] of edges) {
    let kept = 0;
    let first = null;
    for (const e of list) if (keep[e[0]]) { kept++; if (!first) first = e; }
    if (kept === list.length || kept % 2 === 0) continue;
    const [, a, b] = first;
    dirOf.set(k, [a, b]);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, k]);
    adj.get(b).push([a, k]);
  }
  const used = new Set();
  const T2 = [];
  for (let t = 0; t < nTri; t++) if (keep[t]) T2.push(T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
  let loops = 0, capped = 0, fanned = 0, chains = 0, skirted = 0;
  for (const start of adj.keys()) {
    for (const [first, fk] of adj.get(start)) {
      if (used.has(fk)) continue;
      used.add(fk);
      const loop = [start];
      const keys = [fk];
      let at = first;
      let closed = false;
      for (let guard = 0; guard < 100000; guard++) {
        if (at === start) { closed = true; break; }
        loop.push(at);
        const step = adj.get(at).find(([, k]) => !used.has(k));
        if (!step) break;
        used.add(step[1]);
        keys.push(step[1]);
        at = step[0];
      }
      if (!closed) { chains++; continue; }
      if (loop.length < 3) continue;
      loops++;
      let along = 0;
      for (let i = 0; i < loop.length; i++) {
        const [a] = dirOf.get(keys[i]);
        along += a === loop[i] ? 1 : -1;
      }
      const poly = along >= 0 ? loop.slice().reverse() : loop.slice();
      // Laid flat at the deck the cut went down to, not stretched across the
      // rim wherever the rim happens to be. A rim that climbs a wall -- the
      // port fifteens abreast the funnel were cast against the sponson's
      // forward face, so taking the shield away takes that face with it --
      // gets a vertical skirt from each high rim vertex down to the patch,
      // which closes the wall and leaves the deck level. Patched straight
      // across, that same hole was a ramp from the top of the sponson to the
      // deck.
      let cx = 0, cz = 0;
      for (const v of poly) { cx += P[v * 3]; cz += P[v * 3 + 2]; }
      cx /= poly.length; cz /= poly.length;
      let box = null, bestD = Infinity;
      for (const k of CARVE) {
        const dx = Math.max(k.x0 - cx, 0, cx - k.x1), dz = Math.max(k.z0 - cz, 0, cz - k.z1);
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; box = k; }
      }
      const deckAt = (z) => box.floor(z) - 0.13;
      const low = poly.map((v) => {
        const deckY = deckAt(P[v * 3 + 2]);
        if (P[v * 3 + 1] <= deckY + 0.2) return v;
        const w = P.length / 3;
        P.push(P[v * 3], deckY, P[v * 3 + 2]);
        N.push(0, 1, 0);
        return w;
      });
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const a = poly[i], b = poly[j], a2 = low[i], b2 = low[j];
        if (a2 === a && b2 === b) continue;
        if (b2 !== b) { T2.push(a, b, b2); capped++; }
        if (a2 !== a) { T2.push(a, b2, a2); capped++; }
      }
      skirted += low.some((w, i) => w !== poly[i]) ? 1 : 0;
      const tris = earClip(low);
      if (tris) {
        T2.push(...tris);
        capped += tris.length / 3;
        continue;
      }
      // An outline that will not clip in plan (it climbs a wall): a fan.
      fanned++;
      let mx = 0, my = 0, mz = 0;
      for (const v of low) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; }
      const c = P.length / 3;
      P.push(mx / low.length, my / low.length, mz / low.length);
      N.push(0, 1, 0);
      for (let i = 0; i < low.length; i++) {
        T2.push(low[i], low[(i + 1) % low.length], c);
        capped++;
      }
    }
  }
  T = T2;
  console.log('closed', loops, 'holes with', capped, 'triangles;', skirted, 'skirted;', fanned, 'fanned;', chains, 'open chains');
}
let nvAll = P.length / 3;

// ---- normals, off the finished shape ------------------------------------------
// The source normals only had to be good enough to call the winding above:
// agreeing on which way is roughly out is not the same as being smooth enough
// to shade with, and a decimator's normals are noisy in a way the winding test
// sees through and Lambert shading does not. Area-weighted face normals,
// accumulated at each vertex from triangles that now all agree which way they
// face, are smooth by construction -- and cover the patches added above.
function recomputeNormals() {
  N.fill(0);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const [fx, fy, fz] = faceNormal(a, b, c);
    for (const v of [a, b, c]) { N[v * 3] += fx; N[v * 3 + 1] += fy; N[v * 3 + 2] += fz; }
  }
  for (let i = 0; i < nvAll; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
}
recomputeNormals();

// ---- fair her sides -------------------------------------------------------------
// Decimating half a million triangles to thirty thousand left her topsides
// dented: shallow dishes and spikes a few decimetres deep all along the plating
// between the boot topping and the deck edge, which read in any low sun as a
// hull that had been through a collision. They are faired out here without
// changing her lines:
//
//   * only the topsides of her midbody are touched -- a vertex out at her
//     side between the foot of her boot topping and her deck edge, where she
//     is within FAIR_MIDBODY of her full beam -- never her decks, her
//     superstructure, the sponsons standing out from her or anything else on
//     her, and never her underwater body or her ends, whose curves are her
//     lines and not dents;
//   * every vertex on one of her lines is held where it is: her deck edge, and
//     any long fore-and-aft crease in her side -- the top of her belt, a
//     knuckle, a rubbing strake -- so they stay as sharp as the sculpt drew
//     them;
//   * a vertex only ever moves along its own normal, in and out of her side,
//     never along it, and never more than FAIR_MAX from where the sculpt put
//     it;
//   * Taubin's pair of passes -- a shrink and a slightly larger swell -- rather
//     than plain averaging, which would take her in a little at every pass.
//
// What it did to her is printed: how far the vertices went, and how far her
// body plan moved -- her half-breadth each side, cut through the finished mesh
// every five metres of her length and every metre of her depth.
const FAIR_PASSES = 24;
const FAIR_LAMBDA = 0.5, FAIR_MU = -0.53;
const FAIR_MAX = 0.3;
const FAIR_FOOT = -2.6;
const FAIR_MIDBODY = 0.8;
// The same point may be several vertices, split where the source had a hard
// edge. Whatever moves or shades one of them has to treat them as one.
const canon = new Int32Array(nvAll);
{
  const seen = new Map();
  for (let i = 0; i < nvAll; i++) {
    const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
    const c = seen.get(k);
    canon[i] = c === undefined ? i : c;
    if (c === undefined) seen.set(k, i);
  }
}
// Her half-breadth and the height of her deck edge, a metre of her length
// at a time: what says whether a vertex is her side or something on her.
const zBin = (z) => Math.floor(z + REAL_LOA / 2 + 2);
const nz = REAL_LOA + 6;
const halfB = new Float32Array(nz);
for (let i = 0; i < nvAll; i++) {
  if (P[i * 3 + 1] > 5.2) continue;
  const k = zBin(P[i * 3 + 2]);
  halfB[k] = Math.max(halfB[k], Math.abs(P[i * 3]));
}
const maxHalfB = Math.max(...halfB);
// The highest point out at her side, under the height of her forecastle at
// the stem; then the running median over eleven metres, which is her sheer
// with the flak sponsons that stand out over her side taken out of it.
const rawEdge = new Float32Array(nz).fill(NaN);
for (let i = 0; i < nvAll; i++) {
  const k = zBin(P[i * 3 + 2]);
  const y = P[i * 3 + 1];
  if (Math.abs(P[i * 3]) < halfB[k] - 0.5 || y > 7.2) continue;
  if (!(y <= rawEdge[k])) rawEdge[k] = y;
}
const edgeY = new Float32Array(nz);
for (let k = 0; k < nz; k++) {
  const w = [];
  for (let j = k - 5; j <= k + 5; j++) if (j >= 0 && j < nz && !Number.isNaN(rawEdge[j])) w.push(rawEdge[j]);
  w.sort((a, b) => a - b);
  edgeY[k] = w.length ? w[w.length >> 1] : -99;
}
const unitFace = (t) => {
  const [fx, fy, fz] = faceNormal(T[t], T[t + 1], T[t + 2]);
  const l = Math.hypot(fx, fy, fz) || 1;
  return [fx / l, fy / l, fz / l];
};
{
  const nb = new Map();
  const link = (u, v) => {
    if (u === v) return;
    if (!nb.has(u)) nb.set(u, new Set());
    nb.get(u).add(v);
  };
  // Every edge and the faces either side of it, for finding her lines.
  const edges = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const v = [canon[T[t]], canon[T[t + 1]], canon[T[t + 2]]];
    for (let j = 0; j < 3; j++) {
      const a = v[j], b = v[(j + 1) % 3];
      link(a, b); link(b, a);
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(t);
    }
  }
  const held = new Uint8Array(nvAll);
  for (const [k, ts] of edges) {
    if (ts.length !== 2) continue;
    const [a, b] = k.split(',').map(Number);
    const dx = P[b * 3] - P[a * 3], dy = P[b * 3 + 1] - P[a * 3 + 1], dz = P[b * 3 + 2] - P[a * 3 + 2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.0 || Math.abs(dz) < 0.9 * len) continue;
    const f = unitFace(ts[0]), g = unitFace(ts[1]);
    if (f[0] * g[0] + f[1] * g[1] + f[2] * g[2] < Math.cos(30 * Math.PI / 180)) { held[a] = 1; held[b] = 1; }
  }
  const side = [];
  for (let i = 0; i < nvAll; i++) {
    if (canon[i] !== i || held[i] || !nb.has(i)) continue;
    const x = Math.abs(P[i * 3]), y = P[i * 3 + 1];
    if (x < 0.25) continue;
    const k = zBin(P[i * 3 + 2]);
    // Her midbody only: towards either end her sides curve in fast enough
    // that on a mesh this coarse a real line and a dent look the same to a
    // filter, and her run aft is not something to fair away.
    if (halfB[k] < FAIR_MIDBODY * maxHalfB) continue;
    if (y > FAIR_FOOT && x > halfB[k] - 1.0 && y < edgeY[k] - 0.2) side.push(i);
  }
  const orig = Float64Array.from(P);
  // Normals of the welded surface, area-weighted, off the current shape.
  const wn = new Float64Array(nvAll * 3);
  const weldedNormals = () => {
    wn.fill(0);
    for (let t = 0; t < T.length; t += 3) {
      const [fx, fy, fz] = faceNormal(T[t], T[t + 1], T[t + 2]);
      for (let j = 0; j < 3; j++) {
        const c = canon[T[t + j]];
        wn[c * 3] += fx; wn[c * 3 + 1] += fy; wn[c * 3 + 2] += fz;
      }
    }
    for (const i of side) {
      const l = Math.hypot(wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2]) || 1;
      wn[i * 3] /= l; wn[i * 3 + 1] /= l; wn[i * 3 + 2] /= l;
    }
  };
  const next = new Float64Array(side.length);
  const pass = (f) => {
    weldedNormals();
    side.forEach((i, s) => {
      let mx = 0, my = 0, mz = 0, n = 0;
      for (const j of nb.get(i)) { mx += P[j * 3]; my += P[j * 3 + 1]; mz += P[j * 3 + 2]; n++; }
      const dx = mx / n - P[i * 3], dy = my / n - P[i * 3 + 1], dz = mz / n - P[i * 3 + 2];
      next[s] = f * (dx * wn[i * 3] + dy * wn[i * 3 + 1] + dz * wn[i * 3 + 2]);
    });
    side.forEach((i, s) => {
      for (let k = 0; k < 3; k++) P[i * 3 + k] += next[s] * wn[i * 3 + k];
      // No further than FAIR_MAX from the sculpt.
      const ox = P[i * 3] - orig[i * 3], oy = P[i * 3 + 1] - orig[i * 3 + 1], oz = P[i * 3 + 2] - orig[i * 3 + 2];
      const d = Math.hypot(ox, oy, oz);
      if (d > FAIR_MAX) {
        const s2 = FAIR_MAX / d;
        P[i * 3] = orig[i * 3] + ox * s2; P[i * 3 + 1] = orig[i * 3 + 1] + oy * s2; P[i * 3 + 2] = orig[i * 3 + 2] + oz * s2;
      }
    });
  };
  // Her body plan: her half-breadth each side, cut through the mesh every
  // five metres of her length and every metre from the keel to the deck edge.
  const STATIONS = [];
  for (let z = -85; z <= 85; z += 5) for (let y = -6; y <= 4; y += 1) STATIONS.push([z, y]);
  const bodyPlan = () => {
    const out = STATIONS.map(() => [0, 0]);
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      const ay = P[a + 1], az = P[a + 2], by = P[b + 1], bz = P[b + 2], cy = P[c + 1], cz = P[c + 2];
      const d = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      STATIONS.forEach(([z, y], s) => {
        const l1 = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / d;
        const l2 = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) return;
        const x = l1 * P[a] + l2 * P[b] + l3 * P[c];
        if (x > out[s][0]) out[s][0] = x;
        if (-x > out[s][1]) out[s][1] = -x;
      });
    }
    return out;
  };
  const before = bodyPlan();
  for (let k = 0; k < FAIR_PASSES; k++) { pass(FAIR_LAMBDA); pass(FAIR_MU); }
  // Every copy of a point goes where the point went.
  for (let i = 0; i < nvAll; i++) {
    const c = canon[i];
    if (c !== i) { P[i * 3] = P[c * 3]; P[i * 3 + 1] = P[c * 3 + 1]; P[i * 3 + 2] = P[c * 3 + 2]; }
  }
  const after = bodyPlan();
  let maxD = 0, sumD = 0;
  for (const i of side) {
    const d = Math.hypot(P[i * 3] - orig[i * 3], P[i * 3 + 1] - orig[i * 3 + 1], P[i * 3 + 2] - orig[i * 3 + 2]);
    maxD = Math.max(maxD, d); sumD += d;
  }
  console.log(`faired ${side.length} topside vertices: moved ${(sumD / side.length * 100).toFixed(1)} cm on average, ${(maxD * 100).toFixed(1)} cm at most`);
  let worst = 0, sum = 0, n = 0, at = null;
  before.forEach((b, s) => {
    for (let k = 0; k < 2; k++) {
      if (!b[k] || !after[s][k]) continue;
      const d = Math.abs(after[s][k] - b[k]);
      sum += d; n++;
      if (d > worst) { worst = d; at = STATIONS[s]; }
    }
  });
  console.log(`her body plan moved ${(sum / n * 100).toFixed(1)} cm on average, `
    + `${(worst * 100).toFixed(1)} cm at most (station ${at[0]} m, ${at[1]} m up), over ${n} offsets`);
}
recomputeNormals();

// ---- hard edges ----------------------------------------------------------------
// One normal per vertex, averaged over every face round it, is right for a
// rounded surface and wrong at a crease: a vertex on her deck edge was shaded
// as if it faced half up and half out, so each triangle of her side that
// touched the deck edge shaded from grey to the colour of the deck down its
// length -- a row of pale wedges hanging off her sheer the whole length of
// her -- and the deck's tan was painted a metre down her side.
//
// So the faces round each vertex are split into smoothing groups: two faces
// that share an edge through the vertex are in the same group unless they
// meet at more than CREASE, and each group gets a vertex of its own, with the
// normal of that group alone. Rounded surfaces shade as they did; a crease --
// deck edge, belt, the edge of a deckhouse -- shades as a crease.
//
// Her side plating is a class of its own: a face out at her side, below her
// deck edge, that looks out over the water within PLATE_TILT of level. It
// never shares a group with anything that is not plating, however gentle the
// angle between them, so the chamfer the sculpt rounds her deck edge off with
// and the top of her belt each stay a line rather than bleeding down her side.
const CREASE = 44 * Math.PI / 180;
const PLATE_TILT = 35 * Math.PI / 180;
// For each vertex once the groups are made: is it her side plating?
let plating = null;
{
  const cosC = Math.cos(CREASE);
  const sinTilt = Math.sin(PLATE_TILT);
  const nt = T.length / 3;
  const fn = new Float64Array(nt * 3);   // area-weighted
  const fu = new Float64Array(nt * 3);   // unit
  const plate = new Uint8Array(nt);
  for (let f = 0; f < nt; f++) {
    const [x, y, z] = faceNormal(T[f * 3], T[f * 3 + 1], T[f * 3 + 2]);
    const l = Math.hypot(x, y, z) || 1;
    fn[f * 3] = x; fn[f * 3 + 1] = y; fn[f * 3 + 2] = z;
    fu[f * 3] = x / l; fu[f * 3 + 1] = y / l; fu[f * 3 + 2] = z / l;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[f * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    const k = zBin(cz);
    plate[f] = Math.abs(cx) > 0.25 && Math.abs(cx) > halfB[k] - 1.0
      && cy > FAIR_FOOT && cy < edgeY[k] + 0.05
      && Math.abs(fu[f * 3 + 1]) < sinTilt && fu[f * 3] * Math.sign(cx) > 0.3 ? 1 : 0;
  }
  const around = new Map();
  for (let f = 0; f < nt; f++) {
    for (let j = 0; j < 3; j++) {
      const c = canon[T[f * 3 + j]];
      if (!around.has(c)) around.set(c, []);
      around.get(c).push(f);
    }
  }
  const P2 = [], N2 = [], T2 = new Array(T.length), plated = [];
  for (const [c, fs] of around) {
    // Union the faces round c across every smooth edge through it.
    const parent = fs.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const byOther = new Map();
    fs.forEach((f, i) => {
      for (let j = 0; j < 3; j++) {
        const o = canon[T[f * 3 + j]];
        if (o === c) continue;
        if (!byOther.has(o)) byOther.set(o, []);
        byOther.get(o).push(i);
      }
    });
    for (const list of byOther.values()) {
      for (let p = 0; p < list.length; p++) {
        for (let q = p + 1; q < list.length; q++) {
          const f = fs[list[p]], g = fs[list[q]];
          if (plate[f] !== plate[g]) continue;
          if (fu[f * 3] * fu[g * 3] + fu[f * 3 + 1] * fu[g * 3 + 1] + fu[f * 3 + 2] * fu[g * 3 + 2] < cosC) continue;
          parent[find(list[p])] = find(list[q]);
        }
      }
    }
    const groups = new Map();
    fs.forEach((f, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(f);
    });
    for (const members of groups.values()) {
      let x = 0, y = 0, z = 0;
      for (const f of members) { x += fn[f * 3]; y += fn[f * 3 + 1]; z += fn[f * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      const idx = P2.length / 3;
      P2.push(P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
      N2.push(x / l, y / l, z / l);
      plated.push(plate[members[0]]);
      for (const f of members) {
        for (let j = 0; j < 3; j++) if (canon[T[f * 3 + j]] === c) T2[f * 3 + j] = idx;
      }
    }
  }
  const was = nvAll;
  P.length = P2.length; for (let i = 0; i < P2.length; i++) P[i] = P2[i];
  N.length = N2.length; for (let i = 0; i < N2.length; i++) N[i] = N2[i];
  T = T2;
  nvAll = P.length / 3;
  plating = Uint8Array.from(plated);
  console.log(`hard edges: ${was} vertices became ${nvAll}, split into smoothing groups at ${Math.round(CREASE * 180 / Math.PI)} degrees`);
}

// ---- her plating, shaded as plating ------------------------------------------------
// What fairing leaves is a few centimetres of unevenness across triangles
// several metres long, and a triangle that size tilted a couple of degrees
// still shows as a facet under a low sun. So her side plating is shaded with
// the normal it has over a few metres of her length rather than the one each
// triangle happens to have: every plating vertex takes the weighted mean of
// the normals of the plating vertices round it on the same side, out to
// PLATE_ALONG fore and aft but only PLATE_UP up and down, so a dent is
// averaged away along her length while her flare and the lines that run
// along her stay where they are. Nothing moves; this is shading alone.
const PLATE_ALONG = 3.0, PLATE_UP = 0.5;
{
  const pick = [];
  for (let i = 0; i < nvAll; i++) if (plating[i]) pick.push(i);
  pick.sort((a, b) => P[a * 3 + 2] - P[b * 3 + 2]);
  const out = new Float64Array(pick.length * 3);
  let lo = 0;
  pick.forEach((i, s) => {
    const zi = P[i * 3 + 2];
    while (P[pick[lo] * 3 + 2] < zi - 2 * PLATE_ALONG) lo++;
    let x = 0, y = 0, z = 0;
    for (let q = lo; q < pick.length; q++) {
      const j = pick[q];
      const dz = P[j * 3 + 2] - zi;
      if (dz > 2 * PLATE_ALONG) break;
      if (Math.sign(P[j * 3]) !== Math.sign(P[i * 3])) continue;
      const dy = P[j * 3 + 1] - P[i * 3 + 1];
      if (Math.abs(dy) > 2 * PLATE_UP) continue;
      const w = Math.exp(-((dz / PLATE_ALONG) ** 2) - (dy / PLATE_UP) ** 2);
      x += w * N[j * 3]; y += w * N[j * 3 + 1]; z += w * N[j * 3 + 2];
    }
    const l = Math.hypot(x, y, z) || 1;
    out[s * 3] = x / l; out[s * 3 + 1] = y / l; out[s * 3 + 2] = z / l;
  });
  pick.forEach((i, s) => { N[i * 3] = out[s * 3]; N[i * 3 + 1] = out[s * 3 + 1]; N[i * 3 + 2] = out[s * 3 + 2]; });
  console.log(`plating: ${pick.length} vertices of her side shaded along her length`);
}

// ---- a crude UV --------------------------------------------------------------
// Not a real unwrap (nothing marks where a seam should fall): length and
// height over a plating-sized tile, so anything that samples a texture off her
// has something continuous to land on.
const STEEL_TILE = 16.0;
const uvArr = new Float32Array(nvAll * 2);
for (let i = 0; i < nvAll; i++) {
  uvArr[i * 2] = P[i * 3 + 2] / STEEL_TILE;
  uvArr[i * 2 + 1] = P[i * 3 + 1] / STEEL_TILE;
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
const col = new Uint8Array(nvAll * 3);
for (let i = 0; i < nvAll; i++) {
  const y = P[i * 3 + 1], up = N[i * 3 + 1];
  // A ledge out on her side -- the top of her belt -- faces the sky too, and
  // is still her side: deck colour is for a deck.
  const k = zBin(P[i * 3 + 2]);
  const onSide = Math.abs(P[i * 3]) > halfB[k] - 1.0 && y < edgeY[k] - 0.3;
  let c;
  if (up > 0.55 && y > BOOT_HI - 0.5 && !onSide) c = DECK;
  else if (y < BOOT_LO) c = ANTI;
  else if (y <= BOOT_HI) c = BOOT;
  else c = HULL;
  col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
}

// ---- her surface, as a height map -----------------------------------------------
// The highest point of her at every half metre, after the carve. It is what
// spee.js stands a mounting on: a gun is seated on whatever is under its
// pivot, which is her own deck rather than the lines she used to be lofted
// through -- those run two metres higher than this sculpt's decks, and every
// fitting built to them stood two metres in the air.
const HM = { x0: -12, z0: -94, step: 0.5, nx: 49, nz: 377 };
const hm = new Float32Array(HM.nx * HM.nz).fill(-99);
for (let t = 0; t < T.length; t += 3) {
  const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
  const ax = P[a], ay = P[a + 1], az = P[a + 2];
  const bx = P[b], by = P[b + 1], bz = P[b + 2];
  const cx = P[c], cy = P[c + 1], cz = P[c + 2];
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-9) continue;
  const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - HM.x0) / HM.step));
  const i1 = Math.min(HM.nx - 1, Math.floor((Math.max(ax, bx, cx) - HM.x0) / HM.step));
  const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - HM.z0) / HM.step));
  const j1 = Math.min(HM.nz - 1, Math.floor((Math.max(az, bz, cz) - HM.z0) / HM.step));
  for (let j = j0; j <= j1; j++) {
    const z = HM.z0 + j * HM.step;
    for (let i = i0; i <= i1; i++) {
      const x = HM.x0 + i * HM.step;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * ay + l2 * by + l3 * cy;
      const k = j * HM.nx + i;
      if (y > hm[k]) hm[k] = y;
    }
  }
}
const hmBytes = Buffer.from(Int16Array.from(hm, (v) => Math.round(v * 100)).buffer);

// ---- bucket triangles into Z-slices by centroid, re-indexing per bucket --
// Fine enough that a bucket's own bounding box stays a fair stand-in for her
// beam anywhere within it, since the fleet's floating-part checks compare a
// part's box against her breadth at the part's middle station. Forty-eight
// keeps each slice under four metres.
const N_BUCKETS = 48;
const REAL_HALF = REAL_LOA / 2;
const bucketOf = (z) => Math.max(0, Math.min(N_BUCKETS - 1,
  Math.floor(((z + REAL_HALF) / REAL_LOA) * N_BUCKETS)));
const buckets = Array.from({ length: N_BUCKETS }, () => ({
  map: new Map(), pos: [], nrm: [], col: [], uv: [], idx: [],
}));
for (let t = 0; t < T.length; t += 3) {
  const a = T[t], b = T[t + 1], c = T[t + 2];
  const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  const bk = buckets[bucketOf(cz)];
  for (const v of [a, b, c]) {
    let li = bk.map.get(v);
    if (li === undefined) {
      li = bk.pos.length / 3;
      bk.map.set(v, li);
      bk.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      bk.nrm.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      bk.col.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      bk.uv.push(uvArr[v * 2], uvArr[v * 2 + 1]);
    }
    bk.idx.push(li);
  }
}
const nonEmpty = buckets.filter((bk) => bk.idx.length > 0);
console.log('buckets', nonEmpty.length, 'of', N_BUCKETS, 'tris', T.length / 3);

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
  parts.push(Buffer.from(Float32Array.from(bk.pos).buffer));
  parts.push(Buffer.from(Float32Array.from(bk.nrm).buffer));
  parts.push(Buffer.from(Uint8Array.from(bk.col).buffer));
  parts.push(Buffer.from(Float32Array.from(bk.uv).buffer));
  parts.push(Buffer.from(Uint16Array.from(bk.idx).buffer));
}
const blob = Buffer.concat(parts);
const b64 = blob.toString('base64');
console.log('packed blob', blob.length, 'bytes ->', b64.length, 'base64 chars');

writeFileSync(OUT_DATA,
  `// Generated by build/prepare-spee-hull.mjs from the reference sculpt. Do not\n`
  + `// hand-edit -- regenerate from the source asset instead.\n`
  + `export const SPEE_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see speeSurfaceY.\n`
  + `export const SPEE_SURFACE = ${JSON.stringify({ ...HM, b64: hmBytes.toString('base64') })};\n`);
console.log('wrote', OUT_DATA);
