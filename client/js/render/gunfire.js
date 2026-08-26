// What happens when a coast gun goes off.
//
// Three things, and they happen on three different clocks. The flash is over in
// a tenth of a second and is the only part that lights anything. The gun runs
// back through its cradle in about a fifth of a second and is walked home by
// the recuperator over the next second or two, which is why a heavy gun looks
// like it is being punched rather than pushed. And the smoke stands where the
// muzzle was for ten or fifteen seconds afterwards, going nowhere much.
//
// The smoke is one Points buffer for the whole scene: every puff any gun has
// made lives in the same pool, is written once on the CPU when it is born and
// moved entirely on the GPU after that. A coast battery firing every four
// seconds would otherwise be several hundred sprites a minute of CPU work for
// something nobody looks at directly.

import * as THREE from '../../../vendor/three.module.js';

// ------------------------------------------------------------ the recoil --

/**
 * How far back the gun is at `t` seconds after firing, as a fraction of its
 * stroke.
 *
 * Out is quick and decelerating — the recoil brake is taking energy out of it
 * the whole way, so it covers most of the stroke in the first third of the
 * time. Home is slow and eased at both ends, because the recuperator is a
 * spring pushing several tonnes of gun and it neither starts nor stops sharply.
 */
export function recoilAt(t, out, back) {
  if (t < 0) return 0;
  if (t < out) {
    const u = t / out;
    return 1 - (1 - u) * (1 - u);
  }
  if (t < out + back) {
    const u = (t - out) / back;
    return 1 - u * u * (3 - 2 * u);
  }
  return 0;
}

// ------------------------------------------------------------- the flash --

function flashPart(color, peak) {
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  // How bright this layer gets at its peak. It starts at nothing, because the
  // flash is not on screen until a round goes off.
  m.userData.peak = peak;
  return m;
}

/**
 * The flash: a white core at the muzzle, a cone of burning propellant down the
 * bore line, and the star of flame that spreads sideways off the swell.
 *
 * Three additive layers with falling weights rather than three at full: stacked
 * at full strength they clip to white and the shape goes with it.
 */
function flashMesh() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.0, 12, 1, true),
    flashPart(0xffa63c, 0.44));
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 1.5;
  g.add(cone);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8),
    flashPart(0xffdda0, 0.6));
  g.add(ball);
  const star = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.9, 10, 1, true),
    flashPart(0xff8a28, 0.24));
  star.rotation.x = -Math.PI / 2;
  star.position.z = 0.45;
  g.add(star);
  for (const c of g.children) c.userData.peak = c.material.userData.peak;
  g.visible = false;
  g.renderOrder = 6;
  return g;
}

// ------------------------------------------------------------- the smoke --

const SMOKE_VERT = /* glsl */`
uniform float uTime;
attribute float aBirth;      // when this puff was made
attribute float aLife;       // how long it lasts
attribute float aSize;       // metres across at birth
attribute float aGrow;       // metres a second it opens out
attribute vec3 aVel;         // where it is going, metres a second
attribute vec3 aTint;
varying float vAge;
varying vec3 vTint;
void main() {
  float age = uTime - aBirth;
  vAge = age / aLife;
  vTint = aTint;
  if (vAge < 0.0 || vAge > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // off the clip volume
    gl_PointSize = 0.0;
    return;
  }
  // Slows as it goes: a puff of propellant smoke has no momentum to speak of
  // once it is a metre from the muzzle, and then it only rises.
  float drag = 1.0 - exp(-age * 1.5);
  vec3 p = position + aVel * (drag / 1.5) + vec3(0.0, age * 0.55, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(1.0, -mv.z);
  // Capped: a puff of Gustav's smoke twenty metres across and thirty metres
  // from the eye would otherwise be most of the screen shaded twice over, and
  // the ones that big are the ones nobody is looking at.
  gl_PointSize = min(((aSize + aGrow * age) / d) * 620.0, 280.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SMOKE_FRAG = /* glsl */`
