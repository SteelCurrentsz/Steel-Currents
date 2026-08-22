// Explosions: the flash, the fireball, the shockwave off the ground, the smoke
// that follows it up, and the debris thrown out.
//
// Everything is pooled. A raid drops bombs for as long as the title screen is
// up, so allocating a fireball per bomb would leave a few thousand dead meshes
// behind by the time anyone pressed a button. A blast claims the oldest free
// slot instead, and a slot is nothing but a handful of uniforms.

import * as THREE from '../../../vendor/three.module.js';
import { NOISE } from './fire.js';

// A full billboard — these face the camera squarely rather than turning only
// about the vertical, because a fireball has no up.
const BILLBOARD_VERT = /* glsl */`
uniform float uSize;
uniform float uRise;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 centre = modelViewMatrix * vec4(0.0, uRise, 0.0, 1.0);
  centre.xy += position.xy * uSize;
  gl_Position = projectionMatrix * centre;
}
`;

// Value noise in three dimensions. A fireball has to be sampled on the ball it
// is, not on the disc it is drawn as: sampling in polar coordinates makes the
// lobes run out along the radius and turns the whole thing into a catherine
// wheel, which is exactly what it looks like.
const NOISE3 = /* glsl */`
float h31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(h31(i + vec3(0,0,0)), h31(i + vec3(1,0,0)), u.x);
  float b = mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), u.x);
  float c = mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), u.x);
  float d = mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}
float fbm3d(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise3(p); p = p * 2.07 + 19.3; a *= 0.5; }
  return v;
}
// Two octaves, for the domain warp and the soot veins. Eight lookups a sample
// is expensive enough that the places which only need a shape, not a texture,
// are worth paying less for.
float fbm3dLow(vec3 p) {
  float v = 0.5 * vnoise3(p);
  return v + 0.25 * vnoise3(p * 2.07 + 19.3);
}
`;

