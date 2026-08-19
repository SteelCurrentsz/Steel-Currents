// The title screen: a night fleet under way, framed the way the key art is —
// a battleship's forward turret in the foreground, a carrier across the middle
// distance, escorts beyond, and the moon laying a streak over the swell.

import * as THREE from '../../vendor/three.module.js';
import { Ocean } from './render/ocean.js';
import { buildShip } from './render/ships.js';

// Framing constants, kept together so the composition is easy to nudge.
const CAM = {
  pos: new THREE.Vector3(-40, 232, -300),
  look: new THREE.Vector3(24, 4, 58),
  fov: 42,
};

// Laid out to echo the key art: battleship across the bottom of the frame,
// carrier through the middle, escorts stacked away toward the horizon.
const FLEET = [
  // `train` is the bearing the main battery is laid on, in ship-local radians.
  { cls: 'iowa',      x:  -20, z:  -85, heading: 1.30, train:  1.86 },
  { cls: 'essex',     x:  -30, z:  120, heading: 1.30, train:  1.60 },
  { cls: 'fletcher',  x:  150, z:  350, heading: 1.30, train:  1.20 },
  { cls: 'hipper',    x: -430, z:  500, heading: 1.30, train: -1.30 },
];

export class TitleScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050c16);
    this.scene.fog = new THREE.FogExp2(0x08121f, 0.00055);

    this.camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 40000);
    this.camera.position.copy(CAM.pos);
    this.camera.lookAt(CAM.look);

    this.ocean = new Ocean('night', 14000, 300);
    this.ocean.setGlare(-260, 1500, 1900);
    this.scene.add(this.ocean.mesh);

    const moon = new THREE.DirectionalLight(0xd6e6ff, 1.0);
    moon.position.set(260, 340, -520);
    this.scene.add(moon);
    this.scene.add(new THREE.HemisphereLight(0x40608c, 0x080f18, 0.5));
    const fill = new THREE.DirectionalLight(0x486a92, 0.2);
    fill.position.set(-260, 120, 300);
    this.scene.add(fill);


    this.ships = FLEET.map((cfg) => {
      const built = buildShip(cfg.cls);
      built.group.position.set(cfg.x, 0, cfg.z);
      built.group.rotation.y = cfg.heading;
      // Guns laid out on the beam, so the barrels read against the water.
      built.turrets.forEach((t, i) => { t.rotation.y = cfg.train + (i % 2 ? 0.06 : -0.05); });
      this.scene.add(built.group);
      this.addWake(built.group, cfg);
      return { ...built, cfg };
    });

    this.time = Math.random() * 40;
    this.drift = 0;
  }

  addWake(group, cfg) {
    const len = 260;
    const geo = new THREE.PlaneGeometry(26, len, 1, 12);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -len / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(220,235,250,0.55)');
    g.addColorStop(1, 'rgba(200,225,245,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 128);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.32,
    }));
    mesh.position.set(0, 1.6, -0.42 * (group.userData.length || 120));
    group.add(mesh);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    this.ocean.update(dt, this.camera.position);

    for (const s of this.ships) {
      const g = s.group;
      const y = this.ocean.heightAt(g.position.x, g.position.z, this.ocean.material.uniforms.uTime.value);
      g.position.y = y * 0.55 - 1.2;
      const roll = Math.sin(this.time * 0.55 + s.cfg.x * 0.01) * 0.022;
      const pitch = Math.sin(this.time * 0.4 + s.cfg.z * 0.01) * 0.012;
      g.rotation.z = roll;
      g.rotation.x = pitch;
    }

    // A very slow crane so the frame breathes without distracting from the menu.
    this.drift += dt * 0.06;
    const sway = Math.sin(this.drift) * 9;
    const rise = Math.cos(this.drift * 0.7) * 4;
    this.camera.position.set(CAM.pos.x + sway, CAM.pos.y + rise, CAM.pos.z);
    this.camera.lookAt(CAM.look);
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
