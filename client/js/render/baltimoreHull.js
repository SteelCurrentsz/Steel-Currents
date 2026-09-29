// USS Baltimore's hull, superstructure, funnels and masts: the owner's sculpt
// of her, painted in Measure 22, and her three 8-inch turrets as the sculpt
// drew them and her twin 5-inch as the owner's sculpt of it draws it.
//
// The sculpt came bare, so build/baltimore-source.mjs paints her -- red lead,
// boot topping, navy blue up to the level of the lowest point of her main
// deck edge, haze grey over it -- with every paint line cut straight into her,
// and decimates her with those lines kept. build/prepare-baltimore-hull.mjs
// then cuts every gun the sculpt had cast into her out down to the deck or
// barbette it stood on and closes the holes, sands the lumps off her decks,
// takes the dents out of her without rounding her corners, paints her decks
// deck blue, fairs her topsides and splits her normals at every crease and
// every paint edge. Her turrets come out of the same cut, painted as she is,
// with their barrels turned true along the sculpt's own; her 5-inch is the
// owner's sculpt of it with the square base it stood on taken off.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate -- courses, butts, weld seams and rivets,
// with the highlight painted steel has -- and her decks in planking stained
// deck blue, as the Cleveland's are, both over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  BALTIMORE_HULL_B64, BALTIMORE_SURFACE, BALTIMORE_TURRETS, BALTIMORE_SECONDARY, BALTIMORE_LINES,
} from './baltimoreHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(BALTIMORE_HULL_B64);
  return cached;
}

const surface = surfaceOf(BALTIMORE_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const baltimoreSurfaceY = surface.surfaceY;

/**
 * Where a mounting stands, at (x, z): the median of her surface over a small
 * disc round the pivot, so a bollard or the lip of a patch beside it does not
 * lift the whole mounting off the deck it is actually on.
 */
export const baltimoreSeatY = surface.seatY;

/** Her turrets as the sculpt drew them: see prepare-baltimore-hull.mjs. */
export const TURRET_PIECES = BALTIMORE_TURRETS;

/** Her twin 5-inch, off the owner's sculpt of it. */
export const SECONDARY_PIECE = BALTIMORE_SECONDARY;

/**
 * Her lines, as the sculpt has them: her keel, the deck over her insides and
 * her half-breadth at every half metre of height, a metre at a time along her.
 * What her interior and her armour are fitted under.
 */
export const SCULPT_LINES = BALTIMORE_LINES;

// Her surfaces. Phong rather than Lambert, for the reason every other ship is
// dressed in it (see textures.js): painted steel has a broad highlight and a
// deck almost none, and that is most of what tells a painted ship from a
// painted shape. Each has a map, which is also what keeps dressShip from
// replacing it and throwing her paint away.
let mats = null;
export function baltimoreMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks,
      specular: 0x16181c, shininess: 5,
    }),
  };
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildBaltimoreHull(g) {
  const m = baltimoreMaterials();
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
    const t = BALTIMORE_TURRETS[i];
    pieces.set(i, { house: decodePiece(t.house), guns: decodePiece(t.guns) });
  }
  return pieces.get(i);
}

let secondary = null;
/** Her twin 5-inch's gunhouse and barrels, decoded once, shared by all six. */
export function secondaryPieces() {
  if (!secondary) {
    secondary = { house: decodePiece(BALTIMORE_SECONDARY.house), guns: decodePiece(BALTIMORE_SECONDARY.guns) };
  }
  return secondary;
}
