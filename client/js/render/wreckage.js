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

// Lying on something: her deck, or the ground ashore. Steel on painted steel,
// or on rock and earth, grips until the slope passes about seventeen degrees;
// once it is going it keeps going on rather less than that.
const MU_STILL = 0.3;
const MU_MOVING = 0.22;
/** How long a piece lies still on a deck or a hillside before it is cleared away. */
const LIE = 40;
/** How long it takes to fade once it is. */
const FADE = 3;

const TQ = new THREE.Quaternion();
const TV = new THREE.Vector3();
const TW = new THREE.Vector3();
const GV = new THREE.Vector3();
const NV = new THREE.Vector3();

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
    // Room made, if it has to be, by clearing away whatever has been lying
    // on a deck or a hillside longest.
    while (this.used() + cut.pos.length / 3 > VERTS) {
      const at = this.live.findIndex((q) => q.on);
      if (at < 0) return;
      this.live.splice(at, 1);
    }
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
    // Or not thrown at all: a piece with nothing left under it simply drops.
    const push = cut.drop ? 0 : Math.min(26, 3 + cut.force * 4.5);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      this.m.extractRotation(ship.matrixWorld));
    // How far its furthest corner is from its middle: near enough the
    // height of its foot, for telling when it has come down on something
    // while it is still turning over.
    let rad = 0;
    for (let i = 0; i < cut.pos.length; i += 3) {
      rad = Math.max(rad, cut.pos[i] * cut.pos[i] + cut.pos[i + 1] * cut.pos[i + 1] + cut.pos[i + 2] * cut.pos[i + 2]);
    }
    rad = Math.max(0.2, Math.sqrt(rad));
    const surf = ship.userData && ship.userData.surfaceUnder;
    this.live.push({
      pos: cut.pos, col: cut.col, idx: cut.idx,
      // What it can come down on: the ship it came off (her decks, in her
      // own frame), and the ground.
      ship: surf ? ship : null, surf: surf || null, rad,
      on: null, lx: 0, ly: 0, lz: 0, lvx: 0, lvy: 0, lvz: 0, lq: null, foot: 0,
      still: 0, last: null,
      x: at.x, y: at.y, z: at.z,
      // Her own way, the blast, and a little of everything: two pieces off the
      // same burst never go the same way.
      vx: vx + (dx / d) * push + (Math.random() - 0.5) * (cut.drop ? 0.4 : 3),
      vy: cut.drop ? -0.3 : (dy / d) * push * 0.6 + push * 0.55 + Math.random() * 3,
      vz: vz + (dz / d) * push + (Math.random() - 0.5) * (cut.drop ? 0.4 : 3),
      q,
      // Tumbling about an axis of its own. A big piece turns slowly; a locker
      // knocked off a bulkhead goes end over end.
      ax: (Math.random() - 0.5), ay: (Math.random() - 0.5), az: (Math.random() - 0.5),
      spin: (0.8 + Math.random() * 2.6) * (2.5 / Math.max(1.2, Math.cbrt(cut.pos.length))),
      sank: 0,
      dim: 1,
    });
  }

  /**
   * A piece in the air coming down on something that is not the sea: a deck
   * of the ship it came off, or the ground ashore. True if it has.
   */
  land(p, sea) {
    if (p.vy > 0.5) return false;
    // Her decks first: it came off her, and most of it comes down on her.
    if (p.ship && p.ship.parent && p.surf) {
      const ship = p.ship;
      ship.updateMatrixWorld(true);
      const l = ship.worldToLocal(TV.set(p.x, p.y, p.z));
      const f = p.surf(l.x, l.y - p.rad * 0.5, l.z, p.rad * 0.5);
      if (f && l.y - p.rad * 0.5 <= f[0] && f[0] > -50) {
        // Its way, in her frame: what it had less hers.
        const sv = this.shipVel(p);
        TQ.copy(ship.getWorldQuaternion(TQ)).invert();
        TW.set(p.vx - sv.x, p.vy - sv.y, p.vz - sv.z).applyQuaternion(TQ);
        p.lq = TQ.clone().multiply(p.q);
        p.foot = this.footOf(p, p.lq);
        p.on = 'deck';
        p.lx = l.x; p.lz = l.z; p.ly = f[0] + p.foot;
        // The blow of landing takes most of its way off it, and all of its
        // tumble: what is left is along the deck.
        const vn = TW.x * f[1] + TW.y * f[2] + TW.z * f[3];
        p.lvx = (TW.x - vn * f[1]) * 0.3;
        p.lvy = (TW.y - vn * f[2]) * 0.3;
        p.lvz = (TW.z - vn * f[3]) * 0.3;
        p.spin = 0;
        p.still = 0;
        if (this.onLand) this.onLand(p.x, p.y, p.z, Math.abs(vn));
        return true;
      }
    }
    // The ground, where there is ground above the sea.
    if (this.groundAt) {
      const g = this.groundAt(p.x, p.z);
      if (Number.isFinite(g) && g > sea && p.y - p.rad * 0.5 <= g) {
        p.foot = this.footOf(p, p.q);
        p.on = 'ground';
        p.y = g + p.foot;
        const n = this.groundNormal(p.x, p.z, NV);
        const vn = p.vx * n.x + p.vy * n.y + p.vz * n.z;
        p.vx = (p.vx - vn * n.x) * 0.3;
        p.vy = (p.vy - vn * n.y) * 0.3;
        p.vz = (p.vz - vn * n.z) * 0.3;
        p.spin = 0;
        p.still = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * A piece lying on a deck or on the ground: held by its grip while the
   * slope under it is gentle, sliding down it when it is not -- her heel and
   * her trim are the slope on a deck -- and off the edge, or off the end of a
   * hole, falling again when there is nothing under it any more.
   */
  lie(p, dt) {
    if (p.on === 'deck') {
      const ship = p.ship;
      if (!ship || !ship.parent) { this.letGo(p, null); return; }
      ship.updateMatrixWorld(true);
      const sq = ship.getWorldQuaternion(TQ);
      const f = p.surf(p.lx, p.ly - p.foot, p.lz, 0.4);
      // Nothing under it, or what was under it is well below now: it falls.
      if (!f || f[0] < p.ly - p.foot - 0.8) { this.letGo(p, sq); return; }
      p.ly = f[0] + p.foot;
      // Down, in her frame.
      GV.set(0, -G, 0).applyQuaternion(TQ.clone().invert());
      this.slideOn(p, f[1], f[2], f[3], dt);
      if (p.lvx || p.lvz) {
        // Up against something standing on her -- a deckhouse, a barbette,
        // a coaming -- it stops there rather than going through it.
        const nx = p.lx + p.lvx * dt, nz = p.lz + p.lvz * dt;
        const base = p.ly - p.foot;
        const ahead = p.surf(nx, base, nz, p.foot * 2 + 0.5);
        if (ahead && ahead[0] > base + 0.5) {
          p.lvx = p.lvy = p.lvz = 0;
        } else {
          p.lx = nx; p.lz = nz;
          p.ly += p.lvy * dt;
        }
      }
      // Where that puts it in the world, and which way up.
      const w = ship.localToWorld(TV.set(p.lx, p.ly, p.lz));
      p.x = w.x; p.y = w.y; p.z = w.z;
      p.q.copy(sq).multiply(p.lq);
      // Her deck gone under, and it with it.
      const sea = this.ocean ? this.ocean.heightAt(p.x, p.z) : 0;
      if (p.y < sea - p.foot) { this.letGo(p, sq); p.sank = 0.0001; }
    } else {
      const g = this.groundAt ? this.groundAt(p.x, p.z) : -Infinity;
      const sea = this.ocean ? this.ocean.heightAt(p.x, p.z) : 0;
      // Slid off the shore into the water, or off a drop: it falls again.
      if (!Number.isFinite(g) || g <= sea || g < p.y - p.foot - 0.8) { p.on = null; return; }
      const n = this.groundNormal(p.x, p.z, NV);
      GV.set(0, -G, 0);
      // (Same sums as on a deck, in the world's frame.)
      p.lvx = p.vx; p.lvy = p.vy; p.lvz = p.vz;
      this.slideOn(p, n.x, n.y, n.z, dt);
      p.vx = p.lvx; p.vy = p.lvy; p.vz = p.lvz;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.y = this.groundAt(p.x, p.z) + p.foot;
    }
    // Cleared away once it has lain still a good while.
    if (p.still > LIE) p.dim = Math.max(0, 1 - (p.still - LIE) / FADE);
  }

  /**
   * Gravity along a slope with normal n, against the grip of it. Works on
   * p.lv*, in whatever frame GV (down) is in.
   */
  slideOn(p, nx, ny, nz, dt) {
    const gn = GV.x * nx + GV.y * ny + GV.z * nz;
    const tx = GV.x - gn * nx, ty = GV.y - gn * ny, tz = GV.z - gn * nz;
    const pull = Math.hypot(tx, ty, tz);
    const press = Math.max(0, -gn);
    // Only along the surface.
    const vn = p.lvx * nx + p.lvy * ny + p.lvz * nz;
    p.lvx -= vn * nx; p.lvy -= vn * ny; p.lvz -= vn * nz;
    let sp = Math.hypot(p.lvx, p.lvy, p.lvz);
    if (sp < 0.15 && pull <= MU_STILL * press) {
      p.lvx = p.lvy = p.lvz = 0;
      p.still += dt;
      return;
    }
    p.still = 0;
    p.lvx += tx * dt; p.lvy += ty * dt; p.lvz += tz * dt;
    sp = Math.hypot(p.lvx, p.lvy, p.lvz);
    if (sp > 1e-6) {
      const drop = Math.min(sp, MU_MOVING * press * dt);
      const k = (sp - drop) / sp;
      p.lvx *= k; p.lvy *= k; p.lvz *= k;
    }
  }

  /** Off the deck it was lying on, into the air with her way and its own. */
  letGo(p, sq) {
    if (sq && p.ship) {
      const sv = this.shipVel(p);
      TW.set(p.lvx, p.lvy, p.lvz).applyQuaternion(sq);
      p.vx = sv.x + TW.x; p.vy = sv.y + TW.y; p.vz = sv.z + TW.z;
    }
    p.on = null;
    p.ship = null;
    // Tipping over the edge as it goes.
    p.spin = 0.8 + Math.random() * 0.8;
  }

  /** How fast the ship a piece came off is going, off where she was last frame. */
  shipVel(p) {
    return p.sv || { x: 0, y: 0, z: 0 };
  }

  /** How far below its middle its lowest corner is, turned as `q` turns it. */
  footOf(p, q) {
    const e = this.m.makeRotationFromQuaternion(q).elements;
    let lo = 0;
    for (let i = 0; i < p.pos.length; i += 3) {
      const y = e[1] * p.pos[i] + e[5] * p.pos[i + 1] + e[9] * p.pos[i + 2];
      if (y < lo) lo = y;
    }
    return -lo;
  }

  /** The slope of the ground at (x, z), as its upward normal. */
  groundNormal(x, z, out) {
    const h = 1.5;
    const dx = this.groundAt(x + h, z) - this.groundAt(x - h, z);
    const dz = this.groundAt(x, z + h) - this.groundAt(x, z - h);
    return out.set(-dx, 2 * h, -dz).normalize();
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
      // Where the ship it came off was, for her way when it leaves her.
      if (p.ship && dt > 0) {
        const w = p.ship.getWorldPosition(TV);
        if (p.last) p.sv = { x: (w.x - p.last.x) / dt, y: (w.y - p.last.y) / dt, z: (w.z - p.last.z) / dt };
        p.last = w.clone();
      }
      if (p.on) {
        this.lie(p, dt);
      } else if (p.sank > 0) {
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
        if (this.land(p, sea)) {
          // Down on something: see lie.
        } else if (p.y <= sea) {
          p.y = sea;
          p.sank = 0.0001;
          if (this.onSplash) this.onSplash(p.x, sea, p.z, Math.hypot(p.vx, p.vy, p.vz));
        }
      }
      // Turning about its own axis, whatever it is doing -- unless it is lying
      // on something, when it turns only with what it is lying on.
      if (p.on) { if (p.dim > 0) this.live[keep++] = p; continue; }
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
