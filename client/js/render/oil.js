// Fuel oil on the sea.
//
// A ship going down empties her bunkers into the water. What comes up is
// heavy black oil -- Bunker C, near enough tar at sea temperature -- and it
// does three things that nothing else on a sea does, all of which have to be
// right or it reads as a grey circle painted on the water:
//
//   it flattens the sea    Oil kills the capillary ripple. That ripple is
//                          what makes water matt, so the slick goes glassy
//                          and mirror-smooth while the sea round it stays
//                          broken. This is why slicks are visible from an
//                          aeroplane at all, and it is the single strongest
//                          cue there is.
//   it is a thin film      Where it lies thick it is black-brown and opaque.
//                          Where it has spread out to a few thousandths of a
//                          millimetre it is thinner than the light it is
//                          reflecting, and that is a rainbow: the colours
//                          round a wreck are interference in a film, not
//                          pigment.
//   it will not hold foam  No whitecap forms on an oiled surface, and the
//                          breaking crests stop dead at the edge of it.
//
// So there is no oil object in the scene, exactly as there is no wake object.
// What is drawn is a map -- one patch of sea, straight down, orthographic --
// carrying how much oil is on each square metre of water, how thick it is,
// and whether it is alight. The ocean reads that map in its own fragment
// stage and shades itself accordingly. The slick is not on the water; the
// water is oily.
//
// See wakefield.js, which does the same thing for what a hull does to the sea
// and whose scheme this follows.

import * as THREE from '../../../vendor/three.module.js';

/** How wide the patch is, in metres. */
export const OIL_M = 4096;

/** How many slicks can be on the water at once. */
const MAX = 32;

/**
 * How long a slick lasts before the sea has finished with it.
 *
 * Real fuel oil takes days. This is a battle, and a wreck that is still
 * marked by a mile of oil an hour after she went is the truth but not the
 * point; ten minutes is long enough that the water round a sinking never
 * comes clean while anybody is watching it.
 */
const LIFE = 620;

const OIL_VERT = /* glsl */`
attribute vec2 aLocal;     // -1..1 across the slick's own quad
attribute float aThick;    // how deep the film is in the middle, 0..1
attribute float aBurn;     // whether it is alight
attribute float aSeed;     // this slick's own shape
attribute float aFade;     // in as it wells up, out as it disperses
varying vec2 vLocal;
varying float vThick;
varying float vBurn;
varying float vSeed;
varying float vFade;
void main() {
  vLocal = aLocal;
  vThick = aThick;
  vBurn = aBurn;
  vSeed = aSeed;
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const OIL_FRAG = /* glsl */`
precision highp float;
varying vec2 vLocal;
varying float vThick;
varying float vBurn;
varying float vSeed;
varying float vFade;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
// Four octaves. One more than the wake map carries, because the shape of a
// slick's edge is the whole of what makes it read as oil rather than as a
// disc, and unlike a wake there are only ever a few of these on the water.
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.11; a *= 0.5; }
  return v / 0.9375;
}

