// The battleship Francesco Morosini's hull and superstructure: the owner's
// model of her, painted in the colours it was textured in -- her dazzle and
// her forecastle's red and white stripes -- and her guns -- her 457 mm twins,
// her 135 mm twins, her 90 mm twins and her 37 mm -- as the model drew each.
//
// build/prepare-morosini-hull.mjs reads the model as the owner uploaded it --
// "Italian Battleship Francesco Morosini" by 全斗焕 (https://skfb.ly/osPxN),
// under Creative Commons Attribution 4.0, credited on the Credits screen --
// brings it up to her size, paints every face the colour of the texture under
// it, paints her bottom one colour under her waterline, lifts her guns and her
// screws out of her mounting by mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  MOROSINI_HULL_B64, MOROSINI_SURFACE, MOROSINI_GUNS, MOROSINI_MOUNTS, MOROSINI_LINES,
} from './morosiniHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(MOROSINI_HULL_B64);
  return cached;
}

const surface = surfaceOf(MOROSINI_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const morosiniSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const morosiniSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-morosini-hull.mjs. */
export const MOUNT_SEATS = MOROSINI_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = MOROSINI_LINES;

let mats = null;
export function morosiniMaterials() {
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
export function buildMorosiniHull(g) {
  const m = morosiniMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 457 mm twin, 'sec' her
 * 135 mm twin, 'dp' her 90 mm twin, 'aa' her 37 mm twin --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = MOROSINI_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
