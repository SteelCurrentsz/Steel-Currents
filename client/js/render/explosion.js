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

// The fireball proper: a ball of burning gas that swells fast, slows, cools
// from white through yellow to a deep red, and is eaten from the outside in by
// the soot it is making.
const FIREBALL_FRAG = /* glsl */`
uniform float uLife;
uniform float uSeed;
varying vec2 vUv;
${NOISE}

vec3 ramp(float t) {
  vec3 c = mix(vec3(0.18, 0.012, 0.002), vec3(0.92, 0.17, 0.012), smoothstep(0.00, 0.30, t));
  c = mix(c, vec3(1.00, 0.48, 0.06), smoothstep(0.26, 0.56, t));
  c = mix(c, vec3(1.00, 0.82, 0.30), smoothstep(0.54, 0.80, t));
  c = mix(c, vec3(1.00, 0.98, 0.90), smoothstep(0.80, 1.00, t));
  return c;
}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ang = atan(p.y, p.x);

  // Fast at first and then slowing, the way a real ball of gas runs out of
  // pressure — a linear expansion reads as an inflating balloon.
  float grow = pow(uLife, 0.42);

  // The boiling edge. Sampled in polar coordinates so the lobes belong to the
  // ball rather than sliding across a square.
  vec2 q = vec2(ang * 1.9, r * 2.4 - uLife * 1.7) + uSeed * 37.0;
  float n = fbm(q * 1.7 + vec2(fbm(q * 2.3), fbm(q * 2.3 + 5.1)) * 0.8);
  float edge = grow * (0.62 + 0.55 * n);

  float d = 1.0 - smoothstep(edge * 0.55, edge, r);
  if (d < 0.004) discard;

  // Cooling: the core stays bright longest, the skirts go to soot first.
  float heat = clamp(d * (1.25 - uLife * 1.05) - (1.0 - d) * uLife * 0.5, 0.0, 1.0);
  float soot = smoothstep(0.45, 1.0, uLife) * (1.0 - d * 0.6);
  vec3 col = mix(ramp(heat), vec3(0.06, 0.05, 0.045), soot);

  float fade = 1.0 - smoothstep(0.68, 1.0, uLife);
  gl_FragColor = vec4(col, clamp(d * fade, 0.0, 1.0));
}
`;

// The column that stands after it: dirty, lit from beneath while the fire is
// still in it, spreading as it climbs.
const PLUME_FRAG = /* glsl */`
uniform float uLife;
uniform float uSeed;
uniform vec3 uLit;
varying vec2 vUv;
${NOISE}

void main() {
  vec2 uv = vUv;
  float spread = 0.20 + uv.y * (0.75 + uLife * 0.9);
  vec2 p = vec2((uv.x - 0.5) / spread * 2.4, uv.y * 1.15 - uLife * 0.85 + uSeed * 11.0);
  float n = fbm(p * 1.25 + vec2(fbm(p * 1.1), fbm(p * 1.1 + 3.3)) * 0.9);

  float across = 1.0 - smoothstep(0.32, 1.0, abs(uv.x - 0.5) / spread);
  // The head of the column climbs as the blast ages; below it the stem thins.
  float head = smoothstep(0.0, 0.16, uv.y) * (1.0 - smoothstep(uLife * 1.15, uLife * 1.15 + 0.35, uv.y));
  float d = across * head * smoothstep(0.24, 0.76, n);

  float fade = smoothstep(0.0, 0.10, uLife) * (1.0 - smoothstep(0.55, 1.0, uLife));
  d = clamp(d * fade * 0.95, 0.0, 1.0);
  if (d < 0.004) discard;

  vec3 col = mix(vec3(0.062, 0.055, 0.050), vec3(0.14, 0.125, 0.115), n);
  col = mix(col, uLit, pow(1.0 - uv.y, 3.0) * (1.0 - smoothstep(0.0, 0.45, uLife)) * 0.85);
  gl_FragColor = vec4(col, d);
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
  d *= 1.0 - smoothstep(0.75, 1.0, r);
  float fade = (1.0 - smoothstep(0.25, 1.0, uLife)) * smoothstep(0.0, 0.06, uLife);
  d *= fade;
  if (d < 0.004) discard;
  gl_FragColor = vec4(vec3(0.62, 0.56, 0.47), d * 0.26);
}
`;

// Debris: everything thrown out by every blast at once, in one buffer. Each
// point carries where it started, how fast, and when — the arc is worked out in
// the vertex stage so the CPU never touches a particle.
const DEBRIS_VERT = /* glsl */`
uniform float uTime;
attribute vec3 vel;
attribute vec2 born;   // x = time of the blast, y = how long this piece lasts
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
  gl_PointSize = max(1.0, 260.0 / max(1.0, -mv.z)) * (1.0 - age * 0.4);
}
`;

