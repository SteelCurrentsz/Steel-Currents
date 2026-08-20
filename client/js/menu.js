// The title screen: a harbour burning, seen from the bridge of a ship standing
// in past it. The forecastle and forward turrets cut across the bottom of the
// frame, the port and its fires fill the middle distance, and the smoke pall
// carries up behind the wordmark.

import * as THREE from '../../vendor/three.module.js';
import { Ocean } from './render/ocean.js';
import { buildShip } from './render/ships.js';
import { buildHarbour } from './render/harbour.js';
import { FireSystem } from './render/fire.js';
import { SHIP_CLASSES } from '../../shared/ships.js';

// Framing, kept together so the composition is easy to nudge. The camera sits
// on our own bridge front, above and abaft the forward turrets.
// Just above the bridge roof and forward of the mast, so the foredeck and A
// turret run away from the lens with nothing of our own rig in the way.
const CAM = {
  pos: new THREE.Vector3(0, 38, 46),
  look: new THREE.Vector3(0, 34, 900),
  fov: 48,
};

// Our ship's heading: mostly along the quay, closing it slowly.
// Heading set so the port opens a little off the starboard bow, clear of
// the wordmark, and slow enough that the framing holds.
const OWN_HEADING = -0.10;
const OWN_SPEED = 2.0;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A night sky with the fires throwing their glow up under the overcast: dark
// overhead, and a dirty orange band low down in the direction of the port.
const SKY_FRAG = /* glsl */`
uniform vec3 uTop;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform vec3 uGlowDir;
uniform float uTime;
varying vec3 vDir;

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
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);

  vec3 col = mix(uHaze, uTop, pow(up, 0.65));

  // The glow is strongest low down and toward the burning port.
  float bearing = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(uGlowDir)));
  float low = pow(1.0 - up, 3.4);
  col += uGlow * low * pow(bearing, 3.2) * 1.0;

  // Overcast, drifting: soot spread flat across the sky, thickest over the fires.
  vec2 sp = vec2(atan(d.z, d.x) * 1.6, up * 3.4) + vec2(uTime * 0.006, 0.0);
  float cloud = fbm(sp * 1.5);
  col = mix(col, col * 0.45 + uGlow * 0.16 * pow(bearing, 2.0), smoothstep(0.35, 0.85, cloud) * (1.0 - up * 0.45));

  // A few stars where the smoke has not reached.
  float star = step(0.9975, hash21(floor(d.xz * 620.0 + d.y * 130.0)));
  col += vec3(star) * up * 0.5 * (1.0 - smoothstep(0.3, 0.7, cloud));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class TitleScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x120b0a, 0.00026);

    this.camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 40000);

    // -- sky ---------------------------------------------------------------
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(0x03050d) },
        uHaze: { value: new THREE.Color(0x110b0d) },
        uGlow: { value: new THREE.Color(0x521e07) },
        uGlowDir: { value: new THREE.Vector3(-0.3, 0, 1).normalize() },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(16000, 32, 20), this.skyMat);
    sky.renderOrder = -2;
    this.scene.add(sky);

    // -- water, lit by the fires rather than the moon -----------------------
    this.ocean = new Ocean('night', 16000, 200);
    const ou = this.ocean.material.uniforms;
    ou.uDeep.value = new THREE.Color(0x0a0908);
    ou.uShallow.value = new THREE.Color(0x140c09);
    ou.uSkyTint.value = new THREE.Color(0x1c110b);
    ou.uLightColor.value = new THREE.Color(0xff8a30);
    ou.uLightDir.value.set(-0.25, 0.28, 1).normalize();
    ou.uSpecular.value = 0.13;
    ou.uFogColor.value = new THREE.Color(0x140d0c);
    ou.uFogDensity.value = 0.00006;
    this.ocean.setSeaState(3);
    // The pool of reflected fire sits under the port, not under a moon, and is
    // broken into streaks rather than laid on as a flat sheet of light.
    this.ocean.setGlare(-40, 420, 420);
    this.ocean.setStreak(0.34);
    this.scene.add(this.ocean.mesh);

    // -- ambient ------------------------------------------------------------
    this.scene.add(new THREE.HemisphereLight(0x63401f, 0x1a1210, 1.15));
    // A broad wash from the direction of the fires: the point lights alone fall
    // off long before they reach the far end of the yard, which left the whole
    // port in silhouette.
    const firewash = new THREE.DirectionalLight(0xff7a34, 1.7);
    firewash.position.set(-300, 90, -260);
    this.scene.add(firewash);
    // A second wash from the other bearing, so a wall square to the first one
    // does not go flat black and the yard keeps its planes apart.
    const crosswash = new THREE.DirectionalLight(0xd85a1c, 0.75);
    crosswash.position.set(620, 130, -120);
    this.scene.add(crosswash);
    // A rim from beyond the port, so roofs and cranes separate from the sky.
    const backlight = new THREE.DirectionalLight(0xc2481a, 0.55);
    backlight.position.set(160, 200, 1400);
    this.scene.add(backlight);
    // A front fill along the line of sight: without it anything standing between
    // us and the fires goes to a flat black cut-out.
    const fill = new THREE.DirectionalLight(0xb0561f, 0.6);
    fill.position.set(-40, 45, -900);
    this.scene.add(fill);
    const moon = new THREE.DirectionalLight(0x3d5c86, 0.35);
    moon.position.set(500, 320, -700);
    this.scene.add(moon);

    // -- the port -----------------------------------------------------------
    this.fires = new FireSystem(this.scene);
    this.harbour = buildHarbour(this.fires);
    this.scene.add(this.harbour);
    this.fires.buildEmbers();

    // -- our own ship -------------------------------------------------------
    this.own = buildShip('iowa');
    this.own.group.rotation.y = 0;
    // Guns trained on the port, off the port bow.
    this.own.turrets.forEach((t, i) => {
      t.rotation.y = (SHIP_CLASSES.iowa.turrets[i]?.angle || 0) - 0.14 + (i % 2 ? 0.05 : -0.04);
    });
    this.scene.add(this.own.group);
    this.addBowWave();

    this.time = Math.random() * 30;
    this.travel = 20;
  }

  /** The white water our own bow is pushing up, which is what says "under way". */
  addBowWave() {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,236,214,0.85)');
    grad.addColorStop(0.35, 'rgba(232,206,186,0.42)');
    grad.addColorStop(1, 'rgba(210,190,175,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 128);
    const tex = new THREE.CanvasTexture(canvas);

    const L = this.own.length;
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(20, 150, 1, 10);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.5,
      }));
      mesh.position.set(side * (this.own.beam * 0.42), 1.5, L * 0.22);
      mesh.rotation.y = side * 0.06;
      this.own.group.add(mesh);
    }
    // The wake astern.
    const wakeGeo = new THREE.PlaneGeometry(46, 420, 1, 14);
    wakeGeo.rotateX(-Math.PI / 2);
    wakeGeo.translate(0, 0, -210);
    const wake = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.3,
    }));
    wake.position.set(0, 1.4, -L * 0.48);
    this.own.group.add(wake);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    this.ocean.update(dt, this.camera.position);
    this.fires.update(dt);

    // Our ship stands on past the port, so the water streams by and the
    // bearing on the fires opens slowly.
    this.travel += dt * OWN_SPEED;
    const g = this.own.group;
    g.position.set(Math.sin(OWN_HEADING) * this.travel, 0, Math.cos(OWN_HEADING) * this.travel);
    g.rotation.y = OWN_HEADING;

    // She rides the swell; the camera is bolted to her, so the horizon moves.
    const roll = Math.sin(this.time * 0.42) * 0.019 + Math.sin(this.time * 0.97) * 0.007;
    const pitch = Math.sin(this.time * 0.55 + 1.1) * 0.012;
    const heave = Math.sin(this.time * 0.48) * 1.1;
    g.rotation.z = roll;
    g.rotation.x = pitch;
    g.position.y = heave - 1.0;

    // The camera rides the bridge, so it inherits her motion exactly. The
    // transform has to be refreshed before it is read, or the view lags a frame.
    g.updateMatrixWorld(true);
    this.camera.position.copy(CAM.pos).applyMatrix4(g.matrixWorld);
    this.camera.up.set(0, 1, 0).applyQuaternion(g.quaternion);
    this.camera.lookAt(CAM.look.clone().applyMatrix4(g.matrixWorld));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
