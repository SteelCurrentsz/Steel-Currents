// USS Tillman Modernized's hull and superstructure: the owner's model of
// her, painted in the colours it was textured in, and her guns -- her 24-inch
// quadruples, her 5-inch twins, her 40 mm quadruples and her 20 mm -- as the
// model drew each.
//
// build/prepare-tillman-hull.mjs reads the model as the owner uploaded it --
// "US Super Battleship Rhodeisland" by 全斗焕 (https://skfb.ly/oHGQz), under
// Creative Commons Attribution 4.0, credited on the Credits screen -- brings
// it up to her size, paints every face the colour of the texture under it,
// paints her bottom one colour under her waterline, lifts her guns, her
// catapults and her screws out of her mounting by mounting, and decimates
// what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  TILLMAN_HULL_B64, TILLMAN_SURFACE, TILLMAN_GUNS, TILLMAN_MOUNTS, TILLMAN_LINES,
} from './tillmanHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(TILLMAN_HULL_B64);
  return cached;
}

const surface = surfaceOf(TILLMAN_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const tillmanSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const tillmanSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-tillman-hull.mjs. */
export const MOUNT_SEATS = TILLMAN_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = TILLMAN_LINES;

let mats = null;
export function tillmanMaterials() {
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
export function buildTillmanHull(g) {
  const m = tillmanMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 24-inch quadruple, 'sec'
 * her 5-inch twin, 'aa40' her 40 mm quadruple, 'aa20t' her 20 mm twin and
 * 'aa20s' her single 20 mm --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = TILLMAN_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
