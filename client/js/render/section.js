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

/** Whether a piece of her is a weapon, by the mountings her view keeps. */
function weaponSet(view) {
  const out = new Set();
  for (const list of [view.turrets, view.secMounts, view.aaMounts, view.torpMounts]) {
    for (const m of list || []) if (m) out.add(m);
  }
  return out;
}

/**
 * Her triangles in her own frame, bucketed by station. Built the first time a
 * class is asked for and kept: her lines do not change.
 */
export function soupOf(view) {
  const key = view.classId || view.cls?.id;
  if (SOUPS.has(key)) return SOUPS.get(key);
  const g = view.group;
  if (!g) return null;
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const weapons = weaponSet(view);
  const tris = [];   // x0 y0 z0 x1 y1 z1 x2 y2 z2 kind
  const m = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const kindOf = (o) => {
    for (let p = o; p && p !== g; p = p.parent) if (weapons.has(p)) return 1;
    return 0;
  };
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (o.material && (o.material.isShaderMaterial || o.material.transparent)) return;
    // Nothing that is not her: lamps' beams, anything flagged as an effect.
    for (let p = o; p && p !== g; p = p.parent) if (p.userData && p.userData.lamp !== undefined) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const kind = kindOf(o);
    const n = idx ? idx.count : pos.count;
    const count = o.isInstancedMesh ? o.count : 1;
    for (let inst = 0; inst < count; inst++) {
      m.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(inst, im); m.multiply(im); }
      for (let i = 0; i + 2 < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        b.fromBufferAttribute(pos, i1).applyMatrix4(m);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, kind);
      }
    }
  });
  const T = new Float32Array(tris);
  const nt = T.length / 10;
  let zmin = Infinity, zmax = -Infinity;
  for (let t = 0; t < nt; t++) {
    const o = t * 10;
    zmin = Math.min(zmin, T[o + 2], T[o + 5], T[o + 8]);
    zmax = Math.max(zmax, T[o + 2], T[o + 5], T[o + 8]);
  }
  const nb = Math.max(1, Math.ceil((zmax - zmin) / BUCKET) + 1);
  const buckets = Array.from({ length: nb }, () => []);
  for (let t = 0; t < nt; t++) {
    const o = t * 10;
    const lo = Math.min(T[o + 2], T[o + 5], T[o + 8]);
    const hi = Math.max(T[o + 2], T[o + 5], T[o + 8]);
    for (let k = Math.floor((lo - zmin) / BUCKET); k <= Math.floor((hi - zmin) / BUCKET); k++) buckets[k].push(t);
  }
  const soup = { T, zmin, buckets };
  SOUPS.set(key, soup);
  return soup;
}

/**
 * Her section at station z: segments [x0, y0, x1, y1, kind], kind 0 for her
 * and 1 for a weapon.
 */
export function sectionAt(view, z) {
  const soup = soupOf(view);
  if (!soup) return null;
  const { T, zmin, buckets } = soup;
  const k = Math.floor((z - zmin) / BUCKET);
  const list = buckets[k] || [];
  const segs = [];
  const P = [];
  for (const t of list) {
    const o = t * 10;
    P.length = 0;
    for (let e = 0; e < 3; e++) {
      const i = o + e * 3, j = o + ((e + 1) % 3) * 3;
      const za = T[i + 2] - z, zb = T[j + 2] - z;
      if ((za < 0) === (zb < 0)) continue;
      const f = za / (za - zb);
      P.push(T[i] + (T[j] - T[i]) * f, T[i + 1] + (T[j + 1] - T[i + 1]) * f);
    }
    if (P.length >= 4) segs.push([P[0], P[1], P[2], P[3], T[o + 9]]);
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
