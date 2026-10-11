// What comes out of a ship when something big lets go.
//
// Until now a magazine or a torpedo produced a flash, a cloud and a number in
// the damage panel. What it really produces is several tons of the ship
// itself, thrown a couple of hundred feet up and out: plating, deck beams,
// ready-use rounds, boats, whatever was standing there. It falls back under
// gravity, tumbling, and goes into the sea with a splash apiece.
//
// Seen from a mile off almost all of it is small -- torn scraps of plate and
// splinters, a great many of them -- and what carries is not the pieces but
// what they leave: a thread of fire while they burn, and smoke after, curving
// away from the cloud and down to the water. So the pieces are kept small and
// ragged and the trails do the work. See trails.js.
//
// Three instanced meshes, one per shape of shard, a few hundred pieces between
// them. Each is a torn, slightly buckled plate rather than a box, scaled
// unevenly on all three axes, so no two read as copies of one block.

import * as THREE from '../../../vendor/three.module.js';
import { SmokeTrails } from './trails.js';

const G = 9.81;
const SHAPES = 3;

/**
 * A torn scrap of plate: an irregular outline, a little buckled, with some
 * thickness to it. Flat-shaded, so the facets catch the light one at a time
 * as it tumbles.
 */
function shard(rnd) {
  const n = 5 + Math.floor(rnd() * 4);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i + (rnd() - 0.5) * 0.7) / n * Math.PI * 2;
    // Long and thin more often than not: steel tears along its length.
    const r = 0.25 + rnd() * 0.75;
    ring.push([Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.7, (rnd() - 0.5) * 0.35]);
  }
  const th = 0.07 + rnd() * 0.06;
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const top = ring.map(([x, y, b]) => [x, b + th, y]);
  const bot = ring.map(([x, y, b]) => [x, b - th, y]);
  const ct = [0, (rnd() - 0.5) * 0.3 + th, 0];
  const cb = [0, ct[1] - 2 * th, 0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(ct, top[j], top[i]);
    tri(cb, bot[i], bot[j]);
    tri(top[i], top[j], bot[j]);
    tri(top[i], bot[j], bot[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export class Debris {
  constructor(scene, ocean, max = 420) {
    this.ocean = ocean;
    this.max = max;
    // A fixed scatter, so every client tears the same three shapes.
    let seed = 90210;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, emissive: 0x140804, emissiveIntensity: 0.6, flatShading: true,
    });
    this.meshes = [];
    for (let k = 0; k < SHAPES; k++) {
      const m = new THREE.InstancedMesh(shard(rnd), mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Scorched, painted, bare: each piece its own shade of what it was.
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      this.meshes.push(m);
    }
    this.mesh = this.meshes[0];
    this.trails = new SmokeTrails(scene, Math.round(6000 + max * 24));
    this.items = [];
    this.dummy = new THREE.Object3D();
    this.q = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.col = new THREE.Color();
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
    const want = Math.min(110, Math.round(8 + power * 10));
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
      // Mostly scraps, a few the size of a hatch: cubed, so the big ones are
      // rare.
      const size = (0.18 + Math.pow(Math.random(), 3) * 0.9) * (1 + power * 0.07);
      const shade = 0.22 + Math.random() * 0.38;
      const burning = Math.random() < 0.35 + Math.min(0.25, power * 0.025);
      this.items.push({
        x, y, z,
        vx: Math.sin(a) * out * v,
        vy: climb * v * 1.25,
        vz: Math.cos(a) * out * v,
        // Its own tumble, about its own axis, at its own rate.
        ax: Math.random() * 2 - 1, ay: Math.random() * 2 - 1,
        az: Math.random() * 2 - 1,
        spin: 4 + Math.random() * 12, ang: Math.random() * 6.283,
        size,
        // Torn unevenly: never the same proportions twice.
        sx: 0.6 + Math.random() * 0.9, sy: 0.7 + Math.random() * 0.8, sz: 0.5 + Math.random() * 0.9,
        shape: Math.floor(Math.random() * SHAPES),
        r: shade * (1.05 + Math.random() * 0.15), g: shade, b: shade * (0.85 + Math.random() * 0.15),
        life: 0, ttl: 5 + Math.random() * 5,
        // Small pieces slow down faster: the same drag over a much lighter
        // piece. It is why a sheet of plating flutters and a gun mounting does
        // not.
        drag: 0.06 + Math.random() * 0.16 + (0.5 - Math.min(0.5, size)) * 0.2,
        splashed: false,
        // Burning pieces trail fire and then smoke; the rest trail a thin
        // smoke of their own for a moment, off the heat of the blast.
        burn: burning ? 0.8 + Math.random() * 2.2 : 0,
        smokeFor: burning ? 99 : 0.3 + Math.random() * 0.6,
        tone: 0.25 + Math.random() * 0.35,
        lay: Math.random() * 0.05,
      });
    }
  }

  update(dt) {
    this.trails.update(dt);
    if (!this.items.length) { for (const m of this.meshes) m.count = 0; return; }
    const d = this.dummy;
    const counts = new Array(SHAPES).fill(0);
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
        if (this.onSplash && p.size > 0.6) this.onSplash(p.x, p.z, p.size);
      }
      if (p.splashed) { p.vx *= 0.02; p.vz *= 0.02; p.vy = 0; p.y = sea; }
      if (p.life >= p.ttl) continue;
      if (!p.splashed && p.life < p.smokeFor) this.trail(p, dt);
      const s = p.shape;
      if (counts[s] < this.max) {
        this.axis.set(p.ax, p.ay, p.az).normalize();
        this.q.setFromAxisAngle(this.axis, p.ang);
        d.position.set(p.x, p.y, p.z);
        d.quaternion.copy(this.q);
        d.scale.set(p.size * p.sx, p.size * p.sy, p.size * p.sz);
        d.updateMatrix();
        const m = this.meshes[s];
        m.setMatrixAt(counts[s], d.matrix);
        // Glowing while it burns, and cooling to the colour of the steel.
        const glow = p.burn > 0 ? Math.max(0, 1 - p.life / p.burn) : 0;
        this.col.setRGB(p.r + glow * 1.6, p.g + glow * 0.7, p.b + glow * 0.15);
        m.setColorAt(counts[s], this.col);
        counts[s]++;
        this.items[live++] = p;
      }
    }
    this.items.length = live;
    for (let s = 0; s < SHAPES; s++) {
      const m = this.meshes[s];
      m.count = counts[s];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** A puff where the piece is now, often enough to read as a line. */
  trail(p, dt) {
    p.lay -= dt;
    if (p.lay > 0) return;
    const burning = p.life < p.burn;
    // Closer together while it is fast and alight, so the streak holds.
    const sp = Math.hypot(p.vx, p.vy, p.vz);
    const gap = Math.max(0.022, Math.min(0.09, (0.7 * (1.6 + p.size * 3)) / Math.max(1, sp)));
    p.lay += gap;
    // Never narrower than the gap to the next puff, or it reads as beads.
    const sz = Math.max(1.6 + p.size * 3.0, sp * gap * 2.1);
    this.trails.puff(p.x, p.y, p.z,
      -p.vx * 0.05 + (Math.random() - 0.5) * 0.6, (Math.random() - 0.2) * 0.6,
      -p.vz * 0.05 + (Math.random() - 0.5) * 0.6, {
        life: burning ? 1.6 + Math.random() * 1.2 : 2.4 + Math.random() * 1.8,
        size: sz * (burning ? 1.2 : 0.9),
        grow: burning ? 3.0 + p.size * 2.5 : 2.6 + p.size * 2,
        burn: burning ? 0.22 + 0.25 * (1 - p.life / p.burn) : 0,
        tone: burning ? p.tone * 0.7 : p.tone + 0.15,
      });
  }
}
