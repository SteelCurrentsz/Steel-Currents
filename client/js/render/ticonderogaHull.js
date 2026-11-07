// USS Ticonderoga's hull and superstructure: the owner's model of her,
// painted in the colours it was textured in, and her guns -- her Mk 71 203 mm
// singles and her 76 mm singles -- and her torpedo launchers as the model drew
// each.
//
// build/prepare-ticonderoga-hull.mjs reads the model as the owner uploaded it
// -- "US CLAA Ticonderoga" by 全斗焕 (https://skfb.ly/oHFAG), under Creative
// Commons Attribution 4.0, credited on the Credits screen -- brings it up to
// her size, paints every face the colour of the texture under it, paints her
// bottom one colour under her waterline, lifts her guns, her launchers and
// her screws out of her mounting by mounting, and decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  TICONDEROGA_HULL_B64, TICONDEROGA_SURFACE, TICONDEROGA_GUNS, TICONDEROGA_MOUNTS, TICONDEROGA_LINES,
} from './ticonderogaHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(TICONDEROGA_HULL_B64);
  return cached;
}

const surface = surfaceOf(TICONDEROGA_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const ticonderogaSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const ticonderogaSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-ticonderoga-hull.mjs. */
export const MOUNT_SEATS = TICONDEROGA_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = TICONDEROGA_LINES;

let mats = null;
export function ticonderogaMaterials() {
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
export function buildTiconderogaHull(g) {
  const m = ticonderogaMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her Mk 71 203 mm single,
 * 'dp' her 76 mm single, 'tubes0' and 'tubes1' her torpedo launchers, 'ciws'
 * where her Phalanx stands -- decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = TICONDEROGA_GUNS[kind];
    guns.set(kind, {
      house: p.house ? decodePiece(p.house) : null, guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
