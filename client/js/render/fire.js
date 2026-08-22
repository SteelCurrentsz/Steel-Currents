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

// The cheap one. Smoke is soft and the fine grain in a flame is nearly all
// carried by its first octaves, so those two pay for three lookups instead of
// six — and between them they cover most of the screen.
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}
`;

// Both flame and smoke stand on the ground and face the camera about the
// vertical, so they share a vertex stage.
// One vertex stage for every seat of fire in the port.
//
// These used to be a mesh apiece — a hundred-odd draw calls for the flames and
// their haloes alone, on a screen that is doing nothing else. They are drawn as
// instances now: the card's position, size, lean and shape ride in per-instance
// attributes, so the whole waterfront goes out in one call. Additive blending
// is order-independent, which is what makes it safe to give up the per-card
// depth sort.
//
// The cards are cylindrical billboards: they turn to face the camera about the
// vertical axis only, so a flame stays upright however the view rolls.
const BILLBOARD_VERT = /* glsl */`
uniform float uFogDensity;
attribute vec3 iPos;
attribute vec3 iCard;    // width, height, lean
attribute vec4 iShape;   // cells across, cells up, climb rate, seat depth
attribute vec3 iTrim;    // seed, tip width, intensity
varying vec2 vUv;
varying float vFog;
varying vec3 vShape;     // cells across, cells up, climb rate
varying vec2 vTrim;      // seat depth, tip width
varying vec2 vLevel;     // seed, intensity

