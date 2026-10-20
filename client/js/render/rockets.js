// The M-13: the rocket a Katyusha carries, and what it looks like going.
//
// A rocket is not a shell. It is a thin steel tube a metre and a half long
// with a warhead screwed on the front, a nozzle at the back and four big
// stabiliser fins round the nozzle, and it does not leave a muzzle at eight
// hundred metres a second: it slides up a rail, gathering speed, for a fifth
// of a second, and then flies under its own motor for half a second more,
// dragging a tongue of flame and a thick white trail of smoke behind it. Then
// the motor is out and it coasts the rest of the way like anything else. That
// half-second of fire is what a Katyusha ripple looks like from anywhere: a
// sheaf of bright streaks going up off a lorry into a cloud of its own smoke.
//
// Three things live here. The rocket itself, built at its real size out of
// lathed profiles and plates with thickness. The rockets in flight on the
// battlefield, as one instanced batch with their flames and the trails they
// lay. And the launcher going through a ripple in the gun park -- wind-up,
// sixteen rockets off the rails, and the crew loading it again.
//
// Metres throughout, and the rocket points down +Z.

import * as THREE from '../../../vendor/three.module.js';
import { SmokeTrails } from './trails.js';

/** The M-13 as built: 132 mm across, 1.41 m long, fins 300 mm tip to tip. */
export const M13 = {
  length: 1.41,
  radius: 0.066,
  fin: 0.15,
  finLen: 0.2,
  // How long the motor burns, in seconds, and how hard it pushes, m/s².
  burn: 0.7,
  thrust: 470,
};

export const ROCKET_MAT = {
  body: new THREE.MeshLambertMaterial({ color: 0x5d6650 }),
  head: new THREE.MeshLambertMaterial({ color: 0x80837c }),
  band: new THREE.MeshLambertMaterial({ color: 0x8a2f24 }),
  fuze: new THREE.MeshLambertMaterial({ color: 0x8f7638 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x1a1b1c }),
  fin: new THREE.MeshLambertMaterial({ color: 0x525a45 }),
};

// ------------------------------------------------------------- the round --

// The profile, tail to nose, as [z along the rocket, radius]. The motor and the
// warhead are separate lathes because they are separate pieces of steel and
// were painted differently; each closes on its own axis at both ends, so
// neither is an open tube showing its own inside.
const MOTOR = [
  [-0.705, 0], [-0.705, 0.047], [-0.69, 0.058], [-0.67, 0.064], [-0.64, 0.066],
  [0.2, 0.066], [0.2, 0],
];
const WARHEAD = [
  [0.2, 0], [0.2, 0.069], [0.235, 0.069], [0.235, 0.066], [0.36, 0.066],
  [0.43, 0.062], [0.5, 0.054], [0.56, 0.044], [0.61, 0.032], [0.645, 0.022],
  [0.645, 0],
];

