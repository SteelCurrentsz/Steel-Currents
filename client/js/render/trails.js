// The smoke and fire a burning fragment leaves behind it.
//
// Look at any photograph of a ship or an ammunition dump going up and the
// pieces themselves are hardly there -- what you see is the trails: dozens of
// thin curving streaks, bright where the piece is still burning and grey
// where it has gone out, falling away from the cloud like the branches of a
// willow. A fragment without one reads as a speck; with one it reads as a
// piece of something, burning, on its way down.
//
// One pool of puffs, one draw call. A puff is laid where the piece was at the
// moment it was let go, and from then on it goes its own way: it burns for a
// moment, goes out to smoke, swells, drifts and thins. Everything after the
// moment of laying is worked out in the vertex stage, so the CPU writes a puff
// once and never touches it again -- and because a puff can be laid with a
// delay, a piece whose arc is known in advance has its whole trail written the
// moment it is thrown.

import * as THREE from '../../../vendor/three.module.js';

const VERT = /* glsl */`
uniform float uTime;
uniform float uPix;        // pixels per metre at one metre
uniform float uFogDensity;
attribute vec3 drift;      // how it moves off once laid, metres a second
attribute vec4 born;       // x: when it is laid, y: how long it lasts, z: size laid, w: growth
attribute vec3 kind;       // x: fraction of its life spent burning, y: seed, z: tone
varying float vAge;
varying vec3 vKind;
varying float vFog;
varying float vSpin;
varying float vPx;

void main() {
  float age = (uTime - born.x) / born.y;
  vAge = age;
  vKind = kind;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float t = age * born.y;
  // What it was thrown off with dies away quickly in still air; what it
  // keeps is the slow climb of anything warm.
  vec3 pos = position + drift * (1.0 - exp(-t * 1.4)) / 1.4 + vec3(0.0, 1.1 * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // It swells fast while it is hot and then only slowly: smoke spreads by
  // mixing, and mixing goes as the root of the time.
  float size = born.z + born.w * sqrt(t);
  gl_PointSize = clamp(size * uPix / max(1.0, -mv.z), 1.2, 220.0);
  vPx = gl_PointSize;
  vSpin = kind.y * 6.2832 + t * (kind.y - 0.5) * 1.6;
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
}
`;

const FRAG = /* glsl */`
uniform vec3 uFogColor;
uniform float uLight;
varying float vAge;
varying vec3 vKind;
varying float vFog;
varying float vSpin;
varying float vPx;

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
  // Turned to its own angle, so a trail of them is not a string of copies.
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float c = cos(vSpin), s = sin(vSpin);
  p = mat2(c, -s, s, c) * p;
  float r = length(p);
  if (r > 1.0) discard;

  // Lumpy, not round: a puff of smoke is a handful of curls, and a disc of
  // them strung along a line is a string of beads.
  float seed = vKind.y * 37.0;
  float n = vn(p * 2.1 + seed) * 0.62 + vn(p * 4.7 - seed) * 0.38;
  // A puff a few pixels across has no curls to show, and cut ragged it only
  // shrinks: drawn small it is a plain soft dot that runs into the next.
  float detail = smoothstep(3.0, 14.0, vPx);
  float edge = r + (n - 0.5) * 0.62 * detail;
  float a = 1.0 - smoothstep(mix(0.05, 0.30, detail), mix(1.0, 0.92, detail), edge);
  if (a < 0.01) discard;

  float burn = vKind.x;
  // How far it is through the burning part of its life, and whether it has
  // left it yet.
  float fire = 1.0 - smoothstep(burn * 0.55, burn + 0.02, vAge);
  float hot = 1.0 - smoothstep(0.0, max(burn, 0.01), vAge);

  // Smoke: grey, with the dark of the curls showing in it, paler as it
  // spreads and thins. Tone runs from oily black to the near-white of steam
  // and spray.
  float tone = vKind.z;
  vec3 smoke = mix(vec3(0.06, 0.055, 0.05), vec3(0.62, 0.61, 0.60), tone);
  smoke *= 0.78 + 0.44 * n;
  smoke = mix(smoke, smoke + vec3(0.10), smoothstep(0.2, 1.0, vAge) * 0.6);
  smoke *= uLight;

  // Fire: white in the heart while it is young, through yellow to a deep
  // orange, and only ever in the middle of the puff.
  vec3 flame = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.86, 0.52), hot);
  flame = mix(flame, vec3(1.0, 0.98, 0.9), hot * hot * (1.0 - smoothstep(0.0, 0.5, r)));
  float core = 1.0 - smoothstep(0.1, 1.0, edge);
  vec3 col = mix(smoke, flame, fire * core);

  // Smoke thins as it goes and is gone at the end of its life; the fire in
  // it is near opaque.
  float alpha = a * mix(0.62 * pow(1.0 - vAge, 1.4), 0.95, fire * core);
  col = mix(col, uFogColor, vFog * 0.85);
  gl_FragColor = vec4(col, alpha * (1.0 - vFog * 0.5));
}
`;

