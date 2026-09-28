// What every reference sculpt goes through on its way into the game.
//
// The Graf Spee and the Takao are each drawn from a sculpt the owner supplied
// rather than lofted from lines: one welded mesh, decimated to the budget the
// fleet renders at. build/prepare-spee-hull.mjs and build/prepare-takao-hull.mjs
// each say what is particular to their ship -- where her guns were cast into
// her, how she is painted, what is cut out of her -- and hand the rest to the
// stages here, in the order they run:
//
//   readGlb        the decimated sculpt, as it came out of the simplifier
//   toGameFrame    bow to +Z by a quarter turn (a rotation, not a reflection),
//                  scaled to her length and fitted to her keel
//   fixWinding     the few triangles the decimator wound inside out
//   carve          triangles inside a set of boxes, above each box's floor
//   closeHoles     every hole the carve (or anything else) left, closed
//   recomputeNormals, weld, stations
//   fair           the dents decimation left in her topsides, without moving
//                  her lines
//   hardEdges      normals split at every crease; her side plating a class of
//                  its own
//   shadePlating   her plating shaded as plating
//   uvs, paint, heightmap, pack
//
// A mesh here is `{ P, N, T }`: plain arrays of positions, normals and
// triangle indices, which the carve and the patches grow as they go.
import { readFileSync } from 'node:fs';

// ---- the glb ------------------------------------------------------------------
/**
 * Positions, normals and indices out of a single-mesh glb.
 *
 * VEC3-of-float accessors only, but the source buffer may interleave several
 * attributes in one bufferView (gltf-transform's simplify output packs
 * position+normal together with byteStride: 24) -- reading it as if it were
 * tightly packed silently reads every attribute's bytes as if they were the
 * next vertex's, which corrupts everything after the first vertex without
 * throwing. So every read respects byteStride explicitly.
 */
export function readGlb(file) {
  const buf = readFileSync(file);
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
  return {
    pos: readVec3(acc[prim.attributes.POSITION]),
    nrm: readVec3(acc[prim.attributes.NORMAL]),
    idx: readIdx(acc[prim.indices]),
  };
}

// ---- calibration ----------------------------------------------------------------
/**
 * The sculpt's frame -- length along X with her bow at -X, Y up, beam along Z
 * -- turned into the game's: +Z her bow, +Y up, y = 0 her waterline. A
 * quarter turn about the vertical, not a swap of two axes: a swap is a
 * reflection, and builds her as her own mirror image, port for starboard.
 *
 *   world_X =  (local_Z - zc) * SCALE
 *   world_Y =  (local_Y - localKeel) * SCALE + keelY
 *   world_Z = -(local_X - xc) * SCALE
 *
 * Scaled to her length overall, and her keel -- the lowest point of her over
 * the middle `band` of her length -- put at `keelY`. Pass `frame` to use a
 * calibration worked out on another decimation of the same sculpt.
 */
export function toGameFrame(raw, { length, keelY, band = 0.06, frame = null }) {
  const { pos, nrm } = raw;
  const nv = pos.length / 3;
  let f = frame;
  if (!f) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3], z = pos[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const xc = (minX + maxX) / 2;
    const zc = (minZ + maxZ) / 2;
    const localLen = maxX - minX;
    const SCALE = length / localLen;
    const w = localLen * band;
    let localKeel = Infinity;
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3]; if (Math.abs(x - xc) > w) continue;
      const y = pos[i * 3 + 1]; if (y < localKeel) localKeel = y;
    }
    f = { xc, zc, SCALE, localKeel, keelY };
  }
  const P = [];
  const N = [];
  for (let i = 0; i < nv; i++) {
    const lx = pos[i * 3], ly = pos[i * 3 + 1], lz = pos[i * 3 + 2];
    P.push((lz - f.zc) * f.SCALE, (ly - f.localKeel) * f.SCALE + f.keelY, -(lx - f.xc) * f.SCALE);
    // The same rotation, with no scale to undo; renormalised for safety.
    const wx = nrm[i * 3 + 2], wy = nrm[i * 3 + 1], wz = -nrm[i * 3];
    const len = Math.hypot(wx, wy, wz) || 1;
    N.push(wx / len, wy / len, wz / len);
  }
  return { P, N, T: Array.from(raw.idx), frame: f };
}

