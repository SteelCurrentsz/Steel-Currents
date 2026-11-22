// Sparks: hot fragments of steel thrown off a shell breaking up on armour.
//
// What a round that shatters or glances off a belt actually looks like is not
// a puff of anything. It is a shower of white-hot splinters spraying back off
// the plate -- short, hard streaks that arc over and die out orange in under
// a second -- with a stab of flash at the root and a little dirty smoke where
// the paint was burnt off. A cloud of pale mist over the strike reads as
// steam, or as a ghost, and never as steel hitting steel.
//
// Each spark is drawn as a streak: a line from where it is to where it was a
// moment ago, so a fast one is long and a slow one is a point. Both ends are
// worked out in the vertex stage from where it started, how fast and when, so
// the CPU writes a spark once and never touches it again. One draw for all of
// them.

import * as THREE from '../../../vendor/three.module.js';

const VERT = /* glsl */`
uniform float uTime;
uniform float uFogDensity;
attribute vec3 vel;
attribute vec4 born;   // x: when, y: how long, z: streak length in seconds, w: 0 head / 1 tail
attribute float heat;  // how hot it leaves: 1 white, 0 dull orange
varying float vAge;
varying float vHeat;
varying float vTail;
varying float vFog;

vec3 at(float t) {
  // Steel splinters are dense and small: they slow in the air quickly, and
  // fall.
  float k = 2.2;
  float e = 1.0 - exp(-k * t);
  vec3 p = position + vel * e / k;
  p.y -= 9.81 * (t / k - e / (k * k));
  return p;
}

void main() {
  float age = (uTime - born.x) / born.y;
  vAge = age;
  vHeat = heat;
  vTail = born.w;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t = age * born.y;
  // The tail lags the head by a fixed slice of time, so the streak is as long
  // as the spark is fast.
  float tt = max(0.0, t - born.z * born.w);
  vec3 p = at(tt);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
}
`;

const FRAG = /* glsl */`
varying float vAge;
varying float vHeat;
varying float vTail;
varying float vFog;

void main() {
  // White at the head while it is young, through yellow to a dull orange as
  // it cools, and the tail always a little cooler than the head.
  float cool = clamp(vAge * 1.25 + vTail * 0.35 + (1.0 - vHeat) * 0.35, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.97, 0.86), vec3(1.0, 0.70, 0.28), smoothstep(0.0, 0.45, cool));
  col = mix(col, vec3(0.85, 0.26, 0.05), smoothstep(0.45, 1.0, cool));
  float a = (1.0 - smoothstep(0.55, 1.0, vAge)) * (1.0 - vTail * 0.85);
  a *= 1.0 - vFog;
  gl_FragColor = vec4(col * a, a);
}
`;

export class Sparks {
  constructor(scene, max = 3000) {
    this.max = max;
    this.next = 0;
    this.time = 0;
    this.lo = Infinity;
    this.hi = -1;
    const fog = scene.fog;
    const geo = new THREE.BufferGeometry();
    const at = (k, fill = 0) => {
      const a = new THREE.BufferAttribute(new Float32Array(max * 2 * k).fill(fill), k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('position', at(3));
    geo.setAttribute('vel', at(3));
    geo.setAttribute('born', at(4, -1e9));
    geo.setAttribute('heat', at(1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uFogDensity: { value: fog ? (fog.density || 0) : 0 },
      },
      transparent: true,
      depthWrite: false,
      // Light, not paint: added to what is behind it.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 12;
    scene.add(this.lines);
  }

  /** One spark, thrown from a point at a velocity. */
  throw(x, y, z, vx, vy, vz, { life = 0.6, streak = 0.05, heat = 1 } = {}) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    const g = this.geo.attributes;
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      g.position.setXYZ(j, x, y, z);
      g.vel.setXYZ(j, vx, vy, vz);
      g.born.setXYZW(j, this.time, life, streak, k);
      g.heat.setX(j, heat);
    }
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  /**
   * A shower of them off a point: `n` sparks into the half of the sky round
   * `nx, ny, nz` (the way back off the plate, when it is known), as fast as
   * `speed` metres a second at most.
   */
  shower(x, y, z, n, { speed = 60, life = 0.7, nx = 0, ny = 0.4, nz = 0, spread = 1, heat = 1 } = {}) {
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (let i = 0; i < n; i++) {
      // A random direction, folded into the half round the normal and pulled
      // toward it: most of a shower goes back the way the shell came.
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      if (dx * nx + dy * ny + dz * nz < 0) { dx = -dx; dy = -dy; dz = -dz; }
      dx = dx * spread + nx * (1 - spread * 0.5);
      dy = dy * spread + ny * (1 - spread * 0.5);
      dz = dz * spread + nz * (1 - spread * 0.5);
      const l2 = Math.hypot(dx, dy, dz) || 1;
      // Mostly slow, a few very fast: cubed, as a burst throws.
      const v = speed * (0.25 + 0.75 * Math.pow(Math.random(), 1.6));
      this.throw(x, y, z, dx / l2 * v, dy / l2 * v + 3, dz / l2 * v, {
        life: life * (0.4 + Math.random() * 0.8),
        streak: 0.03 + Math.random() * 0.04,
        heat: heat * (0.6 + Math.random() * 0.4),
      });
    }
  }

  update(dt) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.hi < 0) return;
    for (const k of ['position', 'vel', 'born', 'heat']) {
      const a = this.geo.attributes[k];
      a.clearUpdateRanges();
      a.addUpdateRange(this.lo * 2 * a.itemSize, (this.hi - this.lo + 1) * 2 * a.itemSize);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
  }
}
