// HMS Rodney's hull, tower, funnel and masts: the owner's reference sculpt of
// her, in her 1942 Admiralty disruptive scheme, and her three 16-inch turrets
// and her 6-inch twin as the owner's sculpts drew them.
//
// build/rodney-source.mjs takes the sculpt and its texture and gives every
// triangle of her one of the six paints she wore -- the texture's baked
// shadows, smears and stains taken out, and every camouflage edge drawn where
// it is -- and decimates her with those edges kept. build/prepare-rodney-hull.mjs
// then cuts every gun the sculpt had cast into her out down to the deck or
// barbette it stood on and closes the holes, presses the lumps off her decks,
// takes the dents out of her without rounding her corners, fairs her topsides
// and splits her normals at every crease and every paint edge. Her turrets come
// out of the same cut, painted as she is, with their barrels turned true along
// the sculpt's own; her 6-inch twin is the owner's sculpt of it, turned to face
// ahead and cut off square at its foot.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate -- courses, butts, weld seams and rivets,
// with the highlight painted steel has -- and her decks in teak planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  RODNEY_HULL_B64, RODNEY_SURFACE, RODNEY_TURRETS, RODNEY_SECONDARY, RODNEY_LINES,
} from './rodneyHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(RODNEY_HULL_B64);
  return cached;
}

const surface = surfaceOf(RODNEY_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const rodneySurfaceY = surface.surfaceY;

/**
 * Where a mounting stands, at (x, z): the median of her surface over a small
 * disc round the pivot, so a bollard or the lip of a patch beside it does not
 * lift the whole mounting off the deck it is actually on.
 */
export const rodneySeatY = surface.seatY;

/** Her turrets as the sculpt drew them: see prepare-rodney-hull.mjs. */
export const TURRET_PIECES = RODNEY_TURRETS;

/** Her 6-inch twin, off the owner's sculpt of it. */
export const SECONDARY_PIECE = RODNEY_SECONDARY;

/**
 * Her lines, as the sculpt has them: her keel, the deck over her insides and
 * her half-breadth at every half metre of height, a metre at a time along her.
 * What her interior and her armour are fitted under.
 */
export const SCULPT_LINES = RODNEY_LINES;

// Her surfaces. Phong rather than Lambert, for the reason every other ship is
// dressed in it (see textures.js): painted steel has a broad highlight and a
// deck almost none, and that is most of what tells a painted ship from a
// painted shape. Each has a map, which is also what keeps dressShip from
// replacing it and throwing her paint away.
let mats = null;
export function rodneyMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const teak = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: teak, specularMap: teak,
      specular: 0x1a1814, shininess: 4,
    }),
  };
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildRodneyHull(g) {
  const m = rodneyMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const pieces = new Map();
/**
 * Turret `i`'s gunhouse and barrels, decoded once: each in the frame of its
 * own mounting -- the gunhouse's origin on the pivot at the barbette it trains
 * on, the barrels' on their trunnions with the bore along +Z.
 */
export function turretPieces(i) {
  if (!pieces.has(i)) {
    const t = RODNEY_TURRETS[i];
    pieces.set(i, { house: decodePiece(t.house), guns: decodePiece(t.guns) });
  }
  return pieces.get(i);
}

let secondary = null;
/** Her 6-inch twin's gunhouse and barrels, decoded once, shared by all six. */
export function secondaryPieces() {
  if (!secondary) {
    secondary = { house: decodePiece(RODNEY_SECONDARY.house), guns: decodePiece(RODNEY_SECONDARY.guns) };
  }
  return secondary;
}
