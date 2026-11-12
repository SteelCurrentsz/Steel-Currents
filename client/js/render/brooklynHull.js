// USS Brooklyn's hull, her bridge, her two funnels, her masts, her hangar and
// her crane: the owner's model of her, painted in Measure 22, and every gun of
// hers that the model draws as she carried it.
//
// build/prepare-brooklyn-hull.mjs reads the model as the owner uploaded it --
// "USS Brooklyn" by kriss50 (https://skfb.ly/ptOVJ), under Creative Commons
// Attribution 4.0, credited on the Credits screen -- paints her (the model is
// one untextured grey): navy blue up her side to the Measure 22 line, haze
// grey over it, deck blue on her decks, red under her waterline; lifts her
// turrets, her quad Bofors, her Oerlikons and her screws out of her mounting
// by mounting; takes off the twin 5"/38s and the catapult girders the model
// draws, which are not hers and are built in brooklyn.js; and decimates what
// is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her weather decks in the fleet's deck,
// and the plates the model drew as single sheets from both sides, all over
// her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  BROOKLYN_HULL_B64, BROOKLYN_SURFACE, BROOKLYN_GUNS, BROOKLYN_MOUNTS, BROOKLYN_LINES,
} from './brooklynHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(BROOKLYN_HULL_B64);
  return cached;
}

const surface = surfaceOf(BROOKLYN_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const brooklynSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const brooklynSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-brooklyn-hull.mjs. */
export const MOUNT_SEATS = BROOKLYN_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = BROOKLYN_LINES;

let mats = null;
export function brooklynMaterials() {
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
export function buildBrooklynHull(g) {
  const m = brooklynMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 6 in triple turret,
 * 'quad' her quadruple 40 mm Bofors, 'oer' her single Oerlikon -- decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = BROOKLYN_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
    });
  }
  return guns.get(kind);
}
