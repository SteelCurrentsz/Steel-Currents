// IJN Yukikaze's hull, bridge, funnels, masts and deckhouses: the owner's
// sculpt of her, painted as she was in 1945, and her 12.7 cm twin, her 25 mm
// triple and her bank of 61 cm tubes as the owner sculpted each.
//
// The sculpt of her hull is the whole ship, on a stand; build/yukikaze-source.mjs
// takes her off it, takes her rigging off her and paints her: red lead, boot
// topping, grey, with every paint line cut straight into her, and decimates
// her with those lines kept. build/prepare-yukikaze-hull.mjs closes every
// hole she had, lifts her superstructure off her as the sculpt drew it and
// smooths it, lofts her funnels afresh, draws her topsides afresh off her own
// faired sections from just over her waterline to her gunwale -- joined to
// her underwater body point for point -- lays her deck across them on the
// same points so that she is closed everywhere, and stands her superstructure
// back on it, skirted down into it, with the guns, the tubes and the depth
// charge gear the sculpt had cast in cut out and every face of her turned out.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather decks in the linoleum an
// IJN destroyer's were laid with, both over her own painted colours. Both are
// drawn from either side: a platform's rim or a tub's bulwark is one sheet of
// plate in the sculpt, and from inside it must be steel, not sky.
import * as THREE from '../../../vendor/three.module.js';
import {
  YUKIKAZE_HULL_B64, YUKIKAZE_SURFACE, YUKIKAZE_GUNS, YUKIKAZE_MOUNTS, YUKIKAZE_LINES,
} from './yukikazeHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, linoleumMap, finish } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(YUKIKAZE_HULL_B64);
  return cached;
}

const surface = surfaceOf(YUKIKAZE_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const yukikazeSurfaceY = surface.surfaceY;

/** Where a fitting stands, at (x, z): the median of her surface round it. */
export const yukikazeSeatY = surface.seatY;

/** Where her guns and her tubes stand: see prepare-yukikaze-hull.mjs. */
export const MOUNT_SEATS = YUKIKAZE_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = YUKIKAZE_LINES;

let mats = null;
export function yukikazeMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const lino = linoleumMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: lino, specularMap: lino,
      specular: 0x1c1a18, shininess: 8, side: THREE.DoubleSide,
    }),
  };
  finish(mats.plating);
  finish(mats.deck, 'lino');
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildYukikazeHull(g) {
  const m = yukikazeMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her mountings as the owner sculpted it -- 'twin' her 12.7 cm twin
 * in its gunhouse, 'aa' her 25 mm triple, 'tubes' her bank of tubes --
 * decoded once, in the frame of its mounting:
 * the pivot at the origin, the foot of what trains at y = 0, the bore along
 * +Z; and where its trunnions, its muzzles and (for the tubes) its bores are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = YUKIKAZE_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
