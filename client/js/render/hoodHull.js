// HMS Hood's hull, superstructure and after deck: the owner's sculpts of
// them, painted as she was in May 1941, and her 15-inch turret, her 5.5-inch
// gun and her quadruple pom-pom as the owner sculpted each.
//
// build/hood-source.mjs decodes the owner's compressed sculpts and paints the
// hull -- red bottom, boot topping, grey -- with every paint line cut straight
// into her. build/prepare-hood-hull.mjs cuts the sculpt of her off a hand
// under her decks stem to stern, lays her decks again smooth along her own
// sheer, stands the finer sculpt of her superstructure on them with the guns
// it had cast in cut out, and her after deck, the wedge the sculpt drew on
// her quarterdeck, read off it and run smooth.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  HOOD_HULL_B64, HOOD_SURFACE, HOOD_GUNS, HOOD_MOUNTS, HOOD_LINES,
} from './hoodHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(HOOD_HULL_B64);
  return cached;
}

const surface = surfaceOf(HOOD_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const hoodSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const hoodSeatY = surface.seatY;

/** Where her turrets, her 5.5-inch and her pom-poms stand: see prepare-hood-hull.mjs. */
export const MOUNT_SEATS = HOOD_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = HOOD_LINES;

let mats = null;
export function hoodMaterials() {
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
  finish(mats.plating);
  finish(mats.deck, 'wood');
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildHoodHull(g) {
  const m = hoodMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'main' her 15-inch twin turret,
 * 'sec' her 5.5-inch in its shield, 'pompom' her quadruple 2-pounder --
 * decoded once, in the frame of its mounting: the pivot at
 * the origin, the foot of what trains at y = 0, the bore along +Z; and where
 * its trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = HOOD_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}
