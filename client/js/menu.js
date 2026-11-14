// The title screen: the American carrier strikes on the Yamato, filmed.
//
// The battle itself is the script in render/strike.js -- four Essexes far to
// the east flying off their deck loads, the Yamato in her ring of destroyers
// turning to comb the attacks, and wave after wave of Hellcats, Dauntlesses
// and Avengers coming in over the cloud at her until she rolls over and blows
// up -- and this is the camera that films it: a list of shots, each a way of
// looking at one moment of it, cut or glided between, five minutes long and
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

const UPV = new THREE.Vector3(0, 1, 0);
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
    loadShips(['yamato', 'yukikaze', 'yugumo', 'essex']).then(() => {
      try { this.begin(); } catch (e) { console.error('Steel Currents: the strike would not stage', e); }
    }).catch(() => { /* the sea alone, until they can be fetched */ });
  }

  begin() {
    this.strike = new Strike(this.scene, this.ocean, this.wakes, {
      effects: this.effects, flak: this.flak, bombs: this.bombs, flames: this.flames, bursts: this.bursts,
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
    const Y = S.yamatoTrack, C = S.cvTrack;
    const Ya = S.yamato, CV = S.carriers[0];
    const FD = S.deckY;
    const cast = S.cast;
    const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3();
    const _q = new THREE.Quaternion();
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
    // Eased onto a moving thing from wherever the camera was looking.
    const follow = (c, p, k = 0.08) => { c.look.lerp(p, k); };
    return [
      // ---- the carriers.
      // From high on the Essex's island, over her deck load spotted aft with
      // wings folded: the first Hellcat taxies up, spreads her wings, runs up
      // and goes away down the deck under the lens and off the bow.
      { t0: 0, t1: 10, at: (t, u, c) => {
        CV.world(-15, FD + 17, -24 + 4 * u, c.pos);
        const aft = CV.world(3, FD, -72, _t);
        if (u < 0.02) c.look.copy(aft);
        const f = cast.launch;
        follow(c, t > 3.8 ? f.pos : aft, 0.035);
        c.fov = 50;
      } },
      // From among the deck load aft, the next one away up the deck and off.
      { t0: 10, t1: 20, at: (t, u, c) => {
        CV.world(10.5, FD + 2.0, -40 + 6 * u, c.pos);
        CV.world(-2, FD + 6 + 20 * ease((u - 0.5) * 2), 140, c.look);
        c.fov = 56;
      } },
      // The task group from above: the carriers in their box, each flying off.
      { t0: 20, t1: 31, at: (t, u, c) => {
        C.local(t, -900 + 150 * u, 300 - 80 * u, -1300 + 200 * u, c.pos);
        C.local(t, 600, 0, 900, c.look);
        c.fov = 40;
      } },
      // ---- the strike.
      // Out over the cloud with the formation.
      { t0: 31, t1: 41, at: chase(cast.lead, 60, 14, 26, 700) },
      // And the whole of it going over the lens.
      { t0: 41, t1: 51, at: (t, u, c) => {
        if (!c.fix) c.fix = cast.lead.path.at(47, new THREE.Vector3()).add(_t.set(-40, -90, -60));
        c.pos.copy(c.fix);
        if (u < 0.02) c.look.copy(cast.lead.pos);
        follow(c, cast.lead.pos, 0.06);
        c.fov = 52;
      } },
      // ---- the Yamato.
      // From high on her quarter, her ring of destroyers about her.
      { t0: 51, t1: 60, at: (t, u, c) => {
        Y.local(t, -560 + 160 * u, 260 - 120 * u, -820 + 260 * u, c.pos);
        Y.local(t, 0, 20, 160, c.look);
        c.fov = 46;
      } },
      // Down on the water off her bow, her turrets training round and up.
      { t0: 60, t1: 67.5, at: (t, u, c) => {
        Y.local(t, 58 + 6 * u, 9, 118 - 10 * u, c.pos);
        Ya.world(0, 22, 18, c.look);
        c.fov = 52;
      } },
      // Over the back of No.2 turret, along her barrels, as the main battery fires.
      { t0: 67.5, t1: 74, at: (t, u, c) => {
        const m = Ya.turrets[1];
        m.getWorldPosition(_t);
        m.getWorldQuaternion(_q);
        _f.set(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
        c.pos.copy(_t).addScaledVector(_f, -30 + 4 * u);
        c.pos.y += 9;
        c.pos.x += -_f.z * 7;
        c.pos.z += _f.x * 7;
        c.look.copy(_t).addScaledVector(_f, 300);
        c.look.y += 110;
        c.fov = 60;
      } },
      // Her Type 3 shell bursting in among the dive bombers.
      { t0: 74, t1: 84, at: (t, u, c) => {
        const f = cast.diveA;
        const [fw, rt] = frame(f);
        c.pos.copy(f.pos).addScaledVector(rt, 240 - 60 * u).addScaledVector(fw, -220 + 80 * u);
        c.pos.y += 40;
        c.look.copy(f.pos).addScaledVector(fw, 330);
        c.fov = 54;
      } },
      // A Hellcat going in ahead of them, guns going.
      { t0: 84, t1: 92, at: chase(cast.strafeA, 24, 4, 5, 500) },
      // Over the shoulder of a Dauntless, seventy degrees down, the Yamato
      // filling the windscreen.
      { t0: 92, t1: 103.6, at: chase(cast.diveA, 20, 4.5, 1.5, 500) },
      // And down with her bomb.
      { t0: 103.6, t1: 110, at: (t, u, c) => {
        const B = cast.bomb;
        if (!B) { chase(cast.diveA, 20, 4.5, 1.5, 500)(t, u, c); return; }
        const b = B.b;
        // Where it is going in, and the camera riding down the line to it.
        _t.set(b.x1, 14, b.z1);
        if (!B.landed) {
          _f.set(b.x, b.y, b.z).sub(_t);
          if (_f.lengthSq() > 400) B.dir = _f.normalize().clone();
        }
        _f.copy(B.dir || UPV);
        if (!B.landed) {
          c.pos.set(b.x, b.y, b.z).addScaledVector(_f, 10);
          c.pos.y += 1.5;
          c.look.copy(_t);
        } else {
          // It is in: the camera thrown back and up off the blast, looking at the fire.
          if (!c.fix) c.fix = _t.clone().addScaledVector(_f, 170).add(new THREE.Vector3(0, 50, 0));
          c.pos.lerp(c.fix, 0.12);
          follow(c, _t, 0.1);
        }
        c.fov = 58;
      } },
      // From her own upperworks, the next ones coming down out of the sun.
      { t0: 110, t1: 122, at: (t, u, c) => {
        Ya.world(11, 30, -36, c.pos);
        const f = cast.diveA2;
        const aft = Ya.world(0, 700, -900, _t);
        if (u < 0.02) c.look.copy(aft);
        follow(c, f.live && !f.down ? f.pos : aft, 0.06);
        c.fov = 64;
      } },
      // Down on the sea behind an Avenger making her run.
      { t0: 122, t1: 138, at: chase(cast.torpA, 32, 5, 11, 400) },
      // The fish running in, from the sea off her port beam.
      { t0: 138, t1: 154, at: (t, u, c) => {
        Y.local(t, 560, 5, -220 + 80 * u, c.pos);
        Y.local(t, 0, 16, 30, c.look);
        c.fov = 40;
      } },
      // Round her, burning, every gun she has firing.
      { t0: 154, t1: 168, glide: 1.5, at: (t, u, c) => {
        const a = 2.4 + u * 1.6;
        Y.local(t, Math.sin(a) * 520, 90 - 40 * u, Math.cos(a) * 520, c.pos);
        Y.local(t, 0, 24, 0, c.look);
        c.fov = 40;
      } },
      // One of her destroyers going past at thirty knots, a Hellcat on her.
      { t0: 168, t1: 179, at: (t, u, c) => {
        const E = S.escorts[3];
        if (!c.fix) c.fix = E.track.local(173.5, 46, 5, 0, new THREE.Vector3());
        c.pos.copy(c.fix);
        E.world(0, 6, 0, _t);
        if (u < 0.02) c.look.copy(_t);
        follow(c, _t, 0.15);
        c.fov = 48;
      } },
      // The main battery again, from low on her quarter.
      { t0: 179, t1: 190, at: (t, u, c) => {
        Y.local(t, -230 - 20 * u, 8, -270 + 60 * u, c.pos);
        Y.local(t, 0, 34, 90, c.look);
        c.fov = 48;
      } },
      // A second dive, and the bombs going in, from overhead.
      { t0: 190, t1: 197, at: chase(cast.diveB, 22, 5, -2, 500) },
      { t0: 197, t1: 208, at: (t, u, c) => {
        Y.local(t, 180, 760 - 160 * u, -260, c.pos);
        Y.local(t, 0, 0, 10, c.look);
        c.fov = 42;
      } },
      // The Avengers again, from high astern, as she turns to comb them.
      { t0: 208, t1: 222, at: (t, u, c) => {
        Y.local(t, -140, 380 - 60 * u, -980 + 140 * u, c.pos);
        Y.local(t, 0, 0, 380, c.look);
        c.fov = 42;
      } },
      // An Avenger shot up over her, going in.
      { t0: 222, t1: 234, at: (t, u, c) => {
        const f = cast.downed;
        Y.local(t, 560, 14, -520 + 60 * u, c.pos);
        if (f.live && !(f.down && f.down.gone)) c.hold = f.pos.clone();
        follow(c, c.hold || Y.local(t, 0, 30, 0, _t), 0.2);
        c.fov = 40;
      } },
      // Listing, burning, low on the water off her port bow.
      { t0: 234, t1: 248, at: (t, u, c) => {
        Y.local(t, 520 - 60 * u, 9, 330 - 40 * u, c.pos);
        Y.local(t, 0, 12, -20, c.look);
        c.fov = 38;
      } },
      // From her starboard side as she stops and rolls over.
      { t0: 248, t1: 263, at: (t, u, c) => {
        Y.local(t, -470 + 40 * u, 7, 120 - 40 * u, c.pos);
        Y.local(t, 0, 12 + 10 * u, 0, c.look);
        c.fov = 40;
      } },
      // Her magazines, from two miles off.
      { t0: 263, t1: 284, at: (t, u, c) => {
        if (!c.fix) c.fix = Y.local(263, 1500, 16, 950, new THREE.Vector3());
        c.pos.copy(c.fix);
        Y.local(263, 0, 60 + 160 * ease((u - 0.35) / 0.65), 0, c.look);
        c.fov = 38;
      } },
      // And up and away over the column as the last of them go home.
      { t0: 284, t1: LOOP, at: (t, u, c) => {
        const e = ease(u);
        Y.local(263, 1500 - 200 * e, 16 + 600 * e, 950 + 700 * e, c.pos);
        Y.local(263, 0, 220 - 120 * e, 0, c.look);
        c.fov = 36 + 6 * e;
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
      this.strike.update(dt, c.pos);
      let ix = this.shots.findIndex((s) => t >= s.t0 && t < s.t1);
      if (ix < 0) ix = this.shots.length - 1;
      const shot = this.shots[ix];
      if (ix !== this.shotIx) {
        // A glide starts from wherever the camera was; a cut starts clean.
        this.prev = shot.glide ? { pos: c.pos.clone(), look: c.look.clone(), fov: c.fov } : null;
        this.shotIx = ix;
        c.hold = null;
        c.fix = null;
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
    this.bursts.update(dt, this.camera);
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
