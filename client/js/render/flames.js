// Fire aboard a ship, and the smoke off it.
//
// The flame is the same procedural fire the harbour burns with (see fire.js):
// a domain-warped noise field climbing a tapering column, read through a
// temperature ramp -- white in the seat, orange in the body, red going to soot
// at the tips. It used to be a handful of cones and a spray of glowing sprites,
// which read as exactly that: geometry, and blobs.
//
// The smoke is a column rather than a cloud. Every puff of it is born small and
// dense at the head of the flame, climbs on the heat, slows, spreads and thins,
// and is carried off downwind -- so what stands over a burning ship is a leaning
// plume that widens with height, not a ball of black sitting on her. Each puff
// is soft-edged noise, lit from above and, while it is young, from the fire
// underneath, and hazed into the air like everything else at its range.
//
// Both are instanced: every flame in the battle is one draw, every puff of
// smoke another, however many compartments are alight.

import * as THREE from '../../../vendor/three.module.js';
import { NOISE, BILLBOARD_VERT, FLAME_FRAG, GLOW_FRAG } from './fire.js';

// How many fires can burn at once, how many flame cards each is made of, and
// how many puffs of smoke can be in the air.
const MAX_FIRES = 64;
const CARDS = 3;
const MAX_PUFFS = 1400;
// A tongue of flame is about this across and climbs at about this speed,
// whatever it is coming off; see fire.js.
const TONGUE_M = 9;
const RISE_MS = 13;

const QUAD = new THREE.PlaneGeometry(1, 1, 1, 1);

const PUFF_VERT = /* glsl */`
uniform float uFogDensity;
attribute vec4 iPuff;    // x y z size
attribute vec4 iLook;    // opacity, heat, seed, spin
varying vec2 vUv;
varying float vFog;
varying vec3 vLook;

void main() {
  vUv = uv;
  // Faces the eye on both axes: a puff is a ball of gas, not a sheet.
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(iLook.w), s = sin(iLook.w);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  vec3 world = iPuff.xyz + (right * q.x + up * q.y) * iPuff.w;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
  vLook = iLook.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const PUFF_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uFogColor;
uniform vec3 uSky;
varying vec2 vUv;
varying float vFog;
varying vec3 vLook;
${NOISE}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float seed = vLook.z;
  // Billowing: the edge of the puff is the noise, not a circle, and it turns
  // over slowly while it is in the air.
  vec2 q = p * 1.35 + vec2(seed * 31.0, seed * 17.0);
  float n = fbm3(q + vec2(0.0, -uTime * 0.06));
  float m = fbm3(q * 2.3 + 7.1 - vec2(uTime * 0.04, 0.0));
  float edge = r + (n - 0.5) * 0.85 + (m - 0.5) * 0.30;
  float d = 1.0 - smoothstep(0.35, 1.0, edge);
  float a = d * vLook.x;
  if (a < 0.004) discard;
  // Soot: near black where it is thick, browner and greyer where it is thin
  // and the light gets into it, and lit from above by the sky.
  float thin = 1.0 - d;
  float top = clamp(0.5 + p.y * 0.5, 0.0, 1.0);
  vec3 soot = mix(vec3(0.030, 0.027, 0.025), vec3(0.150, 0.135, 0.120), thin * 0.7 + (n - 0.5) * 0.4);
  soot += uSky * (0.07 + 0.16 * top) * (0.35 + thin * 0.65);
  // And from underneath, while it is still over the flame.
  vec3 fire = vec3(1.0, 0.36, 0.08) * vLook.y * (1.0 - top) * (0.55 + 0.45 * n);
  vec3 col = mix(soot + fire, uFogColor, vFog);
  gl_FragColor = vec4(col, a * (1.0 - vFog * 0.4));
}
`;

