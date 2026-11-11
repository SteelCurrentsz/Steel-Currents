// The Russian cruiser Slava's hull and superstructure: the owner's model of
// her, painted in the Sovremenny's colours, with her Vulcan tubes, her S-300F
// hatches and her OSA-M launchers on it, and her guns -- her twin AK-130 and
// her two RBU-6000s as the model drew each (her AK-630s are the owner's own
// model of one: see ak630.data.js).
//
// build/prepare-slava-hull.mjs reads the model as the owner uploaded it --
// "Project 1164" by KlyushnikovAI (https://sketchfab.com/3d-models/project-1164-b13773d65e7440bca803ec6485e5f1b6),
// under Creative Commons Attribution 4.0, credited on the Credits screen --
// paints every face the Sovremenny's paint nearest the colour under it, paints
// her bottom the Sovremenny's bottom colour under her waterline, lifts her
// guns and her screws out of her mounting by mounting, and decimates what is
// left.
//
// She is drawn as the Sovremenny is, in the Sovremenny's own materials: her
// plating in the fleet's steel plate, her decks, and the plates the model drew
// as single sheets from both sides.
import * as THREE from '../../../vendor/three.module.js';
import {
  SLAVA_HULL_B64, SLAVA_SURFACE, SLAVA_GUNS, SLAVA_MOUNTS, SLAVA_LINES,
} from './slavaHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { sovremennyMaterials } from './sovremennyHull.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(SLAVA_HULL_B64);
  return cached;
}

const surface = surfaceOf(SLAVA_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const slavaSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const slavaSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-slava-hull.mjs. */
export const MOUNT_SEATS = SLAVA_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = SLAVA_LINES;

/** Her materials: the Sovremenny's, plate for plate. */
export const slavaMaterials = sovremennyMaterials;

/** Add the model's hull, painted and textured, as its length-wise slices. */
export function buildSlavaHull(g) {
  const m = slavaMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her twin AK-130, 'rbu' her
 * RBU-6000 -- decoded once, in the frame of its mounting: the pivot at the
 * origin, the foot of what trains at y = 0, the bore along +Z; and where its
 * trunnions and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = SLAVA_GUNS[kind];
    guns.set(kind, {
      house: p.house ? decodePiece(p.house) : null, guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
