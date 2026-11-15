// Every puff of smoke and every flash in the effects pool, drawn in one go.
//
// They used to be sprites, nine hundred of them, each with a material of its
// own: every puff on the screen was a draw call and a set of uniforms handed
// to the graphics card, and in a fleet action with ships burning and shells
// landing that was hundreds of draw calls of smoke a frame -- more than the
// ships themselves. Here they are instances of one quad, all in one draw.
//
// Each is drawn exactly as a sprite was: the same quad, turned to face the eye
// and rotated about its own centre, the same texture, colour and opacity, the
// same fog, tone mapping and colour space. They are laid down furthest first,
// smoke and glow together, as the renderer used to sort the sprites -- so a
// puff of smoke in front of a flash still dims it.
//
// The smoke was blended over the scene and the glow added to it, which are two
// different blend modes and so used to be two different kinds of draw. Both
// are the same blend once the colour is multiplied by its own opacity before
// it leaves the shader: laid over, a puff leaves its opacity behind and takes
// that much of what was there; added, it leaves none and takes nothing.

import * as THREE from '../../../vendor/three.module.js';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iShape;   // size, rotation, which picture (0-3), opacity
attribute vec3 iColor;
varying vec2 vUv;
varying vec4 vTint;
varying float vAdd;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  // Which quarter of the sheet its picture is in (see atlas).
  float which = iShape.z;
  float col = mod(which, 2.0);
  float row = floor(which / 2.0);
  vUv = uv * 0.5 + vec2(col * 0.5, 0.5 - row * 0.5);
  vTint = vec4(iColor, iShape.w);
  // The lit ones -- the bottom row of the sheet -- are added to the scene.
  vAdd = row;
  // A sprite: its centre put into the eye's frame, and the quad laid out
  // flat to the eye round it, at its size and turned through its rotation.
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
  vec2 aligned = position.xy * iShape.x;
  float c = cos(iShape.y), s = sin(iShape.y);
  mvPosition.xy += vec2(c * aligned.x - s * aligned.y, s * aligned.x + c * aligned.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
varying float vAdd;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 diffuseColor = vTint * texture2D(map, vUv);
  vec3 outgoingLight = diffuseColor.rgb;
  gl_FragColor = vec4(outgoingLight, diffuseColor.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  // Multiplied through by its opacity, for the one blend both kinds share.
  gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a, vAdd > 0.5 ? 0.0 : gl_FragColor.a);
}`;

/**
 * The four pictures on one sheet, each where it was on its own canvas: the
 * soft puff and the lumpy one on the top row, their lit versions under them.
 * Every edge of every picture is clear, so nothing of one runs into the next.
 */
function atlas(tex) {
  const imgs = [tex.puff, tex.billow, tex.glow, tex.ember].map((t) => t.image);
  const n = imgs[0].width;
  const c = document.createElement('canvas');
  c.width = c.height = n * 2;
  const ctx = c.getContext('2d');
  imgs.forEach((img, k) => ctx.drawImage(img, (k % 2) * n, Math.floor(k / 2) * n));
  return new THREE.CanvasTexture(c);
}

/**
 * The puffs. A puff is a plain object (see Effects.spawn) carrying where it
 * is, its size, its rotation, its colour and its opacity, whether it is lit,
 * and whether it is the soft picture or the lumpy one.
 */
export class PuffBatches {
  constructor(scene, max, tex) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    // The sprite's own quad, centred on the origin.
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    ], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.shape = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    for (const a of [this.pos, this.shape, this.color]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iShape', this.shape);
    g.setAttribute('iColor', this.color);
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this.geo = g;
    this.sheet = atlas(tex);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mat.uniforms.map.value = this.sheet;
    this.mesh = new THREE.Mesh(g, this.mat);
    // Each puff is its own size and somewhere of its own; the graphics card
    // clips whatever is out of view, and nine hundred quads are nothing.
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.userData.alwaysDraw = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.list = [];
  }

  add(p) { this.list.push(p); }

  /** Every puff added since the last call, put into the buffers, furthest first. */
  write(camera) {
    const L = this.list;
    const n = Math.min(L.length, this.max);
    if (camera && n > 1) {
      // Along the line of sight, as the renderer sorted the sprites: the
      // depth of each one's centre.
      camera.updateMatrixWorld();
      const e = camera.matrixWorldInverse.elements;
      for (let i = 0; i < n; i++) {
        const p = L[i];
        p.depth = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
      }
      // Most negative is furthest.
      L.sort((a, b) => a.depth - b.depth);
    }
    const P = this.pos.array, S = this.shape.array, C = this.color.array;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      S[i * 4] = p.scale; S[i * 4 + 1] = p.rotation;
      S[i * 4 + 2] = (p.glow ? 2 : 0) + p.which; S[i * 4 + 3] = p.opacity;
      C[i * 3] = p.r; C[i * 3 + 1] = p.g; C[i * 3 + 2] = p.b;
      cx += p.x; cy += p.y; cz += p.z;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) {
      // Where the batch is, for the renderer's own ordering of the things in
      // the scene that are see-through: in the middle of what it has in it.
      this.geo.boundingSphere.center.set(cx / n, cy / n, cz / n);
      for (const a of [this.pos, this.shape, this.color]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
    L.length = 0;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
    this.sheet.dispose();
  }
}
