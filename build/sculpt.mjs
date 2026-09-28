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
 * `boxFor(cx, cz, cy)` says which carve a hole belongs to, from the middle of
 * its rim. A hole that belongs to a carve is laid flat at the deck the cut
 * went down to (`box.floor(z) - 0.13`), with a vertical skirt from any rim
 * vertex standing above that down to the patch -- a rim that climbs a wall
 * then closes the wall and leaves the deck level, where a patch stretched
 * straight across it is a ramp. It is filled in plan, by ear clipping, and by
 * a fan from its middle if the outline will not clip in plan. A box may give a
 * `ceil(z)` instead, for a hole left overhead where something was cut away
 * from under a deck: that is laid flat at the deckhead, skirted up or down to
 * it from either side, and faces down because the deckhead round it does. A
 * hole that belongs to no carve -- where a wire was taken off a mast -- is
 * closed in its own plane.
 *
 * With `open`, holes the mesh already had are closed too: an edge every one
 * of whose triangles is kept, but an odd number of them.
 */
export function closeHoles(m, keep, boxFor, { open = false } = {}) {
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
    if (kept % 2 === 0 || (kept === list.length && !open)) continue;
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
      let cx = 0, cy = 0, cz = 0;
      for (const v of poly) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
      cx /= poly.length; cy /= poly.length; cz /= poly.length;
      const box = boxFor(cx, cz, cy);
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
      const overhead = !!box.ceil;
      const deckAt = overhead ? box.ceil : (z) => box.floor(z) - 0.13;
      const low = poly.map((v) => {
        const deckY = deckAt(P[v * 3 + 2]);
        if (P[v * 3 + 1] <= deckY + 0.2 && (!overhead || P[v * 3 + 1] >= deckY - 0.2)) return v;
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

/**
 * The loose pieces the mesh is made of: triangles joined through a shared
 * point (by position, so a hard edge the source split does not part them).
 * Each is `{ tris, lo, hi }`, its triangle indices and its bounding box.
 */
export function components(m) {
  const { P, T } = m;
  const nv = P.length / 3;
  const at = new Map();
  const root = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
    if (!at.has(k)) at.set(k, i);
    root[i] = at.get(k);
  }
  const parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let t = 0; t < T.length; t += 3) {
    const a = find(root[T[t]]), b = find(root[T[t + 1]]), c = find(root[T[t + 2]]);
    parent[b] = a; parent[find(c)] = a;
  }
  const byRoot = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const r = find(root[T[t]]);
    if (!byRoot.has(r)) byRoot.set(r, { tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    const c = byRoot.get(r);
    c.tris.push(t / 3);
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        const v = P[T[t + j] * 3 + k];
        if (v < c.lo[k]) c.lo[k] = v;
        if (v > c.hi[k]) c.hi[k] = v;
      }
    }
  }
  return [...byRoot.values()].sort((a, b) => b.tris.length - a.tris.length);
}

// ---- cutting a box out, exactly ------------------------------------------------
/**
 * Is the point inside the solid the triangles `T` over positions `P` bound?
 * By the parity of the crossings of a ray from it -- one leaning a little off
 * every axis, so it does not run along an edge.
 */
export function insideSolid(P, T, x, y, z) {
  // Three rays, each leaning off every axis, and the majority taken: a ray
  // that happens to graze an edge or pass through a pinhole miscounts, and it
  // is not likely three will.
  let votes = 0;
  for (const d of [[0.8573, 0.3812, 0.3459], [-0.3317, 0.8816, -0.3358], [0.4121, -0.3402, -0.8452]]) {
    if (crossings(P, T, x, y, z, d) % 2 === 1) votes++;
  }
  return votes >= 2;
}

