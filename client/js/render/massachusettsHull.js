// USS Massachusetts's hull, superstructure, funnel and masts: the owner's
// sculpt of her, painted in Measure 22, and her three 16-inch turrets as the
// sculpt drew them. Her twin 5-inch is the owner's sculpt of the mount the
// Baltimore carries, and she is built with the Baltimore's prepared one.
//
// The sculpt came bare, so build/massachusetts-source.mjs paints her -- red
// lead, boot topping, navy blue up to the level of the lowest point of her
// main deck edge, haze grey over it -- with every paint line cut straight into
// her, and decimates her with those lines kept. build/prepare-massachusetts-hull.mjs
// then cuts every gun the sculpt had cast into her out down to the deck or
// barbette it stood on and closes the holes, sands the lumps off her decks,
// takes the dents out of her without rounding her corners, paints her decks
// deck blue, fairs her topsides and splits her normals at every crease and
// every paint edge. Her turrets come out of the same cut, painted as she is,
// with their barrels turned true along the sculpt's own.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate -- courses, butts, weld seams and rivets,
// with the highlight painted steel has -- and her decks in planking stained
// deck blue, as the Baltimore's are, both over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  MASSACHUSETTS_HULL_B64, MASSACHUSETTS_SURFACE, MASSACHUSETTS_TURRETS, MASSACHUSETTS_SECONDARY,
  MASSACHUSETTS_LINES,
} from './massachusettsHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(MASSACHUSETTS_HULL_B64);
  return cached;
}

const surface = surfaceOf(MASSACHUSETTS_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const massachusettsSurfaceY = surface.surfaceY;

/**
 * Where a mounting stands, at (x, z): the median of her surface over a small
 * disc round the pivot, so a bollard or the lip of a patch beside it does not
 * lift the whole mounting off the deck it is actually on.
 */
export const massachusettsSeatY = surface.seatY;

/** Her turrets as the sculpt drew them: see prepare-massachusetts-hull.mjs. */
export const TURRET_PIECES = MASSACHUSETTS_TURRETS;

/** Where each of her 5-inch stands: see prepare-massachusetts-hull.mjs. */
export const SECONDARY_SEATS = MASSACHUSETTS_SECONDARY.seats;

/**
 * Her lines, as the sculpt has them: her keel, the deck over her insides and
 * her half-breadth at every half metre of height, a metre at a time along her.
 * What her interior and her armour are fitted under.
 */
export const SCULPT_LINES = MASSACHUSETTS_LINES;

// Her surfaces. Phong rather than Lambert, for the reason every other ship is
// dressed in it (see textures.js): painted steel has a broad highlight and a
// deck almost none, and that is most of what tells a painted ship from a
// painted shape. Each has a map, which is also what keeps dressShip from
// replacing it and throwing her paint away.
let mats = null;
export function massachusettsMaterials() {
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
export function buildMassachusettsHull(g) {
  const m = massachusettsMaterials();
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
    const t = MASSACHUSETTS_TURRETS[i];
    pieces.set(i, { house: decodePiece(t.house), guns: decodePiece(t.guns) });
  }
  return pieces.get(i);
}
