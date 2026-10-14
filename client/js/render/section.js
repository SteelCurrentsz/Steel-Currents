// A ship cut across: the outline of her model where a plane athwartships at a
// given station passes through it.
//
// Every triangle of her -- hull, superstructure, mountings -- is put into her
// own frame once, bucketed by how far along her it lies, and kept per class.
// A section is then the segments where the plane z = const cuts the triangles
// in its bucket: her real lines at that station, her real upperworks and the
// guns standing there, rather than a box drawn to her beam. The penetration
// camera draws from this (see pencam.js).

import * as THREE from '../../../vendor/three.module.js';

const BUCKET = 2;
const SOUPS = new Map();
/** Builds under way, by class: a generator worked a slice at a time. */
const BUILDING = new Map();

/** Whether a piece of her is a weapon, by the mountings her view keeps. */
function weaponSet(view) {
  const out = new Set();
  for (const list of [view.turrets, view.secMounts, view.aaMounts, view.torpMounts]) {
    for (const m of list || []) if (m) out.add(m);
  }
  return out;
}

/**
 * Her triangles in her own frame, bucketed by station, built a slice at a
 * time: a battleship is the best part of a million triangles, and putting
 * every one of them into an ordinary array in one go stopped the battle for
 * half a second and, for a moment, needed a hundred megabytes. They go
 * straight into typed arrays now -- the corners as 16-bit steps across her
 * own bounding box, under half a centimetre on the longest hull afloat -- and
 * the work yields every few thousand triangles.
 */
function* build(view) {
  const g = view.group;
  if (!g) return null;
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const weapons = weaponSet(view);
  const kindOf = (o) => {
    for (let p = o; p && p !== g; p = p.parent) if (weapons.has(p)) return 1;
    return 0;
  };
  // What is to be read, and where each piece stands in her frame -- taken
  // all at once, so a turret training between slices does not tear her.
  const parts = [];
  let nt = 0;
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (o.material && (o.material.isShaderMaterial || o.material.transparent)) return;
    // Nothing that is not her: lamps' beams, anything flagged as an effect.
    for (let p = o; p && p !== g; p = p.parent) if (p.userData && p.userData.lamp !== undefined) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = Math.floor((idx ? idx.count : pos.count) / 3);
    const count = o.isInstancedMesh ? o.count : 1;
    const base = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let inst = 0; inst < count; inst++) {
      const m = base.clone();
      if (o.isInstancedMesh) { const im = new THREE.Matrix4(); o.getMatrixAt(inst, im); m.multiply(im); }
      parts.push({ pos, idx, n, m, kind: kindOf(o) });
      nt += n;
    }
  });
  yield;
  // Her box, to scale the corners into.
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let done = 0;
  for (const p of parts) {
    const { pos, idx, n, m } = p;
    for (let i = 0; i < n * 3; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
      box.expandByPoint(v);
    }
    done += n;
    if (done > 40000) { done = 0; yield; }
  }
  if (box.isEmpty()) { box.min.set(-1, -1, -1); box.max.set(1, 1, 1); }
  const lo = box.min.clone();
  const span = box.max.clone().sub(lo).max(new THREE.Vector3(1e-3, 1e-3, 1e-3));
  const q = new THREE.Vector3(65535 / span.x, 65535 / span.y, 65535 / span.z);
  const Q = new Uint16Array(nt * 9);
  const K = new Uint8Array(nt);
  const zlo = new Float32Array(nt), zhi = new Float32Array(nt);
  let t = 0;
  done = 0;
  for (const p of parts) {
    const { pos, idx, n, m, kind } = p;
    for (let k = 0; k < n; k++, t++) {
      let a = Infinity, b = -Infinity;
      for (let e = 0; e < 3; e++) {
        const i = k * 3 + e;
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
        const o = t * 9 + e * 3;
        Q[o] = Math.round((v.x - lo.x) * q.x);
        Q[o + 1] = Math.round((v.y - lo.y) * q.y);
        Q[o + 2] = Math.round((v.z - lo.z) * q.z);
        if (v.z < a) a = v.z;
        if (v.z > b) b = v.z;
      }
      K[t] = kind;
      zlo[t] = a; zhi[t] = b;
    }
    done += n;
    if (done > 25000) { done = 0; yield; }
  }
  // Which triangles cross each two-metre station, as one flat list.
  const zmin = lo.z;
  const nb = Math.max(1, Math.ceil(span.z / BUCKET) + 1);
  const start = new Uint32Array(nb + 1);
  for (let i = 0; i < nt; i++) {
    for (let k = Math.floor((zlo[i] - zmin) / BUCKET); k <= Math.floor((zhi[i] - zmin) / BUCKET); k++) start[k + 1]++;
  }
  for (let k = 0; k < nb; k++) start[k + 1] += start[k];
  const list = new Uint32Array(start[nb]);
  const fill = start.slice(0, nb);
  for (let i = 0; i < nt; i++) {
    for (let k = Math.floor((zlo[i] - zmin) / BUCKET); k <= Math.floor((zhi[i] - zmin) / BUCKET); k++) list[fill[k]++] = i;
  }
  return { Q, K, lo, step: new THREE.Vector3(span.x / 65535, span.y / 65535, span.z / 65535), zmin, start, list, nb };
}

