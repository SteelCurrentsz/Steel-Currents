// The sea. A displaced plane with analytic normals so the moon lays a proper
// streak across the swell, plus foam on the crests.

import * as THREE from '../../../vendor/three.module.js';

const VERT = /* glsl */`
uniform float uTime;
uniform float uAmp;
uniform float uChoppy;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

// Four travelling swells; the analytic derivative gives us the normal for free.
vec3 wave(vec2 p, float t) {
  vec2 d1 = normalize(vec2( 1.0,  0.35));
  vec2 d2 = normalize(vec2(-0.6,  1.0));
  vec2 d3 = normalize(vec2( 0.2, -1.0));
  vec2 d4 = normalize(vec2(-1.0, -0.25));
  float h = 0.0; vec2 g = vec2(0.0);
  float amp = uAmp; float freq = 0.0075; float speed = 1.1;
  vec2 dirs[4]; dirs[0]=d1; dirs[1]=d2; dirs[2]=d3; dirs[3]=d4;
  for (int i = 0; i < 4; i++) {
    vec2 d = dirs[i];
    float phase = dot(d, p) * freq + t * speed;
    h += sin(phase) * amp;
    g += d * cos(phase) * amp * freq;
    freq *= 2.13; amp *= 0.52; speed *= 1.28;
  }
  return vec3(h, g);
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 w = wave(wp.xz, uTime);
  wp.y += w.x;
  vWorld = wp.xyz;
  vNormal = normalize(vec3(-w.y * uChoppy, 1.0, -w.z * uChoppy));
  vCrest = w.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyTint;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uAmp;
uniform float uSpecular;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec2 uGlare;
uniform float uGlareSize;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(uLightDir);

  // Flat water shows its own depth; only the sloping faces of the swell pick up
  // the lighter colour, which is what gives a night sea its texture.
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  float slope = clamp((1.0 - n.y) * 7.0, 0.0, 1.0);
  vec3 base = mix(uDeep, uShallow, slope);
  base = mix(base, uSkyTint, fres * 0.26);

  // Close in, ripples the geometry cannot afford break up the highlight; this is
  // what turns a single mirror-ball glint into a glittering path on the water.
  float detail = clamp(1.0 - length(cameraPosition - vWorld) / 5000.0, 0.0, 1.0);
  vec2 q = vWorld.xz;
  float rx = sin(q.x * 0.21 + uTime * 2.3) + sin(q.y * 0.13 - uTime * 1.7);
  float rz = sin(q.y * 0.19 - uTime * 2.1) + sin(q.x * 0.11 + uTime * 1.3);
  n = normalize(n + vec3(rx, 0.0, rz) * 0.055 * detail);

  // Broad glitter path plus a tight highlight: this is what reads as moonlight.
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 64.0) * 0.85;
  float glitter = pow(max(dot(n, h), 0.0), 14.0) * 0.30;
  // Specular fades with distance so the horizon does not shimmer into moire.
  float dcam = length(cameraPosition - vWorld);
  float specFade = clamp(1.0 - dcam / 9000.0, 0.15, 1.0);
  vec3 col = base + uLightColor * (spec + glitter) * uSpecular * specFade;

  // The moon's reflected pool, laid on the water where the sky light comes from.
  float gd = length(vWorld.xz - uGlare) / uGlareSize;
  float pool = exp(-gd * gd * 1.6);
  col += uLightColor * pool * 0.10 * uSpecular;

  // Foam only on the true peaks: the four octaves sum to about 1.93x uAmp.
  float peak = uAmp * 1.93;
  float foam = smoothstep(peak * 0.80, peak * 0.99, vCrest);
  col = mix(col, vec3(0.82, 0.88, 0.95), foam * 0.30);

  float d = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-pow(d * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const OCEAN_PRESETS = {
  night: {
    deep: 0x061422, shallow: 0x102b46, sky: 0x18334f,
    light: 0xcfe1f8, specular: 1.0, amp: 2.9, fog: 0.00005, fogColor: 0x0b1a2b,
    lightDir: new THREE.Vector3(0.35, 0.42, -1).normalize(),
  },
  dusk: {
    deep: 0x11283e, shallow: 0x27506e, sky: 0x6d5a68,
    light: 0xffd9b3, specular: 0.85, amp: 3.2, fog: 0.00005, fogColor: 0x2f3247,
    lightDir: new THREE.Vector3(-0.6, 0.25, -1).normalize(),
  },
  day: {
    deep: 0x0c2c46, shallow: 0x2a6c90, sky: 0x7fb0cf,
    light: 0xffffff, specular: 0.8, amp: 2.4, fog: 0.00004, fogColor: 0x8fadc2,
    lightDir: new THREE.Vector3(0.4, 0.75, -0.5).normalize(),
  },
};

export class Ocean {
  constructor(preset = 'night', size = 26000, segments = 360) {
    const p = OCEAN_PRESETS[preset] || OCEAN_PRESETS.night;
    this.preset = p;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: p.amp },
        uChoppy: { value: 9 },
        uDeep: { value: new THREE.Color(p.deep) },
        uShallow: { value: new THREE.Color(p.shallow) },
        uSkyTint: { value: new THREE.Color(p.sky) },
        uLightDir: { value: p.lightDir.clone() },
        uLightColor: { value: new THREE.Color(p.light) },
        uSpecular: { value: p.specular },
        uFogDensity: { value: p.fog },
        uFogColor: { value: new THREE.Color(p.fogColor) },
        uGlare: { value: new THREE.Vector2(300, 1400) },
        uGlareSize: { value: 1600 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /** Put the moon/sun pool where the light actually comes from. */
  setGlare(x, z, size = 2200) {
    this.material.uniforms.uGlare.value.set(x, z);
    this.material.uniforms.uGlareSize.value = size;
  }

  setSeaState(state) {
    this.material.uniforms.uAmp.value = this.preset.amp * (0.4 + state * 0.28);
  }

  update(dt, cameraPos) {
    this.material.uniforms.uTime.value += dt * 0.6;
    if (cameraPos) {
      // Keep the sheet under the camera so the horizon never runs out.
      this.mesh.position.x = Math.round(cameraPos.x / 200) * 200;
      this.mesh.position.z = Math.round(cameraPos.z / 200) * 200;
    }
  }

  /** Wave height at a world point, matching the vertex shader closely enough
   *  for hulls to ride the swell. */
  heightAt(x, z, time = this.material.uniforms.uTime.value) {
    const dirs = [[1, 0.35], [-0.6, 1], [0.2, -1], [-1, -0.25]];
    let h = 0, amp = this.material.uniforms.uAmp.value, freq = 0.0075, speed = 1.1;
    for (const [dx, dz] of dirs) {
      const len = Math.hypot(dx, dz);
      const phase = ((dx / len) * x + (dz / len) * z) * freq + time * speed;
      h += Math.sin(phase) * amp;
      freq *= 2.13; amp *= 0.52; speed *= 1.28;
    }
    return h;
  }
}
