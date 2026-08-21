// Fire, smoke and embers, drawn procedurally.
//
// The build ships as one file with no textures to load, so the flames are a
// fragment shader rather than a sprite sheet: domain-warped fbm noise sampled
// on a rising, tapering field, then read through a temperature ramp — dull red
// at the edges where the gas is coolest, white-yellow in the core. That gives
// detail at whatever resolution the screen has, instead of a fixed sprite that
// goes soft when it fills the frame.
//
// The quads are cylindrical billboards: they turn to face the camera about the
// vertical axis only, so a flame stays upright however the view rolls.

import * as THREE from '../../../vendor/three.module.js';

export const NOISE = /* glsl */`
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Rotating each octave stops the lattice of the value noise showing through as
// a grid, which is what makes cheap fbm look like cheap fbm. Six octaves: the
// camera stands well off the fires now, so each flame covers few enough pixels
// to afford the detail that keeps it from going soft.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 6; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}
`;

// Both flame and smoke stand on the ground and face the camera about the
// vertical, so they share a vertex stage.
const BILLBOARD_VERT = /* glsl */`
uniform vec2 uSize;
uniform float uLean;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 look = cameraPosition - centre;
  look.y = 0.0;
  look = normalize(look);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), look));

  float h = position.y + 0.5;
  // The column leans with height, the way a plume bends off in a breeze.
  vec3 world = centre
    + right * (position.x * uSize.x + uLean * h * h * uSize.x)
    + vec3(0.0, h * uSize.y, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FLAME_FRAG = /* glsl */`
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
uniform vec3 uTint;
varying vec2 vUv;
${NOISE}

