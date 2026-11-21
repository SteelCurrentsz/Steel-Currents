// The town's modelled pieces -- the traffic, the trees, the landmark and the
// everyday buildings, the harbour's cranes, the airfield's hangars and the
// barracks huts -- made with Meshy and packed by build/prepare-town.mjs, as
// the renderers that draw them in place of their own box-built ones want
// them.
import * as THREE from '../../../vendor/three.module.js';
import { TOWN_MODELS } from './townModels.data.js';

// Colours are packed as paint is seen, and drawn as linear light.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const TOWN = new Map();

const bytesOf = (b64) => (typeof atob === 'function'
  ? Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
  : new Uint8Array(Buffer.from(b64, 'base64')));

/** The kinds of thing there is a model of. */
export const townKinds = () => Object.keys(TOWN_MODELS);

/**
 * One of them decoded, once, and the box it stands in. A building carries its
 * own texture, with its corners' places in it and their normals (`textured`;
 * see `textured` in build/prepare-town.mjs); everything else is painted a
 * colour at each corner, packed as `pack` in build/glbkit.mjs packs.
 */
export function townModel(k) {
  if (TOWN.has(k)) return TOWN.get(k);
  const src = TOWN_MODELS[k];
  if (!src) { TOWN.set(k, null); return null; }
  if (typeof src === 'object') {
    const m = texturedModel(src);
    TOWN.set(k, m);
    return m;
  }
  const b64 = src;
  const bin = bytesOf(b64);
  const buf = bin.buffer;
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
  const m = {
    pos, colour, idx, lo, hi,
    /** As a mesh of its own, its normals smoothed across its welded corners. */
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
      g.setAttribute('color', new THREE.BufferAttribute(colour.slice(), 3));
      g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    },
  };
  TOWN.set(k, m);
  return m;
}

function texturedModel(src) {
  const buf = bytesOf(src.mesh).buffer;
  const head = new Float32Array(buf, 0, 12);
  const n = head[0];
  const ni = head[1];
  const lo = Array.from(head.subarray(2, 5));
  const hi = Array.from(head.subarray(5, 8));
  const ulo = head.subarray(8, 10);
  const uhi = head.subarray(10, 12);
  let o = 48;
  const q = new Uint16Array(buf.slice(o, o + n * 6));
  o += n * 6;
  const qu = new Uint16Array(buf.slice(o, o + n * 4));
  o += n * 4;
  const qn = new Int8Array(buf.slice(o, o + n * 3));
  o += n * 3;
  o += (4 - (o % 4)) % 4;
  const idx = n > 65535 ? new Uint32Array(buf.slice(o, o + ni * 4)) : new Uint16Array(buf.slice(o, o + ni * 2));
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = lo[i % 3] + (q[i] / 65535) * (hi[i % 3] - lo[i % 3]);
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) uv[i] = ulo[i % 2] + (qu[i] / 65535) * (uhi[i % 2] - ulo[i % 2]);
  const nrm = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) nrm[i] = qn[i] / 127;
  let tex = null;
  return {
    textured: true, pos, uv, nrm, idx, lo, hi,
    /** Its texture, loaded the first time it is asked for; null with no page to load it into. */
    texture() {
      if (tex || typeof document === 'undefined') return tex;
      tex = new THREE.TextureLoader().load(`data:image/jpeg;base64,${src.tex}`);
      // As glTF has it: the texture's first row at v = 0.
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    },
  };
}