/** Her bounding box, for the log. */
export function bbox(m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.P.length; i++) {
    const k = i % 3;
    if (m.P[i] < lo[k]) lo[k] = m.P[i];
    if (m.P[i] > hi[k]) hi[k] = m.P[i];
  }
  return { lo, hi };
}

// ---- winding ------------------------------------------------------------------------
export function faceNormal(m, a, b, c) {
  const P = m.P;
  const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
  const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
  return [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
}

/**
 * The sculpt's own winding agrees with its own normals, bar the triangles a
 * decimator folded over. Each triangle is put back facing the way its three
 * vertex normals say it faces. Returns how many were turned.
 */
export function fixWinding(m) {
  const { N, T } = m;
  let flipped = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const [fx, fy, fz] = faceNormal(m, a, b, c);
    const vx = N[a * 3] + N[b * 3] + N[c * 3];
    const vy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1];
    const vz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * vx + fy * vy + fz * vz < 0) { T[t + 1] = c; T[t + 2] = b; flipped++; }
  }
  return flipped;
}

// ---- the carve ------------------------------------------------------------------------
/**
 * Mark for removal every triangle inside a box, above the box's floor.
 *
 * Each box is `{ name, x0, x1, z0, z1, floor(z) }` in her own frame, with an
 * optional ceiling `y1`. A triangle goes if its centroid is inside and above
 * the floor -- and also if any corner, or the middle of any edge, stands well
 * clear of the floor inside the box: a long sliver of a shield whose centroid
 * falls just outside the box still reaches up into it, and left behind it
 * drags the patch up into a tent over the deck.
 *
 * Returns `keep` (one byte a triangle) and how many each box took.
 */
export function carve(m, boxes, keep = null) {
  const { P, T } = m;
  const nTri = T.length / 3;
  const out = keep || new Uint8Array(nTri).fill(1);
  const cut = new Map();
  const under = (k, y) => k.y1 === undefined || y < k.y1;
  for (let t = 0; t < nTri; t++) {
    if (!out[t]) continue;
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    for (const k of boxes) {
      let hit = cx >= k.x0 && cx <= k.x1 && cz >= k.z0 && cz <= k.z1 && cy > k.floor(cz) && under(k, cy);
      const probes = [[a, a], [b, b], [c, c], [a, b], [b, c], [c, a]];
      for (const [u, w] of probes) {
        if (hit) break;
        const vx = (P[u * 3] + P[w * 3]) / 2;
        const vy = (P[u * 3 + 1] + P[w * 3 + 1]) / 2;
        const vz = (P[u * 3 + 2] + P[w * 3 + 2]) / 2;
        hit = vx >= k.x0 && vx <= k.x1 && vz >= k.z0 && vz <= k.z1 && vy > k.floor(vz) + 0.1 && under(k, vy);
      }
      if (!hit) continue;
      out[t] = 0;
      cut.set(k.name, (cut.get(k.name) || 0) + 1);
      break;
    }
  }
  return { keep: out, cut };
}

// ---- closing the holes ------------------------------------------------------------------
/**
 * Ear-clip a closed loop of vertices, in the plane given by two in-plane
 * axes (by default her plan, X and Z). Returns triangle indices, or null if
 * the outline will not clip in that plane.
 */