/** Roughly a blackbody sweep: the hotter the gas, the further up this runs. */
vec3 flameColour(float d) {
  vec3 c = mix(vec3(0.26, 0.020, 0.003), vec3(0.95, 0.20, 0.015), smoothstep(0.00, 0.34, d));
  c = mix(c, vec3(1.00, 0.52, 0.07), smoothstep(0.30, 0.60, d));
  c = mix(c, vec3(1.00, 0.83, 0.32), smoothstep(0.58, 0.86, d));
  c = mix(c, vec3(1.00, 0.97, 0.86), smoothstep(0.86, 1.00, d));
  return c;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.9 + uSeed * 31.7;

  // The column wanders about its own axis as it climbs. Without this the
  // envelope is a straight-sided cone, and a cone reads as a cut-out.
  float wob = fbm(vec2(uSeed * 17.0, uv.y * 2.4 - t * 0.8)) - 0.5;
  float cx = 0.5 + wob * 0.55 * pow(uv.y, 1.25);

  vec2 p = vec2((uv.x - 0.5) * 3.4, uv.y * 1.35 - t);
  vec2 warp = vec2(fbm(p * 1.6 + uSeed), fbm(p * 1.6 + 9.2 + uSeed));
  float n = fbm(p + warp * 0.8);
  float fine = fbm(p * 4.6 + warp * 1.5);
  // A third scale, drifting faster than the other two: this is what reads as
  // gas actually moving rather than a pattern sliding upward.
  float grain = fbm(p * 11.0 + vec2(0.0, -t * 1.7) + warp * 0.6);

  // Widest at the root, tapering as the gas rises and cools.
  float taper = mix(0.44 + uSeed * 0.20, 0.05 + uSeed * 0.06, pow(uv.y, 0.62 + uSeed * 0.30));
  float r = abs(uv.x - cx) / max(taper, 0.001);
  float body = 1.0 - smoothstep(0.15, 1.0, r);
  body *= smoothstep(0.0, 0.05, uv.y) * (1.0 - smoothstep(0.30, 1.0, uv.y));

  // Combustion is continuous down at the seat and breaks into separate tongues
  // as it rises, so the noise is allowed to cut deeper the higher it goes.
  float bite = mix(0.12, 1.05, pow(uv.y, 0.70));
  float mask = clamp((n - 0.5) * 2.6 + 1.0 - bite, 0.0, 1.0);
  mask = smoothstep(0.0, 0.55, mask);

  // Fine noise frays the edge, where the sheet is thin enough for it to tell,
  // and the grain breaks the body up into separate sheets of flame.
  float d = body * mask - fine * 0.22 * smoothstep(0.1, 0.9, uv.y);
  d *= 0.72 + 0.28 * grain;
  d = clamp(d, 0.0, 1.0);
  if (d < 0.004) discard;

  // Temperature is not the same thing as thickness: the core is white even
  // where the sheet is thin, and the fringes stay red even where it is not.
  float heat = clamp(d * 0.55 + (1.0 - r * 0.8) * (1.0 - pow(uv.y, 0.75)) * 0.75
                     + grain * 0.14 * (1.0 - uv.y), 0.0, 1.0);
  gl_FragColor = vec4(flameColour(heat) * uTint, clamp(d * uIntensity, 0.0, 1.0));
}
`;

const SMOKE_FRAG = /* glsl */`
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform vec3 uLit;
varying vec2 vUv;
${NOISE}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.16 + uSeed * 13.3;

  // A plume widens as it climbs, so the field is sampled through a spreading
  // horizontal coordinate rather than the raw uv.
  float spread = 0.22 + uv.y * 1.05;
  vec2 p = vec2((uv.x - 0.5) / spread * 2.6, uv.y * 1.1 - t);
  vec2 warp = vec2(fbm(p * 1.1 + uSeed), fbm(p * 1.1 + 4.4 + uSeed));
  float n = fbm(p + warp * 0.9);

  float across = 1.0 - smoothstep(0.35, 1.0, abs(uv.x - 0.5) / spread);
  float rise = smoothstep(0.0, 0.22, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y));
  float d = across * rise * smoothstep(0.26, 0.78, n);
  d = clamp(d * uOpacity, 0.0, 1.0);
  if (d < 0.004) discard;

  // Soot is nearly black, but the underside of a column over a fire is lit by
  // it; that glow is most of what makes a night pall read.
  float glow = pow(1.0 - uv.y, 3.0);
  vec3 col = mix(vec3(0.055, 0.048, 0.045), vec3(0.12, 0.105, 0.10), n);
  col = mix(col, uLit, glow * 0.75);
  gl_FragColor = vec4(col, d);
}
`;

// Embers are drawn as points, and climb entirely in the vertex stage so the
// CPU never touches them.
const EMBER_VERT = /* glsl */`
uniform float uTime;
uniform float uScale;
attribute vec3 seed;
varying float vLife;