// The fireball proper: a ball of burning gas that swells fast, slows, cools
// from white through yellow to a deep red, and is eaten from the outside in by
// the soot it is making.
//
// It is drawn as a sphere seen face on — the depth is reconstructed across the
// quad, the noise is sampled on the direction that gives, and the whole field
// is advected outward as the ball grows. That is what makes the surface roll
// the way burning gas does instead of sliding about like a texture.
const FIREBALL_FRAG = /* glsl */`
uniform float uLife;
uniform float uSeed;
uniform float uPower;     // 0 for a drum going up, 1 for a magazine
varying vec2 vUv;
${NOISE3}

vec3 ramp(float t) {
  vec3 c = mix(vec3(0.10, 0.006, 0.001), vec3(0.86, 0.14, 0.010), smoothstep(0.00, 0.26, t));
  c = mix(c, vec3(1.00, 0.40, 0.040), smoothstep(0.24, 0.52, t));
  c = mix(c, vec3(1.00, 0.72, 0.180), smoothstep(0.50, 0.76, t));
  c = mix(c, vec3(1.00, 0.93, 0.640), smoothstep(0.76, 0.93, t));
  c = mix(c, vec3(1.00, 1.00, 0.97), smoothstep(0.93, 1.00, t));
  return c;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  if (length(p) > 1.0) discard;

  // Growth: quick off the mark and easing off, the way a ball of gas runs out
  // of pressure. Smooth all the way through — no kink for the eye to catch.
  float grow = 1.0 - exp(-uLife * 4.2);
  float R = mix(0.13, 0.92, grow);

  // She does not stay a ball. The buoyant gas pulls up out of the middle, so
  // she is drawn in below and rolls over on top as she climbs.
  vec2 pn = p / R;
  pn.y = (pn.y - 0.14 * grow) / (1.0 + 0.20 * grow);
  pn.x *= 1.0 + 0.10 * grow;

  float rn = length(pn);
  if (rn > 1.7) discard;
  float rc = min(rn, 1.0);
  vec3 dir = vec3(pn.x / max(rn, 1e-4) * rc, pn.y / max(rn, 1e-4) * rc,
                  sqrt(max(0.0, 1.0 - rc * rc)));

  // The field the ball is boiling through. It is dragged outward as she swells
  // and lifted as she climbs, so a lump keeps its identity while it moves.
  vec3 q = dir * (2.55 - 1.05 * grow) + vec3(uSeed * 53.0, -grow * 1.90, uSeed * 17.0);
  // Domain warp: without it the heads are round and evenly spaced, which is
  // the one thing a real fireball never is.
  vec3 w = vec3(fbm3dLow(q * 0.85 + 4.2), fbm3dLow(q * 0.85 + 21.7),
                fbm3dLow(q * 0.85 + 60.4)) - 0.375;
  float n = fbm3d(q * 1.20 + w * 1.5);
  float fine = fbm3dLow(q * 3.60 + 7.7) * 1.34;

  // Cauliflower: the heads stand proud of the mean radius, so the silhouette
  // is lumpy and the lumps belong to the surface rather than to the outline.
  // The noise is stretched about its mean first — fbm sits in a narrow band
  // round a half, and used raw it makes a ball with a dimpled skin.
  float N = clamp((n - 0.46) * 3.1, -1.0, 1.0);
  float F = clamp((fine - 0.48) * 2.6, -1.0, 1.0);
  float lump = 1.00 + 0.34 * N + 0.11 * F;
  float a = 1.0 - smoothstep(lump * 0.80, lump * 1.02, rn);
  if (a < 0.004) discard;

  // How much gas the eye is looking through: most at the middle of the disc,
  // none at the limb. This is what gives it volume.
  float thick = sqrt(max(0.0, 1.0 - rc * rc)) * a;

  // Soot: made in the flame, rolled out to the surface, and thickening as she
  // cools. The veins of it across the face are most of what separates a
  // fireball from a glowing balloon.
  float vein = smoothstep(0.34, 0.80, fbm3dLow(q * 2.05 + w * 0.8 + 3.1) * 1.34);
  // Gas this hot cools in a moment; what is left burns on much longer, dirty
  // and red. Holding the white too long is what makes a blast read as a lamp.
  float cool = smoothstep(0.00, 0.40, uLife);

  float heat = (1.26 - cool * 1.34) * (0.26 + 0.94 * thick)
             + 0.30 * N - vein * cool * 0.78;
  // A magazine keeps a white heart long after the skin has gone dirty.
  heat = max(heat, uPower * (1.0 - smoothstep(0.0, 0.60, uLife))
                   * (1.0 - smoothstep(0.0, 0.42, rn)));
  heat = clamp(heat, 0.0, 1.0);

  float soot = clamp(smoothstep(0.10, 0.75, uLife) * (0.26 + 0.78 * vein)
                     * (1.0 - thick * 0.50), 0.0, 1.0);
  vec3 col = mix(ramp(heat), vec3(0.048, 0.042, 0.038), soot);

  // She does not blink out: the skin tears into rags and goes up with the
  // smoke behind her.
  float fade = 1.0 - smoothstep(0.52, 0.94, uLife);
  a *= mix(1.0, smoothstep(0.30, 0.72, fine), smoothstep(0.30, 0.95, uLife));
  gl_FragColor = vec4(col, clamp(a * fade, 0.0, 1.0));
}
`;

// The glare round the fireball. The ball itself is drawn solid so its soot can
// actually darken what is behind it; this is the light it throws, laid over
// the top, which is what a bright thing does to a camera and to an eye.
const GLARE_FRAG = /* glsl */`
uniform float uAge;      // seconds since the blast, not a fraction of its life
uniform float uPower;
varying vec2 vUv;

void main() {
  float r = length(vUv - 0.5) * 2.0;
  float grow = 1.0 - exp(-uAge * 5.0);
  float R = mix(0.18, 1.0, grow);
  float k = r / R;
  // Bright core, soft skirt, and gone inside a second — the light off a blast
  // is over long before the smoke is.
  float a = (exp(-k * k * 2.6) * 0.80 + exp(-k * 2.1) * 0.26)
          * (1.0 - smoothstep(0.05, 0.75, uAge));
  a *= 0.45 + 0.75 * uPower;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.44, 0.12), vec3(1.0, 0.88, 0.62), a), a * 0.85);
}
`;