varying float vAge;
varying vec3 vTint;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  // Soft-edged, and thinning from the rim in as it ages.
  float a = pow(1.0 - r, 1.35) * (1.0 - vAge) * (1.0 - vAge);
  // Lit from inside for the first instant, because it comes out of the barrel
  // burning — but only for that instant, or it is a string of white beads.
  vec3 c = mix(vTint * 1.28, vTint, min(1.0, vAge * 26.0));
  a *= 0.72;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c * a, a);
}
`;

const POOL = 300;

/** The scene's smoke: one buffer, every gun's puffs in it. */
class Smoke {
  constructor(scene) {
    this.n = 0;
    this.time = 0;
    const pos = new Float32Array(POOL * 3);
    const vel = new Float32Array(POOL * 3);
    const tint = new Float32Array(POOL * 3);
    const birth = new Float32Array(POOL).fill(-1e6);
    const life = new Float32Array(POOL).fill(1);
    const size = new Float32Array(POOL);
    const grow = new Float32Array(POOL);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aGrow', new THREE.BufferAttribute(grow, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 4000);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      // Premultiplied: propellant smoke is lighter than the sea behind it and
      // darker than the sky above it, and straight additive can only be one.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  /** One puff, written straight into the pool. */
  puff(p, v, size, grow, life, tint) {
    const i = this.n % POOL;
    this.n++;
    const a = this.geo.attributes;
    a.position.setXYZ(i, p.x, p.y, p.z);
    a.aVel.setXYZ(i, v.x, v.y, v.z);
    a.aTint.setXYZ(i, tint.r, tint.g, tint.b);
    a.aBirth.setX(i, this.time);
    a.aLife.setX(i, life);
    a.aSize.setX(i, size);
    a.aGrow.setX(i, grow);
    for (const k of ['position', 'aVel', 'aTint', 'aBirth', 'aLife', 'aSize', 'aGrow']) {
      a[k].needsUpdate = true;
    }
  }

  update(dt) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
  }

  dispose() {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------- the guns --

const SMOKE_TINT = new THREE.Color(0xb9b6ab);
const DUST_TINT = new THREE.Color(0xa2957a);

/**
 * Fires the guns of whatever battery is on the screen, on their own reload,
 * and runs the recoil, the flash, the smoke and the dust.
 */
export class GunFire {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new Smoke(scene);
    // How hard the last flash is burning, 0 to 1. The scene reads it and lifts
    // its own two lights for as long as it lasts.
    //
    // A point light at the muzzle would be the obvious way to do this, and it
    // is the wrong one: a third light in the scene makes every material shade
    // an extra source on every fragment of every frame, firing or not, and that
    // is a tenth of the frame given up for a tenth of a second of flash.
    this.flashLevel = 0;
    this.flashes = [];
    this.guns = [];
    this.time = 0;
    this._p = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  /**
   * Take a new battery's guns.
   *
   * `period` is worked out from the real reload but on a compressed clock: a
   * gun that takes three minutes to load would otherwise be a screen with
   * nothing happening on it. The order is kept, so the eighty-eight still fires
   * three times for every one round out of Gustav.
   */
  setBattery(battery, reload, groundY = 0) {
    this.groundY = groundY;
    for (const f of this.flashes) f.removeFromParent();
    this.flashes = [];
    const period = Math.min(18, 2.5 + Math.sqrt(Math.max(0.5, reload)) * 1.5);
    this.guns = (battery ? battery.guns : []).map((gun, i) => {
      const flash = flashMesh();
      this.scene.add(flash);
      this.flashes.push(flash);
      return {
        ...gun,
        flash,
        period,
        // Guns of a battery are laid together but not fired together: half a
        // second apart is what a salvo sounds like.
        next: 1.4 + i * 0.55,
        t: -1,
        // Out fast, home slow. Both scale with the stroke, which scales with
        // the bore, so a fourteen-inch gun takes about a second and a half to
        // come home and an eighty-eight is back before the case is clear.
        out: 0.07 + gun.stroke * 0.1,
        back: 0.55 + gun.stroke * 1.05,
      };
    });
  }

  update(dt, wind) {
    this.time += dt;
    this.smoke.update(dt);

    let lit = 0;
    for (const gun of this.guns) {
      gun.next -= dt;
      if (gun.next <= 0) {
        gun.next = gun.period;
        gun.t = 0;
        this.fire(gun, wind);
      }
      if (gun.t >= 0) {
        gun.t += dt;
        gun.node.position.z = -gun.stroke * recoilAt(gun.t, gun.out, gun.back);
        if (gun.t > gun.out + gun.back) { gun.t = -1; gun.node.position.z = 0; }
      }
      // The flash: bloom, then gone. Sixteen hundredths of a second all told.
      const f = gun.flash;
      if (f.visible) {
        f.userData.age += dt;
        const u = f.userData.age / 0.16;
        if (u >= 1) f.visible = false;
        else {
          const grow = 0.62 + u * 0.62;
          f.scale.setScalar(f.userData.size * grow);
          const fade = Math.pow(1 - u, 1.15);
          for (const c of f.children) c.material.opacity = c.userData.peak * fade;
          lit = Math.max(lit, fade);
        }
      }
    }
    this.flashLevel = lit;
  }

  /** One round away. */
  fire(gun, wind) {
    gun.node.updateMatrixWorld(true);
    const p = this._p.set(0, 0, gun.muzzleZ).applyMatrix4(gun.node.matrixWorld);
    const d = this._d.set(0, 0, 1).transformDirection(gun.node.matrixWorld).normalize();
    const bore = gun.bore;

    const f = gun.flash;
    f.visible = true;
    f.userData.age = 0;
    f.userData.size = bore * 4.6;
    f.position.copy(p);
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    f.scale.setScalar(f.userData.size * 0.62);

    // Propellant smoke: a bank of it out of the muzzle, thrown forward and then
    // stopped almost at once by the air.
    const puffs = Math.min(16, 5 + Math.round(bore * 12));
    const v = new THREE.Vector3();
    for (let i = 0; i < puffs; i++) {
      const spread = i / puffs;
      v.copy(d).multiplyScalar(bore * (14 - spread * 9));
      v.x += (Math.sin(i * 12.9) + wind.x * 0.5) * bore * 5;
      v.y += (Math.cos(i * 7.3) * 0.5 + 0.6) * bore * 5;
      v.z += (Math.sin(i * 4.1) + wind.y * 0.5) * bore * 5;
      this._p.copy(p).addScaledVector(d, bore * (0.6 + spread * 3.4));
      this.smoke.puff(this._p, v, bore * (2.8 + spread * 2.6), bore * 4.0,
        3.5 + spread * 4.5, SMOKE_TINT);
    }
    // And the dust the blast tears off the ground under the muzzle. It comes
    // off the ground, which is the whole point of it: spawned at the height of
    // the gun it is a brown cloud hanging in mid-air with nothing under it.
    if (bore >= 0.14) {
      const gy = this.groundY || 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        v.set(Math.sin(a) * bore * 20, bore * 6, Math.cos(a) * bore * 20);
        this._p.copy(p).addScaledVector(d, bore * 5);
        this._p.x += Math.sin(a) * bore * 4;
        this._p.z += Math.cos(a) * bore * 4;
        this._p.y = gy + bore * 0.6;
        this.smoke.puff(this._p, v, bore * 2.6, bore * 4.5, 4.5, DUST_TINT);
      }
    }
  }

  dispose() {
    for (const f of this.flashes) f.removeFromParent();
    this.smoke.dispose();
  }
}
