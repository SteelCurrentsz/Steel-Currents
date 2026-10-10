// IJN Kongo's hull, superstructure, funnels and bridge: the owner's sculpts of
// them, painted as she was in 1944, and her 35.6 cm turret, her 15.2 cm
// casemate gun, her 12.7 cm twin and her 25 mm triple as the owner sculpted
// each.
//
// The sculpt of her hull is the whole ship, rigged; build/kongo-source.mjs
// takes her rigging off her and paints her: red lead, boot topping, grey, with
// every paint line cut straight into her, and decimates her with those lines
// kept. build/prepare-kongo-hull.mjs closes every hole she had, lifts her
// superstructure and her funnels off her as the sculpt drew them, draws her
// topsides afresh off her own faired sections from just over her waterline to
// her gunwale -- joined to her underwater body point for point -- lays her deck
// across them on the same points so that she is closed everywhere, and stands
// her superstructure back on it, skirted down into it, with the turrets and
// the light guns the sculpt had cast in cut out; and her bridge, the owner's
// sculpt of the tower she was known by, in the place of the one her hull's
// sculpt drew.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  KONGO_HULL_B64, KONGO_SURFACE, KONGO_GUNS, KONGO_MOUNTS, KONGO_LINES,
} from './kongoHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(KONGO_HULL_B64);
  return cached;
}

const surface = surfaceOf(KONGO_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const kongoSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const kongoSeatY = surface.seatY;

/** Where her turrets, her casemates and the light guns cut out of her stand: see prepare-kongo-hull.mjs. */
export const MOUNT_SEATS = KONGO_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = KONGO_LINES;

let mats = null;
export function kongoMaterials() {
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
  };
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildKongoHull(g) {
  const m = kongoMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'main' her 35.6 cm twin turret,
 * 'sec' her 15.2 cm casemate gun, 'twin' her 12.7 cm twin, 'aa' her 25 mm
 * triple -- decoded once, in the frame of its mounting: the pivot at
 * the origin, the foot of what trains at y = 0, the bore along +Z; and where
 * its trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = KONGO_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}
