// USS Alaska's hull, her bridge, her funnel, her masts, her catapults and
// her boats: the owner's model of her as she was completed in 1944, painted
// in Measure 22, and every gun of hers as the model drew it.
//
// build/prepare-alaska-hull.mjs reads the model as the owner uploaded it --
// "USS Alaska" by kriss50 (https://skfb.ly/ptOqN), under Creative Commons
// Attribution 4.0, credited on the Credits screen -- paints her (the model is
// one untextured grey): navy blue up her sides, haze grey above, her decks in
// deck blue, her bottom red under her waterline; lifts her turrets, her
// 5 in/38s, her Bofors, her Oerlikons and her screws out of her mounting by
// mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  ALASKA_HULL_B64, ALASKA_SURFACE, ALASKA_GUNS, ALASKA_MOUNTS, ALASKA_LINES,
} from './alaskaHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(ALASKA_HULL_B64);
  return cached;
}

const surface = surfaceOf(ALASKA_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const alaskaSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const alaskaSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-alaska-hull.mjs. */
export const MOUNT_SEATS = ALASKA_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = ALASKA_LINES;

let mats = null;
export function alaskaMaterials() {
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
export function buildAlaskaHull(g) {
  const m = alaskaMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 12 in triple turret,
 * 'sec' her twin 5 in/38, 'quad' her quadruple Bofors, 'oer' her single
 * Oerlikon --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = ALASKA_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
