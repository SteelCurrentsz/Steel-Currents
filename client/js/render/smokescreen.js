// A ship making smoke.
//
// Not a few pale puffs set down round her. A destroyer laying a screen shut
// her air down to the burners and poured unburnt fuel oil up her funnels, and
// what came out of them was a black, greasy, rolling column that fell back
// over her quarter, spread across the water and stood there -- a wall a
// hundred feet high and a mile long, laid along her track as she ran, that
// took the best part of a minute to thin out.
//
// So each puff is laid at the top of one of her funnels, thrown up out of it
// at the speed the gas leaves, carried a little way on with the ship, and
// then left behind in the air: it swells, slumps towards the water, spreads
// wide and slowly greys and thins. Laid every fraction of a second from each
// funnel while she is making smoke, the puffs run together into the wall.
//
// One pool, one draw call: a quad a puff, turned to the camera in the vertex
// stage, and everything after the moment it is laid worked out there too, so
// the CPU writes a puff once and never touches it again. Not points, because
// a puff of this smoke is a hundred metres across and a point sprite is
// capped at a few hundred pixels -- close to, a screen drawn that way breaks
// up into dots.

import * as THREE from '../../../vendor/three.module.js';

const VERT = /* glsl */`
uniform float uTime;
attribute vec3 seat;       // where it was laid
attribute vec3 drift;      // what it was thrown off with, metres a second
attribute vec4 born;       // x: when, y: how long it lasts, z: size laid, w: growth
attribute vec2 seed;       // x: its own random, y: how far it slumps
attribute vec2 carry;      // the wind it lies in, metres a second
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vFog;
uniform float uFogDensity;

void main() {
  float t = uTime - born.x;
  float age = t / born.y;
  vAge = age;
  vSeed = seed.x;
  vUv = position.xy + 0.5;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Thrown out of the funnel and stopped by the air within a few seconds; then
  // heavy, cooling smoke settles back towards the sea, never into it.
  float k = 0.55;
  vec3 c = seat + drift * (1.0 - exp(-t * k)) / k;
  // And down the wind, the way the simulation's bank goes (see laySmoke).
  c.xz += carry * t;
  float size = born.z + born.w * sqrt(t);
  c.y = max(c.y - seed.y * t, size * 0.28);
  // A puff hangs at its own angle and turns slowly.
  float a = seed.x * 6.2832 + t * (seed.x - 0.5) * 0.12;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
  // Spread a little wider than it is tall: it lies on the water.
  q *= vec2(1.0, 0.86);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
}
`;

const FRAG = /* glsl */`
uniform vec3 uFogColor;
uniform float uLight;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vFog;

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x),
             mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  // A heap of curls, not a disc.
  float s = vSeed * 41.0;
  float n = vn(p * 2.3 + s) * 0.55 + vn(p * 5.1 - s) * 0.3 + vn(p * 11.0 + s) * 0.15;
  float edge = r + (n - 0.5) * 0.7;
  float a = 1.0 - smoothstep(0.25, 0.95, edge);
  if (a < 0.01) discard;
  // Black and oily out of the funnel, a dirty grey once it has spread.
  vec3 col = mix(vec3(0.045, 0.043, 0.042), vec3(0.30, 0.30, 0.31), smoothstep(0.0, 0.7, vAge));
  col *= 0.75 + 0.5 * n;
  // Lit from above: the tops of the curls catch the sky, the undersides
  // are in their own shadow.
  col *= 0.8 + 0.45 * smoothstep(-0.7, 0.9, p.y + (n - 0.5) * 0.6);
  col *= uLight;
  // Thick for most of its life; it thins away at the end rather than going out.
  float alpha = a * 0.92 * smoothstep(0.0, 0.03, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
  col = mix(col, uFogColor, vFog * 0.85);
  gl_FragColor = vec4(col, alpha * (1.0 - vFog * 0.5));
}
`;

export class SmokeScreens {
  constructor(scene, max = 2600) {
    this.scene = scene;
    this.max = max;
    this.time = 0;
    this.next = 0;
    this.lo = Infinity;
    this.hi = -1;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n)
      .setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('seat', attr(3));
    geo.setAttribute('drift', attr(3));
    const born = attr(4);
    // Nothing laid yet: all of them long dead.
    for (let i = 0; i < max; i++) born.setXYZW(i, -1e6, 1, 1, 0);
    geo.setAttribute('born', born);
    geo.setAttribute('seed', attr(2));
    geo.setAttribute('carry', attr(2));
    geo.instanceCount = max;
    this.geo = geo;
    this.uniforms = {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(0x9fb2c2) },
      uFogDensity: { value: 0 },
      uLight: { value: 1 },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.alive = 0;
    scene.add(this.mesh);
  }

  /**
   * One puff of it out of a funnel at `x, y, z`, off a ship going `vx, vz`.
   * `scale` is how big a ship's funnel it came out of, and `wx, wz` the wind
   * it is carried down, already cut to what smoke on the water feels of it.
   */
  puff(x, y, z, vx, vz, scale = 1, wx = 0, wz = 0) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    const g = this.geo.attributes;
    const j = () => Math.random() - 0.5;
    g.seat.setXYZ(i, x + j() * 2 * scale, y, z + j() * 2 * scale);
    // Up out of the funnel, and on with the ship for a moment before the air
    // has it -- which is what lays it back along her track in a wall.
    // Some of it boils up well clear of the funnel and some barely leaves it,
    // which is what makes a bank of it lumpy rather than a sausage.
    const boil = Math.random();
    g.drift.setXYZ(i, vx * 0.35 + j() * 6, 4 + boil * boil * 14, vz * 0.35 + j() * 6);
    const life = 42 + Math.random() * 18;
    g.born.setXYZW(i, this.time, life, (4 + Math.random() * 5) * scale, (8 + Math.random() * 10) * scale);
    // And most of it slumps back towards the water as it cools; a little of
    // it stays up.
    g.seed.setXY(i, Math.random(), -0.1 + Math.random() * 0.55);
    g.carry.setXY(i, wx, wz);
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.alive = Math.max(this.alive, this.time + life);
  }

  update(dt) {
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    // The scene's own air, read each frame because the weather changes it: a
    // screen far off goes into the haze with everything else, and smoke takes
    // its light from the sky it is under -- grey smoke at daylight brightness
    // on a night sea glows (see trails.js).
    const fog = this.scene.fog;
    if (fog) {
      u.uFogColor.value.copy(fog.color);
      u.uFogDensity.value = fog.density || 0;
      u.uLight.value = 0.35 + 0.65 * Math.min(1, 2.2 * (0.2126 * fog.color.r
        + 0.7152 * fog.color.g + 0.0722 * fog.color.b));
    }
    this.mesh.visible = this.time < this.alive;
    if (this.hi < 0) return;
    // Only what was written this frame goes up to the card.
    for (const k of ['seat', 'drift', 'born', 'seed', 'carry']) {
      const a = this.geo.attributes[k];
      a.clearUpdateRanges();
      a.addUpdateRange(this.lo * a.itemSize, (this.hi - this.lo + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
  }
}
