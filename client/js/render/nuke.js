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
// The cloud is built of billows: each a sphere drawn on a card, lit by the
// sun and the sky and by the fire inside it, lumpy at its edge and in its
// surface off a noise texture, and solid -- it writes its own depth, so one
// billow sits into the next the way the heads of a cumulus do rather than
// lying flat over it. That is what makes it cauliflower and not a heap of
// soft dots, and being solid it costs nothing in sorting or blending.
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
  float rim = 1.05 - 0.62 * bump;
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
  float fold = mix(0.55, 1.0, smoothstep(0.2, 0.7, bump)) * mix(0.75, 1.0, h);
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
  float a = uOpacity * (0.32 + 0.68 * pow(1.0 - face, 1.4)) * smoothstep(0.18, 0.62, n + uOpacity * 0.25);
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

/** How many billows one burst can be made of, solid and as mist. */
const BILLOWS = 900;
const MISTS = 420;

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
    scene.add(parts.billows.mesh);
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
    const billows = billowBatch(BILLOWS);
    billows.mesh.material.uniforms.uDirt.value.copy(land ? LAND_DIRT : SEA_DIRT);
    const mist = billowBatch(MISTS, true);
    mist.mesh.material.uniforms.uDirt.value.copy(land ? LAND_DIRT : SEA_DIRT);
    mist.mesh.renderOrder = 3;
    return { ball, glow, flare, sky, wilson, shock, billows, mist };
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
    for (const b of [p.billows, p.mist]) {
      b.mesh.material.uniforms.uDirt.value.copy(land ? LAND_DIRT : SEA_DIRT);
      b.n = 0;
      b.mesh.geometry.instanceCount = 0;
      b.mesh.visible = true;
    }
    p.wilson.visible = false;
    for (const k of ['ball', 'glow', 'flare', 'sky', 'wilson']) g.add(p[k]);
    g.add(p.billows.mesh);
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
      billows: n.billows, mist: n.mist };
    // Kept for the next burst, made up as it is (see POOL).
    if (this.pool.length < POOL) { this.pool.push(p); return; }
    this.disposeParts(p);
  }

  disposeParts(p) {
    for (const k of ['ball', 'glow', 'flare', 'sky', 'wilson', 'shock']) p[k].material?.dispose?.();
    for (const b of [p.billows, p.mist]) {
      b.mesh.material.dispose();
      b.mesh.geometry.dispose();
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
      const bend = 0.075 * Math.max(0, 1 - t / 11) * Math.min(1, t * 8);
      n.shock.visible = bend > 1e-4;
      n.shock.scale.setScalar(Math.max(1, front));
      n.shock.position.y = n.y * 0.5;
      n.shock.material.uniforms.uBend.value = bend;
      n.shock.material.uniforms.uSkin.value = 1.2 * Math.exp(-t / 1.2);
      // The condensation cloud, the cap of Baker, and on land a brief skirt.
      this.wilson(n, t, front, L);
      // The cloud: not built at all when it is out of sight.
      const seen = !camera || this.frustum.intersectsSphere(
        TMPS.set(TMPV.set(n.x, n.y + 1600 * K, n.z), 4200 * K));
      n.billows.mesh.visible = n.mist.mesh.visible = seen;
      if (!seen) continue;
      // How many of its billows are worth drawing: all of the B-29's close
      // to, fewer for a smaller burst, a far one, or one of several.
      const keep = Math.min(1, Math.max(0.3,
        (0.55 + 0.3 * K) * crowd * (far > 0 ? Math.min(1, Math.max(0.55, 1.35 - far / (30000 * K))) : 1)));
      if (camera) TMPV.set(n.x, n.ball.position.y, n.z).applyMatrix4(camera.matrixWorldInverse);
      for (const b of [n.billows, n.mist]) {
        const u = b.mesh.material.uniforms;
        u.uTime.value = t;
        u.uSunDir.value.copy(L.dir);
        u.uSun.value.copy(L.sun);
        u.uSky.value.copy(L.sky);
        u.uGround.value.copy(L.ground);
        u.uFire.value.copy(FIRE);
        // The fireball's light on the cloud, in the eye's frame.
        if (camera) u.uFireAt.value.set(TMPV.x, TMPV.y, TMPV.z, fire * 30 * K);
        b.n = 0;
        b.k = K;
        b.oy = n.y;
        b.keep = keep;
        b.fat = Math.pow(keep, -0.35);
      }
      if (n.land) this.mushroom(n, t);
      else this.column(n, t);
      for (const b of [n.billows, n.mist]) {
        b.mesh.geometry.instanceCount = b.n;
        b.at.needsUpdate = true;
        b.tint.needsUpdate = true;
      }
    }
  }

  /** The fireball for this moment; returns how much light it is still giving. */
  fireball(n, t) {
    const K = n.k;
    const grow = 1 - Math.exp(-t / 0.45);
    const rise = Math.max(0, t - 1.5);
    // On the ground nothing of it goes into boiling the sea: it is bigger,
    // brighter, and it burns for longer. Worked out at the B-29's size, as the
    // cloud is (see putBillow), and drawn at the burst's own.
    const R = NUKE.fireball * (n.land ? 1.4 : 1) * grow * (1 + Math.min(0.6, rise * 0.03));
    let y, opacity, cool;
    if (n.land) {
      // Up off the ground as it cools, until it is the heart of the cap.
      n.capY = n.y + NUKE.fireball * 0.8 + 3200 * (1 - Math.exp(-rise / 26));
      y = Math.max(n.y + R * 0.6, t < 1.5 ? n.y + R * 0.6 : n.capY);
      cool = Math.min(1, t / 22);
      opacity = Math.max(0, 1 - Math.max(0, t - 12) / 24);
    } else {
      // In the sea it is swallowed by the water it throws up in a second or
      // two: what is left is the column.
      y = n.y + R * 0.35;
      cool = Math.min(1, t / 2.2);
      opacity = Math.max(0, 1 - Math.max(0, t - 0.9) / 1.6);
    }
    n.ball.scale.setScalar(Math.max(1, R * K));
    n.ball.position.y = n.y + (y - n.y) * K;
    const u = n.ball.material.uniforms;
    u.uCool.value = cool;
    u.uTime.value = t;
    u.uOpacity.value = opacity;
    n.ball.visible = opacity > 0.01;
    n.R = R;
    return (1 - cool * 0.7) * (n.land ? Math.max(0, 1 - t / 80) : Math.max(0, 1 - t / 4));
  }

  /** The smooth white condensation cloud, out behind the shock and gone. */
  wilson(n, t, front, L) {
    const K = n.k;
    const w = n.wilson;
    const u = w.material.uniforms;
    u.uTime.value = t;
    // White fog, lit by the sky and the sun the way the cloud is -- and by
    // the flash, which at night is the only light on it.
    const glow = 0.5 * Math.exp(-t / 3);
    TMPC.copy(L.sky).multiplyScalar(0.8);
    u.uLit.value.copy(L.sun).multiplyScalar(0.7).add(TMPC).multiplyScalar(1 / Math.PI)
      .addScalar(0.12 + glow);
    // A dome standing on the water or the ground over the whole burst, out
    // just behind the shock: as the shock passes, the damp air it leaves
    // behind it is cooled into fog, and the fog clears again as it warms.
    let op, r, thin;
    if (n.land) {
      // Over dry land there is less in the air to condense: thinner, and
      // gone in a few seconds, round a fireball that is still rising.
      op = t < 0.3 ? 0 : Math.min(0.55, (t - 0.3) * 1.4) * (1 - smooth(3, 8, t));
      r = Math.min(front * 0.9, 2600 * K);
      thin = 0.6 + 0.4 * smooth(1, 5, t);
    } else {
      // Over the sea it is Baker's: a wall of white over the whole fleet in
      // the first second, the column's head bursting up through its top,
      // and clearing from the top down in a quarter of a minute.
      op = t < 0.2 ? 0 : Math.min(0.96, (t - 0.2) * 2.2) * (1 - smooth(12, 34, t));
      r = Math.min(front * 0.92, 2900 * K) + Math.max(0, t - 4) * 22 * K;
      thin = 0.15 + 0.85 * smooth(2.5, 12, t);
    }
    w.scale.set(r, r, r);
    w.position.y = n.y + 1.5;
    u.uShape.value.set(n.y + 1.5, r, thin);
    u.uOpacity.value = op;
    w.visible = op > 0.01;
  }

  /**
   * Baker: the column of water, its cauliflower head, the spray thrown out
   * round its foot in the first seconds, and the base surge rolling out over
   * the sea as it falls back.
   */
  column(n, t) {
    const b = n.billows;
    const m = n.mist;
    if (t < 0.15) return;
    let k = 0;
    // The column: up a mile in a few seconds, standing for a dozen, then
    // falling back into itself.
    const up = 1 - Math.exp(-t / 1.4);
    const fall = smooth(30, 150, t);
    const H = 1850 * up * (1 - 0.85 * fall);
    const Rc = 300 + 120 * up + 160 * fall;
    const gone = smooth(45, 210, t);
    for (let i = 0; i < 230; i++, k++) {
      const u = hash(i, 0);
      const a = hash(i, 1) * Math.PI * 2 + t * 0.02 * (hash(i, 2) - 0.5);
      // Mostly on its skin, which is all that can be seen of it.
      const rr = Rc * (0.62 + 0.38 * Math.sqrt(hash(i, 3)));
      const y = n.y + H * u;
      const r = (100 + 70 * hash(i, 4)) * (0.8 + 0.4 * up) * (1 + fall * 0.6);
      putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, r, 0.93 + 0.07 * hash(i, 5), 0, gone, k);
    }
    // Its head: a cauliflower of spray on top of it, spreading as it stands.
    const Rh = 360 + 260 * up + Math.min(260, t * 5) + 300 * fall;
    const hy = n.y + H + Rh * 0.15 - fall * 400;
    for (let i = 0; i < 170; i++, k++) {
      const a = hash(i, 6) * Math.PI * 2;
      const el = Math.asin(hash(i, 7) * 1.4 - 0.4);
      const rr = Rh * (0.55 + 0.45 * hash(i, 8));
      const x = Math.cos(a) * Math.cos(el) * rr;
      const z = Math.sin(a) * Math.cos(el) * rr;
      const y = hy + Math.sin(el) * rr * 0.75;
      const r = Rh * (0.2 + 0.16 * hash(i, 9));
      putBillow(b, x, y, z, r * Math.min(1, up * 1.3), 0.9 + 0.1 * hash(i, 10), 0, smooth(35, 180, t), k);
    }
    // The spray thrown out round its foot in the first seconds: a mound of
    // white water banked up against the column, lower further out.
    if (t < 90) {
      const R0 = 250 + 1000 * (1 - Math.exp(-t / 2.2));
      for (let i = 0; i < 130; i++, k++) {
        const a = hash(i, 11) * Math.PI * 2;
        const u = Math.sqrt(hash(i, 12));
        const rr = Rc * 0.8 + (R0 - Rc * 0.8) * u;
        const r = (150 - 90 * u) * (0.7 + 0.6 * hash(i, 14)) * Math.min(1, t * 1.5);
        const y = n.y + r * (0.35 + 0.6 * (1 - u)) * (1 + 0.8 * hash(i, 13));
        putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, r, 0.95, 0, smooth(25, 90, t), k);
      }
    }
    // The spray jets: the sea thrown out of the crater in the water in
    // great curving plumes, out past the column's foot and falling back, in
    // the first quarter of a minute -- the spokes every film of Baker shows.
    if (t < 26) {
      const out = 1 - Math.exp(-t / 1.6);
      const fade = smooth(9, 26, t);
      for (let j = 0; j < 36; j++) {
        const a = hash(j + 900, 0) * Math.PI * 2;
        const reachJ = (900 + 900 * hash(j + 900, 1)) * out;
        const lift = (700 + 900 * hash(j + 900, 2)) * out;
        for (let q = 0; q < 4; q++, k++) {
          const u = 0.3 + 0.7 * (q / 3);
          // A plume's arc: up steeply off the foot and over, curving down.
          const rr = Rc * 0.7 + reachJ * u;
          const y = n.y + lift * Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)) * (1 - 0.6 * smooth(4, 20, t) * u);
          const r = (70 + 60 * (1 - u) + 40 * hash(j + 900, 3)) * (0.6 + 0.6 * out);
          putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, r, 0.96, 0, Math.max(fade, 1 - Math.min(1, t * 3)), k);
        }
      }
    }
    // The base surge: what falls out of the column, rolling out over the sea
    // in a ring of white a mile and more across, and hanging there.
    if (t > 7) {
      const s = t - 7;
      const Rb = 400 + 3000 * (1 - Math.exp(-s / 40));
      const hb = 140 + 300 * smooth(0, 60, s);
      const thin = smooth(150, NUKE.life - 5, t);
      for (let i = 0; i < 260; i++, k++) {
        const a = hash(i, 15) * Math.PI * 2;
        const rr = Rb * (0.35 + 0.65 * Math.sqrt(hash(i + 300, 0)));
        const y = n.y + hb * (0.25 + 0.75 * hash(i + 300, 1));
        const r = (150 + 160 * hash(i + 300, 2)) * (0.6 + 0.4 * smooth(0, 20, s));
        putBillow(m, Math.cos(a) * rr, y, Math.sin(a) * rr, r, 0.9, 0,
          Math.max(thin, 1 - smooth(0, 6, s)), k);
      }
    }
  }

  /**
   * On the ground: the cap rolling over itself, the stem drawn up into it,
   * the collar of condensation round the stem, and the dust going out.
   */
  mushroom(n, t) {
    const b = n.billows;
    const m = n.mist;
    if (t < 0.5) return;
    const age = t - 0.5;
    let k = 0;
    const capY = n.capY ?? n.y + NUKE.fireball;
    const R = n.R || NUKE.fireball;
    // How long the fire shows in it: bright at first, and still glowing in
    // its heart for well over a minute, and hanging there for minutes more.
    const burn = Math.max(0, 1 - age / 85);
    const thin = smooth(200, MUSHROOM_LIFE - 5, t);
    // The cap: a vortex ring, turning over on itself and widening as it climbs.
    const Rt = R * 0.8 + 950 * (1 - Math.exp(-age / 28));
    const tube = Rt * 0.55;
    const grow = Math.min(1, age / 2.5);
    for (let i = 0; i < 330; i++, k++) {
      const a = hash(i, 1) * Math.PI * 2;
      const roll = hash(i, 2) * Math.PI * 2 + age * 0.22;
      const tr = tube * (0.55 + 0.45 * hash(i, 3));
      const rr = Rt * 0.72 + Math.cos(roll) * tr;
      const y = capY + Math.sin(roll) * tr * 0.72;
      const r = tube * (0.32 + 0.24 * hash(i, 4)) * grow;
      // The fire is in the heart of the ring and under it, where it is
      // still being fed from the stem.
      const inner = 0.5 - 0.5 * Math.cos(roll) * 0.6 - 0.4 * Math.sin(roll);
      const heat = burn * burn * Math.min(1, inner * 1.3) * (0.5 + 0.5 * hash(i, 5));
      putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, r, 0.55 + 0.35 * hash(i, 6), heat, thin, k);
    }
    // Its crown, so the top of it is closed.
    for (let i = 0; i < 90; i++, k++) {
      const a = hash(i, 7) * Math.PI * 2;
      const el = 0.25 + hash(i, 8) * 1.2;
      const rr = Rt * (0.9 + 0.2 * hash(i, 9));
      const x = Math.cos(a) * Math.cos(el) * rr * 0.85;
      const z = Math.sin(a) * Math.cos(el) * rr * 0.85;
      const y = capY + tube * 0.2 + Math.sin(el) * rr * 0.55;
      putBillow(b, x, y, z, tube * (0.3 + 0.2 * hash(i, 10)) * grow, 0.7 + 0.25 * hash(i, 11),
        burn * burn * 0.15, thin, k);
    }
    // The stem: drawn up off the ground into the cap, narrow in its waist,
    // with the fire still in it low down.
    const top = capY - tube * 0.6;
    const sr = 250 + Math.min(300, age * 7);
    for (let i = 0; i < 200; i++, k++) {
      const u = hash(i, 12);
      const y = n.y + (top - n.y) * Math.min(1, u * Math.min(1, age / 5));
      const waist = 0.6 + 0.4 * Math.abs(u - 0.45) * 2;
      const rr = sr * waist * (0.45 + 0.55 * Math.sqrt(hash(i, 13)));
      const a = hash(i, 14) * Math.PI * 2 + age * 0.12 * (u - 0.5);
      const r = (120 + 90 * hash(i, 15)) * (0.8 + 0.4 * Math.min(1, age / 10));
      const heat = burn * burn * Math.max(0, 1 - u * 1.1) * (0.4 + 0.6 * hash(i + 400, 0));
      putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, r, 0.45 + 0.3 * u, heat, thin, k);
    }
    // The ground under it, alight: everything that will burn for a mile
    // round the foot of the stem, low and red under the smoke.
    if (age < 120) {
      const Rg = 300 + 1300 * (1 - Math.exp(-age / 3));
      const blaze = (1 - smooth(40, 120, age)) * Math.min(1, age * 2);
      for (let i = 0; i < 50; i++, k++) {
        const a = hash(i + 800, 0) * Math.PI * 2;
        const rr = Rg * Math.sqrt(hash(i + 800, 1));
        const r = (60 + 80 * hash(i + 800, 2)) * (0.6 + 0.4 * Math.min(1, age / 6));
        putBillow(b, Math.cos(a) * rr, n.y + r * 0.5, Math.sin(a) * rr, r, 0.35,
          blaze * (0.5 + 0.5 * hash(i + 800, 3)), Math.max(thin, 1 - blaze), k);
      }
    }
    // The pileus: a smooth white ice-cap the climbing cloud pushes up into
    // the cold air over it, sitting on its crown for a few seconds before
    // the cap boils up through it.
    if (age > 2 && age < 26) {
      const py = capY + tube * 1.35 + 120;
      const pr = Rt * 1.25;
      const form = smooth(2, 5, age);
      const go = smooth(14, 26, age);
      for (let i = 0; i < 54; i++, k++) {
        const a = hash(i + 1000, 0) * Math.PI * 2;
        const u = Math.sqrt(hash(i + 1000, 1));
        const rr = pr * u;
        const y = py + (1 - u * u) * tube * 0.35 + age * 10;
        putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, (90 + 70 * hash(i + 1000, 2)) * form * (1.2 - 0.4 * u),
          1, 0, go, k);
      }
    }
    // Wreckage and burning stuff flung out of the fireball on long arcs,
    // trailing fire, and coming down far out over the ground.
    if (age < 16) {
      for (let i = 0; i < 44; i++, k++) {
        const a = hash(i + 1100, 0) * Math.PI * 2;
        const v = 120 + 160 * hash(i + 1100, 1);
        const el = 0.5 + 0.7 * hash(i + 1100, 2);
        const tt = Math.min(age, 15);
        const rr = 150 + v * Math.cos(el) * tt;
        const y = n.y + 80 + v * Math.sin(el) * tt - 0.5 * 18 * tt * tt;
        if (y < n.y + 10) continue;
        const burnE = Math.max(0, 1 - age / 14);
        putBillow(b, Math.cos(a) * rr, y, Math.sin(a) * rr, 26 + 22 * hash(i + 1100, 3), 0.3,
          burnE * (0.7 + 0.3 * hash(i + 1100, 4)), smooth(10, 16, age), k);
      }
    }
    // The collar: a ring of white condensation that forms round the stem as
    // the cap goes up through damp air, and is gone inside a minute.
    if (age > 3 && age < 60) {
      const cy = n.y + (capY - n.y) * 0.42;
      const cr = sr * 2.2 + 120 + age * 12;
      const fade = 1 - smooth(30, 60, age);
      const form = smooth(3, 6, age);
      for (let i = 0; i < 80; i++, k++) {
        const a = (i / 80) * Math.PI * 2 + hash(i, 1) * 0.08;
        const rr = cr * (0.9 + 0.12 * hash(i + 500, 0));
        putBillow(b, Math.cos(a) * rr, cy + (hash(i + 500, 1) - 0.5) * 30, Math.sin(a) * rr,
          (60 + 40 * hash(i + 500, 2)) * form, 1, 0, 1 - fade, k);
      }
    }
    // The dust thrown up by the shock where it struck the ground, in the
    // first seconds, and the base surge after it rolling out along the ground.
    // The shock across the ground is a wall of dust racing out with it --
    // the thing that shows where it is.
    const front = nukeFront(t, true);
    if (t < 20) {
      for (let i = 0; i < 130; i++, k++) {
        const a = hash(i, 2) * Math.PI * 2;
        const rr = front * (0.86 + 0.12 * hash(i + 600, 0));
        const r = (110 + 130 * hash(i + 600, 2)) * (1 + 0.6 * smooth(0, 8, t));
        putBillow(m, Math.cos(a) * rr, n.y + r * 0.4 + 60 * hash(i + 600, 1), Math.sin(a) * rr,
          r, 0.42, 0, smooth(4, 20, t), k);
      }
    }
    // Low, and pale with dust: a skirt round the foot of the stem, not a
    // second cloud.
    const Rb = Math.min(front * 0.8, 2600 * (1 - Math.exp(-age / 22)));
    for (let i = 0; i < 200; i++, k++) {
      const a = hash(i, 3) * Math.PI * 2;
      const u = Math.sqrt(hash(i + 700, 0));
      const rr = Rb * (0.25 + 0.75 * u);
      const r = (70 + 80 * hash(i + 700, 2)) * Math.min(1, 0.4 + age / 12) * (1.25 - 0.45 * u);
      const y = n.y + r * 0.45 + 110 * hash(i + 700, 1) * (1 - u) * Math.min(1, age / 8);
      putBillow(m, Math.cos(a) * rr, y, Math.sin(a) * rr, r * 1.2, 0.6 + 0.3 * hash(i + 700, 3), 0,
        Math.max(thin, smooth(120, 260, t)), k);
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
