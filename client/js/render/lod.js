// Coarser copies of a mesh, drawn only where nobody could tell.
//
// A ship is a few hundred thousand triangles, and in a fleet action most of
// the ships in view are miles off: a battleship at ten kilometres is a strip
// of pixels a few dozen long, and every one of her triangles still went
// through the GPU to land in it. Twenty-five a side was more than ten million
// triangles a frame, nearly all of them smaller than the pixels they fell in.
//
// So each big mesh is given coarser copies of itself, made by welding together
// the vertices that fall in the same small cube of space. What a copy costs in
// accuracy is measured when it is made -- the furthest any vertex of the
// original has been moved -- and a copy is drawn only when that distance,
// seen from where the camera is, comes out at under half a pixel. Nothing
// moves on the screen by as much as one pixel, so nothing is lost: a ship
// close enough to show her rivets is drawn with all of them.
//
// Corners stay corners. Vertices are only welded with others facing the same
// way, so a deck edge is still a deck edge and a flat side is lit as a flat
// side; and a vertex keeps its own colour and its own place on the plating
// texture within whatever it was welded to.
//
// A ship's buffers change in battle -- a dent, a scorch, a fitting torn away.
// The moment one does, its copies are out of date and it is drawn in full
// again until a fresh set has been made, which is done a few milliseconds a
// frame behind the picture, never in front of it.

import * as THREE from '../../../vendor/three.module.js';

/** How far, in pixels of the drawing buffer, a copy may put anything. */
export const LOD_PX = 0.4;
// Only meshes this big are worth the copies.
const MIN_TRIS = 3000;
// The cubes the copies are welded in, as fractions of the mesh's radius.
const CELLS = [1 / 900, 1 / 320, 1 / 110, 1 / 36, 1 / 12];
// A copy has to be this much smaller than the one before it to be kept.
const SHRINK = 0.72;
// How long a buffer has to be left alone before its copies are made again.
const SETTLE = 0.6;
// The most a frame gives to making copies, in milliseconds.
const BUDGET = 2.5;
const KNOWN = new Set(['position', 'normal', 'uv', 'color']);

const entries = new WeakMap();
const queue = [];
let job = null;
// Copies of buffers that are the same, made once: every Fletcher in a fleet is
// the same Fletcher until somebody hits her.
const shared = new Map();

function triCount(g) {
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}

/** What a buffer is made of right now, cheap enough to ask every frame. */
function signature(g) {
  const a = g.attributes;
  let n = 0;
  let v = 0;
  for (const k in a) { n++; v = v * 31 + a[k].version + 1; }
  if (g.index) v = v * 31 + g.index.version + 7;
  return v * 1000 + n + (g.drawRange.start % 997) * 7 + (g.drawRange.count === Infinity ? 1 : g.drawRange.count % 991);
}

function same(e, g) {
  const a = g.attributes;
  let i = 0;
  for (const k in a) { if (e.refs[i++] !== a[k]) return false; }
  return i === e.refs.length && e.index === g.index;
}

function refsOf(g) {
  const r = [];
  for (const k in g.attributes) r.push(g.attributes[k]);
  return r;
}

/** Whether this is a buffer copies can be made of at all. */
function eligible(g) {
  if (!g.isBufferGeometry || g.groups.length || g.morphAttributes.position) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  const a = g.attributes;
  if (!a.position || a.position.isInterleavedBufferAttribute || a.position.itemSize !== 3) return false;
  for (const k in a) {
    if (!KNOWN.has(k) || a[k].isInterleavedBufferAttribute || a[k].isInstancedBufferAttribute) return false;
  }
  if (a.normal && a.normal.itemSize !== 3) return false;
  return triCount(g) >= MIN_TRIS;
}

function entryOf(g) {
  let e = entries.get(g);
  if (e) return e;
  e = { sig: signature(g), refs: refsOf(g), index: g.index, levels: null, key: null,
    changed: now(), queued: false, dead: false };
  entries.set(g, e);
  g.addEventListener('dispose', () => { e.dead = true; release(e); });
  return e;
}

function now() { return performance.now() / 1000; }

function release(e) {
  if (!e.levels) return;
  if (e.key !== null) {
    const s = shared.get(e.key);
    if (s && --s.users <= 0) {
      shared.delete(e.key);
      for (const l of s.levels) l.geo.dispose();
    }
  } else {
    for (const l of e.levels) l.geo.dispose();
  }
  e.levels = null;
  e.key = null;
}

