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
export const HOLE_SLOTS = 24;

// Kept to the shape of the first version of this shader, which an iPad was
// seen to run: one position a fragment, one loop that stops at the count,
// branches inside it, and nothing else -- no helper functions, no `out`
// parameters, no arctangents, no reading which face is being drawn. A later
// one did more (it worked out the wall of the hole from the line of sight)
// and an iPad's graphics went down the first time it was needed, at the
// first hole of a battle, taking the page with them. It also holds no more
// uniforms than that first version did: two arrays of HOLE_SLOTS.
const VERT_HEAD = 'varying vec3 vHolePos;';
const VERT_BODY = 'vHolePos = position;';
const FRAG_HEAD = `
varying vec3 vHolePos;
uniform vec4 uHoles[${HOLE_SLOTS}];
uniform vec4 uHoleNorm[${HOLE_SLOTS}];
uniform int uHoleN;
`;
// Only the plate that was struck: a slab as thick as the hole is wide, square
// to that plate, so the far side of her is still there. Ragged, not a disc --
// lobes of its own for every hole, seeded off where it is -- and drawn out
// along a direction of its own in the plate, so none is a circle and no two
// are alike. What is behind it is the inside of a steel box (see holeNear).
const FRAG_CUT = `
  for (int i = 0; i < ${HOLE_SLOTS}; i++) {
    if (i >= uHoleN) break;
    vec4 h = uHoles[i];
    vec3 hn = uHoleNorm[i].xyz;
    vec3 d = vHolePos - h.xyz;
    float r = abs(h.w);
    float off = dot(d, hn);
    vec3 p = d - hn * off;
    float d2 = dot(p, p);
    if (d2 < r * r * 6.0 && abs(off) < max(0.9, r * 0.6) + uHoleNorm[i].w) {
      vec3 u = p / max(sqrt(d2), 1e-3);
      float s = fract(h.x * 0.137 + h.z * 0.071 + h.y * 0.29) * 6.2832;
      float lobe = sin(u.x * 5.0 + s) * sin(u.y * 4.0 + s * 1.7) * sin(u.z * 6.0 + s * 2.3)
        + 0.45 * sin(u.x * 11.0 + u.z * 9.0 + s * 3.1) * sin(u.y * 7.0 + s * 0.6);
      vec3 ax = normalize(cross(hn, vec3(sin(s), 0.37, cos(s))) + vec3(1e-4));
      float along = dot(u, ax);
      float rr = r * (1.0 + 0.24 * lobe) * (1.0 + 0.5 * along * along);
      if (d2 < rr * rr) discard;
    }
  }
`;

let INSIDE = null;
/** The inside face of a holed plate: dark steel, unlit, fogged like everything else. */
function insideMaterial() {
  if (!INSIDE) {
    INSIDE = new THREE.MeshBasicMaterial({ color: 0x0b0a09, side: THREE.BackSide });
    INSIDE.userData.inside = true;
  }
  return INSIDE;
}

/**
 * A ray meets her plating from outside only, as it did before the insides of
 * her plates were drawn: what a layer sees down his sight, or what a click
 * lands on, is her side and not the back of the plate he is standing behind.
 */
function rayOutside(rc, out) {
  const ms = Array.isArray(this.material) ? this.material : [this.material];
  const was = ms.map((m) => m && m.side);
  for (const m of ms) if (m && m.userData && m.userData.raySide != null) m.side = m.userData.raySide;
  try { THREE.Mesh.prototype.raycast.call(this, rc, out); } finally { ms.forEach((m, i) => { if (m) m.side = was[i]; }); }
}

/**
 * The inside face of every piece of her plating: the dark of a steel box.
 *
 * Put on the whole of her the first time she is opened, not only on the
 * plates near the hole. Looked into at an angle, a hole shows the far side of
 * her and the plates fore and aft of it -- and wherever those had no inside
 * drawn, the eye went straight out through her into the sea beyond. It is one
 * plain, unlit mesh of back faces per piece, sharing her geometry, so a plate
 * taken out of her plating is taken out of its lining too.
 */