void main() {
  float d = length(vLocal);
  if (d > 1.0 || vFade <= 0.0) discard;
  vec2 s = vec2(vSeed * 37.1, vSeed * 71.7);

  // The edge, which is never a circle.
  //
  // A slick spreads along whatever the surface is doing: it goes out in arms
  // and streaks, it is pulled into ribbons by the drift, and the edge of it
  // wanders by a good fraction of its own width. Beating a couple of octaves
  // of noise against the radius is what gives that, and it is the difference
  // between oil and a stain.
  float wobble = fbm(vLocal * 1.7 + s) - 0.5;
  float coarse = fbm(vLocal * 0.62 + s * 0.4) - 0.5;
  float e = d + wobble * 0.42 + coarse * 0.52;
  float cover = 1.0 - smoothstep(0.44, 0.92, e);

  // And the holes in it. A slick that has spread does not stay whole: the
  // drift tears it into patches and windrows with clean water between them,
  // and that lace is most of what you see of an old one. Only at the margins
  // -- the middle of a fresh slick, over the wreck herself, is solid.
  float lace = fbm(vLocal * 3.9 - s * 0.7);
  cover *= mix(1.0, smoothstep(0.28, 0.66, lace), smoothstep(0.18, 0.90, d));
  cover *= vFade;
  if (cover <= 0.002) discard;

  // Thick over the wreck and drawn out to a film at the rim, which is where
  // the colours are.
  float thick = vThick * (1.0 - smoothstep(0.05, 0.80, e));

  gl_FragColor = vec4(cover, cover * thick, cover * vBurn, 0.0);
}
`;

/**
 * One slick: where it came up, how much of it there is, and how far it has
 * got since.
 *
 * The spreading is the real thing rather than a chosen curve. Oil on water
 * spreads under its own weight against the viscosity of the water under it,
 * and in that regime the area goes up roughly with the time -- so the radius
 * goes as the square root of it, quickly at first and then hardly at all.
 * The volume is conserved, so the film thins as the square of the radius,
 * which is why a slick is black over the wreck and a rainbow at its edge an
 * hour later.
 */
class Slick {
  constructor(x, z, volume, burning) {
    this.x = x;
    this.z = z;
    // Cubic metres, near enough: a cruiser's bunkers hold a couple of
    // thousand tonnes and not all of it comes up.
    this.vol = volume;
    this.t = 0;
    this.burn = burning ? 1 : 0;
    this.seed = Math.random() * 100;
    // Where it drifts. Slicks go with the surface current and about three per
    // cent of the wind, which at sea is a slow walk in one direction.
    const dir = Math.random() * Math.PI * 2;
    this.dx = Math.cos(dir) * 0.16;
    this.dz = Math.sin(dir) * 0.16;
    // It comes up over a few seconds rather than appearing.
    this.r0 = Math.max(6, Math.cbrt(volume) * 1.4);
  }

  get radius() {
    // sqrt in the time, with the volume setting how big it starts and how far
    // it gets, and a cap: past a few hundred metres the film is thinner than
    // the light and there is nothing left to see.
    const r = Math.sqrt(this.r0 * this.r0 + this.vol * 0.055 * this.t);
    return Math.min(340, r);
  }

  /** How deep the film is in the middle, as something to shade with. */
  get thickness() {
    const r = this.radius;
    const mm = this.vol / Math.max(1, Math.PI * r * r);
    // A millimetre of oil is as black as oil gets; a micron is a rainbow.
    return Math.min(1, mm * 260);
  }

  get fade() {
    const inn = Math.min(1, this.t / 3.5);
    const out = 1 - Math.max(0, (this.t - LIFE * 0.7) / (LIFE * 0.3));
    return Math.max(0, inn * out);
  }

  step(dt) {
    this.t += dt;
    this.x += this.dx * dt;
    this.z += this.dz * dt;
    // Burning oil burns off. A slick that is alight is a slick that is going
    // away, which is the one mercy in it.
    if (this.burn > 0) {
      this.burn = Math.max(0, this.burn - dt * 0.006);
      this.vol = Math.max(0, this.vol - dt * this.vol * 0.004);
    }
    return this.t < LIFE;
  }
}

/**
 * The map: one patch of sea, and the pass that draws it.
 *
 * Nothing here is added to the scene. The quads live in a scene of this
 * field's own, are drawn straight down into a render target once a frame, and
 * what comes out is handed to the ocean, which is the only thing that ever
 * reads it.
 */
export class OilField {
  constructor({ size = 1024 } = {}) {
    this.size = size;
    this.slicks = [];
    this.scene = new THREE.Scene();
    this.centre = new THREE.Vector2();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 400);
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.x = -Math.PI / 2;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      // Eight bits a channel, for the same reason the wake map has eight: a
      // half-float target is not blendable everywhere, and where it is not the
      // whole map comes back empty and there is no oil at all.
      type: THREE.UnsignedByteType,
    });
    this.rt.texture.generateMipmaps = false;

    const pos = new Float32Array(MAX * 4 * 3);
    const local = new Float32Array(MAX * 4 * 2);
    const thick = new Float32Array(MAX * 4);
    const burn = new Float32Array(MAX * 4);
    const seed = new Float32Array(MAX * 4);
    const fade = new Float32Array(MAX * 4);
    const idx = [];
    for (let i = 0; i < MAX; i++) {
      const b = i * 4;
      local.set([-1, -1, 1, -1, 1, 1, -1, 1], b * 2);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLocal', new THREE.BufferAttribute(local, 2));
    geo.setAttribute('aThick', new THREE.BufferAttribute(thick, 1));
    geo.setAttribute('aBurn', new THREE.BufferAttribute(burn, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: OIL_VERT,
      fragmentShader: OIL_FRAG,
      // Two slicks that have run together are more oil, not the same oil
      // twice: added, and clamped by the ocean when it reads the map.
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /**
   * Oil out of a hull, here.
   *
   * `volume` is cubic metres of it. A bunker opened by a torpedo puts out a
   * few tonnes; a battleship going down puts out everything she had left.
   * Spills close to one already on the water are fed into it rather than laid
   * over it -- a wreck seeping oil for three minutes is one slick growing,
   * not ninety of them stacked on the same spot.
   */
  spill(x, z, volume = 40, burning = false) {
    if (!(volume > 0)) return;
    for (const s of this.slicks) {
      if (Math.hypot(s.x - x, s.z - z) < Math.max(30, s.radius * 0.55)) {
        s.vol += volume;
        if (burning) s.burn = 1;
        return;
      }
    }
    if (this.slicks.length >= MAX) {
      // The oldest goes: it is the thinnest and the furthest spread.
      let old = 0;
      for (let i = 1; i < this.slicks.length; i++) {
        if (this.slicks[i].t > this.slicks[old].t) old = i;
      }
      this.slicks.splice(old, 1);
    }
    this.slicks.push(new Slick(x, z, volume, burning));
  }

  /** Is there oil on the water here, and is it alight? */
  at(x, z) {
    let cover = 0;
    let burn = 0;
    for (const s of this.slicks) {
      const r = s.radius;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d > r) continue;
      const c = (1 - d / r) * s.fade;
      if (c > cover) { cover = c; burn = s.burn; }
    }
    return { cover, burn };
  }

  update(dt) {
    for (let i = this.slicks.length - 1; i >= 0; i--) {
      if (!this.slicks[i].step(dt)) this.slicks.splice(i, 1);
    }
    const pos = this.geo.attributes.position;
    const th = this.geo.attributes.aThick;
    const bn = this.geo.attributes.aBurn;
    const sd = this.geo.attributes.aSeed;
    const fd = this.geo.attributes.aFade;
    for (let i = 0; i < MAX; i++) {
      const s = this.slicks[i];
      const b = i * 4;
      if (!s) {
        // Folded to a point, which draws nothing.
        for (let j = 0; j < 4; j++) { pos.setXYZ(b + j, 0, -1000, 0); fd.setX(b + j, 0); }
        continue;
      }
      // A little wider than the slick itself, because the noise on the edge
      // pushes it out past its own radius.
      const r = s.radius * 1.35;
      const t = s.thickness;
      const f = s.fade;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let j = 0; j < 4; j++) {
        const [cx, cz] = corners[j];
        pos.setXYZ(b + j, s.x + cx * r, 0, s.z + cz * r);
        th.setX(b + j, t);
        bn.setX(b + j, s.burn);
        sd.setX(b + j, s.seed);
        fd.setX(b + j, f);
      }
    }
    pos.needsUpdate = true;
    th.needsUpdate = true;
    bn.needsUpdate = true;
    sd.needsUpdate = true;
    fd.needsUpdate = true;
    this.mesh.visible = this.slicks.length > 0;
  }

  /**
   * Draw the patch, centred under the eye and snapped to its own texel grid.
   *
   * Skipped altogether when there is no oil on the water, which is most of
   * every battle: an empty pass a frame for a thing that is not there is the
   * sort of cost that adds up over a fleet action.
   */
  render(renderer, camera) {
    if (!this.slicks.length) return;
    const texel = OIL_M / this.size;
    this.centre.set(Math.round(camera.position.x / texel) * texel,
      Math.round(camera.position.z / texel) * texel);
    const half = OIL_M / 2;
    this.cam.left = -half;
    this.cam.right = half;
    this.cam.top = half;
    this.cam.bottom = -half;
    this.cam.position.set(this.centre.x, 200, this.centre.y);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld(true);
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rt);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
  }

  /** Hand the map to the ocean, which is the only thing that reads it. */
  bind(uniforms) {
    if (!uniforms.uOilMap) return;
    const on = this.slicks.length > 0;
    uniforms.uOilMap.value = on ? this.rt.texture : uniforms.uOilBlank.value;
    uniforms.uOilAt.value.set(this.centre.x, this.centre.y, OIL_M / 2, on ? 1 : 0);
  }

  dispose() {
    this.rt.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.slicks.length = 0;
  }
}
