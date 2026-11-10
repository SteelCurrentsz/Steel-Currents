// The US Navy destroyer Arleigh Burke's hull and superstructure: the owner's
// model of her, painted in the colours it was textured in, and her guns -- her
// 5-inch Mk 45, her two Phalanx and her two Mk 38s -- and her Mk 32 tubes as
// the model drew each.
//
// build/prepare-burke-hull.mjs reads the model as the owner uploaded it --
// "1:1 Low poly US NAVY DDG-51 USS Arleigh Burke." by Yi Tsung Lee
// (https://skfb.ly/o7TNV), under Creative Commons Attribution 4.0, credited on
// the Credits screen -- paints every face the colour of the texture under it,
// paints her bottom one colour under her waterline, lifts her guns, her tubes
// and her screws out of her mounting by mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks (there is no planking on her,
// so none of her is), and the plates the model drew as single sheets from
// both sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  BURKE_HULL_B64, BURKE_SURFACE, BURKE_GUNS, BURKE_MOUNTS, BURKE_LINES,
} from './burkeHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(BURKE_HULL_B64);
  return cached;
}

const surface = surfaceOf(BURKE_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const burkeSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const burkeSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-burke-hull.mjs. */
export const MOUNT_SEATS = BURKE_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = BURKE_LINES;

let mats = null;
export function burkeMaterials() {
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
export function buildBurkeHull(g) {
  const m = burkeMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her Mk 45, 'ciws' her
 * Phalanx, 'mk38' her 25 mm Mk 38, 'tubes0' and 'tubes1' her port and
 * starboard Mk 32 triple tubes -- decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = BURKE_GUNS[kind];
    guns.set(kind, {
      house: p.house ? decodePiece(p.house) : null, guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
