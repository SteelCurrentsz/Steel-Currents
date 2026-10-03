// IJN Musashi's hull, superstructure, bridge, funnel and masts: the owner's
// sculpts of her, painted as she was at Kure, and her three 46 cm turrets as
// the sculpt drew them. Her 15.5 cm triple, her 12.7 cm twin and her 25 mm
// triple in its shield are the owner's sculpts of each.
//
// The sculpt of the whole of her came bare, so build/musashi-source.mjs paints
// her -- red lead, boot topping, Kure grey -- with every paint line cut
// straight into her, and decimates her with those lines kept. Its
// superstructure melted, so build/prepare-musashi-hull.mjs takes it off her
// and stands in its place her superstructure as the sculpt of that drew it,
// and in the middle of that her bridge tower as the sculpt of that drew it;
// cuts every gun the sculpts had cast into her out down to the deck or
// barbette it stood on and closes the holes; takes the dents out of her
// without rounding her corners, lays her teak, fairs her topsides and splits
// her normals at every crease and every paint edge. Her turrets come out of
// the same cut, with their barrels turned true along the sculpt's own.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  MUSASHI_HULL_B64, MUSASHI_SURFACE, MUSASHI_TURRETS, MUSASHI_GUNS, MUSASHI_MOUNTS, MUSASHI_LINES,
} from './musashiHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(MUSASHI_HULL_B64);
  return cached;
}

const surface = surfaceOf(MUSASHI_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const musashiSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const musashiSeatY = surface.seatY;

/** Her turrets as the sculpt drew them: see prepare-musashi-hull.mjs. */
export const TURRET_PIECES = MUSASHI_TURRETS;

/** Where each of her guns stands: see prepare-musashi-hull.mjs. */
export const MOUNT_SEATS = MUSASHI_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour fit under. */
export const SCULPT_LINES = MUSASHI_LINES;

let mats = null;
export function musashiMaterials() {
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
export function buildMusashiHull(g) {
  const m = musashiMaterials();
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
    const t = MUSASHI_TURRETS[i];
    pieces.set(i, { house: decodePiece(t.house), guns: decodePiece(t.guns) });
  }
  return pieces.get(i);
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'sec6' her 15.5 cm triple,
 * 'sec5' her 12.7 cm twin, 'pod' her 25 mm triple in its shield -- decoded
 * once, in the frame of its mounting: the pivot at the origin, the foot of
 * what trains at y = 0, the bore along +Z; and where its trunnions and
 * muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = MUSASHI_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}
