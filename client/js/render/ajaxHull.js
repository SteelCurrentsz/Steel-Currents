// HMS Ajax's hull, her bridge, her one trunked funnel, her masts and her
// boats: the owner's model of her, painted in her own colours, and every gun
// of hers as the model drew it.
//
// build/prepare-ajax-hull.mjs reads the model as the owner uploaded it --
// "HMS Ajax" by kriss50 (https://skfb.ly/ptKuX), under Creative Commons
// Attribution 4.0, credited on the Credits screen -- paints her (the model is
// one untextured grey): her weather decks planked, her bottom red under her
// waterline; lifts her turrets, her 4 in twins, her pom-poms, her machine gun,
// her Oerlikons, her tubes and her screws out of her mounting by mounting,
// and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  AJAX_HULL_B64, AJAX_SURFACE, AJAX_GUNS, AJAX_MOUNTS, AJAX_LINES,
} from './ajaxHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(AJAX_HULL_B64);
  return cached;
}

const surface = surfaceOf(AJAX_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const ajaxSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const ajaxSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-ajax-hull.mjs. */
export const MOUNT_SEATS = AJAX_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = AJAX_LINES;

let mats = null;
export function ajaxMaterials() {
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
export function buildAjaxHull(g) {
  const m = ajaxMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 6 in twin turret, 'sec'
 * her 4 in twin, 'pompom' her quadruple 2-pdr, 'mg' her quadruple 0.5 in,
 * 'oer2' and 'oer' her twin and single Oerlikons, 'tubes0' and 'tubes1' her
 * two banks of tubes --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = AJAX_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
