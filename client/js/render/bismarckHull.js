// KMS Bismarck's hull and forward superstructure: the owner's sculpts of
// them, painted as she was in May 1941, and her 38 cm turret, her 15 cm turret
// and her 10.5 cm mounting as the owner sculpted each.
//
// The sculpt of the whole of her came bare and melted over her waterline, so
// build/bismarck-source.mjs paints her -- red, black boot topping, light grey
// -- and takes her down to her hull; build/prepare-bismarck-hull.mjs draws her
// topsides afresh off her own faired sections from just over her waterline to
// her gunwale, joined to her underwater body point for point, lays her teak
// deck across them on the same points, and stands on it her forward
// superstructure as the sculpt of that drew it -- conning tower, bridge, tower
// mast and foretop, funnel, boats -- with the light guns it had cast into its
// tubs cut out of it. Her turrets, her 15 cm and her 10.5 cm come off the
// owner's sculpts of them, each with its barrels on a cradle of their own.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  BISMARCK_HULL_B64, BISMARCK_SURFACE, BISMARCK_GUNS, BISMARCK_MOUNTS, BISMARCK_LINES,
} from './bismarckHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(BISMARCK_HULL_B64);
  return cached;
}

const surface = surfaceOf(BISMARCK_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const bismarckSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const bismarckSeatY = surface.seatY;

/** Where her turrets, her 15 cm and the light guns cut out of her stand: see prepare-bismarck-hull.mjs. */
export const MOUNT_SEATS = BISMARCK_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = BISMARCK_LINES;

let mats = null;
export function bismarckMaterials() {
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
export function buildBismarckHull(g) {
  const m = bismarckMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'main' her 38 cm twin turret,
 * 'sec' her 15 cm twin turret, 'flak' her 10.5 cm twin in its shield, 'tubes'
 * Tirpitz's quadruple torpedo tubes -- decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzles are, and for the tubes
 * each one's axis (`bores`: [x, y, z at the breech, z at the muzzle]).
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = BISMARCK_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