export function earClip(m, loop, U = (v) => m.P[v * 3], V = (v) => m.P[v * 3 + 2]) {
  const idx = loop.slice();
  let area = 0;
  for (let i = 0; i < idx.length; i++) {
    const a = idx[i], b = idx[(i + 1) % idx.length];
    area += U(a) * V(b) - U(b) * V(a);
  }
  const sgn = Math.sign(area) || 1;
  const cross = (a, b, c) => ((U(b) - U(a)) * (V(c) - V(a)) - (V(b) - V(a)) * (U(c) - U(a))) * sgn;
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

/**
 * Close every hole in the mesh once the triangles `keep` says are gone have
 * gone, and replace `m.T` with what is left plus the patches.
 *
 * Every edge that lost a triangle is on the rim of a hole, and those edges
 * run round each hole in closed loops. An edge is on a rim if it is left with
 * an odd number of triangles: one, where the sculpt is a plain closed
 * surface, or three where it is not -- a sculpt carries a few dozen edges with
 * three or four triangles on them, and a rim that runs along one of those has
 * to be seen there too or the loop round the hole never closes. Loops are
 * walked without regard to direction, because a sculpt's winding is only as
 * consistent as fixWinding could make it; which way a patch is wound is
 * settled per loop by majority -- the kept triangles along the rim mostly run
 * one way round it, and the patch runs the other.
 *
 * `boxFor(cx, cz)` says which carve a hole belongs to, from the middle of its
 * rim in plan. A hole that belongs to a carve is laid flat at the deck the cut
 * went down to (`box.floor(z) - 0.13`), with a vertical skirt from any rim
 * vertex standing above that down to the patch -- a rim that climbs a wall
 * then closes the wall and leaves the deck level, where a patch stretched
 * straight across it is a ramp. It is filled in plan, by ear clipping, and by
 * a fan from its middle if the outline will not clip in plan. A hole that
 * belongs to no carve -- where a wire was taken off a mast -- is closed in its
 * own plane.
 */
export function closeHoles(m, keep, boxFor) {
  const { P, N, T } = m;
  const nTri = T.length / 3;
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
  const stats = { loops: 0, capped: 0, fanned: 0, chains: 0, skirted: 0, own: 0 };
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
      if (!closed) { stats.chains++; continue; }
      if (loop.length < 3) continue;
      stats.loops++;
      let along = 0;
      for (let i = 0; i < loop.length; i++) {
        const [a] = dirOf.get(keys[i]);
        along += a === loop[i] ? 1 : -1;
      }
      const poly = along >= 0 ? loop.slice().reverse() : loop.slice();
      let cx = 0, cz = 0;
      for (const v of poly) { cx += P[v * 3]; cz += P[v * 3 + 2]; }
      cx /= poly.length; cz /= poly.length;
      const box = boxFor(cx, cz);
      if (!box) {
        // In its own plane: the rim's own normal (Newell's), and two axes in
        // the plane square to it.
        stats.own++;
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i] * 3, b = poly[(i + 1) % poly.length] * 3;
          nx += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]);
          ny += (P[a + 2] - P[b + 2]) * (P[a] + P[b]);
          nz += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let ux = ref[1] * nz - ref[2] * ny, uy = ref[2] * nx - ref[0] * nz, uz = ref[0] * ny - ref[1] * nx;
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
        const U = (v) => P[v * 3] * ux + P[v * 3 + 1] * uy + P[v * 3 + 2] * uz;
        const Vv = (v) => P[v * 3] * vx + P[v * 3 + 1] * vy + P[v * 3 + 2] * vz;
        const tris = earClip(m, poly, U, Vv);
        if (tris) {
          // Clipped in its own frame, which may run either way round: wind
          // each triangle with the rim.
          for (let i = 0; i < tris.length; i += 3) {
            const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
            const [fx, fy, fz] = faceNormal(m, a, b, c);
            if (fx * nx + fy * ny + fz * nz < 0) T2.push(a, c, b); else T2.push(a, b, c);
          }
          stats.capped += tris.length / 3;
          continue;
        }
        stats.fanned++;
        let mx = 0, my = 0, mz = 0;
        for (const v of poly) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; }
        const c = P.length / 3;
        P.push(mx / poly.length, my / poly.length, mz / poly.length);
        N.push(nx, ny, nz);
        for (let i = 0; i < poly.length; i++) {
          T2.push(poly[i], poly[(i + 1) % poly.length], c);
          stats.capped++;
        }
        continue;
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
        if (b2 !== b) { T2.push(a, b, b2); stats.capped++; }
        if (a2 !== a) { T2.push(a, b2, a2); stats.capped++; }
      }
      stats.skirted += low.some((w, i) => w !== poly[i]) ? 1 : 0;
      const tris = earClip(m, low);
      if (tris) {
        T2.push(...tris);
        stats.capped += tris.length / 3;
        continue;
      }
      // An outline that will not clip in plan (it climbs a wall): a fan.
      stats.fanned++;
      let mx = 0, my = 0, mz = 0;
      for (const v of low) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; }
      const c = P.length / 3;
      P.push(mx / low.length, my / low.length, mz / low.length);
      N.push(0, 1, 0);
      for (let i = 0; i < low.length; i++) {
        T2.push(low[i], low[(i + 1) % low.length], c);
        stats.capped++;
      }
    }
  }
  m.T = T2;
  return stats;
}

