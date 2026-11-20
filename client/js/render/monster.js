// Monster One, drawn from the owner's model -- "Godzilla Minus One" by
// ArachnoBoy (https://sketchfab.com/3d-models/godzilla-minus-one-ccaf341a3e734263a88cecb5c49eac0e),
// under the Sketchfab Standard licence -- rigged by build/prepare-monster.mjs.
//
// She is the model exactly: its five meshes, its fourteen textures and its
// materials as the model has them (a clearcoat over her hide, with its own
// normal map, which is where the wet sheen on her scales comes from). What
// is added is a skeleton under her skin and something to move it.
//
// Nothing she does is a canned clip. Every frame each of her bones is given
// the angle it ought to have now -- the posture she is in, blended with
// whatever she is doing on top of it -- and is eased toward that angle rather
// than set to it, so whatever the battle tells her, and however suddenly, her
// body follows it smoothly. Her posture is one number running between
// swimming flat in the water and standing up in it, and it is itself eased,
// so she rears up and settles down over seconds, the way something of her
// size would. Her plates light up from the tip of her tail to the back of her
// head as she charges, off a shader that reads, for every point of every
// plate, how far forward along her it is and how far up its plate.
//
// Frame, as every hull in the game: +Z ahead, +Y up, y = 0 at the waterline.
import * as THREE from '../../../vendor/three.module.js';
import * as D from './monsterOne.data.js';

const B64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const f32 = (s) => { const b = B64(s); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const u16 = (s) => { const b = B64(s); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2); };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
/** Up from nothing to one over [a0, a1] and back down over [b0, b1]. */
const window01 = (x, a0, a1, b0, b1) => smooth(a0, a1, x) * (1 - smooth(b0, b1, x));

// The crystal blue her plates and her breath burn.
export const BREATH_BLUE = new THREE.Color(0x2fb4ff);
const CORE_WHITE = new THREE.Color(0xe8fbff);

// ------------------------------------------------------------- textures --
// One set, made the first time she is built and shared by every Monster One
// in the battle.
let TEXTURES = null;
function textures() {
  if (TEXTURES) return TEXTURES;
  TEXTURES = D.IMAGES.map((b64, i) => {
    const t = new THREE.Texture();
    const img = new Image();
    img.onload = () => { t.image = img; t.needsUpdate = true; };
    img.src = `data:image/webp;base64,${b64}`;
    // As glTF has them: not flipped, repeating, mipmapped.
    t.flipY = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.userData.index = i;
    return t;
  });
  // The colour maps are colour; everything else is data.
  for (const m of D.MATERIALS) if (m.map != null) TEXTURES[m.map].colorSpace = THREE.SRGBColorSpace;
  return TEXTURES;
}

/**
 * What her hide reflects. The model is lit, where it was made, by a room of
 * light all round it, and its clearcoat -- the wet sheen over her scales --
 * is a reflection of that; under nothing but a sun and a sky term it has
 * nothing to reflect and she is a black shape. So she carries her own: an
 * overcast sky over a dark sea, bright at the horizon, as a picture three.js
 * turns into reflections itself.
 */
let ENV = null;
function envTexture() {
  if (ENV) return ENV;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#9fb1c4');
  g.addColorStop(0.42, '#d9e2ea');
  g.addColorStop(0.5, '#eef2f5');
  g.addColorStop(0.56, '#5d6d79');
  g.addColorStop(1, '#141c22');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 128);
  // A brighter patch where the sun is behind the cloud.
  const s = x.createRadialGradient(70, 34, 0, 70, 34, 50);
  s.addColorStop(0, 'rgba(255,250,238,0.9)');
  s.addColorStop(1, 'rgba(255,250,238,0)');
  x.fillStyle = s;
  x.fillRect(0, 0, 256, 128);
  ENV = new THREE.CanvasTexture(c);
  ENV.mapping = THREE.EquirectangularReflectionMapping;
  ENV.colorSpace = THREE.SRGBColorSpace;
  return ENV;
}

