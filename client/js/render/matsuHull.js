// IJN Matsu's hull, bridge, funnels, masts and deckhouses: the owner's sculpt
// of her, painted as she was in 1944, and her 12.7 cm twins, her 25 mm triple
// and her bank of 61 cm tubes as the owner sculpted each.
//
// The sculpt of her hull is the whole ship, rigged; build/matsu-source.mjs
// takes her rigging off her and paints her: red lead, boot topping, grey, with
// every paint line cut straight into her, and decimates her with those lines
// kept. build/prepare-matsu-hull.mjs closes every hole she had, lifts her
// superstructure off her as the sculpt drew it, draws her topsides afresh off
// her own faired sections from just over her waterline to her gunwale --
// joined to her underwater body point for point -- lays her deck across them
// on the same points so that she is closed everywhere, and stands her
// superstructure back on it, skirted down into it, with the guns and tubes
// the sculpt had cast in cut out and every face of her turned out.
//
// She is drawn in two surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate and her weather decks in the linoleum an
// IJN destroyer's were laid with, both over her own painted colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  MATSU_HULL_B64, MATSU_SURFACE, MATSU_GUNS, MATSU_MOUNTS, MATSU_LINES,
} from './matsuHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, linoleumMap } from './textures.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(MATSU_HULL_B64);
  return cached;
}

const surface = surfaceOf(MATSU_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const matsuSurfaceY = surface.surfaceY;

/** Where a fitting stands, at (x, z): the median of her surface round it. */
export const matsuSeatY = surface.seatY;

/** Where her guns and her tubes stand: see prepare-matsu-hull.mjs. */
export const MOUNT_SEATS = MATSU_MOUNTS;

/** Her lines, as the sculpt has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = MATSU_LINES;

let mats = null;
export function matsuMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const lino = linoleumMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: lino, specularMap: lino,
      specular: 0x1c1a18, shininess: 8,
    }),
  };
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
export function buildMatsuHull(g) {
  const m = matsuMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, geo.userData.surface === 1 ? m.deck : m.plating));
  }
}

const guns = new Map();
/**
 * One of her mountings as the owner sculpted it -- 'shield' her forward
 * 12.7 cm twin in its shield, 'open' her after one, 'aa' her 25 mm triple,
 * 'tubes' her bank of tubes -- decoded once, in the frame of its mounting:
 * the pivot at the origin, the foot of what trains at y = 0, the bore along
 * +Z; and where its trunnions, its muzzles and (for the tubes) its bores are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = MATSU_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
