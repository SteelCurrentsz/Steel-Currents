// The Graf Spee's hull, superstructure, tower and funnel: a reference sculpt,
// at the owner's request, in place of the lofted procedural version every
// other ship in this game still uses.
//
// The source was a single 521,000-triangle mesh with no UV map and no seam
// anywhere between the hull and her guns: turrets, shields, flak and tube
// banks were lumps welded into her deck. build/prepare-spee-hull.mjs cuts
// every one of them out down to the deck it stood on and closes the hole, so
// her armament is the real, rigged mountings spee.js stands in those places --
// they train, elevate and fire.
//
// The mesh was decimated (521k -> 31k triangles, the budget the rest of the
// fleet renders at), turned into this game's frame -- bow to +Z, a rotation and
// not a reflection -- scaled to her length and fitted to her keel, her
// topsides faired of the dents decimation left in them, her normals split at
// every crease, and painted by height and by how much a vertex's normal faces
// the sky, which is all a vertex-colour pass has to go on with no UV map: grey
// topsides, black boot topping, red antifouling, tan where a face reads as a
// deck.
//
// Packed as length-wise slices rather than one mesh spanning the whole ship,
// so the fleet's own symmetry, hole and floating-part checks -- all of which
// reason about one part at a time -- see something shaped like what every
// other builder hands them. Her surface height comes with it, so a fitting is
// seated on her own deck: speeSeatY.
import * as THREE from '../../../vendor/three.module.js';
import { SPEE_HULL_B64, SPEE_SURFACE } from './speeHull.data.js';

/** Decode the packed blob into one BufferGeometry per length-wise slice. */
function decodeSlices() {
  const bin = atob(SPEE_HULL_B64);
  const dv = new DataView(new ArrayBuffer(bin.length));
  const bytes = new Uint8Array(dv.buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  let p = 0;
  const nBuckets = dv.getUint32(p, true); p += 4;
  const geoms = [];
  for (let i = 0; i < nBuckets; i++) {
    const nv = dv.getUint32(p, true); p += 4;
    const nt = dv.getUint32(p, true); p += 4;

    const pos = new Float32Array(nv * 3);
    for (let k = 0; k < nv * 3; k++, p += 4) pos[k] = dv.getFloat32(p, true);
    const nrm = new Float32Array(nv * 3);
    for (let k = 0; k < nv * 3; k++, p += 4) nrm[k] = dv.getFloat32(p, true);
    const col = new Uint8Array(nv * 3);
    for (let k = 0; k < nv * 3; k++, p += 1) col[k] = dv.getUint8(p);
    const uv = new Float32Array(nv * 2);
    for (let k = 0; k < nv * 2; k++, p += 4) uv[k] = dv.getFloat32(p, true);
    const idx = new Uint16Array(nt * 3);
    for (let k = 0; k < nt * 3; k++, p += 2) idx[k] = dv.getUint16(p, true);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    geoms.push(g);
  }
  return geoms;
}

// Decoded once, on first use. Every call to `buildSpeeHull` hands out the same
// geometry; mergeStatic copies out of it into buffers of the ship's own, which
// are the ones anything later (plating, scorch) writes into.
let cached = null;
function slices() {
  if (!cached) cached = decodeSlices();
  return cached;
}

// A 1x1 white pixel, not a real surface -- its only job is to give this
// material a `map`, which is what keeps dressShip() from replacing it
// outright when it dresses the rest of the ship (it skips anything that
// already has one) and throwing her paint away with it.
let dummyMap = null;
function whitePixel() {
  if (dummyMap) return dummyMap;
  if (typeof document === 'undefined') return null;   // no DOM under Node
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1, 1);
  dummyMap = new THREE.CanvasTexture(c);
  return dummyMap;
}

const HULL_MAT = new THREE.MeshLambertMaterial({
  vertexColors: true,
  map: whitePixel(),
});

// Her surface: the highest point of the sculpt every half metre, after her
// guns were cut out of it (see build/prepare-spee-hull.mjs). What a fitting is
// stood on. Decoded on first use.
let surface = null;
function surfaceGrid() {
  if (surface) return surface;
  const bin = atob(SPEE_SURFACE.b64);
  const dv = new DataView(new ArrayBuffer(bin.length));
  const bytes = new Uint8Array(dv.buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const h = new Float32Array(SPEE_SURFACE.nx * SPEE_SURFACE.nz);
  for (let i = 0; i < h.length; i++) h[i] = dv.getInt16(i * 2, true) / 100;
  surface = h;
  return h;
}

/** Height of her surface at (x, z), or -99 off her. */
export function speeSurfaceY(x, z) {
  const { x0, z0, step, nx, nz } = SPEE_SURFACE;
  const i = Math.round((x - x0) / step);
  const j = Math.round((z - z0) / step);
  if (i < 0 || j < 0 || i >= nx || j >= nz) return -99;
  return surfaceGrid()[j * nx + i];
}

/**
 * Where a mounting stands, at (x, z): the median of her surface over a small
 * disc round the pivot, so a bollard or the lip of a patch beside it does not
 * lift the whole mounting off the deck it is actually on.
 */
export function speeSeatY(x, z, r = 0.8) {
  const { step } = SPEE_SURFACE;
  const hs = [];
  for (let dz = -r; dz <= r + 1e-6; dz += step) {
    for (let dx = -r; dx <= r + 1e-6; dx += step) {
      if (dx * dx + dz * dz > r * r + 1e-6) continue;
      const y = speeSurfaceY(x + dx, z + dz);
      if (y > -50) hs.push(y);
    }
  }
  if (!hs.length) return -99;
  hs.sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)];
}

/** Add the sculpted hull, painted, as its length-wise slice meshes. */
export function buildSpeeHull(g) {
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, HULL_MAT));
  }
}
