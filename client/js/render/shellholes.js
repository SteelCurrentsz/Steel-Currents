// Shell holes, cut in her plating where they are and as big as they are.
//
// Her plating can be taken away triangle by triangle (see plating.js), and
// that is what a torpedo or a collision does to her. But a shell hole is a
// metre or two across, and the plating of a long hull is cut into tall thin
// strips: taking out the strips a hole of that size touches leaves a slit,
// not a hole. So a shell hole is cut in the shader instead. Each ship keeps a
// short list of holes -- a point in her own frame and a radius -- and her
// plating is simply not drawn inside any of them: round, a little ragged at
// the edge, any size at all, with her frames and her machinery showing through
// (see interior.js). It costs no geometry and no extra draw calls.
//
// The materials are her own copies, so one ship's holes are not cut in
// another ship of the same class.

import * as THREE from '../../../vendor/three.module.js';
import { cloneMaterial } from './sever.js';

/** How many holes a ship carries in her shaders before the oldest are made the old way. */
export const HOLE_SLOTS = 48;

const VERT_HEAD = 'varying vec3 vHolePos;';
const VERT_BODY = 'vHolePos = position;';
const FRAG_HEAD = `
varying vec3 vHolePos;
uniform vec4 uHoles[${HOLE_SLOTS}];
uniform int uHoleN;
`;
// Ragged, not a disc: the radius wanders with the direction from the middle,
// in a few smooth lobes of its own for every hole (its seed is the hole's own
// position), so no two holes are the same shape and none is a circle.
const FRAG_CUT = `
  for (int i = 0; i < ${HOLE_SLOTS}; i++) {
    if (i >= uHoleN) break;
    vec4 h = uHoles[i];
    vec3 d = vHolePos - h.xyz;
    float r = abs(h.w);
    float d2 = dot(d, d);
    if (d2 < r * r * 1.7) {
      vec3 n = d / max(sqrt(d2), 1e-3);
      float s = fract(h.x * 0.137 + h.z * 0.071 + h.y * 0.29) * 6.2832;
      float lobe = sin(n.x * 5.0 + s) * sin(n.y * 4.0 + s * 1.7) * sin(n.z * 6.0 + s * 2.3);
      float rr = r * (1.0 + 0.28 * lobe);
      if (d2 < rr * rr) discard;
    }
  }
`;

/**
 * Give every piece of her plating its own copy of its material with the
 * holes cut in, and hand back the list they are cut from.
 */
export function holePlating(meshes) {
  const U = {
    uHoles: { value: Array.from({ length: HOLE_SLOTS }, () => new THREE.Vector4()) },
    uHoleN: { value: 0 },
  };
  const made = new Map();
  const wrap = (src) => {
    if (!src || src.isShaderMaterial || src.isRawShaderMaterial) return src;
    if (made.has(src)) return made.get(src);
    const m = cloneMaterial(src);
    const prev = src.onBeforeCompile;
    const prevKey = src.customProgramCacheKey ? src.customProgramCacheKey() : '';
    m.onBeforeCompile = (shader, renderer) => {
      if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(m, shader, renderer);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
        .replace(/void main\(\) \{/, `void main() {\n${FRAG_CUT}`);
    };
    m.customProgramCacheKey = () => `holes|${prevKey}`;
    // Hers alone already, so nothing that wants a ship's own copy of her
    // paint (see markable in pieces.js) copies it again and loses the holes.
    m.userData = { ...(m.userData || {}), holed: true, perShip: true };
    made.set(src, m);
    return m;
  };
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(wrap) : wrap(mesh.material);
  }
  return {
    U,
    list: [],
    /** A hole at (x, y, z) in her plating's own frame, `r` across the middle. */
    add(x, y, z, r) {
      const list = this.list;
      list.push([x, y, z, r]);
      const n = Math.min(list.length, HOLE_SLOTS);
      const from = list.length - n;
      for (let i = 0; i < n; i++) U.uHoles.value[i].set(...list[from + i]);
      U.uHoleN.value = n;
      // Past what the shaders hold, the oldest hole is handed back for the
      // caller to take out of her the old way, so it does not close up.
      return list.length > HOLE_SLOTS ? list[from - 1] : null;
    },
  };
}
