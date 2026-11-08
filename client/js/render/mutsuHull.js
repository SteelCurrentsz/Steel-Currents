// IJN Mutsu's hull, her tripod and its pagoda of a bridge, her two funnels,
// her mainmast and her boats: the owner's model of her, painted in her own
// colours, and every gun of hers as the model drew it.
//
// build/prepare-mutsu-hull.mjs reads the model as the owner uploaded it --
// "Japanese Battleship Mutsu" by kriss50 (https://skfb.ly/ptQvY), under
// Creative Commons Attribution 4.0, credited on the Credits screen -- paints
// her (the model is one untextured grey): her weather decks planked, her
// bottom red under her waterline; lifts her turrets, her 14 cm casemate guns,
// her 12.7 cm twins, her 40 mm and her screws out of her mounting by
// mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  MUTSU_HULL_B64, MUTSU_SURFACE, MUTSU_GUNS, MUTSU_MOUNTS, MUTSU_LINES,
} from './mutsuHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(MUTSU_HULL_B64);
  return cached;
}

const surface = surfaceOf(MUTSU_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const mutsuSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const mutsuSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-mutsu-hull.mjs. */
export const MOUNT_SEATS = MUTSU_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = MUTSU_LINES;

let mats = null;
export function mutsuMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x2f3439, shininess: 26,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks,
      specular: 0x16181c, shininess: 5,
    }),
    // What the model drew as single sheets, seen from both sides; and every
    // one of her guns, whose shields are the same.
    sheet: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x2f3439, shininess: 26, side: THREE.DoubleSide,
    }),
  };
  finish(mats.plating);
  finish(mats.sheet);
  finish(mats.deck, 'wood');
  return mats;
}

/** Add the model's hull, painted and textured, as its length-wise slices. */
export function buildMutsuHull(g) {
  const m = mutsuMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' a 41 cm turret, 'cas' a
 * 14 cm casemate gun, 'sec' a 12.7 cm twin, 'aa2' a twin 40 mm -- decoded
 * once, in the frame of its mounting: the pivot at the origin, the foot of
 * what trains at y = 0, the bore along +Z; and where its trunnions and
 * muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = MUTSU_GUNS[kind];
    guns.set(kind, {
      house: p.house ? decodePiece(p.house) : null, guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
    });
  }
  return guns.get(kind);
}
