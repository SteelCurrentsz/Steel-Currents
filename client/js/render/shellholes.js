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

const VERT_HEAD = 'varying vec3 vHolePos; varying vec3 vHoleView;';
// Where the fragment is and which way it is being looked at, both in her
// plating's own frame (a direction multiplied on the left of the model matrix
// is that direction carried back into the model's frame).
const VERT_BODY = `vHolePos = position;
vHoleView = (vec4((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition, 0.0) * modelMatrix).xyz;`;
const FRAG_HEAD = `
varying vec3 vHolePos;
varying vec3 vHoleView;
uniform vec4 uHoles[${HOLE_SLOTS}];
uniform vec4 uHoleNorm[${HOLE_SLOTS}];
uniform int uHoleN;
float holeEdge(vec3 d, vec3 n, vec4 h, out float rr) {
  // Measured across the plate, not through it: the outline is in her plating.
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);
  float s = fract(sin(dot(h.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float s2 = fract(s * 7.31 + 0.17);
  float s3 = fract(s * 13.7 + 0.53);
  float u = dot(d, t1), v = dot(d, t2);
  float r = abs(h.w);
  // Off-centre and drawn out one way: a shell comes in at a slant and the
  // plate tears along its grain.
  float ang = s * 6.2832;
  vec2 ax = vec2(cos(ang), sin(ang));
  vec2 q = vec2(u, v) - ax * r * (0.18 * s2);
  float el = 1.0 + 0.55 * s3;
  vec2 e = vec2(dot(q, ax) / el, dot(q, vec2(-ax.y, ax.x)) * (0.85 + 0.15 * s2));
  float th = atan(e.y, e.x);
  // Torn, not cut: big uneven lobes, smaller bites and a jagged lip.
  float w = 0.20 * sin(2.0 * th + s * 11.0) + 0.16 * sin(3.0 * th + s2 * 17.0)
          + 0.09 * sin(5.0 * th + s3 * 23.0) + 0.06 * sin(9.0 * th + s * 31.0)
          + 0.035 * sin(17.0 * th + s2 * 41.0) + 0.02 * sin(29.0 * th + s3 * 7.0);
  rr = r * (1.0 + w);
  return length(e);
}
`;
// Where a hole is, her plating is not drawn -- but only in the plate that was
// struck (a slab as thick as the hole is wide, square to that plate), so the
// far side of her is still there. And the plate is as thick as her armour is
// at that point: looked into at a slant, the wall of the hole is seen, bare
// torn steel down to the inside of the plate. Behind the plating everything is
// the dark inside of a steel box, never the sea on the other side.
const FRAG_CUT = `
  bool holeWall = false;
  float holeDeep = 0.0;
  for (int i = 0; i < ${HOLE_SLOTS}; i++) {
    if (i >= uHoleN) break;
    vec4 h = uHoles[i];
    vec3 d = vHolePos - h.xyz;
    float r = abs(h.w);
    // (The outline reaches out to about two and a half times r at most.)
    if (dot(d, d) > r * r * 7.0) continue;
    vec4 nh = uHoleNorm[i];
    vec3 n = nh.xyz;
    float off = dot(d, n);
    if (abs(off) > max(0.9, r * 0.6) + nh.w) continue;
    float rr;
    float at = holeEdge(d - n * off, n, h, rr);
    if (at >= rr) continue;
    // Inside the outline. Down through the plate along the line of sight:
    // still inside the outline at the back of the plate, it is open; out of
    // it before then, that is the wall of the hole that is being seen.
    vec3 V = normalize(vHoleView);
    float into = -dot(V, n);
    if (into > 0.03 && nh.w > 0.0) {
      float run = (nh.w + off) / into;
      vec3 b = d + V * run;
      float rb;
      float atb = holeEdge(b - n * dot(b, n), n, h, rb);
      if (atb >= rb) { holeWall = true; holeDeep = clamp((rr - at) / max(rr - at + atb - rb, 1e-4), 0.0, 1.0); continue; }
    }
    discard;
  }
`;
// Bare torn steel for the wall of a hole. (The dark of her insides, seen
// through it, is the inner face drawn on its own: see holeNear.)
const FRAG_SHADE = `
  if (holeWall) gl_FragColor.rgb = mix(vec3(0.075, 0.07, 0.064), vec3(0.012, 0.011, 0.010), holeDeep) * (0.6 + 0.4 * gl_FragColor.g / max(diffuseColor.g, 0.05));
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
        .replace(/void main\(\) \{/, `void main() {\n${FRAG_CUT}`)
        .replace('#include <tonemapping_fragment>', `${FRAG_SHADE}\n#include <tonemapping_fragment>`);
    };
    m.customProgramCacheKey = () => `holes3|${prevKey}`;
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
      // And the inside of those plates, seen through a hole: the dark of a
      // steel box rather than the sea beyond her. Its own plain, unlit mesh
      // of the back faces only, which costs a phone next to nothing -- the
      // plating's own shader drawing both faces cost it twice the plating.
      const inner = new THREE.Mesh(mesh.geometry, insideMaterial());
      inner.userData.inside = true;
      inner.raycast = () => {};
      inner.renderOrder = mesh.renderOrder;
      mesh.add(inner);
    }
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
