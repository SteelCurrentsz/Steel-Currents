// An atomic burst, as it is seen.
//
// Two different things, depending on what it went off on:
//
//   On the sea, Baker: the flash, and then a column of water half a mile
//   across thrown a mile into the air with a dark cauliflower crown of jets
//   on it, wrapped in the great white dome of the condensation cloud the
//   shock leaves behind it -- a solid heap of white standing on a flat skirt
//   of fog on the water, the crown just showing over its top -- which clears
//   from the top down; and when the column falls back, the base surge
//   rolling out across the sea from the foot of it.
//
//   On the ground: the fire climbing into the cap of the mushroom, the cap
//   rolling over itself the way a vortex ring does and burning inside for
//   well over a minute and hanging for minutes after, the stem drawn up into
//   it with fire still in it, the white collar of condensation round the
//   stem, and the dust of the base surge going out along the ground.
//
// And in both the shock itself: a dome of compressed air racing out at many
// times the speed of sound, seen as what it is -- everything behind its rim
// bent and shimmering through it (see renderShock) -- with a ragged skin of
// condensation flashing on it in the first instants, and a wall of spray or
// dust racing out along its foot. The slick it drives across the water is
// drawn by the sea itself (burstMarks in ocean.js), and the wave that
// follows is the sea itself too (burstSwell).
//
// No fireball is drawn as a ball, and no glow sprite laid over one: they
// read as a flat yellow disc on the horizon. The fire is in the cloud.
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

// ------------------------------------------------------------------ shapes

let SHAPES = null;
function shapes() {
  if (SHAPES) return SHAPES;
  SHAPES = {
    // The shock: a dome over the burst, a little past the horizontal so its
    // foot is under the water and the ground.
    shell: new THREE.SphereGeometry(1, 64, 28, 0, Math.PI * 2, 0, Math.PI * 0.56),
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
varying float vBias;
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
  vBias = h.z;
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
uniform float uGain;      // how much light it gives back
uniform float uFine;      // how hard its finer folds are cut
varying vec3 vN;
varying vec3 vW;
varying vec3 vQ;
varying float vLump;
varying float vHeat;
varying float vWhite;
varying float vBias;
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
  // Thinning out at the end from its folds, its heads going last -- and
  // where the outline says so (vBias), one part of it before another: the
  // top of the condensation dome clears first, its foot on the sea last.
  if (uGone > 0.0 && vLump * 0.55 + fine.r * 0.45 < uGone * (1.05 + vBias)) discard;
  vec3 n = normalize(normalize(vN) + (fine.gba - 0.5) * uFine);
  float sd = dot(n, normalize(uSunDir));
  float sun = clamp(sd * 0.6 + 0.4, 0.0, 1.0);
  // Dark in its folds, bright on its heads.
  float fold = mix(0.62, 1.0, smoothstep(0.0, 0.8, vLump)) * mix(0.82, 1.05, fine.r);
  vec3 alb = mix(uDirt, vec3(0.96, 0.95, 0.94), vWhite);
  // Lit through: a cloud scatters light in from all round, so its shaded
  // side is soft grey, never black.
  vec3 light = uSun * sun + mix(uGround * 1.6 + uSky * 0.25, uSky, n.y * 0.5 + 0.5) * 1.15;
  vec3 col = alb * light * mix(1.0, fold, uFine / 0.7) * uGain;
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
/**
 * The condensation dome over a burst on the sea: a big smooth shape, its
 * lumps all large ones, and fewer points do it.
 */
const DOME_NP = 72;
const DOME_NA = 88;

const CLOUD_GEO = new Map();
function cloudGeometry(NP, NA) {
  const key = NP * 10000 + NA;
  if (CLOUD_GEO.has(key)) return CLOUD_GEO.get(key);
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
  CLOUD_GEO.set(key, g);
  return g;
}

function cloudMesh(NP = CLOUD_NP, NA = CLOUD_NA) {
  const data = new Float32Array(NP * 2 * 4);
  const tex = new THREE.DataTexture(data, NP, 2, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uProf: { value: null }, uNP: { value: NP }, uL: { value: 300 }, uDrift: { value: 0 },
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
      uGain: { value: 0.55 },
      uFine: { value: 0.7 },
    }]),
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    fog: true,
    side: THREE.DoubleSide,
  });
  mat.uniforms.uProf.value = tex;
  mat.uniforms.uNoise.value = noiseTexture();
  const mesh = new THREE.Mesh(cloudGeometry(NP, NA), mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  // A working outline, resampled to NP evenly spaced points (see outline).
  return { mesh, tex, data, np: NP, work: [], arc: new Float32Array(256) };
}

