// The machinery and fittings of a warship's inside -- her boilers, turbines,
// turbo-generators, shell racks, steering gear and bunks -- made with Meshy
// and packed by build/prepare-interior.mjs, as interior.js fits them into the
// rooms each hull has for them.
import * as THREE from '../../../vendor/three.module.js';
import { INTERIOR_MODELS } from './interiorModels.data.js';

// Colours are packed as paint is seen, and drawn as linear light.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const bytesOf = (b64) => (typeof atob === 'function'
  ? Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
  : new Uint8Array(Buffer.from(b64, 'base64')));

const MODELS = new Map();

/**
 * One of them decoded, once: `geometry` (painted at its corners, normals
 * smoothed, standing on y = 0 and centred on x and z) and `size`, its extent
 * along each axis. Null if there is no model of that kind. The geometry is
 * shared by every ship that has one: the weld only reads it.
 */
export function interiorModel(kind) {
  if (MODELS.has(kind)) return MODELS.get(kind);
  const src = INTERIOR_MODELS[kind];
  if (!src) { MODELS.set(kind, null); return null; }
  const buf = bytesOf(src).buffer;
  const head = new Float32Array(buf, 0, 8);
  const n = head[0];
  const ni = head[1];
  const lo = Array.from(head.subarray(2, 5));
  const hi = Array.from(head.subarray(5, 8));
  let o = 32;
  const q = new Uint16Array(buf.slice(o, o + n * 6));
  o += n * 6;
  const bytes = new Uint8Array(buf.slice(o, o + n * 3));
  o += n * 3;
  o += (4 - (o % 4)) % 4;
  const idx = n > 65535 ? new Uint32Array(buf.slice(o, o + ni * 4)) : new Uint16Array(buf.slice(o, o + ni * 2));
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = lo[i % 3] + (q[i] / 65535) * (hi[i % 3] - lo[i % 3]);
  const colour = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) colour[i] = lin(bytes[i] / 255);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const m = { geometry, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
  MODELS.set(kind, m);
  return m;
}