const DEBRIS_FRAG = /* glsl */`
varying float vAge;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  // Struck metal and burning fragments: bright as they leave, dull as they fall.
  vec3 col = mix(vec3(1.0, 0.82, 0.42), vec3(0.42, 0.10, 0.03), pow(vAge, 0.7));
  gl_FragColor = vec4(col, (1.0 - smoothstep(0.6, 1.0, vAge)) * 0.9);
}
`;

const QUAD = new THREE.PlaneGeometry(1, 1, 1, 1);
const DEBRIS_MAX = 900;

/** One pool of blasts, from a stick of bombs down to a burning drum going up. */
export class ExplosionSystem {
  constructor(scene, { slots = 12 } = {}) {
    this.scene = scene;
    this.time = 0;
    this.slots = [];
    this.next = 0;

    for (let i = 0; i < slots; i++) this.slots.push(this.makeSlot());

    // Debris for every blast, in one draw.
    const pos = new Float32Array(DEBRIS_MAX * 3);
    const vel = new Float32Array(DEBRIS_MAX * 3);
    const born = new Float32Array(DEBRIS_MAX * 2).fill(-1e9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('vel', new THREE.BufferAttribute(vel, 3));
    geo.setAttribute('born', new THREE.BufferAttribute(born, 2));
    this.debrisMat = new THREE.ShaderMaterial({
      vertexShader: DEBRIS_VERT,
      fragmentShader: DEBRIS_FRAG,
      uniforms: { uTime: { value: 0 } },
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
          uLife: { value: 2 }, uSeed: { value: 0 },
          uSize: { value: 1 }, uRise: { value: 0 }, ...extra,
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

    const ball = mk(FIREBALL_FRAG, {}, THREE.AdditiveBlending, 11);
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

    return { ball, plume, ring, light, life: 2, dur: 1, size: 1, lightPeak: 0 };
  }

  /**
   * Set one off.
   * @param size   radius of the fireball in metres — 12 for a burning drum,
   *               70 for a stick of bombs in a warehouse.
   * @param debris how many fragments to throw out; 0 for a small one.
   */
  blast(x, y, z, { size = 40, duration = 2.2, debris = 40, light = true, plume = true } = {}) {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;

    s.life = 0;
    s.dur = duration;
    s.size = size;
    s.plumeOn = plume;

    s.ball.visible = true;
    s.ball.position.set(x, y, z);
    s.ball.material.uniforms.uSeed.value = Math.random();

    s.plume.visible = plume;
    s.plume.position.set(x, y, z);
    s.plume.material.uniforms.uSeed.value = Math.random();

    s.ring.visible = true;
    s.ring.position.set(x, y + 1.5, z);

    s.lightPeak = light ? size * 0.9 : 0;
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

    // Up and out, with the slow pieces staying low and the fast ones arcing.
    const th = Math.random() * Math.PI * 2;
    const up = 0.25 + Math.random() * 0.75;
    const speed = size * (0.5 + Math.random() * 1.5);
    p.setXYZ(i, x, y + 2, z);
    v.setXYZ(i, Math.cos(th) * speed * (1 - up), speed * up * 1.5, Math.sin(th) * speed * (1 - up));
    b.setXY(i, this.time, 1.6 + Math.random() * 2.2);
    p.needsUpdate = v.needsUpdate = b.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.debrisMat.uniforms.uTime.value = this.time;

    for (const s of this.slots) {
      if (s.life > 1) continue;
      s.life += dt / s.dur;
      const t = Math.min(1, s.life);

      s.ball.material.uniforms.uLife.value = t;
      s.ball.material.uniforms.uSize.value = s.size * 2.2;
      s.ball.material.uniforms.uRise.value = s.size * 0.35 * Math.pow(t, 0.7);

      if (s.plumeOn) {
        s.plume.material.uniforms.uLife.value = t;
        s.plume.material.uniforms.uSize.value = s.size * 3.4;
        s.plume.material.uniforms.uRise.value = s.size * 3.0;
      }

      s.ring.material.uniforms.uLife.value = t;
      s.ring.scale.setScalar(s.size * 4.5);

      // The flash is nearly all in the first fifth of a second, then it is only
      // the fire in the smoke.
      const flash = Math.exp(-t * 7.0) + Math.exp(-t * 1.6) * 0.35;
      s.light.intensity = s.lightPeak * flash * 0.3;

      if (s.life > 1) {
        s.ball.visible = s.plume.visible = s.ring.visible = s.light.visible = false;
      }
    }
  }
}