/**
 * Lay a working outline -- six numbers a point: radius, height, how hard it
 * is lumped, how hot, how white, and how early it goes (see vBias) -- out as
 * evenly spaced points along it, into the cloud's outline texture.
 */
function outline(C) {
  const W = C.work;
  const NP = C.np;
  const nW = W.length / 6;
  if (C.arc.length < nW) C.arc = new Float32Array(nW * 2);
  const S = C.arc;
  S[0] = 0;
  for (let i = 1; i < nW; i++) {
    S[i] = S[i - 1] + Math.hypot(W[i * 6] - W[(i - 1) * 6], W[i * 6 + 1] - W[(i - 1) * 6 + 1]);
  }
  const total = S[nW - 1] || 1;
  const D = C.data;
  let j = 0;
  for (let i = 0; i < NP; i++) {
    const s = (i / (NP - 1)) * total;
    while (j < nW - 2 && S[j + 1] < s) j++;
    const f2 = Math.min(1, Math.max(0, (s - S[j]) / Math.max(1e-6, S[j + 1] - S[j])));
    const a = j * 6, b = (j + 1) * 6;
    const o = i * 4, o2 = (NP + i) * 4;
    D[o] = W[a] + (W[b] - W[a]) * f2;
    D[o + 1] = W[a + 1] + (W[b + 1] - W[a + 1]) * f2;
    D[o + 2] = s;
    D[o + 3] = W[a + 2] + (W[b + 2] - W[a + 2]) * f2;
    D[o2] = W[a + 3] + (W[b + 3] - W[a + 3]) * f2;
    D[o2 + 1] = W[a + 4] + (W[b + 4] - W[a + 4]) * f2;
    D[o2 + 2] = W[a + 5] + (W[b + 5] - W[a + 5]) * f2;
    D[o2 + 3] = 0;
  }
  C.tex.needsUpdate = true;
}

