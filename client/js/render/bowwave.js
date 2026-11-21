// The water a ship under way heaps up along her sides.
//
// Watch any film of a destroyer going hard and what is round her is not spray
// and not particles: it is a roll of water. Her stem shoulders the sea aside,
// and it comes up her side as a bank, blue-green and glassy on its face where
// it is still solid water and white along its crest where it is breaking,
// curling over outward and falling back on the sea -- one unbroken heap of it
// from her stem back down her side, tallest at the bow, lower and broken up
// further aft, and pouring past her at the speed she is going. When she drives
// her bow down into a sea, the whole of that is thrown up over her forecastle
// as a cloud of spray that the wind of her own speed carries back over her.
//
// So the roll is a sheet of geometry, not a cloud of cards: a curled strip
// laid along each side of her at the waterline, in her own frame, so it rides
// with her as she pitches and rolls. Its shape is fixed; its size follows her
// speed every frame (a bow wave's height goes as the square of it), and the
// water on it -- the foam, the holes in it, the torn crest -- is noise carried
// aft along it at her own speed, so it pours rather than sits. The slam is the
// effects' own soft spray, thrown when her stem is plunging hard enough.

import * as THREE from '../../../vendor/three.module.js';

/** Stations along her, as fractions of her half-length, aft to stem. */
const T0 = -0.72;
const T1 = 0.97;
const ALONG = 56;
/** Points across the roll's profile, from her plating out to its lip. */
const ACROSS = 10;
/** Where the sea meets her plating in her own frame (see breakers.js). */
const WATER_Y = 1.0;
/** How far off the eye a roll is still drawn, in metres. */
const RANGE = 3200;
/** Whether the roll itself is drawn at all. It is not: see update(). */
const SHOW_ROLL = false;

