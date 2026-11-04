// RF Sovetsky Soyuz's hull and superstructure: the owner's model of her,
// painted in the colours it was textured in, and her guns -- her 406 mm
// triples, her 152 mm twins, her 100 mm twins and her 37 mm -- as the model
// drew each.
//
// build/prepare-soyuz-hull.mjs reads the model as the owner uploaded it,
// paints every face the colour of the texture under it, paints her shell grey
// over her waterline and red under it, lifts her guns and her screws out of
// her by the groups the model drew them as, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her main deck in planking, and the
// plates the model drew as single sheets -- bulwarks, screens, shields --
// from both sides, all over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  SOYUZ_HULL_B64, SOYUZ_SURFACE, SOYUZ_GUNS, SOYUZ_MOUNTS, SOYUZ_LINES,
} from './soyuzHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(SOYUZ_HULL_B64);
  return cached;
}

const surface = surfaceOf(SOYUZ_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const soyuzSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const soyuzSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-soyuz-hull.mjs. */
export const MOUNT_SEATS = SOYUZ_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = SOYUZ_LINES;

let mats = null;
export function soyuzMaterials() {
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
    // What the model drew as single sheets, seen from both sides; and every
    // one of her guns, whose shields are the same.
    sheet: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide,
    }),
  };
  finish(mats.plating);
  finish(mats.sheet);
  finish(mats.deck, 'wood');
  return mats;
}

/** Add the model's hull, painted and textured, as its length-wise slices. */
export function buildSoyuzHull(g) {
  const m = soyuzMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 406 mm triple, 'sec' her
 * 152 mm twin, 'dp' her 100 mm twin, 'aa' her 37 mm -- decoded once, in the
 * frame of its mounting: the pivot at the origin, the foot of what trains at
 * y = 0, the bore along +Z; and where its trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = SOYUZ_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: decodePiece(p.guns),
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
    });
  }
  return guns.get(kind);
}