/**
 * The geometry to draw `object` with this frame. `g` is its own; `d` is how
 * far the nearest of it can be from the eye, `k` how many pixels a metre is at
 * a metre, `scale` how much bigger it is in the world than in its buffer.
 */
export function pickLod(object, g, d, k, scale) {
  if (!enabled || d <= 0 || object.userData.noLod) return g;
  let e = entries.get(g);
  if (!e) {
    if (!eligible(g)) { entries.set(g, NONE); return g; }
    e = entryOf(g);
  }
  if (e === NONE) return g;
  // Changed since its copies were made: drawn in full until it has settled
  // and a fresh set is ready.
  const sig = signature(g);
  if (sig !== e.sig || !same(e, g)) {
    e.sig = sig;
    e.refs = refsOf(g);
    e.index = g.index;
    e.changed = now();
    release(e);
    if (!eligible(g)) { entries.set(g, NONE); return g; }
  }
  if (!e.levels) {
    if (!e.queued && now() - e.changed >= (e.built ? SETTLE : 0)) { e.queued = true; queue.push({ g, e }); }
    return g;
  }
  // The coarsest copy that is still under half a pixel out from here.
  const px = (k * scale) / d;
  let pick = g;
  for (const l of e.levels) {
    if (l.err * px <= LOD_PX) pick = l.geo;
    else break;
  }
  return pick;
}
const NONE = { none: true };
let enabled = true;
/** For the console and the tests: draw everything in full (false), or not. */
export function setLods(on) { enabled = !!on; }

/** Make copies for a few milliseconds. Called once a frame, after it is drawn. */
export function pumpLods(budget = BUDGET) {
  const until = performance.now() + budget;
  while (performance.now() < until) {
    if (!job) {
      const next = queue.shift();
      if (!next) return;
      const { g, e } = next;
      e.queued = false;
      if (e.dead || e.levels || signature(g) !== e.sig || !same(e, g)) continue;
      job = { g, e, it: makeLevels(g, e), sig: e.sig };
    }
    const r = job.it.next();
    if (!r.done) continue;
    const { g, e, sig } = job;
    job = null;
    // Changed while it was being worked on: what was made is of something
    // that is not there any more.
    if (e.dead || signature(g) !== sig || !same(e, g)) {
      if (r.value && r.value.key === null) for (const l of r.value.levels) l.geo.dispose();
      else if (r.value) unshare(r.value.key);
      continue;
    }
    e.levels = r.value ? r.value.levels : [];
    e.key = r.value ? r.value.key : null;
    e.built = true;
  }
}

function unshare(key) {
  const s = shared.get(key);
  if (s && --s.users <= 0) {
    shared.delete(key);
    for (const l of s.levels) l.geo.dispose();
  }
}

/** Throw away every copy that is waiting to be made. The next battle starts afresh. */
export function resetLods() {
  queue.length = 0;
  job = null;
}

// A fingerprint of a buffer's whole contents, for finding the same buffer on
// another ship.
function hashArray(h, arr) {
  const n = arr.length;
  const u = new Uint32Array(arr.buffer, arr.byteOffset, (arr.byteLength / 4) | 0);
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
  // Whatever does not fill a whole word.
  const tail = arr.byteLength % 4;
  if (tail) {
    const b = new Uint8Array(arr.buffer, arr.byteOffset + arr.byteLength - tail, tail);
    for (let i = 0; i < tail; i++) h = Math.imul(h ^ b[i], 16777619);
  }
  return Math.imul(h ^ n, 16777619);
}

function fingerprint(g) {
  let h1 = 2166136261;
  let h2 = 0x9747b28c;
  const parts = [];
  for (const k of Object.keys(g.attributes).sort()) {
    const a = g.attributes[k];
    parts.push(k, a.itemSize, a.normalized ? 1 : 0, a.array.constructor.name, a.count);
    h1 = hashArray(h1, a.array);
    h2 = hashArray(h2 ^ a.count, a.array);
  }
  if (g.index) {
    parts.push('i', g.index.count, g.index.array.constructor.name);
    h1 = hashArray(h1, g.index.array);
    h2 = hashArray(h2 ^ 77, g.index.array);
  }
  return `${parts.join(':')}#${h1 >>> 0}.${h2 >>> 0}`;
}

/**
 * Every copy of `g` worth having, finest first, each with how far it puts any
 * vertex from where it was. A generator: it gives the frame back between
 * pieces of the work.
 */