function crossings(P, T, x, y, z, d) {
  let n = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [x - P[a], y - P[a + 1], z - P[a + 2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (tt > 1e-9) n++;
  }
  return n;
}

/**
 * Cut a box out of her -- or everything but a box -- exactly along its faces,
 * and close the cut with the faces of the box itself.
 *
 * Every triangle a face of the box passes through is split along it, and so
 * is every triangle sharing an edge the split put a point on, so no crack
 * opens where a cut triangle meets one that was not. What is left of her
 * where she crossed each face is then closed flat in that face: a gunhouse
 * cut off at its roller path leaves its floor, a wall with an opening cut in
 * it a sill, a head and two jambs, as thick as the wall is.
 *
 * `box` is `{ x0, x1, y0, y1, z0, z1 }` in her frame. With `keep: 'outside'`
 * (the default) the box is taken out of her and each face is closed facing
 * into the box; with `keep: 'inside'` only what is in the box is kept, closed
 * facing out of it. Returns how many triangles were cut and the caps made on
 * each face.
 */
export function boxCut(m, box, { keep = 'outside' } = {}) {
  const { P, N } = m;
  const T = m.T;
  const refT = T;                    // her, before the cut, for inside tests
  const lo = [box.x0, box.y0, box.z0], hi = [box.x1, box.y1, box.z1];
  const planes = [[0, lo[0], true], [0, hi[0], false], [1, lo[1], true], [1, hi[1], false], [2, lo[2], true], [2, hi[2], false]];
  const EPS = 1e-6;
  const inBox = (x, y, z) => x > lo[0] + EPS && x < hi[0] - EPS && y > lo[1] + EPS && y < hi[1] - EPS
    && z > lo[2] + EPS && z < hi[2] - EPS;
  const keepInside = keep === 'inside';

  const byPos = new Map();
  const keyOf = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const nv0 = P.length / 3;
  for (let i = 0; i < nv0; i++) {
    const k = keyOf(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (!byPos.has(k)) byPos.set(k, i);
  }
  const pointAt = (x, y, z) => {
    const k = keyOf(x, y, z);
    let i = byPos.get(k);
    if (i === undefined) {
      i = P.length / 3;
      P.push(x, y, z);
      N.push(0, 0, 0);
      byPos.set(k, i);
    }
    return i;
  };
  const ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

  const nTri = T.length / 3;
  const touched = [];
  for (let t = 0; t < nTri; t++) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < 3; j++) {
      const v = T[t * 3 + j];
      for (let k = 0; k < 3; k++) { const c = P[v * 3 + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; }
    }
    if (mx[0] <= lo[0] || mn[0] >= hi[0] || mx[1] <= lo[1] || mn[1] >= hi[1] || mx[2] <= lo[2] || mn[2] >= hi[2]) continue;
    touched.push(t);
  }

  // Split each touched triangle along every face of the box it straddles.
  // Every point a split puts on a segment -- one of her own edges, or a line
  // an earlier face cut -- is recorded against that segment, so everything
  // else with that segment as an edge takes the point too.
  const segPts = new Map();
  const pieces = [];
  for (const t of touched) {
    let polys = [[T[t * 3], T[t * 3 + 1], T[t * 3 + 2]]];
    const outside = [];
    for (const [ax, val, insideHigh] of planes) {
      const next = [];
      for (const poly of polys) {
        const d = poly.map((v) => P[v * 3 + ax] - val);
        const pos = d.some((x) => x > EPS), neg = d.some((x) => x < -EPS);
        if (!(pos && neg)) {
          const high = pos || (!neg && d.reduce((s2, x) => s2 + x, 0) >= 0);
          if (high !== insideHigh) outside.push(poly); else next.push(poly);
          continue;
        }
        const hiSide = [], loSide = [];
        for (let k = 0; k < poly.length; k++) {
          const p = poly[k], q = poly[(k + 1) % poly.length];
          const dp = d[k], dq = d[(k + 1) % poly.length];
          if (dp >= -EPS) hiSide.push(p);
          if (dp <= EPS) loSide.push(p);
          if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
            const s2 = dp / (dp - dq);
            const pt = [0, 1, 2].map((k2) => P[p * 3 + k2] + (P[q * 3 + k2] - P[p * 3 + k2]) * s2);
            pt[ax] = val;
            const r = pointAt(pt[0], pt[1], pt[2]);
            const key = ek(p, q);
            if (!segPts.has(key)) segPts.set(key, []);
            if (!segPts.get(key).includes(r)) segPts.get(key).push(r);
            hiSide.push(r);
            loSide.push(r);
          }
        }
        const inside = insideHigh ? hiSide : loSide;
        const out = insideHigh ? loSide : hiSide;
        if (out.length >= 3) outside.push(out);
        if (inside.length >= 3) next.push(inside);
      }
      polys = next;
    }
    // `polys` is what is inside all six faces -- bar a sliver lying exactly
    // on one, which counts as outside.
    const inner = [];
    for (const poly of polys) {
      let cx = 0, cy = 0, cz = 0;
      for (const v of poly) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
      cx /= poly.length; cy /= poly.length; cz /= poly.length;
      if (inBox(cx, cy, cz)) inner.push(poly); else outside.push(poly);
    }
    for (const poly of keepInside ? inner : outside) pieces.push(poly);
  }

  const gather = (p, q, depth = 0) => {
    const list = segPts.get(ek(p, q));
    if (!list || depth > 12) return [];
    const d2 = (i) => (P[i * 3] - P[p * 3]) ** 2 + (P[i * 3 + 1] - P[p * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[p * 3 + 2]) ** 2;
    const pts = list.filter((i) => i !== p && i !== q).sort((a, b) => d2(a) - d2(b));
    const out = [];
    let prev = p;
    for (const r of pts) { out.push(...gather(prev, r, depth + 1), r); prev = r; }
    out.push(...gather(prev, q, depth + 1));
    return out;
  };
  const T2 = [];
  const emit = (poly) => {
    const ring = [];
    const runs = new Set();
    const extras = poly.map((p, k) => gather(p, poly[(k + 1) % poly.length]));
    const place = [];
    poly.forEach((p, k) => { place.push(ring.length); ring.push(p); for (const r of extras[k]) ring.push(r); });
    poly.forEach((p, k) => {
      if (!extras[k].length) return;
      for (let j = 0; j <= extras[k].length; j++) runs.add(place[k] + j);
      runs.add(place[(k + 1) % poly.length]);
    });
    const clean = [];
    for (const v of ring) if (clean[clean.length - 1] !== v) clean.push(v);
    while (clean.length > 1 && clean[0] === clean[clean.length - 1]) clean.pop();
    if (clean.length < 3) return;
    if (clean.length === 3) { T2.push(clean[0], clean[1], clean[2]); return; }
    let apex = -1;
    if (clean.length === ring.length) for (let k = 0; k < ring.length && apex < 0; k++) if (!runs.has(k)) apex = k;
    if (apex < 0) {
      let mx = 0, my = 0, mz = 0;
      for (const v of clean) { mx += P[v * 3]; my += P[v * 3 + 1]; mz += P[v * 3 + 2]; }
      const c = P.length / 3;
      P.push(mx / clean.length, my / clean.length, mz / clean.length);
      N.push(0, 0, 0);
      for (let k = 0; k < clean.length; k++) T2.push(clean[k], clean[(k + 1) % clean.length], c);
      return;
    }
    for (let k = 1; k < clean.length - 1; k++) {
      T2.push(clean[apex], clean[(apex + k) % clean.length], clean[(apex + k + 1) % clean.length]);
    }
  };
  const touchedSet = new Set(touched);
  for (let t = 0; t < nTri; t++) {
    if (touchedSet.has(t)) continue;
    // Untouched: wholly outside the box, so kept only when the outside is.
    if (!keepInside) emit([T[t * 3], T[t * 3 + 1], T[t * 3 + 2]]);
  }
  for (const poly of pieces) emit(poly);
  m.T = T2;

  // ---- the caps ---------------------------------------------------------------
  const edges = new Map();
  for (let t = 0; t < T2.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = ek(T2[t + e], T2[t + (e + 1) % 3]);
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  const caps = [];
  const solid = (x, y, z) => insideSolid(P, refT, x, y, z);
  for (const [ax, val, insideHigh] of planes) {
    const [ua, va] = [0, 1, 2].filter((k) => k !== ax);
    const uLo = lo[ua], uHi = hi[ua], vLo = lo[va], vHi = hi[va];
    const W = uHi - uLo, H = vHi - vLo;
    const onFace = (v) => Math.abs(P[v * 3 + ax] - val) < 1e-5;
    const rim = [];
    for (const [k, n] of edges) {
      if (n !== 1) continue;
      const [a, b] = k.split(',').map(Number);
      if (onFace(a) && onFace(b)) rim.push([a, b]);
    }
    if (!rim.length) { caps.push(0); continue; }
    // The way each cap faces: into the box when it was taken out, out of it
    // when it was all that was kept.
    const want = [0, 0, 0];
    want[ax] = (insideHigh ? 1 : -1) * (keepInside ? -1 : 1);
    const U = (v) => P[v * 3 + ua], V = (v) => P[v * 3 + va];
    const adj = new Map();
    for (const [a, b] of rim) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
    // Chains, which end on the edge of the face, and loops, which do not.
    const used = new Set();
    const chains = [], loops = [];
    const walk = (s) => {
      const out = [s];
      used.add(s);
      let at = s, prev = -1;
      for (;;) {
        const nx = adj.get(at).find((w) => w !== prev && !used.has(w));
        if (nx === undefined) break;
        out.push(nx);
        used.add(nx);
        prev = at;
        at = nx;
      }
      return out;
    };
    for (const s of adj.keys()) if (adj.get(s).length === 1 && !used.has(s)) chains.push(walk(s));
    for (const s of adj.keys()) if (!used.has(s)) loops.push(walk(s));
    if (process.env.BOXCUT_DEBUG) console.log(`  face ax${ax}=${val.toFixed(2)}: ${rim.length} rim edges, ${chains.length} chains (${chains.map((c) => c.length).join(',')}), ${loops.length} loops (${loops.map((c) => c.length).join(',')})`);
    // Round the edge of the face: how far along its perimeter a point is.
    const perim = (u, v) => {
      if (Math.abs(v - vLo) < 1e-5) return u - uLo;
      if (Math.abs(u - uHi) < 1e-5) return W + (v - vLo);
      if (Math.abs(v - vHi) < 1e-5) return W + H + (uHi - u);
      return 2 * W + H + (vHi - v);
    };
    const L = 2 * (W + H);
    const cornerAt = (t) => {
      const pt = [0, 0, 0];
      pt[ax] = val;
      const tt = ((t % L) + L) % L;
      if (tt < W) { pt[ua] = uLo + tt; pt[va] = vLo; } else if (tt < W + H) { pt[ua] = uHi; pt[va] = vLo + (tt - W); } else if (tt < 2 * W + H) { pt[ua] = uHi - (tt - W - H); pt[va] = vHi; } else { pt[ua] = uLo; pt[va] = vHi - (tt - 2 * W - H); }
      return pt;
    };
    const rings = [];
    if (chains.length) {
      const ends = [];
      chains.forEach((ch, n) => {
        ends.push({ v: ch[0], t: perim(U(ch[0]), V(ch[0])), n, first: true });
        ends.push({ v: ch[ch.length - 1], t: perim(U(ch[ch.length - 1]), V(ch[ch.length - 1])), n, first: false });
      });
      ends.sort((a, b) => a.t - b.t);
      // Each stretch of the face's edge between two chain ends is either in
      // her or not; the corners of the face along it come with it.
      const inside = ends.map((e, k) => {
        const nx = ends[(k + 1) % ends.length];
        let t1 = nx.t;
        if (t1 <= e.t) t1 += L;
        const pt = cornerAt((e.t + t1) / 2);
        // Stepped a hair into the face, off its edge.
        pt[ua] = Math.min(uHi - 1e-3, Math.max(uLo + 1e-3, pt[ua]));
        pt[va] = Math.min(vHi - 1e-3, Math.max(vLo + 1e-3, pt[va]));
        return solid(pt[0], pt[1], pt[2]);
      });
      const endIdx = new Map(ends.map((e, k) => [`${e.n},${e.first}`, k]));
      const doneChain = new Set();
      for (let n0 = 0; n0 < chains.length; n0++) {
        if (doneChain.has(n0)) continue;
        const ring = [];
        let n = n0, fromFirst = true, ok = true;
        for (let guard = 0; guard < 4 * chains.length + 4; guard++) {
          doneChain.add(n);
          const ch = fromFirst ? chains[n] : chains[n].slice().reverse();
          for (const v of ch) ring.push(v);
          // At its far end: along the edge of the face, whichever way is in her.
          const k = endIdx.get(`${n},${!fromFirst}`);
          let step = 0;
          if (inside[k]) step = 1; else if (inside[(k - 1 + ends.length) % ends.length]) step = -1;
          if (!step) { ok = false; break; }
          const k2 = (k + step + ends.length) % ends.length;
          const e = ends[k], e2 = ends[k2];
          // The corners passed on the way.
          let t0 = e.t, t1 = e2.t;
          if (step > 0) { if (t1 <= t0) t1 += L; } else if (t1 >= t0) t1 -= L;
          const corners = [0, W, W + H, 2 * W + H, L, L + W, L + W + H, L + 2 * W + H, -L + W, -L + W + H, -L + 2 * W + H, -L];
          const passed = corners.filter((c) => (step > 0 ? c > t0 + 1e-6 && c < t1 - 1e-6 : c < t0 - 1e-6 && c > t1 + 1e-6))
            .sort((a, b) => (step > 0 ? a - b : b - a));
          for (const c of passed) { const pt = cornerAt(c); ring.push(pointAt(pt[0], pt[1], pt[2])); }
          if (e2.n === n0 && e2.first === true) break;
          n = e2.n;
          fromFirst = e2.first;
          if (doneChain.has(n)) { ok = false; break; }
        }
        if (process.env.BOXCUT_DEBUG) console.log(`    ring from chain ${n0}: ${ok ? 'closed' : 'FAILED'} with ${ring.length} points; inside ${inside.map((b) => (b ? 1 : 0)).join('')}`);
        if (ok && ring.length >= 3) rings.push(ring);
      }
    }
    for (const lp of loops) if (lp.length >= 3) rings.push(lp);
    // Holes: a ring inside another, round a part of the face that is not in
    // her. Each is bridged into the ring round it.
    const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += U(p) * V(q) - U(q) * V(p); } return a / 2; };
    const contains = (r, u, v) => {
      let c = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const ui = U(r[i]), vi = V(r[i]), uj = U(r[j]), vj = V(r[j]);
        if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
      }
      return c;
    };
    rings.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    const outer = [];
    for (const r of rings) {
      const host = outer.find((o) => contains(o.ring, U(r[0]), V(r[0])));
      if (host) host.holes.push(r); else outer.push({ ring: r, holes: [] });
    }
    let made = 0;
    for (const { ring, holes } of outer) {
      let poly = ring.slice();
      for (const h of holes) {
        // Bridge from the hole's rightmost point to the nearest ring point.
        let hi2 = 0;
        for (let i = 1; i < h.length; i++) if (U(h[i]) > U(h[hi2])) hi2 = i;
        let best = 0, bd = Infinity;
        for (let i = 0; i < poly.length; i++) {
          const d = (U(poly[i]) - U(h[hi2])) ** 2 + (V(poly[i]) - V(h[hi2])) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        const hole = [...h.slice(hi2), ...h.slice(0, hi2 + 1)];
        // Holes run the other way round from the ring they are in.
        if (Math.sign(area(h)) === Math.sign(area(poly))) hole.reverse();
        poly = [...poly.slice(0, best + 1), ...hole, poly[best], ...poly.slice(best + 1)];
      }
      const tris = earClip(m, poly, U, V);
      if (!tris) continue;
      for (let k = 0; k < tris.length; k += 3) {
        const [p, q, r] = [tris[k], tris[k + 1], tris[k + 2]];
        const [fx, fy, fz] = faceNormal(m, p, q, r);
        if (fx * want[0] + fy * want[1] + fz * want[2] < 0) T2.push(p, r, q); else T2.push(p, q, r);
      }
      made += tris.length / 3;
    }
    caps.push(made);
  }
  return { cut: touched.length, caps };
}