// The column that stands after it: dirty, lit from beneath while the fire is
// still in it, spreading as it climbs.
const PLUME_FRAG = /* glsl */`
uniform float uLife;
uniform float uSeed;
uniform float uPower;
uniform vec3 uLit;
varying vec2 vUv;
${NOISE}

void main() {
  vec2 uv = vUv;
  float spread = 0.20 + uv.y * (0.75 + uLife * 0.9);
  // A big enough blast rolls its head over into a cap, with the stem drawn in
  // under it: the column is not a cone all the way up.
  float head = smoothstep(0.45, 0.95, uv.y) * (1.0 - smoothstep(0.95, 1.0, uv.y));
  spread *= mix(1.0, 1.0 - 0.30 * smoothstep(0.15, 0.55, uv.y) + 1.05 * head, uPower);
  vec2 p = vec2((uv.x - 0.5) / spread * 2.4, uv.y * 1.15 - uLife * 0.85 + uSeed * 11.0);
  float n = fbm(p * 1.25 + vec2(fbm3(p * 1.1), fbm3(p * 1.1 + 3.3)) * 0.9);

  float across = 1.0 - smoothstep(0.32, 1.0, abs(uv.x - 0.5) / spread);
  // The head of the column climbs as the blast ages; below it the stem thins.
  float rise = smoothstep(0.0, 0.16, uv.y) * (1.0 - smoothstep(uLife * 1.15, uLife * 1.15 + 0.35, uv.y));
  float d = across * rise * smoothstep(0.20, 0.72, n);

  // She stands long after the fire in her has gone out — the column is what is
  // left of a blast, and cutting it short is what makes one read as a puff.
  float fade = smoothstep(0.0, 0.08, uLife) * (1.0 - smoothstep(0.66, 1.0, uLife));
  d = clamp(d * fade * 1.15, 0.0, 1.0);
  if (d < 0.004) discard;

  vec3 col = mix(vec3(0.062, 0.055, 0.050), vec3(0.14, 0.125, 0.115), n);
  col = mix(col, uLit, pow(1.0 - uv.y, 3.0) * (1.0 - smoothstep(0.0, 0.45, uLife)) * 0.85);
  gl_FragColor = vec4(col, d);
}
`;

// The flash. For the first tenth of a second a detonation is not a fireball at
// all — it is a light too bright to have an edge, and everything round it is
// washed out. Without it a big blast reads as an orange balloon inflating.
const FLASH_FRAG = /* glsl */`
uniform float uAge;      // seconds
varying vec2 vUv;

void main() {
  float r = length(vUv - 0.5) * 2.0;
  // Up in a couple of frames, gone in a tenth of a second. In seconds, so a
  // long-burning blast does not hold its flash for half of it.
  float t = smoothstep(0.0, 0.015, uAge) * (1.0 - smoothstep(0.03, 0.15, uAge));
  float a = exp(-r * r * 5.0) * t;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.34), vec3(1.0, 0.99, 0.95), a), a);
}
`;

// The ring of dust and spray driven out along the ground.
const RING_FRAG = /* glsl */`
uniform float uLife;
varying vec2 vUv;

void main() {
  float r = length(vUv - 0.5) * 2.0;
  float front = pow(uLife, 0.5);
  // A thin shell that thickens and softens as it runs out of energy.
  float w = 0.06 + uLife * 0.22;
  float d = 1.0 - smoothstep(0.0, w, abs(r - front));
  d *= 1.0 - smoothstep(0.70, 1.0, r);
  // Soft on both edges and thin: a shockwave picks dust up off the ground, it
  // does not lay a plate down on it.
  float fade = (1.0 - smoothstep(0.20, 0.85, uLife)) * smoothstep(0.0, 0.05, uLife);
  d *= fade;
  if (d < 0.004) discard;
  gl_FragColor = vec4(vec3(0.60, 0.54, 0.46), d * 0.17);
}
`;

// Debris: everything thrown out by every blast at once, in one buffer. Each
// point carries where it started, how fast, and when — the arc is worked out in
// the vertex stage so the CPU never touches a particle.
const DEBRIS_VERT = /* glsl */`
uniform float uTime;
uniform float uPix;    // pixels per metre at one metre: viewportH / 2 tan(fov/2)
attribute vec3 vel;
attribute vec2 born;   // x = time of the blast, y = how long this piece lasts
attribute float psize; // how big the piece is, in metres
varying float vAge;

void main() {
  float age = (uTime - born.x) / born.y;
  vAge = age;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // off-screen: cheaper than a draw
    gl_PointSize = 0.0;
    return;
  }
  float t = age * born.y;
  vec3 pos = position + vel * t + vec3(0.0, -0.5 * 42.0 * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // Sized off the projection, so a burning frame off a battleship two thousand
  // metres away is still a chunk of ship and not a one-pixel spark.
  gl_PointSize = max(1.0, psize * uPix / max(1.0, -mv.z)) * (1.0 - age * 0.4);
}
`;

