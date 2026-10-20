// What an aeroplane blown apart throws: the pieces too small to be pieces.
//
// The big parts of her -- a wing, the tail, the engine -- are models of their
// own (see breakup.js). Round them goes everything else: skin, frames, glass,
// the contents of the cockpit, a cloud of scraps that leaves the fireball fast,
// loses its way in a second or two and then flutters down. They used to be
// round grey sprites, which from any distance is a handful of dots and from
// close to is a handful of discs. A scrap of aluminium is neither: it is a
// torn, flat thing that turns as it falls and flashes when it catches the sun.
//
// One pool, one draw call, and nothing done on the CPU after a scrap is thrown:
// where it is at any moment is worked out in the vertex stage from where and
// how it was thrown, with air drag that takes most of its speed off it in the
// first second and leaves it falling at the slow terminal speed of a sheet of
// light alloy.

import * as THREE from '../../../vendor/three.module.js';

const VERT = /* glsl */`
uniform float uTime;
uniform float uPix;
uniform float uFogDensity;
attribute vec3 vel;
attribute vec4 born;   // x: when, y: how long, z: size in metres, w: seed
attribute float hot;   // 0 cold metal, 1 burning
varying float vAge;
varying float vSeed;
varying float vRot;
varying float vGlint;
varying float vHot;
varying float vFog;

void main() {
  float age = (uTime - born.x) / born.y;
  vAge = age;
  vSeed = born.w;
  vHot = hot;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float t = age * born.y;
  // Drag that goes as the speed, and a sheet of skin has a lot of it: what it
  // was thrown with is spent in a second or two, and after that it falls at a
  // few metres a second, fluttering.
  float k = 1.4 + born.w * 1.2;
  float e = 1.0 - exp(-k * t);
  float g = 9.81;
  vec3 pos = position + vel * e / k;
  pos.y -= g * (t / k - e / (k * k));
  // A scrap that has reached the sea is in it.
  if (pos.y < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(born.z * uPix / max(1.0, -mv.z), 1.3, 48.0);
  // Turning over as it goes, and each face of it catching the light once a
  // turn: that flicker is what says it is a piece of something.
  float spin = 4.0 + born.w * 14.0;
  vRot = born.w * 6.2832 + t * (born.w - 0.5) * 7.0;
  vGlint = pow(max(0.0, sin(t * spin + born.w * 40.0)), 6.0);
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
}
`;

const FRAG = /* glsl */`
uniform vec3 uFogColor;
uniform float uLight;
varying float vAge;
varying float vSeed;
varying float vRot;
varying float vGlint;
varying float vHot;
varying float vFog;
float hs(float x) { return fract(sin(x * 127.1 + vSeed * 311.7) * 43758.5453); }
void main() {
  // A torn outline: longer one way than the other, and ragged round the edge.
  vec2 d = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  d = mat2(c, -s, s, c) * d;
  d.x *= 0.45 + 0.6 * vSeed;
  float ang = atan(d.y, d.x) / 6.2832 * 5.0 + 5.0;
  float k = floor(ang), f = fract(ang);
  float lim = 0.18 + 0.28 * mix(hs(mod(k, 5.0)), hs(mod(k + 1.0, 5.0)), f);
  if (length(d) > lim) discard;
  // Painted metal, mostly in shadow, with the sky in it once a turn.
  vec3 metal = mix(vec3(0.10, 0.11, 0.12), vec3(0.30, 0.31, 0.30), vSeed);
  vec3 col = (metal + vec3(0.85, 0.84, 0.78) * vGlint * 0.9) * uLight;
  // A burning one starts out alight and goes out on the way down.
  float burn = vHot * (1.0 - smoothstep(0.15, 0.6, vAge));
  col = mix(col, mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.85, 0.5), burn), burn);
  col = mix(col, uFogColor, vFog * 0.85);
  float a = 1.0 - smoothstep(0.8, 1.0, vAge);
  gl_FragColor = vec4(col, a * (1.0 - vFog * 0.6));
}
`;

export class Shards {
  constructor(scene, max = 2400) {
    this.max = max;
    this.next = 0;
    this.time = 0;
    this.lo = Infinity;
    this.hi = -1;
    const fog = scene.fog;
    const geo = new THREE.BufferGeometry();
    const at = (k, fill = 0) => {
      const a = new THREE.BufferAttribute(new Float32Array(max * k).fill(fill), k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('position', at(3));
    geo.setAttribute('vel', at(3));
    geo.setAttribute('born', at(4, -1e9));
    geo.setAttribute('hot', at(1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPix: { value: 900 },
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
    this.points.renderOrder = 9;
    const size = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      if (!camera.isPerspectiveCamera) return;
      renderer.getDrawingBufferSize(size);
      this.mat.uniforms.uPix.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    };
    scene.add(this.points);
  }

  /** One scrap, thrown from a point at a velocity. */
  throw(x, y, z, vx, vy, vz, { life = 4, size = 0.6, hot = 0 } = {}) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    const g = this.geo.attributes;
    g.position.setXYZ(i, x, y, z);
    g.vel.setXYZ(i, vx, vy, vz);
    g.born.setXYZW(i, this.time, life, size, Math.random());
    g.hot.setX(i, hot);
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  update(dt) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.hi < 0) return;
    for (const k of ['position', 'vel', 'born', 'hot']) {
      const a = this.geo.attributes[k];
      a.clearUpdateRanges();
      a.addUpdateRange(this.lo * a.itemSize, (this.hi - this.lo + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
  }
}
