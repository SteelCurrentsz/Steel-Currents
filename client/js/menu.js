// The title screen: a harbour burning, seen from the bridge of a ship standing
// in past it. The forecastle and forward turrets cut across the bottom of the
// frame, the port and its fires fill the middle distance, and the smoke pall
// carries up behind the wordmark.

import * as THREE from '../../vendor/three.module.js';
import { Ocean } from './render/ocean.js';
import { buildShip } from './render/ships.js';
import { buildHarbour, islandHeight } from './render/harbour.js';
import { FireSystem } from './render/fire.js';
import { ExplosionSystem } from './render/explosion.js';
import { BomberRaid } from './render/aircraft.js';
import { SHIP_CLASSES } from '../../shared/ships.js';
import { getSettings, QUALITY } from './settings.js';

// Framing, kept together so the composition is easy to nudge. The camera sits
// on our own bridge front, above and abaft the forward turrets.
// Just above the bridge roof and forward of the mast, so the foredeck and A
// turret run away from the lens with nothing of our own rig in the way.
const CAM = {
  pos: new THREE.Vector3(0, 46, 44),
  look: new THREE.Vector3(0, 58, 2000),
  fov: 46,
};

// Our ship's heading: mostly along the island, closing it slowly.
// Heading set so the port opens a little off the starboard bow, clear of
// the wordmark, and slow enough that the framing holds.
const OWN_HEADING = -0.10;
// How fast she crosses the scene. This is a framing rate, not a sea speed:
// slow, so the bearing on the port opens over the whole time the menu is up.
const OWN_SPEED = 2.0;