/** One instanced set of flame cards, written fresh every frame. */
function flameCards(frag, count, order) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', QUAD.getAttribute('position'));
  geo.setAttribute('uv', QUAD.getAttribute('uv'));
  geo.setIndex(QUAD.getIndex());
  const attr = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  geo.setAttribute('iPos', attr(3));
  geo.setAttribute('iCard', attr(3));
  geo.setAttribute('iShape', attr(4));
  geo.setAttribute('iTrim', attr(3));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const mat = new THREE.ShaderMaterial({
    vertexShader: BILLBOARD_VERT,
    fragmentShader: frag,
    uniforms: { uTime: { value: Math.random() * 100 }, uFogDensity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
}

export class Flames {
  /**
   * `intensity` is the quality setting's particle scale: it decides how much
   * smoke is put into the air, never how big a fire is.
   */
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    this.fires = new Map();
    this.time = 0;
    // Which way the air is going, in metres a second; the battle sets it.
    this.wind = { x: 0, z: 0 };

    this.flame = flameCards(FLAME_FRAG, MAX_FIRES * CARDS, 10);
    this.glow = flameCards(GLOW_FRAG, MAX_FIRES, 9);
    scene.add(this.glow);
    scene.add(this.flame);

    // The smoke: a pool of puffs simulated here and drawn as one instance set.
    this.puffs = [];
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', QUAD.getAttribute('position'));
    geo.setAttribute('uv', QUAD.getAttribute('uv'));
    geo.setIndex(QUAD.getIndex());
    this.puffPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4);
    this.puffLook = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4);
    this.puffPos.setUsage(THREE.DynamicDrawUsage);
    this.puffLook.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPuff', this.puffPos);
    geo.setAttribute('iLook', this.puffLook);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.puffMat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uFogDensity: { value: 0 },
        uFogColor: { value: new THREE.Color(0.5, 0.55, 0.6) },
        uSky: { value: new THREE.Color(0.5, 0.55, 0.6) },
      },
      transparent: true,
      depthWrite: false,
    });
    this.smoke = new THREE.Mesh(geo, this.puffMat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 8;
    scene.add(this.smoke);
  }

  /**
   * Keep a fire burning at a place on a ship.
   *
   * Called every frame for every compartment that is alight: the key is what
   * ties this frame's call to the same fire as last frame's, so the flames
   * live and climb rather than being respawned from nothing. Stop calling and
   * the fire dies back on its own.
   */
  at(key, x, y, z, heat, span = 8) {
    let f = this.fires.get(key);
    if (!f) {
      if (this.fires.size >= MAX_FIRES) return;
      f = {
        x, y, z, heat: 0, seen: 0, span,
        seeds: Array.from({ length: CARDS }, () => Math.random()),
        jitter: Array.from({ length: CARDS }, () => [(Math.random() - 0.5), (Math.random() - 0.5)]),
        phase: Math.random() * 10,
        due: 0,
      };
      this.fires.set(key, f);
    }
    f.x = x; f.y = y; f.z = z;
    f.span = span;
    // Eased, so a fire that has just caught grows into its size and one that
    // has been put out dies back rather than snapping off.
    f.heat += (heat - f.heat) * 0.08;
    f.seen = 0.35;
  }

  /** How big a fire is, in metres: as wide as its compartment lets it be. */
  size(f) {
    const h = Math.max(0.05, f.heat);
    const w = THREE.MathUtils.clamp(f.span * 0.62, 7, 34) * (0.55 + 0.6 * h);
    return { w, h: w * (1.35 + 0.9 * h), heat: h };
  }

  update(dt) {
    this.time += dt;
    const fog = this.scene.fog;
    const fogDensity = fog ? (fog.density || 0) : 0;
    for (const m of [this.flame, this.glow]) {
      m.material.uniforms.uTime.value += dt;
      m.material.uniforms.uFogDensity.value = fogDensity;
    }
    const pu = this.puffMat.uniforms;
    pu.uTime.value = this.time;
    pu.uFogDensity.value = fogDensity;
    if (fog) {
      pu.uFogColor.value.copy(fog.color);
      pu.uSky.value.copy(fog.color);
    }

    // The fires: retire the ones nobody is feeding, draw the rest.
    const fl = this.flame.geometry;
    const gl = this.glow.geometry;
    let nf = 0, ng = 0;
    const lean = THREE.MathUtils.clamp(Math.hypot(this.wind.x, this.wind.z) * 0.012, 0.04, 0.35);
    for (const [key, f] of this.fires) {
      f.seen -= dt;
      if (f.seen <= 0) f.heat += (0 - f.heat) * Math.min(1, dt * 1.8);
      if (f.seen <= 0 && f.heat < 0.02) { this.fires.delete(key); continue; }
      const s = this.size(f);
      // Flicker on two beats that never line up.
      const flick = 0.86 + 0.09 * Math.sin(this.time * 7.1 + f.phase)
        + 0.06 * Math.sin(this.time * 2.7 + f.phase * 2.3);
      for (let c = 0; c < CARDS && nf < MAX_FIRES * CARDS; c++) {
        const k = c / (CARDS - 1);
        const w = s.w * (1 - k * 0.3);
        const h = s.h * (1 - k * 0.25);
        const j = f.jitter[c];
        fl.attributes.iPos.setXYZ(nf, f.x + j[0] * s.w * 0.3, f.y, f.z + j[1] * s.w * 0.3);
        fl.attributes.iCard.setXYZ(nf, w, h, lean * (0.6 + k));
        fl.attributes.iShape.setXYZW(nf, Math.max(1.6, w / TONGUE_M), Math.max(2.4, h / TONGUE_M),
          (RISE_MS / TONGUE_M) * (0.9 + k * 0.25),
          THREE.MathUtils.clamp((w * 0.34) / h, 0.05, 0.3));
        fl.attributes.iTrim.setXYZ(nf, f.seeds[c],
          THREE.MathUtils.clamp(0.06 + (w / h) * 0.42, 0.08, 0.42),
          Math.min(1, s.heat * 1.4) * (1 - k * 0.3) * (2.2 / CARDS) * flick);
        nf++;
      }
      if (ng < MAX_FIRES) {
        gl.attributes.iPos.setXYZ(ng, f.x, f.y - 1, f.z);
        gl.attributes.iCard.setXYZ(ng, s.w * 3.2, s.h * 1.8, lean * 0.4);
        gl.attributes.iShape.setXYZW(ng, 1, 1, 0, 0.1);
        gl.attributes.iTrim.setXYZ(ng, 0, 0.2, 0.2 * s.heat * flick);
        ng++;
      }
      // Smoke off the head of it, more the harder it burns.
      // Shared out when a great many are burning, so the last fire on the
      // list is not starved of smoke by the first.
      f.due -= dt * (1.3 + 2.7 * s.heat) * Math.min(1.6, this.intensity)
        * Math.min(1, 14 / Math.max(1, this.fires.size));
      while (f.due <= 0) {
        f.due += 1;
        this.puff(f, s);
      }
    }
    fl.instanceCount = nf;
    gl.instanceCount = ng;
    for (const g of [fl, gl]) {
      for (const n of ['iPos', 'iCard', 'iShape', 'iTrim']) g.attributes[n].needsUpdate = true;
    }

    this.stepSmoke(dt);
  }

  /** A puff of smoke leaving the head of a fire. */
  puff(f, s) {
    if (this.puffs.length >= MAX_PUFFS) return;
    const top = f.y + s.h * 0.55;
    const r0 = s.w * (0.35 + Math.random() * 0.2);
    this.puffs.push({
      x: f.x + (Math.random() - 0.5) * s.w * 0.5,
      y: top + Math.random() * s.h * 0.2,
      z: f.z + (Math.random() - 0.5) * s.w * 0.5,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 7 + 7 * s.heat + Math.random() * 3,
      vz: (Math.random() - 0.5) * 1.5,
      r0,
      // How fast it spreads, metres a second, early on.
      spread: 2.4 + 2.2 * s.heat + Math.random() * 1.2,
      age: 0,
      ttl: 20 + 12 * s.heat + Math.random() * 6,
      opa: 0.78 + 0.2 * s.heat,
      seed: Math.random(),
      spin: Math.random() * Math.PI * 2,
      turn: (Math.random() - 0.5) * 0.12,
    });
  }

  stepSmoke(dt) {
    const P = this.puffPos.array;
    const L = this.puffLook.array;
    const wx = this.wind.x, wz = this.wind.z;
    let n = 0;
    const out = [];
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.ttl) continue;
      // Climbing on its own heat, which it loses; and taken by the wind more
      // and more as it slows and spreads.
      const carry = Math.min(1, p.age / 3);
      const k = Math.exp(-dt / 9);
      p.vy = 3.2 + (p.vy - 3.2) * k;
      p.vx += (wx * 0.85 * carry - p.vx) * Math.min(1, dt * 0.6);
      p.vz += (wz * 0.85 * carry - p.vz) * Math.min(1, dt * 0.6);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.spin += p.turn * dt;
      const size = p.r0 + p.spread * Math.pow(p.age, 0.75) * 1.5;
      const u = p.age / p.ttl;
      // Dense as it leaves the flame, thinning as it spreads and gone at the end.
      const thin = Math.pow(p.r0 / size, 0.22);
      const alpha = p.opa * Math.min(1, p.age / 0.4) * (1 - u * u) * thin;
      out.push(p);
      if (alpha < 0.01) continue;
      P[n * 4] = p.x; P[n * 4 + 1] = p.y; P[n * 4 + 2] = p.z; P[n * 4 + 3] = size;
      L[n * 4] = alpha;
      L[n * 4 + 1] = Math.max(0, 1 - p.age / 1.3) * 0.45;
      L[n * 4 + 2] = p.seed;
      L[n * 4 + 3] = p.spin;
      n++;
    }
    this.puffs = out;
    this.smoke.geometry.instanceCount = n;
    this.puffPos.needsUpdate = true;
    this.puffLook.needsUpdate = true;
  }

  dispose() {
    for (const m of [this.flame, this.glow, this.smoke]) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.fires.clear();
    this.puffs.length = 0;
  }
}
