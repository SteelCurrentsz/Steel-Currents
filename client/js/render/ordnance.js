// What comes out of the guns, and what it looks like on the way.
//
// A shell used to be a yellow ball three metres across, the same ball whether
// it came out of a sixteen-inch rifle or a twenty-millimetre Oerlikon. This is
// the shell instead: a body, an ogive, a boat-tail and a driving band, drawn
// nose-first along the line it is actually travelling and sized off the bore
// that fired it. A sixteen-inch round is six times the length of a Bofors
// round, which is what the eye needs to tell a main-battery salvo from the
// light battery hosing at an aeroplane.
//
// Scale is a compromise and it is worth being honest about it. A real 16"
// shell is 406 mm across and a metre and a half long; at eight thousand yards
// that is a fraction of a pixel, and a game in which you cannot see the salvo
// you fired is not a game. So the drawn shell is exaggerated -- but it is
// exaggerated *proportionally*, so the relationship between a 16" round, a 5"
// round and a 20 mm round on screen is the relationship they really have.

import * as THREE from '../../../vendor/three.module.js';

/** How long a shell of this bore is drawn, in metres. */
export function shellLength(caliber) {
  return 1.1 + caliber * 0.019;
}

/**
 * One shell: ogive nose, parallel body, driving band, boat-tail.
 *
 * Built pointing down +Z, one metre long and one wide, so an instance can be
 * scaled to its own bore and rotated onto its own line of flight.
 */
export function shellGeometry() {
  const RINGS = [
    // [z along the shell, radius], nose first.
    [0.50, 0.00], [0.44, 0.13], [0.38, 0.23], [0.30, 0.34],
    [0.20, 0.44], [0.08, 0.49], [-0.16, 0.50], [-0.22, 0.50],
    [-0.26, 0.46], [-0.42, 0.40], [-0.50, 0.38],
  ];
  const N = 10;
  const pos = [];
  const idx = [];
  for (const [z, r] of RINGS) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  }
  for (let k = 0; k < RINGS.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = k * N + i;
      const b = k * N + j;
      const c = (k + 1) * N + i;
      const d = (k + 1) * N + j;
      idx.push(a, c, d, a, d, b);
    }
  }
  // The base, so she is not a tube seen from astern.
  const hub = pos.length / 3;
  const base = (RINGS.length - 1) * N;
  pos.push(0, 0, RINGS[RINGS.length - 1][0]);
  for (let i = 0; i < N; i++) idx.push(hub, base + ((i + 1) % N), base + i);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * The shells in the air, as one instanced batch.
 *
 * Each is laid along the line between where it was last snapshot and where it
 * is this one, which is its velocity to within the tick -- so a shell on the
 * way up is nose-up and one coming down is nose-down, and a salvo arriving
 * looks like a salvo arriving rather than a handful of beads.
 */
export class Shells {
  constructor(scene, max = 500) {
    this.max = max;
    // Shell steel with a little heat left in the base from the bore. Not lit:
    // a shell is a hundred metres away or ten thousand and it has to read the
    // same at both.
    this.mat = new THREE.MeshLambertMaterial({ color: 0x565d66, emissive: 0x241d16 });
    this.mesh = new THREE.InstancedMesh(shellGeometry(), this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // The hot base: a small additive disc that only the big rounds carry, so a
    // heavy salvo can be followed across the sky the way a spotter follows it.
    const glowGeo = new THREE.SphereGeometry(0.5, 10, 7);
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xffbe72, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.InstancedMesh(glowGeo, this.glowMat, max);
    this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow.frustumCulled = false;
    scene.add(this.glow);
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, 1);
    // An instanced mesh is born with identity matrices, which is every shell
    // it can hold stacked at the origin at full size. Park them first.
    this.hideFrom(0);
  }

  /**
   * Place one shell. `dx/dy/dz` is where she has come from since the last
   * snapshot -- the line she is flying, not a velocity in any unit.
   */
  set(n, x, y, z, dx, dy, dz, caliber) {
    if (n >= this.max) return n;
    const len = shellLength(caliber);
    const d = this.dummy;
    d.position.set(x, y, z);
    this.dir.set(dx, dy, dz);
    if (this.dir.lengthSq() > 1e-6) {
      this.dir.normalize();
      this.quat.setFromUnitVectors(this.fwd, this.dir);
      d.quaternion.copy(this.quat);
    } else {
      this.dir.set(0, 0, 1);
      d.quaternion.identity();
    }
    d.scale.set(len * 0.34, len * 0.34, len);
    d.updateMatrix();
    this.mesh.setMatrixAt(n, d.matrix);
    // The tracer, burning in the base -- behind the round, not inside it,
    // where the body would hide it. A salvo you cannot follow across the sky
    // is a salvo you cannot spot for, and at eight thousand yards this is the
    // only part of a shell there is any chance of seeing.
    d.position.set(
      x - this.dir.x * len * 0.52,
      y - this.dir.y * len * 0.52,
      z - this.dir.z * len * 0.52,
    );
    d.scale.setScalar(len * (caliber >= 100 ? 0.30 : 0.22));
    d.updateMatrix();
    this.glow.setMatrixAt(n, d.matrix);
    return n + 1;
  }

