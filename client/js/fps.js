// A soldier in hand, played as a shooter: his rifle in front of you, the
// mouse captured and turning his head directly, the right button bringing the
// rifle up to the eye, the left firing it; a kick that throws the muzzle up
// and comes most of the way back down; his stride in the view; a mark on the
// crosshair when a round goes home.
//
// What is drawn here is only the view: the simulation still has him, and the
// rounds and the hits are the battle's (see troops.js and shared/infantry.js).

import * as THREE from '../../vendor/three.module.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// Where the rifle is held, in the camera's frame (-z ahead, +x right, +y up),
// and turned how: from the hip, up at the eye, carried at the run, and down
// and over for a fresh clip.
const POSES = {
  hip: { x: 0.13, y: -0.125, z: -0.34, rx: 0.02, ry: 0.05, rz: 0.03 },
  ads: { x: 0, y: 0.011, z: -0.2, rx: 0, ry: 0, rz: 0 },
  run: { x: 0.12, y: -0.17, z: -0.3, rx: -0.32, ry: 0.75, rz: 0.25 },
  reload: { x: 0.08, y: -0.22, z: -0.32, rx: 0.35, ry: 0.25, rz: 0.55 },
};

/** A semi-automatic rifle of the war and the two hands on it, built as plain shapes. */
function buildRifle() {
  const g = new THREE.Group();
  const wood = new THREE.MeshPhongMaterial({ color: 0x6e4526, shininess: 18, specular: 0x221a12 });
  const steel = new THREE.MeshPhongMaterial({ color: 0x3b3e42, shininess: 60, specular: 0x666a70 });
  const skin = new THREE.MeshPhongMaterial({ color: 0xb98a66, shininess: 6 });
  const sleeve = new THREE.MeshPhongMaterial({ color: 0x4d5130, shininess: 4 });
  const box = (w, h, d, m, x, y, z, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.x = rx;
    g.add(b);
    return b;
  };
  // The sight line is the rifle's own z axis: the rear aperture at the origin,
  // the front post 62 cm ahead of it.
  // The rear sight: an aperture between two ears, looked through.
  box(0.006, 0.026, 0.016, steel, 0.011, -0.012, 0);
  box(0.006, 0.026, 0.016, steel, -0.011, -0.012, 0);
  box(0.028, 0.008, 0.016, steel, 0, -0.022, 0);
  box(0.04, 0.042, 0.24, steel, 0, -0.05, -0.07);               // receiver
  box(0.05, 0.046, 0.44, wood, 0, -0.068, -0.33);               // handguard and fore-end
  box(0.046, 0.085, 0.34, wood, 0, -0.088, 0.2, -0.12);         // the butt
  box(0.04, 0.05, 0.08, wood, 0, -0.1, 0.02, 0.5);              // the wrist of the stock
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.5, 10), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.036, -0.42);
  g.add(barrel);
  box(0.004, 0.02, 0.004, steel, 0, -0.016, -0.62);             // front post
  box(0.003, 0.024, 0.012, steel, 0.009, -0.018, -0.62);        // and its ears
  box(0.003, 0.024, 0.012, steel, -0.009, -0.018, -0.62);
  box(0.02, 0.04, 0.05, steel, 0, -0.105, -0.03);               // trigger guard
  box(0.012, 0.02, 0.1, steel, 0.026, -0.04, -0.05);            // operating rod handle
  // His hands: the right on the wrist of the stock, the left under the fore-end.
  box(0.06, 0.07, 0.1, skin, 0.004, -0.115, 0.05, 0.3);
  box(0.085, 0.085, 0.36, sleeve, 0.06, -0.19, 0.24, 0.35);
  box(0.065, 0.05, 0.11, skin, -0.004, -0.1, -0.31);
  box(0.08, 0.08, 0.36, sleeve, -0.1, -0.19, -0.16, 0.25).rotation.y = -0.55;
  // The flash at the muzzle, lit for a frame or two a round.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flash = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), flashMat);
    p.rotation.z = (k * Math.PI) / 3;
    if (k === 2) p.rotation.y = Math.PI / 2;
    flash.add(p);
  }
  flash.position.set(0, -0.036, -0.7);
  g.add(flash);
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 10; } });
  return { group: g, flash, flashMat };
}

export class SoldierFeel {
  constructor(scene) {
    this.scene = scene;
    const r = buildRifle();
    this.root = new THREE.Group();
    this.rifle = r.group;
    this.flash = r.flash;
    this.flashMat = r.flashMat;
    this.root.add(this.rifle);
    this.root.visible = false;
    scene.add(this.root);
    this.ads = 0;         // 0 at the hip, 1 at the eye
    this.run = 0;         // carried at the run
    this.reload = 0;      // down for a clip
    this.phase = 0;       // his stride
    this.stride = 0;      // how much of it is in the view
    this.swayX = 0; this.swayY = 0;
    this.kickZ = 0; this.kickR = 0; this.kickYaw = 0;
    this.flashT = 0;
    this.dip = 0;         // landing
    this.wasAir = false;
    this.spread = 0;      // the crosshair, opened out
    this.fovPunch = 0;
  }