/** One of the model's materials, as three.js's own glTF loader would make it. */
function material(def, hasTangents) {
  const T = textures();
  const at = (i) => (i == null ? null : T[i]);
  const m = new THREE.MeshPhysicalMaterial({
    name: def.name,
    map: at(def.map),
    roughnessMap: at(def.mr), metalnessMap: at(def.mr),
    roughness: def.roughness, metalness: def.metalness,
    aoMap: at(def.ao),
    normalMap: at(def.normal),
    clearcoat: def.clearcoat,
    clearcoatMap: at(def.clearcoatMap),
    clearcoatRoughness: def.clearcoatRoughness,
    clearcoatRoughnessMap: at(def.clearcoatRoughnessMap),
    clearcoatNormalMap: at(def.clearcoatNormal),
    specularIntensity: def.specular,
    specularIntensityMap: at(def.specularMap),
    specularColor: new THREE.Color(1, 1, 1),
    envMap: envTexture(),
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  // glTF's normal maps are drawn for a texture that is not flipped; without
  // tangents of its own a mesh's are worked out on the fly, the other way up
  // (three.js issue 11438), and the loader turns the green channel over to
  // match. So does she.
  if (!hasTangents) {
    m.normalScale.y *= -1;
    m.clearcoatNormalScale.y *= -1;
  }
  return m;
}

// --------------------------------------------------------- the plate glow --
// Added to the plates' own material: each point of a plate is lit once the
// charge has climbed past where along her it stands, from its root to its
// points, and burns brighter, a little unevenly, the longer it has been lit.
function glowing(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 glow;\nvarying vec2 vGlow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCharge;
uniform float uLevel;
uniform float uTime;
uniform vec3 uGlowColor;
varying vec2 vGlow;
float plateLit() {
  // The front, climbing her from tail to head as the charge goes nought to
  // one, and up each plate a little behind it.
  float front = uCharge * 1.25 - vGlow.x - vGlow.y * 0.1;
  return smoothstep(0.0, 0.14, front) * uLevel;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float lit = plateLit();
// Crystal, not paint: the plate itself goes pale and blue as it lights.
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.8, 0.95) * 0.35, lit * 0.6);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float flick = 0.82 + 0.18 * sin(uTime * 13.0 + vGlow.x * 41.0) * sin(uTime * 7.3 + vGlow.y * 9.0);
totalEmissiveRadiance += uGlowColor * lit * (0.35 + 0.75 * vGlow.y * vGlow.y) * flick;`);
  };
  mat.customProgramCacheKey = () => 'monster-plates';
}

// --------------------------------------------------------------- poses --
// Each bone's angle in her two postures, as [x, y, z] Euler radians on top of
// the model's own pose (which is standing). A nod is +x (head down, tail up),
// a swing to her left +y.
const SWIM = {
  // Flat in the water: her body tipped forward until her back is the top of
  // her -- the tip shared down her spine so she bends through her whole back
  // and not at one joint -- her neck and skull brought back up so she looks
  // where she is going, her tail brought back down level behind her over its
  // first three bones, her legs trailing and her arms drawn in to her chest.
  hips: [1.0, 0, 0],
  spine1: [0.2, 0, 0],
  spine2: [0.14, 0, 0],
  chest: [0.08, 0, 0],
  neck1: [-0.45, 0, 0],
  neck2: [-0.45, 0, 0],
  head: [-0.52, 0, 0],
  jaw: [0, 0, 0],
  tail0: [-0.62, 0, 0],
  tail1: [-0.42, 0, 0],
  tail2: [-0.1, 0, 0],
  tail4: [0.03, 0, 0],
  tail6: [0.03, 0, 0],
  'thigh.L': [0.32, 0, 0.06], 'thigh.R': [0.32, 0, -0.06],
  'shin.L': [0.35, 0, 0], 'shin.R': [0.35, 0, 0],
  'foot.L': [0.8, 0, 0], 'foot.R': [0.8, 0, 0],
  'upperArm.L': [-0.25, 0, -0.2], 'upperArm.R': [-0.25, 0, 0.2],
  'foreArm.L': [-0.45, 0, 0], 'foreArm.R': [-0.45, 0, 0],
  'hand.L': [-0.25, 0, 0], 'hand.R': [-0.25, 0, 0],
};
const STAND = {
  // Up in the water, as the model stands, a little forward over the arms.
  spine2: [0.03, 0, 0],
  chest: [0.04, 0, 0],
  neck1: [-0.02, 0, 0],
  'upperArm.L': [-0.12, 0, -0.08], 'upperArm.R': [-0.12, 0, 0.08],
};
// How far below the water her soles are in each posture, so that swimming
// her plates and nothing else of her are out of it, standing she is in it to
// her waist, and down she is under it altogether.
const BODY_Y = { deep: -112, swim: -38, stand: -42 };

// ------------------------------------------------------------- the beam --
const BEAM_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BEAM_FRAG = `
uniform float uTime;
uniform float uOn;
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uHalo;
varying vec2 vUv;
void main() {
  // Across the beam: white at the heart, blue out to the edge.
  float across = abs(vUv.x - 0.5) * 2.0;
  float body = pow(1.0 - across, uHalo);
  // Down it: running, rippling, the way a river of light does.
  float run = 0.75 + 0.25 * sin(vUv.y * 140.0 - uTime * 60.0) * sin(vUv.y * 37.0 - uTime * 23.0 + across * 4.0);
  vec3 c = mix(uColor, uCore, pow(body, 3.0));
  gl_FragColor = vec4(c * body * run * uOn * 2.2, body * uOn);
}`;
function beamMesh(halo, radius) {
  // A cylinder along +Y from 0 to 1, crossed by a second at right angles so
  // it is a beam from every side and not a ribbon.
  const g = new THREE.CylinderGeometry(radius, radius, 1, 12, 1, true);
  g.translate(0, 0.5, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOn: { value: 0 }, uHalo: { value: halo },
      uColor: { value: BREATH_BLUE.clone() }, uCore: { value: CORE_WHITE.clone() },
    },
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

// A soft round spot of light, for the glow at her mouth and on her plates.
let GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(160,230,255,0.7)');
  g.addColorStop(1, 'rgba(60,180,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(c);
  return GLOW_TEX;
}

// --------------------------------------------------------------- the rig --
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _yq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * What she is doing, as the rig reads it. Everything is optional; leave it
 * as it is and she swims slowly on the surface.
 *
 *   pose     'deep' | 'swim' | 'stand'
 *   speed    metres a second through the water
 *   yawRate  radians a second she is turning, + to her left
 *   act      '' | 'tail' | 'reach' | 'hold' | 'throw' | 'charge' | 'fire' | 'roar' | 'die'
 *   actT     seconds she has been at it
 *   side     +1 her left, -1 her right: which way a tail swing goes
 *   charge   nought to one, how far up her the glow has climbed
 *   glow     nought to one, how bright what is lit burns
 *   look     a point in her own frame to look at, or null
 *   beamTo   a point in her own frame the breath strikes, or null
 *   holding  whether she has a ship in her hands
 */
export class MonsterRig {
  constructor(built) {
    Object.assign(this, built);
    this.t = 0;
    this.phase = 0;
    this.upright = 0;       // her posture: 0 flat, 1 standing
    this.bodyY = BODY_Y.swim;
    this.beamLen = 0;
    this.glowNow = 0;
    this.chargeNow = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.yawRateNow = 0;
    this.speedNow = 0;
    this.jawNow = 0;
    this.gait = 0;
    this.walkBob = 0;
    this.snort = 0;
    this.target = new Map();
    this.eased = this.bones.map(() => new THREE.Quaternion());
    this.posed = false;
  }

  /** Every bone's target angle for this frame, as Euler [x, y, z]. */
  pose(S, dt) {
    const T = this.target;
    for (const b of this.bones) {
      const a = T.get(b.name) || [0, 0, 0];
      a[0] = a[1] = a[2] = 0;
      T.set(b.name, a);
    }
    const add = (name, x, y = 0, z = 0) => { const a = T.get(name); if (a) { a[0] += x; a[1] += y; a[2] += z; } };
    const u = this.upright, s = 1 - u;
    // The posture, between flat and standing.
    for (const [k, v] of Object.entries(SWIM)) add(k, v[0] * s, v[1] * s, v[2] * s);
    for (const [k, v] of Object.entries(STAND)) add(k, v[0] * u, v[1] * u, v[2] * u);

    const t = this.t;
    const sp = clamp(this.speedNow / 12, 0, 1);
    // Swimming: a wave travelling down her tail, slow and long for something
    // her size, bigger the faster she goes, and her body answering it.
    {
      const k = s;
      const amp = 0.35 + 0.65 * sp;
      for (let i = 0; i <= 8; i++) {
        const a = (0.035 + 0.02 * i) * amp * k;
        add(`tail${i}`, 0.012 * k * Math.sin(this.phase - i * 0.5 + 1.1), a * Math.sin(this.phase - i * 0.55));
      }
      // Her body swings against her tail, about what is now her up.
      add('hips', 0, 0, -0.05 * amp * k * Math.sin(this.phase + 0.6));
      add('chest', 0, 0, 0.03 * amp * k * Math.sin(this.phase + 1.4));
      // Her legs kick, slowly and out of step, her toes trailing each kick,
      // and her arms paddle a little, close in to her chest.
      add('thigh.L', 0.12 * k * Math.sin(this.phase * 0.5), 0);
      add('thigh.R', -0.12 * k * Math.sin(this.phase * 0.5), 0);
      add('shin.L', 0.1 * k * Math.sin(this.phase * 0.5 - 0.7));
      add('shin.R', -0.1 * k * Math.sin(this.phase * 0.5 - 0.7));
      add('toes.L', 0.25 * k * Math.sin(this.phase * 0.5 - 1.3));
      add('toes.R', -0.25 * k * Math.sin(this.phase * 0.5 - 1.3));
      for (const [n, sg] of [['L', 1], ['R', -1]]) {
        const st = Math.sin(this.phase * 0.5 + (sg > 0 ? 0 : Math.PI));
        add(`upperArm.${n}`, 0.12 * k * st * amp, 0, -0.04 * sg * k * st);
        add(`foreArm.${n}`, 0.1 * k * Math.sin(this.phase * 0.5 - 0.6 + (sg > 0 ? 0 : Math.PI)) * amp);
        add(`fingers.${n}`, 0.15 * k);
      }
      // Her head working against the swing of her body, as a swimmer's does.
      add('neck2', 0, -0.04 * amp * k * Math.sin(this.phase + 1.8));
      add('head', 0.02 * k * Math.sin(this.phase * 2 + 0.4), -0.03 * amp * k * Math.sin(this.phase + 2.2));
    }
    // Standing: treading water when she is still, her tail sweeping slowly
    // under her; walking through it when she is under way -- a long heavy
    // stride, her hips rolling and her shoulders countering them, her arms
    // swinging against her legs, her head bobbing to each footfall, and her
    // tail swinging the other way to balance her.
    {
      const k = u;
      const walk = clamp(this.speedNow / 3, 0, 1) * k;
      const tread = k - walk;
      const g = this.gait;
      for (let i = 0; i <= 8; i++) add(`tail${i}`, 0.01 * walk * Math.sin(g * 2 - i * 0.5), (0.03 + 0.012 * i) * tread * Math.sin(t * 0.7 - i * 0.45) + (0.02 + 0.01 * i) * walk * Math.sin(g - i * 0.4 + Math.PI));
      add('thigh.L', 0.14 * tread * Math.sin(t * 0.9));
      add('thigh.R', 0.14 * tread * Math.sin(t * 0.9 + Math.PI));
      add('shin.L', 0.12 * tread * Math.sin(t * 0.9 - 0.8));
      add('shin.R', 0.12 * tread * Math.sin(t * 0.9 + Math.PI - 0.8));
      for (const [n, ph] of [['L', 0], ['R', Math.PI]]) {
        const st = Math.sin(g + ph);
        // The swing: forward with the thigh, the knee bending as the leg
        // comes through and straightening for the footfall, the foot rolling
        // off its toes behind.
        add(`thigh.${n}`, -0.42 * walk * st);
        add(`shin.${n}`, 0.5 * walk * Math.max(0, Math.sin(g + ph - 0.9)));
        add(`foot.${n}`, 0.18 * walk * Math.sin(g + ph - 1.6));
        add(`toes.${n}`, 0.35 * walk * Math.max(0, Math.sin(g + ph + 2.2)));
        // The arm on that side swings against the leg.
        add(`upperArm.${n}`, 0.2 * walk * st);
        add(`foreArm.${n}`, -0.12 * walk * Math.max(0, st));
      }
      add('hips', 0, 0.07 * walk * Math.sin(g), 0.05 * walk * Math.sin(g));
      add('spine1', 0, -0.03 * walk * Math.sin(g));
      add('chest', 0.02 * walk * Math.sin(g * 2), -0.05 * walk * Math.sin(g), -0.03 * walk * Math.sin(g));
      add('neck1', -0.02 * walk * Math.sin(g * 2 + 0.6));
      add('head', -0.03 * walk * Math.sin(g * 2 + 1.0), 0.04 * walk * Math.sin(g));
      add('upperArm.L', 0.05 * tread * Math.sin(t * 0.6), 0, -0.05 * k);
      add('upperArm.R', 0.05 * tread * Math.sin(t * 0.6 + 1), 0, 0.05 * k);
      this.walkBob = walk * 2.2 * Math.abs(Math.sin(g));
    }
    // Alive, always: her head looking about her in short movements rather
    // than a steady sweep, now and then a snort that jerks it, her hands
    // flexing, her tail-tip curling of its own accord, and her shoulders
    // heaving with her breathing.
    {
      const n1 = Math.sin(t * 0.37) + 0.6 * Math.sin(t * 0.91 + 1.3);
      const n2 = Math.sin(t * 0.29 + 2.1) + 0.5 * Math.sin(t * 1.13);
      add('neck2', 0.03 * n2 * (0.4 + 0.6 * u), 0.06 * n1 * (0.3 + 0.7 * u));
      add('head', 0.04 * n2, 0.05 * n1);
      const snort = Math.pow(Math.max(0, Math.sin(t * 0.23 + 0.7)), 40);
      add('head', -0.12 * snort + Math.sin(t * 22) * 0.02 * snort, 0, Math.sin(t * 17) * 0.04 * snort);
      this.snort = snort;
      for (const [n, ph] of [['L', 0], ['R', 1.7]]) add(`fingers.${n}`, 0.12 + 0.12 * Math.sin(t * 0.8 + ph));
      add('tail7', 0, 0.06 * Math.sin(t * 1.3));
      add('tail8', 0.04 * Math.sin(t * 0.9), 0.1 * Math.sin(t * 1.3 - 0.6));
      add('upperArm.L', 0, 0, -0.02 * Math.sin(t * 1.1));
      add('upperArm.R', 0, 0, 0.02 * Math.sin(t * 1.1));
    }
    // Breathing, always.
    add('spine2', -0.02 * Math.sin(t * 1.1));
    add('chest', -0.03 * Math.sin(t * 1.1 - 0.4));
    add('neck1', 0.016 * Math.sin(t * 1.1 - 0.8));

    // Turning: her whole length bends into the turn, nose to tail. Flat, her
    // spine bends about what is now her up, which for the bones of her body
    // is their own z; standing, it twists about y.
    {
      const bend = clamp(this.yawRateNow / 0.06, -1, 1);
      for (const k of ['spine1', 'spine2', 'chest']) add(k, 0, 0.06 * bend * u, -0.07 * bend * s);
      for (let i = 0; i <= 8; i++) add(`tail${i}`, 0, 0.045 * bend);
      add('neck1', 0, 0.05 * bend);
      add('neck2', 0, 0.05 * bend);
    }

    // And whatever she is doing.
    const act = S.act || '';
    const at = S.actT || 0;
    const side = S.side || 1;
    let jaw = 0.02 + 0.015 * Math.sin(t * 0.5);
    if (act === 'tail') {
      // Her tail: heaved up out of the sea and away to the other side, then
      // brought across, low and hard over the water, the tip coming through
      // behind the root like a whip, and down on whatever it meets. Up is +x
      // for a bone of her tail; most of the lift is at its root, where a
      // little raises the whole hundred metres of it.
      const up = window01(at, 0.0, 0.6, 1.5, 2.4);
      const wind = window01(at, 0.0, 0.7, 0.75, 1.05);
      for (let i = 0; i <= 8; i++) {
        const lag = at - i * 0.045;
        const w = window01(lag, 0.0, 0.7, 0.75, 1.05);
        const strike = window01(lag, 0.8, 1.2, 1.7, 2.6);
        const yaw = (-0.13 * w + 0.19 * strike) * side;
        const lift = (i === 0 ? 0.22 : i === 1 ? 0.14 : i < 4 ? 0.04 : -0.01) * up * s;
        add(`tail${i}`, lift, yaw);
      }
      // Her body turns against it.
      const twist = wind * 0.18 - window01(at, 0.8, 1.2, 1.7, 2.6) * 0.25;
      add('hips', 0, 0, -twist * side * s);
      add('hips', 0, twist * side * u * 0.6);
      add('chest', 0, 0, twist * side * 0.5 * s);
      add('neck2', 0, -twist * side * 0.6);
      jaw += window01(at, 0.7, 1.0, 1.6, 2.2) * 0.25;
    } else if (act === 'reach' || act === 'hold' || act === 'throw') {
      // Reaching down for a ship, lifting her, holding her up, and flinging
      // her away or crushing her.
      const reach = act === 'reach' ? window01(at, 0, 0.9, 1.1, 2.0) : 0;
      const up = act === 'reach' ? smooth(1.1, 2.0, at) : act === 'hold' ? 1 : 1 - smooth(0.5, 1.2, at);
      const fling = act === 'throw' ? window01(at, 0.15, 0.55, 0.7, 1.4) : 0;
      const shake = act === 'hold' ? Math.sin(t * 5.3) * 0.04 : 0;
      add('spine2', 0.22 * reach - 0.06 * up);
      add('chest', 0.18 * reach - 0.05 * up + 0.1 * fling);
      for (const [n, sg] of [['L', 1], ['R', -1]]) {
        add(`upperArm.${n}`, 0.75 * reach - 0.55 * up - 0.4 * fling + shake, 0, -0.18 * sg * reach + 0.12 * sg * up);
        add(`foreArm.${n}`, 0.3 * reach - 0.6 * up + 0.7 * fling, 0.25 * sg * up);
        add(`hand.${n}`, 0.2 * reach + 0.25 * up);
      }
      add('neck2', 0.15 * up);
      add('head', 0.12 * up + 0.2 * fling);
      jaw += 0.2 * up + 0.35 * fling;
      // Her hands open wide as she reaches and close on the ship; open again
      // as she lets go.
      for (const n of ['L', 'R']) add(`fingers.${n}`, -0.35 * reach + 0.7 * up * (1 - fling) - 0.4 * fling);
    } else if (act === 'crush') {
      // Her hands driven together on the hull, her shoulders hunched over it,
      // her head down to it, snarling; then easing back to holding it.
      const sq = window01(at, 0.3, 0.85, 1.1, 1.6);
      const shake = Math.sin(t * 24) * 0.05 * sq;
      add('spine2', -0.06 + 0.1 * sq);
      add('chest', -0.05 + 0.12 * sq);
      for (const [n, sg] of [['L', 1], ['R', -1]]) {
        add(`upperArm.${n}`, -0.55 + shake, 0, 0.12 * sg + 0.18 * sg * sq);
        add(`foreArm.${n}`, -0.6, 0.25 * sg + 0.35 * sg * sq);
        add(`hand.${n}`, 0.25 + 0.2 * sq);
        add(`fingers.${n}`, 0.7 + 0.35 * sq);
      }
      add('neck1', 0.08 * sq);
      add('neck2', 0.15 + 0.1 * sq);
      add('head', 0.12 + 0.1 * sq + shake * 0.5);
      jaw += 0.2 + 0.25 * sq;
    } else if (act === 'bite') {
      // Her head drawn back, her jaws open, and the lunge: down and forward
      // onto whatever is in front of her, or in her hands, the jaws snapping
      // shut on it and her head wrenching side to side.
      const draw = window01(at, 0, 0.3, 0.4, 0.55);
      const lunge = window01(at, 0.4, 0.55, 0.85, 1.3);
      const wrench = window01(at, 0.55, 0.7, 0.95, 1.2) * Math.sin(t * 14) * 0.12;
      const open = window01(at, 0.05, 0.35, 0.5, 0.58);
      const holding = !!S.holding;
      add('spine2', 0.08 * lunge * (holding ? 0.5 : 1));
      add('chest', -0.05 * draw + 0.14 * lunge);
      add('neck1', -0.15 * draw + 0.25 * lunge);
      add('neck2', -0.15 * draw + 0.25 * lunge, wrench);
      add('head', -0.2 * draw + 0.22 * lunge, wrench * 0.6, wrench * 0.8);
      for (const n of ['L', 'R']) add(`fingers.${n}`, holding ? 0.8 : -0.2 * draw);
      if (holding) for (const [n, sg] of [['L', 1], ['R', -1]]) { add(`upperArm.${n}`, -0.45, 0, 0.12 * sg); add(`foreArm.${n}`, -0.55, 0.25 * sg); }
      jaw += 0.65 * open;
    } else if (act === 'charge') {
      // Gathering it: her head down and her body drawn in while the light
      // climbs her, then her head going back as it reaches her neck, and her
      // jaw opening on what is building in her throat.
      const hunch = smooth(0, 1.5, at);
      const back = smooth(0.8, 1.0, S.charge || 0);
      add('spine2', 0.08 * hunch);
      add('chest', 0.1 * hunch - 0.12 * back);
      add('neck1', 0.1 * hunch - 0.25 * back);
      add('neck2', 0.08 * hunch - 0.2 * back);
      add('head', 0.15 * hunch - 0.25 * back);
      for (const [n, sg] of [['L', 1], ['R', -1]]) { add(`upperArm.${n}`, -0.1 * hunch, 0, 0.2 * sg * hunch); add(`fingers.${n}`, 0.6 * hunch); }
      // Braced: her toes dug in, her tail lashing harder the further up her
      // the glow has got.
      add('toes.L', -0.2 * hunch); add('toes.R', -0.2 * hunch);
      for (let i = 0; i <= 8; i++) add(`tail${i}`, 0, (0.01 + 0.01 * i) * (S.charge || 0) * Math.sin(t * 4 - i * 0.7));
      add('tail8', 0.1 * hunch); add('tail7', 0.08 * hunch);
      jaw += 0.18 * back + 0.05 * Math.sin(t * 9) * back;
    } else if (act === 'fire') {
      // Firing: head thrust forward down the beam, jaw open as far as it goes,
      // shuddering with it; then closing as it dies.
      const on = window01(at, 0, 0.25, 2.8, 3.8);
      const shake = Math.sin(t * 31) * 0.012 * on;
      add('chest', 0.05 * on);
      add('neck1', 0.08 * on + shake);
      add('neck2', 0.06 * on - shake);
      add('head', -0.05 * on + shake);
      jaw += 0.55 * on;
    } else if (act === 'roar') {
      const on = window01(at, 0.2, 0.8, 2.2, 3.0);
      add('chest', -0.08 * on);
      add('neck1', -0.2 * on);
      add('neck2', -0.18 * on);
      add('head', -0.25 * on + Math.sin(t * 20) * 0.01 * on);
      for (const [n, sg] of [['L', 1], ['R', -1]]) { add(`upperArm.${n}`, -0.3 * on, 0, 0.25 * sg * on); add(`fingers.${n}`, -0.4 * on); add(`hand.${n}`, -0.2 * on); }
      for (let i = 0; i <= 8; i++) add(`tail${i}`, 0.015 * on * Math.sin(t * 3 - i * 0.6), 0.02 * on * Math.sin(t * 2.2 - i * 0.5));
      jaw += 0.5 * on;
    } else if (act === 'die') {
      // A last roar, and then she goes limp and over.
      const roar = window01(at, 0.1, 0.7, 1.6, 2.4);
      const limp = smooth(1.8, 5.0, at);
      add('neck1', -0.2 * roar + 0.3 * limp);
      add('neck2', -0.18 * roar + 0.2 * limp);
      add('head', -0.25 * roar + 0.3 * limp);
      for (const [n, sg] of [['L', 1], ['R', -1]]) {
        add(`upperArm.${n}`, -0.3 * roar + 0.4 * limp, 0, 0.25 * sg * roar - 0.2 * sg * limp);
        add(`foreArm.${n}`, 0.4 * limp);
      }
      add('hips', 0, 0, 0.9 * limp);
      for (let i = 0; i <= 8; i++) add(`tail${i}`, -0.03 * limp, 0.04 * limp);
      jaw = lerp(jaw + 0.5 * roar, 0.22, limp);
    }
    // Her look, which is her head's and her neck's: added below in the
    // world's up, not here. Her jaw, eased.
    this.jawNow += (jaw - this.jawNow) * (1 - Math.exp(-dt / 0.12));
    add('jaw', this.jawNow);
  }

  update(dt, S = {}) {
    dt = Math.min(0.1, Math.max(0, dt));
    this.t += dt;
    const ease = (tau) => 1 - Math.exp(-dt / tau);
    this.speedNow += ((S.speed || 0) - this.speedNow) * ease(0.6);
    this.yawRateNow += ((S.yawRate || 0) - this.yawRateNow) * ease(0.5);
    this.phase += dt * Math.PI * 2 * (0.2 + 0.4 * clamp(this.speedNow / 14, 0, 1));
    // Her stride, standing: a step every second and a half or so slow,
    // faster as she hurries.
    this.gait += dt * Math.PI * 2 * (0.32 + 0.12 * clamp(this.speedNow / 5, 0, 1));
    // Her posture and how deep she is, eased over seconds: something a
    // hundred metres tall does not stand up in the water in a frame.
    const pose = S.pose || 'swim';
    const act = S.act || '';
    const want = pose === 'stand' ? 1 : 0;
    this.upright += (want - this.upright) * ease(1.1);
    let y = BODY_Y[pose] ?? BODY_Y.swim;
    if (act === 'die') y = lerp(y, BODY_Y.deep * 1.4, smooth(3, 20, S.actT || 0));
    this.bodyY += (y - this.bodyY) * ease(pose === 'deep' || act === 'die' ? 2.2 : 1.4);
    this.pose(S, dt);
    // Each footfall settles her a little in the water.
    this.body.position.y = this.bodyY - this.walkBob;
    // Each bone eased toward where it ought to be. Fast enough that a tail
    // swing has its snap, slow enough that nothing ever jumps.
    // (Eased on a copy of its own: what is laid on top of it afterwards --
    // her look -- must not be fed back into the easing, or it would build on
    // itself frame after frame.)
    const k = this.posed ? ease(0.1) : 1;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i];
      const a = this.target.get(b.name);
      _e.set(a[0], a[1], a[2], 'YXZ');
      _q.setFromEuler(_e);
      this.eased[i].slerp(_q, k);
      b.quaternion.copy(this.eased[i]);
    }
    this.posed = true;
    this.body.updateMatrixWorld(true);

    // Her look: her neck and her head turned toward what she is looking at,
    // about the world's up and across, shared between them.
    {
      let yaw = 0, pitch = 0;
      const look = S.beamTo || S.look;
      if (look) {
        const head = this.byName.head;
        head.getWorldPosition(_v);
        this.group.worldToLocal(_v);
        const dx = look.x - _v.x, dy = look.y - _v.y, dz = look.z - _v.z;
        yaw = clamp(Math.atan2(dx, dz), -1.1, 1.1);
        pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.5);
        // Only standing does she lift her head out to look.
        yaw *= 0.25 + 0.75 * this.upright;
        pitch *= this.upright;
      }
      this.lookYaw += (yaw - this.lookYaw) * ease(0.35);
      this.lookPitch += (pitch - this.lookPitch) * ease(0.35);
      const share = [['neck1', 0.25], ['neck2', 0.35], ['head', 0.4]];
      this.group.getWorldQuaternion(_q);
      for (const [n, f] of share) {
        const b = this.byName[n];
        // A turn about her up, and a nod about the bone's own across, each
        // put into the frame of the bone's parent and laid on top of it.
        b.parent.getWorldQuaternion(_q2).invert();
        _v.copy(UP).applyQuaternion(_q).applyQuaternion(_q2).normalize();
        _yq.setFromAxisAngle(_v, this.lookYaw * f);
        _v2.set(1, 0, 0).applyQuaternion(b.quaternion).normalize();
        _pq.setFromAxisAngle(_v2, -this.lookPitch * f);
        b.quaternion.premultiply(_pq).premultiply(_yq);
        b.updateMatrixWorld(true);
      }
    }

    // The glow.
    const charge = clamp(S.charge || 0, 0, 1);
    this.chargeNow += (charge - this.chargeNow) * ease(0.25);
    const glowWant = act === 'charge' || act === 'fire' ? 1 : clamp(S.glow || 0, 0, 1);
    this.glowNow += (glowWant - this.glowNow) * ease(glowWant > this.glowNow ? 0.3 : 1.6);
    const U = this.uniforms;
    U.uCharge.value = act === 'fire' ? 1 : this.chargeNow;
    U.uLevel.value = this.glowNow;
    U.uTime.value = this.t;
    // At her mouth: the throat lighting as the charge reaches it, and the
    // breath itself.
    const throat = smooth(0.82, 1, U.uCharge.value) * this.glowNow;
    const firing = act === 'fire' ? window01(S.actT || 0, 0, 0.15, 2.8, 3.8) : 0;
    this.mouthPoint(_v);
    this.group.worldToLocal(_v);
    this.mouthGlow.position.copy(_v);
    this.mouthGlow.material.opacity = Math.min(1, throat * 0.8 + firing);
    this.mouthGlow.scale.setScalar(10 + 14 * throat + 22 * firing + Math.sin(this.t * 37) * 2 * throat);
    this.mouthGlow.visible = this.mouthGlow.material.opacity > 0.01;
    this.light.position.copy(_v);
    this.light.intensity = (throat * 1.5 + firing * 5) * 1e3;
    this.light.visible = this.light.intensity > 1;
    // The beam, out of her mouth to where it strikes, running out to it fast.
    if (firing > 0 && S.beamTo) {
      const to = _v2.set(S.beamTo.x, S.beamTo.y, S.beamTo.z);
      const full = to.distanceTo(_v);
      this.beamLen = Math.min(full, this.beamLen + dt * 14000);
      for (const m of this.beams) {
        m.visible = true;
        m.position.copy(_v);
        m.quaternion.setFromUnitVectors(UP, _dir.copy(to).sub(_v).normalize());
        m.scale.set(1, Math.max(1, this.beamLen), 1);
        m.material.uniforms.uOn.value = firing;
        m.material.uniforms.uTime.value = this.t;
      }
    } else {
      this.beamLen = 0;
      for (const m of this.beams) m.visible = false;
    }
    this.stepSparks();
  }

  /** Where her mouth is, in the world. */
  mouthPoint(out) {
    const head = this.byName.head, jaw = this.byName.jaw;
    // Between the tip of her snout and the tip of her jaw, a little in.
    _v2.copy(this.snout).applyMatrix4(head.matrixWorld);
    out.copy(this.chin).applyMatrix4(jaw.matrixWorld).lerp(_v2, 0.5);
    return out;
  }

  /** Between her hands, in the world: where a ship she has hold of is. */
  handsPoint(out) {
    _v.copy(this.palmL).applyMatrix4(this.byName['hand.L'].matrixWorld);
    out.copy(this.palmR).applyMatrix4(this.byName['hand.R'].matrixWorld).add(_v).multiplyScalar(0.5);
    return out;
  }

  // Sparks of light standing off her plates as they burn: the brightest
  // points of each plate, carried with it.
  stepSparks() {
    const p = this.sparks;
    const lvl = this.glowNow;
    p.visible = lvl > 0.02;
    if (!p.visible) return;
    const pos = p.geometry.attributes.position;
    const al = p.geometry.attributes.alpha;
    const c = this.uniforms.uCharge.value;
    for (let i = 0; i < this.sparkSrc.length; i++) {
      const s = this.sparkSrc[i];
      _v.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        if (!s.w[k]) continue;
        _v2.copy(s.p).applyMatrix4(_m.multiplyMatrices(this.bones[s.b[k]].matrixWorld, this.skeleton.boneInverses[s.b[k]]));
        _v.addScaledVector(_v2, s.w[k]);
      }
      this.group.worldToLocal(_v);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
      const front = c * 1.25 - s.along - 0.1;
      al.setX(i, smooth(0, 0.14, front) * lvl * (0.6 + 0.4 * Math.sin(this.t * 11 + i)));
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }
}

/**
 * Monster One as the battle builds a hull: `{ group, turrets, ... }`, her
 * rig on `group.userData.monster`.
 */
export function buildMonsterOne() {
  const group = new THREE.Group();
  group.name = 'Monster One';
  // Everything of her that moves is in here: the battle's own systems (her
  // plating, her fittings, the shell holes cut in a hull) work only on what is
  // set straight into the group, and leave this alone.
  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);

  const bones = D.BONES.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  D.BONES.forEach((b, i) => {
    const p = b.parent >= 0 ? D.BONES[b.parent].at : [0, 0, 0];
    bones[i].position.set(b.at[0] - p[0], b.at[1] - p[1], b.at[2] - p[2]);
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  body.add(bones[0]);
  body.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  const uniforms = {
    uCharge: { value: 0 }, uLevel: { value: 0 }, uTime: { value: 0 },
    uGlowColor: { value: BREATH_BLUE.clone() },
  };
  const meshes = D.MESHES.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(f32(m.position), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(f32(m.normal), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(f32(m.uv), 2));
    if (m.tangent) g.setAttribute('tangent', new THREE.BufferAttribute(f32(m.tangent), 4));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(B64(m.skinIndex), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(B64(m.skinWeight), 4, true));
    if (m.glow) g.setAttribute('glow', new THREE.BufferAttribute(f32(m.glow), 2));
    g.setIndex(new THREE.BufferAttribute(u16(m.index), 1));
    g.computeBoundingSphere();
    const mat = material(D.MATERIALS[m.material], !!m.tangent);
    if (m.glow) glowing(mat, uniforms);
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.name = `Monster One ${m.name}`;
    // She bends a long way from the pose she was bound in: what is drawn is
    // never where the bound pose's sphere says, so she is never culled.
    mesh.frustumCulled = false;
    body.add(mesh);
    mesh.bind(skeleton);
    return mesh;
  });

  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  // Points on her, each in the frame of the bone that carries it at rest.
  const local = (bone, p) => { const v = new THREE.Vector3(...p); return v.sub(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld)); };
  const headD = D.BONES.find((b) => b.name === 'head');
  const jawD = D.BONES.find((b) => b.name === 'jaw');
  const snout = local(byName.head, [0, headD.end[1] - 2.2, headD.end[2] - 3.5]);
  const chin = local(byName.jaw, [0, jawD.end[1] + 1.2, jawD.end[2] - 3.5]);
  const handL = D.BONES.find((b) => b.name === 'hand.L');
  const handR = D.BONES.find((b) => b.name === 'hand.R');
  const palmL = local(byName['hand.L'], handL.end.map((v, i) => lerp(handL.at[i], v, 0.6)));
  const palmR = local(byName['hand.R'], handR.end.map((v, i) => lerp(handR.at[i], v, 0.6)));

  // The glow at her mouth, a light to throw it on her and on the water, and
  // the beam: a white core inside a broad blue one.
  const mouthGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: BREATH_BLUE, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0,
  }));
  mouthGlow.visible = false;
  group.add(mouthGlow);
  const light = new THREE.PointLight(BREATH_BLUE, 0, 700, 2);
  light.visible = false;
  group.add(light);
  const beams = [beamMesh(1.8, 3.2), beamMesh(0.9, 8)];
  for (const m of beams) { m.visible = false; group.add(m); }

  // The sparks off her plates: the tips of each, a few dozen of them.
  const plate = D.MESHES[4];
  const P = f32(plate.position), GL = f32(plate.glow), SI = B64(plate.skinIndex), SW = B64(plate.skinWeight);
  const sparkSrc = [];
  for (let i = 0; i < plate.count; i++) {
    if (GL[i * 2 + 1] < 0.97) continue;
    // One in so many of the points at the very tip of a plate.
    if ((i * 2654435761 >>> 0) % 5) continue;
    sparkSrc.push({
      p: new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]),
      b: [SI[i * 4], SI[i * 4 + 1], SI[i * 4 + 2], SI[i * 4 + 3]],
      w: [SW[i * 4] / 255, SW[i * 4 + 1] / 255, SW[i * 4 + 2] / 255, SW[i * 4 + 3] / 255],
      along: GL[i * 2],
    });
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparkSrc.length * 3), 3));
  sg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(sparkSrc.length), 1));
  const sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: glowTexture() }, uColor: { value: BREATH_BLUE.clone() } },
    vertexShader: `attribute float alpha; varying float vA;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(2600.0 / -mv.z, 1.5, 36.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
      void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor * t.rgb * 1.6, t.a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false;
  sparks.visible = false;
  group.add(sparks);

  const rig = new MonsterRig({
    group, body, bones, skeleton, byName, meshes, uniforms,
    snout, chin, palmL, palmR, mouthGlow, light, beams, sparks, sparkSrc,
  });
  // Settled into her posture before anybody sees her.
  rig.update(0, {});
  rig.bodyY = BODY_Y.swim;
  rig.body.position.y = rig.bodyY;

  // Her length and her beam as a hull's, for everything in the battle that
  // asks a ship how big she is.
  const length = D.HEIGHT * 1.75;
  const beam = 24;
  group.userData.monster = rig;
  // Anywhere that only knows how to work a hull's moving parts (the yard,
  // which calls this every frame with the clock) gets her standing in the
  // water, breathing, looking about her and now and then roaring. The battle
  // drives her itself, off the wire, and sets `driven` so this stands aside.
  let was = null;
  group.userData.step = (t) => {
    if (rig.driven) return;
    const dt = was == null ? 1 / 60 : clamp(t - was, 0, 0.1);
    was = t;
    const cycle = t % 24;
    const roar = cycle > 16 && cycle < 19.5;
    rig.update(dt, {
      pose: 'stand', act: roar ? 'roar' : '', actT: roar ? cycle - 16 : 0,
      look: new THREE.Vector3(Math.sin(t * 0.21) * 300, 60 + Math.sin(t * 0.13) * 20, 400),
    });
  };
  group.userData.classId = 'monsterone';
  group.userData.length = length;
  group.userData.beam = beam;
  group.userData.deckY = 4;
  return {
    group, turrets: [], secMounts: [], aaMounts: [], torpMounts: [],
    length, beam, deckY: 4, monster: rig,
  };
}
