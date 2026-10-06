// Richelieu's hull and upperworks: the owner's sculpts of them, painted as she
// was in 1940, and her 380 mm turret, her 152 mm turret and her 100 mm
// mounting as the owner sculpted each.
//
// The sculpt of her hull came bare and flush-decked from stem to stern, so
// build/richelieu-source.mjs paints it -- red, black boot topping, the
// blue-grey of the Marine nationale -- and takes it down to her hull;
// build/prepare-richelieu-hull.mjs draws her topsides afresh off her own
// faired sections from just over her waterline to her gunwale -- breaking down
// a deck abaft her after turrets to her quarterdeck, as she was built --
// joined to her underwater body point for point, lays her planked deck across
// them on the same points, and stands on it her upperworks as the second
// sculpt drew them -- tower and bridge, mack, after superstructure, boats --
// on a deckhouse drawn under them where that sculpt melted, with the guns it
// had cast into its mountings cut out of it. Her turrets, her 152 mm and her
// 100 mm come off the owner's sculpts of them, each with its barrels on a
// cradle of their own.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather deck in planking, both
// over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  RICHELIEU_HULL_B64, RICHELIEU_SURFACE, RICHELIEU_GUNS, RICHELIEU_MOUNTS, RICHELIEU_LINES,
} from './richelieuHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(RICHELIEU_HULL_B64);
  return cached;
}

const surface = surfaceOf(RICHELIEU_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const richelieuSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const richelieuSeatY = surface.seatY;

/** Where her turrets, her 152 mm, her 100 mm and her light guns stand: see prepare-richelieu-hull.mjs. */
export const MOUNT_SEATS = RICHELIEU_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = RICHELIEU_LINES;

let mats = null;
export function richelieuMaterials() {
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
export function buildRichelieuHull(g) {
  const m = richelieuMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'main' her 380 mm quadruple
 * turret, 'sec' her 152 mm triple turret, 'dp' her 100 mm twin in its shield
 * -- decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions and
 * muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = RICHELIEU_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}
