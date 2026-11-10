// The Panzerschiffe's hull and superstructure: the owner's model of the
// Admiral Scheer, painted in the colours it was textured in -- her grey, her
// planked decks and her dark bottom -- and her guns -- her 28 cm triples, her
// 15 cm singles and every one of her flak mountings -- as the model drew each.
// Her sister the Admiral Graf Spee is drawn off the same model (see scheer.js).
//
// build/prepare-scheer-hull.mjs reads the model as the owner uploaded it --
// "The Third Reich Navy large cruiser ADM. SCHEER" by 全斗焕, under Creative
// Commons Attribution 4.0, credited on the Credits screen -- brings it up to
// her size, paints every face the colour of the texture under it, paints her
// bottom one colour under her waterline, lifts her guns, her tubes, her
// catapult and her screws out of her mounting by mounting, and decimates what
// is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  SCHEER_HULL_B64, SCHEER_SURFACE, SCHEER_GUNS, SCHEER_MOUNTS, SCHEER_LINES,
} from './scheerHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(SCHEER_HULL_B64);
  return cached;
}

const surface = surfaceOf(SCHEER_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const scheerSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const scheerSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-scheer-hull.mjs. */
export const MOUNT_SEATS = SCHEER_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = SCHEER_LINES;

let mats = null;
export function scheerMaterials() {
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
export function buildScheerHull(g) {
  const m = scheerMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 28 cm triple, 'sec' her
 * 15 cm single, 'heavy' her 10.5 cm twin, 'twin' her 3.7 cm twin, 'quad' her
 * 2 cm quadruple, 'single' her 2 cm single, 'bofors' her 4 cm single, and
 * 'tubes0'/'tubes1' her port and starboard banks of tubes --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = SCHEER_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      // The gunhouse without what stands on its roof, where the model has one.
      bare: p.bare ? decodePiece(p.bare) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
