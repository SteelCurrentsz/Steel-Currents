// A soldier in hand, played as a shooter: his rifle in front of you, the
// mouse captured and turning his head directly, the right button bringing the
// rifle up to the eye, the left firing it; a kick that throws the muzzle up
// and comes most of the way back down; his stride in the view; a mark on the
// crosshair when a round goes home.
//
// Everything that moves the rifle is a spring, not an ease: the rifle is a
// weight in his hands, so it lags a turn of his head and overshoots coming
// back, it dips as he comes down off a jump and swings as he runs, and a
// round going off shoves it back into his shoulder and lets it settle. That
// is most of the difference between a rifle that feels held and one that
// feels glued to the screen.
//
// What is drawn here is only the view: the simulation still has him, and the
// rounds and the hits are the battle's (see troops.js and shared/infantry.js).

import * as THREE from '../../vendor/three.module.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const clampAbs = (v, m) => Math.max(-m, Math.min(m, v));

// Where the rifle is held, in the camera's frame (-z ahead, +x right, +y up),
// and turned how: from the hip, up at the eye, carried at the run, down and
// over for a fresh clip, and lowered while he is stood still.
const POSES = {
  hip: { x: 0.14, y: -0.13, z: -0.33, rx: 0.025, ry: 0.06, rz: 0.035 },
  ads: { x: 0, y: 0.0115, z: -0.19, rx: 0, ry: 0, rz: 0 },
  run: { x: 0.11, y: -0.18, z: -0.29, rx: -0.38, ry: 0.85, rz: 0.32 },
  reload: { x: 0.07, y: -0.23, z: -0.31, rx: 0.42, ry: 0.28, rz: 0.62 },
};

/**
 * A damped spring on one number: `k` how stiff, `c` how damped. Pushed by
 * `kick`, pulled toward `to`. Critically damped is c = 2 * sqrt(k); a little
 * under that and it overshoots once, which is what a rifle brought back on
 * target does.
 */
class Spring {
  constructor(k = 120, c = 16) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; }
  step(to, dt) {
    // Sub-stepped, so a long frame does not throw it off into the distance.
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.x - to) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

