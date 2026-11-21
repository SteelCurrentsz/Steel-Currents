// An atomic burst, as it is seen.
//
// Two different things, depending on what it went off on:
//
//   On the sea, Baker: the flash, and then a column of water half a mile
//   across thrown a mile into the air with a cauliflower head of spray on it,
//   wrapped for a few seconds in the smooth white cap of the condensation
//   cloud the shock leaves behind it -- and when the column falls back, the
//   base surge rolling out across the sea from the foot of it.
//
//   On the ground: the fireball climbing into the cap of the mushroom, the
//   cap rolling over itself the way a vortex ring does and burning inside for
//   well over a minute and hanging for minutes after, the stem drawn up into it with fire still in
//   it, the white collar of condensation round the stem, and the dust of the
//   base surge going out along the ground.
//
// And in both the shock itself: a shell of compressed air racing out at many
// times the speed of sound, seen as what it is -- everything behind it bent
// and shimmering through it (see renderShock) -- with a skin of condensation
// flashing on it in the first instant. Its foot on the water is drawn by the
// sea itself (burstMarks in ocean.js), and the wave that follows is the sea
// itself too (burstSwell): neither is a mesh laid on the water.
//
// The mushroom is one solid surface (see Nukes.cloud and CLOUD_VERT): the
// outline of a cap rolled over on itself, a stem and a skirt, turned about
// the stem and pushed in and out by a cauliflower noise fixed to it -- so it
// keeps its shape as it rises and grows, the way the real thing does, rather
// than being a heap of separate puffs. Only what is soft about a burst --
// the collar round the stem, the dust or spray of the shock and the base
// surge -- is drawn as billows of mist.
//
// Everything is made once for the battle and compiled before the bomb goes
// (see warm): nothing about a burst compiles a shader or brings a light into
// the scene in the frame it goes off.
import * as THREE from '../../../vendor/three.module.js';
import { NUKE, nukeFront } from '../../../shared/nuke.js';

// ---------------------------------------------------------------- textures

/**
 * A tileable noise, four channels of it: the billows' lumps, the bend of
 * their surface, and the boil in the fireball. Made once, in numbers, so it
 * needs no canvas.
 */
let NOISE = null;
function noiseTexture() {
  if (NOISE) return NOISE;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const lattice = (seed, P) => {
    const g = new Float32Array(P * P);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      g[i] = s / 4294967296;
    }
    return g;
  };
  const fbm = (seed) => {
    const out = new Float32Array(N * N);
    let amp = 0.5, total = 0;
    for (let o = 0; o < 5; o++) {
      const P = 4 << o;
      const g = lattice(seed + o * 7919, P);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * P, fy = (y / N) * P;
          const ix = Math.floor(fx), iy = Math.floor(fy);
          let ux = fx - ix, uy = fy - iy;
          ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
          const a = g[(iy % P) * P + (ix % P)], b = g[(iy % P) * P + ((ix + 1) % P)];
          const c = g[((iy + 1) % P) * P + (ix % P)], d = g[((iy + 1) % P) * P + ((ix + 1) % P)];
          out[y * N + x] += amp * ((a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy);
        }
      }
      total += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  };
  const ch = [fbm(11), fbm(23), fbm(37), fbm(53)];
  for (let i = 0; i < N * N; i++) {
    for (let c = 0; c < 4; c++) {
      // Stretched out of the middle, where the sum of octaves crowds.
      const v = Math.min(1, Math.max(0, (ch[c][i] - 0.5) * 1.9 + 0.5));
      data[i * 4 + c] = Math.round(v * 255);
    }
  }
  NOISE = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping;
  NOISE.magFilter = THREE.LinearFilter;
  NOISE.minFilter = THREE.LinearMipmapLinearFilter;
  NOISE.generateMipmaps = true;
  NOISE.needsUpdate = true;
  return NOISE;
}

/** A soft round glow, for the flash: made once, on a canvas. */
let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  GLOW = new THREE.CanvasTexture(c);
  GLOW.colorSpace = THREE.SRGBColorSpace;
  return GLOW;
}

// ------------------------------------------------------------------ shapes

/**
 * The condensation cloud the shock leaves behind it: the great white dome of
 * Baker, standing on the sea over the whole burst, its foot a bright flat
 * skirt of spray and fog spread out on the water where the shock first struck
 * it. A lathe of this profile, from the skirt's inner edge out along the
 * water and up over the top.
 */
const WILSON = [
  [0.0, 0.0], [0.4, 0.0], [0.8, 0.0], [1.0, 0.0], [1.08, 0.004], [1.07, 0.03], [1.02, 0.08],
  [0.99, 0.18], [0.95, 0.32], [0.88, 0.47], [0.77, 0.61], [0.61, 0.73],
  [0.42, 0.82], [0.21, 0.87], [0.0, 0.89],
];

let SHAPES = null;
function shapes() {
  if (SHAPES) return SHAPES;
  SHAPES = {
    ball: new THREE.SphereGeometry(1, 48, 32),
    shell: new THREE.SphereGeometry(1, 72, 36, 0, Math.PI * 2, 0, Math.PI * 0.62),
    wilson: new THREE.LatheGeometry(WILSON.map(([x, y]) => new THREE.Vector2(x, y)), 72),
    card: new THREE.PlaneGeometry(1, 1),
  };
  for (const g of Object.values(SHAPES)) g.userData.shared = true;
  return SHAPES;
}

// ----------------------------------------------------------------- shaders