const VERT = /* glsl */`
uniform float uTime;
uniform float uSpeed;     // metres a second through the water
uniform float uLen;       // her length
uniform float uSide;      // +1 starboard, -1 port
uniform float uScale;     // how big the roll is at her stem, in metres
attribute vec2 aProf;     // x: across the profile 0..1, y: along her 0..1 (aft to stem)
attribute float aHalf;    // her half-beam here
attribute float aZ;       // her own z here
varying vec2 vProf;
varying float vZ;
varying vec3 vN;
varying vec3 vView;
varying float vFog;
uniform float uFogDensity;

float h11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float n11(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }

void main() {
  float s = aProf.x;
  float a = aProf.y;
  // Tallest a little abaft the stem, where her shoulder meets the sea; low
  // and long down her side; gone toward her quarter.
  float bow = smoothstep(0.55, 0.9, a) * (1.0 - smoothstep(0.96, 1.0, a) * 0.6);
  float side = 0.32 + 0.25 * smoothstep(0.1, 0.6, a);
  float size = uScale * mix(side, 1.0, bow) * smoothstep(0.0, 0.12, a);
  // It heaves as it goes: the bank rises and falls along her in waves of its
  // own, travelling aft with the water.
  float flow = aZ + uTime * uSpeed;
  float heave = 0.75 + 0.5 * n11(flow * 0.045 + uSide * 7.0) + 0.25 * n11(flow * 0.13 + 3.0);
  size *= heave;
  // The profile: up off her plating, out, over the crest and down onto the sea
  // outboard -- a wave curling away from her.
  float ang = s * 2.4;
  float reach = (0.15 + 1.35 * s + 0.25 * sin(ang)) * size * 0.9;
  float up = sin(min(ang, 3.1)) * size * (1.0 - 0.35 * s);
  vec3 p = vec3(uSide * (aHalf + 0.2 + reach), ${WATER_Y.toFixed(1)} - 0.3 + up, aZ);
  vec3 n = normalize(vec3(uSide * sin(ang), cos(ang) + 0.3, 0.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * n);
  vView = -mv.xyz;
  vProf = aProf;
  vZ = aZ;
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uSpeed;
uniform float uSide;
uniform float uFade;
uniform vec3 uSunDir;     // in view space
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFogColor;
varying vec2 vProf;
varying float vZ;
varying vec3 vN;
varying vec3 vView;
varying float vFog;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.1 + 3.1) * 0.27 + vn(p * 4.3 + 7.7) * 0.15 + vn(p * 8.9 + 1.3) * 0.08; }

void main() {
  float s = vProf.x;
  float a = vProf.y;
  // The water on it, carried aft at her speed: the roll stays where her
  // shoulder is, and what it is made of pours through it.
  vec2 q = vec2(vZ + uTime * uSpeed * 0.92, s * 9.0 + uSide * 11.0);
  vec2 w = vec2(fbm(q * vec2(0.05, 0.3) + uTime * 0.2), fbm(q * vec2(0.05, 0.3) + 5.0 - uTime * 0.15)) - 0.5;
  float f = fbm(q * vec2(0.11, 0.55) + w * 2.5);
  float g = fbm(q * vec2(0.33, 1.4) + w * 1.5 + 9.0);
  // White on the crest and down its outer face, where it is breaking; solid
  // glassy water on the face against her, with streaks of foam dragged
  // through it.
  float crest = smoothstep(0.2, 0.55, s + (f - 0.5) * 0.3);
  float foam = clamp(crest * (0.55 + 0.75 * f) + smoothstep(0.55, 0.85, g) * 0.5 * (1.0 - crest), 0.0, 1.0);
  // Torn at its lip and thin at its ends: the crest comes apart into
  // rags of white, and the bank grows out of the sea and back into it.
  float lip = 1.0 - smoothstep(0.55 + 0.3 * f, 0.95, s + (g - 0.5) * 0.5);
  // And holes torn through its outer half, where it is spray more than water.
  lip *= mix(1.0, smoothstep(0.25, 0.55, g * 0.7 + f * 0.3), smoothstep(0.5, 0.9, s));
  float ends = smoothstep(0.0, 0.1, a) * (1.0 - smoothstep(0.985, 1.0, a));
  float root = smoothstep(0.0, 0.06, s);
  float alpha = lip * ends * root * mix(0.72, 0.97, foam) * uFade;
  if (alpha < 0.01) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float ndl = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 4.0);
  // The water: deep blue-green, lit through where it is thin and catching
  // the sky on its face.
  // The sea's own water, as the ocean draws it -- the same deep body and the
  // same lighter water in the thin of a crest -- so the bank she heaps up is
  // the sea standing up against her and not a different colour laid on it.
  vec3 water = mix(uDeep * 0.85, uShallow, 0.3 + 0.25 * f)
             + uSun * vec3(0.30, 0.55, 0.50) * pow(ndl, 2.0) * 0.45;
  // And the sky in it, as the sea round it has: at a low angle most of what
  // the eye gets off water is the sky.
  water = mix(water, uSky, 0.32 + fres * 0.5);
  // The foam: bright, lit, greyer in its folds.
  vec3 white = mix(water, (uSky * 0.8 + uSun * (0.5 + 0.45 * ndl)) * (0.84 + 0.2 * g), 0.8);
  vec3 col = mix(water, white, foam);
  col = mix(col, uFogColor, vFog);
  // Out through the same tone mapping and colour space as the sea itself, so
  // the same water comes out the same colour on screen.
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
}
`;

const _eye = new THREE.Vector3();
const _bow = new THREE.Vector3();
const _sun = new THREE.Vector3();