function keyOf(view) { return view.classId || view.cls?.id; }

/**
 * Her triangles in her own frame, bucketed by station. Built the first time a
 * class is asked for and kept: her lines do not change. Asked for now, it is
 * finished now; see prepareSoup for building it while nothing is happening.
 */
export function soupOf(view) {
  const key = keyOf(view);
  if (SOUPS.has(key)) return SOUPS.get(key);
  let it = BUILDING.get(key);
  if (!it) it = build(view);
  let r = it.next();
  while (!r.done) r = it.next();
  BUILDING.delete(key);
  SOUPS.set(key, r.value);
  return r.value;
}

/**
 * Build her soup in the background, a few milliseconds at a time between
 * frames, so the first shell into her finds it ready and the battle never
 * waits for it.
 */
export function prepareSoup(view, budgetMs = 4) {
  const key = keyOf(view);
  if (SOUPS.has(key) || BUILDING.has(key) || typeof window === 'undefined') return;
  const it = build(view);
  BUILDING.set(key, it);
  const later = window.requestIdleCallback
    ? (f) => window.requestIdleCallback(f, { timeout: 500 })
    : (f) => setTimeout(f, 16);
  const step = () => {
    if (BUILDING.get(key) !== it) return;   // finished another way, or cleared
    const t0 = performance.now();
    try {
      let r = it.next();
      while (!r.done && performance.now() - t0 < budgetMs) r = it.next();
      if (r.done) { BUILDING.delete(key); SOUPS.set(key, r.value); return; }
    } catch { BUILDING.delete(key); return; }
    later(step);
  };
  later(step);
}

/** Let go of every soup: the battle that wanted them is over. */
export function clearSoups() { SOUPS.clear(); BUILDING.clear(); }

/**
 * Her section at station z: segments [x0, y0, x1, y1, kind], kind 0 for her
 * and 1 for a weapon.
 */
export function sectionAt(view, z) {
  const soup = soupOf(view);
  if (!soup) return null;
  const { Q, K, lo, step, zmin, start, list, nb } = soup;
  const k = Math.floor((z - zmin) / BUCKET);
  const segs = [];
  if (k < 0 || k >= nb) return segs;
  const P = [];
  const X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
  for (let j = start[k]; j < start[k + 1]; j++) {
    const t = list[j];
    const o = t * 9;
    for (let e = 0; e < 3; e++) {
      X[e] = lo.x + Q[o + e * 3] * step.x;
      Y[e] = lo.y + Q[o + e * 3 + 1] * step.y;
      Z[e] = lo.z + Q[o + e * 3 + 2] * step.z;
    }
    P.length = 0;
    for (let e = 0; e < 3; e++) {
      const f1 = (e + 1) % 3;
      const za = Z[e] - z, zb = Z[f1] - z;
      if ((za < 0) === (zb < 0)) continue;
      const f = za / (za - zb);
      P.push(X[e] + (X[f1] - X[e]) * f, Y[e] + (Y[f1] - Y[e]) * f);
    }
    if (P.length >= 4) segs.push([P[0], P[1], P[2], P[3], K[t]]);
  }
  return segs;
}

/**
 * How wide she is at each height of a section: for each step of `dy` metres
 * from her keel up, the least and greatest x of her (not her weapons) there.
 * NaN where there is nothing of her at that height.
 */
export function extents(segs, dy = 0.25) {
  let y0 = Infinity, y1 = -Infinity;
  for (const s of segs) {
    if (s[4]) continue;
    y0 = Math.min(y0, s[1], s[3]);
    y1 = Math.max(y1, s[1], s[3]);
  }
  if (!Number.isFinite(y0)) return null;
  const n = Math.max(1, Math.ceil((y1 - y0) / dy) + 1);
  const lo = new Float32Array(n).fill(NaN);
  const hi = new Float32Array(n).fill(NaN);
  for (const s of segs) {
    if (s[4]) continue;
    const ya = Math.min(s[1], s[3]), yb = Math.max(s[1], s[3]);
    for (let i = Math.max(0, Math.floor((ya - y0) / dy)); i <= Math.min(n - 1, Math.ceil((yb - y0) / dy)); i++) {
      const y = y0 + i * dy;
      let x;
      if (yb - ya < 1e-4) x = null;
      else {
        if (y < ya || y > yb) continue;
        const f = (y - s[1]) / (s[3] - s[1]);
        x = s[0] + (s[2] - s[0]) * f;
      }
      const xs = x === null ? [s[0], s[2]] : [x];
      for (const v of xs) {
        if (!(lo[i] <= v)) lo[i] = Number.isNaN(lo[i]) ? v : Math.min(lo[i], v);
        if (!(hi[i] >= v)) hi[i] = Number.isNaN(hi[i]) ? v : Math.max(hi[i], v);
      }
    }
  }
  return { y0, y1, dy, lo, hi };
}

/** Her half-breadth at a height, off a set of extents: the wider of her two sides. */
export function halfAt(ext, y) {
  if (!ext) return NaN;
  const i = Math.round((y - ext.y0) / ext.dy);
  if (i < 0 || i >= ext.lo.length) return NaN;
  return Math.max(Math.abs(ext.lo[i]), Math.abs(ext.hi[i]));
}