function lathe(profile, seg = 16) {
  const pts = profile.map(([z, r]) => new THREE.Vector2(r, z));
  const geo = new THREE.LatheGeometry(pts, seg);
  // Lathed round Y; the rocket flies down Z.
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** A plate standing out from the rocket's axis at `angle` round it. */
function finGeometry(angle, r0, r1, len, z, t = 0.006) {
  const geo = new THREE.BoxGeometry(t, r1 - r0, len);
  geo.translate(0, (r0 + r1) / 2, z);
  geo.rotateZ(angle);
  return geo;
}

/**
 * The pieces of one rocket as [geometry, material] pairs, in the rocket's own
 * frame. `studs` is the side the guide studs are on: -1 under it, for a
 * rocket that sits on top of its rail; +1 over it, for one hung beneath.
 */
function rocketPieces(studs = -1) {
  const R = M13.radius;
  const out = [];
  out.push([lathe(MOTOR), ROCKET_MAT.body]);
  out.push([lathe(WARHEAD), ROCKET_MAT.head]);
  // The fuze, screwed into the nose.
  const fz = new THREE.CylinderGeometry(0.012, 0.021, 0.06, 10);
  fz.rotateX(Math.PI / 2);
  fz.translate(0, 0, 0.675);
  out.push([fz, ROCKET_MAT.fuze]);
  // A painted band round the warhead, which is how the crews told a
  // fragmentation round from anything else in the dark.
  const band = new THREE.CylinderGeometry(R + 0.002, R + 0.002, 0.04, 16);
  band.rotateX(Math.PI / 2);
  band.translate(0, 0, 0.3);
  out.push([band, ROCKET_MAT.band]);
  // The nozzle, dark with the soot of the motor's last firing on the range.
  const nz = new THREE.CylinderGeometry(0.036, 0.042, 0.04, 12);
  nz.rotateX(Math.PI / 2);
  nz.translate(0, 0, -0.715);
  out.push([nz, ROCKET_MAT.dark]);
  // Four fins round the nozzle, set as an X so the rails' studs and the
  // rockets on the next rail are both clear of them.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    out.push([finGeometry(a, R - 0.004, M13.fin, M13.finLen, -0.705 + M13.finLen / 2), ROCKET_MAT.fin]);
    // The stiffening lip along the tip of each fin.
    out.push([finGeometry(a, M13.fin - 0.012, M13.fin, M13.finLen, -0.705 + M13.finLen / 2, 0.014),
      ROCKET_MAT.fin]);
  }
  // The ring that ties the fins together at their roots.
  const ring = new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.05, 16);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0, -0.68);
  out.push([ring, ROCKET_MAT.fin]);
  // The two guide studs that ride the rail, fore and aft.
  if (studs) {
    for (const z of [-0.35, 0.12]) {
      const st = new THREE.BoxGeometry(0.03, 0.026, 0.05);
      st.translate(0, studs * (R + 0.011), z);
      out.push([st, ROCKET_MAT.dark]);
    }
  }
  return out;
}

