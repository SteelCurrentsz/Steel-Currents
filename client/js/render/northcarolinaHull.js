// USS North Carolina's hull, her superstructure, her two funnels, her tower,
// her masts, her catapults and her Kingfishers: the owner's model of her,
// in the Measure 32 dazzle it paints her in, and her turrets and her 5-inch
// twins as the model drew them.
//
// build/prepare-northcarolina-hull.mjs reads the model as the owner uploaded
// it -- "USS North Carolina (War Thunder) Heavy Cavalry" by KojfDiscord
// (https://skfb.ly/pKNuG), under Creative Commons Attribution 4.0, credited on
// the Credits screen -- paints her off its textures, her bottom red under her
// waterline; lifts her turrets, her 5-inch/38 twins and her screws out of her
// mounting by mounting, takes her 1.1-inch quadruples off her, and decimates
// what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  NORTHCAROLINA_HULL_B64, NORTHCAROLINA_SURFACE, NORTHCAROLINA_GUNS, NORTHCAROLINA_MOUNTS, NORTHCAROLINA_LINES,
} from './northcarolinaHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(NORTHCAROLINA_HULL_B64);
  return cached;
}

const surface = surfaceOf(NORTHCAROLINA_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const northCarolinaSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const northCarolinaSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-northcarolina-hull.mjs. */
export const MOUNT_SEATS = NORTHCAROLINA_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = NORTHCAROLINA_LINES;

let mats = null;
export function northCarolinaMaterials() {
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
export function buildNorthCarolinaHull(g) {
  const m = northCarolinaMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 16-inch triple turret,
 * 'sec' her twin 5-inch/38 --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = NORTHCAROLINA_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
