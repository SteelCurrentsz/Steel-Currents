// HMS King George V's hull and superstructure: the owner's sculpts of them,
// painted as she was in 1945, and her guns -- her 14-inch quadruple and twin
// turrets, her 5.25-inch twin, her octuple pom-pom, her quadruple Bofors and
// her Oerlikon -- as the owner sculpted each.
//
// build/kgv-source.mjs decodes the owner's compressed sculpts and paints the
// hull -- red bottom, boot topping, grey -- with every paint line cut straight
// into her. build/prepare-kgv-hull.mjs clears her deck of what the sculpt of
// her hull stood on it, lays it again, and stands on it the two finer sculpts
// of her superstructure with the guns they had cast in cut out.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  KGV_HULL_B64, KGV_SURFACE, KGV_GUNS, KGV_MOUNTS, KGV_LINES,
} from './kgvHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(KGV_HULL_B64);
  return cached;
}

const surface = surfaceOf(KGV_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const kgvSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const kgvSeatY = surface.seatY;

/** Where her turrets, her 5.25-inch and her light guns stand: see prepare-kgv-hull.mjs. */
export const MOUNT_SEATS = KGV_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = KGV_LINES;

let mats = null;
export function kgvMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    // One-sided: a layer at one of her guns has his eye in the thickness of
    // what is over him, and has to see out through it. Instead her holes are
    // closed, and what is seen from behind is given a face of its own that
    // way (see build/prepare-kgv-hull.mjs).
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks,
      specular: 0x16181c, shininess: 5,
    }),
    // For her guns, whose shields and splinter screens are single sheets seen
    // from both sides.
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

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildKgvHull(g) {
  const m = kgvMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'mainA', 'mainB' and 'mainY'
 * her 14-inch turrets, 'sec' her 5.25-inch twin, 'pompom' her octuple
 * 2-pounder, 'bofors' her quadruple 40 mm, 'oerlikon' her 20 mm -- decoded
 * once, in the frame of its mounting: the pivot at the origin, the foot of
 * what trains at y = 0, the bore along +Z; and where its trunnions and
 * muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = KGV_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}