// ---- openings -------------------------------------------------------------------
/**
 * Cut a rectangular opening through a wall of her side: a box taken out of
 * her exactly, the cut closed with a sill, a head and two jambs as thick as
 * the wall is -- so the opening is a clean hole with square reveals rather
 * than a ragged bite. `spec` is `{ side, xIn, xOut, za, zb, ya, yb }`: `side`
 * +1 port, -1 starboard, and the box from `xIn` to `xOut` out from her
 * centreline, `za` to `zb` along her and `ya` to `yb` up. Open air inboard of
 * `xIn` and outboard of `xOut`.
 */
export function cutOpening(m, spec) {
  const { side, xIn, xOut, za, zb, ya, yb } = spec;
  const [x0, x1] = side > 0 ? [xIn, xOut] : [-xOut, -xIn];
  const r = boxCut(m, { x0, x1, y0: ya, y1: yb, z0: za, z1: zb });
  return { cut: r.cut, reveals: r.caps.filter((n) => n > 0) };
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
export function stations(m, { length, beamCap, edgeCap, slice = false, beamFloor = -Infinity }) {
  const P = m.P;
  const nv = P.length / 3;
  const zBin = (z) => Math.floor(z + length / 2 + 2);
  const nz = length + 6;
  // With `slice`, every station is also read off the section of her there --
  // each triangle cut through the middle of the metre -- and not only off
  // whichever vertices happen to fall in it: on a mesh whose side is a few
  // long triangles, most metres of her length have no vertex of her side in
  // them at all, and read as having no breadth.
  const sections = [];
  if (slice) {
    for (let k = 0; k < Math.ceil(nz); k++) sections.push([]);
    const T = m.T;
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t], T[t + 1], T[t + 2]];
      const zs = v.map((i) => P[i * 3 + 2]);
      const k0 = Math.max(0, zBin(Math.min(...zs)) - 1), k1 = Math.min(Math.ceil(nz) - 1, zBin(Math.max(...zs)) + 1);
      for (let k = k0; k <= k1; k++) {
        const zc = k - length / 2 - 2 + 0.5;
        const pts = [];
        for (let j = 0; j < 3; j++) {
          const a = v[j], b = v[(j + 1) % 3];
          const za = P[a * 3 + 2], zb = P[b * 3 + 2];
          if ((za - zc) * (zb - zc) > 0 || za === zb) continue;
          const s = (zc - za) / (zb - za);
          pts.push([P[a * 3] + (P[b * 3] - P[a * 3]) * s, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * s]);
        }
        if (pts.length === 2) sections[k].push(pts);
      }
    }
  }
  const halfB = new Float32Array(Math.ceil(nz));
  // And, with `beamFloor`, only above it: a bilge keel standing out from her
  // below the waterline is not her side.
  for (let i = 0; i < nv; i++) {
    if (P[i * 3 + 1] > beamCap || P[i * 3 + 1] < beamFloor) continue;
    const k = zBin(P[i * 3 + 2]);
    halfB[k] = Math.max(halfB[k], Math.abs(P[i * 3]));
  }
  if (slice) {
    sections.forEach((segs, k) => {
      for (const [[xa, ya], [xb, yb]] of segs) {
        if (ya <= beamCap && ya >= beamFloor) halfB[k] = Math.max(halfB[k], Math.abs(xa));
        if (yb <= beamCap && yb >= beamFloor) halfB[k] = Math.max(halfB[k], Math.abs(xb));
        for (const lim of [beamCap, beamFloor]) {
          if ((ya - lim) * (yb - lim) < 0) {
            const s = (lim - ya) / (yb - ya);
            halfB[k] = Math.max(halfB[k], Math.abs(xa + (xb - xa) * s));
          }
        }
      }
    });
  }
  const maxHalfB = Math.max(...halfB);
  const rawEdge = new Float32Array(Math.ceil(nz)).fill(NaN);
  for (let i = 0; i < nv; i++) {
    const k = zBin(P[i * 3 + 2]);
    const y = P[i * 3 + 1];
    if (Math.abs(P[i * 3]) < halfB[k] - 0.5 || y > edgeCap) continue;
    if (!(y <= rawEdge[k])) rawEdge[k] = y;
  }
  if (slice) {
    sections.forEach((segs, k) => {
      for (const seg of segs) {
        for (const [x, y] of seg) {
          if (Math.abs(x) < halfB[k] - 0.5 || y > edgeCap) continue;
          if (!(y <= rawEdge[k])) rawEdge[k] = y;
        }
      }
    });
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

// ---- lumps ------------------------------------------------------------------------------
/**
 * Sand the small lumps off her decks.
 *
 * A sculpt draws a bollard, a ventilator or a coil of line as a blob of the
 * deck pushed up, and at the size a ship is seen at in this game a deck strewn
 * with them reads as a deck strewn with rocks. So every lump standing on a
 * deck that is small in plan both ways and low is pressed back down flush with
 * the deck round it. Nothing long is touched -- a bulwark, a rail, the rim of
 * a gun tub is long one way however thin it is -- nor anything tall, a mast leg
 * or a davit, nor anything standing on a part of her that is not a deck.
 *
 * Her surface is read off as a height map `HM` (`{ x0, z0, step, nx, nz }`);
 * the deck under a lump is that surface opened with a disc of radius `rBase`,
 * which takes away anything narrower than the disc and leaves the deck. A lump
 * is a patch standing `rise[0]` or more over that, at most `maxSize` across
 * each way and `rise[1]` tall, on a deck at least `minBase` up; a post -- no
 * more than `post[0]` across and more than `post[1]` tall -- is not a lump.
 * `keep(x, z)` spares a lump by where it stands. Every vertex of a lump, and
 * of the deck just round it, standing above that deck is put down on it.
 * Returns how many lumps went and how many vertices moved.
 */
export function findLumps(m, {
  HM, rBase = 2.0, rise = [0.15, 1.5], maxSize = 2.6, minBase = 5.0, post = [0.5, 0.8],
  keep = () => false, margin = 0.35,
}) {
  const hm = heightmap(m, HM);
  const { nx, nz, step } = HM;
  const at = (i, j) => j * nx + i;
  const R = Math.round(rBase / step);
  const disc = [];
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if (di * di + dj * dj <= R * R) disc.push([di, dj]);
  const morph = (src, pick) => {
    const out = new Float32Array(src.length).fill(-99);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (hm[at(i, j)] < -50) continue;
        let v = pick === 'min' ? Infinity : -Infinity;
        for (const [di, dj] of disc) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const h = src[at(ii, jj)];
          if (h < -50) continue;
          v = pick === 'min' ? Math.min(v, h) : Math.max(v, h);
        }
        out[at(i, j)] = v;
      }
    }
    return out;
  };
  const opened = morph(morph(hm, 'min'), 'max');
  for (let k = 0; k < hm.length; k++) if (hm[k] > -50) opened[k] = Math.min(opened[k], hm[k]);
  const up = new Uint8Array(hm.length);
  for (let k = 0; k < hm.length; k++) if (hm[k] > -50 && hm[k] > opened[k] + rise[0]) up[k] = 1;
  const seen = new Uint8Array(hm.length);
  const boxes = [];
  for (let k = 0; k < hm.length; k++) {
    if (!up[k] || seen[k]) continue;
    const q = [k];
    seen[k] = 1;
    const cells = [];
    while (q.length) {
      const c = q.pop();
      cells.push(c);
      const i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = at(ii, jj);
        if (up[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, tall = 0, base = Infinity;
    for (const c of cells) {
      const i = c % nx, j = (c - i) / nx;
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      tall = Math.max(tall, hm[c] - opened[c]);
      base = Math.min(base, opened[c]);
    }
    const w = (i1 - i0 + 1) * step, l = (j1 - j0 + 1) * step;
    const x = HM.x0 + ((i0 + i1) / 2) * step, z = HM.z0 + ((j0 + j1) / 2) * step;
    const isPost = Math.min(w, l) <= post[0] && tall > post[1];
    if (w > maxSize || l > maxSize || tall > rise[1] || base < minBase || isPost || keep(x, z)) continue;
    // The deck round it, not under it: the highest of the opened surface over
    // its footprint, so the patch goes down to the deck and no lower.
    let deck = -Infinity;
    for (const c of cells) deck = Math.max(deck, opened[c]);
    boxes.push({
      name: `lump ${x.toFixed(1)},${z.toFixed(1)}`,
      x0: HM.x0 + i0 * step - margin, x1: HM.x0 + i1 * step + margin,
      z0: HM.z0 + j0 * step - margin, z1: HM.z0 + j1 * step + margin,
      floor: () => deck + 0.08, lump: true,
    });
  }
  return boxes;
}

export function flattenLumps(m, {
  HM, rBase = 2.0, rise = [0.15, 1.5], maxSize = 2.6, minBase = 5.0, post = [0.5, 0.8],
  keep = () => false,
}) {
  const { P } = m;
  const hm = heightmap(m, HM);
  const { nx, nz, step } = HM;
  const at = (i, j) => j * nx + i;
  const R = Math.round(rBase / step);
  const disc = [];
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if (di * di + dj * dj <= R * R) disc.push([di, dj]);
  const morph = (src, pick) => {
    const out = new Float32Array(src.length).fill(-99);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (hm[at(i, j)] < -50) continue;
        let v = pick === 'min' ? Infinity : -Infinity;
        for (const [di, dj] of disc) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const h = src[at(ii, jj)];
          if (h < -50) continue;
          v = pick === 'min' ? Math.min(v, h) : Math.max(v, h);
        }
        out[at(i, j)] = v;
      }
    }
    return out;
  };
  const opened = morph(morph(hm, 'min'), 'max');
  for (let k = 0; k < hm.length; k++) if (hm[k] > -50) opened[k] = Math.min(opened[k], hm[k]);
  const up = new Uint8Array(hm.length);
  for (let k = 0; k < hm.length; k++) if (hm[k] > -50 && hm[k] > opened[k] + rise[0]) up[k] = 1;
  // Each patch standing up out of her deck, and which of them are lumps.
  const region = new Int32Array(hm.length).fill(-1);
  const lumps = [];
  let nRegions = 0;
  for (let k = 0; k < hm.length; k++) {
    if (!up[k] || region[k] >= 0) continue;
    const id = nRegions++;
    const q = [k];
    region[k] = id;
    const cells = [];
    while (q.length) {
      const c = q.pop();
      cells.push(c);
      const i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = at(ii, jj);
        if (up[n] && region[n] < 0) { region[n] = id; q.push(n); }
      }
    }
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, tall = 0, base = 0;
    for (const c of cells) {
      const i = c % nx, j = (c - i) / nx;
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      tall = Math.max(tall, hm[c] - opened[c]);
      base += opened[c];
    }
    base /= cells.length;
    const w = (i1 - i0 + 1) * step, l = (j1 - j0 + 1) * step;
    const x = HM.x0 + ((i0 + i1) / 2) * step, z = HM.z0 + ((j0 + j1) / 2) * step;
    const isPost = Math.min(w, l) <= post[0] && tall > post[1];
    if (w <= maxSize && l <= maxSize && tall <= rise[1] && base >= minBase && !isPost && !keep(x, z)) {
      lumps.push({ id, cells, tall });
    }
  }
  // The deck each vertex of a lump goes down to: under the lump, and for two
  // cells round it where nothing else stands up.
  const target = new Float32Array(hm.length).fill(NaN);
  const reach = new Float32Array(hm.length).fill(0);
  for (const L of lumps) {
    for (const c of L.cells) {
      const i = c % nx, j = (c - i) / nx;
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const n = at(ii, jj);
          if (region[n] >= 0 && region[n] !== L.id) continue;
          if (hm[n] < -50) continue;
          target[n] = Number.isNaN(target[n]) ? opened[n] : Math.min(target[n], opened[n]);
          reach[n] = Math.max(reach[n], L.tall + 0.3);
        }
      }
    }
  }
  let moved = 0;
  for (let v = 0; v < P.length / 3; v++) {
    const i = Math.round((P[v * 3] - HM.x0) / step), j = Math.round((P[v * 3 + 2] - HM.z0) / step);
    if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
    const k = at(i, j);
    const t = target[k];
    if (Number.isNaN(t)) continue;
    const y = P[v * 3 + 1];
    if (y > t + 0.01 && y < t + reach[k]) { P[v * 3 + 1] = t; moved++; }
  }
  return { lumps: lumps.length, moved };
}