/** One rocket, as a group of meshes pointing down +Z. */
export function buildRocket(studs = -1) {
  const g = new THREE.Group();
  for (const [geo, mat] of rocketPieces(studs)) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * The whole rocket as a single geometry with a colour on every vertex, for an
 * instanced batch: one draw for every rocket in the air.
 */
export function rocketGeometry() {
  const pos = [];
  const nor = [];
  const col = [];
  for (const [g0, mat] of rocketPieces(0)) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = mat.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// ------------------------------------------------------------ the flame --

/**
 * The exhaust: a cone of fire off the nozzle, pointing back down -Z from the
 * origin, one metre long. Two of them, an orange envelope and a white-hot core
 * inside it, are what a motor burning looks like from the side.
 */
function flameGeometry(r = 0.3) {
  const geo = new THREE.ConeGeometry(r, 1, 12, 1, true);
  // Base on the origin and tip a metre up; then laid back along -Z.
  geo.translate(0, 0.5, 0);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function flameMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

/** A burning motor's flame for a single rocket in the gun park. */
function flameFor() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(flameGeometry(0.11), flameMaterial(0xff8a2a, 0.75));
  const core = new THREE.Mesh(flameGeometry(0.05), flameMaterial(0xfff1c8, 0.95));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flameMaterial(0xffc070, 0.55));
  g.add(outer, core, glow);
  g.userData = { outer, core, glow };
  return g;
}

// ---------------------------------------------------- rockets in the air --

/** How long a rocket is drawn on the battlefield, in metres. See shellLength. */
export const ROCKET_DRAWN = 5.6;

/**
 * The rockets in flight over the battlefield.
 *
 * Exaggerated the way the shells are (see ordnance.js), and by about as much,
 * so that a ripple seen from a ship eight miles off is a ripple and not a
 * rumour. Each one carries its motor's flame and lays its own trail for as
 * long as the motor burns, and a thinner one after -- the smoke a rocket
 * leaves is what a spotter actually follows across the sky.
 *
 * The simulation does not say how long a rocket has been flying, so the time
 * it was first seen stands in for when it was fired. A rocket a client only
 * starts to see half-way along its flight is drawn without a flame, which is
 * what a rocket half-way along its flight looks like.
 */
export class Rockets {
  constructor(scene, trails, max = 240) {
    this.max = max;
    this.trails = trails;
    this.time = 0;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x15140f });
    this.mesh = new THREE.InstancedMesh(rocketGeometry(), this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.outer = new THREE.InstancedMesh(flameGeometry(0.3), flameMaterial(0xff8a2a, 0.7), max);
    this.core = new THREE.InstancedMesh(flameGeometry(0.14), flameMaterial(0xfff1c8, 0.9), max);
    for (const m of [this.outer, this.core]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.renderOrder = 9;
      scene.add(m);
    }
    this.seen = new Map();
    this.origins = [];
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.flames = 0;
    this.hideFrom(0);
  }

  /** A launcher has just fired from here: the next rocket seen near it is that one. */
  origin(x, y, z) {
    this.origins.push({ x, y, z, t: this.time });
    if (this.origins.length > 64) this.origins.shift();
  }

  /** Call once a frame before the rockets are set. */
  begin(dt) {
    this.time += dt;
    this.flames = 0;
    this.live = new Set();
  }

  /**
   * Place one rocket. `dx/dy/dz` is the line it is flying, as for a shell.
   * Returns the next free slot.
   */
  set(n, id, x, y, z, dx, dy, dz) {
    if (n >= this.max) return n;
    this.live.add(id);
    let r = this.seen.get(id);
    if (!r) {
      r = { t0: this.time, lx: x, ly: y, lz: z };
      // A rocket is first seen a snapshot after it left the rail -- a hundred
      // metres up the arc. If a launcher near there has just fired, the trail
      // starts from its rails instead, so it reaches back down to the lorry.
      let best = -1, bestD = 600 * 600;
      for (let i = 0; i < this.origins.length; i++) {
        const o = this.origins[i];
        const d2 = (o.x - x) ** 2 + (o.y - y) ** 2 + (o.z - z) ** 2;
        if (this.time - o.t < 1.2 && d2 < bestD) { best = i; bestD = d2; }
      }
      if (best >= 0) {
        const o = this.origins.splice(best, 1)[0];
        r.lx = o.x; r.ly = o.y; r.lz = o.z;
      }
      this.seen.set(id, r);
    }
    const age = this.time - r.t0;
    const d = this.dummy;
    d.position.set(x, y, z);
    this.dir.set(dx, dy, dz);
    if (this.dir.lengthSq() > 1e-6) this.dir.normalize();
    else this.dir.set(0, 0.3, 1).normalize();
    d.quaternion.setFromUnitVectors(this.fwd, this.dir);
    const k = ROCKET_DRAWN / M13.length;
    d.scale.setScalar(k);
    d.updateMatrix();
    this.mesh.setMatrixAt(n, d.matrix);

    // The motor, while it burns: longer than real, the way the rocket is.
    const BURN = 1.3;
    if (age < BURN && this.flames < this.max) {
      const f = this.flames++;
      const flick = 0.85 + 0.3 * Math.sin(this.time * 61 + id * 1.7) * Math.sin(this.time * 23 + id);
      const len = (6 + 9 * Math.min(1, age / 0.2)) * flick * (age > BURN - 0.25 ? (BURN - age) / 0.25 : 1);
      d.position.set(x - this.dir.x * ROCKET_DRAWN * 0.5, y - this.dir.y * ROCKET_DRAWN * 0.5,
        z - this.dir.z * ROCKET_DRAWN * 0.5);
      d.scale.set(k * 0.9, k * 0.9, len);
      d.updateMatrix();
      this.outer.setMatrixAt(f, d.matrix);
      d.scale.set(k * 0.8, k * 0.8, len * 0.55);
      d.updateMatrix();
      this.core.setMatrixAt(f, d.matrix);
    }

    // The trail: thick and burning while the motor is alight, a thin grey
    // thread for a few seconds after, and nothing once it has gone out of
    // sight up the arc.
    if (this.trails && age < 5) {
      const burning = age < BURN;
      const step = burning ? 7 : 26;
      const tx = x - this.dir.x * ROCKET_DRAWN * 0.55;
      const ty = y - this.dir.y * ROCKET_DRAWN * 0.55;
      const tz = z - this.dir.z * ROCKET_DRAWN * 0.55;
      const gap = Math.hypot(tx - r.lx, ty - r.ly, tz - r.lz);
      if (gap > 400) { r.lx = tx; r.ly = ty; r.lz = tz; }
      else if (gap >= step) {
        const m = Math.min(14, Math.floor(gap / step));
        for (let i = 1; i <= m; i++) {
          const u = i / m;
          this.trails.puff(r.lx + (tx - r.lx) * u, r.ly + (ty - r.ly) * u, r.lz + (tz - r.lz) * u,
            (Math.random() - 0.5) * 1.2, (Math.random() - 0.2) * 0.8, (Math.random() - 0.5) * 1.2, {
              life: burning ? 7 + Math.random() * 3 : 3.5 + Math.random() * 1.5,
              size: burning ? 6 + Math.random() * 3 : 3 + Math.random(),
              grow: burning ? 4.5 : 2,
              burn: burning ? 0.05 + 0.1 * (1 - age / BURN) : 0,
              tone: 0.72,
            });
        }
        r.lx = tx; r.ly = ty; r.lz = tz;
      }
    }
    return n + 1;
  }

  /** Nothing beyond `from` is in the air. See Shells.hideFrom. */
  hideFrom(from) {
    this.mesh.count = from;
    this.mesh.visible = from > 0;
    this.outer.count = this.core.count = this.flames;
    this.outer.visible = this.core.visible = this.flames > 0;
    // Forget the rockets that have come down.
    if (this.live) for (const id of this.seen.keys()) if (!this.live.has(id)) this.seen.delete(id);
  }

  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.outer.instanceMatrix.needsUpdate = true;
    this.core.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------- the launcher in action --

const ease = (u) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

// The ground under a lorry that has just put sixteen rockets over its own
// cab: dry dust, and a great deal of it.
const DUST = [0.72, 0.66, 0.55];
const ROCKET_SMOKE = [0.80, 0.79, 0.76];

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _back = new THREE.Vector3();
const _g = new THREE.Vector3(0, -9.81, 0);

/**
 * A Katyusha going through its drill in the gun park, on a loop.
 *
 *   travel   the rails down on their rest over the cab, loaded
 *   wind-up  the rails come up to the elevation and the shutters drop over
 *            the windscreen; then a pause while the crew get clear and the
 *            firing handle is wound
 *   ripple   sixteen rockets, half a second apart, top and bottom of each rail
 *   settle   the smoke standing round the lorry, the rails still up
 *   lower    the rails back down onto the rest, the shutters up
 *   reload   the rockets put back on the rails one at a time, from the rear
 *
 * `blasts` is the gun smoke the rest of the gun park uses, so the backblast is
 * lit by the same sun; the trails are its own.
 */
export class LauncherShow {
  constructor(scene, blasts, launcher, groundY = 0) {
    this.scene = scene;
    this.blasts = blasts;
    this.L = launcher;
    this.groundY = groundY;
    this.trails = new SmokeTrails(scene, 5000, { maxPx: 900 });
    this.flying = [];
    this.flash = 0;
    this.elev = launcher.travel;
    this.shut = 0;
    this.reset();
  }

  reset() {
    this.phase = 'travel';
    this.t = 0;
    this.fired = 0;
    this.loaded = this.L.rockets.length;
    for (const r of this.L.rockets) {
      r.node.visible = true;
      r.node.position.copy(r.home);
    }
    this.L.pose(this.elev, this.shut);
  }

  dispose() {
    for (const f of this.flying) this.scene.remove(f.obj);
    this.flying.length = 0;
    this.scene.remove(this.trails.points);
    this.trails.geo.dispose();
    this.trails.mat.dispose();
  }

  /** Advance the drill; returns how hard the scene should be lit by it, 0..1. */
  update(dt) {
    const L = this.L;
    this.t += dt;
    const RAISE = 2.6, ARM = 0.9, GAP = 0.5, SETTLE = 3.2, LOWER = 3.0, LOAD = 0.32;
    switch (this.phase) {
      case 'travel':
        if (this.t > 1.6) this.next('raise');
        break;
      case 'raise': {
        const u = ease(this.t / RAISE);
        this.elev = L.travel + (L.fire - L.travel) * u;
        this.shut = ease(this.t / 1.1);
        if (this.t >= RAISE) this.next('arm');
        break;
      }
      case 'arm':
        if (this.t >= ARM) { this.next('ripple'); this.clock = 0; }
        break;
      case 'ripple':
        this.clock -= dt;
        while (this.clock <= 0 && this.fired < L.order.length) {
          this.launch(L.rockets[L.order[this.fired++]]);
          this.clock += GAP;
        }
        if (this.fired >= L.order.length && this.clock <= 0) this.next('settle');
        break;
      case 'settle':
        if (this.t >= SETTLE) this.next('lower');
        break;
      case 'lower': {
        const u = ease(this.t / LOWER);
        this.elev = L.fire + (L.travel - L.fire) * u;
        this.shut = 1 - ease((this.t - LOWER + 1.1) / 1.1);
        if (this.t >= LOWER) { this.next('reload'); this.loading = 0; }
        break;
      }
      case 'reload': {
        // Back on from the rear of the rails, the order they were fired in.
        const k = Math.floor(this.t / LOAD);
        for (let i = 0; i < L.order.length; i++) {
          const r = L.rockets[L.order[i]];
          if (i < k) { r.node.visible = true; r.node.position.copy(r.home); }
          else if (i === k) {
            const u = ease((this.t - k * LOAD) / LOAD);
            r.node.visible = true;
            r.node.position.copy(r.home);
            r.node.position.z -= (1 - u) * 1.1;
          }
        }
        if (k >= L.order.length) { this.fired = 0; this.next('travel'); }
        break;
      }
      default: break;
    }
    L.pose(this.elev, this.shut);
    this.fly(dt);
    this.trails.update(dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    return Math.min(1, this.flash);
  }

  next(phase) { this.phase = phase; this.t = 0; }

  /** Light one rocket's motor: it goes up the rail and away. */
  launch(r) {
    r.node.updateMatrixWorld(true);
    r.node.matrixWorld.decompose(_p, _q, _d);
    r.node.visible = false;
    const obj = new THREE.Group();
    const body = buildRocket(r.studs);
    obj.add(body);
    const flame = flameFor();
    flame.position.z = -M13.length / 2 - 0.03;
    obj.add(flame);
    obj.position.copy(_p);
    obj.quaternion.copy(_q);
    this.scene.add(obj);
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
    this.flying.push({
      obj, flame, axis, age: 0, rail: this.L.railAhead(r), run: 0,
      v: new THREE.Vector3(),
      lx: _p.x, ly: _p.y, lz: _p.z,
    });

    // The backblast: fire and smoke thrown back off the rear of the rail,
    // and the ground behind the lorry torn up into a cloud of dust.
    _back.copy(axis).negate();
    const tail = _p.clone().addScaledVector(axis, -M13.length / 2);
    this.blasts.fire(tail.x, tail.y, tail.z, _back, 95);
    const gy = this.groundY;
    for (let i = 0; i < 3; i++) {
      const s = (Math.random() - 0.5) * 2;
      this.blasts.puff(
        tail.x + _back.x * (2 + i * 1.6) + s * 1.2, gy + 0.8 + Math.random(),
        tail.z + _back.z * (2 + i * 1.6) + s * 1.2,
        _back.x * 6 + s * 2.5, 1.2 + Math.random() * 1.5, _back.z * 6 + s * 2.5,
        2.6 + Math.random() * 1.6, 9 + Math.random() * 5, DUST, 0.55,
      );
    }
    this.flash = Math.max(this.flash, 0.55);
  }

  /** The rockets that are away: up the rail, under power, then coasting. */
  fly(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.age += dt;
      const burning = f.age < M13.burn;
      if (burning) {
        // On the rail it can only go along the rail; once off it, gravity
        // has it too.
        const a = f.run < f.rail ? 180 : M13.thrust;
        f.v.addScaledVector(f.axis, a * dt);
      }
      if (f.run >= f.rail) f.v.addScaledVector(_g, dt);
      const step = f.v.length() * dt;
      f.run += step;
      f.obj.position.addScaledVector(f.v, dt);
      if (f.run >= f.rail && f.v.lengthSq() > 1) {
        _d.copy(f.v).normalize();
        f.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d);
        f.axis.copy(_d);
      }
      // The flame, flickering, and out when the motor is.
      const fl = f.flame.userData;
      if (burning) {
        const flick = 0.8 + 0.35 * Math.random();
        const len = (0.8 + 2.6 * Math.min(1, f.age / 0.15)) * flick;
        fl.outer.scale.set(1, 1, len);
        fl.core.scale.set(1, 1, len * 0.6);
        fl.glow.scale.setScalar(0.9 + 0.5 * flick);
        this.flash = Math.max(this.flash, f.age < 0.3 ? 0.35 : 0.12);
      } else f.flame.visible = false;

      // Its trail, laid between where it was and where it is, so a rocket
      // doing three hundred metres a second leaves a line and not beads.
      const tx = f.obj.position.x - f.axis.x * 0.75;
      const ty = f.obj.position.y - f.axis.y * 0.75;
      const tz = f.obj.position.z - f.axis.z * 0.75;
      if (f.age < M13.burn + 0.05) {
        const gap = Math.hypot(tx - f.lx, ty - f.ly, tz - f.lz);
        const spacing = 0.45 + f.age * 1.8;
        if (gap >= spacing) {
          const m = Math.min(24, Math.floor(gap / spacing));
          for (let k = 1; k <= m; k++) {
            const u = k / m;
            const young = f.age < 0.25;
            this.trails.puff(f.lx + (tx - f.lx) * u, f.ly + (ty - f.ly) * u, f.lz + (tz - f.lz) * u,
              (Math.random() - 0.5) * 0.9, (Math.random() - 0.1) * 0.7, (Math.random() - 0.5) * 0.9, {
                life: 6 + Math.random() * 4,
                size: (young ? 1.3 : 0.9) + Math.random() * 0.5,
                grow: young ? 3.4 : 2.4,
                burn: 0.04 + 0.08 * (1 - f.age / M13.burn),
                tone: 0.74,
              });
          }
          f.lx = tx; f.ly = ty; f.lz = tz;
        }
      }
      if (f.age > 6) {
        this.scene.remove(f.obj);
        this.flying.splice(i, 1);
      }
    }
    // What the ripple leaves round the lorry: it stands in its own smoke.
    if (this.phase === 'ripple' && Math.random() < dt * 3) {
      const p = this.L.root.getWorldPosition(_p);
      this.blasts.puff(p.x + (Math.random() - 0.5) * 9, this.groundY + 1.5 + Math.random() * 2,
        p.z + (Math.random() - 0.5) * 9, 0, 0.8, 0, 3.5 + Math.random() * 2, 12, ROCKET_SMOKE, 0.4);
    }
  }
}
