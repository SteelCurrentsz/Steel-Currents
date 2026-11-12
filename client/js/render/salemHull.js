// USS Des Moines's hull, her bridge, her funnels, her masts and her boats:
// the owner's model of her sister Salem as she was completed in 1949,
// painted haze grey, and every gun of hers as the model drew it.
//
// build/prepare-salem-hull.mjs reads the model as the owner uploaded it --
// "USS Salem (CA-139)" by kriss50 (https://skfb.ly/ptKUo), under Creative
// Commons Attribution 4.0, credited on the Credits screen -- paints her (the
// model is one untextured grey): haze grey overall, her decks in deck grey, a
// black boot top and her bottom red under her waterline; lifts her turrets,
// her 5 in/38s, her 3 in/50s, her Oerlikons and her screws out of her
// mounting by mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  SALEM_HULL_B64, SALEM_SURFACE, SALEM_GUNS, SALEM_MOUNTS, SALEM_LINES,
} from './salemHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(SALEM_HULL_B64);
  return cached;
}

const surface = surfaceOf(SALEM_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const salemSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const salemSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-salem-hull.mjs. */
export const MOUNT_SEATS = SALEM_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = SALEM_LINES;

let mats = null;
export function salemMaterials() {
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
export function buildSalemHull(g) {
  const m = salemMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 8 in triple turret,
 * 'sec' her twin 5 in/38, 'tri' her twin 3 in/50, 'oer' her single
 * Oerlikon --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = SALEM_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
