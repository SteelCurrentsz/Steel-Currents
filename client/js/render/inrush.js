// The sea coming in through a hole in her.
//
// A hole above her waterline is a hole: you look into it and see her inside
// (see shellholes.js and interior.js). A hole at the waterline or under it is
// something else -- it is where the water is getting in, and that is the one
// thing about it anybody would actually see: a green-white rush pouring over
// the lip and down into her, harder the deeper the hole is under, and slopping
// in and out with every wave when the sea is only just reaching it. And in
// behind it, the water already inside her, lying at the level of the sea
// outside and heaving with it.
//
// Nothing here is the battle's. The battle floods her through the orifice it
// worked out for that hit (see openHull in sim.js); this only draws what that
// looks like from outside, off where the hole is on her and where the sea is
// against her right now, so it comes and goes as she rolls and settles.

import * as THREE from '../../../vendor/three.module.js';

/** The most water a ship is drawn pouring in at once, in drops. */
const DROPS = 520;
/** The most holes on one ship that are watched for the sea reaching them. */
const HOLES = 40;
/** Gravity. */
const G = 9.81;

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const DOWN = new THREE.Vector3();
const Q = new THREE.Quaternion();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

let SPRITE;
/** A soft round blob of spray, made once. Null where there is no canvas. */
function sprite() {
  if (SPRITE !== undefined) return SPRITE;
  SPRITE = null;
  if (typeof document === 'undefined') return SPRITE;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    SPRITE = new THREE.CanvasTexture(c);
  } catch { SPRITE = null; }
  return SPRITE;
}