function* makeLevels(g, e) {
  const key = fingerprint(g);
  yield;
  const have = shared.get(key);
  if (have) {
    have.users++;
    return { key, levels: have.levels };
  }
  if (!g.boundingSphere) g.computeBoundingSphere();
  const R = g.boundingSphere.radius;
  if (!(R > 0)) return null;
  const levels = [];
  let tris = triCount(g);
  for (const f of CELLS) {
    const made = yield* cluster(g, R * f);
    if (!made) continue;
    const n = triCount(made.geo);
    if (n > tris * SHRINK) { made.geo.dispose(); continue; }
    levels.push(made);
    tris = n;
    if (n < 200) break;
  }
  if (!levels.length) return { key: null, levels };
  shared.set(key, { users: 1, levels });
  return { key, levels };
}

// The direction a normal is binned in: five steps on each axis, which is
// about twenty degrees either side.
function bin(nx, ny, nz) {
  const qx = Math.round((nx + 1) * 2);
  const qy = Math.round((ny + 1) * 2);
  const qz = Math.round((nz + 1) * 2);
  return (qx * 5 + qy) * 5 + qz;
}

/**
 * `g` welded in cubes `c` on a side: one position for each cube, shared by
 * everything in it so no seam opens, and within the cube one vertex for each
 * way its faces look.
 */
function* cluster(g, c) {
  const P = g.attributes.position;
  const N = g.attributes.normal || null;
  const others = [];
  for (const k in g.attributes) if (k !== 'position' && k !== 'normal') others.push([k, g.attributes[k]]);
  const n = P.count;
  const p = P.array;
  const nrm = N ? N.array : null;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox;
  const nx = Math.floor((bb.max.x - bb.min.x) / c) + 1;
  const ny = Math.floor((bb.max.y - bb.min.y) / c) + 1;
  const nz = Math.floor((bb.max.z - bb.min.z) / c) + 1;
  if (nx * ny * nz > 2 ** 45 || n * 128 > 2 ** 31) return null;
  const ox = bb.min.x, oy = bb.min.y, oz = bb.min.z;

  // Which cube each vertex is in, and which vertex of the copy it becomes:
  // two open-addressed tables, because a Map keyed on numbers was most of the
  // time this took.
  const cellOf = new Int32Array(n);
  const outOf = new Int32Array(n);
  let cap = 1;
  while (cap < n * 2) cap <<= 1;
  const mask = cap - 1;
  const ck = new Float64Array(cap).fill(-1);
  const cv = new Int32Array(cap);
  const ok = new Int32Array(cap).fill(-1);
  const ov = new Int32Array(cap);
  let nCells = 0;
  let nOut = 0;
  const cellSum = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const ix = Math.floor((x - ox) / c), iy = Math.floor((y - oy) / c), iz = Math.floor((z - oz) / c);
    const key = (ix * ny + iy) * nz + iz;
    let h = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & mask;
    while (ck[h] !== -1 && ck[h] !== key) h = (h + 1) & mask;
    let ci;
    if (ck[h] === -1) { ck[h] = key; ci = cv[h] = nCells++; } else ci = cv[h];
    cellOf[i] = ci;
    cellSum[ci * 4] += x; cellSum[ci * 4 + 1] += y; cellSum[ci * 4 + 2] += z; cellSum[ci * 4 + 3]++;
    const b = nrm ? bin(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) : 0;
    const okey = ci * 128 + b;
    let q = Math.imul(okey, 2654435761) & mask;
    while (ok[q] !== -1 && ok[q] !== okey) q = (q + 1) & mask;
    let oi;
    if (ok[q] === -1) { ok[q] = okey; oi = ov[q] = nOut++; } else oi = ov[q];
    outOf[i] = oi;
    if ((i & 65535) === 65535) yield;
  }
  // The cube's one position, and how far that moved the furthest vertex in it.
  let err = 0;
  for (let i = 0; i < n; i++) {
    const ci = cellOf[i];
    const w = cellSum[ci * 4 + 3];
    const dx = p[i * 3] - cellSum[ci * 4] / w;
    const dy = p[i * 3 + 1] - cellSum[ci * 4 + 1] / w;
    const dz = p[i * 3 + 2] - cellSum[ci * 4 + 2] / w;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > err) err = d2;
  }
  err = Math.sqrt(err);
  yield;

  // The triangles, less every one welded down to nothing.
  const src = g.index ? g.index.array : null;
  const triN = (src ? src.length : n) / 3;
  const tri = new Uint32Array(triN * 3);
  let t = 0;
  for (let f = 0; f < triN; f++) {
    const a = src ? src[f * 3] : f * 3;
    const b = src ? src[f * 3 + 1] : f * 3 + 1;
    const d = src ? src[f * 3 + 2] : f * 3 + 2;
    const ca = cellOf[a], cb = cellOf[b], cd = cellOf[d];
    if (ca === cb || cb === cd || ca === cd) continue;
    tri[t++] = outOf[a]; tri[t++] = outOf[b]; tri[t++] = outOf[d];
    if ((f & 32767) === 32767) yield;
  }
  if (!t) return null;

  // Each vertex of the copy: its cube's position, and the average of the
  // normals, colours and texture coordinates welded into it.
  const pos = new Float32Array(nOut * 3);
  const outCell = new Int32Array(nOut);
  const cnt = new Float32Array(nOut);
  for (let i = 0; i < n; i++) { outCell[outOf[i]] = cellOf[i]; cnt[outOf[i]]++; }
  for (let o = 0; o < nOut; o++) {
    const ci = outCell[o];
    const w = cellSum[ci * 4 + 3];
    pos[o * 3] = cellSum[ci * 4] / w;
    pos[o * 3 + 1] = cellSum[ci * 4 + 1] / w;
    pos[o * 3 + 2] = cellSum[ci * 4 + 2] / w;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const average = (attr) => {
    const s = attr.itemSize;
    const a = attr.array;
    const sum = new Float64Array(nOut * s);
    for (let i = 0; i < n; i++) {
      const o = outOf[i];
      for (let j = 0; j < s; j++) sum[o * s + j] += a[i * s + j];
    }
    const res = new a.constructor(nOut * s);
    const whole = !(a instanceof Float32Array || a instanceof Float64Array);
    for (let o = 0; o < nOut; o++) {
      for (let j = 0; j < s; j++) {
        const v = sum[o * s + j] / cnt[o];
        res[o * s + j] = whole ? Math.round(v) : v;
      }
    }
    return new THREE.BufferAttribute(res, s, attr.normalized);
  };
  if (N) {
    const na = average(N);
    const v = na.array;
    for (let o = 0; o < nOut; o++) {
      const l = Math.hypot(v[o * 3], v[o * 3 + 1], v[o * 3 + 2]) || 1;
      v[o * 3] /= l; v[o * 3 + 1] /= l; v[o * 3 + 2] /= l;
    }
    out.setAttribute('normal', na);
  }
  yield;
  for (const [k, attr] of others) out.setAttribute(k, average(attr));
  const idx = nOut < 65536 ? new Uint16Array(t) : new Uint32Array(t);
  idx.set(tri.subarray(0, t));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.boundingSphere = g.boundingSphere.clone();
  out.boundingBox = g.boundingBox.clone();
  return { geo: out, err };
}