const BILLOW_VERT = /* glsl */`
attribute vec4 at;     // centre, radius
attribute vec4 tint;   // whiteness, heat, dissolve, seed
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec4 vTint;
varying vec3 vCentre;
varying float vRad;
varying vec3 vSun;
varying vec3 vUp;
#include <fog_pars_vertex>
void main() {
  vUv = position.xy * 2.0;
  vTint = tint;
  vRad = at.w;
  vec4 c = modelViewMatrix * vec4(at.xyz, 1.0);
  vCentre = c.xyz;
  vec4 mvPosition = c;
  // Out a little past the sphere, for the lumps on its rim.
  mvPosition.xy += position.xy * at.w * 2.3;
  vSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const BILLOW_FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform mat4 projectionMatrix;
uniform vec3 uSun;        // the sun's light, as bright as it is
uniform vec3 uSky;        // the sky's, from above
uniform vec3 uGround;     // and off the sea or the ground, from below
uniform vec3 uDirt;       // what colour the cloud is where it is not white
uniform vec3 uFire;       // the fire inside it
uniform vec4 uFireAt;     // where the fireball is, in view space, and how bright
uniform float uTime;
varying vec2 vUv;
varying vec4 vTint;
varying vec3 vCentre;
varying float vRad;
varying vec3 vSun;
varying vec3 vUp;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 p = vUv * 1.15;
  float r2 = dot(p, p);
  // More lumps on a bigger billow: a cauliflower is lumpy at every size.
  vec2 nuv = p * 0.3 * clamp(sqrt(vRad / 110.0), 0.8, 2.6) + vTint.w * vec2(3.17, 7.31)
    + vec2(uTime * 0.003, -uTime * 0.002);
  vec4 n1 = texture2D(uNoise, nuv);
  vec4 n2 = texture2D(uNoise, nuv * 3.1 + 0.37);
  vec4 n3 = texture2D(uNoise, nuv * 8.3 + 0.71);
  float bump = n1.r * 0.5 + n2.r * 0.32 + n3.r * 0.18;
  // The rim, lumpy: a billow is made of smaller billows, and those of
  // smaller ones still.
  // (Filled out nearly to the card's circle: a billow pressed into the ones
  // round it, not a ball with a gap round it.)
  float rim = 1.12 - 0.5 * bump;
  if (r2 > rim) discard;
#ifdef SOFT
  // Mist: soft to its edge and thinning out as it goes, not torn.
  float alpha = (1.0 - smoothstep(rim * 0.35, rim, r2)) * (1.0 - vTint.z) * (0.55 + 0.45 * bump);
  if (alpha < 0.01) discard;
#else
  // Torn up as it thins out and goes.
  if (vTint.z > 0.0 && bump * 0.9 + n2.g * 0.1 < vTint.z * 1.08 - 0.04) discard;
#endif
  float h = sqrt(max(0.0, 1.0 - r2 / rim));
  vec3 n = normalize(vec3(p, h) + vec3(n1.g - 0.5, n1.b - 0.5, 0.0) * 1.3
    + vec3(n2.g - 0.5, n2.b - 0.5, 0.0) * 0.9 + vec3(n3.g - 0.5, n3.b - 0.5, 0.0) * 0.3);
  // Its own surface, where it is, so one billow stands into the next.
  vec3 pv = vCentre + vec3(p * vRad, h * vRad);
#ifndef SOFT
  vec4 clip = projectionMatrix * vec4(pv, 1.0);
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
#endif

  // Lit: the sun wrapped round it (a cloud is lit through its edges), the
  // sky from above and the sea or the ground from below, dark in its folds.
  float sd = dot(n, vSun);
  float sun = clamp(sd * 0.62 + 0.38, 0.0, 1.0);
  float up = dot(n, vUp);
  float fold = mix(0.68, 1.0, smoothstep(0.2, 0.7, bump)) * mix(0.82, 1.0, h);
  vec3 alb = mix(uDirt, vec3(0.97), vTint.x);
  vec3 light = uSun * sun + mix(uGround, uSky, up * 0.5 + 0.5) * 1.15;
  // Brighter than a hull's paint is lit: a cloud of spray or condensation
  // scatters the light back out of all of it, not off one surface.
  vec3 col = alb * light * fold * 0.62;
  // The fireball under the cap lights the belly of it.
  vec3 tf = uFireAt.xyz - pv;
  float df = length(tf);
  float lf = max(0.0, dot(n, tf / max(df, 1.0))) * uFireAt.w / (1.0 + df * df * 2.5e-7);
  col += alb * uFire * lf * fold;
  // And the fire in it: in its folds and hollows, boiling.
  float heat = vTint.y * smoothstep(0.1, 0.8, (1.0 - bump) * 0.7 + n2.a * 0.6);
  vec3 flame = uFire * (1.1 + 1.6 * n1.a);
  col = mix(col, flame, clamp(heat * 0.9, 0.0, 0.9));
  col += uFire * heat * heat * 1.3;
#ifdef SOFT
  gl_FragColor = vec4(col, alpha);
#else
  gl_FragColor = vec4(col, 1.0);
#endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const FIRE_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vL = position;
  gl_Position = projectionMatrix * mv;
}
`;