/** A semi-automatic rifle of the war -- an M1 -- and the two hands on it, built as plain shapes. */
function buildRifle() {
  const g = new THREE.Group();
  const wood = new THREE.MeshPhongMaterial({ color: 0x6a4024, shininess: 26, specular: 0x2a1c12 });
  const woodDark = new THREE.MeshPhongMaterial({ color: 0x4e2f1a, shininess: 20, specular: 0x1c140c });
  const steel = new THREE.MeshPhongMaterial({ color: 0x2f3236, shininess: 70, specular: 0x7a8088 });
  const park = new THREE.MeshPhongMaterial({ color: 0x3a3b36, shininess: 30, specular: 0x44463f });
  const brass = new THREE.MeshPhongMaterial({ color: 0xa88a3e, shininess: 80, specular: 0xcdb76a });
  const skin = new THREE.MeshPhongMaterial({ color: 0xb58a68, shininess: 8 });
  const glove = new THREE.MeshPhongMaterial({ color: 0x5b4632, shininess: 6 });
  const sleeve = new THREE.MeshPhongMaterial({ color: 0x585a38, shininess: 4 });
  const cuff = new THREE.MeshPhongMaterial({ color: 0x484a2c, shininess: 4 });
  const webbing = new THREE.MeshPhongMaterial({ color: 0x6f6a48, shininess: 4 });
  const box = (w, h, d, m, x, y, z, rx = 0, parent = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.x = rx;
    parent.add(b);
    return b;
  };
  const cyl = (r0, r1, len, m, x, y, z, seg = 10, parent = g) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), m);
    c.rotation.x = Math.PI / 2;
    c.position.set(x, y, z);
    parent.add(c);
    return c;
  };
  // The sight line is the rifle's own z axis: the rear aperture at the origin,
  // the front post 62 cm ahead of it.
  // The rear sight: an aperture between two protective ears, looked through.
  box(0.006, 0.028, 0.018, steel, 0.012, -0.012, 0);
  box(0.006, 0.028, 0.018, steel, -0.012, -0.012, 0);
  box(0.03, 0.008, 0.018, steel, 0, -0.023, 0);
  // Its windage and elevation knobs.
  cyl(0.009, 0.009, 0.012, steel, 0.021, -0.022, 0.004, 8).rotation.set(0, 0, Math.PI / 2);
  cyl(0.009, 0.009, 0.012, steel, -0.021, -0.022, 0.004, 8).rotation.set(0, 0, Math.PI / 2);
  // The receiver, with the clip showing in its top when it is loaded.
  box(0.042, 0.044, 0.24, park, 0, -0.051, -0.07);
  const clip = new THREE.Group();
  box(0.026, 0.006, 0.06, brass, 0, -0.028, -0.08, 0, clip);
  for (let i = 0; i < 4; i++) cyl(0.005, 0.005, 0.055, brass, (i % 2 ? 0.006 : -0.006), -0.024 - (i >> 1) * 0.003, -0.08, 6, clip);
  g.add(clip);
  // The operating rod and its handle on the right, which comes back with each round.
  const oprod = new THREE.Group();
  box(0.012, 0.022, 0.11, steel, 0.028, -0.042, -0.05, 0, oprod);
  box(0.022, 0.014, 0.014, steel, 0.038, -0.04, -0.02, 0, oprod);
  box(0.008, 0.01, 0.3, steel, 0.025, -0.055, -0.25, 0, oprod);
  g.add(oprod);
  // The wood: handguard over the barrel, the fore-end under it, the stock.
  box(0.044, 0.024, 0.32, woodDark, 0, -0.032, -0.33);
  box(0.052, 0.04, 0.46, wood, 0, -0.07, -0.34);
  box(0.048, 0.088, 0.34, wood, 0, -0.092, 0.2, -0.12);
  box(0.05, 0.1, 0.02, park, 0, -0.112, 0.37, -0.12);            // the butt plate
  box(0.04, 0.05, 0.09, wood, 0, -0.103, 0.02, 0.5);             // the wrist of the stock
  // The barrel, its gas cylinder under the muzzle, and the front band.
  cyl(0.0105, 0.011, 0.52, steel, 0, -0.034, -0.43);
  cyl(0.009, 0.009, 0.12, steel, 0, -0.054, -0.6);
  box(0.03, 0.046, 0.02, steel, 0, -0.045, -0.555);
  box(0.03, 0.02, 0.018, steel, 0, -0.064, -0.4);                // the lower band and sling swivel
  box(0.004, 0.021, 0.004, steel, 0, -0.015, -0.62);             // front post
  box(0.003, 0.025, 0.012, steel, 0.009, -0.018, -0.62);         // and its ears
  box(0.003, 0.025, 0.012, steel, -0.009, -0.018, -0.62);
  box(0.02, 0.04, 0.05, steel, 0, -0.108, -0.03);                // trigger guard
  // The sling, hanging slack from the lower band back to the butt.
  const sling = box(0.03, 0.004, 0.58, webbing, -0.02, -0.15, -0.09, 0.2);
  sling.rotation.z = 0.15;
  // His hands: the right on the wrist of the stock, the left under the
  // fore-end, the sleeves of his field jacket back to the elbows.
  box(0.062, 0.072, 0.1, skin, 0.004, -0.118, 0.05, 0.3);
  box(0.064, 0.03, 0.04, skin, 0.002, -0.088, -0.005, 0.3);      // trigger finger and thumb
  box(0.09, 0.09, 0.1, cuff, 0.04, -0.15, 0.13, 0.35);
  box(0.09, 0.088, 0.34, sleeve, 0.065, -0.2, 0.26, 0.35);
  box(0.07, 0.054, 0.12, glove, -0.004, -0.1, -0.31);
  box(0.074, 0.02, 0.1, glove, -0.004, -0.07, -0.31);            // the fingers round the wood
  const cuffL = box(0.085, 0.085, 0.09, cuff, -0.05, -0.15, -0.22, 0.25);
  cuffL.rotation.y = -0.55;
  const sleeveL = box(0.084, 0.084, 0.36, sleeve, -0.11, -0.2, -0.13, 0.25);
  sleeveL.rotation.y = -0.55;
  // The flash at the muzzle, lit for a frame or two a round: a star of
  // flame and a cone of it out along the bore.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc866, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flash = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), flashMat);
    p.rotation.z = (k * Math.PI) / 3;
    flash.add(p);
  }
  for (let k = 0; k < 2; k++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.24), flashMat);
    p.rotation.set(Math.PI / 2, 0, k * Math.PI / 2);
    p.position.z = -0.1;
    flash.add(p);
  }
  flash.position.set(0, -0.034, -0.7);
  g.add(flash);
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 10; } });
  return { group: g, flash, flashMat, clip, oprod };
}