/** The nearest carve box to a point in plan -- how the Graf Spee's holes find their deck. */
export function nearestBox(boxes) {
  return (cx, cz) => {
    let box = null, bestD = Infinity;
    for (const k of boxes) {
      const dx = Math.max(k.x0 - cx, 0, cx - k.x1), dz = Math.max(k.z0 - cz, 0, cz - k.z1);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; box = k; }
    }
    return box;
  };
}

// ---- normals ------------------------------------------------------------------------------
/**
 * Area-weighted face normals, accumulated at each vertex. The source normals
 * only had to be good enough to call the winding: agreeing on which way is
 * roughly out is not the same as being smooth enough to shade with.
 */
export function recomputeNormals(m) {
  const { N, T } = m;
  const nv = m.P.length / 3;
  N.fill(0);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const [fx, fy, fz] = faceNormal(m, a, b, c);
    for (const v of [a, b, c]) { N[v * 3] += fx; N[v * 3 + 1] += fy; N[v * 3 + 2] += fz; }
  }
  for (let i = 0; i < nv; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
}

/**
 * The same point may be several vertices, split where the source had a hard
 * edge. Whatever moves or shades one of them has to treat them as one:
 * `canon[i]` is the first vertex at vertex i's point.
 */
export function weld(m) {
  const P = m.P;
  const nv = P.length / 3;
  const canon = new Int32Array(nv);
  const seen = new Map();
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
    const c = seen.get(k);
    canon[i] = c === undefined ? i : c;
    if (c === undefined) seen.set(k, i);
  }
  return canon;
}

// ---- her stations --------------------------------------------------------------------------
/**
 * Her half-breadth and the height of her deck edge, a metre of her length at
 * a time: what says whether a vertex is her side or something on her.
 *
 * Half-breadth is read under `beamCap` (her deck edge amidships, so nothing
 * standing out from her superstructure counts). The deck edge is the highest
 * point out at her side under `edgeCap` (the height of her forecastle at the
 * stem), then the running median over eleven metres -- her sheer, with
 * anything standing out over her side, a sponson or a catapult, taken out.
 */
export function stations(m, { length, beamCap, edgeCap }) {
  const P = m.P;
  const nv = P.length / 3;
  const zBin = (z) => Math.floor(z + length / 2 + 2);
  const nz = length + 6;
  const halfB = new Float32Array(Math.ceil(nz));
  for (let i = 0; i < nv; i++) {
    if (P[i * 3 + 1] > beamCap) continue;
    const k = zBin(P[i * 3 + 2]);
    halfB[k] = Math.max(halfB[k], Math.abs(P[i * 3]));
  }
  const maxHalfB = Math.max(...halfB);
  const rawEdge = new Float32Array(Math.ceil(nz)).fill(NaN);
  for (let i = 0; i < nv; i++) {
    const k = zBin(P[i * 3 + 2]);
    const y = P[i * 3 + 1];
    if (Math.abs(P[i * 3]) < halfB[k] - 0.5 || y > edgeCap) continue;
    if (!(y <= rawEdge[k])) rawEdge[k] = y;
  }
  const edgeY = new Float32Array(Math.ceil(nz));
  for (let k = 0; k < nz; k++) {
    const w = [];
    for (let j = k - 5; j <= k + 5; j++) if (j >= 0 && j < nz && !Number.isNaN(rawEdge[j])) w.push(rawEdge[j]);
    w.sort((a, b) => a - b);
    edgeY[k] = w.length ? w[w.length >> 1] : -99;
  }
  return { zBin, nz, halfB, maxHalfB, edgeY };
}