void main() {
  vUv = uv;
  vec3 look = cameraPosition - iPos;
  look.y = 0.0;
  look = normalize(look);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), look));

  float h = position.y + 0.5;
  // The column leans with height, the way a plume bends off in a breeze.
  vec3 world = iPos
    + right * (position.x * iCard.x + iCard.z * h * h * iCard.x)
    + vec3(0.0, h * iCard.y, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  // The same exponential-squared haze the rest of the scene is drawn through.
  // Without it a fire two thousand metres off is the one thing in the frame
  // that has no air in front of it, and it sits on the picture rather than in
  // it — which is most of what makes procedural fire look pasted on.
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);

  vShape = iShape.xyz;
  vTrim = vec2(iShape.w, iTrim.y);
  vLevel = iTrim.xz;
  gl_Position = projectionMatrix * mv;
}
`;

// Everything the flame is shaped by is in metres rather than in fractions of
// the card, which is what makes a big fire read as a big fire: a tongue of
// flame is the same size whether it is coming off a drum or off a burning
// warehouse, and it climbs at the same speed, so the eye reads the scale off
// the motion.
const FLAME_FRAG = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying float vFog;
varying vec3 vShape;
varying vec2 vTrim;
varying vec2 vLevel;
${NOISE}

/**
 * Blackbody, near enough. A real fire is only white where the gas is thickest
 * and lowest; by the time it is a third of the way up the column it is orange,
 * and the tips are deep red going to soot. Running the whole ramp on thickness
 * alone is what makes procedural fire look like a lava lamp.
 */
vec3 flameColour(float h) {
  vec3 c = mix(vec3(0.09, 0.008, 0.002), vec3(0.62, 0.09, 0.008), smoothstep(0.00, 0.20, h));
  c = mix(c, vec3(0.98, 0.24, 0.020), smoothstep(0.18, 0.42, h));
  c = mix(c, vec3(1.00, 0.52, 0.070), smoothstep(0.40, 0.62, h));
  c = mix(c, vec3(1.00, 0.80, 0.260), smoothstep(0.60, 0.82, h));
  c = mix(c, vec3(1.00, 0.95, 0.760), smoothstep(0.82, 0.96, h));
  return c;
}

void main() {
  vec2 uv = vUv;
  float seed = vLevel.x;
  // Time in noise units. A column three times as tall takes three times as
  // long to carry a tongue from its seat to its head, and that is the whole
  // difference between a bonfire and a burning oil farm.
  float t = uTime * vShape.z + seed * 31.7;

  // ---- the cheap part: where the fire can be at all ------------------------
  // Everything down to the discard costs two small noise lookups. Most of a
  // flame quad is empty air, and paying the full domain-warped field for it is
  // most of what the shader used to spend its time on.

  // The column wanders about its own axis as it climbs, and the wander grows
  // with height: the gas at the seat is held in place by what is burning, and
  // everything above it is free to be pushed about. Slow, in the same clock as
  // the climb, so a tall column sways rather than shivers.
  float wob = fbm3(vec2(seed * 17.0, uv.y * 2.4 - t * 0.34)) - 0.5;
  float shear = fbm3(vec2(seed * 5.3 + 40.0, uv.y * 1.1 - t * 0.16)) - 0.5;
  float cx = 0.5 + wob * 0.40 * pow(uv.y, 1.25) + shear * 0.30 * pow(uv.y, 1.8);

  // Widest at the root, and for a big fire still broad at the head — a
  // conflagration does not come to a point, it stands up as a wall and rolls
  // over at the top.
  float taper = mix(0.50 + seed * 0.16, vTrim.y * (0.85 + seed * 0.3), pow(uv.y, 0.70));
  float r = abs(uv.x - cx) / max(taper, 0.001);
  float body = 1.0 - smoothstep(0.12, 1.0, r);
  body *= smoothstep(0.0, 0.03, uv.y) * (1.0 - smoothstep(0.40, 1.0, uv.y));

  // The seat: the bed of fire over whatever is actually burning. It is wider
  // than the column, near solid, and barely flickers — a fire without one is a
  // ribbon floating in the air. Its depth is set in metres, so a big seat is a
  // deep bed of flame and not a bright line along the bottom of the quad.
  float bedW = 1.0 - smoothstep(0.25, 0.95, abs(uv.x - 0.5) / (taper * 1.7 + 0.12));
  // ...and it has to be out before the edge of the quad, or the quad is what
  // you see: a bright bar the full width of the card, sitting on the water.
  bedW *= 1.0 - smoothstep(0.28, 0.48, abs(uv.x - 0.5));
  float bed0 = bedW * exp(-uv.y / max(vTrim.x, 0.01));

  if (body < 0.002 && bed0 < 0.004) discard;

  // ---- the expensive part, only where there is fire ------------------------

  // Sampled on the metre grid and scrolling upward, so the structure is drawn
  // out into tongues that climb rather than blobs that sit still.
  vec2 p = vec2((uv.x - 0.5) * vShape.x, uv.y * vShape.y - t);
  vec2 warp = vec2(fbm3(p * 0.30 + seed), fbm3(p * 0.30 + 9.2 + seed));
  float n = fbm(p * 0.34 + warp * 1.6);
  float fine = fbm3(p * 1.15 + warp * 3.0);
  // A third scale, drifting faster than the other two: this is what reads as
  // gas actually moving rather than a pattern sliding upward.
  float grain = fbm3(p * 2.6 + vec2(0.0, -t * 1.7) + warp * 1.2);

  // Across a wide seat the fire is not one column but several standing side by
  // side, leaning into each other as they climb. It only ever carves — a lobe
  // that could widen the column would put flame outside the quad.
  float lobes = fbm3(vec2((uv.x - 0.5) * vShape.x * 0.42 + seed * 9.0,
                          uv.y * vShape.y * 0.16 - t * 0.5));
  body *= mix(1.0, min(1.0, 0.50 + 1.30 * lobes), smoothstep(2.0, 5.0, vShape.x) * 0.85);

  float bed = bed0 * (0.68 + 0.32 * grain);

  // Combustion is continuous down at the seat and breaks into separate tongues
  // as it rises, so the noise is allowed to cut deeper the higher it goes.
  float bite = mix(0.10, 1.06, pow(uv.y, 0.68));
  float mask = clamp((n - 0.5) * 2.6 + 1.0 - bite, 0.0, 1.0);
  mask = smoothstep(0.0, 0.55, mask);

  // Fine noise frays the edge, where the sheet is thin enough for it to tell,
  // and the grain breaks the body up into separate sheets of flame.
  float d = body * mask - fine * 0.20 * smoothstep(0.1, 0.9, uv.y);
  d *= 0.72 + 0.28 * grain;
  d = max(d, bed);
  // Out before the border, on every side.
  d *= smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x)
     * (1.0 - smoothstep(0.90, 1.0, uv.y));
  d = clamp(d, 0.0, 1.0);
  if (d < 0.003) discard;

  // Temperature falls hard with height and softly across the column, so the
  // white is only ever in the heart of the seat — except that a deep bed of
  // fire carries its heat further up than a shallow one does.
  float reach = 0.45 + 0.55 * smoothstep(0.02, 0.30, vTrim.x);
  float heat = (1.0 - pow(uv.y / reach, 0.55)) * (1.0 - r * 0.50) * (0.55 + 0.65 * d)
             + bed * 0.60 + grain * 0.10 * (1.0 - uv.y);
  heat = clamp(heat, 0.0, 1.0);

  // The last of the column is gas that has stopped burning, so it darkens into
  // the smoke above rather than simply fading out.
  float sooty = smoothstep(0.52, 1.0, uv.y) * (1.0 - bed);
  vec3 col = mix(flameColour(heat), vec3(0.055, 0.042, 0.038), sooty * 0.85);

  // Additive light, so the haze in front of it takes some away rather than
  // painting over it.
  gl_FragColor = vec4(col, clamp(d * vLevel.y, 0.0, 1.0) * (1.0 - vFog));
}
`;