const G = 9.81;

export class SmokeTrails {
  constructor(scene, max = 9000) {
    this.max = max;
    this.next = 0;
    this.time = 0;
    this.lo = Infinity;
    this.hi = -1;
    const fog = scene.fog;
    const geo = new THREE.BufferGeometry();
    const at = (n, k, fill = 0) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * k).fill(fill), k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('position', at(max, 3));
    geo.setAttribute('drift', at(max, 3));
    geo.setAttribute('born', at(max, 4, -1e9));
    geo.setAttribute('kind', at(max, 3));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPix: { value: 900 },
        // Smoke takes its light from the sky it is under: the air colour is
        // the cheapest measure of that there is, and grey smoke drawn at
        // daylight brightness on a night sea glows.
        uLight: {
          value: fog ? 0.35 + 0.65 * Math.min(1, 2.2 * (0.2126 * fog.color.r
            + 0.7152 * fog.color.g + 0.0722 * fog.color.b)) : 1,
        },
        uFogColor: { value: fog ? fog.color.clone() : new THREE.Color(0, 0, 0) },
        uFogDensity: { value: fog ? (fog.density || 0) : 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    // Under the fireballs, so the cloud a piece is thrown out of covers the
    // start of its trail rather than the other way round.
    this.points.renderOrder = 8;
    // Sized off whatever is drawing it, so nobody has to remember to tell it
    // the window has changed.
    const size = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      if (!camera.isPerspectiveCamera) return;
      renderer.getDrawingBufferSize(size);
      this.mat.uniforms.uPix.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    };
    scene.add(this.points);
  }

  /**
   * Lay one puff.
   * @param delay seconds from now before it appears
   * @param burn  fraction of its life it spends alight, 0 for smoke only
   * @param tone  0 oily black, 1 white steam
   */
  puff(x, y, z, vx, vy, vz, { delay = 0, life = 2.5, size = 1, grow = 3, burn = 0, tone = 0.35 } = {}) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    const g = this.geo.attributes;
    g.position.setXYZ(i, x, y, z);
    g.drift.setXYZ(i, vx, vy, vz);
    g.born.setXYZW(i, this.time + delay, life, size, grow);
    g.kind.setXYZ(i, burn, Math.random(), tone);
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  /**
   * The whole trail of a piece whose flight is known now: thrown from a point
   * at a velocity and falling under gravity until it reaches `floor` or its
   * time is up. Laid in one go, each puff waiting its turn.
   *
   * `burnFor` is how long the piece itself burns; the puffs laid in that time
   * are fire, and the ones after are the smoke it trails once it is out.
   */
  arc(x, y, z, vx, vy, vz, {
    flight = 3, floor = 0, spacing = 0.06, size = 1, grow = 2.6, life = 2.8,
    burnFor = 1, tone = 0.4, gravity = G, start = 0, limit = 40,
  } = {}) {
    let n = 0;
    // Laid at least a little way apart in time, and never more of them than
    // the budget allows: a long flight gets a sparser trail, not a longer one.
    const step = Math.max(spacing, (flight - start) / limit);
    for (let t = start; t < flight && n < limit; t += step, n++) {
      const py = y + vy * t - 0.5 * gravity * t * t;
      if (py < floor) break;
      const burning = t < burnFor;
      // Never narrower than the gap to the next one, or the line falls apart
      // into a string of beads wherever the piece is moving fast.
      const gap = Math.hypot(vx, vy - gravity * t, vz) * step;
      const sz = Math.max(size, gap * 2.1);
      // Fire is short-lived and tight; what is left after is a longer, wider
      // smear that hangs where the piece went by.
      this.puff(x + vx * t, py, z + vz * t,
        vx * 0.04 + (Math.random() - 0.5) * 0.8, (Math.random() - 0.3) * 0.8, vz * 0.04 + (Math.random() - 0.5) * 0.8, {
          delay: t,
          life: burning ? life * (0.75 + Math.random() * 0.35) : life * (0.9 + Math.random() * 0.5),
          size: sz * (burning ? 1.15 : 0.9) * (0.8 + Math.random() * 0.4),
          grow: grow * (burning ? 0.8 : 1),
          burn: burning ? Math.min(0.5, 0.18 + 0.3 * (1 - t / Math.max(0.01, burnFor))) : 0,
          tone,
        });
    }
  }

  update(dt) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.hi < 0) return;
    // Only what was written this frame goes up to the card.
    for (const k of ['position', 'drift', 'born', 'kind']) {
      const a = this.geo.attributes[k];
      a.clearUpdateRanges();
      a.addUpdateRange(this.lo * a.itemSize, (this.hi - this.lo + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
  }
}