/** For the console and the tests: how far the copies have got. */
export function lodStats() {
  return { queued: queue.length, working: !!job, shared: shared.size };
}

/**
 * Make the copies of every big mesh under `root` now, rather than a frame at
 * a time: for the loading screen, where there is no frame to hold up. Gives
 * up after `budget` milliseconds and leaves the rest to pumpLods.
 */
export function buildLodsNow(root, budget = Infinity) {
  const until = performance.now() + budget;
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || performance.now() > until) return;
    const g = o.geometry;
    if (!g || Array.isArray(o.material)) return;
    let e = entries.get(g);
    if (e === NONE || (e && (e.levels || (job && job.e === e)))) return;
    if (!e) {
      if (!eligible(g)) { entries.set(g, NONE); return; }
      e = entryOf(g);
    }
    // Whatever was waiting for it in the queue finds it done, and passes on.
    e.queued = false;
    const it = makeLevels(g, e);
    let r = it.next();
    while (!r.done) r = it.next();
    e.levels = r.value ? r.value.levels : [];
    e.key = r.value ? r.value.key : null;
    e.built = true;
  });
}

/** For the console: the copies a buffer has, finest first, as [triangles, error]. */
export function lodInfo(g) {
  const e = entries.get(g);
  if (!e || e === NONE) return null;
  return { levels: e.levels && e.levels.map((l) => [triCount(l.geo), +l.err.toFixed(3)]), queued: e.queued };
}
