// The Graf Spee's hull, superstructure, tower, funnel and turrets, replaced
// wholesale by a reference sculpt at the owner's request in place of the
// lofted procedural version every other ship in this game still uses.
//
// What this is and is not.
//
// The source was a single 521,000-triangle mesh with no UV map, no textures,
// and -- this is the part that matters -- no seam anywhere between the hull,
// the turrets and the guns: they are one welded solid. There is no way to
// cut the turrets free and rig them to train and elevate without hand-
// remodelling that boundary, which is most of the job the procedural model
// already did. So this hull is drawn once, painted, and left still: her main
// battery, secondaries, AA and torpedo tubes are logical mounts only (see
// `ghostMounts` in spee.js) that carry the real position, arc and muzzle
// reach the simulation needs to aim and fire correctly, with nothing visible
// riding on them -- there is no barrel to point the wrong way, because there
// is no separate barrel at all any more. The catapult, crane, boats, mast and
// deck fittings that were not part of the sculpt are still the working
// procedural pieces, laid on top of it exactly as before.
//
// The mesh itself was decimated (531k -> 31k triangles, matching the budget
// the rest of the fleet renders at), calibrated into this game's frame from
// two measured points -- her keel and her masthead against the real ship's
// -- and painted by height and by how much a vertex's normal faces the sky,
// which is the only information a vertex-colour pass has to go on with no UV
// map: grey topsides, black boot topping, red antifouling below it, tan
// where a face reads as a deck. It will not show a scuttle or a rivet the way
// the lofted hull did; it shows the shape the sculpt was actually given.
//
// Packed as sixteen length-wise slices rather than one mesh spanning the
// whole ship, so the fleet's own symmetry, hole and floating-part checks --
// all of which reason about one part at a time -- see something shaped like
// what every other builder in this file already hands them.
import * as THREE from '../../../vendor/three.module.js';
import { SPEE_HULL_B64 } from './speeHull.data.js';

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

// Decoded once at module load, like every other piece of geometry data in
// this renderer: every call to `buildSpeeHull` clones the same source
// attributes into a fresh mesh rather than re-decoding the base64.
let cached = null;
function slices() {
  if (!cached) cached = decodeSlices();
  return cached;
}

// A 1x1 white pixel, not a real surface -- its only job is to give this
// material a `map`, which is what keeps dressShip() from replacing it
// outright when it dresses the rest of the ship (it skips anything that
// already has one). Actually pointing it at the fleet's own plating texture
// made the hull render far darker than the vertex paint alone does, for
// reasons that want more time than this pass has; the flat vertex colour is
// correct and shipped rather than held for it.
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

/** Add the sculpted hull, painted, as its sixteen slice-meshes. */
export function buildSpeeHull(g) {
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, HULL_MAT));
  }
}