/** One side's strip, in the ship's own frame. */
function rollGeometry(halfAt, len) {
  const n = ALONG * ACROSS;
  const prof = new Float32Array(n * 2);
  const half = new Float32Array(n);
  const z = new Float32Array(n);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < ALONG; i++) {
    const a = i / (ALONG - 1);
    const t = T0 + (T1 - T0) * a;
    const hb = halfAt(t);
    for (let j = 0; j < ACROSS; j++) {
      const k = i * ACROSS + j;
      prof[k * 2] = j / (ACROSS - 1);
      prof[k * 2 + 1] = a;
      half[k] = hb;
      z[k] = (t * len) / 2;
    }
  }
  const idx = [];
  for (let i = 0; i < ALONG - 1; i++) {
    for (let j = 0; j < ACROSS - 1; j++) {
      const k = i * ACROSS + j;
      idx.push(k, k + 1, k + ACROSS + 1, k, k + ACROSS + 1, k + ACROSS);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aProf', new THREE.BufferAttribute(prof, 2));
  g.setAttribute('aHalf', new THREE.BufferAttribute(half, 1));
  g.setAttribute('aZ', new THREE.BufferAttribute(z, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), len);
  return g;
}

/** How wide she is at a station, from her lines when the model has them. */
function halfBeamOf(view) {
  const lines = view.group?.userData?.lines;
  const B = view.cls.hull.beam;
  if (lines && typeof lines.shellAt === 'function') {
    return (t) => {
      const v = lines.shellAt(t, WATER_Y);
      return Number.isFinite(v) && v > 0 ? v : 0.2;
    };
  }
  // A plain hull: full amidships, fining to her stem and a little to her stern.
  return (t) => (B / 2) * Math.max(0.05, 1 - Math.pow(Math.max(0, t), 2.6)) * (1 - 0.25 * Math.pow(Math.max(0, -t), 3));
}

export class BowWaves {
  constructor(scene, effects = null, { intensity = 1 } = {}) {
    this.scene = scene;
    this.effects = effects;
    this.intensity = intensity;
    this.rolls = new Map();
    this.time = 0;
    this.sky = new THREE.Color(0.55, 0.62, 0.7);
    this.sun = new THREE.Color(0.95, 0.93, 0.88);
    this.deep = new THREE.Color(0.03, 0.12, 0.18);
    this.shallow = new THREE.Color(0.06, 0.2, 0.26);
    this.sunDir = new THREE.Vector3(0.4, 0.8, -0.3).normalize();
  }

  /** The hour, as the sea has it: what lights the water and the foam. */
  setAtmosphere({ sky, sun, deep, shallow, sunDir } = {}) {
    if (shallow) this.shallow.copy(shallow);
    if (sky) this.sky.copy(sky);
    if (sun) this.sun.copy(sun);
    if (deep) this.deep.copy(deep);
    if (sunDir) this.sunDir.copy(sunDir).normalize();
  }

  rollFor(view) {
    let r = this.rolls.get(view);
    if (r) return r;
    const cls = view.cls;
    if (!cls || !cls.hull || cls.dive || cls.monster || !view.group) return null;
    const len = cls.hull.length;
    const geo = rollGeometry(halfBeamOf(view), len);
    const sides = [1, -1].map((side) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 }, uSpeed: { value: 0 }, uLen: { value: len }, uSide: { value: side },
          uScale: { value: 0 }, uFade: { value: 0 },
          uSunDir: { value: new THREE.Vector3() }, uSun: { value: this.sun }, uSky: { value: this.sky },
          uDeep: { value: this.deep }, uShallow: { value: this.shallow }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Premultiplied, like the rest of the water's effects.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.visible = false;
      view.group.add(mesh);
      return mesh;
    });
    r = { sides, geo, len, beam: cls.hull.beam, bowY: null, cool: 0, speed: 0 };
    this.rolls.set(view, r);
    return r;
  }

  /**
   * One frame of it, for every ship in `views` (ShipViews: a `group`, a `cls`,
   * and `sea.speed` -- how fast she is going through the water).
   */
  update(dt, camera, views) {
    this.time += dt;
    const eye = camera ? camera.getWorldPosition(_eye) : null;
    if (camera) _sun.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
    const fog = this.scene.fog;
    const seen = new Set();
    for (const view of views) {
      const r = this.rollFor(view);
      if (!r) continue;
      seen.add(view);
      const g = view.group;
      const gone = !g.visible || view.going || view.halves || view.rupture || view.severed
        || (view.depth || 0) > 1 || (view.sinkY || 0) > 2;
      const v = gone ? 0 : Math.abs(view.sea?.speed ?? view.speed ?? 0);
      // Eased, so she gathers her bow wave and loses it rather than switching it.
      r.speed += (v - r.speed) * Math.min(1, dt * 1.5);
      g.updateMatrixWorld();
      const e = g.matrixWorld.elements;
      const far = eye ? Math.hypot(e[12] - eye.x, e[14] - eye.z) : 0;
      // A bow wave's height goes as her speed squared: a foot or two at
      // fifteen knots, a bank as high as a man and more at thirty.
      const scale = Math.min(r.beam * 0.3, 0.02 * r.speed * r.speed) * Math.min(1.2, Math.sqrt(r.len / 120));
      const fade = smoothstepJS(1.2, 4, r.speed) * (1 - smoothstepJS(RANGE * 0.7, RANGE, far));
      for (const m of r.sides) {
        // Not drawn. The roll stood up off her side as a sheet of solid,
        // creamy geometry -- a fold of lotion laid along the hull rather than
        // water -- and it hid the white water the sea itself now draws round
        // her stem and down her side (see the wake map in wakefield.js). Kept
        // only for the slam below, which is spray and reads as spray.
        m.visible = SHOW_ROLL && fade > 0.01;
        const u = m.material.uniforms;
        u.uTime.value = this.time;
        u.uSpeed.value = r.speed;
        u.uScale.value = scale;
        u.uFade.value = fade;
        u.uSunDir.value.copy(_sun);
        if (fog) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = fog.density || 0; }
      }
      this.slam(view, r, dt, e, far);
    }
    for (const [view, r] of this.rolls) {
      if (seen.has(view)) continue;
      for (const m of r.sides) { m.removeFromParent(); m.material.dispose(); }
      r.geo.dispose();
      this.rolls.delete(view);
    }
  }

  /**
   * Her stem driven down into a sea: the bow wave thrown up over her
   * forecastle as a cloud of spray, and carried back over her by the wind of
   * her own way.
   */
  slam(view, r, dt, e, far) {
    const fx = this.effects;
    _bow.set(0, WATER_Y + 2, r.len * 0.42).applyMatrix4(view.group.matrixWorld);
    const was = r.bowY;
    r.bowY = _bow.y;
    r.cool = Math.max(0, r.cool - dt);
    if (!fx || was === null || dt <= 0 || far > 2600 || r.speed < 5) return;
    const vy = (_bow.y - was) / dt;
    // Plunging: going down fast, and down into the water.
    if (vy > -2.2 || r.cool > 0) return;
    r.cool = 1.6;
    const k = Math.min(2.2, (-vy - 2.2) * 0.5 + r.speed / 12) * Math.min(1.4, r.len / 140);
    // Which way she is going, and so which way the spray is left behind.
    const fx0 = e[8], fz0 = e[10];
    const wind = fx.wind || { x: 0, z: 0 };
    const n = Math.round((6 + 6 * k) * Math.min(1.4, this.intensity));
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const back = Math.random() * r.len * 0.18;
      const x = _bow.x - fx0 * back + e[0] * side * r.beam * (0.3 + Math.random() * 0.5);
      const z = _bow.z - fz0 * back + e[2] * side * r.beam * (0.3 + Math.random() * 0.5);
      const g = 0.86 + Math.random() * 0.1;
      // Thrown up and out over her side, then hung in the air and left astern:
      // the ship runs out from under it at her own speed.
      fx.spawn({
        x, y: _bow.y + 1 + Math.random() * 3 * k, z,
        vx: e[0] * side * (3 + Math.random() * 5) + fx0 * r.speed * 0.25 + wind.x,
        vy: 6 + Math.random() * 7 * k,
        vz: e[2] * side * (3 + Math.random() * 5) + fz0 * r.speed * 0.25 + wind.z,
        size: (4 + Math.random() * 4) * k, grow: (5 + Math.random() * 4) * k,
        ttl: 2.2 + Math.random() * 1.6, drag: 0.45, lift: -5.5, billow: Math.random() < 0.5,
        spin: (Math.random() - 0.5) * 0.4,
        color: new THREE.Color(g, g * 1.01, g * 1.03).getHex(), opacity: 0.42 + 0.18 * Math.min(1, k),
      });
    }
  }

  dispose() {
    for (const [, r] of this.rolls) {
      for (const m of r.sides) { m.removeFromParent(); m.material.dispose(); }
      r.geo.dispose();
    }
    this.rolls.clear();
  }
}

function smoothstepJS(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
