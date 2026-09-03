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

// ---------------------------------------------------------------- the bombs --

/**
 * A bomb: a body, an ogive nose and a box tail on four fins.
 *
 * Built pointing down +Z, one long and one across, so an instance can be
 * scaled and laid along the line it is falling on.
 */
export function bombGeometry() {
  const RINGS = [
    // [z along the bomb, radius], nose first.
    [0.50, 0.00], [0.45, 0.10], [0.39, 0.17], [0.30, 0.23],
    [0.18, 0.26], [-0.06, 0.27], [-0.24, 0.24], [-0.34, 0.20],
    [-0.42, 0.17], [-0.50, 0.15],
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
      idx.push(k * N + i, (k + 1) * N + i, (k + 1) * N + j,
        k * N + i, (k + 1) * N + j, k * N + j);
    }
  }
  // The cruciform tail: four vanes standing off the body aft, which is what a
  // bomb is steered by and what says "bomb" rather than "shell" at any range
  // you would see one from.
  const fin = (ax, ay) => {
    const base = pos.length / 3;
    const t = 0.018;                                  // half the vane's thickness
    // Eight corners of a thin slab: out along (ax, ay), thick across it, and
    // running from the tail forward to the after end of the body.
    for (const r of [0.11, 0.31]) {
      for (const wsg of [-1, 1]) {
        for (const z of [-0.52, -0.20]) {
          pos.push(ax * r - ay * wsg * t, ay * r + ax * wsg * t, z);
        }
      }
    }
    const at = (ri, wi, zi) => base + (ri * 2 + wi) * 2 + zi;
    const quad = (a, b, c, d) => {
      // Both windings, so a vane is solid whichever side of it you are on
      // without having to reason about which way each face points.
      idx.push(a, b, c, a, c, d, a, d, c, a, c, b);
    };
    quad(at(0, 0, 0), at(0, 0, 1), at(0, 1, 1), at(0, 1, 0));   // inboard end
    quad(at(1, 0, 0), at(1, 0, 1), at(1, 1, 1), at(1, 1, 0));   // outboard edge
    quad(at(0, 0, 0), at(0, 0, 1), at(1, 0, 1), at(1, 0, 0));   // one face
    quad(at(0, 1, 0), at(0, 1, 1), at(1, 1, 1), at(1, 1, 0));   // and the other
    quad(at(0, 0, 0), at(0, 1, 0), at(1, 1, 0), at(1, 0, 0));   // the tail edge
    quad(at(0, 0, 1), at(0, 1, 1), at(1, 1, 1), at(1, 0, 1));   // and forward
  };
  fin(1, 0); fin(-1, 0); fin(0, 1); fin(0, -1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * The bombs on the way down.
 *
 * A dive bomber's bomb is settled the moment she lets go of it -- there is
 * nothing for it to run on and nothing to comb -- so the simulation does not
 * fly a body for it. What it sends is where the bomb was released and where it
 * is going to arrive, and this flies the arc between the two: which is the
 * whole of what anybody on the receiving end ever saw of it, and without it a
 * strike going in was damage appearing out of a clear sky.
 */
export class Bombs {
  constructor(scene, max = 48) {
    this.max = max;
    this.live = [];
    this.mat = new THREE.MeshLambertMaterial({ color: 0x3c4149 });
    this.mesh = new THREE.InstancedMesh(bombGeometry(), this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.park(0);
  }

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
   * One bomb away. `y` is the height she was released from, `hit` says whether
   * this one is going to find the ship or go into the water alongside.
   *
   * The drawn size is exaggerated the same way a shell's is, and for the same
   * reason: a real thousand-pounder is a metre and three quarters long, and at
   * the range you watch one come down from that is not a pixel. It is
   * exaggerated by the same factor, so a bomb and a sixteen-inch round stand
   * in the right relation to each other.
   */
  drop(x, y, z, tx, tz, hit, effects, size = 9) {
    if (this.live.length >= this.max) return;
    this.live.push({
      x0: x, y0: Math.max(40, y), z0: z, x1: tx, z1: tz,
      t: 0, fall: 3.6 + Math.random() * 0.5, hit, effects, size,
    });
  }

  update(dt) {
    const d = this.dummy;
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.t += dt;
      const u = b.t / b.fall;
      if (u >= 1) {
        // Arrival: a burst on her upperworks, or a column of water alongside.
        if (b.effects) {
          if (b.hit) b.effects.explosion(b.x1, 14, b.z1, 1.7);
          else b.effects.splash(b.x1, b.z1, 320);
        }
        this.live.splice(i, 1);
        continue;
      }
      if (n >= this.max) continue;
      // Level flight speed carried forward, and gravity taking her down: the
      // arc is what says "released from an aeroplane" rather than "dropped".
      const x = b.x0 + (b.x1 - b.x0) * u;
      const z = b.z0 + (b.z1 - b.z0) * u;
      const y = b.y0 * (1 - u * u);
      d.position.set(x, y, z);
      this.dir.set((b.x1 - b.x0), -2 * b.y0 * u, (b.z1 - b.z0));
      if (this.dir.lengthSq() > 1e-6) {
        this.dir.normalize();
        this.quat.setFromUnitVectors(this.fwd, this.dir);
        d.quaternion.copy(this.quat);
      } else d.quaternion.identity();
      d.scale.set(b.size * 0.34, b.size * 0.34, b.size);
      d.updateMatrix();
      this.mesh.setMatrixAt(n++, d.matrix);
    }
    this.park(n);
  }
}