// A soft halo of light round every seat of fire. Real fire at a distance is
// mostly this: the flame itself is small, and what carries across a mile of
// night is the glow it throws into the smoke and dust above it.
const GLOW_FRAG = /* glsl */`
varying vec2 vUv;
varying float vFog;
varying vec2 vLevel;

void main() {
  vec2 p = (vUv - vec2(0.5, 0.28)) * vec2(1.0, 0.78);
  float r = length(p) * 2.0;
  // Out well inside the card, so the halo never shows a corner.
  float a = exp(-r * r * 3.4) * vLevel.y * (1.0 - smoothstep(0.80, 1.0, r));
  a *= 1.0 - vFog;
  if (a < 0.002) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.76, 0.34), a), a);
}
`;

// The smoke keeps a card apiece. It is alpha blended, so the columns have to
// be drawn back to front, and that is a per-object sort the renderer can only
// do if they are separate objects. Two dozen draws is a fair price for a pall
// that does not fight with itself.
const SMOKE_VERT = /* glsl */`
uniform vec2 uSize;
uniform float uLean;
uniform float uFogDensity;
varying vec2 vUv;
varying float vFog;

void main() {
  vUv = uv;
  vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 look = cameraPosition - centre;
  look.y = 0.0;
  look = normalize(look);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), look));

  float h = position.y + 0.5;
  vec3 world = centre
    + right * (position.x * uSize.x + uLean * h * h * uSize.x)
    + vec3(0.0, h * uSize.y, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
  gl_Position = projectionMatrix * mv;
}
`;