const DEBRIS_FRAG = /* glsl */`
varying float vAge;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  // Struck metal and burning fragments: bright as they leave, dull as they fall.
  vec3 col = mix(vec3(1.0, 0.82, 0.42), vec3(0.42, 0.10, 0.03), pow(vAge, 0.7));
  // Soft-edged and thinning as it cools, so a piece of plating tumbling away
  // does not read as a bubble with a hard rim.
  float core = 1.0 - smoothstep(0.06, 0.25, dot(d, d));
  gl_FragColor = vec4(col, core * (1.0 - smoothstep(0.5, 1.0, vAge)) * 0.85);
}
`;

const QUAD = new THREE.PlaneGeometry(1, 1, 1, 1);
const DEBRIS_MAX = 900;

/** One pool of blasts, from a stick of bombs down to a burning drum going up. */
export class ExplosionSystem {
  constructor(scene, { slots = 16 } = {}) {
    this.scene = scene;
    this.time = 0;
    this.slots = [];

    for (let i = 0; i < slots; i++) this.slots.push(this.makeSlot());

    // Debris for every blast, in one draw.
    const pos = new Float32Array(DEBRIS_MAX * 3);
    const vel = new Float32Array(DEBRIS_MAX * 3);
    const born = new Float32Array(DEBRIS_MAX * 2).fill(-1e9);
    const psize = new Float32Array(DEBRIS_MAX).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
    geo.setAttribute('born', new THREE.BufferAttribute(born, 2));
    geo.setAttribute('psize', new THREE.BufferAttribute(psize, 1));
    this.debrisMat = new THREE.ShaderMaterial({
      vertexShader: DEBRIS_VERT,
      fragmentShader: DEBRIS_FRAG,
      uniforms: { uTime: { value: 0 }, uPix: { value: 900 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.debris = new THREE.Points(geo, this.debrisMat);
    this.debris.frustumCulled = false;
    this.debris.renderOrder = 12;
    scene.add(this.debris);
    this.debrisNext = 0;
  }

  makeSlot() {
    const mk = (frag, extra, blending, order) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BILLBOARD_VERT,
        fragmentShader: frag,
        uniforms: {
          uLife: { value: 2 }, uAge: { value: 99 }, uSeed: { value: 0 },
          uPower: { value: 0 }, uSize: { value: 1 }, uRise: { value: 0 }, ...extra,
        },
        transparent: true,
        depthWrite: false,
        blending,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(QUAD, mat);
      m.frustumCulled = false;
      m.renderOrder = order;
      m.visible = false;
      this.scene.add(m);
      return m;
    };

    // The ball is drawn solid: soot that cannot darken what is behind it is not
    // soot, and an additive fireball is a lamp. The glare over it carries the
    // light instead.
    const ball = mk(FIREBALL_FRAG, {}, THREE.NormalBlending, 11);
    const glare = mk(GLARE_FRAG, {}, THREE.AdditiveBlending, 12);
    const flash = mk(FLASH_FRAG, {}, THREE.AdditiveBlending, 13);
    const plume = mk(PLUME_FRAG, { uLit: { value: new THREE.Color(0.7, 0.28, 0.07) } },
      THREE.NormalBlending, 9);

    // The shockwave lies on the ground rather than facing the camera.
    const ringGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: RING_FRAG,
      uniforms: { uLife: { value: 2 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.frustumCulled = false;
    ring.renderOrder = 10;
    ring.visible = false;
    this.scene.add(ring);

    const light = new THREE.PointLight(0xffb060, 0, 1200, 1.4);
    light.visible = false;
    this.scene.add(light);

    return { ball, glare, flash, plume, ring, light, life: 2, dur: 1, size: 1, lightPeak: 0 };
  }

  /**
   * Set one off.
   * @param size   radius of the fireball in metres — 12 for a burning drum,
   *               70 for a stick of bombs in a warehouse.
   * @param debris how many fragments to throw out; 0 for a small one.
   */
  blast(x, y, z, {
    size = 40, duration = 2.2, debris = 40, light = true, plume = true, power = 0,
  } = {}) {
    // A free slot if there is one, and the one furthest through its life if
    // there is not: cutting a young fireball off in the middle to start another
    // is the one thing that reads as a glitch rather than as a blast.
    let s = null;
    for (const c of this.slots) if (c.life > 1) { s = c; break; }
    if (!s) {
      s = this.slots[0];
      for (const c of this.slots) if (c.life > s.life) s = c;
    }

    s.life = 0;
    s.dur = duration;
    s.size = size;
    s.plumeOn = plume;

    s.ball.visible = true;
    s.ball.position.set(x, y, z);
    s.glare.visible = true;
    s.glare.position.set(x, y, z);
    s.glare.material.uniforms.uPower.value = power;
    s.flash.visible = true;
    s.flash.position.set(x, y + size * 0.3, z);
    s.ball.material.uniforms.uSeed.value = Math.random();
    s.ball.material.uniforms.uPower.value = power;

    s.plume.visible = plume;
    s.plume.position.set(x, y, z);
    s.plume.material.uniforms.uSeed.value = Math.random();
    s.plume.material.uniforms.uPower.value = power;

    s.ring.visible = true;
    s.ring.position.set(x, y + 1.5, z);

    // Capped: past a point a bigger blast does not put out proportionally more
    // light at the range this is seen from, it just burns the picture out.
    s.lightPeak = light ? Math.min(size * 0.9, 130) : 0;
    s.light.visible = light;
    s.light.position.set(x, y + size * 0.5, z);
    s.light.distance = size * 26;

    for (let i = 0; i < debris; i++) this.throwDebris(x, y, z, size);
  }

  throwDebris(x, y, z, size) {
    const i = this.debrisNext;
    this.debrisNext = (this.debrisNext + 1) % DEBRIS_MAX;
    const g = this.debris.geometry;
    const p = g.attributes.position, v = g.attributes.vel, b = g.attributes.born;
    const ps = g.attributes.psize;

    // Up and out, with the slow pieces staying low and the fast ones arcing.
    const th = Math.random() * Math.PI * 2;
    const up = 0.25 + Math.random() * 0.75;
    const speed = size * (0.5 + Math.random() * 1.5);
    p.setXYZ(i, x, y + 2, z);
    v.setXYZ(i, Math.cos(th) * speed * (1 - up), speed * up * 1.5, Math.sin(th) * speed * (1 - up));
    b.setXY(i, this.time, 1.6 + Math.random() * 2.6);
    // Fragments run from cinders up to plating; the big ones are rarer.
    ps.setX(i, size * (0.008 + Math.pow(Math.random(), 3) * 0.032));
    p.needsUpdate = v.needsUpdate = b.needsUpdate = ps.needsUpdate = true;
  }

  /** Keep the debris sized correctly when the window or the lens changes. */
  resize(viewportHeight, fovDeg) {
    this.debrisMat.uniforms.uPix.value =
      viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  update(dt) {
    this.time += dt;
    this.debrisMat.uniforms.uTime.value = this.time;

    for (const s of this.slots) {
      if (s.life > 1) continue;
      s.life += dt / s.dur;
      const t = Math.min(1, s.life);

      // The ball climbs as she goes: gas this hot does not sit where it was
      // made. Eased so the lift never snaps on.
      const rise = s.size * 0.55 * (1 - Math.exp(-t * 2.3));
      const age = s.life * s.dur;
      s.ball.material.uniforms.uLife.value = t;
      s.ball.material.uniforms.uSize.value = s.size * 2.2;
      s.ball.material.uniforms.uRise.value = rise;
      s.flash.material.uniforms.uAge.value = age;
      s.flash.material.uniforms.uSize.value = s.size * 4.2;
      s.glare.material.uniforms.uAge.value = age;
      s.glare.material.uniforms.uSize.value = s.size * 3.4;
      s.glare.material.uniforms.uRise.value = rise;

      if (s.plumeOn) {
        s.plume.material.uniforms.uLife.value = t;
        s.plume.material.uniforms.uSize.value = s.size * 3.4;
        s.plume.material.uniforms.uRise.value = s.size * 3.0;
      }

      if (s.flash.visible && age > 0.16) s.flash.visible = false;
      s.ring.material.uniforms.uLife.value = t;
      s.ring.scale.setScalar(s.size * 4.5);

      // The flash is nearly all in the first fifth of a second, then it is only
      // the fire in the smoke.
      const flash = Math.exp(-t * 7.0) + Math.exp(-t * 1.6) * 0.35;
      s.light.intensity = s.lightPeak * flash * 0.3;

      if (s.glare.visible && age > 0.8) s.glare.visible = false;

      if (s.life > 1) {
        s.ball.visible = s.plume.visible = s.ring.visible = s.light.visible = false;
        s.flash.visible = s.glare.visible = false;
      }
    }
  }
}