let FOAM;
/** Churned water lying in her: dark sea with white broken through it. */
function foam() {
  if (FOAM !== undefined) return FOAM;
  FOAM = null;
  if (typeof document === 'undefined') return FOAM;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1d4a52';
    g.fillRect(0, 0, 64, 64);
    // Deterministic, so it is the same water on every screen.
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 64, y = rnd() * 64, r = 1 + rnd() * 5;
      g.fillStyle = `rgba(210,232,236,${0.15 + rnd() * 0.45})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    FOAM = new THREE.CanvasTexture(c);
    FOAM.wrapS = FOAM.wrapT = THREE.RepeatWrapping;
  } catch { FOAM = null; }
  return FOAM;
}

export class Inrush {
  /** `group` is her model; everything here is in her own frame and moves with her. */
  constructor(group, ocean) {
    this.group = group;
    this.ocean = ocean;
    this.holes = [];
    this.t = 0;
    this.pos = new Float32Array(DROPS * 3);
    this.vel = new Float32Array(DROPS * 3);
    this.life = new Float32Array(DROPS);
    this.next = 0;
    for (let i = 0; i < DROPS; i++) this.pos[i * 3 + 1] = -1e4;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    // She is moved about by her parent; the bounds never help.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xdcecef, size: 0.9, sizeAttenuation: true, map: sprite(),
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    // Her back going sorts what is on her into two halves by where it is;
    // this spans all of her and belongs to neither. See ShipView.breakHer.
    this.points.userData.noSplit = true;
    this.points.raycast = () => {};
    group.add(this.points);
    this.waterMat = new THREE.MeshBasicMaterial({
      color: foam() ? 0xffffff : 0x1d4a52, map: foam(),
      transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: true,
    });
    this.geo = geo;
  }

  /**
   * A hole at (x, y, z) in her frame, `r` across, in plating facing out of
   * her along `n`.
   */
  add(x, y, z, r, n) {
    // The same hole widened, or one on top of it: one mouth, the bigger.
    for (const h of this.holes) {
      if (Math.hypot(h.x - x, h.y - y, h.z - z) < Math.max(h.r, r) * 0.8) {
        h.r = Math.max(h.r, r);
        return;
      }
    }
    let [nx, ny, nz] = n || [Math.sign(x) || 1, 0, 0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // Any two directions across the mouth.
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(ny) > 0.9) { ux = 1; uy = 0; }
    let ax = uy * nz - uz * ny, ay = uz * nx - ux * nz, az = ux * ny - uy * nx;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    const h = {
      x, y, z, r, nx, ny, nz, ax, ay, az, bx, by, bz,
      acc: 0, water: null, seed: (Math.abs(x * 13.1 + z * 7.7 + y * 3.3) % 6.28),
    };
    this.holes.push(h);
    if (this.holes.length > HOLES) {
      const old = this.holes.shift();
      if (old.water) { old.water.removeFromParent(); old.water.geometry.dispose(); }
    }
  }

  /** Once a frame, after she is posed. */
  step(dt, show = true) {
    this.t += dt;
    const g = this.group;
    this.points.visible = show;
    if (!show) {
      for (const h of this.holes) if (h.water) h.water.visible = false;
      return;
    }
    g.updateMatrixWorld(true);
    g.getWorldQuaternion(Q);
    const inv = Q.clone().invert();
    // Down, in her frame: she is heeled and trimmed, and the water falls
    // straight down whatever she is doing.
    DOWN.set(0, -G, 0).applyQuaternion(inv);
    const time = this.t;
    for (const h of this.holes) {
      TMP.set(h.x, h.y, h.z);
      g.localToWorld(TMP);
      const sea = this.ocean.heightAt(TMP.x, TMP.z);
      // How far under the sea the middle of the hole is, with the slop of
      // the water against her side on top: a hole the sea only reaches at the
      // top of a wave takes it in gulps.
      const slop = Math.sin(time * 2.3 + h.seed) * 0.35 + Math.sin(time * 3.7 + h.seed * 2) * 0.2;
      const under = sea - TMP.y + slop;
      // How much of the mouth the sea is over: none above it, all of it once
      // it is a radius under. Deep under it is all water anyway, and nobody
      // above the surface is going to see it.
      const wet = THREE.MathUtils.clamp((under + h.r) / (2 * h.r), 0, 1);
      const deep = under > 30;
      if (wet > 0 && !deep) {
        // Harder the deeper: what a head of water does through an orifice.
        const head = Math.max(0.2, under + h.r * 0.5);
        const v = 2.5 + Math.sqrt(2 * G * head) * 0.75;
        const rate = 70 * wet * THREE.MathUtils.clamp(h.r, 0.6, 3.5);
        h.acc += rate * dt;
        while (h.acc >= 1) {
          h.acc -= 1;
          this.spawn(h, v, wet);
        }
      }
      // And the water lying in her behind it, at the level of the sea
      // outside, for as long as the sea is across the hole -- what you see
      // looking in at a hole the waterline runs through.
      const show2 = under > -h.r * 1.1 && under < h.r * 1.6;
      if (show2) {
        if (!h.water) {
          const rad = Math.max(0.8, h.r * 1.15);
          h.water = new THREE.Mesh(new THREE.CircleGeometry(rad, 18), this.waterMat);
          h.water.raycast = () => {};
          h.water.renderOrder = 1;
          h.water.userData.noSplit = true;
          g.add(h.water);
        }
        // In behind the plate, clear of it, at the sea's own height.
        const back = h.r * 1.35 + 0.5;
        TMP2.set(h.x - h.nx * back, h.y - h.ny * back, h.z - h.nz * back);
        g.localToWorld(TMP2);
        TMP2.y = sea + slop * 0.6;
        g.worldToLocal(TMP2);
        h.water.position.copy(TMP2);
        // Level in the world, turning slowly as it churns.
        h.water.quaternion.copy(inv).multiply(FLAT);
        h.water.rotateZ(time * 0.4 + h.seed);
        h.water.visible = true;
      } else if (h.water) {
        h.water.visible = false;
      }
    }
    // Every drop: falling, and gone when its time is up.
    const p = this.pos, vl = this.vel, life = this.life;
    for (let i = 0; i < DROPS; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const o = i * 3;
      if (life[i] <= 0) { p[o + 1] = -1e4; continue; }
      vl[o] += DOWN.x * dt; vl[o + 1] += DOWN.y * dt; vl[o + 2] += DOWN.z * dt;
      p[o] += vl[o] * dt; p[o + 1] += vl[o + 1] * dt; p[o + 2] += vl[o + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  /** One drop over the lip of `h`, going in at `v`. */
  spawn(h, v, wet) {
    const i = this.next;
    this.next = (this.next + 1) % DROPS;
    const o = i * 3;
    // Anywhere across the wet part of the mouth -- the low part of it when
    // the sea is only lapping at it.
    const a = Math.random() * Math.PI * 2;
    const rr = h.r * 0.85 * Math.sqrt(Math.random());
    let ca = Math.cos(a) * rr, sb = Math.sin(a) * rr;
    if (wet < 1) sb = -Math.abs(sb) * (1 - wet) + sb * wet;
    const out = 0.25;
    this.pos[o] = h.x + h.ax * ca + h.bx * sb + h.nx * out;
    this.pos[o + 1] = h.y + h.ay * ca + h.by * sb + h.ny * out;
    this.pos[o + 2] = h.z + h.az * ca + h.bz * sb + h.nz * out;
    // In through the plate, spreading as it goes.
    const sp = v * 0.18;
    this.vel[o] = -h.nx * v + (Math.random() - 0.5) * sp;
    this.vel[o + 1] = -h.ny * v + (Math.random() - 0.5) * sp;
    this.vel[o + 2] = -h.nz * v + (Math.random() - 0.5) * sp;
    this.life[i] = 0.45 + Math.random() * 0.55;
  }

  dispose() {
    this.points.removeFromParent();
    this.geo.dispose();
    this.points.material.dispose();
    for (const h of this.holes) {
      if (h.water) { h.water.removeFromParent(); h.water.geometry.dispose(); }
    }
    this.waterMat.dispose();
  }
}
