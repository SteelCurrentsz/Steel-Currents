// What a ship drawn from a reference sculpt ships with, decoded.
//
// build/sculpt.mjs packs a sculpted hull into a base64 blob of length-wise
// slices -- positions, normals, painted vertex colours and a crude UV each --
// and her surface into a height map. This is the other end of that: the blob
// back into one BufferGeometry a slice, the height map into what a fitting is
// seated on, and the one material every slice is drawn with. See speeHull.js
// and takaoHull.js.
import * as THREE from '../../../vendor/three.module.js';

/** Decode a packed blob into one BufferGeometry per slice. */
export function decodeSlices(b64) {
  const bin = atob(b64);
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

// A 1x1 white pixel, not a real surface -- its only job is to give a sculpt's
// material a `map`, which is what keeps dressShip() from replacing it outright
// when it dresses the rest of the ship (it skips anything that already has
// one) and throwing her paint away with it.
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

let material = null;
/** The one material a sculpt is drawn with: her painted vertex colours. */
export function sculptMaterial() {
  if (!material) {
    material = new THREE.MeshLambertMaterial({ vertexColors: true, map: whitePixel() });
  }
  return material;
}

/**
 * Her surface: the highest point of the sculpt every grid step, after
 * whatever was cut out of it. `SURFACE` is `{ x0, z0, step, nx, nz, b64 }`,
 * centimetres as Int16. Returns `surfaceY(x, z)`, -99 off her, and
 * `seatY(x, z, r)`: where a mounting stands, the median of her surface over a
 * small disc round its pivot, so a bollard or the lip of a patch beside it
 * does not lift the whole mounting off the deck it is actually on.
 */
export function surfaceOf(SURFACE) {
  let grid = null;
  const heights = () => {
    if (grid) return grid;
    const bin = atob(SURFACE.b64);
    const dv = new DataView(new ArrayBuffer(bin.length));
    const bytes = new Uint8Array(dv.buffer);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const h = new Float32Array(SURFACE.nx * SURFACE.nz);
    for (let i = 0; i < h.length; i++) h[i] = dv.getInt16(i * 2, true) / 100;
    grid = h;
    return h;
  };
  const surfaceY = (x, z) => {
    const { x0, z0, step, nx, nz } = SURFACE;
    const i = Math.round((x - x0) / step);
    const j = Math.round((z - z0) / step);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return -99;
    return heights()[j * nx + i];
  };
  const seatY = (x, z, r = 0.8) => {
    const { step } = SURFACE;
    const hs = [];
    for (let dz = -r; dz <= r + 1e-6; dz += step) {
      for (let dx = -r; dx <= r + 1e-6; dx += step) {
        if (dx * dx + dz * dz > r * r + 1e-6) continue;
        const y = surfaceY(x + dx, z + dz);
        if (y > -50) hs.push(y);
      }
    }
    if (!hs.length) return -99;
    hs.sort((a, b) => a - b);
    return hs[Math.floor(hs.length / 2)];
  };
  return { surfaceY, seatY };
}