  /** A round away: the rifle back into his shoulder, the muzzle up, the flash. */
  fired() {
    this.kickZ = Math.min(0.09, this.kickZ + 0.055);
    this.kickR = Math.min(0.2, this.kickR + 0.11);
    this.kickYaw = (Math.random() - 0.5) * 0.05;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.spread = Math.min(1, this.spread + 0.45);
    this.fovPunch = 1.6;
  }

  /**
   * One frame: `st` is what he is doing -- { moving, speed, sprint, crouch,
   * air, ads, reloading, look: { x, y } } -- and the camera has already been
   * put at his eye and pointed. Moves the camera by his stride and puts the
   * rifle in front of it. Hands back what the crosshair and the field of view
   * want: { spread, fov }.
   */
  update(cam, st, dt, show) {
    this.root.visible = !!show;
    const ground = !st.air;
    // His stride: quicker and bigger at the run, hardly there crouched.
    const pace = ground ? Math.min(1, st.speed / 2.5) : 0;
    this.stride = damp(this.stride, pace * (st.sprint ? 1.5 : st.crouch ? 0.5 : 1) * (1 - 0.7 * this.ads), 10, dt);
    this.phase += dt * (st.sprint ? 13 : 9.5) * (pace > 0.05 ? 1 : 0);
    if (this.wasAir && ground) this.dip = 0.07;
    this.wasAir = !ground;
    this.dip = damp(this.dip, 0, 9, dt);
    this.ads = damp(this.ads, st.ads && !st.sprint && !st.reloading ? 1 : 0, 16, dt);
    this.run = damp(this.run, st.sprint && pace > 0.3 && !st.reloading ? 1 : 0, 9, dt);
    this.reload = damp(this.reload, st.reloading ? 1 : 0, 8, dt);
    this.kickZ = damp(this.kickZ, 0, 14, dt);
    this.kickR = damp(this.kickR, 0, 11, dt);
    this.kickYaw = damp(this.kickYaw, 0, 11, dt);
    this.fovPunch = damp(this.fovPunch, 0, 14, dt);
    // The rifle lags the turn of his head and catches it up.
    const k = 1 - 0.75 * this.ads;
    this.swayX = damp(this.swayX + clampAbs(-st.look.x * 1.6 * k, 0.05), 0, 7, dt);
    this.swayY = damp(this.swayY + clampAbs(st.look.y * 1.6 * k, 0.05), 0, 7, dt);
    // His eye goes up and down with his step, and down when he lands.
    const bobY = Math.abs(Math.sin(this.phase)) * 0.045 * this.stride - this.dip;
    const bobX = Math.cos(this.phase) * 0.025 * this.stride;
    if (show) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(right, bobX * 0.6);
      cam.position.y += bobY - 0.022 * this.stride;
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
    const breathe = Math.sin(idle * 1.4) * 0.003 * (1 - this.ads * 0.8);
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);
    const swing = 1 - this.ads * 0.85;
    this.rifle.position.set(
      pose.x + this.swayX * 0.5 + Math.cos(this.phase) * 0.012 * this.stride * swing,
      pose.y + this.swayY * 0.5 - Math.abs(Math.sin(this.phase)) * 0.014 * this.stride * swing + breathe,
      pose.z + this.kickZ,
    );
    this.rifle.rotation.set(pose.rx + this.kickR + this.swayY * 2, pose.ry + this.swayX * 2 + this.kickYaw,
      pose.rz + Math.cos(this.phase) * 0.03 * this.stride * swing, 'YXZ');
    this.flashT = Math.max(0, this.flashT - dt);
    this.flashMat.opacity = this.flashT > 0 ? 0.95 : 0;
    this.flash.scale.setScalar(this.flashT > 0 ? 0.8 + Math.random() * 0.6 : 1);
    // The crosshair opens out with his speed, in the air and when he fires,
    // and closes up crouched; at the eye it is the rifle's own sights.
    const want = (st.air ? 0.8 : 0) + pace * (st.sprint ? 0.9 : 0.45) + (st.crouch ? -0.1 : 0.05);
    this.spread = damp(this.spread, Math.max(0, want), 6, dt);
    const fov = lerp(lerp(72, 44, this.ads), 80, this.run * (1 - this.ads)) + this.fovPunch;
    return { spread: this.spread, fov, ads: this.ads };
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}

function clampAbs(v, m) { return Math.max(-m, Math.min(m, v)); }