/**
 * Smooth the dents out of whatever of her is nearly flat: a deck, the side of
 * a deckhouse, a gunhouse roof, a funnel casing -- anywhere every face round a
 * point is within `flat` of the way the point faces. Corners and creases are
 * not nearly flat, and are held where they are, so an edge stays an edge. The
 * same Taubin pair of passes as `fair`, along the normal only, and never more
 * than `max` from where the sculpt put a point.
 */
export function smoothFlats(m, canon, { passes = 8, lambda = 0.5, mu = -0.53, max = 0.15, flat = 20 } = {}) {
  const { P, T } = m;
  const nv = P.length / 3;
  const cosFlat = Math.cos(flat * Math.PI / 180);
  const nb = new Map();
  const faces = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const v = [canon[T[t]], canon[T[t + 1]], canon[T[t + 2]]];
    for (let j = 0; j < 3; j++) {
      const a = v[j];
      if (!nb.has(a)) nb.set(a, new Set());
      if (!faces.has(a)) faces.set(a, []);
      faces.get(a).push(t);
      for (let k = 1; k < 3; k++) if (v[(j + k) % 3] !== a) nb.get(a).add(v[(j + k) % 3]);
    }
  }
  const unit = (t) => {
    const [x, y, z] = faceNormal(m, T[t], T[t + 1], T[t + 2]);
    const l = Math.hypot(x, y, z);
    return l < 1e-12 ? null : [x / l, y / l, z / l];
  };
  const orig = Float64Array.from(P);
  const normalOf = (i) => {
    let x = 0, y = 0, z = 0;
    const us = [];
    for (const t of faces.get(i)) {
      const u = unit(t);
      if (!u) continue;
      us.push(u);
      x += u[0]; y += u[1]; z += u[2];
    }
    const l = Math.hypot(x, y, z);
    if (!us.length || l < 1e-9) return null;
    const n = [x / l, y / l, z / l];
    for (const u of us) if (u[0] * n[0] + u[1] * n[1] + u[2] * n[2] < cosFlat) return null;
    return n;
  };
  const pts = [];
  for (let i = 0; i < nv; i++) if (canon[i] === i && faces.has(i)) pts.push(i);
  const step = new Float64Array(nv * 3);
  let movedMax = 0;
  const pass = (f) => {
    step.fill(0);
    for (const i of pts) {
      const n = normalOf(i);
      if (!n) continue;
      let mx = 0, my = 0, mz = 0, c = 0;
      for (const j of nb.get(i)) { mx += P[j * 3]; my += P[j * 3 + 1]; mz += P[j * 3 + 2]; c++; }
      const d = (mx / c - P[i * 3]) * n[0] + (my / c - P[i * 3 + 1]) * n[1] + (mz / c - P[i * 3 + 2]) * n[2];
      step[i * 3] = f * d * n[0]; step[i * 3 + 1] = f * d * n[1]; step[i * 3 + 2] = f * d * n[2];
    }
    for (const i of pts) {
      for (let k = 0; k < 3; k++) P[i * 3 + k] += step[i * 3 + k];
      const ox = P[i * 3] - orig[i * 3], oy = P[i * 3 + 1] - orig[i * 3 + 1], oz = P[i * 3 + 2] - orig[i * 3 + 2];
      const d = Math.hypot(ox, oy, oz);
      if (d > max) {
        const s = max / d;
        P[i * 3] = orig[i * 3] + ox * s; P[i * 3 + 1] = orig[i * 3 + 1] + oy * s; P[i * 3 + 2] = orig[i * 3 + 2] + oz * s;
      }
    }
  };
  for (let k = 0; k < passes; k++) { pass(lambda); pass(mu); }
  for (let i = 0; i < nv; i++) {
    const c = canon[i];
    if (c !== i) { P[i * 3] = P[c * 3]; P[i * 3 + 1] = P[c * 3 + 1]; P[i * 3 + 2] = P[c * 3 + 2]; }
    movedMax = Math.max(movedMax, Math.hypot(P[i * 3] - orig[i * 3], P[i * 3 + 1] - orig[i * 3 + 1], P[i * 3 + 2] - orig[i * 3 + 2]));
  }
  return { points: pts.length, movedMax };
}