const FIRE_FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform float uCool;      // 0 the instant it goes, 1 burnt down to a glow
uniform float uTime;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
vec3 ramp(float t) {
  vec3 a = vec3(1.0, 1.0, 0.95);
  vec3 b = vec3(1.0, 0.86, 0.45);
  vec3 c = vec3(1.0, 0.5, 0.12);
  vec3 d = vec3(0.7, 0.16, 0.04);
  vec3 e = vec3(0.12, 0.05, 0.03);
  if (t < 0.25) return mix(a, b, t / 0.25);
  if (t < 0.5) return mix(b, c, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c, d, (t - 0.5) / 0.25);
  return mix(d, e, (t - 0.75) / 0.25);
}
void main() {
  float face = abs(dot(normalize(vN), normalize(vV)));
  vec2 uv = vec2(atan(vL.z, vL.x) * 0.159 + 0.5, vL.y * 0.5 + 0.5);
  float n = texture2D(uNoise, uv * vec2(3.0, 1.6) + vec2(uTime * 0.02, -uTime * 0.05)).r * 0.6
          + texture2D(uNoise, uv * vec2(7.0, 4.0) - vec2(uTime * 0.04, uTime * 0.09)).g * 0.4;
  // Hottest in the middle of it as it is seen, cooler and darker at its limb,
  // and the boil of it showing through as it cools.
  float t = clamp(uCool * 0.85 + (1.0 - face) * 0.35 + (n - 0.5) * (0.25 + 0.6 * uCool), 0.0, 1.0);
  vec3 col = ramp(t) * (1.0 + 7.0 * (1.0 - uCool) * (1.0 - uCool));
  gl_FragColor = vec4(col, uOpacity * smoothstep(0.0, 0.35, face + 0.15));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const WILSON_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mvPosition.xyz;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WILSON_FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uLit;
uniform float uOpacity;
uniform float uTime;
uniform vec3 uShape;     // x: the water's height, y: the dome's radius, z: how far its top has thinned

varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
void main() {
  // A skin of fog: thickest seen edge-on, which is where a line of sight
  // passes through most of it.
  float face = abs(dot(normalize(vN), normalize(vV)));
  float n = texture2D(uNoise, vW.xz * 0.00045 + vW.y * 0.0003 + uTime * 0.004).r * 0.65
          + texture2D(uNoise, vW.xz * 0.0019 - uTime * 0.007).g * 0.35;
  float a = uOpacity * (0.4 + 0.35 * (1.0 - face)) * smoothstep(0.18, 0.62, n + uOpacity * 0.25);
  // Torn at its outline: never the clean edge of a glass bowl, but fog
  // thinning out in rags where the eye looks along it.
  float rag = texture2D(uNoise, vW.xz * 0.0008 + vW.y * 0.0011 - uTime * 0.01).a;
  a *= smoothstep(0.0, 0.45, face + (rag - 0.5) * 0.7);
  // How high up it this is, 0 at the water and 0.89 at the top.
  float h = (vW.y - uShape.x) / max(1.0, uShape.y);
  // It clears from the top down, so the head of the column shows through it
  // while its sides and its foot are still a wall of white.
  a *= 1.0 - uShape.z * smoothstep(0.25, 0.85, h);
  // The skirt: flat on the sea, dense and bright, and torn at its edge.
  float skirt = (1.0 - smoothstep(0.0, 0.07, h));
  float lip = texture2D(uNoise, vW.xz * 0.0011 + uTime * 0.003).b;
  a = max(a, uOpacity * skirt * smoothstep(0.25, 0.6, lip + 0.2) * 0.95);
  gl_FragColor = vec4(uLit * (0.85 + 0.3 * n + 0.25 * skirt), clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// The mushroom itself: one closed surface, a lathe of the cloud's outline
// (see Nukes.cloud) turned about its stem, every point of it pushed out or
// in by a cauliflower noise that is fixed to the cloud -- so it grows and
// rises as one thing, its lumps staying where they are on it, and does not
// boil away into loose puffs. The outline is handed over each frame as a
// small texture: radius, height, distance along the outline from the crown
// down, and how hard it is lumped; then how hot it is there and how white.
const SIMPLEX3 = /* glsl */`
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// Cauliflower: the absolute of each octave is a round head with a sharp fold
// between it and the next, and the heads are made of smaller heads. Two
// octaves on the mesh (finer than that is finer than the mesh, and facets); the finer folds are the fragment shader's.
float billow(vec3 q) {
  float s = 0.0, a = 0.66;
  for (int o = 0; o < 2; o++) {
    s += a * abs(snoise(q));
    q = q * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.42;
  }
  return s;
}
`;

const CLOUD_VERT = /* glsl */`
attribute vec2 ia;            // which point of the outline, and the angle round
uniform sampler2D uProf;
uniform float uNP;
uniform float uL;             // the size of its biggest lumps, metres
uniform float uDrift;         // how far its surface has rolled, metres
varying vec3 vN;
varying vec3 vW;
varying vec3 vQ;
varying float vLump;
varying float vHeat;
varying float vWhite;
#include <fog_pars_vertex>
${SIMPLEX3}
vec4 prof(float fi, float row) {
  fi = clamp(fi, 0.0, uNP - 1.0);
  float i0 = floor(fi);
  float i1 = min(i0 + 1.0, uNP - 1.0);
  return mix(texture2D(uProf, vec2((i0 + 0.5) / uNP, row)),
    texture2D(uProf, vec2((i1 + 0.5) / uNP, row)), fi - i0);
}
float lumpAt;
vec3 place(float fi, float a) {
  vec4 p = prof(fi, 0.25);
  vec4 b = prof(fi - 0.5, 0.25), c = prof(fi + 0.5, 0.25);
  vec2 o = normalize(vec2(-(c.y - b.y), c.x - b.x) + vec2(1e-5, 0.0));
  float ca = cos(a), sa = sin(a);
  vec3 q = vec3(ca * max(p.x, 1.0), sa * max(p.x, 1.0), p.z + uDrift) / uL;
  lumpAt = billow(q);
  return vec3(ca * (p.x + o.x * (lumpAt - 0.3) * p.w), p.y + o.y * (lumpAt - 0.3) * p.w,
    sa * (p.x + o.x * (lumpAt - 0.3) * p.w));
}
void main() {
  float fi = ia.x, a = ia.y;
  vec3 p0 = place(fi, a);
  float l0 = lumpAt;
  vec4 p = prof(fi, 0.25);
  // Across the lumps, for which way the surface faces.
  float da = clamp(uL * 0.12 / max(p.x, 1.0), 0.002, 0.08);
  vec3 p1 = place(fi, a + da);
  vec3 p2 = place(fi + 0.35, a);
  vec3 p3 = place(fi - 0.35, a);
  vec3 n = normalize(cross(p2 - p3, p1 - p0));
  vec2 o = normalize(vec2(-(prof(fi + 0.5, 0.25).y - prof(fi - 0.5, 0.25).y),
    prof(fi + 0.5, 0.25).x - prof(fi - 0.5, 0.25).x) + vec2(1e-5, 0.0));
  vec3 out3 = vec3(cos(a) * o.x, o.y, sin(a) * o.x);
  if (dot(n, out3) < 0.0) n = -n;
  vec4 h = prof(fi, 0.75);
  vHeat = h.x;
  vWhite = h.y;
  vLump = clamp(l0 * 1.7, 0.0, 1.0);
  vQ = vec3(cos(a) * max(p.x, 1.0), sin(a) * max(p.x, 1.0), p.z + uDrift) / uL;
  vec4 w = modelMatrix * vec4(p0, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const CLOUD_FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uDirt;
uniform vec3 uFire;
uniform vec4 uFireAt;     // the fireball, in the world, and how bright
uniform float uGone;      // 0 whole, 1 dispersed
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying vec3 vQ;
varying float vLump;
varying float vHeat;
varying float vWhite;
#include <common>
#include <fog_pars_fragment>
void main() {
  // The finer folds, off the noise texture laid on it three ways.
  vec3 an = abs(normalize(vN));
  an /= (an.x + an.y + an.z);
  vec3 f = vQ * 2.7;
  vec4 nx = texture2D(uNoise, f.yz + vec2(0.0, uTime * 0.002));
  vec4 ny = texture2D(uNoise, f.xz);
  vec4 nz = texture2D(uNoise, f.xy + vec2(uTime * 0.002, 0.0));
  vec4 fine = nx * an.x + ny * an.y + nz * an.z;
  // Thinning out at the end from its folds, its heads going last.
  if (uGone > 0.0 && vLump * 0.55 + fine.r * 0.45 < uGone * 1.05) discard;
  vec3 n = normalize(normalize(vN) + (fine.gba - 0.5) * 0.7);
  float sd = dot(n, normalize(uSunDir));
  float sun = clamp(sd * 0.6 + 0.4, 0.0, 1.0);
  // Dark in its folds, bright on its heads.
  float fold = mix(0.62, 1.0, smoothstep(0.0, 0.8, vLump)) * mix(0.82, 1.05, fine.r);
  vec3 alb = mix(uDirt, vec3(0.96, 0.95, 0.94), vWhite);
  // Lit through: a cloud scatters light in from all round, so its shaded
  // side is soft grey, never black.
  vec3 light = uSun * sun + mix(uGround * 1.6 + uSky * 0.25, uSky, n.y * 0.5 + 0.5) * 1.15;
  vec3 col = alb * light * fold * 0.55;
  // The fireball under the cap lights the belly of it.
  vec3 tf = uFireAt.xyz - vW;
  float df = length(tf);
  float lf = max(0.0, dot(n, tf / max(df, 1.0))) * uFireAt.w / (1.0 + df * df * 2.5e-7);
  col += alb * uFire * lf * fold;
  // Fire still inside it, showing in its folds.
  float heat = vHeat * smoothstep(0.05, 0.9, (1.0 - vLump) * 0.75 + fine.a * 0.5);
  vec3 flame = uFire * (1.2 + 1.8 * fine.b);
  col = mix(col, flame, clamp(heat, 0.0, 0.92));
  col += uFire * heat * heat * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Points along the cloud's outline, and round it. */
const CLOUD_NP = 160;
const CLOUD_NA = 128;

let CLOUD_GEO = null;
function cloudGeometry() {
  if (CLOUD_GEO) return CLOUD_GEO;
  const NP = CLOUD_NP, NA = CLOUD_NA;
  const ia = new Float32Array(NP * (NA + 1) * 2);
  const idx = [];
  for (let i = 0; i < NP; i++) {
    for (let j = 0; j <= NA; j++) {
      const o = (i * (NA + 1) + j) * 2;
      ia[o] = i;
      ia[o + 1] = (j / NA) * Math.PI * 2;
    }
  }
  for (let i = 0; i < NP - 1; i++) {
    for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j, b = a + NA + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('ia', new THREE.BufferAttribute(ia, 2));
  // Three wants a position to count vertices by; the shader places them.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * (NA + 1) * 3), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  g.userData.shared = true;
  CLOUD_GEO = g;
  return g;
}

function cloudMesh() {
  const data = new Float32Array(CLOUD_NP * 2 * 4);
  const tex = new THREE.DataTexture(data, CLOUD_NP, 2, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uProf: { value: null }, uNP: { value: CLOUD_NP }, uL: { value: 300 }, uDrift: { value: 0 },
      uNoise: { value: null },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSun: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.5, 0.55, 0.6) },
      uGround: { value: new THREE.Color(0.15, 0.17, 0.2) },
      uDirt: { value: new THREE.Color(0.5, 0.42, 0.34) },
      uFire: { value: new THREE.Color(1.0, 0.35, 0.08) },
      uFireAt: { value: new THREE.Vector4() },
      uGone: { value: 0 },
      uTime: { value: 0 },
    }]),
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    fog: true,
    side: THREE.DoubleSide,
  });
  mat.uniforms.uProf.value = tex;
  mat.uniforms.uNoise.value = noiseTexture();
  const mesh = new THREE.Mesh(cloudGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  // Dense working outline, resampled to CLOUD_NP evenly spaced points.
  return { mesh, tex, data, work: [] };
}

const SHOCK_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const SHOCK_FRAG = /* glsl */`
uniform sampler2D uScreen;
uniform vec2 uRes;
uniform float uBend;     // how hard it bends the light, at its strongest
uniform float uSkin;     // the condensation flashing on it
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  float face = abs(dot(n, normalize(vV)));
  // A thin shell of dense air bends the light most where the eye looks
  // through the most of it, which is along its rim.
  float band = pow(1.0 - face, 9.0);
  if (band < 0.002) discard;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 dir = length(n.xy) > 1e-4 ? normalize(n.xy) : vec2(0.0);
  vec2 off = dir * band * uBend;
  // Split a little by colour, as a lens of air does.
  float r = texture2D(uScreen, uv + off * 1.08).r;
  float g = texture2D(uScreen, uv + off).g;
  float b = texture2D(uScreen, uv + off * 0.92).b;
  vec3 col = vec3(r, g, b) * (1.0 + band * 0.15) + uSkin * band * vec3(0.95, 0.97, 1.0);
  gl_FragColor = vec4(col, clamp(band * 3.0, 0.0, 1.0));
}
`;

// ------------------------------------------------------------------ helpers

/** A small, repeatable pseudo-random number, worked out once for every burst. */
const HN = 1024, HK = 16;
const HASH = new Float64Array(HN * HK);
for (let i = 0; i < HN; i++) {
  for (let k = 0; k < HK; k++) {
    const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    HASH[i * HK + k] = s - Math.floor(s);
  }
}
const hash = (i, k) => HASH[(i % HN) * HK + k];

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How many billows of mist one burst can be made of. */
const MISTS = 520;

/**
 * Bursts kept made up and compiled for the next one: a burst takes its parts
 * from here and gives them back, so nothing is allocated, uploaded or
 * compiled in the frame a bomb goes off -- and twenty warheads off a B-52 are
 * not twenty sets of buffers.
 */
const POOL = 6;

/**
 * The most bursts drawn at once. Past this the oldest is let go: a sky with
 * seven mushrooms in it does not look any different from one with six, and
 * costs a great deal more.
 */
const MAX_LIVE = 6;

/**
 * How long the mushroom of a burst on the ground hangs over it, seconds: far
 * longer than Baker's column, which falls back into the sea. Drawing only --
 * the sim's clock for the burst (NUKE.life) is not this.
 */
const MUSHROOM_LIFE = 330;

/**
 * The billows, as one instanced batch: solid (see BILLOW_FRAG), or `soft` --
 * the mist of the base surge, which a ship sails into and is lost in, and
 * which has to be a fog to be inside rather than a wall of cardboard.
 */
function billowBatch(max, soft = false) {
  const base = shapes().card;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  const at = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  at.setUsage(THREE.DynamicDrawUsage);
  tint.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('at', at);
  geo.setAttribute('tint', tint);
  geo.instanceCount = 0;
  // Its size, its height above the water, how many of its billows are drawn
  // and how much fatter each is for those left out: see putBillow.
  const extra = { k: 1, oy: 0, keep: 1, fat: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uNoise: { value: null },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSun: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.5, 0.55, 0.6) },
      uGround: { value: new THREE.Color(0.15, 0.17, 0.2) },
      uDirt: { value: new THREE.Color(0.8, 0.8, 0.8) },
      uFire: { value: new THREE.Color(1.0, 0.42, 0.12) },
      uFireAt: { value: new THREE.Vector4() },
      uTime: { value: 0 },
    }]),
    vertexShader: BILLOW_VERT,
    fragmentShader: BILLOW_FRAG,
    fog: true,
    defines: soft ? { SOFT: '' } : {},
    transparent: soft,
    depthWrite: !soft,
  });
  mat.uniforms.uNoise.value = noiseTexture();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, at, tint, n: 0, max, ...extra };
}

/**
 * One billow, laid out as for the B-29's bomb and drawn at the burst's own
 * size `b.k` about its foot `b.oy`. Only `b.keep` of them are drawn -- the
 * same ones each frame, by their seed -- and each a little fatter for it, so
 * a far or a small burst, or one of several, costs less and looks as full.
 */
function putBillow(b, x, y, z, r, white, heat, gone, seed) {
  if (b.n >= b.max || r <= 0 || gone >= 1) return;
  if (b.keep < 1 && hash(seed + 517, 9) > b.keep) return;
  const k = b.k;
  const i = (b.n++) * 4;
  const A = b.at.array, T = b.tint.array;
  A[i] = x * k; A[i + 1] = b.oy + (y - b.oy) * k; A[i + 2] = z * k; A[i + 3] = r * k * b.fat;
  T[i] = white; T[i + 1] = heat; T[i + 2] = gone; T[i + 3] = seed;
}

const SEA_DIRT = new THREE.Color(0.74, 0.78, 0.82);
const LAND_DIRT = new THREE.Color(0.5, 0.4, 0.31);
// What the mushroom is where it is not white: dust and smoke over the land,
// spray and steam grey over the sea.
const SEA_CLOUD = new THREE.Color(0.58, 0.6, 0.63);
const LAND_CLOUD = new THREE.Color(0.42, 0.33, 0.26);
const FIRE = new THREE.Color(1.0, 0.3, 0.06);
const TMPV = new THREE.Vector3();
const TMPC = new THREE.Color();
const TMPM = new THREE.Matrix4();
const TMPS = new THREE.Sphere();

// -------------------------------------------------------------------- bursts

export class Nukes {
  /**
   * `lights` lends the flash a light (see Effects.holdLight). A burst used to
   * bring a point light of its own into the scene, and a light added to a
   * scene -- or taken out of it again -- changes every lit shader in it: the
   * whole fleet, every material of every ship, was recompiled the instant the
   * bomb went off and again when the light went, which was a freeze of
   * seconds at exactly the moment worth watching. The scene's own flash
   * lights are always there, so borrowing one costs nothing to compile.
   */
  constructor(scene, lights = null) {
    this.scene = scene;
    this.lights = lights;
    this.live = [];
    this.kept = null;
    this.flash = 0;
    this.jolt = 0;
    // The shock pass: its own little scene, drawn over the battle's with a
    // copy of what the battle's looked like (see renderShock).
    this.shockScene = null;
    this.screen = null;
    // Parts made up and waiting for a burst (see POOL).
    this.pool = [];
    this.frustum = new THREE.Frustum();
  }

  /**
   * Every shader a burst is drawn with, compiled ahead of it under the
   * battle's own lights and fog, while nothing is happening -- not in the
   * frame the bomb goes off. The materials are kept for the battle, because
   * a program no material holds is thrown away.
   */
  warm(renderer, camera) {
    if (this.kept || !renderer) return;
    const parts = this.parts(false);
    const scene = new THREE.Scene();
    for (const k of ['ball', 'glow', 'flare', 'sky', 'wilson']) scene.add(parts[k]);
    parts.cloud.mesh.visible = true;
    scene.add(parts.cloud.mesh);
    scene.add(parts.mist.mesh);
    // The shock is drawn in a pass of its own, with no lights and no fog,
    // and a program is compiled for the scene it is drawn in.
    const pass = new THREE.Scene();
    pass.add(parts.shock);
    this.kept = parts;
    try {
      for (const [sc, under] of [[scene, this.scene], [pass, pass]]) {
        const done = renderer.compileAsync ? renderer.compileAsync(sc, camera, under)
          : renderer.compile(sc, camera, under);
        done?.catch?.(() => {});
      }
    } catch { /* compiled the first time one is drawn instead */ }
    // And the first burst's parts are these: made, uploaded and compiled.
    this.pool.push(parts);
    // The copy of the frame the shock is drawn over, at the size it will be.
    try { this.screenFor(renderer); } catch { /* made when it is first wanted */ }
  }

  /** The copy of the picture the shock bends, the size of the drawing buffer. */
  screenFor(renderer) {
    const size = renderer.getDrawingBufferSize(TMP2);
    const w = Math.floor(size.x), h = Math.floor(size.y);
    if (!(w > 0 && h > 0)) return null;
    if (!this.screen || this.screen.image.width !== w || this.screen.image.height !== h) {
      this.screen?.dispose();
      this.screen = new THREE.FramebufferTexture(w, h);
      this.screen.minFilter = this.screen.magFilter = THREE.LinearFilter;
    }
    return this.screen;
  }

  /** What one burst is drawn with, unlit and unplaced. */
  parts(land) {
    const S = shapes();
    const noise = noiseTexture();
    const ball = new THREE.Mesh(S.ball, new THREE.ShaderMaterial({
      uniforms: {
        uNoise: { value: noise }, uCool: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 },
      },
      vertexShader: FIRE_VERT,
      fragmentShader: FIRE_FRAG,
      transparent: true,
      depthWrite: false,
    }));
    // The glow round it, and the flash: additive, so it only ever brightens.
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xfff2d0, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }));
    glow.renderOrder = 9;
    // The streak the flash throws across the eye -- long and thin, the way a
    // camera's glass sees a light that bright -- and the sky lit over the
    // burst, a dome of orange glow that hangs while the fire burns.
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffe2b0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }));
    flare.renderOrder = 10;
    const sky = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff7a30, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sky.renderOrder = 1;
    const wilson = new THREE.Mesh(S.wilson, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uNoise: { value: null }, uLit: { value: new THREE.Color(1, 1, 1) },
        uOpacity: { value: 0 }, uTime: { value: 0 }, uShape: { value: new THREE.Vector3(0, 1, 0) },
      }]),
      vertexShader: WILSON_VERT,
      fragmentShader: WILSON_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    }));
    wilson.material.uniforms.uNoise.value = noise;
    wilson.visible = false;
    wilson.renderOrder = 2;
    // The shock: drawn in a pass of its own, over a copy of the picture.
    const shock = new THREE.Mesh(S.shell, new THREE.ShaderMaterial({
      uniforms: {
        uScreen: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
        uBend: { value: 0 }, uSkin: { value: 0 },
      },
      vertexShader: SHOCK_VERT,
      fragmentShader: SHOCK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    shock.frustumCulled = false;
    const cloud = cloudMesh();
    const mist = billowBatch(MISTS, true);
    mist.mesh.material.uniforms.uDirt.value.copy(land ? LAND_DIRT : SEA_DIRT);
    mist.mesh.renderOrder = 3;
    return { ball, glow, flare, sky, wilson, shock, cloud, mist };
  }

  /**
   * A burst at (x, y, z). `land` when it went off on the ground rather than
   * the sea: a mushroom of fire and dirt then, rather than a column of water.
   * `t0` is when, on the clock `update` is handed -- the battle's, which is
   * the one the sea runs on -- so the burst and its wave keep time together.
   */
  add(x, y, z, land = false, t0 = null, k = 1) {
    // Too many in the sky at once: the oldest goes.
    while (this.live.length >= MAX_LIVE) this.drop(this.live.shift());
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.scene.add(g);
    const p = this.pool.pop() || this.parts(land);
    p.mist.mesh.material.uniforms.uDirt.value.copy(land ? LAND_DIRT : SEA_DIRT);
    p.mist.n = 0;
    p.mist.mesh.geometry.instanceCount = 0;
    p.mist.mesh.visible = true;
    p.cloud.mesh.material.uniforms.uDirt.value.copy(land ? LAND_CLOUD : SEA_CLOUD);
    p.cloud.mesh.visible = false;
    p.wilson.visible = false;
    for (const k of ['ball', 'glow', 'flare', 'sky', 'wilson']) g.add(p[k]);
    g.add(p.cloud.mesh);
    g.add(p.mist.mesh);
    // The shock is not in the battle's scene but in its own pass.
    const ss = this.shockScene || (this.shockScene = new THREE.Scene());
    p.shock.position.set(x, 0, z);
    ss.add(p.shock);
    // What the flash lights: everything on the sea, from the burst. One of
    // the scene's own lights, lent for as long as the flash is worth drawing.
    const lamp = this.lights?.holdLight?.() || null;
    if (lamp) {
      lamp.color.setHex(0xfff0d0);
      lamp.intensity = 0;
      lamp.distance = 0;
      lamp.position.set(x, 300, z);
    }
    this.live.push({ g, ...p, lamp, x, z, y: Math.max(0, y), t: 0, t0, land, front: 0, k: k > 0 ? k : 1 });
    this.flash = Math.max(this.flash, Math.min(1, 0.45 + 0.55 * k));
  }

  /** Give the flash's light back to the scene. */
  dropLamp(n) {
    if (!n.lamp) return;
    this.lights?.releaseLight?.(n.lamp);
    n.lamp = null;
  }

  /** Take one burst out of the picture and give back what it held. */
  drop(n) {
    this.scene.remove(n.g);
    this.shockScene?.remove(n.shock);
    this.dropLamp(n);
    const p = { ball: n.ball, glow: n.glow, flare: n.flare, sky: n.sky, wilson: n.wilson, shock: n.shock,
      cloud: n.cloud, mist: n.mist };
    // Kept for the next burst, made up as it is (see POOL).
    if (this.pool.length < POOL) { this.pool.push(p); return; }
    this.disposeParts(p);
  }

  disposeParts(p) {
    for (const k of ['ball', 'glow', 'flare', 'sky', 'wilson', 'shock']) p[k].material?.dispose?.();
    p.mist.mesh.material.dispose();
    p.mist.mesh.geometry.dispose();
    p.cloud.mesh.material.dispose();
    p.cloud.tex.dispose();
  }

  /** The battle is over: give back the kept shaders and anything still burning. */
  dispose() {
    for (const n of this.live) this.drop(n);
    this.live.length = 0;
    for (const p of this.pool) this.disposeParts(p);
    this.pool.length = 0;
    this.kept = null;
    this.screen?.dispose();
    this.screen = null;
  }

  /** How bright the whole sky is, 0..1, for whatever is drawing a white-out over the screen. */
  get whiteOut() { return this.flash || 0; }

  /** How hard the shock has just struck the eye, once: 0..1, taken and cleared. */
  takeJolt() {
    const j = this.jolt;
    this.jolt = 0;
    return j;
  }

  /** The sun and the sky, as the scene has them now, for lighting the cloud. */
  light() {
    const L = this.lit || (this.lit = {
      dir: new THREE.Vector3(0.3, 0.8, 0.4).normalize(), sun: new THREE.Color(1, 1, 1),
      sky: new THREE.Color(0.6, 0.65, 0.7), ground: new THREE.Color(0.15, 0.18, 0.2), found: false,
    });
    if (!L.found) {
      for (const o of this.scene.children) {
        if (o.isDirectionalLight && !L.sunLight) L.sunLight = o;
        if (o.isHemisphereLight && !L.hemi) L.hemi = o;
      }
      L.found = true;
    }
    if (L.sunLight) {
      L.dir.copy(L.sunLight.position).sub(L.sunLight.target.position).normalize();
      L.sun.copy(L.sunLight.color).multiplyScalar(L.sunLight.intensity);
    }
    if (L.hemi) {
      L.sky.copy(L.hemi.color).multiplyScalar(L.hemi.intensity);
      L.ground.copy(L.hemi.groundColor).multiplyScalar(L.hemi.intensity);
    }
    return L;
  }

  update(dt, camera = null, clock = null) {
    this.flash = Math.max(0, (this.flash || 0) - dt * 0.9);
    if (!this.live.length) return;
    const L = this.light();
    // What the eye can see, to leave a cloud out of sight unbuilt.
    if (camera) {
      camera.updateMatrixWorld();
      TMPM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(TMPM);
    }
    // Several in the sky at once share what one would be drawn with.
    const crowd = 1 / Math.sqrt(Math.max(1, this.live.length));
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      const K = n.k;
      // On the battle's clock when there is one, so the cloud, the shock and
      // the wave in the sea all keep the same time.
      n.t = n.t0 != null && Number.isFinite(clock) ? Math.max(0, clock - n.t0) : n.t + dt;
      const t = n.t;
      if (t > (n.land ? MUSHROOM_LIFE : NUKE.life)) {
        this.drop(n);
        this.live.splice(i, 1);
        continue;
      }
      const fire = this.fireball(n, t);
      const FB = NUKE.fireball * K;
      // The flash and the glow.
      const f = Math.exp(-t / 0.35) + (n.land ? 0.45 * Math.exp(-t / 7) : 0.25 * Math.exp(-t / 4));
      n.glow.scale.setScalar(FB * (n.land ? 1.35 : 1) * (4 + 10 * Math.exp(-t / 0.5)));
      n.glow.position.y = n.ball.position.y;
      n.glow.material.opacity = Math.min(1, f);
      n.glow.visible = n.glow.material.opacity > 0.004;
      // The streak across the glass: very wide, very thin, in the first
      // seconds, and a long ember of it after.
      const fl = 0.95 * Math.exp(-t / 0.6) + 0.25 * Math.exp(-t / 5);
      n.flare.scale.set(FB * (60 + 40 * Math.exp(-t / 1.2)), FB * (1.6 + 2.5 * Math.exp(-t / 0.4)), 1);
      n.flare.position.y = n.ball.position.y;
      n.flare.material.opacity = Math.min(1, fl);
      n.flare.visible = fl > 0.004;
      // The sky over it, lit orange from below by the fire and the cloud.
      const skyLit = n.land ? Math.min(1, t * 2) * Math.exp(-t / 45) * 0.55 : Math.min(1, t * 3) * Math.exp(-t / 10) * 0.35;
      n.sky.scale.set(FB * 22, FB * 14, 1);
      n.sky.position.y = n.y + FB * (n.land ? 4 : 2.5);
      n.sky.material.opacity = skyLit;
      n.sky.visible = skyLit > 0.004;
      if (n.lamp) {
        n.lamp.intensity = K * K * ((n.land ? 4.5e7 : 3e7) * Math.exp(-t / 0.6) + (n.land ? 4e6 : 2e6) * Math.exp(-t / (n.land ? 9 : 5)));
        n.lamp.position.set(n.x, n.ball.position.y, n.z);
        // Forty seconds on it is lighting nothing a ship would show, and the
        // scene's gun flashes want it back.
        if (t > 40) { n.lamp.intensity = 0; this.dropLamp(n); }
      }
      // The shock, and the moment it reaches the eye.
      const front = nukeFront(t, n.land, K);
      const reach = NUKE.reach * K * (n.land ? NUKE.landReach : 1);
      let far = 0;
      if (camera) {
        const d = Math.hypot(camera.position.x - n.x, camera.position.y - n.y, camera.position.z - n.z);
        far = d;
        if (n.front < d && front >= d) {
          this.jolt = Math.max(this.jolt, Math.max(0.3, (n.land ? 1.3 : 1) * (1 - d / reach)));
        }
      }
      n.front = front;
      // The shock is felt (the jolt, above) and seen in what it does to the
      // sea and the ground, not drawn as a shell in the sky: a ring of
      // bent light standing over the burst read as a soap bubble, and so did
      // the condensation dome. Neither is drawn.
      n.shock.visible = false;
      n.wilson.visible = false;
      // The cloud: not built at all when it is out of sight.
      const seen = !camera || this.frustum.intersectsSphere(
        TMPS.set(TMPV.set(n.x, n.y + 2200 * K, n.z), 4600 * K));
      n.cloud.mesh.visible = n.mist.mesh.visible = seen;
      if (!seen) continue;
      // How many billows of mist are worth drawing: all of them close to,
      // fewer for a smaller burst, a far one, or one of several.
      const keep = Math.min(1, Math.max(0.3,
        (0.55 + 0.3 * K) * crowd * (far > 0 ? Math.min(1, Math.max(0.55, 1.35 - far / (30000 * K))) : 1)));
      const m = n.mist;
      {
        const u = m.mesh.material.uniforms;
        u.uTime.value = t;
        u.uSunDir.value.copy(L.dir);
        u.uSun.value.copy(L.sun);
        u.uSky.value.copy(L.sky);
        u.uGround.value.copy(L.ground);
        u.uFire.value.copy(FIRE);
        if (camera) {
          TMPV.set(n.x, n.ball.position.y, n.z).applyMatrix4(camera.matrixWorldInverse);
          u.uFireAt.value.set(TMPV.x, TMPV.y, TMPV.z, fire * 30 * K);
        }
        m.n = 0;
        m.k = K;
        m.oy = n.y;
        m.keep = keep;
        m.fat = Math.pow(keep, -0.35);
      }
      {
        const u = n.cloud.mesh.material.uniforms;
        u.uTime.value = t;
        u.uSunDir.value.copy(L.dir);
        u.uSun.value.copy(L.sun);
        u.uSky.value.copy(L.sky);
        u.uGround.value.copy(L.ground);
        u.uFire.value.copy(FIRE);
        u.uFireAt.value.set(n.x, n.ball.position.y, n.z, fire * 30 * K);
      }
      this.cloud(n, t);
      this.surge(n, t);
      m.mesh.geometry.instanceCount = m.n;
      m.at.needsUpdate = true;
      m.tint.needsUpdate = true;
    }
  }

  /** The fireball for this moment; returns how much light it is still giving. */
  fireball(n, t) {
    const K = n.k;
    const grow = 1 - Math.exp(-t / 0.45);
    const rise = Math.max(0, t - 1.2);
    // On the ground nothing of it goes into boiling the sea: it is bigger,
    // brighter, and it burns for longer. Worked out at the B-29's size, as the
    // cloud is (see cloud), and drawn at the burst's own.
    const R = NUKE.fireball * (n.land ? 1.4 : 1.15) * grow * (1 + Math.min(0.6, rise * 0.03));
    // Up off the ground or the sea as it cools, until it is the heart of the
    // cap: the mushroom is built round it (see cloud).
    n.capY = n.y + NUKE.fireball * 0.8 + (n.land ? 3200 : 2900) * (1 - Math.exp(-rise / 26));
    const y = t < 1.2 ? n.y + R * 0.6 : Math.max(n.y + R * 0.6, n.capY);
    let opacity, cool;
    if (n.land) {
      cool = Math.min(1, t / 22);
      opacity = Math.max(0, 1 - Math.max(0, t - 10) / 20);
    } else {
      // Over the sea it is drowned in the steam and spray it throws up, and
      // burns out sooner.
      cool = Math.min(1, t / 12);
      opacity = Math.max(0, 1 - Math.max(0, t - 4) / 10);
    }
    // Once the cap has formed round it, it is the fire in the heart of the
    // cap and no bigger than the cap is thick: drawn any bigger it stood out
    // of the top of the cloud as a ball.
    const Rc = R * 0.42 + 860 * (1 - Math.exp(-Math.max(0, t - 0.25) / 26));
    const inCap = smooth(2, 7, t);
    const Rb = R + (Math.min(R, Rc * 0.6 * 0.8) - R) * inCap;
    n.ball.scale.setScalar(Math.max(1, Rb * K));
    n.ball.position.y = n.y + (y - n.y) * K;
    const u = n.ball.material.uniforms;
    u.uCool.value = cool;
    u.uTime.value = t;
    u.uOpacity.value = opacity;
    n.ball.visible = opacity > 0.01;
    n.R = R;
    return (1 - cool * 0.7) * (n.land ? Math.max(0, 1 - t / 80) : Math.max(0, 1 - t / 30));
  }

  /**
   * The outline of the mushroom at time `t`, as one line from the top of its
   * crown out over the cap, round the rolled rim of it and in underneath to
   * the stem, down the stem to the ground and out along the skirt of dust or
   * spray round its foot -- and how hot and how white it is along that line.
   * Laid out at the B-29's size about the foot of the burst; the mesh is
   * scaled to the burst's own.
   */
  cloud(n, t) {
    const C = n.cloud;
    const age = t - 0.25;
    const life = n.land ? MUSHROOM_LIFE : NUKE.life;
    if (age <= 0) { C.mesh.visible = false; return; }
    const land = n.land;
    const R = n.R || NUKE.fireball;
    const grow = 1 - Math.exp(-age / 26);
    // The cap: a ring of cloud rolling over on itself round the top of the
    // stem, with the crown domed over it.
    const Rc = R * 0.42 + 860 * grow;
    const T = Rc * 0.6;
    const Yc = (n.capY ?? n.y + NUKE.fireball) - n.y;
    // The stem: drawn up off the ground into the cap in the first seconds.
    const f = smooth(0.6, 9, age);
    const sTop = Rc * 0.3 + 50;
    const sW = Rc * 0.2 + 45;
    const sB = Rc * (land ? 0.36 : 0.42) + 70;
    // Fire: everything glowing at first (the fireball turning into the
    // cloud), then only its belly and its folds, and then nothing.
    const burn = Math.pow(Math.max(0, 1 - age / (land ? 85 : 28)), 2);
    const flash = Math.exp(-age / (land ? 6 : 3.5));
    const W = C.work;
    W.length = 0;
    const put = (r, y, amp, heat, white) => W.push(r, y, amp, Math.min(1.4, heat), white);
    // Its crown.
    const topY = Yc + T * 0.82;
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      put(Rc * u, topY + T * 0.32 * Math.pow(1 - u * u, 1.5), T * 0.5,
        burn * 0.15 + flash, land ? 0.42 : 0.9);
    }
    // The rolled rim, from the top of it out and down and in underneath.
    for (let i = 1; i <= 64; i++) {
      const ph = Math.PI / 2 - (i / 64) * (Math.PI * 0.5 + Math.PI * 0.68);
      const sn = Math.sin(ph);
      const under = Math.max(0, -sn);
      put(Rc + T * Math.cos(ph), Yc + T * 0.82 * sn, T * 0.55,
        burn * (0.25 + 0.85 * under) + flash, (land ? 0.26 : 0.8) + (land ? 0.16 : 0.1) * Math.max(0, sn));
    }
    // In under the cap to the top of the stem.
    const ph1 = -Math.PI * 0.68;
    const jx = Rc + T * Math.cos(ph1), jy = Yc + T * 0.82 * Math.sin(ph1);
    const stemTop = Yc - T * 0.95;
    for (let i = 1; i <= 10; i++) {
      const u = i / 10;
      const cx = sTop + (jx - sTop) * 0.25, cy = jy - T * 0.1;
      const r = (1 - u) * (1 - u) * jx + 2 * (1 - u) * u * cx + u * u * sTop;
      const y = (1 - u) * (1 - u) * jy + 2 * (1 - u) * u * cy + u * u * stemTop;
      put(r, y, T * 0.45, burn * 1.05 + flash, land ? 0.28 : 0.74);
    }
    // Down the stem, as far as it has got.
    const bot = stemTop - stemTop * f;
    const full = f > 0.995;
    for (let i = 1; i <= 48; i++) {
      const u = i / 48;
      const y = stemTop + (bot - stemTop) * u;
      // How far down the whole stem this is, for its shape.
      const v = stemTop > 1 ? 1 - y / stemTop : 0;
      let r = sTop + (sB - sTop) * Math.pow(v, 2.4);
      r -= (sTop - sW) * Math.sin(Math.PI * Math.min(1, v * 1.15)) * 0.8;
      // A stem still on its way up ends in a rounded tip.
      if (!full) r *= Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (u - 0.8) / 0.2), 2)));
      const low = Math.max(0, v - 0.5) * 2;
      put(Math.max(0, r), y, Math.max(20, r * 0.55),
        burn * (0.3 + 0.6 * low) + flash * 0.6 * (1 - v), land ? 0.22 + 0.12 * (1 - v) : 0.93);
    }
    // And out round its foot along the ground: the dust drawn in under it,
    // or the spray thrown up round it.
    if (full) {
      const skirt = sB * (1.5 + 1.6 * grow);
      const hS = sB * (land ? 0.5 : 0.65);
      for (let i = 1; i <= 16; i++) {
        const u = i / 16;
        const r = sB + (skirt - sB) * u;
        const y = hS * Math.pow(1 - u, 1.6) * (1 - 0.3 * u) + 2;
        put(r, Math.max(1, y), hS * 0.8, burn * 0.5 * (1 - u), land ? 0.2 : 0.96);
      }
    }
    // Resampled to evenly spaced points along it.
    const NP = CLOUD_NP;
    const nW = W.length / 5;
    const S = new Float32Array(nW);
    for (let i = 1; i < nW; i++) {
      S[i] = S[i - 1] + Math.hypot(W[i * 5] - W[(i - 1) * 5], W[i * 5 + 1] - W[(i - 1) * 5 + 1]);
    }
    const total = S[nW - 1] || 1;
    const D = C.data;
    let j = 0;
    for (let i = 0; i < NP; i++) {
      const s = (i / (NP - 1)) * total;
      while (j < nW - 2 && S[j + 1] < s) j++;
      const f2 = Math.min(1, Math.max(0, (s - S[j]) / Math.max(1e-6, S[j + 1] - S[j])));
      const a = j * 5, b = (j + 1) * 5;
      const o = i * 4, o2 = (NP + i) * 4;
      D[o] = W[a] + (W[b] - W[a]) * f2;
      D[o + 1] = W[a + 1] + (W[b + 1] - W[a + 1]) * f2;
      D[o + 2] = s;
      D[o + 3] = W[a + 2] + (W[b + 2] - W[a + 2]) * f2;
      D[o2] = W[a + 3] + (W[b + 3] - W[a + 3]) * f2;
      D[o2 + 1] = W[a + 4] + (W[b + 4] - W[a + 4]) * f2;
      D[o2 + 2] = 0;
      D[o2 + 3] = 0;
    }
    C.tex.needsUpdate = true;
    const u = C.mesh.material.uniforms;
    // Its lumps grow with it, so it keeps the one shape as it grows rather
    // than sprouting new ones.
    u.uL.value = Math.max(80, T * 0.85);
    // Its surface rolling slowly over the rim of the cap.
    u.uDrift.value = age * 2.5;
    u.uGone.value = smooth(life - 110, life - 4, t);
    C.mesh.scale.setScalar(n.k);
    C.mesh.position.y = n.y;
    C.mesh.visible = true;
  }

  /**
   * What is soft about a burst, and stays soft: the collar of condensation
   * round the stem, the wall of dust or spray the shock throws up as it goes
   * out along the ground or the sea, and the base surge rolling out after it
   * from the foot of the stem and hanging there.
   */
  surge(n, t) {
    const m = n.mist;
    const age = t - 0.5;
    if (age <= 0) return;
    let k = 0;
    const land = n.land;
    const life = land ? MUSHROOM_LIFE : NUKE.life;
    const thin = smooth(life - 120, life - 5, t);
    const capY = n.capY ?? n.y + NUKE.fireball;
    // The collar: a ring of white condensation that forms round the stem as
    // the cap goes up through damp air, and is gone inside a minute.
    if (age > 3 && age < 60) {
      const Rc = (n.R || NUKE.fireball) * 0.42 + 860 * (1 - Math.exp(-age / 26));
      const cy = n.y + (capY - n.y) * 0.45;
      const cr = Rc * 0.75 + age * 10;
      const fade = 1 - smooth(30, 60, age);
      const form = smooth(3, 6, age);
      for (let i = 0; i < 90; i++, k++) {
        const a = (i / 90) * Math.PI * 2 + hash(i, 1) * 0.1;
        const rr = cr * (0.9 + 0.15 * hash(i + 500, 0));
        putBillow(m, Math.cos(a) * rr, cy + (hash(i + 500, 1) - 0.5) * 50, Math.sin(a) * rr,
          (110 + 60 * hash(i + 500, 2)) * form, 1, 0, 1 - fade * (0.6 + 0.4 * hash(i + 500, 3)), k);
      }
    }
    // The wall of dust or spray racing out with the shock, in the first
    // seconds: the thing that shows where it is.
    const front = nukeFront(t, land);
    if (t < 14) {
      // Low and thin -- a skirt along the ground or the water, not a wall
      // to hide the cloud behind -- and packed close all the way round, so
      // it is one ring and not a string of puffs.
      const r0 = (70 + 0.022 * front) * (1 + 0.4 * smooth(0, 6, t));
      const N = Math.min(220, Math.max(60, Math.ceil((Math.PI * 2 * front) / (r0 * 0.9))));
      for (let i = 0; i < N; i++, k++) {
        const a = ((i + hash(i, 2) * 0.6) / N) * Math.PI * 2;
        const rr = front * (0.92 + 0.06 * hash(i + 600, 0));
        const r = r0 * (0.8 + 0.4 * hash(i + 600, 2));
        putBillow(m, Math.cos(a) * rr, n.y + r * 0.15 + 10 * hash(i + 600, 1), Math.sin(a) * rr,
          r, land ? 0.42 : 0.95, 0, smooth(2.5, 14, t), k);
      }
    }
    // The base surge: low, rolling out from the foot of the stem and hanging
    // there -- dust over the land, a ring of white mist over the sea.
    const s = Math.max(0, age - (land ? 0 : 5));
    if (s > 0) {
      const Rb = Math.min(front * 0.8, (land ? 2600 : 3200) * (1 - Math.exp(-s / (land ? 22 : 35))));
      const hb = land ? 110 : 140 + 200 * smooth(0, 60, s);
      for (let i = 0; i < 260; i++, k++) {
        const a = hash(i, 3) * Math.PI * 2;
        const u = Math.sqrt(hash(i + 700, 0));
        const rr = Rb * (0.3 + 0.7 * u);
        const r = (90 + 110 * hash(i + 700, 2)) * Math.min(1, 0.4 + s / 12) * (1.25 - 0.45 * u);
        const y = n.y + r * 0.45 + hb * hash(i + 700, 1) * (1 - 0.5 * u);
        putBillow(m, Math.cos(a) * rr, y, Math.sin(a) * rr, r * 1.2,
          land ? 0.6 + 0.3 * hash(i + 700, 3) : 0.92, 0, Math.max(thin, 1 - smooth(0, 6, s)), k);
      }
    }
  }

  /**
   * The shock, drawn over the picture.
   *
   * It is not a thing that can be seen except by what it does to what is
   * behind it: a shell of air squeezed dense, which bends the light through it
   * the way the air over a hot road does, but hard and in a sharp ring. So it
   * is drawn after everything else with a copy of the frame under it, and each
   * pixel of its rim shows the frame from a little further out. Costs one copy
   * of the frame a frame, and only for the fifteen seconds there is a shock.
   */
  renderShock(renderer, camera) {
    if (!this.live.length || !this.shockScene) return;
    if (!this.live.some((n) => n.shock.visible)) return;
    if (!this.screenFor(renderer)) return;
    const w = this.screen.image.width, h = this.screen.image.height;
    const was = renderer.autoClear;
    try {
      renderer.copyFramebufferToTexture(this.screen);
      for (const n of this.live) {
        const u = n.shock.material.uniforms;
        u.uScreen.value = this.screen;
        u.uRes.value.set(w, h);
      }
      renderer.autoClear = false;
      renderer.render(this.shockScene, camera);
    } catch { /* drawn without it */ }
    renderer.autoClear = was;
  }
}

const TMP2 = new THREE.Vector2();
