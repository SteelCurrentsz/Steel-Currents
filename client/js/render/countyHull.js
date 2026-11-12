// HMS County's hull, her bridge, her three funnels, her masts, her catapult
// and her boats: the owner's model of HMS Sussex, a County of the London
// group, painted in her own colours, and every gun of hers as the model drew
// it.
//
// build/prepare-county-hull.mjs reads the model as the owner uploaded it --
// "HMS Sussex" by kriss50 (https://skfb.ly/ptKSI), under Creative Commons
// Attribution 4.0, credited on the Credits screen -- paints her (the model is
// one untextured grey): her weather decks planked, her bottom red under her
// waterline; lifts her turrets, her 4 in twins, her pom-poms, her machine
// guns, her Oerlikons, her tubes and her screws out of her mounting by
// mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  COUNTY_HULL_B64, COUNTY_SURFACE, COUNTY_GUNS, COUNTY_MOUNTS, COUNTY_LINES,
} from './countyHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(COUNTY_HULL_B64);
  return cached;
}

const surface = surfaceOf(COUNTY_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const countySurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const countySeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-county-hull.mjs. */
export const MOUNT_SEATS = COUNTY_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = COUNTY_LINES;

let mats = null;
export function countyMaterials() {
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
export function buildCountyHull(g) {
  const m = countyMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 8 in twin turret, 'sec'
 * her 4 in twin, 'pompom' her octuple 2-pdr, 'mg' her quadruple 0.5 in,
 * 'oer' her single Oerlikon, 'tubes0' and 'tubes1' her two banks of tubes --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = COUNTY_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