/**
 * Take the lumpiness out of her without rounding her off: bilateral normal
 * filtering, then the points moved to fit the filtered faces.
 *
 * Each face's normal is replaced by a weighted mean of the normals of the faces
 * round it: weighted by their area, by how near they are (`sigmaS`, metres),
 * and by how nearly they already face the same way (`sigmaR`, in the length of
 * the difference of two unit normals). A dent in a flat wall faces nearly the
 * way the wall does and is averaged out; the wall round the corner faces
 * ninety degrees away, gets no weight at all, and the corner stays a corner.
 * Then every point is moved, a little at a time, towards the planes of the
 * faces round it with their new normals (Sun et al.'s update), so the faces
 * come to lie the way their normals now say -- never more than `max` from
 * where the sculpt put it. `only(x, y, z)` limits it to a part of her.
 */
export function denoise(m, canon, {
  sigmaS = 0.6, sigmaR = 0.35, normalIters = 6, vertexIters = 15, max = 0.2, only = () => true,
} = {}) {
  const { P, T } = m;
  const nf = T.length / 3;
  const nv = P.length / 3;
  const V = (t, j) => canon[T[t * 3 + j]];
  const facesOf = new Map();
  for (let t = 0; t < nf; t++) {
    for (let j = 0; j < 3; j++) {
      const v = V(t, j);
      if (!facesOf.has(v)) facesOf.set(v, []);
      facesOf.get(v).push(t);
    }
  }
  const fc = new Float64Array(nf * 3), fa = new Float64Array(nf), fn = new Float64Array(nf * 3);
  const faceData = () => {
    for (let t = 0; t < nf; t++) {
      const a = V(t, 0), b = V(t, 1), c = V(t, 2);
      const [x, y, z] = faceNormal(m, a, b, c);
      const l = Math.hypot(x, y, z);
      fa[t] = l / 2;
      if (l > 1e-12) { fn[t * 3] = x / l; fn[t * 3 + 1] = y / l; fn[t * 3 + 2] = z / l; } else { fn[t * 3] = 0; fn[t * 3 + 1] = 0; fn[t * 3 + 2] = 0; }
      for (let k = 0; k < 3; k++) fc[t * 3 + k] = (P[a * 3 + k] + P[b * 3 + k] + P[c * 3 + k]) / 3;
    }
  };
  faceData();
  // The faces round each face: every face sharing a point with it.
  const nbr = new Array(nf);
  for (let t = 0; t < nf; t++) {
    const s = new Set();
    for (let j = 0; j < 3; j++) for (const f of facesOf.get(V(t, j))) s.add(f);
    nbr[t] = [...s];
  }
  const inside = new Uint8Array(nf);
  for (let t = 0; t < nf; t++) inside[t] = only(fc[t * 3], fc[t * 3 + 1], fc[t * 3 + 2]) ? 1 : 0;
  const s2 = 2 * sigmaS * sigmaS, r2 = 2 * sigmaR * sigmaR;
  let n = Float64Array.from(fn);
  for (let it = 0; it < normalIters; it++) {
    const out = Float64Array.from(n);
    for (let t = 0; t < nf; t++) {
      if (!inside[t]) continue;
      let x = 0, y = 0, z = 0;
      for (const f of nbr[t]) {
        const dx = fc[t * 3] - fc[f * 3], dy = fc[t * 3 + 1] - fc[f * 3 + 1], dz = fc[t * 3 + 2] - fc[f * 3 + 2];
        const ex = n[t * 3] - n[f * 3], ey = n[t * 3 + 1] - n[f * 3 + 1], ez = n[t * 3 + 2] - n[f * 3 + 2];
        const w = fa[f] * Math.exp(-(dx * dx + dy * dy + dz * dz) / s2) * Math.exp(-(ex * ex + ey * ey + ez * ez) / r2);
        x += w * n[f * 3]; y += w * n[f * 3 + 1]; z += w * n[f * 3 + 2];
      }
      const l = Math.hypot(x, y, z);
      if (l > 1e-12) { out[t * 3] = x / l; out[t * 3 + 1] = y / l; out[t * 3 + 2] = z / l; }
    }
    n = out;
  }
  const orig = Float64Array.from(P);
  const pts = [];
  for (const [v, fs] of facesOf) if (fs.some((f) => inside[f])) pts.push(v);
  const delta = new Float64Array(nv * 3);
  for (let it = 0; it < vertexIters; it++) {
    faceData();
    for (const v of pts) {
      let x = 0, y = 0, z = 0;
      const fs = facesOf.get(v);
      for (const f of fs) {
        const d = n[f * 3] * (fc[f * 3] - P[v * 3]) + n[f * 3 + 1] * (fc[f * 3 + 1] - P[v * 3 + 1]) + n[f * 3 + 2] * (fc[f * 3 + 2] - P[v * 3 + 2]);
        x += n[f * 3] * d; y += n[f * 3 + 1] * d; z += n[f * 3 + 2] * d;
      }
      delta[v * 3] = x / fs.length; delta[v * 3 + 1] = y / fs.length; delta[v * 3 + 2] = z / fs.length;
    }
    for (const v of pts) {
      for (let k = 0; k < 3; k++) P[v * 3 + k] += delta[v * 3 + k];
      const ox = P[v * 3] - orig[v * 3], oy = P[v * 3 + 1] - orig[v * 3 + 1], oz = P[v * 3 + 2] - orig[v * 3 + 2];
      const d = Math.hypot(ox, oy, oz);
      if (d > max) {
        const s = max / d;
        P[v * 3] = orig[v * 3] + ox * s; P[v * 3 + 1] = orig[v * 3 + 1] + oy * s; P[v * 3 + 2] = orig[v * 3 + 2] + oz * s;
      }
    }
  }
  let movedMax = 0, sum = 0;
  for (const v of pts) {
    const d = Math.hypot(P[v * 3] - orig[v * 3], P[v * 3 + 1] - orig[v * 3 + 1], P[v * 3 + 2] - orig[v * 3 + 2]);
    movedMax = Math.max(movedMax, d); sum += d;
  }
  for (let i = 0; i < nv; i++) {
    const c = canon[i];
    if (c !== i) { P[i * 3] = P[c * 3]; P[i * 3 + 1] = P[c * 3 + 1]; P[i * 3 + 2] = P[c * 3 + 2]; }
  }
  return { points: pts.length, movedMax, movedMean: pts.length ? sum / pts.length : 0 };
}