// How far off she is standing. The island is a couple of thousand metres away,
// which is what puts the whole of it inside the frame with sea either side of
// it — close in it read as a coastline running off both edges.
const OWN_START = -1300;

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
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);

  vec3 col = mix(uHaze, uTop, pow(up, 0.65));

  // The glow is strongest low down and toward the burning port.
  float bearing = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(uGlowDir)));
  float low = pow(1.0 - up, 3.4);
  col += uGlow * low * pow(bearing, 2.3) * 1.0;

  // Overcast, drifting: soot spread flat across the sky, thickest over the fires.
  vec2 sp = vec2(atan(d.z, d.x) * 1.6, up * 3.4) + vec2(uTime * 0.006, 0.0);
  float cloud = fbm(sp * 1.5);
  col = mix(col, col * 0.45 + uGlow * 0.16 * pow(bearing, 2.0), smoothstep(0.35, 0.85, cloud) * (1.0 - up * 0.45));

  // A few stars where the smoke has not reached. Sampled on a cell of the
  // direction and then measured from the middle of that cell, so each one is a
  // point of light rather than a streak drawn across it.
  vec3 cell = floor(d * 340.0);
  float pick = hash21(cell.xz + cell.y * 71.3);
  vec2 jitter = vec2(hash21(cell.xy + 3.1), hash21(cell.zy + 7.7)) - 0.5;
  float within = 1.0 - smoothstep(0.06, 0.30, length(fract(d * 340.0).xz - 0.5 - jitter));
  float star = step(0.9982, pick) * within;
  col += vec3(star) * up * 0.75 * (1.0 - smoothstep(0.3, 0.7, cloud));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class TitleScene {
  constructor(renderer) {
    this.renderer = renderer;
    // What the machine has been told it can afford. The title screen is the
    // heaviest thing in the game — a burning port, a raid and an ocean, all in
    // one frame — so it is the one that has to listen.
    this.quality = QUALITY[getSettings().quality] || QUALITY.medium;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x120b0a, 0.00021);

    this.camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 40000);

    // -- sky ---------------------------------------------------------------
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(0x03050d) },
        uHaze: { value: new THREE.Color(0x110b0d) },
        uGlow: { value: new THREE.Color(0x8a3208) },
        uGlowDir: { value: new THREE.Vector3(-0.3, 0, 1).normalize() },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    // Drawn after the rest of the opaque pass rather than before it. The sky
    // covers the whole frame and its shader is not cheap; letting the sea and
    // the island lay depth down first means better than half of it is thrown
    // out before the fragment stage ever runs.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(16000, 32, 20), this.skyMat);
    sky.renderOrder = 1;
    this.scene.add(sky);

    // -- water, lit by the fires rather than the moon -----------------------
    // The swell is carried by the shader, not by the mesh, so the grid only
    // has to be fine enough to hold the silhouette of the nearest wave.
    this.ocean = new Ocean('night', 22000, Math.min(200, this.quality.oceanSegments));
    const ou = this.ocean.material.uniforms;
    ou.uDeep.value = new THREE.Color(0x0c0d10);
    ou.uShallow.value = new THREE.Color(0x1a1512);
    ou.uSkyTint.value = new THREE.Color(0x2a1a12);
    ou.uLightColor.value = new THREE.Color(0xff8a30);
    ou.uLightDir.value.set(-0.25, 0.28, 1).normalize();
    ou.uSpecular.value = 0.20;
    ou.uFogColor.value = new THREE.Color(0x140d0c);
    ou.uFogDensity.value = 0.00006;
    this.ocean.setSeaState(3);
    // The pool of reflected fire sits under the port, not under a moon, and is
    // broken into streaks rather than laid on as a flat sheet of light.
    this.ocean.setGlare(-40, 430, 700);
    this.ocean.setStreak(0.40);
    this.scene.add(this.ocean.mesh);

    // -- ambient ------------------------------------------------------------
    // The ground half is warm rather than near-black: everything over the island
    // — smoke, aircraft, the undersides of roofs — is lit from the fires below.
    this.scene.add(new THREE.HemisphereLight(0x76501f, 0x452617, 1.35));
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
    const fill = new THREE.DirectionalLight(0xb0561f, 0.85);
    fill.position.set(-40, 45, -900);
    this.scene.add(fill);
    const moon = new THREE.DirectionalLight(0x3d5c86, 0.35);
    moon.position.set(500, 320, -700);
    this.scene.add(moon);

    // -- the port -----------------------------------------------------------
    this.fires = new FireSystem(this.scene, { detail: Math.min(1, this.quality.particles) });
    this.port = buildHarbour(this.fires);
    this.harbour = this.port.group;
    this.scene.add(this.harbour);

    // -- the raid ------------------------------------------------------------
    // Bombs are still coming down on her: flights cross the island, and what
    // they drop bursts where it lands rather than at a fixed height.
    // Blasts stand a long time now -- the cloud off a stick of bombs is still
    // climbing ten seconds later -- so there have to be enough slots for the
    // ones still dying while the next flight is putting more down.
    this.blasts = new ExplosionSystem(this.scene, { slots: 26 });
    // Blasts that have to wait their turn — a magazine walking aft, the wreck
    // of a crane going into the water — run off the scene's own clock rather
    // than off a timer, so they keep their spacing at any frame rate.
    this.pending = [];
    this.raid = new BomberRaid(this.scene, {
      target: { x0: -2300, x1: 2300, z0: 430, z1: 1600 },
      groundAt: (x, z) => Math.max(0, islandHeight(x, z)),
      onImpact: (x, y, z) => this.bombHit(x, y, z),
    });
    // And the yard is going up on its own between times: ready-use ammunition,
    // fuel drums, whatever the last stick started.
    this.nextMinor = 2.5;
    // The gantry crane is on somebody's target list. The next flight over is
    // told to put one on it; if the stick goes wide the next is told again.
    // Once she is down she lies there a while before the screen puts her back.
    this.craneDue = 4;
    this.craneRebuild = null;

    // The battleship at the fitting-out berth. She is already burning when the
    // screen comes up; a while later her forward magazines go, and she settles
    // at her moorings. The screen loops, so the cycle does too.
    this.bb = this.port.battleship;
    this.bbBow = this.port.battleshipBow;
    this.bbT = 0;
    this.bbGone = false;
    for (const dz of [-70, -10, 46]) {
      const p = this.bb.localToWorld(new THREE.Vector3(0, 14, dz));
      this.fires.addFire(p.x, p.y, p.z, {
        width: 40, height: 105, layers: 2, intensity: 1.2,
        smokeWidth: 240, smokeHeight: 1050, lean: 0.28,
        light: dz === -10, lightRange: 1300, embers: 85,
      });
    }
    // Every seat of fire in the port is placed by now, so they can be welded
    // into their instanced draws. Nothing of the fire is on screen before this.
    this.fires.build();

    // -- our own ship -------------------------------------------------------
    this.own = buildShip('iowa');
    this.own.group.rotation.y = 0;
    // Guns trained on the port, off the port bow.
    this.own.turrets.forEach((t, i) => {
      t.rotation.y = (SHIP_CLASSES.iowa.turrets[i]?.angle || 0) - 0.14 + (i % 2 ? 0.05 : -0.04);
    });
    this.scene.add(this.own.group);

    this.time = Math.random() * 30;
    this.travel = 20;
  }

  /** Set a blast off `delay` seconds from now, on the scene's clock. */
  later(delay, fn) {
    this.pending.push({ at: this.time + delay, fn });
  }

  /**
   * A bomb has arrived. Everything the raid does to the port happens here: the
   * burst itself, and — if it has come down on the gantry crane — the crane.
   */
  bombHit(x, y, z) {
    this.blasts.blast(x, y, z, {
      size: 115 + Math.random() * 75, duration: 3.4, debris: 210,
    });

    const crane = this.port.crane;
    // A near miss on the legs is enough: a gantry stands on four feet and only
    // needs to lose one of them.
    if (crane && !crane.falling && !crane.down
        && Math.abs(x - crane.x) < 90 && Math.abs(z - crane.z) < 110
        && crane.topple()) {
      // The hit itself, up among the frames rather than down at the apron.
      this.blasts.blast(crane.x, crane.top * 0.72, crane.z, {
        size: 95, duration: 3.0, debris: 240, power: 0.35,
      });
      // She takes about four seconds to go over. This is the head of the jib
      // arriving in the basin: spray, not fire.
      this.later(4.0, () => {
        this.blasts.blast(crane.x - 10, 2, crane.z - 118, {
          size: 78, duration: 2.6, debris: 90, light: false, plume: false,
        });
        this.blasts.blast(crane.x + 22, 3, crane.z - 74, {
          size: 46, duration: 2.2, debris: 45, light: false, plume: false,
        });
      });
    }
  }

  /**
   * The magazine goes, and she settles.
   *
   * MAG_AT seconds of burning, then the detonation, then she lists and goes
   * down by the bow over the next few seconds and lies there until the cycle
   * comes round again.
   */
  stepBattleship(dt) {
    const MAG_AT = 21, RESET_AT = 46;
    this.bbT += dt;

    if (!this.bbGone && this.bbT >= MAG_AT) {
      this.bbGone = true;
      this.detonate();
    }
    if (this.bbGone) {
      const s = this.bbT - MAG_AT;
      // Down by the head and over to starboard, easing as she takes the water.
      const k = Math.min(1, s / 9);
      const e = 1 - Math.pow(1 - k, 3);
      this.bb.rotation.z = 0.40 * e;
      this.bb.rotation.x = -0.07 * e;
      this.bb.position.y = -7.5 * e;

      // The bow section is thrown up by the magazine going under it, hangs a
      // moment, and comes down broken-backed and settling ahead of the rest.
      const LIFT = 26, UP = 0.6, FALL = 3.6;
      let rise;
      if (s < UP) rise = Math.sin((s / UP) * (Math.PI / 2));
      else if (s < UP + FALL) rise = Math.cos(((s - UP) / FALL) * (Math.PI / 2));
      else rise = 0;
      const settled = Math.min(1, Math.max(0, (s - UP - FALL * 0.5) / 4));
      this.bbBow.position.y = LIFT * rise - 6.5 * settled;
      this.bbBow.position.z = 9 * rise + 4 * settled;
      this.bbBow.rotation.x = -0.30 * rise + 0.16 * settled;
      this.bbBow.rotation.z = 0.10 * rise + 0.16 * settled;
    }
    if (this.bbT >= RESET_AT) {
      this.bbT = 0;
      this.bbGone = false;
      this.bb.rotation.set(0, Math.PI / 2 + 0.02, 0);
      this.bb.position.y = 0;
      this.bbBow.position.set(0, 0, 0);
      this.bbBow.rotation.set(0, 0, 0);
    }
  }

  /** Forty thousand tons of battleship losing her forward magazines. */
  detonate() {
    const at = (dz, dy = 12) => this.bb.localToWorld(new THREE.Vector3(0, dy, dz));

    // The magazine itself: a fireball two hundred metres across with a white
    // heart that outlasts the skin, and a cap rolling over on top of it.
    const m = at(62, 16);
    this.blasts.blast(m.x, m.y, m.z, {
      size: 300, duration: 6.5, debris: 420, power: 1,
    });
    // Then the ready-use rooms and the fuel, walking aft down her length over
    // the next second and a half.
    const stagger = [[76, 130, 0.18], [18, 150, 0.42], [-30, 120, 0.75], [-88, 105, 1.15]];
    for (const [dz, size, delay] of stagger) {
      this.later(delay, () => {
        const p = at(dz, 14);
        this.blasts.blast(p.x, p.y, p.z, {
          size, duration: 4.2, debris: 260, power: 0.6,
        });
      });
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Debris is sized off the projection, so it has to be told about it.
    this.blasts?.resize(h, CAM.fov);
  }

  update(dt) {
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    this.ocean.update(dt, this.camera.position);
    this.fires.update(dt);
    this.blasts.update(dt);
    this.raid.update(dt);
    this.port.update(this.time, dt);

    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.time < this.pending[i].at) continue;
      const { fn } = this.pending.splice(i, 1)[0];
      fn();
    }

    this.stepBattleship(dt);

    // Somebody is briefed onto the crane until it is down; once it is, the
    // wreck lies in the basin for a while before the screen stands it up again
    // and the next flight is given the job.
    const crane = this.port.crane;
    if (crane) {
      if (crane.down) {
        // The clock starts when she goes down, not when she was aimed at:
        // however long the flight took to find her, the wreck lies there.
        if (this.craneRebuild === null) this.craneRebuild = 44;
        this.craneRebuild -= dt;
        if (this.craneRebuild <= 0) {
          crane.reset();
          this.craneRebuild = null;
          this.craneDue = 16;
        }
      } else if (!crane.falling) {
        this.craneDue -= dt;
        if (this.craneDue <= 0) {
          this.raid.strike(crane.x, crane.z);
          this.craneDue = 24;
        }
      }
    }

    this.nextMinor -= dt;
    if (this.nextMinor <= 0) {
      this.nextMinor = 0.9 + Math.random() * 2.2;
      const x = -2400 + Math.random() * 4800;
      const z = 430 + Math.random() * 1100;
      this.blasts.blast(x, Math.max(0, islandHeight(x, z)), z, {
        size: 32 + Math.random() * 42,
        duration: 2.1,
        debris: 60,
        plume: Math.random() < 0.45,
      });
    }

    // Our ship stands on past the port, so the water streams by and the
    // bearing on the fires opens slowly.
    this.travel += dt * OWN_SPEED;
    const g = this.own.group;
    g.position.set(Math.sin(OWN_HEADING) * this.travel, 0,
      OWN_START + Math.cos(OWN_HEADING) * this.travel);
    g.rotation.y = OWN_HEADING;

    // She rides the swell — the real swell, read off the same wave train the
    // ocean shader is drawing, so she lifts to the seas you can see running
    // under her. The camera is bolted to her, so the horizon moves with it.
    // Damped: forty thousand tons does not follow the water exactly, and the
    // view has to stay steady enough to read the wordmark over.
    const att = this.ocean.attitude(g.position.x, g.position.z, OWN_HEADING,
      this.own.length, this.own.beam);
    g.rotation.order = 'YXZ';
    g.rotation.z = att.roll * 0.55;
    g.rotation.x = att.pitch * 0.60;
    g.position.y = att.heave * 0.55 - 1.0;

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