const SHOCK_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vP = position;
  gl_Position = projectionMatrix * mv;
}
`;

const SHOCK_FRAG = /* glsl */`
uniform sampler2D uScreen;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform float uBend;     // how hard it bends the light, at its strongest
uniform float uSkin;     // the condensation flashing on it
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  float face = abs(dot(n, normalize(vV)));
  // A thin shell of dense air bends the light most where the eye looks
  // through the most of it, which is along its rim.
  float rim = 1.0 - face;
  float band = pow(rim, 6.0);
  // The skin of condensation that flashes on it in the first instants:
  // ragged, thickest low down and at its rim, never a clean bubble.
  float h = clamp(vP.y, 0.0, 1.0);
  float ns = texture2D(uNoise, vec2(atan(vP.z, vP.x) * 0.9, h * 1.3) + uTime * 0.01).r * 0.65
           + texture2D(uNoise, vP.xz * 1.7 + 0.3).g * 0.35;
  float skin = uSkin * smoothstep(0.42, 0.75, ns) * (0.25 + 0.75 * rim * rim) * (1.0 - 0.6 * h);
  if (band < 0.003 && skin < 0.01) discard;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 dir = length(n.xy) > 1e-4 ? normalize(n.xy) : vec2(0.0);
  vec2 off = dir * band * uBend;
  // Split a little by colour, as a lens of air does.
  float r = texture2D(uScreen, uv + off * 1.08).r;
  float g = texture2D(uScreen, uv + off).g;
  float b = texture2D(uScreen, uv + off * 0.92).b;
  vec3 col = vec3(r, g, b) * (1.0 + band * 0.25 * step(0.001, uBend));
  col = mix(col, vec3(0.93, 0.95, 0.98), clamp(skin, 0.0, 0.85));
  gl_FragColor = vec4(col, clamp(max(band * 3.0 * step(0.001, uBend), skin), 0.0, 1.0));
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
// The condensation dome's shadowed side: a cool grey, never brown.
const DOME_GREY = new THREE.Color(0.8, 0.83, 0.87);
const LAND_CLOUD = new THREE.Color(0.42, 0.33, 0.26);
const FIRE = new THREE.Color(1.0, 0.3, 0.06);
const TMPV = new THREE.Vector3();
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
    parts.cloud.mesh.visible = true;
    parts.dome.mesh.visible = true;
    scene.add(parts.cloud.mesh);
    scene.add(parts.dome.mesh);
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
    parts.cloud.mesh.visible = false;
    parts.dome.mesh.visible = false;
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

  /**
   * What one burst is drawn with, unlit and unplaced.
   *
   * There is no fireball drawn as a ball, and no glow or flare laid over it:
   * a sphere of fire and a round sprite of light on top of it read, at any
   * range, as a flat yellow disc stuck on the horizon. The flash is the
   * light it throws on everything (the lamp) and the white-out over the
   * screen; the fire is inside the cloud (see CLOUD_FRAG's heat).
   */
  parts(land) {
    const S = shapes();
    const noise = noiseTexture();
    // The shock: drawn in a pass of its own, over a copy of the picture.
    const shock = new THREE.Mesh(S.shell, new THREE.ShaderMaterial({
      uniforms: {
        uScreen: { value: null }, uNoise: { value: noise }, uRes: { value: new THREE.Vector2(1, 1) },
        uBend: { value: 0 }, uSkin: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: SHOCK_VERT,
      fragmentShader: SHOCK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    shock.frustumCulled = false;
    shock.visible = false;
    // The mushroom on land, or the column of water on the sea.
    const cloud = cloudMesh();
    // The condensation dome over a burst on the sea.
    const dome = cloudMesh(DOME_NP, DOME_NA);
    dome.mesh.material.uniforms.uDirt.value.copy(DOME_GREY);
    // Smooth and bright: a heap of fresh condensation, not a cauliflower.
    dome.mesh.material.uniforms.uGain.value = 0.72;
    dome.mesh.material.uniforms.uFine.value = 0.3;
    const mist = billowBatch(MISTS, true);
    mist.mesh.material.uniforms.uDirt.value.copy(land ? LAND_DIRT : SEA_DIRT);
    mist.mesh.renderOrder = 3;
    return { shock, cloud, dome, mist };
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
    p.dome.mesh.visible = false;
    g.add(p.cloud.mesh);
    g.add(p.dome.mesh);
    g.add(p.mist.mesh);
    // The shock is not in the battle's scene but in its own pass.
    const ss = this.shockScene || (this.shockScene = new THREE.Scene());
    p.shock.position.set(x, Math.max(0, y), z);
    p.shock.visible = false;
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
    this.live.push({ g, ...p, lamp, x, z, y: Math.max(0, y), t: 0, t0, land, front: 0, k: k > 0 ? k : 1, fy: y });
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
    const p = { shock: n.shock, cloud: n.cloud, dome: n.dome, mist: n.mist };
    // Kept for the next burst, made up as it is (see POOL).
    if (this.pool.length < POOL) { this.pool.push(p); return; }
    this.disposeParts(p);
  }

  disposeParts(p) {
    p.shock.material.dispose();
    p.mist.mesh.material.dispose();
    p.mist.mesh.geometry.dispose();
    for (const c of [p.cloud, p.dome]) {
      c.mesh.material.dispose();
      c.tex.dispose();
    }
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

  /** A cloud's lighting for this frame: the sun and sky, and the fire in it. */
  lightCloud(C, n, L, t, fire) {
    const u = C.mesh.material.uniforms;
    u.uTime.value = t;
    u.uSunDir.value.copy(L.dir);
    u.uSun.value.copy(L.sun);
    u.uSky.value.copy(L.sky);
    u.uGround.value.copy(L.ground);
    u.uFire.value.copy(FIRE);
    u.uFireAt.value.set(n.x, n.fy, n.z, fire * 30 * n.k);
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
    // Where the eye is, so the wall of the shock thins out as it goes by
    // it rather than filling the whole screen with mist (see surge).
    this.eye = camera ? camera.position : null;
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
      if (n.lamp) {
        n.lamp.intensity = K * K * ((n.land ? 4.5e7 : 3e7) * Math.exp(-t / 0.6) + (n.land ? 4e6 : 1.2e6) * Math.exp(-t / (n.land ? 9 : 3)));
        n.lamp.position.set(n.x, n.fy, n.z);
        // Forty seconds on it is lighting nothing a ship would show, and the
        // scene's gun flashes want it back.
        if (t > (n.land ? 40 : 15)) { n.lamp.intensity = 0; this.dropLamp(n); }
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
      this.shock(n, t, front, reach, far);
      // The cloud: not built at all when it is out of sight.
      const seen = !camera || this.frustum.intersectsSphere(
        TMPS.set(TMPV.set(n.x, n.y + 1800 * K, n.z), 4600 * K));
      n.cloud.mesh.visible = n.mist.mesh.visible = seen;
      if (!seen) { n.dome.mesh.visible = false; continue; }
      // How many billows of mist are worth drawing: all of them close to,
      // fewer for a smaller burst, a far one, or one of several.
      const keep = Math.min(1, Math.max(0.3,
        (0.55 + 0.3 * K) * crowd * (far > 0 ? Math.min(1, Math.max(0.5, 1.3 - far / (30000 * K))) : 1)));
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
          TMPV.set(n.x, n.fy, n.z).applyMatrix4(camera.matrixWorldInverse);
          u.uFireAt.value.set(TMPV.x, TMPV.y, TMPV.z, fire * 30 * K);
        }
        m.n = 0;
        m.k = K;
        m.oy = n.y;
        m.keep = keep;
        m.fat = Math.pow(keep, -0.35);
      }
      this.lightCloud(n.cloud, n, L, t, fire);
      if (n.land) {
        this.cloud(n, t);
        n.dome.mesh.visible = false;
      } else {
        this.column(n, t);
        this.lightCloud(n.dome, n, L, t, fire);
        this.dome(n, t);
      }
      this.surge(n, t);
      m.mesh.geometry.instanceCount = m.n;
      if (m.n) {
        m.at.addUpdateRange(0, m.n * 4);
        m.tint.addUpdateRange(0, m.n * 4);
        m.at.needsUpdate = true;
        m.tint.needsUpdate = true;
      }
    }
  }

  /**
   * The shock itself, as it is seen: a dome of air squeezed dense, racing
   * out from the burst and bending everything seen through its rim, with a
   * ragged skin of condensation flashed onto it in the first two seconds.
   * Drawn until it has run out to the edge of what it does.
   */
  shock(n, t, front, reach, far) {
    const S = n.shock;
    const life = 9.5;
    if (t >= life || front <= 1) { S.visible = false; return; }
    S.visible = true;
    S.scale.set(front, front * 0.92, front);
    S.position.set(n.x, n.y, n.z);
    const u = S.material.uniforms;
    // Stronger the nearer it is to the eye, and dying as it runs out.
    const near = far > 0 ? Math.min(1, Math.max(0.45, 1.4 - far / (14000 * n.k))) : 1;
    u.uBend.value = 0.03 * near * (1 - smooth(0.5, life, t)) * (0.6 + 0.4 * (1 - front / (reach * 1.05)));
    u.uSkin.value = (n.land ? 0.55 : 0.9) * Math.exp(-t / 0.9) * smooth(0, 0.08, t);
    u.uTime.value = t;
  }

  /**
   * Where the fire is for this moment, and how much light it is still
   * giving: nothing is drawn for it, but the cloud is built round it and lit
   * by it. Sets n.R, n.capY and n.fy.
   */
  fireball(n, t) {
    const K = n.k;
    const grow = 1 - Math.exp(-t / 0.45);
    const rise = Math.max(0, t - 1.2);
    const R = NUKE.fireball * (n.land ? 1.4 : 1.15) * grow * (1 + Math.min(0.6, rise * 0.03));
    // Up off the ground as it cools, until it is the heart of the cap: the
    // mushroom is built round it (see cloud).
    n.capY = n.y + NUKE.fireball * 0.8 + (n.land ? 3200 : 2900) * (1 - Math.exp(-rise / 26));
    const y = t < 1.2 ? n.y + R * 0.6 : Math.max(n.y + R * 0.6, n.capY);
    n.fy = n.y + (y - n.y) * K;
    n.R = R;
    if (n.land) return (1 - 0.7 * Math.min(1, t / 22)) * Math.max(0, 1 - t / 80);
    // Over the sea it is drowned at once in the water it throws up.
    n.fy = n.y + 200 * K;
    return Math.exp(-t / 0.7) * 0.9;
  }

  /**
   * The outline of the mushroom at time `t`, as one line from the top of its
   * crown out over the cap, round the rolled rim of it and in underneath to
   * the stem, down the stem to the ground and out along the skirt of dust
   * round its foot -- and how hot and how white it is along that line.
   * Laid out at the B-29's size about the foot of the burst; the mesh is
   * scaled to the burst's own.
   */
  cloud(n, t) {
    const C = n.cloud;
    const age = t - 0.25;
    const life = MUSHROOM_LIFE;
    if (age <= 0) { C.mesh.visible = false; return; }
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
    const sB = Rc * 0.36 + 70;
    // Fire: everything glowing at first (the fireball turning into the
    // cloud), then only its belly and its folds, and then nothing.
    const burn = Math.pow(Math.max(0, 1 - age / 85), 2);
    const flash = Math.exp(-age / 6);
    const W = C.work;
    W.length = 0;
    const put = (r, y, amp, heat, white) => W.push(r, y, amp, Math.min(1.4, heat), white, 0);
    // Its crown.
    const topY = Yc + T * 0.82;
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      put(Rc * u, topY + T * 0.32 * Math.pow(1 - u * u, 1.5), T * 0.5, burn * 0.15 + flash, 0.42);
    }
    // The rolled rim, from the top of it out and down and in underneath.
    for (let i = 1; i <= 64; i++) {
      const ph = Math.PI / 2 - (i / 64) * (Math.PI * 0.5 + Math.PI * 0.68);
      const sn = Math.sin(ph);
      const under = Math.max(0, -sn);
      put(Rc + T * Math.cos(ph), Yc + T * 0.82 * sn, T * 0.55,
        burn * (0.25 + 0.85 * under) + flash, 0.26 + 0.16 * Math.max(0, sn));
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
      put(r, y, T * 0.45, burn * 1.05 + flash, 0.28);
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
        burn * (0.3 + 0.6 * low) + flash * 0.6 * (1 - v), 0.22 + 0.12 * (1 - v));
    }
    // And out round its foot along the ground: the dust drawn in under it.
    if (full) {
      const skirt = sB * (1.5 + 1.6 * grow);
      const hS = sB * 0.5;
      for (let i = 1; i <= 16; i++) {
        const u = i / 16;
        const r = sB + (skirt - sB) * u;
        const y = hS * Math.pow(1 - u, 1.6) * (1 - 0.3 * u) + 2;
        put(r, Math.max(1, y), hS * 0.8, burn * 0.5 * (1 - u), 0.2);
      }
    }
    outline(C);
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
   * Baker's column: the water thrown a mile and more into the air, half a
   * mile across, with the dark cauliflower crown of it -- jets of water
   * flung up and out over its top -- and the spray skirt round its foot.
   * It stands a minute, and then it falls back into the sea, crown first,
   * into the base surge (see surge).
   */
  column(n, t) {
    const C = n.cloud;
    const age = t - 0.1;
    const end = 100;
    if (age <= 0 || t > end) { C.mesh.visible = false; return; }
    // Up at hundreds of metres a second, and then slowing.
    const Hc = 1750 * (1 - Math.exp(-age / 2.4)) + 60;
    const Rcol = 280 + 60 * smooth(0, 10, age);
    // Falling back: the crown spreads and sags and the column goes down.
    const fall = smooth(28, 70, t);
    const top = Hc * (1 - 0.18 * fall);
    const crownH = Math.min(top * 0.5, 160 + Hc * 0.14);
    const Rcr = Rcol * (1.25 + 0.3 * smooth(1, 15, age) + 0.5 * fall);
    // A glare of white-hot steam in the first instant, and then water.
    const hot = Math.exp(-age / 0.5);
    const W = C.work;
    W.length = 0;
    const put = (r, y, amp, heat, white, bias) => W.push(r, y, amp, heat, white, bias);
    // The top of the crown: flat, and jagged with the jets flung up out of
    // it -- the outline's lumps are pushed out along its normal, which here
    // is straight up, so the hard lumping stands them up as spires.
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      put(Rcr * 0.82 * u, top + crownH * 0.12 * (1 - u * u), Rcol * 1.25, hot, 0.5, 0.55);
    }
    // Over its edge and down, the crown bulging out over the column.
    const cx = Rcr * 0.82, cy = top - crownH * 0.5;
    for (let i = 1; i <= 16; i++) {
      const a = Math.PI / 2 - (i / 16) * Math.PI * 1.05;
      put(cx + (Rcr - cx) * 1.1 * Math.cos(a) + (Rcr - cx) * 0.2, cy + crownH * 0.5 * Math.sin(a),
        Rcol * 0.75, hot, 0.48 + 0.12 * (i / 16), 0.5);
    }
    // In under it to the column.
    const yC = top - crownH * 1.05;
    put(Rcol * 1.08, yC, Rcol * 0.4, hot, 0.7, 0.4);
    // Down the column, a little wider as it goes down.
    const hs = Math.min(yC * 0.5, Rcol * 0.7);
    for (let i = 1; i <= 40; i++) {
      const u = i / 40;
      const y = yC + (hs - yC) * u;
      const v = 1 - y / Math.max(1, Hc);
      put(Rcol * (1 + 0.22 * v * v), y, Rcol * 0.24, hot * (1 - u), 0.9, 0.35 * (1 - v));
    }
    // And the spray thrown out round its foot.
    for (let i = 1; i <= 12; i++) {
      const u = i / 12;
      put(Rcol * (1.22 + 1.5 * u), hs * Math.pow(1 - u, 1.4) + 3, Rcol * 0.3 * (1 - 0.5 * u), 0, 0.97, -0.35);
    }
    outline(C);
    const u = C.mesh.material.uniforms;
    u.uL.value = Math.max(60, Rcol * 0.75);
    // The water going up it.
    u.uDrift.value = -age * 9;
    u.uGone.value = smooth(30, end - 2, t);
    C.mesh.scale.setScalar(n.k);
    C.mesh.position.y = n.y;
    C.mesh.visible = true;
  }

  /**
   * The condensation cloud the shock leaves behind it over the sea: the
   * great white dome of every photograph of Baker, standing over the whole
   * burst with the crown of the column just showing over its top, and its
   * foot a bright skirt of fog and spray spread out flat on the water. It
   * comes in a second, and clears from the top down.
   */
  dome(n, t) {
    const C = n.dome;
    const age = t - 0.3;
    const end = 46;
    if (age <= 0 || t > end) { C.mesh.visible = false; return; }
    const g = 1 - Math.exp(-age / 0.85);
    const Rd = 120 + 1380 * g + 4 * age;
    const Hd = Rd * 0.78;
    const W = C.work;
    W.length = 0;
    const put = (r, y, amp, white, bias) => W.push(r, y, amp, 0, white, bias);
    // Over the top and down its sides: a rounded mound, its shoulders full.
    for (let i = 0; i <= 30; i++) {
      const th = (i / 30) * Math.PI * 0.5;
      const s = Math.sin(th), c = Math.cos(th);
      const y = Hd * Math.pow(c, 0.8) + Hd * 0.07;
      // How high up it this is: its top goes first.
      put(Rd * Math.pow(s, 0.7), y, Rd * 0.14, 1, 0.75 * (y / Hd) - 0.15);
    }
    // Its foot, bulging a little and then laid out flat on the water.
    const foot = [[1.04, 0.045, 0.06], [1.12, 0.03, 0.045], [1.22, 0.018, 0.03], [1.3, 0.006, 0.02], [1.33, 0.0, 0.01]];
    for (const [fr, fy, fa] of foot) put(Rd * fr, Hd * fy + 2, Rd * fa, 1, -0.45);
    outline(C);
    const u = C.mesh.material.uniforms;
    // Its lumps: a few great rounded lobes, as a heap of cumulus has.
    u.uL.value = Math.max(80, Rd * 0.55);
    u.uDrift.value = age * 4;
    u.uGone.value = smooth(12, end - 1, t);
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
    // the cap goes up through damp air, and is gone inside a minute. (Over
    // the sea the dome is that, and bigger.)
    if (land && age > 3 && age < 60) {
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
    // The wall of dust or spray racing out with the shock along the ground
    // or the sea: the shock's foot, the thing that shows where it is.
    const front = nukeFront(t, land);
    if (t < 14) {
      // A ring, packed close all the way round so it is one wall and not a
      // string of puffs, as tall as the shock is strong where it has got to.
      const r0 = (85 + 0.028 * front) * (1 + 0.45 * smooth(0, 6, t));
      const N = Math.min(240, Math.max(60, Math.ceil((Math.PI * 2 * front) / (r0 * 0.9))));
      const eye = this.eye, K = n.k;
      const fade = smooth(3, 14, t);
      for (let i = 0; i < N; i++, k++) {
        const a = ((i + hash(i, 2) * 0.6) / N) * Math.PI * 2;
        const rr = front * (0.93 + 0.06 * hash(i + 600, 0));
        const r = r0 * (0.8 + 0.4 * hash(i + 600, 2));
        const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
        let gone = fade;
        if (eye) {
          // Right on top of the eye it is a screenful of mist and nothing
          // to see: it thins out there, and costs nothing.
          const d = Math.hypot(n.x + bx * K - eye.x, n.z + bz * K - eye.z);
          gone = Math.max(gone, 1 - smooth(r * K * 1.2, r * K * 4, d));
        }
        putBillow(m, bx, n.y + r * 0.3 + 14 * hash(i + 600, 1), bz,
          r, land ? 0.42 : 0.97, 0, gone, k);
      }
    }
    // The base surge: low, rolling out from the foot of the stem and hanging
    // there -- dust over the land, a ring of white mist over the sea, where
    // it comes as the column falls back.
    const s = Math.max(0, age - (land ? 0 : 9));
    if (s > 0) {
      const Rb = Math.min(front * 0.8, (land ? 2600 : 3200) * (1 - Math.exp(-s / (land ? 22 : 35))));
      const hb = land ? 110 : 140 + 200 * smooth(0, 60, s);
      for (let i = 0; i < 220; i++, k++) {
        const a = hash(i, 3) * Math.PI * 2;
        const u = Math.sqrt(hash(i + 700, 0));
        const rr = Rb * (0.3 + 0.7 * u);
        const r = (100 + 120 * hash(i + 700, 2)) * Math.min(1, 0.4 + s / 12) * (1.25 - 0.45 * u);
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
   * of the frame a frame, and only for the ten seconds there is a shock.
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