/** A soft round puff, drawn once, for the smoke off the muzzle. */
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

export class SoldierFeel {
  constructor(scene) {
    this.scene = scene;
    const r = buildRifle();
    this.root = new THREE.Group();
    this.rifle = r.group;
    this.flash = r.flash;
    this.flashMat = r.flashMat;
    this.clip = r.clip;
    this.oprod = r.oprod;
    this.root.add(this.rifle);
    this.root.visible = false;
    scene.add(this.root);
    // The smoke off the muzzle, in the world: a few puffs reused.
    this.puffs = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xc9c4ba, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.renderOrder = 9;
      scene.add(s);
      this.puffs.push({ s, life: 0, max: 1, v: new THREE.Vector3() });
    }
    this.puffAt = 0;
    this.ads = 0;         // 0 at the hip, 1 at the eye
    this.run = 0;         // carried at the run
    this.reload = 0;      // down for a clip
    this.phase = 0;       // his stride
    this.stride = 0;      // how much of it is in the view
    this.flashT = 0;
    this.wasAir = false;
    this.spread = 0;      // the crosshair, opened out
    this.fovPunch = 0;
    this.lastStep = 0;
    this.heat = 0;        // how hot the barrel is, for the smoke off it
    this.oprodT = 0;
    // The springs: the rifle's place and turn in his hands, and the camera's
    // own jolt and roll.
    this.sp = {
      x: new Spring(140, 15), y: new Spring(140, 15), z: new Spring(260, 22),
      rx: new Spring(200, 18), ry: new Spring(160, 16), rz: new Spring(120, 13),
      camP: new Spring(180, 20), camR: new Spring(90, 12), camY: new Spring(220, 22),
    };
    this.lastLook = { x: 0, y: 0 };
    this.strafe = 0;
    this.onStep = null;
    this.onLand = null;
  }

  /** A round away: the rifle back into his shoulder, the muzzle up, the flash, the smoke. */
  fired(cam) {
    // Spring kicks are velocities: a kick of v peaks at about v / 25 for
    // these stiffnesses, in metres or radians.
    const hip = 1 - this.ads;
    this.sp.z.kick(1.2 + 0.8 * hip);
    this.sp.rx.kick(1.4 + 1.4 * hip);
    this.sp.ry.kick((Math.random() - 0.5) * 1.5);
    this.sp.rz.kick((Math.random() - 0.5) * 1.8);
    this.sp.y.kick(0.12);
    this.sp.camP.kick(0.3);
    this.sp.camR.kick((Math.random() - 0.5) * 0.3);
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.spread = Math.min(1, this.spread + 0.5);
    this.fovPunch = 2.2;
    this.oprodT = 0.09;
    this.heat = Math.min(1, this.heat + 0.18);
    if (cam) this.smoke(cam, 2 + Math.round(this.heat * 2), 0.6);
  }

  /** Hurt: the view thrown, the rifle knocked off line. */
  flinch(k = 1) {
    this.sp.camP.kick((Math.random() < 0.5 ? -1 : 1) * 1.2 * k);
    this.sp.camR.kick((Math.random() - 0.5) * 2 * k);
    this.sp.rx.kick(-1.5 * k);
    this.sp.ry.kick((Math.random() - 0.5) * 2.5 * k);
  }

  /** A burst close by: the whole view shoved and the rifle jolted. */
  jolt(k = 1) {
    this.sp.camR.kick((Math.random() - 0.5) * 3 * k);
    this.sp.camP.kick((Math.random() - 0.5) * 2 * k);
    this.sp.y.kick(-0.7 * k);
    this.sp.rz.kick((Math.random() - 0.5) * 2.5 * k);
  }

  /** Smoke out of the muzzle, into the world where the muzzle is now. */
  smoke(cam, n = 2, k = 1) {
    this.rifle.updateMatrixWorld(true);
    const at = new THREE.Vector3(0, -0.034, -0.72).applyMatrix4(this.rifle.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    for (let i = 0; i < n; i++) {
      const p = this.puffs[this.puffAt++ % this.puffs.length];
      p.s.position.copy(at);
      p.v.copy(fwd).multiplyScalar(0.4 + Math.random() * 0.8 * k);
      p.v.x += (Math.random() - 0.5) * 0.2; p.v.z += (Math.random() - 0.5) * 0.2;
      p.v.y += 0.15 + Math.random() * 0.25;
      p.life = p.max = 0.9 + Math.random() * 0.9;
      p.s.scale.setScalar(0.06);
      p.s.visible = true;
    }
  }

  /**
   * One frame: `st` is what he is doing -- { moving, speed, sprint, crouch,
   * air, ads, reloading, look: { x, y }, strafe, lean, clip } -- and the
   * camera has already been put at his eye and pointed. Moves the camera by
   * his stride and the springs and puts the rifle in front of it. Hands back
   * what the crosshair and the field of view want: { spread, fov, ads }.
   */
  update(cam, st, dt, show) {
    this.root.visible = !!show;
    dt = Math.min(0.05, Math.max(0, dt));
    const ground = !st.air;
    // His stride: quicker and bigger at the run, hardly there crouched.
    const pace = ground ? Math.min(1, st.speed / 2.5) : 0;
    this.stride = damp(this.stride, pace * (st.sprint ? 1.5 : st.crouch ? 0.5 : 1) * (1 - 0.7 * this.ads), 10, dt);
    const was = this.phase;
    this.phase += dt * (st.sprint ? 13 : st.crouch ? 7.5 : 9.5) * (pace > 0.05 ? 1 : 0);
    // A footfall every half turn of the stride.
    if (Math.floor(this.phase / Math.PI) !== Math.floor(was / Math.PI) && pace > 0.15 && this.onStep) {
      this.onStep(st.sprint ? 1.3 : st.crouch ? 0.45 : 0.85);
    }
    if (this.wasAir && ground) {
      this.sp.y.kick(-0.8);
      this.sp.camY.kick(-2);
      this.sp.rx.kick(-1.2);
      if (this.onLand) this.onLand();
    }
    this.wasAir = !ground;
    this.ads = damp(this.ads, st.ads && !st.sprint && !st.reloading ? 1 : 0, 15, dt);
    this.run = damp(this.run, st.sprint && pace > 0.3 && !st.reloading ? 1 : 0, 9, dt);
    this.reload = damp(this.reload, st.reloading ? 1 : 0, 8, dt);
    this.fovPunch = damp(this.fovPunch, 0, 12, dt);
    this.strafe = damp(this.strafe, st.strafe || 0, 8, dt);
    this.heat = Math.max(0, this.heat - dt * 0.12);
    // The rifle lags the turn of his head: the look this frame shoves the
    // springs the other way, and they bring it back after.
    const k = 1 - 0.8 * this.ads;
    const lx = clampAbs(st.look.x, 0.08), ly = clampAbs(st.look.y, 0.08);
    this.sp.ry.kick(-lx * 3.2 * k);
    this.sp.x.kick(-lx * 0.56 * k);
    this.sp.rx.kick(ly * 2.7 * k);
    this.sp.y.kick(ly * 0.5 * k);
    // His eye goes up and down with his step.
    const bobY = Math.abs(Math.sin(this.phase)) * 0.045 * this.stride;
    const bobX = Math.cos(this.phase) * 0.025 * this.stride;
    const camJ = this.sp.camY.step(0, dt);
    const camP = this.sp.camP.step(0, dt);
    const camR = this.sp.camR.step(0, dt);
    if (show) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(right, bobX * 0.6);
      cam.position.y += bobY - 0.022 * this.stride + camJ;
      // The jolts and kicks turn his head a touch, and strafing leans him into it.
      cam.rotateX(camP);
      cam.rotateZ(camR - this.strafe * 0.018 * (1 - this.ads * 0.6) + Math.sin(this.phase) * 0.004 * this.stride);
      cam.updateMatrixWorld(true);
    }
    // The pose: hip or eye, then the run and the reload over it.
    const a = POSES.hip, b = POSES.ads;
    const pose = {};
    for (const key of Object.keys(a)) pose[key] = lerp(a[key], b[key], this.ads);
    for (const [w, p] of [[this.run, POSES.run], [this.reload, POSES.reload]]) {
      for (const key of Object.keys(pose)) pose[key] = lerp(pose[key], p[key], w);
    }
    const idle = performance.now() / 1000;
    // Breathing, slower and smaller at the eye; held, hardly at all.
    const hold = st.hold ? 0.25 : 1;
    const breathe = Math.sin(idle * 1.4) * 0.003 * (1 - this.ads * 0.6) * hold;
    const swing = 1 - this.ads * 0.85;
    const sx = clampAbs(this.sp.x.step(0, dt), 0.05);
    const sy = clampAbs(this.sp.y.step(0, dt), 0.06);
    const sz = clampAbs(this.sp.z.step(0, dt), 0.1);
    const srx = clampAbs(this.sp.rx.step(0, dt), 0.35);
    const sry = clampAbs(this.sp.ry.step(0, dt), 0.3);
    const srz = clampAbs(this.sp.rz.step(0, dt), 0.3);
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);
    this.rifle.position.set(
      pose.x + sx + Math.cos(this.phase) * 0.014 * this.stride * swing - this.strafe * 0.012 * swing,
      pose.y + sy - Math.abs(Math.sin(this.phase)) * 0.016 * this.stride * swing + breathe - camJ * 0.5,
      pose.z + sz,
    );
    this.rifle.rotation.set(
      pose.rx + srx + Math.sin(idle * 0.9) * 0.004 * (1 - this.ads) * hold,
      pose.ry + sry,
      pose.rz + srz + Math.cos(this.phase) * 0.035 * this.stride * swing + this.strafe * 0.09 * swing,
      'YXZ',
    );
    // The clip shows in the top of the receiver while there are rounds in it.
    this.clip.visible = (st.clip ?? 1) > 0 && !st.reloading;
    // The operating rod comes back with the round and slams forward again.
    this.oprodT = Math.max(0, this.oprodT - dt);
    this.oprod.position.z = this.oprodT > 0 ? 0.06 * Math.sin((this.oprodT / 0.09) * Math.PI) : 0;
    this.flashT = Math.max(0, this.flashT - dt);
    this.flashMat.opacity = this.flashT > 0 ? 0.95 : 0;
    this.flash.scale.setScalar(this.flashT > 0 ? 0.8 + Math.random() * 0.7 : 1);
    // A hot barrel smokes on for a while after.
    if (show && this.heat > 0.25 && Math.random() < this.heat * dt * 6) this.smoke(cam, 1, 0.1);
    for (const p of this.puffs) {
      if (!p.s.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const f = 1 - p.life / p.max;
      p.v.multiplyScalar(Math.exp(-2.2 * dt));
      p.v.y += 0.15 * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(0.06 + f * 0.55);
      p.s.material.opacity = 0.3 * (1 - f) * Math.min(1, f * 8 + 0.2);
    }
    // The crosshair opens out with his speed, in the air and when he fires,
    // and closes up crouched; at the eye it is the rifle's own sights.
    const want = (st.air ? 0.8 : 0) + pace * (st.sprint ? 0.9 : 0.45) + (st.crouch ? -0.1 : 0.05);
    this.spread = damp(this.spread, Math.max(0, want), 6, dt);
    const fov = lerp(lerp(72, 46, this.ads), 80, this.run * (1 - this.ads)) + this.fovPunch;
    return { spread: this.spread, fov, ads: this.ads };
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    for (const p of this.puffs) { this.scene.remove(p.s); p.s.material.dispose(); }
  }
}
