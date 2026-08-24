// What is coming down.
//
// Rain and snow are drawn as a box of particles carried under the camera, but
// the particles themselves are world-fixed: each one is wrapped about the
// camera's position rather than parented to it, so a ship at twenty knots
// steams through the squall instead of towing it along. That difference is the
// whole effect — rain that moves with you is a screen filter, and rain that
// streams past you is weather.
//
// Everything moves in the vertex stage. A hundred thousand drops updated on the
// CPU would cost more than the rest of the frame put together; updated from the
// clock and a seed they cost one uniform.

import * as THREE from '../../../vendor/three.module.js';

// How big a box of falling weather is carried about, in metres. Rain is drawn
// far out because a squall is a thing you see across the sea; snow is kept
// close, because a flake a quarter mile off is nothing at all and the ones that
// read are the ones going past your face.
const BOX_RAIN = 420;
const BOX_SNOW = 190;

const FALL_VERT = /* glsl */`
uniform float uTime;
uniform vec3 uCam;
uniform float uBox;
uniform float uFall;      // metres a second, downward
uniform vec2 uWind;       // metres a second, across
uniform float uLen;       // how long a streak is drawn, in seconds of fall
uniform float uSize;      // how big a flake is drawn, in pixels at ten metres
uniform float uSway;      // how far it wanders as it comes down, in metres
attribute vec3 seed;      // three randoms, 0..1
attribute float tip;      // 0 at the head of a streak, 1 at its tail
varying float vFade;

void main() {
  float spread = 0.7 + seed.z * 0.6;
  float fall = uFall * spread;
  // Where it is now: started somewhere in the box, blown along, falling.
  vec3 p;
  p.x = (seed.x - 0.5) * uBox + uWind.x * uTime;
  p.z = (seed.y - 0.5) * uBox + uWind.y * uTime;
  // Sway, so snow does not come down on rails. Rain has none worth drawing.
  p.x += sin(uTime * (0.5 + seed.z) + seed.x * 43.0) * uSway;
  p.z += cos(uTime * (0.4 + seed.x) + seed.y * 31.0) * uSway * 0.7;
  p.y = -mod(seed.z * uBox + uTime * fall, uBox);

  // Wrapped about the camera rather than carried with it: the drop stays in
  // the world and the box slides over it.
  p.x = uCam.x + mod(p.x - uCam.x + uBox * 0.5, uBox) - uBox * 0.5;
  p.z = uCam.z + mod(p.z - uCam.z + uBox * 0.5, uBox) - uBox * 0.5;
  p.y += uCam.y + uBox * 0.5;

  // The tail of a streak is where the drop was a moment ago.
  p -= tip * vec3(uWind.x, -fall, uWind.y) * uLen;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(1.0, -mv.z);
  // Fades out at the back of the box, so drops appear out of the murk rather
  // than switching on at a plane.
  vFade = (1.0 - smoothstep(uBox * 0.30, uBox * 0.55, d)) * (1.0 - tip * 0.75);
  gl_PointSize = max(1.0, uSize * 10.0 / d);
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  float a = vFade * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const SNOW_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = (1.0 - smoothstep(0.02, 0.25, r)) * vFade * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/**
 * The weather over a battle: what falls out of the sky, and what the sky does
 * when it is a thunderstorm.
 *
 * `wx` is the entry out of shared/world.js, so the look and the gunnery are
 * reading the same weather.
 */
export class Weather {
  constructor(scene, wx, { count = 9000 } = {}) {
    this.scene = scene;
    this.wx = wx;
    this.time = 0;
    this.mesh = null;
    this.mat = null;
    this.flash = null;
    this.nextBolt = 0;
    this.bolt = 0;

    if (wx.fall) this.build(scene, wx, count);

    if (wx.lightning > 0) {
      // The flash itself: a moment of daylight over the whole sea, gone before
      // the eye has settled on it, and then the sky goes back to being black.
      this.flash = new THREE.HemisphereLight(0xdfe9ff, 0x8fa6c8, 0);
      scene.add(this.flash);
      this.nextBolt = 2 + Math.random() * wx.lightning;
    }
  }

  build(scene, wx, count) {
    const rain = wx.fall === 'rain';
    // A streak needs two ends; a flake needs one.
    const per = rain ? 2 : 1;
    const n = Math.max(400, Math.round(count * (rain ? wx.drop : wx.drop * 0.55)));
    const pos = new Float32Array(n * per * 3);
    const seed = new Float32Array(n * per * 3);
    const tip = new Float32Array(n * per);
    for (let i = 0; i < n; i++) {
      const a = Math.random();
      const b = Math.random();
      const c = Math.random();
      for (let k = 0; k < per; k++) {
        const j = i * per + k;
        seed[j * 3] = a;
        seed[j * 3 + 1] = b;
        seed[j * 3 + 2] = c;
        tip[j] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    const box = rain ? BOX_RAIN : BOX_SNOW;
    // It is always round the camera, so it is never off-screen.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), box * 2);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: FALL_VERT,
      fragmentShader: rain ? RAIN_FRAG : SNOW_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: box },
        uFall: { value: rain ? 22 : 2.4 },
        uWind: { value: new THREE.Vector2(rain ? -5.5 : -2.6, rain ? 2.2 : 1.1) },
        uLen: { value: rain ? 0.055 : 0 },
        // A flake is five millimetres across and would be a fraction of a pixel
        // at any range worth drawing it at. What is actually seen in falling
        // snow is not the flake's size but that there is one there, so it is
        // drawn at a size an eye can register and the count is what carries the
        // weight of the fall.
        uSize: { value: rain ? 0.5 : 16.0 },
        uSway: { value: rain ? 0.0 : 1.8 },
        // A mid tone on purpose. Rain seen against a bright overcast is darker
        // than the sky and rain seen against a dark sea is lighter than the
        // water, and one colour blended over both does both -- which is more
        // than a white streak drawn over everything manages.
        uColor: { value: new THREE.Color(rain ? 0x7d93a6 : 0xeef4fa) },
        uOpacity: { value: rain ? 0.50 : 0.72 },
      },
      transparent: true,
      depthWrite: false,
      // Premultiplied, so a drop lit against a dark sea does not wash the sea
      // out behind it the way straight additive would.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });

    this.mesh = rain
      ? new THREE.LineSegments(geo, this.mat)
      : new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
  }

  update(dt, cameraPos) {
    this.time += dt;
    if (this.mat) {
      this.mat.uniforms.uTime.value = this.time;
      this.mat.uniforms.uCam.value.copy(cameraPos);
    }
    if (!this.flash) return;

    // Lightning. A strike is a hard flash and a softer second one a beat later
    // — a single pulse reads as somebody switching a lamp on and off.
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.bolt = 1;
      this.nextBolt = this.wx.lightning * (0.45 + Math.random());
    }
    if (this.bolt > 0) {
      this.bolt = Math.max(0, this.bolt - dt * 3.4);
      const t = this.bolt;
      const pulse = Math.exp(-(1 - t) * 9.0) + 0.45 * Math.exp(-Math.abs(t - 0.72) * 26.0);
      this.flash.intensity = pulse * 2.6;
    } else {
      this.flash.intensity = 0;
    }
  }

  dispose() {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mat.dispose();
    }
    if (this.flash) this.flash.removeFromParent();
  }
}
