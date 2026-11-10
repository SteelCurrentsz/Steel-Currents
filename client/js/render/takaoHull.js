// The Takao's hull, her castle of a bridge, her funnels, her masts and her
// catapults: the owner's model of her sister Atago -- the two were built to
// one drawing -- painted in her own colours, and every gun of hers as the
// model drew it. The Maya is drawn off the same model (see takao.js).
//
// build/prepare-takao-hull.mjs reads the model as the owner uploaded it --
// "Japanese Cruiser Atago" by kriss50 (https://skfb.ly/ptQuP), under Creative
// Commons Attribution 4.0, credited on the Credits screen -- paints her (the
// model is one untextured grey): her weather decks linoleum, her bottom red
// under her waterline, her glass dark; lifts her turrets, her 12.7 cm twins,
// her 25 mm, her tubes and her screws out of her mounting by mounting, and
// decimates what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in linoleum held down
// with brass strips, and the plates the model drew as single sheets from both
// sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  TAKAO_HULL_B64, TAKAO_SURFACE, TAKAO_GUNS, TAKAO_MOUNTS, TAKAO_LINES,
} from './takaoHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, linoleumMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(TAKAO_HULL_B64);
  return cached;
}

const surface = surfaceOf(TAKAO_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const takaoSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const takaoSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-takao-hull.mjs. */
export const MOUNT_SEATS = TAKAO_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = TAKAO_LINES;

let mats = null;
export function takaoMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const lino = linoleumMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x2f3439, shininess: 26,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: lino,
      specular: 0x1c1a16, shininess: 6,
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
  finish(mats.deck, 'lino');
  return mats;
}

/** Add the model's hull, painted and textured, as its length-wise slices. */
export function buildTakaoHull(g) {
  const m = takaoMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' a low 20.3 cm turret,
 * 'mainHi' a superfiring one, 'sec' a 12.7 cm twin, 'aa3' and 'aa3b' a 25 mm
 * triple, 'aa1' a single 25 mm, 'tubes' a quadruple bank -- decoded once, in
 * the frame of its mounting: the pivot at the origin, the foot of what trains
 * at y = 0, the bore along +Z; and where its trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = TAKAO_GUNS[kind];
    guns.set(kind, {
      house: p.house ? decodePiece(p.house) : null, guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
    });
  }
  return guns.get(kind);
}
