// The title screen: an American carrier strike on the Yamato and the Musashi,
// filmed.
//
// The battle itself is the script in render/strike.js -- the two Yamatos
// steaming north and turning to comb the attacks, the Essexes far to the east
// flying off their air groups, and wave after wave of Hellcats, Dauntlesses
// and Avengers coming in over the cloud at them -- and this is the camera
// that films it: a list of shots, each a way of looking at one moment of it,
// cut or glided between, the whole thing a little under five minutes long and
// then round again behind a fade.
//
// The ships it needs are fetched behind it (see loadShips). Until they are in,
// the camera drifts low over the sea under the cloud, and the battle starts
// the moment they land.

import * as THREE from '../../vendor/three.module.js';
import { Ocean } from './render/ocean.js';
import { loadShips } from './render/ships.js';
import { Effects } from './render/effects.js';
import { ExplosionSystem } from './render/explosion.js';
import { Flak, Bombs } from './render/ordnance.js';
import { Flames } from './render/flames.js';
import { WakeField } from './render/wakefield.js';
import { Strike, LOOP } from './render/strike.js';
import { getSettings, QUALITY } from './settings.js';

/** Which way the sun is: an afternoon sun, low enough to light the smoke from the side. */
const SUN = new THREE.Vector3(0.62, 0.42, -0.66).normalize();

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A day sky over the Philippine Sea: deep blue overhead going to a hazy
// horizon, the sun with the glare round it, and fair-weather cumulus drifting
// across it, thickest low down where you see the most of the layer edge on.
const SKY_FRAG = /* glsl */`
uniform vec3 uTop;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform vec3 uSunCol;
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
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHaze, uTop, pow(up, 0.55));
  float s = max(0.0, dot(d, uSun));
  // The glare, and the disc.
  col += uSunCol * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6 + smoothstep(0.9993, 0.9997, s) * 4.0);
  // The cumulus: the sky seen through a layer of it, projected onto a plane
  // overhead so the clouds crowd together towards the horizon.
  if (d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.08) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(p * 1.3);
    float cov = smoothstep(0.42, 0.74, c);
    // Lit on the side towards the sun, grey underneath.
    float lit = 0.72 + 0.4 * pow(s, 3.0);
    vec3 cloud = mix(vec3(0.52, 0.56, 0.6), vec3(0.97, 0.96, 0.93), smoothstep(0.5, 0.9, c)) * lit;
    col = mix(col, cloud, cov * smoothstep(0.0, 0.08, d.y) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The colour of the air low down: the sky at the horizon, the fog, the sea at its edge. */
const HAZE = 0xaebbc4;

const ease = (k) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class TitleScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.quality = QUALITY[getSettings().quality] || QUALITY.medium;
    const q = this.quality;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(HAZE, 0.000085);
    this.camera = new THREE.PerspectiveCamera(50, 1, 1.5, 60000);

    // -- sky ---------------------------------------------------------------
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(0x3e6489) },
        uHaze: { value: new THREE.Color(HAZE) },
        uSun: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(0xfff0d6) },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 40, 24), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // -- the sea -------------------------------------------------------------
    this.ocean = new Ocean('day', 44000, Math.min(240, q.oceanSegments));
    this.ocean.setSeaState(3);
    {
      const u = this.ocean.material.uniforms;
      u.uLightDir.value.copy(SUN);
      u.uFogColor.value.set(HAZE);
      // Thick enough that the edge of the sea is lost in the haze however high
      // the camera climbs: from a strike's altitude it would otherwise show.
      u.uFogDensity.value = 0.000085;
      this.ocean.setGlare(SUN.x * 5200, SUN.z * 5200, 3600);
    }
    this.scene.add(this.ocean.mesh);
    // What the ships do to it: their wakes, drawn into a map the sea reads.
    this.wakes = new WakeField({ size: q.wakeMap || 1024 });

    // -- light -------------------------------------------------------------
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
    sun.position.copy(SUN).multiplyScalar(4000);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xc4d2dd, 0x3a4852, 1.45));

    // -- the battle's effects ------------------------------------------------
    this.effects = new Effects(this.scene, q.particles);
    this.bursts = new ExplosionSystem(this.scene, { slots: 22, lights: false });
    this.effects.bursts = this.bursts;
    this.effects.splashes.setWaves(this.wakes.rings);
    this.effects.splashes.setSea(this.ocean);
    this.effects.splashes.setAtmosphere({ preset: 'day', overcast: 0.25, sunDir: SUN });
    this.effects.blasts.setAtmosphere({ preset: 'day', overcast: 0.25, sunDir: SUN, wind: { x: -4, z: 2 } });
    this.flames = new Flames(this.scene, q.particles);
    this.flames.wind.x = -4;
    this.flames.wind.z = 2;
    this.flak = new Flak(this.scene, 1400);
    this.bombs = new Bombs(this.scene, 32);

    // A black card across the lens, for the fades.
    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false,
    }));
    this.fade.renderOrder = 999;
    this.fade.position.set(0, 0, -2);
    this.camera.add(this.fade);
    this.scene.add(this.camera);

    this.time = 0;
    this.strike = null;
    this.shotIx = -1;
    this.cam = { pos: V(0, 30, 0), look: V(0, 30, 1000), fov: 50 };
    this.prev = null;

    // The fleet, fetched behind the title: the battle starts when it is in.
    loadShips(['yamato', 'musashi', 'yukikaze', 'essex']).then(() => {
      try { this.begin(); } catch (e) { console.error('Steel Currents: the strike would not stage', e); }
    }).catch(() => { /* the sea alone, until they can be fetched */ });
  }

  begin() {
    this.strike = new Strike(this.scene, this.ocean, this.wakes, {
      effects: this.effects, flak: this.flak, bombs: this.bombs, flames: this.flames,
    });
    this.shots = this.writeShots();
    this.clock = 0;
    this.shotIx = -1;
  }

  // --- the shots ----------------------------------------------------------

  /**
   * Every shot: from when to when, how it moves (`at(t, u, cam)` sets the
   * camera's position, what it looks at and its field of view), and how long
   * it takes to glide in from the shot before -- none, and it is a cut.
   */
  writeShots() {
    const S = this.strike;
    const Y = S.yamatoTrack, M = S.musashiTrack, C = S.cvTrack;
    const deck = S.deckY;
    const _f = new THREE.Vector3(), _r = new THREE.Vector3();
    // The way an aeroplane is facing, and her right.
    const frame = (f) => {
      _f.set(0, 0, 1).applyQuaternion(f.quat);
      _r.set(-1, 0, 0).applyQuaternion(f.quat);
      return [_f, _r];
    };
    const chase = (f, back, up, side, ahead = 400) => (t, u, c) => {
      const [fw, rt] = frame(f);
      c.pos.copy(f.pos).addScaledVector(fw, -back).addScaledVector(rt, side);
      c.pos.y += up;
      c.look.copy(f.pos).addScaledVector(fw, ahead);
    };
    return [
      // The deck of the Essex, low on her quarter: her air group running up
      // the deck past the lens and lifting off her bow.
      { t0: 0, t1: 13, at: (t, u, c) => {
        C.local(t, 20, deck + 4.5, -135 + 30 * u, c.pos);
        C.local(t, -4, deck + 3, 140, c.look);
        c.fov = 52;
      } },
      // From the sea, abeam of her: aircraft climbing away, her sister astern.
      { t0: 13, t1: 24, at: (t, u, c) => {
        C.local(t, -520, 14, -260 + 260 * u, c.pos);
        C.local(t, 0, 30 + 60 * u, 120 + 200 * u, c.look);
        c.fov = 40;
      } },
      // The strike on its way, over the cloud.
      { t0: 24, t1: 38, at: chase(S.cast.torpA, 70, 16, 30, 600) },
      // The Japanese force from high on its beam, steaming north in line of
      // bearing, the strike's escort sweeping in over the lens.
      { t0: 38, t1: 51, at: (t, u, c) => {
        M.local(t, 420 - 60 * u, 95 - 30 * u, -560 + 160 * u, c.pos);
        Y.local(t, 0, 20, 150, c.look);
        c.fov = 44;
      } },
      // The Yamato from low on her quarter, as her main battery trains out and fires.
      { t0: 51, t1: 62, at: (t, u, c) => {
        Y.local(t, -190 - 30 * u, 9, -250 + 70 * u, c.pos);
        Y.local(t, 0, 30, 110, c.look);
        c.fov = 50;
      } },
      // Her Type 3 shell bursting in among the dive bombers.
      { t0: 62, t1: 74, at: (t, u, c) => {
        const f = S.cast.diveA;
        const [fw, rt] = frame(f);
        c.pos.copy(f.pos).addScaledVector(rt, 260 - 60 * u).addScaledVector(fw, -240 + 80 * u);
        c.pos.y += 40;
        c.look.copy(f.pos).addScaledVector(fw, 330);
        c.fov = 52;
      } },
      // Down on the water behind an Avenger making her run on the Musashi.
      { t0: 74, t1: 92, at: chase(S.cast.torpA, 34, 5, 11, 400) },
      // The fish running: from the sea off her beam.
      { t0: 92, t1: 111, at: (t, u, c) => {
        M.local(t, 520, 5, -240 + 80 * u, c.pos);
        M.local(t, 0, 16, 20, c.look);
        c.fov = 40;
      } },
      // Over the nose of a Dauntless as she rolls into her dive.
      { t0: 111, t1: 123, at: chase(S.cast.diveA, 30, 7, 0, 600) },
      // Round the Musashi, burning, every gun she has firing.
      { t0: 123, t1: 146, glide: 1.5, at: (t, u, c) => {
        const a = 2.2 + u * 1.8;
        M.local(t, Math.sin(a) * 820, 120 - 40 * u, Math.cos(a) * 820, c.pos);
        M.local(t, 0, 24, 0, c.look);
        c.fov = 40;
      } },
      // A Hellcat strafing the Yamato.
      { t0: 146, t1: 160, at: chase(S.cast.strafeB, 26, 4, 5, 500) },
      // Both of them, wide, under the whole of it.
      { t0: 160, t1: 176, at: (t, u, c) => {
        Y.local(t, -760 + 120 * u, 110 + 30 * u, -820 + 200 * u, c.pos);
        Y.local(t, 0, 40, 150, c.look);
        c.fov = 46;
      } },
      // From her own upperworks, looking up at the dive bombers coming down.
      { t0: 176, t1: 196, at: (t, u, c) => {
        Y.local(t, 9, 31, -46, c.pos);
        const f = S.cast.diveB;
        const fore = Y.local(t, 0, 160, 900);
        c.look.copy(fore).lerp(f.live ? f.pos : fore, ease((u - 0.05) * 3) * (1 - ease((u - 0.75) * 5)));
        c.fov = 62;
      } },
      // High astern of her as she turns away and combs the tracks.
      { t0: 196, t1: 212, at: (t, u, c) => {
        Y.local(t, -120, 380 - 60 * u, -980 + 120 * u, c.pos);
        Y.local(t, 0, 0, 380, c.look);
        c.fov = 42;
      } },
      // The tracks going past her, from low on her bow.
      { t0: 212, t1: 226, at: (t, u, c) => {
        Y.local(t, 380, 48 - 20 * u, 520 - 60 * u, c.pos);
        Y.local(t, 0, 14, -60, c.look);
        c.fov = 42;
      } },
      // An Avenger shot up over her, going in: from the sea off her quarter,
      // the camera following her down.
      { t0: 226, t1: 240, at: (t, u, c) => {
        const f = S.cast.downed;
        Y.local(t, 560, 16, -520 + 60 * u, c.pos);
        if (f.live && !(f.down && f.down.gone)) c.hold = f.pos.clone();
        c.look.copy(c.hold || Y.local(t, 0, 30, 0));
        c.fov = 40;
      } },
      // The Musashi, listing and burning, low on the water off her bow.
      { t0: 240, t1: 258, at: (t, u, c) => {
        M.local(t, -420 + 80 * u, 6, 640 - 60 * u, c.pos);
        M.local(t, 0, 20, -40, c.look);
        c.fov = 38;
      } },
      // And up and away astern of the Yamato as the last of them go home.
      { t0: 258, t1: LOOP, at: (t, u, c) => {
        const e = ease(u);
        Y.local(t, -80, 10 + 900 * e, -320 - 1400 * e, c.pos);
        Y.local(t, 0, 20, 500 * (1 - e), c.look);
        c.fov = 44 - 6 * e;
      } },
    ];
  }

  // --- every frame ----------------------------------------------------------

  /** Where the camera is before anything is in: low over the sea, drifting. */
  prelude(t, c) {
    c.pos.set(-200 + t * 6, 26 + Math.sin(t * 0.1) * 4, -1800 + t * 14);
    c.look.set(c.pos.x - 4000, 240, c.pos.z + 4000);
    c.fov = 48;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bursts?.resize(h, this.camera.fov);
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    const c = this.cam;
    let fade = 0;

    if (!this.strike) {
      this.prelude(this.time, c);
      fade = 1 - ease(this.time / 2.5);
    } else {
      this.clock += dt;
      if (this.clock >= LOOP) {
        // Round again: everything put back as it was at the start.
        this.clock = 0;
        this.strike.reset();
        this.shotIx = -1;
      }
      const t = this.clock;
      this.strike.update(dt);
      let ix = this.shots.findIndex((s) => t >= s.t0 && t < s.t1);
      if (ix < 0) ix = this.shots.length - 1;
      const shot = this.shots[ix];
      if (ix !== this.shotIx) {
        // A glide starts from wherever the camera was; a cut starts clean.
        this.prev = shot.glide ? { pos: c.pos.clone(), look: c.look.clone(), fov: c.fov } : null;
        this.shotIx = ix;
        c.hold = null;
      }
      const u = (t - shot.t0) / (shot.t1 - shot.t0);
      shot.at(t, u, c);
      if (this.prev) {
        const k = ease((t - shot.t0) / shot.glide);
        c.pos.lerpVectors(this.prev.pos, c.pos, k);
        c.look.lerpVectors(this.prev.look, c.look, k);
        c.fov = this.prev.fov + (c.fov - this.prev.fov) * k;
        if (k >= 1) this.prev = null;
      }
      // In from black at the top, out to black at the end.
      fade = Math.max(1 - ease(t / 2), ease((t - (LOOP - 2.5)) / 2.5));
    }

    // Never under the sea, whatever a shot asks.
    const sea = this.ocean.heightAt(c.pos.x, c.pos.z);
    if (c.pos.y < sea + 2.5) c.pos.y = sea + 2.5;
    this.camera.position.copy(c.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(c.look);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);
    this.fade.material.opacity = fade;
    this.fade.visible = fade > 0.001;

    const eye = this.camera.position;
    this.sky.position.set(eye.x, 0, eye.z);
    this.ocean.update(dt, eye);
    this.effects.update(dt, this.camera);
    this.bursts.update(dt);
    this.flames.update(dt);
    this.flak.update(dt, this.camera);
    this.bombs.update(dt, this.camera);
  }

  render() {
    this.wakes.render(this.renderer, this.camera);
    this.wakes.bind(this.ocean.material.uniforms);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.strike?.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