// ---- fairing -------------------------------------------------------------------------------
/**
 * Fair the dents decimation left in her topsides, without changing her lines:
 *
 *   * only the topsides of her midbody are touched -- a vertex out at her
 *     side between `foot` and her deck edge, where she is within `midbody` of
 *     her full beam -- never her decks, her superstructure, anything standing
 *     out from her or on her, and never her underwater body or her ends,
 *     whose curves are her lines and not dents;
 *   * every vertex on one of her lines is held where it is: her deck edge, and
 *     any long fore-and-aft crease in her side -- the top of a belt, a
 *     knuckle, a rubbing strake -- so they stay as sharp as the sculpt drew
 *     them;
 *   * a vertex only ever moves along its own normal, in and out of her side,
 *     never along it, and never more than `max` from where the sculpt put it;
 *   * Taubin's pair of passes -- a shrink and a slightly larger swell --
 *     rather than plain averaging, which would take her in a little at every
 *     pass.
 *
 * What it did to her is printed: how far the vertices went, and how far her
 * body plan moved -- her half-breadth each side, cut through the mesh every
 * five metres of her length and every metre of her depth.
 */
export function fair(m, canon, st, opts) {
  const { passes, lambda, mu, max, foot, midbody, planZ, planY } = opts;
  const { P } = m;
  const nvAll = P.length / 3;
  const { zBin, halfB, maxHalfB, edgeY } = st;
  const unitFace = (t) => {
    const [fx, fy, fz] = faceNormal(m, m.T[t], m.T[t + 1], m.T[t + 2]);
    const l = Math.hypot(fx, fy, fz) || 1;
    return [fx / l, fy / l, fz / l];
  };
  const T = m.T;
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
    if (halfB[k] < midbody * maxHalfB) continue;
    if (y > foot && x > halfB[k] - 1.0 && y < edgeY[k] - 0.2) side.push(i);
  }
  const orig = Float64Array.from(P);
  // Normals of the welded surface, area-weighted, off the current shape.
  const wn = new Float64Array(nvAll * 3);
  const weldedNormals = () => {
    wn.fill(0);
    for (let t = 0; t < T.length; t += 3) {
      const [fx, fy, fz] = faceNormal(m, T[t], T[t + 1], T[t + 2]);
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
      // No further than `max` from the sculpt.
      const ox = P[i * 3] - orig[i * 3], oy = P[i * 3 + 1] - orig[i * 3 + 1], oz = P[i * 3 + 2] - orig[i * 3 + 2];
      const d = Math.hypot(ox, oy, oz);
      if (d > max) {
        const s2 = max / d;
        P[i * 3] = orig[i * 3] + ox * s2; P[i * 3 + 1] = orig[i * 3 + 1] + oy * s2; P[i * 3 + 2] = orig[i * 3 + 2] + oz * s2;
      }
    });
  };
  const STATIONS = [];
  for (let z = planZ[0]; z <= planZ[1]; z += planZ[2]) for (let y = planY[0]; y <= planY[1]; y += planY[2]) STATIONS.push([z, y]);
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
  for (let k = 0; k < passes; k++) { pass(lambda); pass(mu); }
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
  return { worst, mean: sum / n };
}

// ---- hard edges ---------------------------------------------------------------------------
/**
 * One normal per vertex, averaged over every face round it, is right for a
 * rounded surface and wrong at a crease: a vertex on her deck edge is shaded
 * as if it faced half up and half out, so each triangle of her side that
 * touches the deck edge shades from grey to the colour of the deck down its
 * length -- a row of pale wedges hanging off her sheer -- and the deck's
 * colour is painted a metre down her side.
 *
 * So the faces round each vertex are split into smoothing groups: two faces
 * that share an edge through the vertex are in the same group unless they
 * meet at more than `crease`, and each group gets a vertex of its own, with
 * the normal of that group alone.
 *
 * Her side plating is a class of its own: a face out at her side, below her
 * deck edge and above `foot`, that looks out over the water within `plateTilt`
 * of level. It never shares a group with anything that is not plating, however
 * gentle the angle between them, so the chamfer a sculpt rounds her deck edge
 * off with and the top of a belt each stay a line rather than bleeding down
 * her side.
 *
 * Replaces the mesh's vertices; returns, for each new vertex, whether it is
 * her side plating.
 */
