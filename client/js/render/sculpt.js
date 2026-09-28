// What a ship drawn from a reference sculpt ships with, decoded.
//
// build/sculpt.mjs packs a sculpted hull into a base64 blob of length-wise
// slices -- positions, normals, painted vertex colours and a crude UV each --
// and her surface into a height map. This is the other end of that: the blob
// back into one BufferGeometry a slice, the height map into what a fitting is
// seated on, and the one material every slice is drawn with. See speeHull.js
// and takaoHull.js.
import * as THREE from '../../../vendor/three.module.js';

/** The bytes of a base64 string, as a DataView. */
function viewOf(b64) {
  const bin = atob(b64);
  const dv = new DataView(new ArrayBuffer(bin.length));
  const bytes = new Uint8Array(dv.buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dv;
}

/**
 * Decode a packed blob into one BufferGeometry per slice.
 *
 * A blob whose slice count has its high bit set carries a word more at the
 * head of each slice: which surface it is -- 0 her plating, 1 her decks --
 * put on the geometry as `userData.surface`, so each can be drawn as what it
 * is.
 */
export function decodeSlices(b64) {
  const dv = viewOf(b64);
  let p = 0;
  const head = dv.getUint32(p, true); p += 4;
  const surfaced = (head & 0x80000000) !== 0;
  const nBuckets = head & 0x7fffffff;
  const geoms = [];
  for (let i = 0; i < nBuckets; i++) {
    const nv = dv.getUint32(p, true); p += 4;
    const nt = dv.getUint32(p, true); p += 4;
    let surface = 0;
    if (surfaced) { surface = dv.getUint32(p, true); p += 4; }

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
    g.userData.surface = surface;
    geoms.push(g);
  }
  return geoms;
}

/**
 * Decode one packed piece -- a gunhouse, a pair of barrels -- into a
 * BufferGeometry: u32 vertex count, u32 triangle count, then Float32
 * positions and normals and Uint16 indices.
 */
export function decodePiece(b64) {
  const dv = viewOf(b64);
  let p = 0;
  const nv = dv.getUint32(p, true); p += 4;
  const nt = dv.getUint32(p, true); p += 4;
  const pos = new Float32Array(nv * 3);
  for (let k = 0; k < nv * 3; k++, p += 4) pos[k] = dv.getFloat32(p, true);
  const nrm = new Float32Array(nv * 3);
  for (let k = 0; k < nv * 3; k++, p += 4) nrm[k] = dv.getFloat32(p, true);
  const idx = new Uint16Array(nt * 3);
  for (let k = 0; k < nt * 3; k++, p += 2) idx[k] = dv.getUint16(p, true);
  // UVs in metres, box-projected off whichever way each point faces, as the
  // fleet's welded models have: so the plating texture lies on a gunhouse at
  // the scale it lies on everything else.
  const uv = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    const ax = Math.abs(nrm[i * 3]), ay = Math.abs(nrm[i * 3 + 1]), az = Math.abs(nrm[i * 3 + 2]);
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
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
