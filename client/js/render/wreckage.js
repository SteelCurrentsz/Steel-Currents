// The pieces of a ship, in the air.
//
// `Debris` throws slabs: a burst produces a few dozen anonymous plates and
// they tumble and go in the water, which is right for the thousand small
// fragments nobody can name. This is the other half of it -- the pieces that
// can be named. A funnel knocked off a cruiser goes over the side as a
// funnel, spinning about its own length, and hits the water as a funnel. It
// is her own geometry, dents, scorching and all, taken out of her buffer at
// the moment it parted from her (see pieces.js) and given gravity.
//
// One draw call for all of it, however many are up. Every live piece's
// vertices are written into one shared buffer each frame, transformed on the
// way in -- a few thousand floats, which is nothing beside a draw call apiece
// and means a piece can be any shape rather than a copy of one instance.
//
// Flat-shaded, so there are no normals to carry or recompute: the shading
// comes off the screen-space derivatives of the surface, which is exactly
// right for torn steel and costs nothing to spin.

import * as THREE from '../../../vendor/three.module.js';

const G = 9.81;

/** How much can be in the air at once. A piece is a few dozen vertices. */
const VERTS = 7200;
const INDICES = 14000;

/** How long a piece floats down through the water before it is out of sight. */
const SINKING = 2.4;

export class Wreckage {
  constructor(scene, ocean, onSplash = null) {
    this.ocean = ocean;
    this.onSplash = onSplash;
    this.live = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(VERTS * 3);
    this.col = new Float32Array(VERTS * 3);
    this.idx = new Uint32Array(INDICES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(this.idx, 1));
    geo.index.setUsage(THREE.DynamicDrawUsage);
    // It is never off screen for culling purposes: the pieces move every frame
    // and the bounds would have to be recomputed with them.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 1;
    geo.setDrawRange(0, 0);
    scene.add(this.mesh);
    this.geo = geo;
    this.spin = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.m = new THREE.Matrix4();
  }

  /**
   * Put a piece of a ship into the air.
   *
   * `cut` is what pieces.js handed back when the piece parted from her: her
   * geometry in the piece's own frame, and where on her it was. `ship` is the
   * hull it came off, so the piece starts exactly where it was standing -- at
   * her heel, her trim and however deep she is sitting -- and carries her way
   * with it, because a funnel blown off a cruiser doing thirty knots does not
   * stop dead in the air.
   */
  add(cut, ship, vx = 0, vz = 0) {
    if (!cut) return;
    if (this.used() + cut.pos.length / 3 > VERTS) return;
    ship.updateMatrixWorld(true);
    const at = this.v.set(cut.x, cut.y, cut.z).applyMatrix4(ship.matrixWorld).clone();
    // Thrown away from the burst that took it off, and upward: a blast under
    // a fitting lifts it before anything else happens to it.
    const dx = cut.x - cut.from.x;
    const dy = cut.y - cut.from.y;
    const dz = cut.z - cut.from.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    // How hard it is thrown. A shell bursting against a locker knocks it over
    // the side; a magazine throws a boat two hundred feet up. Held to
    // something a ship can actually do to a piece of herself -- forty metres a
    // second put a searchlight forty metres up and left it hanging there for
    // six seconds, which is not wreckage, it is a balloon.
    const push = Math.min(26, 3 + cut.force * 4.5);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      this.m.extractRotation(ship.matrixWorld));
    this.live.push({
      pos: cut.pos, col: cut.col, idx: cut.idx,
      x: at.x, y: at.y, z: at.z,
      // Her own way, the blast, and a little of everything: two pieces off the
      // same burst never go the same way.
      vx: vx + (dx / d) * push + (Math.random() - 0.5) * 3,
      vy: (dy / d) * push * 0.6 + push * 0.55 + Math.random() * 3,
      vz: vz + (dz / d) * push + (Math.random() - 0.5) * 3,
      q,
      // Tumbling about an axis of its own. A big piece turns slowly; a locker
      // knocked off a bulkhead goes end over end.
      ax: (Math.random() - 0.5), ay: (Math.random() - 0.5), az: (Math.random() - 0.5),
      spin: (0.8 + Math.random() * 2.6) * (2.5 / Math.max(1.2, Math.cbrt(cut.pos.length))),
      sank: 0,
      dim: 1,
    });
  }

  used() {
    let n = 0;
    for (const p of this.live) n += p.pos.length / 3;
    return n;
  }

  update(dt) {
    if (!this.live.length) {
      if (this.geo.drawRange.count) this.geo.setDrawRange(0, 0);
      return;
    }
    let keep = 0;
    for (const p of this.live) {
      if (p.sank > 0) {
        // In the water. It goes down, and the light goes out of it as it does.
        p.sank += dt;
        p.y -= dt * 3.2;
        p.x += p.vx * dt * 0.12;
        p.z += p.vz * dt * 0.12;
        p.dim = Math.max(0, 1 - p.sank / SINKING);
        p.spin *= 0.97;
      } else {
        p.vy -= G * dt;
        // Air on a tumbling plate: it slows what is thrown hardest, which is
        // what stops a magazine throwing a boat a kilometre.
        const drag = 0.06 * dt;
        p.vx -= p.vx * drag; p.vy -= p.vy * drag; p.vz -= p.vz * drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const sea = this.ocean ? this.ocean.heightAt(p.x, p.z) : 0;
        if (p.y <= sea) {
          p.y = sea;
          p.sank = 0.0001;
          if (this.onSplash) this.onSplash(p.x, sea, p.z, Math.hypot(p.vx, p.vy, p.vz));
        }
      }
      // Turning about its own axis, whatever it is doing.
      this.axis.set(p.ax, p.ay, p.az);
      if (this.axis.lengthSq() < 1e-6) this.axis.set(0, 1, 0);
      this.axis.normalize();
      this.spin.setFromAxisAngle(this.axis, p.spin * dt);
      p.q.premultiply(this.spin);
      if (p.dim > 0) this.live[keep++] = p;
    }
    this.live.length = keep;
    this.write();
  }

  /** Every live piece's geometry into the one buffer the batch is drawn from. */
  write() {
    const pos = this.pos;
    const col = this.col;
    const idx = this.idx;
    let v = 0;
    let n = 0;
    for (const p of this.live) {
      const count = p.pos.length / 3;
      if (v + count > VERTS || n + p.idx.length > INDICES) break;
      this.m.compose(this.v.set(p.x, p.y, p.z), p.q, ONE);
      const e = this.m.elements;
      for (let i = 0; i < count; i++) {
        const o = i * 3;
        const lx = p.pos[o], ly = p.pos[o + 1], lz = p.pos[o + 2];
        const w = (v + i) * 3;
        pos[w] = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
        pos[w + 1] = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
        pos[w + 2] = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        col[w] = p.col[o] * p.dim;
        col[w + 1] = p.col[o + 1] * p.dim;
        col[w + 2] = p.col[o + 2] * p.dim;
      }
      for (let i = 0; i < p.idx.length; i++) idx[n++] = v + p.idx[i];
      v += count;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.index.needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

const ONE = new THREE.Vector3(1, 1, 1);
