// The Takao's hull, superstructure, bridge, funnels and masts: the owner's
// reference sculpt, in place of the lofted model this ship used to be built
// from, and her five turrets as that sculpt drew them.
//
// build/prepare-takao-hull.mjs takes the sculpt, strips it of its rigging
// (build/strip-takao-rigging.mjs), cuts every gun it had cast into her out
// down to the deck or barbette the gun stood on, closes the holes, cuts the
// openings in her side her tubes fire through, presses the lumps off her
// decks, takes the dents out of her without rounding her corners, fairs her
// topsides and paints her. Her turrets come out of the same cut: each gunhouse
// exactly the piece of her its box took, and its barrels turned true along
// the sculpt's own barrels, so the turrets train and elevate as the guns she
// was drawn with.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in linoleum held down
// with brass strips, both over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  TAKAO_HULL_B64, TAKAO_SURFACE, TAKAO_TURRETS, TAKAO_OPENINGS, TAKAO_LINES,
} from './takaoHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, linoleumMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(TAKAO_HULL_B64);
  return cached;
}

const surface = surfaceOf(TAKAO_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const takaoSurfaceY = surface.surfaceY;

/**
 * Where a mounting stands, at (x, z): the median of her surface over a small
 * disc round the pivot, so a bollard or the lip of a patch beside it does not
 * lift the whole mounting off the deck it is actually on.
 */
export const takaoSeatY = surface.seatY;

/** Her turrets as the sculpt drew them: see prepare-takao-hull.mjs. */
export const TURRET_PIECES = TAKAO_TURRETS;

/** The openings in her side her tubes fire through. */
export const OPENINGS = TAKAO_OPENINGS;

/**
 * Her lines, as the sculpt has them: her keel and the deck over her insides,
 * a metre at a time along her. What her interior is fitted under.
 */
export const SCULPT_LINES = TAKAO_LINES;

// Her two surfaces. Phong rather than Lambert, for the same reason every
// other ship is dressed in it (see textures.js): painted steel has a broad
// weak highlight and a deck almost none, and that is most of what tells a
// grey ship from a grey shape. Each has a map, which is also what keeps
// dressShip from replacing it and throwing her paint away.
let mats = null;
function materials() {
  if (mats) return mats;
  const plate = steelMap();
  const lino = linoleumMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x2f3439, shininess: 26,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: lino,
      specular: 0x1c1a16, shininess: 6,
    }),
  };
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildTakaoHull(g) {
  const m = materials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const pieces = new Map();
/**
 * Turret `i`'s gunhouse and barrels, decoded once: each in the frame of its
 * own mounting -- the gunhouse's origin on the pivot at the deck it trains on,
 * the barrels' on their trunnions with the bore along +Z.
 */
export function turretPieces(i) {
  if (!pieces.has(i)) {
    const t = TAKAO_TURRETS[i];
    pieces.set(i, { house: decodePiece(t.house), guns: decodePiece(t.guns) });
  }
  return pieces.get(i);
}
