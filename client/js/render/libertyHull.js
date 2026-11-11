// A Liberty ship's hull, superstructure, masts and booms: the owner's model
// of her, in the model's own paint -- her black topsides, red bottom, white
// midships house and the rust down her plating are its texture atlas, laid on
// her by its own texture coordinates -- and her 4-inch as the model drew it.
//
// build/prepare-liberty-hull.mjs reads the model as the owner uploaded it --
// "Liberty ship" by AlanTinka (https://skfb.ly/oIxAL), under Creative Commons
// Attribution 4.0, credited on the Credits screen -- lifts her guns out of
// her, and packs the rest as it is.
import * as THREE from '../../../vendor/three.module.js';
import {
  LIBERTY_HULL_B64, LIBERTY_TEXTURE, LIBERTY_SURFACE, LIBERTY_GUNS, LIBERTY_MOUNTS, LIBERTY_LINES,
} from './libertyHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(LIBERTY_HULL_B64);
  return cached;
}

const surface = surfaceOf(LIBERTY_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const libertySurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const libertySeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-liberty-hull.mjs. */
export const MOUNT_SEATS = LIBERTY_MOUNTS;

/** Her lines, as the model has them: what her interior is fitted under. */
export const SCULPT_LINES = LIBERTY_LINES;

/**
 * The model's atlas, as a texture. Under Node -- the tests -- there is no
 * image to decode it into, and her hull is drawn white.
 */
let atlas = null;
function atlasTexture() {
  if (atlas || typeof Image === 'undefined') return atlas;
  const img = new Image();
  atlas = new THREE.Texture(img);
  // glTF's texture coordinates run down the image, not up it.
  atlas.flipY = false;
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.wrapS = atlas.wrapT = THREE.RepeatWrapping;
  atlas.anisotropy = 4;
  img.onload = () => { atlas.needsUpdate = true; };
  img.src = LIBERTY_TEXTURE;
  return atlas;
}

let mats = null;
/**
 * Her materials: the hull in the model's own paint, drawn from both sides as
 * the model is (its plates, rails and booms are single sheets); and her guns,
 * painted a point off the same atlas.
 */
export function libertyMaterials() {
  if (mats) return mats;
  const map = atlasTexture();
  mats = {
    hull: new THREE.MeshPhongMaterial({
      map, color: 0xffffff, specular: 0x202428, shininess: 18, side: THREE.DoubleSide,
    }),
    gun: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x30363c, shininess: 30, side: THREE.DoubleSide,
    }),
  };
  // Her paint is her own: dressShip leaves anything with a map alone, and
  // her guns are painted in their own vertex colours.
  mats.gun.userData.painted = true;
  return mats;
}

/** Add the model's hull, in its own paint, as its length-wise slices. */
export function buildLibertyHull(g) {
  const m = libertyMaterials();
  for (const geo of slices()) g.add(new THREE.Mesh(geo, m.hull));
}

const guns = new Map();
/**
 * Her 4-inch as the model drew it, decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzle are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = LIBERTY_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch || 0, roof: p.roof,
    });
  }
  return guns.get(kind);
}