export function lineInside(meshes) {
  for (const m of meshes) {
    const mesh = m.mesh || m;
    if (!mesh || !mesh.geometry || mesh.userData.lined) continue;
    mesh.userData.lined = true;
    const inner = new THREE.Mesh(mesh.geometry, insideMaterial());
    inner.userData.inside = true;
    inner.raycast = () => {};
    inner.renderOrder = mesh.renderOrder;
    inner.castShadow = false;
    inner.receiveShadow = false;
    mesh.add(inner);
  }
}

/**
 * Give every piece of her plating its own copy of its material with the
 * holes cut in, and hand back the list they are cut from.
 */
export function holePlating(parts) {
  const U = {
    uHoles: { value: Array.from({ length: HOLE_SLOTS }, () => new THREE.Vector4()) },
    uHoleNorm: { value: Array.from({ length: HOLE_SLOTS }, () => new THREE.Vector4()) },
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
    m.customProgramCacheKey = () => `holes4|${prevKey}`;
    // Hers alone already, so nothing that wants a ship's own copy of her
    // paint (see markable in pieces.js) copies it again and loses the holes.
    m.userData = { ...(m.userData || {}), holed: true, perShip: true };
    made.set(src, m);
    return m;
  };
  // Ready, but not put on her: a plate with no hole near it is drawn with
  // her own paint as it always was. A shader that can throw a fragment away
  // turns off the trick a phone or tablet's graphics chip uses to skip
  // everything hidden behind something nearer -- on every plate it is on --
  // and drawing both faces of a plate doubles what is left. Across the whole
  // of every hull in a battle that was more than an iPad would carry, and it
  // took the picture away. So the holes go on the pieces of her plating
  // within reach of a hole, and only when there is one.
  const pieces = parts.map((p) => ({
    mesh: p.mesh || p,
    lo: Number.isFinite(p.minZ) ? p.minZ : -Infinity,
    hi: Number.isFinite(p.maxZ) ? p.maxZ : Infinity,
    holed: false,
  }));
  for (const q of pieces) {
    const mm = q.mesh.material;
    for (const m of Array.isArray(mm) ? mm : [mm]) wrap(m);
  }
  const holeNear = (z, r) => {
    const reach = r * 2.7 + 1;
    for (const q of pieces) {
      if (q.holed || z + reach < q.lo || z - reach > q.hi) continue;
      q.holed = true;
      const mesh = q.mesh;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(wrap) : wrap(mesh.material);
      mesh.raycast = rayOutside;
    }
    // And the inside of all of her, seen through it: the dark of a steel box
    // rather than the sea beyond her. See lineInside.
    lineInside(pieces);
  };
  return {
    U,
    list: [],
    /** Her plating's holed materials, each with a geometry it is drawn on, for compiling ahead. */
    warm: pieces.flatMap((q) => {
      const mm = q.mesh.material;
      return (Array.isArray(mm) ? mm : [mm]).map((m) => [q.mesh.geometry, made.get(m) || m]);
    }),
    /**
     * A hole at (x, y, z) in her plating's own frame, `r` across the middle,
     * in a plate facing (nx, ny, nz) that is `thick` metres of steel.
     */
    add(x, y, z, r, nx = 0, ny = 1, nz = 0, thick = 0.02) {
      const list = this.list;
      const l = Math.hypot(nx, ny, nz) || 1;
      list.push([x, y, z, r, nx / l, ny / l, nz / l, thick]);
      holeNear(z, r);
      const n = Math.min(list.length, HOLE_SLOTS);
      const from = list.length - n;
      for (let i = 0; i < n; i++) {
        const h = list[from + i];
        U.uHoles.value[i].set(h[0], h[1], h[2], h[3]);
        U.uHoleNorm.value[i].set(h[4], h[5], h[6], h[7]);
      }
      U.uHoleN.value = n;
      // Past what the shaders hold, the oldest hole is handed back for the
      // caller to take out of her the old way, so it does not close up.
      return list.length > HOLE_SLOTS ? list[from - 1] : null;
    },
  };
}
