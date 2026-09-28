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
import { decodeSlices, sculptMaterial, surfaceOf } from './sculpt.js';

// Decoded once, on first use. Every call to `buildSpeeHull` hands out the same
// geometry; mergeStatic copies out of it into buffers of the ship's own, which
// are the ones anything later (plating, scorch) writes into.
let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(SPEE_HULL_B64);
  return cached;
}

// Her surface: the highest point of the sculpt every half metre, after her
// guns were cut out of it (see build/prepare-spee-hull.mjs). What a fitting is
// stood on.
const surface = surfaceOf(SPEE_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const speeSurfaceY = surface.surfaceY;

/**
 * Where a mounting stands, at (x, z): the median of her surface over a small
 * disc round the pivot, so a bollard or the lip of a patch beside it does not
 * lift the whole mounting off the deck it is actually on.
 */
export const speeSeatY = surface.seatY;

/** Add the sculpted hull, painted, as its length-wise slice meshes. */
export function buildSpeeHull(g) {
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, sculptMaterial()));
  }
}
