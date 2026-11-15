// The light cruiser Cesare Borgia's hull and superstructure: the owner's model
// of her, painted in the colours it was textured in -- her grey and her
// forecastle's and quarterdeck's red and white stripes -- and her guns -- her
// 152 mm triples, her 75 mm dual-purpose guns, her 37 mm twins and her banks
// of tubes -- as the model drew each.
//
// build/prepare-borgia-hull.mjs reads the model as the owner uploaded it --
// "Italian Light Cruiser Cesare Borgia(Plan B) -T10" by 全斗焕
// (https://skfb.ly/prA87), under Creative Commons Attribution 4.0, credited
// on the Credits screen -- brings it up to her size, paints every face the
// colour of the texture under it, paints her bottom one colour under her
// waterline, lifts her guns, her tubes and her screws out of her mounting by
// mounting, and keeps every triangle of what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
import * as THREE from '../../../vendor/three.module.js';
import {
  BORGIA_HULL_B64, BORGIA_SURFACE, BORGIA_GUNS, BORGIA_MOUNTS, BORGIA_LINES,
} from './borgiaHull.data.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { steelMap, woodMap, finish } from './textures.js';

/**
 * A geometry's texture coordinates box-projected face by face, in metres: each
 * face takes the projection of the way it itself mostly looks -- down on a
 * deck, athwartships on her side, fore and aft on a bulkhead -- and a point
 * shared by faces that look different ways is drawn once for each. Projected
 * point by point instead, off each point's own normal, the faces of anything
 * round -- her barbettes, her bridge, her funnels, a gunhouse's cheeks -- have
 * corners either side of the line between two projections, and the plating
 * drawn over them smears into a sawtooth of light and dark faces.
 */
export function faceProjected(g) {
  const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
  const col = g.attributes.color ? g.attributes.color.array : null;
  const idx = g.index.array;
  const nv = pos.length / 3;
  const P = Array.from(pos), N = Array.from(nrm), C = col ? Array.from(col) : null;
  const axis = new Int8Array(nv).fill(-1);
  const twin = new Map();
  const I = new Array(idx.length);
  const A = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    // As the fleet's projection reads it: up first, then athwartships.
    const ax = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      if (axis[v] < 0) { axis[v] = ax; A[v] = ax; I[t + k] = v; continue; }
      if (axis[v] === ax) { I[t + k] = v; continue; }
      const key = v * 3 + ax;
      let w = twin.get(key);
      if (w === undefined) {
        w = P.length / 3;
        twin.set(key, w);
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        N.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        if (C) C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
        A[w] = ax;
      }
      I[t + k] = w;
    }
  }
  const n = P.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const ax = A[i] ?? 1;
    if (ax === 1) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax === 0) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(P), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(N), 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(Uint8Array.from(C), 3, true));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(n > 65535 ? Uint32Array.from(I) : Uint16Array.from(I), 1));
  out.userData = { ...g.userData, faceUv: true };
  g.dispose();
  return out;
}

let cached = null;
function slices() {
  if (!cached) cached = decodeSlices(BORGIA_HULL_B64).map(faceProjected);
  return cached;
}

const surface = surfaceOf(BORGIA_SURFACE);

/** Height of her surface at (x, z), or -99 off her. */
export const borgiaSurfaceY = surface.surfaceY;

/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const borgiaSeatY = surface.seatY;

/** Where every one of her mountings stands: see prepare-borgia-hull.mjs. */
export const MOUNT_SEATS = BORGIA_MOUNTS;

/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = BORGIA_LINES;

let mats = null;
export function borgiaMaterials() {
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
export function buildBorgiaHull(g) {
  const m = borgiaMaterials();
  for (const geo of slices()) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'main' her 152 mm triple, 'dp' her
 * 75 mm in its round shield, 'dp2' her 75 mm in its open-backed shield, 'aa'
 * her 37 mm twin, 'tubes0' and 'tubes1' her port and starboard banks --
 * decoded once, in the frame of its mounting: the pivot at the origin, the
 * foot of what trains at y = 0, the bore along +Z; and where its trunnions
 * and muzzles are.
 */
export function gunPiece(kind) {
  if (!guns.has(kind)) {
    const p = BORGIA_GUNS[kind];
    guns.set(kind, {
      house: faceProjected(decodePiece(p.house)), guns: p.guns ? faceProjected(decodePiece(p.guns)) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
    });
  }
  return guns.get(kind);
}