export function hardEdges(m, canon, st, { crease, plateTilt, foot }) {
  const { P, N } = m;
  const T = m.T;
  const nvAll = P.length / 3;
  const { zBin, halfB, edgeY } = st;
  const cosC = Math.cos(crease);
  const sinTilt = Math.sin(plateTilt);
  const nt = T.length / 3;
  const fn = new Float64Array(nt * 3);   // area-weighted
  const fu = new Float64Array(nt * 3);   // unit
  const plate = new Uint8Array(nt);
  for (let f = 0; f < nt; f++) {
    const [x, y, z] = faceNormal(m, T[f * 3], T[f * 3 + 1], T[f * 3 + 2]);
    const l = Math.hypot(x, y, z) || 1;
    fn[f * 3] = x; fn[f * 3 + 1] = y; fn[f * 3 + 2] = z;
    fu[f * 3] = x / l; fu[f * 3 + 1] = y / l; fu[f * 3 + 2] = z / l;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { const v = T[f * 3 + j]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    const k = zBin(cz);
    plate[f] = Math.abs(cx) > 0.25 && Math.abs(cx) > halfB[k] - 1.0
      && cy > foot && cy < edgeY[k] + 0.05
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
  P.length = P2.length; for (let i = 0; i < P2.length; i++) P[i] = P2[i];
  N.length = N2.length; for (let i = 0; i < N2.length; i++) N[i] = N2[i];
  m.T = T2;
  console.log(`hard edges: ${nvAll} vertices became ${P.length / 3}, split into smoothing groups at ${Math.round(crease * 180 / Math.PI)} degrees`);
  return Uint8Array.from(plated);
}

// ---- plating ------------------------------------------------------------------------------
/**
 * What fairing leaves is a few centimetres of unevenness across triangles
 * several metres long, and a triangle that size tilted a couple of degrees
 * still shows as a facet under a low sun. So her side plating is shaded with
 * the normal it has over a few metres of her length rather than the one each
 * triangle happens to have: every plating vertex takes the weighted mean of
 * the normals of the plating vertices round it on the same side, out to
 * `along` fore and aft but only `up` up and down, so a dent is averaged away
 * along her length while her flare and the lines that run along her stay
 * where they are. Nothing moves; this is shading alone.
 */
export function shadePlating(m, plating, { along, up }) {
  const { P, N } = m;
  const nvAll = P.length / 3;
  const pick = [];
  for (let i = 0; i < nvAll; i++) if (plating[i]) pick.push(i);
  pick.sort((a, b) => P[a * 3 + 2] - P[b * 3 + 2]);
  const out = new Float64Array(pick.length * 3);
  let lo = 0;
  pick.forEach((i, s) => {
    const zi = P[i * 3 + 2];
    while (P[pick[lo] * 3 + 2] < zi - 2 * along) lo++;
    let x = 0, y = 0, z = 0;
    for (let q = lo; q < pick.length; q++) {
      const j = pick[q];
      const dz = P[j * 3 + 2] - zi;
      if (dz > 2 * along) break;
      if (Math.sign(P[j * 3]) !== Math.sign(P[i * 3])) continue;
      const dy = P[j * 3 + 1] - P[i * 3 + 1];
      if (Math.abs(dy) > 2 * up) continue;
      const w = Math.exp(-((dz / along) ** 2) - (dy / up) ** 2);
      x += w * N[j * 3]; y += w * N[j * 3 + 1]; z += w * N[j * 3 + 2];
    }
    const l = Math.hypot(x, y, z) || 1;
    out[s * 3] = x / l; out[s * 3 + 1] = y / l; out[s * 3 + 2] = z / l;
  });
  pick.forEach((i, s) => { N[i * 3] = out[s * 3]; N[i * 3 + 1] = out[s * 3 + 1]; N[i * 3 + 2] = out[s * 3 + 2]; });
  console.log(`plating: ${pick.length} vertices of her side shaded along her length`);
}

// ---- uv, paint ------------------------------------------------------------------------------
/**
 * A crude UV. Not a real unwrap (nothing marks where a seam should fall):
 * length and height over a plating-sized tile, so anything that samples a
 * texture off her has something continuous to land on.
 */
export function uvs(m, tile) {
  const nv = m.P.length / 3;
  const uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    uv[i * 2] = m.P[i * 3 + 2] / tile;
    uv[i * 2 + 1] = m.P[i * 3 + 1] / tile;
  }
  return uv;
}

/**
 * A hex colour as the renderer wants it in a vertex-colour byte buffer.
 *
 * A material built with `new THREE.Color(hex)` -- which is every other colour
 * in this game, always read off a hex constant -- is decoded from sRGB to the
 * renderer's linear working space automatically; that is what makes a hex
 * constant chosen by eye come out on screen looking like the colour it was
 * chosen to look like. A raw vertex-colour byte buffer gets no such decode:
 * the renderer takes it as already linear and encodes it back to sRGB for
 * display, which is a brightening curve, not the identity -- packed straight
 * from the hex, a mid grey bleaches toward white. So each byte is sRGB-decoded
 * here, once at build time, the conversion `new THREE.Color` does once a
 * frame.
 */
export const srgbToLinearByte = (b) => {
  const c = b / 255;
  const lin = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return Math.round(lin * 255);
};
export const paletteToLinear = (hex) => hex.map(srgbToLinearByte);

/** Paint every vertex with whatever `colourOf(i)` says. */
export function paint(m, colourOf) {
  const nv = m.P.length / 3;
  const col = new Uint8Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const c = colourOf(i);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  return col;
}

// ---- her surface ----------------------------------------------------------------------------
/**
 * The highest point of her at every grid point, after the carve: what a
 * fitting is seated on. `HM` is `{ x0, z0, step, nx, nz }`; -99 off her.
 */
export function heightmap(m, HM) {
  const { P, T } = m;
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
  return hm;
}

/** A height map as the Int16 centimetres the data file carries. */
export const heightBytes = (hm) => Buffer.from(Int16Array.from(hm, (v) => Math.round(v * 100)).buffer);

// ---- packing ----------------------------------------------------------------------------------
/**
 * Bucket her triangles into length-wise slices by centroid, re-indexed per
 * slice, and pack them into one binary blob.
 *
 * Fine enough that a slice's own bounding box stays a fair stand-in for her
 * beam anywhere within it, since the fleet's floating-part checks compare a
 * part's box against her breadth at the part's middle station.
 *
 * Layout: u32 bucketCount; per bucket: u32 vertCount, u32 triCount, then
 * Float32 pos[vertCount*3], Float32 nrm[vertCount*3], Uint8 col[vertCount*3],
 * Float32 uv[vertCount*2], Uint16 idx[triCount*3] (every bucket has well under
 * 65536 verts). With `buckets: 1` it is one piece -- a gunhouse, a barrel.
 */
export function pack(m, col, uv, { buckets: nBuckets, length }) {
  const { P, N, T } = m;
  const half = length / 2;
  const bucketOf = (z) => Math.max(0, Math.min(nBuckets - 1,
    Math.floor(((z + half) / length) * nBuckets)));
  const buckets = Array.from({ length: nBuckets }, () => ({
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
        bk.uv.push(uv[v * 2], uv[v * 2 + 1]);
      }
      bk.idx.push(li);
    }
  }
  const nonEmpty = buckets.filter((bk) => bk.idx.length > 0);
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
  return { blob: Buffer.concat(parts), buckets: nonEmpty.length, tris: T.length / 3 };
}