const SMOKE_FRAG = /* glsl */`
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform vec3 uLit;
uniform vec3 uFogColor;
varying vec2 vUv;
varying float vFog;
${NOISE}

void main() {
  vec2 uv = vUv;

  // The plume is kept inside its own card. It used to be sampled through a
  // spread wide enough to run off the sides, so at height it was still near
  // solid where the quad stopped — which drew a grey rectangle across the sky
  // with two straight edges. Now the sheet is out before the border is.
  float spread = 0.17 + uv.y * 0.33;
  float across = 1.0 - smoothstep(0.22, 0.94, abs(uv.x - 0.5) / spread);
  float rise = smoothstep(0.0, 0.16, uv.y) * (1.0 - smoothstep(0.68, 1.0, uv.y));
  float shape = across * rise
    * smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x);
  // Nothing below this line is worth paying for on an empty pixel, and most of
  // a smoke card is empty.
  if (shape < 0.006) discard;

  float t = uTime * 0.16 + uSeed * 13.3;
  vec2 p = vec2((uv.x - 0.5) / spread * 2.6, uv.y * 1.1 - t);
  // Three octaves throughout: the columns are the largest thing on the screen
  // by area, and soot has no fine structure worth six of them.
  vec2 warp = vec2(fbm3(p * 1.1 + uSeed), fbm3(p * 1.1 + 4.4 + uSeed));
  float n = fbm3(p + warp * 0.9) * 0.75 + fbm3(p * 3.1 + 11.0) * 0.25;

  float d = shape * smoothstep(0.20, 0.74, n);
  d = clamp(d * uOpacity, 0.0, 1.0);
  if (d < 0.004) discard;

  // Soot over a fire is not neutral grey — it is lit from underneath and it
  // sits in air the same colour as everything else at that range. Warm and
  // thin at the top, and hazed to the fog like the hills behind it, so it
  // belongs to the picture instead of lying on top of it.
  float glow = pow(1.0 - uv.y, 2.2);
  vec3 col = mix(vec3(0.046, 0.037, 0.033), vec3(0.118, 0.092, 0.076), n);
  col = mix(col, uLit, glow * 0.80);
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, d * (1.0 - vFog * 0.35));
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

// A tongue of flame is about this across, and climbs at about this speed,
// whatever it is coming off. Holding both fixed in metres is what tells the eye
// how big a fire is: the same shader at the same numbers reads as a burning
// drum at ten metres and as a burning oil farm at two hundred.
const TONGUE_M = 13;
const RISE_MS = 15;

const QUAD = new THREE.PlaneGeometry(1, 1, 1, 1);

/** Fires, the smoke off them, the embers they throw, and the light they cast. */
export class FireSystem {
  /**
   * `detail` scales how much of every seat of fire is actually drawn: the
   * number of stacked flame cards and the number of embers. One is what the
   * port was tuned at; below one the fires keep their size, their colour and
   * their motion and lose only the depth that comes from stacking cards, which
   * is the cheapest quality there is to give back on a slow machine.
   */
  constructor(scene, { emberCount = 900, detail = 1 } = {}) {
    this.scene = scene;
    this.time = 0;
    this.detail = detail;
    // Every card is drawn through the same haze as the scene behind it.
    this.fogColor = scene.fog ? scene.fog.color.clone() : new THREE.Color(0, 0, 0);
    this.fogDensity = scene.fog ? (scene.fog.density || 0) : 0;
    this.emberCount = emberCount;

    // Descriptors, gathered as the port is built and turned into two instanced
    // meshes by build(). Nothing is drawn until then.
    this.flames = [];
    this.glows = [];
    this.smoke = [];
    this.lights = [];
    this.emberSeeds = [];
    this.emberPositions = [];
  }

  /**
   * One seat of fire. `layers` stacks flame cards at slightly different scales
   * and phases so the column has depth instead of reading as one flat card.
   */
  addFire(x, y, z, {
    width = 16, height = 34, layers = 3, intensity = 1,
    smokeWidth = 90, smokeHeight = 320, lean = 0.28,
    light = true, lightRange = 420, embers = 40,
  } = {}) {
    layers = THREE.MathUtils.clamp(Math.round(layers * this.detail), 1, layers);
    embers = Math.round(embers * this.detail);
    for (let i = 0; i < layers; i++) {
      const f = i / Math.max(1, layers - 1);
      const w = width * (1 - f * 0.35);
      const h = height * (1 - f * 0.28);
      // The scale of the fire, worked out in metres and handed to the shader,
      // so the flame keeps a tongue the same size and a climb the same speed
      // however big the seat under it is.
      const base = intensity * (1 - f * 0.3) * (2.4 / layers);
      this.flames.push({
        x: x + (Math.random() - 0.5) * width * 0.35,
        y,
        z: z + (Math.random() - 0.5) * width * 0.35,
        w,
        h,
        lean: lean * (0.6 + f),
        cellX: Math.max(1.7, w / TONGUE_M),
        cellY: Math.max(2.6, h / TONGUE_M),
        rate: (RISE_MS / TONGUE_M) * (0.9 + f * 0.25),
        bed: THREE.MathUtils.clamp((w * 0.34) / h, 0.045, 0.34),
        tip: THREE.MathUtils.clamp(0.06 + (w / h) * 0.42, 0.08, 0.42),
        seed: Math.random(),
        base,
        phase: Math.random() * 10,
        // A small fire flutters; a big one surges. The flicker runs on the
        // column's own clock so the two never look like the same fire.
        beat: THREE.MathUtils.clamp(34 / h, 0.30, 1.0),
      });
    }

    // The halo the seat throws up into the smoke over it.
    this.glows.push({
      x, y, z, w: width * 3.4, h: height * 2.1, lean: lean * 0.4,
      base: intensity * 0.30, phase: Math.random() * 10,
    });

    if (smokeHeight > 0) {
      this.smoke.push({
        x, y: y + height * 0.25, z, w: smokeWidth, h: smokeHeight, lean: lean * 2.4,
      });
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

  /**
   * One instanced card set for the flames, one for the haloes, a card apiece
   * for the smoke, and the embers. Call once every fire has been placed.
   */
  build(emberSize = 2.6) {
    this.buildCards(this.flames, FLAME_FRAG, 10);
    this.buildCards(this.glows, GLOW_FRAG, 9);
    this.buildSmoke();
    this.buildEmbers(emberSize);
  }

  /** Weld a list of card descriptors into one instanced draw. */
  buildCards(list, frag, order) {
    if (!list.length) return;
    const n = list.length;
    const pos = new Float32Array(n * 3);
    const card = new Float32Array(n * 3);
    const shape = new Float32Array(n * 4);
    const trim = new Float32Array(n * 3);
    list.forEach((c, i) => {
      pos.set([c.x, c.y, c.z], i * 3);
      card.set([c.w, c.h, c.lean], i * 3);
      shape.set([c.cellX || 1, c.cellY || 1, c.rate || 0, c.bed || 0.1], i * 4);
      trim.set([c.seed || 0, c.tip || 0.2, c.base], i * 3);
    });

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', QUAD.getAttribute('position'));
    geo.setAttribute('uv', QUAD.getAttribute('uv'));
    geo.setIndex(QUAD.getIndex());
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iCard', new THREE.InstancedBufferAttribute(card, 3));
    geo.setAttribute('iShape', new THREE.InstancedBufferAttribute(shape, 4));
    geo.setAttribute('iTrim', new THREE.InstancedBufferAttribute(trim, 3));
    geo.instanceCount = n;
    // One object for the whole waterfront, so it is never culled as a unit.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERT,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: Math.random() * 100 },
        uFogDensity: { value: this.fogDensity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = order;
    this.scene.add(mesh);
    list.mesh = mesh;
    list.mat = mat;
    list.level = trim;              // the intensity column, rewritten each frame
    list.attr = geo.getAttribute('iTrim');
  }

  buildSmoke() {
    for (const c of this.smoke) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        uniforms: {
          uTime: { value: Math.random() * 100 },
          uSeed: { value: Math.random() },
          uOpacity: { value: 0.82 },
          uLit: { value: new THREE.Color(0.55, 0.20, 0.05) },
          uFogColor: { value: this.fogColor },
          uSize: { value: new THREE.Vector2(c.w, c.h) },
          uLean: { value: c.lean },
          uFogDensity: { value: this.fogDensity },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // A bounding sphere the vertex stage actually stays inside, so a column
      // off the side of the frame costs nothing.
      const geo = QUAD.clone();
      const half = c.w * (0.5 + Math.abs(c.lean));
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, c.h * 0.5, 0), Math.hypot(half, c.h * 0.5) + 1,
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, c.y, c.z);
      mesh.renderOrder = 8;
      this.scene.add(mesh);
      c.mesh = mesh;
      c.mat = mat;
    }
  }

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

    // Flicker from two beats that do not share a period, so it never pulses.
    // Both sets are one attribute upload rather than a uniform write apiece.
    if (this.flames.mat) {
      this.flames.mat.uniforms.uTime.value += dt;
      const lv = this.flames.level;
      this.flames.forEach((f, i) => {
        const a = Math.sin(this.time * 7.3 * f.beat + f.phase);
        const b = Math.sin(this.time * 2.9 * f.beat + f.phase * 2.1);
        lv[i * 3 + 2] = f.base * (0.86 + 0.1 * a + 0.06 * b);
      });
      this.flames.attr.needsUpdate = true;
    }
    if (this.glows.mat) {
      const lv = this.glows.level;
      this.glows.forEach((g, i) => {
        // The halo breathes with the fire under it, a beat behind the flame.
        const a = Math.sin(this.time * 3.1 + g.phase);
        const b = Math.sin(this.time * 1.3 + g.phase * 1.7);
        lv[i * 3 + 2] = g.base * (0.84 + 0.11 * a + 0.07 * b);
      });
      this.glows.attr.needsUpdate = true;
    }
    for (const s of this.smoke) if (s.mat) s.mat.uniforms.uTime.value += dt;
    for (const l of this.lights) {
      const a = Math.sin(this.time * 6.1 + l.phase);
      const b = Math.sin(this.time * 11.7 + l.phase * 1.7);
      l.light.intensity = l.base * (0.82 + 0.13 * a + 0.07 * b);
    }
    if (this.emberMat) this.emberMat.uniforms.uTime.value += dt;
  }
}
