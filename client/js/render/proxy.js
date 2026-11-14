// A ship seen from a long way off, drawn cheaply.
//
// A carrier off the model is three hundred meshes and eight hundred thousand
// triangles, nearly all of it guns, rails, boats and fittings that are a pixel
// or less at a mile. The title screen's battle puts four of them and half a
// dozen destroyers on the sea at once, and draws them whether the camera is
// alongside or twenty miles off. This bakes a ship as she was built into one
// buffer per material, leaving out everything too small to be seen at the
// range it is drawn at, and the scene swaps it in for her whenever the camera
// is far enough away for nobody to tell.
//
// The stand-in is fixed: her turrets and mountings are welded where they were
// trained when she was built. Geometry is shared between every stand-in of a
// class, so a second carrier of the same class costs draw calls and nothing
// else.

import * as THREE from '../../../vendor/three.module.js';

const CACHE = new Map();
const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _b = new THREE.Box3();

/**
 * Bake `group` (a ship as buildShip returned her, not yet moved) into a few
 * meshes. Pieces whose bounding box is smaller than `minSize` metres across
 * are left out; so are cut-out cards (railings and wires) and anything
 * already hidden. `key` caches the result by class.
 */
export function standIn(group, { minSize = 2.5, cell = 0, key = null } = {}) {
  let geos = key ? CACHE.get(key) : null;
  if (!geos) {
    geos = bake(group, minSize, cell);
    if (key) CACHE.set(key, geos);
  }
  const out = new THREE.Group();
  out.name = 'standIn';
  for (const { geo, mat } of geos) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

function bake(group, minSize, cell) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.name === 'cards') return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    if (!pos) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _b.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    const size = _b.getSize(_v);
    if (Math.max(size.x, size.y, size.z) < minSize) return;
    _m.multiplyMatrices(inv, o.matrixWorld);
    _n.getNormalMatrix(_m);
    const mats = [].concat(o.material);
    const index = g.index ? g.index.array : null;
    const count = index ? index.length : pos.count;
    const ranges = Array.isArray(o.material) && g.groups.length
      ? g.groups.map((gr) => ({ start: gr.start, end: Math.min(count, gr.start + gr.count), mat: mats[gr.materialIndex] }))
      : [{ start: 0, end: count, mat: mats[0] }];
    const hasN = !!g.attributes.normal;
    const hasUV = !!g.attributes.uv;
    const hasC = !!g.attributes.color;
    for (const r of ranges) {
      if (!r.mat || r.mat.visible === false) continue;
      const k = `${r.mat.uuid}|${hasN}|${hasUV}|${hasC}`;
      let b = buckets.get(k);
      if (!b) { b = { mat: r.mat, pos: [], nor: [], uv: [], col: [], idx: [], n: 0, hasN, hasUV, hasC }; buckets.set(k, b); }
      // Only the vertices this range uses, renumbered -- and, with a `cell`,
      // every vertex in the same cell of a grid that many metres on a side
      // made one, which is what takes the detail out: a triangle smaller
      // than a cell collapses and is dropped.
      const remap = new Map();
      if (cell && !b.cells) b.cells = new Map();
      const tri = [];
      for (let i = r.start; i < r.end; i++) {
        const vi = index ? index[i] : i;
        let ni = remap.get(vi);
        if (ni === undefined && cell) {
          _v.fromBufferAttribute(pos, vi).applyMatrix4(_m);
          const ck = `${Math.round(_v.x / cell)},${Math.round(_v.y / cell)},${Math.round(_v.z / cell)}`;
          ni = b.cells.get(ck);
          if (ni !== undefined) remap.set(vi, ni);
        }
        if (ni === undefined) {
          ni = b.n++;
          remap.set(vi, ni);
          _v.fromBufferAttribute(pos, vi).applyMatrix4(_m);
          if (cell) b.cells.set(`${Math.round(_v.x / cell)},${Math.round(_v.y / cell)},${Math.round(_v.z / cell)}`, ni);
          b.pos.push(_v.x, _v.y, _v.z);
          if (hasN) { _v.fromBufferAttribute(g.attributes.normal, vi).applyMatrix3(_n).normalize(); b.nor.push(_v.x, _v.y, _v.z); }
          if (hasUV) b.uv.push(g.attributes.uv.getX(vi), g.attributes.uv.getY(vi));
          if (hasC) { const c = g.attributes.color; b.col.push(c.getX(vi), c.getY(vi), c.getZ(vi)); }
        }
        tri.push(ni);
        if (tri.length === 3) {
          if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) b.idx.push(tri[0], tri[1], tri[2]);
          tri.length = 0;
        }
      }
    }
  });
  const out = [];
  for (const b of buckets.values()) {
    if (!b.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.hasN) geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    else geo.computeVertexNormals();
    if (b.hasUV) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    if (b.hasC) geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    geo.computeBoundingSphere();
    out.push({ geo, mat: b.mat });
  }
  return out;
}
