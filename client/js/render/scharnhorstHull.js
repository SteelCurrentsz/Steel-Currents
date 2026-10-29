// KMS Scharnhorst's hull and her two superstructures: the owner's sculpts of
// them, painted as she was in 1943, and her 28 cm turret and her 15 cm single
// as the owner sculpted each.
//
// The sculpt of the whole of her came with her upperworks as soft lumps, so
// build/scharnhorst-source.mjs paints her -- red, black boot topping, light
// grey -- and takes her down to her hull; build/prepare-scharnhorst-hull.mjs
// seals her, draws her topsides afresh off her own faired sections from just
// over her waterline to her gunwale, joined to her underwater body point for
// point, lays her teak deck across them on the same points, and stands on it
// her bridge and front superstructure and her mid and aft superstructure as
// their own sculpts drew them -- smoothed, with the guns they had cast in cut
// out where hers train, and every hole in them closed. Her 28 cm turret and
// her 15 cm single come off the owner's sculpts of them, each with its barrels
// on a cradle of their own; her 15 cm twin, her 10.5 cm and her tubes are the
// sculpts the Bismarck and the Tirpitz were given (see bismarckHull.js).
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  SCHARNHORST_HULL_B64, SCHARNHORST_SURFACE, SCHARNHORST_GUNS, SCHARNHORST_MOUNTS, SCHARNHORST_LINES,
} from './scharnhorstHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(SCHARNHORST_HULL_B64);
  return cached;
}

const surface = surfaceOf(SCHARNHORST_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const scharnhorstSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const scharnhorstSeatY = surface.seatY;

/** Where her turrets, her 15 cm, her 10.5 cm and the light guns cut out of her stand: see prepare-scharnhorst-hull.mjs. */
export const MOUNT_SEATS = SCHARNHORST_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = SCHARNHORST_LINES;

let mats = null;
export function scharnhorstMaterials() {
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
export function buildScharnhorstHull(g) {
  const m = scharnhorstMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'main' her 28 cm triple turret,
 * 'single' her 15 cm single in its shield -- decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzles are.
 */
export function scharnhorstGun(kind) {
  if (!guns.has(kind)) {
    const p = SCHARNHORST_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}
