// HMS Agincourt's hull, her two tripods, her funnels, her flying deck and her
// boats: the owner's model of her, painted in her own colours, and her guns.
//
// build/prepare-agincourt-hull.mjs reads the model as the owner uploaded it --
// "HMS Agincourt (1913)" by kriss50 (https://skfb.ly/ptuBZ), under Creative
// Commons Attribution 4.0, credited on the Credits screen -- paints her (the
// model is one untextured grey): her weather decks planked, her bottom red
// under her waterline; plates the bottom and the hole the model leaves in
// her; lifts her turrets, her 3-inch and her screws out of her mounting by
// mounting; makes the 6-inch the model leaves out; and decimates what is
// left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in planking, and the
// plates the model drew as single sheets from both sides, all over her own
// colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  AGINCOURT_HULL_B64, AGINCOURT_SURFACE, AGINCOURT_GUNS, AGINCOURT_MOUNTS, AGINCOURT_LINES,
} from './agincourtHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(AGINCOURT_HULL_B64);
  return cached;
}

const surface = surfaceOf(AGINCOURT_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const agincourtSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const agincourtSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-agincourt-hull.mjs. */
export const MOUNT_SEATS = AGINCOURT_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = AGINCOURT_LINES;

let mats = null;
export function agincourtMaterials() {
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
export function buildAgincourtHull(g) {
  const m = agincourtMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' a 12-inch turret, 'cas' a
 * 6-inch casemate gun, 'aa3' a 3-inch -- decoded
 * once, in the frame of its mounting: the pivot at the origin, the foot of
 * what trains at y = 0, the bore along +Z; and where its trunnions and
 * muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = AGINCOURT_GUNS[kind];
    guns.set(kind, {
      house: p.house ? decodePiece(p.house) : null, guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
    });
  }
  return guns.get(kind);
}
