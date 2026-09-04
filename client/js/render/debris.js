// What comes out of a ship when something big lets go.
//
// Until now a magazine or a torpedo produced a flash, a cloud and a number in
// the damage panel. What it really produces is several tons of the ship
// itself, thrown a couple of hundred feet up and out: plating, deck beams,
// ready-use rounds, boats, whatever was standing there. It falls back under
// gravity, tumbling, and goes into the sea with a splash apiece.
//
// One instanced mesh, one draw call, a few hundred pieces. Each is a flat
// slab -- plating is flat -- with its own spin about its own axis, so the
// field reads as wreckage rather than as a cloud of cubes.

import * as THREE from '../../../vendor/three.module.js';

const G = 9.81;

export class Debris {
  constructor(scene, ocean, max = 420) {
    this.ocean = ocean;
    this.max = max;
    this.n = 0;
    // Slabs rather than cubes: a piece of a ship is a piece of plate, and a
    // plate catches the light on one face and disappears edge-on, which is
    // exactly what wreckage does as it tumbles.
    const geo = new THREE.BoxGeometry(1, 0.16, 0.72);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
      color: 0x6a6f73, emissive: 0x120a04, emissiveIntensity: 0.5,
    }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this.dummy = new THREE.Object3D();
    this.q = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
  }

  /**
   * Throw wreckage out of a point.
   *
   * `power` is roughly how big the explosion was in ship terms: 1 is a shell
   * bursting inside her, 3 a torpedo, 6 a compartment coming apart, 10 a
   * magazine. It sets how many pieces there are, how big they are and how far
   * they go -- all of which a magazine does more of than a shell, and none of
   * which is a different effect.
   */
  burst(x, y, z, power = 1, up = 1) {
    const want = Math.min(90, Math.round(6 + power * 9));
    const speed = 14 + power * 5.5;
    for (let i = 0; i < want; i++) {
      if (this.items.length >= this.max) break;
      // Thrown out in every direction, but weighted upward: a burst inside a
      // hull vents through the deck, because the deck is the thinnest thing
      // over it.
      const a = Math.random() * Math.PI * 2;
      const climb = (0.15 + Math.random() * 0.85) * up;
      const out = Math.sqrt(Math.max(0, 1 - climb * climb * 0.6));
      const v = speed * (0.35 + Math.random() * 0.95);
      this.items.push({
        x, y, z,
        vx: Math.sin(a) * out * v,
        vy: climb * v * 1.25,
        vz: Math.cos(a) * out * v,
        // Its own tumble, about its own axis, at its own rate.
        ax: Math.random() * 2 - 1, ay: Math.random() * 2 - 1,
        az: Math.random() * 2 - 1,
        spin: 3 + Math.random() * 9, ang: Math.random() * 6.283,
        size: (0.5 + Math.random() * 1.4) * (1 + power * 0.22),
        life: 0, ttl: 5 + Math.random() * 5,
        // Small pieces slow down faster: the same drag over a much lighter
        // piece. It is why a sheet of plating flutters and a gun mounting does
        // not.
        drag: 0.06 + Math.random() * 0.16,
        splashed: false,
      });
    }
  }

  update(dt) {
    if (!this.items.length) { this.mesh.count = 0; return; }
    const d = this.dummy;
    let live = 0;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      p.life += dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k;
      p.vy = (p.vy - G * dt) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.ang += p.spin * dt;
      const sea = this.ocean ? this.ocean.heightAt(p.x, p.z) : 0;
      if (!p.splashed && p.y <= sea) {
        p.splashed = true;
        p.y = sea;
        // Into the water and gone: what is left floating is not worth a draw
        // call, and what is not floating is on its way to the bottom.
        p.ttl = Math.min(p.ttl, p.life + 0.25);
        if (this.onSplash && p.size > 0.9) this.onSplash(p.x, p.z, p.size);
      }
      if (p.splashed) { p.vx *= 0.02; p.vz *= 0.02; p.vy = 0; p.y = sea; }
      if (p.life >= p.ttl) continue;
      if (live < this.max) {
        this.axis.set(p.ax, p.ay, p.az).normalize();
        this.q.setFromAxisAngle(this.axis, p.ang);
        d.position.set(p.x, p.y, p.z);
        d.quaternion.copy(this.q);
        d.scale.set(p.size, p.size, p.size);
        d.updateMatrix();
        this.mesh.setMatrixAt(live, d.matrix);
        this.items[live] = p;
        live++;
      }
    }
    this.items.length = live;
    this.mesh.count = live;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