void main() {
  float speed = 5.0 + seed.z * 11.0;
  float life = fract(uTime * (0.055 + seed.z * 0.05) + seed.x);
  vLife = life;

  float climb = life * speed * 9.0;
  // Wander, so they do not rise in visible columns.
  float sway = sin(uTime * (0.7 + seed.y) + seed.x * 40.0) * (1.6 + life * 9.0);
  float drift = cos(uTime * (0.5 + seed.z) + seed.y * 33.0) * (1.2 + life * 7.0);

  vec3 pos = position + vec3(sway, climb, drift);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (1.0 - life * 0.55) * (300.0 / max(1.0, -mv.z));
}
`;

const EMBER_FRAG = /* glsl */`
varying float vLife;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float core = 1.0 - smoothstep(0.0, 0.25, r);
  // They cool as they climb: yellow at the fire, dull red before they go out.
  vec3 col = mix(vec3(1.0, 0.86, 0.42), vec3(0.85, 0.16, 0.03), vLife);
  float fade = (1.0 - smoothstep(0.55, 1.0, vLife)) * smoothstep(0.0, 0.05, vLife);
  gl_FragColor = vec4(col, core * fade * 0.9);
}
`;

const QUAD = new THREE.PlaneGeometry(1, 1, 1, 1);

/** Fires, the smoke off them, the embers they throw, and the light they cast. */
export class FireSystem {
  constructor(scene, { emberCount = 900 } = {}) {
    this.scene = scene;
    this.time = 0;
    this.flames = [];
    this.smoke = [];
    this.lights = [];
    this.emberCount = emberCount;
    this.emberSeeds = [];
    this.emberPositions = [];
  }

  /**
   * One seat of fire. `layers` stacks flame quads at slightly different scales
   * and phases so the column has depth instead of reading as one flat card.
   */
  addFire(x, y, z, {
    width = 16, height = 34, layers = 3, intensity = 1,
    smokeWidth = 90, smokeHeight = 320, lean = 0.28,
    light = true, lightRange = 420, embers = 40, tint = new THREE.Color(1, 1, 1),
  } = {}) {
    for (let i = 0; i < layers; i++) {
      const f = i / Math.max(1, layers - 1);
      const mat = new THREE.ShaderMaterial({
        vertexShader: BILLBOARD_VERT,
        fragmentShader: FLAME_FRAG,
        uniforms: {
          uTime: { value: Math.random() * 100 },
          uSeed: { value: Math.random() },
          uIntensity: { value: intensity * (1 - f * 0.3) * (2.4 / layers) },
          uTint: { value: tint.clone() },
          uSize: { value: new THREE.Vector2(width * (1 - f * 0.35), height * (1 - f * 0.28)) },
          uLean: { value: lean * (0.6 + f) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(QUAD, mat);
      mesh.position.set(x + (Math.random() - 0.5) * width * 0.35, y,
        z + (Math.random() - 0.5) * width * 0.35);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      this.flames.push({
        mesh, mat, base: intensity * (1 - f * 0.3) * (2.4 / layers), phase: Math.random() * 10,
      });
    }

    if (smokeHeight > 0) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BILLBOARD_VERT,
        fragmentShader: SMOKE_FRAG,
        uniforms: {
          uTime: { value: Math.random() * 100 },
          uSeed: { value: Math.random() },
          uOpacity: { value: 0.85 },
          uLit: { value: new THREE.Color(0.55, 0.20, 0.05) },
          uSize: { value: new THREE.Vector2(smokeWidth, smokeHeight) },
          uLean: { value: lean * 2.4 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(QUAD, mat);
      mesh.position.set(x, y + height * 0.25, z);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      this.scene.add(mesh);
      this.smoke.push({ mesh, mat });
    }

    if (light) {
      const l = new THREE.PointLight(0xff7a26, 3.0 * intensity, lightRange * 1.8, 1.15);
      l.position.set(x, y + height * 0.35, z);
      this.scene.add(l);
      this.lights.push({ light: l, base: 3.0 * intensity, phase: Math.random() * 10 });
    }

    for (let i = 0; i < embers; i++) {
      this.emberPositions.push(
        x + (Math.random() - 0.5) * width * 1.4,
        y + Math.random() * height * 0.5,
        z + (Math.random() - 0.5) * width * 1.4,
      );
      this.emberSeeds.push(Math.random(), Math.random(), Math.random());
    }
  }

  /** Call once every fire has been placed. */
  buildEmbers(size = 2.6) {
    if (!this.emberPositions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.emberPositions, 3));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(this.emberSeeds, 3));
    this.emberMat = new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: size } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, this.emberMat);
    pts.frustumCulled = false;
    pts.renderOrder = 11;
    this.scene.add(pts);
    this.embers = pts;
  }

  update(dt) {
    this.time += dt;
    for (const f of this.flames) {
      f.mat.uniforms.uTime.value += dt;
      // Flicker from two beats that do not share a period, so it never pulses.
      const a = Math.sin(this.time * 7.3 + f.phase);
      const b = Math.sin(this.time * 2.9 + f.phase * 2.1);
      f.mat.uniforms.uIntensity.value = f.base * (0.86 + 0.1 * a + 0.06 * b);
    }
    for (const s of this.smoke) s.mat.uniforms.uTime.value += dt;
    for (const l of this.lights) {
      const a = Math.sin(this.time * 6.1 + l.phase);
      const b = Math.sin(this.time * 11.7 + l.phase * 1.7);
      l.light.intensity = l.base * (0.82 + 0.13 * a + 0.07 * b);
    }
    if (this.emberMat) this.emberMat.uniforms.uTime.value += dt;
  }
}