  /** Park every instance from `from` on out of sight. */
  hideFrom(from) {
    const d = this.dummy;
    d.position.set(0, -20000, 0);
    d.quaternion.identity();
    d.scale.setScalar(0.001);
    d.updateMatrix();
    for (let i = from; i < this.max; i++) {
      this.mesh.setMatrixAt(i, d.matrix);
      this.glow.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }

  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the flak --

/**
 * Anti-aircraft fire: the tracer going up and the burst at the top of it.
 *
 * The simulation does not fly individual anti-aircraft rounds -- a Cleveland
 * has fifty barrels and puts several hundred rounds a minute into the sky, and
 * none of them are worth a wire message. What it sends is "this ship is firing
 * that many barrels at that squadron", and this turns it into what that looks
 * like: streams of small tracer reaching up the bearing, and the black puffs
 * of the heavy guns bursting short, over and around -- because most of them
 * do miss, and the misses are what an air attack actually looks like from the
 * cockpit.
 */
export class Flak {
  constructor(scene, max = 900) {
    this.max = max;
    this.rounds = [];
    this.time = 0;
    const geo = shellGeometry();
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffcf7a });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.park(0);
  }

  /** Park every instance from `from` on out of sight. */
  park(from) {
    const d = this.dummy;
    d.position.set(0, -20000, 0);
    d.quaternion.identity();
    d.scale.setScalar(0.001);
    d.updateMatrix();
    for (let i = from; i < this.max; i++) this.mesh.setMatrixAt(i, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * One burst of fire from a ship at a squadron.
   *
   * `barrels` is how many are bearing, which is what decides how much of it
   * there is: an aeroplane crossing the beam of a battleship is met by a wall
   * and one coming in over her bow by a handful of guns.
   */
  fire(x, y, z, tx, ty, tz, caliber, barrels, effects) {
    const n = Math.max(2, Math.min(14, Math.round(barrels / 3)));
    const span = Math.hypot(tx - x, tz - z);
    if (span < 1) return;
    for (let i = 0; i < n; i++) {
      if (this.rounds.length >= this.max) break;
      // Scattered round the aiming point, because that is where they go.
      const sx = tx + (Math.random() - 0.5) * 90;
      const sy = ty + (Math.random() - 0.5) * 60;
      const sz = tz + (Math.random() - 0.5) * 90;
      const ox = (Math.random() - 0.5) * 14;
      const oz = (Math.random() - 0.5) * 14;
      const flight = 0.5 + span / 900 + Math.random() * 0.35;
      this.rounds.push({
        x0: x + ox, y0: y, z0: z + oz,
        x1: sx, y1: sy, z1: sz,
        t: -Math.random() * 0.25, flight, caliber,
        // The heavy guns burst; the automatic ones just stop.
        burst: caliber >= 75,
        effects,
      });
    }
  }

  update(dt) {
    this.time += dt;
    const d = this.dummy;
    let n = 0;
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i];
      r.t += dt;
      if (r.t < 0) continue;
      const u = r.t / r.flight;
      if (u >= 1) {
        // At the top of its flight: a heavy round bursts, and that black puff
        // hanging in the air is the miss.
        if (r.burst && r.effects) r.effects.flakBurst(r.x1, r.y1, r.z1, r.caliber);
        this.rounds.splice(i, 1);
        continue;
      }
      if (n >= this.max) continue;
      const x = r.x0 + (r.x1 - r.x0) * u;
      const y = r.y0 + (r.y1 - r.y0) * u;
      const z = r.z0 + (r.z1 - r.z0) * u;
      d.position.set(x, y, z);
      this.dir.set(r.x1 - r.x0, r.y1 - r.y0, r.z1 - r.z0).normalize();
      this.quat.setFromUnitVectors(this.fwd, this.dir);
      d.quaternion.copy(this.quat);
      // Small. This is the whole point of drawing them at all: a Bofors round
      // beside a sixteen-inch round is the difference between the light battery
      // and the main one, and you can see it at a glance.
      const len = shellLength(r.caliber);
      d.scale.set(len * 0.34, len * 0.34, len);
      d.updateMatrix();
      this.mesh.setMatrixAt(n++, d.matrix);
    }
    this.park(n);
  }
}