/**
 * Round barrels: each barrel of a gun made truly round about its own axis,
 * keeping the sculpt's own profile along it -- the jacket, the chase, the
 * swell at the muzzle -- and losing the lumps. Every point near an axis is put
 * at the radius the barrel has at that distance along it: the median of the
 * sculpt's radii there, smoothed along the barrel. `axes` are lines
 * `{ c0, kc, y0, ky }` with across and up linear in along (z); `from` is where
 * along them the round part starts.
 */
export function roundBarrels(m, axes, { from, bin = 0.25, reach = 1.35 }) {
  const { P } = m;
  const nv = P.length / 3;
  let moved = 0;
  for (const f of axes) {
    const r0 = [];
    const own = [];
    for (let i = 0; i < nv; i++) {
      const z = P[i * 3 + 2];
      if (z < from) continue;
      const cx = f.c0 + f.kc * z, cy = f.y0 + f.ky * z;
      const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy;
      const r = Math.hypot(dx, dy);
      // Nearer this axis than the other.
      let nearest = true;
      for (const g of axes) {
        if (g === f) continue;
        if (Math.hypot(P[i * 3] - (g.c0 + g.kc * z), P[i * 3 + 1] - (g.y0 + g.ky * z)) < r) nearest = false;
      }
      if (!nearest || r > f.r * reach + 0.1) continue;
      own.push(i);
      const k = Math.floor((z - from) / bin);
      (r0[k] ||= []).push(r);
    }
    const prof = r0.map((rs) => (rs && rs.length ? rs.sort((a, b) => a - b)[rs.length >> 1] : null));
    const smooth = prof.map((_, k) => {
      let s = 0, w = 0;
      for (let d = -2; d <= 2; d++) { const v = prof[k + d]; if (v != null) { const ww = 3 - Math.abs(d); s += v * ww; w += ww; } }
      return w ? s / w : null;
    });
    for (const i of own) {
      const z = P[i * 3 + 2];
      const k = Math.floor((z - from) / bin);
      const r = smooth[k];
      if (r == null) continue;
      const cx = f.c0 + f.kc * z, cy = f.y0 + f.ky * z;
      const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy;
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      // The muzzle face and the breech end are at the axis: leave anything
      // well inside the radius, which is the end of the tube, alone.
      if (l < r * 0.55) continue;
      P[i * 3] = cx + (dx / l) * r;
      P[i * 3 + 1] = cy + (dy / l) * r;
      moved++;
    }
  }
  return moved;
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
 * UVs in metres, box-projected off whichever way each point faces: her plan
 * for a deck, her profile for her side, her section for a bulkhead -- so a
 * texture drawn to a scale in metres lies on every face of her at that scale,
 * the way the fleet's welded models are textured (see merge.js).
 */
export function boxUvs(m) {
  const { P, N } = m;
  const nv = P.length / 3;
  const uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    const ax = Math.abs(N[i * 3]), ay = Math.abs(N[i * 3 + 1]), az = Math.abs(N[i * 3 + 2]);
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
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
export function pack(m, col, uv, { buckets: nBuckets, length, surfaceOf = null }) {
  const { P, N, T } = m;
  const half = length / 2;
  const bucketOf = (z) => Math.max(0, Math.min(nBuckets - 1,
    Math.floor(((z + half) / length) * nBuckets)));
  // With `surfaceOf(triangle)`, each slice is two: her plating and her decks,
  // so each can be drawn with the surface it is -- and the blob says so, in
  // the high bit of its count and a word more at the head of each slice.
  const kinds = surfaceOf ? 2 : 1;
  const buckets = Array.from({ length: nBuckets * kinds }, (_, k) => ({
    map: new Map(), pos: [], nrm: [], col: [], uv: [], idx: [], surface: k % kinds,
  }));
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    const bk = buckets[bucketOf(cz) * kinds + (surfaceOf ? surfaceOf(t / 3) : 0)];
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
  head.writeUInt32LE((nonEmpty.length | (surfaceOf ? 0x80000000 : 0)) >>> 0, 0);
  parts.push(head);
  for (const bk of nonEmpty) {
    const nvb = bk.pos.length / 3, ntb = bk.idx.length / 3;
    if (nvb >= 65536) throw new Error('bucket too big for Uint16 indices: ' + nvb);
    const h = Buffer.alloc(surfaceOf ? 12 : 8);
    h.writeUInt32LE(nvb, 0);
    h.writeUInt32LE(ntb, 4);
    if (surfaceOf) h.writeUInt32LE(bk.surface, 8);
    parts.push(h);
    parts.push(Buffer.from(Float32Array.from(bk.pos).buffer));
    parts.push(Buffer.from(Float32Array.from(bk.nrm).buffer));
    parts.push(Buffer.from(Uint8Array.from(bk.col).buffer));
    parts.push(Buffer.from(Float32Array.from(bk.uv).buffer));
    parts.push(Buffer.from(Uint16Array.from(bk.idx).buffer));
  }
  return { blob: Buffer.concat(parts), buckets: nonEmpty.length, tris: T.length / 3 };
}
